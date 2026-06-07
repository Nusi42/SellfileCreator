import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RARITY_ACCENT_COLORS, resolveRarityAccentColor, resolveRarityTextColor } from '../../src/lib/rarityColors.js'

// WCAG contrast helper (mirrors the app's formula) for asserting legibility.
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const lum = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255)
}
const contrast = (a: string, b: string) => {
  const la = lum(a), lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// Accent palette resolves rank 1–6 and clamps out-of-range; null for missing.
test('resolveRarityAccentColor maps ranks and clamps', () => {
  assert.equal(resolveRarityAccentColor(1), RARITY_ACCENT_COLORS[1])
  assert.equal(resolveRarityAccentColor(6), RARITY_ACCENT_COLORS[6])
  assert.equal(resolveRarityAccentColor(99), RARITY_ACCENT_COLORS[6]) // clamped
  assert.equal(resolveRarityAccentColor(null), undefined)
  assert.equal(resolveRarityAccentColor(undefined), undefined)
})

// Mythical dark-red (#8b0000) is illegible as text on a dark surface (~1.7:1) —
// resolveRarityTextColor must lighten it to pass the WCAG threshold.
test('resolveRarityTextColor lightens the dark mythical accent on a dark surface', () => {
  const surface = '#161b22'
  const raw = resolveRarityAccentColor(6)!
  const adjusted = resolveRarityTextColor(6, surface)!
  assert.notEqual(adjusted, raw)
  assert.ok(contrast(adjusted, surface) >= 3.0 - 1e-6, `expected ≥3:1, got ${contrast(adjusted, surface).toFixed(2)}`)
})

// A bright accent that already contrasts on the surface is returned unchanged.
test('resolveRarityTextColor leaves already-legible accents unchanged', () => {
  // Legendary gold (#f9a825) on a dark surface already exceeds 3:1.
  assert.equal(resolveRarityTextColor(5, '#161b22'), resolveRarityAccentColor(5))
  assert.equal(resolveRarityTextColor(null, '#161b22'), undefined)
})
