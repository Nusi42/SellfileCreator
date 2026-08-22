/**
 * rulesTableAutoWidth.ts
 *
 * Measuring a preview column against its WHOLE content, not just the rendered window.
 *
 * A column whose stored width is `RULES_TABLE_COL_WIDTH_AUTO` sizes itself to the widest value
 * any row holds — including rows far outside the virtualized window. The table can carry 100k
 * rules, so the measurement must never touch the DOM per row: laying out 100k cells to read
 * their scrollWidth would cost seconds and defeat virtualization entirely.
 *
 * What makes that affordable is that the preview renders every column except the substats
 * summary in a MONOSPACE face. In a monospace face the advance width of a string is exactly
 * `length × advance`, so a row's width is a property of its character count — no canvas, no
 * layout, just arithmetic over strings the table already builds and caches.
 *
 * That assumption is load-bearing, so it is asserted rather than trusted: `assertMonospaceAdvance`
 * measures a couple of dissimilar strings in the real font and throws in development if their
 * advances disagree. If someone later switches the preview to a proportional face, this fails
 * loudly at that seam instead of silently producing columns that clip their content.
 */
import {
  FONT_FAMILY_MONO,
  FONT_SIZE_BASE_PX,
  RULES_TABLE_AUTO_WIDTH_MAX_PX,
  RULES_TABLE_AUTO_WIDTH_MIN_PX,
  RULES_TABLE_CELL_PADDING_X_TOTAL_PX,
  RULES_TABLE_COL_WIDTH_AUTO,
  RULES_TABLE_AUTO_WIDTH_TIE_SAMPLES,
} from '../lib/constants'

/** True when a column's stored width asks for content-based sizing. */
export const isAutoWidth = (width: number | null | undefined): boolean => (
  width === RULES_TABLE_COL_WIDTH_AUTO
)

/**
 * A column's content, reduced to the things that decide its width.
 *
 * Text columns report the longest string's character count; icon columns report the highest
 * icon count. A column is one or the other, never both, so the measurer keeps a single pair
 * and the caller decides which it fills.
 */
export interface ColumnContentExtent {
  /** Longest value in characters, for monospace text columns. */
  maxChars: number
  /** Most icons any single row draws, for icon columns. */
  maxIcons: number
  /**
   * Largest combined icon+text footprint seen in a single cell, for a column that draws both
   * at once. See `extendWithIconTextPair`; zero for every ordinary column.
   */
  maxPairIcons: number
  maxPairChars: number
  /**
   * Highest cheap "size" seen so far for a deferred column, and the rows that had it.
   *
   * See `considerByCount`: for columns whose text is expensive to build but whose length grows
   * monotonically with a countable input (substat entries, set ids), the pass records the
   * winning ROWS here and formats only those at the end instead of all 100k.
   */
  pendingCount: number
  pendingRows: unknown[]
}

/** An empty extent, so callers can fold rows onto it without a null branch. */
export const emptyContentExtent = (): ColumnContentExtent => (
  { maxChars: 0, maxIcons: 0, maxPairIcons: 0, maxPairChars: 0, pendingCount: -1, pendingRows: [] }
)

/**
 * Widen an extent to cover one more row's text. Mutates, because this runs once per row per
 * auto column over up to 100k rows — allocating a fresh object per step would dominate the pass.
 */
export const extendWithText = (extent: ColumnContentExtent, text: string): void => {
  if (text.length > extent.maxChars) extent.maxChars = text.length
}

/** Widen an extent to cover one more row's icon count. Mutates, for the same reason. */
export const extendWithIcons = (extent: ColumnContentExtent, count: number): void => {
  if (count > extent.maxIcons) extent.maxIcons = count
}

/**
 * Widen an extent for a row that draws icons AND text side by side in the same cell.
 *
 * `widthForExtent` normally takes the WIDER of the icon and text terms, because a column is
 * one kind or the other. The merged gate column breaks that: a rule can narrow both faction
 * (an icon) and rework (a glyph), and the cell lays them out in a row. Recording the combined
 * footprint here keeps such a row from being measured as though only its wider half existed.
 */
export const extendWithIconTextPair = (
  extent: ColumnContentExtent,
  iconCount: number,
  chars: number,
): void => {
  if (iconCount > extent.maxPairIcons || (iconCount === extent.maxPairIcons && chars > extent.maxPairChars)) {
    extent.maxPairIcons = iconCount
    extent.maxPairChars = chars
  }
}

/**
 * Record a row as a width candidate by a CHEAP count, deferring the costly string build.
 *
 * The premise, which the caller must honour per column: rendered length is monotonic in
 * `count` — a rule with fewer substats (or fewer sets) can never format wider than one with
 * more. Given that, only rows at the highest count can be the widest, so the pass compares
 * integers over every row and formats just those few, in `resolvePending`.
 *
 * Rows tied at the top count are all kept, up to `RULES_TABLE_AUTO_WIDTH_TIE_SAMPLES`: equal
 * counts can still differ in rendered length (a longer stat name, a wider number), and keeping
 * a handful makes the measurement exact in practice while still formatting a bounded number of
 * rows rather than one per rule. A higher count evicts the whole tied set.
 */
export const considerByCount = (extent: ColumnContentExtent, count: number, row: unknown): void => {
  // A strictly larger count invalidates everything kept so far.
  if (count > extent.pendingCount) {
    extent.pendingCount = count
    // Reuse the array rather than allocating per new maximum; this runs inside the 100k walk.
    extent.pendingRows.length = 0
    extent.pendingRows.push(row)
    return
  }
  // Tied with the current best: keep it, until the sample cap is reached.
  if (count === extent.pendingCount && extent.pendingRows.length < RULES_TABLE_AUTO_WIDTH_TIE_SAMPLES) {
    extent.pendingRows.push(row)
  }
}

/**
 * Resolve a deferred column's candidate rows into actual text.
 *
 * `format` runs at most `RULES_TABLE_AUTO_WIDTH_TIE_SAMPLES` times per column per pass, rather
 * than once per rule — the whole point of `considerByCount`. A column that never saw a row
 * leaves the extent untouched.
 */
export const resolvePending = (
  extent: ColumnContentExtent,
  format: (row: unknown) => string,
): void => {
  for (const row of extent.pendingRows) extendWithText(extent, format(row))
}

/**
 * The advance width of one character in the preview's monospace face, measured once.
 *
 * Cached for the lifetime of the page: the face and size are fixed constants, so re-measuring
 * per column or per rules change would only repeat the same canvas call.
 */
let cachedAdvancePx: number | null = null

/**
 * Fallback advance used when no canvas is available (SSR, jsdom without a 2D context).
 * Why 0.6em: the common advance ratio for monospace faces, deliberately slightly generous so a
 * column measured without canvas errs toward too wide rather than clipping its content.
 */
const FALLBACK_ADVANCE_RATIO = 0.6

/** The canvas context used for measurement, created lazily and reused. */
let measureContext: CanvasRenderingContext2D | null | undefined

const getMeasureContext = (): CanvasRenderingContext2D | null => {
  // `undefined` means "not tried yet"; `null` means "tried, unavailable" — do not retry.
  if (measureContext !== undefined) return measureContext
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.font = `${FONT_SIZE_BASE_PX}px ${FONT_FAMILY_MONO}`
    measureContext = ctx
  } catch {
    // Any environment without canvas falls back to the ratio above.
    measureContext = null
  }
  return measureContext
}

/**
 * Verify the preview font really is monospace, and report the disagreement when it is not.
 *
 * Returns null when the check passes (or cannot run), and a human-readable reason when it fails.
 * Compares two strings of equal length made of characters with very different proportional
 * widths: in a monospace face they measure identically, in any proportional face they do not.
 */
export const checkMonospaceAdvance = (): string | null => {
  const ctx = getMeasureContext()
  // Without a canvas there is nothing to check; the ratio fallback is used instead.
  if (!ctx) return null
  const narrow = ctx.measureText('iiiiiiiiii').width
  const wide = ctx.measureText('WWWWWWWWWW').width
  // Allow sub-pixel noise; a proportional face differs by whole pixels per character.
  if (Math.abs(narrow - wide) <= 1) return null
  return `preview font is not monospace: "iiiiiiiiii" is ${narrow.toFixed(1)}px but "WWWWWWWWWW" is ${wide.toFixed(1)}px`
}

/**
 * The per-character advance, measured against the real font.
 *
 * Asserts the monospace premise in development on first use, so a font change is caught at the
 * seam that depends on it rather than showing up later as mysteriously clipped columns.
 */
export const monospaceAdvancePx = (): number => {
  if (cachedAdvancePx !== null) return cachedAdvancePx
  const ctx = getMeasureContext()
  if (!ctx) {
    // No canvas: fall back to the generous ratio rather than refusing to size at all.
    cachedAdvancePx = FONT_SIZE_BASE_PX * FALLBACK_ADVANCE_RATIO
    return cachedAdvancePx
  }
  if (import.meta.env?.DEV) {
    const problem = checkMonospaceAdvance()
    // Loud in development, because every auto width below silently depends on this holding.
    if (problem) throw new Error(`[rules-table-auto-width] ${problem}`)
  }
  // Measure a run rather than one character, so sub-pixel advances average out instead of
  // rounding up once per character across a long value.
  const sample = 'M'.repeat(10)
  cachedAdvancePx = ctx.measureText(sample).width / sample.length
  return cachedAdvancePx
}

/** Clamp a raw content width into the bounds a usable column must respect, then add padding. */
const finishWidth = (contentPx: number): number => (
  Math.ceil(
    Math.min(RULES_TABLE_AUTO_WIDTH_MAX_PX, Math.max(RULES_TABLE_AUTO_WIDTH_MIN_PX, contentPx))
    + RULES_TABLE_CELL_PADDING_X_TOTAL_PX,
  )
)

/**
 * Resolve a measured extent into the pixel width the column should render at.
 *
 * `headerChars` is folded in by the caller's extent already; it is the header label that keeps a
 * column of empty cells readable. Icon columns pass their per-icon step so this stays ignorant
 * of which column it is sizing.
 */
export const widthForExtent = (extent: ColumnContentExtent, iconStepPx: number): number => {
  const advancePx = monospaceAdvancePx()
  // An icon column is one whose rows actually drew icons; otherwise treat it as text.
  const iconsPx = extent.maxIcons > 0 ? extent.maxIcons * iconStepPx : 0
  const textPx = extent.maxChars > 0 ? extent.maxChars * advancePx : 0
  // A cell that draws both at once needs their SUM, which can exceed either term alone.
  const pairPx = extent.maxPairIcons > 0
    ? extent.maxPairIcons * iconStepPx + extent.maxPairChars * advancePx
    : 0
  return finishWidth(Math.max(iconsPx, textPx, pairPx))
}
