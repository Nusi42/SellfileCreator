import { defineConfig, type UserConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { assetsPlugin } from './scripts/vite/assetsPlugin';
import { singleFilePlugin } from './scripts/vite/singleFilePlugin';
import { wasmInlinePlugin } from './scripts/vite/wasmInlinePlugin';

const withRootPath = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(async ({ command }): Promise<UserConfig> => {
  // Keep one mode flag so Babel generator settings stay deterministic.
  const isBuild = command === 'build'

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
    wasmInlinePlugin(),
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
    singleFilePlugin(),
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
  build: {
    // Force Rollup to keep everything in a single JS chunk
    cssCodeSplit: false,
    assetsInlineLimit: 100000000, // inline any asset references as data URIs
    modulePreload: false,
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
      output: {
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
    brotliSize: false,
  },
  worker: {
    // Release runs commonly open `SellfileCreator.html` via `file:///...` in Chrome.
    // Chrome is stricter for module workers (ESM) under opaque `file://` origins and
    // can reject worker startup with errors like:
    //   "Refused to cross-origin redirects of the top-level worker script."
    //
    // Use a classic/IIFE worker format for compatibility, but force the worker
    // bundle into a single chunk so Rollup doesn’t hit the IIFE multi-chunk restriction.
    format: 'iife',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
  },
  resolve: {
    alias: {
      'react/compiler-runtime': 'react-compiler-runtime',
      fs: withRootPath('./scripts/vite/shims/fs.cjs'),
      path: withRootPath('./scripts/vite/shims/path.cjs'),
      crypto: withRootPath('./scripts/vite/shims/crypto.cjs'),
    },
  },
  server: {
    watch: {
      usePolling: true,   // force polling
      interval: 400       // ms between checks
    },
    host: true,           // optional, helps with WSL2 networking
    strictPort: false     // false = search for next free port
  }
  }
})
