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
- Action: Keep or Sell, and Enabled.
  - Enabled: toggles whether rules from this config are active. When off, the rules are still exported but ignored by RSL Helper. Disabled rows show with a white strikethrough in the preview table, and the config chip strikes through only the Keep/Sell text.
- Rank, Rarity, Evaluate From, Roll Strategy.
  - Faction: Optional, applies to accessories (Ring, Amulet, Banner) only.
  - About these three controls (work together):
    - Count Rolls: From (count rolls after “Evaluate From”) or All (include prior rolls to each level). Example (6★ SPD, Evaluate From 8–11): From → 5/10/15; All → 15/20/25.
    - Evaluate From: First level range to start evaluating thresholds (0–3, 4–7, 8–11, 12–15, 16) or Any (selecting Any switches Roll Strategy to Off).
    - Roll Strategy: Off (single check; Evaluate From may be Any), Auto (Strict when no substat has Min Rolls 1–5; Potential when at least one substat has Min Rolls 1–5), Strict (4–7/8–11/12–15/16), or Potential (strict + early relaxed keeps). The ★ star does not count for Auto.
- Mainstat and Substats — on one row.
  - Both use 3 rows of toggle buttons in the same order:
    1) Any (wider)
    2) HP, HP%, ATK, ATK%, DEF, DEF%
    3) SPD, RES, ACC, CR%, CDMG%
  - Mainstat: multi-select is allowed. Selecting none equals Any. When exporting `.hsf`, if you pick more than one main stat we create one rule per main stat.
  - “Any” is a quick reset. In Substats, selecting Any is the same as choosing none; picking specific substats turns Any off.
  - Substats support 3 states: click to select; click again to lock (🔒); click again to clear.
  - Fixed substats are always included when rules are created. The total substats targeted in a rule is max(Required, Fixed), capped at 4.
  - Rolls per substat: A small badge appears on the right of each selected substat.
    - Click = Min Rolls (green): ★ → 1 → 2 → 3 → 4 → 5 → ★ (Min and Max are exclusive).
    - Shift+click = Max Rolls (red): ★ → 0 → 1 → 2 → 3 → 4 → 5 → ★. Max=0 forbids rolls on that substat.
    - ★ (star): consider all roll possibilities for that substat without enforcing a numeric minimum.
    - “Count Rolls” affects how many rolls are counted at each level — From counts after “Evaluate From”; All includes prior rolls up to each level.
- Required substats — to the right of Substats. Sets how many of your selected substats must be present (fixed ones are always included). A single warning area shows if Required > chosen, or if Fixed > 4.
  - Required substats buttons: Auto, 1, 2, 3, 4. “Auto” sets Required to min(4, selected) and keeps it synced as you add/remove substats. Selecting a number disables Auto. Clearing Substats sets Required to 0.
  - Substat Values…: Open the manager for minimum substat values used when generating thresholds at each gear level.
  - Note on Rank “Any”: When Rank is set to Any, substat thresholds use the 6★ baseline (conservative). If you want 5★ baselines, choose Rank ≤ 5★ or an exact rank.
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
- Defaults included (editable): Full Speed (2‑piece 10%+), Need 4 Speed, Nuker — Tier 3/2/1/0, Support (ACC), Support (RES), Support Tank — Tier 1/2, Self Heals, Cooldown / Extra Turns, Counterattack, Immunity Buff, Debuff Set Bonuses — Tier 1/2, Outdated, Accessoires — Special.

“All (Explicit)” metaset
- Enable the “All (Explicit)” toggle in the builder to add a metaset at the top of the Sets list.
  - Selecting it matches all currently known gear sets by explicitly listing them (different from “Any”, which lists none). Helpful when exporting `.hsf` so new sets won’t implicitly match old rules.
  - The metaset shows a “(N set(s))” count and does not list every set name under it.
  - If you save `.hsfr` while using “All (Explicit)”, enable the toggle after loading to keep using it.

3) Manage Your Rules
- Config Chips: In the Add Configs and Rules section, each saved rule appears as a chip. Use chips to select (left‑click), duplicate, reorder, or delete (deletions are confirmed). “Delete Configs” removes all (also confirmed).
  - Hover linking: Hovering a Config Chip highlights all rows from that config in the Merged Preview. Hovering a row in the Merged Preview highlights the corresponding Config Chip.
  - Click linking: Clicking a row in the Merged Preview selects its Config Chip (and loads it into the builder). Rows originating from the base `.hsf` do not change chip selection.
  - Chip context menu (right‑click a chip): Duplicate, Move to Top, Move Up, Move Down, Move to Bottom, Copy to Clipboard, Delete.
  - Chip area context menu (right‑click the chip area): Copy All (.hsfr), Paste. When there are no configs yet, the area still shows a hint and accepts right‑click Paste.
  - Clipboard fallback: If clipboard access is blocked (non‑secure context like `http://172.x.x.x:5173`), a dialog opens with the JSON pre‑selected — press Ctrl/Cmd+C to copy, or paste JSON into the Paste dialog.
  - Copy All (.hsfr) copies a full HSFR object: `{ Version, Metasets, Minima, Configs, IncludeAllExplicitMeta }`. Paste accepts a single config, an array of configs, or a full HSFR object.

Reset defaults
- The “Reset to defaults” button resets Rank, Rarity, Mainstat, Evaluate From, Count Rolls, Roll Strategy, Required substats, Substats (including fixed and rolls), and clears Slot/Set filters.

Defaults
- Rarity: Any.
- Roll Strategy: Auto.
- Required substats: Auto (effectively 0 until substats are chosen).

4) Preview & Download
- Check the Merged Preview table and click “Download merged .hsf”.
  - Columns include an “Idx” and a “Cfg” column. “Cfg” shows which Config Chip (1‑based) created the row. It’s empty for base `.hsf` rules.
- Use “Save .hsfr” and “Load .hsfr” in Add Rules to keep and reuse your work (your rules, metasets, and minima are included).
  - You can also save and reload from the Add Configs and Rules section; your rules, metasets, and minima are included.
  - Downloaded filename defaults to `Sellfile_YYYYMMDD_HHMM.hsf`.

Save/Load guarantees
- HSFR save includes: `Version`, `Metasets`, `Minima`, `Configs`, and `IncludeAllExplicitMeta`.
- Each Config also includes `enabled` (defaults to true). Older `.hsfr` files that do not have `enabled` load as enabled — behavior is unchanged.
- On load, legacy shapes are normalized without losing meaning, and per‑substat roll wildcards (`any: true`) and numeric roll bounds are preserved.
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
- Badges:
  - Click (Min Rolls): set SPD, CR%, CDMG% to your desired mins (for example 1 each).
  - Shift+click (Max Rolls): set HP%, ATK%, DEF% to Max = 0.
- Effect: The fourth substat is always one of HP%/ATK%/DEF%, and whichever it is, it gets zero rolls. SPD/CR%/CDMG% receive the rolls.

Example: Potential early keeps with a wildcard
- Select Substats: SPD and ACC.
- Badges: SPD Min = 2; ACC = ★ (wildcard).
- Required substats: Auto (2).
- Evaluate From: 0–3. Strategy: Potential.
- Effect: Early levels keep items that can still reach SPD(2) by +16 (shows progress rows where either SPD or ACC has rolled). Once two SPD rolls are possible, the strict SPD row appears and progress rows only remain if they can still catch up by 16.

## Badges & Strategies: Quick Guide

- Off: Ignores badges entirely.
- Auto: Uses Strict when no substat has Min Rolls 1–5; uses Potential when at least one substat has Min Rolls 1–5. Star (★) and Max do not count toward Auto.
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

## Merged Preview Table Controls

- Manage Colors: Click “Manage Colors…” above the table to customize text/background colors for substat chips. Use “Reset to defaults” in the dialog to restore recommended colors.
- Column menu: Right‑click the table header to open controls:
  - Reset columns: Restore default columns and widths.
  - Auto‑fit widths: Measure visible data and fit columns to the viewport.
  - Allow multi‑line rows: Toggle wrapping for the Substats column and others.
  - Show/Hide columns: Per‑column visibility checkboxes.
- Reorder columns: Drag a header left/right.
- Resize columns: Drag the right edge of a header.
  

## Troubleshooting

- Autosave or colors don’t persist: If you opened `index.html` via file://, the browser may not persist site data. Open over http(s) (use any simple local web server or host the files on a static site) to enable reliable autosave and settings persistence.
- Restore dialog doesn’t appear: Either there is no previous autosave yet, or you’re on file:// where localStorage is not available/persistent.
- Columns keep resetting: Using private/incognito windows or clearing site data will remove saved table settings and colors.
