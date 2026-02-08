/**
 * dungeonSimulatorPreferences.ts
 *
 * Persist the Dungeon Drops simulator selections (stage, spotlight, collapse state).
 * Keeping this in a localStorage-backed store makes the tab reopen stable.
 */
import { DUNGEON_SIM_PREFERENCES_KEY } from '../lib/constants'
import {
  DUNGEON_IDS,
  EVENT_SPOTLIGHT_DEFAULT,
  normalizeDungeonStageSelection,
  resolveDungeonStageDefault,
  type DungeonId,
  type DungeonStageSelection,
  type EventSpotlightSelection,
} from '../lib/dungeonSimulator'
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

export type DungeonSimulatorPreferences = {
  // Stage selection per dungeon.
  stages: Record<DungeonId, DungeonStageSelection>
  // Current event spotlight set.
  eventSpotlight: EventSpotlightSelection
  // Collapsed state per dungeon table.
  collapsed: Record<DungeonId, boolean>
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

// Normalize the persisted preferences, preserving defaults on invalid data.
const sanitizePreferences = (raw: unknown): DungeonSimulatorPreferences => {
  // Prepare defaults once so all branches use the same baseline.
  const fallbackStages = buildDefaultStageMap()
  const fallbackCollapsed = buildDefaultCollapsedMap()
  if (!raw || typeof raw !== 'object') {
    return {
      stages: fallbackStages,
      eventSpotlight: DEFAULT_EVENT_SPOTLIGHT,
      collapsed: fallbackCollapsed,
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
  return {
    stages: normalizedStages,
    eventSpotlight: sanitizeEventSpotlight(candidate.eventSpotlight),
    collapsed: sanitizeCollapsedMap(candidate.collapsed ?? fallbackCollapsed),
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
