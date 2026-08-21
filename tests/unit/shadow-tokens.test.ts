import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CUSTOM_TOKENS,
  FLOATING_LAYER_SHADOW,
  GOLD_INSET_SHADOW,
  TOOLTIP_SHADOW,
} from '../../src/lib/themeCustomTokens.js'

// Regression guard for a silent failure: MUI emits `--mui-palette-common-black` but never a
// `…-blackChannel`, so a channel reference resolved to nothing, the rgba() became invalid, and
// the browser dropped the WHOLE box-shadow — every floating layer lost its drop shadow with no
// error anywhere. Nothing may reference a channel var MUI does not emit.
test('shadow colors never reference the non-existent common-black channel', () => {
  for (const shadow of [FLOATING_LAYER_SHADOW, TOOLTIP_SHADOW, GOLD_INSET_SHADOW]) {
    assert.ok(!shadow.includes('common-blackChannel'), `invalid channel var in: ${shadow}`)
    assert.ok(!shadow.includes('common-whiteChannel'), `invalid channel var in: ${shadow}`)
  }
  assert.match(CUSTOM_TOKENS.floatingShadowColor, /^rgba\(0 0 0 \/ var\(--app-/)
  assert.match(CUSTOM_TOKENS.tooltipBorderShadowColor, /^rgba\(0 0 0 \/ var\(--app-/)
})

// Tooltips carry a BORDER shadow (zero-offset halo on every side), not just the floating
// layers' downward drop — a tooltip flips to whichever side has room.
test('TOOLTIP_SHADOW leads with a zero-offset halo and keeps the lit inner line', () => {
  assert.ok(TOOLTIP_SHADOW.startsWith('0 0 4px '), TOOLTIP_SHADOW)
  assert.ok(TOOLTIP_SHADOW.endsWith(GOLD_INSET_SHADOW), TOOLTIP_SHADOW)
  // It must be distinct from the shared floating shadow, or the override buys nothing.
  assert.notEqual(TOOLTIP_SHADOW, FLOATING_LAYER_SHADOW)
})
