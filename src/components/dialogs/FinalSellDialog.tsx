import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, ToggleButton, Tooltip, Typography } from '@mui/material'
import { MENU_CONTROL_HEIGHT_PX } from '../../lib/constants'

export type FinalSellRemainder = {
  artifacts: boolean
  accessories: boolean
  levels: Array<0|4|8|12|16>
}

const LEVEL_CHOICES: Array<{ key: 0|4|8|12|16; label: string }> = [
  { key: 0, label: '0–3' },
  { key: 4, label: '4–7' },
  { key: 8, label: '8–11' },
  { key: 12, label: '12–15' },
  { key: 16, label: '16' },
]

export default function FinalSellDialog(props: {
  open: boolean
  value: FinalSellRemainder
  onChange: (next: FinalSellRemainder) => void
  onClose: () => void
  onReset?: () => void
}) {
  const { open, value, onChange, onClose, onReset } = props
  const toggleLevel = (lvl: 0|4|8|12|16) => {
    const next = new Set(value.levels)
    if (next.has(lvl)) next.delete(lvl); else next.add(lvl)
    onChange({ ...value, levels: Array.from(next.values()).sort((a,b)=>a-b) as Array<0|4|8|12|16> })
  }
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Final Sell Rules</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Add final Sell rules for items not matched by your Keep rules.
            <br />
            When Final Sell is on, these Sell rules include all currently known sets explicitly (shown as “All Currently Known” in the preview; exported with the full set list).
            Without Final Sell, items that do not match any rule are automatically kept. Selling only happens when a Sell rule matches.
          </Typography>
          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>Gear to Sell</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
              <ToggleButton
                value="artifacts"
                selected={value.artifacts}
                onClick={(e) => { e.preventDefault(); onChange({ ...value, artifacts: !value.artifacts }) }}
                sx={{
                  minHeight: MENU_CONTROL_HEIGHT_PX,
                  height: MENU_CONTROL_HEIGHT_PX,
                  lineHeight: 1,
                  px: 1.25,
                  py: 0,
                  mr: 1,
                  borderWidth: 1,
                  borderColor: 'success.main',
                  color: 'success.main',
                  '&.Mui-selected': { bgcolor: 'success.main', color: '#fff', borderColor: 'success.main', '&:hover': { bgcolor: 'success.dark' } },
                }}
              >Artifacts</ToggleButton>
              <ToggleButton
                value="accessories"
                selected={value.accessories}
                onClick={(e) => { e.preventDefault(); onChange({ ...value, accessories: !value.accessories }) }}
                sx={{
                  minHeight: MENU_CONTROL_HEIGHT_PX,
                  height: MENU_CONTROL_HEIGHT_PX,
                  lineHeight: 1,
                  px: 1.25,
                  py: 0,
                  mr: 1,
                  borderWidth: 1,
                  borderColor: 'success.main',
                  color: 'success.main',
                  '&.Mui-selected': { bgcolor: 'success.main', color: '#fff', borderColor: 'success.main', '&:hover': { bgcolor: 'success.dark' } },
                }}
              >Accessories</ToggleButton>
            </Box>
          </Box>
          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>Level Ranges</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
              {LEVEL_CHOICES.map(({ key, label }) => {
                const button = (
                  <ToggleButton
                    key={key}
                    value={key}
                    selected={value.levels.includes(key)}
                    size="small"
                    onClick={(e) => { e.preventDefault(); toggleLevel(key) }}
                    sx={{
                      minWidth: 64,
                      px: 1,
                      py: 0.5,
                      mr: 1,
                      mb: 1,
                      borderWidth: 1,
                      borderColor: 'success.main',
                      color: 'success.main',
                      '&.Mui-selected': { bgcolor: 'success.main', color: '#fff', borderColor: 'success.main', '&:hover': { bgcolor: 'success.dark' } },
                    }}
                  >{label}</ToggleButton>
                )
                if (key === 16) {
                  return (
                    <Tooltip
                      key={key}
                      title={"Off by default to avoid selling fully leveled gear. Turning this on can sell valuable +16 items if misused in RSL Helper."}
                    >
                      {/* Wrap in span to satisfy Tooltip's single child requirement */}
                      <span>{button}</span>
                    </Tooltip>
                  )
                }
                return button
              })}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        {onReset && (
          <Button size="small" variant="outlined" color="error" onClick={onReset}>Reset to defaults</Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
