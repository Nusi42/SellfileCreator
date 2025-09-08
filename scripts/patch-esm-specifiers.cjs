// Purpose: allow Node to run the compiled test bundle without a bundler.
// Why: TypeScript emits extensionless ESM imports (e.g., "from './types'") that tools
// like Vite resolve, but Node's ESM loader requires explicit ".js" extensions.
// Scope: patches only compiled test artifacts in scripts/.tmp/src/lib; never touches source files.
// When: invoked by the test script (npm run test:builder) after tsc emits JS.
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '.tmp', 'src', 'lib')
const files = ['hsfBuilder.js', 'hsfTypes.js']

for (const f of files) {
  const p = path.join(root, f)
  let s = fs.readFileSync(p, 'utf8')
  s = s.replace(/from '\.\/types'(?=;)/g, "from './types.js'")
  s = s.replace(/from '\.\/hsfTypes'(?=;)/g, "from './hsfTypes.js'")
  fs.writeFileSync(p, s)
}

console.log('Patched ESM specifiers in', files.join(', '))
