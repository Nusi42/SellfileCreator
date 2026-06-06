import { Button } from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import { MENU_CONTROL_HEIGHT_PX } from '../lib/constants'

/**
 * Square icon button used in context/dropdown menu rows to represent a boolean toggle.
 * Renders as a filled success-green button with a checkmark when on, outlined when off.
 * Calls stopPropagation internally so the enclosing MenuItem does not double-fire.
 */
export function MenuCheckButton({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <Button
      size="small"
      variant={checked ? 'contained' : 'outlined'}
      color="success"
      sx={{ minWidth: 0, width: MENU_CONTROL_HEIGHT_PX, height: MENU_CONTROL_HEIGHT_PX, p: 0 }}
      onClick={(e) => { e.stopPropagation(); onChange() }}
    >
      <CheckIcon fontSize="small" />
    </Button>
  )
}
