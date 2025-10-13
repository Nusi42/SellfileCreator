import { Box, type SxProps } from '@mui/material'
import { artifactSetName, type ArtifactSetId } from '../lib/types'
import { gearSetIconUrl } from '../lib/iconMaps/gearsetIconMap'

// Default inline size for gear set icons (menus/select labels).
export const SET_ICON_PX = 18 as const

/** Resolve the data URL for a gear set icon, when present. */
export function gearSetIconSrc(code?: ArtifactSetId): string | undefined {
  return gearSetIconUrl(code)
}

/** Inline gear set icon used across selects and the preview when assets exist. */
export function SetIcon({ setId, label, size = SET_ICON_PX, sx }: { setId: ArtifactSetId; label?: string; size?: number; sx?: SxProps }) {
  const src = gearSetIconUrl(setId)
  if (!src) return null
  const alt = label ?? artifactSetName(setId)
  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      draggable={false}
      onDragStart={(event: React.DragEvent) => { event.preventDefault(); event.stopPropagation() }}
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
