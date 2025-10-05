import React, { useMemo, useState } from 'react'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Tooltip, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import type { Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import { useI18n } from '../lib/i18n'
import type { MinimaTable, Star } from '../lib/hsfBuilder'
import { defaultMinima } from '../lib/hsfBuilder'
import { StatVariant, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, statVariantI18nKey } from '../lib/types'
import { createBuilderStatusChipSx } from './builderStatusChipStyles'
import { useDisplayPreferences } from '../state/preferencesState'

type SubstatColorMap = Record<number, { fg: string; bg: string }>

export default function MinimaDialog({ open, onClose, minima, onMinimaChange, substatColors }: {
  open: boolean
  onClose: () => void
  minima: MinimaTable
  onMinimaChange: (m: MinimaTable) => void
  substatColors: SubstatColorMap
}) {
  const { t } = useI18n()
  const theme = useTheme()
  const { statButtonBorders: colorStatTexts } = useDisplayPreferences()
  const [confirmResetMinima, setConfirmResetMinima] = useState(false)
  const storedFallback = minima.anyRankDefaultsTo
  const fallbackStar: Star = storedFallback ?? 6
  const fallbackChipSx = useMemo(() => createBuilderStatusChipSx(theme), [theme])
  const minimaHelp = t('msgMinimaHelp')
  const minimaHelpParagraphs = useMemo(() => minimaHelp.split('\n\n'), [minimaHelp])

  const renderSubstatTokenizedText = (text: string) => {
    const tokens: React.ReactNode[] = []
    const regex = /\[(ACC|SPD)\]/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        tokens.push(text.slice(lastIndex, match.index))
      }
      const variant = match[1] === 'ACC' ? StatVariant.ACC : StatVariant.SPD
      if (colorStatTexts) {
        const color = substatColors[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant] ?? theme.palette.text.primary
        tokens.push(
          <Box
            key={`${match.index}-${match[1]}`}
            component="span"
            sx={{ color, fontWeight: theme.typography.fontWeightMedium ?? 500 }}
          >
            {t(statVariantI18nKey(variant))}
          </Box>,
        )
      } else {
        tokens.push(t(statVariantI18nKey(variant)))
      }
      lastIndex = regex.lastIndex
    }
    if (lastIndex < text.length) tokens.push(text.slice(lastIndex))
    return tokens
  }

  const starHeaderCell = ({ label, star }: { label: string; star: Star }) => {
    const isSelected = fallbackStar === star
    const baseSx = (fallbackChipSx(true) ?? {}) as SystemStyleObject<Theme>
    const plainSx: SystemStyleObject<Theme> = {
      ...baseSx,
      backgroundColor: 'transparent',
      color: theme.palette.text.secondary,
      border: 'none',
      '& .MuiChip-label': {
        px: theme.spacing(0.5),
        fontWeight: theme.typography.fontWeightMedium ?? 500,
        color: theme.palette.text.secondary,
      },
      '&.MuiChip-clickable:hover': {
        backgroundColor: alpha(theme.palette.text.primary, theme.palette.action.hoverOpacity ?? 0.08),
      },
      '&.MuiChip-clickable:active': {
        backgroundColor: alpha(theme.palette.text.primary, (theme.palette.action.hoverOpacity ?? 0.08) * 1.5),
      },
      '&.Mui-focusVisible': {
        outline: `2px solid ${alpha(theme.palette.text.primary, 0.4)}`,
        outlineOffset: 2,
      },
    }
    return (
      <Tooltip title={t('minimaUseForAnyTooltip', { rank: label })}>
        <Chip
          label={label}
          size="small"
          variant="filled"
          clickable
          onClick={() => { if (storedFallback !== star) onMinimaChange({ ...minima, anyRankDefaultsTo: star }) }}
          aria-pressed={isSelected}
          aria-label={t('minimaUseForAnyAria', { rank: label })}
          sx={isSelected ? baseSx : plainSx}
        />
      </Tooltip>
    )
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>{t('titleManageMinima')}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
            {minimaHelpParagraphs.map((paragraph, idx) => (
              <Typography key={`help-${idx}`} variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                {renderSubstatTokenizedText(paragraph)}
              </Typography>
            ))}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1fr) repeat(6, 1fr)', gap: 1, alignItems: 'center' }}>
            <Box />
            {starHeaderCell({ label: t('star6'), star: 6 })}
            {starHeaderCell({ label: t('star5'), star: 5 })}
            {starHeaderCell({ label: t('star4'), star: 4 })}
            {starHeaderCell({ label: t('star3'), star: 3 })}
            {starHeaderCell({ label: t('star2'), star: 2 })}
            {starHeaderCell({ label: t('star1'), star: 1 })}
            {[
              { label: 'HP', v: StatVariant.HP_FLAT },
              { label: 'HP%', v: StatVariant.HP },
              { label: 'ATK', v: StatVariant.ATK_FLAT },
              { label: 'ATK%', v: StatVariant.ATK },
              { label: 'DEF', v: StatVariant.DEF_FLAT },
              { label: 'DEF%', v: StatVariant.DEF },
              { label: 'SPD', v: StatVariant.SPD },
              { label: 'RES', v: StatVariant.RES },
              { label: 'ACC', v: StatVariant.ACC },
              { label: 'CR%', v: StatVariant.CR },
              { label: 'CDMG%', v: StatVariant.CDMG },
            ].map(({ label, v }) => (
              <React.Fragment key={`row-${v}`}>
                <Typography sx={{ pr: 1 }}>{label}</Typography>
                {(() => { const vKey = Number(v); return (
                  <>
                    <TextField size="small" type="number" value={String(minima.six[vKey] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, six: { ...minima.six, [vKey]: v } }) }} />
                    <TextField size="small" type="number" value={String(minima.five[vKey] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, five: { ...minima.five, [vKey]: v } }) }} />
                  </>
                )})()}
                {(() => { const vKey = Number(v); return (
                  <>
                    <TextField size="small" type="number" value={String(minima.four[vKey] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, four: { ...minima.four, [vKey]: v } }) }} />
                    <TextField size="small" type="number" value={String(minima.three[vKey] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, three: { ...minima.three, [vKey]: v } }) }} />
                    <TextField size="small" type="number" value={String(minima.two[vKey] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, two: { ...minima.two, [vKey]: v } }) }} />
                    <TextField size="small" type="number" value={String(minima.one[vKey] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, one: { ...minima.one, [vKey]: v } }) }} />
                  </>
                )})()}
              </React.Fragment>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button size="small" variant="outlined" color="error" onClick={() => setConfirmResetMinima(true)}>{t('resetToDefaults')}</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose}>{t('close')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmResetMinima} onClose={() => setConfirmResetMinima(false)}>
        <DialogTitle>{t('titleResetMinima')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgResetMinima')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmResetMinima(false)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => { setConfirmResetMinima(false); onMinimaChange(defaultMinima()) }}>{t('reset')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
/**
 * MinimaDialog
 *
 * Modal editor for per-star substat minima tables. Internally operates on
 * variant-keyed minima; presentation uses readable labels.
 */
