import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseHexWithAlpha,
  formatHexWithAlpha,
  parseCssColorToRgb,
  mixRgb,
  rgbToCss,
  hexToHSL,
  hexToChannelTriplet,
  hslDegToHex,
} from '../../src/lib/colorUtils.js'

// parseHexWithAlpha: 6-digit hex → opaque; 8-digit → base + alpha; bad input → null.
test('parseHexWithAlpha splits base and alpha', () => {
  assert.deepEqual(parseHexWithAlpha('#ff0000'), { base: '#FF0000', alpha: 1 })
  const withAlpha = parseHexWithAlpha('#FF000080')
  assert.equal(withAlpha?.base, '#FF0000')
  assert.ok(Math.abs((withAlpha?.alpha ?? 0) - 128 / 255) < 1e-6)
  assert.equal(parseHexWithAlpha('not-a-hex'), null)
  assert.equal(parseHexWithAlpha(undefined), null)
})

// formatHexWithAlpha is the inverse: opaque drops the suffix, partial appends a 2-digit byte.
test('formatHexWithAlpha encodes alpha and round-trips', () => {
  assert.equal(formatHexWithAlpha('#ff0000', 1), '#FF0000')
  assert.equal(formatHexWithAlpha('#ff0000', 0.5), '#FF000080')
  const round = parseHexWithAlpha(formatHexWithAlpha('#3C6844', 0.25))
  assert.equal(round?.base, '#3C6844')
  assert.ok(Math.abs((round?.alpha ?? 0) - 0.25) < 0.01)
})

// parseCssColorToRgb handles hex, shorthand hex, and rgb()/rgba().
test('parseCssColorToRgb parses hex and rgb forms', () => {
  assert.deepEqual(parseCssColorToRgb('#3c6844'), { r: 60, g: 104, b: 68 })
  assert.deepEqual(parseCssColorToRgb('#fff'), { r: 255, g: 255, b: 255 })
  assert.deepEqual(parseCssColorToRgb('rgb(10, 20, 30)'), { r: 10, g: 20, b: 30 })
  assert.deepEqual(parseCssColorToRgb('rgba(10, 20, 30, 0.5)'), { r: 10, g: 20, b: 30 })
  assert.equal(parseCssColorToRgb('var(--x)'), null)
})

// mixRgb linearly interpolates each channel; ratio is clamped to [0,1].
test('mixRgb interpolates and clamps', () => {
  const mid = mixRgb({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0.5)
  assert.ok(Math.abs(mid.r - 127.5) < 1e-6)
  assert.deepEqual(mixRgb({ r: 0, g: 0, b: 0 }, { r: 200, g: 200, b: 200 }, 2), { r: 200, g: 200, b: 200 })
  assert.deepEqual(mixRgb({ r: 10, g: 10, b: 10 }, { r: 200, g: 200, b: 200 }, -1), { r: 10, g: 10, b: 10 })
})

// rgbToCss rounds + clamps to an integer rgb() string.
test('rgbToCss rounds and clamps channels', () => {
  assert.equal(rgbToCss({ r: 1.4, g: 2.6, b: 300 }), 'rgb(1, 3, 255)')
})

// hexToHSL returns degrees + 0–100 s/l; null for too-short input.
test('hexToHSL extracts hue/sat/lightness', () => {
  assert.deepEqual(hexToHSL('#ff0000'), { h: 0, s: 100, l: 50 })
  assert.equal(hexToHSL('#abc'), null) // shorthand is < 7 chars → unsupported here
})

// hexToChannelTriplet emits the "R G B" string MUI CSS variables expect.
test('hexToChannelTriplet emits channel string', () => {
  assert.equal(hexToChannelTriplet('#ff0000'), '255 0 0')
  assert.equal(hexToChannelTriplet('#3c6844'), '60 104 68')
})

// hslDegToHex (deg + 0–100 s/l) is the inverse of hexToHSL for primary hues.
test('hslDegToHex converts degrees/percent HSL to hex', () => {
  assert.equal(hslDegToHex(0, 100, 50), '#ff0000')
  // Hue wraps: 360 === 0.
  assert.equal(hslDegToHex(360, 100, 50), hslDegToHex(0, 100, 50))
})
