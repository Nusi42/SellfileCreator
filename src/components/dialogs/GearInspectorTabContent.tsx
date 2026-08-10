/**
 * GearInspectorTabContent
 *
 * Gear dialog body: virtualized editor for Gear Inspector items that mirrors the Builder
 * controls (spinners, metasets, attention cues) while producing the queue that
 * feeds the Gear Inspector preview grid on the main screen.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { JSX, ReactNode, UIEvent, Dispatch, SetStateAction, MouseEvent } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Select, Stack, Typography, Chip, TextField, ListSubheader, keyframes } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlined'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutlined'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen'
import DeleteIcon from '@mui/icons-material/Delete'
import type { BuilderRecipe } from '../../lib/hsfBuilder'
import type { ArtifactSetId, ArtifactTypeId, FactionId, LevelMilestone } from '../../lib/types'
import { ArtifactType, /* rarityCodeToName, */ formatLevel, slotSupportsSub, slotSupportsMain, ALLOWED_MAIN_BY_SLOT, Faction, factionI18nKey, filterAndSortSetEntries, artifactTypeI18nKey, artifactSetName, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, statVariantI18nKey, StatId, LEVEL_MILESTONES, STAT_VARIANTS_PRIORITY, ANOMALOUS_SUBSTAT_VARIANTS, getLocalizedGearSetName } from '../../lib/types'
// MarkdownTooltip keeps all dialog hints (add/delete toggles, source glyphs, copy buttons) consistent with global styling.
import MarkdownTooltip from '../MarkdownTooltip'
import { allowedGearInspectorSetIds, isAccessorySlot, normalizeGearInspectorSetForSlot } from '../../lib/gearInspectorDomain'
import { formatGearInspectorSetLabel } from '../../lib/gearInspectorFormatters'
import { variantToSub, variantToMain } from '../../lib/hsfTypes'
import { artifactTypeIconList } from '../artifactTypeIcons'
import type { GearInspectorItemPreviewExtras } from '../../lib/ruleEval'
import type { NormalizedStat } from '../../lib/importers/gearDbNormalizer'
import { useI18n } from '../../lib/i18n'
import { useGearSetCatalogVersion } from '../../hooks/useGearSetCatalogVersion'
import { useAppState } from '../../state/appState'
import SetMenuSection from '../SetMenuSection'
import { SetIcon } from '../SetIcon'
import { FactionIcon } from '../FactionIcon'
import SetsOrderControls from '../SetsOrderControls'
import { NumberSpinnerAdornment, HIDE_NATIVE_NUMBER_SPINNER_SX } from '../NumberSpinnerAdornment'
import { SETS_MENU_WIDTH_PX, MENU_MAX_HEIGHT_SETS_LIST_PX, MENU_MAX_HEIGHT_EXTRA_BUFFER, MENU_SCROLL_GUTTER_PX, MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, LIST_SUBHEADER_SX, GEAR_INSPECTOR_SUBSTAT_EDITOR_WIDTH_PX, GEAR_INSPECTOR_ROW_CONTROLS_WIDTH_PX, ACCESSORY_NO_SET_ID, GEAR_INSPECTOR_ANY_SLOT_ID, GEAR_INSPECTOR_MAINSTAT_SELECT_MIN_WIDTH_PX, GEAR_INSPECTOR_SUBSTAT_SELECT_MIN_WIDTH_PX, GEAR_INSPECTOR_SLOT_SELECT_WIDTH_PX, GEAR_INSPECTOR_SET_SELECT_WIDTH_PX, GEAR_INSPECTOR_FACTION_SELECT_WIDTH_PX, GEAR_INSPECTOR_RANK_SELECT_WIDTH_PX, GEAR_INSPECTOR_RARITY_SELECT_WIDTH_PX, GEAR_INSPECTOR_LEVEL_SELECT_WIDTH_PX, GEAR_INSPECTOR_SELECT_HEIGHT_PX, GEAR_INSPECTOR_RESULT_ROW_MIN_HEIGHT_PX, GEAR_INSPECTOR_RECIPE_CHIP_MAX_WIDTH_PX, GEAR_INSPECTOR_VIRTUAL_OVERSCAN_PX, GEAR_INSPECTOR_ROW_ESTIMATE_COMPACT_PX, GEAR_INSPECTOR_ROW_ESTIMATE_EXPANDED_PX, GEAR_INSPECTOR_COMPACT_ICON_SIZE_PX, RSL_HELPER_CONFIG_PATH, FONT_FAMILY_MONO } from '../../lib/constants'
import { reserveScrollbarGutterSpace } from '../../lib/scrollbar'
import { useDisplayPreferences } from '../../state/preferencesState'
import { useColorScheme, useTheme, type Theme } from '@mui/material/styles'
import { adaptSubstatFgOnSurface, resolveSchemePaper, schemeModeFromColorScheme } from '../../lib/themeCustomTokens'
import type { SystemStyleObject } from '@mui/system'
import {
  createGearInspectorMath,
  entriesInOrder,
  isManualGearInspectorItem,
  mainOptionsForSlot,
  gearInspectorSourceCategoryForItem,
  type GearInspectorItem,
  type GearInspectorSourceCategory,
} from '../../lib/gearInspectorSession'
import type { GearInspectorPreviewMatch } from '../../types/gearInspectorPreview'
import { GearInspectorSummaryLabel } from '../GearInspectorSummaryLabel'
import { RarityLabel } from '../RarityLabel'
import { GearInspectorRuleReferenceChip } from '../GearInspectorRuleReferenceChip'
import GridIconBox, { GRID_ICON_BOX_SIZE_PX } from '../GridIconBox'
import EllipsisTooltip from '../EllipsisTooltip'
import { triggerCopyDialog, writeTextSafe } from '../../lib/clipboard'
import { CONTEXT_HINT_IDS } from '../../hooks/contextMenuHintIds'
import { useContextMenuButtonHint } from '../../hooks/useContextMenuButtonHint'
import { GearFactionSelect, GearMainStatSelect, GearRankSelect, GearRaritySelect, GearSlotSelect } from '../gear'
import { EmptyStateMessage, type EmptyStateMessageProps } from '../EmptyStateMessage'

type GearInspectorSourceCountMap = Record<GearInspectorSourceCategory, number>

export type GearInspectorTabLayoutSlots = {
  content: ReactNode
  actions: ReactNode
}

export type GearInspectorTabContentProps = {
  customRecipes: BuilderRecipe[]
  onView: (ruleIndex: number, recipeIdx: number | null) => void
  substatColors: Record<number, { fg: string; bg: string }>
  gearInspectorItems: GearInspectorItem[]
  setGearInspectorItems: Dispatch<SetStateAction<GearInspectorItem[]>>
  allocGearInspectorItemId: () => number
  gearInspectorMatches: ReadonlyMap<number, GearInspectorPreviewMatch | null>
  isActive?: boolean
  // Empty-state messaging should match the main preview pane: stacked layout anchors to the top edge,
  // while side-by-side layout centers within the available space.
  emptyStateVerticalAlign?: EmptyStateMessageProps['verticalAlign']
  onRequestClose?: () => void
  renderLayout?: (slots: GearInspectorTabLayoutSlots) => ReactNode
}

// Single grid template keeps the first two rows of controls perfectly aligned.
const GEAR_INSPECTOR_CONTROL_GRID_TEMPLATE = `${GEAR_INSPECTOR_SLOT_SELECT_WIDTH_PX}px ${GEAR_INSPECTOR_RANK_SELECT_WIDTH_PX}px ${GEAR_INSPECTOR_RARITY_SELECT_WIDTH_PX}px ${GEAR_INSPECTOR_MAINSTAT_SELECT_MIN_WIDTH_PX}px`
const GEAR_INSPECTOR_SELECT_GAP_DEFAULT_PX = 8
const GEAR_INSPECTOR_SELECT_GAP_COMPACT_PX = 6
const GEAR_INSPECTOR_ICON_COLUMN_WIDTH_PX = GRID_ICON_BOX_SIZE_PX + 16

const GEAR_INSPECTOR_SELECT_VALUE_BASE_SX: SystemStyleObject<Theme> = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: GEAR_INSPECTOR_SELECT_HEIGHT_PX,
  height: GEAR_INSPECTOR_SELECT_HEIGHT_PX,
  lineHeight: `${GEAR_INSPECTOR_SELECT_HEIGHT_PX}px`,
  columnGap: GEAR_INSPECTOR_SELECT_GAP_DEFAULT_PX,
  paddingTop: '0 !important',
  paddingBottom: '0 !important',
  transition: 'none !important',
  alignSelf: 'center',
}

// Cookie Monster easter egg tuning: 10 toggles within a 10s window activates a 4.5s animation.
const GEAR_INSPECTOR_COOKIE_TOGGLE_THRESHOLD = 10
const GEAR_INSPECTOR_COOKIE_WINDOW_MS = 10_000
const GEAR_INSPECTOR_COOKIE_ANIMATION_MS = 4_500

const GEAR_INSPECTOR_COOKIE_HALO_DIAMETER_PX = 96

const gearInspectorCookiePulse = keyframes`
  0% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.75; }
  40% { transform: translate(-50%, -50%) scale(1.08); opacity: 1; }
  70% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.85; }
  100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.75; }
`

const gearInspectorCookieIconWobble = keyframes`
  0% { transform: rotate(0deg); }
  20% { transform: rotate(16deg); }
  45% { transform: rotate(-18deg); }
  65% { transform: rotate(11deg); }
  85% { transform: rotate(-9deg); }
  100% { transform: rotate(0deg); }
`

const gearInspectorCookieFlip = keyframes`
  0% { transform: rotate(0deg); }
  50% { transform: rotate(90deg); }
  100% { transform: rotate(0deg); }
`

// Speech bubble pops in, bounces slightly, then stays visible.
const gearInspectorCookieSpeechIn = keyframes`
  0%   { opacity: 0; transform: translateY(6px) scale(0.82); }
  60%  { opacity: 1; transform: translateY(-2px) scale(1.05); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
`

// cloneNormalizedStat ensures duplicate rows never mutate the original stat metadata.
const cloneNormalizedStat = (stat?: NormalizedStat | null): NormalizedStat | null => {
  if (!stat) return stat ?? null
  return { ...stat }
}

// cloneGearInspectorPreviewExtras copies nested preview payloads so “duplicate” rows stay isolated.
const cloneGearInspectorPreviewExtras = (extras: GearInspectorItemPreviewExtras): GearInspectorItemPreviewExtras => {
  const { substats, mainStat, ascension, ...rest } = extras
  const next: GearInspectorItemPreviewExtras = {
    ...rest,
    mainStat: cloneNormalizedStat(mainStat),
    ascension: cloneNormalizedStat(ascension),
  }
  if (substats) {
    next.substats = substats.map((entry: NormalizedStat) => ({ ...entry }))
  }
  return next
}

// cloneManualGearInspectorItem reuses the preview clones and assigns a brand-new item id.
const cloneManualGearInspectorItem = (
  item: GearInspectorItem,
  allocItemId: () => number,
): GearInspectorItem => {
  const { subValues, subOrder, previewExtras, itemId: _ignored, ...rest } = item
  const next: GearInspectorItem = {
    ...rest,
    itemId: allocItemId(),
  }
  if (subValues) {
    next.subValues = { ...subValues }
  }
  if (subOrder) {
    next.subOrder = [...subOrder]
  }
  if (previewExtras) {
    // A duplicate is a NEW, distinct piece — it must NOT inherit the source's identity.
    // previewExtras.id is the highest-precedence safeguard item-key (it outranks itemId),
    // so copying it made every clone resolve to the SAME item-key: the weight-flyout rows
    // collapsed onto one piece's substats and lost their tooltip. Drop the id (and the
    // equipped-champion link, which is likewise identity, not shape) so the clone is keyed
    // by its freshly-allocated itemId instead.
    const { id: _droppedId, equippedChampion: _droppedChampion, ...previewRest } = cloneGearInspectorPreviewExtras(previewExtras)
    next.previewExtras = previewRest
  }
  return next
}

const ACCESSORY_FACTION_POOL: readonly FactionId[] = Object.freeze([
  Faction.BannerLords,
  Faction.HighElves,
  Faction.SacredOrder,
  Faction.Barbarians,
  Faction.OgrynTribes,
  Faction.Lizardmen,
  Faction.Skinwalkers,
  Faction.Orcs,
  Faction.Demonspawn,
  Faction.UndeadHordes,
  Faction.DarkElves,
  Faction.KnightRevenant,
  Faction.Dwarves,
  Faction.Shadowkin,
  Faction.SylvanWatchers,
])

const pickRandomAccessoryFaction = (): FactionId => {
  if (ACCESSORY_FACTION_POOL.length === 0) return Faction.BannerLords as FactionId
  const idx = Math.floor(Math.random() * ACCESSORY_FACTION_POOL.length)
  return ACCESSORY_FACTION_POOL[Math.max(0, Math.min(idx, ACCESSORY_FACTION_POOL.length - 1))] ?? Faction.BannerLords
}

export function GearInspectorTabContent({
  customRecipes,
  onView,
  substatColors,
  gearInspectorItems,
  setGearInspectorItems,
  allocGearInspectorItemId,
  gearInspectorMatches,
  isActive = true,
  emptyStateVerticalAlign = 'center',
  onRequestClose,
  renderLayout,
}: GearInspectorTabContentProps) {
  const { t, lang } = useI18n()
  const { colorScheme } = useColorScheme()
  const theme = useTheme()
  // Active-scheme paper for substat text contrast (theme.palette.* is frozen to light).
  const substatSurfacePaper = resolveSchemePaper(theme, schemeModeFromColorScheme(colorScheme))
  useGearSetCatalogVersion()
  const { substatTargets, metasets } = useAppState()
  const { showFactionIcons, statColorScope } = useDisplayPreferences()
  // TEXT scope colours card summaries; CONTROL scope colours the stat selects/menus.
  const colorStatTexts = statColorScope === 'text' || statColorScope === 'everything'
  const colorStatControls = statColorScope === 'controls' || statColorScope === 'everything'
  const gearInspectorMath = useMemo(() => createGearInspectorMath(substatTargets), [substatTargets])
  const {
    adjustSubValuesFor,
    makeDefaultItem,
  } = gearInspectorMath
  const subEqualsMainVariant = useCallback((subV: number, mainV?: number): boolean => {
    if (mainV == null || Number(mainV) === StatId.Any) return false
    const sub = variantToSub(subV)
    const main = variantToMain(mainV)
    if (main.id === StatId.Any) return false
    if (main.id === StatId.HP || main.id === StatId.ATK || main.id === StatId.DEF) {
      if (main.f === undefined) return false
      return sub.id === main.id && Boolean(sub.isFlat) === (main.f === 1)
    }
    return sub.id === main.id
  }, [])

  type GearInspectorItemLocal = GearInspectorItem
  const setItems = setGearInspectorItems
  const sourceCounts = useMemo<GearInspectorSourceCountMap>(() => {
    const counts: GearInspectorSourceCountMap = {
      manual: 0,
      inventory: 0,
      collection: 0,
      vault: 0,
      inbox: 0,
    }
    gearInspectorItems.forEach((item) => {
      const category = gearInspectorSourceCategoryForItem(item)
      counts[category] += 1
    })
    return counts
  }, [gearInspectorItems])
  const compactHint = useContextMenuButtonHint(CONTEXT_HINT_IDS.gearInspectorCompact, { text: t('contextMenuHint') })
  const manualEntries = useMemo(() => (
    gearInspectorItems
      .filter((item) => gearInspectorSourceCategoryForItem(item) === 'manual')
      .map((item) => ({ item }))
  ), [gearInspectorItems])
  const items = useMemo(() => manualEntries.map((entry) => entry.item), [manualEntries])
  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])
  const toggleHistoryRef = useRef<Map<number, number[]>>(new Map())
  const cookieTimeoutRef = useRef<Map<number, ReturnType<typeof window.setTimeout>>>(new Map())
  // Tracks the DOM element of each row's controls column so the portal halo can be positioned via getBoundingClientRect.
  const cookieControlsMapRef = useRef<Map<number, HTMLElement>>(new Map())
  const [cookieMonsterExpiryByRow, setCookieMonsterExpiryByRow] = useState<Record<number, number>>({})
  const [compactByItemId, setCompactByItemId] = useState<Map<number, boolean>>(() => new Map())

  // substatStepHoverKey tracks when a +/- button is hovered so we can mirror the input’s hover outline.
  // Why: the +/- buttons otherwise feel visually detached from the numeric field they modify.
  const [substatStepHoverKey, setSubstatStepHoverKey] = useState<string | null>(null)
  // substatStepHoverClearTimeoutRef avoids flicker when moving between - and + quickly.
  const substatStepHoverClearTimeoutRef = useRef<number | null>(null)
  const cancelSubstatStepHoverClear = useCallback(() => {
    if (substatStepHoverClearTimeoutRef.current == null) return
    window.clearTimeout(substatStepHoverClearTimeoutRef.current)
    substatStepHoverClearTimeoutRef.current = null
  }, [])
  const scheduleSubstatStepHoverClear = useCallback((key: string) => {
    cancelSubstatStepHoverClear()
    substatStepHoverClearTimeoutRef.current = window.setTimeout(() => {
      setSubstatStepHoverKey((current) => (current === key ? null : current))
      substatStepHoverClearTimeoutRef.current = null
    }, 20)
  }, [cancelSubstatStepHoverClear])

  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  // Stored via useState (not useRef) because the useMemo below reads the map during render
  // and the React Compiler cannot track ref mutations for re-render scheduling.
  const [measuredHeightsMap] = useState<Map<number, number>>(() => new Map())
  const [rowHeightsVersion, setRowHeightsVersion] = useState(0)
  const estimateRowHeight = useCallback((isCompact: boolean): number => (
    isCompact ? GEAR_INSPECTOR_ROW_ESTIMATE_COMPACT_PX : GEAR_INSPECTOR_ROW_ESTIMATE_EXPANDED_PX
  ), [])
  const isItemCompact = useCallback((item: GearInspectorItemLocal): boolean => {
    const itemId = Number(item.itemId)
    if (Number.isFinite(itemId) && compactByItemId.has(itemId)) {
      return compactByItemId.get(itemId)!
    }
    return Boolean((item as { compact?: boolean }).compact)
  }, [compactByItemId])
  // Local Sets menu state to mirror Filters/Builder
  const [setsOrder, setSetsOrder] = useState<'game' | 'az' | 'icons'>('icons')
  const [setsSearch, setSetsSearch] = useState('')
  const [setsMenuAnchorPos, setSetsMenuAnchorPos] = useState<{ top: number; left: number } | null>(null)
  const [setsMenuOpenIdx, setSetsMenuOpenIdx] = useState<number | null>(null)
  const setsMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const setsMenuListRefsRef = useRef<Record<number, HTMLUListElement | null>>({})
  const [pendingDeleteSource, setPendingDeleteSource] = useState<GearInspectorSourceCategory | null>(null)
  const gearDialogIntroText = t('gearDialogIntro')
  const gearDialogIntroPathIndex = gearDialogIntroText.indexOf(RSL_HELPER_CONFIG_PATH)
  const gearDialogIntroHasPath = gearDialogIntroPathIndex >= 0
  const gearDialogIntroPrefix = gearDialogIntroHasPath ? gearDialogIntroText.slice(0, gearDialogIntroPathIndex) : gearDialogIntroText
  const gearDialogIntroSuffix = gearDialogIntroHasPath ? gearDialogIntroText.slice(gearDialogIntroPathIndex + RSL_HELPER_CONFIG_PATH.length) : ''
  const copyGearDbPathLabel = t('rowMenuCopy')
  const handleCopyGearDbPath = useCallback(async () => {
    const ok = await writeTextSafe(RSL_HELPER_CONFIG_PATH)
    if (!ok) triggerCopyDialog(RSL_HELPER_CONFIG_PATH)
  }, [])
  // Faction options are grouped like Builder/Filters; precomputed flat list no longer used here.
  // Keeping the grouped structure inline for clarity in the Gear Inspector.

  // Ref-based setters so the ResizeObserver callback avoids the set-state-in-effect lint rule.
  const setViewportHeightRef = useRef(setViewportHeight)
  useEffect(() => { setViewportHeightRef.current = setViewportHeight }, [setViewportHeight])
  const setScrollTopRef = useRef(setScrollTop)
  useEffect(() => { setScrollTopRef.current = setScrollTop }, [setScrollTop])
  // Observe the Gear Inspector scroll container for resize events.
  // Re-runs when `isActive` changes so we re-measure after the tab becomes visible
  // (replaces the previous separate effect + prevIsActive pattern).
  useEffect(() => {
    const node = scrollContainerRef.current
    if (!node) return
    const observer = new ResizeObserver(() => {
      setViewportHeightRef.current(node.clientHeight)
    })
    observer.observe(node)
    // Initial measurement (covers both mount and isActive transitions).
    setViewportHeightRef.current(node.clientHeight)
    setScrollTopRef.current(node.scrollTop)
    return () => {
      observer.disconnect()
    }
  }, [isActive])

  // Clear per-row timers and toggle history when the dialog unmounts to avoid leaking animation timeouts across sessions.
  useEffect(() => () => {
    cookieTimeoutRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId)
    })
    cookieTimeoutRef.current.clear()
    toggleHistoryRef.current.clear()
  }, [])

  // Drop active portal overlays immediately when the dialog hides so the fixed-position elements
  // don't linger over the page while the dialog fade-out transition is still running.
  useEffect(() => {
    if (isActive) return
    cookieTimeoutRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    cookieTimeoutRef.current.clear()
    toggleHistoryRef.current.clear()
    // Coupled to clearTimeout above — the derived-state pattern cannot cancel timers, so useEffect is correct here.
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change, @eslint-react/set-state-in-effect, react-hooks/set-state-in-effect
    setCookieMonsterExpiryByRow({})
  }, [isActive])

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop)
  }, [])

  const registerRowHeight = useCallback((itemId: number, height: number) => {
    if (!Number.isFinite(height)) return
    const nextHeight = Math.max(1, Math.round(height))
    const map = measuredHeightsMap
    const prev = map.get(itemId)
    if (prev === nextHeight) return
    map.set(itemId, nextHeight)
    setRowHeightsVersion((v) => v + 1)
  }, [measuredHeightsMap])
  const scrollGearInspectorSetsMenuToSelected = useCallback((itemIdx: number, orderOverride?: 'game' | 'az' | 'icons', opts?: { force?: boolean }) => {
    if (!opts?.force && setsMenuOpenIdx !== itemIdx) return
    const order = orderOverride ?? setsOrder
    if (order === 'icons') return
    const list = setsMenuListRefsRef.current[itemIdx]
    if (!list) return
    const item = items[itemIdx]
    if (!item) return
    const setIdNumber = Number(item.set ?? 0)
    if (!Number.isFinite(setIdNumber) || setIdNumber === 0) return
    const validIds = new Set<number>(allowedGearInspectorSetIds(item.slot))
    const sortedForOrder = filterAndSortSetEntries(setsSearch, order, {
      translate: t,
      // Allow the accessory no-set sentinel in the Gear Inspector dropdown.
      includeNoSet: true,
      noSetLabel: t('noSetAccessories'),
    }).filter(([id]) => validIds.has(Number(id)))
    const hasTarget = sortedForOrder.some(([id]) => Number(id) === setIdNumber)
    if (!hasTarget) return
    requestAnimationFrame(() => {
      const node = list.querySelector<HTMLElement>(`[data-set-id="${setIdNumber}"]`)
      node?.scrollIntoView({ block: 'nearest' })
    })
  }, [items, setsMenuListRefsRef, setsMenuOpenIdx, setsOrder, setsSearch, t])

  const { rowOffsets, rowHeights, totalContentHeight } = useMemo(() => {
    void rowHeightsVersion
    const map = measuredHeightsMap
    const activeRowIds = new Set<number>(items.map((it) => it.itemId))
    for (const key of Array.from(map.keys())) {
      if (!activeRowIds.has(key)) map.delete(key)
    }
    const offsets: number[] = []
    const heights: number[] = []
    let total = 0
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] as GearInspectorItemLocal
      offsets.push(total)
      const measured = map.get(item.itemId)
      const compact = isItemCompact(item)
      const resolved = typeof measured === 'number' && measured > 0
        ? measured
        : estimateRowHeight(compact)
      heights.push(resolved)
      total += resolved
    }
    return { rowOffsets: offsets, rowHeights: heights, totalContentHeight: total }
  }, [items, estimateRowHeight, measuredHeightsMap, rowHeightsVersion, isItemCompact])

  const visibleIndices = (() => {
    if (items.length === 0) return []
    const fallbackViewport = viewportHeight > 0
      ? viewportHeight
      : GEAR_INSPECTOR_ROW_ESTIMATE_COMPACT_PX * 4
    const overscan = Math.max(GEAR_INSPECTOR_VIRTUAL_OVERSCAN_PX, GEAR_INSPECTOR_ROW_ESTIMATE_EXPANDED_PX)
    const minY = Math.max(0, scrollTop - overscan)
    const maxY = Math.min(totalContentHeight, scrollTop + fallbackViewport + overscan)
    let start = 0
    while (start < items.length) {
      const offset = rowOffsets[start]
      const height = rowHeights[start]
      if (offset == null || height == null) break
      if ((offset + height) > minY) break
      start += 1
    }
    let end = start
    while (end < items.length) {
      const offset = rowOffsets[end]
      if (offset == null) break
      if (offset >= maxY) break
      end += 1
    }
    const indices: number[] = []
    for (let i = start; i < end; i += 1) {
      indices.push(i)
    }
    if (indices.length === 0 && items.length > 0) {
      indices.push(Math.min(start, items.length - 1))
      const extra = Math.min(items.length, start + 4)
      for (let i = start + 1; i < extra; i += 1) {
        indices.push(i)
      }
    }
    return indices
  })()

  const topSpacerHeight = useMemo(() => {
    if (visibleIndices.length === 0) return 0
    const first = visibleIndices[0]
    if (first == null) return 0
    if (first >= rowOffsets.length) return 0
    const offset = rowOffsets[first]
    return typeof offset === 'number' ? offset : 0
  }, [rowOffsets, visibleIndices])

  const bottomSpacerHeight = useMemo(() => {
    if (visibleIndices.length === 0) return Math.max(0, totalContentHeight)
    const last = visibleIndices[visibleIndices.length - 1]
    if (last == null) return Math.max(0, totalContentHeight)
    const offset = rowOffsets[last] ?? 0
    const item = items[last]!
    const height = rowHeights[last] ?? estimateRowHeight(isItemCompact(item))
    const consumed = offset + height
    return Math.max(0, totalContentHeight - consumed)
  }, [estimateRowHeight, items, totalContentHeight, rowHeights, rowOffsets, visibleIndices, isItemCompact])

  const rankLabel = useCallback((n: number): string => {
    type StarKey = 'star1' | 'star2' | 'star3' | 'star4' | 'star5' | 'star6'
    const starKey = (s: number): StarKey => {
      switch (s) {
        case 1: return 'star1'
        case 2: return 'star2'
        case 3: return 'star3'
        case 4: return 'star4'
        case 5: return 'star5'
        case 6: return 'star6'
        default: return 'star1'
      }
    }
    return t(starKey(Math.max(1, Math.min(6, Number(n)))))
  }, [t])


  const compactColumnTemplate = 'max-content max-content max-content minmax(0, 1fr)'

  const pruneEasterEggStateForItems = useCallback((nextItems: GearInspectorItemLocal[]) => {
    const activeRowIds = new Set(nextItems.map((item) => item.itemId))
    const history = toggleHistoryRef.current
    for (const key of Array.from(history.keys())) {
      if (!activeRowIds.has(key)) {
        history.delete(key)
      }
    }
    for (const [itemId, timeoutId] of Array.from(cookieTimeoutRef.current.entries())) {
      if (!activeRowIds.has(itemId)) {
        window.clearTimeout(timeoutId)
        cookieTimeoutRef.current.delete(itemId)
      }
    }
    setCookieMonsterExpiryByRow((prev) => {
      let changed = false
      const next: Record<number, number> = {}
      for (const [key, expiry] of Object.entries(prev)) {
        const numericKey = Number(key)
        if (activeRowIds.has(numericKey)) {
          next[numericKey] = expiry
        } else {
          changed = true
        }
      }
      return changed ? next : prev
    })
    setCompactByItemId((prev) => {
      let changed = false
      const next = new Map(prev)
      for (const key of Array.from(next.keys())) {
        if (!activeRowIds.has(key)) {
          next.delete(key)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [setCompactByItemId])

  const updateItemAt = useCallback((index: number, updater: (item: GearInspectorItemLocal) => GearInspectorItemLocal) => {
    const target = manualEntries[index]
    if (!target) return
    const itemId = target.item.itemId
    setItems((prev) => {
      const targetIdx = prev.findIndex((entry) => entry.itemId === itemId)
      if (targetIdx === -1) return prev
      const next = prev.slice()
      next[targetIdx] = updater(next[targetIdx]!)
      pruneEasterEggStateForItems(next)
      return next
    })
  }, [manualEntries, pruneEasterEggStateForItems, setItems])

  // duplicateItemAt clones the current manual row so + mirrors the exact gear snapshot.
  const duplicateItemAt = useCallback((index: number) => {
    const anchor = manualEntries[index]
    if (!anchor) return
    const duplicate = cloneManualGearInspectorItem(anchor.item, allocGearInspectorItemId)
    setItems((prev) => {
      // Insert immediately after the source row to keep surrounding context intact.
      const anchorIdx = prev.findIndex((entry) => entry.itemId === anchor.item.itemId)
      const insertIdx = anchorIdx === -1 ? prev.length : anchorIdx + 1
      const next = prev.slice()
      next.splice(insertIdx, 0, duplicate)
      pruneEasterEggStateForItems(next)
      return next
    })
  }, [allocGearInspectorItemId, manualEntries, pruneEasterEggStateForItems, setItems])

  const deleteItemAt = useCallback((index: number) => {
    const target = manualEntries[index]
    if (!target) return
    const itemId = target.item.itemId
    setItems((prev) => {
      const next = prev.filter((entry) => entry.itemId !== itemId)
      if (next.length === prev.length) return prev
      pruneEasterEggStateForItems(next)
      return next
    })
  }, [manualEntries, pruneEasterEggStateForItems, setItems])

  const handleAddManualGear = useCallback(() => {
    // Build the new item (which allocates its id) OUTSIDE the state updater. The updater
    // must stay pure: makeDefaultItem calls the side-effecting id allocator (and random
    // rolls), so invoking it inside setItems made StrictMode's double-render consume two
    // ids (and roll two different items) per click — matching duplicateItemAt's pattern.
    const newItem = makeDefaultItem(allocGearInspectorItemId)
    setItems((prev) => {
      const next = prev.concat(newItem)
      pruneEasterEggStateForItems(next)
      return next
    })
	    requestAnimationFrame(() => {
	      const node = scrollContainerRef.current
	      if (node) {
	        // Smoothly reveal the newly appended manual entry.
	        // Why: this is a short scroll within a small list and improves perceived continuity.
	        node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
	      }
	    })
	  }, [allocGearInspectorItemId, makeDefaultItem, pruneEasterEggStateForItems, setItems])

  const deletableSources = useMemo(() => ([
    { key: 'manual' as const, label: t('gearInspectorSourceManual') },
    { key: 'inventory' as const, label: t('gearInspectorSourceInventory') },
    { key: 'collection' as const, label: t('gearInspectorSourceEquippedCollection') },
    { key: 'vault' as const, label: t('gearInspectorSourceEquippedVault') },
    { key: 'inbox' as const, label: t('gearInspectorSourceInbox') },
  ]), [t])

  const pendingDeleteMeta = useMemo(() => {
    if (!pendingDeleteSource) return null
    const section = deletableSources.find((entry) => entry.key === pendingDeleteSource)
    if (!section) return null
    return {
      key: pendingDeleteSource,
      label: section.label,
      count: sourceCounts[pendingDeleteSource] ?? 0,
    }
  }, [pendingDeleteSource, deletableSources, sourceCounts])

  const handleDeleteBySource = useCallback((category: GearInspectorSourceCategory) => {
    setItems((prev) => {
      const next = prev.filter((entry) => gearInspectorSourceCategoryForItem(entry) !== category)
      if (next.length === prev.length) return prev
      pruneEasterEggStateForItems(next)
      return next
    })
  }, [pruneEasterEggStateForItems, setItems])

  // Track compact toggles per row; hitting the threshold triggers the cookie monster halo.
  const registerCompactToggle = useCallback((itemId: number) => {
    const now = Date.now()
    const history = toggleHistoryRef.current
    const existing = history.get(itemId) ?? []
    const recent = existing.filter((ts) => (now - ts) <= GEAR_INSPECTOR_COOKIE_WINDOW_MS)
    recent.push(now)
    history.set(itemId, recent)
    if (recent.length >= GEAR_INSPECTOR_COOKIE_TOGGLE_THRESHOLD) {
      history.set(itemId, [])
      setCookieMonsterExpiryByRow((prev) => ({
        ...prev,
        [itemId]: now + GEAR_INSPECTOR_COOKIE_ANIMATION_MS,
      }))
      const activeTimeout = cookieTimeoutRef.current.get(itemId)
      if (activeTimeout != null) {
        window.clearTimeout(activeTimeout)
      }
      const timeoutId = window.setTimeout(() => {
        setCookieMonsterExpiryByRow((prev) => {
          if (!(itemId in prev)) return prev
          const next = { ...prev }
          delete next[itemId]
          return next
        })
        cookieTimeoutRef.current.delete(itemId)
      }, GEAR_INSPECTOR_COOKIE_ANIMATION_MS)
      cookieTimeoutRef.current.set(itemId, timeoutId)
    }
  }, [])

  const applyGlobalCompactState = useCallback((nextState: boolean) => {
    setCompactByItemId(() => {
      const next = new Map<number, boolean>()
      for (const item of itemsRef.current) {
        const itemId = Number(item.itemId)
        const baseState = Boolean((item as { compact?: boolean })?.compact)
        if (baseState !== nextState) {
          next.set(itemId, nextState)
        }
      }
      return next
    })
  }, [setCompactByItemId])

  const handleToggleCompact = useCallback((
    itemId: number,
    event?: MouseEvent<HTMLButtonElement>,
    options?: { applyGlobally?: boolean },
  ) => {
    const baseState = (() => {
      const item = itemsRef.current.find((entry) => entry.itemId === itemId)
      return Boolean((item as { compact?: boolean })?.compact)
    })()
    const current = compactByItemId.has(itemId) ? compactByItemId.get(itemId)! : baseState
    const nextState = !current
    if (options?.applyGlobally || event?.ctrlKey || event?.metaKey) {
      applyGlobalCompactState(nextState)
      return
    }
    setCompactByItemId((prev) => {
      const next = new Map(prev)
      if (nextState === baseState) {
        next.delete(itemId)
      } else {
        next.set(itemId, nextState)
      }
      return next
    })
    registerCompactToggle(itemId)
  }, [applyGlobalCompactState, compactByItemId, registerCompactToggle])

  const renderGearInspectorRow = (it: GearInspectorItemLocal, idx: number): JSX.Element => {
    const itemId = Number(it.itemId)
    const isCompact = isItemCompact(it)
    const match = Number.isFinite(itemId) ? gearInspectorMatches.get(itemId) ?? null : null
    const recipeIdx = match?.recipeIdx ?? null
    const recipe = (recipeIdx != null ? customRecipes[recipeIdx] : undefined)
    const recipeFactionCode = recipe ? Number((recipe as { factionCode?: number }).factionCode ?? 0) : 0
    const recipeIcon = (showFactionIcons && recipeFactionCode > 0)
      ? <FactionIcon faction={recipeFactionCode as FactionId} size={GEAR_INSPECTOR_COMPACT_ICON_SIZE_PX} sx={{ mr: 0 }} />
      : undefined
    const subEntries = entriesInOrder(it)
    const slotValue = Number(it.slot)
    const slotDef = Number.isFinite(slotValue) ? artifactTypeIconList.find(d => Number(d.id) === slotValue) : undefined
    const SlotIconComponent = slotDef?.Icon
    const slotLabel = slotValue === GEAR_INSPECTOR_ANY_SLOT_ID
      ? t('any')
      : (slotDef ? t(artifactTypeI18nKey(slotDef.id)) : '')
    const accessorySlot = isAccessorySlot(it.slot)
    const allowedSetIdsForSlot = allowedGearInspectorSetIds(it.slot)
    const normalizedSetId = normalizeGearInspectorSetForSlot(it.slot, (it.set ?? ACCESSORY_NO_SET_ID) as ArtifactSetId)
    const setIdNumber = Number(normalizedSetId)
    const setNameCanonical = setIdNumber > 0 ? artifactSetName(setIdNumber) : ''
    // Show set summary for any concrete set id, including the no-set sentinel.
    const showSetChip = Number.isFinite(setIdNumber) && setIdNumber !== 0
    const setLabel = formatGearInspectorSetLabel({ setId: setIdNumber, slot: it.slot, translate: t, lang })
    const setIconNode = Number.isFinite(setIdNumber) && setIdNumber !== 0
      ? <SetIcon setId={setIdNumber} label={setNameCanonical || setLabel} size={GEAR_INSPECTOR_COMPACT_ICON_SIZE_PX} sx={{ mr: 0 }} />
      : null
    const slotIconNode = SlotIconComponent
      ? <SlotIconComponent fontSize="inherit" />
      : null
    const levelBucketLabel = formatLevel(it.level)
    const exactLevelRaw = it.previewExtras?.exactLevel
    const hasExactLevel = typeof exactLevelRaw === 'number' && Number.isFinite(exactLevelRaw)
    const exactLevelLabel = hasExactLevel ? String(Math.max(0, Math.min(16, Math.round(Number(exactLevelRaw))))) : null
    const levelLabel = hasExactLevel
      ? (exactLevelLabel ?? levelBucketLabel)
      : levelBucketLabel
    const manualItem = isManualGearInspectorItem(it)
    const factionValue = Number(it.faction ?? 0)
    const showFactionChip = accessorySlot && factionValue !== 0
    const factionLabel = showFactionChip ? t(factionI18nKey(factionValue)) : ''
    // Compact summary always renders the faction icon so the chip matches the
    // Sellfile Preview regardless of the global icon preference.
    const showFactionIcon = showFactionChip
    const mainValue = Number(it.main ?? -1)
    const mainOptions = mainOptionsForSlot(it.slot, mainValue)
    const mainLabel = mainValue < 0 ? t('any') : t(statVariantI18nKey(mainValue))
    const mainColor = mainValue >= 0 ? adaptSubstatFgOnSurface(substatColors[mainValue]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[mainValue], substatSurfacePaper) : undefined
    const levelChipLabel = levelLabel
      ? (manualItem ? levelLabel : t('gearDialogLevelLabel', { level: levelLabel }))
      : t('any')
    const mainSummaryColor = (colorStatTexts && mainColor) ? mainColor : undefined
    const factionChipLabel = factionLabel
    const factionIconNode = showFactionIcon
      ? <FactionIcon faction={factionValue as FactionId} size={GEAR_INSPECTOR_COMPACT_ICON_SIZE_PX} sx={{ mr: 0 }} />
      : null
    const gridIconBoxNode = (
      <GridIconBox
        setId={setIdNumber as ArtifactSetId}
        slotId={it.slot as ArtifactTypeId}
        factionId={factionValue as FactionId}
        rank={it.rank}
        rarity={it.rarity}
        setLabel={setLabel}
        setTooltipName={setNameCanonical || undefined}
        slotLabel={slotLabel}
        levelLabel={levelChipLabel}
        showRankStarsBackground={false}
      />
    )
    const substatSummaries = subEntries.map(([variant, rawValue]) => {
      const numericValue = Number(rawValue) || 0
      const color = adaptSubstatFgOnSurface(substatColors[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant], substatSurfacePaper)
      return {
        variant,
        label: `${t(statVariantI18nKey(variant))} ${numericValue}`.trim(),
        color,
      }
    })
    const cookieMonsterActive = Object.prototype.hasOwnProperty.call(cookieMonsterExpiryByRow, it.itemId)
    // Suppress the regular tooltip when the cookie-monster speech bubble is already visible.
    const toggleTooltip = cookieMonsterActive ? '' : (isCompact ? t('expanded') : t('compact'))
    const ruleChipNode = (
      <GearInspectorRuleReferenceChip
        match={match}
        onJump={onView}
        showFinalSellLabel
        icon={recipeIcon}
        sx={{
          maxWidth: GEAR_INSPECTOR_RECIPE_CHIP_MAX_WIDTH_PX,
          width: '100%',
          '& .MuiChip-label': {
            whiteSpace: 'nowrap',
          },
          ...(recipeIcon ? {
            pl: 0.5,
            '& .MuiChip-icon': {
              color: 'inherit',
              mr: 0.25,
            },
          } : {}),
        }}
      />
    )
    // Cookie-monster easter egg: portal the halo + speech bubble above the dialog's overflow clipping.
    // Extracted from JSX to avoid an IIFE in JSX expression position (React Compiler limitation).
    const cookiePortal = cookieMonsterActive && typeof document !== 'undefined'
      ? (() => {
          const el = cookieControlsMapRef.current.get(it.itemId)
          if (!el) return null
          const rect = el.getBoundingClientRect()
          const cx = Math.round(rect.left + rect.width / 2)
          const cy = Math.round(rect.top + rect.height / 2)
          const radius = GEAR_INSPECTOR_COOKIE_HALO_DIAMETER_PX / 2
          return createPortal(
            <>
              {/* Blue circle halo — Portal escapes dialog overflow clipping */}
              <Box
                sx={(theme) => ({
                  position: 'fixed',
                  left: cx,
                  top: cy,
                  width: GEAR_INSPECTOR_COOKIE_HALO_DIAMETER_PX,
                  height: GEAR_INSPECTOR_COOKIE_HALO_DIAMETER_PX,
                  borderRadius: '50%',
                  bgcolor: (theme.vars?.palette.primary.main ?? theme.palette.primary.main),
                  opacity: 0.92,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  boxShadow: `0 0 18px ${(theme.vars?.palette.primary.light ?? theme.palette.primary.light)}b0`,
                  animation: `${gearInspectorCookiePulse} 1.5s ease-in-out infinite`,
                  zIndex: theme.zIndex.modal + 50,
                })}
              />
              {/* Face overlay — icon copies above the circle; the originals are opacity:0 but still clickable */}
              <Box
                sx={(theme) => ({
                  position: 'fixed',
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  height: rect.height,
                  pointerEvents: 'none',
                  zIndex: theme.zIndex.modal + 51,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  pt: 0.25,
                })}
              >
                {/* Eyes: add icon (primary) and delete icon (warning) */}
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: '2px' }}>
                  <AddCircleOutlineIcon fontSize="small" sx={{
                    animation: `${gearInspectorCookieIconWobble} 1.15s ease-in-out infinite`,
                    transformOrigin: '50% 50%',
                  }} />
                  <RemoveCircleOutlineIcon fontSize="small" sx={{
                    color: 'warning.main',
                    animation: `${gearInspectorCookieIconWobble} 1.15s ease-in-out infinite`,
                    animationDelay: '0.18s',
                    transformOrigin: '50% 50%',
                  }} />
                </Box>
                {/* Mouth: compact/expand icon */}
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 24, width: '100%' }}>
                  {isCompact
                    ? <OpenInFullIcon fontSize="small" sx={{ animation: `${gearInspectorCookieFlip} 1.2s ease-in-out infinite`, transformOrigin: '50% 50%' }} />
                    : <CloseFullscreenIcon fontSize="small" sx={{ animation: `${gearInspectorCookieFlip} 1.2s ease-in-out infinite`, transformOrigin: '50% 50%' }} />}
                </Box>
              </Box>
              {/* Speech bubble to the upper-right */}
              <Box
                sx={(theme) => ({
                  position: 'fixed',
                  left: cx + radius + 6,
                  top: cy - radius - 4,
                  bgcolor: (theme.vars?.palette.primary.main ?? theme.palette.primary.main),
                  color: (theme.vars?.palette.common.white ?? theme.palette.common.white),
                  borderRadius: '12px',
                  px: 1.5,
                  py: 0.5,
                  fontSize: theme.typography.body2.fontSize,
                  fontWeight: 700,
                  pointerEvents: 'none',
                  letterSpacing: 0.5,
                  boxShadow: theme.shadows[4],
                  animation: `${gearInspectorCookieSpeechIn} 0.4s ease-out forwards`,
                  zIndex: theme.zIndex.modal + 51,
                  whiteSpace: 'nowrap',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    right: '100%',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: '6px solid transparent',
                    borderRightColor: (theme.vars?.palette.primary.main ?? theme.palette.primary.main),
                  },
                })}
              >
                Coookieees!
              </Box>
            </>,
            document.body
          )
        })()
      : null

    // Precompute set-selector state to avoid an IIFE in JSX (React Compiler limitation).
    const validSetIds = new Set<number>(allowedSetIdsForSlot)
    const sortedSetEntries = filterAndSortSetEntries(setsSearch, setsOrder, {
      translate: t,
      // Keep the no-set sentinel visible for accessory slots.
      includeNoSet: true,
      noSetLabel: t('noSetAccessories'),
    }).filter(([id]) => validSetIds.has(Number(id)))
    const setSelectValue = Number.isFinite(setIdNumber) ? String(setIdNumber) : ''
    const setOptionMissing = setSelectValue !== '' && !sortedSetEntries.some(([id]) => id === setSelectValue)
    const currentSetLabel = formatGearInspectorSetLabel({ setId: setIdNumber, slot: it.slot, translate: t, lang })

    return (
      <Box sx={{ borderBottom: theme => `1px solid ${theme.palette.divider}`, pb: 1, display: 'grid', gridTemplateColumns: `${GEAR_INSPECTOR_ROW_CONTROLS_WIDTH_PX}px minmax(0,1fr) ${GEAR_INSPECTOR_ICON_COLUMN_WIDTH_PX}px`, columnGap: 1 }}>
        <Stack
          direction="column"
          spacing={0.5}
          ref={(el: HTMLElement | null) => {
            // Register this row's controls column so the cookie portal can read its viewport position.
            if (el) cookieControlsMapRef.current.set(it.itemId, el)
            else cookieControlsMapRef.current.delete(it.itemId)
          }}
          sx={{
            alignItems: 'stretch',
            mr: 0.5,
            gridColumn: '1',
            gridRow: '1',
            position: 'relative',
            width: GEAR_INSPECTOR_ROW_CONTROLS_WIDTH_PX,
            // Invisible during the animation; the portal face overlay renders the icons above the circle.
            ...(cookieMonsterActive ? { opacity: 0 } : {}),
          }}
        >
          <Stack direction="row" spacing={0.25} sx={{ width: '100%', justifyContent: 'center', alignItems: 'center' }}>
            {/* Button tooltips now flow through MarkdownTooltip so the cookie-monster easter egg and normal hints share formatting. */}
            <MarkdownTooltip markdown={t('gearDialogDuplicateRowAction')}>
              <IconButton size="small" onClick={() => duplicateItemAt(idx)} aria-label={t('gearDialogDuplicateRowAction')} sx={{
                p: 0.25,
                ...(cookieMonsterActive ? {
                  '& svg': {
                    animation: `${gearInspectorCookieIconWobble} 1.15s ease-in-out infinite`,
                    transformOrigin: '50% 50%',
                  },
                } : {}),
              }}>
                <AddCircleOutlineIcon fontSize="small" />
              </IconButton>
            </MarkdownTooltip>
            <MarkdownTooltip markdown={t('delete')}>
              <Box component="span" sx={{ display: 'inline-flex' }}>
                <IconButton
                  size="small"
                  color="warning"
                  onClick={() => deleteItemAt(idx)}
                  aria-label={t('gearDialogRemoveRowAriaLabel')}
                  sx={{
                    p: 0.25,
                    ...(cookieMonsterActive ? {
                      '& svg': {
                        animation: `${gearInspectorCookieIconWobble} 1.15s ease-in-out infinite`,
                        animationDelay: '0.18s',
                        transformOrigin: '50% 50%',
                      },
                    } : {}),
                  }}
                >
                  <RemoveCircleOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            </MarkdownTooltip>
          </Stack>
          <MarkdownTooltip markdown={toggleTooltip}>
            <Button
              aria-label={toggleTooltip}
              size="small"
              variant={isCompact ? 'contained' : 'outlined'}
              color={isCompact ? 'success' : 'warning'}
              sx={{
                height: 24,
                minWidth: 0,
                px: 0.5,
                justifyContent: 'center',
                position: 'relative',
                zIndex: 1,
                width: '100%',
                ...(cookieMonsterActive ? {
                  '& svg': {
                    animation: `${gearInspectorCookieFlip} 1.2s ease-in-out infinite`,
                    transformOrigin: '50% 50%',
                  },
                } : {}),
              }}
              onClick={(event) => handleToggleCompact(it.itemId, event)}
              {...compactHint.triggerProps}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                compactHint.onOpen()
                handleToggleCompact(it.itemId, event, { applyGlobally: true })
              }}
            >
              {isCompact ? <OpenInFullIcon fontSize="small" /> : <CloseFullscreenIcon fontSize="small" />}
            </Button>
          </MarkdownTooltip>
        </Stack>
        {/* Cookie-monster halo + speech bubble portal, computed above the return statement. */}
        {cookiePortal}
        {isCompact ? (
          <Box
            // Compact summary: show the item snapshot when editor controls are collapsed.
            sx={{
              gridColumn: '2',
              display: 'grid',
              gridTemplateColumns: compactColumnTemplate,
              columnGap: 1,
              rowGap: 0.75,
              alignItems: 'center',
              py: 0.5,
            }}
          >
            <Box sx={{ gridColumn: '1', gridRow: '1', display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <GearInspectorSummaryLabel label={slotLabel} icon={slotIconNode || undefined} />
            </Box>
            <Box sx={{ gridColumn: '2', gridRow: '1', display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <GearInspectorSummaryLabel label={rankLabel(it.rank)} />
            </Box>
            <Box sx={{ gridColumn: '3', gridRow: '1', display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <GearInspectorSummaryLabel label={<RarityLabel rarity={it.rarity} />} />
            </Box>
            <Box
              sx={{
                gridColumn: '4',
                gridRow: '1',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                // Keep the compact main-stat summary on one line so row height stays stable.
                flexWrap: 'nowrap',
                overflow: 'hidden',
                minWidth: 0,
              }}
            >
              <GearInspectorSummaryLabel label={mainLabel} color={mainSummaryColor} />
            </Box>
            <Box sx={{ gridColumn: '1', gridRow: '2', display: showSetChip ? 'flex' : 'none', alignItems: 'center', minWidth: 0 }}>
              {showSetChip ? <GearInspectorSummaryLabel label={setLabel} icon={setIconNode || undefined} /> : null}
            </Box>
            <Box sx={{ gridColumn: '2', gridRow: '2', display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <GearInspectorSummaryLabel label={levelChipLabel} />
            </Box>
            <Box
              sx={{
                gridColumn: '3',
                gridRow: '2',
                display: showFactionChip ? 'flex' : 'none',
                alignItems: 'center',
                minWidth: 0,
              }}
            >
              {showFactionChip ? (
                showFactionIcon && factionIconNode ? (
                  <EllipsisTooltip title={factionLabel} selector=".MuiTypography-root">
                    <Box sx={{ minWidth: 0 }}>
                      <GearInspectorSummaryLabel label={factionChipLabel} icon={factionIconNode} />
                    </Box>
                  </EllipsisTooltip>
                ) : (
                  <GearInspectorSummaryLabel label={factionChipLabel} />
                )
              ) : null}
            </Box>
            <Box
              sx={{
                gridColumn: '4',
                gridRow: '2',
                display: 'flex',
                gap: 0.5,
                // Keep substat summaries on one line; labels can ellipsize as width shrinks.
                flexWrap: 'nowrap',
                overflow: 'hidden',
                alignItems: 'center',
                minWidth: 0,
              }}
            >
              {substatSummaries.map((entry) => {
                const subSummaryColor = colorStatTexts ? entry.color : undefined
                return (
                  <Box key={`sub-${entry.variant}`} sx={{ minWidth: 0 }}>
                    <GearInspectorSummaryLabel label={entry.label} color={subSummaryColor} />
                  </Box>
                )
              })}
            </Box>
          </Box>
        ) : (
          <Box
            // Control strip mirrors Builder selectors: slot/rank/rarity/main stay aligned in one row.
          sx={{ gridColumn: '2', display: 'grid', gridTemplateColumns: GEAR_INSPECTOR_CONTROL_GRID_TEMPLATE, columnGap: 1, rowGap: 1, alignItems: 'center' }}
        >
          <GearSlotSelect
            value={slotValue === GEAR_INSPECTOR_ANY_SLOT_ID ? null : (slotValue as ArtifactTypeId)}
            onChange={(nextSlot) => {
              updateItemAt(idx, (v) => {
                const resolvedSlot = (nextSlot == null ? GEAR_INSPECTOR_ANY_SLOT_ID : nextSlot) as ArtifactTypeId
                const currentMain = Number(v.main ?? -1)
                const supportsMain = (Number(resolvedSlot) === GEAR_INSPECTOR_ANY_SLOT_ID) || slotSupportsMain(resolvedSlot, currentMain)
                const fixedMain = (currentMain === -1 || Number.isNaN(currentMain) || supportsMain)
                  ? currentMain
                  : (Array.from(ALLOWED_MAIN_BY_SLOT[Number(resolvedSlot) as ArtifactType] || [])[0] ?? -1)
                const allowedForSlot = new Set<number>(allowedGearInspectorSetIds(resolvedSlot))
                const fixedSet = allowedForSlot.has(Number(v.set))
                  ? v.set
                  : (allowedForSlot.size > 0 ? (Array.from(allowedForSlot)[0] as ArtifactSetId) : v.set)
                // Determine faction without an IIFE (React Compiler does not optimize IIFEs).
                let fixedFaction: FactionId
                if (!isAccessorySlot(resolvedSlot)) {
                  fixedFaction = 0 as FactionId
                } else {
                  const existingFaction = Number(v.faction ?? 0) as FactionId
                  fixedFaction = (existingFaction && ACCESSORY_FACTION_POOL.includes(existingFaction))
                    ? existingFaction
                    : pickRandomAccessoryFaction()
                }
                const updated = { ...v, slot: resolvedSlot, main: fixedMain, set: fixedSet, faction: fixedFaction }
                return adjustSubValuesFor(updated)
              })
            }}
            size="small"
            sx={{
              width: GEAR_INSPECTOR_SLOT_SELECT_WIDTH_PX,
              height: GEAR_INSPECTOR_SELECT_HEIGHT_PX,
              display: 'inline-flex',
              alignItems: 'center',
              '& .MuiSelect-select': {
                ...GEAR_INSPECTOR_SELECT_VALUE_BASE_SX,
              },
            }}
          />

          <GearRankSelect
            value={Number(it.rank) as 1|2|3|4|5|6}
            onChange={(nextRank) => {
              if (nextRank == null) return
              updateItemAt(idx, (v) => adjustSubValuesFor({ ...v, rank: nextRank }))
            }}
            size="small"
            sx={{
              width: GEAR_INSPECTOR_RANK_SELECT_WIDTH_PX,
              height: GEAR_INSPECTOR_SELECT_HEIGHT_PX,
              display: 'inline-flex',
              alignItems: 'center',
              '& .MuiSelect-select': GEAR_INSPECTOR_SELECT_VALUE_BASE_SX,
            }}
          />
          <GearRaritySelect
            value={Number(it.rarity) || 1}
            onChange={(nextRarity) => {
              if (nextRarity == null) return
              updateItemAt(idx, (v) => adjustSubValuesFor({ ...v, rarity: nextRarity as 1|2|3|4|5|6 }))
            }}
            size="small"
            sx={{
              width: GEAR_INSPECTOR_RARITY_SELECT_WIDTH_PX,
              height: GEAR_INSPECTOR_SELECT_HEIGHT_PX,
              display: 'inline-flex',
              alignItems: 'center',
              '& .MuiSelect-select': GEAR_INSPECTOR_SELECT_VALUE_BASE_SX,
            }}
          />
          <GearMainStatSelect
            value={mainValue as number}
            options={mainOptions}
            onChange={(variant) => {
              updateItemAt(idx, (v) => adjustSubValuesFor({ ...v, main: Number(variant) }))
            }}
            colorOverrides={substatColors}
            showBorderColors={colorStatControls}
            size="small"
            sx={{
              width: GEAR_INSPECTOR_MAINSTAT_SELECT_MIN_WIDTH_PX,
              height: GEAR_INSPECTOR_SELECT_HEIGHT_PX,
              display: 'inline-flex',
              alignItems: 'center',
              '& .MuiSelect-select': GEAR_INSPECTOR_SELECT_VALUE_BASE_SX,
            }}
          />
          </Box>
        )}
        {isCompact && (
          <Box
            sx={{
              gridColumn: '2',
              gridRow: '2',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              flexWrap: 'wrap',
              minHeight: GEAR_INSPECTOR_RESULT_ROW_MIN_HEIGHT_PX,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                flexWrap: 'wrap',
                flex: '1 1 auto',
                minWidth: 0,
              }}
            >
              {match ? (
                <>
                  <Chip size="small" color={match.keep ? 'success' : 'error'} label={match.keep ? t('keepValueKeep') : t('keepValueSell')} />
                  {ruleChipNode}
                </>
              ) : (
                // No matching rule means the item is kept; mirror the Keep chip styling.
                <Chip
                  size="small"
                  color="success"
                  variant="filled"
                  label={t('gearInspectorNoMatch')}
                />
              )}
            </Box>
          </Box>
        )}
        {!isCompact && (
          <Box sx={{ gridColumn: '2', gridRow: '2', display: 'grid', gridTemplateColumns: GEAR_INSPECTOR_CONTROL_GRID_TEMPLATE, columnGap: 1, rowGap: 1, mt: 0.5, alignItems: 'center' }}>
            {/* Set selector; state computed above the return statement to avoid an IIFE in JSX. */}
            <Select
              size="small"
              displayEmpty
              open={setsMenuOpenIdx === idx}
              value={setSelectValue}
              onChange={e => {
                updateItemAt(idx, (v) => {
                  const raw = e.target.value
                  const numeric = Number(raw)
                  if (!Number.isFinite(numeric)) return adjustSubValuesFor(v)
                  // Preserve the no-set sentinel for accessories when selected.
                  if (numeric === ACCESSORY_NO_SET_ID) {
                    return adjustSubValuesFor({ ...v, set: (ACCESSORY_NO_SET_ID as unknown as ArtifactSetId) })
                  }
                  const allowedForSlot = allowedGearInspectorSetIds(v.slot)
                  if (allowedForSlot.includes(numeric)) {
                    return adjustSubValuesFor({ ...v, set: numeric as ArtifactSetId })
                  }
                  if (isAccessorySlot(v.slot)) {
                    return adjustSubValuesFor({ ...v, set: (ACCESSORY_NO_SET_ID as unknown as ArtifactSetId) })
                  }
                  return adjustSubValuesFor({ ...v, set: normalizeGearInspectorSetForSlot(v.slot, numeric as ArtifactSetId) })
                })
                requestAnimationFrame(() => setSetsMenuOpenIdx(null))
              }}
              onClose={() => {
                setSetsMenuOpenIdx((current) => (current === idx ? null : current))
                requestAnimationFrame(() => setSetsMenuAnchorPos(null))
              }}
              onOpen={(event) => {
                const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
                setSetsMenuAnchorPos({ top: rect.bottom, left: rect.left })
                setSetsMenuOpenIdx(idx)
                requestAnimationFrame(() => requestAnimationFrame(() => {
                  scrollGearInspectorSetsMenuToSelected(idx, setsOrder, { force: true })
                }))
              }}
              renderValue={(value) => {
                const setNum = Number(value)
                if (!Number.isFinite(setNum) || setNum === 0) {
                  return (
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                      <span>{t('gearInspectorValueUnknown')}</span>
                    </Box>
                  )
                }
                // Accessory "no set" should display the dedicated label + spider glyph.
                if (setNum === ACCESSORY_NO_SET_ID) {
                  return (
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                      <SetIcon setId={setNum as ArtifactSetId} label={t('noSetAccessories')} size={20} />
                      <span>{t('noSetAccessories')}</span>
                    </Box>
                  )
                }
                const Label = getLocalizedGearSetName(setNum as ArtifactSetId, t, lang) || artifactSetName(setNum)
                const setNameForIcon = artifactSetName(setNum)
                const Icon = <SetIcon setId={setNum} label={setNameForIcon} size={20} />
                return (
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    {Icon}
                    <span>{Label}</span>
                  </Box>
                )
              }}
              MenuProps={{
                slotProps: {
                  paper: {
                    sx: { width: { xs: 'calc(100vw - 32px)', sm: SETS_MENU_WIDTH_PX }, maxWidth: SETS_MENU_WIDTH_PX, overflowX: 'hidden' },
                    ref: (el: HTMLDivElement | null) => { setsMenuPaperRef.current = el },
                  },
                  list: {
                    sx: {
                      width: '100%',
                      maxWidth: '100%',
                      ...(setsOrder === 'icons'
                        ? {}
                        : { maxHeight: MENU_MAX_HEIGHT_SETS_LIST_PX + MENU_MAX_HEIGHT_EXTRA_BUFFER, overflowY: 'auto' as const }),
                    },
                  },
                  transition: {
                    onExited: () => {
                      setSetsMenuAnchorPos(null)
                      setsMenuPaperRef.current = null
                    },
                  },
                },
                ...(setsMenuAnchorPos
                  ? { anchorReference: 'anchorPosition' as const, anchorPosition: setsMenuAnchorPos, transformOrigin: { vertical: 'top', horizontal: 'left' as const } }
                  : { transformOrigin: { vertical: 'top', horizontal: 'left' as const } }),
              }}
              sx={{
                width: GEAR_INSPECTOR_SET_SELECT_WIDTH_PX,
                height: GEAR_INSPECTOR_SELECT_HEIGHT_PX,
                display: 'inline-flex',
                alignItems: 'center',
                '& .MuiSelect-select': {
                  ...GEAR_INSPECTOR_SELECT_VALUE_BASE_SX,
                  columnGap: GEAR_INSPECTOR_SELECT_GAP_COMPACT_PX,
                  whiteSpace: 'nowrap',
                },
              }}
            >
              {setSelectValue !== '' ? (
                // Hidden option ensures MUI always sees the active value even if search filters it out.
                <MenuItem value={setSelectValue} sx={{ display: 'none' }}>
                  {currentSetLabel}
                </MenuItem>
              ) : null}
              {setOptionMissing ? (
                <MenuItem value={setSelectValue} sx={{ fontStyle: 'italic' }}>
                  {currentSetLabel}
                </MenuItem>
              ) : null}
              <Box component="div" sx={{ display: 'block', p: 0, m: 0 }}>
                <ListSubheader
                  sx={[LIST_SUBHEADER_SX, { py: 0.5, minHeight: MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, boxSizing: 'border-box', width: `calc(100% - ${MENU_SCROLL_GUTTER_PX}px)` }]}
                >
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', alignItems: 'center', pr: `${MENU_SCROLL_GUTTER_PX}px` }}>
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SetsOrderControls
                        setsSearch={setsSearch}
                        onSetsSearchChange={setSetsSearch}
                        setsOrder={setsOrder}
                        onSetsOrderChange={(v: 'game' | 'az' | 'icons') => {
                          if (!v) return
                          setSetsOrder(v)
                          if (setsMenuOpenIdx !== null) {
                            requestAnimationFrame(() => scrollGearInspectorSetsMenuToSelected(setsMenuOpenIdx, v, { force: true }))
                          }
                        }}
                        zeroResults={sortedSetEntries.length === 0}
                      />
                    </Box>
                  </Box>
                </ListSubheader>
                <Box
                  component="ul"
                  ref={(el: HTMLUListElement | null) => { setsMenuListRefsRef.current[idx] = el }}
                  sx={{
                    listStyle: 'none',
                    p: 0,
                    m: 0,
                    ...(setsOrder === 'icons'
                      ? {
                          maxHeight: 'none',
                          height: 'auto',
                          overflowY: 'visible',
                        }
                      : {
                          maxHeight: MENU_MAX_HEIGHT_SETS_LIST_PX,
                          height: MENU_MAX_HEIGHT_SETS_LIST_PX,
                          overflowY: 'auto',
                        }),
                    pr: `${MENU_SCROLL_GUTTER_PX}px`,
                    ...reserveScrollbarGutterSpace({ reserveStart: false, basePaddingInlineEnd: `${MENU_SCROLL_GUTTER_PX}px` }),
                  }}
                >
                  <SetMenuSection
                    title={t('setsTitle')}
                    sorted={sortedSetEntries}
                    setsOrder={setsOrder}
                    metasets={metasets}
                    excludeMetasetId={null}
                    setUsageCounts={{}}
                    valueForSet={(id) => String(id)}
                    hideHeader
                    selectedSetIds={Number.isFinite(setIdNumber) && setIdNumber !== 0 ? [setIdNumber] : []}
                    showUsageCounts={false}
                    singleSelect
                    onToggleSet={(id: number) => {
                      updateItemAt(idx, (v) => {
                        const allowedForSlot = allowedGearInspectorSetIds(v.slot)
                        if (isAccessorySlot(v.slot) && Number(v.set) === Number(id)) {
                          return adjustSubValuesFor({ ...v, set: (ACCESSORY_NO_SET_ID as unknown as ArtifactSetId) })
                        }
                        if (allowedForSlot.includes(Number(id))) {
                          return adjustSubValuesFor({ ...v, set: id as ArtifactSetId })
                        }
                        if (isAccessorySlot(v.slot)) {
                          return adjustSubValuesFor({ ...v, set: (ACCESSORY_NO_SET_ID as unknown as ArtifactSetId) })
                        }
                        return adjustSubValuesFor({ ...v, set: normalizeGearInspectorSetForSlot(v.slot, id as ArtifactSetId) })
                      })
                      requestAnimationFrame(() => setSetsMenuOpenIdx(null))
                    }}
                  />
                </Box>
              </Box>
            </Select>
            <Select size="small" value={it.level} onChange={e => updateItemAt(idx, (v) => {
              const updated = { ...v, level: Number(e.target.value) as LevelMilestone }
              return adjustSubValuesFor(updated)
            })} sx={{
              width: GEAR_INSPECTOR_LEVEL_SELECT_WIDTH_PX,
              height: GEAR_INSPECTOR_SELECT_HEIGHT_PX,
              display: 'inline-flex',
              alignItems: 'center',
              '& .MuiSelect-select': GEAR_INSPECTOR_SELECT_VALUE_BASE_SX,
            }}>
              {LEVEL_MILESTONES.map(n => (<MenuItem key={n} value={n}>{formatLevel(n)}</MenuItem>))}
            </Select>
            <GearFactionSelect
              value={Number(it.faction ?? 0) || null}
              disabled={!isAccessorySlot(it.slot)}
              onChange={(nextFaction) => {
                updateItemAt(idx, (v) => ({ ...v, faction: Number(nextFaction ?? 0) as FactionId }))
              }}
              size="small"
              sx={{
                width: GEAR_INSPECTOR_FACTION_SELECT_WIDTH_PX,
                height: GEAR_INSPECTOR_SELECT_HEIGHT_PX,
                display: 'inline-flex',
                alignItems: 'center',
                '& .MuiSelect-select': {
                  ...GEAR_INSPECTOR_SELECT_VALUE_BASE_SX,
                },
              }}
            />
          </Box>
        )}
        {!isCompact && (
          <Box sx={{ gridColumn: '2', display: 'grid', gridTemplateColumns: `repeat(2, ${GEAR_INSPECTOR_SUBSTAT_EDITOR_WIDTH_PX}px)`, columnGap: 1, rowGap: 0.5, mt: 0.5 }}>
            {subEntries.map(([v, value]) => {
              const star = Math.max(1, Math.min(6, Number(it.rank || 6))) as 1|2|3|4|5|6
              const baseStep = (
                star === 6 ? (substatTargets.six[v] || 0) : star === 5 ? (substatTargets.five[v] || 0) : star === 4 ? (substatTargets.four[v] || 0) : star === 3 ? (substatTargets.three[v] || 0) : star === 2 ? (substatTargets.two[v] || 0) : (substatTargets.one[v] || 0)
              )
              const step = Math.max(1, baseStep)
              const parsedValue = Number(value)
              const numericValue = Number.isFinite(parsedValue) ? parsedValue : 0
              const usedOthers = new Set<number>(subEntries.filter(([kk]) => Number(kk) !== v).map(([kk]) => Number(kk)))
              // Slot/main validity for a candidate variant (shared by the free + swap lists).
              const substatSelectable = (x: number): boolean =>
                (Number(it.slot) === GEAR_INSPECTOR_ANY_SLOT_ID || slotSupportsSub(it.slot, x)) && !subEqualsMainVariant(x, mainValue)
              // Free (not-yet-used) options for this slot, in canonical priority order.
              // PROVISIONAL(anomalous): the mode-damage substats join the pool; slotSupportsSub
              // gates them to jewelry slots, so artifact pieces never offer them.
              const candidates = [...STAT_VARIANTS_PRIORITY, ...ANOMALOUS_SUBSTAT_VARIANTS]
                .filter(x => substatSelectable(x) && !usedOthers.has(Number(x)))
              // Already-used-elsewhere options: kept VISIBLE (not hidden) so the user can pick
              // one to SWAP the two substats — reordering by hand no longer requires clearing a
              // slot first. Selecting one below swaps both variants and their values.
              const swapTargets = [...STAT_VARIANTS_PRIORITY, ...ANOMALOUS_SUBSTAT_VARIANTS]
                .filter(x => substatSelectable(x) && usedOthers.has(Number(x)) && Number(x) !== v)
              const clampGearInspectorValue = (raw: number): number => {
                if (!Number.isFinite(raw)) return 1
                return Math.max(1, Math.round(raw))
              }
              const commitSubstatValue = (nextValue: number) => {
                updateItemAt(idx, (it2) => {
                  const base = { ...it2, subValues: { ...(it2.subValues || {}), [v]: nextValue } }
                  const updated = (it2.subOrder && it2.subOrder.length > 0) ? { ...base, subOrder: [...it2.subOrder] } : base
                  return adjustSubValuesFor(updated as GearInspectorItemLocal)
                })
              }
              const applyStepDelta = (delta: number) => {
                const next = numericValue + (delta * step)
                commitSubstatValue(clampGearInspectorValue(next))
              }
              // Per-row key keeps hover state stable across repeated stats/rows.
              const hoverKey = `${Number(it.itemId)}:${Number(v)}`
              const stepButtonHovered = substatStepHoverKey === hoverKey
              // Spinner adornment is extracted so JSX inside slotProps.input.endAdornment
              // does not confuse the TSX parser's brace-depth tracking.
              const substatSpinnerAdornment = (
                <NumberSpinnerAdornment
                  ariaLabel={t(statVariantI18nKey(v))}
                  onStep={(delta) => {
                    const next = numericValue + delta
                    commitSubstatValue(clampGearInspectorValue(next))
                  }}
                />
              )
              return (
                <Stack
                  key={v}
                  direction="row"
                  spacing={0.5}
                  sx={{
                    width: `${GEAR_INSPECTOR_SUBSTAT_EDITOR_WIDTH_PX}px`,
                    borderRadius: 1,
                    px: 0.75,
                    py: 0.25,
                    alignItems: 'center',
                  }}
                >
                  <Select
                    size="small"
                    value={v}
                    onChange={e => {
                      const nv = Number(e.target.value)
                      if (!Number.isFinite(nv) || nv === v) return
                      updateItemAt(idx, (it2) => {
                        const beforeVals = it2.subValues || {}
                        const beforeOrder = it2.subOrder && it2.subOrder.length ? [...it2.subOrder] : Object.keys(beforeVals).map(Number)
                        const pos = beforeOrder.indexOf(v)
                        const nextVals: Record<number, number> = { ...beforeVals }
                        if (Object.prototype.hasOwnProperty.call(beforeVals, nv)) {
                          // SWAP: nv is already used in another slot. subValues is keyed by
                          // variant, so each stat's value already travels with it — swapping
                          // the two positions in subOrder is enough for the rows to exchange
                          // stat AND value. (Do NOT reassign nextVals: that would cross the
                          // values, leaving each stat showing the other's number.)
                          const otherPos = beforeOrder.indexOf(nv)
                          if (pos !== -1) beforeOrder[pos] = nv
                          if (otherPos !== -1) beforeOrder[otherPos] = v
                        } else {
                          // MOVE: nv is free — retype this slot, carrying its current value.
                          if (pos !== -1) beforeOrder[pos] = nv
                          delete nextVals[v]
                          nextVals[nv] = Math.max(1, numericValue)
                        }
                        const updated = { ...it2, subValues: nextVals, subOrder: beforeOrder }
                        return adjustSubValuesFor(updated)
                      })
                    }}
                    sx={{
                      width: GEAR_INSPECTOR_SUBSTAT_SELECT_MIN_WIDTH_PX,
                      height: GEAR_INSPECTOR_SELECT_HEIGHT_PX,
                      display: 'inline-flex',
                      alignItems: 'center',
                      '& .MuiSelect-select': {
                        ...GEAR_INSPECTOR_SELECT_VALUE_BASE_SX,
                        color: colorStatControls ? adaptSubstatFgOnSurface(substatColors[v]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[v], substatSurfacePaper) : undefined,
                      },
                    }}
                  >
                    {/* Current variant first, then free options, then used-elsewhere swap
                        targets (kept visible so reordering swaps instead of being blocked). */}
                    {[v, ...candidates.filter(x => x !== v), ...swapTargets].map(opt => (
                      <MenuItem key={opt} value={opt} sx={{ color: colorStatControls ? adaptSubstatFgOnSurface(substatColors[opt]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[opt], substatSurfacePaper) : undefined }}>{t(statVariantI18nKey(opt))}</MenuItem>
                    ))}
                  </Select>
                  <Stack direction="row" spacing={0.25} sx={{ flex: 1, alignItems: 'center' }}>
                    <IconButton
                      size="small"
                      aria-label="decrease"
                      onClick={() => applyStepDelta(-1)}
                      onMouseEnter={() => {
                        cancelSubstatStepHoverClear()
                        setSubstatStepHoverKey(hoverKey)
                      }}
                      onMouseLeave={() => scheduleSubstatStepHoverClear(hoverKey)}
                      sx={{ p: 0.25 }}
                    >
                      <RemoveCircleOutlineIcon fontSize="small" />
                    </IconButton>
                    <TextField
                      size="small"
                      type="number"
                      value={numericValue}
                      onChange={(event) => {
                        const raw = Number(event.target.value)
                        commitSubstatValue(clampGearInspectorValue(raw))
                      }}
                      sx={(theme) => ({
                        width: 88,
                        '& input': {
                          textAlign: 'right',
                          paddingRight: theme.spacing(1),
                          paddingLeft: theme.spacing(0.25),
                        },
                        ...(stepButtonHovered ? {
                          // Match MUI’s default outlined hover affordance so it feels native.
                          '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: (theme.vars?.palette.text.primary ?? theme.palette.text.primary),
                          },
                        } : {}),
                        ...HIDE_NATIVE_NUMBER_SPINNER_SX,
                      })}
                      slotProps={{
                        // Native input attributes: numeric keyboard, pattern hint, and accessible label.
                        htmlInput: { inputMode: 'numeric' as const, pattern: '[0-9]*', min: 0, 'aria-label': t(statVariantI18nKey(v)) },
                        // Input wrapper: center adornments and host the spinner controls (extracted above to keep slotProps parse-friendly).
                        input: { endAdornment: substatSpinnerAdornment, sx: { alignItems: 'center' } },
                      }}
                    />
                    <IconButton
                      size="small"
                      aria-label="increase"
                      onClick={() => applyStepDelta(1)}
                      onMouseEnter={() => {
                        cancelSubstatStepHoverClear()
                        setSubstatStepHoverKey(hoverKey)
                      }}
                      onMouseLeave={() => scheduleSubstatStepHoverClear(hoverKey)}
                      sx={{ p: 0.25 }}
                    >
                      <AddCircleOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
              )
            })}
          </Box>
        )}
        {!isCompact && (
          <Box
            sx={{
              gridColumn: '2',
              mt: 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              flexWrap: 'wrap',
              minHeight: GEAR_INSPECTOR_RESULT_ROW_MIN_HEIGHT_PX,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                flexWrap: 'wrap',
                flex: '1 1 auto',
                minWidth: 0,
              }}
            >
              {match ? (
                <>
                  <Chip size="small" color={match.keep ? 'success' : 'error'} label={match.keep ? t('keepValueKeep') : t('keepValueSell')} />
                  {ruleChipNode}
                </>
              ) : (
                // No matching rule means the item is kept; mirror the Keep chip styling.
                <Chip
                  size="small"
                  color="success"
                  variant="filled"
                  label={t('gearInspectorNoMatch')}
                />
              )}
            </Box>
          </Box>
        )}
        <Box
          sx={{
            gridColumn: '3',
            gridRow: '1 / span 2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 0.5,
          }}
        >
          {gridIconBoxNode}
        </Box>
      </Box>
    )
  }

  // No Import/Export buttons; autosave restores when the Gear Inspector view mounts.

  const layoutRenderer = renderLayout ?? defaultGearInspectorTabLayout

  const contentNode = (
    <Box
      data-tour-id="gear-inspector.dialog"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flex: 1,
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {gearDialogIntroHasPath ? (
          <>
            {gearDialogIntroPrefix}
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <Box component="span" sx={{ fontFamily: FONT_FAMILY_MONO, fontWeight: 500 }}>
                {RSL_HELPER_CONFIG_PATH}
              </Box>
              {/* Clipboard helper uses MarkdownTooltip so the combined path hint stays readable. */}
              <MarkdownTooltip markdown={copyGearDbPathLabel}>
                <IconButton
                  size="small"
                  aria-label={copyGearDbPathLabel}
                  onClick={handleCopyGearDbPath}
                  color="inherit"
                  sx={{
                    p: 0.25,
                    height: 24,
                    width: 24,
                    fontSize: '0.95rem',
                  }}
                >
                  <ContentCopyIcon fontSize="inherit" />
                </IconButton>
              </MarkdownTooltip>
            </Box>
            {gearDialogIntroSuffix}
          </>
        ) : gearDialogIntroText}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {t('gearDialogManualOnlyNotice')}
      </Typography>
      <Box
        ref={scrollContainerRef}
        onScroll={onScroll}
        sx={{
          mt: 1,
          flex: 1,
          overflowY: 'auto',
          pr: 1,
        }}
      >
        {items.length > 0 ? (
          <Box sx={{ position: 'relative' }}>
            {topSpacerHeight > 0 ? <Box sx={{ height: topSpacerHeight }} /> : null}
            {/* eslint-disable-next-line react-hooks/refs -- renderGearInspectorRow reads cookieControlsMapRef (a callback-ref Map) only when cookieMonsterActive is true; guarded by cookieMonsterActive check inside */}
            {visibleIndices.map((idx) => {
              const item = items[idx] as GearInspectorItemLocal
              return (
                <MeasuredGearInspectorRow key={item.itemId} itemId={item.itemId} registerHeight={registerRowHeight}>
                  {renderGearInspectorRow(item, idx)}
                </MeasuredGearInspectorRow>
              )
            })}
            {bottomSpacerHeight > 0 ? <Box sx={{ height: bottomSpacerHeight }} /> : null}
          </Box>
	        ) : (
	          <EmptyStateMessage minHeight="100%" verticalAlign={emptyStateVerticalAlign}>
	            {t('gearInspectorTableEmpty')}
	          </EmptyStateMessage>
	        )}
      </Box>
    </Box>
  )

  const actionsNode = (
    <>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'nowrap',
          gap: 1,
          alignItems: 'center',
          width: '100%',
        }}
      >
        {deletableSources.map((section) => {
          const count = sourceCounts[section.key]
          const buttonLabel = `${section.label}: ${count}`
          const disabled = count === 0
          const buttonNode = (
            <Button
              size="small"
              variant="outlined"
              color="error"
              endIcon={<DeleteIcon fontSize="small" />}
              onClick={() => {
                if (disabled) return
                setPendingDeleteSource(section.key)
              }}
              disabled={disabled}
              sx={{
                minWidth: 0,
                flex: '1 1 0',
                justifyContent: 'flex-start',
                gap: 0.75,
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexGrow: 1,
                  minWidth: 0,
                  maxWidth: '100%',
                  overflow: 'hidden',
                }}
              >
                <EllipsisTooltip title={buttonLabel} wrap="block">
                  <Typography
                    component="span"
                    variant="button"
                    data-ellipsis-target
                    noWrap
                    sx={{
                      display: 'block',
                      flexGrow: 1,
                      minWidth: 0,
                      maxWidth: '100%',
                      width: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      textAlign: 'left',
                      whiteSpace: 'nowrap',
                      textTransform: 'none',
                    }}
                  >
                    {buttonLabel}
                  </Typography>
                </EllipsisTooltip>
              </Box>
            </Button>
          )
          return (
            <MarkdownTooltip key={section.key} markdown={buttonLabel}>
              <Box component="span" sx={{ display: 'inline-flex', flex: '1 1 0', minWidth: 0 }}>
                {buttonNode}
              </Box>
            </MarkdownTooltip>
          )
        })}
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Button data-tour-id="gear-inspector.add-manual" onClick={handleAddManualGear}>{t('gearDialogAddManualGear')}</Button>
        <Box sx={{ flex: 1 }} />
        {onRequestClose ? <Button onClick={onRequestClose}>{t('close')}</Button> : null}
      </Box>
    </>
  )

  return (
    <>
      {layoutRenderer({ content: contentNode, actions: actionsNode })}
      <Dialog
        open={pendingDeleteSource != null}
        onClose={() => setPendingDeleteSource(null)}
      >
        <DialogTitle>{t('gearDialogDeleteSourceConfirmTitle', { source: pendingDeleteMeta?.label ?? '' })}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t('gearDialogDeleteSourceConfirmBody', { source: pendingDeleteMeta?.label ?? '' })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDeleteSource(null)}>{t('cancel')}</Button>
          <Button
            color="error"
            disabled={(pendingDeleteMeta?.count ?? 0) === 0}
            onClick={() => {
              if (!pendingDeleteMeta) {
                setPendingDeleteSource(null)
                return
              }
              handleDeleteBySource(pendingDeleteMeta.key)
              setPendingDeleteSource(null)
            }}
          >
            {t('delete')}
          </Button>
        </DialogActions>
      </Dialog>
      {compactHint.overlay}
    </>
  )
}

const defaultGearInspectorTabLayout = ({ content, actions }: GearInspectorTabLayoutSlots): ReactNode => (
  <>
    <DialogContent
      dividers
      sx={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {content}
    </DialogContent>
    <DialogActions
      sx={{
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 1,
        '& > :not(:first-of-type)': {
          marginLeft: 0,
        },
      }}
    >
      {actions}
    </DialogActions>
  </>
)

type MeasuredGearInspectorRowProps = {
  itemId: number
  registerHeight: (itemId: number, height: number) => void
  children: ReactNode
}

function MeasuredGearInspectorRow({ itemId, registerHeight, children }: MeasuredGearInspectorRowProps) {
  const rowRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const node = rowRef.current
    if (!node) return
    const measure = () => registerHeight(itemId, node.offsetHeight)
    measure()
    const observer = new ResizeObserver(() => {
      const current = rowRef.current
      if (!current) return
      registerHeight(itemId, current.offsetHeight)
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [itemId, registerHeight])

  return <Box ref={rowRef} data-tour-id={`gear-inspector.item.${itemId}`}>{children}</Box>
}

export default GearInspectorTabContent
