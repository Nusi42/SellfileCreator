// HSF build-phase structs and core computation functions.
// These are pure Rust functions with no wasm_bindgen annotations;
// lib.rs re-exports everything via `pub(crate) use hsf_builder_core::*` so
// sibling execution modules continue to access them via `crate::*` unchanged.
use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::generated_domain_constants::*;
use crate::safeguards::safeguard_variant_to_sub;
use crate::{
    auto_rarity_addition_mask_for_code,
    auto_rarity_count_levels_up_to_mask,
    auto_rarity_includes_mythical,
    auto_rarity_roll_mask_for_code,
    deserialize_i64_key_map,
    EmitHsfSubstatIn,
    FILTER_OPTION_NONE_I32,
};

// Input for builder rarity-branch expansion (Late+Auto supplement tiers).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfRarityBranchesIn {
    pub(crate) rarity_mode: Option<String>,
    pub(crate) early_keep_mode: Option<String>,
    pub(crate) auto_rarity_supplements_threshold: Option<String>,
    pub(crate) rarity_code: i64,
}

// Output row describing one branch code and optional restricted levels.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfRarityBranchOut {
    pub(crate) code: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) restrict_levels: Option<Vec<i64>>,
}

// Input payload for branch-level milestone context expansion.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfLevelContextsIn {
    pub(crate) rarity_code: i64,
    pub(crate) baseline: Option<String>,
    pub(crate) effective_start: i64,
    pub(crate) suppress_roll_thresholds: bool,
    pub(crate) level_window_min: i64,
    pub(crate) level_window_max: i64,
    #[serde(default)]
    pub(crate) restrict_levels: Option<Vec<i64>>,
}

// Input payload for branch-level collapse profile derivation.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfBranchCollapseProfileIn {
    pub(crate) rarity_code: i64,
    pub(crate) baseline: Option<String>,
    pub(crate) effective_start: i64,
    pub(crate) aggregate_min_active: bool,
    pub(crate) aggregate_targets_locked: bool,
    pub(crate) aggregate_min_value: i64,
    pub(crate) addition_count: i64,
}

// Output payload carries collapse feasibility and branch roll timeline.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfBranchCollapseProfileOut {
    pub(crate) collapse_global_ok: bool,
    pub(crate) max_rolls_at_target: i64,
    pub(crate) roll_timeline: Vec<i64>,
}

// Output row with all per-level counters consumed by hsfBuilder inner loops.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfLevelContextOut {
    pub(crate) level: i64,
    pub(crate) rolls_up_to_start: i64,
    pub(crate) raw_rolls_for_this_level: i64,
    pub(crate) raw_rolls_by_target: i64,
    pub(crate) num_rolls_for_this_level: i64,
    pub(crate) num_rolls_by_target: i64,
    pub(crate) adds_so_far: i64,
    pub(crate) present: i64,
}

// Input payload for per-level selected-substat combo expansion.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfLevelCombosIn {
    pub(crate) required_v: Vec<i32>,
    pub(crate) optional_pool_v: Vec<i32>,
    pub(crate) flex_active: bool,
    pub(crate) aggregate_min_active: bool,
    pub(crate) num_rolls_for_this_level: i32,
    pub(crate) min_target_count: i32,
    pub(crate) max_target_count: i32,
    pub(crate) present: i32,
}

// Input payload for intro-assignment timeline-cap expansion.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfTimelineCapsIn {
    pub(crate) intro_assignments: Vec<Vec<i32>>,
    pub(crate) roll_timeline: Vec<i32>,
    pub(crate) baseline: Option<String>,
    pub(crate) effective_start: i32,
    pub(crate) level: i32,
    pub(crate) pre_rolls: i32,
    pub(crate) myth_pre_extra: i32,
}

// Input payload for per-level intro-assignment expansion.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfIntroAssignmentsForLevelIn {
    pub(crate) count: i32,
    pub(crate) base_slots: i32,
    pub(crate) required_count: i32,
    pub(crate) addition_timeline_all: Vec<i32>,
    pub(crate) level: i32,
}

// Per-variant roll-bound payload used for combo vector normalization.
// When `not` is true the stat must be absent (HSF Condition "¬"); min/max/any are ignored.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildHsfComboBoundsIn {
    pub(crate) min: Option<f64>,
    pub(crate) max: Option<f64>,
    pub(crate) any: Option<bool>,
    #[serde(default)]
    pub(crate) not: Option<bool>,
}

// Per-variant target override payload aligned to combo index order.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildHsfComboTargetEntryIn {
    pub(crate) base: Option<f64>,
    pub(crate) increments: Option<Vec<Option<f64>>>,
}

// Input payload for combo-invariant vector derivation in hsfBuilder.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfComboVectorsIn {
    pub(crate) combo: Vec<i32>,
    pub(crate) required_v: Vec<i32>,
    pub(crate) aggregate_targets_locked: bool,
    #[serde(deserialize_with = "deserialize_i64_key_map")]
    pub(crate) substat_roll_bounds_v: HashMap<i64, BuildHsfComboBoundsIn>,
    pub(crate) target_entries: Vec<Option<BuildHsfComboTargetEntryIn>>,
}

// Output payload with normalized vectors used across intro assignment loops.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfComboVectorsOut {
    pub(crate) mins: Vec<i32>,
    pub(crate) max_caps: Vec<i32>,
    pub(crate) any_flags: Vec<u8>,
    pub(crate) optional_mask: Vec<u8>,
    pub(crate) locked_mask: Vec<u8>,
    pub(crate) targeted_mask: Vec<u8>,
    pub(crate) substats: Vec<EmitHsfSubstatIn>,
    pub(crate) target_bases: Vec<Option<i32>>,
    pub(crate) target_increments: Vec<Vec<Option<i32>>>,
    pub(crate) sum_min: i32,
    pub(crate) sum_locked_min: i32,
    pub(crate) any_min: bool,
    pub(crate) any_wildcard: bool,
    pub(crate) impossible_min_max: bool,
}

// Input payload for late-mode bounded candidate-row generation.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfLateBoundedRowsIn {
    pub(crate) mode: String,
    pub(crate) mins: Vec<i32>,
    pub(crate) max_caps: Vec<i32>,
    pub(crate) any_flags: Vec<u8>,
    pub(crate) targeted_mask: Vec<u8>,
    pub(crate) locked_mask: Vec<u8>,
    pub(crate) optional_mask: Vec<u8>,
    pub(crate) remaining: i32,
    pub(crate) avail: i32,
    pub(crate) sum_min: i32,
    pub(crate) global_min: i32,
    pub(crate) num_target: i32,
    pub(crate) locked_min_value: i32,
    pub(crate) locked_min_active: bool,
    pub(crate) min_target_count: i32,
}

// Input payload for combo-policy vector derivation used by hsfBuilder branches.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfComboPolicyVectorsIn {
    pub(crate) mins: Vec<i32>,
    pub(crate) any_flags: Vec<u8>,
    pub(crate) targeted_mask: Vec<u8>,
    pub(crate) optional_mask: Vec<u8>,
    pub(crate) combo_len: i32,
    pub(crate) min_target_count: i32,
    pub(crate) aggregate_targets_locked: bool,
    pub(crate) global_min: i32,
    pub(crate) others_count: i32,
    pub(crate) avail: i32,
}

// Output payload keeps aggregate sums and deficit vectors in one wasm result.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfComboPolicyVectorsOut {
    pub(crate) sum_min_targeted: i32,
    pub(crate) min_non_target_now: i32,
    pub(crate) optional_rows_only_baseline: bool,
    pub(crate) deficit_floors: Vec<i32>,
    pub(crate) prefer_virtual_sink: bool,
}

// Output payload carries both base values and collapse eligibility.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfFactoryComboRowsOut {
    pub(crate) base_vals: Vec<i32>,
    pub(crate) factory_eligible: bool,
    pub(crate) substats: Vec<EmitHsfSubstatIn>,
}

// Input payload for builder preflight cap-feasibility and mode toggles.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfPreflightFlagsIn {
    pub(crate) selected_pool_v: Vec<i32>,
    pub(crate) required_v: Vec<i32>,
    pub(crate) optional_pool_v: Vec<i32>,
    pub(crate) max_target_count: i32,
    pub(crate) aggregate_min_active: bool,
    pub(crate) aggregate_min_value: i32,
    pub(crate) aggregate_targets_locked: bool,
    pub(crate) rarity_code: i64,
    pub(crate) rarity_mode: Option<String>,
    #[serde(deserialize_with = "deserialize_i64_key_map")]
    pub(crate) substat_roll_bounds_v: HashMap<i64, BuildHsfComboBoundsIn>,
}

// Output payload keeps preflight decisions in one rust-owned computation.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfPreflightFlagsOut {
    pub(crate) aggregate_feasible_by_caps: bool,
    pub(crate) has_circled: bool,
}

// Expand builder rarity branches exactly like hsfBuilder.ts.

// Shared rarity-branch core keeps Late+Auto supplement expansion single-sourced.
pub(crate) fn build_hsf_rarity_branches_core(
    input: &BuildHsfRarityBranchesIn,
) -> Vec<BuildHsfRarityBranchOut> {
    // Base branch always includes the resolved rarity code.
    let base_code = input.rarity_code;
    let mut branches = vec![BuildHsfRarityBranchOut {
        code: base_code,
        restrict_levels: None,
    }];

    // Late+Auto adds supplemental ≥ rarity tiers on [4, 8, 12].
    if input.rarity_mode.as_deref() == Some("auto") && input.early_keep_mode.as_deref() == Some("late") {
        let threshold = input
            .auto_rarity_supplements_threshold
            .as_deref()
            .unwrap_or("rare");
        let min_code = if threshold == "uncommon" {
            RARITY_CODE_GTE_UNCOMMON
        } else if threshold == "epic" {
            RARITY_CODE_GTE_EPIC
        } else {
            RARITY_CODE_GTE_RARE
        };

        let mut candidates = Vec::<i64>::new();
        if min_code <= RARITY_CODE_GTE_UNCOMMON && base_code < RARITY_CODE_GTE_UNCOMMON {
            candidates.push(RARITY_CODE_GTE_UNCOMMON);
        }
        if min_code <= RARITY_CODE_GTE_RARE && base_code < RARITY_CODE_GTE_RARE {
            candidates.push(RARITY_CODE_GTE_RARE);
        }
        if min_code <= RARITY_CODE_GTE_EPIC && base_code < RARITY_CODE_GTE_EPIC {
            candidates.push(RARITY_CODE_GTE_EPIC);
        }
        if base_code < RARITY_CODE_GTE_LEGENDARY {
            candidates.push(RARITY_CODE_GTE_LEGENDARY);
        }

        for code in candidates {
            if code == base_code {
                continue;
            }
            branches.push(BuildHsfRarityBranchOut {
                code,
                restrict_levels: Some(vec![LEVEL_MILESTONE_4, LEVEL_MILESTONE_8, LEVEL_MILESTONE_12]),
            });
        }
    }
    branches
}

// Build branch-level collapse profile and roll timeline from auto-rarity tables.

// Shared branch-collapse profile core keeps collapse/timeline logic in one place.
pub(crate) fn build_hsf_branch_collapse_profile_core(
    input: &BuildHsfBranchCollapseProfileIn,
) -> BuildHsfBranchCollapseProfileOut {
    // Resolve baseline token once to keep branch math deterministic.
    let baseline = input
        .baseline
        .as_deref()
        .map(|value| value.trim().to_ascii_lowercase())
        .unwrap_or_else(|| "afterstart".to_string());
    // "upToLevel" lowercases to "uptolevel" in TS payloads.
    let baseline_up_to_level = baseline == "uptolevel";
    // Pull the rarity-specific roll schedule and derive milestone timeline.
    let roll_mask = auto_rarity_roll_mask_for_code(input.rarity_code);
    let mut roll_timeline = Vec::<i64>::new();
    if (roll_mask & 1) != 0 {
        roll_timeline.push(LEVEL_MILESTONE_4);
    }
    if (roll_mask & 2) != 0 {
        roll_timeline.push(LEVEL_MILESTONE_8);
    }
    if (roll_mask & 4) != 0 {
        roll_timeline.push(LEVEL_MILESTONE_12);
    }
    if (roll_mask & 8) != 0 {
        roll_timeline.push(LEVEL_MILESTONE_16);
    }
    // Count roll events at +16 and at the configured baseline start.
    let rolls_up_to_16 = auto_rarity_count_levels_up_to_mask(roll_mask, LEVEL_MILESTONE_16);
    let rolls_up_to_start = auto_rarity_count_levels_up_to_mask(roll_mask, input.effective_start);
    // Mythical rarity contributes one pre-roll at level 0.
    let pre_rolls = if auto_rarity_includes_mythical(input.rarity_code) { 1 } else { 0 };
    let pre_rolls_by_start = if input.effective_start <= LEVEL_MILESTONE_0 { pre_rolls } else { 0 };
    // Match TS max-roll-at-target semantics across baseline modes.
    let max_rolls_at_target = if baseline_up_to_level {
        rolls_up_to_16 + pre_rolls
    } else {
        (rolls_up_to_16 - rolls_up_to_start).max(0) + pre_rolls_by_start
    };
    // Base start depends on how many addition milestones exist for this branch.
    let addition_count = input.addition_count.max(0);
    let base_start_by_branch = (4 - addition_count).max(0);
    // Collapse is always allowed when aggregate mins are disabled.
    let collapse_global_ok = if !input.aggregate_min_active {
        true
    } else if input.aggregate_targets_locked {
        false
    } else if addition_count == 0 && input.aggregate_min_value <= base_start_by_branch {
        true
    } else {
        input.aggregate_min_value == max_rolls_at_target
    };
    BuildHsfBranchCollapseProfileOut {
        collapse_global_ok,
        max_rolls_at_target,
        roll_timeline,
    }
}

// Build preflight flags used before branch expansion in hsfBuilder.

// Shared preflight core keeps cap-feasibility + circled-mode logic in one path.
pub(crate) fn build_hsf_preflight_flags_core(
    input: &BuildHsfPreflightFlagsIn,
) -> BuildHsfPreflightFlagsOut {
    // "Circled" means at least one selected stat has an explicit minimum roll.
    let mut has_circled = input.aggregate_min_active;
    if !has_circled {
        for variant in &input.selected_pool_v {
            let min_value = input
                .substat_roll_bounds_v
                .get(&(*variant as i64))
                .and_then(|entry| entry.min)
                .filter(|value| value.is_finite())
                .unwrap_or(0.0);
            if min_value > 0.0 {
                has_circled = true;
                break;
            }
        }
    }

    // Aggregate cap feasibility defaults to true unless explicitly impossible.
    let mut aggregate_feasible_by_caps = true;
    if input.aggregate_min_active && !input.selected_pool_v.is_empty() {
        let target_min = input.aggregate_min_value.max(0);
        // Five-roll caps are reachable only when mythical is in scope.
        let rarity_mode = input
            .rarity_mode
            .as_deref()
            .map(|value| value.trim().to_ascii_lowercase());
        let supports_five = input.rarity_code == RARITY_CODE_MYTHICAL
            || input.rarity_code == RARITY_CODE_LTE_MYTHICAL
            || input.rarity_code == RARITY_CODE_ANY
            || (rarity_mode.as_deref() == Some("auto") && target_min >= 5);
        let default_cap = if supports_five { 5 } else { 4 };
        let cap_for = |variant: i32| -> i32 {
            let max_value = input
                .substat_roll_bounds_v
                .get(&(variant as i64))
                .and_then(|entry| entry.max)
                .filter(|value| value.is_finite())
                .map(|value| value.floor() as i32);
            let raw = max_value.unwrap_or(default_cap);
            raw.clamp(0, default_cap)
        };
        // Required caps always contribute to the aggregate upper bound.
        let mut sum_caps = input.required_v.iter().map(|variant| cap_for(*variant)).sum::<i32>();
        // Optional caps contribute only when aggregate targets include unlocked stats.
        if !input.aggregate_targets_locked {
            let mut optional_caps = input
                .optional_pool_v
                .iter()
                .map(|variant| cap_for(*variant))
                .collect::<Vec<_>>();
            optional_caps.sort_unstable_by(|left, right| right.cmp(left));
            let fixed_count = input.required_v.len() as i32;
            let need_optional = (input.max_target_count - fixed_count).max(0) as usize;
            for idx in 0..need_optional {
                sum_caps += *optional_caps.get(idx).unwrap_or(&0);
            }
        }
        aggregate_feasible_by_caps = sum_caps >= target_min;
    }

    BuildHsfPreflightFlagsOut {
        aggregate_feasible_by_caps,
        has_circled,
    }
}

// Expand per-level branch counters used by hsfBuilder level loops.

// Shared level-context core keeps level roll/presence counters in one place.
pub(crate) fn build_hsf_level_contexts_core(input: &BuildHsfLevelContextsIn) -> Vec<BuildHsfLevelContextOut> {
    // Normalize baseline token to the two supported modes.
    let baseline = input
        .baseline
        .as_deref()
        .map(|value| value.trim().to_ascii_lowercase())
        .unwrap_or_else(|| "afterstart".to_string());
    // "upToLevel" in TS lowercases to "uptolevel".
    let baseline_up_to_level = baseline == "uptolevel";
    // Normalize level window ordering so min/max can arrive in any order.
    let min_level = input.level_window_min.min(input.level_window_max);
    let max_level = input.level_window_min.max(input.level_window_max);

    // Decode rarity schedules once and reuse across all milestone rows.
    // Roll masks for LTE codes already match their upper-bound concretes; addition masks do not —
    // normalize LTE codes so base_start reflects the correct substat count at each milestone.
    let roll_mask = auto_rarity_roll_mask_for_code(input.rarity_code);
    let addition_mask = auto_rarity_addition_mask_for_code(
        crate::auto_rarity_runtime::rarity_for_schedule(input.rarity_code),
    );
    let pre_rolls = if auto_rarity_includes_mythical(input.rarity_code) { 1 } else { 0 };
    // After-start mode subtracts rolls up to the configured start.
    let rolls_up_to_start = auto_rarity_count_levels_up_to_mask(roll_mask, input.effective_start);
    // Target rows always compare against the +16 ceiling.
    let rolls_up_to_16 = auto_rarity_count_levels_up_to_mask(roll_mask, LEVEL_MILESTONE_16);
    // Base present-at-0 is 4 minus total additions for the rarity branch.
    let additions_total = (addition_mask as u32).count_ones() as i64;
    let base_start = (4 - additions_total).max(0);

    // Convert optional restricted-level vector into a set for O(1) filtering.
    let restrict_set = input
        .restrict_levels
        .clone()
        .unwrap_or_default()
        .into_iter()
        .collect::<HashSet<_>>();
    // Empty set means unrestricted branch.
    let has_restrict = !restrict_set.is_empty();

    // Keep the same fixed milestone ordering as hsfBuilder LEVELS.
    let all_levels = [
        LEVEL_MILESTONE_0,
        LEVEL_MILESTONE_4,
        LEVEL_MILESTONE_8,
        LEVEL_MILESTONE_12,
        LEVEL_MILESTONE_16,
    ];
    let mut out = Vec::<BuildHsfLevelContextOut>::new();
    for level in all_levels {
        // Respect optional restricted-level branches first.
        if has_restrict && !restrict_set.contains(&level) {
            continue;
        }
        // Apply the active level window after restriction filtering.
        if level < min_level || level > max_level {
            continue;
        }

        // Count rolls and additions up to this milestone for the branch.
        let rolls_up_to_level = auto_rarity_count_levels_up_to_mask(roll_mask, level);
        let adds_so_far = auto_rarity_count_levels_up_to_mask(addition_mask, level);
        // In after-start mode, only include pre-roll when start is at/before +0.
        let pre_rolls_by_start = if input.effective_start <= LEVEL_MILESTONE_0 { pre_rolls } else { 0 };
        let raw_rolls_for_this_level = if baseline_up_to_level {
            rolls_up_to_level + pre_rolls
        } else {
            (rolls_up_to_level - rolls_up_to_start).max(0) + pre_rolls_by_start
        };
        // Reuse the same baseline mode for the +16 target roll budget.
        let raw_rolls_by_target = if baseline_up_to_level {
            rolls_up_to_16 + pre_rolls
        } else {
            (rolls_up_to_16 - rolls_up_to_start).max(0) + pre_rolls_by_start
        };
        // Roll-threshold suppression zeroes both current and target counters.
        let num_rolls_for_this_level = if input.suppress_roll_thresholds {
            0
        } else {
            raw_rolls_for_this_level
        };
        let num_rolls_by_target = if input.suppress_roll_thresholds {
            0
        } else {
            raw_rolls_by_target
        };
        // Present substat count clamps to the maximum substat slots.
        let present = (base_start + adds_so_far).min(SUBSTAT_SLOT_COUNT);
        out.push(BuildHsfLevelContextOut {
            level,
            rolls_up_to_start,
            raw_rolls_for_this_level,
            raw_rolls_by_target,
            num_rolls_for_this_level,
            num_rolls_by_target,
            adds_so_far,
            present,
        });
    }
    out
}

// Expand selected-substat combos for one level using the same flex/min-count
// gating as hsfBuilder.ts, so TS no longer loops over total-count ranges.

// Shared level-combo core keeps required/optional expansion in one place.
pub(crate) fn build_hsf_level_combos_core(input: &BuildHsfLevelCombosIn) -> Vec<Vec<i32>> {
    // Clamp all count domains to the HSF 0..SUBSTAT_SLOT_COUNT space.
    let present = input.present.clamp(0, SUBSTAT_SLOT_COUNT as i32);
    let min_target_count = input.min_target_count.clamp(0, SUBSTAT_SLOT_COUNT as i32);
    let max_target_count = input.max_target_count.clamp(0, SUBSTAT_SLOT_COUNT as i32);
    let required_count = input.required_v.len() as i32;
    // Flex opens early only once enough rolls exist, with aggregate-min parity.
    let allow_flex_at_level = input.flex_active
        && (input.num_rolls_for_this_level >= 2
            || (input.aggregate_min_active && input.num_rolls_for_this_level > 0));
    // Level-local min/max counts mirror the TS builder flow.
    let level_min_count = present.min(min_target_count);
    let level_max_count = present.min(if allow_flex_at_level {
        max_target_count
    } else {
        min_target_count
    });
    // Impossible windows produce no combos for this level.
    if level_max_count < required_count {
        return Vec::<Vec<i32>>::new();
    }
    // Flex mode has no required_count gate, so guard separately: when fewer substats
    // are present than the minimum count requires, every generated combo would be
    // under-qualified (e.g. empty or single-substat combos for a minCount=2 recipe).
    // Non-flex is already covered by the required_count guard above.
    if input.flex_active && min_target_count > 0 && present < min_target_count {
        return Vec::<Vec<i32>>::new();
    }

    // Expand one total-count bucket by combining required + optional picks.
    let combos_for_total = |total_count: i32| -> Vec<Vec<i32>> {
        // Guard impossible totals before any combination work.
        if total_count < required_count {
            return Vec::<Vec<i32>>::new();
        }
        // Required-only branch keeps the current ordered locked prefix.
        let need_optional = total_count - required_count;
        if need_optional <= 0 {
            return vec![input.required_v.clone()];
        }
        // Optional pick size beyond pool length has no feasible rows.
        if need_optional as usize > input.optional_pool_v.len() {
            return Vec::<Vec<i32>>::new();
        }
        // Enumerate deterministic optional combos and prepend required slots.
        let optional_combos = crate::hsf_distribution_runtime::compute_combinations_i32(
            &input.optional_pool_v,
            need_optional,
        );
        optional_combos
            .into_iter()
            .map(|optional| {
                let mut merged = input.required_v.clone();
                merged.extend(optional);
                merged
            })
            .collect::<Vec<_>>()
    };

    // Flex mode can emit multiple total-count buckets per level.
    if input.flex_active {
        let mut combos = Vec::<Vec<i32>>::new();
        let mut total = level_min_count;
        while total <= level_max_count {
            if total >= required_count {
                combos.extend(combos_for_total(total));
            }
            total += 1;
        }
        return combos;
    }
    // Non-flex mode emits exactly one total bucket at level-min count.
    if level_min_count < required_count {
        return Vec::<Vec<i32>>::new();
    }
    combos_for_total(level_min_count)
}

// Expand per-intro timeline caps for one (combo, level) pair.

// Shared timeline-cap core keeps intro roll counting in one Rust implementation.
pub(crate) fn build_hsf_timeline_caps_core(input: &BuildHsfTimelineCapsIn) -> Vec<Vec<i32>> {
    // Normalize baseline token once before assignment iteration.
    let baseline = input
        .baseline
        .as_deref()
        .map(|value| value.trim().to_ascii_lowercase())
        .unwrap_or_else(|| "afterstart".to_string());
    // "upToLevel" lowercases to "uptolevel" in the TS payload path.
    let baseline_up_to_level = baseline == "uptolevel";
    // Clamp optional extras to non-negative integers for deterministic math.
    let pre_rolls = input.pre_rolls.max(0);
    let myth_pre_extra = input.myth_pre_extra.max(0);
    let mut out = Vec::<Vec<i32>>::with_capacity(input.intro_assignments.len());
    for intro_levels in &input.intro_assignments {
        let mut caps = Vec::<i32>::with_capacity(intro_levels.len());
        for intro in intro_levels {
            // Count roll events between the intro threshold and current level.
            let mut rolls = 0i32;
            for event_level in &input.roll_timeline {
                if baseline_up_to_level {
                    if *event_level >= *intro && *event_level <= input.level {
                        rolls += 1;
                    }
                } else {
                    let earliest = input.effective_start.max(*intro);
                    if *event_level > earliest && *event_level <= input.level {
                        rolls += 1;
                    }
                }
            }
            // Pre-roll contributes only when the substat can exist at +0.
            let include_pre = if baseline_up_to_level {
                if *intro <= 0 { pre_rolls } else { 0 }
            } else if *intro <= 0 && input.effective_start <= 0 {
                pre_rolls
            } else {
                0
            };
            // Any→Myth synthetic pre-roll follows the same intro<=0 gate.
            let extra_myth = if *intro <= 0 { myth_pre_extra } else { 0 };
            caps.push(rolls + include_pre + extra_myth);
        }
        out.push(caps);
    }
    out
}

// Build intro assignments for one (combo, level) pair from branch timeline input.

// Shared intro-assignment core keeps ordering and filtering single-sourced.
pub(crate) fn build_hsf_intro_assignments_for_level_core(
    input: &BuildHsfIntroAssignmentsForLevelIn,
) -> Vec<Vec<i32>> {
    // Clamp requested dimensions into non-negative integer domains.
    let count = input.count.max(0);
    let base_slots = input.base_slots.max(0);
    // Required stats are forced into earliest base slots, capped by count.
    let forced_count = input.required_count.max(0).min(count);
    let forced_base = (0..forced_count).collect::<Vec<i32>>();
    // Keep only addition milestones that are active at the requested level.
    let mut addition_available = input
        .addition_timeline_all
        .iter()
        .copied()
        .filter(|milestone| *milestone <= input.level)
        .collect::<Vec<_>>();
    addition_available.sort_unstable();
    // Reuse shared intro-assignment combinatorics so ordering stays SSOT.
    crate::hsf_distribution_runtime::compute_intro_assignments_for_combo(
        count,
        base_slots,
        &addition_available,
        &forced_base,
    )
}

// Build combo-invariant vectors (bounds/masks/substats/targets) once per combo.

// Shared combo-vector core keeps bound/mask/target normalization in one place.
pub(crate) fn build_hsf_combo_vectors_core(input: &BuildHsfComboVectorsIn) -> BuildHsfComboVectorsOut {
    // Required variants define both locked and optional membership.
    let required_set = input.required_v.iter().copied().collect::<HashSet<_>>();
    let mut mins = Vec::<i32>::with_capacity(input.combo.len());
    let mut max_caps = Vec::<i32>::with_capacity(input.combo.len());
    let mut any_flags = Vec::<u8>::with_capacity(input.combo.len());
    let mut optional_mask = Vec::<u8>::with_capacity(input.combo.len());
    let mut locked_mask = Vec::<u8>::with_capacity(input.combo.len());
    let mut targeted_mask = Vec::<u8>::with_capacity(input.combo.len());
    let mut substats = Vec::<EmitHsfSubstatIn>::with_capacity(input.combo.len());
    let mut target_bases = Vec::<Option<i32>>::with_capacity(input.combo.len());
    let mut target_increments = Vec::<Vec<Option<i32>>>::with_capacity(input.combo.len());
    let mut sum_min = 0i32;
    let mut sum_locked_min = 0i32;
    let mut any_min = false;
    let mut any_wildcard = false;
    let mut impossible_min_max = false;

    for (idx, variant) in input.combo.iter().enumerate() {
        let bounds = input.substat_roll_bounds_v.get(&(*variant as i64));
        let any_flag = bounds.and_then(|entry| entry.any).unwrap_or(false);
        // Clamp per-substat minimum to the supported 0..5 roll domain.
        let min_value = bounds
            .and_then(|entry| entry.min)
            .filter(|value| value.is_finite())
            .map(|value| value.floor() as i32)
            .unwrap_or(0)
            .clamp(0, SUBSTAT_MAX_ROLLS_PER_SLOT as i32);
        // Cap per-substat max at SUBSTAT_SLOT_COUNT; absent values remain sentinel -1.
        let max_cap = bounds
            .and_then(|entry| entry.max)
            .filter(|value| value.is_finite())
            .map(|value| value.floor() as i32)
            .map(|value| value.clamp(0, SUBSTAT_SLOT_COUNT as i32))
            .unwrap_or(FILTER_OPTION_NONE_I32);
        // Preserve impossible min>max combinations so TS can short-circuit rows.
        if max_cap > FILTER_OPTION_NONE_I32 && min_value > max_cap {
            impossible_min_max = true;
        }
        let is_locked = required_set.contains(variant);
        let is_optional = !is_locked;
        let is_targeted = !input.aggregate_targets_locked || is_locked;
        // Convert variant ids to HSF substat tuple form in Rust SSOT.
        let (sub_id, sub_is_flat) = safeguard_variant_to_sub(*variant as i64);

        mins.push(min_value);
        max_caps.push(max_cap);
        any_flags.push(if any_flag { 1 } else { 0 });
        optional_mask.push(if is_optional { 1 } else { 0 });
        locked_mask.push(if is_locked { 1 } else { 0 });
        targeted_mask.push(if is_targeted { 1 } else { 0 });
        substats.push(EmitHsfSubstatIn {
            id: sub_id,
            is_flat: sub_is_flat,
        });
        // Normalize target overrides to integer payloads consumed by emit helpers.
        let target_entry = input.target_entries.get(idx).and_then(|entry| entry.as_ref());
        let target_base = target_entry
            .and_then(|entry| entry.base)
            .filter(|value| value.is_finite())
            .map(|value| value.floor() as i32);
        let target_increments_vec = target_entry
            .and_then(|entry| entry.increments.clone())
            .unwrap_or_default()
            .into_iter()
            .map(|value| {
                value
                    .filter(|inner| inner.is_finite())
                    .map(|inner| inner.floor() as i32)
            })
            .collect::<Vec<_>>();
        target_bases.push(target_base);
        target_increments.push(target_increments_vec);

        sum_min += min_value;
        if is_locked {
            sum_locked_min += min_value;
        }
        if min_value > 0 {
            any_min = true;
        }
        if any_flag {
            any_wildcard = true;
        }
    }

    BuildHsfComboVectorsOut {
        mins,
        max_caps,
        any_flags,
        optional_mask,
        locked_mask,
        targeted_mask,
        substats,
        target_bases,
        target_increments,
        sum_min,
        sum_locked_min,
        any_min,
        any_wildcard,
        impossible_min_max,
    }
}

// Build combo-policy vectors once so TS no longer loops masks/reductions per intro.

// Shared combo-policy core keeps aggregate/deficit reductions single-sourced.
pub(crate) fn build_hsf_combo_policy_vectors_core(
    input: &BuildHsfComboPolicyVectorsIn,
) -> BuildHsfComboPolicyVectorsOut {
    let len = input.mins.len();
    // Optional-row baseline suppression mirrors hsfBuilder optional-min logic.
    let has_optional = (0..len).any(|idx| *input.optional_mask.get(idx).unwrap_or(&0) != 0);
    let optional_rows_only_baseline = input.combo_len > input.min_target_count
        && has_optional
        && (0..len).all(|idx| {
            let is_optional = *input.optional_mask.get(idx).unwrap_or(&0) != 0;
            if !is_optional {
                return true;
            }
            *input.mins.get(idx).unwrap_or(&0) == 0
        });

    // Aggregate sums and deficit floors are reused across strict/potential paths.
    let mut sum_min_targeted = 0i32;
    let mut min_non_target_now = 0i32;
    let mut deficit_floors = Vec::<i32>::with_capacity(len);
    for idx in 0..len {
        let min_value = *input.mins.get(idx).unwrap_or(&0);
        let is_targeted = *input.targeted_mask.get(idx).unwrap_or(&0) != 0;
        if is_targeted {
            sum_min_targeted += min_value;
        } else {
            min_non_target_now += min_value;
        }
        let any_flag = *input.any_flags.get(idx).unwrap_or(&0) != 0;
        if any_flag {
            deficit_floors.push(FILTER_OPTION_NONE_I32);
        } else {
            deficit_floors.push(min_value);
        }
    }

    // Virtual sink is only needed for locked-only aggregate rows with no extras.
    let prefer_virtual_sink = if !input.aggregate_targets_locked
        || input.global_min <= 0
        || input.others_count != 0
        || input.avail <= 0
    {
        false
    } else {
        let mut has_targeted = false;
        let mut has_non_targeted = false;
        let mut blocked = false;
        for idx in 0..len {
            if *input.targeted_mask.get(idx).unwrap_or(&0) != 0 {
                has_targeted = true;
                continue;
            }
            has_non_targeted = true;
            if *input.mins.get(idx).unwrap_or(&0) != 0 {
                blocked = true;
                break;
            }
        }
        !blocked && has_targeted && has_non_targeted
    };

    BuildHsfComboPolicyVectorsOut {
        sum_min_targeted,
        min_non_target_now,
        optional_rows_only_baseline,
        deficit_floors,
        prefer_virtual_sink,
    }
}

// Build base-value vectors and factory-collapse eligibility per combo in Rust.

// Shared factory-combo core keeps base-value and collapse gates single-sourced.

// Borrowed-argument factory helper avoids map cloning in branch runtime loops.
pub(crate) fn build_hsf_factory_combo_rows_from_parts(
    combo: &[i32],
    current_base_by_variant: &HashMap<i64, i32>,
    factory_base_by_variant: &HashMap<i64, Option<i32>>,
    target_base_override_by_variant: &HashMap<i64, Option<i32>>,
    substat_roll_bounds_v: &HashMap<i64, BuildHsfComboBoundsIn>,
) -> BuildHsfFactoryComboRowsOut {
    // Preserve combo index order so callers can align emitted substats exactly.
    let mut base_vals = Vec::<i32>::with_capacity(combo.len());
    // Convert variants into HSF substat rows once for all collapse emissions.
    let mut substats = Vec::<EmitHsfSubstatIn>::with_capacity(combo.len());
    // Collapse remains true until any per-variant gate fails.
    let mut factory_eligible = true;
    for variant in combo {
        let variant_id = *variant as i64;
        // Keep variant->substat conversion single-sourced in Rust.
        let (sub_id, sub_is_flat) = safeguard_variant_to_sub(variant_id);
        substats.push(EmitHsfSubstatIn {
            id: sub_id,
            is_flat: sub_is_flat,
        });
        // Current base uses the precomputed star bucket map with 0 fallback.
        let current_base = *current_base_by_variant.get(&variant_id).unwrap_or(&0);
        base_vals.push(current_base);
        // Skip expensive checks after first failure but keep base values aligned.
        if !factory_eligible {
            continue;
        }
        let bounds = substat_roll_bounds_v.get(&variant_id);
        // "Not" bounds disqualify factory collapse — the stat must be absent.
        if bounds.and_then(|b| b.not).unwrap_or(false) {
            factory_eligible = false;
            continue;
        }
        // Non-zero minimum bounds always disqualify factory collapse.
        let min_bound = bounds
            .and_then(|entry| entry.min)
            .filter(|value| value.is_finite())
            .map(|value| value.floor() as i32)
            .unwrap_or(0)
            .clamp(0, SUBSTAT_MAX_ROLLS_PER_SLOT as i32);
        if min_bound > 0 {
            factory_eligible = false;
            continue;
        }
        // Any finite max bound disqualifies factory collapse too.
        let has_finite_max = bounds
            .and_then(|entry| entry.max)
            .filter(|value| value.is_finite())
            .is_some();
        if has_finite_max {
            factory_eligible = false;
            continue;
        }
        // Factory base must exist for this star/variant pair.
        let factory_base = factory_base_by_variant
            .get(&variant_id)
            .copied()
            .flatten();
        let Some(factory_base_value) = factory_base else {
            factory_eligible = false;
            continue;
        };
        // Current targets must match shipped factory minima exactly.
        if current_base != factory_base_value {
            factory_eligible = false;
            continue;
        }
        // Per-stat target overrides can only keep collapse when equal to factory.
        let target_override_base = target_base_override_by_variant
            .get(&variant_id)
            .copied()
            .flatten();
        if let Some(target_base) = target_override_base {
            if target_base != factory_base_value {
                factory_eligible = false;
                continue;
            }
        }
    }
    BuildHsfFactoryComboRowsOut {
        base_vals,
        factory_eligible,
        substats,
    }
}
