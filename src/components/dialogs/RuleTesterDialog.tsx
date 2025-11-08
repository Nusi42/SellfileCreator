/**
 * RuleTesterDialog
 *
 * Virtualized rule tester with inline editors for every artifact slot. Shares
 * the Builder numeric spinners, metaset/set menus, and attention cues so the
 * tester mirrors the Builder UX while operating on ad-hoc “what if” items.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, UIEvent, Dispatch, SetStateAction } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Select, Stack, Tooltip, Typography, Chip, TextField, ListSubheader, keyframes } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen'
import DeleteIcon from '@mui/icons-material/Delete'
import type { BuilderConfig } from '../../lib/hsfBuilder'
import type { ArtifactSetId, ArtifactTypeId, FactionId, LevelMilestone } from '../../lib/types'
import { ArtifactType, /* rarityCodeToName, */ formatLevel, slotSupportsSub, slotSupportsMain, ALLOWED_MAIN_BY_SLOT, Faction, factionI18nKey, filterAndSortSetEntries, artifactTypeI18nKey, artifactSetName, artifactSetI18nKey, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, statVariantI18nKey, StatId, LEVEL_MILESTONES, STAT_VARIANTS_PRIORITY } from '../../lib/types'
import { allowedTesterSetIds, isAccessorySlot, normalizeTesterSetForSlot } from '../../lib/testerDomain'
import { formatTesterSetLabel } from '../../lib/testerFormatters'
import { variantToSub, variantToMain } from '../../lib/hsfTypes'
import { artifactTypeIconList } from '../artifactTypeIcons'
import type { TestItem } from '../../lib/ruleEval'
import { useI18n } from '../../lib/i18n'
import { useAppState } from '../../state/appState'
import SetMenuSection from '../SetMenuSection'
import { SetIcon } from '../SetIcon'
import { FactionOptionLabel, FactionIcon } from '../FactionIcon'
import SetsOrderControls from '../SetsOrderControls'
import { NumberSpinnerAdornment } from '../NumberSpinnerAdornment'
import { SETS_MENU_WIDTH_PX, MENU_MAX_HEIGHT_SETS_LIST_PX, MENU_MAX_HEIGHT_EXTRA_BUFFER, MENU_SCROLL_GUTTER_PX, MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, LIST_SUBHEADER_SX, TESTER_SUBSTAT_EDITOR_WIDTH_PX, TESTER_ROW_CONTROLS_WIDTH_PX, ACCESSORY_NO_SET_ID, TESTER_ANY_SLOT_ID, TESTER_MAINSTAT_SELECT_MIN_WIDTH_PX, TESTER_SUBSTAT_SELECT_MIN_WIDTH_PX, TESTER_SLOT_SELECT_WIDTH_PX, TESTER_SET_SELECT_WIDTH_PX, TESTER_FACTION_SELECT_WIDTH_PX, TESTER_RANK_SELECT_WIDTH_PX, TESTER_RARITY_SELECT_WIDTH_PX, TESTER_LEVEL_SELECT_WIDTH_PX, TESTER_SELECT_HEIGHT_PX, TESTER_RESULT_ROW_MIN_HEIGHT_PX, TESTER_CONFIG_CHIP_MAX_WIDTH_PX, TESTER_DIALOG_WIDTH_PX, TESTER_DIALOG_HEIGHT_PX, TESTER_VIRTUAL_OVERSCAN_PX, TESTER_ROW_ESTIMATE_COMPACT_PX, TESTER_ROW_ESTIMATE_EXPANDED_PX, TESTER_COMPACT_ICON_SIZE_PX } from '../../lib/constants'
import { useDisplayPreferences } from '../../state/preferencesState'
import type { Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import { createRuleTesterMath, entriesInOrder, fingerprintRuleTesterItem, mainOptionsForSlot, type RuleTesterItem } from '../../lib/ruleTesterSession'
import type { TesterPreviewMatch } from '../../types/testerPreview'
import { TesterSummaryLabel } from '../TesterSummaryLabel'
import { TesterRuleReferenceChip } from '../TesterRuleReferenceChip'

type TesterSourceCategory = 'manual' | 'inventory' | 'collection' | 'vault' | 'inbox'
type TesterSourceCountMap = Record<TesterSourceCategory, number>

const testerSourceCategoryForItem = (item: RuleTesterItem): TesterSourceCategory => {
  const extras = item.previewExtras
  const baseSource = extras?.source
  if (!baseSource || baseSource === 'tester') return 'manual'
  if (baseSource === 'inbox') return 'inbox'
  if (extras?.equippedToChampionId != null) {
    const loc = extras.equippedChampionLocation
    return loc === 'vault' || loc === 'reserveVault' ? 'vault' : 'collection'
  }
  return 'inventory'
}

// Single grid template keeps the first two rows of controls perfectly aligned.
const TESTER_CONTROL_GRID_TEMPLATE = `${TESTER_SLOT_SELECT_WIDTH_PX}px ${TESTER_RANK_SELECT_WIDTH_PX}px ${TESTER_RARITY_SELECT_WIDTH_PX}px ${TESTER_MAINSTAT_SELECT_MIN_WIDTH_PX}px`
const TESTER_SELECT_GAP_DEFAULT_PX = 8
const TESTER_SELECT_GAP_COMPACT_PX = 6

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
const TESTER_IMPORT_CHUNK_SIZE = 250

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

export default function RuleTesterDialog({
  open,
  onClose,
  customCfgs,
  onView,
  substatColors,
  testerItems,
  setTesterItems,
  allocTesterRowId,
  testerMatches,
  pendingExternalItems = [],
  onConsumeExternalItems,
}: {
  open: boolean
  onClose: () => void
  customCfgs: BuilderConfig[]
  onView: (ruleIndex: number, cfgIdx: number | null) => void
  substatColors: Record<number, { fg: string; bg: string }>
  testerItems: RuleTesterItem[]
  setTesterItems: Dispatch<SetStateAction<RuleTesterItem[]>>
  allocTesterRowId: () => number
  testerMatches: ReadonlyMap<number, TesterPreviewMatch | null>
  pendingExternalItems?: TestItem[]
  onConsumeExternalItems?: () => void
}) {
  const { t } = useI18n()
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
  const [compactByRowId, setCompactByRowId] = useState<Map<number, boolean>>(() => new Map())

  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const measuredHeightsRef = useRef<Map<number, number>>(new Map())
  const [rowHeightsVersion, setRowHeightsVersion] = useState(0)
  const estimateRowHeight = useCallback((isCompact: boolean): number => (
    isCompact ? TESTER_ROW_ESTIMATE_COMPACT_PX : TESTER_ROW_ESTIMATE_EXPANDED_PX
  ), [])
  const isItemCompact = useCallback((item: TesterItem): boolean => {
    const rowId = Number(item.rowId)
    if (Number.isFinite(rowId) && compactByRowId.has(rowId)) {
      return compactByRowId.get(rowId)!
    }
    return Boolean((item as { compact?: boolean }).compact)
  }, [compactByRowId])
  // Local Sets menu state to mirror Filters/Builder
  const [setsOrder, setSetsOrder] = useState<'game' | 'az' | 'icons'>('icons')
  const [setsSearch, setSetsSearch] = useState('')
  const [setsMenuAnchorPos, setSetsMenuAnchorPos] = useState<{ top: number; left: number } | null>(null)
  const [setsMenuOpenIdx, setSetsMenuOpenIdx] = useState<number | null>(null)
  const setsMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const setsMenuListRefs = useRef<Record<number, HTMLUListElement | null>>({})
  const [pendingDeleteSource, setPendingDeleteSource] = useState<TesterSourceCategory | null>(null)
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
  }, [open])

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

  const registerRowHeight = useCallback((rowId: number, height: number) => {
    if (!Number.isFinite(height)) return
    const nextHeight = Math.max(1, Math.round(height))
    const map = measuredHeightsRef.current
    const prev = map.get(rowId)
    if (prev === nextHeight) return
    map.set(rowId, nextHeight)
    setRowHeightsVersion((v) => v + 1)
  }, [])
  const scrollTesterSetsMenuToSelected = useCallback((rowIdx: number, orderOverride?: 'game' | 'az' | 'icons', opts?: { force?: boolean }) => {
    if (!opts?.force && setsMenuOpenIdx !== rowIdx) return
    const order = orderOverride ?? setsOrder
    if (order === 'icons') return
    const list = setsMenuListRefs.current[rowIdx]
    if (!list) return
    const item = items[rowIdx]
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
    const activeRowIds = new Set<number>(items.map((it) => it.rowId))
    for (const key of Array.from(map.keys())) {
      if (!activeRowIds.has(key)) map.delete(key)
    }
    const offsets: number[] = []
    const heights: number[] = []
    let total = 0
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] as TesterItem
      offsets.push(total)
      const measured = map.get(item.rowId)
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
    const activeRowIds = new Set(nextItems.map((item) => item.rowId))
    const history = toggleHistoryRef.current
    for (const key of Array.from(history.keys())) {
      if (!activeRowIds.has(key)) {
        history.delete(key)
      }
    }
    for (const [rowId, timeoutId] of Array.from(cookieTimeoutRef.current.entries())) {
      if (!activeRowIds.has(rowId)) {
        window.clearTimeout(timeoutId)
        cookieTimeoutRef.current.delete(rowId)
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
    const rowId = target.item.rowId
    setItems((prev) => {
      const targetIdx = prev.findIndex((entry) => entry.rowId === rowId)
      if (targetIdx === -1) return prev
      const next = prev.slice()
      next[targetIdx] = updater(next[targetIdx]!)
      pruneEasterEggStateForItems(next)
      return next
    })
  }, [manualEntries, pruneEasterEggStateForItems, setItems])

  const insertItemAfter = useCallback((index: number) => {
    const anchor = manualEntries[index]
    const anchorRowId = anchor?.item.rowId ?? null
    setItems((prev) => {
      const anchorIdx = anchorRowId == null ? -1 : prev.findIndex((entry) => entry.rowId === anchorRowId)
      const insertIdx = anchorIdx === -1 ? prev.length : anchorIdx + 1
      const next = prev.slice()
      next.splice(insertIdx, 0, makeDefaultItem(allocTesterRowId))
      pruneEasterEggStateForItems(next)
      return next
    })
  }, [allocTesterRowId, manualEntries, makeDefaultItem, pruneEasterEggStateForItems, setItems])

  const deleteItemAt = useCallback((index: number) => {
    const target = manualEntries[index]
    if (!target) return
    const rowId = target.item.rowId
    setItems((prev) => {
      const next = prev.filter((entry) => entry.rowId !== rowId)
      if (next.length === prev.length) return prev
      pruneEasterEggStateForItems(next)
      return next
    })
  }, [manualEntries, pruneEasterEggStateForItems, setItems])

  const handleAddManualGear = useCallback(() => {
    setItems((prev) => {
      const next = prev.concat(makeDefaultItem(allocTesterRowId))
      pruneEasterEggStateForItems(next)
      return next
    })
    requestAnimationFrame(() => {
      const node = scrollContainerRef.current
      if (node) {
        node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
      }
    })
  }, [allocTesterRowId, makeDefaultItem, pruneEasterEggStateForItems, setItems])

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
  const registerCompactToggle = useCallback((rowId: number) => {
    const now = Date.now()
    const history = toggleHistoryRef.current
    const existing = history.get(rowId) ?? []
    const recent = existing.filter((ts) => (now - ts) <= TESTER_COOKIE_WINDOW_MS)
    recent.push(now)
    history.set(rowId, recent)
    if (recent.length >= TESTER_COOKIE_TOGGLE_THRESHOLD) {
      history.set(rowId, [])
      setCookieMonsterExpiryByRow((prev) => ({
        ...prev,
        [rowId]: now + TESTER_COOKIE_ANIMATION_MS,
      }))
      const activeTimeout = cookieTimeoutRef.current.get(rowId)
      if (activeTimeout != null) {
        window.clearTimeout(activeTimeout)
      }
      const timeoutId = window.setTimeout(() => {
        setCookieMonsterExpiryByRow((prev) => {
          if (!(rowId in prev)) return prev
          const next = { ...prev }
          delete next[rowId]
          return next
        })
        cookieTimeoutRef.current.delete(rowId)
      }, TESTER_COOKIE_ANIMATION_MS)
      cookieTimeoutRef.current.set(rowId, timeoutId)
    }
  }, [])

  const handleToggleCompact = useCallback((rowId: number) => {
    const baseState = (() => {
      const item = itemsRef.current.find((entry) => entry.rowId === rowId)
      return Boolean((item as { compact?: boolean })?.compact)
    })()
    setCompactByRowId((prev) => {
      const next = new Map(prev)
      const current = prev.has(rowId) ? prev.get(rowId)! : baseState
      const nextState = !current
      if (nextState === baseState) {
        next.delete(rowId)
      } else {
        next.set(rowId, nextState)
      }
      return next
    })
    registerCompactToggle(rowId)
  }, [registerCompactToggle])

  const renderTesterRow = (it: TesterItem, idx: number): JSX.Element => {
    const rowId = Number(it.rowId)
    const isCompact = isItemCompact(it)
    const match = Number.isFinite(rowId) ? testerMatches.get(rowId) ?? null : null
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
    const setLabel = formatTesterSetLabel({ setId: setIdNumber, slot: it.slot, translate: t })
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
    const levelChipLabel = levelLabel ? `Lv ${levelLabel}` : t('any')
    const mainSummaryColor = (statButtonBorders && mainColor) ? mainColor : undefined
    const factionChipLabel = factionLabel
    const factionIconNode = showFactionIcon
      ? <FactionIcon faction={factionValue as FactionId} size={TESTER_COMPACT_ICON_SIZE_PX} sx={{ mr: 0 }} />
      : null
    const substatSummaries = subEntries.map(([variant, rawValue]) => {
      const numericValue = Number(rawValue) || 0
      const color = substatColors[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]
      return {
        variant,
        label: `${t(statVariantI18nKey(variant))} ${numericValue}`.trim(),
        color,
      }
    })
    const cookieMonsterActive = Object.prototype.hasOwnProperty.call(cookieMonsterExpiryByRow, it.rowId)
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
      <Box sx={{ borderBottom: theme => `1px solid ${theme.palette.divider}`, pb: 1, display: 'grid', gridTemplateColumns: `${TESTER_ROW_CONTROLS_WIDTH_PX}px 1fr`, columnGap: 1 }}>
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
            <Tooltip title={t('add')}>
              <IconButton size="small" onClick={() => insertItemAfter(idx)} aria-label="add-row" sx={{
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
            </Tooltip>
            <Tooltip title={t('delete')}>
              <Box component="span" sx={{ display: 'inline-flex' }}>
                <IconButton
                  size="small"
                  color="warning"
                  onClick={() => deleteItemAt(idx)}
                  aria-label="remove-row"
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
            </Tooltip>
          </Stack>
          <Tooltip title={toggleTooltip}>
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
              onClick={() => handleToggleCompact(it.rowId)}
            >
              {isCompact ? <OpenInFullIcon fontSize="small" /> : <CloseFullscreenIcon fontSize="small" />}
            </Button>
          </Tooltip>
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
                  <Tooltip title={factionLabel}>
                    <Box sx={{ minWidth: 0 }}>
                      <TesterSummaryLabel label={factionChipLabel} icon={factionIconNode} />
                    </Box>
                  </Tooltip>
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
          <Select size="small" value={slotValue === TESTER_ANY_SLOT_ID ? '' : String(slotValue)} onChange={e => updateItemAt(idx, (v) => {
            const raw = e.target.value
            const newSlot = (raw === '' ? TESTER_ANY_SLOT_ID : Number(raw)) as ArtifactTypeId
            const currentMain = Number(v.main ?? -1)
            const supportsMain = (Number(newSlot) === TESTER_ANY_SLOT_ID) || slotSupportsMain(newSlot, currentMain)
            const fixedMain = (currentMain === -1 || Number.isNaN(currentMain) || supportsMain)
              ? currentMain
              : (Array.from(ALLOWED_MAIN_BY_SLOT[Number(newSlot) as ArtifactType] || [])[0] ?? -1)
            const allowedForSlot = new Set<number>(allowedTesterSetIds(newSlot))
            const fixedSet = allowedForSlot.has(Number(v.set))
              ? v.set
              : (allowedForSlot.size > 0 ? (Array.from(allowedForSlot)[0] as ArtifactSetId) : v.set)
            const fixedFaction: FactionId = (isAccessorySlot(newSlot) ? (v.faction as FactionId) : (0 as FactionId))
            const updated = { ...v, slot: newSlot, main: fixedMain, set: fixedSet, faction: fixedFaction }
            return adjustSubValuesFor(updated)
          })}
            renderValue={() => {
              if (slotValue === TESTER_ANY_SLOT_ID) {
                return <Typography variant="body2">{t('any')}</Typography>
              }
              return (
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                  {SlotIconComponent ? <SlotIconComponent fontSize="small" /> : null}
                  <span>{slotLabel}</span>
                </Box>
              )
            }}
            MenuProps={{
              PaperProps: { sx: { width: 360 } },
              MenuListProps: { sx: { width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, p: 1 } },
            }}
            sx={{
              width: TESTER_SLOT_SELECT_WIDTH_PX,
              height: TESTER_SELECT_HEIGHT_PX,
              display: 'inline-flex',
              alignItems: 'center',
              '& .MuiSelect-select': {
                ...TESTER_SELECT_VALUE_BASE_SX,
              },
            }}
          >
            {artifactTypeIconList.map(({ id, Icon }) => {
              const selected = slotValue === Number(id)
              return (
                <MenuItem
                  key={String(id)}
                  value={String(Number(id))}
                  selected={selected}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider', // Fill handles selected state so we avoid blue outlines.
                    borderRadius: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0.5,
                    py: 1,
                    '&.Mui-selected': { bgcolor: 'action.selected' },
                  }}
                >
                  <Icon fontSize="medium" />
                  <Typography variant="caption">{t(artifactTypeI18nKey(id))}</Typography>
                </MenuItem>
              )
            })}
          </Select>

          <Select size="small" value={it.rank} onChange={e => updateItemAt(idx, (v) => {
            const updated = { ...v, rank: Number(e.target.value) as 1|2|3|4|5|6 }
            return adjustSubValuesFor(updated)
          })} sx={{
            width: TESTER_RANK_SELECT_WIDTH_PX,
            height: TESTER_SELECT_HEIGHT_PX,
            display: 'inline-flex',
            alignItems: 'center',
            '& .MuiSelect-select': TESTER_SELECT_VALUE_BASE_SX,
          }}>
            {[1,2,3,4,5,6].map(n => (<MenuItem key={n} value={n}>{rankLabel(n)}</MenuItem>))}
          </Select>
          <Select size="small" value={it.rarity} onChange={e => updateItemAt(idx, (v) => {
            const updated = { ...v, rarity: Number(e.target.value) as 1|2|3|4|5|6 }
            return adjustSubValuesFor(updated)
          })} sx={{
            width: TESTER_RARITY_SELECT_WIDTH_PX,
            height: TESTER_SELECT_HEIGHT_PX,
            display: 'inline-flex',
            alignItems: 'center',
            '& .MuiSelect-select': TESTER_SELECT_VALUE_BASE_SX,
          }}>
            {[1,2,3,4,5,6].map(n => (
              <MenuItem key={n} value={n}>
                {rarityLabel(n as 1|2|3|4|5|6)}
              </MenuItem>
            ))}
          </Select>
          <Select size="small" value={mainValue} onChange={e => updateItemAt(idx, (v) => {
            const nv = Number(e.target.value)
            const updated = { ...v, main: nv }
            return adjustSubValuesFor(updated)
          })} sx={{
            width: TESTER_MAINSTAT_SELECT_MIN_WIDTH_PX,
            height: TESTER_SELECT_HEIGHT_PX,
            display: 'inline-flex',
            alignItems: 'center',
            '& .MuiSelect-select': {
              ...TESTER_SELECT_VALUE_BASE_SX,
              color: (() => {
                if (mainValue < 0) return undefined
                const fg = substatColors[mainValue]?.fg
                const def = DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[mainValue]
                return statButtonBorders ? (fg ?? def) : undefined
              })(),
            },
          }}>
            <MenuItem value={-1}>{t('any')}</MenuItem>
            {mainOptions.map((variant) => (
              <MenuItem
                key={variant}
                value={variant}
                sx={{ color: statButtonBorders ? (substatColors[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]) : undefined }}
              >
                {t(statVariantI18nKey(variant))}
              </MenuItem>
            ))}
          </Select>
          </Box>
        )}
        {isCompact && (
          <Box sx={{ gridColumn: '2', gridRow: '2', display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', minHeight: TESTER_RESULT_ROW_MIN_HEIGHT_PX }}>
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
        )}
        {!isCompact && (
          <Box sx={{ gridColumn: '2', gridRow: '2', display: 'grid', gridTemplateColumns: TESTER_CONTROL_GRID_TEMPLATE, columnGap: 1, rowGap: 1, mt: 0.5, alignItems: 'center' }}>
            {(() => {
              const validIds = new Set<number>(allowedSetIdsForSlot)
              const sorted = filterAndSortSetEntries(setsSearch, setsOrder, { translate: t }).filter(([id]) => validIds.has(Number(id)))
              const setValue = (accessorySlot && setIdNumber === ACCESSORY_NO_SET_ID) ? '' : String(setIdNumber)
              const setOptionMissing = setValue !== '' && !sorted.some(([id]) => id === setValue)
              const currentSetLabel = formatTesterSetLabel({ setId: setIdNumber, slot: it.slot, translate: t })
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
                    const Label = t(artifactSetI18nKey(setNum)) || artifactSetName(setNum)
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
                        scrollbarGutter: 'stable' as const,
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
            <Select
              size="small"
              value={Number(it.faction ?? 0)}
              disabled={!isAccessorySlot(it.slot)}
              onChange={e => updateItemAt(idx, (v) => ({ ...v, faction: Number(e.target.value) as FactionId }))}
              sx={{
                width: TESTER_FACTION_SELECT_WIDTH_PX,
                height: TESTER_SELECT_HEIGHT_PX,
                display: 'inline-flex',
                alignItems: 'center',
                '& .MuiSelect-select': {
                  ...TESTER_SELECT_VALUE_BASE_SX,
                },
              }}
              MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
              renderValue={(selected) => {
                const numeric = Number(selected)
                if (!numeric) return t('any')
                const label = t(factionI18nKey(numeric as FactionId))
                return (
                  <Box component="span" title={label} sx={{ display: 'inline-flex', alignItems: 'center', width: '100%' }}>
                    <FactionOptionLabel faction={numeric as FactionId} label={label} truncate textSx={{ fontSize: '0.875rem' }} />
                  </Box>
                )
              }}
            >
              <MenuItem value={0}>{t('any')}</MenuItem>
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupTelerianLeague')}</ListSubheader>
              {[Faction.BannerLords, Faction.HighElves, Faction.SacredOrder, Faction.Barbarians].map((code) => (
                <MenuItem key={code} value={Number(code)}>
                  <FactionOptionLabel faction={code} label={t(factionI18nKey(code))} size={23} />
                </MenuItem>
              ))}
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupGaellenPact')}</ListSubheader>
              {[Faction.OgrynTribes, Faction.Lizardmen, Faction.Skinwalkers, Faction.Orcs].map((code) => (
                <MenuItem key={code} value={Number(code)}>
                  <FactionOptionLabel faction={code} label={t(factionI18nKey(code))} size={23} />
                </MenuItem>
              ))}
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupTheCorrupted')}</ListSubheader>
              {[Faction.Demonspawn, Faction.UndeadHordes, Faction.DarkElves, Faction.KnightRevenant].map((code) => (
                <MenuItem key={code} value={Number(code)}>
                  <FactionOptionLabel faction={code} label={t(factionI18nKey(code))} size={23} />
                </MenuItem>
              ))}
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupNyresanUnion')}</ListSubheader>
              {[Faction.Dwarves, Faction.Shadowkin, Faction.SylvanWatchers].map((code) => (
                <MenuItem key={code} value={Number(code)}>
                  <FactionOptionLabel faction={code} label={t(factionI18nKey(code))} size={23} />
                </MenuItem>
              ))}
            </Select>
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
                <Stack key={v} direction="row" spacing={0.5} alignItems="center" sx={{ width: `${TESTER_SUBSTAT_EDITOR_WIDTH_PX}px`, border: theme => `1px solid ${theme.palette.divider}`, borderRadius: 1, px: 0.75, py: 0.25 }}>
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
          <Box sx={{ gridColumn: '2', mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', minHeight: TESTER_RESULT_ROW_MIN_HEIGHT_PX }}>
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
        )}
      </Box>
    )
  }

  // Append externally injected tester items once per payload, skipping duplicates and scrolling to the newest row when items arrive.
  useEffect(() => {
    if (!pendingExternalItems || pendingExternalItems.length === 0) return
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const incoming = pendingExternalItems.slice()
    const existing = new Set(itemsRef.current.map((it) => fingerprintRuleTesterItem(it)))
    let index = 0
    let appended = false
    const bufferedAdditions: TesterItem[] = []

    const flushScroll = () => {
      if (typeof window === 'undefined') return
      try {
        const node = scrollContainerRef.current
        if (!node) return
        window.requestAnimationFrame(() => { node.scrollTop = node.scrollHeight })
      } catch {}
    }

    const scheduleNext = () => {
      if (cancelled) return
      timeoutId = setTimeout(processChunk, 0)
    }

    const processChunk = () => {
      if (cancelled) return
      const end = Math.min(index + TESTER_IMPORT_CHUNK_SIZE, incoming.length)
      const chunk = incoming.slice(index, end)
      index = end
      if (chunk.length > 0) {
        for (const incomingItem of chunk) {
          const base = adjustSubValuesFor({ ...(incomingItem as TestItem), rowId: allocTesterRowId() } as TesterItem)
          const key = fingerprintRuleTesterItem(base)
          if (existing.has(key)) continue
          existing.add(key)
          bufferedAdditions.push(base)
        }
      }
      if (index < incoming.length) {
        scheduleNext()
        return
      }
      if (!cancelled && bufferedAdditions.length > 0) {
        appended = true
        setItems((prev) => {
          const next = [...prev, ...bufferedAdditions]
          pruneEasterEggStateForItems(next)
          return next
        })
        bufferedAdditions.length = 0
      }
      if (appended) flushScroll()
      if (!cancelled && onConsumeExternalItems) onConsumeExternalItems()
    }

    processChunk()
    return () => {
      cancelled = true
      if (timeoutId != null) {
        clearTimeout(timeoutId)
      }
    }
  // adjustSubValuesFor is recreated per render; pendingExternalItems change is the trigger we care about.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingExternalItems, allocTesterRowId, pruneEasterEggStateForItems, onConsumeExternalItems])

  // No Import/Export buttons; autosave restores when dialog opens.

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          width: TESTER_DIALOG_WIDTH_PX,
          maxWidth: TESTER_DIALOG_WIDTH_PX,
          minWidth: TESTER_DIALOG_WIDTH_PX,
          height: TESTER_DIALOG_HEIGHT_PX,
          maxHeight: TESTER_DIALOG_HEIGHT_PX,
          minHeight: TESTER_DIALOG_HEIGHT_PX,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ flex: 1 }}>{t('testerTitle')}</Box>
        <Tooltip title={t('close')}><IconButton onClick={onClose} size="small"><CloseIcon fontSize="small" /></IconButton></Tooltip>
      </DialogTitle>
      <DialogContent
        dividers
        sx={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('testerIntro')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('testerManualOnlyNotice')}
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
          {items.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('testerEmptyHint')}</Typography>
          ) : (
            <Box sx={{ position: 'relative' }}>
              {topSpacerHeight > 0 ? <Box sx={{ height: topSpacerHeight }} /> : null}
              {visibleIndices.map((idx) => {
                const item = items[idx] as TesterItem
                return (
                  <MeasuredTesterRow key={item.rowId} rowId={item.rowId} registerHeight={registerRowHeight}>
                    {renderTesterRow(item, idx)}
                  </MeasuredTesterRow>
                )
              })}
              {bottomSpacerHeight > 0 ? <Box sx={{ height: bottomSpacerHeight }} /> : null}
            </Box>
          )}
        </Box>
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
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            alignItems: 'center',
          }}
        >
          {deletableSources.map((section) => {
            const count = sourceCounts[section.key]
            return (
              <Button
                key={section.key}
                size="small"
                variant="outlined"
                color="error"
                endIcon={<DeleteIcon fontSize="small" />}
                onClick={() => {
                  if (count === 0) return
                  setPendingDeleteSource(section.key)
                }}
                disabled={count === 0}
                sx={{
                  minWidth: 160,
                }}
              >
                {`${section.label}: ${count}`}
              </Button>
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
          <Button onClick={handleAddManualGear}>{t('testerAddManualGear')}</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose}>{t('close')}</Button>
        </Box>
      </DialogActions>
      <Dialog
        open={pendingDeleteSource != null}
        onClose={() => setPendingDeleteSource(null)}
      >
        <DialogTitle>{t('testerDeleteSourceConfirmTitle', { source: pendingDeleteMeta?.label ?? '' })}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t('testerDeleteSourceConfirmBody', { source: pendingDeleteMeta?.label ?? '' })}
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
    </Dialog>
  )
}

type MeasuredTesterRowProps = {
  rowId: number
  registerHeight: (rowId: number, height: number) => void
  children: ReactNode
}

function MeasuredTesterRow({ rowId, registerHeight, children }: MeasuredTesterRowProps) {
  const rowRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const node = rowRef.current
    if (!node) return
    const measure = () => registerHeight(rowId, node.offsetHeight)
    measure()
    const observer = new ResizeObserver(() => {
      const current = rowRef.current
      if (!current) return
      registerHeight(rowId, current.offsetHeight)
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [rowId, registerHeight])

  return <Box ref={rowRef}>{children}</Box>
}
