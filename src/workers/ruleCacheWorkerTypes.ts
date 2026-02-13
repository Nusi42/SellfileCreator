import type { BuilderConfig, SellfileExportMode, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { HsfRuleWithCfg } from '../lib/merge'
import type { HsfFile } from '../lib/hsfTypes'
import type { FinalSellRemainderConfig } from '../lib/logicHub'
import type { KeepUniqueDetectionSnapshot, KeepUniquesMergeInput } from '../lib/keepUniques'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import type { TesterMatchWorkerItemResult } from './testerMatchWorkerTypes'
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

export type RuleCachePipelineRequest = {
  id: number
  kind: 'pipeline'
  payload: {
    configs: BuilderConfig[]
    metasets: Metaset[]
    substatTargets: SubstatTargetTable
    hsf: HsfFile | null
    finalSellRemainder?: FinalSellRemainderConfig
    keepUniques: KeepUniquesMergeInput
    configModes: SellfileExportMode[]
    artifacts?: NormalizedGearArtifact[]
    artifactPatch?: {
      changed: Array<[number, NormalizedGearArtifact]>
      removed: number[]
      signature: string | null
    }
    artifactSignature?: string | null
    resetArtifacts?: boolean
    fingerprint?: string | null
    skipWarm?: boolean
    skipMatches?: boolean
    skipDetection?: boolean
  }
}

export type RuleCachePipelineResponse = {
  id: number
  kind: 'pipeline:done'
  payload: {
    rulesByConfigEntries: Array<[number, HsfRuleWithCfg[]]>
    countsByConfigEntries: Array<[number, number]>
    keys: string[]
    substatTargetsKey: string
    mergedRules: HsfRuleWithCfg[]
    truncatedConfigIndices: number[]
    totalLimitHit: boolean
    excludedByTotalLimitIndices: number[]
    matches: TesterMatchWorkerItemResult[]
    // Keep-unique detection snapshot for UI inspection + cache parity.
    keepUniqueDetection: KeepUniqueDetectionSnapshot | null
    fingerprint: string | null
    artifactSignature: string | null
  }
}

export type RuleCachePipelineProgressResponse = {
  id: number
  kind: 'pipeline:progress'
  payload: ProgressSnapshot
}

// Phase markers emitted by the worker for perf timeline breakdowns.
export type RuleCachePipelinePhase =
  | 'baseline:start'
  | 'baseline:done'
  | 'detection:start'
  | 'detection:done'
  | 'final:start'
  | 'final:done'

// Lightweight phase marker used by the perf timeline helper.
export type RuleCachePipelinePhaseResponse = {
  id: number
  kind: 'pipeline:phase'
  payload: {
    phase: RuleCachePipelinePhase
    data?: Record<string, string | number | boolean | null>
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
  | RuleCachePipelineResponse
  | RuleCachePipelineProgressResponse
  | RuleCachePipelinePhaseResponse
  | RuleCacheErrorResponse

export type RuleCacheWorkerRequest =
  | RuleCacheWarmRequest
  | RuleCacheBuilderCountRequest
  | RuleCachePipelineRequest
