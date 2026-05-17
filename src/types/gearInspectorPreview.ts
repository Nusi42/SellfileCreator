import type { GearInspectorFilterRow } from '../lib/rulesFilter'
import type { MatchingRecipeDecision } from '../lib/ruleEval'

export type GearInspectorPreviewMatch = {
  keep: boolean
  recipeIdx: number | null
  recipeName: string | null
  // Optional foreground color for the matching recipe name chip.
  recipeFgColor: string | null
  ruleIndex: number | null
  ruleLabel: string | null
  ruleSource: string | null
  // Legacy string ID from __safeguardRuleId on injected HSF rows; always null in new sessions
  // (SafeguardRule no longer carries an id). Kept for deserialization compat.
  safeguardRuleId: string | null
  // 1-based ordinal of the safeguard rule that produced this keep row; null for non-safeguard rules.
  // Preferred identity token — derivable from rule list position without a generated ID.
  safeguardRuleOrdinal: number | null
}

export type GearInspectorPreviewRow = GearInspectorFilterRow & {
  match: GearInspectorPreviewMatch | null
  baseMatch: GearInspectorPreviewMatch | null
  matchingRecipeIndices: number[]
  matchingRecipeDecisions: MatchingRecipeDecision[]
}

// Aggregate outcome totals for Gear Inspector preview rows.
export type GearInspectorOutcomeSummary = {
  // Total number of evaluated items in the summary set.
  total: number
  // Count of items explicitly sold by a matching rule.
  sold: number
  // Count of items kept (explicit keep or no sell match).
  kept: number
  // Count of kept items attributed to Safeguard rules.
  keptBySafeguards: number
}
