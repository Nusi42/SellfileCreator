/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

// The recipe flags replaced two families of "magic" tags. These tests pin both halves:
// the flags' own semantics, and the legacy transcode that keeps files written before the
// flags existed loading with their author's intent intact.
import {
  DSL_FIELD_IGNORED_BY_SAFEGUARDS,
  DSL_FIELD_REWORK_GATE,
  isChaosOreConstrained,
  isIgnoredBySafeguards,
  normalizeOreValue,
  normalizeReworkGate,
  oreSentinelForRecipe,
  oreSentinelForReworkGate,
  transcodeLegacyNoteTagSelectors,
  transcodeLegacyRecipeTags,
} from '../../src/lib/recipeFlags.js'
import {
  ORE_ANY,
  ORE_NOT_ORED,
  ORE_ORED,
  REWORK_GATE_NOT_REWORKED,
  REWORK_GATE_REWORKED,
} from '../../src/lib/generated/domainConstants.js'
import type { BuilderRecipe } from '../../src/lib/hsfBuilder.js'

test('an ungated recipe emits rules that ignore rework state', () => {
  // ORE_ANY keeps pre-feature behaviour exactly: the rule matches every piece.
  assert.equal(oreSentinelForReworkGate(undefined), ORE_ANY)
  assert.equal(oreSentinelForReworkGate(null), ORE_ANY)
  assert.equal(oreSentinelForRecipe({} as BuilderRecipe), ORE_ANY)
})

test('each rework gate maps to its Ore sentinel', () => {
  assert.equal(oreSentinelForReworkGate(REWORK_GATE_REWORKED), ORE_ORED)
  assert.equal(oreSentinelForReworkGate(REWORK_GATE_NOT_REWORKED), ORE_NOT_ORED)
  // And through the recipe-shaped accessor callers actually use.
  assert.equal(oreSentinelForRecipe({ reworkGate: REWORK_GATE_REWORKED } as BuilderRecipe), ORE_ORED)
})

test('normalizeReworkGate rejects tokens it does not understand', () => {
  // A hand edit or a gate from a future build must degrade to "unconstrained" rather
  // than throwing or guessing a state.
  assert.equal(normalizeReworkGate(REWORK_GATE_REWORKED), REWORK_GATE_REWORKED)
  assert.equal(normalizeReworkGate('someFutureGate'), undefined)
  assert.equal(normalizeReworkGate(true), undefined)
  assert.equal(normalizeReworkGate(undefined), undefined)
})

test('isIgnoredBySafeguards reads the flag strictly', () => {
  assert.equal(isIgnoredBySafeguards({ ignoredBySafeguards: true }), true)
  // Absent and false both mean "counted by safeguards".
  assert.equal(isIgnoredBySafeguards({ ignoredBySafeguards: false }), false)
  assert.equal(isIgnoredBySafeguards({}), false)
  assert.equal(isIgnoredBySafeguards(null), false)
})

test('normalizeOreValue coerces the loaded rule field', () => {
  // Loaded HSF is untrusted JSON and may carry the value as a numeric string.
  assert.equal(normalizeOreValue(1), ORE_ORED)
  assert.equal(normalizeOreValue('0'), ORE_NOT_ORED)
  // Absent or unparseable values leave the rule unconstrained.
  assert.equal(normalizeOreValue(undefined), ORE_ANY)
  assert.equal(normalizeOreValue(''), ORE_ANY)
  assert.equal(normalizeOreValue('nonsense'), ORE_ANY)
})

test('isChaosOreConstrained only reports the two narrowing states', () => {
  // Drives the preview column's auto-visibility, so the sentinel must not count.
  assert.equal(isChaosOreConstrained(ORE_ORED), true)
  assert.equal(isChaosOreConstrained(ORE_NOT_ORED), true)
  assert.equal(isChaosOreConstrained(ORE_ANY), false)
  assert.equal(isChaosOreConstrained(undefined), false)
})

// --- Legacy tag transcode ---

test('transcode lifts the canonical legacy tags into flags', () => {
  // The exact combination the shipped lategame preset carries on 15 recipes.
  const result = transcodeLegacyRecipeTags(['if_not_reworked', 'ignore_by_safeguards'])
  assert.equal(result.reworkGate, REWORK_GATE_NOT_REWORKED)
  assert.equal(result.ignoredBySafeguards, true)
  // The behavioural tokens are stripped: they are not labels and must not linger.
  assert.deepEqual(result.tags, [])
})

test('transcode accepts every shipped spelling, including pre-rename ones', () => {
  const reworked = transcodeLegacyRecipeTags(['only_for_chaos_ored'])
  assert.equal(reworked.reworkGate, REWORK_GATE_REWORKED)
  const notReworked = transcodeLegacyRecipeTags(['ignore_for_chaos_ored'])
  assert.equal(notReworked.reworkGate, REWORK_GATE_NOT_REWORKED)
  // Both older safeguard-ignore spellings, which appear across the sample fixtures.
  assert.equal(transcodeLegacyRecipeTags(['ignore_keep_unique']).ignoredBySafeguards, true)
  assert.equal(transcodeLegacyRecipeTags(['ignore_safeguard']).ignoredBySafeguards, true)
})

test('transcode keeps ordinary labels untouched', () => {
  const result = transcodeLegacyRecipeTags(['speed', 'ignore_keep_unique', 'faction_wars'])
  // Order is preserved for the surviving labels.
  assert.deepEqual(result.tags, ['speed', 'faction_wars'])
  assert.equal(result.ignoredBySafeguards, true)
  // A recipe with no behavioural tags gains no flags at all.
  const plain = transcodeLegacyRecipeTags(['speed'])
  assert.deepEqual(plain.tags, ['speed'])
  assert.equal(plain.ignoredBySafeguards, undefined)
  assert.equal(plain.reworkGate, undefined)
})

test('transcode omits flags rather than writing falsey values', () => {
  // Omission is what lets an untouched recipe re-serialize byte-identically.
  const result = transcodeLegacyRecipeTags(['speed'])
  assert.equal('ignoredBySafeguards' in result, false)
  assert.equal('reworkGate' in result, false)
  // Nullish input is tolerated and yields an empty label list.
  assert.deepEqual(transcodeLegacyRecipeTags(undefined).tags, [])
  assert.deepEqual(transcodeLegacyRecipeTags(null).tags, [])
})

test('a contradictory legacy file resolves to reworked', () => {
  // Both spellings in one file is meaningless, but hand-edited files exist. The tag-era
  // resolver documented "if_reworked wins"; keep that so such a file loads unchanged.
  const both = transcodeLegacyRecipeTags(['if_not_reworked', 'if_reworked'])
  assert.equal(both.reworkGate, REWORK_GATE_REWORKED)
  // Order in the list must not matter.
  const reversed = transcodeLegacyRecipeTags(['if_reworked', 'if_not_reworked'])
  assert.equal(reversed.reworkGate, REWORK_GATE_REWORKED)
})

// --- Legacy note DSL selector transcode ---

test('note transcode rewrites the shipped tag selector onto the flag', () => {
  // The exact line the German lategame note carries.
  const note = 'id=ore_chaos_master_sell { @tag=ignore_by_safeguards { action=sell } }'
  const out = transcodeLegacyNoteTagSelectors(note)
  assert.ok(out.includes(`@${DSL_FIELD_IGNORED_BY_SAFEGUARDS}=on`), out)
  // The stale tag selector must be gone, or it would match nothing after the transcode.
  assert.equal(out.includes('tag=ignore_by_safeguards'), false)
})

test('note transcode maps both rework spellings', () => {
  assert.ok(transcodeLegacyNoteTagSelectors('@tag=if_reworked { }')
    .includes(`${DSL_FIELD_REWORK_GATE}=${REWORK_GATE_REWORKED}`))
  assert.ok(transcodeLegacyNoteTagSelectors('@tag=if_not_reworked { }')
    .includes(`${DSL_FIELD_REWORK_GATE}=${REWORK_GATE_NOT_REWORKED}`))
  // The colon form the grammar also accepts.
  assert.ok(transcodeLegacyNoteTagSelectors('@tag:if_reworked { }')
    .includes(`${DSL_FIELD_REWORK_GATE}=${REWORK_GATE_REWORKED}`))
  // And tolerant of the whitespace the tokenizer allows around the operator.
  assert.ok(transcodeLegacyNoteTagSelectors('@tag = if_reworked { }')
    .includes(`${DSL_FIELD_REWORK_GATE}=${REWORK_GATE_REWORKED}`))
})

test('note transcode leaves the list form alone', () => {
  // A flag comparison cannot express set membership, so rewriting `tag in [...]` would
  // produce invalid DSL. Better to leave a selector that still parses.
  const note = '@tag in [if_reworked,speed] { action=sell }'
  assert.equal(transcodeLegacyNoteTagSelectors(note), note)
})

test('note transcode does not touch user tags that merely share a prefix', () => {
  // Word boundaries keep a longer user label from being partially rewritten.
  const note = '@tag=if_reworked_mine { action=sell }'
  assert.equal(transcodeLegacyNoteTagSelectors(note), note)
})
