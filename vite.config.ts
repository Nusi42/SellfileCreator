import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import Checker from 'vite-plugin-checker';

// Vite plugin to inline all built JS/CSS into index.html so the build
// outputs a single self-contained file.
function singleFilePlugin(): Plugin {
  return {
    name: 'single-file-inline',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlFileName = Object.keys(bundle).find((n) => n.endsWith('.html'));
      if (!htmlFileName) return;

      const htmlAsset = bundle[htmlFileName];
      if (!htmlAsset || htmlAsset.type !== 'asset') return;

      let html = String(htmlAsset.source);

      const jsChunks: Array<{ name: string; code: string }> = [];
      const cssAssets: Array<{ name: string; code: string }> = [];

      for (const [fileName, asset] of Object.entries(bundle)) {
        if (fileName === htmlFileName) continue;
        if (asset.type === 'asset' && typeof asset.source === 'string' && fileName.endsWith('.css')) {
          cssAssets.push({ name: fileName, code: asset.source });
          delete bundle[fileName];
        }
        if (asset.type === 'chunk' && fileName.endsWith('.js')) {
          jsChunks.push({ name: fileName, code: asset.code });
          delete bundle[fileName];
        }
      }

      // Remove external references Vite injects
      html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
      html = html.replace(/<link[^>]+rel="stylesheet"[^>]*>/g, '');
      html = html.replace(/<script\s+type="module"[^>]*src="[^"]+"><\/script>/g, '');

      if (cssAssets.length) {
        const css = cssAssets
          .map(x => `/* ${x.name} */\n${x.code}`)
          .join('\n')
          .replace(/<\/style/gi, '<\\/style');
        const style = `<style>\n${css}\n</style>`;
        // Use a function replacer to avoid $& expansion in content
        html = html.replace(/<\/head>/, () => `${style}\n</head>`);
      }

      if (jsChunks.length) {
        const code = jsChunks
          .map(x => `// ${x.name}\n${x.code}`)
          .join('\n')
          .replace(/<\/script/gi, '<\\/script');
        const script = `<script type="module">\n${code}\n</script>`;
        // Use a function replacer to avoid $& expansion in content
        html = html.replace(/<\/body>/, () => `${script}\n</body>`);
      }

      // Ensure only the HTML remains in the bundle
      for (const fileName of Object.keys(bundle)) {
        if (fileName !== htmlFileName) delete bundle[fileName];
      }

      htmlAsset.source = html;
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    Checker({
      typescript: true,
      eslint: {
        lintCommand: 'eslint . --ext .ts,.tsx'
      },
    }),
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
    rollupOptions: {
      output: {
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
  },
  server: {
    watch: {
      usePolling: true,   // force polling
      interval: 400       // ms between checks
    },
    host: true            // optional, helps with WSL2 networking
  }
});
