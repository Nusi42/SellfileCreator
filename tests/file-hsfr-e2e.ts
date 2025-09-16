/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable import/no-unused-modules */
// File-based HSFR → HSF end-to-end tests.
// Each case has two files in tests/fixtures/:
//  - <name>.hsfr  (input, human-readable HSFR)
//  - <name>.hsf   (expected HSF rules array)
//  The runner also accepts legacy suffixes .hsfr.json / .hsf.json for compatibility.
//
// Assertions:
// 1) Exact structural equality against expected after canonicalization
//    (stable ordering, no extra/missing members; array order-insensitive where applicable).
// 2) Optional pinpoint assertions: if a sibling <name>.assert.mjs exists and
//    exports a function validate(rules), it will be invoked.

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildHsfRules, type BuilderConfig } from '../src/lib/hsfBuilder.js'
import { StatVariant } from '../src/lib/types.js'
import { normalizeConfig, buildReadableConfig } from '../src/lib/hsfrIO.js'

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

async function run(): Promise<void> {
  const here = fileURLToPath(import.meta.url)
  // Compiled path: scripts/.tmp/tests/file-hsfr-e2e.js -> go up four to project root
  const fixturesDir = resolve(here, '..', '..', '..', '..', 'tests', 'fixtures')
  const entries = readdirSync(fixturesDir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map(d => d.name)
  const hsfrFiles = entries.filter(n => n.endsWith('.hsfr') || n.endsWith('.hsfr.json'))
  const hsfFiles = entries.filter(n => n.endsWith('.hsf') || n.endsWith('.hsf.json'))
  const baseOf = (n: string) => n.replace(/\.(hsfr|hsf)(\.json)?$/, '')
  const hsfrBases = new Set(hsfrFiles.map(baseOf))
  const hsfBases = new Set(hsfFiles.map(baseOf))
  // Pairing check: every HSFR must have corresponding HSF and vice versa.
  const missingHsf: string[] = []
  const missingHsfr: string[] = []
  for (const b of hsfrBases) if (!hsfBases.has(b)) missingHsf.push(b)
  for (const b of hsfBases) if (!hsfrBases.has(b)) missingHsfr.push(b)
  if (missingHsf.length || missingHsfr.length) {
    const lines: string[] = []
    if (missingHsf.length) lines.push(`Missing .hsf for: ${missingHsf.join(', ')}`)
    if (missingHsfr.length) lines.push(`Missing .hsfr for: ${missingHsfr.join(', ')}`)
    throw new Error(`Fixture pairing error.\n${lines.join('\n')}`)
  }
  const files = hsfrFiles

  let passed = 0
  let failed = 0
  const cases: Array<{ base: string; hsfrPath: string; hsfPath: string }> = []
  for (const f of files) {
    const base = f.replace(/\.hsfr(\.json)?$/, '')
    const hsfrPath = resolve(fixturesDir, f)
    const hasHsf = hsfFiles.includes(`${base}.hsf`)
    const hsfPath = resolve(fixturesDir, hasHsf ? `${base}.hsf` : `${base}.hsf.json`)
    cases.push({ base, hsfrPath, hsfPath })
  }
  for (const c of cases) {
    try {
      const hsfr = JSON.parse(readFileSync(c.hsfrPath, 'utf8'))
      const expectedRaw = JSON.parse(readFileSync(c.hsfPath, 'utf8'))
      assert(Array.isArray(expectedRaw), `${c.base}: expected HSF file to be a JSON array`)

      const cfg = normalizeConfig(hsfr)
      const built = buildHsfRules(cfg)

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
      name: '', keep: true, enabled: true,
      rankCode: 0,
      rarityCode: 0, rarityMode: 'auto', autoRaritySupplementsThreshold: 'epic',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      startLevel: 0, rollBaseline: 'afterStart', rollMode: 'auto', earlyKeepMode: 'late',
      substatsV: [StatVariant.ACC], fixedSubstatsV: [], minCount: 0,
      autoMinCount: true, minRequiredRolls: 0, autoMinRequiredRolls: true,
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
      name: '', keep: true, enabled: true,
      rankCode: 0,
      rarityCode: 0, rarityMode: 'auto', autoRaritySupplementsThreshold: 'uncommon',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      startLevel: 0, rollBaseline: 'afterStart', rollMode: 'auto', earlyKeepMode: 'early',
      substatsV: [StatVariant.ACC], fixedSubstatsV: [], minCount: 0,
      autoMinCount: true, minRequiredRolls: 0, autoMinRequiredRolls: true,
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
      name: '', keep: true, enabled: true,
      rankCode: 0,
      rarityCode: 8, rarityMode: 'code', autoRaritySupplementsThreshold: 'rare',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      startLevel: 0, rollBaseline: 'afterStart', rollMode: 'auto', earlyKeepMode: 'late',
      substatsV: [StatVariant.ACC], fixedSubstatsV: [], minCount: 0,
      autoMinCount: true, minRequiredRolls: 0, autoMinRequiredRolls: true,
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
      name: '', keep: true, enabled: true,
      rankCode: 0,
      rarityCode: 0, rarityMode: 'auto', autoRaritySupplementsThreshold: 'rare',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      startLevel: 0, rollBaseline: 'afterStart', rollMode: 'auto', earlyKeepMode: 'late',
      substatsV: [], fixedSubstatsV: [], minCount: 0,
      autoMinCount: true, minRequiredRolls: 0, autoMinRequiredRolls: true,
      substatRollBoundsV: {},
      artifactTypes: [], artifactSets: [], artifactMetaSets: [], substatMinTarget: 'selected',
    }
    const out = buildReadableConfig(cfg as any, []) as any
    assert(!('autoRarityThreshold' in out), 'IO D: writer should omit autoRarityThreshold when thresholds are inactive')
    const round = normalizeConfig({ ...out, Rarity: 'Auto', autoRarityThreshold: 'rare' }) as any
    assert(!('autoRaritySupplementsThreshold' in round), 'IO D: reader should drop autoRaritySupplementsThreshold when thresholds are inactive')
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

void run()
