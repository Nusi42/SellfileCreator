import { AUTO_SIDE_BY_SIDE_MIN_ZOOM, SIDE_BY_SIDE_TARGET_HEIGHT_PX, SIDE_BY_SIDE_TARGET_WIDTH_PX } from './constants'

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

/**
 * appZoomCompensatedLength
 *
 * SSOT for "a viewport-relative length that must survive the paper's own CSS `zoom`". Portal content
 * (MUI Dialog/Popover papers) lives OUTSIDE #root, so it cannot inherit #root's `zoom: z`. The theme
 * instead applies `zoom: var(--app-zoom)` directly to those papers (see theme.ts). That re-scales the
 * paper — but a `vh`/`vw` length declared on the paper is computed against the (unzoomed) viewport
 * FIRST and then multiplied by z, so an `84vh` paper actually renders at `84vh × z`: too short when
 * the app is zoomed down. Dividing the length by the same var pre-compensates — `(L / z) × z = L` —
 * so the visual size is the intended L at any zoom (and a no-op when --app-zoom is unset → 1).
 *
 * Same idiom the floating note panel uses for its `maxWidth: calc(100vw / var(--app-zoom, 1))`.
 */
export function appZoomCompensatedLength(length: string): string {
  return `calc(${length} / var(${APP_ZOOM_CSS_VAR}, 1))`
}

export type SideBySideZoomDecision = {
  // Whether the forced side-by-side layout should be active at this viewport.
  forceSideBySide: boolean
  // Zoom to apply to #root: the fitted zoom when forced, 1 when stacked.
  zoom: number
  // Width (CSS px, pre-zoom) the forced canvas should render at. Equals the target width when width
  // is the binding constraint, but widens to viewportWidth / zoom when HEIGHT forced the zoom — so
  // after scaling the canvas fills the viewport horizontally instead of leaving side bars. The spare
  // width is absorbed by the panels. Equals the target when not forced (unused in that case).
  canvasWidthPx: number
}

export type Viewport = {
  width: number
  height: number
}

export type ResolveSideBySideZoomOptions = {
  // Master switch. When false the dynamic zoom is off entirely: the decision is always
  // { forceSideBySide:false, zoom:1 }, leaving the native breakpoint-gated layout
  // (the @media query in useBuilderPreviewLayout) to decide side-by-side. Defaults to true.
  enabled?: boolean
  // The force/stack cutoff — the smallest zoom we are willing to apply before giving up and
  // reverting to the native layout. User-tunable via the theme flyout; defaults to the factory
  // AUTO_SIDE_BY_SIDE_MIN_ZOOM.
  minZoom?: number
}

/**
 * resolveSideBySideZoom
 *
 * SSOT for the force-vs-stack decision and the zoom that goes with it. The fixed canvas wants to
 * shrink so it fits the viewport in BOTH dimensions: `raw = min(width/targetW, height/targetH)`.
 * Fitting by the tighter of the two means a wide-but-short window shrinks to avoid vertical overflow,
 * not just a narrow one. Three bands:
 *   - raw ≥ 1   → viewport already fits at native scale → NOT forced; native fluid layout (100vw
 *                 panels) takes over and the panels grow with the window. (Upper handoff.)
 *   - minZoom ≤ raw < 1 → force the fixed canvas, scaled down by `raw` to fit. (Zoom band.)
 *   - raw < minZoom → too small to render legibly → NOT forced; native breakpoint-gated layout.
 * When `enabled` is false the dynamic zoom is skipped wholesale.
 */
export function resolveSideBySideZoom(
  { width, height }: Viewport,
  { enabled = true, minZoom = AUTO_SIDE_BY_SIDE_MIN_ZOOM }: ResolveSideBySideZoomOptions = {},
): SideBySideZoomDecision {
  // Default canvas width for the not-forced returns (unused when forceSideBySide is false).
  const targetCanvas = SIDE_BY_SIDE_TARGET_WIDTH_PX
  // Disabled, or bad inputs (SSR, zero-size during teardown) → no dynamic zoom; native layout.
  if (!enabled || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return { forceSideBySide: false, zoom: 1, canvasWidthPx: targetCanvas }
  }
  // Fit ratio is the tighter of the two dimensions — whichever runs out of room first drives the zoom.
  const raw = Math.min(width / SIDE_BY_SIDE_TARGET_WIDTH_PX, height / SIDE_BY_SIDE_TARGET_HEIGHT_PX)
  // raw ≥ 1 → the viewport already fits the canvas at native scale, so hand off to the native fluid
  // layout (100vw panels via the @media gate) rather than locking to the fixed zoom canvas. This is
  // the upper handoff: fluid above the target, zoom below it.
  if (raw >= 1) return { forceSideBySide: false, zoom: 1, canvasWidthPx: targetCanvas }
  // Below the cutoff → too small to fit legibly; revert to the native breakpoint-gated layout.
  if (raw < minZoom) return { forceSideBySide: false, zoom: 1, canvasWidthPx: targetCanvas }
  // In the zoom band [minZoom, 1) → force the canvas, scaled down by `raw` to fit.
  // Canvas width = viewportWidth / zoom so it fills the viewport horizontally after scaling: when
  // width is binding this is exactly the target; when HEIGHT is binding it is wider, absorbing the
  // spare width instead of leaving side bars. Round to whole px to keep the zoom math stable.
  const canvasWidthPx = Math.max(SIDE_BY_SIDE_TARGET_WIDTH_PX, Math.round(width / raw))
  return { forceSideBySide: true, zoom: raw, canvasWidthPx }
}

/**
 * computeSideBySideZoom
 *
 * The applied zoom for a given viewport — `resolveSideBySideZoom(...).zoom`. Kept as a thin accessor
 * for the coordinate-conversion callers that only need the scale factor, not the force decision.
 */
export function computeSideBySideZoom(viewport: Viewport): number {
  return resolveSideBySideZoom(viewport).zoom
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
  // Fallback before the hook's first write: derive from the viewport (clientW/H exclude scrollbars).
  if (typeof document !== 'undefined') {
    const el = document.documentElement
    return computeSideBySideZoom({ width: el.clientWidth, height: el.clientHeight })
  }
  return 1
}
