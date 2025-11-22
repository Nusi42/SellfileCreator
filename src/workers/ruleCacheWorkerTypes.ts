import type { BuilderConfig, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { HsfRuleWithCfg } from '../lib/merge'
import type { HsfFile } from '../lib/hsfTypes'
import type { FinalSellRemainderConfig } from '../lib/finalSell'
import type { RuleMatchIndexData } from '../lib/ruleMatchIndex'
import type { KeepUniquesMergeInput } from '../lib/keepUniques'
import type { ProgressSnapshot } from '../types/progress'

export type RuleCacheWarmRequest = {
  id: number
  kind: 'warm'
  payload: {
    configs: BuilderConfig[]
    metasets: Metaset[]
    substatTargets: SubstatTargetTable
    hsf: HsfFile | null
    finalSellRemainder?: FinalSellRemainderConfig
    keepUniques: KeepUniquesMergeInput
  }
}

export type RuleCacheWarmResponse = {
  id: number
  kind: 'warm:done'
  payload: {
    rulesByConfigEntries: Array<[number, HsfRuleWithCfg[]]>
    countsByConfigEntries: Array<[number, number]>
    keys: string[]
    substatTargetsKey: string
    mergedRules: HsfRuleWithCfg[]
    truncatedConfigIndices: number[]
    totalLimitHit: boolean
    excludedByTotalLimitIndices: number[]
    ruleMatchIndex: RuleMatchIndexData
  }
}

export type RuleCacheWarmProgressResponse = {
  id: number
  kind: 'warm:progress'
  payload: ProgressSnapshot
}

export type RuleCacheBuilderCountRequest = {
  id: number
  kind: 'builderCount'
  payload: {
    configs: BuilderConfig[]
    substatTargets: SubstatTargetTable
  }
}

export type RuleCacheBuilderCountResponse = {
  id: number
  kind: 'builderCount:done'
  payload: {
    counts: number[]
  }
}

export type RuleCacheErrorResponse = {
  id: number
  kind: 'error'
  error: string
}

export type RuleCacheWorkerResponse =
  | RuleCacheWarmResponse
  | RuleCacheWarmProgressResponse
  | RuleCacheBuilderCountResponse
  | RuleCacheErrorResponse

export type RuleCacheWorkerRequest = RuleCacheWarmRequest | RuleCacheBuilderCountRequest
