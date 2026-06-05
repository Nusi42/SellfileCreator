/* eslint import/no-unused-modules: "off" */
// Unit tests for preset icon/pin support: sanitization, built-in override
// round-tripping (the legacy-localStorage migration contract), and the
// snapshot-equality helpers that drive the pinned Apply ⇄ Clear toggle.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizePresetIconId,
  resolveBuiltinIconPin,
  buildBuiltinIconPinStub,
  type PresetIconPinFields,
} from '../../src/state/presetUtils.js'
import { METASET_ICON_OPTIONS, normalizeMetasetIconId } from '../../src/lib/metasetIcons.js'
import {
  sanitizeFilterPresetSnapshot,
  filterPresetSnapshotsEqual,
} from '../../src/state/filterPresetsPreference.js'
import {
  BUILTIN_SORT_PRESETS,
  sortPresetSnapshotsEqual,
} from '../../src/state/sortPresetsPreference.js'

// --- sanitizePresetIconId ---------------------------------------------------

test('sanitizePresetIconId accepts catalog ids and rejects sentinels/garbage', () => {
  // A real emoji id round-trips unchanged.
  assert.equal(sanitizePresetIconId('icon.gem'), 'icon.gem')
  // The "no icon" sentinel collapses to undefined so nothing is persisted.
  assert.equal(sanitizePresetIconId('none'), undefined)
  // A glyph-variant id is also valid.
  assert.equal(sanitizePresetIconId('glyph.gem'), 'glyph.gem')
  // Unknown ids (even well-formed icon.* that aren't in the catalog) → undefined.
  assert.equal(sanitizePresetIconId('icon.totally-made-up'), undefined)
  assert.equal(sanitizePresetIconId('garbage'), undefined)
  // Non-strings are rejected.
  assert.equal(sanitizePresetIconId(42), undefined)
  assert.equal(sanitizePresetIconId(undefined), undefined)
})

test('icon catalog includes the new RAID glyphs and the circled-42 easter egg', () => {
  const ids = new Set(METASET_ICON_OPTIONS.map((o) => o.id))
  // A few of the RAID/gacha additions exist in both colored + monochrome variants.
  for (const key of ['coin', 'ring', 'trophy', 'grid', 'boot']) {
    assert.ok(ids.has(`icon.${key}`), `missing icon.${key}`)
    assert.ok(ids.has(`glyph.${key}`), `missing glyph.${key}`)
  }
  // The circled-42 number glyph is present and round-trips through normalize.
  assert.ok(ids.has('glyph.num42'))
  assert.equal(normalizeMetasetIconId('glyph.num42'), 'glyph.num42')
  // All ids are unique (no accidental duplicate keys).
  assert.equal(ids.size, METASET_ICON_OPTIONS.length)
})

// --- built-in override resolve (parse side) ---------------------------------

// A default-pinned built-in (e.g. All Artifacts) ships with both fields.
const PINNED_DEF: PresetIconPinFields = { iconId: 'icon.gem', pinned: true }
// A non-pinned built-in (e.g. a sell variant) ships with just an icon.
const PLAIN_DEF: PresetIconPinFields = { iconId: 'icon.recycle' }

test('resolveBuiltinIconPin inherits definition defaults when the stub omits fields', () => {
  // Legacy stub from before this feature → both default fields restored.
  assert.deepEqual(resolveBuiltinIconPin(PINNED_DEF, {}), { iconId: 'icon.gem', pinned: true })
  assert.deepEqual(resolveBuiltinIconPin(PLAIN_DEF, {}), { iconId: 'icon.recycle' })
})

test('resolveBuiltinIconPin applies explicit overrides (un-pin, clear icon, swap icon)', () => {
  // Explicit pinned:false un-pins a default-pinned built-in.
  assert.deepEqual(resolveBuiltinIconPin(PINNED_DEF, { pinned: false }), { iconId: 'icon.gem' })
  // Explicit iconId:'none' clears the icon while keeping the default pin.
  assert.deepEqual(resolveBuiltinIconPin(PINNED_DEF, { iconId: 'none' }), { pinned: true })
  // Swapping the icon + un-pinning at once.
  assert.deepEqual(resolveBuiltinIconPin(PINNED_DEF, { iconId: 'icon.flame', pinned: false }), { iconId: 'icon.flame' })
  // Pinning a plain built-in.
  assert.deepEqual(resolveBuiltinIconPin(PLAIN_DEF, { pinned: true }), { iconId: 'icon.recycle', pinned: true })
})

// --- built-in override stub (serialize side) --------------------------------

test('buildBuiltinIconPinStub emits only deviations from the definition', () => {
  // No deviation → empty stub (nothing extra persisted).
  assert.deepEqual(buildBuiltinIconPinStub({ iconId: 'icon.gem', pinned: true }, PINNED_DEF), {})
  // Un-pinned default-pinned built-in → explicit pinned:false.
  assert.deepEqual(buildBuiltinIconPinStub({ iconId: 'icon.gem' }, PINNED_DEF), { pinned: false })
  // Cleared icon on a plain built-in → explicit iconId:'none'.
  assert.deepEqual(buildBuiltinIconPinStub({}, PLAIN_DEF), { iconId: 'none' })
  // Swapped icon → records the new id only.
  assert.deepEqual(buildBuiltinIconPinStub({ iconId: 'icon.flame', pinned: true }, PINNED_DEF), { iconId: 'icon.flame' })
})

test('stub → resolve round-trips an arbitrary customization losslessly', () => {
  // Whatever the user ends up with, serialize-then-parse reproduces it exactly.
  const customized: PresetIconPinFields = { iconId: 'icon.flame' } // pinned cleared, icon swapped
  const stub = buildBuiltinIconPinStub(customized, PINNED_DEF)
  assert.deepEqual(resolveBuiltinIconPin(PINNED_DEF, stub), customized)
})

// --- snapshot equality (pinned toggle active-detection) ---------------------

test('filterPresetSnapshotsEqual matches identical snapshots and rejects edits', () => {
  const base = sanitizeFilterPresetSnapshot(undefined)
  // A snapshot equals itself (and a structurally-identical clone).
  assert.equal(filterPresetSnapshotsEqual(base, sanitizeFilterPresetSnapshot(undefined)), true)
  // Flipping a top-level field breaks equality.
  const edited = { ...base, limitRecipesToFiltered: !base.limitRecipesToFiltered }
  assert.equal(filterPresetSnapshotsEqual(base, edited), false)
})

test('sortPresetSnapshotsEqual matches a built-in sort against itself and rejects others', () => {
  const newest = BUILTIN_SORT_PRESETS.find((p) => p.id === 'builtin:newest')!
  const spd = BUILTIN_SORT_PRESETS.find((p) => p.id === 'builtin:spd')!
  assert.equal(sortPresetSnapshotsEqual(newest.snapshot, newest.snapshot), true)
  assert.equal(sortPresetSnapshotsEqual(newest.snapshot, spd.snapshot), false)
})
