import { IconButton, Tooltip } from '@mui/material'
import ClearIcon from '@mui/icons-material/Clear'
import { SETS_SELECT_CLEAR_BUTTON_RIGHT_PX, SETS_SELECT_CLEAR_BUTTON_SIZE_PX } from '../lib/constants'

export default function InlineSelectClearButton({
  disabled,
  label,
  onClear,
}: {
  disabled: boolean
  label: string
  onClear: () => void
}) {
  return (
    <Tooltip
      title={label}
      disableHoverListener={disabled}
      disableFocusListener={disabled}
      disableTouchListener={disabled}
    >
      <span>
        <IconButton
          size="small"
          aria-label={label}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onClear()
          }}
          sx={{
            position: 'absolute',
            top: '50%',
            right: `${SETS_SELECT_CLEAR_BUTTON_RIGHT_PX}px`,
            transform: 'translateY(-50%)',
            width: SETS_SELECT_CLEAR_BUTTON_SIZE_PX,
            height: SETS_SELECT_CLEAR_BUTTON_SIZE_PX,
            borderRadius: 1,
          }}
        >
          <ClearIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  )
}
