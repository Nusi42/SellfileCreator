/**
 * useChipListKeyboard
 *
 * SSOT hook for keyboard shortcuts, container focus-ring visibility, and
 * empty-area click-to-deselect shared between RecipeChipsPanel and
 * SafeguardChipsPanel.
 *
 * Supported interactions when the container element itself has direct focus
 * (i.e. e.target === e.currentTarget):
 *   - Delete / Backspace  →  onDeleteSelected()  (only when selectedCount > 0)
 *   - Ctrl / Cmd + A      →  onSelectAll()        (only when visibleCount > 0)
 *   - Shift keydown       →  hides focus ring (range-extension gesture; ring
 *                            reappears on the next keyboard-only focus)
 *   - ArrowUp / ArrowDown →  onNavigate() to prev / next visible item
 *   - Home / End          →  onNavigate() to first / last visible item
 *   - PageUp / PageDown   →  onNavigate() by one viewport-height page
 *
 * Focus-ring logic follows the :focus-visible pattern so the ring only appears
 * for keyboard navigation and is suppressed for pointer interaction.
 *
 * The click handler only fires onClearSelection when the pointer hits the bare
 * container background (e.currentTarget === e.target), not a child chip.
 * Modifier-key clicks (Shift / Ctrl / Meta) are ignored so range-select and
 * ctrl-click work without clearing the selection.
 */
import { useCallback, useState } from 'react'
import type { FocusEvent, KeyboardEvent, MouseEvent } from 'react'

export type UseChipListKeyboardOptions = {
  /** Number of currently-visible (unfiltered) items; Ctrl+A only fires when > 0. */
  visibleCount: number
  /** Number of currently-selected items; Delete/Backspace only fires when > 0. */
  selectedCount: number
  /** Called when Delete/Backspace is pressed with at least one item selected. */
  onDeleteSelected: () => void
  /** Called when Ctrl/Cmd+A is pressed with at least one visible item. */
  onSelectAll: () => void
  /** Called when the user clicks the bare container background without modifiers. */
  onClearSelection: () => void

  // ── arrow / page / home / end navigation ────────────────────────────────
  /**
   * Visible items in their display order (original item indices, not render
   * positions). Navigation is disabled when this is absent or empty.
   */
  visibleOrderedIndices?: readonly number[] | null
  /** Current cursor/anchor item index; navigation starts from here. */
  cursorIdx?: number | null
  /** Called with the target item index when a navigation key is pressed. */
  onNavigate?: ((idx: number) => void) | null
  /**
   * Data attribute used to look up the current chip element so page size can
   * be estimated from its rendered height (e.g. 'data-recipe-chip-index').
   */
  chipIndexAttr?: string
  /**
   * Scroll container — read-only current ref so both RefObject and
   * MutableRefObject are accepted. Used to measure clientHeight for PageUp/Down.
   */
  containerRef?: { readonly current: HTMLElement | null }
}

export type UseChipListKeyboardResult = {
  /** True while the keyboard focus ring should be rendered. */
  showFocusRing: boolean
  /** Attach to the container's onKeyDown prop. */
  handleKeyDown: (e: KeyboardEvent<HTMLElement>) => void
  /**
   * Attach to the container's onFocus prop.
   * Callers may compose additional focus-handling logic after calling this.
   */
  handleFocus: (e: FocusEvent<HTMLElement>) => void
  /** Attach to the container's onBlur prop. */
  handleBlur: () => void
  /** Attach to the container's onMouseDown prop. */
  handleMouseDown: () => void
  /** Attach to the container's onClick prop. */
  handleClick: (e: MouseEvent<HTMLElement>) => void
}

/**
 * Estimates how many chips fit in one viewport height for PageUp / PageDown.
 * Falls back to 10 when the chip element or container cannot be measured.
 */
function estimatePageSize(
  containerRef: { readonly current: HTMLElement | null } | undefined,
  chipIndexAttr: string | undefined,
  cursorIdx: number | null | undefined,
): number {
  const container = containerRef?.current
  if (!container || !chipIndexAttr || cursorIdx == null) return 10
  const chipEl = container.querySelector(`[${chipIndexAttr}="${cursorIdx}"]`) as HTMLElement | null
  const chipHeight = chipEl?.offsetHeight
  if (!chipHeight) return 10
  return Math.max(1, Math.floor(container.clientHeight / chipHeight))
}

export function useChipListKeyboard({
  visibleCount,
  selectedCount,
  onDeleteSelected,
  onSelectAll,
  onClearSelection,
  visibleOrderedIndices,
  cursorIdx,
  onNavigate,
  chipIndexAttr,
  containerRef,
}: UseChipListKeyboardOptions): UseChipListKeyboardResult {
  const [showFocusRing, setShowFocusRing] = useState(false)

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
    // Escape: clear selection when at least one item is selected.
    if (e.key === 'Escape') {
      if (selectedCount === 0) return
      e.preventDefault()
      onClearSelection()
      return
    }
    // Shift is used for range selection — hide the ring so it doesn't conflict.
    if (e.key === 'Shift') {
      setShowFocusRing(false)
      return
    }
    // Delete / Backspace: remove selected items when the container has direct focus.
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (e.target !== e.currentTarget) return
      if (selectedCount === 0) return
      e.preventDefault()
      onDeleteSelected()
      return
    }
    // Ctrl/Cmd+A: select all visible items when the container has direct focus.
    if (e.key.toLowerCase() === 'a' && (e.ctrlKey || e.metaKey)) {
      if (e.target !== e.currentTarget) return
      e.preventDefault()
      if (visibleCount > 0) onSelectAll()
      return
    }
    // Navigation keys — only fire when the container itself holds focus so
    // typing in a child TextField (e.g. rule name editor) is unaffected.
    if (e.target !== e.currentTarget) return
    if (!onNavigate || !visibleOrderedIndices || visibleOrderedIndices.length === 0) return
    const isNavKey = e.key === 'ArrowUp' || e.key === 'ArrowDown'
      || e.key === 'Home' || e.key === 'End'
      || e.key === 'PageUp' || e.key === 'PageDown'
    if (!isNavKey) return
    e.preventDefault()
    const len = visibleOrderedIndices.length
    const last = len - 1
    // Position of the current cursor within the visible list; -1 when absent.
    const pos = cursorIdx != null ? visibleOrderedIndices.indexOf(cursorIdx) : -1
    switch (e.key) {
      case 'ArrowUp': {
        // Already at top → stay; otherwise step back one item.
        const nextPos = pos <= 0 ? 0 : pos - 1
        const next = visibleOrderedIndices[nextPos]
        if (next !== undefined) onNavigate(next)
        break
      }
      case 'ArrowDown': {
        // No selection or already at bottom → clamp to last item.
        const nextPos = pos < 0 || pos >= last ? last : pos + 1
        const next = visibleOrderedIndices[nextPos]
        if (next !== undefined) onNavigate(next)
        break
      }
      case 'Home': {
        const first = visibleOrderedIndices[0]
        if (first !== undefined) onNavigate(first)
        break
      }
      case 'End': {
        const lastItem = visibleOrderedIndices[last]
        if (lastItem !== undefined) onNavigate(lastItem)
        break
      }
      case 'PageUp': {
        const pageSize = estimatePageSize(containerRef, chipIndexAttr, cursorIdx)
        const nextPos = pos <= 0 ? 0 : Math.max(0, pos - pageSize)
        const next = visibleOrderedIndices[nextPos]
        if (next !== undefined) onNavigate(next)
        break
      }
      case 'PageDown': {
        const pageSize = estimatePageSize(containerRef, chipIndexAttr, cursorIdx)
        const nextPos = pos < 0 ? last : Math.min(last, pos + pageSize)
        const next = visibleOrderedIndices[nextPos]
        if (next !== undefined) onNavigate(next)
        break
      }
    }
  }, [
    onClearSelection, onDeleteSelected, onSelectAll, selectedCount, visibleCount,
    onNavigate, visibleOrderedIndices, cursorIdx, containerRef, chipIndexAttr,
  ])

  const handleFocus = useCallback((e: FocusEvent<HTMLElement>) => {
    // Only show the ring when the container itself (not a child) receives focus.
    if (e.currentTarget !== e.target) return
    try {
      // :focus-visible is only set for keyboard-triggered focus.
      if (e.currentTarget.matches(':focus-visible')) setShowFocusRing(true)
    } catch {
      // Older browsers may throw on :focus-visible — fall back to always showing.
      setShowFocusRing(true)
    }
  }, [])

  const handleBlur = useCallback(() => {
    setShowFocusRing(false)
  }, [])

  const handleMouseDown = useCallback(() => {
    // Pointer interaction means we are not in keyboard-nav mode.
    setShowFocusRing(false)
  }, [])

  const handleClick = useCallback((e: MouseEvent<HTMLElement>) => {
    // Only deselect on a plain left-click on the empty container background.
    if (e.button !== 0) return
    if (e.shiftKey || e.ctrlKey || e.metaKey) return
    if (e.currentTarget === e.target) onClearSelection()
  }, [onClearSelection])

  return { showFocusRing, handleKeyDown, handleFocus, handleBlur, handleMouseDown, handleClick }
}
