/**
 * gearInspectorDomain.ts
 *
 * Shared helpers for the Gear Inspector queue so slot/set normalization and rank/rarity
 * coercion stay consistent across external command ingestion and the UI.
 */
import { ACCESSORY_NO_SET_ID, GEAR_INSPECTOR_ANY_SLOT_ID } from './constants'
import {
  type ArtifactSetId,
  ArtifactType,
  type ArtifactTypeId,
  type FactionId,
  compareArtifactSets,
  LEVEL_MILESTONES,
  type LevelMilestone,
  getAllKnownArtifactSetIds,
  getArmorFixedSetIds,
  getArmorVariableSetIds,
  getAccessorySlotsCompatibleSetIds,
} from './types'

const RANK_VALUES: readonly [1, 2, 3, 4, 5, 6] = [1, 2, 3, 4, 5, 6]
const RARITY_VALUES: readonly [1, 2, 3, 4, 5, 6] = [1, 2, 3, 4, 5, 6]

/** True when the numeric slot ID maps to an accessory (ring/amulet/banner). */
export function isAccessorySlot(slot: ArtifactTypeId): boolean {
  const numeric = Number(slot)
  return numeric === ArtifactType.Ring
    || numeric === ArtifactType.Amulet
    || numeric === ArtifactType.Banner
}

/** All three accessory slot IDs in a stable order. */
export const ACCESSORY_SLOT_IDS: readonly ArtifactTypeId[] = Object.freeze([
  ArtifactType.Ring as ArtifactTypeId,
  ArtifactType.Amulet as ArtifactTypeId,
  ArtifactType.Banner as ArtifactTypeId,
])

/**
 * True when a slot-array multi-edit patch would introduce an armor (non-accessory) slot.
 * Used by the recipe and safeguard multi-edit apply paths as the SSOT for the
 * "this patch conflicts with a faction filter on this rule" check. `remove` and `clear`
 * cannot introduce a slot; only `add`/`replace` are inspected.
 */
export function slotPatchIntroducesArmor(
  patch: { add?: readonly number[]; replace?: readonly number[] } | null | undefined,
): boolean {
  if (!patch) return false
  // `replace` overrides everything else when present — treat its contents as the new slots.
  if (patch.replace && patch.replace.length > 0) {
    return patch.replace.some((s) => !isAccessorySlot(s as ArtifactTypeId))
  }
  // Otherwise inspect additive entries.
  if (patch.add && patch.add.length > 0) {
    return patch.add.some((s) => !isAccessorySlot(s as ArtifactTypeId))
  }
  return false
}

/** True when a slot selection can include accessories (ring/amulet/banner). */
export function slotSelectionAllowsAccessories(slots?: readonly ArtifactTypeId[] | null): boolean {
  // Empty selections map to "Any slot", which still includes accessories.
  if (!Array.isArray(slots) || slots.length === 0) return true
  // Treat explicit "Any slot" tokens as accessory-capable.
  for (const slot of slots) {
    const numeric = Number(slot)
    // Ignore non-finite inputs so they cannot unlock accessories accidentally.
    if (!Number.isFinite(numeric)) continue
    // Any-slot sentinels always include accessories.
    if (numeric === GEAR_INSPECTOR_ANY_SLOT_ID) return true
    // Concrete accessory slots are the only valid carriers for no-set gear.
    if (isAccessorySlot(numeric)) return true
  }
  // If we didn't see an accessory (or Any slot), accessories are out of scope.
  return false
}

/**
 * Valid artifact set IDs for a Gear Inspector slot. Accessories allow accessory-only
 * sets plus the "no set" sentinel, while armor limits to <1000 IDs.
 */
export function allowedGearInspectorSetIds(slot: ArtifactTypeId): number[] {
  const numeric = Number(slot)
  if (numeric === GEAR_INSPECTOR_ANY_SLOT_ID) {
    // getAllKnownArtifactSetIds already includes -99 (ACCESSORY_NO_SET_ID).
    const merged = new Set<number>([
      ...getAllKnownArtifactSetIds(),
      ...getAccessorySlotsCompatibleSetIds(),
    ])
    return Array.from(merged).sort(compareArtifactSets)
  }
  if (isAccessorySlot(numeric)) {
    // getAccessorySlotsCompatibleSetIds already includes -99 (ACCESSORY_NO_SET_ID).
    const merged = new Set<number>([
      ...getAccessorySlotsCompatibleSetIds(),
    ])
    return Array.from(merged).sort(compareArtifactSets)
  }
  const armorSets = new Set<number>([
    ...getArmorFixedSetIds(),
    ...getArmorVariableSetIds(),
  ])
  return Array.from(armorSets).sort(compareArtifactSets)
}

/**
 * Normalize a raw set ID for the given slot. Falls back to the first allowed
 * value when the incoming set is missing or disallowed.
 */
export function normalizeGearInspectorSetForSlot(slot: ArtifactTypeId, setId: unknown): ArtifactSetId {
  const allowed = allowedGearInspectorSetIds(slot)
  const defaultFallback = isAccessorySlot(slot) ? ACCESSORY_NO_SET_ID : 0
  const numeric = Number(setId ?? defaultFallback)
  if (!Number.isFinite(numeric)) {
    return defaultFallback as ArtifactSetId
  }
  const safe = Math.floor(numeric)
  if (safe === 0) {
    return 0 as ArtifactSetId
  }
  if (isAccessorySlot(slot) && safe === ACCESSORY_NO_SET_ID) {
    return ACCESSORY_NO_SET_ID as ArtifactSetId
  }
  if (allowed.includes(safe)) {
    return safe as ArtifactSetId
  }
  const fallback = allowed[0]
  if (fallback != null) {
    return fallback as ArtifactSetId
  }
  return defaultFallback as ArtifactSetId
}

/**
 * Clamp a raw slot identifier to a Gear Inspector-friendly value.
 * Accepts 0 (any slot) and armor/accessory numeric IDs.
 */
export function normalizeGearInspectorSlot(value: unknown): ArtifactTypeId | null {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  const int = Math.floor(num)
  if (int === GEAR_INSPECTOR_ANY_SLOT_ID) return int as ArtifactTypeId
  if (int >= ArtifactType.Helmet && int <= ArtifactType.Banner) return int as ArtifactTypeId
  return null
}

/** Accessory slots carry faction; armor slots always force faction 0. */
export function normalizeGearInspectorFaction(slot: ArtifactTypeId, value: unknown): FactionId {
  if (!isAccessorySlot(slot)) return 0 as FactionId
  const num = Number(value)
  if (!Number.isFinite(num)) return 0 as FactionId
  const int = Math.max(0, Math.floor(num))
  return int as FactionId
}

/** Coerce unknown rank input to a 1..6 value (default fallback = 6★). */
export function coerceGearInspectorRank(value: unknown, fallback: 1 | 2 | 3 | 4 | 5 | 6 = 6): 1 | 2 | 3 | 4 | 5 | 6 {
  const num = Number(value)
  if (Number.isFinite(num)) {
    const int = Math.floor(num)
    if (RANK_VALUES.includes(int as 1 | 2 | 3 | 4 | 5 | 6)) {
      return int as 1 | 2 | 3 | 4 | 5 | 6
    }
  }
  return fallback
}

/** Coerce unknown rarity input to a 1..6 value (default fallback = 6★). */
export function coerceGearInspectorRarity(value: unknown, fallback: 1 | 2 | 3 | 4 | 5 | 6 = 6): 1 | 2 | 3 | 4 | 5 | 6 {
  const num = Number(value)
  if (Number.isFinite(num)) {
    const int = Math.floor(num)
    if (RARITY_VALUES.includes(int as 1 | 2 | 3 | 4 | 5 | 6)) {
      return int as 1 | 2 | 3 | 4 | 5 | 6
    }
  }
  return fallback
}

/** Map raw level to the nearest milestone (0/4/8/12/16). */
export function coerceGearInspectorLevel(value: unknown, fallback: LevelMilestone = LEVEL_MILESTONES[0]!): LevelMilestone {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  const minMilestone = LEVEL_MILESTONES[0] ?? fallback
  const maxMilestone = LEVEL_MILESTONES[LEVEL_MILESTONES.length - 1] ?? minMilestone
  const clamped = Math.max(minMilestone, Math.min(maxMilestone, Math.round(num)))
  let closest: LevelMilestone = fallback
  let minDiff = Number.POSITIVE_INFINITY
  for (const milestone of LEVEL_MILESTONES) {
    const diff = Math.abs(milestone - clamped)
    if (diff < minDiff) {
      closest = milestone
      minDiff = diff
    }
  }
  return closest
}

/**
 * Returns true when an improvement chance entry is the trivially-derived 100% that
 * appears for already-maxed (+16) gear. No real upgrade projection is possible for
 * maxed gear, so the UI hides this value and the filter/sort must treat it as "no data."
 */
export function isDegenerateImprovChance(chancePercent: number, artifactLevel: number): boolean {
  return chancePercent === 100 && artifactLevel >= 16
}
