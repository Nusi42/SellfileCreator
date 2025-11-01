import { useEffect } from 'react'

const MODAL_SELECTOR = '.MuiModal-root'
const BACKDROP_SELECTOR = '.MuiBackdrop-root'
const HIDDEN_CLASS = 'MuiModal-hidden'
const DATA_MARKER = 'data-cleanup-processed'

const isModalActive = (modal: HTMLElement): boolean => {
  if (!modal.isConnected) return false
  if (modal.classList.contains(HIDDEN_CLASS)) return false
  const ariaHidden = modal.getAttribute('aria-hidden')
  if (ariaHidden === 'true') return false
  // When a modal is in the middle of a transition the style may be hidden.
  const style = window.getComputedStyle(modal)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  return true
}

const cleanupBackdrops = () => {
  const modals = Array.from(document.querySelectorAll<HTMLElement>(MODAL_SELECTOR))
  const activeModals = modals.filter(isModalActive)

  if (activeModals.length === 0) {
    document.body.classList.remove('MuiModal-open')
    document.body.style.removeProperty('padding-right')
    document.body.style.removeProperty('overflow')
  }

  const backdrops = Array.from(document.querySelectorAll<HTMLElement>(BACKDROP_SELECTOR))
  backdrops.forEach((backdrop) => {
    const parentModal = backdrop.closest<HTMLElement>(MODAL_SELECTOR)
    const parentActive = parentModal ? isModalActive(parentModal) : false
    if (!parentActive) {
      // Disable interaction immediately so UI remains usable even if the element lingers.
      backdrop.style.pointerEvents = 'none'
      backdrop.style.opacity = '0'
      if (!backdrop.hasAttribute(DATA_MARKER)) {
        backdrop.setAttribute(DATA_MARKER, '1')
        window.requestAnimationFrame(() => {
          const stillParentActive = parentModal ? isModalActive(parentModal) : false
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
