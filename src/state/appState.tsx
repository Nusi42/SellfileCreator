/**
 * appState.tsx
 *
 * Central app state context with a small, explicit reducer. Why: `App.tsx`
 * carries several cross-cutting pieces of state that multiple child components
 * read/update. Moving these into a provider reduces prop drilling and keeps
 * behavior consistent without introducing a third-party state library.
 */
import React, { createContext, useContext, useMemo, useReducer } from 'react'
import { FINAL_SELL_DEFAULT_LEVELS } from '../lib/constants'
import { buildDefaultSafeguardRules } from '../lib/safeguards'
import {
  FINAL_SELL_DEFAULT_SETS_MODE,
  LOGIC_HUB_DIALOG_TAB_FINAL_SELL,
  type LogicHubDialogTab,
  type FinalSellRemainderConfig,
} from '../lib/logicHub'
import type { BuilderRecipe, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import { normalizeMetasetIcons } from '../lib/metasets'
import type { LevelMilestone } from '../lib/types'
import type { SafeguardRule } from '../lib/safeguards'
import type { NoteRecipeOverridesAnswers } from '../lib/noteRecipeOverrides'

type AppState = {
  customRecipes: BuilderRecipe[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  // Final "sell others" rule configuration, saved with SFR.
  // This adds catch-all Sell rules at selected level ranges for artifacts/accessories.
  finalSellRemainder: FinalSellRemainderConfig
  logicHubDialogTab: LogicHubDialogTab
  safeguardRules: SafeguardRule[]
  safeguardsEnabled: boolean
  selectedRecipeIdx: number | null
  sfrNote: string | null
  // Session-only recipeOverrides answers keyed by question ID.
  noteRecipeOverridesAnswers: NoteRecipeOverridesAnswers
  // Session-only flag to ignore recipe overrides prompts.
  noteRecipeOverridesDisabled: boolean
}

type Updater<T> = T | ((prev: T) => T)

type Action =
  | { type: 'setCustomRecipes'; value: Updater<BuilderRecipe[]> }
  | { type: 'setMetasets'; value: Updater<Metaset[]> }
  | { type: 'setSubstatTargets'; value: Updater<SubstatTargetTable> }
  | { type: 'setFinalSellRemainder'; value: Updater<FinalSellRemainderConfig> }
  | { type: 'setLogicHubDialogTab'; value: Updater<LogicHubDialogTab> }
  | { type: 'setSafeguardRules'; value: Updater<SafeguardRule[]> }
  | { type: 'setSafeguardsEnabled'; value: Updater<boolean> }
  | { type: 'setSelectedRecipeIdx'; value: Updater<number | null> }
  | { type: 'setSfrNote'; value: Updater<string | null> }
  | { type: 'setNoteRecipeOverridesAnswers'; value: Updater<NoteRecipeOverridesAnswers> }
  | { type: 'setNoteRecipeOverridesDisabled'; value: Updater<boolean> }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setCustomRecipes': {
      const next = typeof action.value === 'function' ? (action.value as (p: BuilderRecipe[]) => BuilderRecipe[])(state.customRecipes) : action.value
      return { ...state, customRecipes: next }
    }
    case 'setMetasets': {
      const next = typeof action.value === 'function' ? (action.value as (p: Metaset[]) => Metaset[])(state.metasets) : action.value
      return { ...state, metasets: normalizeMetasetIcons(next) }
    }
    case 'setSubstatTargets': {
      const next = typeof action.value === 'function' ? (action.value as (p: SubstatTargetTable) => SubstatTargetTable)(state.substatTargets) : action.value
      return { ...state, substatTargets: next }
    }
    case 'setFinalSellRemainder': {
      const next = typeof action.value === 'function'
        ? (action.value as (p: FinalSellRemainderConfig) => FinalSellRemainderConfig)(state.finalSellRemainder)
        : action.value
      return { ...state, finalSellRemainder: next }
    }
    case 'setLogicHubDialogTab': {
      // Store the dialog tab preference centrally so autosave + restore flows can keep it in sync.
      const next = typeof action.value === 'function'
        ? (action.value as (p: LogicHubDialogTab) => LogicHubDialogTab)(state.logicHubDialogTab)
        : action.value
      return { ...state, logicHubDialogTab: next }
    }
    case 'setSafeguardRules': {
      const next = typeof action.value === 'function'
        ? (action.value as (p: SafeguardRule[]) => SafeguardRule[])(state.safeguardRules)
        : action.value
      return { ...state, safeguardRules: next }
    }
    case 'setSafeguardsEnabled': {
      const next = typeof action.value === 'function'
        ? (action.value as (p: boolean) => boolean)(state.safeguardsEnabled)
        : Boolean(action.value)
      return { ...state, safeguardsEnabled: next }
    }
    case 'setSelectedRecipeIdx': {
      const next = typeof action.value === 'function' ? (action.value as (p: number | null) => number | null)(state.selectedRecipeIdx) : action.value
      return { ...state, selectedRecipeIdx: next }
    }
    case 'setSfrNote': {
      const next = typeof action.value === 'function' ? (action.value as (p: string | null) => string | null)(state.sfrNote) : action.value
      return { ...state, sfrNote: next }
    }
    case 'setNoteRecipeOverridesAnswers': {
      const next = typeof action.value === 'function'
        ? (action.value as (p: NoteRecipeOverridesAnswers) => NoteRecipeOverridesAnswers)(state.noteRecipeOverridesAnswers)
        : action.value
      return { ...state, noteRecipeOverridesAnswers: next }
    }
    case 'setNoteRecipeOverridesDisabled': {
      const next = typeof action.value === 'function'
        ? (action.value as (p: boolean) => boolean)(state.noteRecipeOverridesDisabled)
        : Boolean(action.value)
      return { ...state, noteRecipeOverridesDisabled: next }
    }
    default: return state
  }
}

type AppDispatchers = {
  setCustomRecipes: (v: Updater<BuilderRecipe[]>) => void
  setMetasets: (v: Updater<Metaset[]>) => void
  setSubstatTargets: (v: Updater<SubstatTargetTable>) => void
  setFinalSellRemainder: (v: Updater<FinalSellRemainderConfig>) => void
  setLogicHubDialogTab: (v: Updater<LogicHubDialogTab>) => void
  setSafeguardRules: (v: Updater<SafeguardRule[]>) => void
  setSafeguardsEnabled: (v: Updater<boolean>) => void
  setSelectedRecipeIdx: (v: Updater<number | null>) => void
  setSfrNote: (v: Updater<string | null>) => void
  setNoteRecipeOverridesAnswers: (v: Updater<NoteRecipeOverridesAnswers>) => void
  setNoteRecipeOverridesDisabled: (v: Updater<boolean>) => void
}

const AppStateCtx = createContext<AppState | null>(null)
const AppDispatchCtx = createContext<AppDispatchers | null>(null)

export function AppStateProvider({ initial, children }: { initial: AppState; children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)

  const actions: AppDispatchers = useMemo(() => ({
    setCustomRecipes: (v) => dispatch({ type: 'setCustomRecipes', value: v }),
    setMetasets: (v) => dispatch({ type: 'setMetasets', value: v }),
    setSubstatTargets: (v) => dispatch({ type: 'setSubstatTargets', value: v }),
    setFinalSellRemainder: (v) => dispatch({ type: 'setFinalSellRemainder', value: v }),
    setLogicHubDialogTab: (v) => dispatch({ type: 'setLogicHubDialogTab', value: v }),
    setSafeguardRules: (v) => dispatch({ type: 'setSafeguardRules', value: v }),
    setSafeguardsEnabled: (v) => dispatch({ type: 'setSafeguardsEnabled', value: v }),
    setSelectedRecipeIdx: (v) => dispatch({ type: 'setSelectedRecipeIdx', value: v }),
    setSfrNote: (v) => dispatch({ type: 'setSfrNote', value: v }),
    setNoteRecipeOverridesAnswers: (v) => dispatch({ type: 'setNoteRecipeOverridesAnswers', value: v }),
    setNoteRecipeOverridesDisabled: (v) => dispatch({ type: 'setNoteRecipeOverridesDisabled', value: v }),
  }), [])

  return (
    <AppStateCtx.Provider value={state}>
      <AppDispatchCtx.Provider value={actions}>{children}</AppDispatchCtx.Provider>
    </AppStateCtx.Provider>
  )
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateCtx)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}

export function useAppActions(): AppDispatchers {
  const ctx = useContext(AppDispatchCtx)
  if (!ctx) throw new Error('useAppActions must be used within AppStateProvider')
  return ctx
}

// Helper to build an initial state object from call sites.
export function makeInitialAppState(params: Partial<AppState> & Pick<AppState, 'substatTargets' | 'metasets'>): AppState {
  const { metasets, ...rest } = params
  return {
    customRecipes: [],
    // Final Sell defaults: leave the standard level ranges visible but keep both gear toggles off until the user opts in.
    finalSellRemainder: { artifacts: false, accessories: false, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as LevelMilestone[], setsMode: FINAL_SELL_DEFAULT_SETS_MODE },
    logicHubDialogTab: LOGIC_HUB_DIALOG_TAB_FINAL_SELL, // Start new sessions on the classic Logic Hub tab for continuity.
    safeguardRules: buildDefaultSafeguardRules(),
    safeguardsEnabled: false,
    selectedRecipeIdx: null,
    sfrNote: null,
    // Recipe overrides answers are stored only in autosave/session state.
    noteRecipeOverridesAnswers: {},
    // Recipe overrides are enabled by default when a note includes markers.
    noteRecipeOverridesDisabled: false,
    ...rest,
    metasets: normalizeMetasetIcons(metasets),
  }
}
