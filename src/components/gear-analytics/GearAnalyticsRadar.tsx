/**
 * GearAnalyticsRadar.tsx
 *
 * Radar (spider) chart showing substat frequency distribution in the Gear Analytics.
 * Each axis corresponds to one stat variant; the polygon area shows how often that
 * substat appears across the currently filtered gear set.
 * The canonical HEATMAP_VARIANTS order is used so axes are always consistent.
 *
 * Reference net: when `referenceData` is provided (full unfiltered substat counts) and any
 * filter is active (filtered ≠ reference), a second dimmed polygon is drawn behind the
 * active one so the user can see the full-collection baseline.  The radar scale is locked
 * to sqrt(refMax) regardless of the active filter, so the active polygon visibly contracts
 * when a filter narrows the data.
 *
 * Easter egg: clicking the same radar mark 10 times within 10 seconds triggers a random
 * dance animation on the polygon.  10 distinct variants are available.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Chip, Collapse, Typography, useTheme } from '@mui/material'
import { RadarChart } from '@mui/x-charts/RadarChart'
import { HEATMAP_VARIANTS, statVariantI18nKey } from '../../lib/gearAnalytics'
import { useSubstatFgAdapter } from '../../lib/themeContrastHooks'
import { CHART_EMPTY_PLACEHOLDER_OPACITY } from '../../lib/themeCustomTokens'
import { useDisplayPreferences } from '../../state/preferencesState'
import { useSubstatColors } from '../../hooks/useSubstatColors'
import { useI18n } from '../../lib/i18n'
import { useEasterEggTrigger } from '../../hooks/useEasterEggTrigger'
import type { GearAnalyticsEggPeer } from '../../lib/easterEggAnimUtils'
import type { BarEntry } from './GearAnalyticsBar'
import { GearAnalyticsChartHeader } from './GearAnalyticsChartHeader'
import { TINT } from '../../lib/colorTints'

type Props = {
  title: string
  /** Optional tooltip shown on the section title. */
  description?: string
  /**
   * Substat frequency entries — id is a StatVariant number, count is occurrence count.
   * Same shape as BarEntry so the parent can pass the same data to both chart types.
   */
  data: BarEntry[]
  /**
   * Full unfiltered substat frequency for the entire loaded collection.
   * When provided and different from `data` (i.e. a filter is active), a dimmed reference
   * polygon is drawn behind the active one.  The radar scale is locked to the reference max
   * so the active polygon visibly shrinks when filtered below the baseline.
   */
  referenceData?: BarEntry[]
  /**
   * When non-empty, the radar shows co-occurrence counts for items containing all selected substat variants.
   * Selected variant axes will be at full scale; other axes show relative co-occurrence.
   */
  selectedSubstat?: ReadonlySet<number>
  /** Called when the user clicks a mark on the radar to select/deselect a pivot substat. */
  onToggleSubstat?: (variant: number) => void
  /** Called when the user clicks the Clear button to deselect all pivot substats. */
  onClearSubstat?: () => void
  /**
   * Called once when this radar's Easter egg fires so sibling components can react.
   * The parent wires this to a cross-component broadcast.
   */
  onEasterEgg?: () => void
  /**
   * When the parent sets a new peer trigger (incremented seq), the radar starts a
   * sympathetic dance (a random variant from its own palette, or 'wave'/'nervous').
   * Ignored when a self-triggered dance is already running.
   */
  peerDanceTrigger?: GearAnalyticsEggPeer | null
  /** When true, the chart body is hidden and only the title row remains visible. */
  collapsed?: boolean
  /** Called when the user clicks the collapse chevron; applyToAll = Ctrl/Cmd+click or right-click. */
  onToggleCollapse?: (applyToAll: boolean) => void
}

/** Ease-in-out cubic: maps a linear 0→1 progress to a smooth 0→1 curve. */
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

const ANIM_DURATION_MS = 300

// ── Easter egg ──────────────────────────────────────────────────────────────
// 10 distinct polygon dance variants, picked at random when the easter egg fires.
type RadarDance = 'wave' | 'heartbeat' | 'chaos' | 'spiral' | 'nervous' | 'rainbow' | 'gravity' | 'star' | 'breathe' | 'flip'
const RADAR_DANCES: readonly RadarDance[] = ['wave', 'heartbeat', 'chaos', 'spiral', 'nervous', 'rainbow', 'gravity', 'star', 'breathe', 'flip']
/** Duration of each dance burst in milliseconds. */
const RADAR_DANCE_MS = 3_000

/** Apply the chosen dance transformation to a snapshot of base arm counts.
 *  Returns new raw counts (pre-sqrt) for setDisplayCounts. */
function applyRadarDance(
  variant: RadarDance,
  base: readonly number[],
  elapsedMs: number,
): number[] {
  const t = elapsedMs / 1_000
  const n = base.length
  const progress = Math.min(elapsedMs / RADAR_DANCE_MS, 1)
  const decay = 1 - progress

  if (variant === 'wave') {
    // Each arm ripples up/down with its own phase offset — polygon shimmies.
    return base.map((v, i) =>
      Math.max(v * (1 + 0.55 * Math.sin(t * 3 * Math.PI + (i / n) * Math.PI * 2)), 0))
  }

  if (variant === 'heartbeat') {
    // All arms pulse out and back × ~4; amplitude decays to zero so it ends at base.
    const scale = 1 + 0.7 * Math.pow(Math.sin(t * 4 * Math.PI), 2) * decay
    return base.map((v) => v * scale)
  }

  if (variant === 'chaos') {
    // Each arm vibrates at a unique irrational frequency; gradually settles back to base.
    return base.map((v, i) =>
      Math.max(v * (0.45 + 0.9 * Math.abs(Math.sin(t * (2.5 + i * 0.37) * Math.PI))) * (1 - decay * 0.3), 0))
  }

  if (variant === 'spiral') {
    // Values appear to rotate around the radar via fractional index-shift interpolation.
    // frac = how far into the next index step; step = which base index to start from.
    const rotPos = t * 1.5  // completes 1.5 full rotations over RADAR_DANCE_MS
    const frac = rotPos % 1
    const step = Math.floor(rotPos) % n
    return base.map((_, i) => {
      const src  = (i + step) % n
      const next = (src + 1) % n
      return (base[src] ?? 0) * (1 - frac) + (base[next] ?? 0) * frac
    })
  }

  if (variant === 'nervous') {
    // High-frequency, low-amplitude trembling — the polygon quivers like it's scared.
    // Adapted from the glitchScrub variant in the sort-popout easter egg.
    return base.map((v, i) =>
      Math.max(v * (1 + 0.18 * Math.sin(t * 28 + i * 3.7)) * (0.7 + decay * 0.3), 0))
  }

  if (variant === 'rainbow') {
    // Polygon data unchanged; only a hue-rotate CSS filter is applied to chartRef.
    // Filter mutation happens outside this function (in the dance rAF effect).
    return base.map((v) => v)
  }

  if (variant === 'gravity') {
    // Arms sag toward zero then spring back — adapted from the accordionFold variant.
    // sin(progress * π) is 0 at start, peaks at 0.5, and returns to 0 at end.
    const sag = Math.sin(progress * Math.PI)
    return base.map((v) => Math.max(v * (1 - sag * 0.85), 0))
  }

  if (variant === 'star') {
    // Alternating arms go high/low, creating a star ↔ anti-star oscillation.
    const f = 0.5 + 0.5 * Math.sin(t * 4 * Math.PI)
    return base.map((v, i) =>
      Math.max(i % 2 === 0 ? v * (1 + f * 1.5) : v * (1 - f * 0.7), 0))
  }

  if (variant === 'breathe') {
    // Single slow, deep expansion — sinπ(t/DANCE_s) is a half-pulse (out then back).
    const scale = 1 + 0.4 * Math.sin((t / (RADAR_DANCE_MS / 1_000)) * Math.PI)
    return base.map((v) => v * scale)
  }

  // 'flip': values repeatedly invert (high ↔ low); oscillation fades as decay → 0.
  const maxBase = Math.max(...base, 1)
  const lerpW = (0.5 + 0.5 * Math.sin(t * 3 * Math.PI)) * decay
  return base.map((v) => Math.max(v * (1 - lerpW) + (maxBase - v) * lerpW, 0))
}

export function GearAnalyticsRadar({ title, description, data, referenceData, selectedSubstat, onToggleSubstat, onClearSubstat, onEasterEgg, peerDanceTrigger, collapsed, onToggleCollapse }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const { statButtonBorders } = useDisplayPreferences()
  const [substatColors] = useSubstatColors()
  // Contrast-correct stat axis-label colors for the active scheme's surface.
  const adaptStatFg = useSubstatFgAdapter()

  // Translated label text → configured fg color; rebuilt when substat palette or language changes.
  // Keys match the text rendered by labelFormatter so the MutationObserver can color SVG text nodes.
  const labelColorMap = useMemo(
    () => new Map(HEATMAP_VARIANTS.map((v) => [t(statVariantI18nKey(v)), adaptStatFg(substatColors[v]?.fg)])),
    [substatColors, t, adaptStatFg],
  )

  const chartRef = useRef<HTMLDivElement>(null)

  // MUI X re-renders the SVG asynchronously (animations etc.) so a one-shot useEffect
  // gets overwritten. A MutationObserver on childList fires every time MUI X touches the SVG
  // tree and re-applies colors then. Observing only childList (not attributes) prevents a loop
  // because our own style.fill writes don't trigger it.
  useEffect(() => {
    const el = chartRef.current
    if (!el) return

    const applyColors = () => {
      // RadarMetricLabels renders plain <text> nodes via ChartsText — no class.
      // Match by text content against the known stat labels instead.
      el.querySelectorAll<SVGElement>('text').forEach((node) => {
        const label = node.textContent?.trim() ?? ''
        if (!labelColorMap.has(label)) return
        node.style.fill = (statButtonBorders ? labelColorMap.get(label) : undefined) ?? ''
      })
    }

    applyColors()
    const obs = new MutationObserver(applyColors)
    obs.observe(el, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [statButtonBorders, labelColorMap])

  // Build a stable variant → count lookup; only recomputes when the data prop reference changes.
  const countByVariant = useMemo(
    () => new Map(data.map((e) => [Number(e.id), e.count])),
    [data],
  )

  // Stable target counts array — same reference between renders when data hasn't changed,
  // so the animation effect below only fires on genuine data changes (not on every setState).
  const targetCounts = useMemo(
    () => HEATMAP_VARIANTS.map((v) => countByVariant.get(v) ?? 0),
    [countByVariant],
  )

  // ── Reference net ──────────────────────────────────────────────────────────────────────────────
  // Full unfiltered counts, sqrt-transformed for display on the same scale as the active polygon.
  // No animation needed: reference data is stable (only changes when gear is loaded).
  const refCountByVariant = useMemo(
    () => referenceData ? new Map(referenceData.map((e) => [Number(e.id), e.count])) : null,
    [referenceData],
  )
  const refTargetCounts = useMemo(
    () => refCountByVariant ? HEATMAP_VARIANTS.map((v) => refCountByVariant.get(v) ?? 0) : null,
    [refCountByVariant],
  )
  // Precomputed sqrt display values for the reference polygon — stable, no rAF loop required.
  const refDisplayCounts = useMemo(
    () => refTargetCounts?.map((v) => Math.sqrt(Math.max(v, 0))) ?? null,
    [refTargetCounts],
  )
  // Only show the reference polygon when a filter is actually active (filtered ≠ reference).
  // When no filter, both polygons would be identical so the dimmed layer adds no information.
  const referenceActive = useMemo(
    () => refTargetCounts !== null && refTargetCounts.some((v, i) => v !== (targetCounts[i] ?? 0)),
    [refTargetCounts, targetCounts],
  )
  // When reference is provided, its max is used as the stable radar scale so the active polygon
  // visibly contracts when filtered.  Without reference, the scale tracks the filtered max (current behavior).
  const effectiveTargetMax = useMemo(
    () => refTargetCounts ? Math.max(...refTargetCounts, 1) : Math.max(...targetCounts, 1),
    [targetCounts, refTargetCounts],
  )

  // Metrics use the numeric variant id as the unique axis key (prevents duplicate-key crash when
  // translations are empty). labelFormatter supplies the visible text — empty string is valid and
  // simply renders a blank label, which is the desired behavior for the dev empty catalog.
  // max is supplied per-metric and kept in sync with displayMax (see below) so the scale never
  // jumps out of phase with the animated data values.
  const metrics = useMemo(
    () => HEATMAP_VARIANTS.map((v) => ({ name: String(v) })),
    [],
  )

  // Animated display values. Both counts and the radar's max scale are interpolated together
  // inside step() and batched into a single React render per frame (React 18 auto-batching).
  // This keeps the scale and the polygon permanently in sync — if either updated independently
  // the chart would show old data on a new scale (or vice versa), causing visible jumps.
  //
  // animMaxRef tracks the current animated max so interrupted animations start from the right
  // scale rather than recomputing from the current targetCounts (which may have changed).
  // Animated display values in sqrt-transformed space.
  // Raw counts are interpolated linearly; sqrt is applied before passing to RadarChart so
  // low co-occurrence values spread visibly across the polygon rather than clustering near
  // the center. The invariant sqrt(count) / sqrt(max) = sqrt(count/max) ensures:
  //   - pivot arm (count === max) always lands exactly at the radar edge (100%)
  //   - a 10% co-occurrence shows at sqrt(0.10) ≈ 32% instead of 10%
  // animPosRef and animMaxRef track raw values so interrupted animations start correctly.
  const animPosRef = useRef<number[]>(targetCounts)
  const animMaxRef = useRef<number>(Math.max(...targetCounts, 1))
  const [displayCounts, setDisplayCounts] = useState<number[]>(() => targetCounts.map(v => Math.sqrt(Math.max(v, 0))))
  const [displayMax, setDisplayMax] = useState<number>(() => Math.sqrt(Math.max(...targetCounts, 1)))
  const rafRef = useRef<number | null>(null)

  // ── Easter egg state ────────────────────────────────────────────────────────────────────────────
  const [danceVariant, setDanceVariant] = useState<RadarDance | null>(null)
  // recordClick returns true (and resets) when the same mark is clicked 10× within 10 s.
  const recordClick = useEasterEggTrigger()
  // Stable ref so the peer effect can read the current dance state without it as a dep.
  // Writing to a ref during render is the canonical React pattern for "sync latest state into
  // a ref for use inside effects without making it a dep"; the lint rule does not apply here.
  const danceVariantRef = useRef(danceVariant)
  // eslint-disable-next-line react-hooks/refs
  danceVariantRef.current = danceVariant

  // Peer reaction: sympathetic dance triggered by a sibling component's Easter egg.
  // Picks a variant biased toward 'wave' and 'nervous' (feel reactive/contagious).
  // Ignored when a self-triggered dance is already running to avoid interrupting it.
  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
    if (!peerDanceTrigger || danceVariantRef.current) return
    // Peer-triggered dances favour 'wave', 'nervous', 'heartbeat' — they look "sympathetic".
    const PEER_VARIANTS: RadarDance[] = ['wave', 'nervous', 'heartbeat', 'wave', 'nervous']
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change, @eslint-react/set-state-in-effect
    setDanceVariant(PEER_VARIANTS[Math.floor(Math.random() * PEER_VARIANTS.length)] ?? 'wave')
  }, [peerDanceTrigger])

  // Normal interpolation animation — pauses while dance is active so both effects never
  // compete over setDisplayCounts / setDisplayMax.
  useEffect(() => {
    // Dance effect takes exclusive ownership while a variant is selected.
    if (danceVariant) return

    const from = animPosRef.current.slice()
    const fromMax = animMaxRef.current
    const to = targetCounts
    // Use effectiveTargetMax as the target scale: when reference is present this is the reference
    // max (stable), so the radar scale stays fixed as the active polygon animates.
    const toMax = effectiveTargetMax

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    let startTime: number | null = null

    function step(now: number) {
      if (startTime === null) startTime = now
      const progress = Math.min((now - startTime) / ANIM_DURATION_MS, 1)
      const eased = easeInOut(progress)
      // Interpolate in raw count space; transform to sqrt space for display.
      const nextRaw = from.map((f, i) => f + ((to[i] ?? 0) - f) * eased)
      const nextMax = fromMax + (toMax - fromMax) * eased
      animPosRef.current = nextRaw
      animMaxRef.current = nextMax
      // Both state updates are batched by React 18 into one re-render per frame.
      setDisplayCounts(nextRaw.map(v => Math.sqrt(Math.max(v, 0))))
      setDisplayMax(Math.sqrt(Math.max(nextMax, 1)))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [targetCounts, effectiveTargetMax, danceVariant])

  // ── Dance rAF effect ────────────────────────────────────────────────────────────────────────────
  // Runs for RADAR_DANCE_MS, then calls setDanceVariant(null) so the normal animation resumes
  // and smoothly recovers to the true targetCounts from wherever the dance left off.
  useEffect(() => {
    if (!danceVariant) return

    // Capture a stable (non-null) ref for use inside the rAF closure.
    const variant = danceVariant
    // Freeze the current polygon position as the dance baseline.
    const base = animPosRef.current.slice()
    const startTime = performance.now()
    let rafId: number

    function step(now: number) {
      const elapsed = now - startTime
      if (elapsed >= RADAR_DANCE_MS) {
        // Dance complete — let the normal animation effect resume from the current position.
        setDanceVariant(null)
        return
      }

      const counts = applyRadarDance(variant, base, elapsed)
      // Keep refs in sync so the normal animation starts from the right position after dance ends.
      animPosRef.current = counts
      animMaxRef.current = Math.max(...counts, ...base, 1)

      // Rainbow variant: mutate a CSS hue-rotate on the chart container instead of polygon data.
      if (variant === 'rainbow') {
        const t = elapsed / 1_000
        if (chartRef.current) chartRef.current.style.filter = `hue-rotate(${Math.round((t * 120) % 360)}deg)`
      }

      setDisplayCounts(counts.map(v => Math.sqrt(Math.max(v, 0))))
      setDisplayMax(Math.sqrt(Math.max(animMaxRef.current, 1)))
      rafId = requestAnimationFrame(step)
    }

    rafId = requestAnimationFrame(step)
    // Capture stable DOM ref for use in the cleanup function (ref may have changed by then).
    const chartEl = chartRef.current
    return () => {
      cancelAnimationFrame(rafId)
      // Always clear the hue-rotate filter — may have been set by the rainbow variant.
      if (chartEl) chartEl.style.filter = ''
    }
  }, [danceVariant])

  if (data.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260, opacity: CHART_EMPTY_PLACEHOLDER_OPACITY }}>
        <Typography variant="caption" color="text.secondary">{title}: —</Typography>
      </Box>
    )
  }

  return (
    <Box ref={chartRef}>
      {/* Title row — chevron toggles collapse; tooltip on the label when a description is provided. */}
      <GearAnalyticsChartHeader title={title} description={description} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      <Collapse in={!collapsed} timeout="auto">

      {/*
       * RadarChart from MUI X v9.
       * series.data uses displayCounts (JS-interpolated) so the polygon morphs smoothly on every
       * data change, regardless of whether MUI X reuses or recreates the underlying SVG elements.
       * fillArea: true fills the polygon for better readability at a glance.
       * hideLegend: removes the single-series legend which adds no value here.
       *
       * Reference net: when a filter is active, the unfiltered reference polygon is added as the
       * first series (behind the active one) with a very dim color and no fill.  The scale is
       * locked to the reference max so both polygons share the same coordinate space.
       */}
      <RadarChart
        series={[
          // Reference net — dimmed background polygon showing the full unfiltered distribution.
          // Rendered first so the active polygon appears on top.  Only visible when filter is active.
          ...(referenceActive && refDisplayCounts ? [{
            data: refDisplayCounts,
            label: '',
            color: TINT.primaryTintFaint,
            fillArea: false,
            valueFormatter: (v: number) => String(Math.round((v ?? 0) ** 2)),
          }] : []),
          // Active filtered polygon.
          {
            data: displayCounts,
            label: title,
            color: (theme.vars?.palette.primary.main ?? theme.palette.primary.main),
            fillArea: true,
            // displayCounts are sqrt-transformed; square back to recover the raw frequency count.
            valueFormatter: (v) => String(Math.round((v ?? 0) ** 2)),
          },
        ]}
        radar={{
          metrics,
          max: displayMax,
          // Translate the numeric name key back to the stat label; returns '' for empty catalog.
          labelFormatter: (name) => t(statVariantI18nKey(Number(name))),
        }}
        height={260}
        hideLegend
        highlight="none"
        skipAnimation
        onMarkClick={onToggleSubstat ? (_e, item) => {
          // Both the active and reference series marks are clickable — either toggles the pivot.
          const v = HEATMAP_VARIANTS[item.dataIndex ?? -1]
          if (v === undefined) return
          // Easter egg: 10 rapid clicks on the same mark triggers a dance.  Only start a new
          // dance if none is running (recordClick resets the counter after firing).
          // Return immediately so the 10th click doesn't also toggle the substat filter.
          if (recordClick(v) && danceVariant === null) {
            const idx = Math.floor(Math.random() * RADAR_DANCES.length)
            setDanceVariant(RADAR_DANCES[idx] ?? 'wave')
            // Notify parent so sibling components can react.
            onEasterEgg?.()
            return
          }
          onToggleSubstat(v)
        } : undefined}
      />

      {/*
       * Co-occurrence pivot row — always rendered at fixed minHeight to avoid layout shift.
       * Placed below the chart so it doesn't push the radar up when chips appear.
       * Mirrors GearAnalyticsCrossFilterChips: a disabled Clear button + one primary-outlined chip per pivot.
       * Clicking a chip's × deselects that substat; Clear deselects all at once.
       */}
      {/* When no substats are selected the whole row is tagged data-snapshot-hide so the
          reserved minHeight doesn't appear as blank space in snapshot captures. */}
      <Box
        {...((!selectedSubstat || selectedSubstat.size === 0) && { 'data-snapshot-hide': '' })}
        sx={{ minHeight: 24, mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}
      >
        <Button
          size="small"
          onClick={onClearSubstat}
          disabled={!selectedSubstat || selectedSubstat.size === 0}
          data-snapshot-hide
          sx={{ py: 0, minWidth: 'auto', fontSize: '0.75rem' }}
        >
          {t('gearAnalyticsClearFilters')}
        </Button>
        {selectedSubstat && [...selectedSubstat].map((v) => (
          <Chip
            key={v}
            size="small"
            label={t(statVariantI18nKey(v))}
            onDelete={() => onToggleSubstat?.(v)}
            color="primary"
            variant="outlined"
            sx={{ fontSize: '0.68rem', height: 20 }}
          />
        ))}
      </Box>
      </Collapse>
    </Box>
  )
}
