import initRuleEngineWasm, {
  build_hsf_rarity_branches_value as buildHsfRarityBranchesWasmValueBinding,
  build_hsf_branch_collapse_profile_value as buildHsfBranchCollapseProfileWasmValueBinding,
  build_hsf_preflight_flags_value as buildHsfPreflightFlagsWasmValueBinding,
  build_hsf_presence_only_rules_value as buildHsfPresenceOnlyRulesWasmValueBinding,
  build_hsf_level_contexts_value as buildHsfLevelContextsWasmValueBinding,
  build_hsf_level_combos_value as buildHsfLevelCombosWasmValueBinding,
  build_hsf_timeline_caps_value as buildHsfTimelineCapsWasmValueBinding,
  build_hsf_intro_assignments_for_level_value as buildHsfIntroAssignmentsForLevelWasmValueBinding,
  build_hsf_combo_vectors_value as buildHsfComboVectorsWasmValueBinding,
  build_hsf_combo_policy_vectors_value as buildHsfComboPolicyVectorsWasmValueBinding,
  build_hsf_factory_combo_rows_value as buildHsfFactoryComboRowsWasmValueBinding,
  build_hsf_late_bounded_rows_value as buildHsfLateBoundedRowsWasmValueBinding,
  build_hsf_intro_mode_plan_value as buildHsfIntroModePlanWasmValueBinding,
  build_hsf_full_selected_fallback_plan_value as buildHsfFullSelectedFallbackPlanWasmValueBinding,
  execute_hsf_full_selected_fallback_value as executeHsfFullSelectedFallbackWasmValueBinding,
  execute_hsf_branch_runtime_value as executeHsfBranchRuntimeWasmValueBinding,
  execute_hsf_builder_runtime_value as executeHsfBuilderRuntimeWasmValueBinding,
  execute_hsf_intro_plan_value as executeHsfIntroPlanWasmValueBinding,
  execute_hsf_combo_runtime_value as executeHsfComboRuntimeWasmValueBinding,
  execute_hsf_level_combo_value as executeHsfLevelComboWasmValueBinding,
  build_final_sell_rules_value as buildFinalSellRulesWasmValueBinding,
  build_keep_unique_rules_value as buildKeepUniqueRulesWasmValueBinding,
  bounded_compositions_i32_fast_flat as boundedCompositionsI32FastFlatWasmBinding,
  canonical_rule_key_value as canonicalRuleKeyWasmValueBinding,
  combinations_i32_fast_flat as combinationsI32FastFlatWasmBinding,
  collect_keep_unique_candidates_value as collectKeepUniqueCandidatesWasmValueBinding,
  collect_and_compute_keep_unique_protection_value as collectAndComputeKeepUniqueProtectionWasmValueBinding,
  compute_merged_rules_value as computeMergedRulesWasmValueBinding,
  compute_keep_unique_protection_value as computeKeepUniqueProtectionValueWasmBinding,
  dedupe_hsf_rules_for_export_value as dedupeHsfRulesForExportWasmValueBinding,
  emit_hsf_rules_for_distributions_value as emitHsfRulesForDistributionsValueWasmBinding,
  emit_hsf_rules_for_filtered_distributions_compact_value as emitHsfRulesForFilteredDistributionsCompactValueWasmBinding,
  emit_hsf_rules_for_filtered_distributions_value as emitHsfRulesForFilteredDistributionsValueWasmBinding,
  expand_auto_flex_rarity_branches_value as expandAutoFlexRarityBranchesWasmValueBinding,
  filtered_bounded_compositions_with_offset_i32_fast_flat as filteredBoundedCompositionsWithOffsetI32FastFlatWasmBinding,
  flatten_rule_batches_with_total_limit_value as flattenRuleBatchesWithTotalLimitWasmValueBinding,
  finalize_builder_rules_value as finalizeBuilderRulesWasmValueBinding,
  configure_value as configureRuleEngineWasmValueBinding,
  evaluate_value as evaluateRuleEngineWasmValueBinding,
  fingerprint_merged_rules_value as fingerprintMergedRulesWasmValueBinding,
  finalize_generated_rules_value as finalizeGeneratedRulesWasmValueBinding,
  find_obsolete_builder_value as findObsoleteBuilderRuleEngineWasmValueBinding,
  find_obsolete_value as findObsoleteRuleEngineWasmValueBinding,
  intro_assignments_for_combo_fast_flat as introAssignmentsForComboFastFlatWasmBinding,
  keep_unique_count_key_value as keepUniqueCountKeyValueWasmBinding,
  merge_keep_unique_injected_rules_value as mergeKeepUniqueInjectedRulesWasmValueBinding,
  normalize_keep_unique_expected_group_domain_value as normalizeKeepUniqueExpectedGroupDomainWasmValueBinding,
  resolve_keep_unique_rules_with_metasets_value as resolveKeepUniqueRulesWithMetasetsWasmValueBinding,
  resolve_auto_rarity_code_value as resolveAutoRarityCodeWasmValueBinding,
  resolve_auto_rarity_code_for_builder_value as resolveAutoRarityCodeForBuilderWasmValueBinding,
  resolve_keep_unique_candidate_keep_flags_value as resolveKeepUniqueCandidateKeepFlagsValueWasmBinding,
  permutations_i32_fast_flat as permutationsI32FastFlatWasmBinding,
  roll_distributions_flat as rollDistributionsFlatWasmBinding,
  version as ruleEngineWasmVersionBinding,
} from './generated/rule_engine.js'
import type { GeneratedBranchRuleEntry, HsfRuleWithCfg } from '../merge'
import type { HsfRule } from '../hsfTypes'
import type { BuilderConfig, SellfileExportMode } from '../hsfBuilder'
import type { KeepUniqueDetectionSnapshot, KeepUniqueRule } from '../keepUniques'
import type { FinalSellRemainderConfig } from '../logicHub'
import type { TesterMatchWorkerEvaluateItem, TesterMatchWorkerItemResult } from '../../workers/testerMatchWorkerTypes'

// Evaluate options mirror evaluateMatchesByConfig inputs used by worker paths.
// The WASM engine accepts object values and applies the same source/config gating.
export type WasmRuleEngineEvaluateOptions = {
  excludeSources?: readonly string[]
  excludeConfigIndices?: ReadonlySet<number>
  ignoreKeepUniqueConfigIndices?: ReadonlySet<number>
  baselineExcludeSources?: readonly string[]
}

type WasmRuleEngineEvaluatePayload = {
  // Excluded rule sources (e.g., keep-unique injections) for baseline scans.
  excludeSources?: string[]
  // Baseline-specific source exclusions used by worker differential flows.
  baselineExcludeSources?: string[]
  // Explicit config indices to skip during matcher evaluation.
  excludeConfigIndices?: number[]
  // Config indices ignored by keep-unique precedence logic.
  ignoreKeepUniqueConfigIndices?: number[]
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
const toOptionalI32 = (values: ReadonlyArray<number | undefined> | Int32Array): Int32Array => {
  if (values instanceof Int32Array) return values
  const out = new Int32Array(values.length)
  for (let idx = 0; idx < values.length; idx += 1) {
    const value = values[idx]
    out[idx] = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : -1
  }
  return out
}

const toFlooredI32 = (values: ReadonlyArray<number> | Int32Array): Int32Array => {
  if (values instanceof Int32Array) return values
  const out = new Int32Array(values.length)
  for (let idx = 0; idx < values.length; idx += 1) {
    const value = values[idx] ?? 0
    out[idx] = Number.isFinite(value) ? Math.floor(value) : 0
  }
  return out
}

const toNonNegativeI32 = (values: ReadonlyArray<number> | Int32Array): Int32Array => {
  if (values instanceof Int32Array) return values
  const out = new Int32Array(values.length)
  for (let idx = 0; idx < values.length; idx += 1) {
    const value = values[idx] ?? 0
    out[idx] = Math.max(0, Math.floor(Number(value)))
  }
  return out
}

const toMaskU8 = (values: ReadonlyArray<boolean> | Uint8Array): Uint8Array => {
  if (values instanceof Uint8Array) return values
  const out = new Uint8Array(values.length)
  for (let idx = 0; idx < values.length; idx += 1) {
    out[idx] = values[idx] === true ? 1 : 0
  }
  return out
}

// wasm-bindgen payloads may decode nested maps as JS Map objects depending on
// serde source types. Normalize them into plain objects for TS call sites.
const toPlainObjectDeep = (value: unknown): unknown => {
  // Convert map payloads into plain object literals recursively.
  if (value instanceof Map) {
    const out: Record<string, unknown> = {}
    for (const [key, nested] of value.entries()) {
      out[String(key)] = toPlainObjectDeep(nested)
    }
    return out
  }
  // Recurse arrays so map/object children are normalized too.
  if (Array.isArray(value)) {
    return value.map((entry) => toPlainObjectDeep(entry))
  }
  // Recurse plain object records while preserving scalar primitives.
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = toPlainObjectDeep(nested)
    }
    return out
  }
  // Primitive/null payloads pass through unchanged.
  return value
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
  // Convert config index set into sorted array for deterministic payload shape.
  if (options?.excludeConfigIndices && options.excludeConfigIndices.size > 0) {
    const sorted = toSortedNumberArray(options.excludeConfigIndices)
    // Guard the assignment so exact optional typing never receives undefined.
    if (sorted) payload.excludeConfigIndices = sorted
  }
  // Convert keep-unique ignore set into sorted array for deterministic payload shape.
  if (options?.ignoreKeepUniqueConfigIndices && options.ignoreKeepUniqueConfigIndices.size > 0) {
    const sorted = toSortedNumberArray(options.ignoreKeepUniqueConfigIndices)
    // Guard the assignment so exact optional typing never receives undefined.
    if (sorted) payload.ignoreKeepUniqueConfigIndices = sorted
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

// Configure the WASM engine with the merged rules + config mode visibility.
// This must run before evaluate, matching the existing worker configure flow.
export const configureWasmRuleEngine = async (params: {
  rules: HsfRuleWithCfg[]
  configModes: SellfileExportMode[]
}): Promise<void> => {
  // Ensure module init before invoking wasm configure binding.
  await ensureWasmInitialized()
  // Configure shared matcher state used by subsequent evaluate calls.
  configureRuleEngineWasmValueBinding(params.rules, params.configModes)
}

// Evaluate a batch of tester items through the WASM matcher implementation.
// Results are parsed back into the existing worker item-result shape.
export const evaluateWasmRuleEngineItems = async (params: {
  items: TesterMatchWorkerEvaluateItem[]
  options?: WasmRuleEngineEvaluateOptions
}): Promise<TesterMatchWorkerItemResult[]> => {
  // Ensure module init before invoking wasm evaluate binding.
  await ensureWasmInitialized()
  // Normalize optional filters into the compact wasm payload shape.
  const optionsPayload = toEvaluateOptionsPayload(params.options)
  // Evaluate all provided items using the configured matcher state.
  const result = evaluateRuleEngineWasmValueBinding(params.items, optionsPayload)
  // Return parsed results when binding returned the expected array payload.
  if (Array.isArray(result)) return result as TesterMatchWorkerItemResult[]
  // Fail loudly on malformed payloads instead of masking with fallback rows.
  throw new Error('WASM matcher evaluate returned an invalid payload.')
}

// Sync configure helper is used by main-thread adapters that cannot await.
// Callers must run warmup first and then can configure on each ruleset swap.
export const configureWasmRuleEngineWithLoadedWasm = (params: {
  rules: HsfRuleWithCfg[]
  configModes: SellfileExportMode[]
}): void => {
  // Sync helper is fail-closed: caller must have warmed wasm already.
  assertWasmInitializedSync()
  // Configure matcher state for sync callers that cannot await.
  configureRuleEngineWasmValueBinding(params.rules, params.configModes)
}

// Sync evaluate helper mirrors the async wrapper but skips init checks.
// This keeps matcher adapters WASM-only while still exposing sync call sites.
export const evaluateWasmRuleEngineItemsWithLoadedWasm = (params: {
  items: TesterMatchWorkerEvaluateItem[]
  options?: WasmRuleEngineEvaluateOptions
}): TesterMatchWorkerItemResult[] => {
  // Sync helper is fail-closed: caller must have warmed wasm already.
  assertWasmInitializedSync()
  // Normalize optional filters into the compact wasm payload shape.
  const optionsPayload = toEvaluateOptionsPayload(params.options)
  // Evaluate all provided items using the configured matcher state.
  const result = evaluateRuleEngineWasmValueBinding(params.items, optionsPayload)
  // Return parsed results when binding returned the expected array payload.
  if (Array.isArray(result)) return result as TesterMatchWorkerItemResult[]
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
  rule: HsfRuleWithCfg
  branchOrder: number
  branchSeq: number
  originalIdx: number
}

type WasmKeepUniqueCountModePayload = {
  perRule: boolean
  perSet: boolean
  perFaction: boolean
  perMainStat: boolean
  perSlot: boolean
}

type WasmCollectedKeepUniqueCandidate = {
  rowIndex: number
  itemKey: number
  groupKey: string
  isSold: boolean
  artifact: unknown
}

type WasmCollectedKeepUniqueSnapshot = {
  candidates: WasmCollectedKeepUniqueCandidate[]
  uniqueItemKeys: number[]
}

type WasmCollectedAndProtectedKeepUniqueSnapshot = {
  candidates: WasmCollectedKeepUniqueCandidate[]
  uniqueItemKeys: number[]
  detection: KeepUniqueDetectionSnapshot
}

// Synchronous obsolete-pruning helper used by generation code paths that must
// stay sync; it only runs after the async warmup initialized the module.
export const findObsoleteRulesWithLoadedWasm = (rules: HsfRule[]): WasmObsoleteReport | null => {
  assertWasmInitializedSync()
  const report = findObsoleteRuleEngineWasmValueBinding(rules) as WasmObsoleteReport
  if (report && Array.isArray(report.obsolete)) return report
  throw new Error('WASM obsolete-rule detector returned an invalid payload.')
}

// Builder-specific obsolete detector mirrors hsfBuilder pruning semantics.
export const findObsoleteBuilderRulesWithLoadedWasm = (rules: HsfRule[]): WasmObsoleteReport | null => {
  assertWasmInitializedSync()
  const report = findObsoleteBuilderRuleEngineWasmValueBinding(rules) as WasmObsoleteReport
  if (report && Array.isArray(report.obsolete)) return report
  throw new Error('WASM builder obsolete-rule detector returned an invalid payload.')
}

// Builder finalizer keeps builder-specific obsolete pruning + emission ordering
// in Rust so hsfBuilder.ts no longer duplicates the prune/sort implementation.
export const finalizeBuilderRulesWithLoadedWasm = (params: {
  rules: HsfRule[]
  emissionMeta: Array<{ levelIdx: number; branchIdx: number; seq: number }>
}): HsfRule[] => {
  assertWasmInitializedSync()
  const result = finalizeBuilderRulesWasmValueBinding(params.rules, params.emissionMeta)
  if (Array.isArray(result)) return result as HsfRule[]
  throw new Error('WASM builder finalizer returned an invalid payload.')
}

// Export dedupe helper mirrors hsfDeduplicate.ts segment semantics while moving
// normalization + coverage matching to Rust as the single source of truth.
export const dedupeHsfRulesForExportWithLoadedWasm = (rules: HsfRuleWithCfg[]): HsfRuleWithCfg[] | null => {
  assertWasmInitializedSync()
  const result = dedupeHsfRulesForExportWasmValueBinding(rules) as HsfRuleWithCfg[]
  if (Array.isArray(result)) return result
  throw new Error('WASM export-rule dedupe returned an invalid payload.')
}

// Synchronous finalizer mirrors merge.ts post-build collapse/prune/sort logic.
// Worker warm paths call this after async warmup so no extra await is required.
export const finalizeGeneratedRulesWithLoadedWasm = (params: {
  entries: readonly GeneratedBranchRuleEntry[]
  applyObsoletePruning: boolean
}): HsfRuleWithCfg[] | null => {
  assertWasmInitializedSync()
  const payload = params.entries as WasmGeneratedEntry[]
  const result = finalizeGeneratedRulesWasmValueBinding(payload, params.applyObsoletePruning) as HsfRuleWithCfg[]
  if (Array.isArray(result)) return result
  throw new Error('WASM finalize-generated-rules returned an invalid payload.')
}

// Canonical rule-key generation is centralized in Rust so cache keys match
// rule-engine normalization semantics exactly.
export const canonicalRuleKeyWithLoadedWasm = (rule: HsfRule): string => {
  assertWasmInitializedSync()
  const key = canonicalRuleKeyWasmValueBinding(rule)
  if (typeof key === 'string') return key
  throw new Error('WASM canonical-rule-key helper returned an invalid payload.')
}

// Batch merged-rule fingerprinting runs in Rust so orchestrator rebuild checks
// avoid repeated per-rule JS normalization work on large merged rule sets.
export const fingerprintMergedRulesWithLoadedWasm = (rules: readonly HsfRuleWithCfg[]): string => {
  assertWasmInitializedSync()
  const signature = fingerprintMergedRulesWasmValueBinding(rules)
  if (typeof signature === 'string') return signature
  throw new Error('WASM merged-rule fingerprint helper returned an invalid payload.')
}

// Synchronous helper for hsfBuilder roll-composition loops.
// Callers must warm wasm first; this helper now fails closed.
export const getRollDistributionsWithLoadedWasm = (
  dimensions: number,
  total: number,
): number[][] => {
  // Sync callers use this inside tight loops; require warmup beforehand.
  assertWasmInitializedSync()
  // Reject NaN/Infinity inputs so wasm never receives invalid dimensions.
  if (!Number.isFinite(dimensions) || !Number.isFinite(total)) {
    throw new Error('Invalid roll distribution input: dimensions/total must be finite.')
  }
  // Zero dimensions can only satisfy a zero-total composition.
  if (dimensions <= 0) return total === 0 ? [[]] : []
  // Negative totals have no feasible distributions.
  if (total < 0) return []
  // Floor once to keep parity with existing JS integer semantics.
  const width = Math.max(0, Math.floor(dimensions))
  const flat = rollDistributionsFlatWasmBinding(
    width,
    Math.floor(total),
  )
  // Rehydrate fixed-width rows from the flat wasm payload.
  return unflattenI32Rows(flat, width)
}

// Synchronous keep-unique detector runs candidate/rule loops inside wasm.
// Callers must warm wasm first; invalid payloads are surfaced by callers.
export const computeKeepUniqueProtectionWithLoadedWasm = (params: {
  candidates: unknown
  rules: unknown
  expectedGroupsByRuleId?: unknown
  expectedGroupDomain?: unknown
  enabled: boolean
  now: number
}): unknown | null => {
  assertWasmInitializedSync()
  // Wrapper payload lets wasm accept both legacy precomputed groups and the
  // new domain-driven in-wasm expected-group generation inputs.
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
  return computeKeepUniqueProtectionValueWasmBinding(
    params.candidates,
    params.rules,
    expectedGroupsPayload,
    params.enabled === true,
    Number.isFinite(params.now) ? params.now : 0,
  )
}

// Candidate keep/sell resolver keeps base-match + ignore-config decisions in
// Rust so TS call sites do not duplicate matcher precedence logic.
export const resolveKeepUniqueCandidateKeepFlagsWithLoadedWasm = (params: {
  rows: unknown
  rules: HsfRuleWithCfg[]
  configModes: SellfileExportMode[]
  ignoreKeepUniqueConfigIndices?: ReadonlySet<number>
}): boolean[] => {
  assertWasmInitializedSync()
  const ignored = toSortedNumberArray(params.ignoreKeepUniqueConfigIndices) ?? null
  const result = resolveKeepUniqueCandidateKeepFlagsValueWasmBinding(
    params.rows,
    params.rules,
    params.configModes,
    ignored,
  )
  if (Array.isArray(result)) {
    return result.map((value) => value === true)
  }
  throw new Error('WASM keep-unique candidate resolver returned an invalid payload.')
}

// Candidate collection keeps keep-flag resolution + item/group key derivation
// in Rust; TS callers reattach row references for compatibility.
export const collectKeepUniqueCandidatesWithLoadedWasm = (params: {
  rows: unknown
  rules: HsfRuleWithCfg[]
  configModes: SellfileExportMode[]
  ignoreKeepUniqueConfigIndices?: ReadonlySet<number>
}): WasmCollectedKeepUniqueSnapshot => {
  assertWasmInitializedSync()
  const ignored = toSortedNumberArray(params.ignoreKeepUniqueConfigIndices) ?? null
  const result = collectKeepUniqueCandidatesWasmValueBinding(
    params.rows,
    params.rules,
    params.configModes,
    ignored,
  ) as WasmCollectedKeepUniqueSnapshot
  if (result && Array.isArray(result.candidates) && Array.isArray(result.uniqueItemKeys)) {
    return result
  }
  throw new Error('WASM keep-unique candidate collector returned an invalid payload.')
}

// Combined keep-unique pipeline runs candidate collection + detection in one
// wasm call so TS orchestration avoids two separate Rust roundtrips.
export const collectAndComputeKeepUniqueProtectionWithLoadedWasm = (params: {
  rows: unknown
  rules: HsfRuleWithCfg[]
  configModes: SellfileExportMode[]
  ignoreKeepUniqueConfigIndices?: ReadonlySet<number>
  keepUniqueRules: unknown
  expectedGroupsByRuleId?: unknown
  expectedGroupDomain?: unknown
  enabled: boolean
  now: number
}): WasmCollectedAndProtectedKeepUniqueSnapshot => {
  assertWasmInitializedSync()
  const ignored = toSortedNumberArray(params.ignoreKeepUniqueConfigIndices) ?? null
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
  const result = collectAndComputeKeepUniqueProtectionWasmValueBinding(
    params.rows,
    params.rules,
    params.configModes,
    ignored,
    params.keepUniqueRules,
    expectedGroupsPayload,
    params.enabled === true,
    Number.isFinite(params.now) ? params.now : 0,
  ) as WasmCollectedAndProtectedKeepUniqueSnapshot
  if (
    result
    && Array.isArray(result.candidates)
    && Array.isArray(result.uniqueItemKeys)
    && result.detection
    && Array.isArray(result.detection.entries)
  ) {
    return result
  }
  throw new Error('WASM keep-unique combined collector/detector returned an invalid payload.')
}

// Metaset expansion for keep-unique rules now runs in Rust so include/exclude
// precedence stays single-sourced across app and workers.
export const resolveKeepUniqueRulesWithMetasetsWithLoadedWasm = <T extends { combination: unknown }>(
  rules: readonly T[],
  metasets: readonly unknown[],
): T[] => {
  assertWasmInitializedSync()
  if (rules.length === 0 || metasets.length === 0) return rules as T[]
  const result = resolveKeepUniqueRulesWithMetasetsWasmValueBinding(rules, metasets) as T[]
  if (Array.isArray(result)) return result
  throw new Error('WASM keep-unique metaset resolver returned an invalid payload.')
}

// Injected keep-unique merge filtering/sorting runs in Rust so canonicalization
// and dedupe precedence are defined in one implementation.
export const mergeKeepUniqueInjectedRulesWithLoadedWasm = (params: {
  baseRules: HsfRuleWithCfg[]
  customRules: HsfRuleWithCfg[]
  candidateKeepRules: HsfRuleWithCfg[]
}): HsfRuleWithCfg[] => {
  assertWasmInitializedSync()
  const result = mergeKeepUniqueInjectedRulesWasmValueBinding(
    params.baseRules,
    params.customRules,
    params.candidateKeepRules,
  )
  if (Array.isArray(result)) return result as HsfRuleWithCfg[]
  throw new Error('WASM keep-unique injected-rule merge returned an invalid payload.')
}

// Keep-unique HSF keep-rule construction moved to Rust so merge.ts no longer
// maintains duplicate placeholder/artifact expansion logic.
export const buildKeepUniqueRulesWithLoadedWasm = (params: {
  rules: readonly KeepUniqueRule[]
  detection: KeepUniqueDetectionSnapshot | null
  configIdBase: number
}): HsfRuleWithCfg[] => {
  assertWasmInitializedSync()
  if (!params.detection) return []
  const result = buildKeepUniqueRulesWasmValueBinding(
    params.rules,
    params.detection,
    BigInt(Math.floor(params.configIdBase)),
  )
  if (Array.isArray(result)) return result as HsfRuleWithCfg[]
  throw new Error('WASM keep-unique rule builder returned an invalid payload.')
}

// Final-sell HSF remainder generation runs in Rust so merge.ts no longer owns
// level/type/set expansion loops.
export const buildFinalSellRulesWithLoadedWasm = (params: {
  finalSellRemainder: FinalSellRemainderConfig | null | undefined
  allKnownSetIds: number[]
}): HsfRuleWithCfg[] => {
  assertWasmInitializedSync()
  const result = buildFinalSellRulesWasmValueBinding(
    params.finalSellRemainder ?? null,
    params.allKnownSetIds,
  )
  if (Array.isArray(result)) return result as HsfRuleWithCfg[]
  throw new Error('WASM final-sell rule builder returned an invalid payload.')
}

// Custom-rule batch flattening + total-limit gating runs in Rust so merge.ts
// keeps one source for add-batch overflow behavior.
export const flattenRuleBatchesWithTotalLimitWithLoadedWasm = (params: {
  baseCount: number
  totalLimit: number | null
  batches: ReadonlyArray<ReadonlyArray<HsfRuleWithCfg>>
}): HsfRuleWithCfg[] => {
  assertWasmInitializedSync()
  const result = flattenRuleBatchesWithTotalLimitWasmValueBinding(
    BigInt(Math.max(0, Math.floor(params.baseCount))),
    BigInt(params.totalLimit != null ? Math.floor(params.totalLimit) : -1),
    params.batches,
  )
  if (Array.isArray(result)) return result as HsfRuleWithCfg[]
  throw new Error('WASM custom-rule batch flattener returned an invalid payload.')
}

// Merge orchestration combines base/custom/final-sell/keep-unique rows and
// assigns stable __lineIdx ordering in one Rust pass.
export const computeMergedRulesWithLoadedWasm = (params: {
  baseRules: HsfRuleWithCfg[]
  customRules: HsfRuleWithCfg[]
  finalSellRemainder: FinalSellRemainderConfig | null | undefined
  allKnownSetIds: number[]
  keepUniqueEnabled: boolean
  keepUniqueRules: readonly KeepUniqueRule[]
  keepUniqueDetection: KeepUniqueDetectionSnapshot | null | undefined
  keepUniqueConfigIdBase: number
}): HsfRuleWithCfg[] => {
  assertWasmInitializedSync()
  const result = computeMergedRulesWasmValueBinding({
    baseRules: params.baseRules,
    customRules: params.customRules,
    finalSellRemainder: params.finalSellRemainder ?? null,
    allKnownSetIds: params.allKnownSetIds,
    keepUniqueEnabled: params.keepUniqueEnabled === true,
    keepUniqueRules: params.keepUniqueRules,
    keepUniqueDetection: params.keepUniqueDetection ?? null,
    keepUniqueConfigIdBase: Math.floor(params.keepUniqueConfigIdBase),
  })
  if (Array.isArray(result)) return result as HsfRuleWithCfg[]
  throw new Error('WASM merged-rule orchestrator returned an invalid payload.')
}

// Auto-flex rarity branch expansion now runs in Rust so merge.ts keeps one
// source for the branch split heuristics tied to auto rarity + locked mins.
export const expandAutoFlexRarityBranchesWithLoadedWasm = (params: {
  config: BuilderConfig
  baseRarityCode: number
}): BuilderConfig[] => {
  assertWasmInitializedSync()
  const rawResult = expandAutoFlexRarityBranchesWasmValueBinding(
    params.config,
    Math.floor(params.baseRarityCode),
  )
  const result = toPlainObjectDeep(rawResult)
  if (Array.isArray(result)) return result as BuilderConfig[]
  throw new Error('WASM auto-flex rarity branch expansion returned an invalid payload.')
}

// Auto-rarity resolution stays in Rust so builder preview and generation share
// one rarity decision implementation for aggregate/per-substat requirements.
export const resolveAutoRarityCodeWithLoadedWasm = (payload: {
  autoRaritySupplementsThreshold?: string | null
  autoMinRequiredRolls?: boolean
  minRequiredRolls?: number
  lockedMinRequiredRolls?: number
  minCount?: number
  earlyKeepMode?: string
  selectedPoolV: number[]
  fixedPoolV: number[]
  substatRollBoundsV: Record<number, { min?: number }>
}): number => {
  // Sync helper is fail-closed: caller must have warmed wasm already.
  assertWasmInitializedSync()
  // Delegate the full auto-rarity decision to Rust for SSOT parity.
  const result = resolveAutoRarityCodeWasmValueBinding(payload)
  // Rust binding returns a numeric rarity code; reject malformed payloads.
  if (typeof result === 'number' && Number.isFinite(result)) return Math.floor(result)
  throw new Error('WASM auto-rarity resolver returned an invalid payload.')
}

// Builder-facing auto-rarity helper accepts raw config vectors and allowed ids.
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

// Keep-unique expected-group generation uses this helper so group-key logic is
// defined by Rust only; JS now supplies normalized tuple fields only.
export const getKeepUniqueCountKeyWithLoadedWasm = (params: {
  slot: number
  set: number
  faction: number
  mainStat: number
  countMode: WasmKeepUniqueCountModePayload
}): string => {
  // Sync helper is fail-closed: caller must have warmed wasm already.
  assertWasmInitializedSync()
  // Delegate key derivation to wasm so count-key semantics stay SSOT.
  return keepUniqueCountKeyValueWasmBinding(
    {
      slot: Math.floor(params.slot),
      set: Math.floor(params.set),
      faction: Math.floor(params.faction),
      mainStat: Math.floor(params.mainStat),
    },
    params.countMode,
  )
}

// Keep-unique expected-group domain normalization is centralized in Rust so
// ordering/dedupe semantics cannot drift from matcher-side domain readers.
export const normalizeKeepUniqueExpectedGroupDomainWithLoadedWasm = <
  T extends {
    slotOrder: number[]
    accessoryCompatibleSetIds: number[]
    armorCompatibleSetIds: number[]
    allowedMainBySlot: Record<string, number[]>
    allFactionIds: number[]
  },
>(domain: T): T => {
  assertWasmInitializedSync()
  const result = normalizeKeepUniqueExpectedGroupDomainWasmValueBinding(domain)
  if (result && typeof result === 'object') return result as T
  throw new Error('WASM keep-unique expected-group domain normalizer returned an invalid payload.')
}

// Combined filtered-emission helper keeps distribution filtering + HSF rule
// object construction in wasm for branches that do not require JS row predicates.
export const emitHsfRulesForFilteredDistributionsWithLoadedWasm = (payload: {
  dimensions: number
  total: number
  maxCaps: ReadonlyArray<number | undefined> | Int32Array
  minFloors?: ReadonlyArray<number | undefined> | Int32Array
  timelineCaps: ReadonlyArray<number | undefined> | Int32Array
  targetedMask: ReadonlyArray<boolean> | Uint8Array
  targetedExact?: number | null
  deficitFloors?: ReadonlyArray<number | undefined> | Int32Array
  deficitMax?: number | null
  globalMin: number
  globalRemaining: number
  globalMode: 0 | 1 | 2
  lockedMask: ReadonlyArray<boolean> | Uint8Array
  lockedMin: number
  lockedRemaining: number
  lockedMode: 0 | 1 | 2
  emit: {
    baseRule: HsfRule
    substats: Array<{ id: number; isFlat?: boolean }>
    baseVals: number[]
    mins: number[]
    maxCaps: number[]
    optionalMask: boolean[]
    skipOptionalBaseline: boolean
    mainChoices: Array<{ id: number; f?: number }>
    emitAnyMainWhenNoChoices: boolean
    targetBases: Array<number | null>
    targetIncrements: Array<Array<number | null>>
  }
}): HsfRule[] | null => {
  assertWasmInitializedSync()
  const result = emitHsfRulesForFilteredDistributionsValueWasmBinding({
    dimensions: Math.max(0, Math.floor(payload.dimensions)),
    total: Math.floor(payload.total),
    maxCaps: Array.from(toOptionalI32(payload.maxCaps)),
    minFloors: Array.from(toOptionalI32(payload.minFloors ?? [])),
    timelineCaps: Array.from(toOptionalI32(payload.timelineCaps)),
    targetedMask: Array.from(toMaskU8(payload.targetedMask)),
    targetedExact: (
      typeof payload.targetedExact === 'number' && Number.isFinite(payload.targetedExact)
        ? Math.floor(payload.targetedExact)
        : -1
    ),
    deficitFloors: Array.from(toOptionalI32(payload.deficitFloors ?? [])),
    deficitMax: (
      typeof payload.deficitMax === 'number' && Number.isFinite(payload.deficitMax)
        ? Math.floor(payload.deficitMax)
        : -1
    ),
    globalMin: Math.floor(payload.globalMin),
    globalRemaining: Math.floor(payload.globalRemaining),
    globalMode: Math.floor(payload.globalMode),
    lockedMask: Array.from(toMaskU8(payload.lockedMask)),
    lockedMin: Math.floor(payload.lockedMin),
    lockedRemaining: Math.floor(payload.lockedRemaining),
    lockedMode: Math.floor(payload.lockedMode),
    // Filtered path computes distributions in Rust; emit core still expects the
    // field to deserialize, so provide an empty placeholder vector.
    emit: {
      ...payload.emit,
      distributions: [],
    },
  })
  if (Array.isArray(result)) return result as HsfRule[]
  throw new Error('WASM filtered HSF emission returned an invalid payload.')
}

// Compact filtered-emission helper accepts base vectors at selected dimensions.
// Rust widens them for sink/other paths, removing JS-side vector expansion loops.
export const emitHsfRulesForFilteredDistributionsCompactWithLoadedWasm = (payload: {
  dimensions: number
  total: number
  baseMaxCaps: ReadonlyArray<number | undefined> | Int32Array
  baseTimelineCaps: ReadonlyArray<number | undefined> | Int32Array
  baseTargetedMask: ReadonlyArray<boolean> | Uint8Array
  baseLockedMask: ReadonlyArray<boolean> | Uint8Array
  minFloors?: ReadonlyArray<number | undefined> | Int32Array
  targetedExact?: number | null
  deficitFloors?: ReadonlyArray<number | undefined> | Int32Array
  deficitMax?: number | null
  globalMin: number
  globalRemaining: number
  globalMode: 0 | 1 | 2
  lockedMin: number
  lockedRemaining: number
  lockedMode: 0 | 1 | 2
  emit: {
    baseRule: HsfRule
    substats: Array<{ id: number; isFlat?: boolean }>
    baseVals: number[]
    mins: number[]
    maxCaps: number[]
    optionalMask: boolean[]
    skipOptionalBaseline: boolean
    mainChoices: Array<{ id: number; f?: number }>
    emitAnyMainWhenNoChoices: boolean
    targetBases: Array<number | null>
    targetIncrements: Array<Array<number | null>>
  }
}): HsfRule[] | null => {
  assertWasmInitializedSync()
  const result = emitHsfRulesForFilteredDistributionsCompactValueWasmBinding({
    dimensions: Math.max(0, Math.floor(payload.dimensions)),
    total: Math.floor(payload.total),
    baseMaxCaps: Array.from(toOptionalI32(payload.baseMaxCaps)),
    baseTimelineCaps: Array.from(toOptionalI32(payload.baseTimelineCaps)),
    baseTargetedMask: Array.from(toMaskU8(payload.baseTargetedMask)),
    baseLockedMask: Array.from(toMaskU8(payload.baseLockedMask)),
    minFloors: Array.from(toOptionalI32(payload.minFloors ?? [])),
    targetedExact: (
      typeof payload.targetedExact === 'number' && Number.isFinite(payload.targetedExact)
        ? Math.floor(payload.targetedExact)
        : -1
    ),
    deficitFloors: Array.from(toOptionalI32(payload.deficitFloors ?? [])),
    deficitMax: (
      typeof payload.deficitMax === 'number' && Number.isFinite(payload.deficitMax)
        ? Math.floor(payload.deficitMax)
        : -1
    ),
    globalMin: Math.floor(payload.globalMin),
    globalRemaining: Math.floor(payload.globalRemaining),
    globalMode: Math.floor(payload.globalMode),
    lockedMin: Math.floor(payload.lockedMin),
    lockedRemaining: Math.floor(payload.lockedRemaining),
    lockedMode: Math.floor(payload.lockedMode),
    emit: {
      ...payload.emit,
      // Filter rows are generated in Rust for this path.
      distributions: [],
    },
  })
  if (Array.isArray(result)) return result as HsfRule[]
  throw new Error('WASM compact filtered HSF emission returned an invalid payload.')
}

// Synchronous helper emits concrete HSF rows for a distribution batch.
// Callers must warm wasm first; row materialization always comes from wasm.
export const emitHsfRulesForDistributionsWithLoadedWasm = (payload: {
  baseRule: HsfRule
  substats: Array<{ id: number; isFlat?: boolean }>
  distributions: number[][]
  baseVals: number[]
  mins: number[]
  maxCaps: number[]
  optionalMask: boolean[]
  skipOptionalBaseline: boolean
  mainChoices: Array<{ id: number; f?: number }>
  emitAnyMainWhenNoChoices: boolean
  targetBases: Array<number | null>
  targetIncrements: Array<Array<number | null>>
}): HsfRule[] | null => {
  assertWasmInitializedSync()
  const result = emitHsfRulesForDistributionsValueWasmBinding(payload)
  if (Array.isArray(result)) return result as HsfRule[]
  throw new Error('WASM HSF emission returned an invalid payload.')
}

// Presence-only builder rows are emitted in Rust so the no-substats branch no
// longer keeps level/main unroll loops in TypeScript.
export const buildHsfPresenceOnlyRulesWithLoadedWasm = (params: {
  baseCore: HsfRule
  mainChoices: Array<{ id: number; f?: number }>
  levelWindowMin: number
  levelWindowMax: number
}): HsfRule[] => {
  assertWasmInitializedSync()
  const result = buildHsfPresenceOnlyRulesWasmValueBinding({
    baseCore: params.baseCore,
    mainChoices: params.mainChoices,
    levelWindowMin: Math.floor(params.levelWindowMin),
    levelWindowMax: Math.floor(params.levelWindowMax),
  })
  if (Array.isArray(result)) return result as HsfRule[]
  throw new Error('WASM build-hsf-presence helper returned an invalid payload.')
}

// Builder rarity-branch expansion (Late+Auto supplements) now runs in Rust so
// branch tier ordering and threshold rules stay single-sourced.
export const buildHsfRarityBranchesWithLoadedWasm = (params: {
  rarityMode?: string
  earlyKeepMode?: string
  autoRaritySupplementsThreshold?: string
  rarityCode: number
}): Array<{ code: number; restrictLevels?: number[] }> => {
  assertWasmInitializedSync()
  const result = buildHsfRarityBranchesWasmValueBinding({
    rarityMode: params.rarityMode,
    earlyKeepMode: params.earlyKeepMode,
    autoRaritySupplementsThreshold: params.autoRaritySupplementsThreshold,
    rarityCode: Math.floor(params.rarityCode),
  })
  if (Array.isArray(result)) return result as Array<{ code: number; restrictLevels?: number[] }>
  throw new Error('WASM build-hsf-rarity-branches helper returned an invalid payload.')
}

// Branch collapse profile keeps aggregate feasibility and roll timelines in
// Rust so hsfBuilder no longer computes schedule loops in TypeScript.
export const buildHsfBranchCollapseProfileWithLoadedWasm = (params: {
  rarityCode: number
  baseline: 'afterStart' | 'upToLevel'
  effectiveStart: number
  aggregateMinActive: boolean
  aggregateTargetsLocked: boolean
  aggregateMinValue: number
  additionCount: number
}): {
  collapseGlobalOk: boolean
  maxRollsAtTarget: number
  rollTimeline: number[]
} => {
  assertWasmInitializedSync()
  const result = buildHsfBranchCollapseProfileWasmValueBinding({
    rarityCode: Math.floor(params.rarityCode),
    baseline: params.baseline,
    effectiveStart: Math.floor(params.effectiveStart),
    aggregateMinActive: params.aggregateMinActive === true,
    aggregateTargetsLocked: params.aggregateTargetsLocked === true,
    aggregateMinValue: Math.floor(params.aggregateMinValue),
    additionCount: Math.floor(params.additionCount),
  }) as {
    collapseGlobalOk: boolean
    maxRollsAtTarget: number
    rollTimeline: number[]
  }
  if (!result || !Array.isArray(result.rollTimeline)) {
    throw new Error('WASM build-hsf-branch-collapse-profile helper returned an invalid payload.')
  }
  return {
    collapseGlobalOk: result.collapseGlobalOk === true,
    maxRollsAtTarget: Math.floor(Number(result.maxRollsAtTarget ?? 0)),
    rollTimeline: result.rollTimeline.map((value) => Math.floor(Number(value))),
  }
}

// Preflight mode/cap checks run in Rust so hsfBuilder no longer loops through
// required/optional bound vectors to decide strict/potential and hard prunes.
export const buildHsfPreflightFlagsWithLoadedWasm = (params: {
  selectedPoolV: ReadonlyArray<number> | Int32Array
  requiredV: ReadonlyArray<number> | Int32Array
  optionalPoolV: ReadonlyArray<number> | Int32Array
  maxTargetCount: number
  aggregateMinActive: boolean
  aggregateMinValue: number
  aggregateTargetsLocked: boolean
  rarityCode: number
  rarityMode?: string
  substatRollBoundsV: Record<number, { min?: number; max?: number; any?: boolean } | undefined> | undefined
}): {
  aggregateFeasibleByCaps: boolean
  hasCircled: boolean
} => {
  assertWasmInitializedSync()
  const result = buildHsfPreflightFlagsWasmValueBinding({
    selectedPoolV: Array.from(toFlooredI32(params.selectedPoolV)),
    requiredV: Array.from(toFlooredI32(params.requiredV)),
    optionalPoolV: Array.from(toFlooredI32(params.optionalPoolV)),
    maxTargetCount: Math.floor(params.maxTargetCount),
    aggregateMinActive: params.aggregateMinActive === true,
    aggregateMinValue: Math.floor(params.aggregateMinValue),
    aggregateTargetsLocked: params.aggregateTargetsLocked === true,
    rarityCode: Math.floor(params.rarityCode),
    ...(typeof params.rarityMode === 'string' ? { rarityMode: params.rarityMode } : {}),
    substatRollBoundsV: params.substatRollBoundsV ?? {},
  }) as {
    aggregateFeasibleByCaps: boolean
    hasCircled: boolean
  }
  if (!result || typeof result !== 'object') {
    throw new Error('WASM build-hsf-preflight-flags helper returned an invalid payload.')
  }
  return {
    aggregateFeasibleByCaps: result.aggregateFeasibleByCaps === true,
    hasCircled: result.hasCircled === true,
  }
}

// Builder level-context expansion runs in Rust so per-level roll/presence
// counters are computed once with shared rarity schedule semantics.
export const buildHsfLevelContextsWithLoadedWasm = (params: {
  rarityCode: number
  baseline: 'afterStart' | 'upToLevel'
  effectiveStart: number
  suppressRollThresholds: boolean
  levelWindowMin: number
  levelWindowMax: number
  restrictLevels?: ReadonlySet<number> | number[]
}): Array<{
  level: number
  rollsUpToStart: number
  rawRollsForThisLevel: number
  rawRollsByTarget: number
  numRollsForThisLevel: number
  numRollsByTarget: number
  addsSoFar: number
  present: number
}> => {
  assertWasmInitializedSync()
  // Normalize optional restrict set/vector into a compact integer array.
  const restrictLevels = params.restrictLevels instanceof Set
    ? Array.from(params.restrictLevels).map((level) => Math.floor(level))
    : Array.isArray(params.restrictLevels)
      ? params.restrictLevels.map((level) => Math.floor(level))
      : undefined
  const result = buildHsfLevelContextsWasmValueBinding({
    rarityCode: Math.floor(params.rarityCode),
    baseline: params.baseline,
    effectiveStart: Math.floor(params.effectiveStart),
    suppressRollThresholds: params.suppressRollThresholds === true,
    levelWindowMin: Math.floor(params.levelWindowMin),
    levelWindowMax: Math.floor(params.levelWindowMax),
    ...(restrictLevels ? { restrictLevels } : {}),
  })
  if (Array.isArray(result)) {
    return result as Array<{
      level: number
      rollsUpToStart: number
      rawRollsForThisLevel: number
      rawRollsByTarget: number
      numRollsForThisLevel: number
      numRollsByTarget: number
      addsSoFar: number
      present: number
    }>
  }
  throw new Error('WASM build-hsf-level-contexts helper returned an invalid payload.')
}

// Builder level-combo expansion runs in Rust so TS no longer loops through
// total-count buckets and optional choose(N, K) merge steps per level.
export const buildHsfLevelCombosWithLoadedWasm = (params: {
  requiredV: ReadonlyArray<number> | Int32Array
  optionalPoolV: ReadonlyArray<number> | Int32Array
  flexActive: boolean
  aggregateMinActive: boolean
  numRollsForThisLevel: number
  minTargetCount: number
  maxTargetCount: number
  present: number
}): number[][] => {
  assertWasmInitializedSync()
  // Normalize numeric vectors once so the wasm binding receives i32 arrays.
  const requiredV = Array.from(toFlooredI32(params.requiredV))
  const optionalPoolV = Array.from(toFlooredI32(params.optionalPoolV))
  const result = buildHsfLevelCombosWasmValueBinding({
    requiredV,
    optionalPoolV,
    flexActive: params.flexActive === true,
    aggregateMinActive: params.aggregateMinActive === true,
    numRollsForThisLevel: Math.floor(params.numRollsForThisLevel),
    minTargetCount: Math.floor(params.minTargetCount),
    maxTargetCount: Math.floor(params.maxTargetCount),
    present: Math.floor(params.present),
  })
  if (Array.isArray(result)) return result as number[][]
  throw new Error('WASM build-hsf-level-combos helper returned an invalid payload.')
}

// Intro-assignment timeline caps are expanded in Rust so hsfBuilder no longer
// counts roll events with nested JS loops for every intro permutation.
export const buildHsfTimelineCapsWithLoadedWasm = (params: {
  introAssignments: ReadonlyArray<ReadonlyArray<number>>
  rollTimeline: ReadonlyArray<number> | Int32Array
  baseline: 'afterStart' | 'upToLevel'
  effectiveStart: number
  level: number
  preRolls: number
  mythPreExtra: number
}): number[][] => {
  assertWasmInitializedSync()
  // Normalize nested assignments into plain numeric rows for wasm serde.
  const introAssignments = params.introAssignments.map((row) => row.map((value) => Math.floor(value)))
  const rollTimeline = Array.from(toFlooredI32(params.rollTimeline))
  const result = buildHsfTimelineCapsWasmValueBinding({
    introAssignments,
    rollTimeline,
    baseline: params.baseline,
    effectiveStart: Math.floor(params.effectiveStart),
    level: Math.floor(params.level),
    preRolls: Math.floor(params.preRolls),
    mythPreExtra: Math.floor(params.mythPreExtra),
  })
  if (Array.isArray(result)) return result as number[][]
  throw new Error('WASM build-hsf-timeline-caps helper returned an invalid payload.')
}

// Intro-assignment expansion per level runs in Rust so hsfBuilder no longer
// filters addition timelines and builds forced-base vectors in TS hot loops.
export const buildHsfIntroAssignmentsForLevelWithLoadedWasm = (params: {
  count: number
  baseSlots: number
  requiredCount: number
  additionTimelineAll: ReadonlyArray<number> | Int32Array
  level: number
}): number[][] => {
  assertWasmInitializedSync()
  const result = buildHsfIntroAssignmentsForLevelWasmValueBinding({
    count: Math.floor(params.count),
    baseSlots: Math.floor(params.baseSlots),
    requiredCount: Math.floor(params.requiredCount),
    additionTimelineAll: Array.from(toFlooredI32(params.additionTimelineAll)),
    level: Math.floor(params.level),
  })
  if (Array.isArray(result)) return result as number[][]
  throw new Error('WASM build-hsf-intro-assignments-for-level helper returned an invalid payload.')
}

// Combo vector normalization runs in Rust so per-combo bounds/mask/target loops
// stay single-sourced and are reused across all intro-assignment branches.
export const buildHsfComboVectorsWithLoadedWasm = (params: {
  combo: ReadonlyArray<number> | Int32Array
  requiredV: ReadonlyArray<number> | Int32Array
  aggregateTargetsLocked: boolean
  substatRollBoundsV: Record<number, { min?: number; max?: number; any?: boolean } | undefined> | undefined
  targetEntries: Array<{ base?: number; increments?: Array<number | null | undefined> } | null>
}): {
  mins: number[]
  maxCaps: number[]
  anyFlags: boolean[]
  optionalMask: boolean[]
  lockedMask: boolean[]
  targetedMask: boolean[]
  substats: Array<{ id: number; isFlat: boolean }>
  targetBases: Array<number | null>
  targetIncrements: Array<Array<number | null>>
  sumMin: number
  sumLockedMin: number
  anyMin: boolean
  anyWildcard: boolean
  impossibleMinMax: boolean
} => {
  assertWasmInitializedSync()
  const combo = Array.from(toFlooredI32(params.combo))
  const requiredV = Array.from(toFlooredI32(params.requiredV))
  const targetEntries = params.targetEntries.map((entry) => (
    entry
      ? {
        ...(typeof entry.base === 'number' && Number.isFinite(entry.base)
          ? { base: Math.floor(entry.base) }
          : {}),
        increments: Array.isArray(entry.increments)
          ? entry.increments.map((value) => (
            typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : null
          ))
          : [],
      }
      : null
  ))
  const result = buildHsfComboVectorsWasmValueBinding({
    combo,
    requiredV,
    aggregateTargetsLocked: params.aggregateTargetsLocked === true,
    substatRollBoundsV: params.substatRollBoundsV ?? {},
    targetEntries,
  }) as {
    mins: number[]
    maxCaps: number[]
    anyFlags: number[]
    optionalMask: number[]
    lockedMask: number[]
    targetedMask: number[]
    substats: Array<{ id: number; isFlat: boolean }>
    targetBases: Array<number | null>
    targetIncrements: Array<Array<number | null>>
    sumMin: number
    sumLockedMin: number
    anyMin: boolean
    anyWildcard: boolean
    impossibleMinMax: boolean
  }
  if (!result || !Array.isArray(result.mins) || !Array.isArray(result.maxCaps) || !Array.isArray(result.substats)) {
    throw new Error('WASM build-hsf-combo-vectors helper returned an invalid payload.')
  }
  return {
    mins: result.mins.map((value) => Math.floor(Number(value))),
    maxCaps: result.maxCaps.map((value) => Math.floor(Number(value))),
    anyFlags: result.anyFlags.map((value) => Number(value) !== 0),
    optionalMask: result.optionalMask.map((value) => Number(value) !== 0),
    lockedMask: result.lockedMask.map((value) => Number(value) !== 0),
    targetedMask: result.targetedMask.map((value) => Number(value) !== 0),
    substats: result.substats.map((entry) => ({ id: Math.floor(Number(entry.id)), isFlat: entry.isFlat === true })),
    targetBases: result.targetBases.map((value) => (
      typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : null
    )),
    targetIncrements: result.targetIncrements.map((row) => (
      Array.isArray(row)
        ? row.map((value) => (
          typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : null
        ))
        : []
    )),
    sumMin: Math.floor(Number(result.sumMin ?? 0)),
    sumLockedMin: Math.floor(Number(result.sumLockedMin ?? 0)),
    anyMin: result.anyMin === true,
    anyWildcard: result.anyWildcard === true,
    impossibleMinMax: result.impossibleMinMax === true,
  }
}

// Combo-policy vectors run in Rust so branch helpers stop looping masks/reductions.
export const buildHsfComboPolicyVectorsWithLoadedWasm = (params: {
  mins: ReadonlyArray<number> | Int32Array
  anyFlags: ReadonlyArray<boolean> | Uint8Array
  targetedMask: ReadonlyArray<boolean> | Uint8Array
  optionalMask: ReadonlyArray<boolean> | Uint8Array
  comboLen: number
  minTargetCount: number
  aggregateTargetsLocked: boolean
  globalMin: number
  othersCount: number
  avail: number
}): {
  sumMinTargeted: number
  minNonTargetNow: number
  optionalRowsOnlyBaseline: boolean
  deficitFloors: Int32Array
  preferVirtualSink: boolean
} => {
  assertWasmInitializedSync()
  const result = buildHsfComboPolicyVectorsWasmValueBinding({
    mins: Array.from(toFlooredI32(params.mins)),
    anyFlags: Array.from(toMaskU8(params.anyFlags)),
    targetedMask: Array.from(toMaskU8(params.targetedMask)),
    optionalMask: Array.from(toMaskU8(params.optionalMask)),
    comboLen: Math.floor(params.comboLen),
    minTargetCount: Math.floor(params.minTargetCount),
    aggregateTargetsLocked: params.aggregateTargetsLocked === true,
    globalMin: Math.floor(params.globalMin),
    othersCount: Math.floor(params.othersCount),
    avail: Math.floor(params.avail),
  }) as {
    sumMinTargeted: number
    minNonTargetNow: number
    optionalRowsOnlyBaseline: boolean
    deficitFloors: number[]
    preferVirtualSink: boolean
  }
  if (!result || !Array.isArray(result.deficitFloors)) {
    throw new Error('WASM build-hsf-combo-policy-vectors helper returned an invalid payload.')
  }
  return {
    sumMinTargeted: Math.floor(Number(result.sumMinTargeted ?? 0)),
    minNonTargetNow: Math.floor(Number(result.minNonTargetNow ?? 0)),
    optionalRowsOnlyBaseline: result.optionalRowsOnlyBaseline === true,
    deficitFloors: Int32Array.from(result.deficitFloors.map((value) => Math.floor(Number(value ?? -1)))),
    preferVirtualSink: result.preferVirtualSink === true,
  }
}

// Factory-collapse combo profiling runs in Rust so hsfBuilder no longer loops
// per variant for base-value mapping and eligibility gating.
export const buildHsfFactoryComboRowsWithLoadedWasm = (params: {
  combo: ReadonlyArray<number> | Int32Array
  currentBaseByVariant: Record<number, number>
  factoryBaseByVariant: Record<number, number | null>
  targetBaseOverrideByVariant: Record<number, number | null>
  substatRollBoundsV: Record<number, { min?: number; max?: number; any?: boolean } | undefined> | undefined
}): {
  baseVals: Int32Array
  factoryEligible: boolean
  substats: Array<{ id: number; isFlat: boolean }>
} => {
  assertWasmInitializedSync()
  const combo = Array.from(toFlooredI32(params.combo))
  const result = buildHsfFactoryComboRowsWasmValueBinding({
    combo,
    currentBaseByVariant: params.currentBaseByVariant ?? {},
    factoryBaseByVariant: params.factoryBaseByVariant ?? {},
    targetBaseOverrideByVariant: params.targetBaseOverrideByVariant ?? {},
    substatRollBoundsV: params.substatRollBoundsV ?? {},
  }) as {
    baseVals: number[]
    factoryEligible: boolean
    substats: Array<{ id: number; isFlat: boolean }>
  }
  if (!result || !Array.isArray(result.baseVals) || !Array.isArray(result.substats)) {
    throw new Error('WASM build-hsf-factory-combo-rows helper returned an invalid payload.')
  }
  return {
    baseVals: Int32Array.from(result.baseVals.map((value) => Math.floor(Number(value ?? 0)))),
    factoryEligible: result.factoryEligible === true,
    substats: result.substats.map((entry) => ({ id: Math.floor(Number(entry.id)), isFlat: entry.isFlat === true })),
  }
}

// Late-mode bounded row generation now runs in Rust so hsfBuilder no longer
// duplicates need-now/add-cap loops across targeted + strict branches.
export const buildHsfLateBoundedRowsWithLoadedWasm = (params: {
  mode: 'targeted' | 'strict'
  mins: ReadonlyArray<number> | Int32Array
  maxCaps: ReadonlyArray<number> | Int32Array
  anyFlags: ReadonlyArray<boolean> | Uint8Array
  targetedMask: ReadonlyArray<boolean> | Uint8Array
  lockedMask: ReadonlyArray<boolean> | Uint8Array
  optionalMask: ReadonlyArray<boolean> | Uint8Array
  remaining: number
  avail: number
  sumMin: number
  globalMin: number
  numTarget: number
  lockedMinValue: number
  lockedMinActive: boolean
  minTargetCount: number
}): number[][] => {
  assertWasmInitializedSync()
  const result = buildHsfLateBoundedRowsWasmValueBinding({
    mode: params.mode,
    mins: Array.from(toFlooredI32(params.mins)),
    maxCaps: Array.from(toOptionalI32(params.maxCaps)),
    anyFlags: Array.from(toMaskU8(params.anyFlags)),
    targetedMask: Array.from(toMaskU8(params.targetedMask)),
    lockedMask: Array.from(toMaskU8(params.lockedMask)),
    optionalMask: Array.from(toMaskU8(params.optionalMask)),
    remaining: Math.floor(params.remaining),
    avail: Math.floor(params.avail),
    sumMin: Math.floor(params.sumMin),
    globalMin: Math.floor(params.globalMin),
    numTarget: Math.floor(params.numTarget),
    lockedMinValue: Math.floor(params.lockedMinValue),
    lockedMinActive: params.lockedMinActive === true,
    minTargetCount: Math.floor(params.minTargetCount),
  })
  if (Array.isArray(result)) return result as number[][]
  throw new Error('WASM build-hsf-late-bounded-rows helper returned an invalid payload.')
}

type HsfIntroModePlanStepOut =
  | {
    kind: 'emitRows'
    rows: number[][]
    skipOptionalBaseline: boolean
  }
  | {
    kind: 'emitPresence'
  }
  | {
    kind: 'emitLateRows'
    mode: 'targeted' | 'strict'
    skipOptionalBaseline: boolean
    stopIfEmitted: boolean
  }
  | {
    kind: 'emitFilteredSelected'
    minFloors: number[] | null
    targetedExact: number | null
    deficitFloors: number[] | null
    deficitMax: number | null
    globalMode: 0 | 1 | 2
    globalRemaining: number
    lockedMode: 0 | 1 | 2
    lockedRemaining: number
    fallbackPresenceOnEmpty: boolean
  }
  | {
    kind: 'emitFilteredAllowOther'
    minFloors: number[] | null
    targetedExact: number | null
    deficitFloors: number[] | null
    deficitMax: number | null
    preferVirtualSink: boolean
  }

const toFiniteI32 = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value)
  }
  // wasm serde can surface i64 fields as bigint; normalize those too.
  if (typeof value === 'bigint') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return Math.floor(numeric)
  }
  return fallback
}

const toNullableI32Array = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) return null
  return value.map((entry) => toFiniteI32(entry, -1))
}

const toNullableFiniteI32 = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value)
  }
  if (typeof value === 'bigint') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return Math.floor(numeric)
  }
  return null
}

const normalizeIntroPlanStep = (rawStep: unknown): HsfIntroModePlanStepOut | null => {
  if (!rawStep || typeof rawStep !== 'object') return null
  const step = rawStep as Record<string, unknown>
  const readStepField = (camelCaseKey: string, snakeCaseKey: string): unknown => (
    Object.prototype.hasOwnProperty.call(step, camelCaseKey)
      ? step[camelCaseKey]
      : step[snakeCaseKey]
  )
  const kind = typeof step.kind === 'string' ? step.kind : ''
  if (kind === 'emitRows') {
    const rowsValue = readStepField('rows', 'rows')
    const rowsRaw = Array.isArray(rowsValue) ? rowsValue : []
    const rows = rowsRaw.map((row) => (
      Array.isArray(row) ? row.map((value) => toFiniteI32(value, 0)) : []
    ))
    return {
      kind: 'emitRows',
      rows,
      skipOptionalBaseline: readStepField('skipOptionalBaseline', 'skip_optional_baseline') === true,
    }
  }
  if (kind === 'emitPresence') {
    return { kind: 'emitPresence' }
  }
  if (kind === 'emitLateRows') {
    const modeValue = readStepField('mode', 'mode')
    const mode = modeValue === 'strict' ? 'strict' : 'targeted'
    return {
      kind: 'emitLateRows',
      mode,
      skipOptionalBaseline: readStepField('skipOptionalBaseline', 'skip_optional_baseline') === true,
      stopIfEmitted: readStepField('stopIfEmitted', 'stop_if_emitted') === true,
    }
  }
  if (kind === 'emitFilteredSelected') {
    return {
      kind: 'emitFilteredSelected',
      minFloors: toNullableI32Array(readStepField('minFloors', 'min_floors')),
      targetedExact: toNullableFiniteI32(readStepField('targetedExact', 'targeted_exact')),
      deficitFloors: toNullableI32Array(readStepField('deficitFloors', 'deficit_floors')),
      deficitMax: toNullableFiniteI32(readStepField('deficitMax', 'deficit_max')),
      globalMode: toFiniteI32(readStepField('globalMode', 'global_mode'), 0) as 0 | 1 | 2,
      globalRemaining: toFiniteI32(readStepField('globalRemaining', 'global_remaining'), 0),
      lockedMode: toFiniteI32(readStepField('lockedMode', 'locked_mode'), 0) as 0 | 1 | 2,
      lockedRemaining: toFiniteI32(readStepField('lockedRemaining', 'locked_remaining'), 0),
      fallbackPresenceOnEmpty: readStepField('fallbackPresenceOnEmpty', 'fallback_presence_on_empty') === true,
    }
  }
  if (kind === 'emitFilteredAllowOther') {
    return {
      kind: 'emitFilteredAllowOther',
      minFloors: toNullableI32Array(readStepField('minFloors', 'min_floors')),
      targetedExact: toNullableFiniteI32(readStepField('targetedExact', 'targeted_exact')),
      deficitFloors: toNullableI32Array(readStepField('deficitFloors', 'deficit_floors')),
      deficitMax: toNullableFiniteI32(readStepField('deficitMax', 'deficit_max')),
      preferVirtualSink: readStepField('preferVirtualSink', 'prefer_virtual_sink') === true,
    }
  }
  return null
}

// Intro policy planning runs in Rust so strict/potential early/late branching
// remains SSOT and TS only executes the selected emission operations.
export const buildHsfIntroModePlanWithLoadedWasm = (params: {
  effectiveMode: 'strict' | 'potential'
  earlyMode: 'early' | 'late'
  m: number
  minTargetCount: number
  comboLen: number
  anyMin: boolean
  anyWildcard: boolean
  globalMin: number
  numTarget: number
  avail: number
  sumMin: number
  sumMinTargeted: number
  minNonTargetNow: number
  needsLockedAggregate: boolean
  remaining: number
  targetedMask: ReadonlyArray<boolean> | Uint8Array
  lockedMask: ReadonlyArray<boolean> | Uint8Array
  mins: ReadonlyArray<number> | Int32Array
  maxCaps: ReadonlyArray<number> | Int32Array
  deficitFloors: ReadonlyArray<number> | Int32Array
  preferVirtualSink: boolean
  optionalRowsOnlyBaseline: boolean
  lockedMinActive: boolean
  lockedMinValue: number
}): { steps: HsfIntroModePlanStepOut[] } => {
  assertWasmInitializedSync()
  const result = buildHsfIntroModePlanWasmValueBinding({
    effectiveMode: params.effectiveMode,
    earlyMode: params.earlyMode,
    m: Math.floor(params.m),
    minTargetCount: Math.floor(params.minTargetCount),
    comboLen: Math.floor(params.comboLen),
    anyMin: params.anyMin === true,
    anyWildcard: params.anyWildcard === true,
    globalMin: Math.floor(params.globalMin),
    numTarget: Math.floor(params.numTarget),
    avail: Math.floor(params.avail),
    sumMin: Math.floor(params.sumMin),
    sumMinTargeted: Math.floor(params.sumMinTargeted),
    minNonTargetNow: Math.floor(params.minNonTargetNow),
    needsLockedAggregate: params.needsLockedAggregate === true,
    remaining: Math.floor(params.remaining),
    targetedMask: Array.from(toMaskU8(params.targetedMask)).map((value) => value !== 0),
    lockedMask: Array.from(toMaskU8(params.lockedMask)).map((value) => value !== 0),
    mins: Array.from(toFlooredI32(params.mins)),
    maxCaps: Array.from(toOptionalI32(params.maxCaps)),
    deficitFloors: Array.from(toOptionalI32(params.deficitFloors)),
    preferVirtualSink: params.preferVirtualSink === true,
    optionalRowsOnlyBaseline: params.optionalRowsOnlyBaseline === true,
    lockedMinActive: params.lockedMinActive === true,
    lockedMinValue: Math.floor(params.lockedMinValue),
  }) as { steps?: unknown }
  if (!result || !Array.isArray(result.steps)) {
    throw new Error('WASM build-hsf-intro-mode-plan helper returned an invalid payload.')
  }
  const normalizedSteps = result.steps
    .map((step) => normalizeIntroPlanStep(step))
    .filter((step): step is HsfIntroModePlanStepOut => step !== null)
  return { steps: normalizedSteps }
}

// Intro plan execution runs in Rust so hsfBuilder no longer loops per-intro
// through filtered/late/presence branches in TypeScript.
export const executeHsfIntroPlanWithLoadedWasm = (params: {
  m: number
  othersCount: number
  avail: number
  remaining: number
  sumMin: number
  globalMin: number
  numTarget: number
  lockedMinValue: number
  lockedMinActive: boolean
  minTargetCount: number
  skipPresenceForFlexSupersets: boolean
  mins: ReadonlyArray<number> | Int32Array
  maxCaps: ReadonlyArray<number> | Int32Array
  anyFlags: ReadonlyArray<boolean> | Uint8Array
  targetedMask: ReadonlyArray<boolean> | Uint8Array
  lockedMask: ReadonlyArray<boolean> | Uint8Array
  optionalMask: ReadonlyArray<boolean> | Uint8Array
  timelineCapsByIntro: ReadonlyArray<ReadonlyArray<number> | Int32Array>
  planSteps: ReadonlyArray<HsfIntroModePlanStepOut>
  emit: {
    baseRule: HsfRule
    substats: Array<{ id: number; isFlat?: boolean }>
    baseVals: number[]
    mins: number[]
    maxCaps: number[]
    optionalMask: boolean[]
    skipOptionalBaseline: boolean
    mainChoices: Array<{ id: number; f?: number }>
    emitAnyMainWhenNoChoices: boolean
    targetBases: Array<number | null>
    targetIncrements: Array<Array<number | null>>
  }
}): HsfRule[] => {
  assertWasmInitializedSync()
  const result = executeHsfIntroPlanWasmValueBinding({
    m: Math.floor(params.m),
    othersCount: Math.floor(params.othersCount),
    avail: Math.floor(params.avail),
    remaining: Math.floor(params.remaining),
    sumMin: Math.floor(params.sumMin),
    globalMin: Math.floor(params.globalMin),
    numTarget: Math.floor(params.numTarget),
    lockedMinValue: Math.floor(params.lockedMinValue),
    lockedMinActive: params.lockedMinActive === true,
    minTargetCount: Math.floor(params.minTargetCount),
    skipPresenceForFlexSupersets: params.skipPresenceForFlexSupersets === true,
    mins: Array.from(toFlooredI32(params.mins)),
    maxCaps: Array.from(toOptionalI32(params.maxCaps)),
    anyFlags: Array.from(toMaskU8(params.anyFlags)),
    targetedMask: Array.from(toMaskU8(params.targetedMask)),
    lockedMask: Array.from(toMaskU8(params.lockedMask)),
    optionalMask: Array.from(toMaskU8(params.optionalMask)),
    timelineCapsByIntro: params.timelineCapsByIntro.map((row) => (
      Array.from(toOptionalI32(row as ReadonlyArray<number> | Int32Array))
    )),
    planSteps: Array.from(params.planSteps),
    emit: params.emit,
  })
  if (Array.isArray(result)) return result as HsfRule[]
  throw new Error('WASM execute-hsf-intro-plan helper returned an invalid payload.')
}

// Combo runtime executes the largest remaining per-combo hsfBuilder branch in
// Rust: vectors, policy reductions, intro-plan, timeline caps, and emissions.
export const executeHsfComboRuntimeWithLoadedWasm = (params: {
  combo: ReadonlyArray<number> | Int32Array
  requiredV: ReadonlyArray<number> | Int32Array
  aggregateTargetsLocked: boolean
  substatRollBoundsV: Record<string, { min?: number; max?: number; any?: boolean }>
  targetEntries: Array<{ base?: number; increments?: Array<number | null> } | null>
  baseVals: ReadonlyArray<number> | Int32Array
  baseRule: HsfRule
  mainChoices: Array<{ id: number; f?: number }>
  emitAnyMainWhenNoChoices: boolean
  effectiveMode: 'strict' | 'potential'
  earlyMode: 'early' | 'late'
  minTargetCount: number
  aggregateMinValue: number
  lockedMinActive: boolean
  lockedMinValue: number
  flexActive: boolean
  present: number
  baseStartByBranch: number
  additionTimelineAll: ReadonlyArray<number> | Int32Array
  level: number
  rollTimeline: ReadonlyArray<number> | Int32Array
  baseline?: string
  effectiveStart: number
  preRolls: number
  rarityCode: number
  numRollsForThisLevel: number
  numRollsByTarget: number
}): HsfRule[] => {
  assertWasmInitializedSync()
  const result = executeHsfComboRuntimeWasmValueBinding({
    combo: Array.from(toFlooredI32(params.combo)),
    requiredV: Array.from(toFlooredI32(params.requiredV)),
    aggregateTargetsLocked: params.aggregateTargetsLocked === true,
    substatRollBoundsV: params.substatRollBoundsV ?? {},
    targetEntries: params.targetEntries ?? [],
    baseVals: Array.from(toFlooredI32(params.baseVals)),
    baseRule: params.baseRule,
    mainChoices: params.mainChoices ?? [],
    emitAnyMainWhenNoChoices: params.emitAnyMainWhenNoChoices === true,
    effectiveMode: params.effectiveMode,
    earlyMode: params.earlyMode,
    minTargetCount: Math.floor(params.minTargetCount),
    aggregateMinValue: Math.floor(params.aggregateMinValue),
    lockedMinActive: params.lockedMinActive === true,
    lockedMinValue: Math.floor(params.lockedMinValue),
    flexActive: params.flexActive === true,
    present: Math.floor(params.present),
    baseStartByBranch: Math.floor(params.baseStartByBranch),
    additionTimelineAll: Array.from(toFlooredI32(params.additionTimelineAll)),
    level: Math.floor(params.level),
    rollTimeline: Array.from(toFlooredI32(params.rollTimeline)),
    baseline: params.baseline,
    effectiveStart: Math.floor(params.effectiveStart),
    preRolls: Math.floor(params.preRolls),
    rarityCode: Math.floor(params.rarityCode),
    numRollsForThisLevel: Math.floor(params.numRollsForThisLevel),
    numRollsByTarget: Math.floor(params.numRollsByTarget),
  })
  if (Array.isArray(result)) return result as HsfRule[]
  throw new Error('WASM execute-hsf-combo-runtime helper returned an invalid payload.')
}

// Level+combo runtime executes collapse checks, m===0 presence rows, and
// non-empty combo runtime dispatch in one Rust call for hsfBuilder loops.
export const executeHsfLevelComboWithLoadedWasm = (params: {
  sentinelAlreadyCollapsed: boolean
  combo: ReadonlyArray<number> | Int32Array
  present: number
  level: number
  rarityCode: number
  additionLevelsCount: number
  additionEventAtLevel: boolean
  collapseBranchEligible: boolean
  collapseRarityEligible: boolean
  sentinelEligibleForBranch: boolean
  comboProfile: {
    baseVals: ReadonlyArray<number> | Int32Array
    factoryEligible: boolean
    substats: Array<{ id: number; isFlat?: boolean }>
  }
  baseRule: HsfRule
  mainChoices: Array<{ id: number; f?: number }>
  emitAnyMainWhenNoChoices: boolean
  runtime: {
    combo: ReadonlyArray<number> | Int32Array
    requiredV: ReadonlyArray<number> | Int32Array
    aggregateTargetsLocked: boolean
    substatRollBoundsV: Record<string, { min?: number; max?: number; any?: boolean }>
    targetEntries: Array<{ base?: number; increments?: Array<number | null> } | null>
    baseVals: ReadonlyArray<number> | Int32Array
    baseRule: HsfRule
    mainChoices: Array<{ id: number; f?: number }>
    emitAnyMainWhenNoChoices: boolean
    effectiveMode: 'strict' | 'potential'
    earlyMode: 'early' | 'late'
    minTargetCount: number
    aggregateMinValue: number
    lockedMinActive: boolean
    lockedMinValue: number
    flexActive: boolean
    present: number
    baseStartByBranch: number
    additionTimelineAll: ReadonlyArray<number> | Int32Array
    level: number
    rollTimeline: ReadonlyArray<number> | Int32Array
    baseline?: string
    effectiveStart: number
    preRolls: number
    rarityCode: number
    numRollsForThisLevel: number
    numRollsByTarget: number
  }
}): { rules: HsfRule[]; sentinelCollapsed: boolean } => {
  assertWasmInitializedSync()
  const result = executeHsfLevelComboWasmValueBinding({
    sentinelAlreadyCollapsed: params.sentinelAlreadyCollapsed === true,
    combo: Array.from(toFlooredI32(params.combo)),
    present: Math.floor(params.present),
    level: Math.floor(params.level),
    rarityCode: Math.floor(params.rarityCode),
    additionLevelsCount: Math.floor(params.additionLevelsCount),
    additionEventAtLevel: params.additionEventAtLevel === true,
    collapseBranchEligible: params.collapseBranchEligible === true,
    collapseRarityEligible: params.collapseRarityEligible === true,
    sentinelEligibleForBranch: params.sentinelEligibleForBranch === true,
    comboProfile: {
      baseVals: Array.from(toFlooredI32(params.comboProfile.baseVals)),
      factoryEligible: params.comboProfile.factoryEligible === true,
      substats: params.comboProfile.substats,
    },
    baseRule: params.baseRule,
    mainChoices: params.mainChoices ?? [],
    emitAnyMainWhenNoChoices: params.emitAnyMainWhenNoChoices === true,
    runtime: {
      combo: Array.from(toFlooredI32(params.runtime.combo)),
      requiredV: Array.from(toFlooredI32(params.runtime.requiredV)),
      aggregateTargetsLocked: params.runtime.aggregateTargetsLocked === true,
      substatRollBoundsV: params.runtime.substatRollBoundsV ?? {},
      targetEntries: params.runtime.targetEntries ?? [],
      baseVals: Array.from(toFlooredI32(params.runtime.baseVals)),
      baseRule: params.runtime.baseRule,
      mainChoices: params.runtime.mainChoices ?? [],
      emitAnyMainWhenNoChoices: params.runtime.emitAnyMainWhenNoChoices === true,
      effectiveMode: params.runtime.effectiveMode,
      earlyMode: params.runtime.earlyMode,
      minTargetCount: Math.floor(params.runtime.minTargetCount),
      aggregateMinValue: Math.floor(params.runtime.aggregateMinValue),
      lockedMinActive: params.runtime.lockedMinActive === true,
      lockedMinValue: Math.floor(params.runtime.lockedMinValue),
      flexActive: params.runtime.flexActive === true,
      present: Math.floor(params.runtime.present),
      baseStartByBranch: Math.floor(params.runtime.baseStartByBranch),
      additionTimelineAll: Array.from(toFlooredI32(params.runtime.additionTimelineAll)),
      level: Math.floor(params.runtime.level),
      rollTimeline: Array.from(toFlooredI32(params.runtime.rollTimeline)),
      baseline: params.runtime.baseline,
      effectiveStart: Math.floor(params.runtime.effectiveStart),
      preRolls: Math.floor(params.runtime.preRolls),
      rarityCode: Math.floor(params.runtime.rarityCode),
      numRollsForThisLevel: Math.floor(params.runtime.numRollsForThisLevel),
      numRollsByTarget: Math.floor(params.runtime.numRollsByTarget),
    },
  }) as { rules?: unknown; sentinelCollapsed?: unknown }
  if (!result || !Array.isArray(result.rules)) {
    throw new Error('WASM execute-hsf-level-combo helper returned an invalid payload.')
  }
  return {
    rules: result.rules as HsfRule[],
    sentinelCollapsed: result.sentinelCollapsed === true,
  }
}

// Branch runtime executes one full rarity branch (levels+combos+fallbacks) so
// hsfBuilder can avoid the largest remaining orchestration loop in TypeScript.
export const executeHsfBranchRuntimeWithLoadedWasm = (params: {
  rarityCode: number
  baseline?: string
  effectiveStart: number
  suppressRollThresholds: boolean
  levelWindowMin: number
  levelWindowMax: number
  restrictLevels?: ReadonlyArray<number> | Int32Array
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
  baseRule: HsfRule
  mainChoices: Array<{ id: number; f?: number }>
  emitAnyMainWhenNoChoices: boolean
  effectiveMode: 'strict' | 'potential'
  earlyMode: 'early' | 'late'
}): HsfRule[] => {
  assertWasmInitializedSync()
  // Normalize optional restricted levels into stable integer payload vectors.
  const restrictLevels = params.restrictLevels != null
    ? Array.from(toFlooredI32(params.restrictLevels))
    : undefined
  const result = executeHsfBranchRuntimeWasmValueBinding({
    rarityCode: Math.floor(params.rarityCode),
    baseline: params.baseline,
    effectiveStart: Math.floor(params.effectiveStart),
    suppressRollThresholds: params.suppressRollThresholds === true,
    levelWindowMin: Math.floor(params.levelWindowMin),
    levelWindowMax: Math.floor(params.levelWindowMax),
    ...(restrictLevels ? { restrictLevels } : {}),
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
    baseRule: params.baseRule,
    mainChoices: params.mainChoices ?? [],
    emitAnyMainWhenNoChoices: params.emitAnyMainWhenNoChoices === true,
    effectiveMode: params.effectiveMode,
    earlyMode: params.earlyMode,
  })
  if (Array.isArray(result)) return result as HsfRule[]
  throw new Error('WASM execute-hsf-branch-runtime helper returned an invalid payload.')
}

// Builder runtime executes all rarity branches in one wasm call so hsfBuilder
// avoids TS branch loops, cross-branch dedupe, and finalize metadata plumbing.
export const executeHsfBuilderRuntimeWithLoadedWasm = (params: {
  rarityBranches: Array<{ code: number; restrictLevels?: ReadonlyArray<number> | Int32Array }>
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
  baseRule: HsfRule
  mainChoices: Array<{ id: number; f?: number }>
  emitAnyMainWhenNoChoices: boolean
  effectiveMode: 'strict' | 'potential'
  earlyMode: 'early' | 'late'
  emissionLimit?: number | null
}): { rules: HsfRule[]; limitHit: boolean } => {
  assertWasmInitializedSync()
  // Normalize branch payloads so wasm receives plain integer vectors only.
  const rarityBranches = (params.rarityBranches ?? []).map((branch) => {
    const restrictLevels = branch.restrictLevels != null
      ? Array.from(toFlooredI32(branch.restrictLevels))
      : undefined
    return {
      code: Math.floor(branch.code),
      ...(restrictLevels ? { restrictLevels } : {}),
    }
  })
  const result = executeHsfBuilderRuntimeWasmValueBinding({
    rarityBranches,
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
    baseRule: params.baseRule,
    mainChoices: params.mainChoices ?? [],
    emitAnyMainWhenNoChoices: params.emitAnyMainWhenNoChoices === true,
    effectiveMode: params.effectiveMode,
    earlyMode: params.earlyMode,
    ...(params.emissionLimit != null && Number.isFinite(params.emissionLimit)
      ? { emissionLimit: Math.floor(params.emissionLimit) }
      : {}),
  }) as { rules?: unknown; limitHit?: unknown }
  if (!result || !Array.isArray(result.rules)) {
    throw new Error('WASM execute-hsf-builder-runtime helper returned an invalid payload.')
  }
  return {
    rules: result.rules as HsfRule[],
    limitHit: result.limitHit === true,
  }
}

// Early-potential full-selected fallback planning runs in Rust so hsfBuilder no
// longer re-evaluates that gate/deficit branch in TypeScript.
export const buildHsfFullSelectedFallbackPlanWithLoadedWasm = (params: {
  effectiveMode: 'strict' | 'potential'
  earlyMode: 'early' | 'late'
  minTargetCount: number
  selectedPoolV: ReadonlyArray<number> | Int32Array
  rarityCode: number
  numRollsForThisLevel: number
  numRollsByTarget: number
  aggregateMinValue: number
  anyMin: boolean
  mins: ReadonlyArray<number> | Int32Array
  anyFlags: ReadonlyArray<boolean> | Uint8Array
  sumMin: number
  impossibleMinMax: boolean
  baseByVariant: Record<number, number>
}): {
  fullSelection: Int32Array
  dimensions: number
  total: number
  deficitFloors: Int32Array
  deficitMax: number
  baseVals: Int32Array
} | null => {
  assertWasmInitializedSync()
  const result = buildHsfFullSelectedFallbackPlanWasmValueBinding({
    effectiveMode: params.effectiveMode,
    earlyMode: params.earlyMode,
    minTargetCount: Math.floor(params.minTargetCount),
    selectedPoolV: Array.from(toFlooredI32(params.selectedPoolV)),
    rarityCode: Math.floor(params.rarityCode),
    numRollsForThisLevel: Math.floor(params.numRollsForThisLevel),
    numRollsByTarget: Math.floor(params.numRollsByTarget),
    aggregateMinValue: Math.floor(params.aggregateMinValue),
    anyMin: params.anyMin === true,
    mins: Array.from(toFlooredI32(params.mins)),
    anyFlags: Array.from(toMaskU8(params.anyFlags)).map((value) => value !== 0),
    sumMin: Math.floor(params.sumMin),
    impossibleMinMax: params.impossibleMinMax === true,
    baseByVariant: params.baseByVariant ?? {},
  }) as {
    fullSelection?: unknown
    dimensions?: unknown
    total?: unknown
    deficitFloors?: unknown
    deficitMax?: unknown
    baseVals?: unknown
  } | null
  if (result == null) return null
  if (
    !Array.isArray(result.fullSelection)
    || !Array.isArray(result.deficitFloors)
    || !Array.isArray(result.baseVals)
  ) {
    throw new Error('WASM build-hsf-full-selected-fallback-plan helper returned an invalid payload.')
  }
  return {
    fullSelection: Int32Array.from(result.fullSelection.map((value) => toFiniteI32(value, 0))),
    dimensions: toFiniteI32(result.dimensions, 0),
    total: toFiniteI32(result.total, 0),
    deficitFloors: Int32Array.from(result.deficitFloors.map((value) => toNullableFiniteI32(value) ?? -1)),
    deficitMax: toFiniteI32(result.deficitMax, 0),
    baseVals: Int32Array.from(result.baseVals.map((value) => toFiniteI32(value, 0))),
  }
}

// Early-potential full-selected fallback execution now runs in Rust so
// hsfBuilder can delegate this remaining branch in one call.
export const executeHsfFullSelectedFallbackWithLoadedWasm = (params: {
  effectiveMode: 'strict' | 'potential'
  earlyMode: 'early' | 'late'
  minTargetCount: number
  selectedPoolV: ReadonlyArray<number> | Int32Array
  rarityCode: number
  numRollsForThisLevel: number
  numRollsByTarget: number
  aggregateMinValue: number
  baseByVariant: Record<number, number>
  substatRollBoundsV: Record<string, { min?: number; max?: number; any?: boolean }>
  baseRule: HsfRule
  mainChoices: Array<{ id: number; f?: number }>
  emitAnyMainWhenNoChoices: boolean
}): HsfRule[] => {
  assertWasmInitializedSync()
  const result = executeHsfFullSelectedFallbackWasmValueBinding({
    effectiveMode: params.effectiveMode,
    earlyMode: params.earlyMode,
    minTargetCount: Math.floor(params.minTargetCount),
    selectedPoolV: Array.from(toFlooredI32(params.selectedPoolV)),
    rarityCode: Math.floor(params.rarityCode),
    numRollsForThisLevel: Math.floor(params.numRollsForThisLevel),
    numRollsByTarget: Math.floor(params.numRollsByTarget),
    aggregateMinValue: Math.floor(params.aggregateMinValue),
    baseByVariant: params.baseByVariant ?? {},
    substatRollBoundsV: params.substatRollBoundsV ?? {},
    baseRule: params.baseRule,
    mainChoices: params.mainChoices ?? [],
    emitAnyMainWhenNoChoices: params.emitAnyMainWhenNoChoices === true,
  })
  if (Array.isArray(result)) return result as HsfRule[]
  throw new Error('WASM execute-hsf-full-selected-fallback helper returned an invalid payload.')
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

// Synchronous numeric bounded-compositions helper for late allocation loops.
export const getBoundedCompositionsI32WithLoadedWasm = (caps: number[], total: number): number[][] => {
  // Sync callers must warm wasm first.
  assertWasmInitializedSync()
  // Reject invalid totals before computing caps payload.
  if (!Number.isFinite(total)) {
    throw new Error('Invalid bounded compositions input: total must be finite.')
  }
  // Negative totals have no feasible compositions.
  if (total < 0) return []
  // Empty cap vector only supports exact total zero.
  if (caps.length === 0) return total === 0 ? [[]] : []
  // Clamp caps to non-negative integers before wasm call.
  const payload = toNonNegativeI32(caps)
  // Execute bounded-composition backtracking in wasm.
  const flat = boundedCompositionsI32FastFlatWasmBinding(payload, Math.floor(total))
  // Rehydrate rows where width equals cap vector length.
  return unflattenI32Rows(flat, payload.length)
}

// Synchronous helper for late-mode bounded allocations with locked/optional filters.
export const getFilteredBoundedCompositionsWithOffsetI32WithLoadedWasm = (params: {
  caps: ReadonlyArray<number> | Int32Array
  total: number
  needNow: ReadonlyArray<number> | Int32Array
  lockedMask: ReadonlyArray<boolean> | Uint8Array
  lockedBaseSum: number
  lockedMinAtLevel: number
  optionalMask: ReadonlyArray<boolean> | Uint8Array
  mins: ReadonlyArray<number> | Int32Array
  skipOptionalBaseline: boolean
}): number[][] => {
  // Fail closed for sync callers that forgot to warm wasm.
  assertWasmInitializedSync()
  // Reject invalid totals before any array normalization work.
  if (!Number.isFinite(params.total)) {
    throw new Error('Invalid filtered bounded compositions input: total must be finite.')
  }
  // Negative totals have no feasible compositions.
  if (params.total < 0) return []
  // Empty caps support only the exact zero-total shape.
  if (params.caps.length === 0) return params.total === 0 ? [[]] : []
  // Keep dimensions aligned; mismatch means malformed caller payload.
  if (params.needNow.length !== params.caps.length) {
    throw new Error('Invalid filtered bounded compositions input: caps/needNow length mismatch.')
  }
  // Normalize all arrays to compact typed payloads once per call.
  const caps = toNonNegativeI32(params.caps)
  const needNow = toNonNegativeI32(params.needNow)
  const lockedMask = toMaskU8(params.lockedMask)
  const optionalMask = toMaskU8(params.optionalMask)
  const mins = toNonNegativeI32(params.mins)
  // Run bounded enumeration + filtering in wasm.
  const flat = filteredBoundedCompositionsWithOffsetI32FastFlatWasmBinding(
    caps,
    Math.floor(params.total),
    needNow,
    lockedMask,
    Math.floor(params.lockedBaseSum),
    Math.floor(params.lockedMinAtLevel),
    optionalMask,
    mins,
    params.skipOptionalBaseline === true,
  )
  // Decode fixed-width rows where width equals cap vector length.
  return unflattenI32Rows(flat, caps.length)
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
