/**
 * useItemListManager.ts
 *
 * Generic hook that unifies the ~90% shared logic between useRecipeSelection
 * and useSafeguardSelection. Manages selection state, multi-edit draft
 * lifecycle, click interaction (shift/ctrl/meta), move / duplicate / delete /
 * reorder operations, and drag-selection preparation.
 *
 * Type params:
 *   TItem  — the domain item type (BuilderRecipe, SafeguardRule, …)
 *   TDraft — the multi-edit draft state type produced by createDraft/syncDraft
 *
 * Callers that need type-specific behaviour (history descriptors, hover state,
 * typed multiEditHandle / applyMultiEditDraft) build thin wrappers on top.
 */
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { arraysEqual } from '../lib/array'
import {
  sanitizeDragIndices,
  moveReorderItems,
  copyReorderItems,
  resolveDragSelectionIndices,
} from '../lib/chipListReorder'

// ── mutation op ───────────────────────────────────────────────────────────────

/**
 * Describes a successful structural mutation so wrapper hooks can emit
 * history descriptors via their describeNextChange callback.
 */
export type ItemMutationOp<TItem> =
  | {
      kind: 'move'
      direction: 'up' | 'down' | 'top' | 'bottom'
      prev: readonly TItem[]
      next: readonly TItem[]
      newIndices: readonly number[]
    }
  | {
      kind: 'duplicate'
      prev: readonly TItem[]
      copies: readonly TItem[]
      next: readonly TItem[]
      insertIdx: number
      newIndices: readonly number[]
    }
  | {
      kind: 'reorder-move'
      prev: readonly TItem[]
      next: readonly TItem[]
      newIndices: readonly number[]
      /** Direction label produced by moveReorderItems — same union as move. */
      direction: 'up' | 'down' | 'top' | 'bottom'
    }
  | {
      kind: 'reorder-copy'
      prev: readonly TItem[]
      copies: readonly TItem[]
      next: readonly TItem[]
      insertIdx: number
      newIndices: readonly number[]
    }

// ── param / result types ──────────────────────────────────────────────────────

export type UseItemListManagerParams<TItem, TDraft> = {
  /** The live item list. */
  items: TItem[]
  /** Apply a mutation to the item list (via setState or a wrapped transition). */
  applyItemsChange: (updater: SetStateAction<TItem[]>) => void
  /** Currently active item index shown in the builder form (null = none). */
  selectedIdx: number | null
  /** Update the active item index (propagates to the builder form). */
  setSelectedIdx: (idx: number | null) => void
  /** Loads a single item into the builder draft when selection collapses to one. */
  setBuilder: Dispatch<SetStateAction<TItem>>
  /** Deep-clones an item (for duplicate and copy-mode drag-reorder). */
  cloneItem: (item: TItem) => TItem
  /** Called with (prev, next) index arrays before a selection change commits. */
  onWillChangeSelection?: ((prev: number[], next: number[]) => void) | undefined
  /** Scroll the chips panel to a specific item index after a selection interaction. */
  onSelectionScrollRequest?: ((idx: number) => void) | undefined
  /** Set of currently visible item indices (for filter-aware shift-select). */
  visibleIndicesRef: MutableRefObject<ReadonlySet<number> | null>
  /** Factory: create a fresh multi-edit draft for the given item subset. */
  createDraft?: (items: TItem[], indices: number[]) => TDraft
  /** Sync an existing draft against a newly-computed base (preserves user edits). */
  syncDraft?: (prev: TDraft | null, base: TDraft) => TDraft
  /**
   * Called when a single-item delete is requested.
   * When absent the hook performs a direct in-place filter.
   */
  requestDeleteSingle?: (idx: number) => void
  /**
   * Called when a multi-item delete is requested.
   * When absent the hook performs a direct in-place filter.
   */
  requestDeleteMulti?: (indices: number[]) => void
  /**
   * Wrap a mutation fn to suppress history snapshot capture.
   * Recipe: useSfcHistory's suppressSelectionDraft. Absent for safeguards.
   */
  suppressSelectionDraft?: <T>(fn: () => T) => T
  /**
   * Called with a mutation op (or null for noop) so the wrapper can emit a
   * history descriptor via its own describeNextChange. Absent for safeguards.
   */
  onDescribeNextChange?: (op: ItemMutationOp<TItem> | null) => void
  /**
   * When true, scroll fires only when the selection changes AND collapses to
   * exactly one item (recipe behavior). Default false: scroll fires on every
   * selection click (safeguard behavior).
   */
  scrollOnlyOnSingleSelectionChange?: boolean
}

export type UseItemListManagerResult<TItem, TDraft> = {
  /** Currently selected index array (multi-select aware). */
  selectedIndices: number[]
  /** Programmatically update the selection (wraps internal applySelection). */
  setSelectedIndices: (next: number[], options?: { suppressWillChange?: boolean }) => void
  /** True when two or more items are selected simultaneously. */
  multiselectActive: boolean
  /** Last item index that anchors shift-click ranges. */
  selectionAnchor: number | null
  /** Subset of items corresponding to the multi-selection (empty for ≤1 item). */
  multiSelectedItems: TItem[]
  /** Multi-edit draft for the current multi-selection; null when inactive. */
  multiEditDraftState: TDraft | null
  /** Direct setter for the draft; wrapper hooks use this to apply edits. */
  setMultiEditDraftState: Dispatch<SetStateAction<TDraft | null>>
  /** Click handler with shift/ctrl/meta multi-select support. */
  handleItemSelect: (event: MouseEvent, idx: number) => void
  handleItemDelete: (idx: number) => void
  handleItemDuplicate: (idx: number) => void
  handleItemMoveUp: (idx: number) => void
  handleItemMoveDown: (idx: number) => void
  handleItemMoveTop: (idx: number) => void
  handleItemMoveBottom: (idx: number) => void
  handleSelectAll: () => void
  handleClearSelection: () => void
  /** Delete all currently-selected items (keyboard shortcut target). */
  handleDeleteSelected: () => void
  /**
   * Called by useChipListDnd.onPrepareSelection at drag-start.
   * Returns the sorted selection array to drag, collapsing to just the
   * dragged chip when it is not in the current selection.
   */
  prepareDragSelection: (idx: number) => number[]
  /**
   * Full multi-index reorder handler for useChipListDnd.onReorder.
   * Handles contiguous and non-contiguous multi-item drags plus copy mode.
   */
  handleReorder: (movingIndices: number[], targetIndex: number, options?: { mode?: 'move' | 'copy' }) => void
  updateSelectionAnchor: Dispatch<SetStateAction<number | null>>
}

// ── hook ──────────────────────────────────────────────────────────────────────

/**
 * Generic implementation shared by recipe and safeguard selection hooks.
 * See UseItemListManagerParams for behavioral knobs.
 */
export function useItemListManager<TItem, TDraft>({
  items,
  applyItemsChange,
  selectedIdx,
  setSelectedIdx,
  setBuilder,
  cloneItem,
  onWillChangeSelection,
  onSelectionScrollRequest,
  visibleIndicesRef,
  createDraft,
  syncDraft,
  requestDeleteSingle,
  requestDeleteMulti,
  suppressSelectionDraft,
  onDescribeNextChange,
  scrollOnlyOnSingleSelectionChange,
}: UseItemListManagerParams<TItem, TDraft>): UseItemListManagerResult<TItem, TDraft> {
  // Named setSelectedIndices per React convention; callers use setSelectedIndices: applySelection from the result.
  const [selectedIndices, setSelectedIndices] = useState<number[]>([])
  const selectionAnchorRef = useRef<number | null>(null)
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null)
  // Ref holds the latest selection so mutation-handler closures read current
  // values without stale captures (updated synchronously inside applySelection).
  const selectedIndicesRef = useRef<number[]>([])
  const multiselectActive = selectedIndices.length > 1

  // ── derived selection ─────────────────────────────────────────────────────

  // Validated multi-selection indices (bounds-checked against the items list).
  const multiSelectedIndices = useMemo(() => {
    if (selectedIndices.length <= 1) return [] as number[]
    return selectedIndices.filter((i) => i >= 0 && i < items.length && items[i] !== undefined)
  }, [items, selectedIndices])

  // Domain objects for the current multi-selection.
  const multiSelectedItems = useMemo(() => {
    if (multiSelectedIndices.length === 0) return [] as TItem[]
    return multiSelectedIndices.map((i) => items[i]).filter((x): x is TItem => x !== undefined)
  }, [items, multiSelectedIndices])

  const [multiEditDraftState, setMultiEditDraftState] = useState<TDraft | null>(null)

  // ── multi-edit draft sync (render-phase) ──────────────────────────────────
  // Rebuild the draft synchronously during render whenever the multi-selection
  // or the underlying items change. Render-phase setState is the React-approved
  // pattern for derived state that must stay in sync with the same render cycle.

  // Track previous values so we can compare by reference and bail early.
  const [prevMultiSelectedItems, setPrevMultiSelectedItems] = useState(multiSelectedItems)
  const [prevMultiSelectedIndices, setPrevMultiSelectedIndices] = useState(multiSelectedIndices)
  if (
    multiSelectedItems !== prevMultiSelectedItems
    || multiSelectedIndices !== prevMultiSelectedIndices
  ) {
    setPrevMultiSelectedItems(multiSelectedItems)
    setPrevMultiSelectedIndices(multiSelectedIndices)
    if (multiSelectedItems.length < 2) {
      // Multi-selection collapsed — clear the draft.
      if (multiEditDraftState !== null) setMultiEditDraftState(null)
    } else if (createDraft && syncDraft) {
      // Recompute the base draft and sync it against any in-progress edits.
      const base = createDraft(multiSelectedItems, multiSelectedIndices)
      setMultiEditDraftState((prev) => syncDraft(prev, base))
    }
  }

  // ── selection management ──────────────────────────────────────────────────

  const updateSelectionAnchor = useCallback<Dispatch<SetStateAction<number | null>>>((value) => {
    // Read from the ref so this callback never goes stale on re-renders.
    const next = typeof value === 'function'
      ? (value as (prev: number | null) => number | null)(selectionAnchorRef.current)
      : (value ?? null)
    if (selectionAnchorRef.current === next) return
    selectionAnchorRef.current = next
    setSelectionAnchor(next)
  }, [])

  const applySelection = useCallback((nextIndices: number[], options?: { suppressWillChange?: boolean }) => {
    const normalized = nextIndices.slice()
    const prevIndices = selectedIndicesRef.current
    // Bail when nothing changes to avoid spurious side-effects.
    if (arraysEqual(prevIndices, normalized)) return
    if (!options?.suppressWillChange && onWillChangeSelection) {
      onWillChangeSelection(prevIndices.slice(), normalized.slice())
    }
    // Update the ref synchronously so callbacks in the same event see the
    // current selection before the next render.
    selectedIndicesRef.current = normalized
    setSelectedIndices(normalized)
  }, [onWillChangeSelection])

  // Reorders preserve selected items by identity — suppress auto-apply.
  const syncSelectionAfterReorder = useCallback((nextIndices: number[]) => {
    applySelection(nextIndices, { suppressWillChange: true })
    const last = nextIndices.length > 0 ? nextIndices[nextIndices.length - 1]! : null
    setSelectedIdx(last)
    updateSelectionAnchor(last)
  }, [applySelection, setSelectedIdx, updateSelectionAnchor])

  // ── identity-preserving selection mapping ─────────────────────────────────

  // Maps the selection from a previous item array to a next item array by
  // object identity. Keeps selected items highlighted across reorders.
  const mapSelectionByIdentity = useCallback(
    (prev: TItem[], next: TItem[], selection: number[]): number[] => {
      if (!Array.isArray(selection) || selection.length === 0) return []
      const selectedSet = new Set<TItem>()
      for (const i of selection) {
        const item = prev[i]
        if (item !== undefined) selectedSet.add(item)
      }
      if (selectedSet.size === 0) return []
      const result: number[] = []
      next.forEach((item, i) => { if (selectedSet.has(item)) result.push(i) })
      return result
    },
    [],
  )

  // ── suppression helper ────────────────────────────────────────────────────

  // Runs a mutation fn wrapped in suppressSelectionDraft when available,
  // or calls it directly. Prevents history snapshot capture for reorders.
  const withSuppression = useCallback((fn: () => void): void => {
    if (suppressSelectionDraft) { suppressSelectionDraft(fn); return }
    fn()
  }, [suppressSelectionDraft])

  // ── click handler ─────────────────────────────────────────────────────────

  const handleItemSelect = useCallback((event: MouseEvent, idx: number) => {
    const item = items[idx]
    if (item === undefined) return

    const computeNext = (prev: number[]): number[] => {
      if (event.shiftKey && selectionAnchorRef.current !== null) {
        // Build a range between anchor and click, honouring the visible-index set.
        const anchor = selectionAnchorRef.current
        const [lo, hi] = anchor < idx ? [anchor, idx] : [idx, anchor]
        const visibleSet = visibleIndicesRef?.current ?? null
        const span: number[] = []
        for (let i = lo; i <= hi; i += 1) {
          if (i >= items.length) continue
          if (visibleSet && !visibleSet.has(i)) continue
          span.push(i)
        }
        return span.length > 0 ? span : [idx]
      }
      if (event.ctrlKey || event.metaKey) {
        // Toggle the clicked index while preserving the rest of the selection.
        const set = new Set(prev)
        if (set.has(idx)) { set.delete(idx) } else { set.add(idx) }
        return Array.from(set).sort((a, b) => a - b)
      }
      // Plain click: select only this chip — or unselect it when it is already the
      // sole selection (mirrors the gear inspector's left-click deselect toggle).
      if (prev.length === 1 && prev[0] === idx) return []
      return [idx]
    }

    // Read from the ref so rapid ctrl/shift clicks always see the committed
    // selection even before React has re-rendered with the new state value.
    const prev = selectedIndicesRef.current
    const next = computeNext(prev)
    const selectionChanged = !arraysEqual(prev, next)
    if (selectionChanged) applySelection(next)
    const final = selectionChanged ? next : prev
    // The clicked chip stays the active/anchor/scroll target while it remains selected;
    // shift-ranges are stored ascending, so using the array tail here used to jump the
    // list to the range MAX (scrolling down on an upward shift-click). Fall back to the
    // last remaining index only when the click removed the chip (ctrl/plain toggle off).
    const active = final.includes(idx)
      ? idx
      : (final.length > 0 ? final[final.length - 1]! : null)

    if (selectionAnchorRef.current !== active) updateSelectionAnchor(active)
    if (selectedIdx !== active) setSelectedIdx(active)
    // Load the single item into the builder when the selection collapses to one.
    if (final.length === 1) {
      const only = items[final[0]!]
      if (only !== undefined) setBuilder(cloneItem(only))
    }
    // Scroll: always (safeguard default) or only on single-selection-change (recipe).
    if (active !== null) {
      const shouldScroll = scrollOnlyOnSingleSelectionChange
        ? (selectionChanged && final.length === 1)
        : true
      if (shouldScroll) onSelectionScrollRequest?.(active)
    }
  }, [
    applySelection,
    cloneItem,
    items,
    onSelectionScrollRequest,
    scrollOnlyOnSingleSelectionChange,
    selectedIdx,
    setBuilder,
    setSelectedIdx,
    updateSelectionAnchor,
    visibleIndicesRef,
  ])

  // ── delete ────────────────────────────────────────────────────────────────

  const handleItemDelete = useCallback((idx: number) => {
    // Expand to the full selection when the clicked item is part of it.
    const targets = selectedIndices.length > 1 && selectedIndices.includes(idx)
      ? selectedIndices.slice().sort((a, b) => a - b)
      : [idx]
    if (targets.length > 1 && requestDeleteMulti) {
      // Delegate to the history-tracked multi-delete callback (recipe path).
      requestDeleteMulti(targets)
    } else if (targets.length === 1 && requestDeleteSingle) {
      // Delegate to the history-tracked single-delete callback (recipe path).
      requestDeleteSingle(targets[0]!)
    } else {
      // Direct in-place filter (safeguard path — no separate delete callback).
      const targetSet = new Set(targets)
      applyItemsChange((prev) => prev.filter((_, i) => !targetSet.has(i)))
      if (selectedIdx !== null && targetSet.has(selectedIdx)) {
        applySelection([])
        setSelectedIdx(null)
        updateSelectionAnchor(null)
      }
    }
  }, [
    applyItemsChange,
    applySelection,
    requestDeleteMulti,
    requestDeleteSingle,
    selectedIdx,
    selectedIndices,
    setSelectedIdx,
    updateSelectionAnchor,
  ])

  // Deletes all currently-selected items (keyboard shortcut target).
  const handleDeleteSelected = useCallback(() => {
    if (selectedIndices.length === 0) return
    // handleItemDelete detects the full multi-select set internally.
    handleItemDelete(selectedIndices[0]!)
  }, [handleItemDelete, selectedIndices])

  // ── duplicate ─────────────────────────────────────────────────────────────

  const handleItemDuplicate = useCallback((idx: number) => {
    const selected = selectedIndices.length > 1 && selectedIndices.includes(idx)
      ? selectedIndices.slice().sort((a, b) => a - b)
      : [idx]
    withSuppression(() => {
      const prev = items
      // Clone each selected item; recipe uses cloneBuilderRecipe, safeguard uses cloneSafeguardRule.
      const copies = selected
        .map((i) => prev[i])
        .filter((x): x is TItem => x !== undefined)
        .map((x) => cloneItem(x))
      if (copies.length === 0) { onDescribeNextChange?.(null); return }
      // Insert the copies immediately after the last selected index.
      const insertAfter = Math.max(...selected)
      const insertIdx = Math.min(prev.length, insertAfter + 1)
      const next = [...prev.slice(0, insertIdx), ...copies, ...prev.slice(insertIdx)]
      const newIndices = copies.map((_, ci) => insertIdx + ci)
      onDescribeNextChange?.({ kind: 'duplicate', prev, copies, next, insertIdx, newIndices })
      applyItemsChange(next)
      applySelection(newIndices)
      const last = newIndices[newIndices.length - 1]!
      setSelectedIdx(last)
      updateSelectionAnchor(last)
      // Load the duplicated item into the builder so the user sees it immediately.
      if (newIndices.length === 1 && copies[0] !== undefined) {
        setBuilder(cloneItem(copies[0]))
      }
      onSelectionScrollRequest?.(last)
    })
  }, [
    applyItemsChange,
    applySelection,
    cloneItem,
    items,
    onDescribeNextChange,
    onSelectionScrollRequest,
    selectedIndices,
    setBuilder,
    setSelectedIdx,
    updateSelectionAnchor,
    withSuppression,
  ])

  // ── move up ───────────────────────────────────────────────────────────────

  const handleItemMoveUp = useCallback((idx: number) => {
    const selected = selectedIndices.length > 1 && selectedIndices.includes(idx)
      ? selectedIndices.slice().sort((a, b) => a - b)
      : [idx]
    withSuppression(() => {
      const prev = items
      // First-pass on the snapshot to compute the new selection and emit the
      // descriptor; second-pass inside the functional updater commits safely.
      const arr = [...prev]
      let changed = false
      // Ascending iteration: earlier indices bubble up first, so a contiguous
      // block moves as a unit rather than cascading incorrectly.
      for (const i of selected) {
        if (i <= 0) continue
        const tmp = arr[i - 1]!; arr[i - 1] = arr[i]!; arr[i] = tmp
        changed = true
      }
      if (!changed) { onDescribeNextChange?.(null); return }
      const newIndices = mapSelectionByIdentity(prev, arr, selected)
      onDescribeNextChange?.({ kind: 'move', direction: 'up', prev, next: arr, newIndices })
      // Functional updater interleaves safely with concurrent state updates
      // (e.g. auto-apply triggered by suppressSelectionDraft side-effects).
      applyItemsChange((current) => {
        const reordered = [...current]
        for (const i of selected) {
          if (i <= 0) continue
          const tmp = reordered[i - 1]!; reordered[i - 1] = reordered[i]!; reordered[i] = tmp
        }
        return reordered
      })
      syncSelectionAfterReorder(newIndices)
    })
  }, [
    applyItemsChange,
    items,
    mapSelectionByIdentity,
    onDescribeNextChange,
    selectedIndices,
    syncSelectionAfterReorder,
    withSuppression,
  ])

  // ── move down ─────────────────────────────────────────────────────────────

  const handleItemMoveDown = useCallback((idx: number) => {
    const selected = selectedIndices.length > 1 && selectedIndices.includes(idx)
      ? selectedIndices.slice().sort((a, b) => a - b)
      : [idx]
    withSuppression(() => {
      const prev = items
      const arr = [...prev]
      let changed = false
      // Descending iteration: later indices sink first so contiguous blocks move together.
      for (let k = selected.length - 1; k >= 0; k -= 1) {
        const i = selected[k]!
        if (i >= arr.length - 1) continue
        const tmp = arr[i + 1]!; arr[i + 1] = arr[i]!; arr[i] = tmp
        changed = true
      }
      if (!changed) { onDescribeNextChange?.(null); return }
      const newIndices = mapSelectionByIdentity(prev, arr, selected)
      onDescribeNextChange?.({ kind: 'move', direction: 'down', prev, next: arr, newIndices })
      applyItemsChange((current) => {
        const reordered = [...current]
        for (let k = selected.length - 1; k >= 0; k -= 1) {
          const i = selected[k]!
          if (i >= reordered.length - 1) continue
          const tmp = reordered[i + 1]!; reordered[i + 1] = reordered[i]!; reordered[i] = tmp
        }
        return reordered
      })
      syncSelectionAfterReorder(newIndices)
    })
  }, [
    applyItemsChange,
    items,
    mapSelectionByIdentity,
    onDescribeNextChange,
    selectedIndices,
    syncSelectionAfterReorder,
    withSuppression,
  ])

  // ── move to top ───────────────────────────────────────────────────────────

  const handleItemMoveTop = useCallback((idx: number) => {
    const selected = selectedIndices.length > 1 && selectedIndices.includes(idx)
      ? selectedIndices.slice().sort((a, b) => a - b)
      : [idx]
    withSuppression(() => {
      const prev = items
      // Already at the top — nothing to do.
      if (selected[0] === 0) { onDescribeNextChange?.(null); return }
      const block = selected.map((i) => prev[i]).filter((x): x is TItem => x !== undefined)
      const rest = prev.filter((_, i) => !selected.includes(i))
      const next = [...block, ...rest]
      const newIndices = mapSelectionByIdentity(prev, next, selected)
      onDescribeNextChange?.({ kind: 'move', direction: 'top', prev, next, newIndices })
      applyItemsChange((current) => {
        const currentBlock = selected.map((i) => current[i]).filter((x): x is TItem => x !== undefined)
        const currentRest = current.filter((_, i) => !selected.includes(i))
        return [...currentBlock, ...currentRest]
      })
      syncSelectionAfterReorder(newIndices)
    })
  }, [
    applyItemsChange,
    items,
    mapSelectionByIdentity,
    onDescribeNextChange,
    selectedIndices,
    syncSelectionAfterReorder,
    withSuppression,
  ])

  // ── move to bottom ────────────────────────────────────────────────────────

  const handleItemMoveBottom = useCallback((idx: number) => {
    const selected = selectedIndices.length > 1 && selectedIndices.includes(idx)
      ? selectedIndices.slice().sort((a, b) => a - b)
      : [idx]
    withSuppression(() => {
      const prev = items
      // Already at the bottom — nothing to do.
      if (selected[selected.length - 1] === prev.length - 1) {
        onDescribeNextChange?.(null)
        return
      }
      const block = selected.map((i) => prev[i]).filter((x): x is TItem => x !== undefined)
      const rest = prev.filter((_, i) => !selected.includes(i))
      const next = [...rest, ...block]
      const newIndices = mapSelectionByIdentity(prev, next, selected)
      onDescribeNextChange?.({ kind: 'move', direction: 'bottom', prev, next, newIndices })
      applyItemsChange((current) => {
        const currentBlock = selected.map((i) => current[i]).filter((x): x is TItem => x !== undefined)
        const currentRest = current.filter((_, i) => !selected.includes(i))
        return [...currentRest, ...currentBlock]
      })
      syncSelectionAfterReorder(newIndices)
    })
  }, [
    applyItemsChange,
    items,
    mapSelectionByIdentity,
    onDescribeNextChange,
    selectedIndices,
    syncSelectionAfterReorder,
    withSuppression,
  ])

  // ── select all / clear ────────────────────────────────────────────────────

  const handleSelectAll = useCallback(() => {
    const visibleSet = visibleIndicesRef?.current ?? null
    const all = visibleSet
      ? items
          .map((_, i) => i)
          .filter((i) => Number.isInteger(i) && i >= 0 && i < items.length && visibleSet.has(i))
      : items.map((_, i) => i)
    applySelection(all)
    // Keep the current active index if it remains in the selection; otherwise use the first.
    const keep = selectedIdx !== null && all.includes(selectedIdx)
      ? selectedIdx
      : (all[0] ?? null)
    setSelectedIdx(keep)
    updateSelectionAnchor(keep)
  }, [applySelection, items, selectedIdx, setSelectedIdx, updateSelectionAnchor, visibleIndicesRef])

  const handleClearSelection = useCallback(() => {
    applySelection([])
    setSelectedIdx(null)
    updateSelectionAnchor(null)
  }, [applySelection, setSelectedIdx, updateSelectionAnchor])

  // ── drag-and-drop ─────────────────────────────────────────────────────────

  // Called by useChipListDnd.onPrepareSelection at drag-start.
  const prepareDragSelection = useCallback((idx: number): number[] => {
    return resolveDragSelectionIndices(
      idx,
      items.length,
      selectedIndices.slice().sort((a, b) => a - b),
      (singleIdx) => {
        // Collapse: select only the dragged item and load it into the builder.
        const item = items[singleIdx]
        if (item === undefined) return
        applySelection([singleIdx])
        setSelectedIdx(singleIdx)
        updateSelectionAnchor(singleIdx)
        setBuilder(cloneItem(item))
      },
    )
  }, [
    applySelection,
    cloneItem,
    items,
    selectedIndices,
    setBuilder,
    setSelectedIdx,
    updateSelectionAnchor,
  ])

  // Full multi-index reorder handler for useChipListDnd.onReorder.
  const handleReorder = useCallback((
    movingIndices: number[],
    rawTargetIndex: number,
    options?: { mode?: 'move' | 'copy' },
  ) => {
    if (!Array.isArray(movingIndices) || movingIndices.length === 0) return
    withSuppression(() => {
      const mode = options?.mode === 'copy' ? 'copy' : 'move'
      // Move-mode reorder requires at least two items.
      if (mode === 'move' && items.length <= 1) { onDescribeNextChange?.(null); return }
      const prev = items
      const sanitized = sanitizeDragIndices(movingIndices, prev.length)
      if (sanitized.length === 0) { onDescribeNextChange?.(null); return }
      if (mode === 'copy') {
        const result = copyReorderItems(prev, sanitized, rawTargetIndex, cloneItem)
        if (!result) { onDescribeNextChange?.(null); return }
        const { next, copies, insertIdx } = result
        const newIndices = copies.map((_, ci) => insertIdx + ci)
        onDescribeNextChange?.({ kind: 'reorder-copy', prev, copies, next, insertIdx, newIndices })
        applyItemsChange(next)
        applySelection(newIndices)
        const last = newIndices[newIndices.length - 1] ?? null
        setSelectedIdx(last)
        updateSelectionAnchor(last)
        return
      }
      // Move mode: map selection by identity so items stay highlighted post-reorder.
      const moveResult = moveReorderItems(prev, sanitized, rawTargetIndex)
      if (!moveResult) { onDescribeNextChange?.(null); return }
      const { next, direction } = moveResult
      const newIndices = mapSelectionByIdentity(prev, next, sanitized)
      onDescribeNextChange?.({ kind: 'reorder-move', prev, next, newIndices, direction })
      applyItemsChange(next)
      syncSelectionAfterReorder(newIndices)
    })
  }, [
    applyItemsChange,
    applySelection,
    cloneItem,
    items,
    mapSelectionByIdentity,
    onDescribeNextChange,
    setSelectedIdx,
    syncSelectionAfterReorder,
    updateSelectionAnchor,
    withSuppression,
  ])

  // ── result ────────────────────────────────────────────────────────────────

  return {
    selectedIndices,
    setSelectedIndices: applySelection,
    multiselectActive,
    selectionAnchor,
    multiSelectedItems,
    multiEditDraftState,
    setMultiEditDraftState,
    handleItemSelect,
    handleItemDelete,
    handleItemDuplicate,
    handleItemMoveUp,
    handleItemMoveDown,
    handleItemMoveTop,
    handleItemMoveBottom,
    handleSelectAll,
    handleClearSelection,
    handleDeleteSelected,
    prepareDragSelection,
    handleReorder,
    updateSelectionAnchor,
  }
}
