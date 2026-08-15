/**
 * labelColors.ts
 *
 * Deterministic, contrast-adapted colours for user-named labels: recipe/safeguard TAGS and
 * safeguard GROUP ids. The same string always maps to the same hue, so a tag reads the same
 * colour on every chip, in every panel and after every reload — without anything being stored.
 *
 * Colour SSOT: the hue comes from a string hash, is pushed OUT of the hue bands the theme's
 * semantic colours occupy (primary, error, warning, success, info — a label must never look like
 * a state), the base colour is built once here with a fixed saturation/lightness, and every
 * rendered value is run through `ensureContrastOnBg` against the ACTIVE scheme's surface (light,
 * dark and RSLH — which is dark plus a preset — all resolve through the same paper lookup), so the
 * label stays legible in all three themes. Fill tints reuse the `ALPHA` ladder; nothing here
 * hard-codes an alpha or a scheme.
 */
import { alpha } from '@mui/material/styles'
import { ensureContrastOnBg, hexToHSL, hslToHex, WCAG_NORMAL_TEXT_CONTRAST } from './colorUtils'
import { ALPHA } from './colorTints'

// Golden-angle stride spreads consecutive hashes around the wheel so two similar strings do
// not land on neighbouring hues.
const GOLDEN_ANGLE_DEG = 137.508
// Fixed chroma/lightness of the base colour before contrast adaptation. Mid-lightness so the
// adapter has room to move in either direction on light and dark surfaces.
const LABEL_BASE_SATURATION = 0.62
const LABEL_BASE_LIGHTNESS = 0.48
// Half-width of the exclusion band around each reserved (semantic) hue. A label hue landing
// inside a band is pushed to the band's nearer edge, so no tag or group can be mistaken for the
// theme's primary/error/warning/success/info tint.
const RESERVED_HUE_BAND_DEG = 22

/**
 * The hues (0–359°) of a set of reserved colours — pass the active scheme's semantic mains.
 * Greys (no hue) are dropped: they reserve nothing.
 */
export const reservedHuesOf = (colors: readonly string[]): number[] => (
  colors
    .map((color) => hexToHSL(color))
    .filter((hsl): hsl is { h: number; s: number; l: number } => hsl !== null && hsl.s > 0.1)
    .map((hsl) => ((hsl.h % 360) + 360) % 360)
)

const norm = (hue: number): number => ((hue % 360) + 360) % 360

/**
 * Pushes a hue out of every reserved band, deterministically. The bands (±RESERVED_HUE_BAND_DEG
 * around each reserved hue) are merged into disjoint forbidden arcs first — neighbouring
 * semantic hues (a red error and an orange warning) overlap — and a hue inside an arc moves to
 * that arc's NEARER edge (ties go clockwise). Merging first is what makes the result stable:
 * stepping out of one band can never land inside another.
 */
export const avoidReservedHues = (hue: number, reserved: readonly number[]): number => {
  const current = norm(hue)
  if (reserved.length === 0) return current
  // Forbidden arcs as [start, end] on an unwrapped 0–720 axis so wrap-around merges cleanly.
  const arcs: Array<[number, number]> = reserved
    .map((r): [number, number] => [norm(r) - RESERVED_HUE_BAND_DEG, norm(r) + RESERVED_HUE_BAND_DEG])
    .flatMap(([a, b]): Array<[number, number]> => [[a, b], [a + 360, b + 360]])
    .sort((left, right) => left[0] - right[0])
  const merged: Array<[number, number]> = []
  for (const [a, b] of arcs) {
    const last = merged[merged.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else merged.push([a, b])
  }
  // Test the hue on both laps of the axis so an arc straddling 0°/360° is caught either way.
  for (const probe of [current, current + 360]) {
    const hit = merged.find(([a, b]) => probe > a && probe < b)
    if (!hit) continue
    const [a, b] = hit
    // Nearer edge wins; an exact midpoint goes clockwise (to the end of the arc).
    return norm(probe - a < b - probe ? a : b)
  }
  return current
}

/** FNV-1a hash of a string, folded to a 0–359° hue with a golden-angle spread. */
export const labelHueOf = (key: string, reserved: readonly number[] = []): number => {
  // FNV-1a over UTF-16 code units — cheap, stable, well distributed for short labels.
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return avoidReservedHues(((hash % 360) * GOLDEN_ANGLE_DEG) % 360, reserved)
}

/** The raw (pre-adaptation) hex colour of a label — for swatches, never for text. */
export const labelBaseColorOf = (key: string, reserved: readonly number[] = []): string => (
  hslToHex(labelHueOf(key, reserved), LABEL_BASE_SATURATION, LABEL_BASE_LIGHTNESS)
)

/**
 * The label's colour adapted for legible TEXT/borders on `surfaceHex` — the active scheme's
 * paper (see `useSchemePaper`) or a composited chip surface — steering clear of `reserved` hues
 * (see `useReservedLabelHues`). Normal-text contrast, because tag chips and group badges are small.
 */
export const resolveLabelColor = (key: string, surfaceHex: string, reserved: readonly number[] = []): string => (
  ensureContrastOnBg(labelBaseColorOf(key, reserved), surfaceHex, WCAG_NORMAL_TEXT_CONTRAST)
)

/**
 * The three values a coloured label chip needs: text/border colour plus a faint fill of the same
 * hue. One definition so tag chips in the builder strip, the chip lists and the popover all
 * render identically.
 */
export const resolveLabelChipColors = (
  key: string,
  surfaceHex: string,
  reserved: readonly number[] = [],
): { fg: string; border: string; bg: string } => {
  const fg = resolveLabelColor(key, surfaceHex, reserved)
  return { fg, border: alpha(fg, ALPHA.a60), bg: alpha(fg, ALPHA.a12) }
}
