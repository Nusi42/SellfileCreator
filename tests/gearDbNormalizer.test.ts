/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import test from 'node:test'

import { ACCESSORY_NO_SET_ID } from '../src/lib/constants.js'
import {
  ArtifactSet,
  ArtifactType,
  Faction,
  StatVariant,
} from '../src/lib/types.js'
import {
  normalizeGearDbArtifact,
  type GearDbArtifactRow,
} from '../src/lib/importers/gearDbNormalizer.js'

const weaponRow: GearDbArtifactRow = {
  ID: 2817,
  price: 68400,
  rank: 6,
  type: 5,
  lvl: 16,
  mid: 2,
  mlvl: 0,
  mfl: 1,
  mlvlid: 1138166333440,
  mgv: 0,
  s1id: 1,
  s1lvl: 0,
  s1fl: 1,
  s1lvlid: 2302102470656,
  s1gv: 1181116006400,
  s2id: 8,
  s2lvl: 1,
  s2fl: 0,
  s2lvlid: 515396074,
  s2gv: 0,
  s3id: 4,
  s3lvl: 2,
  s3fl: 1,
  s3lvlid: 77309411328,
  s3gv: 12884901888,
  s4id: 7,
  s4lvl: 0,
  s4fl: 0,
  s4lvlid: 257698037,
  s4gv: 0,
  rarity: 4,
  aset: 19,
  accset: 0,
  cID: 16629,
  sumHP: 5235565133824,
  sumATK: 1138166333440,
  sumDEF: 0,
  sumSPD: 90194313216,
  sumCQuote: 257698037,
  sumCDMG: 515396074,
  sumRES: 0,
  sumACC: 0,
  ASCID: 1,
  ASCFL: 1,
  ASCLVLID: 1752346656768,
  ASCGV: 0,
  ASCLEVEL: 2,
  REROLLCOUNT: 0,
}

const ringRow: GearDbArtifactRow = {
  ID: 7631,
  price: 79200,
  rank: 6,
  type: 7,
  lvl: 16,
  mid: 2,
  mfl: 1,
  mlvlid: 1138166333440,
  mgv: 0,
  s1id: 1,
  s1lvl: 0,
  s1fl: 0,
  s1lvlid: 257698037,
  s1gv: 128849018,
  s2id: 2,
  s2lvl: 2,
  s2fl: 0,
  s2lvlid: 816043784,
  s2gv: 214748364,
  s3id: 3,
  s3lvl: 1,
  s3fl: 0,
  s3lvlid: 558345747,
  s3gv: 42949672,
  s4id: 3,
  s4lvl: 0,
  s4fl: 1,
  s4lvlid: 73014444032,
  s4gv: 107374182400,
  rarity: 4,
  aset: 0,
  accset: 11,
  cID: 106049,
  ASCID: 0,
  ASCLEVEL: 0,
  REROLLCOUNT: 0,
}

test('normalizeGearDbArtifact converts weapon row to tester item', () => {
  const normalized = normalizeGearDbArtifact(weaponRow)
  assert.equal(normalized.slot, ArtifactType.Weapon)
  assert.equal(normalized.set, ArtifactSet.Savage)
  assert.equal(normalized.rank, 6)
  assert.equal(normalized.rarity, 4)
  assert.equal(normalized.level, 16)
  assert.equal(normalized.faction, 0)
  assert.equal(normalized.mainStat?.totalValue, 265)
  assert.equal(normalized.ascension?.totalValue, 408)
  const subValues = normalized.testerItem.subValues ?? {}
  assert.equal(subValues[StatVariant.HP_FLAT], 811)
  assert.equal(subValues[StatVariant.CDMG], 12)
  assert.equal(subValues[StatVariant.SPD], 21)
  assert.equal(subValues[StatVariant.CR], 6)
})

test('normalizeGearDbArtifact handles accessory rows and faction mapping', () => {
  const normalized = normalizeGearDbArtifact(ringRow)
  assert.equal(normalized.slot, ArtifactType.Ring)
  assert.equal(normalized.set, ACCESSORY_NO_SET_ID)
  assert.equal(normalized.faction, Faction.DarkElves)
  assert.equal(normalized.mainStat?.totalValue, 265)
  const subValues = normalized.testerItem.subValues ?? {}
  assert.equal(subValues[StatVariant.HP], 9)
  assert.equal(subValues[StatVariant.ATK], 24)
  assert.equal(subValues[StatVariant.DEF], 14)
  assert.equal(subValues[StatVariant.DEF_FLAT], 42)
})

export {}
