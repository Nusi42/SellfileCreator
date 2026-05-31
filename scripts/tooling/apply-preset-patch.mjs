// Apply a JSON patch file to a base SFC preset and write the patched SFC.
//
// Used by the release pipeline (release-win.ps1) to produce a tweaked
// variant of a preset (e.g. drop a metaset, disable a safeguard) without
// forking the source SFC. The patch schema is documented in
// presets/PATCHES.md; the applier itself lives in src/lib/presetPatch.ts.
//
// Usage:
//   node scripts/tooling/apply-preset-patch.mjs <input-sfc> <patch-json> <output-sfc>
//
// Compilation strategy mirrors gen-release-hsf.mjs: invoke tsc against the
// shared tests tsconfig so the same compiled artifacts can be reused by a
// subsequent gen-release-hsf call. We deliberately do NOT reset the tmp
// directory so we don't invalidate other tooling's warm caches.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// Repo root is two levels up from this file (scripts/tooling/).
const ROOT = resolve(__dirname, '..', '..')
const TMP_LIB = resolve(ROOT, 'tmp', 'tsc', 'tests')
const LIBDIR = resolve(TMP_LIB, 'src', 'lib')

const [sfcPath, patchPath, outputPath] = process.argv.slice(2)
if (!sfcPath || !patchPath || !outputPath) {
  console.error('Usage: apply-preset-patch.mjs <input-sfc> <patch-json> <output-sfc>')
  process.exit(1)
}

// Compile via the tests tsconfig so the compiled output lives alongside
// other CLI tooling artifacts. tsc is incremental; on a warm dir this is
// a quick no-op, on a cold dir it does a full compile.
console.log('Compiling preset-patch CLI libs...')
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, env: process.env })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`"${[cmd, ...args].join(' ')}" exited with status ${r.status}`)
}
const localTsc = resolve(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
if (existsSync(localTsc)) {
  run(process.execPath, [localTsc, '-p', 'tsconfig.tests.json'])
} else {
  run('tsc', ['-p', 'tsconfig.tests.json'])
}
// Patch ESM specifiers so dynamic imports find the compiled output.
run(process.execPath, ['scripts/tooling/patch-esm-specifiers.cjs'])

// Resolve compiled module by file URL — required for cross-platform import.
const lib = (p) => pathToFileURL(resolve(LIBDIR, p)).href
const { applyPresetPatch, PresetPatchError } = await import(lib('presetPatch.js'))

// Read both files up front so JSON errors are reported before the patch
// pipeline starts.
const sfcText = readFileSync(sfcPath, 'utf8')
let sfc
try {
  sfc = JSON.parse(sfcText)
} catch (err) {
  console.error(`[apply-preset-patch] failed to parse SFC '${sfcPath}': ${err.message}`)
  process.exit(1)
}
let patch
try {
  patch = JSON.parse(readFileSync(patchPath, 'utf8'))
} catch (err) {
  console.error(`[apply-preset-patch] failed to parse patch '${patchPath}': ${err.message}`)
  process.exit(1)
}

let patched
try {
  patched = applyPresetPatch(sfc, patch)
} catch (err) {
  // PresetPatchError already carries a path hint — surface its message.
  if (err instanceof PresetPatchError) {
    console.error(`[apply-preset-patch] ${err.message}`)
  } else {
    console.error(`[apply-preset-patch] unexpected error: ${err?.stack ?? err}`)
  }
  process.exit(1)
}

// 2-space indent matches the formatting of the source presets so diffs
// against the base SFC stay readable.
const outDir = dirname(outputPath)
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
writeFileSync(outputPath, JSON.stringify(patched, null, 2) + '\n', 'utf8')
console.log(`[apply-preset-patch] ${sfcPath} + ${patchPath} → ${outputPath}`)
