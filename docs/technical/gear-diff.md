# Gear Diff (verdict before-vs-after)

The Gear Diff shows which gear pieces change verdict as you change rules or dynamic
overrides — a before/after comparison against a pinned *reference* point, computed over the
whole imported artifact DB. A "change" spans the full **tri-state** verdict (**SELL** ↔
**KEEP** ↔ **SAFEGUARD**), so a piece a rule was keeping that is now only held by a safeguard
counts too — both end up kept, but seeing *why* it flipped is the point.

## Entry point

A **`Diff`** toggle sits in the preview header (`PreviewHeaderActions.tsx`), to the right
of the sort cluster. It is enabled only in Gear Inspector preview mode.

- **Left-click** only shows/hides the inline before/after split-view. It does **not** pin
  or clear the reference, so toggling the view never disturbs the comparison.
- **Right-click** opens a context menu (same pattern as the filter/sort buttons):
  - **Set reference** — pins the current resolved state as the comparison point.
  - **Auto-track reference** — keeps moving the reference to your latest builder edit
    (default on).

A **delta chip** (`GearDiffDeltaChip.tsx`) renders to the right of the `Diff` button
whenever a meaningful diff exists (any non-zero metric) — independent of whether the
split-view is open, so the diff is a passive, always-available indicator. It mirrors the
Gear Inspector outcome summary chip's pill/height/tooltip style but fills with a muted
**slate blue-grey** (`#5b6b8c`) instead of the outcome chip's info-blue, so the two read as
different things — slate sits in an unused gap of the colourblind-friendly palette (blue =
info, orange = sell, green = keep, amber = safeguards) and never collides with a verdict
colour. It shows signed **Sell / Keep / Safeguards** deltas vs the reference.

When the reference changes (auto-track re-pin, **Set reference**, opening the Note dialog, or
a load), a highlighted arc **chases once around the `Diff` button's border** (~1s) as a
"reference moved" cue — `useChangePulse` on the baseline identity toggles a masked
conic-gradient ring whose angle (`--gd-ref-angle`, registered in `styles.css`) rotates.

## The reference (baseline) model

`useGearDiffCompare` (`src/hooks/useGearDiffCompare.ts`) holds the pinned baseline. It stays
**compact** — the verdict map is the only thing the diff *logic* reads. It does **not**
retain the preview rows (the split-view renders the *current* rows with the baseline match
swapped in) nor a stored summary: both the flip diff and the header delta are computed over
the **intersection** of the baseline map and the live verdicts (one pass over the live map,
O(1) baseline lookups). The "after" side is always the **live pipeline output** — there is
no separate non-committing evaluation.

Alongside the verdict map the baseline also freezes two **display-only** overlays captured at
pin time — the safeguard **rank** map (`SafeguardRankByArtifactId`) and the **improvement
chance** map — so the *before* pane can render the pinned-state rank chips and improvement
chances instead of the live ones. These play **no part in deciding what counts as changed**:
the changed-set is still purely the tri-state verdict flip. A rank or chance that shifts
without a verdict flip does **not** make an item appear in the diff; it only shows as extra
before→after detail on items that *already* flipped. Both maps are keyed by artifact id and
declared far below the hook call in `App.tsx`, so they reach the hook as **refs**
(`gearDiffRankRef` / `gearDiffImprovementRef`, populated in an effect) that pinning reads —
not as reactive props. `pinBaselineFromRows` shallow-copies each live map (`new Map(...)`)
because the rank map is context-aware (re-created on safeguard-selection changes) and the
values must be frozen as-pinned.

**Auto-track** re-pins the baseline on each change of the rule-state signature
(`currentEntrySignature.crc` from `useSfcHistory`). The signature serializes recipes,
safeguards, metasets, substat targets, final-sell, and the note text — but **not** the Note
dialog's dynamic-override answers (those are session-only). This produces a deliberate,
documented asymmetry, surfaced in the `Diff` tooltip:

- **Builder recipe/safeguard edits** change the signature → auto-track re-pins → the diff
  shows just that edit's effect.
- **Toggling Dynamic Overrides** (Note dialog) does **not** change the signature → the
  reference stays put → successive override changes **accumulate**, so the diff shows the
  combined effect of all override choices, not just the last one.
- **Explicitly opening the Note dialog** (`openNoteViewerManual`, i.e. the user clicks to
  open it — not the auto-open from loading an SFC/preset) pins a **fresh reference** at that
  moment, so override tuning in the dialog diffs against the state when it was opened. The
  auto-open path (`openNoteViewer` from a load) does not re-pin, keeping the pre-load
  reference instead.
- Turning Auto-track off (or using **Set reference**) fixes one reference so everything —
  overrides and builder edits alike — accumulates against it.

### No spurious diff from loads / inventory

Two guards keep startup and inventory changes from looking like a diff:

- The auto-tracker never pins against an **empty row set** (before the gear DB loads), nor
  on a transition **out of an empty setup** (e.g. your first SFC load — `gearDiffPrevRulesEmptyRef`).
  So a fresh restart / autosave restore produces no diff; the diff arms on the next edit.
- The diff is computed over the **intersection** of the baseline and live verdict maps (both
  `diffVerdicts` and the delta). A gear-DB **load/push** changes inventory, not rules, so
  added/removed items are never counted — the diff stays empty for a pure inventory change,
  and **an active reference is left untouched** (a push does not clear or re-pin it).

## Surfaces

Only the inline split-view exists (no modal). `GearDiffSplitView.tsx` renders two reused
`GearInspectorItemsGrid` panes — **baseline verdicts** (before) | **current verdicts**
(after):

- **Same grid, not a fork.** Both panes (and the chip) reuse `GearInspectorItemsGrid` via
  App's `renderGearDiffGrid` closure + the `gearGridSharedProps` memo. The before pane
  renders each changed row with `match = beforeMatch`; the after pane with `afterMatch`.
- **Per-pane rank / improvement overlays.** The card already draws its safeguard **rank chip**
  and **improvement chance** from the `safeguardRankByArtifactId` / `improvementChanceByArtifactId`
  grid props (looked up by artifact id). `gearGridSharedProps` carries the **live** maps, so
  the *after* pane shows current ranks/chances for free. The *before* pane passes
  `useBaselineMaps: true` (from `GearDiffSplitView`), and `renderGearDiffGrid` then spreads the
  **baseline** maps (`gearDiffCompare.baselineRankByArtifactId` /
  `baselineImprovementByArtifactId`) *after* `gearGridSharedProps` so they win — falling back to
  the live maps when nothing was captured (e.g. pinned before any safeguard ranks existed). No
  card code changes and no forked rank-chip rendering: the same component renders both sides,
  each fed its own map.
- **Synced scroll** — `scrollTop` is mirrored between the two panes' scroll containers
  (`[data-gear-inspector-grid-container]`); the panes render the same rows in the same
  order with identical grouping/sort, so positions align.
- **Synced collapse** — both panes share one collapse `Set` + setter (grid props
  `collapsedGroups` / `onCollapsedGroupsChange`), so collapsing a group in one mirrors the
  other.
- **Half-width panes** — the grid rounds (instead of floors) `width / targetWidth` when
  `halfPaneColumns` is set, so each pane shows half the full-grid column count at identical
  card width (no collapse to one over-wide card).
- **Changes-only** — the split-view shows only items whose tri-state verdict changed; each
  card conveys its verdict through normal styling (no extra badge). There are **no
  directional buckets** — the changed items are one flat list, sorted/grouped/filtered by the
  normal Gear Inspector controls (the diff is just an extra "only changed" filter on top).
- **Per-group deltas** — in the **after** pane (`showGroupDeltas` grid prop) each accordion
  header swaps its absolute outcome chip for that group's **before→after delta**
  (`GearDiffDeltaChip`), built by `buildGroupDiffDeltaMap` from the group's DiffRows
  (summarise the beforeMatch and afterMatch sides, subtract). The **before** pane keeps the
  normal absolute chip (showing that group's baseline counts), so the two headers read as
  "what it was" → "what changed".
- **Selection** — gear selection works in diff mode when a push endpoint is connected. Both
  panes share one selection set + handler, so selecting on either side reflects on the other.

## Filters

The active Gear Inspector filter applies in diff mode via `gearDiffFilteredRows` (App): an
item shows in **both** panes when the filter matches **either** its baseline **or** its
current verdict (OR semantics), so a piece that filters in on only one side still shows the
other side for comparison. **Scope** (the `matched` result mode, which drives
context/companion grouping) is neutralized for the diff — `gearDiffFilteredRows` clears
`matched` so the diff stays a plain filter.

## SSOT primitives

- **Verdict predicate** — `isMatchSold` / `isMatchKept` in `src/lib/gearInspectorVerdict.ts`
  (sold iff `match?.keep === false`; `null` match counts as kept). Reused by the outcome
  summary and the diff.
- **Tri-state verdict** — `resolveVerdictTriState(match)` in `gearInspectorVerdict.ts` →
  `'sold' | 'safeguarded' | 'kept'` (built on `isMatchSold` / `isMatchKeptBySafeguard`, both
  reused by the outcome summary and the diff delta). Single definition of "what state is this
  piece in".
- **Diff core** — `src/lib/gearDiff/verdictDiff.ts`: `diffVerdicts(before, after)` → a flat
  list of items whose tri-state verdict differs, keyed by `gearInspectorItem.itemId` (same keying as App's
  live `gearInspectorMatchesByItemId`). Unit tests: `tests/unit/gear-diff-verdicts.test.ts`.
- **Delta** — `useGearDiffCompare.delta` counts sold / safeguard-kept on each side over the
  **intersection** of the baseline and live verdict maps (one pass over the live map), so a
  gear-DB push adding/removing items never shifts it — only rule-driven flips do.
- **Rank overlay shape** — `SafeguardRankByArtifactId` / `SafeguardRankOverlayEntry` (and its
  `SafeguardRankRuleEntry` / `SafeguardRankOtherRuleEntry` parts) in `src/lib/safeguards.ts`.
  One exported definition of the artifact-id→rank overlay, imported by the App memo that
  builds it, the `GearInspectorItemsGrid` prop that renders it, and the gear-diff baseline
  that freezes it — so the three cannot drift.

## Performance notes

The diff feature has cost only while a baseline is pinned (auto-track keeps one pinned once
you have rules and gear). It is bounded — a single snapshot, replaced (not accumulated) on
each re-pin, so there is no leak.

- **Compact baseline** — the baseline holds the verdict `Map` (no preview-rows copy, no
  stored summary) plus shallow copies of the rank + improvement-chance maps. The verdict `Map`
  keeps the small per-row match objects alive, not the full rows; the two overlay copies are
  shallow (they alias the same per-artifact entry objects the live maps hold), so RAM stays
  bounded and near the source maps even for large DBs. All three are replaced (not
  accumulated) on each re-pin.
- **Gated work** — when the split-view is **closed**, only the delta runs (~1 linear pass
  over the gear list per commit, for the chip). The flip diff + row index + joined rows are
  built **only when the view is open** (`active` arg to `useGearDiffCompare`).
- **Steady during rebuilds** — an edit re-pins the baseline immediately (dropping the live
  delta to 0) but the new verdicts only land when the worker commits. App snapshots the diff
  at each verdicts commit (setState-in-render) and shows that frozen value while a rebuild is
  pending (`gearDiffDisplayDelta` / `gearDiffDisplayRows`), so the chip and split-view list
  don't flash empty mid-edit. Set reference / override toggles don't change the signature, so
  they update immediately.
- **Cache-hit indicator** — the rebuilding/progress indicator is set only on a pipeline
  cache **miss** (the cache lookup was hoisted above the indicator toggles in
  `launchPipeline`), so undo/redo revisits that hit the cache no longer flash the
  worker/progress UI.
- **Slider commit** — the Note safeguard-override slider (`NoteOverridesSlider` in
  `NoteDialog.tsx`) follows the drag with local visual state and commits its answer only on
  release (`onChangeCommitted`). One drag triggers one answer update + pipeline run (hence
  one diff recompute) instead of one per tick.

## i18n

Keys are prefixed `gearDiff*` (see `en-US.ts`), localized across all production languages.
The `Diff` tooltip (`gearDiffToggleTooltip`) carries the reference-model details above.

## Tests

- Unit: `tests/unit/gear-diff-verdicts.test.ts` (diff core).
- E2E: `tests/playwright/gear-diff.spec.ts` (toggle opens the split-view, empty state,
  restores on exit).

## Follow-ups (not implemented)

- A note-dialog `>>` affordance that opens the split-view while tuning overrides in place
  (auto mode covers SFC-load comparisons today). Intentionally dropped for now.
