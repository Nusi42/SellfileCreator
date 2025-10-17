import { useEffect, useRef } from 'react'

type Params = {
  open: boolean
  onClose: () => void
  menuRef?: React.RefObject<HTMLElement | null>
}

/**
 * While a custom context menu is open, intercepts additional right clicks so they
 * dismiss the menu instead of leaving it stuck on screen. Native browser menus stay
 * suppressed until the custom menu fully closes.
 */
export function useContextMenuCloseOnOutsideRightClick({ open, onClose, menuRef }: Params): void {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    const handleContextMenuCapture = (event: MouseEvent) => {
      const target = event.target as Node | null
      const menuEl = menuRef?.current ?? null
      if (menuEl && target && menuEl.contains(target)) {
        event.preventDefault()
        event.stopPropagation()
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
  }, [menuRef, open])
}
