import { Box, Typography } from '@mui/material'
import { useI18n } from '../lib/i18n'

const FILE_OVERLAY_Z_INDEX = 2000

export default function FileDragOverlay({ active }: { active: boolean }) {
  // i18n: Shown during global drag-over; messages explain accepted types and shift modifier hint.
  const { t } = useI18n()
  if (!active) return null
  return (
    <Box
      sx={(theme) => ({
        position: 'fixed',
        inset: 0,
        zIndex: FILE_OVERLAY_Z_INDEX,
        pointerEvents: 'none',
        bgcolor: theme.custom.overlayBackdropBg,
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Box
        sx={(theme) => ({
          pointerEvents: 'none',
          px: 3,
          py: 2,
          borderRadius: 2,
          bgcolor: theme.custom.overlayPanelBg,
          color: 'text.primary',
          border: `1px solid ${theme.custom.overlayPanelBorder}`,
          boxShadow: 6,
          textAlign: 'center',
        })}
      >
        <Typography variant="h6" sx={{ fontWeight: 600 }}>{t('fileDropTitle')}</Typography>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>{t('fileDropSubtitle')}</Typography>
        {/* Always show the shift-modifier hint so users can discover the selective import feature. */}
        <Typography
          variant="body2"
          sx={(theme) => ({
            mt: 1,
            pt: 1,
            borderTop: `1px solid ${theme.custom.overlayPanelBorder}`,
            opacity: 0.75,
            color: 'primary.light',
            fontStyle: 'italic',
          })}
        >
          {t('fileDropShiftHint')}
        </Typography>
      </Box>
    </Box>
  )
}
