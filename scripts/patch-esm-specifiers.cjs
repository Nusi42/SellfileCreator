// Purpose: allow Node to run the compiled test bundle without a bundler.
// Why: TypeScript emits extensionless ESM imports (e.g., "from './types'") that tools
// like Vite resolve, but Node's ESM loader requires explicit ".js" extensions.
// Scope: patches only compiled test artifacts in scripts/.tmp/src/lib; never touches source files.
// When: invoked by the test script(s) after tsc emits JS.
const fs = require('fs')
const path = require('path')

// Patch both compiled library files and compiled test files.
const roots = [
  path.join(__dirname, '.tmp', 'src', 'lib'),
  path.join(__dirname, '.tmp', 'tests'),
  path.join(__dirname, '.tmp', 'scripts'),
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

const files = roots.flatMap((r) => walk(r))
for (const p of files) {
  let s = fs.readFileSync(p, 'utf8')
  // Replace extensionless relative imports with .js extensions.
  // Patch paths that start with './' or '../' and have no extension.
  s = s.replace(/from\s+(["'])(\.\.\/|\.\/)([^'"\n]+?)\1(?=;)/g, (m, quote, rel, mod) => {
    if (mod.endsWith('.js')) return m
    return `from ${quote}${rel}${mod}.js${quote}`
  })
  fs.writeFileSync(p, s)
}

console.log('Patched ESM specifiers in', files.length, 'files under', roots.join(', '))
