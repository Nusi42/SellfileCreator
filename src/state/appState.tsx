/**
 * appState.tsx
 *
 * Central app state context with a small, explicit reducer. Why: `App.tsx`
 * carries several cross-cutting pieces of state that multiple child components
 * read/update. Moving these into a provider reduces prop drilling and keeps
 * behavior consistent without introducing a third-party state library.
 */
import React, { createContext, use, useMemo, useReducer } from 'react'
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
import type { NoteSafeguardOverridesAnswers } from '../lib/noteSafeguardOverrides'

type AppState = {
  customRecipes: BuilderRecipe[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  // Final "sell others" rule configuration, saved with SFC.
  // This adds catch-all Sell rules at selected level ranges for artifacts/accessories.
  finalSellRemainder: FinalSellRemainderConfig
  logicHubDialogTab: LogicHubDialogTab
  safeguardRules: SafeguardRule[]
  safeguardsEnabled: boolean
  recipesEnabled: boolean
  selectedRecipeIdx: number | null
  sfcNote: string | null
  // Session-only recipeOverrides answers keyed by question ID.
  noteRecipeOverridesAnswers: NoteRecipeOverridesAnswers
  // Session-only flag to disable all dynamic overrides (recipe + safeguard) prompts.
  noteOverridesDisabled: boolean
  // Session-only safeguard-overrides answers keyed by question ID (slider values + checkbox states).
  noteSafeguardOverridesAnswers: NoteSafeguardOverridesAnswers
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
  | { type: 'setRecipesEnabled'; value: Updater<boolean> }
  | { type: 'setSelectedRecipeIdx'; value: Updater<number | null> }
  | { type: 'setSfcNote'; value: Updater<string | null> }
  | { type: 'setNoteRecipeOverridesAnswers'; value: Updater<NoteRecipeOverridesAnswers> }
  | { type: 'setNoteOverridesDisabled'; value: Updater<boolean> }
  | { type: 'setNoteSafeguardOverridesAnswers'; value: Updater<NoteSafeguardOverridesAnswers> }

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
    case 'setRecipesEnabled': {
      const next = typeof action.value === 'function'
        ? (action.value as (p: boolean) => boolean)(state.recipesEnabled)
        : Boolean(action.value)
      return { ...state, recipesEnabled: next }
    }
    case 'setSelectedRecipeIdx': {
      const next = typeof action.value === 'function' ? (action.value as (p: number | null) => number | null)(state.selectedRecipeIdx) : action.value
      return { ...state, selectedRecipeIdx: next }
    }
    case 'setSfcNote': {
      const next = typeof action.value === 'function' ? (action.value as (p: string | null) => string | null)(state.sfcNote) : action.value
      return { ...state, sfcNote: next }
    }
    case 'setNoteRecipeOverridesAnswers': {
      const next = typeof action.value === 'function'
        ? (action.value as (p: NoteRecipeOverridesAnswers) => NoteRecipeOverridesAnswers)(state.noteRecipeOverridesAnswers)
        : action.value
      return { ...state, noteRecipeOverridesAnswers: next }
    }
    case 'setNoteOverridesDisabled': {
      const next = typeof action.value === 'function'
        ? (action.value as (p: boolean) => boolean)(state.noteOverridesDisabled)
        : Boolean(action.value)
      return { ...state, noteOverridesDisabled: next }
    }
    case 'setNoteSafeguardOverridesAnswers': {
      const next = typeof action.value === 'function'
        ? (action.value as (p: NoteSafeguardOverridesAnswers) => NoteSafeguardOverridesAnswers)(state.noteSafeguardOverridesAnswers)
        : action.value
      return { ...state, noteSafeguardOverridesAnswers: next }
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
  setRecipesEnabled: (v: Updater<boolean>) => void
  setSelectedRecipeIdx: (v: Updater<number | null>) => void
  setSfcNote: (v: Updater<string | null>) => void
  setNoteRecipeOverridesAnswers: (v: Updater<NoteRecipeOverridesAnswers>) => void
  setNoteOverridesDisabled: (v: Updater<boolean>) => void
  setNoteSafeguardOverridesAnswers: (v: Updater<NoteSafeguardOverridesAnswers>) => void
}

const AppStateContext = createContext<AppState | null>(null)
const AppDispatchContext = createContext<AppDispatchers | null>(null)

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
    setRecipesEnabled: (v) => dispatch({ type: 'setRecipesEnabled', value: v }),
    setSelectedRecipeIdx: (v) => dispatch({ type: 'setSelectedRecipeIdx', value: v }),
    setSfcNote: (v) => dispatch({ type: 'setSfcNote', value: v }),
    setNoteRecipeOverridesAnswers: (v) => dispatch({ type: 'setNoteRecipeOverridesAnswers', value: v }),
    setNoteOverridesDisabled: (v) => dispatch({ type: 'setNoteOverridesDisabled', value: v }),
    setNoteSafeguardOverridesAnswers: (v) => dispatch({ type: 'setNoteSafeguardOverridesAnswers', value: v }),
  }), [])

  return (
    <AppStateContext value={state}>
      <AppDispatchContext value={actions}>{children}</AppDispatchContext>
    </AppStateContext>
  )
}

export function useAppState(): AppState {
  const ctx = use(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}

export function useAppActions(): AppDispatchers {
  const ctx = use(AppDispatchContext)
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
    safeguardsEnabled: true,
    recipesEnabled: true,
    selectedRecipeIdx: null,
    sfcNote: null,
    // Recipe overrides answers are stored only in autosave/session state.
    noteRecipeOverridesAnswers: {},
    // Dynamic overrides are enabled by default when a note includes markers.
    noteOverridesDisabled: false,
    // Safeguard overrides answers: stored only in session; cleared on note change.
    noteSafeguardOverridesAnswers: {},
    ...rest,
    metasets: normalizeMetasetIcons(metasets),
  }
}
