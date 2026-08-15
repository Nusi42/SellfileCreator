/**
 * labelColors.ts
 *
 * Deterministic, contrast-adapted colours for user-named labels: recipe/safeguard TAGS and
 * safeguard GROUP ids. The same string always maps to the same hue, so a tag reads the same
 * colour on every chip, in every panel and after every reload — without anything being stored.
 *
 * Colour SSOT: the hue comes from a string hash, the base colour is built once here with a
 * fixed saturation/lightness, and every rendered value is run through `ensureContrastOnBg`
 * against the ACTIVE scheme's surface (light, dark and RSLH — which is dark plus a preset — all
 * resolve through the same paper lookup), so the label stays legible in all three themes. Fill
 * tints reuse the `ALPHA` ladder; nothing here hard-codes an alpha or a scheme.
 */
import { alpha } from '@mui/material/styles'
import { ensureContrastOnBg, hslToHex, WCAG_NORMAL_TEXT_CONTRAST } from './colorUtils'
import { ALPHA } from './colorTints'

// Golden-angle stride spreads consecutive hashes around the wheel so two similar strings do
// not land on neighbouring hues.
const GOLDEN_ANGLE_DEG = 137.508
// Fixed chroma/lightness of the base colour before contrast adaptation. Mid-lightness so the
// adapter has room to move in either direction on light and dark surfaces.
const LABEL_BASE_SATURATION = 0.62
const LABEL_BASE_LIGHTNESS = 0.48

/** FNV-1a hash of a string, folded to a 0–359° hue with a golden-angle spread. */
export const labelHueOf = (key: string): number => {
  // FNV-1a over UTF-16 code units — cheap, stable, well distributed for short labels.
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return ((hash % 360) * GOLDEN_ANGLE_DEG) % 360
}

/** The raw (pre-adaptation) hex colour of a label — for swatches, never for text. */
export const labelBaseColorOf = (key: string): string => (
  hslToHex(labelHueOf(key), LABEL_BASE_SATURATION, LABEL_BASE_LIGHTNESS)
)

/**
 * The label's colour adapted for legible TEXT/borders on `surfaceHex` — the active scheme's
 * paper (see `useSchemePaper`) or a composited chip surface. Normal-text contrast, because tag
 * chips and group badges are small.
 */
export const resolveLabelColor = (key: string, surfaceHex: string): string => (
  ensureContrastOnBg(labelBaseColorOf(key), surfaceHex, WCAG_NORMAL_TEXT_CONTRAST)
)

/**
 * The three values a coloured label chip needs: text/border colour plus a faint fill of the same
 * hue. One definition so tag chips in the builder strip, the chip lists and the popover all
 * render identically.
 */
export const resolveLabelChipColors = (
  key: string,
  surfaceHex: string,
): { fg: string; border: string; bg: string } => {
  const fg = resolveLabelColor(key, surfaceHex)
  return { fg, border: alpha(fg, ALPHA.a60), bg: alpha(fg, ALPHA.a12) }
}
