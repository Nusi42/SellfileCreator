import { useEffect } from 'react'

const MODAL_SELECTOR = '.MuiModal-root'
const BACKDROP_SELECTOR = '.MuiBackdrop-root'
const HIDDEN_CLASS = 'MuiModal-hidden'
const DATA_MARKER = 'data-cleanup-processed'

// aria-hidden="true" is an ambiguous signal on its own. MUI's ModalManager sets it BOTH on
// background modals when another modal stacks on top (theme-editor Menu over the Help dialog),
// where the modal is alive and must keep its backdrop, AND on a modal it is removing — the
// orphan case this hook exists to clean up. The two are told apart by STACKING, not by a global
// "is anything open" flag: a legitimately backgrounded modal always has a live modal rendered
// ABOVE it, while an orphan is aria-hidden with nothing above it.
const isModalActive = (modal: HTMLElement, hasLiveModalAbove: (modal: HTMLElement) => boolean): boolean => {
  if (!modal.isConnected) return false
  if (modal.classList.contains(HIDDEN_CLASS)) return false
  // Only a modal that something else is stacked over may keep its aria-hidden and stay active.
  if (modal.getAttribute('aria-hidden') === 'true' && !hasLiveModalAbove(modal)) return false
  // When a modal is in the middle of a transition the style may be hidden.
  const style = window.getComputedStyle(modal)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  return true
}

// "Live" ignores aria-hidden entirely: it answers only "is this element still a rendered modal",
// which is what makes it a valid witness that a lower modal is merely backgrounded.
const isModalLive = (modal: HTMLElement): boolean => {
  if (!modal.isConnected) return false
  if (modal.classList.contains(HIDDEN_CLASS)) return false
  const style = window.getComputedStyle(modal)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

// MUI appends each new modal after the previous one, so DOM order is stacking order: a modal is
// backgrounded iff some LATER sibling in the query result is still live and not itself hidden.
const makeHasLiveModalAbove = (modals: readonly HTMLElement[]) => (modal: HTMLElement): boolean => {
  const index = modals.indexOf(modal)
  if (index === -1) return false
  return modals.slice(index + 1).some((above) => above.getAttribute('aria-hidden') !== 'true' && isModalLive(above))
}

const cleanupBackdrops = () => {
  const modals = Array.from(document.querySelectorAll<HTMLElement>(MODAL_SELECTOR))
  const hasLiveModalAbove = makeHasLiveModalAbove(modals)
  const activeModals = modals.filter((modal) => isModalActive(modal, hasLiveModalAbove))

  if (activeModals.length === 0) {
    document.body.classList.remove('MuiModal-open')
    document.body.style.removeProperty('padding-right')
    document.body.style.removeProperty('overflow')
  }

  const backdrops = Array.from(document.querySelectorAll<HTMLElement>(BACKDROP_SELECTOR))
  backdrops.forEach((backdrop) => {
    const parentModal = backdrop.closest<HTMLElement>(MODAL_SELECTOR)
    const parentActive = parentModal ? isModalActive(parentModal, hasLiveModalAbove) : false
    if (!parentActive) {
      // Disable interaction immediately so UI remains usable even if the element lingers.
      backdrop.style.pointerEvents = 'none'
      backdrop.style.opacity = '0'
      if (!backdrop.hasAttribute(DATA_MARKER)) {
        backdrop.setAttribute(DATA_MARKER, '1')
        window.requestAnimationFrame(() => {
          // Re-derive the stacking state — the rAF runs after DOM mutations may have landed.
          const stillModals = Array.from(document.querySelectorAll<HTMLElement>(MODAL_SELECTOR))
          const stillHasLiveModalAbove = makeHasLiveModalAbove(stillModals)
          const stillParentActive = parentModal ? isModalActive(parentModal, stillHasLiveModalAbove) : false
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
