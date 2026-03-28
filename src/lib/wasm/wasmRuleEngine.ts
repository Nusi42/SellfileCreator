import initRuleEngineWasm, {
  auto_rarity_addition_levels_for_code_value as autoRarityAdditionLevelsForCodeWasmValueBinding,
  auto_rarity_includes_mythical_for_code_value as autoRarityIncludesMythicalForCodeWasmValueBinding,
  auto_rarity_roll_levels_for_code_value as autoRarityRollLevelsForCodeWasmValueBinding,
  build_hsf_rules_runtime_value as buildHsfRulesRuntimeWasmValueBinding,
  build_final_sell_rules_value as buildFinalSellRulesWasmValueBinding,
  build_safeguard_rules_value as buildSafeguardRulesWasmValueBinding,
  combinations_i32_fast_flat as combinationsI32FastFlatWasmBinding,
  collect_safeguard_candidates_value as collectSafeguardCandidatesWasmValueBinding,
  collect_and_compute_safeguard_protection_value as collectAndComputeSafeguardProtectionWasmValueBinding,
  evaluate_and_collect_safeguard_protection_value as evaluateAndCollectSafeguardProtectionWasmValueBinding,
  store_artifact_rows_value as storeArtifactRowsWasmValueBinding,
  compute_upgrade_chance_value as computeUpgradeChanceWasmValueBinding,
  compute_merged_rules_value as computeMergedRulesWasmValueBinding,
  compute_safeguard_protection_value as computeSafeguardProtectionValueWasmBinding,
  dedupe_hsf_rules_for_export_value as dedupeHsfRulesForExportWasmValueBinding,
  expand_auto_flex_rarity_branches_value as expandAutoFlexRarityBranchesWasmValueBinding,
  flatten_rule_batches_with_total_limit_value as flattenRuleBatchesWithTotalLimitWasmValueBinding,
  configure_value as configureRuleEngineWasmValueBinding,
  evaluate_value as evaluateRuleEngineWasmValueBinding,
  finalize_generated_rules_value as finalizeGeneratedRulesWasmValueBinding,
  find_obsolete_value as findObsoleteRuleEngineWasmValueBinding,
  hash_safeguard_combination_value as hashSafeguardCombinationWasmValueBinding,
  intro_assignments_for_combo_fast_flat as introAssignmentsForComboFastFlatWasmBinding,
  safeguard_count_key_value as safeguardCountKeyValueWasmBinding,
  safeguard_group_key_value as safeguardGroupKeyValueWasmValueBinding,
  safeguard_item_key_value as safeguardItemKeyValueWasmValueBinding,
  merge_safeguard_injected_rules_value as mergeSafeguardInjectedRulesWasmValueBinding,
  normalize_safeguard_expected_group_domain_value as normalizeSafeguardExpectedGroupDomainWasmValueBinding,
  prepare_hsf_builder_recipe_value as prepareHsfBuilderRecipeWasmValueBinding,
  resolve_safeguard_rules_with_metasets_value as resolveSafeguardRulesWithMetasetsWasmValueBinding,
  resolve_auto_rarity_code_for_builder_value as resolveAutoRarityCodeForBuilderWasmValueBinding,
  permutations_i32_fast_flat as permutationsI32FastFlatWasmBinding,
  sort_safeguard_combination_value as sortSafeguardCombinationWasmValueBinding,
  sort_safeguard_substats_value as sortSafeguardSubstatsWasmValueBinding,
  score_safeguard_candidates_value as scoreSafeguardCandidatesWasmValueBinding,
  version as ruleEngineWasmVersionBinding,
} from './generated/rule_engine.js'
import type { GeneratedBranchRuleEntry, HsfRuleWithRecipe } from '../merge'
import type { HsfRule } from '../hsfTypes'
import type { BuilderRecipe, SellfileExportMode } from '../hsfBuilder'
import type { SafeguardCandidate, SafeguardCandidateOut, SafeguardDetectionSnapshot, SafeguardRule, SafeguardRuleForWasm } from '../safeguards'
import type { FinalSellRemainderConfig } from '../logicHub'
import type { GearInspectorMatchWorkerEvaluateItem, GearInspectorMatchWorkerItemResult } from '../../workers/gearInspectorMatchWorkerTypes'
import type { GearInspectorPreviewRow } from '../../types/gearInspectorPreview'
import type { TestItem } from '../ruleEval'

// Compact WASM substat input — only the fields SafeguardWasmSubstatRawIn reads.
// Trimmed from NormalizedStat (9+ fields) to eliminate serde_wasm_bindgen overhead
// from iterating ignored properties, which is catastrophically slow in Firefox.
export type WasmSubstatStoreInput = {
  variant: number
  isFlat: boolean
  totalValue?: number
  rolls?: number
}

// Compact WASM artifact input — only the fields SafeguardWasmArtifactRawIn reads.
// Avoids passing the full NormalizedGearArtifact (~20 fields) and NormalizedStat
// substats (~9 fields each) through serde_wasm_bindgen.
// mainStat is passed as a plain number (variant only) so serde immediately matches
// the Variant(i64) branch of the untagged enum, skipping the failed object-try.
export type WasmArtifactStoreInput = {
  id: number
  slot: number
  set: number
  rank: number
  rarity: number
  level: number
  exactLevel?: number | null
  faction: number
  mainStat?: number | null
  substats: WasmSubstatStoreInput[]
  equippedChampionLocation?: string | null
  gearInspectorItem: TestItem
}

// Compact row passed to store_artifact_rows_value.
// Only artifact is required; SafeguardCollectRowFastIn's other fields default via #[serde(default)].
export type WasmArtifactStoreRow = {
  artifact: WasmArtifactStoreInput
}

// Evaluate options mirror evaluateMatchesByRecipe inputs used by worker paths.
// The WASM engine accepts object values and applies the same source/recipe gating.
export type WasmRuleEngineEvaluateOptions = {
  excludeSources?: readonly string[]
  excludeRecipeIndices?: ReadonlySet<number>
  ignoreSafeguardRecipeIndices?: ReadonlySet<number>
  baselineExcludeSources?: readonly string[]
}

type WasmRuleEngineEvaluatePayload = {
  // Excluded rule sources (e.g., safeguard injections) for baseline scans.
  excludeSources?: string[]
  // Baseline-specific source exclusions used by worker differential flows.
  baselineExcludeSources?: string[]
  // Explicit recipe indices to skip during matcher evaluation.
  excludeRecipeIndices?: number[]
  // Recipe indices ignored by safeguard precedence logic.
  ignoreSafeguardRecipeIndices?: number[]
}

// Internal cached init promise prevents duplicate wasm instantiation work.
// Workers call configure/evaluate repeatedly, so one init per worker is enough.
let wasmInitPromise: Promise<void> | null = null
let wasmInitialized = false

// Sync helpers are used on hot paths that cannot await. Callers must warm up first.
const assertWasmInitializedSync = (): void => {
  if (!wasmInitialized) {
    throw new Error('WASM rule engine is not initialized. Call warmupWasmRuleEngine() first.')
  }
}

// Decode flat wasm int arrays into fixed-width rows without JSON parse costs.
// This helper is fail-closed so malformed wasm payloads surface immediately.
const unflattenI32Rows = (flat: Int32Array, rowWidth: number): number[][] => {
  if (!Number.isFinite(rowWidth) || rowWidth < 0) {
    throw new Error(`Invalid wasm row width: ${String(rowWidth)}`)
  }
  if (rowWidth === 0) {
    if (flat.length === 0) return [[]]
    throw new Error('WASM row decoder received non-empty payload for zero-width rows.')
  }
  if (flat.length % rowWidth !== 0) {
    throw new Error('WASM row decoder received a payload with mismatched row width.')
  }
  const rowCount = Math.floor(flat.length / rowWidth)
  const rows: number[][] = new Array(rowCount)
  for (let row = 0; row < rowCount; row += 1) {
    const start = row * rowWidth
    const values: number[] = new Array(rowWidth)
    for (let col = 0; col < rowWidth; col += 1) {
      values[col] = flat[start + col] ?? 0
    }
    rows[row] = values
  }
  return rows
}

// Keep conversion helpers branch-free on hot paths: if callers already prepared
// typed arrays, forward them directly instead of allocating/mapping again.
const toFlooredI32 = (values: ReadonlyArray<number> | Int32Array): Int32Array => {
  if (values instanceof Int32Array) return values
  const out = new Int32Array(values.length)
  for (let idx = 0; idx < values.length; idx += 1) {
    const value = values[idx] ?? 0
    out[idx] = Number.isFinite(value) ? Math.floor(value) : 0
  }
  return out
}

// Convert Set inputs into plain arrays before serializing into the WASM payload.
// This keeps call sites typed while preserving deterministic JSON output ordering.
const toSortedNumberArray = (input?: ReadonlySet<number>): number[] | undefined => {
  if (!input || input.size === 0) return undefined
  return Array.from(input).sort((a, b) => a - b)
}

// Keep options payload construction in one place so async/sync evaluate wrappers
// cannot drift when we add new selector toggles.
const toEvaluateOptionsPayload = (
  options?: WasmRuleEngineEvaluateOptions,
): WasmRuleEngineEvaluatePayload => {
  // Start empty and attach only fields that are present/non-empty.
  const payload: WasmRuleEngineEvaluatePayload = {}
  // Copy source blocklist only when callers explicitly requested one.
  if (options?.excludeSources && options.excludeSources.length > 0) {
    payload.excludeSources = Array.from(options.excludeSources)
  }
  // Copy baseline source blocklist only when explicitly requested.
  if (options?.baselineExcludeSources && options.baselineExcludeSources.length > 0) {
    payload.baselineExcludeSources = Array.from(options.baselineExcludeSources)
  }
  // Convert recipe index set into sorted array for deterministic payload shape.
  if (options?.excludeRecipeIndices && options.excludeRecipeIndices.size > 0) {
    const sorted = toSortedNumberArray(options.excludeRecipeIndices)
    // Guard the assignment so exact optional typing never receives undefined.
    if (sorted) payload.excludeRecipeIndices = sorted
  }
  // Convert safeguard ignore set into sorted array for deterministic payload shape.
  if (options?.ignoreSafeguardRecipeIndices && options.ignoreSafeguardRecipeIndices.size > 0) {
    const sorted = toSortedNumberArray(options.ignoreSafeguardRecipeIndices)
    // Guard the assignment so exact optional typing never receives undefined.
    if (sorted) payload.ignoreSafeguardRecipeIndices = sorted
  }
  // Return compact payload so wasm bindings only receive active filters.
  return payload
}

// Ensure the WASM binary is instantiated exactly once for this JS context.
// The generated binding no-ops after first init, so repeated calls stay cheap.
const ensureWasmInitialized = async (): Promise<void> => {
  if (!wasmInitPromise) {
    wasmInitPromise = initRuleEngineWasm().then(() => {
      wasmInitialized = true
    })
  }
  await wasmInitPromise
}

// Warmup helper allows callers with async control flow to preload the wasm
// module so later sync helpers (e.g., obsolete pruning) can run in-process.
export const warmupWasmRuleEngine = async (): Promise<void> => {
  await ensureWasmInitialized()
}

// Configure the WASM engine with the merged rules + recipe mode visibility.
// This must run before evaluate, matching the existing worker configure flow.
export const configureWasmRuleEngine = async (params: {
  rules: HsfRuleWithRecipe[]
  recipeModes: SellfileExportMode[]
}): Promise<void> => {
  // Ensure module init before invoking wasm configure binding.
  await ensureWasmInitialized()
  // Configure shared matcher state used by subsequent evaluate calls.
  configureRuleEngineWasmValueBinding(params.rules, params.recipeModes)
}

// Evaluate a batch of Gear Inspector items through the WASM matcher implementation.
// Results are parsed back into the existing worker item-result shape.
export const evaluateWasmRuleEngineItems = async (params: {
  items: GearInspectorMatchWorkerEvaluateItem[]
  options?: WasmRuleEngineEvaluateOptions
}): Promise<GearInspectorMatchWorkerItemResult[]> => {
  // Ensure module init before invoking wasm evaluate binding.
  await ensureWasmInitialized()
  // Normalize optional filters into the compact wasm payload shape.
  const optionsPayload = toEvaluateOptionsPayload(params.options)
  // Evaluate all provided items using the configured matcher state.
  const result = evaluateRuleEngineWasmValueBinding(params.items, optionsPayload)
  // Return parsed results when binding returned the expected array payload.
  if (Array.isArray(result)) return result as GearInspectorMatchWorkerItemResult[]
  // Fail loudly on malformed payloads instead of masking with fallback rows.
  throw new Error('WASM matcher evaluate returned an invalid payload.')
}

// Sync configure helper is used by main-thread adapters that cannot await.
// Callers must run warmup first and then can configure on each ruleset swap.
export const configureWasmRuleEngineWithLoadedWasm = (params: {
  rules: HsfRuleWithRecipe[]
  recipeModes: SellfileExportMode[]
}): void => {
  // Sync helper is fail-closed: caller must have warmed wasm already.
  assertWasmInitializedSync()
  // Configure matcher state for sync callers that cannot await.
  configureRuleEngineWasmValueBinding(params.rules, params.recipeModes)
}

// Sync evaluate helper mirrors the async wrapper but skips init checks.
// This keeps matcher adapters WASM-only while still exposing sync call sites.
export const evaluateWasmRuleEngineItemsWithLoadedWasm = (params: {
  items: GearInspectorMatchWorkerEvaluateItem[]
  options?: WasmRuleEngineEvaluateOptions
}): GearInspectorMatchWorkerItemResult[] => {
  // Sync helper is fail-closed: caller must have warmed wasm already.
  assertWasmInitializedSync()
  // Normalize optional filters into the compact wasm payload shape.
  const optionsPayload = toEvaluateOptionsPayload(params.options)
  // Evaluate all provided items using the configured matcher state.
  const result = evaluateRuleEngineWasmValueBinding(params.items, optionsPayload)
  // Return parsed results when binding returned the expected array payload.
  if (Array.isArray(result)) return result as GearInspectorMatchWorkerItemResult[]
  // Fail loudly when wasm returns an unexpected payload type.
  throw new Error('WASM matcher evaluate returned an invalid payload.')
}

// Version token helps quickly verify which compiled WASM payload is loaded.
// Keep this wired so debugging transcripts can include a stable identifier.
export const getWasmRuleEngineVersion = async (): Promise<string> => {
  await ensureWasmInitialized()
  return ruleEngineWasmVersionBinding()
}

type WasmObsoleteEntry = { index: number; coveredBy: number; reason: string }
type WasmObsoleteReport = { obsolete: WasmObsoleteEntry[] }

type WasmGeneratedEntry = {
  rule: HsfRuleWithRecipe
  branchOrder: number
  branchSeq: number
  originalIdx: number
}

type WasmSafeguardCountModePayload = {
  perRule: boolean
  perSet: boolean
  perFaction: boolean
  perMainStat: boolean
  perSlot: boolean
}

type WasmCollectedSafeguardCandidate = {
  rowIndex: number
  itemKey: number
  groupKey: string
  isSold: boolean
  // artifact removed: Rust no longer emits it; callers use rows[rowIndex].artifact.
}

type WasmCollectedSafeguardSnapshot = {
  candidates: WasmCollectedSafeguardCandidate[]
  uniqueItemKeys: number[]
}

type WasmCollectedAndProtectedSafeguardSnapshot = {
  candidates: WasmCollectedSafeguardCandidate[]
  uniqueItemKeys: number[]
  detection: SafeguardDetectionSnapshot
}

// Synchronous obsolete-pruning helper used by generation code paths that must
// stay sync; it only runs after the async warmup initialized the module.
export const findObsoleteRulesWithLoadedWasm = (rules: HsfRule[]): WasmObsoleteReport | null => {
  assertWasmInitializedSync()
  const report = findObsoleteRuleEngineWasmValueBinding(rules) as WasmObsoleteReport
  if (report && Array.isArray(report.obsolete)) return report
  throw new Error('WASM obsolete-rule detector returned an invalid payload.')
}

// Export dedupe helper; normalization + coverage matching live in Rust as the single source of truth.
export const dedupeHsfRulesForExportWithLoadedWasm = (rules: HsfRuleWithRecipe[]): HsfRuleWithRecipe[] | null => {
  assertWasmInitializedSync()
  const result = dedupeHsfRulesForExportWasmValueBinding(rules) as HsfRuleWithRecipe[]
  if (Array.isArray(result)) return result
  throw new Error('WASM export-rule dedupe returned an invalid payload.')
}

// Synchronous finalizer mirrors merge.ts post-build collapse/prune/sort logic.
// Worker warm paths call this after async warmup so no extra await is required.
export const finalizeGeneratedRulesWithLoadedWasm = (params: {
  entries: readonly GeneratedBranchRuleEntry[]
  applyObsoletePruning: boolean
}): HsfRuleWithRecipe[] | null => {
  assertWasmInitializedSync()
  const payload = params.entries as WasmGeneratedEntry[]
  const result = finalizeGeneratedRulesWasmValueBinding(payload, params.applyObsoletePruning) as HsfRuleWithRecipe[]
  if (Array.isArray(result)) return result
  throw new Error('WASM finalize-generated-rules returned an invalid payload.')
}

// Synchronous safeguard detector runs candidate/rule loops inside wasm.
// Callers must warm wasm first; invalid payloads are surfaced by callers.
export const computeSafeguardProtectionWithLoadedWasm = (params: {
  candidates: readonly SafeguardCandidate[]
  rules: readonly SafeguardRule[]
  expectedGroupsByRuleId?: Record<string, unknown>
  expectedGroupDomain?: Record<string, unknown>
  enabled: boolean
  now: number
}): SafeguardDetectionSnapshot => {
  assertWasmInitializedSync()
  // Wrapper payload carries canonical expected-group metadata into wasm.
  const expectedGroupsPayload = (
    params.expectedGroupsByRuleId !== undefined
    || params.expectedGroupDomain !== undefined
  )
    ? {
      ...(params.expectedGroupsByRuleId !== undefined
        ? { expectedGroupsByRuleId: params.expectedGroupsByRuleId }
        : {}),
      ...(params.expectedGroupDomain !== undefined
        ? { expectedGroupDomain: params.expectedGroupDomain }
        : {}),
    }
    : undefined
  const result = computeSafeguardProtectionValueWasmBinding(
    params.candidates,
    params.rules,
    expectedGroupsPayload,
    params.enabled === true,
    Number.isFinite(params.now) ? params.now : 0,
  )
  if (result && typeof result === 'object' && Array.isArray((result as { entries?: unknown }).entries)) {
    return result as SafeguardDetectionSnapshot
  }
  throw new Error('WASM safeguard detection returned an invalid payload.')
}

// Candidate collection keeps keep-flag resolution + item/group key derivation
// in Rust; TS callers reattach row references for compatibility.
export const collectSafeguardCandidatesWithLoadedWasm = (params: {
  rows: readonly GearInspectorPreviewRow[]
  rules: HsfRuleWithRecipe[]
  recipeModes: SellfileExportMode[]
  ignoreSafeguardRecipeIndices?: ReadonlySet<number>
}): WasmCollectedSafeguardSnapshot => {
  assertWasmInitializedSync()
  const ignored = toSortedNumberArray(params.ignoreSafeguardRecipeIndices) ?? null
  const result = collectSafeguardCandidatesWasmValueBinding(
    params.rows,
    params.rules,
    params.recipeModes,
    ignored,
  ) as WasmCollectedSafeguardSnapshot
  if (result && Array.isArray(result.candidates) && Array.isArray(result.uniqueItemKeys)) {
    return result
  }
  throw new Error('WASM safeguard candidate collector returned an invalid payload.')
}

// Combined safeguard pipeline runs candidate collection + detection in one
// wasm call so TS orchestration avoids two separate Rust roundtrips.
export const collectAndComputeSafeguardProtectionWithLoadedWasm = (params: {
  rows: readonly GearInspectorPreviewRow[]
  rules: HsfRuleWithRecipe[]
  recipeModes: SellfileExportMode[]
  ignoreSafeguardRecipeIndices?: ReadonlySet<number>
  safeguardRules: readonly SafeguardRuleForWasm[]
  expectedGroupsByRuleId?: Record<string, unknown>
  expectedGroupDomain?: Record<string, unknown>
  enabled: boolean
  now: number
}): WasmCollectedAndProtectedSafeguardSnapshot => {
  assertWasmInitializedSync()
  const ignored = toSortedNumberArray(params.ignoreSafeguardRecipeIndices) ?? null
  const expectedGroupsPayload = (
    params.expectedGroupsByRuleId !== undefined
    || params.expectedGroupDomain !== undefined
  )
    ? {
      ...(params.expectedGroupsByRuleId !== undefined
        ? { expectedGroupsByRuleId: params.expectedGroupsByRuleId }
        : {}),
      ...(params.expectedGroupDomain !== undefined
        ? { expectedGroupDomain: params.expectedGroupDomain }
        : {}),
    }
    : undefined
  const result = collectAndComputeSafeguardProtectionWasmValueBinding(
    params.rows,
    params.rules,
    params.recipeModes,
    ignored,
    params.safeguardRules,
    expectedGroupsPayload,
    params.enabled === true,
    Number.isFinite(params.now) ? params.now : 0,
  ) as WasmCollectedAndProtectedSafeguardSnapshot
  if (
    result
    && Array.isArray(result.candidates)
    && Array.isArray(result.uniqueItemKeys)
    && result.detection
    && Array.isArray(result.detection.entries)
  ) {
    return result
  }
  throw new Error('WASM safeguard combined collector/detector returned an invalid payload.')
}

// Debug snapshot mirroring UpgradeChanceDebug from upgrade_chance.rs.
// exactOptionalPropertyTypes: all nullable fields use T | null (not T | undefined).
export type UpgradeChanceWasmDebug = {
  sourceArtifactCount: number
  viableScenarioCount: number
  selectedSubstats: number[]
  substatMatch: string
  requiredPerGroup: number
  bucketCandidateCount: number
  betterCandidateCount: number
  matchedSelectedNow: number
  maxAdditionEventsTo16: number
}

// Single artifact entry returned by compute_upgrade_chance_value.
export type UpgradeChanceWasmEntry = {
  artifactId: number
  chancePercent: number
  hasMatchingSafeguard: boolean
  // Legacy field; always null now that SafeguardRule carries no id. Kept for deserialization compat.
  matchedRuleId: string | null
  // 1-based ordinal of the preferred safeguard rule; null when no rule matched.
  ruleOrdinal: number | null
  debug: UpgradeChanceWasmDebug | null
}

// Output shape for the combined evaluate+collect WASM call.
// evaluateResults mirrors the Vec<EvaluateItemResult> shape from evaluate_value;
// the remaining fields match WasmCollectedAndProtectedSafeguardSnapshot.
export type WasmEvaluateAndCollectSnapshot = {
  evaluateResults: GearInspectorMatchWorkerItemResult[]
  candidates: WasmCollectedSafeguardCandidate[]
  uniqueItemKeys: number[]
  detection: SafeguardDetectionSnapshot
}

// Store pre-parsed artifact rows in WASM engine state so the combined evaluate+collect
// entry point can read them without re-deserializing on every detection call.
// Caller must have called configureWasmRuleEngine first; re-call when the artifact DB changes.
// Returns the number of rows stored.
export const storeArtifactRowsWithLoadedWasm = (params: {
  rows: readonly WasmArtifactStoreRow[]
}): number => {
  assertWasmInitializedSync()
  // Compact rows contain only the fields WASM reads; extra properties have been stripped
  // on the JS side to avoid serde_wasm_bindgen iterating ignored fields in Firefox.
  return storeArtifactRowsWasmValueBinding(params.rows) as number
}

// Combined evaluate + safeguard-collect wrapper — replaces the two-step
// evaluate_value + collect_and_compute_safeguard_protection_value call pattern.
// Caller must configure the engine via configureWasmRuleEngine and store artifact rows
// via storeArtifactRowsWithLoadedWasm before calling this function.
export const evaluateAndCollectSafeguardProtectionWithLoadedWasm = (params: {
  options?: WasmRuleEngineEvaluateOptions
  ignoreSafeguardRecipeIndices?: ReadonlySet<number>
  safeguardRules: readonly SafeguardRuleForWasm[]
  expectedGroupDomain?: Record<string, unknown>
  enabled: boolean
  now: number
}): WasmEvaluateAndCollectSnapshot => {
  assertWasmInitializedSync()
  const ignored = toSortedNumberArray(params.ignoreSafeguardRecipeIndices) ?? null
  // Build evaluate options payload (mirrors evaluateWasmRuleEngineItems).
  const evaluatePayload: WasmRuleEngineEvaluatePayload = {}
  const opts = params.options
  if (opts?.excludeSources?.length) evaluatePayload.excludeSources = [...opts.excludeSources]
  if (opts?.baselineExcludeSources?.length) evaluatePayload.baselineExcludeSources = [...opts.baselineExcludeSources]
  if (opts?.excludeRecipeIndices?.size) evaluatePayload.excludeRecipeIndices = [...opts.excludeRecipeIndices]
  if (opts?.ignoreSafeguardRecipeIndices?.size) evaluatePayload.ignoreSafeguardRecipeIndices = [...opts.ignoreSafeguardRecipeIndices]
  const expectedGroupsPayload = params.expectedGroupDomain !== undefined
    ? { expectedGroupDomain: params.expectedGroupDomain }
    : undefined
  // Rows are read from ENGINE_STATE.stored_rows (populated by storeArtifactRowsWithLoadedWasm).
  const result = evaluateAndCollectSafeguardProtectionWasmValueBinding(
    Object.keys(evaluatePayload).length ? evaluatePayload : null,
    ignored,
    params.safeguardRules,
    expectedGroupsPayload,
    params.enabled === true,
    Number.isFinite(params.now) ? params.now : 0,
  ) as WasmEvaluateAndCollectSnapshot
  if (
    result
    && Array.isArray(result.evaluateResults)
    && Array.isArray(result.candidates)
    && Array.isArray(result.uniqueItemKeys)
    && result.detection
    && Array.isArray(result.detection.entries)
  ) {
    return result
  }
  throw new Error('WASM evaluate-and-collect safeguard snapshot returned an invalid payload.')
}

// Metaset expansion for safeguard rules now runs in Rust so include/exclude
// precedence stays single-sourced across app and workers.
export const resolveSafeguardRulesWithMetasetsWithLoadedWasm = <T extends { combination: unknown }>(
  rules: readonly T[],
  metasets: readonly unknown[],
): T[] => {
  assertWasmInitializedSync()
  if (rules.length === 0 || metasets.length === 0) return rules as T[]
  const result = resolveSafeguardRulesWithMetasetsWasmValueBinding(rules, metasets) as T[]
  if (Array.isArray(result)) return result
  throw new Error('WASM safeguard metaset resolver returned an invalid payload.')
}

// Injected safeguard merge filtering/sorting runs in Rust so canonicalization
// and dedupe precedence are defined in one implementation.
export const mergeSafeguardInjectedRulesWithLoadedWasm = (params: {
  baseRules: HsfRuleWithRecipe[]
  customRules: HsfRuleWithRecipe[]
  candidateSafeguardRules: HsfRuleWithRecipe[]
}): HsfRuleWithRecipe[] => {
  assertWasmInitializedSync()
  const result = mergeSafeguardInjectedRulesWasmValueBinding(
    params.baseRules,
    params.customRules,
    params.candidateSafeguardRules,
  )
  if (Array.isArray(result)) return result as HsfRuleWithRecipe[]
  throw new Error('WASM safeguard injected-rule merge returned an invalid payload.')
}

// Safeguard HSF rule construction moved to Rust so merge.ts no longer
// maintains duplicate placeholder/artifact expansion logic.
export const buildSafeguardRulesWithLoadedWasm = (params: {
  rules: readonly SafeguardRule[]
  detection: SafeguardDetectionSnapshot | null
  recipeIdBase: number
}): HsfRuleWithRecipe[] => {
  assertWasmInitializedSync()
  if (!params.detection) return []
  const result = buildSafeguardRulesWasmValueBinding(
    params.rules,
    params.detection,
    BigInt(Math.floor(params.recipeIdBase)),
  )
  if (Array.isArray(result)) return result as HsfRuleWithRecipe[]
  throw new Error('WASM safeguard rule builder returned an invalid payload.')
}

// Final-sell HSF remainder generation runs in Rust so merge.ts no longer owns
// level/type/set expansion loops.
export const buildFinalSellRulesWithLoadedWasm = (params: {
  finalSellRemainder: FinalSellRemainderConfig | null | undefined
  allKnownSetIds: number[]
}): HsfRuleWithRecipe[] => {
  assertWasmInitializedSync()
  const result = buildFinalSellRulesWasmValueBinding(
    params.finalSellRemainder ?? null,
    params.allKnownSetIds,
  )
  if (Array.isArray(result)) return result as HsfRuleWithRecipe[]
  throw new Error('WASM final-sell rule builder returned an invalid payload.')
}

// Custom-rule batch flattening + total-limit gating runs in Rust so merge.ts
// keeps one source for add-batch overflow behavior.
export const flattenRuleBatchesWithTotalLimitWithLoadedWasm = (params: {
  baseCount: number
  totalLimit: number | null
  batches: ReadonlyArray<ReadonlyArray<HsfRuleWithRecipe>>
}): HsfRuleWithRecipe[] => {
  assertWasmInitializedSync()
  const result = flattenRuleBatchesWithTotalLimitWasmValueBinding(
    BigInt(Math.max(0, Math.floor(params.baseCount))),
    BigInt(params.totalLimit != null ? Math.floor(params.totalLimit) : -1),
    params.batches,
  )
  if (Array.isArray(result)) return result as HsfRuleWithRecipe[]
  throw new Error('WASM custom-rule batch flattener returned an invalid payload.')
}

// Merge orchestration combines base/custom/final-sell/safeguard rows and
// assigns stable __lineIdx ordering in one Rust pass.
export const computeMergedRulesWithLoadedWasm = (params: {
  baseRules: HsfRuleWithRecipe[]
  customRules: HsfRuleWithRecipe[]
  finalSellRemainder: FinalSellRemainderConfig | null | undefined
  allKnownSetIds: number[]
  // Transform generated HSF rows before safeguard evaluation/injection.
  omitDisabledBeforeSafeguards: boolean
  dedupeBeforeSafeguards: boolean
  safeguardEnabled: boolean
  safeguardRules: readonly SafeguardRule[]
  safeguardDetection: SafeguardDetectionSnapshot | null | undefined
  safeguardRecipeIdBase: number
}): HsfRuleWithRecipe[] => {
  assertWasmInitializedSync()
  const result = computeMergedRulesWasmValueBinding({
    baseRules: params.baseRules,
    customRules: params.customRules,
    finalSellRemainder: params.finalSellRemainder ?? null,
    allKnownSetIds: params.allKnownSetIds,
    omitDisabledBeforeSafeguards: params.omitDisabledBeforeSafeguards === true,
    dedupeBeforeSafeguards: params.dedupeBeforeSafeguards === true,
    // Rust uses canonical safeguard payload keys for merged-rule orchestration.
    safeguardEnabled: params.safeguardEnabled === true,
    safeguardRules: params.safeguardRules,
    safeguardDetection: params.safeguardDetection ?? null,
    safeguardRecipeIdBase: Math.floor(params.safeguardRecipeIdBase),
  })
  if (Array.isArray(result)) return result as HsfRuleWithRecipe[]
  throw new Error('WASM merged-rule orchestrator returned an invalid payload.')
}

// Auto-flex rarity branch expansion now runs in Rust so merge.ts keeps one
// source for the branch split heuristics tied to auto rarity + locked mins.
export const expandAutoFlexRarityBranchesWithLoadedWasm = (params: {
  recipe: BuilderRecipe
  baseRarityCode: number
}): BuilderRecipe[] => {
  assertWasmInitializedSync()
  const rawResult = expandAutoFlexRarityBranchesWasmValueBinding(
    params.recipe,
    Math.floor(params.baseRarityCode),
  )
  // Rust emits only the declared AutoFlexRarityRecipeIn fields (rarity-related
  // fields + substatsV/bounds used for branch logic).  Merge each branch with
  // the original recipe so non-declared fields (minCount, mainStats, etc.) are
  // preserved.  Branch-specific overrides (rarityMode, rarityCode, minLevel,
  // etc.) from WASM take precedence via the right-side spread.
  if (Array.isArray(rawResult)) {
    return rawResult.map((branch) => ({
      ...params.recipe,
      ...(branch as Partial<BuilderRecipe>),
    }))
  }
  throw new Error('WASM auto-flex rarity branch expansion returned an invalid payload.')
}

// Builder-facing auto-rarity helper accepts raw recipe vectors and allowed ids.
// Rust compacts selected/fixed/bounds before running the shared rarity core.
export const resolveAutoRarityCodeForBuilderWithLoadedWasm = (payload: {
  autoRaritySupplementsThreshold?: string | null
  autoMinRequiredRolls?: boolean
  minRequiredRolls?: number
  lockedMinRequiredRolls?: number
  minCount?: number
  earlyKeepMode?: string
  substatsV: ReadonlyArray<number> | Int32Array
  fixedSubstatsV: ReadonlyArray<number> | Int32Array
  substatRollBoundsV: Record<number, { min?: number }> | undefined
  allowedSubstats: ReadonlyArray<number> | Int32Array
}): number => {
  // Sync helper is fail-closed: caller must have warmed wasm already.
  assertWasmInitializedSync()
  // Delegate selection/fixed filtering + bound compaction + resolve to Rust.
  const result = resolveAutoRarityCodeForBuilderWasmValueBinding({
    ...(typeof payload.autoRaritySupplementsThreshold === 'string'
      ? { autoRaritySupplementsThreshold: payload.autoRaritySupplementsThreshold }
      : {}),
    ...(typeof payload.autoMinRequiredRolls === 'boolean'
      ? { autoMinRequiredRolls: payload.autoMinRequiredRolls }
      : {}),
    ...(typeof payload.minRequiredRolls === 'number' && Number.isFinite(payload.minRequiredRolls)
      ? { minRequiredRolls: payload.minRequiredRolls }
      : {}),
    ...(typeof payload.lockedMinRequiredRolls === 'number' && Number.isFinite(payload.lockedMinRequiredRolls)
      ? { lockedMinRequiredRolls: payload.lockedMinRequiredRolls }
      : {}),
    ...(typeof payload.minCount === 'number' && Number.isFinite(payload.minCount)
      ? { minCount: payload.minCount }
      : {}),
    ...(typeof payload.earlyKeepMode === 'string'
      ? { earlyKeepMode: payload.earlyKeepMode }
      : {}),
    substatsV: Array.from(toFlooredI32(payload.substatsV)),
    fixedSubstatsV: Array.from(toFlooredI32(payload.fixedSubstatsV)),
    substatRollBoundsV: payload.substatRollBoundsV ?? {},
    allowedSubstats: Array.from(toFlooredI32(payload.allowedSubstats)),
  })
  // Rust binding returns a numeric rarity code; reject malformed payloads.
  if (typeof result === 'number' && Number.isFinite(result)) return Math.floor(result)
  throw new Error('WASM auto-rarity builder resolver returned an invalid payload.')
}

// Auto-rarity roll-level helper keeps TS schedule lookups sourced from Rust.
export const getAutoRarityRollLevelsForCodeWithLoadedWasm = (rarityCode: number): number[] => {
  assertWasmInitializedSync()
  const levels = autoRarityRollLevelsForCodeWasmValueBinding(Math.floor(rarityCode))
  if (levels instanceof Int32Array) return Array.from(levels, (value) => Math.floor(Number(value)))
  throw new Error('WASM auto-rarity roll-level helper returned an invalid payload.')
}

// Auto-rarity addition-level helper keeps TS schedule lookups sourced from Rust.
export const getAutoRarityAdditionLevelsForCodeWithLoadedWasm = (rarityCode: number): number[] => {
  assertWasmInitializedSync()
  const levels = autoRarityAdditionLevelsForCodeWasmValueBinding(Math.floor(rarityCode))
  if (levels instanceof Int32Array) return Array.from(levels, (value) => Math.floor(Number(value)))
  throw new Error('WASM auto-rarity addition-level helper returned an invalid payload.')
}

// Mythical-membership helper keeps TS schedule lookups sourced from Rust.
export const getAutoRarityIncludesMythicalForCodeWithLoadedWasm = (rarityCode: number): boolean => {
  assertWasmInitializedSync()
  return autoRarityIncludesMythicalForCodeWasmValueBinding(Math.floor(rarityCode)) === true
}

// Builder prep helper normalizes selected/fixed pools and precomputes per-variant
// base/target maps in Rust so hsfBuilder.ts avoids heavy per-recipe prep loops.
export const prepareHsfBuilderRecipeWithLoadedWasm = (payload: {
  minCount: number
  autoSubstatFlex: boolean
  flexEligible: boolean
  substatsV: ReadonlyArray<number> | Int32Array
  fixedSubstatsV: ReadonlyArray<number> | Int32Array
  allowedSubstats: ReadonlyArray<number> | Int32Array
  substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean }>
  substatRollTargetsV?: Record<number, { base?: number; increments?: Array<number | null> }>
  substatTargetByVariant: Record<number, number>
  factoryBaseByVariantForStar: Record<number, number>
  variantPriority: ReadonlyArray<number> | Int32Array
}): {
  selectedPoolV: number[]
  requiredV: number[]
  optionalPoolV: number[]
  minTargetCount: number
  maxTargetCount: number
  maxSelectableCount: number
  hadRequestedSubstats: boolean
  hasPerStatMin: boolean
  currentBaseByVariant: Record<string, number>
  factoryBaseByVariant: Record<string, number | null>
  targetBaseOverrideByVariant: Record<string, number | null>
  targetEntriesByVariant: Record<string, { base?: number; increments?: Array<number | null> }>
} => {
  assertWasmInitializedSync()
  const result = prepareHsfBuilderRecipeWasmValueBinding({
    minCount: Math.floor(payload.minCount),
    autoSubstatFlex: payload.autoSubstatFlex === true,
    flexEligible: payload.flexEligible === true,
    substatsV: Array.from(toFlooredI32(payload.substatsV)),
    fixedSubstatsV: Array.from(toFlooredI32(payload.fixedSubstatsV)),
    allowedSubstats: Array.from(toFlooredI32(payload.allowedSubstats)),
    substatRollBoundsV: payload.substatRollBoundsV ?? {},
    substatRollTargetsV: payload.substatRollTargetsV ?? {},
    substatTargetByVariant: payload.substatTargetByVariant ?? {},
    factoryBaseByVariantForStar: payload.factoryBaseByVariantForStar ?? {},
    variantPriority: Array.from(toFlooredI32(payload.variantPriority)),
  }) as {
    selectedPoolV?: unknown
    requiredV?: unknown
    optionalPoolV?: unknown
    minTargetCount?: unknown
    maxTargetCount?: unknown
    maxSelectableCount?: unknown
    hadRequestedSubstats?: unknown
    hasPerStatMin?: unknown
    currentBaseByVariant?: unknown
    factoryBaseByVariant?: unknown
    targetBaseOverrideByVariant?: unknown
    targetEntriesByVariant?: unknown
  }
  if (
    !result
    || !Array.isArray(result.selectedPoolV)
    || !Array.isArray(result.requiredV)
    || !Array.isArray(result.optionalPoolV)
    || result.currentBaseByVariant == null
    || result.factoryBaseByVariant == null
    || result.targetBaseOverrideByVariant == null
    || result.targetEntriesByVariant == null
  ) {
    throw new Error('WASM prepare-hsf-builder-recipe helper returned an invalid payload.')
  }
  return {
    selectedPoolV: result.selectedPoolV.map((value) => Math.floor(Number(value))),
    requiredV: result.requiredV.map((value) => Math.floor(Number(value))),
    optionalPoolV: result.optionalPoolV.map((value) => Math.floor(Number(value))),
    minTargetCount: Math.floor(Number(result.minTargetCount ?? 0)),
    maxTargetCount: Math.floor(Number(result.maxTargetCount ?? 0)),
    maxSelectableCount: Math.floor(Number(result.maxSelectableCount ?? 0)),
    hadRequestedSubstats: result.hadRequestedSubstats === true,
    hasPerStatMin: result.hasPerStatMin === true,
    // Rust emits plain objects via serialize_maps_as_objects; no Map → object conversion needed.
    currentBaseByVariant: result.currentBaseByVariant as Record<string, number>,
    factoryBaseByVariant: result.factoryBaseByVariant as Record<string, number | null>,
    targetBaseOverrideByVariant: result.targetBaseOverrideByVariant as Record<string, number | null>,
    targetEntriesByVariant: result.targetEntriesByVariant as Record<string, { base?: number; increments?: Array<number | null> }>,
  }
}

// Safeguard substat sorting runs in Rust so TS reuses one priority ordering.
export const sortSafeguardSubstatsWithLoadedWasm = (values: readonly number[]): number[] => {
  assertWasmInitializedSync()
  const sorted = sortSafeguardSubstatsWasmValueBinding(values)
  if (sorted instanceof Int32Array) return Array.from(sorted, (value) => Math.floor(Number(value)))
  if (Array.isArray(sorted)) return sorted.map((value) => Math.floor(Number(value)))
  throw new Error('WASM safeguard substat sorter returned an invalid payload.')
}

// Live preview scoring for the weight popover: scores candidates with the
// given substats/weights without running the full detection pass.
// Returns candidates sorted by score descending with 1-based rank and quota flag.
export const scoreSafeguardCandidatesWithLoadedWasm = (params: {
  // Artifacts to score — sourced from SafeguardDetectionEntry.artifacts in the snapshot.
  artifacts: unknown[]
  // Substat variant IDs to include in the scoring formula.
  substats: number[]
  // Per-variant weight multipliers (variant id → weight).
  weights: Record<number, number>
  // How many items the rule intends to keep (quota for isWithinQuota).
  requiredCount: number
}): SafeguardCandidateOut[] => {
  assertWasmInitializedSync()
  const result = scoreSafeguardCandidatesWasmValueBinding({
    artifacts: params.artifacts,
    substats: params.substats,
    weights: params.weights,
    requiredCount: params.requiredCount,
  })
  if (Array.isArray(result)) return result as SafeguardCandidateOut[]
  throw new Error('WASM safeguard score preview returned an invalid payload.')
}

// Safeguard combination sorting runs in Rust so TS reuses one canonical order.
export const sortSafeguardCombinationWithLoadedWasm = <T extends object>(combination: T): T => {
  assertWasmInitializedSync()
  const sorted = sortSafeguardCombinationWasmValueBinding(combination)
  if (sorted && typeof sorted === 'object') return sorted as T
  throw new Error('WASM safeguard combination sorter returned an invalid payload.')
}

// Safeguard combination hash generation runs in Rust so TS reuses one canonical
// tokenization implementation for snapshots + rule metadata.
export const hashSafeguardCombinationWithLoadedWasm = (combination: unknown): string => {
  assertWasmInitializedSync()
  const hash = hashSafeguardCombinationWasmValueBinding(combination)
  if (typeof hash === 'string') return hash
  throw new Error('WASM safeguard combination hash helper returned an invalid payload.')
}

// Safeguard item-key derivation runs in Rust so TS reuses DB-id-first
// semantics used by candidate collection.
export const getSafeguardItemKeyWithLoadedWasm = (artifact: unknown): number => {
  assertWasmInitializedSync()
  const key = safeguardItemKeyValueWasmValueBinding(artifact)
  // wasm-bindgen maps Rust `i64` to JS `bigint`, but older bindings may still
  // surface a JS number in some environments.
  if (typeof key === 'bigint') {
    const numeric = Number(key)
    if (Number.isFinite(numeric)) return Math.floor(numeric)
  }
  // Keep compatibility with number-returning bindings while still fail-closing.
  if (typeof key === 'number' && Number.isFinite(key)) return Math.floor(key)
  throw new Error('WASM safeguard item-key helper returned an invalid payload.')
}

// Safeguard group-key derivation runs in Rust so TS reuses accessory faction
// normalization used by candidate collection.
export const getSafeguardGroupKeyWithLoadedWasm = (artifact: unknown): string => {
  assertWasmInitializedSync()
  const key = safeguardGroupKeyValueWasmValueBinding(artifact)
  if (typeof key === 'string') return key
  throw new Error('WASM safeguard group-key helper returned an invalid payload.')
}

// Safeguard expected-group generation uses this helper so group-key logic is
// defined by Rust only; JS now supplies normalized tuple fields only.
export const getSafeguardCountKeyWithLoadedWasm = (params: {
  slot: number
  set: number
  faction: number
  mainStat: number
  countMode: WasmSafeguardCountModePayload
}): string => {
  // Sync helper is fail-closed: caller must have warmed wasm already.
  assertWasmInitializedSync()
  // Delegate key derivation to wasm so count-key semantics stay SSOT.
  return safeguardCountKeyValueWasmBinding(
    {
      slot: Math.floor(params.slot),
      set: Math.floor(params.set),
      faction: Math.floor(params.faction),
      mainStat: Math.floor(params.mainStat),
    },
    params.countMode,
  )
}

// Safeguard expected-group domain normalization is centralized in Rust so
// ordering/dedupe semantics cannot drift from matcher-side domain readers.
export const normalizeSafeguardExpectedGroupDomainWithLoadedWasm = <
  T extends {
    slotOrder: number[]
    accessoryCompatibleSetIds: number[]
    armorCompatibleSetIds: number[]
    allowedMainBySlot: Record<string, number[]>
    allFactionIds: number[]
  },
>(domain: T): T => {
  assertWasmInitializedSync()
  const result = normalizeSafeguardExpectedGroupDomainWasmValueBinding(domain)
  if (result && typeof result === 'object') return result as T
  throw new Error('WASM safeguard expected-group domain normalizer returned an invalid payload.')
}

// Full builder runtime helper runs preflight + branch orchestration in one wasm
// call so buildHsfRules no longer stitches presence/preflight/branches in TS.
export const buildHsfRulesRuntimeWithLoadedWasm = (params: {
  recipeId?: number | null
  keep?: boolean
  useFlag: boolean
  artifactSetIds: ReadonlyArray<number> | Int32Array
  artifactTypeIds: ReadonlyArray<number> | Int32Array
  rankCode: number
  rarityCode: number
  factionCode: number
  mainChoices: Array<{ id: number; f?: number }>
  emitAnyMainWhenNoChoices: boolean
  baseline?: string
  effectiveStart: number
  suppressRollThresholds: boolean
  levelWindowMin: number
  levelWindowMax: number
  requiredV: ReadonlyArray<number> | Int32Array
  optionalPoolV: ReadonlyArray<number> | Int32Array
  selectedPoolV: ReadonlyArray<number> | Int32Array
  flexActive: boolean
  aggregateMinActive: boolean
  minTargetCount: number
  maxTargetCount: number
  aggregateTargetsLocked: boolean
  aggregateMinValue: number
  lockedMinActive: boolean
  lockedMinValue: number
  substatRollBoundsV: Record<string, { min?: number; max?: number; any?: boolean }>
  targetEntriesByVariant: Record<number, { base?: number; increments?: Array<number | null> }>
  currentBaseByVariant: Record<number, number>
  factoryBaseByVariant: Record<number, number | null>
  targetBaseOverrideByVariant: Record<number, number | null>
  rarityMode?: string
  earlyKeepMode?: string
  autoRaritySupplementsThreshold?: string
  earlyMode: 'early' | 'late'
  emissionLimit?: number | null
}): { rules: HsfRule[]; limitHit: boolean } => {
  assertWasmInitializedSync()
  const result = buildHsfRulesRuntimeWasmValueBinding({
    ...(params.recipeId != null && Number.isFinite(params.recipeId)
      ? { recipeId: Math.floor(params.recipeId) }
      : {}),
    ...(typeof params.keep === 'boolean' ? { keep: params.keep } : {}),
    useFlag: params.useFlag === true,
    artifactSetIds: Array.from(toFlooredI32(params.artifactSetIds)),
    artifactTypeIds: Array.from(toFlooredI32(params.artifactTypeIds)),
    rankCode: Math.floor(params.rankCode),
    rarityCode: Math.floor(params.rarityCode),
    factionCode: Math.floor(params.factionCode),
    mainChoices: params.mainChoices ?? [],
    emitAnyMainWhenNoChoices: params.emitAnyMainWhenNoChoices === true,
    baseline: params.baseline,
    effectiveStart: Math.floor(params.effectiveStart),
    suppressRollThresholds: params.suppressRollThresholds === true,
    levelWindowMin: Math.floor(params.levelWindowMin),
    levelWindowMax: Math.floor(params.levelWindowMax),
    requiredV: Array.from(toFlooredI32(params.requiredV)),
    optionalPoolV: Array.from(toFlooredI32(params.optionalPoolV)),
    selectedPoolV: Array.from(toFlooredI32(params.selectedPoolV)),
    flexActive: params.flexActive === true,
    aggregateMinActive: params.aggregateMinActive === true,
    minTargetCount: Math.floor(params.minTargetCount),
    maxTargetCount: Math.floor(params.maxTargetCount),
    aggregateTargetsLocked: params.aggregateTargetsLocked === true,
    aggregateMinValue: Math.floor(params.aggregateMinValue),
    lockedMinActive: params.lockedMinActive === true,
    lockedMinValue: Math.floor(params.lockedMinValue),
    substatRollBoundsV: params.substatRollBoundsV ?? {},
    targetEntriesByVariant: params.targetEntriesByVariant ?? {},
    currentBaseByVariant: params.currentBaseByVariant ?? {},
    factoryBaseByVariant: params.factoryBaseByVariant ?? {},
    targetBaseOverrideByVariant: params.targetBaseOverrideByVariant ?? {},
    ...(typeof params.rarityMode === 'string' ? { rarityMode: params.rarityMode } : {}),
    ...(typeof params.earlyKeepMode === 'string' ? { earlyKeepMode: params.earlyKeepMode } : {}),
    ...(typeof params.autoRaritySupplementsThreshold === 'string'
      ? { autoRaritySupplementsThreshold: params.autoRaritySupplementsThreshold }
      : {}),
    earlyMode: params.earlyMode,
    ...(params.emissionLimit != null && Number.isFinite(params.emissionLimit)
      ? { emissionLimit: Math.floor(params.emissionLimit) }
      : {}),
  }) as { rules?: unknown; limitHit?: unknown }
  if (!result || !Array.isArray(result.rules)) {
    throw new Error('WASM build-hsf-rules-runtime helper returned an invalid payload.')
  }
  return {
    rules: result.rules as HsfRule[],
    limitHit: result.limitHit === true,
  }
}

// Synchronous helper for intro assignment combinatorics.
// Callers must warm wasm first; this helper now fails closed.
export const getIntroAssignmentsForComboWithLoadedWasm = (params: {
  count: number
  baseSlots: number
  additionLevels: ReadonlyArray<number> | Int32Array
  forcedBase: ReadonlyArray<number> | Int32Array
}): number[][] => {
  // Sync callers must warm wasm first.
  assertWasmInitializedSync()
  // Guard invalid numeric inputs before array conversion.
  if (!Number.isFinite(params.count) || !Number.isFinite(params.baseSlots)) {
    throw new Error('Invalid intro assignment input: count/baseSlots must be finite.')
  }
  // Zero count yields one empty assignment row.
  if (params.count <= 0) return [[]]
  // Normalize both vectors once to avoid repeated Number coercions.
  const count = Math.max(0, Math.floor(params.count))
  const additionLevels = toFlooredI32(params.additionLevels)
  const forcedBase = toFlooredI32(params.forcedBase)
  // Run combinatorics in wasm and return flattened integer rows.
  const flat = introAssignmentsForComboFastFlatWasmBinding(
    count,
    Math.floor(params.baseSlots),
    additionLevels,
    forcedBase,
  )
  // Rehydrate fixed-width rows where width === artifact count.
  return unflattenI32Rows(flat, count)
}

// Synchronous numeric combinations helper for builder combinatorics.
export const getCombinationsI32WithLoadedWasm = (values: number[], pick: number): number[][] => {
  // Sync callers must warm wasm first.
  assertWasmInitializedSync()
  // Reject NaN/Infinity pick values before integer flooring.
  if (!Number.isFinite(pick)) {
    throw new Error('Invalid combinations input: pick must be finite.')
  }
  // Pick <= 0 means one empty combination by convention.
  if (pick <= 0) return [[]]
  // Picking more than input length cannot produce combinations.
  if (pick > values.length) return []
  // Convert once to contiguous i32 payload for wasm binding.
  const width = Math.max(0, Math.floor(pick))
  const payload = toFlooredI32(values)
  // Let wasm enumerate combinations in deterministic index order.
  const flat = combinationsI32FastFlatWasmBinding(payload, width)
  // Decode flat result into rows of length `pick`.
  return unflattenI32Rows(flat, width)
}

// Synchronous numeric permutations helper for builder combinatorics.
export const getPermutationsI32WithLoadedWasm = (values: number[]): number[][] => {
  // Sync callers must warm wasm first.
  assertWasmInitializedSync()
  // Empty/singleton vectors have exactly one permutation.
  if (values.length <= 1) return [values.slice()]
  // Convert once to contiguous i32 payload for wasm.
  const payload = toFlooredI32(values)
  // Execute permutation backtracking in wasm.
  const flat = permutationsI32FastFlatWasmBinding(payload)
  // Rehydrate rows where width equals input length.
  return unflattenI32Rows(flat, payload.length)
}

// Compute improvement-chance entries for all non-maxed artifacts in stored rows.
// Reads ENGINE_STATE.stored_rows — store_artifact_rows_value must be called first.
// Returns null when the WASM result is not a valid array (defensive guard).
export const computeUpgradeChanceWithLoadedWasm = (params: {
  rules: readonly SafeguardRuleForWasm[]
  enabled: boolean
}): UpgradeChanceWasmEntry[] | null => {
  assertWasmInitializedSync()
  const result = computeUpgradeChanceWasmValueBinding(params.rules, params.enabled === true)
  // Defensive guard: WASM must return an array of entry objects.
  if (!Array.isArray(result)) return null
  return result as UpgradeChanceWasmEntry[]
}
