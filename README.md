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
- Mainstat and Substats — on one row.
  - Both use 3 rows of toggle buttons in the same order:
    1) Any (wider)
    2) HP, HP%, ATK, ATK%, DEF, DEF%
    3) SPD, RES, ACC, CR%, CDMG%
  - Buttons have a uniform width for a tidy grid; “Any” is double wide for easier use.
  - Substats allows multiple selections and includes an Any option. Selecting Any is equivalent to selecting none; choosing any specific substats deselects Any.
- Min selected substats — on the next row, aligned to the right under Substats. Shows an inline warning when the minimum exceeds the number selected (no layout jump).
- Slots, Sets — filter the rule to specific gear slots or sets.

3) Manage Your Rules
- Use the chips to select, duplicate, reorder, or delete (deletions are confirmed). “Clear custom” removes all (also confirmed).

Reset defaults
- The “Reset to defaults” button resets Rank, Rarity (to All), Mainstat (to Any), Start level, Roll permutations (Yes), Min selected substats (to 0), Substats (to Any), and clears Slot/Set filters.

Defaults
- Rarity: All.
- Min selected substats: 0.

4) Preview & Download
- Check the Merged Preview table and click “Download merged .hsf”.
- Save your rule set as `.hsfr` for later reuse.

Tips
- Tables are scrollable; headers stick to the top.
- Drag‑and‑drop works for both `.hsf` and `.hsfr` next to their Load buttons.
- Builder labels are consistent for easier scanning; selects and toggles align for cleaner rows.

Need technical details (building from source, formats, code structure)? See docs/TECHNICAL.md.
