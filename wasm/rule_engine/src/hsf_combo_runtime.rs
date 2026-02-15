use std::collections::HashMap;

use serde::Deserialize;

use crate::build_hsf_combo_policy_vectors_core;
use crate::build_hsf_combo_vectors_core;
use crate::build_hsf_intro_assignments_for_level_core;
use crate::build_hsf_timeline_caps_core;
use crate::hsf_intro_execution::execute_hsf_intro_plan_core;
use crate::hsf_intro_execution::ExecuteHsfIntroPlanIn;
use crate::hsf_intro_mode_plan::build_intro_mode_plan_core;
use crate::hsf_intro_mode_plan::BuildHsfIntroModePlanIn;
use crate::BuildHsfComboBoundsIn;
use crate::BuildHsfComboPolicyVectorsIn;
use crate::BuildHsfComboTargetEntryIn;
use crate::BuildHsfComboVectorsIn;
use crate::BuildHsfIntroAssignmentsForLevelIn;
use crate::BuildHsfTimelineCapsIn;
use crate::EmitHsfMainChoiceIn;
use crate::EmitHsfRulesForDistributionsIn;
use crate::RuleRaw;
use crate::RARITY_CODE_ANY;

// Per-combo runtime payload replaces the largest remaining TS combo branch.
// It computes vectors/policy/plan/timeline and executes intro steps in Rust.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExecuteHsfComboRuntimeIn {
    pub(crate) combo: Vec<i32>,
    pub(crate) required_v: Vec<i32>,
    pub(crate) aggregate_targets_locked: bool,
    pub(crate) substat_roll_bounds_v: HashMap<String, BuildHsfComboBoundsIn>,
    pub(crate) target_entries: Vec<Option<BuildHsfComboTargetEntryIn>>,
    pub(crate) base_vals: Vec<i32>,
    pub(crate) base_rule: RuleRaw,
    pub(crate) main_choices: Vec<EmitHsfMainChoiceIn>,
    pub(crate) emit_any_main_when_no_choices: bool,
    pub(crate) effective_mode: String,
    pub(crate) early_mode: String,
    pub(crate) min_target_count: i32,
    pub(crate) aggregate_min_value: i32,
    pub(crate) locked_min_active: bool,
    pub(crate) locked_min_value: i32,
    pub(crate) flex_active: bool,
    pub(crate) present: i32,
    pub(crate) base_start_by_branch: i32,
    pub(crate) addition_timeline_all: Vec<i32>,
    pub(crate) level: i32,
    pub(crate) roll_timeline: Vec<i32>,
    pub(crate) baseline: Option<String>,
    pub(crate) effective_start: i32,
    pub(crate) pre_rolls: i32,
    pub(crate) rarity_code: i64,
    pub(crate) num_rolls_for_this_level: i32,
    pub(crate) num_rolls_by_target: i32,
}

// Decode compact mask vectors into bool vectors consumed by policy planner.
fn decode_mask_bool(mask: &[u8]) -> Vec<bool> {
    mask.iter().map(|value| *value != 0).collect::<Vec<_>>()
}

// Convert i32 vectors to i64 for the intro-mode plan payload contract.
fn to_i64_vec(values: &[i32]) -> Vec<i64> {
    values.iter().map(|value| *value as i64).collect::<Vec<_>>()
}

// Core combo execution keeps hot-loop orchestration inside Rust.
pub(crate) fn execute_hsf_combo_runtime_core(input: &ExecuteHsfComboRuntimeIn) -> Vec<RuleRaw> {
    let m = input.combo.len() as i32;
    // Zero-substat combos are still handled by the dedicated presence helper.
    if m <= 0 {
        return Vec::<RuleRaw>::new();
    }

    // Intro assignments depend on level-local additions and required prefixes.
    let intro_assignments = build_hsf_intro_assignments_for_level_core(
        &BuildHsfIntroAssignmentsForLevelIn {
            count: m,
            base_slots: input.base_start_by_branch.min(m),
            required_count: input.required_v.len() as i32,
            addition_timeline_all: input.addition_timeline_all.clone(),
            level: input.level,
        },
    );
    if intro_assignments.is_empty() {
        return Vec::<RuleRaw>::new();
    }

    // Combo vectors normalize bounds/masks/targets once per combo.
    let combo_vectors = build_hsf_combo_vectors_core(&BuildHsfComboVectorsIn {
        combo: input.combo.clone(),
        required_v: input.required_v.clone(),
        aggregate_targets_locked: input.aggregate_targets_locked,
        substat_roll_bounds_v: input.substat_roll_bounds_v.clone(),
        target_entries: input.target_entries.clone(),
    });
    if combo_vectors.impossible_min_max {
        return Vec::<RuleRaw>::new();
    }

    let mins = combo_vectors.mins.clone();
    let max_caps = combo_vectors.max_caps.clone();
    let any_flags = combo_vectors.any_flags.clone();
    let targeted_mask = combo_vectors.targeted_mask.clone();
    let locked_mask = combo_vectors.locked_mask.clone();
    let optional_mask = combo_vectors.optional_mask.clone();
    let optional_mask_bool = optional_mask.iter().map(|value| *value != 0).collect::<Vec<_>>();
    let sum_min = combo_vectors.sum_min;
    let sum_locked_min = combo_vectors.sum_locked_min;

    // Any rarity can grant one synthetic mythical pre-roll when needed.
    let myth_pre_extra = if input.rarity_code == RARITY_CODE_ANY
        && (sum_min >= 5 || input.aggregate_min_value >= 5)
    {
        1
    } else {
        0
    };
    let avail = input.num_rolls_for_this_level.max(0) + myth_pre_extra;
    let num_target = input.num_rolls_by_target.max(0) + myth_pre_extra;
    let remaining = (num_target - avail).max(0);
    let others_count = (input.present - m).max(0);

    // Policy vectors reuse masks/reductions across strict and potential paths.
    let combo_policy = build_hsf_combo_policy_vectors_core(&BuildHsfComboPolicyVectorsIn {
        mins: mins.clone(),
        any_flags: any_flags.clone(),
        targeted_mask: targeted_mask.clone(),
        optional_mask: optional_mask.clone(),
        combo_len: m,
        min_target_count: input.min_target_count,
        aggregate_targets_locked: input.aggregate_targets_locked,
        global_min: input.aggregate_min_value,
        others_count,
        avail,
    });
    let needs_locked_aggregate = input.locked_min_active && sum_locked_min < input.locked_min_value;

    // Intro mode planner returns the ordered execution steps for this combo.
    let intro_plan = build_intro_mode_plan_core(&BuildHsfIntroModePlanIn {
        effective_mode: input.effective_mode.clone(),
        early_mode: input.early_mode.clone(),
        m: m as i64,
        min_target_count: input.min_target_count as i64,
        combo_len: m as i64,
        any_min: combo_vectors.any_min,
        any_wildcard: combo_vectors.any_wildcard,
        global_min: input.aggregate_min_value as i64,
        num_target: num_target as i64,
        avail: avail as i64,
        sum_min: sum_min as i64,
        sum_min_targeted: combo_policy.sum_min_targeted as i64,
        min_non_target_now: combo_policy.min_non_target_now as i64,
        needs_locked_aggregate,
        remaining: remaining as i64,
        targeted_mask: decode_mask_bool(&targeted_mask),
        locked_mask: decode_mask_bool(&locked_mask),
        mins: to_i64_vec(&mins),
        max_caps: to_i64_vec(&max_caps),
        deficit_floors: to_i64_vec(&combo_policy.deficit_floors),
        prefer_virtual_sink: combo_policy.prefer_virtual_sink,
        optional_rows_only_baseline: combo_policy.optional_rows_only_baseline,
        locked_min_active: input.locked_min_active,
        locked_min_value: input.locked_min_value as i64,
    });
    if intro_plan.steps.is_empty() {
        return Vec::<RuleRaw>::new();
    }

    // Timeline caps are still intro-assignment specific, but now rust-owned.
    let timeline_caps_by_intro = build_hsf_timeline_caps_core(&BuildHsfTimelineCapsIn {
        intro_assignments,
        roll_timeline: input.roll_timeline.clone(),
        baseline: input.baseline.clone(),
        effective_start: input.effective_start,
        level: input.level,
        pre_rolls: input.pre_rolls,
        myth_pre_extra,
    });

    // Emit payload template is shared across all intro timeline executions.
    let emit_payload = EmitHsfRulesForDistributionsIn {
        base_rule: input.base_rule.clone(),
        substats: combo_vectors.substats,
        distributions: Vec::<Vec<i32>>::new(),
        base_vals: input.base_vals.clone(),
        mins: mins.clone(),
        max_caps: max_caps.clone(),
        optional_mask: optional_mask_bool,
        skip_optional_baseline: m > input.min_target_count,
        main_choices: input.main_choices.clone(),
        emit_any_main_when_no_choices: input.emit_any_main_when_no_choices,
        target_bases: combo_vectors.target_bases,
        target_increments: combo_vectors.target_increments,
    };

    // Reuse intro execution core to run the planner for every timeline.
    execute_hsf_intro_plan_core(&ExecuteHsfIntroPlanIn {
        m,
        others_count,
        avail,
        remaining,
        sum_min,
        global_min: input.aggregate_min_value,
        num_target,
        locked_min_value: input.locked_min_value,
        locked_min_active: input.locked_min_active,
        min_target_count: input.min_target_count,
        skip_presence_for_flex_supersets: input.flex_active && m > input.min_target_count,
        mins,
        max_caps,
        any_flags,
        targeted_mask,
        locked_mask,
        optional_mask,
        timeline_caps_by_intro,
        plan_steps: intro_plan.steps,
        emit: emit_payload,
    })
}
