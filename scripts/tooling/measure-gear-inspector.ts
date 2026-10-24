#!/usr/bin/env node
/**
 * measure-gear-inspector.ts
 *
 * CLI utility to profile the Gear Inspector matching pipeline against a concrete
 * SFC + gear database pairing. Loads the SFC definition, imports the DB,
 * runs the same matching logic used in the UI, and prints timing stats for
 * the base matcher, Safeguard detection, and the post-detection matcher.
 */
import { resolve as resolvePath } from 'node:path'
import { performance } from 'node:perf_hooks'
import type { ParsedSfcResult } from '../../src/lib/sfcIO.js'
import { type BuilderRecipe, type SellfileExportMode, type SubstatTargetTable } from '../../src/lib/hsfBuilder.js'
import {
  computeMergedRules,
  RULE_SOURCE_SAFEGUARDS,
  buildSafeguardRules,
  type HsfRuleWithRecipe,
} from '../../src/lib/merge.js'
import { dedupeHsfRulesForExportWithLoadedWasm } from '../../src/lib/wasm/wasmRuleEngine.js'
import {
  collectSafeguardCandidates,
  computeSafeguardProtection,
  resolveSafeguardRuleLabel,
  resolveSafeguardRulesWithMetasets,
  type SafeguardRule,
  type SafeguardDetectionSnapshot,
} from '../../src/lib/safeguards.js'
import type { NormalizedGearArtifact } from '../../src/lib/importers/gearDbNormalizer.js'
import { evaluateMatchesByRecipe } from '../../src/lib/ruleEval.js'
import type { EvalResult } from '../../src/lib/ruleEval.js'
import type { GearInspectorPreviewMatch, GearInspectorPreviewRow } from '../../src/types/gearInspectorPreview.js'
// Final Sell config stays centralized in Logic Hub so tooling mirrors UI + IO types.
import type { FinalSellRemainderConfig } from '../../src/lib/logicHub.js'
// Node shims + SFC/DB loaders shared by every headless tooling script.
import { loadGear, loadSfc, prepareHeadlessRuleEngine } from './lib/headless-pipeline.js'
// Committed gear-DB fixtures, built on demand into tmp/fixtures/gear-db/.
import { GEAR_DB_FIXTURES, ensureGearDb } from '../../scripts/test/gear-db-fixtures.mjs'

type ScenarioInput = {
  sfcPath: string
  gearDbPath: string
}

// Raw CLI input: the gear DB stays null until --db names one, so the default fixture is
// only built when it is actually used.
type ScenarioArgs = {
  sfcPath: string
  gearDbPath: string | null
}

type ScenarioData = {
  recipes: BuilderRecipe[]
  metasets: ParsedSfcResult['metasets']
  substatTargets: SubstatTargetTable
  safeguardRules: SafeguardRule[]
  safeguardsEnabled: boolean
  // null when the SFC carries no Final Sell key (the merge treats absent as "none").
  finalSellRemainder: FinalSellRemainderConfig | null
  recipeModes: SellfileExportMode[]
  gear: NormalizedGearArtifact[]
}

type MatchPhaseResult = {
  rows: GearInspectorPreviewRow[]
  durationMs: number
  kept: number
  sold: number
}

// Default pairing mirrors the user-reported heavy scenario: the late-game preset against
// the large-roster fixture (account-d) when no --db is given.
const DEFAULT_SCENARIO: ScenarioArgs = {
  sfcPath: 'presets/lategame.sfc',
  gearDbPath: null,
}

const formatMs = (value: number): string => `${value.toFixed(1)} ms`

const formatPerItem = (durationMs: number, count: number): string => {
  if (count <= 0) return 'n/a'
  return `${(durationMs / count).toFixed(3)} ms/item`
}

// Support --sfc/--db overrides so perf runs can target arbitrary fixtures.
const parseArgs = (): ScenarioInput => {
  const args = process.argv.slice(2)
  const result: ScenarioArgs = { ...DEFAULT_SCENARIO }
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (!arg) continue
    const [key, maybeValue] = arg.includes('=')
      ? arg.split('=')
      : [arg, undefined]
    const nextValue = maybeValue ?? args[i + 1]
    const consumeNext = maybeValue === undefined
    const assignPath = (target: 'sfcPath' | 'gearDbPath') => {
      if (!nextValue) {
        throw new Error(`Missing value for ${key}`)
      }
      result[target] = nextValue
      if (consumeNext) i += 1
    }
    if (key === '--sfc') {
      assignPath('sfcPath')
      continue
    }
    if (key === '--db' || key === '--gear-db') {
      assignPath('gearDbPath')
      continue
    }
  }
  return {
    sfcPath: resolvePath(process.cwd(), result.sfcPath),
    gearDbPath: result.gearDbPath === null
      ? ensureGearDb(GEAR_DB_FIXTURES.accountD)
      : resolvePath(process.cwd(), result.gearDbPath),
  }
}

// Resolve SFC + gear data into the inputs we need for matching.
const buildScenario = async (input: ScenarioInput): Promise<ScenarioData> => {
  const sfc = await loadSfc(input.sfcPath)
  const gear = await loadGear(input.gearDbPath)
  const recipeModes = sfc.recipes.map((recipe) => recipe.exportMode)
  return {
    recipes: sfc.recipes,
    metasets: sfc.metasets,
    substatTargets: sfc.substatTargets,
    // Absent keys read as the app's load-time defaults: no rules, safeguards on.
    safeguardRules: sfc.safeguardRules ?? [],
    safeguardsEnabled: sfc.safeguardsEnabled ?? true,
    finalSellRemainder: sfc.finalSellRemainder,
    recipeModes,
    gear,
  }
}

// Run the core matcher (evaluateMatchesByRecipe) against every artifact and
// capture the same per-row metadata the UI stores in gearInspectorPreviewRows.
const evaluateArtifacts = (
  artifacts: readonly NormalizedGearArtifact[],
  rules: readonly HsfRuleWithRecipe[],
  recipeModes: readonly SellfileExportMode[],
): MatchPhaseResult => {
  const rows: GearInspectorPreviewRow[] = []
  const startedAt = performance.now()
  let kept = 0
  const toTesterMatch = (result: EvalResult | null): GearInspectorPreviewMatch | null => {
    if (!result) return null
    const rule = rules[result.ruleIndex] ?? null
    const safeguardLabel = rule?.__source === RULE_SOURCE_SAFEGUARDS
      ? resolveSafeguardRuleLabel(rule)
      : null
    return {
      keep: result.keep,
      recipeIdx: result.recipeIdx ?? null,
      recipeName: safeguardLabel ?? null,
      ruleIndex: result.ruleIndex ?? null,
      ruleLabel: safeguardLabel ?? null,
      ruleSource: rule?.__source ?? null,
      // Presentation-only fields (chip colours, legacy id, ordinal) — a timing run never renders
      // them, so they stay null rather than replicating the UI's appearance lookups here.
      recipeFgColor: null,
      ruleLabelFgColor: null,
      safeguardRuleId: null,
      safeguardRuleOrdinal: rule?.__safeguardRuleOrdinal ?? null,
    }
  }
  for (const artifact of artifacts) {
    const {
      firstMatch,
      firstNonExcludedMatch,
      matchingRecipeIndices,
      matchingRecipeDecisions,
    } = evaluateMatchesByRecipe(
      rules as HsfRuleWithRecipe[],
      artifact.gearInspectorItem,
      {
        recipeModes: recipeModes as SellfileExportMode[],
        excludeSources: [RULE_SOURCE_SAFEGUARDS],
      },
    )
    const match = toTesterMatch(firstMatch)
    const baseMatch = toTesterMatch(firstNonExcludedMatch)
    if (match?.keep) kept += 1
    rows.push({
      artifact,
      match,
      baseMatch,
      matchingRecipeIndices,
      matchingRecipeDecisions,
    })
  }
  const durationMs = performance.now() - startedAt
  return { rows, durationMs, kept, sold: artifacts.length - kept }
}

// Recreate the Safeguard detection flow and return its timing stats.
const measureSafeguards = (
  rows: readonly GearInspectorPreviewRow[],
  baseRules: readonly HsfRuleWithRecipe[],
  safeguardRules: readonly SafeguardRule[],
  safeguardsEnabled: boolean,
  recipeModes: readonly SellfileExportMode[],
): {
  detection: SafeguardDetectionSnapshot
  candidateMs: number
  detectionMs: number
  safeguardRuleCount: number
} => {
  const candidateStartedAt = performance.now()
  const candidates = collectSafeguardCandidates({
    rows,
    baseRules,
    recipeModes: recipeModes as SellfileExportMode[],
  })
  const candidateMs = performance.now() - candidateStartedAt
  const detectionStartedAt = performance.now()
  const detection = computeSafeguardProtection({
    candidates: candidates.candidates,
    rules: safeguardRules,
    enabled: safeguardsEnabled,
  })
  const detectionMs = performance.now() - detectionStartedAt

  const candidateSafeguardRules = buildSafeguardRules(safeguardRules, detection)

  // Mirror export-time keep-rule dedupe so perf output stays aligned with app behavior. The
  // dedupe lives in wasm; the engine is warmed before any scenario runs, so a null (engine not
  // loaded) cannot happen here and is treated as "nothing collapsed".
  const baseKeepRules = baseRules.filter((rule) => rule.Keep === true)
  // Dedupe baseline keep rules first in case upstream sources already overlap.
  const dedupedBaseKeepRules = dedupeHsfRulesForExportWithLoadedWasm(baseKeepRules) ?? baseKeepRules
  // Dedupe with safeguard candidates appended; delta equals net injected keeps.
  const mergedKeepRules = [...baseKeepRules, ...candidateSafeguardRules]
  const dedupedMergedKeepRules = dedupeHsfRulesForExportWithLoadedWasm(mergedKeepRules) ?? mergedKeepRules
  const safeguardRuleCount = Math.max(0, dedupedMergedKeepRules.length - dedupedBaseKeepRules.length)

  return {
    detection,
    candidateMs,
    detectionMs,
    safeguardRuleCount,
  }
}

// Pretty-printer for matcher timing stats.
const summarize = (label: string, phase: MatchPhaseResult): void => {
  console.log(`  ${label}: ${formatMs(phase.durationMs)} (${formatPerItem(phase.durationMs, phase.rows.length)})`)
  console.log(`    kept=${phase.kept} sold=${phase.sold}`)
}

const main = async (): Promise<void> => {
  // Tooling runs sync builder/matcher helpers directly, so warm wasm first (fetch shim,
  // bindings sync, module preload — in that order).
  await prepareHeadlessRuleEngine()
  const input = parseArgs()
  console.log('Rule Tester measurement')
  console.log(`  SFC: ${input.sfcPath}`)
  console.log(`  Gear DB: ${input.gearDbPath}`)
  const scenario = await buildScenario(input)
  const resolvedSafeguardRules = resolveSafeguardRulesWithMetasets(
    scenario.safeguardRules,
    scenario.metasets,
  )
  const mergedBaseRules = computeMergedRules({
    hsf: null,
    customRecipes: scenario.recipes,
    metasets: scenario.metasets,
    substatTargets: scenario.substatTargets,
    // Omitted rather than passed as null: the param is optional, not nullable.
    ...(scenario.finalSellRemainder ? { finalSellRemainder: scenario.finalSellRemainder } : {}),
    safeguards: {
      enabled: scenario.safeguardsEnabled,
      rules: resolvedSafeguardRules,
      detection: null,
    },
  })
  console.log(`  Recipes: ${scenario.recipes.length}`)
  console.log(`  Resolved Safeguard rules: ${resolvedSafeguardRules.length} (enabled=${scenario.safeguardsEnabled})`)
  console.log(`  Imported gear items: ${scenario.gear.length}`)
  console.log(`  Base rule count: ${mergedBaseRules.length}`)

  const basePhase = evaluateArtifacts(scenario.gear, mergedBaseRules, scenario.recipeModes)
  summarize('Base matcher', basePhase)

  if (!scenario.safeguardsEnabled || resolvedSafeguardRules.length === 0) {
    return
  }

  const safeguardBaseRules = mergedBaseRules.filter((rule) => rule.__source !== RULE_SOURCE_SAFEGUARDS)
  const safeguardMeasurements = measureSafeguards(
    basePhase.rows,
    safeguardBaseRules,
    resolvedSafeguardRules,
    scenario.safeguardsEnabled,
    scenario.recipeModes,
  )
  console.log(`  Safeguard candidate scan: ${formatMs(safeguardMeasurements.candidateMs)}`)
  console.log(`  Safeguard detection: ${formatMs(safeguardMeasurements.detectionMs)}`)
  console.log(`  Deduplicated Safeguard rules emitted: ${safeguardMeasurements.safeguardRuleCount}`)

  const mergedWithSafeguards = computeMergedRules({
    hsf: null,
    customRecipes: scenario.recipes,
    metasets: scenario.metasets,
    substatTargets: scenario.substatTargets,
    ...(scenario.finalSellRemainder ? { finalSellRemainder: scenario.finalSellRemainder } : {}),
    safeguards: {
      enabled: scenario.safeguardsEnabled,
      rules: resolvedSafeguardRules,
      detection: safeguardMeasurements.detection,
    },
  })
  console.log(`  Post-Safeguard rule count: ${mergedWithSafeguards.length}`)
  const keepPhase = evaluateArtifacts(scenario.gear, mergedWithSafeguards, scenario.recipeModes)
  summarize('Post-Safeguard matcher', keepPhase)
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
