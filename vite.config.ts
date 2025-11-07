import { defineConfig, type UserConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { assetsPlugin } from './scripts/vite/assetsPlugin';
import { singleFilePlugin } from './scripts/vite/singleFilePlugin';

const withRootPath = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(async ({ command }): Promise<UserConfig> => ({
  // Load vite-plugin-checker only during dev to avoid ESM/CJS loader issues in
  // certain environments when bundling the Vite config for production builds.
  plugins: [
    assetsPlugin(),
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    ...(command === 'serve'
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
}));
