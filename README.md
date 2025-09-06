# RSL Helper Sellfile Creator

Build, preview, and export sell rules for RSL Helper with a simple UI.

> This is an independent, fan‑made tool. Not affiliated with Plarium, Raid: Shadow Legends, or RSL Helper. Trademarks belong to their owners.

- Add Configs and Rules: Build rules and manage/save your custom set.
- Preview: See your generated rules, optionally combined with an existing file.
- Base file (optional): Load an existing RSL Helper Sellfile (.hsf) inside Preview. You can drag & drop `.hsf` files or a Configs file (`.hsfr`) anywhere onto the app; an overlay confirms accepted files.
- Metasets: Name groups of gear sets and reuse them across rules.
- One‑click Export: Export an RSL Helper Sellfile (.hsf).



## Acknowledgements

Many thanks to [STBL] Nasgor and [SP] Panda for their invaluable contributions!

## How To Use

Configs file
- A “Configs file” uses the `.hsfr` extension. You don’t need to know the format — just use Load/Save Configs to back up and restore your setup.

1) Build Your Rules (Add Configs and Rules)
- Fill in the builder and give your rule a clear “Rule Name”.
- Click “Add as new config” to save it; click a chip to edit, then “Update selected config”.
- Load/Save: Use “Load Configs” and “Save Configs” to reuse your custom rules (includes metasets and your substat minima). These actions read/write a Configs file.
  - Saved filename defaults to `SellfileCreatorRules_YYYYMMDD_HHMM.hsfr`.
  - The Configs file also saves whether “All (Explicit)” metaset is enabled so it can be restored when loading.
  - Note: Click “Add Note” (or “Edit Note”) to attach a global Markdown note to your Configs file. The note is shown automatically after loading a Configs file that contains one. “Copy all Configs” includes the note. Pasting from the clipboard only replaces your current note if your note is empty (loading a file always replaces it).

Builder layout (top → bottom)
- Action: Keep or Sell, and Enabled.
  - Enabled: toggles whether rules from this config are active. When off, the rules are still exported but ignored by RSL Helper. Disabled rows show with a white strikethrough in the preview table, and the config chip strikes through only the Keep/Sell text.
- Rank, Rarity, Evaluate From, Roll Strategy.
  - Faction: Optional, applies to accessories (Ring, Amulet, Banner) only.
  - These work together:
    - Count Rolls: From = only rolls after “Evaluate From”. All = all rolls up to each level.
      - Example setup: 6★ item with SPD; each SPD roll adds +5. Evaluate From = 8–11.
      - From: count only rolls after +8 → SPD +5, +10, +15 …
      - All: count all rolls up to each level → SPD +15, +20, +25 …
    - Evaluate From: Where checking starts (0–3, 4–7, 8–11, 12–15, 16). Any ignores rolls and sets Roll Strategy to Off.
    - Roll Strategy: Off (ignore roll indicators), Auto (Strict unless you set any roll minimums), Strict (must already meet roll minimum at each level), Potential (also allows items that can still reach it by +16). The ★ star does not count for Auto.
- Mainstat and Substats — on one row.
  - Both use 3 rows of toggle buttons in the same order:
    1) Any (wider)
    2) HP, HP%, ATK, ATK%, DEF, DEF%
    3) SPD, RES, ACC, CR%, CDMG%
  - Mainstat: multi-select is allowed. Selecting none equals Any. When exporting a Sellfile (.hsf), if you pick more than one main stat we create one rule per main stat.
  - “Any” is a quick reset. In Substats, selecting Any is the same as choosing none; picking specific substats turns Any off.
  - Substats support 3 states: click to select; click again to lock (🔒); click again to clear.
  - Fixed substats are always included when rules are created. The total substats targeted in a rule is max(Required, Fixed), capped at 4.
  - Rolls per substat: A small round roll indicator appears on the right of each selected substat.
    - Click = Min Rolls (green): ★ → 1 → 2 → 3 → 4 → 5 → ★ (Min and Max are exclusive).
    - Shift+click = Max Rolls (red): ★ → 0 → 1 → 2 → 3 → 4 → ★. Max=0 forbids rolls on that substat.
    - ★ (star): consider all roll possibilities for that substat without enforcing a numeric minimum.
    - “Count Rolls” decides how many rolls are counted at each level — From counts after “Evaluate From”; All includes prior rolls up to each level.
- Required substats — to the right of Substats. How many of your picked substats the item must have (locked ones always count). A single warning area shows if Required > chosen, or if Fixed > 4.
  - Required substats buttons: Auto, 1, 2, 3, 4. “Auto” sets Required to min(4, selected) and keeps it synced as you add/remove substats. Selecting a number disables Auto. Clearing Substats sets Required to 0.
  - Min required rolls: Auto, 1–5. When enabled, enforces an aggregate minimum number of rolls distributed across your selected substats (e.g., 3 = at least three rolls total among them). In Potential mode, early rows are shown only if this can still be met by +16. In Roll Strategy = Auto, setting this > 0 switches Auto to Potential.
    - Examples:
      - Endgame Gauntlets (CDMG%): Fixed SPD and CR%, also target HP%/ATK%/DEF% (any), Required = 3, Min required rolls = 3, Rarity ≥ Legendary, Evaluate From = 0–3, Count Rolls = From, Strategy = Auto → shows 0–3 progress and enforces 3 total rolls across the selected substats by +16.
      - Midgame Boots (SPD): Target SPD, ACC, HP%, Required = 2, Min required rolls = 2, Strategy = Auto → allows early progress rows but only keeps items that can reach 2 total rolls among the selected substats by +16.
  - Substat Values…: Open the manager for minimum substat values used when generating thresholds at each gear level.
  - Note on Rank “Any”: When Rank is set to Any, substat thresholds use the 6★ baseline (conservative). If you want 5★ baselines, choose Rank ≤ 5★ or an exact rank.
- Slots — click the 9 icons to limit the rule to specific gear slots.
- Sets — choose gear Sets and/or Metasets that this rule applies to.
  - Search sets: filter by set name.
  - View modes: Icons, Game, or A–Z. Icons shows a compact icon‑only grid with tooltips; Game lists sets in in‑game order; A–Z sorts alphabetically. Your view choice is remembered and shared with the Metasets dialog.
  - “Manage metasets…” button to edit your named groups.
  - If nothing is selected, the Sets field shows “Any”.
  - Metasets appear at the very top, separated from the normal set list. Selecting a metaset includes all sets in that group. You can also pick individual sets — they’re combined.

Metasets
- Click “Manage metasets…” in the Sets row to open the dialog.
- Add or rename metasets and choose which sets each one contains.
- The dialog uses the same search and view modes as the Sets picker.
- Defaults included (editable): Full Speed (2‑piece 10%+), Need 4 Speed, Nuker — Tier 3/2/1/0, Support (ACC), Support (RES), Support Tank — Tier 1/2, Self Heals, Cooldown / Extra Turns, Counterattack, Immunity Buff, Debuff Set Bonuses — Tier 1/2, Outdated, Accessoires — Special.

“All (Explicit)” metaset
- Enable the “All (Explicit)” toggle in the builder to add a metaset at the top of the Sets list.
  - Selecting it matches all currently known gear sets by explicitly listing them (different from “Any”, which lists none). Helpful when exporting a Sellfile (.hsf) so new sets won’t implicitly match old rules.
  - The metaset shows a “(N set(s))” count and does not list every set name under it.
- If you save while using “All (Explicit)”, enable the toggle after loading to keep using it.

Managing Configs
- Config Chips: In the Add Configs and Rules section, each saved rule appears as a chip. Use chips to select (left‑click), duplicate, reorder, or delete (deletions are confirmed). “Delete Configs” removes all (also confirmed).
  - Hover linking: Hovering a Config Chip highlights all rows from that config in the Preview. Hovering a row in the Preview highlights the corresponding Config Chip.
  - Click linking: Clicking a row in the Preview selects its Config Chip (and loads it into the builder). Rows originating from the base `.hsf` do not change chip selection.
  - Chip context menu (right‑click a chip): Duplicate, Move to Top, Move Up, Move Down, Move to Bottom, Copy to Clipboard, Delete.
- Chip area context menu (right‑click the chip area): Copy All (Configs), Paste. When there are no configs yet, the area still shows a hint and accepts right‑click Paste.
  - Clipboard fallback: If clipboard access is blocked (non‑secure context), a dialog opens with the content pre‑selected — press Ctrl/Cmd+C to copy, or paste into the Paste dialog.
- Copy All (Configs) copies everything needed to restore your setup (configs, metasets, minima, settings). Paste accepts content copied from this app.

Reset defaults
- The “Reset to defaults” button resets Rank, Rarity, Mainstat, Evaluate From, Count Rolls, Roll Strategy, Required substats, Substats (including fixed and rolls), and clears Slot/Set filters.

Defaults
- Rarity: Any.
- Roll Strategy: Auto.
- Required substats: Auto (effectively 0 until substats are chosen).

2) Preview (and Optional Base File)
- In the Preview panel, you can optionally combine your rules with an existing file:
  - Click “Load RSL Helper Sellfile” (or drag & drop) to include an existing `.hsf`.
  - Click “Clear” to remove the loaded file.
- Use the palette icon to open Manage Colors for substat chips.
- The table shows all rules to be exported. Columns include an “Idx” and a “Cfg” column. “Cfg” shows which Config Chip (1‑based) created the row. It’s empty for base file rules.

3) Export
- Click “Export merged RSL Helper Sellfile” (or “Export RSL Helper Sellfile” when no base file is loaded).
- Use “Save Configs” and “Load Configs” in Add Rules to keep and reuse your work (your rules, metasets, and minima are included).
  - You can also save and reload from the Add Configs and Rules section; your rules, metasets, and minima are included.
  - Exported filename defaults to `Sellfile_YYYYMMDD_HHMM.hsf`.

Save/Load
- “Save Configs” writes all your configs, metasets, and minima, plus whether “All (Explicit)” is enabled. Loading restores them.

- Tip: To avoid clipboard restrictions, use `http://localhost:5173` or serve HTTPS for dev. Otherwise use the fallback dialogs.

Tips
- Drag‑and‑drop works for both base files and saved rule sets.
- “Reset to defaults” resets the builder; manage metasets via the dialog.

## Examples

Example: Lock one, require two
- Select Substats: SPD, HP, ATK. Click SPD twice to lock it (🔒).
- Set Required substats = 2.
- Effect: Rules include SPD+HP and SPD+ATK. They do not include HP+ATK without SPD (locked substats are always included).

Example: Focus rolls on 3 stats, forbid rolls on the 4th
- Goal: Keep items that have SPD, CR%, CDMG% and one of HP%/ATK%/DEF%, but do not allow rolls on that 4th substat.
- Select Substats: SPD, CR%, CDMG%, HP%, ATK%, DEF%.
- Required substats = 4.
- Roll indicators:
  - Click (Min Rolls): set SPD, CR%, CDMG% to your desired mins (for example 1 each).
  - Shift+click (Max Rolls): set HP%, ATK%, DEF% to Max = 0.
- Effect: The fourth substat is always one of HP%/ATK%/DEF%, and whichever it is, it gets zero rolls. SPD/CR%/CDMG% receive the rolls.

Example: Potential early keeps with a wildcard
- Select Substats: SPD and ACC.
- Roll indicators: SPD Min = 2; ACC = ★ (wildcard).
- Required substats: Auto (2).
- Evaluate From: 0–3. Strategy: Potential.
- Effect: Early levels keep items that can still reach SPD(2) by +16 (shows progress rows where either SPD or ACC has rolled). Once two SPD rolls are possible, the strict SPD row appears and progress rows only remain if they can still catch up by 16.

## Roll Indicators & Strategies: Quick Guide

- Off: Ignores roll indicators entirely.
- Auto: Uses Strict when no substat has Min Rolls 1–5 and Min required rolls is 0; uses Potential when either at least one substat has Min Rolls 1–5 or Min required rolls > 0. Star (★) and Max do not count toward Auto.
- Strict: Shows only rows that are fully possible at a level (lower‑bound rows appear once feasible).
- Potential: Shows early progress rows (keep candidates) until the target is feasible; then includes the strict row and still‑feasible progress rows.
- Mythical (5 rolls): Mythical can reach 5 rolls in a substat by +16 (vs 4 otherwise). When your Rarity selection includes Mythical, the generator accounts for its pre‑roll appropriately.

Substat Values manager (Minimum Substat Values)
- Open it via the “Substat Values…” button next to “Required substats”.
- Set the minimum values per substat for 6★ and 5★ gear; optionally toggle and fill 4★–1★.
- These values are used to compute thresholds at each level range (0–3, 4–7, 8–11, 12–15, 16) when generating rules.
- Use “Reset to defaults” inside the dialog to restore the recommended values.

Notes
- Fixed substats: A lock symbol (🔒) next to a substat indicates it is fixed and always included in generated combinations.

## Autosave & Persistence (For Geeks)

- Most people will just open `index.html` in their browser (file://). That works, but many browsers restrict site storage in this mode:
- Autosave (configs, metasets, minima, and the “All (Explicit)” toggle) may not persist across sessions.
- Substat colors, column layout/visibility, widths, and the “Allow multi‑line rows” toggle may not persist.
- Clipboard (Copy to Clipboard) can be restricted outside a secure context; the app shows a fallback dialog when needed.
- If you serve the files over http(s) (any simple local server or static host), you get reliable autosave, color/table persistence, and native clipboard where allowed.

## Preview Table Controls

- Manage Colors: Click the palette icon (Manage Colors) above the table to customize text/background colors for substat chips. Use “Reset to defaults” in the dialog to restore recommended colors.
- Column menu: Right‑click the table header to open controls:
  - Reset columns: Restore default columns and widths.
  - Auto‑fit widths: Measure visible data and fit columns to the viewport.
  - Allow multi‑line rows: Toggle wrapping for the Substats column and others.
  - Show/Hide columns: Per‑column visibility checkboxes.
- Reorder columns: Drag a header left/right.
- Resize columns: Drag the right edge of a header.
 - Click behavior: Clicking a table row selects the related config chip (no auto‑scroll). Clicking a config chip scrolls the table to the first matching row.
  

## Troubleshooting

- Autosave or colors don’t persist: If you opened `index.html` via file://, the browser may not persist site data. Open over http(s) (use any simple local web server or host the files on a static site) to enable reliable autosave and settings persistence.
- Restore dialog doesn’t appear: Either there is no previous autosave yet, or you’re on file:// where localStorage is not available/persistent.
- Columns keep resetting: Using private/incognito windows or clearing site data will remove saved table settings and colors.
