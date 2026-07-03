// Purpose: allow Node to run the compiled test bundle without a bundler.
// Why: TypeScript emits extensionless ESM imports (e.g., "from './types'") that tools
// like Vite resolve, but Node's ESM loader requires explicit ".js" extensions.
// Scope: patches only compiled artifacts under tmp/tsc; never touches source files.
// When: invoked by the test script(s) after tsc emits JS.
const fs = require('fs')
const path = require('path')

// Patch both compiled library files and compiled test files.
const roots = [
  // Tests output includes compiled src + tests under tmp/tsc/tests.
  path.join(__dirname, '..', '..', 'tmp', 'tsc', 'tests'),
  // Script output includes compiled scripts + shared types under tmp/tsc/scripts.
  path.join(__dirname, '..', '..', 'tmp', 'tsc', 'scripts'),
]

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(p))
    else if (entry.isFile() && p.endsWith('.js')) out.push(p)
  }
  return out
}

const repoRoot = path.join(__dirname, '..', '..')

// Vite resolves `import x from './foo.sfc?raw'` to the file's text; Node cannot.
// For each such import in a compiled artifact, emit a sibling shim module that
// default-exports the raw file contents and rewrite the specifier to point at it.
// Returns the (possibly) rewritten source. SSOT for the test harness's `?raw` support.
function patchRawImports(source, compiledFilePath) {
  // Map the compiled file back to its source location so relative `?raw` paths
  // (authored against src/) resolve to real on-disk files under the repo root.
  // Compiled tests live at tmp/tsc/tests/<repo-relative>; strip that prefix.
  const compiledTestsRoot = path.join(repoRoot, 'tmp', 'tsc', 'tests')
  const repoRelativeDir = compiledFilePath.startsWith(compiledTestsRoot)
    ? path.dirname(path.relative(compiledTestsRoot, compiledFilePath))
    : null
  // Match `from '<rel>.sfc?raw'` (the patcher above has not yet appended .js because
  // we run this first); capture the relative path without the ?raw query.
  return source.replace(/from\s+(["'])(\.\.\/|\.\/)([^'"\n]+?)\?raw\1/g, (m, quote, rel, mod) => {
    // Without a source mapping we cannot resolve the file; leave it untouched.
    if (repoRelativeDir == null) return m
    // Resolve the raw file on disk relative to the source file's repo location.
    const rawAbs = path.resolve(repoRoot, repoRelativeDir, rel + mod)
    if (!fs.existsSync(rawAbs)) return m
    const text = fs.readFileSync(rawAbs, 'utf8')
    // Emit the shim next to the compiled importer, named so it cannot collide with
    // the real compiled module (the .sfc extension is kept, .raw.js appended).
    const shimName = path.basename(mod) + '.raw.js'
    const shimAbs = path.join(path.dirname(compiledFilePath), shimName)
    fs.writeFileSync(shimAbs, `export default ${JSON.stringify(text)};\n`)
    // The shim sits next to the importer, so the specifier is always a sibling ('./'),
    // regardless of where the original raw file lived.
    return `from ${quote}./${shimName}${quote}`
  })
}

const existingRoots = roots.filter((r) => fs.existsSync(r))
const files = existingRoots.flatMap((r) => walk(r))
for (const p of files) {
  let s = fs.readFileSync(p, 'utf8')
  // Resolve `?raw` imports BEFORE the extension pass so the shim specifier (already
  // ending in .js) is left alone by the extensionless-import rewrite below.
  s = patchRawImports(s, p)
  // Replace extensionless relative imports with .js extensions.
  // Patch paths that start with './' or '../' and have no extension.
  s = s.replace(/from\s+(["'])(\.\.\/|\.\/)([^'"\n]+?)\1(?=;)/g, (m, quote, rel, mod) => {
    if (mod.endsWith('.js')) return m
    return `from ${quote}${rel}${mod}.js${quote}`
  })
  fs.writeFileSync(p, s)
}

if (files.length > 0) {
  console.log('Patched ESM specifiers in', files.length, 'files under', existingRoots.join(', '))
} else {
  console.log('No ESM specifiers patched; no compiled artifacts under', roots.join(', '))
}

// Mirror the generated WASM bindings into the compiled test tree. tsc only emits .js/.d.ts,
// so without this the .wasm binaries under tmp/tsc are whatever some earlier run left there —
// a stale-engine trap: repro/bench harnesses would silently measure an OLD rule engine after
// a wasm rebuild. Done here (the canonical post-tsc step every harness script runs) so every
// consumer gets a fresh mirror; scripts/test/run-tests.mjs relies on this too.
const wasmGeneratedSrc = path.join(__dirname, '..', '..', 'src', 'lib', 'wasm', 'generated')
const wasmGeneratedOut = path.join(__dirname, '..', '..', 'tmp', 'tsc', 'tests', 'src', 'lib', 'wasm', 'generated')
if (fs.existsSync(wasmGeneratedSrc) && fs.existsSync(path.dirname(wasmGeneratedOut))) {
  fs.mkdirSync(wasmGeneratedOut, { recursive: true })
  fs.cpSync(wasmGeneratedSrc, wasmGeneratedOut, { recursive: true })
  console.log('Mirrored generated wasm bindings into tmp/tsc/tests')
}
