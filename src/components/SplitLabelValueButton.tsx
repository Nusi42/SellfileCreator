import React from 'react'
import { Box, Button, Typography } from '@mui/material'
import type { ButtonProps } from '@mui/material/Button'
import type { SxProps, Theme } from '@mui/material/styles'

// A small helper for filter toggles that must render a fixed label + a centered value.
// The fixed right-column width prevents the button from "jumping" as values change.
export type SplitLabelValueButtonProps = Omit<ButtonProps, 'children'> & {
  // Left side: the stable, descriptive label (e.g. "Config Filter").
  label: React.ReactNode
  // Right side: the current value (e.g. "Off" / "First-Match" / "Any-Match").
  value: React.ReactNode
  // Fixed width for the value cell, in `ch`, to keep button width stable across states.
  valueWidthCh?: number
  // Optional extra styles for the inner grid wrapper.
  contentSx?: SxProps<Theme>
}

export default function SplitLabelValueButton({
  label,
  value,
  valueWidthCh,
  contentSx,
  sx,
  ...buttonProps
}: SplitLabelValueButtonProps) {
  // Use a 2-column grid so the left label stays left-aligned while the value stays centered.
  // `valueWidthCh` locks the second column width so the button never reflows across states.
  const gridTemplateColumns = valueWidthCh
    ? `minmax(0, 1fr) ${valueWidthCh}ch`
    : 'minmax(0, 1fr) auto'

  // MUI `outlined` buttons include a 1px border while `contained` does not, which causes
  // subtle width changes when toggling variants. Add a transparent border for `contained`
  // so the overall box size remains stable across states.
  const variant = buttonProps.variant ?? 'text'

  return (
    <Button
      {...buttonProps}
      sx={[
        // Ensure the inner layout can claim the full button width when parents constrain it.
        { justifyContent: 'stretch', boxSizing: 'border-box', ...(variant === 'contained' ? { border: '1px solid transparent' } : {}) },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        sx={[
          // The wrapper defines the 2-region layout: label on the left, value on the right.
          { display: 'grid', gridTemplateColumns, alignItems: 'center', columnGap: 0.75, width: '100%' },
          ...(Array.isArray(contentSx) ? contentSx : [contentSx]),
        ]}
      >
        <Typography
          component="span"
          // Keep the label readable while allowing truncation in narrow layouts.
          sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}
        >
          {label}
        </Typography>
        <Typography
          component="span"
          // The value stays centered inside its fixed-width cell for consistent visual rhythm.
          sx={{ display: 'block', textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 600 }}
        >
          {value}
        </Typography>
      </Box>
    </Button>
  )
}
