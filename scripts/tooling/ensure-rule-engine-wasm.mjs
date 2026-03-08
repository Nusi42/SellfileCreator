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
const GENERATED_OUT_DIR = path.join(REPO_ROOT, 'src', 'lib', 'wasm', 'generated')

// Track all generated files required by TS imports/runtime wasm loading.
const GENERATED_OUTPUTS = [
  path.join(GENERATED_OUT_DIR, 'rule_engine.js'),
  path.join(GENERATED_OUT_DIR, 'rule_engine.d.ts'),
  path.join(GENERATED_OUT_DIR, 'rule_engine_bg.wasm'),
  path.join(GENERATED_OUT_DIR, 'rule_engine_bg.wasm.d.ts'),
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
  // Collect Rust sources from both crates so any edit in core or the wasm shim triggers rebuild.
  const coreSources = await collectFilesRecursively(RULE_ENGINE_CORE_SRC_DIR)
  const wasmSources = await collectFilesRecursively(RULE_ENGINE_WASM_SRC_DIR)
  const relevantSources = [...DIRECT_RELEVANT_SOURCES, ...coreSources, ...wasmSources]

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
  const missingOutputs = []
  let oldestOutputMtime = Number.POSITIVE_INFINITY
  for (const outputPath of GENERATED_OUTPUTS) {
    const outputMtime = await readMtimeMs(outputPath)
    if (outputMtime === null) {
      missingOutputs.push(outputPath)
      continue
    }
    oldestOutputMtime = Math.min(oldestOutputMtime, outputMtime)
  }

  const hasMissingOutput = missingOutputs.length > 0
  const hasStaleOutput = oldestOutputMtime < newestSourceMtime
  if (!hasMissingOutput && !hasStaleOutput) {
    console.log('[wasm:ensure] rule engine outputs are up to date.')
    return
  }

  // Print one concise reason so developers can tell why rebuild was requested.
  if (hasMissingOutput) {
    const missingLabels = missingOutputs.map((filePath) => path.relative(REPO_ROOT, filePath)).join(', ')
    console.log(`[wasm:ensure] rebuilding (missing outputs: ${missingLabels})`)
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
}

await ensureRuleEngineWasm()
