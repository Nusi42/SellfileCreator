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
