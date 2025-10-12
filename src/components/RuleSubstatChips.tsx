import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import type { SxProps } from '@mui/material/styles'
import type { HsfRule } from '../lib/hsfTypes'
import {
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT,
  statVariantI18nKey,
} from '../lib/types'
import { useI18n } from '../lib/i18n'
import { formatRuleSubstatPlain, normalizeRuleSubstats, substatSupportsColor, maxDigitsForVariant } from '../lib/substatDisplay'

const HEX_WITH_OPTIONAL_ALPHA = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/

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
}: {
  substats: HsfRule['Substats']
  substatColors: Record<number, { fg: string; bg: string }>
  wrap?: boolean
  colorize?: boolean
  sx?: SxProps
}) {
  const { t } = useI18n()
  const theme = useTheme()
  const normalized = normalizeRuleSubstats(substats)
  if (normalized.length === 0) return null

  if (!colorize) {
    const compact = formatRuleSubstatPlain(substats, t)
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
    const statColor = colorize && substatSupportsColor(detail.statId)
      ? (substatColors[detail.variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[detail.variant])
      : undefined
    const statBgRaw = colorize && substatSupportsColor(detail.statId)
      ? (substatColors[detail.variant]?.bg ?? DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT[detail.variant])
      : undefined
    const parsedBg = parseHexWithAlpha(statBgRaw)
    const fallbackBase = theme.palette.text.primary
    const fallbackAlpha = theme.palette.mode === 'dark' ? 0.2 : 0.12
    const chipBase = parsedBg?.base ?? fallbackBase
    const chipAlpha = parsedBg?.alpha ?? fallbackAlpha
    const chipBg = alpha(chipBase, chipAlpha)
    const chipBorder = alpha(chipBase, chipAlpha)
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
          borderRadius: '8px',
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
        <Box component="span" sx={{ color: statColor ?? 'text.primary' }}>{label}</Box>
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
