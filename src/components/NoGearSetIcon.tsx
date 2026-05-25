import { Box } from '@mui/material'
import { useTheme } from '@mui/material/styles'

// Use the shared Spider icon asset for the no-set accessory marker.
// Exported so other components (e.g. GearAnalyticsTabContent) can reference the same URL.
export const NO_SET_SPIDER_SRC = new URL('../../ico/sets/Spider.webp', import.meta.url).href

const ICON_SIZE_PX: Record<'small' | 'medium' | 'large', number> = {
  small: 20,
  medium: 24,
  large: 35,
}

type NoGearSetIconProps = {
  fontSize?: 'inherit' | 'small' | 'medium' | 'large'
}

export function NoGearSetIcon({ fontSize = 'small' }: NoGearSetIconProps) {
  const theme = useTheme()
  // The asset scales with font size so it matches existing icon sizing.
  const size = fontSize === 'inherit' ? '1em' : `${ICON_SIZE_PX[fontSize]}px`
  return (
    <Box
      component="img"
      src={NO_SET_SPIDER_SRC}
      alt=""
      aria-hidden="true"
      draggable={false}
      onDragStart={(event) => { event.preventDefault(); event.stopPropagation() }}
      sx={{
        width: size,
        height: size,
        display: 'block',
        objectFit: 'contain',
        userSelect: 'none',
        WebkitUserDrag: 'none',
        // Spider.webp is white-on-transparent; invert in light mode so it draws on the light background.
        ...theme.applyStyles('light', { filter: 'invert(1)' }),
      }}
    />
  )
}
