/**
 * pushFeedbackKeyframes.ts
 *
 * Shared CSS keyframes for push-activity feedback. Centralised so the simple-mode
 * auto-push send button (NoteDialog) and the account switcher button play the SAME
 * pulse without duplicating the animation (SSOT). Replay pattern: remount the target
 * via `key={flashSeq}` so the one-shot animation restarts on every increment.
 */
import { keyframes } from '@mui/material/styles'
import { TINT } from './colorTints'

// Duration for one pulse — callers reference this instead of restating the literal.
export const AUTO_PUSH_BLINK_MS = 600

// Brief glow pulse played after each push event (success feedback / background activity).
export const autoPushBlink = keyframes`
  0%   { box-shadow: 0 0 0 0 ${TINT.successGlow}; }
  50%  { box-shadow: 0 0 0 8px ${TINT.pulseFadeOut}; transform: scale(1.08); }
  100% { box-shadow: 0 0 0 0 ${TINT.pulseFadeOut}; }
`
