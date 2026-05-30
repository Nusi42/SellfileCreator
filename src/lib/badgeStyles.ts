import type { SxProps, Theme } from '@mui/material/styles'

// Shared warning badge styling for small attention markers.
// Use this for top-right button badges (hidden-by-filter, note changes, etc.).
export const buildWarningBadgeBase = (theme: Theme) => ({
  // Keep the badge compact and circular.
  minWidth: 18,
  height: 18,
  borderRadius: '50%',
  // Center the warning glyph inside the circle.
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // Match the warning emphasis used elsewhere in the UI.
  boxShadow: theme.shadows[2],
  backgroundColor: (theme.vars?.palette.warning.main ?? theme.palette.warning.main),
  // Use the precomputed contrastText from the CSS vars palette; getContrastText
  // only receives light-scheme hex in CSS-vars mode, giving wrong results in dark.
  color: (theme.vars?.palette.warning.contrastText ?? theme.palette.warning.contrastText),
  // Outline the badge using the divider token — visible in light mode, subtle in dark.
  border: `2px solid ${(theme.vars?.palette.divider ?? theme.palette.divider)}`,
  // Keep the glyph weight consistent with other badges.
  fontWeight: theme.typography.fontWeightBold ?? 600,
  fontSize: theme.typography.pxToRem ? theme.typography.pxToRem(12) : '0.75rem',
  // Avoid extra vertical padding inside the badge.
  lineHeight: 1,
})

export const warningBadgeSx: SxProps<Theme> = (theme) => ({
  // Scope the styles to the internal MUI badge element.
  '& .MuiBadge-badge': {
    // Nudge the badge inward to sit on the button corner.
    top: 4,
    right: 4,
    // Allow tooltip hover targets on the badge itself.
    pointerEvents: 'auto',
    // Reuse the base warning bubble styling.
    ...buildWarningBadgeBase(theme),
  },
})

// Use for inline warning indicators that are not full MUI badges.
export const buildWarningBadgeIndicatorSx = (theme: Theme) => ({
  // Render the exclamation mark in the bubble.
  content: '"!"',
  // Float the bubble above the host element.
  position: 'absolute',
  top: -6,
  left: '50%',
  transform: 'translate(-50%, -50%)',
  // Keep the bubble decorative and non-interactive.
  pointerEvents: 'none',
  // Reuse the base warning bubble styling.
  ...buildWarningBadgeBase(theme),
})
