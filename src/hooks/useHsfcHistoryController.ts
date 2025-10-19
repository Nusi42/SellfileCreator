import { useCallback, useEffect, useMemo, useRef, type SetStateAction } from 'react'
import type { BuilderConfig, MinimaTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { FinalSellRemainderConfig } from '../lib/finalSell'
import {
  useHsfcHistory,
  type HsfcSnapshot,
  type HistoryEntryDescriptor,
  type HistoryPreview,
  type DescribeNextChangeFn,
  type HistoryTimelineEntry,
} from './useHsfcHistory'

type Params = {
  customCfgs: BuilderConfig[]
  metasets: Metaset[]
  minima: MinimaTable
  finalSellRemainder: FinalSellRemainderConfig
  hsfcNote: string | null
  selectedCfgIdx: number | null
  setCustomCfgs: (value: SetStateAction<BuilderConfig[]>) => void
  setMetasets: (value: SetStateAction<Metaset[]>) => void
  setMinima: (value: SetStateAction<MinimaTable>) => void
  setFinalSellRemainder: (value: SetStateAction<FinalSellRemainderConfig>) => void
  setHsfcNote: (value: SetStateAction<string | null>) => void
  setSelectedCfgIdx: (value: SetStateAction<number | null>) => void
  setSelectedCfgIndices: (value: SetStateAction<number[]>) => void
  setSelectionAnchor: (value: SetStateAction<number | null>) => void
  setBuilder: (value: SetStateAction<BuilderConfig>) => void
}

type ControllerResult = {
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  isDirty: boolean
  markSavedNow: () => void
  markNextSnapshotAsSaved: () => void
  resetHistory: (payload: string, signature: string, opts: { markSaved: boolean; descriptor?: HistoryEntryDescriptor | null }) => void
  describeNextChange: DescribeNextChangeFn
  undoPreview: HistoryPreview
  redoPreview: HistoryPreview
  historyTimeline: HistoryTimelineEntry[]
  jumpToHistoryIndex: (index: number) => boolean
  clearHistory: () => void
}

export function makeHistoryStrings(args: {
  customCfgs: BuilderConfig[]
  metasets: Metaset[]
  minima: MinimaTable
  finalSellRemainder: FinalSellRemainderConfig
  note: string | null
  selectedCfgIdx: number | null
}) {
  const { customCfgs, metasets, minima, finalSellRemainder, note, selectedCfgIdx } = args
  const base = {
    customCfgs,
    metasets,
    minima,
    finalSellRemainder,
    note,
  }
  return {
    payload: JSON.stringify({ ...base, selectedCfgIdx }),
    signature: JSON.stringify(base),
  }
}

export function useHsfcHistoryController(params: Params): ControllerResult {
  const {
    customCfgs,
    metasets,
    minima,
    finalSellRemainder,
    hsfcNote,
    selectedCfgIdx,
    setCustomCfgs,
    setMetasets,
    setMinima,
    setFinalSellRemainder,
    setHsfcNote,
    setSelectedCfgIdx,
    setSelectedCfgIndices,
    setSelectionAnchor,
    setBuilder,
  } = params

  const safeSelectedIndex = useMemo(() => {
    if (typeof selectedCfgIdx === 'number' && selectedCfgIdx >= 0 && selectedCfgIdx < customCfgs.length) {
      return selectedCfgIdx
    }
    return null
  }, [customCfgs.length, selectedCfgIdx])

  const historyStrings = useMemo(
    () => makeHistoryStrings({
      customCfgs,
      metasets,
      minima,
      finalSellRemainder,
      note: hsfcNote ?? null,
      selectedCfgIdx: safeSelectedIndex,
    }),
    [customCfgs, metasets, minima, finalSellRemainder, hsfcNote, safeSelectedIndex],
  )

  const applySnapshot = useCallback((snap: HsfcSnapshot) => {
    setCustomCfgs(snap.customCfgs)
    setMetasets(snap.metasets)
    setMinima(snap.minima)
    setFinalSellRemainder(snap.finalSellRemainder)
    setHsfcNote(snap.note)
    const len = snap.customCfgs.length
    const restoredIdx = typeof snap.selectedCfgIdx === 'number' && snap.selectedCfgIdx >= 0 && snap.selectedCfgIdx < len
      ? snap.selectedCfgIdx
      : (len > 0 ? len - 1 : null)
    setSelectedCfgIdx(restoredIdx)
    setSelectedCfgIndices(restoredIdx !== null ? [restoredIdx] : [])
    setSelectionAnchor(restoredIdx)
    if (restoredIdx !== null && snap.customCfgs[restoredIdx]) {
      setBuilder(snap.customCfgs[restoredIdx]!)
    }
  }, [setBuilder, setCustomCfgs, setFinalSellRemainder, setHsfcNote, setMetasets, setMinima, setSelectedCfgIdx, setSelectedCfgIndices, setSelectionAnchor])

  const {
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    markSavedNow,
    markNextSnapshotAsSaved,
    resetHistory,
    describeNextChange,
    undoPreview,
    redoPreview,
    historyTimeline,
    jumpToHistoryIndex,
    clearHistory,
  } = useHsfcHistory({
    payload: historyStrings.payload,
    signature: historyStrings.signature,
    applySnapshot,
  })

  const isMacLike = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    const platform = navigator.platform || navigator.userAgent || ''
    return /Mac|iPhone|iPad|iPod/i.test(platform)
  }, [])
  const canUndoRef = useRef(canUndo)
  canUndoRef.current = canUndo
  const canRedoRef = useRef(canRedo)
  canRedoRef.current = canRedo

  useEffect(() => {
    const shouldIgnoreTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false
      if (el.isContentEditable) return true
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.closest('[data-allow-undo]') !== null
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (shouldIgnoreTarget(e.target)) return
      const key = e.key.toLowerCase()
      if (isMacLike) {
        if (!e.metaKey) return
        if (key === 'z') {
          e.preventDefault()
          if (e.shiftKey) {
            if (canRedoRef.current) redo()
          } else if (canUndoRef.current) {
            undo()
          }
        }
        return
      }
      if (!e.ctrlKey || e.metaKey) return
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (canUndoRef.current) undo()
        return
      }
      if (key === 'y' && !e.shiftKey) {
        e.preventDefault()
        if (canRedoRef.current) redo()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown, true as unknown as undefined)
    }
  }, [isMacLike, redo, undo])

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    markSavedNow,
    markNextSnapshotAsSaved,
    resetHistory,
    describeNextChange,
    undoPreview,
    redoPreview,
    historyTimeline,
    jumpToHistoryIndex,
    clearHistory,
  }
}
