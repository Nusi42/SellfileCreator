/* eslint-disable @typescript-eslint/no-explicit-any */
// File-based recipe bundle (.sfc / legacy .sfr / .hsfc) → HSF end-to-end tests.
// Each case has two files in tests/fixtures/:
//  - <name>.sfc   (input, human-readable recipe payload)
//  - <name>.hsf   (expected HSF rules array)
//  The runner also accepts legacy suffixes .sfr / .sfr.json / .hsfc / .hsfc.json / .hsf.json for compatibility.
//
// Assertions:
// 1) Exact structural equality against expected after canonicalization
//    (stable ordering, no extra/missing members; array order-insensitive where applicable).
// 2) Optional pinpoint assertions: if a sibling <name>.assert.mjs exists and
//    exports a function validate(rules), it will be invoked.

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildHsfRules, defaultSubstatTargets, type BuilderRecipe, type SubstatTargetTable } from '../../src/lib/hsfBuilder.js'
import { ArtifactType, StatVariant } from '../../src/lib/types.js'
import { normalizeRecipe, buildReadableRecipe, parseSfcObject } from '../../src/lib/sfcIO.js'
import { computeMergedRules } from '../../src/lib/merge.js'
import { ACCESSORY_NO_SET_ID } from '../../src/lib/constants.js'
import { FINAL_SELL_DEFAULT_SETS_MODE, FINAL_SELL_SETS_MODE_ANY } from '../../src/lib/logicHub.js'
import { cleanHsfForExport } from '../../src/lib/hsfIO.js'
import '../setup/wasm-warmup.js'

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
      RecipeID: _configId,
      RecipeName: _configName,
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

// Resolve fixtures from the repo root so compiled output can move freely.
const ROOT_DIR = process.cwd()
const FIXTURES_DIR = resolve(ROOT_DIR, 'tests', 'fixtures')

type FixtureCase = { base: string; sfcPath: string; hsfPath: string }
type FixturePrep = { fixturesDir: string; cases: FixtureCase[] }

function prepareFixtures(): FixturePrep {
  const entries = readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map(d => d.name)
  const sfcFiles = entries.filter(n => (
    n.endsWith('.sfc')
    || n.endsWith('.sfc.json')
    || n.endsWith('.sfr')       // legacy extension
    || n.endsWith('.sfr.json')
    || n.endsWith('.hsfc')
    || n.endsWith('.hsfc.json')
  ))
  const hsfFiles = entries.filter(n => n.endsWith('.hsf') || n.endsWith('.hsf.json'))
  const baseOf = (n: string) => n.replace(/\.(sfc|sfr|hsfc|hsf)(\.json)?$/, '')
  const sfcBases = new Set(sfcFiles.map(baseOf))
  const hsfBases = new Set(hsfFiles.map(baseOf))
  const missingHsf: string[] = []
  const missingSfc: string[] = []
  for (const b of sfcBases) if (!hsfBases.has(b)) missingHsf.push(b)
  for (const b of hsfBases) if (!sfcBases.has(b)) missingSfc.push(b)
  if (missingHsf.length || missingSfc.length) {
    const lines: string[] = []
    if (missingHsf.length) lines.push(`Missing .hsf for: ${missingHsf.join(', ')}`)
    if (missingSfc.length) lines.push(`Missing .sfc/.sfr/.hsfc for: ${missingSfc.join(', ')}`)
    throw new Error(`Fixture pairing error.\n${lines.join('\n')}`)
  }
  const cases: FixtureCase[] = sfcFiles.map((f) => {
    const base = f.replace(/\.(sfc|sfr|hsfc)(\.json)?$/, '')
    const sfcPath = resolve(FIXTURES_DIR, f)
    const hasHsf = hsfFiles.includes(`${base}.hsf`)
    const hsfPath = resolve(FIXTURES_DIR, hasHsf ? `${base}.hsf` : `${base}.hsf.json`)
    return { base, sfcPath, hsfPath }
  })
  return { fixturesDir: FIXTURES_DIR, cases }
}

const PREPARED_FIXTURES: FixturePrep = prepareFixtures()

export const CASES: ReadonlyArray<{ name: string; sfc: Record<string, unknown> }> = Object.freeze(
  PREPARED_FIXTURES.cases.map(({ base, sfcPath }) => ({
    name: base,
    sfc: JSON.parse(readFileSync(sfcPath, 'utf8')) as Record<string, unknown>,
  }))
);

async function run(prep: FixturePrep = PREPARED_FIXTURES): Promise<void> {
  const { fixturesDir, cases } = prep
  let passed = 0
  let failed = 0
  for (const c of cases) {
    try {
      const sfc = JSON.parse(readFileSync(c.sfcPath, 'utf8'))
      const expectedRaw = JSON.parse(readFileSync(c.hsfPath, 'utf8'))
      assert(Array.isArray(expectedRaw), `${c.base}: expected HSF file to be a JSON array`)

      const parsed = parseSfcObject(sfc, { metasets: [], substatTargets: defaultSubstatTargets() })
      const merged = computeMergedRules({
        hsf: null,
        customRecipes: parsed.recipes,
        metasets: parsed.metasets,
        substatTargets: parsed.substatTargets,
        ...(parsed.finalSellRemainder !== null ? { finalSellRemainder: parsed.finalSellRemainder } : {}),
      })
      // Mirror the export pipeline so comparisons include RowIdx + sanitized field ordering.
      const exported = cleanHsfForExport(merged)
      const built = stripRuleMetadata(exported.Rules)

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
    const cfg: BuilderRecipe = {
      keep: true, exportMode: 'active',
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
    const out = buildReadableRecipe(cfg as any, []) as any
    assert(Array.isArray(out.substats) && out.substats.length === 1, 'IO A: writer should emit structured substat entries')
    assert(out.substats?.[0]?.rollBounds?.min === 1, 'IO A: writer should store roll bounds on each entry')
    assert(!('fixedSubstats' in out), 'IO A: writer should omit legacy fixedSubstats field')
    assert(!('substatRollBounds' in out), 'IO A: writer should omit legacy roll bounds map')
    assert(out.autoRarityThreshold === 'epic', 'IO A: writer should include autoRarityThreshold when Auto+Late+active')
    const round = normalizeRecipe({ ...out, Rarity: 'Auto' }) as any
    assert(round.autoRaritySupplementsThreshold === 'epic', 'IO A: reader should parse autoRarityThreshold when applicable')
  }
  // Scenario B: Auto + Early + active -> writer omits; reader drops
  {
    const cfg: BuilderRecipe = {
      keep: true, exportMode: 'active',
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
    const out = buildReadableRecipe(cfg as any, []) as any
    assert(!('autoRarityThreshold' in out), 'IO B: writer should omit autoRarityThreshold when Early')
    const round = normalizeRecipe({ ...out, Rarity: 'Auto', autoRarityThreshold: 'uncommon', earlyKeepMode: 'early' }) as any
    assert(!('autoRaritySupplementsThreshold' in round), 'IO B: reader should drop autoRaritySupplementsThreshold when Early')
  }
  // Scenario C: Code mode -> writer omits; reader drops
  {
    const cfg: BuilderRecipe = {
      keep: true, exportMode: 'active',
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
    const out = buildReadableRecipe(cfg as any, []) as any
    assert(!('autoRarityThreshold' in out), 'IO C: writer should omit autoRarityThreshold when rarityMode is code')
    const round = normalizeRecipe({ ...out, Rarity: 'Rare', autoRarityThreshold: 'rare', earlyKeepMode: 'late' }) as any
    assert(!('autoRaritySupplementsThreshold' in round), 'IO C: reader should drop autoRaritySupplementsThreshold when rarityMode is code')
  }
  // Scenario D: Auto + Late but thresholds inactive -> writer omits; reader drops
  {
    const cfg: BuilderRecipe = {
      keep: true, exportMode: 'active',
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
    const out = buildReadableRecipe(cfg as any, []) as any
    assert(!('autoRarityThreshold' in out), 'IO D: writer should omit autoRarityThreshold when thresholds are inactive')
    const round = normalizeRecipe({ ...out, Rarity: 'Auto', autoRarityThreshold: 'rare' }) as any
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
    const round = normalizeRecipe(legacyReadable) as BuilderRecipe
    assert(round.substatsV?.length === 2, 'Legacy IO: reader should retain all selected substats')
    assert(round.fixedSubstatsV?.length === 1 && round.fixedSubstatsV[0] === StatVariant.ACC, 'Legacy IO: fixed substats should round-trip')
    assert(round.substatRollBoundsV?.[StatVariant.ACC]?.min === 2, 'Legacy IO: numeric bounds are preserved')
    assert(round.substatRollBoundsV?.[StatVariant.SPD]?.any === true, 'Legacy IO: wildcard bounds are preserved')
  }
  // Scenario E: Substat roll expectations serialize/deserialize
  {
    const cfg: BuilderRecipe = {
      keep: true, exportMode: 'active',
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
    const readable = buildReadableRecipe(cfg as any, []) as any
    assert(readable.substatRollTargets?.SPD, 'IO E: writer should emit substatRollTargets map')
    assert(readable.substatRollTargets.SPD.base === 12, 'IO E: writer preserves target base')
    const round = normalizeRecipe({
      ...readable,
      substats: ['SPD'],
      substatRollTargets: readable.substatRollTargets,
    }) as BuilderRecipe
    const entry = round.substatRollTargetsV?.[StatVariant.SPD]
    assert(Boolean(entry && entry.base === 12), 'IO E: reader restores target base')
    assert(Boolean(entry?.increments && entry.increments.length === 3), 'IO E: reader restores increments array length')
    assert(entry?.increments?.[0] === 18, 'IO E: reader preserves explicit increment values')
    assert(entry?.increments?.[1] === null, 'IO E: reader preserves null increments as fallbacks')
  }
  // Scenario Draft: Draft recipes act as dividers and emit no rules
  {
    const cfg: BuilderRecipe = {
      appearance: { name: 'Divider' }, keep: true, exportMode: 'separator',
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
    assert(built.length === 0, 'IO Draft: draft recipes must not emit HSF rows')
    const readable = buildReadableRecipe(cfg, []) as any
    // Unified separator format: the boolean marker flag (legacy files used
    // SellfileVisibility='Separator'; the writer no longer emits that label).
    assert(readable.Separator === true, 'IO Separator: writer should mark separator entries')
    assert(readable.SellfileVisibility === undefined, 'IO Separator: legacy visibility label must not be written')
  }
  // Scenario E: Rank Any uses the configured substatTargets fallback star
  {
    const substatTargets = defaultSubstatTargets()
    substatTargets.anyRankDefaultsTo = 5
    substatTargets.five[StatVariant.SPD] = 57
    substatTargets.six[StatVariant.SPD] = 67

    const cfg: BuilderRecipe = {
      keep: true, exportMode: 'active',
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
    const cfg: BuilderRecipe = {
      keep: true, exportMode: 'active',
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
  // Final Sell remainder emits only the selected mode's rules (one rule per milestone, all enabled).
  // Default mode is explicit, so rules carry ArtifactSet lists including the no-set sentinel.
  {
    const substatTargets: SubstatTargetTable = { one: {}, two: {}, three: {}, four: {}, five: {}, six: {}, anyRankDefaultsTo: 6 }
    const merged = computeMergedRules({
      hsf: null,
      customRecipes: [],
      metasets: [],
      substatTargets,
      finalSellRemainder: { artifacts: false, accessories: true, levels: [0, 4, 8, 12, 16], setsMode: FINAL_SELL_DEFAULT_SETS_MODE },
    })
    // One rule per selected milestone — inactive mode no longer emits disabled rows.
    assert(merged.length === 5, 'Final Sell accessories: expected one rule per milestone (single active mode)')
    merged.forEach((rule, index) => {
      assert(rule.Use === true, `Final Sell accessories rule ${index} should be enabled`)
    })
    // Default is explicit, so every rule carries an ArtifactSet list with the no-set sentinel.
    const explicitCoverage = merged.filter(rule => rule.__allKnownSets)
    assert(explicitCoverage.length === 5, 'Final Sell accessories: all rules should be explicit-coverage rows in default explicit mode')
    explicitCoverage.forEach((rule, index) => {
      const sets = Array.isArray(rule.ArtifactSet) ? rule.ArtifactSet.map(Number) : []
      assert(sets.includes(ACCESSORY_NO_SET_ID), `Final Sell explicit accessories rule ${index} is missing the no-set sentinel`)
    })
    // Verify any-mode emits no ArtifactSet and no disabled rows.
    const anyMerged = computeMergedRules({
      hsf: null,
      customRecipes: [],
      metasets: [],
      substatTargets,
      finalSellRemainder: { artifacts: false, accessories: true, levels: [0, 4, 8, 12, 16], setsMode: FINAL_SELL_SETS_MODE_ANY },
    })
    assert(anyMerged.length === 5, 'Final Sell accessories (any mode): expected one rule per milestone')
    anyMerged.forEach((rule, index) => {
      assert(rule.Use === true, `Final Sell accessories any-mode rule ${index} should be enabled`)
      assert(rule.ArtifactSet === undefined, `Final Sell accessories any-mode rule ${index} should omit explicit sets`)
    })
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

if (!(typeof process !== 'undefined' && process?.env?.SFC_DUMP === '1')) {
  void run()
}
