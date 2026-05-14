use std::collections::{BTreeMap, HashSet};

use serde::Deserialize;


use crate::build_hsf_branch_collapse_profile_core;
use crate::build_hsf_factory_combo_rows_from_parts;
use crate::build_hsf_level_combos_core;
use crate::build_hsf_level_contexts_core;
use crate::hsf_combo_runtime::ExecuteHsfComboRuntimeIn;
use crate::hsf_full_selected_fallback::execute_hsf_full_selected_fallback_core;
use crate::hsf_full_selected_fallback::ExecuteHsfFullSelectedFallbackIn;
use crate::hsf_level_combo_execution::execute_hsf_level_combo_core;
use crate::hsf_level_combo_execution::ExecuteHsfLevelComboIn;
use crate::hsf_level_combo_execution::HsfComboCollapseProfileIn;
use crate::BuildHsfBranchCollapseProfileIn;
use crate::BuildHsfComboBoundsIn;
use crate::BuildHsfComboTargetEntryIn;
use crate::BuildHsfLevelCombosIn;
use crate::BuildHsfLevelContextsIn;
use crate::EmitHsfMainChoiceIn;
use crate::RuleRaw;
use crate::LEVEL_MILESTONE_0;
use crate::LEVEL_MILESTONE_16;
use crate::LEVEL_MILESTONE_4;
use crate::LEVEL_MILESTONE_8;
use crate::LEVEL_MILESTONE_12;
use crate::RARITY_CODE_ANY;
use crate::RARITY_CODE_EPIC;
use crate::RARITY_CODE_GTE_LEGENDARY;
use crate::RARITY_CODE_LEGENDARY;
use crate::RARITY_CODE_MYTHICAL;
use crate::RARITY_CODE_RARE;

// Branch runtime payload replaces the largest remaining TS branch in hsfBuilder.
// One call executes all level+combo+fallback rows for a single rarity branch.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ExecuteHsfBranchRuntimeIn {
    pub(crate) rarity_code: i64,
    pub(crate) baseline: Option<String>,
    pub(crate) effective_start: i64,
    pub(crate) suppress_roll_thresholds: bool,
    pub(crate) level_window_min: i64,
    pub(crate) level_window_max: i64,
    #[serde(default)]
    pub(crate) restrict_levels: Option<Vec<i64>>,
    pub(crate) required_v: Vec<i32>,
    pub(crate) optional_pool_v: Vec<i32>,
    pub(crate) selected_pool_v: Vec<i32>,
    pub(crate) flex_active: bool,
    pub(crate) aggregate_min_active: bool,
    pub(crate) min_target_count: i32,
    pub(crate) max_target_count: i32,
    pub(crate) aggregate_targets_locked: bool,
    pub(crate) aggregate_min_value: i32,
    pub(crate) locked_min_active: bool,
    pub(crate) locked_min_value: i32,
    pub(crate) substat_roll_bounds_v: BTreeMap<i64, BuildHsfComboBoundsIn>,
    pub(crate) target_entries_by_variant: BTreeMap<i64, BuildHsfComboTargetEntryIn>,
    pub(crate) current_base_by_variant: BTreeMap<i64, i32>,
    pub(crate) factory_base_by_variant: BTreeMap<i64, Option<i32>>,
    pub(crate) target_base_override_by_variant: BTreeMap<i64, Option<i32>>,
    pub(crate) base_rule: RuleRaw,
    pub(crate) main_choices: Vec<EmitHsfMainChoiceIn>,
    pub(crate) emit_any_main_when_no_choices: bool,
    pub(crate) effective_mode: String,
    pub(crate) early_mode: String,
}

// Convert addition bitmasks into the concrete milestone timeline used by runtime.
// Bit positions map to [4, 8, 12, 16] in the generated rarity schedule tables.
fn addition_timeline_for_rarity(rarity_code: i64) -> Vec<i32> {
    // Normalize LTE range codes to their upper-bound concrete so base_start reflects
    // the actual substat count at +0 (e.g. LTE_Epic → Epic: 3 substats, not Common: 0).
    let mask = crate::auto_rarity_addition_mask_for_code(
        crate::auto_rarity_runtime::rarity_for_schedule(rarity_code),
    );
    let mut out = Vec::<i32>::new();
    if (mask & 1) != 0 {
        out.push(LEVEL_MILESTONE_4 as i32);
    }
    if (mask & 2) != 0 {
        out.push(LEVEL_MILESTONE_8 as i32);
    }
    if (mask & 4) != 0 {
        out.push(LEVEL_MILESTONE_12 as i32);
    }
    if (mask & 8) != 0 {
        out.push(LEVEL_MILESTONE_16 as i32);
    }
    out
}

// Keep collapse-eligible rarity codes single-sourced in Rust for branch runtime.
// This replaces the old TS set so branch collapse policy cannot drift by caller.
fn is_collapse_rarity_eligible(rarity_code: i64) -> bool {
    matches!(
        rarity_code,
        RARITY_CODE_ANY
            | RARITY_CODE_RARE
            | RARITY_CODE_EPIC
            | RARITY_CODE_LEGENDARY
            | RARITY_CODE_MYTHICAL
            | RARITY_CODE_GTE_LEGENDARY
    )
}

// Core branch execution loops through all level contexts and level combos.
// It reuses lower-level cores so the only moved logic is orchestration.
pub(crate) fn execute_hsf_branch_runtime_core(input: &ExecuteHsfBranchRuntimeIn) -> Result<Vec<RuleRaw>, String> {
    // Decode rarity additions once so combo runtime can test event-level changes.
    let addition_timeline_all = addition_timeline_for_rarity(input.rarity_code);
    // Base present slots are four minus total branch additions.
    let base_start_by_branch = (4 - addition_timeline_all.len() as i32).max(0);
    // Collapse profile includes per-branch roll timeline and max-roll gates.
    let collapse_profile = build_hsf_branch_collapse_profile_core(&BuildHsfBranchCollapseProfileIn {
        rarity_code: input.rarity_code,
        baseline: input.baseline.clone(),
        effective_start: input.effective_start,
        aggregate_min_active: input.aggregate_min_active,
        aggregate_targets_locked: input.aggregate_targets_locked,
        aggregate_min_value: input.aggregate_min_value as i64,
        addition_count: addition_timeline_all.len() as i64,
    });

    // Restriction is active only when at least one explicit level is provided.
    let has_restrict_levels = input
        .restrict_levels
        .as_ref()
        .map(|levels| !levels.is_empty())
        .unwrap_or(false);
    // Branch collapse requires non-flex, unrestricted branch windows, and profile pass.
    let collapse_branch_eligible = !input.flex_active
        && !has_restrict_levels
        && collapse_profile.collapse_global_ok;
    // Rarity eligibility is single-sourced in this runtime helper.
    let collapse_rarity_eligible = is_collapse_rarity_eligible(input.rarity_code);
    // Sentinel collapse is only legal for pristine 0..16 windows with no additions.
    let window_min = input.level_window_min.min(input.level_window_max);
    let window_max = input.level_window_min.max(input.level_window_max);
    let sentinel_eligible_for_branch = collapse_branch_eligible
        && collapse_rarity_eligible
        && addition_timeline_all.is_empty()
        && window_min == LEVEL_MILESTONE_0
        && window_max == LEVEL_MILESTONE_16;

    // Level contexts already encode branch-specific roll/present counters.
    let level_contexts = build_hsf_level_contexts_core(&BuildHsfLevelContextsIn {
        rarity_code: input.rarity_code,
        baseline: input.baseline.clone(),
        effective_start: input.effective_start,
        suppress_roll_thresholds: input.suppress_roll_thresholds,
        level_window_min: input.level_window_min,
        level_window_max: input.level_window_max,
        restrict_levels: input.restrict_levels.clone(),
    });
    // Myths contribute one pre-roll at level 0 and this is branch-constant.
    let pre_rolls = if crate::auto_rarity_includes_mythical(input.rarity_code) { 1 } else { 0 };
    // Reuse roll timeline from branch collapse profile for combo runtime timelines.
    let roll_timeline = collapse_profile
        .roll_timeline
        .iter()
        .map(|value| *value as i32)
        .collect::<Vec<_>>();

    // Cache per-combo factory profiles so repeated levels reuse base/collapse vectors.
    let mut combo_profile_cache = BTreeMap::<Vec<i32>, HsfComboCollapseProfileIn>::new();
    // Sentinel-collapsed combos are skipped for later levels in the same branch.
    let mut sentinel_collapsed = HashSet::<Vec<i32>>::new();
    // Output rows preserve level->combo emission order for stable downstream sorting.
    let mut out = Vec::<RuleRaw>::new();

    for level_context in level_contexts {
        // Narrow per-level counters once to match combo/runtime input types.
        let level = level_context.level as i32;
        let present = level_context.present as i32;
        let num_rolls_for_this_level = level_context.num_rolls_for_this_level as i32;
        let num_rolls_by_target = level_context.num_rolls_by_target as i32;
        // Combo expansion uses the same core as the standalone helper binding.
        let level_combos = build_hsf_level_combos_core(&BuildHsfLevelCombosIn {
            required_v: input.required_v.clone(),
            optional_pool_v: input.optional_pool_v.clone(),
            flex_active: input.flex_active,
            aggregate_min_active: input.aggregate_min_active,
            num_rolls_for_this_level,
            min_target_count: input.min_target_count,
            max_target_count: input.max_target_count,
            present,
        });

        for combo in level_combos {
            // Reuse the combo vector itself as the cache key.
            let combo_key = combo.clone();
            if sentinel_collapsed.contains(&combo_key) {
                continue;
            }
            // Level-local present slots still guard against invalid combo sizes.
            if present < combo.len() as i32 {
                continue;
            }
            // Addition events at this level disable factory collapse for the combo.
            let addition_event_at_level = addition_timeline_all.contains(&level);
            // Build or reuse per-combo collapse profile vectors.
            let combo_profile = if let Some(cached) = combo_profile_cache.get(&combo_key) {
                cached.clone()
            } else {
                // Build combo base/collapse vectors without cloning large branch maps.
                let profile = build_hsf_factory_combo_rows_from_parts(
                    &combo,
                    &input.current_base_by_variant,
                    &input.factory_base_by_variant,
                    &input.target_base_override_by_variant,
                    &input.substat_roll_bounds_v,
                );
                let normalized = HsfComboCollapseProfileIn {
                    base_vals: profile.base_vals,
                    factory_eligible: profile.factory_eligible,
                    substats: profile.substats,
                };
                combo_profile_cache.insert(combo_key.clone(), normalized.clone());
                normalized
            };
            // Target entries are indexed by variant id and aligned to combo order.
            let target_entries = combo
                .iter()
                .map(|variant| input.target_entries_by_variant.get(&(*variant as i64)).cloned())
                .collect::<Vec<_>>();
            // Build shared base-rule payload once for level+combo execution.
            let mut base_rule = input.base_rule.clone();
            base_rule.LVLForCheck = Some(level as i64);
            base_rule.Substats = Some(Vec::new());
            // Execute collapse/presence/runtime in the shared level-combo core.
            let combo_out = execute_hsf_level_combo_core(&ExecuteHsfLevelComboIn {
                sentinel_already_collapsed: sentinel_collapsed.contains(&combo_key),
                combo: combo.clone(),
                present,
                level,
                rarity_code: input.rarity_code,
                addition_levels_count: addition_timeline_all.len() as i32,
                addition_event_at_level,
                collapse_branch_eligible,
                collapse_rarity_eligible,
                sentinel_eligible_for_branch,
                combo_profile: combo_profile.clone(),
                base_rule: base_rule.clone(),
                main_choices: input.main_choices.clone(),
                emit_any_main_when_no_choices: input.emit_any_main_when_no_choices,
                runtime: ExecuteHsfComboRuntimeIn {
                    combo,
                    required_v: input.required_v.clone(),
                    aggregate_targets_locked: input.aggregate_targets_locked,
                    substat_roll_bounds_v: input.substat_roll_bounds_v.clone(),
                    target_entries,
                    base_vals: combo_profile.base_vals.clone(),
                    base_rule,
                    main_choices: input.main_choices.clone(),
                    emit_any_main_when_no_choices: input.emit_any_main_when_no_choices,
                    effective_mode: input.effective_mode.clone(),
                    early_mode: input.early_mode.clone(),
                    min_target_count: input.min_target_count,
                    aggregate_min_value: input.aggregate_min_value,
                    locked_min_active: input.locked_min_active,
                    locked_min_value: input.locked_min_value,
                    flex_active: input.flex_active,
                    present,
                    base_start_by_branch,
                    addition_timeline_all: addition_timeline_all.clone(),
                    level,
                    roll_timeline: roll_timeline.clone(),
                    baseline: input.baseline.clone(),
                    effective_start: input.effective_start as i32,
                    pre_rolls,
                    rarity_code: input.rarity_code,
                    num_rolls_for_this_level,
                    num_rolls_by_target,
                },
            })?;
            // Sentinel collapse marks this combo covered by LEVEL_ANY emission.
            if combo_out.sentinel_collapsed {
                sentinel_collapsed.insert(combo_key);
            }
            // Append emitted rules in-place to preserve original ordering semantics.
            out.extend(combo_out.rules);
        }

        // Late potential mode keeps the full-selected fallback branch per level.
        let mut fallback_base_rule = input.base_rule.clone();
        fallback_base_rule.LVLForCheck = Some(level as i64);
        fallback_base_rule.Substats = Some(Vec::new());
        let fallback_rules = execute_hsf_full_selected_fallback_core(&ExecuteHsfFullSelectedFallbackIn {
            effective_mode: input.effective_mode.clone(),
            early_mode: input.early_mode.clone(),
            min_target_count: input.min_target_count as i64,
            selected_pool_v: input.selected_pool_v.iter().map(|value| *value as i64).collect::<Vec<_>>(),
            rarity_code: input.rarity_code,
            num_rolls_for_this_level: num_rolls_for_this_level as i64,
            num_rolls_by_target: num_rolls_by_target as i64,
            aggregate_min_value: input.aggregate_min_value as i64,
            base_by_variant: input
                .current_base_by_variant
                .iter()
                .map(|(key, value)| (*key, *value as i64))
                .collect::<BTreeMap<_, _>>(),
            substat_roll_bounds_v: input.substat_roll_bounds_v.clone(),
            base_rule: fallback_base_rule,
            main_choices: input.main_choices.clone(),
            emit_any_main_when_no_choices: input.emit_any_main_when_no_choices,
        });
        // Fallback rows append after combo rows for the level, matching TS order.
        out.extend(fallback_rules);
    }

    Ok(out)
}
