/**
 * GearAnalyticsBar.tsx
 *
 * Custom HTML horizontal bar chart for the Gear Analytics dashboard.
 * Renders one labelled bar row per entry; clicking a row toggles cross-filter selection.
 * Labels are constrained to LABEL_COL_W and clipped with EllipsisTooltip on overflow.
 *
 * Easter egg: clicking the same bar 10 times within 10 seconds triggers a random
 * animation burst on the chart.  12 distinct WAAPI variants are available.
 */
import { useEffect, useRef } from 'react'
import { alpha, Box, Collapse, Typography, useTheme } from '@mui/material'
import { EllipsisTooltip } from '../EllipsisTooltip'
import { easingSnappy, easingSlam, type GearAnalyticsEggPeer } from '../../lib/easterEggAnimUtils'
import { useEasterEggTrigger } from '../../hooks/useEasterEggTrigger'
import { GearAnalyticsChartHeader } from './GearAnalyticsChartHeader'

export type BarEntry = {
  /** Domain ID used for selection tracking. */
  id: number | string
  label: string
  count: number
}

type Props = {
  title: string
  /** Optional tooltip shown on hover over the section title. */
  description?: string
  data: BarEntry[]
  /** Currently selected IDs for this dimension. */
  selected: ReadonlySet<number | string>
  /** Called when the user clicks a row to toggle it in the cross-filter. */
  onToggle: (id: number | string) => void
  height?: number
  /** Accent color for selected bars (defaults to primary). */
  accentColor?: string
  /** Base color for unselected bars. */
  baseColor?: string
  /** Optional per-entry label color (e.g. stat variant colors). Selected entries always use primary. */
  colorById?: (id: number | string) => string | undefined
  /** When true, disables click handling and suppresses hover/pointer cues. */
  readOnly?: boolean
  /**
   * Called once when this bar chart's Easter egg fires so sibling components can react.
   * The parent wires this to a cross-component broadcast.
   */
  onEasterEgg?: () => void
  /**
   * When the parent sets a new peer trigger (incremented seq), the bar chart reacts with
   * a sympathetic animation burst.
   */
  peerDanceTrigger?: GearAnalyticsEggPeer | null
  /** When true, the chart body is hidden and only the title row remains visible. */
  collapsed?: boolean
  /** Called when the user clicks the collapse chevron; applyToAll = Ctrl/Cmd+click or right-click. */
  onToggleCollapse?: (applyToAll: boolean) => void
}

/** Fixed width of the label column — wide enough for "Gauntlets", "CDMG%", etc. */
const LABEL_COL_W = 72
/** Height of each filled bar track. */
const BAR_H = 14

// ── Easter egg ────────────────────────────────────────────────────────────────
// 12 distinct WAAPI animation variants for the bar chart.

type BarDance =
  | 'wave' | 'bounce' | 'wiggle' | 'collapse' | 'rainbow' | 'conga'
  | 'pop'  | 'sparkle' | 'march'  | 'chaos'    | 'topple'  | 'flip'
const BAR_DANCES: readonly BarDance[] = [
  'wave', 'bounce', 'wiggle', 'collapse', 'rainbow', 'conga',
  'pop',  'sparkle', 'march',  'chaos',    'topple',  'flip',
]

/**
 * Apply a random WAAPI dance to the bar chart container and its row elements.
 * All animations run on the compositor thread — no React re-renders needed.
 */
function triggerBarDance(container: HTMLElement, rows: ReadonlyMap<number | string, HTMLElement>): void {
  const variant = BAR_DANCES[Math.floor(Math.random() * BAR_DANCES.length)]!
  const rowEls = [...rows.values()]
  const n = rowEls.length
  if (n === 0 && variant !== 'bounce' && variant !== 'wiggle' && variant !== 'rainbow' && variant !== 'flip') return

  switch (variant) {
    case 'wave':
      // Rows undulate up and down with a travelling phase offset — sine ripple.
      rowEls.forEach((el, i) =>
        el.animate(
          [
            { transform: 'translateY(0)' },
            { transform: `translateY(${i % 2 === 0 ? -8 : 8}px)`, offset: 0.4 },
            { transform: 'translateY(0)' },
          ],
          { duration: 380, delay: i * 45, iterations: 3, easing: easingSnappy },
        ),
      )
      break

    case 'bounce':
      // Whole container pops up then slams back down — satisfying thud.
      container.animate(
        [
          { transform: 'translateY(0)' },
          { transform: 'translateY(-18px)', offset: 0.35 },
          { transform: 'translateY(0)' },
        ],
        { duration: 450, iterations: 3, easing: easingSlam },
      )
      break

    case 'wiggle':
      // Container sways left-right like it's having an opinion.
      container.animate(
        [
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(-4deg)', offset: 0.15 },
          { transform: 'rotate(4deg)',  offset: 0.45 },
          { transform: 'rotate(-2.5deg)', offset: 0.65 },
          { transform: 'rotate(2.5deg)',  offset: 0.8  },
          { transform: 'rotate(0deg)' },
        ],
        { duration: 700, iterations: 2, easing: 'ease-in-out' },
      )
      break

    case 'collapse':
      // Each row's width collapses to near-zero then springs back — like a folding accordion.
      rowEls.forEach((el, i) =>
        el.animate(
          [
            { transform: 'scaleX(1)',    transformOrigin: 'left center' },
            { transform: 'scaleX(0.05)', transformOrigin: 'left center', offset: 0.4 },
            { transform: 'scaleX(1)',    transformOrigin: 'left center' },
          ],
          { duration: 550, delay: i * 35, iterations: 2, easing: easingSlam },
        ),
      )
      break

    case 'rainbow':
      // Full hue-rotate sweep — the stat bars cycle through the color wheel.
      container.animate(
        [
          { filter: 'hue-rotate(0deg)' },
          { filter: 'hue-rotate(360deg)' },
        ],
        { duration: 900, iterations: 3, easing: 'linear' },
      )
      break

    case 'conga':
      // Staggered translateX — rows shuffle to the right in a conga line.
      rowEls.forEach((el, i) =>
        el.animate(
          [
            { transform: 'translateX(0)' },
            { transform: 'translateX(14px)', offset: 0.4 },
            { transform: 'translateX(0)' },
          ],
          { duration: 320, delay: i * 60, iterations: 3, easing: easingSnappy },
        ),
      )
      break

    case 'pop':
      // Each row briefly scale-pops, staggered — like popcorn going off.
      rowEls.forEach((el, i) =>
        el.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.09)', offset: 0.35 },
            { transform: 'scale(1)' },
          ],
          { duration: 280, delay: i * 55, iterations: 2, easing: easingSlam },
        ),
      )
      break

    case 'sparkle':
      // Rapid brightness flash fires down the rows in a bright sparkle sequence.
      rowEls.forEach((el, i) =>
        el.animate(
          [
            { filter: 'brightness(1)' },
            { filter: 'brightness(2.8)', offset: 0.3 },
            { filter: 'brightness(1)' },
          ],
          { duration: 220, delay: i * 70, easing: 'ease-out' },
        ),
      )
      break

    case 'march':
      // All rows slide right and return together — synchronized parade step.
      rowEls.forEach((el) =>
        el.animate(
          [
            { transform: 'translateX(0)' },
            { transform: 'translateX(22px)', offset: 0.45 },
            { transform: 'translateX(0)' },
          ],
          { duration: 500, iterations: 2, easing: easingSnappy },
        ),
      )
      break

    case 'chaos':
      // Each row jitters to a random position then settles back — pure disorder.
      rowEls.forEach((el, i) => {
        const dx = (((i * 7919) % 40) - 20)  // deterministic pseudo-random per row
        const dy = (((i * 6271) % 20) - 10)
        el.animate(
          [
            { transform: 'translate(0, 0)' },
            { transform: `translate(${dx}px, ${dy}px)`, offset: 0.35 },
            { transform: `translate(${-dx * 0.5}px, ${-dy * 0.5}px)`, offset: 0.7 },
            { transform: 'translate(0, 0)' },
          ],
          { duration: 500, easing: easingSnappy },
        )
      })
      break

    case 'topple':
      // Rows progressively rotate more — like books on a shelf toppling in sequence.
      rowEls.forEach((el, i) =>
        el.animate(
          [
            { transform: 'rotate(0deg)', transformOrigin: 'left bottom' },
            { transform: `rotate(${(i + 1) * 4}deg)`, transformOrigin: 'left bottom', offset: 0.45 },
            { transform: 'rotate(0deg)', transformOrigin: 'left bottom' },
          ],
          { duration: 600, delay: i * 40, easing: easingSlam },
        ),
      )
      break

    case 'flip':
      // Container flips on the X axis — dramatic perspective flip.
      container.animate(
        [
          { transform: 'perspective(400px) rotateX(0deg)'   },
          { transform: 'perspective(400px) rotateX(180deg)', offset: 0.5 },
          { transform: 'perspective(400px) rotateX(360deg)' },
        ],
        { duration: 900, iterations: 2, easing: 'ease-in-out' },
      )
      break
  }
}

export function GearAnalyticsBar({ title, description, data, selected, onToggle, height = 240, accentColor, baseColor, colorById, readOnly = false, onEasterEgg, peerDanceTrigger, collapsed, onToggleCollapse }: Props) {
  const theme = useTheme()
  const primary = accentColor ?? (theme.vars?.palette.primary.main ?? theme.palette.primary.main)
  // alpha() crashes on CSS var strings; use channel token for the default case.
  const fadedBase = baseColor != null ? alpha(baseColor, 0.35) : 'rgba(var(--mui-palette-primary-lightChannel) / 0.35)'
  const hasSelection = selected.size > 0
  // Normalise bar widths against the tallest bar in the current data.
  const maxCount = data.reduce((m, e) => Math.max(m, e.count), 0)

  // Easter egg refs — container for whole-chart effects, rowRefs for per-row effects.
  const containerRef = useRef<HTMLDivElement>(null)
  const rowRefsRef   = useRef<Map<number | string, HTMLElement>>(new Map())
  const recordClick  = useEasterEggTrigger()

  // Peer reaction: sympathetic animation when a sibling component fires its Easter egg.
  useEffect(() => {
    if (!peerDanceTrigger || !containerRef.current) return
    triggerBarDance(containerRef.current, rowRefsRef.current)
  }, [peerDanceTrigger])

  if (data.length === 0) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
        <Typography variant="caption" color="text.secondary">{title}: —</Typography>
      </Box>
    )
  }

  return (
    <Box>
      {/* Title row — chevron toggles collapse; tooltip on the label when a description is provided. */}
      <GearAnalyticsChartHeader title={title} description={description} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      <Collapse in={!collapsed} timeout="auto">
      <Box ref={containerRef}>
        {data.map((entry) => {
          const isSelected = selected.has(entry.id)
          // When nothing is selected all bars use the full accent color;
          // when a selection is active, deselected bars dim to a faded base color.
          const barColor = !hasSelection ? primary : isSelected ? primary : fadedBase
          const barPct = maxCount > 0 ? (entry.count / maxCount) * 100 : 0
          return (
            <Box
              key={entry.id}
              ref={(el) => {
                // Track each row for per-row WAAPI effects.
                if (el) rowRefsRef.current.set(entry.id, el as HTMLElement)
                else rowRefsRef.current.delete(entry.id)
              }}
              onClick={readOnly ? undefined : () => {
                // Easter egg: 10 rapid clicks on the same bar triggers a dance.
                // Return immediately so the 10th click doesn't also toggle the filter.
                if (recordClick(entry.id) && containerRef.current) {
                  triggerBarDance(containerRef.current, rowRefsRef.current)
                  // Notify parent so sibling components can react.
                  onEasterEgg?.()
                  return
                }
                onToggle(entry.id)
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                // Only show pointer/hover cues when the row is interactive.
                cursor: readOnly ? 'default' : 'pointer',
                py: 0.25,
                ...(!readOnly && { '&:hover .bar-track': { filter: 'brightness(1.15)' } }),
              }}
            >
              {/* Stat label — EllipsisTooltip reveals the full name when text is clipped. */}
              <EllipsisTooltip title={entry.label}>
                <Box
                  component="span"
                  sx={{
                    width: LABEL_COL_W,
                    flexShrink: 0,
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 11,
                    // Selected: primary to confirm selection. Unselected: per-stat color, then secondary.
                    color: isSelected ? 'primary.main' : (colorById?.(entry.id) ?? 'text.secondary'),
                    fontWeight: isSelected ? 600 : 400,
                    lineHeight: 1.2,
                  }}
                >
                  {entry.label}
                </Box>
              </EllipsisTooltip>
              {/* Bar track: neutral background + filled segment. */}
              <Box
                className="bar-track"
                sx={{ flex: 1, height: BAR_H, position: 'relative', bgcolor: 'action.hover', borderRadius: 0.5, overflow: 'hidden' }}
              >
                <Box sx={{ width: `${barPct}%`, height: '100%', bgcolor: barColor, transition: 'width 0.15s' }} />
              </Box>
              {/* Raw count to the right of the track. */}
              <Typography
                sx={{ fontSize: 10, width: 36, textAlign: 'right', color: 'text.secondary', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
              >
                {entry.count}
              </Typography>
            </Box>
          )
        })}
      </Box>
      </Collapse>
    </Box>
  )
}
