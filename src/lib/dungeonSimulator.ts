/**
 * dungeonSimulator.ts
 *
 * Dungeon drop simulation helpers for the Logic Hub Dungeon tab.
 * Keeps all drop tables and simulation logic centralized (SSOT).
 */
import { ACCESSORY_NO_SET_ID } from './constants'
import { evaluateFirst, type TestItem } from './ruleEval'
import type { HsfRuleWithRecipe } from './merge'
import { ALLOWED_MAIN_BY_SLOT, ALLOWED_SUB_BY_SLOT, ArtifactSet, ArtifactType, Faction, StatVariant, type ArtifactSetId, type ArtifactTypeId, type FactionId, type LevelMilestone, type RankValue } from './types'
import { isAccessorySlot } from './gearInspectorDomain'
import { substatMatchesMainVariant } from './statCompatibility'
import { baseMinForStarV } from './hsfBuilder'
import type { SubstatTargetTable } from './hsfBuilder/types'

// Simulation milestone levels mirror the builder + preview milestones.
export const DUNGEON_SIM_LEVELS: readonly LevelMilestone[] = [0, 4, 8, 12, 16] as const
// Default milestone for collapsed tables uses the final roll checkpoint.
export const DUNGEON_SIM_DEFAULT_LEVEL: LevelMilestone = (
  DUNGEON_SIM_LEVELS[DUNGEON_SIM_LEVELS.length - 1] as LevelMilestone
)
// Fixed run count per dungeon stage keeps variance stable and predictable.
export const DUNGEON_SIM_RUNS_PER_DUNGEON = 100000 as const
// Fallback run count keeps the main thread responsive when workers are unavailable.
export const DUNGEON_SIM_FALLBACK_RUNS_PER_DUNGEON = 500 as const
// Chunk size controls how often we stream partial results from the simulator.
export const DUNGEON_SIM_BATCH_SIZE = 250 as const

export type DungeonStageMode = 'normal' | 'hard'
export type DungeonStageSelection = {
  mode: DungeonStageMode
  stage: number
}

// Default stage selection for fallback weights (Normal 20 keeps the legacy baseline).
export const DUNGEON_STAGE_DEFAULT_SELECTION: DungeonStageSelection = {
  mode: 'normal',
  stage: 20,
}

// Valid stage ranges by mode keep UI and simulation aligned.
export const DUNGEON_STAGE_RANGE_BY_MODE: Record<DungeonStageMode, { min: number; max: number }> = {
  normal: { min: 1, max: 25 },
  hard: { min: 1, max: 10 },
}

// Simulation modes control whether we stop rolling items that would be sold early.
export type DungeonSimMode = 'snapshot' | 'levelUp'
// Supported modes are listed for UI toggles and validation.
export const DUNGEON_SIM_MODES: readonly DungeonSimMode[] = ['levelUp', 'snapshot'] as const
// Default to level-up to match in-game rolling behavior.
export const DUNGEON_SIM_MODE_DEFAULT: DungeonSimMode = 'levelUp'

export type EventSpotlightSelection = 'pinpoint' | 'chronophage'

export const EVENT_SPOTLIGHT_DEFAULT: EventSpotlightSelection = 'chronophage'
export const EVENT_SPOTLIGHT_OPTIONS: readonly EventSpotlightSelection[] = ['chronophage', 'pinpoint'] as const

export type DungeonId = 'iceGolem' | 'fireKnight' | 'dragon' | 'spider' | 'event'
export type DungeonBoostableId = Exclude<DungeonId, 'spider' | 'event'>
export type DungeonBoostMode = 'off' | '2x' | '3x'
export type DungeonBoostSelection = {
  mode: DungeonBoostMode
  setId: ArtifactSetId | null
}

// Boosted-set controls only apply to the core artifact dungeons.
export const DUNGEON_BOOSTABLE_IDS: readonly DungeonBoostableId[] = [
  'fireKnight',
  'dragon',
  'iceGolem',
] as const
// Expose supported boost options for UI toggles.
export const DUNGEON_BOOST_MODES: readonly DungeonBoostMode[] = ['off', '2x', '3x'] as const
// Default boost selection keeps the drop pool uniform.
export const DUNGEON_BOOST_DEFAULT: DungeonBoostSelection = { mode: 'off', setId: null }

// Provide a stable default per dungeon so storage always has a baseline.
export const resolveDungeonBoostDefault = (_dungeonId: DungeonBoostableId): DungeonBoostSelection => (
  { ...DUNGEON_BOOST_DEFAULT }
)

// Preferred boosted set for each dungeon when enabling 2×/3×.
export const resolveDefaultBoostSet = (dungeonId: DungeonBoostableId): ArtifactSetId => {
  if (dungeonId === 'fireKnight') return ArtifactSet.Savage
  if (dungeonId === 'dragon') return ArtifactSet.Speed
  return ArtifactSet.Reflex
}

// Type guard for boostable dungeons keeps runtime logic safe.
export const isBoostableDungeon = (dungeonId: DungeonId): dungeonId is DungeonBoostableId => (
  DUNGEON_BOOSTABLE_IDS.includes(dungeonId as DungeonBoostableId)
)

// Event dungeons are normal-only with stages 1..30.
export const EVENT_STAGE_RANGE = { min: 1, max: 30 } as const
// Event stages 26..30 map to Hard 1..10 when we need hard-mode weights.
const EVENT_HARD_EQUIV_RANGE = { min: 26, max: 30 } as const

// Default stage selections per dungeon (UI + persistence).
export const DUNGEON_STAGE_DEFAULTS_BY_DUNGEON: Record<DungeonId, DungeonStageSelection> = {
  iceGolem: { mode: 'hard', stage: 10 },
  fireKnight: { mode: 'hard', stage: 10 },
  dragon: { mode: 'hard', stage: 10 },
  spider: { mode: 'hard', stage: 10 },
  event: { mode: 'normal', stage: 30 },
} as const

// Resolve the default stage selection for a specific dungeon.
export const resolveDungeonStageDefault = (dungeonId: DungeonId): DungeonStageSelection => (
  DUNGEON_STAGE_DEFAULTS_BY_DUNGEON[dungeonId] ?? DUNGEON_STAGE_DEFAULT_SELECTION
)

// Resolve the valid stage range for a dungeon + mode combo.
export const resolveDungeonStageRange = (dungeonId: DungeonId, mode: DungeonStageMode): { min: number; max: number } => {
  if (dungeonId === 'event') return EVENT_STAGE_RANGE
  return DUNGEON_STAGE_RANGE_BY_MODE[mode]
}

// Stable ordering for UI rendering and seed hashing.
export const DUNGEON_IDS: readonly DungeonId[] = [
  'fireKnight',
  'dragon',
  'iceGolem',
  'spider',
  'event',
] as const

// Dungeon -> set catalog (static dungeons only; Event is resolved dynamically).
const DUNGEON_SETS: Record<Exclude<DungeonId, 'event'>, readonly ArtifactSetId[]> = {
  iceGolem: [
    ArtifactSet.Life,
    ArtifactSet.Defense,
    ArtifactSet.Resistance,
    ArtifactSet.Offense,
    ArtifactSet.CriticalRate,
    ArtifactSet.Retaliation,
    ArtifactSet.Reflex,
    ArtifactSet.Cursed,
    ArtifactSet.Provoke,
  ],
  fireKnight: [
    ArtifactSet.Frenzy,
    ArtifactSet.Stun,
    ArtifactSet.Immunity,
    ArtifactSet.Savage,
    ArtifactSet.Regeneration,
    ArtifactSet.Fury,
    ArtifactSet.Curing,
    ArtifactSet.CritDamage,
    ArtifactSet.Shield,
  ],
  dragon: [
    ArtifactSet.Frost,
    ArtifactSet.Toxic,
    ArtifactSet.Daze,
    ArtifactSet.Avenging,
    ArtifactSet.Stalwart,
    ArtifactSet.Accuracy,
    ArtifactSet.Speed,
    ArtifactSet.Lifesteal,
    ArtifactSet.Destroy,
  ],
  spider: [ACCESSORY_NO_SET_ID as ArtifactSetId],
} as const

// Resolve the boostable set options for a dungeon.
export const resolveBoostableSets = (dungeonId: DungeonBoostableId): readonly ArtifactSetId[] => (
  DUNGEON_SETS[dungeonId]
)

// Normalize a boost selection so only valid sets + modes survive.
export const normalizeDungeonBoostSelection = (
  dungeonId: DungeonBoostableId,
  raw: unknown,
  fallback?: DungeonBoostSelection,
): DungeonBoostSelection => {
  // Default to the provided fallback or the baseline boost-off state.
  const base = fallback ?? resolveDungeonBoostDefault(dungeonId)
  if (!raw || typeof raw !== 'object') return { ...base }
  const candidate = raw as Partial<DungeonBoostSelection>
  // Clamp the mode to supported values.
  const mode: DungeonBoostMode = DUNGEON_BOOST_MODES.includes(candidate.mode as DungeonBoostMode)
    ? candidate.mode as DungeonBoostMode
    : base.mode
  // Valid boosted sets come from the dungeon's set pool.
  const options = resolveBoostableSets(dungeonId)
  const rawSet = Number(candidate.setId)
  if (mode === 'off') {
    return { mode, setId: null }
  }
  if (Number.isFinite(rawSet) && options.some((setId) => Number(setId) === rawSet)) {
    return { mode, setId: rawSet as ArtifactSetId }
  }
  return {
    mode,
    setId: resolveDefaultBoostSet(dungeonId) ?? options[0] ?? null,
  }
}

// Event spotlight can swap between the two 9-piece sets.
const EVENT_SPOTLIGHT_SET_BY_KEY: Record<EventSpotlightSelection, ArtifactSetId> = {
  pinpoint: ArtifactSet.Pinpoint,
  chronophage: ArtifactSet.Chronophage,
}

// Resolve the ArtifactSet id for the selected event spotlight.
export const resolveEventSpotlightSet = (spotlight: EventSpotlightSelection): ArtifactSetId => (
  EVENT_SPOTLIGHT_SET_BY_KEY[spotlight]
)

// Event non-spotlight pool is the currently featured 4-piece sets.
const EVENT_NON_SPOTLIGHT_SETS: readonly ArtifactSetId[] = [
  ArtifactSet.CriticalRate,
  ArtifactSet.Accuracy,
  ArtifactSet.Curing,
  ArtifactSet.Daze,
  ArtifactSet.CritDamage,
] as const

// Resolve the visible set columns for a dungeon (Event depends on spotlight).
export const resolveDungeonSets = (
  dungeonId: DungeonId,
  spotlight: EventSpotlightSelection,
): readonly ArtifactSetId[] => {
  if (dungeonId !== 'event') return DUNGEON_SETS[dungeonId]
  const spotlightSet = resolveEventSpotlightSet(spotlight)
  const combined = [
    spotlightSet,
    ...EVENT_NON_SPOTLIGHT_SETS,
  ]
  // De-dupe defensively in case rotations overlap in the future.
  return Array.from(new Set(combined))
}

// Artifact slots drop in the three artifact dungeons.
const ARTIFACT_SLOTS: readonly ArtifactTypeId[] = [
  ArtifactType.Weapon,
  ArtifactType.Helmet,
  ArtifactType.Shield,
  ArtifactType.Gauntlets,
  ArtifactType.Chestplate,
  ArtifactType.Boots,
] as const

// Spider drops accessories only (ring/amulet/banner).
const ACCESSORY_SLOTS: readonly ArtifactTypeId[] = [
  ArtifactType.Ring,
  ArtifactType.Amulet,
  ArtifactType.Banner,
] as const

// Resolve which slots can drop for a given dungeon (UI helpers need this too).
export const resolveDungeonSlotIds = (dungeonId: DungeonId): readonly ArtifactTypeId[] => {
  if (dungeonId === 'spider') return ACCESSORY_SLOTS
  if (dungeonId === 'event') return [...ARTIFACT_SLOTS, ...ACCESSORY_SLOTS]
  return ARTIFACT_SLOTS
}

// Accessory faction pool is uniform across valid factions.
const ACCESSORY_FACTIONS: readonly FactionId[] = [
  Faction.BannerLords,
  Faction.HighElves,
  Faction.SacredOrder,
  Faction.Barbarians,
  Faction.OgrynTribes,
  Faction.Lizardmen,
  Faction.Skinwalkers,
  Faction.Orcs,
  Faction.Demonspawn,
  Faction.UndeadHordes,
  Faction.DarkElves,
  Faction.KnightRevenant,
  Faction.Dwarves,
  Faction.Shadowkin,
  Faction.SylvanWatchers,
  Faction.Argonites,
] as const

// Stage-specific rank distribution for normal dungeons (stage 1..25).
// Sourced from docs/Dungeons_LootTable_DropRates.jpg (Ayumilove table).
const NORMAL_RANK_WEIGHTS_BY_STAGE: Record<number, readonly number[]> = {
  1: [60, 40, 0, 0, 0, 0],
  2: [30, 60, 10, 0, 0, 0],
  3: [0, 45, 55, 0, 0, 0],
  4: [0, 15, 60, 25, 0, 0],
  5: [0, 0, 58, 42, 0, 0],
  6: [0, 0, 50, 50, 0, 0],
  7: [0, 0, 34.5, 53, 12.5, 0],
  8: [0, 0, 27, 55, 18, 0],
  9: [0, 0, 20, 57, 23, 0],
  10: [0, 0, 0, 69, 31, 0],
  11: [0, 0, 0, 60, 40, 0],
  12: [0, 0, 0, 55, 45, 0],
  13: [0, 0, 0, 45, 50, 5],
  14: [0, 0, 0, 40, 54, 6],
  15: [0, 0, 0, 36, 56.5, 7.5],
  16: [0, 0, 0, 39.8, 52.03, 8.17],
  17: [0, 0, 0, 33.01, 56.55, 10.44],
  18: [0, 0, 0, 25.2, 61.6, 13.2],
  19: [0, 0, 0, 19.9, 62.3, 17.8],
  20: [0, 0, 0, 0, 73, 27],
  21: [0, 0, 0, 0, 72, 28],
  22: [0, 0, 0, 0, 71, 29],
  23: [0, 0, 0, 0, 70, 30],
  24: [0, 0, 0, 0, 69, 31],
  25: [0, 0, 0, 0, 68, 32],
}

// Stage-specific rarity distribution for normal dungeons (stage 1..25).
// Rarity = Rare/Epic/Legendary only; Epic is derived by difference.
const NORMAL_RARITY_WEIGHTS_BY_STAGE: Record<number, readonly number[]> = (() => {
  const out: Record<number, readonly number[]> = {}
  const rareByStage = [
    80, 80, 80, 80, 80,
    79, 79, 79, 79, 79,
    77, 77, 77, 77, 77,
    70, 70, 70, 70,
    67.5,
    62, 62,
    57.5, 57.5,
    55,
  ]
  const legendaryByStage = [
    1, 1, 1, 1, 1,
    1.5, 1.5, 1.5, 1.5, 1.5,
    3, 3, 3, 3, 3,
    5, 5, 5, 5,
    7.5,
    9, 10, 11, 12, 13,
  ]
  for (let i = 0; i < 25; i += 1) {
    const stage = i + 1
    const rare = rareByStage[i] ?? 0
    const legendary = legendaryByStage[i] ?? 0
    const epic = Math.max(0, 100 - rare - legendary)
    out[stage] = [0, 0, rare, epic, legendary, 0]
  }
  return out
})()

// Stage-specific rank distribution for hard dungeons (stage 1..10).
// Sourced from docs/Dungeons_LootTable_DropRates_Hard.jpg.
const HARD_RANK_WEIGHTS_BY_STAGE: Record<number, readonly number[]> = {
  1: [0, 0, 0, 0, 68, 32],
  2: [0, 0, 0, 0, 67.92, 32.08],
  3: [0, 0, 0, 0, 67.2, 32.8],
  4: [0, 0, 0, 0, 66.8, 33.2],
  5: [0, 0, 0, 0, 68.09, 31.91],
  6: [0, 0, 0, 0, 65.2, 34.8],
  7: [0, 0, 0, 0, 65.8, 34.2],
  8: [0, 0, 0, 0, 66.4, 33.6],
  9: [0, 0, 0, 0, 67, 33],
  10: [0, 0, 0, 0, 68, 32],
}

// Stage-specific rarity distribution for hard dungeons (stage 1..10).
// Rarity order = Rare/Epic/Legendary/Mythical (Hard includes Mythical).
const HARD_RARITY_WEIGHTS_BY_STAGE: Record<number, readonly number[]> = {
  1: [0, 0, 54, 32, 13.5, 0.5],
  2: [0, 0, 46.88, 33.34, 18.75, 1.04],
  3: [0, 0, 52, 32, 14.5, 1.5],
  4: [0, 0, 51, 32, 15, 2],
  5: [0, 0, 46.15, 32.82, 18.46, 2.57],
  6: [0, 0, 49, 32, 16, 3],
  7: [0, 0, 48, 32, 16.5, 3.5],
  8: [0, 0, 47, 32, 17, 4],
  9: [0, 0, 46, 32, 17.5, 4.5],
  10: [0, 0, 45, 32, 18, 5],
}

// Default weights for stages outside the table (fallback keeps calls typed).
const DEFAULT_NORMAL_RANK_WEIGHTS: readonly number[] = NORMAL_RANK_WEIGHTS_BY_STAGE[DUNGEON_STAGE_DEFAULT_SELECTION.stage] ?? [0, 0, 0, 0, 0, 0]
const DEFAULT_NORMAL_RARITY_WEIGHTS: readonly number[] = NORMAL_RARITY_WEIGHTS_BY_STAGE[DUNGEON_STAGE_DEFAULT_SELECTION.stage] ?? [0, 0, 0, 0, 0, 0]
const DEFAULT_HARD_RANK_WEIGHTS: readonly number[] = HARD_RANK_WEIGHTS_BY_STAGE[1] ?? [0, 0, 0, 0, 0, 0]
const DEFAULT_HARD_RARITY_WEIGHTS: readonly number[] = HARD_RARITY_WEIGHTS_BY_STAGE[1] ?? [0, 0, 0, 0, 0, 0]

// Spider accessory type weights at stage 20+ are equal (rings/amulets/banners).
const ACCESSORY_TYPE_WEIGHTS_EQUAL: readonly number[] = [1, 1, 1]

// Dungeon drop mode determines whether artifacts, accessories, or both can appear.
type DungeonDropKind = 'artifact' | 'accessory' | 'mixed'

// Drop kinds are single-source-of-truth for the dungeon simulator.
const DUNGEON_DROP_KIND: Record<DungeonId, DungeonDropKind> = {
  iceGolem: 'artifact',
  fireKnight: 'artifact',
  dragon: 'artifact',
  spider: 'accessory',
  event: 'mixed',
}

type EventDropRates = {
  spotlight: number
  accessories: number
  nonSpotlight: number
  sixStar: number
}

// Event dungeon anchor rates from docs/EventDungeonDropRate.jpg.
const EVENT_DROP_ANCHORS: readonly (EventDropRates & { stage: number })[] = [
  { stage: 20, spotlight: 10.5, accessories: 28, nonSpotlight: 61.5, sixStar: 28 },
  { stage: 24, spotlight: 11, accessories: 29, nonSpotlight: 60, sixStar: 35.8 },
  { stage: 30, spotlight: 10, accessories: 40, nonSpotlight: 50, sixStar: 38 },
] as const

// Clamp helpers keep interpolated values within sane bounds.
const clampNumber = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

// Linear interpolation utility for numeric anchors.
const lerp = (start: number, end: number, t: number): number => start + (end - start) * t

// Map a hard stage (1..10) onto the event-only hard-equivalent window (26..30).
const mapHardStageToEventStage = (hardStage: number): number => {
  const hardRange = DUNGEON_STAGE_RANGE_BY_MODE.hard
  const denom = Math.max(1, hardRange.max - hardRange.min)
  const ratio = clampNumber((hardStage - hardRange.min) / denom, 0, 1)
  return EVENT_HARD_EQUIV_RANGE.min + ratio * (EVENT_HARD_EQUIV_RANGE.max - EVENT_HARD_EQUIV_RANGE.min)
}

// Map an event stage (26..30) back onto a hard stage scale (1..10).
const mapEventStageToHardStage = (eventStage: number): number => {
  const denom = Math.max(1, EVENT_HARD_EQUIV_RANGE.max - EVENT_HARD_EQUIV_RANGE.min)
  const ratio = clampNumber((eventStage - EVENT_HARD_EQUIV_RANGE.min) / denom, 0, 1)
  return DUNGEON_STAGE_RANGE_BY_MODE.hard.min + ratio * (DUNGEON_STAGE_RANGE_BY_MODE.hard.max - DUNGEON_STAGE_RANGE_BY_MODE.hard.min)
}

// Interpolate event drop rates across known stage anchors (clamped to anchor bounds).
const interpolateEventRates = (stage: number): EventDropRates => {
  const anchors = EVENT_DROP_ANCHORS
  const first = anchors[0]
  const last = anchors[anchors.length - 1]
  if (!first || !last) return { spotlight: 0, accessories: 0, nonSpotlight: 0, sixStar: 0 }
  if (stage <= first.stage) return { ...first }
  if (stage >= last.stage) return { ...last }
  let lower = first
  let upper = last
  for (let i = 1; i < anchors.length; i += 1) {
    const next = anchors[i]
    if (!next) continue
    if (stage <= next.stage) {
      upper = next
      lower = anchors[i - 1] ?? next
      break
    }
  }
  const span = upper.stage - lower.stage
  const t = span <= 0 ? 0 : clampNumber((stage - lower.stage) / span, 0, 1)
  const spotlight = lerp(lower.spotlight, upper.spotlight, t)
  const accessories = lerp(lower.accessories, upper.accessories, t)
  const nonSpotlight = lerp(lower.nonSpotlight, upper.nonSpotlight, t)
  const sixStar = clampNumber(lerp(lower.sixStar, upper.sixStar, t), 0, 100)
  const total = spotlight + accessories + nonSpotlight
  const scale = total > 0 ? 100 / total : 1
  return {
    spotlight: spotlight * scale,
    accessories: accessories * scale,
    nonSpotlight: nonSpotlight * scale,
    sixStar,
  }
}

// Normalize a stage selection against dungeon-specific defaults/ranges.
export const normalizeDungeonStageSelection = (
  dungeonId: DungeonId,
  selection?: Partial<DungeonStageSelection> | null,
  fallback?: DungeonStageSelection,
): DungeonStageSelection => {
  // Default to the per-dungeon fallback when inputs are missing.
  const resolvedFallback = fallback ?? resolveDungeonStageDefault(dungeonId)
  // Stage values are always coerced to numbers before clamping.
  const rawStage = Number(selection?.stage ?? resolvedFallback.stage)
  if (dungeonId === 'event') {
    // Event has no hard mode; map any stored hard stage into 26..30.
    const stageSeed = selection?.mode === 'hard'
      ? mapHardStageToEventStage(Number.isNaN(rawStage) ? resolvedFallback.stage : rawStage)
      : (Number.isNaN(rawStage) ? resolvedFallback.stage : rawStage)
    // Clamp to the event-only 1..30 range.
    const stage = clampNumber(stageSeed, EVENT_STAGE_RANGE.min, EVENT_STAGE_RANGE.max)
    return { mode: 'normal', stage: Math.round(stage) }
  }
  // For standard dungeons, honor the selected mode if present.
  const rawMode = selection?.mode
  const mode: DungeonStageMode = rawMode === 'hard' || rawMode === 'normal'
    ? rawMode
    : (resolvedFallback.mode ?? 'normal')
  // Clamp stages to the mode-specific range.
  const range = DUNGEON_STAGE_RANGE_BY_MODE[mode]
  const stage = clampNumber(Number.isNaN(rawStage) ? resolvedFallback.stage : rawStage, range.min, range.max)
  return { mode, stage: Math.round(stage) }
}

// Rarity -> starting substat count.
const SUBSTAT_START_COUNT: Record<number, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 4,
}

// Rarity -> levels where a NEW substat is added (not rolled).
const SUBSTAT_ADD_LEVELS: Record<number, readonly LevelMilestone[]> = {
  1: [4, 8, 12, 16],
  2: [8, 12, 16],
  3: [12, 16],
  4: [16],
  5: [],
  6: [],
}

// Rarity -> pre-roll count at level 0 (Mythical only).
const SUBSTAT_PRE_ROLLS: Record<number, number> = {
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
  6: 1,
}

// Compact seed hashing for deterministic RNG per dungeon/set.
const hashSeed = (input: string): number => {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

// Mulberry32 RNG keeps output deterministic across sessions.
const createRng = (seed: number) => {
  let t = seed >>> 0
  return () => {
    t += 0x6D2B79F5
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

// Weighted choice helper (weights can be any non-negative numbers).
const pickWeightedIndex = (rng: () => number, weights: readonly number[]): number => {
  let total = 0
  for (const w of weights) total += Math.max(0, w)
  if (total <= 0) return 0
  let roll = rng() * total
  for (let i = 0; i < weights.length; i += 1) {
    roll -= Math.max(0, weights[i] ?? 0)
    if (roll <= 0) return i
  }
  return Math.max(0, weights.length - 1)
}

// Weighted pick for lists with matching weight entries.
const pickWeighted = <T,>(rng: () => number, list: readonly T[], weights: readonly number[]): T => {
  const idx = pickWeightedIndex(rng, weights)
  return list[Math.max(0, Math.min(list.length - 1, idx))]!
}

// Uniform pick for a non-empty list.
const pickUniform = <T,>(rng: () => number, list: readonly T[]): T => {
  const idx = Math.floor(rng() * list.length)
  return list[Math.max(0, Math.min(list.length - 1, idx))]!
}

// Remove a random entry from a mutable pool.
const pullRandom = <T,>(rng: () => number, pool: T[]): T => {
  const idx = Math.floor(rng() * pool.length)
  const safe = Math.max(0, Math.min(pool.length - 1, idx))
  const value = pool[safe]!
  pool.splice(safe, 1)
  return value
}

// Build the rank weights for a stage in the selected mode.
const rankWeightsForStage = (mode: DungeonStageMode, stage: number): readonly number[] => {
  if (mode === 'hard') return HARD_RANK_WEIGHTS_BY_STAGE[stage] ?? DEFAULT_HARD_RANK_WEIGHTS
  return NORMAL_RANK_WEIGHTS_BY_STAGE[stage] ?? DEFAULT_NORMAL_RANK_WEIGHTS
}

// Build the rarity weights for a stage in the selected mode.
const rarityWeightsForStage = (mode: DungeonStageMode, stage: number): readonly number[] => {
  if (mode === 'hard') return HARD_RARITY_WEIGHTS_BY_STAGE[stage] ?? DEFAULT_HARD_RARITY_WEIGHTS
  return NORMAL_RARITY_WEIGHTS_BY_STAGE[stage] ?? DEFAULT_NORMAL_RARITY_WEIGHTS
}

// Interpolate two weight rows so fractional stages can blend smoothly.
const interpolateWeightTable = (
  table: Record<number, readonly number[]>,
  stage: number,
  fallback: readonly number[],
): readonly number[] => {
  const lowerStage = Math.floor(stage)
  const upperStage = Math.ceil(stage)
  const lower = table[lowerStage] ?? fallback
  const upper = table[upperStage] ?? lower
  if (lowerStage === upperStage) return lower
  const t = clampNumber(stage - lowerStage, 0, 1)
  const length = Math.max(lower.length, upper.length, fallback.length)
  const blended: number[] = []
  for (let i = 0; i < length; i += 1) {
    const start = lower[i] ?? fallback[i] ?? 0
    const end = upper[i] ?? start
    blended.push(lerp(start, end, t))
  }
  return blended
}

// Event rarity weights follow normal tables up to stage 25, then blend hard tables for 26..30.
const eventRarityWeightsForStage = (stage: number): readonly number[] => {
  if (stage <= 25) return rarityWeightsForStage('normal', stage)
  const hardStage = mapEventStageToHardStage(stage)
  return interpolateWeightTable(HARD_RARITY_WEIGHTS_BY_STAGE, hardStage, DEFAULT_HARD_RARITY_WEIGHTS)
}

// Spider accessory type weights for the current stage.
const accessoryTypeWeightsForStage = (stage: number): readonly number[] => {
  // Stage 12+ uses equal accessory odds; earlier stages fall back to equal for now.
  if (stage >= 12) return ACCESSORY_TYPE_WEIGHTS_EQUAL
  return ACCESSORY_TYPE_WEIGHTS_EQUAL
}

// Per-level breakdown entry for slot + main stat.
export type DungeonSimBreakdown = {
  slot: ArtifactTypeId
  main: StatVariant
  kept: number
  total: number
}

// Detail item for substat-specific queries (stored per drop).
export type DungeonSimDetailItem = {
  slot: ArtifactTypeId
  main: StatVariant
  // Initial substat variants at level 0.
  startVariants: StatVariant[]
  // Index of the mythical pre-roll target (or -1 when none).
  preRollIndex: number
  // Milestone events: positive = add stat variant, negative = roll index (-index-1).
  events: number[]
  // Highest milestone reached before selling (snapshot mode always reaches +16).
  maxLevel: LevelMilestone
}

export type DungeonSimDetailQuery = {
  dungeonId: DungeonId
  spotlight: EventSpotlightSelection
  setId: ArtifactSetId
  level: LevelMilestone
  slot: ArtifactTypeId
  main: StatVariant
  substats: StatVariant[]
}

export type DungeonSimDetailStats = {
  total: number
  presentAtLeast: number[]
  rollsAtLeast: number[]
  allSelected: number
}

export type DungeonSimGenericQuery = {
  dungeonId: DungeonId
  spotlight: EventSpotlightSelection
  setId: ArtifactSetId
  level: LevelMilestone
  slot: ArtifactTypeId
  main: StatVariant
}

export type DungeonSimGenericStats = {
  total: number
  // Probability that a specific set of 1/2/3/4 substats appears (0..1).
  specificAtLeast: number[]
}

// Cell result for a single set + level.
export type DungeonSimCell = {
  total: number
  kept: number
  breakdown: DungeonSimBreakdown[]
}

// Per-set results keyed by level milestone.
export type DungeonSimSetResults = {
  levels: Record<LevelMilestone, DungeonSimCell>
  summary: DungeonSimCell
}

// Per-dungeon results keyed by set id.
export type DungeonSimDungeonResults = Record<ArtifactSetId, DungeonSimSetResults>

// Full simulator output keyed by dungeon id.
export type DungeonSimResults = Record<DungeonId, DungeonSimDungeonResults>

// Progress snapshot for streaming dungeon simulation updates.
export type DungeonSimProgress = {
  completed: number
  total: number
  completedByDungeon: Record<DungeonId, number>
  runsPerDungeon: number
}

// Streaming session for dungeon simulation (supports incremental batches).
export type DungeonSimSession = {
  runBatch: (batchRuns: number, dungeonIds?: DungeonId[]) => void
  getResults: () => DungeonSimResults
  getProgress: () => DungeonSimProgress
  isComplete: () => boolean
}

// Results and progress keyed by spotlight so the event toggle can swap instantly.
export type DungeonSimSpotlightResults = Record<EventSpotlightSelection, DungeonSimResults>
export type DungeonSimSpotlightProgress = Record<EventSpotlightSelection, DungeonSimProgress>

// Streaming session for dungeon simulation with both spotlight sets precomputed.
export type DungeonSimSpotlightSession = {
  runBatch: (batchRuns: number, dungeonIds?: DungeonId[]) => void
  getResultsBySpotlight: () => DungeonSimSpotlightResults
  getProgressBySpotlight: () => DungeonSimSpotlightProgress
  queryDetailStats: (query: DungeonSimDetailQuery) => DungeonSimDetailStats | null
  queryGenericStats: (query: DungeonSimGenericQuery) => DungeonSimGenericStats | null
  resetDungeons: (params: {
    dungeonIds: DungeonId[]
    selections?: Partial<Record<DungeonId, DungeonStageSelection>>
    boosts?: Partial<Record<DungeonBoostableId, DungeonBoostSelection>>
    mode?: DungeonSimMode
  }) => void
  isComplete: () => boolean
}

// Internal substat tracking for a single item.
type SimSubstat = {
  variant: StatVariant
  rolls: number
}

// Internal snapshot of substat values by level.
type SubstatValuesByLevel = Record<LevelMilestone, Record<number, number>>

// Internal accumulator cell keeps raw counts + breakdown map.
type DungeonSimAccumulatorCell = ReturnType<typeof createEmptyCell>

// Internal runtime state for a single dungeon simulation.
type DungeonSimRuntime = {
  dungeonId: DungeonId
  // Simulation mode decides whether items stop rolling when sold.
  mode: DungeonSimMode
  selection: DungeonStageSelection
  eventStage: number
  eventRates: EventDropRates | null
  rankWeights: readonly number[]
  rarityWeights: readonly number[]
  sets: readonly ArtifactSetId[]
  setWeights: readonly number[]
  dropKind: DungeonDropKind
  spotlightSet: ArtifactSetId
  rng: () => number
  cellsBySet: Map<ArtifactSetId, Record<LevelMilestone, DungeonSimAccumulatorCell>>
  summaryBySet: Map<ArtifactSetId, DungeonSimAccumulatorCell>
  detailBySet: Map<ArtifactSetId, DungeonSimDetailItem[]>
  completed: number
  runs: number
}

// Build milestone values plus detail events for later substat queries.
const buildSubstatValuesWithDetail = (
  rng: () => number,
  slot: ArtifactTypeId,
  main: StatVariant,
  rank: RankValue,
  rarity: RankValue,
  substatTargets: SubstatTargetTable,
): { subValuesByLevel: SubstatValuesByLevel; detail: DungeonSimDetailItem } => {
  // Start with the allowed substat pool for this slot.
  const allowed = Array.from(ALLOWED_SUB_BY_SLOT[Number(slot) as ArtifactType] ?? [])
  // Filter out substats that clash with the chosen main stat.
  const pool = allowed.filter((variant) => !substatMatchesMainVariant(variant, main))
  // Determine how many substats spawn at level 0.
  const startCount = SUBSTAT_START_COUNT[Number(rarity)] ?? 0
  // Seed the initial substats without duplicates.
  const substats: SimSubstat[] = []
  const startVariants: StatVariant[] = []
  for (let i = 0; i < startCount && pool.length > 0; i += 1) {
    const variant = pullRandom(rng, pool)
    startVariants.push(variant)
    substats.push({ variant, rolls: 0 })
  }
  // Apply Mythical pre-rolls at level 0.
  const preRolls = SUBSTAT_PRE_ROLLS[Number(rarity)] ?? 0
  let preRollIndex = -1
  if (preRolls > 0 && substats.length > 0) {
    const targetIndex = Math.floor(rng() * substats.length)
    preRollIndex = Math.max(0, Math.min(substats.length - 1, targetIndex))
    substats[preRollIndex]!.rolls += 1
  }
  // Helper to snapshot current substat values into a map.
  const snapshot = (): Record<number, number> => {
    const values: Record<number, number> = {}
    for (const stat of substats) {
      const base = baseMinForStarV(stat.variant, Number(rank) as RankValue, substatTargets)
      const value = base * (1 + stat.rolls)
      if (value > 0) values[Number(stat.variant)] = value
    }
    return values
  }
  // Start with the level-0 snapshot.
  const byLevel: SubstatValuesByLevel = {
    0: snapshot(),
    4: {},
    8: {},
    12: {},
    16: {},
  }
  // Encode events as a compact list keyed to level milestones.
  const events: number[] = []
  // Advance through each milestone to roll/add substats.
  for (const lvl of [4, 8, 12, 16] as const) {
    const addLevels = SUBSTAT_ADD_LEVELS[Number(rarity)] ?? []
    const shouldAdd = addLevels.includes(lvl)
    if (shouldAdd && pool.length > 0 && substats.length < 4) {
      // Add a new stat and record the variant id as a positive event.
      const variant = pullRandom(rng, pool)
      substats.push({ variant, rolls: 0 })
      events.push(Number(variant))
    } else if (substats.length > 0) {
      // Roll an existing stat and record the index as a negative event.
      const targetIndex = Math.floor(rng() * substats.length)
      const clamped = Math.max(0, Math.min(substats.length - 1, targetIndex))
      substats[clamped]!.rolls += 1
      events.push(-(clamped + 1))
    } else {
      // Placeholder for rare cases with no substats available.
      events.push(0)
    }
    byLevel[lvl] = snapshot()
  }
  return {
    subValuesByLevel: byLevel,
    detail: {
      slot,
      main,
      startVariants,
      preRollIndex,
      events,
      // Max level is patched after evaluating the keep rules.
      maxLevel: 16,
    },
  }
}

const pickRankFromWeights = (rng: () => number, weights: readonly number[]): RankValue => {
  const idx = pickWeightedIndex(rng, weights)
  return (idx + 1) as RankValue
}

// Rarity selection uses the same 1..6 index mapping as rank selection.
const pickRarityFromWeights = (rng: () => number, weights: readonly number[]): RankValue => {
  const idx = pickWeightedIndex(rng, weights)
  return (idx + 1) as RankValue
}

const pickAccessorySlot = (rng: () => number, stage: number): ArtifactTypeId => {
  const weights = accessoryTypeWeightsForStage(stage)
  const idx = pickWeightedIndex(rng, weights)
  return ACCESSORY_SLOTS[Math.max(0, Math.min(ACCESSORY_SLOTS.length - 1, idx))]!
}

const pickMainStat = (rng: () => number, slot: ArtifactTypeId): StatVariant => {
  const allowed = Array.from(ALLOWED_MAIN_BY_SLOT[Number(slot) as ArtifactType] ?? [])
  if (allowed.length === 0) return StatVariant.HP
  return pickUniform(rng, allowed) as StatVariant
}

const pickFactionForSlot = (rng: () => number, slot: ArtifactTypeId): FactionId | undefined => {
  if (!isAccessorySlot(slot)) return undefined
  return pickUniform(rng, ACCESSORY_FACTIONS)
}

const buildTestItem = (
  base: {
    slot: ArtifactTypeId
    set: ArtifactSetId
    rank: RankValue
    rarity: RankValue
    main: StatVariant
    faction?: FactionId
  },
  level: LevelMilestone,
  subValues: Record<number, number>,
): TestItem => ({
  slot: base.slot,
  set: base.set,
  rank: base.rank,
  rarity: base.rarity,
  level,
  // Only include faction when present to satisfy exactOptionalPropertyTypes.
  ...(base.faction != null ? { faction: base.faction } : {}),
  main: base.main,
  subValues,
})

const createEmptyCell = (): { total: number; kept: number; breakdown: Map<string, DungeonSimBreakdown> } => ({
  total: 0,
  kept: 0,
  breakdown: new Map(),
})

const ensureBreakdownEntry = (
  map: Map<string, DungeonSimBreakdown>,
  slot: ArtifactTypeId,
  main: StatVariant,
): DungeonSimBreakdown => {
  const key = `${Number(slot)}|${Number(main)}`
  const existing = map.get(key)
  if (existing) return existing
  const created: DungeonSimBreakdown = { slot, main, kept: 0, total: 0 }
  map.set(key, created)
  return created
}

const finalizeCell = (cell: { total: number; kept: number; breakdown: Map<string, DungeonSimBreakdown> }): DungeonSimCell => ({
  total: cell.total,
  kept: cell.kept,
  breakdown: Array.from(cell.breakdown.values()),
})

// Reconstruct substat variants and roll counts at a given milestone level.
const resolveDetailAtLevel = (
  item: DungeonSimDetailItem,
  level: LevelMilestone,
): { variants: StatVariant[]; rolls: number[] } => {
  // Start from level-0 variants and apply recorded events up to the target level.
  const variants = item.startVariants.slice()
  const rolls = new Array(variants.length).fill(0)
  if (item.preRollIndex >= 0 && item.preRollIndex < rolls.length) {
    rolls[item.preRollIndex] += 1
  }
  // Replay milestone events in order (4/8/12/16).
  const milestones: LevelMilestone[] = [4, 8, 12, 16]
  for (let idx = 0; idx < milestones.length; idx += 1) {
    const milestone = milestones[idx]!
    if (level < milestone) break
    const event = item.events[idx] ?? 0
    if (event > 0) {
      // Positive events add a new substat.
      variants.push(event as StatVariant)
      rolls.push(0)
    } else if (event < 0) {
      // Negative events point at the rolled substat index.
      const rollIndex = Math.max(0, Math.min(rolls.length - 1, -event - 1))
      rolls[rollIndex] += 1
    }
  }
  return { variants, rolls }
}

// Small combinator helper for nCk (n choose k).
const combination = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0
  if (k === 0 || k === n) return 1
  let result = 1
  for (let i = 1; i <= k; i += 1) {
    result = (result * (n - (k - i))) / i
  }
  return result
}

// Compute explicit-substat stats for a given slot/main selection.
const computeDetailStats = (
  items: DungeonSimDetailItem[],
  query: DungeonSimDetailQuery,
): DungeonSimDetailStats => {
  // Normalize the selected stats to numeric ids for quick membership checks.
  const selected = new Set<number>(
    query.substats.map((variant) => Number(variant)).filter((value) => Number.isFinite(value)),
  )
  const presentAtLeast: [number, number, number, number] = [0, 0, 0, 0]
  const rollsAtLeast: [number, number, number, number] = [0, 0, 0, 0]
  let allSelected = 0
  let total = 0
  for (const item of items) {
    // Restrict to the requested slot + main stat.
    if (Number(item.slot) !== Number(query.slot)) continue
    if (Number(item.main) !== Number(query.main)) continue
    // Skip items that never reached the requested milestone.
    if (Number(item.maxLevel) < Number(query.level)) continue
    total += 1
    if (selected.size === 0) continue
    // Rebuild substat state at the requested milestone.
    const { variants, rolls } = resolveDetailAtLevel(item, query.level)
    let presentCount = 0
    let rollCount = 0
    for (let idx = 0; idx < variants.length; idx += 1) {
      const variant = Number(variants[idx])
      if (!selected.has(variant)) continue
      presentCount += 1
      rollCount += rolls[idx] ?? 0
    }
    // Track the ≥1/2/3/4 buckets for presence + roll counts.
    for (let bucket = 1; bucket <= 4; bucket += 1) {
      const index = bucket - 1
      if (presentCount >= bucket) {
        presentAtLeast[index] = (presentAtLeast[index] ?? 0) + 1
      }
      if (rollCount >= bucket) {
        rollsAtLeast[index] = (rollsAtLeast[index] ?? 0) + 1
      }
    }
    // "All selected" means every chosen stat appears.
    if (presentCount >= selected.size) allSelected += 1
  }
  return {
    total,
    presentAtLeast,
    rollsAtLeast,
    allSelected,
  }
}

// Compute generic "specific substat" odds without naming the substats.
const computeGenericSpecificStats = (
  items: DungeonSimDetailItem[],
  query: DungeonSimGenericQuery,
): DungeonSimGenericStats => {
  const allowedPool = new Set<number>(
    Array.from(ALLOWED_SUB_BY_SLOT[Number(query.slot)] ?? []).map((variant) => Number(variant)),
  )
  // Remove the main stat so we only count eligible substats.
  allowedPool.delete(Number(query.main))
  const poolSize = allowedPool.size
  const specificAtLeast: number[] = [0, 0, 0, 0]
  let total = 0
  for (const item of items) {
    if (Number(item.slot) !== Number(query.slot)) continue
    if (Number(item.main) !== Number(query.main)) continue
    if (Number(item.maxLevel) < Number(query.level)) continue
    total += 1
    const { variants } = resolveDetailAtLevel(item, query.level)
    const presentCount = variants.length
    // Compute "specific set" odds for sizes 1/2/3/4.
    for (const [idx, size] of [1, 2, 3, 4].entries()) {
      if (presentCount < size || poolSize < size) continue
      // Each item contributes the chance a random specific set is contained.
      const numerator = combination(presentCount, size)
      const denominator = combination(poolSize, size)
      if (denominator <= 0) continue
      const current = specificAtLeast[idx] ?? 0
      specificAtLeast[idx] = current + (numerator / denominator)
    }
  }
  return {
    total,
    specificAtLeast: total > 0
      ? specificAtLeast.map((value) => value / total)
      : specificAtLeast,
  }
}

// Build empty cell maps for every level milestone.
const createCellMap = (): Record<LevelMilestone, ReturnType<typeof createEmptyCell>> => ({
  0: createEmptyCell(),
  4: createEmptyCell(),
  8: createEmptyCell(),
  12: createEmptyCell(),
  16: createEmptyCell(),
})

// Resolve rank weights for event stages (uses normal table below stage 20).
const eventRankWeightsForStage = (stage: number): readonly number[] => {
  if (stage < 20) {
    return rankWeightsForStage('normal', stage)
  }
  const rates = interpolateEventRates(stage)
  const sixStar = clampNumber(rates.sixStar, 0, 100)
  const fiveStar = clampNumber(100 - sixStar, 0, 100)
  return [0, 0, 0, 0, fiveStar, sixStar]
}

// Translate boost mode to a numeric multiplier.
const resolveBoostMultiplier = (mode: DungeonBoostMode): number => {
  if (mode === '2x') return 2
  if (mode === '3x') return 3
  return 1
}

// Build a set weight array from the boost selection.
const resolveSetWeights = (
  dungeonId: DungeonId,
  sets: readonly ArtifactSetId[],
  boost: DungeonBoostSelection | null | undefined,
): readonly number[] => {
  // Only boostable dungeons apply weighted set drops.
  if (!isBoostableDungeon(dungeonId)) return sets.map(() => 1)
  if (!boost || boost.mode === 'off' || boost.setId == null) return sets.map(() => 1)
  const multiplier = resolveBoostMultiplier(boost.mode)
  if (multiplier <= 1) return sets.map(() => 1)
  return sets.map((setId) => (Number(setId) === Number(boost.setId) ? multiplier : 1))
}

// Build runtime state for a dungeon (weights, RNG, and accumulator maps).
const createDungeonRuntime = (params: {
  dungeonId: DungeonId
  selection?: DungeonStageSelection
  runs: number
  spotlight: EventSpotlightSelection
  mode: DungeonSimMode
  boost?: DungeonBoostSelection | null
}): DungeonSimRuntime => {
  const { dungeonId, runs, spotlight, mode } = params
  // Normalize stage selection so downstream weights are always in-range.
  const selection = normalizeDungeonStageSelection(dungeonId, params.selection)
  // Event logic reuses the normalized stage directly.
  const eventStage = selection.stage
  // Event-specific drop split rates are only relevant for the event dungeon.
  const eventRates = dungeonId === 'event' ? interpolateEventRates(eventStage) : null
  // Rank weights depend on mode (or event anchors for the event dungeon).
  const rankWeights = dungeonId === 'event'
    ? eventRankWeightsForStage(eventStage)
    : rankWeightsForStage(selection.mode, selection.stage)
  // Rarity weights swap to hard tables in the event 26–30 window.
  const rarityWeights = dungeonId === 'event'
    ? eventRarityWeightsForStage(eventStage)
    : rarityWeightsForStage(selection.mode, selection.stage)
  // Resolve the visible set columns for this dungeon.
  const sets = resolveDungeonSets(dungeonId, spotlight)
  // Precompute set weights so boosted dungeons can skew drops.
  const setWeights = resolveSetWeights(dungeonId, sets, params.boost)
  // Initialize per-set accumulator maps for each milestone.
  const cellsBySet = new Map<ArtifactSetId, Record<LevelMilestone, DungeonSimAccumulatorCell>>()
  // Initialize per-set summary cells (kept at +16).
  const summaryBySet = new Map<ArtifactSetId, DungeonSimAccumulatorCell>()
  // Initialize per-set detail buckets for substat queries.
  const detailBySet = new Map<ArtifactSetId, DungeonSimDetailItem[]>()
  for (const setId of sets) {
    cellsBySet.set(setId, createCellMap())
    summaryBySet.set(setId, createEmptyCell())
    detailBySet.set(setId, [])
  }
  // Seed RNG per dungeon + selection for deterministic output.
  const seedStage = dungeonId === 'event' ? String(eventStage) : String(selection.stage)
  const boostKey = isBoostableDungeon(dungeonId)
    ? `${params.boost?.mode ?? 'off'}:${params.boost?.setId ?? 'none'}`
    : 'none'
  const rng = createRng(hashSeed(`${dungeonId}:${selection.mode}:${seedStage}:${spotlight}:${boostKey}:${mode}`))
  return {
    dungeonId,
    mode,
    selection,
    eventStage,
    eventRates,
    rankWeights,
    rarityWeights,
    sets,
    setWeights,
    // Cache drop-kind and spotlight set for the tight inner loop.
    dropKind: DUNGEON_DROP_KIND[dungeonId],
    spotlightSet: resolveEventSpotlightSet(spotlight),
    rng,
    cellsBySet,
    summaryBySet,
    detailBySet,
    completed: 0,
    runs,
  }
}

// Execute a batch of runs for a single dungeon runtime.
const runDungeonBatch = (
  runtime: DungeonSimRuntime,
  rules: HsfRuleWithRecipe[],
  substatTargets: SubstatTargetTable,
  batchRuns: number,
): number => {
  // Clamp the batch to the remaining runs so we never overshoot.
  const remaining = Math.max(0, runtime.runs - runtime.completed)
  // Guard against invalid batch sizes.
  const requested = Math.max(0, Math.floor(batchRuns))
  // Only execute up to the remaining quota.
  const toRun = Math.min(remaining, requested)
  if (toRun <= 0) return 0
  const {
    mode,
    selection,
    eventRates,
    rankWeights,
    rarityWeights,
    sets,
    setWeights,
    dropKind,
    spotlightSet,
    rng,
    cellsBySet,
    summaryBySet,
    detailBySet,
  } = runtime
  for (let i = 0; i < toRun; i += 1) {
    // Determine which set and slot drop based on dungeon rules.
    let dropSet: ArtifactSetId
    let slot: ArtifactTypeId
    if (dropKind === 'accessory') {
      // Spider (and accessory-only sources) always drop accessories.
      dropSet = ACCESSORY_NO_SET_ID as ArtifactSetId
      slot = pickAccessorySlot(rng, selection.stage)
    } else if (dropKind === 'mixed' && eventRates) {
      // Event dungeon splits between accessories, spotlight, and non-spotlight artifacts.
      const roll = rng() * 100
      if (roll < eventRates.accessories) {
        dropSet = spotlightSet
        slot = pickAccessorySlot(rng, selection.stage)
      } else if (roll < eventRates.accessories + eventRates.spotlight) {
        dropSet = spotlightSet
        slot = pickUniform(rng, ARTIFACT_SLOTS)
      } else {
        dropSet = pickUniform(rng, EVENT_NON_SPOTLIGHT_SETS)
        slot = pickUniform(rng, ARTIFACT_SLOTS)
      }
    } else {
      // Standard artifact dungeons pick uniformly across their set pools.
      dropSet = pickWeighted(rng, sets, setWeights)
      slot = pickUniform(rng, ARTIFACT_SLOTS)
    }
    // Rank/rarity/main/faction selection mirrors the in-game drop rules.
    const rank = pickRankFromWeights(rng, rankWeights)
    const rarity = pickRarityFromWeights(rng, rarityWeights)
    const main = pickMainStat(rng, slot)
    const faction = pickFactionForSlot(rng, slot)
    // Build substat snapshots + detail events at each milestone level.
    const { subValuesByLevel, detail } = buildSubstatValuesWithDetail(rng, slot, main, rank, rarity, substatTargets)
    // Base item properties stay constant across the milestone checks.
    const baseItem = {
      slot,
      set: dropSet,
      rank,
      rarity,
      main,
      ...(faction != null ? { faction } : {}),
    }
    const targetCells = cellsBySet.get(dropSet)
    const summaryCell = summaryBySet.get(dropSet)
    if (!targetCells || !summaryCell) continue
    // Persist detail items so substat queries can reuse the same run data.
    const detailBucket = detailBySet.get(dropSet)
    // Track whether we keep rolling after failed milestones.
    const stopOnFail = mode === 'levelUp'
    // Track the highest milestone reached (used by detail popovers).
    let maxLevel: LevelMilestone = 0
    // Track whether the item is kept at +16 for summary rows.
    let keptAt16 = false
    // Gate further rolls in level-up mode once a keep check fails.
    let reached = true
    for (const lvl of DUNGEON_SIM_LEVELS) {
      const cell = targetCells[lvl]
      const subValues = subValuesByLevel[lvl]
      // Totals always reflect all drops, even if we stop rolling early.
      cell.total += 1
      const breakdown = ensureBreakdownEntry(cell.breakdown, slot, main)
      breakdown.total += 1
      // Skip keep evaluation once the item is sold in level-up mode.
      if (!reached) continue
      // Evaluate this item snapshot against the current rules.
      const testItem = buildTestItem(baseItem, lvl, subValues)
      const match = evaluateFirst(rules, testItem)
      const kept = match ? match.keep : true
      // Update the cell-level kept counts.
      if (kept) cell.kept += 1
      if (kept) breakdown.kept += 1
      // Record the most recent level reached for detail filtering.
      maxLevel = lvl
      // Capture the +16 keep result for the summary row.
      if (lvl === 16) keptAt16 = kept
      // Stop rolling when the item fails a keep check in level-up mode.
      if (stopOnFail && !kept) {
        reached = false
      }
    }
    // Persist detail items so substat queries can reuse the same run data.
    if (detailBucket) detailBucket.push({ ...detail, maxLevel })
    // Update the summary cell using the "+16 keep" rule.
    summaryCell.total += 1
    if (keptAt16) summaryCell.kept += 1
    const summaryBreakdown = ensureBreakdownEntry(summaryCell.breakdown, slot, main)
    summaryBreakdown.total += 1
    if (keptAt16) summaryBreakdown.kept += 1
  }
  // Track the completed run count for progress snapshots.
  runtime.completed += toRun
  return toRun
}

// Convert runtime accumulators into the public results shape.
const finalizeDungeonResults = (runtime: DungeonSimRuntime): DungeonSimDungeonResults => {
  const results: DungeonSimDungeonResults = {} as DungeonSimDungeonResults
  for (const [setId, cells] of runtime.cellsBySet.entries()) {
    const summaryCell = runtime.summaryBySet.get(setId) ?? createEmptyCell()
    results[setId] = {
      levels: {
        0: finalizeCell(cells[0]),
        4: finalizeCell(cells[4]),
        8: finalizeCell(cells[8]),
        12: finalizeCell(cells[12]),
        16: finalizeCell(cells[16]),
      },
      summary: finalizeCell(summaryCell),
    }
  }
  return results
}

// Build a streaming simulation session so callers can run in batches.
export const createDungeonSimSession = (params: {
  rules: HsfRuleWithRecipe[]
  substatTargets: SubstatTargetTable
  selections?: Partial<Record<DungeonId, DungeonStageSelection>>
  spotlight?: EventSpotlightSelection
  mode?: DungeonSimMode
  runs?: number
}): DungeonSimSession => {
  // Default to the fixed run count when none is supplied.
  const runs = params.runs ?? DUNGEON_SIM_RUNS_PER_DUNGEON
  // Default to snapshot mode so legacy callers keep current behavior.
  const mode = params.mode ?? DUNGEON_SIM_MODE_DEFAULT
  // Spotlight defaults to the current event rotation.
  const spotlight = params.spotlight ?? EVENT_SPOTLIGHT_DEFAULT
  // Build per-dungeon runtimes so batches can iterate efficiently.
  const runtimes = new Map<DungeonId, DungeonSimRuntime>()
  for (const dungeonId of DUNGEON_IDS) {
    runtimes.set(dungeonId, createDungeonRuntime({
      dungeonId,
      runs,
      spotlight,
      mode,
      ...(params.selections?.[dungeonId] ? { selection: params.selections[dungeonId] } : {}),
    }))
  }
  // Total progress counts every run across every dungeon.
  const total = runs * DUNGEON_IDS.length
  // Materialize completed counts per dungeon for UI consumption.
  const getCompletedByDungeon = (): Record<DungeonId, number> => {
    const map = {} as Record<DungeonId, number>
    for (const dungeonId of DUNGEON_IDS) {
      map[dungeonId] = runtimes.get(dungeonId)?.completed ?? 0
    }
    return map
  }
  // Progress snapshot drives streaming UI updates.
  const getProgress = (): DungeonSimProgress => ({
    completed: Array.from(runtimes.values()).reduce((sum, runtime) => sum + runtime.completed, 0),
    total,
    completedByDungeon: getCompletedByDungeon(),
    runsPerDungeon: runs,
  })
  // Finalize the current accumulators into a DungeonSimResults payload.
  const getResults = (): DungeonSimResults => {
    const results: DungeonSimResults = {} as DungeonSimResults
    for (const dungeonId of DUNGEON_IDS) {
      const runtime = runtimes.get(dungeonId)
      if (!runtime) continue
      results[dungeonId] = finalizeDungeonResults(runtime)
    }
    return results
  }
  // Run a batch across every dungeon runtime.
  const runBatch = (batchRuns: number, dungeonIds?: DungeonId[]) => {
    const normalizedBatch = Math.max(0, Math.floor(batchRuns))
    if (normalizedBatch <= 0) return
    // When dungeon ids are supplied, only run the requested subset.
    const targetIds = dungeonIds && dungeonIds.length > 0 ? new Set(dungeonIds) : null
    for (const [dungeonId, runtime] of runtimes.entries()) {
      if (targetIds && !targetIds.has(dungeonId)) continue
      runDungeonBatch(runtime, params.rules, params.substatTargets, normalizedBatch)
    }
  }
  // Completion check mirrors the aggregated progress totals.
  const isComplete = (): boolean => getProgress().completed >= total
  return {
    runBatch,
    getResults,
    getProgress,
    isComplete,
  }
}

// Build a streaming session that precomputes both event spotlight variants.
export const createDungeonSimSpotlightSession = (params: {
  rules: HsfRuleWithRecipe[]
  substatTargets: SubstatTargetTable
  selections?: Partial<Record<DungeonId, DungeonStageSelection>>
  boosts?: Partial<Record<DungeonBoostableId, DungeonBoostSelection>>
  spotlights?: readonly EventSpotlightSelection[]
  mode?: DungeonSimMode
  runs?: number
  // Restrict simulation to a subset of dungeons; omitted = all 5 dungeons (existing behavior).
  simulateDungeons?: readonly DungeonId[]
}): DungeonSimSpotlightSession => {
  // Default run count mirrors the global simulator default.
  const runs = params.runs ?? DUNGEON_SIM_RUNS_PER_DUNGEON
  // Snapshot mode preserves the legacy "roll to +16" behavior.
  const mode = params.mode ?? DUNGEON_SIM_MODE_DEFAULT
  // Copy the spotlight array so we can safely mutate.
  const spotlights = (params.spotlights ?? EVENT_SPOTLIGHT_OPTIONS).slice()
  if (spotlights.length === 0) {
    // Ensure at least one spotlight exists so the UI can render.
    spotlights.push(EVENT_SPOTLIGHT_DEFAULT)
  }
  // Snapshot the mutable per-dungeon selections so partial resets stay consistent.
  let selectionState: Partial<Record<DungeonId, DungeonStageSelection>> = { ...(params.selections ?? {}) }
  // Snapshot the mutable boost selections for reuse across reset calls.
  let boostState: Partial<Record<DungeonBoostableId, DungeonBoostSelection>> = { ...(params.boosts ?? {}) }
  // Snapshot the current simulation mode for later resets.
  let modeState: DungeonSimMode = mode
  // Determine which base (non-event) dungeons to build runtimes for.
  // When not specified, all non-event dungeons are included (existing behavior).
  const baseDungeonList = DUNGEON_IDS.filter((id) =>
    id !== 'event' && (!params.simulateDungeons || params.simulateDungeons.includes(id))
  )
  // Whether the event dungeon is included in this session.
  const simulateEvent = !params.simulateDungeons || params.simulateDungeons.includes('event')
  // Build a runtime for a base dungeon using the current selection + boost state.
  const buildBaseRuntime = (dungeonId: DungeonId): DungeonSimRuntime => {
    const boost = isBoostableDungeon(dungeonId)
      ? boostState[dungeonId] ?? null
      : null
    const selection = selectionState[dungeonId]
    return createDungeonRuntime({
      dungeonId,
      runs,
      spotlight: EVENT_SPOTLIGHT_DEFAULT,
      mode: modeState,
      boost,
      ...(selection ? { selection } : {}),
    })
  }
  // Build a runtime for the event dungeon using the current selection state.
  const buildEventRuntime = (spotlight: EventSpotlightSelection): DungeonSimRuntime => {
    const selection = selectionState.event
    return createDungeonRuntime({
      dungeonId: 'event',
      runs,
      spotlight,
      mode: modeState,
      ...(selection ? { selection } : {}),
    })
  }
  // Non-event dungeons share a single runtime seeded with the default spotlight.
  // Only create runtimes for the requested subset (defaults to all non-event).
  const baseRuntimes = new Map<DungeonId, DungeonSimRuntime>()
  for (const dungeonId of baseDungeonList) {
    // Use the default spotlight because non-event dungeons are spotlight-agnostic.
    baseRuntimes.set(dungeonId, buildBaseRuntime(dungeonId))
  }
  // Event dungeon runs once per spotlight (omitted when not in simulateDungeons).
  const eventRuntimes = new Map<EventSpotlightSelection, DungeonSimRuntime>()
  if (simulateEvent) {
    for (const spotlight of spotlights) {
      // Each spotlight needs its own runtime because the set pool changes.
      eventRuntimes.set(spotlight, buildEventRuntime(spotlight))
    }
  }
  // Total progress counts only the dungeons being simulated in this session.
  const total = runs * (baseDungeonList.length + (simulateEvent ? 1 : 0))
  const buildProgressForSpotlight = (spotlight: EventSpotlightSelection): DungeonSimProgress => {
    // Build a per-dungeon completed map so the UI can label progress accurately.
    const completedByDungeon = {} as Record<DungeonId, number>
    let completed = 0
    for (const dungeonId of baseDungeonList) {
      const runtime = baseRuntimes.get(dungeonId)
      const count = runtime?.completed ?? 0
      completedByDungeon[dungeonId] = count
      completed += count
    }
    // Add the event runtime for the specific spotlight.
    const eventRuntime = eventRuntimes.get(spotlight)
    const eventCompleted = eventRuntime?.completed ?? 0
    completedByDungeon.event = eventCompleted
    completed += eventCompleted
    return {
      completed,
      total,
      completedByDungeon,
      runsPerDungeon: runs,
    }
  }
  const getResultsBySpotlight = (): DungeonSimSpotlightResults => {
    // Base results are shared by all spotlights (non-event dungeons).
    const baseResults: DungeonSimResults = {} as DungeonSimResults
    for (const dungeonId of baseDungeonList) {
      const runtime = baseRuntimes.get(dungeonId)
      if (!runtime) continue
      baseResults[dungeonId] = finalizeDungeonResults(runtime)
    }
    const resultsBySpotlight = {} as DungeonSimSpotlightResults
    for (const spotlight of spotlights) {
      // Merge the spotlight-specific event results on top of the shared base.
      const eventRuntime = eventRuntimes.get(spotlight)
      resultsBySpotlight[spotlight] = {
        ...baseResults,
        event: eventRuntime ? finalizeDungeonResults(eventRuntime) : ({} as DungeonSimDungeonResults),
      }
    }
    return resultsBySpotlight
  }
  const getProgressBySpotlight = (): DungeonSimSpotlightProgress => {
    // Produce an independent progress object for each spotlight view.
    const progressBySpotlight = {} as DungeonSimSpotlightProgress
    for (const spotlight of spotlights) {
      progressBySpotlight[spotlight] = buildProgressForSpotlight(spotlight)
    }
    return progressBySpotlight
  }
  const queryDetailStats = (query: DungeonSimDetailQuery): DungeonSimDetailStats | null => {
    // Route event queries to the spotlight-specific runtime.
    const runtime = query.dungeonId === 'event'
      ? eventRuntimes.get(query.spotlight)
      : baseRuntimes.get(query.dungeonId)
    if (!runtime) return null
    const bucket = runtime.detailBySet.get(query.setId)
    if (!bucket) return null
    return computeDetailStats(bucket, query)
  }
  const queryGenericStats = (query: DungeonSimGenericQuery): DungeonSimGenericStats | null => {
    // Route event queries to the spotlight-specific runtime.
    const runtime = query.dungeonId === 'event'
      ? eventRuntimes.get(query.spotlight)
      : baseRuntimes.get(query.dungeonId)
    if (!runtime) return null
    const bucket = runtime.detailBySet.get(query.setId)
    if (!bucket) return null
    return computeGenericSpecificStats(bucket, query)
  }
  const runBatch = (batchRuns: number, dungeonIds?: DungeonId[]) => {
    // Normalize the batch so callers can't pass a zero or NaN batch.
    const normalizedBatch = Math.max(0, Math.floor(batchRuns))
    if (normalizedBatch <= 0) return
    // When dungeon ids are supplied, limit batches to the requested subset.
    const targetIds = dungeonIds && dungeonIds.length > 0 ? new Set(dungeonIds) : null
    // Run the shared dungeons once per batch.
    for (const [dungeonId, runtime] of baseRuntimes.entries()) {
      if (targetIds && !targetIds.has(dungeonId)) continue
      runDungeonBatch(runtime, params.rules, params.substatTargets, normalizedBatch)
    }
    if (!targetIds || targetIds.has('event')) {
      // Run the event dungeon once per spotlight per batch.
      for (const runtime of eventRuntimes.values()) {
        runDungeonBatch(runtime, params.rules, params.substatTargets, normalizedBatch)
      }
    }
  }
  const resetDungeons = (reset: {
    dungeonIds: DungeonId[]
    selections?: Partial<Record<DungeonId, DungeonStageSelection>>
    boosts?: Partial<Record<DungeonBoostableId, DungeonBoostSelection>>
    mode?: DungeonSimMode
  }) => {
    // Merge the newest selections so future resets use the latest values.
    if (reset.selections) {
      selectionState = { ...selectionState, ...reset.selections }
    }
    // Merge boost edits so only the changed dungeon needs to be rebuilt.
    if (reset.boosts) {
      boostState = { ...boostState, ...reset.boosts }
    }
    // Mode changes require a full rebuild of every dungeon runtime.
    const modeChanged = reset.mode && reset.mode !== modeState
    if (modeChanged) {
      modeState = reset.mode!
    }
    // On mode change, only rebuild dungeons this session was initialized with.
    const sessionDungeons: DungeonId[] = [...baseDungeonList, ...(simulateEvent ? ['event' as DungeonId] : [])]
    // Deduplicate ids so we only rebuild each dungeon once.
    const uniqueIds = new Set(modeChanged ? sessionDungeons : reset.dungeonIds)
    for (const dungeonId of uniqueIds) {
      if (dungeonId === 'event') {
        // Event runs must be rebuilt for every spotlight variant.
        for (const spotlight of spotlights) {
          eventRuntimes.set(spotlight, buildEventRuntime(spotlight))
        }
        continue
      }
      if (!DUNGEON_IDS.includes(dungeonId)) continue
      baseRuntimes.set(dungeonId, buildBaseRuntime(dungeonId))
    }
  }
  const isComplete = (): boolean => {
    // All base dungeons must finish their run counts.
    for (const runtime of baseRuntimes.values()) {
      if (runtime.completed < runs) return false
    }
    // Every spotlight event run must also finish.
    for (const runtime of eventRuntimes.values()) {
      if (runtime.completed < runs) return false
    }
    return true
  }
  return {
    runBatch,
    getResultsBySpotlight,
    getProgressBySpotlight,
    queryDetailStats,
    queryGenericStats,
    resetDungeons,
    isComplete,
  }
}

// Simulate every dungeon with the same rules and substat targets.
export const simulateDungeonDrops = (params: {
  rules: HsfRuleWithRecipe[]
  substatTargets: SubstatTargetTable
  selections?: Partial<Record<DungeonId, DungeonStageSelection>>
  spotlight?: EventSpotlightSelection
  mode?: DungeonSimMode
  runs?: number
}): DungeonSimResults => {
  const runs = params.runs ?? DUNGEON_SIM_RUNS_PER_DUNGEON
  const session = createDungeonSimSession({ ...params, runs })
  session.runBatch(runs)
  return session.getResults()
}
