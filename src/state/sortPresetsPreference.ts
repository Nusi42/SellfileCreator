/**
 * sortPresetsPreference.ts
 *
 * Stores user-named snapshots of the Gear Inspector substat sort configuration.
 * Parallel to filterPresetsPreference but scoped to sort state only, so users
 * can save/restore sort setups independently of filter presets.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { sanitizePresetId, sanitizePresetName, sanitizePresetSavedAt, sanitizePresetColor } from './presetUtils'
import {
  DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
  normalizeGearInspectorSubstatSortState,
  type GearInspectorSubstatSortState,
} from './gearInspectorSubstatSortPreferences'
import {
  sanitizeFilterPresetSnapshot,
  type FilterPresetSnapshot,
} from './filterPresetsPreference'
import { StatVariant } from '../lib/types'
import {
  GEAR_INSPECTOR_SORT_KEY_LAST_USAGE,
  GEAR_INSPECTOR_SORT_KEY_NEWEST,
  GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_IMPROVEMENT_CHANCE,
  GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_RANK,
} from '../lib/gearInspectorSort'

export const SORT_PRESETS_STORAGE_KEY = 'sellfileCreator.sortPresets.v1'

export type SortPreset = {
  id: string
  name: string
  savedAt: string
  // Full sort configuration captured at save time.
  snapshot: GearInspectorSubstatSortState
  // Optional filter snapshot captured at save time; absent means "don't overwrite the current filter on apply".
  filterSnapshot?: FilterPresetSnapshot
  // Optional #RRGGBB text color applied to the preset label in the menu.
  color?: string
  // When true, the preset is non-deletable (shipped with the app) but can be freely reordered.
  builtin?: true
}

// ---------------------------------------------------------------------------
// Built-in sort presets
// Must be defined before sanitizePreset/parsePresets so the map is available.
// ---------------------------------------------------------------------------

/**
 * Flat grouping: one "Artifacts" bucket + one "Accessories" bucket, no set/slot/faction sub-groups.
 * Used by time-based presets (Newest, Latest Used) where chronological order spans all types.
 */
const FLAT_TYPE_GROUPING = {
  artifacts:   { bySet: false, bySlot: false },
  accessories: { byFaction: false, bySet: false, bySlot: false },
  hideHeaders: false,
} as const

/**
 * Shipped sort presets shown at the top of the sort preset menu by default.
 * They are non-deletable (`builtin: true`) but can be freely reordered.
 */
export const BUILTIN_SORT_PRESETS: readonly SortPreset[] = [
  {
    id: 'builtin:newest',
    name: 'Newest',
    savedAt: '',
    builtin: true,
    // Sort by acquisition date descending; flat type groups so newest items float to the top globally.
    snapshot: {
      ...DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
      priorities: [GEAR_INSPECTOR_SORT_KEY_NEWEST],
      grouping: FLAT_TYPE_GROUPING,
    },
  },
  {
    id: 'builtin:latest-used',
    name: 'Latest Used',
    savedAt: '',
    builtin: true,
    // Sort by most recently equipped descending; flat type groups so recently touched items float up.
    snapshot: {
      ...DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
      priorities: [GEAR_INSPECTOR_SORT_KEY_LAST_USAGE],
      grouping: FLAT_TYPE_GROUPING,
    },
  },
  {
    id: 'builtin:spd',
    name: 'SPD',
    savedAt: '',
    builtin: true,
    // Single-stat priority: Speed descending, all other settings at default.
    snapshot: {
      ...DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
      priorities: [StatVariant.SPD],
    },
  },
  {
    id: 'builtin:spd-per-slot',
    name: 'SPD – per Slot',
    savedAt: '',
    builtin: true,
    // Speed descending, grouped by slot only (no set grouping so each slot
    // bucket shows its fastest gear regardless of which set it belongs to).
    snapshot: {
      ...DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
      priorities: [StatVariant.SPD],
      grouping: {
        artifacts:   { bySet: false, bySlot: true },
        accessories: { byFaction: false, bySet: false, bySlot: true },
        hideHeaders: false,
      },
    },
  },
  {
    id: 'builtin:improvement-chance',
    name: 'Improvement Chance',
    savedAt: '',
    builtin: true,
    // Sort by safeguard improvement chance descending; flat type groups so highest-chance items float up globally.
    snapshot: {
      ...DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
      priorities: [GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_IMPROVEMENT_CHANCE],
      grouping: FLAT_TYPE_GROUPING,
    },
  },
  {
    id: 'builtin:safeguard-rank',
    name: 'Safeguard Rank',
    savedAt: '',
    builtin: true,
    // Sort by safeguard rank ascending: rank #1 (most-protected) floats first; unranked items last.
    snapshot: {
      ...DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
      priorities: [GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_RANK],
      direction: 'asc',
      grouping: FLAT_TYPE_GROUPING,
    },
  },
]

/** Fast ID → preset lookup used by sanitizePreset to resolve stored built-in stubs. */
const BUILTIN_SORT_PRESET_MAP = new Map(BUILTIN_SORT_PRESETS.map((p) => [p.id, p]))

// ---------------------------------------------------------------------------
// Parse / serialize
// ---------------------------------------------------------------------------

const sanitizePreset = (raw: unknown): SortPreset | null => {
  // Top-level validation keeps partially-written localStorage from breaking the menu.
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const id = sanitizePresetId(rec['id'])
  if (!id) return null
  // Built-in stubs store only { id, builtin: true }; resolve to full preset data.
  if (rec['builtin'] === true) return BUILTIN_SORT_PRESET_MAP.get(id) ?? null
  const name = sanitizePresetName(rec['name'])
  if (!name) return null
  // exactOptionalPropertyTypes: spread filterSnapshot only when present so the property
  // stays absent (not undefined) for presets saved without filter state.
  const filterRaw = rec['filterSnapshot']
  const filterField: Pick<SortPreset, 'filterSnapshot'> = filterRaw !== undefined
    ? { filterSnapshot: sanitizeFilterPresetSnapshot(filterRaw) }
    : {}
  // exactOptionalPropertyTypes: spread color only when present so the field stays absent for uncolored presets.
  const color = sanitizePresetColor(rec['color'])
  const colorField: Pick<SortPreset, 'color'> = color !== undefined ? { color } : {}
  return {
    id,
    name,
    savedAt: sanitizePresetSavedAt(rec['savedAt']),
    // Reuse the existing normalizer; it handles all schema evolution for sort state.
    snapshot: normalizeGearInspectorSubstatSortState(rec['snapshot']),
    ...filterField,
    ...colorField,
  }
}

const parsePresets = (raw: string | null): SortPreset[] => {
  // Empty storage on first run: seed with all built-ins at default order.
  if (!raw) return [...BUILTIN_SORT_PRESETS]
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...BUILTIN_SORT_PRESETS]
    const out: SortPreset[] = []
    parsed.forEach((entry) => {
      const preset = sanitizePreset(entry)
      if (!preset) return
      out.push(preset)
    })
    // Inject any built-ins absent from stored order at the front (e.g. new ones added in a future version).
    const storedIds = new Set(out.map((p) => p.id))
    const missing = BUILTIN_SORT_PRESETS.filter((p) => !storedIds.has(p.id))
    return [...missing, ...out]
  } catch {
    return [...BUILTIN_SORT_PRESETS]
  }
}

const serializePresets = (value: SortPreset[]): string | null => {
  // Remove the key entirely when the list is empty to keep storage tidy.
  if (!Array.isArray(value) || value.length === 0) return null
  // Built-ins are stored as compact stubs so snapshot data isn't duplicated in localStorage.
  const toStore = value.map((p) => (p.builtin ? { id: p.id, builtin: true } : p))
  return JSON.stringify(toStore)
}

const presetsStore = createLocalStorageStore<SortPreset[]>({
  key: SORT_PRESETS_STORAGE_KEY,
  fallback: [],
  parse: parsePresets,
  serialize: serializePresets,
})

export const useSortPresetsPreference = createLocalStorageStateHook(presetsStore)

export const getSortPresetsSnapshot = (): readonly SortPreset[] => presetsStore.getSnapshot()
