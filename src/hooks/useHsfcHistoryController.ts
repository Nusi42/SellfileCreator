import { useCallback, useEffect, useMemo, useRef, type SetStateAction } from 'react'
import type { BuilderConfig, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { FinalSellRemainderConfig } from '../lib/logicHub'
import type { MultiEditDraftState } from '../lib/multiEditDraft'
import {
  useHsfcHistory,
  type HsfcSnapshot,
  type HistoryEntryDescriptor,
  type HistoryPreview,
  type DescribeNextChangeFn,
  type SuppressNextSnapshotFn,
  type HistoryTimelineEntry,
} from './useHsfcHistory'
import type { KeepUniqueRule } from '../lib/keepUniques'

type Params = {
  customCfgs: BuilderConfig[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  finalSellRemainder: FinalSellRemainderConfig
  keepUniqueRules: KeepUniqueRule[]
  keepUniquesEnabled: boolean
  hsfcNote: string | null
  selectedCfgIdx: number | null
  selectedCfgIndices: number[]
  selectionAnchor: number | null
  builder: BuilderConfig
  builderNameDraft: string
  builderNameDraftKey: number | 'builder' | null
  multiEditDraft: MultiEditDraftState | null
  setCustomCfgs: (value: SetStateAction<BuilderConfig[]>) => void
  setMetasets: (value: SetStateAction<Metaset[]>) => void
  setSubstatTargets: (value: SetStateAction<SubstatTargetTable>) => void
  setFinalSellRemainder: (value: SetStateAction<FinalSellRemainderConfig>) => void
  setKeepUniqueRules: (value: SetStateAction<KeepUniqueRule[]>) => void
  setKeepUniquesEnabled: (value: SetStateAction<boolean>) => void
  setHsfcNote: (value: SetStateAction<string | null>) => void
  setSelectedCfgIdx: (value: SetStateAction<number | null>) => void
  setSelectedCfgIndices: (value: number[]) => void
  setSelectionAnchor: (value: SetStateAction<number | null>) => void
  setBuilder: (value: SetStateAction<BuilderConfig>) => void
  setBuilderNameDraft: (value: SetStateAction<string>) => void
  setBuilderNameDraftKey: (value: SetStateAction<number | 'builder' | null>) => void
  setMultiEditDraft: (value: SetStateAction<MultiEditDraftState | null>) => void
  suppressSelectionDraft: <T>(fn: () => T) => T
  autoApplySelectedConfig: boolean
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
  suppressNextSnapshot: SuppressNextSnapshotFn
  captureSnapshotNow: (descriptor: HistoryEntryDescriptor | null, options?: { markSaved?: boolean; forceAppend?: boolean }) => void
  undoPreview: HistoryPreview
  redoPreview: HistoryPreview
  historyTimeline: HistoryTimelineEntry[]
  jumpToHistoryIndex: (index: number) => boolean
  clearHistory: () => void
}

export function useHsfcHistoryController(params: Params): ControllerResult {
  const {
  customCfgs,
  metasets,
  substatTargets,
  finalSellRemainder,
  keepUniqueRules,
  keepUniquesEnabled,
  hsfcNote,
    selectedCfgIdx,
    selectedCfgIndices,
    selectionAnchor,
    builder,
    builderNameDraft,
    builderNameDraftKey,
    multiEditDraft,
    setCustomCfgs,
    setMetasets,
    setSubstatTargets,
  setFinalSellRemainder,
  setKeepUniqueRules,
  setKeepUniquesEnabled,
  setHsfcNote,
    setSelectedCfgIdx,
    setSelectedCfgIndices,
    setSelectionAnchor,
    setBuilder,
    setBuilderNameDraft,
    setBuilderNameDraftKey,
    setMultiEditDraft,
    suppressSelectionDraft,
    autoApplySelectedConfig,
  } = params

  const safeSelectedIndex = useMemo(() => {
    if (typeof selectedCfgIdx === 'number' && selectedCfgIdx >= 0 && selectedCfgIdx < customCfgs.length) {
      return selectedCfgIdx
    }
    return null
  }, [customCfgs.length, selectedCfgIdx])

  const historyBaseStrings = useMemo(() => {
    const selectedIdx = safeSelectedIndex
    const basePayload = {
      customCfgs,
      metasets,
      substatTargets,
      finalSellRemainder,
      keepUniqueRules,
      keepUniquesEnabled,
      note: hsfcNote ?? null,
      selectedCfgIdx: selectedIdx,
      selectedCfgIndices,
      selectionAnchor,
      builder,
      builderNameDraft: null as string | null,
      builderNameDraftKey: null as number | 'builder' | null,
      multiEditDraft,
    }
    const payloadTemplate = JSON.stringify(basePayload)
    const signature = JSON.stringify({
      customCfgs,
      metasets,
      substatTargets,
      finalSellRemainder,
      keepUniqueRules,
      keepUniquesEnabled,
      note: hsfcNote ?? null,
    })
    return { payloadTemplate, signature }
  }, [
    builder,
    customCfgs,
    metasets,
    substatTargets,
    finalSellRemainder,
    hsfcNote,
    multiEditDraft,
    safeSelectedIndex,
    selectedCfgIndices,
    selectionAnchor,
    keepUniqueRules,
    keepUniquesEnabled,
  ])

  const historyStrings = useMemo(() => {
    const { payloadTemplate, signature } = historyBaseStrings
    const hasNameDraft = builderNameDraftKey === 'builder' || typeof builderNameDraftKey === 'number'
    if (!hasNameDraft) {
      return { payload: payloadTemplate, signature }
    }
    const nameJson = JSON.stringify(builderNameDraft)
    const keyJson = JSON.stringify(builderNameDraftKey)
    const payload = payloadTemplate
      .replace('"builderNameDraft":null', `"builderNameDraft":${nameJson}`)
      .replace('"builderNameDraftKey":null', `"builderNameDraftKey":${keyJson}`)
    return { payload, signature }
  }, [builderNameDraft, builderNameDraftKey, historyBaseStrings])

  const applySnapshot = useCallback((snap: HsfcSnapshot) => {
    setCustomCfgs(snap.customCfgs)
    setMetasets(snap.metasets)
    setSubstatTargets(snap.substatTargets)
    setFinalSellRemainder(snap.finalSellRemainder)
    setKeepUniqueRules(snap.keepUniqueRules)
    setKeepUniquesEnabled(Boolean(snap.keepUniquesEnabled))
    setHsfcNote(snap.note)
    const len = snap.customCfgs.length
    let restoredIdx: number | null = null
    suppressSelectionDraft(() => {
      restoredIdx = typeof snap.selectedCfgIdx === 'number' && snap.selectedCfgIdx >= 0 && snap.selectedCfgIdx < len
        ? snap.selectedCfgIdx
        : (len > 0 ? len - 1 : null)
      setSelectedCfgIdx(restoredIdx)
      const restoredSelection = Array.isArray(snap.selectedCfgIndices)
        ? snap.selectedCfgIndices
          .map((idx) => Number(idx))
          .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < len)
        : []
      const resolvedSelection = restoredSelection.length > 0
        ? restoredSelection
        : (restoredIdx !== null ? [restoredIdx] : [])
      setSelectedCfgIndices(resolvedSelection)
      const resolvedAnchor = typeof snap.selectionAnchor === 'number' && snap.selectionAnchor >= 0 && snap.selectionAnchor < len
        ? snap.selectionAnchor
        : (resolvedSelection.length > 0
          ? resolvedSelection[resolvedSelection.length - 1]!
          : restoredIdx)
      setSelectionAnchor(resolvedAnchor ?? null)
    })
    const builderSource = (() => {
      if (autoApplySelectedConfig) {
        if (restoredIdx !== null && snap.customCfgs[restoredIdx]) {
          return snap.customCfgs[restoredIdx]!
        }
        return snap.builder ?? null
      }
      if (snap.builder) return snap.builder
      if (restoredIdx !== null && snap.customCfgs[restoredIdx]) {
        return snap.customCfgs[restoredIdx]!
      }
      return null
    })()
    if (builderSource) {
      setBuilder(builderSource)
    }
    const hasNameDraft = snap.builderNameDraftKey === 'builder' || typeof snap.builderNameDraftKey === 'number'
    setBuilderNameDraftKey(hasNameDraft ? snap.builderNameDraftKey ?? null : null)
    setBuilderNameDraft(hasNameDraft && typeof snap.builderNameDraft === 'string' ? snap.builderNameDraft : '')
    setMultiEditDraft(snap.multiEditDraft ?? null)
  }, [
    setBuilder,
    setBuilderNameDraft,
    setBuilderNameDraftKey,
    setCustomCfgs,
    setFinalSellRemainder,
    setHsfcNote,
    setMetasets,
    setSubstatTargets,
    setMultiEditDraft,
    setSelectedCfgIdx,
    setSelectedCfgIndices,
    setSelectionAnchor,
    setKeepUniqueRules,
    setKeepUniquesEnabled,
    suppressSelectionDraft,
    autoApplySelectedConfig,
  ])

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
    suppressNextSnapshot,
    captureSnapshotNow,
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
    suppressNextSnapshot,
    captureSnapshotNow,
    undoPreview,
    redoPreview,
    historyTimeline,
    jumpToHistoryIndex,
    clearHistory,
  }
}
