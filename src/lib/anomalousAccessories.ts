/**
 * anomalousAccessories.ts
 *
 * PROVISIONAL(anomalous) — domain layer for the "Anomalous Accessories"
 * (Champion Proving Grounds jewelry whose substats can be mode-scoped damage
 * boons instead of classic flat stats).
 *
 * Single source of truth for everything the app knows about the feature today.
 * The data itself is generated from shared/domain-constants.json; this module
 * only adds the typed helpers around it. The substat ids are the REAL RSL
 * Helper DB ids (11..14 damage dealt, 15..18 damage taken — 14/15/17/18 still
 * inferred, see the spec comment), riding the standard StatVariant encoding
 * ((id<<8)|flat, percent-shaped) through UI state, SFC documents, and DB
 * ingest. They must still NOT be emitted into HSF sellfile payloads: no sample
 * sellfile demonstrates how RSL Helper rules encode them, and we never guess
 * at schema. Ledger: docs/technical/anomalous-accessories.md.
 *
 * Like artifactSets.ts, this module stays free of runtime imports beyond the
 * pure generated-constants module so it can never join an init cycle.
 */

import {
  ANOMALOUS_ELIGIBLE_SET_IDS,
  ANOMALOUS_ELIGIBLE_SLOT_IDS,
  ANOMALOUS_SUBSTAT_DISPLAY_LABELS_BY_VARIANT,
  ANOMALOUS_SUBSTAT_IDS_BY_KEY,
  ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE,
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY,
} from './generated/domainConstants'

// Re-export the generated SSOT so consumers import from one domain module.
export {
  ANOMALOUS_ELIGIBLE_SET_IDS,
  ANOMALOUS_ELIGIBLE_SLOT_IDS,
  ANOMALOUS_SUBSTAT_DISPLAY_LABELS_BY_VARIANT,
  ANOMALOUS_SUBSTAT_IDS_BY_KEY,
  ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE,
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY,
}

// Stable internal token for each new substat (key union of the generated map).
export type AnomalousSubstatKey = keyof typeof ANOMALOUS_SUBSTAT_IDS_BY_KEY

// Id/variant unions derived from the generated maps (literal values).
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

// Membership checks use Sets so callers get O(1) lookups without re-deriving.
const anomalousIdSet = new Set<number>(ANOMALOUS_SUBSTAT_IDS)
const anomalousVariantSet = new Set<number>(ANOMALOUS_SUBSTAT_VARIANTS)
const eligibleSetIdSet = new Set<number>(ANOMALOUS_ELIGIBLE_SET_IDS)
const eligibleSlotIdSet = new Set<number>(ANOMALOUS_ELIGIBLE_SLOT_IDS)

// True when a raw stat id is one of the anomalous DB ids (exact membership).
// Gates the HSF export scrub: these ids never reach exported sellfile bytes
// until a sample sellfile confirms the rule encoding.
export const isAnomalousStatId = (id: number): boolean => anomalousIdSet.has(id)

// True when a StatVariant value encodes one of the anomalous mode-damage substats.
export const isAnomalousSubstatVariant = (variant: number): boolean =>
  anomalousVariantSet.has(variant)

// True when a set can appear on anomalous accessories (announced 9-set list).
export const isAnomalousEligibleSetId = (setId: number): boolean => eligibleSetIdSet.has(setId)

// True for the accessory slots assumed eligible (Banner inclusion is judged, not confirmed).
export const isAnomalousEligibleSlotId = (slotId: number): boolean => eligibleSlotIdSet.has(slotId)

// Display label for an anomalous variant ("PvE DMG +", ...); undefined for other variants.
export const anomalousSubstatLabel = (variant: number): string | undefined =>
  ANOMALOUS_SUBSTAT_DISPLAY_LABELS_BY_VARIANT[variant]

// The DSL-typable token for an anomalous substat: its stable internal key
// (`pveDmgPlus`, …). The display labels ("PvE DMG +") cannot be used in
// note-overrides FIELD positions — `+` and spaces are token separators there —
// so the key is the writable form. Case-insensitive on the way in.
export const anomalousSubstatDslKey = (variant: number): string | undefined => (
  (Object.keys(ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY) as AnomalousSubstatKey[])
    .find((key) => ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY[key] === variant)
)

// Reverse lookup: uppercase display label → variant, for label-parsing paths
// (variantFromLabel in types.ts). Built once from the generated label map, with
// defensive aliases: the space-free form, the "DMG"-less short form ("PVE+",
// "BOSS-", ...), and the internal key ("PVEDMGPLUS") — the only alias that
// survives DSL field tokenization.
const variantByUpperLabel = new Map<string, number>()
for (const [variantStr, label] of Object.entries(ANOMALOUS_SUBSTAT_DISPLAY_LABELS_BY_VARIANT)) {
  const variant = Number(variantStr)
  const upper = label.toUpperCase()
  variantByUpperLabel.set(upper, variant)
  variantByUpperLabel.set(upper.replace(/\s+/g, ''), variant)
  variantByUpperLabel.set(upper.replace(/\s*DMG\s*/, ''), variant)
}
for (const [key, variant] of Object.entries(ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY)) {
  variantByUpperLabel.set(key.toUpperCase(), variant)
}

// Parse a display label into an anomalous variant; null when it is not one.
// Falls back to a space-free comparison so "pve dmg+" and "PvE DMG +" both hit.
export const anomalousVariantFromLabel = (input: string): number | null => {
  const upper = String(input).trim().toUpperCase()
  return variantByUpperLabel.get(upper)
    ?? variantByUpperLabel.get(upper.replace(/\s+/g, ''))
    ?? null
}
