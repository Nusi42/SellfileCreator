/**
 * GearTesterTabContent
 *
 * Gear dialog body: virtualized editor for tester items that mirrors the Builder
 * controls (spinners, metasets, attention cues) while producing the queue that
 * feeds the Rule Tester preview grid on the main screen.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, UIEvent, Dispatch, SetStateAction, MouseEvent } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Select, Stack, Typography, Chip, TextField, ListSubheader, keyframes } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen'
import DeleteIcon from '@mui/icons-material/Delete'
import type { BuilderConfig } from '../../lib/hsfBuilder'
import type { ArtifactSetId, ArtifactTypeId, FactionId, LevelMilestone } from '../../lib/types'
import { ArtifactType, /* rarityCodeToName, */ formatLevel, slotSupportsSub, slotSupportsMain, ALLOWED_MAIN_BY_SLOT, Faction, factionI18nKey, filterAndSortSetEntries, artifactTypeI18nKey, artifactSetName, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, statVariantI18nKey, StatId, LEVEL_MILESTONES, STAT_VARIANTS_PRIORITY, getLocalizedGearSetName } from '../../lib/types'
// MarkdownTooltip keeps all dialog hints (add/delete toggles, source glyphs, copy buttons) consistent with global styling.
import MarkdownTooltip from '../MarkdownTooltip'
import { allowedTesterSetIds, isAccessorySlot, normalizeTesterSetForSlot } from '../../lib/testerDomain'
import { formatTesterSetLabel } from '../../lib/testerFormatters'
import { variantToSub, variantToMain } from '../../lib/hsfTypes'
import { artifactTypeIconList } from '../artifactTypeIcons'
import type { TesterItemPreviewExtras } from '../../lib/ruleEval'
import type { NormalizedStat } from '../../lib/importers/gearDbNormalizer'
import { useI18n } from '../../lib/i18n'
import { useGearSetCatalogVersion } from '../../hooks/useGearSetCatalogVersion'
import { useAppState } from '../../state/appState'
import SetMenuSection from '../SetMenuSection'
import { SetIcon } from '../SetIcon'
import { FactionIcon } from '../FactionIcon'
import SetsOrderControls from '../SetsOrderControls'
import { NumberSpinnerAdornment } from '../NumberSpinnerAdornment'
import { SETS_MENU_WIDTH_PX, MENU_MAX_HEIGHT_SETS_LIST_PX, MENU_MAX_HEIGHT_EXTRA_BUFFER, MENU_SCROLL_GUTTER_PX, MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, LIST_SUBHEADER_SX, TESTER_SUBSTAT_EDITOR_WIDTH_PX, TESTER_ROW_CONTROLS_WIDTH_PX, ACCESSORY_NO_SET_ID, TESTER_ANY_SLOT_ID, TESTER_MAINSTAT_SELECT_MIN_WIDTH_PX, TESTER_SUBSTAT_SELECT_MIN_WIDTH_PX, TESTER_SLOT_SELECT_WIDTH_PX, TESTER_SET_SELECT_WIDTH_PX, TESTER_FACTION_SELECT_WIDTH_PX, TESTER_RANK_SELECT_WIDTH_PX, TESTER_RARITY_SELECT_WIDTH_PX, TESTER_LEVEL_SELECT_WIDTH_PX, TESTER_SELECT_HEIGHT_PX, TESTER_RESULT_ROW_MIN_HEIGHT_PX, TESTER_CONFIG_CHIP_MAX_WIDTH_PX, TESTER_VIRTUAL_OVERSCAN_PX, TESTER_ROW_ESTIMATE_COMPACT_PX, TESTER_ROW_ESTIMATE_EXPANDED_PX, TESTER_COMPACT_ICON_SIZE_PX, RSL_HELPER_CONFIG_PATH } from '../../lib/constants'
import { reserveScrollbarGutterSpace } from '../../lib/scrollbar'
import { useDisplayPreferences } from '../../state/preferencesState'
import type { Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import {
  createRuleTesterMath,
  entriesInOrder,
  isManualTesterItem,
  mainOptionsForSlot,
  testerSourceCategoryForItem,
  type RuleTesterItem,
  type TesterSourceCategory,
} from '../../lib/ruleTesterSession'
import type { TesterPreviewMatch } from '../../types/testerPreview'
import { TesterSummaryLabel } from '../TesterSummaryLabel'
import { TesterRuleReferenceChip } from '../TesterRuleReferenceChip'
import GridIconBox, { GRID_ICON_BOX_SIZE_PX } from '../GridIconBox'
import EllipsisTooltip from '../EllipsisTooltip'
import { triggerCopyDialog, writeTextSafe } from '../../lib/clipboard'
import { useContextMenuHint } from '../../hooks/useContextMenuHint'
import { ContextMenuHintOverlay } from '../ContextMenuHintOverlay'
import { GearFactionSelect, GearMainStatSelect, GearRankSelect, GearRaritySelect, GearSlotSelect } from '../gear'
import { EmptyStateMessage, type EmptyStateMessageProps } from '../EmptyStateMessage'

type TesterSourceCountMap = Record<TesterSourceCategory, number>

export type GearTesterTabLayoutSlots = {
  content: ReactNode
  actions: ReactNode
}

export type GearTesterTabContentProps = {
  customCfgs: BuilderConfig[]
  onView: (ruleIndex: number, cfgIdx: number | null) => void
  substatColors: Record<number, { fg: string; bg: string }>
  testerItems: RuleTesterItem[]
  setTesterItems: Dispatch<SetStateAction<RuleTesterItem[]>>
  allocTesterItemId: () => number
  testerMatches: ReadonlyMap<number, TesterPreviewMatch | null>
  isActive?: boolean
  // Empty-state messaging should match the main preview pane: stacked layout anchors to the top edge,
  // while side-by-side layout centers within the available space.
  emptyStateVerticalAlign?: EmptyStateMessageProps['verticalAlign']
  onRequestClose?: () => void
  renderLayout?: (slots: GearTesterTabLayoutSlots) => ReactNode
}

// Single grid template keeps the first two rows of controls perfectly aligned.
const TESTER_CONTROL_GRID_TEMPLATE = `${TESTER_SLOT_SELECT_WIDTH_PX}px ${TESTER_RANK_SELECT_WIDTH_PX}px ${TESTER_RARITY_SELECT_WIDTH_PX}px ${TESTER_MAINSTAT_SELECT_MIN_WIDTH_PX}px`
const TESTER_SELECT_GAP_DEFAULT_PX = 8
const TESTER_SELECT_GAP_COMPACT_PX = 6
const TESTER_ICON_COLUMN_WIDTH_PX = GRID_ICON_BOX_SIZE_PX + 16

const TESTER_SELECT_VALUE_BASE_SX: SystemStyleObject<Theme> = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: TESTER_SELECT_HEIGHT_PX,
  height: TESTER_SELECT_HEIGHT_PX,
  lineHeight: `${TESTER_SELECT_HEIGHT_PX}px`,
  columnGap: TESTER_SELECT_GAP_DEFAULT_PX,
  paddingTop: '0 !important',
  paddingBottom: '0 !important',
  transition: 'none !important',
  alignSelf: 'center',
}

// Cookie Monster easter egg tuning: 10 toggles within a 10s window activates a 4.5s animation.
const TESTER_COOKIE_TOGGLE_THRESHOLD = 10
const TESTER_COOKIE_WINDOW_MS = 10_000
const TESTER_COOKIE_ANIMATION_MS = 4_500

const TESTER_COOKIE_HALO_DIAMETER_PX = 96

const testerCookiePulse = keyframes`
  0% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.75; }
  40% { transform: translate(-50%, -50%) scale(1.08); opacity: 1; }
  70% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.85; }
  100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.75; }
`

const testerCookieIconWobble = keyframes`
  0% { transform: rotate(0deg); }
  20% { transform: rotate(16deg); }
  45% { transform: rotate(-18deg); }
  65% { transform: rotate(11deg); }
  85% { transform: rotate(-9deg); }
  100% { transform: rotate(0deg); }
`

const testerCookieFlip = keyframes`
  0% { transform: rotate(0deg); }
  50% { transform: rotate(90deg); }
  100% { transform: rotate(0deg); }
`

// cloneNormalizedStat ensures duplicate rows never mutate the original stat metadata.
const cloneNormalizedStat = (stat?: NormalizedStat | null): NormalizedStat | null => {
  if (!stat) return stat ?? null
  return { ...stat }
}

// cloneTesterPreviewExtras copies nested preview payloads so “duplicate” rows stay isolated.
const cloneTesterPreviewExtras = (extras: TesterItemPreviewExtras): TesterItemPreviewExtras => {
  const { substats, mainStat, ascension, ...rest } = extras
  const next: TesterItemPreviewExtras = {
    ...rest,
    mainStat: cloneNormalizedStat(mainStat),
    ascension: cloneNormalizedStat(ascension),
  }
  if (substats) {
    next.substats = substats.map((entry) => ({ ...entry }))
  }
  return next
}

// cloneManualTesterItem reuses the preview clones and assigns a brand-new item id.
const cloneManualTesterItem = (
  item: RuleTesterItem,
  allocItemId: () => number,
): RuleTesterItem => {
  const { subValues, subOrder, previewExtras, itemId: _ignored, ...rest } = item
  const next: RuleTesterItem = {
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
    next.previewExtras = cloneTesterPreviewExtras(previewExtras)
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

export function GearTesterTabContent({
  customCfgs,
  onView,
  substatColors,
  testerItems,
  setTesterItems,
  allocTesterItemId,
  testerMatches,
  isActive = true,
  emptyStateVerticalAlign = 'center',
  onRequestClose,
  renderLayout,
}: GearTesterTabContentProps) {
  const { t, lang } = useI18n()
  useGearSetCatalogVersion()
  const { substatTargets, metasets } = useAppState()
  const { showFactionIcons, statButtonBorders } = useDisplayPreferences()
  const testerMath = useMemo(() => createRuleTesterMath(substatTargets), [substatTargets])
  const {
    adjustSubValuesFor,
    makeDefaultItem,
  } = testerMath
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

  type TesterItem = RuleTesterItem
  const setItems = setTesterItems
  const sourceCounts = useMemo<TesterSourceCountMap>(() => {
    const counts: TesterSourceCountMap = {
      manual: 0,
      inventory: 0,
      collection: 0,
      vault: 0,
      inbox: 0,
    }
    testerItems.forEach((item) => {
      const category = testerSourceCategoryForItem(item)
      counts[category] += 1
    })
    return counts
  }, [testerItems])
  const {
    shouldShow: shouldShowCompactHint,
    markSeen: markCompactHintSeen,
  } = useContextMenuHint('ruleTesterCompact')
  const [compactHintPos, setCompactHintPos] = useState<{ x: number; y: number } | null>(null)
  const compactHintActive = shouldShowCompactHint && compactHintPos !== null
  const handleCompactHintPointerMove = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    if (!shouldShowCompactHint) return
    setCompactHintPos({ x: event.clientX, y: event.clientY })
  }, [shouldShowCompactHint])
  const handleCompactHintPointerLeave = useCallback(() => {
    setCompactHintPos(null)
  }, [])
  const handleCompactHintSeen = useCallback(() => {
    markCompactHintSeen()
    setCompactHintPos(null)
  }, [markCompactHintSeen])
  useEffect(() => {
    if (!shouldShowCompactHint) {
      setCompactHintPos(null)
    }
  }, [shouldShowCompactHint])
  const manualEntries = useMemo(() => (
    testerItems
      .filter((item) => testerSourceCategoryForItem(item) === 'manual')
      .map((item) => ({ item }))
  ), [testerItems])
  const items = useMemo(() => manualEntries.map((entry) => entry.item), [manualEntries])
  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])
  const toggleHistoryRef = useRef<Map<number, number[]>>(new Map())
  const cookieTimeoutRef = useRef<Map<number, ReturnType<typeof window.setTimeout>>>(new Map())
  const [cookieMonsterExpiryByRow, setCookieMonsterExpiryByRow] = useState<Record<number, number>>({})
  const [compactByItemId, setCompactByRowId] = useState<Map<number, boolean>>(() => new Map())

  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const measuredHeightsRef = useRef<Map<number, number>>(new Map())
  const [rowHeightsVersion, setRowHeightsVersion] = useState(0)
  const estimateRowHeight = useCallback((isCompact: boolean): number => (
    isCompact ? TESTER_ROW_ESTIMATE_COMPACT_PX : TESTER_ROW_ESTIMATE_EXPANDED_PX
  ), [])
  const isItemCompact = useCallback((item: TesterItem): boolean => {
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
  const setsMenuListRefs = useRef<Record<number, HTMLUListElement | null>>({})
  const [pendingDeleteSource, setPendingDeleteSource] = useState<TesterSourceCategory | null>(null)
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
  // Keeping the grouped structure inline for clarity in the Rule Tester.

  // Observe the tester scroll container while open so virtualization keeps viewport height and scroll offsets in sync.
  useEffect(() => {
    const node = scrollContainerRef.current
    if (!node) return
    const observer = new ResizeObserver(() => {
      setViewportHeight(node.clientHeight)
    })
    observer.observe(node)
    setViewportHeight(node.clientHeight)
    setScrollTop(node.scrollTop)
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

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop)
  }, [])

  const registerRowHeight = useCallback((itemId: number, height: number) => {
    if (!Number.isFinite(height)) return
    const nextHeight = Math.max(1, Math.round(height))
    const map = measuredHeightsRef.current
    const prev = map.get(itemId)
    if (prev === nextHeight) return
    map.set(itemId, nextHeight)
    setRowHeightsVersion((v) => v + 1)
  }, [])
  const scrollTesterSetsMenuToSelected = useCallback((itemIdx: number, orderOverride?: 'game' | 'az' | 'icons', opts?: { force?: boolean }) => {
    if (!opts?.force && setsMenuOpenIdx !== itemIdx) return
    const order = orderOverride ?? setsOrder
    if (order === 'icons') return
    const list = setsMenuListRefs.current[itemIdx]
    if (!list) return
    const item = items[itemIdx]
    if (!item) return
    const setIdNumber = Number(item.set ?? 0)
    if (setIdNumber <= 0 || setIdNumber === ACCESSORY_NO_SET_ID) return
    const validIds = new Set<number>(allowedTesterSetIds(item.slot))
    const sortedForOrder = filterAndSortSetEntries(setsSearch, order, { translate: t }).filter(([id]) => validIds.has(Number(id)))
    const hasTarget = sortedForOrder.some(([id]) => Number(id) === setIdNumber)
    if (!hasTarget) return
    requestAnimationFrame(() => {
      const node = list.querySelector<HTMLElement>(`[data-set-id="${setIdNumber}"]`)
      node?.scrollIntoView({ block: 'nearest' })
    })
  }, [items, setsMenuListRefs, setsMenuOpenIdx, setsOrder, setsSearch, t])

  const { rowOffsets, rowHeights, totalContentHeight } = useMemo(() => {
    void rowHeightsVersion
    const map = measuredHeightsRef.current
    const activeRowIds = new Set<number>(items.map((it) => it.itemId))
    for (const key of Array.from(map.keys())) {
      if (!activeRowIds.has(key)) map.delete(key)
    }
    const offsets: number[] = []
    const heights: number[] = []
    let total = 0
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] as TesterItem
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
  }, [items, estimateRowHeight, rowHeightsVersion, isItemCompact])

  const visibleIndices = useMemo(() => {
    if (items.length === 0) return []
    const fallbackViewport = viewportHeight > 0
      ? viewportHeight
      : TESTER_ROW_ESTIMATE_COMPACT_PX * 4
    const overscan = Math.max(TESTER_VIRTUAL_OVERSCAN_PX, TESTER_ROW_ESTIMATE_EXPANDED_PX)
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
  }, [items.length, rowOffsets, rowHeights, scrollTop, totalContentHeight, viewportHeight])

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

  const rarityLabel = useCallback((n: 1|2|3|4|5|6): string => (
    n === 1 ? t('rarityCommon')
      : n === 2 ? t('rarityUncommon')
        : n === 3 ? t('rarityRare')
          : n === 4 ? t('rarityEpic')
            : n === 5 ? t('rarityLegendary')
              : t('rarityMythical')
  ), [t])

  const compactColumnTemplate = 'max-content max-content max-content minmax(0, 1fr)'

  const pruneEasterEggStateForItems = useCallback((nextItems: TesterItem[]) => {
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
    setCompactByRowId((prev) => {
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
  }, [setCompactByRowId])

  const updateItemAt = useCallback((index: number, updater: (item: TesterItem) => TesterItem) => {
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
    const duplicate = cloneManualTesterItem(anchor.item, allocTesterItemId)
    setItems((prev) => {
      // Insert immediately after the source row to keep surrounding context intact.
      const anchorIdx = prev.findIndex((entry) => entry.itemId === anchor.item.itemId)
      const insertIdx = anchorIdx === -1 ? prev.length : anchorIdx + 1
      const next = prev.slice()
      next.splice(insertIdx, 0, duplicate)
      pruneEasterEggStateForItems(next)
      return next
    })
  }, [allocTesterItemId, manualEntries, pruneEasterEggStateForItems, setItems])

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
    setItems((prev) => {
      const next = prev.concat(makeDefaultItem(allocTesterItemId))
      pruneEasterEggStateForItems(next)
      return next
    })
    requestAnimationFrame(() => {
      const node = scrollContainerRef.current
      if (node) {
        node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
      }
    })
  }, [allocTesterItemId, makeDefaultItem, pruneEasterEggStateForItems, setItems])

  const deletableSources = useMemo(() => ([
    { key: 'manual' as const, label: t('testerSourceManual') },
    { key: 'inventory' as const, label: t('testerSourceInventory') },
    { key: 'collection' as const, label: t('testerSourceEquippedCollection') },
    { key: 'vault' as const, label: t('testerSourceEquippedVault') },
    { key: 'inbox' as const, label: t('testerSourceInbox') },
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

  const handleDeleteBySource = useCallback((category: TesterSourceCategory) => {
    setItems((prev) => {
      const next = prev.filter((entry) => testerSourceCategoryForItem(entry) !== category)
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
    const recent = existing.filter((ts) => (now - ts) <= TESTER_COOKIE_WINDOW_MS)
    recent.push(now)
    history.set(itemId, recent)
    if (recent.length >= TESTER_COOKIE_TOGGLE_THRESHOLD) {
      history.set(itemId, [])
      setCookieMonsterExpiryByRow((prev) => ({
        ...prev,
        [itemId]: now + TESTER_COOKIE_ANIMATION_MS,
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
      }, TESTER_COOKIE_ANIMATION_MS)
      cookieTimeoutRef.current.set(itemId, timeoutId)
    }
  }, [])

  const applyGlobalCompactState = useCallback((nextState: boolean) => {
    setCompactByRowId(() => {
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
  }, [setCompactByRowId])

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
    setCompactByRowId((prev) => {
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

  const renderTesterRow = (it: TesterItem, idx: number): JSX.Element => {
    const itemId = Number(it.itemId)
    const isCompact = isItemCompact(it)
    const match = Number.isFinite(itemId) ? testerMatches.get(itemId) ?? null : null
    const cfgIdx = match?.cfgIdx ?? null
    const cfg = (cfgIdx != null ? customCfgs[cfgIdx] : undefined)
    const cfgFactionCode = cfg ? Number((cfg as { factionCode?: number }).factionCode ?? 0) : 0
    const configIcon = (showFactionIcons && cfgFactionCode > 0)
      ? <FactionIcon faction={cfgFactionCode as FactionId} size={TESTER_COMPACT_ICON_SIZE_PX} sx={{ mr: 0 }} />
      : undefined
    const subEntries = entriesInOrder(it)
    const slotValue = Number(it.slot)
    const slotDef = Number.isFinite(slotValue) ? artifactTypeIconList.find(d => Number(d.id) === slotValue) : undefined
    const SlotIconComponent = slotDef?.Icon
    const slotLabel = slotValue === TESTER_ANY_SLOT_ID
      ? t('any')
      : (slotDef ? t(artifactTypeI18nKey(slotDef.id)) : '')
    const accessorySlot = isAccessorySlot(it.slot)
    const allowedSetIdsForSlot = allowedTesterSetIds(it.slot)
    const normalizedSetId = normalizeTesterSetForSlot(it.slot, (it.set ?? ACCESSORY_NO_SET_ID) as ArtifactSetId)
    const setIdNumber = Number(normalizedSetId)
    const setNameCanonical = setIdNumber > 0 ? artifactSetName(setIdNumber) : ''
    const showSetChip = !(accessorySlot && setIdNumber === ACCESSORY_NO_SET_ID)
    const setLabel = formatTesterSetLabel({ setId: setIdNumber, slot: it.slot, translate: t, lang })
    const setIconNode = setIdNumber > 0
      ? <SetIcon setId={setIdNumber} label={setNameCanonical} size={TESTER_COMPACT_ICON_SIZE_PX} sx={{ mr: 0 }} />
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
    const manualItem = isManualTesterItem(it)
    const factionValue = Number(it.faction ?? 0)
    const showFactionChip = accessorySlot && factionValue !== 0
    const factionLabel = showFactionChip ? t(factionI18nKey(factionValue)) : ''
    // Compact summary always renders the faction icon so the chip matches the
    // Sellfile Preview regardless of the global icon preference.
    const showFactionIcon = showFactionChip
    const mainValue = Number(it.main ?? -1)
    const mainOptions = mainOptionsForSlot(it.slot, mainValue)
    const mainLabel = mainValue < 0 ? t('any') : t(statVariantI18nKey(mainValue))
    const mainColor = mainValue >= 0 ? (substatColors[mainValue]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[mainValue]) : undefined
    const levelChipLabel = levelLabel
      ? (manualItem ? levelLabel : t('gearDialogLevelLabel', { level: levelLabel }))
      : t('any')
    const mainSummaryColor = (statButtonBorders && mainColor) ? mainColor : undefined
    const factionChipLabel = factionLabel
    const factionIconNode = showFactionIcon
      ? <FactionIcon faction={factionValue as FactionId} size={TESTER_COMPACT_ICON_SIZE_PX} sx={{ mr: 0 }} />
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
      const color = substatColors[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]
      return {
        variant,
        label: `${t(statVariantI18nKey(variant))} ${numericValue}`.trim(),
        color,
      }
    })
    const cookieMonsterActive = Object.prototype.hasOwnProperty.call(cookieMonsterExpiryByRow, it.itemId)
    const toggleTooltip = cookieMonsterActive ? 'Coookieees!' : (isCompact ? t('expanded') : t('compact'))
    const ruleChipNode = (
      <TesterRuleReferenceChip
        match={match}
        onJump={onView}
        showFinalSellLabel
        icon={configIcon}
        sx={{
          maxWidth: TESTER_CONFIG_CHIP_MAX_WIDTH_PX,
          width: '100%',
          '& .MuiChip-label': {
            whiteSpace: 'nowrap',
          },
          ...(configIcon ? {
            pl: 0.5,
            '& .MuiChip-icon': {
              color: 'inherit',
              mr: 0.25,
            },
          } : {}),
        }}
      />
    )
    return (
      <Box sx={{ borderBottom: theme => `1px solid ${theme.palette.divider}`, pb: 1, display: 'grid', gridTemplateColumns: `${TESTER_ROW_CONTROLS_WIDTH_PX}px minmax(0,1fr) ${TESTER_ICON_COLUMN_WIDTH_PX}px`, columnGap: 1 }}>
        <Stack
          direction="column"
          spacing={0.5}
          alignItems="stretch"
          sx={{
            mr: 0.5,
            gridColumn: '1',
            gridRow: '1',
            position: 'relative',
            width: TESTER_ROW_CONTROLS_WIDTH_PX,
            ...(cookieMonsterActive
              ? {
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: TESTER_COOKIE_HALO_DIAMETER_PX,
                    height: TESTER_COOKIE_HALO_DIAMETER_PX,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    opacity: 0.92,
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                    boxShadow: (theme) => `0 0 18px ${theme.palette.primary.light}b0`,
                    animation: `${testerCookiePulse} 1.5s ease-in-out infinite`,
                    zIndex: 0,
                  },
                  '& > *': {
                    position: 'relative',
                    zIndex: 1,
                  },
                }
              : {}),
          }}
        >
          <Stack direction="row" spacing={0.25} alignItems="center" sx={{ width: '100%', justifyContent: 'center' }}>
            {/* Button tooltips now flow through MarkdownTooltip so the cookie-monster easter egg and normal hints share formatting. */}
            <MarkdownTooltip markdown={t('gearDialogDuplicateRowAction')}>
              <IconButton size="small" onClick={() => duplicateItemAt(idx)} aria-label={t('gearDialogDuplicateRowAction')} sx={{
                p: 0.25,
                ...(cookieMonsterActive ? {
                  '& svg': {
                    animation: `${testerCookieIconWobble} 1.15s ease-in-out infinite`,
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
                        animation: `${testerCookieIconWobble} 1.15s ease-in-out infinite`,
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
                    animation: `${testerCookieFlip} 1.2s ease-in-out infinite`,
                    transformOrigin: '50% 50%',
                  },
                } : {}),
              }}
              onClick={(event) => handleToggleCompact(it.itemId, event)}
              onMouseEnter={handleCompactHintPointerMove}
              onMouseMove={handleCompactHintPointerMove}
              onMouseLeave={handleCompactHintPointerLeave}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleCompactHintSeen()
                handleToggleCompact(it.itemId, event, { applyGlobally: true })
              }}
            >
              {isCompact ? <OpenInFullIcon fontSize="small" /> : <CloseFullscreenIcon fontSize="small" />}
            </Button>
          </MarkdownTooltip>
        </Stack>
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
              <TesterSummaryLabel label={slotLabel} icon={slotIconNode || undefined} />
            </Box>
            <Box sx={{ gridColumn: '2', gridRow: '1', display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <TesterSummaryLabel label={rankLabel(it.rank)} />
            </Box>
            <Box sx={{ gridColumn: '3', gridRow: '1', display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <TesterSummaryLabel label={rarityLabel(it.rarity)} />
            </Box>
            <Box sx={{ gridColumn: '4', gridRow: '1', display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
              <TesterSummaryLabel label={mainLabel} color={mainSummaryColor} />
            </Box>
            <Box sx={{ gridColumn: '1', gridRow: '2', display: showSetChip ? 'flex' : 'none', alignItems: 'center', minWidth: 0 }}>
              {showSetChip ? <TesterSummaryLabel label={setLabel} icon={setIconNode || undefined} /> : null}
            </Box>
            <Box sx={{ gridColumn: '2', gridRow: '2', display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <TesterSummaryLabel label={levelChipLabel} />
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
                  <MarkdownTooltip markdown={factionLabel}>
                    <Box sx={{ minWidth: 0 }}>
                      <TesterSummaryLabel label={factionChipLabel} icon={factionIconNode} />
                    </Box>
                  </MarkdownTooltip>
                ) : (
                  <TesterSummaryLabel label={factionChipLabel} />
                )
              ) : null}
            </Box>
            <Box sx={{ gridColumn: '4', gridRow: '2', display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
              {substatSummaries.map((entry) => {
                const subSummaryColor = statButtonBorders ? entry.color : undefined
                return (
                  <Box key={`sub-${entry.variant}`} sx={{ minWidth: 0 }}>
                    <TesterSummaryLabel label={entry.label} color={subSummaryColor} />
                  </Box>
                )
              })}
            </Box>
          </Box>
        ) : (
          <Box
            // Control strip mirrors Builder selectors: slot/rank/rarity/main stay aligned in one row.
          sx={{ gridColumn: '2', display: 'grid', gridTemplateColumns: TESTER_CONTROL_GRID_TEMPLATE, columnGap: 1, rowGap: 1, alignItems: 'center' }}
        >
          <GearSlotSelect
            value={slotValue === TESTER_ANY_SLOT_ID ? null : (slotValue as ArtifactTypeId)}
            onChange={(nextSlot) => {
              updateItemAt(idx, (v) => {
                const resolvedSlot = (nextSlot == null ? TESTER_ANY_SLOT_ID : nextSlot) as ArtifactTypeId
                const currentMain = Number(v.main ?? -1)
                const supportsMain = (Number(resolvedSlot) === TESTER_ANY_SLOT_ID) || slotSupportsMain(resolvedSlot, currentMain)
                const fixedMain = (currentMain === -1 || Number.isNaN(currentMain) || supportsMain)
                  ? currentMain
                  : (Array.from(ALLOWED_MAIN_BY_SLOT[Number(resolvedSlot) as ArtifactType] || [])[0] ?? -1)
                const allowedForSlot = new Set<number>(allowedTesterSetIds(resolvedSlot))
                const fixedSet = allowedForSlot.has(Number(v.set))
                  ? v.set
                  : (allowedForSlot.size > 0 ? (Array.from(allowedForSlot)[0] as ArtifactSetId) : v.set)
                const fixedFaction: FactionId = (() => {
                  if (!isAccessorySlot(resolvedSlot)) return 0 as FactionId
                  const existingFaction = Number(v.faction ?? 0) as FactionId
                  if (existingFaction && ACCESSORY_FACTION_POOL.includes(existingFaction)) {
                    return existingFaction
                  }
                  return pickRandomAccessoryFaction()
                })()
                const updated = { ...v, slot: resolvedSlot, main: fixedMain, set: fixedSet, faction: fixedFaction }
                return adjustSubValuesFor(updated)
              })
            }}
            size="small"
            sx={{
              width: TESTER_SLOT_SELECT_WIDTH_PX,
              height: TESTER_SELECT_HEIGHT_PX,
              display: 'inline-flex',
              alignItems: 'center',
              '& .MuiSelect-select': {
                ...TESTER_SELECT_VALUE_BASE_SX,
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
              width: TESTER_RANK_SELECT_WIDTH_PX,
              height: TESTER_SELECT_HEIGHT_PX,
              display: 'inline-flex',
              alignItems: 'center',
              '& .MuiSelect-select': TESTER_SELECT_VALUE_BASE_SX,
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
              width: TESTER_RARITY_SELECT_WIDTH_PX,
              height: TESTER_SELECT_HEIGHT_PX,
              display: 'inline-flex',
              alignItems: 'center',
              '& .MuiSelect-select': TESTER_SELECT_VALUE_BASE_SX,
            }}
          />
          <GearMainStatSelect
            value={mainValue as number}
            options={mainOptions}
            onChange={(variant) => {
              updateItemAt(idx, (v) => adjustSubValuesFor({ ...v, main: Number(variant) }))
            }}
            colorOverrides={substatColors}
            showBorderColors={statButtonBorders}
            size="small"
            sx={{
              width: TESTER_MAINSTAT_SELECT_MIN_WIDTH_PX,
              height: TESTER_SELECT_HEIGHT_PX,
              display: 'inline-flex',
              alignItems: 'center',
              '& .MuiSelect-select': TESTER_SELECT_VALUE_BASE_SX,
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
              minHeight: TESTER_RESULT_ROW_MIN_HEIGHT_PX,
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
                  label={t('testerNoMatch')}
                />
              )}
            </Box>
          </Box>
        )}
        {!isCompact && (
          <Box sx={{ gridColumn: '2', gridRow: '2', display: 'grid', gridTemplateColumns: TESTER_CONTROL_GRID_TEMPLATE, columnGap: 1, rowGap: 1, mt: 0.5, alignItems: 'center' }}>
            {(() => {
              const validIds = new Set<number>(allowedSetIdsForSlot)
              const sorted = filterAndSortSetEntries(setsSearch, setsOrder, { translate: t }).filter(([id]) => validIds.has(Number(id)))
              const setValue = (accessorySlot && setIdNumber === ACCESSORY_NO_SET_ID) ? '' : String(setIdNumber)
              const setOptionMissing = setValue !== '' && !sorted.some(([id]) => id === setValue)
              const currentSetLabel = formatTesterSetLabel({ setId: setIdNumber, slot: it.slot, translate: t, lang })
              return (
                <Select
                  size="small"
                  displayEmpty
                  open={setsMenuOpenIdx === idx}
                  value={setValue}
                  onChange={e => {
                    updateItemAt(idx, (v) => {
                      const raw = e.target.value
                      if (raw === '') {
                        return adjustSubValuesFor({ ...v, set: (ACCESSORY_NO_SET_ID as unknown as ArtifactSetId) })
                      }
                      const numeric = Number(raw)
                      if (!Number.isFinite(numeric)) return adjustSubValuesFor(v)
                      const allowedForSlot = allowedTesterSetIds(v.slot)
                      if (allowedForSlot.includes(numeric)) {
                        return adjustSubValuesFor({ ...v, set: numeric as ArtifactSetId })
                      }
                      if (isAccessorySlot(v.slot)) {
                        return adjustSubValuesFor({ ...v, set: (ACCESSORY_NO_SET_ID as unknown as ArtifactSetId) })
                      }
                      return adjustSubValuesFor({ ...v, set: normalizeTesterSetForSlot(v.slot, numeric as ArtifactSetId) })
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
                      scrollTesterSetsMenuToSelected(idx, setsOrder, { force: true })
                    }))
                  }}
                  renderValue={(value) => {
                    if (value === '') return t('noSetAccessories')
                    const setNum = Number(value)
                    const Label = getLocalizedGearSetName(setNum as ArtifactSetId, t, lang) || artifactSetName(setNum)
                    const setNameForIcon = artifactSetName(setNum)
                    const Icon = setNum > 0 ? <SetIcon setId={setNum} label={setNameForIcon} size={20} /> : null
                    return (
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        {Icon}
                        <span>{Label}</span>
                      </Box>
                    )
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: { width: { xs: 'calc(100vw - 32px)', sm: SETS_MENU_WIDTH_PX }, maxWidth: SETS_MENU_WIDTH_PX, overflowX: 'hidden' },
                      ref: (el: HTMLDivElement | null) => { setsMenuPaperRef.current = el },
                    },
                    MenuListProps: {
                      sx: {
                        width: '100%',
                        maxWidth: '100%',
                        ...(setsOrder === 'icons'
                          ? {}
                          : { maxHeight: MENU_MAX_HEIGHT_SETS_LIST_PX + MENU_MAX_HEIGHT_EXTRA_BUFFER, overflowY: 'auto' as const }),
                      },
                    },
                    TransitionProps: {
                      onExited: () => {
                        setSetsMenuAnchorPos(null)
                        setsMenuPaperRef.current = null
                      },
                    },
                    ...(setsMenuAnchorPos
                      ? { anchorReference: 'anchorPosition' as const, anchorPosition: setsMenuAnchorPos, transformOrigin: { vertical: 'top', horizontal: 'left' as const } }
                      : { transformOrigin: { vertical: 'top', horizontal: 'left' as const } }),
                  }}
                  sx={{
                    width: TESTER_SET_SELECT_WIDTH_PX,
                    height: TESTER_SELECT_HEIGHT_PX,
                    display: 'inline-flex',
                    alignItems: 'center',
                    '& .MuiSelect-select': {
                      ...TESTER_SELECT_VALUE_BASE_SX,
                      columnGap: TESTER_SELECT_GAP_COMPACT_PX,
                      whiteSpace: 'nowrap',
                    },
                  }}
                >
                  {setValue !== '' ? (
                    // Hidden option ensures MUI always sees the active value even if search filters it out.
                    <MenuItem value={setValue} sx={{ display: 'none' }}>
                      {currentSetLabel}
                    </MenuItem>
                  ) : null}
                  {setOptionMissing ? (
                    <MenuItem value={setValue} sx={{ fontStyle: 'italic' }}>
                      {currentSetLabel}
                    </MenuItem>
                  ) : null}
                  {isAccessorySlot(it.slot) && (
                    <MenuItem value={''} sx={{ display: 'flex', alignItems: 'center' }}>
                      {t('noSetAccessories')}
                    </MenuItem>
                  )}
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
                                requestAnimationFrame(() => scrollTesterSetsMenuToSelected(setsMenuOpenIdx, v, { force: true }))
                              }
                            }}
                            zeroResults={sorted.length === 0}
                          />
                        </Box>
                      </Box>
                    </ListSubheader>
                    <Box
                      component="ul"
                      ref={(el: HTMLUListElement | null) => { setsMenuListRefs.current[idx] = el }}
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
                        sorted={sorted}
                        setsOrder={setsOrder}
                        metasets={metasets}
                        excludeMetasetId={null}
                        setUsageCounts={{}}
                        valueForSet={(id) => String(id)}
                        hideHeader
                        selectedSetIds={setIdNumber === ACCESSORY_NO_SET_ID ? [] : [setIdNumber]}
                        showUsageCounts={false}
                        singleSelect
                        onToggleSet={(id: number) => {
                          updateItemAt(idx, (v) => {
                            const allowedForSlot = allowedTesterSetIds(v.slot)
                            if (isAccessorySlot(v.slot) && Number(v.set) === Number(id)) {
                              return adjustSubValuesFor({ ...v, set: (ACCESSORY_NO_SET_ID as unknown as ArtifactSetId) })
                            }
                            if (allowedForSlot.includes(Number(id))) {
                              return adjustSubValuesFor({ ...v, set: id as ArtifactSetId })
                            }
                            if (isAccessorySlot(v.slot)) {
                              return adjustSubValuesFor({ ...v, set: (ACCESSORY_NO_SET_ID as unknown as ArtifactSetId) })
                            }
                            return adjustSubValuesFor({ ...v, set: normalizeTesterSetForSlot(v.slot, id as ArtifactSetId) })
                          })
                          requestAnimationFrame(() => setSetsMenuOpenIdx(null))
                        }}
                      />
                    </Box>
                  </Box>
                </Select>
              )
            })()}
            <Select size="small" value={it.level} onChange={e => updateItemAt(idx, (v) => {
              const updated = { ...v, level: Number(e.target.value) as LevelMilestone }
              return adjustSubValuesFor(updated)
            })} sx={{
              width: TESTER_LEVEL_SELECT_WIDTH_PX,
              height: TESTER_SELECT_HEIGHT_PX,
              display: 'inline-flex',
              alignItems: 'center',
              '& .MuiSelect-select': TESTER_SELECT_VALUE_BASE_SX,
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
                width: TESTER_FACTION_SELECT_WIDTH_PX,
                height: TESTER_SELECT_HEIGHT_PX,
                display: 'inline-flex',
                alignItems: 'center',
                '& .MuiSelect-select': {
                  ...TESTER_SELECT_VALUE_BASE_SX,
                },
              }}
            />
          </Box>
        )}
        {!isCompact && (
          <Box sx={{ gridColumn: '2', display: 'grid', gridTemplateColumns: `repeat(2, ${TESTER_SUBSTAT_EDITOR_WIDTH_PX}px)`, columnGap: 1, rowGap: 0.5, mt: 0.5 }}>
            {subEntries.map(([v, value]) => {
              const star = Math.max(1, Math.min(6, Number(it.rank || 6))) as 1|2|3|4|5|6
              const baseStep = (
                star === 6 ? (substatTargets.six[v] || 0) : star === 5 ? (substatTargets.five[v] || 0) : star === 4 ? (substatTargets.four[v] || 0) : star === 3 ? (substatTargets.three[v] || 0) : star === 2 ? (substatTargets.two[v] || 0) : (substatTargets.one[v] || 0)
              )
              const step = Math.max(1, baseStep)
              const parsedValue = Number(value)
              const numericValue = Number.isFinite(parsedValue) ? parsedValue : 0
              const usedOthers = new Set<number>(subEntries.filter(([kk]) => Number(kk) !== v).map(([kk]) => Number(kk)))
              const candidates = STAT_VARIANTS_PRIORITY
                .filter(x => (Number(it.slot) === TESTER_ANY_SLOT_ID || slotSupportsSub(it.slot, x)) && !usedOthers.has(Number(x)) && !subEqualsMainVariant(x, mainValue))
              const clampTesterValue = (raw: number): number => {
                if (!Number.isFinite(raw)) return 1
                return Math.max(1, Math.round(raw))
              }
              const commitSubstatValue = (nextValue: number) => {
                updateItemAt(idx, (it2) => {
                  const base = { ...it2, subValues: { ...(it2.subValues || {}), [v]: nextValue } }
                  const updated = (it2.subOrder && it2.subOrder.length > 0) ? { ...base, subOrder: [...it2.subOrder] } : base
                  return adjustSubValuesFor(updated as TesterItem)
                })
              }
              const applyStepDelta = (delta: number) => {
                const next = numericValue + (delta * step)
                commitSubstatValue(clampTesterValue(next))
              }
              return (
                <Stack key={v} direction="row" spacing={0.5} alignItems="center" sx={{ width: `${TESTER_SUBSTAT_EDITOR_WIDTH_PX}px`, borderRadius: 1, px: 0.75, py: 0.25 }}>
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
                        if (pos !== -1) beforeOrder[pos] = nv
                        const nextVals: Record<number, number> = { ...beforeVals }
                        delete nextVals[v]
                        const adjusted = Math.max(1, numericValue)
                        nextVals[nv] = adjusted
                        const updated = { ...it2, subValues: nextVals, subOrder: beforeOrder }
                        return adjustSubValuesFor(updated)
                      })
                    }}
                    sx={{
                      width: TESTER_SUBSTAT_SELECT_MIN_WIDTH_PX,
                      height: TESTER_SELECT_HEIGHT_PX,
                      display: 'inline-flex',
                      alignItems: 'center',
                      '& .MuiSelect-select': {
                        ...TESTER_SELECT_VALUE_BASE_SX,
                        color: statButtonBorders ? (substatColors[v]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[v]) : undefined,
                      },
                    }}
                  >
                    {[v, ...candidates.filter(x => x !== v)].map(opt => (
                      <MenuItem key={opt} value={opt} sx={{ color: statButtonBorders ? (substatColors[opt]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[opt]) : undefined }}>{t(statVariantI18nKey(opt))}</MenuItem>
                    ))}
                  </Select>
                  <Stack direction="row" spacing={0.25} alignItems="center" sx={{ flex: 1 }}>
                    <IconButton
                      size="small"
                      aria-label="decrease"
                      onClick={() => applyStepDelta(-1)}
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
                        commitSubstatValue(clampTesterValue(raw))
                      }}
                      inputProps={{
                        inputMode: 'numeric',
                        pattern: '[0-9]*',
                        min: 0,
                        'aria-label': t(statVariantI18nKey(v)),
                      }}
                      sx={(theme) => ({
                        width: 88,
                        '& input': {
                          textAlign: 'right',
                          paddingRight: theme.spacing(1),
                          paddingLeft: theme.spacing(0.25),
                        },
                        '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                          WebkitAppearance: 'none',
                          margin: 0,
                        },
                        '& input[type=number]': {
                          MozAppearance: 'textfield',
                        },
                      })}
                      InputProps={{
                        endAdornment: (
                          <NumberSpinnerAdornment
                            ariaLabel={t(statVariantI18nKey(v))}
                            onStep={(delta) => {
                              const next = numericValue + delta
                              commitSubstatValue(clampTesterValue(next))
                            }}
                          />
                        ),
                        sx: { '& > *': { alignItems: 'center' } },
                      }}
                    />
                    <IconButton
                      size="small"
                      aria-label="increase"
                      onClick={() => applyStepDelta(1)}
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
              minHeight: TESTER_RESULT_ROW_MIN_HEIGHT_PX,
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
                  label={t('testerNoMatch')}
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

  // No Import/Export buttons; autosave restores when the tester view mounts.

  const layoutRenderer = renderLayout ?? defaultGearTesterTabLayout

  const contentNode = (
    <Box
      data-tour-id="tester.dialog"
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
              <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
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
            {visibleIndices.map((idx) => {
              const item = items[idx] as TesterItem
              return (
                <MeasuredTesterRow key={item.itemId} itemId={item.itemId} registerHeight={registerRowHeight}>
                  {renderTesterRow(item, idx)}
                </MeasuredTesterRow>
              )
            })}
            {bottomSpacerHeight > 0 ? <Box sx={{ height: bottomSpacerHeight }} /> : null}
          </Box>
	        ) : (
	          <EmptyStateMessage minHeight="100%" verticalAlign={emptyStateVerticalAlign}>
	            {t('testerTableEmpty')}
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
        <Button data-tour-id="tester.add-manual" onClick={handleAddManualGear}>{t('gearDialogAddManualGear')}</Button>
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
      <ContextMenuHintOverlay text={t('contextMenuHint')} position={compactHintActive ? compactHintPos : null} />
    </>
  )
}

const defaultGearTesterTabLayout = ({ content, actions }: GearTesterTabLayoutSlots): ReactNode => (
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

type MeasuredTesterRowProps = {
  itemId: number
  registerHeight: (itemId: number, height: number) => void
  children: ReactNode
}

function MeasuredTesterRow({ itemId, registerHeight, children }: MeasuredTesterRowProps) {
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

  return <Box ref={rowRef}>{children}</Box>
}

export default GearTesterTabContent
