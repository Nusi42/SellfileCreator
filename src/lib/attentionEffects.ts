import { useEffect, useMemo, useRef, useState } from 'react'
import { keyframes } from '@emotion/react'
import type { SxProps, Theme } from '@mui/material/styles'

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
  35% { transform: translateX(0); }
  85% { transform: translateX(8px); }
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
