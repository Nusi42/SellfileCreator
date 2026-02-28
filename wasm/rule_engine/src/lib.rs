use std::cmp::Ordering;
use std::cell::RefCell;
use std::collections::{BTreeSet, HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_wasm_bindgen::{from_value as from_js_value, to_value as to_js_value};
use wasm_bindgen::prelude::*;

// Shared domain constants are generated from shared/domain-constants.json.
// This keeps TS and Rust sentinel/enum values synchronized automatically.
mod generated_domain_constants;
mod auto_rarity_runtime;
mod hsf_branch_execution;
mod hsf_builder_execution;
mod hsf_combo_runtime;
mod hsf_distribution_runtime;
mod hsf_full_selected_fallback;
mod hsf_intro_execution;
mod hsf_intro_mode_plan;
mod hsf_level_combo_execution;
mod safeguards;
mod matcher_evaluator;
mod rule_dedupe;
mod rule_postprocess;
use generated_domain_constants::*;
use safeguards::{
    safeguard_group_key_from_parts,
    safeguard_hash_combination,
    safeguard_normalize_set_selections,
    safeguard_normalize_substat_match,
    safeguard_parse_collect_rows_payload,
    safeguard_resolve_count_mode,
    safeguard_variant_to_sub,
    SafeguardWasmArtifactIn,
    SafeguardWasmMetasetIn,
    SafeguardWasmResolvedRuleOut,
    SafeguardWasmRuleIn,
    SafeguardWasmSetSelection,
    SafeguardWasmSnapshotOut,
};
pub(crate) use matcher_evaluator::{
    collect_safeguard_candidates_core,
    evaluate_item,
    prepare_evaluate_options,
    prepare_rule,
    EvaluateItemResult,
    EvaluateOptionsRaw,
    SafeguardCandidateResolveBaseMatchIn,
    SafeguardCollectRowIn,
    SafeguardCollectedCandidateOut,
    PreparedRule,
};

const RULE_SOURCE_HSF: &str = "hsf";
const RULE_SOURCE_SFR: &str = "sfr";
const RULE_SOURCE_FINAL_SELL: &str = "finalSell";
const RULE_SOURCE_SAFEGUARDS: &str = "safeguards";
const FINAL_SELL_SETS_MODE_ANY: &str = "any";
const FINAL_SELL_SETS_MODE_EXPLICIT: &str = "explicit";
const RULE_FIELD_UNSET_SENTINEL: i64 = STAT_ID_ANY;
const FILTER_OPTION_NONE_I32: i32 = STAT_ID_ANY as i32;
const MAIN_STAT_F_DEFAULT_FLAG: i64 = 1;
const MAIN_STAT_F_DEFAULT_STR: &str = "1";
const HSF_SUBSTAT_SLOT_COUNT: usize = 4;
const LEVEL_ORDER_INDEX_0: i64 = 0;
const LEVEL_ORDER_INDEX_4: i64 = 1;
const LEVEL_ORDER_INDEX_8: i64 = 2;
const LEVEL_ORDER_INDEX_12: i64 = 3;
const LEVEL_ORDER_INDEX_16: i64 = 4;
const LEVEL_ORDER_INDEX_ANY: i64 = 5;
const LEVEL_ORDER_FALLBACK_OFFSET: i64 = 6;
const ARTIFACT_TYPE_ORDER_FALLBACK_OFFSET: i64 = 100;
const JS_MAX_SAFE_INTEGER_I64: i64 = 9_007_199_254_740_991;

// Rank/rarity masks operate on the generated shared rank range (1..6).
const RANK_RARITY_FULL_MASK: u8 = 0b11_1111;

// The worker configures one ruleset, then evaluates many item batches.
// Store the prepared state in-thread for fast repeated lookups.
thread_local! {
    static ENGINE_STATE: RefCell<Option<EngineState>> = const { RefCell::new(None) };
}

// Raw rule shape mirrors the subset consumed by matchRule/evaluate.
// Keep fields optional because exports may omit values for "Any".
#[derive(Debug, Deserialize, Serialize, Clone)]
#[allow(non_snake_case)]
struct RuleRaw {
    RecipeID: Option<i64>,
    RecipeName: Option<String>,
    Keep: Option<bool>,
    IsRuleTypeAND: Option<bool>,
    Use: Option<bool>,
    ArtifactSet: Option<Vec<i64>>,
    ArtifactType: Option<Vec<i64>>,
    Rank: Option<i64>,
    Rarity: Option<i64>,
    MainStatID: Option<i64>,
    MainStatF: Option<serde_json::Value>,
    LVLForCheck: Option<i64>,
    Faction: Option<i64>,
    Substats: Option<Vec<RuleSubRaw>>,
    #[serde(default, rename = "__source")]
    source: Option<String>,
    #[serde(default, rename = "__lineIdx")]
    line_idx: Option<i64>,
    #[serde(default, rename = "__allKnownSets")]
    all_known_sets: Option<bool>,
    #[serde(default, rename = "__rankMask")]
    rank_mask: Option<i64>,
    #[serde(default, rename = "__rarityMask")]
    rarity_mask: Option<i64>,
    #[serde(default, rename = "__safeguardRuleId")]
    safeguard_rule_id: Option<String>,
    #[serde(default, rename = "__safeguardRuleOrdinal")]
    safeguard_rule_ordinal: Option<i64>,
    #[serde(default, rename = "__safeguardHash")]
    safeguard_hash: Option<String>,
    #[serde(default, rename = "__safeguardRequired")]
    safeguard_required: Option<i64>,
    #[serde(default, rename = "__safeguardScanMs")]
    safeguard_scan_ms: Option<f64>,
    #[serde(default, rename = "__safeguardProjected")]
    safeguard_projected: Option<i64>,
    #[serde(default, rename = "__safeguardDeficit")]
    safeguard_deficit: Option<i64>,
    #[serde(default, rename = "__safeguardItemKey")]
    safeguard_item_key: Option<i64>,
    #[serde(default, rename = "__safeguardPlaceholder")]
    safeguard_placeholder: Option<bool>,
    #[serde(default, rename = "__safeguardPlaceholderMissing")]
    safeguard_placeholder_missing: Option<i64>,
}

// Substat row shape follows the HSF payload fields.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[allow(non_snake_case)]
struct RuleSubRaw {
    ID: Option<i64>,
    Value: Option<f64>,
    IsFlat: Option<serde_json::Value>,
    NotAvailable: Option<bool>,
    Condition: Option<String>,
}

// Top-level item payload passed from worker evaluate calls.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EvaluateItemRaw {
    item_id: i64,
    item: TestItemRaw,
}

// TestItem mirrors src/lib/ruleEval.ts fields used for matching.
// All optional fields remain optional for backward compatibility.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TestItemRaw {
    slot: i64,
    set: i64,
    rank: i64,
    rarity: i64,
    level: i64,
    faction: Option<i64>,
    main: Option<i64>,
    // Keys are parsed to i64 once at deserialize-time to avoid hot-loop coercion.
    #[serde(default, deserialize_with = "deserialize_sub_values_map")]
    sub_values: Option<HashMap<i64, f64>>,
    item_id: Option<i64>,
    preview_extras: Option<PreviewExtrasRaw>,
}

// previewExtras carries the fallback ID used by safeguard bindings.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PreviewExtrasRaw {
    id: Option<i64>,
}

// Deserialize `subValues` from JS object keys into numeric variant ids.
pub(crate) fn deserialize_sub_values_map<'de, D>(
    deserializer: D,
) -> Result<Option<HashMap<i64, f64>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    // Keep accepting null/undefined maps from older payloads.
    deserialize_optional_i64_key_map(deserializer)
}

// Deserialize object-keyed maps into numeric-variant maps once at the boundary.
// Invalid keys are skipped so malformed entries remain non-fatal by design.
pub(crate) fn deserialize_i64_key_map<'de, D, V>(
    deserializer: D,
) -> Result<HashMap<i64, V>, D::Error>
where
    D: serde::Deserializer<'de>,
    V: Deserialize<'de>,
{
    let raw = HashMap::<String, V>::deserialize(deserializer)?;
    Ok(raw
        .into_iter()
        .filter_map(|(key, value)| key.parse::<i64>().ok().map(|variant| (variant, value)))
        .collect::<HashMap<i64, V>>())
}

// Optional-map variant keeps legacy `null`/`undefined` payloads compatible.
pub(crate) fn deserialize_optional_i64_key_map<'de, D, V>(
    deserializer: D,
) -> Result<Option<HashMap<i64, V>>, D::Error>
where
    D: serde::Deserializer<'de>,
    V: Deserialize<'de>,
{
    let raw = Option::<HashMap<String, V>>::deserialize(deserializer)?;
    Ok(raw.map(|entries| {
        entries
            .into_iter()
            .filter_map(|(key, value)| key.parse::<i64>().ok().map(|variant| (variant, value)))
            .collect::<HashMap<i64, V>>()
    }))
}

// Combined safeguard payload lets TS request candidate collection + detection
// in one wasm call while preserving both legacy output shapes.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SafeguardCollectedAndProtectedSnapshotOut {
    candidates: Vec<SafeguardCollectedCandidateOut>,
    unique_item_keys: Vec<i64>,
    detection: SafeguardWasmSnapshotOut,
}

// Obsolete-report payload mirrors src/lib/hsfObsolete.ts return shape.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ObsoleteEntryOut {
    index: usize,
    covered_by: usize,
    reason: String,
}

// Obsolete report root keeps the same top-level property name.
#[derive(Debug, Serialize)]
struct ObsoleteReportOut {
    obsolete: Vec<ObsoleteEntryOut>,
}

// Branch metadata mirrors merge.ts generated-entry shape.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedRuleEntryIn {
    rule: RuleRaw,
    branch_order: i64,
    branch_seq: i64,
    original_idx: i64,
}

// Builder finalize payload carries per-rule emission ordering metadata.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BuilderFinalizeEmissionMetaIn {
    pub(crate) level_idx: i64,
    pub(crate) branch_idx: i64,
    pub(crate) seq: i64,
}

// Keep emitted metadata paired with each rule while pruning/sorting in wasm.
#[derive(Debug)]
struct BuilderFinalizeEntry {
    rule: RuleRaw,
    meta: BuilderFinalizeEmissionMetaIn,
    original_idx: usize,
}

// Final-sell remainder recipe mirrors src/lib/logicHub.ts payload shape.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FinalSellRemainderIn {
    artifacts: bool,
    accessories: bool,
    #[serde(default)]
    levels: Vec<i64>,
    #[serde(default)]
    sets_mode: Option<String>,
}

// Merged-rule payload keeps orchestration inputs compact for one wasm call.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ComputeMergedRulesIn {
    #[serde(default)]
    base_rules: Vec<RuleRaw>,
    #[serde(default)]
    custom_rules: Vec<RuleRaw>,
    final_sell_remainder: Option<FinalSellRemainderIn>,
    #[serde(default)]
    all_known_set_ids: Vec<i64>,
    #[serde(default)]
    omit_disabled_before_safeguards: bool,
    #[serde(default)]
    dedupe_before_safeguards: bool,
    #[serde(default)]
    safeguard_enabled: bool,
    #[serde(default)]
    safeguard_rules: Vec<SafeguardWasmRuleIn>,
    safeguard_detection: Option<SafeguardWasmSnapshotOut>,
    #[serde(default)]
    safeguard_recipe_id_base: Option<i64>,
}

// Auto-rarity bounds mirror BuilderRecipe.substatRollBoundsV row shape.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AutoRarityResolveRollBoundsIn {
    min: Option<f64>,
}

// Auto-rarity payload keeps only fields consumed by resolveAutoRarityCode.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AutoRarityResolveIn {
    #[serde(default)]
    auto_rarity_supplements_threshold: Option<String>,
    #[serde(default)]
    auto_min_required_rolls: Option<bool>,
    #[serde(default)]
    min_required_rolls: Option<f64>,
    #[serde(default)]
    locked_min_required_rolls: Option<f64>,
    #[serde(default)]
    min_count: Option<f64>,
    #[serde(default)]
    early_keep_mode: Option<String>,
    #[serde(default)]
    selected_pool_v: Vec<i64>,
    #[serde(default)]
    fixed_pool_v: Vec<i64>,
    #[serde(default, deserialize_with = "deserialize_i64_key_map")]
    substat_roll_bounds_v: HashMap<i64, AutoRarityResolveRollBoundsIn>,
}

// Builder-facing auto-rarity payload accepts raw recipe vectors plus allowed ids.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AutoRarityResolveBuilderIn {
    #[serde(default)]
    auto_rarity_supplements_threshold: Option<String>,
    #[serde(default)]
    auto_min_required_rolls: Option<bool>,
    #[serde(default)]
    min_required_rolls: Option<f64>,
    #[serde(default)]
    locked_min_required_rolls: Option<f64>,
    #[serde(default)]
    min_count: Option<f64>,
    #[serde(default)]
    early_keep_mode: Option<String>,
    #[serde(default)]
    substats_v: Vec<i64>,
    #[serde(default)]
    fixed_substats_v: Vec<i64>,
    #[serde(default, deserialize_with = "deserialize_i64_key_map")]
    substat_roll_bounds_v: HashMap<i64, AutoRarityResolveRollBoundsIn>,
    #[serde(default)]
    allowed_substats: Vec<i64>,
}

// Sort payload stores computed keys so comparator work stays branch-light.
#[derive(Debug)]
struct SafeguardMergeSortEntry {
    rule: RuleRaw,
    idx: usize,
    level_idx: i64,
    rule_ordinal: i64,
    placeholder_rank: i64,
    item_key: i64,
    canonical: rule_dedupe::CollapseCanonicalKey,
}

// Internal carry type keeps branch ordering attached through finalization.
#[derive(Debug, Clone)]
struct GeneratedRuleEntry {
    rule: RuleRaw,
    branch_order: i64,
    branch_seq: i64,
    original_idx: i64,
}


// Stateful engine keeps prepared rules + mode gating table.
struct EngineState {
    rules: Vec<PreparedRule>,
    recipe_modes: Vec<String>,
}

// Normalize unknown rank/rarity values into supported 1..6 domain.
fn clamp_rank_or_rarity(value: i64) -> i64 {
    if value <= RANK_VALUE_MIN {
        return RANK_VALUE_MIN;
    }
    if value >= RANK_VALUE_MAX {
        return RANK_VALUE_MAX;
    }
    value
}

// Rank/rarity bit helper keeps the mask check branchless in matcher loops.
fn bit_for_rank_or_rarity(value: i64) -> u8 {
    let clamped = clamp_rank_or_rarity(value);
    1u8 << ((clamped - 1) as u8)
}

// HSF rank code conversion copied from src/lib/hsfTypes.ts.
fn rank_mask(code: i64) -> u8 {
    if code == 0 {
        return RANK_RARITY_FULL_MASK;
    }
    if (1..=6).contains(&code) {
        return 1u8 << ((code - 1) as u8);
    }
    if (7..=11).contains(&code) {
        let min = code - 6;
        return rank_range_mask(min, 6);
    }
    if (12..=16).contains(&code) {
        let max = code - 10;
        return rank_range_mask(1, max);
    }
    RANK_RARITY_FULL_MASK
}

// Shared range-mask helper for rank/rarity HSF code branches.
fn rank_range_mask(min: i64, max: i64) -> u8 {
    let lo = min.clamp(1, 6);
    let hi = max.clamp(lo, 6);
    let mut mask = 0u8;
    let mut value = lo;
    while value <= hi {
        mask |= 1u8 << ((value - 1) as u8);
        value += 1;
    }
    mask
}

// HSF rarity code conversion copied from src/lib/hsfTypes.ts.
fn rarity_mask(code: i64) -> u8 {
    match code {
        0 | 6 | 14 => RANK_RARITY_FULL_MASK,
        1..=5 => 1u8 << ((code - 1) as u8),
        15 => 1u8 << 5,
        7 => rank_range_mask(2, 6),
        8 => rank_range_mask(3, 6),
        9 => rank_range_mask(4, 6),
        16 => rank_range_mask(5, 6),
        10 => rank_range_mask(1, 2),
        11 => rank_range_mask(1, 3),
        12 => rank_range_mask(1, 4),
        13 => rank_range_mask(1, 5),
        _ => RANK_RARITY_FULL_MASK,
    }
}

// Roll schedule mask uses bit positions [4, 8, 12, 16].
fn auto_rarity_roll_mask_for_code(rarity_code: i64) -> i64 {
    auto_rarity_runtime::auto_rarity_roll_mask_for_code(rarity_code)
}

// Addition schedule mask uses bit positions [4, 8, 12, 16].
fn auto_rarity_addition_mask_for_code(rarity_code: i64) -> i64 {
    auto_rarity_runtime::auto_rarity_addition_mask_for_code(rarity_code)
}

// Mythical pre-roll membership comes from the shared auto-rarity table.
fn auto_rarity_includes_mythical(rarity_code: i64) -> bool {
    auto_rarity_runtime::auto_rarity_includes_mythical(rarity_code)
}

// Count helper keeps roll-target math readable in all auto-rarity consumers.
fn auto_rarity_count_levels_up_to_mask(mask: i64, ceiling: i64) -> i64 {
    auto_rarity_runtime::auto_rarity_count_levels_up_to_mask(mask, ceiling)
}

// Expose roll-level milestones so TS can reuse Rust schedule decoding directly.
#[wasm_bindgen]
pub fn auto_rarity_roll_levels_for_code_value(rarity_code: i32) -> Vec<i32> {
    auto_rarity_runtime::auto_rarity_roll_levels_for_code_value(rarity_code)
}

// Expose addition-level milestones so TS does not duplicate mask decoding.
#[wasm_bindgen]
pub fn auto_rarity_addition_levels_for_code_value(rarity_code: i32) -> Vec<i32> {
    auto_rarity_runtime::auto_rarity_addition_levels_for_code_value(rarity_code)
}

// Expose mythical-membership checks for schedule/UI helpers on the TS side.
#[wasm_bindgen]
pub fn auto_rarity_includes_mythical_for_code_value(rarity_code: i32) -> bool {
    auto_rarity_runtime::auto_rarity_includes_mythical_for_code_value(rarity_code)
}

// Builder-facing auto-rarity resolver compacts selected/fixed/bounds in Rust.
#[wasm_bindgen]
pub fn resolve_auto_rarity_code_for_builder_value(payload: JsValue) -> Result<i32, JsValue> {
    auto_rarity_runtime::resolve_auto_rarity_code_for_builder_value(payload)
}


// Input for builder rarity-branch expansion (Late+Auto supplement tiers).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfRarityBranchesIn {
    rarity_mode: Option<String>,
    early_keep_mode: Option<String>,
    auto_rarity_supplements_threshold: Option<String>,
    rarity_code: i64,
}

// Output row describing one branch code and optional restricted levels.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfRarityBranchOut {
    code: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    restrict_levels: Option<Vec<i64>>,
}

// Input payload for branch-level milestone context expansion.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfLevelContextsIn {
    rarity_code: i64,
    baseline: Option<String>,
    effective_start: i64,
    suppress_roll_thresholds: bool,
    level_window_min: i64,
    level_window_max: i64,
    #[serde(default)]
    restrict_levels: Option<Vec<i64>>,
}

// Input payload for branch-level collapse profile derivation.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfBranchCollapseProfileIn {
    rarity_code: i64,
    baseline: Option<String>,
    effective_start: i64,
    aggregate_min_active: bool,
    aggregate_targets_locked: bool,
    aggregate_min_value: i64,
    addition_count: i64,
}

// Output payload carries collapse feasibility and branch roll timeline.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfBranchCollapseProfileOut {
    collapse_global_ok: bool,
    max_rolls_at_target: i64,
    roll_timeline: Vec<i64>,
}

// Output row with all per-level counters consumed by hsfBuilder inner loops.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfLevelContextOut {
    level: i64,
    rolls_up_to_start: i64,
    raw_rolls_for_this_level: i64,
    raw_rolls_by_target: i64,
    num_rolls_for_this_level: i64,
    num_rolls_by_target: i64,
    adds_so_far: i64,
    present: i64,
}

// Input payload for per-level selected-substat combo expansion.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfLevelCombosIn {
    required_v: Vec<i32>,
    optional_pool_v: Vec<i32>,
    flex_active: bool,
    aggregate_min_active: bool,
    num_rolls_for_this_level: i32,
    min_target_count: i32,
    max_target_count: i32,
    present: i32,
}

// Input payload for intro-assignment timeline-cap expansion.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfTimelineCapsIn {
    intro_assignments: Vec<Vec<i32>>,
    roll_timeline: Vec<i32>,
    baseline: Option<String>,
    effective_start: i32,
    level: i32,
    pre_rolls: i32,
    myth_pre_extra: i32,
}

// Input payload for per-level intro-assignment expansion.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfIntroAssignmentsForLevelIn {
    count: i32,
    base_slots: i32,
    required_count: i32,
    addition_timeline_all: Vec<i32>,
    level: i32,
}

// Per-variant roll-bound payload used for combo vector normalization.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BuildHsfComboBoundsIn {
    min: Option<f64>,
    max: Option<f64>,
    any: Option<bool>,
}

// Per-variant target override payload aligned to combo index order.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BuildHsfComboTargetEntryIn {
    base: Option<f64>,
    increments: Option<Vec<Option<f64>>>,
}

// Input payload for combo-invariant vector derivation in hsfBuilder.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfComboVectorsIn {
    combo: Vec<i32>,
    required_v: Vec<i32>,
    aggregate_targets_locked: bool,
    #[serde(deserialize_with = "deserialize_i64_key_map")]
    substat_roll_bounds_v: HashMap<i64, BuildHsfComboBoundsIn>,
    target_entries: Vec<Option<BuildHsfComboTargetEntryIn>>,
}

// Output payload with normalized vectors used across intro assignment loops.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BuildHsfComboVectorsOut {
    mins: Vec<i32>,
    max_caps: Vec<i32>,
    any_flags: Vec<u8>,
    optional_mask: Vec<u8>,
    locked_mask: Vec<u8>,
    targeted_mask: Vec<u8>,
    substats: Vec<EmitHsfSubstatIn>,
    target_bases: Vec<Option<i32>>,
    target_increments: Vec<Vec<Option<i32>>>,
    sum_min: i32,
    sum_locked_min: i32,
    any_min: bool,
    any_wildcard: bool,
    impossible_min_max: bool,
}

// Input payload for late-mode bounded candidate-row generation.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfLateBoundedRowsIn {
    mode: String,
    mins: Vec<i32>,
    max_caps: Vec<i32>,
    any_flags: Vec<u8>,
    targeted_mask: Vec<u8>,
    locked_mask: Vec<u8>,
    optional_mask: Vec<u8>,
    remaining: i32,
    avail: i32,
    sum_min: i32,
    global_min: i32,
    num_target: i32,
    locked_min_value: i32,
    locked_min_active: bool,
    min_target_count: i32,
}

// Input payload for combo-policy vector derivation used by hsfBuilder branches.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfComboPolicyVectorsIn {
    mins: Vec<i32>,
    any_flags: Vec<u8>,
    targeted_mask: Vec<u8>,
    optional_mask: Vec<u8>,
    combo_len: i32,
    min_target_count: i32,
    aggregate_targets_locked: bool,
    global_min: i32,
    others_count: i32,
    avail: i32,
}

// Output payload keeps aggregate sums and deficit vectors in one wasm result.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BuildHsfComboPolicyVectorsOut {
    sum_min_targeted: i32,
    min_non_target_now: i32,
    optional_rows_only_baseline: bool,
    deficit_floors: Vec<i32>,
    prefer_virtual_sink: bool,
}

// Output payload carries both base values and collapse eligibility.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfFactoryComboRowsOut {
    base_vals: Vec<i32>,
    factory_eligible: bool,
    substats: Vec<EmitHsfSubstatIn>,
}

// Input payload for builder preflight cap-feasibility and mode toggles.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfPreflightFlagsIn {
    selected_pool_v: Vec<i32>,
    required_v: Vec<i32>,
    optional_pool_v: Vec<i32>,
    max_target_count: i32,
    aggregate_min_active: bool,
    aggregate_min_value: i32,
    aggregate_targets_locked: bool,
    rarity_code: i64,
    rarity_mode: Option<String>,
    #[serde(deserialize_with = "deserialize_i64_key_map")]
    substat_roll_bounds_v: HashMap<i64, BuildHsfComboBoundsIn>,
}

// Output payload keeps preflight decisions in one rust-owned computation.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfPreflightFlagsOut {
    aggregate_feasible_by_caps: bool,
    has_circled: bool,
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
    let roll_mask = auto_rarity_roll_mask_for_code(input.rarity_code);
    let addition_mask = auto_rarity_addition_mask_for_code(input.rarity_code);
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
        // Present substat count clamps to the maximum four visible slots.
        let present = (base_start + adds_so_far).min(4);
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
    // Clamp all count domains to the HSF 0..4 substat space.
    let present = input.present.clamp(0, 4);
    let min_target_count = input.min_target_count.clamp(0, 4);
    let max_target_count = input.max_target_count.clamp(0, 4);
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
        let optional_combos = hsf_distribution_runtime::compute_combinations_i32(
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
    hsf_distribution_runtime::compute_intro_assignments_for_combo(
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
            .clamp(0, 5);
        // Cap per-substat max at 4; absent values remain sentinel -1.
        let max_cap = bounds
            .and_then(|entry| entry.max)
            .filter(|value| value.is_finite())
            .map(|value| value.floor() as i32)
            .map(|value| value.clamp(0, 4))
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
        // Non-zero minimum bounds always disqualify factory collapse.
        let min_bound = substat_roll_bounds_v
            .get(&variant_id)
            .and_then(|entry| entry.min)
            .filter(|value| value.is_finite())
            .map(|value| value.floor() as i32)
            .unwrap_or(0)
            .clamp(0, 5);
        if min_bound > 0 {
            factory_eligible = false;
            continue;
        }
        // Any finite max bound disqualifies factory collapse too.
        let has_finite_max = substat_roll_bounds_v
            .get(&variant_id)
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

// Public merge helper export keeps branch expansion logic in Rust.
#[wasm_bindgen]
pub fn expand_auto_flex_rarity_branches_value(
    recipe: JsValue,
    base_rarity_code: i32,
) -> Result<JsValue, JsValue> {
    auto_rarity_runtime::expand_auto_flex_rarity_branches_value(recipe, base_rarity_code)
}

// Coerce flat/percent flags from number/string/bool payloads.
fn boolish_to_flag(value: Option<&serde_json::Value>) -> i64 {
    match value {
        Some(serde_json::Value::Bool(v)) => i64::from(*v),
        Some(serde_json::Value::Number(v)) => {
            let as_i64 = v.as_i64().unwrap_or(0);
            i64::from(as_i64 != 0)
        }
        Some(serde_json::Value::String(v)) => {
            let lower = v.trim().to_ascii_lowercase();
            i64::from(lower == "1" || lower == "true")
        }
        _ => 0,
    }
}

// Shared number-ish coercer accepts number/string/bool payloads.
// Keep this behavior centralized so export and safeguard paths stay aligned.
fn numberish_to_f64(value: Option<&serde_json::Value>) -> Option<f64> {
    match value {
        Some(serde_json::Value::Number(raw)) => raw.as_f64(),
        Some(serde_json::Value::Bool(raw)) => Some(if *raw { 1.0 } else { 0.0 }),
        Some(serde_json::Value::String(raw)) => raw.trim().parse::<f64>().ok(),
        _ => None,
    }
}

// Keep compatibility helpers available at crate root for included modules.
// Implementations live in `rule_dedupe` so conversion semantics are SSOT.
fn numberish_or_default(value: Option<&serde_json::Value>, default: f64) -> f64 {
    rule_dedupe::numberish_or_default(value, default)
}

// Shared sort+dedupe helper keeps integer selector normalization single-sourced.
// Callers use this for set/type arrays plus safeguard domain lists.
fn sorted_unique_i64(values: &[i64]) -> Vec<i64> {
    let mut normalized = values.to_vec();
    normalized.sort_unstable();
    normalized.dedup();
    normalized
}

// Keep optional-array normalization centralized at crate root.
// This preserves one path for `None` -> empty plus sorted+unique semantics.
fn normalize_i64_array(values: Option<&Vec<i64>>) -> Vec<i64> {
    values
        .as_ref()
        .map(|raw| sorted_unique_i64(raw))
        .unwrap_or_default()
}

// Convert HSF main stat tuple to unified StatVariant encoding.
fn main_to_variant(id: i64, f_flag: i64) -> i64 {
    if id == STAT_ID_ANY {
        return STAT_ID_ANY;
    }
    if (1..=3).contains(&id) {
        return ((id & STAT_VARIANT_ID_MASK) << STAT_VARIANT_SHIFT_BITS) | (f_flag & STAT_VARIANT_FLAT_SUFFIX);
    }
    if (4..=6).contains(&id) {
        return ((id & STAT_VARIANT_ID_MASK) << STAT_VARIANT_SHIFT_BITS) | STAT_VARIANT_FLAT_SUFFIX;
    }
    if (7..=8).contains(&id) {
        return (id & STAT_VARIANT_ID_MASK) << STAT_VARIANT_SHIFT_BITS;
    }
    if id == STAT_ID_HP_ATK_DEF {
        return ((id & STAT_VARIANT_ID_MASK) << STAT_VARIANT_SHIFT_BITS) | STAT_VARIANT_FLAT_SUFFIX;
    }
    STAT_ID_ANY
}

// Convert HSF substat tuple to unified StatVariant encoding.
fn sub_to_variant(id: i64, is_flat_flag: i64) -> i64 {
    if id == STAT_ID_ANY {
        return STAT_ID_ANY;
    }
    if (1..=3).contains(&id) {
        return ((id & STAT_VARIANT_ID_MASK) << STAT_VARIANT_SHIFT_BITS) | (is_flat_flag & STAT_VARIANT_FLAT_SUFFIX);
    }
    if (4..=6).contains(&id) {
        return ((id & STAT_VARIANT_ID_MASK) << STAT_VARIANT_SHIFT_BITS) | STAT_VARIANT_FLAT_SUFFIX;
    }
    if (7..=8).contains(&id) {
        return (id & STAT_VARIANT_ID_MASK) << STAT_VARIANT_SHIFT_BITS;
    }
    if id == STAT_ID_ROLL_COUNT {
        return (STAT_ID_ROLL_COUNT << STAT_VARIANT_SHIFT_BITS) | STAT_VARIANT_FLAT_SUFFIX;
    }
    STAT_ID_ANY
}

// JS-compatible floor(Number(value) || 0) conversion.
fn floor_number_or_zero(value: Option<f64>) -> i64 {
    let numeric = value.unwrap_or(0.0);
    if !numeric.is_finite() {
        return 0;
    }
    numeric.floor() as i64
}


// Keep level ordering aligned with merge.ts.
pub(crate) fn level_order_value(level: Option<i64>) -> i64 {
    match level.unwrap_or(i64::MAX) {
        LEVEL_MILESTONE_0 => LEVEL_ORDER_INDEX_0,
        LEVEL_MILESTONE_4 => LEVEL_ORDER_INDEX_4,
        LEVEL_MILESTONE_8 => LEVEL_ORDER_INDEX_8,
        LEVEL_MILESTONE_12 => LEVEL_ORDER_INDEX_12,
        LEVEL_MILESTONE_16 => LEVEL_ORDER_INDEX_16,
        LEVEL_ANY_SENTINEL => LEVEL_ORDER_INDEX_ANY,
        value => {
            if value == i64::MAX {
                i64::MAX
            } else {
                LEVEL_ORDER_FALLBACK_OFFSET + value
            }
        }
    }
}

// Artifact type ordering mirrors src/lib/types.ts preferred slot order.
fn shared_order_index(order: &[i64], value: i64) -> Option<i64> {
    // Use generated arrays as SSOT for ordering lookups.
    // Missing values return None so callers can apply local fallbacks.
    order
        .iter()
        .position(|candidate| *candidate == value)
        .map(|index| index as i64)
}

// Artifact type ordering mirrors src/lib/types.ts preferred slot order.
fn artifact_type_order_value(slot: i64) -> i64 {
    // Resolve order from generated constants to keep TS and Rust aligned.
    if let Some(index) = shared_order_index(&PREFERRED_ARTIFACT_TYPE_ORDER, slot) {
        return index;
    }
    // Unknown values retain deterministic numeric fallback ordering.
    ARTIFACT_TYPE_ORDER_FALLBACK_OFFSET + slot
}

// Sort slot arrays with preferred-order parity and numeric fallback.
fn sort_artifact_types_in_place(values: &mut [i64]) {
    values.sort_unstable_by(|left, right| {
        let left_key = artifact_type_order_value(*left);
        let right_key = artifact_type_order_value(*right);
        if left_key != right_key {
            return left_key.cmp(&right_key);
        }
        left.cmp(right)
    });
}

// Flatten 2D rows into one contiguous vector for low-overhead wasm transfer.
fn flatten_i32_rows(rows: &[Vec<i32>]) -> Vec<i32> {
    let mut out = Vec::<i32>::new();
    let total_len = rows.iter().map(|row| row.len()).sum::<usize>();
    out.reserve(total_len);
    for row in rows {
        out.extend(row.iter().copied());
    }
    out
}

// Safeguard candidate snapshot builder keeps key derivation + sold filtering
// in Rust so TS call sites avoid re-implementing evaluator precedence.
fn collect_safeguard_candidates_value_impl(
    rows: JsValue,
    rules: JsValue,
    recipe_modes: JsValue,
    ignore_safeguard_recipe_indices: JsValue,
) -> Result<JsValue, JsValue> {
    // Parse raw/compact row payloads into the normalized collect row shape.
    let rows = safeguard_parse_collect_rows_payload(rows)?;
    // Parse merged base rules used by keep/sell resolution.
    let rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard collect rules payload: {error}")))?;
    // Parse per-recipe mode visibility needed by evaluate-item parity.
    let recipe_modes: Vec<String> = from_js_value(recipe_modes)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard collect recipe-modes payload: {error}")))?;
    // Parse optional ignored recipe indices; null/undefined maps to empty list.
    let ignore_safeguard_recipe_indices: Option<Vec<i64>> = from_js_value(ignore_safeguard_recipe_indices)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard collect ignored-recipe payload: {error}")))?;

    // Prepare rules once so each row evaluation reuses precomputed masks.
    let prepared_rules = rules.into_iter().map(prepare_rule).collect::<Vec<_>>();
    let snapshot = collect_safeguard_candidates_core(
        &rows,
        &prepared_rules,
        &recipe_modes,
        &ignore_safeguard_recipe_indices.unwrap_or_default(),
    )?;
    // Return the compact candidate payload used by TS row re-attachment.
    to_js_value(&snapshot)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard candidate snapshot: {error}")))
}

// Safeguard wasm export uses canonical recipe/safeguard naming.
#[wasm_bindgen]
pub fn collect_safeguard_candidates_value(
    rows: JsValue,
    rules: JsValue,
    recipe_modes: JsValue,
    ignore_safeguard_recipe_indices: JsValue,
) -> Result<JsValue, JsValue> {
    collect_safeguard_candidates_value_impl(
        rows,
        rules,
        recipe_modes,
        ignore_safeguard_recipe_indices,
    )
}

// Expand safeguard metaset ids into concrete set selections inside wasm.
fn resolve_safeguard_rules_with_metasets_core(
    rules: JsValue,
    metasets: JsValue,
) -> Result<JsValue, JsValue> {
    // Parse safeguard rule payloads with nullable-field tolerance.
    let mut rules: Vec<SafeguardWasmRuleIn> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard rules payload: {error}")))?;
    // Parse metaset definitions into a fast lookup table.
    let metasets: Vec<SafeguardWasmMetasetIn> = from_js_value(metasets)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard metasets payload: {error}")))?;
    let mut meta_map = HashMap::<String, Vec<i64>>::new();
    for meta in metasets {
        meta_map.insert(meta.id, meta.sets);
    }

    // Expand metaset ids for each rule and emit normalized rule payload rows.
    let mut resolved = Vec::<SafeguardWasmResolvedRuleOut>::with_capacity(rules.len());
    for rule in &mut rules {
        let mut combination = rule.combination.clone().unwrap_or_default();
        // Normalize initial set entries so exclusions are canonical before merging metasets.
        let normalized = safeguard_normalize_set_selections(&combination.sets);
        let excluded_ids = normalized
            .iter()
            .filter_map(|entry| if entry.excluded { Some(entry.id) } else { None })
            .collect::<HashSet<_>>();
        let mut included_ids = normalized
            .iter()
            .filter_map(|entry| if entry.excluded { None } else { Some(entry.id) })
            .collect::<HashSet<_>>();

        // Inject metaset members unless explicitly excluded or already included.
        for meta_id in &combination.meta_set_ids {
            let Some(set_ids) = meta_map.get(meta_id) else {
                continue;
            };
            for set_id in set_ids {
                if excluded_ids.contains(set_id) {
                    continue;
                }
                included_ids.insert(*set_id);
            }
        }

        // Always keep the rule, even when metaset expansion adds no new sets.
        // Readable safeguard rules may intentionally have empty metaset lists.
        // Rebuild + normalize merged entries so ordering/exclusion precedence stays canonical.
        let mut merged = Vec::<SafeguardWasmSetSelection>::new();
        for set_id in &excluded_ids {
            merged.push(SafeguardWasmSetSelection {
                id: *set_id,
                excluded: true,
            });
        }
        for set_id in &included_ids {
            merged.push(SafeguardWasmSetSelection {
                id: *set_id,
                excluded: false,
            });
        }
        combination.sets = safeguard_normalize_set_selections(&merged);
        let resolved_hash = safeguard_hash_combination(&combination);
        let resolved_id = rule
            .id
            .clone()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| format!("ku_{resolved_hash}"));
        let resolved_activation = rule
            .activation
            .clone()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| SAFEGUARD_ACTIVATION_PROTECT_EXISTING.to_string());
        resolved.push(SafeguardWasmResolvedRuleOut {
            id: resolved_id,
            name: rule.name.clone().unwrap_or_default(),
            combination,
            required_count: rule.required_count.unwrap_or(1).max(1),
            activation: resolved_activation,
            count_mode: safeguard_resolve_count_mode(rule.count_mode),
            ignore_previous_safeguards: rule
                .ignore_previous_safeguards
                .unwrap_or(SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS),
            ignore_equipped_in_collection: rule
                .ignore_equipped_in_collection
                .unwrap_or(SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION),
            ignore_equipped_in_vault: rule
                .ignore_equipped_in_vault
                .unwrap_or(SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT),
            substats: rule.substats.clone().unwrap_or_default(),
            substat_match: safeguard_normalize_substat_match(
                rule.substat_match.as_deref().unwrap_or(""),
            ),
            substat_weights: rule
                .substat_weights
                .clone()
                .unwrap_or_default()
                .into_iter()
                .map(|(variant, weight)| (variant.to_string(), weight))
                .collect::<HashMap<String, f64>>(),
        });
    }

    to_js_value(&resolved)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard metaset result: {error}")))
}

// Safeguard wasm export uses canonical recipe/safeguard naming.
#[wasm_bindgen]
pub fn resolve_safeguard_rules_with_metasets_value(
    rules: JsValue,
    metasets: JsValue,
) -> Result<JsValue, JsValue> {
    resolve_safeguard_rules_with_metasets_core(rules, metasets)
}

// Expose a fixed version token so diagnostics can verify which WASM build loaded.
#[wasm_bindgen]
pub fn version() -> String {
    "rule-engine-wasm-v0.15".to_string()
}

// Build integer roll distributions used by hsfBuilder's combinatorics loops.

// Flat-array variant avoids JSON parsing on the result path.

// Filtered distribution helper keeps the hottest per-level loops inside Rust so
// JS only evaluates branch-specific predicates on already-feasible rows.

// Fast variant takes compact numeric arrays directly to avoid per-call JSON
// stringify/parse overhead across the JS/WASM boundary.

// Flat-array variant avoids JSON parsing on the result path.

// Input payload for batch HSF rule emission from pre-filtered distributions.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EmitHsfSubstatIn {
    id: i64,
    #[serde(default)]
    is_flat: bool,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EmitHsfMainChoiceIn {
    id: i64,
    f: Option<i64>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EmitHsfRulesForDistributionsIn {
    base_rule: RuleRaw,
    substats: Vec<EmitHsfSubstatIn>,
    // Execute-intro-plan reuses this payload as an emit template and injects
    // row vectors separately, so distributions may be omitted on input.
    #[serde(default)]
    distributions: Vec<Vec<i32>>,
    base_vals: Vec<i32>,
    mins: Vec<i32>,
    max_caps: Vec<i32>,
    optional_mask: Vec<bool>,
    skip_optional_baseline: bool,
    main_choices: Vec<EmitHsfMainChoiceIn>,
    emit_any_main_when_no_choices: bool,
    target_bases: Vec<Option<i32>>,
    target_increments: Vec<Vec<Option<i32>>>,
}

// Compact filtered-emission payload keeps only base vectors at selected dims.
// Rust widens them to requested dimensions for sink/other expansion.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmitHsfRulesForFilteredDistributionsCompactIn {
    dimensions: i32,
    total: i32,
    base_max_caps: Vec<i32>,
    base_timeline_caps: Vec<i32>,
    base_targeted_mask: Vec<u8>,
    base_locked_mask: Vec<u8>,
    min_floors: Vec<i32>,
    targeted_exact: i32,
    deficit_floors: Vec<i32>,
    deficit_max: i32,
    global_min: i32,
    global_remaining: i32,
    global_mode: i32,
    locked_min: i32,
    locked_remaining: i32,
    locked_mode: i32,
    emit: EmitHsfRulesForDistributionsIn,
}

// Presence-only builder payload mirrors the selectedPoolV.length===0 branch in
// hsfBuilder.ts while keeping the level/main unroll loops in Rust.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfPresenceOnlyRulesIn {
    base_core: RuleRaw,
    main_choices: Vec<EmitHsfMainChoiceIn>,
    level_window_min: i64,
    level_window_max: i64,
}

fn emit_hsf_sub_equals_main(sub: &EmitHsfSubstatIn, main: &EmitHsfMainChoiceIn) -> bool {
    if main.id == STAT_ID_ANY {
        return false;
    }
    if main.id == 1 || main.id == 2 || main.id == 3 {
        let Some(main_f) = main.f else {
            return false;
        };
        return sub.id == main.id && sub.is_flat == (main_f == MAIN_STAT_F_DEFAULT_FLAG);
    }
    sub.id == main.id
}

fn emit_hsf_target_value(
    idx: usize,
    rolls_applied: i32,
    substats: &[EmitHsfSubstatIn],
    base_vals: &[i32],
    target_bases: &[Option<i32>],
    target_increments: &[Vec<Option<i32>>],
) -> i64 {
    let stat_id = substats.get(idx).map(|entry| entry.id).unwrap_or(STAT_ID_ANY);
    if stat_id == STAT_ID_ROLL_COUNT {
        return rolls_applied as i64;
    }
    if rolls_applied <= 0 {
        if let Some(Some(base)) = target_bases.get(idx) {
            return *base as i64;
        }
    } else if let Some(increments) = target_increments.get(idx) {
        let inc_idx = (rolls_applied - 1).max(0) as usize;
        if let Some(Some(override_value)) = increments.get(inc_idx) {
            return *override_value as i64;
        }
    }
    let base = base_vals.get(idx).copied().unwrap_or(0) as i64;
    base + (rolls_applied as i64 * base)
}

fn emit_hsf_padded_substats(mut substats: Vec<RuleSubRaw>) -> Vec<RuleSubRaw> {
    while substats.len() < HSF_SUBSTAT_SLOT_COUNT {
        substats.push(RuleSubRaw {
            ID: Some(STAT_ID_ANY),
            Value: Some(0.0),
            IsFlat: Some(serde_json::Value::Bool(true)),
            Condition: Some(String::new()),
            NotAvailable: Some(false),
        });
    }
    substats
}

// Shared emitter core keeps row-to-rule expansion in one place for both
// direct distribution payloads and filtered-in-wasm payloads.
fn emit_hsf_rules_for_distributions_core(
    input: &EmitHsfRulesForDistributionsIn,
    distributions: &[Vec<i32>],
) -> Vec<RuleRaw> {
    let dims = input.substats.len();
    if dims == 0 {
        return Vec::<RuleRaw>::new();
    }

    let main_choices = if input.main_choices.is_empty() {
        if input.emit_any_main_when_no_choices {
            vec![EmitHsfMainChoiceIn {
                id: STAT_ID_ANY,
                f: Some(MAIN_STAT_F_DEFAULT_FLAG),
            }]
        } else {
            Vec::new()
        }
    } else {
        input
            .main_choices
            .iter()
            .filter(|main_choice| !input.substats.iter().any(|sub| emit_hsf_sub_equals_main(sub, main_choice)))
            .cloned()
            .collect::<Vec<_>>()
    };

    if main_choices.is_empty() {
        return Vec::<RuleRaw>::new();
    }

    let mut out = Vec::<RuleRaw>::new();
    // Dedupe prefix rows so sink/other dimensions do not emit duplicate rule
    // candidates that JS would only collapse later via signature filtering.
    let mut seen_prefixes = HashSet::<Vec<i32>>::new();
    for dist in distributions {
        if dist.len() < dims {
            continue;
        }
        let dist_prefix = dist[..dims].to_vec();
        if !seen_prefixes.insert(dist_prefix.clone()) {
            continue;
        }
        if input.skip_optional_baseline {
            let mut optional_baseline = false;
            for (idx, dist_value) in dist_prefix.iter().enumerate().take(dims) {
                if !input.optional_mask.get(idx).copied().unwrap_or(false) {
                    continue;
                }
                let base = input.base_vals.get(idx).copied().unwrap_or(0) as i64;
                let value = base + (*dist_value as i64 * base);
                if value == base {
                    optional_baseline = true;
                    break;
                }
            }
            if optional_baseline {
                continue;
            }
        }

        let computed_substats = (0..dims)
            .map(|idx| {
                let min_value = input.mins.get(idx).copied().unwrap_or(0);
                let max_cap = input.max_caps.get(idx).copied().unwrap_or(FILTER_OPTION_NONE_I32);
                let has_min = min_value > 0;
                let use_cap_threshold = max_cap > FILTER_OPTION_NONE_I32 && !has_min;
                let rolls_applied = if use_cap_threshold { max_cap } else { dist_prefix[idx] };
                let value = emit_hsf_target_value(
                    idx,
                    rolls_applied,
                    &input.substats,
                    &input.base_vals,
                    &input.target_bases,
                    &input.target_increments,
                ) as f64;
                let condition = if use_cap_threshold { "<=" } else { ">=" };
                RuleSubRaw {
                    ID: Some(input.substats[idx].id),
                    Value: Some(value),
                    IsFlat: Some(serde_json::Value::Bool(input.substats[idx].is_flat)),
                    Condition: Some(condition.to_string()),
                    NotAvailable: Some(false),
                }
            })
            .collect::<Vec<_>>();
        let padded_substats = emit_hsf_padded_substats(computed_substats);

        for main_choice in &main_choices {
            let mut rule = input.base_rule.clone();
            rule.IsRuleTypeAND = Some(false);
            rule.MainStatID = Some(main_choice.id);
            rule.MainStatF = Some(serde_json::Value::from(main_choice.f.unwrap_or(MAIN_STAT_F_DEFAULT_FLAG)));
            rule.Substats = Some(padded_substats.clone());
            out.push(rule);
        }
    }
    out
}

// Emit concrete HSF rules from distribution rows in one wasm call so
// level/combo emission loops avoid per-row JS object construction overhead.

// Build presence-only HSF rows for recipes that select no substats.

// Shared presence-only core keeps no-substat row emission in one Rust path.
pub(crate) fn build_hsf_presence_only_rules_core(input: &BuildHsfPresenceOnlyRulesIn) -> Vec<RuleRaw> {
    // Normalize window ordering so callers can pass unsorted min/max safely.
    let min_level = input.level_window_min.min(input.level_window_max);
    let max_level = input.level_window_min.max(input.level_window_max);
    // Full 0..16 windows collapse to LEVEL_ANY exactly like TS.
    let levels = if min_level <= LEVEL_MILESTONE_0 && max_level >= LEVEL_MILESTONE_16 {
        vec![LEVEL_ANY_SENTINEL]
    } else {
        [
            LEVEL_MILESTONE_0,
            LEVEL_MILESTONE_4,
            LEVEL_MILESTONE_8,
            LEVEL_MILESTONE_12,
            LEVEL_MILESTONE_16,
        ]
        .into_iter()
        .filter(|level| *level >= min_level && *level <= max_level)
        .collect::<Vec<_>>()
    };

    // Emit one row per (level, main) pair, preserving deterministic order.
    let mut out = Vec::<RuleRaw>::new();
    for level in levels {
        if input.main_choices.is_empty() {
            let mut rule = input.base_core.clone();
            rule.IsRuleTypeAND = Some(false);
            rule.MainStatID = Some(STAT_ID_ANY);
            rule.MainStatF = Some(serde_json::Value::Number(serde_json::Number::from(MAIN_STAT_F_DEFAULT_FLAG)));
            rule.LVLForCheck = Some(level);
            rule.Substats = Some(emit_hsf_padded_substats(Vec::new()));
            out.push(rule);
            continue;
        }
        for main_choice in &input.main_choices {
            let mut rule = input.base_core.clone();
            rule.IsRuleTypeAND = Some(false);
            rule.MainStatID = Some(main_choice.id);
            rule.MainStatF = Some(serde_json::Value::Number(serde_json::Number::from(
                main_choice.f.unwrap_or(MAIN_STAT_F_DEFAULT_FLAG),
            )));
            rule.LVLForCheck = Some(level);
            rule.Substats = Some(emit_hsf_padded_substats(Vec::new()));
            out.push(rule);
        }
    }
    out
}

// Combined filtered-emission helper removes large intermediate row transfers
// for always-true branches where JS does not need per-row predicates.

// Compact filtered-emission helper widens base vectors in Rust so JS no longer
// rebuilds per-dimension cap/mask arrays inside hsfBuilder inner loops.

// Shared compact filtered-emission core keeps sink-dimension widening in one implementation.
pub(crate) fn emit_hsf_rules_for_filtered_distributions_compact_core(
    input: &EmitHsfRulesForFilteredDistributionsCompactIn,
) -> Vec<RuleRaw> {
    // Keep parity with the expanded helper for degenerate dimensions.
    if input.dimensions <= 0 {
        return Vec::<RuleRaw>::new();
    }
    if input.total < 0 {
        return Vec::<RuleRaw>::new();
    }
    // Allocate widened vectors and initialize with sentinel defaults.
    let width = input.dimensions.max(0) as usize;
    let mut widened_max_caps = vec![FILTER_OPTION_NONE_I32; width];
    let mut widened_timeline_caps = vec![FILTER_OPTION_NONE_I32; width];
    let mut widened_targeted_mask = vec![0u8; width];
    let mut widened_locked_mask = vec![0u8; width];
    // Copy only the overlap so callers can pass shorter base vectors.
    let copy_count = width.min(input.base_max_caps.len());
    if copy_count > 0 {
        widened_max_caps[..copy_count].copy_from_slice(&input.base_max_caps[..copy_count]);
    }
    let copy_count = width.min(input.base_timeline_caps.len());
    if copy_count > 0 {
        widened_timeline_caps[..copy_count].copy_from_slice(&input.base_timeline_caps[..copy_count]);
    }
    let copy_count = width.min(input.base_targeted_mask.len());
    if copy_count > 0 {
        widened_targeted_mask[..copy_count].copy_from_slice(&input.base_targeted_mask[..copy_count]);
    }
    let copy_count = width.min(input.base_locked_mask.len());
    if copy_count > 0 {
        widened_locked_mask[..copy_count].copy_from_slice(&input.base_locked_mask[..copy_count]);
    }

    // Reuse the existing expanded filtered-emission core.
    let max_caps_opt = widened_max_caps
        .iter()
        .map(|value| if *value < 0 { None } else { Some(*value) })
        .collect::<Vec<_>>();
    let min_floors_opt = input
        .min_floors
        .iter()
        .map(|value| if *value < 0 { None } else { Some(*value) })
        .collect::<Vec<_>>();
    let timeline_caps_opt = widened_timeline_caps
        .iter()
        .map(|value| if *value < 0 { None } else { Some(*value) })
        .collect::<Vec<_>>();
    let targeted_mask_bool = widened_targeted_mask
        .iter()
        .map(|value| *value != 0)
        .collect::<Vec<_>>();
    let deficit_floors_opt = input
        .deficit_floors
        .iter()
        .map(|value| if *value < 0 { None } else { Some(*value) })
        .collect::<Vec<_>>();
    let locked_mask_bool = widened_locked_mask
        .iter()
        .map(|value| *value != 0)
        .collect::<Vec<_>>();
    let filter_input = hsf_distribution_runtime::FilterRollDistributionsIn {
        dimensions: input.dimensions,
        total: input.total,
        max_caps: &max_caps_opt,
        min_floors: &min_floors_opt,
        timeline_caps: &timeline_caps_opt,
        targeted_mask: &targeted_mask_bool,
        targeted_exact: if input.targeted_exact <= FILTER_OPTION_NONE_I32 {
            None
        } else {
            Some(input.targeted_exact)
        },
        deficit_floors: &deficit_floors_opt,
        deficit_max: if input.deficit_max <= FILTER_OPTION_NONE_I32 {
            None
        } else {
            Some(input.deficit_max)
        },
        global_min: input.global_min,
        global_remaining: input.global_remaining,
        global_filter: hsf_distribution_runtime::parse_distribution_mode(input.global_mode),
        locked_mask: &locked_mask_bool,
        locked_min: input.locked_min,
        locked_remaining: input.locked_remaining,
        locked_filter: hsf_distribution_runtime::parse_distribution_mode(input.locked_mode),
    };
    let rows = hsf_distribution_runtime::filter_roll_distributions_core(&filter_input);
    emit_hsf_rules_for_distributions_core(&input.emit, &rows)
}

// Full builder runtime keeps preflight + branch orchestration in Rust.
// TS calls this once per recipe instead of re-running branch loops in JS.
#[wasm_bindgen]
pub fn build_hsf_rules_runtime_value(payload: JsValue) -> Result<JsValue, JsValue> {
    hsf_builder_execution::build_hsf_rules_runtime_value(payload)
}

// Builder prep normalizes selected/fixed pools and target maps in Rust.
// TS uses this to avoid large per-recipe prep loops before runtime dispatch.
#[wasm_bindgen]
pub fn prepare_hsf_builder_recipe_value(payload: JsValue) -> Result<JsValue, JsValue> {
    hsf_builder_execution::prepare_hsf_builder_recipe_value(payload)
}

// Numeric combinations helper keeps high-volume choose(N, K) expansion in wasm.

// Fast variant avoids JSON serialization for numeric combinations calls.

// Flat-array variant avoids JSON parsing on the result path.
#[wasm_bindgen]
pub fn combinations_i32_fast_flat(values: Vec<i32>, pick: i32) -> Vec<i32> {
    let out = hsf_distribution_runtime::compute_combinations_i32(&values, pick);
    flatten_i32_rows(&out)
}

// Numeric permutations helper mirrors TS backtracking index order.

// Fast variant avoids JSON serialization for numeric permutations calls.

// Flat-array variant avoids JSON parsing on the result path.
#[wasm_bindgen]
pub fn permutations_i32_fast_flat(values: Vec<i32>) -> Vec<i32> {
    let out = hsf_distribution_runtime::compute_permutations_i32(&values);
    flatten_i32_rows(&out)
}

// Numeric bounded-compositions helper for late-mode extra allocation loops.

// Flat-array variant avoids JSON parsing on the result path.

// Flat helper for late-mode bounded-composition loops with inline filtering.

// Build intro assignment schedules used by hsfBuilder combinatorics loops.

// Fast variant avoids JSON serialization for intro assignment combinatorics.

// Flat-array variant avoids JSON parsing on the result path.
#[wasm_bindgen]
pub fn intro_assignments_for_combo_fast_flat(
    count: i32,
    base_slots: i32,
    addition_levels: Vec<i32>,
    forced_base: Vec<i32>,
) -> Vec<i32> {
    let results = hsf_distribution_runtime::compute_intro_assignments_for_combo(
        count,
        base_slots,
        &addition_levels,
        &forced_base,
    );
    flatten_i32_rows(&results)
}

// Shared obsolete-report builder used by JSON and JsValue exports.
fn find_obsolete_report(rules: &[RuleRaw]) -> ObsoleteReportOut {
    let obsolete = rule_dedupe::collect_obsolete_entries(rules);
    ObsoleteReportOut { obsolete }
}

// Builder-pruning obsolete report mirrors hsfBuilder.ts::pruneDominatedRules semantics.

// Detect obsolete rules using the same domination semantics as src/lib/hsfObsolete.ts.

// Fast obsolete export accepts JS arrays directly and returns a JS object.
#[wasm_bindgen]
pub fn find_obsolete_value(rules: JsValue) -> Result<JsValue, JsValue> {
    let parsed_rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid obsolete-rules value: {error}")))?;
    let report = find_obsolete_report(&parsed_rules);
    to_js_value(&report)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize obsolete value: {error}")))
}

// Builder-specific obsolete export keeps hsfBuilder pruning loops inside wasm.

// Builder finalize mirrors hsfBuilder.ts post-emission behavior:
// prune builder-obsolete rows, then stable sort by emission metadata.
pub(crate) fn finalize_builder_rules_core(
    rules: Vec<RuleRaw>,
    emission_meta: Vec<BuilderFinalizeEmissionMetaIn>,
) -> Result<Vec<RuleRaw>, String> {
    // Metadata length must match emitted rule count.
    if rules.len() != emission_meta.len() {
        return Err(format!(
            "Builder finalize payload mismatch (rules={}, emissionMeta={})",
            rules.len(),
            emission_meta.len(),
        ));
    }
    // Zero/one-rule payloads are already finalized.
    if rules.len() <= 1 {
        return Ok(rules);
    }
    // Reuse the existing builder obsolete detector for SSOT pruning semantics.
    let obsolete = rule_dedupe::collect_builder_pruning_obsolete_entries(&rules);
    let obsolete_indices = obsolete
        .into_iter()
        .map(|entry| entry.index)
        .collect::<HashSet<_>>();

    // Keep metadata and rules aligned while pruning.
    let mut paired = Vec::<BuilderFinalizeEntry>::new();
    for (idx, (rule, meta)) in rules.into_iter().zip(emission_meta.into_iter()).enumerate() {
        if obsolete_indices.contains(&idx) {
            continue;
        }
        paired.push(BuilderFinalizeEntry {
            rule,
            meta,
            original_idx: idx,
        });
    }
    // Preserve deterministic grouping: level index, branch index, sequence, index.
    paired.sort_by(|left, right| {
        if left.meta.level_idx != right.meta.level_idx {
            return left.meta.level_idx.cmp(&right.meta.level_idx);
        }
        if left.meta.branch_idx != right.meta.branch_idx {
            return left.meta.branch_idx.cmp(&right.meta.branch_idx);
        }
        if left.meta.seq != right.meta.seq {
            return left.meta.seq.cmp(&right.meta.seq);
        }
        left.original_idx.cmp(&right.original_idx)
    });
    Ok(paired.into_iter().map(|entry| entry.rule).collect::<Vec<_>>())
}

// Builder-postprocess exports are delegated to a focused module so lib.rs stays
// primarily about shared types, engine wiring, and wasm export entrypoints.
#[wasm_bindgen]
pub fn flatten_rule_batches_with_total_limit_value(
    base_count: i64,
    total_limit: i64,
    batches: JsValue,
) -> Result<JsValue, JsValue> {
    rule_postprocess::flatten_rule_batches_with_total_limit_value(base_count, total_limit, batches)
}

// Final Sell builder/export lives in the postprocess module to keep merge
// orchestration logic grouped with other rule-assembly helpers.
#[wasm_bindgen]
pub fn build_final_sell_rules_value(
    remainder: JsValue,
    all_known_set_ids: JsValue,
) -> Result<JsValue, JsValue> {
    rule_postprocess::build_final_sell_rules_value(remainder, all_known_set_ids)
}

// Merged-rule orchestration delegates to the postprocess module.
#[wasm_bindgen]
pub fn compute_merged_rules_value(payload: JsValue) -> Result<JsValue, JsValue> {
    rule_postprocess::compute_merged_rules_value(payload)
}

// Safeguard injected merge/dedupe/sort delegates to postprocess helpers.
fn merge_safeguard_injected_rules_core(
    base_rules: JsValue,
    custom_rules: JsValue,
    candidate_keep_rules: JsValue,
) -> Result<JsValue, JsValue> {
    rule_postprocess::merge_safeguard_injected_rules_value(
        base_rules,
        custom_rules,
        candidate_keep_rules,
    )
}

// Safeguard wasm export uses canonical recipe/safeguard naming.
#[wasm_bindgen]
pub fn merge_safeguard_injected_rules_value(
    base_rules: JsValue,
    custom_rules: JsValue,
    candidate_safeguard_rules: JsValue,
) -> Result<JsValue, JsValue> {
    merge_safeguard_injected_rules_core(
        base_rules,
        custom_rules,
        candidate_safeguard_rules,
    )
}

// Export-dedupe path reuses the same postprocess module for consistency.
#[wasm_bindgen]
pub fn dedupe_hsf_rules_for_export_value(rules: JsValue) -> Result<JsValue, JsValue> {
    rule_postprocess::dedupe_hsf_rules_for_export_value(rules)
}

// Generated-rule finalization also delegates to the postprocess module.
#[wasm_bindgen]
pub fn finalize_generated_rules_value(
    entries: JsValue,
    apply_obsolete_pruning: bool,
) -> Result<JsValue, JsValue> {
    rule_postprocess::finalize_generated_rules_value(entries, apply_obsolete_pruning)
}

// Shared configure implementation used by both JSON and JsValue bindings.
fn configure_engine(raw_rules: Vec<RuleRaw>, recipe_modes: Vec<String>) {
    let prepared_rules = raw_rules.into_iter().map(prepare_rule).collect::<Vec<_>>();
    ENGINE_STATE.with(|state| {
        *state.borrow_mut() = Some(EngineState {
            rules: prepared_rules,
            recipe_modes,
        });
    });
}

// Shared evaluation implementation used by both JSON and JsValue bindings.
fn evaluate_engine(
    items: Vec<EvaluateItemRaw>,
    options: EvaluateOptionsRaw,
) -> Result<Vec<EvaluateItemResult>, JsValue> {
    ENGINE_STATE.with(|state| {
        let guard = state.borrow();
        let Some(engine) = guard.as_ref() else {
            return Err(JsValue::from_str("WASM rule engine is not configured"));
        };

        // Prepare all option sets once so each item scan stays allocation-free.
        let prepared_options = prepare_evaluate_options(&options);
        // Optional baseline path excludes keep-override sources when primary
        // first-match came from those sources.
        let baseline_options = options
            .baseline_exclude_sources
            .as_ref()
            .map(|sources| {
                let mut cloned = options.clone();
                cloned.exclude_sources = Some(sources.clone());
                cloned.baseline_exclude_sources = None;
                prepare_evaluate_options(&cloned)
            });

        let results = items
            .iter()
            .map(|entry| {
                let (first_match, first_non_excluded_match, matching_recipe_indices, matching_recipe_decisions) =
                    evaluate_item(
                        &engine.rules,
                        &engine.recipe_modes,
                        &entry.item,
                        &prepared_options,
                    );
                let mut resolved_first_non_excluded = first_non_excluded_match.clone();
                if let Some(baseline) = baseline_options.as_ref() {
                    let needs_baseline = first_match
                        .as_ref()
                        .and_then(|matched| engine.rules.get(matched.rule_index))
                        .map(|rule| rule.is_keep_override_source)
                        .unwrap_or(false);
                    if needs_baseline {
                        let (_, baseline_non_excluded, _, _) =
                            evaluate_item(
                                &engine.rules,
                                &engine.recipe_modes,
                                &entry.item,
                                baseline,
                            );
                        if baseline_non_excluded.is_some() {
                            resolved_first_non_excluded = baseline_non_excluded;
                        }
                    }
                }

                EvaluateItemResult {
                    item_id: entry.item_id,
                    first_match,
                    first_non_excluded_match: resolved_first_non_excluded,
                    matching_recipe_indices,
                    matching_recipe_decisions,
                }
            })
            .collect::<Vec<_>>();

        Ok(results)
    })
}

// Configure rules + recipe modes once per pipeline run.
// The worker calls this before evaluating one or more item batches.

// Fast configure variant accepts JS objects directly (no JSON stringify).
#[wasm_bindgen]
pub fn configure_value(rules: JsValue, recipe_modes: JsValue) -> Result<(), JsValue> {
    let raw_rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid rules value: {error}")))?;
    let recipe_modes: Vec<String> = from_js_value(recipe_modes)
        .map_err(|error| JsValue::from_str(&format!("Invalid recipeModes value: {error}")))?;
    configure_engine(raw_rules, recipe_modes);
    Ok(())
}

// Evaluate a batch of Gear Inspector items against the configured rules.
// Returns a JSON payload matching the existing worker result shape.

// Fast evaluate variant accepts JS objects directly and returns a JS value.
#[wasm_bindgen]
pub fn evaluate_value(items: JsValue, options: JsValue) -> Result<JsValue, JsValue> {
    let parsed_items: Vec<EvaluateItemRaw> = from_js_value(items)
        .map_err(|error| JsValue::from_str(&format!("Invalid items value: {error}")))?;
    let parsed_options: EvaluateOptionsRaw = if options.is_undefined() || options.is_null() {
        EvaluateOptionsRaw::default()
    } else {
        from_js_value(options)
            .map_err(|error| JsValue::from_str(&format!("Invalid options value: {error}")))?
    };
    let results = evaluate_engine(parsed_items, parsed_options)?;
    to_js_value(&results)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize evaluate value: {error}")))
}
