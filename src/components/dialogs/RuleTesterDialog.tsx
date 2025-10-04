import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, UIEvent } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Select, Stack, Tooltip, Typography, Chip, TextField, ListSubheader, keyframes } from '@mui/material'
import type { ChipProps } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen'
// Delete icon no longer used since substats count is fixed
import type { BuilderConfig } from '../../lib/hsfBuilder'
import type { ArtifactSetId, ArtifactTypeId, FactionId } from '../../lib/types'
import { ArtifactType, artifactTypeNames, /* rarityCodeToName, */ formatLevel, StatVariant, slotSupportsSub, slotSupportsMain, ALLOWED_MAIN_BY_SLOT, Faction, factionI18nKey, filterAndSortSetEntries, artifactTypeI18nKey, ArtifactSet, artifactSetName, artifactSetI18nKey, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, statVariantI18nKey, compareVariants } from '../../lib/types'
import { allowedTesterSetIds, isAccessorySlot, normalizeTesterSetForSlot } from '../../lib/testerDomain'
import { artifactTypeIconList } from '../artifactTypeIcons'
import type { HsfRuleWithCfg } from '../../lib/merge'
import { evaluateFirst, type TestItem } from '../../lib/ruleEval'
import { useAutosave } from '../../hooks/useAutosave'
import { AUTOSAVE_TESTER_KEY } from '../../lib/constants'
import { loadAutosave } from '../../lib/autosave'
import { useI18n } from '../../lib/i18n'
import { useAppState } from '../../state/appState'
import SetMenuSection from '../SetMenuSection'
import { SetIcon } from '../SetIcon'
import { FactionOptionLabel, FactionIcon } from '../FactionIcon'
import SetsOrderControls from '../SetsOrderControls'
import { SETS_MENU_WIDTH_PX, MENU_MAX_HEIGHT_SETS_LIST_PX, MENU_MAX_HEIGHT_EXTRA_BUFFER, MENU_SCROLL_GUTTER_PX, MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, LIST_SUBHEADER_SX, TESTER_SUBSTAT_EDITOR_WIDTH_PX, TESTER_ROW_CONTROLS_WIDTH_PX, ACCESSORY_NO_SET_ID, TESTER_ANY_SLOT_ID, TESTER_MAINSTAT_SELECT_MIN_WIDTH_PX, TESTER_SUBSTAT_SELECT_MIN_WIDTH_PX, TESTER_SLOT_SELECT_WIDTH_PX, TESTER_SET_SELECT_WIDTH_PX, TESTER_FACTION_SELECT_WIDTH_PX, TESTER_RANK_SELECT_WIDTH_PX, TESTER_RARITY_SELECT_WIDTH_PX, TESTER_LEVEL_SELECT_WIDTH_PX, TESTER_SELECT_HEIGHT_PX, TESTER_RESULT_ROW_MIN_HEIGHT_PX, TESTER_CONFIG_CHIP_MAX_WIDTH_PX, TESTER_DIALOG_WIDTH_PX, TESTER_DIALOG_HEIGHT_PX, TESTER_VIRTUAL_OVERSCAN_PX, TESTER_ROW_ESTIMATE_COMPACT_PX, TESTER_ROW_ESTIMATE_EXPANDED_PX, TESTER_COMPACT_ICON_SIZE_PX } from '../../lib/constants'
import { useDisplayPreferences } from '../../state/preferencesState'
import type { Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'

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

const MAIN_FALLBACK_VARIANTS: readonly number[] = [
  StatVariant.HP,
  StatVariant.ATK,
  StatVariant.DEF,
] as const

const ANY_SLOT_MAIN_VARIANTS: number[] = (() => {
  const variants = new Set<number>()
  Object.values(ALLOWED_MAIN_BY_SLOT).forEach((allowed) => {
    allowed.forEach((variant) => variants.add(Number(variant)))
  })
  MAIN_FALLBACK_VARIANTS.forEach((variant) => variants.add(Number(variant)))
  return Array.from(variants).sort(compareVariants)
})()

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

const baseMainVariantsForSlot = (slot: ArtifactTypeId): number[] => {
  if (Number(slot) === TESTER_ANY_SLOT_ID) return [...ANY_SLOT_MAIN_VARIANTS]
  const allowed = ALLOWED_MAIN_BY_SLOT[Number(slot) as ArtifactType]
  if (!allowed || allowed.size === 0) return [...MAIN_FALLBACK_VARIANTS]
  return Array.from(allowed).sort(compareVariants)
}

const normalizeMainVariantForSlot = (slot: ArtifactTypeId, main: number): number => {
  if (Number(main) === -1) return -1
  const options = baseMainVariantsForSlot(slot)
  if (options.length === 0) return -1
  return options.includes(main) ? main : options[0]!
}

const mainOptionsForSlot = (slot: ArtifactTypeId, currentMain: number): number[] => {
  const base = baseMainVariantsForSlot(slot)
  if (currentMain >= 0 && !base.includes(currentMain)) {
    return [...base, currentMain].sort(compareVariants)
  }
  return base
}

export default function RuleTesterDialog({
  open,
  onClose,
  rules,
  customCfgs,
  onView,
  substatColors,
  pendingExternalItems = [],
  onConsumeExternalItems,
}: {
  open: boolean
  onClose: () => void
  rules: HsfRuleWithCfg[]
  customCfgs: BuilderConfig[]
  onView: (ruleIndex: number, cfgIdx: number | null) => void
  substatColors: Record<number, { fg: string; bg: string }>
  pendingExternalItems?: TestItem[]
  onConsumeExternalItems?: () => void
}) {
  const { t } = useI18n()
  const { minima, metasets } = useAppState()
  const { showFactionIcons, statButtonBorders } = useDisplayPreferences()

  // Local tester item uses absolute substat values (not roll counts).
  // Preserve user-visible substat order via `subOrder` since JS object numeric keys
  // enumerate in ascending order.
  // Current behavior: optional `compact` flag toggles per-item summary rendering below the substat editors.
  type TesterItem = Omit<TestItem, 'subRolls'> & { rowId: number; subValues?: Record<number, number>; subOrder?: number[]; compact?: boolean }
  const [items, setItems] = useState<TesterItem[]>([])
  const toggleHistoryRef = useRef<Map<number, number[]>>(new Map())
  const cookieTimeoutRef = useRef<Map<number, ReturnType<typeof window.setTimeout>>>(new Map())
  const [cookieMonsterExpiryByRow, setCookieMonsterExpiryByRow] = useState<Record<number, number>>({})

  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const measuredHeightsRef = useRef<Map<number, number>>(new Map())
  const [rowHeightsVersion, setRowHeightsVersion] = useState(0)
  const estimateRowHeight = useCallback((item: TesterItem): number => (
    item.compact ? TESTER_ROW_ESTIMATE_COMPACT_PX : TESTER_ROW_ESTIMATE_EXPANDED_PX
  ), [])
  const nextRowIdRef = useRef(1)
  const allocRowId = useCallback(() => {
    const id = nextRowIdRef.current
    nextRowIdRef.current += 1
    return id
  }, [])

  // Local Sets menu state to mirror Filters/Builder
  const [setsOrder, setSetsOrder] = useState<'game' | 'az' | 'icons'>('icons')
  const [setsSearch, setSetsSearch] = useState('')
  const [setsMenuAnchorPos, setSetsMenuAnchorPos] = useState<{ top: number; left: number } | null>(null)
  const [setsMenuOpenIdx, setSetsMenuOpenIdx] = useState<number | null>(null)
  const setsMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  // Faction options are grouped like Builder/Filters; precomputed flat list no longer used here.
  // Keeping the grouped structure inline for clarity in the Rule Tester.

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
      const resolved = typeof measured === 'number' && measured > 0
        ? measured
        : estimateRowHeight(item)
      heights.push(resolved)
      total += resolved
    }
    return { rowOffsets: offsets, rowHeights: heights, totalContentHeight: total }
  }, [items, estimateRowHeight, rowHeightsVersion])

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
    const height = rowHeights[last] ?? estimateRowHeight(items[last]!)
    const consumed = offset + height
    return Math.max(0, totalContentHeight - consumed)
  }, [estimateRowHeight, items, totalContentHeight, rowHeights, rowOffsets, visibleIndices])

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
  }, [])

  const updateItemAt = useCallback((index: number, updater: (item: TesterItem) => TesterItem) => {
    setItems((prev) => {
      const next = prev.map((item, i) => (i === index ? updater(item) : item))
      pruneEasterEggStateForItems(next)
      return next
    })
  }, [pruneEasterEggStateForItems])

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

  const handleToggleCompact = useCallback((rowId: number, index: number) => {
    updateItemAt(index, (item) => ({ ...item, compact: !item.compact }))
    registerCompactToggle(rowId)
  }, [registerCompactToggle, updateItemAt])

  // Restore autosaved tester session automatically when opening the dialog.
  useEffect(() => {
    if (!open) return
    try {
      const entry = loadAutosave<{ Version?: string; Items?: TestItem[] }>(AUTOSAVE_TESTER_KEY)
      if (entry) {
        const payload = entry.payload as { Items?: unknown }
        const itemsAny = (payload as { Items?: unknown }).Items
        type LegacyTestItem = TestItem & { subRolls?: Record<number, number> }
        const arr: Array<Partial<TestItem> & { subValues?: Record<string, unknown> } | LegacyTestItem> = Array.isArray(itemsAny) ? (itemsAny as Array<Partial<TestItem> & { subValues?: Record<string, unknown> } | LegacyTestItem>) : []
        // Prefer V2 items with subValues when present; otherwise map from legacy subRolls.
        const hasSubValues = arr.some((x) => x && typeof x.subValues === 'object')
        if (hasSubValues) {
          const restored = arr.map((raw) => {
            const it = raw as Partial<TestItem> & { subValues?: Record<string, unknown> }
            const svIn = (it && typeof it.subValues === 'object') ? it.subValues : {}
            const sv: Record<number, number> = {}
            for (const [k, v] of Object.entries(svIn)) {
              sv[Number(k)] = Math.max(0, Number(v) || 0)
            }
            const restoredItem: TesterItem = adjustSubValuesFor({ ...(it as TestItem), subValues: sv, rowId: allocRowId() })
            return restoredItem
          })
          const nextItems = restored.length > 0 ? restored : makeDefaultItems()
          setItems(nextItems)
          pruneEasterEggStateForItems(nextItems)
        } else {
          const sureLegacy = arr as LegacyTestItem[]
          const mapped: TesterItem[] = sureLegacy.map((it: LegacyTestItem) => {
            const vals: Record<number, number> = {}
            const rolls = (it.subRolls || {}) as Record<number, number>
            const star = Math.max(1, Math.min(6, Number(it.rank || 6))) as 1|2|3|4|5|6
            const baseFor = (variant: number): number => {
              switch (star) {
                case 6: return minima.six[variant] ?? 0
                case 5: return minima.five[variant] ?? 0
                case 4: return minima.four[variant] ?? 0
                case 3: return minima.three[variant] ?? 0
                case 2: return minima.two[variant] ?? 0
                default: return minima.one[variant] ?? 0
              }
            }
            for (const k of Object.keys(rolls)) {
              const v = Number(k)
              const r = Math.max(0, (rolls as Record<number, number>)[v] || 0)
              const base = baseFor(v)
              vals[v] = Math.max(0, r * base)
            }
            const { subRolls: _omit, ...rest } = it
            return adjustSubValuesFor({ ...(rest as Partial<TestItem>), subValues: vals, rowId: allocRowId() } as TesterItem)
          })
          const nextItems = mapped.length > 0 ? mapped : makeDefaultItems()
          setItems(nextItems)
          pruneEasterEggStateForItems(nextItems)
        }
        return
      }
    } catch {}
    // No autosave: seed defaults
    const nextItems = makeDefaultItems()
    setItems(nextItems)
    pruneEasterEggStateForItems(nextItems)
  // We intentionally restore autosave only when the dialog opens; minima updates do not re-run this effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Persist while dialog is open or after restore; payload only concerns tester state
  useAutosave({ key: AUTOSAVE_TESTER_KEY, enabled: open, payload: useMemo(() => ({ Version: '2', Items: items }), [items]) })

  // Helper: get substat entries in preserved order for a tester item
  const entriesInOrder = (it: TesterItem): Array<[number, number]> => {
    const vals = it.subValues || {}
    const presentKeys = new Set(Object.keys(vals).map(Number))
    const baseOrder = (it.subOrder && it.subOrder.length > 0)
      ? it.subOrder.filter((k) => presentKeys.has(Number(k)))
      : Array.from(presentKeys)
    // Append any keys not listed in subOrder (newly added)
    const extras = Array.from(presentKeys).filter((k) => !baseOrder.includes(k))
    const order = [...baseOrder, ...extras]
    return order.map((k) => [k, Number((vals as Record<number, number>)[k] ?? 0)])
  }

  // Use absolute substat values directly for evaluation; +/- steppers still use minima for step size.
  const results = useMemo(() => items.map(it => {
    const forEval: TestItem = { ...it, subValues: { ...(it.subValues || {}) } }
    return evaluateFirst(rules || [], forEval)
  }), [items, rules])

  const renderTesterRow = (it: TesterItem, idx: number): JSX.Element => {
    const res = results[idx] || null
    const cfgIdx = res?.cfgIdx ?? null
    const cfg = (cfgIdx != null ? customCfgs[cfgIdx] : undefined)
    const cfgName = cfgIdx != null ? (cfg?.name || `#${cfgIdx + 1}`) : undefined
    const cfgFactionCode = cfg ? Number((cfg as { factionCode?: number }).factionCode ?? 0) : 0
    const configChipIconProps: Partial<ChipProps> = (showFactionIcons && cfgFactionCode > 0)
      ? { icon: <FactionIcon faction={cfgFactionCode as FactionId} size={TESTER_COMPACT_ICON_SIZE_PX} sx={{ mr: 0 }} /> }
      : {}
    const configLabel = cfgIdx != null ? `${t('testerConfig')}: ${String(cfgName)}` : null
    const jumpToConfigLabel = t('testerJumpToConfig')
    const showConfigTooltip = Boolean(configLabel && configLabel.length > 45)
    const baseConfigChip = configLabel ? (
      <Chip
        size="small"
        label={configLabel}
        {...configChipIconProps}
        sx={{
          maxWidth: TESTER_CONFIG_CHIP_MAX_WIDTH_PX,
          '& .MuiChip-label': {
            display: 'block',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
          ...((showFactionIcons && cfgFactionCode > 0)
            ? {
                pl: 0.5,
                '& .MuiChip-icon': {
                  color: 'inherit',
                  mr: 0.25,
                },
              }
            : {}),
        }}
      />
    ) : null
    const renderedConfigChip = !baseConfigChip
      ? null
      : showConfigTooltip
        ? (
          <Tooltip title={configLabel}>
            <Box component="span" sx={{ display: 'inline-flex' }}>{baseConfigChip}</Box>
          </Tooltip>
        )
        : baseConfigChip
    const subEntries = entriesInOrder(it)
    const matchedRule = res ? rules[res.ruleIndex] : undefined
    const isFinalSell = Boolean(matchedRule?.__allKnownSets)
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
    const setNameCanonical = artifactSetName(setIdNumber)
    const setNameLocalized = t(artifactSetI18nKey(setIdNumber)) || setNameCanonical
    const showSetChip = !(accessorySlot && setIdNumber === ACCESSORY_NO_SET_ID)
    const setLabel = showSetChip ? setNameLocalized : ''
    const setIconNode = setIdNumber > 0
      ? <SetIcon name={setNameCanonical} size={TESTER_COMPACT_ICON_SIZE_PX} sx={{ mr: 0 }} />
      : null
    const slotIconNode = SlotIconComponent
      ? <SlotIconComponent fontSize="inherit" />
      : null
    const levelLabel = formatLevel(it.level)
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
    const summaryLabelBaseSx = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 0.5,
      fontSize: '0.9375rem',
      lineHeight: '1.25rem',
      color: 'inherit',
      maxWidth: '100%',
      minWidth: 0,
    } as const
    const summaryLabelIconSx = {
      width: `${TESTER_COMPACT_ICON_SIZE_PX}px`,
      height: `${TESTER_COMPACT_ICON_SIZE_PX}px`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      fontSize: `${TESTER_COMPACT_ICON_SIZE_PX}px`,
      '& svg, & img': {
        width: '100%',
        height: '100%',
      },
    } as const
    const renderSummaryLabel = (label: string, options?: { icon?: ReactNode; color?: string }): JSX.Element => {
      const icon = options?.icon
      const color = options?.color
      return (
        <Box sx={{ ...summaryLabelBaseSx, ...(color ? { color } : {}) }}>
          {icon ? <Box sx={summaryLabelIconSx} aria-hidden>{icon}</Box> : null}
          <Typography
            variant="body2"
            component="span"
            noWrap
            sx={{
              fontSize: 'inherit',
              lineHeight: 'inherit',
              color: 'inherit',
              maxWidth: '100%',
              minWidth: 0,
            }}
          >
            {label}
          </Typography>
        </Box>
      )
    }
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
    const toggleTooltip = cookieMonsterActive ? 'Coookieees!' : (it.compact ? t('expanded') : t('compact'))
    const ruleChipNode = !res
      ? null
      : isFinalSell
        ? <Typography variant="body2">{t('testerFinalSell')}</Typography>
        : (
          <Tooltip title={jumpToConfigLabel}>
            <Chip
              component="button"
              onClick={() => onView(res.ruleIndex, cfgIdx)}
              size="small"
              label={`${t('testerRule')}: ${res.ruleIndex + 1}`}
              sx={{
                cursor: 'pointer',
                bgcolor: 'primary.main',
                color: 'common.black',
                '&:hover': { bgcolor: 'primary.light' },
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
          </Tooltip>
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
              <IconButton size="small" onClick={() => setItems(prev => {
                const next = prev.slice()
                next.splice(idx + 1, 0, makeDefaultItem())
                pruneEasterEggStateForItems(next)
                return next
              })} aria-label="add-row" sx={{
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
                  disabled={items.length <= 1}
                  onClick={() => setItems(prev => {
                    const next = prev.filter((_, i) => i !== idx)
                    pruneEasterEggStateForItems(next)
                    return next
                  })}
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
              variant={it.compact ? 'contained' : 'outlined'}
              color={it.compact ? 'success' : 'warning'}
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
              onClick={() => handleToggleCompact(it.rowId, idx)}
            >
              {it.compact ? <OpenInFullIcon fontSize="small" /> : <CloseFullscreenIcon fontSize="small" />}
            </Button>
          </Tooltip>
        </Stack>
        {it.compact ? (
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
              {renderSummaryLabel(slotLabel, { icon: slotIconNode || undefined })}
            </Box>
            <Box sx={{ gridColumn: '2', gridRow: '1', display: 'flex', alignItems: 'center', minWidth: 0 }}>
              {renderSummaryLabel(rankLabel(it.rank))}
            </Box>
            <Box sx={{ gridColumn: '3', gridRow: '1', display: 'flex', alignItems: 'center', minWidth: 0 }}>
              {renderSummaryLabel(rarityLabel(it.rarity))}
            </Box>
            <Box sx={{ gridColumn: '4', gridRow: '1', display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
              {renderSummaryLabel(mainLabel, mainSummaryColor ? { color: mainSummaryColor } : undefined)}
            </Box>
            <Box sx={{ gridColumn: '1', gridRow: '2', display: showSetChip ? 'flex' : 'none', alignItems: 'center', minWidth: 0 }}>
              {showSetChip ? renderSummaryLabel(setLabel, { icon: setIconNode || undefined }) : null}
            </Box>
            <Box sx={{ gridColumn: '2', gridRow: '2', display: 'flex', alignItems: 'center', minWidth: 0 }}>
              {renderSummaryLabel(levelChipLabel)}
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
                      {renderSummaryLabel(factionChipLabel, { icon: factionIconNode })}
                    </Box>
                  </Tooltip>
                ) : (
                  renderSummaryLabel(factionChipLabel)
                )
              ) : null}
            </Box>
            <Box sx={{ gridColumn: '4', gridRow: '2', display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
              {substatSummaries.map((entry) => {
                const subSummaryColor = statButtonBorders ? entry.color : undefined
                return (
                  <Box key={`sub-${entry.variant}`} sx={{ minWidth: 0 }}>
                    {renderSummaryLabel(entry.label, subSummaryColor ? { color: subSummaryColor } : undefined)}
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
                    borderColor: selected ? 'primary.main' : 'divider',
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
        {it.compact && (
          <Box sx={{ gridColumn: '2', gridRow: '2', display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', minHeight: TESTER_RESULT_ROW_MIN_HEIGHT_PX }}>
            {res ? (
              <>
                <Chip size="small" color={res.keep ? 'success' : 'error'} label={res.keep ? t('keepValueKeep') : t('keepValueSell')} />
                {ruleChipNode}
                {renderedConfigChip}
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
        {!it.compact && (
          <Box sx={{ gridColumn: '2', gridRow: '2', display: 'grid', gridTemplateColumns: TESTER_CONTROL_GRID_TEMPLATE, columnGap: 1, rowGap: 1, mt: 0.5, alignItems: 'center' }}>
            {(() => {
              const validIds = new Set<number>(allowedSetIdsForSlot)
              const sorted = filterAndSortSetEntries(setsSearch, setsOrder, { translate: t }).filter(([id]) => validIds.has(Number(id)))
              const setValue = (accessorySlot && setIdNumber === ACCESSORY_NO_SET_ID) ? '' : String(setIdNumber)
              const setOptionMissing = setValue !== '' && !sorted.some(([id]) => id === setValue)
              const currentSetLabel = t(artifactSetI18nKey(setIdNumber)) || artifactSetName(setIdNumber)
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
                  }}
                  renderValue={(value) => {
                    if (value === '') return t('noSetAccessories')
                    const setNum = Number(value)
                    const Label = t(artifactSetI18nKey(setNum)) || artifactSetName(setNum)
                    const setNameForIcon = artifactSetName(setNum)
                    const Icon = setNum > 0 ? <SetIcon name={setNameForIcon} size={20} /> : null
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
                            onSetsOrderChange={(v: 'game' | 'az' | 'icons') => v && setSetsOrder(v)}
                            zeroResults={sorted.length === 0}
                          />
                        </Box>
                      </Box>
                    </ListSubheader>
                    <Box
                      component="ul"
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
              const updated = { ...v, level: Number(e.target.value) as 0|4|8|12|16 }
              return adjustSubValuesFor(updated)
            })} sx={{
              width: TESTER_LEVEL_SELECT_WIDTH_PX,
              height: TESTER_SELECT_HEIGHT_PX,
              display: 'inline-flex',
              alignItems: 'center',
              '& .MuiSelect-select': TESTER_SELECT_VALUE_BASE_SX,
            }}>
              {[0,4,8,12,16].map(n => (<MenuItem key={n} value={n}>{formatLevel(n)}</MenuItem>))}
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
        {!it.compact && (
          <Box sx={{ gridColumn: '2', display: 'grid', gridTemplateColumns: `repeat(2, ${TESTER_SUBSTAT_EDITOR_WIDTH_PX}px)`, columnGap: 1, rowGap: 0.5, mt: 0.5 }}>
            {subEntries.map(([v, value]) => {
              const star = Math.max(1, Math.min(6, Number(it.rank || 6))) as 1|2|3|4|5|6
              const baseStep = (
                star === 6 ? (minima.six[v] || 0) : star === 5 ? (minima.five[v] || 0) : star === 4 ? (minima.four[v] || 0) : star === 3 ? (minima.three[v] || 0) : star === 2 ? (minima.two[v] || 0) : (minima.one[v] || 0)
              )
              const step = Math.max(1, baseStep)
              const usedOthers = new Set<number>(subEntries.filter(([kk]) => Number(kk) !== v).map(([kk]) => Number(kk)))
              const candidates = [StatVariant.HP, StatVariant.HP_FLAT, StatVariant.ATK, StatVariant.ATK_FLAT, StatVariant.DEF, StatVariant.DEF_FLAT, StatVariant.SPD, StatVariant.RES, StatVariant.ACC, StatVariant.CR, StatVariant.CDMG]
                .filter(x => (Number(it.slot) === TESTER_ANY_SLOT_ID || slotSupportsSub(it.slot, x)) && !usedOthers.has(Number(x)) && !subEqualsMainVariant(x, mainValue))
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
                        const baseNew = (
                          star === 6 ? (minima.six[nv] || 0) : star === 5 ? (minima.five[nv] || 0) : star === 4 ? (minima.four[nv] || 0) : star === 3 ? (minima.three[nv] || 0) : star === 2 ? (minima.two[nv] || 0) : (minima.one[nv] || 0)
                        )
                        const stepNew = Math.max(1, baseNew)
                        const adjusted = Math.max(stepNew, Number(value))
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
                  <IconButton size="small" onClick={() => updateItemAt(idx, (it2) => {
                    const base = { ...it2, subValues: { ...(it2.subValues || {}), [v]: Math.max(step, (value - step)) } }
                    const updated = (it2.subOrder && it2.subOrder.length > 0) ? { ...base, subOrder: [...it2.subOrder] } : base
                    return adjustSubValuesFor(updated as TesterItem)
                  })} aria-label="-">
                    <RemoveCircleOutlineIcon fontSize="small" />
                  </IconButton>
                  <TextField size="small" type="number" inputProps={{ min: step, style: { width: 56, textAlign: 'center' } }} value={value} onChange={e => {
                    const raw = Number(e.target.value)
                    const next = Number.isFinite(raw) ? Math.max(step, raw) : step
                    updateItemAt(idx, (it2) => {
                      const base = { ...it2, subValues: { ...(it2.subValues || {}), [v]: next } }
                      const updated = (it2.subOrder && it2.subOrder.length > 0) ? { ...base, subOrder: [...it2.subOrder] } : base
                      return adjustSubValuesFor(updated as TesterItem)
                    })
                  }} />
                  <IconButton size="small" onClick={() => updateItemAt(idx, (it2) => {
                    const base = { ...it2, subValues: { ...(it2.subValues || {}), [v]: (value + step) } }
                    const updated = (it2.subOrder && it2.subOrder.length > 0) ? { ...base, subOrder: [...it2.subOrder] } : base
                    return adjustSubValuesFor(updated as TesterItem)
                  })} aria-label="+">
                    <AddCircleOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              )
            })}
          </Box>
        )}
        {!it.compact && (
          <Box sx={{ gridColumn: '2', mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', minHeight: TESTER_RESULT_ROW_MIN_HEIGHT_PX }}>
            {res ? (
              <>
                <Chip size="small" color={res.keep ? 'success' : 'error'} label={res.keep ? t('keepValueKeep') : t('keepValueSell')} />
                {ruleChipNode}
                {renderedConfigChip}
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

  // Map discrete rarity 1..6 (Common..Mythical) to HSF rarity code (1..5,15)
  const rarityCodeFromDiscrete = (r: 1|2|3|4|5|6): number => (r === 6 ? 15 : r)

  // Addition schedule per rarity code — mirrors builder logic for presence count
  const additionLevelsForRarityCode = (rarityCode: number): Set<0|4|8|12|16> => {
    const byExact = {
      Common: new Set<0|4|8|12|16>([4,8,12,16]),
      Uncommon: new Set<0|4|8|12|16>([8,12,16]),
      Rare: new Set<0|4|8|12|16>([12,16]),
      Epic: new Set<0|4|8|12|16>([16]),
      Legendary: new Set<0|4|8|12|16>([]),
      Mythical: new Set<0|4|8|12|16>([]),
    } as const
    if (rarityCode === 1) return byExact.Common
    if (rarityCode === 2) return byExact.Uncommon
    if (rarityCode === 3) return byExact.Rare
    if (rarityCode === 4) return byExact.Epic
    if (rarityCode === 5) return byExact.Legendary
    if (rarityCode === 15) return byExact.Mythical
    if (rarityCode === 0) return byExact.Legendary
    if (rarityCode === 6) return byExact.Common
    if (rarityCode === 7) return byExact.Uncommon
    if (rarityCode === 8) return byExact.Rare
    if (rarityCode === 9) return byExact.Epic
    if (rarityCode === 16) return byExact.Legendary
    if (rarityCode >= 10 && rarityCode <= 14) return byExact.Common
    return byExact.Legendary
  }

  // Compute number of present substats (0..4) at the given level for the item rarity
  const presentSubCount = (rarity: 1|2|3|4|5|6, level: 0|4|8|12|16): 0|1|2|3|4 => {
    const code = rarityCodeFromDiscrete(rarity)
    const addSet = additionLevelsForRarityCode(code)
    const baseStart = Math.max(0, 4 - addSet.size)
    const addsSoFar = Array.from(addSet).filter(a => a <= level).length
    const n = Math.min(4, baseStart + addsSoFar)
    return (n as 0|1|2|3|4)
  }

  // True if a substat variant equals the selected main stat
  const subEqualsMainVariant = (subV: number, mainV?: number): boolean => {
    if (mainV == null || Number(mainV) === -1) return false
    const subId = (Number(subV) >> 8) & 0xFF
    const subFlat = Number(subV) & 0xFF
    const mainId = (Number(mainV) >> 8) & 0xFF
    const mainFlat = Number(mainV) & 0xFF
    if (subId >= 1 && subId <= 3) {
      return subId === mainId && subFlat === mainFlat
    }
    return subId === mainId
  }

  // Ensure subValues matches the presence count and per-rank minima when any dependent field changes
  const adjustSubValuesFor = (it: TesterItem): TesterItem => {
    const slotValue = Number(it.slot)
    const normalizedMain = normalizeMainVariantForSlot(it.slot, Number(it.main ?? -1))
    const normalizedSet = normalizeTesterSetForSlot(it.slot, (it.set ?? ACCESSORY_NO_SET_ID) as ArtifactSetId)
    const need = presentSubCount(it.rarity, it.level)
    const entries = entriesInOrder(it)
    // Filter out any substats not allowed for slot or equal to main
    const allowedFiltered = entries.filter(([v]) => (slotValue === TESTER_ANY_SLOT_ID || slotSupportsSub(it.slot, v)) && !subEqualsMainVariant(v, normalizedMain))
    const star = Math.max(1, Math.min(6, Number(it.rank || 6))) as 1|2|3|4|5|6
    const baseFor = (variant: number): number => (
      star === 6 ? (minima.six[variant] ?? 0)
      : star === 5 ? (minima.five[variant] ?? 0)
      : star === 4 ? (minima.four[variant] ?? 0)
      : star === 3 ? (minima.three[variant] ?? 0)
      : star === 2 ? (minima.two[variant] ?? 0)
      : (minima.one[variant] ?? 0)
    )
    // Keep existing values but clamp to at least one step for current rank
    let kept = allowedFiltered.map(([k, v]) => {
      const keyNum = Number(k)
      const minStep = Math.max(1, baseFor(keyNum))
      return [keyNum, Math.max(minStep, Number(v))] as [number, number]
    })
    if (kept.length > need) {
      kept = kept.slice(0, need)
    }
    if (kept.length < need) {
      const have = new Set(kept.map(([k]) => Number(k)))
      const candidates = [StatVariant.HP, StatVariant.HP_FLAT, StatVariant.ATK, StatVariant.ATK_FLAT, StatVariant.DEF, StatVariant.DEF_FLAT, StatVariant.SPD, StatVariant.RES, StatVariant.ACC, StatVariant.CR, StatVariant.CDMG]
        .filter(v => (slotValue === TESTER_ANY_SLOT_ID || slotSupportsSub(it.slot, v)) && !have.has(Number(v)) && !subEqualsMainVariant(v, normalizedMain))
      // Fill randomly from candidates until need is met (or candidates exhausted)
      while (kept.length < need && candidates.length > 0) {
        const idx = Math.floor(Math.random() * candidates.length)
        const v = candidates.splice(idx, 1)[0]!
        kept.push([v, Math.max(1, baseFor(v))])
      }
    }
    const next: Record<number, number> = {}
    for (const [k, val] of kept) next[Number(k)] = Number(val)
    const nextOrder = kept.map(([k]) => Number(k))
    return { ...it, subValues: next, subOrder: nextOrder, main: normalizedMain, set: normalizedSet }
  }

  const fingerprintForItem = useCallback((item: TesterItem | TestItem): string => {
    const slot = Number(item.slot ?? 0)
    const setId = Number(item.set ?? 0)
    const rank = Number(item.rank ?? 0)
    const rarity = Number(item.rarity ?? 0)
    const level = Number(item.level ?? 0)
    const faction = Number((item as { faction?: number }).faction ?? 0)
    const main = Number(item.main ?? -1)
    const sub = item.subValues ?? {}
    const entries = Object.keys(sub).map((key) => {
      const variant = Number(key)
      const value = Number((sub as Record<number, number>)[variant] ?? 0)
      return `${variant}=${value}`
    })
    entries.sort()
    return `${slot}|${setId}|${rank}|${rarity}|${level}|${faction}|${main}|${entries.join(',')}`
  }, [])

  useEffect(() => {
    if (!pendingExternalItems || pendingExternalItems.length === 0) return
    let appended = false
    setItems((prev) => {
      if (!pendingExternalItems || pendingExternalItems.length === 0) return prev
      const existing = new Set(prev.map((it) => fingerprintForItem(it)))
      const additions: TesterItem[] = []
      for (const incoming of pendingExternalItems) {
        const base = adjustSubValuesFor({ ...(incoming as TestItem), rowId: allocRowId() } as TesterItem)
        const key = fingerprintForItem(base)
        if (existing.has(key)) continue
        existing.add(key)
        additions.push(base)
      }
      if (additions.length === 0) return prev
      const next = [...prev, ...additions]
      pruneEasterEggStateForItems(next)
      appended = true
      return next
    })
    if (appended) {
      try {
        const node = scrollContainerRef.current
        if (node) {
          window.requestAnimationFrame(() => { node.scrollTop = node.scrollHeight })
        }
      } catch {}
    }
    if (onConsumeExternalItems) onConsumeExternalItems()
  // adjustSubValuesFor is recreated per render; pendingExternalItems change is the trigger we care about.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingExternalItems, allocRowId, pruneEasterEggStateForItems, fingerprintForItem, onConsumeExternalItems])

  const makeDefaultItem = (): TesterItem => {
    const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!
    const slotIds = Object.keys(artifactTypeNames).map(Number)
    const levelMilestones: Array<0|4|8|12|16> = [0,4,8,12,16]
    const slot = pick(slotIds) as ArtifactTypeId
    const allowedMainSet = ALLOWED_MAIN_BY_SLOT[Number(slot) as ArtifactType]
    const allowedMains = allowedMainSet ? Array.from(allowedMainSet) : [StatVariant.HP, StatVariant.ATK, StatVariant.DEF]
    const main = pick(allowedMains) as number
    const isAccessory = Number(slot) === ArtifactType.Ring || Number(slot) === ArtifactType.Amulet || Number(slot) === ArtifactType.Banner
    const factionPool = [
      Faction.BannerLords, Faction.HighElves, Faction.SacredOrder, Faction.Barbarians,
      Faction.OgrynTribes, Faction.Lizardmen, Faction.Skinwalkers, Faction.Orcs,
      Faction.Demonspawn, Faction.UndeadHordes, Faction.DarkElves, Faction.KnightRevenant,
      Faction.Shadowkin, Faction.SylvanWatchers, Faction.Dwarves,
    ] as const
    // Start with no substats; let adjustSubValuesFor fill correct count based on rarity+level
    const subValues: Record<number, number> = {}
    const baseItem: TesterItem = {
      slot,
      set: ((): ArtifactSetId => {
        const pool = allowedTesterSetIds(slot)
        const id = pool.length ? pool[Math.floor(Math.random() * pool.length)]! : ArtifactSet.Speed
        return id as ArtifactSetId
      })(),
      rank: (1 + Math.floor(Math.random() * 6)) as 1|2|3|4|5|6,
      rarity: (1 + Math.floor(Math.random() * 6)) as 1|2|3|4|5|6,
      level: pick(levelMilestones),
      faction: (isAccessory ? pick(factionPool) : 0) as FactionId,
      main: main,
      subValues,
      rowId: allocRowId(),
    }
    return adjustSubValuesFor(baseItem)
  }

  // Seed with six curated defaults (varied slots/sets) when there is no autosave state; all start collapsed.
  const makeDefaultItems = (): TesterItem[] => {
    const star: 1|2|3|4|5|6 = 6
    const baseForSixStar = (variant: number): number => minima.six[variant] ?? 0
    const sharedRank: TesterItem['rank'] = star
    const sharedRarity: TesterItem['rarity'] = 5
    const defaultFaction: FactionId = 0 as FactionId
    type DefaultSeed = {
      slot: ArtifactTypeId
      set: ArtifactSetId
      level: 0|4|8|12|16
      main: StatVariant
      subs: StatVariant[]
      faction?: FactionId
    }
    const seeds: DefaultSeed[] = [
      {
        slot: ArtifactType.Boots as ArtifactTypeId,
        set: ArtifactSet.Speed as ArtifactSetId,
        level: 16,
        main: StatVariant.SPD,
        subs: [StatVariant.CR, StatVariant.CDMG, StatVariant.HP, StatVariant.ACC],
      },
      {
        slot: ArtifactType.Gauntlets as ArtifactTypeId,
        set: ArtifactSet.Savage as ArtifactSetId,
        level: 12,
        main: StatVariant.CDMG,
        subs: [StatVariant.SPD, StatVariant.CR, StatVariant.ATK, StatVariant.ACC],
      },
      {
        slot: ArtifactType.Chestplate as ArtifactTypeId,
        set: ArtifactSet.Stoneskin as ArtifactSetId,
        level: 8,
        main: StatVariant.DEF,
        subs: [StatVariant.RES, StatVariant.HP, StatVariant.SPD, StatVariant.ACC],
      },
      {
        slot: ArtifactType.Weapon as ArtifactTypeId,
        set: ArtifactSet.SwiftParry as ArtifactSetId,
        level: 0,
        main: StatVariant.ATK_FLAT,
        subs: [StatVariant.CDMG, StatVariant.CR, StatVariant.SPD, StatVariant.ACC],
      },
      {
        slot: ArtifactType.Helmet as ArtifactTypeId,
        set: ArtifactSet.Immortal as ArtifactSetId,
        level: 4,
        main: StatVariant.HP_FLAT,
        subs: [StatVariant.HP, StatVariant.DEF, StatVariant.RES, StatVariant.SPD],
      },
      {
        slot: ArtifactType.Banner as ArtifactTypeId,
        set: ArtifactSet.Reaction as ArtifactSetId,
        level: 16,
        main: StatVariant.ACC,
        subs: [StatVariant.SPD, StatVariant.HP, StatVariant.DEF, StatVariant.ATK],
        faction: Faction.HighElves as FactionId,
      },
    ]
    return seeds.map(({ subs, faction, slot, set, level, main }) => {
      // Distribute upgrade rolls deterministically based on level milestones (every +4 levels).
      const baseRollsPerStat = new Map<number, number>()
      for (const variant of subs) baseRollsPerStat.set(variant, 1)
      const extraRolls = Math.floor(level / 4)
      for (let i = 0; i < extraRolls; i += 1) {
        const variant = subs[i % subs.length] ?? null
        if (variant == null) break
        baseRollsPerStat.set(variant, (baseRollsPerStat.get(variant) ?? 1) + 1)
      }
      const subValues = subs.reduce<Record<number, number>>((acc, variant) => {
        const rolls = baseRollsPerStat.get(variant) ?? 1
        const base = baseForSixStar(variant)
        acc[variant] = base * rolls
        return acc
      }, {})
      const resolvedFaction: FactionId = faction ?? defaultFaction
      const testerItem: TesterItem = {
        slot,
        set,
        level,
        main,
        rank: sharedRank,
        rarity: sharedRarity,
        faction: resolvedFaction,
        subValues,
        compact: true,
        rowId: allocRowId(),
      }
      return adjustSubValuesFor(testerItem)
    })
  }

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
      <DialogActions>
        <Button
          size="small"
          variant="outlined"
          color="error"
          onClick={() => setConfirmResetOpen(true)}
        >
          {t('resetToDefaults')}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
      <Dialog
        open={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
      >
        <DialogTitle>{t('testerResetConfirmTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('testerResetConfirmBody')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmResetOpen(false)}>{t('cancel')}</Button>
          <Button
            color="error"
            onClick={() => {
              setConfirmResetOpen(false)
              const nextItems = makeDefaultItems()
              setItems(nextItems)
              pruneEasterEggStateForItems(nextItems)
              setSetsOrder('icons')
              setSetsSearch('')
              setSetsMenuOpenIdx(null)
              requestAnimationFrame(() => setSetsMenuAnchorPos(null))
            }}
          >
            {t('reset')}
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
