import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Vite's `new URL(..., import.meta.url)` asset pipeline writes hashed files
 * directly to `assets/`, bypassing Rollup's `assetFileNames` hook. When the
 * same source images are also emitted through Rollup (via static `import` or
 * `import.meta.glob`), the build produces two copies: a clean one in `img/`
 * and a hashed one in `assets/`.
 *
 * This plugin runs at `closeBundle` — after all files are on disk — and:
 *   1. Rewrites JS references from the hashed `assets/` path to the clean
 *      `img/` path (matched by stripping the hash and comparing basenames).
 *   2. Deletes the now-unreferenced hashed image copies from `assets/`.
 */
export function pruneOrphanedAssetsPlugin(): Plugin {
  let outDir = '';

  return {
    name: 'prune-orphaned-assets',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      if (!outDir) return;

      const IMAGE_RE = /\.(webp|png|jpg|jpeg|gif|svg)$/i;
      const assetsDir = join(outDir, 'assets');

      // List hashed image files in assets/.
      let hashedImages: string[];
      try {
        hashedImages = readdirSync(assetsDir).filter((f) => IMAGE_RE.test(f));
      } catch {
        return;
      }
      if (hashedImages.length === 0) return;

      // Build a map of clean image paths across the entire output tree (img/**).
      // Key: base name without extension (e.g. "Accuracy"), Value: relative path from outDir.
      const cleanPaths = new Map<string, string>();
      const collectClean = (dir: string, prefix: string) => {
        let entries: string[];
        try { entries = readdirSync(dir); } catch { return; }
        for (const entry of entries) {
          const fullPath = join(dir, entry);
          const relPath = prefix ? `${prefix}/${entry}` : entry;
          try {
            // Try as directory first.
            readdirSync(fullPath);
            collectClean(fullPath, relPath);
          } catch {
            // It's a file; index by base name.
            if (IMAGE_RE.test(entry)) {
              const baseName = entry.replace(/\.[^.]+$/, '');
              cleanPaths.set(baseName, `img/${relPath}`);
            }
          }
        }
      };
      collectClean(join(outDir, 'img'), '');

      // Build rewrites: hashed filename → clean path.
      // Hashed names follow the pattern `Name-hash.ext`; strip the hash to get the base.
      const rewrites = new Map<string, string>();
      for (const hashed of hashedImages) {
        const baseName = hashed.replace(/-[A-Za-z0-9_-]+(\.\w+)$/, '');
        const cleanPath = cleanPaths.get(baseName);
        if (cleanPath) {
          rewrites.set(`assets/${hashed}`, cleanPath);
        }
      }

      if (rewrites.size === 0) return;

      // Rewrite JS files in assets/ to point to the clean paths.
      const jsFiles = readdirSync(assetsDir).filter((f) => /\.js$/i.test(f));
      for (const jsFile of jsFiles) {
        const jsPath = join(assetsDir, jsFile);
        let code = readFileSync(jsPath, 'utf8');
        let changed = false;
        for (const [hashed, clean] of rewrites) {
          if (code.includes(hashed)) {
            code = code.replaceAll(hashed, clean);
            changed = true;
          }
        }
        if (changed) writeFileSync(jsPath, code, 'utf8');
      }

      // Delete the now-unreferenced hashed copies.
      for (const [hashed] of rewrites) {
        const fileName = hashed.replace('assets/', '');
        rmSync(join(assetsDir, fileName), { force: true });
      }

      // eslint-disable-next-line no-console
      console.log(`[prune-orphaned-assets] deduplicated ${rewrites.size} image(s) → img/`);
    },
  };
}
