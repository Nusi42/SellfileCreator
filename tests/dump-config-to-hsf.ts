/**
 * Dump HSF rules for a single readable HSFR config.
 *
 * Why: Helps verify exact rule emission for specific cases (levels, overlaps).
 * This script normalizes the provided readable config into a BuilderConfig,
 * runs the core builder, and prints/writes the resulting HSF rules.
 */
import { normalizeConfig } from '../src/lib/hsfrIO'
import { buildHsfRules, defaultMinima, type BuilderConfig } from '../src/lib/hsfBuilder'
import type { HsfFile } from '../src/lib/hsfTypes'
import fs from 'node:fs'
import path from 'node:path'

// Input: hard‑coded sample from the user for reproducibility.
const input = {
  Version: '0.9.3-dev',
  Metasets: [],
  Configs: [
    {
      name: 'Perfect Debuffer Items',
      keep: true,
      enabled: true,
      Rank: '6★',
      Rarity: '≥ Legendary',
      Faction: 'Any',
      mainStats: ['SPD'],
      minLevel: 0,
      maxLevel: 16,
      substats: ['ACC', 'RES', 'HP%', 'DEF%'],
      fixedSubstats: ['ACC'],
      substatRollBounds: {
        'HP%': { any: true },
        'DEF%': { any: true },
        RES: { any: true },
        ACC: { min: 3 },
      },
      minCount: 3,
      autoMinCount: false,
      minRequiredRolls: 0,
      autoMinRequiredRolls: true,
      artifactTypeNames: ['Boots'],
      artifactSetNames: [],
      artifactMetaSetIds: [],
    },
  ],
} as const

function main() {
  const cfgReadable = input.Configs[0]
  const cfg: BuilderConfig = normalizeConfig(cfgReadable)
  const rules = buildHsfRules(cfg, defaultMinima())

  const out: HsfFile = { Rules: rules }
  const json = JSON.stringify(out, null, 2)

  // Also write the full file under scripts/.tmp for inspection.
  const outDir = path.join(process.cwd(), 'scripts/.tmp/output')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'perfect-debuffer-items.hsf.json')
  fs.writeFileSync(outPath, json, 'utf8')

  // Print a concise summary and level 8 slice for quick review.
  console.log('Total rules:', rules.length)
  const byLevel = new Map<number, number>()
  for (const r of rules) {
    const lvl = (r.LVLForCheck ?? 99)
    byLevel.set(lvl, (byLevel.get(lvl) ?? 0) + 1)
  }
  console.log('Rules by level:', Object.fromEntries([...byLevel.entries()].sort((a,b)=>a[0]-b[0])))

  const lvl8 = rules.filter(r => r.LVLForCheck === 8)
  console.log('Level 8 rules:', lvl8.length)
  // Emit level 8 rules inline to highlight the “3 vs 4 substats” behavior.
  console.log(JSON.stringify({ Rules: lvl8 }, null, 2))
  // Also print the full rules JSON in case you want to save it.
  console.log('Full HSF JSON:')
  console.log(json)
  console.log('Written to:', outPath)
}

main()
