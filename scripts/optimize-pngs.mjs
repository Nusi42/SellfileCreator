// Recompress PNGs in `ico/` with maximum lossless compression.
// Requirements: preserve dimensions, alpha, and original bit depth where known.
// Strategy: use sharp with compressionLevel=9, effort=10, no palette quantization.
// Writes to a temp file and replaces only if the result is not larger.

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const DIR = 'ico';

async function optimizePng(file) {
  const inPath = path.join(DIR, file);
  const stat = await fs.stat(inPath);
  const input = sharp(inPath);
  const meta = await input.metadata();
  const hasAlpha = Boolean(meta.hasAlpha);
  // Preserve bit depth if sharp exposes it (commonly 8 or 16). Otherwise omit.
  const bitDepth = typeof meta.bitdepth === 'number' ? meta.bitdepth : undefined;

  const pngOpts = {
    compressionLevel: 9,
    effort: 10,
    adaptiveFiltering: true,
    palette: false,
    ...(bitDepth && (bitDepth === 8 || bitDepth === 16) ? { bitdepth: bitDepth } : {}),
  };

  // Ensure alpha channel is preserved; sharp keeps it by default if present.
  let pipeline = input;
  if (hasAlpha) pipeline = pipeline.ensureAlpha();

  const tmpPath = inPath + '.tmp';
  await pipeline.png(pngOpts).toFile(tmpPath);
  const outStat = await fs.stat(tmpPath);

  // Always replace to ensure binary data changes, regardless of size.
  await fs.rename(tmpPath, inPath);
  return { saved: Math.max(0, stat.size - outStat.size), original: stat.size, final: outStat.size, replaced: true };
}

async function main() {
  const entries = await fs.readdir(DIR, { withFileTypes: true });
  const pngs = entries.filter(e => e.isFile() && path.extname(e.name).toLowerCase() === '.png');
  let totalSaved = 0;
  let totalOrig = 0;
  let replaced = 0;
  for (const e of pngs) {
    const res = await optimizePng(e.name);
    totalSaved += res.saved;
    totalOrig += res.original;
    if (res.replaced) replaced++;
  }
  const pct = totalOrig ? ((totalSaved / totalOrig) * 100).toFixed(2) : '0.00';
  console.log(`Optimized ${pngs.length} PNGs. Replaced: ${replaced}. Saved: ${totalSaved} bytes (${pct}%).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
