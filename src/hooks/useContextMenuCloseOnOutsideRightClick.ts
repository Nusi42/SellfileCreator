import { useCallback, useEffect, useRef } from 'react'

type Params = {
  open: boolean
  onClose: () => void
  menuRef?: { current: Element | null }
  // Optional extra refs that count as "inside" for nested context menus.
  // Why: Allows child menus to stay interactive without closing the parent menu on click.
  insideRefs?: Array<{ current: Element | null }>
}

/**
 * While a custom context menu is open, intercepts outside interactions so they
 * dismiss the menu instead of leaving it stuck on screen. Native browser menus stay
 * suppressed until the custom menu fully closes.
 */
export function useContextMenuCloseOnOutsideRightClick({ open, onClose, menuRef, insideRefs }: Params): void {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  const isTargetInsideAnyMenu = useCallback((target: Node | null): boolean => {
    // Nested menus should not close their parents; treat all provided refs as "inside" zones.
    if (!target) return false
    const root = menuRef?.current ?? null
    if (root && root.contains(target)) return true
    const extras = insideRefs ?? []
    for (let idx = 0; idx < extras.length; idx += 1) {
      const extra = extras[idx]?.current ?? null
      if (extra && extra.contains(target)) return true
    }
    return false
  }, [insideRefs, menuRef])

  useEffect(() => {
    if (!open || !menuRef) return undefined
    const handlePointerDownCapture = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (isTargetInsideAnyMenu(target)) return
      closeRef.current()
    }
    window.addEventListener('pointerdown', handlePointerDownCapture, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDownCapture, true)
    }
  }, [isTargetInsideAnyMenu, menuRef, open])

  useEffect(() => {
    if (!open) return undefined
    const handleContextMenuCapture = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (isTargetInsideAnyMenu(target)) {
        // Suppress the native browser menu while keeping the event available to React handlers
        // inside the custom menu (e.g., right-click actions on menu buttons).
        event.preventDefault()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      closeRef.current()
    }
    window.addEventListener('contextmenu', handleContextMenuCapture, true)
    return () => {
      window.removeEventListener('contextmenu', handleContextMenuCapture, true)
    }
  }, [isTargetInsideAnyMenu, menuRef, open])
}
