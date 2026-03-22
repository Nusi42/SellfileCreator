/**
 * useSafeguardSelection.ts
 *
 * Index-based multi-select and multi-edit draft hook for SafeguardRule lists.
 * Mirrors the architecture of useRecipeSelection but uses numeric indices
 * rather than string IDs (safeguards have no stable identity field).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
} from 'react'
import { arraysEqual } from '../lib/array'
import type { SafeguardRule } from '../lib/safeguards'
import { cloneSafeguardRule } from '../lib/safeguards'
import {
  sanitizeDragIndices,
  moveReorderItems,
  copyReorderItems,
  resolveDragSelectionIndices,
} from '../lib/chipListReorder'
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
   * Mirrors useRecipeSelection's setBuilder param — call with cloneSafeguardRule(rule).
   */
  setSafeguardBuilder: React.Dispatch<React.SetStateAction<SafeguardRule>>
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

type ApplySelectionOptions = { suppressWillChange?: boolean }

// ── hook ──────────────────────────────────────────────────────────────────────

/**
 * useSafeguardSelection
 *
 * Centralizes safeguard rule selection and multi-edit draft state so App.tsx
 * only wires the orchestration. The hook uses index-based selection (symmetric
 * with useRecipeSelection), tracking rule object identity across reorders.
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
}: UseSafeguardSelectionParams): UseSafeguardSelectionResult {
  const [selectedRuleIndices, setSelectedRuleIndices] = useState<number[]>([])
  const selectionAnchorRef = useRef<number | null>(null)
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null)
  const selectedIndicesRef = useRef<number[]>([])
  const multiselectActive = selectedRuleIndices.length > 1

  // Derive multi-selected rule objects from the current index list.
  const multiSelectedRules = useMemo(() => {
    if (selectedRuleIndices.length <= 1) return []
    return selectedRuleIndices
      .map((i) => safeguardRules[i])
      .filter((r): r is SafeguardRule => r !== undefined)
  }, [safeguardRules, selectedRuleIndices])

  const [multiEditDraftState, setMultiEditDraftState] = useState<SafeguardMultiEditDraftState | null>(null)

  // Keep the ref in sync so closures always read the latest selection.
  useEffect(() => {
    selectedIndicesRef.current = selectedRuleIndices
  }, [selectedRuleIndices])

  // Rebuild the draft during render whenever the multi-selection or the rules change.
  const [prevMultiSelectedRules, setPrevMultiSelectedRules] = useState(multiSelectedRules)
  if (multiSelectedRules !== prevMultiSelectedRules) {
    setPrevMultiSelectedRules(multiSelectedRules)
    if (multiSelectedRules.length < 2) {
      if (multiEditDraftState !== null) setMultiEditDraftState(null)
    } else {
      // Pass indices as the stable selection token for the multi-edit draft.
      const selectionKeys = selectedRuleIndices.slice(0, multiSelectedRules.length).map(String)
      const base = createSafeguardMultiEditDraft(multiSelectedRules, selectionKeys)
      setMultiEditDraftState((prev) => syncSafeguardMultiEditDraft(prev, base))
    }
  }

  // ── selection management ──────────────────────────────────────────────────

  const updateSelectionAnchor = useCallback<Dispatch<SetStateAction<number | null>>>((value) => {
    const next = typeof value === 'function'
      ? (value as (prev: number | null) => number | null)(selectionAnchorRef.current)
      : (value ?? null)
    if (selectionAnchorRef.current === next) return
    selectionAnchorRef.current = next
    setSelectionAnchor(next)
  }, [])

  const applySelection = useCallback((nextIndices: number[], options?: ApplySelectionOptions) => {
    const normalized = nextIndices.slice()
    const prevIndices = selectedIndicesRef.current
    // Bail when nothing changes so side-effects don't re-fire.
    if (arraysEqual(prevIndices, normalized)) return
    if (!options?.suppressWillChange && onWillChangeSelection) {
      onWillChangeSelection(prevIndices.slice(), normalized.slice())
    }
    selectedIndicesRef.current = normalized
    setSelectedRuleIndices(normalized)
  }, [onWillChangeSelection])

  // ── click handler ─────────────────────────────────────────────────────────

  const handleRuleSelect = useCallback((event: MouseEvent, ruleIdx: number) => {
    const rulesSnapshot = safeguardRules

    // Compute what the next selection should be.
    const computeNext = (prev: number[]): number[] => {
      if (event.shiftKey && selectionAnchorRef.current !== null) {
        // Build a range between anchor and clicked index, respecting the visible set.
        const anchorIdx = selectionAnchorRef.current
        const [lo, hi] = anchorIdx < ruleIdx ? [anchorIdx, ruleIdx] : [ruleIdx, anchorIdx]
        const visibleSet = visibleRuleIndicesRef?.current ?? null
        const span: number[] = []
        for (let i = lo; i <= hi; i += 1) {
          if (i >= rulesSnapshot.length) continue
          if (visibleSet && !visibleSet.has(i)) continue
          span.push(i)
        }
        return span.length > 0 ? span : [ruleIdx]
      }
      if (event.ctrlKey || event.metaKey) {
        const set = new Set(prev)
        if (set.has(ruleIdx)) {
          set.delete(ruleIdx)
        } else {
          set.add(ruleIdx)
        }
        // Preserve ascending order.
        return Array.from(set).sort((a, b) => a - b)
      }
      return [ruleIdx]
    }

    const prev = selectedRuleIndices
    const next = computeNext(prev)
    const selectionChanged = !arraysEqual(prev, next)
    if (selectionChanged) applySelection(next)
    const final = selectionChanged ? next : prev
    const last = final.length > 0 ? final[final.length - 1]! : null

    if (selectionAnchorRef.current !== last) updateSelectionAnchor(last ?? null)
    if (selectedRuleIdx !== last) setSelectedRuleIdx(last)
    // When selection settles on exactly one rule, load it into the builder draft.
    if (final.length === 1) {
      const only = rulesSnapshot[final[0]!]
      if (only) setSafeguardBuilder(cloneSafeguardRule(only))
    }
    // Scroll to the active rule on every click (unconditional to allow retry after reorder).
    if (last !== null) onSelectionScrollRequest?.(last)
  }, [
    applySelection,
    onSelectionScrollRequest,
    safeguardRules,
    selectedRuleIdx,
    selectedRuleIndices,
    setSelectedRuleIdx,
    updateSelectionAnchor,
    setSafeguardBuilder,
    visibleRuleIndicesRef,
  ])

  // ── mutation handlers ─────────────────────────────────────────────────────

  const handleRuleDelete = useCallback((ruleIdx: number) => {
    // When multiple rules are selected and the clicked index is in the set,
    // delete all selected rules at once.
    const targets = selectedRuleIndices.length > 1 && selectedRuleIndices.includes(ruleIdx)
      ? selectedRuleIndices.slice()
      : [ruleIdx]
    const targetSet = new Set(targets)
    applySafeguardRulesChange((prev) => prev.filter((_, i) => !targetSet.has(i)))
    // Clear the selection if the active rule was deleted.
    if (selectedRuleIdx !== null && targetSet.has(selectedRuleIdx)) {
      applySelection([])
      setSelectedRuleIdx(null)
      updateSelectionAnchor(null)
    }
  }, [applySafeguardRulesChange, applySelection, selectedRuleIdx, selectedRuleIndices, setSelectedRuleIdx, updateSelectionAnchor])

  const handleRuleDuplicate = useCallback((ruleIdx: number) => {
    // Duplicate all selected rules if the clicked one is part of the selection.
    const selected = selectedRuleIndices.length > 1 && selectedRuleIndices.includes(ruleIdx)
      ? selectedRuleIndices
      : [ruleIdx]
    // Capture the single copy so we can load it into the builder immediately.
    let singleCopy: SafeguardRule | null = null
    let newIndices: number[] = []
    applySafeguardRulesChange((prev) => {
      // Find the last selected index to determine insertion point.
      const lastIdx = selected.reduce((max, i) => (i < prev.length ? Math.max(max, i) : max), -1)
      if (lastIdx === -1) return prev
      const copies = selected
        .map((i) => prev[i])
        .filter((r): r is SafeguardRule => r !== undefined)
        .map((r) => cloneSafeguardRule(r))
      if (copies.length === 0) return prev
      if (copies.length === 1) singleCopy = copies[0]!
      const next = [
        ...prev.slice(0, lastIdx + 1),
        ...copies,
        ...prev.slice(lastIdx + 1),
      ]
      // New copies land immediately after the last selected index.
      newIndices = copies.map((_, ci) => lastIdx + 1 + ci)
      return next
    })
    // Select the duplicates after state commits (next tick).
    setTimeout(() => {
      if (newIndices.length === 0) return
      applySelection(newIndices)
      const lastNew = newIndices[newIndices.length - 1]!
      setSelectedRuleIdx(lastNew)
      updateSelectionAnchor(lastNew)
      // Load the single copy into the builder so the user sees the duplicate immediately.
      if (newIndices.length === 1 && singleCopy) setSafeguardBuilder(cloneSafeguardRule(singleCopy))
      onSelectionScrollRequest?.(lastNew)
    }, 0)
  }, [applySafeguardRulesChange, applySelection, onSelectionScrollRequest, selectedRuleIndices, setSelectedRuleIdx, updateSelectionAnchor, setSafeguardBuilder])

  const handleRuleMoveUp = useCallback((ruleIdx: number) => {
    const selected = selectedRuleIndices.length > 1 && selectedRuleIndices.includes(ruleIdx)
      ? new Set(selectedRuleIndices)
      : new Set([ruleIdx])
    applySafeguardRulesChange((prev) => {
      const arr = [...prev]
      let changed = false
      for (let i = 1; i < arr.length; i += 1) {
        if (!selected.has(i)) continue
        if (selected.has(i - 1)) continue
        changed = true
        const tmp = arr[i - 1]!; arr[i - 1] = arr[i]!; arr[i] = tmp
      }
      return changed ? arr : prev
    })
  }, [applySafeguardRulesChange, selectedRuleIndices])

  const handleRuleMoveDown = useCallback((ruleIdx: number) => {
    const selected = selectedRuleIndices.length > 1 && selectedRuleIndices.includes(ruleIdx)
      ? new Set(selectedRuleIndices)
      : new Set([ruleIdx])
    applySafeguardRulesChange((prev) => {
      const arr = [...prev]
      let changed = false
      for (let i = arr.length - 2; i >= 0; i -= 1) {
        if (!selected.has(i)) continue
        if (selected.has(i + 1)) continue
        changed = true
        const tmp = arr[i + 1]!; arr[i + 1] = arr[i]!; arr[i] = tmp
      }
      return changed ? arr : prev
    })
  }, [applySafeguardRulesChange, selectedRuleIndices])

  const handleRuleMoveTop = useCallback((ruleIdx: number) => {
    const selected = selectedRuleIndices.length > 1 && selectedRuleIndices.includes(ruleIdx)
      ? new Set(selectedRuleIndices)
      : new Set([ruleIdx])
    applySafeguardRulesChange((prev) => {
      const block = prev.filter((_, i) => selected.has(i))
      const rest = prev.filter((_, i) => !selected.has(i))
      if (block.length === 0) return prev
      const next = [...block, ...rest]
      // Skip when already at the top.
      if (prev.length === next.length && prev.every((r, i) => r === next[i])) return prev
      return next
    })
  }, [applySafeguardRulesChange, selectedRuleIndices])

  const handleRuleMoveBottom = useCallback((ruleIdx: number) => {
    const selected = selectedRuleIndices.length > 1 && selectedRuleIndices.includes(ruleIdx)
      ? new Set(selectedRuleIndices)
      : new Set([ruleIdx])
    applySafeguardRulesChange((prev) => {
      const block = prev.filter((_, i) => selected.has(i))
      const rest = prev.filter((_, i) => !selected.has(i))
      if (block.length === 0) return prev
      const next = [...rest, ...block]
      if (prev.length === next.length && prev.every((r, i) => r === next[i])) return prev
      return next
    })
  }, [applySafeguardRulesChange, selectedRuleIndices])

  const handleSelectAllRules = useCallback(() => {
    const visibleSet = visibleRuleIndicesRef?.current ?? null
    const all = visibleSet
      ? safeguardRules.map((_, i) => i).filter((i) => visibleSet.has(i))
      : safeguardRules.map((_, i) => i)
    applySelection(all)
    const keep = selectedRuleIdx !== null && all.includes(selectedRuleIdx)
      ? selectedRuleIdx
      : (all[0] ?? null)
    setSelectedRuleIdx(keep)
    updateSelectionAnchor(keep)
  }, [applySelection, safeguardRules, selectedRuleIdx, setSelectedRuleIdx, updateSelectionAnchor, visibleRuleIndicesRef])

  const handleClearSelection = useCallback(() => {
    applySelection([])
    setSelectedRuleIdx(null)
    updateSelectionAnchor(null)
  }, [applySelection, setSelectedRuleIdx, updateSelectionAnchor])

  // Deletes all currently-selected rules via the keyboard shortcut path.
  const handleDeleteSelected = useCallback(() => {
    if (selectedRuleIndices.length === 0) return
    // Re-use the first selected index — handleRuleDelete detects the multi-select set.
    handleRuleDelete(selectedRuleIndices[0]!)
  }, [handleRuleDelete, selectedRuleIndices])

  // ── drag-and-drop reorder ─────────────────────────────────────────────────

  // Called by useChipListDnd.onPrepareSelection at drag-start.
  const prepareDragSelection = useCallback((idx: number): number[] => {
    return resolveDragSelectionIndices(
      idx,
      safeguardRules.length,
      selectedRuleIndices.slice().sort((a, b) => a - b),
      (singleIdx) => {
        // Collapse: select only the dragged rule.
        const rule = safeguardRules[singleIdx]
        if (!rule) return
        applySelection([singleIdx])
        setSelectedRuleIdx(singleIdx)
        updateSelectionAnchor(singleIdx)
        setSafeguardBuilder(cloneSafeguardRule(rule))
      },
    )
  }, [applySelection, safeguardRules, selectedRuleIndices, setSelectedRuleIdx, updateSelectionAnchor, setSafeguardBuilder])

  // Full multi-index reorder handler. Delegates to the shared chipListReorder utilities.
  const handleRuleReorder = useCallback((movingIndices: number[], rawTargetIndex: number, options?: { mode?: 'move' | 'copy' }) => {
    if (!Array.isArray(movingIndices) || movingIndices.length === 0) return
    const prev = safeguardRules
    const sanitized = sanitizeDragIndices(movingIndices, prev.length)
    if (sanitized.length === 0) return
    const mode = options?.mode === 'copy' ? 'copy' : 'move'
    if (mode === 'copy') {
      // Clone each moved rule; no new IDs needed since identity is by index.
      const result = copyReorderItems(prev, sanitized, rawTargetIndex, (r) => cloneSafeguardRule(r))
      if (!result) return
      const { next, copies, insertIdx } = result
      applySafeguardRulesChange(next)
      // New copies land at insertIdx in the resulting list.
      const newIndices = copies.map((_, ci) => insertIdx + ci)
      applySelection(newIndices)
      const lastIdx = newIndices[newIndices.length - 1] ?? null
      setSelectedRuleIdx(lastIdx)
      updateSelectionAnchor(lastIdx)
      return
    }
    const moveResult = moveReorderItems(prev, sanitized, rawTargetIndex)
    if (!moveResult) return
    const { next } = moveResult
    applySafeguardRulesChange(next)
    // Map selected rule objects to their new positions by identity.
    const movedObjects = new Set(sanitized.map((i) => prev[i]))
    const newIndices = next
      .map((r, i) => (movedObjects.has(r) ? i : -1))
      .filter((i) => i >= 0)
    applySelection(newIndices)
  }, [applySafeguardRulesChange, applySelection, safeguardRules, setSelectedRuleIdx, updateSelectionAnchor])

  // ── multi-edit draft field update ─────────────────────────────────────────

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
      // If the staged value matches the initial value with no patch, revert to clean.
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
  }, [])

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
  }, [])

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
  }, [])

  // ── multi-edit apply ──────────────────────────────────────────────────────

  const applyMultiEditDraft = useCallback(() => {
    if (!multiEditDraftState) return
    if (multiEditDraftState.selection.length < 2) return
    const dirtyKeys = getDirtySafeguardFieldKeys(multiEditDraftState.fields)
    if (dirtyKeys.length === 0) return
    // Selection keys are index strings; recover the numeric indices.
    const selectionIndices = new Set(multiEditDraftState.selection.map(Number))
    const fields = multiEditDraftState.fields
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
  }, [applySafeguardRulesChange, multiEditDraftState, resetAllMultiEditFields])

  // ── handle assembly ───────────────────────────────────────────────────────

  const multiEditHandle = useMemo<SafeguardMultiEditDraftHandle | null>(() => {
    if (!multiEditDraftState) return null
    return {
      state: multiEditDraftState,
      updateField: updateMultiEditField as SafeguardMultiEditDraftHandle['updateField'],
      resetField: resetMultiEditField,
      resetAll: resetAllMultiEditFields,
    }
  }, [multiEditDraftState, resetAllMultiEditFields, resetMultiEditField, updateMultiEditField])

  return {
    selectedRuleIndices,
    setSelectedRuleIndices: applySelection,
    multiselectActive,
    selectionAnchor,
    multiSelectedRules,
    multiEditDraftState,
    setMultiEditDraftState,
    multiEditHandle,
    applyMultiEditDraft,
    handleRuleSelect,
    handleRuleDelete,
    handleRuleDuplicate,
    handleRuleMoveUp,
    handleRuleMoveDown,
    handleRuleMoveTop,
    handleRuleMoveBottom,
    handleSelectAllRules,
    handleClearSelection,
    handleDeleteSelected,
    prepareDragSelection,
    handleRuleReorder,
    updateSelectionAnchor,
  }
}

// Re-export so callers only need one import.
export type { SafeguardMultiEditDraftHandle, SafeguardMultiEditDraftState, SafeguardFieldKey }
export { cloneSafeguardRuleForSelection }
