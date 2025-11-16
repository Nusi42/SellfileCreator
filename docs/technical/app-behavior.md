# Application Behavior

This document captures runtime behavior, builder interactions, and user-facing workflows.

## Slot Constraints

- Source of truth: `src/lib/types.ts` exports slot constraints as `ALLOWED_MAIN_BY_SLOT` and `ALLOWED_SUB_BY_SLOT` using `StatVariant` constants (no inline bit-math).
- Helpers: `slotSupportsMain`, `slotSupportsSub`, `anySelectedSlotSupportsMain`, `anySelectedSlotSupportsAllSubstats` centralize feasibility checks.
- Builder integration:
  - `hsfBuilder.ts` calls `anySelectedSlotSupportsMain` before emitting rules so mains that cannot exist on the selected slots are skipped.
  - Substat combinations are not pruned by slot in the builder; this is intentional so RSL can still match rules against Any-slot exports while the UI (Rule Tester, warnings) surfaces slot feasibility using the shared helpers.
- Rationale: Keeps domain facts in one place so both builder and UI share the same slot feasibility rules and prevents impossible main stats when slots are restricted.

## Builder Outputs and Normalization

- Builder outputs (HSF):
  - Always include `Rank`, `Rarity`, and `Faction` (0 = Any).
  - Always include `ArtifactSet` and `ArtifactType` (emit `[]` when unfiltered).
  - Emits rules only for milestone levels within an explicit window `[minLevel..maxLevel]` (inclusive). Levels are 0/4/8/12/16.
  - Levels where the selected `minCount` substats cannot physically exist for the item’s rarity (e.g., Epic has only 3 substats before +16) are skipped.
  - `Substats` always contains 4 entries (selected + padded).
- HSFC normalize: `normalizeConfig(input: unknown)` builds a `BuilderConfig` by assembling a base object and conditionally adding optional fields; never assigns `undefined` to optional keys. When `minLevel`/`maxLevel` fields are omitted, the parser defaults the window to `[0..16]` before returning the config.
- Aggregate min target: `minRequiredRolls` always applies across the selected substats in a rule. Use `lockedMinRequiredRolls` to enforce an additional locked-only floor (ignored when no substats are locked). When the locked floor is the only aggregate requirement the builder scopes the aggregate sum to just those locked stats; once any global floor exists, both floors apply — the global sum spans every selected stat while the locked sum only considers the locked subset. Legacy HSFC files that stored `minRollsTarget: 'Locked'` or `substatMinTarget` are upgraded on import by moving the manual aggregate floor into `lockedMinRequiredRolls`; when locked substats exist the importer now drops the manual total so pure locked-only configs stay faithful to their original scope.
- Shared normalisation helpers live in `src/lib/configNormalization.ts`; the builder UI, HSFC IO, and merge path import them so feature rules (keep-mode fallback, auto flex eligibility, rarity supplements, level window guards, etc.) stay consistent everywhere.

## Preview Filters (RulesFilterPanel)

- View-only; export is not affected. State lives in `src/lib/rulesFilter.ts`.
- Shortcut: `Ctrl+F` (`Cmd+F` on macOS) opens the filter panel (when closed) and focuses the config-name input if it is present, mirroring the browser “Find” gesture without reusing the native overlay.
- AnyMode chips: `Show` (state `include`) keeps rules that don't specify a field, `Hide` removes them, `Only` shows only those rules.
- Sets
  - Metasets unroll into explicit set IDs before matching.
  - Match mode `Any`/`All` combines selected sets.
  - Final-sell remainder rows (marked internally) are excluded when any set is selected so results aren’t dominated by “All Currently Known”.
  - The Sets selector reuses `SetMenuSection` (icons/list) with metaset hover highlights and anchored placement consistent with the Builder.
- Config name regex: the optional field only appears when at least one config has a name or the user typed a query. Patterns reuse the builder's styling and accept case-insensitive regex; invalid input highlights the field but leaves other filters intact.
- Config buttons: the filter header always shows two controls. `Preview Configs` (the visibility toggle next to the config-name field) hides chips whose rules fail the active filters; it now defaults to off and `Reset filters` returns it to off. `Config Filter` gates the preview to the selected config chips: in Sellfile mode it’s a simple On/Off toggle, while Rule Tester mode expands it into a tri-state (`Off` → `First-Match` → `Any-Match`) so users can decide whether tester rows require the first matching config or any matching config. When no chips are selected the button still cycles but effectively behaves like `Off`, and `Reset filters` always returns it to `Off`.
- When the preview switches to the Rule Tester grid, the `Rule` section becomes a tester result filter (Keep/Sell vs Matched/No Match) so the grid can be trimmed to only the desired outcomes, and the Any/Only chips for Slot/Rank/Rarity/Level hide because tester items always provide explicit values for those fields.
- Tester level slider: in Rule Tester mode the Level section replaces the milestone toggle grid with a compact dual-handle slider (0–16). The handles preserve the existing layout, persist with the rest of the filter state, and filter tester items by `artifact.exactLevel` when available (falling back to the milestone level when the exact value is missing). The Sellfile preview keeps the original +0/+4/+8/+12/+16 toggle buttons and their Any chip.
- In Rule Tester mode both `Configs` buttons remain visible: `Preview Configs` continues to control chip visibility, while `Config Filter` applies its tri-state filter to the tester rows only (`First-Match` keeps rows whose first matching config is selected; `Any-Match` keeps rows that matched any selected config, even if another config won first). `Reset filters` always turns `Preview Configs` back off and returns `Config Filter` to `Off`.
- Champion filter: when tester rows include gear equipped on champions (imported collections/vaults/inboxes), a searchable multi-select appears next to the Source buttons so the preview can be narrowed to those heroes’ items. Manual/tester-only rows ignore the selector and reappear once the chips are cleared.
- Tester roll filters: the tester view still adds a `Rolls` chip next to Substats, but the popover now mirrors the builder’s roll badges instead of comparators. Users either pick counts in the wildcard row (always scoped to “Any stat”) or configure individual stat rows—interacting with one section clears the other so the predicate stays unambiguous. The wildcard row starts empty (matching the chip’s `≥ 0` state) and only lights up once the user toggles badges; selecting every badge auto-collapses back to “≥ 0” so the chip and panel stay in sync. Each row shows the six roll badges (Ø–5) plus a Clear icon to the right of the badge rail (matching the builder’s substat menu). Per-stat rows enforce their own AND semantics, so they no longer modify the Substats picker or Match chip, and they render every rollable stat—including CR% and CDMG%—so testers can filter those substats directly. Summary text and the chip’s aria-label spell out the chosen sets (e.g., `Any rolls {2,4} • SPD {2,4} & ACC {1}`), and clearing the popover removes the filter entirely. When a user selects `5` rolls the matcher also treats Mythical pre-roll bonuses as the hidden fifth roll (the importer exposes them via `mythValue`), so Mythical four-roll substats still satisfy a `5`-roll requirement.
- Rank & Rarity (compact)
  - Side by side on sm+: Rank adapts to content width; Rarity takes remaining space.
  - Condensed controls only (no More/Less): Rank buttons `1★-3★`, `4★`, `5★`, `6★`; Rarity buttons `C/U`, `Rare`, `Epic`, `Legendary`, `Mythical`.
  - Group buttons have explicit click handlers to toggle their member values reliably in multi-select.
- Faction
  - Placed to the right of `Level` in a two-column row (sm+); grouped menu like the Builder. Input width is fixed to avoid layout shift.
- Spacing
  - Chip top margin is centralized: `FILTER_CHIP_TOP_MARGIN` in `src/lib/constants.ts`.
- Empty state
  - When filters hide all rows but rules exist, the table shows: “No RSL Helper Sellfile rules due to the filter.” (prop `emptyDueToFilter`).

## Autosave Restore Dialog

- Hook: `useAutosaveRestore` compares the stored HSFC payload (metasets, Substat Target Values, configs, Final Sell remainder, pinned note, filter state) against the current defaults. When anything differs and the README overlay isn’t blocking, it opens `RestoreAutosaveDialog`.
- Selective restore: Each section appears with its own checkbox (pre-selected). Applying the autosave only touches the checked sections, so builders can import metasets without overwriting configs, or pull in filters while leaving everything else intact.
- Filters: The dialog can now restore whether the panel was open, its chips, and collapsed sections; those values live alongside the HSFC payload in localStorage.
- Rule Tester gear: Tester autosave (`AUTOSAVE_TESTER_KEY`) is decoded up front and offered as another checkbox. The saved queue only replaces the current tester state when the box is checked; otherwise it stays in storage until selected (or overwritten by a newer autosave).
- Dismissal: Dismissing the dialog keeps the previous autosave in storage and delays builder autosave writes until the current session diverges, preventing accidental overwrites.

## Tuple Decoders (HSF → StatVariant)

- `mainToVariant` and `subToVariant` in `src/lib/types.ts` accept either boolean or 0/1 flags for flat/percent and normalize internally. This fixes flat mainstat filtering for inputs that use boolean flags.

## Builder UI

- Builder cheat sheet: The help icon in `BuilderPanel` opens `BuilderCheatSheetPopover`, a scrollable overlay of curated examples for rarity ranges, substat locking/flex, roll targets, and milestone math. The popover reuses the Builder root via `ResizeObserver` so its max height tracks the panel height (capped to 60% of the viewport) and keeps scroll momentum predictable.
- Shared substat toggles: `SubstatToggleDisplay` renders the lock badge, wildcard/min/max indicator, and alignment grid for both the live builder toggles and the cheat sheet snapshots. `substatToggleGroupSx` centralizes the spacing/hover behavior so static rows stay visually identical while interaction hooks remain active only inside the builder.
- Min Required Rolls behavior:
  - Auto, the numeric Global Min Required Rolls (GMRR) buttons, and the Locked Min Required Rolls (LMRR) lock overlay now share one reducer. Auto clears both GMRR and LMR. Clicking a numeric button sets that exact GMRR; clicking it again reverts to Auto and clears any lock.
  - Only one lock can exist. Locking a value greater than or equal to the current GMRR clears the GMRR (while keeping Auto off). Locking a lower value preserves the highlighted number. Unlocking re-highlights the locked number whenever that lock was the only active target.
  - Selecting a numeric value below the current lock clears the lock automatically. Selecting Auto or toggling the last numeric button always clears the lock as well.
  - HSFC imports/pastes normalize to these rules (0–5 only, at most one lock, GMRR strictly greater than the lock when both are present).
- `Reset Config` button:
  - Left-click: shows a localized confirmation dialog (`builderResetConfirmTitle`) and, when confirmed, resets to user defaults when present; otherwise resets to factory defaults. Buttons reuse shared `cancel`/`reset` catalog entries.
- Right-click (also available on `Insert as config` and `Apply as config`): opens a shared menu with Save local settings as user defaults, Reset to factory defaults, and toggle checkboxes.
  - User defaults are stored under `sellfileCreator.builder.userDefaults.v1`.
  - Auto reset after Insert: when enabled (default Off), the builder resets to defaults immediately after inserting a config (no confirmation dialog). State persists under `sellfileCreator.builder.autoResetAfterInsert.v1`. The toggle disables Auto apply when turned on.
  - Auto apply to selected config: when enabled (default Off), builder edits are applied to the current config automatically after ~400 ms of inactivity, and pending changes flush before switching configs. Preference key `sellfileCreator.builder.autoApplySelectedConfig.v1`. Enabling this toggle clears Auto reset so the behaviors remain mutually exclusive.
- Numeric spinner adornment: `NumberSpinnerAdornment` (`src/components/NumberSpinnerAdornment.tsx`) is the shared inline spinner used by Builder Roll Targets, the Substat Target Values dialog, and the Rule Tester dialog. It traps mouse down events to avoid blurring the active input and keeps the +/- hit targets identical across surfaces so accessibility and pointer behavior stay in sync.
- Config name editing keeps a local draft (`BuilderPanel`). Typing updates the draft only; the underlying `BuilderConfig.name` is updated on blur, on "Add as new/Insert after" and on "Save changes". This prevents in-progress edits from mutating chips/preview while still marking the builder dirty so the save CTA and nudges stay active. Clearing the name routes through the same commit helper.
- Undo/redo history: `useHsfcHistory` stores compressed snapshots that include both the HSFC payload and the live builder UI state (selection arrays, builder draft, multi-edit draft). Snapshots are keyed by a CRC of the HSFC-only signature so UI-only edits refresh the current entry instead of crowding the timeline. Controllers use `describeNextChange(descriptor | null)` to label the next entry, `captureSnapshotNow(descriptor)` to force an immediate append (e.g., before dropping a dirty draft on selection change), `resetHistory(..., { descriptor })` to seed the base entry, and `undoPreview`/`redoPreview` for tooltip metadata without decompressing snapshots.
- Undo/redo tooltips: `BuilderPanel` feeds those previews through `formatHistoryTooltipText` to render the descriptor title plus bullet-prefixed detail lines. When no descriptor is provided the tooltip falls back to the existing i18n copy (which still includes the localized shortcut hint) so localization coverage remains intact.
- Rule count chip: When the selected builder draft doesn't match a cached count, `BuilderPanel` asks the rule cache worker for totals via the `builderCount` message. The worker sums each config with `countRulesForConfigs()` and returns the per-config counts so the UI only adds them up on the main thread. The hook aborts stale requests and falls back to synchronous counting when Web Workers are unavailable (tests/SSR).
  - Extremely broad configs can explode into millions of permutations; counting stops once emission exceeds `RULE_COUNT_LIMIT` (~50k) so the UI stays responsive. When the limit trips the chip shows `≥ 50,000 rules` (localized) instead of blocking on an unbounded calculation.
  - Sellfile preview applies a global `TOTAL_RULE_COUNT_LIMIT` (150k) to the combined base HSF and custom builder output. When the cap is hit the offending configs are omitted from the preview/export (rule chips switch to `≥ 150,000`), while Final Sell remainder rows continue to render so the toggle always reflects user intent.
- Rule cache fast paths:
  - **Pure reorder / delete:** moving configs (drag, move up/down/top/bottom, “Paste after”) or deleting them no longer enqueues a warm-cache job. The cached rule batches are remapped in place (`__cfgIdx` annotations are updated) and the merged preview array is rebuilt from the cached base/custom/final-sell segments.
  - **Final Sell toggles:** flipping Final Sell options rebuilds only the final-sell tail locally. Base HSF rules and the cached custom batches remain intact; the worker is bypassed unless the underlying configs change.
  - **Worker still required:** inserting configs or applying the builder to multiple rows continues to flow through the worker. Earlier attempts to splice new batches locally regressed total-limit enforcement and metaset expansion, so the worker remains authoritative for those paths.
  - **Open issues:** the React dev warning _“Cannot update a component (App) while rendering a different component (AppStateProvider)”_ still fires when selection churn is heavy; the selection reducer still issues updates during render and needs a dedicated cleanup. Long lists also trigger `[Violation] Forced reflow` due to table virtualization—`HsfRulesTable` still requires follow-up profiling.

## Keep Uniques

### Final Sell dialog integration

- `FinalSellDialog` is now tabbed: `Final Sell` retains the legacy layout, while `Keep Uniques` renders the tuple editor plus mirrored tester grid inside the same shell dimensions (`min(960px, 100vw - 32px)` × `min(800px, 100vh - 48px)`).
- The active tab is tracked via `finalSellDialogTab` so autosave, clipboard, and undo/redo restore whichever side the user left open; new sessions default to `Final Sell`.
- Keep Uniques exposes its own Reset button. It clears the tuple list and disables the feature without touching Final Sell settings, so the two tabs never stomp each other’s defaults.

### Rule editing and detection

- The feature is opt-in: the top-level switch mirrors `keepUniquesEnabled` and gates both tuple editing and detection. When off, detection state is cleared and an info alert explains that scans only run while the toggle is enabled.
- Rules live in the left column. The list uses the shared Gear selectors (`GearSlotSelect`, rank/rarity dropdowns, `GearMainStatSelect`, `GearFactionSelect`) so slot-specific stat options, rarity labels, and localization stay in sync with the builder dialog.
- Accessory slots automatically constrain set pools and show the faction selector; armor slots hide faction and reuse the curated set picker.
- Editing any field updates the builder store immediately. The `≥ required count` input clamps at `1+`, and each card exposes Enable/Disable plus Delete actions.
- The empty state promotes the `Add rule` CTA. Clicking it clones a tuple seeded from the slot’s default main stat and set pool; additional clicks append new entries and focus them for editing.
- Detection ( `computeKeepUniqueProtection` ) only runs when tester preview rows are present, not building, and the match-freeze gate is released. While a scan is pending the tab shows the warning alert; once complete, chips on each rule summarize coverage, deficits, or “covered by existing keep rules.”
- Alerts are contextual: disabled toggle, no tester rows loaded, scan pending, all protected, or `N` deficits.
- The Keep Uniques grid only renders tester rows that qualify as “unique”: we group artifacts by slot + set + main stat + faction (armor treats faction as “Any”), replay the active HSF rules with Keep Unique tuples removed, and keep the group in view only when every artifact in that group would be sold under that trimmed ruleset. This makes the right-hand grid surface the at-risk combinations that still need protection rules.

### Tester grid mirroring

- The right column renders `TesterItemsGrid` with `variant="keepUniques"`, which enforces two-column cards, hides the column toggle inside the context menu, and keeps source glyph behavior identical to the Rule Tester.
- Selecting a rule highlights the corresponding detection rows: the grid receives a predicate plus `dimUnhighlightedRows`, so matching cards stay vivid while non-matching entries fade without mutating the dataset.
- Stat color controls, color-blind mode toggles, and the Manage Colors dialog are shared with the Rule Tester so palette tweaks stay synchronized across tabs.
- Jump-to-config wiring (`onJumpToRule`) mirrors the Rule Tester: clicking a matching-config chip in the grid still focuses the builder rule, even while the Keep Uniques tab is active.

## Production-only Restrictions

- Native context menu and text selection are disabled globally in production builds to reduce accidental edits and copy noise. App context menus continue to work (native menu is prevented, propagation allowed).
- Allowed surfaces: Inputs, textareas, contenteditable nodes, and any element marked with `data-allow-select` / `data-allow-context`.
- Dev builds are unaffected; full selection and native context menu are available for debugging.

## File:// Launch Caveats

- If contributors open `index.html` directly from the filesystem (`file://`), expect limited or non-persistent storage in many browsers. LocalStorage writes used by autosave, color preferences, and table settings may not persist. Prefer `npm run dev` or `npm run preview` to serve over HTTP for reliable persistence.

## Clipboard and Context Menus

- The chip area always renders (min height) and exposes a context menu with “Select All”, “Copy all Configs”, and “Paste at End”. When empty, a centered hint invites right-click Paste.
- Chip context menu includes: Duplicate, Paste after, Move to Top/Up/Down/Bottom, Copy to Clipboard, Delete.
- Copy All uses `buildHsfcPayload` to copy the HSFC object (`Version`, `Metasets`, `Minima`/Substat Target Values, `Configs`, `FinalSellRemainder`, `SelectedConfigIndex`, and optional `Note`) so pastes preserve state.
- Paste accepts: single `BuilderConfig`, array of configs, or a full HSFC object in the readable schema. Legacy forms are not normalized.
- Clipboard fallback: in non-secure contexts (not HTTPS/localhost), programmatic clipboard is blocked, so the app opens a dialog with pre-selected text for manual copy/paste.

## Save/Load Guarantees

- Saver writes `{ Version, Metasets, Minima, Configs, FinalSellRemainder, SelectedConfigIndex? }` (via `buildHsfcPayload`) and downloads `*.hsfc`. When no config is explicitly selected, the last config index is saved by convention so loaders can preserve intent.
- Loader (`readHsfcFile`) accepts the readable HSFC schema and preserves `substatRollBounds.any`, `min`, and `max` (clamped to valid ranges; `min` 0..5, `max` 0..4). Legacy HSFC shapes are not supported.
- Copy All mirrors the saver payload (including `SelectedConfigIndex`) to enable full round-trip via copy/paste.
- Sellfile export context menu: right-click `Export RSL Helper Sellfile` to open advanced options. `Export deduped RSL Helper Sellfile` runs a one-off dedupe pass that merges identical keep rules and removes dominated variants. `Export deduped by default` persists the behavior (key `sellfileCreator.sellfile.dedupDefault.v1`); when enabled, both downloads and push exports write the deduped payload. `Omit disabled rules when exporting` drops rules whose `Use` flag is `false` from downloads and push exports, and persists via `sellfileCreator.sellfile.omitDisabled.v1`.

## Behavioral Details

- Min vs Roll Upper Limit exclusivity: The builder now enforces mutual exclusivity; toggling one clears the other. HSFC persists only the active choice (`min`, `max`, or `any`).
- Roll Upper Limit enforcement: Rule generation filters distributions that exceed a per-substat `max`. A `max = 0` enforces “no rolls” on that substat.
- Auto resolution: Auto now keys strictly off `min ≥ 1` across selected substats; star and the Roll Upper Limit are ignored for Auto.
- Rank Any uses 6★ baseline: When `rankCode = 0` (Any), base substat targets map to the 6★ bucket for threshold generation (conservative default).
- Rarity ranges (≥): Conservative lower-bound behavior. `rollLevelsForRarityCode` maps `≥ Common..≥ Epic (6..9)` to the lower bound’s schedule (Common/Uncommon/Rare/Epic), and `≥ Legendary (16)` to Legendary. `rarityIncludesMythical` no longer assumes Mythical for any `≥` range; only exact Mythical (15) and `≤ Mythical (14)` imply the Mythical pre-roll.
- Any rarity baseline check: For the “how many substats exist” feasibility pass, `Any` is treated like `≥ Legendary` (no additions). Mythical pre-roll is still not assumed unless Σ mins or aggregate min equals 5.
- Rarity label parsing: HSFC normalize accepts human-readable `Rarity` strings (e.g. `"≥ Epic"`, `"Legendary"`, `"Any"`) and maps them to canonical codes. Numeric `rarityCode` is also accepted; `rarityExact` is no longer supported.
- Metaset name resolution on paste: `parseConfigsFromText(text, metasets)` resolves `artifactMetaSetNames` against the caller-provided current metasets. For full HSFC objects, `parseHsfcObject` resolves names against embedded `Metasets`; if absent, falls back to the app’s current metasets (`prev.metasets`). No default metasets are injected implicitly.
- Per-config pruning: Obsolete elimination now runs per config before merging, so preview table counts match the builder’s chip count. Cross-config overlaps remain visible for auditability.
- Obsolete comparator: Compares substats by the same StatVariant and raw Value for the same operator (no normalization to rolls). Tie-break prefers earlier rule indices within a config when values are equal.

## File Import UX

- Global drop target: The entire app window accepts file drops. Local dropzones were removed to reduce friction. Implemented via `useFileDragDrop` + `FileDragOverlay`.
- Overlay on file drag: A full-screen, non-interactive overlay appears on real file drags, indicating that `.hsfc` (configs + metasets), `.hsf` (sellfile), and `.db` (gear database) are accepted. Overlay uses `pointer-events: none` so it never blocks the actual drop.
- Routing by extension: Drops are dispatched by filename extension — `.hsfc` → HSFC loader (`readHsfcFile`), `.hsf` → HSF loader (`readHsfFile`), `.db` → gear importer (`importGearDatabaseFromFile`). Unknown extensions trigger the shared “file format” dialog so users know the payload was rejected.
- Load triggers: The `Load RSL Helper Sellfile` button follows the same flow as drag & drop, so it accepts `.hsf` for base merges and `.db` gear dumps for the Rule Tester.
- Error handling: Invalid or unreadable files (any of the accepted extensions) route through a single error dialog that spells out the supported formats so failures never disappear silently.
- Safety: Only intercept drags when `DataTransfer.types` includes `Files`; component drags (e.g., table column reorder) are unaffected.
- Load semantics:
  - `.hsfc`: Load/drag replaces the entire state (metasets, substatTargets, configs, final-sell, selection, note). No conflict merging on file load.
  - `.hsf`: Only the optional base Sellfile is replaced; builder configs remain untouched so merges stay deterministic.
  - `.db`: Gear rows are queued into the Rule Tester queue (and the preview auto-switches to the tester grid) without forcing the modal Rule Tester dialog open or mutating builder/export state. Manual/custom tester entries are left untouched so ad-hoc examples survive repeated imports regardless of whether the DB came from drag & drop, the picker, or the CLI command. Invalid DBs surface the same file-format dialog mentioned above.
    - The SQL.js WASM bundle is baked into the release as a data URI (`__SQL_JS_WASM_INLINE__`) so this workflow keeps working even when contributors open `dist/index.html` via `file://` with no dev server.

## HSFC Global Note

- Schema: HSFC may include an optional root-level `Note: string` with Markdown content.
- Load: When an HSFC with `Note` is loaded, a modal dialog opens automatically (view-only). The dialog can also be opened via the always-visible “Add/Edit Note” button in the HSFC controls row.
- Close: The dialog schedules its dismissal on the next animation frame; if a new note opens immediately after a close request (common during HSFC imports), the pending close is cancelled so the modal overlay never lingers.
- Edit: The dialog uses an embedded Markdown editor (`@uiw/react-md-editor`) with sanitized previews (`rehype-sanitize`). The editor lives in `src/components/NoteDialog.tsx`.
- Save/Copy: If a Note exists (non-empty), HSFC exports and “Copy all Configs” include it.
- Paste semantics: Pasting HSFC content (via context menu or manual paste) only overwrites the current note if the current note is empty. Loading a file always overwrites the current note.
- Metaset conflicts on paste (Copy/Paste only): identical value (same sets) keeps current ID and remaps pasted references. If the same ID has different sets, a single dialog offers: Keep current, Use pasted, or Keep both (new ID for pasted). Unknown pasted metaset IDs create hidden placeholders with generated names so chips never show raw IDs.
- Dependencies: `@uiw/react-md-editor`, `@uiw/react-markdown-preview`, and `rehype-sanitize`.

## Rule Tester

- Purpose: Create example gear and evaluate which rule (if any) would match first under “first match wins”. Helps verify merged vs base behavior quickly without exporting. Drag and drop the RSL Helper DB (usually under `%APPDATA%\RslHelper\Config`) directly into the dialog to import live gear.
- Surfaces: The Sellfile Preview header exposes two related controls:
- `Rule Tester` preview toggle — switches the main preview between the default HSF rule rows and the tester gear grid (this toggle is what “Rule Tester mode” refers to).
- The tester grid groups artifacts by set, while accessories first group by faction and render a nested accordion per set inside each faction. Each card dedicates three columns to the schematic preview (slot glyph + set badge + overlays), the main/substat stack, and the matching-config summary (keep/sell glyph, primary rule/config chip, plus additional matching configs capped with a `+N` chip). Virtualization runs at both the group and card level so collapsed groups skip rendering and large inventories stay responsive.
- Right-click anywhere inside the tester grid scroll container opens the grid context menu (hinted via `useContextMenuHint('testerGridContextMenu')`). The menu mirrors the preview header controls: toggle stat-color text + Manage Colors, cycle the color-blind palette, flip between `4`/`5` column layouts (default `5` at ≥ `sm`, and the button text simply shows the active number), show/hide the first-match and other-match rows, and optionally display champion portraits for vault/collection gear. These preferences persist through `src/state/testerGridPreferences.ts`, so grid layout changes (including the champ-icon toggle) survive reloads.
- Champion portraits: when a tester row references a champion (imported collection or vault gear) and the “Show champion icons” preference is enabled, the card swaps the slot glyph for the champion image. Collection items show only the portrait, while vault items add the vault glyph to the right of the portrait, aligned under the gear’s level badge. If no known portrait exists (or the preference is off) the card reverts to the original slot glyph + source icon combo so the grid never loses the origin indicator.
- Fresh sessions start empty — no sample gear is auto-added. Import RSL Helper DB dumps, paste gear, or add custom items via the dialog to populate the grid.
- Ctrl/Cmd+clicking a top-level accordion header (artifact set or faction) collapses/expands every group at once, while the same gesture on a faction’s set accordion only affects that faction’s sets. A normal click still toggles just the targeted accordion.
- `Gear...` button — opens the Rule Tester dialog where gear can be edited, pasted, or imported; edits are reflected immediately in the preview toggle mode.
- The Gear dialog only renders custom tester gear; imported inventory/equipped/inbox rows stay visible in the preview and can be batch-deleted per-source via the new toolbar buttons. A persistent `Add custom gear` action lives in the dialog footer so users can rebuild lists from an empty state.
- Preview toggle persistence: The Sellfile Preview / Rule Tester mode toggle saves its last selection to `localStorage` (defaulting to Sellfile Preview) so reloading the app restores the same table.
- Tester cards surface everything inline: slot glyph + rarity-bordered frame with `8px` corners, overlapping rank/ascension stars, 16px keep/sell + reroll glyphs, level badges, set badge tooltip (includes the set bonus stats), main stat + ascension rendered inline in 4-column mode (the ascension line drops below the main stat in the tighter 5-column layout), substats with glyph deltas/roll badges and Mythical underline, the matching rule/config chip (button jumps to the builder rule), and a single-line row of additional matching configs capped with a `+N` chip. Source/faction info remains below the icon stack, matching the Sellfile preview cues, and leaf accordions add padding so edge cards do not clip the borders.
- The row below the icon stack now renders source glyph chips instead of text so the inventory/vault/collection distinction is clearer. Manual entries use the build glyph, collection rows use `PersonOutline`, the vault glyph reuses the inventory icon, inbox items keep `MailOutline`, and inventory entries render the tooltip/aria label without a glyph. The Source chip line is driven by `src/lib/testerPreviewFormatting.ts` + `SOURCE_ICON_MAP` in `src/components/TesterItemsGrid.tsx`, and the tooltips still show translated labels for screen readers.
- Preview sorting: Tester cards sort armor pieces before accessories, then by set (in-game numeric order), slot (`compareArtifactTypes`), rank (6★→1★), rarity (Mythical→Common), and ascension tier (highest first) so custom gear stays grouped predictably with game metadata.
- Rules source: Evaluates against the effective rules array provided by the preview (merged base + custom when present). Disabled rules never match.
- Evaluator: `src/lib/ruleEval.ts` exposes `evaluateFirst(rules, item)` (pure). Uses shared rank/rarity coverage helpers from `src/lib/hsfTypes.ts`.
- Autosave: Session persists under `AUTOSAVE_TESTER_KEY`, stores the gear list as a gzip/base64 payload (plus a saved timestamp), and is offered as an optional checkbox inside the global Restore dialog. The queue only replaces the current tester state when the user selects the checkbox; otherwise the saved copy remains in storage until they opt in or overwrite it with a newer autosave. Autosave activates automatically once the tester gear deviates from the initial baseline (imports, restores, edits) and stays active even if the Gear dialog is closed; opening the dialog also primes autosave immediately.
- State ownership: `App.tsx` holds the tester gear list via the helpers in `src/lib/ruleTesterSession.ts`; the dialog receives `[items, setItems]` plus the shared row-id allocator so edits flow directly into the preview without extra effects.
- Tester item shape (readable summary):
  - Slot (`ArtifactTypeId`), Set (`ArtifactSetId`), Rank (`1..6`), Rarity (`1..6` Common..Mythical), Level (`LevelMilestone` entries 0/4/8/12/16), Faction (`FactionId` for accessories), Main (`StatVariant`), Substats as absolute values (variant→value) preserving user order.
- The count of available substats derives from rarity and level; values clamp to per-rank substat targets from the shared `SubstatTargetTable`. Substats equal to the selected main or not allowed by slot are filtered out. Missing substats are auto-filled from allowed candidates up to that availability count.
- Sentinel IDs: `ACCESSORY_NO_SET_ID = -99` means “None — Only accessories” and is shared by the Rule Tester and Final Sell remainder; `TESTER_ANY_SLOT_ID = 0` means “Any slot” and only matches rules that do not restrict slots.
- Sets dropdown: each tester row owns its menu state (`setsMenuOpenIdx`); only the active row’s `Select` is forced open, and the menu anchor is cleared on the next animation frame after close. This keeps armor/accessory filtering intact, closes immediately after choosing a set (including the accessory “No set” sentinel), and prevents the anchored menu from jumping horizontally when reopening the selector.
- Compact summary chips always render accessory faction icons with a tooltip so the tester snapshot mirrors the Sellfile Preview; the global “Factions as icons” preference does not hide them.
- The combined rule/config chip displays the config faction icon (when set) under the same preference, matching the Sellfile Preview header behavior.
- Constants: Layout sizing is centralized in `src/lib/constants.ts` (`TESTER_*` widths and heights, result row minimum height) to keep the dialog compact and stable across locales.
