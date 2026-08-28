import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DYNAMIC_OVERRIDES_PRESET_FILE_KIND,
  DYNAMIC_OVERRIDES_PRESET_FILE_VERSION,
  buildDynamicOverridesPresetFile,
  dynamicOverridesPresetFilename,
  dynamicOverridesPresetIdentity,
  makeUniquePresetName,
  mergeImportedDynamicOverridesPresets,
  parseDynamicOverridesPresetFile,
} from '../../src/lib/dynamicOverridesPresetFile.js'
import type { DynamicOverridesPreset } from '../../src/state/dynamicOverridesPresetsPreference.js'

// A minimal but realistic set: both answer maps populated, plus the label snapshot.
const makePreset = (id: string, name: string): DynamicOverridesPreset => ({
  id,
  name,
  savedAt: '2026-08-01T10:20:30.000Z',
  recipeAnswers: { q1: ['optA'], q2: [] },
  safeguardAnswers: { s1: ['on'] },
  savedLabels: { recipe: { q1: { title: 'Tier', options: { optA: 'Lategame' } } }, safeguard: {} },
})

// Serializing then parsing must return the same sets — this is the whole point of the file.
test('export document round-trips through the parser', () => {
  const presets = [makePreset('a', 'Alpha'), makePreset('b', 'Beta')]
  const text = JSON.stringify(buildDynamicOverridesPresetFile(presets))
  const parsed = parseDynamicOverridesPresetFile(text)
  assert.equal(parsed.ok, true)
  assert.ok(parsed.ok)
  assert.deepEqual(parsed.presets, presets)
  assert.equal(parsed.skipped, 0)
})

test('export document carries the kind marker and current version', () => {
  const doc = buildDynamicOverridesPresetFile([makePreset('a', 'Alpha')])
  assert.equal(doc.kind, DYNAMIC_OVERRIDES_PRESET_FILE_KIND)
  assert.equal(doc.version, DYNAMIC_OVERRIDES_PRESET_FILE_VERSION)
})

test('filename is timestamped and JSON', () => {
  const name = dynamicOverridesPresetFilename(new Date(2026, 7, 28, 14, 5))
  assert.equal(name, 'SellfileCreatorOverrideSets_20260828_1405.json')
})

// Rejection paths: each must be distinguishable so the dialog can explain what went wrong.
test('non-JSON input is reported as unreadable', () => {
  const parsed = parseDynamicOverridesPresetFile('not json at all')
  assert.deepEqual(parsed, { ok: false, reason: 'unreadable' })
})

test('a JSON file without the kind marker is rejected', () => {
  const parsed = parseDynamicOverridesPresetFile(JSON.stringify({ presets: [makePreset('a', 'Alpha')] }))
  assert.deepEqual(parsed, { ok: false, reason: 'wrongKind' })
})

test('a document from a newer format version is refused rather than guessed at', () => {
  const doc = { ...buildDynamicOverridesPresetFile([makePreset('a', 'Alpha')]), version: DYNAMIC_OVERRIDES_PRESET_FILE_VERSION + 1 }
  assert.deepEqual(parseDynamicOverridesPresetFile(JSON.stringify(doc)), { ok: false, reason: 'wrongKind' })
})

test('a document whose sets are all invalid reports empty, not success', () => {
  const doc = { ...buildDynamicOverridesPresetFile([]), presets: [{ name: 'no id' }, null] }
  assert.deepEqual(parseDynamicOverridesPresetFile(JSON.stringify(doc)), { ok: false, reason: 'empty' })
})

// One corrupt entry must not cost the user the rest of the file.
test('invalid entries are skipped while valid ones import', () => {
  const doc = {
    ...buildDynamicOverridesPresetFile([]),
    presets: [makePreset('a', 'Alpha'), { name: 'missing id' }, makePreset('b', 'Beta')],
  }
  const parsed = parseDynamicOverridesPresetFile(JSON.stringify(doc))
  assert.ok(parsed.ok)
  assert.equal(parsed.presets.length, 2)
  assert.equal(parsed.skipped, 1)
})

test('unique-name helper suffixes from 2 upward', () => {
  assert.equal(makeUniquePresetName('Alpha', new Set()), 'Alpha')
  assert.equal(makeUniquePresetName('Alpha', new Set(['Alpha'])), 'Alpha (2)')
  assert.equal(makeUniquePresetName('Alpha', new Set(['Alpha', 'Alpha (2)'])), 'Alpha (3)')
})

// A set that shares a name but differs in content is a genuinely different set:
// it must be kept under a suffixed name rather than dropped or overwritten.
test('merge renames name collisions with different content instead of overwriting', () => {
  const existing = [makePreset('x', 'Alpha')]
  const incoming = { ...makePreset('a', 'Alpha'), recipeAnswers: { q1: ['optB'] } }
  const result = mergeImportedDynamicOverridesPresets(existing, [incoming])
  assert.equal(result.added, 1)
  assert.equal(result.renamed, 1)
  assert.equal(result.duplicates, 0)
  assert.equal(result.presets.length, 2)
  // The original survives untouched, name and id included.
  assert.ok(result.presets.some((p) => p.id === 'x' && p.name === 'Alpha'))
  assert.ok(result.presets.some((p) => p.name === 'Alpha (2)'))
})

// Requirement: re-importing a backup must not pile up copies.
test('an exact duplicate of an existing set is skipped, not added', () => {
  const existing = [makePreset('x', 'Alpha')]
  // Different id (ids are per-install) but same name and same answers.
  const result = mergeImportedDynamicOverridesPresets(existing, [makePreset('a', 'Alpha')])
  assert.equal(result.added, 0)
  assert.equal(result.duplicates, 1)
  assert.equal(result.renamed, 0)
  assert.deepEqual(result.presets, existing)
})

test('re-importing the same file twice is a no-op the second time', () => {
  const file = [makePreset('a', 'Alpha'), makePreset('b', 'Beta')]
  const first = mergeImportedDynamicOverridesPresets([], file)
  assert.equal(first.added, 2)
  const second = mergeImportedDynamicOverridesPresets(first.presets, file)
  assert.equal(second.added, 0)
  assert.equal(second.duplicates, 2)
  assert.equal(second.presets.length, 2)
})

test('duplicates within a single file collapse to one entry', () => {
  const result = mergeImportedDynamicOverridesPresets([], [makePreset('a', 'Dup'), makePreset('b', 'Dup')])
  assert.equal(result.added, 1)
  assert.equal(result.duplicates, 1)
  assert.deepEqual(result.presets.map((p) => p.name), ['Dup'])
})

test('same name in one file with different content still yields two sets', () => {
  const second = { ...makePreset('b', 'Dup'), safeguardAnswers: { s1: ['off'] } }
  const result = mergeImportedDynamicOverridesPresets([], [makePreset('a', 'Dup'), second])
  const names = result.presets.map((p) => p.name).sort()
  assert.deepEqual(names, ['Dup', 'Dup (2)'])
  assert.equal(result.renamed, 1)
  assert.equal(result.duplicates, 0)
})

test('identity ignores id and savedAt but tracks name and answers', () => {
  const base = makePreset('a', 'Alpha')
  // Same content, different id/timestamp — must be the same identity.
  assert.equal(
    dynamicOverridesPresetIdentity(base),
    dynamicOverridesPresetIdentity({ ...base, id: 'other', savedAt: '2020-01-01T00:00:00.000Z' }),
  )
  // A renamed copy is a different set.
  assert.notEqual(dynamicOverridesPresetIdentity(base), dynamicOverridesPresetIdentity({ ...base, name: 'Beta' }))
  // A changed answer is a different set.
  assert.notEqual(
    dynamicOverridesPresetIdentity(base),
    dynamicOverridesPresetIdentity({ ...base, recipeAnswers: { q1: ['optB'], q2: [] } }),
  )
})

test('identity is order-insensitive across answer keys and multi-select values', () => {
  const a = { ...makePreset('a', 'Alpha'), recipeAnswers: { q1: ['x', 'y'], q2: [] } }
  const b = { ...makePreset('b', 'Alpha'), recipeAnswers: { q2: [], q1: ['y', 'x'] } }
  assert.equal(dynamicOverridesPresetIdentity(a), dynamicOverridesPresetIdentity(b))
})

test('imported sets get fresh ids so two rows never share a React key', () => {
  const first = mergeImportedDynamicOverridesPresets([], [makePreset('a', 'Alpha')])
  // Different content, same name — accepted under a suffixed name.
  const incoming = { ...makePreset('a', 'Alpha'), recipeAnswers: { q1: ['optB'] } }
  const second = mergeImportedDynamicOverridesPresets(first.presets, [incoming])
  const ids = second.presets.map((p) => p.id)
  assert.equal(new Set(ids).size, ids.length, 'every set must keep a distinct id')
  // The incoming id must not be reused verbatim, or the two rows would collide as React keys.
  assert.equal(ids.filter((id) => id === 'a').length, 0)
})

test('imported sets land at the front, matching where a freshly saved set appears', () => {
  const existing = [makePreset('x', 'Old')]
  const result = mergeImportedDynamicOverridesPresets(existing, [makePreset('a', 'New')])
  assert.equal(result.presets[0]?.name, 'New')
})

// Answer maps are what actually drive the overrides; they must survive the file trip intact.
test('answer maps and label snapshots survive export and import unchanged', () => {
  const preset = makePreset('a', 'Alpha')
  const text = JSON.stringify(buildDynamicOverridesPresetFile([preset]))
  const parsed = parseDynamicOverridesPresetFile(text)
  assert.ok(parsed.ok)
  const restored = parsed.presets[0]!
  assert.deepEqual(restored.recipeAnswers, preset.recipeAnswers)
  assert.deepEqual(restored.safeguardAnswers, preset.safeguardAnswers)
  assert.deepEqual(restored.savedLabels, preset.savedLabels)
})
