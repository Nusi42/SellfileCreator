import React from 'react'
import { Box, type SxProps } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { factionNames, type FactionId } from '../lib/types'
import { FACTION_ICON_MAP, factionIconUrl } from '../lib/iconMaps/factionIconMap'
import { ALPHA } from '../lib/colorTints'

/** Default inline size for faction icons (menus/select labels). */
export const FACTION_ICON_PX = 25 as const

/** Shared map of faction IDs to their icon URLs. */
export { FACTION_ICON_MAP }

const FACTION_ICON_HALO_PAD_PX = 5 as const

/** Inline faction icon used across selects and the preview when assets exist. */
export function FactionIcon({ faction, size = FACTION_ICON_PX, sx }: { faction: FactionId; size?: number; sx?: SxProps }) {
  const src = factionIconUrl(faction)
  if (!src) return null
  const label = factionNames[Number(faction)] ?? ''
  const haloSize = size + FACTION_ICON_HALO_PAD_PX
  return (
    <Box
      draggable={false}
      onDragStart={(event: React.DragEvent) => { event.preventDefault(); event.stopPropagation() }}
      sx={{
        position: 'relative',
        width: haloSize,
        height: haloSize,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        verticalAlign: 'middle',
        userSelect: 'none',
        WebkitUserDrag: 'none',
        flexShrink: 0,
        ...sx,
      }}
    >
      {/* Medallion halo keeps high-res bitmaps readable on dark themes without shrinking them. */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: haloSize,
          height: haloSize,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          backgroundColor: theme => alpha(theme.palette.common.white, ALPHA.a12),
          border: theme => `1px solid ${alpha(theme.palette.common.white, ALPHA.a25)}`,
          boxShadow: theme => `0 1px 2px ${alpha(theme.palette.common.black, ALPHA.a60)}`,
          pointerEvents: 'none',
        }}
      />
      <Box
        component="img"
        src={src}
        alt={label}
        draggable={false}
        onDragStart={(event: React.DragEvent) => { event.preventDefault(); event.stopPropagation() }}
        sx={{
          width: size,
          height: size,
          objectFit: 'contain',
          borderRadius: 0.75,
          filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6))',
          userSelect: 'none',
          WebkitUserDrag: 'none',
        }}
      />
    </Box>
  )
}

/**
 * Combined icon + label helper for menu items and select renderers.
 * Falls back to text-only when an icon is not available for the faction.
 */
export function FactionOptionLabel({
  faction,
  label,
  size = FACTION_ICON_PX,
  sx,
  textSx,
  truncate = false,
}: {
  faction: FactionId
  label: string
  size?: number
  sx?: SxProps
  textSx?: SxProps
  truncate?: boolean
}) {
  const icon = <FactionIcon faction={faction} size={size} />
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        minHeight: size,
        ...sx,
      }}
    >
      {icon}
      <Box
        component="span"
        sx={{
          display: 'inline-block',
          ...(truncate ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : {}),
          ...textSx,
        }}
      >
        {label}
      </Box>
    </Box>
  )
}
