/* eslint-disable import/no-unused-modules, @typescript-eslint/no-explicit-any */
// End-to-end HSFR-driven tests. These validate the full path:
// HSFR (readable) -> normalizeConfig (IO) -> buildHsfRules (builder).
//
// Test vectors are expressed in the same readable format the App accepts,
// so you can copy/paste these objects into the UI.

import { buildHsfRules, defaultMinima, LEVELS } from '../src/lib/hsfBuilder.js'
import { normalizeConfig } from '../src/lib/hsfrIO.js'
import { variantToSub } from '../src/lib/hsfTypes.js'
import { variantFromLabel } from '../src/lib/types.js'

function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg) }

// Map level -> unique, sorted threshold values for a given substat ID
function extractThresholds(rules: any[], statVariant: number): Map<number, number[]> {
  const statId = Number(variantToSub(statVariant).id)
  const map = new Map<number, number[]>()
  for (const r of rules) {
    const lvl = Number(r.LVLForCheck)
    const subs: Array<{ ID: number; Value: number }> = Array.isArray(r.Substats) ? r.Substats : []
    for (let i = 0; i < Math.min(4, subs.length); i++) {
      const s = subs[i]
      if (!s || s.ID !== statId) continue
      const arr = map.get(lvl) ?? []
      arr.push(Number(s.Value))
      map.set(lvl, arr)
    }
  }
  for (const [lvl, arr] of map) {
    const uniq = Array.from(new Set(arr)).sort((a, b) => a - b)
    map.set(lvl, uniq)
  }
  return map
}

type ThresholdExpect = { stat: string; expect: Array<[0|4|8|12|16, number[]]> }
type RarityExpect = { expectCodes: number[] } // unique set of expected rarity codes across rows

export type Case = {
  name: string
  hsfr: Record<string, unknown>
  thresholds?: ThresholdExpect[]
  rarity?: RarityExpect
  validate?: (rules: any[]) => void
}

function runCase(c: Case): void {
  const cfg = normalizeConfig(c.hsfr)
  const rules = buildHsfRules(cfg, defaultMinima())
  // Intentionally no console debug logging in tests. Keep output clean.
  if (c.rarity) {
    const codes = Array.from(new Set(rules.map(r => Number(r.Rarity)))).sort((a,b)=>a-b)
    const exp = Array.from(new Set(c.rarity.expectCodes)).sort((a,b)=>a-b)
    assert(codes.length === exp.length && codes.every((v,i)=>v===exp[i]), `${c.name}: rarity codes ${JSON.stringify(codes)} != ${JSON.stringify(exp)}`)
  }
  for (const t of c.thresholds ?? []) {
    const v = variantFromLabel(t.stat)
    assert(v !== null, `${c.name}: unknown stat label ${t.stat}`)
    const th = extractThresholds(rules, Number(v))
    const expMap = new Map<number, number[]>(t.expect.map(([lvl, arr]) => [lvl, arr]))
    for (const lvl of LEVELS) {
      const got = th.get(lvl) ?? []
      const exp = expMap.get(lvl) ?? []
      assert(got.length === exp.length && got.every((val, i) => val === exp[i]), `${c.name} ${t.stat} @+${lvl}: got ${got} != ${exp}`)
    }
  }
  if (c.validate) c.validate(rules)
}

let passed = 0
let failed = 0
declare const process: any
declare const console: any
function test(name: string, fn: () => void): void {
  try { fn(); console.log(`ok - ${name}`); passed++ } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`not ok - ${name}`)
    console.error('  ', msg)
    failed++
  }
}

// Cases: expressed as HSFR-readable configs (labels, not numeric codes)
const cases: Case[] = [
  // -----------------
  // Test 1 / 2 / 2b-d
  // -----------------
  {
    name: 'ACC min=2 (progressive)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['ACC'], substatRollBounds: { 'ACC': { min: 2 } }, minCount: 1, autoMinCount: true },
    thresholds: [
      { stat: 'ACC', expect: [[0,[9]],[4,[18]],[8,[27]],[12,[27]],[16,[27]]] },
    ],
  },
  {
    name: 'ACC min=3 (progressive)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['ACC'], substatRollBounds: { 'ACC': { min: 3 } }, minCount: 1, autoMinCount: true },
    thresholds: [
      { stat: 'ACC', expect: [[0,[9]],[4,[18]],[8,[27]],[12,[36]],[16,[36]]] },
    ],
  },
  {
    name: 'ACC min=2 with MinRequired=5 uses global progressive thresholds',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['ACC'], substatRollBounds: { 'ACC': { min: 2 } }, minCount: 1, autoMinCount: true, minRequiredRolls: 5, autoMinRequiredRolls: false },
    thresholds: [
      { stat: 'ACC', expect: [[0,[18]],[4,[27]],[8,[36]],[12,[45]],[16,[54]]] },
    ],
  },
  {
    name: 'ACC min=5 per-stat progressive thresholds',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['ACC'], substatRollBounds: { 'ACC': { min: 5 } }, minCount: 1, autoMinCount: true },
    thresholds: [
      { stat: 'ACC', expect: [[0,[18]],[4,[27]],[8,[36]],[12,[45]],[16,[54]]] },
    ],
  },
  {
    name: 'ACC MinRequired=5 only progressive thresholds',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['ACC'], substatRollBounds: {}, minCount: 1, autoMinCount: true, minRequiredRolls: 5, autoMinRequiredRolls: false },
    thresholds: [
      { stat: 'ACC', expect: [[0,[18]],[4,[27]],[8,[36]],[12,[45]],[16,[54]]] },
    ],
  },
  {
    name: 'SPD min=2 (late)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, earlyKeepMode: 'late', substats: ['SPD'], substatRollBounds: { 'SPD': { min: 2 } }, minCount: 1, autoMinCount: true },
    thresholds: [
      // Late mode: require only what must be present now to keep +16 achievable.
      // With SPD min=2, the minimal lower-bound stays at base (5) until +12,
      // then rises: +12 -> 10, +16 -> 15.
      { stat: 'SPD', expect: [[0,[5]],[4,[5]],[8,[5]],[12,[10]],[16,[15]]] },
    ],
  },
  {
    name: 'SPD(2)+ACC(1) (late: minimal lower-bounds)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, earlyKeepMode: 'late', substats: ['SPD','ACC'], substatRollBounds: { 'SPD': { min: 2 }, 'ACC': { min: 1 } }, minCount: 2, autoMinCount: false },
    thresholds: [
      // Late mode minimal lower-bounds: at +4, only SPD base (5) is required now;
      // ACC shows its own base (9) in its column. At +8, SPD thresholds are [5,10].
      { stat: 'SPD', expect: [[0,[5]],[4,[5]],[8,[5,10]],[12,[10,15]],[16,[15]]] },
      { stat: 'ACC', expect: [[0,[9]],[4,[9]],[8,[9,18]],[12,[9,18]],[16,[18]]] },
    ],
  },
  {
    name: 'SPD(2)+CR(1) (progressive)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD','CR%'], substatRollBounds: { 'SPD': { min: 2 }, 'CR%': { min: 1 } }, minCount: 2, autoMinCount: false },
    thresholds: [
      { stat: 'SPD', expect: [[0,[5]],[4,[5,10]],[8,[5,10,15]],[12,[15]],[16,[15]]] },
      { stat: 'CR%', expect: [[0,[5]],[4,[5,10]],[8,[5,10,15]],[12,[10]],[16,[10]]] },
    ],
  },
  {
    name: 'SPD(2)+CR(1)+CDMG(*) (progressive)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD','CR%','CDMG%'], substatRollBounds: { 'SPD': { min: 2 }, 'CR%': { min: 1 }, 'CDMG%': { any: true } }, minCount: 3, autoMinCount: false },
    thresholds: [
      { stat: 'SPD', expect: [[0,[5]],[4,[5,10]],[8,[5,10,15]],[12,[15]],[16,[15]]] },
      { stat: 'CR%', expect: [[0,[5]],[4,[5,10]],[8,[5,10,15]],[12,[10]],[16,[10]]] },
      { stat: 'CDMG%', expect: [[0,[5]],[4,[5,10]],[8,[5,10]],[12,[5]],[16,[5]]] },
    ],
  },
  {
    name: 'STAR+STAR with MinRequired(1) (progressive minimal pairs)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD','ACC'], substatRollBounds: { 'SPD': { any: true }, 'ACC': { any: true } }, minCount: 2, autoMinCount: false, minRequiredRolls: 1, autoMinRequiredRolls: false },
    thresholds: [
      // At +0, presence-only with MinRequired(1) yields base thresholds for both stats.
      { stat: 'SPD', expect: [[0,[5]],[4,[5,10]],[8,[5,10]],[12,[5,10]],[16,[5,10]]] },
      { stat: 'ACC', expect: [[0,[9]],[4,[9,18]],[8,[9,18]],[12,[9,18]],[16,[9,18]]] },
    ],
  },
  {
    name: 'STAR + MinRequired(1) with SPD max=0 (globally impossible -> no rules)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD'], substatRollBounds: { 'SPD': { max: 0 } }, minCount: 1, autoMinCount: true, minRequiredRolls: 1, autoMinRequiredRolls: false },
    validate: (rules) => {
      const count = Array.isArray(rules) ? rules.length : 0
      assert(count === 0, `expected 0 rules, got ${count}`)
    },
  },
  {
    name: 'STAR + MinRequired(1) on single substat (SPD) progressive single row',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD'], substatRollBounds: { 'SPD': { any: true } }, minCount: 1, autoMinCount: true, minRequiredRolls: 1, autoMinRequiredRolls: false },
    thresholds: [
      // 6★ SPD base = 5; progressive single-row thresholds by milestone
      { stat: 'SPD', expect: [[0,[5]],[4,[10]],[8,[10]],[12,[10]],[16,[10]]] },
    ],
  },
  {
    name: 'Strict at +16 emits only lower-bound',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', startLevel: 16, rollBaseline: 'upToLevel', rollMode: 'strict', substats: ['ACC'], substatRollBounds: { 'ACC': { min: 2 } }, minLevel: 16, maxLevel: 16, minCount: 1, autoMinCount: true },
    thresholds: [
      { stat: 'ACC', expect: [[0,[]],[4,[]],[8,[]],[12,[]],[16,[27]]] },
    ],
  },
  {
    name: 'MinRequiredRolls=3 filters unreachable states',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', substats: ['ACC'], substatRollBounds: {}, minCount: 1, autoMinCount: true, minRequiredRolls: 3, autoMinRequiredRolls: false, minLevel: 0, maxLevel: 16 },
    validate: (rules) => {
      const th = extractThresholds(rules, Number(variantFromLabel('ACC')))
      const at8 = th.get(8) ?? []
      // Late/progressive behavior with MinRequired=3 yields ACC >= 27 at +8
      // (not 18). Expect exactly [27] here.
      assert(at8.length > 0 && at8[0] === 27, `+8 should include 27; got ${at8}`)
      const at16 = th.get(16) ?? []
      assert(at16.length > 0 && at16[0] === 36, `+16 should start at 36; got ${at16}`)
    },
  },
  {
    name: 'Auto (no mins) at +16 -> single keep-all rule',
    hsfr: { Rank: 'Any', Rarity: 'Auto', Faction: 'Any', minLevel: 16, maxLevel: 16, substats: [], minCount: 1, autoMinCount: true },
    validate: (rules) => {
      assert(rules.length === 1, `expected 1 rule, got ${rules.length}`)
      const r = rules[0]
      assert(Number(r.LVLForCheck) === 16, `expected LVLForCheck=16, got ${r.LVLForCheck}`)
      assert(Number(r.Rarity) === 0, `expected Rarity=Any(0), got ${r.Rarity}`)
      const subs = Array.isArray(r.Substats) ? r.Substats : []
      assert(subs.length === 4 && subs.every((s: any) => Number(s.ID) === -1), `expected padded empty substats, got ${JSON.stringify(subs)}`)
    },
  },
  // Variations: 0..16 window, specific mainstat, rank/range, rarity/range, slot, faction, combined rank+rarity
  {
    name: 'Auto (no mins) 0..16 -> single keep-all at Any level (99)',
    hsfr: { Rank: 'Any', Rarity: 'Auto', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: [], minCount: 1, autoMinCount: true },
    validate: (rules) => {
      assert(rules.length === 1, `expected 1 rule, got ${rules.length}`)
      const r = rules[0]
      assert(Number(r.LVLForCheck) === 99, `expected LVLForCheck=99, got ${r.LVLForCheck}`)
      assert(Number(r.Rarity) === 0, `expected Rarity=Any(0), got ${r.Rarity}`)
    },
  },
  {
    name: 'Auto (no mins) with Mainstat HP% -> single rule at 16',
    hsfr: { Rank: 'Any', Rarity: 'Auto', Faction: 'Any', minLevel: 16, maxLevel: 16, mainStats: ['HP%'], substats: [], minCount: 1, autoMinCount: true },
    validate: (rules) => {
      assert(rules.length === 1, `expected 1 rule, got ${rules.length}`)
      const r = rules[0]
      assert(Number(r.MainStatID) === 1 && Number(r.MainStatF) === 0, `expected MainStat HP% (id=1,f=0), got id=${r.MainStatID},f=${r.MainStatF}`)
      assert(Number(r.LVLForCheck) === 16, `expected LVLForCheck=16, got ${r.LVLForCheck}`)
    },
  },
  {
    name: 'Auto (no mins) with Rank ≥5* -> single rule at 16',
    hsfr: { Rank: '≥ 5★', Rarity: 'Auto', Faction: 'Any', minLevel: 16, maxLevel: 16, substats: [], minCount: 1, autoMinCount: true },
    validate: (rules) => {
      assert(rules.length === 1, `expected 1 rule, got ${rules.length}`)
      const r = rules[0]
      assert(Number(r.Rank) === 11, `expected Rank code ≥5*(11), got ${r.Rank}`)
    },
  },
    {
    name: 'Auto (no mins) with Rarity ≥ Epic -> single rule at 16',
    hsfr: { Rank: 'Any', Rarity: '≥ Epic', Faction: 'Any', minLevel: 16, maxLevel: 16, substats: [], minCount: 1, autoMinCount: true },
    validate: (rules) => {
      assert(rules.length === 1, `expected 1 rule, got ${rules.length}`)
      const r = rules[0]
      assert(Number(r.Rarity) === 9, `expected Rarity code ≥Epic(9), got ${r.Rarity}`)
    },
  },
  {
    name: 'Auto (no mins) with Slot=Amulet -> single rule at 16',
    hsfr: { Rank: 'Any', Rarity: 'Auto', Faction: 'Any', minLevel: 16, maxLevel: 16, substats: [], minCount: 1, autoMinCount: true, artifactTypeNames: ['Amulet'] },
    validate: (rules) => {
      assert(rules.length === 1, `expected 1 rule, got ${rules.length}`)
      const r = rules[0]
      const types = Array.isArray(r.ArtifactType) ? r.ArtifactType.map(Number) : []
      assert(types.length === 1 && types[0] === 8, `expected ArtifactType=[8], got ${JSON.stringify(types)}`)
    },
  },
  {
    name: 'Auto (no mins) with Faction=Banner Lords -> single rule at 16',
    hsfr: { Rank: 'Any', Rarity: 'Auto', Faction: 'Banner Lords', minLevel: 16, maxLevel: 16, substats: [], minCount: 1, autoMinCount: true },
    validate: (rules) => {
      assert(rules.length === 1, `expected 1 rule, got ${rules.length}`)
      const r = rules[0]
      assert(Number(r.Faction) === 1, `expected Faction=1 (Banner Lords), got ${r.Faction}`)
    },
  },
  {
    name: 'Auto (no mins) with Rank ≥4* and Rarity ≥ Rare -> single rule at 16',
    hsfr: { Rank: '≥ 4★', Rarity: '≥ Rare', Faction: 'Any', minLevel: 16, maxLevel: 16, substats: [], minCount: 1, autoMinCount: true },
    validate: (rules) => {
      assert(rules.length === 1, `expected 1 rule, got ${rules.length}`)
      const r = rules[0]
      assert(Number(r.Rank) === 10, `expected Rank code ≥4*(10), got ${r.Rank}`)
      assert(Number(r.Rarity) === 8, `expected Rarity code ≥Rare(8), got ${r.Rarity}`)
    },
  },
  // K mapping at +0
  { name: 'Auto at +0 with K=1', hsfr: { Rank: 'Any', Rarity: 'Auto', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD'], minCount: 1, autoMinCount: false }, rarity: { expectCodes: [7] } },
  { name: 'Auto at +0 with K=2', hsfr: { Rank: 'Any', Rarity: 'Auto', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD','ACC'], minCount: 2, autoMinCount: false }, rarity: { expectCodes: [8] } },
  { name: 'Auto at +0 with K=3', hsfr: { Rank: 'Any', Rarity: 'Auto', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD','CR%','CDMG%'], minCount: 3, autoMinCount: false }, rarity: { expectCodes: [9] } },
  { name: 'Auto at +0 with K=4', hsfr: { Rank: 'Any', Rarity: 'Auto', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD','CR%','CDMG%','ACC'], minCount: 4, autoMinCount: false }, rarity: { expectCodes: [16] } },
  {
    name: 'Example: Top Row (minLevel=0, Required=4)',
    hsfr: {
      name: 'Perfect Dmg Items - Top Row',
      Rank: 'Six*', Rarity: 'Auto', Faction: 'Any', minLevel: 0, maxLevel: 16,
      substats: ['SPD','CR%','CDMG%','ACC','RES','HP','ATK','DEF'],
      fixedSubstats: ['SPD','CR%','CDMG%'],
      substatRollBounds: { 'HP': { any: true }, 'ATK': { any: true }, 'DEF': { any: true }, 'SPD': { any: true }, 'RES': { max: 0 }, 'ACC': { any: true }, 'CR%': { any: true }, 'CDMG%': { any: true } },
      artifactTypeNames: ['Weapon','Helmet','Shield'],
      minCount: 4, autoMinCount: false,
    },
    rarity: { expectCodes: [16] },
  },
  {
    name: 'Example: Bottom Row (minLevel=16, main=RES) -> Any and RES not a substat',
    hsfr: {
      name: 'Perfect Dmg Items - Bottom Row RES Only', enabled: false,
      Rank: 'Six*', Rarity: 'Auto', Faction: 'Any', minLevel: 16, maxLevel: 16,
      mainStats: ['RES'],
      substats: ['SPD','CR%','CDMG%','ACC','RES','HP','ATK','DEF'],
      fixedSubstats: ['SPD','CR%','CDMG%'],
      substatRollBounds: { 'HP': { any: true }, 'ATK': { any: true }, 'DEF': { any: true }, 'SPD': { any: true }, 'RES': { max: 0 }, 'ACC': { any: true }, 'CR%': { any: true }, 'CDMG%': { any: true } },
      artifactTypeNames: ['Chestplate','Boots'],
      minCount: 4, autoMinCount: false,
    },
    rarity: { expectCodes: [0] },
    thresholds: [
      // Ensure RES never appears as a substat at any tested level
      { stat: 'RES', expect: [[0,[]],[4,[]],[8,[]],[12,[]],[16,[]]] },
    ],
  },
  {
    name: 'Example: Bottom Row (minLevel=16, main=RES)',
    hsfr: {
      name: 'Perfect Dmg Items - Bottom Row RES Only', keep: false, enabled: false,
      Rank: 'Six*', Rarity: 'Auto', Faction: 'Any', minLevel: 16, maxLevel: 16,
      mainStats: ['RES'],
      substats: ['SPD','CR%','CDMG%','ACC','RES','HP','ATK','DEF'],
      fixedSubstats: ['SPD','CR%','CDMG%'],
      substatRollBounds: { 'HP': { any: true }, 'ATK': { any: true }, 'DEF': { any: true }, 'SPD': { any: true }, 'RES': { max: 0 }, 'ACC': { any: true }, 'CR%': { any: true }, 'CDMG%': { any: true } },
      artifactTypeNames: ['Chestplate','Boots'],
      minCount: 4, autoMinCount: false,
    },
    rarity: { expectCodes: [0] },
    thresholds: [
      { stat: 'RES', expect: [[0,[]],[4,[]],[8,[]],[12,[]],[16,[]]] },
    ],
  },
  {
    name: 'Per-stat min>max impossible yields no rows',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', substats: ['ACC'], substatRollBounds: { 'ACC': { min: 2, max: 1 } }, minCount: 1, autoMinCount: true, minLevel: 0, maxLevel: 16 },
    validate: (rules) => {
      const th = extractThresholds(rules, Number(variantFromLabel('ACC')))
      let total = 0
      for (const arr of th.values()) total += arr.length
      assert(total === 0, `expected 0 rows for impossible min>max, got ${total}`)
    },
  },
  {
    name: 'Epic 3-of-4 at +16 not below +12 (SPD)',
    hsfr: { Rank: 'Any', Rarity: 'Epic', Faction: 'Any', substats: ['SPD','CR%','ACC','RES'], substatRollBounds: { 'SPD': { any: true }, 'CR%': { any: true }, 'ACC': { any: true }, 'RES': { any: true } }, minCount: 3, autoMinCount: false, minLevel: 0, maxLevel: 16 },
    validate: (rules) => {
      const th = extractThresholds(rules, Number(variantFromLabel('SPD')))
      const at12 = th.get(12) ?? []
      const at16 = th.get(16) ?? []
      const min12 = at12.length ? Math.min(...at12) : Infinity
      const max12 = at12.length ? Math.max(...at12) : -Infinity
      const min16 = at16.length ? Math.min(...at16) : Infinity
      const max16 = at16.length ? Math.max(...at16) : -Infinity
      assert(min16 >= min12 && max16 >= max12, `+16 thresholds should not be below +12. +12=[${at12}] +16=[${at16}]`)
    },
  },
  {
    name: 'Uncommon 2-of-2 SPD+RES: +16 not below +12',
    hsfr: { Rank: 'Any', Rarity: 'Uncommon', Faction: 'Any', substats: ['SPD','RES'], substatRollBounds: { 'SPD': { any: true }, 'RES': { any: true } }, minCount: 2, autoMinCount: false, minLevel: 0, maxLevel: 16 },
    validate: (rules) => {
      // SPD
      let th = extractThresholds(rules, Number(variantFromLabel('SPD')))
      let at12 = th.get(12) ?? []
      let at16 = th.get(16) ?? []
      let min12 = at12.length ? Math.min(...at12) : Infinity
      let max12 = at12.length ? Math.max(...at12) : -Infinity
      let min16 = at16.length ? Math.min(...at16) : Infinity
      let max16 = at16.length ? Math.max(...at16) : -Infinity
      assert(min16 >= min12 && max16 >= max12, `SPD: +16 < +12. +12=[${at12}] +16=[${at16}]`)
      // RES
      th = extractThresholds(rules, Number(variantFromLabel('RES')))
      at12 = th.get(12) ?? []
      at16 = th.get(16) ?? []
      min12 = at12.length ? Math.min(...at12) : Infinity
      max12 = at12.length ? Math.max(...at12) : -Infinity
      min16 = at16.length ? Math.min(...at16) : Infinity
      max16 = at16.length ? Math.max(...at16) : -Infinity
      assert(min16 >= min12 && max16 >= max12, `RES: +16 < +12. +12=[${at12}] +16=[${at16}]`)
    },
  },
  // ---- Ports from builder tests to ensure parity ----
  {
    name: 'STAR+STAR with MinRequired(1) (late minimal pairs)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, earlyKeepMode: 'late', substats: ['SPD','ACC'], substatRollBounds: { 'SPD': { any: true }, 'ACC': { any: true } }, minCount: 2, autoMinCount: false, minRequiredRolls: 1, autoMinRequiredRolls: false },
    thresholds: [
      // At +0, presence-only base thresholds for both stats. At +4, SPD shows base (5).
      // Late minimal pairs behavior: require only what must be present now.
      // Base thresholds persist at 0/4/8/12; pairs appear at +16.
      { stat: 'SPD', expect: [[0,[5]],[4,[5]],[8,[5]],[12,[5]],[16,[5,10]]] },
      { stat: 'ACC', expect: [[0,[9]],[4,[9]],[8,[9]],[12,[9]],[16,[9,18]]] },
    ],
  },
  {
    name: 'SPD(2)+CR(1)+CDMG(*) (late)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, earlyKeepMode: 'late', substats: ['SPD','CR%','CDMG%'], substatRollBounds: { 'SPD': { min: 2 }, 'CR%': { min: 1 }, 'CDMG%': { any: true } }, minCount: 3, autoMinCount: false },
    thresholds: [
      { stat: 'SPD', expect: [[0,[5]],[4,[5]],[8,[5,10]],[12,[10,15]],[16,[15]]] },
      { stat: 'CR%', expect: [[0,[5]],[4,[5]],[8,[5,10]],[12,[5,10]],[16,[10]]] },
      { stat: 'CDMG%', expect: [[0,[5]],[4,[5]],[8,[5]],[12,[5]],[16,[5]]] },
    ],
  },
  {
    name: 'SPD(2)+CR(1)+CDMG(max=0) progressive caps honored',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD','CR%','CDMG%'], substatRollBounds: { 'SPD': { min: 2 }, 'CR%': { min: 1 }, 'CDMG%': { any: true, max: 0 } }, minCount: 3, autoMinCount: false },
    thresholds: [
      { stat: 'CDMG%', expect: [[0,[5]],[4,[5]],[8,[5]],[12,[5]],[16,[5]]] },
    ],
    validate: (rules) => {
      const vSPD = Number(variantFromLabel('SPD'))
      const vCR = Number(variantFromLabel('CR%'))
      const thSPD = extractThresholds(rules, vSPD)
      const thCR = extractThresholds(rules, vCR)
      const spd4 = thSPD.get(4) ?? []
      const cr4 = thCR.get(4) ?? []
      assert(spd4.join(',') === '5,10' && cr4.join(',') === '5,10', `+4 SPD/CR expected [5,10]; got SPD=${spd4} CR=${cr4}`)
    },
  },
  {
    name: 'STAR + MinRequired(2) on single substat (SPD) progressive single row',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD'], substatRollBounds: { 'SPD': { any: true } }, minCount: 1, autoMinCount: true, minRequiredRolls: 2, autoMinRequiredRolls: false },
    thresholds: [
      { stat: 'SPD', expect: [[0,[5]],[4,[10]],[8,[15]],[12,[15]],[16,[15]]] },
    ],
  },
]

// Expose cases for tooling (e.g., HSFR extraction) without running tests.
export const CASES: ReadonlyArray<Case> = cases

if (typeof process === 'undefined' || process.env.HSFR_DUMP !== '1') {
  for (const c of cases) {
    test(c.name, () => runCase(c))
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}
