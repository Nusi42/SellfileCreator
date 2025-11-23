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

export const hasEllipsisOverflow = (rootEl?: HTMLElement | null, selector?: string): boolean => {
  try {
    const root = rootEl ?? null
    if (!root) return false
    const target = pickEllipsisTarget(root, selector)
    const rect = target.getBoundingClientRect()
    if ((rect.width || 0) <= 0) return false
    const cs = getComputedStyle(target)
    const isEllipsisStyle = (
      (cs.overflow === 'hidden' || cs.overflowX === 'hidden')
      && cs.textOverflow === 'ellipsis'
      && cs.whiteSpace === 'nowrap'
    )
    const rectW = Math.floor(target.getBoundingClientRect().width || 0)
    const scrollW = Math.floor(target.scrollWidth || 0)
    return Boolean(isEllipsisStyle && scrollW > 0 && rectW + 2 < scrollW)
  } catch {
    return false
  }
}
