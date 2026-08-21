/**
 * GoldCornerOrnament — the gold-skin corner bracket: a short L of frame-gold molding with a
 * title-gold ◆ at its elbow, worn by the top two corners of major panels and dialogs.
 *
 * Drawn as an absolutely-positioned SVG INSIDE the host's border: out of flow, so it adds no
 * height, shifts no content, and can never overflow a layout. The host only needs
 * `position: relative` (see GOLD_CORNER_HOST_SX). Menus, popovers, hover plates and grid
 * cards stay undecorated — the ornament marks a *place you work in*, not every surface.
 */
import Box from '@mui/material/Box'
import { GOLD_FRAME_CSS, GOLD_TITLE_CSS, GOLD_ORNAMENT } from '../lib/goldSkin'

// Host prerequisite: the ornament positions against the nearest positioned ancestor.
export const GOLD_CORNER_HOST_SX = { position: 'relative' } as const

function Ornament({ side }: { side: 'left' | 'right' }) {
  const { inset, arm, gem, stroke } = GOLD_ORNAMENT
  // The box holds the elbow plus both arms, with room for the gem's points on either side.
  const size = arm + gem
  // The elbow — where the arms meet AND where the gem sits; offset by the gem's half-diagonal
  // so the diamond stays fully inside the box instead of clipping at the corner.
  const ex = side === 'left' ? gem : size - gem
  const ey = gem
  const dir = side === 'left' ? 1 : -1
  return (
    <Box
      component="svg"
      aria-hidden
      viewBox={`0 0 ${size} ${size}`}
      sx={{
        position: 'absolute',
        top: inset,
        [side]: inset,
        width: size,
        height: size,
        pointerEvents: 'none',
      }}
    >
      {/* The L: down the side, then in along the top, meeting at the elbow. */}
      <path
        d={`M ${ex} ${ey + arm} L ${ex} ${ey} L ${ex + dir * arm} ${ey}`}
        fill="none"
        stroke={GOLD_FRAME_CSS}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* The ◆ ON the elbow — the same mark the section-title voice carries. */}
      <path
        d={`M ${ex} ${ey - gem} L ${ex + gem} ${ey} L ${ex} ${ey + gem} L ${ex - gem} ${ey} Z`}
        fill={GOLD_TITLE_CSS}
      />
    </Box>
  )
}

// Both top corners in one drop-in; render as the first child of a positioned panel.
export function GoldCornerOrnaments() {
  return (
    <>
      <Ornament side="left" />
      <Ornament side="right" />
    </>
  )
}
