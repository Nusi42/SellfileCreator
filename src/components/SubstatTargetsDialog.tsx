/**
 * SubstatTargetsDialog
 *
 * Lets users edit per-star substatTargets plus the global fallback star. Shares the
 * NumberSpinnerAdornment for consistency with Builder/Testers so pointer/touch
 * interaction stays identical everywhere numeric substatTargets appear.
 */
import React, { useMemo, useRef, useState } from 'react'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import type { Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import { useI18n } from '../lib/i18n'
import { STANDARD_DIALOG_PADDING_BLOCK_UNITS, STANDARD_DIALOG_PADDING_INLINE_UNITS } from '../lib/constants'
import type { SubstatTargetTable, Star } from '../lib/hsfBuilder'
import { defaultSubstatTargets } from '../lib/hsfBuilder'
import { StatVariant, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, statVariantI18nKey, STAT_VARIANTS_PRIORITY } from '../lib/types'
import { focusCycleWithin } from '../lib/focusCycle'
import { createBuilderStatusChipSx } from './builderStatusChipStyles'
import { useDisplayPreferences } from '../state/preferencesState'
import { NumberSpinnerAdornment } from './NumberSpinnerAdornment'
// Use the Markdown-aware tooltip so this dialog inherits the global delay/style and translators can keep plain strings.
import MarkdownTooltip from './MarkdownTooltip'
import { buildWarningBadgeBase } from '../lib/badgeStyles'

type SubstatColorMap = Record<number, { fg: string; bg: string }>
type SubstatTargetStarKey = Exclude<keyof SubstatTargetTable, 'anyRankDefaultsTo'>
// Use stable attributes so focus navigation can target only the value inputs,
// independent of MUI internals or localized aria labels.
const SUBSTAT_TARGET_INPUT_ATTR = 'data-substat-target-input' as const
const SUBSTAT_TARGET_INPUT_STAR_ATTR = 'data-substat-target-star' as const
const SUBSTAT_TARGET_INPUT_VARIANT_ATTR = 'data-substat-target-variant' as const
const SUBSTAT_TARGET_INPUT_SELECTOR = `input[${SUBSTAT_TARGET_INPUT_ATTR}="true"]` as const

export default function SubstatTargetsDialog({
  open,
  onClose,
  substatTargets,
  effectiveSubstatTargets,
  onSubstatTargetsChange,
  substatColors,
  recipeOverridesActive,
}: {
  open: boolean
  onClose: () => void
  substatTargets: SubstatTargetTable
  effectiveSubstatTargets: SubstatTargetTable
  onSubstatTargetsChange: (m: SubstatTargetTable, opts?: { mode?: 'edit' | 'reset' | 'import' }) => void
  substatColors: SubstatColorMap
  recipeOverridesActive: boolean
}) {
  const { t } = useI18n()
  const theme = useTheme()
  const { statButtonBorders: colorStatTexts } = useDisplayPreferences()
  const [confirmResetTargets, setConfirmResetTargets] = useState(false)
  // Key intent: let Tab/Shift+Tab hop between the grid cells (value inputs)
  // without stopping on the spinner adornment buttons in each TextField.
  const substatTargetGridRef = useRef<HTMLDivElement | null>(null)
  const storedFallback = substatTargets.anyRankDefaultsTo
  const fallbackStar: Star = storedFallback ?? 6
  const fallbackChipSx = useMemo(() => createBuilderStatusChipSx(theme), [theme])
  const substatTargetsHelp = t('msgSubstatTargetsHelp')
  const recipeOverridesOverrideHint = t('substatTargetsRecipeOverridesOverrideHint')
  const substatTargetsHelpParagraphs = useMemo(() => substatTargetsHelp.split('\n\n'), [substatTargetsHelp])
  const resolvedEffectiveSubstatTargets = recipeOverridesActive ? effectiveSubstatTargets : substatTargets
  const storedFallbackValue = (substatTargets.anyRankDefaultsTo ?? 6) as Star
  const effectiveFallbackValue = (resolvedEffectiveSubstatTargets.anyRankDefaultsTo ?? 6) as Star
  const anyRankOverrideActive = recipeOverridesActive && storedFallbackValue !== effectiveFallbackValue
  const substatTargetsStarColumns = useMemo(() => ([
    { key: 'six' as SubstatTargetStarKey, label: t('star6'), star: 6 as Star },
    { key: 'five' as SubstatTargetStarKey, label: t('star5'), star: 5 as Star },
    { key: 'four' as SubstatTargetStarKey, label: t('star4'), star: 4 as Star },
    { key: 'three' as SubstatTargetStarKey, label: t('star3'), star: 3 as Star },
    { key: 'two' as SubstatTargetStarKey, label: t('star2'), star: 2 as Star },
    { key: 'one' as SubstatTargetStarKey, label: t('star1'), star: 1 as Star },
  ]), [t])
  const buildAnyRankTooltip = React.useCallback((rankLabel: string): string => {
    // Keep override details on the warning badge; this tooltip stays action-focused.
    return t('substatTargetsUseForAnyTooltip', { rank: rankLabel })
  }, [t])
  const renderOverrideBadge = React.useCallback((tooltip: string, ariaLabel: string) => (
    <MarkdownTooltip markdown={tooltip}>
      <Box
        component="span"
        aria-label={ariaLabel}
        sx={(themeInner) => ({
          ...buildWarningBadgeBase(themeInner),
          cursor: 'default',
          textTransform: 'lowercase',
        })}
      >
        i
      </Box>
    </MarkdownTooltip>
  ), [])

  const updateSubstatTargetValue = React.useCallback((starKey: SubstatTargetStarKey, variantKey: number, nextValue: number) => {
    const slice = substatTargets[starKey]
    const nextSlice = { ...slice, [variantKey]: nextValue }
    onSubstatTargetsChange({ ...substatTargets, [starKey]: nextSlice })
  }, [substatTargets, onSubstatTargetsChange])

  const orderSubstatTargetInputs = React.useCallback((elements: readonly HTMLInputElement[]): readonly HTMLInputElement[] => {
    // Desired Tab order is star-major: 6★ SPD -> 6★ CR% -> ... -> 1★ DEF% -> wrap.
    // DOM order is row-major for grid rendering, so we reconstruct the intended order.
    const byKey = new Map<string, HTMLInputElement>()
    for (const el of elements) {
      const star = el.getAttribute(SUBSTAT_TARGET_INPUT_STAR_ATTR)
      const variant = el.getAttribute(SUBSTAT_TARGET_INPUT_VARIANT_ATTR)
      if (!star || !variant) continue
      byKey.set(`${star}:${variant}`, el)
    }
    const ordered: HTMLInputElement[] = []
    for (const { key: starKey } of substatTargetsStarColumns) {
      for (const variant of STAT_VARIANTS_PRIORITY) {
        const match = byKey.get(`${starKey}:${Number(variant)}`)
        if (match) ordered.push(match)
      }
    }
    // If attributes are missing (unexpected), fall back to DOM order.
    return ordered.length > 0 ? ordered : elements
  }, [substatTargetsStarColumns])

  const renderSubstatTargetInput = (starKey: SubstatTargetStarKey, variantKey: number, statLabel: string, starLabel: string) => {
    // Inputs write straight through to the variant map so Builder/Rule Tester see
    // every keystroke; we still clamp to non-negative integers to match HSF/SFR
    // expectations and keep keyboard/spinner edits in sync.
    const currentValue = Number(substatTargets[starKey]?.[variantKey] ?? 0)
    const effectiveValue = Number(resolvedEffectiveSubstatTargets[starKey]?.[variantKey] ?? 0)
    const valueOverrideActive = recipeOverridesActive && effectiveValue !== currentValue
    const ariaLabel = `${statLabel} ${starLabel}`
    const clampValue = (raw: number): number => {
      if (!Number.isFinite(raw)) return 0
      return Math.max(0, Math.round(raw))
    }
    const commitValue = (next: number) => updateSubstatTargetValue(starKey, variantKey, next)
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
          // Hint for Playwright + internal focus traversal (SSOT selector above).
          [SUBSTAT_TARGET_INPUT_ATTR]: 'true',
          // Provide stable keys so Tab order can be decoupled from DOM order.
          [SUBSTAT_TARGET_INPUT_STAR_ATTR]: starKey,
          [SUBSTAT_TARGET_INPUT_VARIANT_ATTR]: String(variantKey),
          'aria-label': ariaLabel,
          onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
            // Match browser semantics: ignore modified Tab presses (e.g. Ctrl+Tab).
            if (event.key !== 'Tab') return
            if (event.altKey || event.ctrlKey || event.metaKey) return
            const moved = focusCycleWithin({
              container: substatTargetGridRef.current,
              selector: SUBSTAT_TARGET_INPUT_SELECTOR,
              current: event.currentTarget,
              delta: event.shiftKey ? -1 : 1,
              // Users expect to keep tabbing through the grid without escaping.
              wrap: true,
              order: orderSubstatTargetInputs,
            })
            if (!moved) return
            event.preventDefault()
          },
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
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              {valueOverrideActive
                ? renderOverrideBadge(recipeOverridesOverrideHint, recipeOverridesOverrideHint)
                : null}
              <NumberSpinnerAdornment
                ariaLabel={ariaLabel}
                onStep={(delta) => {
                  commitValue(clampValue(currentValue + delta))
                }}
              />
            </Box>
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
        {/* Keep the “use as Any” hint aligned with other Markdown tooltips so translations can add bullet lists. */}
        <MarkdownTooltip markdown={buildAnyRankTooltip(label)}>
          <Chip
            label={label}
            size="small"
            variant="filled"
            clickable
            onClick={() => { if (storedFallback !== star) onSubstatTargetsChange({ ...substatTargets, anyRankDefaultsTo: star }) }}
            aria-pressed={isSelected}
            aria-label={t('substatTargetsUseForAnyAria', { rank: label })}
            sx={isSelected ? baseSx : plainSx}
          />
        </MarkdownTooltip>
        {isSelected && anyRankOverrideActive
          ? renderOverrideBadge(buildAnyRankTooltip(label), t('substatTargetsUseForAnyAria', { rank: label }))
          : null}
      </Box>
    )
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>{t('titleManageSubstatTargets')}</DialogTitle>
        <DialogContent dividers sx={{ px: STANDARD_DIALOG_PADDING_INLINE_UNITS, py: STANDARD_DIALOG_PADDING_BLOCK_UNITS }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
            {substatTargetsHelpParagraphs.map((paragraph, idx) => (
              <Typography key={`help-${idx}`} variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                {renderSubstatTokenizedText(paragraph)}
              </Typography>
            ))}
          </Box>
          <Box
            ref={substatTargetGridRef}
            sx={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1fr) repeat(6, 1fr)', gap: 1, alignItems: 'center' }}
          >
            <Box />
            {substatTargetsStarColumns.map(({ key, label, star }) => (
              <React.Fragment key={`header-${key}`}>
                {starHeaderCell({ label, star })}
              </React.Fragment>
            ))}
            {STAT_VARIANTS_PRIORITY.map((variant) => {
              const label = t(statVariantI18nKey(variant))
              const vKey = Number(variant)
              return (
                <React.Fragment key={`row-${variant}`}>
                  <Typography sx={{ pr: 1 }}>{label}</Typography>
                  {substatTargetsStarColumns.map(({ key, label: starLabel }) => (
                    renderSubstatTargetInput(key, vKey, label, starLabel)
                  ))}
                </React.Fragment>
              )
            })}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: STANDARD_DIALOG_PADDING_INLINE_UNITS, py: STANDARD_DIALOG_PADDING_BLOCK_UNITS }}>
          <Button size="small" variant="outlined" color="error" onClick={() => setConfirmResetTargets(true)}>{t('resetToDefaults')}</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose}>{t('close')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmResetTargets} onClose={() => setConfirmResetTargets(false)}>
        <DialogTitle>{t('titleResetSubstatTargets')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgResetSubstatTargets')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmResetTargets(false)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => { setConfirmResetTargets(false); onSubstatTargetsChange(defaultSubstatTargets(), { mode: 'reset' }) }}>{t('reset')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
/**
 * SubstatTargetsDialog
 *
 * Modal editor for per-star Substat Target tables. Internally operates on
 * variant-keyed substatTargets; presentation uses readable labels.
 */
