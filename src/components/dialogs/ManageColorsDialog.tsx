import React from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Slider, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useI18n } from '../../lib/i18n'
import { labelOfVariant, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT, STAT_VARIANTS_PRIORITY } from '../../lib/types'
import ColorField from '../ColorField'

const HEX_ALPHA_PATTERN = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/

function parseHexWithAlpha(color: string, fallback: string): { base: string; alpha: number } {
  const source = typeof color === 'string' && HEX_ALPHA_PATTERN.test(color) ? color : fallback
  const match = HEX_ALPHA_PATTERN.exec(source)
  if (!match) {
    const normalized = HEX_ALPHA_PATTERN.exec(fallback) || null
    const baseFallback = normalized ? `#${normalized[1]!.toUpperCase()}` : '#E3F2FD'
    const alphaFallback = normalized && normalized[2] ? Math.max(0, Math.min(1, parseInt(normalized[2], 16) / 255)) : 1
    return { base: baseFallback, alpha: alphaFallback }
  }
  const base = `#${match[1]!.toUpperCase()}`
  const alpha = match[2] ? Math.max(0, Math.min(1, parseInt(match[2], 16) / 255)) : 1
  return { base, alpha }
}

function formatHexWithAlpha(base: string, alpha: number): string {
  const normalized = Math.max(0, Math.min(1, alpha))
  const upperBase = base.toUpperCase()
  if (normalized >= 0.999) return upperBase
  const alphaHex = Math.round(normalized * 255).toString(16).padStart(2, '0').toUpperCase()
  return `${upperBase}${alphaHex}`
}

export default function ManageColorsDialog(props: {
  open: boolean
  onClose: () => void
  substatColors: Record<number, { fg: string; bg: string }>
  setSubstatColors: React.Dispatch<React.SetStateAction<Record<number, { fg: string; bg: string }>>>
  onReset: () => void
}) {
  const { open, onClose, substatColors, setSubstatColors, onReset } = props
  const { t } = useI18n()
  const [draftAlphas, setDraftAlphas] = React.useState<Record<number, number>>({})

  React.useEffect(() => {
    if (!open) setDraftAlphas({})
  }, [open])
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { width: { xs: '100%', sm: 640 }, maxWidth: 'calc(100vw - 32px)' } }}
    >
      <DialogTitle>{t('titleSubstatChipColors')}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('msgChooseColors')}</Typography>
        <Stack spacing={1.25}>
          {STAT_VARIANTS_PRIORITY.map((vk) => {
            const defaultFg = (DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? '#90CAF9') as string
            const defaultBg = (DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT[vk] ?? '#E3F2FD') as string
            const fg = (substatColors[vk]?.fg ?? defaultFg) as string
            const bg = (substatColors[vk]?.bg ?? defaultBg) as string
            const { base: baseBg, alpha: alphaValue } = parseHexWithAlpha(bg, defaultBg)
            const storedPct = Math.round(alphaValue * 100)
            const sliderPct = draftAlphas[vk] ?? storedPct
            const clampedPct = Math.max(0, Math.min(100, sliderPct))
            const sliderAlpha = clampedPct / 100
            const displayHex = formatHexWithAlpha(baseBg, sliderAlpha)
            const previewBg = alpha(baseBg, sliderAlpha)
            const previewBorder = alpha(baseBg, sliderAlpha)

            const handleTextColorChange = (nextFg: string) => {
              setSubstatColors(prev => ({ ...prev, [vk]: { fg: nextFg, bg: displayHex } }))
            }

            const handleBgColorChange = (nextColor: string) => {
              const parsed = parseHexWithAlpha(nextColor, displayHex)
              const hasExplicitAlpha = nextColor.length === 9
              const nextPct = hasExplicitAlpha ? Math.round(parsed.alpha * 100) : clampedPct
              const normalizedPct = Math.max(0, Math.min(100, nextPct))
              const committedHex = formatHexWithAlpha(parsed.base, normalizedPct / 100)
              setDraftAlphas(prev => {
                const next = { ...prev }
                delete next[vk]
                return next
              })
              setSubstatColors(prev => ({ ...prev, [vk]: { fg: prev[vk]?.fg ?? fg, bg: committedHex } }))
            }

            const handleSliderChange = (_: Event | React.SyntheticEvent, value: number | number[]) => {
              const raw = Array.isArray(value) ? value[0] : value
              if (typeof raw !== 'number') return
              const pct = Math.max(0, Math.min(100, raw))
              setDraftAlphas(prev => (prev[vk] === pct ? prev : { ...prev, [vk]: pct }))
            }

            const handleSliderCommit = (_: Event | React.SyntheticEvent, value: number | number[]) => {
              const raw = Array.isArray(value) ? value[0] : value
              const pct = typeof raw === 'number' ? raw : clampedPct
              const normalized = Math.max(0, Math.min(100, pct))
              const committedHex = formatHexWithAlpha(baseBg, normalized / 100)
              setDraftAlphas(prev => {
                const next = { ...prev }
                delete next[vk]
                return next
              })
              setSubstatColors(prev => ({ ...prev, [vk]: { fg: prev[vk]?.fg ?? fg, bg: committedHex } }))
            }

            return (
              <Box key={`row-${vk}`} sx={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center', gap: 1.25 }}>
                <Typography sx={{ minWidth: 136 }}>{labelOfVariant(vk)}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                  <ColorField value={fg} onChange={handleTextColorChange} label={t('labelText')} />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <ColorField value={displayHex} onChange={handleBgColorChange} label={t('labelBg')} allowAlpha />
                    <Slider
                      value={clampedPct}
                      min={0}
                      max={100}
                      step={5}
                      onChange={handleSliderChange}
                      onChangeCommitted={handleSliderCommit}
                      valueLabelDisplay="auto"
                      sx={{ width: 148, minWidth: 124 }}
                      aria-label={t('labelBg')}
                    />
                  </Box>
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      borderRadius: '8px',
                      px: 0.75,
                      py: 0.25,
                      bgcolor: previewBg,
                      border: '1px solid',
                      borderColor: previewBorder,
                      color: fg,
                      fontSize: '0.85rem',
                    }}
                  >
                    {labelOfVariant(vk)}
                  </Box>
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
