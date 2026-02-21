import type { EvalResult, MatchingRecipeDecision, TestItem } from '../lib/ruleEval'

export type TesterMatchWorkerEvaluateItem = {
  itemId: number
  item: TestItem
}

export type TesterMatchWorkerItemResult = {
  itemId: number
  firstMatch: EvalResult | null
  firstNonExcludedMatch: EvalResult | null
  matchingRecipeIndices: number[]
  matchingRecipeDecisions: MatchingRecipeDecision[]
}
