/**
 * print-game-assets-dir — prints the asset pack directory a release build embeds, or an
 * empty line when none is configured. release-win.ps1 uses it to check and tag the same
 * pack the build reads, without re-implementing the lookup in PowerShell.
 *
 *   node scripts/tooling/print-game-assets-dir.mjs
 */
import { fileURLToPath } from 'node:url'
// Node runs the TypeScript module directly (type stripping), as vite.config.ts does.
import { loadSfcEnv, resolveGameAssetsDir } from '../vite/gameAssetsDir.ts'

// Release builds run `vite build` in the default production mode from the repo root.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
console.log(resolveGameAssetsDir(loadSfcEnv('production', repoRoot)) ?? '')
