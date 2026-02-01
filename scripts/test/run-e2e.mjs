#!/usr/bin/env node

// Run Playwright browsers sequentially without short-circuiting on failure.

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

// Capture the script directory so path math is deterministic.
const here = fileURLToPath(new URL('.', import.meta.url))
// Anchor child runs at the repo root for consistent relative paths.
const root = join(here, '..', '..')

// Enumerate the browser scripts in the desired execution order.
// Keep the names here so test:e2e remains the single source of truth.
// Each entry pairs a friendly name with its npm script.
const browserRuns = [
  { name: 'chromium', script: 'test:e2e:chromium' },
  { name: 'firefox', script: 'test:e2e:firefox' },
  { name: 'webkit', script: 'test:e2e:webkit' },
]
// Shared report root so we can emit a combined index after all runs.
const reportRoot = join(root, 'test-results', 'reports')

// Prefer npm_execpath when available to stay cross-platform inside npm scripts.
// This avoids relying on shell resolution for npm.cmd on Windows.
// Capture the npm CLI path when we are inside an npm lifecycle.
const npmExecPath = process.env.npm_execpath
// Build the base command and arguments so we avoid shell-specific behaviors.
// Fall back to npm on PATH when run outside the npm lifecycle.
const npmCommand = npmExecPath ? process.execPath : 'npm'
// Prefix args with the npm CLI path when we invoke via node.
const npmArgsPrefix = npmExecPath ? [npmExecPath] : []

// Track failures so we still run all browsers before exiting non-zero.
// This is the key difference from chained npm scripts.
const failures = []

// Execute the configured runs in order so failures never skip later browsers.
for (const run of browserRuns) {
  // Run each browser suite sequentially to keep the Vite server stable.
  // Sequential runs also preserve ordering in the combined console output.
  // Build the npm invocation for the current browser suite.
  const runArgs = [...npmArgsPrefix, 'run', run.script]
  // Mirror child output to keep console logs chronological and complete.
  const result = spawnSync(npmCommand, runArgs, {
    stdio: 'inherit',
    // Keep the working directory stable so relative paths resolve correctly.
    cwd: root,
    // Pass through env so Playwright config and NODE_OPTIONS stay intact.
    env: process.env,
  })

  // Treat spawn errors as failures but continue to the next browser.
  // We still want to attempt the remaining engines for coverage.
  if (result.error) {
    console.error(`[test:e2e] ${run.name} failed to start: ${result.error.message}`)
    // Record the browser name so the summary points to the failing suite.
    failures.push(run.name)
    continue
  }

  // Normalize non-zero exit codes (including signal exits) into a failure.
  // This keeps the summary consistent across platforms and signals.
  // Prefer the explicit status when available; fall back to failure on signals.
  const exitCode = typeof result.status === 'number' ? result.status : 1
  if (exitCode !== 0) {
    // Keep a simple list for the final failure summary.
    failures.push(run.name)
  }
}

// Summarize failures after all browsers have run.
// Exit non-zero so CI and local scripts still fail fast.
if (failures.length > 0) {
  console.error(`[test:e2e] failed browsers: ${failures.join(', ')}`)
  // Still write the combined report index for quick navigation.
  writeCombinedReportIndex(reportRoot, browserRuns)
  process.exit(1)
}
// Exit cleanly when all browser suites succeed.
// Still write the combined report index for quick navigation.
writeCombinedReportIndex(reportRoot, browserRuns)

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
