import type { HsfRule } from './hsfTypes'
import { statNameFromId } from './types'

// Simple inputs for the HSF rule builder
export type MinOrAny<T> = { kind: 'any' } | { kind: 'min'; value: T } | { kind: 'exact'; value: T }

export interface BuilderConfig {
  // Optional display name for this rule configuration (saved in HSFR)
  name?: string
  keep: boolean
  // Rank: supports Any, >= 1..5 star, or Exact 6-star
  rank: MinOrAny<1 | 2 | 3 | 4 | 5 | 6>
  // Rarity: now treated as exact for roll schedule
  rarityExact: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythical'
  // Main stat: Any or one of the (ID,F) pairs below
  mainStat: { any: true } | { any: false; id: number; f?: number }
  // Starting level selection (per request: 0, 4, 8, 12, 16)
  startLevel: 0 | 4 | 8 | 12 | 16
  // When true, generate rules at 4, 8, 12, 16 based on roll permutations from startLevel
  generateRollPermutations: boolean
  // Substat targets: choose K from this set; generate combinations of size minCount
  substats: Array<{ id: number; isFlat?: boolean }>
  minCount: 0 | 1 | 2 | 3 | 4
  // Optional slot and set filters (HSF numeric IDs); omit for Any
  artifactTypes?: number[]
  artifactSets?: number[]
}

// Encode Rank to HSF code
// 0: Any; 1..6: exact stars; 7..11: >=1..>=5; 12..16: <=2..<=6 (we only need Any, >=1..5, and exact 6)
export function encodeRank(cfg: BuilderConfig['rank']): number {
  if (cfg.kind === 'any') return 0
  if (cfg.kind === 'min') {
    const v = cfg.value
    if (v >= 1 && v <= 5) return v + 6 // >=1..>=5
    if (v === 6) return 6 // fallback to exact 6-star (no >=6 code exists)
  }
  // exact
  return cfg.value
}

// Encode Rarity to HSF code
// 0: Any; 1..5 exact; 6..9: >= Common..>= Epic; 16: >= Legendary; 15: Mythical
export function encodeRarityExact(value: BuilderConfig['rarityExact']): number {
  // exact codes
  switch (value) {
    case 'Common': return 1
    case 'Uncommon': return 2
    case 'Rare': return 3
    case 'Epic': return 4
    case 'Legendary': return 5
    case 'Mythical': return 15
  }
}

// Levels: 0/4/8/12/16 are milestone checks.
export const LEVELS: Array<0|4|8|12|16> = [0,4,8,12,16]

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
function rollLevelsForRarity(r: BuilderConfig['rarityExact']): Set<0|4|8|12|16> {
  // Based on ARTIFACT_RULES.md
  // Common: created with 0 subs; levels 4/8/12/16 add new substat (no rolls)
  // Uncommon: start 1; add at 8/12/16; roll at 4
  // Rare: start 2; add at 12/16; roll at 4/8
  // Epic: start 3; add at 16; roll at 4/8/12
  // Legendary: start 4; no adds; roll at 4/8/12/16
  // Mythical: start 4; no adds; one substat already has a bonus at creation; roll at 4/8/12/16
  switch (r) {
    case 'Common': return new Set([])
    case 'Uncommon': return new Set([4])
    case 'Rare': return new Set([4,8])
    case 'Epic': return new Set([4,8,12])
    case 'Legendary': return new Set([4,8,12,16])
    case 'Mythical': return new Set([4,8,12,16])
  }
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

function keyOf(s: StatKeyDef): string { return `${s.id}:${Boolean(s.isFlat)}` }

function baseMinForStar(stat: StatKeyDef, star: Star): number {
  const k = keyOf(stat)
  if (star === 6) return BASE_MIN_6[k] ?? 0
  if (star === 5) return BASE_MIN_5[k] ?? 0
  // Stars 1-4: use 5-star minus 1 as requested
  const v5 = BASE_MIN_5[k] ?? 0
  return Math.max(0, v5 - 1)
}

function starForThresholds(rank: BuilderConfig['rank']): Star {
  if (rank.kind === 'exact') return Math.min(6, Math.max(1, rank.value)) as Star
  if (rank.kind === 'min') {
    if (rank.value >= 6) return 6
    if (rank.value >= 5) return 5
    return 4 // treat 1-4 the same bucket using (5-star - 1)
  }
  // any -> assume 6-star for safer higher thresholds
  return 6
}

export function buildHsfRules(cfg: BuilderConfig): HsfRule[] {
  const rankCode = encodeRank(cfg.rank)
  const rarityCode = encodeRarityExact(cfg.rarityExact)
  const mainId = cfg.mainStat.any ? -1 : cfg.mainStat.id
  const mainF = cfg.mainStat.any ? 1 : cfg.mainStat.f ?? 1

  const k = cfg.minCount
  const pool = cfg.substats
  const subsCombos = k === 0 ? [[]] : combinations(pool, k)

  const star = starForThresholds(cfg.rank)

  const base = {
    Keep: cfg.keep,
    Use: true,
    ArtifactSet: cfg.artifactSets && cfg.artifactSets.length ? cfg.artifactSets : undefined,
    ArtifactType: cfg.artifactTypes && cfg.artifactTypes.length ? cfg.artifactTypes : undefined,
    Rank: rankCode,
    Rarity: rarityCode,
    MainStatID: mainId,
    MainStatF: mainF,
    Faction: 0 as number,
  }

  const rules: HsfRule[] = []

  // Helper to push presence-only rule
  const pushPresenceRule = (lvl: 0|4|8|12|16) => {
    for (const combo of subsCombos) {
      // set baseline minima at this level
      const minima = combo.map(s => ({ ...s }))
      const r = makeRule({ ...base, LVLForCheck: lvl }, minima)
      for (let i = 0; i < combo.length; i++) {
        r.Substats[i].Condition = '>='
        r.Substats[i].Value = baseMinForStar(combo[i], star)
      }
      rules.push(r)
    }
  }

  if (!cfg.generateRollPermutations) {
    // Single level build at selected startLevel
    pushPresenceRule(cfg.startLevel)
    return rules
  }

  // Generate chain from start level up to 16 for roll levels
  const rollLevels = rollLevelsForRarity(cfg.rarityExact)
  // Always include a rule at the start level (presence-only)
  if (LEVELS.includes(cfg.startLevel)) pushPresenceRule(cfg.startLevel)

  // Build cumulative rules at milestone levels > start
  for (const lvl of LEVELS) {
    if (lvl <= cfg.startLevel) continue
    const numRollsUpTo = LEVELS.filter(l => l <= lvl && rollLevels.has(l)).length
    // For each chosen substat combination, distribute numRollsUpTo rolls among them
    for (const combo of subsCombos) {
      const m = combo.length
      if (m === 0) { rules.push(makeRule({ ...base, LVLForCheck: lvl }, combo)); continue }
      const baseVals = combo.map(s => baseMinForStar(s, star))
      for (const dist of rollDistributions(m, numRollsUpTo)) {
        const r = makeRule({ ...base, LVLForCheck: lvl }, combo)
        for (let i = 0; i < m; i++) {
          r.Substats[i].Condition = '>='
          r.Substats[i].Value = baseVals[i] + dist[i] * baseVals[i]
        }
        rules.push(r)
      }
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
