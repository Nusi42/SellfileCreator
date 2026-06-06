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
import { sanitizeRulesFilterState, type RulesFilterState, type GearInspectorSourceFilter } from '../lib/rulesFilter'
import { ArtifactType, type ArtifactTypeId } from '../lib/types'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import {
  sanitizePresetId,
  sanitizePresetName,
  sanitizePresetSavedAt,
  sanitizePresetColor,
  sanitizePresetIconId,
  resolveBuiltinIconPin,
  buildBuiltinIconPinStub,
} from './presetUtils'
import type { MetasetIconId } from '../lib/metasetIcons'
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
  // Note: a preset deliberately does NOT record which preview mode was active when it was saved —
  // presets are mode-agnostic and apply to whichever filter panel is active when used.
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
  // Optional #RRGGBB text color applied to the preset label in the menu.
  color?: string
  // Optional glyph-catalog icon shown beside the name and as the pinned button face.
  iconId?: MetasetIconId
  // When true, the preset renders as a quick-toggle button next to the Filter button.
  pinned?: true
  // When true, the preset is non-deletable (shipped with the app) but can be freely reordered.
  builtin?: true
  // When true, the preset is hidden from the menu unless the user toggles show-hidden.
  hidden?: true
  // When true, applying the preset REPLACES the entire filter (legacy behavior).
  // When absent (the default), applying ORs/merges the preset's selections into the
  // current filter, and a pinned button toggles by subtracting them again.
  exclusive?: true
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
    filtersSynced: false,
    limitRecipesToFiltered: false,
    gearInspectorRecipeFilterMode: GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT,
    gearInspectorSubstatSort: DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
    views,
  }
}

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
 * Build a filter-preset snapshot whose Gear Inspector view holds the optional
 * gearInspectorResult + optional slot restrictions (presets are mode-agnostic; the
 * payload lives in the Gear Inspector view and is applied to whichever panel is active).
 * When gearInspectorResult is omitted the default (all-false) is used, meaning
 * no result-label restriction and all items pass through.
 * Sections touched by active filters start expanded; everything else collapsed.
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
  // Expand sections that have active filters so they're immediately visible when the panel opens.
  const resultActive = gearInspectorResult != null
    && (gearInspectorResult.keep || gearInspectorResult.sell || gearInspectorResult.matched || gearInspectorResult.unmatched)
  const collapsed: CollapsedSections = {
    ...cloneDefaultRulesFilterCollapsed(),
    ...(resultActive ? { rule: false } : {}),
    ...(slotIds ? { slots: false } : {}),
  }
  return {
    version: FILTER_PRESETS_VERSION,
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
        collapsed,
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

/** Sources selected for Scoped Sell presets (inventory + vault). */
const SCOPED_SELL_SOURCES: GearInspectorSourceFilter[] = ['inventory', 'vault']

/**
 * Build a Scoped Sell snapshot: sell+scope (matched) result filter and inventory+vault
 * sources. When slotIds is provided the snapshot also narrows to those slots; when omitted
 * it leaves slots unrestricted (the plain "Scoped Sell" preset). Results / sources (and slots
 * when present) start expanded so the active filters are immediately visible on open.
 */
const makeScopedSellSnapshot = (slotIds?: number[]): FilterPresetSnapshot => {
  const giState: RulesFilterState = {
    ...cloneDefaultRulesFilterState(),
    gearInspectorResult: { keep: false, sell: true, matched: true, unmatched: false },
    // Explicit slot list narrows to artifacts/accessories; undefined leaves slots unrestricted.
    ...(slotIds ? { slots: { selected: slotIds as ArtifactTypeId[], anyMode: 'include' } } : {}),
    gearInspectorSources: { selected: SCOPED_SELL_SOURCES },
  }
  // Expand the sections this snapshot actually touches; slots only when a slot list is set.
  const collapsed: CollapsedSections = {
    ...cloneDefaultRulesFilterCollapsed(),
    rule: false,
    sources: false,
    ...(slotIds ? { slots: false } : {}),
  }
  return {
    version: FILTER_PRESETS_VERSION,
    filtersSynced: false,
    limitRecipesToFiltered: false,
    gearInspectorRecipeFilterMode: GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT,
    // No gearInspectorSubstatSort — preserves the user's live sort on apply.
    views: {
      rules: cloneDefaultView(),
      gearInspector: {
        open: false,
        state: giState,
        collapsed,
      },
    },
  }
}

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
    // Monochrome hammer glyph (⚒) evokes artifacts; pinned by default so its button ships out of the box.
    iconId: 'glyph.hammer',
    pinned: true,
    // No result restriction — shows every artifact regardless of sell/keep label.
    snapshot: makeBuiltinFilterSnapshot(undefined, ARTIFACT_SLOT_IDS),
  },
  {
    id: 'builtin:all-accessories',
    name: 'All Accessories',
    savedAt: '',
    builtin: true,
    // Monochrome crystal glyph (◇) evokes accessories (Ring/Amulet/Banner); pinned by default alongside All Artifacts.
    iconId: 'glyph.crystal',
    pinned: true,
    // No result restriction — shows every accessory regardless of sell/keep label.
    snapshot: makeBuiltinFilterSnapshot(undefined, ACCESSORY_SLOT_IDS),
  },
  {
    id: 'builtin:sell',
    name: 'Show only Sell',
    savedAt: '',
    builtin: true,
    // Monochrome recycle glyph evokes selling/discarding gear.
    iconId: 'glyph.recycle',
    snapshot: makeBuiltinFilterSnapshot(SELL_ONLY_RESULT),
  },
  {
    id: 'builtin:scoped-sell',
    name: 'Scoped Sell',
    savedAt: '',
    builtin: true,
    // Target evokes the narrowed/scoped selection (sell + scope, inventory + vault sources).
    iconId: 'glyph.target',
    // No slot list — the plain Scoped Sell preset leaves slots unrestricted.
    snapshot: makeScopedSellSnapshot(),
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
  // Built-in stubs store only { id, builtin: true } plus any user overrides; resolve to full preset data.
  if (rec['builtin'] === true) {
    const builtin = BUILTIN_FILTER_PRESET_MAP.get(id) ?? null
    if (!builtin) return null
    const result: FilterPreset = { ...builtin }
    // Restore the hidden flag persisted in the compact stub.
    if (rec['hidden'] === true) result.hidden = true
    // icon/pin resolve from the definition unless the stub carries an explicit override.
    const { iconId, pinned } = resolveBuiltinIconPin(builtin, rec)
    delete result.iconId
    delete result.pinned
    if (iconId) result.iconId = iconId
    if (pinned) result.pinned = true
    return result
  }
  const name = sanitizePresetName(rec['name'])
  if (!name) return null
  // exactOptionalPropertyTypes: spread color only when present so the field stays absent for uncolored presets.
  const color = sanitizePresetColor(rec['color'])
  const colorField: Pick<FilterPreset, 'color'> = color !== undefined ? { color } : {}
  // exactOptionalPropertyTypes: spread iconId only when valid so uncolored/iconless presets stay field-absent.
  const iconId = sanitizePresetIconId(rec['iconId'])
  const iconField: Pick<FilterPreset, 'iconId'> = iconId !== undefined ? { iconId } : {}
  // exactOptionalPropertyTypes: spread pinned only when explicitly true.
  const pinnedField: Pick<FilterPreset, 'pinned'> = rec['pinned'] === true ? { pinned: true } : {}
  // exactOptionalPropertyTypes: spread hidden only when explicitly true.
  const hiddenField: Pick<FilterPreset, 'hidden'> = rec['hidden'] === true ? { hidden: true } : {}
  // exactOptionalPropertyTypes: spread exclusive only when explicitly true (absent = OR/merge).
  const exclusiveField: Pick<FilterPreset, 'exclusive'> = rec['exclusive'] === true ? { exclusive: true } : {}
  return {
    id,
    name,
    savedAt: sanitizePresetSavedAt(rec['savedAt']),
    snapshot: sanitizeFilterPresetSnapshot(rec['snapshot']),
    ...colorField,
    ...iconField,
    ...pinnedField,
    ...hiddenField,
    ...exclusiveField,
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
    // Append any built-ins absent from stored order at the END (e.g. ones added in a later version),
    // so existing users get new built-ins last without disturbing their saved order/customizations.
    const storedIds = new Set(sanitized.map((p) => p.id))
    const missing = BUILTIN_FILTER_PRESETS.filter((p) => !storedIds.has(p.id))
    return [...sanitized, ...missing]
  } catch {
    return [...BUILTIN_FILTER_PRESETS]
  }
}

const serializePresets = (value: FilterPreset[]): string | null => {
  // Keep storage clean: prefer removing the key when there's nothing to save.
  if (!Array.isArray(value) || value.length === 0) return null
  // Built-ins are stored as compact stubs so snapshot data isn't duplicated in localStorage.
  // Include hidden + any icon/pin override in the stub so user customizations survive a reload.
  const toStore = value.map((p) => {
    if (!p.builtin) return p
    const stub: Record<string, unknown> = { id: p.id, builtin: true }
    if (p.hidden) stub.hidden = true
    // Persist icon/pin only when they differ from the shipped definition (compact + lossless).
    Object.assign(stub, buildBuiltinIconPinStub(p, BUILTIN_FILTER_PRESET_MAP.get(p.id) ?? {}))
    return stub
  })
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

/**
 * Structural equality between two filter-preset snapshots, used to decide whether a
 * pinned preset is the currently-active state (Apply ⇄ Clear toggle). Both sides pass
 * through sanitizeFilterPresetSnapshot so key order is deterministic and the optional
 * sort field is handled identically — a preset that omits sort compares as "sort-agnostic".
 * Callers capture the live state with matching includeSort so the optional field aligns.
 */
export const filterPresetSnapshotsEqual = (a: FilterPresetSnapshot, b: FilterPresetSnapshot): boolean =>
  JSON.stringify(sanitizeFilterPresetSnapshot(a)) === JSON.stringify(sanitizeFilterPresetSnapshot(b))
