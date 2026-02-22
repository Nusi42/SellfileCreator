// Generate golden snapshots for all curated cases in tests/integration/sfr-fixtures.runner.ts
// Skips MATRIX auto-generated cases to avoid explosion of files.
// Usage: tsc -p tsconfig.tests.json && node scripts/tooling/patch-esm-specifiers.cjs && node scripts/test/dump-goldens-all.mjs

import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load the compiled fixture runner to reuse its CASES definitions.
const compiled = resolve(__dirname, '..', '..', 'tmp', 'tsc', 'tests', 'tests', 'integration', 'sfr-fixtures.runner.js')
const mod = await import(pathToFileURL(compiled).href)
// Use compiled library code from the same test build output.
const libRoot = resolve(__dirname, '..', '..', 'tmp', 'tsc', 'tests', 'src', 'lib')
const io = await import(pathToFileURL(resolve(libRoot, 'sfrIO.js')).href)
const builder = await import(pathToFileURL(resolve(libRoot, 'hsfBuilder.js')).href)

if (!mod || !Array.isArray(mod.CASES)) {
  throw new Error('Failed to load CASES from compiled tests. Did compilation run?')
}

// Helper: normalize HSF rule to a stable JSON shape
function normalizeRule(rule) {
  const nor = {}
  if (typeof rule.Keep === 'boolean') nor.Keep = rule.Keep
  if (typeof rule.Use === 'boolean') nor.Use = rule.Use
  if (typeof rule.IsRuleTypeAND === 'boolean') nor.IsRuleTypeAND = rule.IsRuleTypeAND
  if (Number.isFinite(Number(rule.Rank))) nor.Rank = Number(rule.Rank)
  if (Number.isFinite(Number(rule.Rarity))) nor.Rarity = Number(rule.Rarity)
  if (Number.isFinite(Number(rule.Faction))) nor.Faction = Number(rule.Faction)
  if (Number.isFinite(Number(rule.MainStatID))) nor.MainStatID = Number(rule.MainStatID)
  if (Number.isFinite(Number(rule.MainStatF))) nor.MainStatF = Number(rule.MainStatF)
  if (Number.isFinite(Number(rule.LVLForCheck))) nor.LVLForCheck = Number(rule.LVLForCheck)
  if (Array.isArray(rule.ArtifactSet) && rule.ArtifactSet.length > 0) nor.ArtifactSet = rule.ArtifactSet.map(Number).sort((a,b)=>a-b)
  if (Array.isArray(rule.ArtifactType) && rule.ArtifactType.length > 0) nor.ArtifactType = rule.ArtifactType.map(Number).sort((a,b)=>a-b)
  const subs = Array.isArray(rule.Substats) ? rule.Substats.slice() : []
  const sorted = subs.slice().sort((a,b)=>{
    const ida = Number(a?.ID ?? 9999), idb = Number(b?.ID ?? 9999)
    if (ida !== idb) return ida - idb
    const fa = Number(a?.IsFlat ? 1 : 0), fb = Number(b?.IsFlat ? 1 : 0)
    return fa - fb
  })
  const ANY = { ID: -1, Value: 0, Condition: '', IsFlat: true }
  while (sorted.length < 4) sorted.push(ANY)
  nor.Substats = sorted.slice(0,4).map(s => ({
    ID: Number(s.ID),
    Value: Number(s.Value ?? 0),
    Condition: String(s.Condition ?? ''),
    IsFlat: Boolean(s.IsFlat),
    ...(s.NotAvailable ? { NotAvailable: Boolean(s.NotAvailable) } : {}),
  }))
  return nor
}

// Emit goldens into repo-root tests/golden.
const outDir = resolve(__dirname, '..', '..', 'tests', 'golden')
mkdirSync(outDir, { recursive: true })

let wrote = 0
for (const c of mod.CASES) {
  if (!c || typeof c !== 'object') continue
  const name = String(c.name || '')
  if (name.startsWith('MATRIX')) continue
  const goldenName = String(c.goldenName || '').trim()
  if (!goldenName) continue
  const cfg = io.normalizeRecipe(c.sfr)
  const rules = builder.buildHsfRules(cfg, builder.defaultSubstatTargets())
  const norm = rules.map(r => normalizeRule(r))
  const outPath = resolve(outDir, `${goldenName}.json`)
  writeFileSync(outPath, JSON.stringify(norm, null, 2) + '\n', 'utf8')
  wrote++
}

console.log(`Wrote ${wrote} golden files to ${outDir}`)
