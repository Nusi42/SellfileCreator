/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import test from 'node:test'

// Ingest of the mode-scoped damage substats, pinned by the
// REAL rows from the account-d gear-db fixture (artifacts 264537/264539, verified
// against in-game screenshots). Facts under test: ids 11/13 (damage dealt) arrive as
// positive percents, id 16 (PvP damage taken) arrives NEGATIVE and folds to its
// magnitude, values scale by 2^32 with x100 percent conversion (±53687091 → 1.25),
// and classic lines on the same piece stay untouched.
import { ArtifactSet, ArtifactType, Faction, StatVariant } from '../../src/lib/types.js'
import { ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY } from '../../src/lib/anomalousAccessories.js'
import {
  normalizeGearDbArtifact,
  type GearDbArtifactRow,
} from '../../src/lib/importers/gearDbNormalizer.js'

// Artifact 264537 — Refresh Ring, Lizardmen, Epic 5★: PvP DMG- 1.25%, PvE DMG+ 1.25%, Boss DMG+ 1.25%.
const refreshRingRow: GearDbArtifactRow = {
  ID: 264537,
  price: 990000,
  rank: 5,
  type: 7,
  mid: 2,
  mfl: 1,
  mlvlid: 107374182400,
  s1id: 16,
  s1lvlid: -53687091,
  s2id: 11,
  s2lvlid: 53687091,
  s3id: 13,
  s3lvlid: 53687091,
  rarity: 4,
  aset: 1000,
  accset: 6,
}

// Artifact 264539 — Supersonic Banner, High Elves, Epic 5★: PvP DMG- 1.25%, SPD 4, PvE DMG+ 1.25%.
const supersonicBannerRow: GearDbArtifactRow = {
  ID: 264539,
  price: 1260000,
  rank: 5,
  type: 9,
  mid: 5,
  mfl: 1,
  mlvlid: 51539607552,
  s1id: 16,
  s1lvlid: -53687091,
  s2id: 4,
  s2fl: 1,
  s2lvlid: 17179869184,
  s3id: 11,
  s3lvlid: 53687091,
  rarity: 4,
  aset: 58,
  accset: 2,
}

test('anomalous ring: ids 16/11/13 normalize to their variants at magnitude 1.25', () => {
  const normalized = normalizeGearDbArtifact(refreshRingRow)
  // Slot/set/faction mapping stays classic.
  assert.equal(normalized.slot, ArtifactType.Ring)
  assert.equal(normalized.set, ArtifactSet.Refresh)
  assert.equal(normalized.faction, Faction.Lizardmen)
  // Three substat lines, each resolving to a distinct anomalous variant.
  const byVariant = new Map(normalized.substats.map((stat) => [stat.variant, stat]))
  const pvpTaken = byVariant.get(ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.pvpDmgMinus)
  const pveDealt = byVariant.get(ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.pveDmgPlus)
  const bossDealt = byVariant.get(ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.bossDmgPlus)
  // The DB stores the taken-family line negative; identity carries the
  // direction, so the normalized value is the positive magnitude.
  assert.equal(pvpTaken?.totalValue, 1.25)
  assert.equal(pveDealt?.totalValue, 1.25)
  assert.equal(bossDealt?.totalValue, 1.25)
  // The consolidated subValues map (rule matching input) exposes the same magnitudes.
  assert.equal(normalized.gearInspectorItem.subValues?.[ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.pvpDmgMinus], 1.25)
})

test('anomalous banner: anomalous lines coexist with classic SPD untouched', () => {
  const normalized = normalizeGearDbArtifact(supersonicBannerRow)
  // Banner slot with a set — the observation that confirmed Banner eligibility.
  assert.equal(normalized.slot, ArtifactType.Banner)
  assert.equal(normalized.set, ArtifactSet.Supersonic)
  assert.equal(normalized.faction, Faction.HighElves)
  const byVariant = new Map(normalized.substats.map((stat) => [stat.variant, stat]))
  // Classic SPD line: flat 4, no percent conversion, no folding.
  assert.equal(byVariant.get(StatVariant.SPD)?.totalValue, 4)
  // Anomalous lines fold/convert exactly like on the ring.
  assert.equal(byVariant.get(ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.pvpDmgMinus)?.totalValue, 1.25)
  assert.equal(byVariant.get(ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.pveDmgPlus)?.totalValue, 1.25)
})
