# Build and Tooling

This document covers the stack, everyday development workflows, and delivery tooling.

## Stack

- React 18 + TypeScript + Vite
- React Compiler (babel-plugin-react-compiler via @vitejs/plugin-react)
- Material UI v7 (dark theme) + Emotion

## Development

**Prerequisites**
- Node.js 20.19+ (Vite 7 requires ^20.19.0 or >=22.12.0)
- Rust toolchain in each execution environment you use (WSL and native Windows are separate installs): `rustup`, `cargo`, `rustc`, `wasm-bindgen`, and target `wasm32-unknown-unknown`

### Constants Discipline

Numbers that drive layout, sizing, timing, etc. must live in a single shared constant. When the visual tweaks change, update the constant (or add a new centralized constant) instead of applying ad-hoc adjustments like `SIZE + 2` at the call site. Layering “just this one offset” defeats the one-definition rule and makes downstream clean-up harder.

**Scripts**
- `npm install` — install dependencies; auto-installs missing `wasm-bindgen-cli` + `wasm32-unknown-unknown` target (when Rust exists), then fails fast if the local Rust/WASM toolchain for the current platform is still incomplete
- `npm run dev` — run one wasm ensure pass, start Vite, and watch Rust/domain inputs to auto-run wasm ensure on changes
- `npm run dev:vite` — start Vite dev server only (used by `npm run dev` orchestration)
- `npm run build` — production build to `dist`
- `npm run preview` — preview the built app
- `npm run typecheck` — run `tsc --noEmit`
- `npm run wasm:build:rule-engine` — compile `wasm/rule_engine_wasm` (targeting `wasm32-unknown-unknown`) and regenerate `src/lib/wasm/generated/*` bindings via `wasm-bindgen`
- `npm run wasm:ensure:rule-engine` — rebuild `src/lib/wasm/generated/*` only when relevant Rust/domain inputs are newer than generated outputs
- `npm run check:wasm-toolchain` — validate `rustc`, `cargo`, `rustup`, `wasm-bindgen`, and installed target `wasm32-unknown-unknown`
- `npm run ensure:wasm-toolchain` — run the same checks plus auto-fix (`cargo install wasm-bindgen-cli --version 0.2.114` and `rustup target add wasm32-unknown-unknown`) when needed
- `npm run test:unit` — compile + run node:test + SFC fixture runner
- `npm run test:e2e` — run Playwright against the Vite dev server in Chromium
- `npm run test:e2e:all` — run Playwright against the Vite dev server in all browsers
- `npm run test:all` — run unit/integration plus Chromium Playwright
- `npm run test:all:full` — run unit/integration plus full Playwright coverage
- `npm run release:win` — Windows: runs `npm ci` to sync `node_modules` to the committed lockfile (so the release is built from exactly what is in version control), then builds and creates a versioned zip archive in repo root
- `npm run release:win-dev` — Windows: dev build/package; leaves package.json version unchanged, skips `npm ci` (uses whatever is installed locally), and creates a `-dev` suffixed archive
- `npm run release-notes:catchup` — back-fill `docs/HISTORY.txt` for past releases and refresh the entry for the in-progress version (default updates only the newest missing release; pass `-- --all` to replay the entire backlog). For releases whose changed-line total exceeds `RELEASE_NOTES_SINGLE_PASS_LINES` (default 5000) the script switches from a single Claude run to a map-reduce flow: cheap workers (Haiku by default) review chunks of `RELEASE_NOTES_WORKER_LINES` changed lines (default 3500) and emit bullet files plus maintainer-facing items into `PRE-RELEASE-CHECKLIST.md`, then a reducer (Sonnet by default) consolidates the bullets into `docs/HISTORY.txt`. Override the models with `RELEASE_NOTES_WORKER_MODEL` / `RELEASE_NOTES_REDUCER_MODEL` (set empty to inherit the CLI default), and the heading date with `RELEASE_NOTES_DATE=yyyy-mm-dd`.

### Scripts Layout

- Committed (source) scripts live under `scripts/` and are grouped by purpose:
- `scripts/vite/assetsPlugin.ts` — injects the favicon data URL into `index.html` from a fixed allowlist ahead of dev/build runs.
- `scripts/vite/wasmInlinePlugin.ts` — resolves `sql.js/dist/sql-wasm.wasm`, encodes it once as a data URI, and injects a `__SQL_JS_WASM_INLINE__` define so static (`file://`) builds can still load gear DBs without a network fetch.
- `scripts/tooling/build-rule-engine-wasm.mjs` — builds the `wasm/rule_engine_wasm` cdylib crate for `wasm32-unknown-unknown` and regenerates `src/lib/wasm/generated/*` via `wasm-bindgen` (defaults to release profile for optimized perf validation; set `WASM_RULE_ENGINE_PROFILE=dev` for faster local iteration; release builds default `CARGO_PROFILE_RELEASE_STRIP=none` unless explicitly overridden).
- `scripts/tooling/ensure-rule-engine-wasm.mjs` — compares mtimes for relevant wasm sources (`wasm/rule_engine_core/src/**`, `wasm/rule_engine_wasm/src/**`, `Cargo.toml`, `Cargo.lock`, shared domain-constant inputs, and the wasm build scripts) against generated outputs and invokes `build-rule-engine-wasm.mjs` only when outputs are missing/stale.
- `scripts/tooling/run-dev-with-wasm-watch.mjs` — dev orchestrator used by `npm run dev`; runs an initial ensure, starts `npm run dev:vite`, and polls Rust/domain source inputs (`wasm/rule_engine_core/src/**`, `wasm/rule_engine_wasm/src/**`, `Cargo.toml`, `Cargo.lock`, `shared/domain-constants.json`) to trigger incremental ensure checks during active development.
- `scripts/tooling/check-rust-wasm-toolchain.mjs` — verifies required Rust/WASM binaries and target installation for the current platform; with `--fix`, it auto-installs missing `wasm-bindgen-cli` and wasm target when possible.
- `postinstall` runs `npm run ensure:wasm-toolchain` before Playwright browser installation.
- `dev` now runs an initial `npm run wasm:ensure:rule-engine` pass and then keeps polling Rust/domain inputs so follow-up edits trigger fresh ensure checks while Vite stays running.
- `build`, `typecheck`, and `test:unit` still run `npm run wasm:ensure:rule-engine` first, so non-dev workflows auto-regenerate wasm/bindings as needed.
- `src/lib/wasm/generated/rule_engine_bg.wasm` is intentionally gitignored and should be regenerated locally by the ensure/build scripts instead of committed.
- `scripts/tooling/patch-esm-specifiers.cjs` — patches compiled artifacts to add `.js` extensions for Node ESM, and mirrors `src/lib/wasm/generated/` into `tmp/tsc/tests/` (SSOT for the mirror — tsc emits no `.wasm`, and without a refresh here the repro/bench harnesses silently ran whatever engine binary an earlier `test:unit` run had left behind).
- **`npm run test:unit` WIPES `tmp/tsc/tests`** (run-tests.mjs cleans before recompiling). Never run it while a long-lived harness that executes out of `tmp/tsc` (repro scripts, ad-hoc benchmarks) is still running — the harness loses its compiled modules mid-flight.
- **Before/after benchmarking pattern** (used for the 2026-07 pipeline round, 33 DBs × 4 override tiers, 132/132 output-identical, median 1.25× faster): create a `git worktree` of the baseline commit, symlink `node_modules`, build its WASM, compile its `tsconfig.tests.json`, and inject one shared harness `.mjs` into BOTH trees' `tmp/tsc/tests/tests/repro/` so serialization/hashing code is identical; the harness feature-detects post-change APIs (e.g. `configureMergedRulesFromComponents`) so each side runs its own worker sequence, records a `newApi` flag in its output (guards against running in the wrong tree — shell cwd persists between commands), fixes `now` for deterministic lastUse-windowed safeguards, and measures 3 runs per combo (discard the first, average the rest). Correctness = sha256 over `stableSerialize` of matches (incl. all per-recipe decisions), HSF export form, detection snapshot, baseline matches, and improvement-chance entries.
- Fixture quirk: `account-c` / `account-b` exist in BOTH `examples/` and `examples/OtherAccounts/` with the same id but different content — scripts that key on the account id must disambiguate by directory or they silently drop one snapshot.
- `scripts/test/run-tests.mjs` — orchestrates `npm run test:unit` (cleans `tmp/tsc/tests`, runs `tsc -p tsconfig.tests.json`, patches ESM specifiers, executes the SFC fixture runner, then runs all node:test specs emitted under `tmp/tsc/tests/tests/`).
- `scripts/test/dump-tests-sfc.mjs` — extracts SFC‑readable recipes from compiled tests (`npm run tests:extract`).
- `scripts/test/dump-goldens-all.mjs` — writes golden snapshots for curated SFC cases.
- `scripts/test/gen-hsf-from-sfc.mjs` — generates HSF from a readable SFC file.
- `scripts/test/build-hsf-from-recipe.mjs` — generates HSF from a single SFC recipe object (stdin/stdout helper).
- Fixture writers (`dump-tests-sfc.mjs`, `dump-goldens-all.mjs`, `gen-hsf-from-sfc.mjs`, `build-hsf-from-recipe.mjs`) reuse the builder output verbatim so JSON member order mirrors the RSL Helper export.
- Fixture HSFs are kept in sync with the app pipeline: `tests/integration/sfc-fixtures.runner.ts` routes every SFC through `parseSfcObject` and `computeMergedRules` so metaset expansion and obsolete-rule pruning match the UI/export behavior, then compares the full rule payloads exactly as emitted (no key reordering, no field trimming).
- Fixture organization and refresh workflow lives in `tests/FIXTURES.md` for quick reference when adding scenarios or re-generating targets.
  - `scripts/tooling/audit-l10n-widths.ts` — estimates per-locale string width/line growth to flag UI elements that need fixed sizing.
  - (one-off/migration helpers are not kept here; see below)
  - `scripts/tooling/export-catalogs.ts` — builds localized catalogs into `dist/l10n/*.l10n.json` (`npm run export:l10n`).
- `scripts/release/release-win.ps1` — Windows packaging script (`-DevBuild` opt-in for dev bundles). `scripts/release/release-win-dev.ps1` forwards to it.
- `scripts/watchers/run-db-watcher.ps1` — JSON-RPC 2.0 WebSocket db watcher. Launches the UI with a `ws://` endpoint, accepts `uploadSellfile` requests, emits `selectRule` + gear DB events, and watches `%APPDATA%\RslHelper\Config` for `.db` updates by default (disable via `-WatchGearDb:false` or override with `-GearDbPath`). Requires PowerShell 7 (`pwsh`) and will re-launch under `pwsh` if needed. Uses `[R]` to queue a sample selectRule and `[F]` to force a DB snapshot.
- `scripts/watchers/Stream-Helper-DB-to-Creator.bat` — double-click helper that requires PowerShell 7 (`pwsh`), prompts to open the official download page when `pwsh` is missing, and passes a fixed `-AppEntryPath` plus `-GearDbPath "%APPDATA%\RslHelper\Config"` into `run-db-watcher.ps1`. In-repo source points to `..\dist\index.html` for local development; release packaging rewrites that line to `..\SellfileCreator.html` before staging the `dev/` copy, so shipped bundles contain no runtime dev-vs-prod path branching.
- `scripts/watchers/cpp-example/` — standalone C++ watcher sample that mirrors the core PowerShell flow (accepts `uploadSellfile`, reads the Helper sqlite DB, converts it to `artifactLogSnapshot`, uses JSON-RPC 2.0). Build/run steps live in `scripts/watchers/cpp-example/README.md`.

- Transient/compiled helpers live under `tmp/tsc/**` and are ignored by git (see `.gitignore`). Example:
  - `tmp/tsc/scripts/scripts/tooling/export-catalogs.js` — compiled output of `scripts/tooling/export-catalogs.ts` used by `npm run export:l10n`.
- `tmp/tsc/tests/tests/**`, `tmp/tsc/tests/src/**` — TypeScript‑compiled test/lib artifacts used by `npm run test:unit` and tooling.

- Convention for non‑committed utility scripts: place them under `tmp/tsc/scripts/scripts/` and call them from npm scripts if needed. Do not check these into git; they are treated as build/test artifacts, and any ad-hoc helpers should be generated temporarily and cleaned up after use (no long-lived utilities live here).
- WASM rule engine is mandatory in this branch; worker-side generation and matcher paths always run through `src/lib/wasm/wasmRuleEngine.ts`.
  - Worker matcher evaluation runs through WASM when enabled.
  - Worker warm/build generation now routes generated branch-rule finalization (epic/legendary collapse, obsolete pruning, stable ordering) through WASM and fails closed if the WASM module is unavailable.
  - Cache reuse remains enabled in worker matcher paths; profile with representative fixtures (`npm run measure:rule-tester`) instead of cache-disable runtime flags.

### Validation Before Handoff

- For code changes (anything beyond docs and `constants.ts`), run `npm run typecheck`, `npm run lint`, and `npm run build` and fix any issues.
- Always run tests when changes may influence SFC/HSF IO or HSF rule generation logic: `npm test`.
  - Includes edits to: SFC normalize/parse/write, HSF parse/write, and any HSF rule generation behavior (e.g., permutations/minCount, thresholds Early/Late, rarity/roll schedules, level windows, wildcard and caps handling, pruning/feasibility filters).
  - These end-to-end tests validate readable SFC → normalize → builder → HSF output and catch regressions in thresholds, rarity/rank schedules, and rule shapes.
  - If a test needs to be updated due to an intentional behavior change, adjust the test alongside the implementation so they remain in sync.
- End-to-end coverage lives under `tests/playwright/` (Playwright). Use `npx playwright test tests/playwright/smoke.spec.ts --project=chromium --reporter=list` as a smoke check before running heavier specs.
  - The dev server binds `127.0.0.1:5182`; when the Claude sandbox reports `EPERM`, rerun the Playwright command with `with_escalated_permissions: true` so Vite can listen on that port.
  - All specs import `test`/`expect` from `tests/playwright/fixtures.ts`; that fixture streams browser console output and page errors to the CLI so debugging works even without an interactive browser.
- Remove temporary debugging, scaffolding, or exploratory code once a change is validated so the repository only reflects the final implementation.
- Production bundles must stay silent: wrap `console.*` calls in `if (import.meta.env.DEV)` or remove them so release builds never write to the browser console.

### Build Variants (DEV / TEST / RELEASE)

There are three build variants, distinguished by two **compile-time** flags so the gated code
is genuinely tree-shaken out — not merely runtime-dead. (A flag routed through a runtime
function is *not* statically foldable, so the minifier keeps it; verified by grepping the
release bundle, which previously still contained `capturePackets`/`logWasmHeap` strings.)

| Variant | How built | `import.meta.env.DEV` | `__ALLOW_TEST_HOOKS__` | Contains |
|---|---|---|---|---|
| **DEV** | `vite dev` / `npm run dev` | `true` | `false` | dev tools + dev logging; no test hooks |
| **TEST** | e2e build (`VITE_TEST_HOOKS=1 npm run build`, set by the Playwright `webServer.env`) | `false` | `true` | prod-like + test hooks; no dev tools |
| **RELEASE** | `npm run build` / `build:web` | `false` | `false` | neither — clean |

- **DEV-only code** (dev logging, dev labels, the `?capturePackets` capture tool) is gated on
  a **direct, foldable** `if (import.meta.env.DEV) { … }`. Vite replaces the literal with
  `false` in non-dev builds and the branch (and any module it solely references) is eliminated.
  Do NOT route a DEV gate through a runtime helper (e.g. `getCapturePackets()` returning a
  computed value) — that defeats folding and ships the code. `?capturePackets` (see
  `lib/packetCapture.ts`) is a DEV tool: its call sites are wrapped in `if (import.meta.env.DEV)`
  so the whole module tree-shakes out of TEST and RELEASE.
- **TEST hooks** (capabilities needed by e2e but never by users) are gated on
  `ALLOW_TEST_HOOKS` from `src/lib/testHooks.ts`, backed by the `__ALLOW_TEST_HOOKS__` Vite
  `define` (false unless `VITE_TEST_HOOKS=1`). The only current one is `?logWasmHeap`, which
  stashes the rule-cache worker's WASM heap on `window.__wasmHeapMB` for the leak spec to read
  (`performance.memory` on the main thread cannot see the worker heap). It is present only in
  TEST builds and stripped from DEV and RELEASE.
- Note `data-tour-id` / `data-gear-inspector-grid-card` style DOM hooks are plain attributes
  and intentionally ship in all variants (used by both the in-app tour and tests).

### Runtime Launch Parameters

- `SellfileCreator.html` (and the dev build at `dist/index.html`) reads the launch URL’s `endpoint` query parameter and exposes it via `window.__APP_CONFIG__`. Passing `?endpoint=ws://localhost:8765/` sets the WebSocket `pushEndpoint` for the entire session. The `#endpoint=` hash alias also works as long as it points to a `ws://` or `wss://` URL.
- When `pushEndpoint` is defined, “Export Sellfile” sends an `uploadSellfile` request over the active WebSocket. Without the parameter, the browser still downloads the file locally. The export button label switches to “Push …” and its tooltip references the active endpoint so users can confirm the target.
- Incoming events are delivered over WebSocket notifications: `selectRule`, `gearDbFile`, `gearDbRawSnapshot`, and `gearDbRawDelta` (see the WebSocket protocol docs for exact payload shapes).
- `scripts/watchers/run-db-watcher.ps1` demonstrates how an external tool can open the packaged app via `Start-Process`, append the encoded WebSocket endpoint automatically, and host a local WebSocket listener that persists incoming `uploadSellfile` payloads to disk (defaults to `exported-sellfile.hsf`, configurable via `-OutputPath`). The script targets PowerShell 7 (`pwsh`), emits demo `selectRule` events via `[R]`, provides `[F]` to force a DB snapshot, and optionally watches `%APPDATA%\RslHelper\Config` for `.db` changes so the Gear Inspector refreshes without manual drag-and-drop.

### Single Source of Truth

- No duplication of logic or data. Centralize and import instead of re-encoding knowledge in multiple files.
- Domain catalogs, enums, and formatting live in `src/lib/types.ts` (artifact sets/types, rarity/rank/faction, `StatVariant`, and slot constraints). Consumers must use these exports and not redefine them.
- Cross-language constants (used by both TS and Rust) must be added to `shared/domain-constants.json` and generated via `scripts/tooling/generate-domain-constants.mjs`; never duplicate those values directly in `src/**`, `wasm/rule_engine_core/src/**`, `wasm/rule_engine_wasm/src/**`, or `wasm/rule_engine_native/src/**`, and never hand-edit generated constant files.
  - Sections in `domain-constants.json`: artifact type IDs, stat IDs, rarity codes, rank codes, level sentinels and milestones, substat slot count and max rolls per slot, StatVariant bit encoding, auto-rarity schedule arrays, safeguard activation/match tokens, faction IDs and names, artifact type display names, stat variant display labels, allowed mains/subs per slot, substat minima by star rank.
  - `shared/sfc-label-test-vectors.json` holds canonical input/expected-output pairs for label parsers; consumed by both Rust `#[test]` (in `sfc_reader.rs`) and Jest (`tests/unit/sfc-label-symmetry.test.ts`). Update it whenever a label mapping changes, not after the fact.
- HSF schema and stat converters live in `src/lib/hsfTypes.ts`. App code should use `StatVariant` and helpers rather than rolling custom `{ id, flat }` handling.
- UI/app constants (storage keys, sizes, timing, tooltip keywords, typography scale) live in `src/lib/constants.ts`.
  - Font tiers: display heading (32px) for the hero, base text (15px) for content, secondary text (12px) for chips/controls, 10px badges, and markdown explicitly pinned to 16px.
  - All small buttons share the 15px base font via the theme override and `SMALL_BUTTON_HEIGHT_PX` (28px) so identical controls stay visually aligned across locales.
- When a value must be used in multiple places, extract a constant or enum once and reference it (avoid copy/paste).
- Preview display preferences are centralized in `src/state/preferencesState.tsx`. Components read/write them via `useDisplayPreferences` and `useDisplayPreferenceActions`; no component should touch the underlying localStorage keys directly.
- Local storage persistence helpers:
  - `src/state/localStorageStore.ts` exposes a typed store factory (`createLocalStorageStore`) that normalizes key access, snapshotted state, and subscription notifications so components avoid writing bespoke Effects for persistence.
  - `src/state/colorBlindPreference.ts`, `src/state/rulesFilterPersistence.ts`, `src/state/rulesTableColumnsPreference.ts`, and `src/state/setsOrderPreference.ts` all wrap that store to provide domain-specific hooks (`useColorBlindPreference`, `useRulesFilterOpenPreference`, `useRulesFilterStatePreference`, `useRulesFilterCollapsedPreference`, `useRulesTableColumnsPreference`, `useSetsOrderPreference`) consumed by `App`, `RulesFilterPanel`, and `HsfRulesTable`.
  - Builder-specific preferences (e.g., `useAutoResetAfterInsertPreference`) live in `src/state/builderPreferences.ts` and continue to follow the same store contract so every preference path shares a single persistence mechanism.

### Native DLL (rule_engine_native)

`wasm/rule_engine_native/` is a Rust `cdylib` crate that exposes the same HSF
generation logic as the WASM module via a C ABI.  It is used by external tools
(e.g. an RSL Helper plugin written in C#) that need to produce sell-file rules
without a browser or Node runtime.

**C-ABI surface**

```c
// Generate merged HSF rules + per-artifact improvement chances from an SFC + artifact list.
// input_json : UTF-8 null-terminated JSON string (NativeInput schema, see rules-and-data.md).
// Returns    : heap-allocated UTF-8 null-terminated JSON string (NativeOutput schema).
//              On any error returns {"error":"<message>"}.  Never returns NULL.
//              Caller MUST release the pointer with sfc_free.
char* sfc_generate(const char* input_json);

// Release memory returned by sfc_generate.
void sfc_free(char* ptr);
```

**Build commands**

```sh
# Linux / WSL — debug .so (for integration tests)
cargo build -p rule_engine_native

# Windows release .dll (from Developer Command Prompt or cross-compiler)
cargo build --release --target x86_64-pc-windows-msvc -p rule_engine_native

# Cross-compile from WSL using MinGW (alternative)
cargo build --release --target x86_64-pc-windows-gnu -p rule_engine_native
```

Output locations:
- `wasm/target/debug/librule_engine_native.so` (Linux/WSL debug)
- `target/release/rule_engine_native.dll` (Windows release)

**C/C++ smoke test**

`example/main.cpp` is both integration-test and sample code.  It loads the
DLL at runtime, calls `sfc_generate` with a hardcoded minimal payload, validates
the output, and exits 0 on success / 1 on any failure.

```sh
# Build and run (Linux/WSL):
cd example && make run
```

The test verifies: `rules` array non-empty, at least one rule with `Keep=true`,
`improvementChances` key present, no `error` key.  The CI build treats a non-zero
exit as a regression.

**Internal pipeline** (per call to `sfc_generate`)

1. Deserialize `NativeInput` JSON.
2. Parse human-readable SFC via `sfc_reader::parse_sfc` (label strings → numeric codes).
3. For each recipe, call `recipe_builder::prepare_recipe` then `build_hsf_rules_for_recipe`.
4. Normalize compact artifact rows to `SafeguardWasmArtifactIn` + `TestItemRaw`.
5. When safeguards are enabled, call `collect_and_compute_safeguard_protection_core`.
6. Assemble `ComputeMergedRulesIn`, call `compute_merged_rules_core` → `Vec<RuleRaw>`.
7. Call `compute_improvement_chance_core` → `Vec<ImprovementChanceEntry>`.
8. Serialize `NativeOutput` and return as a heap-allocated `CString`.

**Relationship to the WASM module**

Both `rule_engine_wasm` and `rule_engine_native` depend on `rule_engine_core`.
The WASM crate uses `#[wasm_bindgen]` and `JsValue`; the native crate uses
`extern "C"` and JSON strings.  The SFC label-parser module (`sfc_reader`) and
recipe normalizer (`recipe_builder`) live in `rule_engine_core` so both
compilation targets share the same parsing logic without duplication.

### WASM Linear Memory Management

WASM linear memory is a flat address space managed by `WasmDynamicTalc` (vendored talc 5.0.3, see `wasm/vendor/talc/`) with `WasmGrowAndClaim` source. Pages grow on demand but never shrink; freed allocations return to talc's free list but the high-water mark only increases. On Windows, V8 commits WASM pages lazily from the virtual address space, and if the system cannot commit a new page (fragmented committed memory, heavy concurrent usage) `memory.grow` fails with a `STATUS_ACCESS_VIOLATION` that kills the renderer worker process. To mitigate this, `pre_grow_memory_value` is called at warmup time to pre-commit WASM pages in 16 MiB chunks up to 256 MiB, so the allocator rarely needs to call `memory.grow` during the pipeline hot path.

**Engine-gated pre-grow (Gecko/Firefox skips it)** — the 256 MiB pre-grow is a *V8/Windows-specific* workaround for the lazy-commit `memory.grow` rejection described above. Gecko/SpiderMonkey honors the incremental grows dlmalloc issues on the hot path, so the pre-grow buys it nothing — and the eager 256 MiB commit is actively harmful there: multiplied across the rule-cache worker + main-thread WASM instances (and any transient sql.js import heap that peaks in the same window, e.g. during a burst of endpoint binary DB pushes), it pushes the Firefox content process past its memory ceiling and SIGSEGVs it. `preGrowTargetBytesForEngine()` in `src/lib/wasm/wasmRuleEngine.ts` detects Gecko via the UA (no `userAgentData` + a `Firefox` token) and returns `0` (skip pre-grow) there while keeping the full `PRE_GROW_TARGET_BYTES` on V8; both call sites (worker `initWasmRuleEngineFromModule` and main-thread `warmupWasmRuleEngine`) route through this single helper. The Firefox SIGSEGV was reproducible at ~2/4 runs of `binary-endpoint-memory.spec.ts` on `firefox-perf` before this change and 0/4 after.

Because skipping the pre-grow means dlmalloc now grows on demand on Gecko, the risk it must NOT reintroduce is allocator **fragmentation** — mismatched free-list holes that only appear when allocation *sizes* vary run-to-run. The `binary-endpoint-memory` spec re-imports a single DB with a fixed rule set, so it never produces that variance. `binary-endpoint-fragmentation.spec.ts` is the dedicated guard: it runs 32 cases crossing the four real RSLHelper DB captures (≈708 KB → 1.4 MB, varying artifact-row buffers) with lategame.sfc's account-level + keep-toggle recipe overrides (varying rule-set buffers), pushing each over the WebSocket endpoint and asserting the page never crashes. The crash signal (`page 'crash'` / `pageerror`) is engine-agnostic, so it catches the Firefox content-process SIGSEGV directly rather than relying on the Chromium-only `performance.memory` heap assertion. It is registered in `PERF_SPECS` (serialized, `<browser>-perf` project). The shared override-toggle helpers live in `tests/playwright/note-overrides-helpers.ts`.

**Incremental-update leak — cache invariant rule inputs WASM-side.** During RSL Helper
farming the gear DB updates repeatedly on a *growing* inventory; the app used to crash after
a few dozen updates. Root cause: every artifact push re-ran the final rule-merge WASM call
(`compute_merged_rules_value`) with a ~34 MiB JSON payload = ~17 MiB base+custom rules + ~17
MiB safeguard detection snapshot. The rules are **invariant across pushes within a session**
(they derive from the fixed SFC), so re-sending them churned talc with repeated large
same-size transients; talc never shrinks, so it periodically grabbed another permanent ~85
MiB slab and the worker WASM heap stepped up unbounded (525→614→700→785 MB…) until the content
process crashed. Reproduced and measured with `tests/repro/repro-incremental-growth.ts`
(`npm run repro:incremental-growth`, a Node leak-localizer that samples
`getWasmLinearMemoryBytes()` per pipeline phase over a growing artifact set) and the browser
spec `tests/playwright/endpoint-incremental-updates.spec.ts`.

Fix — cache the invariant merge inputs in `ENGINE_STATE` and send only the per-push detection
snapshot:
- `compute_merged_rules_core` splits into `build_generated_rules_core` (cacheable:
  base+custom+final-sell rules after the omit/dedupe transforms) and
  `finish_merge_with_generated` (per-push: safeguard injection + `line_idx`). The composition
  stays byte-identical, and `rule_engine_native` still calls the unified core.
- `EngineState` caches `cached_generated_rules` + `cached_safeguard_rules` +
  `cached_safeguard_enabled` (both rule sets are session-invariant), preserved across
  `configure_engine`. New exports `cache_generated_rules_value` (stores the invariant half) +
  `compute_merged_rules_cached_value` (per-push: detection snapshot only). The old monolithic
  `compute_merged_rules_value` export was removed.
- `computeMergedRulesFromComponents` (`merge.ts`) is the single merge path for both the worker
  and the main thread, gated by a caller-supplied `rulesCacheKey` (the worker passes
  `computeRecipeKey`, which already hashes safeguard content; the main thread always-refreshes).
  The cached wrapper self-heals on a cache miss (re-cache + retry) — no legacy fallback path.
- The worker also gates the `configure_engine` call on the same key (a second per-push churn
  site); the engine preserves its `BucketedRules` across pushes.
- The per-pipeline `preWarmHeapWithLoadedWasm` calls were **removed** — measured to have zero
  effect on heap stability once per-push allocation pressure was gone. (The 256 MiB
  Gecko-gated warmup pre-grow is unchanged; it guards a different, V8/Windows-specific path.)

Result: the worker WASM heap stays flat across 60+ growing-inventory rounds (Node ~485 MB
plateau, Chromium ~582 MB, Firefox ~310 MB with zero growth) versus the old unbounded
stepping; cached output is byte-identical to the legacy merge.

**talc 5.0.3 ABOVE_FREE bug and patch** — talc 5.0.3 has a bug where the `ABOVE_FREE` tag flag can become stale on an allocated chunk after the free gap above it is consumed. When that chunk is later freed, `deallocate()` reads `gap_base_to_size(chunk_end)` (now user data from the allocation that consumed the old gap), obtaining a huge garbage value; `chunk_end.add(garbage)` flies past WASM linear memory and traps with "memory access out of bounds". The bug manifests after repeated large serde_json serializations (each exponential `Vec<T>` doubling frees a block, leaving ~15 blocks of sizes 256→512→…→8 MiB in the free list for the next pipeline iteration to trigger the stale path). The fix is applied directly in the vendored copy (`wasm/vendor/talc/src/base/mod.rs`, grep `TALC-PATCH`): `talc_gap_looks_valid()` cross-checks the base-size word against the end-size word before trusting `ABOVE_FREE`. A real gap has both words equal; a stale flag produces a mismatch and the coalesce is silently skipped — no data loss, only a missed coalescing opportunity for that one free. The fix is confirmed by 10/10 harness passes with plain `WasmDynamicTalc` and no workaround shim.

**Supporting fixes** that reduce the probability of triggering the bug:

1. **`Arc<str>` for `RuleRaw` string fields** (`rule_engine_core/src/lib.rs`) — `RecipeName`, `source`, `safeguard_rule_id`, `safeguard_hash`, and `Condition` (on `RuleSubRaw`). Cloning a `RuleRaw` now costs only atomic counter increments, eliminating the heap-allocation cascade that caused OOM in `finalize_generated_rules_core`'s obsolete-pruning path.

2. **`prewarm_for_json_parse` + `serialize_json_prealloc`** — before every large `serde_json` de/serialization, a Vec<u8> of the payload size is allocated and immediately dropped. This gives talc a clean large free block so the first growth event reuses it rather than fragmenting the free-list. On the output side, the result Vec is pre-sized to ~500 bytes × item count so `serde_json::to_writer` needs 0–1 reallocs instead of ~17.

**Minified JSON wire format** — The heavy-payload WASM exports (`compute_merged_rules_value`, `configure_value`, `store_artifact_rows_value`, `flatten_rule_batches_with_total_limit_value`, `finalize_generated_rules_value`) take and return JSON strings via `serde_json` instead of `JsValue` via `serde_wasm_bindgen`. For 45k-rule workloads the serde_wasm_bindgen path exhausted the externref table. Rule fields are minified using `#[serde(rename = "short")]` attrs in the Rust wire structs (SSOT: `wasm/rule_engine_core/src/wasm_merged_rules_wire_format.rs`; TS projection helpers: `src/lib/wasm/wireProjections.ts`). Non-finite f64 values (NaN, Infinity) are filtered to `None` in the wire conversion since JSON cannot represent them.

**Rust-side structural fixes** (`rule_engine_core`)

**1. Drop-before-allocate in `configure_engine`** (`lib.rs`)

`configure_engine` rebuilds `BucketedRules` on every pipeline run. The old code built the new `BucketedRules` while the previous `EngineState` (containing the old rules) was still live, creating a double-allocation window. The fix extracts and drops the previous `EngineState` before calling `BucketedRules::from_rules`, so talc can recycle the freed blocks instead of growing the heap. The `stored_rows` payload is preserved across the drop and re-attached to the new `EngineState`.

**2. Lazy merge in `BucketedRules`** (`matcher_evaluator.rs`)

Rules partition into `shared` (no slot constraint) and `per_slot` (slot-specific) at configure time. Both groups are stored exactly once; `evaluate_item` merges them lazily via a zero-copy two-pointer sorted merge. This reduces `BucketedRules` peak memory from ~3–5× input to ~1× input. `per_slot` uses a `HashMap<i64, Vec<PreparedRule>>` with at most 9 entries (one per slot type) — too small to require contiguous-memory attention.

**3. BTreeMap / BTreeSet throughout `improvement_chance.rs`**

`HashMap` and `HashSet` use a single contiguous backing array that must be reallocated (doubled in place) on each resize. On a fragmented WASM heap, finding a multi-hundred-KB contiguous block for a resize fails with `STATUS_ACCESS_VIOLATION`. Every collection in the improvement-chance hot path that scales with artifact or rule count has been converted:

| Old type | New type | Max size | Risk |
|---|---|---|---|
| `HashMap<StateKey, f64>` (memo) | `BTreeMap<StateKey, f64>` | per-artifact recursion depth | was primary crash site |
| `HashMap<i64, i64>` (recursion state) | `BTreeMap<i64, i64>` | ≤4 entries | small, consistent |
| `HashMap<i64, Vec<usize>>` (`idx_by_id`) | `BTreeMap<i64, Vec<usize>>` | up to 7 982 entries (~290 KB contiguous) | high |
| `HashMap<i64, Vec<&UpgradeScenario>>` (`scenarios_by_id`) | `BTreeMap<i64, Vec<&…>>` | up to 7 982 entries | high |
| `HashSet<i64>` (`applicable_ids`) | `Vec<i64>` (sorted, binary_search) | up to 7 982 entries, reused via clear+extend | medium |

`BTreeMap`/`BTreeSet` allocate individual B-tree nodes (each a few hundred bytes), so growth never requires a single large contiguous block. `HashMap` entries that are bounded-small and outside the hot path (`weights`, `challengers_by_count_key`, `expected_gain`, `fallback_gain`) are left as `HashMap`.

`StateKey` derives `Ord, PartialOrd` (arrays of `(i64,i64)` implement `Ord` automatically) to satisfy the `BTreeMap` key constraint.

**4. Undo-redo in `compute_probability`** (`safeguards/improvement_chance.rs`)

The old code cloned the `HashMap<i64,i64>` substat state before each recursive call. With millions of branches across all artifacts, this allocated and freed millions of small HashMap backing tables; fragmentation raised the heap high-water mark by 50–70 MiB per run. The fix mutates the live state in-place and restores the original value after each recursive call (undo-redo pattern). Additional micro-optimizations: `StateKey` is stack-allocated (zero heap per call); candidate/variant buffers are stack arrays `[0i64; 12]` / `[0i64; 4]`; the memo `BTreeMap` is allocated once before the artifact loop and `.clear()`'d (not re-allocated) between artifacts.

**Worker-side mitigations** (`ruleCacheWorker.ts`, `useRuleCacheWorker.ts`)

- **Heap prewarm before improvement-chance / eval-collect — REMOVED.** The worker previously
  called `preWarmHeapWithLoadedWasm(N)` before those phases to force `memory.grow` outside the
  critical path. With the incremental-update leak fix (cached rules, no per-push rule churn)
  these prewarms measured zero heap-stability effect and were removed to cut per-push work.
  The `preWarmHeapWithLoadedWasm` export remains for the repro harnesses only. (The Rust-side
  `prewarm_for_json_parse` inside the WASM JSON exports is separate and stays.)
- **clearStoredRows after eval-collect**: drops the 7 970-item `stored_rows` Vec (~16–20 MiB) before `computeMergedRulesFromComponents`, giving talc headroom for the contiguous rules Vec.
- **Fatal trap recovery**: a caught `RuntimeError` matching `unreachable` (WASM OOM abort) or `out of bounds` (allocator metadata corruption) is detected by `isWasmFatalTrap()` in the worker catch block and by the `case 'error'` handler in `useRuleCacheWorker.ts`. The worker resets its WASM init flags; the main thread calls `replaceWorkerAfterRuntimeError()` so the next pipeline starts with a fresh heap.
- **Proactive worker cycling**: `useRuleCacheWorker` tracks `completedPipelineCountRef` and `lastWasmLinearBytesRef`. When `completedCount >= PIPELINE_RESTART_INTERVAL` (5) or `heapBytes >= WASM_HEAP_RESTART_BYTES` (150 MiB), `cycleWorkerProactively()` terminates the old worker and spawns a fresh one. The counter increments even for JS-side aborted pipelines (the worker still ran them), preventing dirty heaps from carrying over on rapid-fire requests.
- **Diagnostics**: `log_talc_counters(label)` WASM export logs a timestamped pipeline phase marker to the worker console (useful for correlating log output with repro-harness stages). `heap_integrity_check()` exercises the allocator with a 4 KiB canary alloc+verify+drop cycle.

**Warmup-promise hardening** (`wasmRuleEngine.ts`, `ruleCacheWorker.ts`, `dungeonSimulatorWorker.ts`)

If `initRuleEngineWasm()` (or `warmupWasmRuleEngine()`) rejects, the cached promise was previously permanent — every subsequent WASM call would reject forever until the worker process was replaced. The fix wraps the `await` in a `try/catch` that nulls the cached promise on failure, allowing the next pipeline request to retry initialization.

### Build Output (Single File)

- The build produces a single self-contained `index.html` (JS and CSS inlined) via a custom Vite plugin in `vite.config.ts`.
- Minification: uses Terser with aggressive but safe compression (drops `console`/`debugger`, two compress passes, identifier mangling, strips comments) and targets modern runtimes (`es2018`).
- Source maps are disabled and asset size reporting is skipped to keep the artifact lean.
- `sql.js` bundles its own Node fallbacks; `vite.config.ts` aliases `fs`, `path`, and `crypto` to small shims under `scripts/vite/shims/` so Rollup stops warning about those built-ins during browser builds. Keep the shims in sync if the dependency ever grows additional Node-only requires.
- To adjust minification/target, edit `build` in `vite.config.ts`.

### Type Safety & Linting

- Domain types first: use the exported enums and opaque types (`StatVariant`, `RankCode`, `RarityCode`, `Faction`, etc.) instead of bare `string`/`number`. Only convert to legacy `{ id, flat }` payloads or raw codes at IO boundaries, and keep those conversions documented alongside the boundary helpers.
- Prefer discriminated unions or branded wrappers over ad-hoc flags when widening functionality; this keeps the TypeScript compiler enforcing intent for future refactors.
- TypeScript compiler (see `tsconfig.json`):
  - `strict: true`, `alwaysStrict: true`
  - `noUncheckedIndexedAccess: true`
  - `exactOptionalPropertyTypes: true` (omit optional keys instead of `undefined`)
  - `noImplicitReturns: true`, `noImplicitOverride: true`
  - `noUnusedLocals: true`, `noUnusedParameters: true` (catch unused at compile time; underscore to intentionally ignore)
- ESLint:
  - Plugins: `@typescript-eslint`, `react`, `import`, `react-hooks`, `react-you-might-not-need-an-effect`
  - Key rules: `@typescript-eslint/no-explicit-any: error`, `react/jsx-no-undef: error`, `react/react-in-jsx-scope: off`, `react/prop-types: off`, `react-you-might-not-need-an-effect/*: warn`
  - Scripts: `npm run lint`, `npm run typecheck`
- Dev-time checks: Vite runs a TypeScript-only overlay using `vite-plugin-checker`.
  - Note: ESLint overlay is disabled due to ESLint 9 + flat-config integration issues; run ESLint via `npm run lint`.

Coding patterns adopted during the refactor (required for PRs):
- Conditional spreads for optional fields: only add optional object keys when values are defined (satisfies `exactOptionalPropertyTypes`).
- Index safety: when `noUncheckedIndexedAccess` applies, add bounds checks or use non-null assertions (`!`) only after guarding lengths/indices.
- Unknown inputs: treat pasted/uploaded JSON and DOM/drag/clipboard data as `unknown`; parse via small, focused type guards.
- Style/prop values: avoid passing `undefined` into style props/components. Provide explicit defaults or omit the prop.
- Arrays and reordering: copy arrays before mutation; guard splice/swap indices to avoid `undefined` reads.
- CRC32 table and binary searches: keep tables/arrays typed; add non-null assertions in tight loops when indices are ensured valid.

## Release Packaging (Windows)

- Uses native Windows `Compress-Archive` to create ZIP files with predictable metadata (no PowerShell community modules).
- Build via `npm run build`, export localization catalogs (`npm run export:l10n`), and stage README translations so the ZIP ships with ready-to-edit templates under `i18n/`.
- Stage helper resources under a `dev/` subdirectory when present (`scripts/watchers/run-db-watcher.ps1`, `scripts/watchers/Stream-Helper-DB-to-Creator.bat`, `websocket-jsonrpc.md`).
- Create a flat `release_staging` workspace, rename `dist/index.html` to `SellfileCreator.html`, generate UTF-8 BOM README `.txt` files with a `###### vX.Y.Z` badge, and add a `runme.bat` launcher.
- Preset sellfiles are generated at build time by `scripts/tooling/gen-release-hsf.mjs` from `presets/lategame.sfc` using the recipe-overrides DSL — the `lategame` and `endgame` preset tokens select the respective account-level override, and the script applies them through the same `computeMergedRules` path the app uses. The script is self-contained: it reuses `tmp/tsc/tests` when already present (production builds, which run `test:unit` first) and compiles it on-demand otherwise (dev builds that skip the test suite).
- An optional `presets/<preset>.patch.json` file can declaratively alter the base preset before generation (drop a metaset entry, soft-disable a safeguard, edit the embedded Note). The patch applier (`scripts/tooling/apply-preset-patch.mjs`, `src/lib/presetPatch.ts`) runs before `gen-release-hsf.mjs` when a patch file is detected. Schema and worked examples live in [`presets/PATCHES.md`](../../presets/PATCHES.md).
- Archive contents:
  - `SellfileCreator.html` — from `dist/index.html`
  - `README.txt` — converted from `README.md` (UTF-8 BOM; injects the version badge)
  - `README.<lang>.txt` — localized README variants converted to UTF-8 BOM text
  - `HISTORY.txt` — copied from `docs/HISTORY.txt` so the release bundle ships with the full changelog
  - `i18n/*.l10n.json` — localization templates exported from `dist/l10n`
  - `Sellfiles/Midgame_Lategame_Endgame_Sample.sfc` — copied from `presets/lategame.sfc` (with any `presets/lategame.patch.json` applied)
  - `Sellfiles/lategame-sellfile.hsf` — generated at build time from `lategame.sfc` with the `lategame` recipe-override preset applied
  - `Sellfiles/endgame-sellfile.hsf` — generated at build time from `lategame.sfc` with the `endgame` recipe-override preset applied
  - `Sellfiles/Beginner_Sample.sfc` — copied from `presets/beginner.sfc` as the minimal starter recipe
  - `runme.bat` — launches the HTML in the default browser
  - `dev/` — optional helper folder with the WebSocket watcher scripts and protocol docs when available

## Project Structure

- `src/App.tsx`: Main UI — orchestrates builder, recipes, metasets, Substat Target Values (`substatTargets`), autosave, preview.
- `src/components/HelpDialog.tsx`: In-app Help/README viewer. Bundles the top-level `README.md` (via Vite `?raw`) and renders it with the Markdown previewer used elsewhere (sanitized, read-only). The dialog paper pulls the favicon data URL from the `<link rel="icon">` tag (injected by `assetsPlugin`) to paint a richer but still translucent background that matches the app branding without duplicating the asset; the favicon layer scales to 80% of the dialog while preserving aspect ratio.
- `src/state/appState.tsx`: Context + reducer for core app state. Exposes `AppStateProvider`, `useAppState`, `useAppActions`, and `makeInitialAppState`. Fields: `customRecipes`, `metasets`, `substatTargets` (Substat Target Values), `finalSellRemainder`, `logicHubDialogTab`, `safeguardRules`, `safeguardsEnabled`, `selectedRecipeIdx`, `sfcNote`.
- `src/theme.ts`: MUI dark theme configuration.
- `src/main.tsx`: App bootstrap with `ThemeProvider` and `CssBaseline`.
  - Wraps `<App />` in `AppStateProvider`, seeding with `defaultSubstatTargets()` (Substat Target Values) and `defaultMetasets()`.
- `src/lib/constants.ts`: Centralized app-wide constants (storage keys, layout widths, UI sizes).
  - UI helpers include `UI_BG_TRANSITION` (shared background-color transition) and file accept strings `ACCEPT_HSF`/`ACCEPT_SFC` plus the dialog-specific filters `ACCEPT_SFC_FILE_DIALOG` and `ACCEPT_HSF_OR_DB_FILE_DIALOG`.
- `src/lib/merge.ts`: Pure function to compute merged rules for preview (`computeMergedRules`).
- `src/lib/hsfTypes.ts`: Shared HSF schema helpers (`variantToMain`, `variantToSub`, rank/rarity coverage, etc.) used across the builder, filters, and evaluator.
- `src/lib/iconMaps/gearsetIconMap.ts`: Manually maintained map of artifact set IDs to icon asset imports. Update when Plarium adds or renames sets; do not rely on build-time regeneration.
- `src/lib/hsfIO.ts`: HSF read/write helpers — parse `.hsf` files, build sanitized HSF payloads from merged rules, and serialize to Blob.
- `src/lib/hsfTypes.ts`: Types for `.hsf` schema (Rules/Substats).
- `src/lib/ruleEval.ts`: Pure evaluator for testing items against HSF rules (first match wins). Used by the Gear tab inside the Tools dialog.
- `src/lib/hsfBuilder.ts`: Rule builder utilities for generating permutations and thresholds.
  - Supports fixed substats: `BuilderRecipe.fixedSubstatsV` (subset of `substatsV`) are always included in generated combinations.
  - Exposes `defaultSubstatTargets()` and `SubstatTargetTable` to configure per-rank Substat Target Values (1★..6★). Internally these tables are StatVariant-keyed (numeric) for speed; SFC export converts them to label-keyed maps for readability. `SubstatTargetTable.anyRankDefaultsTo` controls which star bucket fills in those values when a config uses Rank = Any (defaults to 6★). SFC payloads continue to use the `Minima` property name for backward compatibility.
- `src/lib/sfcIO.ts`: SFC read/write helpers used by Save/Copy/Paste and context menus (normalize readable SFC → variant model; build readable SFC payloads from variant state; serialize to Blob). Exports labels via `labelOfVariant` (no `{ id, isFlat }`).
- `src/lib/icons.ts`: Small utility icon builders (e.g., `makeManageColorsIcon()` for the Manage Colors button).
- `src/lib/filenames.ts`: Export filename helpers (`sellfileFilename`, `sfcFilename`) with timestamping.
- `src/lib/clipboard.ts`: Clipboard helpers (`writeTextSafe`, `readTextSafe`) and `COPY_DIALOG_EVENT` for opening the manual copy dialog.
- `src/lib/i18n.tsx`: Minimal, strictly typed i18n layer. Exposes `I18nProvider` and `useI18n()` with `{ lang, setLang, t, registerRuntimeCatalog }`.
  - Environment behavior:
    - Dev builds: auto-detect language from `navigator.languages` across supported locales (`en-US`, `de-DE`, `fr-FR`, `es-ES`, `it-IT`, `pt-BR`, `pt-PT`, `ru-RU`, `uk-UA`, `tr-TR`).
    - Non-dev builds: default to English (`en-US`) unless a stored preference exists.
  - Persistence: stores the last selected language in `localStorage[LANG_KEY]` unless it equals the environment default (dev: auto-detected; prod: `en-US`).
  - Dev-only audit language: `empty` renders all catalog values as empty strings to surface hardcoded/untagged text.
  - `registerRuntimeCatalog(langCode, catalog)`: Registers a runtime translation catalog and switches to it (non-persistent) for contributor testing.
  - Tutorial strings, builder panel caption, and application toasts are localized via `t(...)` calls. Tutorial keys follow a `tut*` naming scheme.
- `src/hooks/useSubstatColors.ts`: Hook for substat color map defaulting and persistence.
- `src/hooks/useFileDragDrop.ts`: Hook for global file drag/drop listeners; exposes `active` overlay state.
  - Recognized file types: `.sfc` (legacy `.sfc`), `.hsf`, and `.l10n.json/.i18n.json/.l10n` (runtime localization catalogs).
  - L10n JSON schema: either `{ "lang": "xx-XX", "catalog": { ... } }` or a plain key→string map named `xx-XX.l10n.json`/`xx-XX.i18n.json` to infer `lang`.
  - Dropping an l10n file registers it via `registerRuntimeCatalog` and applies it immediately (non-persistent).
  - Help dialog includes a dev-only language select dropdown (Empty/EN/DE/FR/ES/PT-BR/PT-PT/RU/UK/TR) for quick verification. “Empty (dev)” uses blank values for all keys to highlight non-localized text.
- `src/hooks/useTutorialCoachState.ts`: Hook that owns tutorial/help gating, builds the scripted `TutorialStep[]`, maintains snapshot/restore for recipes/substatTargets/metasets/final-sell state, and exposes navigation handlers (`startTutorial`, skip/next/prev) plus overlay guards to `App.tsx`.
- `src/hooks/useSfcClipboard.ts`: Consolidates SFC copy/paste flows, prepares metaset conflict state, generates placeholder metasets for missing references, and exposes handlers used by `App.tsx` (note merging only runs when the current SFC note is empty).
- `src/hooks/useSfcDialogs.ts`: Centralizes App-level dialogs tied to SFC management (clear/delete confirmations, note view/edit modes, and manual copy/paste fallbacks), keeps the “Delete All” autosave suppression in sync, and exposes dialog setters so other hooks (e.g., `useSfcClipboard`) reuse the shared UI.

Localization status
- Built-in catalogs: `en-US` (source of truth), `de-DE`, `fr-FR`, `es-ES`, `it-IT`, `pt-BR`, `pt-PT`, `ru-RU`, `uk-UA`, `tr-TR`.
- New keys coverage: Tutorial content, builder caption, and toasts translated for DE/FR/ES/PT-BR/PT-PT.
- `src/hooks/useAutosave.ts`: Hook to write autosave payloads and flush on exit/visibility.
- `src/components/CopyDialog.tsx`: Fallback manual copy dialog (shown when clipboard writes are blocked).
- `src/components/PasteDialog.tsx`: Manual paste dialog for SFC content (single recipe, array, or full SFC object).
- `src/components/dialogs/GearInspectorTabContent.tsx`: Multi-item test UI (rendered inside the Tools dialog’s Gear tab) to check which rule/recipe matches first. Items are autosaved to `localStorage` under a dedicated key; disabled rules never match.
- `src/components/dialogs/ManageColorsDialog.tsx`: Substat colors management dialog (variant-keyed map).
- `src/components/dialogs/RestoreAutosaveDialog.tsx`: Restore autosave confirmation dialog.
- `src/components/RecipeChipsPanel.tsx`: Recipe chips list and context menu.
  - Recipe chips (visuals):
    - Rank/Rarity/Faction: compact labels; omitted when `Any`. Faction respects the “Factions as icons” toggle (icon replaces the label when enabled).
    - Slots: renders artifact type icons (same as Builder) for quick scanning.
    - Main stats: labels; adopt substat text colors when “Color stat texts” is on.
    - Substats: labels followed by a hollow roll indicator when roll bounds are set per stat:
      - Green ring + number = minimum rolls; Red ring + number = the Roll Upper Limit. The number is white; the ring has no fill.
      - No indicator is shown for “Any/Wildcard” to keep defaults uncluttered.
      - A lock emoji (🔒) appears inline after a substat name when it is locked.
    - Aggregate rolls: shows `Σr ≥ N` whenever a manual Global Min Required Rolls value is set. If a locked-only floor (`lockedMinRequiredRolls`) is active, the chip appends a separate `Σr ≥ L 🔒` badge (suppressed when both numbers match).
    - Sets: When “Sets as icons” is on, metasets with a non-`none` icon render the assigned glyph inline alongside explicit set icons; otherwise both metasets and sets render as text. `none` always shows the metaset name.
    - Separator dividers (`exportMode === 'separator'`) render as a full-width divider with an optional centered name, hide inline action icons, but remain selectable and expose the context menu for move/delete actions. Builder controls stay active so the recipe can double as a TODO note. Leading `#` characters tone down the divider (solid → dashed → dotted as the count grows) and `[RRGGBB]` tokens at the start recolor both the line and label (tokens are stripped from the rendered name, default color is the theme primary). The same color token, when used on a non-separator recipe name, recolors the inline name and context-menu icons.
- `scripts/tooling/patch-esm-specifiers.cjs`: Post-compile helper that adds `.js` extensions to relative ESM imports in compiled artifacts under `tmp/tsc/tests/src/` so Node can resolve them without a bundler. Runs as part of `npm run test:unit`.
- `npm run tests:extract`: Generates `examples/tests.extracted.sfc` containing all SFC-readable recipes used by tests (useful to load/paste into the app).
- `scripts/release/release-win.ps1`: Build-and-package script for Windows (runs tests first, builds, stages, archives). Pass `-DevBuild` to keep the current package.json version and suffix outputs with `-dev`.
- `scripts/release/release-win-dev.ps1`: Thin wrapper that invokes `release-win.ps1 -DevBuild` so both entry points stay in sync.
- `scripts/vite/assetsPlugin.ts`: Injects the favicon data URL during dev and build based on its explicit include list.

### Icon Assets Catalogs

- Runtime-ready icons live under `ico/`, broken into purpose-specific catalogs so the bundle only touches what each surface needs:
  - `ico/slots/` — slot glyph SVGs (`Weapon.svg`, `Helm.svg`, `Schild.svg`, etc.) rendered via `artifactTypeIcons.tsx`.
  - `ico/sets/` — the `.webp` glyphs for every artifact set plus the nested `ico/sets/slots/` directory that holds per-set/per-slot artwork. Artifact pieces follow `<setId>_<Slot>.webp` (slot is `Weapon`, `Helmet`, `Shield`, `Gauntlets`, `Chestplate`, or `Boots`) so numeric IDs stay aligned with the in-game order; accessory/faction pieces retain `SetName_Slot.webp` (spaces become underscores).
  - `ico/faction/` — faction crests keyed by their slugified faction names (`banner-lords.webp`, `shadowkin.webp`, etc.).
- The raw, lossless references sit in `docs/orig/ico-sets/ico-slots/` as `.png` exports following the same per-slot naming conventions. Update the PNG first, review it in-source, and then convert it to `.webp` when copying into `ico/sets/slots/` so the shipped bundle stays lean. (ImageMagick `magick <input.png> -quality 95 <output.webp>` or `cwebp` both keep the alpha channel intact; pick whichever tool you already use.)
- When Plarium adds a new set, drop the source PNGs into `docs/orig/ico-sets/ico-slots/`, regenerate the corresponding `.webp` files under `ico/sets/slots/`, and wire the IDs through whatever UI consumes them. Keeping the twin directories in sync guarantees that artists and devs share one authoritative catalog.

## Release Notes Workflow

Release history lives in `docs/HISTORY.txt` (UTF-8 with BOM). Claude orchestration follows two prompts: `docs/CREATE-RELEASE-NOTES.md` (single-pass + reducer role) and `docs/CREATE-RELEASE-NOTES-WORKER.md` (map-worker role). The script is `scripts/release/run-release-notes-catchup.sh`. Only `docs/HISTORY.txt` and `PRE-RELEASE-CHECKLIST.md` change during a run; plan files, commits, and artefact directories are untouched.

### Modes

The script picks a mode per release based on the total changed lines (numstat add+delete) in the commit range:

- **Single-pass** (≤ `RELEASE_NOTES_SINGLE_PASS_LINES`, default 5000): one Claude run reads the diffs directly, writes the bilingual entry to `docs/HISTORY.txt`, and appends maintainer review items to a per-release scratch file.
- **Map-reduce** (above the threshold): commits are split into chunks of at most `RELEASE_NOTES_WORKER_LINES` changed lines (default 3500). A worker Claude run handles each chunk, emitting a `chunk-NNN.bullets.md` file with player-facing bullets and appending maintainer concerns directly to a shared scratch file. A final reducer run consolidates the bullet files into `docs/HISTORY.txt`. Workers default to Haiku; reducer/single-pass default to Sonnet — override with `RELEASE_NOTES_WORKER_MODEL` and `RELEASE_NOTES_REDUCER_MODEL` (set either to empty string to inherit the CLI default).

Worker scratch lives in `docs/.release-notes/<version>/` (gitignored, wiped on success). After every release the script mechanically prepends the collected maintainer items to `PRE-RELEASE-CHECKLIST.md` under a new `## v<version> — <date>` heading, keeping that file newest-first.

### Workflow

1. **Sync history** — `npm run release-notes:catchup`  
   Default behaviour updates only the newest missing release entry plus the in-progress version derived from `package.json`. Pass `-- --all` (or set `RELEASE_NOTES_CATCHUP_ALL=1`) to back-fill every gap. Override the heading date for the in-progress entry with `RELEASE_NOTES_DATE=yyyy-mm-dd`; pin the scanned branch with `RELEASE_NOTES_BRANCH=<ref>`.
2. **Review the checklist** — Skim `PRE-RELEASE-CHECKLIST.md` for items the run flagged (unfinished cleanups, drifted docs, suspect regressions, schema concerns). Act on them or delete them; the file is intentionally a working document, not an archive.
3. **Gate the release** — Before packaging, confirm `docs/HISTORY.txt` already includes the upcoming `vX.Y.Z` entry and that `PRE-RELEASE-CHECKLIST.md` is empty (or only contains items you've consciously deferred). Review both diffs ahead of `npm run release:win` so the notes ship with the build.

Claude inspects diffs, not just commit messages — some commits run thousands of lines, which is why the chunker budgets by changed lines rather than commit count. Large asset updates under `examples/` are skipped unless they change player-facing behaviour. The final notes list English bullets first, then German translations covering the same points.

## Desktop App (Tauri)

This project includes a Tauri v2 desktop wrapper in `src-tauri` that loads the existing Vite app.

- Prerequisites:
  - Rust (stable toolchain) and a C compiler. On Windows, install Visual Studio Build Tools and ensure the WebView2 Runtime is present.
  - Node.js 20.19+ (for Vite) and `@tauri-apps/cli` (installed by `npm install`).

- Development (opens a desktop window and runs Vite dev server):

```bash
npm install
npm run tauri:dev
```

- Build a release desktop app (creates platform installers):

```bash
npm run tauri:build
```

Notes:
- Tauri config (`src-tauri/tauri.conf.json`) uses `npm run dev` for development and the Vite `dist` output for production builds.
- If you need native capabilities (filesystem, shell, tray, etc.), add Tauri v2 plugins and capabilities later.
