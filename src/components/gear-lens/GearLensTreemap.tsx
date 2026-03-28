/**
 * GearLensTreemap.tsx
 *
 * Squarified treemap for the Gear Lens Sets cross-filter dimension.
 * Tile area ∝ total item count per set — larger tiles = more gear in that set.
 * Each tile's background is split left-to-right into outcome color bands
 * (sell / safeguarded / keep / no-match) proportional to item counts.
 * The gear set icon is centered on top when the tile is large enough.
 * Clicking a tile cross-filters the dashboard by that set.
 *
 * The squarified layout algorithm produces near-square tiles (Bruls, Huizing, van Wijk 2000).
 * Width is measured reactively via ResizeObserver so the layout adapts to the dialog size.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { alpha, Box, Tooltip, Typography, useTheme } from '@mui/material'
import type { SetOutcomeCount } from '../../lib/gearLens'
import { useI18n } from '../../lib/i18n'

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

/** Band order left-to-right — matches tooltip and chip metric order: sell | unmatched | keep | safeguarded. */
const BAND_ORDER = ['sell', 'none', 'keep', 'safe'] as const
type Band = typeof BAND_ORDER[number]

/** Same order used for the inline counts chip — all four outcomes. */
const COUNT_ORDER = BAND_ORDER

export function GearLensTreemap({ title, data, selected, onToggle, iconById, showIcons = true }: Props) {
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
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const hasSelection = selected.size > 0
  const paper = theme.palette.background.paper

  // Outcome color for each band — matches the outcome donut's palette.
  const bandColor: Record<Band, string> = {
    sell: theme.palette.error.main,
    safe: theme.palette.warning.main,
    keep: theme.palette.success.main,
    none: alpha(theme.palette.text.primary, 0.15),
  }

  // Compute tile rectangles. Depends on containerW so it reflows on resize.
  const tiles = useMemo(
    () => squarify(data.map(d => ({ id: d.id, value: d.total })), 0, 0, containerW, TREEMAP_H),
    [data, containerW],
  )

  // O(1) lookup from set ID to entry.
  const dataById = useMemo(() => new Map(data.map(d => [d.id, d])), [data])

  if (data.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', height: TREEMAP_H, opacity: 0.4 }}>
        <Typography variant="caption" color="text.secondary">{title}: —</Typography>
      </Box>
    )
  }

  return (
    <Box>
      {/* Section title — same typography as GearLensBar. */}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', fontSize: '0.68rem', display: 'block', mb: 0.75 }}
      >
        {title}
      </Typography>

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
                  {entry.sell > 0 && <tr><td style={{ paddingRight: 8 }}>{t('gearLensOutcomeSell')}</td><td>{entry.sell}</td></tr>}
                  {entry.none > 0 && <tr><td style={{ paddingRight: 8 }}>{t('gearLensOutcomeNone')}</td><td>{entry.none}</td></tr>}
                  {entry.keep > 0 && <tr><td style={{ paddingRight: 8 }}>{t('gearLensOutcomeKeep')}</td><td>{entry.keep}</td></tr>}
                  {entry.safe > 0 && <tr><td style={{ paddingRight: 8 }}>{t('gearLensOutcomeSafe')}</td><td>{entry.safe}</td></tr>}
                  <tr>
                    <td style={{ paddingRight: 8, fontWeight: 600 }}>{t('gearLensTotal')}</td>
                    <td style={{ fontWeight: 600 }}>{entry.total}</td>
                  </tr>
                </tbody>
              </Box>
            </Box>
          )

          return (
            <Tooltip key={tile.id} title={tooltipContent} arrow placement="top" enterDelay={200} enterNextDelay={100}>
              <Box
                onClick={() => onToggle(tile.id)}
                sx={{
                  position: 'absolute',
                  // Inset by half-gap on each side so adjacent tiles have a full-gap separation.
                  left:   tile.x + TILE_GAP / 2,
                  top:    tile.y + TILE_GAP / 2,
                  width:  Math.max(1, tile.w - TILE_GAP),
                  height: Math.max(1, tile.h - TILE_GAP),
                  overflow: 'hidden',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  opacity: dimmed ? 0.25 : 1,
                  transition: 'opacity 0.15s',
                  // Selection ring via outline; hover reveals primary-light border.
                  outline: isSelected
                    ? `2px solid ${theme.palette.primary.main}`
                    : `1px solid ${alpha(paper, 0.25)}`,
                  outlineOffset: isSelected ? -2 : -1,
                  '&:hover': {
                    opacity: 1,
                    outline: `2px solid ${theme.palette.primary.light}`,
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
                      <Box sx={{ bgcolor: alpha(paper, 0.82), borderRadius: '50%', p: '2px', lineHeight: 0, display: 'flex' }}>
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
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', bgcolor: alpha(paper, 0.8), borderRadius: 999, px: '5px', py: 0.125, gap: 0.4, flexShrink: 0 }}>
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

      {/* Outcome color legend — tile tint = dominant outcome; chip numbers use the same colors. */}
      <Box sx={{ display: 'flex', gap: 1.5, mt: 0.75, flexWrap: 'wrap' }}>
        {BAND_ORDER.map(band => (
          <Box key={band} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: 0.5, flexShrink: 0, bgcolor: bandColor[band], border: `1px solid ${alpha(theme.palette.divider, 0.5)}` }} />
            <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
              {t(({ sell: 'gearLensOutcomeSell', safe: 'gearLensOutcomeSafe', keep: 'gearLensOutcomeKeep', none: 'gearLensOutcomeNone' } as const)[band])}
            </Typography>
          </Box>
        ))}
      </Box>

    </Box>
  )
}
