// Build raw HSF rules array from a single readable HSFC config object (not a container).
// Usage: echo '{...config...}' | node scripts/test/build-hsf-from-config.mjs > out.hsf
import { readFileSync } from 'node:fs'
import path from 'node:path'
const ROOT = process.cwd()
// Use the compiled test output for library imports.
const OUTDIR = path.join(ROOT, 'tmp', 'tsc', 'tests')

async function main() {
  const text = readFileSync(0, 'utf8')
  const input = JSON.parse(text)
  const { normalizeConfig } = await import(path.join(OUTDIR, 'src/lib/hsfcIO.js'))
  const { buildHsfRules, defaultSubstatTargets } = await import(path.join(OUTDIR, 'src/lib/hsfBuilder.js'))
  const cfg = normalizeConfig(input)
  const rules = buildHsfRules(cfg, defaultSubstatTargets())
  console.log(JSON.stringify(rules, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })
