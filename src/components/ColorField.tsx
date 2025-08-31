import React from 'react'
import { Box, Button, Popover, Typography, TextField } from '@mui/material'

export function ColorField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null)
  const [hex, setHex] = React.useState(value)
  React.useEffect(() => setHex(value), [value])
  const open = Boolean(anchorEl)
  const preset = ['#90CAF9','#4FC3F7','#81C784','#66BB6A','#E57373','#FFB74D','#CE93D8','#B0BEC5','#FFD54F','#A5D6A7','#80CBC4','#F48FB1']
  const commit = (v: string) => {
    const vv = v.startsWith('#') ? v : `#${v}`
    if (/^#([0-9a-fA-F]{6})$/.test(vv)) onChange(vv)
  }
  return (
    <>
      <Button size="small" variant="outlined" onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ minWidth: 0, px: 1, py: 0.25, borderColor: value, color: value, bgcolor: '#0000' }}>
        <Box sx={{ width: 16, height: 16, borderRadius: 0.5, bgcolor: value, border: '1px solid', borderColor: 'divider', mr: 0.75 }} />
        {label}
      </Button>
      <Popover open={open} onClose={() => setAnchorEl(null)} anchorEl={anchorEl} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 1.5, width: 260 }}>
          <Typography variant="caption" sx={{ display: 'block', mb: 0.75 }}>Pick color</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 0.5 }}>
            {preset.map((c) => (
              <Box key={c} onClick={() => { commit(c); setAnchorEl(null) }} sx={{ width: 28, height: 24, borderRadius: 0.5, bgcolor: c, border: '1px solid', borderColor: 'divider', cursor: 'pointer' }} />
            ))}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <TextField size="small" label="#RRGGBB" value={hex} onChange={(e) => setHex(e.target.value)} onBlur={() => commit(hex)} sx={{ flex: 1 }} />
            <Button size="small" variant="contained" onClick={() => { commit(hex); setAnchorEl(null) }}>OK</Button>
          </Box>
        </Box>
      </Popover>
    </>
  )
}

export default ColorField

