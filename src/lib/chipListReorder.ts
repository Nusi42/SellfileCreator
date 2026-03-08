/**
 * chipListReorder
 *
 * Pure utility functions for drag-and-drop reordering of chip list items.
 * Shared by useRecipeSelection and useSafeguardSelection — do NOT duplicate
 * this logic in either hook; extend here and import instead.
 *
 * All functions are stateless and side-effect-free; state mutations (setItems,
 * applySelection, etc.) remain in the calling hook where they belong.
 */

/**
 * Deduplicates, bounds-checks, and sorts raw drag indices against the list
 * length. Returns an empty array when no valid indices remain.
 */
export function sanitizeDragIndices(movingIndices: number[], listLength: number): number[] {
  return Array.from(new Set(
    movingIndices
      .map((idx) => (Number.isInteger(idx) ? Number(idx) : -1))
      .filter((idx) => idx >= 0 && idx < listLength),
  )).sort((a, b) => a - b)
}

export type MoveReorderResult<T> = {
  /** Reordered list with moved items spliced in at the new position. */
  next: T[]
  /** Adjusted insertion index (in the remaining array, after removed items). */
  insertIdx: number
  /** The items that were moved (identity-preserving, same references). */
  movingItems: T[]
  /** Directional hint for history descriptor labeling. */
  direction: 'up' | 'down' | 'top' | 'bottom'
}

/**
 * Computes a move reorder: removes items at `sanitized` ascending indices,
 * adjusts the insertion point for removed items, and splices everything back.
 *
 * Returns null when the drop target falls inside the existing selection span
 * (a no-op drop) or when the inputs are degenerate.
 */
export function moveReorderItems<T>(
  items: T[],
  sanitized: number[],
  rawTargetIndex: number,
): MoveReorderResult<T> | null {
  // Need at least two items to make a reorder meaningful.
  if (sanitized.length === 0 || items.length <= 1) return null
  const movingItems = sanitized.map((i) => items[i]).filter((v): v is T => v !== undefined)
  if (movingItems.length === 0) return null
  const clampedTarget = Math.max(0, Math.min(items.length, rawTargetIndex))
  const minSel = sanitized[0]!
  const maxSel = sanitized[sanitized.length - 1]!
  // A drop inside the selection span leaves the order unchanged.
  if (clampedTarget >= minSel && clampedTarget <= maxSel + 1) return null
  const selectionSet = new Set(sanitized)
  // Build the list without the moving items.
  const remaining = items.filter((_, idx) => !selectionSet.has(idx))
  // Shift the insertion index left by how many moving items sat before it.
  let insertIdx = clampedTarget
  for (const idx of sanitized) {
    if (idx < clampedTarget) insertIdx -= 1
  }
  insertIdx = Math.max(0, Math.min(remaining.length, insertIdx))
  const next = [...remaining.slice(0, insertIdx), ...movingItems, ...remaining.slice(insertIdx)]
  // Derive a direction label for history descriptors.
  const atTop = insertIdx === 0
  const atBottom = insertIdx === remaining.length
  let direction: 'up' | 'down' | 'top' | 'bottom' = 'down'
  if (atTop) direction = 'top'
  else if (atBottom) direction = 'bottom'
  else if (insertIdx < minSel) direction = 'up'
  return { next, insertIdx, movingItems, direction }
}

export type CopyReorderResult<T> = {
  /** List with cloned items inserted at the target position. */
  next: T[]
  /** The newly-created clones (with identities different from originals). */
  copies: T[]
  /** Clamped insertion index used for the splice. */
  insertIdx: number
}

/**
 * Computes a copy reorder: clones items at `sanitized` indices using `cloneFn`
 * and inserts them at `rawTargetIndex`. The original items remain in place.
 *
 * Returns null when the inputs are degenerate.
 */
export function copyReorderItems<T>(
  items: T[],
  sanitized: number[],
  rawTargetIndex: number,
  cloneFn: (item: T) => T,
): CopyReorderResult<T> | null {
  if (sanitized.length === 0) return null
  const movingItems = sanitized.map((i) => items[i]).filter((v): v is T => v !== undefined)
  if (movingItems.length === 0) return null
  const copies = movingItems.map(cloneFn)
  const insertIdx = Math.max(0, Math.min(items.length, rawTargetIndex))
  const next = [...items.slice(0, insertIdx), ...copies, ...items.slice(insertIdx)]
  return { next, copies, insertIdx }
}

/**
 * Resolves which indices to drag when a drag gesture starts on item `idx`.
 *
 * If `idx` is already part of `selectedIndices`, the full sorted selection
 * is dragged as a group. Otherwise returns `[idx]` (single-item drag) and
 * calls `onCollapse(idx)` so the caller can update its selection state.
 *
 * Returns an empty array for out-of-range indices.
 */
export function resolveDragSelectionIndices(
  idx: number,
  listLength: number,
  selectedIndices: number[],
  onCollapse: (singleIdx: number) => void,
): number[] {
  if (!Number.isInteger(idx) || idx < 0 || idx >= listLength) return []
  // Already selected — drag the whole group.
  if (selectedIndices.length > 0 && selectedIndices.includes(idx)) {
    return selectedIndices.slice().sort((a, b) => a - b)
  }
  // Not selected — collapse to a single-item drag and notify the caller.
  onCollapse(idx)
  return [idx]
}
