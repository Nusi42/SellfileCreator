import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Chip, Menu, Tooltip, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import { useI18n } from '../lib/i18n'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { SetIcon } from './SetIcon'
import { FactionIcon } from './FactionIcon'
import {
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
import type { NormalizedGearArtifact, NormalizedStat } from '../lib/importers/gearDbNormalizer'
import { FONT_SIZE_BASE_PX } from '../lib/constants'
import { TesterSummaryLabel } from './TesterSummaryLabel'
import ContextMenuPaper from './ContextMenuPaper'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import { useContextMenuHint } from '../hooks/useContextMenuHint'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'
import { useTesterTableColumnsPreference, type TesterStoredColumnConfig } from '../state/testerTableColumnsPreference'
import type { TesterPreviewRow } from '../types/testerPreview'
import { TesterRuleReferenceChip } from './TesterRuleReferenceChip'
import { formatTesterSetLabel } from '../lib/testerFormatters'

export type { TesterPreviewMatch, TesterPreviewRow } from '../types/testerPreview'

type TesterColKey = 'item' | 'details' | 'result'
type TesterColConfig = { key: TesterColKey; labelKey: string; width: number }
type TranslateFn = ReturnType<typeof useI18n>['t']
type ItemSourceDescriptor = { label: string; tooltip?: string } | null

const ROW_HEIGHT_PX = 72
const VIRTUALIZE_AFTER = 200
const OVERSCAN_ROWS = 6
const MIN_TESTER_COLUMN_WIDTH_PX = 160
const GRID_GAP_UNITS = 1.5
const GRID_PADDING_UNITS = 1.25
const pxValue = (value: string): number => Number.parseFloat(value) || 0
const HEADER_LABEL_SX = {
  fontWeight: 600,
  fontSize: FONT_SIZE_BASE_PX,
  color: 'text.primary',
  userSelect: 'none',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const
const HSCROLL_ON_MARGIN_PX = 8
const HSCROLL_OFF_MARGIN_PX = 8

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

function getItemSourceDescriptor(artifact: NormalizedGearArtifact, translate: TranslateFn): ItemSourceDescriptor {
  if (artifact.source === 'tester') {
    return null
  }
  if (artifact.source === 'inbox') {
    return { label: translate('testerSourceInbox') }
  }
  if (artifact.equippedToChampionId != null) {
    const inVault = artifact.equippedChampionLocation === 'vault' || artifact.equippedChampionLocation === 'reserveVault'
    const tooltip = artifact.equippedChampionName && artifact.equippedChampionName.trim().length > 0
      ? artifact.equippedChampionName.trim()
      : translate('testerEquippedLabel', { id: artifact.equippedToChampionId })
    return {
      label: inVault ? translate('testerSourceEquippedVault') : translate('testerSourceEquippedCollection'),
      tooltip,
    }
  }
  return { label: translate('testerSourceInventory') }
}

type TesterItemsTableProps = {
  rows: TesterPreviewRow[]
  filterActive?: boolean
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors?: boolean
  onJumpToRule?: (ruleIndex: number, cfgIdx: number | null) => void
}

export function TesterItemsTable({ rows, filterActive = false, substatColors, useStatButtonColors = false, onJumpToRule }: TesterItemsTableProps) {
  const { t } = useI18n()
  const theme = useTheme()
  const gridGapCss = theme.spacing(GRID_GAP_UNITS)
  const gridGapPx = pxValue(gridGapCss)
  const gridPaddingPx = pxValue(theme.spacing(GRID_PADDING_UNITS))
  const containerRef = useRef<HTMLDivElement | null>(null)
  const headerScrollRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
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
  const gridContentWidthPx = useMemo(() => {
    if (!cols.length) return 0
    const columnGapWidth = Math.max(0, cols.length - 1) * gridGapPx
    return totalColumnWidthPx + columnGapWidth + (gridPaddingPx * 2)
  }, [cols.length, gridGapPx, gridPaddingPx, totalColumnWidthPx])
  const gridMinWidthCss = gridContentWidthPx > 0 ? `${Math.floor(gridContentWidthPx)}px` : undefined
  const [needHScroll, setNeedHScroll] = useState(false)
  const columnTemplateCss = columnTemplate || 'minmax(220px, 0.9fr) minmax(280px, 1.2fr) minmax(220px, 0.9fr)'

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
      setContainerWidth(node.clientWidth)
    }
    measure()
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure)
      observer.observe(node)
    }
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])
  useLayoutEffect(() => {
    const node = containerRef.current
    if (!node) {
      setNeedHScroll(false)
      return
    }
    const { clientWidth, scrollWidth } = node
    if (clientWidth <= 0) {
      setNeedHScroll(false)
      return
    }
    setNeedHScroll((prev) => {
      if (!prev) {
        return scrollWidth > (clientWidth + HSCROLL_ON_MARGIN_PX)
      }
      if (scrollWidth < (clientWidth - HSCROLL_OFF_MARGIN_PX)) {
        return false
      }
      return prev
    })
  }, [containerWidth, gridContentWidthPx])

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
    const headerNode = headerScrollRef.current
    if (!headerNode) return
    const next = event.currentTarget.scrollLeft
    if (Math.abs(headerNode.scrollLeft - next) < 1) return
    headerNode.scrollLeft = next
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
        ref={headerScrollRef}
        sx={{
          overflowX: 'hidden',
          overflowY: 'hidden',
          scrollbarGutter: 'stable both-edges',
          overscrollBehaviorX: 'contain',
          userSelect: 'none',
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: 'background.paper',
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
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: columnTemplateCss,
            gap: gridGapCss,
            px: 1.25,
            py: 0.75,
            minWidth: gridMinWidthCss ?? '100%',
          }}
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
      </Box>
      <Box
        ref={containerRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: needHScroll ? 'auto' : 'hidden',
          overscrollBehaviorY: 'contain',
          overscrollBehaviorX: 'contain',
          scrollbarGutter: 'stable both-edges',
          contain: 'layout paint',
        }}
      >
        <Box sx={{ position: 'relative', height: totalHeight ?? 'auto', ...(gridMinWidthCss ? { minWidth: gridMinWidthCss } : {}) }}>
          <Box
            sx={{
              transform: shouldVirtualize ? `translateY(${padTop}px)` : 'none',
              ...(gridMinWidthCss ? { minWidth: gridMinWidthCss } : {}),
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
                gridTemplateColumns={columnTemplateCss}
                gridMinWidthPx={gridMinWidthCss}
                gridGap={gridGapCss}
                {...(onJumpToRule ? { onJumpToRule } : {})}
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
  gridTemplateColumns: string
  gridMinWidthPx?: string | undefined
  gridGap: string
  onJumpToRule?: (ruleIndex: number, cfgIdx: number | null) => void
}

function TesterItemRow({ row, t, dividerColor, substatColors, useStatButtonColors, gridTemplateColumns, gridMinWidthPx, gridGap, onJumpToRule }: TesterItemRowProps) {
  const artifact = row.artifact
  const match = row.match
  const SlotIcon = artifactTypeIconFor(artifact.slot as ArtifactTypeId)
  const slotLabel = t(artifactTypeI18nKey(Number(artifact.slot)))
  const setIdNumber = Number(artifact.set)
  const setLabel = formatTesterSetLabel({ setId: setIdNumber, slot: artifact.slot as ArtifactTypeId, translate: t })
  const factionLabel = artifact.faction ? t(factionI18nKey(artifact.faction)) : ''
  const levelBucketLabel = formatLevel(artifact.level)
  const hasExactLevel = typeof artifact.exactLevel === 'number' && Number.isFinite(artifact.exactLevel)
  const exactLevelLabel = hasExactLevel ? String(Math.max(0, Math.min(16, Math.round(Number(artifact.exactLevel))))) : null
  const levelLabel = hasExactLevel
    ? (exactLevelLabel ?? levelBucketLabel)
    : levelBucketLabel
  const rankLabel = formatRank(artifact.rank as RankValue)
  const rarityLabel = resolveRarityLabel(t, Number(artifact.rarity))
  const mainLabel = artifact.mainStat ? t(statVariantI18nKey(artifact.mainStat.variant)) : t('any')
  const mainValue = formatStatTotal(artifact.mainStat ?? null)
  const levelChipLabel = t('testerLevelLabel', { level: levelLabel })
  const mainInline = mainValue
    ? t('testerMainStatInline', { stat: mainLabel, value: mainValue })
    : mainLabel
  const mainVariant = artifact.mainStat?.variant
  const rawMainColor = typeof mainVariant === 'number'
    ? (substatColors[mainVariant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[mainVariant])
    : undefined
  const mainSummaryColor = useStatButtonColors ? rawMainColor : undefined
  const { tooltip: subTooltip } = formatSubstats(artifact.substats, t)
  const substatEntries = artifact.substats
    .filter((stat) => stat.variant !== StatVariant.Any)
    .map((stat) => {
      const label = `${t(statVariantI18nKey(stat.variant))} ${formatStatTotal(stat) || t('testerValueUnknown')}`.trim()
      const color = useStatButtonColors
        ? (substatColors[stat.variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[stat.variant])
        : undefined
      return { variant: stat.variant, label, color }
    })
  const ascVariant = artifact.ascension?.variant
  const ascValue = artifact.ascension ? formatStatNumber(artifact.ascension.totalValue) : ''
  const ascLabel = artifact.ascension ? t(statVariantI18nKey(artifact.ascension.variant)) : ''
  const ascInline = artifact.ascension
    ? (ascValue ? t('testerMainStatInline', { stat: ascLabel, value: ascValue }) : ascLabel)
    : ''
  const ascSummaryColor = useStatButtonColors && typeof ascVariant === 'number'
    ? (substatColors[ascVariant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[ascVariant])
    : undefined
  const rerollLabel = artifact.rerollCount > 0 ? t('testerRerollLabel', { count: artifact.rerollCount }) : ''
  const sourceDescriptor = getItemSourceDescriptor(artifact, t)
  const sourceLabelNode = sourceDescriptor ? (
    <Typography variant="caption" color="text.secondary" noWrap sx={{ fontWeight: 600 }}>
      {sourceDescriptor.label}
    </Typography>
  ) : null
  const sourceLabelWrapper = sourceLabelNode ? (
    <Box sx={{ ml: 'auto', flexShrink: 0, display: 'inline-flex' }}>
      {sourceLabelNode}
    </Box>
  ) : null
  const ellipsisChipSx = {
    minWidth: 0,
    maxWidth: '100%',
    flexShrink: 1,
    '& .MuiChip-label': {
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      display: 'block',
    },
  } as const

  let outcomeColor: 'success' | 'error' | 'default' = 'default'
  let outcomeLabel = t('testerMatchNoRule')
  if (match) {
    outcomeColor = match.keep ? 'success' : 'error'
    outcomeLabel = match.keep ? t('testerMatchKeep') : t('testerMatchSell')
  }

  const extras = rerollLabel ? [rerollLabel] : []
  const mainSummaryContent = (
    <>
      <Box component="span" sx={{ color: mainSummaryColor ?? 'inherit' }}>
        {mainInline}
      </Box>
      {ascInline ? (
        <>
          {' + '}
          <Box component="span" sx={{ color: ascSummaryColor ?? 'inherit' }}>
            {ascInline}
          </Box>
        </>
      ) : null}
    </>
  )

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns,
        ...(gridMinWidthPx ? { minWidth: gridMinWidthPx } : {}),
        alignItems: 'center',
        gap: gridGap,
        px: 1.25,
        py: 0.75,
        height: ROW_HEIGHT_PX,
        borderBottom: `1px solid ${dividerColor}`,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, overflow: 'hidden' }}>
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
          {artifact.faction ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
              <FactionIcon faction={artifact.faction} size={16} />
              <Typography variant="caption" color="text.secondary" noWrap title={factionLabel}>
                {factionLabel}
              </Typography>
            </Box>
          ) : null}
        </Box>
        {sourceDescriptor && sourceLabelWrapper ? (
          sourceDescriptor.tooltip ? (
            <Tooltip title={sourceDescriptor.tooltip}>
              {sourceLabelWrapper}
            </Tooltip>
          ) : (
            sourceLabelWrapper
          )
        ) : null}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 0.75, minWidth: 0, overflow: 'hidden' }}>
          <TesterSummaryLabel label={levelChipLabel} />
          <TesterSummaryLabel label={rankLabel} />
          <TesterSummaryLabel label={rarityLabel} />
        </Box>
        <TesterSummaryLabel label={mainSummaryContent} />
        <Tooltip title={subTooltip}>
          <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 0.5, minWidth: 0, overflow: 'hidden' }}>
            {substatEntries.length > 0 ? (
              substatEntries.map((entry) => (
                <TesterSummaryLabel key={`sub-${entry.variant}`} label={entry.label} color={entry.color} />
              ))
            ) : (
              <TesterSummaryLabel label="—" />
            )}
          </Box>
        </Tooltip>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0, overflow: 'hidden' }}>
        <Chip
          label={outcomeLabel}
          size="small"
          color={outcomeColor}
          sx={{
            ...ellipsisChipSx,
            alignSelf: 'flex-start',
            '& .MuiChip-label': {
              ...(ellipsisChipSx['& .MuiChip-label'] as Record<string, unknown>),
              fontWeight: 600,
            },
          }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, overflow: 'hidden' }}>
          {match ? (
            <TesterRuleReferenceChip
              match={match}
              sx={ellipsisChipSx}
              {...(onJumpToRule ? { onJump: onJumpToRule } : {})}
            />
          ) : null}
        </Box>
        {extras.length > 0 ? (
          <Tooltip title={extras.join(' • ')}>
            <Typography variant="caption" color="text.secondary" noWrap>
              {extras.join(' • ')}
            </Typography>
          </Tooltip>
        ) : null}
      </Box>
    </Box>
  )
}
