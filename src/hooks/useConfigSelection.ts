import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent, type MutableRefObject, type SetStateAction } from 'react'
import { arraysEqual } from '../lib/array'
import type { BuilderConfig } from '../lib/hsfBuilder'
import {
  createMultiEditDraft,
  syncMultiEditDraft,
  cloneBuilderFieldValue,
  cloneFieldPatch,
  normalizeFieldPatch,
  areFieldPatchesEqual,
  areBuilderFieldValuesEqual,
  BUILDER_FIELD_KEYS,
  applyMultiEditFieldsToConfig,
  getDirtyBuilderFieldKeys,
  cloneBuilderConfig,
  type MultiEditDraftState,
  type BuilderFieldKey,
  type MultiEditFieldCommit,
  type MultiEditDraftHandle,
  type MultiEditFields,
  type MultiEditFieldPatch,
} from '../lib/multiEditDraft'
import { SELECTION_SCROLL_SOURCE_USER, type SelectionScrollSource } from '../lib/constants'
import type { DescribeNextChangeFn } from '../hooks/useHsfcHistory'
import { describeConfigsDuplicated, describeConfigsMoved, describeMultiEditApplied } from '../history/configCollectionDescriptors'
import { buildConfigLabel, type TranslateFn } from '../history/builderUpdateDescriptor'
import { setConfigHoverIndex } from '../lib/configHoverBridge'

type UseConfigSelectionParams = {
  customCfgs: BuilderConfig[]
  setCustomCfgs: Dispatch<SetStateAction<BuilderConfig[]>>
  selectedCfgIdx: number | null
  setSelectedCfgIdx: Dispatch<SetStateAction<number | null>>
  setBuilder: Dispatch<SetStateAction<BuilderConfig>>
  onWillChangeSelection?: ((previous: number[], next: number[]) => void) | undefined
  onSelectionScrollRequest?: ((source: SelectionScrollSource, targetCfgIdx: number | null) => void) | undefined
  requestDeleteSingle: (idx: number) => void
  requestDeleteMulti: (targets: number[]) => void
  describeNextChange: DescribeNextChangeFn
  t: TranslateFn
  suppressSelectionDraft: <T>(fn: () => T) => T
  visibleConfigIndicesRef: MutableRefObject<ReadonlySet<number> | null>
}

export type UseConfigSelectionResult = {
  selectedCfgIndices: number[]
  setSelectedCfgIndices: (next: number[]) => void
  multiselectActive: boolean
  selectionAnchor: number | null
  prepareDragSelection: (idx: number) => number[]
  setHoveredCfgIdx: (idx: number | null) => void
  handleConfigHoverIdx: (idx: number | null) => void
  multiSelectedConfigs: BuilderConfig[]
  multiEditDraftState: MultiEditDraftState | null
  setMultiEditDraftState: Dispatch<SetStateAction<MultiEditDraftState | null>>
  multiEditHandle: MultiEditDraftHandle | null
  applyMultiEditDraft: () => void
  handleConfigSelect: (event: MouseEvent, idx: number) => void
  handleConfigDelete: (idx: number) => void
  handleConfigDuplicate: (idx: number) => void
  handleConfigMoveUp: (idx: number) => void
  handleConfigMoveDown: (idx: number) => void
  handleConfigMoveTop: (idx: number) => void
  handleConfigMoveBottom: (idx: number) => void
  handleConfigReorder: (movingIndices: number[], targetIndex: number, options?: { mode?: 'move' | 'copy' }) => void
  handleSelectAllConfigs: () => void
  handleClearSelection: () => void
  setSelectionAnchor: Dispatch<SetStateAction<number | null>>
}

// Extra flags for selection updates that should skip auto-apply/draft capture.
type ApplySelectionOptions = {
  suppressWillChange?: boolean
}

const mapSelectionByIdentity = (
  prev: BuilderConfig[],
  next: BuilderConfig[],
  selection: number[],
): number[] => {
  // Preserve selection by object identity so reorders stay stable.
  if (!Array.isArray(selection) || selection.length === 0) return []
  // Collect the selected configs from the previous list.
  const selectedItems: BuilderConfig[] = []
  for (const idx of selection) {
    const cfg = prev[idx]
    // Skip invalid indices or missing configs.
    if (!cfg) continue
    selectedItems.push(cfg)
  }
  // If no configs are matched, there is no selection to restore.
  if (selectedItems.length === 0) return []
  // Use a Set for quick identity checks.
  const selectedSet = new Set(selectedItems)
  const nextSelection: number[] = []
  // Walk the next list in order to preserve selection ordering.
  next.forEach((item, idx) => {
    if (selectedSet.has(item)) nextSelection.push(idx)
  })
  return nextSelection
}

/**
 * Centralizes config selection and multi-edit draft state so App.tsx only wires the orchestration.
 * The hook keeps selection + anchor indices in sync with the global selected config index and
 * exposes handlers used by the chips list and builder toolbar.
 */
export function useConfigSelection({
  customCfgs,
  setCustomCfgs,
  selectedCfgIdx,
  setSelectedCfgIdx,
  setBuilder,
  onWillChangeSelection,
  onSelectionScrollRequest,
  requestDeleteSingle,
  requestDeleteMulti,
  describeNextChange,
  t,
  suppressSelectionDraft,
  visibleConfigIndicesRef,
}: UseConfigSelectionParams): UseConfigSelectionResult {
  const [selectedCfgIndices, setSelectedCfgIndicesState] = useState<number[]>([])
  const selectionAnchorRef = useRef<number | null>(null)
  const [selectionAnchor, setSelectionAnchorState] = useState<number | null>(null)
  const selectedIndicesRef = useRef<number[]>([])
  const multiselectActive = selectedCfgIndices.length > 1

  const multiSelectedIndices = useMemo(() => {
    if (selectedCfgIndices.length <= 1) return []
    const next: number[] = []
    for (const idx of selectedCfgIndices) {
      if (idx < 0) continue
      if (idx >= customCfgs.length) continue
      if (!customCfgs[idx]) continue
      next.push(idx)
    }
    return next
  }, [customCfgs, selectedCfgIndices])

  const multiSelectedConfigs = useMemo(() => {
    if (multiSelectedIndices.length === 0) return []
    const result: BuilderConfig[] = []
    for (const idx of multiSelectedIndices) {
      const cfg = customCfgs[idx]
      if (cfg) result.push(cfg)
    }
    return result
  }, [customCfgs, multiSelectedIndices])

  const [multiEditDraftState, setMultiEditDraftState] = useState<MultiEditDraftState | null>(null)

  useEffect(() => {
    selectedIndicesRef.current = selectedCfgIndices
  }, [selectedCfgIndices])

  const applySelection = useCallback((nextSelection: number[], options?: ApplySelectionOptions) => {
    // Always clone so callers can reuse their array without surprises.
    const normalized = nextSelection.slice()
    const prevSelection = selectedIndicesRef.current
    // Bail out early when nothing changes.
    if (arraysEqual(prevSelection, normalized)) return
    // Allow callers (like reorders) to skip auto-apply/draft capture.
    if (!options?.suppressWillChange && onWillChangeSelection) {
      onWillChangeSelection(prevSelection.slice(), normalized.slice())
    }
    // Keep refs in sync before we trigger a re-render.
    selectedIndicesRef.current = normalized
    setSelectedCfgIndicesState(normalized)
  }, [onWillChangeSelection])

  useEffect(() => {
    if (multiSelectedConfigs.length < 2) {
      setMultiEditDraftState(prev => (prev === null ? prev : null))
      return
    }
    const base = createMultiEditDraft(multiSelectedConfigs, multiSelectedIndices)
    setMultiEditDraftState(prev => syncMultiEditDraft(prev, base))
  }, [multiSelectedConfigs, multiSelectedIndices])

  const setSelectionAnchor = useCallback<Dispatch<SetStateAction<number | null>>>((value) => {
    const next = typeof value === 'function'
      ? (value as (prev: number | null) => number | null)(selectionAnchorRef.current)
      : (value ?? null)
    if (selectionAnchorRef.current === next) return
    selectionAnchorRef.current = next
    setSelectionAnchorState(next)
  }, [])

  const syncSelectionAfterReorder = useCallback((nextSelection: number[]) => {
    // Reorders keep the same configs selected, so skip auto-apply/draft capture.
    applySelection(nextSelection, { suppressWillChange: true })
    // Anchor to the last selected index so keyboard navigation stays intuitive.
    const last = nextSelection.length > 0 ? nextSelection[nextSelection.length - 1]! : null
    setSelectedCfgIdx(last)
    setSelectionAnchor(last)
  }, [applySelection, setSelectedCfgIdx, setSelectionAnchor])

  const updateMultiEditField = useCallback(<K extends BuilderFieldKey>(
    key: K,
    commit: MultiEditFieldCommit<BuilderConfig[K], K>,
  ) => {
    setMultiEditDraftState(prev => {
      if (!prev) return prev
      const currentField = prev.fields[key]
      if (!currentField) return prev
      const nextStatus = commit.status ?? 'common'
      const nextValue = cloneBuilderFieldValue(key, commit.value)
      const nextPatch = normalizeFieldPatch(
        key,
        cloneFieldPatch(key, commit.patch),
      )
      const cloneMixed = (values: unknown[] | null | undefined): unknown[] | null => {
        if (!values || values.length === 0) return null
        return values.map((entry) => cloneBuilderFieldValue(key, entry))
      }
      const mixedEqual = (left: unknown[] | null, right: unknown[] | null): boolean => {
        if (!left && !right) return true
        if (!left || !right) return false
        if (left.length !== right.length) return false
        for (let i = 0; i < left.length; i += 1) {
          if (!areBuilderFieldValuesEqual(key, left[i], right[i])) return false
        }
        return true
      }
      const matchesInitial = nextStatus === currentField.initialStatus
        && areBuilderFieldValuesEqual(key, nextValue, currentField.initialValue)
        && nextPatch === null
      const resolvedMixedValues = nextStatus === 'mixed'
        ? (() => {
            if (Array.isArray(commit.mixedValues) && commit.mixedValues.length > 0) {
              return cloneMixed(commit.mixedValues as unknown[])
            }
            return cloneMixed([commit.value] as unknown[])
          })()
        : null
      const nextField = matchesInitial
        ? {
            ...currentField,
            status: currentField.initialStatus,
            value: cloneBuilderFieldValue(key, currentField.initialValue),
            mixedValues: cloneMixed(currentField.initialMixedValues),
            patch: null,
            dirty: false,
          }
        : {
            ...currentField,
            status: nextStatus,
            value: nextValue,
            mixedValues: resolvedMixedValues,
            patch: nextPatch,
            dirty: true,
          }
      if (currentField.status === nextField.status
        && areBuilderFieldValuesEqual(key, currentField.value, nextField.value)
        && mixedEqual(currentField.mixedValues, nextField.mixedValues)
        && areFieldPatchesEqual(
          key,
          currentField.patch as MultiEditFieldPatch<typeof key> | null,
          nextField.patch as MultiEditFieldPatch<typeof key> | null,
        )
        && currentField.dirty === nextField.dirty
      ) {
        return prev
      }
      const nextFields: MultiEditFields = { ...prev.fields }
      nextFields[key] = nextField
      return {
        ...prev,
        fields: nextFields,
      }
    })
  }, [])

  const resetMultiEditField = useCallback((key: BuilderFieldKey) => {
    setMultiEditDraftState(prev => {
      if (!prev) return prev
      const currentField = prev.fields[key]
      if (!currentField) return prev
      const cloneMixed = (values: unknown[] | null): unknown[] | null => {
        if (!values || values.length === 0) return null
        return values.map((entry) => cloneBuilderFieldValue(key, entry))
      }
      const alreadyInitial = !currentField.dirty
        && currentField.status === currentField.initialStatus
        && areBuilderFieldValuesEqual(key, currentField.value, currentField.initialValue)
        && (currentField.patch == null)
        && (() => {
          const left = currentField.mixedValues
          const right = currentField.initialMixedValues
          if (!left && !right) return true
          if (!left || !right) return false
          if (left.length !== right.length) return false
          for (let i = 0; i < left.length; i += 1) {
            if (!areBuilderFieldValuesEqual(key, left[i], right[i])) return false
          }
          return true
        })()
      if (alreadyInitial) return prev
      const resetField = {
        ...currentField,
        status: currentField.initialStatus,
        value: cloneBuilderFieldValue(key, currentField.initialValue),
        mixedValues: cloneMixed(currentField.initialMixedValues),
        patch: null,
        dirty: false,
      }
      const nextFields: MultiEditFields = { ...prev.fields }
      nextFields[key] = resetField
      return {
        ...prev,
        fields: nextFields,
      }
    })
  }, [])

  const resetAllMultiEditFields = useCallback(() => {
    setMultiEditDraftState(prev => {
      if (!prev) return prev
      let changed = false
      const nextFields: MultiEditFields = { ...prev.fields }
      for (const key of BUILDER_FIELD_KEYS) {
        const currentField = prev.fields[key]
        if (!currentField) continue
        const cloneMixed = (values: unknown[] | null): unknown[] | null => {
          if (!values || values.length === 0) return null
          return values.map((entry) => cloneBuilderFieldValue(key, entry))
        }
        const mixedEqual = (left: unknown[] | null, right: unknown[] | null): boolean => {
          if (!left && !right) return true
          if (!left || !right) return false
          if (left.length !== right.length) return false
          for (let i = 0; i < left.length; i += 1) {
            if (!areBuilderFieldValuesEqual(key, left[i], right[i])) return false
          }
          return true
        }
        const needsReset = currentField.dirty
          || currentField.status !== currentField.initialStatus
          || !areBuilderFieldValuesEqual(key, currentField.value, currentField.initialValue)
          || (currentField.patch != null)
          || !mixedEqual(currentField.mixedValues, currentField.initialMixedValues)
        if (!needsReset) {
          nextFields[key] = currentField
          continue
        }
        changed = true
        const resetField = {
          ...currentField,
          status: currentField.initialStatus,
          value: cloneBuilderFieldValue(key, currentField.initialValue),
          mixedValues: cloneMixed(currentField.initialMixedValues),
          patch: null,
          dirty: false,
        }
        nextFields[key] = resetField
      }
      if (!changed) return prev
      return {
        ...prev,
        fields: nextFields,
      }
    })
  }, [])

  const applyMultiEditDraft = useCallback(() => {
    if (!multiEditDraftState) return
    if (multiEditDraftState.selection.length < 2) return
    const dirtyKeys = getDirtyBuilderFieldKeys(multiEditDraftState.fields)
    if (dirtyKeys.length === 0) return
    const selectionSet = new Set(multiEditDraftState.selection)
    const fields = multiEditDraftState.fields
    setCustomCfgs(prev => {
      let changed = false
      const entries: Array<{ index: number; previous: BuilderConfig; next: BuilderConfig }> = []
      const next = prev.map((cfg, idx) => {
        if (!selectionSet.has(idx)) return cfg
        const updated = applyMultiEditFieldsToConfig(cfg, fields, dirtyKeys)
        if (updated !== cfg) {
          changed = true
          entries.push({ index: idx, previous: cfg, next: updated })
          return updated
        }
        return cfg
      })
      if (!changed) {
        describeNextChange(null)
        return prev
      }
      const descriptor = describeMultiEditApplied({
        entries,
        dirtyKeys,
        t,
      })
      describeNextChange(descriptor)
      return next
    })
    resetAllMultiEditFields()
  }, [describeNextChange, multiEditDraftState, resetAllMultiEditFields, setCustomCfgs, t])

  const multiEditHandle = useMemo<MultiEditDraftHandle | null>(() => {
    if (!multiEditDraftState) return null
    return {
      state: multiEditDraftState,
      updateField: updateMultiEditField,
      resetField: resetMultiEditField,
      resetAll: resetAllMultiEditFields,
    }
  }, [multiEditDraftState, resetAllMultiEditFields, resetMultiEditField, updateMultiEditField])

  const setHoveredCfgIdx = useCallback((idx: number | null) => {
    setConfigHoverIndex(idx)
  }, [])

  const handleConfigHoverIdx = useCallback((idx: number | null) => {
    setConfigHoverIndex(idx)
  }, [])

  const prepareDragSelection = useCallback((idx: number): number[] => {
    if (!Number.isInteger(idx) || idx < 0 || idx >= customCfgs.length) return []
    const alreadySelected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 0
    if (alreadySelected) {
      return selectedCfgIndices.slice().sort((a, b) => a - b)
    }
    const cfg = customCfgs[idx]
    applySelection([idx])
    setSelectedCfgIdx(idx)
    setSelectionAnchor(idx)
    if (cfg) {
      setBuilder(cfg)
    }
    return [idx]
  }, [applySelection, customCfgs, selectedCfgIndices, setBuilder, setSelectedCfgIdx, setSelectionAnchor])

  const handleConfigSelect = useCallback((event: MouseEvent, idx: number) => {
    const cfg = customCfgs[idx]
    if (!cfg) return

    const computeNext = (prev: number[]): number[] => {
      if (event.shiftKey && selectionAnchorRef.current !== null) {
        const anchor = selectionAnchorRef.current
        const [lo, hi] = anchor < idx ? [anchor, idx] : [idx, anchor]
        const visibleSet = visibleConfigIndicesRef?.current ?? null
        if (!visibleSet || visibleSet.size === 0) {
          return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
        }
        const span: number[] = []
        for (let i = lo; i <= hi; i += 1) {
          if (visibleSet.has(i)) span.push(i)
        }
        if (span.length === 0) {
          return visibleSet.has(idx) ? [idx] : []
        }
        return span
      }
      if (event.ctrlKey || event.metaKey) {
        const set = new Set(prev)
        if (set.has(idx)) {
          set.delete(idx)
        } else {
          set.add(idx)
        }
        return Array.from(set).sort((a, b) => a - b)
      }
      return [idx]
    }

    const previousSelection = selectedCfgIndices
    const computedSelection = computeNext(previousSelection)
    // Track whether the selection actually changed before we mutate state.
    // Why: repeated clicks should not re-trigger selection side effects.
    const selectionChanged = !arraysEqual(previousSelection, computedSelection)
    // Apply the new selection only when it differs from the previous value.
    // Why: keep render churn low when a click selects the same chip.
    if (selectionChanged) {
      applySelection(computedSelection)
    }
    // Preserve the previous selection when there is no change.
    // Why: downstream logic relies on stable array identity.
    const finalSelection = selectionChanged ? computedSelection : previousSelection
    const last = finalSelection.length ? finalSelection[finalSelection.length - 1] : null

    if (selectionAnchorRef.current !== (last ?? null)) {
      setSelectionAnchor(last ?? null)
    }
    if (selectedCfgIdx !== (last ?? null)) {
      setSelectedCfgIdx(last ?? null)
    }

    if (finalSelection.length === 1) {
      const only = customCfgs[finalSelection[0]!]
      if (only) setBuilder(only)
    }
    // Only request preview auto-scroll when a direct user selection changed.
    // Why: endpoint-driven updates can re-render without user intent.
    if (selectionChanged && finalSelection.length === 1) {
      // Capture the explicit target so the preview scrolls to the new config.
      // Why: selection state updates can lag in transition-rendered views.
      const targetCfgIdx = finalSelection[0] ?? null
      onSelectionScrollRequest?.(SELECTION_SCROLL_SOURCE_USER, targetCfgIdx)
    }
  }, [applySelection, customCfgs, onSelectionScrollRequest, selectedCfgIdx, selectedCfgIndices, setBuilder, setSelectedCfgIdx, setSelectionAnchor, visibleConfigIndicesRef])

  const handleConfigDelete = useCallback((idx: number) => {
    if (selectedCfgIndices.length > 1 && selectedCfgIndices.includes(idx)) {
      const targets = selectedCfgIndices.slice().sort((a, b) => a - b)
      requestDeleteMulti(targets)
    } else {
      requestDeleteSingle(idx)
    }
  }, [requestDeleteMulti, requestDeleteSingle, selectedCfgIndices])

  // Config mutations emit their own history descriptors; guard selection changes so they do not add extra draft entries.
  const handleConfigDuplicate = useCallback((idx: number) => {
    suppressSelectionDraft(() => {
      // Duplicate the current selection or just the clicked index.
      const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
        ? selectedCfgIndices.slice().sort((a, b) => a - b)
        : [idx]
      // Snapshot the current config list for stable indexing.
      const prev = customCfgs
      // Clone the selected configs so duplicates stay identity-unique.
      const copies = selected
        .map(i => (i >= 0 && i < prev.length ? prev[i] : undefined))
        .filter((cfg): cfg is BuilderConfig => Boolean(cfg))
        .map(cfg => cloneBuilderConfig(cfg))
      // If nothing can be duplicated, skip the update.
      if (copies.length === 0) {
        describeNextChange(null)
        return
      }
      // Insert the copies right after the last selected index.
      const insertAfter = Math.max(...selected)
      const insertIdx = Math.min(prev.length, insertAfter + 1)
      const next = [...prev.slice(0, insertIdx), ...copies, ...prev.slice(insertIdx)]
      const labels: string[] = []
      // Build labels for history entries using the post-insert indices.
      for (let i = 0; i < copies.length; i += 1) {
        const newIdx = insertIdx + i
        const cfg = next[newIdx]
        if (!cfg) continue
        labels.push(buildConfigLabel(newIdx, cfg, t))
      }
      const descriptor = describeConfigsDuplicated({
        insertIndex: insertIdx,
        labels,
        previous: prev,
        t,
      })
      describeNextChange(descriptor)
      // Commit the new configs before switching selection.
      setCustomCfgs(next)
      const newIdxs = copies.map((_, i) => insertIdx + i)
      // Switching selection should still flush auto-apply when enabled.
      applySelection(newIdxs)
      const last = newIdxs[newIdxs.length - 1] ?? null
      setSelectedCfgIdx(last)
      setSelectionAnchor(last)
    })
  }, [applySelection, customCfgs, describeNextChange, selectedCfgIndices, setCustomCfgs, setSelectedCfgIdx, setSelectionAnchor, suppressSelectionDraft, t])

  const handleConfigMoveUp = useCallback((idx: number) => {
    suppressSelectionDraft(() => {
      // Reorder the active selection when multi-select is on.
      const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
        ? selectedCfgIndices.slice().sort((a, b) => a - b)
        : [idx]
      // Copy the array so we can swap in place safely.
      const prev = customCfgs
      const arr = [...prev]
      let changed = false
      // Move in ascending order so earlier swaps do not skip entries.
      for (const i of selected) {
        if (i <= 0) continue
        if (!arr[i] || !arr[i - 1]) continue
        changed = true
        const tmp = arr[i - 1]!; arr[i - 1] = arr[i]!; arr[i] = tmp
      }
      // If nothing moved, avoid state churn and history noise.
      if (!changed) {
        describeNextChange(null)
        return
      }
      const descriptor = describeConfigsMoved({
        prev,
        next: arr,
        selection: selected,
        direction: 'up',
        t,
      })
      describeNextChange(descriptor)
      // Commit the reordered list before syncing selection indices.
      setCustomCfgs(arr)
      const newSel = mapSelectionByIdentity(prev, arr, selected)
      // Reorders should not trigger auto-apply or draft capture.
      syncSelectionAfterReorder(newSel)
    })
  }, [customCfgs, describeNextChange, selectedCfgIndices, setCustomCfgs, suppressSelectionDraft, syncSelectionAfterReorder, t])

  const handleConfigMoveDown = useCallback((idx: number) => {
    suppressSelectionDraft(() => {
      // Reorder the active selection when multi-select is on.
      const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
        ? selectedCfgIndices.slice().sort((a, b) => a - b)
        : [idx]
      // Copy the array so we can swap in place safely.
      const prev = customCfgs
      const arr = [...prev]
      let changed = false
      // Move in descending order so later swaps do not skip entries.
      for (let k = selected.length - 1; k >= 0; k -= 1) {
        const i = selected[k]!
        if (i >= arr.length - 1) continue
        if (!arr[i] || !arr[i + 1]) continue
        changed = true
        const tmp = arr[i + 1]!; arr[i + 1] = arr[i]!; arr[i] = tmp
      }
      // If nothing moved, avoid state churn and history noise.
      if (!changed) {
        describeNextChange(null)
        return
      }
      const descriptor = describeConfigsMoved({
        prev,
        next: arr,
        selection: selected,
        direction: 'down',
        t,
      })
      describeNextChange(descriptor)
      // Commit the reordered list before syncing selection indices.
      setCustomCfgs(arr)
      const newSel = mapSelectionByIdentity(prev, arr, selected)
      // Reorders should not trigger auto-apply or draft capture.
      syncSelectionAfterReorder(newSel)
    })
  }, [customCfgs, describeNextChange, selectedCfgIndices, setCustomCfgs, suppressSelectionDraft, syncSelectionAfterReorder, t])

  const handleConfigMoveTop = useCallback((idx: number) => {
    suppressSelectionDraft(() => {
      // Reorder the active selection when multi-select is on.
      const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
        ? selectedCfgIndices.slice().sort((a, b) => a - b)
        : [idx]
      // Work from the current config list for identity mapping.
      const prev = customCfgs
      if (selected[0] === 0) {
        describeNextChange(null)
        return
      }
      const remaining = prev.filter((_, i) => !selected.includes(i))
      const block = selected.map(i => prev[i]!)
      const next = [...block, ...remaining]
      const descriptor = describeConfigsMoved({
        prev,
        next,
        selection: selected,
        direction: 'top',
        t,
      })
      describeNextChange(descriptor)
      // Commit the reordered list before syncing selection indices.
      setCustomCfgs(next)
      const newSel = mapSelectionByIdentity(prev, next, selected)
      // Reorders should not trigger auto-apply or draft capture.
      syncSelectionAfterReorder(newSel)
    })
  }, [customCfgs, describeNextChange, selectedCfgIndices, setCustomCfgs, suppressSelectionDraft, syncSelectionAfterReorder, t])

  const handleConfigMoveBottom = useCallback((idx: number) => {
    suppressSelectionDraft(() => {
      // Reorder the active selection when multi-select is on.
      const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
        ? selectedCfgIndices.slice().sort((a, b) => a - b)
        : [idx]
      // Work from the current config list for identity mapping.
      const prev = customCfgs
      if (selected[selected.length - 1] === prev.length - 1) {
        describeNextChange(null)
        return
      }
      const remaining = prev.filter((_, i) => !selected.includes(i))
      const block = selected.map(i => prev[i]!)
      const next = [...remaining, ...block]
      const descriptor = describeConfigsMoved({
        prev,
        next,
        selection: selected,
        direction: 'bottom',
        t,
      })
      describeNextChange(descriptor)
      // Commit the reordered list before syncing selection indices.
      setCustomCfgs(next)
      const newSel = mapSelectionByIdentity(prev, next, selected)
      // Reorders should not trigger auto-apply or draft capture.
      syncSelectionAfterReorder(newSel)
    })
  }, [customCfgs, describeNextChange, selectedCfgIndices, setCustomCfgs, suppressSelectionDraft, syncSelectionAfterReorder, t])

  const handleConfigReorder = useCallback((movingIndices: number[], rawTargetIndex: number, options?: { mode?: 'move' | 'copy' }) => {
    if (!Array.isArray(movingIndices) || movingIndices.length === 0) return
    suppressSelectionDraft(() => {
      // Derive the reorder mode once so we can branch cleanly.
      const mode = options?.mode === 'copy' ? 'copy' : 'move'
      // Reorder moves need at least two configs to make sense.
      if (mode === 'move' && customCfgs.length <= 1) {
        describeNextChange(null)
        return
      }
      // Sanitize the incoming indices against the current list length.
      const sanitized = Array.from(new Set(
        movingIndices
          .map((idx) => (Number.isInteger(idx) ? Number(idx) : -1))
          .filter((idx) => idx >= 0 && idx < customCfgs.length),
      )).sort((a, b) => a - b)
      if (sanitized.length === 0) {
        describeNextChange(null)
        return
      }
      // Resolve the moving configs by identity before mutating the list.
      const prev = customCfgs
      const movingItems = sanitized
        .map((idx) => prev[idx])
        .filter((cfg): cfg is BuilderConfig => Boolean(cfg))
      if (movingItems.length === 0) {
        describeNextChange(null)
        return
      }
      // Clamp the insertion target into the current bounds.
      const clampedTarget = Math.max(0, Math.min(prev.length, rawTargetIndex))
      if (mode === 'copy') {
        // Copy entries with fresh identity so selection mapping stays stable.
        const copies = movingItems.map(cfg => cloneBuilderConfig(cfg))
        if (copies.length === 0) {
          describeNextChange(null)
          return
        }
        const next = [
          ...prev.slice(0, clampedTarget),
          ...copies,
          ...prev.slice(clampedTarget),
        ]
        const labels: string[] = []
        // Build labels for history entries using the post-insert indices.
        for (let i = 0; i < copies.length; i += 1) {
          const newIdx = clampedTarget + i
          const cfg = next[newIdx]
          if (!cfg) continue
          labels.push(buildConfigLabel(newIdx, cfg, t))
        }
        const descriptor = describeConfigsDuplicated({
          insertIndex: clampedTarget,
          labels,
          previous: prev,
          t,
        })
        describeNextChange(descriptor)
        // Commit the copied list before switching selection.
        setCustomCfgs(next)
        const newSelection = copies.map((_, offset) => clampedTarget + offset)
        // Copy inserts should still trigger auto-apply before selection changes.
        applySelection(newSelection)
        const last = newSelection[newSelection.length - 1] ?? null
        setSelectedCfgIdx(last)
        setSelectionAnchor(last)
        return
      }
      const minSel = sanitized[0]!
      const maxSel = sanitized[sanitized.length - 1]!
      // Ignore drops that land inside the existing selection span.
      if (clampedTarget >= minSel && clampedTarget <= maxSel + 1) {
        describeNextChange(null)
        return
      }
      const selectionSet = new Set(sanitized)
      const remaining = prev.filter((_, idx) => !selectionSet.has(idx))
      let insertIdx = clampedTarget
      // Adjust for the items removed before the insertion point.
      for (const idx of sanitized) {
        if (idx < clampedTarget) insertIdx -= 1
      }
      insertIdx = Math.max(0, Math.min(remaining.length, insertIdx))
      const next = [
        ...remaining.slice(0, insertIdx),
        ...movingItems,
        ...remaining.slice(insertIdx),
      ]
      const atTop = insertIdx === 0
      const atBottom = insertIdx === remaining.length
      let direction: 'up' | 'down' | 'top' | 'bottom' = 'down'
      if (atTop) {
        direction = 'top'
      } else if (atBottom) {
        direction = 'bottom'
      } else if (insertIdx < minSel) {
        direction = 'up'
      } else {
        direction = 'down'
      }
      const descriptor = describeConfigsMoved({
        prev,
        next,
        selection: sanitized,
        direction,
        t,
      })
      describeNextChange(descriptor)
      // Commit the reordered list before syncing selection indices.
      setCustomCfgs(next)
      const newSelection = mapSelectionByIdentity(prev, next, sanitized)
      // Reorders should not trigger auto-apply or draft capture.
      syncSelectionAfterReorder(newSelection)
    })
  }, [applySelection, customCfgs, describeNextChange, setCustomCfgs, setSelectedCfgIdx, setSelectionAnchor, suppressSelectionDraft, syncSelectionAfterReorder, t])

  const handleSelectAllConfigs = useCallback(() => {
    const visibleSet = visibleConfigIndicesRef?.current ?? null
    const all = visibleSet
      ? Array.from(visibleSet)
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < customCfgs.length)
        .sort((a, b) => a - b)
      : customCfgs.map((_, i) => i)
    applySelection(all)
    const nextSelected = (() => {
      if (!all.length) return null
      if (typeof selectedCfgIdx === 'number' && selectedCfgIdx >= 0 && selectedCfgIdx < customCfgs.length && (!visibleSet || visibleSet.has(selectedCfgIdx))) {
        return selectedCfgIdx
      }
      return all[0]!
    })()
    setSelectedCfgIdx(nextSelected)
    setSelectionAnchor(nextSelected)
  }, [applySelection, customCfgs, selectedCfgIdx, setSelectedCfgIdx, setSelectionAnchor, visibleConfigIndicesRef])

  const handleClearSelection = useCallback(() => {
    applySelection([])
    setSelectedCfgIdx(null)
    setSelectionAnchor(null)
  }, [applySelection, setSelectedCfgIdx, setSelectionAnchor])

  return {
    selectedCfgIndices,
    setSelectedCfgIndices: applySelection,
    multiselectActive,
    selectionAnchor,
    prepareDragSelection,
    setHoveredCfgIdx,
    handleConfigHoverIdx,
    multiSelectedConfigs,
    multiEditDraftState,
    setMultiEditDraftState,
    multiEditHandle,
    applyMultiEditDraft,
    handleConfigSelect,
    handleConfigDelete,
    handleConfigDuplicate,
    handleConfigMoveUp,
    handleConfigMoveDown,
    handleConfigMoveTop,
    handleConfigMoveBottom,
    handleConfigReorder,
    handleSelectAllConfigs,
    handleClearSelection,
    setSelectionAnchor,
  }
}
