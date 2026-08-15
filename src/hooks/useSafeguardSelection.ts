/**
 * useSafeguardSelection.ts
 *
 * Thin wrapper over useItemListManager for SafeguardRule lists.
 * All selection state, move, duplicate, delete, and reorder logic lives in the
 * generic hook; this file adds only the safeguard-specific multi-edit field
 * handlers, typed multiEditHandle, and applyMultiEditDraft.
 */
import {
  useCallback,
  useMemo,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
} from 'react'
import type { SafeguardRule } from '../lib/safeguards'
import { cloneSafeguardRule } from '../lib/safeguards'
// Directional moves keep a group's run together and levelled drops decide membership; the
// array maths for both lives in one place.
import { moveSafeguardEntriesForDrop, resolveSafeguardDirectionalMove, resolveSafeguardDropMembership } from '../lib/safeguardGroups'
import {
  createSafeguardMultiEditDraft,
  syncSafeguardMultiEditDraft,
  cloneSafeguardFieldValue,
  cloneSafeguardFieldPatch,
  normalizeSafeguardFieldPatch,
  areSafeguardFieldPatchesEqual,
  areSafeguardFieldValuesEqual,
  applyMultiEditFieldsToSafeguardRule,
  getDirtySafeguardFieldKeys,
  cloneSafeguardRuleForSelection,
  SAFEGUARD_FIELD_KEYS,
  type SafeguardMultiEditDraftState,
  type SafeguardMultiEditDraftHandle,
  type SafeguardMultiEditFields,
  type SafeguardMultiEditFieldPatch,
  type SafeguardFieldKey,
  type SafeguardMultiEditFieldCommit,
} from '../lib/safeguardMultiEditDraft'
import { useItemListManager } from './useItemListManager'

// ── parameter and return types ────────────────────────────────────────────────

export type UseSafeguardSelectionParams = {
  safeguardRules: SafeguardRule[]
  /** Functional setState for the live rule list (via App.tsx transition wrapper). */
  applySafeguardRulesChange: (value: React.SetStateAction<SafeguardRule[]>) => void
  /** Currently active rule index shown in the builder form (null = none). */
  selectedRuleIdx: number | null
  setSelectedRuleIdx: (idx: number | null) => void
  /** Called with (prev, next) index arrays before a selection change commits; used for auto-apply. */
  onWillChangeSelection?: ((previous: number[], next: number[]) => void) | undefined
  /** Scroll the chips panel to a specific rule index after selection changes. */
  onSelectionScrollRequest?: ((ruleIdx: number) => void) | undefined
  /** Set of currently visible rule indices (for filter-aware shift-select). */
  visibleRuleIndicesRef: React.MutableRefObject<ReadonlySet<number> | null>
  /**
   * Loads a single rule into the builder draft when selection collapses to one item.
   * Call with cloneSafeguardRule(rule).
   */
  setSafeguardBuilder: React.Dispatch<React.SetStateAction<SafeguardRule>>
  /**
   * Route single-rule deletes through a confirmation dialog instead of the
   * manager's direct-filter fallback. Omit to keep the legacy direct delete.
   */
  requestDeleteSingle?: (idx: number) => void
  /**
   * Route multi-rule deletes through a confirmation dialog. Required for the
   * count-aware safeguard delete UX (mirrors the recipe builder).
   */
  requestDeleteMulti?: (indices: number[]) => void
}

export type UseSafeguardSelectionResult = {
  selectedRuleIndices: number[]
  setSelectedRuleIndices: (next: number[], options?: { suppressWillChange?: boolean }) => void
  multiselectActive: boolean
  selectionAnchor: number | null
  multiSelectedRules: SafeguardRule[]
  multiEditDraftState: SafeguardMultiEditDraftState | null
  setMultiEditDraftState: Dispatch<SetStateAction<SafeguardMultiEditDraftState | null>>
  multiEditHandle: SafeguardMultiEditDraftHandle | null
  applyMultiEditDraft: () => void
  handleRuleSelect: (event: MouseEvent, ruleIdx: number) => void
  handleRuleDelete: (ruleIdx: number) => void
  handleRuleDuplicate: (ruleIdx: number) => void
  handleRuleMoveUp: (ruleIdx: number) => void
  handleRuleMoveDown: (ruleIdx: number) => void
  handleRuleMoveTop: (ruleIdx: number) => void
  handleRuleMoveBottom: (ruleIdx: number) => void
  handleSelectAllRules: () => void
  handleClearSelection: () => void
  /** Delete all currently-selected rules (keyboard shortcut target). */
  handleDeleteSelected: () => void
  /**
   * Called by useChipListDnd's onPrepareSelection when a drag gesture starts.
   * Returns the sorted index array to drag: the full selection when the dragged
   * chip is already selected, or collapses selection to just that chip.
   */
  prepareDragSelection: (idx: number) => number[]
  /**
   * Full multi-index reorder handler for useChipListDnd's onReorder.
   * Handles contiguous and non-contiguous multi-rule drags as well as copy mode.
   */
  handleRuleReorder: (movingIndices: number[], targetIndex: number, options?: { mode?: 'move' | 'copy' }) => void
  updateSelectionAnchor: Dispatch<SetStateAction<number | null>>
}

// ── hook ──────────────────────────────────────────────────────────────────────

/**
 * useSafeguardSelection
 *
 * Wraps useItemListManager with SafeguardRule-specific multi-edit field logic.
 * Selection, mutation, and DnD behaviour are all handled by the generic hook.
 */
export function useSafeguardSelection({
  safeguardRules,
  applySafeguardRulesChange,
  selectedRuleIdx,
  setSelectedRuleIdx,
  onWillChangeSelection,
  onSelectionScrollRequest,
  visibleRuleIndicesRef,
  setSafeguardBuilder,
  requestDeleteSingle,
  requestDeleteMulti,
}: UseSafeguardSelectionParams): UseSafeguardSelectionResult {
  // ── generic core ────────────────────────────────────────────────────────

  const mgr = useItemListManager<SafeguardRule, SafeguardMultiEditDraftState>({
    items: safeguardRules,
    applyItemsChange: applySafeguardRulesChange,
    selectedIdx: selectedRuleIdx,
    setSelectedIdx: setSelectedRuleIdx,
    setBuilder: setSafeguardBuilder,
    cloneItem: cloneSafeguardRule,
    onWillChangeSelection,
    onSelectionScrollRequest,
    visibleIndicesRef: visibleRuleIndicesRef,
    // Forward delete-request callbacks so chip deletes open the centralized
    // ConfirmDialogs (count-aware) instead of the manager's direct-filter
    // fallback. Absent ⇒ manager keeps the legacy direct-delete behavior.
    ...(requestDeleteSingle ? { requestDeleteSingle } : {}),
    ...(requestDeleteMulti ? { requestDeleteMulti } : {}),
    // Safeguards have no history tracking — no suppressSelectionDraft or onDescribeNextChange.
    // Multi-edit draft: selection keys are string-converted indices per SafeguardMultiEditDraftState.
    createDraft: (items, indices) =>
      createSafeguardMultiEditDraft(items, indices.map(String)),
    syncDraft: syncSafeguardMultiEditDraft,
    // Scroll fires on every click (safeguard default — scrollOnlyOnSingleSelectionChange absent).
    // Safeguards carry GROUPS: a run of members must travel as one block and an outsider must
    // hop over it rather than land inside, so the manager's default element swap is replaced
    // for all four directions at once. The array maths lives in lib/safeguardGroups so the
    // menu, the arrows, the keyboard and drag & drop all agree. Recipes omit this and keep the swap.
    resolveDirectionalMove: resolveSafeguardDirectionalMove,
    // A drop that carries a level (1 = inside the bracket) joins the run touching the drop
    // point; a flush drop (0) leaves whatever run the entries were in. Move and Ctrl-copy alike.
    resolveDropMove: (prev, moving, target, depth, mode) => {
      const membership = resolveSafeguardDropMembership(prev, target)
      // A drop strictly inside a run always joins it; otherwise the pointer level decides.
      const join = membership.kind === 'forced' || (membership.kind === 'optional' && depth > 0)
      return moveSafeguardEntriesForDrop(prev, moving, target, join ? membership.settings : null, mode)
    },
  })

  // Destructure multi-edit state from the generic result.
  // TDraft is SafeguardMultiEditDraftState so these types are already exact.
  const {
    multiEditDraftState,
    setMultiEditDraftState,
  } = mgr

  // ── multi-edit field handlers ──────────────────────────────────────────

  const updateMultiEditField = useCallback(<K extends SafeguardFieldKey>(
    key: K,
    commit: SafeguardMultiEditFieldCommit<unknown, K>,
  ) => {
    setMultiEditDraftState((prev) => {
      if (!prev) return prev
      const currentField = prev.fields[key]
      if (!currentField) return prev
      const nextStatus = commit.status ?? 'common'
      const nextValue = cloneSafeguardFieldValue(key, commit.value as unknown)
      const nextPatch = normalizeSafeguardFieldPatch(
        key,
        cloneSafeguardFieldPatch(key, commit.patch as SafeguardMultiEditFieldPatch<typeof key>),
      )
      const cloneMixed = (vals: unknown[] | null | undefined): unknown[] | null => {
        if (!vals || vals.length === 0) return null
        return vals.map((v) => cloneSafeguardFieldValue(key, v))
      }
      const mixedEqual = (l: unknown[] | null, r: unknown[] | null): boolean => {
        if (!l && !r) return true
        if (!l || !r) return false
        if (l.length !== r.length) return false
        for (let i = 0; i < l.length; i += 1) {
          if (!areSafeguardFieldValuesEqual(key, l[i], r[i])) return false
        }
        return true
      }
      // Revert to clean state when the value matches the initial snapshot.
      const matchesInitial = nextStatus === currentField.initialStatus
        && areSafeguardFieldValuesEqual(key, nextValue, currentField.initialValue)
        && nextPatch === null
      const resolvedMixed = nextStatus === 'mixed'
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
            value: cloneSafeguardFieldValue(key, currentField.initialValue),
            mixedValues: cloneMixed(currentField.initialMixedValues),
            patch: null,
            dirty: false,
          }
        : {
            ...currentField,
            status: nextStatus,
            value: nextValue,
            mixedValues: resolvedMixed,
            patch: nextPatch,
            dirty: true,
          }
      // Bail early when nothing actually changed.
      if (
        currentField.status === nextField.status
        && areSafeguardFieldValuesEqual(key, currentField.value, nextField.value)
        && mixedEqual(currentField.mixedValues, nextField.mixedValues)
        && areSafeguardFieldPatchesEqual(
            key,
            currentField.patch as SafeguardMultiEditFieldPatch<typeof key> | null,
            nextField.patch as SafeguardMultiEditFieldPatch<typeof key> | null,
          )
        && currentField.dirty === nextField.dirty
      ) {
        return prev
      }
      const nextFields: SafeguardMultiEditFields = { ...prev.fields }
      nextFields[key] = nextField
      return { ...prev, fields: nextFields }
    })
  }, [setMultiEditDraftState])

  const resetMultiEditField = useCallback((key: SafeguardFieldKey) => {
    setMultiEditDraftState((prev) => {
      if (!prev) return prev
      const f = prev.fields[key]
      if (!f) return prev
      const cloneMixed = (vals: unknown[] | null): unknown[] | null => {
        if (!vals || vals.length === 0) return null
        return vals.map((v) => cloneSafeguardFieldValue(key, v))
      }
      const alreadyInitial = !f.dirty
        && f.status === f.initialStatus
        && areSafeguardFieldValuesEqual(key, f.value, f.initialValue)
        && f.patch == null
      if (alreadyInitial) return prev
      const nextFields: SafeguardMultiEditFields = { ...prev.fields }
      nextFields[key] = {
        ...f,
        status: f.initialStatus,
        value: cloneSafeguardFieldValue(key, f.initialValue),
        mixedValues: cloneMixed(f.initialMixedValues),
        patch: null,
        dirty: false,
      }
      return { ...prev, fields: nextFields }
    })
  }, [setMultiEditDraftState])

  const resetAllMultiEditFields = useCallback(() => {
    setMultiEditDraftState((prev) => {
      if (!prev) return prev
      let changed = false
      const nextFields: SafeguardMultiEditFields = { ...prev.fields }
      for (const key of SAFEGUARD_FIELD_KEYS) {
        const f = prev.fields[key]
        if (!f) continue
        const cloneMixed = (vals: unknown[] | null): unknown[] | null => {
          if (!vals || vals.length === 0) return null
          return vals.map((v) => cloneSafeguardFieldValue(key, v))
        }
        if (!f.dirty && f.status === f.initialStatus && areSafeguardFieldValuesEqual(key, f.value, f.initialValue) && f.patch == null) {
          nextFields[key] = f
          continue
        }
        changed = true
        nextFields[key] = {
          ...f,
          status: f.initialStatus,
          value: cloneSafeguardFieldValue(key, f.initialValue),
          mixedValues: cloneMixed(f.initialMixedValues),
          patch: null,
          dirty: false,
        }
      }
      return changed ? { ...prev, fields: nextFields } : prev
    })
  }, [setMultiEditDraftState])

  // ── multi-edit apply ──────────────────────────────────────────────────

  const applyMultiEditDraft = useCallback(() => {
    if (!multiEditDraftState) return
    if (multiEditDraftState.selection.length < 2) return
    const dirtyKeys = getDirtySafeguardFieldKeys(multiEditDraftState.fields)
    if (dirtyKeys.length === 0) return
    // Selection keys are index strings; recover the numeric indices.
    const selectionIndices = new Set(multiEditDraftState.selection.map(Number))
    const fields = multiEditDraftState.fields
    // Refresh the builder before resetting the draft so the panel has the new
    // value ready the moment the multi-edit overlay disappears. setBuilder is
    // the SSOT for keeping the builder in sync after any mutation that doesn't
    // collapse the selection (same path useItemListManager uses on single-item
    // collapse).
    if (selectedRuleIdx !== null) {
      const focusedRule = safeguardRules[selectedRuleIdx]
      if (focusedRule) {
        const updated = selectionIndices.has(selectedRuleIdx)
          ? applyMultiEditFieldsToSafeguardRule(focusedRule, fields, dirtyKeys)
          : focusedRule
        setSafeguardBuilder(cloneSafeguardRule(updated))
      }
    }
    applySafeguardRulesChange((prev) => {
      let changed = false
      const next = prev.map((rule, i) => {
        if (!selectionIndices.has(i)) return rule
        const updated = applyMultiEditFieldsToSafeguardRule(rule, fields, dirtyKeys)
        if (updated !== rule) { changed = true; return updated }
        return rule
      })
      return changed ? next : prev
    })
    resetAllMultiEditFields()
  }, [applySafeguardRulesChange, multiEditDraftState, resetAllMultiEditFields, safeguardRules, selectedRuleIdx, setSafeguardBuilder])

  // ── multi-edit handle ─────────────────────────────────────────────────

  const multiEditHandle = useMemo<SafeguardMultiEditDraftHandle | null>(() => {
    if (!multiEditDraftState) return null
    return {
      state: multiEditDraftState,
      updateField: updateMultiEditField as SafeguardMultiEditDraftHandle['updateField'],
      resetField: resetMultiEditField,
      resetAll: resetAllMultiEditFields,
    }
  }, [multiEditDraftState, resetAllMultiEditFields, resetMultiEditField, updateMultiEditField])

  // ── result ────────────────────────────────────────────────────────────

  return {
    selectedRuleIndices: mgr.selectedIndices,
    setSelectedRuleIndices: mgr.setSelectedIndices,
    multiselectActive: mgr.multiselectActive,
    selectionAnchor: mgr.selectionAnchor,
    multiSelectedRules: mgr.multiSelectedItems,
    multiEditDraftState,
    setMultiEditDraftState,
    multiEditHandle,
    applyMultiEditDraft,
    handleRuleSelect: mgr.handleItemSelect,
    handleRuleDelete: mgr.handleItemDelete,
    handleRuleDuplicate: mgr.handleItemDuplicate,
    handleRuleMoveUp: mgr.handleItemMoveUp,
    handleRuleMoveDown: mgr.handleItemMoveDown,
    handleRuleMoveTop: mgr.handleItemMoveTop,
    handleRuleMoveBottom: mgr.handleItemMoveBottom,
    handleSelectAllRules: mgr.handleSelectAll,
    handleClearSelection: mgr.handleClearSelection,
    handleDeleteSelected: mgr.handleDeleteSelected,
    prepareDragSelection: mgr.prepareDragSelection,
    handleRuleReorder: mgr.handleReorder,
    updateSelectionAnchor: mgr.updateSelectionAnchor,
  }
}

// Re-export so callers only need one import.
export type { SafeguardMultiEditDraftHandle, SafeguardMultiEditDraftState, SafeguardFieldKey }
export { cloneSafeguardRuleForSelection }
