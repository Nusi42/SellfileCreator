import { useCallback, useRef } from 'react'

/**
 * Returns a ref to attach to a MUI Dialog's PaperProps and an `animateClose` callback
 * that plays a shrink-to-button animation before calling the supplied onClose function.
 *
 * Usage:
 *   const { paperRef, animateClose } = useDialogMinimizeAnimation('[data-tour-id="my.button"]')
 *   // Pass to MUI Dialog:
 *   PaperProps={{ ref: paperRef }}
 *   // Replace direct onClose calls with:
 *   animateClose(onClose)
 *
 * The caller is responsible for suppressing MUI's built-in exit transition when this
 * animation runs (set transitionDuration={{ exit: 0 }} on the Dialog).
 */
export function useDialogMinimizeAnimation(buttonSelector: string): {
  paperRef: React.RefObject<HTMLElement | null>
  animateClose: (onClose: () => void) => void
} {
  const paperRef = useRef<HTMLElement>(null)

  const animateClose = useCallback((onClose: () => void) => {
    const paper = paperRef.current
    // Pick the visible button when the selector matches multiple elements (e.g. the same button
    // exists in both the recipe and safeguard builder panels, only one of which is shown).
    const btn = typeof document !== 'undefined'
      ? (Array.from(document.querySelectorAll<HTMLElement>(buttonSelector))
          .find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }) ?? null)
      : null
    if (paper && btn) {
      const paperRect = paper.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      // Transform origin: center of the target button, relative to paper's top-left corner.
      const originX = btnRect.left + btnRect.width / 2 - paperRect.left
      const originY = btnRect.top + btnRect.height / 2 - paperRect.top
      paper.style.transformOrigin = `${originX}px ${originY}px`
      paper.style.transition = 'transform 0.22s cubic-bezier(0.4, 0, 1, 1), opacity 0.22s ease-in'
      paper.style.transform = 'scale(0.05)'
      paper.style.opacity = '0'
      window.setTimeout(() => { onClose() }, 230)
    } else {
      onClose()
    }
  }, [buttonSelector])

  return { paperRef, animateClose }
}
