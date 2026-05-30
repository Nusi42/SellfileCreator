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

/**
 * Applies a subtle contrasting scrollbar track so the scrollable area is
 * recognisable before the user hovers the thumb. Use on any container whose
 * background would otherwise blend with the default transparent track.
 */
export const visibleScrollbarTrack = (): SystemStyleObject<Theme> => ({
  // Webkit: explicit track + thumb colours with a slim width.
  // Default (light mode): black-alpha via common.blackChannel; dark mode: white-alpha via common.whiteChannel.
  '&::-webkit-scrollbar': { width: 9 },
  '&::-webkit-scrollbar-track': { background: 'rgba(var(--mui-palette-common-blackChannel) / 0.04)', borderRadius: 5 },
  '&::-webkit-scrollbar-thumb': { background: 'rgba(var(--mui-palette-common-blackChannel) / 0.15)', borderRadius: 5 },
  '&::-webkit-scrollbar-thumb:hover': { background: 'rgba(var(--mui-palette-common-blackChannel) / 0.25)' },
  // Firefox: shorthand thumb/track colour + thin width
  scrollbarColor: 'rgba(var(--mui-palette-common-blackChannel) / 0.15) rgba(var(--mui-palette-common-blackChannel) / 0.04)',
  scrollbarWidth: 'thin',
  '[data-mui-color-scheme="dark"] &': {
    '&::-webkit-scrollbar-track': { background: 'rgba(var(--mui-palette-common-whiteChannel) / 0.06)' },
    '&::-webkit-scrollbar-thumb': { background: 'rgba(var(--mui-palette-common-whiteChannel) / 0.22)' },
    '&::-webkit-scrollbar-thumb:hover': { background: 'rgba(var(--mui-palette-common-whiteChannel) / 0.38)' },
    scrollbarColor: 'rgba(var(--mui-palette-common-whiteChannel) / 0.22) rgba(var(--mui-palette-common-whiteChannel) / 0.06)',
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
