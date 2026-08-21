import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BORDER_STYLE_DIVIDER,
  DEFAULT_BORDER_STYLE_MODE,
  EMPTY_THEME_CUSTOMIZATION,
  isBorderStyleMode,
} from '../../src/lib/constants.js'
import {
  isGoldMoldingEnabled,
  resolveBorderStyleMode,
  GOLD_ORNAMENT_DISPLAY_OFF,
  GOLD_ORNAMENT_DISPLAY_VAR,
} from '../../src/lib/goldSkin.js'
import { APP_CSS_VAR, buildCustomValueVars, schemeSelector } from '../../src/lib/themeCustomTokens.js'
import { makeTheme } from '../../src/theme.js'

// The whole point of the option is that it changes nothing until it is used: an un-set field
// must resolve to the shipped gold molding.
test('resolveBorderStyleMode: an un-set field means the gold default', () => {
  assert.equal(DEFAULT_BORDER_STYLE_MODE, 'gold')
  assert.equal(resolveBorderStyleMode({ borderStyleMode: null }), 'gold')
  assert.equal(isGoldMoldingEnabled({ borderStyleMode: null }), true)
  assert.equal(isGoldMoldingEnabled({ borderStyleMode: 'neutral' }), false)
})

// The persisted value is validated on read; anything unrecognized falls back to the default.
test('isBorderStyleMode accepts only the two frame languages', () => {
  assert.equal(isBorderStyleMode('gold'), true)
  assert.equal(isBorderStyleMode('neutral'), true)
  assert.equal(isBorderStyleMode('silver'), false)
  assert.equal(isBorderStyleMode(undefined), false)
})

// In CSS-vars mode the per-scheme palettes live on theme.colorSchemes, which is absent from
// MUI's Theme type (same cast the theme popout uses to read its fallback swatches).
type SchemeMap = Partial<Record<'dark' | 'light', { palette: { divider: string } }>>
const dividerOf = (theme: ReturnType<typeof makeTheme>, scheme: 'dark' | 'light'): string | undefined =>
  ((theme as unknown as { colorSchemes?: SchemeMap }).colorSchemes?.[scheme])?.palette.divider

// The divider default per scheme is what the user actually sees change: gold molding vs the
// pre-gold-skin greys, in both schemes.
test('makeTheme: the border style picks the scheme divider default', () => {
  const gold = makeTheme('normal', { ...EMPTY_THEME_CUSTOMIZATION })
  assert.equal(dividerOf(gold, 'dark'), BORDER_STYLE_DIVIDER.gold.dark)
  assert.equal(dividerOf(gold, 'light'), BORDER_STYLE_DIVIDER.gold.light)

  const neutral = makeTheme('normal', { ...EMPTY_THEME_CUSTOMIZATION, borderStyleMode: 'neutral' })
  assert.equal(dividerOf(neutral, 'dark'), BORDER_STYLE_DIVIDER.neutral.dark)
  assert.equal(dividerOf(neutral, 'light'), BORDER_STYLE_DIVIDER.neutral.light)
})

// An explicit picker colour outranks either frame language.
test('makeTheme: an explicit divider colour wins over the border style', () => {
  const t = makeTheme('normal', { ...EMPTY_THEME_CUSTOMIZATION, borderStyleMode: 'neutral', dividerColor: '#abcdef' })
  assert.equal(dividerOf(t, 'dark'), '#abcdef')
})

// Neutral additionally kills the two gold-only decorations, via CSS vars written on the same
// scheme selectors that carry the per-scheme alphas (so injection order cannot flip them).
test('buildCustomValueVars: neutral zeroes the inset line and hides the ornaments', () => {
  const off = buildCustomValueVars({ goldMolding: false }) as Record<string, Record<string, unknown>>
  for (const scheme of ['dark', 'light'] as const) {
    const sel = schemeSelector(scheme)
    assert.equal(off[sel]?.[APP_CSS_VAR.goldInsetAlpha], 0)
    assert.equal(off[sel]?.[GOLD_ORNAMENT_DISPLAY_VAR], GOLD_ORNAMENT_DISPLAY_OFF)
  }
  // Gold (and an omitted flag) must emit no override at all, so the scheme defaults stand.
  assert.deepEqual(Object.keys(buildCustomValueVars({ goldMolding: true })), [':root'])
  assert.deepEqual(Object.keys(buildCustomValueVars({})), [':root'])
})
