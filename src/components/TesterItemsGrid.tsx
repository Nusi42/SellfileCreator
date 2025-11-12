import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Chip,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SellIcon from '@mui/icons-material/Sell'
import { useTheme } from '@mui/material/styles'
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
import { TesterSummaryLabel } from './TesterSummaryLabel'
import { TesterRuleReferenceChip } from './TesterRuleReferenceChip'
import { WithSetTooltip } from './SetTooltip'
import ContextMenuPaper from './ContextMenuPaper'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import { useContextMenuHint } from '../hooks/useContextMenuHint'
import GridIconBox from './GridIconBox'

const GRID_CARD_SINGLE_COLUMN_TEMPLATE = 'minmax(0, 1fr)'
const GRID_CARD_QUARTER_TEMPLATE = 'repeat(4, minmax(0, 1fr))'
const GRID_CARD_ICON_COLUMN_PX = 88
const GRID_CARD_STATS_MIN_COLUMN_PX = 132
const GRID_CARD_TEMPLATE = `${GRID_CARD_ICON_COLUMN_PX}px minmax(${GRID_CARD_STATS_MIN_COLUMN_PX}px, 1fr)`
const GRID_GAP = 1.25
const CARD_BORDER_RADIUS = 2
const MAX_MATCHING_CHIPS = 6
const ESTIMATED_CARD_HEIGHT_PX = 220
const ESTIMATED_ACCORDION_HEADER_PX = 60
const ESTIMATED_DETAILS_PADDING_PX = 32
const ACCORDION_MARGIN_UNITS = 0.75
const ACCORDION_BORDER_RADIUS_PX = 8
const GRID_VIRTUALIZE_GROUP_THRESHOLD = 12
const GRID_VIRTUALIZE_ROW_THRESHOLD = 150
const GRID_VIRTUALIZE_OVERSCAN_PX = 640
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
  onToggleStatColors: (next: boolean) => void
  onOpenManageColors: () => void
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
    configNames,
    onJumpToRule,
  } = props
  const { t } = useI18n()
  const theme = useTheme()
  const groups = useMemo(() => groupRowsBySet(rows, t), [rows, t])
  const numberFormatter = useMemo(() => new Intl.NumberFormat(undefined), [])
  const {
    shouldShow: shouldShowGroupContextHint,
    markSeen: markGroupContextHintSeen,
  } = useContextMenuHint('testerGroupAccordion')
  const [groupContextHintPos, setGroupContextHintPos] = useState<{ x: number; y: number } | null>(null)
  const groupContextHintActive = shouldShowGroupContextHint && groupContextHintPos !== null
  const handleGroupHintPointerMove = useCallback((event: React.MouseEvent<Element>) => {
    if (!shouldShowGroupContextHint) return
    setGroupContextHintPos({ x: event.clientX, y: event.clientY })
  }, [shouldShowGroupContextHint])
  const handleGroupHintPointerLeave = useCallback(() => {
    setGroupContextHintPos(null)
  }, [])
  const handleGroupHintSeen = useCallback(() => {
    markGroupContextHintSeen()
    setGroupContextHintPos(null)
  }, [markGroupContextHintSeen])
  useEffect(() => {
    if (!shouldShowGroupContextHint) {
      setGroupContextHintPos(null)
    }
  }, [shouldShowGroupContextHint])
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
  const [containerWidth, setContainerWidth] = useState(0)
  const groupHeightsRef = useRef<Map<string, number>>(new Map())
  const [heightVersion, setHeightVersion] = useState(0)
  const handleScroll = useCallback<React.UIEventHandler<HTMLDivElement>>((event) => {
    setScrollTop(event.currentTarget.scrollTop)
  }, [])
  const gridGapPx = pxValue(theme.spacing(GRID_GAP))
  const quarterColumnBreakpointPx = theme.breakpoints.values?.sm ?? 600
  const accordionSpacingPx = pxValue(theme.spacing(ACCORDION_MARGIN_UNITS))
  const groupCountChipBg = theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100]
  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const measure = () => {
      setViewportHeight(node.clientHeight)
      setContainerWidth(node.clientWidth)
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
  useEffect(() => {
    const known = new Set(groups.map((group) => group.key))
    const map = groupHeightsRef.current
    let changed = false
    map.forEach((_, key) => {
      if (!known.has(key)) {
        map.delete(key)
        changed = true
      }
    })
    if (changed) setHeightVersion((prev) => prev + 1)
  }, [groups])
  const handleGroupMeasure = useCallback((key: string, height: number) => {
    const map = groupHeightsRef.current
    const prev = map.get(key)
    if (typeof prev === 'number' && Math.abs(prev - height) < 0.5) return
    map.set(key, height)
    setHeightVersion((prev) => prev + 1)
  }, [])
  const estimatedColumnCount = useMemo(() => {
    if (containerWidth <= 0) return 1
    return containerWidth >= quarterColumnBreakpointPx ? 4 : 1
  }, [containerWidth, quarterColumnBreakpointPx])
  const shouldVirtualize = rows.length > GRID_VIRTUALIZE_ROW_THRESHOLD || groups.length > GRID_VIRTUALIZE_GROUP_THRESHOLD
  const virtualization = useMemo<{
    visibleGroups: TesterGroup[]
    padTop: number
    totalHeight: number | undefined
  }>(() => {
    void heightVersion
    if (!shouldVirtualize) {
      return { visibleGroups: groups, padTop: 0, totalHeight: undefined }
    }
    if (!groups.length) {
      return { visibleGroups: [], padTop: 0, totalHeight: 0 }
    }
    const heights: number[] = []
    const offsets: number[] = []
    let total = 0
    for (let idx = 0; idx < groups.length; idx += 1) {
      const group = groups[idx]!
      offsets[idx] = total
      const measured = groupHeightsRef.current.get(group.key)
      const fallback = estimateGroupHeight(group, collapsedGroups, estimatedColumnCount, accordionSpacingPx, gridGapPx)
      const height = typeof measured === 'number' && measured > 0 ? measured : fallback
      heights[idx] = height
      total += height
    }
    const viewport = viewportHeight > 0 ? viewportHeight : (containerRef.current?.clientHeight ?? 0)
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
    return {
      visibleGroups: groups.slice(startIdx, endIdx),
      padTop,
      totalHeight: total,
    }
  }, [
    accordionSpacingPx,
    collapsedGroups,
    estimatedColumnCount,
    gridGapPx,
    groups,
    heightVersion,
    scrollTop,
    shouldVirtualize,
    viewportHeight,
  ])
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

  const renderedGroups = virtualization.visibleGroups
  const virtualizedHeight = shouldVirtualize ? Math.max(virtualization.totalHeight ?? 0, 0) : undefined
  const virtualizedPadTop = shouldVirtualize ? virtualization.padTop : 0
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
        contextHintEnabled={shouldShowGroupContextHint && depth === 0}
        onContextMenuHintMove={handleGroupHintPointerMove}
        onContextMenuHintLeave={handleGroupHintPointerLeave}
        onContextMenuHintSeen={handleGroupHintSeen}
        substatColors={substatColors}
        useStatButtonColors={useStatButtonColors}
        configNames={configNames}
        onJumpToRule={onJumpToRule}
        onMeasure={shouldVirtualize && depth === 0 ? handleGroupMeasure : undefined}
        marginBottomPx={accordionSpacingPx}
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
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 0.5 }}
      >
        <Box sx={{ position: 'relative', height: shouldVirtualize ? virtualizedHeight : 'auto', minHeight: shouldVirtualize ? virtualizedHeight : 'auto' }}>
          <Box sx={{ transform: shouldVirtualize ? `translateY(${virtualizedPadTop}px)` : 'none' }}>
            {renderedGroups.map((group) => renderGroup(group, 0))}
          </Box>
        </Box>
      </Box>
      <ContextMenuHintOverlay text={t('contextMenuHint')} position={groupContextHintActive ? groupContextHintPos : null} />
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
  contextHintEnabled: boolean
  onContextMenuHintMove: (event: React.MouseEvent<Element>) => void
  onContextMenuHintLeave: () => void
  onContextMenuHintSeen: () => void
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  configNames: Array<string | null>
  onJumpToRule?: ((ruleIndex: number, cfgIdx: number | null) => void) | undefined
  onMeasure?: ((key: string, height: number) => void) | undefined
  marginBottomPx: number
  childContent?: React.ReactNode
  depth?: number
}

const TesterItemsGridGroup = React.memo(function TesterItemsGridGroup({
  group,
  expanded,
  groupCountLabel,
  chipBgColor,
  onToggleGroup,
  contextHintEnabled,
  onContextMenuHintMove,
  onContextMenuHintLeave,
  onContextMenuHintSeen,
  substatColors,
  useStatButtonColors,
  configNames,
  onJumpToRule,
  onMeasure,
  marginBottomPx,
  childContent,
  depth = 0,
}: TesterItemsGridGroupProps) {
  const accordionRef = useRef<HTMLDivElement | null>(null)
  const hasChildren = Boolean(childContent)
  const nested = depth > 0
  const numericSetId = typeof group.setId === 'number' && group.setId > 0 ? group.setId : null
  const groupSetTooltipName = numericSetId != null ? (artifactSetNames[numericSetId] ?? null) : null
  const summarySetIcon = numericSetId != null ? (
    <Box sx={{ lineHeight: 0, display: 'flex', alignItems: 'center' }}>
      <SetIcon setId={numericSetId as ArtifactSetId} size={24} />
    </Box>
  ) : null

  useEffect(() => {
    if (!onMeasure) return undefined
    const node = accordionRef.current
    if (!node) return undefined
    const marginOffset = Number.isFinite(marginBottomPx) ? marginBottomPx : 0
    let raf: number | null = null
    const report = () => {
      raf = null
      const rect = node.getBoundingClientRect()
      if (!rect) return
      onMeasure(group.key, rect.height + marginOffset)
    }
    report()
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        if (raf !== null) cancelAnimationFrame(raf)
      }
    }
    const observer = new ResizeObserver(() => {
      if (raf !== null) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(report)
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [group.key, marginBottomPx, onMeasure, expanded, group.rows.length])

  return (
    <Accordion
      ref={accordionRef}
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
        onMouseEnter={contextHintEnabled ? onContextMenuHintMove : undefined}
        onMouseMove={contextHintEnabled ? onContextMenuHintMove : undefined}
        onMouseLeave={contextHintEnabled ? onContextMenuHintLeave : undefined}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onToggleGroup(group.key, !expanded, event, { applyToAll: true })
          if (contextHintEnabled) onContextMenuHintSeen()
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
            p: hasChildren ? theme.spacing(ACCORDION_MARGIN_UNITS) : 0,
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
                gridTemplateColumns: {
                  xs: GRID_CARD_SINGLE_COLUMN_TEMPLATE,
                  sm: GRID_CARD_QUARTER_TEMPLATE,
                },
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
  configNames,
  onJumpToRule,
}: {
  row: TesterPreviewRow
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
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
  const rerollLabel = artifact.rerollCount > 0 ? '⟳' : ''
  const rerollTooltip = artifact.rerollCount > 0 ? t('testerRerollLabel') : ''
  const outcomeLabel = match?.keep === true
    ? t('testerMatchKeep')
    : match?.keep === false
      ? t('testerMatchSell')
      : t('testerMatchNoRule')
  const outcomeColor: 'success' | 'error' | 'default' = match?.keep === true
    ? 'success'
    : match?.keep === false
      ? 'error'
      : 'default'
  const outcomeGlyph = match?.keep === true
    ? '✓'
    : match?.keep === false
      ? <SellIcon fontSize="inherit" aria-hidden />
      : '—'
  const outcomeTone = outcomeColor === 'success'
    ? theme.palette.success.main
    : outcomeColor === 'error'
      ? theme.palette.error.main
      : theme.palette.text.secondary
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
  const otherMatchingEntries = matchingEntries.slice(1)
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
  const ascSummaryLine = ascSummary ? (
    <Box
      component="span"
      sx={{
        display: 'block',
        mt: 0.125,
        pl: 1,
        color: theme.palette.text.secondary,
        fontWeight: 600,
        fontSize: ascInlineFontSize,
        lineHeight: 1.1,
      }}
    >
      +
      {' '}
      {ascSummary}
    </Box>
  ) : null
  const mainSummaryLabel = (
    <>
      <Box component="span" sx={{ color: mainColor ?? 'inherit' }}>
        {mainInline}
      </Box>
      {ascSummaryLine}
    </>
  )

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: GRID_CARD_TEMPLATE,
        columnGap: 2,
        rowGap: 1,
        p: 2,
        borderRadius: CARD_BORDER_RADIUS,
        bgcolor: 'inherit',
        minHeight: 176,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
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
          outcome={{
            tone: outcomeTone,
            glyph: outcomeGlyph,
            label: outcomeLabel,
            canJump: canJumpToPrimaryMatch,
            onClick: handlePrimaryMatchClick,
          }}
        />
        {sourceDescriptor ? (
          <Tooltip title={sourceDescriptor.tooltip ?? ''}>
            <Chip label={sourceDescriptor.label} size="small" variant="outlined" sx={{ fontSize: '0.75rem' }} />
          </Tooltip>
        ) : null}
      </Box>
      <Stack spacing={0.75} minWidth={0} sx={{ gridColumn: '2', gridRow: '1', minWidth: 0 }}>
        <TesterSummaryLabel label={mainSummaryLabel} wrap />
        <Tooltip title={subTooltip}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, width: '100%' }}>
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
      {match ? (
        <Box sx={{ gridColumn: '1 / -1', width: '100%', display: 'flex', alignItems: 'center' }}>
          <TesterRuleReferenceChip
            match={match}
            {...(onJumpToRule ? { onJump: onJumpToRule } : {})}
            sx={{ width: '100%' }}
          />
        </Box>
      ) : (
        <Box sx={{ gridColumn: '1 / -1', width: '100%', display: 'flex', alignItems: 'center' }}>
          <Chip size="small" color="success" variant="filled" label={t('testerNoMatch')} />
        </Box>
      )}
      {otherMatchingEntries.length > 0 ? (
        <Box sx={{ gridColumn: '1 / -1', width: '100%' }}>
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

function formatConfigLabel(idx: number, configNames: Array<string | null>, translate: TranslateFn): string {
  const name = configNames[idx]
  if (typeof name === 'string' && name.trim().length > 0) {
    return name.trim()
  }
  return translate('testerConfigChip', { index: idx + 1 })
}

function estimateGroupHeight(
  group: TesterGroup,
  collapsedGroups: Set<string>,
  columnCount: number,
  marginBottomPx: number,
  gridGapPx: number,
): number {
  const header = ESTIMATED_ACCORDION_HEADER_PX
  const collapsed = collapsedGroups.has(group.key)
  if (collapsed) return header + marginBottomPx
  if (group.children && group.children.length > 0) {
    const childTotal = group.children.reduce((total, child) => (
      total + estimateGroupHeight(child, collapsedGroups, columnCount, marginBottomPx, gridGapPx)
    ), 0)
    return header + childTotal + marginBottomPx
  }
  const columns = Math.max(1, columnCount)
  const rowsNeeded = Math.max(1, Math.ceil(group.rows.length / columns))
  const gridHeight = (rowsNeeded * ESTIMATED_CARD_HEIGHT_PX)
    + (Math.max(0, rowsNeeded - 1) * gridGapPx)
    + ESTIMATED_DETAILS_PADDING_PX
  return header + gridHeight + marginBottomPx
}

export default TesterItemsGrid
