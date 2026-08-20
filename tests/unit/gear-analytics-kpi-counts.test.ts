/* eslint import/no-unused-modules: off */

// KPI item counts: the artifact/accessory split and the anomalous sub-count that trails the
// accessory value in the "Artifacts + Accessories" card. The invariant under test is that
// anomalousCount is a SUBSET of accessoryCount, never a third category.

import test from 'node:test'
import assert from 'node:assert/strict'

import { computeGearAnalyticsKpis } from '../../src/lib/gearAnalytics'
import { ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY } from '../../src/lib/anomalousAccessories'
import { ArtifactType } from '../../src/lib/types'
import type { GearInspectorPreviewRow } from '../../src/types/gearInspectorPreview'

// Minimal row factory: the KPI loop reads slot, substats and a handful of scalar fields.
// Everything it does not touch stays off the fixture, so a partial cast keeps this small.
function makeRow(slot: number, substatVariants: readonly number[] = []): GearInspectorPreviewRow {
  return {
    artifact: {
      slot,
      rank: 5,
      rarity: 4,
      level: 0,
      rerollCount: 0,
      ascension: null,
      equippedChampion: null,
      substats: substatVariants.map((variant) => ({ variant, glyphValue: 0 })),
    },
    match: null,
  } as unknown as GearInspectorPreviewRow
}

// A classic (non-anomalous) substat variant, for the "accessory but not anomalous" case.
const CLASSIC_VARIANT = 0

test('computeGearAnalyticsKpis splits artifacts vs accessories and counts anomalous as a subset', () => {
  const kpis = computeGearAnalyticsKpis([
    // Two non-accessory artifacts.
    makeRow(ArtifactType.Weapon),
    makeRow(ArtifactType.Helmet),
    // Three accessories, two of which carry a mode-damage substat.
    makeRow(ArtifactType.Ring, [ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.pveDmgPlus]),
    makeRow(ArtifactType.Amulet, [CLASSIC_VARIANT, ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.bossDmgMinus]),
    makeRow(ArtifactType.Banner, [CLASSIC_VARIANT]),
  ])
  assert.equal(kpis.artifactCount, 2, 'weapon + helmet are artifacts')
  assert.equal(kpis.accessoryCount, 3, 'ring + amulet + banner are accessories')
  assert.equal(kpis.anomalousCount, 2, 'only the two carrying a mode-damage line count')
  // The subset invariant the card's layout depends on.
  assert.ok(
    kpis.anomalousCount! <= kpis.accessoryCount!,
    'anomalous pieces must never exceed the accessory count they are drawn from',
  )
})

test('computeGearAnalyticsKpis reports zero anomalous when no piece carries one', () => {
  const kpis = computeGearAnalyticsKpis([
    makeRow(ArtifactType.Ring, [CLASSIC_VARIANT]),
    makeRow(ArtifactType.Weapon),
  ])
  // Zero (not null) — the card omits the annotation itself rather than rendering "0".
  assert.equal(kpis.anomalousCount, 0)
  assert.equal(kpis.accessoryCount, 1)
})

test('computeGearAnalyticsKpis returns null counts for an empty row set', () => {
  const kpis = computeGearAnalyticsKpis([])
  // All-null is the "no data loaded" signal; the card renders an em dash, not a zero.
  assert.equal(kpis.anomalousCount, null)
  assert.equal(kpis.accessoryCount, null)
  assert.equal(kpis.artifactCount, null)
})

export {}
