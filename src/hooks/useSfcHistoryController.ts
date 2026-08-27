import { useCallback, useEffect, useMemo, useRef, type SetStateAction } from 'react'
import type { BuilderRecipe, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { FinalSellRemainderConfig } from '../lib/logicHub'
import type { MultiEditDraftState } from '../lib/recipeMultiEditDraft'
import {
  useSfcHistory,
  type SfcSnapshot,
  type HistoryEntryDescriptor,
  type HistoryPreview,
  type DescribeNextChangeFn,
  type SuppressNextSnapshotFn,
  type HistoryTimelineEntry,
} from './useSfcHistory'
import type { SafeguardRule } from '../lib/safeguards'
import { stableSerialize } from '../lib/stableSerialize'
import type { SfcProvenance } from '../lib/sfcProvenance'

type Params = {
  customRecipes: BuilderRecipe[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  finalSellRemainder: FinalSellRemainderConfig
  safeguardRules: SafeguardRule[]
  safeguardsEnabled: boolean
  recipesEnabled: boolean
  sfcNote: string | null
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
  setRecipesEnabled: (value: SetStateAction<boolean>) => void
  setSfcNote: (value: SetStateAction<string | null>) => void
  setSelectedRecipeIdx: (value: SetStateAction<number | null>) => void
  setSelectedRecipeIndices: (value: number[], options?: { suppressWillChange?: boolean }) => void
  setSelectionAnchor: (value: SetStateAction<number | null>) => void
  setBuilder: (value: SetStateAction<BuilderRecipe>) => void
  setBuilderNameDraft: (value: SetStateAction<string>) => void
  setBuilderNameDraftKey: (value: SetStateAction<number | 'builder' | null>) => void
  setMultiEditDraft: (value: SetStateAction<MultiEditDraftState | null>) => void
  suppressSelectionDraft: <T>(fn: () => T) => T
  autoApplySelectedRecipe: boolean
  selectedSafeguardRuleIdx: number | null
  setSelectedSafeguardRuleIdx: (value: SetStateAction<number | null>) => void
  setSafeguardBuilder: (value: SetStateAction<SafeguardRule>) => void
}

type ControllerResult = {
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  isDirty: boolean
  markSavedNow: () => void
  /** Declare the provenance of the snapshot about to land; see lib/sfcProvenance.ts. */
  anchorNextSnapshot: (provenance: SfcProvenance) => void
  resetHistory: (payload: string, signature: string, opts: { markSaved: boolean; descriptor?: HistoryEntryDescriptor | null }) => void
  describeNextChange: DescribeNextChangeFn
  suppressNextSnapshot: SuppressNextSnapshotFn
  captureSnapshotNow: (descriptor: HistoryEntryDescriptor | null, options?: { markSaved?: boolean; forceAppend?: boolean }) => void
  undoPreview: HistoryPreview
  redoPreview: HistoryPreview
  currentEntrySignature: { crc: string; size: number } | null
  historyTimeline: HistoryTimelineEntry[]
  jumpToHistoryIndex: (index: number) => boolean
  clearHistory: () => void
}

export function useSfcHistoryController(params: Params): ControllerResult {
  const {
  customRecipes,
  metasets,
  substatTargets,
  finalSellRemainder,
  safeguardRules,
  safeguardsEnabled,
  recipesEnabled,
  sfcNote,
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
  setRecipesEnabled,
  setSfcNote,
    setSelectedRecipeIdx,
    setSelectedRecipeIndices,
    setSelectionAnchor,
    setBuilder,
    setBuilderNameDraft,
    setBuilderNameDraftKey,
    setMultiEditDraft,
    suppressSelectionDraft,
    autoApplySelectedRecipe,
    selectedSafeguardRuleIdx,
    setSelectedSafeguardRuleIdx,
    setSafeguardBuilder,
  } = params

  const safeSelectedIndex = useMemo(() => {
    if (typeof selectedRecipeIdx === 'number' && selectedRecipeIdx >= 0 && selectedRecipeIdx < customRecipes.length) {
      return selectedRecipeIdx
    }
    return null
  }, [customRecipes.length, selectedRecipeIdx])

  // Bounds-checked safeguard index — null when out-of-range (mirrors safeSelectedIndex for recipes).
  const safeSafeguardIndex = useMemo(() => {
    if (typeof selectedSafeguardRuleIdx === 'number' && selectedSafeguardRuleIdx >= 0 && selectedSafeguardRuleIdx < safeguardRules.length) {
      return selectedSafeguardRuleIdx
    }
    return null
  }, [safeguardRules.length, selectedSafeguardRuleIdx])

  const historyBaseStrings = useMemo(() => {
    const selectedIdx = safeSelectedIndex
    const basePayload = {
      customRecipes,
      metasets,
      substatTargets,
      finalSellRemainder,
      safeguardRules,
      safeguardsEnabled,
      recipesEnabled,
      note: sfcNote ?? null,
      selectedRecipeIdx: selectedIdx,
      selectedRecipeIndices,
      selectionAnchor,
      builder,
      builderNameDraft: null as string | null,
      builderNameDraftKey: null as number | 'builder' | null,
      multiEditDraft,
      selectedSafeguardRuleIdx: safeSafeguardIndex,
    }
    const payloadTemplate = JSON.stringify(basePayload)
    const signature = stableSerialize({
      customRecipes,
      metasets,
      substatTargets,
      finalSellRemainder,
      safeguardRules,
      safeguardsEnabled,
      recipesEnabled,
      note: sfcNote ?? null,
    })
    return { payloadTemplate, signature }
  }, [
    builder,
    customRecipes,
    metasets,
    substatTargets,
    finalSellRemainder,
    sfcNote,
    multiEditDraft,
    safeSelectedIndex,
    selectedRecipeIndices,
    selectionAnchor,
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
    safeSafeguardIndex,
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

  const applySnapshot = useCallback((snap: SfcSnapshot) => {
    setCustomRecipes(snap.customRecipes)
    setMetasets(snap.metasets)
    setSubstatTargets(snap.substatTargets)
    setFinalSellRemainder(snap.finalSellRemainder)
    setSafeguardRules(snap.safeguardRules)
    setSafeguardsEnabled(Boolean(snap.safeguardsEnabled))
    setRecipesEnabled(snap.recipesEnabled !== false)
    setSfcNote(snap.note)
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
      // Suppress the will-change callback so selection restoration during undo/redo does not
      // trigger a pending auto-apply that would overwrite the just-restored customRecipes.
      setSelectedRecipeIndices(resolvedSelection, { suppressWillChange: true })
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
    // Restore safeguard chip selection alongside the rules so the panel highlight is correct.
    const sgLen = snap.safeguardRules.length
    const restoredSgIdx = typeof snap.selectedSafeguardRuleIdx === 'number'
      && snap.selectedSafeguardRuleIdx >= 0
      && snap.selectedSafeguardRuleIdx < sgLen
      ? snap.selectedSafeguardRuleIdx
      : null
    setSelectedSafeguardRuleIdx(restoredSgIdx)
    // Keep builder draft in sync so the panel does not show stale state from before undo.
    if (restoredSgIdx !== null && snap.safeguardRules[restoredSgIdx]) {
      setSafeguardBuilder(snap.safeguardRules[restoredSgIdx]!)
    }
  }, [
    setBuilder,
    setBuilderNameDraft,
    setBuilderNameDraftKey,
    setCustomRecipes,
    setFinalSellRemainder,
    setSfcNote,
    setMetasets,
    setSubstatTargets,
    setMultiEditDraft,
    setSelectedRecipeIdx,
    setSelectedRecipeIndices,
    setSelectionAnchor,
    setSafeguardRules,
    setSafeguardsEnabled,
    setRecipesEnabled,
    suppressSelectionDraft,
    autoApplySelectedRecipe,
    setSelectedSafeguardRuleIdx,
    setSafeguardBuilder,
  ])

  const {
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    markSavedNow,
    anchorNextSnapshot,
    resetHistory,
    describeNextChange,
    suppressNextSnapshot,
    captureSnapshotNow,
    currentEntrySignature,
    undoPreview,
    redoPreview,
    historyTimeline,
    jumpToHistoryIndex,
    clearHistory,
  } = useSfcHistory({
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
  const canRedoRef = useRef(canRedo)
  // Sync refs in an effect so the keydown handler always reads the latest values
  // without triggering a ref access during render.
  useEffect(() => {
    canUndoRef.current = canUndo
    canRedoRef.current = canRedo
  }, [canUndo, canRedo])

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
      window.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [isMacLike, redo, undo])

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    markSavedNow,
    anchorNextSnapshot,
    resetHistory,
    describeNextChange,
    suppressNextSnapshot,
    captureSnapshotNow,
    currentEntrySignature,
    undoPreview,
    redoPreview,
    historyTimeline,
    jumpToHistoryIndex,
    clearHistory,
  }
}
