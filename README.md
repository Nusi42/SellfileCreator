# RSL Sellfile Creator (Unofficial)

Build, preview, and export sell rules for RSL Helper with a simple UI.

- Base Sell File: Optional — load a base .hsf if you want to include existing rules.
- Add Rules: Build rules and manage/save your custom set.
- Metasets: Name groups of gear sets and reuse them across rules.
- Preview: See everything merged together before downloading.
- One‑click Download: Get your merged sell file.

> Disclaimer: This is an independent, fan‑made utility. Not affiliated with Plarium, Raid: Shadow Legends, or RSL Helper. Trademarks belong to their owners.

## How To Use

1) Base Sell File (optional)
- Click “Load .hsf / JSON” or drag your file into the drop area. Skip this if you’re starting from scratch — you can still build and export rules without a base file.

2) Add Rules
- Fill in the builder and give your rule a clear “Rule Name”.
- Click “Add as new config” to save it; click a chip to edit, then “Update selected config”.
- Load/Save: Use “Load .hsfr” and “Save .hsfr” here to reuse your custom rules (includes metasets).

Builder layout (top → bottom)
- Action: Keep or Sell.
- Rank, Rarity, Start level, Roll permutations.
  - Roll permutations: “Yes” also adds checks for +4/+8/+12/+16 from your chosen start level; “No” uses only the start level.
- Mainstat and Substats — on one row.
  - Both use 3 rows of toggle buttons in the same order:
    1) Any (wider)
    2) HP, HP%, ATK, ATK%, DEF, DEF%
    3) SPD, RES, ACC, CR%, CDMG%
  - “Any” is a quick reset. In Substats, selecting Any is the same as choosing none; picking specific substats turns Any off.
- Min selected substats — to the right of Substats. Warns you if the minimum is higher than the number of chosen substats.
- Slots — click the 9 icons to limit the rule to specific gear slots.
- Sets — choose gear sets for the rule. Includes:
  - Search box and sorting toggle (Game order / A–Z).
  - “Manage metasets…” button to edit your named groups.
  - Metasets appear at the very top, separated from the normal set list. Selecting a metaset includes all sets in that group. You can also pick individual sets — they’re combined.

Metasets
- Click “Manage metasets…” in the Sets row to open the dialog.
- Add or rename metasets and choose which sets each one contains.
- The dialog uses the same search and sorting as the Sets picker.
- Defaults included: Debuffer, Tank, Support, DD, Karnage, UDK (you can fill them as you like).

3) Manage Your Rules
- In the Add Rules section, use the chips to select, duplicate, reorder, or delete (deletions are confirmed). “Clear custom” removes all (also confirmed).

Reset defaults
- The “Reset to defaults” button resets Rank, Rarity, Mainstat, Start level, Roll permutations, Min selected substats, Substats, and clears Slot/Set filters.

Defaults
- Rarity: All.
- Min selected substats: 0.

4) Preview & Download
- Check the Merged Preview table and click “Download merged .hsf”.
- Use “Save .hsfr” and “Load .hsfr” in Add Rules to keep and reuse your work (your rules and metasets are included).

Tips
- Tables are scrollable; headers stick to the top.
- Drag‑and‑drop works for both base files and saved rule sets.
- Labels and controls align for quick scanning.
- “Reset to defaults” resets the builder. Manage metasets via the dialog.

Need technical details (building from source, formats, code structure)? See docs/TECHNICAL.md.
