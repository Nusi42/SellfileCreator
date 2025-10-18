import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import type { SxProps, Theme } from '@mui/material/styles'
import { useI18n } from '../lib/i18n'
import { useDisplayPreferences } from '../state/preferencesState'
import { renderColoredStatText, type SubstatColorMap } from '../lib/renderColoredStatText'
import { artifactTypeIconList } from './artifactTypeIcons'
import { compareVariants, type StatVariantLike, statVariantI18nKey } from '../lib/types'

export interface BuilderTooltipContentProps {
  text: string
  colorizeStats?: boolean
  substatColors?: SubstatColorMap
}

// Formats builder tooltips into readable blocks with optional bullet lists.
export function BuilderTooltipContent({ text, colorizeStats = false, substatColors }: BuilderTooltipContentProps) {
  const { t } = useI18n()
  const { statButtonBorders: colorStatTexts } = useDisplayPreferences()
  const shouldColorize = colorizeStats && colorStatTexts
  const colors = substatColors ?? {}
  const theme = useTheme<Theme>()

  const lines = text
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return null
  }

  type Segment = { type: 'text' | 'list'; lines: string[] }

  const segments = lines.reduce<Segment[]>((acc, rawLine) => {
    const trimmedStart = rawLine.trimStart()
    const isBullet = trimmedStart.startsWith('•')
    if (isBullet) {
      const content = trimmedStart.slice(1).trimStart()
      if (content.length === 0) return acc
      return [...acc, { type: 'list', lines: [content] }]
    }
    const last = acc[acc.length - 1]
    if (last && last.type === 'list' && rawLine.startsWith(' ')) {
      last.lines.push(rawLine)
      return acc
    }
    if (last && last.type === 'text') {
      last.lines.push(rawLine)
      return acc
    }
    return [...acc, { type: 'text', lines: [rawLine] }]
  }, [])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, maxWidth: 560 }}>
      {segments.map((segment, segmentIdx) => {
        if (segment.type === 'text') {
          return segment.lines.map((line, lineIdx) =>
            renderPossibleStructuredLine({
              line,
              key: `text-${segmentIdx}-${lineIdx}`,
              shouldColorize,
              colors,
              theme,
              translate: t,
            }),
          )
        }
        return (
          <Box
            component="ul"
            key={`list-${segmentIdx}`}
            sx={{
              pl: 2,
              m: 0,
              listStyleType: 'disc',
              listStylePosition: 'outside',
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
            }}
          >
            {segment.lines.map((line, lineIdx) => (
              <Box component="li" key={`list-${segmentIdx}-${lineIdx}`} sx={{ p: 0 }}>
                {renderPossibleStructuredLine({
                  line,
                  key: `list-${segmentIdx}-${lineIdx}`,
                  shouldColorize,
                  colors,
                  theme,
                  translate: t,
                  asBlock: true,
                })}
              </Box>
            ))}
          </Box>
        )
      })}
    </Box>
  )
}

type StructuredSlotsDiff = {
  kind: 'slotsDiff'
  label: string
  previous: number[]
  next: number[]
  previousText?: string | undefined
  nextText?: string | undefined
}

type StructuredMainStatsDiff = {
  kind: 'mainStatsDiff'
  label: string
  previous: number[]
  next: number[]
  previousText?: string
  nextText?: string
}

type StructuredSubstatsDiff = {
  kind: 'substatsDiff'
  label: string
  previous: number[]
  previousLocked: number[]
  previousBounds?: Record<number, { min?: number; max?: number }>
  next: number[]
  nextLocked: number[]
  nextBounds?: Record<number, { min?: number; max?: number }>
  autoFlexPrev?: boolean
  autoFlexNext?: boolean
  previousText?: string
  nextText?: string
}

type StructuredDiffPayload = StructuredSlotsDiff | StructuredMainStatsDiff | StructuredSubstatsDiff

function parseStructuredDiff(line: string): StructuredDiffPayload | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null
  try {
    const parsed = JSON.parse(trimmed) as StructuredDiffPayload
    if (parsed && typeof parsed.kind === 'string') {
      if (parsed.kind === 'slotsDiff' && Array.isArray(parsed.previous) && Array.isArray(parsed.next)) return parsed
      if (parsed.kind === 'mainStatsDiff' && Array.isArray(parsed.previous) && Array.isArray(parsed.next)) return parsed
      if (parsed.kind === 'substatsDiff' && Array.isArray(parsed.previous) && Array.isArray(parsed.next)) return parsed
    }
  } catch {
    return null
  }
  return null
}

type RenderStructuredLineParams = {
  line: string
  key: string
  shouldColorize: boolean
  colors: SubstatColorMap
  theme: Theme
  translate: ReturnType<typeof useI18n>['t']
  asBlock?: boolean
}

function renderPossibleStructuredLine(params: RenderStructuredLineParams): JSX.Element {
  const { line, key, shouldColorize, colors, theme, translate: t, asBlock = false } = params
  const structured = parseStructuredDiff(line)
  if (structured) {
    return (
      <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {renderStructuredDiff({ payload: structured, shouldColorize, colors, theme, t })}
      </Box>
    )
  }
  return (
    <Typography
      variant="body2"
      key={key}
      component={asBlock ? 'span' : 'p'}
      sx={{ whiteSpace: 'pre-wrap', m: asBlock ? 0 : undefined }}
    >
      {shouldColorize
        ? renderColoredStatText((key) => t(key), line, colors, true)
        : line}
    </Typography>
  )
}

function renderStructuredDiff(params: {
  payload: StructuredDiffPayload
  shouldColorize: boolean
  colors: SubstatColorMap
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
}): React.ReactNode {
  const { payload, shouldColorize, colors, theme, t } = params
  switch (payload.kind) {
    case 'slotsDiff':
      return renderDiffSection(payload.label, renderSlotsDiff(payload, theme, t))
    case 'mainStatsDiff':
      return renderDiffSection(payload.label, renderStatsDiff({
        previous: payload.previous,
        next: payload.next,
        lockedPrev: new Set<number>(),
        lockedNext: new Set<number>(),
        shouldColorize,
        colors,
        theme,
        t,
        ...(payload.previousText ? { previousText: payload.previousText } : {}),
        ...(payload.nextText ? { nextText: payload.nextText } : {}),
      }))
    case 'substatsDiff':
      return renderDiffSection(payload.label, renderSubstatsDiff({
        data: payload,
        shouldColorize,
        colors,
        theme,
        t,
      }))
    default:
      return null
  }
}

function renderDiffSection(label: string, content: React.ReactNode): React.ReactNode {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
      {content}
    </Box>
  )
}

function renderSlotsDiff(payload: StructuredSlotsDiff, theme: Theme, t: ReturnType<typeof useI18n>['t']): React.ReactNode {
  const prev = normalizeIds(payload.previous)
  const next = normalizeIds(payload.next)
  const leftNode = prev.length === 0
    ? <Typography variant="body2" color="text.secondary">{payload.previousText ?? t('any')}</Typography>
    : renderSlotIconGrid(prev, theme, t)
  const rightNode = next.length === 0
    ? <Typography variant="body2" color="text.secondary">{payload.nextText ?? t('any')}</Typography>
    : renderSlotIconGrid(next, theme, t)
  return renderDiffGrid({
    left: leftNode,
    right: rightNode,
    theme,
  })
}

function renderSubstatsDiff(params: {
  data: StructuredSubstatsDiff
  shouldColorize: boolean
  colors: SubstatColorMap
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
}): React.ReactNode {
  const { data, shouldColorize, colors, theme, t } = params
  const prevLocked = new Set<number>(normalizeIds(data.previousLocked))
  const nextLocked = new Set<number>(normalizeIds(data.nextLocked))
  const content = renderDiffGrid({
    left: renderStatChips({
      variants: data.previous,
      locked: prevLocked,
      shouldColorize,
      colors,
      theme,
      t,
      ...(data.previousText ? { fallbackText: data.previousText } : {}),
      bounds: data.previousBounds ?? {},
    }),
    right: renderStatChips({
      variants: data.next,
      locked: nextLocked,
      shouldColorize,
      colors,
      theme,
      t,
      ...(data.nextText ? { fallbackText: data.nextText } : {}),
      bounds: data.nextBounds ?? {},
    }),
    theme,
  })
  const autoFlexChanged = data.autoFlexPrev !== data.autoFlexNext
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {content}
      {autoFlexChanged ? (
        <Typography variant="caption" color="text.secondary">
          {`${data.autoFlexPrev ? t('builderFlexChipOn') : t('builderFlexChipOff')} → ${data.autoFlexNext ? t('builderFlexChipOn') : t('builderFlexChipOff')}`}
        </Typography>
      ) : null}
    </Box>
  )
}

function renderStatsDiff(params: {
  previous: number[]
  next: number[]
  lockedPrev: Set<number>
  lockedNext: Set<number>
  shouldColorize: boolean
  colors: SubstatColorMap
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
  previousText?: string
  nextText?: string
}): React.ReactNode {
  const { previous, next, lockedPrev, lockedNext, shouldColorize, colors, theme, t, previousText, nextText } = params
  return renderDiffGrid({
    left: renderStatChips({
      variants: previous,
      locked: lockedPrev,
      shouldColorize,
      colors,
      theme,
      t,
      ...(previousText ? { fallbackText: previousText } : {}),
      bounds: {},
    }),
    right: renderStatChips({
      variants: next,
      locked: lockedNext,
      shouldColorize,
      colors,
      theme,
      t,
      ...(nextText ? { fallbackText: nextText } : {}),
      bounds: {},
    }),
    theme,
  })
}

function renderDiffGrid(params: { left: React.ReactNode; right: React.ReactNode; theme: Theme }): React.ReactNode {
  const { left, right, theme } = params
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        columnGap: 1,
        alignItems: 'center',
        rowGap: 0.5,
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{left}</Box>
      <Typography variant="body2" color={theme.palette.text.secondary}>→</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{right}</Box>
    </Box>
  )
}

function renderSlotIconGrid(ids: readonly number[], theme: Theme, t: ReturnType<typeof useI18n>['t']): React.ReactNode {
  if (!ids.length) {
    return <Typography variant="body2" color="text.secondary">{t('any')}</Typography>
  }
  const selected = new Set(ids)
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 16px)',
        gridAutoRows: '16px',
        gap: 0.5,
      }}
    >
      {artifactTypeIconList.map(({ id, Icon }) => {
        const isSelected = selected.has(Number(id))
        return (
          <Box
            key={`slot-${id}`}
            sx={{
              width: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              opacity: isSelected ? 1 : 0.25,
              color: isSelected ? theme.palette.text.primary : theme.palette.text.disabled,
            }}
          >
            <Icon fontSize="inherit" />
          </Box>
        )
      })}
    </Box>
  )
}

function renderStatChips(params: {
  variants: number[]
  locked: Set<number>
  shouldColorize: boolean
  colors: SubstatColorMap
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
  fallbackText?: string | undefined
  bounds?: Record<number, { min?: number; max?: number }>
}): React.ReactNode {
  const { variants, locked, shouldColorize, colors, theme, t, fallbackText, bounds } = params
  const normalized = normalizeIds(variants).sort(compareVariants)
  if (normalized.length === 0) {
    return <Typography variant="body2" color="text.secondary">{fallbackText ?? t('any')}</Typography>
  }
  return normalized.map((variant) => {
    const lockedFlag = locked.has(variant)
    const colorEntry = colors[variant] ?? null
    const fg = shouldColorize && colorEntry ? colorEntry.fg : theme.palette.text.primary
    const bg = shouldColorize && colorEntry ? colorEntry.bg : alpha(theme.palette.text.primary, 0.08)
    const label = t(statVariantI18nKey(variant as StatVariantLike))
    const rollBounds = bounds ? bounds[variant] : undefined
    const min = rollBounds?.min
    const max = rollBounds?.max
    const indicator = makeRollIndicator({
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      theme,
    })
    const chipSx: SxProps<Theme> = {
      height: 22,
      borderRadius: 1,
      bgcolor: bg,
      color: fg,
      '& .MuiChip-label': {
        px: 0.75,
        fontSize: '0.75rem',
        lineHeight: 1.2,
      },
      border: lockedFlag ? `1px solid ${fg}` : '1px solid transparent',
      ...(lockedFlag ? { fontWeight: 600 } : {}),
    }
    return (
      <Chip
        key={`stat-${variant}-${lockedFlag ? 'locked' : 'unlocked'}`}
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box component="span">{label}</Box>
            {lockedFlag ? <Box component="span" aria-hidden="true">🔒</Box> : null}
            {indicator}
          </Box>
        }
        size="small"
        sx={chipSx}
      />
    )
  })
}

function makeRollIndicator(params: { min?: number; max?: number; theme: Theme }): React.ReactNode {
  const { min, max, theme } = params
  if (max === undefined && min === undefined) return null
  const showCap = max !== undefined
  const value = showCap ? max! : min!
  const color = showCap ? theme.palette.error.main : theme.palette.success.main
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        borderRadius: '50%',
        bgcolor: color,
        color: theme.palette.getContrastText(color),
        fontSize: '0.65rem',
        lineHeight: 1,
        fontWeight: 600,
      }}
    >
      {value}
    </Box>
  )
}

function normalizeIds(values: unknown): number[] {
  if (!Array.isArray(values)) return []
  const out: number[] = []
  for (const entry of values) {
    const num = Number(entry)
    if (Number.isFinite(num)) out.push(num)
  }
  return out
}
