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
- `npm run typecheck` — run `tsc --noEmit` on the main project, then `npm run typecheck:scripts` (`tsc -p tsconfig.scripts.json --noEmit`). The scripts leg guards the `export:l10n` / `i18n:sync-comments` compile — `tsconfig.scripts.json` carries `vite/client` types so `import.meta.env` resolves there the same as in the app — so a break in that project fails at typecheck time instead of only at `release:win`'s catalog-export step.
- `npm run typecheck:scripts` — type-check only the scripts project (`tsconfig.scripts.json`); chained into `typecheck`.
- `npm run wasm:build:rule-engine` — compile `wasm/rule_engine_wasm` (targeting `wasm32-unknown-unknown`) and regenerate `src/lib/wasm/generated/*` bindings via `wasm-bindgen`
- `npm run wasm:ensure:rule-engine` — rebuild `src/lib/wasm/generated/*` only when relevant Rust/domain inputs are newer than generated outputs
- `npm run check:wasm-toolchain` — validate `rustc`, `cargo`, `rustup`, `wasm-bindgen`, and installed target `wasm32-unknown-unknown`
- `npm run ensure:wasm-toolchain` — run the same checks plus auto-fix (`cargo install wasm-bindgen-cli --version 0.2.114` and `rustup target add wasm32-unknown-unknown`) when needed
- `npm run fmt:rust` — format the Rust workspace with rustfmt (config in `wasm/rustfmt.toml`)
- `npm run fmt:rust:check` — read-only rustfmt gate; fails when any Rust file is unformatted
- `npm run test:unit` — compile + run node:test + SFC fixture runner
- `npm run test:e2e` — run Playwright against the Vite dev server in Chromium
- `npm run test:e2e:all` — run Playwright against the Vite dev server in all browsers
- `npm run test:all` — run unit/integration plus Chromium Playwright
- `npm run test:all:full` — run unit/integration plus full Playwright coverage
- `npm run release:win` — Windows: runs `npm ci` to sync `node_modules` to the committed lockfile (so the release is built from exactly what is in version control), then builds and creates a versioned zip archive in `releases/` (gitignored). Refuses a dirty working tree; on success commits the release and the next `-dev` version and writes a release manifest next to the zip, without tagging (see [Release commits and tags](#release-commits-and-tags))
- `npm run release:publish` — Windows: after the zip from `release:win` has been checked, tags and pushes the release, updates README/HISTORY in the public releases repository and creates the GitHub release with the zip (see [Release commits and tags](#release-commits-and-tags))
- `npm run release:win-dev` — Windows: dev build/package; leaves package.json version unchanged, skips `npm ci` (uses whatever is installed locally), and creates a `-dev` suffixed archive
- `npm run release-notes:catchup` — back-fill `userDocs/HISTORY.md` for past releases and refresh the in-progress version's entry (`-- --all` replays the whole backlog). Large releases use a map-reduce flow — see the [Release Notes Workflow](#release-notes-workflow) section for the pass/worker line thresholds and model overrides.
- `npm run release-notes:catchup:win` — PowerShell equivalent of the above for Windows, with named parameters (`-All`, `-Note`, `-Branch`, `-Date`). `-Note "<text>"` injects a maintainer instruction into every prompt of the run.

### Scripts Layout

- Committed (source) scripts live under `scripts/` and are grouped by purpose:
- `scripts/vite/assetsPlugin.ts` — injects the favicon data URL into `index.html` from a fixed allowlist ahead of dev/build runs.
- `scripts/vite/wasmInlinePlugin.ts` — resolves `sql.js/dist/sql-wasm.wasm`, encodes it once as a data URI, and injects a `__SQL_JS_WASM_INLINE__` define so static (`file://`) builds can still load gear DBs without a network fetch.
- `scripts/tooling/build-rule-engine-wasm.mjs` — builds the `wasm/rule_engine_wasm` cdylib crate for `wasm32-unknown-unknown` and regenerates `src/lib/wasm/generated/*` via `wasm-bindgen` (defaults to release profile for optimized perf validation; set `WASM_RULE_ENGINE_PROFILE=debug` for faster local iteration — any value other than `release` selects the debug profile; release builds default `CARGO_PROFILE_RELEASE_STRIP=none` unless explicitly overridden). After a successful build it writes a profile stamp next to the generated outputs so the ensure scripts can tell a debug artifact from a release one.
- `scripts/tooling/ensure-rule-engine-wasm.mjs` — compares mtimes for relevant wasm sources (`wasm/rule_engine_core/src/**`, `wasm/rule_engine_wasm/src/**`, `Cargo.toml`, `Cargo.lock`, shared domain-constant inputs, and the wasm build scripts) against generated outputs and invokes `build-rule-engine-wasm.mjs` only when outputs are missing/stale. It also rebuilds when the recorded build profile differs from the requested one: both profiles emit into the same `src/lib/wasm/generated/` directory, so without that check a debug artifact left behind by `WASM_RULE_ENGINE_PROFILE=debug npm run dev` would look "fresh" to a later release build and ship unoptimized wasm.
- `scripts/tooling/run-dev-with-wasm-watch.mjs` — dev orchestrator used by `npm run dev`; runs an initial ensure, starts `npm run dev:vite`, and polls Rust/domain source inputs (`wasm/rule_engine_core/src/**`, `wasm/rule_engine_wasm/src/**`, `Cargo.toml`, `Cargo.lock`, `shared/domain-constants.json`) to trigger incremental ensure checks during active development.
- `scripts/tooling/vite-realpath.mjs` — thin launcher that re-spawns the Vite CLI with the working directory normalized to its filesystem realpath. `dev:vite`, `build`, and `build:web` all go through it. See "Junction/symlink checkouts" below for why.
- `scripts/tooling/check-rust-wasm-toolchain.mjs` — verifies required Rust/WASM binaries and target installation for the current platform; with `--fix`, it auto-installs missing `wasm-bindgen-cli` and wasm target when possible.
- `postinstall` runs `npm run ensure:wasm-toolchain` before Playwright browser installation.
- `dev` now runs an initial `npm run wasm:ensure:rule-engine` pass and then keeps polling Rust/domain inputs so follow-up edits trigger fresh ensure checks while Vite stays running.
- `build`, `typecheck`, and `test:unit` still run `npm run wasm:ensure:rule-engine` first, so non-dev workflows auto-regenerate wasm/bindings as needed.
- `src/lib/wasm/generated/rule_engine_bg.wasm` is intentionally gitignored and should be regenerated locally by the ensure/build scripts instead of committed.
- `scripts/tooling/patch-esm-specifiers.cjs` — patches compiled artifacts to add `.js` extensions for Node ESM, and mirrors `src/lib/wasm/generated/` into each compiled tree (`tmp/tsc/tests/` and `tmp/tsc/scripts/`) (SSOT for the mirror — tsc emits no `.wasm`, and without a refresh here the repro/bench harnesses silently ran whatever engine binary an earlier `test:unit` run had left behind).
- **`npm run test:unit` WIPES `tmp/tsc/tests`** (run-tests.mjs cleans before recompiling). Never run it while a long-lived harness that executes out of `tmp/tsc` (repro scripts, ad-hoc benchmarks) is still running — the harness loses its compiled modules mid-flight.
- **Before/after benchmarking pattern** (for validating a pipeline optimization is output-identical and faster): create a `git worktree` of the baseline commit, symlink `node_modules`, build its WASM, compile its `tsconfig.tests.json`, and inject one shared harness `.mjs` into BOTH trees' `tmp/tsc/tests/tests/repro/` so serialization/hashing code is identical; the harness feature-detects post-change APIs (e.g. `configureMergedRulesFromComponents`) so each side runs its own worker sequence, records a `newApi` flag in its output (guards against running in the wrong tree — shell cwd persists between commands), fixes `now` for deterministic lastUse-windowed safeguards, and measures 3 runs per combo (discard the first, average the rest). Correctness = sha256 over `stableSerialize` of matches (incl. all per-recipe decisions), HSF export form, detection snapshot, baseline matches, and improvement-chance entries.
- Gear DB fixtures are committed as SQL dumps under `tests/fixtures/gear-db/` and built on demand into the gitignored `tmp/fixtures/gear-db/` (`scripts/test/gear-db-fixtures.mjs`, `npm run fixtures:gear-db:build|dump`); raw RSL Helper exports are never committed. See [Test Data and Privacy](test-data.md).
- `scripts/test/run-tests.mjs` — orchestrates `npm run test:unit` (cleans `tmp/tsc/tests`, runs `tsc -p tsconfig.tests.json`, patches ESM specifiers, executes the SFC fixture runner, then runs all node:test specs emitted under `tmp/tsc/tests/tests/`).
- `scripts/test/dump-tests-sfc.mjs` — extracts SFC‑readable recipes from compiled tests (`npm run tests:extract`).
- `scripts/test/dump-goldens-all.mjs` — writes golden snapshots for curated SFC cases.
- `scripts/test/gen-hsf-from-sfc.mjs` — generates HSF from a readable SFC file.
- `scripts/test/build-hsf-from-recipe.mjs` — generates HSF from a single SFC recipe object (stdin/stdout helper).
- Fixture writers (`dump-tests-sfc.mjs`, `dump-goldens-all.mjs`, `gen-hsf-from-sfc.mjs`, `build-hsf-from-recipe.mjs`) reuse the builder output verbatim so JSON member order mirrors the RSL Helper export.
- Fixture HSFs are kept in sync with the app pipeline: `tests/integration/sfc-fixtures.runner.ts` routes every SFC through `parseSfcObject` and `computeMergedRules` so metaset expansion and obsolete-rule pruning match the UI/export behavior, then compares the full rule payloads exactly as emitted (no key reordering, no field trimming).
- Fixture organization and refresh workflow lives in `tests/FIXTURES.md` for quick reference when adding scenarios or re-generating targets.
  - `scripts/tooling/audit-l10n-widths.ts` — estimates per-locale string width/line growth to flag UI elements that need fixed sizing.
  - `scripts/tooling/lib/headless-pipeline.ts` — the ONE definition of what a tooling script needs to drive the browser-oriented pipeline under `node --experimental-wasm-modules`: `installNodeFileFetch` (the `file://` fetch shim wasm-bindgen's loader relies on; `tests/setup/wasm-warmup.ts` imports it too), `syncCompiledWasmBindings`, `prepareHeadlessRuleEngine` (shim → sync → warm-up, in that order), and `loadSfc` / `loadGear`, which go through `parseSfcObject` / the gear-DB importer exactly like the app (so a script's note is the canonicalized one, never re-derived from raw JSON). Every script below imports these; do not re-declare them locally.
  - `scripts/tooling/instrument-safeguard-piece.ts` — safeguard explainer for ONE gear piece: drives the real pipeline (preset + DB + note overrides) and reports improvement-chance, top-row ranking and the detection verdict for a target artifact, with before/after substat states.
  - `scripts/tooling/measure-group-effect.ts` — safeguard **group** measurer: drives the real pipeline (preset's own keep-recipes, so pieces are actually sell candidates) and reports, for a run of safeguards, what each member keeps **alone**, the union, and grouped vs groups-stripped totals — the number that decides whether a group earns its place. The run is measured under its stored group when it has one; otherwise the tool **forms** the group itself (head's own count and chips, or `MGE_GROUP_COUNT`), so the question stays answerable against a preset that ships ungrouped. Scenario knobs are env vars (`MGE_SFC`, `MGE_DB`, `MGE_GROUP=37,38,39,40`, `MGE_MODE=lategame|none`, `MGE_DROP_BEFORE=1`, `MGE_MEMBER_COUNT`, `MGE_GROUP_COUNT`, `MGE_WEIGHT_SCALE`), documented at the top of the file; a non-numeric or out-of-range knob throws instead of silently measuring nothing. Run: `npx tsc -p tsconfig.scripts.json --noEmit false && node scripts/tooling/patch-esm-specifiers.cjs && node --experimental-wasm-modules tmp/tsc/scripts/scripts/tooling/measure-group-effect.js`. **Measure before grouping** — reasoning from filter shapes has been wrong every time it was tried (see `lategame-preset-design.md`).
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

### Junction/Symlink Checkouts (`vite-realpath.mjs`)

A checkout may be reached through a Windows junction (for example `<projects>` pointing into a synced folder such as OneDrive), so every file has two equally valid spellings. Node keeps whichever spelling you launched from in `process.cwd()`, while `fs.realpathSync()` (and esbuild/Rollup, which resolve junctions the same way) report the junction's target.

Vite mixes the two conventions internally, so launching from the junction side breaks it in two different ways:

- **`vite build`** — `vite:build-html` emits the entry at a path relative to the literal cwd, producing `../../<junction target>/…/index.html`. That escapes the output root, and Rollup rejects it: *"The `fileName` or `name` properties of emitted chunks and assets must be strings that are neither absolute nor relative paths."*
- **`vite` dev** — the dependency optimizer builds its `metafile.outputs` lookup key with `path.relative(process.cwd(), …)` while esbuild keyed the same entry off the realpath. The lookup misses, the output is `undefined`, and it throws `Cannot read properties of undefined (reading 'imports')`.

**The fix is to normalize the cwd before Vite starts**, which is all `scripts/tooling/vite-realpath.mjs` does: `realpathSync(process.cwd())`, then spawn the Vite CLI with that cwd, forwarding argv and re-raising signals so Ctrl-C isn't misread as a build failure. It is a no-op when the cwd is already its own realpath, so it is safe on any machine and in CI. It resolves the CLI entry via `vite/package.json`'s `bin` field — Vite 8 does not expose `./bin/vite.js` through its `exports` map, so `require.resolve('vite/bin/vite.js')` fails.

Notes:

- **Do not try to fix this in `vite.config.ts`.** `resolve.preserveSymlinks: true` and a custom `cacheDir` were both tested; they only change which side of the mismatch you land on.
- **`optimizeDeps.entries` must stay an exclusion list, never a positive one.** A positive `['index.html']` makes the entry list depend on how the root was spelled and reintroduces the crash even when the scan itself is fine. The negative globs are still required for a separate reason: `old_releases/*.html` are prebuilt self-contained releases whose minified Prism regexes make esbuild's scanner fail ("Failed to scan for dependencies"), which silently disables dep pre-bundling in dev.
- **Only Vite-based scripts need the launcher.** `tsc`, ESLint, cargo, and `vite preview` are unaffected — preview serves prebuilt files with no dep optimizer.

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

### README Media

The front-page images (`docs/readme/overview-{dark,light}.png`, `docs/readme/demo.webp`, `docs/readme/note.webp`) are recorded, not drawn: `npm run readme:media` runs `tests/readme/readme-media.spec.ts` under `playwright.readme.config.ts` (a build **with** the asset pack, so the images show the app as players see it; the build fails without the pack, and `README_PLACEHOLDERS=1` records placeholder art instead) on the shipped lategame preset and the `sample` gear-DB fixture, then `scripts/readme/encode-webp.mjs` turns the frames into an animated WebP with `img2webp` from Google's libwebp tools, which the `webp-converter` dev dependency ships for every platform (`IMG2WEBP` may point at another copy): full colour, crisp text, rendered by GitHub through a plain `<img>`. Re-run it after visible UI changes. `docs/readme/banner.svg` is hand-written (CSS animation, static under `prefers-reduced-motion`).

### Git Hooks and Repository Checks

`npm install` / `npm ci` runs `prepare` → `scripts/tooling/install-git-hooks.mjs`, which points `core.hooksPath` at the tracked `.githooks/` (idempotent; a no-op outside a git work tree). The hooks:

| Hook | Runs | Refuses |
| ---- | ---- | ------- |
| `pre-commit` | `check-private.mjs --staged` | private-list matches in staged content and file names; `originSessionId:` lines |
| `commit-msg` | `check-commit-msg.mjs <file>`, then `check-private.mjs --message <file>` | messages that break the commit message rules (CLAUDE.md); private-list matches in the message and in the author/committer identity about to be recorded (`git var GIT_AUTHOR_IDENT` / `GIT_COMMITTER_IDENT`) |
| `pre-push` | `check-private.mjs --push`, then `npm run check` | private-list matches in the identities, messages, file names and added lines of every commit being pushed; any failure of the full local check (there is no hosted CI) |

- **The private list** lives outside every repository: `%USERPROFILE%\.config\sellfilecreator\private-patterns.txt` (or the file named by `$SFC_PRIVATE_PATTERNS`), one JavaScript regular expression per line, `#` comments, matched case-insensitively. Literal patterns are also searched in their base64 forms. Without the file the check passes, so clones on other machines work unchanged. Findings are always printed masked (first character + asterisks). Core: `scripts/tooling/lib/private-patterns.mjs`; tests use synthetic patterns only (`tests/unit/private-patterns.test.ts`).
- **Full checks**: `npm run check:private` scans every tracked file and file name; `npm run check:commit-msg` checks every commit message reachable from `HEAD` (rules: `scripts/tooling/lib/commit-message.mjs`, tests: `tests/unit/commit-message.test.ts`); `npm run check:licenses` refuses GPL-family dependencies (npm packages, and Rust crates via `cargo deny` with `wasm/deny.toml`).
- **`npm run check`** is the full local check the `pre-push` hook runs: private data, licenses, commit messages, typecheck, lint, Rust formatting and unit tests. **`npm run test:all`** is the complete run before a release: private data, licenses, unit and end-to-end suites.
- Never bypass a hook with `--no-verify`; fix the finding instead.

### Playwright Harness

- Fixtures live under `tests/playwright/`:
  - `app-init.ts` primes localStorage, forces `isSecureContext`, and (optionally) stubs the clipboard API for deterministic tests.
  - `app-warmup.ts` preloads the shell once to avoid cold Vite compile costs in perf specs.
  - `fixture-paths.ts` is the single source of truth for Playwright fixture paths; import from it instead of hardcoding file locations.
  - `note-overrides-helpers.ts` owns the override-questionnaire drivers: `setNoteOverrideCheckbox` for the expert dialog, and for the express dialog (which has no header toggle to re-open through) `expressOverrideRow` / `selectExpressOverride` plus the shared answer labels (`ENDGAME_ANSWER_LABEL`, …). `ui-selectors.ts` holds the stable selectors, including the two dirty-dot selectors; `autosave-storage.ts` reads the account-scoped autosave entry back from the page (`readStoredAutosavePayload`). Specs import these rather than re-declaring the locator chains or key suffixes.
  - `tests/data/sample-small.sfc` (3 recipes, no Safeguards) is the fast SFC fixture for most UI coverage; `tests/data/sample.sfc` remains the large fixture for scroll/perf scenarios.
  - `tests/data/sample-small-recipe-overrides-disabled.sfc` mirrors the small SFC fixture with recipe overrides disabled (used by note/recipe-override coverage).
  - The `sample-small` gear-DB fixture (`SAMPLE_SMALL_DB_PATH`) is the slim Gear Inspector fixture for Playwright; `sample` stays reserved for unit tests and offline tooling. `tests/playwright/global-setup.ts` builds all gear-DB fixtures and unpacks the sample-log capture once before the workers start ([Test Data and Privacy](test-data.md)).
- Specs:
  - `tests/playwright/smoke.spec.ts` is the canonical health-check (run single-browser only for targeted debugging, e.g. `npx playwright test tests/playwright/smoke.spec.ts --project=chromium --reporter=list`).
  - `tests/playwright/recipe-insert-order.spec.ts` guards the “paste after” ordering regression by loading `tests/data/sample-small.sfc`, performing copy/paste, and verifying row ordering.
  - `tests/playwright/builder-recipe-switch-perf.spec.ts` seeds a tiny autosave payload (two recipes) to measure a single recipe switch without SFC import overhead.
  - `tests/playwright/keep-unique-disabled-clone-sell.spec.ts` seeds a tiny Gear Inspector autosave payload (no DB import) to verify recipe-duplicate behavior with recipe overrides disabled.
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
- **Worker count is capped, and the cap is load-bearing.** `playwright.config.ts` runs half the
  CPU cores locally, clamped to `LOCAL_WORKER_CAP` (8); CI stays at 2, and the `*-perf` project
  is launched separately with `--workers=1`. The cap exists because a bare `'50%'`
  over-subscribes a high-core workstation: every worker drives its own Chromium against the
  ~15 MB single-file bundle, so a 32-core box ran 16 browsers competing for memory bandwidth
  and the GPU process. The app then misses ordinary action budgets and specs fail on
  wall-clock rather than behavior — **a false red that reads exactly like a product
  regression**. Measured here: `note-overrides-preset-file`, `simple-mode-custom-tab` and
  `safeguard-groups` failed 2–3 of 24 at 16 workers and passed 24/24 at 4, on the same commit
  and machine; the full FHD suite is 90/90 at the capped 8. Machines at 16 cores or fewer are
  unaffected (50% already lands at or under the cap). If specs go unstable on a new machine,
  check the resolved worker count (Playwright prints `Running N tests using W workers`) before
  suspecting the app — and never "fix" it by raising a timeout.
- Timeout policy:
  - Timeouts are centralized in `tests/playwright/timeouts.ts`; adjust them there instead of hardcoding new values.
  - `testDefault` is 3s and should cover most UI specs; only rule rebuild or matcher workflows may use `testLong` (15s).
  - Expect/wait budgets follow the same split: `expectDefault` (3s) for general UI, `expectLong` (15s) only when a rule rebuild or matcher run is the explicit action under test.
  - Initial app-shell mounts may use `appGoto` (15s) for the first visible control in perf/modal specs; the rest of the interactions must stick to the 3s defaults.
  - Long timeouts are justified only for app-shell boot, SFC imports, recipe rebuilds, or Gear Inspector matching; everything else must stay on the 3s defaults.
  - If a test needs more than 15s, shrink the fixture (use `sample-small.sfc` / the `sample-small` gear-DB fixture) or split the scenario; do not increase timeouts.
  - Do not add new timeout tiers or increase these values; if a test exceeds 15s, reduce the workload, improve readiness checks, or split the scenario.
  - **Diagnose, never bump.** A longer timeout never makes a correct test pass faster and never fixes a broken one — it only makes the failure slower. When a spec is slow or flaky the cause is almost always a *wrong wait*, not a *short ceiling*. Find what is actually being waited on before touching any budget. The binary-endpoint specs once carried 10–20-minute ceilings purely to mask a `waitFor({ state: 'visible' })` that blocked its full timeout every time the spinner showed-and-hid before Playwright polled it; the fix was the wait, not the number.
  - **A vanished element can be correct app behavior, not a lost race.** Before treating "element(s) not found" as flake, check whether the app legitimately removed it. Both note-override helpers failed reproducibly on account-mode transitions in `binary-endpoint-fragmentation.spec.ts` for one shared reason: toggling an override rewrites the note's active recipe set, and when that resolves to a document with no note (e.g. unchecking the last active mode) App's `closeNoteAfterLoad` closes the dialog. `closeNoteDialog` hit it as "Close button not found"; `setNoteOverrideCheckbox` hit it as a 15s `waitForFunction` timeout scanning a page with no dialog. Neither a longer budget nor a retry would have fixed either — only identifying the auto-close did.
    - **A check-then-act pair is not enough — the wait itself must accept both outcomes.** The first fix guarded `closeNoteDialog` with an `isVisible()` check and still failed: the auto-close landed *between* the check and the assert. Both helpers now resolve inside a single in-page `waitForFunction` that returns a discriminated outcome (dialog gone vs. control ready), so no window exists between deciding and acting. `closeNoteDialog` treats "already closed" as success — the postcondition a close helper owes its callers is *the dialog is closed*, not *we closed it* — while `setNoteOverrideCheckbox` re-opens and retries a bounded number of times (`NOTE_DIALOG_REOPEN_ATTEMPTS`), then fails loudly rather than passing silently. Re-opening is safe because the header action is a pure open, never a toggle.
    - **A click whose handler mounts the expert UI is dispatched through the DOM, not Playwright's pointer.** Playwright's `click()` follows its pointer events with a "scheduled navigations" barrier that needs the renderer's main thread — and Go Expert (or Simple Mode back) blocks that thread for seconds while the full builder mounts over the live preset. Under parallel workers the barrier overran the 3s action budget with the click long delivered, failing steps the app had completed (`simple-mode-custom-tab.spec.ts` lost 4–6 of 26 instances this way on an unchanged app). `dispatchClick` in that spec (`evaluate(el => el.click())` after a visibility assert, the same move `closeNoteDialog` makes) has no action budget to overrun; the postcondition is asserted afterwards, as always. The same helper sidesteps the attention pulse on the Simple Mode button, which starts a beat after the dialog's fade-in and so raced a "wait for current animations" guard.
  - **Settle the preview pipeline via `settleWorkload()`** (`tests/playwright/workload-indicator.ts`) — the single definition of the visible-then-hidden wait. Never hand-roll the two `waitFor` calls inline. The visible wait is intentionally short (`expectDefault`): a missed spinner appearance is normal, and a long visible budget would block the full duration on every miss. Only the hidden wait carries the work budget; pass a centralized token for the rare heavier pipeline.
  - **Two lint guards enforce this** (`no-restricted-syntax`, scoped to `tests/playwright/**` in `eslint.config.js`): (1) `test.setTimeout(...)` rejects raw numeric literals — every budget must be a named `PLAYWRIGHT_TIMEOUTS.*` token, added to `timeouts.ts` with derived `N × per-iteration` math in its comment; (2) a `waitFor({ state: 'visible' })` carrying a long token (`testXL`/`testHeavy`/`workloadIdle`/…) is rejected outright. Do not silence either with an `eslint-disable`; fix the wait.
- Install behavior:
  - `npm install` runs `npm run ensure:wasm-toolchain` first, auto-installing missing `wasm-bindgen-cli` + `wasm32-unknown-unknown` when Rust is already present, then triggers `npx playwright install` to fetch browser binaries pinned to the local `@playwright/test` version.
- The harness still logs `[Violation]` entries for slow handlers; ignore them unless a spec fails.
- Some warm-cache aborts can emit `AbortError` in the console; the tests swallow them but keep an eye out for regressions.
- Reports:
  - Per-browser HTML reports live in `test-results/reports/<browser>/index.html`.
  - `npm run test:e2e` writes a combined index at `test-results/reports/index.html` that links to each browser report.

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

The launch URL params (`?endpoint=` + `#endpoint=` alias, `&simple`, `playerid`, `playerName`,
`clientName`) and the export→`uploadSellfile` behavior are the SSOT of
[WebSocket Protocol](../../userDocs/websocket-jsonrpc.md#launch-url).
The launch reads `endpoint` into `window.__APP_CONFIG__` (`pushEndpoint` for the session), then
migrates it into the persisted connect preference + port before stripping it from the address bar.

All param readers live in `runtimeConfig.ts`, which caches one parse per session
(`getRuntimeConfig`); `__resetRuntimeConfigForTests` drops that cache so unit tests can vary
`window.location`. Two shared readers keep the accepted spellings identical everywhere:
`readStringParam` (query wins over hash, trimmed, blank → `undefined`) and `hasParam` (bare
presence, so `?x`, `?x=1` and `?x=` all count). Params consumed once at startup are stripped
from the address bar by `stripLaunchParamsFromUrl` (`accounts.ts`), which forces
`getRuntimeConfig()` first so nothing is erased before it is read.

**Client identity.** `clientName` names the connected application, and comes from two places:
the launch param, or the `capabilities` handshake packet (a client attaching to an
already-running app has no launch URL). Both route through `normalizeClientName` so a name is
sanitized identically whichever way it arrives.

- Precedence in `getClientName()`: a name learned this session → the launch param → the
  persisted name (`CLIENT_NAME_STORAGE_KEY`) → `DEFAULT_CLIENT_NAME`. The name is persisted
  because it must be right on the *first paint*, long before a socket exists — otherwise a
  packet-named client would flash "RSL Helper" on every launch. A URL param always outranks a
  remembered name.
- Catalog strings never spell a client name — they carry the `{client}` placeholder, which
  `i18n.tsx` expands for *every* key automatically (no call site passes it). Adding a UI
  string that names the client means writing `{client}`, never the literal.
- A mid-session rename must invalidate `t`, which is memoized: `subscribeClientName` notifies
  the i18n provider, which bumps a counter in `t`'s dep array. Without it, memoized subtrees
  would keep rendering the old name.

**Capabilities** (`lib/clientCapabilities.ts`) are negotiated over the socket, not the URL —
they belong to the CONNECTION, which is why the state lives here rather than in
`runtimeConfig`. A client announces them in a `capabilities` notification sent as its first
answer to `requestSfcSync`.

- Inbound tokens are parsed RAW by `externalCommands.ts` and validated in exactly one place,
  `isClientCapability`, against the `CLIENT_CAPABILITIES` enum — unknown tokens are dropped,
  never fatal, so a newer client naming unheard-of features stays compatible.
- `DEFAULT_CLIENT_CAPABILITIES` is **the RSL Helper baseline, not every known token.** RSL
  Helper sends no handshake, so "nothing announced" must mean "whatever RSL Helper does".
  Only add a capability there once RSL Helper itself ships it — otherwise every silent client
  silently changes behavior. `SfcFileAsSellfile` is therefore excluded (RSL Helper has no
  `uploadSfcFile` handler) and must be announced explicitly.
- Internally, `null` (nothing announced → apply the default) and `[]` (announced, none of the
  tokens are ours) are deliberately distinct states.
- `resetClientCapabilities()` runs on socket close, so a reconnect to a *different* client
  cannot inherit the previous one's features. The client name deliberately survives — it is a
  UI label, not connection state.
- The handshake is applied at the top of `handleExternalCommand` (`App.tsx`), before any
  account/gear routing, so a client announcing features in the same burst as its first gear
  packet has them in force before that gear can trigger a push. There is no waiting: a push
  that happens before the packet arrives simply uses the default.
- `resolveSellfileUploadTarget()` (`externalWsProtocol.ts`) is the single gate deciding
  method + payload shape for both push sites — the interactive export in `App.tsx` and the
  background per-account push. With `SfcFileAsSellfile` the background path re-serializes the
  account's parsed autosave via `buildSfcPayloadFromParsed` and **skips the headless pipeline
  entirely** (it only exists to compile an `.hsf` that path never sends); gear normalization
  still runs, so the burst is persisted either way.
- **Auto-push watches the document it actually uploads.** `pushWatchesSfcDocument()` sits
  beside the upload resolver and reads the same capability, so trigger and payload can never
  disagree. Without the capability the trigger stays `hsfDirty` (the compiled-export crc);
  with it the trigger is a fingerprint of the serialized `.sfc` (`sfcTextFingerprint`), held
  against its own baseline:
  - The compiled crc is wrong in **both** directions for a `.sfc` push. A note or
    recipe-name edit changes the document while compiling to identical rules (a real edit the
    client would never receive), and gear-DB churn that shifts safeguard detection moves the
    crc while the document is byte-identical (a push nobody asked for).
  - The push baseline is **separate from** the export baseline on purpose: saving to disk
    must not mark a never-pushed document clean, and a `.sfc` push must not clear the `.hsf`
    export badge — Export still writes the compiled sellfile.
  - Live session: `lastPushedSfcHash` is session state (switching accounts reloads the page,
    so it is per-account by construction) and resets on every document load/import/restore.
    Background: `ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH_SFC_HASH`, account-scoped and persisted.
  - **Gear bursts therefore stop pushing** under this capability: gear is not part of the
    `.sfc`, so an unchanged document yields the `unchanged` outcome and no upload. The skip
    wraps the UPLOAD ONLY — `persistBurstGear` still runs, or the account's next session
    would start from stale gear. Only a confirmed upload advances the baseline, so a failed
    push retries on the next burst instead of being mistaken for "already sent".
  - The `.sfc` push also bypasses the `exportRulesCount`/`rulesBuilding` gates in
    `handleExportSellfileSilent`: both exist to protect the COMPILED payload, and a document
    serialized from live state needs no pipeline at all.
- **Push labels follow the capability.** `exportLabelTiers` gains a `pushSfcFile` variant
  (read reactively via `useClientCapability`, since the capability lands mid-session and
  drops with the socket) covering the button tiers, its tooltip, the success toast and the
  express strip's three auto-push tooltips. There is deliberately **no** merged variant:
  merging folds a loaded base `.hsf`'s rules into the compiled sellfile, which the `.sfc`
  never participates in. **Export wording is unchanged** — it still writes the `.hsf`.

- `scripts/watchers/run-db-watcher.ps1` demonstrates an external tool opening the packaged app via `Start-Process`, appending the encoded endpoint automatically, and hosting a local WebSocket listener that persists incoming `uploadSellfile` payloads to disk (default `exported-sellfile.hsf`, `-OutputPath` configurable). Targets PowerShell 7; `[R]` emits demo `selectRule` events, `[F]` forces a DB snapshot, and it can watch `%APPDATA%\RslHelper\Config` for `.db` changes so the Gear Inspector refreshes without drag-and-drop.

### Single Source of Truth

- No duplication of logic or data. Centralize and import instead of re-encoding knowledge in multiple files.
- Domain catalogs, enums, and formatting live in `src/lib/types.ts` (artifact sets/types, rarity/rank/faction, `StatVariant`, and slot constraints). Consumers must use these exports and not redefine them.
- Cross-language constants (used by both TS and Rust) must be added to `shared/domain-constants.json` and generated via `scripts/tooling/generate-domain-constants.mjs`; never duplicate those values directly in `src/**`, `wasm/rule_engine_core/src/**`, `wasm/rule_engine_wasm/src/**`, or `wasm/sfc_engine/src/**`, and never hand-edit generated constant files.
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

### Decision engine DLL (`sfc_engine`)

`wasm/sfc_engine/` is a Rust `cdylib` crate exposing the decision pipeline over a
C ABI. It is **a shipped release artifact**: `npm run release:win` builds it and stages it
under `dev/decision-dll/` in the archive, together with the integration sample in
`examples/decision-dll/` (header, C program, build script, README).

An external program hands it a `.sfc` plus raw gear and gets back per-piece keep/sell
verdicts identical to the app's own preview — same core, same normalisation — rather than
reimplementing the rules against a generated `.hsf`. The same input also renders a `.hsf`
directly (`sfc_build_hsf`), so a consumer can write a sellfile without reproducing the
app's export path.

**C-ABI surface**

```c
// Decide keep/sell for every supplied artifact. input_json is the NativeInput schema
// below; the result carries verdicts + safeguardRanks + improvementChances + rules.
// On any error returns {"error":"<message>"}. Never returns NULL.
// Caller MUST release every returned pointer with sfc_free.
char* sfc_decide(const char* input_json);

// Render a .hsf from the same sellfile + gear. input_json is the NativeHsfInput schema
// below: the decide fields plus `recipes` / `safeguards` / `finalSell`. Each omitted switch
// follows the sellfile's own setting; `false` withholds that source, and `true` cannot add
// one the file did not ask for. Omitting a source is what lets a caller SPLIT one sellfile
// into disjoint files by origin (recipes+finalSell / safeguards) that reunite exactly.
// Returns
// {"hsf":"<file text>","ruleCount":<n>}; the string is the complete file, written verbatim.
// On any error returns {"error":"<message>"}. Never returns NULL.
char* sfc_build_hsf(const char* input_json);


// {"crate":"<semver>","schema":<n>} — lets a consumer holding a prebuilt DLL fail loudly
// on a contract mismatch instead of misparsing. Bump SCHEMA_VERSION in lib.rs on any
// non-additive change to the JSON shape.
char* sfc_version(void);

void sfc_free(char* ptr);
```

**Threading.** Thread-safe. `ENGINE_STATE` (configure/evaluate) and the safeguard
`RESIDENT_PLACEHOLDERS` hand-off store are both `thread_local!`, and `rule_engine_core`
holds no mutable global, so concurrent `sfc_decide` calls cannot observe or corrupt each
other — each thread builds its own engine.
`decide_parity.rs::concurrent_calls_agree_with_a_single_call` pins it against a sellfile
with an active safeguard, so the placeholder store is exercised too. Note what this does
NOT buy: each thread re-runs the full chain including rule generation and safeguard
detection (the dominant costs), so threads help throughput across independent requests,
never latency on a single one.

**Cost knobs.** `improvementChances` is opt-IN (default false) and `rules` opt-OUT (default
true) on the input. The improvement-chance projection adds roughly 15% to the decision chain
and feeds no verdict — detection computes its own per-rule chances when a rule sets a
threshold — so a consumer that does not display it should not pay for it. See the measured
split below.

**Build commands**

```sh
# Windows release .dll — the shipped artifact.
npm run sfc-engine:build

# Linux / WSL — debug .so (for the C++ smoke test).
cargo build -p sfc_engine
```

Output locations:
- `wasm/target/x86_64-pc-windows-msvc/release/sfc_engine.dll` (Windows release —
  the `--target` build lands in a triple-qualified directory, and the workspace is under
  `wasm/`)
- `wasm/target/debug/libsfc_engine.so` (Linux/WSL debug)

`wasm/target/` is gitignored, so the release script copies the DLL into the archive rather
than the repo carrying a built binary.

**Performance** (release build, v1.0.48, 7,733-piece vault + 1,430 champions from
the sample-log capture's `packet_01_artifacts_*.json` / `packet_03_champions_*.json`
(`docs/orig/sampleLog/captures/session_260510_183951.731/` after
`npm run fixtures:captures:unpack`),
`presets/lategame.sfc` compiling to ~34.9k rules; `npm run sfc-engine:bench -- <sfc>
<artifacts> <champions>`):

| Stage | Time |
|---|---|
| JSON parse | ~133 ms |
| normalise | ~2 ms |
| `parse_sfc` | ~5 ms |
| build rules | ~400 ms |
| safeguard detection | ~550 ms |
| merge rules | ~200 ms (~48.1k merged) |
| evaluate verdicts | ~118 ms |
| **decision total** | **~1,400 ms** |
| improvement chance (opt-in) | +~190 ms |

Safeguard detection and rule building dominate, and both are **gear-dependent** (safeguard
rules are minted per artifact), so caching the parsed `.sfc` would not help the expensive
path. The ABI is
deliberately **stateless**: no handle, no session, no cached gear. Crossing an ABI with a
cache means owning invalidation across a boundary the caller can restart at any time; if
that ever changes, the numbers above are the baseline to beat.

**`RecipeID` is 1-based — the recipe-mode gate depends on it.**

A generated rule's `RecipeID` is *not* a raw index. Emission drops any id that does not name
a recipe (`matcher_evaluator::is_recipe_owned_rule_id`, used by `hsf_builder_execution`), and
the evaluator recovers the recipe's position as `RecipeID - 1` to look it up in
`recipe_modes` (`matcher_evaluator::prepare_rule`). Three helpers are the single definition
of that convention, and every producer and reader goes through them:

| helper | answers |
| --- | --- |
| `recipe_id_for_index` | the id a recipe at 0-based index must carry |
| `recipe_index_from_id` | the index an id refers to (its inverse) |
| `is_recipe_owned_rule_id` | whether an id names a builder recipe at all |

The app mirrors all three in `src/lib/ruleRecipeIndex.ts` (`recipeIdForIndex`,
`getRuleRecipeIndex`, `isRecipeOwnedRuleId`) — never spell `+ 1`, `- 1`, or `> 0` inline on
either side. Safeguard rows sit in the non-positive sentinel range, counting down from
`SAFEGUARD_RECIPE_ID_BASE` (defined in both languages), which is why the positive test is
what separates a builder recipe's rule from an injected one.

Stamping the 0-based enumeration index instead breaks the gate twice over: recipe 0 loses its
id to the positive test, and every later recipe reads its *predecessor's* entry in
`recipe_modes`. A sellfile whose list is headed by a separator, or that contains any disabled
recipe, then has the following *active* recipe silenced — the DLL keeps gear the app's
preview sells, which reads as "the DLL decides almost nothing". This shipped once; the
regression is pinned by `decide_parity.rs::a_disabled_recipe_silences_only_itself`.

**`IgnoredBySafeguards` reaches the collector.**

A recipe carrying this flag opts its *keeps* out of counting as safeguard coverage, so the
safeguard still treats the piece as at-risk and rescues it. The DLL used to parse the flag
in `sfc_reader` and then drop it, passing `None` for the collector's ignore list — so it
disagreed with the app on every sellfile using the flag. `pipeline::derive_recipe_modes` has
a sibling, `derive_ignore_safeguard_recipe_indices`, index-aligned with it and with the rule
order `build_rules` emits; `sfc_reader::resolve_ignored_by_safeguards` resolves the field
with the same field-beats-legacy-tag precedence as the rework gate. Pinned by
`decide_parity.rs::a_recipe_ignored_by_safeguards_does_not_suppress_the_safeguard`, which
compares the injected keep-rule count with the flag on and off — the two runs must differ,
or the ignore list is not arriving.

**The final-sell catch-all spans the whole set catalog.** `FinalSellRemainder` is expanded
per set id over `all_known_set_ids`, and that list MUST be the full catalog — the app passes
`getAllKnownArtifactSetIds()` minus the accessory sentinel (`merge.ts`), so the catch-all
sells a set no recipe names. `sfc_reader` builds the same list from the generated
`SET_NAME_IDS` table, which comes from the `artifactSet` entry in
`shared/domain-constants.json` that also emits the app's catalog, so the two cannot drift
(69 ids today, sentinel absent by construction).

Deriving that domain from the DOCUMENT instead is the trap: a recipe that selects its sets
through a METASET leaves `artifact_set_ids` empty, so a real sellfile whose recipes are
mostly metaset-driven collapsed the domain to 11 of 69 sets. Gear from the other 58 then
matched no rule and was KEPT where the app sold it — 649 of 8,388 pieces on a real vault.
Pinned by `decide_parity.rs::the_final_sell_catch_all_covers_sets_no_recipe_names`.

**A recipe's metasets must be expanded to set ids.** The app resolves them before rule
generation (`resolveArtifactSetSelections` in gearSets/selection.ts: union the direct
selections with each metaset's members, then apply exclusions LAST so an explicit remove
beats a set its own metaset contributed), so the builder only ever sees resolved ids.
`sfc_reader` mirrors that. Skipping it does not narrow a recipe — it WIDENS it: a recipe
whose only set selection is a metaset ends up with an empty `artifact_set_ids`, which is "any
set", so it matches gear it never described. On a real sellfile 107 of 195 recipes select
this way and the DLL disagreed with the app on 668 pieces. Pinned by
`sfc_reader::label_tests::recipe_metasets_expand_to_set_ids_and_exclusions_win`.

**The safeguard expected-bucket domain is supplied.** A quota is
`required_per_bucket * bucket_count`; with no domain the count falls back to the buckets
*observed* in the gear on hand, so a "keep 1 per slot" safeguard rescues fewer pieces when
the player owns nothing in some slot. `pipeline::expected_bucket_domain_payload` builds the
same domain the app does (`buildSafeguardExpectedBucketDomain`) from generated catalogs, then
runs it through the shared `normalize_safeguard_expected_bucket_domain_core`. The two
normalized domains were diffed field-by-field on a real account and are byte-identical.

Three of its four inputs already existed in Rust (`PREFERRED_ARTIFACT_TYPE_ORDER`,
`ALLOWED_MAINS_BY_SLOT`, and the set catalog); `ALL_FACTION_IDS` and the set-compatibility
pools are new. The pools need each set's piece behaviour, which TS derived from
`artifactSetDescriptions[name].pieces` — UI tooltip prose with no Rust equivalent — so
`shared/domain-constants.json` now stores `pieceGroup` per set (1 piece = accessories, 2 or 4
= artifactFixed, variable = artifactVariable) and both languages read that. The accessory
pool deliberately includes the `-99` no-set sentinel: an accessory slot can carry an UNSET
accessory (Spider dungeon), and dropping it would lose a real bucket.

**A percent main stat is not flagged flat.** `variantToMain` (hsfTypes.ts) is the SSOT for
the HSF main-stat pair `(id, f)`, where `f` is the FLAT flag: 0 = percent, 1 = flat.
`variant_to_main_parts` mirrors it, and every variant now states its flag. CR and CDMG used
to return `None` and fall through to `MAIN_STAT_F_DEFAULT_FLAG`, which is 1 — so a CDMG%
recipe emitted `MainStatF: 1`, describing gear that cannot exist. Pinned by
`recipe_builder::tests::percent_mains_are_not_flagged_flat`.

**A recipe's own substat roll targets must be read.** `substatRollTargets` sets the threshold
ladder a recipe demands at each level milestone (`base` for level 0, `increments` for the four
above it); the app passes it to the builder as `substatRollTargetsV`. `sfc_reader` parsed the
field into a `Value` and then hardcoded an empty map, so every recipe with a custom ladder
silently fell back to the FACTORY minimum — a 6-star amulet recipe asking for HP
300/600/900/1200/1500 was built as 200/400/600/800/1000 and kept gear the app sells. 47 of 195
recipes in the test sellfile set a ladder. Both persisted shapes are read (current
`{ base, increments }` and legacy `{ min }`); pinned by
`sfc_reader::label_tests::recipe_substat_roll_targets_are_read`.

Note this only shows up on an override-resolved document: the raw sellfile leaves the field
unset on the affected recipes and the overrides are what write it, so comparing the DLL
against the app on a file whose overrides were never applied hides the bug.

**A safeguard threshold must reach detection.** `improvementChanceThreshold` EXPANDS a rule's
protected set beyond its base quota: on top of the top-N the quota covers, the rule also keeps
every candidate whose chance of landing in ITS OWN top-N clears the bar
(`safeguards/mod.rs`, the `improvement_chances` lookup). That expansion reads a
`(artifact, rule_ordinal) -> chance` map, and an EMPTY map disables it silently — the rule
still runs and still fills its quota, it just never expands. `detect_safeguards` passed an
empty map, so on a real vault (132 of 155 rules thresholded) 75 pieces the app rescues were
sold instead.

Two things make this affordable. The pass is gated on
`safeguard_rules_have_improvement_threshold`, mirroring the app's own `hasThreshold` gate, so
a sellfile that sets no threshold skips it entirely: measured on the same vault, detection
stays at ~277 ms without thresholds and rises to ~635 ms with them (decision total 889 ms vs
1250 ms). And the chances are keyed PER RULE via `flatten_improvement_chances_by_rule` — the
per-artifact maximum would let one rule's required count inflate another rule's expansion set.

The app pays the same ~300 ms but memoizes it across pipeline runs; `sfc_decide` is a
stateless one-shot, so the cost is inherent here rather than cacheable.

**Parity status.** On a real 8,388-piece vault, the DLL and the app now agree on the
keep/sell decision for EVERY piece, with identical rule composition (26,380 recipe rules,
5 catch-all, 10,846 safeguard placeholders, 6,516 safeguard artifact keeps). The one
remaining difference is the `safeguarded` FLAG on 43 pieces, all of which both sides KEEP:
the app names a safeguard as the deciding rule where the DLL names a recipe. That is the
`safeguarded` semantics question — the app defines it as "the deciding rule's source is
safeguards" (`isMatchKeptBySafeguard`), while this crate defines it as a rescue (kept, with
the baseline selling). The two disagree only when a recipe and a safeguard both keep a piece.

**Decision parity is tested, not just measured.** Two committed tests pin the DLL against the
app, and they cover different halves:

| test | pins | reference |
| --- | --- | --- |
| `parity.rs` | raw→compact artifact ingest | `fixtures/expected.json` |
| `decide_expected.rs` | rule building, safeguard detection, merge, verdicts | `fixtures/decide_expected.json` |

Every parity bug listed above lived in the SECOND half, which the ingest test cannot see —
that is why the decision test exists. Both run under `cargo test -p sfc_engine`, so
`npm run test:unit` already gates them.

The reference files are generated by driving the APP's own modules (the same ones App.tsx and
the rule-cache worker use), so neither side re-implements the other:
`npm run sfc-engine:parity-expected` and `npm run sfc-engine:decide-expected`. The decision
fixtures live in `tests/fixtures/decide/` (`.sfc` plus a sibling `.md` saying what each one
pins — the reader rejects unknown keys, so the explanation cannot live inside the document).

**Regenerating blesses whatever the app currently does.** The expected files are committed, so
a change to the TS pipeline does NOT update them automatically: the Rust test keeps asserting
the old numbers and fails. That failure is the signal. Confirm the new behaviour is the
INTENDED one before regenerating — running the script to make a red test green is how a real
divergence gets silently adopted as the baseline.

**Gating.** `npm run test:unit` runs `cargo test -p sfc_engine`, so a
`rule_engine_core` change that breaks the DLL fails the standard pre-handoff gate. Before
this crate shipped it was ungated — do not let it become so again.

**C/C++ smoke test**

`wasm/sfc_engine/example/main.cpp` is the "does the ABI actually load" check: it
loads the library at runtime, calls `sfc_version`, `sfc_decide` and `sfc_build_hsf`,
validates the output and exits non-zero on any failure. The compiled binary is gitignored.

```sh
# Build and run (Linux/WSL):
cd wasm/sfc_engine/example && make run
```

It verifies: no `error` key; `sfc_version` reports crate + schema; `verdicts` non-empty with
the matching artifact `matched:true, keep:true`; `safeguardRanks`, `rules` and
`improvementChances` present; at least one rule with `Keep=true`. For the export it also
checks that the file carries a `Rules` container, that no `__`-prefixed UI metadata
survives, and that `finalSell:false` yields strictly fewer rules than the complete file —
a same-size result would mean the switch was parsed into nothing and silently ignored.

**Normalisation is the risk, not the plumbing.** The five rules that decide whether a
verdict matches the app's preview live in `rule_engine_core::gear_ingest` (one definition,
called by the DLL and mirrored by the TS ingest): fixed-point decode + per-component
rounding, level snapping to the milestone BAND a level reached (floored, not nearest — a +15
is a +12), the setless-accessory sentinel vs a
setless chestplate's plain 0, base + mythical (never glyph), and the accessory set coming
from `setKindId` rather than the faction code. Each was once a live wrong answer;
`wasm/sfc_engine/tests/decide_parity.rs` pins every one end-to-end.
**Input schema** — `NativeInput` accepts the **raw RSL-Helper wire format**, i.e. the
exact JSON-RPC payloads the endpoint sends, so RSL Helper can pipe its packets straight
in without running the app's TypeScript:

```jsonc
{
  "sfc": "<.sfc file contents as a JSON string>",
  // Raw ArtifactLog rows (params.artifacts / inboxArtifacts element shape).
  "artifacts": [ { "id": 1, "kindId": 7, "rankId": 6, "rarityId": 5, "level": 16,
                   "setKindId": 0, "requiredFraction": 10,
                   "primary": { "id": 3, "isAbsolute": 1, "statValue": … },
                   "secondary": [ { "id": 4, "level": 4, "isAbsolute": 1 }, … ] }, … ],
  // Optional raw champion rows — only id + artifacts slot-map are read, to fill cID.
  "champions": [ { "id": 900, "artifacts": { "7": 1 } }, … ],
  // Cost knobs. improvementChances is opt-IN; rules is opt-OUT.
  "improvementChances": false,
  "rules": true
}
```

Both request schemas are camelCase and reject unknown fields, so a misspelled switch comes
back as an error rather than silently taking its default. Spell the keys exactly as above:
a request that sends `improvement_chances` is refused, not quietly treated as "off".

**Output schema** — `NativeOutput`:

```jsonc
{
  // The answer: one per supplied artifact.
  "verdicts": [ { "artifactId": 123, "keep": true,
                  // false = no rule covered it; kept by DEFAULT, not by decision.
                  "matched": true,
                  "ruleName": "…",      // deciding rule's RecipeName, or null
                  // Kept ONLY because a safeguard overrode a selling rule. A .hsf
                  // cannot express this — cleanHsfForExport strips the source marker.
                  "safeguarded": false }, … ],
  // Per (artifact, safeguard rule) standing, projected from the detection snapshot.
  "safeguardRanks": [ { "artifactId": 123, "ruleOrdinal": 2, "score": 41.5,
                        "candidateRank": 7, "bucketRank": 2,
                        "bucketKey": "{slot}:{set}:{mainStat}:{faction}",
                        "isWithinQuota": true,
                        "groupId": "grp/0",   // null when the rule is ungrouped
                        "substatBuckets": [ … ] }, … ],
  "improvementChances": [ … ],   // empty unless requested
  "rules": [ … ]                 // merged HSF rules, unless opted out
}
```

The raw→compact normalization (ports of `parseArtifactLogRow`,
`buildEquippedByArtifactMap`, and the `accset→faction` resolve) lives in
`wasm/sfc_engine/src/artifact_log.rs`. `ArtifactByHeroID` has no equivalent here
and is not accepted: each `sfc_decide` call is a stateless one-shot over a complete
`NativeInput`, so the caller supplies current equips in the `champions` slot-map and
there is no live stream to go stale. (The app does consume `ArtifactByHeroID`, because
its equips must stay fresh between `champions` pushes — see
[WebSocket Protocol](../../userDocs/websocket-jsonrpc.md#artifactbyheroid).)

**Verdict resolution — which channel decides.** The evaluator reports two matches per item
and they are NOT interchangeable:

- `first_match` is the **decision**. A safeguard keep-override is promoted into it
  (`matcher_evaluator::evaluate_item`), so it already reflects a rescue.
- `first_non_excluded_match` is the **baseline** — what the sellfile decides on its own.
  The app reads exactly this pair: `firstMatch` for the verdict, `firstNonExcludedMatch`
  as `baseMatch` (`App.tsx`).

So `safeguarded` = decided-keep AND baseline-sell AND the deciding match is a
keep-override source — one evaluation, no second pass. Reading the non-excluded channel
as the verdict inverts the meaning and reports SELL for every safeguard-rescued piece.
A no-match is **KEEP**: never sell gear the sellfile did not call out.

**Internal pipeline** (per call to `sfc_decide`; stages live in `pipeline.rs` so the
benchmark and the parity tests drive the same code the ABI runs)

1. Deserialize `NativeInput` JSON (raw wire shape).
1b. Build the artifact→champion equipped map from `champions`, then normalize the raw
    `artifacts` into compact rows via `artifact_log::parse_artifact_log_array` (fills
    `cID` from the map; resolves `faction` from the accessory code on accessory slots).
2. Parse human-readable SFC via `sfc_reader::parse_sfc` (label strings → numeric codes).
3. For each recipe, call `recipe_builder::prepare_recipe` then `build_hsf_rules_for_recipe`.
4. Normalize compact artifact rows to `SafeguardWasmArtifactIn` + `TestItemRaw`.
5. When safeguards are enabled, call `collect_and_compute_safeguard_protection_core`.
6. Assemble `ComputeMergedRulesIn`, call `compute_merged_rules_core` → `Vec<RuleRaw>`.
7. Project safeguard ranks from the detection snapshot, then evaluate verdicts against
   the merged rules. `compute_improvement_chance_core` runs ONLY when requested.
8. Serialize `NativeOutput` and return as a heap-allocated `CString`.

**Relationship to the WASM module**

Both `rule_engine_wasm` and `sfc_engine` depend on `rule_engine_core`.
The WASM crate uses `#[wasm_bindgen]` and `JsValue`; the native crate uses
`extern "C"` and JSON strings.  The SFC label-parser module (`sfc_reader`) and
recipe normalizer (`recipe_builder`) live in `rule_engine_core` so both
compilation targets share the same parsing logic without duplication.

**Raw-wire normalization + TS↔Rust parity**

Because RSL Helper hands the DLL the raw endpoint payloads (not the app's compact rows),
`artifact_log.rs` **duplicates** the app's ingest logic in Rust: `parse_artifact_log_row`
/ `parse_artifact_log_array` (ArtifactLog→compact, incl. the reject gate and inbox-item
envelope unwrap), `build_equipped_by_artifact_map` (champions slot-map → `cID`), a
`to_number` that mirrors JS `Number()` coercion, and `resolve_accessory_faction`. The
`accset→faction` map is NOT hand-written: it is generated from
`shared/domain-constants.json` into both `domainConstants.ts`
(`ACCESSORY_FACTION_BY_CODE`, consumed by `gearDbNormalizer.ts`) and
`generated_domain_constants.rs` (`resolve_accessory_faction`), so the single source of
truth holds across languages.

This deliberate duplication is guarded by a **parity test** (`wasm/sfc_engine/
tests/parity.rs`): it drives a committed real capture slice
(`tests/fixtures/{artifacts,champions}_packet.json`) through the Rust normalizer and
asserts field-for-field equality (on the DLL-consumed columns —
`ID/type/rank/rarity/lvl/aset/accset/mid/mfl/s{1..4}{id,lvl,fl}/cID/faction/REROLLCOUNT`) against
`expected.json`, which `tests/repro/native-dll-parity-expected.ts` regenerates from the
app's own `normalizeExternalEvent`. Run the whole loop with `npm run sfc-engine:parity`
(regenerates `expected.json`, then `cargo test`). If the TS ingest changes, regenerate
and the mismatch surfaces immediately. Every column the DLL reads must appear in BOTH
projections — a column present in the compact row but missing from the projection is
invisible to this test, which is how `REROLLCOUNT` (the Chaos-Ore rework counter behind
the `if_reworked` / `if_not_reworked` rule gates) was once dropped by the DLL unnoticed.

**SFC schema — kept strict, in sync with today's format**

`sfc_reader`'s readable structs use `deny_unknown_fields` **by design**: the DLL targets
*today's* `.sfc`, so any future format drift must fail loudly and get a matching reader
change (do not relax to silently-ignore). The reader was synced to the current `sfcIO.ts`
output — the fields that previously hard-rejected a real preset are now handled:

- Metaset `show` + `iconId` (tolerated — UI-only).
- Recipe `appearance {name, fgColor?}` (tolerated) and `substatRollTargets` (tolerated).
- Substat `rollBounds` (camelCase; the old field was `roll_bounds` and never matched).
- **`artifactSetNames` (name-based) is resolved to set ids**, not just tolerated — the app
  now writes set filters by name and stopped writing numeric `artifactSetIds`. Resolution
  goes through `set_id_from_name`, generated from `shared/domain-constants.json` (the
  `artifactSet` catalog) into both `ARTIFACT_SET_NAMES` (TS, consumed by `types.ts`
  `artifactSetNames`) and `SET_NAME_IDS` (Rust) — one SSOT for ~69 sets. The same resolver
  fixes safeguard `tuple.sets` and metaset `setNames` expansion (both were name-based and
  previously dropped). A `parse_sfc_accepts_current_format` unit test in `sfc_reader.rs`
  pins this.

Result: the decision chain runs end-to-end on `presets/lategame.sfc` + a full real account
(7,734 artifacts, 1,430 champions) → ~40k rules with set/faction filters resolved, and a
verdict per artifact.

Known non-fatal follow-ups (silent data loss, not parse errors — the writer/reader key
names disagree): safeguard `ignorePreviousSafeguards_v2` (reader reads
`ignorePreviousSafeguards`) and Minima `anyRankDefaultsTo` (never read). Fix when those
paths matter.

**Faction id typing** — the generated `ACCESSORY_FACTION_BY_CODE` / `FACTION_NAMES` /
`FACTION_NAMES_TO_ID` are typed `FactionId` (not bare `number`); `FactionId`'s single
definition lives in the generated layer (which owns the id domain) and is re-exported from
`types.ts`. Rust stays `i64` at the FFI/engine boundary by design.

**Productionization** (closed — the crate is a shipped artifact now):

- The Windows `.dll` is **built and verified**: `npm run sfc-engine:build` produces it,
  the release stages it under `dev/decision-dll/`, and the C sample in
  `examples/decision-dll/` loads it and reads verdicts back.
- A hand-written header (`examples/decision-dll/sfc_decide.h`) documents the four
  exports; no cbindgen. `sfc_version()` carries the schema number so a consumer holding
  a prebuilt DLL fails loudly on a mismatch.
- **Crate versions are the app version.** All four workspace crates inherit
  `[workspace.package] version` in `wasm/Cargo.toml` via `version.workspace = true`, and
  that field mirrors `version` in the root `package.json` — which stays the single source
  of truth. `sfc_engine` reports it as `crate` from `sfc_version()` (`env!("CARGO_PKG_VERSION")`),
  so a shipped DLL names the app build that produced it. `Set-CrateVersion` in
  `scripts/release/release-win.ps1` rewrites the workspace field wherever the release
  script writes `package.json` (release clean, failure restore, post-release dev bump) and
  refreshes `Cargo.lock`, so the two cannot drift. Never hand-edit the crate version to a
  value `package.json` does not have.
- `npm run test:unit` compiles and tests the crate, so a `rule_engine_core` change that
  breaks it fails the standard gate.

**Real-data input harness**

`tests/repro/native-dll-realdata-input.ts` lifts a captured raw endpoint `artifacts`
packet (e.g. the sample-log capture's `packet_*_artifacts_*.json`) and optional `champions` packet
straight into a `NativeInput` JSON (the DLL now parses the raw wire shape itself), pairs it
with a `.sfc` preset, and writes the file the DLL consumes — used for the end-to-end
run above.

### WASM Linear Memory Management

WASM linear memory is a flat address space managed by `WasmDynamicTalc` (vendored talc 5.0.3, `wasm/vendor/talc/`). Pages grow on demand but never shrink; talc's free list recycles frees but the high-water mark only rises. On V8/Windows a failed page commit makes `memory.grow` reject with `STATUS_ACCESS_VIOLATION` and kill the renderer; on a fragmented heap the same failure hits any allocation needing a large contiguous block. The invariants below exist to avoid both. Repro harnesses: `npm run repro:incremental-growth` (Node leak-localizer) + the `endpoint-incremental-updates` / `binary-endpoint-fragmentation` / `binary-endpoint-memory` perf specs.

**Constraints a future dev must honor:**

- **Engine-gated pre-grow.** `pre_grow_memory_value` pre-commits pages to `PRE_GROW_TARGET_BYTES` (256 MiB) at warmup so V8/Windows rarely calls `memory.grow` on the hot path. This is V8-specific: on Gecko the eager commit (× worker + main-thread instances + transient sql.js import heap) pushes the content process past its ceiling and SIGSEGVs it, so `preGrowTargetBytesForEngine()` (`src/lib/wasm/wasmRuleEngine.ts`) returns 0 for Firefox. Both call sites (worker init + `warmupWasmRuleEngine`) route through that one helper — keep it the single decision point.

- **Rules are session-invariant → cache them WASM-side.** Base/custom/final-sell rules derive from the fixed SFC and do not change across gear-DB pushes within a session; re-sending them each push churns talc with large same-size transients and steps the heap up unbounded. `EngineState` caches the invariant half (`cached_generated_rules` / `cached_safeguard_rules` / `cached_safeguard_enabled`, preserved across `configure_engine`); each push sends only the detection snapshot via `compute_merged_rules_cached_value` (self-heals on cache miss). `computeMergedRulesFromComponents` (`merge.ts`) is the single merge path for worker + main thread, gated on `rulesCacheKey`; the worker gates `configure_engine` on the same key. Do not reintroduce a per-push full rule re-send.

- **talc TALC-PATCH.** talc 5.0.3 has a stale-`ABOVE_FREE` bug: a freed chunk reads a garbage gap size and traps "memory access out of bounds" after repeated large serde_json serializations. Fixed in the vendored copy (`wasm/vendor/talc/src/base/mod.rs`, grep `TALC-PATCH`): `talc_gap_looks_valid()` cross-checks the base-size vs end-size word before trusting the flag (mismatch → skip the coalesce, no data loss). Any talc re-vendor must re-apply this.

- **Contiguous-alloc avoidance in `improvement_chance.rs`.** `HashMap`/`HashSet` need one contiguous backing array that reallocs on resize — the primary fragmentation crash site. Collections that scale with artifact/rule count use `BTreeMap`/`BTreeSet` (per-node allocation, never one large block) or a sorted `Vec` + `binary_search`; `StateKey` derives `Ord`. Bounded-small maps outside the hot path stay `HashMap`. `compute_probability` mutates substat state in place with an undo-redo pattern (no per-branch clone) and reuses stack buffers + a once-allocated `.clear()`'d memo. Keep new hot-path collections off `HashMap`.

- **Minified JSON wire format.** Heavy WASM exports pass JSON strings via `serde_json`, not `JsValue` via `serde_wasm_bindgen` (which exhausted the externref table at 45k rules). Fields are minified via `#[serde(rename)]` in the wire structs — SSOT `wasm/rule_engine_core/src/wasm_merged_rules_wire_format.rs`, TS projections `src/lib/wasm/wireProjections.ts`. Non-finite f64 (NaN/Inf) filter to `None` (JSON can't represent them).

- **Worker heap hygiene** (`ruleCacheWorker.ts`, `useRuleCacheWorker.ts`): `clearStoredRowsWithLoadedWasm` drops the `stored_rows` Vec before the merge. **No proactive worker cycling** — recycling the worker after N pipelines or above a heap threshold backfires: a fresh worker re-grows to the same ~460 MiB working set while Chrome's lazy Worker GC lets the terminated heap linger, stacking dead 400–600 MiB allocations. One long-lived worker whose heap grows once and stays stable is strictly better. The only replacement path is genuine WASM-trap recovery: `isWasmFatalTrap()` detects an OOM/`out of bounds` `RuntimeError` and `replaceWorkerAfterRuntimeError()` spawns a fresh worker. Diagnostics: `log_talc_counters(label)`, `heap_integrity_check()`. `preWarmHeapWithLoadedWasm` is now repro-harness-only (the Rust `prewarm_for_json_parse` inside the JSON exports is separate and stays).

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
- Held-back dependencies (re-check on every dependency refresh):
  - `typescript` stays on 6.x: `typescript-eslint` 8.x peers `typescript <6.1.0`, and TS 7 no longer ships the classic compiler API that the lint/checker tooling loads.
  - `eslint-plugin-react-you-might-not-need-an-effect` stays on 0.9.x: from 0.10 `no-event-handler` also flags props and reports at the usage line, which surfaces ~44 new warnings across ~40 effects and orphans the existing suppressions. Moving to 1.x needs its own triage pass (refactor or re-justify each effect); `no-empty-effect` is gone in 1.x, and `no-initialize-state` joins `recommended`.
- Rust (the `wasm/` workspace):
  - Formatting: `wasm/rustfmt.toml` (`max_width = 120`, edition 2021). `npm run fmt:rust` formats, `npm run fmt:rust:check` is the read-only gate. Only stable rustfmt keys belong in that file — `ignore` is nightly-only, so `generated_domain_constants.rs` cannot be excluded, and it does not need to be: `generate-domain-constants.mjs` pipes its Rust output through rustfmt (same config) before writing, so the generated file lands already formatted and a later format run is a no-op. Regenerating and formatting are therefore safe in one commit.
  - Clippy: `cargo clippy --workspace --all-targets` must be warning-free. Prefer a targeted `#[allow(...)]` on the item, with the reason in a comment, over a crate-wide `#![allow(...)]` — a blanket allow also silences every future occurrence, which is how an unrelated lint gets hidden.
  - The two crate-wide allows in `rule_engine_core/src/lib.rs` (`neg_cmp_op_on_partial_ord`, `manual_clamp`) are deliberate and float-specific: `!(x > 0.0)` is the NaN-catching guard, and `f64::clamp` panics on NaN whereas `.max().min()` folds it to a bound. They cannot enforce that split by themselves, so an **integer** `.max(a).min(b)` is a review error — integers must use `clamp`.
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

- Uses native Windows `Compress-Archive` to create ZIP files with predictable metadata (no PowerShell community modules). The archive is written to `releases/SellfileCreator_v<version>.zip` (folder created on demand, gitignored); the bare built HTML is additionally copied to `old_releases/` for auditing.
- Build via `npm run build`, export localization catalogs (`npm run export:l10n`), and stage README translations so the ZIP ships with ready-to-edit templates under `i18n/`.
- **All user-facing documents are sourced from `userDocs/`** (READMEs, `HISTORY.md`, the generated `THIRD_PARTY_NOTICES.txt`, `websocket-jsonrpc.md`) — see [User-facing docs](../TECHNICAL.md#user-facing-docs-userdocs). The script fails fast when the folder or the English README is missing.
- Stage helper resources under a `dev/` subdirectory when present (`scripts/watchers/run-db-watcher.ps1`, `scripts/watchers/Stream-Helper-DB-to-Creator.bat`, `userDocs/websocket-jsonrpc.md`).
- Create a flat `release_staging` workspace, rename `dist/index.html` to `SellfileCreator.html`, generate UTF-8 BOM README `.txt` files with a `###### vX.Y.Z` badge, and add a `runme.bat` launcher.
- Preset sellfiles are generated at build time by `scripts/tooling/gen-release-hsf.mjs` from `presets/lategame.sfc` using the recipe-overrides DSL — the `lategame` and `endgame` preset tokens select the respective account-level override, and the script applies them through the same `computeMergedRules` path the app uses. The script is self-contained: it reuses `tmp/tsc/tests` when already present (production builds, which run `test:unit` first) and compiles it on-demand otherwise (dev builds that skip the test suite).
- An optional `presets/<preset>.patch.json` file can declaratively alter the base preset before generation (drop a metaset entry, soft-disable a safeguard, edit the embedded Note). The patch applier (`scripts/tooling/apply-preset-patch.mjs`, `src/lib/presetPatch.ts`) runs before `gen-release-hsf.mjs` when a patch file is detected. Schema and worked examples live in [`presets/PATCHES.md`](../../presets/PATCHES.md).
- Archive contents:
  - `SellfileCreator.html` — from `dist/index.html`
  - `README.txt` — converted from `userDocs/README.md` (UTF-8 BOM; injects the version badge)
  - `README.<lang>.txt` — localized README variants (`userDocs/README.<lang>.md`) converted to UTF-8 BOM text
  - `HISTORY.txt` — copied from `userDocs/HISTORY.md` so the release bundle ships with the full changelog
  - `THIRD_PARTY_NOTICES.txt` — copied from `userDocs/THIRD_PARTY_NOTICES.txt`, which `npm run generate:third-party-notices` (run by the release script) regenerates from the runtime dependencies
  - `i18n/*.l10n.json` — localization templates exported from `dist/l10n`
  - `Sellfiles/Midgame_Lategame_Endgame_Sample.sfc` — copied from `presets/lategame.sfc` (with any `presets/lategame.patch.json` applied)
  - `Sellfiles/lategame-sellfile.hsf` — generated at build time from `lategame.sfc` with the `lategame` recipe-override preset applied
  - `Sellfiles/endgame-sellfile.hsf` — generated at build time from `lategame.sfc` with the `endgame` recipe-override preset applied
  - `Sellfiles/Beginner_Sample.sfc` — copied from `presets/beginner.sfc` as the minimal starter recipe
  - `runme.bat` — launches the HTML in the default browser
  - `dev/` — optional helper folder with the WebSocket watcher scripts and the protocol doc (`userDocs/websocket-jsonrpc.md`) when available

## Project Structure

- `src/App.tsx`: Main UI — orchestrates builder, recipes, metasets, Substat Target Values (`substatTargets`), autosave, preview.
- `src/components/HelpDialog.tsx`: In-app Help/README viewer. Bundles `userDocs/README*.md` (via a Vite `?raw` glob) and renders it with the Markdown previewer used elsewhere (sanitized, read-only). The dialog paper pulls the favicon data URL from the `<link rel="icon">` tag (injected by `assetsPlugin`) to paint a richer but still translucent background that matches the app branding without duplicating the asset; the favicon layer scales to 80% of the dialog while preserving aspect ratio.
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
- `scripts/release/release-win.ps1`: Build-and-package script for Windows (type-checks, runs tests, builds, stages, archives). A fail-fast `npm run typecheck` runs before the test/build phases (both dev and release) so a scripts-tsconfig break surfaces in seconds rather than after a full build at the `export:l10n` step. A release run also commits itself and writes the release manifest (see [Release commits and tags](#release-commits-and-tags)). Pass `-DevBuild` to keep the current package.json version, suffix outputs with `-dev`, and leave git untouched.
- `scripts/release/release-win-dev.ps1`: Thin wrapper that invokes `release-win.ps1 -DevBuild` so both entry points stay in sync.
- `scripts/release/publish-release.ps1`: Publishes a checked release (tags, pushes, releases-repository docs, GitHub release); see [Release commits and tags](#release-commits-and-tags). `scripts/release/release-common.ps1` holds the helpers it shares with `release-win.ps1`.
- `scripts/vite/assetsPlugin.ts`: Injects the favicon data URL during dev and build based on its explicit include list.

### Icon Assets Catalogs

Game artwork is **not** part of the repository. Builds read it from an asset pack; a clone without the pack builds and runs with the project's own placeholder art. Only the project's own `ico/favicon.svg` is tracked.

- **Configuring the pack**: write the pack root once into `%USERPROFILE%\.config\sellfilecreator\game-assets-dir.txt` (first non-comment line); every clone on the machine then finds it. `SFC_GAME_ASSETS_DIR` in the environment or a clone's gitignored `.env.local` overrides that file for one clone, and an explicitly empty value forces a placeholder build (`scripts/vite/gameAssetsDir.ts`). `scripts/vite/gameIconsPlugin.ts` serves `virtual:game-icons` from it; the build logs which mode it uses. release-win.ps1 uses the pack when one is configured and then sets `SFC_REQUIRE_GAME_ASSETS=1`, so a configured pack without its `ico/` folder fails the build instead of quietly shipping placeholders. Without a pack it still packages, with placeholder icons, and prints a NO ASSET PACK notice at the start and the end of the run. `loadSfcEnv` composes the `SFC_` settings a build sees (`.env` files, then the process environment) for both `vite.config.ts` and `scripts/tooling/print-game-assets-dir.mjs`, which prints the resolved pack so release-win.ps1 checks and tags the same pack the build embeds (see [Release commits and tags](#release-commits-and-tags)).
- **Pack layout** (mirrors the former in-repo folders, so the web build's `ico/<group>/` → `img/<group>/` routing is unchanged):
  - `ico/champs/<heroId>.webp` — champion portraits.
  - `ico/faction/<stem>.webp` — faction crests keyed by slugified faction names (`banner-lords`, `shadowkin`, …).
  - `ico/sets/<Set_Name>.webp` — set icons, plus `Spider.webp` (the no-set accessory marker).
  - `ico/sets/slots/<Key>.webp` — per-set/per-slot art: `<Set_Name>_<Slot>` for artifact sets (slot is `Weapon`, `Helmet`, `Shield`, `Gloves`, `Chest`, `Boots`) and `<Faction>_<Accessory>` for faction accessories.
  - `ico/slots/slot-glyphs.json` — slot glyph SVG data `{ Weapon: { viewBox, path }, … }`.
  - `reference/` — lossless masters, sprites and source screenshots (not read by the build).
- **App side**: `src/lib/iconMaps/gameIcons.ts` is the only module that imports `virtual:game-icons`. It also holds the fallbacks: lettered placeholder tiles (`placeholderIconUrl`) for crests, set icons and the no-set marker, and the project's own slot glyphs (`OWN_SLOT_GLYPHS`). Champion portraits and set-slot art have no placeholder; their callers already fall back (no portrait, plain slot glyph). The icon map modules (`championIconMap`, `factionIconMap`, `gearsetIconMap`, `setSlotIconMap`, `artifactTypeIcons`, `NoGearSetIcon`) map domain ids to pack file stems.
- **Node test runs** have no Vite: `patch-esm-specifiers.cjs` points `virtual:game-icons` at an emitted stub with the no-pack shape.
- **New set**: add the art to the pack (in the pack, `npm install` then `npm run convert` re-creates the `.webp` icons from the masters) and add the set's stem to `GEARSET_ICON_STEMS`.

## Release Notes Workflow

Release history lives in `userDocs/HISTORY.md` (UTF-8 with BOM; user-facing — plain language, no internals). Claude orchestration follows two prompts: `docs/CREATE-RELEASE-NOTES.md` (single-pass + reducer role) and `docs/CREATE-RELEASE-NOTES-WORKER.md` (map-worker role). Only `userDocs/HISTORY.md` and `PRE-RELEASE-CHECKLIST.md` change during a run; plan files, commits, and artefact directories are untouched.

Two equivalent drivers exist, so either shell works — keep them in sync when changing behaviour:

| Script | Entry point | Use on |
| --- | --- | --- |
| `scripts/release/run-release-notes-catchup.sh` | `npm run release-notes:catchup` | Bash (WSL/Linux clones) |
| `scripts/release/run-release-notes-catchup.ps1` | `npm run release-notes:catchup:win` | Windows PowerShell 7+ |

Both accept the same environment overrides and drive Claude identically. The PowerShell port takes named parameters instead of bash flags (`-All`, `-Note`, `-Branch`, `-Date`) and documents them via `Get-Help ./scripts/release/run-release-notes-catchup.ps1`.

### Modes

The script picks a mode per release based on the total changed lines (numstat add+delete) in the commit range:

- **Single-pass** (≤ `RELEASE_NOTES_SINGLE_PASS_LINES`, default 5000): one Claude run reads the diffs directly, writes the bilingual entry to `userDocs/HISTORY.md`, and appends maintainer review items to a per-release scratch file.
- **Map-reduce** (above the threshold): commits are split into chunks of at most `RELEASE_NOTES_WORKER_LINES` changed lines (default 3500). A worker Claude run handles each chunk, emitting a `chunk-NNN.bullets.md` file with player-facing bullets and appending maintainer concerns directly to a shared scratch file. A final reducer run consolidates the bullet files into `userDocs/HISTORY.md`. Workers default to Haiku; reducer/single-pass default to Sonnet — override with `RELEASE_NOTES_WORKER_MODEL` and `RELEASE_NOTES_REDUCER_MODEL` (set either to empty string to inherit the CLI default).

Worker scratch lives in `docs/.release-notes/<version>/` (gitignored, wiped on success). After every release the script mechanically prepends the collected maintainer items to `PRE-RELEASE-CHECKLIST.md` under a new `## v<version> — <date>` heading, keeping that file newest-first.

### Workflow

1. **Sync history** — `npm run release-notes:catchup` (bash) or `npm run release-notes:catchup:win` (PowerShell)  
   Default behaviour updates only the newest missing release entry plus the in-progress version derived from `package.json`. Pass `-- --all` (bash) / `-- -All` (PowerShell), or set `RELEASE_NOTES_CATCHUP_ALL=1`, to back-fill every gap. Override the heading date for the in-progress entry with `RELEASE_NOTES_DATE=yyyy-mm-dd` (PowerShell: `-Date`); pin the scanned branch with `RELEASE_NOTES_BRANCH=<ref>` (PowerShell: `-Branch`).

   **Steering one run** — the PowerShell driver accepts `-Note "<text>"` (alias `-Prompt`, env `RELEASE_NOTES_EXTRA_NOTE`), appended verbatim to every prompt in the run as an "Additional instruction from the maintainer" section. It reaches workers, reducer, and single-pass alike, so use it for release-specific emphasis:

   ```powershell
   npm run release-notes:catchup:win -- -Note "Hotfix; lead with the export crash fix and keep it short."
   ```

   The note supplements the prompt documents rather than overriding them — the rules in `docs/CREATE-RELEASE-NOTES.md` (no easter eggs, no dev-only features, plain language) still apply. Omitting `-Note` produces byte-identical prompt input to the bash driver.
2. **Review the checklist** — Skim `PRE-RELEASE-CHECKLIST.md` for items the run flagged (unfinished cleanups, drifted docs, suspect regressions, schema concerns). Act on them or delete them; the file is intentionally a working document, not an archive.
3. **Gate the release** — Before packaging, confirm `userDocs/HISTORY.md` already includes the upcoming `vX.Y.Z` entry and that `PRE-RELEASE-CHECKLIST.md` is empty (or only contains items you've consciously deferred). Review both diffs and **commit them** — `npm run release:win` refuses a dirty working tree, so the notes that ship are the notes in the tagged commit.

Claude inspects diffs, not just commit messages — some commits run thousands of lines, which is why the chunker budgets by changed lines rather than commit count. Large asset updates under `examples/` are skipped unless they change player-facing behaviour. The final notes list English bullets first, then German translations covering the same points.

### Release commits and tags

A release is marked by an annotated **`vX.Y.Z` tag**, and only by the tag: the catch-up drivers list `git tag --list 'v[0-9]*' --merged <branch>` and never match commit subjects (subjects are prose, not a stable marker). Each release is two commits, both written by `npm run release:win`, and a tag written by `npm run release:publish` once the zip has been checked:

1. `chore(release): release X.Y.Z` — `package.json` and the crate versions (`wasm/Cargo.toml`, `wasm/Cargo.lock`) at exactly `X.Y.Z`, plus any other tracked file the run itself changed (the tree was clean at the start, so `git add -u` stages only the run's own edits). Its tree is what the archive was built from, and it is the commit that gets **tagged `vX.Y.Z`** on publishing.
2. `chore(release): start N development` — only the bump to `N-dev` (`-Bump patch|minor|major` picks `N`).

The run refuses to start on a dirty working tree (untracked files included), so nothing uncommitted can ship. The asset pack is optional. Without it the package has placeholder icons, and the run says so at its start and end. When it is used, it is held to the same rule: the pack must be committed, and on publishing its commit gets the same annotated `vX.Y.Z` tag, so the artwork that shipped can be found again. Before the slow steps the run also refuses a `vX.Y.Z` tag that already exists in either repository. It changes only the version line of `package.json`, so the release diffs stay one line.

`release:win` hands over to `release:publish` through `releases/SellfileCreator_vX.Y.Z.release.json` (gitignored, next to the zip): the version, the archive name, the release commit and, when used, the asset pack folder and commit as they were at build time. Both scripts share their git/tag/manifest helpers in `scripts/release/release-common.ps1`. `npm run release:publish` (`-- -Version X.Y.Z` to pick one; default is the newest manifest, `-- -Yes` skips the prompt) checks everything first — `gh` installed and logged in, no `vX.Y.Z` release yet in the releases repository (https://github.com/Nusi42/RslHelperSellfileCreator.Releases), the release commit on `main`, existing tags only on the recorded commits, a `## vX.Y.Z` entry in the release commit's `userDocs/HISTORY.md` — shows the release text and asks for `yes`. Then it tags both commits, runs `git push github main --follow-tags` here and `git push --follow-tags` in the pack, copies `userDocs/README.md` and `userDocs/HISTORY.md` *from the release commit* into a temporary clone of the releases repository and commits them as `vX.Y.Z` (skipped when unchanged), and creates the `vX.Y.Z` GitHub release with that HISTORY entry as text and the zip attached. Creating the release also creates the releases repository's own `vX.Y.Z` tag (lightweight, as for earlier releases), pinned to the exact commit the run just pushed rather than to whatever `main` points at. Each step accepts work already done, so a re-run after a failure continues. Publish before running the release-notes catch-up for the next version: until the tag exists, the catch-up still counts the released commits as unreleased.

Tags are the catch-up's only release source, so a clone without them must `git fetch --tags` first. With no tags reachable but a non-empty `userDocs/HISTORY.md`, the drivers stop with an error; without that guard the in-progress range would be the entire history.
