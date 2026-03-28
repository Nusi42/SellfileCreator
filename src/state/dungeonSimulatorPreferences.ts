/**
 * dungeonSimulatorPreferences.ts
 *
 * Persist the Dungeon Drops simulator selections (stage, spotlight, boosts, collapse state, collapsed level).
 * Keeping this in a localStorage-backed store makes the tab reopen stable.
 */
import { DUNGEON_SIM_PREFERENCES_KEY } from '../lib/constants'
import {
  DUNGEON_BOOSTABLE_IDS,
  DUNGEON_IDS,
  DUNGEON_SIM_DEFAULT_LEVEL,
  DUNGEON_SIM_LEVELS,
  EVENT_SPOTLIGHT_DEFAULT,
  DUNGEON_SIM_MODE_DEFAULT,
  DUNGEON_SIM_MODES,
  normalizeDungeonBoostSelection,
  normalizeDungeonStageSelection,
  resolveDungeonBoostDefault,
  resolveDungeonStageDefault,
  type DungeonBoostableId,
  type DungeonBoostSelection,
  type DungeonId,
  type DungeonSimMode,
  type DungeonStageSelection,
  type EventSpotlightSelection,
} from '../lib/dungeonSimulator'
import type { LevelMilestone } from '../lib/types'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

// Spotlight defaults to Chronophage because that's the current event rotation.
const DEFAULT_EVENT_SPOTLIGHT: EventSpotlightSelection = EVENT_SPOTLIGHT_DEFAULT

// Build a fresh dungeon->stage map so new dungeons inherit sane defaults.
const buildDefaultStageMap = (): Record<DungeonId, DungeonStageSelection> => {
  // Keep this map stable so the UI always has a full key set.
  const map = {} as Record<DungeonId, DungeonStageSelection>
  for (const dungeonId of DUNGEON_IDS) {
    map[dungeonId] = { ...resolveDungeonStageDefault(dungeonId) }
  }
  return map
}

// Build a default collapsed map so dungeon tables start compact.
const buildDefaultCollapsedMap = (): Record<DungeonId, boolean> => {
  // Default every dungeon to collapsed to reduce initial scroll.
  const map = {} as Record<DungeonId, boolean>
  for (const dungeonId of DUNGEON_IDS) {
    map[dungeonId] = true
  }
  return map
}

// Build a default collapsed level map so summary rows start at +16.
const buildDefaultCollapsedLevelMap = (): Record<DungeonId, LevelMilestone> => {
  // Default to the highest milestone so summary rows match the prior +16 behavior.
  const map = {} as Record<DungeonId, LevelMilestone>
  for (const dungeonId of DUNGEON_IDS) {
    map[dungeonId] = DUNGEON_SIM_DEFAULT_LEVEL
  }
  return map
}

// Build a default boost map for the boostable dungeons.
const buildDefaultBoostMap = (): Record<DungeonBoostableId, DungeonBoostSelection> => {
  // Only include dungeons where boosts are allowed.
  const map = {} as Record<DungeonBoostableId, DungeonBoostSelection>
  for (const dungeonId of DUNGEON_BOOSTABLE_IDS) {
    map[dungeonId] = resolveDungeonBoostDefault(dungeonId)
  }
  return map
}

export type DungeonSimulatorPreferences = {
  // Stage selection per dungeon.
  stages: Record<DungeonId, DungeonStageSelection>
  // Current event spotlight set.
  eventSpotlight: EventSpotlightSelection
  // Simulation mode (snapshot vs level-up).
  simMode: DungeonSimMode
  // Boosted set selection per boostable dungeon.
  boosts: Record<DungeonBoostableId, DungeonBoostSelection>
  // Collapsed state per dungeon table.
  collapsed: Record<DungeonId, boolean>
  // Collapsed level per dungeon table.
  collapsedLevels: Record<DungeonId, LevelMilestone>
}

// Normalize an arbitrary value into a safe stage selection.
export const sanitizeStageSelection = (
  dungeonId: DungeonId,
  raw: unknown,
  fallback?: DungeonStageSelection,
): DungeonStageSelection => {
  // Fallback to defaults when storage data is missing or malformed.
  if (!raw || typeof raw !== 'object') {
    return normalizeDungeonStageSelection(dungeonId, null, fallback)
  }
  const candidate = raw as Partial<DungeonStageSelection>
  return normalizeDungeonStageSelection(dungeonId, candidate, fallback)
}

// Normalize any stored spotlight selection to the supported union.
export const sanitizeEventSpotlight = (raw: unknown): EventSpotlightSelection => (
  raw === 'pinpoint' ? 'pinpoint' : 'chronophage'
)

// Normalize stored simulation mode to the supported union.
const sanitizeSimMode = (raw: unknown): DungeonSimMode => (
  DUNGEON_SIM_MODES.includes(raw as DungeonSimMode) ? (raw as DungeonSimMode) : DUNGEON_SIM_MODE_DEFAULT
)

// Normalize stored collapsed state to a strict per-dungeon boolean map.
const sanitizeCollapsedMap = (raw: unknown): Record<DungeonId, boolean> => {
  // Start from a full default map so missing keys still resolve.
  const fallback = buildDefaultCollapsedMap()
  if (!raw || typeof raw !== 'object') return fallback
  const candidate = raw as Partial<Record<DungeonId, boolean>>
  const normalized = buildDefaultCollapsedMap()
  for (const dungeonId of DUNGEON_IDS) {
    // Accept only explicit booleans, otherwise use the default.
    normalized[dungeonId] = typeof candidate[dungeonId] === 'boolean'
      ? Boolean(candidate[dungeonId])
      : fallback[dungeonId]
  }
  return normalized
}

// Normalize stored collapsed levels to known milestones.
const sanitizeCollapsedLevelMap = (raw: unknown): Record<DungeonId, LevelMilestone> => {
  // Seed from defaults so missing keys still resolve.
  const fallback = buildDefaultCollapsedLevelMap()
  if (!raw || typeof raw !== 'object') return fallback
  const candidate = raw as Partial<Record<DungeonId, LevelMilestone>>
  const normalized = buildDefaultCollapsedLevelMap()
  for (const dungeonId of DUNGEON_IDS) {
    // Clamp unknown values back to the default milestone.
    const value = candidate[dungeonId]
    normalized[dungeonId] = DUNGEON_SIM_LEVELS.includes(value as LevelMilestone)
      ? (value as LevelMilestone)
      : fallback[dungeonId]
  }
  return normalized
}

// Normalize the persisted preferences, preserving defaults on invalid data.
const sanitizePreferences = (raw: unknown): DungeonSimulatorPreferences => {
  // Prepare defaults once so all branches use the same baseline.
  const fallbackStages = buildDefaultStageMap()
  const fallbackCollapsed = buildDefaultCollapsedMap()
  const fallbackCollapsedLevels = buildDefaultCollapsedLevelMap()
  const fallbackBoosts = buildDefaultBoostMap()
  if (!raw || typeof raw !== 'object') {
    return {
      stages: fallbackStages,
      eventSpotlight: DEFAULT_EVENT_SPOTLIGHT,
      simMode: DUNGEON_SIM_MODE_DEFAULT,
      boosts: fallbackBoosts,
      collapsed: fallbackCollapsed,
      collapsedLevels: fallbackCollapsedLevels,
    }
  }
  const candidate = raw as Partial<DungeonSimulatorPreferences>
  // Stage payloads are optional in stored versions.
  const storedStages = candidate.stages && typeof candidate.stages === 'object'
    ? candidate.stages as Partial<Record<DungeonId, DungeonStageSelection>>
    : {}
  const normalizedStages = buildDefaultStageMap()
  for (const dungeonId of DUNGEON_IDS) {
    // Normalize each dungeon independently so a single bad entry doesn't break the rest.
    normalizedStages[dungeonId] = sanitizeStageSelection(
      dungeonId,
      storedStages[dungeonId],
      normalizedStages[dungeonId],
    )
  }
  // Boost payloads are optional in stored versions.
  const storedBoosts = candidate.boosts && typeof candidate.boosts === 'object'
    ? candidate.boosts as Partial<Record<DungeonBoostableId, DungeonBoostSelection>>
    : {}
  const normalizedBoosts = buildDefaultBoostMap()
  for (const dungeonId of DUNGEON_BOOSTABLE_IDS) {
    // Clamp each boost selection independently for safety.
    normalizedBoosts[dungeonId] = normalizeDungeonBoostSelection(
      dungeonId,
      storedBoosts[dungeonId],
      normalizedBoosts[dungeonId],
    )
  }
  return {
    stages: normalizedStages,
    eventSpotlight: sanitizeEventSpotlight(candidate.eventSpotlight),
    simMode: sanitizeSimMode(candidate.simMode),
    boosts: normalizedBoosts,
    collapsed: sanitizeCollapsedMap(candidate.collapsed ?? fallbackCollapsed),
    collapsedLevels: sanitizeCollapsedLevelMap(candidate.collapsedLevels ?? fallbackCollapsedLevels),
  }
}

const dungeonSimulatorPreferencesStore = createLocalStorageStore<DungeonSimulatorPreferences>({
  key: DUNGEON_SIM_PREFERENCES_KEY,
  fallback: sanitizePreferences(null),
  parse: (raw) => {
    // Parse defensively so malformed JSON never crashes the app.
    if (!raw) return sanitizePreferences(null)
    try {
      return sanitizePreferences(JSON.parse(raw))
    } catch {
      return sanitizePreferences(null)
    }
  },
  serialize: (value) => {
    // Always re-sanitize before saving so we never persist bad shapes.
    const sanitized = sanitizePreferences(value)
    return JSON.stringify(sanitized)
  },
})

export const useDungeonSimulatorPreferences = createLocalStorageStateHook(dungeonSimulatorPreferencesStore)

/** Returns a fresh set of default preferences — used by the "Reset to defaults" button. */
export const buildDefaultDungeonSimulatorPreferences = (): DungeonSimulatorPreferences =>
  sanitizePreferences(null)
