import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Button,
  Chip,
  Divider,
  Menu,
  MenuItem,
  Popover,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SellIcon from '@mui/icons-material/Sell'
import { useTheme, type Theme } from '@mui/material/styles'
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import MailOutlineIcon from '@mui/icons-material/MailOutline'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import { useI18n } from '../lib/i18n'
import type { TesterPreviewRow } from '../types/testerPreview'
import { SetIcon } from './SetIcon'
import { FactionIcon } from './FactionIcon'
import {
  artifactSetNames,
  artifactTypeName,
  factionI18nKey,
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  formatLevel,
  statVariantI18nKey,
  type ArtifactTypeId,
  type ArtifactSetId,
  type FactionId,
  StatVariant,
} from '../lib/types'
import { formatTesterSetLabel } from '../lib/testerFormatters'
import {
  formatCircledDigit,
  formatStatNumber,
  formatStatPreGlyph,
  formatSubstats,
  getItemSourceDescriptor,
} from '../lib/testerPreviewFormatting'
import { isAccessorySlot } from '../lib/testerDomain'
import type { TesterSourceFilter } from '../lib/rulesFilter'
import { TesterSummaryLabel } from './TesterSummaryLabel'
import { TesterRuleReferenceChip } from './TesterRuleReferenceChip'
import { WithSetTooltip } from './SetTooltip'
import ContextMenuPaper from './ContextMenuPaper'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import { useContextMenuHint } from '../hooks/useContextMenuHint'
import GridIconBox from './GridIconBox'
import { MENU_CONTROL_HEIGHT_PX, MENU_CONTROL_MIN_WIDTH_PX, type ColorBlindMode } from '../lib/constants'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'
import { useTesterGridPreferences } from '../state/testerGridPreferences'

const GRID_CARD_SINGLE_COLUMN_TEMPLATE = 'minmax(0, 1fr)'
const TESTER_GRID_ICON_BOX_SIZE_PX = 72
const GRID_CARD_ICON_COLUMN_PX = TESTER_GRID_ICON_BOX_SIZE_PX
const GRID_CARD_STATS_MIN_COLUMN_PX = 112
const GRID_CARD_TEMPLATE = `${GRID_CARD_ICON_COLUMN_PX}px minmax(${GRID_CARD_STATS_MIN_COLUMN_PX}px, 1fr)`
const GRID_GAP = 0.375
const CARD_COLUMN_GAP_UNITS = 1.25
const CARD_BORDER_RADIUS_PX = 8
const CARD_PADDING_UNITS = 1
const CARD_MATCH_ROW_HEIGHT_PX = 24
const CARD_MATCH_ROW_GAP_PX = 2
const CARD_MATCH_ROW_MARGIN_PX = 2
const GRID_CARD_CONTAINER_PADDING_UNITS = 0.75
const GRID_CARD_LEFT_COLUMN_GAP_UNITS = 0.5
const GRID_CARD_SOURCE_ICON_SIZE_PX = 24
const CARD_TEXT_STACK_GAP_UNITS = 0.75
const CARD_SUBSTAT_ROW_GAP_UNITS = 0.25
const CARD_SUBSTAT_LINE_HEIGHT = 1.1
const CARD_SUBSTAT_LINE_COUNT = 4
const CARD_SUMMARY_FONT_SIZE_REM = 0.9375
const CARD_SUMMARY_LINE_HEIGHT_REM = 1.25
const CARD_ASC_LINE_HEIGHT = 1.1
const CARD_ASC_FONT_DECREMENT_PX = 1.5
const CARD_ASC_BLOCK_MARGIN_TOP_UNITS = 0.125
const CARD_COLUMN_HEIGHT_BUFFER_PX = 0
const MAX_MATCHING_CHIPS = 6
const ESTIMATED_ACCORDION_HEADER_PX = 60
const ACCORDION_MARGIN_UNITS = 0.75
const ACCORDION_BORDER_RADIUS_PX = 8
const GRID_VIRTUALIZE_GROUP_THRESHOLD = 12
const GRID_VIRTUALIZE_ROW_THRESHOLD = 150
const GRID_VIRTUALIZATION_ENABLED = true
const GRID_VIRTUALIZE_OVERSCAN_PX = 640
const GRID_VIRTUALIZE_DEFAULT_VIEWPORT_PX = 720
// Allow very tall single-column accordions without letting fallback heights overflow the browser layout.
// 2M px ~= 9k tester cards stacked vertically, which is well above real data while keeping sums finite.
const GRID_VIRTUALIZE_MAX_FALLBACK_HEIGHT_PX = 2_000_000
const MATCHING_POPOVER_MAX_WIDTH_PX = 360
const MATCHING_CHIP_MIN_WIDTH_PX = 50
const MATCHING_CHIP_GAP_UNITS = 0.5
const MATCHING_CONFIG_CHIP_SX = {
  flexShrink: 0,
  minWidth: MATCHING_CHIP_MIN_WIDTH_PX,
  maxWidth: '100%',
  overflow: 'hidden',
  borderRadius: '8px',
  flexBasis: 'auto',
  flexGrow: 0,
  '& .MuiChip-label': {
    display: 'block',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
} as const
const MATCHING_CHIP_WRAPPER_SX = {
  display: 'inline-flex',
  maxWidth: '100%',
  minWidth: 0,
  flexBasis: 'auto',
  flexGrow: 0,
  flexShrink: 0,
} as const

const SOURCE_ICON_MAP: Record<TesterSourceFilter, React.ElementType | null> = {
  manual: BuildOutlinedIcon,
  inventory: null,
  collection: PersonOutlineIcon,
  vault: Inventory2OutlinedIcon,
  inbox: MailOutlineIcon,
}

const pxValue = (value: string): number => Number.parseFloat(value) || 0
const measureMatchingRowContentWidth = (node: HTMLElement): number => {
  if (typeof window === 'undefined') {
    return node.clientWidth
  }
  const style = window.getComputedStyle(node)
  const paddingLeft = pxValue(style.paddingLeft)
  const paddingRight = pxValue(style.paddingRight)
  return Math.max(0, node.clientWidth - paddingLeft - paddingRight)
}
type TranslateFn = ReturnType<typeof useI18n>['t']

type TesterItemsGridProps = {
  rows: TesterPreviewRow[]
  filterActive?: boolean
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors?: boolean
  testerBuilding?: boolean
  onToggleStatColors: (next: boolean) => void
  onOpenManageColors: () => void
  colorBlindMode: ColorBlindMode
  onChangeColorBlindMode: (mode: ColorBlindMode) => void
  colorIconSrc: string
  configNames: Array<string | null>
  onJumpToRule?: ((ruleIndex: number, cfgIdx: number | null) => void) | undefined
}

type TesterGroupKind = 'artifactSet' | 'accessorySet' | 'accessoryFaction'

type TesterGroup = {
  key: string
  label: string
  setId: number | null
  slot: ArtifactTypeId | null
  factionId: FactionId | null
  rows: TesterPreviewRow[]
  order: number
  kind: TesterGroupKind
  children?: TesterGroup[]
  parentKey?: string | null
}

type MatchingConfigEntry = {
  cfgIdx: number
  label: string
}

export function TesterItemsGrid(props: TesterItemsGridProps) {
  const {
    rows,
    filterActive = false,
    substatColors,
    useStatButtonColors = false,
    testerBuilding = false,
    onToggleStatColors,
    onOpenManageColors,
    colorBlindMode,
    onChangeColorBlindMode,
    colorIconSrc,
    configNames,
    onJumpToRule,
  } = props
  const { t } = useI18n()
  const theme = useTheme()
  const groups = useMemo(() => groupRowsBySet(rows, t), [rows, t])
  const numberFormatter = useMemo(() => new Intl.NumberFormat(undefined), [])
  const {
    columns: gridColumnPreference,
    showFirstMatch,
    showOtherMatches,
    setColumns,
    setShowFirstMatch,
    setShowOtherMatches,
  } = useTesterGridPreferences()
  const {
    shouldShow: shouldShowGridContextHint,
    markSeen: markGridContextHintSeen,
  } = useContextMenuHint('testerGridContextMenu')
  const [gridContextHintPos, setGridContextHintPos] = useState<{ x: number; y: number } | null>(null)
  const handleGridHintPointerMove = useCallback((event: React.MouseEvent<Element>) => {
    if (!shouldShowGridContextHint) return
    setGridContextHintPos({ x: event.clientX, y: event.clientY })
  }, [shouldShowGridContextHint])
  const handleGridHintPointerLeave = useCallback(() => {
    setGridContextHintPos(null)
  }, [])
  const handleGridHintSeen = useCallback(() => {
    markGridContextHintSeen()
    setGridContextHintPos(null)
  }, [markGridContextHintSeen])
  useEffect(() => {
    if (!shouldShowGridContextHint) {
      setGridContextHintPos(null)
    }
  }, [shouldShowGridContextHint])
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
  const allGroupKeys = useMemo(() => {
    const keys = new Set<string>()
    const addKeys = (group: TesterGroup) => {
      keys.add(group.key)
      group.children?.forEach(addKeys)
    }
    groups.forEach(addKeys)
    return keys
  }, [groups])
  const groupLookup = useMemo(() => {
    const map = new Map<string, TesterGroup>()
    const addGroup = (group: TesterGroup) => {
      map.set(group.key, group)
      group.children?.forEach(addGroup)
    }
    groups.forEach(addGroup)
    return map
  }, [groups])
  const getMultiToggleScope = useCallback((groupKey: string): Iterable<string> => {
    const group = groupLookup.get(groupKey)
    if (!group || !group.parentKey) {
      return allGroupKeys
    }
    const parent = groupLookup.get(group.parentKey)
    if (parent?.children?.length) {
      return parent.children.map((child) => child.key)
    }
    return [groupKey]
  }, [allGroupKeys, groupLookup])

  const handleGroupToggle = useCallback((
    groupKey: string,
    shouldExpand: boolean,
    event?: React.SyntheticEvent<Element, Event> | null,
    options?: { applyToAll?: boolean },
  ) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      const isMultiToggle = Boolean(options?.applyToAll)
        || Boolean((event && 'ctrlKey' in event && (event as React.MouseEvent).ctrlKey)
          || (event && 'metaKey' in event && (event as React.MouseEvent).metaKey))
      if (isMultiToggle) {
        let changed = false
        for (const key of getMultiToggleScope(groupKey)) {
          if (shouldExpand) {
            if (next.delete(key)) changed = true
          } else if (!next.has(key)) {
            next.add(key)
            changed = true
          }
        }
        return changed ? next : prev
      }
      if (shouldExpand) {
        if (!next.has(groupKey)) return prev
        next.delete(groupKey)
        return next
      }
      if (next.has(groupKey)) return prev
      next.add(groupKey)
      return next
    })
  }, [getMultiToggleScope])

  useEffect(() => {
    setCollapsedGroups((prev) => {
      let changed = false
      const next = new Set<string>()
      prev.forEach((key) => {
        if (allGroupKeys.has(key)) {
          next.add(key)
        } else {
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [allGroupKeys])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [gridMenuPosition, setGridMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const gridMenuOpen = Boolean(gridMenuPosition)
  const gridMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const gridContextHintActive = shouldShowGridContextHint && gridContextHintPos !== null && !gridMenuOpen
  const handleGridContextMenu = useCallback((event: React.MouseEvent<Element>) => {
    event.preventDefault()
    event.stopPropagation()
    setGridMenuPosition({ x: event.clientX, y: event.clientY })
    handleGridHintSeen()
  }, [handleGridHintSeen])
  const closeGridMenu = useCallback(() => {
    setGridMenuPosition(null)
  }, [])
  useContextMenuCloseOnOutsideRightClick({
    open: gridMenuOpen,
    onClose: closeGridMenu,
    menuRef: gridMenuPaperRef,
  })
  const handleScroll = useCallback<React.UIEventHandler<HTMLDivElement>>((event) => {
    setScrollTop(event.currentTarget.scrollTop)
  }, [])
  const preferredColumnCount = gridColumnPreference === 5 ? 5 : 4
  const {
    accordionSpacingPx,
    cardHeightPx,
    gridColumnCount,
    gridGapPx,
    leafPaddingPx: gridLeafPaddingPx,
  } = useTesterGridLayoutMetrics({
    preferredColumnCount,
    showFirstMatch,
    showOtherMatches,
    theme,
  })
  const groupCountChipBg = theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100]
  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const measure = () => {
      setViewportHeight(node.clientHeight)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(() => { measure() })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const estimatedColumnCount = gridColumnCount
  const shouldVirtualize = GRID_VIRTUALIZATION_ENABLED
    && (rows.length > GRID_VIRTUALIZE_ROW_THRESHOLD || groups.length > GRID_VIRTUALIZE_GROUP_THRESHOLD)
  const virtualization = useMemo<{
    visibleGroups: TesterGroup[]
    padTop: number
    padBottom: number
    totalHeight: number | undefined
    rangeStartIndex: number
    rangeEndIndex: number
    viewportHeight: number
  }>(() => {
    if (!shouldVirtualize) {
      return {
        visibleGroups: groups,
        padTop: 0,
        padBottom: 0,
        totalHeight: undefined,
        rangeStartIndex: 0,
        rangeEndIndex: groups.length,
        viewportHeight: viewportHeight > 0 ? viewportHeight : GRID_VIRTUALIZE_DEFAULT_VIEWPORT_PX,
      }
    }
    if (!groups.length) {
      return {
        visibleGroups: [],
        padTop: 0,
        padBottom: 0,
        totalHeight: 0,
        rangeStartIndex: 0,
        rangeEndIndex: 0,
        viewportHeight: viewportHeight > 0 ? viewportHeight : GRID_VIRTUALIZE_DEFAULT_VIEWPORT_PX,
      }
    }
    const heights: number[] = []
    const offsets: number[] = []
    let total = 0
    for (let idx = 0; idx < groups.length; idx += 1) {
      const group = groups[idx]!
      offsets[idx] = total
      const estimated = estimateGroupHeight(
        group,
        collapsedGroups,
        estimatedColumnCount,
        accordionSpacingPx,
        gridGapPx,
        gridLeafPaddingPx,
        cardHeightPx,
      )
      heights[idx] = estimated
      total += estimated
    }
    const fallbackViewportHeight = viewportHeight > 0
      ? viewportHeight
      : (containerRef.current?.clientHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 0))
    const viewport = fallbackViewportHeight > 0 ? fallbackViewportHeight : GRID_VIRTUALIZE_DEFAULT_VIEWPORT_PX
    const startTarget = Math.max(0, scrollTop - GRID_VIRTUALIZE_OVERSCAN_PX)
    const endTarget = Math.min(total, scrollTop + viewport + GRID_VIRTUALIZE_OVERSCAN_PX)
    let startIdx = 0
    while (startIdx < heights.length && ((offsets[startIdx] ?? 0) + (heights[startIdx] ?? 0)) <= startTarget) {
      startIdx += 1
    }
    if (startIdx >= groups.length) startIdx = Math.max(0, groups.length - 1)
    let endIdx = startIdx
    while (endIdx < heights.length && (offsets[endIdx] ?? 0) < endTarget) {
      endIdx += 1
    }
    if (endIdx <= startIdx) endIdx = startIdx + 1
    const padTop = offsets[startIdx] ?? 0
    const visibleGroups = groups.slice(startIdx, endIdx)
    const visibleHeight = visibleGroups.reduce((sum, _group, idx) => {
      const actualIdx = startIdx + idx
      const height = heights[actualIdx] ?? 0
      return sum + Math.max(0, height)
    }, 0)
    const padBottom = Math.max(0, total - padTop - visibleHeight)
    return {
      visibleGroups,
      padTop,
      padBottom,
      totalHeight: total,
      rangeStartIndex: startIdx,
      rangeEndIndex: endIdx,
      viewportHeight: viewport,
    }
  }, [
    accordionSpacingPx,
    cardHeightPx,
    collapsedGroups,
    estimatedColumnCount,
    gridGapPx,
    gridLeafPaddingPx,
    groups,
    scrollTop,
    shouldVirtualize,
    viewportHeight,
  ])
  const renderedGroups = virtualization.visibleGroups
  const virtualizedHeight = shouldVirtualize ? Math.max(virtualization.totalHeight ?? 0, 0) : undefined
  const virtualizedPadTop = shouldVirtualize ? virtualization.padTop : 0
  const virtualizedPadBottom = shouldVirtualize ? virtualization.padBottom : 0
  if (rows.length === 0) {
    return (
      <Box
        sx={{
          flex: '1 1 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          color: 'text.secondary',
          px: 2,
          py: 3,
        }}
      >
        <Typography variant="body2" color="inherit">
          {filterActive ? t('testerTableEmptyFilter') : t('testerTableEmpty')}
        </Typography>
      </Box>
    )
  }
  const renderGroup = (group: TesterGroup, depth = 0): React.ReactNode => {
    const groupCountLabel = group.rows.length === 1
      ? t('testerItemsCountOne')
      : t('testerItemsCountMany', { n: numberFormatter.format(group.rows.length) })
    const expanded = !collapsedGroups.has(group.key)
    return (
      <TesterItemsGridGroup
        key={group.key}
        group={group}
        expanded={expanded}
        groupCountLabel={groupCountLabel}
        chipBgColor={groupCountChipBg}
        onToggleGroup={handleGroupToggle}
        onAnyContextMenu={handleGridHintSeen}
        substatColors={substatColors}
        useStatButtonColors={useStatButtonColors}
        testerBuilding={testerBuilding}
        gridColumnCount={gridColumnCount}
        showFirstMatchRow={showFirstMatch}
        showOtherMatchesRow={showOtherMatches}
        cardHeightPx={cardHeightPx}
        configNames={configNames}
        onJumpToRule={onJumpToRule}
        childContent={group.children?.length ? group.children.map((child) => renderGroup(child, depth + 1)) : undefined}
        depth={depth}
      />
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box
        ref={containerRef}
        onScroll={handleScroll}
        onMouseMove={handleGridHintPointerMove}
        onMouseLeave={handleGridHintPointerLeave}
        onContextMenu={handleGridContextMenu}
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 0.5 }}
      >
        <Box
          sx={{
            position: 'relative',
            ...(shouldVirtualize && typeof virtualizedHeight === 'number'
              ? {
                  height: `${virtualizedHeight}px`,
                  minHeight: `${virtualizedHeight}px`,
                }
              : {}),
          }}
        >
          {shouldVirtualize ? (
            <Box sx={{ height: `${virtualizedPadTop}px` }} />
          ) : null}
          {renderedGroups.map((group) => renderGroup(group, 0))}
          {shouldVirtualize ? (
            <Box sx={{ height: `${virtualizedPadBottom}px` }} />
          ) : null}
        </Box>
      </Box>
      <ContextMenuHintOverlay text={t('contextMenuHint')} position={gridContextHintActive ? gridContextHintPos : null} />
      <Menu
        open={gridMenuOpen}
        onClose={closeGridMenu}
        anchorReference="anchorPosition"
        {...(gridMenuPosition ? { anchorPosition: { top: gridMenuPosition.y, left: gridMenuPosition.x } } : {})}
        slotProps={{
          paper: {
            component: ContextMenuPaper,
            onRequestClose: closeGridMenu,
            closeLabel: t('close'),
            ref: gridMenuPaperRef,
          } as unknown as MuiPaperProps,
        }}
      >
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => onToggleStatColors(!useStatButtonColors)}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuColorStatTexts')}</Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'stretch',
              gap: 0.5,
              width: MENU_CONTROL_MIN_WIDTH_PX,
              height: MENU_CONTROL_HEIGHT_PX,
              minHeight: MENU_CONTROL_HEIGHT_PX,
            }}
            onClick={(event) => { event.stopPropagation() }}
          >
            <Button
              size="small"
              variant={useStatButtonColors ? 'contained' : 'outlined'}
              color="success"
              sx={{ flex: '1 1 auto', minWidth: 0, height: '100%', lineHeight: 1, py: 0, px: 1 }}
              onClick={(event) => { event.stopPropagation(); onToggleStatColors(!useStatButtonColors) }}
            >
              {useStatButtonColors ? t('commonOn') : t('commonOff')}
            </Button>
            <Tooltip title={t('manageColors')}>
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  color="info"
                  disabled={!useStatButtonColors}
                  sx={{ flex: '0 0 auto', minWidth: 28, width: 28, height: '100%', lineHeight: 1, py: 0, ml: 'auto', px: 0.25 }}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (!useStatButtonColors) return
                    onOpenManageColors()
                  }}
                  aria-label={t('manageColorsAria')}
                >
                  <img src={colorIconSrc} width={16} height={16} alt={t('manageColors')} style={{ display: 'block' }} />
                </Button>
              </span>
            </Tooltip>
          </Box>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => {
          const nextMode = colorBlindMode === 'normal'
            ? 'okabeIto'
            : (colorBlindMode === 'okabeIto' ? 'tritan' : 'normal')
          onChangeColorBlindMode(nextMode)
        }}
        >
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuColorBlindPalette')}</Typography>
          <Button
            size="small"
            variant={colorBlindMode === 'normal' ? 'outlined' : 'contained'}
            color="success"
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              const nextMode = colorBlindMode === 'normal'
                ? 'okabeIto'
                : (colorBlindMode === 'okabeIto' ? 'tritan' : 'normal')
              onChangeColorBlindMode(nextMode)
            }}
          >
            {colorBlindMode === 'normal'
              ? t('colorBlindNormal')
              : (colorBlindMode === 'okabeIto' ? t('colorBlindOkabeIto') : t('colorBlindTritan'))}
          </Button>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setColumns(preferredColumnCount === 5 ? 4 : 5)}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuGridColumns')}</Typography>
          <Button
            size="small"
            variant="contained"
            color="success"
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              setColumns(preferredColumnCount === 5 ? 4 : 5)
            }}
          >
            {t('rulesMenuGridColumnsValue', { count: preferredColumnCount })}
          </Button>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setShowFirstMatch(!showFirstMatch)}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuShowFirstMatch')}</Typography>
          <Button
            size="small"
            variant={showFirstMatch ? 'contained' : 'outlined'}
            color="success"
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              setShowFirstMatch(!showFirstMatch)
            }}
          >
            {showFirstMatch ? t('commonOn') : t('commonOff')}
          </Button>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setShowOtherMatches(!showOtherMatches)}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuShowOtherMatches')}</Typography>
          <Button
            size="small"
            variant={showOtherMatches ? 'contained' : 'outlined'}
            color="success"
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              setShowOtherMatches(!showOtherMatches)
            }}
          >
            {showOtherMatches ? t('commonOn') : t('commonOff')}
          </Button>
        </MenuItem>
      </Menu>
    </Box>
  )
}

type TesterItemsGridGroupProps = {
  group: TesterGroup
  expanded: boolean
  groupCountLabel: string
  chipBgColor: string
  onToggleGroup: (
    groupKey: string,
    shouldExpand: boolean,
    event?: React.SyntheticEvent<Element, Event> | null,
    options?: { applyToAll?: boolean },
  ) => void
  onAnyContextMenu?: () => void
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  testerBuilding: boolean
  gridColumnCount: number
  showFirstMatchRow: boolean
  showOtherMatchesRow: boolean
  cardHeightPx: number
  configNames: Array<string | null>
  onJumpToRule?: ((ruleIndex: number, cfgIdx: number | null) => void) | undefined
  childContent?: React.ReactNode
  depth?: number
}

const TesterItemsGridGroup = React.memo(function TesterItemsGridGroup({
  group,
  expanded,
  groupCountLabel,
  chipBgColor,
  onToggleGroup,
  onAnyContextMenu,
  substatColors,
  useStatButtonColors,
  testerBuilding,
  gridColumnCount,
  showFirstMatchRow,
  showOtherMatchesRow,
  cardHeightPx,
  configNames,
  onJumpToRule,
  childContent,
  depth = 0,
}: TesterItemsGridGroupProps) {
  const hasChildren = Boolean(childContent)
  const nested = depth > 0
  const numericSetId = typeof group.setId === 'number' && group.setId > 0 ? group.setId : null
  const groupSetTooltipName = numericSetId != null ? (artifactSetNames[numericSetId] ?? null) : null
  const summarySetIcon = numericSetId != null ? (
    <Box sx={{ lineHeight: 0, display: 'flex', alignItems: 'center' }}>
      <SetIcon setId={numericSetId as ArtifactSetId} size={24} />
    </Box>
  ) : null

  return (
    <Accordion
      expanded={expanded}
      onChange={(event, isExpanded) => onToggleGroup(group.key, isExpanded, event)}
      sx={(theme) => ({
        mb: nested ? 0 : ACCORDION_MARGIN_UNITS,
        borderRadius: `${Math.max(ACCORDION_BORDER_RADIUS_PX - (nested ? 2 : 0), 2)}px`,
        ml: nested ? theme.spacing(1.5) : 0,
        overflow: 'hidden',
        border: `1px solid ${theme.palette.divider}`,
        backgroundColor: nested ? theme.palette.background.default : theme.palette.background.paper,
        '&::before': {
          display: 'none',
        },
      })}
      square={false}
      disableGutters
      elevation={0}
    >
      <AccordionSummary
        sx={(theme) => ({
          minHeight: theme.spacing(5),
          '&.Mui-expanded': {
            minHeight: theme.spacing(5),
          },
          '& .MuiAccordionSummary-content': {
            my: 0,
          },
          '& .MuiAccordionSummary-content.Mui-expanded': {
            my: 0,
          },
        })}
        expandIcon={<ExpandMoreIcon />}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onToggleGroup(group.key, !expanded, event, { applyToAll: true })
          onAnyContextMenu?.()
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%', flexWrap: 'nowrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            {groupSetTooltipName && summarySetIcon ? (
              <WithSetTooltip name={groupSetTooltipName} displayName={group.label}>
                {summarySetIcon}
              </WithSetTooltip>
            ) : summarySetIcon}
            {group.factionId ? (
              <FactionIcon
                faction={group.factionId}
                size={group.kind === 'accessoryFaction' ? 24 : 18}
              />
            ) : null}
          </Box>
          <Typography
            variant={nested ? 'subtitle2' : 'subtitle1'}
            sx={{ flex: 1, minWidth: 0 }}
            noWrap
          >
            {group.label}
          </Typography>
          <Chip
            size="small"
            label={groupCountLabel}
            sx={{ bgcolor: chipBgColor }}
          />
        </Stack>
      </AccordionSummary>
      {expanded ? (
        <AccordionDetails
          sx={(theme) => ({
            backgroundColor: 'inherit',
            p: hasChildren
              ? theme.spacing(ACCORDION_MARGIN_UNITS)
              : theme.spacing(GRID_CARD_CONTAINER_PADDING_UNITS),
          })}
        >
          {hasChildren ? (
            <Stack spacing={ACCORDION_MARGIN_UNITS}>
              {childContent}
            </Stack>
          ) : (
            <Box
              sx={(theme) => ({
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.max(1, gridColumnCount)}, ${GRID_CARD_SINGLE_COLUMN_TEMPLATE})`,
                gap: theme.spacing(GRID_GAP),
                bgcolor: 'inherit',
              })}
            >
              {group.rows.map((row) => (
                <TesterGridCard
                  key={row.artifact.id}
                  row={row}
                  substatColors={substatColors}
                  useStatButtonColors={useStatButtonColors}
                  testerBuilding={testerBuilding}
                  showFirstMatchRow={showFirstMatchRow}
                  showOtherMatchesRow={showOtherMatchesRow}
                  cardHeightPx={cardHeightPx}
                  gridColumnCount={gridColumnCount}
                  configNames={configNames}
                  onJumpToRule={onJumpToRule}
                />
              ))}
            </Box>
          )}
        </AccordionDetails>
      ) : null}
    </Accordion>
  )
});

const TesterGridCard = React.memo(function TesterGridCard({
  row,
  substatColors,
  useStatButtonColors,
  testerBuilding,
  showFirstMatchRow,
  showOtherMatchesRow,
  cardHeightPx,
  gridColumnCount,
  configNames,
  onJumpToRule,
}: {
  row: TesterPreviewRow
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  testerBuilding: boolean
  showFirstMatchRow: boolean
  showOtherMatchesRow: boolean
  cardHeightPx: number
  gridColumnCount: number
  configNames: Array<string | null>
  onJumpToRule?: ((ruleIndex: number, cfgIdx: number | null) => void) | undefined
}) {
  const { t } = useI18n()
  const theme = useTheme()
  const artifact = row.artifact
  const match = row.match
  const setIdNumber = Number(artifact.set) || 0
  const setLabel = formatTesterSetLabel({ setId: setIdNumber, slot: artifact.slot as ArtifactTypeId, translate: t })
  const setTooltipName = Number.isFinite(setIdNumber) ? artifactSetNames[setIdNumber] ?? null : null
  const levelBucketLabel = formatLevel(artifact.level)
  const hasExactLevel = typeof artifact.exactLevel === 'number' && Number.isFinite(artifact.exactLevel)
  const exactLevelLabel = hasExactLevel ? String(Math.max(0, Math.min(16, Math.round(Number(artifact.exactLevel))))) : null
  const levelLabel = exactLevelLabel ?? levelBucketLabel
  const levelChipLabel = levelLabel || t('any')
  const mainLabel = artifact.mainStat ? t(statVariantI18nKey(artifact.mainStat.variant)) : t('any')
  const mainValue = formatStatPreGlyph(artifact.mainStat ?? null)
  const mainInline = mainValue ? t('testerMainStatInline', { stat: mainLabel, value: mainValue }) : mainLabel
  const mainVariant = artifact.mainStat?.variant
  const mainColor = useStatButtonColors && typeof mainVariant === 'number'
    ? (substatColors[mainVariant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[mainVariant])
    : undefined
  const { tooltip: subTooltip } = formatSubstats(artifact.substats, t)
  const glyphDeltaColor = theme.palette.success.main
  const substatEntries = artifact.substats
    .filter((stat) => stat.variant !== StatVariant.Any)
    .map((stat) => {
      const statLabel = t(statVariantI18nKey(stat.variant))
      const statValue = formatStatPreGlyph(stat) || t('testerValueUnknown')
      const statColor = useStatButtonColors
        ? (substatColors[stat.variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[stat.variant])
        : undefined
      const glyphMagnitude = Math.abs(Number(stat.glyphValue) || 0)
      const glyphDelta = glyphMagnitude >= 0.01
        ? `${Number(stat.glyphValue) >= 0 ? '+' : '-'}${formatStatNumber(glyphMagnitude)}`
        : null
      const mythMagnitude = Math.abs(Number(stat.mythValue) || 0)
      const hasMythBonus = mythMagnitude >= 0.01
      const rollGlyph = (typeof stat.rolls === 'number' && stat.rolls > 0)
        ? formatCircledDigit(stat.rolls)
        : null
      const rollAriaLabel = (typeof stat.rolls === 'number' && stat.rolls > 0)
        ? t('testerRollsLabel', { rolls: stat.rolls })
        : null
      return {
        variant: stat.variant,
        isMythicBonus: hasMythBonus,
        content: (
          <>
            <Box component="span" sx={{ color: statColor ?? 'inherit' }}>
              {statLabel} {statValue}
            </Box>
            {rollGlyph ? (
              <Box
                component="span"
                sx={{
                  ml: 0.5,
                  fontSize: '1rem',
                  lineHeight: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  position: 'relative',
                  top: '0.06em',
                }}
                aria-label={rollAriaLabel ?? undefined}
              >
                {rollGlyph}
              </Box>
            ) : null}
            {glyphDelta ? (
              <Box component="span" sx={{ color: glyphDeltaColor, fontWeight: 600, ml: 0.5 }}>
                {glyphDelta}
              </Box>
            ) : null}
          </>
        ),
      }
});
  const ascVariant = artifact.ascension?.variant
  const ascValue = artifact.ascension ? formatStatNumber(artifact.ascension.baseValue) : ''
  const ascLabel = artifact.ascension ? t(statVariantI18nKey(artifact.ascension.variant)) : ''
  const ascStatColor = useStatButtonColors && typeof ascVariant === 'number'
    ? (substatColors[ascVariant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[ascVariant])
    : undefined
  const ascInlineFontSize = 'calc(100% - 1.5px)'
  const ascLabelNode = ascLabel ? (
    <Box component="span" sx={{ color: ascStatColor ?? 'inherit', fontSize: ascInlineFontSize }}>
      {ascLabel}
    </Box>
  ) : null
  const ascValueNode = ascValue ? (
    <Box
      component="span"
      sx={{ color: theme.palette.secondary.main, fontWeight: 600, fontSize: ascInlineFontSize }}
    >
      {ascValue}
    </Box>
  ) : null
  const ascSummary = (() => {
    if (!artifact.ascension) return null
    if (ascValue && ascLabelNode && ascValueNode) {
      const statToken = '__STAT__'
      const valueToken = '__VALUE__'
      const template = t('testerMainStatInline', { stat: statToken, value: valueToken })
      const replacements = [
        { token: statToken, node: ascLabelNode },
        { token: valueToken, node: ascValueNode },
      ]
      const parts: React.ReactNode[] = []
      let remaining = template
      while (remaining.length > 0) {
        let matchIdx = -1
        let match: { token: string; node: React.ReactNode } | null = null
        for (const rep of replacements) {
          const idx = remaining.indexOf(rep.token)
          if (idx === -1) continue
          if (matchIdx === -1 || idx < matchIdx) {
            matchIdx = idx
            match = rep
          }
        }
        if (!match || matchIdx === -1) {
          if (remaining) parts.push(remaining)
          break
        }
        if (matchIdx > 0) {
          parts.push(remaining.slice(0, matchIdx))
        }
        parts.push(match.node)
        remaining = remaining.slice(matchIdx + match.token.length)
      }
      return (
        <>
          {parts.map((part, idx) => (
            typeof part === 'string'
              ? <React.Fragment key={`asc-str-${idx}`}>{part}</React.Fragment>
              : <React.Fragment key={`asc-node-${idx}`}>{part}</React.Fragment>
          ))}
        </>
      )
    }
    return ascLabelNode ?? ascValueNode ?? null
  })()
  const sourceDescriptor = getItemSourceDescriptor(artifact, t)
  const SourceIcon = sourceDescriptor ? SOURCE_ICON_MAP[sourceDescriptor.category] : null
  const sourceTooltipTitle = sourceDescriptor ? (sourceDescriptor.tooltip ?? sourceDescriptor.label ?? '') : ''
  const rerollLabel = artifact.rerollCount > 0 ? '⟳' : ''
  const rerollTooltip = artifact.rerollCount > 0 ? t('testerRerollLabel') : ''
  const primaryRuleIndex = typeof match?.ruleIndex === 'number' ? match.ruleIndex : null
  const primaryCfgIndex = typeof match?.cfgIdx === 'number' ? match.cfgIdx : null
  const canJumpToPrimaryMatch = typeof onJumpToRule === 'function' && primaryRuleIndex != null
  const handlePrimaryMatchClick = () => {
    if (canJumpToPrimaryMatch && primaryRuleIndex != null) {
      onJumpToRule?.(primaryRuleIndex, primaryCfgIndex ?? null)
    }
  }
  const matchingIndices = Array.isArray(row.matchingCfgIndices)
    ? Array.from(new Set(row.matchingCfgIndices.filter((idx) => Number.isFinite(idx))))
    : []
  const matchingEntries: MatchingConfigEntry[] = matchingIndices.map((idx) => ({
    cfgIdx: idx as number,
    label: formatConfigLabel(idx as number, configNames, t),
  }))
  const suppressNoMatchChip = testerBuilding && !match && matchingEntries.length === 0
  const shouldShowPrimaryMatchRow = showFirstMatchRow && (match !== null || (!match && !suppressNoMatchChip))
  const otherMatchingEntries = matchingEntries.slice(1)
  const shouldShowOtherMatchesRow = showOtherMatchesRow && otherMatchingEntries.length > 0
  const totalOtherMatches = otherMatchingEntries.length
  const otherMatchingEntriesSignature = useMemo(
    () => otherMatchingEntries.map((entry) => `${entry.cfgIdx}:${entry.label}`).join('|'),
    [otherMatchingEntries],
  )
  const [otherMatchesRowEl, setOtherMatchesRowEl] = useState<HTMLDivElement | null>(null)
  const handleOtherMatchesRowRef = useCallback((node: HTMLDivElement | null) => {
    setOtherMatchesRowEl(node)
  }, [])
  const [otherMatchesRowWidth, setOtherMatchesRowWidth] = useState<number>(0)
  useEffect(() => {
    if (!otherMatchesRowEl) return undefined
    const node = otherMatchesRowEl
    const updateWidth = () => {
      setOtherMatchesRowWidth(measureMatchingRowContentWidth(node))
    }
    updateWidth()
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
      return undefined
    }
    const observer = new ResizeObserver(() => {
      updateWidth()
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [otherMatchesRowEl])
  const desiredOtherMatchingCount = Math.min(MAX_MATCHING_CHIPS, totalOtherMatches)
  const [visibleOtherMatchingLimit, setVisibleOtherMatchingLimit] = useState(desiredOtherMatchingCount)
  useEffect(() => {
    setVisibleOtherMatchingLimit(desiredOtherMatchingCount)
  }, [desiredOtherMatchingCount, otherMatchesRowWidth, otherMatchingEntriesSignature])
  const normalizedVisibleLimit = Math.max(
    0,
    Math.min(visibleOtherMatchingLimit, totalOtherMatches),
  )
  const needsPrefixChip = totalOtherMatches > normalizedVisibleLimit
  const effectiveVisibleOtherMatchingLimit = needsPrefixChip
    ? Math.max(1, normalizedVisibleLimit)
    : normalizedVisibleLimit
  const visibleOtherMatching = otherMatchingEntries.slice(0, effectiveVisibleOtherMatchingLimit)
  const hiddenOtherMatching = otherMatchingEntries.slice(effectiveVisibleOtherMatchingLimit)
  const matchingChipGapPx = pxValue(String(theme.spacing(MATCHING_CHIP_GAP_UNITS)))
  const visibleChipsContainerRef = useRef<HTMLDivElement | null>(null)
  const handleVisibleChipsContainerRef = useCallback((node: HTMLDivElement | null) => {
    visibleChipsContainerRef.current = node
  }, [])
  const moreChipRef = useRef<HTMLSpanElement | null>(null)
  const handleMoreChipRef = useCallback((node: HTMLSpanElement | null) => {
    moreChipRef.current = node
  }, [])
  const [moreChipWidth, setMoreChipWidth] = useState(0)
  useLayoutEffect(() => {
    const node = moreChipRef.current
    if (!node) {
      setMoreChipWidth(0)
      return
    }
    const measure = () => {
      setMoreChipWidth(node.getBoundingClientRect().width)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [hiddenOtherMatching.length])
  const hasHiddenMatches = hiddenOtherMatching.length > 0
  const visibleChipsAvailableWidth = hasHiddenMatches
    ? Math.max(0, otherMatchesRowWidth - (moreChipWidth + matchingChipGapPx))
    : otherMatchesRowWidth
  useLayoutEffect(() => {
    if (!totalOtherMatches) return
    const minVisible = hasHiddenMatches ? 1 : 0
    if (normalizedVisibleLimit < minVisible) {
      setVisibleOtherMatchingLimit(minVisible)
      return
    }
    const node = visibleChipsContainerRef.current
    if (!node) return
    const scrollDiff = node.scrollWidth - node.clientWidth
    if (scrollDiff <= 0.5) return
    if (normalizedVisibleLimit > minVisible) {
      setVisibleOtherMatchingLimit(normalizedVisibleLimit - 1)
    }
  }, [
    normalizedVisibleLimit,
    hasHiddenMatches,
    totalOtherMatches,
    visibleChipsAvailableWidth,
    otherMatchingEntriesSignature,
  ])
  const [matchingPopoverAnchor, setMatchingPopoverAnchor] = useState<HTMLElement | null>(null)
  const matchingPopoverOpen = Boolean(matchingPopoverAnchor) && hiddenOtherMatching.length > 0
  const handleMatchingPopoverClose = useCallback(() => {
    setMatchingPopoverAnchor(null)
  }, [])
  const handleMatchingMoreClick = (event: React.MouseEvent<HTMLElement>) => {
    if (hiddenOtherMatching.length === 0) return
    setMatchingPopoverAnchor(event.currentTarget)
  }
  const handleMatchingConfigJump = (cfgIdx: number) => {
    if (!canJumpToPrimaryMatch || primaryRuleIndex == null) return
    if (!Number.isFinite(cfgIdx)) return
    onJumpToRule?.(primaryRuleIndex, cfgIdx)
  }
  const renderMatchingChip = (
    entry: MatchingConfigEntry,
    options?: { onSelect?: () => void },
  ): React.ReactNode => {
    const key = `matching-chip-${entry.cfgIdx}`
    const clickable = canJumpToPrimaryMatch
    const sharedChipProps = {
      label: entry.label,
      size: 'small' as const,
      variant: 'outlined' as const,
      title: entry.label,
      sx: {
        ...MATCHING_CONFIG_CHIP_SX,
        cursor: clickable ? 'pointer' : 'default',
      },
    }
    const chipNode = (
      <Chip
        {...sharedChipProps}
        {...(clickable
          ? {
              component: 'button' as const,
              type: 'button' as const,
              onClick: () => {
                options?.onSelect?.()
                handleMatchingConfigJump(entry.cfgIdx)
              },
            }
          : {})}
      />
    )

    const wrappedChip = (
      <Box
        component="span"
        sx={MATCHING_CHIP_WRAPPER_SX}
      >
        {chipNode}
      </Box>
    )

    if (!clickable) {
      return (
        <React.Fragment key={key}>
          {wrappedChip}
        </React.Fragment>
      )
    }

    return (
      <Tooltip key={key} title={t('testerJumpToConfig')}>
        {wrappedChip}
      </Tooltip>
    )
  }
  const ascSummaryContent = ascSummary
  const shouldInlineAscension = gridColumnCount <= 4
  const ascSummaryInline = ascSummaryContent ? (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 0.25,
        ml: 0.75,
        flexWrap: 'wrap',
      }}
    >
      <Box component="span" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>+</Box>
      {ascSummaryContent}
    </Box>
  ) : null
  const ascSummaryBlock = ascSummaryContent ? (
    <Box
      component="span"
      sx={{
        display: 'block',
        mt: CARD_ASC_BLOCK_MARGIN_TOP_UNITS,
        pl: 1,
        color: theme.palette.text.secondary,
        fontWeight: 600,
        fontSize: ascInlineFontSize,
        lineHeight: 1.1,
      }}
    >
      +
      {' '}
      {ascSummaryContent}
    </Box>
  ) : null
  const { leftColumnHeightPx, rightColumnHeightPx } = useMemo(
    () => getTesterGridCardColumnHeights(theme, gridColumnCount),
    [theme, gridColumnCount],
  )
  const cardOutcome = match
    ? {
        tone: match.keep === false ? theme.palette.error.main : theme.palette.success.main,
        glyph: match.keep === false ? <SellIcon fontSize="inherit" aria-hidden /> : '✓',
        label: match.keep === false ? t('testerMatchSell') : t('testerMatchKeep'),
        canJump: canJumpToPrimaryMatch,
        onClick: handlePrimaryMatchClick,
      }
    : undefined
  const mainSummaryLabel = (
    <>
      <Box component="span" sx={{ color: mainColor ?? 'inherit' }}>
        {mainInline}
      </Box>
      {shouldInlineAscension ? ascSummaryInline : ascSummaryBlock}
    </>
  )

  const cardHeightStyle = `${cardHeightPx}px`
  const matchRowHeight = `${CARD_MATCH_ROW_HEIGHT_PX}px`

  return (
    <Box
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: GRID_CARD_TEMPLATE,
        columnGap: theme.spacing(CARD_COLUMN_GAP_UNITS),
        p: theme.spacing(CARD_PADDING_UNITS),
        borderRadius: `${CARD_BORDER_RADIUS_PX}px`,
        border: `1px solid ${theme.palette.divider}`,
        bgcolor: theme.palette.background.paper,
        minHeight: cardHeightStyle,
        height: cardHeightStyle,
        maxHeight: cardHeightStyle,
        boxSizing: 'border-box',
        overflow: 'hidden',
        alignContent: 'start',
      })}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: GRID_CARD_LEFT_COLUMN_GAP_UNITS,
          textAlign: 'center',
          minHeight: leftColumnHeightPx,
          height: leftColumnHeightPx,
          maxHeight: leftColumnHeightPx,
          justifyContent: 'flex-start',
        }}
      >
        <GridIconBox
          setId={setIdNumber as ArtifactSetId}
          slotId={artifact.slot as ArtifactTypeId}
          factionId={artifact.faction as FactionId}
          rank={artifact.rank}
          rarity={artifact.rarity}
          ascensionRolls={artifact.ascension?.rolls}
          setLabel={setLabel}
          setTooltipName={setTooltipName}
          slotLabel={artifactTypeName(artifact.slot as ArtifactTypeId)}
          rerollLabel={rerollLabel || undefined}
          rerollTooltip={rerollTooltip || undefined}
          levelLabel={levelChipLabel}
          size={TESTER_GRID_ICON_BOX_SIZE_PX}
          {...(cardOutcome ? { outcome: cardOutcome } : {})}
        />
        {(sourceDescriptor && SourceIcon) ? (
          <Tooltip title={sourceTooltipTitle}>
            <Box
              component="span"
              role="img"
              aria-label={sourceDescriptor.label}
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'text.secondary',
                  fontSize: '1rem',
                }}
            >
              <SourceIcon fontSize="inherit" />
            </Box>
          </Tooltip>
        ) : null}
      </Box>
      <Stack
        spacing={CARD_TEXT_STACK_GAP_UNITS}
        minWidth={0}
        sx={{
          gridColumn: '2',
          gridRow: '1',
          minWidth: 0,
          minHeight: rightColumnHeightPx,
          height: rightColumnHeightPx,
          maxHeight: rightColumnHeightPx,
          overflow: 'hidden',
        }}
      >
        <TesterSummaryLabel label={mainSummaryLabel} wrap />
        <Tooltip title={subTooltip}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: CARD_SUBSTAT_ROW_GAP_UNITS,
              width: '100%',
              flexGrow: 1,
            }}
          >
            {substatEntries.length > 0 ? substatEntries.map((entry) => (
              <Box
                key={`sub-${entry.variant}`}
                sx={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  width: 'fit-content',
                  maxWidth: '100%',
                  alignSelf: 'flex-start',
                  flexShrink: 1,
                  minWidth: 0,
                  '&::after': entry.isMythicBonus ? {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: '2px',
                    borderRadius: '1px',
                    backgroundColor: (theme) => theme.palette.error.dark,
                  } : undefined,
                }}
              >
                <Typography
                  variant="body2"
                  component="span"
                  noWrap
                  sx={{
                    lineHeight: 1.1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    width: '100%',
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'inherit',
                  }}
                >
                  {entry.content}
                </Typography>
              </Box>
            )) : (
              <TesterSummaryLabel label="—" />
            )}
          </Box>
        </Tooltip>
      </Stack>
      {shouldShowPrimaryMatchRow ? (
        <Box
          sx={{
            gridColumn: '1 / -1',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            mt: `${CARD_MATCH_ROW_MARGIN_PX}px`,
            mb: `${CARD_MATCH_ROW_MARGIN_PX}px`,
            minHeight: matchRowHeight,
            height: matchRowHeight,
            maxHeight: matchRowHeight,
          }}
        >
          {match ? (
            <TesterRuleReferenceChip
              match={match}
              {...(onJumpToRule ? { onJump: onJumpToRule } : {})}
              sx={{ width: '100%' }}
            />
          ) : (
            <Chip size="small" color="success" variant="filled" label={t('testerNoMatch')} />
          )}
        </Box>
      ) : null}
      {shouldShowOtherMatchesRow ? (
        <Box
          sx={{
            gridColumn: '1 / -1',
            width: '100%',
            minHeight: matchRowHeight,
            height: matchRowHeight,
            maxHeight: matchRowHeight,
            display: 'flex',
            alignItems: 'center',
            mt: `${CARD_MATCH_ROW_MARGIN_PX}px`,
            mb: `${CARD_MATCH_ROW_MARGIN_PX}px`,
          }}
        >
          <Box
            ref={handleOtherMatchesRowRef}
            sx={{
              display: 'flex',
              flexWrap: 'nowrap',
              gap: MATCHING_CHIP_GAP_UNITS,
              alignItems: 'center',
              minWidth: 0,
              width: '100%',
            }}
          >
            <Box
              ref={handleVisibleChipsContainerRef}
              sx={{
                display: 'flex',
                flexWrap: 'nowrap',
                gap: MATCHING_CHIP_GAP_UNITS,
                minWidth: 0,
                width: hasHiddenMatches
                  ? `${visibleChipsAvailableWidth}px`
                  : '100%',
              }}
            >
              {visibleOtherMatching.map((entry) => renderMatchingChip(entry))}
            </Box>
            {hiddenOtherMatching.length > 0 ? (
              <>
                <Tooltip title={`${t('testerConfigMatches')} (+${hiddenOtherMatching.length})`}>
                  <Box component="span" ref={handleMoreChipRef} sx={MATCHING_CHIP_WRAPPER_SX}>
                    <Chip
                      label={`+${hiddenOtherMatching.length}`}
                      size="small"
                      variant="outlined"
                      component="button"
                      type="button"
                      onClick={handleMatchingMoreClick}
                      sx={{
                        ...MATCHING_CONFIG_CHIP_SX,
                        minWidth: 'auto',
                        cursor: 'pointer',
                      }}
                    />
                  </Box>
                </Tooltip>
                <Popover
                  open={matchingPopoverOpen}
                  anchorEl={matchingPopoverAnchor}
                  onClose={handleMatchingPopoverClose}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                  disableRestoreFocus
                  slotProps={{
                    paper: {
                      component: ContextMenuPaper,
                      onRequestClose: handleMatchingPopoverClose,
                      closeLabel: t('close'),
                      sx: {
                        maxWidth: MATCHING_POPOVER_MAX_WIDTH_PX,
                        width: `min(80vw, ${MATCHING_POPOVER_MAX_WIDTH_PX}px)`,
                      },
                    } as MuiPaperProps,
                  }}
                >
                  <Box
                    sx={{
                      p: 1,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 0.5,
                      maxWidth: MATCHING_POPOVER_MAX_WIDTH_PX,
                      width: `min(80vw, ${MATCHING_POPOVER_MAX_WIDTH_PX}px)`,
                    }}
                  >
                    {hiddenOtherMatching.map((entry) => renderMatchingChip(entry, { onSelect: handleMatchingPopoverClose }))}
                  </Box>
                </Popover>
              </>
            ) : null}
          </Box>
        </Box>
      ) : null}
    </Box>
  )
});

type FactionGroupBuilder = {
  group: TesterGroup
  sets: Map<string, TesterGroup>
}

function groupRowsBySet(rows: readonly TesterPreviewRow[], translate: TranslateFn): TesterGroup[] {
  const artifactGroups = new Map<string, TesterGroup>()
  const factionGroups = new Map<string, FactionGroupBuilder>()

  rows.forEach((row, index) => {
    const artifact = row.artifact
    const slot = artifact.slot as ArtifactTypeId
    const setId = Number(artifact.set) || 0
    if (!isAccessorySlot(slot)) {
      const key = `art:${setId}`
      let group = artifactGroups.get(key)
      if (!group) {
        const setLabel = formatTesterSetLabel({ setId, slot, translate })
        group = {
          key,
          label: setLabel,
          setId,
          slot,
          factionId: null,
          rows: [],
          order: index,
          kind: 'artifactSet',
          parentKey: null,
        }
        artifactGroups.set(key, group)
      }
      group.rows.push(row)
      return
    }

    const rawFactionId = Number(artifact.faction) || 0
    const factionId = (rawFactionId > 0 ? rawFactionId : 0) as FactionId
    const factionKey = `faction:${factionId}`
    let factionGroup = factionGroups.get(factionKey)
    if (!factionGroup) {
      const factionLabel = factionId > 0 ? translate(factionI18nKey(factionId)) : translate('testerValueUnknown')
      factionGroup = {
        group: {
          key: factionKey,
          label: factionLabel,
          setId: null,
          slot: null,
          factionId: factionId > 0 ? factionId : null,
          rows: [],
          order: index,
          kind: 'accessoryFaction',
          children: [],
          parentKey: null,
        },
        sets: new Map(),
      }
      factionGroups.set(factionKey, factionGroup)
    }
    factionGroup.group.rows.push(row)
    if (index < factionGroup.group.order) {
      factionGroup.group.order = index
    }

    const setKey = `${factionKey}:set:${setId}`
    let setGroup = factionGroup.sets.get(setKey)
    if (!setGroup) {
      const setLabel = formatTesterSetLabel({ setId, slot, translate })
      setGroup = {
        key: setKey,
        label: setLabel,
        setId,
        slot,
        factionId: factionId > 0 ? factionId : null,
        rows: [],
        order: index,
        kind: 'accessorySet',
        parentKey: factionKey,
      }
      factionGroup.sets.set(setKey, setGroup)
    }
    setGroup.rows.push(row)
    if (index < setGroup.order) {
      setGroup.order = index
    }
  })

  const resolvedFactionGroups: TesterGroup[] = Array.from(factionGroups.values()).map(({ group, sets }) => ({
    ...group,
    children: Array.from(sets.values()).sort((a, b) => a.order - b.order),
  }))

  return [
    ...artifactGroups.values(),
    ...resolvedFactionGroups,
  ].sort((a, b) => a.order - b.order)
}

function getTesterCardHeight(
  showFirst: boolean,
  showOther: boolean,
  cardVerticalPaddingPx: number,
  firstRowHeightPx: number,
): number {
  let height = firstRowHeightPx + cardVerticalPaddingPx
  const visibleRows = (showFirst ? 1 : 0) + (showOther ? 1 : 0)
  if (visibleRows > 0) {
    const perRowHeight = CARD_MATCH_ROW_HEIGHT_PX + (CARD_MATCH_ROW_MARGIN_PX * 2)
    height += visibleRows * perRowHeight
    if (visibleRows > 1) {
      height += (visibleRows - 1) * CARD_MATCH_ROW_GAP_PX
    }
  }
  return height
}

function formatConfigLabel(idx: number, configNames: Array<string | null>, translate: TranslateFn): string {
  const name = configNames[idx]
  if (typeof name === 'string' && name.trim().length > 0) {
    return name.trim()
  }
  return translate('testerConfigChip', { index: idx + 1 })
}

type GridCardColumnHeights = {
  leftColumnHeightPx: number
  rightColumnHeightPx: number
  firstRowHeightPx: number
}

const DEFAULT_HTML_FONT_SIZE_PX = 16

const typographySizeToPx = (value: string | number | undefined, htmlFontSize: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value !== 'string') {
    return 0
  }
  const trimmed = value.trim()
  if (trimmed.endsWith('rem')) {
    return Number.parseFloat(trimmed) * htmlFontSize
  }
  if (trimmed.endsWith('px')) {
    return Number.parseFloat(trimmed)
  }
  const numeric = Number.parseFloat(trimmed)
  return Number.isFinite(numeric) ? numeric : 0
}

function getTesterGridCardColumnHeights(theme: Theme, gridColumnCount: number): GridCardColumnHeights {
  const htmlFontSize = Number(theme.typography.htmlFontSize) || DEFAULT_HTML_FONT_SIZE_PX
  const summaryFontSizePx = CARD_SUMMARY_FONT_SIZE_REM * htmlFontSize
  const summaryLineHeightPx = CARD_SUMMARY_LINE_HEIGHT_REM * htmlFontSize
  const stackGapPx = pxValue(theme.spacing(CARD_TEXT_STACK_GAP_UNITS))
  const fallbackFontSizePx = typographySizeToPx(theme.typography.fontSize, htmlFontSize) || htmlFontSize
  const substatFontSizePx = typographySizeToPx(theme.typography.body2?.fontSize, htmlFontSize) || fallbackFontSizePx
  const substatLineHeightPx = CARD_SUBSTAT_LINE_HEIGHT * substatFontSizePx
  const substatGapPx = pxValue(theme.spacing(CARD_SUBSTAT_ROW_GAP_UNITS))
  const totalSubstatHeightPx = (CARD_SUBSTAT_LINE_COUNT * substatLineHeightPx)
    + (Math.max(0, CARD_SUBSTAT_LINE_COUNT - 1) * substatGapPx)
  const shouldInlineAscension = gridColumnCount <= 4
  const ascMarginPx = shouldInlineAscension ? 0 : pxValue(theme.spacing(CARD_ASC_BLOCK_MARGIN_TOP_UNITS))
  const ascFontSizePx = Math.max(0, summaryFontSizePx - CARD_ASC_FONT_DECREMENT_PX)
  const ascLineHeightPx = shouldInlineAscension ? 0 : CARD_ASC_LINE_HEIGHT * ascFontSizePx
  const summarySectionHeightPx = summaryLineHeightPx + ascMarginPx + ascLineHeightPx
  const rightColumnHeightPx = summarySectionHeightPx + stackGapPx + totalSubstatHeightPx
  const leftColumnGapPx = pxValue(theme.spacing(GRID_CARD_LEFT_COLUMN_GAP_UNITS))
  const leftColumnHeightPx = TESTER_GRID_ICON_BOX_SIZE_PX + GRID_CARD_SOURCE_ICON_SIZE_PX + leftColumnGapPx
  const normalizedLeftPx = Math.max(0, Math.ceil(leftColumnHeightPx + CARD_COLUMN_HEIGHT_BUFFER_PX))
  const normalizedRightPx = Math.max(0, Math.ceil(rightColumnHeightPx + CARD_COLUMN_HEIGHT_BUFFER_PX))
  return {
    leftColumnHeightPx: normalizedLeftPx,
    rightColumnHeightPx: normalizedRightPx,
    firstRowHeightPx: Math.max(normalizedLeftPx, normalizedRightPx),
  }
}

type TesterGridLayoutMetrics = {
  accordionSpacingPx: number
  cardHeightPx: number
  gridColumnCount: number
  gridGapPx: number
  leafPaddingPx: number
}

type UseTesterGridLayoutMetricsOptions = {
  preferredColumnCount: number
  showFirstMatch: boolean
  showOtherMatches: boolean
  theme: Theme
}

function useTesterGridLayoutMetrics({
  preferredColumnCount,
  showFirstMatch,
  showOtherMatches,
  theme,
}: UseTesterGridLayoutMetricsOptions): TesterGridLayoutMetrics {
  const isMultiColumn = useMediaQuery(theme.breakpoints.up('sm'))
  const gridColumnCount = isMultiColumn ? preferredColumnCount : 1
  const accordionSpacingPx = useMemo(() => pxValue(theme.spacing(ACCORDION_MARGIN_UNITS)), [theme])
  const gridGapPx = useMemo(() => pxValue(theme.spacing(GRID_GAP)), [theme])
  const leafPaddingPx = useMemo(() => pxValue(theme.spacing(GRID_CARD_CONTAINER_PADDING_UNITS)), [theme])
  const cardVerticalPaddingPx = useMemo(() => pxValue(theme.spacing(CARD_PADDING_UNITS)) * 2, [theme])
  const { firstRowHeightPx: cardFirstRowHeightPx } = useMemo(
    () => getTesterGridCardColumnHeights(theme, gridColumnCount),
    [theme, gridColumnCount],
  )
  const cardHeightPx = useMemo(
    () => getTesterCardHeight(showFirstMatch, showOtherMatches, cardVerticalPaddingPx, cardFirstRowHeightPx),
    [cardFirstRowHeightPx, cardVerticalPaddingPx, showFirstMatch, showOtherMatches],
  )
  return useMemo(() => ({
    accordionSpacingPx,
    cardHeightPx,
    gridColumnCount,
    gridGapPx,
    leafPaddingPx,
  }), [
    accordionSpacingPx,
    cardHeightPx,
    gridColumnCount,
    gridGapPx,
    leafPaddingPx,
  ])
}

function estimateGroupHeight(
  group: TesterGroup,
  collapsedGroups: Set<string>,
  columnCount: number,
  accordionSpacingPx: number,
  gridGapPx: number,
  leafPaddingPx: number,
  cardHeightPx: number,
  depth = 0,
): number {
  const header = ESTIMATED_ACCORDION_HEADER_PX
  const marginBottom = depth === 0 ? accordionSpacingPx : 0
  const collapsed = collapsedGroups.has(group.key)
  if (collapsed) return header + marginBottom
  if (group.children && group.children.length > 0) {
    const childHeights = group.children.reduce((total, child) => (
      total + estimateGroupHeight(
        child,
        collapsedGroups,
        columnCount,
        accordionSpacingPx,
        gridGapPx,
        leafPaddingPx,
        cardHeightPx,
        depth + 1,
      )
    ), 0)
    const stackGapTotal = Math.max(0, group.children.length - 1) * accordionSpacingPx
    const stackPadding = accordionSpacingPx * 2
    return header + childHeights + stackGapTotal + stackPadding + marginBottom
  }
  const columns = Math.max(1, columnCount)
  const rowsNeeded = Math.max(1, Math.ceil(group.rows.length / columns))
  const gridHeight = (rowsNeeded * cardHeightPx)
    + (Math.max(0, rowsNeeded - 1) * gridGapPx)
  const paddingHeight = Math.max(0, leafPaddingPx) * 2
  const totalHeight = header + gridHeight + paddingHeight + marginBottom
  return Math.min(totalHeight, GRID_VIRTUALIZE_MAX_FALLBACK_HEIGHT_PX)
}

export default TesterItemsGrid
