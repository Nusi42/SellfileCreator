#!/usr/bin/env node

// Run the Playwright browser suites sequentially without short-circuiting on failure.
//
// Build + serve ONCE for the whole matrix: previously every browser suite (and, within a
// suite, the parallel run then the perf run) rebuilt the bundle and restarted Vite — up to
// ~6 redundant builds per full run. Here we build once, start a single shared `vite preview`,
// and point every browser suite at it via E2E_EXTERNAL_SERVER=1 (the Playwright config then
// serves-and-reuses instead of build-and-start). The shared server is owned by THIS process
// and torn down only after all suites finish.
//
// Two tiers, selected by E2E_FULL:
//   - dev (default): FHD-only viewport projects, short iteration counts. Fast inner loop.
//   - full (E2E_FULL=1, set by release:win): both viewports, full iteration counts.

import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import net from 'node:net'

// Capture the script directory so path math is deterministic.
const here = fileURLToPath(new URL('.', import.meta.url))
// Anchor child runs at the repo root for consistent relative paths.
const root = join(here, '..', '..')

// Full tier when --full is passed (test:e2e:full / release:win) or E2E_FULL=1 is set; dev
// tier otherwise. The --full flag keeps the npm scripts cross-platform (no env-prefix that
// would need cross-env on Windows). We export E2E_FULL=1 to the child suites below so the
// specs' iteration-count helper picks the full counts.
const isFull = process.argv.includes('--full') || process.env.E2E_FULL === '1'

// Browser suites in execution order. The :full scripts add the 1280×720 viewport project
// on top of the FHD project; the dev scripts run FHD only. (webkit is intentionally not in
// the historical matrix here — order is chromium → firefox.)
const browserRuns = isFull
  ? [
      { name: 'chromium', script: 'test:e2e:chromium:full' },
      { name: 'firefox', script: 'test:e2e:firefox:full' },
    ]
  : [
      { name: 'chromium', script: 'test:e2e:chromium' },
      { name: 'firefox', script: 'test:e2e:firefox' },
    ]

// Shared report root so we can emit a combined index after all runs.
const reportRoot = join(root, 'test-results', 'reports')

// Resolve the per-clone preview port the same way playwright.config.ts does (djb2 hash of
// cwd → 5180–5279), honoring an explicit PLAYWRIGHT_PORT override. Keeping the math in sync
// lets us wait on the shared server before launching the suites.
const PREVIEW_PORT_RANGE_START = 5180
const PREVIEW_PORT_RANGE_SIZE = 100
function hashCwdToPort(cwd) {
  let hash = 5381
  for (let index = 0; index < cwd.length; index += 1) {
    hash = ((hash << 5) + hash + cwd.charCodeAt(index)) | 0
  }
  return PREVIEW_PORT_RANGE_START + (Math.abs(hash) % PREVIEW_PORT_RANGE_SIZE)
}
const previewPort = process.env.PLAYWRIGHT_PORT
  ? Number.parseInt(process.env.PLAYWRIGHT_PORT, 10)
  : hashCwdToPort(root)

// Prefer npm_execpath when available to stay cross-platform inside npm scripts.
const npmExecPath = process.env.npm_execpath
const npmCommand = npmExecPath ? process.execPath : 'npm'
const npmArgsPrefix = npmExecPath ? [npmExecPath] : []

// Poll a TCP port until something is listening (the shared preview server) or we time out.
function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, '127.0.0.1')
      socket.once('connect', () => { socket.destroy(); resolve() })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) { reject(new Error(`preview server never came up on :${port}`)); return }
        setTimeout(attempt, 250)
      })
    }
    attempt()
  })
}

// Track failures so we still run all browsers before exiting non-zero.
const failures = []
// Holds the shared preview server child so we can always tear it down.
let sharedServer = null

async function main() {
  // 1) Build the prod-like bundle ONCE (VITE_TEST_HOOKS=1 keeps the ?logWasmHeap probes in).
  console.log('[test:e2e] building bundle once for the whole matrix...')
  const build = spawnSync(npmCommand, [...npmArgsPrefix, 'run', 'build'], {
    stdio: 'inherit', cwd: root, env: { ...process.env, VITE_TEST_HOOKS: '1' },
  })
  if ((typeof build.status === 'number' ? build.status : 1) !== 0) {
    console.error('[test:e2e] build failed; aborting')
    process.exit(1)
  }

  // 2) Start a single shared `vite preview` and keep it alive across all suites.
  console.log(`[test:e2e] starting shared preview server on :${previewPort}...`)
  sharedServer = spawn(
    npmCommand,
    [...npmArgsPrefix, 'run', 'preview', '--', '--host', '127.0.0.1', '--port', String(previewPort)],
    { stdio: 'inherit', cwd: root, env: { ...process.env, VITE_TEST_HOOKS: '1' } },
  )
  await waitForPort(previewPort, 60_000)
  console.log('[test:e2e] shared preview server is up.')

  // 3) Run each browser suite against the shared server. E2E_EXTERNAL_SERVER=1 makes the
  //    Playwright config serve-and-reuse instead of build-and-start, so no suite rebuilds.
  for (const run of browserRuns) {
    const result = spawnSync(npmCommand, [...npmArgsPrefix, 'run', run.script], {
      stdio: 'inherit',
      cwd: root,
      env: {
        ...process.env,
        E2E_EXTERNAL_SERVER: '1',
        PLAYWRIGHT_PORT: String(previewPort),
        // Propagate the tier so the specs' iteration-count helper picks full counts.
        ...(isFull ? { E2E_FULL: '1' } : {}),
      },
    })
    if (result.error) {
      console.error(`[test:e2e] ${run.name} failed to start: ${result.error.message}`)
      failures.push(run.name)
      continue
    }
    const exitCode = typeof result.status === 'number' ? result.status : 1
    if (exitCode !== 0) failures.push(run.name)
  }
}

// Always stop the shared server, whatever happened.
function shutdown() {
  if (sharedServer && !sharedServer.killed) {
    try { sharedServer.kill() } catch { /* already gone */ }
    sharedServer = null
  }
}

main()
  .catch((err) => {
    console.error(`[test:e2e] orchestration error: ${err.message}`)
    failures.push('orchestrator')
  })
  .finally(() => {
    shutdown()
    writeCombinedReportIndex(reportRoot, browserRuns)
    if (failures.length > 0) {
      console.error(`[test:e2e] failed browsers: ${failures.join(', ')}`)
      process.exit(1)
    }
  })

function writeCombinedReportIndex(outputRoot, runs) {
  // Ensure the report root exists so we can always write the index file.
  mkdirSync(outputRoot, { recursive: true })
  // Build a minimal HTML index that links to each per-browser report.
  const links = runs.map((run) => (
    `<li><a href="${run.name}/index.html">${run.name}</a></li>`
  ))
  // Keep the markup simple and portable.
  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '  <title>Playwright Reports</title>',
    '  <style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:24px;}a{color:#2563eb;text-decoration:none;}a:hover{text-decoration:underline;}</style>',
    '</head>',
    '<body>',
    '  <h1>Playwright Reports</h1>',
    '  <ul>',
    `    ${links.join('')}`,
    '  </ul>',
    '</body>',
    '</html>',
  ].join('\n')
  // Write the index file so users can navigate reports easily.
  writeFileSync(join(outputRoot, 'index.html'), html, 'utf8')
}
