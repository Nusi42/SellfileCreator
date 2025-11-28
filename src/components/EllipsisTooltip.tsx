import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { useScrollingFlag } from '../hooks/useScrollingFlag'
import MarkdownTooltip, { hasPrimaryPointerHandler, type TooltipHoverIntent } from './MarkdownTooltip'
import { MARKDOWN_TOOLTIP_INFO_ENTER_DELAY_MS, MARKDOWN_TOOLTIP_INTERACTIVE_ENTER_DELAY_MS } from '../lib/constants'
import { hasEllipsisOverflow } from '../lib/ellipsis'

export { hasEllipsisOverflow, pickEllipsisTarget } from '../lib/ellipsis'

export function EllipsisTooltip({
  title,
  children,
  selector,
  disabled,
  wrap = 'inline',
  // Default to the global tooltip portal so overflow helpers never enlarge their scroll parents.
  disablePortal = false,
  maxWidth,
  hoverIntent = 'auto',
}: {
  title: React.ReactNode | string
  children: React.ReactNode
  selector?: string
  disabled?: boolean
  wrap?: 'inline' | 'block'
  disablePortal?: boolean
  maxWidth?: number | string
  hoverIntent?: TooltipHoverIntent
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  // Mirror MarkdownTooltip’s hover delay so overflow tooltips don’t pop instantly.
  const hoverTimerRef = useRef<number | null>(null)
  const scrolling = useScrollingFlag()
  const popperSlotProps = { disablePortal }
  const tooltipSlotProps = maxWidth != null ? { sx: { maxWidth } } : null
  const tooltipProps = typeof title === 'string'
    ? { markdown: title }
    : { render: title }
  const childHasPrimaryPointerHandler = useMemo(() => hasPrimaryPointerHandler(children), [children])
  const treatAsInteractive = hoverIntent === 'interactive' || (hoverIntent === 'auto' && childHasPrimaryPointerHandler)
  const resolvedEnterDelay = treatAsInteractive
    ? MARKDOWN_TOOLTIP_INTERACTIVE_ENTER_DELAY_MS
    : MARKDOWN_TOOLTIP_INFO_ENTER_DELAY_MS

  const clearHoverTimer = () => {
    if (hoverTimerRef.current === null) return
    window.clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = null
  }

  useEffect(() => clearHoverTimer, [])

  return (
    <MarkdownTooltip
      {...tooltipProps}
      followCursor={false}
      disableHoverListener
      hoverIntent={hoverIntent}
      slotProps={tooltipSlotProps ? { popper: popperSlotProps, tooltip: tooltipSlotProps } : { popper: popperSlotProps }}
      // Close while scrolling to avoid stale placement after scroll.
      open={!disabled && open && !scrolling}
    >
      <Box
        ref={(el) => { ref.current = el as HTMLElement | null }}
        component={wrap === 'block' ? 'div' : 'span'}
        sx={{ display: wrap === 'block' ? 'block' : 'inline-flex', minWidth: 0, width: wrap === 'block' ? '100%' : undefined }}
        onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
          if (disabled) return
          const root = e.currentTarget as HTMLElement
          clearHoverTimer()
          if (!hasEllipsisOverflow(root, selector)) {
            setOpen(false)
            return
          }
          hoverTimerRef.current = window.setTimeout(() => {
            hoverTimerRef.current = null
            // Re-measure after the delay so dynamic labels don't show stale tooltips.
            setOpen(hasEllipsisOverflow(root, selector))
          }, resolvedEnterDelay)
        }}
        onMouseLeave={() => {
          clearHoverTimer()
          setOpen(false)
        }}
      >
        {children}
      </Box>
    </MarkdownTooltip>
  )
}

export default EllipsisTooltip
/**
 * EllipsisTooltip
 *
 * Utility component that shows a tooltip with full text when the child
 * content is ellipsized (overflow hidden).
 */
