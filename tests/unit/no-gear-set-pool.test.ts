import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCESSORY_SLOTS_COMPATIBLE_SET_IDS,
  ALL_ARTIFACT_SET_IDS,
  getAccessorySlotsCompatibleSetIds,
  getAllKnownArtifactSetIds,
  getArtifactSetPieceGroup,
  ArtifactSetPieceGroup,
  artifactSetName,
  findArtifactSetIdByName,
} from '../../src/lib/types.js'
import { ACCESSORY_NO_SET_ID } from '../../src/lib/constants.js'

// -99 must be in the accessory-compatible pool so resolveAllowedSetPool returns it
// when accessories are in scope, eliminating the need for ad-hoc special-casing.
test('ACCESSORY_NO_SET_ID (-99) is included in ACCESSORY_SLOTS_COMPATIBLE_SET_IDS', () => {
  assert.ok(
    ACCESSORY_SLOTS_COMPATIBLE_SET_IDS.includes(ACCESSORY_NO_SET_ID as never),
    'static pool constant must contain -99',
  )
})

test('ACCESSORY_NO_SET_ID (-99) is included in ALL_ARTIFACT_SET_IDS', () => {
  assert.ok(
    ALL_ARTIFACT_SET_IDS.includes(ACCESSORY_NO_SET_ID as never),
    'all-sets constant must contain -99',
  )
})

test('getAccessorySlotsCompatibleSetIds() includes -99', () => {
  const ids = getAccessorySlotsCompatibleSetIds()
  assert.ok(
    ids.map(Number).includes(ACCESSORY_NO_SET_ID),
    'runtime accessor must return -99 for accessory-compatible sets',
  )
})

test('getAllKnownArtifactSetIds() includes -99', () => {
  const ids = getAllKnownArtifactSetIds()
  assert.ok(
    ids.map(Number).includes(ACCESSORY_NO_SET_ID),
    'runtime accessor must return -99 in the complete set list',
  )
})

// -99 is a synthetic sentinel with no piece-bonus entry; treat it like a 1-piece
// accessory set so UI grouping and set-pool filtering behave consistently.
test('getArtifactSetPieceGroup(-99) returns Accessories', () => {
  assert.equal(
    getArtifactSetPieceGroup(ACCESSORY_NO_SET_ID as never),
    ArtifactSetPieceGroup.Accessories,
  )
})

// The canonical English name is used by the SFC serializer and must survive a
// name→id round-trip through findArtifactSetIdByName.
test('artifactSetName(-99) returns "No Gear-Set"', () => {
  assert.equal(artifactSetName(ACCESSORY_NO_SET_ID as never), 'No Gear-Set')
})

test('findArtifactSetIdByName("No Gear-Set") returns -99', () => {
  assert.equal(findArtifactSetIdByName('No Gear-Set'), ACCESSORY_NO_SET_ID)
})

// Armor-only sets must never appear alongside -99 in the accessory pool.
test('-99 is absent from ARMOR_FIXED_SET_IDS and ARMOR_VARIABLE_SET_IDS', async () => {
  const { ARMOR_FIXED_SET_IDS, ARMOR_VARIABLE_SET_IDS } = await import('../../src/lib/types.js')
  assert.equal(
    ARMOR_FIXED_SET_IDS.includes(ACCESSORY_NO_SET_ID as never),
    false,
    '-99 must not appear in the armor fixed pool',
  )
  assert.equal(
    ARMOR_VARIABLE_SET_IDS.includes(ACCESSORY_NO_SET_ID as never),
    false,
    '-99 must not appear in the armor variable pool',
  )
})
