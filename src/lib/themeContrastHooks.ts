/**
 * themeContrastHooks
 *
 * React hooks that resolve the ACTIVE color scheme for JS-side contrast math.
 *
 * Why these exist: with MUI cssVariables + colorSchemes, theme.palette.* is frozen to the
 * default (light) scheme, so reading theme.palette.background.paper in dark mode returns the
 * wrong surface. These hooks read the runtime scheme via useColorScheme() and resolve the
 * real per-scheme paper, then expose ready-to-use adapters so call sites stay one-liners.
 */
import { useCallback, useMemo } from 'react'
import { useTheme, useColorScheme } from '@mui/material/styles'
import {
  adaptSubstatFgOnSurface,
  resolveControlSurface,
  resolveSchemePalette,
  resolveSchemePaper,
  schemeModeFromColorScheme,
} from './themeCustomTokens'
import { reservedHuesOf } from './labelColors'

// The active scheme's paper color (real per-scheme hex, not the frozen light palette).
export function useSchemePaper(): string {
  const theme = useTheme()
  const { colorScheme } = useColorScheme()
  return resolveSchemePaper(theme, schemeModeFromColorScheme(colorScheme))
}

/**
 * Returns a stable adapter that contrast-corrects a substat/appearance fg color for legible
 * TEXT on the active scheme's paper surface. Use for any place a user/preset color is rendered
 * as text directly on the card/menu/paper background.
 */
export function useSubstatFgAdapter(): (fg: string | undefined) => string | undefined {
  const paper = useSchemePaper()
  // paper is a primitive string → the callback identity only changes when the scheme changes.
  return useCallback((fg: string | undefined) => adaptSubstatFgOnSurface(fg, paper), [paper])
}

/**
 * Like `useSubstatFgAdapter`, but adapts for legible TEXT on a CONTROL surface (toggle / filter
 * buttons, selects) — the selected-state overlay over paper — instead of plain paper. Use for
 * stat/rarity NAMES rendered inside controls so they stay legible whether selected or not, in all
 * schemes (notably RSLH, whose warm selection tint shifts the surface the most).
 */
export function useControlFgAdapter(): (fg: string | undefined) => string | undefined {
  const theme = useTheme()
  const { colorScheme } = useColorScheme()
  const surface = resolveControlSurface(theme, schemeModeFromColorScheme(colorScheme))
  return useCallback((fg: string | undefined) => adaptSubstatFgOnSurface(fg, surface), [surface])
}

/**
 * The hues the ACTIVE scheme reserves for its semantic colours — primary, error, warning,
 * success, info — so tag/group label colours (`lib/labelColors`) can steer clear of them and a
 * label is never mistaken for a state tint. Resolved from the runtime scheme palette (never the
 * frozen light palette) and memoized per scheme so the array identity is stable for memo deps.
 */
export function useReservedLabelHues(): readonly number[] {
  const theme = useTheme()
  const { colorScheme } = useColorScheme()
  const palette = resolveSchemePalette(theme, schemeModeFromColorScheme(colorScheme))
  const { primary, error, warning, success, info } = palette
  return useMemo(
    () => reservedHuesOf([primary.main, error.main, warning.main, success.main, info.main]),
    [primary.main, error.main, warning.main, success.main, info.main],
  )
}
