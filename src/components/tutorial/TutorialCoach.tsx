import React from 'react'
import { createPortal } from 'react-dom'
import { Box, Button, Paper, Typography, Stack } from '@mui/material'
import { keyframes } from '@emotion/react'
import { useAttentionEffectStyles } from '../../lib/attentionEffects'

export type TutorialStep = {
  id: string
  title: string
  body: string
  // data-tour-id of the element to highlight
  targetId?: string
  // Optional: highlight multiple elements at once; a single rectangle will
  // cover the union of all target rects. When both targetId and targetIds are
  // provided, targetIds wins.
  targetIds?: string[]
  // Optional action to run before showing this step (sets up state)
  before?: () => void
}

export function TutorialCoach({
  open,
  steps,
  stepIndex,
  onClose,
  onPrev,
  onNext,
  onSkipTo,
  skipToIndex,
}: {
  open: boolean
  steps: TutorialStep[]
  stepIndex: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onSkipTo?: (index: number) => void
  skipToIndex?: number | null
}) {
  const step = steps[stepIndex]
  const [rect, setRect] = React.useState<DOMRect | null>(null)
  const isLast = stepIndex === steps.length - 1
  const finishEffectSx = useAttentionEffectStyles(open && isLast)
  const prevRectRef = React.useRef<DOMRect | null>(null)
  const prevTargetIdRef = React.useRef<string | undefined>(undefined)
  const [ghost, setGhost] = React.useState<DOMRect | null>(null)
  const ghostTimerRef = React.useRef<number | null>(null)
  const fadeOut = keyframes`
    0% { opacity: 1; }
    100% { opacity: 0; }
  `
  // Subtle heartbeat for branded app name: scales up slightly, then back.
  const brandBeat = keyframes`
    0% { transform: scaleX(1) scaleY(1); }
    35% { transform: scaleX(1.005) scaleY(1.04); }
    70% { transform: scaleX(1) scaleY(1); }
    100% { transform: scaleX(1.005) scaleY(1.04); }
  `

  // Resolve and track the target rect for highlighting
  React.useEffect(() => {
    if (!open) return
    if (step?.before) {
      try { step.before() } catch {}
    }
    const sels: string[] | null = Array.isArray(step?.targetIds)
      ? (step?.targetIds ?? []).map(id => `[data-tour-id="${id}"]`)
      : (step?.targetId ? [`[data-tour-id="${step.targetId}"]`] : null)
    const findEls = (): HTMLElement[] => {
      if (!sels || sels.length === 0) return []
      const out: HTMLElement[] = []
      for (const s of sels) {
        const raw = document.querySelector(s) as HTMLElement | null
        if (!raw) continue
        if (s.includes('metasets.dialog')) {
          const dlg = raw.closest('[role="dialog"]') as HTMLElement | null
          out.push((dlg || raw))
        } else {
          out.push(raw)
        }
      }
      return out
    }
    const compute = () => {
      try {
        const els = findEls()
        let newRect: DOMRect | null = null
        for (const el of els) {
          const r = el.getBoundingClientRect()
          const d = new DOMRect(r.x, r.y, r.width, r.height)
          if (!newRect) newRect = new DOMRect(d.x, d.y, d.width, d.height)
          else {
            const left = Math.min(newRect.left, d.left)
            const top = Math.min(newRect.top, d.top)
            const right = Math.max(newRect.right, d.right)
            const bottom = Math.max(newRect.bottom, d.bottom)
            newRect = new DOMRect(left, top, right - left, bottom - top)
          }
        }
        // If the previous highlight vanishes or jumps significantly (or target changes),
        // render a short-lived fading ghost to smooth the transition.
        const prevRect = prevRectRef.current
        const prevTarget = prevTargetIdRef.current
        const curTarget = (Array.isArray(step?.targetIds) && step?.targetIds?.length)
          ? step?.targetIds?.join(',')
          : step?.targetId
        const moved = (() => {
          if (!prevRect || !newRect) return Boolean(prevRect && !newRect)
          const dx = Math.abs(prevRect.left - newRect.left)
          const dy = Math.abs(prevRect.top - newRect.top)
          return dx > 6 || dy > 6
        })()
        if (prevRect && (moved || prevTarget !== curTarget || !newRect)) {
          setGhost(prevRect)
          if (ghostTimerRef.current) { window.clearTimeout(ghostTimerRef.current); ghostTimerRef.current = null }
          ghostTimerRef.current = window.setTimeout(() => { setGhost(null); ghostTimerRef.current = null }, 180)
        }
        setRect(newRect)
        prevRectRef.current = newRect
        prevTargetIdRef.current = curTarget
      } catch { setRect(null) }
    }
    compute()
    // Recompute after mount/layout frames
    try { requestAnimationFrame(() => requestAnimationFrame(() => compute())) } catch {}
    // And a short timer to catch async popovers/menus
    const t = window.setTimeout(compute, 80)
    // Always try to bring the target into view smoothly
    try {
      const els = findEls()
      els[0]?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    } catch {}
    const onResize = () => compute()
    const onScroll = () => compute()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, { passive: true })
    const id = window.setInterval(compute, 250)
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onScroll); window.clearInterval(id); window.clearTimeout(t) }
  }, [open, step, step?.id, step?.targetId, step?.targetIds])

  // Render body with inline styling:
  // - Text wrapped in backticks `word` renders as blue UI keywords.
  // - Text wrapped in double tildes ~~word~~ renders as brand/emphasis (gold, subtle glow).
  const renderBody = React.useCallback((text?: string) => {
    if (!text) return null
    // First split by ~~ for brand segments, then within non-brand segments split by backticks for UI keywords
    const BRAND = '~~'
    const parts = String(text).split(BRAND)
    return parts.map((seg, idx) => {
      const isBrand = idx % 2 === 1
      if (isBrand) {
        return (
          <Box
            key={`b-${idx}`}
            component="span"
            sx={{
              color: 'warning.main',
              fontWeight: 800,
              display: 'inline-block',
              willChange: 'transform',
              animation: `${brandBeat} 1400ms ease-in-out infinite`,
              transformOrigin: '50% 65%',
            }}
          >
            {seg}
          </Box>
        )
      }
      // Non-brand: process backtick UI keywords
      const ticks = seg.split('`')
      return ticks.map((p, i) => (
        i % 2 === 1
          ? <Box key={`k-${idx}-${i}`} component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>{p}</Box>
          : <Box key={`t-${idx}-${i}`} component="span">{p}</Box>
      ))
    })
  }, [])

  if (!open) return null

  // Render into body to avoid clipping within panels
  return createPortal(
    <Box
      aria-label="Interactive Tutorial"
      sx={{
        position: 'fixed', inset: 0, zIndex: 2000,
        pointerEvents: 'auto', // block clicks to app while tutorial runs
      }}
    >
      {/* Darken everything except the highlighted rect */}
      {rect ? (
        <>
          <Box sx={{ position: 'absolute', left: 0, top: 0, right: 0, height: `${Math.max(0, rect.top)}px`, bgcolor: 'rgba(0,0,0,0.5)' }} />
          <Box sx={{ position: 'absolute', left: 0, top: `${rect.top}px`, width: `${Math.max(0, rect.left)}px`, height: `${rect.height}px`, bgcolor: 'rgba(0,0,0,0.5)' }} />
          <Box sx={{ position: 'absolute', left: `${rect.right}px`, top: `${rect.top}px`, right: 0, height: `${rect.height}px`, bgcolor: 'rgba(0,0,0,0.5)' }} />
          <Box sx={{ position: 'absolute', left: 0, top: `${rect.bottom}px`, right: 0, bottom: 0, bgcolor: 'rgba(0,0,0,0.5)' }} />
        </>
      ) : (
        <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.5)' }} />
      )}

      {/* Highlight box over target (if any) */}
      {rect && (
        <Box
          sx={{
            position: 'absolute',
            left: `${Math.max(8, rect.left - 6)}px`,
            top: `${Math.max(8, rect.top - 6)}px`,
            width: `${rect.width + 12}px`,
            height: `${rect.height + 12}px`,
            border: '2px solid #FFEB3B',
            borderRadius: '6px',
            pointerEvents: 'none',
          }}
        />
      )}
      {/* Fading ghost of the previous highlight to smooth transitions */}
      {(!rect && ghost) && (
        <Box
          sx={{
            position: 'absolute',
            left: `${Math.max(8, ghost.left - 6)}px`,
            top: `${Math.max(8, ghost.top - 6)}px`,
            width: `${ghost.width + 12}px`,
            height: `${ghost.height + 12}px`,
            border: '2px solid #FFEB3B',
            borderRadius: '6px',
            pointerEvents: 'none',
            animation: `${fadeOut} 180ms ease-out forwards`,
          }}
        />
      )}

      {/* Tooltip panel */}
      <Paper
        elevation={6}
        sx={{
          position: 'fixed',
          left: '50%',
          bottom: 24,
          transform: 'translateX(-50%)',
          width: { xs: 'calc(100vw - 32px)', sm: 720 },
          maxWidth: '96vw',
          pointerEvents: 'auto',
          p: 2,
        }}
      >
        <Stack spacing={1.25}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="subtitle2" color="primary">{step?.title || 'Step'}</Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ ml: 'auto' }}
              aria-label={`Step ${stepIndex + 1} of ${steps.length}`}
            >
              {`${stepIndex + 1} of ${steps.length}`}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{renderBody(step?.body)}</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button size="small" color="success" variant="contained" onClick={onClose}>Exit tutorial</Button>
              {typeof skipToIndex === 'number' && skipToIndex > stepIndex && (
                <Button
                  size="small"
                  color="info"
                  variant="outlined"
                  onClick={() => { onSkipTo?.(skipToIndex) }}
                >Skip Basics</Button>
              )}
            </Box>
            <Box>
              <Button size="small" onClick={onPrev} disabled={stepIndex === 0} sx={{ mr: 1 }}>Back</Button>
              <Button size="small" variant="contained" onClick={onNext} sx={finishEffectSx ?? {}}>
                {isLast ? (<Box component="span" className="attention-text">Finish</Box>) : 'Next'}
              </Button>
            </Box>
          </Box>
        </Stack>
      </Paper>
    </Box>,
    document.body,
  )
}
