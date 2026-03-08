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

export function useChipListKeyboard({
  visibleCount,
  selectedCount,
  onDeleteSelected,
  onSelectAll,
  onClearSelection,
}: UseChipListKeyboardOptions): UseChipListKeyboardResult {
  const [showFocusRing, setShowFocusRing] = useState(false)

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
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
    if (e.key.toLowerCase() !== 'a') return
    if (!(e.ctrlKey || e.metaKey)) return
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    if (visibleCount > 0) onSelectAll()
  }, [onDeleteSelected, onSelectAll, selectedCount, visibleCount])

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
