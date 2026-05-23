import { useCallback, useRef } from 'react'

/**
 * Returns everything needed to wire a MUI Dialog to the shrink-to-button close animation.
 *
 * Usage:
 *   const { animateClose, dialogProps } = useDialogMinimizeAnimation('[data-tour-id="my.button"]')
 *   // Spread dialogProps onto the Dialog element:
 *   <Dialog {...dialogProps} onClose={() => animateClose(onClose)}>
 *
 * `dialogProps` pre-sets:
 *   - `transitionDuration={{ exit: 0 }}` — suppresses MUI's Fade exit so the paper
 *     doesn't flash back to full size after the custom shrink animation.
 *   - `PaperProps={{ ref }}` — attaches the ref used to read the paper's bounding rect.
 *
 * `animateClose(onClose)` plays the animation then calls onClose. Falls back to a direct
 * call when the target button cannot be found or has no size.
 */
export function useDialogMinimizeAnimation(buttonSelector: string): {
  /** Spread onto the MUI Dialog element. Includes transitionDuration and PaperProps. */
  dialogProps: {
    transitionDuration: { exit: number }
    PaperProps: { ref: React.RefObject<HTMLElement | null> }
  }
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

  const dialogProps = {
    transitionDuration: { exit: 0 },
    PaperProps: { ref: paperRef },
  } as const

  return { animateClose, dialogProps }
}
