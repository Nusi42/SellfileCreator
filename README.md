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
- Rank, Rarity, Faction, Levels.
  - Faction (optional) applies to accessories (Ring, Amulet, Banner) only.
  - Levels: Pick Min Level and Max Level from +0, +4, +8, +12, +16. Rules are emitted for milestones in this window.
  - Presence before +16: If your rarity can’t yet have the requested number of substats, rules use the number that can exist at that milestone. At +16, rules use your requested count. “Any” rarity treats presence like ≥ Legendary (no additions).
  - Milestone Thresholds: When you set Min rolls (per‑stat or global), choose how early rows behave: Early (thresholds reflect rolls gained so far) or Late (require only what must be present now so +16 is still achievable).
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
- Min required rolls: Auto, 1–5. When enabled, sets a minimum sum of rolls across your selected substats (e.g., 3 = at least three rolls in total). With wildcards (★ on all selected), Early keeps early lists concise and stable; Late defers strict enforcement to +16.

### Levels & Rolls: Quick Guide
- Early thresholds: When you set per‑stat mins or an aggregate Min required rolls, thresholds rise until feasible and then remain fixed; once feasible, rows collapse to your minima and stay fixed.
- Aggregate (Σ rolls): Min required rolls applies to the sum of rolls across your selected substats by the target level.
- Wildcards with Min Required (sum‑of‑rolls): With only starred substats (★) and Min Required > 0, Early shows just the minimal splits at each milestone (keeps lists small and stable). Late shows presence at early levels and applies the same minimal splits at +16.
- Mythical (5 rolls): Mythical can reach 5 rolls in a substat by +16 (vs 4 otherwise). When your Rarity selection includes Mythical, the generator accounts for its pre‑roll. With Rarity = Any, setting Min required rolls to 5 (or per‑stat mins summing to 5) is treated as Mythical‑capable and also accounts for a pre‑roll at +0.

### Substat Values (Minima)
- Open via the “Substat Values…” button aligned with the level controls (top‑right of the builder).
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

Examples below assume 6★ substat minima (per roll unit): SPD=5, CR%=5, CDMG%=5.

Early vs Late
- Early: thresholds reflect rolls gained so far. For wildcard + Min Required, shows only minimal splits at each milestone (stable list). Otherwise, before feasibility, enumerates selected‑only progress and then collapses to per‑stat minimums (unless a global Σ minimum requires more).
- Late: requires only what must be present now so the +16 target remains achievable. For wildcard + Min Required, shows presence at early levels and applies the same minimal splits at +16. For per‑stat mins, emits minimal lower‑bounds per level.

Example: Early (2 substats) — SPD min=2, CR% min=1 (levels 0..16)
- +0: SPD ≥ 5, CR ≥ 5
- +4: [10,5] and [5,10]
- +8: [15,5], [10,10], [5,15]
- +12/+16: [15,10]

Example: Late (2 substats) — SPD min=2, CR% min=1 (levels 0..16)
- +0/+4: [5,5]
- +8: [10,5] or [5,10]
- +12: [15,5] or [10,10]
- +16: [15,10]

Example: Early (3 substats) — SPD min=2, CR% min=1, CDMG% any, Required=3
- +0: [SPD,CR,CDMG] ≥ [5,5,5]
- +4: one‑roll splits: [10,5,5], [5,10,5], [5,5,10]
- +8: two‑roll splits across the three (caps respected)
- +12/+16: [15,10,5]

Example: Late (3 substats) — SPD min=2, CR% min=1, CDMG% any, Required=3
- +0/+4: [5,5,5]
- +8: [10,5,5] or [5,10,5]
- +12: [15,5,5] or [10,10,5]
- +16: [15,10,5]

Tip: Use caps to forbid rolls on a stat (Shift+click to cycle Max). For example, set CDMG% Max = 0 to keep it at base while SPD/CR receive rolls.

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

Example: Early with a wildcard (selected-only)
- Select Substats: SPD and ACC.
- Roll indicators: SPD Min = 2; ACC = ★ (wildcard).
- Required substats: Auto (2).
- Levels: Min +0, Max +16.
- Effect: Early milestones show items that can still reach SPD(2) by +16 (shows early rows where either SPD or ACC has rolled). Once two SPD rolls are possible, the SPD minimum row appears.

Example: Sum‑of‑rolls with wildcards (2 substats)
- Select Substats: SPD and ACC. Set both to ★ (wildcard).
- Required substats: 2. Min required rolls: 1.
- Early:
  - +4/+8/+12/+16: two rows — SPD ≥ 10, ACC ≥ 9 and SPD ≥ 5, ACC ≥ 18 (minimal splits; stable across milestones).
- Late:
  - +0/+4/+8/+12: presence‑only — SPD ≥ 5, ACC ≥ 9; +16: the two rows above.

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
