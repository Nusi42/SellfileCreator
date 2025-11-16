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
import {
  FINAL_SELL_DEFAULT_SETS_MODE,
  FINAL_SELL_DIALOG_TAB_FINAL_SELL,
  type FinalSellDialogTab,
  type FinalSellRemainderConfig,
} from '../lib/finalSell'
import type { BuilderConfig, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import { normalizeMetasetIcons } from '../lib/metasets'
import type { LevelMilestone } from '../lib/types'
import type { KeepUniqueRule } from '../lib/keepUniques'

type AppState = {
  customCfgs: BuilderConfig[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  // Final "sell others" rule configuration, saved with HSFC.
  // This adds catch-all Sell rules at selected level ranges for artifacts/accessories.
  finalSellRemainder: FinalSellRemainderConfig
  finalSellDialogTab: FinalSellDialogTab
  keepUniqueRules: KeepUniqueRule[]
  keepUniquesEnabled: boolean
  selectedCfgIdx: number | null
  hsfcNote: string | null
}

type Updater<T> = T | ((prev: T) => T)

type Action =
  | { type: 'setCustomCfgs'; value: Updater<BuilderConfig[]> }
  | { type: 'setMetasets'; value: Updater<Metaset[]> }
  | { type: 'setSubstatTargets'; value: Updater<SubstatTargetTable> }
  | { type: 'setFinalSellRemainder'; value: Updater<FinalSellRemainderConfig> }
  | { type: 'setFinalSellDialogTab'; value: Updater<FinalSellDialogTab> }
  | { type: 'setKeepUniqueRules'; value: Updater<KeepUniqueRule[]> }
  | { type: 'setKeepUniquesEnabled'; value: Updater<boolean> }
  | { type: 'setSelectedCfgIdx'; value: Updater<number | null> }
  | { type: 'setHsfcNote'; value: Updater<string | null> }

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
    case 'setFinalSellDialogTab': {
      // Store the dialog tab preference centrally so autosave + restore flows can keep it in sync.
      const next = typeof action.value === 'function'
        ? (action.value as (p: FinalSellDialogTab) => FinalSellDialogTab)(state.finalSellDialogTab)
        : action.value
      return { ...state, finalSellDialogTab: next }
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
    default: return state
  }
}

type AppDispatchers = {
  setCustomCfgs: (v: Updater<BuilderConfig[]>) => void
  setMetasets: (v: Updater<Metaset[]>) => void
  setSubstatTargets: (v: Updater<SubstatTargetTable>) => void
  setFinalSellRemainder: (v: Updater<FinalSellRemainderConfig>) => void
  setFinalSellDialogTab: (v: Updater<FinalSellDialogTab>) => void
  setKeepUniqueRules: (v: Updater<KeepUniqueRule[]>) => void
  setKeepUniquesEnabled: (v: Updater<boolean>) => void
  setSelectedCfgIdx: (v: Updater<number | null>) => void
  setHsfcNote: (v: Updater<string | null>) => void
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
    setFinalSellDialogTab: (v) => dispatch({ type: 'setFinalSellDialogTab', value: v }),
    setKeepUniqueRules: (v) => dispatch({ type: 'setKeepUniqueRules', value: v }),
    setKeepUniquesEnabled: (v) => dispatch({ type: 'setKeepUniquesEnabled', value: v }),
    setSelectedCfgIdx: (v) => dispatch({ type: 'setSelectedCfgIdx', value: v }),
    setHsfcNote: (v) => dispatch({ type: 'setHsfcNote', value: v }),
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
    // Final Sell defaults: ON with safe ranges (0–15). Old HSFC without this flag is treated as OFF when loaded.
    finalSellRemainder: { artifacts: true, accessories: true, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as LevelMilestone[], setsMode: FINAL_SELL_DEFAULT_SETS_MODE },
    finalSellDialogTab: FINAL_SELL_DIALOG_TAB_FINAL_SELL, // Start new sessions on the classic Final Sell tab for continuity.
    keepUniqueRules: [],
    keepUniquesEnabled: false,
    selectedCfgIdx: null,
    hsfcNote: null,
    ...rest,
    metasets: normalizeMetasetIcons(metasets),
  }
}
