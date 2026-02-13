import initRuleEngineWasm, {
  bounded_compositions_i32_fast_flat as boundedCompositionsI32FastFlatWasmBinding,
  combinations_i32_fast_flat as combinationsI32FastFlatWasmBinding,
  compute_keep_unique_protection_value as computeKeepUniqueProtectionValueWasmBinding,
  emit_hsf_rules_for_distributions_value as emitHsfRulesForDistributionsValueWasmBinding,
  filtered_bounded_compositions_with_offset_i32_fast_flat as filteredBoundedCompositionsWithOffsetI32FastFlatWasmBinding,
  configure_value as configureRuleEngineWasmValueBinding,
  evaluate_value as evaluateRuleEngineWasmValueBinding,
  finalize_generated_rules_value as finalizeGeneratedRulesWasmValueBinding,
  filtered_roll_distributions_fast_flat as filteredRollDistributionsFastFlatWasmBinding,
  find_obsolete_builder_value as findObsoleteBuilderRuleEngineWasmValueBinding,
  find_obsolete_value as findObsoleteRuleEngineWasmValueBinding,
  intro_assignments_for_combo_fast_flat as introAssignmentsForComboFastFlatWasmBinding,
  keep_unique_count_key_value as keepUniqueCountKeyValueWasmBinding,
  permutations_i32_fast_flat as permutationsI32FastFlatWasmBinding,
  roll_distributions_flat as rollDistributionsFlatWasmBinding,
  version as ruleEngineWasmVersionBinding,
} from './generated/rule_engine.js'
import type { GeneratedBranchRuleEntry, HsfRuleWithCfg } from '../merge'
import type { HsfRule } from '../hsfTypes'
import type { SellfileExportMode } from '../hsfBuilder'
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
const unflattenI32Rows = (flat: Int32Array, rowWidth: number): number[][] | null => {
  if (!Number.isFinite(rowWidth) || rowWidth < 0) return null
  if (rowWidth === 0) return flat.length === 0 ? [[]] : null
  if (flat.length % rowWidth !== 0) return null
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
  // Keep return contract stable: malformed payload falls back to empty array.
  return Array.isArray(result) ? (result as TesterMatchWorkerItemResult[]) : []
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

// Synchronous helper for hsfBuilder roll-composition loops.
// Callers use this only after warmup; null means wasm is not ready.
export const getRollDistributionsWithLoadedWasm = (
  dimensions: number,
  total: number,
): number[][] | null => {
  // Sync callers use this inside tight loops; require warmup beforehand.
  if (!wasmInitialized) return null
  // Reject NaN/Infinity inputs so wasm never receives invalid dimensions.
  if (!Number.isFinite(dimensions) || !Number.isFinite(total)) return null
  // Zero dimensions can only satisfy a zero-total composition.
  if (dimensions <= 0) return total === 0 ? [[]] : []
  // Negative totals have no feasible distributions.
  if (total < 0) return []
  try {
    // Floor once to keep parity with existing JS integer semantics.
    const flat = rollDistributionsFlatWasmBinding(
      Math.max(0, Math.floor(dimensions)),
      Math.floor(total),
    )
    // Rehydrate fixed-width rows from the flat wasm payload.
    return unflattenI32Rows(flat, Math.max(0, Math.floor(dimensions)))
  } catch {
    // Preserve nullable contract used by legacy fallback-aware callers.
    return null
  }
}

// Synchronous helper that runs caps/aggregate filtering inside wasm.
// Callers still apply branch-specific predicates in JS on the narrowed rows.
export const getFilteredRollDistributionsWithLoadedWasm = (params: {
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
}): number[][] | null => {
  // Fail closed for sync callers that forgot to warm wasm.
  assertWasmInitializedSync()
  // Reject NaN/Infinity inputs before we normalize arrays.
  if (!Number.isFinite(params.dimensions) || !Number.isFinite(params.total)) return null
  // Keep zero-dimension semantics aligned with roll_distributions helper.
  if (params.dimensions <= 0) return params.total === 0 ? [[]] : []
  // Negative totals cannot produce feasible rows.
  if (params.total < 0) return []
  // Convert optional caps/floors to compact sentinel-encoded i32 payloads.
  const maxCaps = toOptionalI32(params.maxCaps)
  const minFloors = toOptionalI32(params.minFloors ?? [])
  // Timeline caps and masks are passed as contiguous typed arrays.
  const timelineCaps = toOptionalI32(params.timelineCaps)
  const targetedMask = toMaskU8(params.targetedMask)
  // Deficit floors and locked mask follow the same compact encoding.
  const deficitFloors = toOptionalI32(params.deficitFloors ?? [])
  const lockedMask = toMaskU8(params.lockedMask)
  // Execute filtering in wasm so JS only consumes already-feasible rows.
  const flat = filteredRollDistributionsFastFlatWasmBinding(
    Math.max(0, Math.floor(params.dimensions)),
    Math.floor(params.total),
    maxCaps,
    minFloors,
    timelineCaps,
    targetedMask,
    // -1 sentinel means "no exact targeted sum requirement".
    typeof params.targetedExact === 'number' && Number.isFinite(params.targetedExact)
      ? Math.floor(params.targetedExact)
      : -1,
    deficitFloors,
    // -1 sentinel means "no deficit max cap".
    typeof params.deficitMax === 'number' && Number.isFinite(params.deficitMax)
      ? Math.floor(params.deficitMax)
      : -1,
    Math.floor(params.globalMin),
    Math.floor(params.globalRemaining),
    Math.floor(params.globalMode),
    lockedMask,
    Math.floor(params.lockedMin),
    Math.floor(params.lockedRemaining),
    Math.floor(params.lockedMode),
  )
  // Decode back into fixed-width integer rows expected by callers.
  return unflattenI32Rows(flat, Math.max(0, Math.floor(params.dimensions)))
}

// Synchronous keep-unique detector runs candidate/rule loops inside wasm.
// Returns null when wasm is unavailable so callers can use JS fallback paths.
export const computeKeepUniqueProtectionWithLoadedWasm = (params: {
  candidates: unknown
  rules: unknown
  expectedGroupsByRuleId: unknown
  enabled: boolean
  now: number
}): unknown | null => {
  assertWasmInitializedSync()
  return computeKeepUniqueProtectionValueWasmBinding(
    params.candidates,
    params.rules,
    params.expectedGroupsByRuleId,
    params.enabled === true,
    Number.isFinite(params.now) ? params.now : 0,
  )
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

// Synchronous helper emits concrete HSF rows for a distribution batch.
// Returns null when wasm is unavailable so callers can use JS fallback paths.
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

// Synchronous helper for intro assignment combinatorics.
// Returns null when wasm is unavailable so callers can use JS fallback paths.
export const getIntroAssignmentsForComboWithLoadedWasm = (params: {
  count: number
  baseSlots: number
  additionLevels: ReadonlyArray<number> | Int32Array
  forcedBase: ReadonlyArray<number> | Int32Array
}): number[][] | null => {
  // Sync callers must warm wasm first; null keeps historical contract.
  if (!wasmInitialized) return null
  // Guard invalid numeric inputs before array conversion.
  if (!Number.isFinite(params.count) || !Number.isFinite(params.baseSlots)) return null
  // Zero count yields one empty assignment row.
  if (params.count <= 0) return [[]]
  try {
    // Normalize both vectors once to avoid repeated Number coercions.
    const additionLevels = toFlooredI32(params.additionLevels)
    const forcedBase = toFlooredI32(params.forcedBase)
    // Run combinatorics in wasm and return flattened integer rows.
    const flat = introAssignmentsForComboFastFlatWasmBinding(
      Math.floor(params.count),
      Math.floor(params.baseSlots),
      additionLevels,
      forcedBase,
    )
    // Rehydrate fixed-width rows where width === artifact count.
    return unflattenI32Rows(flat, Math.max(0, Math.floor(params.count)))
  } catch {
    // Keep nullable failure behavior for existing call sites.
    return null
  }
}

// Synchronous numeric combinations helper for builder combinatorics.
export const getCombinationsI32WithLoadedWasm = (values: number[], pick: number): number[][] | null => {
  // Sync callers must warm wasm first; null keeps historical contract.
  if (!wasmInitialized) return null
  // Reject NaN/Infinity pick values before integer flooring.
  if (!Number.isFinite(pick)) return null
  // Pick <= 0 means one empty combination by convention.
  if (pick <= 0) return [[]]
  // Picking more than input length cannot produce combinations.
  if (pick > values.length) return []
  try {
    // Convert once to contiguous i32 payload for wasm binding.
    const payload = toFlooredI32(values)
    // Let wasm enumerate combinations in deterministic index order.
    const flat = combinationsI32FastFlatWasmBinding(payload, Math.floor(pick))
    // Decode flat result into rows of length `pick`.
    return unflattenI32Rows(flat, Math.max(0, Math.floor(pick)))
  } catch {
    // Preserve nullable failure behavior used by adapters.
    return null
  }
}

// Synchronous numeric bounded-compositions helper for late allocation loops.
export const getBoundedCompositionsI32WithLoadedWasm = (caps: number[], total: number): number[][] | null => {
  // Sync callers must warm wasm first; null keeps historical contract.
  if (!wasmInitialized) return null
  // Reject invalid totals before computing caps payload.
  if (!Number.isFinite(total)) return null
  // Negative totals have no feasible compositions.
  if (total < 0) return []
  // Empty cap vector only supports exact total zero.
  if (caps.length === 0) return total === 0 ? [[]] : []
  try {
    // Clamp caps to non-negative integers before wasm call.
    const payload = toNonNegativeI32(caps)
    // Execute bounded-composition backtracking in wasm.
    const flat = boundedCompositionsI32FastFlatWasmBinding(payload, Math.floor(total))
    // Rehydrate rows where width equals cap vector length.
    return unflattenI32Rows(flat, payload.length)
  } catch {
    // Preserve nullable failure behavior used by adapters.
    return null
  }
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
}): number[][] | null => {
  // Fail closed for sync callers that forgot to warm wasm.
  assertWasmInitializedSync()
  // Reject invalid totals before any array normalization work.
  if (!Number.isFinite(params.total)) return null
  // Negative totals have no feasible compositions.
  if (params.total < 0) return []
  // Empty caps support only the exact zero-total shape.
  if (params.caps.length === 0) return params.total === 0 ? [[]] : []
  // Keep dimensions aligned; mismatch means malformed caller payload.
  if (params.needNow.length !== params.caps.length) return null
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
export const getPermutationsI32WithLoadedWasm = (values: number[]): number[][] | null => {
  // Sync callers must warm wasm first; null keeps historical contract.
  if (!wasmInitialized) return null
  // Empty/singleton vectors have exactly one permutation.
  if (values.length <= 1) return [values.slice()]
  try {
    // Convert once to contiguous i32 payload for wasm.
    const payload = toFlooredI32(values)
    // Execute permutation backtracking in wasm.
    const flat = permutationsI32FastFlatWasmBinding(payload)
    // Rehydrate rows where width equals input length.
    return unflattenI32Rows(flat, payload.length)
  } catch {
    // Preserve nullable failure behavior used by adapters.
    return null
  }
}
