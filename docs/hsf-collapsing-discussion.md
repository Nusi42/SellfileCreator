# HSF Roll-Collapse Discussion Notes

This summarizes the multi-turn analysis about whether the builder can collapse certain `buildHsfRules` outputs (specifically the 4-substat partitions for configs like SPD/CR%/CDMG% with optional DEF%) into a single rule. The goal is to brief future agents so they can continue the work without rehashing the investigation.

## Scenario Recap
- Input config: 6★ legendary chestplate, `minLevel=0`, `maxLevel=16`, `minRequiredRolls=4`, flex enabled (`autoSubstatFlex: true`), locked substats = SPD/CR%/CDMG%, optional DEF%, roll bounds all `any`, rarity `Auto`.
- Builder output today: hundreds of HSF rules. At +16 we emit 35 rows: 15 covering 3 substats + wildcard; 20 covering the full quartet of SPD/CR%/CDMG%/DEF% with every integer partition of the four required rolls.
- Proposed optimization: detect when all “full quartet” permutations exist (and minima match factory defaults) and replace them with a single minima row `SPD ≥ 5`, `CR% ≥ 5`, `CDMG% ≥ 5`, `DEF% ≥ 5`.

## Key Findings
- The “extra” rows are how we encode the aggregate roll requirement. Each row represents one distribution of the four required rolls. RSL Helper has no “sum of rolls” field, so we simulate it with per-stat thresholds.
- Collapsing to a single minima row is only behaviorally equivalent when: (1) minima equal the factory defaults, (2) there are no per-stat min/max overrides, (3) no custom roll targets are configured, (4) aggregate min applies to `selected`, (5) flex is either disabled or the collapsed branch is not contributing to progress tracking, (6) rarity branch has no additional levels, and (7) optional stats are allowed to soak rolls without violating any of the above. Missing any check risks dropping valid rules or keeping under-rolled items. We still require the full 0–16 window to collapse *across* levels (emit `LVLForCheck = 99`), but the per-level partition collapse now applies even when the consumer trims the window (e.g., `minLevel = 4`)—the builder simply emits one minima row per milestone instead of promoting it to “Any level.”
- The builder’s `collapseAllSubstatsCombo` heuristic guards this safe envelope: no flex, aggregate targeting `selected`, baseline rarity with no addition levels, and factory minima with no per-stat bounds. When those checks pass we now reuse **every** four-substat combination that satisfies the criteria (e.g., 4-of-5 selections yield five collapsed rows). Otherwise we fall back to enumerating partitions. The full-window check remains only as the gate for the “Any level” promotion.

## Confusions Cleared
- **“Legendary at +16 can’t have only three rolls total.”** True, but the problematic case is “three rolls on locked stats, one on the optional stat.” Without the partition rows, we would still keep that item even though only three rolls landed on the locked trio, violating `minRequiredRolls: 4`.
- **“Every partition forces a stat above baseline.”** Yes—by design. Those thresholds are how we rule out under-rolled gear (e.g., SPD 10 / CR% 5 / CDMG% 5 / DEF% 15 with aggregate scope limited to locked stats).
- **“Collapsing only the 4-substat rows should be fine.”** It’s fine only if no other constraint (roll bounds, custom minima/targets, aggregate scope `locked`, mythical pre-rolls, partial windows, etc.) relies on those explicit combinations.

## Regression Hotspots
- `substatRollBoundsV`: per-stat min/max transforms the set of valid partitions. Dropping rows can let illegal distributions slip through.
- `substatRollTargetsV` and non-factory minima: collapsing to defaults throws away custom thresholds.
- Aggregate scope `locked` vs `selected`: controls whether optional stats can count toward `minRequiredRolls`; collapsing rows can change behavior.
- Alternate rarity branches (`≥ Rare`, `≥ Epic`, `Mythical` pre-roll): the partition count varies with available rolls; shortcuts must stay aligned with roll timelines.
- Partial level windows (e.g., `minLevel=12`, `maxLevel=16`): builder relies on partition rows to keep milestone semantics intact.

Implementation status: the collapse guard now lives inside the per-level combo loop. For each combination we check the factory-minima envelope (no per-stat bounds, targets, or flex), ensure the branch has no supplemental rarity restrictions, and only collapse when the combo size matches the number of substats physically present at that milestone. If the entire 0–16 window is active and the branch never gains new substats (Legendary/Mythical windows), we emit the collapsed row once with `LVLForCheck = LEVEL_ANY_SENTINEL`; otherwise we reuse the minima row for each eligible milestone individually.
- Parallel path: explicit Epic configs that require exactly three substats and still use factory minima now share the same minima shortcut for the pre-+16 milestones. Levels 0/4/8/12 reuse the minima rows, while +16 still goes through the full partition path so the newly added fourth substat is validated explicitly. The heuristic mirrors the quad checks (no flex, aggregate target `selected`, no per-stat overrides) and only triggers when any global `minRequiredRolls` matches the Epic roll budget of three.

## Safe-Optimization Checklist (if we pursue it)
1. Full window 0–16 (only needed to collapse across levels; per-level collapse now supports partial windows).
2. Flex disabled *or* proven irrelevant to the branch being collapsed.
3. Global min applies to `selected` and equals the total rolls per rarity branch.
4. `substatRollBoundsV` absent or identical to factory defaults (no per-stat min/max overrides).
5. `substatRollTargetsV` absent and builder minima match `FACTORY_MINIMA_BY_STAR`.
6. Rarity branch emits exactly the base branch (no supplemental `≥` tiers).
7. Optional stats do not need to appear in the collapsed rule (if they do, ensure they don’t participate in the aggregate target).

Only when every condition is satisfied can we replace the enumerated rows with a single minima rule without altering behavior.

## Next Steps (if someone picks this up)
- Build a detector that evaluates the checklist above and emits a single rule only when it returns true. Otherwise fall back to today’s enumeration.
- Add unit tests covering: vanilla legendary collapse, custom minima, per-stat bounds, aggregate `locked`, partial windows, Mythical pre-roll, and flex-on scenarios to ensure the optimization never changes behavior outside the safe envelope.
