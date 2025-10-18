/* eslint-disable @typescript-eslint/no-explicit-any */
// File-based HSFC → HSF end-to-end tests.
// Each case has two files in tests/fixtures/:
//  - <name>.hsfc  (input, human-readable HSFC)
//  - <name>.hsf   (expected HSF rules array)
//  The runner also accepts legacy suffixes .hsfc.json / .hsf.json for compatibility.
//
// Assertions:
// 1) Exact structural equality against expected after canonicalization
//    (stable ordering, no extra/missing members; array order-insensitive where applicable).
// 2) Optional pinpoint assertions: if a sibling <name>.assert.mjs exists and
//    exports a function validate(rules), it will be invoked.

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildHsfRules, defaultMinima, type BuilderConfig, type MinimaTable } from '../src/lib/hsfBuilder.js'
import { StatVariant } from '../src/lib/types.js'
import { normalizeConfig, buildReadableConfig, parseHsfcObject } from '../src/lib/hsfcIO.js'
import { computeMergedRules } from '../src/lib/merge.js'
import { ACCESSORY_NO_SET_ID } from '../src/lib/constants.js'
import { FINAL_SELL_DEFAULT_SETS_MODE } from '../src/lib/finalSell.js'

declare const process: any
declare const console: any

function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg) }

// Canonicalize a built rule for strict, stable comparison.
function canonicalizeRule(rule: any): any {
  const out: any = {}
  // Required scalar members; omit anything else.
  out.Keep = Boolean(rule.Keep)
  out.IsRuleTypeAND = Boolean(rule.IsRuleTypeAND)
  out.Use = Boolean(rule.Use)
  out.Rank = Number(rule.Rank)
  out.Rarity = Number(rule.Rarity)
  out.Faction = Number(rule.Faction)
  out.MainStatID = Number(rule.MainStatID)
  out.MainStatF = Number(rule.MainStatF)
  out.LVLForCheck = Number(rule.LVLForCheck)
  // Arrays: include only when present and non-empty, sort ascending
  if (Array.isArray(rule.ArtifactSet) && rule.ArtifactSet.length > 0) out.ArtifactSet = rule.ArtifactSet.map(Number).sort((a:number,b:number)=>a-b)
  if (Array.isArray(rule.ArtifactType) && rule.ArtifactType.length > 0) out.ArtifactType = rule.ArtifactType.map(Number).sort((a:number,b:number)=>a-b)
  // Substats: sort by (ID asc, IsFlat asc). Pad to 4 with ANY (-1,0,'',true) for stability.
  const subs = Array.isArray(rule.Substats) ? rule.Substats.slice() : []
  const sorted = subs.sort((a:any,b:any)=>{
    const ida = Number(a?.ID ?? 9999), idb = Number(b?.ID ?? 9999)
    if (ida !== idb) return ida - idb
    const fa = Number(a?.IsFlat ? 1 : 0), fb = Number(b?.IsFlat ? 1 : 0)
    return fa - fb
  })
  const ANY = { ID: -1, Value: 0, Condition: '', IsFlat: true }
  while (sorted.length < 4) sorted.push(ANY)
  out.Substats = sorted.slice(0,4).map((s:any)=>({
    ID: Number(s?.ID),
    Value: Number(s?.Value ?? 0),
    Condition: String(s?.Condition ?? ''),
    IsFlat: Boolean(s?.IsFlat),
    ...(s?.NotAvailable ? { NotAvailable: Boolean(s.NotAvailable) } : {}),
  }))
  return out
}

function canonicalize(rules: any[]): any[] { return (rules || []).map(canonicalizeRule) }

function stripRuleMetadata(rules: any[]): any[] {
  return (rules || []).map((rule) => {
    const { __cfgIdx: _cfgIdx, __lineIdx: _lineIdx, __allKnownSets: _allKnownSets, ...rest } = rule ?? {}
    return rest
  })
}

async function maybeLoadAssert(fixturesDir: string, base: string): Promise<undefined | ((rules:any[]) => void)> {
  const path = resolve(fixturesDir, `${base}.assert.mjs`)
  try {
    // Dynamic import if present
    const mod = await import(fileURLToPath(new URL(`file://${path.replace(/\\/g,'/')}`)))
    if (mod && typeof mod.validate === 'function') return mod.validate as (rules:any[])=>void
  } catch {}
  return undefined
}

function deepEqual(a: any, b: any): boolean { return JSON.stringify(a) === JSON.stringify(b) }

const HERE = fileURLToPath(import.meta.url)
const FIXTURES_DIR = resolve(HERE, '..', '..', '..', '..', 'tests', 'fixtures')

type FixtureCase = { base: string; hsfcPath: string; hsfPath: string }
type FixturePrep = { fixturesDir: string; cases: FixtureCase[] }

function prepareFixtures(): FixturePrep {
  const entries = readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map(d => d.name)
  const hsfcFiles = entries.filter(n => n.endsWith('.hsfc') || n.endsWith('.hsfc.json'))
  const hsfFiles = entries.filter(n => n.endsWith('.hsf') || n.endsWith('.hsf.json'))
  const baseOf = (n: string) => n.replace(/\.(hsfc|hsf)(\.json)?$/, '')
  const hsfcBases = new Set(hsfcFiles.map(baseOf))
  const hsfBases = new Set(hsfFiles.map(baseOf))
  const missingHsf: string[] = []
  const missingHsfc: string[] = []
  for (const b of hsfcBases) if (!hsfBases.has(b)) missingHsf.push(b)
  for (const b of hsfBases) if (!hsfcBases.has(b)) missingHsfc.push(b)
  if (missingHsf.length || missingHsfc.length) {
    const lines: string[] = []
    if (missingHsf.length) lines.push(`Missing .hsf for: ${missingHsf.join(', ')}`)
    if (missingHsfc.length) lines.push(`Missing .hsfc for: ${missingHsfc.join(', ')}`)
    throw new Error(`Fixture pairing error.\n${lines.join('\n')}`)
  }
  const cases: FixtureCase[] = hsfcFiles.map((f) => {
    const base = f.replace(/\.hsfc(\.json)?$/, '')
    const hsfcPath = resolve(FIXTURES_DIR, f)
    const hasHsf = hsfFiles.includes(`${base}.hsf`)
    const hsfPath = resolve(FIXTURES_DIR, hasHsf ? `${base}.hsf` : `${base}.hsf.json`)
    return { base, hsfcPath, hsfPath }
  })
  return { fixturesDir: FIXTURES_DIR, cases }
}

const PREPARED_FIXTURES: FixturePrep = prepareFixtures()

export const CASES: ReadonlyArray<{ name: string; hsfc: Record<string, unknown> }> = Object.freeze(
  PREPARED_FIXTURES.cases.map(({ base, hsfcPath }) => ({
    name: base,
    hsfc: JSON.parse(readFileSync(hsfcPath, 'utf8')) as Record<string, unknown>,
  }))
);

async function run(prep: FixturePrep = PREPARED_FIXTURES): Promise<void> {
  const { fixturesDir, cases } = prep
  let passed = 0
  let failed = 0
  for (const c of cases) {
    try {
      const hsfc = JSON.parse(readFileSync(c.hsfcPath, 'utf8'))
      const expectedRaw = JSON.parse(readFileSync(c.hsfPath, 'utf8'))
      assert(Array.isArray(expectedRaw), `${c.base}: expected HSF file to be a JSON array`)

      const parsed = parseHsfcObject(hsfc, { metasets: [], minima: defaultMinima() })
      const merged = computeMergedRules({
        hsf: null,
        customCfgs: parsed.cfgs,
        metasets: parsed.metasets,
        minima: parsed.minima,
        finalSellRemainder: parsed.finalSellRemainder,
      })
      const built = stripRuleMetadata(merged)

      // Canonicalize both sides, then assert structural equality (no missing/extra members)
      const got = canonicalize(built)
      const expected = canonicalize(expectedRaw)
      assert(got.length === expected.length, `${c.base}: rule count mismatch (got=${got.length} expected=${expected.length})`)
      assert(deepEqual(got, expected), `${c.base}: HSF mismatch`)

      // Optional pinpoint assertions
      const validate = await maybeLoadAssert(fixturesDir, c.base)
      if (validate) validate(built)

      console.log(`ok - ${c.base}`)
      passed++
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`not ok - ${c.base}`)
      console.error('  ', msg)
      failed++
    }
  }
  // Additional IO checks: autoRarityThreshold normalization (export/import)
  // Scenario A: Auto + Late + thresholds active -> writer includes field
  {
    const cfg: BuilderConfig = {
      name: '', keep: true, visibility: 'enabled',
      rankCode: 0,
      rarityCode: 0, rarityMode: 'auto', autoRaritySupplementsThreshold: 'epic',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      rollBaseline: 'afterStart', earlyKeepMode: 'late',
      substatsV: [StatVariant.ACC], fixedSubstatsV: [], minCount: 0,
      autoMinCount: true, autoSubstatFlex: false, minRequiredRolls: 0, autoMinRequiredRolls: true,
      substatRollBoundsV: { [StatVariant.ACC]: { min: 1 } },
      artifactTypes: [], artifactSets: [], artifactMetaSets: [], substatMinTarget: 'selected',
    }
    const out = buildReadableConfig(cfg as any, []) as any
    assert(out.autoRarityThreshold === 'epic', 'IO A: writer should include autoRarityThreshold when Auto+Late+active')
    const round = normalizeConfig({ ...out, Rarity: 'Auto' }) as any
    assert(round.autoRaritySupplementsThreshold === 'epic', 'IO A: reader should parse autoRarityThreshold when applicable')
  }
  // Scenario B: Auto + Early + active -> writer omits; reader drops
  {
    const cfg: BuilderConfig = {
      name: '', keep: true, visibility: 'enabled',
      rankCode: 0,
      rarityCode: 0, rarityMode: 'auto', autoRaritySupplementsThreshold: 'uncommon',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      rollBaseline: 'afterStart', earlyKeepMode: 'early',
      substatsV: [StatVariant.ACC], fixedSubstatsV: [], minCount: 0,
      autoMinCount: true, autoSubstatFlex: false, minRequiredRolls: 0, autoMinRequiredRolls: true,
      substatRollBoundsV: { [StatVariant.ACC]: { min: 1 } },
      artifactTypes: [], artifactSets: [], artifactMetaSets: [], substatMinTarget: 'selected',
    }
    const out = buildReadableConfig(cfg as any, []) as any
    assert(!('autoRarityThreshold' in out), 'IO B: writer should omit autoRarityThreshold when Early')
    const round = normalizeConfig({ ...out, Rarity: 'Auto', autoRarityThreshold: 'uncommon', earlyKeepMode: 'early', substats: ['ACC'], substatRollBounds: { ACC: { min: 1 } } }) as any
    assert(!('autoRaritySupplementsThreshold' in round), 'IO B: reader should drop autoRaritySupplementsThreshold when Early')
  }
  // Scenario C: Code mode -> writer omits; reader drops
  {
    const cfg: BuilderConfig = {
      name: '', keep: true, visibility: 'enabled',
      rankCode: 0,
      rarityCode: 8, rarityMode: 'code', autoRaritySupplementsThreshold: 'rare',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      rollBaseline: 'afterStart', earlyKeepMode: 'late',
      substatsV: [StatVariant.ACC], fixedSubstatsV: [], minCount: 0,
      autoMinCount: true, autoSubstatFlex: false, minRequiredRolls: 0, autoMinRequiredRolls: true,
      substatRollBoundsV: { [StatVariant.ACC]: { min: 1 } },
      artifactTypes: [], artifactSets: [], artifactMetaSets: [], substatMinTarget: 'selected',
    }
    const out = buildReadableConfig(cfg as any, []) as any
    assert(!('autoRarityThreshold' in out), 'IO C: writer should omit autoRarityThreshold when rarityMode is code')
    const round = normalizeConfig({ ...out, Rarity: 'Rare', autoRarityThreshold: 'rare', substats: ['ACC'], substatRollBounds: { ACC: { min: 1 } }, earlyKeepMode: 'late' }) as any
    assert(!('autoRaritySupplementsThreshold' in round), 'IO C: reader should drop autoRaritySupplementsThreshold when rarityMode is code')
  }
  // Scenario D: Auto + Late but thresholds inactive -> writer omits; reader drops
  {
    const cfg: BuilderConfig = {
      name: '', keep: true, visibility: 'enabled',
      rankCode: 0,
      rarityCode: 0, rarityMode: 'auto', autoRaritySupplementsThreshold: 'rare',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      rollBaseline: 'afterStart', earlyKeepMode: 'late',
      substatsV: [], fixedSubstatsV: [], minCount: 0,
      autoMinCount: true, autoSubstatFlex: false, minRequiredRolls: 0, autoMinRequiredRolls: true,
      substatRollBoundsV: {},
      artifactTypes: [], artifactSets: [], artifactMetaSets: [], substatMinTarget: 'selected',
    }
    const out = buildReadableConfig(cfg as any, []) as any
    assert(!('autoRarityThreshold' in out), 'IO D: writer should omit autoRarityThreshold when thresholds are inactive')
    const round = normalizeConfig({ ...out, Rarity: 'Auto', autoRarityThreshold: 'rare' }) as any
    assert(!('autoRaritySupplementsThreshold' in round), 'IO D: reader should drop autoRaritySupplementsThreshold when thresholds are inactive')
  }
  // Scenario Draft: Draft configs act as dividers and emit no rules
  {
    const cfg: BuilderConfig = {
      name: 'Divider', keep: true, visibility: 'draft',
      rankCode: 0,
      rarityCode: 0, rarityMode: 'auto',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      rollBaseline: 'afterStart', earlyKeepMode: 'early',
      substatsV: [], fixedSubstatsV: [], minCount: 0,
      autoMinCount: true, autoSubstatFlex: false, minRequiredRolls: 0, autoMinRequiredRolls: true,
      substatRollBoundsV: {},
      artifactTypes: [], artifactSets: [], artifactMetaSets: [], substatMinTarget: 'selected',
    }
    const built = buildHsfRules(cfg, defaultMinima())
    assert(built.length === 0, 'IO Draft: draft configs must not emit HSF rows')
    const readable = buildReadableConfig(cfg, []) as any
    assert(readable.SellfileVisibility === 'Draft', 'IO Draft: writer should label draft visibility')
  }
  // Scenario E: Rank Any uses the configured minima fallback star
  {
    const minima = defaultMinima()
    minima.anyRankDefaultsTo = 5
    minima.five[StatVariant.SPD] = 57
    minima.six[StatVariant.SPD] = 67

    const cfg: BuilderConfig = {
      name: '', keep: true, visibility: 'enabled',
      rankCode: 0,
      rarityCode: 0, rarityMode: 'code',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      rollBaseline: 'afterStart', earlyKeepMode: 'early',
      substatsV: [StatVariant.SPD], fixedSubstatsV: [], minCount: 1,
      autoMinCount: false, autoSubstatFlex: false, minRequiredRolls: 0, autoMinRequiredRolls: true,
      substatRollBoundsV: {},
      artifactTypes: [], artifactSets: [], artifactMetaSets: [], substatMinTarget: 'selected',
    }
    const built = buildHsfRules(cfg, minima)
    const spdValues = built
      .flatMap(rule => rule.Substats)
      .filter(sub => sub && sub.ID === 4 && sub.IsFlat && !sub.NotAvailable)
      .map(sub => sub.Value)
    assert(spdValues.length > 0, 'IO E: expected SPD minima in generated rules')
    assert(spdValues.every(v => v === minima.five[StatVariant.SPD]), 'IO E: Any rank should pick the fallback star minima')
  }
  // Final Sell remainder rules must cover accessories without a set so the Rule Tester and exports match game behavior.
  {
    const minima: MinimaTable = { one: {}, two: {}, three: {}, four: {}, five: {}, six: {}, anyRankDefaultsTo: 6 }
    const merged = computeMergedRules({
      hsf: null,
      customCfgs: [],
      metasets: [],
      minima,
      finalSellRemainder: { artifacts: false, accessories: true, levels: [0, 4, 8, 12, 16], setsMode: FINAL_SELL_DEFAULT_SETS_MODE },
    })
    assert(merged.length === 10, 'Final Sell accessories: expected both coverage modes per milestone')
    const enabled = merged.filter(rule => rule.Use)
    assert(enabled.length === 5, 'Final Sell accessories: expected enabled rules per milestone')
    enabled.forEach((rule, index) => {
      assert(rule.ArtifactSet === undefined, `Final Sell accessories rule ${index} should omit explicit sets in Any mode`)
    })
    const explicitCoverage = merged.filter(rule => rule.__allKnownSets)
    assert(explicitCoverage.length === 5, 'Final Sell accessories: expected explicit coverage fallback per milestone')
    explicitCoverage.forEach((rule, index) => {
      const sets = Array.isArray(rule.ArtifactSet) ? rule.ArtifactSet.map(Number) : []
      assert(sets.includes(ACCESSORY_NO_SET_ID), `Final Sell explicit accessories rule ${index} is missing the no-set sentinel`)
      assert(rule.Use === false, 'Final Sell explicit coverage fallback should stay disabled when Any mode is selected')
    })
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

if (!(typeof process !== 'undefined' && process?.env?.HSFC_DUMP === '1')) {
  void run()
}
