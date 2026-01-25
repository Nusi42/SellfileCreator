import type { TesterFilterRow } from '../lib/rulesFilter'
import type { MatchingConfigDecision } from '../lib/ruleEval'

export type TesterPreviewMatch = {
  keep: boolean
  cfgIdx: number | null
  cfgName: string | null
  ruleIndex: number | null
  ruleLabel: string | null
  ruleSource: string | null
}

export type TesterPreviewRow = TesterFilterRow & {
  match: TesterPreviewMatch | null
  baseMatch: TesterPreviewMatch | null
  matchingCfgIndices: number[]
  matchingConfigDecisions: MatchingConfigDecision[]
}

// Aggregate outcome totals for Rule Tester preview rows.
export type TesterOutcomeSummary = {
  // Total number of evaluated items in the summary set.
  total: number
  // Count of items explicitly sold by a matching rule.
  sold: number
  // Count of items kept (explicit keep or no sell match).
  kept: number
  // Count of kept items attributed to Keep Unique rules.
  keptByKeepUniques: number
}
