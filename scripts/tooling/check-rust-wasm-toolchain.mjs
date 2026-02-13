#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

// Keep required versions/targets in one place so check + bootstrap behavior
// stays synchronized across every call site.
const REQUIRED_WASM_TARGET = 'wasm32-unknown-unknown'
const REQUIRED_WASM_BINDGEN_VERSION = '0.2.108'
const AUTO_FIX = process.argv.includes('--fix')

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
  // Start with plain command lookup so system PATH takes precedence.
  const candidates = [command]
  // Resolve cargo home once so we can test explicit binary paths too.
  const cargoHome = process.env.CARGO_HOME ?? path.join(os.homedir(), '.cargo')
  // Windows binaries use .exe while Linux/macOS binaries do not.
  const binaryExt = process.platform === 'win32' ? '.exe' : ''
  // Add cargo-home fallback so custom shells still locate installed tools.
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

// Execute candidate binaries in order and capture each attempt result so
// diagnostics can report what we tried when a check fails.
const runCommandCandidates = (command, args) => {
  const attempts = []
  for (const candidate of commandCandidates(command)) {
    const result = run(candidate, args)
    attempts.push({ candidate, result })
    // Treat status=0 as success even if Node still surfaces a non-fatal error.
    if (result.status === 0) return { ok: true, attempts, winner: candidate, result }
  }
  return { ok: false, attempts, winner: null, result: attempts.at(-1)?.result ?? null }
}

// Check one command and return structured data for unified reporting.
const checkCommand = (entry) => {
  // Reuse common candidate runner so command probing is consistent.
  const probe = runCommandCandidates(entry.command, entry.args)
  // Successful probe returns parsed version text for reporting.
  if (probe.ok) return { ok: true, command: entry.command, version: probe.result.stdout.trim() }
  // Failed probe returns actionable command + error detail fields.
  const failedResult = probe.result
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

// Resolve a command executable path (from PATH or cargo-home fallback) so
// installer actions can invoke the same binary family the checks used.
const resolveCommandPath = (command) => {
  const probe = runCommandCandidates(command, ['--version'])
  return probe.ok ? probe.winner : null
}

// Install wasm-bindgen via cargo when requested and when cargo is available.
const installWasmBindgen = () => {
  // Resolve cargo path using the same candidate strategy as the checks.
  const cargoBin = resolveCommandPath('cargo')
  // Without cargo we cannot self-heal; caller handles final failure summary.
  if (!cargoBin) return false
  // Emit a clear action line so install logs show we entered auto-fix.
  log(`auto-fix: installing wasm-bindgen-cli ${REQUIRED_WASM_BINDGEN_VERSION}`)
  // Use --locked for reproducible dependency resolution on user machines.
  const result = run(cargoBin, [
    'install',
    '--locked',
    'wasm-bindgen-cli',
    '--version',
    REQUIRED_WASM_BINDGEN_VERSION,
  ])
  // Stream rust error text so failures include real cargo context.
  if (result.stdout?.trim()) console.log(result.stdout.trim())
  if (result.stderr?.trim()) console.error(result.stderr.trim())
  // Return true only on successful install.
  return result.status === 0
}

// Ensure wasm32 target is available when rustup exists and auto-fix is active.
const installWasmTarget = () => {
  // Resolve rustup path using the same probing strategy as checks.
  const rustupBin = resolveCommandPath('rustup')
  // Without rustup we cannot install targets automatically.
  if (!rustupBin) return false
  // Emit a concise action line for postinstall logs.
  log(`auto-fix: adding rust target ${REQUIRED_WASM_TARGET}`)
  // Install only the required target used by our wasm rule-engine build.
  const result = run(rustupBin, ['target', 'add', REQUIRED_WASM_TARGET])
  // Forward rustup output to keep troubleshooting straightforward.
  if (result.stdout?.trim()) console.log(result.stdout.trim())
  if (result.stderr?.trim()) console.error(result.stderr.trim())
  // Return true only when rustup reports successful install.
  return result.status === 0
}

// Check target installation only after rustup itself passed availability checks.
const checkRequiredWasmTarget = () => {
  // Probe rustup exactly once via shared candidate strategy.
  const probe = runCommandCandidates('rustup', ['target', 'list', '--installed'])
  // If rustup cannot run, return actionable guidance.
  if (!probe.ok || !probe.result) {
    return {
      ok: false,
      help: `Run: rustup target add ${REQUIRED_WASM_TARGET}`,
      detail: probe.result?.error?.message ?? probe.result?.stderr?.trim() ?? 'unknown error',
    }
  }

  // Parse installed target list and verify required wasm target exists.
  const installedTargets = parseInstalledTargets(probe.result.stdout)
  if (!installedTargets.includes(REQUIRED_WASM_TARGET)) {
    return {
      ok: false,
      help: `Run: rustup target add ${REQUIRED_WASM_TARGET}`,
      detail: `Installed targets: ${installedTargets.join(', ') || '(none)'}`,
    }
  }

  return { ok: true }
}

// Run full command probe, optionally auto-fix missing components, then re-check.
const runFullCheck = () => {
  // Initial checks report what is currently available in this environment.
  const initialCommandResults = REQUIRED_COMMANDS.map(checkCommand)
  // Build missing list once for optional auto-fix path.
  const initialFailedCommands = initialCommandResults.filter((result) => result.ok === false)

  // Log command versions from first pass so platform state is visible upfront.
  for (const result of initialCommandResults) {
    if (result.ok) log(`${result.command}: ${result.version}`)
  }

  // Auto-fix attempts run only when explicitly requested via --fix mode.
  if (AUTO_FIX && initialFailedCommands.length > 0) {
    // Missing wasm-bindgen is the only binary we can bootstrap ourselves.
    const wasmBindgenMissing = initialFailedCommands.some((failure) => failure.command === 'wasm-bindgen')
    if (wasmBindgenMissing) installWasmBindgen()
  }

  // Check target state after optional command bootstrap.
  let targetCheck = checkRequiredWasmTarget()
  // Auto-fix missing target when requested and rustup is available.
  if (AUTO_FIX && !targetCheck.ok) {
    installWasmTarget()
    targetCheck = checkRequiredWasmTarget()
  }

  // Re-run command checks once after optional auto-fix attempts.
  const finalCommandResults = REQUIRED_COMMANDS.map(checkCommand)
  const finalFailedCommands = finalCommandResults.filter((result) => result.ok === false)

  // If any required command still fails, print grouped actionable diagnostics.
  if (finalFailedCommands.length > 0) {
    logError(`missing or broken Rust/WASM tools in ${process.platform}:`)
    for (const failure of finalFailedCommands) {
      logError(`- ${failure.invocation}`)
      logError(`  detail: ${failure.detail}`)
      logError(`  fix: ${failure.help}`)
    }
    process.exit(1)
  }

  // Target failure after optional auto-fix still blocks install/build.
  if (!targetCheck.ok) {
    logError(`missing target ${REQUIRED_WASM_TARGET} in ${process.platform}`)
    logError(`detail: ${targetCheck.detail}`)
    logError(`fix: ${targetCheck.help}`)
    process.exit(1)
  }

  // Success line stays short but confirms install/check completed end-to-end.
  log(`toolchain ready for ${process.platform} (${REQUIRED_WASM_TARGET})`)
}

runFullCheck()
