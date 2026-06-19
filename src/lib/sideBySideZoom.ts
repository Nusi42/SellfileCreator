import { AUTO_SIDE_BY_SIDE_MIN_ZOOM, SIDE_BY_SIDE_TARGET_WIDTH_PX } from './constants'

// Single source of truth for the forced side-by-side zoom factor.
//
// The forced layout renders a fixed SIDE_BY_SIDE_TARGET_WIDTH_PX canvas and uses CSS `zoom` on
// #root to shrink it until both papers fit the real viewport. Every consumer that converts between
// visual (zoomed) and CSS pixels — the splitter drag math, the chips height measurement, the
// paper min-height seed — must agree on this one value, so the formula and the live-read helper
// both live here.

// The CSS custom property useAutoSideBySideZoom writes to <html> so portal content (and any code
// outside #root) can read the live zoom. Keep this name in sync with that hook and theme.ts.
export const APP_ZOOM_CSS_VAR = '--app-zoom'

export type SideBySideZoomDecision = {
  // Whether the forced side-by-side layout should be active at this width.
  forceSideBySide: boolean
  // Zoom to apply to #root: the fitted zoom when forced, 1 when stacked.
  zoom: number
}

/**
 * resolveSideBySideZoom
 *
 * SSOT for the force-vs-stack decision and the zoom that goes with it. The fixed canvas wants to
 * shrink to `raw = viewportWidth / target` to fit. While that fits at a zoom ≥ the cutoff we force
 * side-by-side at `min(raw, 1)` (never enlarging past native). Once `raw` drops below the cutoff the
 * viewport is too narrow to render both papers legibly, so we stop forcing and fall back to the
 * stacked layout at zoom 1 rather than shrinking the canvas further.
 */
export function resolveSideBySideZoom(viewportWidth: number): SideBySideZoomDecision {
  // Guard bad inputs (SSR, zero-width during teardown) — stacked, native scale.
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return { forceSideBySide: false, zoom: 1 }
  // Raw fit ratio: canvas width → viewport width.
  const raw = viewportWidth / SIDE_BY_SIDE_TARGET_WIDTH_PX
  // Below the cutoff → too narrow to fit legibly; revert to stacked single-column at native scale.
  if (raw < AUTO_SIDE_BY_SIDE_MIN_ZOOM) return { forceSideBySide: false, zoom: 1 }
  // Fits at an acceptable zoom → force side-by-side, never enlarging past native.
  return { forceSideBySide: true, zoom: Math.min(raw, 1) }
}

/**
 * computeSideBySideZoom
 *
 * The applied zoom for a given width — `resolveSideBySideZoom(...).zoom`. Kept as a thin accessor
 * for the coordinate-conversion callers that only need the scale factor, not the force decision.
 */
export function computeSideBySideZoom(viewportWidth: number): number {
  return resolveSideBySideZoom(viewportWidth).zoom
}

/**
 * getCurrentSideBySideZoom
 *
 * Live zoom for coordinate-space conversions. Returns 1 when not in forced mode. When forced, reads
 * the value useAutoSideBySideZoom published to `--app-zoom`; if that is missing (first paint before
 * the hook runs) it recomputes from the current viewport so callers never use a stale 1.
 */
export function getCurrentSideBySideZoom(forced: boolean): number {
  // Not forced → no zoom is applied to #root, so visual px == CSS px.
  if (!forced) return 1
  if (typeof document !== 'undefined') {
    // Read the live value the zoom hook wrote; this is the authoritative number actually applied.
    const raw = document.documentElement.style.getPropertyValue(APP_ZOOM_CSS_VAR)
    const parsed = Number.parseFloat(raw)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  // Fallback before the hook's first write: derive from the viewport (excludes the scrollbar).
  if (typeof document !== 'undefined') {
    return computeSideBySideZoom(document.documentElement.clientWidth)
  }
  return 1
}
