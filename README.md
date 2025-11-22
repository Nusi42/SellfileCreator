# RSL Helper Sellfile Creator

Build, preview, and export sell rules for RSL Helper with a simple UI.

> This is an independent, fan‑made tool. Not affiliated with Plarium, Raid: Shadow Legends, or RSL Helper. Trademarks belong to their owners.

## Features
- Build rules and save them: create configs and keep a library you can reuse.
- Sellfile Preview toggle: flip between the Rules table and the Rule Tester gear table right from the header. Counts/outcome chips adapt (Keep/Sell for rules, Matched/No Match for tester) and the filters follow whichever table you pick.
- Drag & drop or Load button: drop `.hsfc`, `.hsf`, or `.db` anywhere (overlay confirms) or click “Load RSL Helper Sellfile”. Both options behave the same — `.hsfc` replaces your builder, `.hsf` layers on the optional base sellfile, and `.db` dumps go straight into the Rule Tester queue without touching the builder.
- Metasets: name groups of gear sets (e.g., Speed + Perception) and reuse them across rules.
- One-click Export: export an HSF file (the RSL Helper Sellfile) ready for RSL Helper.
- Rule Tester preview + Gear dialog (“Gear...”): create example gear, paste items, or drag-and-drop your RSL Helper DB (usually `%APPDATA%\RslHelper\Config`) into the dialog. Then leave the dialog closed and use the preview toggle to keep those tester items visible while you compare them against your rules.
- Autosave restore dialog: when an autosave is found, pick exactly what to load — configs, metasets, Substat Target Values, Final Sell remainder, pinned note, filter panel state, and even Rule Tester gear.

## How To Use

### Configs file
- HSFC (`.hsfc`): your project file for this app. Think of it like a save file you can load/share. RSL Helper does not use HSFC directly.
- HSF (`.hsf`): the RSL Helper Sellfile. Export from this app, then load it in RSL Helper.
- Saved filename defaults to `SellfileCreatorRules_YYYYMMDD_HHMM.hsfc`.

### Configs Builder
- Fill in the Configs Builder and give your config a clear “Config Name”.
- Click “Add as new config” to save it; then click the saved config in the list below the builder to select it for editing, and click “Update selected config”.
- Load/Save: Use “Load Configs” and “Save Configs” to reuse your custom rules. These actions save everything needed to rebuild what you see in the preview into a Configs file.
- Note: Click “Add Note…” (or “Edit Note…”) to attach a note to your Configs file. The note is shown automatically after loading a Configs file that contains one. Use `<!-- configs:1,0 -->` to drop chips for specific configs (0 continues to the next one). Use `<!-- configs-re:"speed" -->` to show every config whose name matches the case-insensitive pattern.
- Autosave restore: On launch, the dialog lists every autosaved section with its own checkbox. Restore only what you need — configs (including the selected chip), metasets, Substat Target Values, Final Sell remainder, the pinned note, the filter panel (open state, chips, collapsed sections), and Rule Tester gear. Leave a box unchecked to keep your current work untouched.

### Builder layout (top → bottom)
- Action & Enable: Tell the Sellfile what should happen when an item matches the config.
  - `Keep` marks matching gear as Keep so RSL Helper ignores it.
  - `Sell` marks matching gear as Sell so RSL Helper queues it for auto-sell.
- The Enabled toggle decides whether rows from this config are active when exported. Disabled configs export as Use = false (struck through in the preview); enable "Omit disabled rules when exporting" from the export menu if you want to drop them entirely.
- Rank: Limit the rule to specific star ranks. Use `Any` when every rank should stay eligible.
- Levels: Choose the earliest and latest upgrade milestones the rule should cover. Milestones follow game levels: +0, +4, +8, +12, +16. Rows are emitted only inside this window.
- Rarity: `Auto` (recommended) picks the lowest rarity that still makes your picks possible at the selected levels.
  - No per-stat mins or global roll minimums? Auto keeps the rule broad so every rarity stays valid.
  - Asking for 1/2/3/4 starting substats? Auto guarantees the chosen rarity can spawn with that many (1→≥Uncommon, 2→≥Rare, 3→≥Epic, 4→≥Legendary).
  - Requiring specific roll counts? Auto chooses the lowest rarity that can reach that many rolls by +16, including Mythical for five rolls.
- `Auto ≥` chip (under Milestone Thresholds): raise the floor so Auto never drops below that tier and, with Late thresholds, adds bonus ≥ branches at +4/+8/+12.
    - Tap to cycle: Uncommon → Rare → Epic. For example, “Auto ≥ Rare” keeps Uncommon out of the rule.
    - The chip only turns on when Rarity is Auto and Milestone Thresholds are set to Late. Otherwise it shows a diagonal slash.
    - Example: Banner with SPD and ATK% where ATK% needs 2 rolls. Set Rarity = Auto, Milestone Thresholds = Late, Auto ≥ Epic. The builder keeps Epic rows for every milestone and adds ≥ Legendary branches at +8 and +12 so rarer gear stays eligible without relaxing the Epic timing.
  - Before +16, the builder uses whichever substat count the rarity can actually have at that milestone. At +16 it always enforces your requested count.
- Faction: Restrict accessory rules to a specific faction when you are targeting a single team. Rings, Amulets, and Banners obey this filter; armor pieces ignore it, so `Any` keeps armor safe.
- Slots: Focus the rule on certain gear pieces (Weapons, Boots, etc.) so off-slot drops do not match. Leave it empty to cover every slot.
- Sets & Metasets: Filter the rule to explicit gear sets or named Metasets so only those collections pass. Leaving it empty keeps every set eligible.
- Mainstat row: Require particular main stats.
  - Select multiple to accept any of them. Leaving it empty means any main stat passes.
  - Choosing several main stats generates one rule per main stat so each remains explicit in the export.
- Substats row: Tell the builder which substats matter.
  - Click to select (or click again to clear) a substat. Locked picks use the badge beside the label and always appear in the generated rows.
  - Use the lock badge (🔒) to require the stat. Right-click a selected substat to open quick actions for locking/unlocking and roll targets.
  - `Any` is a shortcut back to “no restrictions”. Picking specific substats automatically turns `Any` off.
  - The total substats per row is `max(required count, locked count)` capped at four, so locking a stat guarantees space for it.
- Flex toggle: When you have more optional picks than the Required count, Flex rotates those extras across permutations so every valid mix appears. Locked picks stay fixed, and the toggle disables itself when there’s nothing to rotate.
- Roll indicator: Each selected substat shows a round indicator for upgrade rolls.
  - Left-click raises expectations; Right-click lowers them.
- Starting from ★: Left switches to a green minimum (0→1→…→5) and Right switches to a red Roll Upper Limit (0→1→…→4).
- On a Roll Upper Limit, Left lowers the limit (1→0→★) while Right raises it (0→1→…→4→★).
- Green numbers show minimum rolls you insist on; red numbers enforce the upper limit above that value. Min and the Roll Upper Limit are mutually exclusive.
- Roll Targets (Base/+1…+5): Right-click a selected substat to open the Roll Targets grid. Base captures the +0 value, and each +N input tracks the value after that many extra rolls. Leave a cell blank to reuse your Substat Target Values, or click “Use global substat targets” to revert any overrides back to those values. The preview chips update immediately so you can confirm the numbers before exporting.
- Required substats: Choose how many of your selected substats must be present on the item for the rule to pass.
  - `Auto` keeps the count in sync with the number you selected (up to four).
  - Locked substats (🔒) always count toward the requirement, and warnings flag impossible combinations (for example, locking more than four stats).
- Min Required Rolls (global): Set the total number of rolls your selected or locked substats must share. `0` skips the aggregate check. Auto keeps the total aligned with your required substats when two or more are tracked, and caps it at what the current rarity can roll; single-stat configs stay at zero. Early milestones list any splits that can still hit that target by +16.
- Milestone Thresholds: Decide how per-stat minimums behave before +16 once you ask for roll minimums.
  - `Early` tracks the rolls you already have at each milestone.
  - `Late` only demands what must be present now so the +16 goal stays achievable.
  - The toggle matters only when any substat has Min > 0 or the global minimum is above 0.

### Levels & Rolls: Quick Guide
- Early thresholds: When you set per‑stat mins or an aggregate Min Required Rolls, thresholds rise until feasible and then remain fixed; once feasible, rows collapse to your Substat Target Values and stay fixed.
- Aggregate (Σ rolls): Min Required Rolls applies to the sum of rolls across your selected substats by the target level.
- Wildcards with Min Required (sum‑of‑rolls): With only starred substats (★) and Min Required > 0, Early shows just the minimal splits at each milestone (keeps lists small and stable). Late repeats the same minimal splits at the early milestones and again at +16.
- Mythical (5 rolls): Mythical can reach 5 rolls in a substat by +16 (vs 4 otherwise). When your Rarity selection includes Mythical, the generator accounts for its pre‑roll. With Rarity = Any, setting Min Required Rolls to 5 (or per‑stat mins summing to 5) is treated as Mythical‑capable and also accounts for a pre‑roll at +0.

### Substat Target Values
- Open via the “Substat Targets…” button in the top‑right of the builder — it launches the Substat Target Values dialog.
- Global: These values apply to every config, not just the one currently selected.
- The builder uses them to compute thresholds at each level range (0–3, 4–7, 8–11, 12–15, 16) and as the fallback in the Roll Targets grid.
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

### Sellfile Preview (Rules & Rule Tester)
- The preview header keeps the `Rules`/`Rule Tester` toggle, the “Gear...” button, and the “Load RSL Helper Sellfile” button together so you always know where to switch tables or open the Rule Tester dialog.
- `Rules` view (default): shows every rule that will be exported, including any optional base `.hsf` rows. The header counts stay on Keep vs Sell, the filter row keeps the Any/Only chips for Slot/Rank/Rarity/Level, and both Config buttons remain: Preview Configs controls chip visibility, while the Config Filter button is a simple On/Off toggle that hides Sellfile rows outside your selected config chips (and keeps that filter staged for when you switch modes).
- `Rule Tester` view: flips the table to the tester gear list so you can scan imported or hand-built items without reopening the dialog. Counts/outcome chips switch to Matched vs No Match (and Keep vs Sell) based on first-match results, and the filter row keeps both Config buttons side by side: Preview Configs still controls chip visibility, and the Config Filter button expands to a tri-state selector (`Off` → `First-Match` → `Any-Match`) so you can decide how tester items respond while continuing to gate Sellfile rows when you jump back. Importing a `.db` automatically switches to this view, but you can jump back to Rules whenever you want.
- The “Load RSL Helper Sellfile” button behaves exactly like drag & drop: `.hsfc` replaces the builder state, `.hsf` layers on the optional base Sellfile, and `.db` queue items into the Rule Tester preview (without touching configs). The “Clear” button detaches the optional base `.hsf`.
- Use the palette icon to open Manage Colors for substat labels.
- In Rules view the table columns still include “Idx” and “Cfg” (empty for base file rows). In Rule Tester view the same space lists slot/set, item stats, and the first matching config badge so you can see what would happen to each artifact directly inside the preview.

### Sellfile Preview Controls
- Manage Colors: Click the palette icon above the table to customize text/background colors for substat labels. Use “Reset to defaults” in the dialog to restore recommended colors.
- Filters: In Rules view you get Slot/Rank/Rarity/Level Any/Only chips plus both Config buttons — Preview Configs (default Off) hides non-matching chips, and Config Filter is an On/Off toggle that limits the Sellfile rows to your selected config chips. Swap to Rule Tester and that row adds the Keep/Sell vs Matched/No Match outcome filter while Config Filter switches to its full `Off` → `First-Match` → `Any-Match` behavior for tester gear. “Reset filters” turns Preview Configs back Off and returns the Config Filter control to `Off`.
- Column menu: Right-click the table header to open controls:
  - Reset columns: Restore default columns and widths.
  - Auto-fit widths: Fit columns to the viewport.
  - Allow multi‑line rows: Toggle wrapping for Substats and others.
  - Show/Hide columns: Per‑column visibility checkboxes.
- Reorder columns: Drag a header left/right.
- Resize columns: Drag the right edge of a header.
- Click behavior: Clicking a table row selects the related saved config (no auto-scroll). Clicking a saved config scrolls the table to the first matching row.

### Rule Tester preview
- Click “Gear...” in the Sellfile Preview header to open the Rule Tester dialog. Create example gear or paste items (JSON/text). Items sync to the preview immediately, so closing the dialog does not clear your tester grid.
- Import your RSL Helper gear database by dropping `.db` files onto the app or by using the “Load RSL Helper Sellfile” button (same behavior). Those imports queue thousands of artifacts plus inbox items, switch the preview to the tester table, and keep the builder/export state untouched.
- Each tester item card shows slot, set, level, main stat, substats (with glyphs and rolls), the source (inventory vs inbox), and chips for Keep/Sell + the first matching config/rule. Disabled rules never match, so “No match” cards represent gear the Sellfile would leave alone.
- The header counts update to show Matched vs No Match totals plus Keep/Sell breakdowns. Combine these totals with the tester filters (Keep/Sell outcome + Matched/No Match + Config `First-Match`/`Any-Match`) to focus on edge cases before exporting.
- Use the preview toggle to move between Rules and Rule Tester tables without reopening the dialog—great for comparing the generated rule rows against the gear that triggered them.

### Export
- Click “Export merged RSL Helper Sellfile” (or “Export RSL Helper Sellfile” when no base file is loaded).
- Use “Save Configs” and “Load Configs” in Add Rules to keep and reuse your work.
- Exported filename defaults to `Sellfile_YYYYMMDD_HHMM.hsf`.

## Examples

Examples below assume 6★ Substat Target Values (per roll unit): SPD=5, CR%=5, CDMG%=5.

Early vs Late
- Early: thresholds reflect rolls gained so far. For wildcard + Min Required, shows only minimal splits at each milestone (stable list). Otherwise, before feasibility, enumerates selected‑only progress and then collapses to your per‑stat targets (unless a global Σ minimum requires more).
- Late: requires only what must be present now so the +16 target remains achievable. For wildcard + Min Required, it lists the same minimal splits at the early milestones and repeats them at +16. For per‑stat targets, it emits the minimal lower bounds per level.

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
- +8: two‑roll splits across the three (upper limits respected)
- +12/+16: [15,10,5]

Example: Late (3 substats) — SPD min=2, CR% min=1, CDMG% any, Required=3
- +0/+4: [5,5,5]
- +8: [10,5,5] or [5,10,5]
- +12: [15,5,5] or [10,10,5]
- +16: [15,10,5]

Tip: Use Roll Upper Limits to forbid rolls on a stat. From ★, Right‑click to enter the Roll Upper Limit and set it to 0. For example, set the CDMG% Roll Upper Limit = 0 to keep it at base while SPD/CR get the rolls.

Example: Lock one, require two
- Select Substats: SPD, HP, ATK. Click SPD, then tap the lock badge (🔒) to require it.
- Set Required substats = 2.
- Effect: Rules include SPD+HP and SPD+ATK. They do not include HP+ATK without SPD (locked substats are always included).

Example: Focus rolls on 3 stats, forbid rolls on the 4th
- Goal: Keep items that have SPD, CR%, CDMG% and one of HP%/ATK%/DEF%, but do not allow rolls on that 4th substat.
- Select Substats: SPD, CR%, CDMG%, HP%, ATK%, DEF%.
- Required substats = 4.
- Roll indicators:
  - From ★, Left‑click (Min Rolls): set SPD, CR%, CDMG% to your desired mins (for example 1 each).
  - From ★, Right‑click (Roll Upper Limit): set HP%, ATK%, DEF% to Roll Upper Limit = 0.
- Effect: The fourth substat is always one of HP%/ATK%/DEF%, and whichever it is, it gets zero rolls. SPD/CR%/CDMG% receive the rolls.

Example: Early with a wildcard (selected-only)
- Select Substats: SPD and ACC.
- Roll indicators: SPD Min = 2; ACC = ★ (wildcard).
- Required substats: Auto (2).
- Levels: Min +0, Max +16.
- Effect: Early milestones show items that can still reach SPD(2) by +16 (shows early rows where either SPD or ACC has rolled). Once two SPD rolls are possible, the SPD minimum row appears.

Example: Sum‑of‑rolls with wildcards (2 substats)
- Select Substats: SPD and ACC. Set both to ★ (wildcard).
- Required substats: 2. Min Required Rolls: 1.
- Early:
  - +4/+8/+12/+16: two rows — SPD ≥ 10, ACC ≥ 9 and SPD ≥ 5, ACC ≥ 18 (minimal splits; stable across milestones).
- Late:
  - +0/+4/+8/+12: baseline rows only (nothing extra required yet); +16: the two rows above. For higher Min required values, Late enforces the minimal selected‑sum needed now at the appropriate milestones (e.g., with Min required = 2, +12 shows the single‑roll splits; +16 shows the two‑roll splits).

## Notes for contributors

- Translations: Release zips include localization templates under `i18n/` (e.g., `i18n/en-US.l10n.json`).
- Edit & test: Open the app and drag your edited `*.l10n.json` onto it to apply immediately for the current session (no install needed or possible).
- Submit fixes: Send the updated JSON via Discord message. Keep keys unchanged; missing keys fall back to English.
- Built-in languages: All shipped languages are compiled into the single HTML so the app works fully offline. Your fixes will be integrated into the next release.
- Watch the RSL Helper DB: run `scripts/run-sample-server.ps1 -WatchGearDb` (or pass `-GearDbPath <file>`) to monitor `%APPDATA%\RslHelper\Config`. Each `.db` update is pushed straight into the Rule Tester instance launched by the script, and it will prompt you when multiple databases exist.
- Double-click helper: `Stream-Helper-DB-to-Creator.bat` launches the sample server under PowerShell with `-WatchGearDb -GearDbPath "%APPDATA%\RslHelper\Config"` so you can stream the default RSL Helper database without touching the console; append extra flags after the `.bat` name for custom runs.

## Acknowledgements

Many thanks to **[STBL] Nasgor** for his invaluable contributions,  
to **[SP] Panda** for his sellfiles,  
to **[IPЯ] KruYseN** for his gear cleanse videos,  
and of course thanks to **Farbstoff** for RSL Helper!

## Author
Made by [STBL] Nusi㊷  
Localization by [STBL] Nusi㊷

© Nusi㊷ - 2025
