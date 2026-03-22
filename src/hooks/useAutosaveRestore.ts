/**
 * useAutosaveRestore
 *
 * Encapsulates autosave restore prompt and enablement logic. Keeps the
 * previous autosave intact until the user either restores it or makes a
 * change after dismissing. Exposes dialog state and whether autosave is
 * currently enabled.
 */
import { useMemo, useState } from 'react'
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
  SelectedSafeguardRuleIdx?: number
  Note?: string
  NoteRecipeOverridesAnswers?: NoteRecipeOverridesAnswers
  NoteRecipeOverridesDisabled?: boolean
  AutosaveSavedAt?: string
  Filters?: AutosaveFiltersState
  GearInspectorSort?: GearInspectorSubstatSortState
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
  gearInspectorRecipeFilterMode?: GearInspectorRecipeFilterMode
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

/**
 * True when two metaset lists are interchangeable from the session's perspective:
 * same content (name + sets + iconId via metasetsSignature) AND same IDs.
 * The ID check matters because recipes/safeguards reference metasets by ID —
 * if the saved IDs differ from the session's IDs the references are broken even
 * when the content is identical (e.g. after a default-metaset versioning bump).
 */
export const metasetsEqualSession = (a: Metaset[] | null | undefined, b: Metaset[] | null | undefined): boolean => {
  // Treat missing/empty as equal to empty.
  const aList = a ?? []
  const bList = b ?? []
  if (metasetsSignature(aList) !== metasetsSignature(bList)) return false
  const aIds = new Set(aList.map((m) => m.name))
  const bIds = new Set(bList.map((m) => m.name))
  return aIds.size === bIds.size && [...aIds].every((id) => bIds.has(id))
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
    gearInspectorRecipeFilterMode: filters.gearInspectorRecipeFilterMode ?? GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT,
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
  const gearInspectorModeRaw = rec['gearInspectorRecipeFilterMode']
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
    ...(gearInspectorRecipeFilterMode ? { gearInspectorRecipeFilterMode: gearInspectorRecipeFilterMode } : {}),
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
    gearInspectorRecipeFilterMode: normalized.gearInspectorRecipeFilterMode ?? GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT,
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
  gearInspectorRecipeFilterMode: GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT,
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
    gearInspectorRecipeFilterMode: normalized.gearInspectorRecipeFilterMode ?? GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT,
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
  gearInspectorRecipeFilterMode: GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT,
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
      const metasetsMatchDefaults = metasetsEqualSession(savedMetasets as Metaset[], args.metasets)
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
        ? (entry.payload as Record<string, unknown>)['GearInspectorSort']
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
        // Read selected recipe index from the raw payload (parseSfrObject always returns 0 — not useful here).
        const rawSelIdx = payload['SelectedRecipeIndex']
        const savedRecipeSelIdx = typeof rawSelIdx === 'number' && rawSelIdx >= 0 && rawSelIdx < recipes.length
          ? rawSelIdx
          : null
        // Read selected safeguard rule index from the raw payload; bounds-check against the saved list.
        const rawSelSgIdx = payload['SelectedSafeguardRuleIdx']
        const savedSgSelIdx = typeof rawSelSgIdx === 'number' && rawSelSgIdx >= 0 && rawSelSgIdx < savedSafeguards.length
          ? rawSelSgIdx
          : null
        return {
          restoreDlgOpen: true,
          restoreDraft: {
            Version: String(payload['Version'] ?? ''),
            Metasets: savedMetasets,
            substatTargets: savedSubstatTargets,
            Recipes: recipes,
            ...(savedFinalSell ? { FinalSellRemainder: savedFinalSell } : {}),
            ...(savedSafeguards.length ? { Safeguards: savedSafeguards } : {}),
            ...(savedKeepEnabled ? { SafeguardsEnabled: savedKeepEnabled } : {}),
            ...(savedGridFilterMode ? { SafeguardsGridFilterMode: savedGridFilterMode } : {}),
            ...(savedRecipeSelIdx != null ? { SelectedRecipeIndex: savedRecipeSelIdx } : {}),
            ...(savedSgSelIdx != null ? { SelectedSafeguardRuleIdx: savedSgSelIdx } : {}),
            ...(parsed.note ? { Note: parsed.note } : {}),
            ...(savedRecipeOverridesAnswers ? { [NOTE_RECIPE_OVERRIDES_ANSWERS_KEY]: savedRecipeOverridesAnswers } : {}),
            ...(savedRecipeOverridesDisabled ? { [NOTE_RECIPE_OVERRIDES_DISABLED_KEY]: true } : {}),
            ...(savedAtRaw ? { AutosaveSavedAt: savedAtRaw } : {}),
            ...(savedFilters ? { Filters: savedFilters } : {}),
            ...(savedGearInspectorSort ? { GearInspectorSort: savedGearInspectorSort } : {}),
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

  // Compute initial autosave state once via useState's lazy initializer so we never
  // need a ref read during render for the lazy-init gate.
  const [initialAutosaveState] = useState<InitialAutosaveState>(() => computeInitialAutosaveState({
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
  }))
  const [restoreDlgOpen, setRestoreDlgOpen] = useState(initialAutosaveState.restoreDlgOpen)
  const [restoreDraft, setRestoreDraft] = useState<RestoreDraft | null>(initialAutosaveState.restoreDraft)
  const [enabled, setEnabled] = useState(initialAutosaveState.enabled)
  const [dismissBaseline, setDismissBaseline] = useState<string | null>(null)

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
      ...(gearInspectorSortForSnapshot ? { GearInspectorSort: gearInspectorSortForSnapshot } : {}),
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

  // After dismissing, enable autosave only after divergence from baseline.
  // Render-time state adjustment: when snapshot diverges from baseline, enable immediately.
  const canEnableFromDivergence = !enabled && !restoreDlgOpen && dismissBaseline !== null
  if (canEnableFromDivergence) {
    try {
      if (snapshot !== dismissBaseline) setEnabled(true)
    } catch {}
  }

  const dismiss = () => {
    setRestoreDlgOpen(false)
    try { setDismissBaseline(snapshot) } catch { setDismissBaseline(null) }
    // Keep previous autosave intact by not enabling here
  }

  const accept = () => {
    setRestoreDlgOpen(false)
    setEnabled(true)
    setRestoreDraft(null)
  }

  return { restoreDlgOpen, restoreDraft, dismissRestore: dismiss, acceptRestore: accept, autosaveEnabled: enabled }
}
