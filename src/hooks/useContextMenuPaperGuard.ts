import { useMemo, useRef } from 'react'
import type React from 'react'
import { useContextMenuCloseOnOutsideRightClick } from './useContextMenuCloseOnOutsideRightClick'
import type { ContextMenuPaperGuardToken } from '../components/ContextMenuPaper'

interface GuardParams {
  open: boolean
  onClose: () => void
  menuRef?: React.MutableRefObject<Element | null>
  insideRefs?: Array<{ current: Element | null }>
}

interface GuardResult {
  menuRef: React.MutableRefObject<Element | null>
  contextMenuGuard: ContextMenuPaperGuardToken
}

// Stable guard token used to enforce ContextMenuPaper wiring at compile time.
const CONTEXT_MENU_PAPER_GUARD_TOKEN: ContextMenuPaperGuardToken = {
  __contextMenuPaperGuardToken: 'ContextMenuPaperGuardToken',
}

/**
 * useContextMenuPaperGuard
 *
 * Wraps the outside-click close hook and returns the required guard token +
 * ref so ContextMenuPaper always has its cleanup wired.
 */
export function useContextMenuPaperGuard({
  open,
  onClose,
  menuRef,
  insideRefs,
}: GuardParams): GuardResult {
  // Create a ref only when a caller does not already own one.
  const localRef = useRef<Element | null>(null)
  // Prefer the caller-provided ref so other logic can keep using it.
  const resolvedRef = menuRef ?? localRef
  // Close the menu when users click outside to avoid stuck overlays.
  const outsideClickParams = {
    open,
    onClose,
    menuRef: resolvedRef,
    ...(insideRefs ? { insideRefs } : {}),
  }
  useContextMenuCloseOnOutsideRightClick(outsideClickParams)
  // Memoize the guard token so reference checks stay stable.
  const contextMenuGuard = useMemo(() => CONTEXT_MENU_PAPER_GUARD_TOKEN, [])
  return { menuRef: resolvedRef, contextMenuGuard }
}
