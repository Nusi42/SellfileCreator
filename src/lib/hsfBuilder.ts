/**
 * hsfBuilder.ts
 *
 * Core builder that turns a BuilderRecipe and SubstatTargetTable into concrete HSF
 * rules. Handles mainstat unrolling, substat combinations, roll-baseline math,
 * rarity schedules, substatTargets application, and per-substat roll bounds.
 */
import type { HsfRule } from './hsfTypes'
import type {
  BuilderRecipe,
  LegacyVisibilityFields,
  SellfileExportMode,
  Star,
  SubstatTargetTable,
} from './hsfBuilder/types'
export type {
  BuilderRecipe,
  LegacyVisibilityFields,
  SellfileExportMode,
  Star,
  SubstatRollTargetEntry,
  SubstatRollTargets,
  SubstatTargetTable,
} from './hsfBuilder/types'
export {
  clampTargetOverrideValue,
  engineAppliedTargetValue,
  minGearLineValueForVariant,
  normalizeLooseRollTargetEntry,
  normalizeRollTargetEntry,
  quantizeTargetValueForVariant,
  resolveRollTargetValue,
  targetEntriesEqual,
  targetValueResolutionForVariant,
  targetValueStepForVariant,
} from './hsfBuilder/targets'
import {
  compareVariants,
  anySelectedSlotSupportsMain,
  RarityCode,
  RankCode,
  LevelMilestone,
  LEVEL_MILESTONES,
  PREFERRED_STAT_ORDER,
} from './types'
import {
  AUTO_RARITY_MIN_ROLL_EVENTS_BY_CODE,
  SUBSTAT_ROLL_RANGES_BY_STAR as GENERATED_ROLL_RANGES,
} from './generated/domainConstants'
import { resolveAllowedSubstatsForSlotsAndMains } from './statCompatibility'
// Rank-5 factory target seed for the mode-damage substats.
import { ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE, ANOMALOUS_SUBSTAT_VARIANTS } from './anomalousAccessories'
import { splitArtifactSetSelections } from './gearSets/selection'
import { canEnableSubstatFlex, deriveRollBaselineMode, isLockedAggregateScopeActive, isMilestoneThresholdsActive } from './recipeNormalization'
import { variantToMain } from './hsfTypes'
import {
  buildHsfRulesRuntimeWithLoadedWasm,
  getAutoRarityAdditionLevelsForCodeWithLoadedWasm,
  getAutoRarityIncludesMythicalForCodeWithLoadedWasm,
  getAutoRarityRollLevelsForCodeWithLoadedWasm,
  prepareHsfBuilderRecipeWithLoadedWasm,
  resolveAutoRarityCodeForBuilderWithLoadedWasm,
} from './wasm/wasmRuleEngine'

export function coerceSellfileExportModeToken(value: unknown): SellfileExportMode | null {
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase()
    if (lower.length === 0) return null
    // Accept a friendly set of english toggles so legacy recipes continue to load.
    if (lower === 'active' || lower === 'enabled' || lower.startsWith('enable') || lower.startsWith('visible')) return 'active'
    if (lower === 'disabled' || lower === 'hidden' || lower.startsWith('disab') || lower.startsWith('hide') || lower.startsWith('mute')) return 'disabled'
    if (
      lower === 'separator'
      || lower === 'draft'
      || lower.startsWith('draft')
      || lower.startsWith('separator')
      || lower.startsWith('divider')
      || lower.startsWith('note')
    ) {
      return 'separator'
    }
  }
  return null
}

/** Resolve export mode from LegacyVisibilityFields (old SFC keys like visibility, sellfileMode, enabled). */
export function resolveExportModeField(source: LegacyVisibilityFields): SellfileExportMode {
  const direct = coerceSellfileExportModeToken(source.exportMode)
  if (direct) return direct
  const fromVisibility = coerceSellfileExportModeToken(source.visibility ?? source.SellfileVisibility)
  if (fromVisibility) return fromVisibility
  const fromMode = coerceSellfileExportModeToken(source.sellfileMode)
  if (fromMode) return fromMode
  if (source.enabled === false) return 'disabled'
  return 'active'
}

/** Produce a shallow copy without legacy export mode fields. */
export function normalizeExportModeFields<T extends Record<string, unknown>>(source: T): Omit<T, 'sellfileMode' | 'enabled' | 'visibility'> & { exportMode: SellfileExportMode } {
  const exportMode = resolveExportModeField(source as unknown as LegacyVisibilityFields)
  const {
    sellfileMode: _legacyMode,
    enabled: _legacyEnabled,
    visibility: _legacyVisibility,
    SellfileVisibility: _legacyReadableVisibility,
    ...rest
  } = source as Record<string, unknown>
  if ((rest.exportMode === exportMode) && !('sellfileMode' in source) && !('enabled' in source) && !('visibility' in source) && !('SellfileVisibility' in source)) {
    return rest as Omit<T, 'sellfileMode' | 'enabled' | 'visibility'> & { exportMode: SellfileExportMode }
  }
  return { ...rest, exportMode } as Omit<T, 'sellfileMode' | 'enabled' | 'visibility'> & { exportMode: SellfileExportMode }
}

export type BuildHsfRulesOptions = {
  /** Maximum number of rules to emit before aborting generation. */
  limit?: number
  /** Optional 1-based builder recipe reference for downstream HSF consumers. */
  recipeId?: number
}

export class RuleLimitReachedError extends Error {
  readonly limit: number

  constructor(limit: number) {
    super(`Rule emission limit (${limit}) reached`)
    this.name = 'RuleLimitReachedError'
    this.limit = limit
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

// Levels: 0/4/8/12/16 are milestone checks.
export const LEVELS = LEVEL_MILESTONES

// Auto-rarity lookup tables are generated from shared/domain-constants.json.
// Clamp unknown values into the supported 0..16 rarity-code domain.
const autoRarityCodeIndex = (rarityCode: number): number => {
  // Accept enum-like inputs that may arrive as strings/numbers.
  const numeric = Number(rarityCode)
  // Unknown/NaN values collapse to Any to keep lookup access safe.
  if (!Number.isFinite(numeric)) return RarityCode.Any
  // Preserve integer indexing semantics across both TS and Rust tables.
  const floored = Math.floor(numeric)
  // Clamp out-of-range values back to Any so sparse arrays are never accessed.
  if (floored < RarityCode.Any || floored > RarityCode.GTE_Legendary) return RarityCode.Any
  // Return a stable code index in the 0..16 domain.
  return floored
}

// Compute roll-event schedule for a given rarity at milestone levels
// Returns a set of levels where an existing substat is rolled (not added)
/** Levels where rarity increases grant a roll for the given rarity code. */
export function rollLevelsForRarityCode(rarityCode: RarityCode): Set<LevelMilestone> {
  // Delegate schedule decoding to Rust so TS does not duplicate bit-mask logic.
  const levels = getAutoRarityRollLevelsForCodeWithLoadedWasm(Number(rarityCode))
  // Keep the public API shape as Set<LevelMilestone> for existing call sites.
  return new Set<LevelMilestone>(levels as LevelMilestone[])
}

// Addition schedule: levels where a new substat is added (not rolled), per rarity
/**
 * Levels where a new substat is added for the given rarity code.
 * Used to derive presence-only constraints when the level window collapses to a single milestone.
 */
export function additionLevelsForRarityCode(rarityCode: RarityCode): Set<LevelMilestone> {
  // Delegate schedule decoding to Rust so TS does not duplicate bit-mask logic.
  const levels = getAutoRarityAdditionLevelsForCodeWithLoadedWasm(Number(rarityCode))
  // Keep the public API shape as Set<LevelMilestone> for existing call sites.
  return new Set<LevelMilestone>(levels as LevelMilestone[])
}

function clampRollRequirement(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(5, Math.floor(value)))
}

type AggregateMinContext = {
  recipe: BuilderRecipe
  selectedPoolV: readonly number[]
  requiredV: readonly number[]
  minTargetCount: number
  rarityCode?: number | null
}

type LockedMinContext = {
  recipe: BuilderRecipe
  lockedCount: number
}

function minRollEventsForSelection(rarityCode: RarityCode): number {
  // Normalize code before indexing the generated event-pressure table.
  const idx = autoRarityCodeIndex(rarityCode)
  // Default to zero events if generation ever omits the index unexpectedly.
  return AUTO_RARITY_MIN_ROLL_EVENTS_BY_CODE[idx] ?? 0
}

function deriveGlobalMinRolls(context: AggregateMinContext): number {
  const { recipe, selectedPoolV, requiredV, minTargetCount, rarityCode } = context
  if (recipe.autoMinRequiredRolls === false) {
    return clampRollRequirement(recipe.minRequiredRolls)
  }
  if (selectedPoolV.length === 0) return 0
  const lockedScope = isLockedAggregateScopeActive(recipe, { lockedCountOverride: requiredV.length })
  let base = lockedScope ? requiredV.length : minTargetCount
  if (rarityCode != null) {
    base = Math.min(base, minRollEventsForSelection(rarityCode))
  }
  if (base <= 1) return 0
  return clampRollRequirement(base)
}

function deriveLockedMinRolls(context: LockedMinContext): number {
  const { recipe, lockedCount } = context
  if (lockedCount === 0) return 0
  return clampRollRequirement(recipe.lockedMinRequiredRolls)
}

// Whether the given rarity code includes Mythical items
/** True if rarity selection includes Mythical, impacting pre-roll logic. */
export function rarityIncludesMythical(rarityCode: RarityCode): boolean {
  // Delegate mythical-membership lookup to Rust so TS does not duplicate tables.
  return getAutoRarityIncludesMythicalForCodeWithLoadedWasm(Number(rarityCode))
}

/**
 * Resolve Auto rarity selection to a concrete HSF rarity code for a given recipe.
 * Mirrors the internal logic used by the builder before rule generation so UI
 * summaries can display the exact rarity the preview table will show.
 */
export function resolveAutoRarityCode(recipe: BuilderRecipe): RarityCode {
  // Apply slot/main constraints before Auto rarity so impossible substats don't tighten rarity.
  const allowedSubstats = resolveAllowedSubstatsForSlotsAndMains({
    slots: recipe.artifactTypes ?? [],
    mainStats: recipe.mainStatsV ?? [],
  })
  // Delegate selection/fixed filtering + bound compaction + rarity resolve to Rust.
  const resolved = resolveAutoRarityCodeForBuilderWithLoadedWasm({
    autoRaritySupplementsThreshold: (recipe.rarityMode === 'auto')
      ? (recipe.autoRaritySupplementsThreshold ?? null)
      : null,
    ...(typeof recipe.autoMinRequiredRolls === 'boolean'
      ? { autoMinRequiredRolls: recipe.autoMinRequiredRolls }
      : {}),
    ...(typeof recipe.minRequiredRolls === 'number'
      ? { minRequiredRolls: recipe.minRequiredRolls }
      : {}),
    ...(typeof recipe.lockedMinRequiredRolls === 'number'
      ? { lockedMinRequiredRolls: recipe.lockedMinRequiredRolls }
      : {}),
    ...(typeof recipe.minCount === 'number' ? { minCount: recipe.minCount } : {}),
    ...(typeof recipe.earlyKeepMode === 'string' ? { earlyKeepMode: recipe.earlyKeepMode } : {}),
    substatsV: recipe.substatsV ?? [],
    fixedSubstatsV: recipe.fixedSubstatsV ?? [],
    substatRollBoundsV: recipe.substatRollBoundsV,
    allowedSubstats,
  })
  return resolved as RarityCode
}

// JUDGED(anomalous per-rank values): factory targets for the mode-damage substats.
// 1.25% is the OBSERVED rank-5 base (one line, zero rolls) and the only value we have;
// the other five ranks have never been seen. Until they are, 1.25 floors EVERY rank
// rather than leaving those tiers blank — a missing entry reads as "no target at all",
// a weaker default than the one number we actually know. Replace with a per-rank table
// when the game data lands. Mirrored by factory_minima_for_star in
// wasm/rule_engine_core/src/recipe_builder.rs.
const ANOMALOUS_FACTORY_MINIMA: Record<number, number> = Object.fromEntries(
  ANOMALOUS_SUBSTAT_VARIANTS.map((variant) => [variant, ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE]),
)

// Derive factory-default minima from roll ranges (min per roll = factory default for a fresh substat).
// Each star tier maps stat variant → lowest natural roll for that tier, plus the flat
// anomalous floor above (they carry no generated roll range of their own yet).
const FACTORY_MINIMA_BY_STAR: Record<number, Record<number, number>> = Object.fromEntries(
  Object.entries(GENERATED_ROLL_RANGES).map(([star, variantMap]) => [
    star,
    {
      ...Object.fromEntries(Object.entries(variantMap).map(([variant, range]) => [variant, range.min])),
      ...ANOMALOUS_FACTORY_MINIMA,
    },
  ])
)

// Re-export individual star tiers so existing callers (exported API) remain stable.
// Non-null assertion: keys 1..6 are guaranteed present by the generator.
export const BASE_MIN_4: Record<number, number> = FACTORY_MINIMA_BY_STAR[4]!
export const BASE_MIN_3: Record<number, number> = FACTORY_MINIMA_BY_STAR[3]!
export const BASE_MIN_2: Record<number, number> = FACTORY_MINIMA_BY_STAR[2]!
export const BASE_MIN_1: Record<number, number> = FACTORY_MINIMA_BY_STAR[1]!

/** Default Substat Target table initialized from generated factory minima. */
export function defaultSubstatTargets(): SubstatTargetTable {
  // Spread-copy each tier so callers cannot mutate the shared derived table.
  return {
    one:   { ...FACTORY_MINIMA_BY_STAR[1] },
    two:   { ...FACTORY_MINIMA_BY_STAR[2] },
    three: { ...FACTORY_MINIMA_BY_STAR[3] },
    four:  { ...FACTORY_MINIMA_BY_STAR[4] },
    five:  { ...FACTORY_MINIMA_BY_STAR[5] },
    six:   { ...FACTORY_MINIMA_BY_STAR[6] },
    anyRankDefaultsTo: 6,
  }
}

/** Lookup base Substat Target for a StatVariant at a given star bucket. */
/**
 * THE resolver for "what target applies to this stat at this rank" — the single
 * definition of what a MISSING table entry means.
 *
 * A missing key is not a zero: SFC documents store only the ranks/stats they
 * knew about, so a document saved before a stat existed simply has no entry for
 * it, and answering 0 would emit a vacuous `>= 0` matching any gear that carries
 * the line at all. Missing therefore resolves to the factory minimum, the same
 * value a freshly-created table would hold. A target the user deliberately
 * CLEARED is present with value 0 and stays 0 — the fallback never overrides an
 * explicit choice. Mirrored by the `or_else` on `factory_base_by_variant_for_star`
 * in prepare_hsf_builder_recipe (wasm/rule_engine_core/src/hsf_builder_execution.rs).
 */
export function baseMinForStarV(variant: number, star: Star, substatTargets: SubstatTargetTable): number {
  const bucket = (
    star === 6 ? substatTargets.six
    : star === 5 ? substatTargets.five
    : star === 4 ? substatTargets.four
    : star === 3 ? substatTargets.three
    : star === 2 ? substatTargets.two
    : substatTargets.one
  )
  const stored = bucket[variant]
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored
  return FACTORY_MINIMA_BY_STAR[star]?.[variant] ?? 0
}

/**
 * True when a stored target equals the app's factory default for that stat and
 * rank — i.e. the user never moved it off our own value.
 *
 * SFC export omits these entries (substatTargetsToReadable), so a document
 * records DEVIATIONS only. That keeps saved files tracking the app's defaults as
 * they improve, which matters while some of them are judged rather than observed
 * — a rank we later learn the real value for reaches existing documents instead
 * of staying frozen. Loading re-seeds from the current defaults
 * (normalizeSubstatTargets), so the round-trip is lossless and the in-memory
 * table stays dense.
 *
 * Note the deliberate approximation: "equals the default" stands in for "the
 * user never touched it", so a target typed to exactly the default value is
 * re-interpreted if that default later changes. That is the intended behaviour
 * — it is the same mechanism that delivers the correction.
 */
export function isFactoryDefaultTargetValue(variant: number, star: Star, value: number): boolean {
  const factory = FACTORY_MINIMA_BY_STAR[star]?.[variant]
  return factory != null && factory === value
}

/** Map a rank code (0..16) to an effective star bucket used for Substat Targets. */
export function starForRankCode(rankCode: number, anyFallback: Star): Star {
  // 1..6: exact
  if (rankCode >= RankCode.One && rankCode <= RankCode.Six) return rankCode as Star
  // >=1..>=4 -> treat as 4-star bucket, >=5 -> 5-star, >=6 not available
  if (rankCode >= RankCode.GTE_One && rankCode <= RankCode.GTE_Four) return 4
  if (rankCode === RankCode.GTE_Five) return 5
  // <=2..<=4 -> 4-star bucket; <=5 -> 5; <=6 -> 6
  if (rankCode >= RankCode.LTE_Two && rankCode <= RankCode.LTE_Four) return 4
  if (rankCode === RankCode.LTE_Five) return 5
  if (rankCode === RankCode.LTE_Six) return 6
  // 0 (Any) -> 6-star conservative
  return anyFallback
}

/** Build HSF rules for a single recipe against the provided Substat Target table. */
/**
 * Build HSF rules from a single BuilderRecipe and substatTargets table.
 * Steps:
 * - Expand main stat selections into separate rule branches (or Any if empty)
 * - Generate substat combinations honoring fixed substats and minCount
 * - For each level milestone, apply roll semantics (strict/potential)
 * - Apply per-substat roll bounds (min/max/any) and filter invalid rows
 */
export function buildHsfRules(
  recipe: BuilderRecipe,
  substatTargets: SubstatTargetTable = defaultSubstatTargets(),
  options?: BuildHsfRulesOptions,
): HsfRule[] {
  const exportMode: SellfileExportMode = recipe.exportMode ?? 'active'
  if (exportMode === 'separator') return []
  const rankCode = recipe.rankCode
  const factionCode = Number(recipe.factionCode ?? 0)
  const emissionLimit = (options?.limit != null && Number.isFinite(options.limit) && options.limit > 0)
    ? Math.max(1, Math.floor(options.limit))
    : null
  // Propagate recipe metadata so exported HSF rows retain their builder lineage.
  const recipeId = (options && typeof options.recipeId === 'number' && Number.isFinite(options.recipeId) && options.recipeId > 0)
    ? Math.floor(options.recipeId)
    : null

  // Apply slot/main constraints before preparing substat permutations in wasm.
  const allowedSubstats = resolveAllowedSubstatsForSlotsAndMains({
    slots: recipe.artifactTypes ?? [],
    mainStats: recipe.mainStatsV ?? [],
  })
  // Convert the HSF rank code into the substat target star bucket so thresholds stay coherent.
  const star = starForRankCode(rankCode, substatTargets.anyRankDefaultsTo ?? 6)
  // Build the star-resolved target map once and let rust normalize variant pools.
  const substatTargetByVariant = ((): Record<number, number> => {
    if (star === 6) return substatTargets.six
    if (star === 5) return substatTargets.five
    if (star === 4) return substatTargets.four
    if (star === 3) return substatTargets.three
    if (star === 2) return substatTargets.two
    return substatTargets.one
  })()
  // Preserve factory minima in TS constants and pass only the active star table.
  const factoryBaseByVariantForStar = FACTORY_MINIMA_BY_STAR[star] ?? {}
  const flexEligible = canEnableSubstatFlex(recipe)
  // Delegate selected/fixed pool normalization + base/target map prep to wasm.
  const prep = prepareHsfBuilderRecipeWithLoadedWasm({
    minCount: recipe.minCount,
    autoSubstatFlex: recipe.autoSubstatFlex === true,
    flexEligible,
    substatsV: recipe.substatsV ?? [],
    fixedSubstatsV: recipe.fixedSubstatsV ?? [],
    allowedSubstats,
    substatRollBoundsV: recipe.substatRollBoundsV ?? {},
    substatRollTargetsV: recipe.substatRollTargetsV ?? {},
    substatTargetByVariant,
    factoryBaseByVariantForStar,
    variantPriority: PREFERRED_STAT_ORDER,
  })
  // Split "not" substats from the combination pool. Not-substats carry Condition "¬"
  // and are appended to every emitted rule; they must not participate in positive combos.
  const boundsForNotSplit = (recipe.substatRollBoundsV ?? {}) as Record<number, { not?: boolean }>
  const isNotVariant = (v: number): boolean => boundsForNotSplit[v]?.not === true
  const selectedPoolV = prep.selectedPoolV.filter(v => !isNotVariant(v))
  const notSubstatsV = prep.selectedPoolV.filter(v => isNotVariant(v))
  // If the user explicitly selected substats but all are invalid for the slot/main,
  // emit no rules instead of falling back to presence-only behavior.
  if (prep.hadRequestedSubstats && selectedPoolV.length === 0 && notSubstatsV.length === 0) return []
  // "Not" substats occupy HSF slots that would otherwise be wildcards; the effective
  // positive-substat budget per rule is (4 - not_count). Reject impossible combinations
  // so they surface as "0 rules" rather than silently dropping "not" constraints.
  const availablePositiveSlots = 4 - notSubstatsV.length
  if (availablePositiveSlots < 0) return []
  if (prep.hadRequestedSubstats && selectedPoolV.length > 0 && prep.minTargetCount > availablePositiveSlots) return []
  const requiredV = prep.requiredV.filter(v => !isNotVariant(v))
  const optionalPoolV = prep.optionalPoolV.filter(v => !isNotVariant(v))
  const lockedCount = requiredV.length
  // autoMinCount means "require all positive substats." Guard against a stale stored
  // minCount=0 when the recipe was mutated (bounds cycled to/from "not") without the
  // minCount being resynced at the time — use the actual positive pool size instead.
  const minTargetCount = (recipe.autoMinCount === true && selectedPoolV.length > 0)
    ? Math.min(selectedPoolV.length, availablePositiveSlots)
    : prep.minTargetCount
  // Cap maxTargetCount so flex combos don't consume slots needed by "not" substats.
  const maxTargetCount = Math.min(prep.maxTargetCount, availablePositiveSlots)
  // Flex mode only activates when both the recipe allows it and the toggle is on.
  const flexActive = recipe.autoSubstatFlex === true && flexEligible
  // Track whether any selected substat explicitly demands rolls.
  const hasPerStatMin = prep.hasPerStatMin
  const currentBaseByVariantForWasm = prep.currentBaseByVariant as Record<number, number>
  const factoryBaseByVariantForWasm = prep.factoryBaseByVariant as Record<number, number | null>
  const targetBaseOverrideByVariantForWasm = prep.targetBaseOverrideByVariant as Record<number, number | null>

  // Resolve Auto rarity to a concrete rarity code before rule generation.
  // Use the shared resolver to keep UI and builder behavior identical.
  const rarityCode = (recipe.rarityMode === 'auto') ? resolveAutoRarityCode(recipe) : recipe.rarityCode

  // Resolve set selections into numeric IDs for HSF export.
  const resolvedSets = splitArtifactSetSelections(recipe.artifactSets)
  // Export mode is normalized at entry, so runtime payload only needs a bool.
  const useFlag = exportMode !== 'disabled'

  // Determine mainstat choices: [] means Any; otherwise list of variants to unroll
  // Canonicalize mainstat order as well to avoid click-order dependence.
  const mainChoicesV: number[] = (Array.isArray(recipe.mainStatsV) && recipe.mainStatsV.length > 0)
    ? recipe.mainStatsV.map(Number).sort(compareVariants)
    : []

  const baseline: 'afterStart' | 'upToLevel' = deriveRollBaselineMode(recipe)
  const earlyMode: 'early' | 'late' = (recipe.earlyKeepMode === 'late' && isMilestoneThresholdsActive(recipe)) ? 'late' : 'early'
  const effectiveStart: LevelMilestone = 0
  // Level window: rely on normalized min/max window.
  const deriveLevelWindow = (): { min: LevelMilestone; max: LevelMilestone } => {
    // User sliders only allow milestone values, so silently clamp anything else.
    const toLevel = (v: unknown): LevelMilestone | null => {
      if (v === 0 || v === 4 || v === 8 || v === 12 || v === 16) return v as LevelMilestone
      return null
    }
    const minCandidate = toLevel(recipe.minLevel) ?? 0
    const maxCandidate = toLevel(recipe.maxLevel) ?? 16
    if (minCandidate <= maxCandidate) return { min: minCandidate, max: maxCandidate }
    return { min: maxCandidate, max: minCandidate }
  }
  const levelWindow = deriveLevelWindow()

  // Aggregate roll requirements split into global (selected stats) and locked-only scopes.
  const globalMinValue = deriveGlobalMinRolls({ recipe, selectedPoolV, requiredV, minTargetCount, rarityCode })
  const lockedMinValue = deriveLockedMinRolls({ recipe, lockedCount })
  const aggregateMinValue = Math.max(globalMinValue, lockedMinValue)
  const globalMinActive = globalMinValue > 0
  const lockedMinActive = lockedMinValue > 0
  const aggregateMinActive = aggregateMinValue > 0
  const manualMinZero = recipe.autoMinRequiredRolls === false && clampRollRequirement(recipe.minRequiredRolls ?? 0) === 0
  // Manual zero with no per-stat mins means "no roll requirements" regardless of rarity schedule.
  const suppressRollThresholds = manualMinZero && !hasPerStatMin && lockedMinValue === 0
  // When only locked mins are active, the aggregate target narrows to the locked subset only.
  const aggregateTargetsLocked = (!globalMinActive)
    && lockedMinActive
    && isLockedAggregateScopeActive(recipe, { lockedCountOverride: requiredV.length })

  // Build slot-compatible mains once, then let wasm own rule orchestration.
  const mainChoicesForWasm = mainChoicesV
    .filter((mnV) => anySelectedSlotSupportsMain(recipe.artifactTypes, mnV))
    .map((mnV) => variantToMain(mnV))
    .map((main) => ({ id: main.id, f: main.f ?? 1 }))
  // One wasm call now handles preflight, branch planning, and row emission.
  const builderRuntime = buildHsfRulesRuntimeWithLoadedWasm({
    ...(recipeId !== null ? { recipeId } : {}),
    ...(recipe.keep !== undefined ? { keep: recipe.keep } : {}),
    useFlag,
    artifactSetIds: resolvedSets.included,
    artifactTypeIds: recipe.artifactTypes ?? [],
    rankCode: rankCode,
    rarityCode,
    factionCode: Number(factionCode ?? 0),
    mainChoices: mainChoicesForWasm,
    emitAnyMainWhenNoChoices: mainChoicesV.length === 0,
    baseline,
    effectiveStart,
    suppressRollThresholds,
    levelWindowMin: levelWindow.min,
    levelWindowMax: levelWindow.max,
    requiredV,
    optionalPoolV,
    selectedPoolV,
    notSubstatsV,
    flexActive,
    aggregateMinActive,
    minTargetCount,
    maxTargetCount,
    aggregateTargetsLocked,
    aggregateMinValue,
    lockedMinActive,
    lockedMinValue,
    substatRollBoundsV: recipe.substatRollBoundsV ?? {},
    targetEntriesByVariant: prep.targetEntriesByVariant,
    currentBaseByVariant: currentBaseByVariantForWasm,
    factoryBaseByVariant: factoryBaseByVariantForWasm,
    targetBaseOverrideByVariant: targetBaseOverrideByVariantForWasm,
    earlyMode,
    ...(typeof recipe.rarityMode === 'string' ? { rarityMode: recipe.rarityMode } : {}),
    ...(typeof recipe.earlyKeepMode === 'string' ? { earlyKeepMode: recipe.earlyKeepMode } : {}),
    ...(typeof recipe.autoRaritySupplementsThreshold === 'string'
      ? { autoRaritySupplementsThreshold: recipe.autoRaritySupplementsThreshold }
      : {}),
    ...(emissionLimit != null ? { emissionLimit } : {}),
  })
  // Keep existing limit exception behavior so merge.ts can short-circuit safely.
  if (builderRuntime.limitHit && emissionLimit !== null) {
    throw new RuleLimitReachedError(emissionLimit)
  }
  return builderRuntime.rules
}

// Expose available stat options for UI — variants supersede previous helpers
