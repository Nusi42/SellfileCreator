import type { Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'

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
