#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveProfile, targetDirNameFor, writeProfileStamp } from './wasm-build-profile.mjs'

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
const PROFILE = resolveProfile()
const TARGET_DIR_NAME = targetDirNameFor(PROFILE)
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

// Read the wasm-bindgen version that Cargo resolved so the CLI always matches.
const cargoLockPath = path.join(WORKSPACE_DIR, 'Cargo.lock')
const requiredWasmBindgenVersion = (() => {
  const lock = fs.readFileSync(cargoLockPath, 'utf8')
  // First [[package]] block whose name = "wasm-bindgen" (not wasm-bindgen-*)
  const match = lock.match(/\[\[package\]\]\s+name = "wasm-bindgen"\s+version = "([^"]+)"/)
  return match?.[1] ?? null
})()
if (!requiredWasmBindgenVersion) {
  console.error('error: could not determine wasm-bindgen version from Cargo.lock')
  process.exit(1)
}

// Ensure the installed wasm-bindgen-cli matches the crate version; auto-install if not.
const ensureWasmBindgen = () => {
  const probe = resolveCommand('wasm-bindgen')
  if (probe) {
    const result = spawnSync(probe, ['--version'], { encoding: 'utf8', shell: false })
    // Output is e.g. "wasm-bindgen 0.2.121"
    const installed = result.stdout?.trim().split(' ')[1]
    if (installed === requiredWasmBindgenVersion) return probe
    console.log(
      `wasm-bindgen CLI ${installed ?? '(unknown)'} ≠ required ${requiredWasmBindgenVersion} — auto-installing...`,
    )
  } else {
    console.log(`wasm-bindgen CLI not found — installing ${requiredWasmBindgenVersion}...`)
  }
  const install = spawnSync(
    cargoBin,
    ['install', '--force', 'wasm-bindgen-cli', '--version', requiredWasmBindgenVersion],
    { stdio: 'inherit', shell: false },
  )
  if ((install.status ?? 1) !== 0) {
    console.error('error: failed to install wasm-bindgen-cli')
    process.exit(install.status ?? 1)
  }
  const resolved = resolveCommand('wasm-bindgen')
  if (!resolved) {
    console.error('error: wasm-bindgen still not found after install')
    process.exit(1)
  }
  return resolved
}
const wasmBindgenBin = ensureWasmBindgen()

// Regenerate shared constants first so TS and Rust sentinels stay in sync.
run(process.execPath, [path.join(REPO_ROOT, 'scripts', 'tooling', 'generate-domain-constants.mjs')])
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
// (dev-diagnostics feature removed with the talc-specific allocator counters.)
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

// Record which profile produced these outputs so a later release build cannot mistake a
// leftover debug artifact for an up-to-date one.
writeProfileStamp('rule-engine', PROFILE)
