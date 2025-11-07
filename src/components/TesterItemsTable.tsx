import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Chip, Menu, Tooltip, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
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
import { FONT_SIZE_BASE_PX } from '../lib/constants'
import { TesterSummaryLabel } from './TesterSummaryLabel'
import ContextMenuPaper from './ContextMenuPaper'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import { useContextMenuHint } from '../hooks/useContextMenuHint'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'
import { useTesterTableColumnsPreference, type TesterStoredColumnConfig } from '../state/testerTableColumnsPreference'

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
  matchingCfgIndices: number[]
}

type TesterColKey = 'item' | 'details' | 'result'
type TesterColConfig = { key: TesterColKey; labelKey: string; width: number }

const ROW_HEIGHT_PX = 72
const VIRTUALIZE_AFTER = 200
const OVERSCAN_ROWS = 6
const MIN_TESTER_COLUMN_WIDTH_PX = 160
const HEADER_LABEL_SX = {
  fontWeight: 600,
  fontSize: FONT_SIZE_BASE_PX,
  color: 'text.primary',
  userSelect: 'none',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

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
  const defaultColumns = useMemo<TesterColConfig[]>(() => ([
    { key: 'item', labelKey: 'testerTableHeaderItem', width: 260 },
    { key: 'details', labelKey: 'testerTableHeaderDetails', width: 360 },
    { key: 'result', labelKey: 'testerTableHeaderResult', width: 260 },
  ]), [])
  const [storedCols, setStoredCols] = useTesterTableColumnsPreference()

  const restoreColumns = useCallback((prefs: TesterStoredColumnConfig[]): TesterColConfig[] => {
    const map = new Map<TesterColKey, TesterColConfig>()
    for (const col of defaultColumns) map.set(col.key, col)
    const restored: TesterColConfig[] = []
    for (const pref of prefs) {
      const key = pref.key as TesterColKey | undefined
      if (!key) continue
      const base = map.get(key)
      if (!base) continue
      const widthRaw = Number(pref.width)
      const width = Number.isFinite(widthRaw) ? Math.max(MIN_TESTER_COLUMN_WIDTH_PX, Math.floor(widthRaw)) : base.width
      restored.push({ ...base, width })
    }
    for (const col of defaultColumns) {
      if (!restored.some((entry) => entry.key === col.key)) {
        restored.push(col)
      }
    }
    return restored
  }, [defaultColumns])

  const columnsEqual = useCallback((a: TesterColConfig[], b: TesterColConfig[]) => {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
      const left = a[i]
      const right = b[i]
      if (!left || !right) return false
      if (left.key !== right.key) return false
      if (left.width !== right.width) return false
    }
    return true
  }, [])

  const toStoredColumns = useCallback((colsInput: TesterColConfig[]): TesterStoredColumnConfig[] => (
    colsInput.map(({ key, width }) => ({ key, width }))
  ), [])

  const cols = useMemo(() => restoreColumns(storedCols), [restoreColumns, storedCols])

  const updateColumns = useCallback((updater: (prev: TesterColConfig[]) => TesterColConfig[]) => {
    setStoredCols((prevPrefs) => {
      const prevCols = restoreColumns(prevPrefs)
      const nextCols = updater(prevCols)
      if (columnsEqual(prevCols, nextCols)) return prevPrefs
      return toStoredColumns(nextCols)
    })
  }, [columnsEqual, restoreColumns, setStoredCols, toStoredColumns])

  const columnTemplate = useMemo(() => (
    cols.map((col) => `${Math.max(MIN_TESTER_COLUMN_WIDTH_PX, col.width)}px`).join(' ')
  ), [cols])
  const totalColumnWidthPx = useMemo(() => (
    cols.reduce((sum, col) => sum + Math.max(MIN_TESTER_COLUMN_WIDTH_PX, col.width), 0)
  ), [cols])

  const [headerMenu, setHeaderMenu] = useState<null | { open: boolean; x: number; y: number }>(null)
  const headerMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const closeHeaderMenu = useCallback(() => { setHeaderMenu(null) }, [])
  useContextMenuCloseOnOutsideRightClick({ open: Boolean(headerMenu?.open), onClose: closeHeaderMenu, menuRef: headerMenuPaperRef })
  const { shouldShow: showTesterHeaderHint, markSeen: markTesterHeaderHintSeen } = useContextMenuHint('testerTableHeader')
  const [headerHintPos, setHeaderHintPos] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!showTesterHeaderHint) setHeaderHintPos(null)
  }, [showTesterHeaderHint])
  const resetColumns = useCallback(() => {
    setStoredCols([])
    closeHeaderMenu()
  }, [closeHeaderMenu, setStoredCols])

  const dragSrcIdxRef = useRef<number | null>(null)
  const onHeaderDragStart = (srcIdx: number) => { dragSrcIdxRef.current = srcIdx }
  const onHeaderDragOver = (e: React.DragEvent) => { e.preventDefault() }
  const onHeaderDrop = (dstIdx: number) => {
    const srcIdx = dragSrcIdxRef.current
    dragSrcIdxRef.current = null
    if (srcIdx === null || srcIdx === dstIdx) return
    updateColumns((prev) => {
      const arr = [...prev]
      const [moved] = arr.splice(srcIdx, 1)
      if (!moved) return prev
      arr.splice(dstIdx, 0, moved)
      return arr
    })
  }

  const resizeRef = useRef<{ idx: number; startX: number; startW: number } | null>(null)
  const startResize = (idx: number, clientX: number) => {
    const base = cols[idx]
    if (!base) return
    resizeRef.current = { idx, startX: clientX, startW: Math.max(MIN_TESTER_COLUMN_WIDTH_PX, base.width) }
    const onMove = (event: MouseEvent) => {
      const snapshot = resizeRef.current
      if (!snapshot) return
      const dx = event.clientX - snapshot.startX
      const nextWidth = Math.max(MIN_TESTER_COLUMN_WIDTH_PX, snapshot.startW + dx)
      updateColumns((prev) => prev.map((col, colIdx) => (colIdx === snapshot.idx ? { ...col, width: Math.floor(nextWidth) } : col)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizeRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

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
  const columnTemplateMd = columnTemplate || 'minmax(220px, 0.9fr) minmax(280px, 1.2fr) minmax(220px, 0.9fr)'
  const gridMinWidthPx = totalColumnWidthPx > 0 ? `${totalColumnWidthPx}px` : undefined

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
        data-tour-id="tester.header"
        sx={{
          display: { xs: 'none', md: 'grid' },
          gridTemplateColumns: { md: columnTemplateMd },
          gap: 1.5,
          px: 1.25,
          py: 0.75,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: 'background.paper',
          userSelect: 'none',
          ...(gridMinWidthPx ? { minWidth: { md: gridMinWidthPx } } : {}),
        }}
        onContextMenu={(event) => {
          try {
            event.preventDefault()
            event.stopPropagation()
          } catch {}
          markTesterHeaderHintSeen()
          setHeaderHintPos(null)
          setHeaderMenu({ open: true, x: event.clientX, y: event.clientY })
        }}
        onMouseMove={(event) => {
          if (!showTesterHeaderHint || headerMenu?.open) return
          setHeaderHintPos({ x: event.clientX, y: event.clientY })
        }}
        onMouseLeave={() => setHeaderHintPos(null)}
      >
        {cols.map((col, idx) => {
          const label = t(col.labelKey)
          return (
            <Box
              key={col.key}
              draggable
              onDragStart={() => onHeaderDragStart(idx)}
              onDragOver={onHeaderDragOver}
              onDrop={() => onHeaderDrop(idx)}
              sx={{ display: 'flex', alignItems: 'center', minWidth: 0, position: 'relative' }}
            >
              <Tooltip title={t('rulesHeaderHelp', { label })}>
                <Typography component="div" sx={HEADER_LABEL_SX}>
                  {label}
                </Typography>
              </Tooltip>
              <Box
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  startResize(idx, event.clientX)
                }}
                sx={{ position: 'absolute', right: 0, top: 0, width: 6, height: '100%', cursor: 'col-resize', zIndex: 1 }}
              />
            </Box>
          )
        })}
      </Box>
      <Box
        ref={containerRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: { xs: 'hidden', md: 'auto' },
        }}
      >
        <Box sx={{ position: 'relative', height: totalHeight ?? 'auto', ...(gridMinWidthPx ? { minWidth: { md: gridMinWidthPx } } : {}) }}>
          <Box
            sx={{
              transform: shouldVirtualize ? `translateY(${padTop}px)` : 'none',
              ...(gridMinWidthPx ? { minWidth: { md: gridMinWidthPx } } : {}),
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
                gridTemplateColumnsMd={columnTemplateMd}
                gridMinWidthPx={gridMinWidthPx}
              />
            ))}
          </Box>
        </Box>
      </Box>
      <ContextMenuHintOverlay text={t('contextMenuHintRulesTableHeader')} position={(showTesterHeaderHint && !headerMenu?.open) ? headerHintPos : null} />
      <Menu
        open={Boolean(headerMenu?.open)}
        onClose={closeHeaderMenu}
        anchorReference="anchorPosition"
        {...(headerMenu?.open ? { anchorPosition: { top: headerMenu.y, left: headerMenu.x } } : {})}
        slotProps={{
          paper: {
            component: ContextMenuPaper,
            onRequestClose: closeHeaderMenu,
            closeLabel: t('close'),
            ref: headerMenuPaperRef,
          } as unknown as MuiPaperProps,
        }}
      >
        <Box sx={{ px: 1.5, pt: 1, pb: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={(event) => {
              event.stopPropagation()
              resetColumns()
            }}
          >
            {t('headerMenuResetCols')}
          </Button>
          <Box sx={{ flex: 1 }} />
        </Box>
      </Menu>
    </Box>
  )
}

type TesterItemRowProps = {
  row: TesterPreviewRow
  t: ReturnType<typeof useI18n>['t']
  dividerColor: string
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  gridTemplateColumnsMd: string
  gridMinWidthPx?: string | undefined
}

function TesterItemRow({ row, t, dividerColor, substatColors, useStatButtonColors, gridTemplateColumnsMd, gridMinWidthPx }: TesterItemRowProps) {
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
        gridTemplateColumns: { xs: '1fr', md: gridTemplateColumnsMd },
        ...(gridMinWidthPx ? { minWidth: { md: gridMinWidthPx } } : {}),
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
