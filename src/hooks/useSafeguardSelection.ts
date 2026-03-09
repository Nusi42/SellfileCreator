/**
 * useSafeguardSelection.ts
 *
 * ID-based multi-select and multi-edit draft hook for SafeguardRule lists.
 * Mirrors the architecture of useRecipeSelection but uses string rule-IDs
 * rather than numeric indices because safeguards have stable UUIDs, which
 * makes selection mapping across reorders trivial.
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
import { cloneSafeguardRule, createSafeguardRuleId } from '../lib/safeguards'
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
  /** Currently active rule ID shown in the builder form. */
  selectedRuleId: string | null
  setSelectedRuleId: (id: string | null) => void
  /** Called with (prev, next) ID arrays before a selection change commits; used for auto-apply. */
  onWillChangeSelection?: ((previous: string[], next: string[]) => void) | undefined
  /** Scroll the chips panel to a specific rule after selection changes. */
  onSelectionScrollRequest?: ((ruleId: string) => void) | undefined
  /** Set of currently visible rule IDs (for filter-aware shift-select). */
  visibleRuleIdsRef: React.MutableRefObject<ReadonlySet<string> | null>
  /**
   * Loads a single rule into the builder draft when selection collapses to one item.
   * Mirrors useRecipeSelection's setBuilder param — call with cloneSafeguardRule(rule).
   */
  setSafeguardBuilder: React.Dispatch<React.SetStateAction<SafeguardRule>>
}

export type UseSafeguardSelectionResult = {
  selectedRuleIds: string[]
  setSelectedRuleIds: (next: string[], options?: { suppressWillChange?: boolean }) => void
  multiselectActive: boolean
  selectionAnchor: string | null
  multiSelectedRules: SafeguardRule[]
  multiEditDraftState: SafeguardMultiEditDraftState | null
  setMultiEditDraftState: Dispatch<SetStateAction<SafeguardMultiEditDraftState | null>>
  multiEditHandle: SafeguardMultiEditDraftHandle | null
  applyMultiEditDraft: () => void
  handleRuleSelect: (event: MouseEvent, ruleId: string) => void
  handleRuleDelete: (ruleId: string) => void
  handleRuleDuplicate: (ruleId: string) => void
  handleRuleMoveUp: (ruleId: string) => void
  handleRuleMoveDown: (ruleId: string) => void
  handleRuleMoveTop: (ruleId: string) => void
  handleRuleMoveBottom: (ruleId: string) => void
  handleSelectAllRules: () => void
  handleClearSelection: () => void
  /** Delete all currently-selected rules (keyboard shortcut target — mirrors handleRuleDelete for multi-select). */
  handleDeleteSelected: () => void
  /**
   * Called by useChipListDnd's onPrepareSelection when a drag gesture starts.
   * Returns the sorted index array to drag: the full selection when the dragged
   * chip is already selected, or collapses selection to just that chip.
   * Mirrors useRecipeSelection.prepareDragSelection.
   */
  prepareDragSelection: (idx: number) => number[]
  /**
   * Full multi-index reorder handler for useChipListDnd's onReorder.
   * Handles contiguous and non-contiguous multi-rule drags as well as copy mode.
   * Mirrors useRecipeSelection.handleRecipeReorder.
   */
  handleRuleReorder: (movingIndices: number[], targetIndex: number, options?: { mode?: 'move' | 'copy' }) => void
  updateSelectionAnchor: Dispatch<SetStateAction<string | null>>
}

type ApplySelectionOptions = { suppressWillChange?: boolean }

// ── hook ──────────────────────────────────────────────────────────────────────

/**
 * useSafeguardSelection
 *
 * Centralizes safeguard rule selection and multi-edit draft state so App.tsx
 * only wires the orchestration. The hook keeps the ID-based selection and
 * anchor in sync with the single-select builder ID, and exposes all handlers
 * consumed by SafeguardChipsPanel and SafeguardBuilderPanel.
 */
export function useSafeguardSelection({
  safeguardRules,
  applySafeguardRulesChange,
  selectedRuleId,
  setSelectedRuleId,
  onWillChangeSelection,
  onSelectionScrollRequest,
  visibleRuleIdsRef,
  setSafeguardBuilder,
}: UseSafeguardSelectionParams): UseSafeguardSelectionResult {
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([])
  const selectionAnchorRef = useRef<string | null>(null)
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null)
  const selectedIdsRef = useRef<string[]>([])
  const multiselectActive = selectedRuleIds.length > 1

  // Derive the multi-selected rule objects from the current ID list.
  const multiSelectedRules = useMemo(() => {
    if (selectedRuleIds.length <= 1) return []
    const idSet = new Set(selectedRuleIds)
    return safeguardRules.filter((r) => idSet.has(r.id))
  }, [safeguardRules, selectedRuleIds])

  const [multiEditDraftState, setMultiEditDraftState] = useState<SafeguardMultiEditDraftState | null>(null)

  // Keep the ref in sync so closures always read the latest selection.
  useEffect(() => {
    selectedIdsRef.current = selectedRuleIds
  }, [selectedRuleIds])

  // Rebuild the draft during render whenever the multi-selection or the rules change.
  // Uses identity check on the memoized array to detect actual changes.
  // Track previous value in state so the comparison doesn't trigger react-hooks/refs.
  const [prevMultiSelectedRules, setPrevMultiSelectedRules] = useState(multiSelectedRules)
  if (multiSelectedRules !== prevMultiSelectedRules) {
    setPrevMultiSelectedRules(multiSelectedRules)
    if (multiSelectedRules.length < 2) {
      if (multiEditDraftState !== null) setMultiEditDraftState(null)
    } else {
      const base = createSafeguardMultiEditDraft(multiSelectedRules, multiSelectedRules.map((r) => r.id))
      setMultiEditDraftState((prev) => syncSafeguardMultiEditDraft(prev, base))
    }
  }

  // ── selection management ──────────────────────────────────────────────────

  const updateSelectionAnchor = useCallback<Dispatch<SetStateAction<string | null>>>((value) => {
    const next = typeof value === 'function'
      ? (value as (prev: string | null) => string | null)(selectionAnchorRef.current)
      : (value ?? null)
    if (selectionAnchorRef.current === next) return
    selectionAnchorRef.current = next
    setSelectionAnchor(next)
  }, [])

  const applySelection = useCallback((nextIds: string[], options?: ApplySelectionOptions) => {
    const normalized = nextIds.slice()
    const prevIds = selectedIdsRef.current
    // Bail when nothing changes so side-effects don't re-fire.
    if (arraysEqual(prevIds, normalized)) return
    if (!options?.suppressWillChange && onWillChangeSelection) {
      onWillChangeSelection(prevIds.slice(), normalized.slice())
    }
    selectedIdsRef.current = normalized
    setSelectedRuleIds(normalized)
  }, [onWillChangeSelection])

  // ── click handler ─────────────────────────────────────────────────────────

  const handleRuleSelect = useCallback((event: MouseEvent, ruleId: string) => {
    const rulesSnapshot = safeguardRules

    // Compute what the next selection should be.
    const computeNext = (prev: string[]): string[] => {
      if (event.shiftKey && selectionAnchorRef.current !== null) {
        // Build a range between anchor and clicked rule, respecting the visible set.
        const anchorId = selectionAnchorRef.current
        const anchorIdx = rulesSnapshot.findIndex((r) => r.id === anchorId)
        const targetIdx = rulesSnapshot.findIndex((r) => r.id === ruleId)
        if (anchorIdx === -1 || targetIdx === -1) return [ruleId]
        const [lo, hi] = anchorIdx < targetIdx
          ? [anchorIdx, targetIdx]
          : [targetIdx, anchorIdx]
        const visibleSet = visibleRuleIdsRef?.current ?? null
        const span: string[] = []
        for (let i = lo; i <= hi; i += 1) {
          const r = rulesSnapshot[i]
          if (!r) continue
          if (visibleSet && !visibleSet.has(r.id)) continue
          span.push(r.id)
        }
        return span.length > 0 ? span : [ruleId]
      }
      if (event.ctrlKey || event.metaKey) {
        const set = new Set(prev)
        if (set.has(ruleId)) {
          set.delete(ruleId)
        } else {
          set.add(ruleId)
        }
        // Preserve ordering by filtering the live list.
        return rulesSnapshot
          .map((r) => r.id)
          .filter((id) => set.has(id))
      }
      return [ruleId]
    }

    const prev = selectedRuleIds
    const next = computeNext(prev)
    const selectionChanged = !arraysEqual(prev, next)
    if (selectionChanged) applySelection(next)
    const final = selectionChanged ? next : prev
    const last = final.length > 0 ? final[final.length - 1]! : null

    if (selectionAnchorRef.current !== last) updateSelectionAnchor(last ?? null)
    if (selectedRuleId !== last) setSelectedRuleId(last)
    // When selection settles on exactly one rule, load it into the builder draft.
    // Mirrors useRecipeSelection's setBuilder(only) call — prevents stale builder state.
    if (final.length === 1) {
      const only = safeguardRules.find((r) => r.id === final[0])
      if (only) setSafeguardBuilder(cloneSafeguardRule(only))
    }
    // Scroll to the active rule when it changes.
    if (selectionChanged && last) onSelectionScrollRequest?.(last)
  }, [
    applySelection,
    onSelectionScrollRequest,
    safeguardRules,
    selectedRuleId,
    selectedRuleIds,
    setSelectedRuleId,
    updateSelectionAnchor,
    setSafeguardBuilder,
    visibleRuleIdsRef,
  ])

  // ── mutation handlers ─────────────────────────────────────────────────────

  const handleRuleDelete = useCallback((ruleId: string) => {
    // When multiple rules are selected and the clicked rule is in the set,
    // delete all selected rules at once.
    const targets = selectedRuleIds.length > 1 && selectedRuleIds.includes(ruleId)
      ? selectedRuleIds.slice()
      : [ruleId]
    const targetSet = new Set(targets)
    applySafeguardRulesChange((prev) => {
      const next = prev.filter((r) => !targetSet.has(r.id))
      return next
    })
    // Clear the selection if the active rule was deleted.
    if (targetSet.has(selectedRuleId ?? '')) {
      applySelection([])
      setSelectedRuleId(null)
      updateSelectionAnchor(null)
    }
  }, [applySafeguardRulesChange, applySelection, selectedRuleId, selectedRuleIds, setSelectedRuleId, updateSelectionAnchor])

  const handleRuleDuplicate = useCallback((ruleId: string) => {
    // Duplicate all selected rules if the clicked one is part of the selection.
    const selected = selectedRuleIds.length > 1 && selectedRuleIds.includes(ruleId)
      ? selectedRuleIds
      : [ruleId]
    const selectedSet = new Set(selected)
    const newIds: string[] = []
    // Capture the single copy when duplicating exactly one rule so we can load it into the builder.
    let singleCopy: SafeguardRule | null = null
    applySafeguardRulesChange((prev) => {
      // Find the last selected index to determine insertion point.
      const lastIdx = prev.reduce((max, r, i) => (selectedSet.has(r.id) ? i : max), -1)
      if (lastIdx === -1) return prev
      const copies = selected
        .map((id) => prev.find((r) => r.id === id))
        .filter((r): r is SafeguardRule => Boolean(r))
        .map((r) => {
          const clone = cloneSafeguardRule(r)
          const newId = createSafeguardRuleId()
          newIds.push(newId)
          return { ...clone, id: newId }
        })
      if (copies.length === 0) return prev
      // Capture the copy content so the builder can load it after state commits.
      if (copies.length === 1) singleCopy = copies[0]!
      const next = [
        ...prev.slice(0, lastIdx + 1),
        ...copies,
        ...prev.slice(lastIdx + 1),
      ]
      return next
    })
    // Select the duplicates after state commits (next tick).
    setTimeout(() => {
      if (newIds.length === 0) return
      applySelection(newIds)
      const lastNew = newIds[newIds.length - 1]!
      setSelectedRuleId(lastNew)
      updateSelectionAnchor(lastNew)
      // Load the single copy into the builder so the user sees the duplicate immediately.
      if (newIds.length === 1 && singleCopy) setSafeguardBuilder(cloneSafeguardRule(singleCopy))
      onSelectionScrollRequest?.(lastNew)
    }, 0)
  }, [applySafeguardRulesChange, applySelection, onSelectionScrollRequest, selectedRuleIds, setSelectedRuleId, updateSelectionAnchor, setSafeguardBuilder])

  const handleRuleMoveUp = useCallback((ruleId: string) => {
    const selected = selectedRuleIds.length > 1 && selectedRuleIds.includes(ruleId)
      ? new Set(selectedRuleIds)
      : new Set([ruleId])
    applySafeguardRulesChange((prev) => {
      const arr = [...prev]
      let changed = false
      for (let i = 1; i < arr.length; i += 1) {
        if (!selected.has(arr[i]!.id)) continue
        if (selected.has(arr[i - 1]!.id)) continue
        changed = true
        const tmp = arr[i - 1]!; arr[i - 1] = arr[i]!; arr[i] = tmp
      }
      return changed ? arr : prev
    })
  }, [applySafeguardRulesChange, selectedRuleIds])

  const handleRuleMoveDown = useCallback((ruleId: string) => {
    const selected = selectedRuleIds.length > 1 && selectedRuleIds.includes(ruleId)
      ? new Set(selectedRuleIds)
      : new Set([ruleId])
    applySafeguardRulesChange((prev) => {
      const arr = [...prev]
      let changed = false
      for (let i = arr.length - 2; i >= 0; i -= 1) {
        if (!selected.has(arr[i]!.id)) continue
        if (selected.has(arr[i + 1]!.id)) continue
        changed = true
        const tmp = arr[i + 1]!; arr[i + 1] = arr[i]!; arr[i] = tmp
      }
      return changed ? arr : prev
    })
  }, [applySafeguardRulesChange, selectedRuleIds])

  const handleRuleMoveTop = useCallback((ruleId: string) => {
    const selected = selectedRuleIds.length > 1 && selectedRuleIds.includes(ruleId)
      ? new Set(selectedRuleIds)
      : new Set([ruleId])
    applySafeguardRulesChange((prev) => {
      const block = prev.filter((r) => selected.has(r.id))
      const rest = prev.filter((r) => !selected.has(r.id))
      if (block.length === 0) return prev
      const next = [...block, ...rest]
      // Skip if already at top.
      if (prev.every((r, i) => r.id === next[i]?.id)) return prev
      return next
    })
  }, [applySafeguardRulesChange, selectedRuleIds])

  const handleRuleMoveBottom = useCallback((ruleId: string) => {
    const selected = selectedRuleIds.length > 1 && selectedRuleIds.includes(ruleId)
      ? new Set(selectedRuleIds)
      : new Set([ruleId])
    applySafeguardRulesChange((prev) => {
      const block = prev.filter((r) => selected.has(r.id))
      const rest = prev.filter((r) => !selected.has(r.id))
      if (block.length === 0) return prev
      const next = [...rest, ...block]
      if (prev.every((r, i) => r.id === next[i]?.id)) return prev
      return next
    })
  }, [applySafeguardRulesChange, selectedRuleIds])

  const handleSelectAllRules = useCallback(() => {
    const visibleSet = visibleRuleIdsRef?.current ?? null
    const all = visibleSet
      ? safeguardRules.filter((r) => visibleSet.has(r.id)).map((r) => r.id)
      : safeguardRules.map((r) => r.id)
    applySelection(all)
    const keep = selectedRuleId && all.includes(selectedRuleId) ? selectedRuleId : (all[0] ?? null)
    setSelectedRuleId(keep)
    updateSelectionAnchor(keep)
  }, [applySelection, safeguardRules, selectedRuleId, setSelectedRuleId, updateSelectionAnchor, visibleRuleIdsRef])

  const handleClearSelection = useCallback(() => {
    applySelection([])
    setSelectedRuleId(null)
    updateSelectionAnchor(null)
  }, [applySelection, setSelectedRuleId, updateSelectionAnchor])

  // Deletes all currently-selected rules. Triggered by the Delete/Backspace keyboard shortcut
  // in SafeguardChipsPanel — delegates to handleRuleDelete which handles both single and
  // multi-rule deletion in one place (SSOT for the delete-selected logic).
  const handleDeleteSelected = useCallback(() => {
    if (selectedRuleIds.length === 0) return
    // Re-use the first selected id as the trigger — handleRuleDelete detects the multi-select
    // set and deletes all selected rules when the triggered id is part of the selection.
    handleRuleDelete(selectedRuleIds[0]!)
  }, [handleRuleDelete, selectedRuleIds])

  // ── drag-and-drop reorder ─────────────────────────────────────────────────

  // Maps selected IDs to sorted ascending indices in the current rules array.
  const selectedIndicesToDrag = useCallback((): number[] => {
    const idSet = new Set(selectedRuleIds)
    return safeguardRules
      .map((r, i) => (idSet.has(r.id) ? i : -1))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)
  }, [safeguardRules, selectedRuleIds])

  // Called by useChipListDnd.onPrepareSelection at drag-start.
  // Returns the full sorted index set to drag (multi if already selected) or
  // collapses selection to the single dragged item. Mirrors prepareDragSelection
  // in useRecipeSelection but operates on rule IDs.
  const prepareDragSelection = useCallback((idx: number): number[] => {
    return resolveDragSelectionIndices(
      idx,
      safeguardRules.length,
      selectedIndicesToDrag(),
      (singleIdx) => {
        // Collapse: select only the dragged rule.
        const rule = safeguardRules[singleIdx]
        if (!rule) return
        applySelection([rule.id])
        setSelectedRuleId(rule.id)
        updateSelectionAnchor(rule.id)
        setSafeguardBuilder(cloneSafeguardRule(rule))
      },
    )
  }, [applySelection, safeguardRules, selectedIndicesToDrag, setSelectedRuleId, updateSelectionAnchor, setSafeguardBuilder])

  // Full multi-index reorder handler. Delegates array manipulation to the shared
  // chipListReorder utilities — same algorithm as useRecipeSelection.handleRecipeReorder.
  const handleRuleReorder = useCallback((movingIndices: number[], rawTargetIndex: number, options?: { mode?: 'move' | 'copy' }) => {
    if (!Array.isArray(movingIndices) || movingIndices.length === 0) return
    const prev = safeguardRules
    const sanitized = sanitizeDragIndices(movingIndices, prev.length)
    if (sanitized.length === 0) return
    const mode = options?.mode === 'copy' ? 'copy' : 'move'
    if (mode === 'copy') {
      // Clone each moved rule and assign a fresh ID so identities stay distinct.
      const result = copyReorderItems(prev, sanitized, rawTargetIndex, (r) => ({
        ...cloneSafeguardRule(r),
        id: createSafeguardRuleId(),
      }))
      if (!result) return
      const { next, copies } = result
      applySafeguardRulesChange(next)
      // Select the newly-created copies.
      const newIds = copies.map((r) => r.id)
      applySelection(newIds)
      const lastId = newIds[newIds.length - 1] ?? null
      setSelectedRuleId(lastId)
      updateSelectionAnchor(lastId)
      return
    }
    const moveResult = moveReorderItems(prev, sanitized, rawTargetIndex)
    if (!moveResult) return
    const { next } = moveResult
    applySafeguardRulesChange(next)
    // IDs are stable — selection stays the same set of IDs after a move.
    // No selection state update needed; the existing selectedRuleIds remain valid.
    // Trigger a re-render by calling applySelection with same IDs only if needed.
    const movedIds = sanitized.map((i) => prev[i]!.id)
    applySelection(movedIds)
  }, [applySafeguardRulesChange, applySelection, safeguardRules, setSelectedRuleId, updateSelectionAnchor])

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
    const selectionSet = new Set(multiEditDraftState.selection)
    const fields = multiEditDraftState.fields
    applySafeguardRulesChange((prev) => {
      let changed = false
      const next = prev.map((rule) => {
        if (!selectionSet.has(rule.id)) return rule
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
    selectedRuleIds,
    setSelectedRuleIds: applySelection,
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
