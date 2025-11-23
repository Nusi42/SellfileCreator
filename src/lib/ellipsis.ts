// Ellipsis helpers live in their own module so both MarkdownTooltip and EllipsisTooltip can reuse
// the exact same overflow detection logic. Keeping the measurement centralized prevents subtle
// drift (e.g., different selectors or math) across call sites.
export const pickEllipsisTarget = (root: HTMLElement, selector?: string): HTMLElement => {
  let target: HTMLElement | null = null
  if (selector) target = root.querySelector(selector)
  if (!target) target = root.querySelector('[data-ellipsis-target]') as HTMLElement | null
  if (!target) {
    const all = Array.from(root.querySelectorAll<HTMLElement>('*'))
    target = all.find((el) => {
      const style = getComputedStyle(el)
      return (
        (style.textOverflow === 'ellipsis')
        && (style.overflow === 'hidden' || style.overflowX === 'hidden')
        && style.whiteSpace === 'nowrap'
      )
    }) || null
  }
  return target || root
}

const CSS_WIDTH_TOLERANCE_PX = 2

const measureCssWidth = (target: HTMLElement): number => {
  // Offset/client widths remain in CSS pixels even when zoom/scale transforms shrink the viewport.
  const layoutWidth = Math.max(target.offsetWidth || 0, target.clientWidth || 0)
  if (layoutWidth > 0) return layoutWidth
  // Fallback to the bounding box when layout metrics are unavailable (hidden nodes, SVG, etc.).
  return Math.floor(target.getBoundingClientRect().width || 0)
}

export const hasEllipsisOverflow = (rootEl?: HTMLElement | null, selector?: string): boolean => {
  try {
    const root = rootEl ?? null
    if (!root) return false
    const target = pickEllipsisTarget(root, selector)
    const cs = getComputedStyle(target)
    const isEllipsisStyle = (
      (cs.overflow === 'hidden' || cs.overflowX === 'hidden')
      && cs.textOverflow === 'ellipsis'
      && cs.whiteSpace === 'nowrap'
    )
    const visibleWidth = measureCssWidth(target)
    if (visibleWidth <= 0) return false
    const scrollW = Math.floor(target.scrollWidth || 0)
    // Compare scroll width (intrinsic text width) against the zoom-safe visible width to avoid
    // false positives when the app auto-zooms for side-by-side mode.
    return Boolean(isEllipsisStyle && scrollW > 0 && visibleWidth + CSS_WIDTH_TOLERANCE_PX < scrollW)
  } catch {
    return false
  }
}
