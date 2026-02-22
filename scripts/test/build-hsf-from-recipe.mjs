// Build raw HSF rules array from a single readable SFR config object (not a container).
// Usage: echo '{...config...}' | node scripts/test/build-hsf-from-recipe.mjs > out.hsf
import { readFileSync } from 'node:fs'
import path from 'node:path'
const ROOT = process.cwd()
// Use the compiled test output for library imports.
const OUTDIR = path.join(ROOT, 'tmp', 'tsc', 'tests')

async function main() {
  const text = readFileSync(0, 'utf8')
  const input = JSON.parse(text)
  const { normalizeRecipe } = await import(path.join(OUTDIR, 'src/lib/sfrIO.js'))
  const { buildHsfRules, defaultSubstatTargets } = await import(path.join(OUTDIR, 'src/lib/hsfBuilder.js'))
  const cfg = normalizeRecipe(input)
  const rules = buildHsfRules(cfg, defaultSubstatTargets())
  console.log(JSON.stringify(rules, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })
