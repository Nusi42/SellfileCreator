import React from 'react'
import { createPortal } from 'react-dom'
import { Box, Button, Paper, Typography, Stack, Breadcrumbs } from '@mui/material'
import { keyframes } from '@emotion/react'
import { FONT_SIZE_SECONDARY_REM, FONT_SIZE_BASE_REM } from '../../lib/constants'
import { useAttentionEffectStyles } from '../../lib/attentionEffects'
import { useI18n } from '../../lib/i18n'

const HIGHLIGHT_SETTLE_DELAY_MS = 260
const PANEL_MOVE_ANIM_MS = 220
const NAV_UNLOCK_PADDING_MS = 40
const RECT_EPSILON_PX = 0.5
// Safety ceiling: force-unlock nav if the settle timer is repeatedly reset (e.g. cascading
// re-renders from a large state reset on tutorial open). 1.5 s gives enough room for the
// initial layout to stabilise without leaving the user with a permanently disabled Next button.
const NAV_LOCK_MAX_MS = 1500
const BREADCRUMB_MIN_WIDTH_PX = 240

const cloneRect = (source: DOMRect): DOMRect => new DOMRect(source.left, source.top, source.width, source.height)

const rectChanged = (prev: DOMRect | null, next: DOMRect | null): boolean => {
  if (!prev && !next) return false
  if (!prev || !next) return true
  return (
    Math.abs(prev.left - next.left) > RECT_EPSILON_PX ||
    Math.abs(prev.top - next.top) > RECT_EPSILON_PX ||
    Math.abs(prev.width - next.width) > RECT_EPSILON_PX ||
    Math.abs(prev.height - next.height) > RECT_EPSILON_PX
  )
}

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
  // Optional: extra padding around the union rectangle to ensure portal menus
  // and shadows are fully visible when explained in the step copy.
  expand?: number
}

export function TutorialCoach({
  open,
  steps,
  stepIndex,
  onClose,
  onPrev,
  onNext,
  onSkipTo,
  sections,
}: {
  open: boolean
  steps: TutorialStep[]
  stepIndex: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onSkipTo?: (index: number) => void
  sections?: Array<{ label: string; index: number }>
}) {
  const { t } = useI18n()
  const step = steps[stepIndex]
  const [rect, setRect] = React.useState<DOMRect | null>(null)
  // Tooltip panel placement: default bottom; move to top when it would cover the target.
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const [panelPlacement, setPanelPlacement] = React.useState<'bottom' | 'top'>('bottom')
  // FLIP-style animation values when the panel repositions.
  const [animDx, setAnimDx] = React.useState(0)
  const [animDy, setAnimDy] = React.useState(0)
  const [animActive, setAnimActive] = React.useState(false)
  const [flipHidden, setFlipHidden] = React.useState(false)
  const justOpenedRef = React.useRef(false)
  const [targetRects, setTargetRects] = React.useState<DOMRect[]>([])

  // Ref-based setters so timer/rAF/event callbacks inside effects avoid the set-state-in-effect lint rule.
  const setRectRef = React.useRef(setRect)
  React.useEffect(() => { setRectRef.current = setRect }, [setRect])
  const setTargetRectsRef = React.useRef(setTargetRects)
  React.useEffect(() => { setTargetRectsRef.current = setTargetRects }, [setTargetRects])
  const setGhostRef = React.useRef<React.Dispatch<React.SetStateAction<DOMRect | null>>>((() => {}) as unknown as React.Dispatch<React.SetStateAction<DOMRect | null>>)
  const setPanelPlacementRef = React.useRef(setPanelPlacement)
  React.useEffect(() => { setPanelPlacementRef.current = setPanelPlacement }, [setPanelPlacement])
  const setAnimDxRef = React.useRef(setAnimDx)
  React.useEffect(() => { setAnimDxRef.current = setAnimDx }, [setAnimDx])
  const setAnimDyRef = React.useRef(setAnimDy)
  React.useEffect(() => { setAnimDyRef.current = setAnimDy }, [setAnimDy])
  const setAnimActiveRef = React.useRef(setAnimActive)
  React.useEffect(() => { setAnimActiveRef.current = setAnimActive }, [setAnimActive])
  const setFlipHiddenRef = React.useRef(setFlipHidden)
  React.useEffect(() => { setFlipHiddenRef.current = setFlipHidden }, [setFlipHidden])
  const setNavLockedRef = React.useRef<React.Dispatch<React.SetStateAction<boolean>>>((() => {}) as unknown as React.Dispatch<React.SetStateAction<boolean>>)
  const setPlacementRequestTickRef = React.useRef<React.Dispatch<React.SetStateAction<number>>>((() => {}) as unknown as React.Dispatch<React.SetStateAction<number>>)

  // Track first open to disable initial animation.
  React.useEffect(() => {
    if (open) {
      justOpenedRef.current = true
    } else {
      justOpenedRef.current = false
    }
  }, [open])
  const isLast = stepIndex === steps.length - 1
  const finishEffectSx = useAttentionEffectStyles(open && isLast)
  const prevRectRef = React.useRef<DOMRect | null>(null)
  const prevTargetIdRef = React.useRef<string | undefined>(undefined)
  const [ghost, setGhost] = React.useState<DOMRect | null>(null)
  // Sync ghost ref now that setGhost is declared.
  React.useEffect(() => { setGhostRef.current = setGhost }, [setGhost])
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

  const pulseTint = keyframes`
    0% { opacity: 0.6; }
    60% { opacity: 1; }
    100% { opacity: 0.6; }
  `

  // Emoji rise for breadcrumb feedback when skipping sections forward/backward
  const emojiRise = keyframes`
    0% { transform: translateY(0); opacity: 1; }
    100% { transform: translateY(-14px); opacity: 0; }
  `
  const [sectionFeedback, setSectionFeedback] = React.useState<null | { i: number; mood: 'happy' | 'sad' }>(null)
  const [navLocked, setNavLocked] = React.useState(false)
  // Sync navLocked ref now that setNavLocked is declared.
  React.useEffect(() => { setNavLockedRef.current = setNavLocked }, [setNavLocked])
  const highlightSettleTimerRef = React.useRef<number | null>(null)
  const flipAnimTimerRef = React.useRef<number | null>(null)
  const panelUnlockTimerRef = React.useRef<number | null>(null)
  // Ceiling timer ref: clears itself and force-unlocks nav after NAV_LOCK_MAX_MS.
  const navLockCeilingTimerRef = React.useRef<number | null>(null)
  const pendingPlacementRef = React.useRef<null | { target: DOMRect; animate: boolean }>(null)
  const [placementRequestTick, setPlacementRequestTick] = React.useState(0)
  // Sync placementRequestTick ref now that setPlacementRequestTick is declared.
  React.useEffect(() => { setPlacementRequestTickRef.current = setPlacementRequestTick }, [setPlacementRequestTick])
  const latestRectRef = React.useRef<DOMRect | null>(null)
  const processedRectRef = React.useRef<DOMRect | null>(null)
  const settleRectRef = React.useRef<DOMRect | null>(null)

  React.useEffect(() => {
    latestRectRef.current = rect
  }, [rect])

  React.useEffect(() => {
    if (!open) return
    if (step?.before) {
      try {
        step.before()
      } catch {}
    }
    const sels: string[] | null = Array.isArray(step?.targetIds)
      ? (step?.targetIds ?? []).map(id => `[data-tour-id="${id}"]`)
      : (step?.targetId ? [`[data-tour-id="${step.targetId}"]`] : null)
    const findEls = (): HTMLElement[] => {
      if (!sels || sels.length === 0) return []
      const out: HTMLElement[] = []
      for (const s of sels) {
        // querySelectorAll so duplicate tour-ids (same button in two panels, one
        // hidden via display:none) don't silently return the hidden one first.
        const candidates = Array.from(document.querySelectorAll(s)) as HTMLElement[]
        const raw = candidates.find((el) => {
          try { const r = el.getBoundingClientRect(); return r.width > 0 || r.height > 0 } catch { return false }
        }) ?? candidates[0] ?? null
        if (!raw) continue
        if (s.includes('metasets.dialog')) {
          const dlg = raw.closest('[role="dialog"]') as HTMLElement | null
          out.push((dlg || raw))
        } else {
          // Heuristic: MUI Menu root is a full-viewport container. If a matched
          // element appears to span most of the viewport and contains an inner
          // Paper/UL, highlight that inner surface instead.
          try {
            const r = raw.getBoundingClientRect()
            const isNearFullscreen = r.width > window.innerWidth * 0.8 && r.height > window.innerHeight * 0.8
            if (isNearFullscreen) {
              const paper = raw.querySelector('.MuiPaper-root') as HTMLElement | null
              const ul = raw.querySelector('ul[role="menu"]') as HTMLElement | null
              out.push((paper || ul || raw))
            } else {
              out.push(raw)
            }
          } catch {
            out.push(raw)
          }
        }
      }
      return out
    }
    const compute = () => {
      try {
        const els = findEls()
        let newRect: DOMRect | null = null
        const rects: DOMRect[] = []
        for (const el of els) {
          const r = el.getBoundingClientRect()
          const d = new DOMRect(r.x, r.y, r.width, r.height)
          rects.push(new DOMRect(d.x, d.y, d.width, d.height))
          if (!newRect) newRect = new DOMRect(d.x, d.y, d.width, d.height)
          else {
            const left = Math.min(newRect.left, d.left)
            const top = Math.min(newRect.top, d.top)
            const right = Math.max(newRect.right, d.right)
            const bottom = Math.max(newRect.bottom, d.bottom)
            newRect = new DOMRect(left, top, right - left, bottom - top)
          }
        }
        setTargetRectsRef.current(rects)
        // Expand the rectangle slightly when focusing menus so the hole does not
        // clip the menu surface or its shadow. Prefer an explicit per-step
        // expand value; otherwise apply a small heuristic when any target is a menu.
        if (newRect) {
          const hasMenuTarget = Array.isArray(step?.targetIds)
            ? step?.targetIds?.some(id => id.includes('.menu'))
            : (step?.targetId ? step.targetId.includes('.menu') : false)
          const expandPx = Math.max(0, (typeof step?.expand === 'number' ? step!.expand! : (hasMenuTarget ? 10 : 0)))
          if (expandPx > 0) {
            const left = Math.max(0, newRect.left - expandPx)
            const top = Math.max(0, newRect.top - expandPx)
            const right = newRect.right + expandPx
            const bottom = newRect.bottom + expandPx
            newRect = new DOMRect(left, top, right - left, bottom - top)
          }
        }
        // If the previous highlight vanishes or jumps significantly (or target changes),
        // render a short-lived fading ghost to soften the transition.
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
          setGhostRef.current(prevRect)
          if (ghostTimerRef.current) { window.clearTimeout(ghostTimerRef.current); ghostTimerRef.current = null }
          ghostTimerRef.current = window.setTimeout(() => { setGhostRef.current(null); ghostTimerRef.current = null }, 180)
        }
        setRectRef.current(newRect)
        prevRectRef.current = newRect
        prevTargetIdRef.current = curTarget
      } catch {
        setRectRef.current(null)
        setTargetRectsRef.current([])
      }
    }
    compute()
    // Recompute after mount/layout frames
    try { requestAnimationFrame(() => requestAnimationFrame(() => compute())) } catch {}
    // And a short timer to catch async popovers/menus
    const t = window.setTimeout(compute, 80)
	    // Always try to bring the target into view smoothly.
	    // Why: tutorial targets often live inside scrollable panels, and a smooth scroll helps the user track context.
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
  // Adjust navLocked and clear refs at render time when open/stepIndex changes.
  const openStepKey = `${open}|${stepIndex}`
  const [prevOpenStepKey, setPrevOpenStepKey] = React.useState(openStepKey)
  if (openStepKey !== prevOpenStepKey) {
    setPrevOpenStepKey(openStepKey)
    setNavLocked(open)
  }
  // Reset placement/rect refs when open or step changes; deferred to layout so render stays pure.
  React.useLayoutEffect(() => {
    if (!open) {
      pendingPlacementRef.current = null
      processedRectRef.current = null
      settleRectRef.current = null
    } else {
      processedRectRef.current = null
      settleRectRef.current = null
    }
  }, [open, stepIndex])
  // Timer management for open/stepIndex transitions must stay in an effect.
  React.useEffect(() => {
    if (!open) {
      // Cancel all pending timers when the tutorial closes.
      if (highlightSettleTimerRef.current !== null) { window.clearTimeout(highlightSettleTimerRef.current); highlightSettleTimerRef.current = null }
      if (flipAnimTimerRef.current !== null) { window.clearTimeout(flipAnimTimerRef.current); flipAnimTimerRef.current = null }
      if (panelUnlockTimerRef.current !== null) { window.clearTimeout(panelUnlockTimerRef.current); panelUnlockTimerRef.current = null }
      if (navLockCeilingTimerRef.current !== null) { window.clearTimeout(navLockCeilingTimerRef.current); navLockCeilingTimerRef.current = null }
      return
    }
    // Arm the ceiling timer: if the settle mechanism has not fired within NAV_LOCK_MAX_MS
    // (e.g. because cascading re-renders keep resetting it), force-unlock so the button
    // is never permanently stuck disabled for the user.
    if (navLockCeilingTimerRef.current !== null) { window.clearTimeout(navLockCeilingTimerRef.current) }
    navLockCeilingTimerRef.current = window.setTimeout(() => {
      navLockCeilingTimerRef.current = null
      setNavLockedRef.current(false)
    }, NAV_LOCK_MAX_MS)
  }, [open, stepIndex])

  React.useEffect(() => () => {
    if (highlightSettleTimerRef.current !== null) { window.clearTimeout(highlightSettleTimerRef.current); highlightSettleTimerRef.current = null }
    if (panelUnlockTimerRef.current !== null) { window.clearTimeout(panelUnlockTimerRef.current); panelUnlockTimerRef.current = null }
  }, [])

  // Clear the highlight settle timer when navLocked transitions to false — render-time comparison.
  const [prevNavLocked, setPrevNavLocked] = React.useState(navLocked)
  if (navLocked !== prevNavLocked) {
    setPrevNavLocked(navLocked)
  }
  // Cancel settle timer when navLocked transitions to false; deferred to layout so render stays pure.
  React.useLayoutEffect(() => {
    if (!navLocked && highlightSettleTimerRef.current !== null) {
      window.clearTimeout(highlightSettleTimerRef.current)
      highlightSettleTimerRef.current = null
    }
  }, [navLocked])

  // Stable callback that handles rect/settle logic; reads volatile state from refs.
  const openRef = React.useRef(open)
  React.useLayoutEffect(() => { openRef.current = open })
  const rectRef = React.useRef(rect)
  React.useLayoutEffect(() => { rectRef.current = rect })
  const navLockedRef = React.useRef(navLocked)
  React.useLayoutEffect(() => { navLockedRef.current = navLocked })
  const processRectChange = React.useCallback(() => {
    if (!openRef.current) return
    const currentRect = rectRef.current
    const locked = navLockedRef.current
    if (!currentRect) {
      settleRectRef.current = null
      if (locked) {
        if (highlightSettleTimerRef.current !== null) { window.clearTimeout(highlightSettleTimerRef.current) }
        highlightSettleTimerRef.current = window.setTimeout(() => {
          highlightSettleTimerRef.current = null
          if (panelUnlockTimerRef.current !== null) { window.clearTimeout(panelUnlockTimerRef.current); panelUnlockTimerRef.current = null }
          panelUnlockTimerRef.current = window.setTimeout(() => {
            panelUnlockTimerRef.current = null
            // Cancel ceiling timer — the normal settle mechanism got here first.
            if (navLockCeilingTimerRef.current !== null) { window.clearTimeout(navLockCeilingTimerRef.current); navLockCeilingTimerRef.current = null }
            setNavLockedRef.current(false)
          }, NAV_UNLOCK_PADDING_MS)
        }, HIGHLIGHT_SETTLE_DELAY_MS)
      }
      return
    }
    const nextRect = cloneRect(currentRect)
    if (!rectChanged(processedRectRef.current, nextRect)) return
    if (locked) {
      const lastSettleRect = settleRectRef.current
      if (highlightSettleTimerRef.current !== null && !rectChanged(lastSettleRect, nextRect)) {
        return
      }
      if (highlightSettleTimerRef.current !== null) { window.clearTimeout(highlightSettleTimerRef.current) }
      highlightSettleTimerRef.current = window.setTimeout(() => {
        highlightSettleTimerRef.current = null
        const latest = latestRectRef.current
        if (!latest) {
          if (panelUnlockTimerRef.current !== null) { window.clearTimeout(panelUnlockTimerRef.current); panelUnlockTimerRef.current = null }
          panelUnlockTimerRef.current = window.setTimeout(() => {
            panelUnlockTimerRef.current = null
            // Cancel ceiling timer — the normal settle mechanism got here first.
            if (navLockCeilingTimerRef.current !== null) { window.clearTimeout(navLockCeilingTimerRef.current); navLockCeilingTimerRef.current = null }
            setNavLockedRef.current(false)
          }, NAV_UNLOCK_PADDING_MS)
          return
        }
        pendingPlacementRef.current = { target: cloneRect(latest), animate: true }
        setPlacementRequestTickRef.current(t => t + 1)
      }, HIGHLIGHT_SETTLE_DELAY_MS)
      settleRectRef.current = cloneRect(nextRect)
    } else {
      pendingPlacementRef.current = { target: nextRect, animate: false }
      setPlacementRequestTickRef.current(t => t + 1)
      settleRectRef.current = null
    }
  }, [])
  // Trigger the rect processing when any of the inputs change.
  React.useEffect(() => {
    processRectChange()
  }, [processRectChange, open, rect, navLocked])

  React.useLayoutEffect(() => {
    if (!open) return
    const pending = pendingPlacementRef.current
    if (!pending) return
    pendingPlacementRef.current = null
    const target = pending.target
    processedRectRef.current = cloneRect(target)

    const panel = panelRef.current
    const prevPlacement = panelPlacement
    let nextPlacement: 'bottom' | 'top'
    let prevPanelRect: DOMRect | null = null
    try {
      if (panel) {
        const raw = panel.getBoundingClientRect()
        prevPanelRect = new DOMRect(raw.left, raw.top, raw.width, raw.height)
        const height = raw.height
        const width = raw.width
        const margin = 24
        const left = Math.max(0, Math.round((window.innerWidth - width) / 2))
        const bottomTop = Math.max(0, window.innerHeight - height - margin)
        const topTop = margin
        const bottomRect = new DOMRect(left, bottomTop, width, height)
        const topRect = new DOMRect(left, topTop, width, height)
        const overlapArea = (a: DOMRect, b: DOMRect): number => {
          const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
          const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
          return xOverlap * yOverlap
        }
        const areaBottom = overlapArea(bottomRect, target)
        const areaTop = overlapArea(topRect, target)
        const spaceAbove = Math.max(0, target.top - margin)
        const spaceBelow = Math.max(0, window.innerHeight - target.bottom - margin)
        const fitsTop = spaceAbove >= height
        const fitsBottom = spaceBelow >= height

        const prevBottom = prevPanelRect ? prevPanelRect.bottom : null
        const prevTop = prevPanelRect ? prevPanelRect.top : null
        const targetBottom = target.bottom
        const targetTop = target.top
        const bottomClear = typeof prevTop === 'number' ? prevTop >= targetBottom + margin : false
        const topClear = typeof prevBottom === 'number' ? prevBottom <= targetTop - margin : false

        if (prevPlacement === 'bottom' && bottomClear) {
          nextPlacement = 'bottom'
        } else if (prevPlacement === 'top' && topClear) {
          nextPlacement = 'top'
        } else if (!fitsBottom && fitsTop) {
          nextPlacement = 'top'
        } else if (!fitsTop && fitsBottom) {
          nextPlacement = 'bottom'
        } else if (spaceAbove > spaceBelow + 32) {
          nextPlacement = 'top'
        } else if (spaceBelow > spaceAbove + 32) {
          nextPlacement = 'bottom'
        } else {
          nextPlacement = (areaTop < areaBottom ? 'top' : 'bottom')
        }
      } else {
        nextPlacement = 'bottom'
      }
    } catch {
      nextPlacement = 'bottom'
    }
    const placementChanged = prevPlacement !== nextPlacement
    const shouldAnimate = pending.animate && placementChanged && !justOpenedRef.current && Boolean(panel && prevPanelRect)

    if (!panel || !placementChanged || !shouldAnimate) {
      justOpenedRef.current = false
      setFlipHiddenRef.current(false)
      if (placementChanged) {
        setAnimActiveRef.current(false)
        setAnimDxRef.current(0)
        setAnimDyRef.current(0)
        setPanelPlacementRef.current(nextPlacement)
      }
    } else {
      justOpenedRef.current = false
      setFlipHiddenRef.current(true)
      setPanelPlacementRef.current(nextPlacement)
      const prevRect = prevPanelRect
      requestAnimationFrame(() => {
        try {
          const el = panelRef.current
          if (!el || !prevRect) { setFlipHiddenRef.current(false); return }
          const newRaw = el.getBoundingClientRect()
          const newRect = new DOMRect(newRaw.left, newRaw.top, newRaw.width, newRaw.height)
          const dx = (prevRect.left + prevRect.width / 2) - (newRect.left + newRect.width / 2)
          const dy = (prevRect.top + prevRect.height / 2) - (newRect.top + newRect.height / 2)
          setAnimActiveRef.current(false)
          setAnimDxRef.current(dx)
          setAnimDyRef.current(dy)
          requestAnimationFrame(() => {
            setFlipHiddenRef.current(false)
            setAnimActiveRef.current(true)
            setAnimDxRef.current(0)
            setAnimDyRef.current(0)
            // Track the animation-end timer so cleanup can cancel it.
            if (flipAnimTimerRef.current !== null) window.clearTimeout(flipAnimTimerRef.current)
            flipAnimTimerRef.current = window.setTimeout(() => { flipAnimTimerRef.current = null; setAnimActiveRef.current(false) }, PANEL_MOVE_ANIM_MS)
          })
        } catch {
          setFlipHiddenRef.current(false)
        }
      })
    }

    if (pending.animate) {
      const unlockDelay = (shouldAnimate ? PANEL_MOVE_ANIM_MS : 0) + NAV_UNLOCK_PADDING_MS
      if (panelUnlockTimerRef.current !== null) { window.clearTimeout(panelUnlockTimerRef.current) }
      panelUnlockTimerRef.current = window.setTimeout(() => {
        panelUnlockTimerRef.current = null
        // Cancel ceiling timer — the normal settle mechanism got here first.
        if (navLockCeilingTimerRef.current !== null) { window.clearTimeout(navLockCeilingTimerRef.current); navLockCeilingTimerRef.current = null }
        setNavLockedRef.current(false)
      }, unlockDelay)
    }
  }, [open, placementRequestTick, panelPlacement])

  // Render body with inline styling:
  // - Text wrapped in backticks `word` renders as blue UI keywords.
  // - Text wrapped in double tildes ~~word~~ renders as brand/emphasis (gold, subtle glow).
  const renderBody = React.useCallback((text?: string) => {
    if (!text) return null
    // First split by ~~ for brand segments, then within non-brand segments split by backticks for UI keywords
    const BRAND = '~~'
    const parts = String(text).split(BRAND)
    // Content-derived keys at each split level avoid passing .map()
    // index into key props (satisfies no-array-index-key).
    // Running counter across all split levels ensures unique keys even when
    // the same text fragment (e.g. ", ") appears multiple times.
    let seq = 0
    return parts.map((seg, brandIdx) => {
      const isBrand = brandIdx % 2 === 1
      if (isBrand) {
        return (
          <Box
            key={`b-${seq++}`}
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
      // Non-brand: split by ^^ for error/red segments, then within plain segments split by backticks
      const caretParts = seg.split('^^')
      return caretParts.map((caretSeg, caretIdx) => {
        if (caretIdx % 2 === 1) {
          return <Box key={`e-${seq++}`} component="span" sx={{ color: 'error.main', fontWeight: 600 }}>{caretSeg}</Box>
        }
        const ticks = caretSeg.split('`')
        return ticks.map((p, tickIdx) => (
          tickIdx % 2 === 1
            ? <Box key={`k-${seq++}`} component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>{p}</Box>
            : <Box key={`t-${seq++}`} component="span">{p}</Box>
        ))
      })
    })
  }, [brandBeat])

  const handlePrev = React.useCallback(() => {
    if (navLocked || stepIndex === 0) return
    setNavLocked(true)
    try { onPrev() } catch { onPrev() }
  }, [navLocked, onPrev, stepIndex])

  const handleNext = React.useCallback(() => {
    if (navLocked) return
    setNavLocked(true)
    try { onNext() } catch { onNext() }
  }, [navLocked, onNext])

  const handleSkipTo = React.useCallback((index: number) => {
    if (navLocked || !onSkipTo) return
    setNavLocked(true)
    try { onSkipTo(index) } catch { onSkipTo(index) }
  }, [navLocked, onSkipTo])

  const shouldPulseTargets = React.useMemo(() => {
    if (!rect) return false
    if (targetRects.length <= 1) return false
    const unionArea = Math.max(0, rect.width) * Math.max(0, rect.height)
    if (unionArea <= 0) return false
    const totalTargetArea = targetRects.reduce((sum, r) => sum + Math.max(0, r.width) * Math.max(0, r.height), 0)
    return totalTargetArea > 0 && totalTargetArea < unionArea * 0.5
  }, [rect, targetRects])

  if (!open) return null

  // Compute breadcrumb items outside JSX to avoid an IIFE inside JSX.
  // curIdx: the section whose range contains the current stepIndex.
  const breadcrumbCurIdx = sections
    ? sections.findIndex((s, i) => stepIndex >= s.index && (i === sections.length - 1 || stepIndex < sections[i + 1]!.index))
    : -1
  const breadcrumbItems = sections
    ? sections.map((s, i) => {
        const isCurrent = i === breadcrumbCurIdx
        const showEmoji = Boolean(sectionFeedback && sectionFeedback.i === i)
        const emoji = showEmoji ? (sectionFeedback!.mood === 'happy' ? '👍' : '🙁') : null
        if (isCurrent) {
          return (
            <Box key={s.label} sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <Button
                size="small"
                variant="text"
                color="primary"
                aria-current="step"
                onClick={() => {
                  // Jump to the start of this section without emoji feedback
                  handleSkipTo(s.index)
                }}
                disabled={navLocked || !onSkipTo}
                sx={{ minWidth: 0, px: 0.5, py: 0, fontSize: `${FONT_SIZE_SECONDARY_REM}rem`, textTransform: 'none', fontWeight: 700 }}
              >
                {s.label}
              </Button>
              {/* No emoji when clicking current section intentionally */}
            </Box>
          )
        }
        return (
          <Box key={s.label} sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <Button
              size="small"
              variant="text"
              color="inherit"
              onClick={() => {
                if (navLocked || !onSkipTo) return
                // Animate feedback on the section we are leaving, then jump immediately
                try {
                  const mood: 'happy' | 'sad' = (i < breadcrumbCurIdx ? 'happy' : 'sad')
                  setSectionFeedback({ i: breadcrumbCurIdx, mood })
                  handleSkipTo(s.index)
                  window.setTimeout(() => { setSectionFeedback(null) }, 900)
                } catch {
                  handleSkipTo(s.index)
                }
              }}
              disabled={navLocked || !onSkipTo}
              sx={{ minWidth: 0, px: 0.5, py: 0, fontSize: `${FONT_SIZE_SECONDARY_REM}rem`, textTransform: 'none' }}
            >
              {s.label}
            </Button>
            {showEmoji && (
              <Box aria-hidden sx={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: '0.6em', pointerEvents: 'none', animation: `${emojiRise} 700ms ease-out forwards`, fontSize: `${FONT_SIZE_BASE_REM}rem` }}>{emoji}</Box>
            )}
          </Box>
        )
      })
    : null

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

      {/* Emphasize individual targets when the union rectangle is much larger */}
      {shouldPulseTargets && targetRects.map((subRect) => (
        <Box
          key={`target-${subRect.left}-${subRect.top}-${subRect.width}`}
          sx={{
            position: 'absolute',
            left: `${Math.max(0, subRect.left)}px`,
            top: `${Math.max(0, subRect.top)}px`,
            width: `${Math.max(0, subRect.width)}px`,
            height: `${Math.max(0, subRect.height)}px`,
            bgcolor: 'rgba(255, 235, 59, 0.22)',
            borderRadius: '4px',
            pointerEvents: 'none',
            animation: `${pulseTint} 1600ms ease-in-out infinite`,
          }}
        />
      ))}

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
      {/* Fading ghost of the previous highlight to soften transitions */}
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
          ...(panelPlacement === 'bottom' ? { bottom: 24 } : { top: 24 }),
          transform: 'translateX(-50%) translate3d(' + animDx + 'px, ' + animDy + 'px, 0)',
          transition: animActive ? 'transform 220ms ease-out' : 'none',
          willChange: 'transform',
          opacity: flipHidden ? 0 : 1,
          width: { xs: 'calc(100vw - 32px)', sm: 860 },
          maxWidth: '96vw',
          pointerEvents: 'auto',
          p: 2,
        }}
        ref={panelRef}
      >
        <Stack spacing={1.25}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="subtitle2" color="primary">{step?.title || t('tutorialStep')}</Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ ml: 'auto' }}
              aria-label={`${t('tutorialStep')} ${stepIndex + 1} of ${steps.length}`}
            >
              {`${stepIndex + 1} of ${steps.length}`}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{renderBody(step?.body)}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', columnGap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button size="small" color="success" variant="contained" onClick={onClose}>{t('tutorialExit')}</Button>
            </Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: { xs: `min(${BREADCRUMB_MIN_WIDTH_PX}px, 100%)`, sm: `${BREADCRUMB_MIN_WIDTH_PX}px` },
              }}
            >
              {!!sections && sections.length > 0 && (
                <Breadcrumbs separator="›" maxItems={sections.length} sx={{ '& .MuiBreadcrumbs-ol': { alignItems: 'center' } }}>
                  {breadcrumbItems}
                </Breadcrumbs>
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <Button size="small" onClick={handlePrev} disabled={stepIndex === 0 || navLocked} sx={{ mr: 1 }}>{t('tutorialBack')}</Button>
              <Button size="small" variant="contained" onClick={handleNext} disabled={navLocked} sx={finishEffectSx ?? {}}>
                {isLast ? (<Box component="span" className="attention-text">{t('tutorialFinish')}</Box>) : t('tutorialNext')}
              </Button>
            </Box>
          </Box>
        </Stack>
      </Paper>
    </Box>,
    document.body,
  )
}
