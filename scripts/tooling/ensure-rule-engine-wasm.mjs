#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Resolve the repo root from this script path so callers can run the command
// from any working directory and still inspect/build the same wasm outputs.
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')

// Keep source roots explicit so "relevant files" are deterministic and easy
// to audit when Rust/domain-constant inputs change.
// The workspace root holds the shared Cargo.toml/Cargo.lock; each crate has
// its own src/ directory tracked separately for fine-grained rebuild detection.
const WORKSPACE_DIR = path.join(REPO_ROOT, 'wasm')
const RULE_ENGINE_CORE_SRC_DIR = path.join(WORKSPACE_DIR, 'rule_engine_core', 'src')
const RULE_ENGINE_WASM_SRC_DIR = path.join(WORKSPACE_DIR, 'rule_engine_wasm', 'src')
const VENDOR_TALC_SRC_DIR = path.join(WORKSPACE_DIR, 'vendor', 'talc', 'src')
const GENERATED_OUT_DIR = path.join(REPO_ROOT, 'src', 'lib', 'wasm', 'generated')
// ts-rs writes its derived TS-from-Rust interfaces here.  Each `#[derive(TS)]`
// struct in rule_engine_core produces one .ts file via `cargo test`.
const RUST_TYPES_OUT_DIR = path.join(GENERATED_OUT_DIR, 'rust-types')

// Track all generated files required by TS imports/runtime wasm loading.
const GENERATED_OUTPUTS = [
  path.join(GENERATED_OUT_DIR, 'rule_engine.js'),
  path.join(GENERATED_OUT_DIR, 'rule_engine.d.ts'),
  path.join(GENERATED_OUT_DIR, 'rule_engine_bg.wasm'),
  path.join(GENERATED_OUT_DIR, 'rule_engine_bg.wasm.d.ts'),
]

// ts-rs sentinel outputs — one entry per top-level exported struct.  Used by the
// staleness check below so tsc never reads an interface that lags behind its
// Rust source.  Listing them explicitly (rather than globbing rust-types/) keeps
// the rebuild signal binary: if any file is missing, regenerate.  Update this
// list when a new `#[derive(TS)]` is added to either rule_engine_core or
// rule_engine_wasm.
const RUST_TYPES_OUTPUTS = [
  // ── rule_engine_core: output structs ────────────────────────────────────
  path.join(RUST_TYPES_OUT_DIR, 'EvalMatch.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'MatchingRecipeDecision.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'EvaluateItemResult.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'EvaluateAndCollectSnapshotOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'PrepareHsfBuilderRecipeOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'PrepareHsfBuilderTargetEntryOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'ExecuteHsfBuilderRuntimeOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'ObsoleteEntryOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'ObsoleteReportOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardCollectedAndProtectedSnapshotOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardCollectedCandidateOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardCollectedSnapshotOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmArtifactOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmCandidateOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmSubstatBucketOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmEntryOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmGroupSample.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmPlaceholderOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmResolvedRuleOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmSnapshotOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmSubstatOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWatchCornerOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWatchCornerSubstatOut.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'ImprovementChanceDebug.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'ImprovementChanceEntry.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'ImprovementChancePerfDiag.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'ImprovementChanceRuleEntry.ts'),
  // ── rule_engine_core: input/wire structs ────────────────────────────────
  path.join(RUST_TYPES_OUT_DIR, 'RuleRaw.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'RuleRawWire.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'RuleSubRaw.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'RuleSubRawWire.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'EvaluateItemRaw.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'EvaluateValueInWire.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'EvaluateOptionsRaw.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'TestItemRaw.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'PreviewExtrasRaw.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'ComputeMergedRulesIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'CacheGeneratedRulesInWire.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'ComputeMergedRulesCachedInWire.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'FinalSellRemainderIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'AutoRarityResolveBuilderIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'AutoRarityResolveRollBoundsIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'AutoFlexRarityBoundsIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'AutoFlexRarityRecipeIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'EmitHsfSubstatIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'EmitHsfMainChoiceIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'BuildHsfRulesRuntimeIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'BuildHsfComboBoundsIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'BuildHsfComboTargetEntryIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'PrepareHsfBuilderRecipeIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmArtifactIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmArtifactRawIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmCandidateFastIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmCombination.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmCountKeyArtifactIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmCountMode.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmEquippedChampionRawIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmExpectedGroupDomainIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmExpectedGroupIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmExpectedGroupsPayloadIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmExpectedSampleIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmGroupKeyArtifactIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmItemKeyArtifactIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmItemKeyPreviewExtrasIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmItemKeyTesterItemIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmMainStatRawIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmMetasetIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmRuleIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmScorePreviewIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmSetSelection.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmSubstatIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardWasmSubstatRawIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardCandidateResolveBaseMatchIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardCollectRowFastIn.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'ImprovementChanceThresholdIn.ts'),
  // ── rule_engine_wasm: JSON-string input wrappers + output wrapper ───────
  path.join(RUST_TYPES_OUT_DIR, 'ImprovementChanceOutput.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'ImprovementChanceInput.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'ComputeSafeguardProtectionInWire.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'CollectSafeguardCandidatesInWire.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'CollectAndComputeSafeguardProtectionInWire.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'ResolveSafeguardRulesWithMetasetsInWire.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'BuildSafeguardRulesInWire.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'BuildFinalSellRulesInWire.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'MergeSafeguardInjectedRulesInWire.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'EvaluateAndCollectSafeguardProtectionInWire.ts'),
  path.join(RUST_TYPES_OUT_DIR, 'SafeguardCountKeyInWire.ts'),
]

// Track non-recursive source files that can affect final wasm/bindings.
// Cargo.toml/Cargo.lock live at the workspace root, not inside individual crates.
const DIRECT_RELEVANT_SOURCES = [
  path.join(WORKSPACE_DIR, 'Cargo.toml'),
  path.join(WORKSPACE_DIR, 'Cargo.lock'),
  path.join(WORKSPACE_DIR, 'rule_engine_core', 'Cargo.toml'),
  path.join(WORKSPACE_DIR, 'rule_engine_wasm', 'Cargo.toml'),
  path.join(REPO_ROOT, 'shared', 'domain-constants.json'),
  path.join(REPO_ROOT, 'scripts', 'tooling', 'generate-domain-constants.mjs'),
  path.join(REPO_ROOT, 'scripts', 'tooling', 'build-rule-engine-wasm.mjs'),
]

// Read mtimes in a "missing-aware" way so we can decide when to rebuild.
const readMtimeMs = async (filePath) => {
  try {
    const stat = await fs.stat(filePath)
    return stat.mtimeMs
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

// Collect Rust source files recursively so any lib.rs/module edit can trigger
// a rebuild without needing to update hardcoded file lists.
const collectFilesRecursively = async (rootDir) => {
  const files = []
  const walk = async (currentDir) => {
    const entries = await fs.readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }
      if (entry.isFile()) files.push(fullPath)
    }
  }
  await walk(rootDir)
  files.sort((left, right) => left.localeCompare(right))
  return files
}

// Build only when at least one output is missing or stale relative to sources.
const ensureRuleEngineWasm = async () => {
  // If the Cargo target directory is absent (e.g. after `cargo clean`) the
  // intermediate build artifacts are gone; treat this as a forced rebuild
  // regardless of output mtimes, because the outputs cannot be trusted to
  // match what a fresh compile would produce.
  const cargoTargetDir = path.join(WORKSPACE_DIR, 'target')
  let cargoTargetMissing = false
  try {
    await fs.access(cargoTargetDir)
  } catch {
    cargoTargetMissing = true
  }

  // Collect Rust sources from crates and vendored patches so any edit triggers rebuild.
  // vendor/talc/ is our patched allocator — changes there must produce a new binary.
  const coreSources = await collectFilesRecursively(RULE_ENGINE_CORE_SRC_DIR)
  const wasmSources = await collectFilesRecursively(RULE_ENGINE_WASM_SRC_DIR)
  const vendorTalcSources = await collectFilesRecursively(VENDOR_TALC_SRC_DIR)
  const relevantSources = [...DIRECT_RELEVANT_SOURCES, ...coreSources, ...wasmSources, ...vendorTalcSources]

  // Fail early when a declared source vanished, because comparisons would be
  // misleading and we want deterministic rebuild decisions.
  let newestSourceMtime = -1
  for (const sourcePath of relevantSources) {
    const sourceMtime = await readMtimeMs(sourcePath)
    if (sourceMtime === null) {
      throw new Error(`Missing wasm source dependency: ${path.relative(REPO_ROOT, sourcePath)}`)
    }
    newestSourceMtime = Math.max(newestSourceMtime, sourceMtime)
  }

  // Compute the oldest output timestamp; a single stale output means rebuild.
  // ts-rs derived interfaces (rust-types/) are checked alongside the wasm
  // outputs so a Rust struct edit that only changes a `#[derive(TS)]` shape
  // (no wasm-side rebuild needed) still triggers an export regeneration.
  const missingOutputs = []
  const missingRustTypeOutputs = []
  let oldestOutputMtime = Number.POSITIVE_INFINITY
  let oldestRustTypeMtime = Number.POSITIVE_INFINITY
  for (const outputPath of GENERATED_OUTPUTS) {
    const outputMtime = await readMtimeMs(outputPath)
    if (outputMtime === null) {
      missingOutputs.push(outputPath)
      continue
    }
    oldestOutputMtime = Math.min(oldestOutputMtime, outputMtime)
  }
  for (const outputPath of RUST_TYPES_OUTPUTS) {
    const outputMtime = await readMtimeMs(outputPath)
    if (outputMtime === null) {
      missingRustTypeOutputs.push(outputPath)
      continue
    }
    oldestRustTypeMtime = Math.min(oldestRustTypeMtime, outputMtime)
  }

  const hasMissingOutput = missingOutputs.length > 0
  const hasStaleOutput = oldestOutputMtime < newestSourceMtime
  const hasMissingRustType = missingRustTypeOutputs.length > 0
  const hasStaleRustType = oldestRustTypeMtime < newestSourceMtime
  if (
    !hasMissingOutput && !hasStaleOutput &&
    !hasMissingRustType && !hasStaleRustType &&
    !cargoTargetMissing
  ) {
    console.log('[wasm:ensure] rule engine outputs are up to date.')
    return
  }

  // Print one concise reason so developers can tell why rebuild was requested.
  if (hasMissingOutput) {
    const missingLabels = missingOutputs.map((filePath) => path.relative(REPO_ROOT, filePath)).join(', ')
    console.log(`[wasm:ensure] rebuilding (missing outputs: ${missingLabels})`)
  } else if (hasMissingRustType) {
    const missingLabels = missingRustTypeOutputs
      .map((filePath) => path.relative(REPO_ROOT, filePath))
      .join(', ')
    console.log(`[wasm:ensure] rebuilding (missing ts-rs outputs: ${missingLabels})`)
  } else if (cargoTargetMissing) {
    console.log('[wasm:ensure] rebuilding (cargo target/ absent — cargo clean was run).')
  } else {
    console.log('[wasm:ensure] rebuilding (sources changed after generated outputs).')
  }

  // Reuse the existing build pipeline script so generation/build behavior is
  // still defined in one place.
  // Call the Node build entrypoint directly so Windows/PowerShell path rules
  // never depend on bash argument parsing.
  const buildScriptPath = path.join(REPO_ROOT, 'scripts', 'tooling', 'build-rule-engine-wasm.mjs')
  const buildResult = spawnSync(process.execPath, [buildScriptPath], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  })

  if (buildResult.error) throw buildResult.error
  if ((buildResult.status ?? 1) !== 0) process.exit(buildResult.status ?? 1)

  // Step 2: regenerate ts-rs derived TS interfaces.  `cargo test` invokes the
  // ts-rs-generated `export_bindings_*` tests, which write one .ts file per
  // `#[derive(TS)]` struct in rule_engine_core into src/lib/wasm/generated/
  // rust-types/.
  //
  //   TS_RS_EXPORT_DIR=.            roots resolution at the crate's cwd
  //                                 (`wasm/rule_engine_core/`) so `export_to`
  //                                 attribute paths like `../../src/...`
  //                                 climb out to the repo's `src/`.
  //   TS_RS_LARGE_INT=number        forces i64 → TS `number` because
  //                                 serde_wasm_bindgen's default Serializer
  //                                 emits i64 as JS number on the wire — bigint
  //                                 would only apply if
  //                                 `serialize_large_number_types` were enabled.
  //
  // We pass --tests so only test binaries run (no doctests) and -q to keep the
  // output unintrusive; the cargo test exit code still gates the build.
  // The rule_engine_wasm crate also declares some `#[derive(TS)]` types (the
  // JSON-string wire wrapper structs and ImprovementChanceOutput).  Run cargo
  // test on both manifests so every derived struct gets a .ts file.  Native
  // test compilation works because the test bodies don't depend on wasm-bindgen
  // runtime — the wasm-bindgen attribute macros only emit functions that are
  // never invoked from inside the host-side test binary.
  const tsRsCargoTargets = [
    path.join(WORKSPACE_DIR, 'rule_engine_core', 'Cargo.toml'),
    path.join(WORKSPACE_DIR, 'rule_engine_wasm', 'Cargo.toml'),
  ]
  console.log('[wasm:ensure] regenerating ts-rs derived TS interfaces (rust-types/).')
  for (const manifestPath of tsRsCargoTargets) {
    const rustTypesCargoArgs = [
      'test',
      '--manifest-path', manifestPath,
      '--tests',
      '-q',
    ]
    const tsRsResult = spawnSync('cargo', rustTypesCargoArgs, {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        // Absolute target dir so both crates' test binaries write to one
        // location.  Earlier `'.'` resolved relative to each crate's cwd and
        // produced a duplicate tree at `wasm/src/lib/wasm/generated/rust-types/`
        // when running the rule_engine_wasm test binary (its CARGO_MANIFEST_DIR
        // resolution combined with the `../../` in export_to landed under the
        // workspace dir instead of REPO_ROOT).
        TS_RS_EXPORT_DIR: RUST_TYPES_OUT_DIR,
        TS_RS_LARGE_INT: 'number',
      },
    })
    if (tsRsResult.error) throw tsRsResult.error
    if ((tsRsResult.status ?? 1) !== 0) process.exit(tsRsResult.status ?? 1)
  }
}

await ensureRuleEngineWasm()
