# RSL Sellfile Optimizer

Create and validate "sell files" for the RSL Helper tool used with Raid: Shadow Legends. This app is a lightweight React + TypeScript prototype to help define selling rules, preview the resulting list, and export data for use with your workflow.

Status: early draft — formats and rules are placeholders pending your preferences and the exact RSL Helper expectations.

## Features

- Rules-based filtering: define keep/sell rules in JSON.
- Gear import: load a JSON export of gear (shape configurable).
- Preview: see which item IDs would be marked to sell.
- HSF viewer: load a `.hsf` (RSL Helper sell file) to inspect its rules.

## Project Structure

- `src/App.tsx`: UI glue for loading gear, editing rules, and generating output.
- `src/lib/types.ts`: Strongly typed gear model, rules, and output.
- `src/lib/sellFile.ts`: Rule matching and sell-list generator.
- `src/lib/defaultRuleSet.ts`: Starter rules to tweak.
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

## About RSL Helper "sell files"

RSL Helper’s exact sell file schema can vary by version. Please provide an example sell file (or documentation) and we will align the generator to precisely match its required format and export location.

This app now includes a minimal viewer to load `.hsf` files and render their rule rows for inspection. It parses the observed structure `{ Rules: [...] }`, and displays common fields like `Keep`, `Use`, `ArtifactType/Set`, `Rank`, `Rarity`, and a compact substat summary.

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
