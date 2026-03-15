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
│ Row 1 │ 1 / -1 │ Action Mode (Keep/Sell/Ascend) │  collapsible (id: action); undo/redo always visible in header
├──────────────────┬──────────────────────┬───────┤
│ Row 2            │                      │       │
│  1/3  flex row   │ 3/4                  │ empty │
│  ├── Rank 33.3%  │ Level Window (slider)│       │  each collapsible
│  ├── Rarity 33%  │                      │       │
│  └── Faction 33% │                      │       │
├──────────────────┴──────────────────────┴───────┤
│ Row 3                                           │
│  1/3  Main Stat (2 rows toggle buttons)         │  collapsible
│  3/5  Substats (tri-state chips + roll targets) │  collapsible
├─────────────────────────────────────────────────┤
│ Row 4a                                          │
│  1/3 (span 2 rows) Slots (3×3 icon grid)        │  collapsible
│  3/5  Min Rolls + Req Substats + Milestones     │  3 side-by-side collapsibles
│       Min Rolls also has a warning text overlay │  collapses with Min Rolls; bleeds over Sets
├──────────────────────────────────┬──────────────┤
│ Row 4b                           │              │
│  1/3 (continued from Slots span) │ 3/5  Sets    │  collapsible
└──────────────────────────────────┴──────────────┘
│ (below grid) Divider + Insert / Apply / Reset   │  not collapsible
└─────────────────────────────────────────────────┘
```

### Row 2 — Rank / Rarity / Faction + Level

```
gridColumn: '1/3'  Box  (display: flex, gap: 1, alignItems: flex-start)
├── Rank    FormControl   flex: collapsed ? '0 0 auto' : '0 1 33.333%'
├── Rarity  FormControl   flex: collapsed ? '0 0 auto' : '0 1 33.333%'
└── Faction FormControl   flex: collapsed ? '0 0 auto' : '0 1 33.333%'

gridColumn: '3/4'  Box  (Level Window slider — no top/bottom padding)
└── Level   collapse     flex: n/a (grid item fills column)
```

Columns 3–4 of the outer grid row are split: col 3 holds Level, col 4 is empty.

### Row 4 — Slots + right column

Slots uses `gridRow: 'span 2'` so it visually aligns with both the Min Rolls area (row 4a) and Sets (row 4b) on the right. The right side holds two separate `gridColumn: '3/5'` items that auto-place into rows 4a and 4b.

Min Rolls, Required Substats, and Milestones are side-by-side inside a flex-wrap Box (inside an outer FormControl with no toggle). Each has a fixed pixel width when expanded and collapses to header width:

```
flex: collapsed ? '0 0 auto' : `0 0 ${BUILDER_XXX_COLUMN_WIDTH_PX}px`
width: collapsed ? 'auto'    : `${BUILDER_XXX_COLUMN_WIDTH_PX}px`
```

---

## SafeguardBuilderPanel rows

```
┌─────────────────────────────────────────────────┐
│ Row 0 │ 1 / -1 │ Rule Name (TextField)          │  not collapsible
├─────────────────────────────────────────────────┤
│ Row 1 │ 1 / -1 │ Mode + Count + Ignore + Undo   │  collapsible (id: action); undo/redo always visible in header
├──────────────────────────┬──────────────────────┤
│ Row 2 │ 1 / 3  flex row  │ cols 3-4 EMPTY       │
│   ├── Rank    33.3 %     │                      │  collapsible
│   ├── Rarity  33.3 %     │                      │  collapsible
│   └── Faction 33.3 %     │                      │  collapsible
├──────────────────────────┴──────────────────────┤
│ Row 3                                           │
│  1/3  Main Stat (2 rows toggle buttons)         │  collapsible
│  3/5  Substats (chips + per-substat scope chips)│  collapsible
├──────────────────────────┬──────────────────────┤
│ Row 4 │ 1 / -1  flex row                        │
│   ├── LEFT  50 %  Slots (3×3 icon grid)         │  collapsible
│   └── RIGHT 50 %  Sets  (list + Manage Metasets)│  collapsible
├─────────────────────────────────────────────────┤
│ Row 5 │ 1 / -1 │ Insert / Apply / Reset         │  not collapsible
└─────────────────────────────────────────────────┘
```

### Row 2 key difference

Unlike Recipe Builder, the Rank/Rarity/Faction group spans **only columns 1–2** (`gridColumn: '1 / 3'`). Columns 3–4 of that grid row are intentionally empty. There is no Level section in Safeguard Builder.

### Row 3 — substats phantom-height fix

The substats chips row (match mode chip + weights button) lives in a separate `<Collapse>` **outside** the FormControl, making it a second flex child of the outer Box. To prevent the zero-height Collapse wrapper from creating a phantom gap when collapsed:

- The outer Box uses `gap: 0` (not `0.75`)
- The chips `<Box>` inside the Collapse uses `mt: 0.75` instead — this margin unmounts with the content, so no spacing persists when collapsed

### Row 4

Slots and Sets are flex items inside a `gridColumn: '1 / -1'` wrapper. Each always occupies 50% and collapses vertically to its header.

---

## Collapse mechanics (all sections)

Every collapsible section behaves like the filter panel:

| State     | `flex` value         | Width effect                               |
|-----------|---------------------|--------------------------------------------|
| Expanded  | `'0 1 <basis>'` or `'0 0 <px>'` | Proportional or fixed width   |
| Collapsed | `'0 0 auto'`        | Shrinks to header row width only           |

Content inside each section is wrapped in `<Collapse in={!collapsed} timeout="auto" unmountOnExit>`. When closed, the wrapper div remains in the DOM at `height: 0; overflow: hidden` but children are unmounted, so no content height is reserved.

The header row always renders (it is outside the Collapse): chevron toggle + label + optional clear button placeholder (`CLEAR_ICON_BUTTON_SIZE_PX = 28px` wide).
