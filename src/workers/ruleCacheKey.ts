// Pure rules-cache-key composition for the rule-cache pipeline worker.
//
// Extracted from ruleCacheWorker.ts so it can be unit-tested without pulling the
// worker's top-level `self`/WASM bootstrap into the test process. Everything here is
// string/number/array math with no side effects and no WASM dependency: the caller
// (the worker) computes the safeguard fingerprint via its own SSOT helper and passes
// the resulting string in, keeping this module fingerprint-source-agnostic.
import type { FinalSellRemainderConfig } from '../lib/logicHub'

// The slice of pipeline state that contributes to the rules-cache key. Mirrors the
// fields the worker's PipelineState exposes; narrowed here so the helper stays pure.
export type RuleCacheKeyPipelineState = {
  // One entry per recipe — the recipe-rules dimension of the merge. Empties when
  // recipes are toggled off; each entry changes on any recipe content change.
  keys: readonly string[]
  // Fingerprint of the active substat-target table (already a stable string).
  substatTargetsKey: string
  // True when the total rule-count limit clipped emission this run.
  totalLimitHit: boolean
  // Recipe indices clipped by the per-recipe / total limit; identity affects output.
  truncatedRecipeIndices: readonly number[]
}

// The slice of the pipeline payload that contributes to the rules-cache key.
export type RuleCacheKeyPayload = {
  omitDisabledBeforeSafeguards?: boolean
  dedupeBeforeSafeguards?: boolean
  finalSellRemainder?: FinalSellRemainderConfig | null
}

// Encode FinalSellRemainderConfig so any field change is visible in the key.
const finalSellRemainderKey = (fsr: FinalSellRemainderConfig | null | undefined): string =>
  fsr == null
    ? '0'
    : `1${fsr.artifacts ? 1 : 0}${fsr.accessories ? 1 : 0}${fsr.setsMode ?? ''}${Array.isArray(fsr.levels) ? fsr.levels.join(',') : ''}`

// XOR-multiply hash over an integer array — catches both count and identity changes.
// Seeded with length so [] never collides with a single-element array.
const hashIntArray = (values: readonly number[]): number => {
  let h = values.length
  for (const v of values) {
    h = Math.imul(h ^ v, 0x9e3779b9) | 0
  }
  return h
}

// XOR-multiply hash over the per-recipe cache keys — the recipe-rules dimension of the
// merge. This MUST contribute to the key: without it the key omits recipes entirely, so
// toggling all recipes off (keys → []) or editing a recipe leaves the key unchanged, the
// WASM-side generated-rules cache is never refreshed, and computeMergedRulesCached returns
// the previously cached rules (still containing every recipe). pipelineState.keys is one
// entry per recipe and changes on any recipe content change AND empties when recipes are
// disabled, so it captures the whole recipe dimension. Seeded with length so [] never
// collides with a 1-recipe set.
const hashRecipeKeys = (keys: readonly string[]): number => {
  let h = keys.length
  for (const key of keys) {
    // Fold each string key in char-by-char; identity of the recipe rule set is what matters.
    for (let i = 0; i < key.length; i += 1) {
      h = Math.imul(h ^ key.charCodeAt(i), 0x9e3779b9) | 0
    }
    // Separator between keys so concatenation boundaries cannot alias across recipes.
    h = Math.imul(h ^ 0x7f, 0x85ebca6b) | 0
  }
  return h
}

// Single composite key encoding everything that determines mergedRulesFinal except the
// detection snapshot (covered separately by the detection key). Includes: substatTargetsKey,
// totalLimitHit, truncatedRecipeIndices identity, the per-recipe cache keys (the recipe
// dimension), omit/dedupe flags, the caller-supplied safeguard fingerprint (enabled flag +
// full rule content), and full finalSellRemainder content.
//
// safeguardsFingerprint is passed in (not computed here) so this module stays pure and free
// of the WASM-importing safeguards module; the worker derives it from the shared SSOT helper
// so this key and the export-dirty signature always agree on which safeguard fields matter.
export const composeRuleCacheKey = (
  pipelineState: RuleCacheKeyPipelineState,
  payload: RuleCacheKeyPayload,
  safeguardsFingerprint: string,
): string => {
  const omit = payload.omitDisabledBeforeSafeguards ? 1 : 0
  const dedup = payload.dedupeBeforeSafeguards ? 1 : 0
  const fsrKey = finalSellRemainderKey(payload.finalSellRemainder)
  const truncatedHash = hashIntArray(pipelineState.truncatedRecipeIndices)
  const recipeKeysHash = hashRecipeKeys(pipelineState.keys)
  return `${pipelineState.substatTargetsKey}|${pipelineState.totalLimitHit ? 1 : 0}|${truncatedHash}|${recipeKeysHash}|${omit}${dedup}|${safeguardsFingerprint}${fsrKey}`
}
