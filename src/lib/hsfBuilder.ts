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
import {
  combinations,
  introAssignmentsForCombo,
} from './hsfBuilder/combinatorics'
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
  statIsAny,
} from './types'
import { canEnableSubstatFlex, deriveRollBaselineMode, isLockedAggregateScopeActive, isMilestoneThresholdsActive } from './configNormalization'
import { variantToSub, variantToMain } from './hsfTypes'

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
  return {
    // Config metadata comes first so JSON readers find it before the legacy flags.
    ...(base.ConfigID !== undefined ? { ConfigID: base.ConfigID } : {}),
    ...(typeof base.ConfigName === 'string' && base.ConfigName.length > 0 ? { ConfigName: base.ConfigName } : {}),
    ...(base.Keep !== undefined ? { Keep: base.Keep } : {}),
    // Emit AND flag between Keep and Use for compatibility with some readers.
    IsRuleTypeAND: isAnd,
    ...(base.Use !== undefined ? { Use: base.Use } : {}),
    ...(base.ArtifactSet ? { ArtifactSet: base.ArtifactSet } : {}),
    ...(base.ArtifactType ? { ArtifactType: base.ArtifactType } : {}),
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


// Compute roll-event schedule for a given rarity at milestone levels
// Returns a set of levels where an existing substat is rolled (not added)
/** Levels where rarity increases grant a roll for the given rarity code. */
export function rollLevelsForRarityCode(rarityCode: RarityCode): Set<LevelMilestone> {
  // Map HSF rarity code to an exact roll schedule bucket per docs/TECHNICAL.md#artifact-rules
  // Common: none; Uncommon: [4]; Rare: [4,8]; Epic: [4,8,12]; Legendary/Mythical: [4,8,12,16]
  const byExact = {
    Common: new Set<LevelMilestone>([]),
    Uncommon: new Set<LevelMilestone>([4]),
    Rare: new Set<LevelMilestone>([4, 8]),
    Epic: new Set<LevelMilestone>([4, 8, 12]),
    Legendary: new Set<LevelMilestone>([4, 8, 12, 16]),
    Mythical: new Set<LevelMilestone>([4, 8, 12, 16]),
  }
  // Exact codes
  if (rarityCode === RarityCode.Common) return byExact.Common
  if (rarityCode === RarityCode.Uncommon) return byExact.Uncommon
  if (rarityCode === RarityCode.Rare) return byExact.Rare
  if (rarityCode === RarityCode.Epic) return byExact.Epic
  if (rarityCode === RarityCode.Legendary) return byExact.Legendary
  if (rarityCode === RarityCode.Mythical) return byExact.Mythical
  // Ranges (conservative lower-bound schedule for ≥ ranges)
  if (rarityCode === RarityCode.GTE_Common) return byExact.Common
  if (rarityCode === RarityCode.GTE_Uncommon) return byExact.Uncommon
  if (rarityCode === RarityCode.GTE_Rare) return byExact.Rare
  if (rarityCode === RarityCode.GTE_Epic) return byExact.Epic
  if (rarityCode === RarityCode.GTE_Legendary) return byExact.Legendary
  // <= Uncommon..<= Epic (10..12): map to that upper bound
  if (rarityCode === RarityCode.LTE_Uncommon) return byExact.Uncommon
  if (rarityCode === RarityCode.LTE_Rare) return byExact.Rare
  if (rarityCode === RarityCode.LTE_Epic) return byExact.Epic
  // <= Legendary (13) or <= Mythical (14): includes Legendary/Mythical
  if (rarityCode === RarityCode.LTE_Legendary || rarityCode === RarityCode.LTE_Mythical) return byExact.Legendary
  // 0 (Any) -> Legendary
  return byExact.Legendary
}

// Addition schedule: levels where a new substat is added (not rolled), per rarity
/**
 * Levels where a new substat is added for the given rarity code.
 * Used to derive presence-only constraints when the level window collapses to a single milestone.
 */
export function additionLevelsForRarityCode(rarityCode: RarityCode): Set<LevelMilestone> {
  const byExact = {
    Common: new Set<LevelMilestone>([4,8,12,16]),
    Uncommon: new Set<LevelMilestone>([8,12,16]),
    Rare: new Set<LevelMilestone>([12,16]),
    Epic: new Set<LevelMilestone>([16]),
    Legendary: new Set<LevelMilestone>([]),
    Mythical: new Set<LevelMilestone>([]),
  }
  // Exact codes
  if (rarityCode === RarityCode.Common) return byExact.Common
  if (rarityCode === RarityCode.Uncommon) return byExact.Uncommon
  if (rarityCode === RarityCode.Rare) return byExact.Rare
  if (rarityCode === RarityCode.Epic) return byExact.Epic
  if (rarityCode === RarityCode.Legendary) return byExact.Legendary
  if (rarityCode === RarityCode.Mythical) return byExact.Mythical
  // Special cases for ranges and Any
  // 0 (Any): treat presence as ≥ Legendary (no additions) so +0 has all substats present.
  // This avoids suppressing +0 rows when no explicit rarity is selected, while
  // still relying on roll schedules and MinRequiredRolls to shape thresholds.
  if (rarityCode === RarityCode.Any) return byExact.Legendary
  // >= Common..>= Epic (6..9): map to the lower bound's addition schedule
  if (rarityCode === RarityCode.GTE_Common) return byExact.Common
  if (rarityCode === RarityCode.GTE_Uncommon) return byExact.Uncommon
  if (rarityCode === RarityCode.GTE_Rare) return byExact.Rare
  if (rarityCode === RarityCode.GTE_Epic) return byExact.Epic
  // >= Legendary (16): Legendary/Mythical have no additions
  if (rarityCode === RarityCode.GTE_Legendary) return byExact.Legendary
  // ≤ Uncommon..≤ Mythical (10..14): assume Common additions are possible within the range
  if (rarityCode >= RarityCode.LTE_Uncommon && rarityCode <= RarityCode.LTE_Mythical) return byExact.Common
  // Fallback
  return byExact.Legendary
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
  switch (rarityCode) {
    case RarityCode.Common: return 0 // Common
    case RarityCode.Uncommon: return 1
    case RarityCode.Rare: return 2
    case RarityCode.Epic: return 3
    case RarityCode.Legendary: return 4
    case RarityCode.Mythical: return 4
    case RarityCode.GTE_Common: return 0 // ≥ Common
    case RarityCode.GTE_Uncommon: return 1 // ≥ Uncommon
    case RarityCode.GTE_Rare: return 2 // ≥ Rare
    case RarityCode.GTE_Epic: return 3 // ≥ Epic
    case RarityCode.GTE_Legendary: return 4 // ≥ Legendary
    case RarityCode.LTE_Uncommon: return 0 // ≤ Uncommon
    case RarityCode.LTE_Rare: return 0 // ≤ Rare
    case RarityCode.LTE_Epic: return 0 // ≤ Epic
    case RarityCode.LTE_Legendary: return 0 // ≤ Legendary
    case RarityCode.LTE_Mythical: return 0 // ≤ Mythical
    case RarityCode.Any: return 0 // Any
    default: return 0
  }
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
  // Exact Mythical
  if (rarityCode === RarityCode.Mythical) return true
  // Any (0): do NOT assume Mythical. Treat as non-Mythical for pre-roll logic.
  if (rarityCode === RarityCode.Any) return false
  // Conservative: ≥ ranges do not assume Mythical
  if (rarityCode >= RarityCode.GTE_Common && rarityCode <= RarityCode.GTE_Epic) return false
  if (rarityCode === RarityCode.GTE_Legendary) return false
  // <= Mythical (14)
  if (rarityCode === RarityCode.LTE_Mythical) return true
  // Other exacts and ranges do not include Mythical
  return false
}

/**
 * Resolve Auto rarity selection to a concrete HSF rarity code for a given config.
 * Mirrors the internal logic used by the builder before rule generation so UI
 * summaries can display the exact rarity the preview table will show.
 */
export function resolveAutoRarityCode(cfg: BuilderConfig): RarityCode {
  // Optional floor: when a UI threshold is set, clamp Auto to at least that ≥ rarity.
  // Applies when Auto mode is active; used primarily with Late keep mode.
  const minFloorCode: RarityCode | null = (() => {
    if (cfg.rarityMode !== 'auto') return null
    const t = (cfg.autoRaritySupplementsThreshold ?? null)
    if (t === 'uncommon') return RarityCode.GTE_Uncommon
    if (t === 'rare') return RarityCode.GTE_Rare
    if (t === 'epic') return RarityCode.GTE_Epic
    return null
  })()
  const applyFloor = (code: number): number => {
    if (minFloorCode == null) return code
    // Rating order for Auto-resolution codes
    const rate = (c: number): number => {
      switch (c) {
        case RarityCode.Any: return 0
        case RarityCode.GTE_Uncommon: return 1
        case RarityCode.GTE_Rare: return 2
        case RarityCode.GTE_Epic: return 3
        case RarityCode.GTE_Legendary: return 4
        case RarityCode.Mythical: return 5
        default: return 0
      }
    }
    return rate(code) < rate(minFloorCode) ? minFloorCode : code
  }
  // With no substat constraints, keep rules broad: treat Auto as Any.
  const selectedPoolV = (cfg.substatsV ?? []).slice()
  const fixedPoolV = (cfg.fixedSubstatsV ?? []).slice()
  if (selectedPoolV.length === 0) return applyFloor(RarityCode.Any)
  const maxSelectableTotal = Math.min(4, selectedPoolV.length)
  const minTargetCount = Math.min(4, Math.max(cfg.minCount, fixedPoolV.length))
  const presenceNeed = Math.min(maxSelectableTotal, minTargetCount)
  const requiredV = fixedPoolV.slice(0, 4)
  const optionalPoolV = selectedPoolV.filter(sv => !requiredV.includes(Number(sv)))
  const perMin: Record<number, number> = {}
  for (const v of selectedPoolV) {
    const b = cfg.substatRollBoundsV?.[Number(v)]
    const m = (typeof b?.min === 'number' ? Math.max(0, Math.min(5, Math.floor(b.min))) : 0)
    perMin[Number(v)] = m
  }
  // Locked substats always count toward the aggregate minimum with their declared mins.
  const sumRequired = requiredV.reduce((a, v) => a + (perMin[Number(v)] ?? 0), 0)
  const lockedScope = isLockedAggregateScopeActive(cfg, { lockedCountOverride: requiredV.length })
  let worstSumMins: number
  if (lockedScope) {
    worstSumMins = sumRequired
  } else {
    const needLocal = Math.max(0, minTargetCount - requiredV.length)
    // Conservative: assume the strongest optional mins enter the set first.
    const optionMins = optionalPoolV.map(v => perMin[Number(v)] ?? 0).sort((a,b)=>b-a)
    const sumOptional = optionMins.slice(0, needLocal).reduce((a,b)=>a+b,0)
    worstSumMins = sumRequired + sumOptional
  }
  const globalMinRaw = deriveGlobalMinRolls({ cfg, selectedPoolV, requiredV, minTargetCount })
  const lockedMinRaw = deriveLockedMinRolls({ cfg, lockedCount: requiredV.length })
  const globalMin = globalMinRaw
  const aggregateMin = Math.max(globalMin, lockedMinRaw)
  const required = Math.max(aggregateMin, worstSumMins)
  const clamped = Math.max(0, Math.min(5, required))

  const baseByRequired: Record<number, RarityCode> = {
    0: RarityCode.Any,
    1: RarityCode.GTE_Uncommon,
    2: RarityCode.GTE_Rare,
    3: RarityCode.GTE_Epic,
    4: RarityCode.GTE_Legendary,
    5: RarityCode.Mythical,
  }
  if (clamped >= 5) return applyFloor(RarityCode.Mythical)
  const candidate = baseByRequired[clamped] ?? RarityCode.Any

  // Auto rarity always resolves against the full +0 → +16 progression so that
  // changing the level window only clips emitted rules instead of relaxing rarity.
  const minLevel: LevelMilestone = 0
  const baseline: 'afterStart' | 'upToLevel' = deriveRollBaselineMode(cfg)
  const rollLevelsCand = rollLevelsForRarityCode(candidate)
  const preCand = rarityIncludesMythical(candidate) ? 1 : 0
  const rollsUpTo16Cand = LEVELS.filter(l => l <= 16 && rollLevelsCand.has(l)).length
  const rollsUpToStartCand = LEVELS.filter(l => l <= minLevel && rollLevelsCand.has(l)).length
  const targetCand = baseline === 'upToLevel'
    ? (rollsUpTo16Cand + preCand)
    : Math.max(0, (rollsUpTo16Cand - rollsUpToStartCand) + (minLevel <= 0 ? preCand : 0))
  const hasMin0 = minLevel === 0
  const earlyModeLocal: 'early' | 'late' = (cfg.earlyKeepMode === 'late' ? 'late' : 'early')
  if (hasMin0 && earlyModeLocal === 'early') {
    const k = Math.max(0, Math.min(4, minTargetCount))
    const requiredByK: number = (() => {
      if (k <= 0) return RarityCode.Any
      if (k === 1) return RarityCode.GTE_Uncommon
      if (k === 2) return RarityCode.GTE_Rare
      if (k === 3) return RarityCode.GTE_Epic
      return RarityCode.GTE_Legendary
    })()
    if (requiredByK !== RarityCode.Any) {
      if (candidate === RarityCode.Any && requiredV.length === 0) return applyFloor(requiredByK)
      const addSetCand = additionLevelsForRarityCode(candidate)
      const baseStartCand = Math.max(0, 4 - addSetCand.size)
      if (baseStartCand < k) return applyFloor(requiredByK)
    }
  }
  // Presence safeguard for locked substats at the first emitted level.
  // Why: Fixed (locked) substats must physically exist at the earliest level we emit;
  // "Auto" rarity should therefore ensure the base rarity provides enough initial
  // substats (or additions up to that level) to cover all locked stats. This prevents
  // Auto from choosing ≥Rare when 3 substats are locked at +0, which would rely on a
  // +4 addition instead of guaranteeing presence.
  {
    const kLocked = Math.min(4, requiredV.length)
    if (kLocked > 0) {
      const earliestLevel: LevelMilestone = 0
      const presentAt = (code: number, lvl: LevelMilestone): number => {
        const addSet = additionLevelsForRarityCode(code)
        const baseStart = Math.max(0, 4 - addSet.size)
        const addsSoFar = Array.from(addSet).filter(a => a <= lvl).length
        return Math.min(4, baseStart + addsSoFar)
      }
      // If current candidate cannot satisfy presence at the first level, bump through
      // minimal "≥" rarity tiers until it does (≥Uncommon -> ≥Rare -> ≥Epic -> ≥Legendary).
      if (presentAt(candidate, earliestLevel) < kLocked) {
        const tiers: readonly number[] = [
          RarityCode.GTE_Uncommon,
          RarityCode.GTE_Rare,
          RarityCode.GTE_Epic,
          RarityCode.GTE_Legendary,
        ]
        for (const t of tiers) {
          if (presentAt(t, earliestLevel) >= kLocked) { return applyFloor(t) }
        }
      }
    }
  }
  // Require the base rarity to satisfy the requested substat count at the first
  // emitted level (`presenceNeed` is already clamped to the selected pool).
  if (presenceNeed > 0) {
    const earliestLevel: LevelMilestone = 0
    const presentAt = (code: number, lvl: LevelMilestone): number => {
      const addSet = additionLevelsForRarityCode(code)
      const baseStart = Math.max(0, 4 - addSet.size)
      const addsSoFar = Array.from(addSet).filter(a => a <= lvl).length
      return Math.min(4, baseStart + addsSoFar)
    }
    if (presentAt(candidate, earliestLevel) < presenceNeed) {
      const tiers: readonly number[] = [
        candidate,
        RarityCode.GTE_Uncommon,
        RarityCode.GTE_Rare,
        RarityCode.GTE_Epic,
        RarityCode.GTE_Legendary,
      ]
      for (const t of tiers) {
        if (presentAt(t, earliestLevel) >= presenceNeed) { return applyFloor(t) }
      }
    }
  }
  if (clamped <= targetCand) return applyFloor(candidate)
  const rollLevelsMyth = rollLevelsForRarityCode(RarityCode.Mythical)
  const preMyth = rarityIncludesMythical(RarityCode.Mythical) ? 1 : 0
  const rollsUpTo16Myth = LEVELS.filter(l => l <= 16 && rollLevelsMyth.has(l)).length
  const rollsUpToStartMyth = LEVELS.filter(l => l <= minLevel && rollLevelsMyth.has(l)).length
  const targetMyth = baseline === 'upToLevel'
    ? (rollsUpTo16Myth + preMyth)
    : Math.max(0, (rollsUpTo16Myth - rollsUpToStartMyth) + (minLevel <= 0 ? preMyth : 0))
  if (clamped <= targetMyth) return applyFloor(RarityCode.Mythical)
  return applyFloor(candidate)
}

// Cache for roll distribution enumerations so identical (m, t) pairs reuse the same frozen tuples.
const rollDistributionCache = new Map<string, number[][]>()

// Generate integer compositions of t rolls among m substats: arrays length m sum to t
/**
 * Enumerate integer compositions of t rolls across m substats (orderless tuples).
 * Each row sums to t and has m non-negative integers.
 */
function rollDistributions(m: number, t: number): number[][] {
  const key = `${m}|${t}`
  const cached = rollDistributionCache.get(key)
  if (cached) return cached
  const res: number[][] = []
  function backtrack(i: number, remaining: number, acc: number[]) {
    if (i === m - 1) { res.push([...acc, remaining]); return }
    for (let v = 0; v <= remaining; v++) {
      acc.push(v)
      backtrack(i + 1, remaining - v, acc)
      acc.pop()
    }
  }
  backtrack(0, t, [])
  for (const tuple of res) {
    Object.freeze(tuple)
  }
  const frozen = Object.freeze(res.slice()) as unknown as number[][]
  rollDistributionCache.set(key, frozen)
  return frozen
}

// Public API: build rules according to config with substat permutations and level chain
// Base substatTargets per star and stat (IDs per types.ts). Units use integers (percent as points).
// Factory-default minima: these encode the lowest roll each substat can spawn with
// in-game. Collapse guards rely on these staying in sync with RSL Helper samples.
const BASE_MIN_6: Record<number, number> = {
  [StatVariant.HP_FLAT]: 200, // HP - alternatively Math.floor((200 + 565)/2)
  [StatVariant.HP]: 5,        // HP%
  [StatVariant.ATK_FLAT]: 15, // ATK - alternatively Math.floor((15 + 30)/2)
  [StatVariant.ATK]: 5,       // ATK%
  [StatVariant.DEF_FLAT]: 15, // DEF - alternatively Math.floor((15 + 30)/2)
  [StatVariant.DEF]: 5,       // DEF%
  [StatVariant.SPD]: 5,       // SPD
  [StatVariant.RES]: 9,       // RES
  [StatVariant.ACC]: 9,       // ACC
  [StatVariant.CR]: 5,        // CR%
  [StatVariant.CDMG]: 5,      // CDMG%
}

const BASE_MIN_5: Record<number, number> = {
  [StatVariant.HP_FLAT]: 136, // HP - alternatively Math.floor((136 + 450)/2)
  [StatVariant.HP]: 4,        // HP%
  [StatVariant.ATK_FLAT]: 12, // ATK - alternatively Math.floor((12 + 23)/2)
  [StatVariant.ATK]: 4,       // ATK%
  [StatVariant.DEF_FLAT]: 12, // DEF - alternatively Math.floor((12 + 23)/2)
  [StatVariant.DEF]: 4,       // DEF%
  [StatVariant.SPD]: 4,       // SPD
  [StatVariant.RES]: 8,       // RES
  [StatVariant.ACC]: 8,       // ACC
  [StatVariant.CR]: 4,        // CR%
  [StatVariant.CDMG]: 4,      // CDMG%
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
  // Propagate config metadata so exported HSF rows retain their builder lineage.
  const configId = (options && typeof options.configId === 'number' && Number.isFinite(options.configId) && options.configId > 0)
    ? Math.floor(options.configId)
    : null

  // Build permutation pool respecting fixed substats (variants only)
  // Canonicalize substat selection order so output does not depend on click order.
  const selectedPoolV = Array.isArray(cfg.substatsV) && cfg.substatsV.length > 0
    ? cfg.substatsV.map(Number).sort(compareVariants)
    : []
  // Preserve the literal fixed selections as entered so we can mirror UI locking faithfully.
  const fixedPoolRawV = Array.isArray(cfg.fixedSubstatsV) && cfg.fixedSubstatsV.length > 0 ? cfg.fixedSubstatsV.map(Number) : []
  // Normalize fixed to be a subset of selected; preserve order of appearance from selected
  const fixedPoolV = selectedPoolV.filter(sv => fixedPoolRawV.includes(Number(sv)))
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
    const combos = combinations(optionalPoolV, needLocal).map(opt => requiredV.concat(opt))
    combosCache.set(totalCount, combos)
    return combos
  }
  // Convert the HSF rank code into the substat target star bucket so thresholds stay coherent.
  const star = starForRankCode(rankCode, substatTargets.anyRankDefaultsTo ?? 6)

  // Resolve Auto rarity to a concrete rarity code before rule generation.
  // Use the shared resolver to keep UI and builder behavior identical.
  const rarityCode = (cfg.rarityMode === 'auto') ? resolveAutoRarityCode(cfg) : cfg.rarityCode

  const baseCoreGlobal = {
    ...(configId !== null ? { ConfigID: configId } : {}),
    ...(cfg.keep !== undefined ? { Keep: cfg.keep } : {}),
    ...(exportMode === 'disabled' ? { Use: false }
      : exportMode === 'active' ? { Use: true } : {}),
    // Only include set/type arrays when non-empty to match HSF samples
    ...(((cfg.artifactSets ?? []).length > 0)
      ? { ArtifactSet: (cfg.artifactSets ?? []).slice().sort(compareArtifactSets).map(Number) }
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
  type NormalizedRule = CanonicalRuleSelectors & {
    substats: Array<{ id: number; isFlat: boolean; condition: string; value: number }>
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
  const normalizeSubstats = (rule: HsfRule): NormalizedRule['substats'] => {
    if (!Array.isArray(rule.Substats) || rule.Substats.length === 0) return []
    const normalized: NormalizedRule['substats'] = []
    for (const sub of rule.Substats) {
      if (!sub) continue
      const statId = Number(sub.ID ?? StatId.Any)
      const condition = String(sub.Condition ?? '')
      if (condition.length === 0) continue
      if (statIsAny(statId)) continue
      normalized.push({
        id: statId,
        isFlat: Boolean(sub.IsFlat),
        condition,
        value: Number(sub.Value ?? 0),
      })
    }
    normalized.sort((a, b) => {
      if (a.id !== b.id) return a.id - b.id
      if (a.isFlat !== b.isFlat) return (a.isFlat ? 1 : 0) - (b.isFlat ? 1 : 0)
      if (a.condition !== b.condition) return a.condition < b.condition ? -1 : 1
      return a.value - b.value
    })
    return normalized
  }
  // Substat sorting keeps comparisons deterministic for pruning signatures.
  const normalizeRule = (rule: HsfRule): NormalizedRule => ({
    ...canonicalizeRuleSelectors(rule),
    substats: normalizeSubstats(rule),
  })
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
  // Treat the candidate as covering the base when it satisfies the same or looser bound.
  const conditionValueCovers = (base: { condition: string; value: number }, candidateValue: number): boolean => {
    switch (base.condition) {
    case '>=': return candidateValue >= base.value
    case '<=': return candidateValue <= base.value
    case '=': return candidateValue === base.value
    default: return false
    }
  }
  // A rule dominates when it matches selectors and requires no stricter substat thresholds.
  const ruleCovers = (general: NormalizedRule, target: NormalizedRule): boolean => {
    if (!general.keep && target.keep) return false
    if (general.keep !== target.keep) return false
    if (general.use !== target.use) return false
    if (general.rank !== target.rank) return false
    if (general.rarity !== target.rarity) return false
    if (general.faction !== target.faction) return false
    if (general.mainId !== target.mainId) return false
    if (general.mainF !== target.mainF) return false
    if (general.lvl !== target.lvl) return false
    if (general.setsKey !== target.setsKey) return false
    if (general.typesKey !== target.typesKey) return false
    const generalSubs = general.substats
    if (generalSubs.length === 0) return false
    if (generalSubs.length > target.substats.length) return false
    const remaining = target.substats.slice()
    for (const sub of generalSubs) {
      const idx = remaining.findIndex(candidate =>
        candidate.id === sub.id &&
        candidate.isFlat === sub.isFlat &&
        candidate.condition === sub.condition &&
        conditionValueCovers(sub, candidate.value))
      if (idx === -1) return false
      remaining.splice(idx, 1)
    }
    return true
  }
  // Drop dominated rows before final sort so Preview/HsF output stays minimal yet correct.
  const pruneDominatedRules = () => {
    if (rules.length <= 1) return
    const normalized = rules.map(normalizeRule)
    const keep = new Array<boolean>(rules.length).fill(true)
    for (let i = 0; i < normalized.length; i++) {
      if (!keep[i]) continue
      const general = normalized[i]!
      for (let j = 0; j < normalized.length; j++) {
        if (i === j || !keep[j]) continue
        const target = normalized[j]!
        if (ruleCovers(general, target)) {
          keep[j] = false
        }
      }
    }
    if (keep.every(flag => flag)) return
    let writeIdx = 0
    for (let idx = 0; idx < rules.length; idx++) {
      if (!keep[idx]) continue
      if (writeIdx !== idx) {
        rules[writeIdx] = rules[idx]!
        emissionMeta[writeIdx] = emissionMeta[idx]!
      }
      writeIdx++
    }
    rules.length = writeIdx
    emissionMeta.length = writeIdx
  }
  const finalizeRules = () => {
    pruneDominatedRules()
    if (rules.length <= 1) return rules
    const order = rules.map((_, idx) => idx)
    order.sort((a, b) => {
      const ma = emissionMeta[a]!
      const mb = emissionMeta[b]!
      if (ma.levelIdx !== mb.levelIdx) return ma.levelIdx - mb.levelIdx
      if (ma.branchIdx !== mb.branchIdx) return ma.branchIdx - mb.branchIdx
      return ma.seq - mb.seq
    })
    let reordered = false
    for (let i = 0; i < order.length; i++) {
      if (order[i]! !== i) { reordered = true; break }
    }
    if (!reordered) return rules
    const sorted = order.map(idx => rules[idx]!)
    rules.splice(0, rules.length, ...sorted)
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
    const subsV = (Array.isArray(cfg.substatsV) && cfg.substatsV.length > 0) ? cfg.substatsV : []
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
      const numRollsForThisLevel = baseline === 'upToLevel'
        ? (rollsUpToLvl + preRolls)
        : Math.max(0, (rollsUpToLvl - rollsUpToStart) + preRollsByStart)
      // For potential-keep calculations, consider target as +16
      const rollsUpTo16 = LEVELS.filter(l => l <= 16 && rollLevels.has(l)).length
      const numRollsByTarget = baseline === 'upToLevel'
        ? (rollsUpTo16 + preRolls)
        : Math.max(0, (rollsUpTo16 - rollsUpToStart) + preRollsByStart)
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
      const sumLocked = (arr: number[]) => arr.reduce((acc, val, idx) => acc + (lockedMask[idx] ? val : 0), 0)
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
      const introAssignments = introAssignmentsForCombo(m, baseSlots, additionAvailable, forcedBaseIndices)
      // Utility helper to count how many roll milestones satisfy the provided filter.
      const countRollEvents = (predicate: (level: LevelMilestone) => boolean): number => {
        let count = 0
        for (const eventLevel of rollTimeline) {
          if (predicate(eventLevel)) count += 1
        }
        return count
      }
      // Note: We do not prune substat-slot impossibilities here to keep
      // rule generation broad; RSL matching will naturally ignore rows that
      // cannot match for the selected slot.
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
      const sumTargeted = (arr: number[]) => arr.reduce((acc, val, i) => acc + (targetedMask[i] ? val : 0), 0)
      const canSatisfyLocked = (current: number, remaining: number) => {
        if (!lockedMinActive) return true
        return (current >= lockedMinValue) || ((lockedMinValue - current) <= remaining)
      }
      const sumEqTargeted = (arr: number[], target: number) => sumTargeted(arr) === target

      for (const introLevels of introAssignments) {
        // Lower-bound rule: enforce per-substat minimum rolls regardless of how additional rolls distribute.
        // This enables targets like "SPD (1) keeps items with at least 1 SPD roll" even when SPD is the only selected substat.
        // Only emit if (a) any substat specifies a min>0 bound, and (b) it's feasible at this level
        // given the number of rolls available by baseline (sum(mins) <= numRollsForThisLevel).
        const mins: number[] = []
        const maxs: Array<number | undefined> = []
        const anyFlags: boolean[] = []
        const comboSubIds: number[] = []
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
          const statId = variantToSub(v).id
          comboSubIds.push(statId)
          if (mv > 0) anyMin = true
          if (any) anyWildcard = true
        }
        const targetValueFor = (idx: number, rollsApplied: number): number => {
          // Roll-count pseudo stat maps to applied rolls directly.
          const statId = comboSubIds[idx]!
          if (statId === StatId.RollCount) return rollsApplied
          const entry = targetEntries[idx]
          if (rollsApplied <= 0 && typeof entry?.base === 'number') {
            return entry.base
          }
          if (rollsApplied > 0) {
            const override = entry?.increments?.[rollsApplied - 1]
            if (typeof override === 'number') {
              return override
            }
          }
          const base = baseVals[idx]!
          return base + rollsApplied * base
        }
        const maxThresholds: Array<number | undefined> = maxs.map((cap, idx) => (
          // Precompute <= thresholds so wildcard-driven caps reuse the same values.
          cap === undefined ? undefined : targetValueFor(idx, cap)
        ))
        const setThreshold = (rule: HsfRule, idx: number, rollsApplied: number) => {
          const hasMin = mins[idx]! > 0
          const cap = maxs[idx]
          if (cap !== undefined && !hasMin) {
            // Pure max-only bounds emit <= rows to mirror UI semantics.
            const limit = maxThresholds[idx] ?? 0
            rule.Substats[idx]!.Condition = '<='
            rule.Substats[idx]!.Value = limit
            return
          }
          const value = targetValueFor(idx, rollsApplied)
          rule.Substats[idx]!.Condition = '>='
          rule.Substats[idx]!.Value = value
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
        const mythPreCount = (rarityIncludesMythical(rarityCodeLocal) ? 1 : 0) + mythPreExtra
        // Availability/target counters include Any→Mythical pre-roll modeling when applicable.
        const avail = numRollsForThisLevel + mythPreExtra
        const numTarget = numRollsByTarget + mythPreExtra
        const remaining = Math.max(0, numTarget - avail)
      const emitPresence = () => {
        // Flex permutations (autoSubstatFlex) emit presence rows for every
        // supersized combo (minCount+ extras) by default. Those combos add no
        // extra coverage when all additional substats are just optional
        // wildcards at their baseline — the shorter combo already keeps the
          // item. Skip emitting those rows to avoid redundant identical rules
          // like the HP/DEF double-presence reported for Ring Limited Sets.
        if (flexActive && combo.length > minTargetCount) return
        const comboSubs = combo.map(v => variantToSub(v))
        if (mainChoicesV.length === 0) {
          const r = makeRule({ ...baseCore, MainStatID: StatId.Any, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
          for (let i = 0; i < combo.length; i++) setThreshold(r, i, 0)
          pushRule(r)
        } else {
          for (const mnV of mainChoicesV) {
            if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
            if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
            const mT = variantToMain(mnV)
            const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
            for (let i = 0; i < combo.length; i++) setThreshold(r, i, 0)
            pushRule(r)
          }
        }
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
          const comboSubs = combo.map(v => variantToSub(v))
          if (mainChoicesV.length === 0) {
            const r = makeRule({ ...baseCore, MainStatID: StatId.Any, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
            setThreshold(r, 0, applied)
            pushRule(r)
          } else {
            for (const mnV of mainChoicesV) {
              if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
              if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
              const mT = variantToMain(mnV)
              const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
              setThreshold(r, 0, applied)
              pushRule(r)
            }
          }
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
          const comboSubs = combo.map(v => variantToSub(v))
          if (mainChoicesV.length === 0) {
            const r = makeRule({ ...baseCore, MainStatID: StatId.Any, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
            setThreshold(r, 0, applied)
            pushRule(r)
          } else {
            for (const mnV of mainChoicesV) {
              if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
              if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
              const mT = variantToMain(mnV)
              const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
              setThreshold(r, 0, applied)
              pushRule(r)
            }
          }
          continue
        }
        // Enumerate strict roll allocations where every roll must land on a selected stat.
        const emitDists = (predicate: (dist: number[]) => boolean) => {
          let emitted = false
          for (const dist of rollDistributions(m, avail)) {
            // Enforce upper limits first
            let overMax = false
            for (let i = 0; i < m; i++) {
            if (maxs[i] !== undefined && dist[i]! > (maxs[i]! as number)) { overMax = true; break }
          }
          if (overMax) continue
          let overTimeline = false
          for (let i = 0; i < m; i++) {
            if (timelineCaps[i] !== undefined && dist[i]! > timelineCaps[i]!) { overTimeline = true; break }
          }
          if (overTimeline) continue
          // In strict distributions, all rolls are allocated to selected substats.
          if (globalMin > 0) {
            const s = sumTargeted(dist)
            if (s < globalMin) continue
          }
          if (lockedMinActive) {
            const lockedSum = sumLocked(dist)
            if (lockedSum < lockedMinValue) continue
          }
            if (!predicate(dist)) continue
            let optionalOnlyBaseline = false
            const values: number[] = []
            for (let i = 0; i < m; i++) {
              const v = baseVals[i]! + dist[i]! * baseVals[i]!
              values.push(v)
              if (combo.length > minTargetCount && optionalMask[i] && v === baseVals[i]!) {
                optionalOnlyBaseline = true
              }
            }
            if (optionalOnlyBaseline) continue
            const comboSubs = combo.map(v => variantToSub(v))
            if (mainChoicesV.length === 0) {
              const r = makeRule({ ...baseCore, MainStatID: StatId.Any, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
              for (let i = 0; i < m; i++) setThreshold(r, i, dist[i]!)
              pushRule(r)
            } else {
              for (const mnV of mainChoicesV) {
                if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
                if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
                const mT = variantToMain(mnV)
                const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
                for (let i = 0; i < m; i++) setThreshold(r, i, dist[i]!)
                pushRule(r)
              }
            }
            emitted = true
          }
          return emitted
        }
        // Like emitDists, but allow some of the available rolls to go to non-targeted substats.
        // Implemented by adding a single "other" bucket that can absorb any leftover rolls.
        // Variant that allows spare rolls to land on "other" stats using a sink bucket.
        const emitDistsAllowOther = (predicate: (dist: number[]) => boolean) => {
          const addSet = additionLevelsForRarityCode(rarityCode)
          const totalAdds = addSet.size
          const baseStart = Math.max(0, 4 - totalAdds)
          const addsSoFar = Array.from(addSet).filter(a => a <= lvl).length
          const present = Math.min(4, baseStart + addsSoFar)
          const othersCount = Math.max(0, present - m)

          const run = (includeVirtualSink: boolean): boolean => {
            let emitted = false
            const dims = m + (othersCount > 0 ? 1 : 0) + (includeVirtualSink ? 1 : 0)
            for (const dist of rollDistributions(dims, avail)) {
              const sel = dist.slice(0, m)
              let overMax = false
              for (let i = 0; i < m; i++) {
                if (maxs[i] !== undefined && sel[i]! > (maxs[i]! as number)) { overMax = true; break }
              }
              if (overMax) continue
              let overTimeline = false
              for (let i = 0; i < m; i++) {
                if (timelineCaps[i] !== undefined && sel[i]! > timelineCaps[i]!) { overTimeline = true; break }
              }
              if (overTimeline) continue
              if (globalMin > 0) {
                const s = sumTargeted(sel)
                const rollsUpTo16 = LEVELS.filter(l => l <= 16 && rollLevels.has(l)).length
                const numTarget = baseline === 'upToLevel'
                  ? (rollsUpTo16 + mythPreCount)
                  : Math.max(0, (rollsUpTo16 - rollsUpToStart) + (effectiveStart <= 0 ? mythPreCount : 0))
                const remaining = Math.max(0, numTarget - avail)
                if (!(s >= globalMin || (globalMin - s) <= remaining)) continue
                const lockedSum = sumLocked(sel)
                if (!canSatisfyLocked(lockedSum, remaining)) continue
              }
              if (!predicate(sel)) continue
              const values: number[] = []
              let optionalOnlyBaseline = false
              for (let i = 0; i < m; i++) {
                const v = baseVals[i]! + sel[i]! * baseVals[i]!
                values.push(v)
                if (combo.length > minTargetCount && optionalMask[i] && v === baseVals[i]!) {
                  optionalOnlyBaseline = true
                }
              }
              if (optionalOnlyBaseline) continue
            const comboSubs = combo.map(v => variantToSub(v))
            if (mainChoicesV.length === 0) {
              const r = makeRule({ ...baseCore, MainStatID: StatId.Any, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
              for (let i = 0; i < m; i++) setThreshold(r, i, sel[i]!)
              pushRule(r)
            } else {
              for (const mnV of mainChoicesV) {
                if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
                if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
                const mT = variantToMain(mnV)
                const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
                for (let i = 0; i < m; i++) setThreshold(r, i, sel[i]!)
                pushRule(r)
              }
            }
            emitted = true
          }
            return emitted
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
          const comboSubs = combo.map(v => variantToSub(v))
          if (mainChoicesV.length === 0) {
            const r = makeRule({ ...baseCore, MainStatID: StatId.Any, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
            for (let i = 0; i < m; i++) setThreshold(r, i, mins[i]!)
            pushRule(r)
          } else {
            for (const mnV of mainChoicesV) {
              if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
              if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
              const mT = variantToMain(mnV)
              const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
              for (let i = 0; i < m; i++) setThreshold(r, i, mins[i]!)
              pushRule(r)
            }
          }
          return true
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
              // Enumerate all minimal distributions of `extra` across constrained stats
              const solutions: number[][] = []
              const dist = (i: number, left: number, acc: number[]) => {
                if (i === m) {
                  if (left === 0) solutions.push(acc.slice())
                  return
                }
                const cap = addCaps[i]!
                const maxTake = Math.min(cap, left)
                for (let v = 0; v <= maxTake; v++) {
                  acc.push(v)
                  dist(i + 1, left - v, acc)
                  acc.pop()
                }
              }
              if (extra === 0) {
                solutions.push(Array(m).fill(0))
              } else {
                dist(0, extra, [])
              }
              const comboSubs = combo.map(v => variantToSub(v))
              const emitWith = (inc: number[]) => {
                if (lockedNeedAtLevel > 0) {
                  const lockedAfter = baseLockedNeed + inc.reduce((sum, val, idx) => sum + (lockedMask[idx] ? val : 0), 0)
                  if (lockedAfter < lockedNeedAtLevel) {
                    return
                  }
                }
                const optionalRowsOnlyBaseline = (
                  combo.length > minTargetCount &&
                  optionalMask.some(Boolean) &&
                  optionalMask.every((isOptional, idx) => {
                    if (!isOptional) return true
                    if (mins[idx]! !== 0) return false
                    const applied = needNow[idx]! + inc[idx]!
                    return applied === 0
                  })
                )
                if (optionalRowsOnlyBaseline) {
                  return
                }
                if (mainChoicesV.length === 0) {
                  const r = makeRule({ ...baseCore, MainStatID: StatId.Any, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
                  for (let i = 0; i < m; i++) setThreshold(r, i, needNow[i]! + inc[i]!)
                  pushRule(r)
                } else {
                  for (const mnV of mainChoicesV) {
                    if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
                    if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
                    const mT = variantToMain(mnV)
                    const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
                    for (let i = 0; i < m; i++) setThreshold(r, i, needNow[i]! + inc[i]!)
                    pushRule(r)
                  }
                }
              }
              for (const inc of solutions) emitWith(inc)
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
                    const comboSubs = combo.map(v => variantToSub(v))
                    // Per-index available additional raises
                    const addCaps: number[] = new Array(m)
                    for (let i = 0; i < m; i++) {
                      const cap = (typeof maxs[i] === 'number') ? (maxs[i]! as number) : 4
                      addCaps[i] = Math.max(0, Math.min(mins[i]!, cap) - needNow[i]!)
                    }
                    const solutions: number[][] = []
                    const dist = (i: number, left: number, acc: number[]) => {
                      if (i === m) {
                        if (left === 0) solutions.push(acc.slice())
                        return
                      }
                      const cap = addCaps[i]!
                      const maxTake = Math.min(cap, left)
                      for (let v = 0; v <= maxTake; v++) {
                        acc.push(v)
                        dist(i + 1, left - v, acc)
                        acc.pop()
                      }
                    }
                    if (extra === 0) {
                      solutions.push(Array(m).fill(0))
                    } else {
                      dist(0, extra, [])
                    }
                    const emitWith = (inc: number[]) => {
                      if (lockedNeedAtLevel > 0) {
                        const lockedAfter = baseLockedNeed + inc.reduce((sum, val, idx) => sum + (lockedMask[idx] ? val : 0), 0)
                        if (lockedAfter < lockedNeedAtLevel) {
                          return
                        }
                      }
                      if (mainChoicesV.length === 0) {
                        const r = makeRule({ ...baseCore, MainStatID: StatId.Any, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
                        for (let i = 0; i < m; i++) setThreshold(r, i, needNow[i]! + inc[i]!)
                        pushRule(r)
                      } else {
                        for (const mnV of mainChoicesV) {
                          if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
                          if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
                          const mT = variantToMain(mnV)
                          const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
                          for (let i = 0; i < m; i++) setThreshold(r, i, needNow[i]! + inc[i]!)
                          pushRule(r)
                        }
                      }
                    }
                    for (const inc of solutions) emitWith(inc)
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
              // emitDists enforces globalMin across selected substats by construction
              emitDists(() => true)
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
                emitDistsAllowOther((sel) => sumEqTargeted(sel, needNow))
              } else {
                // Not feasible yet at this level
              }
            } else if (globalMin > 0) {
              const need = Math.min(globalMin, avail)
              // Early minimal enumerations with an implicit "other" bucket.
              emitDistsAllowOther((sel) => sumEqTargeted(sel, need))
            } else {
              // No aggregate minimum: mirror "min=0" behavior. Early enumerates
              // selected sums 0..avail via an implicit "other" bucket; Late keeps
              // rows concise (presence only).
              if (earlyMode === 'late') {
                emitPresence()
              } else {
                emitDistsAllowOther(() => true)
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
                emitDists((dist) => {
                  for (let i = 0; i < m; i++) { if (dist[i]! < mins[i]!) return false }
                  return true
                })
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
            emitDistsAllowOther((sel) => {
              if (globalMin <= 0) return true
              const s = sel.reduce((a, b) => a + b, 0)
              const rollsUpTo16 = LEVELS.filter(l => l <= 16 && rollLevels.has(l)).length
              const numTarget = baseline === 'upToLevel'
                ? (rollsUpTo16 + mythPreCount)
                : Math.max(0, (rollsUpTo16 - rollsUpToStart) + (effectiveStart <= 0 ? mythPreCount : 0))
              const remaining = Math.max(0, numTarget - avail)
              return (s >= globalMin) || ((globalMin - s) <= remaining)
            })
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
                emitDistsAllowOther((sel) => sumEqTargeted(sel, needNow))
              } else {
                // Not feasible yet at this level
              }
            } else if (globalMin > 0) {
              const need = Math.min(globalMin, avail)
              emitDistsAllowOther((sel) => sumEqTargeted(sel, need))
            } else {
              // No aggregate minimum: mirror "min=0" behavior.
              if (earlyMode === 'late') {
                emitPresence()
              } else {
                emitDistsAllowOther(() => true)
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
                const remaining = Math.max(0, numTarget - avail)
                emitDistsAllowOther((sel) => {
                  // Enforce per‑stat mins on all selected stats
                  for (let i = 0; i < m; i++) { if (sel[i]! < mins[i]!) return false }
                  // Minimal targeted progress at this level
                  const targetedNow = sumTargeted(sel)
                  if (targetedNow !== needTargetNow) return false
                  // Ensure aggregate can still be met by the target level
                  if ((globalMin - targetedNow) > remaining) return false
                  return true
                })
              } else {
                emitMinOnly()
              }
            } else {
              // Partial progress before feasibility; enumerate only selected stats allocations
              // and ensure deficits can still be made up by target.
              const sumMinTargeted3 = mins.reduce((a, v, i) => a + (targetedMask[i] ? (v ?? 0) : 0), 0)
              const willEmitMinOnly = !((globalMin > 0 && globalMin > sumMinTargeted3) || needsLockedAggregate)
              emitDists((dist) => {
                let deficit = 0
                let isExactMin = true
                for (let i = 0; i < m; i++) {
                  if (!anyFlags[i]) {
                    // Early progress rows: allow allocations below or above per-stat mins;
                    // feasibility is handled via aggregate deficit check.
                    deficit += Math.max(0, mins[i]! - dist[i]!)
                  }
                  if (dist[i]! !== mins[i]!) isExactMin = false
                }
                // Also honor aggregate minimum across selected substats
                if (globalMin > 0) {
                  const s = sumTargeted(dist)
                  const rollsUpTo16 = LEVELS.filter(l => l <= 16 && rollLevels.has(l)).length
                  const numTarget = baseline === 'upToLevel'
                    ? (rollsUpTo16 + mythPreCount)
                    : Math.max(0, (rollsUpTo16 - rollsUpToStart) + (effectiveStart <= 0 ? mythPreCount : 0))
                  const remaining = Math.max(0, numTarget - avail)
                  if (!(s >= globalMin || (globalMin - s) <= remaining)) return false
                }
                if (!(deficit <= remaining)) return false
                if (isExactMin && willEmitMinOnly) return false
                return true
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
          const baseValsFull = fullSelV.map(v => baseMinForStarV(Number(v), star, substatTargets))
          const comboSubIdsFull = fullSelV.map(v => variantToSub(v).id)
          const maxThresholdsFull: Array<number | undefined> = maxsFull.map((cap, idx) => {
            if (cap === undefined) return undefined
            const statId = comboSubIdsFull[idx]!
            if (statId === StatId.RollCount) return cap
            const base = baseValsFull[idx]!
            return base + cap * base
          })
          const setFullThreshold = (rule: HsfRule, idx: number, rollsApplied: number) => {
            const hasMin = minsFull[idx]! > 0
            const cap = maxsFull[idx]
            if (cap !== undefined && !hasMin) {
              const limit = maxThresholdsFull[idx] ?? 0
              rule.Substats[idx]!.Condition = '<='
              rule.Substats[idx]!.Value = limit
              return
            }
            const base = baseValsFull[idx]!
            const statId = comboSubIdsFull[idx]!
            const value = (statId === StatId.RollCount)
              ? rollsApplied
              : (base + rollsApplied * base)
            rule.Substats[idx]!.Condition = '>='
            rule.Substats[idx]!.Value = value
          }
          const mF = fullSelV.length
          const emitFull = (dist: number[]) => {
            const comboSubs = fullSelV.map(v => variantToSub(v))
                if (mainChoicesV.length === 0) {
                  const r = makeRule({ ...baseCore, MainStatID: StatId.Any, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
                  for (let i = 0; i < mF; i++) setFullThreshold(r, i, dist[i]!)
                  pushRule(r)
                } else {
                  for (const mnV of mainChoicesV) {
                    if (fullSelV.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
                    if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
                    const mT = variantToMain(mnV)
                    const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
                    for (let i = 0; i < mF; i++) setFullThreshold(r, i, dist[i]!)
                    pushRule(r)
                  }
                }
          }
          for (const dist of rollDistributions(mF, availFull)) {
            // Enforce per-substat upper limits
            let overMax = false
            for (let i = 0; i < mF; i++) {
              if (maxsFull[i] !== undefined && dist[i]! > (maxsFull[i]! as number)) { overMax = true; break }
            }
            if (overMax) continue
            // Feasibility by target: remaining rolls can cover the deficit to mins
            let deficit = 0
            for (let i = 0; i < mF; i++) {
              if (!anyFlagsFull[i]) deficit += Math.max(0, minsFull[i]! - dist[i]!)
            }
            if (deficit <= Math.max(0, numTargetFull - availFull)) emitFull(dist)
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
