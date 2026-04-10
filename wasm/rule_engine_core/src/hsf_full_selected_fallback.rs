use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::build_hsf_combo_vectors_core;
use crate::emit_hsf_rules_for_filtered_distributions_compact_core;
use crate::generated_domain_constants::{RARITY_CODE_ANY, SUBSTAT_SLOT_COUNT};
use crate::BuildHsfComboBoundsIn;
use crate::BuildHsfComboVectorsIn;
use crate::EmitHsfMainChoiceIn;
use crate::EmitHsfRulesForFilteredDistributionsCompactIn;
use crate::RuleRaw;

// Payload mirrors the remaining "full-selected fallback" branch in hsfBuilder.ts.
// Keep this input narrow so we only ship the data needed for plan decisions.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfFullSelectedFallbackPlanIn {
    effective_mode: String,
    early_mode: String,
    min_target_count: i64,
    selected_pool_v: Vec<i64>,
    rarity_code: i64,
    num_rolls_for_this_level: i64,
    num_rolls_by_target: i64,
    aggregate_min_value: i64,
    any_min: bool,
    mins: Vec<i64>,
    any_flags: Vec<bool>,
    sum_min: i64,
    impossible_min_max: bool,
    base_by_variant: HashMap<i64, i64>,
}

// Output is an emission spec consumed by the existing compact wasm emitter path.
// TS only checks for null vs object, then forwards this spec as-is.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfFullSelectedFallbackPlanOut {
    full_selection: Vec<i64>,
    dimensions: i64,
    total: i64,
    deficit_floors: Vec<Option<i64>>,
    deficit_max: i64,
    base_vals: Vec<i64>,
}

// Runtime payload lets Rust own the full-selected fallback emission branch.
// TS now passes branch inputs once and receives ready-to-push rule rows.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExecuteHsfFullSelectedFallbackIn {
    pub(crate) effective_mode: String,
    pub(crate) early_mode: String,
    pub(crate) min_target_count: i64,
    pub(crate) selected_pool_v: Vec<i64>,
    pub(crate) rarity_code: i64,
    pub(crate) num_rolls_for_this_level: i64,
    pub(crate) num_rolls_by_target: i64,
    pub(crate) aggregate_min_value: i64,
    pub(crate) base_by_variant: HashMap<i64, i64>,
    pub(crate) substat_roll_bounds_v: HashMap<i64, BuildHsfComboBoundsIn>,
    pub(crate) base_rule: RuleRaw,
    pub(crate) main_choices: Vec<EmitHsfMainChoiceIn>,
    pub(crate) emit_any_main_when_no_choices: bool,
}

// Resolve precomputed base values by variant id; missing entries fail closed to zero.
// Selected vectors are already filtered in TS, so missing keys are unexpected.
fn base_for_variant(base_by_variant: &HashMap<i64, i64>, variant: i64) -> i64 {
    base_by_variant
        .get(&variant)
        .copied()
        .unwrap_or(0)
}

// Keep top-level gating identical to the TS branch this helper replaces.
// If any gate fails, return None so TS skips this fallback emission.
fn should_plan(input: &BuildHsfFullSelectedFallbackPlanIn, full_selection_len: usize) -> bool {
    if input.impossible_min_max {
        return false;
    }
    // Fallback is intentionally "potential + late" only: it generates lenient rules that allow
    // an artifact to be behind the required roll pace as long as it can still catch up by +16.
    // In "early" mode the artifact MUST already be on pace at each milestone — those rules come
    // from the strict combo path instead. Firing the fallback in early mode produces rules with
    // lower thresholds than the strict rules, which then cause the strict rules to be pruned as
    // obsolete (they're superseded), leaving only incorrect lenient rules in the output.
    if input.effective_mode != "potential" || input.early_mode != "late" {
        return false;
    }
    if full_selection_len <= 1 {
        return false;
    }
    input.min_target_count >= full_selection_len as i64
}

// Compute one compact emission plan for the fallback strict-deficit row path.
// This mirrors the old TS logic but keeps condition math in Rust.
fn build_full_selected_fallback_plan_core(
    input: &BuildHsfFullSelectedFallbackPlanIn,
) -> Option<BuildHsfFullSelectedFallbackPlanOut> {
    let full_selection_len = input.selected_pool_v.len().min(SUBSTAT_SLOT_COUNT as usize);
    if !should_plan(input, full_selection_len) {
        return None;
    }

    let full_selection = input
        .selected_pool_v
        .iter()
        .copied()
        .take(full_selection_len)
        .collect::<Vec<i64>>();

    let myth_pre_extra =
        if input.rarity_code == RARITY_CODE_ANY && (input.sum_min >= 5 || input.aggregate_min_value >= 5) {
            1
        } else {
            0
        };
    let avail_full = (input.num_rolls_for_this_level + myth_pre_extra).max(0);
    if !input.any_min || input.sum_min <= avail_full {
        return None;
    }

    let num_target_full = (input.num_rolls_by_target + myth_pre_extra).max(0);
    let deficit_max = (num_target_full - avail_full).max(0);

    let mut deficit_floors: Vec<Option<i64>> = Vec::with_capacity(full_selection_len);
    let mut base_vals: Vec<i64> = Vec::with_capacity(full_selection_len);
    for (idx, variant) in full_selection.iter().copied().enumerate().take(full_selection_len) {
        let min_value = input.mins.get(idx).copied().unwrap_or(0).max(0);
        let is_any = input.any_flags.get(idx).copied().unwrap_or(false);
        deficit_floors.push(if is_any { None } else { Some(min_value) });

        base_vals.push(base_for_variant(&input.base_by_variant, variant));
    }

    Some(BuildHsfFullSelectedFallbackPlanOut {
        full_selection,
        dimensions: full_selection_len as i64,
        total: avail_full,
        deficit_floors,
        deficit_max,
        base_vals,
    })
}

// Execute the full-selected fallback branch end-to-end in Rust.
// This reuses combo-vector and compact-emission cores to avoid duplication.
pub(crate) fn execute_hsf_full_selected_fallback_core(input: &ExecuteHsfFullSelectedFallbackIn) -> Vec<RuleRaw> {
    // Full-selection dims are capped at four HSF substat slots.
    let full_selection_i32 = input
        .selected_pool_v
        .iter()
        .copied()
        .take(4)
        .map(|value| value as i32)
        .collect::<Vec<_>>();
    if full_selection_i32.len() <= 1 {
        return Vec::<RuleRaw>::new();
    }

    // Build combo vectors once so bounds and any-flags stay single-sourced.
    let combo_vectors = build_hsf_combo_vectors_core(&BuildHsfComboVectorsIn {
        combo: full_selection_i32.clone(),
        required_v: full_selection_i32.clone(),
        aggregate_targets_locked: false,
        substat_roll_bounds_v: input.substat_roll_bounds_v.clone(),
        target_entries: vec![None; full_selection_i32.len()],
    });

    // Reuse fallback planner gates with combo-vector-derived aggregates.
    let plan_input = BuildHsfFullSelectedFallbackPlanIn {
        effective_mode: input.effective_mode.clone(),
        early_mode: input.early_mode.clone(),
        min_target_count: input.min_target_count,
        selected_pool_v: input.selected_pool_v.clone(),
        rarity_code: input.rarity_code,
        num_rolls_for_this_level: input.num_rolls_for_this_level,
        num_rolls_by_target: input.num_rolls_by_target,
        aggregate_min_value: input.aggregate_min_value,
        any_min: combo_vectors.any_min,
        mins: combo_vectors.mins.iter().map(|value| *value as i64).collect::<Vec<_>>(),
        any_flags: combo_vectors.any_flags.iter().map(|value| *value != 0).collect::<Vec<_>>(),
        sum_min: combo_vectors.sum_min as i64,
        impossible_min_max: combo_vectors.impossible_min_max,
        base_by_variant: input.base_by_variant.clone(),
    };
    let Some(plan) = build_full_selected_fallback_plan_core(&plan_input) else {
        return Vec::<RuleRaw>::new();
    };

    // Build compact emission payload so sink widening stays in one core helper.
    let width = plan.dimensions.max(0) as usize;
    let compact_payload = EmitHsfRulesForFilteredDistributionsCompactIn {
        dimensions: plan.dimensions as i32,
        total: plan.total as i32,
        base_max_caps: combo_vectors.max_caps.clone(),
        base_timeline_caps: vec![crate::FILTER_OPTION_NONE_I32; width],
        base_targeted_mask: vec![0u8; width],
        min_floors: Vec::<i32>::new(),
        targeted_exact: crate::FILTER_OPTION_NONE_I32,
        deficit_floors: plan
            .deficit_floors
            .iter()
            .map(|value| value.unwrap_or(crate::FILTER_OPTION_NONE_I32 as i64) as i32)
            .collect::<Vec<_>>(),
        deficit_max: plan.deficit_max as i32,
        global_min: 0,
        global_remaining: 0,
        global_mode: 0,
        locked_min: 0,
        locked_remaining: 0,
        locked_mode: 0,
        base_locked_mask: vec![0u8; width],
        emit: crate::EmitHsfRulesForDistributionsIn {
            base_rule: input.base_rule.clone(),
            substats: combo_vectors.substats.clone(),
            distributions: Vec::<Vec<i32>>::new(),
            base_vals: plan.base_vals.iter().map(|value| *value as i32).collect::<Vec<_>>(),
            mins: combo_vectors.mins.clone(),
            max_caps: combo_vectors.max_caps.clone(),
            optional_mask: vec![false; width],
            skip_optional_baseline: false,
            main_choices: input.main_choices.clone(),
            emit_any_main_when_no_choices: input.emit_any_main_when_no_choices,
            target_bases: vec![None; width],
            target_increments: vec![Vec::<Option<i32>>::new(); width],
        },
    };
    emit_hsf_rules_for_filtered_distributions_compact_core(&compact_payload)
}

// JsValue wrapper for full-selected fallback emission execution.
