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
    <ClearIconButton
      size="small"
      aria-label={label}
      tooltip={label}
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
    />
  )
}
