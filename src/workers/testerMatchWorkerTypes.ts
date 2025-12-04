import type { SellfileExportMode } from '../lib/hsfBuilder'
import type { HsfRuleWithCfg } from '../lib/merge'
import type { RuleMatchIndexData } from '../lib/ruleMatchIndex'
import type { EvalResult, MatchingConfigDecision, TestItem } from '../lib/ruleEval'
import type { ProgressSnapshot } from '../types/progress'

export type TesterMatchWorkerConfigurePayload = {
  rules: HsfRuleWithCfg[]
  configModes: SellfileExportMode[]
  ruleMatchIndex: RuleMatchIndexData | null
}

export type TesterMatchWorkerEvaluateItem = {
  itemId: number
  item: TestItem
}

export type TesterMatchWorkerEvaluatePayload = {
  items: TesterMatchWorkerEvaluateItem[]
}

export type TesterMatchWorkerItemResult = {
  itemId: number
  firstMatch: EvalResult | null
  firstNonExcludedMatch: EvalResult | null
  matchingConfigIndices: number[]
  matchingConfigDecisions: MatchingConfigDecision[]
}

export type TesterMatchWorkerRequest =
  | {
      id: number
      kind: 'configure'
      payload: TesterMatchWorkerConfigurePayload
    }
  | {
      id: number
      kind: 'evaluate'
      payload: TesterMatchWorkerEvaluatePayload
    }

export type TesterMatchWorkerResponse =
  | {
      id: number
      kind: 'configure:done'
    }
  | {
      id: number
      kind: 'evaluate:done'
      payload: {
        results: TesterMatchWorkerItemResult[]
      }
    }
  | {
      id: number
      kind: 'evaluate:progress'
      payload: ProgressSnapshot
    }
  | {
      id: number
      kind: 'error'
      error: string
    }
