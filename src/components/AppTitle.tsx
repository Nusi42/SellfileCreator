import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { FONT_SIZE_DISPLAY_REM, FONT_SIZE_APP_SUBTITLE_PX } from '../lib/constants'
import { useI18n } from '../lib/i18n'

// AppTitle renders the "Sellfile Creator for <client>" heading used in both
// the main app header and the help dialog. The subtitle names the CONNECTED CLIENT
// (RSL Helper unless one says otherwise), so it rides the shared {client} placeholder.
// S, f, and C are rendered at fontWeight 800 while the surrounding characters
// stay at 400, surfacing the "SFC" abbreviation through weight contrast alone.
// compact=true scales it down for use inside dialog titles.
export function AppTitle({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n()
  const mainRem = compact ? 1.15 : FONT_SIZE_DISPLAY_REM
  const subtitlePx = compact ? 11 : FONT_SIZE_APP_SUBTITLE_PX
  const gap = compact ? 0.5 : 0.75
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'baseline', gap, whiteSpace: 'nowrap' }}>
      {/* aria-label gives screen readers a clean "Sellfile Creator" string; the inner spans are purely visual */}
      <Typography variant="h4" aria-label="Sellfile Creator" sx={{ fontSize: `${mainRem}rem`, fontWeight: 400 }}>
        {/* S, f, C are bold while surrounding chars stay at regular weight, surfacing the "SFC" abbreviation */}
        <Box component="span" sx={{ fontWeight: 800 }}>S</Box>ell
        <Box component="span" sx={{ fontWeight: 800 }}>f</Box>ile{' '}
        <Box component="span" sx={{ fontWeight: 800 }}>C</Box>reator
      </Typography>
      <Typography sx={{ fontSize: `${subtitlePx}px`, color: 'text.secondary', lineHeight: 1 }}>
        {t('appTitleSubtitle')}
      </Typography>
    </Box>
  )
}
