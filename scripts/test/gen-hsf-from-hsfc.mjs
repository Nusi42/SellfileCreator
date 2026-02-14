// Generate an HSF rules array from a readable recipe bundle (.sfr / legacy .hsfc).
// Usage: node scripts/test/gen-hsf-from-hsfc.mjs tests/fixtures/<base>.sfr > tests/fixtures/<base>.hsf
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(import.meta.url)
// Resolve repo root from scripts/test.
const root = resolve(dirname(here), '..', '..')
// Reference compiled test libs emitted under tmp/tsc/tests.
const compiled = (p) => resolve(root, 'tmp', 'tsc', 'tests', p)

// Import compiled test libs (must run after `tsc -p tsconfig.tests.json` and patch script).
const { normalizeConfig } = await import(fileURLToPath(new URL('file://' + compiled('src/lib/hsfcIO.js').replace(/\\/g,'/'))))
const { buildHsfRules } = await import(fileURLToPath(new URL('file://' + compiled('src/lib/hsfBuilder.js').replace(/\\/g,'/'))))

const inputPath = process.argv[2]
if (!inputPath) { console.error('Provide HSFC path'); process.exit(1) }
const hsfc = JSON.parse(readFileSync(inputPath, 'utf8'))
let cfgInput
if (Array.isArray(hsfc?.Configs)) cfgInput = hsfc.Configs[0]
else if (Array.isArray(hsfc)) cfgInput = hsfc[0]
else cfgInput = hsfc
const cfg = normalizeConfig(cfgInput)
const rules = buildHsfRules(cfg)
process.stdout.write(JSON.stringify(rules, null, 2))
