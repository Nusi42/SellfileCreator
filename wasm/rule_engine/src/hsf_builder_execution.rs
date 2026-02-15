use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_wasm_bindgen::{from_value as from_js_value, to_value as to_js_value};
use wasm_bindgen::JsValue;

use crate::finalize_builder_rules_core;
use crate::hsf_branch_execution::execute_hsf_branch_runtime_core;
use crate::hsf_branch_execution::ExecuteHsfBranchRuntimeIn;
use crate::level_order_value;
use crate::BuildHsfComboBoundsIn;
use crate::BuildHsfComboTargetEntryIn;
use crate::BuilderFinalizeEmissionMetaIn;
use crate::EmitHsfMainChoiceIn;
use crate::RuleRaw;
use crate::RuleSubRaw;
use crate::LEVEL_ANY_SENTINEL;
use crate::STAT_ID_ANY;

// Branch descriptor mirrors TS rarity branch objects for one-call runtime.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExecuteHsfBuilderBranchIn {
    code: i64,
    #[serde(default)]
    restrict_levels: Option<Vec<i64>>,
}

// Builder runtime payload collapses all branch orchestration into one input.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecuteHsfBuilderRuntimeIn {
    rarity_branches: Vec<ExecuteHsfBuilderBranchIn>,
    baseline: Option<String>,
    effective_start: i64,
    suppress_roll_thresholds: bool,
    level_window_min: i64,
    level_window_max: i64,
    required_v: Vec<i32>,
    optional_pool_v: Vec<i32>,
    selected_pool_v: Vec<i32>,
    flex_active: bool,
    aggregate_min_active: bool,
    min_target_count: i32,
    max_target_count: i32,
    aggregate_targets_locked: bool,
    aggregate_min_value: i32,
    locked_min_active: bool,
    locked_min_value: i32,
    substat_roll_bounds_v: HashMap<String, BuildHsfComboBoundsIn>,
    target_entries_by_variant: HashMap<String, BuildHsfComboTargetEntryIn>,
    current_base_by_variant: HashMap<String, i32>,
    factory_base_by_variant: HashMap<String, Option<i32>>,
    target_base_override_by_variant: HashMap<String, Option<i32>>,
    base_rule: RuleRaw,
    main_choices: Vec<EmitHsfMainChoiceIn>,
    emit_any_main_when_no_choices: bool,
    effective_mode: String,
    early_mode: String,
    #[serde(default)]
    emission_limit: Option<i64>,
}

// Builder runtime output carries rules plus a hard-limit signal for TS parity.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExecuteHsfBuilderRuntimeOut {
    rules: Vec<RuleRaw>,
    limit_hit: bool,
}

// Convert MainStatF payload to Number()-style fallback used by TS signature keys.
fn main_stat_f_number(value: Option<&serde_json::Value>) -> f64 {
    match value {
        Some(serde_json::Value::Number(number)) => number.as_f64().unwrap_or(1.0),
        Some(serde_json::Value::Bool(boolean)) => {
            if *boolean {
                1.0
            } else {
                0.0
            }
        }
        Some(serde_json::Value::String(raw)) => raw.trim().parse::<f64>().unwrap_or(f64::NAN),
        Some(serde_json::Value::Null) => 1.0,
        _ => 1.0,
    }
}

// Keep rule signature set/type arrays aligned with TS map-sort-join behavior.
fn canonical_join_sorted_numeric(values: Option<&Vec<i64>>) -> String {
    let mut normalized = values.cloned().unwrap_or_default();
    normalized.sort_unstable();
    normalized
        .into_iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>()
        .join(",")
}

// JS truthiness for IsFlat mirrors the previous TypeScript signature helper.
fn is_truthy_is_flat(value: Option<&serde_json::Value>) -> bool {
    match value {
        Some(serde_json::Value::Bool(boolean)) => *boolean,
        Some(serde_json::Value::Number(number)) => number.as_f64().map(|inner| inner != 0.0).unwrap_or(false),
        Some(serde_json::Value::String(raw)) => !raw.is_empty(),
        Some(serde_json::Value::Array(values)) => !values.is_empty(),
        Some(serde_json::Value::Object(values)) => !values.is_empty(),
        _ => false,
    }
}

// Substat tokens mirror TS `${id}:${flat}:${cond}:${val}` tuple construction.
fn rule_substats_signature(substats: Option<&Vec<RuleSubRaw>>) -> String {
    substats
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|entry| {
            let id = entry.ID.unwrap_or(STAT_ID_ANY);
            let flat = if is_truthy_is_flat(entry.IsFlat.as_ref()) { "1" } else { "0" };
            let cond = entry.Condition.unwrap_or_default();
            let value = entry.Value.unwrap_or(0.0);
            format!("{id}:{flat}:{cond}:{value}")
        })
        .collect::<Vec<_>>()
        .join(";")
}

// Signature intentionally ignores rarity so cross-branch duplicates collapse.
fn builder_emission_signature(rule: &RuleRaw) -> String {
    let keep_bit = if rule.Keep == Some(true) { "1" } else { "0" };
    let use_bit = if rule.Use != Some(false) { "1" } else { "0" };
    let rank = rule.Rank.unwrap_or(0);
    let faction = rule.Faction.unwrap_or(0);
    let main_id = rule.MainStatID.unwrap_or(STAT_ID_ANY);
    let main_f = main_stat_f_number(rule.MainStatF.as_ref());
    let level = rule.LVLForCheck.unwrap_or(LEVEL_ANY_SENTINEL);
    let sets = canonical_join_sorted_numeric(rule.ArtifactSet.as_ref());
    let types = canonical_join_sorted_numeric(rule.ArtifactType.as_ref());
    let substats = rule_substats_signature(rule.Substats.as_ref());
    format!("{keep_bit}{use_bit}|{rank}|{faction}|{main_id}:{main_f}|{level}|{sets}|{types}|{substats}")
}

// Runtime core executes all branches and preserves TS-level dedupe/order rules.
fn execute_hsf_builder_runtime_core(input: &ExecuteHsfBuilderRuntimeIn) -> Result<ExecuteHsfBuilderRuntimeOut, JsValue> {
    // Branch-level emission signatures collapse cross-rarity duplicates.
    let mut emitted_signatures = HashSet::<String>::new();
    // Preserve rule rows and metadata for shared finalize ordering/pruning.
    let mut rules = Vec::<RuleRaw>::new();
    let mut emission_meta = Vec::<BuilderFinalizeEmissionMetaIn>::new();
    let mut next_seq = 0i64;
    // Normalize positive limit values once; non-positive means unlimited.
    let emission_limit = input.emission_limit.filter(|value| *value > 0);

    // Execute each rarity branch with the existing branch runtime core.
    for (branch_idx, branch) in input.rarity_branches.iter().enumerate() {
        // Clone base rule once per branch and stamp branch rarity in Rust.
        let mut base_rule = input.base_rule.clone();
        base_rule.Rarity = Some(branch.code);
        // Delegate branch internals to the existing shared runtime core.
        let branch_rules = execute_hsf_branch_runtime_core(&ExecuteHsfBranchRuntimeIn {
            rarity_code: branch.code,
            baseline: input.baseline.clone(),
            effective_start: input.effective_start,
            suppress_roll_thresholds: input.suppress_roll_thresholds,
            level_window_min: input.level_window_min,
            level_window_max: input.level_window_max,
            restrict_levels: branch.restrict_levels.clone(),
            required_v: input.required_v.clone(),
            optional_pool_v: input.optional_pool_v.clone(),
            selected_pool_v: input.selected_pool_v.clone(),
            flex_active: input.flex_active,
            aggregate_min_active: input.aggregate_min_active,
            min_target_count: input.min_target_count,
            max_target_count: input.max_target_count,
            aggregate_targets_locked: input.aggregate_targets_locked,
            aggregate_min_value: input.aggregate_min_value,
            locked_min_active: input.locked_min_active,
            locked_min_value: input.locked_min_value,
            substat_roll_bounds_v: input.substat_roll_bounds_v.clone(),
            target_entries_by_variant: input.target_entries_by_variant.clone(),
            current_base_by_variant: input.current_base_by_variant.clone(),
            factory_base_by_variant: input.factory_base_by_variant.clone(),
            target_base_override_by_variant: input.target_base_override_by_variant.clone(),
            base_rule,
            main_choices: input.main_choices.clone(),
            emit_any_main_when_no_choices: input.emit_any_main_when_no_choices,
            effective_mode: input.effective_mode.clone(),
            early_mode: input.early_mode.clone(),
        })?;

        // Append only new signatures and record metadata for final ordering.
        for rule in branch_rules {
            let signature = builder_emission_signature(&rule);
            if !emitted_signatures.insert(signature) {
                continue;
            }
            emission_meta.push(BuilderFinalizeEmissionMetaIn {
                level_idx: level_order_value(rule.LVLForCheck),
                branch_idx: branch_idx as i64,
                seq: next_seq,
            });
            next_seq += 1;
            rules.push(rule);
            // Hard-limit mirrors TS pushRule behavior before finalization.
            if let Some(limit) = emission_limit {
                if rules.len() as i64 >= limit {
                    return Ok(ExecuteHsfBuilderRuntimeOut {
                        rules,
                        limit_hit: true,
                    });
                }
            }
        }
    }

    // Finalize builder rows in Rust so prune/sort stays single-sourced.
    let finalized = finalize_builder_rules_core(rules, emission_meta)
        .map_err(|error| JsValue::from_str(&format!("Failed to finalize builder runtime rows: {error}")))?;
    Ok(ExecuteHsfBuilderRuntimeOut {
        rules: finalized,
        limit_hit: false,
    })
}

// JsValue wrapper keeps payload parsing and output serialization centralized.
pub(crate) fn execute_hsf_builder_runtime_value(payload: JsValue) -> Result<JsValue, JsValue> {
    let input: ExecuteHsfBuilderRuntimeIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid execute-hsf-builder-runtime payload: {error}")))?;
    let out = execute_hsf_builder_runtime_core(&input)?;
    to_js_value(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize execute-hsf-builder-runtime output: {error}")))
}
