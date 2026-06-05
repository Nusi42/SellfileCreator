import { RULE_SOURCE_SAFEGUARDS } from './merge'
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

// True when the row is kept specifically by a Safeguard (the protection that re-keeps an
// item a rule would otherwise sell). Safeguard injections carry this dedicated rule source.
// One definition of the "kept by safeguard" condition for the outcome summary and the diff.
export function isMatchKeptBySafeguard(match: GearInspectorPreviewMatch | null | undefined): boolean {
  return match?.ruleSource === RULE_SOURCE_SAFEGUARDS
}

// The three mutually-exclusive verdict states a piece can be in. "kept" here means kept by a
// rule (or by default with no sell match); a Safeguard keep is its own state because *why* a
// piece is kept matters — a piece kept only by a safeguard is one rule tweak from being sold.
export type VerdictTriState = 'sold' | 'safeguarded' | 'kept'

// Classify a match into its tri-state verdict — the comparison primitive for the gear diff.
export function resolveVerdictTriState(match: GearInspectorPreviewMatch | null | undefined): VerdictTriState {
  if (isMatchSold(match)) return 'sold'
  if (isMatchKeptBySafeguard(match)) return 'safeguarded'
  return 'kept'
}
