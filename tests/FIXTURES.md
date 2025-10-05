# Fixtures Overview

This folder feeds the file-based HSFC → HSF tests and mirrors the rule set
users can export from the app.

## File pairs
- Each test case is a pair of files sharing the same base name.
  - `<name>.hsfc` (input) holds the readable HSFC config or config set.
- `<name>.hsf` (expected) captures the canonicalized HSF output produced by the
  merged-rule pipeline (`parseHsfcObject` → `computeMergedRules` → metadata strip).
- Legacy suffixes (`.hsfc.json`, `.hsf.json`) also load for back-compat.
- Keep payloads minimal and focused on the scenario under test.

## Optional pinpoint checks
- When behaviour needs targeted assertions beyond structural equality, add `<name>.assert.mjs` exporting `validate(rules: HsfRule[])`.
- The e2e runner loads that helper dynamically after the fixture pair comparison.
- Prefer the helper file only for expectations that cannot live in the static `.hsf` snapshot (e.g. ensuring dedupe across rarity tiers).
- To regenerate a pair after logic changes, normalize the `.hsfc` via the app pipeline and rewrite the `.hsf` using the same helper used by the tests. The runner itself (`tests/file-hsfc-e2e.ts`) can be executed after edits to refresh the expected output.

## Naming conventions
- Prefix the base name with the feature under test (`auto-…`, `legendary-…`, `ring-…`, etc.) so failures read clearly.
- Encode the critical parameters in the filename (`minreq5`, `late`, `mincount-3`, etc.) to make intent obvious without opening the file.
- For multi-config exports, keep related configs in a single `.hsfc` file (example: `auto-banner-aggregate-window.hsfc`).

## Current coverage highlights
- `epic-percent-optionals-capped.*` protects the ≥ Epic late-percent substat caps at +16.
- `auto-at-0-with-k-4-minreq{3,4,5}.*` (and `auto-banner-aggregate-window.*`) cover the Banner aggregate-roll collapse logic for Legendary/Mythical progressions.
- Files prefixed with `auto-flex-`, `ring-flex-`, or `ring-manual-` exercise autosupplement thresholds and manual rarity baselines.
- `legendary-late-…` fixtures verify late keep schedules for exact rarity configs.
- `locked-target-…` fixtures validate locked-substat roll targeting, caps, and feasibility checks on minRequiredRolls.

Update this document when adding new fixture categories so contributors understand the scenarios we already cover and how to extend them consistently.
