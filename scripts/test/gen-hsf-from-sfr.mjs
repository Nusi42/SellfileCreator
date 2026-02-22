// Generate an HSF rules array from a readable recipe bundle (.sfr / legacy .hsfc).
// Usage: node scripts/test/gen-hsf-from-sfr.mjs tests/fixtures/<base>.sfr > tests/fixtures/<base>.hsf
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(import.meta.url)
// Resolve repo root from scripts/test.
const root = resolve(dirname(here), '..', '..')
// Reference compiled test libs emitted under tmp/tsc/tests.
const compiled = (p) => resolve(root, 'tmp', 'tsc', 'tests', p)

// Import compiled test libs (must run after `tsc -p tsconfig.tests.json` and patch script).
const { normalizeRecipe } = await import(fileURLToPath(new URL('file://' + compiled('src/lib/sfrIO.js').replace(/\\/g,'/'))))
const { buildHsfRules } = await import(fileURLToPath(new URL('file://' + compiled('src/lib/hsfBuilder.js').replace(/\\/g,'/'))))

const inputPath = process.argv[2]
if (!inputPath) { console.error('Provide SFR path'); process.exit(1) }
const sfr = JSON.parse(readFileSync(inputPath, 'utf8'))
let recipeInput
if (Array.isArray(sfr?.Recipes)) recipeInput = sfr.Recipes[0]
else if (Array.isArray(sfr)) recipeInput = sfr[0]
else recipeInput = sfr
const recipe = normalizeRecipe(recipeInput)
const rules = buildHsfRules(recipe)
process.stdout.write(JSON.stringify(rules, null, 2))
