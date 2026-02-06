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
