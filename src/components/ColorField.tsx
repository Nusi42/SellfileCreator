import React from 'react'
import { Box, Button, Popover, Typography, TextField } from '@mui/material'
import { COLOR_FIELD_BUTTON_MAX_WIDTH_PX, ELLIPSIS_TEXT_SX } from '../lib/constants'

const COLOR_PRESETS = ['#90CAF9','#4FC3F7','#81C784','#66BB6A','#E57373','#FFB74D','#CE93D8','#B0BEC5','#FFD54F','#A5D6A7','#80CBC4','#F48FB1']

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
  const [draft, setDraft] = React.useState(initialValue)
  const handlePresetClick = (preset: string) => {
    const committed = onCommit(preset)
    if (committed) onClose()
  }
  const handleOk = () => {
    const committed = onCommit(draft)
    if (committed) onClose()
  }
  return (
    <Box sx={{ p: 1.5, width: 260 }}>
      <Typography variant="caption" sx={{ display: 'block', mb: 0.75 }}>Pick color</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 0.5 }}>
        {COLOR_PRESETS.map((c) => (
          <Box key={c} onClick={() => handlePresetClick(c)} sx={{ width: 28, height: 24, borderRadius: 0.5, bgcolor: c, border: '1px solid', borderColor: 'divider', cursor: 'pointer' }} />
        ))}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
        <TextField
          size="small"
          label={allowAlpha ? '#RRGGBB[AA]' : '#RRGGBB'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { onCommit(draft) }}
          sx={{ flex: 1 }}
        />
        <Button size="small" variant="contained" onClick={handleOk}>OK</Button>
      </Box>
    </Box>
  )
}

export function ColorField({ value, onChange, label, allowAlpha = false }: { value: string; onChange: (v: string) => void; label?: string; allowAlpha?: boolean }) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null)
  const open = Boolean(anchorEl)
  const handleClose = React.useCallback(() => setAnchorEl(null), [])
  const commit = React.useCallback((raw: string): boolean => {
    const valueWithHash = raw.startsWith('#') ? raw : `#${raw}`
    const pattern = allowAlpha ? /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/ : /^#([0-9a-fA-F]{6})$/
    if (!pattern.test(valueWithHash)) return false
    onChange(valueWithHash)
    return true
  }, [allowAlpha, onChange])
  return (
    <>
      <Button
        size="small"
        variant="outlined"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{ minWidth: 0, px: 1, py: 0.25, borderColor: value, color: value, bgcolor: '#0000', maxWidth: COLOR_FIELD_BUTTON_MAX_WIDTH_PX, overflow: 'hidden', justifyContent: 'flex-start' }}
        title={label}
      >
        <Box sx={{ width: 16, height: 16, borderRadius: 0.5, bgcolor: value, border: '1px solid', borderColor: 'divider', mr: 0.75, flexShrink: 0 }} />
        {label ? <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{label}</Typography> : null}
      </Button>
      <Popover open={open} onClose={handleClose} anchorEl={anchorEl} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        {open ? (
          <ColorPickerContent
            key={`${allowAlpha ? 'alpha' : 'solid'}:${value}`}
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
 * Small color input with preview, used to customize substat chip colors.
 */
