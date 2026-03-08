import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent, type MutableRefObject, type SetStateAction } from 'react'
import { arraysEqual } from '../lib/array'
import type { BuilderRecipe } from '../lib/hsfBuilder'
import {
  createMultiEditDraft,
  syncMultiEditDraft,
  cloneBuilderFieldValue,
  cloneFieldPatch,
  normalizeFieldPatch,
  areFieldPatchesEqual,
  areBuilderFieldValuesEqual,
  BUILDER_FIELD_KEYS,
  applyMultiEditFieldsToRecipe,
  getDirtyBuilderFieldKeys,
  cloneBuilderRecipe,
  type MultiEditDraftState,
  type BuilderFieldKey,
  type MultiEditFieldCommit,
  type MultiEditDraftHandle,
  type MultiEditFields,
  type MultiEditFieldPatch,
} from '../lib/recipeMultiEditDraft'
import { SELECTION_SCROLL_SOURCE_USER, type SelectionScrollSource } from '../lib/constants'
import type { DescribeNextChangeFn } from '../hooks/useSfrHistory'
import {
  createRecipesDuplicatedDescriptor,
  createRecipesMovedDescriptor,
  createMultiEditAppliedDescriptor,
} from '../history/recipeCollectionDescriptors'
import { buildInsertionLocation, snapshotRecipeLabel } from '../history/historyLabelUtils'
import { collectChangedFields } from '../history/builderUpdateDescriptor'
import { setRecipeHoverIndex } from '../lib/recipeHoverBridge'
import {
  sanitizeDragIndices,
  moveReorderItems,
  copyReorderItems,
  resolveDragSelectionIndices,
} from '../lib/chipListReorder'

type UseRecipeSelectionParams = {
  customRecipes: BuilderRecipe[]
  setCustomRecipes: Dispatch<SetStateAction<BuilderRecipe[]>>
  selectedRecipeIdx: number | null
  setSelectedRecipeIdx: Dispatch<SetStateAction<number | null>>
  setBuilder: Dispatch<SetStateAction<BuilderRecipe>>
  onWillChangeSelection?: ((previous: number[], next: number[]) => void) | undefined
  onSelectionScrollRequest?: ((source: SelectionScrollSource, targetRecipeIdx: number | null) => void) | undefined
  requestDeleteSingle: (idx: number) => void
  requestDeleteMulti: (targets: number[]) => void
  describeNextChange: DescribeNextChangeFn
  suppressSelectionDraft: <T>(fn: () => T) => T
  visibleRecipeIndicesRef: MutableRefObject<ReadonlySet<number> | null>
}

export type UseRecipeSelectionResult = {
  selectedRecipeIndices: number[]
  setSelectedRecipeIndices: (next: number[], options?: { suppressWillChange?: boolean }) => void
  multiselectActive: boolean
  selectionAnchor: number | null
  prepareDragSelection: (idx: number) => number[]
  setHoveredRecipeIdx: (idx: number | null) => void
  handleRecipeHoverIdx: (idx: number | null) => void
  multiSelectedRecipes: BuilderRecipe[]
  multiEditDraftState: MultiEditDraftState | null
  setMultiEditDraftState: Dispatch<SetStateAction<MultiEditDraftState | null>>
  multiEditHandle: MultiEditDraftHandle | null
  applyMultiEditDraft: () => void
  handleRecipeSelect: (event: MouseEvent, idx: number) => void
  handleRecipeDelete: (idx: number) => void
  handleRecipeDuplicate: (idx: number) => void
  handleRecipeMoveUp: (idx: number) => void
  handleRecipeMoveDown: (idx: number) => void
  handleRecipeMoveTop: (idx: number) => void
  handleRecipeMoveBottom: (idx: number) => void
  handleRecipeReorder: (movingIndices: number[], targetIndex: number, options?: { mode?: 'move' | 'copy' }) => void
  handleSelectAllRecipes: () => void
  handleClearSelection: () => void
  setSelectionAnchor: Dispatch<SetStateAction<number | null>>
}

// Extra flags for selection updates that should skip auto-apply/draft capture.
type ApplySelectionOptions = {
  suppressWillChange?: boolean
}

const mapSelectionByIdentity = (
  prev: BuilderRecipe[],
  next: BuilderRecipe[],
  selection: number[],
): number[] => {
  // Preserve selection by object identity so reorders stay stable.
  if (!Array.isArray(selection) || selection.length === 0) return []
  // Collect the selected recipes from the previous list.
  const selectedItems: BuilderRecipe[] = []
  for (const idx of selection) {
    const recipe = prev[idx]
    // Skip invalid indices or missing recipes.
    if (!recipe) continue
    selectedItems.push(recipe)
  }
  // If no recipes are matched, there is no selection to restore.
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
 * Centralizes recipe selection and multi-edit draft state so App.tsx only wires the orchestration.
 * The hook keeps selection + anchor indices in sync with the global selected recipe index and
 * exposes handlers used by the chips list and builder toolbar.
 */
export function useRecipeSelection({
  customRecipes,
  setCustomRecipes,
  selectedRecipeIdx,
  setSelectedRecipeIdx,
  setBuilder,
  onWillChangeSelection,
  onSelectionScrollRequest,
  requestDeleteSingle,
  requestDeleteMulti,
  describeNextChange,
  suppressSelectionDraft,
  visibleRecipeIndicesRef,
}: UseRecipeSelectionParams): UseRecipeSelectionResult {
  const [selectedRecipeIndices, setSelectedRecipeIndicesState] = useState<number[]>([])
  const selectionAnchorRef = useRef<number | null>(null)
  const [selectionAnchor, setSelectionAnchorState] = useState<number | null>(null)
  const selectedIndicesRef = useRef<number[]>([])
  const multiselectActive = selectedRecipeIndices.length > 1

  const multiSelectedIndices = useMemo(() => {
    if (selectedRecipeIndices.length <= 1) return []
    const next: number[] = []
    for (const idx of selectedRecipeIndices) {
      if (idx < 0) continue
      if (idx >= customRecipes.length) continue
      if (!customRecipes[idx]) continue
      next.push(idx)
    }
    return next
  }, [customRecipes, selectedRecipeIndices])

  const multiSelectedRecipes = useMemo(() => {
    if (multiSelectedIndices.length === 0) return []
    const result: BuilderRecipe[] = []
    for (const idx of multiSelectedIndices) {
      const recipe = customRecipes[idx]
      if (recipe) result.push(recipe)
    }
    return result
  }, [customRecipes, multiSelectedIndices])

  const [multiEditDraftState, setMultiEditDraftState] = useState<MultiEditDraftState | null>(null)

  useEffect(() => {
    selectedIndicesRef.current = selectedRecipeIndices
  }, [selectedRecipeIndices])

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
    setSelectedRecipeIndicesState(normalized)
  }, [onWillChangeSelection])

  useEffect(() => {
    if (multiSelectedRecipes.length < 2) {
      setMultiEditDraftState(prev => (prev === null ? prev : null))
      return
    }
    const base = createMultiEditDraft(multiSelectedRecipes, multiSelectedIndices)
    setMultiEditDraftState(prev => syncMultiEditDraft(prev, base))
  }, [multiSelectedRecipes, multiSelectedIndices])

  const setSelectionAnchor = useCallback<Dispatch<SetStateAction<number | null>>>((value) => {
    const next = typeof value === 'function'
      ? (value as (prev: number | null) => number | null)(selectionAnchorRef.current)
      : (value ?? null)
    if (selectionAnchorRef.current === next) return
    selectionAnchorRef.current = next
    setSelectionAnchorState(next)
  }, [])

  const syncSelectionAfterReorder = useCallback((nextSelection: number[]) => {
    // Reorders keep the same recipes selected, so skip auto-apply/draft capture.
    applySelection(nextSelection, { suppressWillChange: true })
    // Anchor to the last selected index so keyboard navigation stays intuitive.
    const last = nextSelection.length > 0 ? nextSelection[nextSelection.length - 1]! : null
    setSelectedRecipeIdx(last)
    setSelectionAnchor(last)
  }, [applySelection, setSelectedRecipeIdx, setSelectionAnchor])

  const updateMultiEditField = useCallback(<K extends BuilderFieldKey>(
    key: K,
    commit: MultiEditFieldCommit<BuilderRecipe[K], K>,
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
    setCustomRecipes(prev => {
      let changed = false
      const entries: Array<{ index: number; previous: BuilderRecipe; next: BuilderRecipe }> = []
      const next = prev.map((recipe, idx) => {
        if (!selectionSet.has(idx)) return recipe
        const updated = applyMultiEditFieldsToRecipe(recipe, fields, dirtyKeys)
        if (updated !== recipe) {
          changed = true
          entries.push({ index: idx, previous: recipe, next: updated })
          return updated
        }
        return recipe
      })
      if (!changed) {
        describeNextChange(null)
        return prev
      }
      const fieldKeySet = new Set<BuilderFieldKey>(dirtyKeys)
      for (const entry of entries) {
        const changedKeys = collectChangedFields(entry.previous, entry.next)
        for (const key of changedKeys) fieldKeySet.add(key)
      }
      const labels = entries.map((entry) => snapshotRecipeLabel(entry.index, entry.next))
      const descriptor = createMultiEditAppliedDescriptor({
        labels,
        fieldKeys: Array.from(fieldKeySet),
      })
      describeNextChange(descriptor)
      return next
    })
    resetAllMultiEditFields()
  }, [describeNextChange, multiEditDraftState, resetAllMultiEditFields, setCustomRecipes])

  const multiEditHandle = useMemo<MultiEditDraftHandle | null>(() => {
    if (!multiEditDraftState) return null
    return {
      state: multiEditDraftState,
      updateField: updateMultiEditField,
      resetField: resetMultiEditField,
      resetAll: resetAllMultiEditFields,
    }
  }, [multiEditDraftState, resetAllMultiEditFields, resetMultiEditField, updateMultiEditField])

  const setHoveredRecipeIdx = useCallback((idx: number | null) => {
    setRecipeHoverIndex(idx)
  }, [])

  const handleRecipeHoverIdx = useCallback((idx: number | null) => {
    setRecipeHoverIndex(idx)
  }, [])

  const prepareDragSelection = useCallback((idx: number): number[] => {
    return resolveDragSelectionIndices(idx, customRecipes.length, selectedRecipeIndices, (singleIdx) => {
      // Collapse selection to the single dragged item and load it into the builder.
      const recipe = customRecipes[singleIdx]
      applySelection([singleIdx])
      setSelectedRecipeIdx(singleIdx)
      setSelectionAnchor(singleIdx)
      if (recipe) setBuilder(recipe)
    })
  }, [applySelection, customRecipes, selectedRecipeIndices, setBuilder, setSelectedRecipeIdx, setSelectionAnchor])

  const handleRecipeSelect = useCallback((event: MouseEvent, idx: number) => {
    const recipe = customRecipes[idx]
    if (!recipe) return

    const computeNext = (prev: number[]): number[] => {
      if (event.shiftKey && selectionAnchorRef.current !== null) {
        const anchor = selectionAnchorRef.current
        const [lo, hi] = anchor < idx ? [anchor, idx] : [idx, anchor]
        const visibleSet = visibleRecipeIndicesRef?.current ?? null
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

    const previousSelection = selectedRecipeIndices
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
    if (selectedRecipeIdx !== (last ?? null)) {
      setSelectedRecipeIdx(last ?? null)
    }

    if (finalSelection.length === 1) {
      const only = customRecipes[finalSelection[0]!]
      if (only) setBuilder(only)
    }
    // Only request preview auto-scroll when a direct user selection changed.
    // Why: endpoint-driven updates can re-render without user intent.
    if (selectionChanged && finalSelection.length === 1) {
      // Capture the explicit target so the preview scrolls to the new recipe.
      // Why: selection state updates can lag in transition-rendered views.
      const targetRecipeIdx = finalSelection[0] ?? null
      onSelectionScrollRequest?.(SELECTION_SCROLL_SOURCE_USER, targetRecipeIdx)
    }
  }, [applySelection, customRecipes, onSelectionScrollRequest, selectedRecipeIdx, selectedRecipeIndices, setBuilder, setSelectedRecipeIdx, setSelectionAnchor, visibleRecipeIndicesRef])

  const handleRecipeDelete = useCallback((idx: number) => {
    if (selectedRecipeIndices.length > 1 && selectedRecipeIndices.includes(idx)) {
      const targets = selectedRecipeIndices.slice().sort((a, b) => a - b)
      requestDeleteMulti(targets)
    } else {
      requestDeleteSingle(idx)
    }
  }, [requestDeleteMulti, requestDeleteSingle, selectedRecipeIndices])

  // Recipe mutations emit their own history descriptors; guard selection changes so they do not add extra draft entries.
  const handleRecipeDuplicate = useCallback((idx: number) => {
    suppressSelectionDraft(() => {
      // Duplicate the current selection or just the clicked index.
      const selected = selectedRecipeIndices.includes(idx) && selectedRecipeIndices.length > 1
        ? selectedRecipeIndices.slice().sort((a, b) => a - b)
        : [idx]
      // Snapshot the current recipe list for stable indexing.
      const prev = customRecipes
      // Clone the selected recipes so duplicates stay identity-unique.
      const copies = selected
        .map(i => (i >= 0 && i < prev.length ? prev[i] : undefined))
        .filter((recipe): recipe is BuilderRecipe => Boolean(recipe))
        .map(recipe => cloneBuilderRecipe(recipe))
      // If nothing can be duplicated, skip the update.
      if (copies.length === 0) {
        describeNextChange(null)
        return
      }
      // Insert the copies right after the last selected index.
      const insertAfter = Math.max(...selected)
      const insertIdx = Math.min(prev.length, insertAfter + 1)
      const next = [...prev.slice(0, insertIdx), ...copies, ...prev.slice(insertIdx)]
      const labels = copies
        .map((_, offset) => {
          const newIdx = insertIdx + offset
          const recipe = next[newIdx]
          return recipe ? snapshotRecipeLabel(newIdx, recipe) : null
        })
        .filter((label): label is ReturnType<typeof snapshotRecipeLabel> => Boolean(label))
      const descriptor = createRecipesDuplicatedDescriptor({
        labels,
        location: buildInsertionLocation(insertIdx, prev),
      })
      describeNextChange(descriptor)
      // Commit the new recipes before switching selection.
      setCustomRecipes(next)
      const newIdxs = copies.map((_, i) => insertIdx + i)
      // Switching selection should still flush auto-apply when enabled.
      applySelection(newIdxs)
      const last = newIdxs[newIdxs.length - 1] ?? null
      setSelectedRecipeIdx(last)
      setSelectionAnchor(last)
    })
  }, [applySelection, customRecipes, describeNextChange, selectedRecipeIndices, setCustomRecipes, setSelectedRecipeIdx, setSelectionAnchor, suppressSelectionDraft])

  const handleRecipeMoveUp = useCallback((idx: number) => {
    suppressSelectionDraft(() => {
      // Reorder the active selection when multi-select is on.
      const selected = selectedRecipeIndices.includes(idx) && selectedRecipeIndices.length > 1
        ? selectedRecipeIndices.slice().sort((a, b) => a - b)
        : [idx]
      // Copy the array so we can swap in place safely.
      const prev = customRecipes
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
      const newSel = mapSelectionByIdentity(prev, arr, selected)
      const labels = newSel
        .map((idxNew) => {
          const recipe = arr[idxNew]
          return recipe ? snapshotRecipeLabel(idxNew, recipe) : null
        })
        .filter((label): label is ReturnType<typeof snapshotRecipeLabel> => Boolean(label))
      const descriptor = createRecipesMovedDescriptor({
        direction: 'up',
        labels,
      })
      describeNextChange(descriptor)
      // Commit the reordered list before syncing selection indices.
      setCustomRecipes(arr)
      // Reorders should not trigger auto-apply or draft capture.
      syncSelectionAfterReorder(newSel)
    })
  }, [customRecipes, describeNextChange, selectedRecipeIndices, setCustomRecipes, suppressSelectionDraft, syncSelectionAfterReorder])

  const handleRecipeMoveDown = useCallback((idx: number) => {
    suppressSelectionDraft(() => {
      // Reorder the active selection when multi-select is on.
      const selected = selectedRecipeIndices.includes(idx) && selectedRecipeIndices.length > 1
        ? selectedRecipeIndices.slice().sort((a, b) => a - b)
        : [idx]
      // Copy the array so we can swap in place safely.
      const prev = customRecipes
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
      const newSel = mapSelectionByIdentity(prev, arr, selected)
      const labels = newSel
        .map((idxNew) => {
          const recipe = arr[idxNew]
          return recipe ? snapshotRecipeLabel(idxNew, recipe) : null
        })
        .filter((label): label is ReturnType<typeof snapshotRecipeLabel> => Boolean(label))
      const descriptor = createRecipesMovedDescriptor({
        direction: 'down',
        labels,
      })
      describeNextChange(descriptor)
      // Commit the reordered list before syncing selection indices.
      setCustomRecipes(arr)
      // Reorders should not trigger auto-apply or draft capture.
      syncSelectionAfterReorder(newSel)
    })
  }, [customRecipes, describeNextChange, selectedRecipeIndices, setCustomRecipes, suppressSelectionDraft, syncSelectionAfterReorder])

  const handleRecipeMoveTop = useCallback((idx: number) => {
    suppressSelectionDraft(() => {
      // Reorder the active selection when multi-select is on.
      const selected = selectedRecipeIndices.includes(idx) && selectedRecipeIndices.length > 1
        ? selectedRecipeIndices.slice().sort((a, b) => a - b)
        : [idx]
      // Work from the current recipe list for identity mapping.
      const prev = customRecipes
      if (selected[0] === 0) {
        describeNextChange(null)
        return
      }
      const remaining = prev.filter((_, i) => !selected.includes(i))
      const block = selected.map(i => prev[i]!)
      const next = [...block, ...remaining]
      const newSel = mapSelectionByIdentity(prev, next, selected)
      const labels = newSel
        .map((idxNew) => {
          const recipe = next[idxNew]
          return recipe ? snapshotRecipeLabel(idxNew, recipe) : null
        })
        .filter((label): label is ReturnType<typeof snapshotRecipeLabel> => Boolean(label))
      const descriptor = createRecipesMovedDescriptor({
        direction: 'top',
        labels,
      })
      describeNextChange(descriptor)
      // Commit the reordered list before syncing selection indices.
      setCustomRecipes(next)
      // Reorders should not trigger auto-apply or draft capture.
      syncSelectionAfterReorder(newSel)
    })
  }, [customRecipes, describeNextChange, selectedRecipeIndices, setCustomRecipes, suppressSelectionDraft, syncSelectionAfterReorder])

  const handleRecipeMoveBottom = useCallback((idx: number) => {
    suppressSelectionDraft(() => {
      // Reorder the active selection when multi-select is on.
      const selected = selectedRecipeIndices.includes(idx) && selectedRecipeIndices.length > 1
        ? selectedRecipeIndices.slice().sort((a, b) => a - b)
        : [idx]
      // Work from the current recipe list for identity mapping.
      const prev = customRecipes
      if (selected[selected.length - 1] === prev.length - 1) {
        describeNextChange(null)
        return
      }
      const remaining = prev.filter((_, i) => !selected.includes(i))
      const block = selected.map(i => prev[i]!)
      const next = [...remaining, ...block]
      const newSel = mapSelectionByIdentity(prev, next, selected)
      const labels = newSel
        .map((idxNew) => {
          const recipe = next[idxNew]
          return recipe ? snapshotRecipeLabel(idxNew, recipe) : null
        })
        .filter((label): label is ReturnType<typeof snapshotRecipeLabel> => Boolean(label))
      const descriptor = createRecipesMovedDescriptor({
        direction: 'bottom',
        labels,
      })
      describeNextChange(descriptor)
      // Commit the reordered list before syncing selection indices.
      setCustomRecipes(next)
      // Reorders should not trigger auto-apply or draft capture.
      syncSelectionAfterReorder(newSel)
    })
  }, [customRecipes, describeNextChange, selectedRecipeIndices, setCustomRecipes, suppressSelectionDraft, syncSelectionAfterReorder])

  const handleRecipeReorder = useCallback((movingIndices: number[], rawTargetIndex: number, options?: { mode?: 'move' | 'copy' }) => {
    if (!Array.isArray(movingIndices) || movingIndices.length === 0) return
    suppressSelectionDraft(() => {
      // Derive the reorder mode once so we can branch cleanly.
      const mode = options?.mode === 'copy' ? 'copy' : 'move'
      // Reorder moves need at least two recipes to make sense.
      if (mode === 'move' && customRecipes.length <= 1) {
        describeNextChange(null)
        return
      }
      // Sanitize indices and delegate all array manipulation to the shared utility.
      const prev = customRecipes
      const sanitized = sanitizeDragIndices(movingIndices, prev.length)
      if (sanitized.length === 0) {
        describeNextChange(null)
        return
      }
      if (mode === 'copy') {
        const result = copyReorderItems(prev, sanitized, rawTargetIndex, cloneBuilderRecipe)
        if (!result) {
          describeNextChange(null)
          return
        }
        const { next, copies, insertIdx } = result
        const labels = copies
          .map((_, offset) => {
            const newIdx = insertIdx + offset
            const recipe = next[newIdx]
            return recipe ? snapshotRecipeLabel(newIdx, recipe) : null
          })
          .filter((label): label is ReturnType<typeof snapshotRecipeLabel> => Boolean(label))
        const descriptor = createRecipesDuplicatedDescriptor({
          labels,
          location: buildInsertionLocation(insertIdx, prev),
        })
        describeNextChange(descriptor)
        setCustomRecipes(next)
        const newSelection = copies.map((_, offset) => insertIdx + offset)
        applySelection(newSelection)
        const last = newSelection[newSelection.length - 1] ?? null
        setSelectedRecipeIdx(last)
        setSelectionAnchor(last)
        return
      }
      const moveResult = moveReorderItems(prev, sanitized, rawTargetIndex)
      if (!moveResult) {
        describeNextChange(null)
        return
      }
      const { next, direction } = moveResult
      const newSelection = mapSelectionByIdentity(prev, next, sanitized)
      const labels = newSelection
        .map((idxNew) => {
          const recipe = next[idxNew]
          return recipe ? snapshotRecipeLabel(idxNew, recipe) : null
        })
        .filter((label): label is ReturnType<typeof snapshotRecipeLabel> => Boolean(label))
      const descriptor = createRecipesMovedDescriptor({
        direction,
        labels,
      })
      describeNextChange(descriptor)
      // Commit the reordered list before syncing selection indices.
      setCustomRecipes(next)
      // Reorders should not trigger auto-apply or draft capture.
      syncSelectionAfterReorder(newSelection)
    })
  }, [applySelection, customRecipes, describeNextChange, setCustomRecipes, setSelectedRecipeIdx, setSelectionAnchor, suppressSelectionDraft, syncSelectionAfterReorder])

  const handleSelectAllRecipes = useCallback(() => {
    const visibleSet = visibleRecipeIndicesRef?.current ?? null
    const all = visibleSet
      ? Array.from(visibleSet)
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < customRecipes.length)
        .sort((a, b) => a - b)
      : customRecipes.map((_, i) => i)
    applySelection(all)
    const nextSelected = (() => {
      if (!all.length) return null
      if (typeof selectedRecipeIdx === 'number' && selectedRecipeIdx >= 0 && selectedRecipeIdx < customRecipes.length && (!visibleSet || visibleSet.has(selectedRecipeIdx))) {
        return selectedRecipeIdx
      }
      return all[0]!
    })()
    setSelectedRecipeIdx(nextSelected)
    setSelectionAnchor(nextSelected)
  }, [applySelection, customRecipes, selectedRecipeIdx, setSelectedRecipeIdx, setSelectionAnchor, visibleRecipeIndicesRef])

  const handleClearSelection = useCallback(() => {
    applySelection([])
    setSelectedRecipeIdx(null)
    setSelectionAnchor(null)
  }, [applySelection, setSelectedRecipeIdx, setSelectionAnchor])

  return {
    selectedRecipeIndices,
    setSelectedRecipeIndices: applySelection,
    multiselectActive,
    selectionAnchor,
    prepareDragSelection,
    setHoveredRecipeIdx,
    handleRecipeHoverIdx,
    multiSelectedRecipes,
    multiEditDraftState,
    setMultiEditDraftState,
    multiEditHandle,
    applyMultiEditDraft,
    handleRecipeSelect,
    handleRecipeDelete,
    handleRecipeDuplicate,
    handleRecipeMoveUp,
    handleRecipeMoveDown,
    handleRecipeMoveTop,
    handleRecipeMoveBottom,
    handleRecipeReorder,
    handleSelectAllRecipes,
    handleClearSelection,
    setSelectionAnchor,
  }
}
