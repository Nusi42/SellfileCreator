import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Theme } from '@mui/material/styles'
import {
  schemeModeFromColorScheme,
  resolveSchemePalette,
  resolveSchemePaper,
  resolveContrastSurfaceScheme,
  resolveCardChipBaseBg,
  adaptSubstatFgOnSurface,
  APP_SCHEME_ALPHAS,
} from '../../src/lib/themeCustomTokens.js'

// Minimal stub mimicking MUI's CSS-vars theme: theme.palette is FROZEN to the light scheme,
// while theme.colorSchemes carries the real per-scheme palettes. This is exactly the shape
// that caused the dark-mode contrast bug, so the resolvers must read colorSchemes, not palette.
const stubTheme = {
  palette: {
    mode: 'light',
    background: { paper: '#f5f5f5' },
    success: { main: '#2e7d32' },
    error: { main: '#d32f2f' },
    action: { selected: 'rgba(0, 0, 0, 0.08)' },
  },
  colorSchemes: {
    light: {
      palette: {
        background: { paper: '#f5f5f5' },
        success: { main: '#2e7d32' },
        error: { main: '#d32f2f' },
        action: { selected: 'rgba(0, 0, 0, 0.08)' },
      },
    },
    dark: {
      palette: {
        background: { paper: '#161b22' },
        success: { main: '#66bb6a' },
        error: { main: '#f44336' },
        action: { selected: 'rgba(255, 255, 255, 0.16)' },
      },
    },
  },
} as unknown as Theme

// undefined resolves to dark because the app's defaultMode is "dark".
test('schemeModeFromColorScheme matches the defaultMode=dark convention', () => {
  assert.equal(schemeModeFromColorScheme('light'), 'light')
  assert.equal(schemeModeFromColorScheme('dark'), 'dark')
  assert.equal(schemeModeFromColorScheme(undefined), 'dark')
  assert.equal(schemeModeFromColorScheme('system'), 'dark')
  // RSLH renders on the dark base (its colors come from merged customization, not a scheme),
  // so it resolves to 'dark' here like any non-light value.
  assert.equal(schemeModeFromColorScheme('rslh'), 'dark')
})

// The core fix: paper must come from the RUNTIME scheme, not the frozen light palette.
test('resolveSchemePaper/Palette read the active scheme, not the frozen palette', () => {
  assert.equal(resolveSchemePaper(stubTheme, 'dark'), '#161b22')
  assert.equal(resolveSchemePaper(stubTheme, 'light'), '#f5f5f5')
  assert.equal(resolveSchemePalette(stubTheme, 'dark').success.main, '#66bb6a')
  assert.equal(resolveSchemePalette(stubTheme, 'light').success.main, '#2e7d32')
})

// resolveContrastSurfaceScheme bundles the per-scheme paper, mains, and alpha set.
test('resolveContrastSurfaceScheme bundles scheme colors + alphas', () => {
  const dark = resolveContrastSurfaceScheme(stubTheme, 'dark')
  assert.equal(dark.paper, '#161b22')
  assert.equal(dark.successMain, '#66bb6a')
  assert.equal(dark.errorMain, '#f44336')
  assert.equal(dark.alphas, APP_SCHEME_ALPHAS.dark)
  const light = resolveContrastSurfaceScheme(stubTheme, 'light')
  assert.equal(light.alphas, APP_SCHEME_ALPHAS.light)
})

// resolveCardChipBaseBg composites the outcome tint over the scheme paper.
test('resolveCardChipBaseBg blends the card outcome tint over scheme paper', () => {
  const dark = resolveContrastSurfaceScheme(stubTheme, 'dark')
  const keepBg = resolveCardChipBaseBg(dark, true)
  const sellBg = resolveCardChipBaseBg(dark, false)
  // Both are opaque hex, distinct from raw paper, and distinct from each other (success vs error tint).
  assert.match(keepBg, /^#[0-9a-f]{6}$/i)
  assert.notEqual(keepBg, '#161b22')
  assert.notEqual(keepBg, sellBg)
})

// adaptSubstatFgOnSurface runs the WCAG pass; undefined passes straight through.
test('adaptSubstatFgOnSurface adjusts low-contrast text and passes through empty', () => {
  // A light tan on near-white must be darkened for legibility.
  const adjusted = adaptSubstatFgOnSurface('#ecc690', '#ffffff')
  assert.notEqual(adjusted, '#ecc690')
  // Already-legible text on the opposite surface is left as-is.
  assert.equal(adaptSubstatFgOnSurface('#ecc690', '#161b22'), '#ecc690')
  assert.equal(adaptSubstatFgOnSurface(undefined, '#ffffff'), undefined)
})
