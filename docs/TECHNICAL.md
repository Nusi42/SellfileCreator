# Technical Details

The technical reference is now split across focused documents. Start here, then dive into the section you need:

## Coding Standards

- Keep inline documentation dense and helpful—when implementing or revising code, aim for a concise intent-focused comment roughly every 2–3 lines.
- Enforce the Single Source of Truth / One Definition Rule without exception: centralize each constant, helper, and schema definition once, then import it everywhere else.
- Shared TS/Rust domain sentinels now come from `shared/domain-constants.json`; regenerate language bindings with `npm run generate:domain-constants` (the WASM build script runs this automatically before compiling).
- Any constant that must exist in both TS and Rust is required to be declared in `shared/domain-constants.json` and emitted by `scripts/tooling/generate-domain-constants.mjs`; do not hand-define cross-language constants in app/wasm source files or hand-edit generated constant outputs.  The JSON covers: artifact type IDs, stat IDs, rarity/rank codes, level sentinels and milestones, substat slot count (`SUBSTAT_SLOT_COUNT = 4`) and max rolls per slot (`SUBSTAT_MAX_ROLLS_PER_SLOT = 5`), faction IDs and names, artifact type display names, stat variant display labels, allowed mains/subs per slot, and substat minima by star rank.
- Auto-rarity schedule constants (`rollMaskByCode`, `additionMaskByCode`, `includesMythicalByCode`, `minRollEventsByCode`) are also defined in `shared/domain-constants.json`; do not reintroduce TS/Rust-local rarity schedule tables.
- Label-parser symmetry tests live in `shared/sfc-label-test-vectors.json` (canonical input/output pairs) consumed by both Rust `#[test]` and Jest (`tests/unit/sfc-label-symmetry.test.ts`); update the JSON whenever a label mapping changes.
- The rule-engine wasm binary (`src/lib/wasm/generated/rule_engine_bg.wasm`) is build output, not source of truth; rely on `npm run wasm:ensure:rule-engine`/`npm run wasm:build:rule-engine` to regenerate it when inputs change.
- Watch file size creep; split modules or move helpers into shared files before they cross roughly 1,500 lines so reviews stay manageable.
- Recipes are identity-tracked: whenever you add/duplicate/paste a `BuilderRecipe`, clone it with `cloneBuilderRecipe` from `src/lib/multiEditDraft.ts` so multiselect + history logic never shares references between chips.
- Large surfaces such as the builder now keep their helper logic in dedicated siblings (`src/components/builderPanel/*`, `src/lib/hsfBuilder/*`); add new helpers beside those files instead of expanding the main component/module. The builder pulls all layout constants and roll budget math from `builderPanel/constants.ts`, so extend that file instead of re-declaring pixel math or repeat helpers.
- BuilderPanel-specific controller hooks (`builderPanel/useBuilderHistoryMenu.ts`, `builderPanel/useRuleCountBadge.ts`) encapsulate context-menu hints, undo tooltips, and asynchronous rule-count caching. When adding new UI flows, introduce a sibling hook rather than embedding another 200+ line block back into `BuilderPanel.tsx`.
- Multi-edit aggregations live in `builderPanel/useMultiEditSummary.ts` and the action button context menus + hint overlays live in `builderPanel/useBuilderPanelActionMenus.ts`; wire new behaviors through these hooks to keep the core component declarative.
- Artifact set selections now use `ArtifactSetSelectionEntry` (with optional `excluded`) plus helpers in `src/lib/gearSets/selection.ts`; reuse those helpers whenever sets or metasets are merged or displayed.
- Recipe and safeguard set/metaset multi-edit share **one** tri-state definition in `builderPanel/recipeMultiEditHelpers.ts` (re-exported from `safeguardMultiEditHelpers.ts`): the leaf math (`computeArtifactSetPatchToggle` / `computeArtifactSetExclusionToggle` / `resolveInclusionPresence` / `resolveExclusionPresence` / `applyStringArrayPatchCount`) **and** the resolvers that bind it to a selection (`resolveSetTriState` / `resolveSetExclusionTriState` / `resolveMetasetTriState` / `resolveExcludedSetUnion`, all returning the shared `SetTriState`). Each panel calls these resolvers with its own data sources (summary count maps, staged patch, single-edit fallback) instead of re-deriving `none`/`partial`/`all` inline — don't fork them, pass new inputs. `excludedCounts` was added to both multi-edit summaries to feed the exclusion side.
- The gear-set left-click (include), right-click "NOT" (exclusion), and metaset include click are all per-rule tri-state toggles in multi-edit on both panels. Left-click toggling a set ON also **clears any existing exclusion** for it: `computeArtifactSetPatchToggle` stages `add` *and* `remove` for the id (apply removes by id then re-adds), so left-click un-NOTs a set — without this, per-rule "exclusion wins" normalization would keep the NOT. The recipe panel drives `SetMenuSection`/its own metaset menu directly; the safeguard panel drives the shared `GearSetsSelect`, which accepts optional `triStateForSet` / `triStateForMetaset` / `mixedLabel` / `excludedSetIds` (display parity: mixed styling + "– Mixed" labels) plus `onToggleSet` / `onContextMenuSet` / `onToggleMetaset` overrides so the panel can stage tri-state patches instead of the selector's single-value replace.
- Exclusions on an **implicit-any** selection (no explicit set *and* no metaset) are stripped centrally via `pruneImplicitAnyExclusions` (`src/lib/gearSets/selection.ts`), enforced in both panels' single-edit handlers and the multi-edit post-apply normalizers (`recipeMultiEditDraft.ts`, `safeguardMultiEditDraft.ts`). HSF cannot express "all sets except X", so a bare exclusion with nothing to narrow is silently dropped rather than unrolled.
- Rule cache worker progress events are throttled to roughly once per second to prevent Firefox from backlogging main-thread message delivery on large datasets; avoid reintroducing verbose per-item logging or unthrottled progress forwarding.
- `useAutosave` now tracks the last change-signal per storage key so enable/disable flips cannot reschedule expensive payload builders when the underlying content did not change.

- [Build and Tooling](technical/build-and-tooling.md) — stack, scripts, packaging, project structure, and the [native DLL](technical/build-and-tooling.md#native-dll-rule_engine_native) (`rule_engine_native` cdylib for external tools).
- [Application Behavior](technical/app-behavior.md) — builder guardrails, preview filters (including substat include/exclude), rule cache fast paths, clipboard/save flows, file import, dynamic overrides (recipe overrides DSL + safeguard overrides DSL, including group-level fallbacks, two-string label/value layouts, count arithmetic expressions, and the shared disable/apply flow), and the Gear Inspector (including grouping + sort behavior and headerless mode).
- [Visual Override-Block Editor](technical/note-overrides-editor.md) — the note edit-mode editor for whole recipe/safeguard override blocks: draft model, the canonical DSL serializer (the only DSL writer), the structured-vs-raw body fidelity gate, round-trip guarantees, and the NoteDialog integration contract (card pencil, toolbar create, delegated-listener button guard).
- [Tutorial and Onboarding](technical/tutorial.md) — help dialog, tutorial coach behavior, and guidance for extending scripted steps.
- [Rules and Data](technical/rules-and-data.md) — SFC/HSF schemas, [NativeInput/NativeOutput](technical/rules-and-data.md#nativeinput--nativeoutput-native-dll) (native DLL JSON schemas), builder roll semantics, autosave plumbing, and migration notes.
- [Safeguards](technical/app-behavior.md#safeguards) — Tools dialog layout, gear-combination detection, substat-focused protection (including weighted ranking for **Any/All Substats**), Gear Inspector grid linking (including Gear Inspector card-width matching), and reset behaviors.
- [Dungeon Simulator](technical/dungeon-simulator.md) — Tools dialog Dungeon Drops tab, drop-table assumptions, stat generation, and keep evaluation rules.
- [Locked roll constraints](technical/app-behavior.md#builder-outputs-and-normalization) — how `lockedMinRequiredRolls` impacts aggregate targets so locked selections can demand their own roll floors alongside the global sum.
- [Gear Analytics](technical/gear-analytics.md) — cross-filter analytics dashboard: donut charts, KPI cards, stat frequency bars, heatmap, snapshot export, and the cross-filter pattern.
- [Gear Database Import](technical/gear-db-import.md) — reverse-engineering the RSL Helper SQLite dump, mapping it into the Gear Inspector, and documenting endpoint diff toasts/history.
- [Accounts](technical/accounts.md) — multi-account support: the registry (`lib/accounts.ts`), internal-id vs RSL-Helper-id binding, per-account localStorage partitioning (`ACCOUNT_SCOPED_BASE_KEYS`), legacy migration, `?playerid=`/`?name=` launch routing, the account switcher + shift-switch merge carry, per-account accents, RSL Helper integration phases, and the background auto-push for non-active accounts (`lib/backgroundAccountPush.ts` + `lib/documentOverrides.ts` + `lib/headlessRuleCachePipeline.ts`; activates once RSL Helper stamps packets).
- [WebSocket Protocol (JSON-RPC)](technical/websocket-jsonrpc.md) — JSON-RPC 2.0 message shapes, request/response flow, and push notifications, including the optional `accountId`/`accountName` stamping in both directions. **User-facing** (released to third-party integrators): protocol contract only, no implementation detail.
- [Packet Capture (dev-only)](technical/packet-capture.md) — internal dev tool for recording inbound/outbound WebSocket traffic and console logs to sampleLog-style fixtures: the `?capturePackets` flag, `capturePacket`/`captureOutboundRequest` wiring, the dev-server middleware (`scripts/vite/packetCapturePlugin.ts`, `/__capture-packet` + `/__capture-log`), compact-serialization/`MAX_BYTES` rationale, console + worker log tee, DEV gating, and promoting a recording to a committed fixture or the replay harness.
- [Theming System](technical/theming-system.md) — MUI v9 CSS variables mode, light/dark schemes, `themeCustomTokens.ts` SSOT, the **Color SSOT** (`colorTints` TINT/ALPHA, `colorUtils` math + `ensureContrastOnBg`, `rarityColors`, `themeContrastHooks`), the contrast-adaptation rule for user/preset text colours, the valid raw-colour exceptions + consolidation mandate, safe `theme.vars?.palette` patterns, `ThemeEditorMenu`, `PsychedelicEffect`, display preferences context, and component checklist.
- [UI and Layout](technical/ui-and-layout.md) — localization, metasets, preview UX (including dimmed disabled recipes), shared hooks, effect guidelines, and responsive layout constraints.
- [Builder Panel Grids](technical/builder-panel-grids.md) — row-by-row grid map for RecipeBuilderPanel and SafeguardBuilderPanel, flex-wrapper mechanics for collapsible sections, and options for layout changes.
- [Gear Inspector Rule Templates](technical/gear-inspector-rule-templates.md) — gear-card actions, UX behaviors, and default keep/sell template logic.
- [Gear Diff](technical/gear-diff.md) — sell/keep before-vs-after comparison: the preview-header `Diff` toggle, reference/baseline model (auto-track on builder edits; Dynamic Overrides accumulate), the synced-scroll split-view, the delta chip, filter behavior, and restore/DB-load suppression.
- [Tooltip & Context Hints](technical/ui-and-layout.md#tooltips-and-context-hints) — canonical guidance for Markdown/Ellipsis tooltips, context-menu hints, and overflow handling.
- [Release Notes Prompt](CREATE-RELEASE-NOTES.md) and [Worker Prompt](CREATE-RELEASE-NOTES-WORKER.md) — Claude orchestration for maintaining `docs/HISTORY.txt` (single-pass / reducer) and the map-worker role used for large releases. Maintainer review items collected during the run land in `PRE-RELEASE-CHECKLIST.md` at the repo root.
- [Artifact Rules](#artifact-rules) — slot catalogs, rarity/rank expectations, stat restrictions, and roll behavior.

> **Playwright in the Claude sandbox:** Run the Vite dev server on ports above `5180` (we default to `5182`). When the harness blocks the bind with an `EPERM` error, rerun the Playwright command with `with_escalated_permissions: true` and a concise `justification` so the server can listen on `127.0.0.1`.

All documents describe the *current* implementation; update the relevant file whenever the behavior changes so this index stays accurate.

### Commenting Expectations

- Keep code self-documenting whenever possible, but add concise inline comments whenever the intent isn’t immediately obvious. For new or modified sections, aim to include a clarifying comment roughly every three lines; only skip a comment when you can plainly state that the code is trivial (and document that decision in the surrounding comment block). Remove stale comments that no longer represent the current behavior.

## Artifact Rules

### Gear Slots

- Artifacts: `Weapon`, `Helmet`, `Shield`, `Gauntlets`, `Chestplate`, `Boots`.
- Accessories: `Ring`, `Amulet`, `Banner`.
- The term *gear* covers artifacts and accessories; UI copy uses *type* and *slot* interchangeably.

### Safeguards State

- Builder state carries safeguard rules in `safeguardRules` plus the global `safeguardsEnabled` flag. Each gear combination stores `(slot, set, rank, rarity, main stat, faction?)`, optional `substats` + `substatMatch`/`substatWeights` for substat-focused protection, `requiredCount`, and a per-rule activation mode (`off`, `protectExisting`, `anticipateGaps`, or `anticipateImprovements`).
- The Tools dialog stores `logicHubDialogTab` alongside the rest of the builder payload so autosave/restore reopen whichever tab (Final Sell vs. Gear vs. Safeguards) the user last used. Safeguards launches with an empty rule list—enabling the feature exposes the inline editors, and the Reset button simply clears every rule and disables the toggle so re-enabling starts from a clean slate instead of resurrecting stale combinations.
- Autosave and SFC payloads serialize the toggle plus combinations via `Safeguards` and `SafeguardsEnabled`. Autosave restore, clipboard import/export, and history snapshots treat them exactly like recipes/metasets so undo/redo remains accurate. The SFC import path (`applySfcLoadResult`) always writes the file’s safeguard snapshot into state before we trigger a rule cache warm so a file with zero safeguard rules clears the previous session’s entries and lets the preview chip’s progress ring advance cleanly.
- Safeguards history entries emit structured tooltip payloads: add/delete snapshots show the full rule breakdown, while updates render before/after diffs for only the changed fields (slots/sets/metasets/main stats plus rank/rarity/faction lines).
- Safeguard scans only run while `safeguardsEnabled` is true; disabling the feature or rebuilding the gear queue triggers a new pipeline run, which produces `safeguardDetection: null` so the UI never shows stale combination stats. The app tracks the last applied detection snapshot by reference in memory (no persisted detection signature in autosave payloads).
- Safeguard rule names debounce using `BUILDER_AUTO_APPLY_DEBOUNCE_MS`; Gear Inspector match chips refresh from the live name map without forcing a rule-cache rebuild.
- Recipes tagged `ignore_by_safeguards` keep their items in previews but are ignored during safeguard coverage checks so rework fodder never satisfies the uniqueness quota. Legacy aliases (`ignore_keep_unique`, `ignore_safeguard`) are still accepted on import and canonicalized to `ignore_by_safeguards`.
- Pipeline requests now carry a monotonic `generation` id; stale in-flight runs are discarded so only the newest payload can update preview state.
- Worker-backed matcher pipelines run through a single-flight scheduler (`useRuleCacheWorker`): one active run, one latest queued payload. New payloads supersede active work immediately.
- Pipeline calls send full artifact arrays per run. The worker skips structured-cloning the large rule payload back to the main thread when `mergedRulesFinal` is provably unchanged (three fingerprint sentinels + a rule-count safety net); see "Worker structured-clone skip" in `technical/app-behavior.md` for the full scheme.
- Sellfile toggles `dedupeDefault` and `omitDisabledForExport` now run as in-app transforms before safeguard detection/injection, so preview/matcher/safeguard pipelines and exports share one ruleset.
- Browser builds require worker-backed rule-cache execution; the hook no longer provides a main-thread fallback pipeline.
- `computeSafeguardProtection` / `evaluateAndCollectSafeguardProtection` run entirely in WASM and emit combination stats (`currentCount`, `projectedCount`, `coveredByExisting`, `deficit`, `itemKeys`, scored candidates) that the UI and safeguard-rule generator consume.
- Safeguard expected-group expansion (slot/set/faction/main-scope cartesian products used for per-group deficits) now runs entirely in WASM using a shared domain payload from TS.
- Substat scoring always uses normalized substat scoring and keeps the top N per scope. Equal-score ties resolve only when we can prove one item is better (`same main stat => higher rank`, or `% HP/DEF/ATK beats the matching flat variant`); unresolved boundary ties are all kept, so the selected count can exceed N. Weights shift the ranking when **Any** or **All Substats** is active, while **Per Substat** sticks to equal weighting.
- Each present substat contributes its weighted normalized current value **plus** a rank-limited glyph-potential term: glyphs apply at any rank but are capped to the gear's rank tier, so a 6★ outscores an equal-substat 5★ on glyphable stats (CR/CDMG are non-glyphable and add no glyph term — their 5★/6★ order falls to the rank tie-breaker). This per-substat formula is the SSOT `substatNormalizedContribution` in `lib/substatRollNormalization.ts`, shared by the safeguard scorer (`computeSafeguardScoreFromArtifact` + the Rust mirror `safeguard_compute_score`) **and** the Gear Inspector normalized sort (`computeGearInspectorNormalizedSubstatScore`), so both rank mixed-star gear identically. The main-stat rank bonus (`mainStatRankRatio`, gated by the **Weight by Rank** toggle) is safeguard-only and added after the per-substat sum.
- `GearInspectorItemsGrid` exposes a `variant="safeguards"` path so the dialog can reuse the shared renderer with forced two-column cards and rule-linked highlighting.
- `computeMergedRules` prepends Safeguard rules ahead of the Final Sell batch, tagging each rule with `RULE_SOURCE_SAFEGUARDS` and WASM-stamped metadata (combination hash, rule ordinal, required count, scan timestamp). Canonical safeguard-rule keys ensure we skip duplicates when SFC/Final Sell already guarantee the same combination.
- Safeguard rows in the HSF preview are informational-only: they show the hollow-star attribution but do not expose a row context menu.
- Gear Inspector match rebuild + safeguard detection now run inside the unified rule-cache worker pipeline (`runPipeline` in `App.tsx` + `ruleCacheWorker.ts`) so rules, matches, and safeguard detection resolve in one request/response cycle.

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

### Gear and its sources

| Artifact | \# for Set | Location |
| --- | --- | --- |
| LIFE | 2   | DUNGEON - Ice Golem’s Peak  <br>CAMPAIGN - Kaerok Castle  <br>MARKET |
| DEFENSE | 2   | DUNGEON - Ice Golem’s Peak  <br>CAMPAIGN - Catacombs of Narbuk  <br>MARKET |
| RESISTANCE | 2   | DUNGEON - Ice Golem’s Peak  <br>CAMPAIGN - Tilshire  <br>MARKET |
| OFFENSE | 2   | DUNGEON - Ice Golem’s Peak  <br>CAMPAIGN - Sewers of Arnoc  <br>MARKET |
| CRITICAL RATE | 2   | DUNGEON - Ice Golem’s Peak  <br>CAMPAIGN - Durham Forest  <br>MARKET  <br>EVENT DUNGEON |
| RETALIATION | 2   | DUNGEON - Ice Golem’s Peak  <br>CAMPAIGN - Godfrey's Crossing  <br>MARKET |
| REFLEX | 4   | DUNGEON - Ice Golem’s Peak |
| CURSED | 4   | DUNGEON - Ice Golem’s Peak |
| PROVOKE | 4   | DUNGEON - Ice Golem’s Peak |
| FROST | 4   | DUNGEON - Dragon's Lair |
| TOXIC | 4   | DUNGEON - Dragon's Lair |
| DAZE | 4   | DUNGEON - Dragon's Lair  <br>MARKET  <br>EVENT DUNGEON |
| AVENGING | 4   | DUNGEON - Dragon's Lair |
| STALWART | 4   | DUNGEON - Dragon's Lair |
| ACCURACY | 2   | DUNGEON - Dragon's Lair  <br>CAMPAIGN - Felwin's Gate  <br>MARKET  <br>EVENT DUNGEON |
| SPEED | 2   | DUNGEON - Dragon's Lair  <br>CAMPAIGN - Palace of Aravia  <br>MARKET |
| LIFESTEAL | 4   | DUNGEON - Dragon's Lair  <br>CAMPAIGN - Valdemar Strait  <br>MARKET |
| DESTROY | 4   | DUNGEON - Dragon's Lair  <br>CAMPAIGN - Deadlands |
| FRENZY | 4   | DUNGEON - Fire Knight's Castle |
| STUN | 4   | DUNGEON - Fire Knight's Castle |
| IMMUNITY | 4   | DUNGEON - Fire Knight's Castle |
| SAVAGE | 4   | DUNGEON - Fire Knight's Castle |
| REGENERATION | 4   | DUNGEON - Fire Knight's Castle |
| FURY | 4   | DUNGEON - Fire Knight's Castle  <br>CAMPAIGN - Hallowed Halls |
| CURING | 4   | DUNGEON - Fire Knight's Castle  <br>CAMPAIGN - Brimstone Path  <br>MARKET  <br>EVENT DUNGEON |
| CRIT DAMAGE | 2   | DUNGEON - Fire Knight's Castle  <br>EVENT DUNGEON |
| SHIELD | 4   | DUNGEON - Fire Knight's Castle  <br>MARKET |
| CRUEL | 2   | DEMON LORD - Demon Lord Chests |
| IMMORTAL | 2   | DEMON LORD - Demon Lord Chests |
| DIVINE LIFE | 2   | CLASSIC ARENA - Bronze, Silver, and Gold Tier Weekly Chests  <br>GREAT HALL - Gold Medal Chests |
| DIVINE CRITICAL RATE | 2   | CLASSIC ARENA - Bronze, Silver, and Gold Tier Weekly Chests  <br>GREAT HALL - Gold Medal Chests |
| DIVINE OFFENSE | 2   | CLASSIC ARENA - Bronze, Silver, and Gold Tier Weekly Chests  <br>GREAT HALL - Gold Medal Chests |
| DIVINE SPEED | 2   | CLASSIC ARENA - Bronze, Silver, and Gold Tier Weekly Chests  <br>GREAT HALL - Gold Medal Chests |
| SWIFT PARRY | 4   | CLASSIC ARENA - Platinum Tier Weekly Chests  <br>FORGE - Materials from Faction Wars, Classic Arena, and Events/Tournaments |
| DEFLECTION | 4   | CLASSIC ARENA - Platinum Tier Weekly Chests  <br>FORGE - Materials from Faction Wars, Classic Arena, and Events/Tournaments |
| RESILIENCE | 2   | FORGE - Materials from Faction Wars and Classic Arena |
| PERCEPTION | 2   | FORGE - Materials from Faction Wars and Classic Arena |
| FATAL | 2   | FORGE - Materials from Classic Arena and the Magma Dragon |
| AFFINITYBREAKER | 4   | FORGE - Materials from Classic Arena and the Nether Spider |
| UNTOUCHABLE | 4   | FORGE - Materials from Classic Arena and the Scarab King |
| FROSTBITE | 4   | FORGE - Materials from Classic Arena and the Frost Spider |
| BLOODTHIRST | 4   | FORGE - Materials from Classic Arena and the Eternal Dragon |
| GUARDIAN | 4   | FORGE - Materials from Classic Arena and the Celestial Griffin |
| RELENTLESS | 4   | TOURNAMENTS - Tournament Rewards |
| FORTITUDE | 2   | FORGE - Materials from Classic Arena and Bommal the Dreadhorn |
| LETHAL | 4   | FORGE - Materials from Classic Arena and the Dark Fae |
| STONE SKIN | 9   | HYDRA - Hydra Chests & Hydra Clash Chests |
| PROTECTION | 9   | HYDRA - Hydra Chests & Hydra Clash Chests |
| KILLSTROKE | 2   | CLAN SHOP - Artifact Chests |
| INSTINCT | 4   | FORGE PASS - Final Reward from Gold Pass  <br>FORGE - Materials from the Forge Pass |
| BOLSTER | 4   | FORGE PASS - Final Reward from Gold Pass  <br>FORGE - Materials from the Forge Pass |
| DEFIANT | 2   | FORGE PASS - Final Reward from Gold Pass  <br>FORGE - Materials from the Forge Pass |
| IMPULSE | 2   | LIVE ARENA - Live Arena Chests |
| ZEAL | 2   | LIVE ARENA - Live Arena Chests |
| RIGHTEOUS | 2   | RAID: CALL OF THE ARBITER - Reward for episode views  <br>FORGE PASS - Final Reward from Gold Pass  <br>FORGE - Materials from the Forge Pass |
| SUPERSONIC | 9   | CURSED CITY - Cursed Chests |
| MERCILESS | 9   | CURSED CITY - Cursed Chests |
| SLAYER | 9   | FORGE PASS - Final Reward from Gold Pass  <br>FORGE - Materials from the Forge Pass |
| FERAL | 9   | SIEGE - Milestone Rewards |
| PINPOINT | 9   | EVENT DUNGEON |
| STONECLEAVER | 9   | LIVE ARENA - Seasonal Milestone Rewards and Seasonal Chests |
| REBIRTH | 9   | LIVE ARENA - Seasonal Milestone Rewards and Seasonal Chests |
| CHRONOPHAGE | 9   | EVENT DUNGEON |
| MERCURIAL | 9   | GRIM FOREST |

### Playwright Harness

- Fixtures live under `tests/playwright/`:
  - `fixtures.ts` wires console mirroring and page-error logging so specs surface browser output in the CLI.
  - `app-init.ts` primes localStorage, forces `isSecureContext`, and (optionally) stubs the clipboard API for deterministic tests.
  - `app-warmup.ts` preloads the shell once to avoid cold Vite compile costs in perf specs.
  - `fixture-paths.ts` is the single source of truth for Playwright fixture paths; import from it instead of hardcoding file locations.
  - `tests/data/sample-small.sfc` (3 recipes, no Safeguards) is the fast SFC fixture for most UI coverage; `tests/data/sample.sfc` remains the large fixture for scroll/perf scenarios.
  - `tests/data/sample-small-recipe-overrides-disabled.sfc` mirrors the small SFC fixture with recipe overrides disabled (used by note/recipe-override coverage).
  - `tests/data/sample-small.db` is the slim Gear Inspector fixture for Playwright; `tests/data/sample.db` stays reserved for unit tests and offline tooling.
- Specs:
  - `tests/playwright/smoke.spec.ts` is the canonical health-check (run single-browser only for targeted debugging, e.g. `npx playwright test tests/playwright/smoke.spec.ts --project=chromium --reporter=list`).
  - `tests/playwright/recipe-insert-order.spec.ts` guards the “paste after” ordering regression by loading `tests/data/sample-small.sfc`, performing copy/paste, and verifying row ordering.
  - `tests/playwright/builder-recipe-switch-perf.spec.ts` seeds a tiny autosave payload (two recipes) to measure a single recipe switch without SFC import overhead.
  - `tests/playwright/safeguard-disabled-clone-sell.spec.ts` seeds a tiny Gear Inspector autosave payload (no DB import) to verify recipe-duplicate behavior with recipe overrides disabled.
- Default test runs:
  - `npm run test:unit` executes the node:test suite and SFC fixture runner.
  - **Two e2e tiers — pick the dev tier for the inner loop.** The dev tier is the fast default; the full tier is reserved for releases and pre-merge confidence.
    - **dev** (`npm run test:e2e`, and the per-browser `test:e2e:chromium` / `test:e2e:firefox`): FHD-only viewport (`*-fhd` projects) and short iteration counts. This is what the CLAUDE.md handoff rule requires; use `test:e2e:chromium` while iterating on a single change.
    - **full** (`npm run test:e2e:full`, and `test:e2e:chromium:full` / `test:e2e:firefox:full`): both viewports (1280×720 + FHD) and full leak/fragmentation iteration counts (`E2E_FULL`). Run before release; `release:win` runs this tier.
  - `npm run test:e2e` / `test:e2e:full` run Chromium → Firefox sequentially via `scripts/test/run-e2e.mjs`; the run continues even if an earlier browser fails and exits non-zero if any browser failed.
  - **Build is shared across browsers.** The orchestrator builds the prod-like bundle ONCE and starts a single `vite preview`, then runs every browser suite against it (`E2E_EXTERNAL_SERVER=1` → the Playwright config serves-and-reuses instead of build-and-start). Running a per-browser script standalone (e.g. `npm run test:e2e:chromium`, or `npx playwright test …`) still self-builds and serves, so single-spec debugging needs no orchestrator.
  - Dev vs. release iteration counts live in `tests/playwright/iteration-counts.ts` (the single `E2E_FULL` toggle); specs import named counts from there. Lower a count there, never inline per-spec.
  - `npm run test:e2e:all` aliases `test:e2e:full`; `npm test` runs `test:all` (unit + dev e2e tier); `npm run test:all:full` runs unit + full e2e tier.
  - Keep e2e specs browser-agnostic; avoid per-browser `test.skip` unless a true platform limitation exists.
- Playwright uses a single worker by default to keep Vite stable during full-matrix runs.
- Timeout policy:
  - Timeouts are centralized in `tests/playwright/timeouts.ts`; adjust them there instead of hardcoding new values.
  - `testDefault` is 3s and should cover most UI specs; only rule rebuild or matcher workflows may use `testLong` (15s).
  - Expect/wait budgets follow the same split: `expectDefault` (3s) for general UI, `expectLong` (15s) only when a rule rebuild or matcher run is the explicit action under test.
  - Initial app-shell mounts may use `appGoto` (15s) for the first visible control in perf/modal specs; the rest of the interactions must stick to the 3s defaults.
  - Long timeouts are justified only for app-shell boot, SFC imports, recipe rebuilds, or Gear Inspector matching; everything else must stay on the 3s defaults.
  - If a test needs more than 15s, shrink the fixture (use `sample-small.sfc` / `sample-small.db`) or split the scenario; do not increase timeouts.
  - Do not add new timeout tiers or increase these values; if a test exceeds 15s, reduce the workload, improve readiness checks, or split the scenario.
  - **Diagnose, never bump.** A longer timeout never makes a correct test pass faster and never fixes a broken one — it only makes the failure slower. When a spec is slow or flaky the cause is almost always a *wrong wait*, not a *short ceiling*. Find what is actually being waited on before touching any budget. The binary-endpoint specs once carried 10–20-minute ceilings purely to mask a `waitFor({ state: 'visible' })` that blocked its full timeout every time the spinner showed-and-hid before Playwright polled it; the fix was the wait, not the number.
  - **Settle the preview pipeline via `settleWorkload()`** (`tests/playwright/workload-indicator.ts`) — the single definition of the visible-then-hidden wait. Never hand-roll the two `waitFor` calls inline. The visible wait is intentionally short (`expectDefault`): a missed spinner appearance is normal, and a long visible budget would block the full duration on every miss. Only the hidden wait carries the work budget; pass a centralized token for the rare heavier pipeline.
  - **Two lint guards enforce this** (`no-restricted-syntax`, scoped to `tests/playwright/**` in `eslint.config.js`): (1) `test.setTimeout(...)` rejects raw numeric literals — every budget must be a named `PLAYWRIGHT_TIMEOUTS.*` token, added to `timeouts.ts` with derived `N × per-iteration` math in its comment; (2) a `waitFor({ state: 'visible' })` carrying a long token (`testXL`/`testHeavy`/`workloadIdle`/…) is rejected outright. Do not silence either with an `eslint-disable`; fix the wait.
- Install behavior:
  - `npm install` runs `npm run ensure:wasm-toolchain` first, auto-installing missing `wasm-bindgen-cli` + `wasm32-unknown-unknown` when Rust is already present, then triggers `npx playwright install` to fetch browser binaries pinned to the local `@playwright/test` version.
- Sandbox specifics:
  - Playwright requires elevated permissions when binding Vite to `127.0.0.1:5182`; re-run the command with `with_escalated_permissions: true` if you hit `EPERM`.
- The harness still logs `[Violation]` entries for slow handlers; ignore them unless a spec fails.
- Some warm-cache aborts can emit `AbortError` in the console; the tests swallow them but keep an eye out for regressions.
- Reports:
  - Per-browser HTML reports live in `test-results/reports/<browser>/index.html`.
  - `npm run test:e2e` writes a combined index at `test-results/reports/index.html` that links to each browser report.
