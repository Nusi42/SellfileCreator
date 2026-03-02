#!/usr/bin/env node
/**
 * measure-gear-inspector.ts
 *
 * CLI utility to profile the Gear Inspector matching pipeline against a concrete
 * SFR + gear database pairing. Loads the SFR definition, imports the DB,
 * runs the same matching logic used in the UI, and prints timing stats for
 * the base matcher, Safeguard detection, and the post-detection matcher.
 */
import { cp, mkdir, readFile } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'
import { performance } from 'node:perf_hooks'
import { parseSfrObject } from '../../src/lib/sfrIO.js'
import { defaultSubstatTargets, type BuilderRecipe, type SellfileExportMode, type SubstatTargetTable } from '../../src/lib/hsfBuilder.js'
import {
  computeMergedRules,
  RULE_SOURCE_SAFEGUARDS,
  buildSafeguardRules,
  type HsfRuleWithRecipe,
} from '../../src/lib/merge.js'
import { dedupeHsfRulesForExport } from '../../src/lib/hsfDeduplicate.js'
import {
  collectSafeguardCandidates,
  computeSafeguardProtection,
  resolveSafeguardRuleLabel,
  resolveSafeguardRulesWithMetasets,
  type SafeguardRule,
  type SafeguardDetectionSnapshot,
} from '../../src/lib/safeguards.js'
import { importGearDatabaseFromArrayBuffer, type GearDbImportResult } from '../../src/lib/importers/gearDbImporter.js'
import type { NormalizedGearArtifact } from '../../src/lib/importers/gearDbNormalizer.js'
import { evaluateMatchesByRecipe } from '../../src/lib/ruleEval.js'
import type { EvalResult } from '../../src/lib/ruleEval.js'
import type { GearInspectorPreviewMatch, GearInspectorPreviewRow } from '../../src/types/gearInspectorPreview.js'
// Final Sell config stays centralized in Logic Hub so tooling mirrors UI + IO types.
import type { FinalSellRemainderConfig } from '../../src/lib/logicHub.js'
import { warmupWasmRuleEngine } from '../../src/lib/wasm/wasmRuleEngine.js'

type ScenarioInput = {
  sfrPath: string
  gearDbPath: string
}

type ScenarioData = {
  recipes: BuilderRecipe[]
  metasets: ReturnType<typeof parseSfrObject>['metasets']
  substatTargets: SubstatTargetTable
  safeguardRules: SafeguardRule[]
  safeguardsEnabled: boolean
  finalSellRemainder: FinalSellRemainderConfig
  recipeModes: SellfileExportMode[]
  gear: NormalizedGearArtifact[]
}

type MatchPhaseResult = {
  rows: GearInspectorPreviewRow[]
  durationMs: number
  kept: number
  sold: number
}

const installNodeFileFetch = async (): Promise<void> => {
  // Keep Node's original fetch so non-file URLs keep default behavior.
  const originalFetch = globalThis.fetch
  // Older runtimes may not expose fetch; skip the shim in that case.
  if (typeof originalFetch !== 'function') return
  // Replace fetch so wasm-bindgen file:// loads resolve during CLI runs.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Normalize Request|string|URL into a raw URL string once.
    const url = typeof input === 'string'
      ? input
      : (input instanceof URL ? input.href : input.url)
    // Intercept local wasm URLs and materialize a synthetic HTTP-like response.
    if (url.startsWith('file://')) {
      // Read raw bytes from disk so WebAssembly.instantiate receives binary data.
      const { readFile } = await import('node:fs/promises')
      const bytes = await readFile(new URL(url))
      // Return the binary with the wasm MIME type expected by the loader.
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: { 'content-type': 'application/wasm' },
      })
    }
    // Delegate all non-file traffic to the original implementation.
    return originalFetch(input, init)
  }) as typeof fetch
}

// Script builds run from tmp/tsc/scripts, so keep generated wasm artifacts in sync
// with src/lib/wasm/generated before we import and warm the module.
const syncCompiledWasmBindings = async (): Promise<void> => {
  // Resolve absolute paths so this helper is insensitive to caller cwd changes.
  const root = process.cwd()
  const sourceDir = resolvePath(root, 'src/lib/wasm/generated')
  const targetDir = resolvePath(root, 'tmp/tsc/scripts/src/lib/wasm/generated')
  try {
    // Ensure the compiled scripts output path exists before recursive copy.
    await mkdir(targetDir, { recursive: true })
    // Force-copy all generated artifacts to keep JS+WASM in lockstep.
    await cp(sourceDir, targetDir, { recursive: true, force: true })
  } catch {
    // Keep tooling resilient: if sync fails, warmup will still surface a clear wasm error.
  }
}

// Default pairing mirrors the user-reported heavy scenario.
const DEFAULT_SCENARIO: ScenarioInput = {
  sfrPath: 'examples/example.sfr',
  gearDbPath: 'examples/251112_042110.db',
}

const formatMs = (value: number): string => `${value.toFixed(1)} ms`

const formatPerItem = (durationMs: number, count: number): string => {
  if (count <= 0) return 'n/a'
  return `${(durationMs / count).toFixed(3)} ms/item`
}

// Support --sfr/--db overrides so perf runs can target arbitrary fixtures.
const parseArgs = (): ScenarioInput => {
  const args = process.argv.slice(2)
  const result: ScenarioInput = { ...DEFAULT_SCENARIO }
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (!arg) continue
    const [key, maybeValue] = arg.includes('=')
      ? arg.split('=')
      : [arg, undefined]
    const nextValue = maybeValue ?? args[i + 1]
    const consumeNext = maybeValue === undefined
    const assignPath = (target: 'sfrPath' | 'gearDbPath') => {
      if (!nextValue) {
        throw new Error(`Missing value for ${key}`)
      }
      result[target] = nextValue
      if (consumeNext) i += 1
    }
    if (key === '--sfr') {
      assignPath('sfrPath')
      continue
    }
    if (key === '--db' || key === '--gear-db') {
      assignPath('gearDbPath')
      continue
    }
  }
  return {
    sfrPath: resolvePath(process.cwd(), result.sfrPath),
    gearDbPath: resolvePath(process.cwd(), result.gearDbPath),
  }
}

// Read and normalize the SFR definition so we can rebuild the merged rules.
const loadSfr = async (sfrPath: string): Promise<{
  recipes: BuilderRecipe[]
  metasets: ReturnType<typeof parseSfrObject>['metasets']
  substatTargets: SubstatTargetTable
  safeguardRules: SafeguardRule[]
  safeguardsEnabled: boolean
  finalSellRemainder: FinalSellRemainderConfig
}> => {
  const raw = await readFile(sfrPath, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  const parsedSfr = parseSfrObject(parsed, {
    metasets: [],
    substatTargets: defaultSubstatTargets(),
  })
  return {
    recipes: parsedSfr.recipes,
    metasets: parsedSfr.metasets,
    substatTargets: parsedSfr.substatTargets,
    safeguardRules: parsedSfr.safeguardRules,
    safeguardsEnabled: parsedSfr.safeguardsEnabled,
    finalSellRemainder: parsedSfr.finalSellRemainder,
  }
}

// Import the SQLite dump through the same code used by the UI.
const loadGear = async (gearDbPath: string): Promise<NormalizedGearArtifact[]> => {
  const buffer = await readFile(gearDbPath)
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  )
  const imported: GearDbImportResult = await importGearDatabaseFromArrayBuffer(arrayBuffer)
  return [...imported.artifacts, ...imported.inboxArtifacts]
}

// Resolve SFR + gear data into the inputs we need for matching.
const buildScenario = async (input: ScenarioInput): Promise<ScenarioData> => {
  const sfr = await loadSfr(input.sfrPath)
  const gear = await loadGear(input.gearDbPath)
  const recipeModes = sfr.recipes.map((recipe) => recipe.exportMode)
  return {
    recipes: sfr.recipes,
    metasets: sfr.metasets,
    substatTargets: sfr.substatTargets,
    safeguardRules: sfr.safeguardRules,
    safeguardsEnabled: sfr.safeguardsEnabled,
    finalSellRemainder: sfr.finalSellRemainder,
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

  // Mirror export-time keep-rule dedupe so perf output stays aligned with app behavior.
  const baseKeepRules = baseRules.filter((rule) => rule.Keep === true)
  // Dedupe baseline keep rules first in case upstream sources already overlap.
  const dedupedBaseKeepRules = dedupeHsfRulesForExport(baseKeepRules)
  // Dedupe with safeguard candidates appended; delta equals net injected keeps.
  const dedupedMergedKeepRules = dedupeHsfRulesForExport([
    ...baseKeepRules,
    ...candidateSafeguardRules,
  ])
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
  // Tooling runs sync builder/matcher helpers directly, so warm wasm first.
  // Install the file:// fetch shim before wasm-bindgen tries to load bytes.
  await installNodeFileFetch()
  // Sync generated artifacts so tmp script execution cannot use stale wasm.
  await syncCompiledWasmBindings()
  // Preload the module once so sync helpers can execute immediately afterward.
  await warmupWasmRuleEngine()
  const input = parseArgs()
  console.log('Rule Tester measurement')
  console.log(`  SFR: ${input.sfrPath}`)
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
    finalSellRemainder: scenario.finalSellRemainder,
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
    finalSellRemainder: scenario.finalSellRemainder,
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
