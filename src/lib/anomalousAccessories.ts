/**
 * anomalousAccessories.ts
 *
 * PROVISIONAL(anomalous) — preparation layer for the Update 11.70 "Anomalous
 * Accessories" (Champion Proving Grounds jewelry whose substats can be
 * mode-scoped damage boons instead of classic flat stats).
 *
 * Single source of truth for everything the app knows about the feature today.
 * The data itself is generated from shared/domain-constants.json; this module
 * only adds the typed helpers around it. The numeric substat ids are byte-sized
 * placeholders (reserved [floor, floor+7]) so the standard StatVariant encoding
 * ((id<<8)|flat) carries them through UI state and SFC documents unchanged —
 * but they are NOT the real game/RSL-Helper ids, and they must NEVER be emitted
 * into HSF sellfile payloads (RSL Helper cannot parse them). The known/unknown
 * ledger and replacement checklist live in
 * docs/technical/anomalous-accessories.md.
 *
 * Like artifactSets.ts, this module stays free of runtime imports beyond the
 * pure generated-constants module so it can never join an init cycle.
 */

import {
  ANOMALOUS_ELIGIBLE_SET_IDS,
  ANOMALOUS_ELIGIBLE_SLOT_IDS,
  ANOMALOUS_PROVISIONAL_ID_FLOOR,
  ANOMALOUS_SUBSTAT_DISPLAY_LABELS_BY_VARIANT,
  ANOMALOUS_SUBSTAT_IDS_BY_KEY,
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY,
} from './generated/domainConstants'

// Re-export the generated SSOT so consumers import from one domain module.
export {
  ANOMALOUS_ELIGIBLE_SET_IDS,
  ANOMALOUS_ELIGIBLE_SLOT_IDS,
  ANOMALOUS_PROVISIONAL_ID_FLOOR,
  ANOMALOUS_SUBSTAT_DISPLAY_LABELS_BY_VARIANT,
  ANOMALOUS_SUBSTAT_IDS_BY_KEY,
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY,
}

// Stable internal token for each new substat (key union of the generated map).
export type AnomalousSubstatKey = keyof typeof ANOMALOUS_SUBSTAT_IDS_BY_KEY

// Placeholder id/variant unions derived from the generated maps (literal values).
export type AnomalousSubstatId = (typeof ANOMALOUS_SUBSTAT_IDS_BY_KEY)[AnomalousSubstatKey]
export type AnomalousSubstatVariant = (typeof ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY)[AnomalousSubstatKey]

// Flat lists in announcement order (the generated maps preserve spec order).
export const ANOMALOUS_SUBSTAT_IDS: readonly AnomalousSubstatId[] =
  Object.values(ANOMALOUS_SUBSTAT_IDS_BY_KEY)
export const ANOMALOUS_SUBSTAT_VARIANTS: readonly AnomalousSubstatVariant[] =
  Object.values(ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY)

// UI row split shared by every substat chip grid: damage-dealt ("+") row and
// damage-taken ("−") row, each in announcement mode order (PvE, PvP, Boss, DNG).
export const ANOMALOUS_SUBSTAT_VARIANTS_ROW_PLUS: readonly AnomalousSubstatVariant[] = [
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.pveDmgPlus,
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.pvpDmgPlus,
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.bossDmgPlus,
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.dungeonDmgPlus,
]
export const ANOMALOUS_SUBSTAT_VARIANTS_ROW_MINUS: readonly AnomalousSubstatVariant[] = [
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.pveDmgMinus,
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.pvpDmgMinus,
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.bossDmgMinus,
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.dungeonDmgMinus,
]

// Exact placeholder range bounds — the ceiling is derived, never hand-kept.
const anomalousIdMax = Math.max(...ANOMALOUS_SUBSTAT_IDS)

// Membership checks use Sets so callers get O(1) lookups without re-deriving.
const anomalousVariantSet = new Set<number>(ANOMALOUS_SUBSTAT_VARIANTS)
const eligibleSetIdSet = new Set<number>(ANOMALOUS_ELIGIBLE_SET_IDS)
const eligibleSlotIdSet = new Set<number>(ANOMALOUS_ELIGIBLE_SLOT_IDS)

// True when a raw stat id is one of our placeholders (exact range, not open-ended).
export const isProvisionalAnomalousStatId = (id: number): boolean =>
  Number.isInteger(id) && id >= ANOMALOUS_PROVISIONAL_ID_FLOOR && id <= anomalousIdMax

// True when a StatVariant value encodes one of the anomalous placeholder substats.
export const isAnomalousSubstatVariant = (variant: number): boolean =>
  anomalousVariantSet.has(variant)

// True when a set can appear on anomalous accessories (announced 9-set list).
export const isAnomalousEligibleSetId = (setId: number): boolean => eligibleSetIdSet.has(setId)

// True for the accessory slots assumed eligible (Banner inclusion is judged, not confirmed).
export const isAnomalousEligibleSlotId = (slotId: number): boolean => eligibleSlotIdSet.has(slotId)

// Display label for an anomalous variant ("PvE DMG +", ...); undefined for other variants.
export const anomalousSubstatLabel = (variant: number): string | undefined =>
  ANOMALOUS_SUBSTAT_DISPLAY_LABELS_BY_VARIANT[variant]

// Reverse lookup: uppercase display label → variant, for label-parsing paths
// (variantFromLabel in types.ts). Built once from the generated label map, with
// defensive aliases: the space-free form and the "DMG"-less short form
// ("PVE+", "BOSS-", ...) so hand-typed or legacy-shortened labels still resolve.
const variantByUpperLabel = new Map<string, number>()
for (const [variantStr, label] of Object.entries(ANOMALOUS_SUBSTAT_DISPLAY_LABELS_BY_VARIANT)) {
  const variant = Number(variantStr)
  const upper = label.toUpperCase()
  variantByUpperLabel.set(upper, variant)
  variantByUpperLabel.set(upper.replace(/\s+/g, ''), variant)
  variantByUpperLabel.set(upper.replace(/\s*DMG\s*/, ''), variant)
}

// Parse a display label into an anomalous variant; null when it is not one.
// Falls back to a space-free comparison so "pve dmg+" and "PvE DMG +" both hit.
export const anomalousVariantFromLabel = (input: string): number | null => {
  const upper = String(input).trim().toUpperCase()
  return variantByUpperLabel.get(upper)
    ?? variantByUpperLabel.get(upper.replace(/\s+/g, ''))
    ?? null
}
