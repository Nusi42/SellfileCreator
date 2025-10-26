import { Box } from '@mui/material'
import { SETS_SELECT_CLEAR_BUTTON_RIGHT_PX, SETS_SELECT_CLEAR_BUTTON_SIZE_PX } from '../lib/constants'
import ClearIconButton from './ClearIconButton'

export default function InlineSelectClearButton({
  disabled,
  label,
  onClear,
}: {
  disabled: boolean
  label: string
  onClear: () => void
}) {
  if (disabled) {
    // Hide the clear affordance entirely when there is nothing selected to clear.
    return null
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        top: '50%',
        right: `${SETS_SELECT_CLEAR_BUTTON_RIGHT_PX}px`,
        transform: 'translateY(-50%)',
        width: SETS_SELECT_CLEAR_BUTTON_SIZE_PX,
        height: SETS_SELECT_CLEAR_BUTTON_SIZE_PX,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <ClearIconButton
        size="small"
        aria-label={label}
        tooltip={label}
        onMouseDown={(event) => {
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onClear()
        }}
        tabIndex={-1}
        disableRipple
        sx={{
          pointerEvents: 'auto',
          borderRadius: '50%',
        }}
      />
    </Box>
  )
}
