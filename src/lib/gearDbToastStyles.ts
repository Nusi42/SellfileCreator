/**
 * gearDbToastStyles — SSOT for the endpoint gear-update (item/diff) toast surface.
 *
 * The endpoint update toast historically rendered as a filled green `success` Alert.
 * It now renders on a neutral paper surface so it reads as a calm "here's an update"
 * notification rather than a success banner. This module is the single definition of
 * that look so the live Snackbar renderer in App.tsx stays in one place.
 *
 * Only the SUCCESS/update path is styled here. Failure/invalid toasts keep their red
 * `error` severity and are intentionally NOT covered by this spec.
 */
import type { AlertProps } from '@mui/material/Alert'
import type { SxProps, Theme } from '@mui/material/styles'

// Rendering recipe consumed by the Snackbar/Alert in App.tsx for the update toast.
export type GearDbToastStyleSpec = {
  // MUI Alert severity — drives the built-in icon/colour baseline.
  severity: AlertProps['severity']
  // MUI Alert variant.
  variant: AlertProps['variant']
  // Extra sx merged onto the Alert root so the surface stays neutral.
  sx?: SxProps<Theme>
}

// The shipped update-toast look: a fully neutral paper surface with NO accent hue.
// Add/remove cues come entirely from the diff chip + cards.
//
// Border note: the global MuiPaper styleOverride already paints a `1px solid divider`
// border on every Alert root, so we deliberately do NOT add a second border here —
// doing so produced a doubled/mismatched edge. We only neutralize the surface and the
// standard-variant's info-tinted background + icon/text colour so nothing reads as
// "info blue" against that neutral divider border.
export const GEAR_DB_UPDATE_TOAST_STYLE: GearDbToastStyleSpec = {
  severity: 'info',
  variant: 'standard',
  sx: {
    // Opaque paper surface — overrides the standard info variant's blue tint.
    bgcolor: 'background.paper',
    // Body text tracks the primary text colour (not the info hue).
    color: 'text.primary',
    // Neutralize the standard-variant icon colour too, so the leading glyph is not blue.
    '& .MuiAlert-icon': { color: 'text.secondary' },
  },
}
