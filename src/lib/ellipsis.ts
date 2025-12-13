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
const CSS_HEIGHT_TOLERANCE_PX = 2

const measureCssWidth = (target: HTMLElement): number => {
  // Offset/client widths remain in CSS pixels even when zoom/scale transforms shrink the viewport.
  const layoutWidth = Math.max(target.offsetWidth || 0, target.clientWidth || 0)
  if (layoutWidth > 0) return layoutWidth
  // Fallback to the bounding box when layout metrics are unavailable (hidden nodes, SVG, etc.).
  return Math.floor(target.getBoundingClientRect().width || 0)
}

const measureCssHeight = (target: HTMLElement): number => {
  // Offset/client heights remain in CSS pixels even when zoom/scale transforms shrink the viewport.
  const layoutHeight = Math.max(target.offsetHeight || 0, target.clientHeight || 0)
  if (layoutHeight > 0) return layoutHeight
  // Fallback to the bounding box when layout metrics are unavailable (hidden nodes, SVG, etc.).
  return Math.floor(target.getBoundingClientRect().height || 0)
}

export const hasEllipsisOverflow = (rootEl?: HTMLElement | null, selector?: string): boolean => {
  try {
    const root = rootEl ?? null
    if (!root) return false
    const target = pickEllipsisTarget(root, selector)
    const cs = getComputedStyle(target)
    const hasHiddenOverflow = cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden'
    const isSingleLineEllipsis = hasHiddenOverflow && cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap'
    // Line-clamp uses a different ellipsis mechanism (webkit-box + -webkit-line-clamp) and won't satisfy white-space:nowrap.
    const rawLineClamp = cs.getPropertyValue('-webkit-line-clamp').trim()
    const lineClamp = rawLineClamp ? Number(rawLineClamp) : Number.NaN
    const isMultiLineClamp = hasHiddenOverflow && cs.display === '-webkit-box' && Number.isFinite(lineClamp) && lineClamp > 1
    if (!isSingleLineEllipsis && !isMultiLineClamp) return false
    if (isSingleLineEllipsis) {
      const visibleWidth = measureCssWidth(target)
      if (visibleWidth <= 0) return false
      const scrollW = Math.floor(target.scrollWidth || 0)
      // Compare intrinsic text width against the zoom-safe visible width to avoid false positives under auto-zoom.
      return Boolean(scrollW > 0 && visibleWidth + CSS_WIDTH_TOLERANCE_PX < scrollW)
    }
    const visibleHeight = measureCssHeight(target)
    if (visibleHeight <= 0) return false
    const scrollH = Math.floor(target.scrollHeight || 0)
    // Clamp overflow shows up as scrollHeight > clientHeight when the extra lines are visually clipped.
    return Boolean(scrollH > 0 && visibleHeight + CSS_HEIGHT_TOLERANCE_PX < scrollH)
  } catch {
    return false
  }
}
