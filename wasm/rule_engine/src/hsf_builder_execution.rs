use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_wasm_bindgen::{from_value as from_js_value, to_value as to_js_value};
use wasm_bindgen::JsValue;

use crate::build_hsf_preflight_flags_core;
use crate::build_hsf_presence_only_rules_core;
use crate::build_hsf_rarity_branches_core;
use crate::BuildHsfPreflightFlagsIn;
use crate::BuildHsfPresenceOnlyRulesIn;
use crate::BuildHsfRarityBranchesIn;
use crate::finalize_builder_rules_core;
use crate::hsf_branch_execution::execute_hsf_branch_runtime_core;
use crate::hsf_branch_execution::ExecuteHsfBranchRuntimeIn;
use crate::level_order_value;
use crate::sort_artifact_types_in_place;
use crate::BuildHsfComboBoundsIn;
use crate::BuildHsfComboTargetEntryIn;
use crate::BuilderFinalizeEmissionMetaIn;
use crate::EmitHsfMainChoiceIn;
use crate::RuleRaw;
use crate::RuleSubRaw;
use crate::HSF_SUBSTAT_SLOT_COUNT;
use crate::LEVEL_ANY_SENTINEL;
use crate::STAT_ID_ANY;

// Builder prep payload moves selected/fixed pool normalization and base-target map
// preparation out of hsfBuilder.ts so TS no longer loops large variant sets.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrepareHsfBuilderRecipeIn {
    min_count: i64,
    auto_substat_flex: bool,
    flex_eligible: bool,
    #[serde(default)]
    substats_v: Vec<i64>,
    #[serde(default)]
    fixed_substats_v: Vec<i64>,
    #[serde(default)]
    allowed_substats: Vec<i64>,
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    substat_roll_bounds_v: HashMap<i64, BuildHsfComboBoundsIn>,
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    substat_roll_targets_v: HashMap<i64, BuildHsfComboTargetEntryIn>,
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    substat_target_by_variant: HashMap<i64, i64>,
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    factory_base_by_variant_for_star: HashMap<i64, i64>,
    #[serde(default)]
    variant_priority: Vec<i64>,
}

// Output carries normalized pools and per-variant maps consumed by branch runtime.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PrepareHsfBuilderRecipeOut {
    selected_pool_v: Vec<i32>,
    required_v: Vec<i32>,
    optional_pool_v: Vec<i32>,
    min_target_count: i32,
    max_target_count: i32,
    max_selectable_count: i32,
    had_requested_substats: bool,
    has_per_stat_min: bool,
    // serialize_with stringifies i64 keys so wasm_to_js can emit plain JS objects.
    #[serde(serialize_with = "crate::serialize_i64_key_map")]
    current_base_by_variant: HashMap<i64, i32>,
    #[serde(serialize_with = "crate::serialize_i64_key_map")]
    factory_base_by_variant: HashMap<i64, Option<i32>>,
    #[serde(serialize_with = "crate::serialize_i64_key_map")]
    target_base_override_by_variant: HashMap<i64, Option<i32>>,
    #[serde(serialize_with = "crate::serialize_i64_key_map")]
    target_entries_by_variant: HashMap<i64, PrepareHsfBuilderTargetEntryOut>,
}

// Output target-entry payload mirrors the runtime input entry schema.
// We keep this local so serialization does not depend on internal input-only types.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PrepareHsfBuilderTargetEntryOut {
    base: Option<f64>,
    increments: Option<Vec<Option<f64>>>,
}

// Clamp and sanitize roll-target values to the same non-negative integer domain
// used by TS normalizeRollTargetEntry before builder runtime consumption.
fn normalize_target_override_value(value: Option<f64>) -> Option<f64> {
    let numeric = value?;
    if !numeric.is_finite() {
        return None;
    }
    let rounded = numeric.round().max(0.0);
    Some(rounded)
}

// Priority-sort helper mirrors compareVariants by using caller-provided order and
// falling back to raw numeric value when a variant is outside that priority list.
fn sort_variants_by_priority(values: &mut [i64], variant_priority: &[i64]) {
    let mut order = HashMap::<i64, usize>::new();
    for (idx, value) in variant_priority.iter().enumerate() {
        order.insert(*value, idx);
    }
    let fallback_rank = variant_priority.len();
    values.sort_unstable_by(|left, right| {
        let left_rank = *order.get(left).unwrap_or(&fallback_rank);
        let right_rank = *order.get(right).unwrap_or(&fallback_rank);
        left_rank.cmp(&right_rank).then_with(|| left.cmp(right))
    });
}

// Shared prep core keeps variant filtering/sorting and per-variant map generation
// in Rust so buildHsfRules can avoid repeated TS-side loops and map plumbing.
fn prepare_hsf_builder_recipe_core(input: &PrepareHsfBuilderRecipeIn) -> PrepareHsfBuilderRecipeOut {
    // Explicit substats/fixed/bounds indicate the user requested substat filters.
    let had_requested_substats = !input.substats_v.is_empty()
        || !input.fixed_substats_v.is_empty()
        || !input.substat_roll_bounds_v.is_empty();
    // Allowed ids are precomputed in TS and reused here for stable filtering.
    let allowed = input.allowed_substats.iter().copied().collect::<HashSet<_>>();
    let mut selected_pool_v = input
        .substats_v
        .iter()
        .copied()
        .filter(|variant| allowed.contains(variant))
        .collect::<Vec<_>>();
    sort_variants_by_priority(&mut selected_pool_v, &input.variant_priority);
    let fixed_pool_raw_v = input
        .fixed_substats_v
        .iter()
        .copied()
        .filter(|variant| allowed.contains(variant))
        .collect::<Vec<_>>();
    // Locked subset follows selected ordering and is clamped to four slots.
    let fixed_pool_set = fixed_pool_raw_v.iter().copied().collect::<HashSet<_>>();
    let required_pool = selected_pool_v
        .iter()
        .copied()
        .filter(|variant| fixed_pool_set.contains(variant))
        .take(HSF_SUBSTAT_SLOT_COUNT)
        .collect::<Vec<_>>();
    let required_set = required_pool.iter().copied().collect::<HashSet<_>>();
    let optional_pool = selected_pool_v
        .iter()
        .copied()
        .filter(|variant| !required_set.contains(variant))
        .collect::<Vec<_>>();
    // Clamp target counts to HSF's four-substat maximum.
    let locked_count = required_pool.len() as i32;
    let min_target_count = (input.min_count as i32).max(locked_count).clamp(0, HSF_SUBSTAT_SLOT_COUNT as i32);
    let max_selectable_count = (required_pool.len() + optional_pool.len()).min(HSF_SUBSTAT_SLOT_COUNT) as i32;
    let flex_active = input.auto_substat_flex && input.flex_eligible;
    let max_target_count = if flex_active {
        max_selectable_count
    } else {
        min_target_count
    };
    // Track whether any selected stat explicitly requires minimum rolls.
    let has_per_stat_min = selected_pool_v.iter().any(|variant| {
        input
            .substat_roll_bounds_v
            .get(variant)
            .and_then(|entry| entry.min)
            .filter(|value| value.is_finite())
            .map(|value| value > 0.0)
            .unwrap_or(false)
    });

    // Build star-resolved base minima and normalized roll-target override maps.
    let mut current_base_by_variant = HashMap::<i64, i32>::new();
    let mut factory_base_by_variant = HashMap::<i64, Option<i32>>::new();
    let mut target_base_override_by_variant = HashMap::<i64, Option<i32>>::new();
    let mut target_entries_by_variant = HashMap::<i64, PrepareHsfBuilderTargetEntryOut>::new();
    for variant in &selected_pool_v {
        let current_base = input
            .substat_target_by_variant
            .get(variant)
            .copied()
            .unwrap_or(0)
            .max(0)
            .min(i32::MAX as i64) as i32;
        current_base_by_variant.insert(*variant, current_base);
        factory_base_by_variant.insert(
            *variant,
            input
                .factory_base_by_variant_for_star
                .get(variant)
                .copied()
                .map(|value| value.max(0).min(i32::MAX as i64) as i32),
        );
        let maybe_target = input.substat_roll_targets_v.get(variant).cloned();
        let Some(target_entry) = maybe_target else {
            target_base_override_by_variant.insert(*variant, None);
            continue;
        };
        let normalized_base = normalize_target_override_value(target_entry.base);
        let normalized_base_i32 = normalized_base.map(|value| value as i32);
        target_base_override_by_variant.insert(*variant, normalized_base_i32);
        let mut normalized_increments = target_entry
            .increments
            .unwrap_or_default()
            .into_iter()
            .map(normalize_target_override_value)
            .collect::<Vec<_>>();
        while normalized_increments.last().map(|entry| entry.is_none()).unwrap_or(false) {
            normalized_increments.pop();
        }
        let has_increments = normalized_increments.iter().any(|entry| entry.is_some());
        if normalized_base.is_none() && !has_increments {
            continue;
        }
        target_entries_by_variant.insert(
            *variant,
            PrepareHsfBuilderTargetEntryOut {
                base: normalized_base,
                increments: if has_increments {
                    Some(normalized_increments)
                } else {
                    Some(Vec::new())
                },
            },
        );
    }

    PrepareHsfBuilderRecipeOut {
        selected_pool_v: selected_pool_v.iter().map(|value| *value as i32).collect::<Vec<_>>(),
        required_v: required_pool.iter().map(|value| *value as i32).collect::<Vec<_>>(),
        optional_pool_v: optional_pool.iter().map(|value| *value as i32).collect::<Vec<_>>(),
        min_target_count,
        max_target_count,
        max_selectable_count,
        had_requested_substats,
        has_per_stat_min,
        current_base_by_variant,
        factory_base_by_variant,
        target_base_override_by_variant,
        target_entries_by_variant,
    }
}

// JsValue wrapper centralizes parsing/serialization for TS prep helper calls.
pub(crate) fn prepare_hsf_builder_recipe_value(payload: JsValue) -> Result<JsValue, JsValue> {
    let input: PrepareHsfBuilderRecipeIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid prepare-hsf-builder-recipe payload: {error}")))?;
    let out = prepare_hsf_builder_recipe_core(&input);
    // Use shared helper so HashMap fields serialize as plain JS objects, not ES2015 Maps.
    crate::wasm_to_js(&out)
}

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
    substat_roll_bounds_v: HashMap<i64, BuildHsfComboBoundsIn>,
    target_entries_by_variant: HashMap<i64, BuildHsfComboTargetEntryIn>,
    current_base_by_variant: HashMap<i64, i32>,
    factory_base_by_variant: HashMap<i64, Option<i32>>,
    target_base_override_by_variant: HashMap<i64, Option<i32>>,
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

// High-level runtime payload lets TS issue one wasm call after prep.
// Rust then runs preflight, rarity-branch planning, and final execution.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfRulesRuntimeIn {
    recipe_id: Option<i64>,
    keep: Option<bool>,
    use_flag: bool,
    #[serde(default)]
    artifact_set_ids: Vec<i64>,
    #[serde(default)]
    artifact_type_ids: Vec<i64>,
    rank_code: i64,
    rarity_code: i64,
    faction_code: i64,
    #[serde(default)]
    main_choices: Vec<EmitHsfMainChoiceIn>,
    emit_any_main_when_no_choices: bool,
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
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    substat_roll_bounds_v: HashMap<i64, BuildHsfComboBoundsIn>,
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    target_entries_by_variant: HashMap<i64, BuildHsfComboTargetEntryIn>,
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    current_base_by_variant: HashMap<i64, i32>,
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    factory_base_by_variant: HashMap<i64, Option<i32>>,
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    target_base_override_by_variant: HashMap<i64, Option<i32>>,
    rarity_mode: Option<String>,
    early_keep_mode: Option<String>,
    auto_rarity_supplements_threshold: Option<String>,
    early_mode: String,
    #[serde(default)]
    emission_limit: Option<i64>,
}

// Canonicalize set selectors with numeric ordering (game-id order parity).
fn sort_artifact_sets(values: &[i64]) -> Option<Vec<i64>> {
    if values.is_empty() {
        return None;
    }
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    Some(sorted)
}

// Canonicalize slot selectors using shared preferred-slot ordering helper.
fn sort_artifact_types(values: &[i64]) -> Option<Vec<i64>> {
    if values.is_empty() {
        return None;
    }
    let mut sorted = values.to_vec();
    sort_artifact_types_in_place(&mut sorted);
    Some(sorted)
}

// Build the selector-only base rule once so all runtime branches clone it.
fn build_hsf_rules_base_rule(input: &BuildHsfRulesRuntimeIn) -> RuleRaw {
    RuleRaw {
        RecipeID: input.recipe_id.filter(|value| *value > 0),
        RecipeName: None,
        Keep: input.keep,
        IsRuleTypeAND: None,
        Use: Some(input.use_flag),
        ArtifactSet: sort_artifact_sets(&input.artifact_set_ids),
        ArtifactType: sort_artifact_types(&input.artifact_type_ids),
        Rank: Some(input.rank_code),
        Rarity: Some(input.rarity_code),
        MainStatID: None,
        MainStatF: None,
        LVLForCheck: None,
        Faction: Some(input.faction_code),
        Substats: Some(Vec::new()),
        source: None,
        line_idx: None,
        all_known_sets: None,
        rank_mask: None,
        rarity_mask: None,
        safeguard_rule_id: None,
        safeguard_rule_ordinal: None,
        safeguard_hash: None,
        safeguard_required: None,
        safeguard_scan_ms: None,
        safeguard_projected: None,
        safeguard_deficit: None,
        safeguard_item_key: None,
        safeguard_placeholder: None,
        safeguard_placeholder_missing: None,
    }
}

// Shared append helper keeps signature dedupe + emission metadata in one path.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct BuilderSubstatSignatureKey {
    id: i64,
    flat_true: bool,
    condition: String,
    value_bits: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct BuilderEmissionSignatureKey {
    keep: bool,
    use_flag: bool,
    rank: i64,
    faction: i64,
    main_id: i64,
    main_f_bits: u64,
    level: i64,
    sets: Vec<i64>,
    types: Vec<i64>,
    substats: Vec<BuilderSubstatSignatureKey>,
}

// Normalize NaN to one canonical bit pattern so all NaN payloads hash equally.
fn normalize_f64_bits(value: f64) -> u64 {
    if value.is_nan() {
        f64::NAN.to_bits()
    } else {
        value.to_bits()
    }
}

fn push_builder_runtime_rule(
    rule: RuleRaw,
    branch_idx: usize,
    emitted_signatures: &mut HashSet<BuilderEmissionSignatureKey>,
    rules: &mut Vec<RuleRaw>,
    emission_meta: &mut Vec<BuilderFinalizeEmissionMetaIn>,
    next_seq: &mut i64,
    emission_limit: Option<i64>,
) -> bool {
    let signature = builder_emission_signature(&rule);
    if !emitted_signatures.insert(signature) {
        return false;
    }
    emission_meta.push(BuilderFinalizeEmissionMetaIn {
        level_idx: level_order_value(rule.LVLForCheck),
        branch_idx: branch_idx as i64,
        seq: *next_seq,
    });
    *next_seq += 1;
    rules.push(rule);
    if let Some(limit) = emission_limit {
        return rules.len() as i64 >= limit;
    }
    false
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

// Keep set/type arrays normalized so ordering does not affect dedupe keys.
fn canonical_sorted_numeric(values: Option<&Vec<i64>>) -> Vec<i64> {
    let mut normalized = values.cloned().unwrap_or_default();
    normalized.sort_unstable();
    normalized
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

// Substat tuples mirror TS key dimensions while avoiding string concatenation.
fn rule_substats_signature_key(substats: Option<&Vec<RuleSubRaw>>) -> Vec<BuilderSubstatSignatureKey> {
    substats
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|entry| BuilderSubstatSignatureKey {
            id: entry.ID.unwrap_or(STAT_ID_ANY),
            flat_true: is_truthy_is_flat(entry.IsFlat.as_ref()),
            condition: entry.Condition.unwrap_or_default(),
            value_bits: normalize_f64_bits(entry.Value.unwrap_or(0.0)),
        })
        .collect::<Vec<_>>()
}

// Signature intentionally ignores rarity so cross-branch duplicates collapse.
fn builder_emission_signature(rule: &RuleRaw) -> BuilderEmissionSignatureKey {
    BuilderEmissionSignatureKey {
        keep: rule.Keep == Some(true),
        use_flag: rule.Use != Some(false),
        rank: rule.Rank.unwrap_or(0),
        faction: rule.Faction.unwrap_or(0),
        main_id: rule.MainStatID.unwrap_or(STAT_ID_ANY),
        main_f_bits: normalize_f64_bits(main_stat_f_number(rule.MainStatF.as_ref())),
        level: rule.LVLForCheck.unwrap_or(LEVEL_ANY_SENTINEL),
        sets: canonical_sorted_numeric(rule.ArtifactSet.as_ref()),
        types: canonical_sorted_numeric(rule.ArtifactType.as_ref()),
        substats: rule_substats_signature_key(rule.Substats.as_ref()),
    }
}

// Runtime core executes all branches and preserves TS-level dedupe/order rules.
fn execute_hsf_builder_runtime_core(input: &ExecuteHsfBuilderRuntimeIn) -> Result<ExecuteHsfBuilderRuntimeOut, JsValue> {
    // Branch-level emission signatures collapse cross-rarity duplicates.
    let mut emitted_signatures = HashSet::<BuilderEmissionSignatureKey>::new();
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
            // Shared append helper keeps signature/meta/limit semantics aligned.
            let limit_hit = push_builder_runtime_rule(
                rule,
                branch_idx,
                &mut emitted_signatures,
                &mut rules,
                &mut emission_meta,
                &mut next_seq,
                emission_limit,
            );
            if limit_hit {
                return Ok(ExecuteHsfBuilderRuntimeOut {
                    rules,
                    limit_hit: true,
                });
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

// Full builder runtime core (post-prep) keeps one-call orchestration in Rust.
fn build_hsf_rules_runtime_core(input: &BuildHsfRulesRuntimeIn) -> Result<ExecuteHsfBuilderRuntimeOut, JsValue> {
    // Build selector-only base rule once for both presence and branch runtime.
    let base_rule = build_hsf_rules_base_rule(input);
    // Normalize positive limits once; non-positive values mean "no limit".
    let emission_limit = input.emission_limit.filter(|value| *value > 0);

    // Presence-only path still dedupes + finalizes so TS behavior remains stable.
    if input.selected_pool_v.is_empty() {
        let emitted = build_hsf_presence_only_rules_core(&BuildHsfPresenceOnlyRulesIn {
            base_core: base_rule,
            main_choices: input.main_choices.clone(),
            level_window_min: input.level_window_min,
            level_window_max: input.level_window_max,
        });
        let mut emitted_signatures = HashSet::<BuilderEmissionSignatureKey>::new();
        let mut rules = Vec::<RuleRaw>::new();
        let mut emission_meta = Vec::<BuilderFinalizeEmissionMetaIn>::new();
        let mut next_seq = 0i64;
        for rule in emitted {
            let limit_hit = push_builder_runtime_rule(
                rule,
                0,
                &mut emitted_signatures,
                &mut rules,
                &mut emission_meta,
                &mut next_seq,
                emission_limit,
            );
            if limit_hit {
                return Ok(ExecuteHsfBuilderRuntimeOut {
                    rules,
                    limit_hit: true,
                });
            }
        }
        let finalized = finalize_builder_rules_core(rules, emission_meta)
            .map_err(|error| JsValue::from_str(&format!("Failed to finalize presence-only builder rows: {error}")))?;
        return Ok(ExecuteHsfBuilderRuntimeOut {
            rules: finalized,
            limit_hit: false,
        });
    }

    // Preflight keeps cap infeasibility + circled-mode detection single-sourced.
    let preflight = build_hsf_preflight_flags_core(&BuildHsfPreflightFlagsIn {
        selected_pool_v: input.selected_pool_v.clone(),
        required_v: input.required_v.clone(),
        optional_pool_v: input.optional_pool_v.clone(),
        max_target_count: input.max_target_count,
        aggregate_min_active: input.aggregate_min_active,
        aggregate_min_value: input.aggregate_min_value,
        aggregate_targets_locked: input.aggregate_targets_locked,
        rarity_code: input.rarity_code,
        rarity_mode: input.rarity_mode.clone(),
        substat_roll_bounds_v: input.substat_roll_bounds_v.clone(),
    });
    // Hard-prune impossible aggregate caps exactly like the TS path did.
    if !preflight.aggregate_feasible_by_caps {
        return Ok(ExecuteHsfBuilderRuntimeOut {
            rules: Vec::<RuleRaw>::new(),
            limit_hit: false,
        });
    }

    // Late+Auto supplement tiers are expanded in Rust for deterministic ordering.
    let rarity_branches = build_hsf_rarity_branches_core(&BuildHsfRarityBranchesIn {
        rarity_mode: input.rarity_mode.clone(),
        early_keep_mode: input.early_keep_mode.clone(),
        auto_rarity_supplements_threshold: input.auto_rarity_supplements_threshold.clone(),
        rarity_code: input.rarity_code,
    })
    .into_iter()
    .map(|entry| ExecuteHsfBuilderBranchIn {
        code: entry.code,
        restrict_levels: entry.restrict_levels,
    })
    .collect::<Vec<_>>();
    // Preflight circled flags toggle strict vs potential mode.
    let effective_mode = if preflight.has_circled {
        "potential".to_string()
    } else {
        "strict".to_string()
    };
    execute_hsf_builder_runtime_core(&ExecuteHsfBuilderRuntimeIn {
        rarity_branches,
        baseline: input.baseline.clone(),
        effective_start: input.effective_start,
        suppress_roll_thresholds: input.suppress_roll_thresholds,
        level_window_min: input.level_window_min,
        level_window_max: input.level_window_max,
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
        effective_mode,
        early_mode: input.early_mode.clone(),
        emission_limit,
    })
}

// One-call wrapper runs preflight + branch orchestration + presence emission.
pub(crate) fn build_hsf_rules_runtime_value(payload: JsValue) -> Result<JsValue, JsValue> {
    let input: BuildHsfRulesRuntimeIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid build-hsf-rules-runtime payload: {error}")))?;
    let out = build_hsf_rules_runtime_core(&input)?;
    to_js_value(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize build-hsf-rules-runtime output: {error}")))
}
