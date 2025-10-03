import React, { useRef, useState } from 'react'
import { Box, Tooltip } from '@mui/material'
import { useScrollingFlag } from '../hooks/useScrollingFlag'

export function EllipsisTooltip({
  title,
  children,
  selector,
  disabled,
  wrap = 'inline',
  disablePortal = true,
  maxWidth,
}: {
  title: React.ReactNode
  children: React.ReactNode
  selector?: string
  disabled?: boolean
  wrap?: 'inline' | 'block'
  disablePortal?: boolean
  maxWidth?: number | string
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
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
  return (
    <Tooltip
      title={title}
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
          const root = e.currentTarget as HTMLElement
          const over = measure(root)
          setOpen(over)
        }}
        onMouseLeave={() => setOpen(false)}
      >
        {children}
      </Box>
    </Tooltip>
  )
}

export default EllipsisTooltip
/**
 * EllipsisTooltip
 *
 * Utility component that shows a tooltip with full text when the child
 * content is ellipsized (overflow hidden).
 */
