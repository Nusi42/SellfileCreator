import { keyframes } from '@mui/material'
import type { Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'

// Shared highlight effects used to gently draw attention to important controls.
// Originally created for the Help dialog's "Start Tutorial" button, now exported so
// other components can trigger the same playful animations (e.g., Final Sell toggle hints).
export const HIGHLIGHT_EFFECT_DURATION_MS = 1200 as const
export const HIGHLIGHT_EFFECT_VARIANTS = 27 as const

const subtlePool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const textPool = [10, 11, 12, 13, 14, 15, 16, 20, 21, 22, 23, 24, 25, 26] as const
const crazyPool = [17, 18, 19] as const

export function pickHighlightEffect(previous: number | null): number {
  const r = Math.random()
  const pool = r < 0.20 ? crazyPool : (r < 0.50 ? textPool : subtlePool)
  let next = pool[Math.floor(Math.random() * pool.length)]!
  if (typeof previous === 'number' && next === previous) {
    next = (next + 1) % HIGHLIGHT_EFFECT_VARIANTS
  }
  return next
}

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
  0% { transform: scale(1); box-shadow: 0 0 0 rgba(255,255,255,0); }
  70% { transform: scale(1.12); box-shadow: 0 0 28px rgba(255,255,255,0.75); }
  100% { transform: scale(1); box-shadow: 0 0 0 rgba(255,255,255,0); }
`
const kfCrumble = keyframes`
  0% { transform: translateY(0); }
  40% { transform: translateY(2px); }
  100% { transform: translateY(0); }
`
const kfBouncePop = keyframes`
  0% { transform: scale(1); }
  30% { transform: scale(1.08); }
  60% { transform: scale(0.98); }
  100% { transform: scale(1); }
`
const kfRainbowFlash = keyframes`
  0% { filter: hue-rotate(0deg); }
  50% { filter: hue-rotate(180deg); }
  100% { filter: hue-rotate(360deg); }
`
const kfShakeBlast = keyframes`
  0% { transform: translate(0,0); }
  20% { transform: translate(-2px, 1px); }
  40% { transform: translate(3px, -1px); }
  60% { transform: translate(-2px, 2px); }
  80% { transform: translate(2px, -2px); }
  100% { transform: translate(0,0); }
`
const kfTextHeartbeat = keyframes`
  0% { transform: scale(1); }
  30% { transform: scale(1.06); }
  60% { transform: scale(0.98); }
  100% { transform: scale(1); }
`
const kfTextRainbow = keyframes`
  0% { filter: hue-rotate(0deg); }
  100% { filter: hue-rotate(360deg); }
`
const kfTextBackflip = keyframes`
  0% { transform: rotateX(0deg); }
  50% { transform: rotateX(180deg); }
  100% { transform: rotateX(360deg); }
`
const kfTextRotate = keyframes`
  0% { transform: rotate(0deg); }
  50% { transform: rotate(6deg); }
  100% { transform: rotate(0deg); }
`
const kfTextWave = keyframes`
  0% { transform: translateY(0); }
  25% { transform: translateY(-2px); }
  50% { transform: translateY(0); }
  75% { transform: translateY(2px); }
  100% { transform: translateY(0); }
`
const kfTextGlow = keyframes`
  0% { text-shadow: 0 0 0 rgba(255,255,255,0); }
  40% { text-shadow: 0 0 12px rgba(255,255,255,0.85); }
  100% { text-shadow: 0 0 0 rgba(255,255,255,0); }
`
const kfTextSlideSkew = keyframes`
  0% { transform: translateX(0) skewX(0deg); }
  50% { transform: translateX(2px) skewX(4deg); }
  100% { transform: translateX(0) skewX(0deg); }
`
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
const kfTextSlideOnly = keyframes`
  0% { transform: translateX(0); }
  50% { transform: translateX(2px); }
  100% { transform: translateX(0); }
`
const kfTextFlipYBack = keyframes`
  0% { transform: rotateY(0deg); }
  50% { transform: rotateY(-180deg); }
  100% { transform: rotateY(-360deg); }
`
const kfTextHoverLift = keyframes`
  0% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
  100% { transform: translateY(0); }
`
const kfTextSpinSmall = keyframes`
  0% { transform: rotate(0deg); }
  50% { transform: rotate(180deg); }
  100% { transform: rotate(360deg); }
`
const kfTextRainbowOnly = keyframes`
  0% { background: linear-gradient(90deg, #ff5252, #ffb142, #ffe45e, #1dd1a1, #18dcff, #ff6b6b); -webkit-background-clip: text; color: transparent; }
  100% { background: linear-gradient(90deg, #18dcff, #ff6b6b, #ff5252, #ffb142, #ffe45e, #1dd1a1); -webkit-background-clip: text; color: transparent; }
`
const kfTextWaveSkew = keyframes`
  0% { transform: skewX(0deg); }
  50% { transform: skewX(8deg); }
  100% { transform: skewX(0deg); }
`
const kfButtonSlide = keyframes`
  0% { transform: translateX(0); }
  40% { transform: translateX(6px); }
  100% { transform: translateX(0); }
`
const kfTextCatchUp = keyframes`
  0% { transform: translateX(-6px); }
  50% { transform: translateX(3px); }
  100% { transform: translateX(0); }
`

type HighlightEffectStyle = SystemStyleObject<Theme>

const highlightEffectStyles: ReadonlyArray<HighlightEffectStyle> = [
  { animation: `${kfGlow} 900ms ease-out` },
  { animation: `${kfRing} 950ms ease-out` },
  { position: 'relative', overflow: 'hidden', '&::after': { content: '""', position: 'absolute', inset: 0, animation: `${kfSweep} 1000ms ease-out`, pointerEvents: 'none' } },
  { animation: `${kfPulse} 800ms ease-out` },
  { '& .MuiButton-label, & .MuiButton-startIcon, & .MuiButton-endIcon': { animation: `${kfTextWobble} 900ms ease-out` } },
  { animation: `${kfExplode} 850ms ease-out` },
  { animation: `${kfCrumble} 900ms ease-out` },
  { animation: `${kfBouncePop} 900ms cubic-bezier(.2,1.2,.2,1)` },
  { animation: `${kfRainbowFlash} 950ms ease-out` },
  { animation: `${kfShakeBlast} 800ms ease-in-out` },
  { animation: `${kfTextHeartbeat} 900ms ease-in-out` },
  { animation: `${kfTextRainbow} 1000ms linear` },
  { animation: `${kfTextBackflip} 900ms ease-in-out`, transformStyle: 'preserve-3d' },
  { animation: `${kfTextRotate} 950ms ease-in-out` },
  { animation: `${kfTextWave} 850ms ease-in-out` },
  { animation: `${kfTextGlow} 900ms ease-out` },
  { animation: `${kfTextSlideSkew} 900ms ease-in-out` },
  { animation: `${kfCrazySpinZoom} 1000ms ease-in-out` },
  { animation: `${kfCrazyWobble} 950ms ease-in-out` },
  { animation: `${kfCrazyBurst} 900ms ease-out` },
  { '& .start-tutorial-text, & .highlight-target': { display: 'inline-block', animation: `${kfTextSlideOnly} 850ms ease-in-out` } },
  { '& .start-tutorial-text, & .highlight-target': { display: 'inline-block', transformStyle: 'preserve-3d', animation: `${kfTextFlipYBack} 900ms ease-in-out` } },
  { '& .start-tutorial-text, & .highlight-target': { display: 'inline-block', animation: `${kfTextHoverLift} 900ms ease-in-out` } },
  { '& .start-tutorial-text, & .highlight-target': { display: 'inline-block', animation: `${kfTextSpinSmall} 900ms ease-in-out` } },
  { '& .start-tutorial-text, & .highlight-target': { display: 'inline-block', animation: `${kfTextRainbowOnly} 1000ms linear` } },
  { '& .start-tutorial-text, & .highlight-target': { display: 'inline-block', animation: `${kfTextWaveSkew} 950ms ease-in-out` } },
  { animation: `${kfButtonSlide} 950ms ease-in-out`, '& .start-tutorial-text, & .highlight-target': { display: 'inline-block', animation: `${kfTextCatchUp} 950ms ease-in-out` } },
] as const

export function getHighlightEffectSx(effectIdx: number | null): HighlightEffectStyle {
  if (effectIdx == null) return {}
  return highlightEffectStyles[effectIdx] ?? {}
}
