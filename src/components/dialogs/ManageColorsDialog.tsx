import React from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import { useI18n } from '../../lib/i18n'
import { StatVariant, labelOfVariant, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT } from '../../lib/types'
import ColorField from '../ColorField'
import { Chip as MuiChip } from '@mui/material'

export default function ManageColorsDialog(props: {
  open: boolean
  onClose: () => void
  substatColors: Record<number, { fg: string; bg: string }>
  setSubstatColors: React.Dispatch<React.SetStateAction<Record<number, { fg: string; bg: string }>>>
  onReset: () => void
}) {
  const { open, onClose, substatColors, setSubstatColors, onReset } = props
  const { t } = useI18n()
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('titleSubstatChipColors')}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('msgChooseColors')}</Typography>
        <Stack spacing={1.25}>
          {[ 
            StatVariant.HP_FLAT,
            StatVariant.HP,
            StatVariant.ATK_FLAT,
            StatVariant.ATK,
            StatVariant.DEF_FLAT,
            StatVariant.DEF,
            StatVariant.SPD,
            StatVariant.RES,
            StatVariant.ACC,
            StatVariant.CR,
            StatVariant.CDMG,
          ].map((vk) => {
            const fg = (substatColors[vk]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? '#90CAF9') as string
            const bg = (substatColors[vk]?.bg ?? DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT[vk] ?? '#E3F2FD') as string
            return (
              <Box key={`row-${vk}`} sx={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ minWidth: 120 }}>{labelOfVariant(vk)}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                  <ColorField value={fg} onChange={(v) => setSubstatColors(prev => ({ ...prev, [vk]: { fg: v, bg } }))} label={t('labelText')} />
                  <ColorField value={bg} onChange={(v) => setSubstatColors(prev => ({ ...prev, [vk]: { fg, bg: v } }))} label={t('labelBg')} />
                  <MuiChip size="small" label={labelOfVariant(vk)} variant="outlined" sx={{ height: 18, borderColor: fg, color: fg, bgcolor: bg, '& .MuiChip-label': { px: 0.75, py: 0 } }} />
                </Box>
              </Box>
            )
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button size="small" variant="outlined" color="error" onClick={onReset}>{t('resetToDefaults')}</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  )
}
