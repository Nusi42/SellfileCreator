# Gear Diff (sell/keep before-vs-after)

The Gear Diff shows which gear pieces flip between **SELL** and **KEEP** as you change
rules or dynamic overrides — a before/after comparison against a pinned *reference* point,
computed over the whole imported artifact DB.

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
split-view is open, so the diff is a passive, always-available indicator. It matches the
Gear Inspector outcome summary chip's pill/height/tooltip style but uses the **secondary**
tint + a leading compare icon so it reads as a clearly different thing (the diff delta, not
the absolute totals), and shows signed **Sell / Keep / Safeguards** deltas vs the reference.

When the reference itself changes (auto-track re-pin, **Set reference**, or a load), the
`Diff` button runs a brief **shine** — a "reference moved" cue, driven by `useChangePulse`
on the baseline identity (`GEAR_DIFF_REFERENCE_PULSE_MS`).

## The reference (baseline) model

`useGearDiffCompare` (`src/hooks/useGearDiffCompare.ts`) holds the pinned baseline. It is
deliberately **compact** — only the verdict map (for the flip diff) plus the outcome
summary captured **once** at pin time (for the delta). It does **not** retain the preview
rows: the split-view renders the *current* rows with the baseline match swapped in, so the
old rows are never needed, and the header delta is `current summary − stored summary`
(no per-commit re-scan of the unchanged baseline). The "after" side is always the **live
pipeline output** — there is no separate non-committing evaluation.

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
- Turning Auto-track off (or using **Set reference**) fixes one reference so everything —
  overrides and builder edits alike — accumulates against it.

### Suppressed transitions (no spurious diff)

The auto-tracker never pins against an empty row set (before the gear DB loads), and the
baseline is cleared whenever `sfcLoadNonce` (SFC load / autosave restore) or
`gearInspectorPreviewArtifacts` (gear-DB load/push) changes. Inventory changes are not rule
diffs, so a fresh restart, an autosave restore, or a DB push never shows as a diff on its
own; the diff re-arms on the next genuine rule edit.

## Surfaces

Only the inline split-view exists (no modal). `GearDiffSplitView.tsx` renders two reused
`GearInspectorItemsGrid` panes — **baseline verdicts** (before) | **current verdicts**
(after):

- **Same grid, not a fork.** Both panes (and the chip) reuse `GearInspectorItemsGrid` via
  App's `renderGearDiffGrid` closure + the `gearGridSharedProps` memo. The before pane
  renders each changed row with `match = beforeMatch`; the after pane with `afterMatch`.
- **Synced scroll** — `scrollTop` is mirrored between the two panes' scroll containers
  (`[data-gear-inspector-grid-container]`); the panes render the same rows in the same
  order with identical grouping/sort, so positions align.
- **Synced collapse** — both panes share one collapse `Set` + setter (grid props
  `collapsedGroups` / `onCollapsedGroupsChange`), so collapsing a group in one mirrors the
  other.
- **Half-width panes** — the grid rounds (instead of floors) `width / targetWidth` when
  `halfPaneColumns` is set, so each pane shows half the full-grid column count at identical
  card width (no collapse to one over-wide card).
- **Changes-only** — the split-view shows only flipped items; each card conveys its verdict
  through normal sell/keep styling (no extra badge).
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
- **Diff core** — `src/lib/gearDiff/verdictDiff.ts`: `diffVerdicts(before, after)` →
  `{ newlySell, newlyKeep }`, keyed by `gearInspectorItem.itemId` (the same keying as App's
  live `gearInspectorMatchesByItemId`). Unit tests: `tests/unit/gear-diff-verdicts.test.ts`.
- **Delta** — `useGearDiffCompare.delta` is `buildGearInspectorOutcomeSummary(currentRows)`
  minus the baseline summary captured at pin time (one pass over the live rows per commit;
  the baseline side is not re-scanned).

## Performance notes

The diff feature has cost only while a baseline is pinned (auto-track keeps one pinned once
you have rules and gear). It is bounded — a single snapshot, replaced (not accumulated) on
each re-pin, so there is no leak.

- **Compact baseline** — the baseline holds just the verdict `Map` + a 4-number summary, not
  a second copy of the preview rows. The `Map` keeps the small per-row match objects alive,
  not the full rows, so RAM stays near the verdict map even for large DBs.
- **Gated work** — when the split-view is **closed**, only the delta runs (~1 linear pass
  over the gear list per commit, for the chip). The flip diff + row index + joined rows are
  built **only when the view is open** (`active` arg to `useGearDiffCompare`).
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
