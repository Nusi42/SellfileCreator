import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
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
  Skeleton,
  Popover,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import type { TransitionProps } from '@mui/material/transitions'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SellIcon from '@mui/icons-material/Sell'
import { alpha, useTheme, type Theme } from '@mui/material/styles'
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
  artifactTypeI18nKey,
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
// MarkdownTooltip unifies the tester’s tooltip behavior (source glyphs, manage colors, etc.) with the rest of the UI.
import MarkdownTooltip from './MarkdownTooltip'
import { WithSetTooltip } from './SetTooltip'
import ContextMenuPaper from './ContextMenuPaper'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import { useContextMenuHint } from '../hooks/useContextMenuHint'
import GridIconBox from './GridIconBox'
import {
  ACCESSORY_NO_SET_ID,
  MENU_CONTROL_HEIGHT_PX,
  MENU_CONTROL_MIN_WIDTH_PX,
  RULES_TABLE_SCROLL_HINT_HIDE_MS,
  type ColorBlindMode,
} from '../lib/constants'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'
import { useTesterGridPreferences } from '../state/testerGridPreferences'
import { championIconUrl } from '../lib/iconMaps/championIconMap'
import { EmptyStateMessage } from './EmptyStateMessage'

const GRID_CARD_SINGLE_COLUMN_TEMPLATE = 'minmax(0, 1fr)'
const TESTER_GRID_ICON_BOX_SIZE_PX = 72
const GRID_CARD_ICON_COLUMN_PX = TESTER_GRID_ICON_BOX_SIZE_PX
const GRID_CARD_STATS_MIN_COLUMN_PX = 112
const GRID_CARD_TEMPLATE = `${GRID_CARD_ICON_COLUMN_PX}px minmax(${GRID_CARD_STATS_MIN_COLUMN_PX}px, 1fr)`
const GRID_GAP = 0.375
const CARD_COLUMN_GAP_UNITS = 1.5
const CARD_BORDER_RADIUS_PX = 8
const CARD_PADDING_UNITS = 1
const CARD_MATCH_ROW_HEIGHT_PX = 24
const CARD_MATCH_ROW_GAP_PX = 2
const CARD_MATCH_ROW_MARGIN_PX = 2
const GRID_CARD_CONTAINER_PADDING_UNITS = 0.75
const GRID_CARD_LEFT_COLUMN_GAP_UNITS = 0.5
const GRID_CARD_SOURCE_ICON_SIZE_PX = 24
const CHAMPION_ICON_BASE_SIZE = { width: 26, height: 26 } as const
const CHAMPION_ICON_LARGE_SIZE = { width: 38, height: 38 } as const
const CHAMPION_ICON_LARGE_THRESHOLD = 5
const CHAMPION_ICON_BORDER_RADIUS_PX = 8
const VAULT_GLYPH_SIZE_PX = 20
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
// Group-level virtualization uses light overscan because the heavy lifting happens at the card row level.
const GRID_GROUP_VIRTUAL_OVERSCAN_ROWS = 2
const GRID_LEAF_VIRTUALIZE_ROW_THRESHOLD = 40
const GRID_LEAF_VIRTUAL_OVERSCAN_ROWS = 1
// Penalize off-screen rows so the reveal queue prefers on-screen cards even while overscanning nested accordions.
const GRID_CARD_OFFSCREEN_PRIORITY_PENALTY = 1_000_000
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

// Skeleton batches spread icon decoding across frames so collapsed accordions can re-open instantly.
const GRID_CARD_SKELETON_BATCH_SIZE = 6
const GRID_CARD_SKELETON_FRAME_DELAY_MS = 24

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
// Skip Collapse measurement when we need every accordion to open at once.
const InstantAccordionTransition = React.forwardRef<HTMLDivElement, TransitionProps & { children?: React.ReactNode }>(
  function InstantAccordionTransition({ in: inProp, children }, ref) {
    if (!inProp) {
      return null
    }
    if (!React.isValidElement(children)) {
      return null
    }
    return React.cloneElement(children, { ref })
  },
)

const INSTANT_ACCORDION_TRANSITION_SLOTS = { transition: InstantAccordionTransition } as const

type TranslateFn = ReturnType<typeof useI18n>['t']

// Variant toggles keep-uniques specific layout while keeping the base tester grid intact.
type TesterItemsGridVariant = 'tester' | 'keepUniques'

type TesterItemsGridProps = {
  rows: TesterPreviewRow[]
  filterActive?: boolean
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors?: boolean
  onToggleStatColors: (next: boolean) => void
  onOpenManageColors: () => void
  colorBlindMode: ColorBlindMode
  onChangeColorBlindMode: (mode: ColorBlindMode) => void
  colorIconSrc: string
  configNames: Array<string | null>
  onJumpToRule?: ((ruleIndex: number, cfgIdx: number | null) => void) | undefined
  variant?: TesterItemsGridVariant
  suppressMatchDetails?: boolean
  // Optional highlighter lets Keep Uniques fade non-matching cards without forking the grid.
  highlightedRowPredicate?: ((row: TesterPreviewRow) => boolean) | null
  dimUnhighlightedRows?: boolean
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
    onToggleStatColors,
    onOpenManageColors,
    colorBlindMode,
    onChangeColorBlindMode,
    colorIconSrc,
    configNames,
    onJumpToRule,
    variant = 'tester',
    suppressMatchDetails: suppressMatchDetailsProp = false,
    highlightedRowPredicate = null,
    dimUnhighlightedRows = false,
  } = props
  const keepUniquesVariant = variant === 'keepUniques'
  // Memoized predicates avoid re-render churn when Keep Uniques toggles highlighting.
  const highlightRowPredicate = typeof highlightedRowPredicate === 'function' ? highlightedRowPredicate : null
  const shouldDimUnhighlightedRows = Boolean(dimUnhighlightedRows && highlightRowPredicate)
  const { t } = useI18n()
  const theme = useTheme()
  const suppressMatchDetails = Boolean(suppressMatchDetailsProp)
  // Group tree is recalculated only when the dataset or locale changes so TanStack can reuse measured rows.
  const groups = useMemo(() => groupRowsBySet(rows, t), [rows, t])
  const numberFormatter = useMemo(() => new Intl.NumberFormat(undefined), [])
  const {
    columns: gridColumnPreference,
    showFirstMatch,
    showOtherMatches,
    showChampionIcons,
    setColumns,
    setShowFirstMatch,
    setShowOtherMatches,
    setShowChampionIcons,
  } = useTesterGridPreferences()
  // Preferences keep the old 4/5 column toggle alive even while Keep Uniques forces two columns.
  const storedColumnPreference = gridColumnPreference === 5 ? 5 : 4
  // Context-menu helper drives the "long press for menu" overlay when users have not seen it yet.
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
  // Accordion animation state lets mass-expands skip the expensive auto height tween.
  const [accordionAnimationsDisabled, setAccordionAnimationsDisabled] = useState(false)
  const accordionAnimationResetRafRef = useRef<number | null>(null)
  const disableAccordionAnimationsTemporarily = useCallback(() => {
    setAccordionAnimationsDisabled(true)
    if (typeof window === 'undefined') {
      setAccordionAnimationsDisabled(false)
      return
    }
    if (accordionAnimationResetRafRef.current != null) {
      window.cancelAnimationFrame(accordionAnimationResetRafRef.current)
    }
    accordionAnimationResetRafRef.current = window.requestAnimationFrame(() => {
      accordionAnimationResetRafRef.current = null
      setAccordionAnimationsDisabled(false)
    })
  }, [])
  useEffect(() => () => {
    if (typeof window === 'undefined') return
    if (accordionAnimationResetRafRef.current != null) {
      window.cancelAnimationFrame(accordionAnimationResetRafRef.current)
      accordionAnimationResetRafRef.current = null
    }
  }, [])
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
        if (shouldExpand) {
          disableAccordionAnimationsTemporarily()
        }
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
  }, [disableAccordionAnimationsTemporarily, getMultiToggleScope])

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
  const [showScrollGroupHint, setShowScrollGroupHint] = useState(false)
  const [firstVisibleRowId, setFirstVisibleRowId] = useState<number | null>(null)
  const scrollHintVisibleRef = useRef(false)
  const scrollHintHideTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const measureVisibleRowRafRef = useRef<number | null>(null)
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
  // Column toggle is disabled for Keep Uniques because the variant forces two columns.
  const handleColumnToggle = useCallback(() => {
    if (keepUniquesVariant) return
    setColumns(storedColumnPreference === 5 ? 4 : 5)
  }, [keepUniquesVariant, setColumns, storedColumnPreference])
  useContextMenuCloseOnOutsideRightClick({
    open: gridMenuOpen,
    onClose: closeGridMenu,
    menuRef: gridMenuPaperRef,
  })
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
  // Scroll-hint text mirrors the first visible card, so we sample DOM positions whenever virtualization shifts.
  const measureFirstVisibleRow = useCallback(() => {
    measureVisibleRowRafRef.current = null
    const container = containerRef.current
    if (!container || typeof window === 'undefined') return
    const containerRect = container.getBoundingClientRect()
    const nodes = container.querySelectorAll<HTMLElement>('[data-tester-grid-card="true"]')
    let bestId: number | null = null
    let bestTop = Number.POSITIVE_INFINITY
    for (let idx = 0; idx < nodes.length; idx += 1) {
      const node = nodes[idx]
      if (!node) continue
      const rect = node.getBoundingClientRect()
      if (rect.bottom <= containerRect.top + 1) continue
      if (rect.top >= containerRect.bottom - 1) continue
      if (rect.top < bestTop) {
        bestTop = rect.top
        const rawId = Number(node.getAttribute('data-row-id'))
        bestId = Number.isFinite(rawId) ? rawId : null
      }
    }
    if (bestId == null) return
    setFirstVisibleRowId((prev) => (prev === bestId ? prev : bestId))
  }, [])

  const scheduleMeasureFirstVisibleRow = useCallback(() => {
    if (typeof window === 'undefined') return
    if (measureVisibleRowRafRef.current != null) return
    measureVisibleRowRafRef.current = window.requestAnimationFrame(measureFirstVisibleRow)
  }, [measureFirstVisibleRow])
  const [scrollVersion, setScrollVersion] = useState(0)
  // Scroll handler feeds TanStack, the scroll hint, and the on-demand card reveal queue.
  const handleScroll = useCallback<React.UIEventHandler<HTMLDivElement>>((event) => {
    setScrollTop(event.currentTarget.scrollTop)
    if (!scrollHintVisibleRef.current) {
      scrollHintVisibleRef.current = true
      setShowScrollGroupHint(true)
    }
    if (scrollHintHideTimerRef.current) {
      clearTimeout(scrollHintHideTimerRef.current)
      scrollHintHideTimerRef.current = null
    }
    scrollHintHideTimerRef.current = window.setTimeout(() => {
      scrollHintVisibleRef.current = false
      setShowScrollGroupHint(false)
      scrollHintHideTimerRef.current = null
    }, RULES_TABLE_SCROLL_HINT_HIDE_MS)
    setScrollVersion((prev) => (prev + 1) % Number.MAX_SAFE_INTEGER)
    scheduleMeasureFirstVisibleRow()
  }, [scheduleMeasureFirstVisibleRow])
  // Keep Uniques enforces two columns so gear-combination cards stay legible.
  const preferredColumnCount = keepUniquesVariant ? 2 : storedColumnPreference
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
  useEffect(() => () => {
    if (scrollHintHideTimerRef.current) {
      clearTimeout(scrollHintHideTimerRef.current)
      scrollHintHideTimerRef.current = null
    }
    if (measureVisibleRowRafRef.current != null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(measureVisibleRowRafRef.current)
      measureVisibleRowRafRef.current = null
    }
  }, [])
  const estimatedColumnCount = gridColumnCount
  const virtualizationLayoutSignature = useMemo(() => (
    // Layout signature rolls up every spacing input TanStack cares about so collapsed accordions reset stale heights.
    `${gridColumnCount}:${accordionSpacingPx}:${gridGapPx}:${gridLeafPaddingPx}:${cardHeightPx}`
  ), [accordionSpacingPx, cardHeightPx, gridColumnCount, gridGapPx, gridLeafPaddingPx])
  const groupKeys = useMemo(() => (
    groups.map((group) => {
      // Include the collapsed state in the key so off-screen accordions shed their cached measurement immediately.
      const collapsedMarker = collapsedGroups.has(group.key) ? 'collapsed' : 'expanded'
      return `${group.key}:${collapsedMarker}:${virtualizationLayoutSignature}`
    })
  ), [collapsedGroups, groups, virtualizationLayoutSignature])
  const estimateGroupSize = useCallback((index: number) => {
    const group = groups[index]
    if (!group) return 0
    return estimateGroupHeight(
      group,
      collapsedGroups,
      estimatedColumnCount,
      accordionSpacingPx,
      gridGapPx,
      gridLeafPaddingPx,
      cardHeightPx,
    )
  }, [
    accordionSpacingPx,
    cardHeightPx,
    collapsedGroups,
    estimatedColumnCount,
    gridGapPx,
    gridLeafPaddingPx,
    groups,
  ])
  const getGroupKey = useCallback((index: number) => groupKeys[index] ?? `tester-group-${index}`, [groupKeys])
  // Virtualizer tracks just the top-level groups; it measures the rendered accordions so expansion/collapse stays in sync automatically.
  // Top-level TanStack virtualizer handles accordion headers; leaf grids clip rows internally.
  const rowVirtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => containerRef.current,
    estimateSize: estimateGroupSize,
    overscan: GRID_GROUP_VIRTUAL_OVERSCAN_ROWS,
    getItemKey: getGroupKey,
  })
  useEffect(() => {
    rowVirtualizer.measure()
  }, [
    rowVirtualizer,
    accordionSpacingPx,
    cardHeightPx,
    collapsedGroups,
    gridColumnCount,
    gridGapPx,
    gridLeafPaddingPx,
  ])
  const virtualItems = rowVirtualizer.getVirtualItems()
  const virtualizedHeight = Math.max(rowVirtualizer.getTotalSize(), 0)
  const virtualizationRangeStartIndex = virtualItems.length > 0 ? virtualItems[0]!.index : 0
  const virtualizationRangeEndIndex = virtualItems.length > 0
    ? virtualItems[virtualItems.length - 1]!.index + 1
    : groups.length
  const rowLookup = useMemo(() => {
    const map = new Map<number, TesterPreviewRow>()
    rows.forEach((row) => {
      const artifactId = Number(row.artifact?.id)
      if (Number.isFinite(artifactId)) {
        map.set(artifactId, row)
      }
    })
    return map
  }, [rows])
  const fallbackScrollHintRowId = useMemo(() => {
    for (let idx = 0; idx < rows.length; idx += 1) {
      const candidateId = Number(rows[idx]?.artifact?.id)
      if (Number.isFinite(candidateId)) {
        return candidateId
      }
    }
    return null
  }, [rows])
  const rowGroupLabelLookup = useMemo(() => {
    const map = new Map<number, string>()
    const assign = (group: TesterGroup, factionLabel?: string | null) => {
      const hasChildren = Boolean(group.children?.length)
      const nextFactionLabel = group.kind === 'accessoryFaction'
        ? (group.label ?? factionLabel ?? null)
        : factionLabel ?? null
      if (hasChildren) {
        group.children?.forEach((child) => assign(child, nextFactionLabel))
        if (group.kind !== 'accessoryFaction') {
          const baseLabel = group.label ?? ''
          group.rows.forEach((row) => {
            const id = Number(row.artifact?.id)
            if (Number.isFinite(id)) {
              map.set(id, baseLabel)
            }
          })
        }
        return
      }
      const baseLabel = group.label ?? ''
      const resolvedLabel = (group.kind === 'accessorySet' && nextFactionLabel)
        ? (baseLabel && baseLabel.trim().length > 0 ? `${nextFactionLabel} – ${baseLabel}` : nextFactionLabel)
        : baseLabel
      group.rows.forEach((row) => {
        const id = Number(row.artifact?.id)
        if (Number.isFinite(id)) {
          map.set(id, resolvedLabel)
        }
      })
    }
    groups.forEach((group) => assign(group, null))
    return map
  }, [groups])
  const effectiveScrollHintRowId = useMemo(() => {
    if (firstVisibleRowId != null && rowLookup.has(firstVisibleRowId)) {
      return firstVisibleRowId
    }
    return fallbackScrollHintRowId
  }, [fallbackScrollHintRowId, firstVisibleRowId, rowLookup])
  const scrollHintLabel = useMemo(() => {
    if (effectiveScrollHintRowId == null) return null
    const row = rowLookup.get(effectiveScrollHintRowId)
    if (!row) return null
    const artifact = row.artifact
    if (!artifact) return null
    const groupLabel = rowGroupLabelLookup.get(effectiveScrollHintRowId) ?? ''
    const slotLabel = typeof artifact.slot === 'number'
      ? t(artifactTypeI18nKey(artifact.slot as ArtifactTypeId))
      : ''
    const rankLabel = formatTesterRankLabel(artifact.rank, t)
    const rarityLabel = formatTesterRarityLabel(artifact.rarity, t)
    const detailParts: string[] = []
    if (slotLabel) detailParts.push(slotLabel)
    if (rankLabel) detailParts.push(rankLabel)
    if (rarityLabel) detailParts.push(rarityLabel)
    const detail = detailParts.length > 0 ? detailParts.join(' ') : t('testerValueUnknown')
    const resolvedGroup = groupLabel || t('testerValueUnknown')
    return t('testerGridScrollHint', { group: resolvedGroup, detail })
  }, [effectiveScrollHintRowId, rowGroupLabelLookup, rowLookup, t])
  // Scroll hint stays accurate even when virtualization reshuffles rows or the user toggles chip rows.
  useLayoutEffect(() => {
    scheduleMeasureFirstVisibleRow()
  }, [
    scheduleMeasureFirstVisibleRow,
    virtualizationRangeStartIndex,
    virtualizationRangeEndIndex,
    gridColumnCount,
    showFirstMatch,
    showOtherMatches,
    collapsedGroups,
    rows.length,
    groups,
  ])
  if (rows.length === 0) {
    // Highlight props bubble through the group tree so only the leaf cards need to know about Keep Uniques.
    return (
      <EmptyStateMessage sx={{ flex: '1 1 auto', minHeight: 0 }} minHeight="100%">
        {filterActive ? t('testerTableEmptyFilter') : t('testerTableEmpty')}
      </EmptyStateMessage>
    )
  }
  // Recursive renderer keeps accessory faction/group accordions in sync with the virtualized rows.
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
        suppressMatchDetails={suppressMatchDetails}
        gridColumnCount={gridColumnCount}
        showFirstMatchRow={showFirstMatch}
        showOtherMatchesRow={showOtherMatches}
        showChampionIcons={showChampionIcons}
        cardHeightPx={cardHeightPx}
        configNames={configNames}
        onJumpToRule={onJumpToRule}
        highlightedRowPredicate={highlightRowPredicate}
        dimUnhighlightedRows={shouldDimUnhighlightedRows}
        disableAccordionAnimations={accordionAnimationsDisabled}
        childContent={group.children?.length ? group.children.map((child) => renderGroup(child, depth + 1)) : undefined}
        depth={depth}
          scrollContainerRef={containerRef}
          scrollOffset={scrollTop}
          viewportHeight={viewportHeight}
          scrollVersion={scrollVersion}
        />
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative' }}>
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
            height: `${virtualizedHeight}px`,
            minHeight: `${virtualizedHeight}px`,
          }}
        >
          {/* Every group render flows through TanStack virtualization so accordions can recycle smoothly. */}
          {virtualItems.map((virtualItem) => {
            const group = groups[virtualItem.index]
            if (!group) return null
            const rowKey = groupKeys[virtualItem.index] ?? virtualItem.key
            return (
              <Box
                key={rowKey}
                data-index={virtualItem.index}
                ref={rowVirtualizer.measureElement}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {renderGroup(group, 0)}
              </Box>
            )
          })}
        </Box>
      </Box>
      {/* Flyout floats above the grid but ignores all pointer/touch events so cards stay interactive. */}
      {scrollHintLabel ? (
        <Box
          aria-hidden={!showScrollGroupHint}
          aria-live="polite"
          sx={(theme) => ({
            position: 'absolute',
            top: theme.spacing(1.5),
            right: theme.spacing(1.5),
            zIndex: theme.zIndex.tooltip,
            px: 1.25,
            py: 0.5,
            borderRadius: theme.shape.borderRadius,
            backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.9 : 0.92),
            boxShadow: theme.shadows[3],
            color: theme.palette.text.primary,
            transition: theme.transitions.create(['opacity', 'transform'], { duration: theme.transitions.duration.shorter }),
            opacity: showScrollGroupHint ? 1 : 0,
            transform: showScrollGroupHint ? 'translateY(0)' : 'translateY(-6px)',
            pointerEvents: 'none',
            '& *': { pointerEvents: 'none' },
          })}
        >
          <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: 0.15 }}>
            {scrollHintLabel}
          </Typography>
        </Box>
      ) : null}
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
            {/* Manage colors button now uses MarkdownTooltip so its multi-line hint inherits the global delay. */}
            <MarkdownTooltip markdown={t('manageColors')}>
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
            </MarkdownTooltip>
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
        <MenuItem
          sx={{ gap: 1, alignItems: 'center' }}
          onClick={handleColumnToggle}
          disabled={keepUniquesVariant}
        >
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuGridColumns')}</Typography>
          <Button
            size="small"
            variant="contained"
            color="success"
            disabled={keepUniquesVariant}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              handleColumnToggle()
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
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setShowChampionIcons(!showChampionIcons)}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuShowChampionIcons')}</Typography>
          <Button
            size="small"
            variant={showChampionIcons ? 'contained' : 'outlined'}
            color="success"
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              setShowChampionIcons(!showChampionIcons)
            }}
          >
            {showChampionIcons ? t('commonOn') : t('commonOff')}
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
  suppressMatchDetails: boolean
  gridColumnCount: number
  showFirstMatchRow: boolean
  showOtherMatchesRow: boolean
  showChampionIcons: boolean
  cardHeightPx: number
  configNames: Array<string | null>
  onJumpToRule?: ((ruleIndex: number, cfgIdx: number | null) => void) | undefined
  childContent?: React.ReactNode
  depth?: number
  // Highlight predicate trickles down so nested accordions stay presentation-only.
  highlightedRowPredicate?: ((row: TesterPreviewRow) => boolean) | null
  dimUnhighlightedRows?: boolean
  disableAccordionAnimations: boolean
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  scrollOffset: number
  viewportHeight: number
  scrollVersion: number
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
  suppressMatchDetails,
  gridColumnCount,
  showFirstMatchRow,
  showOtherMatchesRow,
  showChampionIcons,
  cardHeightPx,
  configNames,
  onJumpToRule,
  childContent,
  depth = 0,
  highlightedRowPredicate = null,
  dimUnhighlightedRows = false,
  disableAccordionAnimations,
  scrollContainerRef,
  scrollOffset,
  viewportHeight,
  scrollVersion,
}: TesterItemsGridGroupProps) {
  const hasChildren = Boolean(childContent)
  const nested = depth > 0
  const theme = useTheme()
  const gridRowGapPx = pxValue(theme.spacing(GRID_GAP))
  // Card rows are chunked per accordion so nested groups can virtualize independently of the root list.
  const cardRowChunks = useMemo(() => {
    if (hasChildren) return []
    const columns = Math.max(1, gridColumnCount)
    const rows: TesterPreviewRow[][] = []
    for (let idx = 0; idx < group.rows.length; idx += columns) {
      rows.push(group.rows.slice(idx, idx + columns))
    }
    return rows
  }, [group.rows, gridColumnCount, hasChildren])
  const cardRowCount = cardRowChunks.length
  const shouldVirtualizeLeafRows = !hasChildren && cardRowCount > GRID_LEAF_VIRTUALIZE_ROW_THRESHOLD
  // Tall leaf accordions animate poorly because TanStack remeasures every frame, so skip the transition once the
  // virtualization path is active (global mass-expands still flip the shared disable flag).
  const shouldSkipAccordionAnimation = disableAccordionAnimations || shouldVirtualizeLeafRows
  // Leaf accordions track scroll offsets to decide how aggressively to virtualize their cards.
  const gridContentRef = useRef<HTMLDivElement | null>(null)
  const leafPriorityBaseRef = useRef<number>(0)
  const leafPrioritySignatureRef = useRef<string | null>(null)
  const [gridAbsoluteOffset, setGridAbsoluteOffset] = useState<number | null>(null)
  // Observe the rendered card grid so every accordion knows its absolute scroll offset, even when nested.
  useLayoutEffect(() => {
    const node = gridContentRef.current
    const scrollNode = scrollContainerRef.current
    if (!node || !scrollNode) return undefined
    const measure = () => {
      const containerRect = scrollNode.getBoundingClientRect()
      const nodeRect = node.getBoundingClientRect()
      const offset = scrollNode.scrollTop + (nodeRect.top - containerRect.top)
      setGridAbsoluteOffset(offset)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      const handleResize = () => { measure() }
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
    const observer = new ResizeObserver(() => { measure() })
    observer.observe(node)
    return () => observer.disconnect()
  }, [
    scrollContainerRef,
    gridColumnCount,
    group.rows.length,
    expanded,
    cardHeightPx,
    showFirstMatchRow,
    showOtherMatchesRow,
  ])
  const cardRowStridePx = cardHeightPx + gridRowGapPx
  const totalRowsHeightPx = useMemo(() => {
    if (!cardRowCount) return 0
    const spacing = Math.max(0, cardRowCount - 1) * gridRowGapPx
    return (cardRowCount * cardHeightPx) + spacing
  }, [cardHeightPx, cardRowCount, gridRowGapPx])
  const effectiveGridAbsoluteOffset = gridAbsoluteOffset ?? scrollOffset
  const hasUsableGridOffset = Number.isFinite(effectiveGridAbsoluteOffset)
  // Leaf virtualization only kicks in once we know the card stride; nested accordions fall back otherwise.
  const canVirtualizeLeafRows = Boolean(
    shouldVirtualizeLeafRows
      && hasUsableGridOffset
      && viewportHeight > 0
      && cardRowStridePx > 0,
  )
  let rowRangeStart = 0
  let rowRangeEnd = cardRowCount
  let rowPadTopPx = 0
  let rowPadBottomPx = 0
  if (canVirtualizeLeafRows && cardRowCount > 0 && hasUsableGridOffset) {
    const viewportStart = scrollOffset
    const viewportEnd = viewportStart + viewportHeight
    // Fallback offset keeps virtualization active on the first expansion before the accordion reports its true position.
    const relativeStart = viewportStart - effectiveGridAbsoluteOffset
    const relativeEnd = viewportEnd - effectiveGridAbsoluteOffset
    // Manual overscan keeps keyboard/PageDown smooth without re-rendering the full accordion.
    const overscan = GRID_LEAF_VIRTUAL_OVERSCAN_ROWS
    const start = Math.max(0, Math.floor(relativeStart / cardRowStridePx) - overscan)
    const end = Math.min(cardRowCount, Math.ceil(relativeEnd / cardRowStridePx) + overscan)
    rowRangeStart = Math.min(Math.max(0, start), Math.max(0, cardRowCount - 1))
    rowRangeEnd = Math.max(rowRangeStart + 1, Math.min(cardRowCount, Math.max(rowRangeStart + 1, end)))
    rowPadTopPx = rowRangeStart === 0 ? 0 : rowRangeStart * cardRowStridePx
    const visibleRows = rowRangeEnd - rowRangeStart
    const visibleHeightPx = (visibleRows * cardHeightPx) + (Math.max(0, visibleRows - 1) * gridRowGapPx)
    rowPadBottomPx = Math.max(0, totalRowsHeightPx - rowPadTopPx - visibleHeightPx)
  }
  // Signature pairs the scroll version with the measured row window so we only bump the priority base when needed.
  // Priority signature avoids starving off-screen reveals when accordions are recycled mid-scroll.
  const prioritySignature = canVirtualizeLeafRows
    ? `${scrollVersion}:${rowRangeStart}:${rowRangeEnd}`
    : `${scrollVersion}:static:${group.key}:${group.rows.length}`
  if (leafPrioritySignatureRef.current !== prioritySignature) {
    leafPrioritySignatureRef.current = prioritySignature
    leafPriorityBaseRef.current = scrollVersion
  }
  const cardPriorityBase = leafPriorityBaseRef.current
  const numericSetId = typeof group.setId === 'number' && group.setId > 0 ? group.setId : null
  const groupSetTooltipName = numericSetId != null ? (artifactSetNames[numericSetId] ?? null) : null
  const trimmedGroupLabel = group.label.trim()
  const groupDisplayName = trimmedGroupLabel.length > 0 ? trimmedGroupLabel : undefined
  const groupSetTooltipProps = groupDisplayName
    ? { displayName: groupDisplayName, showName: true }
    : undefined
  const summarySetIcon = numericSetId != null ? (
    <Box sx={{ lineHeight: 0, display: 'flex', alignItems: 'center' }}>
      <SetIcon
        setId={numericSetId as ArtifactSetId}
        size={24}
        {...(groupDisplayName ? { label: groupDisplayName } : {})}
      />
    </Box>
  ) : null
  const transitionTimeout = shouldSkipAccordionAnimation ? 0 : theme.transitions.duration.shorter
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
      // Mass-expands skip the slow auto height tween while single toggles keep the subtle motion.
      slotProps={{ transition: { timeout: transitionTimeout } }}
      {...(shouldSkipAccordionAnimation ? { slots: INSTANT_ACCORDION_TRANSITION_SLOTS } : {})}
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
              <WithSetTooltip name={groupSetTooltipName} {...(groupSetTooltipProps ?? {})}>
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
              ref={gridContentRef}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                bgcolor: 'inherit',
              }}
            >
              {canVirtualizeLeafRows && rowPadTopPx > 0 ? (
                <Box sx={{ height: `${rowPadTopPx}px`, flex: '0 0 auto' }} />
              ) : null}
              {cardRowChunks.slice(rowRangeStart, rowRangeEnd).map((rowEntries, visibleIdx) => {
                const absoluteRowIndex = rowRangeStart + visibleIdx
                return (
                  <Box
                    key={`${group.key}-row-${absoluteRowIndex}`}
                    sx={(theme) => ({
                      display: 'grid',
                      gridTemplateColumns: `repeat(${Math.max(1, gridColumnCount)}, ${GRID_CARD_SINGLE_COLUMN_TEMPLATE})`,
                      columnGap: theme.spacing(GRID_GAP),
                      rowGap: 0,
                      ...(absoluteRowIndex > 0 ? { mt: theme.spacing(GRID_GAP) } : {}),
                    })}
                  >
                    {rowEntries.map((row, columnIdx) => {
                      // Prioritize rows by absolute Y so nested accordions resolve sequentially; anything outside the
                      // current viewport pays a huge penalty so overscan never jumps the queue.
                      const rowAbsoluteTopPx = effectiveGridAbsoluteOffset + (absoluteRowIndex * cardRowStridePx)
                      const rowAbsoluteBottomPx = rowAbsoluteTopPx + cardHeightPx
                      const viewportStartPx = scrollOffset
                      const viewportEndPx = viewportStartPx + viewportHeight
                      const viewportReady = viewportHeight > 0
                      const intersectsViewport = viewportReady
                        ? (rowAbsoluteBottomPx >= viewportStartPx && rowAbsoluteTopPx <= viewportEndPx)
                        : true
                      let positionOrder = rowAbsoluteTopPx
                      if (viewportReady && !intersectsViewport) {
                        if (rowAbsoluteBottomPx < viewportStartPx) {
                          positionOrder = GRID_CARD_OFFSCREEN_PRIORITY_PENALTY + (viewportStartPx - rowAbsoluteBottomPx)
                        } else if (rowAbsoluteTopPx > viewportEndPx) {
                          positionOrder = GRID_CARD_OFFSCREEN_PRIORITY_PENALTY + (rowAbsoluteTopPx - viewportEndPx)
                        }
                      }
                      const cardPriorityOrder = positionOrder + (columnIdx * 0.01)
                      return (
                        <TesterGridCard
                          key={row.artifact.id}
                          row={row}
                          substatColors={substatColors}
                          useStatButtonColors={useStatButtonColors}
                          suppressMatchDetails={suppressMatchDetails}
                          showFirstMatchRow={showFirstMatchRow}
                          showOtherMatchesRow={showOtherMatchesRow}
                          showChampionIcons={showChampionIcons}
                          cardHeightPx={cardHeightPx}
                          gridColumnCount={gridColumnCount}
                          configNames={configNames}
                          onJumpToRule={onJumpToRule}
                          highlightedRowPredicate={highlightedRowPredicate}
                          dimUnhighlightedRows={dimUnhighlightedRows}
                          cardPriority={{ base: cardPriorityBase, order: cardPriorityOrder }}
                        />
                      )
                    })}
                  </Box>
                )
              })}
              {canVirtualizeLeafRows && rowPadBottomPx > 0 ? (
                <Box sx={{ height: `${rowPadBottomPx}px`, flex: '0 0 auto' }} />
              ) : null}
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
  suppressMatchDetails,
  showFirstMatchRow,
  showOtherMatchesRow,
  showChampionIcons,
  cardHeightPx,
  gridColumnCount,
  configNames,
  onJumpToRule,
  highlightedRowPredicate = null,
  dimUnhighlightedRows = false,
  cardPriority,
}: {
  row: TesterPreviewRow
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  suppressMatchDetails: boolean
  showFirstMatchRow: boolean
  showOtherMatchesRow: boolean
  showChampionIcons: boolean
  cardHeightPx: number
  gridColumnCount: number
  configNames: Array<string | null>
  onJumpToRule?: ((ruleIndex: number, cfgIdx: number | null) => void) | undefined
  highlightedRowPredicate?: ((row: TesterPreviewRow) => boolean) | null
  dimUnhighlightedRows?: boolean
  cardPriority: { base: number; order: number }
}) {
  // Highlight state lets Keep Uniques call attention to the at-risk combinations without mutating the dataset.
  const highlightFn = typeof highlightedRowPredicate === 'function' ? highlightedRowPredicate : null
  const cardHighlighted = highlightFn ? Boolean(highlightFn(row)) : false
  const cardDimmed = Boolean(highlightFn && dimUnhighlightedRows && !cardHighlighted)
  const { t } = useI18n()
  const theme = useTheme()
  const artifact = row.artifact
  const priorityBase = Number(cardPriority?.base) || 0
  const priorityOrder = Number(cardPriority?.order) || 0
  const rawArtifactId = Number(artifact?.id)
  const normalizedArtifactId = Number.isFinite(rawArtifactId) ? rawArtifactId : null
  const mightShowOtherMatchesRow = useMemo(() => {
    if (!Array.isArray(row.matchingCfgIndices)) return false
    const seen = new Set<number>()
    for (const rawIdx of row.matchingCfgIndices) {
      const numericIdx = Number(rawIdx)
      if (!Number.isFinite(numericIdx)) continue
      if (seen.has(numericIdx)) continue
      seen.add(numericIdx)
      if (seen.size > 1) {
        return true
      }
    }
    return false
  }, [row.matchingCfgIndices])
  const basePrimaryMatchRowVisible = !suppressMatchDetails && showFirstMatchRow
  const baseOtherMatchesRowVisible = !suppressMatchDetails && showOtherMatchesRow && mightShowOtherMatchesRow
  const { leftColumnHeightPx, rightColumnHeightPx } = useMemo(
    () => getTesterGridCardColumnHeights(theme, gridColumnCount),
    [theme, gridColumnCount],
  )
  const cardContentReady = useTesterGridCardContentReady(normalizedArtifactId, priorityBase, priorityOrder)
  const match = row.match
  const primaryRuleIndex = typeof match?.ruleIndex === 'number' ? match.ruleIndex : null
  const primaryCfgIndex = typeof match?.cfgIdx === 'number' ? match.cfgIdx : null
  const canJumpToPrimaryMatch = typeof onJumpToRule === 'function' && primaryRuleIndex != null
  const handlePrimaryMatchClick = () => {
    if (canJumpToPrimaryMatch && primaryRuleIndex != null) {
      onJumpToRule?.(primaryRuleIndex, primaryCfgIndex ?? null)
    }
  }
  // Matching chips hydrate lazily so skeleton rows can avoid heavy string work until revealed.
  const matchingEntries: MatchingConfigEntry[] = useMemo(() => {
    if (!cardContentReady) return []
    if (!Array.isArray(row.matchingCfgIndices)) return []
    const seen = new Set<number>()
    const entries: MatchingConfigEntry[] = []
    for (const rawIdx of row.matchingCfgIndices) {
      const numericIdx = Number(rawIdx)
      if (!Number.isFinite(numericIdx) || seen.has(numericIdx)) continue
      seen.add(numericIdx)
      entries.push({
        cfgIdx: numericIdx,
        label: formatConfigLabel(numericIdx as number, configNames, t),
      })
    }
    return entries
  }, [cardContentReady, row.matchingCfgIndices, configNames, t])
  const shouldShowPrimaryMatchRow = basePrimaryMatchRowVisible
  const hasMatchingConfigs = matchingEntries.length > 0
  const otherMatchingEntries = matchingEntries.slice(1)
  const shouldShowOtherMatchesRow = !suppressMatchDetails && showOtherMatchesRow && otherMatchingEntries.length > 0
  type PrimaryMatchRowState = 'hidden' | 'match' | 'pending' | 'no-match'
  const primaryMatchRowState: PrimaryMatchRowState = (() => {
    if (!shouldShowPrimaryMatchRow) return 'hidden'
    if (match) return 'match'
    return hasMatchingConfigs ? 'pending' : 'no-match'
  })()
  const shouldRenderNoMatchChip = primaryMatchRowState === 'no-match'
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
  // Gap + refs let us squeeze as many chips as possible before handing the overflow to a popover.
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
  // Available width is recalculated whenever the +N chip resizes so text never overflows.
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
  // Overflow chip defers the popover until the user explicitly taps it to keep VT tree shallow.
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
      <MarkdownTooltip key={key} markdown={t('testerJumpToConfig')}>
        {wrappedChip}
      </MarkdownTooltip>
    )
  }
  if (!cardContentReady) {
    return (
      <TesterGridCardSkeleton
        cardHeightPx={cardHeightPx}
        leftColumnHeightPx={leftColumnHeightPx}
        rightColumnHeightPx={rightColumnHeightPx}
        showPrimaryMatchRow={basePrimaryMatchRowVisible}
        showOtherMatchesRow={baseOtherMatchesRowVisible}
        highlighted={cardHighlighted}
        dimmed={cardDimmed}
      />
    )
  }
  const setIdNumber = Number(artifact.set) || 0
  const setLabelRaw = formatTesterSetLabel({ setId: setIdNumber, slot: artifact.slot as ArtifactTypeId, translate: t })
  const setLabel = setLabelRaw.trim().length > 0 ? setLabelRaw : undefined
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
  const championIconSrc = championIconUrl(artifact.equippedChampionBaseId ?? artifact.equippedToChampionId)
  // Collection/vault rows show champion avatars inline when there is enough grid width.
  const championIconMode = (() => {
    if (!showChampionIcons || !championIconSrc || !sourceDescriptor) return 'none' as const
    if (sourceDescriptor.category !== 'collection' && sourceDescriptor.category !== 'vault') return 'none' as const
    return gridColumnCount >= CHAMPION_ICON_LARGE_THRESHOLD ? 'large' : 'compact'
  })()
  const shouldShowChampionIcon = championIconMode !== 'none'
  const sourceCategory = sourceDescriptor?.category
  const isVaultSource = sourceCategory === 'vault'
  const isCollectionSource = sourceCategory === 'collection'
  const shouldShowVaultBadgeIcon = Boolean(shouldShowChampionIcon && isVaultSource && SourceIcon)
  const shouldShowStandaloneSourceIcon = Boolean(
    sourceDescriptor
    && SourceIcon
    && (
      !shouldShowChampionIcon
      || (!isCollectionSource && !isVaultSource)
      || (isVaultSource && !shouldShowVaultBadgeIcon)
    ),
  )
  // Smaller badges fall back to a single glyph so collapsed accordions stay lightweight.
  const SourceGlyph = shouldShowStandaloneSourceIcon && SourceIcon ? SourceIcon : null
  const sourceIconLabel = sourceDescriptor?.label ?? ''
  const championIconSize = championIconMode === 'large'
    ? CHAMPION_ICON_LARGE_SIZE
    : CHAMPION_ICON_BASE_SIZE
  const rerollLabel = artifact.rerollCount > 0 ? '⟳' : ''
  const rerollTooltip = artifact.rerollCount > 0 ? t('testerRerollLabel') : ''
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
  // Keep/sell outcome surfaces the rule chip inline so keyboard users do not need to open popovers.
  const cardOutcome = !suppressMatchDetails && match
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

  // Cards tint when highlighted so Keep Uniques can spotlight the matching combinations.
  return (
    <Box
      data-tester-grid-card="true"
      data-row-id={artifact.id}
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: GRID_CARD_TEMPLATE,
        columnGap: theme.spacing(CARD_COLUMN_GAP_UNITS),
        p: theme.spacing(CARD_PADDING_UNITS),
        borderRadius: `${CARD_BORDER_RADIUS_PX}px`,
        border: `1px solid ${cardHighlighted ? theme.palette.info.light : theme.palette.divider}`,
        bgcolor: theme.palette.background.paper,
        minHeight: cardHeightStyle,
        height: cardHeightStyle,
        maxHeight: cardHeightStyle,
        boxSizing: 'border-box',
        overflow: 'hidden',
        alignContent: 'start',
        boxShadow: cardHighlighted ? `0 0 0 1px ${alpha(theme.palette.info.main, 0.3)}` : 'none',
        opacity: cardDimmed ? 0.35 : 1,
        transition: 'opacity 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
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
          {...(setLabel ? { setLabel } : {})}
          setTooltipName={setTooltipName}
          slotLabel={artifactTypeName(artifact.slot as ArtifactTypeId)}
          rerollLabel={rerollLabel || undefined}
          rerollTooltip={rerollTooltip || undefined}
          levelLabel={levelChipLabel}
          size={TESTER_GRID_ICON_BOX_SIZE_PX}
          {...(cardOutcome ? { outcome: cardOutcome } : {})}
        />
        {shouldShowChampionIcon ? (
          <Box
            sx={{
              width: TESTER_GRID_ICON_BOX_SIZE_PX,
              height: championIconSize.height,
              position: 'relative',
              mt: championIconMode === 'large' ? 1.25 : -0.25,
            }}
          >
            {/* Source badges consistently run through MarkdownTooltip so the rich copy stays readable. */}
            <MarkdownTooltip markdown={sourceTooltipTitle}>
              <Box
                component="span"
                role="img"
                aria-label={sourceDescriptor?.label}
                sx={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: championIconSize.width,
                  height: championIconSize.height,
                  borderRadius: `${CHAMPION_ICON_BORDER_RADIUS_PX}px`,
                  overflow: 'hidden',
                  border: '1px solid',
                  borderColor: 'divider',
                  boxShadow: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Box
                  component="img"
                  src={championIconSrc}
                  alt={sourceTooltipTitle}
                  draggable={false}
                  onDragStart={(event) => { event.preventDefault(); event.stopPropagation() }}
                  sx={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    userSelect: 'none',
                    WebkitUserDrag: 'none',
                    display: 'block',
                  }}
                />
              </Box>
            </MarkdownTooltip>
            {shouldShowVaultBadgeIcon && SourceIcon ? (
              <MarkdownTooltip markdown={sourceTooltipTitle}>
                <Box
                  component="span"
                  role="img"
                  aria-label={sourceIconLabel}
                  sx={{
                    position: 'absolute',
                    top: `calc(50% + ${championIconMode === 'large' ? 0 : 3}px)`,
                    left: `${TESTER_GRID_ICON_BOX_SIZE_PX - 5}px`,
                    transform: 'translate(-50%, -50%)',
                    width: VAULT_GLYPH_SIZE_PX,
                    height: VAULT_GLYPH_SIZE_PX,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'text.secondary',
                    fontSize: '0.95rem',
                  }}
                >
                  <SourceIcon fontSize="inherit" />
                </Box>
              </MarkdownTooltip>
            ) : null}
          </Box>
        ) : null}
        {SourceGlyph ? (
          // The smaller glyph badges reuse MarkdownTooltip as well, so tooltip styling stays aligned.
          <MarkdownTooltip markdown={sourceTooltipTitle}>
            <Box
              component="span"
              role="img"
              aria-label={sourceIconLabel}
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
              <SourceGlyph fontSize="inherit" />
            </Box>
          </MarkdownTooltip>
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
        {/* Summary chips share MarkdownTooltip to keep the multi-line substat text readable with the new delay. */}
        <MarkdownTooltip markdown={subTooltip}>
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
        </MarkdownTooltip>
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
          ) : shouldRenderNoMatchChip ? (
            <Chip size="small" color="success" variant="filled" label={t('testerNoMatch')} />
          ) : null}
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
              sx={{
                display: 'flex',
                flexWrap: 'nowrap',
                gap: MATCHING_CHIP_GAP_UNITS,
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
                  maxWidth: hasHiddenMatches
                    ? `${visibleChipsAvailableWidth}px`
                    : '100%',
                }}
              >
                {visibleOtherMatching.map((entry) => renderMatchingChip(entry))}
              </Box>
            </Box>
            {hiddenOtherMatching.length > 0 ? (
              <>
                {/* MarkdownTooltip keeps the “+N” overflow chip consistent with other tester tooltips. */}
                <MarkdownTooltip markdown={`${t('testerConfigMatches')} (+${hiddenOtherMatching.length})`}>
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
                </MarkdownTooltip>
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


type TesterGridCardSkeletonProps = {
  cardHeightPx: number
  leftColumnHeightPx: number
  rightColumnHeightPx: number
  showPrimaryMatchRow: boolean
  showOtherMatchesRow: boolean
  highlighted: boolean
  dimmed: boolean
}

// Skeleton cards borrow the real grid metrics so TanStack virtualization keeps accurate heights while assets defer.
function TesterGridCardSkeleton({
  cardHeightPx,
  leftColumnHeightPx,
  rightColumnHeightPx,
  showPrimaryMatchRow,
  showOtherMatchesRow,
  highlighted,
  dimmed,
}: TesterGridCardSkeletonProps) {
  const skeletonTheme = useTheme()
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
        border: `1px solid ${highlighted ? theme.palette.info.light : theme.palette.divider}`,
        bgcolor: theme.palette.background.paper,
        minHeight: cardHeightStyle,
        height: cardHeightStyle,
        maxHeight: cardHeightStyle,
        boxSizing: 'border-box',
        overflow: 'hidden',
        opacity: dimmed ? 0.35 : 1,
        transition: 'opacity 120ms ease',
      })}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: GRID_CARD_LEFT_COLUMN_GAP_UNITS,
          minHeight: leftColumnHeightPx,
          height: leftColumnHeightPx,
          maxHeight: leftColumnHeightPx,
          justifyContent: 'flex-start',
        }}
      >
        <Skeleton variant="rounded" width={TESTER_GRID_ICON_BOX_SIZE_PX} height={TESTER_GRID_ICON_BOX_SIZE_PX} />
        <Skeleton
          variant="rounded"
          width={CHAMPION_ICON_LARGE_SIZE.width}
          height={CHAMPION_ICON_LARGE_SIZE.height}
        />
        <Skeleton variant="circular" width={GRID_CARD_SOURCE_ICON_SIZE_PX} height={GRID_CARD_SOURCE_ICON_SIZE_PX} />
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
        <Skeleton variant="text" width="75%" sx={{ fontSize: `${CARD_SUMMARY_FONT_SIZE_REM}rem` }} />
        <Skeleton variant="text" width="50%" />
        {Array.from({ length: CARD_SUBSTAT_LINE_COUNT }).map((_, idx) => (
          <Skeleton
            key={`sub-skeleton-${idx}`}
            variant="text"
            width={`${80 - (idx * 8)}%`}
            sx={{ fontSize: skeletonTheme.typography.body2?.fontSize ?? '0.875rem' }}
          />
        ))}
      </Stack>
      {showPrimaryMatchRow ? (
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
          <Skeleton variant="rounded" width="100%" height={CARD_MATCH_ROW_HEIGHT_PX - 6} />
        </Box>
      ) : null}
      {showOtherMatchesRow ? (
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
          <Skeleton variant="rounded" width="60%" height={CARD_MATCH_ROW_HEIGHT_PX - 6} />
        </Box>
      ) : null}
    </Box>
  )
}

type TesterGridCardRevealTask = {
  priorityBase: number
  priorityOrder: number
  run: () => void
}

// Queue gated reveals throttle IMG decode churn so expanding large accordions stays interactive.
const testerGridCardRevealQueue: TesterGridCardRevealTask[] = []
let testerGridCardRevealScheduled = false
let testerGridCardRevealQueueDirty = false
const testerGridCardSeenIds = new Set<number>()

function useTesterGridCardContentReady(rowId: number | null, priorityBase: number, priorityOrder: number): boolean {
  // Priority values keep row order deterministic while cards are still in their skeleton state.
  const normalizedBase = Number.isFinite(priorityBase) ? Math.max(0, priorityBase) : 0
  const normalizedOrder = Number.isFinite(priorityOrder) ? Math.max(0, priorityOrder) : 0
  const [ready, setReady] = useState(() => (
    typeof window === 'undefined' || rowId === null || testerGridCardSeenIds.has(rowId)
  ))
  useEffect(() => {
    if (ready) return undefined
    if (rowId !== null && testerGridCardSeenIds.has(rowId)) {
      setReady(true)
      return undefined
    }
    let cancelled = false
    const cleanup = enqueueTesterGridCardReveal(normalizedBase, normalizedOrder, () => {
      if (cancelled) return
      if (rowId !== null) {
        testerGridCardSeenIds.add(rowId)
      }
      setReady(true)
    })
    return () => {
      cancelled = true
      cleanup()
    }
  }, [ready, rowId, normalizedBase, normalizedOrder])
  return ready
}

function enqueueTesterGridCardReveal(priorityBase: number, priorityOrder: number, run: () => void): () => void {
  if (typeof window === 'undefined') {
    run()
    return () => {}
  }
  const task: TesterGridCardRevealTask = {
    priorityBase,
    priorityOrder,
    run,
  }
  testerGridCardRevealQueue.push(task)
  testerGridCardRevealQueueDirty = true
  scheduleTesterGridCardRevealFlush()
  return () => {
    const idx = testerGridCardRevealQueue.indexOf(task)
    if (idx >= 0) {
      testerGridCardRevealQueue.splice(idx, 1)
    }
  }
}

function scheduleTesterGridCardRevealFlush() {
  if (testerGridCardRevealScheduled) return
  if (typeof window === 'undefined') {
    flushTesterGridCardRevealQueue()
    return
  }
  testerGridCardRevealScheduled = true
  const scheduleFrame: (cb: FrameRequestCallback) => number = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : (cb) => window.setTimeout(
      () => cb(typeof performance !== 'undefined' ? performance.now() : Date.now()),
      GRID_CARD_SKELETON_FRAME_DELAY_MS,
    )
  scheduleFrame(() => {
    testerGridCardRevealScheduled = false
    flushTesterGridCardRevealQueue()
  })
}

function flushTesterGridCardRevealQueue() {
  if (!testerGridCardRevealQueue.length) return
  if (testerGridCardRevealQueueDirty) {
    testerGridCardRevealQueue.sort((a, b) => {
      if (a.priorityBase !== b.priorityBase) {
        return b.priorityBase - a.priorityBase
      }
      return a.priorityOrder - b.priorityOrder
    })
    testerGridCardRevealQueueDirty = false
  }
  const batch = testerGridCardRevealQueue.splice(0, GRID_CARD_SKELETON_BATCH_SIZE)
  batch.forEach((task) => {
    task.run()
  })
  if (testerGridCardRevealQueue.length) {
    scheduleTesterGridCardRevealFlush()
  }
}

type FactionGroupBuilder = {
  group: TesterGroup
  sets: Map<string, TesterGroup>
}

function groupRowsBySet(rows: readonly TesterPreviewRow[], translate: TranslateFn): TesterGroup[] {
  // Artifact sets form flat accordions, while accessories nest faction->set accordions for readability.
  const artifactGroups = new Map<string, TesterGroup>()
  const factionGroups = new Map<string, FactionGroupBuilder>()

  rows.forEach((row, index) => {
    const artifact = row.artifact
    const slot = artifact.slot as ArtifactTypeId
    const rawSetId = Number(artifact.set)
    const setId = Number.isFinite(rawSetId) ? rawSetId : 0
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
      const accessoryHasNoSet = setId === 0 || setId === ACCESSORY_NO_SET_ID
      const setLabel = accessoryHasNoSet ? '' : formatTesterSetLabel({ setId, slot, translate })
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
  // Card height is deterministic so TanStack can predict row heights without sampling.
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
  // Both columns feed into card height + virtualization, so we translate theme typography to raw px once.
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
  // Layout metrics re-run only on breakpoint or toggle changes so the cards stay stable across renders.
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

const STAR_LABEL_KEYS: readonly ['star1', 'star2', 'star3', 'star4', 'star5', 'star6'] = [
  'star1',
  'star2',
  'star3',
  'star4',
  'star5',
  'star6',
] as const

function formatTesterRankLabel(rank: number | null | undefined, translate: TranslateFn): string {
  if (rank === null || rank === undefined) return ''
  const numeric = Number(rank)
  if (!Number.isFinite(numeric)) return ''
  const clamped = Math.max(1, Math.min(6, Math.round(numeric)))
  return translate(STAR_LABEL_KEYS[clamped - 1] ?? 'star1')
}

function formatTesterRarityLabel(rarity: number | null | undefined, translate: TranslateFn): string {
  if (rarity === null || rarity === undefined) return ''
  const numeric = Number(rarity)
  if (!Number.isFinite(numeric)) return ''
  const clamped = Math.max(1, Math.min(6, Math.round(numeric))) as 1 | 2 | 3 | 4 | 5 | 6
  switch (clamped) {
    case 1: return translate('rarityCommon')
    case 2: return translate('rarityUncommon')
    case 3: return translate('rarityRare')
    case 4: return translate('rarityEpic')
    case 5: return translate('rarityLegendary')
    case 6: default: return translate('rarityMythical')
  }
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
  // Every tester card row shares the same height once the column count + match-row toggles are known, so we can estimate
  // accordion size with deterministic math instead of sampling DOM nodes.
  const header = ESTIMATED_ACCORDION_HEADER_PX
  const marginBottom = depth === 0 ? accordionSpacingPx : 0
  const collapsed = collapsedGroups.has(group.key)
  if (collapsed) return header + marginBottom
  if (group.children && group.children.length > 0) {
    let childHeights = 0
    for (const child of group.children) {
      childHeights += estimateGroupHeight(
        child,
        collapsedGroups,
        columnCount,
        accordionSpacingPx,
        gridGapPx,
        leafPaddingPx,
        cardHeightPx,
        depth + 1,
      )
    }
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
