# Fixtures Overview

This folder feeds the file-based SFR → HSF tests and mirrors the rule set
users can export from the app.

## File pairs
- Each test case is a pair of files sharing the same base name.
  - `<name>.sfr` (input) holds the readable SFR config or config set.
- `<name>.hsf` (expected) captures the full HSF output produced by the
  merged-rule pipeline (`parseSfrObject` → `computeMergedRules` → metadata strip).
- The harness compares every field on each rule exactly as emitted, so stored snapshots must include the complete payload (no trimming allowed) and preserve the builder’s property order.
- Legacy suffixes (`.sfr.json`, `.hsf.json`) also load for back-compat.
- Keep payloads minimal and focused on the scenario under test.
- When a case depends on specific roll floors, include a `Minima` block in the SFR. Legacy fixtures now pin the pre-average minima so changes to the app defaults do not churn unrelated expectations.

## Optional pinpoint checks
- When behaviour needs targeted assertions beyond structural equality, add `<name>.assert.mjs` exporting `validate(rules: HsfRule[])`.
- The fixture runner loads that helper dynamically after the fixture pair comparison.
- Prefer the helper file only for expectations that cannot live in the static `.hsf` snapshot (e.g. ensuring dedupe across rarity tiers).
- To regenerate a pair after logic changes, normalize the `.sfr` via the app pipeline and rewrite the `.hsf` using the helpers in `scripts/test/` (they re-use the builder output verbatim so key order matches the in-app export). The runner itself (`tests/integration/sfr-fixtures.runner.ts`) can be executed after edits to refresh the expected output.
- When calling the helpers directly, run `tsc -p tsconfig.tests.json && node scripts/tooling/patch-esm-specifiers.cjs` first so `tmp/tsc/**` holds the latest compiled modules.

## Naming conventions
- Prefix the base name with the feature under test (`auto-…`, `legendary-…`, `ring-…`, etc.) so failures read clearly.
- Encode the critical parameters in the filename (`minreq5`, `late`, `mincount-3`, etc.) to make intent obvious without opening the file.
- For multi-config exports, keep related recipes in a single `.sfr` file (example: `auto-banner-aggregate-window.sfr`).

## Current coverage highlights
- `epic-percent-optionals-capped.*` protects the ≥ Epic late-percent substat caps at +16.
- `epic-factory-triple-collapse.*` pins the Epic factory triple minima collapse for levels 0/4/8/12, while `epic-factory-triple-full-window-minreq3.*` proves the +16 milestone still enumerates every partition once the fourth substat is present.
- `factory-collapse-helmet-matrix.*` collects the Auto/Legendary/Epic/Rare helmet scenarios used to validate the factory minima shortcuts, so regressions show up across full, partial, and range-specific windows.
- `auto-at-0-with-k-4-minreq{3,4,5}.*` (and `auto-banner-aggregate-window.*`) cover the Banner aggregate-roll collapse logic for Legendary/Mythical progressions.
- `minreq0-roll-schedule-matrix.*` captures Auto and explicit rarity recipes with `minRequiredRolls=0`, ensuring roll thresholds are suppressed and Auto resolves to Any only when no roll requirements exist.
- Files prefixed with `auto-flex-`, `ring-flex-`, or `ring-manual-` exercise autosupplement thresholds and manual rarity baselines.
- The `ring-flex-*.hsf` snapshots double-check that pruning keeps real multi-stat requirements: rows that combine HP% and DEF% (or other targeted pairs) must remain because they encode split roll distributions. If a future change trims those rows, re-run `node scripts/build-hsf-from-recipe.mjs < tests/fixtures/ring-flex-…sfr > …/tmp.hsf` and inspect the +12/+16 sections before accepting the churn.
- `legendary-late-…` fixtures verify late keep schedules for exact rarity recipes.
- `locked-target-…` fixtures validate locked-substat roll targeting, caps, and feasibility checks on minRequiredRolls.
- `locked-aggregate-combos.*` bundles the ten recipes from `lockedTests.sfr` so both importer and builder are exercised across every locked/global aggregate pairing (Auto vs Late, locked-only vs global-only, and mixed floors).
- `roll-target-single-spd.*` locks in the per-stat roll target overrides for single-stat recipes, covering explicit base overrides, sparse increments, and fallback to the default minima when an increment cell is empty.
- `roll-target-collapsed-quad.*` protects the collapsed 4-substat builder path so Level=Any rows honor roll target base overrides when every stat is locked.
- `minima-default-factory.*` locks in the factory (in-game) minima we ship by default so we spot regressions if the base roll floors change again.
- `auto-flex-epic-legendary-optionals.*` captures the Auto+Flex dual-branch pattern (locked SPD/CR%/CDMG% with wildcard fourth stats) so Epic rows still collapse at the early milestones while Legendary rows emit the 4-of minima once Epic’s +16 permutations appear.
- `auto-flex-loose-optionals.*` exercises the same Auto+Flex pattern when the aggregate roll floor is below the locked trio, ensuring the Epic +16 and ≥Legendary branches keep the trio while allowing optional fourth-slot permutations only after additional rolls exist.
- `tests/data/sample2-bundle/` now carries the large `examples/example.sfr` + `tests/data/sample2.db` fixture bundle for transcript-driven regression checks.
- `tests/data/sample2-bundle/configs/` exports one fixture variant per source recipe and per major recipe-override profile (`lategame`, `endgame`, `endgame+`), then dedupes profile outputs when the effective recipe is identical; profile-to-variant mapping lives in `tests/data/sample2-bundle/manifest.json`.
- `tests/data/sample2-bundle/safeguards/` exports one fixture variant per safeguard rule while keeping the full mixed keep/sell config list in place, so safeguard behavior is always evaluated in real rule context (including recipe-override profile effects).
- `tests/integration/sample2-matcher.runner.ts` is executed by `npm run test:unit` via `scripts/test/run-tests.mjs`, using `tests/data/sample2-bundle/manifest.json` as source-of-truth for fixture paths. It asserts that safeguard injected rows are never empty and that matcher outputs always include both `firstMatch` and `firstNonExcludedMatch` for every artifact in the shared sample2 DB.
- When a scenario needs to cover both collapse and non-collapse behaviour, we keep two variants:
  - The `*-factory.*` pair pins `Minima` to the factory roll floors so the builder still collapses to a single rule (`auto-at-0-with-k-4-minreq4-factory.*`, `auto-banner-aggregate-window-factory.*`, `roll-target-collapsed-quad-factory.*`, etc.).
  - The legacy pair (without the suffix) retains the boosted minima used in the original test so we continue to exercise the expanded multi-rule path.

- `lte-rarity-2-of-3-flat-sell.*` covers the LTE (≤) rarity range fix: eight sell recipes across ≤ Epic / ≤ Rare / ≤ Uncommon / Common, each in full-range (maxLevel=16) and level-0-only (maxLevel=0) variants, with `autoSubstatFlex=true` and `rollBounds: {any:true}` / `minCount=2`. Verifies (a) that LTE codes use their upper-bound rarity's substat-presence schedule so rules are generated for ≤ Epic at all levels and (b) that levels where fewer substats are present than `minCount` (e.g. Common at +0/+4, LTE_Uncommon at +0) are omitted from flex-mode sell rules rather than emitting empty or under-qualified rules.

Update this document when adding new fixture categories so contributors understand the scenarios we already cover and how to extend them consistently.
