import CircularProgress from '@mui/material/CircularProgress'

type InlineProgressSpinnerProps = {
  variant?: 'determinate' | 'indeterminate'
  value?: number
  ariaLabel?: string | undefined
  // Override the default 20 px square size; useful for contexts that need a larger indicator.
  sizePx?: number
}

const INLINE_SPINNER_SIZE_PX = 20 as const

/**
 * Shared circular progress indicator so preview chips and Safeguards reuse the same chrome.
 * Color stays in the info palette to align with the builder status badges.
 */
export default function InlineProgressSpinner({ variant = 'indeterminate', value = 0, ariaLabel, sizePx }: InlineProgressSpinnerProps) {
  const size = sizePx ?? INLINE_SPINNER_SIZE_PX
  const determinateProps = variant === 'determinate'
    ? { value: Math.max(0, Math.min(100, value)) }
    : {}
  return (
    <CircularProgress
      variant={variant}
      size={size}
      thickness={4}
      aria-label={ariaLabel}
      // Lock the spinner to a square so tight flex rows cannot squash it into an oval.
      sx={{
        color: 'info.main',
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        aspectRatio: '1 / 1',
        flexShrink: 0,
      }}
      {...determinateProps}
    />
  )
}
