import type { Plugin } from 'vite';

// Vite plugin to inline all built JS/CSS into index.html so the build outputs a single self-contained file.
export function singleFilePlugin(): Plugin {
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
