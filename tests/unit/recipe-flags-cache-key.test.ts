/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

// The recipe snapshot is the rule-cache fingerprint: two recipes with the same snapshot
// reuse cached rules. `tags` is excluded from it as cosmetic metadata, which is only safe
// because tags no longer carry behaviour — the two flags that DO change emitted rules are
// real recipe fields, and the snapshot's generic field sweep must pick them up.
//
// Symptom when this regresses: toggling a flag has no visible effect until a reload,
// because the cache serves the pre-change rules.
import { buildCanonicalRecipeSnapshot } from '../../src/lib/recipeSnapshot.js'
import { buildTagVocabulary } from '../../src/lib/tagHelpers.js'
// The multi-edit write path must obey the same omit-when-default rule as single edit.
import { applyMultiEditFieldToRecipe } from '../../src/lib/recipeMultiEditDraft.js'
import { REWORK_GATE_NOT_REWORKED, REWORK_GATE_REWORKED } from '../../src/lib/generated/domainConstants.js'
import type { BuilderRecipe } from '../../src/lib/hsfBuilder.js'

// Minimal recipe; only the fields under test vary across the cases below.
const recipe = (overrides: Partial<BuilderRecipe> = {}): BuilderRecipe => ({
  keep: true, exportMode: 'active', rankCode: 0, rarityCode: 0, rarityMode: 'auto',
  factionCode: 0, mainStatsV: [], earlyKeepMode: 'early',
  substatsV: [], fixedSubstatsV: [],
  minCount: 0, autoMinCount: false, autoSubstatFlex: false,
  minRequiredRolls: 0, autoMinRequiredRolls: true,
  minLevel: 0, maxLevel: 16, substatRollBoundsV: {},
  artifactTypes: [], artifactSets: [],
  ...overrides,
} as unknown as BuilderRecipe)

const fingerprint = (overrides: Partial<BuilderRecipe> = {}): string =>
  JSON.stringify(buildCanonicalRecipeSnapshot(recipe(overrides)))

test('the rework gate changes the recipe cache fingerprint', () => {
  const ungated = fingerprint()
  // Each gate must produce a distinct fingerprint from an ungated recipe...
  assert.notEqual(fingerprint({ reworkGate: REWORK_GATE_REWORKED }), ungated, 'reworked must invalidate the cache')
  assert.notEqual(fingerprint({ reworkGate: REWORK_GATE_NOT_REWORKED }), ungated, 'notReworked must invalidate the cache')
  // ...and from each other, since they emit opposite Ore values.
  assert.notEqual(
    fingerprint({ reworkGate: REWORK_GATE_REWORKED }),
    fingerprint({ reworkGate: REWORK_GATE_NOT_REWORKED }),
    'the two rework gates must not share a cache entry',
  )
})

test('the safeguard-ignore flag keeps its own fingerprint contribution', () => {
  assert.notEqual(fingerprint({ ignoredBySafeguards: true }), fingerprint(), 'the flag must invalidate')
})

test('the two flags are independent in the fingerprint', () => {
  // Setting both must differ from setting either alone, or one would mask the other.
  const both = fingerprint({ ignoredBySafeguards: true, reworkGate: REWORK_GATE_REWORKED })
  assert.notEqual(both, fingerprint({ ignoredBySafeguards: true }), 'gate must still count')
  assert.notEqual(both, fingerprint({ reworkGate: REWORK_GATE_REWORKED }), 'ignore flag must still count')
})

test('tags never change the fingerprint', () => {
  // The exclusion of `tags` exists so renaming a label does not rebuild every rule.
  // Now that no tag carries behaviour, this holds for every tag without exception.
  assert.equal(fingerprint({ tags: ['some_label'] }), fingerprint(), 'ordinary tags stay cosmetic')
  assert.equal(fingerprint({ tags: ['a', 'b'] }), fingerprint({ tags: ['c'] }), 'ordinary tags stay cosmetic')
  // Including tokens that USED to be behavioural: after the load transcode they are just
  // labels, so a stray one left in a hand-edited file must not fork the cache.
  assert.equal(fingerprint({ tags: ['if_reworked'] }), fingerprint(), 'former magic tags are cosmetic now')
})

test('the tag vocabulary offers exactly the tags in use', () => {
  // No privileged/seeded entries any more: the picker lists the document's own tags only.
  const { tags, counts } = buildTagVocabulary([['speed'], ['speed', 'crit'], []])
  assert.deepEqual(tags, ['crit', 'speed'], 'sorted, de-duped, nothing seeded')
  assert.equal(counts['speed'], 2, 'counts how many entries carry each tag')
  assert.equal(counts['crit'], 1, 'counts how many entries carry each tag')
  // An empty document yields an empty vocabulary rather than a seeded list.
  assert.deepEqual(buildTagVocabulary([[], []]).tags, [], 'nothing is offered by default')
})

// Both flags are OMIT-WHEN-DEFAULT: the SFC loader only ever emits a key when it is set, so
// a cleared flag must be the ABSENT key, never a stored `false` / `undefined`. The snapshot
// sweeps `Object.entries`, so a stored falsey value fingerprints differently from the same
// recipe reloaded from disk — a spurious full rule rebuild after every clear.
test('clearing a flag omits the key rather than storing a falsey value', () => {
  const cleared = applyMultiEditFieldToRecipe(
    recipe({ ignoredBySafeguards: true }),
    'ignoredBySafeguards',
    { status: 'common', value: false, dirty: true } as never,
  )
  assert.equal('ignoredBySafeguards' in cleared, false, 'a cleared boolean flag must delete its key')
  // The multi-edit clear must fingerprint identically to a recipe that never had the flag.
  assert.equal(JSON.stringify(buildCanonicalRecipeSnapshot(cleared)), fingerprint(), 'no phantom cache fork')

  const ungated = applyMultiEditFieldToRecipe(
    recipe({ reworkGate: REWORK_GATE_REWORKED }),
    'reworkGate',
    { status: 'common', value: undefined, dirty: true } as never,
  )
  assert.equal('reworkGate' in ungated, false, 'a cleared gate must delete its key')
  assert.equal(JSON.stringify(buildCanonicalRecipeSnapshot(ungated)), fingerprint(), 'no phantom cache fork')
})

// The write path still stores a SET flag, or the clear test above would pass vacuously.
test('setting a flag through multi-edit writes the key', () => {
  const set = applyMultiEditFieldToRecipe(
    recipe(), 'reworkGate', { status: 'common', value: REWORK_GATE_NOT_REWORKED, dirty: true } as never,
  )
  assert.equal(set.reworkGate, REWORK_GATE_NOT_REWORKED, 'a set gate is stored')
})
