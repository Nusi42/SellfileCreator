import { useMemo, type ReactNode } from 'react'
import { Box } from '@mui/material'
import { alpha, useColorScheme, useTheme } from '@mui/material/styles'
import { SUBSTAT_LIGHT_CHIP_BG_ALPHA, SUBSTAT_LIGHT_CHIP_BORDER_ALPHA, resolveSchemePaper } from '../lib/themeCustomTokens'
import type { SxProps, Theme } from '@mui/material/styles'
import type { HsfRule } from '../lib/hsfTypes'
import {
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT,
  statVariantI18nKey,
} from '../lib/types'
import { useI18n } from '../lib/i18n'
import { compositeOnBase, ensureContrastOnBg, parseHexWithAlpha } from '../lib/colorUtils'
import { formatRuleSubstatPlain, normalizeRuleSubstats, substatSupportsColor, maxDigitsForVariant, formatSubstatValueForDisplay, type RuleSubstatDetail } from '../lib/substatDisplay'

export const SUBSTAT_CHIP_BORDER_RADIUS_PX = 8

export function resolveSubstatChipPalette(theme: Theme, params: {
  variant: number
  substatColors: Record<number, { fg: string; bg: string }>
  colorize: boolean
  // Optional; when omitted the function uses theme.custom.substatFallbackBg for the
  // neutral chip surface so callers do not need to supply a palette-mode-aware color.
  fallbackLabelColor?: string
  // Callers inside component render should pass the actual runtime color scheme from
  // useColorScheme(); theme.palette.mode is static when cssVariables is enabled.
  isLight?: boolean
}): { labelColor: string; chipBg: string; chipBorder: string } {
  const { variant, substatColors, colorize } = params
  // CSS variable token used for the fallback label when no caller-supplied color is given.
  const fallbackLabelColor = params.fallbackLabelColor ?? theme.vars?.palette.text.primary ?? theme.palette.text.primary
  const isLight = params.isLight ?? false
  // Active-scheme paper for contrast math (theme.palette.* is frozen to light with cssVariables).
  const schemePaper = resolveSchemePaper(theme, isLight ? 'light' : 'dark')

  // Light mode: the dark BG colors (#1E2E14, #2F1A14 etc.) at 25% alpha on white look muddy.
  // Instead derive chip appearance from the vibrant FG color at low opacity for clean tinted chips.
  // Only enter this branch when a real hex fg color is available; CSS var strings cannot be
  // parsed for contrast calculation.
  if (isLight && colorize) {
    const fgColor = substatColors[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]
    if (fgColor) {
      const chipBgCss = alpha(fgColor, SUBSTAT_LIGHT_CHIP_BG_ALPHA)
      // Resolve the semi-transparent chip bg to opaque hex so ensureContrastOnBg can check it.
      const chipBgHex = compositeOnBase(schemePaper, chipBgCss)
      return {
        chipBg: chipBgCss,
        chipBorder: alpha(fgColor, SUBSTAT_LIGHT_CHIP_BORDER_ALPHA),
        labelColor: ensureContrastOnBg(fgColor, chipBgHex),
      }
    }
  }

  const statBgRaw = colorize ? (substatColors[variant]?.bg ?? DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT[variant]) : undefined
  const parsedBg = parseHexWithAlpha(statBgRaw)
  const rawLabelColor = colorize
    ? (substatColors[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant] ?? fallbackLabelColor)
    : fallbackLabelColor
  if (parsedBg) {
    // User-configured hex bg: alpha is already encoded in the parsed value.
    const chipBg = alpha(parsedBg.base, parsedBg.alpha)
    // True rendered surface = the semi-transparent chip bg composited over scheme paper.
    // ensureContrastOnBg returns the label unchanged when it is a CSS-var token (non-colorize).
    const surface = compositeOnBase(schemePaper, chipBg)
    return { labelColor: ensureContrastOnBg(rawLabelColor, surface), chipBg, chipBorder: chipBg }
  }
  // No user bg: use CSS channel token so the chip surface adapts per scheme without a JS mode check.
  // The fallback tint is a low-alpha neutral over paper, so approximate its surface as scheme paper.
  const chipFallback = theme.custom.substatFallbackBg
  return { labelColor: ensureContrastOnBg(rawLabelColor, schemePaper), chipBg: chipFallback, chipBorder: chipFallback }
}

/**
 * Render the substat summary for Sellfile Preview and helper UIs as compact
 * inline groups with optional coloring and dividers between each group.
 */
export default function RuleSubstatChips({
  substats,
  substatColors,
  wrap = false,
  colorize = true,
  sx,
  normalized: normalizedProp,
}: {
  substats: HsfRule['Substats']
  substatColors: Record<number, { fg: string; bg: string }>
  wrap?: boolean
  colorize?: boolean
  sx?: SxProps
  normalized?: readonly RuleSubstatDetail[]
}) {
  const { t } = useI18n()
  const theme = useTheme()
  // useColorScheme gives the actual runtime scheme; theme.palette.mode is static with cssVariables.
  const { colorScheme } = useColorScheme()
  const isLight = colorScheme === 'light'
  const fallbackNormalized = useMemo(() => normalizeRuleSubstats(substats), [substats])
  const normalized = normalizedProp ?? fallbackNormalized
  if (!normalized || normalized.length === 0) return null

  if (!colorize) {
    const compact = formatRuleSubstatPlain(substats, t, { normalized })
    if (!compact) return null
    return (
      <Box
        component="span"
        sx={{
          display: 'inline',
          whiteSpace: wrap ? 'normal' : 'nowrap',
          ...(sx ?? {}),
        }}
      >
        {compact}
      </Box>
    )
  }

  const segments: ReactNode[] = []
  normalized.forEach((detail) => {
    const label = t(statVariantI18nKey(detail.variant))
    const showThreshold = detail.threshold !== null
    const thresholdColor =
      detail.threshold === 'lte' ? 'error.main' : detail.threshold === 'gte' ? 'success.main' : undefined
    const shouldColorize = colorize && substatSupportsColor(detail.statId)
    const { labelColor, chipBg, chipBorder } = resolveSubstatChipPalette(theme, {
      variant: detail.variant,
      substatColors,
      colorize: shouldColorize,
      fallbackLabelColor: (theme.vars?.palette.text.primary ?? theme.palette.text.primary),
      isLight,
    })
    const showCondition = showThreshold || Boolean(detail.condition)
    const conditionSymbol = showThreshold ? '' : (detail.condition ?? '')
    const value =
      showThreshold || detail.condition
        ? (detail.value !== undefined ? formatSubstatValueForDisplay(detail.variant, detail.value) : '')
        : ''
    const reserveDigits = maxDigitsForVariant(detail.variant)
    // Measure RENDERED characters, not digits: a decimal point occupies a column
    // too, so counting digits alone under-reserved the lane and left decimal
    // values ragged against the integer ones beside them.
    const valueDigits = value.length
    const laneDigits = Math.max(reserveDigits, valueDigits || (showCondition ? 1 : 0))

    segments.push(
      <Box
        key={detail.key}
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          whiteSpace: 'nowrap',
          // MUI sx multiplier: borderRadius: 1 = 1 × theme.shape.borderRadius px.
          borderRadius: 1,
          px: 0.75,
          py: 0.25,
          backgroundColor: chipBg,
          border: '1px solid',
          borderColor: chipBorder,
          gap: showCondition ? 0.4 : 0.2,
        }}
      >
        {detail.negated ? (
          <Box component="span" sx={{ color: 'text.secondary' }}>¬</Box>
        ) : null}
        <Box component="span" sx={{ color: labelColor }}>{label}</Box>
        {showCondition ? (
          <>
            {conditionSymbol ? (
              <Box
                component="span"
                sx={{
                  color: showThreshold
                    ? thresholdColor
                    : colorize
                      ? 'text.secondary'
                      : 'text.primary',
                  fontSize: showThreshold ? '0.85em' : 'inherit',
                  lineHeight: 1,
                }}
              >
                {conditionSymbol}
              </Box>
            ) : null}
            {value ? (
              <Box
                component="span"
                sx={{
                  color: showThreshold
                    ? thresholdColor
                    : colorize
                      ? 'text.secondary'
                      : 'text.primary',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: `${laneDigits}ch`,
                  textAlign: 'right',
                }}
              >
                {value}
              </Box>
            ) : null}
          </>
        ) : null}
      </Box>
    )
  })

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
        flexWrap: wrap ? 'wrap' : 'nowrap',
        gap: wrap ? 0.5 : 0.4,
        maxWidth: '100%',
        ...(sx ?? {}),
      }}
    >
      {segments}
    </Box>
  )
}
