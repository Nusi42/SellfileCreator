// Build raw HSF rules array from a single readable HSFR config object (not a container).
// Usage: echo '{...config...}' | node scripts/build-hsf-from-config.mjs > out.hsf
import { readFileSync } from 'node:fs'
import path from 'node:path'
const ROOT = process.cwd()
const OUTDIR = path.join(ROOT, 'scripts/.tmp')

async function main() {
  const text = readFileSync(0, 'utf8')
  const input = JSON.parse(text)
  const { normalizeConfig } = await import(path.join(OUTDIR, 'src/lib/hsfrIO.js'))
  const { buildHsfRules, defaultMinima } = await import(path.join(OUTDIR, 'src/lib/hsfBuilder.js'))
  const cfg = normalizeConfig(input)
  const rules = buildHsfRules(cfg, defaultMinima())
  console.log(JSON.stringify(rules, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })

