import type { MouseEvent } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import { useI18n } from '../../lib/i18n'
import { MENU_CONTROL_HEIGHT_PX } from '../../lib/constants'
import {
  FINAL_SELL_DEFAULT_SETS_MODE,
  FINAL_SELL_SETS_MODE_ANY,
  FINAL_SELL_SETS_MODE_EXPLICIT,
  type FinalSellRemainderConfig,
  type FinalSellSetsMode,
} from '../../lib/finalSell'

const LEVEL_CHOICES: Array<{ key: 0|4|8|12|16; label: string }> = [
  { key: 0, label: '0–3' },
  { key: 4, label: '4–7' },
  { key: 8, label: '8–11' },
  { key: 12, label: '12–15' },
  { key: 16, label: '16' },
]

export default function FinalSellDialog(props: {
  open: boolean
  value: FinalSellRemainderConfig
  onChange: (next: FinalSellRemainderConfig) => void
  onClose: () => void
  onReset?: () => void
}) {
  const { open, value, onChange, onClose, onReset } = props
  const { t } = useI18n()
  const hasGear = value.artifacts || value.accessories
  const hasLevelRanges = value.levels.length > 0
  const finalSellActive = hasGear && hasLevelRanges
  const statusWordKey = finalSellActive ? 'hintFinalSellStatusWordOn' : 'hintFinalSellStatusWordOff'
  const statusDetailKey = finalSellActive ? 'hintFinalSellStatusOnDetail' : 'hintFinalSellStatusOffDetail'
  const setsMode: FinalSellSetsMode = value.setsMode ?? FINAL_SELL_DEFAULT_SETS_MODE
  const handleSetsModeChange = (_: MouseEvent<HTMLElement>, next: FinalSellSetsMode | null) => {
    if (!next) return
    onChange({ ...value, setsMode: next })
  }
  const toggleLevel = (lvl: 0|4|8|12|16) => {
    const next = new Set(value.levels)
    if (next.has(lvl)) next.delete(lvl); else next.add(lvl)
    onChange({ ...value, levels: Array.from(next.values()).sort((a,b)=>a-b) as Array<0|4|8|12|16> })
  }
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t('titleFinalSellRules')}</DialogTitle>
      <DialogContent data-tour-id="finalsell.dialog">
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{t('msgFinalSellExplainer')}</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography variant="body2">{t('labelFinalSellSetsMode')}</Typography>
              <ToggleButtonGroup
                exclusive
                value={setsMode}
                onChange={handleSetsModeChange}
                size="small"
                sx={{ alignSelf: 'flex-start' }}
              >
                <ToggleButton
                  value={FINAL_SELL_SETS_MODE_ANY}
                  sx={{
                    minHeight: MENU_CONTROL_HEIGHT_PX,
                    height: MENU_CONTROL_HEIGHT_PX,
                    lineHeight: 1,
                    px: 1.25,
                    py: 0,
                    borderWidth: 1,
                    borderColor: (theme) => theme.palette.grey[300],
                    color: (theme) => theme.palette.text.secondary,
                    backgroundColor: 'transparent',
                    '&:hover': {
                      borderColor: (theme) => theme.palette.grey[400],
                      color: (theme) => theme.palette.text.primary,
                      backgroundColor: (theme) => theme.palette.action.hover,
                    },
                    '&.Mui-selected': {
                      bgcolor: (theme) => theme.palette.warning.main,
                      color: (theme) => theme.palette.common.black,
                      borderColor: (theme) => theme.palette.warning.main,
                      '&:hover': { bgcolor: (theme) => theme.palette.warning.dark },
                    },
                  }}
                >
                  {t('finalSellSetsModeAny')}
                </ToggleButton>
                <ToggleButton
                  value={FINAL_SELL_SETS_MODE_EXPLICIT}
                  sx={{
                    minHeight: MENU_CONTROL_HEIGHT_PX,
                    height: MENU_CONTROL_HEIGHT_PX,
                    lineHeight: 1,
                    px: 1.25,
                    py: 0,
                    borderWidth: 1,
                    borderColor: (theme) => theme.palette.grey[300],
                    color: (theme) => theme.palette.text.secondary,
                    backgroundColor: 'transparent',
                    '&:hover': {
                      borderColor: (theme) => theme.palette.grey[400],
                      color: (theme) => theme.palette.text.primary,
                      backgroundColor: (theme) => theme.palette.action.hover,
                    },
                    '&.Mui-selected': {
                      bgcolor: (theme) => theme.palette.warning.main,
                      color: (theme) => theme.palette.common.black,
                      borderColor: (theme) => theme.palette.warning.main,
                      '&:hover': { bgcolor: (theme) => theme.palette.warning.dark },
                    },
                  }}
                >
                  {t('finalSellSetsModeExplicit')}
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Alert
              severity="warning"
              variant="outlined"
              color="warning"
              sx={{
                minHeight: 120,
                display: 'flex',
                alignItems: 'flex-start',
                whiteSpace: 'pre-line',
              }}
            >
              {setsMode === FINAL_SELL_SETS_MODE_EXPLICIT ? t('msgFinalSellExplicitSetsWarning') : t('msgFinalSellAnySetsWarning')}
            </Alert>
          </Box>
          <Box sx={{ display: { xs: 'block', sm: 'grid' }, gridTemplateColumns: { sm: 'auto minmax(0, 1fr)' }, columnGap: { sm: 2 } }}>
            <Box>
              <Box data-tour-id="finalsell.dialog.types">
                <Typography variant="body2" sx={{ mb: 0.5 }}>{t('labelGearToSell')}</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
                  <ToggleButton
                    value="artifacts"
                    selected={value.artifacts}
                    onClick={(e) => { e.preventDefault(); onChange({ ...value, artifacts: !value.artifacts }) }}
                    sx={{
                      minHeight: MENU_CONTROL_HEIGHT_PX,
                      height: MENU_CONTROL_HEIGHT_PX,
                      lineHeight: 1,
                      px: 1.25,
                      py: 0,
                      mr: 1,
                      borderWidth: 1,
                      borderColor: (theme) => theme.palette.grey[300],
                      color: (theme) => theme.palette.text.secondary,
                      backgroundColor: 'transparent',
                      '&:hover': {
                        borderColor: (theme) => theme.palette.grey[400],
                        color: (theme) => theme.palette.text.primary,
                        backgroundColor: (theme) => theme.palette.action.hover,
                      },
                      '&.Mui-selected': {
                        bgcolor: (theme) => theme.palette.warning.main,
                        color: (theme) => theme.palette.common.black,
                        borderColor: (theme) => theme.palette.warning.main,
                        '&:hover': { bgcolor: (theme) => theme.palette.warning.dark },
                      },
                    }}
                  >{t('artifacts')}</ToggleButton>
                  <ToggleButton
                    value="accessories"
                    selected={value.accessories}
                    onClick={(e) => { e.preventDefault(); onChange({ ...value, accessories: !value.accessories }) }}
                    sx={{
                      minHeight: MENU_CONTROL_HEIGHT_PX,
                      height: MENU_CONTROL_HEIGHT_PX,
                      lineHeight: 1,
                      px: 1.25,
                      py: 0,
                      mr: 1,
                      borderWidth: 1,
                      borderColor: (theme) => theme.palette.grey[300],
                      color: (theme) => theme.palette.text.secondary,
                      backgroundColor: 'transparent',
                      '&:hover': {
                        borderColor: (theme) => theme.palette.grey[400],
                        color: (theme) => theme.palette.text.primary,
                        backgroundColor: (theme) => theme.palette.action.hover,
                      },
                      '&.Mui-selected': {
                        bgcolor: (theme) => theme.palette.warning.main,
                        color: (theme) => theme.palette.common.black,
                        borderColor: (theme) => theme.palette.warning.main,
                        '&:hover': { bgcolor: (theme) => theme.palette.warning.dark },
                      },
                    }}
                  >{t('accessories')}</ToggleButton>
                </Box>
              </Box>
              <Box data-tour-id="finalsell.dialog.levels" sx={{ mt: 1.5 }}>
                <Typography variant="body2" sx={{ mb: 0.5 }}>{t('labelLevelRanges')}</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                  {LEVEL_CHOICES.map(({ key, label }) => {
                    const isSelected = value.levels.includes(key)
                    const button = (
                      <ToggleButton
                        key={key}
                        value={key}
                        selected={isSelected}
                        size="small"
                        onClick={(e) => { e.preventDefault(); toggleLevel(key) }}
                        sx={{
                          minWidth: 64,
                          px: 1,
                          py: 0.5,
                          mr: 1,
                          mb: 1,
                          borderWidth: 1,
                          borderColor: (theme) => theme.palette.grey[300],
                          color: (theme) => theme.palette.text.secondary,
                          backgroundColor: 'transparent',
                          '&:hover': {
                            borderColor: (theme) => theme.palette.grey[400],
                            color: (theme) => theme.palette.text.primary,
                            backgroundColor: (theme) => theme.palette.action.hover,
                          },
                          '&.Mui-selected': {
                            bgcolor: (theme) => theme.palette.warning.main,
                            color: (theme) => theme.palette.common.black,
                            borderColor: (theme) => (key === 16 ? theme.palette.error.main : theme.palette.warning.main),
                            boxShadow: (theme) => `inset 0 0 0 1px ${key === 16 ? theme.palette.error.main : theme.palette.warning.main}`,
                            '&:hover': { bgcolor: (theme) => theme.palette.warning.dark },
                          },
                        }}
                      >{label}</ToggleButton>
                    )
                    if (key === 16) {
                      return (
                        <Tooltip
                          key={key}
                          title={t('offByDefaultTooltip')}
                        >
                          {/* Wrap in span to satisfy Tooltip's single child requirement */}
                          <span>{button}</span>
                        </Tooltip>
                      )
                    }
                    return button
                  })}
                </Box>
              </Box>
            </Box>
            <Box
              sx={{
                mt: { xs: 1.5, sm: 0 },
                alignSelf: { sm: 'center' },
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {t('hintFinalSellStatusLead')}{' '}
                <Box
                  component="span"
                  sx={{ color: (theme) => theme.palette.warning.main, fontWeight: 600 }}
                >
                  {t(statusWordKey)}
                </Box>
                {'. '}
                {t(statusDetailKey)}
              </Typography>
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        {onReset && (
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={onReset}
            sx={{ mr: 'auto' }}
          >
            {t('resetToDefaults')}
          </Button>
        )}
        <Button onClick={onClose} data-tour-id="finalsell.dialog.close">{t('close')}</Button>
      </DialogActions>
    </Dialog>
  )
}
