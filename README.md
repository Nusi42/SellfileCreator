# RSL Helper Sellfile Creator

Build, preview, and export sell rules for RSL Helper with a simple UI.

> This is an independent, fan‑made tool. Not affiliated with Plarium, Raid: Shadow Legends, or RSL Helper. Trademarks belong to their owners.

## Features
- Add Configs and Rules: Build rules and manage/save your custom set.
- Sellfile Preview: See your generated rules, optionally combined with an existing file.
- Base file (optional): Load an existing HSF file (the RSL Helper Sellfile) inside the Sellfile Preview. You can drag & drop `.hsf` files or a Configs file (`.hsfr`) anywhere onto the app; an overlay confirms accepted files.
- Metasets: Name groups of gear sets and reuse them across rules.
- One‑click Export: Export an HSF file (the RSL Helper Sellfile).

## How To Use

### Configs file
- HSFR (`.hsfr`): Your project file for this app — use it to load, save, and share your setup. RSL Helper does not use HSFR directly.
- HSF (`.hsf`): The RSL Helper sell file — export from this app as an HSF Sellfile, then load it in RSL Helper.
- Saved filename defaults to `SellfileCreatorRules_YYYYMMDD_HHMM.hsfr`.

### Add Configs and Rules (Builder)
- Fill in the builder and give your config a clear “Config Name”.
- Click “Add as new config” to save it; then click the saved config in the list below the builder to select it for editing, and click “Update selected config”.
- Load/Save: Use “Load Configs” and “Save Configs” to reuse your custom rules. These actions save everything needed to rebuild what you see in the preview into a Configs file.
- Note: Click “Add Note” (or “Edit Note”) to attach a note to your Configs file. The note is shown automatically after loading a Configs file that contains one.

### Builder layout (top → bottom)
- Action: Keep or Sell, and Enabled.
  - Enabled controls whether rules from this config are active. When off, the rules are still exported but not used by RSL Helper. Disabled rows show with a white strikethrough in the Sellfile Preview, and the saved config label shows only the Keep/Sell text struck through.
- Rank, Rarity, Evaluate From, Roll Strategy.
  - Faction (optional) applies to accessories (Ring, Amulet, Banner) only.
  - Count Rolls: “From” counts only rolls after “Evaluate From”. “All” counts all rolls up to each level.
  - Evaluate From: Where checking starts (0–3, 4–7, 8–11, 12–15, 16). “Any” ignores rolls and sets Roll Strategy to Off.
  - Roll Strategy: Off (ignore roll indicators), Auto (Strict unless you set any roll minimums), Strict (must already meet roll minimum at each level), Potential (also allows items that can still reach it by +16). The ★ star does not count for Auto.
- Mainstat and Substats — same 3 rows of toggle buttons:
  1) Any
  2) HP, HP%, ATK, ATK%, DEF, DEF%
  3) SPD, RES, ACC, CR%, CDMG%
  - Mainstat allows multi‑select. None selected = Any. If you choose multiple, one rule is generated per main stat.
  - “Any” is a quick reset. In Substats, selecting Any is the same as choosing none; picking specific substats turns Any off.
  - Substats support 3 states: click to select; click again to lock (🔒 fixed); click again to clear. Fixed substats are always included when rules are created. The total substats targeted in a rule is max(Required, Fixed), capped at 4.
  - Rolls per substat: a small round roll indicator appears on each selected substat.
    - Click = Min Rolls (green): ★ → 1 → 2 → 3 → 4 → 5 → ★ (Min and Max are exclusive).
    - Shift+click = Max Rolls (red): ★ → 0 → 1 → 2 → 3 → 4 → ★. Max = 0 forbids rolls on that substat.
- Required substats — to the right of Substats. How many of your picked substats the item must have (locked ones always count). One warning area shows if Required > chosen, or if Fixed > 4.
  - Buttons: Auto, 1, 2, 3, 4. “Auto” sets Required to min(4, selected) and keeps it synced as you add/remove substats. Selecting a number disables Auto. Clearing Substats sets Required to 0.
  - Min required rolls: Auto, 1–5. When enabled, sets a minimum sum of rolls across your selected substats (e.g., 3 = at least three rolls in total). In Potential mode, early rows are shown only if this can still be met by +16. In Roll Strategy = Auto, setting this > 0 switches Auto to Potential.

### Roll Indicators & Strategies: Quick Guide
- Off: Ignores roll indicators entirely.
- Auto: Uses Strict when no substat has Min Rolls 1–5 and Min required rolls is 0; uses Potential when either at least one substat has Min Rolls 1–5 or Min required rolls > 0. Star (★) and Max do not count toward Auto.
- Strict: Shows only rows that are fully possible at a level (lower‑bound rows appear once feasible).
- Potential: Shows early progress rows (keep candidates) until the target is feasible; then includes the strict row and still‑feasible progress rows.
- Mythical (5 rolls): Mythical can reach 5 rolls in a substat by +16 (vs 4 otherwise). When your Rarity selection includes Mythical, the generator accounts for its pre‑roll appropriately.

### Substat Values (Minima)
- Open via the “Substat Values…” button next to “Required substats”.
- Global: These values apply to all configs, not just the one currently selected.
- Set the minimum values per substat for 6★ and 5★ gear; optionally toggle and fill 4★–1★.
- These values are used to compute thresholds at each level range (0–3, 4–7, 8–11, 12–15, 16) when generating rules.
- Use “Reset to defaults” inside the dialog to restore the recommended values.

### Metasets
- Click “Manage metasets…” in the Sets row to open the dialog.
- Add or rename metasets and choose which sets each one contains. The dialog uses the same search and view modes as the Sets picker.
- Starter metasets are included so you can begin right away. You can edit or remove them at any time.
- “Reset to defaults” (in the dialog) offers safe options when metasets are in use:
  - Delete and remove references, or
  - Replace each use with that metaset’s explicit sets, or
  - Replace references with another metaset.

### Final Sell
- Toggle near Export to add final Sell rules for items not matched by your Keep rules. Final Sell is on by default.
- Configure which gear (Artifacts and/or Accessories) and which level ranges (0–3, 4–7, 8–11, 12–15, 16). The default targets 0–15 to avoid selling fully leveled gear.
- Without Final Sell, items that do not match any rule are automatically kept by RSL Helper. Selling only happens when a Sell rule matches.
- When Final Sell is on, the generated Sell rules explicitly include all currently known sets. In the preview, the Sets column shows “All Currently Known” for these rules to reduce clutter; the exported file still lists every set explicitly.

### Managing Configs
- Saved configs list: Each saved config appears as a small label below the builder. Use this list to select (left‑click), duplicate, reorder, or delete (deletions are confirmed). “Delete Configs” removes all (with confirmation).
- Hover linking: Hovering a saved config highlights all rows from that config in the Sellfile Preview. Hovering a row in the Sellfile Preview highlights the corresponding saved config in the list.
- Click linking: Clicking a row in the Sellfile Preview selects its saved config (and loads it into the builder). Rows originating from the base `.hsf` do not change the current selection.
- Right‑click menus: On a saved config (Duplicate/Move/Copy/Delete) and on the saved configs area (Copy All, Paste).
- Clipboard fallback: If clipboard access is blocked, a dialog opens with the content pre‑selected — press Ctrl/Cmd+C to copy, or paste into the Paste dialog.

### Sellfile Preview (and Optional Base File)
- In the Sellfile Preview panel, you can optionally combine your rules with an existing file:
  - Click “Load RSL Helper Sellfile” (or drag & drop) to include an existing `.hsf`.
  - Click “Clear” to remove the loaded file.
- Use the palette icon to open Manage Colors for substat labels.
- The table shows all rules to be exported. Columns include an “Idx” and a “Cfg” column. “Cfg” shows which saved config created the row. It’s empty for base file rules.

### Sellfile Preview Controls
- Manage Colors: Click the palette icon above the table to customize text/background colors for substat labels. Use “Reset to defaults” in the dialog to restore recommended colors.
- Column menu: Right‑click the table header to open controls:
  - Reset columns: Restore default columns and widths.
  - Auto‑fit widths: Fit columns to the viewport.
  - Allow multi‑line rows: Toggle wrapping for Substats and others.
  - Show/Hide columns: Per‑column visibility checkboxes.
- Reorder columns: Drag a header left/right.
- Resize columns: Drag the right edge of a header.
- Click behavior: Clicking a table row selects the related saved config (no auto‑scroll). Clicking a saved config scrolls the table to the first matching row.

### Export
- Click “Export merged RSL Helper Sellfile” (or “Export RSL Helper Sellfile” when no base file is loaded).
- Use “Save Configs” and “Load Configs” in Add Rules to keep and reuse your work.
- Exported filename defaults to `Sellfile_YYYYMMDD_HHMM.hsf`.

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

## Persistence & Troubleshooting
- For experts: This section covers browser storage and clipboard behavior.
- Opening `index.html` directly (file://) often restricts site storage:
  - Autosave (configs, metasets, minima) and table/color settings may not persist.
  - Clipboard “Copy to Clipboard” can be blocked; the app shows a fallback dialog.
- For reliable autosave and settings, serve over http(s) (e.g., Vite dev server or any simple static host).
- Restore dialog doesn’t appear: Either there is no previous autosave yet, or you’re on file:// where localStorage is not available/persistent.
- Columns keep resetting: Private/incognito windows or clearing site data will remove saved table settings and colors.

## Acknowledgements

Many thanks to [STBL] Nasgor for his invaluable contributions,  
and of course thanks to Farbstoff for RSL Helper!

## Author
Made by [STBL] Nusi㊷
