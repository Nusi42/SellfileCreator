import type { HsfRule } from './hsfTypes'
import { statNameFromId, ArtifactType, StatId, variantToMain, variantToSub, subToVariant } from './types'
import type { ArtifactSetId, ArtifactTypeId, FactionId, StatVariant } from './types'

// Simple inputs for the HSF rule builder
export interface BuilderConfig {
  // Optional display name for this rule configuration (saved in HSFR)
  name?: string
  keep: boolean
  // Whether generated HSF rules from this config are enabled (HSF.Use). Default: true
  enabled?: boolean
  // Rank code: HSF-compatible (0..16): exact 1..6, >=1..>=5 (7..11), <=2..<=6 (12..16), 0 any
  rankCode: number
  // Rarity code: HSF-compatible (0..16): see rarityCodeToName in types.ts
  rarityCode: number
  // Faction code (0 Any, 1..15 per factionNames in types.ts)
  factionCode?: FactionId
  // Main stats selection. Empty -> Any. If provided, we unroll rules per selected main stat.
  // Back-compat: older HSFRs may include single `mainStat`; loader normalizes into `mainStats`.
  mainStats?: Array<{ id: number; f?: number }>
  // Optional UI-friendly variants; if provided, take precedence when building.
  mainStatVariants?: StatVariant[]
  // Starting level selection (0, 4, 8, 12, 16). Special 'any' is allowed only with rollMode='off'.
  startLevel: 0 | 4 | 8 | 12 | 16 | 'any'
  // How to treat rolls relative to start level when generating thresholds
  // 'afterStart' (default): treat start as a reset; only rolls after start count
  // 'upToLevel': include prior rolls up to each milestone (incl. start)
  rollBaseline?: 'afterStart' | 'upToLevel'
  // Roll generation mode: 'off' (start only), 'strict' (milestones strict), 'potential' (strict + early relaxed keeps),
  // 'auto' (strict if no substats selected; potential if at least one substat selected)
  rollMode: 'off' | 'strict' | 'potential' | 'auto'
  // Substat targets: choose K from this set; generate combinations of size minCount
  substats: Array<{ id: number; isFlat?: boolean }>
  // Optional UI-friendly variants; if provided, take precedence when building.
  substatVariants?: StatVariant[]
  // Substats that must always be included in generated permutations (subset of substats)
  fixedSubstats?: Array<{ id: number; isFlat?: boolean }>
  // Optional UI-friendly variants; if provided, take precedence when building.
  fixedSubstatVariants?: StatVariant[]
  // Optional per-substat roll bounds used to filter distributions
  // Key format: `${id}:${isFlat}` (e.g., '4:true' for SPD)
  // min: require at least N rolls; max: optional upper bound; any: wildcard (permute all)
  substatRollBounds?: Record<string, { min?: number; max?: number; any?: boolean }>
  substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean }>
  minCount: 0 | 1 | 2 | 3 | 4
  // When true, UI keeps minCount in sync with selected substat count: min(4, substats.length)
  autoMinCount?: boolean
  // Optional slot and set filters (HSF numeric IDs or enums); omit for Any
  artifactTypes?: ArtifactTypeId[]
  artifactSets?: ArtifactSetId[]
  // Optional metaset references (IDs defined in HSFR Metasets)
  artifactMetaSets?: string[]
  // (Deprecated fields no longer used: generateRollPermutations, potentialKeep)
}

// Levels: 0/4/8/12/16 are milestone checks.
export const LEVELS: Array<0|4|8|12|16> = [0,4,8,12,16]

// User-configurable minima table for substats per star bucket
export type MinimaTable = {
  one: Record<string, number>
  two: Record<string, number>
  three: Record<string, number>
  four: Record<string, number>
  five: Record<string, number>
  six: Record<string, number>
}

// Generate all combinations of size k from array a
function combinations<T>(a: T[], k: number): T[][] {
  if (k <= 0) return [[]]
  if (k > a.length) return []
  const res: T[][] = []
  function backtrack(start: number, path: T[]) {
    if (path.length === k) { res.push([...path]); return }
    for (let i = start; i < a.length; i++) {
      path.push(a[i])
      backtrack(i + 1, path)
      path.pop()
    }
  }
  backtrack(0, [])
  return res
}

// Build a single HSF rule from pieces
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
  return {
    Keep: base.Keep,
    Use: base.Use,
    IsRuleTypeAND: true, // require all specified substats together
    ArtifactSet: base.ArtifactSet,
    ArtifactType: base.ArtifactType,
    Rank: base.Rank,
    Rarity: base.Rarity,
    MainStatID: base.MainStatID,
    MainStatF: base.MainStatF,
    LVLForCheck: base.LVLForCheck,
    Faction: base.Faction ?? 0,
    Substats: filled,
  }
}

// Returns true if the given substat is identical to the given main stat selection
// Identity means same stat family and same flat/percent variant where applicable.
function subEqualsMain(
  sub: { id: number; isFlat?: boolean },
  main: { id: number; f?: number }
): boolean {
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
function anySelectedSlotSupportsMain(selected?: ArtifactTypeId[], main?: { id: number; f?: number }): boolean {
  if (!selected || selected.length === 0) return true // No slot filter -> allow
  if (!main || main.id === -1) return true // Any main
  return selected.some(slot => isMainAllowedOnSlot(Number(slot), main))
}

// Compute roll-event schedule for a given rarity at milestone levels
// Returns a set of levels where an existing substat is rolled (not added)
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
  // Ranges: pick the highest roll schedule included (conservative)
  // >= Common..>= Epic (6..9) or >= Legendary (16): use Legendary
  if ((rarityCode >= 6 && rarityCode <= 9) || rarityCode === 16) return byExact.Legendary
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
  // Special cases for ranges and Any — be generous for potential keep
  // 0 (Any): assume additions are possible at 4/8/12/16
  if (rarityCode === 0) return byExact.Common
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
function rarityIncludesMythical(rarityCode: number): boolean {
  // Exact Mythical
  if (rarityCode === 15) return true
  // Any (0): do NOT assume Mythical. Treat as non-Mythical for pre-roll logic.
  if (rarityCode === 0) return false
  // Ranges that include Mythical
  // >= Common..>= Epic (6..9)
  if (rarityCode >= 6 && rarityCode <= 9) return true
  // >= Legendary (16) (interpreted as Legendary or higher)
  if (rarityCode === 16) return true
  // <= Mythical (14)
  if (rarityCode === 14) return true
  // Other exacts and ranges do not include Mythical
  return false
}

// Generate integer compositions of t rolls among m substats: arrays length m sum to t
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
type StatKeyDef = { id: number; isFlat?: boolean }

const BASE_MIN_6: Record<string, number> = {
  [`${StatId.HP}:true`]: 200, // HP
  [`${StatId.HP}:false`]: 5,  // HP%
  [`${StatId.ATK}:true`]: 15,  // ATK
  [`${StatId.ATK}:false`]: 5,  // ATK%
  [`${StatId.DEF}:true`]: 15,  // DEF
  [`${StatId.DEF}:false`]: 5,  // DEF%
  [`${StatId.SPD}:true`]: 5,   // SPD
  [`${StatId.RES}:true`]: 9,   // RES
  [`${StatId.ACC}:true`]: 9,   // ACC
  [`${StatId.CR}:false`]: 5,  // CR%
  [`${StatId.CDMG}:false`]: 5,  // CDMG%
}

const BASE_MIN_5: Record<string, number> = {
  [`${StatId.HP}:true`]: 160, // HP
  [`${StatId.HP}:false`]: 4,  // HP%
  [`${StatId.ATK}:true`]: 12,  // ATK
  [`${StatId.ATK}:false`]: 4,  // ATK%
  [`${StatId.DEF}:true`]: 12,  // DEF
  [`${StatId.DEF}:false`]: 4,  // DEF%
  [`${StatId.SPD}:true`]: 4,   // SPD
  [`${StatId.RES}:true`]: 8,   // RES
  [`${StatId.ACC}:true`]: 8,   // ACC
  [`${StatId.CR}:false`]: 4,  // CR%
  [`${StatId.CDMG}:false`]: 4,  // CDMG%
}

// Explicit literals for lower-star minima (derived from 5-star by -1 per tier)
export const BASE_MIN_4: Record<string, number> = {
  [`${StatId.HP}:true`]: 150, // HP     // guessed
  [`${StatId.HP}:false`]: 3,  // HP%
  [`${StatId.ATK}:true`]: 11,  // ATK    // guessed
  [`${StatId.ATK}:false`]: 3,  // ATK%
  [`${StatId.DEF}:true`]: 11,  // DEF    // guessed
  [`${StatId.DEF}:false`]: 3,  // DEF%
  [`${StatId.SPD}:true`]: 3,   // SPD
  [`${StatId.RES}:true`]: 7,   // RES
  [`${StatId.ACC}:true`]: 7,   // ACC
  [`${StatId.CR}:false`]: 3,  // CR%
  [`${StatId.CDMG}:false`]: 3,  // CDMG%
}

export const BASE_MIN_3: Record<string, number> = {
  [`${StatId.HP}:true`]: 140, // HP     // guessed
  [`${StatId.HP}:false`]: 2,  // HP%
  [`${StatId.ATK}:true`]: 10,  // ATK    // guessed
  [`${StatId.ATK}:false`]: 2,  // ATK%
  [`${StatId.DEF}:true`]: 10,  // DEF    // guessed
  [`${StatId.DEF}:false`]: 2,  // DEF%
  [`${StatId.SPD}:true`]: 2,   // SPD
  [`${StatId.RES}:true`]: 6,   // RES
  [`${StatId.ACC}:true`]: 6,   // ACC
  [`${StatId.CR}:false`]: 2,  // CR%
  [`${StatId.CDMG}:false`]: 2,  // CDMG%
}

export const BASE_MIN_2: Record<string, number> = {
  [`${StatId.HP}:true`]: 130,  // HP    // guessed
  [`${StatId.HP}:false`]: 1,   // HP%
  [`${StatId.ATK}:true`]: 9,    // ATK   // guessed
  [`${StatId.ATK}:false`]: 1,   // ATK%
  [`${StatId.DEF}:true`]: 9,    // DEF   // guessed
  [`${StatId.DEF}:false`]: 1,   // DEF%
  [`${StatId.SPD}:true`]: 1,    // SPD
  [`${StatId.RES}:true`]: 5,    // RES
  [`${StatId.ACC}:true`]: 5,    // ACC
  [`${StatId.CR}:false`]: 1,   // CR%
  [`${StatId.CDMG}:false`]: 1,   // CDMG%
}

export const BASE_MIN_1: Record<string, number> = {
  [`${StatId.HP}:true`]: 120,  // HP    // guessed
  [`${StatId.HP}:false`]: 1,   // HP%
  [`${StatId.ATK}:true`]: 8,    // ATK   // guessed
  [`${StatId.ATK}:false`]: 1,   // ATK%
  [`${StatId.DEF}:true`]: 8,    // DEF   // guessed
  [`${StatId.DEF}:false`]: 1,   // DEF%
  [`${StatId.SPD}:true`]: 1,    // SPD
  [`${StatId.RES}:true`]: 4,    // RES
  [`${StatId.ACC}:true`]: 4,    // ACC
  [`${StatId.CR}:false`]: 1,   // CR%
  [`${StatId.CDMG}:false`]: 1,   // CDMG%
}

function keyOf(s: StatKeyDef): string { return `${s.id}:${Boolean(s.isFlat)}` }

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

function baseMinForStar(stat: StatKeyDef, star: Star, minima: MinimaTable): number {
  const k = keyOf(stat)
  if (star === 6) return minima.six[k] ?? 0
  if (star === 5) return minima.five[k] ?? 0
  if (star === 4) return minima.four[k] ?? 0
  if (star === 3) return minima.three[k] ?? 0
  if (star === 2) return minima.two[k] ?? 0
  return minima.one[k] ?? 0
}

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

export function buildHsfRules(cfg: BuilderConfig, minima: MinimaTable = defaultMinima()): HsfRule[] {
  const rankCode = cfg.rankCode
  const rarityCode = cfg.rarityCode
  const factionCode = Number(cfg.factionCode ?? 0)

  // Build permutation pool respecting fixed substats
  const selectedPool = Array.isArray(cfg.substatVariants)
    ? cfg.substatVariants.map(variantToSub)
    : (Array.isArray(cfg.substats) ? cfg.substats : [])
  const fixedPoolRaw = Array.isArray(cfg.fixedSubstatVariants)
    ? cfg.fixedSubstatVariants.map(variantToSub)
    : (Array.isArray(cfg.fixedSubstats) ? cfg.fixedSubstats : [])
  // Normalize fixed to be a subset of selected; preserve order of appearance from selected
  const isSame = (a: {id:number;isFlat?:boolean}, b: {id:number;isFlat?:boolean}) => a.id === b.id && Boolean(a.isFlat) === Boolean(b.isFlat)
  const fixedPool = selectedPool.filter(s => fixedPoolRaw.some(f => isSame(f, s)))
  const required = fixedPool.slice(0, 4)
  const targetCount = Math.min(4, Math.max(cfg.minCount, required.length))
  const need = Math.max(0, targetCount - required.length)
  const optionalPool = selectedPool.filter(s => !required.some(r => isSame(r, s)))
  const optCombos = need === 0 ? [[]] : combinations(optionalPool, need)
  const subsCombos = optCombos.map(opt => required.concat(opt))

  const star = starForRankCode(rankCode)

  const baseCore = {
    Keep: cfg.keep,
    Use: cfg.enabled !== false,
    // Ensure HSF output stays strictly numeric
    ArtifactSet: cfg.artifactSets && cfg.artifactSets.length ? cfg.artifactSets.map(Number) : undefined,
    ArtifactType: cfg.artifactTypes && cfg.artifactTypes.length ? cfg.artifactTypes.map(Number) : undefined,
    Rank: rankCode,
    Rarity: rarityCode,
    Faction: factionCode as number,
  }

  const rules: HsfRule[] = []

  // Determine mainstat choices: [] means Any; otherwise list of id/f pairs to unroll
  const mains: Array<{ id: number; f?: number }> = Array.isArray(cfg.mainStatVariants)
    ? cfg.mainStatVariants.map(variantToMain)
    : (Array.isArray(cfg.mainStats) ? cfg.mainStats : [])
  const mainChoices = mains.length ? mains : [{ id: -1, f: 1 }]

  const baseline: 'afterStart' | 'upToLevel' = cfg.rollBaseline === 'upToLevel' ? 'upToLevel' : 'afterStart'
  // Resolve 'auto' to an effective mode based on whether any substat is "circled"
  // (i.e., has an active roll badge: min > 0 or wildcard).
  const hasCircled = (() => {
    const subs = Array.isArray(cfg.substats) ? cfg.substats : []
    if (subs.length === 0) return false
    for (const s of subs) {
      const v = subToVariant(s.id, s.isFlat)
      const b = (cfg.substatRollBoundsV as any)?.[v] ?? (cfg.substatRollBounds as any)?.[keyOf(s)]
      if (!b) continue
      if (typeof b.min === 'number' && b.min > 0) return true
    }
    return false
  })()
  const effectiveMode: 'off' | 'strict' | 'potential' =
    cfg.rollMode === 'auto'
      ? (hasCircled ? 'potential' : 'strict')
      : (cfg.rollMode === 'off' ? 'off' : (cfg.rollMode === 'strict' ? 'strict' : 'potential'))

  if (effectiveMode === 'off') {
    // Single level build at selected startLevel, unrolled per main choice, presence thresholds only
    for (const m of mainChoices) {
      for (const combo of subsCombos) {
        // Skip impossible combos where a substat equals the chosen main stat
        if (m.id !== -1 && combo.some(s => subEqualsMain(s, m))) continue
        if (!anySelectedSlotSupportsMain(cfg.artifactTypes, m)) continue
        const r = makeRule({
          ...baseCore,
          MainStatID: m.id,
          MainStatF: m.f ?? 1,
          // When startLevel is 'any', omit LVLForCheck to apply at any level
          LVLForCheck: typeof cfg.startLevel === 'number' ? cfg.startLevel : undefined,
        }, combo)
        for (let i = 0; i < combo.length; i++) {
          r.Substats[i].Condition = '>='
          r.Substats[i].Value = baseMinForStar(combo[i], star, minima)
        }
        rules.push(r)
      }
    }
    return rules
  }

  // Generate chain from start level up to 16 for roll levels
  const rollLevels = rollLevelsForRarityCode(rarityCode)
  // Build rules at milestone levels according to baseline option
  const effectiveStart = typeof cfg.startLevel === 'number' ? cfg.startLevel : 0
  for (const lvl of LEVELS) {
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
    const additionLevels = additionLevelsForRarityCode(rarityCode)
    const additionsRemaining = Array.from(additionLevels).filter(al => al > lvl).length
    // For each chosen substat combination, distribute numRollsUpTo rolls among them
    for (const combo of subsCombos) {
      const m = combo.length
      if (m === 0) {
        for (const mn of mainChoices) {
          // No substats selected; nothing to conflict with main
          if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mn)) continue
          rules.push(makeRule({ ...baseCore, MainStatID: mn.id, MainStatF: mn.f ?? 1, LVLForCheck: lvl }, combo))
        }
        continue
      }
      const baseVals = combo.map(s => baseMinForStar(s, star, minima))

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
          const s = combo[i]
          const v = subToVariant(s.id, s.isFlat)
          const b = (cfg.substatRollBoundsV as any)?.[v] ?? (cfg.substatRollBounds as any)?.[keyOf(s)]
          const any = Boolean(b?.any)
          const mv = Math.max(0, Math.min(5, Number(b?.min ?? 0)))
          const xvRaw = b?.max
          const xv = (typeof xvRaw === 'number' && isFinite(xvRaw)) ? Math.max(0, Math.min(5, Math.floor(xvRaw))) : undefined
          anyFlags.push(any)
          mins.push(mv)
          maxs.push(xv)
          if (mv > 0) anyMin = true
          if (any) anyWildcard = true
        }
        // If any substat demands min > max, configuration is impossible; skip rows for this level/combo
        let impossibleMinMax = false
        for (let i = 0; i < combo.length; i++) {
          if (maxs[i] !== undefined && mins[i] > (maxs[i] as number)) { impossibleMinMax = true; break }
        }
        if (impossibleMinMax) {
          // Do not emit presence or progress rows when constraints are contradictory
          continue
        }
        const sumMin = mins.reduce((a, b) => a + b, 0)
        // Dynamic Mythical handling for 'Any' rarity: if the requested mins require 5 total rolls
        // and rarity is Any (0), include one pre-roll to model Mythical as the only feasible path.
        let avail = numRollsForThisLevel
        let numTarget = numRollsByTarget
        if (rarityCode === 0 && sumMin >= 5) {
          avail += 1
          numTarget += 1
        }
        const remaining = Math.max(0, numTarget - avail)
        const emitPresence = () => {
          for (const mn of mainChoices) {
            if (mn.id !== -1 && combo.some(s => subEqualsMain(s, mn))) continue
            if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mn)) continue
            const r = makeRule({ ...baseCore, MainStatID: mn.id, MainStatF: mn.f ?? 1, LVLForCheck: lvl }, combo)
            for (let i = 0; i < combo.length; i++) {
              r.Substats[i].Condition = '>='
              r.Substats[i].Value = baseVals[i]
            }
            rules.push(r)
          }
        }
        const emitDists = (predicate: (dist: number[]) => boolean) => {
          let emitted = false
          for (const dist of rollDistributions(m, avail)) {
            // Enforce max caps first
            let overMax = false
            for (let i = 0; i < m; i++) {
              if (maxs[i] !== undefined && dist[i] > (maxs[i] as number)) { overMax = true; break }
            }
            if (overMax) continue
            if (!predicate(dist)) continue
            for (const mn of mainChoices) {
              if (mn.id !== -1 && combo.some(s => subEqualsMain(s, mn))) continue
              if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mn)) continue
              const r = makeRule({ ...baseCore, MainStatID: mn.id, MainStatF: mn.f ?? 1, LVLForCheck: lvl }, combo)
              for (let i = 0; i < m; i++) {
                r.Substats[i].Condition = '>='
                r.Substats[i].Value = baseVals[i] + dist[i] * baseVals[i]
              }
              rules.push(r)
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
              if (maxs[i] !== undefined && sel[i] > (maxs[i] as number)) { overMax = true; break }
            }
            if (overMax) continue
            if (!predicate(sel)) continue
            for (const mn of mainChoices) {
              if (mn.id !== -1 && combo.some(s => subEqualsMain(s, mn))) continue
              if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mn)) continue
              const r = makeRule({ ...baseCore, MainStatID: mn.id, MainStatF: mn.f ?? 1, LVLForCheck: lvl }, combo)
              for (let i = 0; i < m; i++) {
                r.Substats[i].Condition = '>='
                r.Substats[i].Value = baseVals[i] + sel[i] * baseVals[i]
              }
              rules.push(r)
            }
            emitted = true
          }
          return emitted
        }
        const emitMinOnly = () => {
          for (const mn of mainChoices) {
            if (mn.id !== -1 && combo.some(s => subEqualsMain(s, mn))) continue
            if (!anySelectedSlotSupportsMain(cfg.artifactTypes, mn)) continue
            const r = makeRule({ ...baseCore, MainStatID: mn.id, MainStatF: mn.f ?? 1, LVLForCheck: lvl }, combo)
            for (let i = 0; i < m; i++) {
              // lower-bound: base + mins[i]*base
              r.Substats[i].Condition = '>='
              r.Substats[i].Value = baseVals[i] + mins[i] * baseVals[i]
            }
            rules.push(r)
          }
          return true
        }

        if (effectiveMode === 'strict') {
          if (!anyMin && !anyWildcard) {
            // 0 = no minimum: presence only
            emitPresence()
          } else if (!anyMin && anyWildcard) {
            // wildcard only: all options
            emitDists(() => true)
          } else {
            // have mins (with or without wildcard)
            if (avail <= 0) {
              // not feasible yet: no rule for this level
            } else if (sumMin <= avail) {
              // min-only at and after feasibility
              emitMinOnly()
            } else {
              // not feasible: no rule
            }
          }
        } else { // potential
          if (!anyMin && !anyWildcard) {
            emitPresence()
          } else if (!anyMin && anyWildcard) {
            // Allow leftover rolls to go to non-targeted substats
            emitDistsAllowOther(() => true)
          } else {
            // If the requested mins cannot be satisfied even by the target level, skip entirely
            if (sumMin > numTarget) {
              // impossible by target: do not emit presence or progress rows
            } else if (avail <= 0) {
              emitPresence()
            } else if (sumMin <= avail) {
              // Feasible now: include the strict lower-bound row, and also allow
              // partial-progress rows that can still reach mins by the target level
              // (deficit across non-wildcard stats can be made up by remaining rolls).
              // To avoid duplicates: skip the exact-min distribution here and emit it once via emitMinOnly().
              emitDistsAllowOther((dist) => {
                let deficit = 0
                let isExactMin = true
                for (let i = 0; i < m; i++) {
                  if (!anyFlags[i]) {
                    if (dist[i] > mins[i]) return false
                    deficit += Math.max(0, mins[i] - dist[i])
                  }
                  if (dist[i] !== mins[i]) isExactMin = false
                }
                if (isExactMin) return false
                return deficit <= remaining
              })
              // Always include the min-only lower bound once
              emitMinOnly()
            } else {
              // partial progress allowed; ensure deficits can still be made up by target
              emitDistsAllowOther((dist) => {
                let deficit = 0
                for (let i = 0; i < m; i++) {
                  if (!anyFlags[i]) {
                    if (dist[i] > mins[i]) return false
                    deficit += Math.max(0, mins[i] - dist[i])
                  }
                }
                return deficit <= remaining
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

// Expose available stat options for UI
// mainStatOptions and substatOptions have been superseded by StatVariant

export function labelForSub(id: number, isFlat?: boolean): string {
  return statNameFromId(id, !!isFlat)
}
