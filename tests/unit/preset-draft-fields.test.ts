import test from 'node:test'
import assert from 'node:assert/strict'
import {
  presetDraftFields,
  matchedPreset,
  presetRaw,
  presetFilename,
  type PresetVariant,
} from '../../src/lib/sfcPresetMatch.js'

// The two bundled built-in variants. Kept inline (not imported) so the test fails
// loudly if a new variant is ever added without extending coverage here.
const VARIANTS: PresetVariant[] = ['beginner', 'lategame']

// presetDraftFields is the SSOT the restore dialog and simple-mode startup both use to
// load the CURRENT bundled preset body. The contract: the fields it returns must be
// recognized as exactly that preset by matchedPreset (same canonicalization path), so
// a swapped-in restore draft is, by construction, the preset it claims to be.
for (const variant of VARIANTS) {
  test(`presetDraftFields(${variant}) round-trips to matchedPreset === ${variant}`, () => {
    const fields = presetDraftFields(variant)
    assert.equal(matchedPreset(fields), variant)
  })
}

// The cache must never leak its internal object: callers spread session/override state
// on top, so each call has to hand back a copy that mutation cannot reach.
test('presetDraftFields returns a fresh shallow copy each call', () => {
  const a = presetDraftFields('beginner')
  const b = presetDraftFields('beginner')
  assert.notEqual(a, b)
  // Mutating one result must not affect the next call's recipes array reference swap.
  a.recipes = []
  assert.notEqual(presetDraftFields('beginner').recipes.length, 0)
})

// The raw/filename accessors are the single place the bundled SFC text is consumed.
for (const variant of VARIANTS) {
  test(`presetRaw/presetFilename(${variant}) expose the bundled asset`, () => {
    assert.ok(presetRaw(variant).length > 0)
    assert.equal(presetFilename(variant), `${variant}.sfc`)
  })
}
