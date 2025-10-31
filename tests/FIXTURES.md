# Fixtures Overview

This folder feeds the file-based HSFC → HSF tests and mirrors the rule set
users can export from the app.

## File pairs
- Each test case is a pair of files sharing the same base name.
  - `<name>.hsfc` (input) holds the readable HSFC config or config set.
- `<name>.hsf` (expected) captures the full HSF output produced by the
  merged-rule pipeline (`parseHsfcObject` → `computeMergedRules` → metadata strip).
- The harness compares every field on each rule exactly as emitted, so stored snapshots must include the complete payload (no trimming allowed) and preserve the builder’s property order.
- Legacy suffixes (`.hsfc.json`, `.hsf.json`) also load for back-compat.
- Keep payloads minimal and focused on the scenario under test.
- When a case depends on specific roll floors, include a `Minima` block in the HSFC. Legacy fixtures now pin the pre-average minima so changes to the app defaults do not churn unrelated expectations.

## Optional pinpoint checks
- When behaviour needs targeted assertions beyond structural equality, add `<name>.assert.mjs` exporting `validate(rules: HsfRule[])`.
- The e2e runner loads that helper dynamically after the fixture pair comparison.
- Prefer the helper file only for expectations that cannot live in the static `.hsf` snapshot (e.g. ensuring dedupe across rarity tiers).
- To regenerate a pair after logic changes, normalize the `.hsfc` via the app pipeline and rewrite the `.hsf` using the helpers in `scripts/` (they re-use the builder output verbatim so key order matches the in-app export). The runner itself (`tests/file-hsfc-e2e.ts`) can be executed after edits to refresh the expected output.
- When calling the helpers directly, run `tsc -p tsconfig.tests.json && node scripts/patch-esm-specifiers.cjs` first so `scripts/.tmp/**` holds the latest compiled modules.

## Naming conventions
- Prefix the base name with the feature under test (`auto-…`, `legendary-…`, `ring-…`, etc.) so failures read clearly.
- Encode the critical parameters in the filename (`minreq5`, `late`, `mincount-3`, etc.) to make intent obvious without opening the file.
- For multi-config exports, keep related configs in a single `.hsfc` file (example: `auto-banner-aggregate-window.hsfc`).

## Current coverage highlights
- `epic-percent-optionals-capped.*` protects the ≥ Epic late-percent substat caps at +16.
- `epic-factory-triple-collapse.*` pins the Epic factory triple minima collapse for levels 0/4/8/12, while `epic-factory-triple-full-window-minreq3.*` proves the +16 milestone still enumerates every partition once the fourth substat is present.
- `auto-at-0-with-k-4-minreq{3,4,5}.*` (and `auto-banner-aggregate-window.*`) cover the Banner aggregate-roll collapse logic for Legendary/Mythical progressions.
- Files prefixed with `auto-flex-`, `ring-flex-`, or `ring-manual-` exercise autosupplement thresholds and manual rarity baselines.
- The `ring-flex-*.hsf` snapshots double-check that pruning keeps real multi-stat requirements: rows that combine HP% and DEF% (or other targeted pairs) must remain because they encode split roll distributions. If a future change trims those rows, re-run `node scripts/build-hsf-from-config.mjs < tests/fixtures/ring-flex-…hsfc > …/tmp.hsf` and inspect the +12/+16 sections before accepting the churn.
- `legendary-late-…` fixtures verify late keep schedules for exact rarity configs.
- `locked-target-…` fixtures validate locked-substat roll targeting, caps, and feasibility checks on minRequiredRolls.
- `roll-target-single-spd.*` locks in the per-stat roll target overrides for single-stat configs, covering explicit base overrides, sparse increments, and fallback to the default minima when an increment cell is empty.
- `roll-target-collapsed-quad.*` protects the collapsed 4-substat builder path so Level=Any rows honor roll target base overrides when every stat is locked.
- `minima-default-averages.*` guards the averaged flat minima now shipped with the app so we notice if the defaults shift again.
- When a scenario needs to cover both collapse and non-collapse behaviour, we keep two variants:
  - The `*-factory.*` pair pins `Minima` to the factory roll floors so the builder still collapses to a single rule (`auto-at-0-with-k-4-minreq4-factory.*`, `auto-banner-aggregate-window-factory.*`, `roll-target-collapsed-quad-factory.*`, etc.).
  - The legacy pair (without the suffix) retains the boosted minima used in the original test so we continue to exercise the expanded multi-rule path.

Update this document when adding new fixture categories so contributors understand the scenarios we already cover and how to extend them consistently.
