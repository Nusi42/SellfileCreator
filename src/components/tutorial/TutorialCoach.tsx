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
}: {
  open: boolean
  steps: TutorialStep[]
  stepIndex: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
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

  // Resolve and track the target rect for highlighting
  React.useEffect(() => {
    if (!open) return
    if (step?.before) {
      try { step.before() } catch {}
    }
    const sel = step?.targetId ? `[data-tour-id="${step.targetId}"]` : null
    const findEl = () => {
      const raw = sel ? (document.querySelector(sel) as HTMLElement | null) : null
      if (!raw) return null
      if (step?.targetId === 'metasets.dialog') {
        const dlg = raw.closest('[role="dialog"]') as HTMLElement | null
        if (dlg) return dlg
      }
      return raw
    }
    const compute = () => {
      try {
        const el = findEl()
        const rRaw = el?.getBoundingClientRect() ?? null
        const newRect = rRaw ? new DOMRect(rRaw.x, rRaw.y, rRaw.width, rRaw.height) : null
        // If the previous highlight vanishes or jumps significantly (or target changes),
        // render a short-lived fading ghost to smooth the transition.
        const prevRect = prevRectRef.current
        const prevTarget = prevTargetIdRef.current
        const curTarget = step?.targetId
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
      const el = findEl()
      el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    } catch {}
    const onResize = () => compute()
    const onScroll = () => compute()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, { passive: true })
    const id = window.setInterval(compute, 250)
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onScroll); window.clearInterval(id); window.clearTimeout(t) }
  }, [open, step, step?.id, step?.targetId])

  // Render body with inline UI keyword coloring for text wrapped in backticks
  const renderBody = React.useCallback((text?: string) => {
    if (!text) return null
    const parts = String(text).split('`')
    return parts.map((p, i) => (
      i % 2 === 1
        ? <Box key={i} component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>{p}</Box>
        : <Box key={i} component="span">{p}</Box>
    ))
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
          <Typography variant="subtitle2" color="primary">{step?.title || 'Step'}</Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{renderBody(step?.body)}</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button size="small" color="success" variant="contained" onClick={onClose}>Exit tutorial</Button>
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
