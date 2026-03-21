// Generate a dungeon-drop statistics markdown table from a pre-built HSF file.
//
// Runs the dungeon simulator for Fire Knight, Dragon, and Ice Golem across the
// same 6 stage/boost configurations shown by the live <!-- dungeon-simulator -->
// note block (Ice Golem only uses the 3 no-boost columns).
//
// Compilation: same tsc + ESM-patch + WASM-copy pipeline as gen-release-hsf.mjs
// so this script always runs against the latest compiled library code.
//
// Usage:
//   node --experimental-wasm-modules scripts/tooling/gen-dungeon-stats.mjs \
//     <hsf-path> [<output-md-path>]
//
// When <output-md-path> is omitted the markdown is printed to stdout.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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
const [hsfPath, outputPath] = process.argv.slice(2)
if (!hsfPath) {
  console.error('Usage: gen-dungeon-stats.mjs <hsf-path> [<output-md-path>]')
  process.exit(1)
}

// --- Compile CLI libs unconditionally ---
// Always recompile from source so stale tsc artifacts can't cause subtle bugs.
console.log('Compiling CLI libs...')
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, env: process.env })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`"${[cmd, ...args].join(' ')}" exited with status ${r.status}`)
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

// Pre-initialize the WASM binary from disk (same pattern as gen-release-hsf.mjs).
const { default: initWasmBinary } = await import(lib('wasm/generated/rule_engine.js'))
await initWasmBinary(readFileSync(resolve(WASM_DST, 'rule_engine_bg.wasm')))

const { warmupWasmRuleEngine } = await import(lib('wasm/wasmRuleEngine.js'))
const { parseHsfFile } = await import(lib('hsfIO.js'))
const { computeMergedRules } = await import(lib('merge.js'))
const { defaultSubstatTargets } = await import(lib('hsfBuilder.js'))
const { createDungeonSimSpotlightSession } = await import(lib('dungeonSimulator.js'))

await warmupWasmRuleEngine()

// --- Load HSF and build HsfRuleWithRecipe[] ---
// computeMergedRules with the HSF as base and no custom recipes returns the
// HSF rules tagged with __source, ready for the simulator.
console.log(`Loading HSF: ${hsfPath}`)
const hsfText = readFileSync(hsfPath, 'utf8')
const hsf = parseHsfFile(hsfText)
const substatTargets = defaultSubstatTargets()
const rules = computeMergedRules({
  hsf,
  customRecipes: [],
  metasets: [],
  substatTargets,
  finalSellRemainder: null,
})
console.log(`  Loaded ${rules.length} rules`)

// --- Simulation configuration ---
// Numeric artifact set IDs (ArtifactSet.Speed=4, ArtifactSet.Savage=19).
const SPEED_SET_ID = 4
const SAVAGE_SET_ID = 19
// Run count: higher than the live note block (2000) for stable static numbers.
const RUNS = 10000
// Milestone levels to report (mirrors NOTE_SIM_LEVELS).
const LEVELS = [0, 4, 8, 12, 16]

// Six configs mirroring NOTE_SIM_CONFIGS in useDungeonNoteSimulator.ts.
// Off configs also include Ice Golem; boost configs cover only Dragon + FK.
const CONFIGS = [
  {
    id: 'n20-off', label: 'Normal 20',
    selections: { dragon: { mode: 'normal', stage: 20 }, fireKnight: { mode: 'normal', stage: 20 }, iceGolem: { mode: 'normal', stage: 20 } },
    boosts: {},
    simulateDungeons: ['dragon', 'fireKnight', 'iceGolem'],
  },
  {
    id: 'n25-off', label: 'Normal 25',
    selections: { dragon: { mode: 'normal', stage: 25 }, fireKnight: { mode: 'normal', stage: 25 }, iceGolem: { mode: 'normal', stage: 25 } },
    boosts: {},
    simulateDungeons: ['dragon', 'fireKnight', 'iceGolem'],
  },
  {
    id: 'h10-off', label: 'Hard 10',
    selections: { dragon: { mode: 'hard', stage: 10 }, fireKnight: { mode: 'hard', stage: 10 }, iceGolem: { mode: 'hard', stage: 10 } },
    boosts: {},
    simulateDungeons: ['dragon', 'fireKnight', 'iceGolem'],
  },
  {
    id: 'n20-3x', label: '3× Normal 20',
    selections: { dragon: { mode: 'normal', stage: 20 }, fireKnight: { mode: 'normal', stage: 20 } },
    boosts: { dragon: { mode: '3x', setId: SPEED_SET_ID }, fireKnight: { mode: '3x', setId: SAVAGE_SET_ID } },
    simulateDungeons: ['dragon', 'fireKnight'],
    dragonFocusSetId: SPEED_SET_ID,
    fireKnightFocusSetId: SAVAGE_SET_ID,
  },
  {
    id: 'n25-3x', label: '3× Normal 25',
    selections: { dragon: { mode: 'normal', stage: 25 }, fireKnight: { mode: 'normal', stage: 25 } },
    boosts: { dragon: { mode: '3x', setId: SPEED_SET_ID }, fireKnight: { mode: '3x', setId: SAVAGE_SET_ID } },
    simulateDungeons: ['dragon', 'fireKnight'],
    dragonFocusSetId: SPEED_SET_ID,
    fireKnightFocusSetId: SAVAGE_SET_ID,
  },
  {
    id: 'h10-3x', label: '3× Hard 10',
    selections: { dragon: { mode: 'hard', stage: 10 }, fireKnight: { mode: 'hard', stage: 10 } },
    boosts: { dragon: { mode: '3x', setId: SPEED_SET_ID }, fireKnight: { mode: '3x', setId: SAVAGE_SET_ID } },
    simulateDungeons: ['dragon', 'fireKnight'],
    dragonFocusSetId: SPEED_SET_ID,
    fireKnightFocusSetId: SAVAGE_SET_ID,
  },
]

// --- Run simulations ---
// resultsByConfig: Map<configId, spotlightResults>
const resultsByConfig = new Map()

for (const cfg of CONFIGS) {
  process.stdout.write(`  Simulating ${cfg.id} (${RUNS} runs × ${cfg.simulateDungeons.join(', ')})...`)
  const hasBoosts = Object.keys(cfg.boosts).length > 0
  const session = createDungeonSimSpotlightSession({
    rules,
    substatTargets,
    runs: RUNS,
    mode: 'levelUp',
    selections: cfg.selections,
    ...(hasBoosts ? { boosts: cfg.boosts } : {}),
    simulateDungeons: cfg.simulateDungeons,
  })
  // Run all batches synchronously (no worker required).
  session.runBatch(RUNS)
  resultsByConfig.set(cfg.id, session.getResultsBySpotlight())
  process.stdout.write(' done\n')
}

// --- Result helpers ---
// Aggregate keep-rate across all sets for a dungeon at a given level.
const aggregatePct = (spotlightResults, dungeonId, level) => {
  // Use the first (only) spotlight key — event dungeon isn't simulated here.
  const dungeonResults = Object.values(spotlightResults)[0]?.[dungeonId]
  if (!dungeonResults) return null
  let kept = 0; let total = 0
  for (const setRes of Object.values(dungeonResults)) {
    const cell = setRes?.levels?.[level]
    if (!cell) continue
    kept += cell.kept
    total += cell.total
  }
  if (total === 0) return null
  return (kept / total) * 100
}

// Focused-set keep-rate (denominator = total dungeon runs, not set-specific drops).
const focusedPct = (spotlightResults, dungeonId, focusSetId, level) => {
  const dungeonResults = Object.values(spotlightResults)[0]?.[dungeonId]
  if (!dungeonResults) return null
  // Compute total runs from aggregate first.
  let total = 0
  for (const setRes of Object.values(dungeonResults)) {
    const cell = setRes?.levels?.[level]
    if (cell) total += cell.total
  }
  if (total === 0) return null
  const cell = dungeonResults[focusSetId]?.levels?.[level]
  if (!cell) return null
  return (cell.kept / total) * 100
}

const fmt = (pct) => (pct === null || !isFinite(pct)) ? '—' : `${pct.toFixed(1)}%`

// --- Build markdown tables ---
// Dungeon descriptor: which configs contribute columns and how to read each cell.
const DUNGEON_TABLES = [
  {
    id: 'fireKnight',
    label: 'Fire Knight',
    columns: [
      { configId: 'n20-off', header: 'Normal 20',        focusSetId: null },
      { configId: 'n25-off', header: 'Normal 25',        focusSetId: null },
      { configId: 'h10-off', header: 'Hard 10',          focusSetId: null },
      { configId: 'n20-3x',  header: '3× Savage N20',   focusSetId: SAVAGE_SET_ID },
      { configId: 'n25-3x',  header: '3× Savage N25',   focusSetId: SAVAGE_SET_ID },
      { configId: 'h10-3x',  header: '3× Savage H10',   focusSetId: SAVAGE_SET_ID },
    ],
  },
  {
    id: 'dragon',
    label: 'Dragon',
    columns: [
      { configId: 'n20-off', header: 'Normal 20',        focusSetId: null },
      { configId: 'n25-off', header: 'Normal 25',        focusSetId: null },
      { configId: 'h10-off', header: 'Hard 10',          focusSetId: null },
      { configId: 'n20-3x',  header: '3× Speed N20',    focusSetId: SPEED_SET_ID },
      { configId: 'n25-3x',  header: '3× Speed N25',    focusSetId: SPEED_SET_ID },
      { configId: 'h10-3x',  header: '3× Speed H10',    focusSetId: SPEED_SET_ID },
    ],
  },
  {
    id: 'iceGolem',
    label: 'Ice Golem (no boost)',
    columns: [
      { configId: 'n20-off', header: 'Normal 20', focusSetId: null },
      { configId: 'n25-off', header: 'Normal 25', focusSetId: null },
      { configId: 'h10-off', header: 'Hard 10',   focusSetId: null },
    ],
  },
]

const buildDungeonTable = (dungeonDesc) => {
  const { id, label, columns } = dungeonDesc
  const sep = `| Gear level | ${columns.map((c) => c.header).join(' | ')} |`
  const divider = `| --- | ${columns.map(() => ':---:').join(' | ')} |`
  const rows = LEVELS.map((level) => {
    const cells = columns.map((col) => {
      const spotlightResults = resultsByConfig.get(col.configId)
      if (!spotlightResults) return '—'
      const pct = col.focusSetId !== null
        ? focusedPct(spotlightResults, id, col.focusSetId, level)
        : aggregatePct(spotlightResults, id, level)
      return fmt(pct)
    })
    return `| +${level} | ${cells.join(' | ')} |`
  })
  return [`### ${label}`, '', sep, divider, ...rows].join('\n')
}

// --- Assemble full markdown output ---
const hsfBasename = hsfPath.replace(/.*[/\\]/, '')
const lines = [
  `## Dungeon drop statistics — ${hsfBasename}`,
  '',
  `_Simulated with ${RUNS.toLocaleString()} runs per configuration. ` +
    `Level-up mode (stops after first sell, mirroring in-game rolling)._`,
  `_Boost columns show keep-rate for the focused set only (denominator = all dungeon runs)._`,
  `_Σ columns show aggregate keep-rate across all sets._`,
  '',
  ...DUNGEON_TABLES.map(buildDungeonTable).join('\n\n').split('\n'),
]

const markdown = lines.join('\n') + '\n'

if (outputPath) {
  writeFileSync(outputPath, markdown, 'utf8')
  console.log(`[gen-dungeon-stats] Wrote ${outputPath}`)
} else {
  process.stdout.write(markdown)
}
