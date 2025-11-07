import React, { useEffect, useRef, useState } from 'react'
import { Box, Chip, Tooltip, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useI18n } from '../lib/i18n'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { SetIcon } from './SetIcon'
import { FactionIcon } from './FactionIcon'
import {
  artifactSetI18nKey,
  artifactSetName,
  artifactTypeI18nKey,
  formatLevel,
  formatRank,
  rarityCodeToName,
  statVariantI18nKey,
  type ArtifactTypeId,
  type RankValue,
  StatVariant,
  factionI18nKey,
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
} from '../lib/types'
import type { NormalizedStat } from '../lib/importers/gearDbNormalizer'
import { RULE_SOURCE_FINAL_SELL } from '../lib/merge'
import type { TesterFilterRow } from '../lib/rulesFilter'
import { TesterSummaryLabel } from './TesterSummaryLabel'

export type TesterPreviewMatch = {
  keep: boolean
  cfgIdx: number | null
  cfgName: string | null
  ruleIndex: number | null
  ruleLabel: string | null
  ruleSource: string | null
}

export type TesterPreviewRow = TesterFilterRow & {
  match: TesterPreviewMatch | null
}

const ROW_HEIGHT_PX = 72
const VIRTUALIZE_AFTER = 200
const OVERSCAN_ROWS = 6

function formatStatTotal(stat: NormalizedStat | null): string {
  if (!stat) return ''
  const value = stat.totalValue
  if (!Number.isFinite(value)) return ''
  if (Math.abs(value % 1) < 0.01) {
    return String(Math.round(value))
  }
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function formatStatNumber(value?: number | null): string {
  if (value == null) return ''
  if (!Number.isFinite(value)) return ''
  if (Math.abs(value % 1) < 0.01) {
    return String(Math.round(value))
  }
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function formatSubstats(
  stats: readonly NormalizedStat[],
  translate: (key: string, params?: Record<string, string | number>) => string,
): { summary: string; tooltip: string } {
  if (!stats.length) return { summary: translate('testerSubstatsNone'), tooltip: translate('testerSubstatsNone') }
  const pieces: string[] = []
  const tooltips: string[] = []
  for (const stat of stats) {
    if (stat.variant === StatVariant.Any) continue
    const label = translate(statVariantI18nKey(stat.variant))
    const value = formatStatTotal(stat)
    const compact = value ? `${label} ${value}` : label
    pieces.push(compact)
    const rolls = typeof stat.rolls === 'number' && stat.rolls > 0 ? ` (${translate('testerRollsLabel', { rolls: stat.rolls })})` : ''
    const glyph = stat.glyphValue && Math.abs(stat.glyphValue) > 0.001 ? ` (+${formatStatNumber(stat.glyphValue)})` : ''
    tooltips.push(`${compact}${glyph}${rolls}`)
  }
  return {
    summary: pieces.join(', '),
    tooltip: tooltips.join('\n'),
  }
}

function resolveRarityLabel(translate: (key: string) => string, rarityCode: number): string {
  switch (rarityCode) {
    case 1: return translate('rarityCommon')
    case 2: return translate('rarityUncommon')
    case 3: return translate('rarityRare')
    case 4: return translate('rarityEpic')
    case 5: return translate('rarityLegendary')
    case 6: return translate('rarityMythical')
    default: return rarityCodeToName(rarityCode)
  }
}

type TesterItemsTableProps = {
  rows: TesterPreviewRow[]
  filterActive?: boolean
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors?: boolean
}

export function TesterItemsTable({ rows, filterActive = false, substatColors, useStatButtonColors = false }: TesterItemsTableProps) {
  const { t } = useI18n()
  const theme = useTheme()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const measure = () => {
      setViewportHeight(node.clientHeight)
    }
    measure()
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure)
      observer.observe(node)
    }
    return () => {
      observer?.disconnect()
    }
  }, [])

  const shouldVirtualize = rows.length > VIRTUALIZE_AFTER
  const totalHeight = shouldVirtualize ? rows.length * ROW_HEIGHT_PX : undefined
  const viewport = viewportHeight > 0 ? viewportHeight : (containerRef.current?.clientHeight ?? 0)
  const rawStart = shouldVirtualize ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX)) : 0
  const rawEnd = shouldVirtualize ? Math.min(rows.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT_PX)) : rows.length
  const start = shouldVirtualize ? Math.max(0, rawStart - OVERSCAN_ROWS) : 0
  const end = shouldVirtualize ? Math.min(rows.length, rawEnd + OVERSCAN_ROWS) : rows.length
  const padTop = shouldVirtualize ? start * ROW_HEIGHT_PX : 0
  const visibleRows = shouldVirtualize ? rows.slice(start, end) : rows

  const handleScroll: React.UIEventHandler<HTMLDivElement> = (event) => {
    setScrollTop(event.currentTarget.scrollTop)
  }

  if (rows.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {filterActive ? t('testerTableEmptyFilter') : t('testerTableEmpty')}
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        ref={containerRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        <Box sx={{ position: 'relative', height: totalHeight ?? 'auto' }}>
          <Box
            sx={{
              transform: shouldVirtualize ? `translateY(${padTop}px)` : 'none',
            }}
          >
            {visibleRows.map((row, idx) => (
              <TesterItemRow
                key={`${row.artifact.id}:${start + idx}`}
                row={row}
                t={t}
                dividerColor={theme.palette.divider}
                substatColors={substatColors}
                useStatButtonColors={useStatButtonColors}
              />
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

type TesterItemRowProps = {
  row: TesterPreviewRow
  t: ReturnType<typeof useI18n>['t']
  dividerColor: string
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
}

function TesterItemRow({ row, t, dividerColor, substatColors, useStatButtonColors }: TesterItemRowProps) {
  const artifact = row.artifact
  const match = row.match
  const SlotIcon = artifactTypeIconFor(artifact.slot as ArtifactTypeId)
  const slotLabel = t(artifactTypeI18nKey(Number(artifact.slot)))
  const setLabel = t(artifactSetI18nKey(Number(artifact.set))) || artifactSetName(Number(artifact.set))
  const levelLabel = formatLevel(artifact.level)
  const rankLabel = formatRank(artifact.rank as RankValue)
  const rarityLabel = resolveRarityLabel(t, Number(artifact.rarity))
  const mainLabel = artifact.mainStat ? t(statVariantI18nKey(artifact.mainStat.variant)) : t('any')
  const mainValue = formatStatTotal(artifact.mainStat ?? null)
  const levelChipLabel = t('testerLevelLabel', { level: levelLabel })
  const mainInlineLabel = t('testerMainStatInline', { stat: mainLabel, value: mainValue || t('testerValueUnknown') })
  const mainVariant = artifact.mainStat?.variant
  const rawMainColor = typeof mainVariant === 'number'
    ? (substatColors[mainVariant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[mainVariant])
    : undefined
  const mainSummaryColor = useStatButtonColors ? rawMainColor : undefined
  const { summary: subSummary, tooltip: subTooltip } = formatSubstats(artifact.substats, t)
  const substatEntries = artifact.substats
    .filter((stat) => stat.variant !== StatVariant.Any)
    .map((stat) => {
      const label = `${t(statVariantI18nKey(stat.variant))} ${formatStatTotal(stat) || t('testerValueUnknown')}`.trim()
      const color = useStatButtonColors
        ? (substatColors[stat.variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[stat.variant])
        : undefined
      return { variant: stat.variant, label, color }
    })
  const ascValue = artifact.ascension ? formatStatNumber(artifact.ascension.totalValue) : ''
  const ascSummary = artifact.ascension
    ? t('testerAscensionInline', {
      stat: t(statVariantI18nKey(artifact.ascension.variant)),
      value: ascValue || t('testerValueUnknown'),
    })
    : ''
  const rerollLabel = artifact.rerollCount > 0 ? t('testerRerollLabel', { count: artifact.rerollCount }) : ''
  const equippedLabel = artifact.equippedToChampionId != null ? t('testerEquippedLabel', { id: artifact.equippedToChampionId }) : ''
  const sourceLabel = artifact.source === 'inbox' ? t('testerSourceInbox') : t('testerSourceInventory')

  let outcomeColor: 'success' | 'error' | 'default' = 'default'
  let outcomeLabel = t('testerMatchNoRule')
  if (match) {
    outcomeColor = match.keep ? 'success' : 'error'
    outcomeLabel = match.keep ? t('testerMatchKeep') : t('testerMatchSell')
  }

  const configLabel = match?.cfgName
    ? match.cfgName
    : (match?.cfgIdx != null ? t('testerConfigChip', { index: match.cfgIdx + 1 }) : '')

  const ruleLabel = match?.ruleLabel
    ? match.ruleLabel
    : (match?.ruleIndex != null ? t('testerRuleChip', { index: match.ruleIndex + 1 }) : '')

  const finalSell = match?.ruleSource === RULE_SOURCE_FINAL_SELL

  const extras = [ascSummary, rerollLabel, equippedLabel].filter(Boolean)

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 0.9fr) minmax(280px, 1.2fr) minmax(220px, 0.9fr)' },
        alignItems: 'center',
        gap: { xs: 1, md: 1.5 },
        px: 1.25,
        py: 0.75,
        height: ROW_HEIGHT_PX,
        borderBottom: `1px solid ${dividerColor}`,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        {SlotIcon ? <SlotIcon fontSize="small" /> : null}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
          <Typography variant="body2" color="text.primary" noWrap title={slotLabel}>
            {slotLabel}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
            <SetIcon setId={Number(artifact.set)} label={setLabel} size={20} sx={{ flexShrink: 0 }} />
            <Tooltip title={setLabel}>
              <Typography variant="caption" color="text.secondary" noWrap>
                {setLabel}
              </Typography>
            </Tooltip>
          </Box>
        </Box>
        <Chip
          label={sourceLabel}
          size="small"
          sx={{ ml: 'auto', flexShrink: 0 }}
          color={artifact.source === 'inbox' ? 'info' : 'default'}
        />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, minWidth: 0 }}>
          <TesterSummaryLabel label={levelChipLabel} />
          <TesterSummaryLabel label={rankLabel} />
          <TesterSummaryLabel label={rarityLabel} />
        </Box>
        <TesterSummaryLabel label={mainInlineLabel} color={mainSummaryColor} />
        <Tooltip title={subTooltip}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, minWidth: 0 }}>
            {substatEntries.length > 0 ? (
              substatEntries.map((entry) => (
                <TesterSummaryLabel key={`sub-${entry.variant}`} label={entry.label} color={entry.color} />
              ))
            ) : (
              <TesterSummaryLabel label={t('testerSubstatsInline', { summary: subSummary })} />
            )}
          </Box>
        </Tooltip>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
        <Chip
          label={outcomeLabel}
          size="small"
          color={outcomeColor}
          sx={{ alignSelf: 'flex-start', fontWeight: 600 }}
        />
        {configLabel ? (
          <Tooltip title={configLabel}>
            <Typography variant="body2" color="text.primary" noWrap>
              {configLabel}
            </Typography>
          </Tooltip>
        ) : null}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
          {ruleLabel ? (
            <Tooltip title={ruleLabel}>
              <Typography variant="body2" color="text.secondary" noWrap>
                {ruleLabel}
              </Typography>
            </Tooltip>
          ) : (
            <Typography variant="body2" color="text.secondary" noWrap>
              {t('testerRuleNoMatchShort')}
            </Typography>
          )}
          {finalSell ? (
            <Chip label={t('testerFinalSellChip')} size="small" color="warning" sx={{ ml: 0.5 }} />
          ) : null}
        </Box>
        {extras.length > 0 ? (
          <Tooltip title={extras.join(' • ')}>
            <Typography variant="caption" color="text.secondary" noWrap>
              {extras.join(' • ')}
            </Typography>
          </Tooltip>
        ) : null}
        {artifact.faction ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <FactionIcon faction={artifact.faction} size={16} />
            <Typography variant="caption" color="text.secondary" noWrap title={t(factionI18nKey(artifact.faction))}>
              {t(factionI18nKey(artifact.faction))}
            </Typography>
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}
