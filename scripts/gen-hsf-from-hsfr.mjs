// Generate an HSF rules array from a readable HSFR config file.
// Usage: node scripts/gen-hsf-from-hsfr.mjs tests/fixtures/<base>.hsfr > tests/fixtures/<base>.hsf
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(import.meta.url)
const root = resolve(dirname(here), '..')
const compiled = (p) => resolve(root, 'scripts/.tmp', p)

// Import compiled test libs (must run after `tsc -p tsconfig.tests.json` and patch script)
const { normalizeConfig } = await import(fileURLToPath(new URL('file://' + compiled('src/lib/hsfrIO.js').replace(/\\/g,'/'))))
const { buildHsfRules } = await import(fileURLToPath(new URL('file://' + compiled('src/lib/hsfBuilder.js').replace(/\\/g,'/'))))

const inputPath = process.argv[2]
if (!inputPath) { console.error('Provide HSFR path'); process.exit(1) }
const hsfr = JSON.parse(readFileSync(inputPath, 'utf8'))
let cfgInput
if (Array.isArray(hsfr?.Configs)) cfgInput = hsfr.Configs[0]
else if (Array.isArray(hsfr)) cfgInput = hsfr[0]
else cfgInput = hsfr
const cfg = normalizeConfig(cfgInput)
const rules = buildHsfRules(cfg)
process.stdout.write(JSON.stringify(rules, null, 2))
