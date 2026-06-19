import { MenuItem, Typography } from '@mui/material'
import type { ButtonProps, SxProps, Theme } from '@mui/material'
import type { CycleButtonOption } from './CycleButton'
import { CycleButton } from './CycleButton'
import MarkdownTooltip from './MarkdownTooltip'
import { MENU_CONTROL_HEIGHT_PX, MENU_CONTROL_MIN_WIDTH_PX } from '../lib/constants'

type MenuCycleRowProps = {
  label: string
  options: ReadonlyArray<CycleButtonOption>
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  /** @default 'contained' */
  variant?: ButtonProps['variant']
  /** @default 'success' */
  color?: ButtonProps['color']
  // Markdown string to show in a MarkdownTooltip wrapping the label.
  tooltip?: string
  // Replaces the default Typography sx ({ flex: 1, minWidth: 0 }).
  labelSx?: SxProps<Theme>
  // Override the cycle button's min width (default MENU_CONTROL_MIN_WIDTH_PX) — used when a row
  // needs to line up with a wider sibling control (e.g. the 5-button rating row).
  controlMinWidth?: number
}

/**
 * Standard context-menu row for an N-state option (N >= 2).
 * Clicking anywhere on the row (including the label area) advances to the next option,
 * matching the MenuItem onClick pattern used by MenuToggleRow.
 * CycleButton additionally supports directional prev/next clicking within its own bounds.
 */
export function MenuCycleRow({
  label,
  options,
  value,
  onChange,
  disabled,
  variant = 'contained',
  color = 'success',
  tooltip,
  labelSx,
  controlMinWidth = MENU_CONTROL_MIN_WIDTH_PX,
}: MenuCycleRowProps) {
  const handleRowClick = () => {
    const currentIdx = options.findIndex((o) => o.value === value)
    const nextIdx = (currentIdx + 1) % options.length
    onChange(options[nextIdx]!.value)
  }
  const labelEl = (
    <Typography variant="body2" sx={{ flex: 1, minWidth: 0, ...labelSx }}>
      {label}
    </Typography>
  )
  return (
    <MenuItem sx={{ gap: 1, alignItems: 'center' }} disabled={disabled} onClick={(e) => { e.stopPropagation(); handleRowClick() }}>
      {tooltip ? (
        <MarkdownTooltip markdown={tooltip} placement="top-start">
          {labelEl}
        </MarkdownTooltip>
      ) : labelEl}
      <CycleButton
        options={options}
        value={value}
        onChange={onChange}
        {...(disabled !== undefined ? { disabled } : {})}
        variant={variant}
        color={color}
        sx={{ minWidth: controlMinWidth, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX }}
      />
    </MenuItem>
  )
}
