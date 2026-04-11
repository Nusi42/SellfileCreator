import type { BuilderRecipe, SellfileExportMode, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { HsfRuleWithRecipe } from '../lib/merge'
import type { HsfFile } from '../lib/hsfTypes'
import type { FinalSellRemainderConfig } from '../lib/logicHub'
import type { SafeguardDetectionSnapshot, SafeguardsMergeInput } from '../lib/safeguards'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import type { GearInspectorMatchWorkerItemResult } from './gearInspectorMatchWorkerTypes'
import type { ProgressSnapshot } from '../types/progress'
import type { ImprovementChanceWasmEntry } from '../lib/wasm/wasmRuleEngine'

export type RuleCacheBuilderCountRequest = {
  id: number
  kind: 'builderCount'
  payload: {
    recipes: BuilderRecipe[]
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
    generation: number
    recipes: BuilderRecipe[]
    metasets: Metaset[]
    substatTargets: SubstatTargetTable
    hsf: HsfFile | null
    finalSellRemainder?: FinalSellRemainderConfig
    safeguards: SafeguardsMergeInput
    // Apply app-wide export-mode transforms before safeguard evaluation/injection.
    omitDisabledBeforeSafeguards: boolean
    dedupeBeforeSafeguards: boolean
    recipeModes: SellfileExportMode[]
    artifacts: NormalizedGearArtifact[]
    emitProgressEvents?: boolean
    // When true, compute improvement-chance percentages for non-maxed artifacts.
    computeImprovementChance: boolean
  }
}

export type RuleCachePipelineResponse = {
  id: number
  kind: 'pipeline:done'
  payload: {
    // Null when the worker determined that per-recipe rules are identical to the last
    // sent response (artifact-only burst). The receiver falls back to its lastRulesRef.
    // Avoids structured-cloning ~50–100 MiB on every endpoint artifact push.
    rulesByRecipeEntries: Array<[number, HsfRuleWithRecipe[]]> | null
    countsByRecipeEntries: Array<[number, number]>
    keys: string[] | null
    substatTargetsKey: string
    mergedRules: HsfRuleWithRecipe[] | null
    truncatedRecipeIndices: number[]
    totalLimitHit: boolean
    excludedByTotalLimitIndices: number[]
    matches: GearInspectorMatchWorkerItemResult[]
    safeguardDetection: SafeguardDetectionSnapshot | null
    // Flat array of improvement-chance entries; null when computeImprovementChance was false.
    // Receiver reconstructs Map<artifactId, entry> to avoid structured-clone Map issues.
    improvementChanceEntries: ImprovementChanceWasmEntry[] | null
    // WASM linear memory size at the end of this pipeline run, in bytes.
    // Used by the hook to decide when to proactively restart the worker.
    wasmLinearBytes: number
  }
}

export type RuleCachePipelineProgressResponse = {
  id: number
  kind: 'pipeline:progress'
  payload: ProgressSnapshot
}

export type RuleCacheErrorResponse = {
  id: number
  kind: 'error'
  error: string
}

export type RuleCacheWorkerResponse =
  | RuleCacheBuilderCountResponse
  | RuleCachePipelineResponse
  | RuleCachePipelineProgressResponse
  | RuleCacheErrorResponse

export type RuleCacheWorkerRequest =
  | RuleCacheBuilderCountRequest
  | RuleCachePipelineRequest
