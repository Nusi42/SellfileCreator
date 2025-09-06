import { Box, SxProps } from '@mui/material'
import { ICON_DATA } from '../lib/iconData'

// Size used for inline set icons in selects and menus.
// Why: Keep a consistent, compact visual that aligns well with text baseline.
export const SET_ICON_PX = 18 as const

/**
 * Return the data URI for a set icon by its canonical set name.
 * If no icon is available for the name, returns undefined.
 */
export function setIconUrlByName(name: string): string | undefined {
  return ICON_DATA[name]
}

/**
 * Small inline image used in selects/menus to aid quick set recognition.
 * Current behavior: render only when a matching icon exists; otherwise omit.
 */
export function SetIcon({ name, size = SET_ICON_PX, sx }: { name: string; size?: number; sx?: SxProps }) {
  const src = setIconUrlByName(name)
  if (!src) return null
  return (
    <Box
      component="img"
      src={src}
      alt={name}
      draggable={false}
      onDragStart={(e: React.DragEvent) => { e.preventDefault(); e.stopPropagation() }}
      sx={{
        width: size,
        height: size,
        display: 'inline-block',
        verticalAlign: 'middle',
        mr: 0.75,
        borderRadius: 0.5,
        userSelect: 'none',
        WebkitUserDrag: 'none',
        ...sx,
      }}
    />
  )
}
