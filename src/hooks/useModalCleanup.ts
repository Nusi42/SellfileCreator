import { useEffect } from 'react'

const MODAL_SELECTOR = '.MuiModal-root'
const BACKDROP_SELECTOR = '.MuiBackdrop-root'
const HIDDEN_CLASS = 'MuiModal-hidden'
const DATA_MARKER = 'data-cleanup-processed'

// honorAriaHidden: aria-hidden="true" is an ambiguous signal. MUI's ModalManager sets it on
// BACKGROUND modals whenever another modal stacks on top (theme-editor Menu over the Help
// dialog), where the modal is fully alive and must keep its backdrop. Only when NO topmost
// active modal exists does aria-hidden mean "orphaned leftovers" and justify cleanup.
const isModalActive = (modal: HTMLElement, honorAriaHidden: boolean): boolean => {
  if (!modal.isConnected) return false
  if (modal.classList.contains(HIDDEN_CLASS)) return false
  if (honorAriaHidden && modal.getAttribute('aria-hidden') === 'true') return false
  // When a modal is in the middle of a transition the style may be hidden.
  const style = window.getComputedStyle(modal)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  return true
}

const cleanupBackdrops = () => {
  const modals = Array.from(document.querySelectorAll<HTMLElement>(MODAL_SELECTOR))
  // A topmost active modal (visible AND not aria-hidden) means any aria-hidden sibling is a
  // legitimately stacked background modal, not an orphan — so aria-hidden is only honored as
  // an inactivity signal when no such topmost modal exists.
  const hasTopmostActive = modals.some((modal) => isModalActive(modal, true))
  const activeModals = modals.filter((modal) => isModalActive(modal, !hasTopmostActive))

  if (activeModals.length === 0) {
    document.body.classList.remove('MuiModal-open')
    document.body.style.removeProperty('padding-right')
    document.body.style.removeProperty('overflow')
  }

  const backdrops = Array.from(document.querySelectorAll<HTMLElement>(BACKDROP_SELECTOR))
  backdrops.forEach((backdrop) => {
    const parentModal = backdrop.closest<HTMLElement>(MODAL_SELECTOR)
    const parentActive = parentModal ? isModalActive(parentModal, !hasTopmostActive) : false
    if (!parentActive) {
      // Disable interaction immediately so UI remains usable even if the element lingers.
      backdrop.style.pointerEvents = 'none'
      backdrop.style.opacity = '0'
      if (!backdrop.hasAttribute(DATA_MARKER)) {
        backdrop.setAttribute(DATA_MARKER, '1')
        window.requestAnimationFrame(() => {
          // Re-derive the stacking state — the rAF runs after DOM mutations may have landed.
          const stillHasTopmost = Array.from(document.querySelectorAll<HTMLElement>(MODAL_SELECTOR))
            .some((modal) => isModalActive(modal, true))
          const stillParentActive = parentModal ? isModalActive(parentModal, !stillHasTopmost) : false
          if (!stillParentActive) {
            backdrop.remove()
          } else {
            backdrop.removeAttribute(DATA_MARKER)
            backdrop.style.removeProperty('pointer-events')
            backdrop.style.removeProperty('opacity')
          }
        })
      }
    } else if (backdrop.hasAttribute(DATA_MARKER)) {
      backdrop.removeAttribute(DATA_MARKER)
      backdrop.style.removeProperty('pointer-events')
      backdrop.style.removeProperty('opacity')
    }
  })
}

export function useModalCleanup() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}

    const runCleanup = () => {
      try {
        cleanupBackdrops()
      } catch {
        // Ignore DOM issues; cleanup runs again on the next tick/observer event.
      }
    }

    runCleanup()
    const observer = new MutationObserver(runCleanup)
    observer.observe(document.body, { childList: true, subtree: true })

    const intervalId = window.setInterval(runCleanup, 2000)
    const onVisibility = () => runCleanup()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      observer.disconnect()
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}
