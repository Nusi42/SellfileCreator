/**
 * private-patterns — matching core of the private-data guard (scripts/tooling/check-private.mjs).
 *
 * The maintainer's private details (real name, addresses, account names, local folder
 * layout, unrelated projects) must never reach git. The patterns live OUTSIDE every
 * repository, in %USERPROFILE%\.sfc-private\patterns.txt or the file named by
 * $SFC_PRIVATE_PATTERNS: one JavaScript regular expression per line, `#` starts a comment,
 * matched case-insensitively. Never copy that file or any value from it into the
 * repository; tests use synthetic patterns only. Findings are always reported masked.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Environment variable that points the guard at another patterns file (tests, other machines). */
export const PATTERNS_ENV = 'SFC_PRIVATE_PATTERNS'

/** Encoded forms shorter than this are not searched (they match random base64 too often). */
export const MIN_ENCODED_LENGTH = 5

/** Where the patterns file is: $SFC_PRIVATE_PATTERNS, else %USERPROFILE%\.sfc-private\patterns.txt. */
export const patternsPath = (env = process.env) =>
  env[PATTERNS_ENV] ?? path.join(os.homedir(), '.sfc-private', 'patterns.txt')

/**
 * Reads the patterns file; `undefined` when it does not exist, so CI and other machines
 * (which have nothing private to protect) pass without configuration.
 */
export function loadMatchers(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
  return matchersFrom(text)
}

/**
 * The matchers of a patterns file's text: every pattern (case-insensitive), plus the
 * base64 forms of every pattern that is a plain literal (embedded data URIs, archives).
 */
export function matchersFrom(text) {
  const matchers = []
  const seen = new Set()
  text.split(/\r?\n/).forEach((raw, index) => {
    const source = raw.trim()
    if (source === '' || source.startsWith('#')) return
    const line = index + 1
    let regex
    try {
      regex = new RegExp(source, 'gi')
    } catch {
      // Never echo the pattern itself: it is private.
      throw new Error(`private patterns: line ${line} is not a valid regular expression`)
    }
    matchers.push({ regex, line, kind: 'pattern' })
    const literal = literalOf(source)
    if (literal === undefined) return
    // Distinct base64 forms only, so two literal lines never double-report one blob.
    for (const form of base64Forms(literal)) {
      if (seen.has(form)) continue
      seen.add(form)
      matchers.push({ regex: new RegExp(escapeRegExp(form), 'g'), line, kind: 'base64' })
    }
  })
  return matchers
}

/** The literal text a pattern matches when it is a plain string (anchors and \b aside), else `undefined`. */
export function literalOf(source) {
  const stripped = source.replace(/\\b/g, '').replace(/^\^/, '').replace(/\$$/, '')
  let literal = ''
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped.charAt(i)
    if (ch === '\\') {
      // \d, \w, \s, ... are classes, not literals; an escaped symbol is its literal self.
      const next = stripped.charAt(i + 1)
      if (next === '' || /[A-Za-z0-9]/.test(next)) return undefined
      literal += next
      i++
    } else if ('.*+?()[]{}|^$'.includes(ch)) {
      return undefined
    } else {
      literal += ch
    }
  }
  return literal === '' ? undefined : literal
}

/**
 * The base64 forms of a literal at the three byte alignments: only the characters that
 * depend solely on the literal's bytes (so they appear in any base64 text embedding it),
 * in the standard and URL-safe alphabets. Forms shorter than MIN_ENCODED_LENGTH are dropped.
 */
export function base64Forms(literal) {
  const bytes = Buffer.from(literal, 'utf8')
  const forms = []
  for (let offset = 0; offset < 3; offset++) {
    const encoded = Buffer.concat([Buffer.alloc(offset), bytes]).toString('base64')
    // Skip the characters that mix in the padding bytes before and after the literal.
    const start = Math.ceil((8 * offset) / 6)
    const end = Math.floor((8 * (offset + bytes.length)) / 6)
    const form = encoded.slice(start, end)
    if (form.length < MIN_ENCODED_LENGTH) continue
    forms.push(form)
    const urlSafe = form.replace(/\+/g, '-').replace(/\//g, '_')
    if (urlSafe !== form) forms.push(urlSafe)
  }
  return forms
}

/** Every match in a text, with 1-based line and column and the matched text masked. */
export function scanText(text, matchers) {
  const findings = []
  let starts
  for (const matcher of matchers) {
    matcher.regex.lastIndex = 0
    for (const match of text.matchAll(matcher.regex)) {
      if (match[0] === '') continue
      // Line table built lazily: most scanned texts have no match at all.
      starts ??= lineStarts(text)
      const line = lineOf(starts, match.index)
      findings.push({ line: line + 1, column: match.index - starts[line] + 1, masked: mask(match[0]), matcher })
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.column - b.column)
}

/** A matched text for error output: its first character and its length, never the text. */
export const mask = (text) => `${text.charAt(0)}${'*'.repeat(Math.max(0, text.length - 1))}`

/** A text (a file name, a ref) with every match masked, for error output. */
export function maskAll(text, matchers) {
  let out = text
  for (const matcher of matchers) {
    matcher.regex.lastIndex = 0
    out = out.replace(matcher.regex, (m) => mask(m))
  }
  return out
}

/** One error line: where, which pattern line, the masked match. */
export function describe(where, finding) {
  const what = finding.matcher.kind === 'base64'
    ? `the base64 form of private pattern ${finding.matcher.line}`
    : `private pattern ${finding.matcher.line}`
  return `${where}:${finding.line}:${finding.column}: ${what} matched "${finding.masked}"`
}

/** The `git log` format `pushSections` reads: commit id, author, committer, then the message. */
export const PUSH_LOG_FORMAT = '--format=%x00commit %H%n%an <%ae>%n%cn <%ce>%n%B'

/**
 * The scannable parts of a `git log -p` text in PUSH_LOG_FORMAT: each commit's author,
 * committer, message, changed file names and ADDED lines (a commit that deletes private
 * text is a fix, so removed lines are skipped).
 */
export function pushSections(log) {
  const sections = []
  for (const chunk of log.split('\0commit ').filter((c) => c.trim() !== '')) {
    const newline = chunk.indexOf('\n')
    const id = (newline < 0 ? chunk : chunk.slice(0, newline)).trim().replace(/^commit /, '').slice(0, 12)
    const [author = '', committer = '', ...body] = (newline < 0 ? '' : chunk.slice(newline + 1)).split('\n')
    sections.push({ where: `commit ${id} author`, text: author })
    sections.push({ where: `commit ${id} committer`, text: committer })
    // The message runs until the first file diff (or the end when the commit has none).
    const rest = body.join('\n')
    const diffAt = rest.search(/^diff --git /m)
    sections.push({ where: `commit ${id} message`, text: diffAt < 0 ? rest : rest.slice(0, diffAt) })
    if (diffAt < 0) continue
    for (const fileDiff of rest.slice(diffAt).split(/^(?=diff --git )/m)) {
      const name = /^\+\+\+ b\/(.*)$/m.exec(fileDiff)?.[1] ?? /^diff --git a\/.* b\/(.*)$/m.exec(fileDiff)?.[1]
      const where = `commit ${id} ${name ?? '?'}`
      if (name !== undefined) sections.push({ where: `${where} (file name)`, text: name })
      // Keep line positions aligned with the diff so findings point at a real line.
      const added = fileDiff.split('\n').map((l) => (l.startsWith('+') && !l.startsWith('+++ ') ? l.slice(1) : '')).join('\n')
      sections.push({ where: `${where} (added lines; line = line of the diff)`, text: added })
    }
  }
  return sections
}

// Offsets at which each line of `text` starts.
function lineStarts(text) {
  const starts = [0]
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1)
  return starts
}

// Index of the line containing offset `at` (binary search over `starts`).
function lineOf(starts, at) {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (starts[mid] <= at) low = mid
    else high = mid - 1
  }
  return low
}

// Escape a literal for use inside a RegExp.
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
