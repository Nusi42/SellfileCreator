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
import type { BuilderConfig, MinimaTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'

type AppState = {
  customCfgs: BuilderConfig[]
  metasets: Metaset[]
  minima: MinimaTable
  // Final "sell others" rule configuration, saved with HSFR.
  // This adds catch-all Sell rules at selected level ranges for artifacts/accessories.
  finalSellRemainder: {
    artifacts: boolean
    accessories: boolean
    // Milestone levels to target: a subset of [0,4,8,12,16].
    levels: Array<0|4|8|12|16>
  }
  selectedCfgIdx: number | null
  hsfrNote: string | null
}

type Updater<T> = T | ((prev: T) => T)

type Action =
  | { type: 'setCustomCfgs'; value: Updater<BuilderConfig[]> }
  | { type: 'setMetasets'; value: Updater<Metaset[]> }
  | { type: 'setMinima'; value: Updater<MinimaTable> }
  | { type: 'setFinalSellRemainder'; value: Updater<AppState['finalSellRemainder']> }
  | { type: 'setSelectedCfgIdx'; value: Updater<number | null> }
  | { type: 'setHsfrNote'; value: Updater<string | null> }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setCustomCfgs': {
      const next = typeof action.value === 'function' ? (action.value as (p: BuilderConfig[]) => BuilderConfig[])(state.customCfgs) : action.value
      return { ...state, customCfgs: next }
    }
    case 'setMetasets': {
      const next = typeof action.value === 'function' ? (action.value as (p: Metaset[]) => Metaset[])(state.metasets) : action.value
      return { ...state, metasets: next }
    }
    case 'setMinima': {
      const next = typeof action.value === 'function' ? (action.value as (p: MinimaTable) => MinimaTable)(state.minima) : action.value
      return { ...state, minima: next }
    }
    case 'setFinalSellRemainder': {
      const next = typeof action.value === 'function'
        ? (action.value as (p: AppState['finalSellRemainder']) => AppState['finalSellRemainder'])(state.finalSellRemainder)
        : action.value
      return { ...state, finalSellRemainder: next }
    }
    case 'setSelectedCfgIdx': {
      const next = typeof action.value === 'function' ? (action.value as (p: number | null) => number | null)(state.selectedCfgIdx) : action.value
      return { ...state, selectedCfgIdx: next }
    }
    case 'setHsfrNote': {
      const next = typeof action.value === 'function' ? (action.value as (p: string | null) => string | null)(state.hsfrNote) : action.value
      return { ...state, hsfrNote: next }
    }
    default: return state
  }
}

type AppDispatchers = {
  setCustomCfgs: (v: Updater<BuilderConfig[]>) => void
  setMetasets: (v: Updater<Metaset[]>) => void
  setMinima: (v: Updater<MinimaTable>) => void
  setFinalSellRemainder: (v: Updater<AppState['finalSellRemainder']>) => void
  setSelectedCfgIdx: (v: Updater<number | null>) => void
  setHsfrNote: (v: Updater<string | null>) => void
}

const AppStateCtx = createContext<AppState | null>(null)
const AppDispatchCtx = createContext<AppDispatchers | null>(null)

export function AppStateProvider({ initial, children }: { initial: AppState; children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)

  const actions: AppDispatchers = useMemo(() => ({
    setCustomCfgs: (v) => dispatch({ type: 'setCustomCfgs', value: v }),
    setMetasets: (v) => dispatch({ type: 'setMetasets', value: v }),
    setMinima: (v) => dispatch({ type: 'setMinima', value: v }),
    setFinalSellRemainder: (v) => dispatch({ type: 'setFinalSellRemainder', value: v }),
    setSelectedCfgIdx: (v) => dispatch({ type: 'setSelectedCfgIdx', value: v }),
    setHsfrNote: (v) => dispatch({ type: 'setHsfrNote', value: v }),
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
export function makeInitialAppState(params: Partial<AppState> & Pick<AppState, 'minima' | 'metasets'>): AppState {
  return {
    customCfgs: [],
    // Final Sell defaults: ON with safe ranges (0–15). Old HSFR without this flag is treated as OFF when loaded.
    finalSellRemainder: { artifacts: true, accessories: true, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16> },
    selectedCfgIdx: null,
    hsfrNote: null,
    ...params,
  }
}
