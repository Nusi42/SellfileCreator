# Rule Tester Filter Panel Plan (Reflecting Current Layout)

The preview filter dialog renders as a two-column grid (`xs: 1fr`, `sm: 1fr 1fr`).
- **Left column** (stacked): top row is itself a 2-column grid (`Result` / `Sets`), followed by `Mainstat` and `Substats`.
- **Right column**: top row pairs `Level` and `Faction`, followed by `Slots`, then a row that pairs `Rank` and `Rarity`.

The additions below follow that exact structure so nothing shifts into a third column or extra row outside the established pattern.

## Left Column (top → bottom)
1. **Row 1 (two cells, existing):**
   - `Result` — Keep/Sell + Matched toggles remain in the left cell. Explicit `Any` buttons go away; leaving a toggle off now means “Any”.
   - `Sets` — existing selector remains in the right cell.

2. **Row 2 (two cells, tester-only):**
   - `Source` — compact FormControl with a 2-row, 3-column toggle button grid (`Inventory`, `Collection`, `Vault`, `Inbox`, `Manual`). Multi-select; no selection = Any.
   - `Champions` — searchable multi-select listing every equipped champion detected in the tester rows (inventory/manual-only items are ignored). Hidden automatically when no champion IDs exist. Clearing the search or deselecting all chips returns to “Any champion”.

3. **Row 3 (Mainstat section):**
   - Stat toggle grid unchanged.
   - Helper chip row now contains only `Chaos Ore: Any | Not rerolled | Rerolled` (Match chip removed per latest guidance).

4. **Row 4 (Substats section):**
   - Toggle grid + drawer remain.
  - Helper chips immediately below the grid read `Match: Any | All` and `Glyphs: Any | On | Selected | Off` (Glyphs chip sits to the right of Match). The drawer mirrors the same controls for advanced tweaks.

5. **Row 5 (new, spans full column width):**
   - **Substat Roll Count**. Chips labeled `1 roll`, `2 rolls`, `3 rolls`, `4 rolls`, plus a `Mode: Any | All` chip. Manual tester entries count as 0 rolls, so they only appear when no chips are selected.

## Right Column (top → bottom)
1. **Row 1 (two cells, existing):**
   - `Level` (left cell) — in tester mode the ToggleButtonGroup is replaced by an exact-level slider + preset buttons; the original buttons return when viewing the rules table.
   - `Faction` (right cell) — unchanged multi-select.

2. **Row 2 (full-width):**
   - `Slots` — unchanged icon toggle grid, still collapsible.

3. **Row 3 (two cells):**
   - `Rank` — condensed buttons (`1-3`, `4`, `5`, `6`) with implicit Any semantics.
   - `Rarity` — condensed buttons (`C/U`, `Rare`, `Epic`, `Legendary`, `Mythical`) with implicit Any semantics.

4. **Row 4 (full-width, new):**
   - **Ascension strip** — now part of the right column stack, directly beneath the Rank/Rarity row. Buttons: `0★`, `1★`, `2★`, `3★`, `4★`, `5★`, `6★`, plus a stat dropdown that supports multi-select without search or summary chips (list mirrors the Faction layout minus icons, optionally tinted by stat colors). Manual tester rows behave as `0★`.

## ASCII Layout (sm breakpoint and above)

```
┌──────────────────────────── Filter Panel (2-column grid) ─────────────────────────────┐
│ Left Column (stacked)                        │ Right Column (stacked)                 │
│ ┌───────────────┬──────────────────────────┐ │ ┌───────────────┬───────────────────┐ │
│ │ Result        │ Sets                     │ │ │ Level (slider │ Faction          │ │
│ │ [Keep][Sell]  │                          │ │ │ in tester)    │ select           │ │
│ │ [Matched][No] │                          │ │ └───────────────┴───────────────────┘ │
│ └───────────────┴──────────────────────────┘ │ ┌───────────────────────────────────┐ │
│ ┌───────────────┬──────────────────────────┐ │ ┌───────────────────────────────────┐ │
│ │ Source buttons│ Champions (search + multi) │ │ Slots (icons)                    │ │
│ │ [Inv][Col][Va]│                            │ └───────────────────────────────────┘ │
│ │ [Inbox][Manual]                           │ │ ┌───────────────┬───────────────────┐ │
│ └───────────────┴──────────────────────────┘ │ │ Rank          │ Rarity           │ │
│                                              │ │ [1-3][4][5][6] │ [CU][3][4][5][6] │ │
│ ┌──────────────────────────────────────────┐ │ └───────────────┴───────────────────┘ │
│ │ Mainstat                                 │ │ ┌───────────────────────────────────┐ │
│ │ helper chips: [Chaos Any/No/Rerolled]     │ │ │ Ascension Filter                 │ │
│ └──────────────────────────────────────────┘ │ │ [0★][1★][2★][3★][4★][5★][6★]    │ │
│ │ Substats (grid + drawer)                 │ │ │ Stats multi-select dropdown      │ │
│ │ helper chips: [Match Any/All][Glyph Any/On/Selected/Off]                          │
│ └──────────────────────────────────────────┘ │                                       │
│ ┌──────────────────────────────────────────┐ │                                       │
│ │ Substat Roll Count [1][2][3][4] Mode[⋯]  │ │                                       │
│ └──────────────────────────────────────────┘ │                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Additional Behavior Notes
- All new blocks use the same `FormControl` + `FormLabel` + `Collapse` skeleton so padding and responsiveness match the existing layout.
- “No selection = Any” applies uniformly to Keep/Sell, Matched, Source chips, roll-count chips, condensed Rank/Rarity buttons, and the Champions picker.
- The Champions selector hides entirely when no tester rows carry an equipped champion ID, keeping the Source row compact for manual-only sessions.
- The Glyphs helper now cycles through `Any → On → Selected → Off`; `Selected` demands that every chosen substat is present and glyphed before a tester row is shown.
- The Source/Reroll row reuses the same internal 2-column grid as the current `Result/Sets` row, so column gutters and breakpoints stay identical.
- Exact-level slider only renders while `mode === 'tester'`; when switching back to the rules table the component reinstates the ToggleButtonGroup without altering layout height.
