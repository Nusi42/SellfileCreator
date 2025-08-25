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
- Rank, Rarity, Evaluate From, Roll Strategy.
  - Faction: Optional, applies to accessories (Ring, Amulet, Banner) only.
  - About these three controls (work together):
    - Count Rolls: From (count rolls after “Evaluate From”) or All (include prior rolls to each level). Example (6★ SPD, Evaluate From 8–11): From → 5/10/15; All → 15/20/25.
    - Evaluate From: First level range to start evaluating thresholds (0–3, 4–7, 8–11, 12–15, 16).
    - Roll Strategy: Off (start only), Strict (4–7/8–11/12–15/16), or Potential (strict + early relaxed keeps). Potential keeps promising items earlier when they can still reach targets by 16.
  - Rank labels use stars: 1★..6★. Ranges use the symbols ≥ and ≤ (for example: ≥ 5★, ≤ 6★).
  - Rarity range labels also use unicode: ≥ Rare, ≤ Epic, etc.
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
    - Click to cycle: ★ → 0 → 1 → … → 5 → ★.
    - 0: At least 0 rolls (no minimum). Uses the base value for that substat at the current level.
    - 1–5: At least N rolls. When that many rolls are possible at a level, the target is N× the base value. Before that, we allow in‑between steps.
    - ★: Wildcard — try all roll options at each level (within your other choices).
    - Off ignores all badges. Baseline note: “Count Rolls” affects how many rolls are counted at each level — From counts after “Evaluate From”; All includes prior rolls up to each level.
- Required substats — to the right of Substats. Sets how many of your selected substats must be present (fixed ones are always included). A single warning area shows if Required > chosen, or if Fixed > 4.
  - Required substats buttons: Auto, 1, 2, 3, 4. “Auto” sets Required to min(4, selected) and keeps it synced as you add/remove substats. Selecting a number disables Auto. Clearing Substats sets Required to 0.
  - Substat Values…: Open the manager for minimum substat values used when generating thresholds at each gear level.
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
- The “Reset to defaults” button resets Rank, Rarity, Mainstat, Evaluate From, Count Rolls, Roll Strategy, Required substats, Substats (including fixed and rolls), and clears Slot/Set filters.

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
- These values are used to compute thresholds at each level range (0–3, 4–7, 8–11, 12–15, 16) when generating rules.
- Use “Reset to defaults” inside the dialog to restore the recommended values.

Notation (Stars & Symbols)
- Star symbol vs word: 5★ is the same as “5‑Star”. This app uses the star (★) symbol throughout for brevity.
 - Range symbols: We use the symbols “≥” and “≤” instead of ">=" and "<=" for rank and rarity ranges.
- Fixed substats: A lock symbol (🔒) next to a substat indicates it is fixed and always included in generated combinations.

Examples
- Fixed + required
- Select Substats: SPD, HP, ATK. Click the lock on SPD to fix it.
- Set Required substats = 2.
 - Created rule versions include SPD+HP and SPD+ATK. They do not include HP+ATK without SPD, because fixed substats are always included.

- Potential SPD/ACC (with OR)
  - Select Substats: SPD, ACC, HP%, CR%.
  - Set Required = 3 (this allows HP% or CR%).
  - Set rolls: SPD ≥2, ACC ≥1, HP% = 0 (no constraint), CR% = 0 (no constraint).
  - Evaluate From: 8–11. Count Rolls: From. Roll Strategy: Potential.
  - Effect: Early levels keep items that can still reach the targets (some substats may be missing until additions occur). At 16, strict targets apply.

Roll badges and strategies
- Off: Ignores badges.
- Strict: Uses only rules that are fully possible at a level. If a badge says “at least N rolls”, it applies only once that many rolls are possible at that level.
- Potential: Lets items pass earlier if they can still reach the target later. If a badge says “at least N rolls”, you’ll see earlier steps until the full target is possible.

When these controls give the same result
- No badges set (all 0, no ★): Strict and Potential show the same rows. “Count Rolls” usually doesn’t change anything here.
- Start at/after the first “feasible” level: If your first checked level (Evaluate From) is the point where your badge target is already possible, Strict and Potential look the same from there on. Changing “Count Rolls” won’t change rows that are already possible.
- Potential after feasibility: Once a badge target is possible at a level, Potential keeps the same lower‑bound as Strict for later levels.

When they differ
- Using ★ (star badge): “Count Rolls” changes how many rolls are counted at each level, so the early rows can differ between “From” and “All”.
- Early levels with numbered badges: “Count Rolls” changes when a level becomes possible. Strict shows the first level where it’s possible; Potential shows earlier steps until then.
- Off vs others: Off ignores badges entirely. If you use any numbered badge or ★, Off will not apply them.

Example: SPD (2) with ACC (★)
- Setup
  - Select Substats: SPD and ACC.
  - Badges: set SPD to 2 (at least 2 rolls), set ACC to ★ (try all roll options).
  - Required substats: Auto (2).
  - Evaluate From: 0–3.
  - Strategy: Potential.

- What you will see (typical 6★ Epic, Count Rolls = All):
  - 0–3: SPD ≥ 5 and ACC ≥ 9 (base values).
  - 4–7: two rows that reflect “either SPD or ACC rolled once so far”:
    - SPD ≥ 5 and ACC ≥ 18
    - SPD ≥ 10 and ACC ≥ 9
  - 8–11 and later: once two SPD rolls are possible, the rule locks to “at least 2 SPD rolls” and keeps that from here on:
    - SPD ≥ 15 and ACC ≥ 9

- Why the “ACC ≥ 18” row disappears after 4–7:
  - Before two SPD rolls are possible, Potential shows early rows so you can keep good candidates while leveling.
  - Once two SPD rolls are possible, the “at least 2 SPD rolls” target applies. From that point, SPD must be high enough (for 6★, SPD ≥ 15). ACC can still be higher (for example ACC ≥ 18), and that still matches the later row because ACC ≥ 18 also satisfies ACC ≥ 9.

- Tip: If you want to keep the early, more flexible behavior for longer, reduce the SPD badge (for example SPD = 1). If you want to be strict as soon as possible, use the Strict strategy instead of Potential.

Same setup with Strict
- Strategy: Strict (everything else the same as above).
- What you will see (6★ Epic, Count Rolls = All):
  - 0–3: no row yet for this rule (not enough rolls to meet SPD = 2).
  - 4–7: still no row (only one roll is possible by 4–7; SPD = 2 is not yet possible).
  - 8–11 and later: SPD ≥ 15 and ACC ≥ 9. From here on, Strict keeps requiring “at least 2 SPD rolls” at every later level.
- Why: Strict only shows rows that are fully possible at that level. It does not show the early “either SPD or ACC rolled once” rows you see with Potential.

Need technical details (building from source, formats, code structure)? See docs/TECHNICAL.md.

## Autosave & Persistence

- Autosave: Your session (configs, metasets, minima, and the “All (Explicit)” toggle) is autosaved to the browser’s local storage. On load, the app offers to restore the last autosave.
- Safe restore: If you dismiss restore, autosave waits until you make a change to avoid overwriting the previous draft.
- Substat colors and table settings: Custom “Substat Chip Colors”, column layout/visibility, widths, and the “Allow multi‑line rows” toggle are also saved in local storage.
- Important when opening from file://: If you open `index.html` directly from your filesystem (file://), many browsers restrict or do not persist site data. In that case, autosave, color preferences, and table settings may not be saved across sessions. For reliable saving, serve the app over http(s):
  - Development: `npm run dev`
  - Preview built files: `npm run preview` (serves `dist`)
  - Or host the `dist` folder on any static server (GitHub Pages, Netlify, etc.)

## Merged Preview Table Controls

- Manage Colors: Click “Manage Colors…” above the table to customize text/background colors for substat chips. Use “Reset to defaults” in the dialog to restore recommended colors.
- Column menu: Right‑click the table header to open controls:
  - Reset columns: Restore default columns and widths.
  - Auto‑fit widths: Measure visible data and fit columns to the viewport.
  - Allow multi‑line rows: Toggle wrapping for the Substats column and others.
  - Show/Hide columns: Per‑column visibility checkboxes.
- Reorder columns: Drag a header left/right.
- Resize columns: Drag the right edge of a header.
- Large lists: The table virtualizes rows automatically for speed when there are many rules. A small indicator shows “Showing X–Y of Z” while virtualization is active.

## Troubleshooting

- Autosave or colors don’t persist: If you opened `index.html` via file://, the browser may not persist site data. Serve over http(s) using `npm run dev`, `npm run preview`, or any static host.
- Restore dialog doesn’t appear: Either there is no previous autosave yet, or you’re on file:// where localStorage is not available/persistent.
- Columns keep resetting: Using private/incognito windows or clearing site data will remove saved table settings and colors.
