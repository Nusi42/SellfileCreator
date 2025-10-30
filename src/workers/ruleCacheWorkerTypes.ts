import type { BuilderConfig, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { HsfRuleWithCfg } from '../lib/merge'
import type { RuleCachePerfSample } from '../lib/ruleCache'
import type { HsfFile } from '../lib/hsfTypes'
import type { FinalSellRemainderConfig } from '../lib/finalSell'

export type RuleCacheWarmRequest = {
  id: number
  kind: 'warm'
  payload: {
    configs: BuilderConfig[]
    metasets: Metaset[]
    substatTargets: SubstatTargetTable
    hsf: HsfFile | null
    finalSellRemainder?: FinalSellRemainderConfig
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
    perf: RuleCachePerfSample
    mergedRules: HsfRuleWithCfg[]
  }
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

export type RuleCacheWorkerResponse = RuleCacheWarmResponse | RuleCacheBuilderCountResponse | RuleCacheErrorResponse

export type RuleCacheWorkerRequest = RuleCacheWarmRequest | RuleCacheBuilderCountRequest
