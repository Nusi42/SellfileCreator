import { useMemo, type ReactNode } from 'react'
import { Box } from '@mui/material'
import { alpha, darken, useTheme } from '@mui/material/styles'
import type { SxProps, Theme } from '@mui/material/styles'
import type { HsfRule } from '../lib/hsfTypes'
import {
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT,
  statVariantI18nKey,
} from '../lib/types'
import { useI18n } from '../lib/i18n'
import { formatRuleSubstatPlain, normalizeRuleSubstats, substatSupportsColor, maxDigitsForVariant, type RuleSubstatDetail } from '../lib/substatDisplay'

const HEX_WITH_OPTIONAL_ALPHA = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/

export const SUBSTAT_CHIP_BORDER_RADIUS_PX = 8

export function resolveSubstatChipPalette(theme: Theme, params: {
  variant: number
  substatColors: Record<number, { fg: string; bg: string }>
  colorize: boolean
  fallbackLabelColor: string
}): { labelColor: string; chipBg: string; chipBorder: string } {
  const { variant, substatColors, colorize, fallbackLabelColor } = params
  const isLight = theme.palette.mode === 'light'

  // Light mode: the dark BG colors (#1E2E14, #2F1A14 etc.) at 25% alpha on white look muddy.
  // Instead derive chip appearance from the vibrant FG color at low opacity for clean tinted chips.
  if (isLight && colorize) {
    const fgColor = substatColors[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant] ?? fallbackLabelColor
    return {
      chipBg: alpha(fgColor, 0.15),
      chipBorder: alpha(fgColor, 0.25),
      labelColor: darken(fgColor, 0.45),
    }
  }

  const statBgRaw = colorize ? (substatColors[variant]?.bg ?? DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT[variant]) : undefined
  const parsedBg = parseHexWithAlpha(statBgRaw)
  const fallbackBase = fallbackLabelColor
  const fallbackAlpha = isLight ? 0.12 : 0.2
  const chipBase = parsedBg?.base ?? fallbackBase
  const chipAlpha = parsedBg?.alpha ?? fallbackAlpha
  const chipBg = alpha(chipBase, chipAlpha)
  const chipBorder = alpha(chipBase, chipAlpha)
  const labelColor = colorize
    ? (substatColors[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant] ?? fallbackLabelColor)
    : fallbackLabelColor
  return { labelColor, chipBg, chipBorder }
}

function parseHexWithAlpha(value: string | undefined): { base: string; alpha: number } | null {
  if (typeof value !== 'string') return null
  const match = HEX_WITH_OPTIONAL_ALPHA.exec(value.trim())
  if (!match) return null
  const base = `#${match[1]!.toUpperCase()}`
  const alphaByte = match[2] ? parseInt(match[2], 16) : 255
  const alpha = Number.isNaN(alphaByte) ? 1 : Math.max(0, Math.min(1, alphaByte / 255))
  return { base, alpha }
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
      fallbackLabelColor: theme.palette.text.primary,
    })
    const showCondition = showThreshold || Boolean(detail.condition)
    const conditionSymbol = showThreshold ? '' : (detail.condition ?? '')
    const value =
      showThreshold || detail.condition
        ? (detail.value !== undefined ? String(detail.value) : '')
        : ''
    const reserveDigits = maxDigitsForVariant(detail.variant)
    const valueDigits = value ? value.replace(/[^0-9]/g, '').length : 0
    const laneDigits = Math.max(reserveDigits, valueDigits || (showCondition ? 1 : 0))

    segments.push(
      <Box
        key={detail.key}
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          whiteSpace: 'nowrap',
          borderRadius: `${SUBSTAT_CHIP_BORDER_RADIUS_PX}px`,
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
