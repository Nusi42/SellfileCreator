/**
 * GearDbDiffSummaryLine
 *
 * Shared summary line renderer for Gear DB diff counts with icon glyphs.
 */
import type { JSX, ReactNode } from 'react'
import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { alpha, useTheme } from '@mui/material/styles'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import type { GearDbDiffHistoryLineSpec, GearDbDiffHistoryLineTranslator } from '../lib/gearDbDiffToast'
import { formatGearDbDiffHistoryLineText } from '../lib/gearDbDiffToast'

export type GearDbDiffSummaryLineProps = {
  // Localized prefix label (ex: "Gear updated:") shown before the counts.
  label: string
  // Number of items added in the diff.
  addedCount: number
  // Number of items removed in the diff.
  removedCount: number
  // Number of items updated in the diff.
  updatedCount: number
  // Icon size override so callers can sync with Typography sizing.
  iconSize?: 'inherit' | 'small' | 'medium' | 'large'
  // Optional styling overrides for the root span.
  sx?: SxProps<Theme>
  // When true, render a pill behind the full count block for contrast.
  useCountPill?: boolean
}

/**
 * Render a compact "added / removed / updated" line with Material glyphs.
 */
export function GearDbDiffSummaryLine({
  label,
  addedCount,
  removedCount,
  updatedCount,
  iconSize = 'inherit',
  sx,
  useCountPill = false,
}: GearDbDiffSummaryLineProps) {
  // Theme colors keep the icons aligned with existing success/error tones.
  const theme = useTheme()
  // Success toasts need extra contrast so icon glyphs read on green.
  const useHighContrast = useCountPill
  // Precompute the palette for glyphs and separators so callers stay lightweight.
  const addedColor = useHighContrast ? theme.palette.common.white : theme.palette.success.main
  const removedColor = useHighContrast ? theme.palette.common.white : theme.palette.error.main
  const updatedColor = useHighContrast ? theme.palette.common.white : theme.palette.info.main
  const separatorColor = useHighContrast ? alpha(theme.palette.common.white, 0.7) : theme.palette.text.secondary
  // Normalize the label to avoid accidental whitespace in tight layouts.
  const trimmedLabel = label.trim()
  // Use a darker overlay so the pill reads against a green success toast.
  const countBlockSx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    flexShrink: 0,
    ...(useCountPill
      ? {
        // Darken + outline so counts remain legible on the success fill.
        bgcolor: alpha(theme.palette.common.black, 0.4),
        border: `1px solid ${alpha(theme.palette.common.white, 0.4)}`,
        borderRadius: '999px',
        color: theme.palette.common.white,
        px: 0.6,
        py: 0.15,
      }
      : null),
  }

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        minWidth: 0,
        ...sx,
      }}
    >
      {/* Render the label only when it has content. */}
      {trimmedLabel ? (
        <Box component="span" sx={{ flexShrink: 0 }}>
          {trimmedLabel}
        </Box>
      ) : null}
      {/* Group the counts so a single pill can sit behind the whole block. */}
      <Box component="span" sx={countBlockSx}>
        {/* Added count uses the success glyph for quick scanning. */}
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.35 }}>
          <AddCircleOutlineIcon fontSize={iconSize} sx={{ color: addedColor }} />
          <Box component="span">{addedCount}</Box>
        </Box>
        {/* Separator keeps the line compact without extra words. */}
        <Box component="span" sx={{ color: separatorColor }}>
          {'/'}
        </Box>
        {/* Removed count uses the error glyph for quick scanning. */}
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.35 }}>
          <RemoveCircleOutlineIcon fontSize={iconSize} sx={{ color: removedColor }} />
          <Box component="span">{removedCount}</Box>
        </Box>
        {/* Separator keeps the line compact without extra words. */}
        <Box component="span" sx={{ color: separatorColor }}>
          {'/'}
        </Box>
        {/* Updated count uses an info glyph to signal mutation. */}
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.35 }}>
          <AutorenewIcon fontSize={iconSize} sx={{ color: updatedColor }} />
          <Box component="span">{updatedCount}</Box>
        </Box>
      </Box>
    </Box>
  )
}

/**
 * Convert line specs into renderable nodes, swapping diff lines for icon rows.
 */
export const buildGearDbDiffSummaryLineNodes = (
  lineSpecs: GearDbDiffHistoryLineSpec[],
  t: GearDbDiffHistoryLineTranslator,
  options?: { useCountPill?: boolean },
): ReactNode[] => {
  // Localize the label once so each diff line reuses the same prefix.
  const diffLabel = t('toastGearDbDiffSummaryLabel')
  // Constrain the node union so type guards can be precise.
  type SummaryLineNode = JSX.Element | string
  // Only enable the count pill when a caller explicitly requests it.
  const useCountPill = options?.useCountPill ?? false
  // Map each spec to a UI-ready node, trimming empty text rows.
  // Track per-kind occurrence counts so composite keys stay unique
  // even when multiple specs share the same discriminant.
  const kindCounts: Record<string, number> = {}
  const nodes: Array<SummaryLineNode | null> = lineSpecs.map((spec) => {
    const kindOcc = (kindCounts[spec.kind] = (kindCounts[spec.kind] ?? 0) + 1)
    if (spec.kind === 'diff') {
      return (
        <GearDbDiffSummaryLine
          key={`${spec.kind}-${kindOcc}`}
          label={diffLabel}
          addedCount={spec.addedCount}
          removedCount={spec.removedCount}
          updatedCount={spec.updatedCount}
          useCountPill={useCountPill}
        />
      )
    }
    const lineText = formatGearDbDiffHistoryLineText(spec, t)
    const trimmed = (lineText ?? '').trim()
    return trimmed.length > 0 ? trimmed : null
  })
  // Drop null/empty rows so layout stays compact.
  return nodes.filter((node): node is SummaryLineNode => node !== null && node !== '')
}
