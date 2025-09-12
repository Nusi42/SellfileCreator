// Dump HSFR-readable configs from the compiled test cases.
// Usage: npm run tests:extract
// Writes: docs/tests.extracted.hsfr.json

import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

// Prevent the test module from executing its runner when imported
process.env.HSFR_DUMP = '1'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Path to compiled tests module
const compiled = resolve(__dirname, '.tmp', 'tests', 'test-hsfr-e2e.js')

/** @type {{ CASES?: ReadonlyArray<{ name: string; hsfr: Record<string, unknown> }> }} */
const mod = await import(pathToFileURL(compiled).href)

if (!mod || !Array.isArray(mod.CASES)) {
  throw new Error('Failed to load CASES from compiled tests. Did compilation run?')
}

const configs = mod.CASES.map(c => {
  // Start from hsfr to preserve any explicit keep/enabled; then set stable name.
  const hsfr = { ...(c.hsfr || {}), name: c.name }
  if (!('keep' in hsfr)) hsfr.keep = true
  if (!('enabled' in hsfr)) hsfr.enabled = true
  return hsfr
})

const output = {
  Version: 'tests-extracted',
  Configs: configs,
}

const outDir = resolve(__dirname, '..', 'docs')
mkdirSync(outDir, { recursive: true })
const outPath = resolve(outDir, 'tests.extracted.hsfr')
writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8')
console.log(`Wrote ${configs.length} configs to ${outPath}`)
