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
  getArtifactFixedSetIds,
  getArtifactVariableSetIds,
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
 * True when a slot-array multi-edit patch would introduce an artifact (non-accessory) slot.
 * Used by the recipe and safeguard multi-edit apply paths as the SSOT for the
 * "this patch conflicts with a faction filter on this rule" check. `remove` and `clear`
 * cannot introduce a slot; only `add`/`replace` are inspected.
 */
export function slotPatchIntroducesArtifact(
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
 * sets plus the "no set" sentinel, while artifact limits to <1000 IDs.
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
  const artifactSets = new Set<number>([
    ...getArtifactFixedSetIds(),
    ...getArtifactVariableSetIds(),
  ])
  return Array.from(artifactSets).sort(compareArtifactSets)
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
 * Accepts 0 (any slot) and artifact/accessory numeric IDs.
 */
export function normalizeGearInspectorSlot(value: unknown): ArtifactTypeId | null {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  const int = Math.floor(num)
  if (int === GEAR_INSPECTOR_ANY_SLOT_ID) return int as ArtifactTypeId
  if (int >= ArtifactType.Helmet && int <= ArtifactType.Banner) return int as ArtifactTypeId
  return null
}

/** Accessory slots carry faction; artifact slots always force faction 0. */
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

// The legal ends of the upgrade range, read off the milestone table rather than written as
// 0 and 16. Both clamps below share them, so raising the cap is one edit to that table.
const LOWEST_LEVEL = LEVEL_MILESTONES[0]!
const HIGHEST_LEVEL = LEVEL_MILESTONES[LEVEL_MILESTONES.length - 1]!

/**
 * A raw level as an EXACT in-range upgrade level (0..16) — rounded and clamped, not banded.
 *
 * The companion to `coerceGearInspectorLevel`: that one answers "which rule band?", this one
 * answers "what does the player actually see?". Gear DB import, preview artifacts, the rule
 * templates and both grid/detail labels all need the second question, and each used to spell
 * the same `Math.max(0, Math.min(16, Math.round(x)))` out for itself with the bounds hardcoded
 * — five copies that a raised level cap would have to find and change in lockstep.
 *
 * Returns null for anything non-numeric, which is how every caller distinguishes "no exact
 * level recorded" (custom entries) from a real +0.
 */
export function coerceExactGearLevel(value: unknown): number | null {
  // null/'' must NOT become +0. Number() reads both as 0, and "no exact level recorded" is a
  // real state here (custom entries, DB rows with an empty lvl), so reject them up front
  // rather than letting the clamp invent an upgrade state nobody entered.
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.max(LOWEST_LEVEL, Math.min(HIGHEST_LEVEL, Math.round(num)))
}

/**
 * The level a gear card should SHOW: the exact upgrade level when one was recorded, and the
 * band label ("12-15") otherwise.
 *
 * The grid card and the detail row both make this call, and both used to spell out the same
 * three steps — the finite check, the clamp, and the fall back to the band label. Sharing it
 * is what stops the two views disagreeing about the same piece, which is exactly the bug a
 * reader would never think to look for.
 *
 * `bandLabel` is passed in (already localized/formatted by the caller) so this module stays
 * free of the formatting layer.
 */
export function resolveGearLevelLabel(exactLevel: unknown, bandLabel: string): string {
  const exact = coerceExactGearLevel(exactLevel)
  return exact === null ? bandLabel : String(exact)
}

/**
 * Map a raw level onto the milestone whose BAND it is in (0-3, 4-7, 8-11, 12-15, 16).
 *
 * The milestones are range boundaries, not points to round to — `LevelRange` names them
 * `{ min, max }`, and a rule saying "+12 to +16" means a piece has REACHED +12. Snapping to
 * the nearest instead promoted the top of every band: a +15 was judged as +16, so "keep only
 * +16" kept gear that is not +16 and "sell below +16" spared it. Levels 3, 7, 11 and 15 are
 * the affected ones — 74 of 76,309 pieces across the sample accounts.
 *
 * So: floor to the band, and clamp outside the range (a bad row carrying 32764 exists in
 * real data and must read as +16, not overflow past it). The clamp is the shared
 * `coerceExactGearLevel` — one definition of "a legal upgrade level" for both readings.
 *
 * `fallback` applies ONLY to a non-numeric input. Once a level is in range it always lands
 * in a band (the lowest milestone is the bottom of the clamp), so there is no second path
 * the fallback could take.
 */
export function coerceGearInspectorLevel(value: unknown, fallback: LevelMilestone = LOWEST_LEVEL): LevelMilestone {
  const clamped = coerceExactGearLevel(value)
  if (clamped === null) return fallback
  // The highest milestone at or below the level: its band. Guaranteed to find one, since
  // the clamp above already floored the value to LEVEL_MILESTONES[0].
  let band: LevelMilestone = LOWEST_LEVEL
  for (const milestone of LEVEL_MILESTONES) {
    if (milestone <= clamped) band = milestone
  }
  return band
}

/**
 * Returns true when an improvement chance entry is the trivially-derived 100% that
 * appears for already-maxed (+16) gear. No real upgrade projection is possible for
 * maxed gear, so the UI hides this value and the filter/sort must treat it as "no data."
 */
export function isDegenerateImprovChance(chancePercent: number, artifactLevel: number): boolean {
  return chancePercent === 100 && artifactLevel >= 16
}
