import React from 'react'
import { Box, MenuItem, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import MarkdownTooltip from './MarkdownTooltip'
import { MenuCheckButton } from './MenuCheckButton'

type MenuToggleRowProps = {
  label: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
  // Markdown string to show in a MarkdownTooltip wrapping the label.
  tooltip?: string
  // Replaces the default Typography sx ({ flex: 1, minWidth: 0 }).
  labelSx?: SxProps<Theme>
  // Extra sx merged onto the MenuItem (e.g. mt: 0.5 for visual grouping).
  menuItemSx?: SxProps<Theme>
  // Optional control rendered after the check button (e.g. a Manage Colors icon button).
  // When present, both controls are wrapped in a stopPropagation Box so row-area clicks
  // still fire onChange but clicks inside the box do not double-fire.
  trailing?: React.ReactNode
}

/**
 * Standard context-menu row for a boolean preference.
 * Renders a label on the left and a MenuCheckButton on the right, inside a MenuItem.
 * Clicking anywhere on the row (including the button itself) fires onChange exactly once.
 */
export function MenuToggleRow({
  label,
  checked,
  onChange,
  disabled,
  tooltip,
  labelSx,
  menuItemSx,
  trailing,
}: MenuToggleRowProps) {
  const labelEl = (
    <Typography variant="body2" sx={{ flex: 1, minWidth: 0, ...labelSx }}>
      {label}
    </Typography>
  )
  return (
    <MenuItem
      sx={{ gap: 1, alignItems: 'center', ...menuItemSx }}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange() }}
    >
      {tooltip ? (
        <MarkdownTooltip markdown={tooltip} placement="top-start">
          {labelEl}
        </MarkdownTooltip>
      ) : labelEl}
      {trailing ? (
        // Box absorbs clicks so only specific buttons inside it fire their own handlers.
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
          <MenuCheckButton checked={checked} onChange={onChange} {...(disabled !== undefined ? { disabled } : {})} />
          {trailing}
        </Box>
      ) : (
        <MenuCheckButton checked={checked} onChange={onChange} {...(disabled !== undefined ? { disabled } : {})} />
      )}
    </MenuItem>
  )
}
