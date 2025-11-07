/**
 * testerDomain.ts
 *
 * Shared helpers for Rule Tester gear entries so slot/set normalization and rank/rarity
 * coercion stay consistent across external command ingestion and the UI.
 */
import { ACCESSORY_NO_SET_ID, TESTER_ANY_SLOT_ID } from './constants'
import { artifactSetDescriptions } from './setDescriptions'
import {
  ArtifactSet,
  type ArtifactSetId,
  artifactSetNames,
  ArtifactType,
  type ArtifactTypeId,
  type FactionId,
  compareArtifactSets,
  LEVEL_MILESTONES,
  type LevelMilestone,
} from './types'

// Accessory-only sets (1000+ range) that remain valid for rings/amulets/banners.
const ACCESSORY_SET_IDS: readonly number[] = [
  ArtifactSet.Refresh,
  ArtifactSet.Cleansing,
  ArtifactSet.Bloodshield,
  ArtifactSet.Reaction,
  ArtifactSet.Revenge,
].map(Number)

// Variable-piece sets have a textual `pieces` description (e.g., 1-piece).
// They can appear on both armor and accessories, so keep them whitelisted.
const VARIABLE_PIECE_SET_IDS: readonly number[] = Object.entries(artifactSetNames)
  .filter(([, name]) => typeof artifactSetDescriptions[name]?.pieces === 'string')
  .map(([id]) => Number(id))

const ALL_SET_IDS: readonly number[] = Object.keys(artifactSetNames)
  .map(Number)
  .sort(compareArtifactSets)

const ARMOR_SET_IDS: readonly number[] = ALL_SET_IDS.filter((id) => id < 1000)

const RANK_VALUES: readonly [1, 2, 3, 4, 5, 6] = [1, 2, 3, 4, 5, 6]
const RARITY_VALUES: readonly [1, 2, 3, 4, 5, 6] = [1, 2, 3, 4, 5, 6]

/** True when the numeric slot ID maps to an accessory (ring/amulet/banner). */
export function isAccessorySlot(slot: ArtifactTypeId): boolean {
  const numeric = Number(slot)
  return numeric === ArtifactType.Ring
    || numeric === ArtifactType.Amulet
    || numeric === ArtifactType.Banner
}

/**
 * Valid artifact set IDs for a tester slot. Accessories allow accessory-only
 * sets plus the "no set" sentinel, while armor limits to <1000 IDs.
 */
export function allowedTesterSetIds(slot: ArtifactTypeId): number[] {
  const numeric = Number(slot)
  if (numeric === TESTER_ANY_SLOT_ID) {
    const merged = new Set<number>([
      ACCESSORY_NO_SET_ID,
      ...ALL_SET_IDS,
      ...ACCESSORY_SET_IDS,
      ...VARIABLE_PIECE_SET_IDS,
    ])
    return Array.from(merged).sort(compareArtifactSets)
  }
  if (isAccessorySlot(numeric)) {
    const merged = new Set<number>([
      ACCESSORY_NO_SET_ID,
      ...ACCESSORY_SET_IDS,
      ...VARIABLE_PIECE_SET_IDS,
    ])
    return Array.from(merged).sort(compareArtifactSets)
  }
  return Array.from(ARMOR_SET_IDS)
}

/**
 * Normalize a raw set ID for the given slot. Falls back to the first allowed
 * value when the incoming set is missing or disallowed.
 */
export function normalizeTesterSetForSlot(slot: ArtifactTypeId, setId: unknown): ArtifactSetId {
  const allowed = allowedTesterSetIds(slot)
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
 * Clamp a raw slot identifier to a tester-friendly value.
 * Accepts 0 (any slot) and armor/accessory numeric IDs.
 */
export function normalizeTesterSlot(value: unknown): ArtifactTypeId | null {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  const int = Math.floor(num)
  if (int === TESTER_ANY_SLOT_ID) return int as ArtifactTypeId
  if (int >= ArtifactType.Helmet && int <= ArtifactType.Banner) return int as ArtifactTypeId
  return null
}

/** Accessory slots carry faction; armor slots always force faction 0. */
export function normalizeTesterFaction(slot: ArtifactTypeId, value: unknown): FactionId {
  if (!isAccessorySlot(slot)) return 0 as FactionId
  const num = Number(value)
  if (!Number.isFinite(num)) return 0 as FactionId
  const int = Math.max(0, Math.floor(num))
  return int as FactionId
}

/** Coerce unknown rank input to a 1..6 value (default fallback = 6★). */
export function coerceTesterRank(value: unknown, fallback: 1 | 2 | 3 | 4 | 5 | 6 = 6): 1 | 2 | 3 | 4 | 5 | 6 {
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
export function coerceTesterRarity(value: unknown, fallback: 1 | 2 | 3 | 4 | 5 | 6 = 6): 1 | 2 | 3 | 4 | 5 | 6 {
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
export function coerceTesterLevel(value: unknown, fallback: LevelMilestone = LEVEL_MILESTONES[0]!): LevelMilestone {
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
