import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Chip,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import StarRoundedIcon from '@mui/icons-material/StarRounded'
import { useTheme } from '@mui/material/styles'
import { useI18n } from '../lib/i18n'
import type { TesterPreviewRow } from '../types/testerPreview'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { SetIcon } from './SetIcon'
import { FactionIcon } from './FactionIcon'
import {
  artifactSetNames,
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

const GRID_CARD_TEMPLATE = '96px minmax(220px, 1fr) minmax(240px, 1fr)'
const GRID_GAP = 1.5
const CARD_BORDER_RADIUS = 2
const MAX_MATCHING_CHIPS = 6
const GRID_CARD_MIN_WIDTH = 520
const ESTIMATED_CARD_HEIGHT_PX = 220
const ESTIMATED_ACCORDION_HEADER_PX = 60
const ESTIMATED_DETAILS_PADDING_PX = 32
const ACCORDION_MARGIN_UNITS = 1.5
const GRID_VIRTUALIZE_GROUP_THRESHOLD = 12
const GRID_VIRTUALIZE_ROW_THRESHOLD = 150
const GRID_VIRTUALIZE_OVERSCAN_PX = 640

const pxValue = (value: string): number => Number.parseFloat(value) || 0
const RARITY_BORDER_COLORS: Record<number, string> = {
  1: '#9ca3af', // Common
  2: '#34d399', // Uncommon
  3: '#60a5fa', // Rare
  4: '#7c3aed', // Epic
  5: '#f9a825', // Legendary
  6: '#8b0000', // Mythical
}
const STAR_MAX_COUNT = 6
const STAR_BASE_COLOR = '#fcd34d'
const STAR_ASCENDED_COLOR = '#a855f7'

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

type TesterGroup = {
  key: string
  label: string
  setId: number
  slot: ArtifactTypeId
  factionId: FactionId | null
  rows: TesterPreviewRow[]
  order: number
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
  const handleGroupToggle = useCallback((groupKey: string, shouldExpand: boolean, event: React.SyntheticEvent<Element, Event>) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      const isMultiToggle = Boolean((event && 'ctrlKey' in event && (event as React.MouseEvent).ctrlKey)
        || (event && 'metaKey' in event && (event as React.MouseEvent).metaKey))
      if (isMultiToggle) {
        let changed = false
        groups.forEach(({ key }) => {
          if (shouldExpand) {
            if (next.delete(key)) changed = true
          } else if (!next.has(key)) {
            next.add(key)
            changed = true
          }
        })
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
  }, [groups])

  useEffect(() => {
    const knownKeys = new Set(groups.map((group) => group.key))
    setCollapsedGroups((prev) => {
      let changed = false
      const next = new Set<string>()
      prev.forEach((key) => {
        if (knownKeys.has(key)) {
          next.add(key)
        } else {
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [groups])
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
    const cardSpace = GRID_CARD_MIN_WIDTH + gridGapPx
    if (cardSpace <= 0) return 1
    const available = containerWidth + gridGapPx
    return Math.max(1, Math.floor(available / cardSpace))
  }, [containerWidth, gridGapPx])
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
      const collapsed = collapsedGroups.has(group.key)
      const measured = groupHeightsRef.current.get(group.key)
      const fallback = estimateGroupHeight(group.rows.length, collapsed, estimatedColumnCount, accordionSpacingPx, gridGapPx)
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box
        ref={containerRef}
        onScroll={handleScroll}
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 0.5 }}
      >
        <Box sx={{ position: 'relative', height: shouldVirtualize ? virtualizedHeight : 'auto', minHeight: shouldVirtualize ? virtualizedHeight : 'auto' }}>
          <Box sx={{ transform: shouldVirtualize ? `translateY(${virtualizedPadTop}px)` : 'none' }}>
            {renderedGroups.map((group) => {
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
                  substatColors={substatColors}
                  useStatButtonColors={useStatButtonColors}
                  configNames={configNames}
                  onJumpToRule={onJumpToRule}
                  onMeasure={shouldVirtualize ? handleGroupMeasure : undefined}
                  marginBottomPx={accordionSpacingPx}
                />
              )
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

type TesterItemsGridGroupProps = {
  group: TesterGroup
  expanded: boolean
  groupCountLabel: string
  chipBgColor: string
  onToggleGroup: (groupKey: string, shouldExpand: boolean, event: React.SyntheticEvent<Element, Event>) => void
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  configNames: Array<string | null>
  onJumpToRule?: ((ruleIndex: number, cfgIdx: number | null) => void) | undefined
  onMeasure?: ((key: string, height: number) => void) | undefined
  marginBottomPx: number
}

const TesterItemsGridGroup = React.memo(function TesterItemsGridGroup({
  group,
  expanded,
  groupCountLabel,
  chipBgColor,
  onToggleGroup,
  substatColors,
  useStatButtonColors,
  configNames,
  onJumpToRule,
  onMeasure,
  marginBottomPx,
}: TesterItemsGridGroupProps) {
  const theme = useTheme()
  const accordionRef = useRef<HTMLDivElement | null>(null)
  const groupSetTooltipName = artifactSetNames[group.setId] ?? null
  const summarySetIcon = (
    <Box sx={{ lineHeight: 0, display: 'flex', alignItems: 'center' }}>
      <SetIcon setId={group.setId as ArtifactSetId} size={24} />
    </Box>
  )
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
      sx={{ mb: ACCORDION_MARGIN_UNITS }}
      disableGutters
      elevation={0}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {groupSetTooltipName ? (
              <WithSetTooltip name={groupSetTooltipName} displayName={group.label}>
                {summarySetIcon}
              </WithSetTooltip>
            ) : summarySetIcon}
            {group.factionId ? (
              <FactionIcon faction={group.factionId} size={20} />
            ) : null}
          </Box>
          <Typography variant="subtitle1" sx={{ flex: 1, minWidth: 0 }} noWrap>
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
        <AccordionDetails>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))',
              gap: theme.spacing(GRID_GAP),
            }}
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
  const SlotIcon = artifactTypeIconFor(artifact.slot as ArtifactTypeId)
  const setIdNumber = Number(artifact.set) || 0
  const setLabel = formatTesterSetLabel({ setId: setIdNumber, slot: artifact.slot as ArtifactTypeId, translate: t })
  const setTooltipName = Number.isFinite(setIdNumber) ? artifactSetNames[setIdNumber] ?? null : null
  const factionLabel = artifact.faction ? t(factionI18nKey(artifact.faction)) : null
  const levelBucketLabel = formatLevel(artifact.level)
  const hasExactLevel = typeof artifact.exactLevel === 'number' && Number.isFinite(artifact.exactLevel)
  const exactLevelLabel = hasExactLevel ? String(Math.max(0, Math.min(16, Math.round(Number(artifact.exactLevel))))) : null
  const levelLabel = exactLevelLabel ?? levelBucketLabel
  const rankValue = Number(artifact.rank)
  const rankStars = Number.isFinite(rankValue) ? Math.max(0, Math.min(STAR_MAX_COUNT, Math.round(rankValue))) : 0
  const ascensionStars = Math.max(0, Math.min(rankStars, Math.round(Number(artifact.ascension?.rolls) || 0)))
  const rarityValue = Number(artifact.rarity)
  const rarityBorder = RARITY_BORDER_COLORS[Number.isFinite(rarityValue) ? rarityValue : 0] ?? theme.palette.divider
  const levelChipLabel = t('testerLevelLabel', { level: levelLabel })
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
  const ascLabelNode = ascLabel ? (
    <Box component="span" sx={{ color: ascStatColor ?? 'inherit' }}>
      {ascLabel}
    </Box>
  ) : null
  const ascValueNode = ascValue ? (
    <Box component="span" sx={{ color: theme.palette.secondary.main, fontWeight: 600 }}>
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
        <Typography variant="body2" component="span" sx={{ color: ascStatColor ?? 'inherit' }}>
          {parts.map((part, idx) => (
            typeof part === 'string'
              ? <React.Fragment key={`asc-str-${idx}`}>{part}</React.Fragment>
              : <React.Fragment key={`asc-node-${idx}`}>{part}</React.Fragment>
          ))}
        </Typography>
      )
    }
    if (ascLabelNode || ascValue) {
      return (
        <Typography variant="body2" component="span" sx={{ color: ascStatColor ?? 'inherit' }}>
          {ascLabel} {ascValue}
        </Typography>
      )
    }
    return null
  })()
  const sourceDescriptor = getItemSourceDescriptor(artifact, t)
  const rerollLabel = artifact.rerollCount > 0 ? '⟳' : ''
  const rerollTooltip = artifact.rerollCount > 0 ? `${t('testerRerollLabel')} (${artifact.rerollCount})` : ''
  const outcomeLabel = match?.keep === true
    ? t('testerMatchKeep')
    : match?.keep === false
      ? t('testerMatchSell')
      : t('testerMatchNoRule')
  const outcomeColor: 'success' | 'warning' | 'default' = match?.keep === true
    ? 'success'
    : match?.keep === false
      ? 'warning'
      : 'default'
  const matchingIndices = Array.isArray(row.matchingCfgIndices)
    ? Array.from(new Set(row.matchingCfgIndices.filter((idx) => Number.isFinite(idx))))
    : []
  const matchingLabels = matchingIndices.map((idx) => formatConfigLabel(idx as number, configNames, t))
  const visibleMatching = matchingLabels.slice(0, MAX_MATCHING_CHIPS)
  const remainingMatches = matchingLabels.length - visibleMatching.length

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: GRID_CARD_TEMPLATE,
        gap: 2,
        p: 2,
        borderRadius: CARD_BORDER_RADIUS,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        minHeight: 176,
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
        <Box
          sx={{
            width: 88,
            height: 88,
            borderRadius: 2,
            border: '2px solid',
            borderColor: rarityBorder,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.5,
            bgcolor: theme.palette.background.default,
            position: 'relative',
          }}
        >
          {rankStars > 0 ? (
            <Box sx={{ display: 'flex', mb: 0.25 }}>
              {Array.from({ length: rankStars }).map((_, idx) => (
                <StarRoundedIcon
                  key={`rank-star-${idx}`}
                  sx={{
                    fontSize: '0.95rem',
                    color: idx < ascensionStars ? STAR_ASCENDED_COLOR : STAR_BASE_COLOR,
                    ml: idx === 0 ? 0 : '-6px',
                  }}
                />
              ))}
            </Box>
          ) : null}
          {SlotIcon ? (
            <Box sx={{ color: 'text.primary', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SlotIcon fontSize="large" />
            </Box>
          ) : null}
          {(setTooltipName ? (
            <WithSetTooltip name={setTooltipName} displayName={setLabel}>
              <Box
                sx={{
                  position: 'absolute',
                  left: -6,
                  bottom: -6,
                  bgcolor: 'background.paper',
                  borderRadius: 1,
                  p: 0.25,
                  boxShadow: 2,
                  border: '2px solid',
                  borderColor: rarityBorder,
                }}
              >
                <SetIcon setId={setIdNumber as ArtifactSetId} size={20} />
              </Box>
            </WithSetTooltip>
          ) : (
            <Box
              sx={{
                position: 'absolute',
                left: -6,
                bottom: -6,
                bgcolor: 'background.paper',
                borderRadius: 1,
                p: 0.25,
                boxShadow: 2,
                border: '2px solid',
                borderColor: rarityBorder,
              }}
            >
              <SetIcon setId={setIdNumber as ArtifactSetId} size={20} />
            </Box>
          ))}
          <Box
            sx={{
              position: 'absolute',
              right: -6,
              bottom: -6,
              bgcolor: 'background.paper',
              borderRadius: 1,
              px: 0.75,
              py: 0.25,
              boxShadow: 2,
              border: '2px solid',
              borderColor: rarityBorder,
              fontSize: '0.7rem',
              fontWeight: 600,
              color: 'text.primary',
            }}
          >
            {levelChipLabel}
          </Box>
        </Box>
        {factionLabel ? (
          <Typography variant="caption" color="text.secondary">{factionLabel}</Typography>
        ) : null}
        {sourceDescriptor ? (
          <Tooltip title={sourceDescriptor.tooltip ?? ''}>
            <Chip label={sourceDescriptor.label} size="small" variant="outlined" sx={{ fontSize: '0.75rem' }} />
          </Tooltip>
        ) : null}
      </Box>
      <Stack spacing={0.75} minWidth={0}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {rerollLabel ? (
            <Tooltip title={rerollTooltip}>
              <Box component="span">
                <TesterSummaryLabel label={rerollLabel} />
              </Box>
            </Tooltip>
          ) : null}
        </Box>
        <TesterSummaryLabel label={mainInline} color={mainColor} wrap />
        <Tooltip title={subTooltip}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {substatEntries.length > 0 ? substatEntries.map((entry) => (
              <Box
                key={`sub-${entry.variant}`}
                sx={{
                  position: 'relative',
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
                <Typography variant="body2" component="span">
                  {entry.content}
                </Typography>
              </Box>
            )) : (
              <TesterSummaryLabel label="—" />
            )}
          </Box>
        </Tooltip>
        {ascSummary}
      </Stack>
      <Stack spacing={1} minWidth={0}>
        <Chip
          label={outcomeLabel}
          size="small"
          color={outcomeColor}
          sx={{ alignSelf: 'flex-start', fontWeight: 600 }}
        />
        {match ? (
          <TesterRuleReferenceChip
            match={match}
            {...(onJumpToRule ? { onJump: onJumpToRule } : {})}
            sx={{ width: '100%' }}
          />
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t('testerRuleNoMatchShort')}
          </Typography>
        )}
        <Box>
          <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: 0.4, color: 'text.secondary' }}>
            {t('testerConfigMatches')}
          </Typography>
          {visibleMatching.length > 0 ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
              {visibleMatching.map((label) => (
                <Chip key={label} label={label} size="small" variant="outlined" />
              ))}
              {remainingMatches > 0 ? (
                <Chip label={`+${remainingMatches}`} size="small" variant="outlined" />
              ) : null}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t('testerConfigMatchesNone')}
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  )
});

function groupRowsBySet(rows: readonly TesterPreviewRow[], translate: TranslateFn): TesterGroup[] {
  const groups = new Map<string, TesterGroup>()
  rows.forEach((row, index) => {
    const artifact = row.artifact
    const slot = artifact.slot as ArtifactTypeId
    const setId = Number(artifact.set) || 0
    const accessory = isAccessorySlot(slot)
    const factionId = accessory ? ((artifact.faction || 0) as FactionId) : null
    const key = accessory ? `acc:${setId}:${factionId ?? 0}` : `art:${setId}`
    let group = groups.get(key)
    if (!group) {
      const setLabel = formatTesterSetLabel({ setId, slot, translate })
      const factionLabel = accessory && factionId ? translate(factionI18nKey(factionId)) : ''
      const label = factionLabel ? `${setLabel} • ${factionLabel}` : setLabel
      group = {
        key,
        label,
        setId,
        slot,
        factionId: accessory ? factionId : null,
        rows: [],
        order: index,
      }
      groups.set(key, group)
    }
    group.rows.push(row)
  })
  return Array.from(groups.values()).sort((a, b) => a.order - b.order)
}

function formatConfigLabel(idx: number, configNames: Array<string | null>, translate: TranslateFn): string {
  const name = configNames[idx]
  if (typeof name === 'string' && name.trim().length > 0) {
    return name.trim()
  }
  return translate('testerConfigChip', { index: idx + 1 })
}

function estimateGroupHeight(
  rowCount: number,
  collapsed: boolean,
  columnCount: number,
  marginBottomPx: number,
  gridGapPx: number,
): number {
  const header = ESTIMATED_ACCORDION_HEADER_PX
  if (collapsed) return header + marginBottomPx
  const columns = Math.max(1, columnCount)
  const rowsNeeded = Math.max(1, Math.ceil(rowCount / columns))
  const gridHeight = (rowsNeeded * ESTIMATED_CARD_HEIGHT_PX)
    + (Math.max(0, rowsNeeded - 1) * gridGapPx)
    + ESTIMATED_DETAILS_PADDING_PX
  return header + gridHeight + marginBottomPx
}

export default TesterItemsGrid
