// Regenerate named fixture .hsf files using the compiled test pipeline.
// Usage: node scripts/test/regen-fixtures.mjs <base1> [<base2> ...]
// Example: node scripts/test/regen-fixtures.mjs three-substats-all-min-1-minrequiredrolls-3-early
//
// Requires: tsc -p tsconfig.tests.json && node scripts/tooling/patch-esm-specifiers.cjs
// After rebuilding WASM, also sync tmp/tsc/tests/src/lib/wasm/generated/ from src/lib/wasm/generated/
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = fileURLToPath(import.meta.url)
const root = resolve(dirname(here), '..', '..')
const compiled = (p) => resolve(root, 'tmp', 'tsc', 'tests', p)

// File:// fetch shim so WASM can load from disk in Node.
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url)
  if (typeof url === 'string' && url.startsWith('file://')) {
    const { readFile } = await import('node:fs/promises')
    const bytes = await readFile(new URL(url))
    return new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'application/wasm' } })
  }
  return originalFetch(input, init)
}

// Warmup WASM before importing build helpers.
const { warmupWasmRuleEngine } = await import(pathToFileURL(compiled('src/lib/wasm/wasmRuleEngine.js')).href)
await warmupWasmRuleEngine()

const { parseSfcObject } = await import(pathToFileURL(compiled('src/lib/sfcIO.js')).href)
const { computeMergedRules } = await import(pathToFileURL(compiled('src/lib/merge.js')).href)
const { cleanHsfForExport } = await import(pathToFileURL(compiled('src/lib/hsfIO.js')).href)
const { defaultSubstatTargets } = await import(pathToFileURL(compiled('src/lib/hsfBuilder.js')).href)

function stripRuleMetadata(rules) {
  return (rules || []).map((rule) => {
    const { __lineIdx: _li, __allKnownSets: _aks, __source: _src, RecipeID: _rid, RecipeName: _rn, ...rest } = rule ?? {}
    return rest
  })
}

const bases = process.argv.slice(2)
if (bases.length === 0) {
  console.error('Usage: node scripts/test/regen-fixtures.mjs <base1> [<base2> ...]')
  process.exit(1)
}

const fixturesDir = resolve(root, 'tests', 'fixtures')

for (const base of bases) {
  const sfcPath = resolve(fixturesDir, `${base}.sfc`)
  const hsfPath = resolve(fixturesDir, `${base}.hsf`)

  const sfc = JSON.parse(readFileSync(sfcPath, 'utf8'))
  const parsed = parseSfcObject(sfc, { metasets: [], substatTargets: defaultSubstatTargets() })
  const merged = computeMergedRules({
    hsf: null,
    customRecipes: parsed.recipes,
    metasets: parsed.metasets,
    substatTargets: parsed.substatTargets,
    ...(parsed.finalSellRemainder !== null ? { finalSellRemainder: parsed.finalSellRemainder } : {}),
  })
  const exported = cleanHsfForExport(merged)
  const rules = stripRuleMetadata(exported.Rules)

  writeFileSync(hsfPath, JSON.stringify(rules, null, 2) + '\n', 'utf8')
  console.log(`Wrote ${rules.length} rules → ${hsfPath}`)
}
