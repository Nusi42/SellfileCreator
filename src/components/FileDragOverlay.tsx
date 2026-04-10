import { Box, Typography } from '@mui/material'
import { useI18n } from '../lib/i18n'

const FILE_OVERLAY_Z_INDEX = 2000

export default function FileDragOverlay({ active }: { active: boolean }) {
  // i18n: Shown during global drag-over; messages explain accepted types and shift modifier hint.
  const { t } = useI18n()
  if (!active) return null
  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: FILE_OVERLAY_Z_INDEX,
        pointerEvents: 'none',
        bgcolor: 'rgba(15,15,18,0.6)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Box
        sx={{
          pointerEvents: 'none',
          px: 3,
          py: 2,
          borderRadius: 2,
          bgcolor: 'rgba(30,30,36,0.9)',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.2)',
          boxShadow: 6,
          textAlign: 'center',
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600 }}>{t('fileDropTitle')}</Typography>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>{t('fileDropSubtitle')}</Typography>
        {/* Always show the shift-modifier hint so users can discover the selective import feature. */}
        <Typography
          variant="body2"
          sx={{
            mt: 1,
            pt: 1,
            borderTop: '1px solid rgba(255,255,255,0.15)',
            opacity: 0.75,
            color: 'primary.light',
            fontStyle: 'italic',
          }}
        >
          {t('fileDropShiftHint')}
        </Typography>
      </Box>
    </Box>
  )
}
