import { Box } from '@mui/material'
import { alpha, keyframes } from '@mui/material/styles'
import InlineProgressSpinner from './InlineProgressSpinner'

// Pulse mirrors the chip overlay so every caller gets the same pending animation.
const pendingPulse = keyframes`
  0% { transform: scale(0.85); opacity: 0.4; }
  50% { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.85); opacity: 0.4; }
`

type WorkloadProgressIndicatorProps = {
  progressRatio: number
  ariaLabel?: string | undefined
}

const PENDING_RING_SIZE_PX = 20 as const
const PENDING_RING_THICKNESS_PX = 3 as const

/**
 * Shared determinate/pulsing indicator that sticks to the chip spec.
 * Callers pass normalized ratios so this component can decide between pulse vs determinate spinner.
 */
export default function WorkloadProgressIndicator({ progressRatio, ariaLabel }: WorkloadProgressIndicatorProps) {
  const clampedRatio = Math.max(0, Math.min(1, progressRatio))
  if (clampedRatio <= 0) return null
  const showPendingPulse = clampedRatio < 0.05
  if (showPendingPulse) {
    return (
      <Box
        role={ariaLabel ? 'status' : undefined}
        aria-label={ariaLabel}
        sx={(theme) => ({
          width: PENDING_RING_SIZE_PX,
          height: PENDING_RING_SIZE_PX,
          minWidth: PENDING_RING_SIZE_PX,
          minHeight: PENDING_RING_SIZE_PX,
          aspectRatio: '1 / 1',
          flexShrink: 0,
          borderRadius: '50%',
          border: `${PENDING_RING_THICKNESS_PX}px solid`,
          borderColor: alpha(theme.palette.info.dark, 0.9),
          animation: `${pendingPulse} 1s ease-in-out infinite`,
        })}
      />
    )
  }
  return (
    <InlineProgressSpinner
      variant="determinate"
      value={clampedRatio * 100}
      ariaLabel={ariaLabel}
    />
  )
}
