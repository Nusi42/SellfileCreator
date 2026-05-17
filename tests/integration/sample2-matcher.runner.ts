/* eslint import/no-unused-modules: off */
// sample2-bundle matcher regression runner.
// This script guards the safeguard + primary/base match invariants that
// previously regressed during wasm boundary refactors.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defaultSubstatTargets, type SellfileExportMode } from '../../src/lib/hsfBuilder.js'
import { parseSfcObject } from '../../src/lib/sfcIO.js'
import { importGearDatabaseFromArrayBuffer } from '../../src/lib/importers/gearDbImporter.js'
import {
  RULE_SOURCE_SAFEGUARDS,
  computeMergedRules,
  type HsfRuleWithRecipe,
} from '../../src/lib/merge.js'
import {
  collectSafeguardCandidates,
  computeSafeguardProtection,
  resolveSafeguardRulesWithMetasets,
} from '../../src/lib/safeguards.js'
import { evaluateMatchesByRecipe, type EvalResult } from '../../src/lib/ruleEval.js'
import type { GearInspectorPreviewMatch, GearInspectorPreviewRow } from '../../src/types/gearInspectorPreview.js'
import '../setup/wasm-warmup.js'

// Keep this runner fail-fast and explicit so CI errors stay actionable.
const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message)
}

// Parse unknown values into required manifest strings with one shared helper.
const requireNonEmptyString = (value: unknown, fieldName: string): string => {
  assert(typeof value === 'string' && value.length > 0, `sample2-bundle manifest is missing ${fieldName}`)
  return value as string
}

// Fixture metadata lives with the sample fixture bundle in tests/data.
// We read only the paths needed for this runner so the manifest remains
// the machine-readable source of truth for fixture locations.
type Sample2BundleManifest = {
  sourceSfc: string
  sharedDb: string
}

// Resolve paths from repository root so compiled test output can move freely.
const ROOT_DIR = process.cwd()
const MANIFEST_PATH = resolve(ROOT_DIR, 'tests', 'data', 'sample2-bundle', 'manifest.json')

// Read and minimally validate the manifest fields consumed by this runner.
const loadManifest = (): Sample2BundleManifest => {
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Partial<Sample2BundleManifest>
  const sourceSfc = requireNonEmptyString(raw.sourceSfc, 'sourceSfc')
  const sharedDb = requireNonEmptyString(raw.sharedDb, 'sharedDb')
  return { sourceSfc, sharedDb }
}

// Convert Node Buffer slices into stable ArrayBuffer views for the importer.
const toArrayBuffer = (bytes: Buffer): ArrayBuffer => {
  // Copy bytes into a standalone ArrayBuffer so TS cannot infer SharedArrayBuffer.
  const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Uint8Array.from(view).buffer
}

// Convert raw evaluator output into the preview match shape expected by
// safeguard candidate collection helpers.
const toPreviewMatch = (
  result: EvalResult | null,
  rules: readonly HsfRuleWithRecipe[],
): GearInspectorPreviewMatch | null => {
  if (!result) return null
  const matchedRule = rules[result.ruleIndex] ?? null
  return {
    keep: result.keep,
    recipeIdx: result.recipeIdx ?? null,
    recipeName: null,
    recipeFgColor: null,
    ruleLabelFgColor: null,
    ruleIndex: result.ruleIndex ?? null,
    ruleLabel: null,
    ruleSource: matchedRule?.__source ?? null,
    safeguardRuleId: null,
    safeguardRuleOrdinal: null,
  }
}

const main = async (): Promise<void> => {
  // Load fixture pointers from manifest so path updates stay centralized.
  const manifest = loadManifest()
  const sfcPath = resolve(ROOT_DIR, manifest.sourceSfc)
  const dbPath = resolve(ROOT_DIR, manifest.sharedDb)

  // Parse the source SFC exactly like app startup does.
  const sfcRaw = JSON.parse(readFileSync(sfcPath, 'utf8'))
  const parsed = parseSfcObject(sfcRaw, {
    metasets: [],
    substatTargets: defaultSubstatTargets(),
  })
  // Resolve metaset references up-front so safeguard inputs are explicit.
  // sample2-bundle SFC always has safeguards; ?? [] is a type-system defensive fallback.
  const rawSafeguardRules = parsed.safeguardRules ?? []
  const safeguardRules = resolveSafeguardRulesWithMetasets(rawSafeguardRules, parsed.metasets)
  // Metaset resolution must not drop rules that do not use metasets.
  // Dropping such rules silently removes safeguard coverage in tester/grid flows.
  assert(
    safeguardRules.length === rawSafeguardRules.length,
    `safeguard metaset resolution changed rule count (${rawSafeguardRules.length} -> ${safeguardRules.length})`,
  )
  const recipeModes: SellfileExportMode[] = parsed.recipes.map((cfg) => cfg.exportMode)

  // Load the shared sample2 database and merge both inventory + inbox items.
  const dbBytes = readFileSync(dbPath)
  const imported = await importGearDatabaseFromArrayBuffer(toArrayBuffer(dbBytes))
  const artifacts = [...imported.artifacts, ...imported.inboxArtifacts]
  assert(artifacts.length > 0, 'sample2-bundle matcher runner imported zero artifacts')

  // Build the baseline merged rules (with safeguard enabled but no detection yet).
  const baseMergedRules = computeMergedRules({
    hsf: null,
    customRecipes: parsed.recipes,
    metasets: parsed.metasets,
    substatTargets: parsed.substatTargets,
    ...(parsed.finalSellRemainder !== null ? { finalSellRemainder: parsed.finalSellRemainder } : {}),
    safeguards: {
      enabled: parsed.safeguardsEnabled ?? false,
      rules: safeguardRules,
      detection: null,
    },
  })

  // Evaluate the baseline rows so safeguard candidate collection can
  // reproduce the same row-level context used by the live tester pipeline.
  const baselineRows: GearInspectorPreviewRow[] = artifacts.map((artifact) => {
    const evalResult = evaluateMatchesByRecipe(
      baseMergedRules,
      artifact.gearInspectorItem,
      {
        recipeModes,
        excludeSources: [RULE_SOURCE_SAFEGUARDS],
      },
    )
    return {
      artifact,
      match: toPreviewMatch(evalResult.firstMatch, baseMergedRules),
      baseMatch: toPreviewMatch(evalResult.firstNonExcludedMatch, baseMergedRules),
      matchingRecipeIndices: evalResult.matchingRecipeIndices,
      matchingRecipeDecisions: evalResult.matchingRecipeDecisions,
    }
  })

  // Generate safeguard detection snapshot from sold candidates.
  const candidates = collectSafeguardCandidates({
    rows: baselineRows,
    baseRules: baseMergedRules.filter((rule) => rule.__source !== RULE_SOURCE_SAFEGUARDS),
    recipeModes,
  })
  const detection = computeSafeguardProtection({
    candidates: candidates.candidates,
    rules: safeguardRules,
    enabled: parsed.safeguardsEnabled ?? false,
  })
  // Invariant: placeholders must represent real deficits only.
  // Zero-missing placeholders indicate grouping regressions in safeguard scans.
  let zeroMissingPlaceholders = 0
  for (const entry of detection.entries) {
    for (const placeholder of entry.placeholders) {
      if ((placeholder.missing ?? 0) <= 0) {
        zeroMissingPlaceholders += 1
      }
    }
  }
  assert(
    zeroMissingPlaceholders === 0,
    `safeguard detection emitted zero-missing placeholders: ${zeroMissingPlaceholders}`,
  )

  // Rebuild merged rules with the safeguard detection snapshot applied.
  const mergedWithKeepRules = computeMergedRules({
    hsf: null,
    customRecipes: parsed.recipes,
    metasets: parsed.metasets,
    substatTargets: parsed.substatTargets,
    ...(parsed.finalSellRemainder !== null ? { finalSellRemainder: parsed.finalSellRemainder } : {}),
    safeguards: {
      enabled: parsed.safeguardsEnabled ?? false,
      rules: safeguardRules,
      detection,
    },
  })

  // Invariant #1: injected safeguard rows must exist and carry full payload.
  const keepRows = mergedWithKeepRules.filter((rule) => rule.__source === RULE_SOURCE_SAFEGUARDS)
  assert(keepRows.length > 0, 'expected safeguard injected rows in merged rules')
  let emptyKeepRows = 0
  let keepFlagViolations = 0
  let substatViolations = 0
  for (const row of keepRows) {
    // "{}" regressions typically collapse down to only __lineIdx or nothing.
    if (Object.keys(row).length <= 1) emptyKeepRows += 1
    // Every injected row should remain an active Keep rule after merge.
    if (row.Keep !== true || row.Use !== true) keepFlagViolations += 1
    // Keep rows must retain padded Substats payload for evaluator parity.
    if (!Array.isArray(row.Substats) || row.Substats.length === 0) substatViolations += 1
  }
  assert(emptyKeepRows === 0, `safeguard injected rows collapsed to empty payloads: ${emptyKeepRows}`)
  assert(keepFlagViolations === 0, `safeguard injected rows lost Keep/Use flags: ${keepFlagViolations}`)
  assert(substatViolations === 0, `safeguard injected rows lost Substats payload: ${substatViolations}`)

  // Invariant #2 and #3: final merged rules must still produce first-match
  // and first-non-excluded (primary/base) matches for every artifact.
  let missingFirstMatch = 0
  let missingPrimaryMatch = 0
  for (const artifact of artifacts) {
    const evalResult = evaluateMatchesByRecipe(
      mergedWithKeepRules,
      artifact.gearInspectorItem,
      {
        recipeModes,
        excludeSources: [RULE_SOURCE_SAFEGUARDS],
      },
    )
    if (!evalResult.firstMatch) missingFirstMatch += 1
    if (!evalResult.firstNonExcludedMatch) missingPrimaryMatch += 1
  }
  assert(missingFirstMatch === 0, `missing firstMatch rows after safeguard merge: ${missingFirstMatch}`)
  assert(missingPrimaryMatch === 0, `missing firstNonExcludedMatch rows after safeguard merge: ${missingPrimaryMatch}`)

  // Emit one compact success line so CI logs stay easy to scan.
  console.log(
    `ok - sample2-bundle matcher invariants (artifacts=${artifacts.length}, keepRows=${keepRows.length})`,
  )
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
