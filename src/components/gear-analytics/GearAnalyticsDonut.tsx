/**
 * GearAnalyticsDonut.tsx
 *
 * Reusable donut chart for the Gear Analytics cross-filter dashboard.
 * Clicking a slice toggles that value's selection; selected slices are highlighted.
 *
 * Optional colorBySliceId: supply per-slice colors (e.g. rarity accent colors).
 * Optional slotIconById: supply SVG or bitmap icon per slice id.
 *   When provided, icons are drawn at arc centroids (ArcIconLabel) and shown in
 *   the hover tooltip (PieIconTooltip). Arcs too narrow to fit an icon are skipped.
 *   Each icon gets a semi-transparent paper-background chip to stay legible on any arc color.
 * Optional arcLabel: custom text label function for arcs (used when no slotIconById is given).
 */
import { createContext, use, useEffect, useMemo, useRef } from 'react'
import { alpha, Box, Collapse, Typography, useTheme } from '@mui/material'
import { PieChart } from '@mui/x-charts'
import {
  useItemTooltip,
  ChartsTooltipContainer,
  ChartsTooltipPaper,
  ChartsTooltipTable,
  ChartsTooltipRow,
} from '@mui/x-charts/ChartsTooltip'
import { easingSnappy, easingSlam, type GearAnalyticsEggPeer } from '../../lib/easterEggAnimUtils'
import { useEasterEggTrigger } from '../../hooks/useEasterEggTrigger'
import { GearAnalyticsChartHeader } from './GearAnalyticsChartHeader'

export type DonutSlice = {
  /** Domain ID used to track selection (slot ID, rarity RankValue, set ID, outcome string, etc.). */
  id: number | string
  label: string
  count: number
}

/** SVG path icon (used for slot icons). */
type SlotIconSvgAsset = { viewBox: string; path: string }
/** Bitmap image icon identified by URL (used for gear set icons). */
type SlotIconImgAsset = { url: string }
type SlotIconAsset = SlotIconSvgAsset | SlotIconImgAsset
type SlotIconFn = (id: number | string) => SlotIconAsset | null

type Props = {
  title: string
  data: DonutSlice[]
  /** Set of currently selected IDs for this dimension. */
  selected: ReadonlySet<number | string>
  /** Called when the user clicks a slice to toggle it in/out of the filter. */
  onToggle: (id: number | string) => void
  /**
   * Optional double-click handler. When provided, single clicks are delayed by 300 ms to
   * distinguish them from double clicks. Double-clicking a slice calls this instead of onToggle.
   */
  onDoubleClickItem?: (id: number | string) => void
  /** Height of the chart area in px. */
  height?: number
  /** Optional per-slice color override — receives the slice id, returns a CSS color or undefined. */
  colorBySliceId?: (id: number | string) => string | undefined
  /** Optional icon function per slice id — when provided, icons appear on arc centroids and tooltips. */
  slotIconById?: SlotIconFn | undefined
  /**
   * Optional text label rendered on each arc (e.g. "+4" for level donuts).
   * Ignored when slotIconById is provided — in that case, arc labels carry icon lookup ids.
   */
  arcLabel?: (id: number | string) => string
  /**
   * Minimum arc angle (degrees) required to show a text arc label.
   * Only applies when arcLabel is provided (not slotIconById). Default: 15.
   */
  arcLabelMinAngleDeg?: number
  /** Size in px of icons drawn on arc centroids. Default: 14. */
  iconSize?: number
  /**
   * Called once when this donut's Easter egg fires so sibling components can react.
   * The parent wires this to a cross-component broadcast.
   */
  onEasterEgg?: () => void
  /**
   * When the parent sets a new peer trigger (incremented seq), this donut reacts:
   *   cascade — short random delay then a full random dance animation.
   *   rage    — instant angry inflate+tint burst (pie "furious" reaction).
   */
  peerDanceTrigger?: GearAnalyticsEggPeer | null
  /** When true, the chart body is hidden and only the title row remains visible. */
  collapsed?: boolean
  /** Called when the user clicks the collapse chevron; applyToAll = Ctrl/Cmd+click or right-click. */
  onToggleCollapse?: (applyToAll: boolean) => void
}

// Palette of distinct colors for the pie slices — cycles if more slices than colors.
const SLICE_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ac',
  '#1f77b4', '#aec7e8', '#ffbb78', '#98df8a', '#d62728',
]

/** Minimum chord width (px) for an arc to receive an icon. Prevents icon overflow on thin arcs. */
const MIN_ICON_CHORD_PX = 22

/** Parse the numeric width and height from an SVG viewBox string ("0 0 W H"). */
function parseViewBoxDims(viewBox: string): { w: number; h: number } {
  const parts = viewBox.split(' ').map(Number)
  return { w: parts[2] ?? 24, h: parts[3] ?? 24 }
}

// Context passes pre-built icon map, data array, and icon size to ArcIconLabel and PieIconTooltip.
// Map key is String(domainId); allows O(1) lookup by either formattedArcLabel or domain id.
type SlotIconCtxValue = { iconMap: Map<string, SlotIconAsset>; data: DonutSlice[]; iconSize: number }
const SlotIconContext = createContext<SlotIconCtxValue | null>(null)

/**
 * Module-level arc label component — renders a slot or set icon at the arc centroid.
 * Supports SVG path icons (slot icons) and bitmap image URLs (gear set icons).
 *
 * In x-charts v9 the slot receives: startAngle, endAngle, arcLabelRadius, cornerRadius,
 * paddingAngle, hidden, seriesId, color, isFaded, isHighlighted, formattedArcLabel, skipAnimation.
 * innerRadius and outerRadius are NOT passed anymore (removed in v9 arcLabel slot).
 * The domain id is encoded in formattedArcLabel (via arcLabel: item => String(item.id))
 * so we can look up the icon without relying on dataIndex (not passed) or cx/cy (not passed —
 * the parent <g> already handles the pie center translation).
 *
 * Rendering details:
 *   - Hidden arcs (angle below arcLabelMinAngle threshold) are skipped — formattedArcLabel is null.
 *   - Arcs too narrow (chord < MIN_ICON_CHORD_PX) are skipped to prevent overflow.
 *   - Bitmap icons (gear sets): circular semi-transparent background chip for legibility on any arc.
 *   - SVG path icons (slots): no background; fill uses getContrastText(arc color) for legibility.
 */
function ArcIconLabel(props: {
  startAngle: number
  endAngle: number
  arcLabelRadius: number
  color: string
  formattedArcLabel: string | null
  [key: string]: unknown
}) {
  const ctx   = use(SlotIconContext)
  const theme = useTheme()

  // formattedArcLabel encodes the domain id (set by arcLabel: item => String(item.id)).
  const asset = props.formattedArcLabel ? ctx?.iconMap.get(props.formattedArcLabel) ?? null : null
  if (!asset) return null

  // Centroid: midpoint angle projected to arcLabelRadius.
  // Coordinates are relative to the pie center — the parent <g> handles cx/cy offset.
  const midAngle = (props.startAngle + props.endAngle) / 2
  const r        = props.arcLabelRadius
  const x        = r * Math.sin(midAngle)
  const y        = -r * Math.cos(midAngle)
  // Icon size comes from context (set per-donut via the iconSize prop).
  const size     = ctx?.iconSize ?? 14

  // Skip arcs too narrow for the icon: check chord width at the centroid radius.
  // This prevents the icon from visually overflowing onto adjacent slices.
  const halfAngle = Math.abs(props.endAngle - props.startAngle) / 2
  const chordWidth = 2 * r * Math.sin(halfAngle)
  if (chordWidth < MIN_ICON_CHORD_PX) return null

  // Bitmap image icon (e.g. gear set icons): circular background keeps the icon legible on any arc.
  if ('url' in asset) {
    const bgFill  = 'rgba(var(--mui-palette-background-paperChannel) / 0.82)'
    const bgRadius = (size + 2) / 2
    return (
      <g transform={`translate(${x}, ${y})`} style={{ pointerEvents: 'none' }}>
        <circle r={bgRadius} fill={bgFill} />
        <image href={asset.url} x={-size / 2} y={-size / 2} width={size} height={size} />
      </g>
    )
  }
  // SVG path icon (e.g. slot icons): no background — use the arc's contrast color directly.
  const iconColor = theme.palette.getContrastText(props.color)
  const { w, h }  = parseViewBoxDims(asset.viewBox)
  const scale     = size / Math.max(w, h)
  return (
    <g transform={`translate(${x}, ${y})`} style={{ pointerEvents: 'none' }}>
      <g transform={`translate(${-size / 2}, ${-size / 2}) scale(${scale})`}>
        <path d={asset.path} fill={iconColor} />
      </g>
    </g>
  )
}

/**
 * Arc label component for text-only donuts (e.g. level donut).
 * Renders the formattedArcLabel as SVG text using the arc's contrast color,
 * ensuring legibility against any arc fill without needing a background layer.
 * In x-charts v9, this slot receives arcLabelRadius directly (innerRadius/outerRadius removed).
 */
function ArcTextLabel(props: {
  startAngle: number
  endAngle: number
  arcLabelRadius: number
  color: string
  formattedArcLabel: string | null
  [key: string]: unknown
}) {
  const theme = useTheme()
  if (!props.formattedArcLabel) return null

  // Centroid position — arcLabelRadius is the pre-computed centroid radius from x-charts v9.
  const midAngle = (props.startAngle + props.endAngle) / 2
  const r        = props.arcLabelRadius
  const x        = r * Math.sin(midAngle)
  const y        = -r * Math.cos(midAngle)

  // Pick black or white depending on the arc's fill color.
  const textColor = theme.palette.getContrastText(props.color)

  return (
    <g transform={`translate(${x}, ${y})`} style={{ pointerEvents: 'none' }}>
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fill={textColor}
        fontSize={11}
        fontWeight={600}
      >
        {props.formattedArcLabel}
      </text>
    </g>
  )
}

/**
 * Icon rendered inside an HTML element (tooltip Popper, not inside the SVG).
 * Uses <img> for bitmap assets and inline <svg> for path-based assets.
 */
function TooltipIcon({ asset, size = 18 }: { asset: SlotIconAsset; size?: number }) {
  if ('url' in asset) {
    return (
      <img
        src={asset.url}
        alt=""
        width={size}
        height={size}
        style={{ verticalAlign: 'middle', objectFit: 'contain', flexShrink: 0 }}
      />
    )
  }
  // SVG path icon: use currentColor so it matches the surrounding text context.
  const { w, h } = parseViewBoxDims(asset.viewBox)
  return (
    <svg
      viewBox={asset.viewBox}
      width={size}
      height={size * (h / Math.max(w, 1))}
      style={{ verticalAlign: 'middle', flexShrink: 0 }}
    >
      <path d={asset.path} fill="currentColor" />
    </svg>
  )
}

/**
 * Tooltip slot component for donuts that have slot icons.
 * Replaces the default ChartsTooltip to show the slice icon alongside the label and count.
 *
 * ChartsTooltipContainer handles Popper positioning (trigger="item" keeps it near the
 * hovered arc). useItemTooltip reads the hovered item from the chart's Redux-like store,
 * and SlotIconContext provides the pre-built icon map.
 */
function PieIconTooltip(_props: object) {
  const ctx         = use(SlotIconContext)
  // Returns { identifier: { dataIndex }, color, label, formattedValue } or null when no hover.
  const tooltipData = useItemTooltip<'pie'>()

  // Resolve icon: dataIndex → domain id (from ctx.data) → asset (from ctx.iconMap).
  const domainId = tooltipData ? ctx?.data[tooltipData.identifier.dataIndex]?.id : undefined
  const asset    = domainId !== undefined ? ctx?.iconMap.get(String(domainId)) ?? null : null

  return (
    // trigger="item" keeps the Popper open while any pie slice is hovered.
    <ChartsTooltipContainer trigger="item">
      {tooltipData && (
        <ChartsTooltipPaper>
          <ChartsTooltipTable>
            <tbody>
              <ChartsTooltipRow>
                {/* Label cell: icon (or color swatch) + slice name. */}
                <td style={{ padding: '4px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    {asset
                      ? <TooltipIcon asset={asset} size={18} />
                      : <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: tooltipData.color, flexShrink: 0 }} />
                    }
                    <Typography variant="caption" color="text.secondary">
                      {tooltipData.label ?? ''}
                    </Typography>
                  </Box>
                </td>
                {/* Value cell: formatted count. */}
                <td style={{ padding: '4px 12px 4px 0', verticalAlign: 'middle' }}>
                  <Typography variant="caption" color="text.primary" sx={{ fontWeight: 'medium' }}>
                    {tooltipData.formattedValue}
                  </Typography>
                </td>
              </ChartsTooltipRow>
            </tbody>
          </ChartsTooltipTable>
        </ChartsTooltipPaper>
      )}
    </ChartsTooltipContainer>
  )
}

// ── Easter egg ──────────────────────────────────────────────────────────────────────────────────
// 10 WAAPI dance variants applied to the donut's container element.
// Shared easings from easterEggAnimUtils keep the feel consistent with the sort-popout easter egg.
type DonutDance = 'spin' | 'bounce' | 'wiggle' | 'orbit' | 'pogo' | 'cardboard' | 'shake' | 'shrink' | 'roll' | 'dizzy'
const DONUT_DANCES: readonly DonutDance[] = ['spin', 'bounce', 'wiggle', 'orbit', 'pogo', 'cardboard', 'shake', 'shrink', 'roll', 'dizzy']

/** Pick a random dance variant and fire a WAAPI animation on the given container element. */
function triggerDonutDance(el: HTMLElement): void {
  const idx = Math.floor(Math.random() * DONUT_DANCES.length)
  const variant = DONUT_DANCES[idx] ?? 'spin'

  if (variant === 'spin') {
    // Continuous 360° spin × 3 — the donut goes for a ride.
    el.animate(
      [{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }],
      { duration: 550, iterations: 3, easing: 'linear' },
    )
  } else if (variant === 'bounce') {
    // Hops up and down × 4.
    el.animate(
      [{ transform: 'translateY(0)' }, { transform: 'translateY(-22px)' }, { transform: 'translateY(0)' }],
      { duration: 380, iterations: 4, easing: 'ease-in-out' },
    )
  } else if (variant === 'wiggle') {
    // Shakes side-to-side ("no no no!") × 2.
    el.animate(
      [
        { transform: 'rotate(0)' },
        { transform: 'rotate(-14deg)' }, { transform: 'rotate(14deg)' },
        { transform: 'rotate(-10deg)' }, { transform: 'rotate(10deg)' },
        { transform: 'rotate(-6deg)' },  { transform: 'rotate(6deg)' },
        { transform: 'rotate(0)' },
      ],
      { duration: 700, iterations: 2, easing: 'ease-in-out' },
    )
  } else if (variant === 'orbit') {
    // Circles around in a small orbit × 3 — the donut goes for a walk.
    // 13 evenly-spaced frames close the loop precisely back at the start.
    const orbitFrames = Array.from({ length: 13 }, (_, k) => {
      const a = (k / 12) * Math.PI * 2
      return { transform: `translate(${Math.round(Math.cos(a) * 15)}px, ${Math.round(Math.sin(a) * 15)}px)` }
    })
    el.animate(orbitFrames, { duration: 800, iterations: 3, easing: 'linear' })
  } else if (variant === 'pogo') {
    // Enormous single bounce × 2 with squash and stretch on impact.
    el.animate(
      [
        { transform: 'translateY(0) scaleY(1)',        offset: 0    },
        { transform: 'translateY(-55px) scaleY(1.1)',  offset: 0.32 },
        { transform: 'translateY(0) scaleY(0.75)',     offset: 0.62 },
        { transform: 'translateY(0) scaleY(1)',        offset: 0.72 },
        { transform: 'translateY(-18px) scaleY(1.05)', offset: 0.86 },
        { transform: 'translateY(0) scaleY(1)',        offset: 1    },
      ],
      { duration: 700, iterations: 2, easing: 'ease-in' },
    )
  } else if (variant === 'cardboard') {
    // 3D perspective flip — the donut falls backwards like a piece of cardboard × 2.
    // Adapted from the rowYeet variant in the sort-popout easter egg.
    el.animate(
      [
        { transform: 'perspective(400px) rotateY(0deg)' },
        { transform: 'perspective(400px) rotateY(180deg)' },
        { transform: 'perspective(400px) rotateY(360deg)' },
      ],
      { duration: 800, iterations: 2, easing: easingSlam },
    )
  } else if (variant === 'shake') {
    // Rapid horizontal "WHAT?!" shake × 2 — adapted from the shockwave sort-popout variant.
    el.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-12px)' }, { transform: 'translateX(12px)' },
        { transform: 'translateX(-12px)' }, { transform: 'translateX(12px)' },
        { transform: 'translateX(-8px)' },  { transform: 'translateX(8px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 500, iterations: 2 },
    )
  } else if (variant === 'shrink') {
    // Collapses to near-nothing then pops back × 2 — adapted from badgeMeltdown.
    el.animate(
      [
        { transform: 'scale(1)',   offset: 0   },
        { transform: 'scale(0.1)', offset: 0.4 },
        { transform: 'scale(1.5)', offset: 0.7 },
        { transform: 'scale(1)',   offset: 1   },
      ],
      { duration: 600, iterations: 2 },
    )
  } else if (variant === 'roll') {
    // Tilts and rolls away to the right, then snaps back × 2.
    // Adapted from the carouselScramble sort-popout variant (linear offset → lateral roll).
    el.animate(
      [
        { transform: 'rotate(0deg) translateX(0px)',   offset: 0   },
        { transform: 'rotate(720deg) translateX(60px)', offset: 0.5 },
        { transform: 'rotate(720deg) translateX(60px)', offset: 0.6 },
        { transform: 'rotate(0deg) translateX(0px)',   offset: 1   },
      ],
      { duration: 1000, iterations: 2, easing: easingSnappy },
    )
  } else {
    // 'dizzy': wobbly rotation + scale combo + hue-rotate filter — adapted from glitchScrub.
    el.animate(
      [
        { transform: 'rotate(0deg) scale(1)',   filter: 'hue-rotate(0deg)'   },
        { transform: 'rotate(12deg) scale(1.08)', filter: 'hue-rotate(120deg)' },
        { transform: 'rotate(-8deg) scale(0.94)', filter: 'hue-rotate(240deg)' },
        { transform: 'rotate(5deg) scale(1.03)',  filter: 'hue-rotate(360deg)' },
        { transform: 'rotate(0deg) scale(1)',   filter: 'hue-rotate(0deg)'   },
      ],
      { duration: 600, iterations: 3, easing: 'ease-in-out' },
    )
  }
}

export function GearAnalyticsDonut({ title, data, selected, onToggle, onDoubleClickItem, height = 220, colorBySliceId, slotIconById, arcLabel, arcLabelMinAngleDeg = 15, iconSize = 14, onEasterEgg, peerDanceTrigger, collapsed, onToggleCollapse }: Props) {
  // Pre-build icon map: String(domainId) → SlotIconAsset.
  // Null when no icon function is provided or when none of the slices have icons.
  // Used by both ArcIconLabel (arc centroid icons) and PieIconTooltip (hover tooltip icons).
  const iconMap = useMemo<Map<string, SlotIconAsset> | null>(() => {
    if (!slotIconById) return null
    const map = new Map<string, SlotIconAsset>()
    for (const item of data) {
      const asset = slotIconById(item.id)
      if (asset) map.set(String(item.id), asset)
    }
    // Return null if no icons resolved — avoids activating icon slots for icon-less donuts.
    return map.size > 0 ? map : null
  }, [data, slotIconById])

  // Easter egg — ref for the WAAPI target; recordClick fires true after 10 rapid clicks on the same arc.
  const containerRef = useRef<HTMLDivElement>(null)
  const recordClick  = useEasterEggTrigger()

  // Peer reaction: when a sibling component fires its Easter egg, react here too.
  // cascade → random delay then a full random donut dance (domino/chain effect).
  // rage    → instant angry inflate+tint burst (pies furious at the treemap/radar).
  useEffect(() => {
    if (!peerDanceTrigger) return
    const el = containerRef.current
    if (!el) return
    if (peerDanceTrigger.flavor === 'rage') {
      // Angry inflate: swell up, flash red/orange, then settle back — no delay.
      el.animate(
        [
          { transform: 'scale(1)',    filter: 'saturate(1) brightness(1)'   },
          { transform: 'scale(1.22)', filter: 'saturate(4) hue-rotate(-30deg) brightness(1.3)', offset: 0.25 },
          { transform: 'scale(1.15) translateY(-10px)', filter: 'saturate(3) hue-rotate(-20deg)', offset: 0.55 },
          { transform: 'scale(1)',    filter: 'saturate(1) brightness(1)'   },
        ],
        { duration: 650, easing: easingSnappy },
      )
      return
    } else {
      // Cascade: stagger by a random 0–750 ms so the donuts fall like dominoes.
      const delay = Math.random() * 750
      const timer = setTimeout(() => {
        if (containerRef.current) triggerDonutDance(containerRef.current)
      }, delay)
      return () => clearTimeout(timer)
    }
  }, [peerDanceTrigger])

  // Pending single-click timer — used to distinguish click from double-click.
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cancel any pending timer on unmount to prevent stale state updates.
  useEffect(() => () => { if (clickTimerRef.current !== null) clearTimeout(clickTimerRef.current) }, [])

  // No data: render a placeholder so the layout stays stable.
  if (data.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.4 }}>
        <GearAnalyticsChartHeader title={title} collapsed={collapsed} onToggleCollapse={onToggleCollapse} boxSx={{ gap: 0.25 }} />
        <Collapse in={!collapsed} timeout="auto">
          <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="caption" color="text.secondary">—</Typography>
          </Box>
        </Collapse>
      </Box>
    )
  }

  const hasSelection = selected.size > 0

  // Build the series data with per-item colors.
  const seriesData = data.map((item, i) => {
    const isSelected = selected.has(item.id)
    // Prefer the supplied color function; fall back to the generic palette.
    const baseColor = colorBySliceId?.(item.id) ?? SLICE_COLORS[i % SLICE_COLORS.length]!
    // Dim unselected slices when a filter is active.
    const color = hasSelection && !isSelected ? alpha(baseColor, 0.3) : baseColor
    return { id: item.id, value: item.count, label: item.label, color }
  })

  // The identifier provides the dataIndex into our seriesData array.
  // When onDoubleClickItem is provided, a 300 ms window distinguishes single from double clicks.
  const handleItemClick = (_event: React.MouseEvent, identifier: { dataIndex: number }) => {
    const slice = seriesData[identifier.dataIndex]
    if (slice == null) return

    // Easter egg: 10 rapid clicks on the same arc fires a random dance animation.
    if (recordClick(slice.id) && containerRef.current) {
      triggerDonutDance(containerRef.current)
      // Notify parent so siblings can cascade.
      onEasterEgg?.()
    }

    if (!onDoubleClickItem) {
      onToggle(slice.id)
      return
    }
    if (clickTimerRef.current !== null) {
      // Second click within the window — treat as double-click.
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
      onDoubleClickItem(slice.id)
    } else {
      // First click — wait to see if a second follows before committing to single-click.
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null
        onToggle(slice.id)
      }, 300)
    }
  }

  // Determine the arcLabel for the series:
  //   - With iconMap: encode domain id so ArcIconLabel can look it up.
  //   - With arcLabel prop (text only): use it for readable text labels.
  //   - Otherwise: empty string hides all arc labels.
  const seriesArcLabel = iconMap
    ? (item: { id?: unknown }) => (item.id != null ? String(item.id) : '')
    : arcLabel
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (item: any) => arcLabel(item.id)
      : () => ''

  return (
    // Provide iconMap + data to ArcIconLabel and PieIconTooltip via context.
    <SlotIconContext value={iconMap ? { iconMap, data, iconSize } : null}>
      {/* ref target for WAAPI dance animations — the whole donut bounces/spins/etc. */}
      <Box ref={containerRef} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Title row — chevron toggles collapse of the pie chart below. */}
        <GearAnalyticsChartHeader title={title} collapsed={collapsed} onToggleCollapse={onToggleCollapse} boxSx={{ gap: 0.25 }} />
        {/* width: 100% breaks the circular flex-width reference so x-charts v9 can measure the container. */}
        <Collapse in={!collapsed} timeout="auto" sx={{ width: '100%' }}>
        <PieChart
          series={[{
            data: seriesData,
            // Donut hole: innerRadius creates the ring effect.
            innerRadius: 30,
            paddingAngle: 1,
            cornerRadius: 2,
            arcLabel: seriesArcLabel,
            // Icon mode: always call the slot (chord-width check inside ArcIconLabel handles skipping).
            // Text mode: use arcLabelMinAngleDeg so narrow arcs are hidden automatically by MUI X Charts.
            arcLabelMinAngle: iconMap ? 0 : arcLabelMinAngleDeg,
          }]}
          // Swap arc label slot: icons when iconMap is present, contrast-colored text when arcLabel is provided.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          slots={(iconMap ? { pieArcLabel: ArcIconLabel, tooltip: PieIconTooltip } : arcLabel ? { pieArcLabel: ArcTextLabel } : undefined) as any}
          onItemClick={handleItemClick}
          height={height}
          hideLegend
          sx={{
            cursor: 'pointer',
            // Highlight hovered slices with a subtle ring.
            // x-charts v9 uses MuiPieChart-arc (from pieClasses utility) instead of MuiPieArc-root.
            '& .MuiPieChart-arc:hover': {
              filter: `drop-shadow(0 0 4px ${'rgba(var(--mui-palette-primary-mainChannel) / 0.6)'})`,
            },
            '& .MuiPieChart-arc': { cursor: 'pointer' },
          }}
        />
        </Collapse>
      </Box>
    </SlotIconContext>
  )
}
