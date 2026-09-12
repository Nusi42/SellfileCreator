/* eslint import/no-unused-modules: off */
// native-dll-decide-expected — emit the REFERENCE decision the native DLL must reproduce,
// computed by the app's OWN pipeline, for the TS<->Rust decision-parity test.
//
// The ingest parity test (native-dll-parity-expected) pins the raw->compact normalisation.
// This one pins everything after it: recipe rule building, safeguard detection, the merge,
// and the per-artifact verdict. Both halves matter — every DLL parity bug found so far lived
// in the second half, where the ingest test cannot see it.
//
// Nothing is re-implemented here. The app side runs through the same modules App.tsx and the
// rule-cache worker use: documentOverrides resolves the .sfc, updateRecipeRulesCache builds
// the recipe rules, evaluateAndCollectSafeguardProtection runs detection, and
// computeMergedRulesFromComponents assembles the list the matcher evaluates.
//
// Usage (after tsc emit — see the sfc-engine:decide-expected npm script):
//   node tmp/tsc/tests/tests/repro/native-dll-decide-expected.js \
//        <artifacts_packet.json> <champions_packet.json> <fixtures-dir> <out expected.json>

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeExternalEvent } from '../../src/lib/externalCommands'
import { normalizeGearDbArtifact } from '../../src/lib/importers/gearDbNormalizer'
import type { NormalizedGearArtifact } from '../../src/lib/importers/gearDbNormalizer'
import { parseSfcObject } from '../../src/lib/sfcIO'
import { defaultSubstatTargets } from '../../src/lib/hsfBuilder'
import { buildDocumentOverridesView } from '../../src/lib/documentOverrides'
import { updateRecipeRulesCache } from '../../src/lib/ruleCache'
import {
  buildMergedRulesComponents,
  computeMergedRulesFromComponents,
  configureMergedRulesFromComponents,
  KEEP_OVERRIDE_RULE_SOURCES,
} from '../../src/lib/merge'
import {
  buildIgnoreSafeguardRecipeIndices,
  evaluateAndCollectSafeguardProtection,
  hasActiveSafeguardRules,
  storeArtifactRows,
  toWasmArtifactStoreRow,
} from '../../src/lib/safeguards'
import { evaluateWasmRuleEngineItemsWithLoadedWasm } from '../../src/lib/wasm/wasmRuleEngine'
import type { SafeguardDetectionSnapshot } from '../../src/lib/safeguards'
import { resolveArtifactItemIdWithFallback } from '../../src/lib/itemIdentity'
import { RULE_SOURCE_SAFEGUARDS } from '../../src/lib/ruleSources'
import '../setup/wasm-warmup.js'

declare const process: { argv: string[] }

const [artifactsPath, championsPath, fixturesDir, outPath] = process.argv.slice(2)
if (!artifactsPath || !championsPath || !fixturesDir || !outPath) {
  throw new Error('usage: native-dll-decide-expected <artifacts> <champions> <fixtures-dir> <out>')
}

const readFrame = (p: string): { method?: string; params?: unknown } =>
  JSON.parse(readFileSync(p, 'utf8')) as { method?: string; params?: unknown }

// Champions first: the equip map fills cID, which the safeguard "equipped" filters read.
const champFrame = readFrame(championsPath)
const champCommand = normalizeExternalEvent(champFrame.method ?? 'champions', champFrame.params)
if (!champCommand || champCommand.kind !== 'gearDbChampions') {
  throw new Error('expected gearDbChampions from the champions packet')
}
const equippedByArtifact = champCommand.equippedByArtifact

const artFrame = readFrame(artifactsPath)
const artCommand = normalizeExternalEvent(artFrame.method ?? 'artifacts', artFrame.params)
if (!artCommand || artCommand.kind !== 'gearDbArtifacts') {
  throw new Error('expected gearDbArtifacts from the artifacts packet')
}
// Join the equip map before normalising so each piece knows its champion.
const gear: NormalizedGearArtifact[] = artCommand.artifacts.map((row) =>
  normalizeGearDbArtifact({ ...row, cID: equippedByArtifact.get(row.ID ?? 0) ?? 0 }))

// One fixture's decision: the verdict per artifact plus the rule-composition counts. The
// counts are asserted on purpose — a divergence in rule BUILDING that happens not to move a
// verdict on this small vault is still a divergence, and catching it here costs nothing.
const decideFixture = (sfcText: string) => {
  const parsed = parseSfcObject(JSON.parse(sfcText), { metasets: [], substatTargets: defaultSubstatTargets() })
  const view = buildDocumentOverridesView({
    note: parsed.note ?? null,
    noteOverridesDisabled: parsed.noteOverridesDisabled ?? false,
    recipeOverridesAnswers: parsed.noteRecipeOverridesAnswers ?? {},
    safeguardOverridesAnswers: parsed.noteSafeguardOverridesAnswers ?? {},
    recipes: parsed.recipes,
    substatTargets: parsed.substatTargets,
    safeguardRules: parsed.safeguardRules ?? [],
    metasets: parsed.metasets,
    recipesEnabled: parsed.recipesEnabled ?? true,
  })

  const built = updateRecipeRulesCache({
    recipes: view.pipelineRecipes,
    metasets: parsed.metasets,
    substatTargets: view.effectiveSubstatTargets,
  })
  const components = buildMergedRulesComponents({
    hsf: null,
    customRecipes: view.pipelineRecipes,
    metasets: parsed.metasets,
    substatTargets: view.effectiveSubstatTargets,
    prebuiltCustomRules: built.rulesByRecipe,
  })

  const safeguardsEnabled = parsed.safeguardsEnabled ?? true
  const safeguards = { enabled: safeguardsEnabled, rules: view.effectiveSafeguardRules }
  const entries = gear.map((a, i) => [resolveArtifactItemIdWithFallback(a, i), a] as const)
  const ignoreSafeguardRecipeIndices = buildIgnoreSafeguardRecipeIndices(view.pipelineRecipes)
  const mergeParams = parsed.finalSellRemainder ? { finalSellRemainder: parsed.finalSellRemainder } : {}

  // Detection needs the baseline rules configured and the artifact rows stored first — the
  // same order the rule-cache worker uses.
  let detection: SafeguardDetectionSnapshot | null = null
  if (hasActiveSafeguardRules(safeguards) && entries.length > 0) {
    configureMergedRulesFromComponents(components, {
      ...mergeParams,
      safeguards: { ...safeguards, detection: null },
      recipeModes: view.recipeModes,
    })
    storeArtifactRows(entries.map(([, a]) => toWasmArtifactStoreRow(a)))
    detection = evaluateAndCollectSafeguardProtection({
      options: { baselineExcludeSources: KEEP_OVERRIDE_RULE_SOURCES },
      rules: view.effectiveSafeguardRules,
      enabled: safeguardsEnabled,
      ignoreSafeguardRecipeIndices,
    }).detection
  }

  const merged = computeMergedRulesFromComponents(components, {
    ...mergeParams,
    safeguards: { ...safeguards, detection },
  })
  configureMergedRulesFromComponents(components, {
    ...mergeParams,
    safeguards: { ...safeguards, detection },
    recipeModes: view.recipeModes,
  })

  const results = evaluateWasmRuleEngineItemsWithLoadedWasm({
    items: entries.map(([itemId, a]) => ({ itemId, item: a.gearInspectorItem })),
    options: {
      baselineExcludeSources: KEEP_OVERRIDE_RULE_SOURCES,
      ...(ignoreSafeguardRecipeIndices.size > 0 ? { ignoreSafeguardRecipeIndices } : {}),
    },
  })

  // Rule composition by source, so build-side drift is caught even when verdicts agree.
  const bySource: Record<string, number> = {}
  for (const rule of merged) {
    const key = (rule as { __source?: string }).__source ?? 'recipe'
    bySource[key] = (bySource[key] ?? 0) + 1
  }

  const verdicts = [...results]
    .sort((a, b) => a.itemId - b.itemId)
    .map((r) => {
      const match = r.firstMatch
      const rule = match ? (merged[match.ruleIndex] as { __source?: string } | undefined) : undefined
      return {
        artifactId: r.itemId,
        // No match means KEEP: never sell gear the sellfile did not call out.
        keep: match ? match.keep : true,
        matched: match !== null && match !== undefined,
        // The app's definition of the third state: the DECIDING rule is a safeguard.
        safeguarded: (rule?.__source ?? null) === RULE_SOURCE_SAFEGUARDS,
      }
    })

  return { ruleCount: merged.length, bySource, verdicts }
}

const fixtures = readdirSync(fixturesDir).filter((f) => f.endsWith('.sfc')).sort()
const out: Record<string, ReturnType<typeof decideFixture>> = {}
for (const name of fixtures) {
  out[name] = decideFixture(readFileSync(join(fixturesDir, name), 'utf8'))
}
writeFileSync(outPath, JSON.stringify({ fixtures: out }, null, 2) + '\n')
