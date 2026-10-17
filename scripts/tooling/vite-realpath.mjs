#!/usr/bin/env node
// Launch Vite with the working directory spelled as its filesystem realpath.
//
// Why: a checkout may be reached through a Windows junction (e.g. a projects folder
// that points into a synced folder such as OneDrive), so every file has two
// valid spellings. Vite mixes the two conventions internally: it derives lookup keys
// from the literal `process.cwd()`, while esbuild/Rollup report paths relative to the
// realpath (junctions are resolved like Node does everywhere else). The mismatch shows
// up as `vite:build-html` rejecting an entry emitted as `../../<junction target>/.../index.html`
// during `vite build`, and as `Cannot read properties of undefined (reading 'imports')`
// from the dev dependency optimizer.
//
// Fixing this via vite config does not work — `resolve.preserveSymlinks` or a custom
// `cacheDir` only move which side of the mismatch you land on. Normalizing the cwd
// before Vite starts removes the ambiguity at the source.
//
// No-op when the cwd is already its own realpath, so this is safe on any machine.
import { spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { constants as osConstants } from 'node:os'
import { dirname, resolve } from 'node:path'

// Resolve the junction (and any symlink) to the single canonical spelling.
const realCwd = realpathSync(process.cwd())

// Resolve Vite's CLI entry from the installed package rather than a hardcoded path,
// so hoisting layouts and future package moves keep working. Vite 8 does not expose
// `./bin/vite.js` through its `exports` map, so resolve the package.json (which is
// exported) and read the `bin` field off it instead of requiring the bin path directly.
const require = createRequire(import.meta.url)
const vitePkgPath = require.resolve('vite/package.json')
const vitePkg = require(vitePkgPath)
// `bin` is either a string (single command) or a map of command name -> path.
const viteBinRelative = typeof vitePkg.bin === 'string' ? vitePkg.bin : vitePkg.bin?.vite
if (!viteBinRelative) {
  console.error('[vite-realpath] could not locate the vite CLI entry in vite/package.json')
  process.exit(1)
}
const viteBin = resolve(dirname(vitePkgPath), viteBinRelative)

// Forward every CLI argument verbatim (`build`, `--mode web`, `preview`, …).
const child = spawn(process.execPath, [viteBin, ...process.argv.slice(2)], {
  cwd: realCwd,
  stdio: 'inherit',
})

// Re-raise signals into the child so Ctrl-C stops the dev server instead of
// orphaning it or being reported as a build failure.
for (const signalName of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signalName, () => {
    try { child.kill(signalName) } catch { /* already gone */ }
  })
}

child.on('error', (error) => {
  console.error('[vite-realpath] failed to launch vite:', error.message)
  process.exit(1)
})

// Mirror the child's exit status: a signal death maps to the conventional 128+n code.
child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(128 + (osConstants.signals[signal] ?? 0))
  }
  process.exit(code ?? 0)
})
