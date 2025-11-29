import { Box, Typography } from '@mui/material'
import { CLEAR_ICON_BUTTON_SIZE_PX, FONT_SIZE_BASE_PX } from '../lib/constants'
import { INLINE_SELECT_EXTRA_BADGE_RIGHT_PX } from '../lib/inlineSelectAffordances'

type InlineSelectExtraBadgeProps = {
  count: number
}

export default function InlineSelectExtraBadge({ count }: InlineSelectExtraBadgeProps) {
  if (count <= 0) {
    // Avoid rendering when the select only shows a single choice; the badge should only appear
    // once the truncated value hides additional selections.
    return null
  }

  return (
    <Box
      component="span"
      sx={{
        position: 'absolute',
        top: '50%',
        right: `${INLINE_SELECT_EXTRA_BADGE_RIGHT_PX}px`,
        transform: 'translateY(-50%)',
        width: CLEAR_ICON_BUTTON_SIZE_PX,
        height: CLEAR_ICON_BUTTON_SIZE_PX,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'text.secondary',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      <Typography component="span" variant="body2" sx={{ fontSize: FONT_SIZE_BASE_PX, lineHeight: 1 }}>
        {`+${count}`}
      </Typography>
    </Box>
  )
}
