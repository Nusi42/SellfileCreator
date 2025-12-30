import type { SxProps, Theme } from '@mui/material/styles'

// Shared warning badge styling for small attention markers.
// Use this for top-right button badges (hidden-by-filter, note changes, etc.).
export const warningBadgeSx: SxProps<Theme> = (theme) => ({
  // Scope the styles to the internal MUI badge element.
  '& .MuiBadge-badge': {
    // Keep the badge compact and circular.
    minWidth: 18,
    height: 18,
    borderRadius: '50%',
    // Nudge the badge inward to sit on the button corner.
    top: 4,
    right: 4,
    // Center the warning glyph inside the circle.
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Match the warning emphasis used elsewhere in the UI.
    boxShadow: theme.shadows[2],
    backgroundColor: theme.palette.warning.main,
    color: theme.palette.getContrastText(theme.palette.warning.main),
    // Outline the badge against the dialog background.
    border: `2px solid ${theme.palette.background.paper}`,
    // Keep the glyph weight consistent with other badges.
    fontWeight: theme.typography.fontWeightBold ?? 600,
    fontSize: theme.typography.pxToRem ? theme.typography.pxToRem(12) : '0.75rem',
    // Avoid extra vertical padding inside the badge.
    lineHeight: 1,
  },
})
