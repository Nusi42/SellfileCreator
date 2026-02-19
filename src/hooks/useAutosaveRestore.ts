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
import { parseHsfcObject } from '../lib/hsfcIO'
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
import { TESTER_RECIPE_FILTER_MODE_DEFAULT, type TesterRecipeFilterMode } from '../types/testerRecipeFilterMode'
import type { SafeguardRule } from '../lib/safeguards'
import { sanitizeSafeguardsGridFilterMode, type SafeguardsGridFilterMode } from '../state/safeguardsPreferences'
import {
  NOTE_RECIPE_OVERRIDES_ANSWERS_KEY,
  NOTE_RECIPE_OVERRIDES_DISABLED_KEY,
  normalizeNoteRecipeOverridesAnswers,
  type NoteRecipeOverridesAnswers,
} from '../lib/noteRecipeOverrides'
import {
  isDefaultTesterSubstatSortState,
  normalizeTesterSubstatSortState,
  type TesterSubstatSortState,
} from '../state/testerSubstatSortPreferences'

export type RestoreDraft = {
  Version?: string
  Metasets?: Metaset[]
  substatTargets?: SubstatTargetTable
  Recipes?: BuilderRecipe[]
  FinalSellRemainder?: FinalSellRemainderConfig
  Safeguards?: SafeguardRule[]
  SafeguardsEnabled?: boolean
  SelectedRecipeIndex?: number
  Note?: string
  NoteRecipeOverridesAnswers?: NoteRecipeOverridesAnswers
  NoteRecipeOverridesDisabled?: boolean
  AutosaveSavedAt?: string
  Filters?: AutosaveFiltersState
  TesterSort?: TesterSubstatSortState
  LogicHubDialogTab?: LogicHubDialogTab
  FinalSellDialogTab?: LogicHubDialogTab
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
  testerRecipeFilterMode?: TesterRecipeFilterMode
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
  return {
    activeMode: filters.activeMode === 'tester' ? 'tester' : 'rules',
    views,
    testerRecipeFilterMode: filters.testerRecipeFilterMode ?? TESTER_RECIPE_FILTER_MODE_DEFAULT,
  }
}

const parseTesterRecipeFilterMode = (raw: unknown): TesterRecipeFilterMode | undefined => (
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

// Autosave payloads may come from older versions; decode both the new per-mode structure and the legacy single-mode shape.
const parseSavedFilters = (raw: unknown): AutosaveFiltersState | null => {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  if (rec['views'] && typeof rec['views'] === 'object') {
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
    const testerModeRaw = rec['testerRecipeFilterMode']
    const testerRecipeFilterMode = parseTesterRecipeFilterMode(testerModeRaw)
    const activeModeRaw = rec['activeMode']
    const activeMode: RulesFilterPreviewMode = activeModeRaw === 'tester' ? 'tester' : 'rules'
    return {
      activeMode,
      views,
      ...(testerRecipeFilterMode ? { testerRecipeFilterMode } : {}),
    }
  }
  const stateRaw = rec['state']
  if (!stateRaw || typeof stateRaw !== 'object') return null
  const legacyView: AutosaveFilterView = {
    open: rec['open'] === true,
    state: stateRaw as RulesFilterState,
    collapsed: parseCollapsedSections(rec['collapsed']),
  }
  const testerModeRaw = rec['testerRecipeFilterMode']
  const testerRecipeFilterMode = parseTesterRecipeFilterMode(testerModeRaw)
  const views = RULES_FILTER_PREVIEW_MODES.reduce((acc, mode) => {
    acc[mode] = {
      open: legacyView.open,
      state: legacyView.state,
      collapsed: legacyView.collapsed,
    }
    return acc
  }, {} as Record<RulesFilterPreviewMode, AutosaveFilterView>)
  return {
    activeMode: 'rules',
    views,
    ...(testerRecipeFilterMode ? { testerRecipeFilterMode } : {}),
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
  return JSON.stringify({
    activeMode: normalized.activeMode,
    views,
    testerRecipeFilterMode: normalized.testerRecipeFilterMode ?? TESTER_RECIPE_FILTER_MODE_DEFAULT,
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
  testerRecipeFilterMode: TESTER_RECIPE_FILTER_MODE_DEFAULT,
})

// Treat exact matches to the factory defaults as "no filters" so autosave stays clean.
export const areAutosaveFiltersDefault = (filters: AutosaveFiltersState | null | undefined): boolean => {
  if (!filters) return true
  return filtersSignature(filters) === DEFAULT_AUTOSAVE_FILTERS_SIGNATURE
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
  testerSort: TesterSubstatSortState
  safeguardRules: SafeguardRule[]
  safeguardsEnabled: boolean
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
      const parsed = parseHsfcObject(
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
      const savedTesterSortRaw = (entry.payload && typeof entry.payload === 'object')
        ? (entry.payload as Record<string, unknown>)['TesterSort']
        : null
      const savedTesterSortNormalized = savedTesterSortRaw ? normalizeTesterSubstatSortState(savedTesterSortRaw) : null
      const savedTesterSort = savedTesterSortNormalized && !isDefaultTesterSubstatSortState(savedTesterSortNormalized)
        ? savedTesterSortNormalized
        : null
      const testerSortMatchDefaults = savedTesterSort === null
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
        && testerSortMatchDefaults
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
            Recipes: recipes,
            ...(savedFinalSell ? { FinalSellRemainder: savedFinalSell } : {}),
            ...(savedSafeguards.length ? { Safeguards: savedSafeguards } : {}),
            ...(savedKeepEnabled ? { SafeguardsEnabled: savedKeepEnabled } : {}),
            ...(savedGridFilterMode ? { SafeguardsGridFilterMode: savedGridFilterMode } : {}),
            ...(parsed.selectedIndex != null ? { SelectedRecipeIndex: parsed.selectedIndex } : {}),
            ...(parsed.note ? { Note: parsed.note } : {}),
            ...(savedRecipeOverridesAnswers ? { [NOTE_RECIPE_OVERRIDES_ANSWERS_KEY]: savedRecipeOverridesAnswers } : {}),
            ...(savedRecipeOverridesDisabled ? { [NOTE_RECIPE_OVERRIDES_DISABLED_KEY]: true } : {}),
            ...(savedAtRaw ? { AutosaveSavedAt: savedAtRaw } : {}),
            ...(savedFilters ? { Filters: savedFilters } : {}),
            ...(savedTesterSort ? { TesterSort: savedTesterSort } : {}),
            ...(() => {
              const rawLogicHubTab = typeof payload['LogicHubDialogTab'] === 'string'
                ? payload['LogicHubDialogTab']
                : (typeof payload['FinalSellDialogTab'] === 'string' ? payload['FinalSellDialogTab'] : null)
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
  testerSort: TesterSubstatSortState
  safeguardRules: SafeguardRule[]
  safeguardsEnabled: boolean
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
    testerSort,
    safeguardRules,
    safeguardsEnabled,
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
      testerSort,
      safeguardRules,
      safeguardsEnabled,
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
    const testerSortForSnapshot = isDefaultTesterSubstatSortState(testerSort)
      ? null
      : normalizeTesterSubstatSortState(testerSort)
    const base = {
      Version: version,
      Metasets: metasets,
      substatTargets,
      Recipes: recipes,
      FinalSellRemainder: finalSellRemainder,
      Safeguards: safeguardRules,
      SafeguardsEnabled: safeguardsEnabled,
      LogicHubDialogTab: logicHubDialogTab,
      SafeguardsGridFilterMode: safeguardsGridFilterMode,
      // Persist note content and recipe overrides answers only when present.
      ...(note && note.trim() ? { Note: note } : {}),
      ...(Object.keys(noteRecipeOverridesAnswers).length > 0
        ? { [NOTE_RECIPE_OVERRIDES_ANSWERS_KEY]: noteRecipeOverridesAnswers }
        : {}),
      ...(noteRecipeOverridesDisabled ? { [NOTE_RECIPE_OVERRIDES_DISABLED_KEY]: true } : {}),
      ...(filtersForSnapshot ? { Filters: filtersForSnapshot } : {}),
      ...(testerSortForSnapshot ? { TesterSort: testerSortForSnapshot } : {}),
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
    testerSort,
    safeguardRules,
    safeguardsEnabled,
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
