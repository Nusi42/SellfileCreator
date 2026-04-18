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
    // Null when rules are unchanged (artifact-only burst) or when the compact index
    // path is used instead. The receiver falls back to its lastRulesRef when both this
    // and rulesByRecipeIndices are null (artifact-only burst).
    rulesByRecipeEntries: Array<[number, HsfRuleWithRecipe[]]> | null
    // Compact alternative to rulesByRecipeEntries: per-recipe integer indices into
    // mergedRules instead of full rule copies. Non-null only when dedupeBeforeSafeguards
    // and omitDisabledBeforeSafeguards are both false — in that case the same rule objects
    // appear in both mergedRules and the per-recipe groups, so structured clone produces
    // one shared copy instead of two independent copies (halves per-pipeline V8 allocation).
    rulesByRecipeIndices: Array<[number, number[]]> | null
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
    // Logged in DEV mode to spot unexpected WASM heap growth across pipelines.
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
