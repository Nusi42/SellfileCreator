/**
 * GearLensBar.tsx
 *
 * Custom HTML horizontal bar chart for the Gear Lens dashboard.
 * Renders one labelled bar row per entry; clicking a row toggles cross-filter selection.
 * Labels are constrained to LABEL_COL_W and clipped with EllipsisTooltip on overflow.
 */
import { alpha, Box, Tooltip, Typography, useTheme } from '@mui/material'
import { EllipsisTooltip } from '../EllipsisTooltip'

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
}

/** Fixed width of the label column — wide enough for "Gauntlets", "CDMG%", etc. */
const LABEL_COL_W = 72
/** Height of each filled bar track. */
const BAR_H = 14

export function GearLensBar({ title, description, data, selected, onToggle, height = 240, accentColor, baseColor, colorById, readOnly = false }: Props) {
  const theme = useTheme()
  const primary = accentColor ?? theme.palette.primary.main
  const base = baseColor ?? theme.palette.primary.light
  const hasSelection = selected.size > 0
  // Normalise bar widths against the tallest bar in the current data.
  const maxCount = data.reduce((m, e) => Math.max(m, e.count), 0)

  if (data.length === 0) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
        <Typography variant="caption" color="text.secondary">{title}: —</Typography>
      </Box>
    )
  }

  return (
    <Box>
      {/* Title — tooltip appears on hover when a description is provided. */}
      <Tooltip title={description ?? ''} arrow placement="top-start">
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', fontSize: '0.68rem', display: 'inline-block', mb: 0.5, cursor: description ? 'help' : 'default' }}
        >
          {title}
        </Typography>
      </Tooltip>
      <Box>
        {data.map((entry) => {
          const isSelected = selected.has(entry.id)
          // When nothing is selected all bars use the full accent color;
          // when a selection is active, deselected bars dim to a faded base color.
          const barColor = !hasSelection ? primary : isSelected ? primary : alpha(base, 0.35)
          const barPct = maxCount > 0 ? (entry.count / maxCount) * 100 : 0
          return (
            <Box
              key={entry.id}
              onClick={readOnly ? undefined : () => onToggle(entry.id)}
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
    </Box>
  )
}
