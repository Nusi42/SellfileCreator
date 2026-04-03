import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { FONT_SIZE_DISPLAY_REM, FONT_SIZE_APP_SUBTITLE_PX } from '../lib/constants'

// AppTitle renders the "Sellfile Creator for RSL Helper" heading used in both
// the main app header and the help dialog.
// S, f, and C are rendered at fontWeight 700 while the surrounding characters
// stay at 400, surfacing the "SFC" abbreviation through weight contrast alone.
export function AppTitle() {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.75, whiteSpace: 'nowrap' }}>
      {/* aria-label gives screen readers a clean "Sellfile Creator" string; the inner spans are purely visual */}
      <Typography variant="h4" fontWeight={400} aria-label="Sellfile Creator" sx={{ fontSize: `${FONT_SIZE_DISPLAY_REM}rem` }}>
        {/* S, f, C are bold while surrounding chars stay at regular weight, surfacing the "SFC" abbreviation */}
        <Box component="span" sx={{ fontWeight: 800 }}>S</Box>ell
        <Box component="span" sx={{ fontWeight: 800 }}>f</Box>ile{' '}
        <Box component="span" sx={{ fontWeight: 800 }}>C</Box>reator
      </Typography>
      <Typography sx={{ fontSize: `${FONT_SIZE_APP_SUBTITLE_PX}px`, color: 'text.secondary', lineHeight: 1 }}>
        for RSL Helper
      </Typography>
    </Box>
  )
}
