import type { ReactNode } from 'react'
import { Box, Chip } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { createBuilderStatusChipSx } from './builderStatusChipStyles'
import MarkdownTooltip from './MarkdownTooltip'

/**
 * One glyph-only toggle chip: the visible label is just the glyph, so the full label and
 * hint live in the tooltip.
 *
 * This is the single definition of the compact flag-toggle chip. It backs the safeguard
 * panel's ignore toggles and group-scope toggles AND the recipe panel's behaviour flags,
 * so every such row is pixel-identical by construction — state, handlers and the optional
 * override badge come in as props rather than being closed over.
 */
export type BuilderGlyphToggleChipProps = {
  /** The single character shown on the chip; the same glyph its rule-chip badge shows. */
  glyph: string
  /** Full name, used for the tooltip title and the accessible label. */
  label: string
  /** Explanatory body text shown under the label in the tooltip. */
  hint: string
  /** Whether the toggle currently reads as on (green). */
  active: boolean
  /** True when a multi-edit selection disagrees about this toggle. */
  mixed?: boolean
  /** Rendered next to the chip when an overrides block is driving this toggle. */
  overrideBadge?: ReactNode
  onToggle: () => void
}

export function BuilderGlyphToggleChip({
  glyph,
  label,
  hint,
  active,
  mixed = false,
  overrideBadge,
  onToggle,
}: BuilderGlyphToggleChipProps) {
  const theme = useTheme()
  // Shared builder pill styling, so these chips match every other status chip.
  const builderStatusChipSx = createBuilderStatusChipSx(theme)
  // Mixed-state colours come from theme.custom tokens (CSS-variable backed, no alpha()).
  const mixedBorderColor = theme.custom.multiEditMixedBorder
  const mixedPatternColor = theme.custom.multiEditMixedBg
  const mixedTextColor = theme.custom.multiEditMixedText
  return (
    <Box sx={{ position: 'relative' }}>
      <MarkdownTooltip markdown={`**${label}**\n\n${hint}`}>
        <Chip
          size="small"
          variant="filled"
          label={glyph}
          aria-label={label}
          aria-pressed={active}
          clickable
          onClick={onToggle}
          sx={{
            // Green when enabled OR mixed — base matches the recipe builder flex chip.
            ...builderStatusChipSx(active || mixed, { dimDisabled: true }),
            // Keep the lone glyph centred with a stable near-square footprint.
            minWidth: 28,
            '& .MuiChip-label': { px: 0.75 },
            // Full mixed overlay: dashed border + hatched gradient + muted text.
            ...(mixed ? {
              borderStyle: 'dashed',
              borderColor: mixedBorderColor,
              color: mixedTextColor,
              backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
            } : {}),
          }}
        />
      </MarkdownTooltip>
      {/* Override badge: shown when an overrides block flips this toggle. */}
      {overrideBadge}
    </Box>
  )
}

export default BuilderGlyphToggleChip
