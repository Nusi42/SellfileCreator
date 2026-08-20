/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

// The recipe snapshot is the rule-cache fingerprint: two recipes with the same snapshot
// reuse cached rules. `tags` is excluded from it as "cosmetic metadata", which held until
// the rework tags started driving the emitted `Ore` value.
//
// Symptom when this regresses: adding/removing if_reworked / if_not_reworked has no
// visible effect until a reload, because the cache serves the pre-change rules.
import { buildCanonicalRecipeSnapshot } from '../../src/lib/recipeSnapshot.js'
import { REWORK_EXCLUDE_TAG, REWORK_ONLY_TAG, SAFEGUARD_IGNORE_TAG, describeSemanticTags, isSemanticTag } from '../../src/lib/tagHelpers.js'
import type { BuilderRecipe } from '../../src/lib/hsfBuilder.js'

// Minimal recipe; only the tag list varies across the cases below.
const recipeWithTags = (tags?: string[]): BuilderRecipe => ({
  keep: true, exportMode: 'active', rankCode: 0, rarityCode: 0, rarityMode: 'auto',
  factionCode: 0, mainStatsV: [], earlyKeepMode: 'early',
  substatsV: [], fixedSubstatsV: [],
  minCount: 0, autoMinCount: false, autoSubstatFlex: false,
  minRequiredRolls: 0, autoMinRequiredRolls: true,
  minLevel: 0, maxLevel: 16, substatRollBoundsV: {},
  artifactTypes: [], artifactSets: [],
  ...(tags ? { tags } : {}),
} as unknown as BuilderRecipe)

const fingerprint = (tags?: string[]): string =>
  JSON.stringify(buildCanonicalRecipeSnapshot(recipeWithTags(tags)))

test('rework tags change the recipe cache fingerprint', () => {
  const untagged = fingerprint()
  // Each rework tag must produce a distinct fingerprint from untagged...
  assert.notEqual(fingerprint([REWORK_ONLY_TAG]), untagged, 'if_reworked must invalidate the cache')
  assert.notEqual(fingerprint([REWORK_EXCLUDE_TAG]), untagged, 'if_not_reworked must invalidate the cache')
  // ...and from each other, since they emit opposite Ore values.
  assert.notEqual(
    fingerprint([REWORK_ONLY_TAG]),
    fingerprint([REWORK_EXCLUDE_TAG]),
    'the two rework tags must not share a cache entry',
  )
  // The pre-rename spellings resolve to the same gate, so they must fingerprint the same
  // as their canonical counterparts — otherwise loading an old file rebuilds needlessly.
  assert.equal(
    fingerprint(['ignore_for_chaos_ored']),
    fingerprint([REWORK_EXCLUDE_TAG]),
    'legacy spelling shares the canonical fingerprint',
  )
})

test('purely cosmetic tags still do not change the fingerprint', () => {
  // The exclusion of `tags` exists so renaming a label does not rebuild every rule.
  // Only tags that actually alter generated rules may participate.
  assert.equal(fingerprint(['some_label']), fingerprint(), 'ordinary tags stay cosmetic')
  assert.equal(fingerprint(['a', 'b']), fingerprint(['c']), 'ordinary tags stay cosmetic')
})

test('the safeguard-ignore tag keeps its own fingerprint contribution', () => {
  // Pre-existing behavior; guarded here so the rework work cannot regress it.
  assert.notEqual(fingerprint([SAFEGUARD_IGNORE_TAG]), fingerprint(), 'ignore_by_safeguards invalidates')
})

// --- The semantic-tag registry itself ---
//
// `tags` is excluded from the snapshot wholesale, so every behavior-carrying tag has to be
// re-added explicitly. That is the trap this registry closes: the cache key iterates the
// registry instead of listing tags by hand, so a newly added semantic tag cannot be
// forgotten. These pin the registry's contract.

test('describeSemanticTags reports every behavior-carrying tag', () => {
  // Both known semantic tags must be represented, keyed stably (the keys become
  // fingerprint fields, so renaming one silently invalidates every cached recipe).
  const described = describeSemanticTags([])
  assert.deepEqual(
    Object.keys(described).sort(),
    ['ignoreSafeguardTag', 'oreTagGate'],
  )
})

test('describeSemanticTags derives values, so equivalent spellings agree', () => {
  // Canonical and pre-rename spellings of the same gate must produce identical
  // contributions, or loading an older file would needlessly rebuild its rules.
  assert.deepEqual(
    describeSemanticTags(['ignore_for_chaos_ored']),
    describeSemanticTags([REWORK_EXCLUDE_TAG]),
  )
  // Legacy safeguard aliases behave the same way.
  assert.deepEqual(
    describeSemanticTags(['ignore_keep_unique']),
    describeSemanticTags([SAFEGUARD_IGNORE_TAG]),
  )
  // Opposite gates must NOT collapse together.
  assert.notDeepEqual(
    describeSemanticTags([REWORK_ONLY_TAG]),
    describeSemanticTags([REWORK_EXCLUDE_TAG]),
  )
})

test('isSemanticTag separates behavior-carrying tags from plain labels', () => {
  assert.equal(isSemanticTag(SAFEGUARD_IGNORE_TAG), true)
  assert.equal(isSemanticTag(REWORK_ONLY_TAG), true)
  assert.equal(isSemanticTag(REWORK_EXCLUDE_TAG), true)
  // Pre-rename spellings still carry meaning, so they count as semantic.
  assert.equal(isSemanticTag('ignore_for_chaos_ored'), true)
  // Ordinary user labels do not.
  assert.equal(isSemanticTag('ore5epic'), false)
  assert.equal(isSemanticTag('speed'), false)
})

