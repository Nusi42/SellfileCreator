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
import { REWORK_EXCLUDE_TAG, REWORK_ONLY_TAG, SAFEGUARD_IGNORE_TAG, describeSemanticTags, isSemanticTag, buildTagVocabulary, APP_KNOWN_TAGS } from '../../src/lib/tagHelpers.js'
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


// --- Tag vocabulary (the tags-flyout picker) ---
//
// The picker offers tags already used anywhere in the document — recipes AND safeguards —
// plus the app-known tags, so a tag coined on one side can be reused on the other without
// recalling its spelling.

test('buildTagVocabulary always offers the app-known tags first', () => {
  // Even with nothing tagged anywhere, the behavior-carrying tags must be selectable.
  const { tags, appKnown } = buildTagVocabulary([])
  assert.deepEqual(tags, [...APP_KNOWN_TAGS])
  // Only current spellings are offered; legacy aliases still load but are never suggested.
  assert.equal(tags.includes('ignore_for_chaos_ored'), false)
  // The app-known set marks exactly those tags.
  assert.deepEqual([...appKnown].sort(), [...APP_KNOWN_TAGS].sort())
})

test('buildTagVocabulary merges tags from every source and counts usage', () => {
  // Two "recipes" and one "safeguard" — the builder does not care which is which.
  const { tags, counts } = buildTagVocabulary([
    ['speed', 'ore5epic'],
    ['speed'],
    ['safeguard_only'],
  ])
  // App-known tags lead; the user's own follow alphabetically.
  assert.deepEqual(tags.slice(0, APP_KNOWN_TAGS.length), [...APP_KNOWN_TAGS])
  assert.deepEqual(tags.slice(APP_KNOWN_TAGS.length), ['ore5epic', 'safeguard_only', 'speed'])
  // Counts reflect how many entries carry each tag.
  assert.equal(counts['speed'], 2)
  assert.equal(counts['safeguard_only'], 1)
  // Unused app-known tags report no usage rather than being absent.
  assert.equal(counts[REWORK_ONLY_TAG] ?? 0, 0)
})

test('buildTagVocabulary folds legacy spellings into their current tag', () => {
  // A file still carrying the pre-rename tag must not offer BOTH spellings.
  const { tags, counts } = buildTagVocabulary([['ignore_for_chaos_ored'], [REWORK_EXCLUDE_TAG]])
  assert.equal(tags.filter((tag) => tag === REWORK_EXCLUDE_TAG).length, 1)
  assert.equal(tags.includes('ignore_for_chaos_ored'), false)
  // Both entries count toward the canonical tag.
  assert.equal(counts[REWORK_EXCLUDE_TAG], 2)
})

test('buildTagVocabulary counts a repeated tag once per entry', () => {
  // A malformed list repeating a tag must not inflate its usage count.
  const { counts } = buildTagVocabulary([['speed', 'speed', 'SPEED']])
  assert.equal(counts['speed'], 1)
})
