# Fixtures Overview

This folder feeds the file-based SFC → HSF tests and mirrors the rule set
users can export from the app.

> **Subfolder exception:** `captures/` holds compressed real endpoint-capture
> sessions (`<session>.tar.zst`, packed/unpacked via
> `npm run fixtures:captures:pack|unpack`), not SFC→HSF pairs. See
> [`docs/technical/packet-capture.md`](../docs/technical/packet-capture.md)
> ("Promoting a recording") for the workflow and the session inventory.
>
> `gear-db/` holds the gear-database fixtures as SQL dumps (`<name>.sql`), built on demand
> into `tmp/fixtures/gear-db/`. See
> [`docs/technical/test-data.md`](../docs/technical/test-data.md).

## File pairs
- Each test case is a pair of files sharing the same base name.
  - `<name>.sfc` (input) holds the readable SFC recipe or recipe set.
- `<name>.hsf` (expected) captures the full HSF output produced by the
  merged-rule pipeline (`parseSfcObject` → `computeMergedRules` → metadata strip).
- The harness compares every field on each rule exactly as emitted, so stored snapshots must include the complete payload (no trimming allowed) and preserve the builder’s property order.
- Legacy suffixes (`.sfc.json`, `.hsf.json`) also load for back-compat.
- Keep payloads minimal and focused on the scenario under test.
- When a case depends on specific roll floors, include a `Minima` block in the SFC. Legacy fixtures now pin the pre-average minima so changes to the app defaults do not churn unrelated expectations.

## Optional pinpoint checks
- When behaviour needs targeted assertions beyond structural equality, add `<name>.assert.mjs` exporting `validate(rules: HsfRule[])`.
- The fixture runner loads that helper dynamically after the fixture pair comparison.
- Prefer the helper file only for expectations that cannot live in the static `.hsf` snapshot (e.g. ensuring dedupe across rarity tiers).
- To regenerate a pair after logic changes, normalize the `.sfc` via the app pipeline and rewrite the `.hsf` using the helpers in `scripts/test/` (they re-use the builder output verbatim so key order matches the in-app export). The runner itself (`tests/integration/sfc-fixtures.runner.ts`) can be executed after edits to refresh the expected output.
- When calling the helpers directly, run `tsc -p tsconfig.tests.json && node scripts/tooling/patch-esm-specifiers.cjs` first so `tmp/tsc/**` holds the latest compiled modules.

## Naming conventions
- Prefix the base name with the feature under test (`auto-…`, `legendary-…`, `ring-…`, etc.) so failures read clearly.
- Encode the critical parameters in the filename (`minreq5`, `late`, `mincount-3`, etc.) to make intent obvious without opening the file.
- For multi-recipe exports, keep related recipes in a single `.sfc` file (example: `auto-banner-aggregate-window.sfc`).

## Current coverage highlights
- `epic-percent-optionals-capped.*` protects the ≥ Epic late-percent substat caps at +16.
- `atk-per-stat-min-0-behaves-like-presence.*` confirms that setting a per-stat min of 0 on a substat is equivalent to a presence-only bound (no roll threshold enforcement).
- `presence-window-0.*` exercises the presence-only window when minLevel=maxLevel=0 — the rule should only check that the substat exists, not its roll count.
- `per-stat-min-max-impossible-yields-no-rows.*` verifies that a per-stat bound where min > max (e.g. ACC min=2, max=1) produces zero HSF rules.
- `amulet-atk-def-percent-substats-impossible.*` documents that ATK%+DEF% on an Amulet slot is infeasible (those substats cannot coexist on that slot), yielding no rules.
- `strict-at-16-emits-only-lower-bound.*` pins the strict (effectiveMode="strict") level-16 behaviour: only the lower-bound threshold row is emitted rather than every feasible distribution.

- **Per-stat progressive threshold series** — `spd-min-2-late.*`, `spd-min-3-progressive.*`, `spd-2-cr-1-progressive.*`, `spd-2-cr-1-cdmg-progressive.*`, `spd-2-cr-1-cdmg-late.*`, `spd-2-cr-1-cdmg-max-0-progressive-caps-honored.*`, `spd-2-cr-1-cdmg-max-0.*` (`late-spd-2-cr-1-cdmg-max-0.*`), `spd-2-acc-1-late-minimal-lower-bounds.*`, `late-spd-2-cr-1-without-wildcard.*`: span the matrix of (late vs. early) × (with/without wildcard third stat) × (with/without max=0 cap) for SPD+CR% and SPD+ACC core pairs, pinning the progressive roll thresholds at each milestone.
- **ACC per-stat threshold series** — `acc-min-2-progressive.*`, `acc-min-3-progressive.*`, `acc-min-5-per-stat-progressive-thresholds.*`: single-ACC-substat progressive threshold variants at min=2/3/5.  `acc-min-2-with-minrequired-5-uses-global-progressive-thresholds.*` proves that when a global `minRequiredRolls` exceeds the per-stat min, the global schedule drives the thresholds. `acc-minrequired-2-single-substat-late-minimal.*` and `acc-minrequired-5-only-progressive-thresholds.*` cover the `minRequiredRolls`-only (no per-stat bound) late and progressive paths.
- **Star-rank single-substat minReq series** — `star-minrequired-1-on-single-substat-spd-progressive-single-row.*`, `star-minrequired-2-on-single-substat-spd-progressive-single-row.*`, `star-minrequired-1-with-spd-max-0-globally-impossible-no-rules.*`, `star-star-with-minrequired-1-progressive-minimal-pairs.*`, `star-star-with-minrequired-1-late-minimal-pairs.*`: single- and dual-substat recipes with `minRequiredRolls` as the sole constraint, confirming progressive and late thresholds and that an impossible max=0 globally prunes all rules.
- `single-substat-spd-with-min-2-and-max-2-early.*` pins early-mode behaviour when min=max=2 (a point constraint), ensuring exactly one threshold row at exactly 2 rolls.
- `three-substats-all-min-1-minrequiredrolls-3-early.*` and `two-substats-spd-min-2-cr-max-1-minrequiredrolls-3-early.*` cover the interaction of per-stat minimums, a max cap on one substat, and a global `minRequiredRolls=3` in early mode.
- `minrequiredrolls-3-filters-unreachable-states.*` exercises a recipe where `minRequiredRolls=3` with no per-stat bounds but the roll schedule makes some intermediate states unreachable, confirming they are pruned.
- `five-selected-substats-mincount-4-with-fixed-spd-cr-and-mixed-bounds.*` captures a five-substat recipe (minCount=4) with two fixed substats carrying per-stat mins and one carrying max=0, stressing the mixed-bounds path at both collapse and expansion points.
- `four-substats-with-mixed-mins-maxes-collapse-to-mins-by-12-16.*` verifies that a four-substat recipe with mixed per-stat min/max bounds correctly converges to the minimum distribution by levels +12 and +16.
- `debuffer-boots-acc-3-any-two-of-res-hp-def-no-redundant-4-substat-rows.*` locks in the 6★ ≥Legendary Boots recipe (SPD main, ACC locked min=3, RES/HP%/DEF% flexible minCount=3), confirming that the 4-substat rows at +12/+16 are not redundantly emitted when three of the four slots always collapse.

- **Auto k-of series** — `auto-at-0-with-k-1.*` through `auto-at-0-with-k-4.*` pin the base Auto rarity schedule with k=1–4 selected substats and no `minRequiredRolls`, exercising the auto rarity resolution logic at its lowest boundary. `auto-at-0-with-k-3-late-min0.*` adds late mode + rare autoRarityThreshold with zero global min.
- **Auto factory quad series** — `auto-factory-quad.*`, `auto-factory-quad-five.*`, `auto-factory-quad-minreq4.*`, and the `*-minlevel-4.*` variants pin factory-minima Auto quad (and five-stat) recipes, including both full 0–16 and minLevel=4 windows and the collapse triggered by `minRequiredRolls=4`.
- **Auto no-mins filter matrix** — `auto-no-mins-at-16-single-keep-all-rule.*`, `auto-no-mins-0-16-single-keep-all-at-any-level-99.*`, and the `auto-no-mins-with-{faction,mainstat,rank,rarity,slot}-….*` family verify that recipes with zero roll constraints but various non-substat filters (faction, main stat, rank, rarity, slot) each emit exactly one rule and that the rule carries the correct filter fields.
- `auto-with-minrequiredrolls-5-resolves-to-mythical.*` confirms that Auto rarity with `minRequiredRolls=5` resolves to ≥ Mythical (not ≥ Legendary or ≥ Epic).
- **Auto late banner series** — `auto-late-spd2-banner.*` and `auto-late-spd3-banner.*` pin late-mode Banner recipes with SPD min=2 and min=3 respectively, exercising the late threshold schedule on the Banner slot. `banner-auto-epic-floor-late.*` adds the autoRarityThreshold="epic" floor constraint in late mode.
- **Auto helmet variants** — `auto-helmet-double-locked-minreq2.*`, `auto-helmet-spd-cr-acc-res-minreq3.*`, `auto-helmet-triple-mincount3-minreq3.*`, `any-helmet-spd-acc-res-auto-mincount.*`, `rare-helmet-spd-res-auto-mincount.*`: a set of helmet-slot recipes spanning locked substats, `autoMinCount`, and explicit `minRequiredRolls` overrides, exercising the per-slot substat presence schedule.
- `auto-late-rare-supplement-single-cdmg.*` pins late mode with a rare autoRarityThreshold for a single locked CDMG% on Chestplate, confirming the rare supplement threshold schedule.
- `auto-late-locked-triple-wildcard-minreq2.*` exercises late mode with three locked wildcard substats and `minRequiredRolls=2`, confirming that all-wildcard locked triples still produce correctly bounded late rules.
- **Undead faction series** — `auto-undead-res-banner-minreq{0,3,4,5}.*` and `auto-undead-res-banner-late-threshold-minreq{4,5}.*` lock in Banner RES main + HP%/DEF% substats for the Undead Hordes faction across the full `minRequiredRolls` range (0–5) in both early and late modes. `auto-undead-quad-spd-cr-cdmg-acc-minreq3.*` adds the four-substat quad variant for the same faction.

- **Amulet slot** — `amulet-main-cdmg-hp-atk-substats-spd-acc-cr-mincount-{2,3}-minreq-{2,3}.*`: Amulet with CDMG%/HP%/ATK% main options and SPD/ACC/CR% substats, covering every pairing of minCount ∈ {2,3} × minRequiredRolls ∈ {2,3}.
- **Banner slot** — `banner-main-acc-res-hp-substats-spd-acc-cr-mincount-{2,3}-minreq-{2,3}.*`: same minCount × minRequiredRolls matrix for Banner with ACC/RES/HP% main options.
- **Multi-slot main-stat × minCount × minReq matrix** — `main-cr-hp-spd-slots-gauntlets-chestplate-boots-substats-spd-acc-cr-mincount-{2,3}-minreq-{2,3}.*`: three-slot (Gauntlets/Chestplate/Boots) with CR%/HP%/SPD main options and SPD/ACC/CR% substats, covering all four minCount × minRequiredRolls combinations. Together with the Amulet and Banner series above, these form the cross-slot fixture matrix used to catch slot-dependent presence schedule regressions.
- **Late wildcard pair** — `late-wildcard-pair-acc-res-minreq-{0,1,2,3,4,5}.*`: SPD-main Boots with ACC+RES wildcard pair in late mode across the full `minRequiredRolls` range (0–5), pinning the late-mode threshold schedule and its interaction with the aggregate roll floor.

- **Legendary k-of variants** — `legendary-at-0-with-k-4-minreq4.*` and `legendary-at-0-with-k-4-minreq4-factory.*`: Undead Hordes ≥ Legendary four-substat recipes with `minRequiredRolls=4`, one with boosted custom Minima and one with factory floors, mirroring the `auto-at-0-with-k-4-minreq4` pattern at the Legendary rarity tier.
- **Late single-stat rarity sweep** — `epic-late-single-cdmg.*`, `rare-late-single-cdmg.*`, `legendary-late-single-cdmg.*`: Chestplate HP% main with a single locked CDMG% substat in late mode, one fixture per explicit rarity tier, confirming that the late schedule respects the rarity-specific milestone count.
- `epic-3-of-4-at-16-not-below-12-spd.*` pins the ≥ Epic rule that 3-of-4 substat presence is only required at level 16 (not earlier), with an SPD minimum enforced at the final checkpoint.
- **Epic helmet quad** — `epic-helmet-quad-mincount3.*` and `epic-helmet-quad-minreq1.*`: Epic Helmet with four substats, covering the minCount=3 permutation path and the minReq=1 minimal constraint independently.
- **Rarity code sanity** — `rarity-epic-range-code-12.*`, `rarity-legendary-exact-code-5.*`, `rarity-mythical-exact-code-15.*`, `rarity-mythical-range-code-14.*`: one rule each for ≤ Epic (range), exact Legendary, exact Mythical, and ≤ Mythical (range), confirming the correct rarity codes are emitted and no extra rules appear.
- `uncommon-2-of-2-spd-res-16-not-below-12.*` verifies that for Uncommon-tier artifacts the 2-of-2 rule only fires at level 16, not at lower milestones where substats may not yet be present.
- **Mythical locked series** — `mythical-locked-minreq4-sink.*` and `mythical-locked-minreq-variants.*`: 6★ Mythical recipes with locked substats and `minRollsTarget="Locked"`, covering `minRequiredRolls` ∈ {4,5} and multi-config variants, confirming that the locked-roll sink mechanism correctly channels surplus rolls.
- **Rank-4 minima** — `rank-4-rarity-any-with-spd-min-0-uses-4-minima.*`, `rank-4-rarity-any-with-acc-min-0-uses-4-minima.*`, `rank-4-rarity-any-with-spd-and-minrequired-0-behaves-like-spd-min-0.*`: confirm that 4★ recipes use the correct (lower) 4-star minima and that `minRequiredRolls=0` behaves identically to a per-stat min of 0.

- **Gauntlet locked variants** — `gauntlet-locked-min-spd-cr.*` and `gauntlet-locked-min-variants.*`: 6★ ≥ Legendary CDMG%-main Gauntlets with SPD/CR% locked and HP% flexible, covering `minRequiredRolls` ∈ {3,4} and SPD min ∈ {1,2} in early mode. `gauntlets-flex-late-cr-spd-cdmg.*` adds the late-mode + autoSubstatFlex variant for the same slot.
- **Manual/auto flex locked** — `manual-flex-locked-acc.*` and `auto-late-locked-triple-wildcard-minreq2.*` (see above) exercise the flex mode (autoSubstatFlex=true) with a locked substat, testing that the locked constraint is preserved while flex extends to non-locked optional slots.
- `flex-wildcard-baseline-prunes.*` ensures that in flex mode, wildcard-only optional substats that cannot contribute any roll threshold (below the baseline) are pruned rather than emitting degenerate rows.

- **Example row patterns** — `example-top-row-minlevel-0-required-4.*`, `example-bottom-row-minlevel-16-main-res.*`, `example-bottom-row-minlevel-16-main-res-any-and-res-not-a-substat.*`: document the "top row" (four-substat, minLevel=0) and "bottom row" (SPD main, RES excluded as substat, minLevel=16) recipe patterns, confirming that the presence schedule and main-stat exclusion interact correctly.
- **Utility role (support)** — `utility-early.*` and `utility-late.*`: a 6★ ≥ Epic Weapon/Helmet/Shield recipe with SPD fixed min=1 and four flexible substats (minCount=3, minRequiredRolls=3) in early and late modes respectively, exercising the mixed-role archetype across both keep schedules.
- `epic-factory-triple-collapse.*` pins the Epic factory triple minima collapse for levels 0/4/8/12, while `epic-factory-triple-full-window-minreq3.*` proves the +16 milestone still enumerates every partition once the fourth substat is present.
- `factory-collapse-helmet-matrix.*` collects the Auto/Legendary/Epic/Rare helmet scenarios used to validate the factory minima shortcuts, so regressions show up across full, partial, and range-specific windows.
- `auto-at-0-with-k-4-minreq{3,4,5}.*` (and `auto-banner-aggregate-window.*`) cover the Banner aggregate-roll collapse logic for Legendary/Mythical progressions.
- `minreq0-roll-schedule-matrix.*` captures Auto and explicit rarity recipes with `minRequiredRolls=0`, ensuring roll thresholds are suppressed and Auto resolves to Any only when no roll requirements exist.
- Files prefixed with `auto-flex-`, `ring-flex-`, or `ring-manual-` exercise autosupplement thresholds and manual rarity baselines.
- The `ring-flex-*.hsf` snapshots double-check that pruning keeps real multi-stat requirements: rows that combine HP% and DEF% (or other targeted pairs) must remain because they encode split roll distributions. If a future change trims those rows, re-run `node scripts/build-hsf-from-recipe.mjs < tests/fixtures/ring-flex-…sfc > …/tmp.hsf` and inspect the +12/+16 sections before accepting the churn.
- `legendary-late-…` fixtures verify late keep schedules for exact rarity recipes.
- `locked-target-…` fixtures validate locked-substat roll targeting, caps, and feasibility checks on minRequiredRolls.
- `locked-aggregate-combos.*` bundles the ten recipes from `lockedTests.sfc` so both importer and builder are exercised across every locked/global aggregate pairing (Auto vs Late, locked-only vs global-only, and mixed floors).
- `roll-target-single-spd.*` locks in the per-stat roll target overrides for single-stat recipes, covering explicit base overrides, sparse increments, and fallback to the default minima when an increment cell is empty.
- `roll-target-collapsed-quad.*` protects the collapsed 4-substat builder path so Level=Any rows honor roll target base overrides when every stat is locked.
- `minima-default-factory.*` locks in the factory (in-game) minima we ship by default so we spot regressions if the base roll floors change again.
- `auto-flex-epic-legendary-optionals.*` captures the Auto+Flex dual-branch pattern (locked SPD/CR%/CDMG% with wildcard fourth stats) so Epic rows still collapse at the early milestones while Legendary rows emit the 4-of minima once Epic’s +16 permutations appear.
- `auto-flex-loose-optionals.*` exercises the same Auto+Flex pattern when the aggregate roll floor is below the locked trio, ensuring the Epic +16 and ≥Legendary branches keep the trio while allowing optional fourth-slot permutations only after additional rolls exist.
- `tests/data/sample2-bundle/` carries the large `presets/lategame.sfc` + `sample2` gear-DB fixture bundle for transcript-driven regression checks.
- `tests/data/sample2-bundle/recipes/` exports one fixture variant per source recipe and per major recipe-override profile (`lategame`, `endgame`, `endgame+`), then dedupes profile outputs when the effective recipe is identical; profile-to-variant mapping lives in `tests/data/sample2-bundle/manifest.json`.
- `tests/data/sample2-bundle/keep-uniques/` exports one fixture variant per Keep Uniques rule while keeping the full mixed keep/sell recipe list in place, so that rule is always evaluated in real rule context (including recipe-override profile effects).
- `tests/integration/sample2-matcher.runner.ts` is executed by `npm run test:unit` via `scripts/test/run-tests.mjs`, using `tests/data/sample2-bundle/manifest.json` as source-of-truth for the SFC path and the gear-DB fixture name (`sharedGearDb`). It asserts that safeguard injected rows are never empty and that matcher outputs always include both `firstMatch` and `firstNonExcludedMatch` for every artifact in the shared sample2 DB.
- When a scenario needs to cover both collapse and non-collapse behaviour, we keep two variants:
  - The `*-factory.*` pair pins `Minima` to the factory roll floors so the builder still collapses to a single rule (`auto-at-0-with-k-4-minreq4-factory.*`, `auto-banner-aggregate-window-factory.*`, `roll-target-collapsed-quad-factory.*`, etc.).
  - The legacy pair (without the suffix) retains the boosted minima used in the original test so we continue to exercise the expanded multi-rule path.

- `lte-rarity-2-of-3-flat-sell.*` covers the LTE (≤) rarity range fix: eight sell recipes across ≤ Epic / ≤ Rare / ≤ Uncommon / Common, each in full-range (maxLevel=16) and level-0-only (maxLevel=0) variants, with `autoSubstatFlex=true` and `rollBounds: {any:true}` / `minCount=2`. Verifies (a) that LTE codes use their upper-bound rarity's substat-presence schedule so rules are generated for ≤ Epic at all levels and (b) that levels where fewer substats are present than `minCount` (e.g. Common at +0/+4, LTE_Uncommon at +0) are omitted from flex-mode sell rules rather than emitting empty or under-qualified rules.

- `auto-spd-min3-cr-cdmg-any-early.*` and `auto-spd-min2-cr-min1-cdmg-any-early.*` pin the earlyKeepMode="early" proportional-progress schedule for Auto rarity (resolves to GTE_Epic): SPD-only accumulates rolls at each milestone for the min=3 case; SPD and CR% share the budget for the min=2/min=1 case. Paired with `gte-legendary-spd-min3-cr-cdmg-any-early.*` and `gte-legendary-spd-min2-cr-min1-cdmg-any-early.*` which exercise the same logic under ≥ Legendary (4 milestones vs 3), confirming the strict early-budget formula (`sum_min - avail`) is correct across both rarity schedules.

- `locked-min-3-all-wildcards-early.*` and `locked-min-3-spd-min3-wildcards-early.*` cover the locked-aggregate proportional-progress fix for earlyKeepMode="early". The all-wildcards variant has one locked substat (SPD) and lockedMinRequiredRolls=3, so the locked constraint forces SPD to take all rolls at each milestone. The spd-min3 variant additionally carries a per-stat minimum for SPD, which produces the same outcome (both constraints point to SPD). `auto-locked-min3-spd-min2-cr-min1-cdmg-early.*` adds a second locked substat (CR%), with lockedMinRequiredRolls=3 matching the sum of per-stat mins exactly — confirming the locked aggregate adds no extra constraint when `sum_locked_min == locked_min_value`.

- `late-spd-min2-cr-min1-cdmg-any-gte-rare.*` pins the late-mode joint-feasibility fix. Recipe: `earlyKeepMode="late"`, SPD fixed min=2, CR% fixed min=1, CDMG% wildcard, autoMinRequiredRolls=true, autoRarityThreshold="rare". The auto resolver returns GTE_Epic (base branch), and `build_hsf_rarity_branches_core` adds a supplemental GTE_Legendary branch restricted to levels [4, 8, 12]. At GTE_Legendary level 12 (avail=3, num_target=4, remaining=1), `extra_targeted=1` allowed wildcards to absorb the extra aggregate budget, generating the infeasible distribution [SPD=1, CR%=0, CDMG%=2] (joint deficit 2 > remaining 1). The fix adds a post-generation feasibility filter in `build_hsf_late_bounded_rows_core` that rejects rows where Σ max(0, min_i − row_i) > remaining. After the fix, level-12 GTE_Legendary produces 4 rules from the remaining feasible distributions (those where joint deficit ≤ remaining=1).

- **Late SPD/CR%/CDMG% autoMinRequiredRolls matrix** — `late-spd-min3-cr-any-cdmg-any-gte-rare.*` and `late-spd-min3-cr-any-cdmg-any-legendary.*` extend the SPD+CR%+CDMG% late family to SPD fixed min=3 (two wildcards), once with Auto rarity + autoRarityThreshold="rare" and once with explicit ≥ Legendary. `late-spd-min2-cr-min1-cdmg-any-legendary.*` is the ≥ Legendary variant of `late-spd-min2-cr-min1-cdmg-any-gte-rare` (explicit rarity removes the Auto-supplement branch, producing more rules because all four milestone levels apply). Together these fixtures span the matrix of (Auto-rare vs Legendary) × (SPD min=2+CR% min=1 vs SPD min=3 wildcards) under `autoMinRequiredRolls=true` in late mode.

- **Late SPD/CR%/CDMG% lockedMinRequiredRolls=3 matrix** — `late-spd-any-cr-any-cdmg-any-locked-min3-gte-rare.*`, `late-spd-min3-cr-any-cdmg-any-locked-min3-gte-rare.*`, and `late-spd-min2-cr-min1-cdmg-any-locked-min3-gte-rare.*` cover `autoMinRequiredRolls=false, lockedMinRequiredRolls=3` in late mode with Auto rarity + autoRarityThreshold="rare". The all-wildcards variant (SPD fixed any, CR% any, CDMG% any) is the late-mode counterpart of `locked-min-3-all-wildcards-early`. The SPD min=3 and SPD min=2/CR% min=1 variants add per-stat lower bounds on top of the locked aggregate constraint, confirming that the locked floor interacts correctly with the per-stat schedule in late mode.

- `late-boots-legendary-6star-spd-main-acc-min3-any-two-of-res-hp-def.*` is the late-mode counterpart of `debuffer-boots-acc-3-any-two-of-res-hp-def-no-redundant-4-substat-rows`. Recipe: 6★ ≥ Legendary Boots with SPD main stat, ACC fixed min=3, RES/HP%/DEF% each wildcard (any), minCount=3 of 4, autoMinRequiredRolls=true, earlyKeepMode="late". Confirms that the four-substat late threshold schedule respects the fixed ACC minimum while generating correct late-keep windows for the flexible three-of-four combination.

- `late-spd-min1-cr-min1-cdmg-min1-minreq3-any.*` is the late-mode counterpart of `three-substats-all-min-1-minrequiredrolls-3-early`. Recipe: Any rarity, all three substats non-fixed with min=1 each, minCount=3, minRequiredRolls=3 (not auto, not locked), earlyKeepMode="late". Verifies that a standard `minRequiredRolls=3` aggregate floor (not the locked-target mode) is handled correctly in late mode across all rarity tiers.

Update this document when adding new fixture categories so contributors understand the scenarios we already cover and how to extend them consistently.
