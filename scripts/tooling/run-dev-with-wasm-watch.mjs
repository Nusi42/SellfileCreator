#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Resolve the repo root from this script location for deterministic paths.
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')

// Keep the ensure command in one place so startup/watch checks stay aligned.
const ENSURE_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'tooling', 'ensure-rule-engine-wasm.mjs')

// Watch Rust source files recursively, plus lock/config files that change builds.
const WATCH_RECURSIVE_DIRS = [
  path.join(REPO_ROOT, 'wasm', 'rule_engine', 'src'),
]

// Keep direct file watch inputs explicit for predictable rebuild triggers.
const WATCH_DIRECT_FILES = [
  path.join(REPO_ROOT, 'wasm', 'rule_engine', 'Cargo.toml'),
  path.join(REPO_ROOT, 'wasm', 'rule_engine', 'Cargo.lock'),
  path.join(REPO_ROOT, 'shared', 'domain-constants.json'),
]

// Polling avoids platform-specific fs.watch recursion differences.
const WATCH_POLL_INTERVAL_MS = Number(process.env.WASM_DEV_WATCH_POLL_MS ?? 700)

// Prefer npm_execpath for cross-platform npm invocation inside lifecycle scripts.
const npmExecPath = process.env.npm_execpath
const npmCommand = npmExecPath ? process.execPath : 'npm'
const npmArgsPrefix = npmExecPath ? [npmExecPath] : []

// Pass any `npm run dev -- ...` flags through to the underlying Vite command.
const forwardedDevArgs = process.argv.slice(2)

let shuttingDown = false
let pollingInFlight = false
let watcherTimer = null
let knownSnapshot = new Map()
let ensureChild = null
let ensureQueued = false
let viteChild = null

// Run the ensure script once synchronously so dev starts with fresh wasm outputs.
const runEnsureSync = () => {
  const result = spawnSync(process.execPath, [ENSURE_SCRIPT_PATH], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.error) throw result.error
  const exitCode = typeof result.status === 'number' ? result.status : 1
  if (exitCode !== 0) process.exit(exitCode)
}

// Collect all files under a directory recursively so nested Rust modules are covered.
const collectFilesRecursively = async (rootDir) => {
  const files = []
  const walk = async (dirPath) => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
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

// Gather the full watch set while ignoring absent optional paths gracefully.
const collectWatchedFiles = async () => {
  const out = []
  for (const filePath of WATCH_DIRECT_FILES) {
    try {
      const stat = await fs.stat(filePath)
      if (stat.isFile()) out.push(filePath)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
  }
  for (const dirPath of WATCH_RECURSIVE_DIRS) {
    try {
      const stat = await fs.stat(dirPath)
      if (!stat.isDirectory()) continue
      const files = await collectFilesRecursively(dirPath)
      out.push(...files)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
  }
  out.sort((left, right) => left.localeCompare(right))
  return out
}

// Snapshot mtimes so we can detect file edits, additions, and removals.
const captureSnapshot = async () => {
  const files = await collectWatchedFiles()
  const snapshot = new Map()
  for (const filePath of files) {
    const stat = await fs.stat(filePath)
    snapshot.set(filePath, stat.mtimeMs)
  }
  return snapshot
}

// Compare two snapshots without allocations so polling remains cheap.
const snapshotsDiffer = (previous, current) => {
  if (previous.size !== current.size) return true
  for (const [filePath, previousMtime] of previous.entries()) {
    const nextMtime = current.get(filePath)
    if (nextMtime === undefined) return true
    if (nextMtime !== previousMtime) return true
  }
  return false
}

// Spawn ensure asynchronously; queue one extra run if changes arrive mid-build.
const runEnsureAsync = () => {
  if (shuttingDown) return
  if (ensureChild) {
    ensureQueued = true
    return
  }
  console.log('[wasm:watch] change detected; checking wasm outputs...')
  ensureChild = spawn(process.execPath, [ENSURE_SCRIPT_PATH], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  ensureChild.on('error', (error) => {
    console.error(`[wasm:watch] ensure failed to start: ${error.message}`)
  })
  ensureChild.on('exit', (code, signal) => {
    const exitCode = typeof code === 'number' ? code : 1
    if (exitCode !== 0) {
      const signalSuffix = signal ? ` (signal: ${signal})` : ''
      console.error(`[wasm:watch] ensure exited with code ${exitCode}${signalSuffix}`)
    }
    ensureChild = null
    if (ensureQueued) {
      ensureQueued = false
      runEnsureAsync()
    }
  })
}

// Poll once; skip overlapping polls to avoid concurrent directory scans.
const pollForWatchChanges = async () => {
  if (shuttingDown || pollingInFlight) return
  pollingInFlight = true
  try {
    const nextSnapshot = await captureSnapshot()
    if (snapshotsDiffer(knownSnapshot, nextSnapshot)) {
      knownSnapshot = nextSnapshot
      runEnsureAsync()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[wasm:watch] polling error: ${message}`)
  } finally {
    pollingInFlight = false
  }
}

// Keep cleanup centralized so SIGINT/SIGTERM and child exits share behavior.
const stopBackgroundWork = (signalName) => {
  shuttingDown = true
  if (watcherTimer) clearInterval(watcherTimer)
  watcherTimer = null
  if (ensureChild && ensureChild.exitCode === null) {
    try { ensureChild.kill(signalName) } catch { /* ignore */ }
  }
}

// Start the polling loop with an immediate first pass for low-latency edits.
const startWatchPolling = async () => {
  knownSnapshot = await captureSnapshot()
  watcherTimer = setInterval(() => {
    void pollForWatchChanges()
  }, WATCH_POLL_INTERVAL_MS)
}

// Spawn Vite through npm to preserve existing npm lifecycle context and PATH setup.
const startVite = () => {
  const viteArgs = [...npmArgsPrefix, 'run', 'dev:vite']
  if (forwardedDevArgs.length > 0) {
    viteArgs.push('--', ...forwardedDevArgs)
  }
  viteChild = spawn(npmCommand, viteArgs, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  viteChild.on('error', (error) => {
    console.error(`[dev] failed to start Vite: ${error.message}`)
    stopBackgroundWork('SIGTERM')
    process.exit(1)
  })
  viteChild.on('exit', (code, signal) => {
    const exitCode = typeof code === 'number' ? code : signal ? 1 : 0
    stopBackgroundWork(signal ?? 'SIGTERM')
    process.exit(exitCode)
  })
}

// Forward termination signals so Ctrl+C behaves like a normal Vite session.
const registerSignalHandlers = () => {
  const handleSignal = (signalName) => {
    if (shuttingDown) return
    stopBackgroundWork(signalName)
    if (viteChild && viteChild.exitCode === null) {
      try { viteChild.kill(signalName) } catch { /* ignore */ }
      return
    }
    process.exit(0)
  }
  process.on('SIGINT', () => handleSignal('SIGINT'))
  process.on('SIGTERM', () => handleSignal('SIGTERM'))
}

// Preserve old behavior: ensure once, then serve, now with continuous Rust polling.
runEnsureSync()
registerSignalHandlers()
await startWatchPolling()
startVite()
