import { Box } from '@mui/material'
import { keyframes } from '@emotion/react'
import { useEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { SFC_NUDGE_FADE_OUT_MS } from '../lib/constants'
import { highlightElementKeyframes } from '../lib/attentionCatalog'

// Fade-out duration (s) for the nudge arrows, derived from the SSOT ms constant
// so the CSS animation and the DOM-removal timer in the tutorial hook agree.
const SFC_NUDGE_FADE_OUT_S = `${SFC_NUDGE_FADE_OUT_MS / 1000}s`

// 80s-advertisement bounce: snappy up-down with a double-tap at the top.
const arrowBounceKf = keyframes`
  0%   { transform: translateY(0); }
  25%  { transform: translateY(-18px); }
  45%  { transform: translateY(-8px); }
  60%  { transform: translateY(-15px); }
  80%  { transform: translateY(-3px); }
  100% { transform: translateY(0); }
`

// Fade-out used when the nudge timer expires.
const sfcNudgeFadeOutKf = keyframes`
  from { opacity: 1; }
  to   { opacity: 0; }
`

// Three arrows: all start from the same neon-yellow base but the slow rainbow-flash
// cycle is staggered so each sits at a different hue at any given moment — gold,
// magenta, cyan, etc., constantly drifting. A second catalog effect adds personality.
// The arrows fan out (±22°) but their TIPS all converge on one anchor point — the
// centre arrow is shorter so the two side arrows frame it.
const ARROW_FAN = [
  { stemHeight: 66, bounceDelay: '0.00s', hueDelay: '0.0s', extraKf: highlightElementKeyframes.shakeBlast, extraDur: '2.2s', extraDelay: '0.0s', rotation: '-22deg' },
  { stemHeight: 54, bounceDelay: '0.12s', hueDelay: '1.2s', extraKf: highlightElementKeyframes.bouncePop,  extraDur: '3.0s', extraDelay: '0.9s', rotation:   '0deg' },
  { stemHeight: 66, bounceDelay: '0.24s', hueDelay: '2.4s', extraKf: highlightElementKeyframes.explode,    extraDur: '2.5s', extraDelay: '0.5s', rotation:  '22deg' },
] as const

interface SfcNudgeArrowsProps {
  /** Renders nothing when false — the caller decides which button is being pointed at. */
  active: boolean
  /** Runs the fade-out; the tutorial hook unmounts us once it completes. */
  fading: boolean
  /** The element the arrow tips converge on (the chevron, or the Save button). */
  targetRef: RefObject<HTMLElement | null>
}

/**
 * The bouncing arrow fan that points at whichever SFC control the user needs next.
 *
 * Extracted so the Load and Save buttons share ONE definition of the fan: the two
 * nudges are mutually exclusive (see the target logic in HeaderActions), and a
 * forked copy per button would let their look drift apart for no reason.
 */
function SfcNudgeArrows({ active, fading, targetRef }: SfcNudgeArrowsProps) {
  // Viewport coordinates of the convergence point (the target's top centre).
  // Measured rather than inherited from a positioned ancestor because the fan is
  // rendered through a PORTAL — see the rationale on the wrapper below.
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)

  // The anchor is MEASURED from the live DOM (getBoundingClientRect), which only exists
  // after commit, so there is no render-time value to derive it from.
  useEffect(() => {
    // No stale-anchor reset needed on deactivate: the guard below renders nothing
    // while inactive, and the next activation re-measures before painting.
    if (!active) return undefined
    const measure = () => {
      const rect = targetRef.current?.getBoundingClientRect()
      // 3px of breathing room above the button, matching the original padding.
      if (rect) setAnchor({ x: rect.left + rect.width / 2, y: rect.top - 3 })
    }
    measure()
    // The nudge lives for only a few seconds, but the page can still scroll or
    // resize under it; re-measure so the tips stay pinned to the button.
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [active, targetRef])

  if (!active || !anchor) return null
  return createPortal(
    <Box sx={{
      // Fixed + portalled to <body>, NOT absolute inside the header. The fan hangs
      // ~90px above the anchor and reaches ~54px to either side (the ±22° tilt),
      // while the builder column's scroll box is overflowY:auto — which makes
      // overflow-x compute to auto as well, so an in-flow overflowing child raised
      // BOTH scrollbars for the few seconds the nudge was up. Fixed-position
      // descendants are excluded from every ancestor's scrollable overflow, so the
      // arrows can now paint over anything without ever moving a scrollbar.
      position: 'fixed',
      left: `${anchor.x}px`,
      top: `${anchor.y}px`,
      width: 0,
      height: 0,
      // Above the app chrome, and never intercepting clicks on the button it points at.
      zIndex: (theme) => theme.zIndex.tooltip + 1,
      pointerEvents: 'none',
      // Fade-out overrides all child animations and brings opacity to 0.
      ...(fading ? { animation: `${sfcNudgeFadeOutKf} ${SFC_NUDGE_FADE_OUT_S} ease-out forwards` } : {}),
    }}>
      {ARROW_FAN.map((arrow) => (
        <Box
          key={arrow.bounceDelay}
          sx={{
            // Stack every arrow on the shared anchor; the column is centred on it
            // (translateX(-50%)) and rotates about its bottom tip so all tips meet.
            position: 'absolute',
            bottom: 0,
            left: 0,
            transform: `translateX(-50%) rotate(${arrow.rotation})`,
            transformOrigin: 'bottom center',
          }}
        >
          {/* Inner box handles all animation; outer box holds the static fan rotation. */}
          <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            animation: fading
              ? 'none'
              : `${arrowBounceKf} 0.5s ease-in-out ${arrow.bounceDelay} infinite, ${highlightElementKeyframes.rainbowFlash} 3.6s linear ${arrow.hueDelay} infinite, ${arrow.extraKf} ${arrow.extraDur} ease-in-out ${arrow.extraDelay} infinite`,
          }}>
            {/* Stem — slimmed so the fan reads as a pointer at the target, not a banner. */}
            <Box sx={{ width: '16px', height: `${arrow.stemHeight}px`, backgroundColor: '#FFE000', borderRadius: '4px 4px 0 0', boxShadow: '3px 3px 0 rgba(0,0,0,0.7)' }} />
            {/* Head — narrow flat arrowhead. */}
            <Box sx={{ width: 0, height: 0, borderLeft: '22px solid transparent', borderRight: '22px solid transparent', borderTop: '24px solid #FFE000', filter: 'drop-shadow(3px 3px 0 rgba(0,0,0,0.7))' }} />
          </Box>
        </Box>
      ))}
    </Box>,
    document.body,
  )
}

export default SfcNudgeArrows
