# Tester Cards: Substat Sort Options (UX Spec Worksheet)

Use this file to describe exactly what you want added to the **Tester Cards** filter panel regarding **sorting by substats**.

I’ll treat anything you mark as “Required” as the acceptance criteria.

---

## 1) Goal (Required)

In one sentence, what should sorting accomplish?

- Goal:
  - <!-- e.g. "Let me quickly bring testers with higher Crit Rate to the top." -->
Let me quickly bring testers with higher Crit Rate and/or SPD (or others) to the to top.
---

## 2) Where Sorting Applies (Required)

When I change sort settings, it should:

- [X] Sort the entire tester card list globally
- [X] Sort only within existing groups/sections (if any)
- [ ] Other:
  - <!-- describe grouping + expected behavior -->

If there are groups today, list them (optional):

- Groups/sections that exist today:
  - <!-- e.g. "by element", "by owner", "by build version" -->
There are these sections. Artifacts per Gear-Sets, Accesories per Factions,  Accesories per Faction's Gear-Sets
I basically want to these 2 sort grouping methods
1. merge all artifacts to one section and sort, and merge all accoessries within one faction and sort
2. leave all artifacts in their gearset sections and sort within their gearset section, and leave all accessories in their gearset sections within their factions and sort within their gearset section, 

---

## 3) Sort Controls Location (Required)

In the filter panel, the sort UI should live:

- [ ] At the top (before filters)
- [ ] Under the “Substats” section
- [X] As its own “Sort” section
- [X] Other:
  - <!-- describe where -->
above results/sets/level/faction and below configName/configFilter/PreviewConfigs/ResetFilters/Close.
---

## 4) Sort Mode (Required)

Which sort modes should exist?

- [ ] No new mode: only “Sort by selected substats” (uses current substat filter selection)
- [ ] Single substat sort (pick 1 substat; sort by its value)
- [X] Multi-substat sort (pick N substats; combine somehow)
- [ ] Both single + multi

If multi-substat sort exists, how should it combine values?

- [ ] Sum of selected substat values
- [ ] Weighted sum (each chosen substat has a weight)
- [X] Priority list (sort by first; tie-breaker second; etc.)
- [ ] Other:
  - <!-- describe -->
Also note that the last tie-breaker should be the natural sort order which we use if there is no sort seleced.
---

## 5) Sort Direction (Required)

For numeric substats, allow:

- [X] High → Low (descending)
- [X] Low → High (ascending)
- Default direction:
  - <!-- e.g. "High → Low" -->
High → Low

---

## 6) Missing / Not Present Values (Required)

If a tester card does not have the substat(s) involved in the sort, do:

- [ ] Keep them at the bottom
- [ ] Keep them at the top
- [ ] Exclude them from the list
- [X] Treat missing as 0
- [ ] Other:
  - <!-- describe -->

---

## 7) Ties (Required)

If two tester cards have the same computed sort value, break ties by:

- [X] Keep current order (stable sort)
- [ ] Name
- [ ] Last updated
- [ ] Other:
  - <!-- describe -->

---

## 8) Interaction Details (Optional)

Pick anything you care about:

- Apply sort:
  - [X] Immediately as controls change
  - [ ] Only after clicking “Apply”
- Reset behavior:
  - [ ] “Reset filters” also resets sorting
  - [X] Sorting persists unless explicitly reset
- Persistence:
  - [ ] Persist in URL query params
  - [X] Persist in local storage
  - [ ] Session-only

---

## 9) Visual Treatment (Optional)

What UI style do you prefer?

- [X] Dropdown(s)
- [ ] Chips
- [ ] Toggle buttons
- [ ] Drag-to-reorder list (for priority)
- [X] Keep it minimal (fewest controls)

Sketch / notes:

<!-- paste a rough sketch or describe the layout -->

---

## 10) Non-Goals (Optional)

What should we explicitly NOT do?

- Non-goals:
  - <!-- e.g. "No weighting UI" / "No URL persistence" -->

---

## 11) Examples (Strongly Recommended)

Give 2–3 concrete examples of expected ordering.

Example A:

- Substat(s) used:
- Direction:
- Cards (before):
  - <!-- list a few representative cards with substat values -->
- Cards (expected after):
  - <!-- expected ordering -->

Example B:

- Substat(s) used:
- Direction:
- Missing substat handling:
- Expected outcome:

---

## 12) Acceptance Criteria Checklist (Required)

Check all that must be true for this to be “done”:

- [X] Sort controls exist in the filter panel
- [X] Sorting can be turned off / restored to default
- [X] Sorting works with current filters applied
- [X] Missing substat handling matches section 6
- [X] Tie-breaking matches section 7
- [ ] UX labels are clear and consistent
- [ ] Keyboard navigation works (basic tab/enter/space)

Other required criteria:

- <!-- add any additional must-haves -->

We also need an option with which we can include or exclude glyped values for substats.
