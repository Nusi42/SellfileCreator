import { Box } from '@mui/material'
import { alpha, keyframes } from '@mui/material/styles'
import InlineProgressSpinner from './InlineProgressSpinner'
import { ALPHA } from '../lib/colorTints'

// Pulse mirrors the chip overlay so every caller gets the same pending animation.
const pendingPulse = keyframes`
  0% { transform: scale(0.85); opacity: 0.4; }
  50% { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.85); opacity: 0.4; }
`

type WorkloadProgressIndicatorProps = {
  progressRatio: number
  ariaLabel?: string | undefined
  // Override the default 20 px size; useful for contexts that need a larger indicator.
  sizePx?: number
}

const PENDING_RING_SIZE_PX = 20 as const
const PENDING_RING_THICKNESS_PX = 3 as const

/**
 * Shared determinate/pulsing indicator that sticks to the chip spec.
 * Callers pass normalized ratios so this component can decide between pulse vs determinate spinner.
 */
export default function WorkloadProgressIndicator({ progressRatio, ariaLabel, sizePx }: WorkloadProgressIndicatorProps) {
  const size = sizePx ?? PENDING_RING_SIZE_PX
  const clampedRatio = Math.max(0, Math.min(1, progressRatio))
  if (clampedRatio <= 0) return null
  const showPendingPulse = clampedRatio < 0.05
  if (showPendingPulse) {
    return (
      <Box
        role={ariaLabel ? 'status' : undefined}
        aria-label={ariaLabel}
        sx={(theme) => ({
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          aspectRatio: '1 / 1',
          flexShrink: 0,
          borderRadius: '50%',
          border: `${PENDING_RING_THICKNESS_PX}px solid`,
          borderColor: alpha(theme.palette.info.dark, ALPHA.a90),
          animation: `${pendingPulse} 1s ease-in-out infinite`,
        })}
      />
    )
  }
  // Wrap in a role="status" box so the locator `[role="status"][aria-label="Building…"]` stays
  // valid through the full determinate phase, not just the initial pending-pulse phase.
  return (
    <Box role={ariaLabel ? 'status' : undefined} aria-label={ariaLabel} sx={{ display: 'contents' }}>
      <InlineProgressSpinner
        variant="determinate"
        value={clampedRatio * 100}
        {...(sizePx !== undefined ? { sizePx } : {})}
      />
    </Box>
  )
}
