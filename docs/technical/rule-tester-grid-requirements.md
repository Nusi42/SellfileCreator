# Rule Tester Grid Rebuild Requirements

This document captures everything that changed (or was attempted) after commit `19752312d5951865646e68032f4c7719dd82d9e6` so the next agent can reproduce the intended behavior without referencing the broken code. It combines the original grid baseline, the feature goals introduced in the failed branch, and the gaps/regressions we still need to address.

## Baseline (rev `19752312…`)

- **Layout:** `src/components/TesterItemsGrid.tsx` rendered tester rows in a responsive grid (`1` column below the `sm` breakpoint, `4` columns above it) with generous gaps (`theme.spacing(1.25)` ≈ `10px`) and no explicit card-height constraints.
- **Match chips:** Every card always showed the primary `TesterRuleReferenceChip` followed by the “other matches” row (with the `+N` chip expanding a popover). Both rows contributed to variable card heights.
- **Context menu:** Only accordion headers reacted to the context menu (right-click toggled that group, with the tutorial hint overlay pointing at the header chevron). The grid surface did not expose its own menu.
- **Color controls:** The tester surface inherited Manage Colors / Color stat text toggles from upstream state, but they were only reachable through the builder and HSF table menus.
- **Match building:** `App.tsx` chunked `evaluateMatchesByConfig` calls on the main thread. There was no worker, so large inventories made the UI hitch while rows were recomputed.
- **Virtualization:** Group virtualization relied on `ResizeObserver` per top-level accordion and a single fallback height constant (`ESTIMATED_CARD_HEIGHT_PX = 220`). Collapsing/expanding large sets triggered heavy reflow and repeated observer churn.

## Features Introduced (rev `19752312…` → `HEAD`)

### Current implementation summary (Jan 2025)

- **Grid context menu:** Implemented in `TesterItemsGrid.tsx` with `ContextMenuPaper`, `useContextMenuHint('testerGridContextMenu')`, and shared button sizing. Menu items now control stat-coloring (plus Manage Colors), color-blind palette cycling, the 4/5-column toggle, and the per-row visibility toggles. Hints clear as soon as any context menu fires.
- **Preference storage:** Column and match-row toggles persist via `src/state/testerGridPreferences.ts`, backed by the new keys in `src/lib/constants.ts`. The grid reads these live so reloads respawn the last layout.
- **Deterministic card sizing:** Cards lock to `getTesterCardHeight()` so virtualization estimates and rendered heights match. The grid gap moved to `theme.spacing(0.375)`, the icon column shrank to `72px`, and match rows mount only when visible (avoiding empty space or “No match” flicker while worker chunks build).
- **Restore-aware gating:** `App.tsx` now tracks a `testerMatchFreeze` window whenever tester gear is restored (or configs/metasets/targets that affect tester rules are reloaded). While the freeze is active `testerBuilding` stays `true`, so the Keep/Sell badge and both match rows stay hidden until the worker rebuild commits the latest data (or the freeze auto-clears if no rebuild is needed).
- **Docs & i18n:** This file and `docs/technical/app-behavior.md` capture the context-menu behavior, and every locale catalog includes the new `rulesMenuGridColumns*` / `rulesMenuShow*` strings so UI copy stays localized.

### Grid context menu & hints

- Right-clicking anywhere inside the tester grid scroll container opens a dedicated menu that mirrors the HSF header menu styling. The menu is anchored at the cursor position and reuses `ContextMenuPaper` so Escape/Close works the same as other context menus.
- Menu content (in order):
  - `rulesMenuColorStatTexts`: button toggles `useStatButtonColors`, plus an inline “Manage Colors” icon button that reuses the existing `colorIconSrc` and triggers `onOpenManageColors`.
  - `rulesMenuColorBlindPalette`: button cycles `colorBlindMode` through `normal → okabeIto → tritan → normal`. The button caption reflects the current mode (`colorBlindNormal`, `colorBlindOkabeIto`, `colorBlindTritan`).
  - Divider.
  - `rulesMenuGridColumns`: button flips between `4` and `5` grid columns (see “Column configuration” below) and the button text now mirrors the active count (it literally shows `4` or `5`, no extra label).
  - `rulesMenuShowFirstMatch` & `rulesMenuShowOtherMatches`: buttons toggle the visibility of each match row.
- Menu controls obey shared sizing constants from `src/lib/constants.ts`: `MENU_CONTROL_HEIGHT_PX = 28` and `MENU_CONTROL_MIN_WIDTH_PX = 120`.
- Context hints: `useContextMenuHint('testerGridContextMenu')` displays the “Right-click for more” overlay while hovering the grid. The hint disappears as soon as *any* context menu fires (grid-level or accordion-level) so we don’t nag once users discover the pattern.

### Column configuration + match-row visibility

- `Grid columns`: default to `5` columns at viewport widths ≥ the `sm` breakpoint (`theme.breakpoints.values.sm`, currently `600px`). Below that breakpoint the grid collapses to a single column regardless of the toggle. The cards themselves always reserve a `72px` icon column plus a `minmax(112px, 1fr)` stats column, and the inter-column gap is `theme.spacing(1.25)` ≈ `10px` so the icon stack no longer crowds the stat text.
- Leaf accordions wrap the grid with `theme.spacing(0.75)` padding so edge cards do not touch the accordion border.
- Column preference persists via `sellfileCreator.tester.grid.columns.v1` (see `src/state/testerGridPreferences.ts`).
- `Show first match` / `Show other matches`: persisted per user via two new `localStorage` keys in `src/lib/constants.ts` and `src/state/testerGridPreferences.ts`:
  - `sellfileCreator.tester.grid.showFirstMatch.v1`
  - `sellfileCreator.tester.grid.showOtherMatches.v1`
- When a row is disabled the corresponding card height shrinks deterministically (see next section) and the hidden row is removed from the DOM. When `testerBuilding` is true and no match data exists yet we suppress the “No match” chip to avoid flicker in the first row.

### Deterministic card sizing & virtualization tweaks

- Card sizing constants (from `TesterItemsGrid.tsx`):
  - Icon column width: `TESTER_GRID_ICON_BOX_SIZE_PX = 72`
  - Stats column minimum width: `GRID_CARD_STATS_MIN_COLUMN_PX = 112`
  - Card padding: `CARD_PADDING_UNITS = 1` → `8px` on each side (`cardVerticalPaddingPx = 16px` top+bottom)
  - Base first-row height: `CARD_FIRST_ROW_HEIGHT_PX = 132`
  - Each match row height: `CARD_MATCH_ROW_HEIGHT_PX = 34`
  - Gap between match rows: `CARD_MATCH_ROW_GAP_PX = 2`
  - Gap before the first match row: `CARD_MATCH_SECTION_LEADING_GAP_PX = 4`
  - Grid gap between cards: `theme.spacing(0.375)` ≈ `3px`
- Derived heights:
  - With both match rows visible: `132 + 4 + 34 + 2 + 34 + 16 = 222px`
  - Hide “other matches”: subtract `34 + 2`
  - Hide both match rows: `132 + 16 = 148px`
- `getTesterCardHeight(showFirst, showOther, cardVerticalPaddingPx)` centralizes the math so virtualization and actual cards stay in sync.
- Each card’s root `Box` sets `minHeight`, `maxHeight`, and `height` to that computed value to avoid `ResizeObserver` noise during accordion toggles.
- Virtualization falls back to `getTesterCardHeight` when a top-level group hasn’t been measured yet. Thresholds remain the same: enable virtualization when `rows.length > 150` or `group count > 12`, with `GRID_VIRTUALIZE_OVERSCAN_PX = 640`. The spacer that represents the skipped rows is now a real block element (instead of a `translateY`), which stops the scrolling “jump” that happened when switching between accordions.
- Despite trying to avoid it, we still attach per-card `ResizeObserver`s for the “other matches” row so we can measure available width and decide how many chips to show. This undercuts the “no per-row observers” goal and is one of the perf regressions called out below.

### Card layout, chips, and icon polish

- `GridIconBox` learned a `size` prop so tester cards can shrink the slot art to `72px` while other callers keep the old `88px`. The slot glyph font size now scales with `size * 0.59` (minimum `22px`), and the reroll/level badges were repositioned (level badge at bottom-right, reroll badge slightly above it). The keep/sell outcome circle shrank to `16px` and only renders when a rule decided the item, and the reroll badge now matches that `16px` footprint so both overlays feel like icons rather than pills.
- Cards use an `8px` border radius (previously `2px`), and the combination of the new column gap plus the accordion padding keeps edge cards from hitting the group borders.
- Source glyphs grew to `48px` square, matching the new fixed-height column.
- `TesterRuleReferenceChip` exposes `getTesterRuleReferenceLabel` so the keep/sell outcome tooltip can reuse the same formatting (`Cfg # | Rule # | Config name` when present).
- Ascension summary now appears inline with the main stat only when the grid is at `≤ 4` columns. In `5`-column mode the ascension stat moves to its own line to keep text wrapping predictable.
- Match chip behavior:
  - `MAX_MATCHING_CHIPS = 6`
  - Primary chip stays in the “first match” row; the second row only shows entries `matchingCfgIndices[1…]`.
  - We measure the chip row width (minus the `+N` chip when present) and lower the visible limit until the row no longer overflows. Hidden chips stay accessible via a `Popover` that reuses `ContextMenuPaper` and caps its width at `360px` (or `80vw` on small screens).

### Workerized match building

- New helper modules:
  - `src/lib/testerMatchBuilder.ts`: wraps the old `buildRow` logic and exposes `buildTesterPreviewRows({ rules, entries, configNames, configModes })`.
  - `src/hooks/useTesterMatchWorker.ts`: spins up `testerMatchWorker?worker&inline`, keeps an incrementing request id, and provides `computeMatches()` with a fallback to the synchronous builder when `Worker` is unavailable (mostly SSR or tests).
  - `src/workers/testerMatchWorker.ts` and `src/workers/testerMatchWorkerTypes.ts`: define the `build` request/response protocol.
- `App.tsx` now:
  - Imports `useTesterMatchWorker`.
  - Replaces the inline `evaluateMatchesByConfig` calls inside the tester chunk builder with `await matchWorker.computeMatches({ rules: mergedRules, entries: chunk, configNames: names, configModes })`.
  - Tracks `testerRowsBuilding` so UI consumers can suppress invalid states (e.g., “No match” chips) while chunks are in-flight.
  - Handles worker errors by logging to the console, skipping the failed chunk, and still finalizing rows so the UI does not stay stuck in “building”.

### Localization and documentation

- New translation keys added to every catalog (`src/lib/i18n/catalogs/*.ts`):
  - `rulesMenuGridColumns`
  - `rulesMenuShowFirstMatch`
  - `rulesMenuShowOtherMatches`
- `docs/technical/app-behavior.md` now mentions the tester grid context menu and its toggles so future updates remember to keep the doc in sync.
- Constants: `TESTER_GRID_SHOW_FIRST_MATCH_KEY` and `TESTER_GRID_SHOW_OTHER_MATCHES_KEY` live in `src/lib/constants.ts` and should stay versioned if/when defaults change.

## Reported / Observed Problems

- **Virtualization still regresses:** forcing a fixed `cardHeight` helps Accordion redraws, but we still mount a `ResizeObserver` per card (for the other-matches width), so collapsing a large group triggers hundreds of observer callbacks. The virtualization cache also does not flush when the column count changes, which leads to stale heights and “blank space” gaps until the observer fires again.
- **Alignment issues:** the combination of a `72px` icon column, a `112px` stats column, and only `3px` of inter-card spacing leaves almost no breathing room. At `5` columns the summary label, substat block, and ascension line frequently clip or overlap localized text, especially in non-English locales with longer strings.
- **Column toggle state is ephemeral:** unlike the match-row toggles, the `4`/`5` column choice is not persisted. Every reload jumps back to `5` columns even if the user explicitly opted into `4`.
- **Context-menu discoverability:** the new grid menu is mouse-only—keyboard users cannot trigger it, and there is no button in the UI that exposes the same toggles. The hint overlay disappears forever once *any* context menu fires, so users who right-click a group header before discovering the grid menu lose that prompt.
- **Worker chunking lacks backpressure:** we still enqueue `setTimeout(processChunk, 0)` per batch even though `computeMatches` is already asynchronous, so large datasets can issue several overlapping worker requests. Cancellation relies on the stale `buildId` but we do not flush pending responses if the worker returns after `testerRowsBuildIdRef` changes.
- **Outcome tooltip drift:** the keep/sell circle now reuses `getTesterRuleReferenceLabel`, but when a rule lacks a user-facing label we show strings like `#4 | Cfg #3` (“|” includes a leading space). We need to confirm whether that’s final copy or if we should restore the localized “Rule #4 • Config #3” templates.
- **Doc/implementation mismatch:** `docs/technical/app-behavior.md` promises “card height shrinks when the chips are hidden,” but the current card grid still reserves empty space when `showFirstMatch=false` and `testerBuilding=true` because we render `gridRow: '2'` with `height: CARD_MATCH_ROW_HEIGHT_PX` even though the chip is missing.

## Open Questions / Decisions Needed

1. **Keyboard access to the grid menu:** Do we need a visible button (e.g., “Grid options”) for accessibility, or is right-click-only acceptable if the hint reliably teaches it?
2. **Match-row observers:** Can we drop the per-card `ResizeObserver` and accept a simpler heuristic for how many “other matches” chips to show? If not, is there another strategy to avoid the observed redraw stalls?
3. **Outcome circle copy:** Should the tooltip fall back to localized “Keep/Sell” text when no rule label/config name exists, or is the raw `#` formatting desired?
4. **Worker retry policy:** When the worker throws, do we want to surface a toast/error banner or silently log and continue as we do now?

Use this document as the authoritative requirements list when rebuilding the tester grid from commit `19752312…`. Update the file (and `docs/TECHNICAL.md`) if any of the open questions get resolved or if new constraints appear, so future agents can see how the UI is *supposed* to behave without spelunking through broken diffs.
