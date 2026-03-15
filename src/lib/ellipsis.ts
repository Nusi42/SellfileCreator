import { measureCssWidth } from './domMeasurements'

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

export const hasEllipsisOverflow = (rootEl?: HTMLElement | null, selector?: string): boolean => {
  try {
    const root = rootEl ?? null
    if (!root) return false
    const target = pickEllipsisTarget(root, selector)
    const cs = getComputedStyle(target)
    // Single-line case: textOverflow:ellipsis + whiteSpace:nowrap + overflow:hidden.
    // Compare scroll width against the zoom-safe visible width to avoid false positives
    // when the app auto-zooms for side-by-side mode.
    const isEllipsisStyle = (
      (cs.overflow === 'hidden' || cs.overflowX === 'hidden')
      && cs.textOverflow === 'ellipsis'
      && cs.whiteSpace === 'nowrap'
    )
    const visibleWidth = measureCssWidth(target)
    if (visibleWidth <= 0) return false
    const scrollW = Math.floor(target.scrollWidth || 0)
    if (isEllipsisStyle && scrollW > 0 && visibleWidth + CSS_WIDTH_TOLERANCE_PX < scrollW) return true
    // Multi-line clamp case: -webkit-line-clamp clips vertically instead of horizontally.
    // Detection uses scrollHeight vs clientHeight instead of scrollWidth.
    const lineClamp = cs.getPropertyValue('-webkit-line-clamp')
    if (lineClamp && lineClamp !== 'none' && (cs.overflow === 'hidden' || cs.overflowY === 'hidden')) {
      const scrollH = Math.floor(target.scrollHeight || 0)
      const clientH = Math.floor(target.clientHeight || 0)
      return scrollH > clientH + CSS_WIDTH_TOLERANCE_PX
    }
    return false
  } catch {
    return false
  }
}
