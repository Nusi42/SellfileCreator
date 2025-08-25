import type { HsfRule } from './hsfTypes'
import { statNameFromId } from './types'

// Simple inputs for the HSF rule builder
export interface BuilderConfig {
  // Optional display name for this rule configuration (saved in HSFR)
  name?: string
  keep: boolean
  // Rank code: HSF-compatible (0..16): exact 1..6, >=1..>=5 (7..11), <=2..<=6 (12..16), 0 any
  rankCode: number
  // Rarity code: HSF-compatible (0..16): see rarityCodeToName in types.ts
  rarityCode: number
  // Faction code (0 Any, 1..15 per factionNames in types.ts)
  factionCode?: number
  // Main stats selection. Empty -> Any. If provided, we unroll rules per selected main stat.
  // Back-compat: older HSFRs may include single `mainStat`; loader normalizes into `mainStats`.
  mainStats?: Array<{ id: number; f?: number }>
  // Starting level selection (0, 4, 8, 12, 16). Special 'any' is allowed only with rollMode='off'.
  startLevel: 0 | 4 | 8 | 12 | 16 | 'any'
  // How to treat rolls relative to start level when generating thresholds
  // 'afterStart' (default): treat start as a reset; only rolls after start count
  // 'upToLevel': include prior rolls up to each milestone (incl. start)
  rollBaseline?: 'afterStart' | 'upToLevel'
  // Roll generation mode: 'off' (start only), 'strict' (milestones strict), 'potential' (strict + early relaxed keeps)
  rollMode: 'off' | 'strict' | 'potential'
  // Substat targets: choose K from this set; generate combinations of size minCount
  substats: Array<{ id: number; isFlat?: boolean }>
  // Substats that must always be included in generated permutations (subset of substats)
  fixedSubstats?: Array<{ id: number; isFlat?: boolean }>
  // Optional per-substat roll bounds used to filter distributions
  // Key format: `${id}:${isFlat}` (e.g., '4:true' for SPD)
  // min: require at least N rolls; max: optional upper bound; any: wildcard (permute all)
  substatRollBounds?: Record<string, { min?: number; max?: number; any?: boolean }>
  minCount: 0 | 1 | 2 | 3 | 4
  // When true, UI keeps minCount in sync with selected substat count: min(4, substats.length)
  autoMinCount?: boolean
  // Optional slot and set filters (HSF numeric IDs); omit for Any
  artifactTypes?: number[]
  artifactSets?: number[]
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

const BASE_MIN_5: Record<string, number> = {
  '1:true': 160, // HP
  '1:false': 4,  // HP%
  '2:true': 12,  // ATK
  '2:false': 4,  // ATK%
  '3:true': 12,  // DEF
  '3:false': 4,  // DEF%
  '4:true': 4,   // SPD
  '5:true': 7,   // RES
  '6:true': 7,   // ACC
  '7:false': 4,  // CR%
  '8:false': 4,  // CDMG%
}

const BASE_MIN_6: Record<string, number> = {
  '1:true': 200,
  '1:false': 5,
  '2:true': 15,
  '2:false': 5,
  '3:true': 15,
  '3:false': 5,
  '4:true': 5,
  '5:true': 9,
  '6:true': 9,
  '7:false': 5,
  '8:false': 5,
}

// Explicit literals for lower-star minima (derived from 5-star by -1 per tier)
export const BASE_MIN_4: Record<string, number> = {
  '1:true': 159,
  '1:false': 3,
  '2:true': 11,
  '2:false': 3,
  '3:true': 11,
  '3:false': 3,
  '4:true': 3,
  '5:true': 6,
  '6:true': 6,
  '7:false': 3,
  '8:false': 3,
}

export const BASE_MIN_3: Record<string, number> = {
  '1:true': 158,
  '1:false': 2,
  '2:true': 10,
  '2:false': 2,
  '3:true': 10,
  '3:false': 2,
  '4:true': 2,
  '5:true': 5,
  '6:true': 5,
  '7:false': 2,
  '8:false': 2,
}

export const BASE_MIN_2: Record<string, number> = {
  '1:true': 157,
  '1:false': 1,
  '2:true': 9,
  '2:false': 1,
  '3:true': 9,
  '3:false': 1,
  '4:true': 1,
  '5:true': 4,
  '6:true': 4,
  '7:false': 1,
  '8:false': 1,
}

export const BASE_MIN_1: Record<string, number> = {
  '1:true': 156,
  '1:false': 1,
  '2:true': 8,
  '2:false': 1,
  '3:true': 8,
  '3:false': 1,
  '4:true': 1,
  '5:true': 3,
  '6:true': 3,
  '7:false': 1,
  '8:false': 1,
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
  const selectedPool = Array.isArray(cfg.substats) ? cfg.substats : []
  const fixedPoolRaw = Array.isArray(cfg.fixedSubstats) ? cfg.fixedSubstats : []
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
    Use: true,
    ArtifactSet: cfg.artifactSets && cfg.artifactSets.length ? cfg.artifactSets : undefined,
    ArtifactType: cfg.artifactTypes && cfg.artifactTypes.length ? cfg.artifactTypes : undefined,
    Rank: rankCode,
    Rarity: rarityCode,
    Faction: factionCode as number,
  }

  const rules: HsfRule[] = []

  // Determine mainstat choices: [] means Any; otherwise list of id/f pairs to unroll
  const mains: Array<{ id: number; f?: number }> = Array.isArray(cfg.mainStats) ? cfg.mainStats : []
  const mainChoices = mains.length ? mains : [{ id: -1, f: 1 }]

  const baseline: 'afterStart' | 'upToLevel' = cfg.rollBaseline === 'upToLevel' ? 'upToLevel' : 'afterStart'

  if (cfg.rollMode === 'off') {
    // Single level build at selected startLevel, unrolled per main choice, presence thresholds only
    for (const m of mainChoices) {
      for (const combo of subsCombos) {
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
    const numRollsForThisLevel = baseline === 'upToLevel'
      ? rollsUpToLvl
      : Math.max(0, rollsUpToLvl - rollsUpToStart)
    // For potential-keep calculations, consider target as +16
    const rollsUpTo16 = LEVELS.filter(l => l <= 16 && rollLevels.has(l)).length
    const numRollsByTarget = baseline === 'upToLevel' ? rollsUpTo16 : Math.max(0, rollsUpTo16 - rollsUpToStart)
    const remainingRollsToTarget = Math.max(0, numRollsByTarget - numRollsForThisLevel)
    const additionLevels = additionLevelsForRarityCode(rarityCode)
    const additionsRemaining = Array.from(additionLevels).filter(al => al > lvl).length
    // For each chosen substat combination, distribute numRollsUpTo rolls among them
    for (const combo of subsCombos) {
      const m = combo.length
      if (m === 0) {
        for (const mn of mainChoices) {
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
        const anyFlags: boolean[] = []
        let anyMin = false
        let anyWildcard = false
        for (let i = 0; i < combo.length; i++) {
          const k = keyOf(combo[i])
          const any = Boolean((cfg.substatRollBounds as any)?.[k]?.any)
          const mv = Math.max(0, Math.min(5, Number((cfg.substatRollBounds as any)?.[k]?.min ?? 0)))
          anyFlags.push(any)
          mins.push(mv)
          if (mv > 0) anyMin = true
          if (any) anyWildcard = true
        }
        const sumMin = mins.reduce((a, b) => a + b, 0)
        const avail = numRollsForThisLevel
        const emitPresence = () => {
          for (const mn of mainChoices) {
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
            if (!predicate(dist)) continue
            for (const mn of mainChoices) {
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
        const emitMinOnly = () => {
          for (const mn of mainChoices) {
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

        if (cfg.rollMode === 'strict') {
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
            emitDists(() => true)
          } else {
            if (avail <= 0) {
              emitPresence()
            } else if (sumMin <= avail) {
              // once feasible, enforce min-only lower bound so "at least N" holds at later levels
              emitMinOnly()
            } else {
              // partial progress allowed
              emitDists((dist) => {
                for (let i = 0; i < m; i++) {
                  if (!anyFlags[i] && dist[i] > mins[i]) return false
                }
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

// Expose available stat options for UI
export const mainStatOptions: Array<{ label: string; id: number; f?: number }> = [
  // ID, F pairs map (see types.statNameFromId)
  { label: 'Any', id: -1 },
  { label: 'HP', id: 1, f: 1 },
  { label: 'HP%', id: 1, f: 0 },
  { label: 'ATK', id: 2, f: 1 },
  { label: 'ATK%', id: 2, f: 0 },
  { label: 'DEF', id: 3, f: 1 },
  { label: 'DEF%', id: 3, f: 0 },
  { label: 'SPD', id: 4 },
  { label: 'RES', id: 5 },
  { label: 'ACC', id: 6 },
  { label: 'CR%', id: 7, f: 0 },
  { label: 'CDMG%', id: 8, f: 0 },
]

export const substatOptions: Array<{ label: string; id: number; isFlat?: boolean }> = [
  { label: 'SPD', id: 4, isFlat: true },
  { label: 'CR%', id: 7, isFlat: false },
  { label: 'CDMG%', id: 8, isFlat: false },
  { label: 'ACC', id: 6, isFlat: true },
  { label: 'RES', id: 5, isFlat: true },
  { label: 'HP%', id: 1, isFlat: false },
  { label: 'ATK%', id: 2, isFlat: false },
  { label: 'DEF%', id: 3, isFlat: false },
  { label: 'HP', id: 1, isFlat: true },
  { label: 'ATK', id: 2, isFlat: true },
  { label: 'DEF', id: 3, isFlat: true },
]

export function labelForSub(id: number, isFlat?: boolean): string {
  return statNameFromId(id, !!isFlat)
}
