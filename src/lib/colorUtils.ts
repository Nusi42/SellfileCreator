/**
 * Theme-adaptive color utilities for named-appearance hex colors.
 *
 * Self-contained color math (no external color library) — keeps the bundle lean since
 * the whole app only needs a handful of operations. All sRGB/Lab/LCH conversions use
 * the D65 white point and the standard CIE constants.
 *
 * Primary exports:
 *  - blendAlpha         — composite a semi-transparent tint over an opaque base hex
 *  - compositeOnBase    — resolve any CSS bg color string to an opaque hex over a base
 *  - ensureContrastOnBg — adjust text lightness in LCH until 3:1 WCAG contrast passes
 *  - hslToHex           — HSL (0–360 / 0–1 / 0–1) → "#rrggbb" (used by ThemeEditorMenu)
 */

// ─── Primitive color types ───────────────────────────────────────────────────
// RGB channels are 0–255; alpha is 0–1. LCH: L* 0–100, C* ≥ 0, H° 0–360.
export type Rgb = { r: number; g: number; b: number }
type Rgba = Rgb & { a: number }

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

// ─── Parsing / formatting ─────────────────────────────────────────────────────

// Clamp to a byte and round — shared by every channel write so output stays in-gamut.
const toByte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))

// Parse "#rgb" / "#rgba" / "#rrggbb" / "#rrggbbaa" → {r,g,b,a}; null on bad input.
function parseHexColor(hex: string): Rgba | null {
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(hex.trim())
  if (!m) return null
  const h = m[1]!
  // Expand 3/4-digit shorthand by doubling each nibble (e.g. "f0a" → "ff00aa").
  if (h.length === 3 || h.length === 4) {
    const r = parseInt(h[0]! + h[0]!, 16)
    const g = parseInt(h[1]! + h[1]!, 16)
    const b = parseInt(h[2]! + h[2]!, 16)
    const a = h.length === 4 ? parseInt(h[3]! + h[3]!, 16) / 255 : 1
    return { r, g, b, a }
  }
  if (h.length === 6 || h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    return { r, g, b, a }
  }
  return null
}

// Parse "rgb(r,g,b)" / "rgba(r,g,b,a)" (comma or slash separated) → {r,g,b,a}; null otherwise.
function parseRgbColor(css: string): Rgba | null {
  const m = /^rgba?\(([^)]+)\)$/i.exec(css.trim())
  if (!m) return null
  // Split on commas and slashes so both legacy "r,g,b,a" and modern "r g b / a" parse.
  const parts = m[1]!.split(/[,/]/).map((p) => p.trim()).filter((p) => p.length > 0)
  if (parts.length < 3) return null
  const channel = (s: string): number => s.endsWith('%') ? (parseFloat(s) / 100) * 255 : parseFloat(s)
  const r = channel(parts[0]!), g = channel(parts[1]!), b = channel(parts[2]!)
  if (![r, g, b].every(Number.isFinite)) return null
  let a = 1
  if (parts.length >= 4) {
    const raw = parts[3]!
    a = raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw)
    if (!Number.isFinite(a)) a = 1
  }
  return { r, g, b, a: Math.max(0, Math.min(1, a)) }
}

// Resolve any supported CSS color string to {r,g,b,a}; null on unparseable input.
function parseColor(css: string): Rgba | null {
  if (typeof css !== 'string' || css.length === 0) return null
  return css.startsWith('#') ? parseHexColor(css) : parseRgbColor(css)
}

// Format opaque RGB to "#rrggbb".
function rgbToHex({ r, g, b }: Rgb): string {
  const hx = (v: number): string => toByte(v).toString(16).padStart(2, '0')
  return `#${hx(r)}${hx(g)}${hx(b)}`
}

// Per-channel sRGB interpolation (gamma space): t=0 → base, t=1 → tint. Channels stay float;
// callers that render to CSS round via rgbToHex/rgbToCss. Exported as the SSOT lerp for
// gradient/heatmap overlays so the formula is not duplicated per component.
export function mixRgb(base: Rgb, tint: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t))
  return {
    r: base.r + (tint.r - base.r) * k,
    g: base.g + (tint.g - base.g) * k,
    b: base.b + (tint.b - base.b) * k,
  }
}

/**
 * Alpha-composite a semi-transparent tint over an opaque base hex (Porter-Duff over, sRGB).
 * alpha=0 → pure base, alpha=1 → pure tint. Returns baseHex on parse failure.
 *
 * Use this to resolve the actual rendered chip surface before passing to ensureContrastOnBg,
 * whenever the chip background is `rgba(paletteColor, alpha)` over paper.
 */
export function blendAlpha(baseHex: string, tintHex: string, alpha: number): string {
  const base = parseColor(baseHex), tint = parseColor(tintHex)
  if (!base || !tint) return baseHex
  return rgbToHex(mixRgb(base, tint, alpha))
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
  const base = parseColor(baseHex), top = parseColor(cssColor)
  if (!base || !top) return baseHex
  // Fully opaque — the top color wins outright.
  if (top.a >= 1) return rgbToHex(top)
  // Otherwise blend the top color over the base at its own alpha.
  return rgbToHex(mixRgb(base, top, top.a))
}

// ─── WCAG contrast (operates on linear-light luminance) ───────────────────────

// sRGB channel (0–255) → linear-light [0,1] per the WCAG / IEC 61966-2-1 transfer function.
function linearizeChannel(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

// WCAG relative luminance of an sRGB color.
function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b)
}

// WCAG contrast ratio between two sRGB colors: (lighter + 0.05) / (darker + 0.05).
function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// ─── sRGB ↔ LCH (D65) ─────────────────────────────────────────────────────────
// CIE constants for the Lab f()/f⁻¹() piecewise functions.
const LAB_EPS = 216 / 24389 // ≈ 0.008856
const LAB_KAPPA = 24389 / 27 // ≈ 903.3
// D65 reference white (Y normalized to 100).
const D65 = { x: 95.047, y: 100.0, z: 108.883 }

// sRGB hex/rgb → [L*, C*, H°]. Achromatic colors yield NaN hue (caller substitutes 0).
function rgbToLch({ r, g, b }: Rgb): [number, number, number] {
  // 1. Linearize and scale to 0–100 for XYZ.
  const lr = linearizeChannel(r) * 100, lg = linearizeChannel(g) * 100, lb = linearizeChannel(b) * 100
  // 2. Linear sRGB → XYZ (D65).
  const x = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750
  const z = lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041
  // 3. XYZ → Lab.
  const f = (t: number): number => (t > LAB_EPS ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116)
  const fx = f(x / D65.x), fy = f(y / D65.y), fz = f(z / D65.z)
  const L = 116 * fy - 16
  const A = 500 * (fx - fy)
  const B = 200 * (fy - fz)
  // 4. Lab → LCH.
  const C = Math.sqrt(A * A + B * B)
  let H = (Math.atan2(B, A) * 180) / Math.PI
  if (H < 0) H += 360
  return [L, C, H]
}

// [L*, C*, H°] → sRGB, clamped into gamut. Returns 0–255 channels.
function lchToRgb(L: number, C: number, H: number): Rgb {
  // 1. LCH → Lab.
  const hr = (H * Math.PI) / 180
  const A = C * Math.cos(hr)
  const B = C * Math.sin(hr)
  // 2. Lab → XYZ.
  const fy = (L + 16) / 116
  const fx = fy + A / 500
  const fz = fy - B / 200
  const fInv = (t: number): number => {
    const t3 = t * t * t
    return t3 > LAB_EPS ? t3 : (116 * t - 16) / LAB_KAPPA
  }
  const x = fInv(fx) * D65.x
  const y = (L > LAB_KAPPA * LAB_EPS ? Math.pow((L + 16) / 116, 3) : L / LAB_KAPPA) * D65.y
  const z = fInv(fz) * D65.z
  // 3. XYZ → linear sRGB (scale XYZ back from 0–100).
  const xs = x / 100, ys = y / 100, zs = z / 100
  const lr = xs * 3.2404542 + ys * -1.5371385 + zs * -0.4985314
  const lg = xs * -0.9692660 + ys * 1.8760108 + zs * 0.0415560
  const lb = xs * 0.0556434 + ys * -0.2040259 + zs * 1.0572252
  // 4. Linear → sRGB gamma; clamp handled by toByte.
  const gamma = (c: number): number => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
    return v * 255
  }
  return { r: toByte(gamma(lr)), g: toByte(gamma(lg)), b: toByte(gamma(lb)) }
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
export function ensureContrastOnBg(textHex: string, bgHex: string, minContrast: number = WCAG_MIN_CONTRAST): string {
  const key = `${textHex}|${bgHex}|${minContrast}`
  const cached = contrastCache.get(key)
  if (cached !== undefined) return cached

  const result = computeContrastAdjustment(textHex, bgHex, minContrast)

  if (contrastCache.size >= CONTRAST_CACHE_MAX) {
    const oldest = contrastCache.keys().next().value
    if (oldest !== undefined) contrastCache.delete(oldest)
  }
  contrastCache.set(key, result)
  return result
}

function computeContrastAdjustment(textHex: string, bgHex: string, minContrast: number): string {
  const text = parseColor(textHex), bg = parseColor(bgHex)
  // Unparseable input (e.g. a CSS var token or garbage) — leave the caller's value as-is.
  if (!text || !bg) return textHex

  if (contrastRatio(text, bg) >= minContrast) return textHex

  // Adjust only L* in LCH; keep C* (chroma/saturation) and H* (hue) constant.
  // LCH is perceptually uniform: equal L* steps look equally bright across all hues.
  const [L, C, H] = rgbToLch(text)
  // Achromatic colors have an undefined hue — any angle works when C* = 0.
  const safeH = isFinite(H) ? H : 0

  // Direction: toward the extreme (L*=0 or L*=100) that yields higher contrast vs bg.
  const black: Rgb = { r: 0, g: 0, b: 0 }, white: Rgb = { r: 255, g: 255, b: 255 }
  const towardBlack = contrastRatio(black, bg) >= contrastRatio(white, bg)
  const targetL = towardBlack ? 0 : 100

  // Binary search: lo = current (fails), hi = extreme (always passes).
  // Contrast is evaluated on the clamped sRGB result so the returned hex truly meets the
  // threshold even when a high-chroma color is out of gamut at extreme lightness.
  let lo = L, hi = targetL
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (contrastRatio(lchToRgb(mid, C, safeH), bg) >= minContrast) {
      hi = mid
    } else {
      lo = mid
    }
  }

  return rgbToHex(lchToRgb(hi, C, safeH))
}

// ─── Public conversion helpers (SSOT for ad-hoc color math across components) ──

// Parse a hex or rgb()/rgba() CSS color to clamped integer-ish {r,g,b}; null on failure.
// Alpha is dropped — callers needing it use parseHexWithAlpha. Used by heatmap/gradient overlays.
export function parseCssColorToRgb(color: string): Rgb | null {
  const c = parseColor(color)
  if (!c) return null
  const cl = (v: number): number => Math.max(0, Math.min(255, v))
  return { r: cl(c.r), g: cl(c.g), b: cl(c.b) }
}

// Format an RGB color as a CSS "rgb(r, g, b)" string with integer channels.
export function rgbToCss(rgb: Rgb): string {
  return `rgb(${toByte(rgb.r)}, ${toByte(rgb.g)}, ${toByte(rgb.b)})`
}

// 6-digit hex with optional 2-digit alpha → { base:"#RRGGBB", alpha:0–1 }; null on bad input.
const HEX_WITH_OPTIONAL_ALPHA = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/
export function parseHexWithAlpha(value: string | undefined): { base: string; alpha: number } | null {
  if (typeof value !== 'string') return null
  const m = HEX_WITH_OPTIONAL_ALPHA.exec(value.trim())
  if (!m) return null
  const base = `#${m[1]!.toUpperCase()}`
  const alphaByte = m[2] ? parseInt(m[2], 16) : 255
  const alpha = Number.isNaN(alphaByte) ? 1 : Math.max(0, Math.min(1, alphaByte / 255))
  return { base, alpha }
}

// Inverse of parseHexWithAlpha: encode an alpha (0–1) back onto a "#RRGGBB" base. Drops the
// alpha suffix when fully opaque so callers store the canonical 6-digit form.
export function formatHexWithAlpha(base: string, alpha: number): string {
  const normalized = Math.max(0, Math.min(1, alpha))
  const upperBase = base.toUpperCase()
  if (normalized >= 0.999) return upperBase
  const alphaHex = Math.round(normalized * 255).toString(16).padStart(2, '0').toUpperCase()
  return `${upperBase}${alphaHex}`
}

// "#rrggbb" → { h:0–360, s:0–100, l:0–100 }; null on too-short input. Used by ThemeEditorMenu.
export function hexToHSL(hex: string): { h: number; s: number; l: number } | null {
  if (hex.length < 7) return null
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  const l = (max + min) / 2
  if (d === 0) return { h: 0, s: 0, l: l * 100 }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + 6) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: h * 60, s: s * 100, l: l * 100 }
}

// "#rrggbb" → the space-separated "R G B" channel string MUI's CSS variables expect.
export function hexToChannelTriplet(hex: string): string {
  return `${parseInt(hex.slice(1, 3), 16)} ${parseInt(hex.slice(3, 5), 16)} ${parseInt(hex.slice(5, 7), 16)}`
}

// HSL with degrees + 0–100 s/l (the form ThemeEditorMenu works in) → "#rrggbb".
// Wraps hue and rescales to the 0–1 form hslToHex expects.
export function hslDegToHex(h: number, s: number, l: number): string {
  return hslToHex(((h % 360) + 360) % 360, s / 100, l / 100)
}
