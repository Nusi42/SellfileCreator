import type { JSX } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import type { SxProps, Theme } from '@mui/material/styles'
import { GLYPH_ARROW_RIGHT } from '../lib/constants'
import { useI18n } from '../lib/i18n'
import { useDisplayPreferences } from '../state/preferencesState'
import { renderColoredStatText, type SubstatColorMap, type HighlightSpec } from '../lib/renderColoredStatText'
import { artifactTypeIconList } from './artifactTypeIcons'
import { SetIcon, gearSetIconSrc } from './SetIcon'
import { compareArtifactSets, compareVariants, type ArtifactSetId, type StatVariantLike, statVariantI18nKey, getLocalizedGearSetName } from '../lib/types'

export interface BuilderTooltipContentProps {
  text: string
  colorizeStats?: boolean
  substatColors?: SubstatColorMap
}

// Formats builder tooltips into readable blocks with optional bullet lists.
const TOOLTIP_MAX_WIDTH_PX = 720

/**
 * Build a stable, non-index key for an element inside a string array.
 * Uses the string value itself; when the same value appears more than once
 * a 1-based occurrence suffix is appended so every key stays unique.
 */
function dedupKey(arr: string[], idx: number): string {
  const val = arr[idx] ?? ''
  // Count how many times this value appears before the current position.
  let occBefore = 0
  for (let i = 0; i < idx; i++) { if (arr[i] === val) occBefore++ }
  // Only append an occurrence suffix when the value is duplicated in the array.
  const total = arr.filter((v) => v === val).length
  return total > 1 ? `${val}__${occBefore + 1}` : val
}

export function BuilderTooltipContent({ text, colorizeStats = false, substatColors }: BuilderTooltipContentProps) {
  const { t, lang } = useI18n()
  const { statButtonBorders: colorStatTexts, showSetIcons } = useDisplayPreferences()
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

  // Build stable keys for segments: prefix with type and use a running
  // occurrence counter so duplicate segment types still get unique keys.
  const segmentKeys = (() => {
    const counts: Record<string, number> = {}
    return segments.map((seg) => {
      const n = (counts[seg.type] = (counts[seg.type] ?? 0) + 1)
      return `${seg.type}-${n}`
    })
  })()

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, maxWidth: TOOLTIP_MAX_WIDTH_PX }}>
      {segments.map((segment, segmentIdx) => {
        // Stable key for this segment (not index-based).
        const segKey = segmentKeys[segmentIdx]
        if (segment.type === 'text') {
          return segment.lines.map((line, lineIdx) =>
            renderPossibleStructuredLine({
              line,
              key: `${segKey}-L${dedupKey(segment.lines, lineIdx)}`,
              shouldColorize,
              colors,
              theme,
              translate: t,
              lang,
              useSetIcons: showSetIcons,
            }),
          )
        }
        return (
          <Box
            component="ul"
            key={segKey}
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
              <Box component="li" key={`${segKey}-L${dedupKey(segment.lines, lineIdx)}`} sx={{ p: 0 }}>
                {renderPossibleStructuredLine({
                  line,
                  key: `${segKey}-L${dedupKey(segment.lines, lineIdx)}`,
                  shouldColorize,
                  colors,
                  theme,
                  translate: t,
                  asBlock: true,
                  lang,
                  useSetIcons: showSetIcons,
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

type StructuredRollBounds = {
  min?: number
  max?: number
  any?: boolean
}

type StructuredSubstatsDiff = {
  kind: 'substatsDiff'
  label: string
  previous: number[]
  previousLocked: number[]
  previousBounds?: Record<number, StructuredRollBounds>
  next: number[]
  nextLocked: number[]
  nextBounds?: Record<number, StructuredRollBounds>
  autoFlexPrev?: boolean
  autoFlexNext?: boolean
  previousText?: string
  nextText?: string
}

type StructuredTextGridDiff = {
  kind: 'textGridDiff'
  label: string
  previousLines?: string[]
  nextLines?: string[]
  previousFallback?: string
  nextFallback?: string
}

type StructuredSetListDiff = {
  kind: 'setListDiff'
  label: string
  previous: number[]
  next: number[]
  previousExcluded?: number[]
  nextExcluded?: number[]
  previousText?: string
  nextText?: string
}

type StructuredMetasetEntry = {
  id: string
  name: string
  icon?: string | null
}

type StructuredMetasetDiff = {
  kind: 'metasetDiff'
  label: string
  previous: StructuredMetasetEntry[]
  next: StructuredMetasetEntry[]
  previousFallback?: string
  nextFallback?: string
}

type StructuredSlotsSnapshot = {
  kind: 'slotsSnapshot'
  label: string
  values: number[]
  fallbackText?: string
}

type StructuredMainStatsSnapshot = {
  kind: 'mainStatsSnapshot'
  label: string
  values: number[]
  fallbackText?: string
}

type StructuredSubstatsSnapshot = {
  kind: 'substatsSnapshot'
  label: string
  variants: number[]
  locked: number[]
  bounds?: Record<number, StructuredRollBounds>
  autoFlex?: boolean
  fallbackText?: string
}

type StructuredSetListSnapshot = {
  kind: 'setListSnapshot'
  label: string
  values: number[]
  excluded?: number[]
  fallbackText?: string
}

type StructuredMetasetSnapshot = {
  kind: 'metasetSnapshot'
  label: string
  entries: StructuredMetasetEntry[]
  fallbackText?: string
}

type StructuredDiffPayload =
  | StructuredSlotsDiff
  | StructuredMainStatsDiff
  | StructuredSubstatsDiff
  | StructuredTextGridDiff
  | StructuredSetListDiff
  | StructuredMetasetDiff
  | StructuredSlotsSnapshot
  | StructuredMainStatsSnapshot
  | StructuredSubstatsSnapshot
  | StructuredSetListSnapshot
  | StructuredMetasetSnapshot

function parseStructuredDiff(line: string): StructuredDiffPayload | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null
  try {
    const parsed = JSON.parse(trimmed) as StructuredDiffPayload
    if (parsed && typeof parsed.kind === 'string') {
      if (parsed.kind === 'slotsDiff' && Array.isArray(parsed.previous) && Array.isArray(parsed.next)) return parsed
      if (parsed.kind === 'mainStatsDiff' && Array.isArray(parsed.previous) && Array.isArray(parsed.next)) return parsed
      if (parsed.kind === 'substatsDiff' && Array.isArray(parsed.previous) && Array.isArray(parsed.next)) return parsed
      if (parsed.kind === 'textGridDiff') return parsed
      if (parsed.kind === 'setListDiff' && Array.isArray(parsed.previous) && Array.isArray(parsed.next)) return parsed
      if (parsed.kind === 'metasetDiff' && Array.isArray(parsed.previous) && Array.isArray(parsed.next)) return parsed
      if (parsed.kind === 'slotsSnapshot' && Array.isArray(parsed.values)) return parsed
      if (parsed.kind === 'mainStatsSnapshot' && Array.isArray(parsed.values)) return parsed
      if (parsed.kind === 'substatsSnapshot' && Array.isArray(parsed.variants)) return parsed
      if (parsed.kind === 'setListSnapshot' && Array.isArray(parsed.values)) return parsed
      if (parsed.kind === 'metasetSnapshot' && Array.isArray(parsed.entries)) return parsed
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
  lang: string
  useSetIcons: boolean
}

function renderPossibleStructuredLine(params: RenderStructuredLineParams): JSX.Element {
  const { line, key, shouldColorize, colors, theme, translate: t, asBlock = false, useSetIcons, lang } = params
  const structured = parseStructuredDiff(line)
  if (structured) {
    return (
      <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {renderStructuredDiff({ payload: structured, shouldColorize, colors, theme, t, useSetIcons, lang })}
      </Box>
    )
  }
  // Highlight the shared diff arrow glyph so history lines read clearly.
  const arrowHighlights: HighlightSpec[] = [
    {
      token: GLYPH_ARROW_RIGHT,
      sx: { color: (theme.vars?.palette.info.main ?? theme.palette.info.main), fontWeight: 'inherit' },
    },
  ]
  return (
    <Typography
      variant="body2"
      key={key}
      component={asBlock ? 'span' : 'p'}
      sx={{ whiteSpace: 'pre-wrap', m: asBlock ? 0 : undefined }}
    >
      {renderColoredStatText((token) => t(token), line, colors, shouldColorize, arrowHighlights)}
    </Typography>
  )
}

function renderStructuredDiff(params: {
  payload: StructuredDiffPayload
  shouldColorize: boolean
  colors: SubstatColorMap
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
  lang: string
  useSetIcons: boolean
}): React.ReactNode {
  const { payload, shouldColorize, colors, theme, t, lang, useSetIcons } = params
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
        showLockIcon: false,
        showRollIndicator: false,
      }))
    case 'substatsDiff':
      return renderDiffSection(payload.label, renderSubstatsDiff({
        data: payload,
        shouldColorize,
        colors,
        theme,
        t,
      }))
    case 'textGridDiff':
      return renderDiffSection(payload.label, renderTextGridDiff(payload, theme, t))
    case 'setListDiff':
      return renderDiffSection(payload.label, renderSetListDiff({
        payload,
        theme,
        t,
        lang,
        useIcons: useSetIcons,
      }))
    case 'metasetDiff':
      return renderDiffSection(payload.label, renderMetasetDiff({
        payload,
        theme,
        t,
        lang,
      }))
    case 'slotsSnapshot':
      // Snapshot payloads reuse the same visual language but collapse to a single column.
      return renderDiffSection(payload.label, renderSlotsSnapshot({ payload, theme, t }))
    case 'mainStatsSnapshot':
      return renderDiffSection(payload.label, renderStatsSnapshot({
        payload,
        shouldColorize,
        colors,
        theme,
        t,
      }))
    case 'substatsSnapshot':
      return renderDiffSection(payload.label, renderSubstatsSnapshot({
        payload,
        shouldColorize,
        colors,
        theme,
        t,
      }))
    case 'setListSnapshot':
      return renderDiffSection(payload.label, renderSetListSnapshot({
        payload,
        theme,
        t,
        lang,
        useIcons: useSetIcons,
      }))
    case 'metasetSnapshot':
      return renderDiffSection(payload.label, renderMetasetSnapshot({ payload, theme, t, lang }))
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
    layout: 'compact',
  })
}

function renderTextGridDiff(payload: StructuredTextGridDiff, theme: Theme, t: ReturnType<typeof useI18n>['t']): React.ReactNode {
  const previousLines = normalizeStringLines(payload.previousLines)
  const nextLines = normalizeStringLines(payload.nextLines)
  const previousFallback = typeof payload.previousFallback === 'string' && payload.previousFallback.trim().length > 0
    ? payload.previousFallback
    : t('any')
  const nextFallback = typeof payload.nextFallback === 'string' && payload.nextFallback.trim().length > 0
    ? payload.nextFallback
    : t('any')
  return renderDiffGrid({
    left: renderTextGridCell(previousLines, previousFallback),
    right: renderTextGridCell(nextLines, nextFallback),
    theme,
  })
}

const SET_ICON_GRID_MAX_COLUMNS = 6
const SET_ICON_CELL_PX = 36
const SET_TEXT_ROW_MIN_HEIGHT_PX = 28

function renderSetListDiff(params: {
  payload: StructuredSetListDiff
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
  lang: string
  useIcons: boolean
}): React.ReactNode {
  const { payload, theme, t, lang, useIcons } = params
  const previousIds = normalizeIds(payload.previous)
  const nextIds = normalizeIds(payload.next)
  const previousExcluded = normalizeIds(payload.previousExcluded ?? [])
  const nextExcluded = normalizeIds(payload.nextExcluded ?? [])
  const union = buildSetUnion(previousIds, nextIds)
  const hasExcluded = previousExcluded.length > 0 || nextExcluded.length > 0
  if (union.length === 0) {
    const previousFallback = (payload.previousText ?? '').trim().length > 0 ? payload.previousText! : t('any')
    const nextFallback = (payload.nextText ?? '').trim().length > 0 ? payload.nextText! : t('any')
    if (hasExcluded) {
      return renderDiffGrid({
        left: renderExcludedSetLabels({ ids: previousExcluded, theme, t, lang }) ?? (
          <Typography variant="body2" color="text.secondary">{previousFallback}</Typography>
        ),
        right: renderExcludedSetLabels({ ids: nextExcluded, theme, t, lang }) ?? (
          <Typography variant="body2" color="text.secondary">{nextFallback}</Typography>
        ),
        theme,
        layout: 'compact',
      })
    }
    return renderDiffGrid({
      left: <Typography variant="body2" color="text.secondary">{previousFallback}</Typography>,
      right: <Typography variant="body2" color="text.secondary">{nextFallback}</Typography>,
      theme,
      layout: 'compact',
    })
  }
  const previousSet = new Set(previousIds)
  const nextSet = new Set(nextIds)
  const leftExcluded = renderExcludedSetLabels({ ids: previousExcluded, theme, t, lang })
  const rightExcluded = renderExcludedSetLabels({ ids: nextExcluded, theme, t, lang })
  return renderDiffGrid({
    left: (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {renderSetDiffColumn({
          union,
          present: previousSet,
          companion: nextSet,
          highlightWhenMissing: 'removed',
          useIcons,
          theme,
          t,
          lang,
          ...(payload.previousText !== undefined ? { fallback: payload.previousText } : {}),
        })}
        {leftExcluded}
      </Box>
    ),
    right: (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {renderSetDiffColumn({
          union,
          present: nextSet,
          companion: previousSet,
          highlightWhenMissing: 'added',
          useIcons,
          theme,
          t,
          lang,
          ...(payload.nextText !== undefined ? { fallback: payload.nextText } : {}),
        })}
        {rightExcluded}
      </Box>
    ),
    theme,
    layout: 'compact',
  })
}

function normalizeStringLines(lines: string[] | undefined): string[] {
  if (!Array.isArray(lines)) return []
  const out: string[] = []
  for (const entry of lines) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (trimmed.length === 0) continue
    out.push(trimmed)
  }
  return out
}

function renderTextGridCell(lines: string[], fallback: string): React.ReactNode {
  if (lines.length === 0) {
    return <Typography variant="body2" color="text.secondary">{fallback}</Typography>
  }
  return (
    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
      {lines.join('\n')}
    </Typography>
  )
}

function renderSetDiffColumn(params: {
  union: number[]
  present: Set<number>
  companion: Set<number>
  highlightWhenMissing: StatDiffHighlight
  fallback?: string
  useIcons: boolean
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
  lang: string
}): React.ReactNode {
  const { union, present, companion, highlightWhenMissing, fallback, useIcons, theme, t, lang } = params
  if (union.length === 0) {
    const text = (fallback ?? '').trim().length > 0 ? fallback! : t('any')
    return <Typography variant="body2" color="text.secondary">{text}</Typography>
  }
  const cells = union.map((setId) => {
    if (!present.has(setId)) {
      return renderSetPlaceholderCell({ key: `set-placeholder-${setId}`, useIcons })
    }
    const highlight: StatDiffHighlight = companion.has(setId) ? null : highlightWhenMissing
    return renderSetDiffCell({ setId, highlight, useIcons, theme, t, lang })
  })
  if (useIcons) {
    const columns = Math.min(Math.max(cells.length, 1), SET_ICON_GRID_MAX_COLUMNS)
    return (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, ${SET_ICON_CELL_PX}px)`,
          columnGap: 0.5,
          rowGap: 0.5,
          justifyItems: 'center',
          alignItems: 'center',
        }}
      >
        {cells}
      </Box>
    )
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'stretch' }}>
      {cells}
    </Box>
  )
}

function renderSetDiffCell(params: {
  setId: number
  highlight: StatDiffHighlight
  useIcons: boolean
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
  lang: string
}): React.ReactNode {
  const { setId, highlight, useIcons, theme, t, lang } = params
  const label = getLocalizedGearSetName(setId as ArtifactSetId, t, lang)
  const srLabel = highlight === null
    ? null
    : highlight === 'removed'
      ? t('historyBuilderRemovedStatBadge')
      : t('historyBuilderAddedStatBadge')
  if (useIcons) {
    const iconSrc = gearSetIconSrc(setId as ArtifactSetId)
    const content = iconSrc
      ? <SetIcon setId={setId as ArtifactSetId} size={24} label={label} sx={{ mr: 0 }} />
      : (
        <Typography variant="caption" sx={{ lineHeight: 1.1, color: (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary) }}>
          {label}
        </Typography>
      )
    return (
      <Box
        key={`set-cell-${setId}-${highlight ?? 'shared'}-icons`}
        sx={{
          width: SET_ICON_CELL_PX,
          height: SET_ICON_CELL_PX,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {srLabel ? (
          <Box component="span" sx={srOnlySx}>
            {srLabel}
          </Box>
        ) : null}
        {content}
      </Box>
    )
  }
  return (
    <Box
      key={`set-cell-${setId}-${highlight ?? 'shared'}-text`}
      sx={{
        minHeight: SET_TEXT_ROW_MIN_HEIGHT_PX,
        px: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        position: 'relative',
      }}
    >
      {srLabel ? (
        <Box component="span" sx={srOnlySx}>
          {srLabel}
        </Box>
      ) : null}
      <Typography variant="body2" sx={{ color: (theme.vars?.palette.text.primary ?? theme.palette.text.primary) }}>
        {label}
      </Typography>
    </Box>
  )
}

const srOnlySx = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const

function renderSetPlaceholderCell(params: { key: string; useIcons: boolean }): React.ReactNode {
  const { key, useIcons } = params
  if (useIcons) {
    return (
      <Box
        key={key}
        sx={{
          width: SET_ICON_CELL_PX,
          height: SET_ICON_CELL_PX,
        }}
      />
    )
  }
  return (
    <Box
      key={key}
      sx={{
        minHeight: SET_TEXT_ROW_MIN_HEIGHT_PX,
      }}
    />
  )
}

function buildSetUnion(previous: number[], next: number[]): number[] {
  const seen = new Set<number>()
  const union: number[] = []
  for (const value of previous) {
    if (seen.has(value)) continue
    seen.add(value)
    union.push(value)
  }
  for (const value of next) {
    if (seen.has(value)) continue
    seen.add(value)
    union.push(value)
  }
  union.sort((a, b) => compareArtifactSets(a as ArtifactSetId, b as ArtifactSetId))
  return union
}

function renderMetasetDiff(params: {
  payload: StructuredMetasetDiff
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
  lang: string
}): React.ReactNode {
  const { payload, theme, t, lang } = params
  const previousEntries = Array.isArray(payload.previous) ? payload.previous : []
  const nextEntries = Array.isArray(payload.next) ? payload.next : []
  const union = buildMetasetUnion(previousEntries, nextEntries)
  if (union.length === 0) {
    const previousFallback = (payload.previousFallback ?? '').trim().length > 0 ? payload.previousFallback! : t('any')
    const nextFallback = (payload.nextFallback ?? '').trim().length > 0 ? payload.nextFallback! : t('any')
    return renderDiffGrid({
      left: <Typography variant="body2" color="text.secondary">{previousFallback}</Typography>,
      right: <Typography variant="body2" color="text.secondary">{nextFallback}</Typography>,
      theme,
      layout: 'compact',
    })
  }
  const previousMap = new Map(previousEntries.map((entry) => [entry.id, entry]))
  const nextMap = new Map(nextEntries.map((entry) => [entry.id, entry]))
  return renderDiffGrid({
    left: renderMetasetColumn({
      union,
      present: previousMap,
      companion: nextMap,
      highlightWhenMissing: 'removed',
      theme,
      t,
      lang,
      ...(payload.previousFallback !== undefined ? { fallback: payload.previousFallback } : {}),
    }),
    right: renderMetasetColumn({
      union,
      present: nextMap,
      companion: previousMap,
      highlightWhenMissing: 'added',
      theme,
      t,
      lang,
      ...(payload.nextFallback !== undefined ? { fallback: payload.nextFallback } : {}),
    }),
    theme,
    layout: 'compact',
  })
}

// Snapshot renderer for metasets: lists the current metaset rows or the fallback label.
function renderMetasetSnapshot(params: {
  payload: StructuredMetasetSnapshot
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
  lang: string
}): React.ReactNode {
  const { payload, theme, t, lang } = params
  const entries = Array.isArray(payload.entries) ? payload.entries : []
  if (entries.length === 0) {
    const fallback = (payload.fallbackText ?? '').trim().length > 0 ? payload.fallbackText! : t('any')
    return <Typography variant="body2" color="text.secondary">{fallback}</Typography>
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {entries.map((entry) => renderMetasetCell({ entry, highlight: null, theme, t, lang }))}
    </Box>
  )
}

function renderMetasetColumn(params: {
  union: string[]
  present: Map<string, StructuredMetasetEntry>
  companion: Map<string, StructuredMetasetEntry>
  highlightWhenMissing: StatDiffHighlight
  fallback?: string
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
  lang: string
}): React.ReactNode {
  const { union, present, companion, highlightWhenMissing, fallback, theme, t, lang } = params
  if (union.length === 0) {
    const text = (fallback ?? '').trim().length > 0 ? fallback! : t('any')
    return <Typography variant="body2" color="text.secondary">{text}</Typography>
  }
  const rows = union.map((id) => {
    const entry = present.get(id)
    if (!entry) {
      return renderMetasetPlaceholder({ key: `metaset-placeholder-${id}` })
    }
    const highlight: StatDiffHighlight = companion.has(id) ? null : highlightWhenMissing
    return renderMetasetCell({ entry, highlight, theme, t, lang })
  })
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'stretch' }}>
      {rows}
    </Box>
  )
}

function renderMetasetCell(params: {
  entry: StructuredMetasetEntry
  highlight: StatDiffHighlight
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
  lang: string
}): React.ReactNode {
  const { entry, highlight, theme, t, lang } = params
  void lang
  const srLabel = highlight === null
    ? null
    : highlight === 'removed'
      ? t('historyBuilderRemovedStatBadge')
      : t('historyBuilderAddedStatBadge')
  return (
    <Box
      key={`metaset-${entry.id}-${highlight ?? 'shared'}`}
      sx={{
        minHeight: SET_TEXT_ROW_MIN_HEIGHT_PX,
        px: 1,
        py: 0.5,
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        position: 'relative',
      }}
    >
      {srLabel ? (
        <Box component="span" sx={srOnlySx}>
          {srLabel}
        </Box>
      ) : null}
      {entry.icon ? (
        <Box component="span" aria-hidden sx={{ fontSize: 18, lineHeight: 1 }}>
          {entry.icon}
        </Box>
      ) : null}
      <Typography variant="body2" sx={{ color: (theme.vars?.palette.text.primary ?? theme.palette.text.primary) }}>
        {entry.name}
      </Typography>
    </Box>
  )
}

function renderMetasetPlaceholder(params: { key: string }): React.ReactNode {
  const { key } = params
  return (
    <Box
      key={key}
      sx={{
        minHeight: SET_TEXT_ROW_MIN_HEIGHT_PX,
        borderRadius: 1,
        border: `1px dashed ${'rgba(var(--mui-palette-text-primaryChannel) / 0.2)'}`,
      }}
    />
  )
}

function buildMetasetUnion(previous: StructuredMetasetEntry[], next: StructuredMetasetEntry[]): string[] {
  const seen = new Set<string>()
  const union: string[] = []
  for (const entry of previous) {
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    union.push(entry.id)
  }
  for (const entry of next) {
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    union.push(entry.id)
  }
  return union
}

function renderSubstatsDiff(params: {
  data: StructuredSubstatsDiff
  shouldColorize: boolean
  colors: SubstatColorMap
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
}): React.ReactNode {
  const { data, shouldColorize, colors, theme, t } = params
  const previousVariants = normalizeIds(data.previous).sort(compareVariants)
  const nextVariants = normalizeIds(data.next).sort(compareVariants)
  const unionVariants = buildVariantUnion(previousVariants, nextVariants)
  const prevLocked = new Set<number>(normalizeIds(data.previousLocked))
  const nextLocked = new Set<number>(normalizeIds(data.nextLocked))

  if (unionVariants.length === 0) {
    const content = renderDiffGrid({
      left: renderStatChipList({
        variants: previousVariants,
        locked: prevLocked,
        shouldColorize,
        colors,
        theme,
        t,
        fallbackText: data.previousText,
        bounds: data.previousBounds ?? {},
        showLockIcon: true,
        showRollIndicator: true,
      }),
      right: renderStatChipList({
        variants: nextVariants,
        locked: nextLocked,
        shouldColorize,
        colors,
        theme,
        t,
        fallbackText: data.nextText,
        bounds: data.nextBounds ?? {},
        showLockIcon: true,
        showRollIndicator: true,
      }),
      theme,
      layout: 'compact',
    })
    return renderSubstatDiffContainer(content)
  }

  const content = renderAlignedStatDiffGrid({
    unionVariants,
    previousVariants,
    nextVariants,
    previousLocked: prevLocked,
    nextLocked,
    shouldColorize,
    colors,
    theme,
    t,
    previousBounds: data.previousBounds ?? {},
    nextBounds: data.nextBounds ?? {},
    showLockIcon: true,
    showRollIndicator: true,
    layout: 'compact',
    ...(data.previousText !== undefined ? { previousFallback: data.previousText } : {}),
    ...(data.nextText !== undefined ? { nextFallback: data.nextText } : {}),
  })
  return renderSubstatDiffContainer(content)
}

// Snapshot renderer for substats: reuses the chip layout without the diff arrows.
function renderSubstatsSnapshot(params: {
  payload: StructuredSubstatsSnapshot
  shouldColorize: boolean
  colors: SubstatColorMap
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
}): React.ReactNode {
  const { payload, shouldColorize, colors, theme, t } = params
  const variants = normalizeIds(payload.variants).sort(compareVariants)
  const locked = new Set<number>(normalizeIds(payload.locked))
  const bounds = payload.bounds ?? {}
  const chips = renderStatChipList({
    variants,
    locked,
    shouldColorize,
    colors,
    theme,
    t,
    fallbackText: payload.fallbackText,
    bounds,
    showLockIcon: true,
    showRollIndicator: true,
  })
  return renderSubstatDiffContainer(
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {chips}
    </Box>,
  )
}

function renderSubstatDiffContainer(content: React.ReactNode): React.ReactNode {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {content}
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
  showLockIcon?: boolean
  showRollIndicator?: boolean
}): React.ReactNode {
  const {
    previous,
    next,
    lockedPrev,
    lockedNext,
    shouldColorize,
    colors,
    theme,
    t,
    previousText,
    nextText,
    showLockIcon = true,
    showRollIndicator = true,
  } = params
  const previousVariants = normalizeIds(previous).sort(compareVariants)
  const nextVariants = normalizeIds(next).sort(compareVariants)
  const unionVariants = buildVariantUnion(previousVariants, nextVariants)
  if (unionVariants.length === 0) {
    return renderDiffGrid({
      left: renderStatChipList({
        variants: previousVariants,
        locked: lockedPrev,
        shouldColorize,
        colors,
        theme,
        t,
        fallbackText: previousText,
        bounds: {} as Record<number, StructuredRollBounds>,
        showLockIcon,
        showRollIndicator,
      }),
      right: renderStatChipList({
        variants: nextVariants,
        locked: lockedNext,
        shouldColorize,
        colors,
        theme,
        t,
        fallbackText: nextText,
        bounds: {} as Record<number, StructuredRollBounds>,
        showLockIcon,
        showRollIndicator,
      }),
      theme,
      layout: 'compact',
    })
  }
  return renderAlignedStatDiffGrid({
    unionVariants,
    previousVariants,
    nextVariants,
    previousLocked: lockedPrev,
    nextLocked: lockedNext,
    shouldColorize,
    colors,
    theme,
    t,
    previousBounds: {} as Record<number, StructuredRollBounds>,
    nextBounds: {} as Record<number, StructuredRollBounds>,
    showLockIcon,
    showRollIndicator,
    ...(previousText !== undefined ? { previousFallback: previousText } : {}),
    ...(nextText !== undefined ? { nextFallback: nextText } : {}),
    layout: 'compact',
  })
}

// Snapshot renderer for main stats: shares the chip visuals with diff mode.
function renderStatsSnapshot(params: {
  payload: StructuredMainStatsSnapshot
  shouldColorize: boolean
  colors: SubstatColorMap
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
}): React.ReactNode {
  const { payload, shouldColorize, colors, theme, t } = params
  const variants = normalizeIds(payload.values).sort(compareVariants)
  const chips = renderStatChipList({
    variants,
    locked: new Set<number>(),
    shouldColorize,
    colors,
    theme,
    t,
    fallbackText: payload.fallbackText,
    showLockIcon: false,
    showRollIndicator: false,
  })
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {chips}
    </Box>
  )
}

function renderDiffGrid(params: {
  left: React.ReactNode
  right: React.ReactNode
  theme: Theme
  layout?: 'balanced' | 'compact'
}): React.ReactNode {
  const { left, right, theme, layout = 'balanced' } = params
  if (layout === 'compact') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          columnGap: 1,
          rowGap: 0.5,
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {left}
        </Box>
        <Typography variant="body2" sx={{ color: (theme.vars?.palette.info.main ?? theme.palette.info.main) }}>→</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {right}
        </Box>
      </Box>
    )
  }
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
      <Typography variant="body2" sx={{ color: (theme.vars?.palette.info.main ?? theme.palette.info.main) }}>→</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{right}</Box>
    </Box>
  )
}

// Snapshot renderer for slot filters: mirrors the diff grid minus the comparison column.
function renderSlotsSnapshot(params: {
  payload: StructuredSlotsSnapshot
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
}): React.ReactNode {
  const { payload, theme, t } = params
  const ids = normalizeIds(payload.values)
  if (ids.length === 0) {
    const fallback = (payload.fallbackText ?? '').trim().length > 0 ? payload.fallbackText! : t('any')
    return <Typography variant="body2" color="text.secondary">{fallback}</Typography>
  }
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {renderSlotIconGrid(ids, theme, t)}
    </Box>
  )
}

// Snapshot renderer for artifact sets: renders the same grid/cards without before/after arrows.
function renderSetListSnapshot(params: {
  payload: StructuredSetListSnapshot
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
  lang: string
  useIcons: boolean
}): React.ReactNode {
  const { payload, theme, t, lang, useIcons } = params
  const ids = normalizeIds(payload.values)
  const excludedIds = normalizeIds(payload.excluded ?? [])
  if (ids.length === 0 && excludedIds.length === 0) {
    const fallback = (payload.fallbackText ?? '').trim().length > 0 ? payload.fallbackText! : t('any')
    return <Typography variant="body2" color="text.secondary">{fallback}</Typography>
  }
  const excludedNode = renderExcludedSetLabels({ ids: excludedIds, theme, t, lang })
  if (useIcons) {
    const columns = Math.min(Math.max(ids.length, 1), SET_ICON_GRID_MAX_COLUMNS)
    const gridNode = (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, ${SET_ICON_CELL_PX}px)`,
          columnGap: 0.5,
          rowGap: 0.5,
          justifyItems: 'center',
          alignItems: 'center',
        }}
      >
        {ids.map((setId) => renderSetDiffCell({ setId, highlight: null, useIcons: true, theme, t, lang }))}
      </Box>
    )
    return excludedNode ? (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {gridNode}
        {excludedNode}
      </Box>
    ) : gridNode
  }
  const listNode = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {ids.map((setId) => renderSetDiffCell({ setId, highlight: null, useIcons: false, theme, t, lang }))}
    </Box>
  )
  return excludedNode ? (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {listNode}
      {excludedNode}
    </Box>
  ) : listNode
}

function renderExcludedSetLabels(params: {
  ids: number[]
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
  lang: string
}): React.ReactNode {
  const { ids, theme, t, lang } = params
  if (ids.length === 0) return null
  const labels = ids
    .map((setId) => getLocalizedGearSetName(setId as ArtifactSetId, t, lang).trim())
    .filter((label) => label.length > 0)
    .map((label) => `¬ ${label}`)
  if (labels.length === 0) return null
  return (
    <Typography
      variant="caption"
      sx={{ color: (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary), textDecoration: 'line-through' }}
    >
      {labels.join(', ')}
    </Typography>
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
              color: isSelected ? (theme.vars?.palette.text.primary ?? theme.palette.text.primary) : (theme.vars?.palette.text.disabled ?? theme.palette.text.disabled),
            }}
          >
            <Icon fontSize="inherit" />
          </Box>
        )
      })}
    </Box>
  )
}

const STAT_GRID_COLUMNS = 3

function renderStatChipList(params: {
  variants: number[]
  locked: Set<number>
  shouldColorize: boolean
  colors: SubstatColorMap
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
  fallbackText?: string | undefined
  bounds?: Record<number, StructuredRollBounds>
  showLockIcon?: boolean
  showRollIndicator?: boolean
}): React.ReactNode {
  const { variants, locked, shouldColorize, colors, theme, t, fallbackText, bounds, showLockIcon = true, showRollIndicator = true } = params
  const normalized = normalizeIds(variants).sort(compareVariants)
  if (normalized.length === 0) {
    return <Typography variant="body2" color="text.secondary">{fallbackText ?? t('any')}</Typography>
  }
  return normalized.map((variant) => {
    const boundsEntry = bounds ? bounds[variant] : undefined
    return renderStatChipCell({
      variant,
      locked: locked.has(variant),
      shouldColorize,
      colors,
      theme,
      t,
      ...(boundsEntry ? { bounds: boundsEntry } : {}),
      highlight: null,
      showLockIcon,
      showRollIndicator,
    })
  })
}

type StatDiffHighlight = 'added' | 'removed' | null

function renderAlignedStatDiffGrid(params: {
  unionVariants: number[]
  previousVariants: number[]
  nextVariants: number[]
  previousLocked: Set<number>
  nextLocked: Set<number>
  shouldColorize: boolean
  colors: SubstatColorMap
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
  previousBounds: Record<number, StructuredRollBounds>
  nextBounds: Record<number, StructuredRollBounds>
  showLockIcon: boolean
  showRollIndicator: boolean
  previousFallback?: string
  nextFallback?: string
  layout?: 'balanced' | 'compact'
}): React.ReactNode {
  const {
    unionVariants,
    previousVariants,
    nextVariants,
    previousLocked,
    nextLocked,
    shouldColorize,
    colors,
    theme,
    t,
    previousBounds,
    nextBounds,
    showLockIcon,
    showRollIndicator,
    previousFallback,
    nextFallback,
    layout = 'balanced',
  } = params

  const previousSet = new Set(previousVariants)
  const nextSet = new Set(nextVariants)
  const showPreviousFallback = previousSet.size === 0
  const showNextFallback = nextSet.size === 0
  const previousCells = showPreviousFallback
    ? []
    : unionVariants.map((variant) => {
      if (!previousSet.has(variant)) return renderPlaceholderCell(variant)
      const highlight: StatDiffHighlight = nextSet.has(variant) ? null : 'removed'
      const boundsEntry = previousBounds[variant]
      return renderStatChipCell({
        variant,
        locked: previousLocked.has(variant),
        shouldColorize,
        colors,
        theme,
        t,
        ...(boundsEntry ? { bounds: boundsEntry } : {}),
        highlight,
        showLockIcon,
        showRollIndicator,
      })
    })
  const nextCells = showNextFallback
    ? []
    : unionVariants.map((variant) => {
      if (!nextSet.has(variant)) return renderPlaceholderCell(variant)
      const highlight: StatDiffHighlight = previousSet.has(variant) ? null : 'added'
      const boundsEntry = nextBounds[variant]
      return renderStatChipCell({
        variant,
        locked: nextLocked.has(variant),
        shouldColorize,
        colors,
        theme,
        t,
        ...(boundsEntry ? { bounds: boundsEntry } : {}),
        highlight,
        showLockIcon,
        showRollIndicator,
      })
    })

  return renderDiffGrid({
    left: showPreviousFallback
      ? <Typography variant="body2" color="text.secondary">{previousFallback ?? t('any')}</Typography>
      : (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${STAT_GRID_COLUMNS}, minmax(0, 1fr))`,
          columnGap: 0.5,
          rowGap: 0.5,
        }}
      >
        {previousCells}
      </Box>
    ),
    right: showNextFallback
      ? <Typography variant="body2" color="text.secondary">{nextFallback ?? t('any')}</Typography>
      : (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${STAT_GRID_COLUMNS}, minmax(0, 1fr))`,
          columnGap: 0.5,
          rowGap: 0.5,
        }}
      >
        {nextCells}
      </Box>
    ),
    theme,
    layout,
  })
}

function renderPlaceholderCell(key: number | string): React.ReactNode {
  return (
    <Box
      key={`placeholder-${key}`}
      sx={{
        minHeight: 22,
        borderRadius: 1,
        border: `1px dashed ${'rgba(var(--mui-palette-text-primaryChannel) / 0.15)'}`,
      }}
    />
  )
}

function renderStatChipCell(params: {
  variant: number
  locked: boolean
  shouldColorize: boolean
  colors: SubstatColorMap
  theme: Theme
  t: ReturnType<typeof useI18n>['t']
  bounds?: StructuredRollBounds
  highlight: StatDiffHighlight
  showLockIcon?: boolean
  showRollIndicator?: boolean
}): React.ReactNode {
  const {
    variant,
    locked,
    shouldColorize,
    colors,
    theme,
    t,
    bounds,
    highlight,
    showLockIcon = true,
    showRollIndicator = true,
  } = params
  const colorEntry = colors[variant] ?? null
  const fg = shouldColorize && colorEntry ? colorEntry.fg : (theme.vars?.palette.text.primary ?? theme.palette.text.primary)
  const baseBg = shouldColorize && colorEntry ? colorEntry.bg : 'rgba(var(--mui-palette-text-primaryChannel) / 0.08)'
  const label = t(statVariantI18nKey(variant as StatVariantLike))
  const min = bounds?.min
  const max = bounds?.max
  const wildcard = bounds?.any === true
  const indicator = showRollIndicator
    ? makeRollIndicator({
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(wildcard ? { wildcard: true } : {}),
      theme,
    })
    : null
  const chipSx: SxProps<Theme> = {
    height: 22,
    borderRadius: 1,
    bgcolor: baseBg,
    color: fg,
    '& .MuiChip-label': {
      px: 0.75,
      fontSize: '0.75rem',
      lineHeight: 1.2,
    },
    border: 'none',
    ...(locked ? { fontWeight: 600 } : {}),
  }
  const srLabel = highlight === null
    ? null
    : (
      <Box
        component="span"
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {highlight === 'removed' ? t('historyBuilderRemovedStatBadge') : t('historyBuilderAddedStatBadge')}
      </Box>
    )
  return (
    <Box
      key={`stat-${variant}-${highlight ?? 'shared'}-${locked ? 'locked' : 'unlocked'}`}
      sx={{ position: 'relative' }}
    >
      <Chip
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {srLabel}
            <Box component="span">{label}</Box>
            {locked && showLockIcon ? <Box component="span" aria-hidden="true">🔒</Box> : null}
            {indicator}
          </Box>
        }
        size="small"
        sx={chipSx}
      />
    </Box>
  )
}

function buildVariantUnion(previous: number[], next: number[]): number[] {
  const seen = new Set<number>()
  const union: number[] = []
  for (const value of previous) {
    if (seen.has(value)) continue
    seen.add(value)
    union.push(value)
  }
  for (const value of next) {
    if (seen.has(value)) continue
    seen.add(value)
    union.push(value)
  }
  union.sort(compareVariants)
  return union
}

function makeRollIndicator(params: { min?: number; max?: number; wildcard?: boolean; theme: Theme }): React.ReactNode {
  const { min, max, wildcard, theme } = params
  if (wildcard) {
    const color = (theme.vars?.palette.success.main ?? theme.palette.success.main)
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
        ★
      </Box>
    )
  }
  if (max === undefined && min === undefined) return null
  const showCap = max !== undefined
  const value = showCap ? max! : min!
  const color = showCap ? (theme.vars?.palette.error.main ?? theme.palette.error.main) : (theme.vars?.palette.success.main ?? theme.palette.success.main)
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
