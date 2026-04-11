#!/usr/bin/env node
// Ensures the lean dungeon-simulator WASM binary is up to date.
// Mirrors ensure-rule-engine-wasm.mjs but tracks the dsim crate sources and outputs.
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const WORKSPACE_DIR = path.join(REPO_ROOT, 'wasm')
const RULE_ENGINE_CORE_SRC_DIR = path.join(WORKSPACE_DIR, 'rule_engine_core', 'src')
const RULE_ENGINE_DSIM_SRC_DIR = path.join(WORKSPACE_DIR, 'rule_engine_dsim_wasm', 'src')
const GENERATED_OUT_DIR = path.join(REPO_ROOT, 'src', 'lib', 'wasm', 'generated')

const GENERATED_OUTPUTS = [
  path.join(GENERATED_OUT_DIR, 'rule_engine_dsim.js'),
  path.join(GENERATED_OUT_DIR, 'rule_engine_dsim.d.ts'),
  path.join(GENERATED_OUT_DIR, 'rule_engine_dsim_bg.wasm'),
  path.join(GENERATED_OUT_DIR, 'rule_engine_dsim_bg.wasm.d.ts'),
]

const DIRECT_RELEVANT_SOURCES = [
  path.join(WORKSPACE_DIR, 'Cargo.toml'),
  path.join(WORKSPACE_DIR, 'Cargo.lock'),
  path.join(WORKSPACE_DIR, 'rule_engine_core', 'Cargo.toml'),
  path.join(WORKSPACE_DIR, 'rule_engine_dsim_wasm', 'Cargo.toml'),
  path.join(REPO_ROOT, 'shared', 'domain-constants.json'),
  path.join(REPO_ROOT, 'scripts', 'tooling', 'generate-domain-constants.mjs'),
  path.join(REPO_ROOT, 'scripts', 'tooling', 'build-rule-engine-dsim-wasm.mjs'),
]

const readMtimeMs = async (filePath) => {
  try {
    const stat = await fs.stat(filePath)
    return stat.mtimeMs
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

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

const ensureRuleEngineDsimWasm = async () => {
  const cargoTargetDir = path.join(WORKSPACE_DIR, 'target')
  let cargoTargetMissing = false
  try {
    await fs.access(cargoTargetDir)
  } catch {
    cargoTargetMissing = true
  }

  const coreSources = await collectFilesRecursively(RULE_ENGINE_CORE_SRC_DIR)
  const dsimSources = await collectFilesRecursively(RULE_ENGINE_DSIM_SRC_DIR)
  const relevantSources = [...DIRECT_RELEVANT_SOURCES, ...coreSources, ...dsimSources]

  let newestSourceMtime = -1
  for (const sourcePath of relevantSources) {
    const sourceMtime = await readMtimeMs(sourcePath)
    if (sourceMtime === null) {
      throw new Error(`Missing dsim wasm source dependency: ${path.relative(REPO_ROOT, sourcePath)}`)
    }
    newestSourceMtime = Math.max(newestSourceMtime, sourceMtime)
  }

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
  if (!hasMissingOutput && !hasStaleOutput && !cargoTargetMissing) {
    console.log('[wasm:ensure] dsim rule engine outputs are up to date.')
    return
  }

  if (hasMissingOutput) {
    const missingLabels = missingOutputs.map((filePath) => path.relative(REPO_ROOT, filePath)).join(', ')
    console.log(`[wasm:ensure] rebuilding dsim (missing outputs: ${missingLabels})`)
  } else if (cargoTargetMissing) {
    console.log('[wasm:ensure] rebuilding dsim (cargo target/ absent — cargo clean was run).')
  } else {
    console.log('[wasm:ensure] rebuilding dsim (sources changed after generated outputs).')
  }

  const buildScriptPath = path.join(REPO_ROOT, 'scripts', 'tooling', 'build-rule-engine-dsim-wasm.mjs')
  const buildResult = spawnSync(process.execPath, [buildScriptPath], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  })

  if (buildResult.error) throw buildResult.error
  if ((buildResult.status ?? 1) !== 0) process.exit(buildResult.status ?? 1)
}

await ensureRuleEngineDsimWasm()
