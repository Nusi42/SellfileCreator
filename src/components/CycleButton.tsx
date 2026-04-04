import React, { useState } from 'react'
import { Box, Button } from '@mui/material'
import type { ButtonProps, SxProps, Theme } from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'

export interface CycleButtonOption {
  value: string
  label: string
}

interface CycleButtonProps {
  options: ReadonlyArray<CycleButtonOption>
  value: string
  onChange: (newValue: string) => void
  disabled?: boolean
  /** @default 'small' */
  size?: ButtonProps['size']
  /** @default 'success' */
  color?: ButtonProps['color']
  /** @default 'contained' */
  variant?: ButtonProps['variant']
  sx?: SxProps<Theme>
}

/**
 * A cycling button that shows prev/current/next options in an animated sliding strip.
 *
 * The button is split into three interaction zones:
 *  - Left 15%: click selects the previous option, hover previews it by sliding the strip right
 *  - Right 15%: click selects the next option, hover previews it by sliding the strip left
 *  - Center 70%: click advances forward (same as right zone)
 *
 * Subtle ‹/› chevrons indicate the left/right zones; they brighten on hover.
 */
export function CycleButton({
  options,
  value,
  onChange,
  disabled,
  size = 'small',
  color = 'success',
  variant = 'contained',
  sx,
}: CycleButtonProps) {
  const [hoverZone, setHoverZone] = useState<'left' | 'right' | null>(null)

  // Guard against unknown values or empty options.
  const safeOptions = options.length > 0 ? options : [{ value: '', label: '' }]
  const currentIdx = Math.max(0, safeOptions.findIndex((o) => o.value === value))
  const prevIdx = (currentIdx - 1 + safeOptions.length) % safeOptions.length
  const nextIdx = (currentIdx + 1) % safeOptions.length

  const resolveZone = (e: React.MouseEvent<HTMLButtonElement>): 'left' | 'right' | null => {
    const rel = (e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.offsetWidth
    return rel <= 0.15 ? 'left' : rel >= 0.85 ? 'right' : null
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return
    const zone = resolveZone(e)
    // Only update state when the zone actually changes to avoid needless re-renders.
    if (zone !== hoverZone) setHoverZone(zone)
  }

  const handleMouseLeave = () => setHoverZone(null)

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (disabled) return
    const zone = resolveZone(e)
    // Reset immediately so the strip snaps back before the new value's labels mount.
    setHoverZone(null)
    onChange(safeOptions[zone === 'left' ? prevIdx : nextIdx]!.value)
  }

  // Sliding-strip animation: a 300%-wide flex row holds [prev | current | next].
  // translateX percentages are relative to the strip's own width (3 × viewport),
  // so each 33.33% step equals exactly one viewport width.
  // Default (-33.33%) centres the current label; 0% shows prev; -66.67% shows next.
  const stripTranslate =
    hoverZone === 'left' ? '0%' : hoverZone === 'right' ? '-66.67%' : '-33.33%'

  // All inner children are absolutely positioned so the button's intrinsic size
  // comes only from the caller's sx (minWidth / height), not from the hidden labels.
  return (
    <Button
      size={size}
      variant={variant}
      color={color}
      disabled={disabled}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      sx={{ p: 0, overflow: 'hidden', position: 'relative', minWidth: 0, ...sx }}
    >
      {/* Left chevron — absolutely pinned to the left 15%; brightens on zone hover */}
      <Box
        component="span"
        aria-hidden
        sx={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: '15%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: hoverZone === 'left' ? 1 : 0.4,
          transition: 'opacity 0.12s',
          userSelect: 'none', pointerEvents: 'none',
          '& svg': { fontSize: '1rem' },
        }}
      ><ChevronLeftIcon fontSize="inherit" /></Box>

      {/* Sliding-strip viewport occupies the center 70%; strips are clipped here */}
      <Box
        component="span"
        sx={{ position: 'absolute', left: '15%', right: '15%', top: 0, bottom: 0, overflow: 'hidden' }}
      >
        <Box
          component="span"
          sx={{
            display: 'flex', width: '300%', height: '100%', alignItems: 'center',
            transform: `translateX(${stripTranslate})`,
            transition: 'transform 0.18s ease',
            pointerEvents: 'none',
          }}
        >
          {(['prev', 'current', 'next'] as const).map((slot) => {
            const optIdx = slot === 'prev' ? prevIdx : slot === 'next' ? nextIdx : currentIdx
            return (
              <Box
                key={slot}
                component="span"
                sx={{ width: '33.33%', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip' }}
              >
                {safeOptions[optIdx]?.label ?? ''}
              </Box>
            )
          })}
        </Box>
      </Box>

      {/* Right chevron — absolutely pinned to the right 15%; brightens on zone hover */}
      <Box
        component="span"
        aria-hidden
        sx={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: '15%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: hoverZone === 'right' ? 1 : 0.4,
          transition: 'opacity 0.12s',
          userSelect: 'none', pointerEvents: 'none',
          '& svg': { fontSize: '1rem' },
        }}
      ><ChevronRightIcon fontSize="inherit" /></Box>
    </Button>
  )
}
