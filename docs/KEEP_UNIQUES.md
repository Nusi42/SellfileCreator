# Keep Uniques – Rebuild Plan

This note aggregates everything we know about the abandoned Keep Uniques prototype and spells out how the new implementation should behave. The next implementation pass must stay within these boundaries so we hit the usability and safety goals documented in `docs/TECHNICAL.md` (plus its linked references).

> **Temporary doc**: This file exists only while the feature is under construction. Once the implementation is complete and the authoritative docs (`docs/TECHNICAL.md` + descendants) fully reflect the behavior, delete this file. Every change below must be mirrored in the permanent documentation before declaring the work complete.
---

## Purpose & Definition

- **Goal**: ensure the Sellfile keeps *at least one* artifact for every tuple the user cares about. A tuple is `(slot, set, rank, rarity, main stat)` for armor and `(slot, set, rank, rarity, main stat, faction)` for accessories. If applying the current rules would zero-out a tuple (e.g., all Speed/CDMG gloves of Legendary rank would be sold), Keep Uniques emits a `keep` rule so at least one item survives.
- **Grid intent**: the dialog grid does not let users flag individual artifacts; instead it shows the tester rows that would vanish for each at-risk tuple so users can verify coverage before exporting.
- **Default scope**: when users enable the feature for the first time (and the rules list is empty) we seed “keep at least one” requirements for every tuple inside the tracked “9-piece sets” catalog across all slots, ranks, rarities, main stats, and (for accessories) factions. That catalog (currently implemented under `armorVar19` in `src/components/SetMenuSection.tsx`) should be moved into `src/lib/types.ts` alongside the other set groupings so both the builder and Keep Uniques import a single definition. Users can delete or narrow these defaults later and the resulting rules behave just like entries they add manually.
- **Unique detection tuple**:
  - Main stats use the already-normalized `StatVariant`.
  - Accessory factions follow the equipped champion’s faction; non-accessories ignore faction entirely.
  - Slot + set are the canonical numeric ids used everywhere else.
  - Rank and rarity use the normalized numeric codes already present on tester rows so we distinguish “keep ≥1 Rank 6 Legendary CDMG glove” from “keep ≥1 Rank 5 Rare CDMG glove.”
- **Rule output**: each tuple rule becomes a `keep` rule tagged `RULE_SOURCE_KEEP_UNIQUES`, enriched with metadata (tuple hash, requested minimum count, latest scan timestamp) so downstream UIs can explain why the rule exists.

---

## Workflow Overview

1. **Activation (Final Sell dialog)**  
   - Integrate Keep Uniques as a new tab inside the existing Final Sell dialog. The dialog opens from the current `Configure` button in `PreviewHeaderActions`. We keep the current Final Sell tab untouched—same control positions, same sizing relative to today.
   - Feature flag state (`keepUniquesEnabled`, tuple rules) lives alongside Final Sell data in builder state. When the dialog opens we restore the last-viewed tab (defaulting to Final Sell if no Keep Uniques data exists yet).
2. **Scan scheduling**  
   - Once enabled, we scan the tester preview rows (single source of truth). Scans run:
     - Immediately after enabling.
     - After the tester match pipeline freezes/unfreezes new matches (respect `useTesterMatchWorker` freeze logic so UI never flickers mid recompute).
     - When builder configs, metasets, or tester filters change enough to alter coverage (i.e., when `testerPreviewRows` or `configModes` updates).
   - Never block rendering: reuse the existing “match freeze” gating already wired into tester previews. If a scan is pending we show the spinner in the dialog header.
3. **Dialog interaction**  
   - Dialog opens even if the scan is still running; empty states explain whether the feature is disabled, no DB is loaded, scan pending, or no at-risk tuples exist.
   - Right column mirrors the tester cards so users can visually inspect the rows that would disappear for each tuple (e.g., all Refresh banners with RES main stat for Dark Elves).
   - Left column lists every Keep Unique tuple rule (seeded defaults immediately become normal entries), allows inline edits, and syncs with HSFC/autosave.
4. **Rule editing & persistence**  
   - Users define tuple-level requirements such as “keep ≥1 CDMG glove from Speed sets” or “keep ≥1 Refresh banner with RES main stat per faction.” Inline controls set slot, set (or metaset), main stat, faction (if applicable), and required count.
   - All edits flow through the builder store, autosave payload, and the HSFC exporter so future sessions pick up exactly the same tuple protections.
   - Tuples already guaranteed by other keep rules drop out of the at-risk grid so users only see combinations that would otherwise be sold out.

---

## Data & State

- **Dataset**: reuse the normalized tester preview artifacts built in `App.tsx` (`testerPreviewRows` / `NormalizedGearArtifact`). No forking or re-normalizing — pass the array (plus `TesterPreviewRow.rowId`) into the keep-unique detector.
- **Detection service**: new module that receives the row list, the user’s Keep Unique rules, the merged keep rules, and filter context. It compares:
  - `currentCount`: how many tester rows satisfy each `(slot, set, rank, rarity, stat, faction?)` tuple.
  - `projectedCount`: how many remain after applying all existing keep rules (auto/manual HSFC) and the `KeepUniques` requirements.
  - Tuples with `projectedCount < requiredCount` become “at risk.” Even if the user owns five such artifacts, they are flagged whenever the Sellfile would sell all five.
  - The service returns tuple summaries plus the list of tester rows per tuple for the grid.
- **State shape**:
  ```ts
  type KeepUniqueRule = {
    id: string
    tuple: {
      slot: ArtifactTypeId
      set: ArtifactSetId
      rank: RankValue
      rarity: RankValue
      mainStat: StatVariant
      factionId: FactionId | null // accessories only
    }
    requiredCount: number // default 1
    enabled: boolean
  }
  ```
- **Persistence**:
  - Extend builder state (`useAppState` / `App.tsx`) to keep `keepUniqueRules` + `keepUniquesEnabled`.
  - Extend autosave payloads (Rule Tester autosave for the queue + global autosave via `useAutosave`) — both backed by `localStorage` — so reopening the dialog reconstructs pending edits even if the HSFC hasn’t been exported yet.
  - `buildHsfcPayload` and `parseHsfcObject` gain a new `KeepUniques` array (persisting the structure above; no extra transient fields).
  - Migrations: when loading HSFCs without `KeepUniques`, default to `[]`. When loading with data, ensure any tuples referencing dropped sets/slots are validated before use.
  - To link exported HSFC rules back to this feature, annotate the generated keep rules in `buildHsfcPayload` via a well-known `__cfgIdx` marker (e.g., a sentinel negative index) so the merge layer and HSF table can identify Keep Unique rules without carrying extra metadata per tuple.

---

## UI Entry Point

- **Dialog tabs**:
  - Final Sell dialog gains a top-level `Tabs` control with two labels: `Final Sell` (existing content) and `Keep Uniques`.
  - The Final Sell tab reuses the current layout verbatim. If we widen the dialog to accommodate the new left/right columns, keep the existing controls in the same relative positions so muscle memory still works.
  - Switching tabs does **not** close the dialog; the shared footer keeps `Close` and `Reset to defaults`, and the reset button becomes tab-aware (only affects the active tab).
- **Autosave**: last-active tab id persists in builder state to restore user preference.

---

## Dialog Layout & Behavior

- Reuse patterns from **MetasetsDialog** (sticky info header + list with add/remove controls) and the **Rule Tester Gear dialog** (fixed-size modal with virtualized grids).
- Size: `min(960px, 100vw - 32px)` wide × `min(800px, 100vh - 48px)` tall so both Final Sell and Keep Uniques tabs fit comfortably. Existing Final Sell controls stay anchored to their current grid even inside the wider canvas.
- Footer stays identical to the current Final Sell dialog: `Close` and `Reset to defaults` buttons aligned exactly as today. Both tabs apply changes immediately (with debounced state updates) while the footer simply offers escape/reset controls.
- Content grid:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Keep Uniques                                          (close button)       │
├───────────────────────────┬────────────────────────────────────────────────┤
│ Left column (~360px)      │ Right column (flex)                            │
│ ┌Sticky header (copy/CTA) │ ┌Sticky toolbar (scope chips + counts)        │
│ │• Enable toggle          │ │                                              │
│ │• Scope pickers (slot,   │ │                                              │
│ │  set, main stat, faction)│                                              │
│ │• Config mode buttons    │ │                                              │
│ └───────────┬─────────────┤ │ TesterItemsGrid variant="keepUniques":      │
│             │ Inline list │ │ • Two fixed columns                         │
│ Keep Unique │ of rules    │ │ • Sorted/grouped via sortTesterRows         │
│ Rules list  │ (Metaset-   │ │ • Tester card layout mirrors default grid   │
│ (virtualized│ style rows) │ │ • Context menu keeps relevant actions       │
│ like Gear   │ • summary   │ │ • Card selects highlight matching rule row  │
│ dialog)     │ • inline    │ │ • Empty states overlay instructions         │
│             │ edits       │ │ • Virtualization heuristics from tester     │
│             │ • Add /     │ │                                            │
│             │   Delete    │ │                                            │
│             │ • “Already  │ │                                            │
│             │   protected”│ │                                            │
│             │   flag      │ │                                            │
├─────────────┴─────────────┴────────────────────────────────────────────────┤
│ “Close” / “Reset to defaults” buttons (same layout as Final Sell tab)      │
└────────────────────────────────────────────────────────────────────────────┘
```

### Left column specifics

- Sticky instructions + controls at the top (like `MetasetsDialog` header).
- Rule list uses the Gear dialog’s “scrollable middle section + footer buttons” template:
  - Each entry shows tuple summary chips (set icon, slot icon, stat label, optional faction badge) plus the required count.
  - Inline controls reuse the selector components already present in the Gear dialog (extract them into shared modules as needed so behavior stays identical):
    - **Sets / Metasets**: factor `SetMenuSection` + `SetsOrderControls` into a shared helper, imported by both Gear and Keep Uniques.
    - **Slots**: reuse the Gear dialog’s multi-select slot picker, including `Any`/`All` toggles.
    - **Main stats**: reuse the Gear dialog’s stat multi-select with grouping + Any/All.
    - **Faction**: reuse the Gear dialog’s accessory faction selector; disable it unless the tuple slot is an accessory.
    - **Rank / Rarity**: reuse the rank/rarity selectors already available in the builder/Gear dialog so users can demand at least one item per rank/rarity combination (support `Any` shorthand just like the existing controls).
    - **Required count**: numeric input (`≥1`) reusing the same component/validation we use in the Substat Values dialog (increment/decrement buttons plus manual entry, debounced parsing).
  - When extracting these shared controls, ensure the existing builder/Rule Tester UIs retain their layout and props; do not regress the current behavior.
  - Buttons: `Add Keep Rule` / `Remove` mimic either the Metasets dialog (inline add button plus per-row delete icon) or the Gear dialog (footer-level add button + per-row trash buttons). Pick one pattern and reuse its styling so users see a familiar affordance.
  - The default sweep over 9-piece sets simply materializes real rules in the list. Deleting or editing them converts them into normal user-owned entries.

### Right column specifics

- `TesterItemsGrid` gets `variant="keepUniques"`:
  - Force `columns = 2` regardless of stored preference, but still honor show-first, show-other, and champion-icon preferences.
  - Context menu includes every action that still makes sense inside this tab (color controls, jump to rule, copy row, etc.) except the 4/5-column toggle, which we disable because the layout forces two columns.
  - Source glyph behaves exactly like the tester grid’s 4-column layout (positioned under the icon). No special centering tweaks.
  - Virtualization thresholds identical to the tester grid so large inventories remain responsive.
  - Selecting a tuple (left column) filters/highlights the cards mapped to that tuple so users can confirm “yes, these are the five CDMG Merciless gloves that would all be sold right now.”

---

## Interaction Details

- **Scope pickers**: buttons for Slot, Set, Rank, Rarity, Main Stat, and (for accessories) Faction. Each opens the same selector widgets used in the builder/Gear dialog so localization + keyboard support stay consistent. Rank/Rarity pickers support `Any` just like the builder. Faction picker only enables when the selected slot is an accessory. Sets picker supports “9-piece sets” shortcuts to quickly add the default coverage back.
- **Config mode buttons**: radio-group with `First match`, `Any match`, `Off`. The button styling must reflect mode (earlier drift showed “Off” visual even when mode was “First” with no configs selected).
- **Enable toggle**: indicates whether automatic scanning and rule generation run. When disabled, the rule list becomes read-only and the grid flips to the “Feature disabled” empty state.
- **Reset to defaults**: the dialog’s shared reset button only resets the active tab. On the Keep Uniques tab it restores the seeded 9-piece tuple rules (or clears custom entries if seeds were deleted). On the Final Sell tab it keeps the existing level/set reset behavior.
- **Linkage**: clicking a rule row filters the grid to highlight only the affected cards (others fade). Clicking a card can prefill a new tuple rule seeded from that card’s tuple so users can quickly create “keep ≥1 of these” requirements.
- **Persistence**: Edits apply immediately (debounced) to builder state/autosave. `Close` dismisses the dialog; `Reset to defaults` wipes only the active tab.

---

## Integration Points

File / module touchlist for the implementation:

- `src/App.tsx`
  - Store `keepUniqueRules`, `keepUniquesEnabled`, and detection results in top-level state.
  - Wire up scan scheduling after tester rows/configs change.
  - Feed results into the dialog props + Rule Tester grid badges.
- `src/components/dialogs/FinalSellDialog.tsx`
  - Convert to a tabbed layout with `Final Sell` and `Keep Uniques` tabs.
  - Keep existing Final Sell controls untouched in their current grid/stack order.
  - Implement the Keep Uniques tab content described above (can be factored into a child component such as `KeepUniquesTab`).
- `src/components/PreviewHeaderActions.tsx`
  - No new buttons; the existing `Configure Final Sell` button keeps opening the dialog.
- `src/components/TesterItemsGrid.tsx`
  - Accept a `variant` prop and branch the behaviors documented here (and in `docs/TECHNICAL.md`) without regressing the default tester view.
- `src/state/testerGridPreferences.ts`
  - No schema change, but we enforce `columns = 2` when `variant === 'keepUniques'`.
- `src/lib/keepUniques.ts` (new service)
  - Houses detection helpers, tuple hashing, metadata builders.
- `src/lib/merge.ts`
  - Introduce `RULE_SOURCE_KEEP_UNIQUES` and ensure `computeMergedRules` merges these keep rules alongside HSFC and Final Sell data.
- `src/lib/hsfcIO.ts`
  - Parse and serialize `KeepUniques`.
- `src/lib/history/*`
  - Add descriptors for “Keep Uniques edited” so the change log remains descriptive.
- `i18n` catalogs
  - Strings for button labels, dialog copy, empty states, chips, and errors.
- `docs/TECHNICAL.md`
  - Link to this plan and describe the finalized behavior once built.
- Shared selector components (sets, metasets, slots, stats, factions)
  - Extract the Gear dialog selectors into reusable modules; wire both Gear and Keep Uniques to the shared components so behavior stays identical.
- Set grouping constants (e.g., “9-piece sets”)
  - Relocate the grouping definitions out of `src/components/SetMenuSection.tsx` into `src/lib/types.ts` so all consumers import the same canonical data.

---

## Tests & Validation

All automated tests belong under the `tests/` directory (mirroring existing coverage).

1. **Detection unit tests**: cover tuple hashing, accessory faction handling, duplicates in same scope, required-count enforcement, per-rank/per-rarity distinctions, and “already protected” filtering.
2. **Reducer/state tests**: confirm enabling/disabling, add/edit/remove flows, autosave payload generation, and HSFC serialization.
3. **Component tests** (React Testing Library):
   - Dialog renders sticky controls, enforces two columns, and highlights rules ↔ cards.
   - Config mode buttons show the correct state regardless of filter selections.
   - Empty states trigger correctly (disabled, no DB, scan pending, no uniques).
4. **Playwright**: end-to-end flow importing a sample DB, enabling Keep Uniques, editing rules, saving, reloading via autosave, exporting HSFC, and verifying the exported JSON contains the expected `KeepUniques`.

---

## Risks & Things to Double-Check

- **Match freeze coupling**: if we forget to guard scans with the tester match freeze state, users will see flicker and stale results whenever configs change quickly. Always read from the deduped `testerPreviewRows` map and only swap the dialog dataset when the freeze releases.
- **Normalization**: the worker expects every row to provide `equippedChampionBaseId`, `equippedToChampionId`, and location info. Guard against undefined fields before tuple hashing.
- **Rule duplication**: `RULE_SOURCE_KEEP_UNIQUES` rules must dedupe against HSFC + Final Sell rules. Update the merge layer so we never emit two identical `keep` rules for the same `(slot, set, stat, faction)` tuple.
- **Persistence drift**: autosave and HSFC export need to serialize exactly the same structure. Build a helper (e.g., `normalizeKeepUniqueRules`) and reuse it in both read/write paths to avoid version skew.
- **UI drift**: the `TesterItemsGrid` variant must not alter the base tester grid styling. Keep variant-specific tweaks behind the new prop so other entry points stay untouched.
- **Config filter UX**: ensure button styling follows mode, not “any selection,” to avoid the earlier “Off but still filtering” confusion described in the tester grid guidance within `docs/TECHNICAL.md`.
- **i18n**: all new strings (button labels, empty states, tooltips) must go through the catalog files before shipping. Avoid hard-coded English text.
- **Accessibility**: Manage Metasets’ keyboard & screen reader patterns already work well; reuse those focus/aria techniques for inline selects, toggles, and list controls in the Keep Uniques dialog.

---

Updating this file (and `docs/TECHNICAL.md`) is part of the definition of done for the rebuild. The next agent should treat this checklist as authoritative and keep it in sync with any architectural decisions they make while implementing the feature.
- Inline comments are required for new or modified code that is not self-explanatory (follow the guidance in `AGENTS.md` and `docs/TECHNICAL.md`). When touching legacy code that was hard to understand at first glance, add clarifying comments there as well so the next agent does not stumble again.
- No duplicated logic: obey the Single Source of Truth / One Definition Rule at all times. Shared data, UI, and logic (set catalogs, selectors, tuple hashing, dialog controls, detection helpers) must live in shared modules and be imported wherever needed rather than copied.
