import React, { useEffect, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { useScrollingFlag } from '../hooks/useScrollingFlag'
import MarkdownTooltip from './MarkdownTooltip'
import { MARKDOWN_TOOLTIP_ENTER_DELAY_MS } from '../lib/constants'

export function EllipsisTooltip({
  title,
  children,
  selector,
  disabled,
  wrap = 'inline',
  // Default to the global tooltip portal so overflow helpers never enlarge their scroll parents.
  disablePortal = false,
  maxWidth,
}: {
  title: React.ReactNode | string
  children: React.ReactNode
  selector?: string
  disabled?: boolean
  wrap?: 'inline' | 'block'
  disablePortal?: boolean
  maxWidth?: number | string
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  // Mirror MarkdownTooltip’s hover delay so overflow tooltips don’t pop instantly.
  const hoverTimerRef = useRef<number | null>(null)
  const scrolling = useScrollingFlag()
  const pickTarget = (root: HTMLElement): HTMLElement => {
    let target: HTMLElement | null = null
    if (selector) target = root.querySelector(selector)
    if (!target) target = root.querySelector('[data-ellipsis-target]') as HTMLElement | null
    if (!target) {
      const all = Array.from(root.querySelectorAll<HTMLElement>('*'))
      target = all.find(el => {
        const s = getComputedStyle(el)
        return (s.textOverflow === 'ellipsis' && (s.overflow === 'hidden' || s.overflowX === 'hidden') && s.whiteSpace === 'nowrap')
      }) || null
    }
    return target || root
  }
  const measure = (rootEl?: HTMLElement): boolean => {
    try {
      const root = (rootEl || ref.current) as HTMLElement | null
      if (!root) { return false }
      const target = pickTarget(root)
      // Ensure element is laid out
      const rect = target.getBoundingClientRect()
      if ((rect.width || 0) <= 0) { return false }
      const cs = getComputedStyle(target)
      const isEllipsisStyle = (cs.overflow === 'hidden' || cs.overflowX === 'hidden') && cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap'
      const rectW = Math.floor(target.getBoundingClientRect().width || 0)
      const scrollW = Math.floor(target.scrollWidth || 0)
      const over = isEllipsisStyle && scrollW > 0 && rectW + 2 < scrollW
      return over
    } catch { return false }
  }
  const popperSlotProps = { disablePortal }
  const tooltipSlotProps = maxWidth != null ? { sx: { maxWidth } } : null
  const tooltipProps = typeof title === 'string'
    ? { markdown: title }
    : { render: title }

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
          if (!measure(root)) {
            setOpen(false)
            return
          }
          hoverTimerRef.current = window.setTimeout(() => {
            hoverTimerRef.current = null
            // Re-measure after the delay so dynamic labels don't show stale tooltips.
            setOpen(measure(root))
          }, MARKDOWN_TOOLTIP_ENTER_DELAY_MS)
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
