use std::collections::{BTreeMap, HashSet};

use serde::{Deserialize, Serialize};
// ts-rs auto-generates TS interfaces for PrepareHsfBuilderRecipeOut /
// PrepareHsfBuilderTargetEntryOut so BTreeMap-bearing output structs stay in lockstep
// with their TS consumers.  See matcher_evaluator.rs for full context.
use ts_rs::TS;



// Per-variant target quantization + the display -> HSF wire conversion, both of
// which key off the stat's wire scale (1 classic, 100 anomalous).
use crate::generated_domain_constants::hsf_value_scale_for_variant;
use crate::hsf_builder_core::{scale_to_wire_units, to_hsf_wire_value};
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
use crate::safeguards::safeguard_variant_to_sub;
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

// Build the RuleSubRaw entries for "not" substats once per runtime call.
fn build_not_substat_entries(not_substats_v: &[i32]) -> Vec<RuleSubRaw> {
    not_substats_v.iter().map(|&variant| {
        let (sub_id, sub_is_flat) = safeguard_variant_to_sub(variant as i64);
        RuleSubRaw {
            ID: Some(sub_id),
            Value: Some(0.0),
            IsFlat: Some(sub_is_flat),
            NotAvailable: Some(false),
            Condition: Some(std::sync::Arc::from("¬")),
        }
    }).collect()
}

// Place "not" substat entries into a rule by replacing wildcard slots (ID == -1).
// HSF rules have exactly 4 substat slots; appending beyond that produces invalid
// rules that RSL Helper ignores. Each ¬ entry consumes one wildcard slot in-order.
fn append_not_substats(rule: &mut RuleRaw, entries: &[RuleSubRaw]) {
    if entries.is_empty() {
        return;
    }
    let substats = rule.Substats.get_or_insert_with(Vec::new);
    for entry in entries {
        // Replace the first remaining wildcard slot so the total stays at ≤ 4.
        if let Some(pos) = substats.iter().position(|s| s.ID.unwrap_or(-1) == -1) {
            substats[pos] = entry.clone();
        }
        // No wildcard available — the rule is already at capacity; skip silently.
    }
}

// Builder prep payload moves selected/fixed pool normalization and base-target map
// preparation out of hsfBuilder.ts so TS no longer loops large variant sets.
//
// ts-rs export: top-level JSON-string input for prepare_hsf_builder_recipe_value.
// Composes BuildHsfComboBoundsIn + BuildHsfComboTargetEntryIn (both derived in core).
// Fields promoted from pub(crate) to `pub` so ts-rs can export them.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct PrepareHsfBuilderRecipeIn {
    pub min_count: i64,
    pub auto_substat_flex: bool,
    pub flex_eligible: bool,
    #[serde(default)]
    pub substats_v: Vec<i64>,
    #[serde(default)]
    pub fixed_substats_v: Vec<i64>,
    #[serde(default)]
    pub allowed_substats: Vec<i64>,
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    pub substat_roll_bounds_v: BTreeMap<i64, BuildHsfComboBoundsIn>,
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    pub substat_roll_targets_v: BTreeMap<i64, BuildHsfComboTargetEntryIn>,
    // f64 values: anomalous mode-damage targets are fractional (1.25 at rank 5).
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    pub substat_target_by_variant: BTreeMap<i64, f64>,
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    pub factory_base_by_variant_for_star: BTreeMap<i64, f64>,
    #[serde(default)]
    pub variant_priority: Vec<i64>,
}

// Output carries normalized pools and per-variant maps consumed by branch runtime.
//
// ts-rs export: BTreeMap representative.  Each BTreeMap<i64, T> uses
// `serialize_with = "crate::serialize_i64_key_map"` so the on-wire shape is a plain
// JS object keyed by stringified i64.  With `TS_RS_LARGE_INT=number` (set in the
// build script), ts-rs emits BTreeMap<i64, V> as `{ [key in number]: V }` — JS index
// access coerces between number/string keys so this matches the wire shape.
// Wire names are short (1-3 chars) for compact payload crossing the WASM boundary.
#[derive(Debug, Serialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct PrepareHsfBuilderRecipeOut {
    #[serde(rename = "sp")]
    #[ts(rename = "sp")]
    pub selected_pool_v: Vec<i32>,
    #[serde(rename = "rv")]
    #[ts(rename = "rv")]
    pub required_v: Vec<i32>,
    #[serde(rename = "op")]
    #[ts(rename = "op")]
    pub optional_pool_v: Vec<i32>,
    #[serde(rename = "mn")]
    #[ts(rename = "mn")]
    pub min_target_count: i32,
    #[serde(rename = "mx")]
    #[ts(rename = "mx")]
    pub max_target_count: i32,
    #[serde(rename = "ms")]
    #[ts(rename = "ms")]
    pub max_selectable_count: i32,
    #[serde(rename = "hrs")]
    #[ts(rename = "hrs")]
    pub had_requested_substats: bool,
    #[serde(rename = "hps")]
    #[ts(rename = "hps")]
    pub has_per_stat_min: bool,
    // serialize_with stringifies i64 keys so wasm_to_js can emit plain JS objects.
    #[serde(rename = "cbv", serialize_with = "crate::serialize_i64_key_map")]
    #[ts(rename = "cbv")]
    pub current_base_by_variant: BTreeMap<i64, i32>,
    #[serde(rename = "fbv", serialize_with = "crate::serialize_i64_key_map")]
    #[ts(rename = "fbv")]
    pub factory_base_by_variant: BTreeMap<i64, Option<i32>>,
    #[serde(rename = "tbv", serialize_with = "crate::serialize_i64_key_map")]
    #[ts(rename = "tbv")]
    pub target_base_override_by_variant: BTreeMap<i64, Option<i32>>,
    #[serde(rename = "tev", serialize_with = "crate::serialize_i64_key_map")]
    #[ts(rename = "tev")]
    pub target_entries_by_variant: BTreeMap<i64, PrepareHsfBuilderTargetEntryOut>,
}

// Output target-entry payload mirrors the runtime input entry schema.
// We keep this local so serialization does not depend on internal input-only types.
// ts-rs: referenced by name from PrepareHsfBuilderRecipeOut.tev.
#[derive(Debug, Serialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct PrepareHsfBuilderTargetEntryOut {
    #[serde(rename = "b")]
    #[ts(rename = "b")]
    pub base: Option<f64>,
    #[serde(rename = "inc")]
    #[ts(rename = "inc")]
    pub increments: Option<Vec<Option<f64>>>,
}

// Snap a target override to the stat's expressible resolution, in DISPLAY units.
// The resolution is 1/scale — whole numbers for classic stats, hundredths for the
// anomalous ones HSF stores in hundredths of a percent — so anything finer could
// not survive export. Mirrors quantizeTargetValueForVariant in
// src/lib/hsfBuilder/targets.ts. Values stay in display units here; the single
// conversion to wire units happens later, in to_hsf_wire_value.
fn normalize_target_override_value(value: Option<f64>, variant: i64) -> Option<f64> {
    let numeric = value?;
    if !numeric.is_finite() {
        return None;
    }
    let scale = hsf_value_scale_for_variant(variant);
    Some(scale_to_wire_units(numeric, variant).round() / scale)
}

// Priority-sort helper mirrors compareVariants by using caller-provided order and
// falling back to raw numeric value when a variant is outside that priority list.
fn sort_variants_by_priority(values: &mut [i64], variant_priority: &[i64]) {
    let mut order = BTreeMap::<i64, usize>::new();
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
    let mut current_base_by_variant = BTreeMap::<i64, i32>::new();
    let mut factory_base_by_variant = BTreeMap::<i64, Option<i32>>::new();
    let mut target_base_override_by_variant = BTreeMap::<i64, Option<i32>>::new();
    let mut target_entries_by_variant = BTreeMap::<i64, PrepareHsfBuilderTargetEntryOut>::new();
    for variant in &selected_pool_v {
        // Display -> WIRE units at this i32 boundary: everything downstream (base_vals,
        // target overrides, emit_hsf_target_value's factory arithmetic) works in the
        // stat's wire unit, so an anomalous 1.25 rides through as 125 and lands in the
        // emitted rule exactly. Classic stats scale by 1, so their values are unchanged.
        let current_base = to_hsf_wire_value(
            input.substat_target_by_variant.get(variant).copied().unwrap_or(0.0),
            *variant,
        );
        current_base_by_variant.insert(*variant, current_base);
        factory_base_by_variant.insert(
            *variant,
            input
                .factory_base_by_variant_for_star
                .get(variant)
                .copied()
                .map(|value| to_hsf_wire_value(value, *variant)),
        );
        let maybe_target = input.substat_roll_targets_v.get(variant).cloned();
        let Some(target_entry) = maybe_target else {
            target_base_override_by_variant.insert(*variant, None);
            continue;
        };
        let normalized_base = normalize_target_override_value(target_entry.base, *variant);
        // The override map feeds the emitter directly, so it carries wire units too.
        let normalized_base_wire = normalized_base.map(|value| to_hsf_wire_value(value, *variant));
        target_base_override_by_variant.insert(*variant, normalized_base_wire);
        let mut normalized_increments = target_entry
            .increments
            .unwrap_or_default()
            .into_iter()
            .map(|entry| normalize_target_override_value(entry, *variant))
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

// Core prepare function returns typed Rust struct; wasm crate wraps with serde_wasm_bindgen.
pub fn prepare_hsf_builder_recipe_core_fn(input: &PrepareHsfBuilderRecipeIn) -> PrepareHsfBuilderRecipeOut {
    prepare_hsf_builder_recipe_core(input)
}


// Branch descriptor mirrors TS rarity branch objects for one-call runtime.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExecuteHsfBuilderBranchIn {
    code: i64,
    #[serde(default)]
    restrict_levels: Option<Vec<i64>>,
}

// Builder runtime payload collapses all branch orchestration into one input.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
    substat_roll_bounds_v: BTreeMap<i64, BuildHsfComboBoundsIn>,
    target_entries_by_variant: BTreeMap<i64, BuildHsfComboTargetEntryIn>,
    current_base_by_variant: BTreeMap<i64, i32>,
    factory_base_by_variant: BTreeMap<i64, Option<i32>>,
    target_base_override_by_variant: BTreeMap<i64, Option<i32>>,
    base_rule: RuleRaw,
    main_choices: Vec<EmitHsfMainChoiceIn>,
    emit_any_main_when_no_choices: bool,
    effective_mode: String,
    early_mode: String,
    #[serde(default)]
    emission_limit: Option<i64>,
}

// Builder runtime output carries rules plus a hard-limit signal for TS parity.
//
// ts-rs export: composes RuleRaw (PascalCase shape; derived in lib.rs).
// Fields are `pub` (was pub(crate)) so ts-rs can export them.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ExecuteHsfBuilderRuntimeOut {
    pub rules: Vec<RuleRaw>,
    pub limit_hit: bool,
}

// High-level runtime payload lets TS issue one wasm call after prep.
// Rust then runs preflight, rarity-branch planning, and final execution.
//
// ts-rs export: top-level JSON-string input for build_hsf_rules_runtime_value.
// Composes EmitHsfMainChoiceIn, BuildHsfComboBoundsIn, BuildHsfComboTargetEntryIn.
// Fields promoted from pub(crate) to `pub` so ts-rs can export them.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct BuildHsfRulesRuntimeIn {
    pub recipe_id: Option<i64>,
    pub keep: Option<bool>,
    pub use_flag: bool,
    #[serde(default)]
    pub artifact_set_ids: Vec<i64>,
    #[serde(default)]
    pub artifact_type_ids: Vec<i64>,
    pub rank_code: i64,
    pub rarity_code: i64,
    pub faction_code: i64,
    #[serde(default)]
    pub main_choices: Vec<EmitHsfMainChoiceIn>,
    pub emit_any_main_when_no_choices: bool,
    pub baseline: Option<String>,
    pub effective_start: i64,
    pub suppress_roll_thresholds: bool,
    pub level_window_min: i64,
    pub level_window_max: i64,
    pub required_v: Vec<i32>,
    pub optional_pool_v: Vec<i32>,
    pub selected_pool_v: Vec<i32>,
    // Substats that must be absent from the item (Condition "¬"). Always appended to every rule.
    #[serde(default)]
    pub not_substats_v: Vec<i32>,
    pub flex_active: bool,
    pub aggregate_min_active: bool,
    pub min_target_count: i32,
    pub max_target_count: i32,
    pub aggregate_targets_locked: bool,
    pub aggregate_min_value: i32,
    pub locked_min_active: bool,
    pub locked_min_value: i32,
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    pub substat_roll_bounds_v: BTreeMap<i64, BuildHsfComboBoundsIn>,
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    pub target_entries_by_variant: BTreeMap<i64, BuildHsfComboTargetEntryIn>,
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    pub current_base_by_variant: BTreeMap<i64, i32>,
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    pub factory_base_by_variant: BTreeMap<i64, Option<i32>>,
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map")]
    pub target_base_override_by_variant: BTreeMap<i64, Option<i32>>,
    pub rarity_mode: Option<String>,
    pub early_keep_mode: Option<String>,
    pub auto_rarity_supplements_threshold: Option<String>,
    pub early_mode: String,
    #[serde(default)]
    pub emission_limit: Option<i64>,
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

// Keep set/type arrays normalized so ordering does not affect dedupe keys.
fn canonical_sorted_numeric(values: Option<&Vec<i64>>) -> Vec<i64> {
    let mut normalized = values.cloned().unwrap_or_default();
    normalized.sort_unstable();
    normalized
}


// Substat tuples mirror TS key dimensions while avoiding string concatenation.
fn rule_substats_signature_key(substats: Option<&Vec<RuleSubRaw>>) -> Vec<BuilderSubstatSignatureKey> {
    substats
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|entry| BuilderSubstatSignatureKey {
            id: entry.ID.unwrap_or(STAT_ID_ANY),
            flat_true: entry.IsFlat.unwrap_or(false),
            condition: entry.Condition.as_deref().unwrap_or_default().to_owned(),
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
        // MainStatF is now Option<i64>; cast to f64 for bit-stable signature comparison.
        main_f_bits: normalize_f64_bits(rule.MainStatF.map_or(1.0, |v| v as f64)),
        level: rule.LVLForCheck.unwrap_or(LEVEL_ANY_SENTINEL),
        sets: canonical_sorted_numeric(rule.ArtifactSet.as_ref()),
        types: canonical_sorted_numeric(rule.ArtifactType.as_ref()),
        substats: rule_substats_signature_key(rule.Substats.as_ref()),
    }
}

// Runtime core executes all branches and preserves TS-level dedupe/order rules.
fn execute_hsf_builder_runtime_core(input: &ExecuteHsfBuilderRuntimeIn) -> Result<ExecuteHsfBuilderRuntimeOut, String> {
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
        .map_err(|error| format!("Failed to finalize builder runtime rows: {error}"))?;
    Ok(ExecuteHsfBuilderRuntimeOut {
        rules: finalized,
        limit_hit: false,
    })
}

// Full builder runtime core (post-prep) keeps one-call orchestration in Rust.
fn build_hsf_rules_runtime_core(input: &BuildHsfRulesRuntimeIn) -> Result<ExecuteHsfBuilderRuntimeOut, String> {
    // Build selector-only base rule once for both presence and branch runtime.
    let base_rule = build_hsf_rules_base_rule(input);
    // Normalize positive limits once; non-positive values mean "no limit".
    let emission_limit = input.emission_limit.filter(|value| *value > 0);

    // Pre-build "not" substat entries once so every rule can clone them cheaply.
    let not_substat_entries: Vec<RuleSubRaw> = build_not_substat_entries(&input.not_substats_v);

    // Enforce the 4-slot budget: "not" substats occupy wildcard slots.
    // If "not" entries alone overflow 4 slots, no rule can be expressed.
    let not_count = not_substat_entries.len();
    if not_count > HSF_SUBSTAT_SLOT_COUNT {
        return Ok(ExecuteHsfBuilderRuntimeOut { rules: vec![], limit_hit: false });
    }
    let available_positive_slots = (HSF_SUBSTAT_SLOT_COUNT - not_count) as i32;
    // If the minimum required positives can't fit alongside "not" substats, emit 0 rules.
    if !input.selected_pool_v.is_empty() && input.min_target_count > available_positive_slots {
        return Ok(ExecuteHsfBuilderRuntimeOut { rules: vec![], limit_hit: false });
    }
    // Cap max_target_count to prevent flex combos from consuming "not" substat slots.
    let effective_max_target_count = input.max_target_count.min(available_positive_slots);

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
        for mut rule in emitted {
            append_not_substats(&mut rule, &not_substat_entries);
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
            .map_err(|error| format!("Failed to finalize presence-only builder rows: {error}"))?;
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
        max_target_count: effective_max_target_count,
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
    let mut result = execute_hsf_builder_runtime_core(&ExecuteHsfBuilderRuntimeIn {
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
        max_target_count: effective_max_target_count,
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
    })?;
    // Append "not" substats (Condition "¬") to every generated rule.
    if !not_substat_entries.is_empty() {
        for rule in &mut result.rules {
            append_not_substats(rule, &not_substat_entries);
        }
    }
    Ok(result)
}

// Exposed for wasm crate: run the full runtime from a typed input.
pub fn build_hsf_rules_runtime_core_fn(input: &BuildHsfRulesRuntimeIn) -> Result<ExecuteHsfBuilderRuntimeOut, String> {
    build_hsf_rules_runtime_core(input)
}

