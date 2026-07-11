// SeparatorDividerRow — the divider row rendered inside a separator chip.
// Shared by RecipeChip and SafeguardChipsPanel so the two lists render the
// exact same separator look (line style/width/alpha from the shared decoration).
import type React from 'react'
import { Box, Typography } from '@mui/material'
import type { SeparatorDividerDecoration } from '../lib/separators'
import { ensureContrastOnBg } from '../lib/colorUtils'

export function SeparatorDividerRow({ decoration, surfaceBg, onDoubleClick }: {
  decoration: SeparatorDividerDecoration
  /** Effective chip background — the label color is contrast-adapted against it. */
  surfaceBg: string
  /** Optional rename affordance (safeguard list inline edit); omitted on the recipe side. */
  onDoubleClick?: React.MouseEventHandler<HTMLElement>
}) {
  // One immutable line element reused on both sides of the label.
  const line = (
    <Box sx={{
      flexGrow: 1,
      minWidth: decoration.minLineWidthPx,
      borderBottom: `${decoration.borderWidthPx}px ${decoration.borderStyle} ${decoration.lineColor}`,
    }}
    />
  )
  return (
    <Box
      onDoubleClick={onDoubleClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        gap: decoration.hasLabel ? 1.5 : 0,
        minHeight: 20,
      }}
    >
      {decoration.hasLabel ? (
        <>
          {line}
          <Typography
            variant="caption"
            sx={{
              flex: '0 1 auto',
              maxWidth: '100%',
              px: 1,
              textAlign: 'center',
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              fontWeight: 600,
              minWidth: 0,
              // Separator label is a user color rendered as text — contrast-adapt to the surface.
              color: ensureContrastOnBg(decoration.textColor, surfaceBg),
            }}
          >
            {decoration.displayName}
          </Typography>
          {line}
        </>
      ) : line}
    </Box>
  )
}
