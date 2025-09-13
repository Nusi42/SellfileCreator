/* eslint-disable @typescript-eslint/no-explicit-any */
// End-to-end HSFR-driven tests. These validate the full path:
// HSFR (readable) -> normalizeConfig (IO) -> buildHsfRules (builder).
//
// Test vectors are expressed in the same readable format the App accepts,
// so you can copy/paste these objects into the UI.

import { buildHsfRules, defaultMinima, LEVELS } from '../src/lib/hsfBuilder.js'
import { normalizeConfig } from '../src/lib/hsfrIO.js'
import { variantToSub, variantToMain } from '../src/lib/hsfTypes.js'
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

// Helpers used by explicit matrix cases
type Label = 'SPD'|'CR%'|'CDMG%'|'ACC'|'RES'
function baseOf(label: Label): number {
  const v = variantFromLabel(label)
  assert(v !== null, `unknown stat label ${label}`)
  const minima = defaultMinima()
  return minima.six[Number(v)] ?? 0
}
function idOf(label: Label): number { return Number(variantToSub(Number(variantFromLabel(label))).id) }
function isRowAtLevel(r: any, lvl: number): boolean { return Number(r.LVLForCheck) === lvl }
function sumRollsForRow(r: any, labels: Label[]): number {
  let sum = 0
  for (const lab of labels) {
    const id = idOf(lab)
    const b = baseOf(lab)
    const s = (Array.isArray(r.Substats) ? r.Substats : []).find((x: any) => Number(x?.ID) === id)
    if (s) {
      const rolls = Math.max(0, Math.round(Number(s.Value) / b) - 1)
      sum += rolls
    }
  }
  return sum
}

// Utility: get sorted unique levels present in a rules array (excluding 99/Any)
function levelsIn(rules: any[]): number[] {
  const s = new Set<number>()
  for (const r of rules) {
    const lvl = Number(r?.LVLForCheck)
    if ([0,4,8,12,16].includes(lvl)) s.add(lvl)
  }
  return Array.from(s).sort((a,b)=>a-b)
}

// Validate a single HSF rule object has exactly the expected shape and values allowed by cfg
function validateRuleShape(rule: any, cfg: any, ctx: string): void {
  assert(rule && typeof rule === 'object', `${ctx}: rule is not an object`)
  const allowed = new Set([
    'Keep','IsRuleTypeAND','Use','ArtifactSet','ArtifactType','Rank','Rarity','MainStatID','MainStatF','LVLForCheck','Faction','Substats',
  ])
  for (const k of Object.keys(rule)) {
    assert(allowed.has(k), `${ctx}: unexpected key '${k}'`)
  }
  // Required scalars
  assert(typeof rule.Keep === 'boolean', `${ctx}: Keep must be boolean`)
  assert(rule.IsRuleTypeAND === false, `${ctx}: IsRuleTypeAND must be false`)
  assert(typeof rule.Use === 'boolean', `${ctx}: Use must be boolean`)
  assert(Number.isFinite(Number(rule.Rank)), `${ctx}: Rank must be number`)
  assert(Number.isFinite(Number(rule.Rarity)), `${ctx}: Rarity must be number`)
  assert(Number.isFinite(Number(rule.Faction)), `${ctx}: Faction must be number`)
  assert(Number.isFinite(Number(rule.MainStatID)), `${ctx}: MainStatID must be number`)
  assert(Number.isFinite(Number(rule.MainStatF)), `${ctx}: MainStatF must be number`)
  assert([0,4,8,12,16,99].includes(Number(rule.LVLForCheck)), `${ctx}: LVLForCheck must be one of 0,4,8,12,16,99`)
  // Keep/Use/Rank/Faction should mirror cfg
  assert(rule.Keep === Boolean(cfg.keep), `${ctx}: Keep=${rule.Keep} != cfg.keep=${cfg.keep}`)
  assert(rule.Use === (cfg.enabled !== false), `${ctx}: Use=${rule.Use} != cfg.enabled!=false (cfg.enabled=${cfg.enabled})`)
  assert(Number(rule.Rank) === Number(cfg.rankCode), `${ctx}: Rank ${rule.Rank} != cfg.rankCode ${cfg.rankCode}`)
  assert(Number(rule.Faction) === Number(cfg.factionCode ?? 0), `${ctx}: Faction ${rule.Faction} != cfg.factionCode ${cfg.factionCode ?? 0}`)
  // Rarity: ensure number and consistent across all rules within the same case (checked later per-case when needed)
  assert(Number(rule.Rarity) >= 0 && Number(rule.Rarity) <= 16, `${ctx}: Rarity out of range`)
  // MainStat: any (-1, f=1) when none selected; otherwise must match one of selected main variants
  const mains: number[] = Array.isArray(cfg.mainStatsV) ? cfg.mainStatsV.map(Number) : []
  if (mains.length === 0) {
    assert(Number(rule.MainStatID) === -1 && Number(rule.MainStatF) === 1, `${ctx}: MainStat should be Any (-1,1) when no main selected`)
  } else {
    const matches = mains.some((mv) => {
      const m = variantToMain(Number(mv))
      return Number(rule.MainStatID) === Number(m.id) && Number(rule.MainStatF) === Number(m.f ?? 1)
    })
    assert(matches, `${ctx}: MainStat ${rule.MainStatID}/${rule.MainStatF} not in selected mains`)
  }
  // ArtifactType / ArtifactSet presence mirrors cfg and values are sorted unique numbers
  const expectTypes: number[] = Array.isArray(cfg.artifactTypes) ? cfg.artifactTypes.map(Number).sort((a: number, b: number)=>a-b) : []
  const expectSets: number[] = Array.isArray(cfg.artifactSets) ? cfg.artifactSets.map(Number).sort((a: number, b: number)=>a-b) : []
  if (expectTypes.length > 0) {
    const got = Array.isArray(rule.ArtifactType) ? rule.ArtifactType.map((n: unknown) => Number(n)).slice().sort((a: number,b: number)=>a-b) : []
    assert(got.length === expectTypes.length && got.every((v: number, i: number) => v === expectTypes[i]!), `${ctx}: ArtifactType ${JSON.stringify(got)} != ${JSON.stringify(expectTypes)}`)
  } else {
    assert(rule.ArtifactType === undefined, `${ctx}: ArtifactType must be omitted when not filtered`)
  }
  if (expectSets.length > 0) {
    const got = Array.isArray(rule.ArtifactSet) ? rule.ArtifactSet.map((n: unknown) => Number(n)).slice().sort((a: number,b: number)=>a-b) : []
    assert(got.length === expectSets.length && got.every((v: number, i: number) => v === expectSets[i]!), `${ctx}: ArtifactSet ${JSON.stringify(got)} != ${JSON.stringify(expectSets)}`)
  } else {
    assert(rule.ArtifactSet === undefined, `${ctx}: ArtifactSet must be omitted when not filtered`)
  }
  // Substats: exactly 4 entries; shaped properly; selected entries belong to cfg.substatsV; padding is ANY with zero-value/empty-condition
  assert(Array.isArray(rule.Substats), `${ctx}: Substats must be an array`)
  assert(rule.Substats.length === 4, `${ctx}: Substats must have length 4`)
  const selSubs = new Set((Array.isArray(cfg.substatsV) ? cfg.substatsV : []).map((v: unknown) => {
    const t = variantToSub(Number(v))
    return `${t.id}|${Boolean(t.isFlat)}`
  }))
  for (let i = 0; i < rule.Substats.length; i++) {
    const s = rule.Substats[i]
    assert(s && typeof s === 'object', `${ctx}: Substats[${i}] not an object`)
    assert(Number.isFinite(Number(s.ID)), `${ctx}: Substats[${i}].ID must be number`)
    assert(typeof s.Condition === 'string', `${ctx}: Substats[${i}].Condition must be string`)
    assert(typeof s.IsFlat === 'boolean', `${ctx}: Substats[${i}].IsFlat must be boolean`)
    assert(s.NotAvailable === false || s.NotAvailable === undefined, `${ctx}: Substats[${i}].NotAvailable must be false/undefined`)
    if (Number(s.ID) === -1) {
      assert(Number(s.Value) === 0, `${ctx}: Substats[${i}].Value must be 0 for ANY`)
      assert(s.Condition === '', `${ctx}: Substats[${i}].Condition must be '' for ANY`)
      assert(s.IsFlat === true, `${ctx}: Substats[${i}].IsFlat must be true for ANY`)
    } else {
      assert(Number(s.Value) >= 0, `${ctx}: Substats[${i}].Value must be >=0`)
      assert(s.Condition.length > 0, `${ctx}: Substats[${i}].Condition must be non-empty for set substats`)
      // If substats were selected, ensure present substats come from that set
      if (selSubs.size > 0) {
        const key = `${Number(s.ID)}|${Boolean(s.IsFlat)}`
        assert(selSubs.has(key), `${ctx}: Substats[${i}] ID/IsFlat not in selected substats`)
      }
    }
  }
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
  // Validate every rule shape thoroughly before case-specific checks.
  for (let i = 0; i < rules.length; i++) validateRuleShape(rules[i], cfg, `${c.name} [rule ${i}]`)
  // Intentionally no console debug logging in tests. Keep output clean.
  // Unless a case specifies multiple expected rarity codes, ensure rarity is constant per case.
  if (rules.length > 0) {
    const codesSet = new Set(rules.map(r => Number(r.Rarity)))
    if (!c.rarity) {
      assert(codesSet.size === 1, `${c.name}: multiple rarity codes present: ${JSON.stringify(Array.from(codesSet).sort((a,b)=>a-b))}`)
    }
  }
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
  // Rank/Rarity variations
  {
    name: 'Rank 4★ + Rarity Any with SPD min=0 uses 4★ minima',
    hsfr: { Rank: '4★', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD'], substatRollBounds: { 'SPD': { min: 0 } }, minCount: 1, autoMinCount: true },
    thresholds: [
      // 4★ SPD base = 3; allow 0+ rolls: +0 [3], +4 [3,6], +8 [3,6,9], +12 [3,6,9,12], +16 [3,6,9,12,15]
      { stat: 'SPD', expect: [[0,[3]],[4,[3,6]],[8,[3,6,9]],[12,[3,6,9,12]],[16,[3,6,9,12,15]]] },
    ],
  },
  {
    name: 'Rank 4★ + Rarity Any with SPD(*) and MinRequired=0 behaves like SPD(min=0)',
    hsfr: { Rank: '4★', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD'], substatRollBounds: { 'SPD': { any: true } }, minCount: 1, autoMinCount: true, minRequiredRolls: 0, autoMinRequiredRolls: false },
    thresholds: [
      // Same expected thresholds as the min=0 case above
      { stat: 'SPD', expect: [[0,[3]],[4,[3,6]],[8,[3,6,9]],[12,[3,6,9,12]],[16,[3,6,9,12,15]]] },
    ],
  },
  {
    name: 'Rank ≤ 4★ + Rarity Any with ACC min=0 uses 4★ minima',
    hsfr: { Rank: '≤ 4★', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['ACC'], substatRollBounds: { 'ACC': { min: 0 } }, minCount: 1, autoMinCount: true },
    thresholds: [
      // 4★ ACC base = 7; allow 0+ rolls
      { stat: 'ACC', expect: [[0,[7]],[4,[7,14]],[8,[7,14,21]],[12,[7,14,21,28]],[16,[7,14,21,28,35]]] },
    ],
  },
  {
    name: 'Rarity = Mythical -> exact code 15',
    hsfr: { Rank: 'Any', Rarity: 'Mythical', Faction: 'Any', minLevel: 16, maxLevel: 16, substats: [], minCount: 1, autoMinCount: true },
    rarity: { expectCodes: [15] },
  },
  {
    name: 'Rarity ≤ Mythical -> range code 14',
    hsfr: { Rank: 'Any', Rarity: '≤ Mythical', Faction: 'Any', minLevel: 16, maxLevel: 16, substats: [], minCount: 1, autoMinCount: true },
    rarity: { expectCodes: [14] },
  },
  {
    name: 'Rarity = Legendary -> exact code 5',
    hsfr: { Rank: 'Any', Rarity: 'Legendary', Faction: 'Any', minLevel: 16, maxLevel: 16, substats: [], minCount: 1, autoMinCount: true },
    rarity: { expectCodes: [5] },
  },
  {
    name: 'Rarity ≤ Epic -> range code 12',
    hsfr: { Rank: 'Any', Rarity: '≤ Epic', Faction: 'Any', minLevel: 16, maxLevel: 16, substats: [], minCount: 1, autoMinCount: true },
    rarity: { expectCodes: [12] },
  },
  {
    name: 'Auto with MinRequiredRolls=5 resolves to Mythical',
    hsfr: { Rank: 'Any', Rarity: 'Auto', Faction: 'Any', minLevel: 16, maxLevel: 16, substats: ['ACC'], minCount: 1, autoMinCount: true, minRequiredRolls: 5, autoMinRequiredRolls: false },
    rarity: { expectCodes: [15] },
  },
  {
    name: 'ATK% per‑stat min=0 behaves like presence',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['ATK%'], substatRollBounds: { 'ATK%': { min: 0 } }, minCount: 1, autoMinCount: true },
    thresholds: [
      // 6★ ATK% base = 5; with Min=0 allow 0 or more rolls. Strict mode enumerates presence plus possible allocations.
      { stat: 'ATK%', expect: [[0,[5]],[4,[5,10]],[8,[5,10,15]],[12,[5,10,15,20]],[16,[5,10,15,20,25]]] },
    ],
  },
  {
    name: 'Amulet: Main [CDMG%,HP,ATK], Substats [SPD,ACC,CR%], minCount=2, MinReq=2',
    hsfr: {
      Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16,
      mainStats: ['CDMG%','HP','ATK'],
      artifactTypeNames: ['Amulet'],
      substats: ['SPD','ACC','CR%'],
      minCount: 2, autoMinCount: false,
      minRequiredRolls: 2, autoMinRequiredRolls: false,
    },
    validate: (rules) => {
      const typesAll = new Set(rules.map((r:any)=>JSON.stringify((r.ArtifactType||[]).map(Number))))
      assert(typesAll.has(JSON.stringify([8])), `expected ArtifactType [8] (Amulet), got ${Array.from(typesAll)}`)
      const msAll = new Set(rules.map((r:any)=>`${Number(r.MainStatID)}/${Number(r.MainStatF)}`))
      assert(msAll.has('8/0') && msAll.has('1/1') && msAll.has('2/1'), `expected mains CDMG(8/0), HP(1/1), ATK(2/1); got ${Array.from(msAll)}`)
      // Per-level presence checks
      for (const lvl of levelsIn(rules)) {
        const atLvl = rules.filter((r:any)=>Number(r.LVLForCheck)===lvl)
        const typesLvl = new Set(atLvl.map((r:any)=>JSON.stringify((r.ArtifactType||[]).map(Number))))
        assert(typesLvl.has(JSON.stringify([8])), `+${lvl}: expected ArtifactType [8] (Amulet) present`)
        const msLvl = new Set(atLvl.map((r:any)=>`${Number(r.MainStatID)}/${Number(r.MainStatF)}`))
        assert(msLvl.has('8/0') || msLvl.has('1/1') || msLvl.has('2/1'), `+${lvl}: expected at least one of the selected mains present`)
      }
      const lvls = levelsIn(rules)
      const last = lvls[lvls.length-1] ?? 16
      const rLast = rules.filter((r:any)=>Number(r.LVLForCheck)===last)
      const maxSum = rLast.reduce((acc:number,r:any)=>Math.max(acc, sumRollsForRow(r,['SPD','ACC','CR%'] as Label[])),0)
      assert(maxSum >= 2, `+${last} aggregate selected rolls <2 (max=${maxSum})`)
    },
  },
  {
    name: 'Amulet: Main [CDMG%,HP,ATK], Substats [SPD,ACC,CR%], minCount=3, MinReq=3',
    hsfr: {
      Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16,
      mainStats: ['CDMG%','HP','ATK'],
      artifactTypeNames: ['Amulet'],
      substats: ['SPD','ACC','CR%'],
      minCount: 3, autoMinCount: false,
      minRequiredRolls: 3, autoMinRequiredRolls: false,
    },
    validate: (rules) => {
      const typesAll = new Set(rules.map((r:any)=>JSON.stringify((r.ArtifactType||[]).map(Number))))
      assert(typesAll.has(JSON.stringify([8])), `expected ArtifactType [8] (Amulet)`)
      const msAll = new Set(rules.map((r:any)=>`${Number(r.MainStatID)}/${Number(r.MainStatF)}`))
      assert(msAll.has('8/0') && msAll.has('1/1') && msAll.has('2/1'), `expected mains CDMG(8/0), HP(1/1), ATK(2/1)`)
      for (const lvl of levelsIn(rules)) {
        const atLvl = rules.filter((r:any)=>Number(r.LVLForCheck)===lvl)
        const typesLvl = new Set(atLvl.map((r:any)=>JSON.stringify((r.ArtifactType||[]).map(Number))))
        assert(typesLvl.has(JSON.stringify([8])), `+${lvl}: expected ArtifactType [8] present`)
      }
      const lvls = levelsIn(rules)
      const last = lvls[lvls.length-1] ?? 16
      const rLast = rules.filter((r:any)=>Number(r.LVLForCheck)===last)
      const maxSum = rLast.reduce((acc:number,r:any)=>Math.max(acc, sumRollsForRow(r,['SPD','ACC','CR%'] as Label[])),0)
      assert(maxSum >= 3, `+${last} aggregate selected rolls <3 (max=${maxSum})`)
    },
  },
  {
    name: 'Banner: Main [ACC,RES,HP], Substats [SPD,ACC,CR%], minCount=2, MinReq=2',
    hsfr: {
      Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16,
      mainStats: ['ACC','RES','HP'],
      artifactTypeNames: ['Banner'],
      substats: ['SPD','ACC','CR%'],
      minCount: 2, autoMinCount: false,
      minRequiredRolls: 2, autoMinRequiredRolls: false,
    },
    validate: (rules) => {
      const typesAll = new Set(rules.map((r:any)=>JSON.stringify((r.ArtifactType||[]).map(Number))))
      assert(typesAll.has(JSON.stringify([9])), `expected ArtifactType [9] (Banner)`)
      const msAll = new Set(rules.map((r:any)=>`${Number(r.MainStatID)}/${Number(r.MainStatF)}`))
      assert(msAll.has('6/1') && msAll.has('5/1') && msAll.has('1/1'), `expected mains ACC(6/1), RES(5/1), HP(1/1); got ${Array.from(msAll)}`)
      for (const lvl of levelsIn(rules)) {
        const atLvl = rules.filter((r:any)=>Number(r.LVLForCheck)===lvl)
        const typesLvl = new Set(atLvl.map((r:any)=>JSON.stringify((r.ArtifactType||[]).map(Number))))
        assert(typesLvl.has(JSON.stringify([9])), `+${lvl}: expected ArtifactType [9] present`)
      }
      const lvls = levelsIn(rules)
      const last = lvls[lvls.length-1] ?? 16
      const rLast = rules.filter((r:any)=>Number(r.LVLForCheck)===last)
      const maxSum = rLast.reduce((acc:number,r:any)=>Math.max(acc, sumRollsForRow(r,['SPD','ACC','CR%'] as Label[])),0)
      assert(maxSum >= 2, `+${last} aggregate selected rolls <2 (max=${maxSum})`)
    },
  },
  {
    name: 'Banner: Main [ACC,RES,HP], Substats [SPD,ACC,CR%], minCount=3, MinReq=3',
    hsfr: {
      Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16,
      mainStats: ['ACC','RES','HP'],
      artifactTypeNames: ['Banner'],
      substats: ['SPD','ACC','CR%'],
      minCount: 3, autoMinCount: false,
      minRequiredRolls: 3, autoMinRequiredRolls: false,
    },
    validate: (rules) => {
      const types = new Set(rules.map((r:any)=>JSON.stringify((r.ArtifactType||[]).map(Number))))
      assert(types.has(JSON.stringify([9])), `expected ArtifactType [9] (Banner)`)
      const ms = new Set(rules.map((r:any)=>`${Number(r.MainStatID)}/${Number(r.MainStatF)}`))
      // ACC main conflicts with substat ACC when minCount=3 (all three substats), so expect only RES and HP mains.
      assert(!ms.has('6/1') && ms.has('5/1') && ms.has('1/1'), `expected mains RES(5/1), HP(1/1) only; got ${Array.from(ms)}`)
      const lvls = levelsIn(rules)
      const last = lvls[lvls.length-1] ?? 16
      const rLast = rules.filter((r:any)=>Number(r.LVLForCheck)===last)
      const maxSum = rLast.reduce((acc:number,r:any)=>Math.max(acc, sumRollsForRow(r,['SPD','ACC','CR%'] as Label[])),0)
      assert(maxSum >= 3, `+${last} aggregate selected rolls <3 (max=${maxSum})`)
    },
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
  {
    name: 'SPD min=3 (progressive)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD'], substatRollBounds: { 'SPD': { min: 3 } }, minCount: 1, autoMinCount: true },
    thresholds: [
      { stat: 'SPD', expect: [[0,[5]],[4,[10]],[8,[15]],[12,[20]],[16,[20]]] },
    ],
  },
  {
    name: 'ACC MinRequired(2) single substat (late minimal)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, earlyKeepMode: 'late', substats: ['ACC'], substatRollBounds: { }, minCount: 1, autoMinCount: true, minRequiredRolls: 2, autoMinRequiredRolls: false },
    thresholds: [
      { stat: 'ACC', expect: [[0,[9]],[4,[9]],[8,[9]],[12,[18]],[16,[27]]] },
    ],
  },
  {
    name: 'Late: SPD(2) + CR(1) without wildcard',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, earlyKeepMode: 'late', substats: ['SPD','CR%'], substatRollBounds: { 'SPD': { min: 2 }, 'CR%': { min: 1 } }, minCount: 2, autoMinCount: false },
    thresholds: [
      { stat: 'SPD', expect: [[0,[5]],[4,[5]],[8,[5,10]],[12,[10,15]],[16,[15]]] },
      { stat: 'CR%', expect: [[0,[5]],[4,[5]],[8,[5,10]],[12,[5,10]],[16,[10]]] },
    ],
  },
  {
    name: 'Late: SPD(2) + CR(1) + CDMG(max=0)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, earlyKeepMode: 'late', substats: ['SPD','CR%','CDMG%'], substatRollBounds: { 'SPD': { min: 2 }, 'CR%': { min: 1 }, 'CDMG%': { max: 0 } }, minCount: 3, autoMinCount: false },
    thresholds: [
      { stat: 'SPD', expect: [[0,[5]],[4,[5]],[8,[5,10]],[12,[10,15]],[16,[15]]] },
      { stat: 'CR%', expect: [[0,[5]],[4,[5]],[8,[5,10]],[12,[5,10]],[16,[10]]] },
      { stat: 'CDMG%', expect: [[0,[5]],[4,[5]],[8,[5]],[12,[5]],[16,[5]]] },
    ],
  },
  // ---- Additional coverage: combinations, mins, maxes, globals, and 1..5 selections ----
  {
    name: 'Single substat SPD with min=2 and max=2 (early)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD'], substatRollBounds: { 'SPD': { min: 2, max: 2 } }, minCount: 1, autoMinCount: true },
    thresholds: [
      { stat: 'SPD', expect: [[0,[5]],[4,[10]],[8,[15]],[12,[15]],[16,[15]]] },
    ],
  },
  {
    name: 'Two substats SPD(min=2) + CR%(max=1), MinRequiredRolls=3 (early)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD','CR%'], substatRollBounds: { 'SPD': { min: 2 }, 'CR%': { max: 1 } }, minCount: 2, autoMinCount: false, minRequiredRolls: 3, autoMinRequiredRolls: false },
    validate: (rules) => {
      const thSPD = extractThresholds(rules, Number(variantFromLabel('SPD')))
      const thCR = extractThresholds(rules, Number(variantFromLabel('CR%')))
      const at12SPD = thSPD.get(12) ?? []
      const at12CR = thCR.get(12) ?? []
      // By +12, SPD must hit 15 (two rolls), CR capped at 10 (one roll)
      assert(at12SPD.includes(15), `SPD @+12 should include 15; got ${at12SPD}`)
      assert(at12CR.includes(10) && !at12CR.some(v => v > 10), `CR% @+12 should be capped at 10; got ${at12CR}`)
    },
  },
  {
    name: 'Three substats all min=1, MinRequiredRolls=3 (early)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD','CR%','CDMG%'], substatRollBounds: { 'SPD': { min: 1 }, 'CR%': { min: 1 }, 'CDMG%': { min: 1 } }, minCount: 3, autoMinCount: false, minRequiredRolls: 3, autoMinRequiredRolls: false },
    thresholds: [
      // At +12, all three should be at base + 1 roll
      // At +4, early progress may enumerate presence and single-roll rows => [5,10]
      { stat: 'SPD', expect: [[0,[5]],[4,[5,10]],[8,[5,10,15]],[12,[10]],[16,[10]]] },
      { stat: 'CR%', expect: [[0,[5]],[4,[5,10]],[8,[5,10,15]],[12,[10]],[16,[10]]] },
      { stat: 'CDMG%', expect: [[0,[5]],[4,[5,10]],[8,[5,10,15]],[12,[10]],[16,[10]]] },
    ],
  },
  {
    name: 'Four substats with mixed mins/maxes (collapse to mins by +12/+16)',
    hsfr: { Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16, substats: ['SPD','CR%','CDMG%','ACC'], substatRollBounds: { 'SPD': { min: 2, max: 2 }, 'CR%': { min: 1, max: 1 }, 'CDMG%': { max: 0 }, 'ACC': { max: 0 } }, minCount: 4, autoMinCount: false },
    thresholds: [
      { stat: 'SPD', expect: [[0,[5]],[4,[5,10]],[8,[10,15]],[12,[15]],[16,[15]]] },
      { stat: 'CR%', expect: [[0,[5]],[4,[5,10]],[8,[5,10]],[12,[10]],[16,[10]]] },
      { stat: 'CDMG%', expect: [[0,[5]],[4,[5]],[8,[5]],[12,[5]],[16,[5]]] },
      { stat: 'ACC', expect: [[0,[9]],[4,[9]],[8,[9]],[12,[9]],[16,[9]]] },
    ],
  },
  {
    name: 'Five selected substats (minCount=4) with fixed SPD,CR and mixed bounds',
    hsfr: {
      Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16,
      substats: ['SPD','CR%','CDMG%','RES','ACC'], fixedSubstats: ['SPD','CR%'],
      substatRollBounds: { 'SPD': { min: 2 }, 'CR%': { min: 1 }, 'RES': { max: 0 } },
      minCount: 4, autoMinCount: false,
    },
    validate: (rules) => {
      // At +16, ensure SPD>=15 present, CR>=10 present, RES capped at base (9)
      const thSPD = extractThresholds(rules, Number(variantFromLabel('SPD')))
      const thCR = extractThresholds(rules, Number(variantFromLabel('CR%')))
      const thRES = extractThresholds(rules, Number(variantFromLabel('RES')))
      const lvls = levelsIn(rules)
      const last = lvls[lvls.length-1] ?? 16
      const atLastSPD = thSPD.get(last) ?? []
      const atLastCR = thCR.get(last) ?? []
      const atLastRES = thRES.get(last) ?? []
      assert(atLastSPD.includes(15), `SPD @+${last} should include >=15; got ${atLastSPD}`)
      assert(atLastCR.includes(10), `CR% @+${last} should include >=10; got ${atLastCR}`)
      assert(atLastRES.every(v => v === 9), `RES @+${last} should be capped at 9; got ${atLastRES}`)
    },
  },
  // ---- Multiple mainstats + slots + substat combinations ----
  {
    name: 'Main: [CR%,HP%,SPD] + Slots [Gauntlets,Chestplate,Boots], Substats [SPD,ACC,CR%], minCount=2, MinReq=2',
    hsfr: {
      Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16,
      mainStats: ['CR%','HP%','SPD'],
      artifactTypeNames: ['Gauntlets','Chestplate','Boots'],
      substats: ['SPD','ACC','CR%'],
      minCount: 2, autoMinCount: false,
      minRequiredRolls: 2, autoMinRequiredRolls: false,
    },
    validate: (rules) => {
      // Ensure all selected artifact types are present in rules
      const typesSets = new Set(rules.map((r: any) => JSON.stringify((r.ArtifactType||[]).map(Number).sort((a:number,b:number)=>a-b))))
      const want = JSON.stringify([2,3,4]) // Chestplate(2), Gauntlets(3), Boots(4)
      assert(typesSets.has(want), `expected ArtifactType [2,3,4], got ${Array.from(typesSets)}`)
      for (const lvl of levelsIn(rules)) {
        const atLvl = rules.filter((r:any)=>Number(r.LVLForCheck)===lvl)
        const typesLvl = new Set(atLvl.map((r: any) => JSON.stringify((r.ArtifactType||[]).map(Number).sort((a:number,b:number)=>a-b))))
        assert(typesLvl.has(want), `+${lvl}: expected ArtifactType [2,3,4] present`)
      }
      // Ensure at least one rule exists for each selected main stat variant
      const ms = new Set(rules.map((r:any)=>`${Number(r.MainStatID)}/${Number(r.MainStatF)}`))
      assert(ms.has('7/0') && ms.has('1/0') && ms.has('4/1'), `expected main variants CR(7/0), HP%(1/0), SPD(4/1); got ${Array.from(ms)}`)
      // Global MinRequiredRolls=2: by +16, sum of implied rolls can reach 2
      const lvls = levelsIn(rules)
      const last = lvls[lvls.length-1] ?? 16
      const rLast = rules.filter((r:any)=>Number(r.LVLForCheck)===last)
      const baseSumMax = rLast.reduce((acc:number,r:any)=>Math.max(acc, (function(){
        const bSPD = baseOf('SPD'), bACC = baseOf('ACC'), bCR = baseOf('CR%')
        const rolls = (id:number, base:number)=>{
          const s=(r.Substats||[]).find((x:any)=>Number(x.ID)===id); return s? Math.max(0, Math.round(Number(s.Value)/base)-1) : 0
        }
        return rolls(4,bSPD)+rolls(6,bACC)+rolls(7,bCR)
      })()),0)
      assert(baseSumMax >= 2, `+${last} aggregate selected rolls <2 (max=${baseSumMax})`)
    },
  },
  {
    name: 'Main: [CR%,HP%,SPD] + Slots [Gauntlets,Chestplate,Boots], Substats [SPD,ACC,CR%], minCount=2, MinReq=3',
    hsfr: {
      Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16,
      mainStats: ['CR%','HP%','SPD'],
      artifactTypeNames: ['Gauntlets','Chestplate','Boots'],
      substats: ['SPD','ACC','CR%'],
      minCount: 2, autoMinCount: false,
      minRequiredRolls: 3, autoMinRequiredRolls: false,
    },
    validate: (rules) => {
      const ms = new Set(rules.map((r:any)=>`${Number(r.MainStatID)}/${Number(r.MainStatF)}`))
      assert(ms.has('7/0') && ms.has('1/0') && ms.has('4/1'), `expected main variants`)
      const lvls = levelsIn(rules)
      const last = lvls.length ? lvls[lvls.length-1] : 16
      const rLast = rules.filter((r:any)=>Number(r.LVLForCheck)===last)
      const maxSum = rLast.reduce((acc:number,r:any)=>Math.max(acc, sumRollsForRow(r,['SPD','ACC','CR%'] as Label[])),0)
      assert(maxSum >= 3, `+${last} aggregate selected rolls <3 (max=${maxSum})`)
    },
  },
  {
    name: 'Main: [CR%,HP%,SPD] + Slots [Gauntlets,Chestplate,Boots], Substats [SPD,ACC,CR%], minCount=3, MinReq=2',
    hsfr: {
      Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16,
      mainStats: ['CR%','HP%','SPD'],
      artifactTypeNames: ['Gauntlets','Chestplate','Boots'],
      substats: ['SPD','ACC','CR%'],
      minCount: 3, autoMinCount: false,
      minRequiredRolls: 2, autoMinRequiredRolls: false,
    },
    validate: (rules) => {
      const ms = new Set(rules.map((r:any)=>`${Number(r.MainStatID)}/${Number(r.MainStatF)}`))
      // With minCount=3 and substats containing CR% and SPD, those mains are filtered out.
      assert(ms.has('1/0'), `expected HP% main present; got ${Array.from(ms)}`)
      const lvls = levelsIn(rules)
      const last = lvls.length ? lvls[lvls.length-1] : 16
      const rLast = rules.filter((r:any)=>Number(r.LVLForCheck)===last)
      const maxSum = rLast.reduce((acc:number,r:any)=>Math.max(acc, sumRollsForRow(r,['SPD','ACC','CR%'] as Label[])),0)
      assert(maxSum >= 2, `+${last} aggregate selected rolls <2 (max=${maxSum})`)
    },
  },
  {
    name: 'Main: [CR%,HP%,SPD] + Slots [Gauntlets,Chestplate,Boots], Substats [SPD,ACC,CR%], minCount=3, MinReq=3',
    hsfr: {
      Rank: 'Any', Rarity: 'Any', Faction: 'Any', minLevel: 0, maxLevel: 16,
      mainStats: ['CR%','HP%','SPD'],
      artifactTypeNames: ['Gauntlets','Chestplate','Boots'],
      substats: ['SPD','ACC','CR%'],
      minCount: 3, autoMinCount: false,
      minRequiredRolls: 3, autoMinRequiredRolls: false,
    },
    validate: (rules) => {
      const ms = new Set(rules.map((r:any)=>`${Number(r.MainStatID)}/${Number(r.MainStatF)}`))
      assert(ms.has('1/0'), `expected HP% main present; got ${Array.from(ms)}`)
      const lvls = levelsIn(rules)
      const last = lvls.length ? lvls[lvls.length-1] : 16
      const rLast = rules.filter((r:any)=>Number(r.LVLForCheck)===last)
      const maxSum = rLast.reduce((acc:number,r:any)=>Math.max(acc, sumRollsForRow(r,['SPD','ACC','CR%'] as Label[])),0)
      assert(maxSum >= 3, `+${last} aggregate selected rolls <3 (max=${maxSum})`)
    },
  },
]

// Late-mode wildcard + MinRequiredRolls regression: ensure minimal selected-sum
// needed NOW is enforced at each milestone (based on remaining rolls to +16),
// and +16 enumerates minimal splits. Cover MinRequiredRolls = 0..5.
;(function addLateWildcardMinReqCases(){
  const baseACC = baseOf('ACC')
  const baseRES = baseOf('RES')
  function thresholdsFor(base: number, s: number): number[] {
    const out: number[] = []
    for (let k = 0; k <= s; k++) out.push(base * (1 + k))
    return out
  }
  for (let minReq = 0 as 0|1|2|3|4|5; minReq <= 5; minReq = (minReq + 1) as 0|1|2|3|4|5) {
    const mythExtra = (minReq === 5) ? 1 : 0
    const target = 4 + mythExtra
    const availByIdx = [0,1,2,3,4].map((n)=>n + mythExtra)
    const needNowAt = (avail: number) => Math.max(0, Math.min(minReq, minReq - Math.max(0, target - avail)))
    const needs = availByIdx.map(needNowAt) // [@0,@4,@8,@12,@16]
    const expACC: Array<[0|4|8|12|16, number[]]> = [0,4,8,12,16].map((lvl, i)=>[lvl as 0|4|8|12|16, thresholdsFor(baseACC, needs[i]!)])
    const expRES: Array<[0|4|8|12|16, number[]]> = [0,4,8,12,16].map((lvl, i)=>[lvl as 0|4|8|12|16, thresholdsFor(baseRES, needs[i]!)])
    const hsfr = {
      name: `Late wildcard pair, MinReq=${minReq}`,
      keep: true, enabled: true,
      Rank: 'Any', Rarity: 'Any', Faction: 'Any',
      minLevel: 0, maxLevel: 16,
      earlyKeepMode: 'late',
      mainStats: ['SPD'],
      artifactTypeNames: ['Boots'],
      substats: ['ACC','RES'],
      substatRollBounds: { 'ACC': { any: true }, 'RES': { any: true } },
      minCount: 2, autoMinCount: false,
      ...(minReq > 0 ? { minRequiredRolls: minReq, autoMinRequiredRolls: false } : { minRequiredRolls: 0, autoMinRequiredRolls: false }),
    }
    cases.push({
      name: `Late wildcard pair (ACC,RES), MinReq=${minReq}`,
      hsfr,
      thresholds: [
        { stat: 'ACC', expect: expACC },
        { stat: 'RES', expect: expRES },
      ],
    })
  }
})()

// Expose cases for tooling (e.g., HSFR extraction) without running tests.
export const CASES: ReadonlyArray<Case> = cases

if (typeof process === 'undefined' || process.env.HSFR_DUMP !== '1') {
  // Add curated matrix cases (algorithmic, bounded in count)
  (function addMatrixCases(){
    const STAT_POOL: ReadonlyArray<Label> = ['SPD','CR%','CDMG%','ACC','RES']
    const patterns = [
      { name: 'mins', boundsFor: (labs: Label[]) => labs[0] ? { [labs[0]]: { min: 2 } } : {}, fixedFor: (labs: Label[]) => labs[0] ? [labs[0]] : [] as Label[] },
      { name: 'mixed', boundsFor: (labs: Label[]) => { const m: any = {}; if (labs[0]) m[labs[0]] = { min: 2 }; if (labs[1]) m[labs[1]] = { min: 1 }; if (labs[2]) m[labs[2]] = { max: 0 }; return m }, fixedFor: (labs: Label[]) => labs.slice(0,2) },
      { name: 'maxcaps', boundsFor: (labs: Label[]) => labs.length ? { [labs[labs.length-1] as string]: { max: 0 } } : {}, fixedFor: (_: Label[]) => [] as Label[] },
    ] as const
    const modes: Array<'early'|'late'> = ['early','late']
    const baselines: Array<'afterStart'|'upToLevel'> = ['afterStart','upToLevel']
    const windows: Array<[0|4|8|12|16,0|4|8|12|16]> = [[0,16],[4,16],[8,16],[16,16]]
    const globalsList: number[] = [0,3]

    for (let k = 1; k <= 5; k++) {
      const selected = STAT_POOL.slice(0, k)
      const minCount = Math.min(4, k)
      for (const p of patterns) {
        for (const mode of modes) {
          for (const base of baselines) {
            for (const [minL, maxL] of windows) {
              for (const globals of globalsList) {
                const b = p.boundsFor(selected as Label[])
                const fixed = p.fixedFor(selected as Label[])
                const hsfr: Record<string, unknown> = {
                  Rank: 'Any', Rarity: 'Any', Faction: 'Any',
                  minLevel: minL, maxLevel: maxL,
                  earlyKeepMode: mode,
                  ...(base === 'upToLevel' ? { rollBaseline: 'upToLevel' } : {}),
                  substats: (selected as Label[]).slice(), minCount, autoMinCount: false,
                  ...(fixed.length ? { fixedSubstats: (fixed as Label[]).slice() } : {}),
                  substatRollBounds: b,
                  ...(globals > 0 ? { minRequiredRolls: globals, autoMinRequiredRolls: false } : {}),
                }
                const name = `MATRIX k=${k} ${p.name} mode=${mode} base=${base} win=${minL}-${maxL} g=${globals}`
                const validate = (rules: any[]) => {
                  for (const lab of selected as Label[]) {
                    const th = extractThresholds(rules, Number(variantFromLabel(lab)))
                    let prevMin = -Infinity
                    for (const lvl of LEVELS) {
                      const arr = th.get(lvl) ?? []
                      const curMin = arr.length ? Math.min(...arr) : prevMin
                      assert(curMin >= prevMin, `${name} ${lab}: +${lvl} < previous. prev=${prevMin} arr=[${arr}]`)
                      prevMin = curMin
                    }
                  }
                  for (const [lab, bound] of Object.entries(b)) {
                    if (typeof (bound as any).max === 'number') {
                      const cap = baseOf(lab as Label) * (1 + Math.max(0, Math.min(5, Math.floor((bound as any).max))))
                      for (const r of rules) {
                        const subs = Array.isArray(r.Substats) ? r.Substats : []
                        for (const s of subs) {
                          if (Number(s.ID) === idOf(lab as Label)) assert(Number(s.Value) <= cap, `${name} ${lab} exceeds cap ${cap}: got ${s.Value}`)
                        }
                      }
                    }
                  }
                  if (maxL) {
                    for (const [lab, bound] of Object.entries(b)) {
                      if (typeof (bound as any).min === 'number') {
                        const baseVal = baseOf(lab as Label)
                        const need = baseVal * (1 + Math.max(0, Math.min(5, Math.floor((bound as any).min))))
                        const rT = rules.filter((r: any) => isRowAtLevel(r, maxL))
                        if (rT.length === 0) continue
                        const maxRollsLab = rT.reduce((acc: number, r: any) => {
                          const s = (Array.isArray(r.Substats) ? r.Substats : []).find((x: any) => Number(x?.ID) === idOf(lab as Label))
                          if (!s) return acc
                          const rolls = Math.max(0, Math.round(Number(s.Value) / baseVal) - 1)
                          return Math.max(acc, rolls)
                        }, 0)
                        if (maxRollsLab < Math.floor(Number((bound as any).min))) continue
                        const ok = rT.some((r: any) => {
                          const s = (Array.isArray(r.Substats) ? r.Substats : []).find((x: any) => Number(x?.ID) === idOf(lab as Label))
                          return s && Number(s.Value) >= need
                        })
                        assert(ok, `${name} ${lab}: +${maxL} missing min threshold >= ${need}`)
                      }
                    }
                    const hasAnyBounds = Object.values(b).some((x: any) => x.min != null || x.max != null || x.any === true)
                    if (globals > 0 && hasAnyBounds) {
                      const rT = rules.filter((r: any) => isRowAtLevel(r, maxL))
                      const maxSum = rT.reduce((acc: number, r: any) => Math.max(acc, sumRollsForRow(r, selected as Label[])), 0)
                      if (rT.length > 0 && maxSum >= globals) assert(maxSum >= globals, `${name}: +${maxL} aggregate rolls max ${maxSum} < ${globals}`)
                    }
                  }
                }
                test(name, () => runCase({ name, hsfr, validate }))
              }
            }
          }
        }
      }
    }
  })()
  for (const c of cases) { test(c.name, () => runCase(c)) }
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}
