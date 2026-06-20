/**
 * domMeasurements.ts
 *
 * Shared DOM measurement helpers that stay stable under zoom.
 */

// Prefer layout metrics that keep CSS pixel sizes even when the root zooms.
export const measureCssWidth = (target: HTMLElement): number => {
  const layoutWidth = Math.max(target.offsetWidth || 0, target.clientWidth || 0)
  if (layoutWidth > 0) return layoutWidth
  // Fallback to bounding box when layout metrics are unavailable (hidden nodes, SVG, etc.).
  return Math.floor(target.getBoundingClientRect().width || 0)
}

// Lazily-created offscreen 2D context reused across measureTextWidth calls — a single
// canvas is enough since measurement is synchronous and we set the font each time.
let textMeasureCtx: CanvasRenderingContext2D | null = null

// Build the CSS shorthand `font` string a canvas context understands from an element's
// computed style. Mirrors the font properties that actually affect advance width so the
// canvas measurement matches what the browser would lay out for that element's text.
const cssFontFromComputed = (style: CSSStyleDeclaration): string => {
  const { fontStyle, fontWeight, fontSize, fontFamily } = style
  // `font-size/line-height font-family` — line-height is irrelevant to width, omit it.
  return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`
}

// Measure the rendered width (in CSS px) of `text` as it would appear using `reference`'s
// font. Used by useFittingLabel to choose the widest label tier that fits without
// touching the DOM or forcing a reflow per candidate. Returns 0 when canvas is absent.
export const measureTextWidth = (text: string, reference: HTMLElement): number => {
  if (!textMeasureCtx) {
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
    textMeasureCtx = canvas ? canvas.getContext('2d') : null
  }
  if (!textMeasureCtx) return 0
  // Re-read the font each call: the reference element's typography can change with theme.
  textMeasureCtx.font = cssFontFromComputed(window.getComputedStyle(reference))
  return textMeasureCtx.measureText(text).width
}
