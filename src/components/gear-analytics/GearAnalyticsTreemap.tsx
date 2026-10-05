/**
 * GearAnalyticsTreemap.tsx
 *
 * Squarified treemap for the Gear Analytics Sets cross-filter dimension.
 * Tile area ∝ total item count per set — larger tiles = more gear in that set.
 * Each tile's background is split left-to-right into outcome color bands
 * (sell / safeguarded / keep / no-match) proportional to item counts.
 * The gear set icon is centered on top when the tile is large enough.
 * Clicking a tile cross-filters the dashboard by that set.
 *
 * The squarified layout algorithm produces near-square tiles (Bruls, Huizing, van Wijk 2000).
 * Width is measured reactively via ResizeObserver so the layout adapts to the dialog size.
 *
 * Easter egg: clicking the same tile 10 times within 10 seconds triggers a random dance
 * animation on the tile layout.  10 distinct variants are available.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Box, Collapse, Tooltip, Typography, useTheme } from '@mui/material'
import type { SetOutcomeCount } from '../../lib/gearAnalytics'
import { useI18n } from '../../lib/i18n'
import { clamp01, type GearAnalyticsEggPeer } from '../../lib/easterEggAnimUtils'
import { useEasterEggTrigger } from '../../hooks/useEasterEggTrigger'
import type { ArtifactSetId } from '../../lib/types'
import type { ArtifactSetSelectionEntry } from '../../lib/gearSets/selection'
import type { Metaset } from '../../lib/metasets'
import GearSetsSelect from '../gear/GearSetsSelect'
import { GearAnalyticsChartHeader } from './GearAnalyticsChartHeader'
import { CHART_DESELECTED_DIM_ALPHA, CHART_EMPTY_PLACEHOLDER_OPACITY } from '../../lib/themeCustomTokens'
import { TINT } from '../../lib/colorTints'

// ── Props ─────────────────────────────────────────────────────────────────────

type SetIconAsset = { url: string }

type Props = {
  title: string
  data: SetOutcomeCount[]
  selected: ReadonlySet<number>
  onToggle: (id: number) => void
  /** Returns a bitmap icon asset for a set ID, or null when none is available. */
  iconById: (id: number) => SetIconAsset | null
  /**
   * Whether the user has icons enabled globally.
   * When true: show icon whenever there is room; label appears alongside it if there is also room.
   * When false: prefer the set name label; fall back to the icon only when the tile is too small
   *   for a label but still large enough for an icon.
   */
  showIcons?: boolean
  /**
   * Called once when this treemap's Easter egg fires so sibling components can react.
   * The parent wires this to a cross-component broadcast.
   */
  onEasterEgg?: () => void
  /**
   * When the parent sets a new peer trigger (incremented seq), the treemap starts a
   * sympathetic dance.  Ignored when a self-triggered dance is already running.
   */
  peerDanceTrigger?: GearAnalyticsEggPeer | null
  /** When true, the chart body is hidden and only the title row remains visible. */
  collapsed?: boolean
  /** Called when the user clicks the collapse chevron; applyToAll = Ctrl/Cmd+click or right-click. */
  onToggleCollapse?: (applyToAll: boolean) => void
  /**
   * When provided, a GearSetsSelect quick-filter is rendered on the right side of the title row.
   * It shows/hides with the section collapse state.
   */
  setSelectionEntries?: ArtifactSetSelectionEntry[]
  /** Called when the user changes the selection via the title-row GearSetsSelect. */
  onSetSelectionChange?: (next: ArtifactSetSelectionEntry[]) => void
  /** Metasets available for the GearSetsSelect quick-filter. */
  metasets?: Metaset[]
  /** Currently-selected metaset group names — drives the metaset chip display in the select. */
  selectedMetaSetNames?: string[]
  /** Called when the user changes the metaset selection in the title-row GearSetsSelect. */
  onMetaSetNamesChange?: (next: string[]) => void
  /**
   * When provided, limits the GearSetsSelect to compatible sets for the currently-selected slots.
   * Undefined = no restriction (all slots selected or mixed artifact + accessory).
   */
  allowedSetIds?: readonly ArtifactSetId[]
}

// ── Layout constants ──────────────────────────────────────────────────────────

/** Fixed treemap height in px. Width is measured from the container. */
const TREEMAP_H = 180
/** Gap between tiles in px — split equally as inset on each tile. */
const TILE_GAP = 1
/** Minimum tile width AND height required to show the set icon. */
const ICON_THRESHOLD_PX = 26
/** Set icon size in px. */
const ICON_SIZE = 20
/** Minimum tile width required to show a text label below the icon. */
const LABEL_MIN_W = 54
/** Minimum tile height required to show a text label below the icon. */
const LABEL_MIN_H = 38
/**
 * Estimate the minimum tile width needed to show the outcome counts chip without clipping.
 * The chip has 10px horizontal padding (5px each side), ~18px for the total number, and ~14px
 * per non-zero outcome band (1px divider + gap + value text). A 4px safety margin is added so
 * the chip never touches the tile edges. Using an estimate avoids a render-then-measure cycle;
 * tiles that don't meet the threshold simply skip the chip rather than show it clipped.
 */
function chipMinWidth(entry: SetOutcomeCount): number {
  const nonZero = COUNT_ORDER.filter(b => entry[b] > 0).length
  return 38 + nonZero * 14
}
/** Minimum tile height required to show the outcome counts chip. */
const NUMBERS_MIN_H = 12

// ── Squarified treemap algorithm ──────────────────────────────────────────────

type TileLayout = { id: number; x: number; y: number; w: number; h: number }

/**
 * Worst aspect ratio for a hypothetical row of items in the current rect.
 * When the rect is wider (w >= h), the strip is vertical (items stack top-to-bottom).
 * When the rect is taller (h > w), the strip is horizontal (items stack left-to-right).
 */
function worstAspect(areas: number[], x0: number, y0: number, x1: number, y1: number): number {
  if (areas.length === 0) return Infinity
  const rw = x1 - x0
  const rh = y1 - y0
  const rowArea = areas.reduce((s, a) => s + a, 0)
  if (rw >= rh) {
    // Vertical strip — strip width = rowArea / rh; each item height = area / strip_width.
    const sw = rowArea / rh
    if (sw === 0) return Infinity
    return Math.max(...areas.map(a => { const nh = a / sw; return sw > nh ? sw / nh : nh / sw }))
  } else {
    // Horizontal strip — strip height = rowArea / rw; each item width = area / strip_height.
    const sh = rowArea / rw
    if (sh === 0) return Infinity
    return Math.max(...areas.map(a => { const nw = a / sh; return sh > nw ? sh / nw : nw / sh }))
  }
}

/**
 * Squarified treemap layout.
 * Returns one TileLayout per item. Items are sorted by value descending internally.
 * All values are normalized to the total rect area before layout.
 */
function squarify(
  items: Array<{ id: number; value: number }>,
  x0: number, y0: number, x1: number, y1: number,
): TileLayout[] {
  if (items.length === 0 || x1 <= x0 || y1 <= y0) return []
  const total = items.reduce((s, i) => s + i.value, 0)
  if (total === 0) return []

  const area = (x1 - x0) * (y1 - y0)
  // Normalize values to the rect area and sort largest-first.
  const sorted = [...items]
    .sort((a, b) => b.value - a.value)
    .map(item => ({ id: item.id, value: item.value, _a: (item.value / total) * area }))

  const result: TileLayout[] = []

  /** Place a committed row into the rect and return the remaining rect. */
  function commitRow(
    row: typeof sorted,
    rx0: number, ry0: number, rx1: number, ry1: number,
  ): { nx0: number; ny0: number; nx1: number; ny1: number } {
    const rw = rx1 - rx0
    const rh = ry1 - ry0
    const rowArea = row.reduce((s, n) => s + n._a, 0)
    if (rw >= rh) {
      // Vertical strip placed on the left side of the rect.
      const sw = rowArea / rh
      let y = ry0
      for (const node of row) {
        const nh = node._a / sw
        result.push({ id: node.id, x: rx0, y, w: sw, h: nh })
        y += nh
      }
      return { nx0: rx0 + sw, ny0: ry0, nx1: rx1, ny1: ry1 }
    } else {
      // Horizontal strip placed on the top of the rect.
      const sh = rowArea / rw
      let x = rx0
      for (const node of row) {
        const nw = node._a / sh
        result.push({ id: node.id, x, y: ry0, w: nw, h: sh })
        x += nw
      }
      return { nx0: rx0, ny0: ry0 + sh, nx1: rx1, ny1: ry1 }
    }
  }

  /** Recursively lay out nodes into the given rect. */
  function layout(
    nodes: typeof sorted,
    rx0: number, ry0: number, rx1: number, ry1: number,
  ) {
    if (nodes.length === 0) return
    if (nodes.length === 1) {
      result.push({ id: nodes[0]!.id, x: rx0, y: ry0, w: rx1 - rx0, h: ry1 - ry0 })
      return
    }
    let row: typeof sorted = []
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!
      if (row.length === 0) { row = [node]; continue }
      // Add node to row only if it improves (or maintains) the worst aspect ratio.
      const wCurr = worstAspect(row.map(n => n._a), rx0, ry0, rx1, ry1)
      const wNew  = worstAspect([...row.map(n => n._a), node._a], rx0, ry0, rx1, ry1)
      if (wNew <= wCurr) {
        row = [...row, node]
      } else {
        // Current row is optimal — commit it and recurse on remaining nodes.
        const { nx0, ny0, nx1, ny1 } = commitRow(row, rx0, ry0, rx1, ry1)
        layout(nodes.slice(i), nx0, ny0, nx1, ny1)
        return
      }
    }
    // Commit the final row.
    commitRow(row, rx0, ry0, rx1, ry1)
  }

  layout(sorted, x0, y0, x1, y1)
  return result
}

// ── Component ─────────────────────────────────────────────────────────────────

/** Band order left-to-right — unmatched first (mutually exclusive with outcomes), then sell | keep | safeguarded. */
const BAND_ORDER = ['none', 'sell', 'keep', 'safe'] as const
type Band = typeof BAND_ORDER[number]

/** Same order used for the inline counts chip — all four outcomes. */
const COUNT_ORDER = BAND_ORDER

// ── Easter egg ────────────────────────────────────────────────────────────────
// 10 rAF-driven dance variants applied to tile positions.  Each variant gets 2 s.

type TreemapDance =
  | 'earthquake' | 'bounce' | 'explosion' | 'wave'
  | 'collapse'   | 'rain'   | 'scatter'   | 'grid-snap'
  | 'cardboard'  | 'shockwave'
const TREEMAP_DANCES: readonly TreemapDance[] = [
  'earthquake', 'bounce', 'explosion', 'wave',
  'collapse', 'rain', 'scatter', 'grid-snap',
  'cardboard', 'shockwave',
]

/** Per-tile positional + transform offset during a dance animation. */
type TileDanceOffset = { dx: number; dy: number; scale?: number; rotate?: number }

/** Duration of each treemap dance burst in milliseconds. */
const TREEMAP_DANCE_MS = 2_000

export function GearAnalyticsTreemap({ title, data, selected, onToggle, iconById, showIcons = true, onEasterEgg, peerDanceTrigger, collapsed, onToggleCollapse, setSelectionEntries, onSetSelectionChange, metasets, selectedMetaSetNames, onMetaSetNamesChange, allowedSetIds }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(0)

  // Measure container width on mount and watch for resizes (e.g. dialog resize).
  // useLayoutEffect ensures the width is captured before the first paint.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    setContainerW(el.offsetWidth)
  }, [])
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => setContainerW(Math.floor(entries[0]!.contentRect.width)))
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-initialize-state
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const hasSelection = selected.size > 0
  // alpha() cannot decompose CSS variable strings — use channel tokens directly instead.

  // Outcome color for each band — matches the outcome donut's palette.
  const bandColor: Record<Band, string> = {
    sell: (theme.vars?.palette.error.main ?? theme.palette.error.main),
    safe: (theme.vars?.palette.warning.main ?? theme.palette.warning.main),
    keep: (theme.vars?.palette.success.main ?? theme.palette.success.main),
    // Unmatched items are kept by default — use a lighter green to signal that while
    // remaining visually distinct from an explicit keep rule (success.main).
    none: (theme.vars?.palette.success.light ?? theme.palette.success.light),
  }

  // Only show legend entries for bands that actually appear in the visible data.
  const visibleBands = useMemo(
    () => BAND_ORDER.filter(band => data.some(e => e[band] > 0)),
    [data],
  )

  // Compute tile rectangles. Depends on containerW so it reflows on resize.
  const tiles = useMemo(
    () => squarify(data.map(d => ({ id: d.id, value: d.total })), 0, 0, containerW, TREEMAP_H),
    [data, containerW],
  )

  // O(1) lookup from set ID to entry.
  const dataById = useMemo(() => new Map(data.map(d => [d.id, d])), [data])

  // ── Easter egg state ──────────────────────────────────────────────────────────
  // activeDance bundles the chosen variant with the epicenter tile id (needed by shockwave).
  const [activeDance, setActiveDance] = useState<{ variant: TreemapDance; epicenterId: number } | null>(null)
  const [danceOffsets, setDanceOffsets] = useState<Map<number, TileDanceOffset>>(() => new Map())
  const recordClick = useEasterEggTrigger()
  // Stable ref so the peer effect can check dance state without triggering re-runs.
  // Writing to a ref during render is the canonical React pattern for syncing state into
  // a ref for use inside effects; the lint rule does not apply here.
  const activeDanceRef = useRef(activeDance)
  // eslint-disable-next-line react-hooks/refs
  activeDanceRef.current = activeDance

  // Peer reaction: sympathetic dance triggered by a sibling component's Easter egg.
  // Picks from variants that look "reactive" — scatter, wave, explosion.
  // Ignored when a self-triggered dance is already running.
  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
    if (!peerDanceTrigger || activeDanceRef.current || tiles.length === 0) return
    const PEER_VARIANTS: TreemapDance[] = ['scatter', 'wave', 'explosion', 'scatter', 'bounce']
    const variant = PEER_VARIANTS[Math.floor(Math.random() * PEER_VARIANTS.length)] ?? 'scatter'
    // Use the center tile as the epicenter for peer-triggered dances.
    const epicenterId = tiles[Math.floor(tiles.length / 2)]?.id ?? tiles[0]!.id
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-derived-state
    setActiveDance({ variant, epicenterId })
  }, [peerDanceTrigger, tiles])

  // Dance rAF loop — runs for TREEMAP_DANCE_MS, then clears state and lets the layout settle.
  useEffect(() => {
    if (!activeDance || tiles.length === 0) return

    const { variant, epicenterId } = activeDance
    const startTime = performance.now()
    let rafId: number

    // Precompute values used inside the frame loop — avoids recomputing per-frame.
    const n = tiles.length
    const cx = containerW / 2
    const cy = TREEMAP_H / 2
    // Tile centres for angle/distance calculations.
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent
    const tileCxs = tiles.map(tl => tl.x + tl.w / 2)
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent
    const tileCys = tiles.map(tl => tl.y + tl.h / 2)

    // Grid positions for the grid-snap variant — equally sized cells.
    const cols = Math.ceil(Math.sqrt(n))
    const gridCellW = containerW / cols
    const gridCellH = TREEMAP_H / Math.ceil(n / cols)
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent
    const gridXs = tiles.map((_, i) => (i % cols) * gridCellW)
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent
    const gridYs = tiles.map((_, i) => Math.floor(i / cols) * gridCellH)

    // Epicenter position for the shockwave variant.
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent
    const epTile = tiles.find(tl => tl.id === epicenterId) ?? tiles[0]!
    const epCx   = epTile.x + epTile.w / 2
    const epCy   = epTile.y + epTile.h / 2

    function step(now: number) {
      const elapsed = now - startTime
      if (elapsed >= TREEMAP_DANCE_MS) {
        // Dance complete — clear offsets so tiles snap back to real positions.
        setDanceOffsets(new Map())
        setActiveDance(null)
        return
      }

      const t = elapsed / 1_000
      const progress = elapsed / TREEMAP_DANCE_MS
      const decay = 1 - progress

      const offsets = new Map<number, TileDanceOffset>()

      tiles.forEach((tile, i) => {
        const tileCx_ = tileCxs[i]!
        const tileCy_ = tileCys[i]!

        if (variant === 'earthquake') {
          // Each tile shakes at its own sinusoidal frequency; decays to zero.
          offsets.set(tile.id, {
            dx: Math.sin(t * 15 + i * 1.31) * 9 * decay,
            dy: Math.cos(t * 13 + i * 0.91) * 9 * decay,
          })

        } else if (variant === 'bounce') {
          // Staggered vertical conga-line — tiles hop in sequence.
          offsets.set(tile.id, {
            dx: 0,
            dy: -Math.abs(Math.sin(t * 3 * Math.PI + i * 0.45)) * 18 * decay,
          })

        } else if (variant === 'explosion') {
          // Radial fly-out from treemap center then snap back (half-sine arc).
          const angle = Math.atan2(tileCy_ - cy, tileCx_ - cx)
          const r = Math.sin(progress * Math.PI) * 35
          offsets.set(tile.id, {
            dx: Math.cos(angle) * r,
            dy: Math.sin(angle) * r,
          })

        } else if (variant === 'wave') {
          // Left-to-right sine wave ripple across the treemap.
          offsets.set(tile.id, {
            dx: 0,
            dy: Math.sin(t * 4 * Math.PI - (tile.x / Math.max(containerW, 1)) * Math.PI * 2) * 13 * decay,
          })

        } else if (variant === 'collapse') {
          // Tiles converge toward the vertical center then spring back.
          // Adapted from the accordionFold variant in the sort-popout easter egg.
          offsets.set(tile.id, {
            dx: 0,
            dy: (cy - tileCy_) * Math.sin(progress * Math.PI) * 0.9,
          })

        } else if (variant === 'rain') {
          // Tiles shoot upward together then fall back; slight per-tile wobble.
          offsets.set(tile.id, {
            dx: 0,
            dy: -Math.sin(progress * Math.PI) * 80 + Math.sin(t * 5 + i * 0.4) * 5,
          })

        } else if (variant === 'scatter') {
          // Deterministic random scatter based on tile index, snap back at end.
          // Uses non-trivial multipliers so each tile goes to a distinct position.
          const sdx = Math.sin(i * 1000) * 40 + Math.sin(i * 700) * 20
          const sdy = Math.cos(i * 500) * 40 + Math.cos(i * 1300) * 20
          const frac = Math.sin(progress * Math.PI)
          offsets.set(tile.id, { dx: sdx * frac, dy: sdy * frac })

        } else if (variant === 'grid-snap') {
          // Tiles rearrange to an equal-area grid then snap back to organic layout.
          const frac = Math.sin(progress * Math.PI)
          offsets.set(tile.id, {
            dx: ((gridXs[i] ?? 0) - tile.x) * frac,
            dy: ((gridYs[i] ?? 0) - tile.y) * frac,
          })

        } else if (variant === 'cardboard') {
          // Tiles fall and spin like pieces of cardboard, staggered by index.
          // Adapted from the rowYeet variant in the sort-popout easter egg.
          const delayMs = (i / Math.max(n, 1)) * 500  // stagger onset over first 0.5 s
          const localElapsed = Math.max(0, elapsed - delayMs)
          const localProgress = clamp01(localElapsed / (TREEMAP_DANCE_MS - 500))
          const localSin = Math.sin(localProgress * Math.PI)
          offsets.set(tile.id, {
            dx: 0,
            dy: localSin * 8 * decay,
            rotate: localSin * (i % 2 === 0 ? 180 : -180) * decay,
            scale: 1 - 0.6 * Math.abs(localSin),
          })

        } else {
          // 'shockwave': staggered wobble radiating from the epicenter tile.
          // Adapted directly from the shockwave variant in the sort-popout easter egg.
          const dist = Math.sqrt((tileCx_ - epCx) ** 2 + (tileCy_ - epCy) ** 2)
          const delayMs = dist * 3  // 3ms per pixel distance from epicenter
          const localElapsed = Math.max(0, elapsed - delayMs)
          if (localElapsed <= 0) {
            offsets.set(tile.id, { dx: 0, dy: 0 })
          } else {
            const intensity = clamp01(1 - dist / 180) * clamp01(1 - localElapsed / 1_000)
            const dx = Math.sin((localElapsed / 80) * Math.PI) * 14 * intensity
            offsets.set(tile.id, { dx, dy: 0 })
          }
        }
      })

      setDanceOffsets(offsets)
      rafId = requestAnimationFrame(step)
    }

    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [activeDance, tiles, containerW])

  if (data.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', height: TREEMAP_H, opacity: CHART_EMPTY_PLACEHOLDER_OPACITY }}>
        <Typography variant="caption" color="text.secondary">{title}: —</Typography>
      </Box>
    )
  }

  return (
    <Box>
      {/* Title row — chevron + label on the left; GearSetsSelect quick-filter on the right (hidden when collapsed). */}
      <GearAnalyticsChartHeader title={title} collapsed={collapsed} onToggleCollapse={onToggleCollapse} boxSx={{ mb: 0.75 }}>
        {/* Quick gear-set filter — visible only when the section is expanded; excluded from snapshots. */}
        {!collapsed && setSelectionEntries !== undefined && onSetSelectionChange && (
          // Fixed-width container: prevents the select from pushing the title label when many sets
          // are selected and the label text grows long.
          <Box data-snapshot-hide sx={{ marginLeft: 'auto', flex: '0 0 240px' }}>
            <GearSetsSelect
              value={setSelectionEntries}
              onChange={onSetSelectionChange}
              showMetasets
              metasets={metasets ?? []}
              // Metaset group selection: provided when the parent tracks metaset state.
              {...(selectedMetaSetNames !== undefined && onMetaSetNamesChange !== undefined && {
                selectedMetasetIds: selectedMetaSetNames,
                onChangeMetasetIds: onMetaSetNamesChange,
              })}
              {...(allowedSetIds !== undefined && { allowedSetIds })}
              // When no slot filter is active (allowedSetIds undefined), all items including
              // no-set accessories are in scope — force the sentinel to appear in the list.
              showNoSet={allowedSetIds === undefined}
              anyLabel={t('anySet')}
              minWidthPx={240}
              layoutVersion={1}
            />
          </Box>
        )}
      </GearAnalyticsChartHeader>
      <Collapse in={!collapsed} timeout="auto">
      {/* Treemap canvas. Tiles are absolutely positioned inside. */}
      <Box ref={containerRef} sx={{ position: 'relative', width: '100%', height: TREEMAP_H }}>
        {tiles.map(tile => {
          const entry = dataById.get(tile.id)
          if (!entry) return null

          const isSelected = selected.has(tile.id)
          const dimmed = hasSelection && !isSelected
          const icon = iconById(tile.id)
          const tileHasIconRoom  = icon !== null && tile.w >= ICON_THRESHOLD_PX && tile.h >= ICON_THRESHOLD_PX
          const tileHasLabelRoom = tile.w >= LABEL_MIN_W && tile.h >= LABEL_MIN_H
          // Icons on: show icon whenever there is room; label appears alongside it when also room.
          // Icons off: prefer label; fall back to icon only when the tile is too small for a label.
          const showIcon    = showIcons ? tileHasIconRoom : (tileHasIconRoom && !tileHasLabelRoom)
          const showLabel   = showIcons ? (tileHasIconRoom && tileHasLabelRoom) : tileHasLabelRoom
          const showNumbers = tile.w >= chipMinWidth(entry) && tile.h >= NUMBERS_MIN_H

          const tooltipContent = (
            <Box sx={{ fontSize: '0.75rem' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{entry.label}</Typography>
              <Box component="table" sx={{ borderCollapse: 'collapse', mt: 0.25 }}>
                <tbody>
                  {entry.sell > 0 && <tr><td style={{ paddingRight: 8 }}>{t('gearAnalyticsOutcomeSell')}</td><td>{entry.sell}</td></tr>}
                  {entry.none > 0 && <tr><td style={{ paddingRight: 8 }}>{t('gearAnalyticsOutcomeNone')}</td><td>{entry.none}</td></tr>}
                  {entry.keep > 0 && <tr><td style={{ paddingRight: 8 }}>{t('gearAnalyticsOutcomeKeep')}</td><td>{entry.keep}</td></tr>}
                  {entry.safe > 0 && <tr><td style={{ paddingRight: 8 }}>{t('gearAnalyticsOutcomeSafe')}</td><td>{entry.safe}</td></tr>}
                  <tr>
                    <td style={{ paddingRight: 8, fontWeight: 600 }}>{t('gearAnalyticsTotal')}</td>
                    <td style={{ fontWeight: 600 }}>{entry.total}</td>
                  </tr>
                </tbody>
              </Box>
            </Box>
          )

          // Apply dance offset to tile position and optional transform.
          const off = danceOffsets.get(tile.id)
          const danceTransform = (off?.scale !== undefined || off?.rotate !== undefined)
            ? `scale(${off.scale ?? 1}) rotate(${off.rotate ?? 0}deg)`
            : undefined

          return (
            <Tooltip key={tile.id} title={tooltipContent} arrow placement="top" enterDelay={200} enterNextDelay={100}>
              <Box
                onClick={() => {
                  // Easter egg: 10 rapid clicks on the same tile fires a dance.
                  // Return immediately so the 10th click doesn't also toggle the filter.
                  if (recordClick(tile.id) && !activeDance) {
                    const idx = Math.floor(Math.random() * TREEMAP_DANCES.length)
                    setActiveDance({ variant: TREEMAP_DANCES[idx] ?? 'earthquake', epicenterId: tile.id })
                    // Notify parent so sibling components can react.
                    onEasterEgg?.()
                    return
                  }
                  onToggle(tile.id)
                }}
                sx={{
                  position: 'absolute',
                  // Inset by half-gap on each side so adjacent tiles have a full-gap separation.
                  // Dance offsets shift the tile without affecting other tiles.
                  left:   tile.x + TILE_GAP / 2 + (off?.dx ?? 0),
                  top:    tile.y + TILE_GAP / 2 + (off?.dy ?? 0),
                  width:  Math.max(1, tile.w - TILE_GAP),
                  height: Math.max(1, tile.h - TILE_GAP),
                  overflow: 'hidden',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  opacity: dimmed ? CHART_DESELECTED_DIM_ALPHA : 1,
                  transition: 'opacity 0.15s',
                  transform: danceTransform,
                  transformOrigin: 'center center',
                  // Selection ring via outline; hover reveals primary-light border.
                  outline: isSelected
                    ? `2px solid ${(theme.vars?.palette.primary.main ?? theme.palette.primary.main)}`
                    : `1px solid ${TINT.tileSeparator}`,
                  outlineOffset: isSelected ? -2 : -1,
                  '&:hover': {
                    opacity: 1,
                    outline: `2px solid ${(theme.vars?.palette.primary.light ?? theme.palette.primary.light)}`,
                    outlineOffset: -2,
                  },
                  // Outcome color bands as a left-to-right flex row (sell | unmatched | keep | safeguarded).
                  display: 'flex',
                  flexDirection: 'row',
                }}
              >
                {/* Outcome color bands — proportional flex children in band order. */}
                {BAND_ORDER.map(band => {
                  const count = entry[band]
                  if (count === 0) return null
                  return <Box key={band} sx={{ flex: count, bgcolor: bandColor[band], flexShrink: 0 }} />
                })}

                {/* Icon / label / counts overlay — all centered in a column above the bands. */}
                {(showIcon || showLabel || showNumbers) && (
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '2px',
                      pointerEvents: 'none',
                    }}
                  >
                    {/* Icon disc — shown when icons are on (or as fallback when tile is too small for a label). */}
                    {showIcon && (
                      <Box sx={{ bgcolor: TINT.chartChipBg, borderRadius: '50%', p: '2px', lineHeight: 0, display: 'flex' }}>
                        <Box
                          component="img"
                          src={icon!.url}
                          sx={{ width: ICON_SIZE, height: ICON_SIZE, objectFit: 'contain', display: 'block' }}
                        />
                      </Box>
                    )}
                    {/* Set name — shown when there is enough room; truncated with ellipsis. */}
                    {showLabel && (
                      <Typography
                        sx={{
                          fontSize: 9,
                          lineHeight: 1.15,
                          fontWeight: 600,
                          color: 'white',
                          textAlign: 'center',
                          px: 0.5,
                          textShadow: '0 1px 3px rgba(0,0,0,0.85)',
                          maxWidth: tile.w - 6,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {entry.label}
                      </Typography>
                    )}
                    {/* Outcome counts chip — total | sell | keep | safe, matching GearInspectorOutcomeSummaryChip colors.
                      * maxWidth is capped to the usable tile width so the chip never overflows the tile boundary.
                      * overflow: hidden hides content that doesn't fit; the chip itself is not rendered at all
                      * when the tile is too narrow (showNumbers gate). */}
                    {showNumbers && (
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', bgcolor: TINT.chartChipBg, borderRadius: 999, px: '5px', py: 0.125, gap: 0.4, flexShrink: 0 }}>
                        <Typography sx={{ fontSize: 9, fontWeight: 700, color: 'text.secondary', lineHeight: 1 }}>{entry.total}</Typography>
                        {COUNT_ORDER.map(band => entry[band] > 0 && (
                          <Box key={band} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4 }}>
                            <Box sx={{ width: '1px', height: 8, bgcolor: 'divider', flexShrink: 0 }} />
                            <Typography sx={{ fontSize: 9, fontWeight: 700, lineHeight: 1, color: bandColor[band] }}>{entry[band]}</Typography>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            </Tooltip>
          )
        })}
      </Box>

      {/* Outcome color legend — total first, then sell/none/keep/safe matching the chip order. */}
      <Box sx={{ display: 'flex', gap: 1.5, mt: 0.75, flexWrap: 'wrap' }}>
        {/* Total swatch — matches the leading count in each tile's chip (text.secondary color). */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: 0.5, flexShrink: 0, bgcolor: (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary), border: `1px solid ${TINT.legendSwatchBorder}` }} />
          <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{t('gearAnalyticsTotal')}</Typography>
        </Box>
        {visibleBands.map(band => (
          <Box key={band} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: 0.5, flexShrink: 0, bgcolor: bandColor[band], border: `1px solid ${TINT.legendSwatchBorder}` }} />
            <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
              {t(({ sell: 'gearAnalyticsOutcomeSell', safe: 'gearAnalyticsOutcomeSafe', keep: 'gearAnalyticsOutcomeKeep', none: 'gearAnalyticsOutcomeNone' } as const)[band])}
            </Typography>
          </Box>
        ))}
      </Box>
      </Collapse>
    </Box>
  )
}
