use std::cmp::Ordering;
use std::cell::RefCell;
use std::collections::{BTreeSet, HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_wasm_bindgen::{from_value as from_js_value, to_value as to_js_value};
use wasm_bindgen::prelude::*;

// Shared serializer used for all wasm outputs that contain HashMap fields.
// serialize_maps_as_objects ensures HashMap<K, V> round-trips as a plain JS
// object rather than an ES2015 Map, removing the need for TS-side toPlainObjectDeep.
fn wasm_to_js<T: serde::Serialize>(value: &T) -> Result<JsValue, JsValue> {
    value
        .serialize(&serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true))
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

// Shared domain constants are generated from shared/domain-constants.json.
// This keeps TS and Rust sentinel/enum values synchronized automatically.
mod generated_domain_constants;
mod auto_rarity_runtime;
mod hsf_branch_execution;
mod hsf_builder_core;
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
// Re-export all HSF builder structs and core functions at the crate root so
// sibling execution modules continue to import them via `crate::*` unchanged.
pub(crate) use hsf_builder_core::*;
use generated_domain_constants::*;
use safeguards::{
    safeguard_group_key_from_parts,
    safeguard_hash_combination,
    safeguard_normalize_set_selections,
    safeguard_normalize_substat_match,
    safeguard_parse_collect_rows_payload,
    safeguard_resolve_count_mode,
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

// Serialize HashMap<i64, V> as a string-keyed map so serialize_maps_as_objects
// can convert it to a plain JS object.  Paired with deserialize_i64_key_map.
pub(crate) fn serialize_i64_key_map<S, V>(
    map: &HashMap<i64, V>,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
    V: serde::Serialize,
{
    use serde::ser::SerializeMap;
    // Emit each entry with the i64 key stringified so the JS side receives a
    // plain object rather than a Map (which cannot have numeric object keys).
    let mut ser = serializer.serialize_map(Some(map.len()))?;
    for (key, value) in map {
        ser.serialize_entry(&key.to_string(), value)?;
    }
    ser.end()
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
            // Pass the raw percentile through so the TS pipeline can pre-compute
            // equippedFloorScore after metaset resolution with the full artifact list.
            beat_equipped_percentile: rule.beat_equipped_percentile.filter(|v| v.is_finite()),
        });
    }

    // Use serialize_maps_as_objects so HashMap<String, _> fields (e.g. substatWeights)
    // round-trip as plain JS objects rather than JS Map instances. serde_wasm_bindgen 0.6
    // defaults to JS Map for HashMap serialization, which TS code cannot read via Object.entries.
    resolved
        .serialize(&serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true))
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
