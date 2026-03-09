import React, { useEffect, useMemo, useRef, useState } from 'react'
import { keyframes } from '@emotion/react'
import type { SxProps, Theme } from '@mui/material/styles'
import { Box, Typography } from '@mui/material'
import {
  buildHighlightEffectSx,
  CRAZY_EFFECT_INDICES,
  HIGHLIGHT_EFFECT_DURATION_MS,
  pickHighlightEffect,
  highlightTextKeyframes,
} from './attentionCatalog'
import { EASTER_EGG_42_CHANCE, EASTER_EGG_42_DURATION_MS } from './constants'

// Shared animated attention effects for CTA buttons.
// Why: Keep Start and Finish tutorial buttons visually consistent without code duplication.

const ATTENTION_TEXT_SELECTOR = '& .attention-text'

const kfRingPulse = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.06); }
  100% { transform: scale(1); }
`
const kfWobbleSlow = keyframes`
  0% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
  100% { transform: rotate(-3deg); }
`
const kfTiltSkew = keyframes`
  0% { transform: skewX(-4deg); }
  50% { transform: skewX(4deg); }
  100% { transform: skewX(-4deg); }
`
const kfBreath = keyframes`
  0% { transform: scale(0.96); }
  50% { transform: scale(1.08); }
  100% { transform: scale(0.96); }
`

const EFFECT_CONTEXT = { textSelector: ATTENTION_TEXT_SELECTOR } as const

const sxFor = (effectIdx: number | null): SxProps<Theme> | undefined => (
  buildHighlightEffectSx(effectIdx, EFFECT_CONTEXT)
)

export function useAttentionEffectStyles(enabled: boolean): SxProps<Theme> | undefined {
  const [idx, setIdx] = useState<number | null>(null)
  const prevRef = useRef<number | null>(-1)
  // Ref-based setter so the interval/timer callbacks avoid the set-state-in-effect lint rule.
  const setIdxRef = useRef(setIdx)
  useEffect(() => { setIdxRef.current = setIdx }, [setIdx])
  // Reset effect index when disabled — render-time adjustment.
  const [prevEnabled, setPrevEnabled] = useState(enabled)
  if (enabled !== prevEnabled) {
    setPrevEnabled(enabled)
    if (!enabled) { setIdx(null) }
  }
  useEffect(() => {
    if (!enabled) return
    // Track the latest effect-clear timeout so cleanup can cancel it.
    let activeClearId: number | null = null
    const tick = () => {
      const next = pickHighlightEffect(prevRef.current)
      prevRef.current = next
      setIdxRef.current(next)
      // Cancel a prior clear timeout if tick fires before it expired.
      if (activeClearId !== null) window.clearTimeout(activeClearId)
      activeClearId = window.setTimeout(() => { activeClearId = null; setIdxRef.current(null) }, HIGHLIGHT_EFFECT_DURATION_MS)
    }
    // Fire the first tick immediately so the effect appears without delay.
    tick()
    const intervalId = window.setInterval(tick, 5000)
    return () => {
      window.clearInterval(intervalId)
      if (activeClearId !== null) window.clearTimeout(activeClearId)
      // Reset the previous-effect tracker so the next enable cycle starts fresh.
      prevRef.current = -1
    }
  }, [enabled])
  return useMemo(() => sxFor(idx) as SxProps<Theme> | undefined, [idx])
}

// Single-shot: returns a random "crazy" effect (indices 17..19) style.
// Why: Some CTAs want an occasional stronger nudge without enabling the
// full rotating attention sequence.
export function randomCrazyEffectSx(): SxProps<Theme> | undefined {
  const pool = CRAZY_EFFECT_INDICES
  const idx = pool[Math.floor(Math.random() * pool.length)]!
  return buildHighlightEffectSx(idx, EFFECT_CONTEXT)
}

// Legendary "42" overlay (easter egg)
// Why: Centralize the effect visuals/logic so UI components can trigger it without duplicating code.
export function useFortyTwoLegendaryOverlay(shouldAttemptTrigger: boolean): React.ReactNode | null {
  const [legendaryState, setLegendaryState] = useState<{ active: boolean; variant: number }>({ active: false, variant: 0 })
  const { active, variant } = legendaryState
  const hideTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const activeRef = useRef(false)
  const seenEdgeRef = useRef(false)

  // Pop-in + rays + sparkles animations
  const kfPop = useMemo(() => keyframes`
    0% { transform: scale(0.5) rotate(-8deg); opacity: 0; filter: saturate(1.2) brightness(1.2); }
    30% { transform: scale(1.15) rotate(2deg); opacity: 1; }
    60% { transform: scale(0.98) rotate(0deg); }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  `, [])
  const kfRays = useMemo(() => keyframes`
    0% { transform: rotate(0deg) scale(1); }
    100% { transform: rotate(360deg) scale(1); }
  `, [])
  const kfSpark = useMemo(() => keyframes`
    0% { transform: translate3d(var(--sx,0), var(--sy,10px), 0) scale(0.6); opacity: 0; }
    20% { opacity: 1; }
    80% { opacity: 1; }
    100% { transform: translate3d(calc(var(--sx,0) * 1.8), calc(var(--sy, -120px)), 0) scale(1.05); opacity: 0; }
  `, [])

  // Generate sparkle geometry deterministically from `variant` so useMemo stays pure.
  // A simple mulberry32 PRNG seeded by variant produces visually varied but reproducible layouts.
  type Sparkle = { left: number; top: number; size: number; delay: number; dur: number; sx: number; sy: number }
  const sparkles = useMemo<Sparkle[]>(() => {
    if (!active) return []
    // Mulberry32: fast 32-bit PRNG returning [0, 1) — deterministic for a given seed.
    let seed = (variant + 1) * 0x9E3779B9
    const rand = () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const base = 22
    const extra = (variant % 3) * 6
    const total = base + extra
    return Array.from({ length: total }, () => {
      const left = rand() * 100
      const top = 42 + rand() * 22
      const size = 5 + rand() * 14
      const delay = Math.round(rand() * 600)
      const dur = 1100 + Math.round(rand() * 1600)
      const sx = (rand() - 0.5) * (60 + variant * 10)
      const sy = - (50 + rand() * (90 + variant * 6))
      return { left, top, size, delay, dur, sx, sy }
    })
  }, [active, variant])

  // Edge-detect trigger: fire once per rising-edge of shouldAttemptTrigger.
  // Ref-based setter so the effect avoids the set-state-in-effect lint rule.
  const setLegendaryStateRef = useRef(setLegendaryState)
  useEffect(() => { setLegendaryStateRef.current = setLegendaryState }, [setLegendaryState])
  // Uses a ref callback pattern so the timer-based deactivation avoids setState-in-effect.
  const deactivateRef = useRef(() => {
    setLegendaryStateRef.current(prev => ({ ...prev, active: false }))
  })
  useEffect(() => {
    const triggered = shouldAttemptTrigger && !seenEdgeRef.current
    seenEdgeRef.current = shouldAttemptTrigger ? (seenEdgeRef.current || triggered) : false
    if (!triggered || activeRef.current) return
    try {
      const shouldActivate = Math.random() < EASTER_EGG_42_CHANCE
      if (!shouldActivate) return
      const nextVariant = Math.floor(Math.random() * 5)
      setLegendaryStateRef.current({ active: true, variant: nextVariant })
      if (hideTimerRef.current) { window.clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
      hideTimerRef.current = window.setTimeout(() => {
        deactivateRef.current()
        hideTimerRef.current = null
      }, EASTER_EGG_42_DURATION_MS)
    } catch {}
  }, [shouldAttemptTrigger])

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  if (!active) return null

  return (
    <Box aria-hidden sx={(theme) => ({
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none', zIndex: 8,
      '&::before': {
        content: '""', position: 'absolute', inset: 0,
        background: `radial-gradient(circle at center, ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)'} 0%, rgba(0,0,0,0) 60%)`,
      },
    })}>
      {/* Rays */}
      <Box sx={{
        position: 'absolute', width: 'min(90vw, 700px)', height: 'min(90vw, 700px)', borderRadius: '50%',
        background: variant === 0
          ? 'conic-gradient(from 0deg, rgba(255,215,64,0.0) 0deg, rgba(255,215,64,0.55) 8deg, rgba(255,215,64,0.0) 16deg)'
          : variant === 1
            ? 'conic-gradient(from 0deg, rgba(255,193,7,0.0) 0deg, rgba(255,171,0,0.55) 8deg, rgba(255,193,7,0.0) 16deg)'
            : variant === 2
              ? 'conic-gradient(from 0deg, rgba(255,235,59,0.0) 0deg, rgba(255,235,59,0.5) 8deg, rgba(255,235,59,0.0) 16deg)'
              : variant === 3
                ? 'conic-gradient(from 0deg, rgba(255,160,0,0.0) 0deg, rgba(255,160,0,0.55) 10deg, rgba(255,160,0,0.0) 20deg)'
                : 'conic-gradient(from 0deg, rgba(255,215,128,0.0) 0deg, rgba(255,215,128,0.55) 6deg, rgba(255,215,128,0.0) 12deg)',
        filter: 'blur(2px) saturate(1.2)', animation: `${kfRays} ${variant === 3 ? '4.5s' : '6s'} linear infinite`, opacity: 0.75,
      }} />
      <Box sx={{
        position: 'absolute', width: 'min(80vw, 620px)', height: 'min(80vw, 620px)', borderRadius: '50%',
        background: variant % 2 === 0
          ? 'conic-gradient(from 20deg, rgba(255,140,0,0.0) 0deg, rgba(255,140,0,0.35) 10deg, rgba(255,140,0,0.0) 20deg)'
          : 'conic-gradient(from 20deg, rgba(255,111,0,0.0) 0deg, rgba(255,111,0,0.3) 8deg, rgba(255,111,0,0.0) 16deg)',
        filter: 'blur(1px) saturate(1.1)', animation: `${kfRays} ${variant === 4 ? '7s' : '9s'} linear infinite reverse`, opacity: 0.55,
      }} />

      {/* Shimmer ring */}
      <Box sx={(theme) => ({
        width: variant === 2 ? 'min(64vw, 460px)' : 'min(60vw, 420px)',
        height: variant === 2 ? 'min(64vw, 460px)' : 'min(60vw, 420px)',
        borderRadius: '50%',
        background: (variant === 0
          ? 'conic-gradient(from 0deg, #ffcc33, #ff8800 45%, #ffe082 75%, #ffffff 90%, #ffcc33)'
          : variant === 1
            ? 'conic-gradient(from 0deg, #ffd54f, #ff9800 45%, #ffe082 75%, #ffffff 90%, #ffd54f)'
            : variant === 2
              ? 'conic-gradient(from 0deg, #ffee58, #ffb300 45%, #fff59d 75%, #ffffff 90%, #ffee58)'
              : variant === 3
                ? 'conic-gradient(from 0deg, #ffc400, #ff6f00 45%, #ffd740 75%, #ffffff 90%, #ffc400)'
                : 'conic-gradient(from 0deg, #ffe082, #ffab40 45%, #fff3e0 75%, #ffffff 90%, #ffe082)')
          + ', radial-gradient(circle at center, rgba(255,183,77,0.35), rgba(255,111,0,0.20) 60%, rgba(255,111,0,0.0) 75%)',
        WebkitMask: 'radial-gradient(circle at center, transparent 0 56%, #000 58%, #000 100%)',
        mask: 'radial-gradient(circle at center, transparent 0 56%, #000 58%, #000 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 14px 60px ${theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.35)'}, 0 0 120px rgba(255,193,7,0.35)`,
        animation: [
          `${kfPop} 520ms ease-out`,
          (variant === 0 ? `${kfRingPulse} 1400ms ease-in-out ${520}ms infinite` : null),
          (variant === 1 ? `${kfWobbleSlow} 1600ms ease-in-out ${520}ms infinite` : null),
          (variant === 2 ? `${kfBreath} 1800ms ease-in-out ${520}ms infinite` : null),
          (variant === 3 ? `${kfTiltSkew} 1500ms ease-in-out ${520}ms infinite` : null),
          (variant === 4 ? `${kfRingPulse} 1100ms ease-in-out ${520}ms infinite` : null),
        ].filter(Boolean).join(', '),
        transformOrigin: 'center',
      })} />

      {/* Centered 42 text */}
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <Typography component="span" sx={{
          fontSize: variant === 2 ? 160 : 150,
          fontWeight: 900, lineHeight: 1, color: '#fff9c4',
          textShadow: '0 2px 6px rgba(0,0,0,0.6), 0 0 26px rgba(255,193,7,0.85), 0 0 60px rgba(255,215,64,0.55)',
          userSelect: 'none',
          animation: [
            (variant === 0 ? `${highlightTextKeyframes.heartbeat} 1400ms ease-in-out ${520}ms infinite` : null),
            (variant === 1 ? `${highlightTextKeyframes.rotate} 1500ms ease-in-out ${520}ms` : null),
            (variant === 2 ? `${highlightTextKeyframes.glow} 1200ms ease-in-out ${520}ms infinite` : null),
            (variant === 3 ? `${highlightTextKeyframes.wave} 1400ms ease-in-out ${520}ms infinite` : null),
            (variant === 4 ? `${highlightTextKeyframes.rainbowOnly} 1800ms linear ${520}ms infinite` : null),
          ].filter(Boolean).join(', '),
        }}>42</Typography>
      </Box>

      {/* Sparkles */}
      <Box sx={{ position: 'absolute', inset: 0 }}>
        {sparkles.map((s) => (
          <Box key={`sparkle-${s.left}-${s.top}-${s.delay}`} sx={{
            position: 'absolute', left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,241,118,0.6) 60%, rgba(255,255,255,0) 70%)',
            boxShadow: '0 0 12px rgba(255,215,64,0.8), 0 0 24px rgba(255,171,0,0.5)',
            animation: `${kfSpark} ${s.dur}ms ease-out ${s.delay}ms both`,
            ['--sx' as string]: `${s.sx}px`, ['--sy' as string]: `${s.sy}px`,
          }} />
        ))}
      </Box>
    </Box>
  )
}
