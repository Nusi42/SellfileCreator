/**
 * commit-message — the commit message rules (scripts/tooling/check-commit-msg.mjs).
 *
 * Every commit message is a Conventional Commit written for readers of a public history:
 *   - Subject `<type>(<scope>): <subject>` (an optional `!` before the colon marks a
 *     breaking change), imperative, lowercase start, no trailing period, at most
 *     SUBJECT_MAX_LENGTH characters. Merge commits read `Merge <what it brought>`.
 *   - A blank line separates the subject from the body; the body explains what changed
 *     and why, in plain English.
 *   - The only trailer allowed is `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
 *   - No session links, local checkout/branch logistics, process jargon or the
 *     SSOT/ODR/DRY acronyms (FORBIDDEN_PHRASES): describe the change instead.
 * Notes-only commits use `chore(notes): …`.
 */

/** Conventional Commit types this repository accepts. */
export const COMMIT_TYPES = ['feat', 'fix', 'perf', 'refactor', 'test', 'docs', 'build', 'ci', 'chore', 'style', 'revert']

/** Longest allowed subject line. */
export const SUBJECT_MAX_LENGTH = 72

// `<type>(<scope>)!: <subject>` — scope is lowercase words joined by - / . , or digits.
const SUBJECT_RE = new RegExp(`^(${COMMIT_TYPES.join('|')})\\(([a-z0-9][a-z0-9./,-]*)\\)(!)?: (.+)$`)
// The one permitted trailer: Claude co-authorship with a model name.
const CO_AUTHOR_RE = /^Co-Authored-By: Claude [^<>]+ <noreply@anthropic\.com>$/
// Any `Token: value` / `Token-Name: value` trailer-shaped line (checked in the final paragraph).
const TRAILER_RE = /^[A-Za-z][A-Za-z-]*: \S/

/**
 * Phrases that never belong in a public commit message, each with the reason shown to the
 * author. Matched case-insensitively unless the entry says otherwise.
 */
export const FORBIDDEN_PHRASES = [
  { re: /claude\.ai/i, why: 'links to claude.ai pages (sessions, artifacts) stay out of the history' },
  { re: /^Claude-Session:/im, why: 'session trailers are not recorded' },
  { re: /\bwin\d+\b/i, why: 'local checkout names are not part of the project' },
  { re: /\bwork[- ]folders?\b/i, why: 'local checkout logistics are not part of the project' },
  { re: /\bmaster\b/i, why: 'branch and checkout names are not part of the project' },
  { re: /\blead\b/i, why: 'local checkout roles are not part of the project' },
  { re: /\bfast[- ]forward(ed|s)?\b/i, why: 'branch logistics are not part of the project' },
  { re: /\bwaves?\b/i, why: 'internal planning jargon; describe the change instead' },
  { re: /\bwork[- ]packages?\b/i, why: 'internal planning jargon; describe the change instead' },
  { re: /\bWP-?\d+\b/i, why: 'internal planning codes; describe the change instead' },
  { re: /\bcontracts?\b/i, why: 'internal planning jargon; name the interface or behavior instead' },
  { re: /\b(SSOT|ODR|DRY)\b/, why: 'describe the consolidation instead of naming the principle' },
  { re: /\bowners?\b/i, why: 'name no person; state the requirement or decision' },
  { re: /\b(AI|session|agent)[- ]notes?\b/i, why: 'notes are not part of the change description' },
  { re: /\b(this|previous|last|next|earlier) (chat|session)\b/i, why: 'conversation context is not part of the change description' },
  { re: /\bWIP\b|\bwork[- ]in[- ]progress\b/i, why: 'commit finished work; describe what it does' },
]

/**
 * The message as git will record it: comment lines (`#`) dropped, everything after a
 * scissors line removed (`git commit -v`), trailing whitespace trimmed.
 */
export function messageText(raw) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const scissors = lines.findIndex((l) => /^# -+ >8 -+$/.test(l))
  return (scissors < 0 ? lines : lines.slice(0, scissors))
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .replace(/\s+$/, '')
}

/** Every rule violation of one commit message (already passed through `messageText`), as readable strings. */
export function commitMessageProblems(message) {
  const problems = []
  const lines = message.split('\n')
  const subject = lines[0] ?? ''
  if (subject.trim() === '') return ['the message is empty']

  if (subject.length > SUBJECT_MAX_LENGTH) problems.push(`subject is ${subject.length} characters (max ${SUBJECT_MAX_LENGTH})`)
  if (/^Merge\b/.test(subject)) {
    // Merge subjects are free text after "Merge ", but must say what the merge brought.
    if (subject.trim().split(/\s+/).length < 2) problems.push('a merge subject must say what the merge brought')
  } else {
    const match = SUBJECT_RE.exec(subject)
    if (match === null) {
      problems.push(`subject must read "<type>(<scope>): <subject>" with type one of ${COMMIT_TYPES.join(', ')}`)
    } else {
      const text = match[4]
      if (!/^[a-z0-9]/.test(text)) problems.push('subject text must start lowercase')
      if (/\.$/.test(text)) problems.push('subject must not end with a period')
    }
  }
  if (lines.length > 1 && lines[1] !== '') problems.push('a blank line must separate the subject from the body')

  // Trailers live in the last paragraph; only the Claude co-author line may appear there.
  const paragraphs = message.split(/\n{2,}/)
  const last = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1].split('\n') : []
  if (last.length > 0 && last.every((l) => TRAILER_RE.test(l))) {
    for (const line of last) {
      // Co-author lines are judged by the dedicated check below.
      if (/^Co-Authored-By:/i.test(line)) continue
      problems.push(`trailer not allowed: "${line.split(':')[0]}:" (only "Co-Authored-By: Claude <model> <noreply@anthropic.com>")`)
    }
  }
  // A Co-Authored-By anywhere must be the Claude form (e.g. not a personal address).
  for (const line of lines) {
    if (/^Co-Authored-By:/i.test(line) && !CO_AUTHOR_RE.test(line)) problems.push(`co-author line must read "Co-Authored-By: Claude <model> <noreply@anthropic.com>"`)
  }

  for (const { re, why } of FORBIDDEN_PHRASES) {
    const hit = re.exec(message)
    if (hit !== null) problems.push(`"${hit[0]}": ${why}`)
  }
  return problems
}
