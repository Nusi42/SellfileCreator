# Technical Details

The technical reference is now split across focused documents. Start here, then dive into the section you need:

## Coding Standards

- Keep inline documentation dense and helpful—when implementing or revising code, aim for a concise intent-focused comment roughly every 2–3 lines.
- Enforce the Single Source of Truth / One Definition Rule without exception: centralize each constant, helper, and schema definition once, then import it everywhere else.
- Watch file size creep; split modules or move helpers into shared files before they cross roughly 1,500 lines so reviews stay manageable.
- Configs are identity-tracked: whenever you add/duplicate/paste a `BuilderConfig`, clone it with `cloneBuilderConfig` from `src/lib/multiEditDraft.ts` so multiselect + history logic never shares references between chips.
- Large surfaces such as the builder now keep their helper logic in dedicated siblings (`src/components/builderPanel/*`, `src/lib/hsfBuilder/*`); add new helpers beside those files instead of expanding the main component/module. The builder pulls all layout constants and roll budget math from `builderPanel/constants.ts`, so extend that file instead of re-declaring pixel math or repeat helpers.
- BuilderPanel-specific controller hooks (`builderPanel/useBuilderHistoryMenu.ts`, `builderPanel/useRuleCountBadge.ts`) encapsulate context-menu hints, undo tooltips, and asynchronous rule-count caching. When adding new UI flows, introduce a sibling hook rather than embedding another 200+ line block back into `BuilderPanel.tsx`.
- Multi-edit aggregations live in `builderPanel/useMultiEditSummary.ts` and the action button context menus + hint overlays live in `builderPanel/useBuilderPanelActionMenus.ts`; wire new behaviors through these hooks to keep the core component declarative.
- Artifact set selections now use `ArtifactSetSelectionEntry` (with optional `excluded`) plus helpers in `src/lib/gearSets/selection.ts`; reuse those helpers whenever sets or metasets are merged or displayed.
- Rule cache worker progress events are throttled to roughly once per second to prevent Firefox from backlogging main-thread message delivery on large datasets; avoid reintroducing verbose per-item logging or unthrottled progress forwarding.

- [Build and Tooling](technical/build-and-tooling.md) — stack, scripts, packaging, project structure, and the Tauri wrapper.
- [Application Behavior](technical/app-behavior.md) — builder guardrails, preview filters (including substat include/exclude), rule cache fast paths, clipboard/save flows, file import, config options prompt formatting (including group-level fallbacks and two-string label/value layouts), and the rule tester (including grouping + sort behavior and headerless mode).
- [Tutorial and Onboarding](technical/tutorial.md) — help dialog, tutorial coach behavior, and guidance for extending scripted steps.
- [Rules and Data](technical/rules-and-data.md) — HSFC/HSF schemas, builder roll semantics, autosave plumbing, and migration notes.
- [Keep Uniques](technical/app-behavior.md#keep-uniques) — Final Sell tab layout, gear-combination detection, tester-grid linking, and reset behaviors.
- [Locked roll constraints](technical/app-behavior.md#builder-outputs-and-normalization) — how `lockedMinRequiredRolls` impacts aggregate targets so locked selections can demand their own roll floors alongside the global sum.
- [Gear Database Import](technical/gear-db-import.md) — reverse-engineering the RSL Helper SQLite dump, mapping it into the Rule Tester, and documenting endpoint diff toasts/history.
- [WebSocket Protocol (JSON-RPC)](technical/websocket-jsonrpc.md) — formal JSON-RPC 2.0 message shapes, request/response flow, and push notifications.
- [WebSocket Protocol (Lightweight RSL Helper)](technical/websocket-helper.md) — compact `type/cmd/evt` envelopes for RSL Helper integrations.
- [UI and Layout](technical/ui-and-layout.md) — localization, metasets, preview UX (including dimmed disabled configs), shared hooks, effect guidelines, and responsive layout constraints.
- [Rule Tester Rule Templates](technical/tester-rule-templates.md) — gear-card actions, UX behaviors, and default keep/sell template logic.
- [Tooltip & Context Hints](technical/ui-and-layout.md#tooltips-and-context-hints) — canonical guidance for Markdown/Ellipsis tooltips, context-menu hints, and overflow handling.
- [Release Notes Prompt](CREATE-RELEASE-NOTES.md) — Codex orchestration instructions for maintaining `docs/HISTORY.txt`.
- [Artifact Rules](#artifact-rules) — slot catalogs, rarity/rank expectations, stat restrictions, and roll behavior.

> **Playwright in the Codex sandbox:** Run the Vite dev server on ports above `5180` (we default to `5182`). When the harness blocks the bind with an `EPERM` error, rerun the Playwright command with `with_escalated_permissions: true` and a concise `justification` so the server can listen on `127.0.0.1`.

All documents describe the *current* implementation; update the relevant file whenever the behavior changes so this index stays accurate.

### Commenting Expectations

- Keep code self-documenting whenever possible, but add concise inline comments whenever the intent isn’t immediately obvious. For new or modified sections, aim to include a clarifying comment roughly every three lines; only skip a comment when you can plainly state that the code is trivial (and document that decision in the surrounding comment block). Remove stale comments that no longer represent the current behavior.

### Performance Profiling (dev-only instrumentation)

We keep perf instrumentation gated behind `import.meta.env.DEV` so production builds stay clean. When you need detailed HSFC/HSF timing data:
- Use the shared helper at `src/lib/perfTimeline.ts` (it registers `window.__sellfilePerfTimeline` for Playwright snapshots).
- Keep every `startPerfTimeline`/`markPerfEvent` call behind the DEV gate so only the dev server records data.
- The Playwright perf specs (notably `tests/playwright/tester-matching-perf.spec.ts`) read the timeline and log deltas; they include rule-cache phase breakdowns (baseline/detection/final) and a `fast-path=1` flag when the worker skips full scans.
- The rebuild perf spec is a fast sanity check on slim fixtures with short idle waits; use `npm run measure:rule-tester` when you need full matcher perf coverage on large datasets.

Without the helper, the Playwright perf tests fall back to the built-in measurements (note dialog and first-row render) so routine CI runs stay stable.

## Artifact Rules

### Gear Slots

- Artifacts: `Weapon`, `Helmet`, `Shield`, `Gauntlets`, `Chestplate`, `Boots`.
- Accessories: `Ring`, `Amulet`, `Banner`.
- The term *gear* covers artifacts and accessories; UI copy uses *type* and *slot* interchangeably.

### Keep Uniques State

- Builder state carries `keepUniqueRules` plus the global `keepUniquesEnabled` flag. Each gear combination stores `(slot, set, rank, rarity, main stat, faction?)`, `requiredCount`, and a per-rule activation mode (`off`, `protectExisting`, or `anticipateGaps`).
- The Logic Hub dialog stores `logicHubDialogTab` (legacy autosaves still expose `FinalSellDialogTab`) alongside the rest of the builder payload so autosave/restore reopen whichever tab (Final Sell vs. Gear vs. Keep Uniques) the user last used. Keep Uniques launches with an empty rule list—enabling the feature exposes the inline editors, and the Reset button simply clears every rule and disables the toggle so re-enabling starts from a clean slate instead of resurrecting stale combinations.
- Autosave and HSFC payloads serialize the toggle plus combinations via `KeepUniques` and `KeepUniquesEnabled`. Autosave restore, clipboard import/export, and history snapshots treat them exactly like configs/metasets so undo/redo remains accurate. The HSFC import path (`applyHsfcLoadResult`) always writes the file’s keep-unique snapshot into state before we trigger a rule cache warm so a file with zero keep rules clears the previous session’s entries and lets the preview chip’s progress ring advance cleanly.
- Keep Uniques history entries emit structured tooltip payloads: add/delete snapshots show the full rule breakdown, while updates render before/after diffs for only the changed fields (slots/sets/metasets/main stats plus rank/rarity/faction lines).
- Keep Unique scans only run while `keepUniquesEnabled` is true; disabling the feature or rebuilding the gear queue clears `keepUniqueDetection` so the UI never shows stale combination stats. Detection fingerprints live only in memory to avoid bloating autosave payloads.
- Keep Unique rule names debounce using `BUILDER_AUTO_APPLY_DEBOUNCE_MS`; tester match chips refresh from the live name map without forcing a rule-cache rebuild.
- Configs tagged `ignore_keep_unique` keep their items in previews but are ignored during keep-unique coverage checks so rework fodder never satisfies the uniqueness quota.
- The rule cache worker retains a per-run artifact cache; when the tester preview is empty the pipeline must set `resetArtifacts` so the worker drops that cache before recomputing keep-unique injections. The app wires this flag already—preserve it on new pipeline call sites.
- `computeKeepUniqueProtection` reads the normalized preview gear and emits combination stats (`currentCount`, `keptCount`, `projectedCount`, `coveredByExisting`, `deficit`, gear ids) that the UI and keep-rule generator consume.
- `TesterItemsGrid` exposes a `variant="keepUniques"` path so the dialog can reuse the shared renderer with forced two-column cards and rule-linked highlighting.
- `computeMergedRules` prepends Keep Unique rules ahead of the Final Sell batch, tagging each rule with `RULE_SOURCE_KEEP_UNIQUES` and metadata (`__keepUniqueRuleId`, combination hash, required count, scan timestamp). Canonical keep-rule keys ensure we skip duplicates when HSFC/Final Sell already guarantee the same combination.
- Keep Unique rows in the HSF preview are informational-only: they show the hollow-star attribution but do not expose a row context menu.
- The tester match rebuild + keep-unique detection path lives in `useTesterMatchOrchestrator`, which batches rule/config/name changes into a single loop and logs each build start/finish with the relevant signatures. Matches use a single evaluation: the displayed match includes keep-unique rules, while `baseMatch` excludes them for detection.

### Faction Coverage

- Only accessories are faction-locked; artifact pieces ignore faction.
- Faction groups and their member factions:
  - **Telerian League** — Banner Lords, High Elves, Sacred Order, Barbarians.
  - **Gaellen Pact** — Ogryn Tribes, Lizardmen, Skinwalkers, Orcs.
  - **The Corrupted** — Demonspawn, Undead Hordes, Dark Elves, Knight Revenant.
  - **Nyresan Union** — Dwarves, Shadowkin, Sylvan Watchers, Argonites.

### Rarity and Rank

- Rarities: Common (gray), Uncommon (green), Rare (blue), Epic (purple), Legendary (orange), Mythical (red).
- Ranks: 1★ through 6★.
- Any rank can pair with any rarity.

### Stats

- Main stat options: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`.
- Substat options draw from the same list.
- Gear never repeats a substat and never repeats the main stat as a substat.

### Leveling and Rolls

- Gear levels range from 0 to 16.
- Main stat values increase with every level; the increment is fixed per stat + rank.
- At levels 4, 8, 12, and 16 either a new substat is added or an existing substat rolls (gains a bonus):
  - **Common** — starts with 0 substats; adds one at 4/8/12/16.
  - **Uncommon** — starts with 1 substat; adds at 8/12/16.
  - **Rare** — starts with 2 substats; adds at 12/16.
  - **Epic** — starts with 3 substats; adds at 16.
  - **Legendary** — starts with 4 substats; rolls only.
  - **Mythical** — starts with 4 substats and has one pre-rolled bonus at level 0; rolls only afterward.
- When a substat rolls, the game applies a bonus from a stat- and rank-specific range (e.g., 6★ SPD gains +5 or +6). Builder heuristics anchor on the documented minimum values but higher rolls are possible.

### Main Stat by Slot

- `Weapon`: `ATK`
- `Helmet`: `HP`
- `Shield`: `DEF`
- `Gauntlets`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`
- `Chestplate`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `ACC`, `RES`
- `Boots`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `SPD`
- `Ring`: `ATK`, `HP`, `DEF`
- `Amulet`: `ATK`, `HP`, `DEF`, `CDMG%`
- `Banner`: `ATK`, `HP`, `DEF`, `ACC`, `RES`

### Substat by Slot

- `Weapon`: `HP`, `HP%`, `ATK`, `ATK%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`
- `Helmet`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`
- `Shield`: `HP`, `HP%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`
- `Gauntlets`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`
- `Chestplate`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`
- `Boots`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`
- `Ring`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`
- `Amulet`: `ATK`, `HP`, `DEF`, `CDMG%`, `ACC`, `RES`
- `Banner`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `SPD`

### Substat Minimum Values

| Rank | HP | HP% | ATK | ATK% | DEF | DEF% | CR% | CDMG% | ACC | RES | SPD |
| ---- | -- | --- | --- | ---- | --- | ---- | --- | ----- | --- | --- | --- |
| 5★   | 160 | 4% | 12 | 4% | 12 | 4% | 4% | 4% | 8 | 8 | 4 |
| 6★   | 200 | 5% | 15 | 5% | 15 | 5% | 5% | 5% | 9 | 9 | 5 |

- Interim baseline for 1–4★ gear (temporary implementation detail): use the 5★ target minus one unit for each stat (e.g., `HP = 159`, `HP% = 3%`, `SPD = 3`).
- When new substats are added at the level milestones they enter at least at these minimum values; actual in-game rolls can exceed them.

### Playwright Harness

- Fixtures live under `tests/playwright/`:
  - `fixtures.ts` wires console mirroring and page-error logging so specs surface browser output in the CLI.
  - `app-init.ts` primes localStorage, forces `isSecureContext`, and (optionally) stubs the clipboard API for deterministic tests.
  - `app-warmup.ts` preloads the shell once to avoid cold Vite compile costs in perf specs.
  - `fixture-paths.ts` is the single source of truth for Playwright fixture paths; import from it instead of hardcoding file locations.
  - `tests/data/sample-small.hsfc` (3 configs, no Keep Uniques) is the fast HSFC fixture for most UI coverage; `tests/data/sample.hsfc` remains the large fixture for scroll/perf scenarios.
  - `tests/data/sample-small-config-options-disabled.hsfc` mirrors the small HSFC fixture with config options disabled (used by note/config-option coverage).
  - `tests/data/sample-small.db` is the slim Rule Tester fixture for Playwright; `tests/data/sample.db` stays reserved for unit tests and offline tooling.
- Specs:
  - `tests/playwright/smoke.spec.ts` is the canonical health-check (run single-browser only for targeted debugging, e.g. `npx playwright test tests/playwright/smoke.spec.ts --project=chromium --reporter=list`).
  - `tests/playwright/config-insert-order.spec.ts` guards the “paste after” ordering regression by loading `tests/data/sample-small.hsfc`, performing copy/paste, and verifying row ordering.
  - `tests/playwright/builder-config-switch-perf.spec.ts` seeds a tiny autosave payload (two configs) to measure a single config switch without HSFC import overhead.
  - `tests/playwright/tester-matching-perf.spec.ts` is a fast rebuild sanity check: it measures config-name rebuild latency in rules preview using `tests/data/sample-small.hsfc` across all browsers.
  - `tests/playwright/keep-unique-disabled-clone-sell.spec.ts` seeds a tiny Rule Tester autosave payload (no DB import) to verify config-duplicate behavior with config options disabled.
- Default test runs:
  - `npm run test:unit` executes the node:test suite and HSFC fixture runner.
  - `npm run test:e2e:chromium` executes the Playwright suite in Chromium only.
  - `npm run test:e2e:firefox` executes the Playwright suite in Firefox only.
  - `npm run test:e2e:webkit` executes the Playwright suite in WebKit only.
  - `npm run test:e2e` runs Chromium → Firefox → WebKit sequentially (fresh dev server each run) and continues even if an earlier browser fails; it exits non-zero if any browser fails.
  - `npm run test:e2e:all` is a backwards-compatible alias for `test:e2e` (full browser matrix).
  - `npm test` runs `test:all` (unit/integration + all Playwright browsers).
  - `npm run test:all:full` currently mirrors `test:all`; keep it for CI parity.
  - Keep e2e specs browser-agnostic; avoid per-browser `test.skip` unless a true platform limitation exists.
- Playwright uses a single worker by default to keep Vite stable during full-matrix runs.
- Timeout policy:
  - Timeouts are centralized in `tests/playwright/timeouts.ts`; adjust them there instead of hardcoding new values.
  - `testDefault` is 3s and should cover most UI specs; only rule rebuild or matcher workflows may use `testLong` (15s).
  - Expect/wait budgets follow the same split: `expectDefault` (3s) for general UI, `expectLong` (15s) only when a rule rebuild or matcher run is the explicit action under test.
  - Initial app-shell mounts may use `appGoto` (15s) for the first visible control in perf/modal specs; the rest of the interactions must stick to the 3s defaults.
  - Long timeouts are justified only for app-shell boot, HSFC imports, config rebuilds, or Rule Tester matching; everything else must stay on the 3s defaults.
  - If a test needs more than 15s, shrink the fixture (use `sample-small.hsfc` / `sample-small.db`) or split the scenario; do not increase timeouts.
  - Do not add new timeout tiers or increase these values; if a test exceeds 15s, reduce the workload, improve readiness checks, or split the scenario.
- Install behavior:
  - `npm install` triggers `npx playwright install` via `postinstall` to fetch the browser binaries pinned to the local `@playwright/test` version.
- Sandbox specifics:
  - Playwright requires elevated permissions when binding Vite to `127.0.0.1:5182`; re-run the command with `with_escalated_permissions: true` if you hit `EPERM`.
- The harness still logs `[Violation]` entries for slow handlers; ignore them unless a spec fails.
- Some warm-cache aborts can emit `AbortError` in the console; the tests swallow them but keep an eye out for regressions.
- Reports:
  - Per-browser HTML reports live in `test-results/reports/<browser>/index.html`.
  - `npm run test:e2e` writes a combined index at `test-results/reports/index.html` that links to each browser report.
