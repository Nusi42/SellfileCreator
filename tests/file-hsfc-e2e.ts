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
import { buildHsfRules, defaultSubstatTargets, type BuilderConfig, type SubstatTargetTable } from '../src/lib/hsfBuilder.js'
import { ArtifactType, StatVariant } from '../src/lib/types.js'
import { normalizeConfig, buildReadableConfig, parseHsfcObject } from '../src/lib/hsfcIO.js'
import { computeMergedRules } from '../src/lib/merge.js'
import { ACCESSORY_NO_SET_ID } from '../src/lib/constants.js'
import { FINAL_SELL_DEFAULT_SETS_MODE } from '../src/lib/finalSell.js'

declare const process: any
declare const console: any

function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg) }

function stripRuleMetadata(rules: any[]): any[] {
  // Golden fixtures focus on structural rule data — config metadata is exercised via dedicated tests.
  return (rules || []).map((rule) => {
    const {
      __lineIdx: _lineIdx,
      __allKnownSets: _allKnownSets,
      __source: _source,
      ConfigID: _configId,
      ConfigName: _configName,
      ...rest
    } = rule ?? {}
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

      const parsed = parseHsfcObject(hsfc, { metasets: [], substatTargets: defaultSubstatTargets() })
      const merged = computeMergedRules({
        hsf: null,
        customCfgs: parsed.cfgs,
        metasets: parsed.metasets,
        substatTargets: parsed.substatTargets,
        finalSellRemainder: parsed.finalSellRemainder,
      })
      const built = stripRuleMetadata(merged)

      // Canonicalize both sides, then assert structural equality (no missing/extra members)
      const got = built
      const expected = expectedRaw
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
      name: '', keep: true, exportMode: 'active',
      rankCode: 0,
      rarityCode: 0, rarityMode: 'auto', autoRaritySupplementsThreshold: 'epic',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      earlyKeepMode: 'late',
      substatsV: [StatVariant.ACC], fixedSubstatsV: [], minCount: 0,
      autoMinCount: true, autoSubstatFlex: false, minRequiredRolls: 0, autoMinRequiredRolls: true,
      substatRollBoundsV: { [StatVariant.ACC]: { min: 1 } },
      artifactTypes: [], artifactSets: [], artifactMetaSets: [],
    }
    const out = buildReadableConfig(cfg as any, []) as any
    assert(Array.isArray(out.substats) && out.substats.length === 1, 'IO A: writer should emit structured substat entries')
    assert(out.substats?.[0]?.rollBounds?.min === 1, 'IO A: writer should store roll bounds on each entry')
    assert(!('fixedSubstats' in out), 'IO A: writer should omit legacy fixedSubstats field')
    assert(!('substatRollBounds' in out), 'IO A: writer should omit legacy roll bounds map')
    assert(out.autoRarityThreshold === 'epic', 'IO A: writer should include autoRarityThreshold when Auto+Late+active')
    const round = normalizeConfig({ ...out, Rarity: 'Auto' }) as any
    assert(round.autoRaritySupplementsThreshold === 'epic', 'IO A: reader should parse autoRarityThreshold when applicable')
  }
  // Scenario B: Auto + Early + active -> writer omits; reader drops
  {
    const cfg: BuilderConfig = {
      name: '', keep: true, exportMode: 'active',
      rankCode: 0,
      rarityCode: 0, rarityMode: 'auto', autoRaritySupplementsThreshold: 'uncommon',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      earlyKeepMode: 'early',
      substatsV: [StatVariant.ACC], fixedSubstatsV: [], minCount: 0,
      autoMinCount: true, autoSubstatFlex: false, minRequiredRolls: 0, autoMinRequiredRolls: true,
      substatRollBoundsV: { [StatVariant.ACC]: { min: 1 } },
      artifactTypes: [], artifactSets: [], artifactMetaSets: [],
    }
    const out = buildReadableConfig(cfg as any, []) as any
    assert(!('autoRarityThreshold' in out), 'IO B: writer should omit autoRarityThreshold when Early')
    const round = normalizeConfig({ ...out, Rarity: 'Auto', autoRarityThreshold: 'uncommon', earlyKeepMode: 'early' }) as any
    assert(!('autoRaritySupplementsThreshold' in round), 'IO B: reader should drop autoRaritySupplementsThreshold when Early')
  }
  // Scenario C: Code mode -> writer omits; reader drops
  {
    const cfg: BuilderConfig = {
      name: '', keep: true, exportMode: 'active',
      rankCode: 0,
      rarityCode: 8, rarityMode: 'code', autoRaritySupplementsThreshold: 'rare',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      earlyKeepMode: 'late',
      substatsV: [StatVariant.ACC], fixedSubstatsV: [], minCount: 0,
      autoMinCount: true, autoSubstatFlex: false, minRequiredRolls: 0, autoMinRequiredRolls: true,
      substatRollBoundsV: { [StatVariant.ACC]: { min: 1 } },
      artifactTypes: [], artifactSets: [], artifactMetaSets: [],
    }
    const out = buildReadableConfig(cfg as any, []) as any
    assert(!('autoRarityThreshold' in out), 'IO C: writer should omit autoRarityThreshold when rarityMode is code')
    const round = normalizeConfig({ ...out, Rarity: 'Rare', autoRarityThreshold: 'rare', earlyKeepMode: 'late' }) as any
    assert(!('autoRaritySupplementsThreshold' in round), 'IO C: reader should drop autoRaritySupplementsThreshold when rarityMode is code')
  }
  // Scenario D: Auto + Late but thresholds inactive -> writer omits; reader drops
  {
    const cfg: BuilderConfig = {
      name: '', keep: true, exportMode: 'active',
      rankCode: 0,
      rarityCode: 0, rarityMode: 'auto', autoRaritySupplementsThreshold: 'rare',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      earlyKeepMode: 'late',
      substatsV: [], fixedSubstatsV: [], minCount: 0,
      autoMinCount: true, autoSubstatFlex: false, minRequiredRolls: 0, autoMinRequiredRolls: true,
      substatRollBoundsV: {},
      artifactTypes: [], artifactSets: [], artifactMetaSets: [],
    }
    const out = buildReadableConfig(cfg as any, []) as any
    assert(!('autoRarityThreshold' in out), 'IO D: writer should omit autoRarityThreshold when thresholds are inactive')
    const round = normalizeConfig({ ...out, Rarity: 'Auto', autoRarityThreshold: 'rare' }) as any
    assert(!('autoRaritySupplementsThreshold' in round), 'IO D: reader should drop autoRaritySupplementsThreshold when thresholds are inactive')
  }
  // Scenario Legacy: reader upgrades legacy substats/fixed/bounds fields
  {
    const legacyReadable = {
      name: 'Legacy',
      keep: true,
      SellfileVisibility: 'Active',
      Rank: 'Any',
      Rarity: 'Any',
      Faction: 'Any',
      minLevel: 0,
      maxLevel: 16,
      minCount: 0,
      substats: ['ACC', 'SPD'],
      fixedSubstats: ['ACC'],
      substatRollBounds: {
        ACC: { min: 2 },
        SPD: { any: true },
      },
    }
    const round = normalizeConfig(legacyReadable) as BuilderConfig
    assert(round.substatsV?.length === 2, 'Legacy IO: reader should retain all selected substats')
    assert(round.fixedSubstatsV?.length === 1 && round.fixedSubstatsV[0] === StatVariant.ACC, 'Legacy IO: fixed substats should round-trip')
    assert(round.substatRollBoundsV?.[StatVariant.ACC]?.min === 2, 'Legacy IO: numeric bounds are preserved')
    assert(round.substatRollBoundsV?.[StatVariant.SPD]?.any === true, 'Legacy IO: wildcard bounds are preserved')
  }
  // Scenario E: Substat roll expectations serialize/deserialize
  {
    const cfg: BuilderConfig = {
      name: '', keep: true, exportMode: 'active',
      rankCode: 0,
      rarityCode: 0, rarityMode: 'code',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      earlyKeepMode: 'early',
      substatsV: [StatVariant.SPD], fixedSubstatsV: [], minCount: 0,
      autoMinCount: false, autoSubstatFlex: false, minRequiredRolls: 0, autoMinRequiredRolls: true,
      substatRollBoundsV: {},
      artifactTypes: [], artifactSets: [], artifactMetaSets: [],
      substatRollTargetsV: {
        [StatVariant.SPD]: {
          base: 12,
          increments: [18, null, 26],
        },
      },
    }
    const readable = buildReadableConfig(cfg as any, []) as any
    assert(readable.substatRollTargets?.SPD, 'IO E: writer should emit substatRollTargets map')
    assert(readable.substatRollTargets.SPD.base === 12, 'IO E: writer preserves target base')
    const round = normalizeConfig({
      ...readable,
      substats: ['SPD'],
      substatRollTargets: readable.substatRollTargets,
    }) as BuilderConfig
    const entry = round.substatRollTargetsV?.[StatVariant.SPD]
    assert(Boolean(entry && entry.base === 12), 'IO E: reader restores target base')
    assert(Boolean(entry?.increments && entry.increments.length === 3), 'IO E: reader restores increments array length')
    assert(entry?.increments?.[0] === 18, 'IO E: reader preserves explicit increment values')
    assert(entry?.increments?.[1] === null, 'IO E: reader preserves null increments as fallbacks')
  }
  // Scenario Draft: Draft configs act as dividers and emit no rules
  {
    const cfg: BuilderConfig = {
      name: 'Divider', keep: true, exportMode: 'separator',
      rankCode: 0,
      rarityCode: 0, rarityMode: 'auto',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      earlyKeepMode: 'early',
      substatsV: [], fixedSubstatsV: [], minCount: 0,
      autoMinCount: true, autoSubstatFlex: false, minRequiredRolls: 0, autoMinRequiredRolls: true,
      substatRollBoundsV: {},
      artifactTypes: [], artifactSets: [], artifactMetaSets: [],
    }
    const built = buildHsfRules(cfg, defaultSubstatTargets())
    assert(built.length === 0, 'IO Draft: draft configs must not emit HSF rows')
    const readable = buildReadableConfig(cfg, []) as any
    assert(readable.SellfileVisibility === 'Separator', 'IO Separator: writer should label separator export mode')
  }
  // Scenario E: Rank Any uses the configured substatTargets fallback star
  {
    const substatTargets = defaultSubstatTargets()
    substatTargets.anyRankDefaultsTo = 5
    substatTargets.five[StatVariant.SPD] = 57
    substatTargets.six[StatVariant.SPD] = 67

    const cfg: BuilderConfig = {
      name: '', keep: true, exportMode: 'active',
      rankCode: 0,
      rarityCode: 0, rarityMode: 'code',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      earlyKeepMode: 'early',
      substatsV: [StatVariant.SPD], fixedSubstatsV: [], minCount: 1,
      autoMinCount: false, autoSubstatFlex: false, minRequiredRolls: 0, autoMinRequiredRolls: true,
      substatRollBoundsV: {},
      artifactTypes: [], artifactSets: [], artifactMetaSets: [],
    }
    const built = buildHsfRules(cfg, substatTargets)
    const spdValues = built
      .flatMap(rule => rule.Substats)
      .filter(sub => sub && sub.ID === 4 && sub.IsFlat && !sub.NotAvailable)
      .map(sub => sub.Value)
    assert(spdValues.length > 0, 'IO E: expected SPD substatTargets in generated rules')
    assert(spdValues.every(v => v === substatTargets.five[StatVariant.SPD]), 'IO E: Any rank should pick the fallback star substatTargets')
  }
  // Scenario F: Factory minima collapse triggers only when targets match the factory roll floors
  {
    const cfg: BuilderConfig = {
      name: '', keep: true, exportMode: 'active',
      rankCode: 0,
      rarityCode: 0, rarityMode: 'auto',
      factionCode: 0,
      mainStatsV: [],
      minLevel: 0, maxLevel: 16,
      earlyKeepMode: 'early',
      substatsV: [StatVariant.HP, StatVariant.HP_FLAT, StatVariant.DEF, StatVariant.DEF_FLAT],
      fixedSubstatsV: [StatVariant.HP, StatVariant.HP_FLAT, StatVariant.DEF, StatVariant.DEF_FLAT],
      minCount: 4,
      autoMinCount: true, autoSubstatFlex: false,
      minRequiredRolls: 4, autoMinRequiredRolls: false,
      substatRollBoundsV: {
        [StatVariant.HP]: { any: true },
        [StatVariant.HP_FLAT]: { any: true },
        [StatVariant.DEF]: { any: true },
        [StatVariant.DEF_FLAT]: { any: true },
      },
      artifactTypes: [ArtifactType.Banner],
      artifactSets: [], artifactMetaSets: [],
    }
    const factoryTargets = defaultSubstatTargets()
    const collapsed = buildHsfRules(cfg, factoryTargets)
    assert(collapsed.length === 1, 'Factory minima should collapse banner quad rules to a single row')

    const boostedTargets = defaultSubstatTargets()
    const applyLegacyFlatMinima = (targets: SubstatTargetTable) => {
      targets.six[StatVariant.HP_FLAT] = 382
      targets.six[StatVariant.DEF_FLAT] = 22
      targets.five[StatVariant.HP_FLAT] = 293
      targets.five[StatVariant.DEF_FLAT] = 17
      targets.four[StatVariant.HP_FLAT] = 150
      targets.four[StatVariant.DEF_FLAT] = 11
      targets.three[StatVariant.HP_FLAT] = 140
      targets.three[StatVariant.DEF_FLAT] = 10
      targets.two[StatVariant.HP_FLAT] = 130
      targets.two[StatVariant.DEF_FLAT] = 9
      targets.one[StatVariant.HP_FLAT] = 120
      targets.one[StatVariant.DEF_FLAT] = 8
    }
    applyLegacyFlatMinima(boostedTargets)
    const expanded = buildHsfRules(cfg, boostedTargets)
    assert(expanded.length > 1, 'Boosted minima should emit expanded permutations instead of collapsing')
  }
  // Final Sell remainder rules must cover accessories without a set so the Rule Tester and exports match game behavior.
  {
    const substatTargets: SubstatTargetTable = { one: {}, two: {}, three: {}, four: {}, five: {}, six: {}, anyRankDefaultsTo: 6 }
    const merged = computeMergedRules({
      hsf: null,
      customCfgs: [],
      metasets: [],
      substatTargets,
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
