/**
 * Theme-adaptive color utilities for named-appearance hex colors.
 *
 * Primary exports:
 *  - blendAlpha         — composite a semi-transparent tint over an opaque base hex
 *  - compositeOnBase    — resolve any CSS bg color string to an opaque hex over a base
 *  - ensureContrastOnBg — adjust text lightness in LCH until 3:1 WCAG contrast passes
 *  - hslToHex           — HSL (0–360 / 0–1 / 0–1) → "#rrggbb" (used by ThemeEditorMenu)
 */

import chroma from 'chroma-js'

/**
 * Convert [h (0–360), s (0–1), l (0–1)] to a "#rrggbb" hex string.
 * Exported for callers (e.g. ThemeEditorMenu adapter) that already work in HSL.
 */
export const hslToHex = (h: number, s: number, l: number): string => {
  // HWB-based per-channel formula; offsets are 0, 8, 4 for R, G, B.
  const a = s * Math.min(l, 1 - l)
  const ch = (n: number): string => {
    const k = (n + h / 30) % 12
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
    return Math.round(255 * Math.max(0, Math.min(1, v))).toString(16).padStart(2, '0')
  }
  return `#${ch(0)}${ch(8)}${ch(4)}`
}

/**
 * Alpha-composite a semi-transparent tint over an opaque base hex (Porter-Duff over, sRGB).
 * alpha=0 → pure base, alpha=1 → pure tint. Returns baseHex on parse failure.
 *
 * Use this to resolve the actual rendered chip surface before passing to ensureContrastOnBg,
 * whenever the chip background is `rgba(paletteColor, alpha)` over paper.
 */
export function blendAlpha(baseHex: string, tintHex: string, alpha: number): string {
  try {
    // chroma.mix(c1, c2, t, 'rgb'): t=0 → c1, t=1 → c2 in sRGB
    return chroma.mix(baseHex, tintHex, alpha, 'rgb').hex()
  } catch {
    return baseHex
  }
}

/**
 * Resolve a CSS bg color string to an opaque "#rrggbb" by compositing it over baseHex.
 * Handles: "#rrggbb"/"#rgb" hex, "rgba(r,g,b,a)", "rgb(r,g,b)", "transparent".
 * CSS variable strings (e.g. "rgba(var(--foo) / var(--bar))") fall back to baseHex.
 *
 * Use this when a chip's backgroundColor sx value is a theme-resolved rgba or hex string
 * so that ensureContrastOnBg receives the actual rendered surface color.
 */
export function compositeOnBase(baseHex: string, cssColor: string): string {
  if (!cssColor || cssColor === 'transparent') return baseHex
  try {
    const color = chroma(cssColor)
    const alpha = color.alpha()
    // Fully opaque — return the hex directly without blending.
    if (alpha >= 1) return color.hex()
    // Strip alpha, then blend the opaque tint over the base at the extracted alpha.
    return chroma.mix(baseHex, color.alpha(1).hex(), alpha, 'rgb').hex()
  } catch {
    // Unparseable (e.g. CSS var token) — treat the bg as the base color.
    return baseHex
  }
}

// WCAG 3.0:1 target — AA level for UI components and large text (WCAG SC 1.4.11 / 1.4.3 large).
// Using 3.0 rather than the normal-text 4.5 prevents extreme darkening of preset colors
// that were designed for a different background mode; practical readability is preserved.
const WCAG_MIN_CONTRAST = 3.0

// 32-entry result cache: avoids the 20-step binary search for repeated (text, bg) pairs.
// Map insertion order keeps the oldest entry at keys().next() for eviction.
const contrastCache = new Map<string, string>()
const CONTRAST_CACHE_MAX = 32

/**
 * Adjust the text color's LCH lightness until it achieves ≥3:1 WCAG contrast against bgHex.
 *
 * Operates in LCH color space — perceptually uniform, so hue and saturation are preserved
 * faithfully across the lightness adjustment. Direction is chosen automatically: toward
 * black when the background is light, toward white when dark.
 *
 * Results are memoized in a 32-entry LRU cache keyed by the hex pair.
 * Returns the original textHex unchanged when it already passes, or on parse failure.
 */
export function ensureContrastOnBg(textHex: string, bgHex: string): string {
  const key = `${textHex}|${bgHex}`
  const cached = contrastCache.get(key)
  if (cached !== undefined) return cached

  const result = computeContrastAdjustment(textHex, bgHex)

  if (contrastCache.size >= CONTRAST_CACHE_MAX) {
    const oldest = contrastCache.keys().next().value
    if (oldest !== undefined) contrastCache.delete(oldest)
  }
  contrastCache.set(key, result)
  return result
}

function computeContrastAdjustment(textHex: string, bgHex: string): string {
  let textColor: chroma.Color, bgColor: chroma.Color
  try {
    textColor = chroma(textHex)
    bgColor = chroma(bgHex)
  } catch {
    return textHex
  }

  if (chroma.contrast(textColor, bgColor) >= WCAG_MIN_CONTRAST) return textHex

  // Adjust only L* in LCH; keep C* (chroma/saturation) and H* (hue) constant.
  // LCH is perceptually uniform: equal L* steps look equally bright across all hues.
  const [L, C, H] = textColor.lch()
  // Achromatic colors have an undefined hue — any angle works when C* = 0.
  const safeH = isFinite(H) ? H : 0

  // Direction: toward the extreme (L*=0 or L*=100) that yields higher contrast.
  const towardBlack = chroma.contrast(chroma('black'), bgColor) >= chroma.contrast(chroma('white'), bgColor)
  const targetL = towardBlack ? 0 : 100

  // Binary search: lo = current (fails), hi = extreme (always passes).
  // Converges to the minimum-adjustment L* that meets the threshold.
  let lo = L, hi = targetL
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const midColor = chroma.lch(mid, C, safeH)
    if (chroma.contrast(midColor, bgColor) >= WCAG_MIN_CONTRAST) {
      hi = mid
    } else {
      lo = mid
    }
  }

  return chroma.lch(hi, C, safeH).hex()
}
