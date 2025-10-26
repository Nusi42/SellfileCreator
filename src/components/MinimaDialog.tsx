/**
 * MinimaDialog
 *
 * Lets users edit per-star minima plus the global fallback star. Shares the
 * NumberSpinnerAdornment for consistency with Builder/Testers so pointer/touch
 * interaction stays identical everywhere numeric minima appear.
 */
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
import { NumberSpinnerAdornment } from './NumberSpinnerAdornment'

type SubstatColorMap = Record<number, { fg: string; bg: string }>
type MinimaStarKey = Exclude<keyof MinimaTable, 'anyRankDefaultsTo'>

export default function MinimaDialog({ open, onClose, minima, onMinimaChange, substatColors }: {
  open: boolean
  onClose: () => void
  minima: MinimaTable
  onMinimaChange: (m: MinimaTable, opts?: { mode?: 'edit' | 'reset' | 'import' }) => void
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
  const minimaStarColumns = useMemo(() => ([
    { key: 'six' as MinimaStarKey, label: t('star6'), star: 6 as Star },
    { key: 'five' as MinimaStarKey, label: t('star5'), star: 5 as Star },
    { key: 'four' as MinimaStarKey, label: t('star4'), star: 4 as Star },
    { key: 'three' as MinimaStarKey, label: t('star3'), star: 3 as Star },
    { key: 'two' as MinimaStarKey, label: t('star2'), star: 2 as Star },
    { key: 'one' as MinimaStarKey, label: t('star1'), star: 1 as Star },
  ]), [t])

  const updateMinimaValue = React.useCallback((starKey: MinimaStarKey, variantKey: number, nextValue: number) => {
    const slice = minima[starKey]
    const nextSlice = { ...slice, [variantKey]: nextValue }
    onMinimaChange({ ...minima, [starKey]: nextSlice })
  }, [minima, onMinimaChange])

  const renderMinimaInput = (starKey: MinimaStarKey, variantKey: number, statLabel: string, starLabel: string) => {
    const currentValue = Number(minima[starKey]?.[variantKey] ?? 0)
    const ariaLabel = `${statLabel} ${starLabel}`
    const clampValue = (raw: number): number => {
      if (!Number.isFinite(raw)) return 0
      return Math.max(0, Math.round(raw))
    }
    const commitValue = (next: number) => updateMinimaValue(starKey, variantKey, next)
    return (
      <TextField
        key={`${starKey}-${variantKey}`}
        size="small"
        type="number"
        value={currentValue}
        onChange={(event) => {
          const raw = Number(event.target.value)
          commitValue(clampValue(raw))
        }}
        inputProps={{
          inputMode: 'numeric',
          pattern: '[0-9]*',
          min: 0,
          'aria-label': ariaLabel,
        }}
        sx={(themeInner) => ({
          '& input': {
            textAlign: 'right',
            paddingRight: themeInner.spacing(1),
            paddingLeft: themeInner.spacing(0.25),
          },
          '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
            WebkitAppearance: 'none',
            margin: 0,
          },
          '& input[type=number]': {
            MozAppearance: 'textfield',
          },
        })}
        InputProps={{
          endAdornment: (
            <NumberSpinnerAdornment
              ariaLabel={ariaLabel}
              onStep={(delta) => {
                commitValue(clampValue(currentValue + delta))
              }}
            />
          ),
          sx: { '& > *': { alignItems: 'center' } },
        }}
      />
    )
  }

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
            {minimaStarColumns.map(({ key, label, star }) => (
              <React.Fragment key={`header-${key}`}>
                {starHeaderCell({ label, star })}
              </React.Fragment>
            ))}
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
            ].map(({ label, v }) => {
              const vKey = Number(v)
              return (
                <React.Fragment key={`row-${v}`}>
                  <Typography sx={{ pr: 1 }}>{label}</Typography>
                  {minimaStarColumns.map(({ key, label: starLabel }) => (
                    renderMinimaInput(key, vKey, label, starLabel)
                  ))}
                </React.Fragment>
              )
            })}
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
          <Button color="error" onClick={() => { setConfirmResetMinima(false); onMinimaChange(defaultMinima(), { mode: 'reset' }) }}>{t('reset')}</Button>
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
