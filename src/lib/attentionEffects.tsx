import React, { useEffect, useMemo, useRef, useState } from 'react'
import { keyframes } from '@emotion/react'
import type { SxProps, Theme } from '@mui/material/styles'
import { Box, Typography } from '@mui/material'
import { EASTER_EGG_42_CHANCE, EASTER_EGG_42_DURATION_MS } from './constants'

// Shared animated attention effects for CTA buttons.
// Why: Keep Start and Finish tutorial buttons visually consistent without code duplication.

// Subtle/general effects (0..9)
const kfGlow = keyframes`
  0% { box-shadow: 0 0 0px 0 rgba(3,169,244,0), 0 0 0px 0 rgba(3,169,244,0); }
  30% { box-shadow: 0 0 12px 2px rgba(3,169,244,0.55), 0 0 0px 0 rgba(3,169,244,0); }
  100% { box-shadow: 0 0 0px 0 rgba(3,169,244,0), 0 0 0px 0 rgba(3,169,244,0); }
`
const kfRing = keyframes`
  0% { outline: 0px solid rgba(255,235,59,0); }
  35% { outline: 4px solid rgba(255,235,59,0.6); }
  100% { outline: 0px solid rgba(255,235,59,0); }
`
const kfSweep = keyframes`
  0% { background-image: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0) 100%); background-size: 200% 100%; background-position: -100% 0; }
  60% { background-position: 100% 0; }
  100% { background-position: 100% 0; }
`
const kfPulse = keyframes`
  0% { transform: translateZ(0) scale(1); filter: saturate(1); }
  35% { transform: translateZ(0) scale(1.04); filter: saturate(1.15); }
  100% { transform: translateZ(0) scale(1); filter: saturate(1); }
`
const kfTextWobble = keyframes`
  0% { letter-spacing: 0; transform: translateZ(0); }
  30% { letter-spacing: 1px; transform: translateY(-1px) rotate(-0.5deg); }
  60% { letter-spacing: -0.5px; transform: translateY(1px) rotate(0.5deg); }
  100% { letter-spacing: 0; transform: translateZ(0); }
`
const kfExplode = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
  30% { box-shadow: 0 0 18px 6px rgba(76, 175, 80, 0.6); }
  100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
`
const kfCrumble = keyframes`
  0% { filter: none; transform: translateZ(0); }
  40% { filter: contrast(1.15) saturate(1.1); transform: translateY(1px) rotate(-0.3deg); }
  100% { filter: none; transform: translateZ(0); }
`
const kfBouncePop = keyframes`
  0% { transform: scale(1); }
  40% { transform: scale(1.12); }
  70% { transform: scale(0.98); }
  100% { transform: scale(1); }
`
const kfRainbowFlash = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(0,0,0,0); filter: hue-rotate(0deg) saturate(1); }
  30% { box-shadow: 0 0 16px 6px rgba(255,255,255,0.6); filter: hue-rotate(180deg) saturate(1.6); }
  100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); filter: hue-rotate(360deg) saturate(1); }
`
const kfShakeBlast = keyframes`
  0% { transform: translate(0,0) rotate(0deg); }
  25% { transform: translate(-1px, 1px) rotate(-1deg); }
  50% { transform: translate(1px, -1px) rotate(1deg); }
  75% { transform: translate(-1px, 0px) rotate(-1deg); }
  100% { transform: translate(0,0) rotate(0deg); }
`

// Text-focused effects (10..16, 20..26)
const kfTextHeartbeat = keyframes`
  0% { transform: scale(1); }
  25% { transform: scale(1.10); }
  50% { transform: scale(1.0); }
  75% { transform: scale(1.08); }
  100% { transform: scale(1); }
`
const kfTextRainbow = keyframes`
  0% { filter: hue-rotate(0deg) saturate(1.0); }
  100% { filter: hue-rotate(360deg) saturate(1.4); }
`
const kfTextBackflip = keyframes`
  0% { transform: rotateY(0deg); }
  100% { transform: rotateY(360deg); }
`
const kfTextRotate = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`
const kfTextWave = keyframes`
  0% { letter-spacing: 0; }
  50% { letter-spacing: 1.2px; }
  100% { letter-spacing: 0; }
`
const kfTextGlow = keyframes`
  0% { text-shadow: 0 0 0px rgba(255,255,255,0); }
  50% { text-shadow: 0 0 8px rgba(255,255,255,0.8); }
  100% { text-shadow: 0 0 0px rgba(255,255,255,0); }
`
const kfTextSlideSkew = keyframes`
  0% { transform: translateX(0) skewX(0deg); }
  50% { transform: translateX(2px) skewX(4deg); }
  100% { transform: translateX(0) skewX(0deg); }
`
const kfTextSlideOnly = keyframes`
  0% { transform: translateX(0); }
  50% { transform: translateX(6px); }
  100% { transform: translateX(0); }
`
const kfTextFlipYBack = keyframes`
  0% { transform: rotateY(0deg); }
  100% { transform: rotateY(180deg); }
`
const kfTextHoverLift = keyframes`
  0% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
  100% { transform: translateY(0); }
`
const kfTextSpinSmall = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(180deg); }
`
const kfTextRainbowOnly = keyframes`
  0% { filter: hue-rotate(0deg) saturate(1.0); }
  100% { filter: hue-rotate(360deg) saturate(1.6); }
`
const kfTextWaveSkew = keyframes`
  0% { letter-spacing: 0; transform: skewX(0deg); }
  50% { letter-spacing: 1px; transform: skewX(6deg); }
  100% { letter-spacing: 0; transform: skewX(0deg); }
`
const kfButtonSlide = keyframes`
  0% { transform: translateX(0); }
  50% { transform: translateX(8px); }
  100% { transform: translateX(0); }
`
const kfTextCatchUp = keyframes`
  0% { transform: translateX(0); }
  50% { transform: translateX(4px); }
  100% { transform: translateX(0); }
`

// Crazy (17..19)
const kfCrazySpinZoom = keyframes`
  0% { transform: rotate(0deg) scale(1); }
  50% { transform: rotate(540deg) scale(1.2); }
  100% { transform: rotate(720deg) scale(1); }
`
const kfCrazyWobble = keyframes`
  0% { transform: rotate(0deg) translate(0,0); }
  25% { transform: rotate(-6deg) translate(-2px,1px); }
  50% { transform: rotate(6deg) translate(2px,-1px); }
  75% { transform: rotate(-4deg) translate(-1px,0px); }
  100% { transform: rotate(0deg) translate(0,0); }
`
const kfCrazyBurst = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
  40% { box-shadow: 0 0 24px 10px rgba(255,255,255,0.75); }
  100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
`

// Overlay motion variants
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

function pickEffect(prev: number | null): number {
  const variants = 27
  const subtlePool = [0,1,2,3,4,5,6,7,8,9]
  const textPool = [10,11,12,13,14,15,16,20,21,22,23,24,25,26]
  const crazyPool = [17,18,19]
  const r = Math.random()
  const pool = r < 0.20 ? crazyPool : (r < 0.50 ? textPool : subtlePool)
  let next = pool[Math.floor(Math.random() * pool.length)]!
  if (prev !== null && next === prev) next = (next + 1) % variants
  return next
}

function sxFor(effectIdx: number | null): SxProps<Theme> | undefined {
  switch (effectIdx ?? -1) {
    case 0: return { animation: `${kfGlow} 900ms ease-out` }
    case 1: return { animation: `${kfRing} 950ms ease-out` }
    case 2: return { position: 'relative', overflow: 'hidden', '&::after': { content: '""', position: 'absolute', inset: 0, animation: `${kfSweep} 1000ms ease-out`, pointerEvents: 'none' } }
    case 3: return { animation: `${kfPulse} 800ms ease-out` }
    case 4: return { '& .attention-text': { animation: `${kfTextWobble} 900ms ease-out` } }
    case 5: return { animation: `${kfExplode} 850ms ease-out` }
    case 6: return { animation: `${kfCrumble} 900ms ease-out` }
    case 7: return { animation: `${kfBouncePop} 900ms cubic-bezier(.2,1.2,.2,1)` }
    case 8: return { animation: `${kfRainbowFlash} 950ms ease-out` }
    case 9: return { animation: `${kfShakeBlast} 800ms ease-in-out` }
    case 10: return { '& .attention-text': { display: 'inline-block', animation: `${kfTextHeartbeat} 900ms ease-in-out` } }
    case 11: return { '& .attention-text': { display: 'inline-block', animation: `${kfTextRainbow} 1000ms linear` } }
    case 12: return { '& .attention-text': { display: 'inline-block', animation: `${kfTextBackflip} 900ms ease-in-out`, transformStyle: 'preserve-3d' } }
    case 13: return { '& .attention-text': { display: 'inline-block', animation: `${kfTextRotate} 950ms ease-in-out` } }
    case 14: return { '& .attention-text': { display: 'inline-block', animation: `${kfTextWave} 850ms ease-in-out` } }
    case 15: return { '& .attention-text': { display: 'inline-block', animation: `${kfTextGlow} 900ms ease-out` } }
    case 16: return { '& .attention-text': { display: 'inline-block', animation: `${kfTextSlideSkew} 900ms ease-in-out` } }
    case 17: return { animation: `${kfCrazySpinZoom} 1000ms ease-in-out` }
    case 18: return { animation: `${kfCrazyWobble} 950ms ease-in-out` }
    case 19: return { animation: `${kfCrazyBurst} 900ms ease-out` }
    case 20: return { '& .attention-text': { display: 'inline-block', animation: `${kfTextSlideOnly} 850ms ease-in-out` } }
    case 21: return { '& .attention-text': { display: 'inline-block', transformStyle: 'preserve-3d', animation: `${kfTextFlipYBack} 900ms ease-in-out` } }
    case 22: return { '& .attention-text': { display: 'inline-block', animation: `${kfTextHoverLift} 900ms ease-in-out` } }
    case 23: return { '& .attention-text': { display: 'inline-block', animation: `${kfTextSpinSmall} 900ms ease-in-out` } }
    case 24: return { '& .attention-text': { display: 'inline-block', animation: `${kfTextRainbowOnly} 1000ms linear` } }
    case 25: return { '& .attention-text': { display: 'inline-block', animation: `${kfTextWaveSkew} 950ms ease-in-out` } }
    case 26: return { animation: `${kfButtonSlide} 950ms ease-in-out`, '& .attention-text': { display: 'inline-block', animation: `${kfTextCatchUp} 950ms ease-in-out` } }
    default: return undefined
  }
}

export function useAttentionEffectStyles(enabled: boolean): SxProps<Theme> | undefined {
  const [idx, setIdx] = useState<number | null>(null)
  const prevRef = useRef<number | null>(-1)
  useEffect(() => {
    if (!enabled) return
    const tick = (): number => {
      const next = pickEffect(prevRef.current)
      prevRef.current = next
      setIdx(next)
      const clearId: number = window.setTimeout(() => setIdx(null), 1200)
      return clearId
    }
    const intervalId = window.setInterval(() => { const clearId = tick(); window.setTimeout(() => window.clearTimeout(clearId), 0) }, 5000)
    const firstClearId = tick()
    return () => { window.clearInterval(intervalId); window.clearTimeout(firstClearId) }
  }, [enabled])
  return useMemo(() => sxFor(idx) as SxProps<Theme> | undefined, [idx])
}

// Single-shot: returns a random "crazy" effect (indices 17..19) style.
// Why: Some CTAs want an occasional stronger nudge without enabling the
// full rotating attention sequence.
export function randomCrazyEffectSx(): SxProps<Theme> | undefined {
  const pool = [17, 18, 19]
  const idx = pool[Math.floor(Math.random() * pool.length)]!
  return sxFor(idx)
}

// Legendary "42" overlay (easter egg)
// Why: Centralize the effect visuals/logic so UI components can trigger it without duplicating code.
export function useFortyTwoLegendaryOverlay(shouldAttemptTrigger: boolean): React.ReactNode | null {
  const [active, setActive] = useState(false)
  const [variant, setVariant] = useState<number>(0)
  const hideTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null)
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

  // Generate sparkles per activation to keep layout stable during animation
  const [sparkles, setSparkles] = useState<Array<{ left: number; top: number; size: number; delay: number; dur: number; sx: number; sy: number }>>([])

  useEffect(() => {
    if (shouldAttemptTrigger && !seenEdgeRef.current) {
      seenEdgeRef.current = true
      try {
        if (Math.random() < EASTER_EGG_42_CHANCE) {
          setVariant(Math.floor(Math.random() * 5))
          setActive(true)
          if (hideTimer.current) { window.clearTimeout(hideTimer.current); hideTimer.current = null }
          hideTimer.current = window.setTimeout(() => { setActive(false); hideTimer.current = null }, EASTER_EGG_42_DURATION_MS)
        }
      } catch {}
    } else if (!shouldAttemptTrigger) {
      seenEdgeRef.current = false
    }
    return () => { if (hideTimer.current) { window.clearTimeout(hideTimer.current); hideTimer.current = null } }
  }, [shouldAttemptTrigger])

  useEffect(() => {
    if (!active) { setSparkles([]); return }
    const base = 22
    const extra = (variant % 3) * 6
    const N = base + extra
    const arr: Array<{ left: number; top: number; size: number; delay: number; dur: number; sx: number; sy: number }> = []
    for (let i = 0; i < N; i++) {
      const left = Math.random() * 100
      const top = 42 + Math.random() * 22
      const size = 5 + Math.random() * 14
      const delay = Math.round(Math.random() * 600)
      const dur = 1100 + Math.round(Math.random() * 1600)
      const sx = (Math.random() - 0.5) * (60 + variant * 10)
      const sy = - (50 + Math.random() * (90 + variant * 6))
      arr.push({ left, top, size, delay, dur, sx, sy })
    }
    setSparkles(arr)
  }, [active, variant])

  if (!active) return null

  return (
    <Box aria-hidden sx={(theme) => ({
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none', zIndex: 1,
      '&::before': {
        content: '""', position: 'absolute', inset: 0,
        background: `radial-gradient(circle at center, ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)'} 0%, rgba(0,0,0,0) 60%)`,
      },
    })}>
      {/* Click catcher to dismiss on click over the effect */}
      <Box onClick={() => setActive(false)} sx={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }} />
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
            (variant === 0 ? `${kfTextHeartbeat} 1400ms ease-in-out ${520}ms infinite` : null),
            (variant === 1 ? `${kfTextRotate} 1500ms ease-in-out ${520}ms` : null),
            (variant === 2 ? `${kfTextGlow} 1200ms ease-in-out ${520}ms infinite` : null),
            (variant === 3 ? `${kfTextWave} 1400ms ease-in-out ${520}ms infinite` : null),
            (variant === 4 ? `${kfTextRainbowOnly} 1800ms linear ${520}ms infinite` : null),
          ].filter(Boolean).join(', '),
        }}>42</Typography>
      </Box>

      {/* Sparkles */}
      <Box sx={{ position: 'absolute', inset: 0 }}>
        {sparkles.map((s, i) => (
          <Box key={i} sx={{
            position: 'absolute', left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,241,118,0.6) 60%, rgba(255,255,255,0) 70%)',
            boxShadow: '0 0 12px rgba(255,215,64,0.8), 0 0 24px rgba(255,171,0,0.5)',
            animation: `${kfSpark} ${s.dur}ms ease-out ${s.delay}ms both`,
            ['--sx' as any]: `${s.sx}px`, ['--sy' as any]: `${s.sy}px`,
          }} />
        ))}
      </Box>
    </Box>
  )
}
