/**
 * ruleEval.ts
 *
 * Matcher adapters now delegate to the WASM rule engine so matching behavior
 * has a single source of truth shared by workers and main-thread callers.
 */
import type { ChampionLocation, NormalizedStat } from './importers/gearDbNormalizer'
import type { HsfRule } from './hsfTypes'
import type { ArtifactSetId, ArtifactTypeId, FactionId, StatVariantLike } from './types'
import type { LevelMilestone, RankValue } from './types'
import type { HsfRuleWithRecipe } from './merge'
import type { SellfileExportMode } from './hsfBuilder'
import {
  configureWasmRuleEngineWithLoadedWasm,
  evaluateWasmRuleEngineItemsWithLoadedWasm,
  type WasmRuleEngineEvaluateOptions,
} from './wasm/wasmRuleEngine'
import { resolveCanonicalTestItemId } from './itemIdentity'

// Attach provenance (recipe index) as done in merge.ts.
export type GearInspectorItemPreviewExtras = {
  // Stable numeric id used to correlate preview rows and matcher results.
  id?: number
  // Origin of the row (imported artifacts, inbox, or manual Gear Inspector rows).
  source?: 'artifacts' | 'inbox' | 'manual'
  // Re-roll count shown in Gear Inspector card badges.
  rerollCount?: number
  // Champion linkage fields mirrored from normalized Gear Inspector rows.
  equippedToChampionId?: number | null
  // Champion base id keeps presets stable across duplicate names.
  equippedChampionBaseId?: number | null
  // Champion rarity helps downstream tooltip formatting.
  equippedChampionRarity?: number | null
  // Champion ascension level (HeroID − BaseHeroID, 0–6) gates amulet/banner slot availability.
  equippedChampionAscensionLevel?: number | null
  // Champion display name used by preview row labels.
  equippedChampionName?: string | null
  // Champion location helps filter/display context in Gear Inspector tables.
  equippedChampionLocation?: ChampionLocation | null
  // Main stat payload retained for preview details and exports.
  mainStat?: NormalizedStat | null
  // Substat payload retained for preview details and exports.
  substats?: NormalizedStat[]
  // Ascension payload retained for preview details and exports.
  ascension?: NormalizedStat | null
  // Exact level retains non-milestone values for imported rows.
  exactLevel?: number | null
  // Last-use timestamp supports recency sorts in Gear Inspector views.
  lastUseLocalTimestamp?: string | null
  // Mirrors NormalizedGearArtifact.isLocked; true when the player locked the item in-game.
  isLocked?: boolean | null
}

export type TestItem = {
  // Optional human-readable name used in Gear Inspector-facing surfaces.
  name?: string
  // Slot id (artifact/accessory type) used for HSF slot checks.
  slot: ArtifactTypeId
  // Set id used for HSF set checks.
  set: ArtifactSetId
  // Rank/star value used for HSF rank mask checks.
  rank: RankValue
  // Rarity value used for HSF rarity mask checks.
  rarity: RankValue // 1..6 => Common..Mythical
  // Milestone level used for LVLForCheck matching.
  level: LevelMilestone
  // Optional faction for accessory-only faction filters.
  faction?: FactionId
  // Optional main-stat variant used for MainStatID/MainStatF checks.
  main?: StatVariantLike
  // Optional per-sub absolute values present at the current level.
  // Used to compare against HSF Substats thresholds (absolute, not rolls).
  // Missing means 0.
  subValues?: Record<number, number>
  // Preview metadata carried through for UI and id fallbacks.
  previewExtras?: GearInspectorItemPreviewExtras
}

export type EvalResult = { ruleIndex: number; keep: boolean; recipeIdx: number | null } | null

export type EvalMatchesByRecipeOverrides = {
  // Optional per-recipe export modes (disabled/separator suppression).
  recipeModes?: SellfileExportMode[]
  // Optional source exclusions (e.g., safeguard injection sources).
  excludeSources?: readonly string[]
  // Optional recipe blocklist for filtered baseline scans.
  excludeRecipeIndices?: ReadonlySet<number>
  // Optional recipe list ignored by safeguard precedence rules.
  ignoreSafeguardRecipeIndices?: ReadonlySet<number>
}

export type MatchingRecipeDecision = { recipeIdx: number; keep: boolean }

export type EvalMatchesByRecipeResult = {
  firstMatch: EvalResult | null
  firstNonExcludedMatch: EvalResult | null
  matchingRecipeIndices: number[]
  matchingRecipeDecisions: MatchingRecipeDecision[]
}

type WasmMatcherConfigCache = {
  // Keep the same rule array identity used for the active WASM configure call.
  rules: HsfRuleWithRecipe[]
  // Keep the same recipe-mode array identity used for the active WASM configure call.
  recipeModes: SellfileExportMode[]
}

// Reuse one empty array reference so repeated no-recipe calls do not trigger
// unnecessary reconfigure calls just because [] was allocated again.
const EMPTY_RECIPE_MODES: SellfileExportMode[] = []
// Item key 0 means "no concrete item id" for safeguard rule guards.
const FALLBACK_EVAL_ITEM_ID = 0
// Cache the last configured matcher inputs so sync adapters can evaluate many
// rows without paying configure cost on every single call.
let wasmMatcherConfigCache: WasmMatcherConfigCache | null = null

// -- Overridable WASM bindings --
//
// Default to the full pipeline WASM functions (used by the pipeline worker and main thread).
// The dungeon simulator worker calls setRuleEvalWasmBindings() at startup to redirect all
// evaluateFirst / evaluateMatchesByRecipe calls through the lean dsim binary instead.
// Since workers are isolated JS module scopes, this override affects only the calling worker.
//
// Signature types mirror the relevant exports in wasmRuleEngine.ts; kept inline here to
// avoid a circular import between ruleEval.ts and wasmRuleEngine.ts.
type WasmConfigureFn = (params: { rules: HsfRuleWithRecipe[]; recipeModes: SellfileExportMode[] }) => void
// Return type mirrors evaluateWasmRuleEngineItemsWithLoadedWasm via ReturnType to avoid
// importing GearInspectorMatchWorkerItemResult from the workers directory into lib/.
type WasmEvaluateFn = (params: {
  items: Array<{ itemId: number; item: TestItem }>
  options?: WasmRuleEngineEvaluateOptions
}) => ReturnType<typeof evaluateWasmRuleEngineItemsWithLoadedWasm>

let _currentConfigureFn: WasmConfigureFn = configureWasmRuleEngineWithLoadedWasm
let _currentEvaluateFn: WasmEvaluateFn = (params) =>
  evaluateWasmRuleEngineItemsWithLoadedWasm(params)

// Override the WASM functions used by evaluateFirst / evaluateMatchesByRecipe.
// Call this once at worker startup (after warmup) when using the lean dsim binary.
// Has no effect outside the calling worker's module scope.
export const setRuleEvalWasmBindings = (fns: {
  configure: WasmConfigureFn
  evaluate: WasmEvaluateFn
}): void => {
  // Clear the config cache so the first call after binding swap reconfigures WASM.
  wasmMatcherConfigCache = null
  _currentConfigureFn = fns.configure
  _currentEvaluateFn = fns.evaluate
}

const createEmptyEvalMatchesByRecipeResult = (): EvalMatchesByRecipeResult => ({
  // No first match exists when evaluation cannot find any rule hit.
  firstMatch: null,
  // Baseline/non-excluded result is also empty in the same no-hit case.
  firstNonExcludedMatch: null,
  // No recipes matched, so return an empty index list.
  matchingRecipeIndices: [],
  // No recipe decisions exist, so return an empty decision list.
  matchingRecipeDecisions: [],
})

// Resolve the stable item key used by safeguard item-bound rules.
// This mirrors worker inputs where itemId is carried alongside the payload.
const resolveEvalItemId = (item: TestItem): number => {
  // Some call sites still attach `itemId` directly onto the Gear Inspector item object.
  const withItemId = item as TestItem & { itemId?: number }
  // Use shared canonical precedence so main-thread eval mirrors worker paths.
  const resolved = resolveCanonicalTestItemId(withItemId)
  if (resolved != null) return resolved
  // Zero means "no concrete id", matching existing safeguard sentinel behavior.
  return FALLBACK_EVAL_ITEM_ID
}

// Strip local-only fields and pass only matcher filters accepted by wasm.
const toWasmEvaluateOptions = (
  options?: EvalMatchesByRecipeOverrides,
): WasmRuleEngineEvaluateOptions | undefined => {
  // Missing options means no matcher-side filters should be applied.
  if (!options) return undefined
  // Start with an empty payload and add only defined filters.
  const payload: WasmRuleEngineEvaluateOptions = {}
  // Forward source exclusions used by baseline scans (e.g. safeguard injections).
  if (options.excludeSources && options.excludeSources.length > 0) {
    payload.excludeSources = options.excludeSources
  }
  // Forward explicit recipe blocklists used by safeguard ignore workflows.
  if (options.excludeRecipeIndices && options.excludeRecipeIndices.size > 0) {
    payload.excludeRecipeIndices = options.excludeRecipeIndices
  }
  // Forward safeguard precedence ignore sets unchanged to preserve semantics.
  if (options.ignoreSafeguardRecipeIndices && options.ignoreSafeguardRecipeIndices.size > 0) {
    payload.ignoreSafeguardRecipeIndices = options.ignoreSafeguardRecipeIndices
  }
  // Undefined signals "no filters", so WASM avoids unnecessary option handling.
  return Object.keys(payload).length > 0 ? payload : undefined
}

// Configure once per ruleset/mode tuple so repeated evaluate calls stay cheap.
const ensureWasmMatcherConfigured = (
  rules: HsfRuleWithRecipe[],
  recipeModes: SellfileExportMode[],
): void => {
  // If both arrays are the exact same identities, WASM is already configured.
  if (
    wasmMatcherConfigCache
    && wasmMatcherConfigCache.rules === rules
    && wasmMatcherConfigCache.recipeModes === recipeModes
  ) {
    return
  }
  // Reconfigure via the active binding (full pipeline or lean dsim WASM).
  _currentConfigureFn({ rules, recipeModes })
  // Cache the new identities so subsequent calls can skip reconfigure work.
  wasmMatcherConfigCache = { rules, recipeModes }
}

const evaluateSingleItemWithWasm = (
  rules: HsfRuleWithRecipe[],
  recipeModes: SellfileExportMode[],
  item: TestItem,
  options?: EvalMatchesByRecipeOverrides,
): EvalMatchesByRecipeResult => {
  // Empty ruleset cannot match anything, so return the canonical empty payload.
  if (!Array.isArray(rules) || rules.length === 0) return createEmptyEvalMatchesByRecipeResult()
  // Ensure WASM has the right rule/recipe snapshot before evaluating this item.
  ensureWasmMatcherConfigured(rules, recipeModes)
  // Convert local option shape into the compact payload accepted by WASM.
  const wasmOptions = toWasmEvaluateOptions(options)
  // Evaluate via the active binding (full pipeline or lean dsim WASM).
  const [result] = _currentEvaluateFn(
    wasmOptions
      ? {
          // Pass resolved item id so safeguard item-bound rules can match.
          items: [{ itemId: resolveEvalItemId(item), item }],
          // Include matcher filters only when they actually exist.
          options: wasmOptions,
        }
      : {
          // Fast path when no filter payload is needed for this evaluation.
          items: [{ itemId: resolveEvalItemId(item), item }],
        },
  )
  // Defensive fallback: malformed WASM payload should not leak undefineds.
  if (!result) return createEmptyEvalMatchesByRecipeResult()
  return {
    // Main first-match mirrors the previous ruleEval contract exactly.
    firstMatch: result.firstMatch ?? null,
    // Preserve baseline fallback semantics from prior JS implementation.
    firstNonExcludedMatch: result.firstNonExcludedMatch ?? result.firstMatch ?? null,
    // Keep recipe index list shape stable for chip rendering callers.
    matchingRecipeIndices: result.matchingRecipeIndices ?? [],
    // Keep recipe decision list shape stable for preview state callers.
    matchingRecipeDecisions: result.matchingRecipeDecisions ?? [],
  }
}

/** True if a single rule matches the given test item. */
export function matchRule(rule: HsfRule, item: TestItem): boolean {
  // Single-rule match reuses the common WASM adapter with a one-rule list.
  const result = evaluateSingleItemWithWasm(
    [rule as HsfRuleWithRecipe],
    EMPTY_RECIPE_MODES,
    item,
  )
  // Rule at index 0 matched means this single rule matched the Gear Inspector item.
  return result.firstMatch?.ruleIndex === 0
}

/** Iterate in order and return the first matching rule. */
export function evaluateFirst(rules: HsfRuleWithRecipe[], item: TestItem): EvalResult {
  // First-match scan also reuses the common WASM single-item adapter.
  const result = evaluateSingleItemWithWasm(
    rules,
    EMPTY_RECIPE_MODES,
    item,
  )
  // Return only the first-match payload to preserve evaluateFirst contract.
  return result.firstMatch
}

/** Full scan that returns the first match plus the set of recipes that match anywhere in the rules list. */
export function evaluateMatchesByRecipe(
  rules: HsfRuleWithRecipe[],
  item: TestItem,
  options?: EvalMatchesByRecipeOverrides,
): EvalMatchesByRecipeResult {
  // Caller-provided recipe modes are optional; default to the shared empty list.
  const recipeModes = options?.recipeModes ?? EMPTY_RECIPE_MODES
  // Delegate full match payload generation to the shared WASM adapter.
  return evaluateSingleItemWithWasm(rules, recipeModes, item, options)
}
