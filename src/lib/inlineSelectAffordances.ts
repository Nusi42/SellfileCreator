import {
  CLEAR_ICON_BUTTON_SIZE_PX,
  SETS_SELECT_CLEAR_BUTTON_RIGHT_PX,
  SETS_SELECT_DROPDOWN_ICON_HITBOX_PX,
  SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX,
  SETS_SELECT_INLINE_GUTTER_PX,
} from './constants'

// Inline select menus share the same inline clear affordance, so we centralize the badge padding
// and offsets to keep Keep Uniques, the builder, and the tester filter panel visually identical.
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
