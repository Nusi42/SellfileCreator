import { Box, Chip } from '@mui/material'
import type { SxProps } from '@mui/material/styles'
import type { HsfRule } from '../lib/hsfTypes'
import {
  compareHsfSubstats,
  DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT,
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  statIsAny,
  statVariantI18nKey,
  StatId,
  subToVariant,
} from '../lib/types'
import { useI18n } from '../lib/i18n'

const KNOWN_SUBSTAT_IDS = new Set<number>([
  StatId.HP,
  StatId.ATK,
  StatId.DEF,
  StatId.SPD,
  StatId.RES,
  StatId.ACC,
  StatId.CR,
  StatId.CDMG,
])

/**
 * Render the colored substat chips identical to the Sellfile Preview table.
 * Shared between the preview table and the cheat sheet to keep styling in sync.
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
  const nonAny = substats?.filter(Boolean)?.filter((x) => !statIsAny(x.ID)).sort(compareHsfSubstats)
  if (!nonAny || nonAny.length === 0) return null

  const cond = (c?: string) => (c === '>=' ? '·' : c === '<=' ? '≤' : c ?? '')

  return (
    <Box
      sx={{
        display: 'inline-flex',
        gap: 0.25,
        alignItems: 'center',
        verticalAlign: 'middle',
        flexWrap: wrap ? 'wrap' : 'nowrap',
        maxWidth: '100%',
        ...(sx ?? {}),
      }}
    >
      {nonAny.map((x, idx) => {
        const neg = x.Condition === '¬'
        const op = !x.Condition || neg ? '' : cond(x.Condition)
        const val = x.Condition === '>=' || x.Condition === '<=' ? String(x.Value) : ''
        const variantKey = subToVariant(x.ID, x.IsFlat)
        const baseLabel = t(statVariantI18nKey(variantKey))
        const label = `${neg ? '¬' : ''}${baseLabel}${op}${val}`

        const highlight = colorize && KNOWN_SUBSTAT_IDS.has(x.ID)
        if (highlight) {
          const fg = (substatColors[variantKey]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variantKey] ?? '#90CAF9') as string
          const bg = (substatColors[variantKey]?.bg ?? DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT[variantKey] ?? '#E3F2FD') as string
          return (
            <Chip
              key={`${x.ID}:${x.IsFlat ? 1 : 0}:${x.Condition ?? ''}:${x.Value ?? ''}:${idx}`}
              size="small"
              label={label}
              variant="outlined"
              sx={{
                height: 18,
                borderColor: fg,
                color: fg,
                bgcolor: bg,
                '& .MuiChip-label': { px: 0.75, py: 0, lineHeight: 1.15 },
              }}
            />
          )
        }

        return (
          <Chip
            key={`${x.ID}:${x.IsFlat ? 1 : 0}:${x.Condition ?? ''}:${x.Value ?? ''}:${idx}`}
            size="small"
            label={label}
            variant="outlined"
            sx={{
              height: 18,
              borderColor: 'text.secondary',
              color: 'inherit',
              bgcolor: 'transparent',
              '& .MuiChip-label': { px: 0.75, py: 0, lineHeight: 1.15 },
            }}
          />
        )
      })}
    </Box>
  )
}
