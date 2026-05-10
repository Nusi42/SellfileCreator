import React from 'react'
import { HexColorPicker, HexAlphaColorPicker } from 'react-colorful'
import { Box, Button, Popover, Typography, TextField } from '@mui/material'
import { COLOR_FIELD_BUTTON_MAX_WIDTH_PX, ELLIPSIS_TEXT_SX } from '../lib/constants'
import EllipsisTooltip from './EllipsisTooltip'
import { useRecentColors, addRecentColor } from '../state/recentColorsPreference'

/** Default starting color used when opening the picker without a prior selection. */
export const COLOR_FIELD_DEFAULT_VALUE = '#90CAF9'

/** Pads a 6-char hex to 8-char by appending full opacity — needed for HexAlphaColorPicker. */
const pad8 = (hex: string): string => (hex.length === 7 ? `${hex}ff` : hex)

/** Returns true if `value` is a valid hex color for the given alpha mode. */
const isValidHex = (value: string, allowAlpha: boolean): boolean => {
  const pattern = allowAlpha ? /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/ : /^#[0-9a-fA-F]{6}$/
  return pattern.test(value)
}

function ColorPickerContent({
  initialValue,
  allowAlpha,
  onCommit,
  onClose,
}: {
  initialValue: string
  allowAlpha: boolean
  onCommit: (value: string) => boolean
  onClose: () => void
}) {
  // pickerColor is always a valid hex fed to the gradient picker.
  const [pickerColor, setPickerColor] = React.useState(() =>
    allowAlpha ? pad8(initialValue) : initialValue
  )
  // draft is the raw text-field value and may be partial while typing.
  const [draft, setDraft] = React.useState(initialValue)
  const recentColors = useRecentColors()

  /** Commits live on every drag step — callers that need throttling use onChangeCommitted. */
  const handlePickerChange = (color: string) => {
    setPickerColor(color)
    setDraft(color)
    onCommit(color)
  }

  /** Handles text-field edits; syncs the picker when the input becomes a valid hex. */
  const handleDraftChange = (value: string) => {
    setDraft(value)
    const withHash = value.startsWith('#') ? value : `#${value}`
    if (isValidHex(withHash, allowAlpha)) {
      setPickerColor(allowAlpha ? pad8(withHash) : withHash)
    }
  }

  /** Clicking a recent-color swatch commits and closes immediately. */
  const handleSwatchClick = (color: string) => {
    setPickerColor(allowAlpha ? pad8(color) : color)
    setDraft(color)
    const committed = onCommit(color)
    if (committed) onClose()
  }

  const handleOk = () => {
    const committed = onCommit(draft)
    if (committed) onClose()
  }

  const Picker = allowAlpha ? HexAlphaColorPicker : HexColorPicker

  return (
    <Box sx={{ p: 1.5, width: 260 }}>
      {/* Gradient + hue (+ alpha) slider */}
      <Picker color={pickerColor} onChange={handlePickerChange} style={{ width: '100%' }} />

      {/* Recent-color swatches — only shown once the user has committed at least one color */}
      {recentColors.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
          {recentColors.map((c) => (
            <Box
              key={c}
              onClick={() => handleSwatchClick(c)}
              title={c}
              sx={{
                flex: 1,
                height: 20,
                borderRadius: 0.5,
                bgcolor: c,
                border: '1px solid',
                borderColor: 'divider',
                cursor: 'pointer',
              }}
            />
          ))}
        </Box>
      )}

      {/* Manual hex input + OK */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
        <TextField
          size="small"
          label={allowAlpha ? '#RRGGBB[AA]' : '#RRGGBB'}
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onBlur={() => { onCommit(draft) }}
          sx={{ flex: 1 }}
        />
        <Button size="small" variant="contained" onClick={handleOk}>OK</Button>
      </Box>
    </Box>
  )
}

export function ColorField({
  value,
  onChange,
  onChangeCommitted,
  label,
  allowAlpha = false,
}: {
  value: string
  onChange: (v: string) => void
  /** Fired once when the popover closes, with the final committed color — analogous to MUI
   *  Slider's onChangeCommitted. Use this to throttle expensive parent re-renders. */
  onChangeCommitted?: (v: string) => void
  label?: string
  allowAlpha?: boolean
}) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null)
  const open = Boolean(anchorEl)

  // Tracks the last committed color so we can pass it to onChangeCommitted on close.
  const lastCommittedRef = React.useRef<string | null>(null)

  const handleOpen = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    lastCommittedRef.current = null
    setAnchorEl(e.currentTarget)
  }, [])

  const commit = React.useCallback((raw: string): boolean => {
    const valueWithHash = raw.startsWith('#') ? raw : `#${raw}`
    const pattern = allowAlpha ? /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/ : /^#([0-9a-fA-F]{6})$/
    if (!pattern.test(valueWithHash)) return false
    onChange(valueWithHash)
    lastCommittedRef.current = valueWithHash
    return true
  }, [allowAlpha, onChange])

  const handleClose = React.useCallback(() => {
    if (lastCommittedRef.current !== null) {
      addRecentColor(lastCommittedRef.current)
      // Signal that the interaction is done, same role as MUI Slider's onChangeCommitted.
      onChangeCommitted?.(lastCommittedRef.current)
      lastCommittedRef.current = null
    }
    setAnchorEl(null)
  }, [onChangeCommitted])

  const button = (
    <Button
      size="small"
      variant="outlined"
      onClick={handleOpen}
      sx={{ minWidth: 0, px: 1, py: 0.25, borderColor: value, color: value, bgcolor: '#0000', maxWidth: COLOR_FIELD_BUTTON_MAX_WIDTH_PX, overflow: 'hidden', justifyContent: 'flex-start' }}
    >
      <Box sx={{ width: 16, height: 16, borderRadius: 0.5, bgcolor: value, border: '1px solid', borderColor: 'divider', mr: 0.75, flexShrink: 0 }} />
      {label ? (
        <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX} data-ellipsis-target>
          {label}
        </Typography>
      ) : null}
    </Button>
  )
  return (
    <>
      {label ? <EllipsisTooltip title={label}>{button}</EllipsisTooltip> : button}
      <Popover open={open} onClose={handleClose} anchorEl={anchorEl} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        {open ? (
          <ColorPickerContent
            key={allowAlpha ? 'alpha' : 'solid'}
            initialValue={value}
            allowAlpha={allowAlpha}
            onCommit={commit}
            onClose={handleClose}
          />
        ) : null}
      </Popover>
    </>
  )
}

export default ColorField
/**
 * ColorField
 *
 * Color input with preview swatch, gradient/hue picker, and recent-color quick-picks.
 *
 * onChange fires on every picker drag step (live).
 * onChangeCommitted fires once when the popover closes — use it the same way MUI Slider's
 * onChangeCommitted is used: to throttle expensive re-renders in the parent while still
 * showing live updates inside the picker itself.
 */
