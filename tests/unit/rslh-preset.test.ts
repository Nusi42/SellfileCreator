import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RSLH_PRESET, mergeCustomization } from '../../src/lib/rslhPreset.js'
import { EMPTY_THEME_CUSTOMIZATION } from '../../src/lib/constants.js'

// RSLH = dark base + this value-set; every field is concrete (no nulls) so the look is fully
// defined when selected.
test('RSLH_PRESET defines the skin values with no null gaps for its core fields', () => {
  assert.equal(RSLH_PRESET.primaryColor, '#FF8800')
  assert.equal(RSLH_PRESET.bgColor, '#151515')
  assert.equal(RSLH_PRESET.paperColor, '#2C2C2C')
  // Warning is adapted off the skin's orange (#F1960E) to amber, to not collide with primary.
  assert.equal(RSLH_PRESET.warningColor, '#FFC107')
  assert.notEqual(RSLH_PRESET.uiFontFamily, null)
  assert.notEqual(RSLH_PRESET.codeFontFamily, null)
})

// "Layer edits on RSLH": user's explicit (non-null) values win per field; otherwise the preset.
test('mergeCustomization: user value wins per field, preset fills the rest', () => {
  const user = { ...EMPTY_THEME_CUSTOMIZATION, primaryColor: '#123456' }
  const merged = mergeCustomization(RSLH_PRESET, user)
  // User edited the accent → user wins.
  assert.equal(merged.primaryColor, '#123456')
  // Untouched fields fall back to the RSLH preset.
  assert.equal(merged.paperColor, '#2C2C2C')
  assert.equal(merged.warningColor, '#FFC107')
})

// With no user edits, the merge is exactly the preset (RSLH as-shipped).
test('mergeCustomization: empty user customization yields the preset unchanged', () => {
  const merged = mergeCustomization(RSLH_PRESET, EMPTY_THEME_CUSTOMIZATION)
  assert.deepEqual(merged, RSLH_PRESET)
})

// numeric fields (borderRadius) layer the same way as colors.
test('mergeCustomization: numeric overrides layer like colors', () => {
  const user = { ...EMPTY_THEME_CUSTOMIZATION, borderRadius: 0 }
  const merged = mergeCustomization(RSLH_PRESET, user)
  // 0 is a meaningful value (not null) so it must win over the preset's 8.
  assert.equal(merged.borderRadius, 0)
})
