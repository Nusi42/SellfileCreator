/**
 * PinnedPresetButtons.tsx
 *
 * Compact, icon-only quick-toggle buttons rendered next to the Filter / Sort
 * buttons in the preview header. Each represents a pinned preset: clicking applies
 * it, clicking while it is the active state clears it (Apply ⇄ Clear). Presentational
 * only — the parent resolves names/glyphs/active state and decides apply-vs-clear.
 */
import { Box, Button } from '@mui/material'
import { COMPACT_HEADER_ACTION_BUTTON_BASE_SX } from '../lib/constants'
import MarkdownTooltip from './MarkdownTooltip'

/** One pinned-preset button, fully resolved by the parent. */
export type PinnedPresetButtonDescriptor = {
  id: string
  // Display name used for tooltip + accessible label.
  name: string
  // Glyph face (catalog glyph, or a name-derived fallback when the preset has no icon).
  glyph: string
  // Optional user color tint applied to the glyph, mirroring the preset menu label.
  color?: string
  // Whether this preset is the currently-applied state (drives styling + clear-vs-apply).
  active: boolean
  // When true, this individual button is disabled (e.g. a preset that has no effect on the
  // current panel). Combined with the row-level `disabled` prop below.
  disabled?: boolean
}

export type PinnedPresetButtonsProps = {
  buttons: readonly PinnedPresetButtonDescriptor[]
  // Disables the whole row (e.g. sort presets while in Rules mode).
  disabled?: boolean
  // Fired on click with the current active flag so the parent applies (inactive) or clears (active).
  onToggle: (id: string, active: boolean) => void
  // Accessible label builder; receives the resolved name + active state.
  ariaLabel: (name: string, active: boolean) => string
  // Tooltip markdown builder; receives the resolved name + active state.
  tooltip: (name: string, active: boolean) => string
}

/** Renders the row of pinned quick-toggle buttons; empty input renders nothing. */
export function PinnedPresetButtons({ buttons, disabled, onToggle, ariaLabel, tooltip }: PinnedPresetButtonsProps) {
  // Nothing pinned (or none visible) → render nothing so the header stays tight.
  if (buttons.length === 0) return null
  return (
    <Box
      // Wrap onto additional lines rather than scrolling/overflowing when many presets are pinned.
      sx={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, minWidth: 0, flexShrink: 1 }}
    >
      {buttons.map((b) => (
        <MarkdownTooltip key={b.id} markdown={tooltip(b.name, b.active)}>
          <Button
            size="small"
            variant={b.active ? 'contained' : 'outlined'}
            color="success"
            // Row-level disable (e.g. sort presets in Rules mode) OR a per-button disable.
            disabled={disabled || b.disabled}
            aria-pressed={b.active}
            aria-label={ariaLabel(b.name, b.active)}
            onClick={() => onToggle(b.id, b.active)}
            // Square, icon-sized footprint shared with the other compact header buttons.
            sx={{ ...COMPACT_HEADER_ACTION_BUTTON_BASE_SX, minWidth: 0, width: 32, px: 0, flexShrink: 0 }}
          >
            <Box
              component="span"
              aria-hidden
              // Apply the optional preset color to the glyph; otherwise inherit the button text color.
              sx={{ fontSize: 16, lineHeight: 1, ...(b.color ? { color: b.color } : {}) }}
            >
              {b.glyph}
            </Box>
          </Button>
        </MarkdownTooltip>
      ))}
    </Box>
  )
}
