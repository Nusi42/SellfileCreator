import { Box, type SxProps } from '@mui/material'
import { useState } from 'react'
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
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const alt = label ?? artifactSetName(setId)
  const showFallback = !src || failedSrc === src
  const normalizedUserSx = Array.isArray(sx) ? sx : sx ? [sx] : []
  // Keep a square layout footprint so menus stay aligned.
  const baseSx: SxProps = {
    // Fixed square footprint keeps menu rows aligned across sizes.
    width: size,
    height: size,
    // Align baseline with adjacent text in chips/menus.
    verticalAlign: 'middle',
    // Preserve the established spacing contract between icon + label.
    mr: 0.75,
    // Match the soft rounding used for other icon frames.
    borderRadius: 0.5,
    // Prevent accidental text selection or drag in menus.
    userSelect: 'none',
    WebkitUserDrag: 'none',
  }
  // Preserve non-square icon proportions inside the square frame.
  const imageSx: SxProps = {
    // Contain keeps new rectangular assets from stretching.
    objectFit: 'contain',
    // Center the artwork when letterboxing is needed.
    objectPosition: 'center',
  }
  if (showFallback) {
    const badgeLabel = String(setId ?? '')
    return (
      <Box
        component="span"
        role="img"
        aria-label={alt}
        sx={[
          baseSx,
          {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.max(10, size * 0.55),
            fontWeight: 600,
            letterSpacing: -0.25,
            color: 'text.secondary',
            border: '1px solid',
            borderColor: 'divider',
            lineHeight: 1,
            whiteSpace: 'nowrap',
            textAlign: 'center',
            boxSizing: 'border-box',
          },
          ...normalizedUserSx,
        ]}
      >
        {badgeLabel}
      </Box>
    )
  }
  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      draggable={false}
      onDragStart={(event: React.DragEvent) => { event.preventDefault(); event.stopPropagation() }}
      onError={() => { setFailedSrc(src ?? null) }}
      sx={[baseSx, imageSx, { display: 'inline-block' }, ...normalizedUserSx]}
    />
  )
}
