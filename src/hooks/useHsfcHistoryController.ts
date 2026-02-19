import { useCallback, useEffect, useMemo, useRef, type SetStateAction } from 'react'
import type { BuilderRecipe, SubstatTargetTable } from '../lib/hsfBuilder'
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
import type { SafeguardRule } from '../lib/safeguards'

type Params = {
  customRecipes: BuilderRecipe[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  finalSellRemainder: FinalSellRemainderConfig
  safeguardRules: SafeguardRule[]
  safeguardsEnabled: boolean
  hsfcNote: string | null
  selectedRecipeIdx: number | null
  selectedRecipeIndices: number[]
  selectionAnchor: number | null
  builder: BuilderRecipe
  builderNameDraft: string
  builderNameDraftKey: number | 'builder' | null
  multiEditDraft: MultiEditDraftState | null
  setCustomRecipes: (value: SetStateAction<BuilderRecipe[]>) => void
  setMetasets: (value: SetStateAction<Metaset[]>) => void
  setSubstatTargets: (value: SetStateAction<SubstatTargetTable>) => void
  setFinalSellRemainder: (value: SetStateAction<FinalSellRemainderConfig>) => void
  setSafeguardRules: (value: SetStateAction<SafeguardRule[]>) => void
  setSafeguardsEnabled: (value: SetStateAction<boolean>) => void
  setHsfcNote: (value: SetStateAction<string | null>) => void
  setSelectedRecipeIdx: (value: SetStateAction<number | null>) => void
  setSelectedRecipeIndices: (value: number[]) => void
  setSelectionAnchor: (value: SetStateAction<number | null>) => void
  setBuilder: (value: SetStateAction<BuilderRecipe>) => void
  setBuilderNameDraft: (value: SetStateAction<string>) => void
  setBuilderNameDraftKey: (value: SetStateAction<number | 'builder' | null>) => void
  setMultiEditDraft: (value: SetStateAction<MultiEditDraftState | null>) => void
  suppressSelectionDraft: <T>(fn: () => T) => T
  autoApplySelectedRecipe: boolean
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
  customRecipes,
  metasets,
  substatTargets,
  finalSellRemainder,
  safeguardRules,
  safeguardsEnabled,
  hsfcNote,
    selectedRecipeIdx,
    selectedRecipeIndices,
    selectionAnchor,
    builder,
    builderNameDraft,
    builderNameDraftKey,
    multiEditDraft,
    setCustomRecipes,
    setMetasets,
    setSubstatTargets,
  setFinalSellRemainder,
  setSafeguardRules,
  setSafeguardsEnabled,
  setHsfcNote,
    setSelectedRecipeIdx,
    setSelectedRecipeIndices,
    setSelectionAnchor,
    setBuilder,
    setBuilderNameDraft,
    setBuilderNameDraftKey,
    setMultiEditDraft,
    suppressSelectionDraft,
    autoApplySelectedRecipe,
  } = params

  const safeSelectedIndex = useMemo(() => {
    if (typeof selectedRecipeIdx === 'number' && selectedRecipeIdx >= 0 && selectedRecipeIdx < customRecipes.length) {
      return selectedRecipeIdx
    }
    return null
  }, [customRecipes.length, selectedRecipeIdx])

  const historyBaseStrings = useMemo(() => {
    const selectedIdx = safeSelectedIndex
    const basePayload = {
      customRecipes,
      metasets,
      substatTargets,
      finalSellRemainder,
      safeguardRules,
      safeguardsEnabled,
      note: hsfcNote ?? null,
      selectedRecipeIdx: selectedIdx,
      selectedRecipeIndices,
      selectionAnchor,
      builder,
      builderNameDraft: null as string | null,
      builderNameDraftKey: null as number | 'builder' | null,
      multiEditDraft,
    }
    const payloadTemplate = JSON.stringify(basePayload)
    const signature = JSON.stringify({
      customRecipes,
      metasets,
      substatTargets,
      finalSellRemainder,
      safeguardRules,
      safeguardsEnabled,
      note: hsfcNote ?? null,
    })
    return { payloadTemplate, signature }
  }, [
    builder,
    customRecipes,
    metasets,
    substatTargets,
    finalSellRemainder,
    hsfcNote,
    multiEditDraft,
    safeSelectedIndex,
    selectedRecipeIndices,
    selectionAnchor,
    safeguardRules,
    safeguardsEnabled,
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
    setCustomRecipes(snap.customRecipes)
    setMetasets(snap.metasets)
    setSubstatTargets(snap.substatTargets)
    setFinalSellRemainder(snap.finalSellRemainder)
    setSafeguardRules(snap.safeguardRules)
    setSafeguardsEnabled(Boolean(snap.safeguardsEnabled))
    setHsfcNote(snap.note)
    const len = snap.customRecipes.length
    let restoredIdx: number | null = null
    suppressSelectionDraft(() => {
      restoredIdx = typeof snap.selectedRecipeIdx === 'number' && snap.selectedRecipeIdx >= 0 && snap.selectedRecipeIdx < len
        ? snap.selectedRecipeIdx
        : (len > 0 ? len - 1 : null)
      setSelectedRecipeIdx(restoredIdx)
      const restoredSelection = Array.isArray(snap.selectedRecipeIndices)
        ? snap.selectedRecipeIndices
          .map((idx) => Number(idx))
          .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < len)
        : []
      const resolvedSelection = restoredSelection.length > 0
        ? restoredSelection
        : (restoredIdx !== null ? [restoredIdx] : [])
      setSelectedRecipeIndices(resolvedSelection)
      const resolvedAnchor = typeof snap.selectionAnchor === 'number' && snap.selectionAnchor >= 0 && snap.selectionAnchor < len
        ? snap.selectionAnchor
        : (resolvedSelection.length > 0
          ? resolvedSelection[resolvedSelection.length - 1]!
          : restoredIdx)
      setSelectionAnchor(resolvedAnchor ?? null)
    })
    const builderSource = (() => {
      if (autoApplySelectedRecipe) {
        if (restoredIdx !== null && snap.customRecipes[restoredIdx]) {
          return snap.customRecipes[restoredIdx]!
        }
        return snap.builder ?? null
      }
      if (snap.builder) return snap.builder
      if (restoredIdx !== null && snap.customRecipes[restoredIdx]) {
        return snap.customRecipes[restoredIdx]!
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
    setCustomRecipes,
    setFinalSellRemainder,
    setHsfcNote,
    setMetasets,
    setSubstatTargets,
    setMultiEditDraft,
    setSelectedRecipeIdx,
    setSelectedRecipeIndices,
    setSelectionAnchor,
    setSafeguardRules,
    setSafeguardsEnabled,
    suppressSelectionDraft,
    autoApplySelectedRecipe,
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
