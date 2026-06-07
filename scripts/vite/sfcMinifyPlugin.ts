import { readFileSync } from 'node:fs'
import type { Plugin, ResolvedConfig } from 'vite'

// During production builds, SFC preset files are bundled via Vite's ?raw import.
// This plugin intercepts those load calls and returns minified JSON so the embedded
// preset strings don't bloat the bundle with indentation whitespace.
export function sfcMinifyPlugin(): Plugin {
  let isBuild = false

  return {
    name: 'sfc-raw-minify',
    enforce: 'pre',
    configResolved(config: ResolvedConfig) {
      isBuild = config.command === 'build'
    },
    load(id: string) {
      if (!isBuild) return null
      if (!id.endsWith('.sfc?raw')) return null
      const filePath = id.slice(0, -'?raw'.length)
      const raw = readFileSync(filePath, 'utf8')
      // Re-serialize without whitespace so the raw string literal in the bundle is compact.
      const minified = JSON.stringify(JSON.parse(raw))
      return `export default ${JSON.stringify(minified)}`
    },
  }
}
