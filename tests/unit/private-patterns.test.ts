/* eslint import/no-unused-modules: off */
// Private-data guard core (scripts/tooling/lib/private-patterns.mjs). Synthetic patterns
// only — the real list lives outside the repository and must never appear in tests.
import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  base64Forms,
  describe,
  literalOf,
  mask,
  maskAll,
  matchersFrom,
  patternsPath,
  pushSections,
  scanText,
} from '../../scripts/tooling/lib/private-patterns.mjs'

// A synthetic list: a literal name, a word-bounded handle with an allowed GitHub form, a comment.
const LIST = [
  '# synthetic test list',
  'Jane Example',
  '(?<!github\\.com/)\\bjexample\\b',
  '',
].join('\n')

test('matchers come from non-comment lines, case-insensitively, with their file line', () => {
  const matchers = matchersFrom(LIST)
  const patterns = matchers.filter((m) => m.kind === 'pattern')
  assert.deepEqual(patterns.map((m) => m.line), [2, 3])
  const findings = scanText('hello JANE EXAMPLE', matchers)
  assert.equal(findings.length, 1)
  assert.equal(findings[0]?.column, 7)
})

test('an invalid pattern fails without echoing the private text', () => {
  assert.throws(() => matchersFrom('ok\n(unclosed'), (error: Error) => error.message.includes('line 2') && !error.message.includes('unclosed'))
})

test('lookbehind exceptions let allowed forms through', () => {
  const matchers = matchersFrom(LIST)
  assert.equal(scanText('see https://github.com/jexample/repo', matchers).length, 0)
  assert.equal(scanText('credits: jexample', matchers).length, 1)
})

test('literal patterns are also found base64-encoded, at any alignment', () => {
  const matchers = matchersFrom(LIST)
  for (const prefix of ['', 'a', 'ab']) {
    const encoded = Buffer.from(`${prefix}Jane Example!`).toString('base64')
    const kinds = scanText(encoded, matchers).map((f) => f.matcher.kind)
    assert.ok(kinds.includes('base64'), `prefix "${prefix}" should reveal the base64 form`)
  }
})

test('literalOf keeps escaped symbols and rejects classes and operators', () => {
  assert.equal(literalOf('\\bfoo\\.bar\\b'), 'foo.bar')
  assert.equal(literalOf('foo\\d+'), undefined)
  assert.equal(literalOf('a|b'), undefined)
  // Short literals produce no encoded forms (too many random hits).
  assert.deepEqual(base64Forms('ab'), [])
})

test('findings and names are reported masked, never verbatim', () => {
  const matchers = matchersFrom(LIST)
  assert.equal(mask('secret'), 's*****')
  assert.equal(maskAll('docs/jexample-notes.md', matchers), 'docs/j*******-notes.md')
  const [finding] = scanText('x\njexample', matchers)
  assert.ok(finding)
  assert.equal(describe('file.txt', finding), 'file.txt:2:1: private pattern 3 matched "j*******"')
})

test('the patterns path honors the override variable', () => {
  assert.equal(patternsPath({ SFC_PRIVATE_PATTERNS: '/tmp/list.txt' }), '/tmp/list.txt')
  assert.match(patternsPath({}), /\.config[\\/]sellfilecreator[\\/]private-patterns\.txt$/)
})

test('push sections cover identities, message, file names and only added lines', () => {
  const log = [
    '\0commit 0123456789abcdef',
    'Author Name <a@example.net>',
    'Committer Name <c@example.net>',
    'feat(x): add thing',
    '',
    'diff --git a/old.txt b/new.txt',
    '--- a/old.txt',
    '+++ b/new.txt',
    '-removed private line',
    '+added line',
  ].join('\n')
  const sections = pushSections(log)
  const byWhere = new Map(sections.map((s) => [s.where, s.text]))
  assert.equal(byWhere.get('commit 0123456789ab author'), 'Author Name <a@example.net>')
  assert.equal(byWhere.get('commit 0123456789ab committer'), 'Committer Name <c@example.net>')
  assert.match(byWhere.get('commit 0123456789ab message') ?? '', /feat\(x\): add thing/)
  assert.equal(byWhere.get('commit 0123456789ab new.txt (file name)'), 'new.txt')
  const added = byWhere.get('commit 0123456789ab new.txt (added lines; line = line of the diff)') ?? ''
  assert.ok(added.includes('added line'))
  assert.ok(!added.includes('removed private line'), 'removed lines are a fix, not a finding')
})
