/* eslint-disable import/no-unused-modules, @typescript-eslint/no-explicit-any */
// Minimal builder tests (no external framework). Compiled via tsconfig.tests.json.
// Use explicit .js extensions so Node ESM can resolve compiled outputs
import { buildHsfRules, defaultMinima, LEVELS } from '../src/lib/hsfBuilder.js'
import { StatVariant, RarityCode, RankCode } from '../src/lib/types.js'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

function extractThresholds(rules: any, statId = 6): Map<number, number[]> {
  // Map level -> array of thresholds (sorted) for the requested stat ID
  const map = new Map<number, number[]>()
  for (const r of rules) {
    const lvl = r.LVLForCheck as number
    const subs: Array<{ ID: number; Value: number }> = Array.isArray(r.Substats) ? r.Substats : []
    for (let i = 0; i < Math.min(4, subs.length); i++) {
      const s = subs[i]
      if (!s) continue
      if (s.ID !== statId) continue
      const arr = map.get(lvl) ?? []
      arr.push(Number(s.Value))
      map.set(lvl, arr)
    }
  }
  for (const [lvl, arr] of map) {
    arr.sort((a,b) => a-b)
    const uniq = Array.from(new Set(arr))
    map.set(lvl, uniq)
  }
  return map
}

type PartialCfg = Partial<Parameters<typeof buildHsfRules>[0]>
function mkCfg(partial?: PartialCfg): Parameters<typeof buildHsfRules>[0] {
  return {
    name: 'test',
    keep: true,
    enabled: true,
    rankCode: RankCode.Any,
    rarityCode: RarityCode.Any,
    factionCode: 0,
    mainStatsV: [],
    startLevel: 0,
    rollBaseline: 'afterStart',
    rollMode: 'potential',
    substatsV: [StatVariant.ACC],
    fixedSubstatsV: [],
    substatRollBoundsV: {},
    minCount: 1,
    autoMinCount: true,
    minRequiredRolls: 0,
    autoMinRequiredRolls: true,
    artifactTypes: [],
    artifactSets: [],
    ...partial,
  }
}

let passed = 0
let failed = 0
// Avoid adding @types/node; declare minimal globals
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const process: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const console: any

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`ok - ${name}`)
    passed++
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`not ok - ${name}`)
    console.error('  ', msg)
    failed++
  }
}

// Test 1: Single substat ACC min=2 progressive thresholds
test('ACC min=2 progressive thresholds', () => {
  const cfg = mkCfg({ substatRollBoundsV: { [StatVariant.ACC]: { min: 2 } } })
  const rules = buildHsfRules(cfg, defaultMinima())
  const th = extractThresholds(rules)
  const expect = new Map<number, number[]>([[0, [9]],[4, [18]],[8,[27]],[12,[27]],[16,[27]]])
  for (const lvl of LEVELS) {
    const got = th.get(lvl) ?? []
    const exp = expect.get(lvl) ?? []
    assert(got.length === exp.length && got.every((v,i)=>v===exp[i]), `lvl ${lvl}: got ${got} != ${exp}`)
  }
})

// Test 2: Single substat ACC min=3 progressive thresholds
test('ACC min=3 progressive thresholds', () => {
  const cfg = mkCfg({ substatRollBoundsV: { [StatVariant.ACC]: { min: 3 } } })
  const rules = buildHsfRules(cfg, defaultMinima())
  const th = extractThresholds(rules)
  const expect = new Map<number, number[]>([[0, [9]],[4, [18]],[8,[27]],[12,[36]],[16,[36]]])
  for (const lvl of LEVELS) {
    const got = th.get(lvl) ?? []
    const exp = expect.get(lvl) ?? []
    assert(got.length === exp.length && got.every((v,i)=>v===exp[i]), `lvl ${lvl}: got ${got} != ${exp}`)
  }
})

// Test 2e: Single substat SPD min=2 reachable thresholds (Any rarity → presence like ≥ Legendary)
test('SPD min=2 reachable thresholds', () => {
  const cfg = mkCfg({
    substatsV: [StatVariant.SPD],
    substatRollBoundsV: { [StatVariant.SPD]: { min: 2 } },
    earlyKeepMode: 'reachable',
  }) as any
  const rules = buildHsfRules(cfg, defaultMinima())
  // SPD id is 4
  const th = extractThresholds(rules, 4)
  // Reachable: +0 5, +4 5, +8 5, +12 10, +16 15
  const expect = new Map<number, number[]>([[0,[5]],[4,[5]],[8,[5]],[12,[10]],[16,[15]]])
  for (const lvl of LEVELS) {
    const got = th.get(lvl) ?? []
    const exp = expect.get(lvl) ?? []
    assert(got.length === exp.length && got.every((v,i)=>v===exp[i]), `lvl ${lvl}: got ${got} != ${exp}`)
  }
})

// Test 2f: Multi-substat reachable lower bounds emit all minimal allocations (SPD min=2, ACC min=1)
test('SPD(2)+ACC(1) reachable thresholds (all minimal)', () => {
  const cfg = mkCfg({
    substatsV: [StatVariant.SPD, StatVariant.ACC],
    substatRollBoundsV: { [StatVariant.SPD]: { min: 2 }, [StatVariant.ACC]: { min: 1 } },
    earlyKeepMode: 'reachable' as any,
    // Ensure we evaluate both SPD and ACC together
    autoMinCount: false,
    minCount: 2,
  }) as any
  const rules = buildHsfRules(cfg, defaultMinima())
  // SPD id=4, ACC id=6; extract both
  const spd = extractThresholds(rules, 4)
  const acc = extractThresholds(rules, 6)
  // Expect all minimal lower-bounds:
  // +8: one roll allocated somewhere -> SPD 10 or ACC 18
  // +12: need two rolls total by now -> either SPD 15 & ACC 9, or SPD 10 & ACC 18
  const expectAcc = new Map<number, number[]>([[0,[9]],[4,[9]],[8,[9,18]],[12,[9,18]],[16,[18]]])
  const expectSpd = new Map<number, number[]>([[0,[5]],[4,[5]],[8,[5,10]],[12,[10,15]],[16,[15]]])
  for (const lvl of LEVELS) {
    const spdGot = spd.get(lvl) ?? []
    const accGot = acc.get(lvl) ?? []
    const spdExp = expectSpd.get(lvl) ?? []
    const accExp = expectAcc.get(lvl) ?? []
    assert(spdGot.length === spdExp.length && spdGot.every((v,i)=>v===spdExp[i]), `SPD lvl ${lvl}: got ${spdGot} != ${spdExp}`)
    assert(accGot.length === accExp.length && accGot.every((v,i)=>v===accExp[i]), `ACC lvl ${lvl}: got ${accGot} != ${accExp}`)
  }
})

// Test 2g: Progressive multi-substat enumerates selected-only distributions until feasible; then collapses to mins
test('SPD(2)+CR(1) progressive distributions then collapse', () => {
  const cfg = mkCfg({
    substatsV: [StatVariant.SPD, StatVariant.CR],
    substatRollBoundsV: { [StatVariant.SPD]: { min: 2 }, [StatVariant.CR]: { min: 1 } },
    // Progressive is default (earlyKeepMode omitted)
  }) as any
  const rules = buildHsfRules(cfg, defaultMinima())
  // Extract SPD and CR thresholds
  const spd = extractThresholds(rules, /*SPD*/ 4)
  const cr = extractThresholds(rules, /*CR%*/ 7)
  const expectSpd = new Map<number, number[]>([
    [0,[5]],
    [4,[5,10]],
    [8,[5,10,15]],
    [12,[15]],
    [16,[15]],
  ])
  const expectCr = new Map<number, number[]>([
    [0,[5]],
    [4,[5,10]],
    [8,[5,10,15]],
    [12,[10]],
    [16,[10]],
  ])
  for (const lvl of LEVELS) {
    const gotS = spd.get(lvl) ?? []
    const gotC = cr.get(lvl) ?? []
    const expS = expectSpd.get(lvl) ?? []
    const expC = expectCr.get(lvl) ?? []
    assert(gotS.length === expS.length && gotS.every((v,i)=>v===expS[i]), `SPD lvl ${lvl}: got ${gotS} != ${expS}`)
    assert(gotC.length === expC.length && gotC.every((v,i)=>v===expC[i]), `CR lvl ${lvl}: got ${gotC} != ${expC}`)
  }
})

// Test 2h: Progressive with 3 substats (SPD min=2, CR min=1, CDMG any)
test('SPD(2)+CR(1)+CDMG(*) progressive distributions then collapse', () => {
  const cfg = mkCfg({
    substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.CDMG],
    substatRollBoundsV: {
      [StatVariant.SPD]: { min: 2 },
      [StatVariant.CR]: { min: 1 },
      [StatVariant.CDMG]: { any: true },
    },
    autoMinCount: false,
    minCount: 3,
  }) as any
  const rules = buildHsfRules(cfg, defaultMinima())
  const spd = extractThresholds(rules, /*SPD*/ 4)
  const cr  = extractThresholds(rules, /*CR%*/ 7)
  const cd  = extractThresholds(rules, /*CDMG%*/ 8)
  const expSpd = new Map<number, number[]>([
    [0,[5]],
    [4,[5,10]],
    [8,[5,10,15]],
    [12,[15]],
    [16,[15]],
  ])
  const expCr = new Map<number, number[]>([
    [0,[5]],
    [4,[5,10]],
    [8,[5,10,15]],
    [12,[10]],
    [16,[10]],
  ])
  const expCd = new Map<number, number[]>([
    [0,[5]],
    [4,[5,10]],
    [8,[5,10]],
    [12,[5]],
    [16,[5]],
  ])
  for (const lvl of LEVELS) {
    const s = spd.get(lvl) ?? []
    const c = cr.get(lvl) ?? []
    const d = cd.get(lvl) ?? []
    const es = expSpd.get(lvl) ?? []
    const ec = expCr.get(lvl) ?? []
    const ed = expCd.get(lvl) ?? []
    assert(s.length === es.length && s.every((v,i)=>v===es[i]), `SPD lvl ${lvl}: got ${s} != ${es}`)
    assert(c.length === ec.length && c.every((v,i)=>v===ec[i]), `CR lvl ${lvl}: got ${c} != ${ec}`)
    assert(d.length === ed.length && d.every((v,i)=>v===ed[i]), `CDMG lvl ${lvl}: got ${d} != ${ed}`)
  }
})

// Test 2i: Reachable with 3 substats (SPD min=2, CR min=1, CDMG any) emits minimal lower-bounds
test('SPD(2)+CR(1)+CDMG(*) reachable minimal lower-bounds', () => {
  const cfg = mkCfg({
    substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.CDMG],
    substatRollBoundsV: {
      [StatVariant.SPD]: { min: 2 },
      [StatVariant.CR]: { min: 1 },
      [StatVariant.CDMG]: { any: true },
    },
    autoMinCount: false,
    minCount: 3,
    earlyKeepMode: 'reachable',
  }) as any
  const rules = buildHsfRules(cfg, defaultMinima())
  const spd = extractThresholds(rules, /*SPD*/ 4)
  const cr  = extractThresholds(rules, /*CR%*/ 7)
  const cd  = extractThresholds(rules, /*CDMG%*/ 8)
  const expSpd = new Map<number, number[]>([
    [0,[5]],
    [4,[5]],
    [8,[5,10]],
    [12,[10,15]],
    [16,[15]],
  ])
  const expCr = new Map<number, number[]>([
    [0,[5]],
    [4,[5]],
    [8,[5,10]],
    [12,[5,10]],
    [16,[10]],
  ])
  const expCd = new Map<number, number[]>([
    [0,[5]],
    [4,[5]],
    [8,[5]],
    [12,[5]],
    [16,[5]],
  ])
  for (const lvl of LEVELS) {
    const s = spd.get(lvl) ?? []
    const c = cr.get(lvl) ?? []
    const d = cd.get(lvl) ?? []
    const es = expSpd.get(lvl) ?? []
    const ec = expCr.get(lvl) ?? []
    const ed = expCd.get(lvl) ?? []
    assert(s.length === es.length && s.every((v,i)=>v===es[i]), `SPD lvl ${lvl}: got ${s} != ${es}`)
    assert(c.length === ec.length && c.every((v,i)=>v===ec[i]), `CR lvl ${lvl}: got ${c} != ${ec}`)
    assert(d.length === ed.length && d.every((v,i)=>v===ed[i]), `CDMG lvl ${lvl}: got ${d} != ${ed}`)
  }
})

// Test 2j: Progressive with CDMG capped at 0 — CDMG stays at base; SPD/CR enumerate
test('SPD(2)+CR(1)+CDMG(max=0) progressive caps honored', () => {
  const cfg = mkCfg({
    substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.CDMG],
    substatRollBoundsV: {
      [StatVariant.SPD]: { min: 2 },
      [StatVariant.CR]: { min: 1 },
      [StatVariant.CDMG]: { any: true, max: 0 },
    },
    autoMinCount: false,
    minCount: 3,
  }) as any
  const rules = buildHsfRules(cfg, defaultMinima())
  const spd = extractThresholds(rules, /*SPD*/ 4)
  const cr  = extractThresholds(rules, /*CR%*/ 7)
  const cd  = extractThresholds(rules, /*CDMG%*/ 8)
  const expCd = new Map<number, number[]>([
    [0,[5]],[4,[5]],[8,[5]],[12,[5]],[16,[5]]
  ])
  for (const lvl of LEVELS) {
    const d = cd.get(lvl) ?? []
    const ed = expCd.get(lvl) ?? []
    assert(d.length === ed.length && d.every((v,i)=>v===ed[i]), `CDMG lvl ${lvl}: got ${d} != ${ed}`)
  }
  // Spot-check SPD/CR include only selected-two splits at +4/+8
  const spd4 = spd.get(4) ?? []
  const cr4  = cr.get(4) ?? []
  assert(spd4.join(',') === '5,10' && cr4.join(',') === '5,10', `+4 SPD/CR expected [5,10]; got SPD=${spd4} CR=${cr4}`)
})

// Test 2b: Single substat per-stat min lower than global MinRequired -> global dominates progressively
test('ACC min=2 with MinRequired=5 uses global progressive thresholds', () => {
  const cfg = mkCfg({
    substatRollBoundsV: { [StatVariant.ACC]: { min: 2 } },
    autoMinRequiredRolls: false,
    minRequiredRolls: 5,
  })
  const rules = buildHsfRules(cfg, defaultMinima())
  const th = extractThresholds(rules)
  const expect = new Map<number, number[]>([[0, [18]],[4, [27]],[8,[36]],[12,[45]],[16,[54]]])
  for (const lvl of LEVELS) {
    const got = th.get(lvl) ?? []
    const exp = expect.get(lvl) ?? []
    assert(got.length === exp.length && got.every((v,i)=>v===exp[i]), `lvl ${lvl}: got ${got} != ${exp}`)
  }
})

// Test 2c: Single substat ACC min=5 (per-stat) -> progressive to 5 rolls (Mythical-capable in Any rarity)
test('ACC min=5 per-stat progressive thresholds', () => {
  const cfg = mkCfg({ substatRollBoundsV: { [StatVariant.ACC]: { min: 5 } } })
  const rules = buildHsfRules(cfg, defaultMinima())
  const th = extractThresholds(rules)
  const expect = new Map<number, number[]>([[0, [18]],[4, [27]],[8,[36]],[12,[45]],[16,[54]]])
  for (const lvl of LEVELS) {
    const got = th.get(lvl) ?? []
    const exp = expect.get(lvl) ?? []
    assert(got.length === exp.length && got.every((v,i)=>v===exp[i]), `lvl ${lvl}: got ${got} != ${exp}`)
  }
})

// Test 2d: Single substat ACC with MinRequired=5 only (no per-stat min) -> progressive to 5 rolls
test('ACC MinRequired=5 only progressive thresholds', () => {
  const cfg = mkCfg({
    substatRollBoundsV: {},
    autoMinRequiredRolls: false,
    minRequiredRolls: 5,
  })
  const rules = buildHsfRules(cfg, defaultMinima())
  const th = extractThresholds(rules)
  const expect = new Map<number, number[]>([[0, [18]],[4, [27]],[8,[36]],[12,[45]],[16,[54]]])
  for (const lvl of LEVELS) {
    const got = th.get(lvl) ?? []
    const exp = expect.get(lvl) ?? []
    assert(got.length === exp.length && got.every((v,i)=>v===exp[i]), `lvl ${lvl}: got ${got} != ${exp}`)
  }
})

// Test 3: Strict check at +16 only
test('Strict at +16 emits only lower-bound', () => {
  const cfg = mkCfg({
    startLevel: 16,
    rollBaseline: 'upToLevel',
    rollMode: 'strict',
    substatRollBoundsV: { [StatVariant.ACC]: { min: 2 } },
  })
  const rules = buildHsfRules(cfg, defaultMinima())
  const th = extractThresholds(rules)
  const arr = th.get(16) ?? []
  assert(th.size === 1 && arr.length === 1 && arr[0] === 27, `expected only +16 with 27, got ${JSON.stringify([...th])}`)
})

// Test 4: MinRequiredRolls (Σ rolls) filters states that can't reach target
test('MinRequiredRolls=3 filters unreachable states', () => {
  const cfg = mkCfg({
    substatRollBoundsV: {},
    autoMinRequiredRolls: false,
    minRequiredRolls: 3,
  })
  const rules = buildHsfRules(cfg, defaultMinima())
  const th = extractThresholds(rules)
  const at8 = th.get(8) ?? []
  assert(!at8.includes(9), `+8 should not include 9; got ${at8}`)
  assert(at8.includes(18) && at8.includes(27), `+8 should include 18 and 27; got ${at8}`)
  const at16 = th.get(16) ?? []
  assert(at16.length > 0 && at16[0] === 36, `+16 should start at 36; got ${at16}`)
})

// Test 5: Single substat STAR(any) + MinRequiredRolls behaves like per-stat min (progressive single row)
test('STAR + MinRequired(1) on single substat (SPD) progressive single row', () => {
  const cfg = mkCfg({
    substatsV: [StatVariant.SPD],
    substatRollBoundsV: { [StatVariant.SPD]: { any: true } },
    autoMinRequiredRolls: false,
    minRequiredRolls: 1,
  })
  const rules = buildHsfRules(cfg, defaultMinima())
  const th = extractThresholds(rules, /*SPD*/ 4)
  // 6★ SPD base = 5; per progressive single-row: +0 5, +4 10, +8 10, +12 10, +16 10
  const expect = new Map<number, number[]>([[0, [5]],[4, [10]],[8,[10]],[12,[10]],[16,[10]]])
  for (const lvl of LEVELS) {
    const got = th.get(lvl) ?? []
    const exp = expect.get(lvl) ?? []
    assert(got.length === exp.length && got.every((v,i)=>v===exp[i]), `lvl ${lvl}: got ${got} != ${exp}`)
  }
})

// Test 6: STAR + MinRequired(2) on single substat (SPD) progressive single row
test('STAR + MinRequired(2) on single substat (SPD) progressive single row', () => {
  const cfg = mkCfg({
    substatsV: [StatVariant.SPD],
    substatRollBoundsV: { [StatVariant.SPD]: { any: true } },
    autoMinRequiredRolls: false,
    minRequiredRolls: 2,
  })
  const rules = buildHsfRules(cfg, defaultMinima())
  const th = extractThresholds(rules, /*SPD*/ 4)
  // 6★ SPD base = 5; progressive: +0 5, +4 10, +8 15, +12 15, +16 15
  const expect = new Map<number, number[]>([[0, [5]],[4, [10]],[8,[15]],[12,[15]],[16,[15]]])
  for (const lvl of LEVELS) {
    const got = th.get(lvl) ?? []
    const exp = expect.get(lvl) ?? []
    assert(got.length === exp.length && got.every((v,i)=>v===exp[i]), `lvl ${lvl}: got ${got} != ${exp}`)
  }
})

// Test 7: STAR + MinRequired(1) with max=0 (cap forbids rolls) -> present early, filtered at +16
test('STAR + MinRequired(1) with max=0 filters +16 (SPD)', () => {
  const cfg = mkCfg({
    substatsV: [StatVariant.SPD],
    substatRollBoundsV: { [StatVariant.SPD]: { any: true, max: 0 } },
    autoMinRequiredRolls: false,
    minRequiredRolls: 1,
  })
  const rules = buildHsfRules(cfg, defaultMinima())
  const th = extractThresholds(rules, /*SPD*/ 4)
  // Early levels allowed (can still reach by target if cap were not exceeded), but at +16 cap=0 makes target impossible
  assert((th.get(0) ?? []).length === 1, '+0 should have presence row')
  assert((th.get(4) ?? []).length === 1, '+4 should have presence row (applied=1 capped to 0 -> still allowed pre-target)')
  assert(!th.has(16) || (th.get(16) ?? []).length === 0, '+16 should have no SPD row under max=0 with MinRequired=1')
})

// Test 8: Per-stat impossible min>max yields no rows
test('Per-stat min>max impossible yields no rows', () => {
  const cfg = mkCfg({
    substatsV: [StatVariant.ACC],
    substatRollBoundsV: { [StatVariant.ACC]: { min: 2, max: 1 } },
  })
  const rules = buildHsfRules(cfg, defaultMinima())
  const th = extractThresholds(rules)
  let total = 0
  for (const arr of th.values()) total += arr.length
  assert(total === 0, `expected 0 rows for impossible min>max, got ${total}`)
})

// Test 9: Epic rarity, 4 selected, minCount=3 -> +16 thresholds not below +12 (no allow-other degradation)
test('Epic 3-of-4 at +16 not below +12 (SPD)', () => {
  const cfg = mkCfg({
    rarityCode: RarityCode.Epic,
    substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.ACC, StatVariant.RES],
    substatRollBoundsV: {
      [StatVariant.SPD]: { any: true },
      [StatVariant.CR]: { any: true },
      [StatVariant.ACC]: { any: true },
      [StatVariant.RES]: { any: true },
    },
    minCount: 3,
    autoMinCount: false,
  })
  const rules = buildHsfRules(cfg, defaultMinima())
  const th = extractThresholds(rules, /*SPD*/ 4)
  const at12 = th.get(12) ?? []
  const at16 = th.get(16) ?? []
  // Ensure +16 does not produce smaller thresholds than +12
  const min12 = at12.length ? Math.min(...at12) : Infinity
  const max12 = at12.length ? Math.max(...at12) : -Infinity
  const min16 = at16.length ? Math.min(...at16) : Infinity
  const max16 = at16.length ? Math.max(...at16) : -Infinity
  assert(min16 >= min12 && max16 >= max12, `+16 thresholds should not be below +12. +12=[${at12}] +16=[${at16}]`)
})

// Test 10: Uncommon rarity, SPD+RES selected, minCount=2 -> +16 thresholds not below +12 for both
test('Uncommon 2-of-2 SPD+RES: +16 not below +12', () => {
  const cfg = mkCfg({
    rarityCode: RarityCode.Uncommon,
    substatsV: [StatVariant.SPD, StatVariant.RES],
    substatRollBoundsV: {
      [StatVariant.SPD]: { any: true },
      [StatVariant.RES]: { any: true },
    },
    minCount: 2,
    autoMinCount: false,
  })
  const rules = buildHsfRules(cfg, defaultMinima())
  // SPD (id 4)
  {
    const th = extractThresholds(rules, /*SPD*/ 4)
    const at12 = th.get(12) ?? []
    const at16 = th.get(16) ?? []
    const min12 = at12.length ? Math.min(...at12) : Infinity
    const max12 = at12.length ? Math.max(...at12) : -Infinity
    const min16 = at16.length ? Math.min(...at16) : Infinity
    const max16 = at16.length ? Math.max(...at16) : -Infinity
    assert(min16 >= min12 && max16 >= max12, `SPD: +16 < +12. +12=[${at12}] +16=[${at16}]`)
  }
  // RES (id 5)
  {
    const th = extractThresholds(rules, /*RES*/ 5)
    const at12 = th.get(12) ?? []
    const at16 = th.get(16) ?? []
    const min12 = at12.length ? Math.min(...at12) : Infinity
    const max12 = at12.length ? Math.max(...at12) : -Infinity
    const min16 = at16.length ? Math.min(...at16) : Infinity
    const max16 = at16.length ? Math.max(...at16) : -Infinity
    assert(min16 >= min12 && max16 >= max12, `RES: +16 < +12. +12=[${at12}] +16=[${at16}]`)
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
