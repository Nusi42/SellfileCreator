/**
 * filterPresetsPreference.ts
 *
 * Stores user-named snapshots of the preview filter panel + Gear Inspector sort settings.
 * These are explicit "presets" (not autosave), so they live outside the SFC payload
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
import { ArtifactType } from '../lib/types'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { sanitizePresetId, sanitizePresetName, sanitizePresetSavedAt } from './presetUtils'
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
  // undefined means "don't overwrite the current sort when applying this preset".
  gearInspectorSubstatSort?: GearInspectorSubstatSortState
  views: Record<RulesFilterPreviewMode, FilterPresetView>
}

export type FilterPreset = {
  id: string
  name: string
  savedAt: string
  snapshot: FilterPresetSnapshot
  // When true, the preset is non-deletable (shipped with the app) but can be freely reordered.
  builtin?: true
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

// Exported so SortPreset can embed a filter snapshot without duplicating the sanitization logic.
export const sanitizeFilterPresetSnapshot = (raw: unknown): FilterPresetSnapshot => {
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
  // exactOptionalPropertyTypes: spread the sort field only when present so the
  // property stays absent (not undefined) when the preset was saved without sort.
  const sortRaw = rec['gearInspectorSubstatSort']
  const sortField: Pick<FilterPresetSnapshot, 'gearInspectorSubstatSort'> = sortRaw !== undefined
    ? { gearInspectorSubstatSort: normalizeGearInspectorSubstatSortState(sortRaw) }
    : {}
  return {
    version: FILTER_PRESETS_VERSION,
    activeMode: sanitizeMode(rec['activeMode']),
    filtersSynced: rec['filtersSynced'] === true,
    limitRecipesToFiltered: rec['limitRecipesToFiltered'] === true,
    gearInspectorRecipeFilterMode: sanitizeGearInspectorRecipeFilterMode(rec['gearInspectorRecipeFilterMode']),
    ...sortField,
    views,
  }
}

// ---------------------------------------------------------------------------
// Built-in filter presets
// Must be defined before sanitizePreset/parsePresets so the map is available.
// ---------------------------------------------------------------------------

/** Shared outcome shape for "only Sell" filtering. */
const SELL_ONLY_RESULT = Object.freeze({ keep: false, sell: true, matched: false, unmatched: false })

/**
 * Build a filter-preset snapshot that activates the Gear Inspector view and
 * sets the optional gearInspectorResult + optional slot restrictions.
 * When gearInspectorResult is omitted the default (all-false) is used, meaning
 * no result-label restriction and all items pass through.
 * Sort is intentionally omitted so applying a built-in never overwrites the
 * user's current sort configuration.
 */
const makeBuiltinFilterSnapshot = (
  gearInspectorResult?: { keep: boolean; sell: boolean; matched: boolean; unmatched: boolean },
  slotIds?: number[],
): FilterPresetSnapshot => {
  const giState: RulesFilterState = {
    ...cloneDefaultRulesFilterState(),
    // When provided, override the result filter (e.g. sell-only); absent keeps all-false (no restriction).
    ...(gearInspectorResult ? { gearInspectorResult } : {}),
    // Explicit slot list narrows to artifacts or accessories; undefined leaves slots unrestricted.
    ...(slotIds ? { slots: { selected: slotIds, anyMode: 'off' } } : {}),
  }
  return {
    version: FILTER_PRESETS_VERSION,
    activeMode: 'gearInspector',
    filtersSynced: false,
    limitRecipesToFiltered: false,
    gearInspectorRecipeFilterMode: GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT,
    // No gearInspectorSubstatSort — preserves the user's live sort on apply.
    views: {
      rules: cloneDefaultView(),
      gearInspector: {
        // Filter panel stays closed; the active filter is visible via chip without forcing the panel open.
        open: false,
        state: giState,
        collapsed: cloneDefaultRulesFilterCollapsed(),
      },
    },
  }
}

/** Artifact slot IDs (Helmet → Shield). */
const ARTIFACT_SLOT_IDS = [
  ArtifactType.Helmet,
  ArtifactType.Chestplate,
  ArtifactType.Gauntlets,
  ArtifactType.Boots,
  ArtifactType.Weapon,
  ArtifactType.Shield,
]

/** Accessory slot IDs (Ring, Amulet, Banner). */
const ACCESSORY_SLOT_IDS = [
  ArtifactType.Ring,
  ArtifactType.Amulet,
  ArtifactType.Banner,
]

/**
 * Shipped filter presets shown at the top of the preset menu by default.
 * They are non-deletable (`builtin: true`) but can be freely reordered.
 */
export const BUILTIN_FILTER_PRESETS: readonly FilterPreset[] = [
  {
    id: 'builtin:all-artifacts',
    name: 'All Artifacts',
    savedAt: '',
    builtin: true,
    // No result restriction — shows every artifact regardless of sell/keep label.
    snapshot: makeBuiltinFilterSnapshot(undefined, ARTIFACT_SLOT_IDS),
  },
  {
    id: 'builtin:all-accessories',
    name: 'All Accessories',
    savedAt: '',
    builtin: true,
    // No result restriction — shows every accessory regardless of sell/keep label.
    snapshot: makeBuiltinFilterSnapshot(undefined, ACCESSORY_SLOT_IDS),
  },
  {
    id: 'builtin:sell',
    name: 'Show only Sell',
    savedAt: '',
    builtin: true,
    snapshot: makeBuiltinFilterSnapshot(SELL_ONLY_RESULT),
  },
  {
    id: 'builtin:sell-artifacts',
    name: 'Show only Sell – Artifacts',
    savedAt: '',
    builtin: true,
    snapshot: makeBuiltinFilterSnapshot(SELL_ONLY_RESULT, ARTIFACT_SLOT_IDS),
  },
  {
    id: 'builtin:sell-accessories',
    name: 'Show only Sell – Accessories',
    savedAt: '',
    builtin: true,
    snapshot: makeBuiltinFilterSnapshot(SELL_ONLY_RESULT, ACCESSORY_SLOT_IDS),
  },
]

/** Fast ID → preset lookup used by sanitizePreset to resolve stored built-in stubs. */
const BUILTIN_FILTER_PRESET_MAP = new Map(BUILTIN_FILTER_PRESETS.map((p) => [p.id, p]))

// ---------------------------------------------------------------------------
// Parse / serialize
// ---------------------------------------------------------------------------

const sanitizePreset = (raw: unknown): FilterPreset | null => {
  // Top-level record validation prevents partially-written localStorage from breaking the menu.
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const id = sanitizePresetId(rec['id'])
  if (!id) return null
  // Built-in stubs store only { id, builtin: true }; resolve to full preset data.
  if (rec['builtin'] === true) return BUILTIN_FILTER_PRESET_MAP.get(id) ?? null
  const name = sanitizePresetName(rec['name'])
  if (!name) return null
  return {
    id,
    name,
    savedAt: sanitizePresetSavedAt(rec['savedAt']),
    snapshot: sanitizeFilterPresetSnapshot(rec['snapshot']),
  }
}

const parsePresets = (raw: string | null): FilterPreset[] => {
  // Empty storage on first run: seed with all built-ins at default order.
  if (!raw) return [...BUILTIN_FILTER_PRESETS]
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...BUILTIN_FILTER_PRESETS]
    const sanitized: FilterPreset[] = []
    parsed.forEach((entry) => {
      const preset = sanitizePreset(entry)
      if (!preset) return
      sanitized.push(preset)
    })
    // Inject any built-ins absent from stored order at the front (e.g. new ones added in a future version).
    const storedIds = new Set(sanitized.map((p) => p.id))
    const missing = BUILTIN_FILTER_PRESETS.filter((p) => !storedIds.has(p.id))
    return [...missing, ...sanitized]
  } catch {
    return [...BUILTIN_FILTER_PRESETS]
  }
}

const serializePresets = (value: FilterPreset[]): string | null => {
  // Keep storage clean: prefer removing the key when there's nothing to save.
  if (!Array.isArray(value) || value.length === 0) return null
  // Built-ins are stored as compact stubs so snapshot data isn't duplicated in localStorage.
  const toStore = value.map((p) => (p.builtin ? { id: p.id, builtin: true } : p))
  return JSON.stringify(toStore)
}

const presetsStore = createLocalStorageStore<FilterPreset[]>({
  key: FILTER_PRESETS_STORAGE_KEY,
  fallback: [],
  parse: parsePresets,
  serialize: serializePresets,
})

export const useFilterPresetsPreference = createLocalStorageStateHook(presetsStore)

export const getFilterPresetsSnapshot = (): readonly FilterPreset[] => presetsStore.getSnapshot()
