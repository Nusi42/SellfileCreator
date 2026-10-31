/* eslint import/no-unused-modules: off */
// Commit message rules (scripts/tooling/lib/commit-message.mjs), enforced by the
// commit-msg hook and `npm run check:commit-msg`.
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { SUBJECT_MAX_LENGTH, commitMessageProblems, messageText } from '../../scripts/tooling/lib/commit-message.mjs'

const CO_AUTHOR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
// Assembled from parts so the repository itself never contains a session link.
const SESSION_URL = ['https://claude', 'ai/code/session_x'].join('.')
// Assembled too, so history scans for real session trailers do not hit this test.
const SESSION_TRAILER = ['Claude', 'Session'].join('-')

test('a conventional subject with body and the Claude trailer passes', () => {
  const message = ['fix(importer): keep text lastUse values', '', 'Some exports store them as TEXT.', '', CO_AUTHOR].join('\n')
  assert.deepEqual(commitMessageProblems(message), [])
})

test('breaking-change marker and merge subjects are accepted', () => {
  assert.deepEqual(commitMessageProblems('feat(api)!: drop the v1 endpoint'), [])
  assert.deepEqual(commitMessageProblems('Merge the gear diff view'), [])
})

test('subject shape is enforced', () => {
  const cases: Array<[string, RegExp]> = [
    ['add stuff', /<type>\(<scope>\): <subject>/],
    ['feat: add stuff', /<type>\(<scope>\): <subject>/],
    ['feature(ui): add stuff', /<type>\(<scope>\): <subject>/],
    ['feat(ui): Add stuff', /start lowercase/],
    ['feat(ui): add stuff.', /period/],
    [`feat(ui): ${'x'.repeat(SUBJECT_MAX_LENGTH)}`, /characters \(max/],
    ['Merge', /what the merge brought/],
  ]
  for (const [subject, expected] of cases) {
    assert.ok(commitMessageProblems(subject).some((p) => expected.test(p)), `"${subject}" should fail with ${expected}`)
  }
})

test('the body must be separated by a blank line', () => {
  assert.ok(commitMessageProblems('fix(x): a\nbody').some((p) => /blank line/.test(p)))
})

test('only the Claude co-author trailer is allowed', () => {
  assert.ok(commitMessageProblems('fix(x): a\n\nSigned-off-by: A <a@example.net>').some((p) => /trailer not allowed/.test(p)))
  assert.ok(commitMessageProblems('fix(x): a\n\nCo-Authored-By: Someone <s@example.net>').some((p) => /co-author line/.test(p)))
  assert.ok(commitMessageProblems(`fix(x): a\n\n${SESSION_TRAILER}: ${SESSION_URL}\n${CO_AUTHOR}`).length >= 2)
  // The trailer alone (no link) is refused too.
  assert.ok(commitMessageProblems(`fix(x): a\n\n${SESSION_TRAILER}: x\n${CO_AUTHOR}`).some((p) => /session trailers/.test(p)))
})

test('local logistics, planning jargon and principle acronyms are refused', () => {
  const bodies = [
    'merged from WIN2',
    'rebased onto master',
    'synced the work folder',
    'part of wave 3',
    'implements WP-12',
    'keeps the SSOT intact',
    'as the owner asked',
    'WIP',
    `see ${SESSION_URL}`,
  ]
  for (const body of bodies) {
    assert.ok(commitMessageProblems(`fix(x): a\n\n${body}`).length > 0, `"${body}" should be refused`)
  }
  // The lowercase English word "dry" is not the acronym.
  assert.deepEqual(commitMessageProblems('fix(sim): keep a dry run mode'), [])
})

test('messageText drops comment lines and everything after the scissors line', () => {
  const raw = 'fix(x): a\r\n\r\nbody\r\n# a comment\r\n# ------------------------ >8 ------------------------\r\ndiff --git a b\r\n'
  assert.equal(messageText(raw), 'fix(x): a\n\nbody')
})
