/**
 * useAutosaveRestore
 *
 * Encapsulates autosave restore prompt and enablement logic. Keeps the
 * previous autosave intact until the user either restores it or makes a
 * change after dismissing. Exposes dialog state and whether autosave is
 * currently enabled.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadAutosave } from '../lib/autosave'
import { parseSfrObject } from '../lib/sfrIO'
import { getPersistedRuntimeGearSetNameMap } from '../lib/gearSets/runtimeStore'
import { normalizeMetasetIconId } from '../lib/metasetIcons'
import type { SubstatTargetTable, BuilderRecipe } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { LogicHubDialogTab, FinalSellRemainderConfig } from '../lib/logicHub'
import { LOGIC_HUB_DIALOG_TAB_FINAL_SELL, LOGIC_HUB_DIALOG_TABS } from '../lib/logicHub'
import type { RulesFilterState } from '../lib/rulesFilter'
import { canonicalize } from '../lib/canonicalize'
import {
  RULES_FILTER_OPEN_DEFAULT,
  RULES_FILTER_PREVIEW_MODES,
  RULES_FILTER_COLLAPSIBLE_SECTION_IDS,
  type RulesFilterPreviewMode,
  cloneDefaultRulesFilterCollapsed,
  cloneDefaultRulesFilterState,
  type CollapsedSections,
} from '../state/rulesFilterPersistence'
import { GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT, type GearInspectorRecipeFilterMode } from '../types/gearInspectorRecipeFilterMode'
import type { SafeguardRule } from '../lib/safeguards'
import { sanitizeSafeguardsGridFilterMode, type SafeguardsGridFilterMode } from '../state/safeguardsPreferences'
import {
  NOTE_RECIPE_OVERRIDES_ANSWERS_KEY,
  NOTE_RECIPE_OVERRIDES_DISABLED_KEY,
  normalizeNoteRecipeOverridesAnswers,
  type NoteRecipeOverridesAnswers,
} from '../lib/noteRecipeOverrides'
import {
  isDefaultGearInspectorSubstatSortState,
  normalizeGearInspectorSubstatSortState,
  type GearInspectorSubstatSortState,
} from '../state/gearInspectorSubstatSortPreferences'
import {
  cloneDefaultBuilderPanelCollapsed,
  parseBuilderPanelCollapsedFromRaw,
  type BuilderPanelCollapsedSections,
} from '../state/builderPreferences'

export type RestoreDraft = {
  Version?: string
  Metasets?: Metaset[]
  substatTargets?: SubstatTargetTable
  Recipes?: BuilderRecipe[]
  FinalSellRemainder?: FinalSellRemainderConfig
  Safeguards?: SafeguardRule[]
  SafeguardsEnabled?: boolean
  RecipesEnabled?: boolean
  SelectedRecipeIndex?: number
  Note?: string
  NoteRecipeOverridesAnswers?: NoteRecipeOverridesAnswers
  NoteRecipeOverridesDisabled?: boolean
  AutosaveSavedAt?: string
  Filters?: AutosaveFiltersState
  TesterSort?: GearInspectorSubstatSortState
  LogicHubDialogTab?: LogicHubDialogTab
  SafeguardsGridFilterMode?: SafeguardsGridFilterMode
}

export type AutosaveFilterView = {
  open: boolean
  state: RulesFilterState
  collapsed: CollapsedSections
}

export type AutosaveFiltersState = {
  activeMode: RulesFilterPreviewMode
  views: Record<RulesFilterPreviewMode, AutosaveFilterView>
  testerRecipeFilterMode?: GearInspectorRecipeFilterMode
  // Builder section collapse state — one entry per builder panel.
  // Absent means all sections are expanded (defaults).
  builderRecipeCollapsed?: BuilderPanelCollapsedSections
  builderSafeguardCollapsed?: BuilderPanelCollapsedSections
}

type InitialAutosaveState = {
  restoreDlgOpen: boolean
  restoreDraft: RestoreDraft | null
  enabled: boolean
}

export const metasetsSignature = (mets?: Metaset[] | null): string => {
  if (!mets || mets.length === 0) return '[]'
  const copy = mets.map((m) => ({
    name: m.name,
    sets: [...(m.sets ?? [])].sort((a, b) => a - b),
    iconId: normalizeMetasetIconId(m.iconId),
  }))
  copy.sort((a, b) => {
    const n = a.name.localeCompare(b.name)
    if (n !== 0) return n
    const as = JSON.stringify(a.sets)
    const bs = JSON.stringify(b.sets)
    return as.localeCompare(bs)
  })
  return JSON.stringify(copy)
}

// Stable per-metaset fingerprint used for ID remapping (not sorting-based like metasetsSignature).
// Matches metasets by the three fields the signature already considers, excluding id.
const metaContentKey = (m: Metaset): string =>
  JSON.stringify({
    name: m.name,
    sets: [...(m.sets ?? [])].sort((a, b) => a - b),
    iconId: normalizeMetasetIconId(m.iconId),
  })

/**
 * Build a map from saved-autosave metaset IDs to current-session metaset IDs
 * for entries whose content (name + sets + iconId) is identical but whose ID
 * differs. This happens when default metasets are versioned (e.g. dmeta_nuker_v1
 * → dmeta_nuker_v2) or when an older autosave used timestamp-based IDs.
 * Only entries that actually differ in ID are included so callers can skip the
 * remapping step cheaply when the map is empty.
 */
function buildMetasetIdRemap(saved: Metaset[], current: Metaset[]): Map<string, string> {
  // Index current metasets by content key for O(n) lookup.
  const currentByKey = new Map<string, string>()
  for (const m of current) {
    const key = metaContentKey(m)
    // First occurrence wins — duplicate-content metasets are unusual but safe to skip.
    if (!currentByKey.has(key)) currentByKey.set(key, m.id)
  }
  const remap = new Map<string, string>()
  for (const s of saved) {
    const currentId = currentByKey.get(metaContentKey(s))
    // Only remap when a match exists and the IDs actually differ.
    if (currentId && currentId !== s.id) remap.set(s.id, currentId)
  }
  return remap
}

/** Apply a metaset ID remap to a recipe's artifactMetaSets list. */
function remapRecipeMetaIds(recipe: BuilderRecipe, remap: Map<string, string>): BuilderRecipe {
  const ids = recipe.artifactMetaSets
  if (!ids || ids.length === 0) return recipe
  // Only clone when at least one ID actually needs remapping to avoid churn.
  const remapped = ids.map((id) => remap.get(id) ?? id)
  const changed = remapped.some((id, i) => id !== ids[i])
  if (!changed) return recipe
  return { ...recipe, artifactMetaSets: remapped }
}

/** Apply a metaset ID remap to a safeguard rule's combination.metaSetIds list. */
function remapSafeguardMetaIds(rule: SafeguardRule, remap: Map<string, string>): SafeguardRule {
  const ids = rule.combination?.metaSetIds
  if (!ids || ids.length === 0) return rule
  const remapped = ids.map((id) => remap.get(id) ?? id)
  const changed = remapped.some((id, i) => id !== ids[i])
  if (!changed) return rule
  return { ...rule, combination: { ...rule.combination, metaSetIds: remapped } }
}

export const substatTargetsSignature = (targets?: SubstatTargetTable | null): string => {
  if (!targets) return ''
  return JSON.stringify(canonicalize(targets))
}

const normalizeAutosaveFilters = (filters: AutosaveFiltersState | null | undefined): AutosaveFiltersState | null => {
  if (!filters) return null
  const views: Record<RulesFilterPreviewMode, AutosaveFilterView> = {} as Record<RulesFilterPreviewMode, AutosaveFilterView>
  for (const mode of RULES_FILTER_PREVIEW_MODES) {
    const view = filters.views?.[mode]
    views[mode] = {
      open: Boolean(view?.open),
      state: view?.state ?? cloneDefaultRulesFilterState(),
      collapsed: view?.collapsed ?? cloneDefaultRulesFilterCollapsed(),
    }
  }
  // Normalize builder collapsed to defaults when absent.
  const builderRecipeCollapsed = filters.builderRecipeCollapsed ?? cloneDefaultBuilderPanelCollapsed()
  const builderSafeguardCollapsed = filters.builderSafeguardCollapsed ?? cloneDefaultBuilderPanelCollapsed()
  return {
    activeMode: filters.activeMode === 'gearInspector' ? 'gearInspector' : 'rules',
    views,
    testerRecipeFilterMode: filters.testerRecipeFilterMode ?? GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT,
    builderRecipeCollapsed,
    builderSafeguardCollapsed,
  }
}

const parseGearInspectorRecipeFilterMode = (raw: unknown): GearInspectorRecipeFilterMode | undefined => (
  raw === 'first' || raw === 'any' || raw === 'off'
    ? raw
    : undefined
)

const parseCollapsedSections = (raw: unknown): CollapsedSections => {
  const next = cloneDefaultRulesFilterCollapsed()
  if (!raw || typeof raw !== 'object') return next
  const rec = raw as Record<string, unknown>
  for (const section of RULES_FILTER_COLLAPSIBLE_SECTION_IDS) {
    const value = rec[section]
    if (typeof value === 'boolean') {
      next[section] = value
    }
  }
  return next
}

// Autosave payloads must use the current per-mode view structure.
// Invalid or legacy payloads return null so restore can fail safely.
const parseSavedFilters = (raw: unknown): AutosaveFiltersState | null => {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  if (!rec['views'] || typeof rec['views'] !== 'object') return null
  const viewsRaw = rec['views'] as Record<string, unknown>
  const views = {} as Record<RulesFilterPreviewMode, AutosaveFilterView>
  for (const mode of RULES_FILTER_PREVIEW_MODES) {
    const viewRaw = viewsRaw[mode]
    if (!viewRaw || typeof viewRaw !== 'object') {
      views[mode] = {
        open: RULES_FILTER_OPEN_DEFAULT,
        state: cloneDefaultRulesFilterState(),
        collapsed: cloneDefaultRulesFilterCollapsed(),
      }
      continue
    }
    const viewRec = viewRaw as Record<string, unknown>
    const stateRaw = viewRec['state']
    const state = (stateRaw && typeof stateRaw === 'object')
      ? stateRaw as RulesFilterState
      : cloneDefaultRulesFilterState()
    views[mode] = {
      open: viewRec['open'] === true,
      state,
      collapsed: parseCollapsedSections(viewRec['collapsed']),
    }
  }
  const gearInspectorModeRaw = rec['testerRecipeFilterMode']
  const gearInspectorRecipeFilterMode = parseGearInspectorRecipeFilterMode(gearInspectorModeRaw)
  const activeModeRaw = rec['activeMode']
  // Validate stored mode; unrecognized values fall back to 'rules'.
  const activeMode: RulesFilterPreviewMode = activeModeRaw === 'gearInspector' ? 'gearInspector' : 'rules'
  // Parse builder section collapse state; missing or invalid values fall back to all-expanded defaults.
  const builderRecipeCollapsed = parseBuilderPanelCollapsedFromRaw(rec['builderRecipeCollapsed'])
  const builderSafeguardCollapsed = parseBuilderPanelCollapsedFromRaw(rec['builderSafeguardCollapsed'])
  return {
    activeMode,
    views,
    ...(gearInspectorRecipeFilterMode ? { testerRecipeFilterMode: gearInspectorRecipeFilterMode } : {}),
    builderRecipeCollapsed,
    builderSafeguardCollapsed,
  }
}

export const filtersSignature = (filters: AutosaveFiltersState | null | undefined): string => {
  const normalized = normalizeAutosaveFilters(filters)
  if (!normalized) return ''
  const views = RULES_FILTER_PREVIEW_MODES.map((mode) => ({
    mode,
    open: normalized.views[mode].open,
    state: canonicalize(normalized.views[mode].state),
    collapsed: canonicalize(normalized.views[mode].collapsed),
  }))
  // Include builder section collapse so a non-default layout is not silently dropped.
  return JSON.stringify({
    activeMode: normalized.activeMode,
    views,
    testerRecipeFilterMode: normalized.testerRecipeFilterMode ?? GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT,
    builderRecipeCollapsed: canonicalize(normalized.builderRecipeCollapsed),
    builderSafeguardCollapsed: canonicalize(normalized.builderSafeguardCollapsed),
  })
}

const DEFAULT_AUTOSAVE_FILTERS_SIGNATURE = filtersSignature({
  activeMode: 'rules',
  views: RULES_FILTER_PREVIEW_MODES.reduce((acc, mode) => {
    acc[mode] = {
      open: RULES_FILTER_OPEN_DEFAULT,
      state: cloneDefaultRulesFilterState(),
      collapsed: cloneDefaultRulesFilterCollapsed(),
    }
    return acc
  }, {} as Record<RulesFilterPreviewMode, AutosaveFilterView>),
  testerRecipeFilterMode: GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT,
})

// Treat exact matches to the factory defaults as "no filters" so autosave stays clean.
export const areAutosaveFiltersDefault = (filters: AutosaveFiltersState | null | undefined): boolean => {
  if (!filters) return true
  return filtersSignature(filters) === DEFAULT_AUTOSAVE_FILTERS_SIGNATURE
}

// Compare meaningful view state: filter criteria (state, activeMode, gearInspectorRecipeFilterMode)
// plus builder section collapse state. Filter-panel open/collapsed is still excluded because
// merely having a drawer open doesn't warrant a restore prompt — but builder section layout is
// a deliberate workspace preference the user wants restored.
const filterContentSignature = (filters: AutosaveFiltersState | null | undefined): string => {
  const normalized = normalizeAutosaveFilters(filters)
  if (!normalized) return ''
  const views = RULES_FILTER_PREVIEW_MODES.map((mode) => ({
    mode,
    state: canonicalize(normalized.views[mode].state),
  }))
  return JSON.stringify({
    activeMode: normalized.activeMode,
    views,
    testerRecipeFilterMode: normalized.testerRecipeFilterMode ?? GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT,
    builderRecipeCollapsed: canonicalize(normalized.builderRecipeCollapsed),
    builderSafeguardCollapsed: canonicalize(normalized.builderSafeguardCollapsed),
  })
}

const DEFAULT_FILTER_CONTENT_SIGNATURE = filterContentSignature({
  activeMode: 'rules',
  views: RULES_FILTER_PREVIEW_MODES.reduce((acc, mode) => {
    acc[mode] = {
      open: RULES_FILTER_OPEN_DEFAULT,
      state: cloneDefaultRulesFilterState(),
      collapsed: cloneDefaultRulesFilterCollapsed(),
    }
    return acc
  }, {} as Record<RulesFilterPreviewMode, AutosaveFilterView>),
  testerRecipeFilterMode: GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT,
})

// Returns true when only UI state (panel open, collapsed sections) differs — no filter
// criteria have actually changed. Used to suppress the "filter panel" restore prompt
// and the pre-dialog filter reset when the user hasn't changed any active filters.
export const areFilterContentsDefault = (filters: AutosaveFiltersState | null | undefined): boolean => {
  if (!filters) return true
  return filterContentSignature(filters) === DEFAULT_FILTER_CONTENT_SIGNATURE
}

export const finalSellSignature = (fsr?: FinalSellRemainderConfig | null): string => {
  if (!fsr) return ''
  return JSON.stringify(canonicalize(fsr))
}

function computeInitialAutosaveState(args: {
  key: string
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  recipes: BuilderRecipe[]
  finalSellRemainder: FinalSellRemainderConfig
  note: string | null
  noteRecipeOverridesAnswers: NoteRecipeOverridesAnswers
  filters: AutosaveFiltersState
  gearInspectorSort: GearInspectorSubstatSortState
  safeguardRules: SafeguardRule[]
  safeguardsEnabled: boolean
  recipesEnabled: boolean
  safeguardsGridFilterMode: SafeguardsGridFilterMode
  storedRuntimeGearSetCount: number
}): InitialAutosaveState {
  try {
    const entry = loadAutosave<unknown>(args.key)
    if (entry && args.recipes.length === 0) {
      // Build a dormant runtime-name map from localStorage.
      // Why: autosave drafts store readable set names even for runtime sets.
      // We must resolve those names without auto-applying runtime gear sets.
      const runtimeSetNameMap = getPersistedRuntimeGearSetNameMap()
      const parsed = parseSfrObject(
        entry.payload as unknown,
        { metasets: args.metasets, substatTargets: args.substatTargets },
        { runtimeSetNameMap },
      )
      const recipes = parsed.recipes
      const savedMetasets = parsed.metasets
      const savedSubstatTargets = parsed.substatTargets
      const savedFinalSell = parsed.finalSellRemainder
      const savedSafeguards = parsed.safeguardRules ?? []
      const savedKeepEnabled = parsed.safeguardsEnabled ?? false
      const metasetsMatchDefaults = metasetsSignature(savedMetasets as Metaset[]) === metasetsSignature(args.metasets)
      // When metasets match by content but have different IDs (e.g. autosave
      // written before a default-metaset ID versioning bump, or before the
      // dmeta_ prefix was introduced), recipes and safeguards in the autosave
      // still carry the old IDs. Remap them to the current session IDs so
      // restored recipes render their metaset chips correctly.
      // Why here: parseSfrObject resolves recipe metaset IDs from the *saved*
      // metaset list, not the session list, so stale IDs always come through.
      const metaIdRemap = metasetsMatchDefaults
        ? buildMetasetIdRemap(savedMetasets as Metaset[], args.metasets)
        : new Map<string, string>()
      const remappedRecipes = metaIdRemap.size > 0
        ? recipes.map((r) => remapRecipeMetaIds(r, metaIdRemap))
        : recipes
      const remappedSafeguards = metaIdRemap.size > 0
        ? savedSafeguards.map((r) => remapSafeguardMetaIds(r, metaIdRemap))
        : savedSafeguards
      // Compare canonicalized copies so reordering the variant keys (common when
      // editing via the dialog) does not trick autosave into thinking the
      // session diverged.
      const substatTargetsMatchDefaults = substatTargetsSignature(savedSubstatTargets) === substatTargetsSignature(args.substatTargets)
      const finalSellMatches = finalSellSignature(savedFinalSell) === finalSellSignature(args.finalSellRemainder)
      const savedFiltersRaw = (entry.payload && typeof entry.payload === 'object')
        ? (entry.payload as Record<string, unknown>)['Filters']
        : null
      const savedFilters = parseSavedFilters(savedFiltersRaw)
      const filtersMatchDefaults = areAutosaveFiltersDefault(savedFilters)
      const savedGearInspectorSortRaw = (entry.payload && typeof entry.payload === 'object')
        ? (entry.payload as Record<string, unknown>)['TesterSort']
        : null
      const savedGearInspectorSortNormalized = savedGearInspectorSortRaw ? normalizeGearInspectorSubstatSortState(savedGearInspectorSortRaw) : null
      const savedGearInspectorSort = savedGearInspectorSortNormalized && !isDefaultGearInspectorSubstatSortState(savedGearInspectorSortNormalized)
        ? savedGearInspectorSortNormalized
        : null
      const gearInspectorSortMatchDefaults = savedGearInspectorSort === null
      const safeguardsMatchDefaults = savedSafeguards.length === 0
        && !savedKeepEnabled
        && args.safeguardRules.length === 0
        && !args.safeguardsEnabled
      // Read any recipe overrides answers stored alongside the autosave payload.
      const payloadRecord = (entry.payload && typeof entry.payload === 'object')
        ? (entry.payload as Record<string, unknown>)
        : null
      const savedRecipeOverridesAnswers = normalizeNoteRecipeOverridesAnswers(
        payloadRecord
          ? payloadRecord[NOTE_RECIPE_OVERRIDES_ANSWERS_KEY]
          : null,
      )
      const savedRecipeOverridesDisabled = payloadRecord
        ? payloadRecord[NOTE_RECIPE_OVERRIDES_DISABLED_KEY] === true
        : false
      // Consider either the note or recipe overrides answers as a reason to restore.
      const notePresent = typeof parsed.note === 'string' && parsed.note.trim().length > 0
        || (savedRecipeOverridesAnswers && Object.keys(savedRecipeOverridesAnswers).length > 0)
        || savedRecipeOverridesDisabled
      const payloadRecordForGridMode = entry.payload && typeof entry.payload === 'object'
        ? (entry.payload as Record<string, unknown>)
        : null
      const savedGridFilterModeRaw = payloadRecordForGridMode && (
        typeof payloadRecordForGridMode['SafeguardsGridFilterMode'] === 'string'
          ? payloadRecordForGridMode['SafeguardsGridFilterMode']
          : null
      )
      const savedGridFilterMode = savedGridFilterModeRaw
        ? sanitizeSafeguardsGridFilterMode(savedGridFilterModeRaw)
        : null
      // Treat persisted runtime sets as restore-worthy even if recipes are empty.
      // Why: this is the only UX surface that can re-apply dormant sets.
      const hasStoredRuntimeGearSets = args.storedRuntimeGearSetCount > 0
      const essentiallyDefault = recipes.length === 0
        && metasetsMatchDefaults
        && substatTargetsMatchDefaults
        && finalSellMatches
        && !notePresent
        && filtersMatchDefaults
        && gearInspectorSortMatchDefaults
        && safeguardsMatchDefaults
        && !hasStoredRuntimeGearSets
      if (!essentiallyDefault) {
        const payload = entry.payload as Record<string, unknown>
        const savedAtRaw = typeof payload['AutosaveSavedAt'] === 'string' ? payload['AutosaveSavedAt'] : null
        return {
          restoreDlgOpen: true,
          restoreDraft: {
            Version: String(payload['Version'] ?? ''),
            Metasets: savedMetasets,
            substatTargets: savedSubstatTargets,
            Recipes: remappedRecipes,
            ...(savedFinalSell ? { FinalSellRemainder: savedFinalSell } : {}),
            ...(remappedSafeguards.length ? { Safeguards: remappedSafeguards } : {}),
            ...(savedKeepEnabled ? { SafeguardsEnabled: savedKeepEnabled } : {}),
            ...(savedGridFilterMode ? { SafeguardsGridFilterMode: savedGridFilterMode } : {}),
            ...(parsed.selectedIndex != null ? { SelectedRecipeIndex: parsed.selectedIndex } : {}),
            ...(parsed.note ? { Note: parsed.note } : {}),
            ...(savedRecipeOverridesAnswers ? { [NOTE_RECIPE_OVERRIDES_ANSWERS_KEY]: savedRecipeOverridesAnswers } : {}),
            ...(savedRecipeOverridesDisabled ? { [NOTE_RECIPE_OVERRIDES_DISABLED_KEY]: true } : {}),
            ...(savedAtRaw ? { AutosaveSavedAt: savedAtRaw } : {}),
            ...(savedFilters ? { Filters: savedFilters } : {}),
            ...(savedGearInspectorSort ? { TesterSort: savedGearInspectorSort } : {}),
            ...(() => {
              const rawLogicHubTab = typeof payload['LogicHubDialogTab'] === 'string'
                ? payload['LogicHubDialogTab']
                : null
              if (!rawLogicHubTab) return {}
              const normalized = LOGIC_HUB_DIALOG_TABS.includes(rawLogicHubTab as LogicHubDialogTab)
                ? rawLogicHubTab as LogicHubDialogTab
                : LOGIC_HUB_DIALOG_TAB_FINAL_SELL
              return { LogicHubDialogTab: normalized }
            })(),
          },
          enabled: false,
        }
      }
    }
  } catch {}
  return { restoreDlgOpen: false, restoreDraft: null, enabled: true }
}

export function useAutosaveRestore(opts: {
  key: string
  version: string
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  recipes: BuilderRecipe[]
  finalSellRemainder: FinalSellRemainderConfig
  selectedRecipeIndex: number | null
  note: string | null
  noteRecipeOverridesAnswers: NoteRecipeOverridesAnswers
  noteRecipeOverridesDisabled: boolean
  filters: AutosaveFiltersState
  gearInspectorSort: GearInspectorSubstatSortState
  safeguardRules: SafeguardRule[]
  safeguardsEnabled: boolean
  recipesEnabled: boolean
  logicHubDialogTab: LogicHubDialogTab
  safeguardsGridFilterMode: SafeguardsGridFilterMode
  storedRuntimeGearSetCount: number
}) {
  const {
    key,
    version,
    metasets,
    substatTargets,
    recipes,
    finalSellRemainder,
    selectedRecipeIndex: _selectedRecipeIndex,
    note,
    noteRecipeOverridesAnswers,
    noteRecipeOverridesDisabled,
    filters,
    gearInspectorSort,
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
    logicHubDialogTab,
    safeguardsGridFilterMode,
    storedRuntimeGearSetCount,
  } = opts

  const initialAutosaveStateRef = useRef<InitialAutosaveState | null>(null)
  if (initialAutosaveStateRef.current === null) {
    initialAutosaveStateRef.current = computeInitialAutosaveState({
      key,
      metasets,
      substatTargets,
      recipes,
      finalSellRemainder,
      note,
      noteRecipeOverridesAnswers,
      filters,
      gearInspectorSort,
      safeguardRules,
      safeguardsEnabled,
      recipesEnabled,
      safeguardsGridFilterMode,
      storedRuntimeGearSetCount,
    })
  }
  const { restoreDlgOpen: initialRestoreDlgOpen, restoreDraft: initialRestoreDraft, enabled: initialEnabled } = initialAutosaveStateRef.current
  const [restoreDlgOpen, setRestoreDlgOpen] = useState(initialRestoreDlgOpen)
  const [restoreDraft, setRestoreDraft] = useState<RestoreDraft | null>(initialRestoreDraft)
  const [enabled, setEnabled] = useState(initialEnabled)
  const dismissBaselineRef = useRef<string | null>(null)

  // Snapshot of current state used for divergence detection
  const snapshot = useMemo(() => {
    // Selection changes should not enable autosave by themselves.
    // Exclude SelectedRecipeIndex from the divergence snapshot.
    const filtersForSnapshot = areAutosaveFiltersDefault(filters) ? null : normalizeAutosaveFilters(filters)
    const gearInspectorSortForSnapshot = isDefaultGearInspectorSubstatSortState(gearInspectorSort)
      ? null
      : normalizeGearInspectorSubstatSortState(gearInspectorSort)
    const base = {
      Version: version,
      Metasets: metasets,
      substatTargets,
      Recipes: recipes,
      FinalSellRemainder: finalSellRemainder,
      Safeguards: safeguardRules,
      SafeguardsEnabled: safeguardsEnabled,
      RecipesEnabled: recipesEnabled,
      LogicHubDialogTab: logicHubDialogTab,
      SafeguardsGridFilterMode: safeguardsGridFilterMode,
      // Persist note content and recipe overrides answers only when present.
      ...(note && note.trim() ? { Note: note } : {}),
      ...(Object.keys(noteRecipeOverridesAnswers).length > 0
        ? { [NOTE_RECIPE_OVERRIDES_ANSWERS_KEY]: noteRecipeOverridesAnswers }
        : {}),
      ...(noteRecipeOverridesDisabled ? { [NOTE_RECIPE_OVERRIDES_DISABLED_KEY]: true } : {}),
      ...(filtersForSnapshot ? { Filters: filtersForSnapshot } : {}),
      ...(gearInspectorSortForSnapshot ? { TesterSort: gearInspectorSortForSnapshot } : {}),
    }
    return JSON.stringify(base)
  }, [
    version,
    metasets,
    substatTargets,
    recipes,
    finalSellRemainder,
    note,
    noteRecipeOverridesAnswers,
    noteRecipeOverridesDisabled,
    filters,
    gearInspectorSort,
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
    logicHubDialogTab,
    safeguardsGridFilterMode,
  ])

  // After dismissing, enable autosave only after divergence from baseline
  useEffect(() => {
    const baseline = dismissBaselineRef.current
    const canEnable = !enabled && !restoreDlgOpen && baseline !== null
    canEnable && (() => {
      try { snapshot !== baseline && setEnabled(true) } catch {}
    })()
  }, [enabled, restoreDlgOpen, snapshot])

  const dismiss = () => {
    setRestoreDlgOpen(false)
    try { dismissBaselineRef.current = snapshot } catch { dismissBaselineRef.current = null }
    // Keep previous autosave intact by not enabling here
  }

  const accept = () => {
    setRestoreDlgOpen(false)
    setEnabled(true)
    setRestoreDraft(null)
  }

  return { restoreDlgOpen, restoreDraft, dismissRestore: dismiss, acceptRestore: accept, autosaveEnabled: enabled }
}
