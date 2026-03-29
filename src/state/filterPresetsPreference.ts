/**
 * filterPresetsPreference.ts
 *
 * Stores user-named snapshots of the preview filter panel + Gear Inspector sort settings.
 * These are explicit "presets" (not autosave), so they live outside the SFR payload
 * and must never participate in the Restore Autosave dialog.
 */
import {
  RULES_FILTER_PREVIEW_MODES,
  RULES_FILTER_OPEN_DEFAULT,
  cloneDefaultRulesFilterCollapsed,
  cloneDefaultRulesFilterState,
  type RulesFilterPreviewMode,
  type CollapsedSections,
} from './rulesFilterPersistence'
import { GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT, type GearInspectorRecipeFilterMode } from '../types/gearInspectorRecipeFilterMode'
import { sanitizeRulesFilterState, type RulesFilterState } from '../lib/rulesFilter'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import {
  DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
  normalizeGearInspectorSubstatSortState,
  type GearInspectorSubstatSortState,
} from './gearInspectorSubstatSortPreferences'

export const FILTER_PRESETS_STORAGE_KEY = 'sellfileCreator.filterPresets.v1'
export const FILTER_PRESETS_VERSION = 1 as const

export type FilterPresetView = {
  open: boolean
  state: RulesFilterState
  collapsed: CollapsedSections
}

export type FilterPresetSnapshot = {
  version: typeof FILTER_PRESETS_VERSION
  activeMode: RulesFilterPreviewMode
  filtersSynced: boolean
  limitRecipesToFiltered: boolean
  gearInspectorRecipeFilterMode: GearInspectorRecipeFilterMode
  gearInspectorSubstatSort: GearInspectorSubstatSortState
  views: Record<RulesFilterPreviewMode, FilterPresetView>
}

export type FilterPreset = {
  id: string
  name: string
  savedAt: string
  snapshot: FilterPresetSnapshot
}

const cloneDefaultView = (): FilterPresetView => ({
  open: RULES_FILTER_OPEN_DEFAULT,
  state: cloneDefaultRulesFilterState(),
  collapsed: cloneDefaultRulesFilterCollapsed(),
})

const cloneDefaultSnapshot = (): FilterPresetSnapshot => {
  const views = {} as Record<RulesFilterPreviewMode, FilterPresetView>
  for (const mode of RULES_FILTER_PREVIEW_MODES) {
    views[mode] = cloneDefaultView()
  }
  return {
    version: FILTER_PRESETS_VERSION,
    activeMode: 'rules',
    filtersSynced: false,
    limitRecipesToFiltered: false,
    gearInspectorRecipeFilterMode: GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT,
    gearInspectorSubstatSort: DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
    views,
  }
}

const sanitizeId = (raw: unknown): string | null => {
  // IDs are stable internal keys; accept only short-ish non-empty strings.
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.slice(0, 80)
}

const sanitizeName = (raw: unknown): string | null => {
  // Names are user-facing; keep them readable and bounded.
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed
}

const sanitizeIsoString = (raw: unknown): string => {
  // savedAt is informational; clamp malformed values to "now" so sorting still works.
  if (typeof raw === 'string' && raw.trim()) return raw
  return new Date().toISOString()
}

// Validate stored mode; fall back to 'rules' for any unknown value.
const sanitizeMode = (raw: unknown): RulesFilterPreviewMode => (
  raw === 'gearInspector' ? 'gearInspector' : 'rules'
)

const sanitizeGearInspectorRecipeFilterMode = (raw: unknown): GearInspectorRecipeFilterMode => (
  raw === 'first' || raw === 'any' || raw === 'off' ? raw : GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT
)

const sanitizeCollapsed = (raw: unknown): CollapsedSections => {
  // Collapsed state is a boolean map; unknown keys are dropped.
  const next = cloneDefaultRulesFilterCollapsed()
  if (!raw || typeof raw !== 'object') return next
  const rec = raw as Record<string, unknown>
  for (const key of Object.keys(next)) {
    const value = rec[key]
    if (typeof value === 'boolean') next[key as keyof CollapsedSections] = value
  }
  return next
}

const sanitizeView = (raw: unknown): FilterPresetView => {
  // Views must always be complete so the filter panel never crashes on apply.
  const fallback = cloneDefaultView()
  if (!raw || typeof raw !== 'object') return fallback
  const rec = raw as Record<string, unknown>
  const state = sanitizeRulesFilterState(rec['state'])
  return {
    open: rec['open'] === true,
    state,
    collapsed: sanitizeCollapsed(rec['collapsed']),
  }
}

const sanitizeSnapshot = (raw: unknown): FilterPresetSnapshot => {
  // Snapshots are versioned so we can migrate in-place later without breaking older presets.
  const fallback = cloneDefaultSnapshot()
  if (!raw || typeof raw !== 'object') return fallback
  const rec = raw as Record<string, unknown>
  const viewsRaw = rec['views']
  const views = {} as Record<RulesFilterPreviewMode, FilterPresetView>
  for (const mode of RULES_FILTER_PREVIEW_MODES) {
    const viewRaw = (viewsRaw && typeof viewsRaw === 'object')
      ? (viewsRaw as Record<string, unknown>)[mode]
      : null
    views[mode] = sanitizeView(viewRaw)
  }
  return {
    version: FILTER_PRESETS_VERSION,
    activeMode: sanitizeMode(rec['activeMode']),
    filtersSynced: rec['filtersSynced'] === true,
    limitRecipesToFiltered: rec['limitRecipesToFiltered'] === true,
    gearInspectorRecipeFilterMode: sanitizeGearInspectorRecipeFilterMode(rec['gearInspectorRecipeFilterMode']),
    gearInspectorSubstatSort: normalizeGearInspectorSubstatSortState(rec['gearInspectorSubstatSort']),
    views,
  }
}

const sanitizePreset = (raw: unknown): FilterPreset | null => {
  // Top-level record validation prevents partially-written localStorage from breaking the menu.
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const id = sanitizeId(rec['id'])
  const name = sanitizeName(rec['name'])
  if (!id || !name) return null
  return {
    id,
    name,
    savedAt: sanitizeIsoString(rec['savedAt']),
    snapshot: sanitizeSnapshot(rec['snapshot']),
  }
}

const parsePresets = (raw: string | null): FilterPreset[] => {
  // Empty storage is the common case; keep this fast path obvious.
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const sanitized: FilterPreset[] = []
    parsed.forEach((entry) => {
      const preset = sanitizePreset(entry)
      if (!preset) return
      sanitized.push(preset)
    })
    // Preserve stored order so manual reordering (move up/down) persists across sessions.
    return sanitized
  } catch {
    return []
  }
}

const serializePresets = (value: FilterPreset[]): string | null => {
  // Keep storage clean: prefer removing the key when there's nothing to save.
  if (!Array.isArray(value) || value.length === 0) return null
  return JSON.stringify(value)
}

const presetsStore = createLocalStorageStore<FilterPreset[]>({
  key: FILTER_PRESETS_STORAGE_KEY,
  fallback: [],
  parse: parsePresets,
  serialize: serializePresets,
})

export const useFilterPresetsPreference = createLocalStorageStateHook(presetsStore)

export const getFilterPresetsSnapshot = (): readonly FilterPreset[] => presetsStore.getSnapshot()
