# HSF Roll-Collapse Discussion Notes

This summarizes the multi-turn analysis about whether the builder can collapse certain `buildHsfRules` outputs (specifically the 4-substat partitions for configs like SPD/CR%/CDMG% with optional DEF%) into a single rule. The goal is to brief future agents so they can continue the work without rehashing the investigation.

## Scenario Recap
- Input config: 6★ legendary chestplate, `minLevel=0`, `maxLevel=16`, `minRequiredRolls=4`, flex enabled (`autoSubstatFlex: true`), locked substats = SPD/CR%/CDMG%, optional DEF%, roll bounds all `any`, rarity `Auto`.
- Builder output today: hundreds of HSF rules. At +16 we emit 35 rows: 15 covering 3 substats + wildcard; 20 covering the full quartet of SPD/CR%/CDMG%/DEF% with every integer partition of the four required rolls.
- Proposed optimization: detect when all “full quartet” permutations exist (and minima match factory defaults) and replace them with a single minima row `SPD ≥ 5`, `CR% ≥ 5`, `CDMG% ≥ 5`, `DEF% ≥ 5`.

## Key Findings
- The “extra” rows are how we encode the aggregate roll requirement. Each row represents one distribution of the four required rolls. RSL Helper has no “sum of rolls” field, so we simulate it with per-stat thresholds.
- Collapsing to a single minima row is only behaviorally equivalent when: (1) minima equal the factory defaults, (2) there are no per-stat min/max overrides, (3) no custom roll targets are configured, (4) aggregate min applies to `selected`, (5) flex is either disabled or the collapsed branch is not contributing to progress tracking, (6) rarity branch has no additional levels, and (7) optional stats are allowed to soak rolls without violating any of the above. Missing any check risks dropping valid rules or keeping under-rolled items. We still require the full 0–16 window to collapse *across* levels (emit `LVLForCheck = 99`), but the per-level partition collapse now applies even when the consumer trims the window (e.g., `minLevel = 4`)—the builder simply emits one minima row per milestone instead of promoting it to “Any level.”
- The builder’s `collapseAllSubstatsCombo` heuristic guards the simplest safe case: no flex, no aggregate min, exactly four substats, factory minima, no per-stat bounds. When those checks pass we reuse the detected combo regardless of the level window; otherwise we fall back to enumerating partitions. The full-window check remains only as the gate for the “Any level” promotion.

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

Implementation status: `buildHsfRules` evaluates `collapseAllSubstatsCombo` before enumerating roll distributions. The helper returns `{ combo, sentinelEligible }`, where `combo` is the canonical four-substat set and `sentinelEligible` records whether the level window spans the full 0–16 range. When the rarity branch has no addition levels (≥ Legendary / Mythical), we emit a single minima row for the combo:
- If `sentinelEligible` is true, the row uses `LVLForCheck = LEVEL_ANY_SENTINEL`, preserving the old “one rule for all levels” collapse.
- Otherwise we keep emitting milestone-specific rows inside the selected window, but each level reuses the minima rule instead of enumerating partitions. This covers cases like `minLevel = 4` while still honoring the user’s window.

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
