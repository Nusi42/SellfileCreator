# Rule Tester Filter Enhancements

Mark `[x]` to approve an option. Add comments beneath any section to capture requirements, blockers, or design tweaks. All controls described here render only in Rule Tester mode so the HSF (rules) filter panel stays unchanged.

---

## Option A — Source & Equipped Chips
- Placement: new chip row directly under the existing tester filter chips in the preview toolbar (visible only when the preview toggle is on `Rule Tester`).
- Controls: toggle chips for `Inventory`, `Equipped (Collection)`, `Equipped (Vault)`, `Inbox`, `Manual Tester`.
- Notes: filtering and badges both derive from the same selection so scan + filter stay in sync.

- [x] Approve

**Comments**
I presume u mean below the grid for Result / Sets.
Make it `Inventory`, `Collection`, `Vault`, `Inbox`, `Manual`.
Allow multi selection.
Having none selected shall mean `Any`.

**Open question:** when you say “below the grid for Result / Sets,” should the chip row span the full toolbar width under every tester control, or align only beneath the Result/Tester chip cluster? Knowing the exact anchor helps avoid layout conflicts.

**Answer**: 
I really do not know what you mean by "tester config control". If you mean the button which has the text "Configs", then notice that we are not filtering configs with the options we add but rather the gear. So the reference controls are different.

The goal is that after all the changes, the UI is still kind of compact and doesnt waste screen estate because we want it for the actual rule tester items.

My idea is that this thing is below the "Rule" and "Sets" group which I beleive are currently 2 grid cells.
I think we can add this as a 3x2 toggle group below "Rule" in a new drawer.

**Still open:** how is the new drawer exposed? Should we add another button beside `Reset filters` (similar to the substats drawer trigger), reuse the existing substats drawer, or embed this drawer directly under the Rule section without a toggle? Details on the trigger/layout will help keep the implementation consistent with your expectations.

**Answer**: 
I think we either have a misunderstanding what a drawer is, or u do not know how the UI is built.
I want the similar kind of group of controls and labels I see as we currently have for "Result", "Sets", "Mainstat", "Substats", "Level", "Faction", "Slots", "Rank", "Rarity".
I want this kind of group below the group named "Result".
---

## Option B — Reroll Quick Toggle
- Placement: chip trio (`Any`, `Not rerolled`, `Rerolled`) inside the Mainstat section, directly below the main-stat toggle buttons.
- Notes: keeps chaos-ore decisions alongside the stat chips users are already editing.

- [x] Approve

**Comments**
I think we're mixing 2 things here. There is the chaos ore *reroll*, which can essentially be only 0 or 1. I want a filter for that. basically a filter for any, not rerolled, rerolled.

We also have rolls on gear, e.g. when gear hits level 4/8/12/16 a substat gets added or an existing one "gets a roll".
I want to have a filter with which I can filter that any single substat is at `1`, `2`, `3`, or `4` rolls. Having nothing selected means `any`, and allow users to toggle multiple of these.
We can add a chip with which we can toggle whether that selection means "Match: Any of" or "Match: All of" similar to how we do that for the substats toggle.

**Open questions:**
- Should the chaos-ore reroll toggle and the substat roll-count chips sit together to the right of the tester config control, or do you prefer splitting them (e.g., reroll toggle in the toolbar, roll-count chips in the detail drawer)?
- For roll-count filtering, do manual tester rows need UI to capture their per-substat roll counts so the filters can match them, or is this limited to imported gear that already tracks rolls?

**Answer**: 
Make it a chip row under the Mainstat toggles (same block as the Match helper).

**Still open:** do manual tester rows need new inputs to record each substat’s roll count so the `1/2/3/4 rolls` filter has data to match, or should that filter only apply to imported gear (which already tracks roll counts)? Please clarify so we know whether the Rule Tester dialog needs extra controls.

**Answer**: 
The filter shall only apply to imported gear. Manual items shall be treated like 0 rolls. The chip row stays under Mainstat.

---

## Option C — Ascension Mini-Panel
- Placement: collapsible “Ascension” strip above the tester table (between the column headers and the first row).
- Controls: tri-state chip (`Any`, `Only Ascended`, `Hide Ascended`) plus a stat dropdown limited to ascension-compatible stats.
- Notes: panel is omitted entirely outside tester mode.

- [x] Approve

**Comments**
If we know the ascension level (which I presume should be anywhere beteen 0 and 6 - akin to rank), we should show "not ascended", "1*", ..."6*" as toggle buttons.
Having none selected should be like `any`.

**Open question:** manual tester entries currently only know whether an ascension stat exists, not the star count. Should we expand the dialog so users can set a 0–6 ascension level per row, or is the star-based filter meant solely for imported gear where that data already exists?

**Answer**: 
The star filter is for imported gear only. Manual entries should simply be treated as unascended. Use `0★`, `1★`, … `6★` labels (real star symbol). The ascension stat dropdown must be multi-select, no search, no summary chips; mirror the Faction dropdown layout (list with checkmarks), optionally tint rows using stat colors.

---

## Option D — Exact-Level Slider
- Placement: additional section inside the tester table header context menu (right-click menu).
- Controls: slider and/or presets for exact levels (e.g., `Show only +16`, `Show <10`, `Show 15–16`).
- Notes: stores preference alongside tester column layout so filters persist per user.

- [x] Approve

**Comments**
We can replace the exising +0...+17 toggle buttons with this slider.

**Open question:** the current +0…+16 buttons live inside the shared `RulesFilterPanel`, so replacing them would also affect the HSF (rules) table. Should the slider appear everywhere, or do you want a tester-only exact-level control that leaves the rules panel unchanged?

**Answer**: 
The slider is only for the rules tester version of the filter panel. in the sellfile preview version of the filter panel we should continue showing the current +0...+16 buttons. The explicit level range slider replaces in size and position the toggle button group when in rule tester mode. With "replaces" I do not mean take out of the DOM, I just dont want to see it. Do however it makes sense.

---

## Option E — Stat-Value Threshold Drawer
- Placement: “Detail Filters” button next to `Reset filters` in tester mode; opens a right-hand drawer dedicated to tester-only predicates.
- Controls: inputs for minimum stat values, glyph-only toggles, and roll-count thresholds (mirrors substat target UX).
- Notes: isolates advanced predicates without crowding the main toolbar.

- [x] Approve

**Comments**
From this I only need glyphed On+Off, where having them not selected means `Any`.

Notice that I essentially repleaced the explicit `Any` button in the UI by treating it implicitly by having no selection. I think we should change the "keep/sell/any" button of "Results" accordingly.
And we should also do the same for "Matched/No Match/Any".
We can do both of these changes for the filter panel in the sellfile preview as well as the rule tester.

**Open questions:**
- If glyph filtering no longer needs min-value inputs, should the On/Off toggle still live in a separate drawer, or would you prefer it as another toolbar chip row for visibility?
- Converting the Keep/Sell and Matched/No Match controls to multi-select chips (unchecked = Any) would alter the existing HSF filters. Do you want that global change, or should tester mode adopt the implicit-any behavior while the rules panel keeps its current explicit `Any` buttons?

**Answer**: 
Very good. We can add this as a chip similar to how we added "Match: Any/All of" for the substats drawer. In fact it makes sense to add this to the substats drawer right of "Match:". Make it `Glyphs: Any / On / Off`.
