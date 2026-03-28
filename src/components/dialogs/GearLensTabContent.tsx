/**
 * GearLensTabContent.tsx
 *
 * Gear Lens analytics tab: cross-filtering inventory dashboard.
 * Cross-filter rule: clicking a segment in any chart adds it to that dimension's
 * filter, and every other chart shows data filtered by the remaining active dimensions.
 * This is the BI-style Crossfilter pattern.
 */
import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import type { GearLensEggPeer } from '../../lib/easterEggAnimUtils'
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
  EMPTY_GEAR_LENS_DIM,
  applyGearLensFilter,
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
  computeGearLensKpis,
  levelLabel,
  sourceIconSvgAsset,
  slotGroupIds,
  artifactTypeI18nKey,
  rarityRankValueI18nKey,
  statVariantI18nKey,
  getLocalizedGearSetName,
  type GearLensDim,
  type GearLensOutcome,
  type GearLensSource,
} from '../../lib/gearLens'
import { STANDARD_DIALOG_PADDING_BLOCK_UNITS, STANDARD_DIALOG_PADDING_INLINE_UNITS, ACCESSORY_NO_SET_ID } from '../../lib/constants'
import type { ArtifactSetId } from '../../lib/types'
import { APP_VERSION } from '../../version'
import { reserveScrollbarGutterSpace } from '../../lib/scrollbar'
import { GearLensCrossFilterChips } from '../gear-lens/GearLensCrossFilterChips'
import { GearLensKpiCards } from '../gear-lens/GearLensKpiCards'
import { GearLensDonut, type DonutSlice } from '../gear-lens/GearLensDonut'
import { GearLensBar, type BarEntry } from '../gear-lens/GearLensBar'
import { GearLensTreemap } from '../gear-lens/GearLensTreemap'
import { GearLensRadar } from '../gear-lens/GearLensRadar'
import { GearLensHeatmap } from '../gear-lens/GearLensHeatmap'
import { GearLensChampStats } from '../gear-lens/GearLensChampStats'
import { useI18n } from '../../lib/i18n'

type Props = {
  /** All loaded gear rows, unfiltered. Stats always reflect the full inventory. */
  rows: readonly GearInspectorPreviewRow[]
  /** Called when the user requests applying the current Gear Lens filter to the Gear Inspector. */
  onApplyToGearInspector?: ((dim: GearLensDim) => void) | undefined
  /**
   * Increment this value from outside to reset all cross-filter dimensions to their empty state.
   * Mirrors the "Reset to defaults" button pattern used in other Logic Hub tabs.
   */
  resetKey?: number
}

/** Ordered outcome IDs and their i18n keys. */
const OUTCOME_I18N_KEY: Record<GearLensOutcome, string> = {
  sell: 'gearLensOutcomeSell',
  keep: 'gearLensOutcomeKeep',
  safe: 'gearLensOutcomeSafe',
  none: 'gearLensOutcomeNone',
}
/** Display order for the outcome donut slices. */
const OUTCOME_ORDER: GearLensOutcome[] = ['sell', 'keep', 'safe', 'none']

/** Source category i18n key map — keeps GearLensTabContent free of string arithmetic. */
const SOURCE_I18N_KEY: Record<GearLensSource, string> = {
  inventory: 'gearLensSourceInventory',
  collection: 'gearLensSourceCollection',
  vault: 'gearLensSourceVault',
  inbox: 'gearLensSourceInbox',
  manual: 'gearLensSourceManual',
}

/** Toggle a value in a ReadonlySet, returning a new Set. */
function toggled<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value); else next.add(value)
  return next
}

export function GearLensTabContent({ rows, onApplyToGearInspector, resetKey }: Props) {
  const { t, lang } = useI18n()
  const theme = useTheme()
  const [substatColors] = useSubstatColors()
  const { showSetIcons, statButtonBorders } = useDisplayPreferences()

  // Ref used by the Copy Snapshot button to capture the tab content.
  const contentRef = useRef<HTMLDivElement | null>(null)
  // Ref to the watermark element — hidden normally, revealed only during snapshot capture.
  const watermarkRef = useRef<HTMLElement | null>(null)
  const [copying, setCopying] = useState(false)
  const [copyDone, setCopyDone] = useState(false)

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
      // Read dimensions after revealing watermark so fullHeight includes it.
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
        const res  = await fetch(dataUrl)
        const blob = await res.blob()
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setCopyDone(true)
        setTimeout(() => setCopyDone(false), 2000)
      } finally {
        el.style.overflow  = prevOverflow
        el.style.height    = prevHeight
        el.style.maxHeight = prevMaxH
        // Hide the watermark again after capture.
        if (wm) wm.style.display = ''
      }
    } catch (err) {
      console.error('[gear-lens] snapshot copy failed', err)
    } finally {
      setCopying(false)
    }
  }, [copying, theme])

  // Color callback used by bar charts to tint stat labels by their configured palette color.
  const statColorById = useCallback(
    (id: number | string): string | undefined => substatColors[Number(id)]?.fg,
    [substatColors],
  )

  // Cross-filter state: all dimensions start empty (= no filter).
  const [dim, setDim] = useState<GearLensDim>(EMPTY_GEAR_LENS_DIM)
  // Main stat selection: clicking a main stat bar filters the substat frequency chart.
  // Kept as local state separate from dim — not a cross-filter dimension.
  const [selectedMainStats, setSelectedMainStats] = useState<ReadonlySet<number | string>>(new Set())
  // Substat co-occurrence pivot: one or more substat variants selected by clicking radar marks.
  // The radar then shows only items containing ALL selected substats (AND intersection).
  const [selectedSubstat, setSelectedSubstat] = useState<ReadonlySet<number>>(new Set())

  // ── Cross-component Easter egg peer broadcasts ────────────────────────────────────────────────
  // When any component's Easter egg fires it calls its onEasterEgg callback, which may
  // (randomly) set peer triggers on a random subset of sibling components.
  const eggSeqRef = useRef(0)
  const [donutPeer,   setDonutPeer]   = useState<GearLensEggPeer | null>(null)
  const [radarPeer,   setRadarPeer]   = useState<GearLensEggPeer | null>(null)
  const [treemapPeer, setTreemapPeer] = useState<GearLensEggPeer | null>(null)
  const [barPeer,     setBarPeer]     = useState<GearLensEggPeer | null>(null)

  // Helper: fire a peer trigger with a fresh seq only when a random roll passes the threshold.
  const maybeSet = useCallback(
    (setter: React.Dispatch<React.SetStateAction<GearLensEggPeer | null>>, flavor: GearLensEggPeer['flavor'], threshold: number) => {
      if (Math.random() < threshold) setter({ seq: ++eggSeqRef.current, flavor })
    },
    [],
  )
  // Helper: unconditionally fire a peer trigger (used for the jackpot all-react path).
  const forceSet = useCallback(
    (setter: React.Dispatch<React.SetStateAction<GearLensEggPeer | null>>, flavor: GearLensEggPeer['flavor']) => {
      setter({ seq: ++eggSeqRef.current, flavor })
    },
    [],
  )

  // A donut fires.
  // Jackpot (0.5 %): all siblings react at once — the whole dashboard goes haywire.
  // Normal path: each sibling rolls independently.
  const handleDonutEgg = useCallback(() => {
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
  }, [maybeSet, forceSet])

  // The treemap fires.
  const handleTreemapEgg = useCallback(() => {
    if (Math.random() < 0.005) {
      forceSet(setDonutPeer,   'rage')
      forceSet(setRadarPeer,   'cascade')
      forceSet(setBarPeer,     'cascade')
      return
    }
    maybeSet(setDonutPeer, 'rage',    0.20)
    maybeSet(setRadarPeer, 'cascade', 0.15)
    maybeSet(setBarPeer,   'cascade', 0.12)
  }, [maybeSet, forceSet])

  // The radar fires.
  const handleRadarEgg = useCallback(() => {
    if (Math.random() < 0.005) {
      forceSet(setTreemapPeer, 'cascade')
      forceSet(setDonutPeer,   'cascade')
      forceSet(setBarPeer,     'cascade')
      return
    }
    maybeSet(setTreemapPeer, 'cascade', 0.15)
    maybeSet(setDonutPeer,   'cascade', 0.15)
    maybeSet(setBarPeer,     'cascade', 0.12)
  }, [maybeSet, forceSet])

  // The stat bars fire.
  const handleBarEgg = useCallback(() => {
    if (Math.random() < 0.005) {
      forceSet(setDonutPeer,   'cascade')
      forceSet(setTreemapPeer, 'cascade')
      forceSet(setRadarPeer,   'cascade')
      return
    }
    maybeSet(setDonutPeer,   'cascade', 0.15)
    maybeSet(setTreemapPeer, 'cascade', 0.12)
    maybeSet(setRadarPeer,   'cascade', 0.12)
  }, [maybeSet, forceSet])

  // Partial-update helper: merge a patch into the current dim.
  const updateDim = useCallback((patch: Partial<GearLensDim>) => {
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
  const toggleSet = useCallback((id: number | string) => {
    // Allow -1 (others bucket) through — effectiveDim expands it at filter time.
    setDim((prev) => ({ ...prev, sets: toggled(prev.sets, Number(id)) }))
  }, [])
  const toggleOutcome = useCallback((outcome: GearLensOutcome) => {
    setDim((prev) => ({ ...prev, outcomes: toggled(prev.outcomes, outcome) }))
  }, [])
  const toggleSource = useCallback((id: number | string) => {
    setDim((prev) => ({ ...prev, sources: toggled(prev.sources, id as GearLensSource) }))
  }, [])
  const toggleLevel = useCallback((id: number | string) => {
    setDim((prev) => ({ ...prev, levels: toggled(prev.levels, Number(id)) }))
  }, [])
  // Toggle a main stat selection for the substat frequency drill-down.
  const toggleMainStat = useCallback((id: number | string) => {
    setSelectedMainStats((prev) => toggled(prev, id))
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
    setDim(EMPTY_GEAR_LENS_DIM)
    setSelectedMainStats(new Set())
    setSelectedSubstat(new Set())
  }, [])
  // Clear all cross-filter dimensions when the parent increments resetKey (e.g. "Reset to defaults" button).
  useEffect(() => {
    if (resetKey !== undefined) {
      setDim(EMPTY_GEAR_LENS_DIM)
      setSelectedMainStats(new Set())
      setSelectedSubstat(new Set())
    }
  }, [resetKey])

  // ── Crossfilter-filtered row sets ──────────────────────────────────────────
  // Each chart receives the full row set filtered by all dimensions EXCEPT its own.
  // This preserves the full range of that dimension for interactive exploration.
  // The icon tile grid exposes real set IDs directly, so no synthetic -1 expansion is needed.
  const rowsForSlot    = useMemo(() => applyGearLensFilter(rows, dim, 'slots'),    [rows, dim])
  const rowsForRank    = useMemo(() => applyGearLensFilter(rows, dim, 'ranks'),    [rows, dim])
  const rowsForRarity  = useMemo(() => applyGearLensFilter(rows, dim, 'rarities'), [rows, dim])
  const rowsForSet     = useMemo(() => applyGearLensFilter(rows, dim, 'sets'),     [rows, dim])
  const rowsForOutcome = useMemo(() => applyGearLensFilter(rows, dim, 'outcomes'), [rows, dim])
  const rowsForSource  = useMemo(() => applyGearLensFilter(rows, dim, 'sources'),  [rows, dim])
  const rowsForLevel   = useMemo(() => applyGearLensFilter(rows, dim, 'levels'),   [rows, dim])
  // KPIs and bar charts use all active filters applied.
  const rowsFiltered   = useMemo(() => applyGearLensFilter(rows, dim),             [rows, dim])

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


  // Main stat bar data — sorted descending by count so the tallest bar is always first.
  // Labels go through t() so they respect the active language.
  const mainStatData: BarEntry[] = useMemo(() => {
    const counts = countMainStatFrequency(rowsFiltered)
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([variant, count]) => ({ id: variant, label: t(statVariantI18nKey(variant)), count }))
  }, [rowsFiltered, t])

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

  // Substat frequency bar data — filtered by selectedMainStats when any are active,
  // otherwise uses the fully cross-filtered set.
  const rowsForSubstats = useMemo(() => {
    if (selectedMainStats.size === 0) return rowsFiltered
    // Keep only rows whose main stat variant is in the selection.
    return rowsFiltered.filter((row) => {
      const variant = Number(row.artifact.mainStat?.variant)
      return selectedMainStats.has(variant)
    })
  }, [rowsFiltered, selectedMainStats])
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
  const heatmapMatrix = useMemo(() => buildSlotMainMatrix(rowsFiltered), [rowsFiltered])

  // KPIs computed from the fully-filtered row set.
  const kpis = useMemo(() => computeGearLensKpis(rowsFiltered), [rowsFiltered])

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
        <Typography variant="body2" color="text.secondary" textAlign="center">
          {t('gearLensEmptyState')}
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
        {/* span wrapper inside Tooltip ensures the tooltip fires even when the Button is disabled */}
        {onApplyToGearInspector && (
          <Tooltip title={t('gearLensApplyToInspectorTip')} arrow placement="top">
            <span>
              <Button
                size="small"
                variant="outlined"
                onClick={() => onApplyToGearInspector(dim)}
                disabled={!isFilterActive}
                sx={{ fontSize: '0.75rem', py: 0.5 }}
              >
                {t('gearLensApplyToInspector')}
              </Button>
            </span>
          </Tooltip>
        )}
        <Tooltip title={t('gearLensCopySnapshotTip')} arrow placement="top">
          <Button
            size="small"
            variant="outlined"
            onClick={handleCopySnapshot}
            disabled={copying}
            startIcon={copying ? <CircularProgress size={12} /> : undefined}
            sx={{ fontSize: '0.75rem', py: 0.5, minWidth: 130 }}
          >
            {copyDone ? t('gearLensCopied') : t('gearLensCopySnapshot')}
          </Button>
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
      <GearLensKpiCards kpis={kpis} />

      {/* Row 1: Six donut charts — each excludes its own dimension from the filter. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, mb: 1 }}>
        <GearLensDonut
          title={t('gearLensChartSlot')}
          data={slotData}
          selected={dim.slots}
          onToggle={toggleSlot}
          onDoubleClickItem={selectSlotGroup}
          height={160}
          slotIconById={slotIconSvgAsset}
          onEasterEgg={handleDonutEgg}
          peerDanceTrigger={donutPeer}
        />
        <GearLensDonut
          title={t('gearLensChartRank')}
          data={rankData}
          selected={dim.ranks}
          onToggle={toggleRank}
          height={160}
          arcLabel={(id) => rankLabel(Number(id))}
          onEasterEgg={handleDonutEgg}
          peerDanceTrigger={donutPeer}
        />
        <GearLensDonut
          title={t('gearLensChartRarity')}
          data={rarityData}
          selected={dim.rarities}
          onToggle={toggleRarity}
          height={160}
          colorBySliceId={rarityColorById}
          onEasterEgg={handleDonutEgg}
          peerDanceTrigger={donutPeer}
        />
        <GearLensDonut
          title={t('gearLensChartOutcome')}
          data={outcomeData}
          selected={dim.outcomes}
          onToggle={(id) => toggleOutcome(id as GearLensOutcome)}
          height={160}
          colorBySliceId={outcomeColorById}
          onEasterEgg={handleDonutEgg}
          peerDanceTrigger={donutPeer}
        />
        <GearLensDonut
          title={t('gearLensChartSource')}
          data={sourceData}
          selected={dim.sources}
          onToggle={toggleSource}
          height={160}
          slotIconById={sourceIconSvgAsset}
          onEasterEgg={handleDonutEgg}
          peerDanceTrigger={donutPeer}
        />
        <GearLensDonut
          title={t('gearLensChartLevel')}
          data={levelData}
          selected={dim.levels}
          onToggle={toggleLevel}
          height={160}
          arcLabel={(id) => levelLabel(Number(id))}
          onEasterEgg={handleDonutEgg}
          peerDanceTrigger={donutPeer}
        />
      </Box>

      {/* Row 2: Set treemap — tile area ∝ count, bands show outcome breakdown. */}
      <Box sx={{ mb: 1 }}>
        <GearLensTreemap
          title={t('gearLensChartSet')}
          data={setData}
          selected={dim.sets}
          onToggle={toggleSet}
          iconById={setIconById}
          showIcons={showSetIcons}
          onEasterEgg={handleTreemapEgg}
          peerDanceTrigger={treemapPeer}
        />
      </Box>

      {/* Cross-filter chips — always visible below the donuts; disabled when nothing is selected. */}
      <GearLensCrossFilterChips dim={dim} onUpdate={updateDim} selectedMainStats={selectedMainStats} onDeleteMainStat={toggleMainStat} onClear={clearDim} />

      {/* Row 3: Main stat bar (click-to-filter) + Substat frequency radar. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
        <GearLensBar
          title={t('gearLensChartMainStat')}
          description={t('gearLensChartMainStatDesc')}
          data={mainStatData}
          selected={selectedMainStats}
          onToggle={toggleMainStat}
          {...(statButtonBorders && { colorById: statColorById })}
          onEasterEgg={handleBarEgg}
          peerDanceTrigger={barPeer}
        />
        <GearLensRadar
          title={t('gearLensChartSubstats')}
          description={t('gearLensChartSubstatsDesc')}
          data={substatData}
          referenceData={substatReferenceData}
          selectedSubstat={selectedSubstat}
          onToggleSubstat={toggleSubstat}
          onClearSubstat={clearSubstat}
          onEasterEgg={handleRadarEgg}
          peerDanceTrigger={radarPeer}
        />
      </Box>

      {/* Row 3: Slot × Main Stat heatmap beside Champion Stats. */}
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
        <GearLensHeatmap
          matrix={heatmapMatrix}
          dim={dim}
          onToggleSlot={toggleSlot}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <GearLensChampStats rows={rows} {...(resetKey !== undefined && { resetKey })} />
        </Box>
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
