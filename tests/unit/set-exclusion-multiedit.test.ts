/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  computeArtifactSetPatchToggle,
  computeArtifactSetExclusionToggle,
  resolveExclusionPresence,
  resolveInclusionPresence,
  resolveSetTriState,
  resolveSetExclusionTriState,
  resolveMetasetTriState,
  resolveExcludedSetUnion,
  applyArtifactSetPatchPreview,
} from '../../src/components/builderPanel/recipeMultiEditHelpers.js'
import {
  pruneImplicitAnyExclusions,
  splitArtifactSetSelections,
} from '../../src/lib/gearSets/selection.js'

// ── computeArtifactSetExclusionToggle ────────────────────────────────────────

test('exclusion toggle stages an excluded add when nothing is excluded yet', () => {
  // baseState 'none' + target 'all' => add {id, excluded:true}.
  const patch = computeArtifactSetExclusionToggle(null, 7, 'none', 'all')
  assert.deepEqual(patch, { add: [{ id: 7, excluded: true }] })
})

test('exclusion toggle stages a bare remove when all rules already exclude', () => {
  // baseState 'all' + target 'none' => remove keyed by id (clears the exclusion).
  const patch = computeArtifactSetExclusionToggle(null, 7, 'all', 'none')
  assert.deepEqual(patch, { remove: [{ id: 7 }] })
})

test('exclusion toggle on a partial baseline forces exclusion on all (add)', () => {
  const patch = computeArtifactSetExclusionToggle(null, 7, 'mixed', 'all')
  assert.deepEqual(patch, { add: [{ id: 7, excluded: true }] })
})

test('exclusion toggle strips a prior staged include for the same id', () => {
  // A staged include {id:7} must not survive alongside a fresh exclusion.
  const prior = { add: [{ id: 7 }, { id: 9 }] }
  const patch = computeArtifactSetExclusionToggle(prior, 7, 'none', 'all')
  // id 9 include is preserved; id 7 becomes an exclusion.
  assert.deepEqual(patch, { add: [{ id: 9 }, { id: 7, excluded: true }] })
})

// ── computeArtifactSetPatchToggle (include) un-NOTs a set ─────────────────────

test('include toggle ON stages add+remove so an existing exclusion is cleared', () => {
  // Toggling include on must emit BOTH add (re-include) and remove (strip the
  // exclusion first) — otherwise exclusion-wins normalization keeps the NOT.
  const patch = computeArtifactSetPatchToggle(null, 7, 'none', 'all')
  assert.deepEqual(patch, { add: [{ id: 7 }], remove: [{ id: 7 }] })
})

test('include toggle ON un-NOTs a previously excluded set in the preview', () => {
  const patch = computeArtifactSetPatchToggle(null, 7, 'none', 'all')
  const preview = applyArtifactSetPatchPreview([{ id: 7, excluded: true }], patch)
  // The exclusion is gone and the set is now a plain include.
  assert.deepEqual(preview, [{ id: 7 }])
})

test('include toggle OFF stages only a remove', () => {
  const patch = computeArtifactSetPatchToggle(null, 7, 'all', 'none')
  assert.deepEqual(patch, { remove: [{ id: 7 }] })
})

// ── preview application round-trips through the exclusion toggle ──────────────

test('preview applies an exclusion onto a base selection', () => {
  const patch = computeArtifactSetExclusionToggle(null, 7, 'none', 'all')
  const preview = applyArtifactSetPatchPreview([{ id: 7 }], patch)
  // The include collapses to an exclusion (exclusion wins on id collision).
  assert.deepEqual(preview, [{ id: 7, excluded: true }])
})

test('preview clears an exclusion when toggled off', () => {
  const patch = computeArtifactSetExclusionToggle(null, 7, 'all', 'none')
  const preview = applyArtifactSetPatchPreview([{ id: 7, excluded: true }], patch)
  assert.deepEqual(preview, [])
})

// ── resolveExclusionPresence ─────────────────────────────────────────────────

test('exclusion presence: no patch returns the base count', () => {
  assert.equal(resolveExclusionPresence(2, 5, null, 7), 2)
})

test('exclusion presence: an excluded add lifts the count to total', () => {
  const patch = { add: [{ id: 7, excluded: true }] }
  assert.equal(resolveExclusionPresence(1, 5, patch, 7), 5)
})

test('exclusion presence: a remove drops the count to zero', () => {
  const patch = { remove: [{ id: 7 }] }
  assert.equal(resolveExclusionPresence(4, 5, patch, 7), 0)
})

test('exclusion presence: a plain (non-excluded) add does not count as exclusion', () => {
  const patch = { add: [{ id: 7 }] }
  assert.equal(resolveExclusionPresence(2, 5, patch, 7), 2)
})

// ── resolveInclusionPresence ─────────────────────────────────────────────────

test('inclusion presence: an excluded add does not count as inclusion', () => {
  const patch = { add: [{ id: 7, excluded: true }] }
  assert.equal(resolveInclusionPresence(2, 5, patch, 7), 2)
})

test('inclusion presence: a plain add lifts to total, a remove drops to zero', () => {
  assert.equal(resolveInclusionPresence(0, 5, { add: [{ id: 7 }] }, 7), 5)
  assert.equal(resolveInclusionPresence(5, 5, { remove: [{ id: 7 }] }, 7), 0)
})

// ── pruneImplicitAnyExclusions ───────────────────────────────────────────────

test('implicit-any prune drops a bare exclusion with no include and no metaset', () => {
  // HSF cannot express "all sets except X" — the exclusion is meaningless here.
  const next = pruneImplicitAnyExclusions([{ id: 7, excluded: true }], false)
  assert.deepEqual(next, [])
})

test('implicit-any prune keeps an exclusion when a metaset constrains the pool', () => {
  const next = pruneImplicitAnyExclusions([{ id: 7, excluded: true }], true)
  assert.deepEqual(splitArtifactSetSelections(next).excluded, [7])
})

test('implicit-any prune keeps an exclusion alongside an explicit include', () => {
  const next = pruneImplicitAnyExclusions([{ id: 9 }, { id: 7, excluded: true }], false)
  const split = splitArtifactSetSelections(next)
  assert.deepEqual(split.included, [9])
  assert.deepEqual(split.excluded, [7])
})

// ── centralized tri-state resolvers (shared by both panels) ──────────────────

test('resolveSetTriState: single-edit uses the binary fallback', () => {
  assert.equal(resolveSetTriState({ active: false, total: 0, baseCount: 0, patch: null, setId: 7, singleEditIncluded: true }), 'all')
  assert.equal(resolveSetTriState({ active: false, total: 0, baseCount: 0, patch: null, setId: 7, singleEditIncluded: false }), 'none')
})

test('resolveSetTriState: multi-edit collapses presence into none/partial/all', () => {
  const base = { active: true, total: 4, patch: null, setId: 7, singleEditIncluded: false }
  assert.equal(resolveSetTriState({ ...base, baseCount: 0 }), 'none')
  assert.equal(resolveSetTriState({ ...base, baseCount: 2 }), 'partial')
  assert.equal(resolveSetTriState({ ...base, baseCount: 4 }), 'all')
})

test('resolveSetExclusionTriState: a staged excluded add forces all', () => {
  const state = resolveSetExclusionTriState({
    active: true, total: 3, baseCount: 0, patch: { add: [{ id: 7, excluded: true }] }, setId: 7, singleEditExcluded: false,
  })
  assert.equal(state, 'all')
})

test('resolveMetasetTriState: partial when some-but-not-all rules carry the metaset', () => {
  const state = resolveMetasetTriState({
    active: true, total: 5, baseCount: 2, patch: null, name: 'Speed', singleEditSelected: false,
  })
  assert.equal(state, 'partial')
})

test('resolveExcludedSetUnion: unions rule exclusions with staged patch adds', () => {
  const union = resolveExcludedSetUnion({
    total: 3,
    excludedCounts: new Map([[7, 1], [9, 3]]),
    patch: { add: [{ id: 11, excluded: true }] },
  })
  assert.deepEqual(union, [7, 9, 11])
})

test('resolveExcludedSetUnion: a patch remove clears a previously-excluded id', () => {
  const union = resolveExcludedSetUnion({
    total: 3,
    excludedCounts: new Map([[7, 3]]),
    patch: { remove: [{ id: 7 }] },
  })
  assert.deepEqual(union, [])
})
