# RSL Sellfile Creator (Unofficial)

Build, preview, and export RSL Helper sell files without touching JSON.

- Base HSF: Load your `.hsf` file (button or drag-and-drop).
- Custom Rules (HSFR): Create named rule configurations and save/load them as `.hsfr`.
- Merged Preview: See how your custom rules apply to the base file.
- One‑click Downloads: Save merged `.hsf` and your `.hsfr`.

> Disclaimer: This is an independent, fan‑made utility. Not affiliated with Plarium, Raid: Shadow Legends, or RSL Helper. Trademarks belong to their owners.

## How To Use

1) Load Base HSF
- Click “Load .hsf / JSON” or drag a `.hsf` into the dropzone.

2) Create Rules
- Fill in the builder and give your rule a clear “Rule Name”.
- Click “Add as new config” to save it; click a chip to edit, then “Update selected config”.

Builder layout (top → bottom)
- Action: Keep or Sell.
- Rank, Rarity, Start level, Roll permutations.
  - Roll permutations: Yes/No toggle. “Yes” also builds rules for +4/+8/+12/+16 from the chosen start level.
- Main Stat and Choose substats — on one row.
  - Main Stat is a compact toggle group (Any, HP, HP%, ATK, ATK%, DEF, DEF%, SPD, ACC, RES, CR%, CDMG%).
  - Choose substats is also a compact toggle group and includes an Any option. Selecting Any is equivalent to selecting none; choosing any specific substats deselects Any.
- Min selected substats — on the next row, aligned to the right under Choose substats.
- Slots, Sets — filter the rule to specific gear slots or sets.

3) Manage Your Rules
- Use the chips to select, duplicate, reorder, or delete (deletions are confirmed). “Clear custom” removes all (also confirmed).

4) Preview & Download
- Check the Merged Preview table and click “Download merged .hsf”.
- Save your rule set as `.hsfr` for later reuse.

Tips
- Tables are scrollable; headers stick to the top.
- Drag‑and‑drop works for both `.hsf` and `.hsfr` next to their Load buttons.
- Builder labels are consistent for easier scanning; selects and toggles align for cleaner rows.

Need technical details (building from source, formats, code structure)? See docs/TECHNICAL.md.
