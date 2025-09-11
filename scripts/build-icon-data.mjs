// Build a TypeScript map of icon data URIs from `ico/` inputs.
// Why: Keep the app single-file by inlining icons. We avoid assumptions
// about rendering; this only prepares a data module for consumers.

import fs from 'node:fs/promises';
import path from 'node:path';

const SRC_DIR = 'ico';
const OUT_TS = path.join('src', 'lib', 'iconData.ts');
const TYPES_TS = path.join('src', 'lib', 'types.ts');

const VALID_EXT = new Set(['.png', '.jpg', '.jpeg']);

async function listExpectedSetNames() {
  // Parse `artifactSetNames` values from src/lib/types.ts by simple regex.
  // This keeps us aligned with the domain catalog without importing TS.
  const src = await fs.readFile(TYPES_TS, 'utf8');
  const blockMatch = src.match(/export const artifactSetNames:[\s\S]*?=\s*\{([\s\S]*?)\n\}/);
  if (!blockMatch) return [];
  const block = blockMatch[1];
  const names = [];
  const re = /:\s*'([^']+)'\s*,?/g;
  let m;
  while ((m = re.exec(block))) names.push(m[1]);
  // Filter out empty label for Any rarity etc. but none expected here
  return names;
}

async function main() {
  const files = await fs.readdir(SRC_DIR, { withFileTypes: true });
  const inputs = files.filter(f => f.isFile() && VALID_EXT.has(path.extname(f.name).toLowerCase()));

  const map = new Map();
  for (const f of inputs) {
    const ext = path.extname(f.name);
    const base = path.basename(f.name, ext); // set name expected to match
    const inPath = path.join(SRC_DIR, f.name);
    // Use the full file content as-is; do not crop/resize. Preserve format.
    const raw = await fs.readFile(inPath);
    const mime = ext.toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
    const b64 = raw.toString('base64');
    map.set(base, `data:${mime};base64,${b64}`);
  }

  // Expected sets per catalog
  const expected = new Set(await listExpectedSetNames());
  const have = new Set(map.keys());
  const missing = [...expected].filter(n => !have.has(n));
  const extras = [...have].filter(n => !expected.has(n));

  // Emit TypeScript module
  const entriesTs = [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join('\n');
  const ts = `// Auto-generated: inline icon data URIs keyed by set name.\n// Why: Keep build single-file while allowing easy asset updates.\nexport const ICON_DATA: Record<string, string> = {\n${entriesTs}\n};\n\n// Helper: check presence at runtime if desired (not used automatically).\nexport function hasIconFor(name: string): boolean {\n  return Object.prototype.hasOwnProperty.call(ICON_DATA, name);\n}\n`;
  await fs.mkdir(path.dirname(OUT_TS), { recursive: true });
  await fs.writeFile(OUT_TS, ts, 'utf8');

  // Log a concise report to the console for CI/dev awareness
  console.log(`Icons generated: ${map.size}. Missing (vs catalog): ${missing.length}${missing.length ? ' → ' + missing.join(', ') : ''}`);
  if (extras.length) console.log(`Extra icons not in catalog: ${extras.join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
