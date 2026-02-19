import type { TesterFilterRow } from '../lib/rulesFilter'
import type { MatchingRecipeDecision } from '../lib/ruleEval'

export type TesterPreviewMatch = {
  keep: boolean
  recipeIdx: number | null
  recipeName: string | null
  ruleIndex: number | null
  ruleLabel: string | null
  ruleSource: string | null
}

export type TesterPreviewRow = TesterFilterRow & {
  match: TesterPreviewMatch | null
  baseMatch: TesterPreviewMatch | null
  matchingRecipeIndices: number[]
  matchingRecipeDecisions: MatchingRecipeDecision[]
}

// Aggregate outcome totals for Rule Tester preview rows.
export type TesterOutcomeSummary = {
  // Total number of evaluated items in the summary set.
  total: number
  // Count of items explicitly sold by a matching rule.
  sold: number
  // Count of items kept (explicit keep or no sell match).
  kept: number
  // Count of kept items attributed to Safeguard rules.
  keptBySafeguards: number
}
