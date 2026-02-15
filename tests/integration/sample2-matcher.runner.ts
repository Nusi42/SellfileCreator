/* eslint import/no-unused-modules: off */
// sample2-bundle matcher regression runner.
// This script guards the keep-unique + primary/base match invariants that
// previously regressed during wasm boundary refactors.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defaultSubstatTargets, type SellfileExportMode } from '../../src/lib/hsfBuilder.js'
import { parseHsfcObject } from '../../src/lib/hsfcIO.js'
import { importGearDatabaseFromArrayBuffer } from '../../src/lib/importers/gearDbImporter.js'
import {
  RULE_SOURCE_KEEP_UNIQUES,
  computeMergedRules,
  type HsfRuleWithCfg,
} from '../../src/lib/merge.js'
import {
  collectKeepUniqueCandidates,
  computeKeepUniqueProtection,
  resolveKeepUniqueRulesWithMetasets,
} from '../../src/lib/keepUniques.js'
import { evaluateMatchesByConfig, type EvalResult } from '../../src/lib/ruleEval.js'
import type { TesterPreviewMatch, TesterPreviewRow } from '../../src/types/testerPreview.js'
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
  sourceHsfc: string
  sharedDb: string
}

// Resolve paths from repository root so compiled test output can move freely.
const ROOT_DIR = process.cwd()
const MANIFEST_PATH = resolve(ROOT_DIR, 'tests', 'data', 'sample2-bundle', 'manifest.json')

// Read and minimally validate the manifest fields consumed by this runner.
const loadManifest = (): Sample2BundleManifest => {
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Partial<Sample2BundleManifest>
  const sourceHsfc = requireNonEmptyString(raw.sourceHsfc, 'sourceHsfc')
  const sharedDb = requireNonEmptyString(raw.sharedDb, 'sharedDb')
  return { sourceHsfc, sharedDb }
}

// Convert Node Buffer slices into stable ArrayBuffer views for the importer.
const toArrayBuffer = (bytes: Buffer): ArrayBuffer => {
  // Copy bytes into a standalone ArrayBuffer so TS cannot infer SharedArrayBuffer.
  const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Uint8Array.from(view).buffer
}

// Convert raw evaluator output into the preview match shape expected by
// keep-unique candidate collection helpers.
const toPreviewMatch = (
  result: EvalResult | null,
  rules: readonly HsfRuleWithCfg[],
): TesterPreviewMatch | null => {
  if (!result) return null
  const matchedRule = rules[result.ruleIndex] ?? null
  return {
    keep: result.keep,
    cfgIdx: result.cfgIdx ?? null,
    cfgName: null,
    ruleIndex: result.ruleIndex ?? null,
    ruleLabel: null,
    ruleSource: matchedRule?.__source ?? null,
  }
}

const main = async (): Promise<void> => {
  // Load fixture pointers from manifest so path updates stay centralized.
  const manifest = loadManifest()
  const hsfcPath = resolve(ROOT_DIR, manifest.sourceHsfc)
  const dbPath = resolve(ROOT_DIR, manifest.sharedDb)

  // Parse the source HSFC exactly like app startup does.
  const hsfcRaw = JSON.parse(readFileSync(hsfcPath, 'utf8'))
  const parsed = parseHsfcObject(hsfcRaw, {
    metasets: [],
    substatTargets: defaultSubstatTargets(),
  })
  // Resolve metaset references up-front so keep-unique inputs are explicit.
  const keepUniqueRules = resolveKeepUniqueRulesWithMetasets(parsed.keepUniqueRules, parsed.metasets)
  // Metaset resolution must not drop rules that do not use metasets.
  // Dropping such rules silently removes keep-unique coverage in tester/grid flows.
  assert(
    keepUniqueRules.length === parsed.keepUniqueRules.length,
    `keep-unique metaset resolution changed rule count (${parsed.keepUniqueRules.length} -> ${keepUniqueRules.length})`,
  )
  const configModes: SellfileExportMode[] = parsed.cfgs.map((cfg) => cfg.exportMode)

  // Load the shared sample2 database and merge both inventory + inbox items.
  const dbBytes = readFileSync(dbPath)
  const imported = await importGearDatabaseFromArrayBuffer(toArrayBuffer(dbBytes))
  const artifacts = [...imported.artifacts, ...imported.inboxArtifacts]
  assert(artifacts.length > 0, 'sample2-bundle matcher runner imported zero artifacts')

  // Build the baseline merged rules (with keep-unique enabled but no detection yet).
  const baseMergedRules = computeMergedRules({
    hsf: null,
    customCfgs: parsed.cfgs,
    metasets: parsed.metasets,
    substatTargets: parsed.substatTargets,
    finalSellRemainder: parsed.finalSellRemainder,
    keepUniques: {
      enabled: parsed.keepUniquesEnabled,
      rules: keepUniqueRules,
      detection: null,
    },
  })

  // Evaluate the baseline rows so keep-unique candidate collection can
  // reproduce the same row-level context used by the live tester pipeline.
  const baselineRows: TesterPreviewRow[] = artifacts.map((artifact) => {
    const evalResult = evaluateMatchesByConfig(
      baseMergedRules,
      artifact.testerItem,
      {
        configModes,
        excludeSources: [RULE_SOURCE_KEEP_UNIQUES],
      },
    )
    return {
      artifact,
      match: toPreviewMatch(evalResult.firstMatch, baseMergedRules),
      baseMatch: toPreviewMatch(evalResult.firstNonExcludedMatch, baseMergedRules),
      matchingCfgIndices: evalResult.matchingConfigIndices,
      matchingConfigDecisions: evalResult.matchingConfigDecisions,
    }
  })

  // Generate keep-unique detection snapshot from sold candidates.
  const candidates = collectKeepUniqueCandidates({
    rows: baselineRows,
    baseRules: baseMergedRules.filter((rule) => rule.__source !== RULE_SOURCE_KEEP_UNIQUES),
    configModes,
  })
  const detection = computeKeepUniqueProtection({
    candidates: candidates.candidates,
    rules: keepUniqueRules,
    enabled: parsed.keepUniquesEnabled,
  })
  // Invariant: placeholders must represent real deficits only.
  // Zero-missing placeholders indicate grouping regressions in keep-unique scans.
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
    `keep-unique detection emitted zero-missing placeholders: ${zeroMissingPlaceholders}`,
  )

  // Rebuild merged rules with the keep-unique detection snapshot applied.
  const mergedWithKeepRules = computeMergedRules({
    hsf: null,
    customCfgs: parsed.cfgs,
    metasets: parsed.metasets,
    substatTargets: parsed.substatTargets,
    finalSellRemainder: parsed.finalSellRemainder,
    keepUniques: {
      enabled: parsed.keepUniquesEnabled,
      rules: keepUniqueRules,
      detection,
    },
  })

  // Invariant #1: injected keep-unique rows must exist and carry full payload.
  const keepRows = mergedWithKeepRules.filter((rule) => rule.__source === RULE_SOURCE_KEEP_UNIQUES)
  assert(keepRows.length > 0, 'expected keep-unique injected rows in merged rules')
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
  assert(emptyKeepRows === 0, `keep-unique injected rows collapsed to empty payloads: ${emptyKeepRows}`)
  assert(keepFlagViolations === 0, `keep-unique injected rows lost Keep/Use flags: ${keepFlagViolations}`)
  assert(substatViolations === 0, `keep-unique injected rows lost Substats payload: ${substatViolations}`)

  // Invariant #2 and #3: final merged rules must still produce first-match
  // and first-non-excluded (primary/base) matches for every artifact.
  let missingFirstMatch = 0
  let missingPrimaryMatch = 0
  for (const artifact of artifacts) {
    const evalResult = evaluateMatchesByConfig(
      mergedWithKeepRules,
      artifact.testerItem,
      {
        configModes,
        excludeSources: [RULE_SOURCE_KEEP_UNIQUES],
      },
    )
    if (!evalResult.firstMatch) missingFirstMatch += 1
    if (!evalResult.firstNonExcludedMatch) missingPrimaryMatch += 1
  }
  assert(missingFirstMatch === 0, `missing firstMatch rows after keep-unique merge: ${missingFirstMatch}`)
  assert(missingPrimaryMatch === 0, `missing firstNonExcludedMatch rows after keep-unique merge: ${missingPrimaryMatch}`)

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
