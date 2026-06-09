import { defineConfig, type UserConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { assetsPlugin } from './scripts/vite/assetsPlugin';
import { singleFilePlugin } from './scripts/vite/singleFilePlugin';
import { wasmInlinePlugin } from './scripts/vite/wasmInlinePlugin';
import { pruneOrphanedAssetsPlugin } from './scripts/vite/pruneOrphanedAssetsPlugin'
import { suppressWasmUrlPlugin } from './scripts/vite/suppressWasmUrlPlugin'
import { sfcMinifyPlugin } from './scripts/vite/sfcMinifyPlugin'
import { packetCapturePlugin } from './scripts/vite/packetCapturePlugin'

const withRootPath = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

const VITE_CONFIG_ROOT = dirname(fileURLToPath(import.meta.url))

// Keep Windows + POSIX watch paths comparable in one format.
const toPosixPath = (value: string): string => value.replace(/\\/g, '/')

// Dev-server edits should only react to source, app assets, and vite config inputs.
const WATCH_INCLUDED_ROOT_FILE_PATTERNS: readonly RegExp[] = [
  /^index\.html$/,
  /^package\.json$/,
  /^vite\.config\.ts$/,
  /^tsconfig(?:\..+)?\.json$/,
  /^README(?:\.[^/]+)?\.md$/,
]

// Restrict non-root directory watching to code + runtime assets consumed by the app.
const WATCH_INCLUDED_TOP_LEVEL_DIRS = new Set<string>([
  'src',
  'ico',
  'examples',
])

// Vite plugin code under scripts/vite affects bundling/hot reload behavior directly.
const WATCH_INCLUDED_SUBTREE_PREFIXES: readonly string[] = [
  'scripts/vite/',
]

// Return true for paths chokidar should skip while serving the app in dev.
const shouldIgnoreDevWatchPath = (filePath: string): boolean => {
  const relativePath = toPosixPath(relative(VITE_CONFIG_ROOT, filePath))

  // Leave root and external paths untouched so Vite/chokidar internals keep working.
  if (relativePath === '' || relativePath === '.' || relativePath.startsWith('../')) {
    return false
  }

  // Root files are allowlisted by explicit regex patterns.
  for (const pattern of WATCH_INCLUDED_ROOT_FILE_PATTERNS) {
    if (pattern.test(relativePath)) return false
  }

  // Allowlisted subtrees are checked before generic top-level directory matching.
  for (const prefix of WATCH_INCLUDED_SUBTREE_PREFIXES) {
    if (relativePath.startsWith(prefix)) return false
  }

  // Only watch top-level dirs needed for live app development.
  const firstSegment = relativePath.split('/')[0] ?? relativePath
  if (WATCH_INCLUDED_TOP_LEVEL_DIRS.has(firstSegment)) return false

  return true
}

// https://vitejs.dev/config/
export default defineConfig(async ({ command, mode }): Promise<UserConfig> => {
  // Keep one mode flag so Babel generator settings stay deterministic.
  const isBuild = command === 'build'

  // `vite build --mode web` produces a standard web-server build (separate JS/CSS assets, ESM
  // workers) output to dist.web/. The default (app) mode inlines everything into one HTML file
  // and writes to dist.app/ for direct file:// opening on Windows.
  const isWebBuild = mode === 'web'

  // Playwright runs the dev server via the Playwright `webServer` hook.
  // Why: `vite-plugin-checker` can be noisy/unstable in this harness, and the e2e runs already gate on `npm run typecheck`.
  const isPlaywrightRun = (() => {
    const raw = process.env.PLAYWRIGHT
    return raw === '1' || raw === 'true'
  })()

  return {
  // Load vite-plugin-checker only during dev to avoid ESM/CJS loader issues in
  // certain environments when bundling the Vite config for production builds.
  plugins: [
    assetsPlugin(),
    sfcMinifyPlugin(),
    // Dev-only (apply: 'serve'): receives inbound endpoint packets from the browser
    // when ?capturePackets is active and writes them as sampleLog fixtures. Inert in
    // production builds and when the URL param is absent. See packetCapturePlugin.ts.
    packetCapturePlugin(),
    wasmInlinePlugin(),
    // Suppresses the URL-based WASM auto-load in rule_engine.js so the binary is
    // not double-embedded (main bundle + worker IIFE). See suppressWasmUrlPlugin.ts.
    suppressWasmUrlPlugin(),
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
        // Dev keeps readable output for debugging; build compacts huge modules.
        generatorOpts: {
          compact: isBuild,
        },
      },
    }),
    ...(command === 'serve' && !isPlaywrightRun
      ? [
          // Dynamic import keeps this ESM-only dependency out of build-time config loading
          // NOTE: ESLint 9 + flat config breaks vite-plugin-checker's ESLint integration
          // (it passes removed Node API options). We keep TS checker for DX and
          // run ESLint via npm scripts instead.
          (await import('vite-plugin-checker')).default({
            typescript: true,
          }),
        ]
      : []),
    // Web builds output normal split assets; app builds inline everything into one HTML file.
    ...(!isWebBuild ? [singleFilePlugin()] : []),
    // Vite can emit duplicate copies of static-imported assets (one through Rollup's
    // assetFileNames hook into img/, another through its own internal pipeline into assets/).
    // This plugin prunes unreferenced image assets from the bundle at build time.
    ...(isWebBuild && isBuild ? [pruneOrphanedAssetsPlugin()] : []),
  ],
  define: (() => {
    // Read package.json version so we have a single source of truth
    try {
      const root = dirname(fileURLToPath(import.meta.url));
      const pkgPath = resolve(root, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
      return { __APP_VERSION__: JSON.stringify(pkg.version ?? '0.0.0') };
    } catch {
      return { __APP_VERSION__: JSON.stringify('0.0.0') };
    }
  })(),
  optimizeDeps: {
    // Keep dep-scan anchored to the real app entry.
    // Why: this repo also contains archived/report HTML files that can break
    // esbuild's scanner and disable pre-bundling during `vite` dev runs.
    entries: ['index.html'],
  },
  build: {
    // Write to dist.app/ for the single-file app build, dist.web/ for web-server deployment.
    outDir: isWebBuild ? 'dist.web' : 'dist.app',
    // App build: force Rollup to keep everything in a single JS chunk and inline all assets.
    // Web build: allow normal chunking/splitting so browsers can cache assets independently.
    cssCodeSplit: isWebBuild,
    assetsInlineLimit: isWebBuild ? 0 : 100000000,
    modulePreload: isWebBuild ? { polyfill: true } : false,
    // Smaller output: modern target + Terser minify with aggressive but safe compress
    target: 'es2018',
    minify: 'terser',
    terserOptions: {
      compress: {
        passes: 2,
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.info', 'console.debug', 'console.trace'],
      },
      mangle: true,
      format: { comments: false },
    },
    sourcemap: false,
    rollupOptions: {
      output: isWebBuild
        ? {
            // Organize web build output into meaningful subfolders with clean names.
            // JS/CSS entry chunks go into assets/; images keep their source ico/ subfolder.
            chunkFileNames: 'assets/[name]-[hash].js',
            entryFileNames: 'assets/[name]-[hash].js',
            assetFileNames(info) {
              // Route ico/ assets into clean subfolders matching the source tree.
              // originalFileNames / originalFileName are Vite extensions not in Rollup's types.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const src: string | undefined = (info as any).originalFileNames?.[0] ?? (info as any).originalFileName;
              if (src) {
                const posix = src.replace(/\\/g, '/');
                // ico/sets/slots/* → img/sets/slots/[name].webp  (must match before ico/sets/)
                if (posix.includes('ico/sets/slots/')) return 'img/sets/slots/[name][extname]';
                // ico/champs/*    → img/champs/[name].webp
                // ico/faction/*   → img/faction/[name].webp
                // ico/sets/*      → img/sets/[name].webp
                const icoMatch = posix.match(/ico\/(champs|faction|sets)\//);
                if (icoMatch) return `img/${icoMatch[1]}/[name][extname]`;
              }
              // CSS, WASM, and other non-image assets → assets/ with a cache-busting hash.
              return 'assets/[name]-[hash][extname]';
            },
          }
        : { codeSplitting: false },
    }
  },
  worker: {
    // App build: IIFE workers are required for `file://` compatibility; Chrome rejects ESM
    // workers under opaque origins. Force single chunk to satisfy IIFE multi-chunk restriction.
    // Web build: ESM workers work fine on a real web server; allow normal splitting.
    format: isWebBuild ? 'es' : 'iife',
    // stubInlineBytes: true stubs ruleEngineWasmBytes so the worker IIFE does not embed
    // the 1.6 MB WASM binary — the worker receives a compiled WebAssembly.Module via
    // postMessage from the main thread and calls initSync() instead.
    plugins: () => [suppressWasmUrlPlugin({ stubInlineBytes: true })],
    rollupOptions: isWebBuild
      ? {}
      : { output: { codeSplitting: false } },
  },
  resolve: {
    alias: [
      // Exact-match aliases — regex avoids prefix-collision with refractor/lang/* subpaths.
      // rehype-prism-plus default entry imports refractor/all (200+ langs); /common uses only
      // the 38-lang "common" subset, but with the refractor→core alias below even those are
      // dropped: only languages explicitly registered by the app end up in the bundle.
      { find: /^rehype-prism-plus$/, replacement: 'rehype-prism-plus/common' },
      // refractor main entry pre-loads 38 common languages; /core is the bare engine.
      // prismDynamicOverrides.ts explicitly registers the only langs we need (markdown + html).
      { find: /^refractor$/, replacement: 'refractor/core' },
      { find: 'react/compiler-runtime', replacement: 'react-compiler-runtime' },
      { find: 'fs',     replacement: withRootPath('./scripts/vite/shims/fs.cjs') },
      { find: 'path',   replacement: withRootPath('./scripts/vite/shims/path.cjs') },
      { find: 'crypto', replacement: withRootPath('./scripts/vite/shims/crypto.cjs') },
    ],
  },
  server: {
    watch: {
      // Ignore every non-dev path so large archives/output folders never get polled.
      ignored: shouldIgnoreDevWatchPath,
      usePolling: true,   // force polling
      interval: 400       // ms between checks
    },
    host: true,           // optional, helps with WSL2 networking
    strictPort: false,    // false = search for next free port
    // Pre-transform the entry + top-level app modules so Playwright (and the first
    // real navigation) doesn't pay the cold dep-graph compile inside the test timeout.
    warmup: {
      clientFiles: [
        './index.html',
        './src/main.tsx',
        './src/App.tsx',
      ],
    },
  }
  }
})
