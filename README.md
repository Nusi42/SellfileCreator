# RSL Sellfile Optimizer

Create and validate "sell files" for the RSL Helper tool used with Raid: Shadow Legends. This app is a lightweight React + TypeScript prototype to help define selling rules, preview the resulting list, and export data for use with your workflow.

Status: early draft — aligned with observed RSL Helper `.hsf` samples for Rank, Rarity, and Level encodings.

## Features

- Rules-based filtering: define keep/sell rules in JSON.
- Gear import: load a JSON export of gear (shape configurable).
- Preview: see which item IDs would be marked to sell.
- HSF viewer: load a `.hsf` (RSL Helper sell file) to inspect its rules.

## Project Structure

- `src/App.tsx`: UI glue for loading gear, editing rules, and generating output.
- `src/lib/types.ts`: Strongly typed gear model, rules, output, and shared catalogs/formatters (sets, types, rarity, rank, level, stat labels).
- `src/lib/sellFile.ts`: Rule matching and sell-list generator.
- `src/lib/defaultRuleSet.ts`: Starter rules to tweak.
- `src/lib/hsf.ts`: Minimal parser for `.hsf` (JSON with optional BOM) files.
- `src/lib/hsfTypes.ts`: Types for `.hsf` schema (Rules/Substats).
- `docs/rules/example-sell-rules.json`: Example rule set file you can load/copy.

## Getting Started

1. Ensure Node.js 18+ is installed.
2. Install dependencies: `npm install`
3. Start dev server: `npm run dev`

If you prefer `pnpm` or `yarn`, adjust commands accordingly.

## Rule Set Format (draft)

Rules are evaluated top-down; first match decides the action. If no rule matches, the `strategy` determines the default: `blacklist` keeps by default, `whitelist` sells by default.

```json
{
  "version": 1,
  "strategy": "blacklist",
  "rules": [
    {
      "name": "Sell low-rank commons/uncommons",
      "filter": {
        "rarities": ["common", "uncommon"],
        "ranks": [1, 2, 3],
        "maxLevel": 4,
        "onlyUnequipped": true
      },
      "action": "sell"
    }
  ]
}
```

Supported filter fields (see `src/lib/types.ts`): `slots`, `rarities`, `ranks`, `sets`, `maxLevel`, `onlyUnequipped`, `anySubstats`, `allSubstats`, `noneSubstats`, `minSpeed`.

Notes:
- `flatSubstatsOk` in `anySubstats`/`allSubstats`/`noneSubstats` means: item has any of flat `hp`, `atk`, or `def`.

## About RSL Helper "sell files"

RSL Helper’s exact sell file schema can vary by version. Based on provided samples, this app interprets:
- Container: `{ "Rules": [...] }` (UTF‑8, BOM tolerated).
- Rank codes (0–16): All; 1*..6*; >=1*..>=5*; <=2*..<=6* (no `<= 1*`).
- Rarity codes (0–16): All; Common..Mythical; >=Common..>=Legendary; <=Uncommon..<=Mythical.
- Level values: `99` = Any level; `0/4/8/12/16` rendered as `At +N`.
 - MainStatID/MainStatF pairs:
   - `-1` means Any main stat.
   - (1, F): HP (F=1) / HP% (F=0)
   - (2, F): Attack (F=1) / Attack% (F=0)
   - (3, F): Defense (F=1) / Defense% (F=0)
   - (4, 1): Speed
   - (5, 1): Resistance
   - (6, 1): Accuracy
   - (7, 0): Crit Rate%
   - (8, 0): Crit Damage%
   - (9, 1): HP/Attack/Defense

The viewer renders: `Keep`, `Use`, `Sets`, `Types`, `Rank`, `Rarity`, `Main Stat`, `Level`, and Substats summary.

## Roadmap

- Align output to RSL Helper sell-file schema.
- Import from common gear exports (e.g., RSL Helper/HH Optimizer formats).
- Rule testing with sample datasets.
- Export button (download as JSON/CSV as needed).

## Scripts

- `npm run dev`: Start Vite dev server.
- `npm run build`: Production build to `dist`.
- `npm run preview`: Preview built app.
- `npm run typecheck`: Type-check TypeScript.

## Contributing

See `AI_AGENT_RULESET.md` for collaboration guidelines tailored for AI-assisted development.
