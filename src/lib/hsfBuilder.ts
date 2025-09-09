/**
 * hsfBuilder.ts
 *
 * Core builder that turns a BuilderConfig and MinimaTable into concrete HSF
 * rules. Handles mainstat unrolling, substat combinations, roll-baseline math,
 * rarity schedules, minima application, and per-substat roll bounds.
 */
import type { HsfRule } from './hsfTypes'
import { ArtifactType, StatVariant, compareArtifactSets, compareArtifactTypes, compareVariants } from './types'
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
  // Rarity code: HSF-compatible (0..16): see rarityCodeToName in types.ts
  rarityCode: number
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
  // Optional slot and set filters (HSF numeric IDs or enums); omit for Any
  artifactTypes?: ArtifactTypeId[]
  artifactSets?: ArtifactSetId[]
  // Optional metaset references (IDs defined in HSFR Metasets)
  artifactMetaSets?: string[]
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

// Returns true if the given main stat is allowed as a main on the given slot (type) per ARTIFACT_RULES.
/**
 * Whether the given main stat (id,f) is allowed on an artifact slot (0..5).
 * Mirrors in-game constraints where certain mains are slot-restricted.
 */
function isMainAllowedOnSlot(slot: number, main: { id: number; f?: number }): boolean {
  const f = main.f
  switch (slot) {
    // Fixed-main artifacts
    case ArtifactType.Weapon:  return main.id === 2 && (f ?? 1) === 1 // Weapon: ATK
    case ArtifactType.Helmet:  return main.id === 1 && (f ?? 1) === 1 // Helmet: HP
    case ArtifactType.Shield:  return main.id === 3 && (f ?? 1) === 1 // Shield: DEF
    // Variable-main artifacts
    case ArtifactType.Gauntlets:
      return (
        (main.id === 1 && ((f ?? 1) === 1 || (f ?? 1) === 0)) || // HP / HP%
        (main.id === 2 && ((f ?? 1) === 1 || (f ?? 1) === 0)) || // ATK / ATK%
        (main.id === 3 && ((f ?? 1) === 1 || (f ?? 1) === 0)) || // DEF / DEF%
        (main.id === 7 && (f ?? 0) === 0) || // CR%
        (main.id === 8 && (f ?? 0) === 0)    // CDMG%
      )
    case ArtifactType.Chestplate:
      return (
        (main.id === 1 && ((f ?? 1) === 1 || (f ?? 1) === 0)) ||
        (main.id === 2 && ((f ?? 1) === 1 || (f ?? 1) === 0)) ||
        (main.id === 3 && ((f ?? 1) === 1 || (f ?? 1) === 0)) ||
        (main.id === 6) || // ACC
        (main.id === 5)    // RES
      )
    case ArtifactType.Boots:
      return (
        (main.id === 1 && ((f ?? 1) === 1 || (f ?? 1) === 0)) ||
        (main.id === 2 && ((f ?? 1) === 1 || (f ?? 1) === 0)) ||
        (main.id === 3 && ((f ?? 1) === 1 || (f ?? 1) === 0)) ||
        (main.id === 4) // SPD
      )
    // Accessories
    case ArtifactType.Ring:
      return (
        (main.id === 1 && (f ?? 1) === 1) ||
        (main.id === 2 && (f ?? 1) === 1) ||
        (main.id === 3 && (f ?? 1) === 1)
      )
    case ArtifactType.Amulet:
      return (
        (main.id === 1 && (f ?? 1) === 1) ||
        (main.id === 2 && (f ?? 1) === 1) ||
        (main.id === 3 && (f ?? 1) === 1) ||
        (main.id === 8 && (f ?? 0) === 0) // CDMG%
      )
    case ArtifactType.Banner:
      return (
        (main.id === 1 && (f ?? 1) === 1) ||
        (main.id === 2 && (f ?? 1) === 1) ||
        (main.id === 3 && (f ?? 1) === 1) ||
        (main.id === 6) || // ACC
        (main.id === 5)    // RES
      )
  }
  return false
}

// Returns true if at least one of the selected slots supports the given main stat.
/**
 * Given optional selected artifact types, returns true if at least one selected
 * slot supports the provided main stat id/f.
 */
function anySelectedSlotSupportsMain(selected?: ArtifactTypeId[], main?: { id: number; f?: number }): boolean {
  if (!selected || selected.length === 0) return true // No slot filter -> allow
  if (!main || main.id === -1) return true // Any main
  return selected.some(slot => isMainAllowedOnSlot(Number(slot), main))
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
  const rarityCode = cfg.rarityCode
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
  // Resolve 'auto' to an effective mode based on whether any substat is "circled"
  // (i.e., has an active roll badge: min > 0 or wildcard).
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
          if (!anySelectedSlotSupportsMain(cfg.artifactTypes, variantToMain(mnV))) continue
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
      if (m === 0) {
        if (mainChoicesV.length === 0) {
          // Include explicit Any main for consistency with HSF samples
          rules.push(makeRule({ ...baseCore, MainStatID: -1, MainStatF: 1, LVLForCheck: lvl }, []))
        } else {
          for (const mnV of mainChoicesV) {
            if (!anySelectedSlotSupportsMain(cfg.artifactTypes, variantToMain(mnV))) continue
            const mT = variantToMain(mnV)
            rules.push(makeRule({ ...baseCore, MainStatID: mT.id, MainStatF: mT.f ?? 1, LVLForCheck: lvl }, []))
          }
        }
        continue
      }
      const baseVals = combo.map(v => baseMinForStarV(Number(v), star, minima))

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
              if (!anySelectedSlotSupportsMain(cfg.artifactTypes, variantToMain(mnV))) continue
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
        // Fast path for single selected substat with a minimum: emit one progressive
        // lower-bound per level: base + min(avail, min)*base. This matches the
        // expectation that thresholds grow until the minimum is feasible, then
        // remain fixed (e.g., ACC(2): +0 9, +4 18, +8 27, +12 27, +16 27).
        if (m === 1 && anyMin && !anyWildcard) {
          // With one selected substat, if a global minimum is set and exceeds the per‑stat
          // minimum, treat that higher requirement as the progressive target. This keeps
          // a single rising threshold that matches "green roll" expectations and ensures
          // MinRequiredRolls drives the outcome when stronger than per‑stat Min.
          const required = Math.max(mins[0]!, globalMin)
          // If impossible even by target, skip entirely
          if (required > numTarget) {
            continue
          }
          // Determine progressive rolls credited to this substat at this level
          const maxCap = maxs[0]
          const wanted = Math.min(required, avail)
          const applied = (typeof maxCap === 'number') ? Math.min(wanted, maxCap) : wanted
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
              if (!anySelectedSlotSupportsMain(cfg.artifactTypes, variantToMain(mnV))) continue
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
        // global Min Required Rolls: behave like a per-stat progressive lower bound
        // using the aggregate minimum. This keeps a single row per level and mirrors
        // the "green roll" expectation with one selected substat.
        if (m === 1 && !anyMin && anyWildcard && globalMin > 0) {
          // If impossible even by target, skip entirely
          if (globalMin > numTarget) {
            continue
          }
          const maxCap = maxs[0]
          const wanted = Math.min(globalMin, avail)
          const applied = (typeof maxCap === 'number') ? Math.min(wanted, maxCap) : wanted
          // With a single selected stat, the selected sum equals applied rolls.
          const remaining = Math.max(0, numTarget - avail)
          if (!(applied >= globalMin || (globalMin - applied) <= remaining)) {
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
              if (!anySelectedSlotSupportsMain(cfg.artifactTypes, variantToMain(mnV))) continue
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
              const s = dist.reduce((a, b) => a + b, 0)
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
                if (!anySelectedSlotSupportsMain(cfg.artifactTypes, variantToMain(mnV))) continue
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
          // Determine if there are non-targeted substats present that can take rolls
          const addSet = additionLevelsForRarityCode(rarityCode)
          const totalAdds = addSet.size
          const baseStart = Math.max(0, 4 - totalAdds) // 4 total substats eventually
          const addsSoFar = Array.from(addSet).filter(a => a <= lvl).length
          const present = Math.min(4, baseStart + addsSoFar)
          const othersCount = Math.max(0, present - m)
          const dims = m + (othersCount > 0 ? 1 : 0)
          for (const dist of rollDistributions(dims, avail)) {
            const sel = dist.slice(0, m)
            // Enforce max caps on selected substats
            let overMax = false
            for (let i = 0; i < m; i++) {
              if (maxs[i] !== undefined && sel[i]! > (maxs[i]! as number)) { overMax = true; break }
            }
            if (overMax) continue
            if (globalMin > 0) {
              const s = sel.reduce((a, b) => a + b, 0)
              // If the selected portion cannot meet the global minimum now or by target, skip
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
                if (!anySelectedSlotSupportsMain(cfg.artifactTypes, variantToMain(mnV))) continue
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
              if (!anySelectedSlotSupportsMain(cfg.artifactTypes, variantToMain(mnV))) continue
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

        if (effectiveMode === 'strict') {
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
            // wildcard only: all options
            if (globalMin > 0 && avail < globalMin) {
              // Not feasible at this level
            } else {
              emitDists(() => true)
            }
          } else {
            // have mins (with or without wildcard)
            if (avail <= 0) {
              // not feasible yet: no rule for this level
            } else if (sumMin <= avail) {
              // min-only at and after feasibility unless aggregate minimum exceeds sum of per-substat mins
              if (globalMin > 0 && globalMin > sumMin) {
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
            // Reuse the AllowOther enumerator to include permutations where some available
            // rolls could land on non-targeted substats (mirrors per-substat min behavior).
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
            // No per-stat mins and no aggregate min: behave like strict distributions
            // so thresholds do not decrease at later levels when additional
            // non-targeted substats become present.
            if (globalMin <= 0) {
              emitDists(() => true)
            } else {
              emitDists((dist) => {
                const s = dist.reduce((a, b) => a + b, 0)
                const rollsUpTo16 = LEVELS.filter(l => l <= 16 && rollLevels.has(l)).length
                const numTarget = baseline === 'upToLevel'
                  ? (rollsUpTo16 + mythPreCount)
                  : Math.max(0, (rollsUpTo16 - rollsUpToStart) + (effectiveStart <= 0 ? mythPreCount : 0))
                const remaining = Math.max(0, numTarget - avail)
                return (s >= globalMin) || ((globalMin - s) <= remaining)
              })
            }
          } else {
            // If the requested mins cannot be satisfied even by the target level, skip entirely
            if (sumMin > numTarget) {
              // impossible by target: do not emit presence or progress rows
            } else if (avail <= 0) {
              // Potential: allow presence when aggregate can still be met by target
              if (globalMin <= numTarget) emitPresence()
            } else if (sumMin <= avail) {
              // Feasible now: include the strict lower-bound row, and also allow
              // partial-progress rows that can still reach mins by the target level
              // (deficit across non-wildcard stats can be made up by remaining rolls).
              // To avoid duplicates: skip the exact-min distribution here and emit it once via emitMinOnly().
              const willEmitMinOnly = !(globalMin > 0 && globalMin > sumMin)
              emitDistsAllowOther((dist) => {
                let deficit = 0
                let isExactMin = true
                for (let i = 0; i < m; i++) {
                  if (!anyFlags[i]) {
                    // Enforce per-substat lower bounds (allow >= min at/after feasibility)
                    if (dist[i]! < mins[i]!) return false
                    deficit += Math.max(0, mins[i]! - dist[i]!)
                  }
                  if (dist[i]! !== mins[i]!) isExactMin = false
                }
                // Also honor aggregate minimum across selected substats
                if (globalMin > 0) {
                  const s = dist.reduce((a, b) => a + b, 0)
                  const rollsUpTo16 = LEVELS.filter(l => l <= 16 && rollLevels.has(l)).length
                  const numTarget = baseline === 'upToLevel'
                    ? (rollsUpTo16 + mythPreCount)
                    : Math.max(0, (rollsUpTo16 - rollsUpToStart) + (effectiveStart <= 0 ? mythPreCount : 0))
                  const remaining = Math.max(0, numTarget - avail)
                  if (!(s >= globalMin || (globalMin - s) <= remaining)) return false
                }
                if (isExactMin && willEmitMinOnly) return false
                return deficit <= remaining
              })
              // Include min-only lower bound only when it doesn't undercut aggregate minimum
              if (!(globalMin > 0 && globalMin > sumMin)) emitMinOnly()
            } else {
              // partial progress allowed; ensure deficits can still be made up by target
              const willEmitMinOnly = !(globalMin > 0 && globalMin > sumMin)
              emitDistsAllowOther((dist) => {
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
                  const s = dist.reduce((a, b) => a + b, 0)
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
  }

  return rules
}

// Expose available stat options for UI — variants supersede previous helpers
