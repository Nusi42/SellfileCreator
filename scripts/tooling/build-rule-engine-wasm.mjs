#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Resolve absolute paths once so every command can run from any cwd.
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
// Workspace root contains both crates; cargo must be invoked from here so that
// the shared Cargo.lock and profile overrides (e.g. js-sys opt-level cap) apply.
const WORKSPACE_DIR = path.join(REPO_ROOT, 'wasm')
// The cdylib crate is rule_engine_wasm; core logic lives in rule_engine_core.
const CRATE_NAME = 'rule_engine_wasm'
const OUT_DIR = path.join(REPO_ROOT, 'src', 'lib', 'wasm', 'generated')

// Keep profile logic centralized so command selection is deterministic.
const PROFILE = process.env.WASM_RULE_ENGINE_PROFILE ?? 'release'
const TARGET_DIR_NAME = PROFILE === 'release' ? 'release' : 'debug'
const REQUIRED_TARGET = 'wasm32-unknown-unknown'

// Probe commands from PATH first, then cargo-home fallback for WSL/Windows.
const commandCandidates = (command) => {
  const candidates = [command]
  const cargoHome = process.env.CARGO_HOME ?? path.join(os.homedir(), '.cargo')
  const binaryExt = process.platform === 'win32' ? '.exe' : ''
  candidates.push(path.join(cargoHome, 'bin', `${command}${binaryExt}`))
  return candidates
}

// Resolve one executable path so later invocations use the same binary.
const resolveCommand = (command) => {
  for (const candidate of commandCandidates(command)) {
    const probe = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      shell: false,
    })
    if (probe.status === 0) return candidate
  }
  return null
}

// Run command and exit immediately on failure so callers get exact status.
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

// Resolve build tools up-front so failures are clear and actionable.
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

// Regenerate shared constants first so TS and Rust sentinels stay in sync.
run(process.execPath, [path.join(REPO_ROOT, 'scripts', 'tooling', 'generate-domain-constants.mjs')])
// Regenerate the wasm-rule wire-format field maps (TS helpers + Rust consts)
// from shared/wasm-rule-wire-fields.json.  The Rust unit test in the
// wire_format module uses these consts to verify the hand-written
// #[serde(rename)] attrs did not drift from the SSOT.
run(process.execPath, [path.join(REPO_ROOT, 'scripts', 'tooling', 'generate-wasm-rule-wire-fields.mjs')])

// Build crate for wasm32 using selected profile and deterministic strip default.
// Run from workspace root so the shared Cargo.toml profile overrides take effect.
const cargoEnv = { ...process.env }
if (PROFILE === 'release' && !cargoEnv.CARGO_PROFILE_RELEASE_STRIP) {
  cargoEnv.CARGO_PROFILE_RELEASE_STRIP = 'none'
}
const cargoArgs =
  PROFILE === 'release'
    ? ['build', '--release', '--target', REQUIRED_TARGET, '-p', CRATE_NAME]
    : ['build', '--target', REQUIRED_TARGET, '-p', CRATE_NAME]
// Enable get_allocator_counters_value() and AllocatorCounters in the WASM binary.
// Useful for diagnosing heap fragmentation without a full profiler.
if (process.env.WASM_DEV_DIAGNOSTICS === '1') {
  cargoArgs.push('--features', 'rule_engine_wasm/dev-diagnostics')
}
run(cargoBin, cargoArgs, { cwd: WORKSPACE_DIR, env: cargoEnv })

// Regenerate wasm-bindgen outputs consumed by TS imports/runtime.
// The wasm binary is named after the cdylib crate (rule_engine_wasm); --out-name
// keeps the generated JS/TS files named rule_engine.* for TS import compatibility.
fs.mkdirSync(OUT_DIR, { recursive: true })
run(wasmBindgenBin, [
  path.join(WORKSPACE_DIR, 'target', REQUIRED_TARGET, TARGET_DIR_NAME, `${CRATE_NAME}.wasm`),
  '--target',
  'web',
  '--out-dir',
  OUT_DIR,
  '--out-name',
  'rule_engine',
])
