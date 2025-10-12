import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { SxProps } from '@mui/material/styles'
import type { HsfRule } from '../lib/hsfTypes'
import {
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  statVariantI18nKey,
} from '../lib/types'
import { useI18n } from '../lib/i18n'
import { formatRuleSubstatPlain, normalizeRuleSubstats, substatSupportsColor, maxDigitsForVariant } from '../lib/substatDisplay'

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
  normalized.forEach((detail, idx) => {
    if (idx > 0) {
      segments.push(
        <Box
          key={`sep-${detail.key}`}
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            px: wrap ? 0.5 : 0.75,
          }}
        >
          <Box
            component="span"
            sx={{
              width: '1px',
              height: '0.85em',
              borderRadius: '0.5px',
              backgroundColor: (theme) => alpha(theme.palette.text.primary, 0.7),
            }}
          />
        </Box>
      )
    }

    const label = t(statVariantI18nKey(detail.variant))
    const showThreshold = detail.threshold !== null
    const thresholdColor =
      detail.threshold === 'lte' ? 'error.main' : detail.threshold === 'gte' ? 'success.main' : undefined
    const statColor = colorize && substatSupportsColor(detail.statId)
      ? (substatColors[detail.variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[detail.variant])
      : undefined
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
        }}
      >
        {detail.negated ? (
          <Box component="span" sx={{ mr: 0.25, color: 'text.secondary' }}>¬</Box>
        ) : null}
        <Box component="span" sx={{ color: statColor }}>{label}</Box>
        {showCondition ? (
          <>
            {conditionSymbol ? (
              <Box
                component="span"
                sx={{
                  ml: 0.2,
                  mr: value ? 0.2 : 0,
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
                  ml: conditionSymbol ? 0 : 0.35,
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
        rowGap: wrap ? 0.5 : 0,
        columnGap: wrap ? 0.25 : 0,
        maxWidth: '100%',
        ...(sx ?? {}),
      }}
    >
      {segments}
    </Box>
  )
}
