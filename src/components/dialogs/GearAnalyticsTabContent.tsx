/**
 * GearAnalyticsTabContent.tsx
 *
 * Gear Analytics analytics tab: cross-filtering inventory dashboard.
 * Cross-filter rule: clicking a segment in any chart adds it to that dimension's
 * filter, and every other chart shows data filtered by the remaining active dimensions.
 * This is the BI-style Crossfilter pattern.
 */
import { useState, useRef, useMemo, useCallback, useEffect, useLayoutEffect, startTransition, useDeferredValue } from 'react'
import type { GearAnalyticsEggPeer } from '../../lib/easterEggAnimUtils'
import { Box, Button, CircularProgress, Tooltip, Typography, useTheme } from '@mui/material'
import { toPng } from 'html-to-image'
import { RARITY_ACCENT_COLORS } from '../../lib/rarityColors'
import { slotIconSvgAsset } from '../artifactTypeIcons'
import { gearSetIconUrl } from '../../lib/iconMaps/gearsetIconMap'
import { NO_SET_SPIDER_SRC } from '../NoGearSetIcon'
import { useSubstatColors } from '../../hooks/useSubstatColors'
import { useDisplayPreferences } from '../../state/preferencesState'
import type { GearInspectorPreviewRow } from '../../types/gearInspectorPreview'
import {
  EMPTY_GEAR_ANALYTICS_DIM,
  isGearAnalyticsDimActive,
  applyGearAnalyticsFilter,
  countBySlot,
  countByRarity,
  countSetsByOutcome,
  countByOutcome,
  countByRank,
  countBySource,
  countByLevel,
  rankLabel,
  countMainStatFrequency,
  countSubstatFrequency,
  buildSlotMainMatrix,
  computeGearAnalyticsKpis,
  levelLabel,
  sourceIconSvgAsset,
  slotGroupIds,
  artifactTypeI18nKey,
  rarityRankValueI18nKey,
  statVariantI18nKey,
  getLocalizedGearSetName,
  type GearAnalyticsDim,
  type GearAnalyticsOutcome,
  type GearAnalyticsSource,
} from '../../lib/gearAnalytics'
import { STANDARD_DIALOG_PADDING_BLOCK_UNITS, STANDARD_DIALOG_PADDING_INLINE_UNITS, ACCESSORY_NO_SET_ID } from '../../lib/constants'
import type { ArtifactSetId, ArtifactTypeId } from '../../lib/types'
import { getAccessorySlotsCompatibleSetIds, getArmorFixedSetIds, getArmorVariableSetIds } from '../../lib/types'
import type { ArtifactSetSelectionEntry } from '../../lib/gearSets/selection'
import { isAccessorySlot } from '../../lib/gearInspectorDomain'
import { useGearSetCatalogVersion } from '../../hooks/useGearSetCatalogVersion'
import { useAppState } from '../../state/appState'
import { APP_VERSION } from '../../version'
import { reserveScrollbarGutterSpace } from '../../lib/scrollbar'
import { GearAnalyticsCrossFilterChips } from '../gear-analytics/GearAnalyticsCrossFilterChips'
import { GearAnalyticsKpiCards } from '../gear-analytics/GearAnalyticsKpiCards'
import { GearAnalyticsDonut, type DonutSlice } from '../gear-analytics/GearAnalyticsDonut'
import { GearAnalyticsBar, type BarEntry } from '../gear-analytics/GearAnalyticsBar'
import { GearAnalyticsTreemap } from '../gear-analytics/GearAnalyticsTreemap'
import { GearAnalyticsRadar } from '../gear-analytics/GearAnalyticsRadar'
import { GearAnalyticsHeatmap } from '../gear-analytics/GearAnalyticsHeatmap'
import { GearAnalyticsChampStats } from '../gear-analytics/GearAnalyticsChampStats'
import { GearAnalyticsNotEquipped } from '../gear-analytics/GearAnalyticsNotEquipped'
import { useI18n } from '../../lib/i18n'
import { canWriteImageToClipboard } from '../../lib/clipboard'

type Props = {
  /** All loaded gear rows, unfiltered. Stats always reflect the full inventory. */
  rows: readonly GearInspectorPreviewRow[]
  /** Called when the user requests applying the current Gear Analytics filter to the Gear Inspector. */
  onApplyToGearInspector?: ((dim: GearAnalyticsDim) => void) | undefined
  /**
   * When provided, the "Copy from Gear Inspector" button becomes available.
   * Null / undefined = button is hidden. Non-null but empty dim = button shown but disabled.
   * Clicking copies this dim into the current cross-filter state (replaces it).
   */
  gearInspectorDim?: GearAnalyticsDim | null
  /**
   * Increment this value from outside to reset all cross-filter dimensions to their empty state.
   * Mirrors the "Reset to defaults" button pattern used in other Logic Hub tabs.
   */
  resetKey?: number
  /**
   * Gear Inspector selection (artifact IDs) — shared so the Not Fully Equipped grid can
   * click-toggle the same selection set the Gear Inspector reads. Selection is held in
   * App state so it survives tab switches and (when enabled) syncs to the WebSocket push endpoint.
   */
  selectedGearItemIds?: ReadonlySet<number>
  /** Setter that accepts the full new selection set (matches GearInspectorItemsGrid's signature). */
  onGearItemsSelect?: (next: ReadonlySet<number>) => void
}

// ── Section collapse IDs and localStorage persistence ─────────────────────────
/** All collapsible section IDs in the Gear Analytics dashboard, in display order. */
const GEAR_ANALYTICS_SECTION_IDS = ['slot', 'rank', 'rarity', 'outcome', 'source', 'level', 'treemap', 'mainStat', 'substats', 'heatmap', 'champStats', 'notEquipped'] as const
type GearAnalyticsSectionId = (typeof GEAR_ANALYTICS_SECTION_IDS)[number]

const COLLAPSED_STORAGE_KEY = 'gearAnalytics.collapsed'

/** Returns a fully-expanded default collapsed record (all false = expanded). */
function defaultCollapsed(): Record<GearAnalyticsSectionId, boolean> {
  return Object.fromEntries(GEAR_ANALYTICS_SECTION_IDS.map((id) => [id, false])) as Record<GearAnalyticsSectionId, boolean>
}

/** Reads the persisted collapsed state from localStorage, falling back to all-expanded. */
function readCollapsed(): Record<GearAnalyticsSectionId, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY)
    if (!raw) return defaultCollapsed()
    const parsed = JSON.parse(raw) as Partial<Record<string, boolean>>
    const result = defaultCollapsed()
    for (const id of GEAR_ANALYTICS_SECTION_IDS) {
      if (typeof parsed[id] === 'boolean') result[id] = parsed[id]!
    }
    return result
  } catch {
    return defaultCollapsed()
  }
}

/** Ordered outcome IDs and their i18n keys. */
const OUTCOME_I18N_KEY: Record<GearAnalyticsOutcome, string> = {
  sell: 'gearAnalyticsOutcomeSell',
  keep: 'gearAnalyticsOutcomeKeep',
  safe: 'gearAnalyticsOutcomeSafe',
  none: 'gearAnalyticsOutcomeNone',
}
/** Display order for the outcome donut slices. */
const OUTCOME_ORDER: GearAnalyticsOutcome[] = ['sell', 'keep', 'safe', 'none']

/** Source category i18n key map — keeps GearAnalyticsTabContent free of string arithmetic. */
const SOURCE_I18N_KEY: Record<GearAnalyticsSource, string> = {
  inventory: 'gearAnalyticsSourceInventory',
  collection: 'gearAnalyticsSourceCollection',
  vault: 'gearAnalyticsSourceVault',
  inbox: 'gearAnalyticsSourceInbox',
  manual: 'gearAnalyticsSourceManual',
}

/** Toggle a value in a ReadonlySet, returning a new Set. */
function toggled<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value); else next.add(value)
  return next
}

export function GearAnalyticsTabContent({ rows, onApplyToGearInspector, gearInspectorDim, resetKey, selectedGearItemIds, onGearItemsSelect }: Props) {
  const { t, lang } = useI18n()
  const theme = useTheme()
  const [substatColors] = useSubstatColors()
  const { showSetIcons, statButtonBorders } = useDisplayPreferences()
  // Metasets for the GearSetsSelect quick-filter in the Sets treemap title row.
  const { metasets } = useAppState()
  // Catalog version gate: forces recompute of slot-aware set pools when new sets are registered.
  const gearSetCatalogVersion = useGearSetCatalogVersion()

  // Ref used by the Copy Snapshot button to capture the tab content.
  const contentRef = useRef<HTMLDivElement | null>(null)
  // Ref to the watermark element — hidden normally, revealed only during snapshot capture.
  const watermarkRef = useRef<HTMLElement | null>(null)
  const [copying, setCopying] = useState(false)
  const [copyDone, setCopyDone] = useState(false)
  // Stable for the page's lifetime: navigator.clipboard.write requires a secure context (HTTPS/localhost).
  // Over plain http://, the browser blocks the Clipboard API, so we fall back to a file download.
  const canCopy = useMemo(() => canWriteImageToClipboard(), [])

  const handleCopySnapshot = useCallback(async () => {
    if (!contentRef.current || copying) return
    setCopying(true)
    try {
      const el = contentRef.current
      // Reveal the watermark before reading dimensions so its height is included in scrollHeight.
      const wm = watermarkRef.current
      if (wm) {
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        const localTs = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
        // Append UTC offset so snapshots are unambiguous when shared across timezones.
        // getTimezoneOffset() returns minutes *behind* UTC, so negate it for the display sign.
        const offsetMin = -now.getTimezoneOffset()
        const sign = offsetMin >= 0 ? '+' : '-'
        const absH = Math.floor(Math.abs(offsetMin) / 60)
        const absM = Math.abs(offsetMin) % 60
        const offsetStr = absM > 0 ? `UTC${sign}${absH}:${pad(absM)}` : `UTC${sign}${absH}`
        // Use innerHTML to render "for RSL Helper" at a smaller font size inline.
        // All values are build-time constants or formatted Date output — no user input, XSS-safe.
        wm.innerHTML = `${localTs} ${offsetStr} \u00b7 Sellfile Creator<span style="font-size:0.78em;opacity:0.85"> for RSL Helper</span> v${APP_VERSION}`
        wm.style.display = 'block'
      }
      // Hide snapshot-excluded elements *before* measuring scrollHeight so they don't inflate
      // the canvas size — otherwise html-to-image filters them out visually but the blank space
      // they occupied still appears at the bottom of the exported image.
      const hiddenNodes = Array.from(el.querySelectorAll<HTMLElement>('[data-snapshot-hide]'))
      const prevDisplays = hiddenNodes.map((n) => n.style.display)
      hiddenNodes.forEach((n) => { n.style.display = 'none' })
      // Read dimensions after revealing watermark (and hiding excluded sections) so fullHeight
      // reflects exactly what will be rendered.
      const fullWidth  = el.offsetWidth
      const fullHeight = el.scrollHeight
      // Expand the element in-place (clone approach renders black — off-screen fixed elements
      // may not be painted by the browser). Store and restore all mutated style properties.
      const prevOverflow = el.style.overflow
      const prevHeight   = el.style.height
      const prevMaxH     = el.style.maxHeight
      el.style.overflow  = 'visible'
      el.style.height    = `${fullHeight}px`
      el.style.maxHeight = 'none'
      // Wait for the browser to reflow before html-to-image reads dimensions.
      // Without this, getBoundingClientRect still returns the pre-mutation size.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      try {
        // Pass explicit width/height so html-to-image uses them instead of getBoundingClientRect,
        // which would otherwise return the visible (clipped) height from the parent overflow chain.
        const dataUrl = await toPng(el, {
          cacheBust: true,
          pixelRatio: Math.min(window.devicePixelRatio, 2),
          backgroundColor: theme.palette.background.paper,
          width: fullWidth,
          height: fullHeight,
          // Hide Clear-filter buttons (no semantic value in a snapshot) but keep active chips.
          filter: (node) => !(node instanceof Element && node.hasAttribute('data-snapshot-hide')),
        })
        if (canCopy) {
          // Secure context: copy PNG blob directly to clipboard.
          const res  = await fetch(dataUrl)
          const blob = await res.blob()
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        } else {
          // Non-secure context (plain http://): trigger a browser file download instead.
          // Build a timestamp-stamped filename so multiple snapshots don't overwrite each other.
          const now2 = new Date()
          const pad2 = (n: number) => String(n).padStart(2, '0')
          const ts = `${now2.getFullYear()}${pad2(now2.getMonth() + 1)}${pad2(now2.getDate())}-${pad2(now2.getHours())}${pad2(now2.getMinutes())}`
          const a = document.createElement('a')
          a.href = dataUrl
          a.download = `gear-analytics-${ts}.png`
          a.click()
        }
        setCopyDone(true)
        setTimeout(() => setCopyDone(false), 2000)
      } finally {
        el.style.overflow  = prevOverflow
        el.style.height    = prevHeight
        el.style.maxHeight = prevMaxH
        // Restore snapshot-excluded elements and hide the watermark again after capture.
        hiddenNodes.forEach((n, i) => { n.style.display = prevDisplays[i]! })
        if (wm) wm.style.display = ''
      }
    } catch (err) {
      console.error('[gear-analytics] snapshot copy failed', err)
    } finally {
      setCopying(false)
    }
  }, [canCopy, copying, theme])

  // Color callback used by bar charts to tint stat labels by their configured palette color.
  const statColorById = useCallback(
    (id: number | string): string | undefined => substatColors[Number(id)]?.fg,
    [substatColors],
  )

  // ── Section collapse state ─────────────────────────────────────────────────
  // All sections start expanded (false = expanded); state is persisted to localStorage.
  const [collapsed, setCollapsed] = useState<Record<GearAnalyticsSectionId, boolean>>(readCollapsed)
  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed)) } catch { /* storage unavailable */ }
  }, [collapsed])
  /** Toggle a single section or all sections at once (Ctrl/Cmd+click or right-click). */
  const toggleSection = useCallback((id: GearAnalyticsSectionId, applyToAll: boolean) => {
    setCollapsed((prev) => {
      const nextValue = !prev[id]
      if (applyToAll) {
        return Object.fromEntries(GEAR_ANALYTICS_SECTION_IDS.map((k) => [k, nextValue])) as Record<GearAnalyticsSectionId, boolean>
      }
      return { ...prev, [id]: nextValue }
    })
  }, [])

  // Cross-filter state: all dimensions start empty (= no filter).
  const [dim, setDim] = useState<GearAnalyticsDim>(EMPTY_GEAR_ANALYTICS_DIM)
  // deferredDim trails dim by one React render — the eight cross-filter passes and all downstream
  // aggregations run in the deferred (lower-priority) render, so a filter click feels instant:
  // the selection chip and selected-slice highlighting update eagerly while chart data catches up.
  const deferredDim = useDeferredValue(dim)
  // Substat co-occurrence pivot: one or more substat variants selected by clicking radar marks.
  // The radar then shows only items containing ALL selected substats (AND intersection).
  const [selectedSubstat, setSelectedSubstat] = useState<ReadonlySet<number>>(() => new Set())

  // ── Cross-component Easter egg peer broadcasts ────────────────────────────────────────────────
  // When any component's Easter egg fires it calls its onEasterEgg callback, which may
  // (randomly) set peer triggers on a random subset of sibling components.
  const eggSeqRef = useRef(0)
  const [donutPeer,   setDonutPeer]   = useState<GearAnalyticsEggPeer | null>(null)
  const [radarPeer,   setRadarPeer]   = useState<GearAnalyticsEggPeer | null>(null)
  const [treemapPeer, setTreemapPeer] = useState<GearAnalyticsEggPeer | null>(null)
  const [barPeer,     setBarPeer]     = useState<GearAnalyticsEggPeer | null>(null)

  // Helper: fire a peer trigger with a fresh seq only when a random roll passes the threshold.
  const maybeSet = useCallback(
    (setter: React.Dispatch<React.SetStateAction<GearAnalyticsEggPeer | null>>, flavor: GearAnalyticsEggPeer['flavor'], threshold: number) => {
      if (Math.random() < threshold) setter({ seq: ++eggSeqRef.current, flavor })
    },
    [],
  )
  // Helper: unconditionally fire a peer trigger (used for the jackpot all-react path).
  const forceSet = useCallback(
    (setter: React.Dispatch<React.SetStateAction<GearAnalyticsEggPeer | null>>, flavor: GearAnalyticsEggPeer['flavor']) => {
      setter({ seq: ++eggSeqRef.current, flavor })
    },
    [],
  )

  // A donut fires.
  // Jackpot (0.5 %): all siblings react at once — the whole dashboard goes haywire.
  // Normal path: each sibling rolls independently.
  // startTransition defers the cascade setState calls so React doesn't pre-empt the WAAPI dance animation.
  const handleDonutEgg = useCallback(() => {
    startTransition(() => {
      if (Math.random() < 0.005) {
        forceSet(setDonutPeer,   'cascade')
        forceSet(setTreemapPeer, 'cascade')
        forceSet(setRadarPeer,   'cascade')
        forceSet(setBarPeer,     'cascade')
        return
      }
      maybeSet(setDonutPeer,   'cascade', 0.22)
      maybeSet(setTreemapPeer, 'cascade', 0.15)
      maybeSet(setRadarPeer,   'cascade', 0.15)
      maybeSet(setBarPeer,     'cascade', 0.12)
    })
  }, [maybeSet, forceSet])

  // The treemap fires.
  const handleTreemapEgg = useCallback(() => {
    startTransition(() => {
      if (Math.random() < 0.005) {
        forceSet(setDonutPeer,   'rage')
        forceSet(setRadarPeer,   'cascade')
        forceSet(setBarPeer,     'cascade')
        return
      }
      maybeSet(setDonutPeer, 'rage',    0.20)
      maybeSet(setRadarPeer, 'cascade', 0.15)
      maybeSet(setBarPeer,   'cascade', 0.12)
    })
  }, [maybeSet, forceSet])

  // The radar fires.
  const handleRadarEgg = useCallback(() => {
    startTransition(() => {
      if (Math.random() < 0.005) {
        forceSet(setTreemapPeer, 'cascade')
        forceSet(setDonutPeer,   'cascade')
        forceSet(setBarPeer,     'cascade')
        return
      }
      maybeSet(setTreemapPeer, 'cascade', 0.15)
      maybeSet(setDonutPeer,   'cascade', 0.15)
      maybeSet(setBarPeer,     'cascade', 0.12)
    })
  }, [maybeSet, forceSet])

  // The stat bars fire.
  const handleBarEgg = useCallback(() => {
    startTransition(() => {
      if (Math.random() < 0.005) {
        forceSet(setDonutPeer,   'cascade')
        forceSet(setTreemapPeer, 'cascade')
        forceSet(setRadarPeer,   'cascade')
        return
      }
      maybeSet(setDonutPeer,   'cascade', 0.15)
      maybeSet(setTreemapPeer, 'cascade', 0.12)
      maybeSet(setRadarPeer,   'cascade', 0.12)
    })
  }, [maybeSet, forceSet])

  // Partial-update helper: merge a patch into the current dim.
  const updateDim = useCallback((patch: Partial<GearAnalyticsDim>) => {
    setDim((prev) => ({ ...prev, ...patch }))
  }, [])

  // Toggle helpers for each dimension. Accept number|string to match DonutSlice/BarEntry onToggle signatures.
  const toggleSlot = useCallback((id: number | string) => {
    setDim((prev) => ({ ...prev, slots: toggled(prev.slots, Number(id)) }))
  }, [])
  // Double-click: replace the slot filter with all slots in the same group (armor or accessory).
  const selectSlotGroup = useCallback((id: number | string) => {
    const group = slotGroupIds(Number(id))
    if (group) setDim((prev) => ({ ...prev, slots: group }))
  }, [])
  const toggleRank = useCallback((id: number | string) => {
    setDim((prev) => ({ ...prev, ranks: toggled(prev.ranks, Number(id)) }))
  }, [])
  const toggleRarity = useCallback((id: number | string) => {
    setDim((prev) => ({ ...prev, rarities: toggled(prev.rarities, Number(id)) }))
  }, [])
  // ── Set cross-filter: individual selections + metaset group selections ─────────────────────────
  // We track these separately so the GearSetsSelect can show metaset chips alongside individual set
  // chips without losing the distinction. dim.sets = union(individual, metaset-expanded).
  // Refs allow callbacks to read the current values without stale-closure issues.
  const [dimIndividualSets, setDimIndividualSets] = useState<ReadonlySet<number>>(() => new Set())
  const dimIndividualSetsRef = useRef<ReadonlySet<number>>(new Set())
  useLayoutEffect(() => { dimIndividualSetsRef.current = dimIndividualSets })
  const [dimMetaSetNames, setDimMetaSetNames] = useState<string[]>([])
  const dimMetaSetNamesRef = useRef<string[]>([])
  useLayoutEffect(() => { dimMetaSetNamesRef.current = dimMetaSetNames })

  // Expand a list of metaset names to their constituent set IDs.
  const getExpandedMetaSetIds = useCallback((names: string[]): Set<number> => {
    const ids = new Set<number>()
    for (const name of names) {
      const meta = metasets.find((m) => m.name === name)
      if (meta) meta.sets.forEach((id) => ids.add(Number(id)))
    }
    return ids
  }, [metasets])

  const toggleSet = useCallback((id: number | string) => {
    // Allow -1 (others bucket) through — effectiveDim expands it at filter time.
    const num = Number(id)
    const newIndividual = new Set(dimIndividualSetsRef.current)
    if (newIndividual.has(num)) newIndividual.delete(num); else newIndividual.add(num)
    setDimIndividualSets(newIndividual)
    // Recompute effective sets = individual + metaset-expanded.
    const expanded = getExpandedMetaSetIds(dimMetaSetNamesRef.current)
    const newSets = new Set<number>([...newIndividual, ...expanded])
    setDim((prev) => ({ ...prev, sets: newSets }))
  }, [getExpandedMetaSetIds])

  // GearSetsSelect value: only explicitly-selected individual sets (metaset chips are shown
  // via selectedMetaSetNames so they don't need to appear here as individual entries).
  const setSelectionEntries = useMemo<ArtifactSetSelectionEntry[]>(
    () => Array.from(dimIndividualSets).map((id) => ({ id: id as ArtifactSetId })),
    [dimIndividualSets],
  )
  // Replace the individual set selection from a GearSetsSelect onChange event.
  const handleSetSelectionChange = useCallback((next: ArtifactSetSelectionEntry[]) => {
    const ids = new Set(next.filter((e) => !e.excluded).map((e) => Number(e.id)))
    setDimIndividualSets(ids)
    const expanded = getExpandedMetaSetIds(dimMetaSetNamesRef.current)
    const newSets = new Set<number>([...ids, ...expanded])
    setDim((prev) => ({ ...prev, sets: newSets }))
  }, [getExpandedMetaSetIds])
  // Metaset group selection change: update dim.sets via a delta so that we never read a
  // potentially-stale dimIndividualSetsRef (handleClear fires both onChange and onChangeMetasetIds
  // synchronously, so the ref hasn't updated yet when the second callback executes).
  // Instead: subtract constituent sets from deselected metasets and add those from newly-selected
  // ones. Applying this delta on top of whatever setDim queued before is always correct.
  const handleMetaSetNamesChange = useCallback((nextIds: string[]) => {
    // prevIds read synchronously — safe before any batched state updates flush.
    const prevIds = dimMetaSetNamesRef.current
    setDimMetaSetNames(nextIds)
    const prevExpanded = getExpandedMetaSetIds(prevIds)
    const nextExpanded = getExpandedMetaSetIds(nextIds)
    setDim((prev) => {
      const newSets = new Set([...prev.sets].filter((id) => !prevExpanded.has(id)))
      for (const id of nextExpanded) newSets.add(id)
      return { ...prev, sets: newSets }
    })
  }, [getExpandedMetaSetIds])
  // Slot-aware set pool for the GearSetsSelect quick-filter in the Sets treemap title row.
  // When specific slots are selected, restrict the set list to sets compatible with those slots.
  // Empty slots (= no filter) or mixed armor+accessory = no restriction (undefined).
  const treemapAllowedSetIds = useMemo<readonly ArtifactSetId[] | undefined>(() => {
    void gearSetCatalogVersion
    if (dim.slots.size === 0) return undefined
    const slots = Array.from(dim.slots) as ArtifactTypeId[]
    const hasAccessory = slots.some((s) => isAccessorySlot(s))
    const hasArmor = slots.some((s) => !isAccessorySlot(s))
    if (hasAccessory && hasArmor) return undefined
    if (hasAccessory) return getAccessorySlotsCompatibleSetIds()
    return Object.freeze([...getArmorFixedSetIds(), ...getArmorVariableSetIds()])
  }, [dim.slots, gearSetCatalogVersion])
  const toggleOutcome = useCallback((outcome: GearAnalyticsOutcome) => {
    setDim((prev) => ({ ...prev, outcomes: toggled(prev.outcomes, outcome) }))
  }, [])
  const toggleSource = useCallback((id: number | string) => {
    setDim((prev) => ({ ...prev, sources: toggled(prev.sources, id as GearAnalyticsSource) }))
  }, [])
  const toggleLevel = useCallback((id: number | string) => {
    setDim((prev) => ({ ...prev, levels: toggled(prev.levels, Number(id)) }))
  }, [])
  // Toggle a main stat cross-filter selection. Number-normalised to match dim.mainStats type.
  const toggleMainStat = useCallback((id: number | string) => {
    setDim((prev) => ({ ...prev, mainStats: toggled(prev.mainStats, Number(id)) }))
  }, [])
  const toggleSubstat = useCallback((variant: number) => {
    setSelectedSubstat((prev) => {
      // If already selected, deselect; if at the 4-pivot cap and not selected, ignore.
      if (prev.has(variant)) return toggled(prev, variant)
      if (prev.size >= 4) return prev
      return toggled(prev, variant)
    })
  }, [])
  const clearSubstat = useCallback(() => setSelectedSubstat(new Set()), [])
  const clearDim = useCallback(() => {
    setDim(EMPTY_GEAR_ANALYTICS_DIM)
    setSelectedSubstat(new Set())
    setDimIndividualSets(new Set())
    setDimMetaSetNames([])
  }, [])
  // Replace the current cross-filter state with the gear inspector dim (copy-from button).
  // Treat all copied sets as individual selections (no metaset context is available from inspector).
  const handleCopyFromGearInspector = useCallback(() => {
    if (!gearInspectorDim) return
    setDim(gearInspectorDim)
    setSelectedSubstat(new Set())
    setDimIndividualSets(gearInspectorDim.sets as ReadonlySet<number>)
    setDimMetaSetNames([])
  }, [gearInspectorDim])
  // Clear all cross-filter dimensions when the parent increments resetKey (e.g. "Reset to defaults" button).
  // "Adjust state directly during render" pattern: React re-renders immediately when setState is called
  // during render, so the user never sees the stale state. Avoids useEffect's one-render delay.
  const [prevResetKey, setPrevResetKey] = useState<number | undefined>(resetKey)
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey)
    if (resetKey !== undefined) {
      setDim(EMPTY_GEAR_ANALYTICS_DIM)
      setSelectedSubstat(new Set())
      setDimIndividualSets(new Set())
      setDimMetaSetNames([])
    }
  }

  // ── Crossfilter-filtered row sets ──────────────────────────────────────────
  // Each chart receives the full row set filtered by all dimensions EXCEPT its own.
  // This preserves the full range of that dimension for interactive exploration.
  // The icon tile grid exposes real set IDs directly, so no synthetic -1 expansion is needed.
  const rowsForSlot    = useMemo(() => applyGearAnalyticsFilter(rows, deferredDim, 'slots'),    [rows, deferredDim])
  const rowsForRank    = useMemo(() => applyGearAnalyticsFilter(rows, deferredDim, 'ranks'),    [rows, deferredDim])
  const rowsForRarity  = useMemo(() => applyGearAnalyticsFilter(rows, deferredDim, 'rarities'), [rows, deferredDim])
  const rowsForSet     = useMemo(() => applyGearAnalyticsFilter(rows, deferredDim, 'sets'),     [rows, deferredDim])
  const rowsForOutcome = useMemo(() => applyGearAnalyticsFilter(rows, deferredDim, 'outcomes'), [rows, deferredDim])
  const rowsForSource  = useMemo(() => applyGearAnalyticsFilter(rows, deferredDim, 'sources'),  [rows, deferredDim])
  const rowsForLevel    = useMemo(() => applyGearAnalyticsFilter(rows, deferredDim, 'levels'),    [rows, deferredDim])
  const rowsForMainStat = useMemo(() => applyGearAnalyticsFilter(rows, deferredDim, 'mainStats'), [rows, deferredDim])
  // KPIs use all active filters applied (including mainStats).
  const rowsFiltered    = useMemo(() => applyGearAnalyticsFilter(rows, deferredDim),              [rows, deferredDim])

  // ── Aggregations ───────────────────────────────────────────────────────────
  // Slot donut data. Labels go through t() so they respect the active language.
  const slotData: DonutSlice[] = useMemo(() => {
    const counts = countBySlot(rowsForSlot)
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([slot, count]) => ({ id: slot, label: t(artifactTypeI18nKey(slot)), count }))
  }, [rowsForSlot, t])

  // Rank donut data (star grade 1-6, ascending).
  const rankData: DonutSlice[] = useMemo(() => {
    const counts = countByRank(rowsForRank)
    return Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([rank, count]) => ({ id: rank, label: rankLabel(rank), count }))
  }, [rowsForRank])

  // Rarity donut data (RankValue 1-6, ascending). Labels go through t() for the active language.
  const rarityData: DonutSlice[] = useMemo(() => {
    const counts = countByRarity(rowsForRarity)
    return Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([rarity, count]) => ({ id: rarity, label: t(rarityRankValueI18nKey(rarity)), count }))
  }, [rowsForRarity, t])

  // Set chart data — all sets with per-outcome breakdown, sorted by total desc.
  // setNameFn localizes set names via the catalog (getLocalizedGearSetName handles runtime sets too).
  const setData = useMemo(
    () => countSetsByOutcome(rowsForSet, {
      noSetLabel: t('noSetAccessories'),
      setNameFn: (id) => getLocalizedGearSetName(id as ArtifactSetId, t, lang),
    }),
    [rowsForSet, t, lang],
  )

  // Icon function for the set chart: bitmap gear set icons; spider icon for no-set accessories.
  const setIconById = useCallback(
    (id: number): { url: string } | null => {
      if (id === ACCESSORY_NO_SET_ID) return { url: NO_SET_SPIDER_SRC }
      const url = gearSetIconUrl(id as ArtifactSetId)
      return url ? { url } : null
    },
    [],
  )


  // Main stat bar data — excludes its own dim so the full range is always visible.
  const mainStatData: BarEntry[] = useMemo(() => {
    const counts = countMainStatFrequency(rowsForMainStat)
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([variant, count]) => ({ id: variant, label: t(statVariantI18nKey(variant)), count }))
  }, [rowsForMainStat, t])

  // Outcome donut data (fixed order; 'none' shown only when items are unmatched).
  const outcomeData: DonutSlice[] = useMemo(() => {
    const counts = countByOutcome(rowsForOutcome)
    return OUTCOME_ORDER
      .filter((id) => counts[id] > 0)
      .map((id) => ({ id, label: t(OUTCOME_I18N_KEY[id]), count: counts[id] }))
  }, [rowsForOutcome, t])

  // Source donut data (inventory / collection / vault / inbox / manual).
  const sourceData: DonutSlice[] = useMemo(() => {
    const counts = countBySource(rowsForSource)
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([src, count]) => ({ id: src, label: t(SOURCE_I18N_KEY[src]), count }))
  }, [rowsForSource, t])

  // Level donut data (0 / 4 / 8 / 12 / 16 — ascending order).
  const levelData: DonutSlice[] = useMemo(() => {
    const counts = countByLevel(rowsForLevel)
    return Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([lvl, count]) => ({ id: lvl, label: levelLabel(lvl), count }))
  }, [rowsForLevel])

  // Substat frequency bar data uses the fully cross-filtered set; main stat is now a dim dimension.
  const rowsForSubstats = rowsFiltered
  // Co-occurrence pivot: when substats are selected via the radar, further filter to items that
  // contain ALL selected substats (AND intersection) so the radar shows what else co-occurs with them.
  const rowsForSubstatRadar = useMemo(() => {
    if (selectedSubstat.size === 0) return rowsForSubstats
    return rowsForSubstats.filter((row) =>
      [...selectedSubstat].every((v) => row.artifact.substats.some((s) => Number(s.variant) === v)),
    )
  }, [rowsForSubstats, selectedSubstat])
  const substatData: BarEntry[] = useMemo(() => {
    const counts = countSubstatFrequency(rowsForSubstatRadar)
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([variant, count]) => ({ id: variant, label: t(statVariantI18nKey(variant)), count }))
  }, [rowsForSubstatRadar, t])

  // Pre-pivot substat frequency — dim + main-stat filters applied but co-occurrence pivot excluded.
  // Shown as a dimmed reference net behind the active polygon so the user can see the effect of
  // the pivot selection specifically.  Labels omitted (empty string) — radar uses labelFormatter.
  const substatReferenceData: BarEntry[] = useMemo(() => {
    const counts = countSubstatFrequency(rowsForSubstats)
    return Array.from(counts.entries())
      .map(([variant, count]) => ({ id: variant, label: '', count }))
  }, [rowsForSubstats])

  // Heatmap matrix (slot × main stat).
  // When substat pivot selections are active on the radar, narrow the heatmap to only
  // slot × main stat combinations that co-occur with ALL selected substats.
  const rowsForHeatmap = useMemo(() => {
    if (selectedSubstat.size === 0) return rowsFiltered
    return rowsFiltered.filter((row) =>
      [...selectedSubstat].every((v) => row.artifact.substats.some((s) => Number(s.variant) === v)),
    )
  }, [rowsFiltered, selectedSubstat])
  const heatmapMatrix = useMemo(() => buildSlotMainMatrix(rowsForHeatmap), [rowsForHeatmap])

  // KPIs computed from the fully-filtered row set.
  const kpis = useMemo(() => computeGearAnalyticsKpis(rowsFiltered), [rowsFiltered])

  // ── Color and icon helpers for specific donuts ──────────────────────────────
  // Rarity donut: use the app's canonical rarity accent palette.
  const rarityColorById = useCallback(
    (id: number | string): string | undefined => RARITY_ACCENT_COLORS[Number(id)],
    [],
  )

  // Outcome donut: map outcome strings to MUI theme semantic colors.
  const outcomeColorById = useCallback(
    (id: number | string): string | undefined => {
      if (id === 'sell') return theme.palette.error.main
      if (id === 'keep') return theme.palette.success.main
      if (id === 'safe') return theme.palette.warning.main
      return undefined
    },
    [theme],
  )

  // ── Empty state ────────────────────────────────────────────────────────────
  if (rows.length === 0) {
    return (
      <Box
        sx={(theme) => ({
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: STANDARD_DIALOG_PADDING_INLINE_UNITS,
          py: STANDARD_DIALOG_PADDING_BLOCK_UNITS,
          ...reserveScrollbarGutterSpace({
            reserveStart: false,
            basePaddingInlineEnd: theme.spacing(STANDARD_DIALOG_PADDING_INLINE_UNITS),
          }),
        })}
      >
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          {t('gearAnalyticsEmptyState')}
        </Typography>
      </Box>
    )
  }

  // True when at least one cross-filter dimension is active.
  const isFilterActive = dim.slots.size > 0 || dim.ranks.size > 0 || dim.rarities.size > 0
    || dim.sets.size > 0 || dim.outcomes.size > 0 || dim.sources.size > 0 || dim.levels.size > 0

  return (
    // Outer wrapper: flex column so the action bar sits above the scroll area.
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>

      {/* Action bar — outside the scroll container so it stays visible when scrolling. */}
      <Box
        sx={(theme) => ({
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1,
          px: STANDARD_DIALOG_PADDING_INLINE_UNITS,
          py: 0.75,
          borderBottom: `1px solid ${theme.palette.divider}`,
          flexShrink: 0,
        })}
      >
        {/* Copy from Gear Inspector — shown when a gear inspector dim is available; disabled when dim is empty. */}
        {gearInspectorDim != null && (
          <Tooltip title={t('gearAnalyticsCopyFromInspectorTip')} arrow placement="top">
            <span>
              <Button
                size="small"
                variant="outlined"
                onClick={handleCopyFromGearInspector}
                disabled={!isGearAnalyticsDimActive(gearInspectorDim)}
                sx={{ fontSize: '0.75rem', py: 0.5 }}
              >
                {t('gearAnalyticsCopyFromInspector')}
              </Button>
            </span>
          </Tooltip>
        )}
        {/* span wrapper inside Tooltip ensures the tooltip fires even when the Button is disabled */}
        {onApplyToGearInspector && (
          <Tooltip title={t('gearAnalyticsApplyToInspectorTip')} arrow placement="top">
            <span>
              <Button
                size="small"
                variant="outlined"
                onClick={() => onApplyToGearInspector(dim)}
                disabled={!isFilterActive}
                sx={{ fontSize: '0.75rem', py: 0.5 }}
              >
                {t('gearAnalyticsApplyToInspector')}
              </Button>
            </span>
          </Tooltip>
        )}
        <Tooltip title={t(canCopy ? 'gearAnalyticsCopySnapshotTip' : 'gearAnalyticsDownloadSnapshotTip')} arrow placement="top">
          {/* span required: Tooltip needs events, disabled buttons don't fire them */}
          <span>
            <Button
              size="small"
              variant="outlined"
              onClick={handleCopySnapshot}
              disabled={copying}
              startIcon={copying ? <CircularProgress size={12} /> : undefined}
              sx={{ fontSize: '0.75rem', py: 0.5, minWidth: 130 }}
            >
              {copyDone
                ? t(canCopy ? 'gearAnalyticsCopied' : 'gearAnalyticsDownloaded')
                : t(canCopy ? 'gearAnalyticsCopySnapshot' : 'gearAnalyticsDownloadSnapshot')}
            </Button>
          </span>
        </Tooltip>
      </Box>

      {/* Scrollable content area — ref here so Copy Snapshot excludes the action bar. */}
      <Box
        ref={contentRef}
        sx={(theme) => ({
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          px: STANDARD_DIALOG_PADDING_INLINE_UNITS,
          py: STANDARD_DIALOG_PADDING_BLOCK_UNITS,
          ...reserveScrollbarGutterSpace({
            reserveStart: false,
            basePaddingInlineEnd: theme.spacing(STANDARD_DIALOG_PADDING_INLINE_UNITS),
          }),
        })}
      >

      {/* KPI cards: always reflect the fully-filtered dataset. */}
      <GearAnalyticsKpiCards kpis={kpis} />

      {/* Row 1: Six donut charts — each excludes its own dimension from the filter. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, mb: 1 }}>
        <GearAnalyticsDonut
          title={t('gearAnalyticsChartSlot')}
          data={slotData}
          selected={dim.slots}
          onToggle={toggleSlot}
          onDoubleClickItem={selectSlotGroup}
          height={160}
          slotIconById={slotIconSvgAsset}
          onEasterEgg={handleDonutEgg}
          peerDanceTrigger={donutPeer}
          collapsed={collapsed.slot}
          onToggleCollapse={(all) => toggleSection('slot', all)}
        />
        <GearAnalyticsDonut
          title={t('gearAnalyticsChartRank')}
          data={rankData}
          selected={dim.ranks}
          onToggle={toggleRank}
          height={160}
          arcLabel={(id) => rankLabel(Number(id))}
          onEasterEgg={handleDonutEgg}
          peerDanceTrigger={donutPeer}
          collapsed={collapsed.rank}
          onToggleCollapse={(all) => toggleSection('rank', all)}
        />
        <GearAnalyticsDonut
          title={t('gearAnalyticsChartRarity')}
          data={rarityData}
          selected={dim.rarities}
          onToggle={toggleRarity}
          height={160}
          colorBySliceId={rarityColorById}
          onEasterEgg={handleDonutEgg}
          peerDanceTrigger={donutPeer}
          collapsed={collapsed.rarity}
          onToggleCollapse={(all) => toggleSection('rarity', all)}
        />
        <GearAnalyticsDonut
          title={t('gearAnalyticsChartOutcome')}
          data={outcomeData}
          selected={dim.outcomes}
          onToggle={(id) => toggleOutcome(id as GearAnalyticsOutcome)}
          height={160}
          colorBySliceId={outcomeColorById}
          onEasterEgg={handleDonutEgg}
          peerDanceTrigger={donutPeer}
          collapsed={collapsed.outcome}
          onToggleCollapse={(all) => toggleSection('outcome', all)}
        />
        <GearAnalyticsDonut
          title={t('gearAnalyticsChartSource')}
          data={sourceData}
          selected={dim.sources}
          onToggle={toggleSource}
          height={160}
          slotIconById={sourceIconSvgAsset}
          onEasterEgg={handleDonutEgg}
          peerDanceTrigger={donutPeer}
          collapsed={collapsed.source}
          onToggleCollapse={(all) => toggleSection('source', all)}
        />
        <GearAnalyticsDonut
          title={t('gearAnalyticsChartLevel')}
          data={levelData}
          selected={dim.levels}
          onToggle={toggleLevel}
          height={160}
          arcLabel={(id) => levelLabel(Number(id))}
          onEasterEgg={handleDonutEgg}
          peerDanceTrigger={donutPeer}
          collapsed={collapsed.level}
          onToggleCollapse={(all) => toggleSection('level', all)}
        />
      </Box>

      {/* Row 2: Set treemap — tile area ∝ count, bands show outcome breakdown. */}
      <Box sx={{ mb: 1 }}>
        <GearAnalyticsTreemap
          title={t('gearAnalyticsChartSet')}
          data={setData}
          selected={dim.sets}
          onToggle={toggleSet}
          iconById={setIconById}
          showIcons={showSetIcons}
          onEasterEgg={handleTreemapEgg}
          peerDanceTrigger={treemapPeer}
          collapsed={collapsed.treemap}
          onToggleCollapse={(all) => toggleSection('treemap', all)}
          setSelectionEntries={setSelectionEntries}
          onSetSelectionChange={handleSetSelectionChange}
          metasets={metasets}
          selectedMetaSetNames={dimMetaSetNames}
          onMetaSetNamesChange={handleMetaSetNamesChange}
          {...(treemapAllowedSetIds !== undefined && { allowedSetIds: treemapAllowedSetIds })}
        />
      </Box>

      {/* Cross-filter chips — always visible below the donuts; disabled when nothing is selected. */}
      <GearAnalyticsCrossFilterChips dim={dim} onUpdate={updateDim} onClear={clearDim} />

      {/* Row 3: Main stat bar (click-to-filter) + Substat frequency radar. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
        <GearAnalyticsBar
          title={t('gearAnalyticsChartMainStat')}
          description={t('gearAnalyticsChartMainStatDesc')}
          data={mainStatData}
          selected={dim.mainStats}
          onToggle={toggleMainStat}
          {...(statButtonBorders && { colorById: statColorById })}
          onEasterEgg={handleBarEgg}
          peerDanceTrigger={barPeer}
          collapsed={collapsed.mainStat}
          onToggleCollapse={(all) => toggleSection('mainStat', all)}
        />
        <GearAnalyticsRadar
          title={t('gearAnalyticsChartSubstats')}
          description={t('gearAnalyticsChartSubstatsDesc')}
          data={substatData}
          referenceData={substatReferenceData}
          selectedSubstat={selectedSubstat}
          onToggleSubstat={toggleSubstat}
          onClearSubstat={clearSubstat}
          onEasterEgg={handleRadarEgg}
          peerDanceTrigger={radarPeer}
          collapsed={collapsed.substats}
          onToggleCollapse={(all) => toggleSection('substats', all)}
        />
      </Box>

      {/* Row 3: Slot × Main Stat heatmap beside Champion Stats. */}
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
        <GearAnalyticsHeatmap
          matrix={heatmapMatrix}
          dim={dim}
          onToggleSlot={toggleSlot}
          onToggleMainStat={toggleMainStat}
          collapsed={collapsed.heatmap}
          onToggleCollapse={(all) => toggleSection('heatmap', all)}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <GearAnalyticsChampStats
            rows={rows}
            {...(resetKey !== undefined && { resetKey })}
            collapsed={collapsed.champStats}
            onToggleCollapse={(all) => toggleSection('champStats', all)}
          />
        </Box>
      </Box>

      {/* Row 4: Not-fully-equipped champion table — excluded from snapshot captures. */}
      <Box sx={{ mt: 2 }} data-snapshot-hide>
        <GearAnalyticsNotEquipped
          rows={rows}
          {...(resetKey !== undefined && { resetKey })}
          collapsed={collapsed.notEquipped}
          onToggleCollapse={(all) => toggleSection('notEquipped', all)}
          // Optional props — only pass when the parent (LogicHubDialog/App) supplies them,
          // so the component stays usable in tests/contexts where selection isn't wired up.
          {...(selectedGearItemIds !== undefined && { selectedGearItemIds })}
          {...(onGearItemsSelect !== undefined && { onGearItemsSelect })}
        />
      </Box>

      {/* Watermark — hidden normally; revealed with timestamp text during snapshot capture. */}
      <Typography
        ref={watermarkRef}
        variant="caption"
        sx={{ display: 'none', textAlign: 'right', mt: 1.5, opacity: 0.35, fontSize: '0.6rem', userSelect: 'none' }}
      />
      </Box>
    </Box>
  )
}
