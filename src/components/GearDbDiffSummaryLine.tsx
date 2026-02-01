/**
 * GearDbDiffSummaryLine
 *
 * Shared summary line renderer for Gear DB diff counts with icon glyphs.
 */
import type { ReactNode } from 'react'
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
        bgcolor: alpha(theme.palette.common.black, 0.25),
        borderRadius: '999px',
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
          <AddCircleOutlineIcon fontSize={iconSize} sx={{ color: theme.palette.success.main }} />
          <Box component="span">{addedCount}</Box>
        </Box>
        {/* Separator keeps the line compact without extra words. */}
        <Box component="span" sx={{ color: theme.palette.text.secondary }}>
          {'/'}
        </Box>
        {/* Removed count uses the error glyph for quick scanning. */}
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.35 }}>
          <RemoveCircleOutlineIcon fontSize={iconSize} sx={{ color: theme.palette.error.main }} />
          <Box component="span">{removedCount}</Box>
        </Box>
        {/* Separator keeps the line compact without extra words. */}
        <Box component="span" sx={{ color: theme.palette.text.secondary }}>
          {'/'}
        </Box>
        {/* Updated count uses an info glyph to signal mutation. */}
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.35 }}>
          <AutorenewIcon fontSize={iconSize} sx={{ color: theme.palette.info.main }} />
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
  const nodes: Array<SummaryLineNode | null> = lineSpecs.map((spec) => {
    if (spec.kind === 'diff') {
      return (
        <GearDbDiffSummaryLine
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
