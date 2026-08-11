/**
 * SubstatTargetsTabContent
 *
 * Reusable content area for the Substat Targets editor — renders the help text,
 * star-header row, and input grid without any Dialog chrome. Used as a tab inside
 * the Tools (Logic Hub) dialog.
 */
import { scopeColorsText } from '../lib/colorScope'
import React, { useMemo, useRef, useState } from 'react'
import { Box, Chip, TextField, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import type { Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import { useI18n } from '../lib/i18n'
import { StatLabel } from './StatLabel'
import { STANDARD_DIALOG_PADDING_BLOCK_UNITS, STANDARD_DIALOG_PADDING_INLINE_UNITS } from '../lib/constants'
import type { SubstatTargetTable, Star } from '../lib/hsfBuilder'
import { ANOMALOUS_SUBSTAT_VARIANTS, StatVariant, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, statVariantI18nKey, STAT_VARIANTS_PRIORITY } from '../lib/types'
// PROVISIONAL(anomalous): shared hover copy + decimal gating for the mode-damage rows.
import { anomalousSubstatTooltipMarkdown } from '../lib/substatDisplay'
import { ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE, isAnomalousSubstatVariant } from '../lib/anomalousAccessories'
import { useSubstatFgAdapter } from '../lib/themeContrastHooks'
import { focusCycleWithin } from '../lib/focusCycle'
import { createBuilderStatusChipSx } from './builderStatusChipStyles'
import { useDisplayPreferences } from '../state/preferencesState'
import { NumberSpinnerAdornment, HIDE_NATIVE_NUMBER_SPINNER_SX } from './NumberSpinnerAdornment'
import MarkdownTooltip from './MarkdownTooltip'
import { buildWarningBadgeBase } from '../lib/badgeStyles'
import { reserveScrollbarGutterSpace } from '../lib/scrollbar'
import { TINT } from '../lib/colorTints'

type SubstatColorMap = Record<number, { fg: string; bg: string }>
type SubstatTargetStarKey = Exclude<keyof SubstatTargetTable, 'anyRankDefaultsTo'>

const SUBSTAT_TARGET_INPUT_ATTR = 'data-substat-target-input' as const
const SUBSTAT_TARGET_INPUT_STAR_ATTR = 'data-substat-target-star' as const
const SUBSTAT_TARGET_INPUT_VARIANT_ATTR = 'data-substat-target-variant' as const
const SUBSTAT_TARGET_INPUT_SELECTOR = `input[${SUBSTAT_TARGET_INPUT_ATTR}="true"]` as const

export function SubstatTargetsTabContent({
  substatTargets,
  effectiveSubstatTargets,
  onSubstatTargetsChange,
  recipeOverridesActive,
  substatColors,
}: {
  substatTargets: SubstatTargetTable
  effectiveSubstatTargets: SubstatTargetTable
  onSubstatTargetsChange: (m: SubstatTargetTable, opts?: { mode?: 'edit' | 'reset' | 'import' }) => void
  recipeOverridesActive: boolean
  substatColors: SubstatColorMap
}) {
  const { t } = useI18n()
  const theme = useTheme()
  // colorStatTexts drives whether ACC/SPD tokens in help text render in stat colors.
  const { statColorScope } = useDisplayPreferences()
  const colorStatTexts = scopeColorsText(statColorScope)
  // Contrast-correct stat token colors for legible text on the active scheme's surface.
  const adaptStatFg = useSubstatFgAdapter()

  const substatTargetGridRef = useRef<HTMLDivElement | null>(null)
  // Focused-cell raw text (see renderSubstatTargetInput) — one active editor at a time.
  const [substatTargetDraft, setSubstatTargetDraft] = useState<{ key: string; text: string } | null>(null)
  // The stored fallback is which star column's values apply when a recipe uses "Any Rank".
  const storedFallback = substatTargets.anyRankDefaultsTo
  // Reuse the builder status chip style for the selected star-header chip.
  const fallbackChipSx = useMemo(() => createBuilderStatusChipSx(theme), [theme])
  const substatTargetsHelp = t('msgSubstatTargetsHelp')
  const recipeOverridesOverrideHint = t('substatTargetsRecipeOverridesOverrideHint')
  // Split the help text on blank lines so each paragraph renders as its own Typography block.
  const substatTargetsHelpParagraphs = useMemo(() => substatTargetsHelp.split('\n\n'), [substatTargetsHelp])
  // When recipe overrides are active, show the effective (merged) values rather than stored ones.
  const resolvedEffectiveSubstatTargets = recipeOverridesActive ? effectiveSubstatTargets : substatTargets
  const storedFallbackValue = (substatTargets.anyRankDefaultsTo ?? 6) as Star
  const effectiveFallbackValue = (resolvedEffectiveSubstatTargets.anyRankDefaultsTo ?? 6) as Star
  // Track whether a recipe override has changed the fallback star so we can badge the header cell.
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

  // Writes a single cell value back into the matching star-column slice.
  const updateSubstatTargetValue = React.useCallback((starKey: SubstatTargetStarKey, variantKey: number, nextValue: number) => {
    const slice = substatTargets[starKey]
    // Spread to avoid mutating the existing slice reference.
    const nextSlice = { ...slice, [variantKey]: nextValue }
    onSubstatTargetsChange({ ...substatTargets, [starKey]: nextSlice })
  }, [substatTargets, onSubstatTargetsChange])

  // Produces a stable Tab-order across the grid: column-major (star → stat)
  // so pressing Tab moves down each star column before advancing to the next.
  const orderSubstatTargetInputs = React.useCallback((elements: readonly HTMLInputElement[]): readonly HTMLInputElement[] => {
    // Index each input by its star+variant key for O(1) lookup.
    const byKey = new Map<string, HTMLInputElement>()
    for (const el of elements) {
      const star = el.getAttribute(SUBSTAT_TARGET_INPUT_STAR_ATTR)
      const variant = el.getAttribute(SUBSTAT_TARGET_INPUT_VARIANT_ATTR)
      if (!star || !variant) continue
      byKey.set(`${star}:${variant}`, el)
    }
    // Walk columns then rows to produce the desired Tab sequence.
    const ordered: HTMLInputElement[] = []
    for (const { key: starKey } of substatTargetsStarColumns) {
      // Classic substats plus the PROVISIONAL(anomalous) accessory-only ones.
      for (const variant of [...STAT_VARIANTS_PRIORITY, ...ANOMALOUS_SUBSTAT_VARIANTS]) {
        const match = byKey.get(`${starKey}:${Number(variant)}`)
        if (match) ordered.push(match)
      }
    }
    // Fall back to DOM order when the lookup produced nothing.
    return ordered.length > 0 ? ordered : elements
  }, [substatTargetsStarColumns])

  const renderSubstatTargetInput = (starKey: SubstatTargetStarKey, variantKey: number, statLabel: string, starLabel: string) => {
    // Read both stored and effective values so the override badge can compare them.
    const currentValue = Number(substatTargets[starKey]?.[variantKey] ?? 0)
    const effectiveValue = Number(resolvedEffectiveSubstatTargets[starKey]?.[variantKey] ?? 0)
    // Show the override badge when a recipe override has shifted this cell's value.
    const valueOverrideActive = recipeOverridesActive && effectiveValue !== currentValue
    const ariaLabel = `${statLabel} ${starLabel}`
    // PROVISIONAL(anomalous): mode-damage cells keep 2-decimal precision (1.25 grid)
    // and their spinner steps by the observed per-line value; classic stats stay
    // integral — the engine's branch runtime quantizes them to i32.
    const cellAllowsDecimals = isAnomalousSubstatVariant(variantKey)
    const spinnerStep = cellAllowsDecimals ? ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE : 1
    const clampValue = (raw: number): number => {
      if (!Number.isFinite(raw)) return 0
      if (cellAllowsDecimals) return Math.max(0, Math.round(raw * 100) / 100)
      return Math.max(0, Math.round(raw))
    }
    const commitValue = (next: number) => updateSubstatTargetValue(starKey, variantKey, next)
    // While a cell has focus its raw text lives in draft state, so intermediate
    // decimal input ("1.", "1.2") survives the controlled re-render instead of
    // being normalized away mid-keystroke. Blur drops the draft back to the value.
    const cellKey = `${starKey}:${variantKey}`
    const draftText = substatTargetDraft?.key === cellKey ? substatTargetDraft.text : null
    return (
      <TextField
        key={`${starKey}-${variantKey}`}
        size="small"
        type="number"
        value={draftText ?? currentValue}
        onChange={(event) => {
          const text = event.target.value
          setSubstatTargetDraft({ key: cellKey, text })
          const raw = Number(text)
          // Commit every parseable draft immediately; empty text just waits.
          if (text.trim() !== '' && Number.isFinite(raw)) commitValue(clampValue(raw))
        }}
        onBlur={() => {
          setSubstatTargetDraft((current) => (current?.key === cellKey ? null : current))
        }}
        slotProps={{
          htmlInput: {
            inputMode: 'decimal',
            step: 'any',
            min: 0,
            [SUBSTAT_TARGET_INPUT_ATTR]: 'true',
            [SUBSTAT_TARGET_INPUT_STAR_ATTR]: starKey,
            [SUBSTAT_TARGET_INPUT_VARIANT_ATTR]: String(variantKey),
            'aria-label': ariaLabel,
            onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
              if (event.key !== 'Tab') return
              if (event.altKey || event.ctrlKey || event.metaKey) return
              const moved = focusCycleWithin({
                container: substatTargetGridRef.current,
                selector: SUBSTAT_TARGET_INPUT_SELECTOR,
                current: event.currentTarget,
                delta: event.shiftKey ? -1 : 1,
                wrap: true,
                order: orderSubstatTargetInputs,
              })
              if (!moved) return
              event.preventDefault()
            },
          },
          input: {
            endAdornment: (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                {valueOverrideActive
                  ? renderOverrideBadge(recipeOverridesOverrideHint, recipeOverridesOverrideHint)
                  : null}
                <NumberSpinnerAdornment
                  ariaLabel={ariaLabel}
                  onStep={(delta) => {
                    // Anomalous cells walk the 1.25 grid; classic cells step by 1.
                    commitValue(clampValue(currentValue + delta * spinnerStep))
                  }}
                />
              </Box>
            ),
            sx: { '& > *': { alignItems: 'center' } },
          },
        }}
        sx={(themeInner) => ({
          '& input': {
            textAlign: 'right',
            paddingRight: themeInner.spacing(1),
            paddingLeft: themeInner.spacing(0.25),
          },
          ...HIDE_NATIVE_NUMBER_SPINNER_SX,
        })}
      />
    )
  }

  // Replaces [ACC] and [SPD] tokens in help text with localized, optionally colored spans.
  // Only these two stats need special call-outs in the help copy.
  const renderSubstatTokenizedText = (text: string) => {
    const tokens: React.ReactNode[] = []
    const regex = /\[(ACC|SPD)\]/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      // Push any plain text that precedes this token.
      if (match.index > lastIndex) {
        tokens.push(text.slice(lastIndex, match.index))
      }
      const variant = match[1] === 'ACC' ? StatVariant.ACC : StatVariant.SPD
      if (colorStatTexts) {
        // Resolve the foreground color from user's custom map, falling back to palette defaults.
        const color = adaptStatFg(substatColors[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]) ?? theme.palette.text.primary
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
        // Plain text fallback when stat coloring is disabled.
        tokens.push(t(statVariantI18nKey(variant)))
      }
      lastIndex = regex.lastIndex
    }
    // Append any trailing text after the last token.
    if (lastIndex < text.length) tokens.push(text.slice(lastIndex))
    return tokens
  }

  // Renders a star column header as a clickable Chip that sets the "Any Rank" fallback.
  // Selected star uses the active builder-status chip style; others render as plain text.
  // When a recipe override is active, highlight the effective fallback star rather than the
  // stored one so the user sees which column is actually in use.
  const starHeaderCell = ({ label, star }: { label: string; star: Star }) => {
    const isSelected = effectiveFallbackValue === star
    // baseSx comes from the shared builder status chip factory so the selected chip
    // stays visually consistent with recipe-level status chips elsewhere in the UI.
    const baseSx = (fallbackChipSx(true) ?? {}) as SystemStyleObject<Theme>
    // Override baseSx for the non-selected state: transparent background, secondary text.
    const plainSx: SystemStyleObject<Theme> = {
      ...baseSx,
      backgroundColor: 'transparent',
      color: (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
      border: 'none',
      '& .MuiChip-label': {
        px: theme.spacing(0.5),
        fontWeight: theme.typography.fontWeightMedium ?? 500,
        color: (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
      },
      '&.MuiChip-clickable:hover': {
        backgroundColor: alpha(theme.palette.text.primary, (theme.vars?.palette.action.hoverOpacity ?? theme.palette.action.hoverOpacity) ?? 0.08),
      },
      '&.MuiChip-clickable:active': {
        backgroundColor: alpha(theme.palette.text.primary, ((theme.vars?.palette.action.hoverOpacity ?? theme.palette.action.hoverOpacity) ?? 0.08) * 1.5),
      },
      '&.Mui-focusVisible': {
        outline: `2px solid ${TINT.neutralOutlineStrong}`,
        outlineOffset: 2,
      },
    }
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
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
          ? renderOverrideBadge(recipeOverridesOverrideHint, recipeOverridesOverrideHint)
          : null}
      </Box>
    )
  }

  return (
    <Box
      sx={(theme) => ({
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        px: STANDARD_DIALOG_PADDING_INLINE_UNITS,
        py: STANDARD_DIALOG_PADDING_BLOCK_UNITS,
        ...reserveScrollbarGutterSpace({
          reserveStart: false,
          basePaddingInlineEnd: theme.spacing(STANDARD_DIALOG_PADDING_INLINE_UNITS),
        }),
      })}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
        {substatTargetsHelpParagraphs.map((paragraph) => (
          <Typography key={`help-${paragraph.slice(0, 40)}`} variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
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
        {/* Classic substats plus the PROVISIONAL(anomalous) accessory-only ones — the
            anomalous rows start empty (no known roll values); users may enter judged
            targets once the game update lands. */}
        {[...STAT_VARIANTS_PRIORITY, ...ANOMALOUS_SUBSTAT_VARIANTS].map((variant) => {
          const label = t(statVariantI18nKey(variant))
          const vKey = Number(variant)
          // PROVISIONAL(anomalous): glyph-token rows explain themselves on hover.
          const anomalousTooltip = anomalousSubstatTooltipMarkdown(Number(variant), t)
          const rowLabel = <Typography sx={{ pr: 1 }}><StatLabel variant={variant} /></Typography>
          return (
            <React.Fragment key={`row-${variant}`}>
              {/* Row stat-name label — TEXT context (display, not a control). */}
              {anomalousTooltip
                ? <MarkdownTooltip markdown={anomalousTooltip}>{rowLabel}</MarkdownTooltip>
                : rowLabel}
              {substatTargetsStarColumns.map(({ key, label: starLabel }) => (
                renderSubstatTargetInput(key, vKey, label, starLabel)
              ))}
            </React.Fragment>
          )
        })}
      </Box>
    </Box>
  )
}
