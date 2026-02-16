import {
  CLEAR_ICON_BUTTON_SIZE_PX,
  SETS_SELECT_CLEAR_BUTTON_RIGHT_PX,
  SETS_SELECT_DROPDOWN_ICON_HITBOX_PX,
  SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX,
  SETS_SELECT_INLINE_GUTTER_PX,
} from './constants'
import { measureCssWidth } from './domMeasurements'
import { pickEllipsisTarget } from './ellipsis'

// Inline select menus share the same inline clear affordance, so we centralize the badge padding
// and offsets to keep Safeguards, the builder, and the tester filter panel visually identical.
export const INLINE_SELECT_EXTRA_BADGE_PADDING_PX = CLEAR_ICON_BUTTON_SIZE_PX
  + (SETS_SELECT_CLEAR_BUTTON_RIGHT_PX - SETS_SELECT_DROPDOWN_ICON_HITBOX_PX)
export const INLINE_SELECT_EXTRA_BADGE_RIGHT_PX = SETS_SELECT_CLEAR_BUTTON_RIGHT_PX
  + INLINE_SELECT_EXTRA_BADGE_PADDING_PX

// Consumers run their Select button text right up against the clear/badge overlays; this helper
// mirrors the filter-panel math so every inline select reserves the exact same gutter widths.
export function computeInlineSelectPadding(hasSelection: boolean, hasExtraBadge: boolean): number {
  if (!hasSelection) return SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX
  return SETS_SELECT_INLINE_GUTTER_PX + (hasExtraBadge ? INLINE_SELECT_EXTRA_BADGE_PADDING_PX : 0)
}

// The Select already reserves SETS_SELECT_DROPDOWN_ICON_HITBOX_PX for the caret; we only subtract the extra gutter
// introduced by the inline clear + badge so long names use every remaining pixel before the overlays.
export function computeInlineSelectContentMaxWidth(paddingPx: number): string {
  const extra = Math.max(0, paddingPx - SETS_SELECT_DROPDOWN_ICON_HITBOX_PX)
  if (extra <= 0) return '100%'
  return `calc(100% - ${extra}px)`
}

type InlineSelectHiddenCountOptions = {
  labels: readonly string[]
  root: HTMLElement
  availableWidthPx?: number
  separator?: string
  minVisibleCount?: number
}

// estimateInlineSelectHiddenCount returns how many labels are hidden by truncation.
export function estimateInlineSelectHiddenCount({
  labels,
  root,
  availableWidthPx,
  separator = ', ',
  minVisibleCount = 1,
}: InlineSelectHiddenCountOptions): number {
  // No labels means no hidden entries.
  if (!labels.length) return 0
  // Guard server-side render or missing DOM.
  if (typeof document === 'undefined') return Math.max(0, labels.length - minVisibleCount)
  // Use the ellipsis target so font + width match the actual display.
  const target = pickEllipsisTarget(root)
  // Capture computed styles so canvas measures the right font.
  const style = getComputedStyle(target)
  // Only run when the target actually uses ellipsis styles.
  const supportsEllipsis = (
    (style.overflow === 'hidden' || style.overflowX === 'hidden')
    && style.textOverflow === 'ellipsis'
    && style.whiteSpace === 'nowrap'
  )
  if (!supportsEllipsis) return 0
  // Use the provided width or measure the rendered width.
  const widthPx = availableWidthPx ?? measureCssWidth(target)
  if (widthPx <= 0) return 0
  // Prepare a canvas to measure text without layout shifts.
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return 0
  // Build a font string that matches the computed style.
  const font = style.font && style.font.trim().length > 0
    ? style.font
    : `${style.fontStyle || 'normal'} ${style.fontVariant || 'normal'} ${style.fontWeight || 'normal'} ${style.fontSize || '14px'} / ${style.lineHeight || 'normal'} ${style.fontFamily || 'sans-serif'}`
  ctx.font = font
  // Parse letter spacing so spacing matches the DOM.
  const letterSpacingPx = Number.parseFloat(style.letterSpacing || '0') || 0
  // Measure a string including letter spacing.
  const measure = (text: string): number => {
    const base = ctx.measureText(text).width
    const spacing = Math.max(text.length - 1, 0) * letterSpacingPx
    return base + spacing
  }
  // Pre-measure the separator width to speed up the loop.
  const separatorWidth = measure(separator)
  // Track how much width is consumed by visible labels.
  let usedWidth = 0
  // Track how many labels fit before truncation.
  let visibleCount = 0
  for (const label of labels) {
    // Measure the next label with the separator when needed.
    const labelWidth = measure(label)
    const nextWidth = visibleCount === 0 ? labelWidth : usedWidth + separatorWidth + labelWidth
    // Always treat the first label as visible, even if it overflows.
    if (visibleCount === 0 && labelWidth > widthPx) {
      visibleCount = 1
      break
    }
    if (nextWidth <= widthPx) {
      usedWidth = nextWidth
      visibleCount += 1
      continue
    }
    break
  }
  // Ensure at least minVisibleCount is treated as visible.
  const normalizedVisible = Math.max(minVisibleCount, visibleCount)
  return Math.max(0, labels.length - normalizedVisible)
}
