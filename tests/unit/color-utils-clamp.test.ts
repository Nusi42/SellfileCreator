import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ensureContrastOnBg } from '../../src/lib/colorUtils.js'

// White text (#ffffff) on white background — WCAG ratio 1:1 — must be darkened.
test('ensureContrastOnBg darkens white text on white background', () => {
  const result = ensureContrastOnBg('#ffffff', '#ffffff')
  assert.notEqual(result, '#ffffff')
})

// Bright yellow (#ffff00) on white — fails WCAG AA; result must differ from input.
test('ensureContrastOnBg adjusts bright yellow on white background', () => {
  const result = ensureContrastOnBg('#ffff00', '#ffffff')
  assert.notEqual(result, '#ffff00')
})

// Black text (#000000) on white (#ffffff) — contrast 21:1 — must be returned unchanged.
test('ensureContrastOnBg passes through black text on white (already 21:1)', () => {
  const result = ensureContrastOnBg('#000000', '#ffffff')
  assert.equal(result, '#000000')
})

// Dark grey text on white — already passes WCAG AA — must be returned unchanged.
test('ensureContrastOnBg leaves sufficiently dark text unchanged on light bg', () => {
  // #4a4a4a on #ffffff ≈ 9:1 contrast — well above 3.0:1
  const result = ensureContrastOnBg('#4a4a4a', '#ffffff')
  assert.equal(result, '#4a4a4a')
})

// White text (#ffffff) on dark background (#121212) — already passes — unchanged.
test('ensureContrastOnBg leaves white text unchanged on dark background', () => {
  const result = ensureContrastOnBg('#ffffff', '#121212')
  assert.equal(result, '#ffffff')
})

// Dark text on dark bg — must be lightened (not darkened further).
test('ensureContrastOnBg lightens dark text on dark background', () => {
  const result = ensureContrastOnBg('#111111', '#1a1a1a')
  assert.notEqual(result, '#111111')
  // Result must be lighter than the input
  const inputL = parseInt('11', 16)
  const outputR = parseInt(result.slice(1, 3), 16)
  assert.ok(outputR > inputL, `expected lighter result, got ${result}`)
})

// Hue must be preserved: a bright red on white should stay reddish after darkening.
test('ensureContrastOnBg preserves hue when adjusting for light background', () => {
  const result = ensureContrastOnBg('#ff4444', '#ffffff')
  const r = parseInt(result.slice(1, 3), 16)
  const g = parseInt(result.slice(3, 5), 16)
  const b = parseInt(result.slice(5, 7), 16)
  assert.ok(r > g, `expected red > green in adjusted color ${result}`)
  assert.ok(r > b, `expected red > blue in adjusted color ${result}`)
})

// Invalid input must be passed through without throwing.
test('ensureContrastOnBg passes through invalid hex gracefully', () => {
  assert.equal(ensureContrastOnBg('not-a-color', '#ffffff'), 'not-a-color')
  assert.equal(ensureContrastOnBg('#ff0000', 'not-a-bg'), '#ff0000')
  assert.equal(ensureContrastOnBg('', '#ffffff'), '')
})

// 3-digit shorthand hex must be handled.
test('ensureContrastOnBg handles 3-digit shorthand hex for text color', () => {
  // #fff on white — fails; must be adjusted
  const result = ensureContrastOnBg('#fff', '#ffffff')
  assert.notEqual(result, '#fff')
  assert.notEqual(result, '#ffffff')
})

// Result must achieve the 3.0:1 WCAG minimum (UI component / large-text level).
test('ensureContrastOnBg result achieves ≥3.0:1 contrast on white', () => {
  const result = ensureContrastOnBg('#ffff00', '#ffffff')
  const toRgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as [number, number, number]
  const lin = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  const lum = ([r, g, b]: [number, number, number]) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255)
  const contrast = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  const ratio = contrast(lum(toRgb(result)), lum(toRgb('#ffffff')))
  assert.ok(ratio >= 3.0, `expected contrast ≥3.0, got ${ratio.toFixed(2)} for ${result}`)
})
