/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

// Tags are free-form user labels: nothing in the app reads meaning out of them. These
// tests cover only the mechanical guarantees (grammar, de-duplication, ordering).
// Behaviour that used to ride on magic tags is covered by recipe-flags.test.ts.
import {
  buildTagVocabulary,
  canonicalTagTokens,
  mergeTagList,
  mergeTags,
  normalizeTagList,
  normalizeTagValue,
  summarizeTagPresence,
} from '../../src/lib/tagHelpers.js'

test('normalizeTagValue enforces the shared tag grammar', () => {
  // Case folds and padding is trimmed so matching is deterministic.
  assert.equal(normalizeTagValue('  Speed  '), 'speed')
  // Tags must stay a single token.
  assert.equal(normalizeTagValue('two words'), null)
  // Empty and non-string inputs collapse to null rather than throwing.
  assert.equal(normalizeTagValue(''), null)
  assert.equal(normalizeTagValue('   '), null)
  // A tag may not start with a digit, but may contain one.
  assert.equal(normalizeTagValue('1st'), null)
  assert.equal(normalizeTagValue('tier1'), 'tier1')
  // Unicode letters are allowed so non-English labels work.
  assert.equal(normalizeTagValue('Schnell'), 'schnell')
})

test('normalizeTagList normalizes, de-dupes, and preserves order', () => {
  // Order follows first appearance; later duplicates collapse.
  assert.deepEqual(normalizeTagList(['speed', 'SPEED', 'crit']), ['speed', 'crit'])
  // Non-string and malformed entries are dropped from written payloads.
  assert.deepEqual(normalizeTagList(['speed', 42, 'two words', '']), ['speed'])
  // An empty result reports undefined so callers can omit the key entirely.
  assert.equal(normalizeTagList([]), undefined)
  assert.equal(normalizeTagList(['   ']), undefined)
  // Non-arrays are rejected outright.
  assert.equal(normalizeTagList('speed'), undefined)
})

test('normalizeTagList no longer rewrites any tag', () => {
  // Tokens that used to be canonicalized into other tokens are now ordinary labels:
  // the load transcode strips the behavioural ones, so anything reaching here is a label
  // and must survive verbatim rather than being folded onto some other spelling.
  assert.deepEqual(normalizeTagList(['ignore_keep_unique']), ['ignore_keep_unique'])
  assert.deepEqual(normalizeTagList(['only_for_chaos_ored']), ['only_for_chaos_ored'])
  assert.deepEqual(
    normalizeTagList(['speed', 'ignore_safeguard', 'faction_wars']),
    ['speed', 'ignore_safeguard', 'faction_wars'],
  )
})

test('mergeTags appends without duplicating', () => {
  // Existing tags keep their order, new ones follow.
  assert.deepEqual(mergeTags(['speed'], ['crit']), ['speed', 'crit'])
  // Re-adding an existing tag is a no-op rather than a duplicate.
  assert.deepEqual(mergeTags(['speed'], ['speed']), ['speed'])
  // Duplicates inside the additions collapse too.
  assert.deepEqual(mergeTags([], ['a', 'a', 'b']), ['a', 'b'])
})

test('mergeTagList preserves base ordering', () => {
  assert.deepEqual(mergeTagList(['b', 'a'], ['c', 'a']), ['b', 'a', 'c'])
})

test('canonicalTagTokens normalizes both sides of a picker comparison', () => {
  // The picker compares applied tags against the vocabulary; a loosely-spelled stored
  // tag must compare equal to its normalized form or it would be offered twice.
  assert.deepEqual([...canonicalTagTokens(['Speed', 'speed'])], ['speed'])
  // Malformed entries simply drop out.
  assert.deepEqual([...canonicalTagTokens(['two words', 'crit'])], ['crit'])
  // Nullish input is tolerated.
  assert.deepEqual([...canonicalTagTokens(undefined)], [])
})

test('buildTagVocabulary lists the document tags with usage counts', () => {
  const { tags, counts } = buildTagVocabulary([['speed', 'crit'], ['speed'], null, undefined])
  // Sorted for stable rendering.
  assert.deepEqual(tags, ['crit', 'speed'])
  assert.equal(counts['speed'], 2)
  assert.equal(counts['crit'], 1)
})

test('buildTagVocabulary counts each tag once per entry', () => {
  // A repeated tag within one recipe must not inflate its count.
  const { counts } = buildTagVocabulary([['speed', 'speed']])
  assert.equal(counts['speed'], 1)
})

test('summarizeTagPresence splits common from mixed tags', () => {
  const summary = summarizeTagPresence([['a', 'b'], ['a']])
  assert.equal(summary.total, 2)
  // Present in every list.
  assert.deepEqual(summary.common, ['a'])
  // Present in some but not all.
  assert.deepEqual(summary.mixed, ['b'])
})
