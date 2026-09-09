#!/usr/bin/env node
// Builds the lean dungeon-simulator WASM binary (rule_engine_dsim_wasm crate).
//
// The dsim binary exports only configure_value + evaluate_value + version.
// All other rule_engine_core symbols are dead-code-eliminated, producing a much
// smaller binary than the full pipeline WASM.  No talc allocator is needed.
//
// Usage:
//   node scripts/tooling/build-rule-engine-dsim-wasm.mjs
//   WASM_RULE_ENGINE_PROFILE=debug node scripts/tooling/build-rule-engine-dsim-wasm.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveProfile, targetDirNameFor, writeProfileStamp } from './wasm-build-profile.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const WORKSPACE_DIR = path.join(REPO_ROOT, 'wasm')
const CRATE_NAME = 'rule_engine_dsim_wasm'
const OUT_DIR = path.join(REPO_ROOT, 'src', 'lib', 'wasm', 'generated')

// Share the same PROFILE env variable as the pipeline WASM build so both can
// be controlled together (e.g., WASM_RULE_ENGINE_PROFILE=debug for fast iteration).
const PROFILE = resolveProfile()
const TARGET_DIR_NAME = targetDirNameFor(PROFILE)
const REQUIRED_TARGET = 'wasm32-unknown-unknown'

const commandCandidates = (command) => {
  const candidates = [command]
  const cargoHome = process.env.CARGO_HOME ?? path.join(os.homedir(), '.cargo')
  const binaryExt = process.platform === 'win32' ? '.exe' : ''
  candidates.push(path.join(cargoHome, 'bin', `${command}${binaryExt}`))
  return candidates
}

const resolveCommand = (command) => {
  for (const candidate of commandCandidates(command)) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8', shell: false })
    if (probe.status === 0) return candidate
  }
  return null
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
    shell: false,
    ...options,
  })
  if (result.error) throw result.error
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1)
}

const cargoBin = resolveCommand('cargo')
if (!cargoBin) {
  console.error('error: cargo not found. Install Rust via rustup for this environment.')
  process.exit(1)
}
const wasmBindgenBin = resolveCommand('wasm-bindgen')
if (!wasmBindgenBin) {
  console.error('error: wasm-bindgen not found. Run: cargo install wasm-bindgen-cli')
  process.exit(1)
}

// The dsim crate depends on rule_engine_core which uses domain constants; regenerate
// them first so the lean binary stays in sync with the full pipeline binary.
run(process.execPath, [path.join(REPO_ROOT, 'scripts', 'tooling', 'generate-domain-constants.mjs')])

// Build the dsim cdylib for wasm32 with the selected profile.
const cargoEnv = { ...process.env }
if (PROFILE === 'release' && !cargoEnv.CARGO_PROFILE_RELEASE_STRIP) {
  cargoEnv.CARGO_PROFILE_RELEASE_STRIP = 'none'
}
const cargoArgs =
  PROFILE === 'release'
    ? ['build', '--release', '--target', REQUIRED_TARGET, '-p', CRATE_NAME]
    : ['build', '--target', REQUIRED_TARGET, '-p', CRATE_NAME]
run(cargoBin, cargoArgs, { cwd: WORKSPACE_DIR, env: cargoEnv })

// Generate wasm-bindgen JS/TS bindings from the compiled WASM.
// --out-name rule_engine_dsim keeps generated files consistently named so
// wasmDsimRuleEngine.ts can import from ./generated/rule_engine_dsim.js.
fs.mkdirSync(OUT_DIR, { recursive: true })
run(wasmBindgenBin, [
  path.join(WORKSPACE_DIR, 'target', REQUIRED_TARGET, TARGET_DIR_NAME, `${CRATE_NAME}.wasm`),
  '--target',
  'web',
  '--out-dir',
  OUT_DIR,
  '--out-name',
  'rule_engine_dsim',
])

// Record which profile produced these outputs so a later release build cannot mistake a
// leftover debug artifact for an up-to-date one.
writeProfileStamp('rule-engine-dsim', PROFILE)
