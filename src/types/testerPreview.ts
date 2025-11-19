import type { TesterFilterRow } from '../lib/rulesFilter'

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
}
