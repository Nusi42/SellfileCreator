import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

type InlineAsset = {
  rel: string;
  type: string;
  relativePath: string;
};

const INLINE_ASSETS: InlineAsset[] = [
  {
    rel: 'icon',
    type: 'image/svg+xml',
    relativePath: join('ico', 'favicon.svg'),
  },
];

const toPosix = (value: string): string => value.replace(/\\/g, '/');

export function assetsPlugin(): Plugin {
  let rootDir = process.cwd();

  const resolveAssetPath = (relativePath: string) => resolve(rootDir, relativePath);

  return {
    name: 'asset-prep',
    enforce: 'pre',
    configResolved(config) {
      rootDir = config.root;
    },
    transformIndexHtml(html) {
      const tags = INLINE_ASSETS.map(({ rel, type, relativePath }) => {
        const absolutePath = resolveAssetPath(relativePath);
        const contents = readFileSync(absolutePath, 'utf8');
        const href = `data:${type};base64,${Buffer.from(contents, 'utf8').toString('base64')}`;
        return {
          tag: 'link',
          attrs: { rel, type, href },
          injectTo: 'head' as const,
        };
      });
      return { html, tags };
    },
    handleHotUpdate(ctx) {
      const filePath = toPosix(ctx.file);
      for (const asset of INLINE_ASSETS) {
        if (filePath === toPosix(resolveAssetPath(asset.relativePath))) {
          ctx.server.ws.send({ type: 'full-reload' });
          break;
        }
      }
    },
  };
}
