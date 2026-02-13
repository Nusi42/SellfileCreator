#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

// Keep the required wasm compilation target in one constant so checks and
// output messaging stay aligned if we ever switch targets.
const REQUIRED_WASM_TARGET = 'wasm32-unknown-unknown'

// Prefix every line so install logs remain searchable in long npm output.
const LOG_PREFIX = '[wasm:toolchain-check]'

// Spawn commands without a shell so command resolution mirrors real script use.
const run = (command, args) =>
  spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
  })

// Build per-command fallback candidates so we can probe environments where PATH
// is incomplete (common when switching between WSL and native Windows shells).
const commandCandidates = (command) => {
  const candidates = [command]
  const cargoHome = process.env.CARGO_HOME ?? path.join(os.homedir(), '.cargo')
  const binaryExt = process.platform === 'win32' ? '.exe' : ''
  candidates.push(path.join(cargoHome, 'bin', `${command}${binaryExt}`))
  return candidates
}

// Format command snippets once so diagnostics stay consistent and copyable.
const cmd = (command, args) => [command, ...args].join(' ')

// Print helper keeps all script output tagged and easy to grep in transcripts.
const log = (message) => {
  console.log(`${LOG_PREFIX} ${message}`)
}

// Error helper routes failures to stderr while keeping the same prefix shape.
const logError = (message) => {
  console.error(`${LOG_PREFIX} ${message}`)
}

// Keep requirement checks data-driven so adding/removing tools remains a small
// config edit instead of branching logic duplication.
const REQUIRED_COMMANDS = [
  {
    command: 'rustc',
    args: ['--version'],
    missingHelp: 'Install Rust for this environment: https://rustup.rs',
  },
  {
    command: 'cargo',
    args: ['--version'],
    missingHelp: 'Install Rust for this environment: https://rustup.rs',
  },
  {
    command: 'rustup',
    args: ['--version'],
    missingHelp: 'Install rustup for this environment: https://rustup.rs',
  },
  {
    command: 'wasm-bindgen',
    args: ['--version'],
    missingHelp: 'Install wasm-bindgen CLI: cargo install wasm-bindgen-cli',
  },
]

// Check one command and return structured data for unified reporting.
const checkCommand = (entry) => {
  const attempts = []
  for (const candidate of commandCandidates(entry.command)) {
    const result = run(candidate, entry.args)
    attempts.push({ candidate, result })
    // Treat status=0 as success even when Node surfaces a non-fatal error field.
    if (result.status === 0) {
      return {
        ok: true,
        command: entry.command,
        version: result.stdout.trim(),
      }
    }
  }

  const failedAttempt = attempts.at(-1)
  const failedResult = failedAttempt?.result
  return {
    ok: false,
    command: entry.command,
    invocation: cmd(entry.command, entry.args),
    help: entry.missingHelp,
    detail: failedResult?.error?.message ?? failedResult?.stderr?.trim() ?? 'unknown error',
  }
}

// Parse installed target lines so we can validate the wasm target explicitly.
const parseInstalledTargets = (rawOutput) =>
  rawOutput
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

// Check target installation only after rustup itself passed availability checks.
const checkRequiredWasmTarget = () => {
  // Probe rustup from PATH first, then cargo-home fallback when needed.
  const candidates = commandCandidates('rustup')
  let result = null
  for (const candidate of candidates) {
    const attempt = run(candidate, ['target', 'list', '--installed'])
    if (attempt.status === 0) {
      result = attempt
      break
    }
    result = attempt
  }

  // Fail only when every attempt returned a non-zero status.
  if (!result || result.status !== 0) {
    return {
      ok: false,
      help: `Run: rustup target add ${REQUIRED_WASM_TARGET}`,
      detail: result?.error?.message ?? result?.stderr?.trim() ?? 'unknown error',
    }
  }

  const installedTargets = parseInstalledTargets(result.stdout)
  if (!installedTargets.includes(REQUIRED_WASM_TARGET)) {
    return {
      ok: false,
      help: `Run: rustup target add ${REQUIRED_WASM_TARGET}`,
      detail: `Installed targets: ${installedTargets.join(', ') || '(none)'}`,
    }
  }

  return { ok: true }
}

// Execute all command checks first so output includes all missing pieces at once
// instead of failing one-by-one across repeated npm install attempts.
const commandResults = REQUIRED_COMMANDS.map(checkCommand)
const failedCommands = commandResults.filter((result) => result.ok === false)

// Report successful version probes so WSL/Windows context is obvious in logs.
for (const result of commandResults) {
  if (result.ok) log(`${result.command}: ${result.version}`)
}

// If required binaries are missing, print a grouped actionable failure summary.
if (failedCommands.length > 0) {
  logError(`missing or broken Rust/WASM tools in ${process.platform}:`)
  for (const failure of failedCommands) {
    logError(`- ${failure.invocation}`)
    logError(`  detail: ${failure.detail}`)
    logError(`  fix: ${failure.help}`)
  }
  process.exit(1)
}

// Validate that the current environment has the wasm32 target available too.
const targetCheck = checkRequiredWasmTarget()
if (!targetCheck.ok) {
  logError(`missing target ${REQUIRED_WASM_TARGET} in ${process.platform}`)
  logError(`detail: ${targetCheck.detail}`)
  logError(`fix: ${targetCheck.help}`)
  process.exit(1)
}

// Explicit success line keeps install output short but confirms all checks ran.
log(`toolchain ready for ${process.platform} (${REQUIRED_WASM_TARGET})`)
