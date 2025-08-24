# RSL Sellfile Creator (Unofficial)

Build, preview, and export sell rules for RSL Helper with a simple UI.

- Base Sell File: Optional — load a base .hsf if you want to include existing rules.
- Add Configs and Rules: Build rules and manage/save your custom set.
- Metasets: Name groups of gear sets and reuse them across rules.
- Preview: See everything merged together before downloading.
- One‑click Download: Get your merged sell file.

> Disclaimer: This is an independent, fan‑made utility. Not affiliated with Plarium, Raid: Shadow Legends, or RSL Helper. Trademarks belong to their owners.

## How To Use

1) Base Sell File (optional)
- Click “Load .hsf” or drag your file into the drop area. Skip this if you’re starting from scratch — you can still build and export rules without a base file.
- Clear: Use “Clear base” to unload the currently loaded .hsf.

2) Add Configs and Rules
- Fill in the builder and give your rule a clear “Rule Name”.
- Click “Add as new config” to save it; click a chip to edit, then “Update selected config”.
- Load/Save: Use “Load .hsfr” and “Save .hsfr” here to reuse your custom rules (includes metasets and your substat minima).
  - Saved filename defaults to `SellfileCreatorRules_YYYYMMDD_HHMM.hsfr`.
  - HSFR also saves whether “All (Explicit)” metaset is enabled so it can be restored when loading.

Builder layout (top → bottom)
- Action: Keep or Sell.
- Rank, Rarity, Start level, Roll permutations.
  - Faction: Optional, applies to accessories (Ring, Amulet, Banner) only.
  - Roll permutations: Off (start only), Strict (+4/+8/+12/+16), or Potential (strict + early relaxed keeps). Default is Potential.
  - Rank labels use stars: 1★..6★. Ranges use unicode symbols: ≥ 5★, ≤ 6★.
  - Rarity range labels also use unicode: ≥ Rare, ≤ Epic, etc.
- Mainstat and Substats — on one row.
  - Both use 3 rows of toggle buttons in the same order:
    1) Any (wider)
    2) HP, HP%, ATK, ATK%, DEF, DEF%
    3) SPD, RES, ACC, CR%, CDMG%
  - Mainstat: multi-select is allowed. Selecting none equals Any. When exporting `.hsf`, selections are “unrolled” into separate rules per chosen main stat (HSF does not support arrays here).
  - “Any” is a quick reset. In Substats, selecting Any is the same as choosing none; picking specific substats turns Any off.
  - Substats support 3 states per item: unselected, selected, fixed. Click the small lock icon on a selected substat to fix/unfix it. Clicking the lock on an unselected substat will select and fix it.
  - Fixed substats are always included in generated permutations. Combination size is max(Required, Fixed), capped at 4.
- Required substats — to the right of Substats. Sets how many of your selected substats must be present (fixed ones are always included). A single warning area shows if Required > chosen, or if Fixed > 4.
  - Required substats buttons: Auto, 1, 2, 3, 4. “Auto” sets Required to min(4, selected) and keeps it synced as you add/remove substats. Selecting a number disables Auto. Clearing Substats sets Required to 0.
  - Substat Values…: Open the manager for minimum substat values used when generating thresholds at each gear level.
  - Potential keep: Optional toggle that also adds relaxed early-level rules so items that can still reach your roll targets by +16 are kept while leveling. This can temporarily allow some selected substats to be missing (while additions remain), and relaxes min rolls by the remaining rolls to +16. Max constraints remain strict.
- Slots — click the 9 icons to limit the rule to specific gear slots.
- Sets — choose gear sets for the rule. Includes:
  - Search box and sorting toggle (Game order / A–Z).
  - “Manage metasets…” button to edit your named groups.
  - If nothing is selected, the Sets field shows “Any”.
  - Metasets appear at the very top, separated from the normal set list. Selecting a metaset includes all sets in that group. You can also pick individual sets — they’re combined.

Metasets
- Click “Manage metasets…” in the Sets row to open the dialog.
- Add or rename metasets and choose which sets each one contains.
- The dialog uses the same search and sorting as the Sets picker.
- Defaults included: Debuffer, Tank, Support, DD, Karnage, UDK (you can fill them as you like).

Add explicit metaset for "All"
- In Manage Metasets, there’s a checkbox labeled “Add explicit metaset for \"All\"”. When enabled, the Sets selector shows a metaset called “All (Explicit)” at the top.
  - Selecting it matches all currently known gear sets by explicitly listing them (unlike “Any”, which lists none). This is useful when exporting `.hsf` so new sets added by the game won’t implicitly match old rules.
  - Display: The metaset shows a blue “(N set(s))” count and does not list every set name under it. Regular sets do not show “All (Explicit)” as a membership badge.
  - Tip: If you save `.hsfr` while using “All (Explicit)”, enable the checkbox after loading to keep using this metaset in the UI.

3) Manage Your Rules
- Config Chips: In the Add Configs and Rules section, each saved rule appears as a chip. Use chips to select, duplicate, reorder, or delete (deletions are confirmed). “Delete Configs” removes all (also confirmed).
  - Hover linking: Hovering a Config Chip highlights all rows from that config in the Merged Preview. Hovering a row in the Merged Preview highlights the corresponding Config Chip.
  - Click linking: Clicking a row in the Merged Preview selects its Config Chip (and loads it into the builder). Rows originating from the base `.hsf` do not change chip selection.
  - Context menu: Right‑click a row in Merged Preview for quick actions on its config (Select, Duplicate, Move up/down, Delete). Base `.hsf` rows show only “Copy rule for RSL Helper”.

Reset defaults
- The “Reset to defaults” button resets Rank, Rarity, Mainstat, Start level, Roll permutations, Required substats, Substats (including fixed), and clears Slot/Set filters.

Defaults
- Rarity: Any.
- Required substats: Auto (effectively 0 until substats are chosen).

4) Preview & Download
- Check the Merged Preview table and click “Download merged .hsf”.
  - Columns include an “Idx” and a “Cfg” column. “Cfg” shows which Config Chip (1‑based) created the row. It’s empty for base `.hsf` rules.
- Use “Save .hsfr” and “Load .hsfr” in Add Rules to keep and reuse your work (your rules, metasets, and minima are included).
  - You can also save and reload from the Add Configs and Rules section; your rules, metasets, and minima are included.
  - Downloaded filename defaults to `Sellfile_YYYYMMDD_HHMM.hsf`.

Tips
- Tables are scrollable; headers stick to the top.
- Drag‑and‑drop works for both base files and saved rule sets.
- Labels and controls align for quick scanning.
- “Reset to defaults” resets the builder. Manage metasets via the dialog.

Substat Values manager (Minimum Substat Values)
- Open it via the “Substat Values…” button next to “Required substats”.
- Set the minimum values per substat for 6★ and 5★ gear; optionally toggle and fill 4★–1★.
- These values are used to compute thresholds at each milestone (+0/+4/+8/+12/+16) when generating rules with roll permutations.
- Roll baseline: Choose After (counts rolls after start) or UpTo (counts rolls to each level). Example (6★ SPD, start=8): After → 5/10/15; UpTo → 15/20/25.
- Use “Reset to defaults” inside the dialog to restore the recommended values.

Notation (Stars & Symbols)
- Star symbol vs word: 5★ is the same as “5‑Star”. This app uses the star (★) symbol throughout for brevity.
- Range symbols: We use unicode “≥” and “≤” instead of ">=" and "<=" for rank and rarity ranges.
- Fixed substats: A lock symbol (🔒) next to a substat indicates it is fixed and always included in generated combinations.

Example: Fixed + required
- Select Substats: SPD, HP, ATK. Click the lock on SPD to fix it.
- Set Required substats = 2.
- Generated permutations include SPD+HP and SPD+ATK. They do not include HP+ATK without SPD, because fixed substats are always included.

Need technical details (building from source, formats, code structure)? See docs/TECHNICAL.md.
