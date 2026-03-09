// Generate a single HSF sellfile from an SFR file by selecting a named
// recipe-overrides preset token (e.g. 'lategame', 'endgame').
//
// Compilation: always recompiles from source (tsc + ESM patch + WASM copy) to
// guarantee a fresh, consistent build regardless of any stale tmp/tsc/tests
// artifacts left by prior runs (test:unit, export:l10n, etc.).
//
// Usage:
//   node --experimental-wasm-modules scripts/tooling/gen-release-hsf.mjs \
//     <sfr-path> <preset-token> <output-path>
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// This script lives at scripts/tooling; root is two levels up.
const ROOT = resolve(__dirname, '..', '..')
const TMP_LIB = resolve(ROOT, 'tmp', 'tsc', 'tests')
const LIBDIR = resolve(TMP_LIB, 'src', 'lib')
const WASM_SRC = resolve(ROOT, 'src', 'lib', 'wasm', 'generated')
const WASM_DST = resolve(TMP_LIB, 'src', 'lib', 'wasm', 'generated')

// --- Validate arguments ---
const [sfrPath, presetToken, outputPath] = process.argv.slice(2)
if (!sfrPath || !presetToken || !outputPath) {
  console.error('Usage: gen-release-hsf.mjs <sfr-path> <preset-token> <output-path>')
  process.exit(1)
}

// --- Compile CLI libs unconditionally ---
// Always recompile from source so stale artifacts (from test:unit, export:l10n,
// or any other prior run that touched tmp/tsc/tests) cannot cause subtle bugs.
console.log('Compiling CLI libs...')
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, env: process.env })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`"${[cmd, ...args].join(' ')}" exited with status ${r.status}`)
}
// Reset stale output before recompiling so imports see a clean slate.
rmSync(TMP_LIB, { recursive: true, force: true })
// Compile using the same tsconfig the test suite uses.
const localTsc = resolve(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
if (existsSync(localTsc)) {
  run(process.execPath, [localTsc, '-p', 'tsconfig.tests.json'])
} else {
  run('tsc', ['-p', 'tsconfig.tests.json'])
}
// Patch ESM specifiers so Node resolves compiled imports without extensions.
run(process.execPath, ['scripts/tooling/patch-esm-specifiers.cjs'])
// Copy WASM binaries alongside compiled output so imports resolve the .wasm file.
if (existsSync(WASM_SRC)) {
  mkdirSync(WASM_DST, { recursive: true })
  cpSync(WASM_SRC, WASM_DST, { recursive: true })
}

// --- Import compiled library modules ---
// Resolve as file URLs so dynamic imports work on all platforms.
const lib = (p) => pathToFileURL(resolve(LIBDIR, p)).href

// Pre-initialize the WASM binary from disk before importing any module that
// depends on it. The generated __wbg_init accepts a BufferSource directly and
// skips the URL→fetch path, which fails on file:// in some Node.js versions.
// warmupWasmRuleEngine then sees the wasm variable already set and returns early.
const { default: initWasmBinary } = await import(lib('wasm/generated/rule_engine.js'))
await initWasmBinary(readFileSync(resolve(WASM_DST, 'rule_engine_bg.wasm')))

const { warmupWasmRuleEngine } = await import(lib('wasm/wasmRuleEngine.js'))
const { parseSfrText } = await import(lib('sfrIO.js'))
const { defaultSubstatTargets } = await import(lib('hsfBuilder.js'))
const {
  parseNoteRecipeOverrides,
  resolveRecipeOverridesTags,
  applyRecipeOverrides,
} = await import(lib('noteRecipeOverrides.js'))
const { computeMergedRules } = await import(lib('merge.js'))
const { buildHsfFileFromMerged } = await import(lib('hsfIO.js'))

// Confirm WASM is ready (fast path — binary already loaded above).
await warmupWasmRuleEngine()

// --- Parse SFR ---
// Use defaultSubstatTargets as the fallback; the SFR's own Minima section
// overrides it via parseSfrText when present.
const sfrText = readFileSync(sfrPath, 'utf8')
const { recipes, metasets, substatTargets, finalSellRemainder } = parseSfrText(
  sfrText,
  { metasets: [], substatTargets: defaultSubstatTargets() },
)

// Locate the recipe whose note contains the recipe-overrides DSL.
// In example.sfr this is the final recipe, which holds the account-level question.
const noteRecipe = recipes.find(
  (r) => typeof r.note === 'string' && r.note.includes('recipe-overrides'),
)
if (!noteRecipe) {
  throw new Error('No recipe with recipe-overrides DSL found in ' + sfrPath)
}
const overridesNote = noteRecipe.note

// --- Locate the question option matching the preset token ---
// The token is the id= value from the DSL (e.g. id=lategame → token 'lategame').
// It maps to the stable scoped option ID the answers dict must reference.
const questions = parseNoteRecipeOverrides(overridesNote)
let match = null
for (const q of questions) {
  const opt = q.options.find((o) => o.token === presetToken)
  if (opt) { match = { questionId: q.id, optionId: opt.id }; break }
}
if (!match) {
  throw new Error(`Recipe override option '${presetToken}' not found in note of ${sfrPath}`)
}

// --- Apply the preset and build the HSF ---
// Select exactly this option in its question; cross-question +directives cascade automatically.
const answers = { [match.questionId]: [match.optionId] }

// Resolve instruction blocks for the chosen selection.
const { instructions } = resolveRecipeOverridesTags(overridesNote, answers)

// Apply instructions across all recipes (may change export modes, tags, etc.).
const modifiedRecipes = applyRecipeOverrides(recipes, instructions)

// Merge all recipe rules as the app does for a full SFR export (no imported HSF).
const mergedRules = computeMergedRules({
  hsf: null,
  customRecipes: modifiedRecipes,
  metasets,
  substatTargets,
  finalSellRemainder,
})

// Attach recipe names for readability and strip UI-only metadata fields.
const hsf = buildHsfFileFromMerged(mergedRules, {
  recipeNames: modifiedRecipes.map((r) => r.name ?? null),
})

writeFileSync(outputPath, JSON.stringify(hsf, null, 2), 'utf8')
console.log(`[gen-release-hsf] '${presetToken}' → ${outputPath}`)
