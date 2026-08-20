/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  REWORK_EXCLUDE_TAG,
  REWORK_ONLY_TAG,
  SAFEGUARD_IGNORE_TAG,
  hasIgnoreSafeguardTag,
  applyReworkTagExclusivity,
  isChaosOreConstrained,
  isReworkTag,
  normalizeTagList,
  oppositeReworkTag,
  resolveChaosOreTagValue,
} from '../../src/lib/tagHelpers.js'
import { ORE_ANY, ORE_NOT_ORED, ORE_ORED } from '../../src/lib/generated/domainConstants.js'

test('normalizeTagList rewrites legacy safeguard-ignore aliases to canonical tag', () => {
  // Mixed alias inputs should collapse into one canonical safeguard-ignore tag.
  const normalized = normalizeTagList([
    'ignore_keep_unique',
    'ignore_safeguard',
    'ignore_by_safeguards',
  ])
  // Export/write paths should always emit the new canonical token only.
  assert.deepEqual(normalized, [SAFEGUARD_IGNORE_TAG])
})

test('hasIgnoreSafeguardTag accepts legacy and canonical safeguard-ignore tags', () => {
  // Legacy files may still carry the old keep-unique wording.
  assert.equal(hasIgnoreSafeguardTag(['ignore_keep_unique']), true)
  // Transitional snapshots may carry the intermediate safeguard wording.
  assert.equal(hasIgnoreSafeguardTag(['ignore_safeguard']), true)
  // New files should use the canonical tag.
  assert.equal(hasIgnoreSafeguardTag([SAFEGUARD_IGNORE_TAG]), true)
})

test('normalizeTagList keeps unrelated tags while canonicalizing safeguard-ignore aliases', () => {
  // Preserve insertion order for non-special tags.
  const normalized = normalizeTagList([
    'speed',
    'ignore_keep_unique',
    'faction_wars',
  ])
  // Only the special alias should be rewritten.
  assert.deepEqual(normalized, ['speed', SAFEGUARD_IGNORE_TAG, 'faction_wars'])
})

test('resolveChaosOreTagValue leaves untagged recipes unconstrained', () => {
  // Nullish and empty lists must behave exactly as before this feature existed.
  assert.equal(resolveChaosOreTagValue(undefined), ORE_ANY)
  assert.equal(resolveChaosOreTagValue(null), ORE_ANY)
  assert.equal(resolveChaosOreTagValue([]), ORE_ANY)
  // Unrelated tags must not accidentally gate a rule on chaos-ore state.
  assert.equal(resolveChaosOreTagValue(['speed', SAFEGUARD_IGNORE_TAG]), ORE_ANY)
})

test('resolveChaosOreTagValue maps each chaos-ore tag to its sentinel', () => {
  // if_reworked narrows to gear that has been reworked.
  assert.equal(resolveChaosOreTagValue([REWORK_ONLY_TAG]), ORE_ORED)
  // if_not_reworked narrows to gear that has never been reworked.
  assert.equal(resolveChaosOreTagValue([REWORK_EXCLUDE_TAG]), ORE_NOT_ORED)
  // Sitting alongside other tags does not change the resolution.
  assert.equal(resolveChaosOreTagValue([SAFEGUARD_IGNORE_TAG, REWORK_ONLY_TAG]), ORE_ORED)
})

test('resolveChaosOreTagValue normalizes loose tag spellings', () => {
  // Tag matching is trimmed and case-insensitive, like the rest of the tag grammar.
  assert.equal(resolveChaosOreTagValue(['  IF_Reworked  ']), ORE_ORED)
})

test('if_reworked wins when a loaded file carries both tags', () => {
  // The editors keep the pair mutually exclusive, so this is the legacy/hand-edited case.
  // Order in the list must not change the winner.
  assert.equal(resolveChaosOreTagValue([REWORK_ONLY_TAG, REWORK_EXCLUDE_TAG]), ORE_ORED)
  assert.equal(resolveChaosOreTagValue([REWORK_EXCLUDE_TAG, REWORK_ONLY_TAG]), ORE_ORED)
})

test('isReworkTag recognizes only the two rework tags', () => {
  assert.equal(isReworkTag(REWORK_ONLY_TAG), true)
  assert.equal(isReworkTag(REWORK_EXCLUDE_TAG), true)
  // Loose spellings still resolve through the shared tag grammar.
  assert.equal(isReworkTag('  IF_NOT_Reworked '), true)
  // Everything else is an ordinary tag.
  assert.equal(isReworkTag(SAFEGUARD_IGNORE_TAG), false)
  assert.equal(isReworkTag('speed'), false)
})

test('oppositeReworkTag pairs the two tags and ignores everything else', () => {
  assert.equal(oppositeReworkTag(REWORK_ONLY_TAG), REWORK_EXCLUDE_TAG)
  assert.equal(oppositeReworkTag(REWORK_EXCLUDE_TAG), REWORK_ONLY_TAG)
  assert.equal(oppositeReworkTag('speed'), null)
})

test('applyReworkTagExclusivity drops the opposite tag when one is added', () => {
  // Adding if_reworked evicts if_not_reworked, and vice versa.
  assert.deepEqual(applyReworkTagExclusivity([REWORK_EXCLUDE_TAG], REWORK_ONLY_TAG), [])
  assert.deepEqual(applyReworkTagExclusivity([REWORK_ONLY_TAG], REWORK_EXCLUDE_TAG), [])
  // Unrelated tags are preserved, in order.
  assert.deepEqual(
    applyReworkTagExclusivity(['speed', REWORK_EXCLUDE_TAG, 'faction_wars'], REWORK_ONLY_TAG),
    ['speed', 'faction_wars'],
  )
  // Adding a non-rework tag evicts nothing.
  assert.deepEqual(
    applyReworkTagExclusivity([REWORK_ONLY_TAG], SAFEGUARD_IGNORE_TAG),
    [REWORK_ONLY_TAG],
  )
  // Re-adding the same tag does not remove itself.
  assert.deepEqual(applyReworkTagExclusivity([REWORK_ONLY_TAG], REWORK_ONLY_TAG), [REWORK_ONLY_TAG])
})

test('isChaosOreConstrained only reports the two narrowing states', () => {
  // Drives the preview column's auto-visibility, so the sentinel must not count.
  assert.equal(isChaosOreConstrained(ORE_ORED), true)
  assert.equal(isChaosOreConstrained(ORE_NOT_ORED), true)
  assert.equal(isChaosOreConstrained(ORE_ANY), false)
  assert.equal(isChaosOreConstrained(undefined), false)
  assert.equal(isChaosOreConstrained(null), false)
})

test('chaos-ore tags survive tag-list normalization unchanged', () => {
  // These are already canonical tokens; normalization must not rewrite or drop them.
  assert.deepEqual(normalizeTagList([REWORK_ONLY_TAG]), [REWORK_ONLY_TAG])
  assert.deepEqual(normalizeTagList([REWORK_EXCLUDE_TAG]), [REWORK_EXCLUDE_TAG])
  // The safeguard-ignore tag is orthogonal and must coexist with them.
  assert.equal(hasIgnoreSafeguardTag([SAFEGUARD_IGNORE_TAG, REWORK_ONLY_TAG]), true)
})

// --- Pre-rename ("legacy") rework tag spellings ---
//
// The rework tags were renamed from only_for_chaos_ored / ignore_for_chaos_ored to
// if_reworked / if_not_reworked. Recipes saved before that rename still carry the old
// spellings; without alias handling they resolve to ORE_ANY and their rules silently
// stop gating on rework state — the rule set still exports, just with the constraint
// quietly dropped. These pin the aliases so that cannot regress.

test('legacy rework tag spellings still resolve to their sentinels', () => {
  // The exact tag list from a recipe saved before the rename.
  assert.equal(
    resolveChaosOreTagValue(['ignore_by_safeguards', 'ignore_for_chaos_ored', 'ore5epic']),
    ORE_NOT_ORED,
  )
  assert.equal(resolveChaosOreTagValue(['only_for_chaos_ored']), ORE_ORED)
  // Loose spellings of the legacy tags normalize like any other tag.
  assert.equal(resolveChaosOreTagValue(['  IGNORE_For_Chaos_Ored  ']), ORE_NOT_ORED)
})

test('normalizeTagList rewrites legacy rework spellings to the current tags', () => {
  // Saving a loaded file heals it: old spellings are written back as the new names.
  assert.deepEqual(normalizeTagList(['only_for_chaos_ored']), [REWORK_ONLY_TAG])
  assert.deepEqual(normalizeTagList(['ignore_for_chaos_ored']), [REWORK_EXCLUDE_TAG])
  // Unrelated tags keep their position around the rewritten one.
  assert.deepEqual(
    normalizeTagList(['ignore_by_safeguards', 'ignore_for_chaos_ored', 'ore5epic']),
    [SAFEGUARD_IGNORE_TAG, REWORK_EXCLUDE_TAG, 'ore5epic'],
  )
})

test('legacy rework spellings participate in mutual exclusivity', () => {
  // A legacy tag counts as a rework tag for the editors.
  assert.equal(isReworkTag('ignore_for_chaos_ored'), true)
  assert.equal(isReworkTag('only_for_chaos_ored'), true)
  // Its opposite resolves to the CURRENT spelling of the counterpart.
  assert.equal(oppositeReworkTag('ignore_for_chaos_ored'), REWORK_ONLY_TAG)
  // Adding the new canonical tag must evict the LEGACY spelling of its opposite,
  // otherwise a recipe could end up holding one of each spelling.
  assert.deepEqual(
    applyReworkTagExclusivity(['speed', 'ignore_for_chaos_ored'], REWORK_ONLY_TAG),
    ['speed'],
  )
  assert.deepEqual(
    applyReworkTagExclusivity(['only_for_chaos_ored'], REWORK_EXCLUDE_TAG),
    [],
  )
})
