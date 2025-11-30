import * as React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { SxProps, Theme } from '@mui/material/styles'
import type { TypographyProps } from '@mui/material/Typography'

export type EmptyStateMessageProps = {
  children: React.ReactNode
  icon?: React.ReactNode
  borderVariant?: 'none' | 'dashed'
  minHeight?: number | string
  typographyVariant?: TypographyProps['variant']
  sx?: SxProps<Theme>
}

/**
 * Consistent placeholder layout keeps every empty panel centered and readable.
 * The wrapper also accepts custom chrome so previews, grids, and dialogs stay in sync.
 */
export function EmptyStateMessage({
  children,
  icon,
  borderVariant = 'none',
  minHeight = 'auto',
  typographyVariant = 'body2',
  sx,
}: EmptyStateMessageProps) {
  // Base flex styles ensure icons/text stack nicely and stay centered.
  const baseStyles = (theme: Theme) => ({
    width: '100%',
    minHeight,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const,
    color: theme.palette.text.secondary,
    px: 2,
    py: 3,
    ...(borderVariant === 'dashed'
      ? {
          borderRadius: theme.shape.borderRadius,
          border: '1px dashed',
          borderColor: theme.palette.divider,
        }
      : {}),
  })
  // SxProps can be arrays/objects; normalize so downstream callers can extend styling.
  const extraStyles = Array.isArray(sx) ? sx : sx ? [sx] : []

  return (
    <Box sx={[baseStyles, ...extraStyles]}>
      {icon ? (
        <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </Box>
      ) : null}
      <Typography variant={typographyVariant} color="inherit">
        {children}
      </Typography>
    </Box>
  )
}

export default EmptyStateMessage
