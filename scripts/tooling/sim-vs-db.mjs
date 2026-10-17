// Compare two HSF sell files against one or more RSL Helper databases (.db).
//
// For each provided DB, runs both HSFs over every artifact (including inbox), then
// characterises pieces that flipped KEEP <-> SELL between the two files by:
//   - substat-quality bucket  (e.g., "no SPD but has CR/CDMG/ACC")
//   - roll-count pattern      (e.g., "2+1+1")
//   - exact substat signature (e.g., "ATK%, CR, HP%, RES")
//   - per-set quality breakdown (which sets lose what kinds of pieces)
//   - SPD presence + flat-substat counts (quick reference numbers)
// Results are aggregated across all provided DBs into one markdown report.
//
// Use this to characterise a release: what kinds of pieces does the new
// sellfile newly sell (or newly keep) compared to the previous release?
//
// Compilation: same tsc + ESM-patch + WASM-copy pipeline as gen-dungeon-stats.mjs
// so this script always runs against the latest compiled library code.
//
// Usage:
//   node --experimental-wasm-modules scripts/tooling/sim-vs-db.mjs \
//     <old-hsf> <new-hsf> <output-md> <db-path> [<db-path>...]
//
// Example (compares old vs new Lategame across two account gear-db fixtures;
// build them first with npm run fixtures:gear-db:build):
//   node --experimental-wasm-modules scripts/tooling/sim-vs-db.mjs \
//     SFC-Compare/Old/Lategame.hsf SFC-Compare/New/lategame-sellfile.hsf \
//     out.md tmp/fixtures/gear-db/account-c.db tmp/fixtures/gear-db/account-b.db

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// Script lives at scripts/tooling; root is two levels up.
const ROOT = resolve(__dirname, '..', '..')
const TMP_LIB = resolve(ROOT, 'tmp', 'tsc', 'tests')
const LIBDIR = resolve(TMP_LIB, 'src', 'lib')
const WASM_SRC = resolve(ROOT, 'src', 'lib', 'wasm', 'generated')
const WASM_DST = resolve(TMP_LIB, 'src', 'lib', 'wasm', 'generated')

// --- Validate arguments ---
const args = process.argv.slice(2)
if (args.length < 4) {
  console.error('Usage: sim-vs-db.mjs <old-hsf> <new-hsf> <output-md> <db-path> [<db-path>...]')
  process.exit(1)
}
const [oldHsfPath, newHsfPath, outputPath, ...dbPaths] = args

// --- Compile CLI libs unconditionally ---
// Always recompile from source so stale tsc artifacts can't cause subtle bugs.
console.log('Compiling CLI libs...')
const run = (cmd, cmdArgs) => {
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', cwd: ROOT, env: process.env })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`"${[cmd, ...cmdArgs].join(' ')}" exited with status ${r.status}`)
}
rmSync(TMP_LIB, { recursive: true, force: true })
const localTsc = resolve(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
if (existsSync(localTsc)) {
  run(process.execPath, [localTsc, '-p', 'tsconfig.tooling-sim.json'])
} else {
  run('tsc', ['-p', 'tsconfig.tooling-sim.json'])
}
run(process.execPath, ['scripts/tooling/patch-esm-specifiers.cjs'])
if (existsSync(WASM_SRC)) {
  mkdirSync(WASM_DST, { recursive: true })
  cpSync(WASM_SRC, WASM_DST, { recursive: true })
}

// --- Import compiled library modules ---
const lib = (p) => pathToFileURL(resolve(LIBDIR, p)).href

// Pre-initialize the WASM binary from disk (same pattern as gen-dungeon-stats.mjs).
const { default: initWasmBinary } = await import(lib('wasm/generated/rule_engine.js'))
await initWasmBinary(readFileSync(resolve(WASM_DST, 'rule_engine_bg.wasm')))

const { warmupWasmRuleEngine, configureWasmRuleEngineWithLoadedWasm } = await import(lib('wasm/wasmRuleEngine.js'))
const { parseHsfFile } = await import(lib('hsfIO.js'))
const { computeMergedRules } = await import(lib('merge.js'))
const { defaultSubstatTargets } = await import(lib('hsfBuilder.js'))
const { evaluateFirst } = await import(lib('ruleEval.js'))
const { importGearDatabaseFromArrayBuffer } = await import(lib('importers/gearDbImporter.js'))
const { ArtifactSet } = await import(lib('artifactSets.js'))

await warmupWasmRuleEngine()

// --- Display name lookups ---
// Reverse map ArtifactSet IDs to readable set names for the markdown report.
const SET_NAME_BY_ID = Object.fromEntries(Object.entries(ArtifactSet).map(([k, v]) => [v, k]))
const STAT_NAMES = { 1: 'HP', 2: 'ATK', 3: 'DEF', 4: 'SPD', 5: 'RES', 6: 'ACC', 7: 'CR', 8: 'CDMG' }

// Format a single substat for display, splitting flat HP/ATK/DEF (e.g. "HP flat")
// from the percent variants (e.g. "HP%"). Non-HP/ATK/DEF stats are unsuffixed.
const formatStat = (s) => {
  if (!s) return '—'
  const name = STAT_NAMES[s.statId] ?? `?${s.statId}`
  if (s.statId < 1 || s.statId > 3) return name
  return s.isFlat ? `${name} flat` : `${name}%`
}

// --- Load HSF rules ---
// computeMergedRules with the HSF as base (no custom recipes/metasets) returns
// the HSF rules tagged with __source, ready for evaluateFirst.
const loadHsfRules = (path) => {
  const hsf = parseHsfFile(readFileSync(path, 'utf8'))
  return computeMergedRules({
    hsf, customRecipes: [], metasets: [], substatTargets: defaultSubstatTargets(), finalSellRemainder: null,
  })
}

console.log(`Loading old HSF: ${oldHsfPath}`)
const oldRules = loadHsfRules(oldHsfPath)
console.log(`  ${oldRules.length} rules`)
console.log(`Loading new HSF: ${newHsfPath}`)
const newRules = loadHsfRules(newHsfPath)
console.log(`  ${newRules.length} rules`)

// --- Load DBs ---
// Each entry holds the full NormalizedGearArtifact list (artifacts + inbox)
// plus a TestItem array projected from .gearInspectorItem for the rule engine.
const dbDatasets = []
for (const dbPath of dbPaths) {
  const label = basename(dbPath).replace(/\.db$/i, '')
  process.stdout.write(`Loading DB ${label} ... `)
  const buf = readFileSync(dbPath)
  const { artifacts, inboxArtifacts } = await importGearDatabaseFromArrayBuffer(buf)
  const all = [...artifacts, ...inboxArtifacts]
  console.log(`${all.length} artifacts (${artifacts.length} owned + ${inboxArtifacts.length} inbox)`)
  dbDatasets.push({ label, artifacts: all, items: all.map((a) => a.gearInspectorItem) })
}

// --- Rule-engine evaluation ---
// Configures the matcher once per ruleset, then evaluates each item via
// evaluateFirst. Returns one perItem entry plus aggregate kept/sold counts.
const evaluateAll = (rules, items) => {
  configureWasmRuleEngineWithLoadedWasm({ rules, recipeModes: [] })
  const perItem = new Array(items.length)
  let kept = 0, sold = 0
  for (let i = 0; i < items.length; i += 1) {
    const result = evaluateFirst(rules, items[i])
    const keep = result?.keep === true
    if (keep) kept += 1; else sold += 1
    perItem[i] = { keep }
  }
  return { perItem, total: items.length, kept, sold }
}

// --- Substat helpers ---
// "Useful" substats are SPD/CR/CDMG/ACC/RES/HP%/ATK%/DEF%; flat HP/ATK/DEF
// are weak and excluded from "has X" checks below.
const isFlatSubstat = (s) => s.isFlat && (s.statId >= 1 && s.statId <= 3)
const hasStat = (a, statId) => Array.isArray(a.substats) && a.substats.some((s) => s.statId === statId && !isFlatSubstat(s))
const flatSubstatCount = (a) => Array.isArray(a.substats) ? a.substats.filter(isFlatSubstat).length : 0

// "Substat signature" — sorted, normalised stat names, comma-separated.
// Example: "ATK%, CR, HP flat, SPD". Collapses identical-shape pieces into one bucket.
const substatSignature = (a) => {
  if (!Array.isArray(a.substats)) return '<no subs>'
  return a.substats.map(formatStat).sort().join(', ')
}

// Roll-count pattern — rolls per stat sorted descending, joined with '+'.
// Example: "2+1+1" = one stat with 2 upgrade rolls, two with 1, one untouched.
const rollPattern = (a) => {
  if (!Array.isArray(a.substats)) return ''
  return a.substats.map((s) => s.rolls ?? 0).filter((n) => n > 0).sort((x, y) => y - x).join('+')
}

// Stat-quality bucket — one-line descriptive label tuned to map onto the SFC's
// "X good substats" thresholds. Reused as the markdown row label.
const qualityBucket = (a) => {
  const subs = Array.isArray(a.substats) ? a.substats : []
  if (subs.length === 0) return 'no substats'
  const flats = subs.filter(isFlatSubstat).length
  const spd = hasStat(a, 4)
  const dmg = hasStat(a, 7) || hasStat(a, 8) // CR/CDMG
  const debuf = hasStat(a, 6) // ACC
  if (flats >= 3 && !spd) return '3-4 flat substats, no SPD'
  if (flats >= 3 && spd) return '3+ flat substats, with SPD'
  if (flats === 2 && !spd && !dmg && !debuf) return '2 flat + no SPD/CR/CDMG/ACC'
  if (flats === 2 && spd) return '2 flat substats, with SPD'
  if (!spd && !dmg && !debuf) return 'no SPD, no CR/CDMG, no ACC'
  if (!spd && (dmg || debuf)) return 'no SPD but has CR/CDMG/ACC'
  if (spd && dmg) return 'SPD + CR/CDMG'
  if (spd && debuf) return 'SPD + ACC'
  if (spd) return 'SPD only (other slots are %)'
  return 'other'
}

// --- Aggregate flips across all DBs ---
// Walks each DB and partitions every artifact into one of three buckets based
// on (oldKeep, newKeep). The arrays hold the full NormalizedGearArtifact so
// downstream tallies have access to substats / set / slot.
console.log('\nEvaluating rules over all DBs...')
const flippedToSell = []
const flippedToKeep = []
const keptByBoth = []
let total = 0, oldKept = 0, newKept = 0
for (const db of dbDatasets) {
  const oldRes = evaluateAll(oldRules, db.items)
  const newRes = evaluateAll(newRules, db.items)
  total += db.items.length
  oldKept += oldRes.kept
  newKept += newRes.kept
  for (let i = 0; i < db.items.length; i += 1) {
    const o = oldRes.perItem[i].keep
    const n = newRes.perItem[i].keep
    const a = db.artifacts[i]
    if (o && !n) flippedToSell.push(a)
    else if (!o && n) flippedToKeep.push(a)
    else if (o && n) keptByBoth.push(a)
  }
}

// --- Tally helper ---
// Group an array by keyFn, return rows sorted by descending count.
// `limit` truncates after sorting.
const tally = (arr, keyFn, opts = {}) => {
  const map = new Map()
  for (const x of arr) {
    const k = keyFn(x)
    if (k == null) continue
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  const rows = Array.from(map, ([key, count]) => ({ key, count }))
  rows.sort((a, b) => b.count - a.count)
  return opts.limit ? rows.slice(0, opts.limit) : rows
}

const pct = (k, t) => t === 0 ? '—' : `${(100 * k / t).toFixed(1)}%`

// --- Build markdown report ---
const oldName = basename(oldHsfPath)
const newName = basename(newHsfPath)
const dbList = dbDatasets.map((d) => d.label).join(', ')

const out = []
out.push(`# Substat-pattern characterisation: ${oldName} vs ${newName}`)
out.push('')
out.push(`Aggregated across DB(s): ${dbList}.`)
out.push('Each section describes the pieces the OLD sell file kept but the NEW one sells.')
out.push('')
out.push(`Total: **${total} items**. Old kept **${oldKept}** (${pct(oldKept, total)}), New keeps **${newKept}** (${pct(newKept, total)}).`)
out.push(`Flipped KEEP→SELL: **${flippedToSell.length}** · Flipped SELL→KEEP: **${flippedToKeep.length}**.`)
out.push('')

// Quality bucket — the headline "what kind of piece are we losing".
out.push('## Substat-quality bucket of flipped pieces')
out.push('')
out.push('Comparison column shows pieces in the same bucket still kept by *both* files (large = the new rules still protect this pattern).')
out.push('')
out.push('| Substat pattern | Pieces flipped to SELL | Still kept by both |')
out.push('| --- | ---: | ---: |')
const flipBuckets = tally(flippedToSell, qualityBucket)
const keptByBucket = new Map(tally(keptByBoth, qualityBucket).map((r) => [r.key, r.count]))
for (const r of flipBuckets) {
  out.push(`| ${r.key} | ${r.count} | ${keptByBucket.get(r.key) ?? 0} |`)
}
out.push('')

// Roll-count pattern — surfaces "all-1-roll" vs deep-roll losers.
out.push('## Roll-count pattern of flipped pieces')
out.push('')
out.push('"2+1+1" means one substat with 2 rolls, two with 1, one untouched. Pure "1+1+1+1" = no real upgrades anywhere.')
out.push('')
out.push('| Roll pattern | Flipped pieces | Still kept by both |')
out.push('| --- | ---: | ---: |')
const flipRoll = tally(flippedToSell, rollPattern, { limit: 10 })
const keptByRoll = new Map(tally(keptByBoth, rollPattern).map((r) => [r.key, r.count]))
for (const r of flipRoll) {
  out.push(`| ${r.key} | ${r.count} | ${keptByRoll.get(r.key) ?? 0} |`)
}
out.push('')

// Top exact substat combinations — for cherry-picking "this exact combo no longer keeps".
out.push('## Top exact substat combinations among flipped pieces')
out.push('')
out.push('| Substats (alphabetical) | Flipped | Kept by both |')
out.push('| --- | ---: | ---: |')
const flipSig = tally(flippedToSell, substatSignature, { limit: 20 })
const keptBySig = new Map(tally(keptByBoth, substatSignature).map((r) => [r.key, r.count]))
for (const r of flipSig) {
  out.push(`| ${r.key} | ${r.count} | ${keptBySig.get(r.key) ?? 0} |`)
}
out.push('')

// Per-set quality bucket — does it differ across the scarce sets?
out.push('## Top sets losing pieces, broken down by substat-quality bucket')
out.push('')
const flipsBySet = new Map()
for (const a of flippedToSell) {
  const setName = SET_NAME_BY_ID[a.set] ?? `Set#${a.set}`
  let list = flipsBySet.get(setName)
  if (!list) { list = []; flipsBySet.set(setName, list) }
  list.push(a)
}
const setRows = Array.from(flipsBySet, ([name, list]) => ({ name, count: list.length, list }))
setRows.sort((a, b) => b.count - a.count)
for (const setRow of setRows.slice(0, 8)) {
  out.push(`**${setRow.name}** — ${setRow.count} pieces flipped:`)
  for (const b of tally(setRow.list, qualityBucket)) {
    out.push(`- ${b.key}: ${b.count}`)
  }
  out.push('')
}

// Quick numbers on flat counts and SPD presence for at-a-glance context.
const noSpd = flippedToSell.filter((a) => !hasStat(a, 4)).length
const noSpdKept = keptByBoth.filter((a) => !hasStat(a, 4)).length
const flat3plus = flippedToSell.filter((a) => flatSubstatCount(a) >= 3).length
const flat3plusKept = keptByBoth.filter((a) => flatSubstatCount(a) >= 3).length
out.push(`**Quick numbers** — among flipped: ${noSpd}/${flippedToSell.length} (${pct(noSpd, flippedToSell.length)}) lack SPD; ${flat3plus}/${flippedToSell.length} (${pct(flat3plus, flippedToSell.length)}) have ≥3 flat substats. Among still-kept: ${pct(noSpdKept, keptByBoth.length)} lack SPD; ${pct(flat3plusKept, keptByBoth.length)} have ≥3 flat substats.`)
out.push('')

writeFileSync(outputPath, out.join('\n'), 'utf8')
console.log(`\nWrote ${outputPath}`)
