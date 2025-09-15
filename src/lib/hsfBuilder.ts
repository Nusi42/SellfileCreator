/**
 * hsfBuilder.ts
 *
 * Core builder that turns a BuilderConfig and MinimaTable into concrete HSF
 * rules. Handles mainstat unrolling, substat combinations, roll-baseline math,
 * rarity schedules, minima application, and per-substat roll bounds.
 */
import type { HsfRule } from './hsfTypes'
import { StatVariant, compareArtifactSets, compareArtifactTypes, compareVariants, anySelectedSlotSupportsMain } from './types'
import { variantToSub, variantToMain } from './hsfTypes'
import type { ArtifactSetId, ArtifactTypeId, FactionId } from './types'

// Simple inputs for the HSF rule builder
export interface BuilderConfig {
  // Optional display name for this rule configuration (saved in HSFR)
  name?: string
  keep: boolean
  // Whether generated HSF rules from this config are enabled (HSF.Use). Default: true
  enabled?: boolean
  // New: explicit level window for which to emit rules (inclusive)
  // If omitted, legacy fields determine the behavior (back-compat):
  // - rollMode === 'off' => presence-only path (uses startLevel or Any)
  // - otherwise => minLevel = startLevel (number or 0), maxLevel = 16
  minLevel?: 0 | 4 | 8 | 12 | 16
  maxLevel?: 0 | 4 | 8 | 12 | 16
  // Rank code: HSF-compatible (0..16): exact 1..6, >=1..>=5 (7..11), <=2..<=6 (12..16), 0 any
  rankCode: number
  // Rarity selection:
  // - When rarityMode === 'auto', the builder resolves an effective rarity
  //   code before generating HSF rules using the current level window and
  //   roll requirements (per‑stat mins and aggregate minRequiredRolls).
  // - When rarityMode !== 'auto', use the explicit HSF-compatible 0..16 code.
  rarityCode: number
  rarityMode?: 'auto' | 'code'
  // Faction code (0 Any, 1..15 per factionNames in types.ts)
  factionCode?: FactionId
  // Main stats (variants). Empty -> Any. If provided, we unroll rules per selected main stat.
  mainStatsV?: StatVariant[]
  // Starting level selection (0, 4, 8, 12, 16). Special 'any' is allowed only with rollMode='off'.
  startLevel: 0 | 4 | 8 | 12 | 16 | 'any'
  // How to treat rolls relative to start level when generating thresholds
  // 'afterStart' (default): treat start as a reset; only rolls after start count
  // 'upToLevel': include prior rolls up to each milestone (incl. start)
  rollBaseline?: 'afterStart' | 'upToLevel'
  // Roll generation mode: 'off' (start only), 'strict' (milestones strict), 'potential' (strict + early relaxed keeps),
  // 'auto' (strict if no substats selected; potential if at least one substat selected)
  rollMode: 'off' | 'strict' | 'potential' | 'auto'
  // Substat targets (variants): choose K from this set; generate combinations of size minCount
  substatsV?: StatVariant[]
  // Substats that must always be included in generated permutations (subset of substats)
  fixedSubstatsV?: StatVariant[]
  // Optional per-substat roll bounds used to filter distributions
  // Variant-keyed: key is StatVariant (encoded number)
  // min: require at least N rolls; max: optional upper bound; any: wildcard (permute all)
  substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean }>
  minCount: 0 | 1 | 2 | 3 | 4
  // When true, UI keeps minCount in sync with selected substat count: min(4, substats.length)
  autoMinCount?: boolean
  // Global minimum total rolls across the selected substats.
  // When active, generated rows ensure the sum of rolls assigned to the targeted
  // substats meets or can reach this total by the target level (Potential mode).
  // Auto = no additional aggregate constraint beyond per-substat mins.
  minRequiredRolls?: 0 | 1 | 2 | 3 | 4 | 5
  autoMinRequiredRolls?: boolean
  // Aggregate minimum rolls target scope: by default, the global MinRequiredRolls
  // applies across all selected substats in a rule. When set to 'locked', the
  // aggregate minimum applies only to locked substats (fixedSubstatsV). This
  // enables configs where only the must-have stats need to meet the sum.
  // Default: 'selected'.
  substatMinTarget?: 'selected' | 'locked'
  // Optional slot and set filters (HSF numeric IDs or enums); omit for Any
  artifactTypes?: ArtifactTypeId[]
  artifactSets?: ArtifactSetId[]
  // Optional metaset references (IDs defined in HSFR Metasets)
  artifactMetaSets?: string[]
  // Early/Late keep mode:
  // - 'early' (formerly 'progressive'): thresholds rise with gained rolls until feasible, then stay fixed.
  // - 'late' (formerly 'reachable'): require only what must be present now so +16 remains achievable.
  // Default: 'early'.
  earlyKeepMode?: 'early' | 'late'
}

// Levels: 0/4/8/12/16 are milestone checks.
export const LEVELS: Array<0|4|8|12|16> = [0,4,8,12,16]

// User-configurable minima table for substats per star bucket
export type MinimaTable = {
  one: Record<number, number>
  two: Record<number, number>
  three: Record<number, number>
  four: Record<number, number>
  five: Record<number, number>
  six: Record<number, number>
}

// Generate all combinations of size k from array a
/**
 * Generate all k-sized combinations from array a (without repetition).
 * Returns an array of arrays, each a distinct selection of k items in order of indices.
 */
function combinations<T>(a: T[], k: number): T[][] {
  if (k <= 0) return [[]]
  if (k > a.length) return []
  const res: T[][] = []
  function backtrack(start: number, path: T[]) {
    if (path.length === k) { res.push([...path]); return }
    for (let i = start; i < a.length; i++) {
      path.push(a[i]!)
      backtrack(i + 1, path)
      path.pop()
    }
  }
  backtrack(0, [])
  return res
}

// Build a single HSF rule from pieces
/**
 * Construct an HSF rule from a base (without Substats) and a list of substats.
 * Pads substats to length 4 with ID=-1 when fewer are provided, as expected by HSF.
 */
function makeRule(base: Omit<HsfRule, 'Substats'> & { Substats?: HsfRule['Substats'] }, subs: Array<{ id: number; isFlat?: boolean }>): HsfRule {
  const filled: HsfRule['Substats'] = []
  // Presence requirement: Condition ">=" with Value 0 seems to encode "has this substat"
  for (const s of subs) {
    filled.push({ ID: s.id, Value: 0, IsFlat: Boolean(s.isFlat), NotAvailable: false, Condition: '>=' })
  }
  // pad to 4 entries with ANY
  while (filled.length < 4) {
    filled.push({ ID: -1, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' })
  }
  // Current RSL Helper behavior: OR/AND flag does not affect matching for our
  // generated rules. To reduce variance across HSF consumers, export
  // IsRuleTypeAND=false consistently. If RSL semantics change, this can be
  // revisited.
  const isAnd = false
  return {
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
  // '-1' main means Any -> never identical
  if (main.id === -1) return false
  // HP/ATK/DEF have both flat (f=1) and percent (f=0) variants
  if (main.id === 1 || main.id === 2 || main.id === 3) {
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
function rollLevelsForRarityCode(rarityCode: number): Set<0|4|8|12|16> {
  // Map HSF rarity code to an exact roll schedule bucket per ARTIFACT_RULES.md
  // Common: none; Uncommon: [4]; Rare: [4,8]; Epic: [4,8,12]; Legendary/Mythical: [4,8,12,16]
  const byExact = {
    Common: new Set<0|4|8|12|16>([]),
    Uncommon: new Set<0|4|8|12|16>([4]),
    Rare: new Set<0|4|8|12|16>([4, 8]),
    Epic: new Set<0|4|8|12|16>([4, 8, 12]),
    Legendary: new Set<0|4|8|12|16>([4, 8, 12, 16]),
    Mythical: new Set<0|4|8|12|16>([4, 8, 12, 16]),
  }
  // Exact codes
  if (rarityCode === 1) return byExact.Common
  if (rarityCode === 2) return byExact.Uncommon
  if (rarityCode === 3) return byExact.Rare
  if (rarityCode === 4) return byExact.Epic
  if (rarityCode === 5) return byExact.Legendary
  if (rarityCode === 15) return byExact.Mythical
  // Ranges (conservative lower-bound schedule for ≥ ranges)
  if (rarityCode === 6) return byExact.Common
  if (rarityCode === 7) return byExact.Uncommon
  if (rarityCode === 8) return byExact.Rare
  if (rarityCode === 9) return byExact.Epic
  if (rarityCode === 16) return byExact.Legendary
  // <= Uncommon..<= Epic (10..12): map to that upper bound
  if (rarityCode === 10) return byExact.Uncommon
  if (rarityCode === 11) return byExact.Rare
  if (rarityCode === 12) return byExact.Epic
  // <= Legendary (13) or <= Mythical (14): includes Legendary/Mythical
  if (rarityCode === 13 || rarityCode === 14) return byExact.Legendary
  // 0 (Any) -> Legendary
  return byExact.Legendary
}

// Addition schedule: levels where a new substat is added (not rolled), per rarity
/**
 * Levels where a new substat is added for the given rarity code.
 * Used to derive presence-only constraints when roll mode is off.
 */
function additionLevelsForRarityCode(rarityCode: number): Set<0|4|8|12|16> {
  const byExact = {
    Common: new Set<0|4|8|12|16>([4,8,12,16]),
    Uncommon: new Set<0|4|8|12|16>([8,12,16]),
    Rare: new Set<0|4|8|12|16>([12,16]),
    Epic: new Set<0|4|8|12|16>([16]),
    Legendary: new Set<0|4|8|12|16>([]),
    Mythical: new Set<0|4|8|12|16>([]),
  }
  // Exact codes
  if (rarityCode === 1) return byExact.Common
  if (rarityCode === 2) return byExact.Uncommon
  if (rarityCode === 3) return byExact.Rare
  if (rarityCode === 4) return byExact.Epic
  if (rarityCode === 5) return byExact.Legendary
  if (rarityCode === 15) return byExact.Mythical
  // Special cases for ranges and Any
  // 0 (Any): treat presence as ≥ Legendary (no additions) so +0 has all substats present.
  // This avoids suppressing +0 rows when no explicit rarity is selected, while
  // still relying on roll schedules and MinRequiredRolls to shape thresholds.
  if (rarityCode === 0) return byExact.Legendary
  // >= Common..>= Epic (6..9): map to the lower bound's addition schedule
  if (rarityCode === 6) return byExact.Common
  if (rarityCode === 7) return byExact.Uncommon
  if (rarityCode === 8) return byExact.Rare
  if (rarityCode === 9) return byExact.Epic
  // >= Legendary (16): Legendary/Mythical have no additions
  if (rarityCode === 16) return byExact.Legendary
  // ≤ Uncommon..≤ Mythical (10..14): assume Common additions are possible within the range
  if (rarityCode >= 10 && rarityCode <= 14) return byExact.Common
  // Fallback
  return byExact.Legendary
}

// Whether the given rarity code includes Mythical items
/** True if rarity selection includes Mythical, impacting pre-roll logic. */
function rarityIncludesMythical(rarityCode: number): boolean {
  // Exact Mythical
  if (rarityCode === 15) return true
  // Any (0): do NOT assume Mythical. Treat as non-Mythical for pre-roll logic.
  if (rarityCode === 0) return false
  // Conservative: ≥ ranges do not assume Mythical
  if (rarityCode >= 6 && rarityCode <= 9) return false
  if (rarityCode === 16) return false
  // <= Mythical (14)
  if (rarityCode === 14) return true
  // Other exacts and ranges do not include Mythical
  return false
}

// Generate integer compositions of t rolls among m substats: arrays length m sum to t
/**
 * Enumerate integer compositions of t rolls across m substats (orderless tuples).
 * Each row sums to t and has m non-negative integers.
 */
function rollDistributions(m: number, t: number): number[][] {
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
  return res
}

// Public API: build rules according to config with substat permutations and level chain
// Base minima per star and stat (IDs per types.ts). Units use integers (percent as points).
type Star = 1|2|3|4|5|6

const BASE_MIN_6: Record<number, number> = {
  [StatVariant.HP_FLAT]: 200, // HP
  [StatVariant.HP]: 5,        // HP%
  [StatVariant.ATK_FLAT]: 15, // ATK
  [StatVariant.ATK]: 5,       // ATK%
  [StatVariant.DEF_FLAT]: 15, // DEF
  [StatVariant.DEF]: 5,       // DEF%
  [StatVariant.SPD]: 5,       // SPD
  [StatVariant.RES]: 9,       // RES
  [StatVariant.ACC]: 9,       // ACC
  [StatVariant.CR]: 5,        // CR%
  [StatVariant.CDMG]: 5,      // CDMG%
}

const BASE_MIN_5: Record<number, number> = {
  [StatVariant.HP_FLAT]: 160, // HP
  [StatVariant.HP]: 4,        // HP%
  [StatVariant.ATK_FLAT]: 12, // ATK
  [StatVariant.ATK]: 4,       // ATK%
  [StatVariant.DEF_FLAT]: 12, // DEF
  [StatVariant.DEF]: 4,       // DEF%
  [StatVariant.SPD]: 4,       // SPD
  [StatVariant.RES]: 8,       // RES
  [StatVariant.ACC]: 8,       // ACC
  [StatVariant.CR]: 4,        // CR%
  [StatVariant.CDMG]: 4,      // CDMG%
}

// Explicit literals for lower-star minima (derived from 5-star by -1 per tier)
export const BASE_MIN_4: Record<number, number> = {
  [StatVariant.HP_FLAT]: 150, // HP     // guessed
  [StatVariant.HP]: 3,        // HP%
  [StatVariant.ATK_FLAT]: 11, // ATK    // guessed
  [StatVariant.ATK]: 3,       // ATK%
  [StatVariant.DEF_FLAT]: 11, // DEF    // guessed
  [StatVariant.DEF]: 3,       // DEF%
  [StatVariant.SPD]: 3,       // SPD
  [StatVariant.RES]: 7,       // RES
  [StatVariant.ACC]: 7,       // ACC
  [StatVariant.CR]: 3,        // CR%
  [StatVariant.CDMG]: 3,      // CDMG%
}

export const BASE_MIN_3: Record<number, number> = {
  [StatVariant.HP_FLAT]: 140, // HP     // guessed
  [StatVariant.HP]: 2,        // HP%
  [StatVariant.ATK_FLAT]: 10, // ATK    // guessed
  [StatVariant.ATK]: 2,       // ATK%
  [StatVariant.DEF_FLAT]: 10, // DEF    // guessed
  [StatVariant.DEF]: 2,       // DEF%
  [StatVariant.SPD]: 2,       // SPD
  [StatVariant.RES]: 6,       // RES
  [StatVariant.ACC]: 6,       // ACC
  [StatVariant.CR]: 2,        // CR%
  [StatVariant.CDMG]: 2,      // CDMG%
}

export const BASE_MIN_2: Record<number, number> = {
  [StatVariant.HP_FLAT]: 130,  // HP    // guessed
  [StatVariant.HP]: 1,         // HP%
  [StatVariant.ATK_FLAT]: 9,   // ATK   // guessed
  [StatVariant.ATK]: 1,        // ATK%
  [StatVariant.DEF_FLAT]: 9,   // DEF   // guessed
  [StatVariant.DEF]: 1,        // DEF%
  [StatVariant.SPD]: 1,        // SPD
  [StatVariant.RES]: 5,        // RES
  [StatVariant.ACC]: 5,        // ACC
  [StatVariant.CR]: 1,         // CR%
  [StatVariant.CDMG]: 1,       // CDMG%
}

export const BASE_MIN_1: Record<number, number> = {
  [StatVariant.HP_FLAT]: 120,  // HP    // guessed
  [StatVariant.HP]: 1,         // HP%
  [StatVariant.ATK_FLAT]: 8,   // ATK   // guessed
  [StatVariant.ATK]: 1,        // ATK%
  [StatVariant.DEF_FLAT]: 8,   // DEF   // guessed
  [StatVariant.DEF]: 1,        // DEF%
  [StatVariant.SPD]: 1,        // SPD
  [StatVariant.RES]: 4,        // RES
  [StatVariant.ACC]: 4,        // ACC
  [StatVariant.CR]: 1,         // CR%
  [StatVariant.CDMG]: 1,       // CDMG%
}

/** Default minima table initialized with zeroes for all stars. */
export function defaultMinima(): MinimaTable {
  return {
    one: { ...BASE_MIN_1 },
    two: { ...BASE_MIN_2 },
    three: { ...BASE_MIN_3 },
    four: { ...BASE_MIN_4 },
    five: { ...BASE_MIN_5 },
    six: { ...BASE_MIN_6 },
  }
}

/** Lookup base minimum value for a StatVariant at a given star bucket. */
function baseMinForStarV(variant: number, star: Star, minima: MinimaTable): number {
  if (star === 6) return minima.six[variant] ?? 0
  if (star === 5) return minima.five[variant] ?? 0
  if (star === 4) return minima.four[variant] ?? 0
  if (star === 3) return minima.three[variant] ?? 0
  if (star === 2) return minima.two[variant] ?? 0
  return minima.one[variant] ?? 0
}

/** Map a rank code (0..16) to an effective star bucket used for minima. */
function starForRankCode(rankCode: number): Star {
  // 1..6: exact
  if (rankCode >= 1 && rankCode <= 6) return rankCode as Star
  // >=1..>=4 -> treat as 4-star bucket, >=5 -> 5-star, >=6 not available
  if (rankCode >= 7 && rankCode <= 10) return 4
  if (rankCode === 11) return 5
  // <=2..<=4 -> 4-star bucket; <=5 -> 5; <=6 -> 6
  if (rankCode >= 12 && rankCode <= 14) return 4
  if (rankCode === 15) return 5
  if (rankCode === 16) return 6
  // 0 (Any) -> 6-star conservative
  return 6
}

/** Build HSF rules for a single config against the provided minima table. */
/**
 * Build HSF rules from a single BuilderConfig and minima table.
 * Steps:
 * - Expand main stat selections into separate rule branches (or Any if empty)
 * - Generate substat combinations honoring fixed substats and minCount
 * - For each level milestone, apply roll semantics (off/strict/potential)
 * - Apply per-substat roll bounds (min/max/any) and filter invalid rows
 */
export function buildHsfRules(cfg: BuilderConfig, minima: MinimaTable = defaultMinima()): HsfRule[] {
  const rankCode = cfg.rankCode
  const factionCode = Number(cfg.factionCode ?? 0)

  // Build permutation pool respecting fixed substats (variants only)
  // Canonicalize substat selection order so output does not depend on click order.
  const selectedPoolV = Array.isArray(cfg.substatsV) && cfg.substatsV.length > 0
    ? cfg.substatsV.map(Number).sort(compareVariants)
    : []
  const fixedPoolRawV = Array.isArray(cfg.fixedSubstatsV) && cfg.fixedSubstatsV.length > 0 ? cfg.fixedSubstatsV.map(Number) : []
  // Normalize fixed to be a subset of selected; preserve order of appearance from selected
  const fixedPoolV = selectedPoolV.filter(sv => fixedPoolRawV.includes(Number(sv)))
  const requiredV = fixedPoolV.slice(0, 4)
  const targetCount = Math.min(4, Math.max(cfg.minCount, requiredV.length))
  const need = Math.max(0, targetCount - requiredV.length)
  const optionalPoolV = selectedPoolV.filter(sv => !requiredV.includes(Number(sv)))
  const optCombosV = need === 0 ? [[]] as number[][] : combinations(optionalPoolV, need)
  const subsCombosV = optCombosV.map(opt => requiredV.concat(opt))

  const star = starForRankCode(rankCode)

  // Resolve Auto rarity to a concrete rarity code before rule generation.
  // Why: HSF requires an explicit rarity code and roll/addition schedules
  // depend on it. Auto picks the minimal rarity that can satisfy the
  // requested roll requirements within the current level window. For 5 rolls,
  // pick exact Mythical to guarantee a pre‑roll at +0.
  const resolveAutoRarity = (): number => {
    // With no substat constraints, keep rules broad: treat Auto as Any.
    if (selectedPoolV.length === 0) return 0
    // Compute worst-case sum of per‑stat minimum rolls across the generated
    // permutations: required (fixed) substats plus the highest mins among the
    // remaining selections to reach targetCount.
    const perMin: Record<number, number> = {}
    for (const v of selectedPoolV) {
      const b = cfg.substatRollBoundsV?.[Number(v)]
      const m = (typeof b?.min === 'number' ? Math.max(0, Math.min(5, Math.floor(b.min))) : 0)
      perMin[Number(v)] = m
    }
    const sumRequired = requiredV.reduce((a, v) => a + (perMin[Number(v)] ?? 0), 0)
    let worstSumMins: number
    if ((cfg.substatMinTarget ?? 'selected') === 'locked') {
      // Locked target: only locked substats are considered for the aggregate
      worstSumMins = sumRequired
    } else {
      const needLocal = Math.max(0, targetCount - requiredV.length)
      const optionMins = optionalPoolV.map(v => perMin[Number(v)] ?? 0).sort((a,b)=>b-a)
      const sumOptional = optionMins.slice(0, needLocal).reduce((a,b)=>a+b,0)
      worstSumMins = sumRequired + sumOptional
    }
    const globalMinRaw = (cfg.autoMinRequiredRolls || cfg.minRequiredRolls == null) ? 0 : (cfg.minRequiredRolls as number)
    const globalMin = Math.max(0, Math.min(5, Number.isFinite(globalMinRaw) ? globalMinRaw : 0))
    const required = Math.max(globalMin, worstSumMins)
    const clamped = Math.max(0, Math.min(5, required))

    // Map requirement to a base rarity candidate.
    const baseByRequired: Record<number, number> = {
      0: 0,   // Any
      1: 7,   // ≥ Uncommon
      2: 8,   // ≥ Rare
      3: 9,   // ≥ Epic
      4: 16,  // ≥ Legendary
      5: 15,  // Mythical (exact)
    }

    // For 5 rolls, exact Mythical is required to guarantee pre‑roll.
    if (clamped >= 5) return 15

    const candidate = baseByRequired[clamped] ?? 0

    // Level-window awareness: if the base candidate cannot reach the required
    // number of rolls by +16 given baseline/start, consider Mythical as an
    // escalation (adds a pre‑roll) if that satisfies the requirement. If even
    // Mythical cannot, keep the base candidate; feasibility pruning will apply.
    const effectiveStart = typeof cfg.startLevel === 'number' ? cfg.startLevel : 0
    const baseline: 'afterStart' | 'upToLevel' = cfg.rollBaseline === 'upToLevel' ? 'upToLevel' : 'afterStart'
    const rollLevelsCand = rollLevelsForRarityCode(candidate)
    const preCand = rarityIncludesMythical(candidate) ? 1 : 0
    const rollsUpTo16Cand = LEVELS.filter(l => l <= 16 && rollLevelsCand.has(l)).length
    const rollsUpToStartCand = LEVELS.filter(l => l <= effectiveStart && rollLevelsCand.has(l)).length
    const targetCand = baseline === 'upToLevel'
      ? (rollsUpTo16Cand + preCand)
      : Math.max(0, (rollsUpTo16Cand - rollsUpToStartCand) + (effectiveStart <= 0 ? preCand : 0))
    // Presence requirement at min level: if minLevel===0, ensure the resolved
    // rarity can have at least `targetCount` substats present at +0. Mapping:
    // 1->≥Uncommon, 2->≥Rare, 3->≥Epic, 4->≥Legendary.
    const hasMin0 = (typeof cfg.minLevel === 'number' ? cfg.minLevel : effectiveStart) === 0
    if (hasMin0) {
      const k = Math.max(0, Math.min(4, targetCount))
      const requiredByK = (k <= 0) ? 0 : (k === 1 ? 7 : (k === 2 ? 8 : (k === 3 ? 9 : 16)))
      if (requiredByK !== 0) {
        // Even if candidate=Any (0) satisfies presence math (treated like ≥ Legendary
        // for additions), prefer an explicit filter when the user requested K at +0.
        if (candidate === 0) return requiredByK
        const addSetCand = additionLevelsForRarityCode(candidate)
        const baseStartCand = Math.max(0, 4 - addSetCand.size)
        if (baseStartCand < k) return requiredByK
      }
    }
    if (clamped <= targetCand) return candidate
    // Try Mythical if it could help
    const rollLevelsMyth = rollLevelsForRarityCode(15)
    const preMyth = rarityIncludesMythical(15) ? 1 : 0
    const rollsUpTo16Myth = LEVELS.filter(l => l <= 16 && rollLevelsMyth.has(l)).length
    const rollsUpToStartMyth = LEVELS.filter(l => l <= effectiveStart && rollLevelsMyth.has(l)).length
    const targetMyth = baseline === 'upToLevel'
      ? (rollsUpTo16Myth + preMyth)
      : Math.max(0, (rollsUpTo16Myth - rollsUpToStartMyth) + (effectiveStart <= 0 ? preMyth : 0))
    if (clamped <= targetMyth) return 15
    return candidate
  }

  const rarityCode = (cfg.rarityMode === 'auto') ? resolveAutoRarity() : cfg.rarityCode

  const baseCore = {
    ...(cfg.keep !== undefined ? { Keep: cfg.keep } : {}),
    ...(cfg.enabled !== undefined ? { Use: cfg.enabled !== false } : {}),
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

  // Determine mainstat choices: [] means Any; otherwise list of variants to unroll
  // Canonicalize mainstat order as well to avoid click-order dependence.
  const mainChoicesV: number[] = (Array.isArray(cfg.mainStatsV) && cfg.mainStatsV.length > 0)
    ? cfg.mainStatsV.map(Number).sort(compareVariants)
    : []

  const baseline: 'afterStart' | 'upToLevel' = cfg.rollBaseline === 'upToLevel' ? 'upToLevel' : 'afterStart'
  const earlyMode: 'early' | 'late' = (cfg.earlyKeepMode === 'late' ? 'late' : 'early')
  // Level window: prefer explicit min/max when provided; otherwise derive from legacy fields
  const deriveLevelWindow = (): { min: 0|4|8|12|16; max: 0|4|8|12|16 } => {
    const isLvl = (v: unknown): v is 0|4|8|12|16 => {
      return typeof v === 'number' && [0,4,8,12,16].includes(v)
    }
    const hasMinMax = (isLvl(cfg.minLevel) && isLvl(cfg.maxLevel) && (cfg.minLevel as number) <= (cfg.maxLevel as number))
    if (hasMinMax) return { min: cfg.minLevel as 0|4|8|12|16, max: cfg.maxLevel as 0|4|8|12|16 }
    // Legacy back-compat: presence-only handled earlier via rollMode==='off'
    const start = (typeof cfg.startLevel === 'number' ? (cfg.startLevel as 0|4|8|12|16) : 0)
    return { min: start, max: 16 }
  }
  const levelWindow = deriveLevelWindow()

  // Special case: No substats selected => presence-only.
  // - For full window 0..16: emit a single "Any level" rule (LVLForCheck=99).
  // - Otherwise: emit rules for each milestone within the window.
  if (selectedPoolV.length === 0) {
    const emitAtLevel = (lvl: 0|4|8|12|16|99) => {
      if (mainChoicesV.length === 0) {
        rules.push(makeRule({ ...baseCore, MainStatID: -1, MainStatF: 1, LVLForCheck: lvl }, []))
      } else {
        for (const mnV of mainChoicesV) {
          if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
          const mT = variantToMain(mnV)
          rules.push(makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, []))
        }
      }
    }
    if (levelWindow.min === 0 && levelWindow.max === 16) {
      emitAtLevel(99 as 99)
    } else {
      for (const lvl of LEVELS) {
        if (lvl < levelWindow.min || lvl > levelWindow.max) continue
        emitAtLevel(lvl)
      }
    }
    return rules
  }

  // If the aggregate minimum should apply to locked substats but none are locked,
  // the requirement cannot be satisfied; prune all rows.
  const globalMinActive = (cfg.autoMinRequiredRolls === false) && (typeof cfg.minRequiredRolls === 'number') && (cfg.minRequiredRolls! > 0)
  if ((cfg.substatMinTarget ?? 'selected') === 'locked' && requiredV.length === 0 && globalMinActive) {
    return []
  }

  // Global infeasibility prune (caps vs aggregate minimum):
  // If a global MinRequiredRolls is set and, even under best-case per‑stat caps
  // across the required number of selected substats (fixed + highest remaining),
  // the target cannot be met by +16, do not emit any rows. This matches the UI
  // warning for confusing configs like single SPD with Max=0 and MinRequired=1.
  // Note: This does not prune nuanced feasibility-at-intermediate-level cases;
  // it only catches hard impossibilities regardless of distribution.
  if (cfg.autoMinRequiredRolls === false && (cfg.minRequiredRolls ?? 0) > 0 && selectedPoolV.length > 0) {
    const supportsFive = (() => {
      // 5-roll capable when Mythical is included, or Any/Auto with 5+ target
      if (rarityCode === 15 /* Mythical */ || rarityCode === 14 /* ≤ Mythical */) return true
      if (rarityCode === 0 /* Any */) return true
      if (cfg.rarityMode === 'auto' && (cfg.minRequiredRolls ?? 0) >= 5) return true
      return false
    })()
    const defaultCap = supportsFive ? 5 : 4
    const capFor = (v: number): number => {
      const b = (cfg.substatRollBoundsV ?? {})[Number(v)]
      const hasMax = (typeof b?.max === 'number' && isFinite(b.max))
      const raw = hasMax ? Math.floor(Number(b!.max)) : defaultCap
      return Math.max(0, Math.min(defaultCap, raw))
    }
    const fixedCaps = requiredV.map(capFor)
    const optionalCaps = optionalPoolV.map(capFor).sort((a,b)=>b-a)
    let sumCaps = 0
    for (const c of fixedCaps) sumCaps += c
    if ((cfg.substatMinTarget ?? 'selected') !== 'locked') {
      for (let i = 0; i < Math.max(0, targetCount - fixedCaps.length); i++) sumCaps += (optionalCaps[i] ?? 0)
    }
    if (sumCaps < (cfg.minRequiredRolls ?? 0)) {
      return []
    }
  }

  // Note: Aside from the hard-cap prune above, broader feasibility pruning is not
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
    if (cfg.autoMinRequiredRolls === false && typeof cfg.minRequiredRolls === 'number' && cfg.minRequiredRolls > 0) return true
    return false
  })()
  const effectiveMode: 'off' | 'strict' | 'potential' =
    cfg.rollMode === 'auto'
      ? (hasCircled ? 'potential' : 'strict')
      : (cfg.rollMode === 'off' ? 'off' : (cfg.rollMode === 'strict' ? 'strict' : 'potential'))

  if (effectiveMode === 'off') {
    const emitFor = (mnV: number | null, comboV: number[]) => {
      const comboSubs = comboV.map(v => variantToSub(v))
      const mf = mnV !== null ? variantToMain(mnV) : null
      const r = makeRule({
        ...baseCore,
        // Include explicit Any main when not narrowed to a specific main
        ...(mf ? { MainStatID: mf.id, MainStatF: mf.f ?? 1 } : { MainStatID: -1, MainStatF: 1 }),
        // Off + any level uses 99 to denote Any in HSF samples
        ...(typeof cfg.startLevel === 'number' ? { LVLForCheck: cfg.startLevel } : { LVLForCheck: 99 }),
      }, comboSubs)
      for (let i = 0; i < comboV.length; i++) {
        r.Substats[i]!.Condition = '>='
        r.Substats[i]!.Value = baseMinForStarV(Number(comboV[i]!), star, minima)
      }
      rules.push(r)
    }
    if (mainChoicesV.length === 0) {
      for (const comboV of subsCombosV) emitFor(null, comboV)
    } else {
      for (const mnV of mainChoicesV) {
        for (const comboV of subsCombosV) {
          if (comboV.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
          if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
          emitFor(mnV, comboV)
        }
      }
    }
    return rules
  }

  // Generate chain from min..max levels for roll levels
  const rollLevels = rollLevelsForRarityCode(rarityCode)
  // Build rules at milestone levels according to baseline option
  const effectiveStart = typeof cfg.startLevel === 'number' ? cfg.startLevel : 0
  for (const lvl of LEVELS) {
    if (lvl < levelWindow.min || lvl > levelWindow.max) continue
    if (lvl < effectiveStart) continue
    const rollsUpToLvl = LEVELS.filter(l => l <= lvl && rollLevels.has(l)).length
    const rollsUpToStart = LEVELS.filter(l => l <= effectiveStart && rollLevels.has(l)).length
    // Account for Mythical's initial pre-roll at level 0 when the rarity selection includes Mythical.
    const preRolls = rarityIncludesMythical(rarityCode) ? 1 : 0
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
    const addSet = additionLevelsForRarityCode(rarityCode)
    const totalAdds = addSet.size
    const baseStart = Math.max(0, 4 - totalAdds) // initial substats at +0 for the rarity
    const addsSoFar = Array.from(addSet).filter(a => a <= lvl).length
    const present = Math.min(4, baseStart + addsSoFar)

    // Build level-specific substat combinations: when present < targetCount,
    // enumerate combos of size `present` (still honoring fixed substats). At
    // +16 (or whenever present >= targetCount), use the requested targetCount.
    const levelTarget = Math.min(present, targetCount)
    const levelNeed = Math.max(0, levelTarget - requiredV.length)
    const levelCombosV: number[][] = (() => {
      if (levelTarget < requiredV.length) return []
      if (levelTarget === targetCount) return subsCombosV
      if (levelNeed === 0) return [requiredV.slice()]
      const opt = combinations(optionalPoolV, levelNeed)
      return opt.map(o => requiredV.concat(o))
    })()

    // For each chosen substat combination, distribute available rolls among them
    for (const combo of levelCombosV) {
      const m = combo.length
      if (present < m) {
        // Not enough substats can exist at this level to satisfy minCount -> skip emitting rows
        continue
      }
      // Note: We do not prune substat-slot impossibilities here to keep
      // rule generation broad; RSL matching will naturally ignore rows that
      // cannot match for the selected slot.
      if (m === 0) {
        if (mainChoicesV.length === 0) {
          // Include explicit Any main for consistency with HSF samples
          rules.push(makeRule({ ...baseCore, MainStatID: -1, MainStatF: 1, LVLForCheck: lvl }, []))
        } else {
          for (const mnV of mainChoicesV) {
            if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
            const mT = variantToMain(mnV)
            rules.push(makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, []))
          }
        }
        continue
      }
      const baseVals = combo.map(v => baseMinForStarV(Number(v), star, minima))
      // Aggregate minimum rolls can target all selected substats or only locked ones.
      const isLockedTarget = (cfg.substatMinTarget ?? 'selected') === 'locked'
      const targetedMask: boolean[] = combo.map(v => !isLockedTarget || requiredV.includes(v))
      const sumTargeted = (arr: number[]) => arr.reduce((acc, val, i) => acc + (targetedMask[i] ? val : 0), 0)
      const sumEqTargeted = (arr: number[], target: number) => sumTargeted(arr) === target

      // Lower-bound rule: enforce per-substat minimum rolls regardless of how additional rolls distribute.
      // This enables expectations like "SPD (1) keeps items with at least 1 SPD roll" even when SPD is the only selected substat.
      // Only emit if (a) any substat specifies a min>0 bound, and (b) it's feasible at this level
      // given the number of rolls available by baseline (sum(mins) <= numRollsForThisLevel).
      {
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
        // Aggregate minimum across selected substats (off when Auto).
        const globalMinRaw = (cfg.autoMinRequiredRolls || cfg.minRequiredRolls == null) ? 0 : (cfg.minRequiredRolls as number)
        const globalMin = Math.max(0, Math.min(5, Number.isFinite(globalMinRaw) ? globalMinRaw : 0))
        // Dynamic Mythical handling for 'Any' rarity: if either the per-substat mins or the
        // global minimum require 5 total rolls and rarity is Any (0), include one pre-roll to
        // model Mythical as the only feasible path. Apply consistently to availability and target.
        const mythPreExtra = (rarityCode === 0 && (sumMin >= 5 || globalMin >= 5)) ? 1 : 0
        const mythPreCount = (rarityIncludesMythical(rarityCode) ? 1 : 0) + mythPreExtra
        const avail = numRollsForThisLevel + mythPreExtra
        const numTarget = numRollsByTarget + mythPreExtra
        const remaining = Math.max(0, numTarget - avail)
        const emitPresence = () => {
          const comboSubs = combo.map(v => variantToSub(v))
          if (mainChoicesV.length === 0) {
            const r = makeRule({ ...baseCore, MainStatID: -1, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
            for (let i = 0; i < combo.length; i++) {
              r.Substats[i]!.Condition = '>='
              r.Substats[i]!.Value = baseVals[i]!
            }
            rules.push(r)
          } else {
            for (const mnV of mainChoicesV) {
              if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
              if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
              const mT = variantToMain(mnV)
              const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
              for (let i = 0; i < combo.length; i++) {
                r.Substats[i]!.Condition = '>='
                r.Substats[i]!.Value = baseVals[i]!
              }
              rules.push(r)
            }
          }
        }
        // Fast path for single selected substat with a minimum: emit one early
        // lower-bound per level: base + min(avail, min)*base. This matches the
        // expectation that thresholds grow until the minimum is feasible, then
        // remain fixed (e.g., ACC(2): +0 9, +4 18, +8 27, +12 27, +16 27).
        if (m === 1 && anyMin && !anyWildcard) {
          // With one selected substat, if a global minimum is set and exceeds the per‑stat
          // minimum, treat that higher requirement as the early target. This keeps
          // a single rising threshold that matches "green roll" expectations and ensures
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
          }
          const comboSubs = combo.map(v => variantToSub(v))
          if (mainChoicesV.length === 0) {
            const r = makeRule({ ...baseCore, MainStatID: -1, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
            r.Substats[0]!.Condition = '>='
            r.Substats[0]!.Value = baseVals[0]! + applied * baseVals[0]!
            rules.push(r)
          } else {
            for (const mnV of mainChoicesV) {
              if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
              if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
              const mT = variantToMain(mnV)
              const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
              r.Substats[0]!.Condition = '>='
              r.Substats[0]!.Value = baseVals[0]! + applied * baseVals[0]!
              rules.push(r)
            }
          }
          // Done for this level/combo
          continue
        }
        // Fast path for single selected substat with wildcard (any=true) and a
        // global Min Required Rolls: behave like a per-stat early lower bound
        // using the aggregate minimum. This keeps a single row per level and mirrors
        // the "green roll" expectation with one selected substat.
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
          const comboSubs = combo.map(v => variantToSub(v))
          if (mainChoicesV.length === 0) {
            const r = makeRule({ ...baseCore, MainStatID: -1, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
            r.Substats[0]!.Condition = '>='
            r.Substats[0]!.Value = baseVals[0]! + applied * baseVals[0]!
            rules.push(r)
          } else {
            for (const mnV of mainChoicesV) {
              if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
              if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
              const mT = variantToMain(mnV)
              const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
              r.Substats[0]!.Condition = '>='
              r.Substats[0]!.Value = baseVals[0]! + applied * baseVals[0]!
              rules.push(r)
            }
          }
          continue
        }
        const emitDists = (predicate: (dist: number[]) => boolean) => {
          let emitted = false
          for (const dist of rollDistributions(m, avail)) {
            // Enforce max caps first
            let overMax = false
            for (let i = 0; i < m; i++) {
              if (maxs[i] !== undefined && dist[i]! > (maxs[i]! as number)) { overMax = true; break }
            }
            if (overMax) continue
            // In strict distributions, all rolls are allocated to selected substats.
            if (globalMin > 0) {
              const s = sumTargeted(dist)
              if (s < globalMin) continue
            }
            if (!predicate(dist)) continue
            const comboSubs = combo.map(v => variantToSub(v))
            if (mainChoicesV.length === 0) {
              const r = makeRule({ ...baseCore, MainStatID: -1, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
              for (let i = 0; i < m; i++) {
                r.Substats[i]!.Condition = '>='
                r.Substats[i]!.Value = baseVals[i]! + dist[i]! * baseVals[i]!
              }
              rules.push(r)
            } else {
              for (const mnV of mainChoicesV) {
                if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
                if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
                const mT = variantToMain(mnV)
                const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
                for (let i = 0; i < m; i++) {
                  r.Substats[i]!.Condition = '>='
                  r.Substats[i]!.Value = baseVals[i]! + dist[i]! * baseVals[i]!
                }
                rules.push(r)
              }
            }
            emitted = true
          }
          return emitted
        }
        // Like emitDists, but allow some of the available rolls to go to non-targeted substats.
        // Implemented by adding a single "other" bucket that can absorb any leftover rolls.
        const emitDistsAllowOther = (predicate: (dist: number[]) => boolean) => {
          let emitted = false
          const addSet = additionLevelsForRarityCode(rarityCode)
          const totalAdds = addSet.size
          const baseStart = Math.max(0, 4 - totalAdds)
          const addsSoFar = Array.from(addSet).filter(a => a <= lvl).length
          const present = Math.min(4, baseStart + addsSoFar)
          const othersCount = Math.max(0, present - m)
          const dims = m + (othersCount > 0 ? 1 : 0)
          for (const dist of rollDistributions(dims, avail)) {
            const sel = dist.slice(0, m)
            let overMax = false
            for (let i = 0; i < m; i++) {
              if (maxs[i] !== undefined && sel[i]! > (maxs[i]! as number)) { overMax = true; break }
            }
            if (overMax) continue
            if (globalMin > 0) {
              const s = sumTargeted(sel)
              const rollsUpTo16 = LEVELS.filter(l => l <= 16 && rollLevels.has(l)).length
              const numTarget = baseline === 'upToLevel'
                ? (rollsUpTo16 + mythPreCount)
                : Math.max(0, (rollsUpTo16 - rollsUpToStart) + (effectiveStart <= 0 ? mythPreCount : 0))
              const remaining = Math.max(0, numTarget - avail)
              if (!(s >= globalMin || (globalMin - s) <= remaining)) continue
            }
            if (!predicate(sel)) continue
            const comboSubs = combo.map(v => variantToSub(v))
            if (mainChoicesV.length === 0) {
              const r = makeRule({ ...baseCore, MainStatID: -1, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
              for (let i = 0; i < m; i++) {
                r.Substats[i]!.Condition = '>='
                r.Substats[i]!.Value = baseVals[i]! + sel[i]! * baseVals[i]!
              }
              rules.push(r)
            } else {
              for (const mnV of mainChoicesV) {
                if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
                if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
                const mT = variantToMain(mnV)
                const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
                for (let i = 0; i < m; i++) {
                  r.Substats[i]!.Condition = '>='
                  r.Substats[i]!.Value = baseVals[i]! + sel[i]! * baseVals[i]!
                }
                rules.push(r)
              }
            }
            emitted = true
          }
          return emitted
        }
        const emitMinOnly = () => {
          const comboSubs = combo.map(v => variantToSub(v))
          if (mainChoicesV.length === 0) {
            const r = makeRule({ ...baseCore, MainStatID: -1, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
            for (let i = 0; i < m; i++) {
              // lower-bound: base + mins[i]*base
              r.Substats[i]!.Condition = '>='
              r.Substats[i]!.Value = baseVals[i]! + mins[i]! * baseVals[i]!
            }
            rules.push(r)
          } else {
            for (const mnV of mainChoicesV) {
              if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
              if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
              const mT = variantToMain(mnV)
              const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
              for (let i = 0; i < m; i++) {
                // lower-bound: base + mins[i]*base
                r.Substats[i]!.Condition = '>='
                r.Substats[i]!.Value = baseVals[i]! + mins[i]! * baseVals[i]!
              }
              rules.push(r)
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
            const isLockedTarget = (cfg.substatMinTarget ?? 'selected') === 'locked'
            const targetedMask: boolean[] = combo.map(v => !isLockedTarget || requiredV.includes(v))
            const sumNeedTargeted = needNow.reduce((a, v, i) => a + (targetedMask[i] ? v : 0), 0)
            const minAggNow = globalMin > 0 ? Math.max(0, globalMin - remaining) : 0
            const extraTargeted = Math.max(0, minAggNow - sumNeedTargeted)
            const minNowRequired = Math.max(0, sumMin - remaining) + extraTargeted
            if (minNowRequired <= avail) {
              const extra = Math.max(0, minNowRequired - sumNeed)
              // Determine per-index additional capacity we can allocate now (bounded by per-stat min and caps)
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
                if (mainChoicesV.length === 0) {
                  const r = makeRule({ ...baseCore, MainStatID: -1, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
                  for (let i = 0; i < m; i++) {
                    r.Substats[i]!.Condition = '>='
                    r.Substats[i]!.Value = baseVals[i]! + (needNow[i]! + inc[i]!) * baseVals[i]!
                  }
                  rules.push(r)
                } else {
                  for (const mnV of mainChoicesV) {
                    if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
                    if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
                    const mT = variantToMain(mnV)
                    const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
                    for (let i = 0; i < m; i++) {
                      r.Substats[i]!.Condition = '>='
                      r.Substats[i]!.Value = baseVals[i]! + (needNow[i]! + inc[i]!) * baseVals[i]!
                    }
                    rules.push(r)
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
                      if (mainChoicesV.length === 0) {
                        const r = makeRule({ ...baseCore, MainStatID: -1, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
                        for (let i = 0; i < m; i++) {
                          r.Substats[i]!.Condition = '>='
                          r.Substats[i]!.Value = baseVals[i]! + (needNow[i]! + inc[i]!) * baseVals[i]!
                        }
                        rules.push(r)
                      } else {
                        for (const mnV of mainChoicesV) {
                          if (combo.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
                          if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
                          const mT = variantToMain(mnV)
                          const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
                          for (let i = 0; i < m; i++) {
                            r.Substats[i]!.Condition = '>='
                            r.Substats[i]!.Value = baseVals[i]! + (needNow[i]! + inc[i]!) * baseVals[i]!
                          }
                          rules.push(r)
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
            // - If there is no global minimum, emit presence only (base minima).
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
              if (globalMin > 0 && globalMin > sumMinTargeted) {
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
              if (globalMin > 0 && globalMin > sumMinTargeted2) {
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
              const willEmitMinOnly = !(globalMin > 0 && globalMin > sumMinTargeted3)
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
  if (effectiveMode === 'potential' && earlyMode === 'early' && targetCount >= Math.min(4, selectedPoolV.length)) {
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
        const globalMinFullRaw = (cfg.autoMinRequiredRolls || cfg.minRequiredRolls == null) ? 0 : (cfg.minRequiredRolls as number)
        const globalMinFull = Math.max(0, Math.min(5, Number.isFinite(globalMinFullRaw) ? globalMinFullRaw : 0))
        // Only emit extra full-selected distributions when we have mins and are not yet feasible
        // Compute local availability with Mythical pre-roll when needed
        const mythPreExtraFull = (rarityCode === 0 && (sumMinFull >= 5 || globalMinFull >= 5)) ? 1 : 0
        const availFull = numRollsForThisLevel + mythPreExtraFull
        const numTargetFull = numRollsByTarget + mythPreExtraFull
        if (anyMinFull && sumMinFull > availFull) {
          const baseValsFull = fullSelV.map(v => baseMinForStarV(Number(v), star, minima))
          const mF = fullSelV.length
          const emitFull = (dist: number[]) => {
            const comboSubs = fullSelV.map(v => variantToSub(v))
            if (mainChoicesV.length === 0) {
              const r = makeRule({ ...baseCore, MainStatID: -1, MainStatF: 1, LVLForCheck: lvl }, comboSubs)
              for (let i = 0; i < mF; i++) {
                r.Substats[i]!.Condition = '>='
                r.Substats[i]!.Value = baseValsFull[i]! + dist[i]! * baseValsFull[i]!
              }
              rules.push(r)
            } else {
              for (const mnV of mainChoicesV) {
                if (fullSelV.some(sv => subEqualsMain(variantToSub(sv), variantToMain(mnV)))) continue
                if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mnV)) continue
                const mT = variantToMain(mnV)
                const r = makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, comboSubs)
                for (let i = 0; i < mF; i++) {
                  r.Substats[i]!.Condition = '>='
                  r.Substats[i]!.Value = baseValsFull[i]! + dist[i]! * baseValsFull[i]!
                }
                rules.push(r)
              }
            }
          }
          for (const dist of rollDistributions(mF, availFull)) {
            // Enforce per-substat caps
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

  return rules
}

// Expose available stat options for UI — variants supersede previous helpers
