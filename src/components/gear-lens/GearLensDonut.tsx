/**
 * GearLensDonut.tsx
 *
 * Reusable donut chart for the Gear Lens cross-filter dashboard.
 * Clicking a slice toggles that value's selection; selected slices are highlighted.
 *
 * Optional colorBySliceId: supply per-slice colors (e.g. rarity accent colors).
 * Optional slotIconById: supply SVG or bitmap icon per slice id.
 *   When provided, icons are drawn at arc centroids (ArcIconLabel) and shown in
 *   the hover tooltip (PieIconTooltip). Arcs too narrow to fit an icon are skipped.
 *   Each icon gets a semi-transparent paper-background chip to stay legible on any arc color.
 * Optional arcLabel: custom text label function for arcs (used when no slotIconById is given).
 */
import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { alpha, Box, Typography, useTheme } from '@mui/material'
import { PieChart } from '@mui/x-charts'
import {
  useItemTooltip,
  ChartsTooltipContainer,
  ChartsTooltipPaper,
  ChartsTooltipTable,
  ChartsTooltipRow,
} from '@mui/x-charts/ChartsTooltip'

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
 * MUI X Charts passes raw arc geometry to this slot:
 *   startAngle, endAngle, arcLabelRadius, innerRadius, outerRadius, formattedArcLabel, color.
 * The domain id is encoded in formattedArcLabel (via arcLabel: item => String(item.id))
 * so we can look up the icon without relying on dataIndex (not passed) or cx/cy (not passed —
 * the parent <g> already handles the pie center translation).
 *
 * Rendering details:
 *   - Arcs too narrow (chord < MIN_ICON_CHORD_PX) are skipped to prevent overflow.
 *   - Bitmap icons (gear sets): circular semi-transparent background chip for legibility on any arc.
 *   - SVG path icons (slots): no background; fill uses getContrastText(arc color) for legibility.
 */
function ArcIconLabel(props: {
  startAngle: number
  endAngle: number
  arcLabelRadius?: number
  innerRadius: number
  outerRadius: number
  color: string
  formattedArcLabel: string | null
  [key: string]: unknown
}) {
  const ctx   = useContext(SlotIconContext)
  const theme = useTheme()

  // formattedArcLabel encodes the domain id (set by arcLabel: item => String(item.id)).
  const asset = props.formattedArcLabel ? ctx?.iconMap.get(props.formattedArcLabel) ?? null : null
  if (!asset) return null

  // Centroid: midpoint angle projected to arcLabelRadius (or midpoint of inner/outer).
  // Coordinates are relative to the pie center — the parent <g> handles cx/cy offset.
  const midAngle = (props.startAngle + props.endAngle) / 2
  const r        = props.arcLabelRadius ?? (props.innerRadius + props.outerRadius) / 2
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
    const bgFill  = alpha(theme.palette.background.paper, 0.82)
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
 */
function ArcTextLabel(props: {
  startAngle: number
  endAngle: number
  arcLabelRadius?: number
  innerRadius: number
  outerRadius: number
  color: string
  formattedArcLabel: string | null
  [key: string]: unknown
}) {
  const theme = useTheme()
  if (!props.formattedArcLabel) return null

  // Centroid position — same formula as ArcIconLabel.
  const midAngle = (props.startAngle + props.endAngle) / 2
  const r        = props.arcLabelRadius ?? (props.innerRadius + props.outerRadius) / 2
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
  const ctx         = useContext(SlotIconContext)
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
                  <Typography variant="caption" color="text.primary" fontWeight="medium">
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

export function GearLensDonut({ title, data, selected, onToggle, onDoubleClickItem, height = 220, colorBySliceId, slotIconById, arcLabel, arcLabelMinAngleDeg = 15, iconSize = 14 }: Props) {
  const theme = useTheme()

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

  // No data: render a placeholder so the layout stays stable.
  if (data.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', height, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
        <Typography variant="caption" color="text.secondary">{title}</Typography>
        <Typography variant="caption" color="text.secondary">—</Typography>
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

  // Pending single-click timer — used to distinguish click from double-click.
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cancel any pending timer on unmount to prevent stale state updates.
  useEffect(() => () => { if (clickTimerRef.current !== null) clearTimeout(clickTimerRef.current) }, [])

  // The identifier provides the dataIndex into our seriesData array.
  // When onDoubleClickItem is provided, a 300 ms window distinguishes single from double clicks.
  const handleItemClick = (_event: React.MouseEvent, identifier: { dataIndex: number }) => {
    const slice = seriesData[identifier.dataIndex]
    if (slice == null) return
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
    <SlotIconContext.Provider value={iconMap ? { iconMap, data, iconSize } : null}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', fontSize: '0.68rem' }}>
          {title}
        </Typography>
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
            '& .MuiPieArc-root:hover': {
              filter: `drop-shadow(0 0 4px ${alpha(theme.palette.primary.main, 0.6)})`,
            },
            '& .MuiPieArc-root': { cursor: 'pointer' },
          }}
        />
      </Box>
    </SlotIconContext.Provider>
  )
}
