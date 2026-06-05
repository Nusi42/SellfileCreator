import type { GearInspectorPreviewMatch } from '../types/gearInspectorPreview'

// Single source of truth for the sell/keep verdict of an evaluated Gear Inspector row.
//
// The app is a keep-list: an item is SOLD only when a rule explicitly matched it with
// keep=false. Every other outcome — an explicit keep match, or no sell match at all
// (match === null) — leaves the item KEPT. Read the verdict through these helpers
// everywhere instead of re-spelling `match?.keep === false`, so the rule lives once.

// True when the row's match is an explicit sell (the only outcome that sells a piece).
export function isMatchSold(match: GearInspectorPreviewMatch | null | undefined): boolean {
  return match?.keep === false
}

// True when the row is kept — explicit keep match or no sell match at all.
export function isMatchKept(match: GearInspectorPreviewMatch | null | undefined): boolean {
  return !isMatchSold(match)
}
