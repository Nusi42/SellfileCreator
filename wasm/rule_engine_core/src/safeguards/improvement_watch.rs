// Improvement-watch corner synthesis for `anticipateImprovements` safeguards that carry
// an improvement-chance threshold.
//
// Detection leaves zero-missing "watch" placeholders on quota-satisfied count-groups.
// Emitted as-is those would over-protect: the merged HSF rules would keep EVERY
// pattern-matching drop regardless of its improvement chance. This module post-processes
// the detection snapshot instead: for each watch placeholder it searches the minimal
// substat-value "corners" a fresh drop must reach so its improvement chance clears the
// rule's per-level threshold, and attaches them as `watch_corners`. Merge-time emission
// (safeguard_build_placeholder_rules) then pins ONE HSF keep rule per corner. Placeholders
// where even maximal values cannot clear the bar are REMOVED — nothing viable exists, so
// fresh drops fall back to normal selling.
use super::{
    // Shared chance machinery (improvement_chance.rs, widened to pub(super) for reuse).
    improvement_chance::{
        build_scenarios, compute_artifact_chance_for_scenarios, prepare_upgrade_rules,
        resolve_roll_range, StateKey, UpgradeScenario, ROLL_MILESTONES,
    },
    // Wire structs and SSOT helpers from mod.rs.
    safeguard_combinations, safeguard_default_group_sample,
    safeguard_is_activation_anticipate_improvements, safeguard_normalize_substat_match,
    safeguard_placeholder_substat_possible, safeguard_slot_substat_filter,
    safeguard_substat_min_count, safeguard_threshold_slot_for_level, safeguard_variant_to_sub,
    safeguard_weight_for_variant, SafeguardWasmCombination, SafeguardWasmGroupSample,
    SafeguardWasmPlaceholderOut, SafeguardWasmRuleIn, SafeguardWasmSnapshotOut,
    SafeguardWatchCornerOut, SafeguardWatchCornerSubstatOut,
};
use crate::safeguards::fast_path_types::{SafeguardWasmArtifactIn, SafeguardWasmSubstatIn};
use crate::{
    SafeguardCollectRowIn, HSF_SUBSTAT_SLOT_COUNT, SAFEGUARD_SUBSTAT_PER_SUBSTAT,
    STAT_VARIANT_ANY, STAT_VARIANT_ROLL_COUNT,
};
use std::collections::BTreeMap;

// ─── constants ───────────────────────────────────────────────────────────────

// Probed upgrade-stage levels: the milestone boundaries a fresh drop can sit at.
const WATCH_LEVELS: [i64; 5] = [0, 4, 8, 12, 16];
// Rank/rarity windows worth watching; drops below these can never be quota material.
const WATCH_RANK_MIN: i64 = 4;
const WATCH_RANK_MAX: i64 = 6;
const WATCH_RARITY_MIN: i64 = 3;
const WATCH_RARITY_MAX: i64 = 6;
// Fallback axes when the rule combination leaves the dimension unconstrained.
const WATCH_DEFAULT_RANKS: [i64; 2] = [5, 6];
const WATCH_DEFAULT_RARITIES: [i64; 2] = [4, 5]; // epic, legendary
// Binary-search iterations for the minimal passing scale factor λ (2^-10 resolution).
const WATCH_LAMBDA_ITERATIONS: u32 = 10;
// Cap on enumerated substat subsets per placeholder — parity with the merge-side
// MAX_COMBINATIONS bound (local const in safeguard_build_placeholder_rules, mod.rs) that
// caps deficit-placeholder substat combination enumeration at C(8,4) = 70. Subsets are
// still RANKED by weight-priority before the cap (rank_and_cap_subsets), so a future
// lower cap automatically keeps the most discriminating subsets.
const WATCH_SUBSET_CAP: usize = 70;

// ─── watch-rule predicate ────────────────────────────────────────────────────

// A rule participates in corner synthesis only when all three hold: improvements
// activation, a configured chance threshold, and a non-empty substat selection
// (without substats there is no value axis to search along).
pub(super) fn safeguard_rule_is_improvement_watch(rule: &SafeguardWasmRuleIn) -> bool {
    safeguard_is_activation_anticipate_improvements(rule.activation.as_deref().unwrap_or(""))
        && rule.improvement_chance_threshold.is_some()
        && rule.substats.as_ref().map_or(false, |subs| !subs.is_empty())
}

// ─── public entry point ──────────────────────────────────────────────────────

// Post-detection pass: attach corner frontiers to every zero-missing placeholder of an
// improvement-watch rule, removing placeholders for which no viable corner exists.
// `rules` MUST be the full input rule list so prepared rule_order indices align with
// detection rule ordinals (ordinal = rule_order + 1).
pub(super) fn attach_watch_corners(
    detection: &mut SafeguardWasmSnapshotOut,
    rules: &[SafeguardWasmRuleIn],
    rows: &[SafeguardCollectRowIn],
) {
    // Ordinal-keyed lookup of watch rules (1-based ordinal = position in the FULL list).
    let watch_rules_by_ordinal: BTreeMap<i64, &SafeguardWasmRuleIn> = rules
        .iter()
        .enumerate()
        .filter(|(_, rule)| safeguard_rule_is_improvement_watch(rule))
        .map(|(idx, rule)| (idx as i64 + 1, rule))
        .collect();
    if watch_rules_by_ordinal.is_empty() {
        return;
    }
    // Prepare the FULL rules list so rule_order aligns with ordinals, then build the same
    // challenger scenarios detection's improvement-chance pass would see for these rows.
    let prepared = prepare_upgrade_rules(rules);
    let (scenarios, _idx_by_id) = build_scenarios(rows, &prepared);
    // Regroup scenario refs by owning rule ordinal for the per-entry probe calls below.
    let mut scenarios_by_ordinal: BTreeMap<i64, Vec<&UpgradeScenario>> = BTreeMap::new();
    for scenario in &scenarios {
        scenarios_by_ordinal
            .entry(scenario.rule_order as i64 + 1)
            .or_default()
            .push(scenario);
    }
    // One scratch memo reused for its allocation across all probes (cleared per probe
    // inside the chance helper — expected gains depend on the probe's substat values).
    let mut memo: BTreeMap<StateKey, f64> = BTreeMap::new();
    for entry in &mut detection.entries {
        // Resolve the entry's rule by ordinal; non-watch rules pass through untouched.
        let Some(ordinal) = entry.rule_ordinal else {
            continue;
        };
        let Some(rule) = watch_rules_by_ordinal.get(&ordinal).copied() else {
            continue;
        };
        let rule_scenarios: &[&UpgradeScenario] = scenarios_by_ordinal
            .get(&ordinal)
            .map(|list| list.as_slice())
            .unwrap_or(&[]);
        // Resolve the per-level threshold slots once per rule (predicate guarantees Some).
        let Some(thresholds) = rule
            .improvement_chance_threshold
            .clone()
            .map(|threshold| threshold.into_slots_clamped())
        else {
            continue;
        };
        let combination = rule.combination.clone().unwrap_or_default();
        // Zero-missing watch placeholders either gain corners or are dropped entirely;
        // deficit (missing > 0) placeholders are never touched.
        entry.placeholders.retain_mut(|placeholder| {
            if placeholder.missing > 0 {
                return true;
            }
            let corners = compute_watch_corners(
                rule,
                &combination,
                placeholder,
                rule_scenarios,
                &thresholds,
                &mut memo,
            );
            if corners.is_empty() {
                // Nothing viable clears the bar → drop the placeholder (sell normally).
                false
            } else {
                placeholder.watch_corners = Some(corners);
                true
            }
        });
    }
}

// ─── axis / pool resolution ──────────────────────────────────────────────────

// Resolve a rank/rarity probe axis: combination values clamped to the watch window,
// falling back to the given defaults when the dimension is unconstrained or fully
// outside the window. Output is sorted + deduped for deterministic corner order.
fn resolve_watch_axis(selection: &[i64], min: i64, max: i64, defaults: &[i64]) -> Vec<i64> {
    let mut axis: Vec<i64> = selection
        .iter()
        .copied()
        .filter(|value| (min..=max).contains(value))
        .collect();
    if axis.is_empty() {
        axis = defaults.to_vec();
    }
    axis.sort_unstable();
    axis.dedup();
    axis
}

// Physically-possible probe substat pool for the group's dimensions: dedupe, drop
// wildcard/roll-count sentinels, exclude the concrete mainstat, and respect the
// slot's legal substat table (sample slots are always concrete → single-slot filter).
fn resolve_watch_substat_pool(source: &[i64], sample: &SafeguardWasmGroupSample) -> Vec<i64> {
    let slot_filter = safeguard_slot_substat_filter(&[sample.slot]);
    let mut pool = Vec::<i64>::new();
    for &variant in source {
        // Mirror normalize_selected_substats: positive, non-sentinel, unique variants only.
        if variant <= 0 || variant == STAT_VARIANT_ANY || variant == STAT_VARIANT_ROLL_COUNT {
            continue;
        }
        if pool.contains(&variant) {
            continue;
        }
        // Shared possibility predicate (SSOT with merge-time placeholder filtering).
        if !safeguard_placeholder_substat_possible(variant, sample.main_stat, slot_filter) {
            continue;
        }
        pool.push(variant);
    }
    pool
}

// ─── corner computation ──────────────────────────────────────────────────────

// Compute the corner frontier for one zero-missing watch placeholder. Empty result means
// no viable corner exists (caller removes the placeholder → fresh drops sell normally).
fn compute_watch_corners(
    rule: &SafeguardWasmRuleIn,
    combination: &SafeguardWasmCombination,
    placeholder: &SafeguardWasmPlaceholderOut,
    scenarios: &[&UpgradeScenario],
    thresholds: &[f64; 4],
    memo: &mut BTreeMap<StateKey, f64>,
) -> Vec<SafeguardWatchCornerOut> {
    // No challenger model means the chance recursion has nothing to select against.
    if scenarios.is_empty() {
        return Vec::new();
    }
    // Group dimensions: prefer the detection-attached sample; legacy zero-missing
    // placeholders without one fall back to the deterministic combination default.
    let sample = placeholder
        .sample
        .clone()
        .unwrap_or_else(|| safeguard_default_group_sample(combination));
    // Rank/rarity probe axes from the rule combination, clamped to the watch windows.
    let ranks = resolve_watch_axis(
        &combination.ranks,
        WATCH_RANK_MIN,
        WATCH_RANK_MAX,
        &WATCH_DEFAULT_RANKS,
    );
    let rarities = resolve_watch_axis(
        &combination.rarities,
        WATCH_RARITY_MIN,
        WATCH_RARITY_MAX,
        &WATCH_DEFAULT_RARITIES,
    );
    // Substat pool: placeholder-scoped variants when present (perSubstat projection),
    // otherwise the rule's full selection — same precedence merge-time emission uses.
    let pool_source: &[i64] = placeholder
        .substat_variants
        .as_deref()
        .filter(|variants| !variants.is_empty())
        .unwrap_or_else(|| rule.substats.as_deref().unwrap_or(&[]));
    let pool = resolve_watch_substat_pool(pool_source, &sample);
    if pool.is_empty() {
        return Vec::new();
    }
    // Subset size from the shared min-count resolver; perSubstat probes singles. A drop
    // holding MORE focus substats than the minimum still matches the M-subset rule and
    // its chance is strictly higher, so probing exactly-M subsets is keep-biased coverage.
    let normalized_match =
        safeguard_normalize_substat_match(rule.substat_match.as_deref().unwrap_or(""));
    let subsets: Vec<Vec<i64>> = if normalized_match == SAFEGUARD_SUBSTAT_PER_SUBSTAT {
        pool.iter().map(|&variant| vec![variant]).collect()
    } else {
        // Clamp to what a single HSF rule can encode (4 substat slots), like merge does.
        let min_count = safeguard_substat_min_count(&normalized_match, pool.len())
            .min(HSF_SUBSTAT_SLOT_COUNT)
            .min(pool.len());
        safeguard_combinations(&pool, min_count)
    };
    // Raw finite rule weights: same map safeguard_weight_for_variant resolves against
    // (missing entries fall back to the canonical default weight of 1.0).
    let weights = rule.substat_weights.clone().unwrap_or_default();
    // Keep only the top-priority subsets so probe cost and export size stay bounded.
    let subsets = rank_and_cap_subsets(subsets, &weights, WATCH_SUBSET_CAP);

    let mut corners = Vec::<SafeguardWatchCornerOut>::new();
    for &rank in &ranks {
        for &rarity in &rarities {
            for &level in &WATCH_LEVELS {
                // Threshold for the drop's upgrade stage (level 16 uses the level-12 slot).
                let threshold = thresholds[safeguard_threshold_slot_for_level(level)];
                for subset in &subsets {
                    probe_subset_corners(
                        subset, &sample, rank, rarity, level, threshold, scenarios, memo,
                        &mut corners,
                    );
                }
            }
        }
    }
    // Dedupe/dominance-prune first, then order the survivors deterministically.
    sort_watch_corners(prune_watch_corners(corners), &weights)
}

// ─── subset / corner bounding ────────────────────────────────────────────────

// Priority of a substat variant set = sum of the rule's weights for its members
// (default weight 1.0 for unweighted variants). Shared by subset ranking and the
// corner truncation tie-break so both bounds prefer the same "important" substats.
fn watch_subset_priority(weights: &BTreeMap<i64, f64>, variants: impl Iterator<Item = i64>) -> f64 {
    variants
        .map(|variant| safeguard_weight_for_variant(weights, variant))
        .sum()
}

// Rank subsets by descending weight-sum priority and keep the top `cap`. The sort is
// stable, so equal-priority subsets keep their enumeration order — which follows the
// rule's stable substat-variant order (pool order → combination order). `cap` is a
// parameter so tests can exercise the bound with small values while production passes
// the WATCH_SUBSET_CAP knob.
fn rank_and_cap_subsets(
    mut subsets: Vec<Vec<i64>>,
    weights: &BTreeMap<i64, f64>,
    cap: usize,
) -> Vec<Vec<i64>> {
    subsets.sort_by(|a, b| {
        let priority_a = watch_subset_priority(weights, a.iter().copied());
        let priority_b = watch_subset_priority(weights, b.iter().copied());
        // Descending priority; non-finite weights cannot occur (deserializer filters them).
        priority_b.partial_cmp(&priority_a).unwrap_or(std::cmp::Ordering::Equal)
    });
    subsets.truncate(cap);
    subsets
}

// Order the final corner list deterministically, most valuable corners first:
//   1. level ascending  — drop-time +0 rules matter most: RSL Helper's
//      level-up-then-reevaluate flow hits the low-level milestones first;
//   2. rank descending  — 6★ drops are the realistic quota material;
//   3. rarity descending — same argument along the rarity axis;
//   4. subset weight-priority descending — highest-weighted substat sets discriminate best.
// The ordering carries no truncation (decision: full-precision watch net); it stays
// valuable regardless — deterministic output keeps downstream
// canonical-key dedupe and export diffs stable across runs.
fn sort_watch_corners(
    mut corners: Vec<SafeguardWatchCornerOut>,
    weights: &BTreeMap<i64, f64>,
) -> Vec<SafeguardWatchCornerOut> {
    corners.sort_by(|a, b| {
        a.level
            .cmp(&b.level)
            .then_with(|| b.rank.cmp(&a.rank))
            .then_with(|| b.rarity.cmp(&a.rarity))
            .then_with(|| {
                // Subset priority derives from the corner's own variant set (SSOT with
                // rank_and_cap_subsets), so no side-channel decoration is needed.
                let priority_a = watch_subset_priority(weights, a.substats.iter().map(|s| s.variant));
                let priority_b = watch_subset_priority(weights, b.substats.iter().map(|s| s.variant));
                priority_b.partial_cmp(&priority_a).unwrap_or(std::cmp::Ordering::Equal)
            })
    });
    corners
}

// Per-variant probe value domain at (rank, level): the floor is a single minimal roll;
// the ceiling assumes a maximal roll at the initial slot plus every milestone ≤ level
// (values stay in the raw stat units SafeguardWasmArtifactIn substats carry).
fn resolve_watch_value_domain(rank: i64, variant: i64, level: i64) -> Option<(f64, f64)> {
    let (roll_min, roll_max) = resolve_roll_range(rank, variant);
    if !(roll_min > 0.0) || !(roll_max > 0.0) {
        // No roll data → the variant cannot be probed meaningfully.
        return None;
    }
    let max_rolls = 1 + ROLL_MILESTONES.iter().filter(|&&m| m <= level).count() as i64;
    Some((roll_min, roll_max * max_rolls as f64))
}

// Probe every profile of one (subset, rank, rarity, level) cell and push passing corners.
#[allow(clippy::too_many_arguments)]
fn probe_subset_corners(
    subset: &[i64],
    sample: &SafeguardWasmGroupSample,
    rank: i64,
    rarity: i64,
    level: i64,
    threshold: f64,
    scenarios: &[&UpgradeScenario],
    memo: &mut BTreeMap<StateKey, f64>,
    corners: &mut Vec<SafeguardWatchCornerOut>,
) {
    // Resolve every variant's (lo, hi) domain; a variant without roll data kills the subset.
    let mut domains = Vec::<(f64, f64)>::with_capacity(subset.len());
    for &variant in subset {
        let Some(domain) = resolve_watch_value_domain(rank, variant, level) else {
            return;
        };
        domains.push(domain);
    }
    // Chance probe: synthetic candidate carrying the group dims + the given substat values.
    // id -1 can never collide with a real challenger id, so self-exclusion stays inert.
    let chance_for = |values: &[f64], memo: &mut BTreeMap<StateKey, f64>| -> f64 {
        let artifact = SafeguardWasmArtifactIn {
            id: Some(-1),
            slot: sample.slot,
            set: sample.set,
            rank,
            rarity,
            level,
            exact_level: Some(level),
            faction: sample.faction,
            main_stat: sample.main_stat,
            equipped_in_collection: false,
            equipped_in_vault: false,
            substats: subset
                .iter()
                .zip(values)
                .map(|(&variant, &value)| SafeguardWasmSubstatIn {
                    variant,
                    // Flat bit derived from the variant exactly like HSF sub encoding.
                    is_flat: safeguard_variant_to_sub(variant).1,
                    value,
                    rolls: None,
                })
                .collect(),
        };
        compute_artifact_chance_for_scenarios(&artifact, scenarios, memo)
    };
    // Gate the whole cell on the all-maximum probe: at λ=1 every profile coincides, so
    // one evaluation decides whether ANY corner can exist here (level 16 included — its
    // deterministic 0/100 chance flows through the same milestones-empty code path).
    let hi_values: Vec<f64> = domains.iter().map(|&(_, hi)| hi).collect();
    if chance_for(&hi_values, memo) < threshold {
        return;
    }
    // Profiles: "balanced" scales every variant together; "lead i" pins variant i at its
    // ceiling and scales the rest — together they trace ≤ d+1 corners of the pass frontier.
    let dims = subset.len();
    for profile in 0..=dims {
        // Value vector at scale factor λ for this profile (profile 0 = balanced).
        let values_at = |lambda: f64| -> Vec<f64> {
            domains
                .iter()
                .enumerate()
                .map(|(idx, &(lo, hi))| {
                    if profile > 0 && idx == profile - 1 {
                        hi
                    } else {
                        lo + lambda * (hi - lo)
                    }
                })
                .collect()
        };
        // Floor short-circuit: when λ=0 already passes, the floor IS the minimal corner.
        let floor = values_at(0.0);
        let best = if chance_for(&floor, memo) >= threshold {
            floor
        } else {
            // Binary-search the minimal passing λ; λ=1 is known-passing from the gate.
            // Track the best PASSING probe so the emitted corner is always a pass.
            let mut lo_lambda = 0.0f64;
            let mut hi_lambda = 1.0f64;
            let mut best = values_at(1.0);
            for _ in 0..WATCH_LAMBDA_ITERATIONS {
                let mid = (lo_lambda + hi_lambda) / 2.0;
                let probe = values_at(mid);
                if chance_for(&probe, memo) >= threshold {
                    hi_lambda = mid;
                    best = probe;
                } else {
                    lo_lambda = mid;
                }
            }
            best
        };
        // Round each floor DOWN to one decimal — keep-biased: the emitted `>=` bar can
        // only sit at or slightly below the probe that actually cleared the threshold.
        corners.push(SafeguardWatchCornerOut {
            rank,
            rarity,
            level,
            substats: subset
                .iter()
                .zip(&best)
                .map(|(&variant, &value)| SafeguardWatchCornerSubstatOut {
                    variant,
                    min_value: (value * 10.0).floor() / 10.0,
                })
                .collect(),
        });
    }
}

// ─── pruning ─────────────────────────────────────────────────────────────────

// Corner A dominates corner B when both target the SAME (rank, rarity, level) cell and
// the same variant set, and every value floor of A is ≤ B's — any piece matching B then
// matches A too, so B is redundant. Rank/rarity/level are exact-match HSF gates in the
// emitted rules, so corners on different cells cover disjoint pieces and never dominate.
fn watch_corner_dominates(a: &SafeguardWatchCornerOut, b: &SafeguardWatchCornerOut) -> bool {
    if a.rank != b.rank || a.rarity != b.rarity || a.level != b.level {
        return false;
    }
    if a.substats.len() != b.substats.len() {
        return false;
    }
    // Match B's floors by variant; a variant missing on A means the sets differ.
    a.substats.iter().all(|sub_a| {
        b.substats
            .iter()
            .find(|sub_b| sub_b.variant == sub_a.variant)
            .map_or(false, |sub_b| sub_a.min_value <= sub_b.min_value)
    })
}

// Drop duplicates and dominated corners; first-seen wins on exact ties.
fn prune_watch_corners(corners: Vec<SafeguardWatchCornerOut>) -> Vec<SafeguardWatchCornerOut> {
    let mut kept = Vec::<SafeguardWatchCornerOut>::new();
    for corner in corners {
        // Skip the incoming corner when an already-kept one dominates it (incl. duplicates).
        if kept.iter().any(|existing| watch_corner_dominates(existing, &corner)) {
            continue;
        }
        // Remove previously-kept corners the incoming one dominates.
        kept.retain(|existing| !watch_corner_dominates(&corner, existing));
        kept.push(corner);
    }
    kept
}

// ─── tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod improvement_watch_tests {
    use super::*;
    use crate::safeguards::{
        ImprovementChanceThresholdIn, SafeguardWasmCountMode, SafeguardWasmEntryOut,
    };
    use crate::{
        TestItemRaw, ARTIFACT_TYPE_BOOTS, SAFEGUARD_ACTIVATION_ANTICIPATE_IMPROVEMENTS,
        SAFEGUARD_REASON_GROUP, STAT_VARIANT_ACC, STAT_VARIANT_CR, STAT_VARIANT_HP_PERCENT,
        STAT_VARIANT_RES, STAT_VARIANT_SPD,
    };

    const TEST_SET: i64 = 10;

    // Row factory: one boots challenger carrying a single SPD substat at the given value.
    fn make_row(id: i64, rank: i64, rarity: i64, level: i64, spd_value: f64) -> SafeguardCollectRowIn {
        SafeguardCollectRowIn {
            item: TestItemRaw {
                slot: ARTIFACT_TYPE_BOOTS,
                set: TEST_SET,
                rank,
                rarity,
                level,
                faction: None,
                main: Some(STAT_VARIANT_HP_PERCENT),
                sub_values: None,
                item_id: Some(id),
                preview_extras: None,
            },
            base_match_defined: false,
            base_match: None,
            artifact: SafeguardWasmArtifactIn {
                id: Some(id),
                slot: ARTIFACT_TYPE_BOOTS,
                set: TEST_SET,
                rank,
                rarity,
                level,
                exact_level: Some(level),
                faction: 0,
                main_stat: STAT_VARIANT_HP_PERCENT,
                equipped_in_collection: false,
                equipped_in_vault: false,
                substats: vec![SafeguardWasmSubstatIn {
                    variant: STAT_VARIANT_SPD,
                    is_flat: false,
                    value: spd_value,
                    rolls: None,
                }],
            },
        }
    }

    // Watch-rule factory: boots + SPD focus, rank 6 / rarity 5 pinned, per-rule counting.
    fn make_watch_rule(threshold: f64) -> SafeguardWasmRuleIn {
        SafeguardWasmRuleIn {
            id: Some("watch-rule".to_string()),
            name: Some("Watch".to_string()),
            combination: Some(SafeguardWasmCombination {
                slots: vec![ARTIFACT_TYPE_BOOTS],
                sets: vec![],
                meta_set_names: vec![],
                ranks: vec![6],
                rarities: vec![5],
                main_stats: vec![],
                factions: vec![],
            }),
            required_count: Some(1),
            activation: Some(SAFEGUARD_ACTIVATION_ANTICIPATE_IMPROVEMENTS.to_string()),
            count_mode: Some(SafeguardWasmCountMode {
                per_rule: true,
                per_set: false,
                per_faction: false,
                per_main_stat: false,
                per_slot: false,
            }),
            ignore_previous_safeguards: None,
            ignore_equipped_in_collection: None,
            ignore_equipped_in_vault: None,
            substats: Some(vec![STAT_VARIANT_SPD]),
            substat_match: Some("1".to_string()),
            substat_weights: None,
            weight_main_stat_by_rank: None,
            improvement_chance_threshold: Some(ImprovementChanceThresholdIn::Array([
                threshold, threshold, threshold, threshold,
            ])),
            tags: None,
        }
    }

    // Snapshot factory: one entry (ordinal 1) holding one zero-missing watch placeholder.
    fn make_snapshot(rule: &SafeguardWasmRuleIn, extra_placeholders: Vec<SafeguardWasmPlaceholderOut>) -> SafeguardWasmSnapshotOut {
        let combination = rule.combination.clone().unwrap_or_default();
        let sample = SafeguardWasmGroupSample {
            slot: ARTIFACT_TYPE_BOOTS,
            set: TEST_SET,
            faction: 0,
            main_stat: STAT_VARIANT_HP_PERCENT,
        };
        let mut placeholders = vec![SafeguardWasmPlaceholderOut {
            combination: combination.clone(),
            missing: 0,
            reason: SAFEGUARD_REASON_GROUP.to_string(),
            substat_variants: Some(vec![STAT_VARIANT_SPD]),
            sample: Some(sample),
            watch_corners: None,
        }];
        placeholders.extend(extra_placeholders);
        SafeguardWasmSnapshotOut {
            scanned_at: 0.0,
            entries: vec![SafeguardWasmEntryOut {
                hash: "watch-hash".to_string(),
                combination,
                rule_id: rule.id.clone(),
                rule_ordinal: Some(1),
                rule_activation: SAFEGUARD_ACTIVATION_ANTICIPATE_IMPROVEMENTS.to_string(),
                count_mode: SafeguardWasmCountMode {
                    per_rule: true,
                    per_set: false,
                    per_faction: false,
                    per_main_stat: false,
                    per_slot: false,
                },
                per_group_required_count: 1,
                groups_tracked: 1,
                required_count: 1,
                current_count: 1,
                projected_count: 1,
                deficit: 0,
                covered_by_existing: true,
                item_keys: vec![],
                artifacts: vec![],
                placeholders,
                candidates: vec![],
            }],
        }
    }

    // Probe helper mirroring the corner probe artifact (SSOT chance recursion re-entry):
    // returns the chance a synthetic drop with the given SPD value has for rule ordinal 1.
    fn probe_chance(rules: &[SafeguardWasmRuleIn], rows: &[SafeguardCollectRowIn], corner: &SafeguardWatchCornerOut, value_bump: f64) -> f64 {
        let prepared = prepare_upgrade_rules(rules);
        let (scenarios, _) = build_scenarios(rows, &prepared);
        let scenario_refs: Vec<&UpgradeScenario> =
            scenarios.iter().filter(|s| s.rule_order == 0).collect();
        let artifact = SafeguardWasmArtifactIn {
            id: Some(-1),
            slot: ARTIFACT_TYPE_BOOTS,
            set: TEST_SET,
            rank: corner.rank,
            rarity: corner.rarity,
            level: corner.level,
            exact_level: Some(corner.level),
            faction: 0,
            main_stat: STAT_VARIANT_HP_PERCENT,
            equipped_in_collection: false,
            equipped_in_vault: false,
            substats: corner
                .substats
                .iter()
                .map(|sub| SafeguardWasmSubstatIn {
                    variant: sub.variant,
                    is_flat: safeguard_variant_to_sub(sub.variant).1,
                    value: sub.min_value + value_bump,
                    rolls: None,
                })
                .collect(),
        };
        let mut memo: BTreeMap<StateKey, f64> = BTreeMap::new();
        compute_artifact_chance_for_scenarios(&artifact, &scenario_refs, &mut memo)
    }

    #[test]
    fn corners_pass_threshold_and_stay_monotone() {
        // One challenger at SPD 20 (clean rounding boundary), threshold 50, required 1:
        // a fresh drop is selected once it beats/ties the challenger. Every emitted corner
        // (probed at its floor plus the 0.1 rounding quantum, so the round-DOWN bias cannot
        // mask a knife-edge fail) must clear the threshold, and raising any substat value
        // must never drop the chance below the bar (monotonicity sanity vs brute force).
        let rules = vec![make_watch_rule(50.0)];
        let rows = vec![make_row(1, 6, 5, 16, 20.0)];
        let mut snapshot = make_snapshot(&rules[0], vec![]);
        attach_watch_corners(&mut snapshot, &rules, &rows);
        let placeholder = snapshot.entries[0]
            .placeholders
            .first()
            .expect("viable watch placeholder must survive");
        let corners = placeholder
            .watch_corners
            .as_ref()
            .expect("surviving watch placeholder must carry corners");
        assert!(!corners.is_empty(), "at least one corner must exist");
        for corner in corners {
            assert_eq!(corner.rank, 6, "combination pins rank 6");
            assert_eq!(corner.rarity, 5, "combination pins rarity 5");
            // Floor + rounding quantum must pass (the pre-rounding probe passed).
            let at_floor = probe_chance(&rules, &rows, corner, 0.1);
            assert!(
                at_floor >= 50.0,
                "corner at level {} must clear the threshold (got {at_floor})",
                corner.level,
            );
            // Brute-force monotonicity: any value increase keeps the corner passing.
            for bump in [1.0, 5.0, 25.0] {
                let bumped = probe_chance(&rules, &rows, corner, bump);
                assert!(
                    bumped >= 50.0,
                    "raising corner values must keep the chance above the bar (level {}, bump {bump}, got {bumped})",
                    corner.level,
                );
            }
        }
        // Level-16 corners are deterministic: the frontier sits exactly at the challenger
        // tie point (SPD 20), so the emitted floor must be 20.0 within search resolution.
        let level16 = corners.iter().find(|c| c.level == 16).expect("level-16 corner expected");
        let floor = level16.substats[0].min_value;
        assert!(
            (20.0..=20.1).contains(&floor),
            "level-16 corner floor must sit at the challenger tie point (got {floor})",
        );
    }

    #[test]
    fn dominated_corners_are_pruned() {
        // Direct pruning semantics: dominance requires the SAME exact-pinned cell
        // (rank/rarity/level) and variant set, with every floor less-than-or-equal.
        let corner = |rank: i64, level: i64, variant: i64, value: f64| SafeguardWatchCornerOut {
            rank,
            rarity: 5,
            level,
            substats: vec![SafeguardWatchCornerSubstatOut { variant, min_value: value }],
        };
        let pruned = prune_watch_corners(vec![
            corner(6, 8, STAT_VARIANT_SPD, 12.0), // dominated by the 10.0 twin below
            corner(6, 8, STAT_VARIANT_SPD, 10.0),
            corner(6, 8, STAT_VARIANT_SPD, 10.0), // exact duplicate → dropped
            corner(5, 8, STAT_VARIANT_SPD, 12.0), // different rank cell → kept
            corner(6, 4, STAT_VARIANT_SPD, 12.0), // different level cell → kept
            corner(6, 8, STAT_VARIANT_ACC, 12.0), // different variant set → kept
        ]);
        assert_eq!(pruned.len(), 4, "one survivor per cell/variant set");
        let spd_at_8: Vec<&SafeguardWatchCornerOut> = pruned
            .iter()
            .filter(|c| c.rank == 6 && c.level == 8 && c.substats[0].variant == STAT_VARIANT_SPD)
            .collect();
        assert_eq!(spd_at_8.len(), 1, "dominated + duplicate corners collapse to one");
        assert_eq!(spd_at_8[0].substats[0].min_value, 10.0, "the lowest floor survives");
        // Multi-substat dominance: all floors must be ≤ — a mixed pair is incomparable.
        let multi = |spd: f64, res: f64| SafeguardWatchCornerOut {
            rank: 6,
            rarity: 5,
            level: 0,
            substats: vec![
                SafeguardWatchCornerSubstatOut { variant: STAT_VARIANT_SPD, min_value: spd },
                SafeguardWatchCornerSubstatOut { variant: STAT_VARIANT_RES, min_value: res },
            ],
        };
        let incomparable = prune_watch_corners(vec![multi(10.0, 20.0), multi(12.0, 18.0)]);
        assert_eq!(incomparable.len(), 2, "mixed floors dominate in neither direction");
        let comparable = prune_watch_corners(vec![multi(10.0, 20.0), multi(12.0, 22.0)]);
        assert_eq!(comparable.len(), 1, "component-wise ≤ prunes the higher corner");
        assert_eq!(comparable[0].substats[0].min_value, 10.0);
    }

    #[test]
    fn subset_cap_keeps_highest_weight_subsets() {
        // Pool of 5 variants, size-2 subsets → C(5,2) = 10 candidates, capped at 8.
        // SPD carries weight 5.0 and CR weight 3.0: seven subsets contain a weighted
        // variant and outrank the three weight-1+1 pairs, so exactly two of those
        // lowest-priority pairs must be the ones dropped (the first survives by
        // stable enumeration order).
        let pool = vec![
            STAT_VARIANT_SPD,
            STAT_VARIANT_CR,
            STAT_VARIANT_ACC,
            STAT_VARIANT_RES,
            STAT_VARIANT_HP_PERCENT,
        ];
        let mut weights = BTreeMap::<i64, f64>::new();
        weights.insert(STAT_VARIANT_SPD, 5.0);
        weights.insert(STAT_VARIANT_CR, 3.0);
        // Explicit small cap (8) — the production WATCH_SUBSET_CAP knob currently sits at
        // merge-parity 70; the parameter keeps the truncation logic under real coverage.
        let subsets = rank_and_cap_subsets(safeguard_combinations(&pool, 2), &weights, 8);
        assert_eq!(subsets.len(), 8, "cap must bound the subset count");
        // Highest-priority subset first: SPD+CR (5.0 + 3.0 = 8.0).
        assert_eq!(subsets[0], vec![STAT_VARIANT_SPD, STAT_VARIANT_CR]);
        // Every SPD subset (priority ≥ 6.0) must survive the cap.
        let spd_count = subsets.iter().filter(|s| s.contains(&STAT_VARIANT_SPD)).count();
        assert_eq!(spd_count, 4, "all subsets holding the heaviest variant survive");
        // All seven weighted subsets survive; only ONE weight-1+1 pair fits the cap —
        // the stable-order first (ACC+RES) — the other two are exactly the dropped ones.
        let unweighted: Vec<&Vec<i64>> = subsets
            .iter()
            .filter(|s| !s.contains(&STAT_VARIANT_SPD) && !s.contains(&STAT_VARIANT_CR))
            .collect();
        assert_eq!(
            unweighted,
            vec![&vec![STAT_VARIANT_ACC, STAT_VARIANT_RES]],
            "the lowest-priority pairs are dropped first; stable order breaks their tie",
        );
        assert_eq!(unweighted[0], subsets.last().expect("cap output is non-empty"), "lowest priority sorts last");
        // Equal-priority subsets keep their stable enumeration order (CR pairs enumerate
        // in pool order: ACC before RES before HP%).
        let cr_pairs: Vec<&Vec<i64>> = subsets
            .iter()
            .filter(|s| s.contains(&STAT_VARIANT_CR) && !s.contains(&STAT_VARIANT_SPD))
            .collect();
        assert_eq!(
            cr_pairs,
            vec![
                &vec![STAT_VARIANT_CR, STAT_VARIANT_ACC],
                &vec![STAT_VARIANT_CR, STAT_VARIANT_RES],
                &vec![STAT_VARIANT_CR, STAT_VARIANT_HP_PERCENT],
            ],
            "ties preserve the stable pool-order enumeration",
        );
    }

    #[test]
    fn corner_sort_orders_low_levels_then_high_rank_and_rarity() {
        // Deterministic output ordering (no truncation — full-precision watch net):
        // level ascending, then rank descending, then rarity descending. 5 levels ×
        // 3 ranks × 4 rarities = 60 corners fed in reverse order must all survive
        // and come back fully re-sorted.
        let mut corners = Vec::<SafeguardWatchCornerOut>::new();
        for &level in &[16i64, 12, 8, 4, 0] {
            for &rank in &[4i64, 5, 6] {
                for &rarity in &[3i64, 4, 5, 6] {
                    corners.push(SafeguardWatchCornerOut {
                        rank,
                        rarity,
                        level,
                        substats: vec![SafeguardWatchCornerSubstatOut {
                            variant: STAT_VARIANT_SPD,
                            min_value: 10.0,
                        }],
                    });
                }
            }
        }
        let weights = BTreeMap::<i64, f64>::new();
        let sorted = sort_watch_corners(corners, &weights);
        assert_eq!(sorted.len(), 60, "sorting must never drop corners");
        // Deterministic head: lowest level first, then highest rank, then highest rarity.
        assert_eq!((sorted[0].level, sorted[0].rank, sorted[0].rarity), (0, 6, 6));
        assert_eq!((sorted[1].level, sorted[1].rank, sorted[1].rarity), (0, 6, 5));
        // Rank descends before rarity within a level block (rank 5 starts after 4 rarities).
        assert_eq!((sorted[4].level, sorted[4].rank, sorted[4].rarity), (0, 5, 6));
        // Level ascends across blocks: the second block (indices 12..) is level 4,
        // and the final block (indices 48..) is the level-16 tail.
        assert_eq!(sorted[12].level, 4);
        assert_eq!(sorted[48].level, 16);
        // Subset-priority tie-break: with equal cells, the heavier variant set sorts first.
        let mut spd_weights = BTreeMap::<i64, f64>::new();
        spd_weights.insert(STAT_VARIANT_SPD, 5.0);
        let cell = |variant: i64| SafeguardWatchCornerOut {
            rank: 6,
            rarity: 6,
            level: 0,
            substats: vec![SafeguardWatchCornerSubstatOut { variant, min_value: 10.0 }],
        };
        let tied = sort_watch_corners(vec![cell(STAT_VARIANT_ACC), cell(STAT_VARIANT_SPD)], &spd_weights);
        assert_eq!(
            tied[0].substats[0].variant, STAT_VARIANT_SPD,
            "equal cells order by descending subset weight priority",
        );
    }

    #[test]
    fn unreachable_threshold_removes_placeholder_but_keeps_deficit_ones() {
        // An overwhelming challenger (SPD 500 projected) makes even all-maximum probes
        // fail the bar → the zero-missing placeholder must be REMOVED (sell normally),
        // while a deficit (missing > 0) placeholder in the same entry stays untouched.
        let rules = vec![make_watch_rule(50.0)];
        let rows = vec![make_row(1, 6, 5, 16, 500.0)];
        let deficit_placeholder = SafeguardWasmPlaceholderOut {
            combination: rules[0].combination.clone().unwrap_or_default(),
            missing: 2,
            reason: SAFEGUARD_REASON_GROUP.to_string(),
            substat_variants: Some(vec![STAT_VARIANT_SPD]),
            sample: None,
            watch_corners: None,
        };
        let mut snapshot = make_snapshot(&rules[0], vec![deficit_placeholder]);
        attach_watch_corners(&mut snapshot, &rules, &rows);
        let placeholders = &snapshot.entries[0].placeholders;
        assert_eq!(placeholders.len(), 1, "only the deficit placeholder may survive");
        assert_eq!(placeholders[0].missing, 2, "deficit placeholders pass through untouched");
        assert!(placeholders[0].watch_corners.is_none(), "deficit placeholders never gain corners");
    }
}
