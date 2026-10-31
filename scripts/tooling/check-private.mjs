#!/usr/bin/env node
/**
 * check-private — the private-data guard. Fails when a pattern of the private list
 * (see scripts/tooling/lib/private-patterns.mjs) matches, case-insensitively, or the
 * base64 form of a literal pattern matches. Without the list it passes ("no private
 * patterns configured"), so CI and other machines work unchanged. Findings name the
 * place; the matched text is always masked.
 *
 * Independently of the private list it refuses originSessionId lines (session ids that agent
 * memory notes carry in their front matter, at the top level or indented under `metadata`)
 * in --tree and --staged mode.
 *
 *   node scripts/tooling/check-private.mjs            every tracked file, content + name (`npm run check:private`)
 *   node scripts/tooling/check-private.mjs --staged   staged content + names (pre-commit hook)
 *   node scripts/tooling/check-private.mjs --message F
 *                                                     a commit message file + the author and committer
 *                                                     about to be recorded (commit-msg hook)
 *   node scripts/tooling/check-private.mjs --push     the commits being pushed: identities, messages,
 *                                                     file names, added lines (pre-push hook; reads
 *                                                     git's ref lines on stdin)
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, loadMatchers, maskAll, patternsPath, PUSH_LOG_FORMAT, pushSections, scanText } from './lib/private-patterns.mjs'
import { messageText } from './lib/commit-message.mjs'
import { hasCommit, parsePushLines, pushedRange } from './lib/push-plan.mjs'

// The repository the hook or check runs in.
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
// Session ids written into agent memory-note front matter (also indented); never committed.
const SESSION_ID_LINE = /^[ \t]*originSessionId[ \t]*:/m

const git = (args, input = '') => execFileSync('git', args, { cwd: root, input, maxBuffer: 1 << 30 })

const matchers = loadMatchers(patternsPath()) ?? []
const [mode = '--tree', modeArg] = process.argv.slice(2)
const problems = []

// Report every private-pattern finding in `text`, located at `where` (masked).
const check = (where, text) => {
  for (const finding of scanText(text, matchers)) problems.push(describe(maskAll(where, matchers), finding))
}
// Report private-pattern findings in a path name.
const checkName = (name) => {
  for (const finding of scanText(name, matchers)) problems.push(describe(`${maskAll(name, matchers)} (file name)`, finding))
}
// Report an originSessionId front-matter line.
const checkSessionId = (name, text) => {
  if (SESSION_ID_LINE.test(text)) problems.push(`${maskAll(name, matchers)}: originSessionId line (session ids are never committed)`)
}

let scanned = ''
switch (mode) {
  case '--tree': {
    const files = git(['ls-files', '-z']).toString('utf8').split('\0').filter(Boolean)
    for (const name of files) {
      checkName(name)
      let content
      try {
        content = fs.readFileSync(path.join(root, name), 'utf8')
      } catch {
        continue // deleted in the working tree, or a directory
      }
      check(name, content)
      checkSessionId(name, content)
    }
    scanned = `${files.length} tracked files`
    break
  }
  case '--staged': {
    // Added, copied, modified and renamed paths: deletions cannot add private text.
    const files = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']).toString('utf8').split('\0').filter(Boolean)
    readStaged(files).forEach((content, i) => {
      checkName(files[i])
      check(files[i], content)
      checkSessionId(files[i], content)
    })
    scanned = `${files.length} staged files`
    break
  }
  case '--message': {
    if (modeArg === undefined) throw new Error('--message needs the message file')
    check('commit message', messageText(fs.readFileSync(modeArg, 'utf8')))
    // The identity git records with this commit (config or GIT_AUTHOR_* / GIT_COMMITTER_*), minus the time stamp.
    for (const [who, variable] of [['author', 'GIT_AUTHOR_IDENT'], ['committer', 'GIT_COMMITTER_IDENT']]) {
      check(`commit ${who}`, git(['var', variable]).toString('utf8').replace(/>.*$/s, '>'))
    }
    scanned = 'the commit message and identity'
    break
  }
  case '--push': {
    let commits = 0
    for (const ref of parsePushLines(fs.readFileSync(0, 'utf8'))) {
      // Only commits the remote does not have yet; nothing for a deletion.
      const range = pushedRange(ref, (sha) => hasCommit(root, sha))
      if (range === undefined) continue
      checkName(`${ref.localRef} ${ref.remoteRef}`)
      const log = git(['log', '--no-color', '--no-ext-diff', '-p', PUSH_LOG_FORMAT, ...range]).toString('utf8')
      for (const section of pushSections(log)) check(section.where, section.text)
      commits += log.split('\0commit ').length - 1
    }
    scanned = `${commits} commits to push`
    break
  }
  default:
    console.error(`check-private: unknown mode ${mode}`)
    process.exit(2)
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem)
  console.error(`\nprivate: ${problems.length} problem(s) in ${scanned}. Replace them with neutral placeholders `
    + '(see CLAUDE.md); never commit with --no-verify, never copy the private patterns file into the repository.')
  process.exitCode = 1
} else {
  const configured = matchers.length > 0 ? `${matchers.length} private matchers` : 'no private patterns configured'
  console.log(`private: ${scanned} clean (${configured})`)
}

// The staged content of each file, via one `git cat-file --batch` round trip.
function readStaged(files) {
  if (files.length === 0) return []
  const out = git(['cat-file', '--batch'], files.map((f) => `:${f}\n`).join(''))
  const blobs = []
  let at = 0
  while (blobs.length < files.length) {
    const headerEnd = out.indexOf(10, at)
    const header = out.subarray(at, headerEnd).toString('utf8')
    const size = Number(header.split(' ')[2])
    // A missing object (e.g. a submodule entry) contributes no text.
    if (header.endsWith(' missing') || Number.isNaN(size)) {
      blobs.push('')
      at = headerEnd + 1
      continue
    }
    blobs.push(out.subarray(headerEnd + 1, headerEnd + 1 + size).toString('utf8'))
    at = headerEnd + 1 + size + 1
  }
  return blobs
}
