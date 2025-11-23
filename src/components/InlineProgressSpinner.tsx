import CircularProgress from '@mui/material/CircularProgress'

type InlineProgressSpinnerProps = {
  variant?: 'determinate' | 'indeterminate'
  value?: number
  ariaLabel?: string
}

const INLINE_SPINNER_SIZE_PX = 20 as const

/**
 * Shared circular progress indicator so preview chips and Keep Uniques reuse the same chrome.
 * Color stays in the info palette to align with the builder status badges.
 */
export default function InlineProgressSpinner({ variant = 'indeterminate', value = 0, ariaLabel }: InlineProgressSpinnerProps) {
  const determinateProps = variant === 'determinate'
    ? { value: Math.max(0, Math.min(100, value)) }
    : {}
  return (
    <CircularProgress
      variant={variant}
      size={INLINE_SPINNER_SIZE_PX}
      thickness={4}
      aria-label={ariaLabel}
      sx={{ color: 'info.main' }}
      {...determinateProps}
    />
  )
}
