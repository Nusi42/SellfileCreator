/* eslint import/no-unused-modules: off */
/**
 * label-colors.test.ts
 *
 * Tag / group label colours: a stable hue per string, adapted for legible text on the paper of
 * all three themes (light, dark, RSLH). The three paper hexes below are the shipped defaults
 * (`src/theme.ts` for light/dark, `src/lib/rslhPreset.ts` for RSLH) so a palette change here
 * shows up as a failing contrast assertion rather than an unreadable tag.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { labelHueOf, reservedHuesOf, resolveLabelChipColors, resolveLabelColor } from '../../src/lib/labelColors.js'
import { WCAG_NORMAL_TEXT_CONTRAST } from '../../src/lib/colorUtils.js'

// The three shipped paper surfaces a label can sit on.
const PAPERS = { light: '#fafafa', dark: '#161b22', rslh: '#2C2C2C' }

// WCAG relative luminance / contrast, kept local so the test does not depend on the module under
// test for its own yardstick.
const luminance = (hex: string): number => {
  const channel = (index: number) => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}
const contrast = (a: string, b: string): number => {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const SAMPLES = ['boots', 'SPD', 'gAbc123xyz', 'Endgame Accessories', 'x', 'мощь', 'Öl', '#1', 'tag-with-a-very-long-name-that-goes-on']

test('the same label always resolves to the same hue, and different labels spread out', () => {
  for (const label of SAMPLES) assert.equal(labelHueOf(label), labelHueOf(label))
  const hues = SAMPLES.map((label) => labelHueOf(label))
  assert.equal(new Set(hues.map((h) => Math.round(h))).size, hues.length, 'sample hues should be distinct')
  for (const hue of hues) assert.ok(hue >= 0 && hue < 360)
})

test('every label colour meets normal-text contrast on all three theme papers', () => {
  for (const [scheme, paper] of Object.entries(PAPERS)) {
    for (const label of SAMPLES) {
      const fg = resolveLabelColor(label, paper)
      assert.ok(
        contrast(fg, paper) >= WCAG_NORMAL_TEXT_CONTRAST - 0.01,
        `${label} on ${scheme} paper: ${fg} has contrast ${contrast(fg, paper).toFixed(2)}`,
      )
    }
  }
})

test('chip colours derive border and fill from the same adapted foreground', () => {
  const { fg, border, bg } = resolveLabelChipColors('boots', PAPERS.light)
  assert.equal(fg, resolveLabelColor('boots', PAPERS.light))
  // Border and fill are alpha variants of the foreground (rgba strings), never a second hue.
  assert.match(border, /^rgba\(/)
  assert.match(bg, /^rgba\(/)
})

test('label hues stay clear of the reserved semantic hues in every theme', () => {
  // Representative semantic mains per scheme (MUI defaults; RSLH primary from rslhPreset.ts): primary, error,
  // warning, success, info. A label must never sit inside the band around any of them.
  const RESERVED = {
    light: ['#0969da', '#d32f2f', '#ed6c02', '#2e7d32', '#0288d1'],
    dark: ['#58a6ff', '#f44336', '#ffa726', '#66bb6a', '#29b6f6'],
    rslh: ['#F1960E', '#f44336', '#FFC107', '#66bb6a', '#29b6f6'],
  }
  const distance = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }
  for (const [scheme, colors] of Object.entries(RESERVED)) {
    const reserved = reservedHuesOf(colors)
    assert.ok(reserved.length === colors.length, `${scheme}: every semantic colour has a hue`)
    for (const label of SAMPLES) {
      const hue = labelHueOf(label, reserved)
      for (const r of reserved) {
        assert.ok(distance(hue, r) >= 22 - 1e-9, `${scheme}: "${label}" hue ${hue.toFixed(1)} too close to reserved ${r.toFixed(1)}`)
      }
    }
  }
  // Without reserved hues the hash hue is used as is; with them it is deterministic too.
  assert.equal(labelHueOf('boots', []), labelHueOf('boots'))
  assert.equal(labelHueOf('boots', reservedHuesOf(RESERVED.light)), labelHueOf('boots', reservedHuesOf(RESERVED.light)))
})
