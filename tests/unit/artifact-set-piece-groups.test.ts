import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ArtifactSet,
  ArtifactSetPieceGroup,
  ARMOR_FIXED_SET_IDS,
  ARMOR_VARIABLE_SET_IDS,
  ACCESSORY_SLOTS_COMPATIBLE_SET_IDS,
  getArtifactSetPieceGroup,
} from '../../src/lib/types.js'

test('Swift Parry and Deflection are treated as variable 1-9 sets', () => {
  // These sets used to be fixed 4-piece sets; keep this assertion so future
  // catalog updates cannot silently regress their piece-group behavior.
  const migratedSetIds = [ArtifactSet.SwiftParry, ArtifactSet.Deflection]

  for (const setId of migratedSetIds) {
    assert.equal(getArtifactSetPieceGroup(setId), ArtifactSetPieceGroup.ArmorVariable)
    assert.ok(ARMOR_VARIABLE_SET_IDS.includes(setId))
    assert.ok(ACCESSORY_SLOTS_COMPATIBLE_SET_IDS.includes(setId))
    assert.equal(ARMOR_FIXED_SET_IDS.includes(setId), false)
  }
})
