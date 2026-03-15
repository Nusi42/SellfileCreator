# Builder Panel Grid Layouts

Both builder panels share the same outer CSS grid definition and similar row structure, but differ in a few key rows.

## Outer Grid (both panels)

```
display: 'grid'
gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))'
columnGap: 1  (theme spacing ≈ 8px)
rowGap:    1
```

Four equal columns, each at least 220 px, growing to fill available space. Sections are placed by `gridColumn` into this grid.

---

## RecipeBuilderPanel rows

```
┌─────────────────────────────────────────────────┐
│ Row 0 │ 1 / -1 │ Rule Name (TextField)          │  not collapsible
├─────────────────────────────────────────────────┤
│ Row 1 │ 1 / -1 │ Action Mode (Keep/Sell/Ascend) │  not collapsible
├──────────────────────────┬──────────────────────┤
│ Row 2 │ 1 / -1 flex wrap │                      │
│   ├── LEFT  66.667%      │ Rank / Rarity / Faction (each 33 % of left group) │  collapsible individually
│   └── RIGHT 33.333%      │ Level Window (slider) │  collapsible
├──────────────────────────┬──────────────────────┤
│ Row 3 │ 1 / -1 flex wrap │                      │
│   ├── LEFT  50 %         │ Main Stat (2 rows of toggle buttons) │  collapsible
│   └── RIGHT 50 %         │ Substats (tri-state chips + roll targets sub-grid) │  collapsible
├──────────────────────────┬──────────────────────┤
│ Row 4 │ 1 / -1 flex wrap │                      │
│   ├── LEFT  50 %         │ Slots (3 × 3 icon grid) │  collapsible
│   └── RIGHT 50 %         │ Min Rolls + Required Substats + Milestones + Sets │  4 nested collapsible sections
├─────────────────────────────────────────────────┤
│ (below grid) Divider + Insert / Apply / Reset   │  not collapsible
└─────────────────────────────────────────────────┘
```

### Row 2 detail — Rank / Rarity / Faction + Level

The whole row lives in a single `gridColumn: '1 / -1'` flex wrapper.

```
flex wrapper  (gap: 1, alignItems: flex-start)
├── Left group  flex: rrfAllCollapsed ? '0 0 auto' : '0 1 66.667%'
│   display: flex, gap: 1
│   ├── Rank     flex: collapsed ? '0 0 auto' : '0 1 33.333%'
│   ├── Rarity   flex: collapsed ? '0 0 auto' : '0 1 33.333%'
│   └── Faction  flex: collapsed ? '0 0 auto' : '0 1 33.333%'
└── Level        flex: collapsed ? '0 0 auto' : '0 1 33.333%'
```

### Row 4 detail — right column

The right-side flex item contains **four** independently-collapsible sub-sections stacked vertically. The whole right item collapses (to header width) only when **all four** are collapsed.

```
Right item  flex: allFourCollapsed ? '0 0 auto' : '0 1 50%'
display: flex, flexDirection: column
├── Min Rolls           collapsible (id: minRolls)
├── Required Substats   collapsible (id: requiredSubstats)
├── Milestone Thresholds collapsible (id: milestoneThresholds)
└── Sets                collapsible (id: sets) — includes Manage Metasets button in header
```

---

## SafeguardBuilderPanel rows

```
┌─────────────────────────────────────────────────┐
│ Row 0 │ 1 / -1 │ Rule Name (TextField)          │  not collapsible
├─────────────────────────────────────────────────┤
│ Row 1 │ 1 / -1 │ Mode + Count + Ignore + Undo   │  not collapsible
├──────────────────────┬──────────────────────────┤
│ Row 2 │ 1 / 3  flex  │ cols 3-4 EMPTY           │
│   ├── Rank    33.3 % │                          │  collapsible
│   ├── Rarity  33.3 % │                          │  collapsible
│   └── Faction 33.3 % │                          │  collapsible
├──────────────────────┬──────────────────────────┤
│ Row 3 │ 1 / -1 flex wrap │                      │
│   ├── LEFT  50 %         │ Main Stat (2 rows of toggle buttons) │  collapsible
│   └── RIGHT 50 %         │ Substats (chips + per-substat scope chips) │  collapsible
├──────────────────────────┬──────────────────────┤
│ Row 4 │ 1 / -1 flex wrap │                      │
│   ├── LEFT  50 %         │ Slots (3 × 3 icon grid + perSlot chip) │  collapsible
│   └── RIGHT 50 %         │ Sets (list + perSet chip + Manage Metasets) │  collapsible
├─────────────────────────────────────────────────┤
│ Row 5 │ 1 / -1 │ Insert / Apply / Reset         │  not collapsible
└─────────────────────────────────────────────────┘
```

### Row 2 key difference

Unlike Recipe Builder, the Rank/Rarity/Faction group spans **only columns 1–2** (`gridColumn: '1 / 3'`). Columns 3–4 of that grid row are intentionally empty. There is no Level section in Safeguard Builder.

---

## Flex wrapper mechanics (current — Rows 2-4 in both panels)

Rows 2, 3, and 4 were recently converted from direct grid children with fixed `gridColumn` spans to **flex wrappers** at `gridColumn: '1 / -1'`.

Each section inside a wrapper carries:

| State    | `flex` value   | Effect                                        |
|----------|---------------|-----------------------------------------------|
| Expanded | `'0 1 <basis>'` | Cannot grow beyond basis; can shrink below it |
| Collapsed | `'0 0 auto'`  | Shrinks to the width of its header row only   |

Basis values by section pair:

| Section           | Basis when expanded |
|-------------------|---------------------|
| Main Stat         | 50 %                |
| Substats          | 50 %                |
| Slots             | 50 %                |
| Sets (right col)  | 50 %                |
| Rank/Rarity/Faction (outer group) | 66.667 % |
| Level             | 33.333 %            |
| Rank / Rarity / Faction (each, within group) | 33.333 % |

### Current behaviour

- **Both expanded**: each takes exactly its basis → looks identical to the old grid.
- **One collapsed**: the collapsed item shrinks to header width; the expanded sibling stays at its basis (does **not** grow); the freed space becomes blank.
- **Both collapsed**: both shrink to header width; most of the row is blank.

### Known visual issues

1. **Left-alignment with large blank area** — when one section collapses the sibling does not fill the freed space because `flex-grow: 0`. The right half of the row sits empty.
2. **Rank/Rarity/Faction (Safeguard)** — spans only `1 / 3` so at full window width the two empty grid columns on the right are visible at all times, collapsed or not.
3. **Sets / right column (Recipe)** — holds four nested toggles; a fully collapsed right column shows four stacked header rows which is wider than a single header. The 50 % basis can still feel large compared to a collapsed left column.

---

## What could be changed

Below are options to discuss; no code has been written for any of these yet.

### Option A — Revert to direct grid children, no flex wrappers

Remove the `gridColumn: '1 / -1'` wrappers entirely. Place sections back into their original `gridColumn` spans (`1 / 3` and `3 / 5`). When a section is collapsed, just show its header inside the same fixed-width cell. The grid never reflows; collapsed sections simply appear narrower *within* their column allocation. Simplest approach, closest to the original look.

### Option B — Keep flex wrappers but use `flex-grow: 1` on the expanded sibling

Change expanded sections from `'0 1 <basis>'` → `'1 1 <basis>'` (allow growing). When one collapses, the other expands to fill the freed space. Downside: sets / right column alone would capture the full row width, which a review found unbalanced.

### Option C — Constrain maximum width of expanded sections

Keep `flex-grow: 1` but add an explicit `maxWidth` cap (e.g. `maxWidth: '60%'` or a fixed px value) so no single section balloons to full row width. More complex to tune.

### Option D — Switch the flex wrapper to `flexWrap: 'wrap'` and let sections flow naturally

Collapsed sections become narrow "pills" that stay on the row as long as space allows, otherwise wrapping. Matches how the filter panel works but can result in unexpected reflows when multiple sections are collapsed at once.

### Option E — Change the outer grid template to `auto` columns for flex-wrapper rows

For rows that have flex wrappers, use a separate row definition with two explicit `auto` columns instead of `1fr`. When a section collapses the column shrinks. Most faithful to the filter-panel metaphor but requires restructuring the grid template.
