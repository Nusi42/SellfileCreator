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
import { useCallback } from 'react'
import { useTheme, useColorScheme } from '@mui/material/styles'
import {
  adaptSubstatFgOnSurface,
  resolveSchemePaper,
  schemeModeFromColorScheme,
} from './themeCustomTokens'

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
