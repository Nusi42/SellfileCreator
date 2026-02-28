import type { EvalResult, MatchingRecipeDecision, TestItem } from '../lib/ruleEval'

export type GearInspectorMatchWorkerEvaluateItem = {
  itemId: number
  item: TestItem
}

export type GearInspectorMatchWorkerItemResult = {
  itemId: number
  firstMatch: EvalResult | null
  firstNonExcludedMatch: EvalResult | null
  matchingRecipeIndices: number[]
  matchingRecipeDecisions: MatchingRecipeDecision[]
}
