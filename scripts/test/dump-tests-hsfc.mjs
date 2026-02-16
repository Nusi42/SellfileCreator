// Dump readable recipe recipes from the compiled test cases.
// Usage: npm run tests:extract
// Writes: examples/tests.extracted.sfr

import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

// Prevent the test module from executing its runner when imported
process.env.HSFC_DUMP = '1'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Path to compiled recipe fixture runner module.
const compiled = resolve(__dirname, '..', '..', 'tmp', 'tsc', 'tests', 'tests', 'integration', 'hsfc-fixtures.runner.js')

/** @type {{ CASES?: ReadonlyArray<{ name: string; hsfc: Record<string, unknown> }> }} */
const mod = await import(pathToFileURL(compiled).href)

if (!mod || !Array.isArray(mod.CASES)) {
  throw new Error('Failed to load CASES from compiled tests. Did compilation run?')
}

const recipes = mod.CASES.map(c => {
  // Start from hsfc to preserve any explicit keep/enabled; then set stable name.
  const hsfc = { ...(c.hsfc || {}), name: c.name }
  if (!('keep' in hsfc)) hsfc.keep = true
  if (!('enabled' in hsfc)) hsfc.enabled = true
  return hsfc
})

const output = {
  Version: 'tests-extracted',
  Recipes: recipes,
}

// Emit into the repo-root examples directory.
const outDir = resolve(__dirname, '..', '..', 'examples')
mkdirSync(outDir, { recursive: true })
const outPath = resolve(outDir, 'tests.extracted.sfr')
writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8')
console.log(`Wrote ${recipes.length} recipes to ${outPath}`)
