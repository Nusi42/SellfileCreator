import type { Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import { TINT } from '../lib/colorTints'

/**
 * Firefox ignores `scrollbar-gutter`, so we fake the reserved inline space via
 * a Firefox-only media query while Chromium browsers keep the native behavior.
 */
const formatPadding = (value: number | string): string => (typeof value === 'number' ? `${value}px` : value)

// Match Firefox's native scrollbar width (≈16px) so hover states never overlay
// content. Keep overridable for future tweaks.
export const FIREFOX_SCROLLBAR_GUTTER_PX = 16

export interface ScrollbarGutterOptions {
  reserveStart?: boolean
  basePaddingInlineStart?: number | string
  basePaddingInlineEnd?: number | string
  firefoxGutterPx?: number
}

/**
 * Applies a subtle contrasting scrollbar track so the scrollable area is
 * recognisable before the user hovers the thumb. Use on any container whose
 * background would otherwise blend with the default transparent track.
 */
export const visibleScrollbarTrack = (): SystemStyleObject<Theme> => ({
  // Webkit: explicit track + thumb colours with a slim width.
  // Gold skin: thumb/track ride the frame-gold channel (TINT.scroll*) in both schemes; the
  // per-scheme split below only tunes the hover alpha.
  '&::-webkit-scrollbar': { width: 9 },
  '&::-webkit-scrollbar-track': { background: TINT.scrollTrackLight, borderRadius: 5 },
  '&::-webkit-scrollbar-thumb': { background: TINT.scrollThumbLight, borderRadius: 5 },
  '&::-webkit-scrollbar-thumb:hover': { background: TINT.scrollThumbHoverLight },
  // Firefox: shorthand thumb/track colour + thin width
  scrollbarColor: `${TINT.scrollThumbLight} ${TINT.scrollTrackLight}`,
  scrollbarWidth: 'thin',
  '[data-mui-color-scheme="dark"] &': {
    '&::-webkit-scrollbar-track': { background: TINT.scrollTrackDark },
    '&::-webkit-scrollbar-thumb': { background: TINT.scrollThumbDark },
    '&::-webkit-scrollbar-thumb:hover': { background: TINT.scrollThumbHoverDark },
    scrollbarColor: `${TINT.scrollThumbDark} ${TINT.scrollTrackDark}`,
  },
})

export const reserveScrollbarGutterSpace = (options?: ScrollbarGutterOptions): SystemStyleObject<Theme> => {
  const {
    reserveStart = true,
    basePaddingInlineStart = 0,
    basePaddingInlineEnd = 0,
    firefoxGutterPx = FIREFOX_SCROLLBAR_GUTTER_PX,
  } = options ?? {}
  const formattedStart = formatPadding(basePaddingInlineStart)
  const formattedEnd = formatPadding(basePaddingInlineEnd)
  const startPad = `calc(${formattedStart} + ${firefoxGutterPx}px)`
  const endPad = `calc(${formattedEnd} + ${firefoxGutterPx}px)`
  return {
    scrollbarGutter: reserveStart ? 'stable both-edges' : 'stable',
    '@media all and (min--moz-device-pixel-ratio:0)': {
      scrollbarGutter: 'auto',
      ...(reserveStart ? { paddingInlineStart: startPad, paddingLeft: startPad } : {}),
      paddingInlineEnd: endPad,
      paddingRight: endPad,
    },
  }
}
