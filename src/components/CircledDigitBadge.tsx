import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'

// CSS-rendered circled badge. Consistent across browsers and OS — no Unicode
// glyph fallback means no font-metric discrepancy between Firefox/Linux and Windows.
//
// Sizing math: fontSize sets the digit size relative to the parent context; em-based
// width/height size the outer circle relative to that digit. Together:
//   circle_outer = fontSize × width ≈ 0.85 × 1.18 ≈ 1.0× the parent em square
// so the badge fits within a normal line height without pushing rows apart.
const BADGE_SX: SxProps<Theme> = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1.18em',
  height: '1.18em',
  minWidth: '1.18em',
  border: '0.1em solid',
  // borderColor kept separate so callers can override it via sx without affecting
  // the border shorthand (e.g. RecipeChip passes borderColor: 'error.main').
  borderColor: 'currentColor',
  borderRadius: '50%',
  fontSize: '0.85em',
  lineHeight: 1,
  flexShrink: 0,
  fontVariantNumeric: 'tabular-nums',
  // 'baseline' keeps the digit's baseline on the surrounding text baseline in inline
  // contexts (e.g. chip spans). In flex wrappers (gear card) this is ignored anyway.
  verticalAlign: 'baseline',
  userSelect: 'none',
}

interface Props {
  // Numbers are floored/clamped; strings are rendered verbatim (e.g. '¬').
  value: number | string
  sx?: SxProps<Theme>
}

export function CircledDigitBadge({ value, sx }: Props) {
  const content = typeof value === 'number' ? Math.max(0, Math.floor(value)) : value
  const mergedSx: SxProps<Theme> = sx
    ? [BADGE_SX, ...(Array.isArray(sx) ? sx : [sx])] as SxProps<Theme>
    : BADGE_SX
  return (
    <Box component="span" sx={mergedSx}>
      {content}
    </Box>
  )
}
