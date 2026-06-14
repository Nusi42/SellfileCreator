/**
 * ClippedScrollBody
 *
 * Caps its content to a max height and signals that more content exists beyond the fold.
 *
 * Two modes (chosen by `overflowY`):
 *  - 'hidden' (default — hover tooltips that must not steal the wheel): clip-only. A single
 *    bottom fade gradient + trailing "…" cue marks the clipped overflow. The fade end-color
 *    is theme-aware via `fadeColorVar` so it blends into the host surface (menu paper vs.
 *    dark MUI tooltip).
 *  - 'auto' (persistent popovers): an inner box actually scrolls, wrapped by a non-scrolling
 *    relative container that carries top AND bottom "scroll shadow" fades. Each fade shows
 *    only when there is hidden content in that direction (driven by a scroll listener), so
 *    the user always sees whether scrolling up/down will reveal more.
 */
import React from 'react'
import { Box, Typography } from '@mui/material'

export function ClippedScrollBody({
  maxHeightPx,
  children,
  // CSS channel variable name for the overflow-fade gradient end color.
  // Defaults to background.paper (correct for menu/popover surfaces).
  // Pass '--mui-palette-grey-700' when rendering inside a MUI Tooltip.
  fadeColorVar = '--mui-palette-background-paper',
  // Clip-only by default (tooltips); pass 'auto' for a scrollable popover body.
  overflowY = 'hidden',
}: {
  maxHeightPx: number
  children: React.ReactNode
  fadeColorVar?: string
  overflowY?: 'hidden' | 'auto'
}) {
  const scrollable = overflowY === 'auto'
  return scrollable
    ? (
      <ScrollShadowBody maxHeightPx={maxHeightPx} fadeColorVar={fadeColorVar}>
        {children}
      </ScrollShadowBody>
    )
    : (
      <ClipFadeBody maxHeightPx={maxHeightPx} fadeColorVar={fadeColorVar}>
        {children}
      </ClipFadeBody>
    )
}

/** Clip-only mode: bottom fade + "…" cue, pinned to the (non-scrolling) padding box. */
function ClipFadeBody({
  maxHeightPx,
  fadeColorVar,
  children,
}: {
  maxHeightPx: number
  fadeColorVar: string
  children: React.ReactNode
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [showOverflowCue, setShowOverflowCue] = React.useState(false)
  // Ref-based setter so the ResizeObserver callback avoids the set-state-in-effect lint rule.
  const setShowOverflowCueRef = React.useRef(setShowOverflowCue)
  React.useEffect(() => { setShowOverflowCueRef.current = setShowOverflowCue }, [setShowOverflowCue])
  // Mount-only ResizeObserver; re-measurement is driven by DOM size changes.
  React.useEffect(() => {
    const node = containerRef.current
    if (!node) return undefined
    const measure = () => {
      const nextOverflow = node.scrollHeight > node.clientHeight + 1
      setShowOverflowCueRef.current((prev) => (prev === nextOverflow ? prev : nextOverflow))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => { measure() })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return (
    <Box
      ref={containerRef}
      sx={(theme) => ({
        position: 'relative',
        maxHeight: maxHeightPx,
        overflowY: 'hidden',
        overflowX: 'hidden',
        ...(showOverflowCue
          ? {
            '&::after': {
              content: '""',
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: theme.spacing(7),
              background: `linear-gradient(to bottom, rgba(var(${fadeColorVar}Channel) / 0) 0%, rgba(var(${fadeColorVar}Channel) / 0.85) 55%, rgba(var(${fadeColorVar}Channel) / 1) 100%)`,
              pointerEvents: 'none',
            },
          }
          : {}),
      })}
    >
      {children}
      {showOverflowCue ? (
        <Typography
          variant="caption"
          component="span"
          sx={{
            position: 'absolute',
            right: 8,
            bottom: 4,
            lineHeight: 1,
            fontSize: '0.95rem',
            opacity: 0.8,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          ...
        </Typography>
      ) : null}
    </Box>
  )
}

/** Scroll mode: real scroll box wrapped by a relative container carrying top+bottom fades. */
function ScrollShadowBody({
  maxHeightPx,
  fadeColorVar,
  children,
}: {
  maxHeightPx: number
  fadeColorVar: string
  children: React.ReactNode
}) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  // Which directions still hide content. Both fades hidden = nothing to scroll.
  const [edges, setEdges] = React.useState({ top: false, bottom: false })
  // Ref setter keeps the scroll/resize callbacks out of the set-state-in-effect lint rule.
  const setEdgesRef = React.useRef(setEdges)
  React.useEffect(() => { setEdgesRef.current = setEdges }, [setEdges])
  React.useEffect(() => {
    const node = scrollRef.current
    if (!node) return undefined
    const measure = () => {
      // 1px slack absorbs sub-pixel rounding so a fully-scrolled edge reads as "no more".
      const top = node.scrollTop > 1
      const bottom = node.scrollTop + node.clientHeight < node.scrollHeight - 1
      setEdgesRef.current((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }))
    }
    measure()
    node.addEventListener('scroll', measure, { passive: true })
    let observer: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => { measure() })
      observer.observe(node)
    }
    return () => {
      node.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [])
  // Shared gradient builder so the top fade is just the bottom fade flipped.
  const fade = (dir: 'top' | 'bottom') => ({
    content: '""' as const,
    position: 'absolute' as const,
    left: 0,
    right: 0,
    [dir]: 0,
    height: 28,
    background: `linear-gradient(to ${dir === 'top' ? 'bottom' : 'top'}, rgba(var(${fadeColorVar}Channel) / 1) 0%, rgba(var(${fadeColorVar}Channel) / 0.85) 45%, rgba(var(${fadeColorVar}Channel) / 0) 100%)`,
    pointerEvents: 'none' as const,
    zIndex: 1,
  })
  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        ref={scrollRef}
        sx={{
          maxHeight: maxHeightPx,
          overflowY: 'auto',
          overflowX: 'hidden',
          // Keep a thin, always-visible scrollbar as a second affordance alongside the fades.
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': { width: 8 },
          '&::-webkit-scrollbar-thumb': {
            borderRadius: 4,
            backgroundColor: 'rgba(var(--mui-palette-text-primaryChannel) / 0.25)',
          },
        }}
      >
        {children}
      </Box>
      {/* Edge fades sit on the non-scrolling wrapper so they stay pinned to the viewport. */}
      {edges.top ? <Box sx={fade('top')} /> : null}
      {edges.bottom ? <Box sx={fade('bottom')} /> : null}
    </Box>
  )
}

export default ClippedScrollBody
