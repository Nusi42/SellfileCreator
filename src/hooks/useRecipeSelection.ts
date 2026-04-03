/**
 * useRecipeSelection.ts
 *
 * Thin wrapper over useItemListManager for BuilderRecipe lists.
 * All selection state, move, duplicate, delete, and reorder logic lives in the
 * generic hook; this file adds recipe-specific multi-edit field handlers,
 * history descriptor emission, hover tracking, and typed multiEditHandle.
 */
import {
  useCallback,
  useMemo,
  type Dispatch,
  type MouseEvent,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
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
import type { DescribeNextChangeFn } from '../hooks/useSfcHistory'
import {
  createRecipesDuplicatedDescriptor,
  createRecipesMovedDescriptor,
  createMultiEditAppliedDescriptor,
} from '../history/recipeCollectionDescriptors'
import { buildInsertionLocation, snapshotRecipeLabel } from '../history/historyLabelUtils'
import { collectChangedFields } from '../history/builderUpdateDescriptor'
import { setRecipeHoverIndex } from '../lib/recipeHoverBridge'
import { useItemListManager, type ItemMutationOp } from './useItemListManager'

// ── param / result types ──────────────────────────────────────────────────────

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
  updateSelectionAnchor: Dispatch<SetStateAction<number | null>>
}

// ── hook ──────────────────────────────────────────────────────────────────────

/**
 * useRecipeSelection
 *
 * Wraps useItemListManager with BuilderRecipe-specific multi-edit field logic
 * and history descriptor emission.
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
  // ── history descriptor emission ───────────────────────────────────────

  // Translates a generic mutation op into a recipe history descriptor and
  // forwards it to describeNextChange. Called by the generic hook for every
  // structural mutation (move, duplicate, reorder).
  const onDescribeNextChange = useCallback((op: ItemMutationOp<BuilderRecipe> | null) => {
    if (!op) { describeNextChange(null); return }

    // Helper: snapshot recipe labels at the new positions for the descriptor.
    const labelAt = (newIdx: number, arr: readonly BuilderRecipe[]) => {
      const r = arr[newIdx]
      return r ? snapshotRecipeLabel(newIdx, r) : null
    }
    const toLabels = (indices: readonly number[], arr: readonly BuilderRecipe[]) =>
      indices.map((i) => labelAt(i, arr)).filter((l) => l !== null) as ReturnType<typeof snapshotRecipeLabel>[]

    if (op.kind === 'move') {
      describeNextChange(createRecipesMovedDescriptor({
        direction: op.direction,
        labels: toLabels(op.newIndices, op.next),
      }))
      return
    }
    if (op.kind === 'duplicate') {
      describeNextChange(createRecipesDuplicatedDescriptor({
        labels: toLabels(op.newIndices, op.next),
        location: buildInsertionLocation(op.insertIdx, Array.from(op.prev)),
      }))
      return
    }
    if (op.kind === 'reorder-move') {
      describeNextChange(createRecipesMovedDescriptor({
        direction: op.direction,
        labels: toLabels(op.newIndices, op.next),
      }))
      return
    }
    if (op.kind === 'reorder-copy') {
      describeNextChange(createRecipesDuplicatedDescriptor({
        labels: toLabels(op.newIndices, op.next),
        location: buildInsertionLocation(op.insertIdx, Array.from(op.prev)),
      }))
      return
    }
    describeNextChange(null)
  }, [describeNextChange])

  // Adapt the recipe scroll callback (source + nullable idx) to the generic
  // (plain idx: number) interface expected by useItemListManager.
  const adaptedScrollRequest = useCallback((idx: number) => {
    onSelectionScrollRequest?.(SELECTION_SCROLL_SOURCE_USER, idx)
  }, [onSelectionScrollRequest])

  // ── generic core ────────────────────────────────────────────────────────

  const mgr = useItemListManager<BuilderRecipe, MultiEditDraftState>({
    items: customRecipes,
    applyItemsChange: setCustomRecipes,
    selectedIdx: selectedRecipeIdx,
    setSelectedIdx: setSelectedRecipeIdx,
    setBuilder,
    cloneItem: cloneBuilderRecipe,
    onWillChangeSelection,
    onSelectionScrollRequest: adaptedScrollRequest,
    visibleIndicesRef: visibleRecipeIndicesRef,
    createDraft: createMultiEditDraft,
    syncDraft: syncMultiEditDraft,
    requestDeleteSingle,
    requestDeleteMulti,
    suppressSelectionDraft,
    onDescribeNextChange,
    // Recipe: only scroll when selection changes and collapses to a single item.
    scrollOnlyOnSingleSelectionChange: true,
  })

  const {
    multiEditDraftState,
    setMultiEditDraftState,
  } = mgr

  // ── hover state (recipe-specific) ─────────────────────────────────────

  const setHoveredRecipeIdx = useCallback((idx: number | null) => {
    setRecipeHoverIndex(idx)
  }, [])

  const handleRecipeHoverIdx = useCallback((idx: number | null) => {
    setRecipeHoverIndex(idx)
  }, [])

  // ── multi-edit field handlers ──────────────────────────────────────────

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
  }, [setMultiEditDraftState])

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
  }, [setMultiEditDraftState])

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
  }, [setMultiEditDraftState])

  // ── multi-edit apply (recipe-specific: emits history descriptor) ──────

  const applyMultiEditDraft = useCallback(() => {
    if (!multiEditDraftState) return
    if (multiEditDraftState.selection.length < 2) return
    const dirtyKeys = getDirtyBuilderFieldKeys(multiEditDraftState.fields)
    if (dirtyKeys.length === 0) return
    // Selection stores numeric indices directly for recipe multi-edit.
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

  // ── multi-edit handle ─────────────────────────────────────────────────

  const multiEditHandle = useMemo<MultiEditDraftHandle | null>(() => {
    if (!multiEditDraftState) return null
    return {
      state: multiEditDraftState,
      updateField: updateMultiEditField,
      resetField: resetMultiEditField,
      resetAll: resetAllMultiEditFields,
    }
  }, [multiEditDraftState, resetAllMultiEditFields, resetMultiEditField, updateMultiEditField])

  // ── result ────────────────────────────────────────────────────────────

  return {
    selectedRecipeIndices: mgr.selectedIndices,
    setSelectedRecipeIndices: mgr.setSelectedIndices,
    multiselectActive: mgr.multiselectActive,
    selectionAnchor: mgr.selectionAnchor,
    prepareDragSelection: mgr.prepareDragSelection,
    setHoveredRecipeIdx,
    handleRecipeHoverIdx,
    multiSelectedRecipes: mgr.multiSelectedItems,
    multiEditDraftState,
    setMultiEditDraftState,
    multiEditHandle,
    applyMultiEditDraft,
    handleRecipeSelect: mgr.handleItemSelect,
    handleRecipeDelete: mgr.handleItemDelete,
    handleRecipeDuplicate: mgr.handleItemDuplicate,
    handleRecipeMoveUp: mgr.handleItemMoveUp,
    handleRecipeMoveDown: mgr.handleItemMoveDown,
    handleRecipeMoveTop: mgr.handleItemMoveTop,
    handleRecipeMoveBottom: mgr.handleItemMoveBottom,
    handleRecipeReorder: mgr.handleReorder,
    handleSelectAllRecipes: mgr.handleSelectAll,
    handleClearSelection: mgr.handleClearSelection,
    updateSelectionAnchor: mgr.updateSelectionAnchor,
  }
}
