/**
 * celebrationKeyframes.ts
 *
 * Shared CSS keyframes for the celebratory "legendary pull" animation used
 * when a playful name is generated. Centralised here so MetasetsDialog name
 * rows and preset save dialogs reuse the same animation without duplication.
 */
import { keyframes } from '@emotion/react'

// Short golden glow effect reminiscent of a legendary pull. Intentionally subtle.
export const legendaryGlow = keyframes`
  0% { box-shadow: 0 0 0px 0 rgba(255, 204, 0, 0), inset 0 0 0px 0 rgba(255, 230, 150, 0); }
  25% { box-shadow: 0 0 14px 3px rgba(255, 204, 0, 0.55), inset 0 0 8px 2px rgba(255, 230, 150, 0.45); }
  60% { box-shadow: 0 0 18px 6px rgba(255, 184, 0, 0.50), inset 0 0 12px 3px rgba(255, 224, 140, 0.45); }
  100% { box-shadow: 0 0 0px 0 rgba(255, 204, 0, 0), inset 0 0 0px 0 rgba(255, 230, 150, 0); }
`

// Sparkle dots that float upward during the glow.
export const sparkleRise = keyframes`
  0% { transform: translateY(6px) scale(0.9); opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 0.85; }
  100% { transform: translateY(-10px) scale(1.05); opacity: 0; }
`
