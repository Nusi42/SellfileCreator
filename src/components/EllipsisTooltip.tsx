import React, { useCallback, useEffect, useRef } from 'react'
import { Box } from '@mui/material'
import { hasEllipsisOverflow, pickEllipsisTarget } from '../lib/ellipsis'

export { hasEllipsisOverflow, pickEllipsisTarget } from '../lib/ellipsis'

// EllipsisTooltip applies a native OS tooltip (`title`) only when text is actually truncated.
// Why: Native tooltips are only desired for "expand the ellipsis" behavior; everything else should use MarkdownTooltip.
export function EllipsisTooltip({
  title,
  children,
  selector,
  disabled,
  wrap = 'inline',
}: {
  // Native title can only be a string; keep the API strict so callers don’t expect Markdown formatting here.
  title: string
  children: React.ReactNode
  selector?: string
  disabled?: boolean
  wrap?: 'inline' | 'block'
}) {
  // Track the last element we touched so we can restore any pre-existing title attribute.
  // Why: We should never permanently stomp an explicit title on nested children.
  const titleTargetRef = useRef<HTMLElement | null>(null)
  const originalTitleRef = useRef<string | null>(null)

  // Restore the title attribute back to its original state (or remove it).
  // Why: Native tooltips are stateful on the DOM; leaving stale titles causes confusing hover behavior.
  const restoreTitle = useCallback(() => {
    const target = titleTargetRef.current
    if (!target) return
    const original = originalTitleRef.current
    if (original === null) {
      target.removeAttribute('title')
    } else {
      target.setAttribute('title', original)
    }
    titleTargetRef.current = null
    originalTitleRef.current = null
  }, [])

  // Recompute the truncation measurement and only apply the native tooltip when needed.
  // Why: We only want OS tooltips for overflow; normal tooltips should remain Popper-based.
  const syncTitleForOverflow = useCallback((root?: HTMLElement | null) => {
    restoreTitle()
    if (disabled || !root) return
    const target = pickEllipsisTarget(root, selector)
    titleTargetRef.current = target
    originalTitleRef.current = target.getAttribute('title')
    if (!hasEllipsisOverflow(target)) {
      restoreTitle()
      return
    }
    target.setAttribute('title', title)
  }, [disabled, restoreTitle, selector, title])

  // Ensure we never leave a native tooltip behind when unmounting or disabling the wrapper.
  // Why: A removed node cannot receive `mouseleave`/`blur` events, so we must clean up proactively.
  useEffect(() => restoreTitle, [restoreTitle])
  useEffect(() => {
    if (!disabled) return
    restoreTitle()
  }, [disabled, restoreTitle])

  return (
    <Box
      component={wrap === 'block' ? 'div' : 'span'}
      // Wrapper mimics the child’s display mode so we can attach hover listeners without layout shifts.
      sx={{ display: wrap === 'block' ? 'block' : 'inline-flex', minWidth: 0, width: wrap === 'block' ? '100%' : undefined }}
      onPointerDownCapture={restoreTitle}
      onKeyDownCapture={restoreTitle}
      onMouseEnter={(e: React.MouseEvent<HTMLElement>) => syncTitleForOverflow(e.currentTarget)}
      onMouseLeave={restoreTitle}
      onFocus={(e: React.FocusEvent<HTMLElement>) => syncTitleForOverflow(e.currentTarget)}
      onBlur={restoreTitle}
    >
      {children}
    </Box>
  )
}

export default EllipsisTooltip
/**
 * EllipsisTooltip
 *
 * Utility component that shows a tooltip with full text when the child
 * content is ellipsized (overflow hidden).
 */
