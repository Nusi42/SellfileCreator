import { test } from 'node:test'
import assert from 'node:assert/strict'

// The anomalous default palette has now been revised twice for legibility, in
// opposite directions — first the "🛡" member was too dark, then the "⚔" member
// was. Both times the regression was invisible until someone looked at a
// screenshot. These assertions put a measurable floor under it: every default
// must clear the WCAG AA text ratio against BOTH paper surfaces the app ships.
import {
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT,
  statVariantI18nKey,
} from '../../src/lib/types.js'
import { ANOMALOUS_SUBSTAT_VARIANTS } from '../../src/lib/anomalousAccessories.js'
import { adaptSubstatFgOnSurface } from '../../src/lib/themeCustomTokens.js'
// The bar the adapter actually targets — asserted from the app, not restated here.
import { WCAG_MIN_CONTRAST } from '../../src/lib/colorUtils.js'

// The two opaque surfaces stat text renders on: the default dark paper and the
// RSLH skin's lighter card paper (src/lib/rslhPreset.ts).
const PAPERS = { dark: '#1E1E1E', rslh: '#2C2C2C' } as const
// RSLH tints SELECTED surfaces with this warm tan — the reason DNG moved off umber.
const RSLH_SELECTION_TINT = '#cc9064'
// The light scheme's paper — where these pale defaults need the adapter.
const LIGHT_PAPER = '#FFFFFF'
const AA_TEXT_RATIO = 4.5

const toRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}
const relativeLuminance = (rgb: readonly number[]): number => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (fg: string, bgRgb: readonly number[]): number => {
  const a = relativeLuminance(toRgb(fg)) + 0.05
  const b = relativeLuminance(bgRgb) + 0.05
  return Math.max(a, b) / Math.min(a, b)
}
const toHex = (rgb: readonly number[]): string => `#${rgb.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')}`
const composite = (base: string, over: string, alpha: number): number[] =>
  toRgb(base).map((c, i) => Math.round(c * (1 - alpha) + toRgb(over)[i]! * alpha))

test('every anomalous default foreground clears AA text contrast on both papers', () => {
  for (const variant of ANOMALOUS_SUBSTAT_VARIANTS) {
    const fg = DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]
    assert.ok(fg, `${statVariantI18nKey(variant)} has a default foreground`)
    for (const [name, paper] of Object.entries(PAPERS)) {
      const ratio = contrast(fg!, toRgb(paper))
      assert.ok(
        ratio >= AA_TEXT_RATIO,
        `${statVariantI18nKey(variant)} (${fg}) on ${name} paper: ${ratio.toFixed(2)} < ${AA_TEXT_RATIO}`,
      )
    }
  }
})

test('the ⚔/🛡 members of each mode stay visually distinct', () => {
  // The pair is separated by lightness. If the two ever converge, the rows become
  // indistinguishable at a glance even though both are individually legible.
  const half = ANOMALOUS_SUBSTAT_VARIANTS.length / 2
  for (let i = 0; i < half; i += 1) {
    const plus = DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[ANOMALOUS_SUBSTAT_VARIANTS[i]!]!
    const minus = DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[ANOMALOUS_SUBSTAT_VARIANTS[i + half]!]!
    assert.notEqual(plus, minus)
    // "🛡" is the lighter member, by a margin wide enough to read as different.
    const lPlus = relativeLuminance(toRgb(plus))
    const lMinus = relativeLuminance(toRgb(minus))
    assert.ok(lMinus > lPlus, `expected the 🛡 member (${minus}) to be lighter than ⚔ (${plus})`)
    assert.ok(lMinus - lPlus > 0.15, `⚔/🛡 pair too close: ${plus} vs ${minus}`)
  }
})

test('the LIGHT scheme rescues these pale defaults through the contrast adapter', () => {
  // The defaults are tuned for the dark surfaces they render on raw. On the light
  // scheme they are far too pale to use directly — which is exactly what
  // adaptSubstatFgOnSurface is for. Assert the adapter actually lands them at AA,
  // so "looks fine in dark" can never quietly mean "invisible in light".
  for (const variant of ANOMALOUS_SUBSTAT_VARIANTS) {
    const raw = DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]!
    // Unadapted, these genuinely fail on white — that is the premise being checked.
    assert.ok(
      contrast(raw, toRgb(LIGHT_PAPER)) < WCAG_MIN_CONTRAST,
      `${statVariantI18nKey(variant)} (${raw}) unexpectedly already passes on light paper`,
    )
    const adapted = adaptSubstatFgOnSurface(raw, LIGHT_PAPER)
    assert.ok(adapted, 'adapter returns a colour')
    assert.ok(
      contrast(adapted!, toRgb(LIGHT_PAPER)) >= WCAG_MIN_CONTRAST,
      `${statVariantI18nKey(variant)} adapted to ${adapted} still under the adapter bar on light paper: ${contrast(adapted!, toRgb(LIGHT_PAPER)).toFixed(2)}`,
    )
  }
})

test('the RSLH selected-row surface stays the hardest case, and is survivable', () => {
  // RSLH tints selected surfaces warm tan, which is why DNG moved off umber: a
  // brownish stat on a tan row is a hue collision the adapter cannot fix, because
  // it adjusts lightness rather than hue. Assert the adapter clears AA there too.
  const selectedSurface = toHex(composite(PAPERS.rslh, RSLH_SELECTION_TINT, 0.4))
  for (const variant of ANOMALOUS_SUBSTAT_VARIANTS) {
    const adapted = adaptSubstatFgOnSurface(DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]!, selectedSurface)
    assert.ok(
      contrast(adapted!, toRgb(selectedSurface)) >= WCAG_MIN_CONTRAST,
      `${statVariantI18nKey(variant)} on the RSLH selected row: ${contrast(adapted!, toRgb(selectedSurface)).toFixed(2)}`,
    )
  }
})

test('every anomalous variant has a matching background tint', () => {
  // The chip surface is drawn from this table; a missing entry silently falls back
  // to the neutral chip and loses the per-mode identity.
  for (const variant of ANOMALOUS_SUBSTAT_VARIANTS) {
    const bg = DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT[variant]
    assert.ok(bg, `${statVariantI18nKey(variant)} has a default background`)
    // The tint must stay dark enough for the light foreground above to sit on it.
    const ratio = contrast(DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]!, toRgb(bg!))
    assert.ok(ratio >= AA_TEXT_RATIO, `${statVariantI18nKey(variant)} on its own chip tint: ${ratio.toFixed(2)}`)
  }
  // Sanity: the composite check above is meaningful only if the tints really are
  // surfaces, so confirm one selected-row composite is still darker than the fg.
  const sample = ANOMALOUS_SUBSTAT_VARIANTS[0]!
  const selected = composite(PAPERS.rslh, RSLH_SELECTION_TINT, 0.4)
  assert.ok(contrast(DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[sample]!, selected) > 1)
})
