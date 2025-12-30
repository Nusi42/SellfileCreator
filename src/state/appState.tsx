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
import { buildDefaultKeepUniqueRules } from '../lib/keepUniques'
import {
  FINAL_SELL_DEFAULT_SETS_MODE,
  LOGIC_HUB_DIALOG_TAB_FINAL_SELL,
  type LogicHubDialogTab,
  type FinalSellRemainderConfig,
} from '../lib/finalSell'
import type { BuilderConfig, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import { normalizeMetasetIcons } from '../lib/metasets'
import type { LevelMilestone } from '../lib/types'
import type { KeepUniqueRule } from '../lib/keepUniques'
import type { NoteConfigOptionsAnswers } from '../lib/noteConfigOptions'

type AppState = {
  customCfgs: BuilderConfig[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  // Final "sell others" rule configuration, saved with HSFC.
  // This adds catch-all Sell rules at selected level ranges for artifacts/accessories.
  finalSellRemainder: FinalSellRemainderConfig
  logicHubDialogTab: LogicHubDialogTab
  keepUniqueRules: KeepUniqueRule[]
  keepUniquesEnabled: boolean
  selectedCfgIdx: number | null
  hsfcNote: string | null
  // Session-only configOptions answers keyed by question ID.
  noteConfigOptionsAnswers: NoteConfigOptionsAnswers
}

type Updater<T> = T | ((prev: T) => T)

type Action =
  | { type: 'setCustomCfgs'; value: Updater<BuilderConfig[]> }
  | { type: 'setMetasets'; value: Updater<Metaset[]> }
  | { type: 'setSubstatTargets'; value: Updater<SubstatTargetTable> }
  | { type: 'setFinalSellRemainder'; value: Updater<FinalSellRemainderConfig> }
  | { type: 'setLogicHubDialogTab'; value: Updater<LogicHubDialogTab> }
  | { type: 'setKeepUniqueRules'; value: Updater<KeepUniqueRule[]> }
  | { type: 'setKeepUniquesEnabled'; value: Updater<boolean> }
  | { type: 'setSelectedCfgIdx'; value: Updater<number | null> }
  | { type: 'setHsfcNote'; value: Updater<string | null> }
  | { type: 'setNoteConfigOptionsAnswers'; value: Updater<NoteConfigOptionsAnswers> }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setCustomCfgs': {
      const next = typeof action.value === 'function' ? (action.value as (p: BuilderConfig[]) => BuilderConfig[])(state.customCfgs) : action.value
      return { ...state, customCfgs: next }
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
    case 'setKeepUniqueRules': {
      const next = typeof action.value === 'function'
        ? (action.value as (p: KeepUniqueRule[]) => KeepUniqueRule[])(state.keepUniqueRules)
        : action.value
      return { ...state, keepUniqueRules: next }
    }
    case 'setKeepUniquesEnabled': {
      const next = typeof action.value === 'function'
        ? (action.value as (p: boolean) => boolean)(state.keepUniquesEnabled)
        : Boolean(action.value)
      return { ...state, keepUniquesEnabled: next }
    }
    case 'setSelectedCfgIdx': {
      const next = typeof action.value === 'function' ? (action.value as (p: number | null) => number | null)(state.selectedCfgIdx) : action.value
      return { ...state, selectedCfgIdx: next }
    }
    case 'setHsfcNote': {
      const next = typeof action.value === 'function' ? (action.value as (p: string | null) => string | null)(state.hsfcNote) : action.value
      return { ...state, hsfcNote: next }
    }
    case 'setNoteConfigOptionsAnswers': {
      const next = typeof action.value === 'function'
        ? (action.value as (p: NoteConfigOptionsAnswers) => NoteConfigOptionsAnswers)(state.noteConfigOptionsAnswers)
        : action.value
      return { ...state, noteConfigOptionsAnswers: next }
    }
    default: return state
  }
}

type AppDispatchers = {
  setCustomCfgs: (v: Updater<BuilderConfig[]>) => void
  setMetasets: (v: Updater<Metaset[]>) => void
  setSubstatTargets: (v: Updater<SubstatTargetTable>) => void
  setFinalSellRemainder: (v: Updater<FinalSellRemainderConfig>) => void
  setLogicHubDialogTab: (v: Updater<LogicHubDialogTab>) => void
  setKeepUniqueRules: (v: Updater<KeepUniqueRule[]>) => void
  setKeepUniquesEnabled: (v: Updater<boolean>) => void
  setSelectedCfgIdx: (v: Updater<number | null>) => void
  setHsfcNote: (v: Updater<string | null>) => void
  setNoteConfigOptionsAnswers: (v: Updater<NoteConfigOptionsAnswers>) => void
}

const AppStateCtx = createContext<AppState | null>(null)
const AppDispatchCtx = createContext<AppDispatchers | null>(null)

export function AppStateProvider({ initial, children }: { initial: AppState; children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)

  const actions: AppDispatchers = useMemo(() => ({
    setCustomCfgs: (v) => dispatch({ type: 'setCustomCfgs', value: v }),
    setMetasets: (v) => dispatch({ type: 'setMetasets', value: v }),
    setSubstatTargets: (v) => dispatch({ type: 'setSubstatTargets', value: v }),
    setFinalSellRemainder: (v) => dispatch({ type: 'setFinalSellRemainder', value: v }),
    setLogicHubDialogTab: (v) => dispatch({ type: 'setLogicHubDialogTab', value: v }),
    setKeepUniqueRules: (v) => dispatch({ type: 'setKeepUniqueRules', value: v }),
    setKeepUniquesEnabled: (v) => dispatch({ type: 'setKeepUniquesEnabled', value: v }),
    setSelectedCfgIdx: (v) => dispatch({ type: 'setSelectedCfgIdx', value: v }),
    setHsfcNote: (v) => dispatch({ type: 'setHsfcNote', value: v }),
    setNoteConfigOptionsAnswers: (v) => dispatch({ type: 'setNoteConfigOptionsAnswers', value: v }),
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
    customCfgs: [],
    // Final Sell defaults: leave the standard level ranges visible but keep both gear toggles off until the user opts in.
    finalSellRemainder: { artifacts: false, accessories: false, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as LevelMilestone[], setsMode: FINAL_SELL_DEFAULT_SETS_MODE },
    logicHubDialogTab: LOGIC_HUB_DIALOG_TAB_FINAL_SELL, // Start new sessions on the classic Logic Hub tab for continuity.
    keepUniqueRules: buildDefaultKeepUniqueRules(),
    keepUniquesEnabled: false,
    selectedCfgIdx: null,
    hsfcNote: null,
  // Config options answers are stored only in autosave/session state.
    noteConfigOptionsAnswers: {},
    ...rest,
    metasets: normalizeMetasetIcons(metasets),
  }
}
