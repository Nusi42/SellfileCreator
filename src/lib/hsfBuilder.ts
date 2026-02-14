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
import { variantToSub, variantToMain } from './hsfTypes'
import {
  emitHsfRulesForDistributionsWithLoadedWasm,
  emitHsfRulesForFilteredDistributionsWithLoadedWasm,
  finalizeBuilderRulesWithLoadedWasm,
  getCombinationsI32WithLoadedWasm,
  getFilteredBoundedCompositionsWithOffsetI32WithLoadedWasm,
  getIntroAssignmentsForComboWithLoadedWasm,
  resolveAutoRarityCodeWithLoadedWasm,
} from './wasm/wasmRuleEngine'

// Rarity codes that are eligible for collapsing to factory minima rules so
// default substat baselines remain the single source of truth for those tiers.
const COLLAPSE_FACTORY_RARITY_CODES = new Set<number>([
  RarityCode.Any,
  RarityCode.Rare,
  RarityCode.Epic,
  RarityCode.Legendary,
  RarityCode.Mythical,
  RarityCode.GTE_Legendary,
])

const isDevEnvironment = (): boolean => {
  // First consult process.env to honor CLI/Vite NODE_ENV, which is stable
  // across both Node and Vite preview harnesses.
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV
  if (typeof nodeEnv === 'string') return nodeEnv !== 'production'
  try {
    // Fallback to Vite's import.meta.MODE during browser builds so preview
    // tables still gate dev-only assertions.
    const mode = (import.meta as { env?: { MODE?: string } }).env?.MODE
    if (typeof mode === 'string') return mode !== 'production'
  } catch {
    // ignore: import.meta may be unavailable in some runtimes
  }
  // With no explicit signal, err toward true so invariant checks stay enabled.
  return true
}

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

// Build a single HSF rule from pieces
/**
 * Construct an HSF rule from a base (without Substats) and a list of substats.
 * Pads substats to length 4 with ID=-1 when fewer are provided, as expected by HSF.
 */
type RuleSubInput = { id: number; isFlat?: boolean; condition?: string; value?: number }

function makeRule(base: Omit<HsfRule, 'Substats'> & { Substats?: HsfRule['Substats'] }, subs: RuleSubInput[]): HsfRule {
  const filled: HsfRule['Substats'] = []
  // Presence requirement: Condition ">=" with Value 0 seems to encode "has this substat"
  for (const s of subs) {
    filled.push({
      ID: s.id,
      Value: (s.value ?? 0),
      IsFlat: Boolean(s.isFlat),
      NotAvailable: false,
      Condition: s.condition ?? '>=',
    })
  }
  // pad to 4 entries with ANY
  while (filled.length < 4) {
    filled.push({ ID: StatId.Any, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' })
  }
  // Current RSL Helper behavior: OR/AND flag does not affect matching for our
  // generated rules. To reduce variance across HSF consumers, export
  // IsRuleTypeAND=false consistently. If RSL semantics change, this can be
  // revisited.
  const isAnd = false
  // Preserve the legacy field cadence that RSL expects: sets before types, both before Rank.
  const artifactSetPayload = base.ArtifactSet !== undefined ? { ArtifactSet: base.ArtifactSet } : {}
  const artifactTypePayload = base.ArtifactType !== undefined ? { ArtifactType: base.ArtifactType } : {}
  return {
    // Config metadata comes first so JSON readers find it before the legacy flags.
    ...(base.ConfigID !== undefined ? { ConfigID: base.ConfigID } : {}),
    ...(typeof base.ConfigName === 'string' && base.ConfigName.length > 0 ? { ConfigName: base.ConfigName } : {}),
    ...(base.Keep !== undefined ? { Keep: base.Keep } : {}),
    // Emit AND flag between Keep and Use for compatibility with some readers.
    IsRuleTypeAND: isAnd,
    ...(base.Use !== undefined ? { Use: base.Use } : {}),
    ...artifactSetPayload,
    ...artifactTypePayload,
    ...(base.Rank !== undefined ? { Rank: base.Rank } : {}),
    ...(base.Rarity !== undefined ? { Rarity: base.Rarity } : {}),
    ...(base.MainStatID !== undefined ? { MainStatID: base.MainStatID } : {}),
    ...(base.MainStatF !== undefined ? { MainStatF: base.MainStatF } : {}),
    ...(base.LVLForCheck !== undefined ? { LVLForCheck: base.LVLForCheck } : {}),
    ...(base.Faction !== undefined ? { Faction: base.Faction } : {}),
    Substats: filled,
  }
}

// Returns true if the given substat is identical to the given main stat selection
// Identity means same stat family and same flat/percent variant where applicable.
/** True if a substat equals the given main stat (same id and variant semantics). */
function subEqualsMain(sub: { id: number; isFlat?: boolean }, main: { id: number; f?: number }): boolean {
  // Sentinel main (StatId.Any) means Any -> never identical
  if (main.id === StatId.Any) return false
  // HP/ATK/DEF have both flat (f=1) and percent (f=0) variants
  if (main.id === StatId.HP || main.id === StatId.ATK || main.id === StatId.DEF) {
    // If f is not provided, be conservative and do not filter
    if (main.f === undefined) return false
    return sub.id === main.id && Boolean(sub.isFlat) === (main.f === 1)
  }
  // Single-variant stats: SPD (4), RES (5), ACC (6), CR% (7), CDMG% (8)
  return sub.id === main.id
}

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
  // Normalize to numeric IDs so filtering is stable regardless of input types.
  const allowedSubstatIds = new Set(allowedSubstats.map((variant) => Number(variant)))
  // Trim selected substats to ones that are physically possible for the slot/main pair.
  const selectedPoolV = (cfg.substatsV ?? []).map(Number).filter((variant) => allowedSubstatIds.has(Number(variant)))
  // Trim fixed substats to only the allowed/selected space so locks remain meaningful.
  const fixedPoolRawV = (cfg.fixedSubstatsV ?? []).map(Number).filter((variant) => allowedSubstatIds.has(Number(variant)))
  // Resolve the locked subset within the filtered selection order.
  const fixedPoolV = selectedPoolV.filter((variant) => fixedPoolRawV.includes(Number(variant)))
  // Keep bound payload compact by only forwarding selected-stat rows.
  const selectedSet = new Set(selectedPoolV)
  const substatRollBoundsV: Record<number, { min?: number }> = {}
  for (const [key, bounds] of Object.entries(cfg.substatRollBoundsV ?? {})) {
    const variant = Number(key)
    if (!selectedSet.has(variant)) continue
    if (!bounds || typeof bounds !== 'object') continue
    // Preserve only normalized fields consumed by Rust resolver.
    const normalized: { min?: number } = {}
    if (typeof bounds.min === 'number' && Number.isFinite(bounds.min)) normalized.min = bounds.min
    if (Object.keys(normalized).length > 0) substatRollBoundsV[variant] = normalized
  }
  // Delegate auto-rarity aggregate/presence/threshold logic to Rust for SSOT.
  const wasmPayload = {
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
    selectedPoolV,
    fixedPoolV,
    substatRollBoundsV,
  }
  const resolved = resolveAutoRarityCodeWithLoadedWasm(wasmPayload)
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
  const lockedSet = new Set<number>(requiredV.map(Number))
  const minTargetCount = Math.min(4, Math.max(cfg.minCount, requiredV.length))
  const optionalPoolV = selectedPoolV.filter(sv => !requiredV.includes(Number(sv)))

  const maxSelectableCount = Math.min(4, requiredV.length + optionalPoolV.length)
  const flexEligible = canEnableSubstatFlex(cfg)
  // Flex mode only activates when both the config allows it and the toggle is on.
  const flexActive = cfg.autoSubstatFlex === true && flexEligible
  const maxTargetCount = flexActive ? maxSelectableCount : minTargetCount

  // Cache per-target-count combos so multi-level windows reuse the same permutations.
  const combosCache = new Map<number, number[][]>()
  const combosFor = (totalCount: number): number[][] => {
    // Short-circuit impossible requests so later logic can just iterate results.
    if (totalCount < requiredV.length) return []
    const maxPossible = requiredV.length + optionalPoolV.length
    if (totalCount > maxPossible || totalCount > 4) return []
    const cached = combosCache.get(totalCount)
    if (cached) return cached
    const needLocal = totalCount - requiredV.length
    if (needLocal <= 0) {
      const res = [requiredV.slice()]
      combosCache.set(totalCount, res)
      return res
    }
    if (needLocal > optionalPoolV.length) {
      combosCache.set(totalCount, [])
      return []
    }
    // Delegate optional-substat combinations to wasm so combinatorics stays SSOT.
    const optionalCombos = getCombinationsI32WithLoadedWasm(optionalPoolV, needLocal)
    // Fail closed when warmup/config is missing; no JS combination fallback remains.
    if (!Array.isArray(optionalCombos)) {
      throw new Error('WASM combinations helper is unavailable. Ensure warmupWasmRuleEngine() ran first.')
    }
    // Reattach required variants so downstream loops see the same tuple shape.
    const combos = optionalCombos.map((optionalCombo) => requiredV.concat(optionalCombo))
    combosCache.set(totalCount, combos)
    return combos
  }
  // Convert the HSF rank code into the substat target star bucket so thresholds stay coherent.
  const star = starForRankCode(rankCode, substatTargets.anyRankDefaultsTo ?? 6)

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
    const emitAtLevel = (lvl: LevelMilestone | typeof LEVEL_ANY_SENTINEL) => {
      // Presence-only rules never filter by substats, so just unroll main stats per level.
      currentLevelIdx = levelOrderValue(lvl)
      if (mainChoicesV.length === 0) {
        pushRule(makeRule({ ...baseCoreGlobal, MainStatID: StatId.Any, MainStatF: 1, LVLForCheck: lvl }, []))
      } else {
        for (const mnV of mainChoicesV) {
          if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
          const mT = variantToMain(mnV)
          pushRule(makeRule({ ...baseCoreGlobal, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, []))
        }
      }
    }
    if (levelWindow.min === 0 && levelWindow.max === 16) {
      emitAtLevel(LEVEL_ANY_SENTINEL)
    } else {
      for (const lvl of LEVELS) {
        if (lvl < levelWindow.min || lvl > levelWindow.max) continue
        emitAtLevel(lvl)
      }
    }
    finalizeRules()
    return rules
  }

// Global infeasibility prune (upper limits vs aggregate minimum):
// If a global MinRequiredRolls is set and, even under best-case per‑stat upper limits
  // across the required number of selected substats (fixed + highest remaining),
  // the target cannot be met by +16, do not emit any rows. This matches the UI
  // warning for confusing configs like single SPD with Max=0 and MinRequired=1.
  // Note: This does not prune nuanced feasibility-at-intermediate-level cases;
  // it only catches hard impossibilities regardless of distribution.
  if (aggregateMinActive && selectedPoolV.length > 0) {
    const targetMin = aggregateMinValue
    const supportsFive = (() => {
      // Only treat five-roll caps as reachable when Mythical or Any can provide the pre-roll.
      // 5-roll capable when Mythical is included, or Any/Auto with 5+ target
      if (rarityCode === RarityCode.Mythical || rarityCode === RarityCode.LTE_Mythical) return true
      if (rarityCode === RarityCode.Any) return true
      if (cfg.rarityMode === 'auto' && targetMin >= 5) return true
      return false
    })()
    const defaultCap = supportsFive ? 5 : 4
    const capFor = (v: number): number => {
      const b = (cfg.substatRollBoundsV ?? {})[Number(v)]
      const hasMax = (typeof b?.max === 'number' && isFinite(b.max))
      // Respect per-stat max overrides when provided; otherwise stick to rarity cap.
      const raw = hasMax ? Math.floor(Number(b!.max)) : defaultCap
      return Math.max(0, Math.min(defaultCap, raw))
    }
    const fixedCaps = requiredV.map(capFor)
    const optionalCaps = optionalPoolV.map(capFor).sort((a,b)=>b-a)
    let sumCaps = 0
    for (const c of fixedCaps) sumCaps += c
    if (!aggregateTargetsLocked) {
      for (let i = 0; i < Math.max(0, maxTargetCount - fixedCaps.length); i++) sumCaps += (optionalCaps[i] ?? 0)
    }
    if (sumCaps < targetMin) {
      return []
    }
  }

// Note: Aside from the hard upper-limit prune above, broader feasibility pruning is not
  // performed here to preserve early/potential semantics and special-case handling
  // (e.g., Any with 5-roll scenarios). The UI surfaces impossible-at-target
  // warnings when appropriate.
  // Resolve 'auto' to an effective mode based on whether any substat is "circled"
  // (i.e., has an active roll indicator: min > 0 or wildcard).
  const hasCircled = (() => {
    const subsV = selectedPoolV.length > 0 ? selectedPoolV : []
    if (subsV.length === 0) return false
    for (const v of subsV) {
      const b = cfg.substatRollBoundsV?.[Number(v)]
      if (!b) continue
      if (typeof b.min === 'number' && b.min > 0) return true
    }
    // Also consider global aggregate minimum rolls as a signal to use Potential in Auto.
    if (aggregateMinActive) return true
    return false
  })()
  // Auto toggles to potential mode when any stat has explicit roll targeting.
  const effectiveMode: 'strict' | 'potential' = hasCircled ? 'potential' : 'strict'

  // Build rules at milestone levels according to baseline option
  // Late + Auto: expand into ≥ Rare / ≥ Epic / ≥ Legendary at 4/8/12 only.
  const rarityBranches: Array<{ code: number; restrict?: Set<LevelMilestone> }> = (() => {
    const branches: Array<{ code: number; restrict?: Set<LevelMilestone> }> = []
    // Base branch: resolved rarity (may be Any, ≥ Rare, ≥ Epic, exact, etc.).
    const baseCode = rarityCode
    branches.push({ code: baseCode })
    // Supplemental branches for Late+Auto: include earlier/higher rarity tiers' timing where it differs.
    if (cfg.rarityMode === 'auto' && (cfg.earlyKeepMode === 'late')) {
      const threshold = (cfg.autoRaritySupplementsThreshold ?? 'rare')
      // Map threshold to minimum ≥ rarity code to include
      const minCode = (threshold === 'uncommon') ? 7 : (threshold === 'epic' ? 9 : 8)
      const candidates: number[] = []
      // Conditionally include ≥ Uncommon based on threshold and base
      if (minCode <= 7 && baseCode < 7) candidates.push(7)
      if (minCode <= 8 && baseCode < 8) candidates.push(8)
      if (minCode <= 9 && baseCode < 9) candidates.push(9)
      // Always consider ≥ Legendary when base is below it (Legendary/Mythical share schedule here)
      if (baseCode < 16) candidates.push(16)
      for (const s of candidates) {
        if (s !== baseCode) branches.push({ code: s, restrict: new Set<LevelMilestone>([4, 8, 12]) })
      }
    }
    return branches
  })()

  let branchIdxCounter = 0
  for (const branch of rarityBranches) {
    currentBranchIdx = branchIdxCounter++
    const rarityCodeLocal = branch.code
    // Late supplemental branches only emit at the fixed milestone trio to avoid duplicates.
    const restrictLevels = branch.restrict
    // Copy the global base once per branch so downstream merges stay cheap.
    const baseCore = { ...baseCoreGlobal, Rarity: rarityCodeLocal }
    const additionLevels = additionLevelsForRarityCode(rarityCodeLocal)
    // Precompute addition milestones per branch since many later checks need sorted access.
    const additionTimelineAll = Array.from(additionLevels.values())
    additionTimelineAll.sort((a, b) => a - b)
    const totalAddsByBranch = additionLevels.size
    const baseStartByBranch = Math.max(0, 4 - totalAddsByBranch)
    // Track combos that match pristine factory minima so collapse checks stay O(1).
    const factoryComboEligibleCache = new Map<string, boolean>()
    // Sentinel combos collapse to a single LEVEL_ANY row when all invariants align.
    const sentinelCollapsedCombos = new Set<string>()
    const collapseGlobalOkForBranch = (() => {
      // Only collapse when aggregate requirements are fully satisfied by the branch timeline.
      if (!aggregateMinActive) return true
      if (aggregateTargetsLocked) return false
      const baseRollLevels = rollLevelsForRarityCode(rarityCodeLocal)
      const rollsUpTo16 = LEVELS.filter(l => l <= 16 && baseRollLevels.has(l)).length
      const rollsUpToStart = LEVELS.filter(l => l <= effectiveStart && baseRollLevels.has(l)).length
      const preRolls = rarityIncludesMythical(rarityCodeLocal) ? 1 : 0
      const preRollsByStart = effectiveStart <= 0 ? preRolls : 0
      const maxRollsAtTarget = baseline === 'upToLevel'
        ? (rollsUpTo16 + preRolls)
        : Math.max(0, (rollsUpTo16 - rollsUpToStart) + preRollsByStart)
      if (additionLevels.size === 0 && aggregateMinValue <= baseStartByBranch) {
        return true
      }
      return aggregateMinValue === maxRollsAtTarget
    })()
    const collapseBranchEligible = !flexActive &&
      !restrictLevels &&
      collapseGlobalOkForBranch &&
      COLLAPSE_FACTORY_RARITY_CODES.has(rarityCodeLocal)
    // Sentinel collapse requires pristine 0→16 window with no additions for that rarity.
    const sentinelEligibleForBranch = collapseBranchEligible && additionLevels.size === 0 && levelWindow.min === 0 && levelWindow.max === 16
    const factoryComboEligible = (combo: number[]): boolean => {
      const key = combo.join(',')
      const cached = factoryComboEligibleCache.get(key)
      if (cached !== undefined) return cached
      // Factory collapse only triggers when every substat sticks to the shipped base minima.
      for (const variantRaw of combo) {
        const variant = Number(variantRaw)
        const bounds = cfg.substatRollBoundsV?.[variant]
        const minBound = Math.max(0, Math.min(5, Number(bounds?.min ?? 0)))
        if (minBound > 0) {
          factoryComboEligibleCache.set(key, false)
          return false
        }
        if (typeof bounds?.max === 'number' && isFinite(bounds.max)) {
          factoryComboEligibleCache.set(key, false)
          return false
        }
        const factoryBase = factoryBaseMinForStar(variant, star)
        if (factoryBase == null) {
          factoryComboEligibleCache.set(key, false)
          return false
        }
        const currentBase = baseMinForStarV(variant, star, substatTargets)
        if (currentBase !== factoryBase) {
          factoryComboEligibleCache.set(key, false)
          return false
        }
        const targetOverride = normalizeRollTargetEntry(cfg.substatRollTargetsV?.[variant])
        if (targetOverride?.base != null && targetOverride.base !== factoryBase) {
          factoryComboEligibleCache.set(key, false)
          return false
        }
      }
      factoryComboEligibleCache.set(key, true)
      return true
    }
    const emitFactoryMinimaRule = (
      combo: number[],
      comboSubs: ReturnType<typeof variantToSub>[],
      baseVals: number[],
      lvl: LevelMilestone | typeof LEVEL_ANY_SENTINEL,
    ) => {
      currentLevelIdx = levelOrderValue(lvl)
      const applyThresholds = (rule: HsfRule) => {
        // Collapse rows always emit base-only thresholds per stat.
        for (let i = 0; i < combo.length; i++) {
          const variant = Number(combo[i]!)
          const { id: statId } = variantToSub(variant)
          rule.Substats[i]!.Condition = '>='
          rule.Substats[i]!.Value = (statId === StatId.RollCount) ? 0 : baseVals[i]!
        }
      }
      const pushWithMain = (mainStatId: number, mainStatF: number) => {
        const rule = makeRule({ ...baseCore, MainStatID: mainStatId, MainStatF: mainStatF, LVLForCheck: lvl }, comboSubs)
        applyThresholds(rule)
        pushRule(rule)
      }
      if (mainChoicesV.length === 0) {
        pushWithMain(-1, 1)
      } else {
        for (const mnV of mainChoicesV) {
          if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
          if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
          const mT = variantToMain(mnV)
          pushWithMain(mT.id, mT.f ?? 1)
        }
      }
    }
    const rollLevels = rollLevelsForRarityCode(rarityCodeLocal)
    // Cache sorted roll milestones for this branch to avoid re-deriving inside loops.
    const rollTimeline = LEVELS.filter(l => rollLevels.has(l)).sort((a, b) => a - b)
    for (const lvl of LEVELS) {
      if (restrictLevels && !restrictLevels.has(lvl)) continue
      if (lvl < levelWindow.min || lvl > levelWindow.max) continue
      currentLevelIdx = levelOrderValue(lvl)
      const rollsUpToLvl = LEVELS.filter(l => l <= lvl && rollLevels.has(l)).length
      const rollsUpToStart = LEVELS.filter(l => l <= effectiveStart && rollLevels.has(l)).length
      // Account for Mythical's initial pre-roll at level 0 when the rarity selection includes Mythical.
      const preRolls = rarityIncludesMythical(rarityCodeLocal) ? 1 : 0
      const preRollsByStart = (effectiveStart <= 0) ? preRolls : 0
      const rawRollsForThisLevel = baseline === 'upToLevel'
        ? (rollsUpToLvl + preRolls)
        : Math.max(0, (rollsUpToLvl - rollsUpToStart) + preRollsByStart)
      // Suppressed roll requirements keep thresholds at base values.
      const numRollsForThisLevel = suppressRollThresholds ? 0 : rawRollsForThisLevel
      // For potential-keep calculations, consider target as +16
      const rollsUpTo16 = LEVELS.filter(l => l <= 16 && rollLevels.has(l)).length
      const rawRollsByTarget = baseline === 'upToLevel'
        ? (rollsUpTo16 + preRolls)
        : Math.max(0, (rollsUpTo16 - rollsUpToStart) + preRollsByStart)
      // Target roll budget collapses to zero when roll requirements are disabled.
      const numRollsByTarget = suppressRollThresholds ? 0 : rawRollsByTarget
      // Determine how many substats can physically exist at this level for the selected rarity
      const additionTimeline = additionTimelineAll
      const addsSoFar = additionTimeline.filter(a => a <= lvl).length
      const present = Math.min(4, baseStartByBranch + addsSoFar)

    // Build level-specific substat combinations: when present < min target,
    // enumerate combos of size `present` (still honoring fixed substats). Once
    // the minimum can be met, flex mode allows totals up to maxTargetCount.
    // Delay flex permutations until at least two rolls have occurred so we avoid
    // emitting redundant multi-substat rows (e.g. +0/+4 map identical thresholds
    // for both single- and multi-stat variants when only one roll is available).
    // Aggregate roll minimums need flex permutations as soon as any roll can land,
    // otherwise Rare paths that spend the first roll on an optional stat get pruned.
    const allowFlexAtLevel = flexActive && (
      numRollsForThisLevel >= 2 ||
      (aggregateMinActive && numRollsForThisLevel > 0)
    )
    const levelMinCount = Math.min(present, minTargetCount)
    const levelMaxCount = Math.min(present, allowFlexAtLevel ? maxTargetCount : minTargetCount)
    const levelCombosV: number[][] = (() => {
      if (levelMaxCount < requiredV.length) return []
      if (flexActive) {
        const combos: number[][] = []
        for (let total = levelMinCount; total <= levelMaxCount; total++) {
          if (total < requiredV.length) continue
          for (const combo of combosFor(total)) {
            combos.push(combo)
          }
        }
        return combos
      }
      if (levelMinCount < requiredV.length) return []
      return combosFor(levelMinCount)
    })()
    // For each chosen substat combination, distribute available rolls among them
    for (const combo of levelCombosV) {
      const comboKey = combo.join(',')
      // Skip combos that already emitted a sentinel LevelAny row.
      if (sentinelCollapsedCombos.has(comboKey)) continue
      const m = combo.length
      const lockedMask = combo.map(v => lockedSet.has(Number(v)))
      if (present < m) {
        // Not enough substats can exist at this level to satisfy minCount -> skip emitting rows
        continue
      }
      // Addition events change how many slots exist, so collapse rules must avoid them.
      const additionEventAtLevel = additionTimelineAll.includes(lvl)
      const baseVals = combo.map(v => baseMinForStarV(Number(v), star, substatTargets))
      const comboSubs = combo.map(v => variantToSub(v))
      const shouldCollapse = (() => {
        if (!collapseBranchEligible) return null
        if (m === 0) return null
        if (m !== present) return null
        if (additionEventAtLevel) return null
        if (!factoryComboEligible(combo)) return null
        if (m === 3) {
          if (rarityCodeLocal !== 4) return null
          if (lvl === 16) return null
        } else if (m === 2) {
          if (rarityCodeLocal !== 3) return null
          if (lvl >= 12) return null
        } else if (m < 4) {
          return null
        }
        if (sentinelEligibleForBranch && lvl === 0) return 'sentinel'
        return 'level'
      })()
      if (shouldCollapse === 'sentinel') {
        if (isDevEnvironment()) {
          if (!COLLAPSE_FACTORY_RARITY_CODES.has(rarityCodeLocal)) {
            throw new Error(`Factory minima collapse sentinel for unexpected rarity branch ${rarityCodeLocal}`)
          }
          if (rarityCodeLocal !== 4 && rarityCodeLocal !== 3 && additionLevels.size !== 0) {
            throw new Error(`Factory minima sentinel triggered for rarity ${rarityCodeLocal} with additions`)
          }
        }
        emitFactoryMinimaRule(combo, comboSubs, baseVals, LEVEL_ANY_SENTINEL)
        sentinelCollapsedCombos.add(comboKey)
        continue
      }
      if (shouldCollapse === 'level') {
        if (isDevEnvironment()) {
          if (!COLLAPSE_FACTORY_RARITY_CODES.has(rarityCodeLocal)) {
            throw new Error(`Factory minima collapse level for unexpected rarity branch ${rarityCodeLocal}`)
          }
          if (rarityCodeLocal !== 4 && rarityCodeLocal !== 3 && additionLevels.size !== 0) {
            throw new Error(`Factory minima level collapse for rarity ${rarityCodeLocal} with additions`)
          }
        }
        emitFactoryMinimaRule(combo, comboSubs, baseVals, lvl)
        continue
      }
      // Track which positions are optional so we can skip redundant flex supersets later.
      const optionalMask = combo.map(v => !requiredV.includes(v))
      // List of additions that have already occurred by this level for intro scheduling.
      const additionAvailable = additionTimelineAll.filter(level => level <= lvl)
      const baseSlots = Math.min(baseStartByBranch, m)
      // Locked stats occupy the earliest slots so intro scheduling never drops them.
      const forcedBaseIndices = Array.from({ length: Math.min(requiredV.length, m) }, (_, idx) => idx)
      // Delegate intro-assignment enumeration to wasm so timing math is single-sourced.
      const introAssignments = getIntroAssignmentsForComboWithLoadedWasm({
        count: m,
        baseSlots,
        additionLevels: additionAvailable,
        forcedBase: forcedBaseIndices,
      })
      // Fail closed when warmup/config is missing; no JS intro fallback remains.
      if (!Array.isArray(introAssignments)) {
        throw new Error('WASM intro-assignment helper is unavailable. Ensure warmupWasmRuleEngine() ran first.')
      }
      // Utility helper to count how many roll milestones satisfy the provided filter.
      const countRollEvents = (predicate: (level: LevelMilestone) => boolean): number => {
        let count = 0
        for (const eventLevel of rollTimeline) {
          if (predicate(eventLevel)) count += 1
        }
        return count
      }
      // Slot/main constraints were applied before permutation; remaining combos
      // are already feasible for at least one selected slot/main pairing.
      if (m === 0) {
        if (mainChoicesV.length === 0) {
          // Include explicit Any main for consistency with HSF samples
          pushRule(makeRule({ ...baseCore, MainStatID: StatId.Any, MainStatF: 1, LVLForCheck: lvl }, []))
        } else {
          for (const mnV of mainChoicesV) {
            if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
            const mT = variantToMain(mnV)
            pushRule(makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, []))
          }
        }
        continue
      }
      if (introAssignments.length === 0) {
        continue
      }
      // Capture per-variant target overrides so we can compute roll thresholds once per combo.
      const targetEntries = combo.map((variant) => getTargetEntry(Number(variant)))
      // Aggregate minimum rolls can target all selected substats or only locked ones.
      // Aggregate mins either touch all selected stats or just the locked subset.
      const targetedMask: boolean[] = combo.map(v => !aggregateTargetsLocked || requiredV.includes(v))
      const canSatisfyLocked = (current: number, remaining: number) => {
        if (!lockedMinActive) return true
        return (current >= lockedMinValue) || ((lockedMinValue - current) <= remaining)
      }

      for (const introLevels of introAssignments) {
        // Lower-bound rule: enforce per-substat minimum rolls regardless of how additional rolls distribute.
        // This enables targets like "SPD (1) keeps items with at least 1 SPD roll" even when SPD is the only selected substat.
        // Only emit if (a) any substat specifies a min>0 bound, and (b) it's feasible at this level
        // given the number of rolls available by baseline (sum(mins) <= numRollsForThisLevel).
        const mins: number[] = []
        const maxs: Array<number | undefined> = []
        const anyFlags: boolean[] = []
        let anyMin = false
        let anyWildcard = false
        for (let i = 0; i < combo.length; i++) {
          const v = Number(combo[i]!)
          const b = cfg.substatRollBoundsV?.[v]
          const any = Boolean(b?.any)
          const mv = Math.max(0, Math.min(5, Number(b?.min ?? 0)))
          const xvRaw = b?.max
          // Cap per-substat max at 4; 5 is redundant and equivalent to wildcard
          const xv = (typeof xvRaw === 'number' && isFinite(xvRaw)) ? Math.max(0, Math.min(4, Math.floor(xvRaw))) : undefined
          anyFlags.push(any)
          mins.push(mv)
          maxs.push(xv)
          if (mv > 0) anyMin = true
          if (any) anyWildcard = true
        }
        // Reuse compact metadata payloads so repeated row emission avoids rebuilding
        // main/substat descriptors for every distribution candidate.
        const substatsForWasm = combo
          .map(v => variantToSub(v))
          .map((sub) => ({ id: sub.id, isFlat: Boolean(sub.isFlat) }))
        const mainChoicesForWasm = mainChoicesV
          .filter((mnV) => anySelectedSlotSupportsMain(cfg.artifactTypes, mnV))
          .map((mnV) => variantToMain(mnV))
          .map((main) => ({ id: main.id, f: main.f ?? 1 }))
        const baseValsForWasm = baseVals.map((value) => Math.floor(value))
        const minsForWasm = mins.map((value) => Math.floor(value))
        const maxCapsForWasm = maxs.map((cap) => (
          typeof cap === 'number' && Number.isFinite(cap) ? Math.floor(cap) : -1
        ))
        const optionalMaskForWasm = optionalMask.map((flag) => flag === true)
        const maxCapsForFilterBase = Int32Array.from(maxCapsForWasm)
        const targetedMaskForFilterBase = Uint8Array.from(targetedMask.map((flag) => (flag === true ? 1 : 0)))
        const lockedMaskForFilterBase = Uint8Array.from(lockedMask.map((flag) => (flag === true ? 1 : 0)))
        const targetBasesForWasm = targetEntries.map((entry) => (
          typeof entry?.base === 'number' && Number.isFinite(entry.base)
            ? Math.floor(entry.base)
            : null
        ))
        const targetIncrementsForWasm = targetEntries.map((entry) => (
          Array.isArray(entry?.increments)
            ? entry!.increments.map((value) => (
              typeof value === 'number' && Number.isFinite(value)
                ? Math.floor(value)
                : null
            ))
            : []
        ))
        // Reuse one immutable base-rule shell per combo+level emission batch.
        // WASM reads this payload and returns fresh output objects.
        const baseRuleForWasm: HsfRule = { ...baseCore, LVLForCheck: lvl, Substats: [] }
        const skipOptionalBaselineByDefault = combo.length > minTargetCount
        const emitRowsForComboViaWasm = (
          rows: number[][],
          options?: { skipOptionalBaseline?: boolean },
        ): boolean => {
          if (rows.length === 0) return false
          const emittedRules = emitHsfRulesForDistributionsWithLoadedWasm({
            baseRule: baseRuleForWasm,
            substats: substatsForWasm,
            distributions: rows,
            baseVals: baseValsForWasm,
            mins: minsForWasm,
            maxCaps: maxCapsForWasm,
            optionalMask: optionalMaskForWasm,
            skipOptionalBaseline: options?.skipOptionalBaseline ?? skipOptionalBaselineByDefault,
            mainChoices: mainChoicesForWasm,
            emitAnyMainWhenNoChoices: mainChoicesV.length === 0,
            targetBases: targetBasesForWasm,
            targetIncrements: targetIncrementsForWasm,
          })
          if (!Array.isArray(emittedRules)) {
            throw new Error('WASM HSF emission helper is unavailable. Ensure warmupWasmRuleEngine() ran first.')
          }
          for (const rule of emittedRules) {
            pushRule(rule)
          }
          return emittedRules.length > 0
        }
        const emitFilteredRowsForComboViaWasm = (params: {
          dims: number
          total: number
          minFloors?: ReadonlyArray<number | undefined> | Int32Array
          targetedExact?: number | null
          deficitFloors?: ReadonlyArray<number | undefined> | Int32Array
          deficitMax?: number | null
          globalMode: 0 | 1 | 2
          globalRemaining: number
          lockedMode: 0 | 1 | 2
          lockedRemaining: number
        }): boolean => {
          const dims = Math.max(0, params.dims)
          const vectors = filterVectorsForDims(dims)
          const emittedRules = emitHsfRulesForFilteredDistributionsWithLoadedWasm({
            dimensions: dims,
            total: params.total,
            maxCaps: vectors.maxCaps,
            ...(params.minFloors !== undefined ? { minFloors: params.minFloors } : {}),
            timelineCaps: vectors.timelineCaps,
            targetedMask: vectors.targetedMask,
            targetedExact: params.targetedExact ?? null,
            ...(params.deficitFloors !== undefined ? { deficitFloors: params.deficitFloors } : {}),
            deficitMax: params.deficitMax ?? null,
            globalMin,
            globalRemaining: params.globalRemaining,
            globalMode: params.globalMode,
            lockedMask: vectors.lockedMask,
            lockedMin: lockedMinValue,
            lockedRemaining: params.lockedRemaining,
            lockedMode: params.lockedMode,
            emit: {
              baseRule: baseRuleForWasm,
              substats: substatsForWasm,
              baseVals: baseValsForWasm,
              mins: minsForWasm,
              maxCaps: maxCapsForWasm,
              optionalMask: optionalMaskForWasm,
              skipOptionalBaseline: skipOptionalBaselineByDefault,
              mainChoices: mainChoicesForWasm,
              emitAnyMainWhenNoChoices: mainChoicesV.length === 0,
              targetBases: targetBasesForWasm,
              targetIncrements: targetIncrementsForWasm,
            },
          })
          if (!Array.isArray(emittedRules)) {
            throw new Error('WASM filtered HSF emission helper is unavailable. Ensure warmupWasmRuleEngine() ran first.')
          }
          for (const rule of emittedRules) {
            pushRule(rule)
          }
          return emittedRules.length > 0
        }
        // If any substat demands min > max, configuration is impossible; skip rows for this level/combo
        let impossibleMinMax = false
        for (let i = 0; i < combo.length; i++) {
          if (maxs[i] !== undefined && mins[i]! > (maxs[i]! as number)) { impossibleMinMax = true; break }
        }
        if (impossibleMinMax) {
          // Do not emit presence or progress rows when constraints are contradictory
          continue
        }
        const sumMin = mins.reduce((a, b) => a + b, 0)
        // Locked aggregate comparisons only count mins on the locked subset.
        const sumLockedMin = mins.reduce((acc, val, idx) => acc + (lockedMask[idx] ? val : 0), 0)
        const needsLockedAggregate = lockedMinActive && sumLockedMin < lockedMinValue
        // Aggregate minimum across selected substats (off when Auto).
        const globalMin = aggregateMinValue
        // Dynamic Mythical handling for 'Any' rarity: if either the per-substat mins or the
        // global minimum require 5 total rolls and rarity is Any (0), include one pre-roll to
        // model Mythical as the only feasible path. Apply consistently to availability and target.
        const mythPreExtra = (rarityCodeLocal === RarityCode.Any && (sumMin >= 5 || globalMin >= 5)) ? 1 : 0
        // For each intro slot, figure out how many rolls can have landed on it by this level.
        const timelineCaps = introLevels.map(intro => {
          if (baseline === 'afterStart') {
            const earliest = Math.max(effectiveStart, intro)
            const rollsAfter = countRollEvents(eventLevel => eventLevel > earliest && eventLevel <= lvl)
            const includePre = (intro <= 0 && effectiveStart <= 0) ? preRolls : 0
            const extraMyth = (intro <= 0) ? mythPreExtra : 0
            return rollsAfter + includePre + extraMyth
          }
          const rollsAfterIntro = countRollEvents(eventLevel => eventLevel >= intro && eventLevel <= lvl)
          const includePre = (intro <= 0) ? preRolls : 0
          const extraMyth = (intro <= 0) ? mythPreExtra : 0
          return rollsAfterIntro + includePre + extraMyth
        })
        const timelineCapsForFilterBase = Int32Array.from(timelineCaps.map((cap) => (
          typeof cap === 'number' && Number.isFinite(cap) ? Math.floor(cap) : -1
        )))
        // Cache widened mask/cap vectors keyed by requested dimension count.
        // This avoids re-allocating/map-filling arrays on every distribution call.
        const vectorsByDims = new Map<number, {
          maxCaps: Int32Array
          timelineCaps: Int32Array
          targetedMask: Uint8Array
          lockedMask: Uint8Array
        }>()
        const filterVectorsForDims = (dims: number) => {
          const cached = vectorsByDims.get(dims)
          if (cached) return cached
          const width = Math.max(0, dims)
          const maxCaps = new Int32Array(width)
          const timelineCaps = new Int32Array(width)
          const targetedMask = new Uint8Array(width)
          const lockedMask = new Uint8Array(width)
          maxCaps.fill(-1)
          timelineCaps.fill(-1)
          const copyCount = Math.min(width, m)
          if (copyCount > 0) {
            maxCaps.set(maxCapsForFilterBase.subarray(0, copyCount), 0)
            timelineCaps.set(timelineCapsForFilterBase.subarray(0, copyCount), 0)
            targetedMask.set(targetedMaskForFilterBase.subarray(0, copyCount), 0)
            lockedMask.set(lockedMaskForFilterBase.subarray(0, copyCount), 0)
          }
          const prepared = { maxCaps, timelineCaps, targetedMask, lockedMask }
          vectorsByDims.set(dims, prepared)
          return prepared
        }
        const mythPreCount = (rarityIncludesMythical(rarityCodeLocal) ? 1 : 0) + mythPreExtra
        // Availability/target counters include Any→Mythical pre-roll modeling when applicable.
        const avail = numRollsForThisLevel + mythPreExtra
        const numTarget = numRollsByTarget + mythPreExtra
        const remaining = Math.max(0, numTarget - avail)
        const emitPresence = (): boolean => {
          // Flex permutations (autoSubstatFlex) emit presence rows for every
          // supersized combo (minCount+ extras) by default. Those combos add no
          // extra coverage when all additional substats are just optional
          // wildcards at their baseline — the shorter combo already keeps the
          // item. Skip emitting those rows to avoid redundant identical rules
          // like the HP/DEF double-presence reported for Ring Limited Sets.
          if (flexActive && combo.length > minTargetCount) return false
          return emitRowsForComboViaWasm([new Array(m).fill(0)], { skipOptionalBaseline: false })
        }
        // Fast path for single selected substat with a minimum: emit one early
        // lower-bound per level: base + min(avail, min)*base. This matches the
        // target that thresholds grow until the minimum is feasible, then
        // remain fixed (e.g., ACC(2): +0 9, +4 18, +8 27, +12 27, +16 27).
        if (m === 1 && anyMin && !anyWildcard) {
          // With one selected substat, if a global minimum is set and exceeds the per‑stat
          // minimum, treat that higher requirement as the early target. This keeps
          // a single rising threshold that matches "green roll" targets and ensures
          // MinRequiredRolls drives the outcome when stronger than per‑stat Min.
          const required = Math.max(mins[0]!, globalMin)
          // If impossible even by target, skip entirely
          if (required > numTarget) {
            continue
          }
          // Determine applied rolls credited to this substat at this level
          const maxCap = maxs[0]
          let applied: number
          if (earlyMode === 'late') {
            // Late: require only what must be present now so that the target at +16
            // is still achievable by allocating remaining rolls later.
            const remaining = Math.max(0, numTarget - avail)
            const needNow = Math.max(0, required - remaining)
            applied = needNow
          } else {
            // Early: base + min(avail, required)
            const wanted = Math.min(required, avail)
            applied = wanted
          }
          if (typeof maxCap === 'number') applied = Math.min(applied, maxCap)
          // Global aggregate min: keep row only if achievable by target
          if (globalMin > 0) {
            const remaining = Math.max(0, numTarget - avail)
            const s = applied // with one substat, selected sum equals applied
            if (!(s >= globalMin || (globalMin - s) <= remaining)) {
              continue
            }
            const lockedApplied = lockedMask[0] ? applied : 0
            if (!canSatisfyLocked(lockedApplied, remaining)) {
              continue
            }
          }
          emitRowsForComboViaWasm([[applied]], { skipOptionalBaseline: false })
          // Done for this level/combo
          continue
        }
        // Fast path for single selected substat with wildcard (any=true) and a
        // global Min Required Rolls: behave like a per-stat early lower bound
        // using the aggregate minimum. This keeps a single row per level and mirrors
        // the "green roll" target with one selected substat.
        if (m === 1 && !anyMin && anyWildcard && globalMin > 0) {
          // If impossible even by target, skip entirely
          if (globalMin > numTarget) {
            continue
          }
          const maxCap = maxs[0]
          let applied: number
          if (earlyMode === 'late') {
            const remaining = Math.max(0, numTarget - avail)
            const needNow = Math.max(0, globalMin - remaining)
            applied = needNow
          } else {
            const wanted = Math.min(globalMin, avail)
            applied = wanted
          }
          if (typeof maxCap === 'number') applied = Math.min(applied, maxCap)
          // With a single selected stat, only count toward aggregate if targeted
          const remaining = Math.max(0, numTarget - avail)
          const appliedTargeted = targetedMask[0] ? applied : 0
          if (!(appliedTargeted >= globalMin || (globalMin - appliedTargeted) <= remaining)) {
            continue
          }
          const lockedApplied = lockedMask[0] ? applied : 0
          if (!canSatisfyLocked(lockedApplied, remaining)) {
            continue
          }
          emitRowsForComboViaWasm([[applied]], { skipOptionalBaseline: false })
          continue
        }
        // Enumerate strict selected-substat allocations entirely through the
        // wasm filter+emit path to avoid JS-side row loops.
        const emitDists = (params?: {
          minFloors?: ReadonlyArray<number | undefined> | Int32Array
          targetedExact?: number | null
          deficitFloors?: ReadonlyArray<number | undefined> | Int32Array
          deficitMax?: number | null
          globalMode?: 0 | 1 | 2
          globalRemaining?: number
          lockedMode?: 0 | 1 | 2
          lockedRemaining?: number
        }) => {
          const globalMode = params?.globalMode ?? (globalMin > 0 ? 1 : 0)
          const globalRemaining = params?.globalRemaining ?? 0
          const lockedMode = params?.lockedMode ?? (lockedMinActive ? 1 : 0)
          const lockedRemaining = params?.lockedRemaining ?? 0
          return emitFilteredRowsForComboViaWasm({
            dims: m,
            total: avail,
            ...(params?.minFloors !== undefined ? { minFloors: params.minFloors } : {}),
            targetedExact: params?.targetedExact ?? null,
            ...(params?.deficitFloors !== undefined ? { deficitFloors: params.deficitFloors } : {}),
            deficitMax: params?.deficitMax ?? null,
            globalMode,
            globalRemaining,
            lockedMode,
            lockedRemaining,
          })
        }
        // Like emitDists, but allow some available rolls to land on non-selected
        // stats via one or more sink dimensions appended after selected stats.
        const emitDistsAllowOther = (params?: {
          minFloors?: ReadonlyArray<number | undefined> | Int32Array
          targetedExact?: number | null
          deficitFloors?: ReadonlyArray<number | undefined> | Int32Array
          deficitMax?: number | null
        }) => {
          const addSet = additionLevelsForRarityCode(rarityCode)
          const totalAdds = addSet.size
          const baseStart = Math.max(0, 4 - totalAdds)
          const addsSoFar = Array.from(addSet).filter(a => a <= lvl).length
          const present = Math.min(4, baseStart + addsSoFar)
          const othersCount = Math.max(0, present - m)

          const run = (includeVirtualSink: boolean): boolean => {
            const dims = m + (othersCount > 0 ? 1 : 0) + (includeVirtualSink ? 1 : 0)
            const rollsUpTo16 = LEVELS.filter(l => l <= 16 && rollLevels.has(l)).length
            const numTarget = baseline === 'upToLevel'
              ? (rollsUpTo16 + mythPreCount)
              : Math.max(0, (rollsUpTo16 - rollsUpToStart) + (effectiveStart <= 0 ? mythPreCount : 0))
            const remaining = Math.max(0, numTarget - avail)
            return emitFilteredRowsForComboViaWasm({
              dims,
              total: avail,
              ...(params?.minFloors !== undefined ? { minFloors: params.minFloors } : {}),
              targetedExact: params?.targetedExact ?? null,
              ...(params?.deficitFloors !== undefined ? { deficitFloors: params.deficitFloors } : {}),
              deficitMax: params?.deficitMax ?? null,
              globalMode: globalMin > 0 ? 2 : 0,
              globalRemaining: remaining,
              // Keep parity: this branch only enforces locked feasibility together with globalMin.
              lockedMode: globalMin > 0 && lockedMinActive ? 2 : 0,
              lockedRemaining: remaining,
            })
          }

          const preferVirtualSink = (() => {
            // Virtual sink lets us satisfy locked-only aggregate mins without inventing extra options.
            if (!aggregateTargetsLocked || globalMin <= 0 || othersCount !== 0 || avail <= 0) {
              return false
            }
            let hasTargeted = false
            let hasNonTargeted = false
            for (let i = 0; i < targetedMask.length; i++) {
              if (targetedMask[i]!) {
                hasTargeted = true
                continue
              }
              hasNonTargeted = true
              if (mins[i]!) return false
            }
            return hasTargeted && hasNonTargeted
          })()

          if (preferVirtualSink) {
            if (run(true)) return true
            return run(false)
          }

          const emitted = run(false)
          if (emitted) return true
          // When no additional substats exist before this level but Late mode
          // still needs to stage fewer rolls than are currently available,
          // re-run with a virtual sink for leftover rolls so we can emit the
          // minimal thresholds required at this milestone.
          if (othersCount === 0 && avail > 0) {
            return run(true)
          }
          return false
        }
        const emitMinOnly = () => {
          // Emit the minimal >= targets per stat once feasibility is achieved.
          // Flex supersets (autoSubstatFlex) can introduce optional stats that never
          // receive rolls when we only need the locked/core substats to meet their
          // substatTargets. Skip emitting those redundant rows so the smaller combo remains
          // the single source of truth for that threshold.
          const optionalRowsOnlyBaseline = (
            combo.length > minTargetCount &&
            optionalMask.some(Boolean) &&
            optionalMask.every((isOptional, idx) => {
              if (!isOptional) return true
              return mins[idx]! === 0
            })
          )
          if (optionalRowsOnlyBaseline) {
            return false
          }
          return emitRowsForComboViaWasm([mins.map((value) => Math.floor(value))], { skipOptionalBaseline: false })
        }

        // Multi-substat late lower-bound (emit all minimal rows per level)
        if (earlyMode === 'late' && anyMin) {
          const remaining = Math.max(0, numTarget - avail)
          const needNow: number[] = []
          let sumNeed = 0
          let overCap = false
          for (let i = 0; i < m; i++) {
            const need = anyFlags[i] ? 0 : Math.max(0, mins[i]! - remaining)
            const cap = (typeof maxs[i] === 'number') ? (maxs[i]! as number) : 4
            if (need > cap) { overCap = true; break }
            needNow.push(need)
            sumNeed += need
          }
          if (!overCap) {
            // Aggregate minimum in late mode: ensure the selected (or locked-only) sum required
            // by the target is also respected at this level. Compute the minimal targeted sum
            // needed now so that the aggregate can still be satisfied by +16.
            const targetedMask: boolean[] = combo.map(v => !aggregateTargetsLocked || requiredV.includes(v))
            const sumNeedTargeted = needNow.reduce((a, v, i) => a + (targetedMask[i] ? v : 0), 0)
            const minAggNow = globalMin > 0 ? Math.max(0, globalMin - remaining) : 0
            const extraTargeted = Math.max(0, minAggNow - sumNeedTargeted)
            const minNowRequired = Math.max(0, sumMin - remaining) + extraTargeted
            if (minNowRequired <= avail) {
              const extra = Math.max(0, minNowRequired - sumNeed)
              const baseLockedNeed = needNow.reduce((a, v, i) => a + (lockedMask[i] ? v : 0), 0)
              const lockedNeedAtLevel = lockedMinActive ? Math.max(0, lockedMinValue - remaining) : 0
              // Determine per-index additional capacity we can allocate now (bounded by per-stat min and upper limits)
              const addCaps: number[] = new Array(m)
              for (let i = 0; i < m; i++) {
                const cap = (typeof maxs[i] === 'number') ? (maxs[i]! as number) : 4
                // Only allow extra allocations to targeted stats when satisfying the aggregate minimum.
                // Late mode may require progress beyond per‑stat mins when an aggregate
                // minimum applies. Otherwise, constrain extra to per‑stat mins to keep
                // minimal lower-bounds concise and avoid rolling non-required stats.
                const baseRoom = Math.max(0, Math.min(mins[i]!, cap) - needNow[i]!)
                const room = extraTargeted > 0 ? Math.max(0, cap - needNow[i]!) : baseRoom
                addCaps[i] = targetedMask[i] ? room : 0
              }
              const candidateRows = getFilteredBoundedCompositionsWithOffsetI32WithLoadedWasm({
                caps: addCaps,
                total: extra,
                needNow,
                lockedMask,
                lockedBaseSum: baseLockedNeed,
                lockedMinAtLevel: lockedNeedAtLevel,
                optionalMask,
                mins,
                skipOptionalBaseline: combo.length > minTargetCount && optionalMask.some(Boolean),
              })
              if (!Array.isArray(candidateRows)) {
                throw new Error('WASM bounded-composition helper is unavailable. Ensure warmupWasmRuleEngine() ran first.')
              }
              emitRowsForComboViaWasm(candidateRows, { skipOptionalBaseline: skipOptionalBaselineByDefault })
              continue
            }
          }
        }
        if (effectiveMode === 'strict') {
          if (earlyMode === 'late') {
            // Late lower-bound: require only what must be present now so the
            // target at +16 can still be achieved.
            // Compute per-stat needed-now rolls for non-wildcard mins.
            const remaining = Math.max(0, numTarget - avail)
            const needNow: number[] = []
            let sumNeed = 0
            let overCap = false
            for (let i = 0; i < m; i++) {
              const need = anyFlags[i] ? 0 : Math.max(0, mins[i]! - remaining)
              const cap = (typeof maxs[i] === 'number') ? (maxs[i]! as number) : 4
              if (need > cap) { overCap = true; break }
              needNow.push(need)
              sumNeed += need
            }
            if (!overCap) {
              // Ensure enough is present by now so remaining rolls can satisfy the rest.
              const minNowRequired = Math.max(0, sumMin - remaining)
              if (minNowRequired <= avail) {
                const extra = Math.max(0, minNowRequired - sumNeed)
                const baseLockedNeed = needNow.reduce((a, v, i) => a + (lockedMask[i] ? v : 0), 0)
                const lockedNeedAtLevel = lockedMinActive ? Math.max(0, lockedMinValue - remaining) : 0
                // Target-feasible and aggregate-feasible checks
                if (sumMin <= numTarget && Math.max(0, sumMin - remaining) <= avail) {
                  let okAgg = true
                  if (globalMin > 0) {
                    if (globalMin > numTarget) {
                      okAgg = false
                    } else {
                      let addCap = 0
                      for (let i = 0; i < m; i++) {
                        const cap = (typeof maxs[i] === 'number') ? (maxs[i]! as number) : 4
                        addCap += Math.max(0, cap - mins[i]!)
                      }
                      if ((globalMin - sumMin) > addCap) okAgg = false
                    }
                  }
                  if (okAgg) {
                    // Per-index available additional raises
                    const addCaps: number[] = new Array(m)
                    for (let i = 0; i < m; i++) {
                      const cap = (typeof maxs[i] === 'number') ? (maxs[i]! as number) : 4
                      addCaps[i] = Math.max(0, Math.min(mins[i]!, cap) - needNow[i]!)
                    }
                    const candidateRows = getFilteredBoundedCompositionsWithOffsetI32WithLoadedWasm({
                      caps: addCaps,
                      total: extra,
                      needNow,
                      lockedMask,
                      lockedBaseSum: baseLockedNeed,
                      lockedMinAtLevel: lockedNeedAtLevel,
                      optionalMask: Array.from({ length: m }, () => false),
                      mins,
                      skipOptionalBaseline: false,
                    })
                    if (!Array.isArray(candidateRows)) {
                      throw new Error('WASM bounded-composition helper is unavailable. Ensure warmupWasmRuleEngine() ran first.')
                    }
                    emitRowsForComboViaWasm(candidateRows, { skipOptionalBaseline: false })
                    continue
                  }
                }
              }
            }
          }
          if (!anyMin && !anyWildcard) {
            // Only a global minimum is set (no per-substat mins, no wildcard):
            // - If there is no global minimum, emit presence only (base substatTargets).
            // - If there is a global minimum, emit strict distributions that meet it (sum rolls across
            //   selected substats >= globalMin) when feasible at this level.
            if (globalMin <= 0) {
              emitPresence()
            } else if (avail >= globalMin) {
              // No JS predicate needed: run distribution filtering + rule emission in wasm.
              emitFilteredRowsForComboViaWasm({
                dims: m,
                total: avail,
                globalMode: globalMin > 0 ? 1 : 0,
                globalRemaining: 0,
                lockedMode: lockedMinActive ? 1 : 0,
                lockedRemaining: 0,
              })
            } else {
              // Not feasible yet at this level
            }
          } else if (!anyMin && anyWildcard) {
            // Wildcard-only (no per-stat mins).
            // Late mode should require the minimal selected sum needed NOW so that
            // a valid +16 split remains achievable with the remaining rolls.
            // For strict callers (effectiveMode==='strict'), mirror this behavior.
            if (globalMin > 0 && earlyMode === 'late') {
              const rollsUpTo16 = LEVELS.filter(l => l <= 16 && rollLevels.has(l)).length
              const numTarget = baseline === 'upToLevel'
                ? (rollsUpTo16 + mythPreCount)
                : Math.max(0, (rollsUpTo16 - rollsUpToStart) + (effectiveStart <= 0 ? mythPreCount : 0))
              // Minimal selected sum required by this level to still reach globalMin by target
              const remaining = Math.max(0, numTarget - avail)
              const needNow = Math.max(0, Math.min(globalMin, globalMin - remaining))
              if (needNow === 0) {
                emitPresence()
              } else if (needNow <= avail) {
                emitDistsAllowOther({ targetedExact: needNow })
              } else {
                // Not feasible yet at this level
              }
            } else if (globalMin > 0) {
              const need = Math.min(globalMin, avail)
              // Early minimal enumerations with an implicit "other" bucket.
              emitDistsAllowOther({ targetedExact: need })
            } else {
              // No aggregate minimum: mirror "min=0" behavior. Early enumerates
              // selected sums 0..avail via an implicit "other" bucket; Late keeps
              // rows concise (presence only).
              if (earlyMode === 'late') {
                emitPresence()
              } else {
                emitDistsAllowOther()
              }
            }
          } else {
            // have mins (with or without wildcard)
            if (avail <= 0) {
              // not feasible yet: no rule for this level
            } else if (sumMin <= avail) {
              // min-only at and after feasibility unless aggregate minimum exceeds sum of per-substat mins
              // When targeting locked-only, compare globalMin against the sum of mins across the targeted subset
              const sumMinTargeted = mins.reduce((a, v, i) => a + (targetedMask[i] ? (v ?? 0) : 0), 0)
              if ((globalMin > 0 && globalMin > sumMinTargeted) || needsLockedAggregate) {
                emitDists({ minFloors: mins })
              } else {
                emitMinOnly()
              }
            } else {
              // not feasible: no rule
            }
          }
        } else { // potential
          if (!anyMin && !anyWildcard) {
            // Only a global minimum is set: allow partial-progress rows that either
            // meet the globalMin now or can still reach it by the target level.
            // Allow rolls to land on non-selected stats; enumerate selected portion.
            // Feasible-by-target aggregate gate already runs in the wasm filter path.
            emitDistsAllowOther()
          } else if (!anyMin && anyWildcard) {
            // Wildcard-only (no per-stat mins).
            // Early: enumerate only minimal allocations at each level
            // (sum(selected rolls) === min(globalMin, avail)).
            // Late: require the minimal selected sum needed NOW so that a valid +16 split
            // remains achievable with remaining rolls; enumerated via an implicit "other" bucket.
            if (globalMin > 0 && earlyMode === 'late') {
              const rollsUpTo16 = LEVELS.filter(l => l <= 16 && rollLevels.has(l)).length
              const numTarget = baseline === 'upToLevel'
                ? (rollsUpTo16 + mythPreCount)
                : Math.max(0, (rollsUpTo16 - rollsUpToStart) + (effectiveStart <= 0 ? mythPreCount : 0))
              const remaining = Math.max(0, numTarget - avail)
              const needNow = Math.max(0, Math.min(globalMin, globalMin - remaining))
              if (needNow === 0) {
                emitPresence()
              } else if (needNow <= avail) {
                emitDistsAllowOther({ targetedExact: needNow })
              } else {
                // Not feasible yet at this level
              }
            } else if (globalMin > 0) {
              const need = Math.min(globalMin, avail)
              emitDistsAllowOther({ targetedExact: need })
            } else {
              // No aggregate minimum: mirror "min=0" behavior.
              if (earlyMode === 'late') {
                emitPresence()
              } else {
                emitDistsAllowOther()
              }
            }
          } else {
            // If the requested mins cannot be satisfied even by the target level, skip entirely
            if (sumMin > numTarget) {
              // impossible by target: do not emit presence or progress rows
            } else if (avail <= 0) {
              // Potential: allow presence when aggregate can still be met by target
              if (globalMin <= numTarget) emitPresence()
            } else if (sumMin <= avail) {
              // Feasible now: collapse to minimum-only row unless an aggregate minimum
              // requires more total rolls across the selected stats.
              const sumMinTargeted2 = mins.reduce((a, v, i) => a + (targetedMask[i] ? (v ?? 0) : 0), 0)
              if ((globalMin > 0 && globalMin > sumMinTargeted2) || needsLockedAggregate) {
                // Early mode semantics for aggregate target: emit minimal-progress rows that
                // meet per‑stat mins now and allocate exactly the currently available number
                // of rolls toward the aggregate (or the full aggregate if smaller), while
                // allowing leftover rolls to land on non‑selected stats. Also ensure the
                // remaining rolls by +16 can still cover the deficit to the aggregate.
                // Selected non-targeted mins consume some of the available rolls now.
                // Allocate the remainder (up to the aggregate) to the targeted subset.
                const minNonTargetNow = mins.reduce((acc, v, i) => acc + (!targetedMask[i] ? (v ?? 0) : 0), 0)
                const needTargetNow = Math.min(globalMin, Math.max(0, avail - minNonTargetNow))
                emitDistsAllowOther({
                  minFloors: mins,
                  targetedExact: needTargetNow,
                })
              } else {
                emitMinOnly()
              }
            } else {
              // Partial progress before feasibility; enumerate only selected stats allocations
              // and ensure deficits can still be made up by target.
              // Keep non-wildcard deficit feasibility in wasm. Aggregate parity is preserved
              // by emitDists defaulting to globalMode=GteNow when globalMin > 0.
              const deficitFloors = mins.map((value, idx) => (anyFlags[idx] ? undefined : value))
              emitDists({
                deficitFloors,
                deficitMax: remaining,
              }) || emitPresence()
            }
          }
        }
      }
      // Min-only mode: skip distribution-based strict and potential variants
      continue
    }

  // Early multi-substat: before feasibility, also emit selected-only
  // distributions across the full selected set (not reduced by presence), to
  // show clear roll allocations like [SPD, CR] = [1,0] or [0,1]. This avoids
  // hiding a stat column at early levels due to dynamic presence sizing.
  //
  // Important: Only do this when the target selection size (minCount, honoring
  // locked substats) uses the entire selected set. When minCount < selected,
  // emitting "full-selected" rows produces strictly stronger rules (supersets)
  // that are redundant with the K-of-N presence rows and creates noise. Gating
  // here preserves intent without generating dominated rules like
  // [ACC, RES, HP%, DEF%] alongside a [ACC, RES, HP%] row at the same level.
  if (effectiveMode === 'potential' && earlyMode === 'early' && minTargetCount >= Math.min(4, selectedPoolV.length)) {
      const fullSelV = selectedPoolV.slice(0, Math.min(4, selectedPoolV.length))
      if (fullSelV.length > 1) {
        const minsFull: number[] = []
        const maxsFull: Array<number | undefined> = []
        const anyFlagsFull: boolean[] = []
        let anyMinFull = false
        for (let i = 0; i < fullSelV.length; i++) {
          const v = Number(fullSelV[i]!)
          const b = cfg.substatRollBoundsV?.[v]
          const any = Boolean(b?.any)
          const mv = Math.max(0, Math.min(5, Number(b?.min ?? 0)))
          const xvRaw = b?.max
          const xv = (typeof xvRaw === 'number' && isFinite(xvRaw)) ? Math.max(0, Math.min(4, Math.floor(xvRaw))) : undefined
          anyFlagsFull.push(any)
          minsFull.push(mv)
          maxsFull.push(xv)
          if (mv > 0) anyMinFull = true
        }
        const sumMinFull = minsFull.reduce((a,b)=>a+b,0)
        const globalMinFull = aggregateMinValue
        // Only emit extra full-selected distributions when we have mins and are not yet feasible
            // Compute local availability with Mythical pre-roll when needed
            const mythPreExtraFull = (rarityCodeLocal === RarityCode.Any && (sumMinFull >= 5 || globalMinFull >= 5)) ? 1 : 0
            const availFull = numRollsForThisLevel + mythPreExtraFull
            const numTargetFull = numRollsByTarget + mythPreExtraFull
        if (anyMinFull && sumMinFull > availFull) {
          const mF = fullSelV.length
          const baseValsFullForWasm = fullSelV.map((variant) => (
            Math.floor(baseMinForStarV(Number(variant), star, substatTargets))
          ))
          const minsFullForWasm = minsFull.map((value) => Math.floor(value))
          const maxCapsFullForWasm = maxsFull.map((cap) => (
            typeof cap === 'number' && Number.isFinite(cap) ? Math.floor(cap) : -1
          ))
          const substatsFullForWasm = fullSelV
            .map((variant) => variantToSub(variant))
            .map((sub) => ({ id: sub.id, isFlat: Boolean(sub.isFlat) }))
          const mainChoicesFullForWasm = mainChoicesV
            .filter((mnV) => anySelectedSlotSupportsMain(cfg.artifactTypes, mnV))
            .map((mnV) => variantToMain(mnV))
            .map((main) => ({ id: main.id, f: main.f ?? 1 }))
          const remainingFull = Math.max(0, numTargetFull - availFull)
          const deficitFloorsFull = minsFull.map((value, idx) => (anyFlagsFull[idx] ? undefined : value))
          const emittedRules = emitHsfRulesForFilteredDistributionsWithLoadedWasm({
            dimensions: mF,
            total: availFull,
            maxCaps: maxCapsFullForWasm,
            timelineCaps: new Int32Array(mF).fill(-1),
            targetedMask: new Uint8Array(mF),
            targetedExact: null,
            deficitFloors: deficitFloorsFull,
            deficitMax: remainingFull,
            globalMin: 0,
            globalRemaining: 0,
            globalMode: 0,
            lockedMask: new Uint8Array(mF),
            lockedMin: 0,
            lockedRemaining: 0,
            lockedMode: 0,
            emit: {
              baseRule: { ...baseCore, LVLForCheck: lvl, Substats: [] },
              substats: substatsFullForWasm,
              baseVals: baseValsFullForWasm,
              mins: minsFullForWasm,
              maxCaps: maxCapsFullForWasm,
              optionalMask: Array.from({ length: mF }, () => false),
              skipOptionalBaseline: false,
              mainChoices: mainChoicesFullForWasm,
              emitAnyMainWhenNoChoices: mainChoicesV.length === 0,
              // Keep parity with the previous branch: no per-stat target overrides here.
              targetBases: Array.from({ length: mF }, () => null),
              targetIncrements: Array.from({ length: mF }, () => [] as Array<number | null>),
            },
          })
          if (!Array.isArray(emittedRules)) {
            throw new Error('WASM filtered HSF emission helper is unavailable. Ensure warmupWasmRuleEngine() ran first.')
          }
          for (const rule of emittedRules) {
            pushRule(rule)
          }
        }
      }
    }
  }
  
  }
  
  finalizeRules()
  return rules
}

// Expose available stat options for UI — variants supersede previous helpers
