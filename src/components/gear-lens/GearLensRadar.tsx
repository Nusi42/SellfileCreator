/**
 * GearLensRadar.tsx
 *
 * Radar (spider) chart showing substat frequency distribution in the Gear Lens.
 * Each axis corresponds to one stat variant; the polygon area shows how often that
 * substat appears across the currently filtered gear set.
 * The canonical HEATMAP_VARIANTS order is used so axes are always consistent.
 *
 * Reference net: when `referenceData` is provided (full unfiltered substat counts) and any
 * filter is active (filtered ≠ reference), a second dimmed polygon is drawn behind the
 * active one so the user can see the full-collection baseline.  The radar scale is locked
 * to sqrt(refMax) regardless of the active filter, so the active polygon visibly contracts
 * when a filter narrows the data.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Chip, Tooltip, Typography, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { RadarChart } from '@mui/x-charts/RadarChart'
import { HEATMAP_VARIANTS, statVariantI18nKey } from '../../lib/gearLens'
import { useDisplayPreferences } from '../../state/preferencesState'
import { useSubstatColors } from '../../hooks/useSubstatColors'
import { useI18n } from '../../lib/i18n'
import type { BarEntry } from './GearLensBar'

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
}

/** Ease-in-out cubic: maps a linear 0→1 progress to a smooth 0→1 curve. */
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

const ANIM_DURATION_MS = 300

export function GearLensRadar({ title, description, data, referenceData, selectedSubstat, onToggleSubstat, onClearSubstat }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const { statButtonBorders } = useDisplayPreferences()
  const [substatColors] = useSubstatColors()

  // Translated label text → configured fg color; rebuilt when substat palette or language changes.
  // Keys match the text rendered by labelFormatter so the MutationObserver can color SVG text nodes.
  const labelColorMap = useMemo(
    () => new Map(HEATMAP_VARIANTS.map((v) => [t(statVariantI18nKey(v)), substatColors[v]?.fg])),
    [substatColors, t],
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

  useEffect(() => {
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
  }, [targetCounts, effectiveTargetMax])

  if (data.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260, opacity: 0.4 }}>
        <Typography variant="caption" color="text.secondary">{title}: —</Typography>
      </Box>
    )
  }

  return (
    <Box ref={chartRef}>
      {/* Title — same style as GearLensBar. Tooltip appears when a description is provided. */}
      <Tooltip title={description ?? ''} arrow placement="top-start">
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', fontSize: '0.68rem', display: 'inline-block', mb: 0.5, cursor: description ? 'help' : 'default' }}
        >
          {title}
        </Typography>
      </Tooltip>

      {/*
       * RadarChart from MUI X v8.
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
            color: alpha(theme.palette.primary.main, 0.18),
            fillArea: false,
            valueFormatter: (v: number) => String(Math.round((v ?? 0) ** 2)),
          }] : []),
          // Active filtered polygon.
          {
            data: displayCounts,
            label: title,
            color: theme.palette.primary.main,
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
          if (v !== undefined) onToggleSubstat(v)
        } : undefined}
      />

      {/*
       * Co-occurrence pivot row — always rendered at fixed minHeight to avoid layout shift.
       * Placed below the chart so it doesn't push the radar up when chips appear.
       * Mirrors GearLensCrossFilterChips: a disabled Clear button + one primary-outlined chip per pivot.
       * Clicking a chip's × deselects that substat; Clear deselects all at once.
       */}
      <Box sx={{ minHeight: 24, mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
        <Button
          size="small"
          onClick={onClearSubstat}
          disabled={!selectedSubstat || selectedSubstat.size === 0}
          data-snapshot-hide
          sx={{ py: 0, minWidth: 'auto', fontSize: '0.75rem' }}
        >
          {t('gearLensClearFilters')}
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
    </Box>
  )
}
