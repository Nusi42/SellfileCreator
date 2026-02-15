/**
 * hsfBuilder.ts
 *
 * Core builder that turns a BuilderConfig and SubstatTargetTable into concrete HSF
 * rules. Handles mainstat unrolling, substat combinations, roll-baseline math,
 * rarity schedules, substatTargets application, and per-substat roll bounds.
 */
import type { HsfRule } from './hsfTypes'
import type {
  BuilderConfig,
  LegacyVisibilityFields,
  SellfileExportMode,
  Star,
  SubstatRollTargetEntry,
  SubstatTargetTable,
} from './hsfBuilder/types'
import { normalizeRollTargetEntry } from './hsfBuilder/targets'
export type {
  BuilderConfig,
  LegacyVisibilityFields,
  SellfileExportMode,
  SellfileMode,
  Star,
  SubstatRollTargetEntry,
  SubstatRollTargets,
  SubstatTargetTable,
} from './hsfBuilder/types'
export {
  clampTargetOverrideValue,
  normalizeLooseRollTargetEntry,
  normalizeRollTargetEntry,
} from './hsfBuilder/targets'
import {
  StatVariant,
  StatId,
  compareArtifactSets,
  compareArtifactTypes,
  compareVariants,
  anySelectedSlotSupportsMain,
  LEVEL_ANY_SENTINEL,
  RarityCode,
  RankCode,
  LevelMilestone,
  LEVEL_MILESTONES,
} from './types'
import {
  AUTO_RARITY_ADDITION_MASK_BY_CODE,
  AUTO_RARITY_INCLUDES_MYTHICAL_BY_CODE,
  AUTO_RARITY_MIN_ROLL_EVENTS_BY_CODE,
  AUTO_RARITY_ROLL_MASK_BY_CODE,
} from './generated/domainConstants'
import { resolveAllowedSubstatsForSlotsAndMains } from './statCompatibility'
import { splitArtifactSetSelections } from './gearSets/selection'
import { canEnableSubstatFlex, deriveRollBaselineMode, isLockedAggregateScopeActive, isMilestoneThresholdsActive } from './configNormalization'
import { variantToMain } from './hsfTypes'
import {
  buildHsfPreflightFlagsWithLoadedWasm,
  buildHsfPresenceOnlyRulesWithLoadedWasm,
  buildHsfRarityBranchesWithLoadedWasm,
  executeHsfBuilderRuntimeWithLoadedWasm,
  finalizeBuilderRulesWithLoadedWasm,
  resolveAutoRarityCodeForBuilderWithLoadedWasm,
} from './wasm/wasmRuleEngine'

export function coerceSellfileExportModeToken(value: unknown): SellfileExportMode | null {
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase()
    if (lower.length === 0) return null
    // Accept a friendly set of english toggles so legacy configs continue to load.
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

/** Resolve export mode from legacy SellfileMode/enabled fields. */
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
  /** Optional 1-based builder config reference for downstream HSF consumers. */
  configId?: number
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

// Decode 4-bit milestone masks into reusable Set instances.
// Bit positions map to [4, 8, 12, 16] respectively.
const LEVEL_MASK_TO_SET: Record<number, Set<LevelMilestone>> = {
  0: new Set<LevelMilestone>([]),
  1: new Set<LevelMilestone>([4]),
  2: new Set<LevelMilestone>([8]),
  3: new Set<LevelMilestone>([4, 8]),
  4: new Set<LevelMilestone>([12]),
  5: new Set<LevelMilestone>([4, 12]),
  6: new Set<LevelMilestone>([8, 12]),
  7: new Set<LevelMilestone>([4, 8, 12]),
  8: new Set<LevelMilestone>([16]),
  9: new Set<LevelMilestone>([4, 16]),
  10: new Set<LevelMilestone>([8, 16]),
  11: new Set<LevelMilestone>([4, 8, 16]),
  12: new Set<LevelMilestone>([12, 16]),
  13: new Set<LevelMilestone>([4, 12, 16]),
  14: new Set<LevelMilestone>([8, 12, 16]),
  15: new Set<LevelMilestone>([4, 8, 12, 16]),
}


// Compute roll-event schedule for a given rarity at milestone levels
// Returns a set of levels where an existing substat is rolled (not added)
/** Levels where rarity increases grant a roll for the given rarity code. */
export function rollLevelsForRarityCode(rarityCode: RarityCode): Set<LevelMilestone> {
  // Shared table keeps TS and Rust schedule semantics identical.
  const idx = autoRarityCodeIndex(rarityCode)
  // Fallback to Any schedule if the generated entry is unexpectedly missing.
  const mask = AUTO_RARITY_ROLL_MASK_BY_CODE[idx] ?? AUTO_RARITY_ROLL_MASK_BY_CODE[RarityCode.Any]
  // Translate mask bits into the reusable milestone set instance.
  return LEVEL_MASK_TO_SET[mask] ?? LEVEL_MASK_TO_SET[0]!
}

// Addition schedule: levels where a new substat is added (not rolled), per rarity
/**
 * Levels where a new substat is added for the given rarity code.
 * Used to derive presence-only constraints when the level window collapses to a single milestone.
 */
export function additionLevelsForRarityCode(rarityCode: RarityCode): Set<LevelMilestone> {
  // Shared table keeps TS and Rust schedule semantics identical.
  const idx = autoRarityCodeIndex(rarityCode)
  // Fallback to Any additions when a table index is unexpectedly absent.
  const mask = AUTO_RARITY_ADDITION_MASK_BY_CODE[idx] ?? AUTO_RARITY_ADDITION_MASK_BY_CODE[RarityCode.Any]
  // Translate mask bits into the reusable milestone set instance.
  return LEVEL_MASK_TO_SET[mask] ?? LEVEL_MASK_TO_SET[0]!
}

function clampRollRequirement(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(5, Math.floor(value)))
}

type AggregateMinContext = {
  cfg: BuilderConfig
  selectedPoolV: readonly number[]
  requiredV: readonly number[]
  minTargetCount: number
  rarityCode?: number | null
}

type LockedMinContext = {
  cfg: BuilderConfig
  lockedCount: number
}

function minRollEventsForSelection(rarityCode: RarityCode): number {
  // Normalize code before indexing the generated event-pressure table.
  const idx = autoRarityCodeIndex(rarityCode)
  // Default to zero events if generation ever omits the index unexpectedly.
  return AUTO_RARITY_MIN_ROLL_EVENTS_BY_CODE[idx] ?? 0
}

function deriveGlobalMinRolls(context: AggregateMinContext): number {
  const { cfg, selectedPoolV, requiredV, minTargetCount, rarityCode } = context
  if (cfg.autoMinRequiredRolls === false) {
    return clampRollRequirement(cfg.minRequiredRolls)
  }
  if (selectedPoolV.length === 0) return 0
  const lockedScope = isLockedAggregateScopeActive(cfg, { lockedCountOverride: requiredV.length })
  let base = lockedScope ? requiredV.length : minTargetCount
  if (rarityCode != null) {
    base = Math.min(base, minRollEventsForSelection(rarityCode))
  }
  if (base <= 1) return 0
  return clampRollRequirement(base)
}

function deriveLockedMinRolls(context: LockedMinContext): number {
  const { cfg, lockedCount } = context
  if (lockedCount === 0) return 0
  return clampRollRequirement(cfg.lockedMinRequiredRolls)
}

// Whether the given rarity code includes Mythical items
/** True if rarity selection includes Mythical, impacting pre-roll logic. */
export function rarityIncludesMythical(rarityCode: RarityCode): boolean {
  // Normalize code before indexing the generated mythical-membership table.
  const idx = autoRarityCodeIndex(rarityCode)
  // Treat missing entries as false to avoid accidental mythical assumptions.
  return AUTO_RARITY_INCLUDES_MYTHICAL_BY_CODE[idx] === true
}

/**
 * Resolve Auto rarity selection to a concrete HSF rarity code for a given config.
 * Mirrors the internal logic used by the builder before rule generation so UI
 * summaries can display the exact rarity the preview table will show.
 */
export function resolveAutoRarityCode(cfg: BuilderConfig): RarityCode {
  // Apply slot/main constraints before Auto rarity so impossible substats don't tighten rarity.
  const allowedSubstats = resolveAllowedSubstatsForSlotsAndMains({
    slots: cfg.artifactTypes ?? [],
    mainStats: cfg.mainStatsV ?? [],
  })
  // Delegate selection/fixed filtering + bound compaction + rarity resolve to Rust.
  const resolved = resolveAutoRarityCodeForBuilderWithLoadedWasm({
    autoRaritySupplementsThreshold: (cfg.rarityMode === 'auto')
      ? (cfg.autoRaritySupplementsThreshold ?? null)
      : null,
    ...(typeof cfg.autoMinRequiredRolls === 'boolean'
      ? { autoMinRequiredRolls: cfg.autoMinRequiredRolls }
      : {}),
    ...(typeof cfg.minRequiredRolls === 'number'
      ? { minRequiredRolls: cfg.minRequiredRolls }
      : {}),
    ...(typeof cfg.lockedMinRequiredRolls === 'number'
      ? { lockedMinRequiredRolls: cfg.lockedMinRequiredRolls }
      : {}),
    ...(typeof cfg.minCount === 'number' ? { minCount: cfg.minCount } : {}),
    ...(typeof cfg.earlyKeepMode === 'string' ? { earlyKeepMode: cfg.earlyKeepMode } : {}),
    substatsV: cfg.substatsV ?? [],
    fixedSubstatsV: cfg.fixedSubstatsV ?? [],
    substatRollBoundsV: cfg.substatRollBoundsV,
    allowedSubstats,
  })
  return resolved as RarityCode
}

// Public API: build rules according to config with substat permutations and level chain
// Base substatTargets per star and stat (IDs per types.ts). Units use integers (percent as points).
// Factory-default minima: these encode the lowest roll each substat can spawn with
// in-game. Collapse guards rely on these staying in sync with RSL Helper samples.
const BASE_MIN_6: Record<number, number> = {
  [StatVariant.HP_FLAT]: 200, // HP:    200..565
  [StatVariant.HP]: 5,        // HP%:   5..7
  [StatVariant.ATK_FLAT]: 15, // ATK:   15..30
  [StatVariant.ATK]: 5,       // ATK%:  5..7
  [StatVariant.DEF_FLAT]: 15, // DEF:   15..30
  [StatVariant.DEF]: 5,       // DEF%:  5..7
  [StatVariant.SPD]: 5,       // SPD:   5..6
  [StatVariant.RES]: 9,       // RES:   9..12
  [StatVariant.ACC]: 9,       // ACC:   9..12
  [StatVariant.CR]: 5,        // CR%:   5..7
  [StatVariant.CDMG]: 5,      // CDMG%: 5..7
}

const BASE_MIN_5: Record<number, number> = {
  [StatVariant.HP_FLAT]: 136, // HP:    136..450
  [StatVariant.HP]: 4,        // HP%:   4..6
  [StatVariant.ATK_FLAT]: 12, // ATK    12..23
  [StatVariant.ATK]: 4,       // ATK%   4..6
  [StatVariant.DEF_FLAT]: 12, // DEF:   12..23
  [StatVariant.DEF]: 4,       // DEF%   4..6
  [StatVariant.SPD]: 4,       // SPD    4..5
  [StatVariant.RES]: 8,       // RES    8..11
  [StatVariant.ACC]: 8,       // ACC    8..11
  [StatVariant.CR]: 4,        // CR%    4..6
  [StatVariant.CDMG]: 4,      // CDMG%  4..6
}

// Explicit literals for lower-star substatTargets (derived from 5-star by -1 per tier)
export const BASE_MIN_4: Record<number, number> = {
  [StatVariant.HP_FLAT]: 120, // HP     // guessed
  [StatVariant.HP]: 3,        // HP%
  [StatVariant.ATK_FLAT]: 10, // ATK    // guessed
  [StatVariant.ATK]: 3,       // ATK%
  [StatVariant.DEF_FLAT]: 10, // DEF    // guessed
  [StatVariant.DEF]: 3,       // DEF%
  [StatVariant.SPD]: 3,       // SPD
  [StatVariant.RES]: 7,       // RES
  [StatVariant.ACC]: 7,       // ACC
  [StatVariant.CR]: 3,        // CR%
  [StatVariant.CDMG]: 3,      // CDMG%
}

export const BASE_MIN_3: Record<number, number> = {
  [StatVariant.HP_FLAT]: 110, // HP     // guessed
  [StatVariant.HP]: 2,        // HP%
  [StatVariant.ATK_FLAT]: 9,  // ATK    // guessed
  [StatVariant.ATK]: 2,       // ATK%
  [StatVariant.DEF_FLAT]: 9,  // DEF    // guessed
  [StatVariant.DEF]: 2,       // DEF%
  [StatVariant.SPD]: 2,       // SPD
  [StatVariant.RES]: 6,       // RES
  [StatVariant.ACC]: 6,       // ACC
  [StatVariant.CR]: 2,        // CR%
  [StatVariant.CDMG]: 2,      // CDMG%
}

export const BASE_MIN_2: Record<number, number> = {
  [StatVariant.HP_FLAT]: 100,  // HP    // guessed
  [StatVariant.HP]: 1,         // HP%
  [StatVariant.ATK_FLAT]: 8,   // ATK   // guessed
  [StatVariant.ATK]: 1,        // ATK%
  [StatVariant.DEF_FLAT]: 8,   // DEF   // guessed
  [StatVariant.DEF]: 1,        // DEF%
  [StatVariant.SPD]: 1,        // SPD
  [StatVariant.RES]: 5,        // RES
  [StatVariant.ACC]: 5,        // ACC
  [StatVariant.CR]: 1,         // CR%
  [StatVariant.CDMG]: 1,       // CDMG%
}

export const BASE_MIN_1: Record<number, number> = {
  [StatVariant.HP_FLAT]: 90,   // HP    // guessed
  [StatVariant.HP]: 1,         // HP%
  [StatVariant.ATK_FLAT]: 7,   // ATK   // guessed
  [StatVariant.ATK]: 1,        // ATK%
  [StatVariant.DEF_FLAT]: 7,   // DEF   // guessed
  [StatVariant.DEF]: 1,        // DEF%
  [StatVariant.SPD]: 1,        // SPD
  [StatVariant.RES]: 4,        // RES
  [StatVariant.ACC]: 4,        // ACC
  [StatVariant.CR]: 1,         // CR%
  [StatVariant.CDMG]: 1,       // CDMG%
}

const FACTORY_MINIMA_BY_STAR: Record<Star, Record<number, number>> = {
  1: BASE_MIN_1,
  2: BASE_MIN_2,
  3: BASE_MIN_3,
  4: BASE_MIN_4,
  5: BASE_MIN_5,
  6: BASE_MIN_6,
}

const factoryBaseMinForStar = (variant: number, star: Star): number | null => {
  const table = FACTORY_MINIMA_BY_STAR[star]
  if (!table) return null
  const value = table[variant]
  return typeof value === 'number' ? value : null
}

/** Default Substat Target table initialized with zeroes for all stars. */
export function defaultSubstatTargets(): SubstatTargetTable {
  return {
    one: { ...BASE_MIN_1 },
    two: { ...BASE_MIN_2 },
    three: { ...BASE_MIN_3 },
    four: { ...BASE_MIN_4 },
    five: { ...BASE_MIN_5 },
    six: { ...BASE_MIN_6 },
    anyRankDefaultsTo: 6,
  }
}

/** Lookup base Substat Target for a StatVariant at a given star bucket. */
export function baseMinForStarV(variant: number, star: Star, substatTargets: SubstatTargetTable): number {
  if (star === 6) return substatTargets.six[variant] ?? 0
  if (star === 5) return substatTargets.five[variant] ?? 0
  if (star === 4) return substatTargets.four[variant] ?? 0
  if (star === 3) return substatTargets.three[variant] ?? 0
  if (star === 2) return substatTargets.two[variant] ?? 0
  return substatTargets.one[variant] ?? 0
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

/** Build HSF rules for a single config against the provided Substat Target table. */
/**
 * Build HSF rules from a single BuilderConfig and substatTargets table.
 * Steps:
 * - Expand main stat selections into separate rule branches (or Any if empty)
 * - Generate substat combinations honoring fixed substats and minCount
 * - For each level milestone, apply roll semantics (strict/potential)
 * - Apply per-substat roll bounds (min/max/any) and filter invalid rows
 */
export function buildHsfRules(
  cfg: BuilderConfig,
  substatTargets: SubstatTargetTable = defaultSubstatTargets(),
  options?: BuildHsfRulesOptions,
): HsfRule[] {
  const exportMode: SellfileExportMode = cfg.exportMode ?? 'active'
  if (exportMode === 'separator') return []
  const rankCode = cfg.rankCode
  const factionCode = Number(cfg.factionCode ?? 0)
  const emissionLimit = (options?.limit != null && Number.isFinite(options.limit) && options.limit > 0)
    ? Math.max(1, Math.floor(options.limit))
    : null
  // Track whether the user explicitly asked for substat filtering.
  const hadRequestedSubstats = (() => {
    // Any selected or locked substat counts as explicit intent.
    if (Array.isArray(cfg.substatsV) && cfg.substatsV.length > 0) return true
    if (Array.isArray(cfg.fixedSubstatsV) && cfg.fixedSubstatsV.length > 0) return true
    // Bounds without explicit selection still represent intent (legacy/imported cases).
    const bounds = cfg.substatRollBoundsV
    return bounds != null && Object.keys(bounds).length > 0
  })()
  // Propagate config metadata so exported HSF rows retain their builder lineage.
  const configId = (options && typeof options.configId === 'number' && Number.isFinite(options.configId) && options.configId > 0)
    ? Math.floor(options.configId)
    : null

  // Apply slot/main constraints before building substat permutations.
  const allowedSubstats = resolveAllowedSubstatsForSlotsAndMains({
    slots: cfg.artifactTypes ?? [],
    mainStats: cfg.mainStatsV ?? [],
  })
  // Build a fast lookup for allowed variants so pools can be filtered cheaply.
  const allowedSubstatIds = new Set(allowedSubstats.map((variant) => Number(variant)))
  // Build permutation pool respecting fixed substats (variants only).
  // Canonicalize substat selection order so output does not depend on click order.
  const selectedPoolV = Array.isArray(cfg.substatsV) && cfg.substatsV.length > 0
    ? cfg.substatsV.map(Number).filter((variant) => allowedSubstatIds.has(Number(variant))).sort(compareVariants)
    : []
  // Preserve the literal fixed selections as entered so we can mirror UI locking faithfully.
  const fixedPoolRawV = Array.isArray(cfg.fixedSubstatsV) && cfg.fixedSubstatsV.length > 0
    ? cfg.fixedSubstatsV.map(Number).filter((variant) => allowedSubstatIds.has(Number(variant)))
    : []
  // Normalize fixed to be a subset of selected; preserve order of appearance from selected
  const fixedPoolV = selectedPoolV.filter(sv => fixedPoolRawV.includes(Number(sv)))
  // If the user explicitly selected substats but all are invalid for the slot/main,
  // emit no rules instead of falling back to presence-only behavior.
  if (hadRequestedSubstats && selectedPoolV.length === 0) return []
  // Track whether any selected substat explicitly demands rolls.
  const hasPerStatMin = selectedPoolV.some((variant) => {
    const bounds = cfg.substatRollBoundsV?.[Number(variant)]
    return typeof bounds?.min === 'number' && bounds.min > 0
  })
  const requiredV = fixedPoolV.slice(0, 4)
  const lockedCount = requiredV.length
  const minTargetCount = Math.min(4, Math.max(cfg.minCount, requiredV.length))
  const optionalPoolV = selectedPoolV.filter(sv => !requiredV.includes(Number(sv)))

  const maxSelectableCount = Math.min(4, requiredV.length + optionalPoolV.length)
  const flexEligible = canEnableSubstatFlex(cfg)
  // Flex mode only activates when both the config allows it and the toggle is on.
  const flexActive = cfg.autoSubstatFlex === true && flexEligible
  const maxTargetCount = flexActive ? maxSelectableCount : minTargetCount
  // Convert the HSF rank code into the substat target star bucket so thresholds stay coherent.
  const star = starForRankCode(rankCode, substatTargets.anyRankDefaultsTo ?? 6)
  // Precompute star-resolved base minima once so combo loops can reuse lookups.
  const currentBaseByVariantForWasm: Record<number, number> = {}
  // Preserve factory minima from TS constants so rust does not duplicate them.
  const factoryBaseByVariantForWasm: Record<number, number | null> = {}
  // Precompute normalized target override bases once per selected variant.
  const targetBaseOverrideByVariantForWasm: Record<number, number | null> = {}
  for (const variantRaw of selectedPoolV) {
    const variant = Number(variantRaw)
    currentBaseByVariantForWasm[variant] = Math.floor(baseMinForStarV(variant, star, substatTargets))
    factoryBaseByVariantForWasm[variant] = factoryBaseMinForStar(variant, star)
    const targetOverride = normalizeRollTargetEntry(cfg.substatRollTargetsV?.[variant])
    targetBaseOverrideByVariantForWasm[variant] = (
      typeof targetOverride?.base === 'number' ? Math.floor(targetOverride.base) : null
    )
  }

  // Resolve Auto rarity to a concrete rarity code before rule generation.
  // Use the shared resolver to keep UI and builder behavior identical.
  const rarityCode = (cfg.rarityMode === 'auto') ? resolveAutoRarityCode(cfg) : cfg.rarityCode

  // Resolve set selections into numeric IDs for HSF export.
  const resolvedSets = splitArtifactSetSelections(cfg.artifactSets)
  const baseCoreGlobal = {
    ...(configId !== null ? { ConfigID: configId } : {}),
    ...(cfg.keep !== undefined ? { Keep: cfg.keep } : {}),
    ...(exportMode === 'disabled' ? { Use: false }
      : exportMode === 'active' ? { Use: true } : {}),
    // Only include set/type arrays when non-empty to match HSF samples.
    ...((resolvedSets.included.length > 0)
      ? { ArtifactSet: resolvedSets.included.slice().sort(compareArtifactSets).map(Number) }
      : {}),
    ...(((cfg.artifactTypes ?? []).length > 0)
      ? { ArtifactType: (cfg.artifactTypes ?? []).slice().sort(compareArtifactTypes).map(Number) }
      : {}),
    // Always include Rank/Rarity/Faction (0 means Any)
    Rank: rankCode,
    Rarity: rarityCode,
    Faction: Number(factionCode ?? 0),
  }

  const rules: HsfRule[] = []
  // Track emission order so we can re-sort after pruning while preserving deterministic grouping.
  const emissionMeta: Array<{ levelIdx: number; branchIdx: number; seq: number }> = []
  let nextSeq = 0
  let currentBranchIdx = 0
  let currentLevelIdx = 0
  // Map milestone levels to a monotonic index so branch ordering stays stable post-sort.
  const levelOrderMap = new Map<number, number>([
    [LEVEL_ANY_SENTINEL, -1],
    [0, 0],
    [4, 1],
    [8, 2],
    [12, 3],
    [16, 4],
  ])
  const levelOrderValue = (lvl: number): number => {
    const mapped = levelOrderMap.get(lvl)
    return mapped !== undefined ? mapped : (levelOrderMap.size + Number(lvl))
  }
  const recordMeta = () => {
    // Capture the emission context before pruning potentially shuffles the array.
    emissionMeta.push({ levelIdx: currentLevelIdx, branchIdx: currentBranchIdx, seq: nextSeq++ })
  }
  // Shared selector snapshot so signature caching and pruning see identical keys.
  type CanonicalRuleSelectors = {
    keep: boolean
    use: boolean
    rank: number
    rarity: number
    faction: number
    mainId: number
    mainF: number
    lvl: number
    setsKey: string
    typesKey: string
  }
  const canonicalizeRuleSelectors = (rule: HsfRule): CanonicalRuleSelectors => {
    const setsKey = Array.isArray(rule.ArtifactSet)
      ? rule.ArtifactSet.map(Number).sort((a, b) => a - b).join(',')
      : ''
    const typesKey = Array.isArray(rule.ArtifactType)
      ? rule.ArtifactType.map(Number).sort((a, b) => a - b).join(',')
      : ''
    return {
      keep: rule.Keep === true,
      use: rule.Use !== false,
      rank: Number(rule.Rank ?? 0),
      rarity: Number(rule.Rarity ?? 0),
      faction: Number(rule.Faction ?? 0),
      mainId: Number(rule.MainStatID ?? StatId.Any),
      mainF: Number(rule.MainStatF ?? 1),
      lvl: Number(rule.LVLForCheck ?? LEVEL_ANY_SENTINEL),
      setsKey,
      typesKey,
    }
  }
  // Memoize per-variant overrides so repeated lookups inside loops stay cheap.
  const targetEntryCache = new Map<number, SubstatRollTargetEntry | null>()
  const getTargetEntry = (variant: number): SubstatRollTargetEntry | null => {
    if (!cfg.substatRollTargetsV) return null
    if (targetEntryCache.has(variant)) {
      return targetEntryCache.get(variant) ?? null
    }
    const normalized = normalizeRollTargetEntry(cfg.substatRollTargetsV?.[variant])
    targetEntryCache.set(variant, normalized ?? null)
    return normalized ?? null
  }
  // Finalize in wasm so builder-obsolete pruning + emission ordering stay SSOT.
  const finalizeRules = () => {
    if (rules.length <= 1) return rules
    const finalized = finalizeBuilderRulesWithLoadedWasm({ rules, emissionMeta })
    if (!Array.isArray(finalized)) {
      throw new Error('WASM builder finalizer is unavailable. Ensure warmupWasmRuleEngine() ran first.')
    }
    rules.splice(0, rules.length, ...finalized)
    return rules
  }
  // Late+Auto may emit multiple rarity branches whose per-level thresholds can
  // coincide. To avoid redundant duplicate rows (e.g., identical +4 rules for
  // ≥ Epic and ≥ Legendary), maintain a signature set that ignores Rarity and
  // deduplicates when emitting across branches.
  const emittedSigs = new Set<string>()
  const makeSignature = (r: HsfRule): string => {
    const selectors = canonicalizeRuleSelectors(r)
    const keepBit = selectors.keep ? '1' : '0'
    const useBit = selectors.use ? '1' : '0'
    const subs = Array.isArray(r.Substats)
      ? r.Substats.map((s) => {
        const id = Number(s?.ID ?? StatId.Any)
        const flat = s?.IsFlat ? '1' : '0'
        const cond = String(s?.Condition ?? '')
        const val = Number(s?.Value ?? 0)
        return `${id}:${flat}:${cond}:${val}`
      }).join(';')
      : ''
    return `${keepBit}${useBit}|${selectors.rank}|${selectors.faction}|${selectors.mainId}:${selectors.mainF}|${selectors.lvl}|${selectors.setsKey}|${selectors.typesKey}|${subs}`
  }
  const pushRule = (r: HsfRule) => {
    const sig = makeSignature(r)
    if (emittedSigs.has(sig)) return
    emittedSigs.add(sig)
    rules.push(r)
    recordMeta()
    if (emissionLimit !== null && rules.length >= emissionLimit) {
      throw new RuleLimitReachedError(emissionLimit)
    }
  }

  // Determine mainstat choices: [] means Any; otherwise list of variants to unroll
  // Canonicalize mainstat order as well to avoid click-order dependence.
  const mainChoicesV: number[] = (Array.isArray(cfg.mainStatsV) && cfg.mainStatsV.length > 0)
    ? cfg.mainStatsV.map(Number).sort(compareVariants)
    : []

  const baseline: 'afterStart' | 'upToLevel' = deriveRollBaselineMode(cfg)
  const earlyMode: 'early' | 'late' = (cfg.earlyKeepMode === 'late' && isMilestoneThresholdsActive(cfg)) ? 'late' : 'early'
  const effectiveStart: LevelMilestone = 0
  // Level window: rely on normalized min/max window.
  const deriveLevelWindow = (): { min: LevelMilestone; max: LevelMilestone } => {
    // User sliders only allow milestone values, so silently clamp anything else.
    const toLevel = (v: unknown): LevelMilestone | null => {
      if (v === 0 || v === 4 || v === 8 || v === 12 || v === 16) return v as LevelMilestone
      return null
    }
    const minCandidate = toLevel(cfg.minLevel) ?? 0
    const maxCandidate = toLevel(cfg.maxLevel) ?? 16
    if (minCandidate <= maxCandidate) return { min: minCandidate, max: maxCandidate }
    return { min: maxCandidate, max: minCandidate }
  }
  const levelWindow = deriveLevelWindow()

  // Aggregate roll requirements split into global (selected stats) and locked-only scopes.
  const globalMinValue = deriveGlobalMinRolls({ cfg, selectedPoolV, requiredV, minTargetCount, rarityCode })
  const lockedMinValue = deriveLockedMinRolls({ cfg, lockedCount })
  const aggregateMinValue = Math.max(globalMinValue, lockedMinValue)
  const globalMinActive = globalMinValue > 0
  const lockedMinActive = lockedMinValue > 0
  const aggregateMinActive = aggregateMinValue > 0
  const manualMinZero = cfg.autoMinRequiredRolls === false && clampRollRequirement(cfg.minRequiredRolls ?? 0) === 0
  // Manual zero with no per-stat mins means "no roll requirements" regardless of rarity schedule.
  const suppressRollThresholds = manualMinZero && !hasPerStatMin && lockedMinValue === 0
  // When only locked mins are active, the aggregate target narrows to the locked subset only.
  const aggregateTargetsLocked = (!globalMinActive)
    && lockedMinActive
    && isLockedAggregateScopeActive(cfg, { lockedCountOverride: requiredV.length })

  // Special case: No substats selected => presence-only.
  // - For full window 0..16: emit a single "Any level" rule (LVLForCheck=LEVEL_ANY_SENTINEL).
  // - Otherwise: emit rules for each milestone within the window.
  if (selectedPoolV.length === 0) {
    // Precompute slot-compatible mains once so wasm can unroll levels/mains.
    const mainChoicesForWasm = mainChoicesV
      .filter((mnV) => anySelectedSlotSupportsMain(cfg.artifactTypes, mnV))
      .map((mnV) => variantToMain(mnV))
      .map((main) => ({ id: main.id, f: main.f ?? 1 }))
    // Delegate presence-only level/main rule emission to wasm.
    const emitted = buildHsfPresenceOnlyRulesWithLoadedWasm({
      baseCore: { ...baseCoreGlobal, Substats: [] },
      mainChoices: mainChoicesForWasm,
      levelWindowMin: levelWindow.min,
      levelWindowMax: levelWindow.max,
    })
    // Preserve pushRule signature dedupe + emission metadata tracking.
    for (const rule of emitted) {
      currentLevelIdx = levelOrderValue(Number(rule.LVLForCheck ?? LEVEL_ANY_SENTINEL))
      pushRule(rule)
    }
    finalizeRules()
    return rules
  }

  // Global upper-cap infeasibility and auto-mode "circled" checks run in wasm
  // so this preflight no longer loops through required/optional bounds in TS.
  const preflight = buildHsfPreflightFlagsWithLoadedWasm({
    selectedPoolV,
    requiredV,
    optionalPoolV,
    maxTargetCount,
    aggregateMinActive,
    aggregateMinValue,
    aggregateTargetsLocked,
    rarityCode,
    ...(typeof cfg.rarityMode === 'string' ? { rarityMode: cfg.rarityMode } : {}),
    substatRollBoundsV: cfg.substatRollBoundsV,
  })
  // Keep the same hard-prune behavior for impossible aggregate cap scenarios.
  if (!preflight.aggregateFeasibleByCaps) {
    return []
  }
  // Auto toggles to potential mode when any stat has explicit roll targeting.
  const hasCircled = preflight.hasCircled
  // Auto toggles to potential mode when any stat has explicit roll targeting.
  const effectiveMode: 'strict' | 'potential' = hasCircled ? 'potential' : 'strict'

  // Build rules at milestone levels according to baseline option
  // Late + Auto: expand into ≥ Rare / ≥ Epic / ≥ Legendary at 4/8/12 only.
  const rarityBranches: Array<{ code: number; restrictLevels?: LevelMilestone[] }> = (() => {
    // Delegate branch code expansion to wasm for SSOT tier sequencing.
    const wasmBranches = buildHsfRarityBranchesWithLoadedWasm({
      ...(typeof cfg.rarityMode === 'string' ? { rarityMode: cfg.rarityMode } : {}),
      ...(typeof cfg.earlyKeepMode === 'string' ? { earlyKeepMode: cfg.earlyKeepMode } : {}),
      ...(typeof cfg.autoRaritySupplementsThreshold === 'string' ? { autoRaritySupplementsThreshold: cfg.autoRaritySupplementsThreshold } : {}),
      rarityCode,
    })
    return wasmBranches.map((branch) => {
      const restrictLevels = Array.isArray(branch.restrictLevels)
        ? branch.restrictLevels.filter((level): level is LevelMilestone => (
          level === 4 || level === 8 || level === 12 || level === 16 || level === 0
        ))
        : null
      return {
        code: Number(branch.code),
        ...(restrictLevels ? { restrictLevels } : {}),
      }
    })
  })()

  // Normalize per-variant target overrides once so branch runtime can align
  // entries to combo order without re-reading builder config maps each loop.
  const targetEntriesByVariantForWasm: Record<number, { base?: number; increments?: Array<number | null> }> = {}
  for (const variantRaw of selectedPoolV) {
    const variant = Number(variantRaw)
    const entry = getTargetEntry(variant)
    if (!entry) continue
    targetEntriesByVariantForWasm[variant] = {
      ...(typeof entry.base === 'number' ? { base: entry.base } : {}),
      increments: Array.isArray(entry.increments) ? entry.increments : [],
    }
  }
  // Build slot-compatible mains once; branch runtime now runs fully in wasm.
  const mainChoicesForWasm = mainChoicesV
    .filter((mnV) => anySelectedSlotSupportsMain(cfg.artifactTypes, mnV))
    .map((mnV) => variantToMain(mnV))
    .map((main) => ({ id: main.id, f: main.f ?? 1 }))
  // Execute all rarity branches in one wasm call for this config.
  const builderRuntime = executeHsfBuilderRuntimeWithLoadedWasm({
    rarityBranches,
    baseline,
    effectiveStart,
    suppressRollThresholds,
    levelWindowMin: levelWindow.min,
    levelWindowMax: levelWindow.max,
    requiredV,
    optionalPoolV,
    selectedPoolV,
    flexActive,
    aggregateMinActive,
    minTargetCount,
    maxTargetCount,
    aggregateTargetsLocked,
    aggregateMinValue,
    lockedMinActive,
    lockedMinValue,
    substatRollBoundsV: cfg.substatRollBoundsV ?? {},
    targetEntriesByVariant: targetEntriesByVariantForWasm,
    currentBaseByVariant: currentBaseByVariantForWasm,
    factoryBaseByVariant: factoryBaseByVariantForWasm,
    targetBaseOverrideByVariant: targetBaseOverrideByVariantForWasm,
    baseRule: { ...baseCoreGlobal, Substats: [] },
    mainChoices: mainChoicesForWasm,
    emitAnyMainWhenNoChoices: mainChoicesV.length === 0,
    effectiveMode,
    earlyMode,
    ...(emissionLimit != null ? { emissionLimit } : {}),
  })
  // Keep existing limit exception behavior so merge.ts can short-circuit safely.
  if (builderRuntime.limitHit && emissionLimit !== null) {
    throw new RuleLimitReachedError(emissionLimit)
  }
  return builderRuntime.rules
}

// Expose available stat options for UI — variants supersede previous helpers
