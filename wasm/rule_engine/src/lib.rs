use std::cmp::Ordering;
use std::cell::RefCell;
use std::collections::{BTreeSet, HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_wasm_bindgen::{from_value as from_js_value, to_value as to_js_value};
use wasm_bindgen::prelude::*;

// Shared domain constants are generated from shared/domain-constants.json.
// This keeps TS and Rust sentinel/enum values synchronized automatically.
mod generated_domain_constants;
mod hsf_branch_execution;
mod hsf_builder_execution;
mod hsf_combo_runtime;
mod hsf_full_selected_fallback;
mod hsf_intro_execution;
mod hsf_intro_mode_plan;
mod hsf_level_combo_execution;
use generated_domain_constants::*;

const RULE_SOURCE_HSF: &str = "hsf";
const RULE_SOURCE_HSFC: &str = "hsfc";
const RULE_SOURCE_FINAL_SELL: &str = "finalSell";
const RULE_SOURCE_KEEP_UNIQUES: &str = "keepUniques";
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
const JS_MAX_SAFE_INTEGER_I64: i64 = 9_007_199_254_740_991;

// Rank/rarity masks operate on the discrete in-game values 1..6.
const RANK_RARITY_MIN: i64 = 1;
const RANK_RARITY_MAX: i64 = 6;
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
    ConfigID: Option<i64>,
    ConfigName: Option<String>,
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
    #[serde(default, rename = "__keepUniqueRuleId")]
    keep_unique_rule_id: Option<String>,
    #[serde(default, rename = "__keepUniqueRuleOrdinal")]
    keep_unique_rule_ordinal: Option<i64>,
    #[serde(default, rename = "__keepUniqueHash")]
    keep_unique_hash: Option<String>,
    #[serde(default, rename = "__keepUniqueRequired")]
    keep_unique_required: Option<i64>,
    #[serde(default, rename = "__keepUniqueScanMs")]
    keep_unique_scan_ms: Option<f64>,
    #[serde(default, rename = "__keepUniqueProjected")]
    keep_unique_projected: Option<i64>,
    #[serde(default, rename = "__keepUniqueDeficit")]
    keep_unique_deficit: Option<i64>,
    #[serde(default, rename = "__keepUniqueItemKey")]
    keep_unique_item_key: Option<i64>,
    #[serde(default, rename = "__keepUniquePlaceholder")]
    keep_unique_placeholder: Option<bool>,
    #[serde(default, rename = "__keepUniquePlaceholderMissing")]
    keep_unique_placeholder_missing: Option<i64>,
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

// Keep only the data needed in hot matcher loops.
// Masks and config indices are precomputed at configure time.
#[derive(Debug)]
struct PreparedRule {
    use_flag: bool,
    keep_flag: bool,
    artifact_types: Vec<i64>,
    artifact_sets: Vec<i64>,
    faction: i64,
    level_for_check: i64,
    main_stat_id: i64,
    main_stat_f: i64,
    substats: Vec<PreparedRuleSub>,
    cfg_idx: Option<i64>,
    source: Option<String>,
    keep_unique_item_key: Option<i64>,
    rank_mask: u8,
    rarity_mask: u8,
    is_keep_override_source: bool,
}

// Prepared substats normalize condition/value flags for direct comparisons.
#[derive(Debug)]
struct PreparedRuleSub {
    id: i64,
    value: f64,
    is_flat: i64,
    condition: String,
    not_available: bool,
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
    sub_values: Option<HashMap<String, f64>>,
    item_id: Option<i64>,
    preview_extras: Option<PreviewExtrasRaw>,
}

// previewExtras carries the fallback ID used by keep-unique bindings.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PreviewExtrasRaw {
    id: Option<i64>,
}

// Evaluate options mirror EvalMatchesByConfigOptions from TS.
// Sets are converted once so each rule scan stays allocation-free.
#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct EvaluateOptionsRaw {
    exclude_sources: Option<Vec<String>>,
    exclude_config_indices: Option<Vec<i64>>,
    ignore_keep_unique_config_indices: Option<Vec<i64>>,
    baseline_exclude_sources: Option<Vec<String>>,
}

// Serialized match result shape consumed by existing worker hooks.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EvalMatch {
    rule_index: usize,
    keep: bool,
    cfg_idx: Option<i64>,
}

// Serialized per-config keep/sell decision list.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MatchingConfigDecision {
    cfg_idx: i64,
    keep: bool,
}

// Serialized item result shape mirrors TesterMatchWorkerItemResult.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EvaluateItemResult {
    item_id: i64,
    first_match: Option<EvalMatch>,
    first_non_excluded_match: Option<EvalMatch>,
    matching_config_indices: Vec<i64>,
    matching_config_decisions: Vec<MatchingConfigDecision>,
}

// Keep-unique candidate resolver consumes compact row payloads from TS.
// `base_match_defined` distinguishes `undefined` from explicit `null`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueCandidateResolveRowIn {
    item: TestItemRaw,
    #[serde(default)]
    base_match_defined: bool,
    base_match: Option<KeepUniqueCandidateResolveBaseMatchIn>,
}

// Only the fields needed for keep/sell fallback logic cross the boundary.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueCandidateResolveBaseMatchIn {
    keep: bool,
    cfg_idx: Option<i64>,
}

// Candidate collection input extends resolver rows with normalized artifact data.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueCollectRowIn {
    item: TestItemRaw,
    #[serde(default)]
    base_match_defined: bool,
    base_match: Option<KeepUniqueCandidateResolveBaseMatchIn>,
    artifact: KeepUniqueWasmArtifactIn,
}

// Candidate snapshot entry mirrors keepUniques.ts KeepUniqueCandidate shape.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueCollectedCandidateOut {
    row_index: usize,
    item_key: i64,
    group_key: String,
    is_sold: bool,
    artifact: KeepUniqueWasmArtifactIn,
}

// Candidate snapshot payload also includes sold-item key dedupe set.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueCollectedSnapshotOut {
    candidates: Vec<KeepUniqueCollectedCandidateOut>,
    unique_item_keys: Vec<i64>,
}

// Combined keep-unique payload lets TS request candidate collection + detection
// in one wasm call while preserving both legacy output shapes.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueCollectedAndProtectedSnapshotOut {
    candidates: Vec<KeepUniqueCollectedCandidateOut>,
    unique_item_keys: Vec<i64>,
    detection: KeepUniqueWasmSnapshotOut,
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

// Final-sell remainder config mirrors src/lib/logicHub.ts payload shape.
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
    keep_unique_enabled: bool,
    #[serde(default)]
    keep_unique_rules: Vec<serde_json::Value>,
    keep_unique_detection: Option<KeepUniqueWasmSnapshotOut>,
    #[serde(default)]
    keep_unique_config_id_base: Option<i64>,
}

// Auto-rarity bounds mirror BuilderConfig.substatRollBoundsV row shape.
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
    #[serde(default)]
    substat_roll_bounds_v: HashMap<String, AutoRarityResolveRollBoundsIn>,
}

// Builder-facing auto-rarity payload accepts raw cfg vectors plus allowed ids.
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
    #[serde(default)]
    substat_roll_bounds_v: HashMap<String, AutoRarityResolveRollBoundsIn>,
    #[serde(default)]
    allowed_substats: Vec<i64>,
}

// Sort payload stores computed keys so comparator work stays branch-light.
#[derive(Debug)]
struct KeepUniqueMergeSortEntry {
    rule: RuleRaw,
    idx: usize,
    level_idx: i64,
    rule_ordinal: i64,
    placeholder_rank: i64,
    item_key: i64,
    canonical: String,
}

// Internal carry type keeps branch ordering attached through finalization.
#[derive(Debug, Clone)]
struct GeneratedRuleEntry {
    rule: RuleRaw,
    branch_order: i64,
    branch_seq: i64,
    original_idx: i64,
}

// Substat domination only supports >= and <= conditions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
enum SubCond {
    Gte,
    Lte,
}

impl SubCond {
    fn as_str(self) -> &'static str {
        match self {
            SubCond::Gte => ">=",
            SubCond::Lte => "<=",
        }
    }
}

// Normalized substat tuple for domination checks.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
struct NormalizedSubKey {
    variant: i64,
    cond: SubCond,
}

// Carry integer threshold values after flooring for parity with JS.
#[derive(Debug, Clone)]
struct NormalizedSubstat {
    key: NormalizedSubKey,
    value: i64,
}

// Builder pruning keeps raw id/isFlat/condition tuples (without variant folding)
// so it mirrors hsfBuilder.ts::normalizeSubstats + ruleCovers semantics exactly.
#[derive(Debug, Clone)]
struct BuilderNormalizedSubstat {
    id: i64,
    is_flat: bool,
    condition: String,
    value: f64,
}

// Stateful engine keeps prepared rules + mode gating table.
struct EngineState {
    rules: Vec<PreparedRule>,
    config_modes: Vec<String>,
}

// Normalize unknown rank/rarity values into supported 1..6 domain.
fn clamp_rank_or_rarity(value: i64) -> i64 {
    if value <= RANK_RARITY_MIN {
        return RANK_RARITY_MIN;
    }
    if value >= RANK_RARITY_MAX {
        return RANK_RARITY_MAX;
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

// Auto-rarity aggregate requirements are clamped to the same 0..5 domain as TS.
fn auto_rarity_clamp_roll_requirement(value: Option<f64>) -> i64 {
    let numeric = value.unwrap_or(0.0);
    if !numeric.is_finite() {
        return 0;
    }
    (numeric.floor() as i64).clamp(0, 5)
}

// Auto-rarity tables are generated from shared/domain-constants.json.
// Clamp unknown values into the supported 0..16 rarity-code domain.
fn auto_rarity_code_index(rarity_code: i64) -> usize {
    // Unknown values are normalized to Any so table lookups stay in-bounds.
    if !(RARITY_CODE_ANY..=RARITY_CODE_GTE_LEGENDARY).contains(&rarity_code) {
        return RARITY_CODE_ANY as usize;
    }
    // Return a stable 0..16 index for generated table access.
    rarity_code as usize
}

// Roll schedule mask uses bit positions [4, 8, 12, 16].
fn auto_rarity_roll_mask_for_code(rarity_code: i64) -> i64 {
    // Pull the roll schedule from the shared generated table.
    AUTO_RARITY_ROLL_MASK_BY_CODE[auto_rarity_code_index(rarity_code)]
}

// Addition schedule mask uses bit positions [4, 8, 12, 16].
fn auto_rarity_addition_mask_for_code(rarity_code: i64) -> i64 {
    // Pull the addition schedule from the shared generated table.
    AUTO_RARITY_ADDITION_MASK_BY_CODE[auto_rarity_code_index(rarity_code)]
}

// Mythical pre-roll membership comes from the shared auto-rarity table.
fn auto_rarity_includes_mythical(rarity_code: i64) -> bool {
    // Pull mythical membership from the shared generated table.
    AUTO_RARITY_INCLUDES_MYTHICAL_BY_CODE[auto_rarity_code_index(rarity_code)]
}

// Convert a level ceiling into a schedule bitmask for [4, 8, 12, 16].
fn auto_rarity_level_mask_up_to(ceiling: i64) -> i64 {
    // Start empty and add a bit per unlocked milestone.
    let mut mask = 0i64;
    // +4 contributes the first milestone bit.
    if ceiling >= LEVEL_MILESTONE_4 {
        mask |= 1;
    }
    // +8 contributes the second milestone bit.
    if ceiling >= LEVEL_MILESTONE_8 {
        mask |= 2;
    }
    // +12 contributes the third milestone bit.
    if ceiling >= LEVEL_MILESTONE_12 {
        mask |= 4;
    }
    // +16 contributes the fourth milestone bit.
    if ceiling >= LEVEL_MILESTONE_16 {
        mask |= 8;
    }
    // Return the accumulated availability mask.
    mask
}

// Count helper keeps roll-target math readable in the auto-rarity core.
fn auto_rarity_count_levels_up_to_mask(mask: i64, ceiling: i64) -> i64 {
    // Intersect the schedule mask with milestone bits available at this ceiling.
    let filtered = (mask & auto_rarity_level_mask_up_to(ceiling)) as u32;
    // Popcount gives the number of roll/addition milestones unlocked so far.
    filtered.count_ones() as i64
}

// Presence helper mirrors hsfBuilder.ts early-level base+addition model.
fn auto_rarity_present_at_level(rarity_code: i64, level: i64) -> i64 {
    // Resolve the rarity-specific addition schedule from shared constants.
    let additions_mask = auto_rarity_addition_mask_for_code(rarity_code);
    // Count total additions to derive the +0 baseline substat count.
    let additions_total = (additions_mask as u32).count_ones() as i64;
    // Base start is 4 minus pending additions, clamped at zero.
    let base_start = (4 - additions_total).max(0);
    // Additions up to the requested level increase present substat count.
    let adds_so_far = auto_rarity_count_levels_up_to_mask(additions_mask, level);
    // Cap final presence at HSF's 4-substat maximum.
    (base_start + adds_so_far).min(4)
}

// Auto-rarity resolver core mirrors hsfBuilder.ts::resolveAutoRarityCode,
// with slot/main compatibility filtering performed in TS before this call.
fn resolve_auto_rarity_code_core(input: &AutoRarityResolveIn) -> i64 {
    // Optional floor threshold clamps auto output upward when configured.
    let min_floor_code = match input
        .auto_rarity_supplements_threshold
        .as_deref()
        .map(|value| value.trim().to_ascii_lowercase())
        .as_deref()
    {
        Some("uncommon") => Some(RARITY_CODE_GTE_UNCOMMON),
        Some("rare") => Some(RARITY_CODE_GTE_RARE),
        Some("epic") => Some(RARITY_CODE_GTE_EPIC),
        _ => None,
    };
    let apply_floor = |candidate: i64| -> i64 {
        let Some(floor) = min_floor_code else {
            return candidate;
        };
        let rate = |code: i64| -> i64 {
            match code {
                RARITY_CODE_ANY => 0,
                RARITY_CODE_GTE_UNCOMMON => 1,
                RARITY_CODE_GTE_RARE => 2,
                RARITY_CODE_GTE_EPIC => 3,
                RARITY_CODE_GTE_LEGENDARY => 4,
                RARITY_CODE_MYTHICAL => 5,
                _ => 0,
            }
        };
        if rate(candidate) < rate(floor) {
            floor
        } else {
            candidate
        }
    };

    // Inputs are already slot/main filtered in TS to keep compatibility SSOT there.
    let selected_pool_v = input.selected_pool_v.clone();
    let fixed_pool_raw_v = input.fixed_pool_v.clone();
    if selected_pool_v.is_empty() {
        return apply_floor(RARITY_CODE_ANY);
    }

    // Locked subset follows selected ordering, mirroring TS includes/filter flow.
    let fixed_pool_v = selected_pool_v
        .iter()
        .copied()
        .filter(|variant| fixed_pool_raw_v.contains(variant))
        .collect::<Vec<_>>();
    let max_selectable_total = selected_pool_v.len().min(4) as i64;
    let min_target_count = input
        .min_count
        .map(|value| value.floor() as i64)
        .unwrap_or(0)
        .max(fixed_pool_v.len() as i64)
        .min(4);
    let presence_need = max_selectable_total.min(min_target_count);
    let required_v = fixed_pool_v
        .iter()
        .copied()
        .take(4)
        .collect::<Vec<_>>();
    let optional_pool_v = selected_pool_v
        .iter()
        .copied()
        .filter(|variant| !required_v.contains(variant))
        .collect::<Vec<_>>();

    // Parse per-substat mins from normalized bounds payload.
    let mut per_min = HashMap::<i64, i64>::new();
    for variant in &selected_pool_v {
        let key = variant.to_string();
        let min_value = input
            .substat_roll_bounds_v
            .get(&key)
            .and_then(|entry| entry.min);
        per_min.insert(*variant, auto_rarity_clamp_roll_requirement(min_value));
    }
    let has_per_stat_min = per_min.values().any(|value| *value > 0);
    let sum_required = required_v
        .iter()
        .copied()
        .map(|variant| per_min.get(&variant).copied().unwrap_or(0))
        .sum::<i64>();

    // Locked scope is active when locked stats exist and locked min is positive.
    let locked_min_raw = auto_rarity_clamp_roll_requirement(input.locked_min_required_rolls);
    let locked_scope = !required_v.is_empty() && locked_min_raw > 0;
    let worst_sum_mins = if locked_scope {
        sum_required
    } else {
        let need_local = (min_target_count - required_v.len() as i64).max(0) as usize;
        let mut option_mins = optional_pool_v
            .iter()
            .copied()
            .map(|variant| per_min.get(&variant).copied().unwrap_or(0))
            .collect::<Vec<_>>();
        option_mins.sort_by(|left, right| right.cmp(left));
        let sum_optional = option_mins.into_iter().take(need_local).sum::<i64>();
        sum_required + sum_optional
    };

    // Global aggregate minimum mirrors TS auto/manual split.
    let global_min_raw = if input.auto_min_required_rolls == Some(false) {
        auto_rarity_clamp_roll_requirement(input.min_required_rolls)
    } else {
        let base = if locked_scope {
            required_v.len() as i64
        } else {
            min_target_count
        };
        if base <= 1 {
            0
        } else {
            auto_rarity_clamp_roll_requirement(Some(base as f64))
        }
    };
    let aggregate_min = global_min_raw.max(locked_min_raw);
    if aggregate_min == 0 && !has_per_stat_min {
        return apply_floor(RARITY_CODE_ANY);
    }

    // Base rarity tier derives from aggregate and per-stat minimum pressure.
    let required_rolls = aggregate_min.max(worst_sum_mins).clamp(0, 5);
    if required_rolls >= 5 {
        return apply_floor(RARITY_CODE_MYTHICAL);
    }
    let candidate = match required_rolls {
        0 => RARITY_CODE_ANY,
        1 => RARITY_CODE_GTE_UNCOMMON,
        2 => RARITY_CODE_GTE_RARE,
        3 => RARITY_CODE_GTE_EPIC,
        4 => RARITY_CODE_GTE_LEGENDARY,
        _ => RARITY_CODE_MYTHICAL,
    };

    // Auto resolves against the full +0..+16 progression, not the current window.
    let min_level = LEVEL_MILESTONE_0;
    let baseline_after_start = true;
    let roll_mask_cand = auto_rarity_roll_mask_for_code(candidate);
    let pre_cand = if auto_rarity_includes_mythical(candidate) { 1 } else { 0 };
    let rolls_up_to_16_cand = auto_rarity_count_levels_up_to_mask(roll_mask_cand, LEVEL_MILESTONE_16);
    let rolls_up_to_start_cand = auto_rarity_count_levels_up_to_mask(roll_mask_cand, min_level);
    let target_cand = if baseline_after_start {
        (rolls_up_to_16_cand - rolls_up_to_start_cand).max(0) + pre_cand
    } else {
        rolls_up_to_16_cand + pre_cand
    };

    // Early mode presence safeguard for +0 windows and min-count selections.
    let early_mode = input
        .early_keep_mode
        .as_deref()
        .map(|value| value.trim().to_ascii_lowercase())
        .unwrap_or_else(|| "early".to_string());
    if min_level == LEVEL_MILESTONE_0 && early_mode != "late" {
        let k = min_target_count.clamp(0, 4);
        let required_by_k = match k {
            0 => RARITY_CODE_ANY,
            1 => RARITY_CODE_GTE_UNCOMMON,
            2 => RARITY_CODE_GTE_RARE,
            3 => RARITY_CODE_GTE_EPIC,
            _ => RARITY_CODE_GTE_LEGENDARY,
        };
        if required_by_k != RARITY_CODE_ANY {
            if candidate == RARITY_CODE_ANY && required_v.is_empty() {
                return apply_floor(required_by_k);
            }
            let additions = auto_rarity_addition_mask_for_code(candidate);
            let base_start_cand = (4 - (additions as u32).count_ones() as i64).max(0);
            if base_start_cand < k {
                return apply_floor(required_by_k);
            }
        }
    }

    // Locked substats must physically exist at earliest emitted level.
    let locked_presence_need = (required_v.len() as i64).clamp(0, 4);
    if locked_presence_need > 0 && auto_rarity_present_at_level(candidate, LEVEL_MILESTONE_0) < locked_presence_need {
        for tier in [
            RARITY_CODE_GTE_UNCOMMON,
            RARITY_CODE_GTE_RARE,
            RARITY_CODE_GTE_EPIC,
            RARITY_CODE_GTE_LEGENDARY,
        ] {
            if auto_rarity_present_at_level(tier, LEVEL_MILESTONE_0) >= locked_presence_need {
                return apply_floor(tier);
            }
        }
    }

    // Generic presence safeguard for the selected min-count target.
    if presence_need > 0 && auto_rarity_present_at_level(candidate, LEVEL_MILESTONE_0) < presence_need {
        let tiers = [
            candidate,
            RARITY_CODE_GTE_UNCOMMON,
            RARITY_CODE_GTE_RARE,
            RARITY_CODE_GTE_EPIC,
            RARITY_CODE_GTE_LEGENDARY,
        ];
        for tier in tiers {
            if auto_rarity_present_at_level(tier, LEVEL_MILESTONE_0) >= presence_need {
                return apply_floor(tier);
            }
        }
    }

    // Candidate tier is sufficient when its full-window target can reach required rolls.
    if required_rolls <= target_cand {
        return apply_floor(candidate);
    }
    let roll_mask_myth = auto_rarity_roll_mask_for_code(RARITY_CODE_MYTHICAL);
    let pre_myth = if auto_rarity_includes_mythical(RARITY_CODE_MYTHICAL) { 1 } else { 0 };
    let rolls_up_to_16_myth = auto_rarity_count_levels_up_to_mask(roll_mask_myth, LEVEL_MILESTONE_16);
    let rolls_up_to_start_myth = auto_rarity_count_levels_up_to_mask(roll_mask_myth, min_level);
    let target_myth = if baseline_after_start {
        (rolls_up_to_16_myth - rolls_up_to_start_myth).max(0) + pre_myth
    } else {
        rolls_up_to_16_myth + pre_myth
    };
    if required_rolls <= target_myth {
        return apply_floor(RARITY_CODE_MYTHICAL);
    }
    apply_floor(candidate)
}

// Auto-rarity resolver keeps hsfBuilder rarity-floor/aggregate semantics in Rust.
#[wasm_bindgen]
pub fn resolve_auto_rarity_code_value(payload: JsValue) -> Result<i32, JsValue> {
    let parsed: AutoRarityResolveIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid auto-rarity payload: {error}")))?;
    let code = resolve_auto_rarity_code_core(&parsed);
    Ok(code as i32)
}

// Builder-facing auto-rarity resolver compacts selected/fixed/bounds in Rust.
#[wasm_bindgen]
pub fn resolve_auto_rarity_code_for_builder_value(payload: JsValue) -> Result<i32, JsValue> {
    // Parse typed payload first so malformed callers fail deterministically.
    let parsed: AutoRarityResolveBuilderIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid auto-rarity-builder payload: {error}")))?;
    // Normalize allowed ids into a lookup set for fast filtering.
    let allowed = parsed.allowed_substats.into_iter().collect::<HashSet<_>>();
    // Keep selected stats only when physically compatible with slot/main filters.
    let selected_pool_v = parsed
        .substats_v
        .into_iter()
        .filter(|variant| allowed.contains(variant))
        .collect::<Vec<_>>();
    // Fixed stats must also pass the allowed-substat gate.
    let fixed_pool_raw_v = parsed
        .fixed_substats_v
        .into_iter()
        .filter(|variant| allowed.contains(variant))
        .collect::<Vec<_>>();
    // Resolve locked subset in selected ordering, mirroring TS filter/includes.
    let fixed_pool_v = selected_pool_v
        .iter()
        .copied()
        .filter(|variant| fixed_pool_raw_v.contains(variant))
        .collect::<Vec<_>>();
    // Keep bounds payload compact by forwarding only selected variants.
    let selected_set = selected_pool_v.iter().copied().collect::<HashSet<_>>();
    let mut substat_roll_bounds_v = HashMap::<String, AutoRarityResolveRollBoundsIn>::new();
    for (key, bounds) in parsed.substat_roll_bounds_v {
        let Ok(variant) = key.parse::<i64>() else {
            continue;
        };
        if !selected_set.contains(&variant) {
            continue;
        }
        let normalized = AutoRarityResolveRollBoundsIn {
            min: bounds.min.filter(|value| value.is_finite()),
        };
        if normalized.min.is_some() {
            substat_roll_bounds_v.insert(key, normalized);
        }
    }
    // Reuse the shared core so builder and direct payload paths stay aligned.
    let core_payload = AutoRarityResolveIn {
        auto_rarity_supplements_threshold: parsed.auto_rarity_supplements_threshold,
        auto_min_required_rolls: parsed.auto_min_required_rolls,
        min_required_rolls: parsed.min_required_rolls,
        locked_min_required_rolls: parsed.locked_min_required_rolls,
        min_count: parsed.min_count,
        early_keep_mode: parsed.early_keep_mode,
        selected_pool_v,
        fixed_pool_v,
        substat_roll_bounds_v,
    };
    let code = resolve_auto_rarity_code_core(&core_payload);
    Ok(code as i32)
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
    substat_roll_bounds_v: HashMap<String, BuildHsfComboBoundsIn>,
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

// Input payload for per-combo factory-collapse profile derivation.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfFactoryComboRowsIn {
    combo: Vec<i32>,
    current_base_by_variant: HashMap<String, i32>,
    factory_base_by_variant: HashMap<String, Option<i32>>,
    target_base_override_by_variant: HashMap<String, Option<i32>>,
    substat_roll_bounds_v: HashMap<String, BuildHsfComboBoundsIn>,
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
    substat_roll_bounds_v: HashMap<String, BuildHsfComboBoundsIn>,
}

// Output payload keeps preflight decisions in one rust-owned computation.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildHsfPreflightFlagsOut {
    aggregate_feasible_by_caps: bool,
    has_circled: bool,
}

// Expand builder rarity branches exactly like hsfBuilder.ts.
#[wasm_bindgen]
pub fn build_hsf_rarity_branches_value(payload: JsValue) -> Result<JsValue, JsValue> {
    let input: BuildHsfRarityBranchesIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid build-hsf-rarity-branches payload: {error}")))?;

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

    to_js_value(&branches)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize build-hsf-rarity-branches output: {error}")))
}

// Build branch-level collapse profile and roll timeline from auto-rarity tables.
#[wasm_bindgen]
pub fn build_hsf_branch_collapse_profile_value(payload: JsValue) -> Result<JsValue, JsValue> {
    // Parse typed payload so malformed callers fail with a clear schema error.
    let input: BuildHsfBranchCollapseProfileIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid build-hsf-branch-collapse-profile payload: {error}")))?;
    let out = build_hsf_branch_collapse_profile_core(&input);
    to_js_value(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize build-hsf-branch-collapse-profile output: {error}")))
}

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
#[wasm_bindgen]
pub fn build_hsf_preflight_flags_value(payload: JsValue) -> Result<JsValue, JsValue> {
    // Parse typed payload first so callers receive deterministic schema errors.
    let input: BuildHsfPreflightFlagsIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid build-hsf-preflight-flags payload: {error}")))?;
    // "Circled" means at least one selected stat has an explicit minimum roll.
    let mut has_circled = input.aggregate_min_active;
    if !has_circled {
        for variant in &input.selected_pool_v {
            let key = variant.to_string();
            let min_value = input
                .substat_roll_bounds_v
                .get(&key)
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
            let key = variant.to_string();
            let max_value = input
                .substat_roll_bounds_v
                .get(&key)
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

    let out = BuildHsfPreflightFlagsOut {
        aggregate_feasible_by_caps,
        has_circled,
    };
    to_js_value(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize build-hsf-preflight-flags output: {error}")))
}

// Expand per-level branch counters used by hsfBuilder level loops.
#[wasm_bindgen]
pub fn build_hsf_level_contexts_value(payload: JsValue) -> Result<JsValue, JsValue> {
    // Parse payload first so callers get a focused schema error.
    let input: BuildHsfLevelContextsIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid build-hsf-level-contexts payload: {error}")))?;
    let out = build_hsf_level_contexts_core(&input);
    // Serialize as plain JS objects for direct TS consumption.
    to_js_value(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize build-hsf-level-contexts output: {error}")))
}

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
#[wasm_bindgen]
pub fn build_hsf_level_combos_value(payload: JsValue) -> Result<JsValue, JsValue> {
    // Parse payload into a typed struct for deterministic validation.
    let input: BuildHsfLevelCombosIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid build-hsf-level-combos payload: {error}")))?;
    let out = build_hsf_level_combos_core(&input);

    // Return plain array-of-arrays for direct TS iteration.
    to_js_value(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize build-hsf-level-combos output: {error}")))
}

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
        let optional_combos = compute_combinations_i32(&input.optional_pool_v, need_optional);
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
#[wasm_bindgen]
pub fn build_hsf_timeline_caps_value(payload: JsValue) -> Result<JsValue, JsValue> {
    // Parse typed payload so malformed callers fail with an actionable message.
    let input: BuildHsfTimelineCapsIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid build-hsf-timeline-caps payload: {error}")))?;
    let out = build_hsf_timeline_caps_core(&input);
    // Return matrix aligned 1:1 with input intro assignment ordering.
    to_js_value(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize build-hsf-timeline-caps output: {error}")))
}

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
#[wasm_bindgen]
pub fn build_hsf_intro_assignments_for_level_value(payload: JsValue) -> Result<JsValue, JsValue> {
    // Parse typed payload so malformed callers fail with an actionable message.
    let input: BuildHsfIntroAssignmentsForLevelIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid build-hsf-intro-assignments-for-level payload: {error}")))?;
    let assignments = build_hsf_intro_assignments_for_level_core(&input);
    to_js_value(&assignments)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize build-hsf-intro-assignments-for-level output: {error}")))
}

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
    compute_intro_assignments_for_combo(
        count,
        base_slots,
        &addition_available,
        &forced_base,
    )
}

// Build combo-invariant vectors (bounds/masks/substats/targets) once per combo.
#[wasm_bindgen]
pub fn build_hsf_combo_vectors_value(payload: JsValue) -> Result<JsValue, JsValue> {
    // Parse payload up front so schema errors are explicit.
    let input: BuildHsfComboVectorsIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid build-hsf-combo-vectors payload: {error}")))?;
    let out = build_hsf_combo_vectors_core(&input);
    to_js_value(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize build-hsf-combo-vectors output: {error}")))
}

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
        let key = variant.to_string();
        let bounds = input.substat_roll_bounds_v.get(&key);
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
        let (sub_id, sub_is_flat) = keep_unique_variant_to_sub(*variant as i64);

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

    let out = BuildHsfComboVectorsOut {
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
    };
    out
}

// Build combo-policy vectors once so TS no longer loops masks/reductions per intro.
#[wasm_bindgen]
pub fn build_hsf_combo_policy_vectors_value(payload: JsValue) -> Result<JsValue, JsValue> {
    // Parse payload up front so malformed callers fail with an actionable error.
    let input: BuildHsfComboPolicyVectorsIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid build-hsf-combo-policy-vectors payload: {error}")))?;
    let out = build_hsf_combo_policy_vectors_core(&input);
    to_js_value(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize build-hsf-combo-policy-vectors output: {error}")))
}

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

    let out = BuildHsfComboPolicyVectorsOut {
        sum_min_targeted,
        min_non_target_now,
        optional_rows_only_baseline,
        deficit_floors,
        prefer_virtual_sink,
    };
    out
}

// Build base-value vectors and factory-collapse eligibility per combo in Rust.
#[wasm_bindgen]
pub fn build_hsf_factory_combo_rows_value(payload: JsValue) -> Result<JsValue, JsValue> {
    // Parse typed payload first so callers get deterministic schema errors.
    let input: BuildHsfFactoryComboRowsIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid build-hsf-factory-combo-rows payload: {error}")))?;
    let out = build_hsf_factory_combo_rows_core(&input);
    to_js_value(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize build-hsf-factory-combo-rows output: {error}")))
}

// Shared factory-combo core keeps base-value and collapse gates single-sourced.
pub(crate) fn build_hsf_factory_combo_rows_core(
    input: &BuildHsfFactoryComboRowsIn,
) -> BuildHsfFactoryComboRowsOut {
    build_hsf_factory_combo_rows_from_parts(
        &input.combo,
        &input.current_base_by_variant,
        &input.factory_base_by_variant,
        &input.target_base_override_by_variant,
        &input.substat_roll_bounds_v,
    )
}

// Borrowed-argument factory helper avoids map cloning in branch runtime loops.
pub(crate) fn build_hsf_factory_combo_rows_from_parts(
    combo: &[i32],
    current_base_by_variant: &HashMap<String, i32>,
    factory_base_by_variant: &HashMap<String, Option<i32>>,
    target_base_override_by_variant: &HashMap<String, Option<i32>>,
    substat_roll_bounds_v: &HashMap<String, BuildHsfComboBoundsIn>,
) -> BuildHsfFactoryComboRowsOut {
    // Preserve combo index order so callers can align emitted substats exactly.
    let mut base_vals = Vec::<i32>::with_capacity(combo.len());
    // Convert variants into HSF substat rows once for all collapse emissions.
    let mut substats = Vec::<EmitHsfSubstatIn>::with_capacity(combo.len());
    // Collapse remains true until any per-variant gate fails.
    let mut factory_eligible = true;
    for variant in combo {
        let key = variant.to_string();
        // Keep variant->substat conversion single-sourced in Rust.
        let (sub_id, sub_is_flat) = keep_unique_variant_to_sub(*variant as i64);
        substats.push(EmitHsfSubstatIn {
            id: sub_id,
            is_flat: sub_is_flat,
        });
        // Current base uses the precomputed star bucket map with 0 fallback.
        let current_base = *current_base_by_variant.get(&key).unwrap_or(&0);
        base_vals.push(current_base);
        // Skip expensive checks after first failure but keep base values aligned.
        if !factory_eligible {
            continue;
        }
        // Non-zero minimum bounds always disqualify factory collapse.
        let min_bound = substat_roll_bounds_v
            .get(&key)
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
            .get(&key)
            .and_then(|entry| entry.max)
            .filter(|value| value.is_finite())
            .is_some();
        if has_finite_max {
            factory_eligible = false;
            continue;
        }
        // Factory base must exist for this star/variant pair.
        let factory_base = factory_base_by_variant
            .get(&key)
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
            .get(&key)
            .copied()
            .flatten();
        if let Some(target_base) = target_override_base {
            if target_base != factory_base_value {
                factory_eligible = false;
                continue;
            }
        }
    }
    let out = BuildHsfFactoryComboRowsOut {
        base_vals,
        factory_eligible,
        substats,
    };
    out
}

// Read a JSON object field as a string token.
fn json_field_string(map: &serde_json::Map<String, serde_json::Value>, key: &str) -> Option<String> {
    map.get(key).and_then(|value| value.as_str()).map(|value| value.to_string())
}

// Read a JSON object field as a boolean.
fn json_field_bool(map: &serde_json::Map<String, serde_json::Value>, key: &str) -> Option<bool> {
    map.get(key).and_then(|value| value.as_bool())
}

// Read a JSON object field as an integer (floor semantics).
fn json_field_i64(map: &serde_json::Map<String, serde_json::Value>, key: &str) -> Option<i64> {
    map.get(key).and_then(|value| value.as_f64()).and_then(|value| {
        if value.is_finite() {
            Some(value.floor() as i64)
        } else {
            None
        }
    })
}

// Read a JSON object field as a numeric value.
fn json_field_f64(map: &serde_json::Map<String, serde_json::Value>, key: &str) -> Option<f64> {
    map.get(key).and_then(|value| value.as_f64()).filter(|value| value.is_finite())
}

// Parse array<number> fields from flexible config payloads.
fn json_field_vec_i64(map: &serde_json::Map<String, serde_json::Value>, key: &str) -> Vec<i64> {
    let Some(values) = map.get(key).and_then(|value| value.as_array()) else {
        return Vec::new();
    };
    values
        .iter()
        .filter_map(|entry| entry.as_f64())
        .filter(|value| value.is_finite())
        .map(|value| value.floor() as i64)
        .collect::<Vec<_>>()
}

// Clamp builder min-count domains to the supported 0..4 range.
fn clamp_builder_min_count(value: i64) -> i64 {
    value.clamp(0, 4)
}

// Expand merge.ts auto-flex rarity helper branches using Rust as SSOT.
fn expand_auto_flex_rarity_branches_core(
    config: &serde_json::Value,
    base_rarity_code: i64,
) -> Vec<serde_json::Value> {
    let Some(obj) = config.as_object() else {
        return vec![config.clone()];
    };

    // Preserve JS early-return semantics exactly to avoid branch drift.
    if json_field_string(obj, "rarityMode").as_deref() != Some("auto") {
        return vec![config.clone()];
    }
    if json_field_bool(obj, "autoSubstatFlex") != Some(true) {
        return vec![config.clone()];
    }
    if json_field_bool(obj, "autoMinCount") == Some(true) {
        return vec![config.clone()];
    }

    // Normalize selected/fixed pools to finite integer variant ids.
    let selected = json_field_vec_i64(obj, "substatsV");
    if selected.is_empty() {
        return vec![config.clone()];
    }
    let fixed = json_field_vec_i64(obj, "fixedSubstatsV");
    let locked_count = fixed.len() as i64;
    if locked_count == 0 {
        return vec![config.clone()];
    }
    if json_field_i64(obj, "minCount").unwrap_or(0) != locked_count {
        return vec![config.clone()];
    }
    if json_field_bool(obj, "autoMinRequiredRolls") != Some(false) {
        return vec![config.clone()];
    }

    // Manual minimum rolls gate controls whether late split branches apply.
    let min_required = json_field_f64(obj, "minRequiredRolls").unwrap_or(0.0).floor() as i64;
    if min_required > locked_count {
        return vec![config.clone()];
    }
    let aggregate_matches_locked = min_required == locked_count;

    // Optional pool is the selected set minus locked/fixed selections.
    let fixed_set = fixed.iter().copied().collect::<HashSet<_>>();
    let optional = selected
        .iter()
        .copied()
        .filter(|variant| !fixed_set.contains(variant))
        .collect::<Vec<_>>();
    if optional.is_empty() {
        return vec![config.clone()];
    }

    // Optional entries must remain wildcard-only for this branch split.
    let bounds_map = obj.get("substatRollBoundsV").and_then(|value| value.as_object());
    let optional_all_wildcard = optional.iter().all(|variant| {
        let key = variant.to_string();
        let Some(bounds) = bounds_map.and_then(|map| map.get(&key)).and_then(|value| value.as_object()) else {
            return true;
        };
        let has_min = json_field_f64(bounds, "min").is_some_and(|value| value > 0.0);
        let has_max = json_field_f64(bounds, "max").is_some();
        let wildcard = json_field_bool(bounds, "any").unwrap_or(false);
        wildcard && !has_min && !has_max
    });
    if !optional_all_wildcard {
        return vec![config.clone()];
    }

    // Resolve level window defaults exactly like merge.ts helper.
    let min_level = json_field_i64(obj, "minLevel").unwrap_or(LEVEL_MILESTONE_0);
    let max_level = json_field_i64(obj, "maxLevel").unwrap_or(LEVEL_MILESTONE_16);
    let locked_only_count = clamp_builder_min_count(locked_count);
    let configured_min_count = clamp_builder_min_count(
        json_field_i64(obj, "minCount").unwrap_or(locked_only_count),
    );
    let base_min_count = clamp_builder_min_count(configured_min_count.max(locked_only_count));
    let flex_target_total = clamp_builder_min_count(base_min_count.max(locked_only_count + 1));

    // Helper clones the source config and patches branch-specific overrides.
    let build_branch = |rarity_code: i64, min_count: i64, min_level_patch: Option<i64>, max_level_patch: Option<i64>, auto_substat_flex: bool| {
        let mut branch = config.clone();
        let Some(branch_obj) = branch.as_object_mut() else {
            return config.clone();
        };
        branch_obj.insert("rarityMode".to_string(), serde_json::Value::String("code".to_string()));
        branch_obj.insert("rarityCode".to_string(), serde_json::Value::from(rarity_code));
        branch_obj.insert("autoMinCount".to_string(), serde_json::Value::Bool(false));
        branch_obj.insert("minCount".to_string(), serde_json::Value::from(min_count));
        branch_obj.insert("autoSubstatFlex".to_string(), serde_json::Value::Bool(auto_substat_flex));
        if let Some(value) = min_level_patch {
            branch_obj.insert("minLevel".to_string(), serde_json::Value::from(value));
        }
        if let Some(value) = max_level_patch {
            branch_obj.insert("maxLevel".to_string(), serde_json::Value::from(value));
        }
        branch
    };

    let mut branches = Vec::<serde_json::Value>::new();

    // Baseline branch keeps locked-only expectations before +16.
    let early_epic_max = max_level.min(LEVEL_MILESTONE_12);
    if min_level <= early_epic_max {
        branches.push(build_branch(
            base_rarity_code,
            locked_only_count,
            Some(min_level),
            Some(early_epic_max),
            false,
        ));
    }

    // Late branch appears only when the aggregate target equals locked count.
    let late_epic_min = min_level.max(LEVEL_MILESTONE_16);
    if aggregate_matches_locked && late_epic_min <= max_level {
        branches.push(build_branch(
            base_rarity_code.max(RARITY_CODE_EPIC),
            flex_target_total,
            Some(late_epic_min),
            Some(max_level),
            false,
        ));
    }

    // Legendary-or-range branch mirrors TS fallback behavior.
    branches.push(build_branch(
        base_rarity_code.max(RARITY_CODE_GTE_LEGENDARY),
        if aggregate_matches_locked { flex_target_total } else { base_min_count },
        None,
        None,
        !aggregate_matches_locked,
    ));

    branches
}

// Public merge helper export keeps branch expansion logic in Rust.
#[wasm_bindgen]
pub fn expand_auto_flex_rarity_branches_value(
    config: JsValue,
    base_rarity_code: i32,
) -> Result<JsValue, JsValue> {
    let parsed: serde_json::Value = from_js_value(config)
        .map_err(|error| JsValue::from_str(&format!("Invalid auto-flex branch config: {error}")))?;
    let branches = expand_auto_flex_rarity_branches_core(&parsed, base_rarity_code as i64);
    to_js_value(&branches)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize auto-flex branches: {error}")))
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

// String form used in coarse keys for MainStatF (mirrors template literal behavior).
fn coarse_main_stat_f(value: Option<&serde_json::Value>) -> String {
    match value {
        Some(serde_json::Value::Number(v)) => v.to_string(),
        Some(serde_json::Value::Bool(v)) => v.to_string(),
        Some(serde_json::Value::String(v)) => v.clone(),
        Some(other) => other.to_string(),
        None => MAIN_STAT_F_DEFAULT_STR.to_string(),
    }
}

// Canonical rule-key payload mirrors merge.ts::canonicalRuleKey normalization.
fn canonical_rule_key_core(rule: &RuleRaw) -> String {
    // Keep artifact type/set selectors sorted so click-order never changes keys.
    let mut artifact_types = rule.ArtifactType.clone().unwrap_or_default();
    artifact_types.sort_unstable();
    let mut artifact_sets = rule.ArtifactSet.clone().unwrap_or_default();
    artifact_sets.sort_unstable();

    // Normalize substats into explicit primitive fields with fallback defaults.
    let substats = rule
        .Substats
        .as_ref()
        .map(|rows| {
            rows.iter()
                .map(|sub| {
                    serde_json::json!({
                        "ID": sub.ID,
                        "IsFlat": boolish_to_flag(sub.IsFlat.as_ref()) == 1,
                        "NotAvailable": sub.NotAvailable.unwrap_or(false),
                        "Condition": sub.Condition.clone().unwrap_or_default(),
                        "Value": sub.Value.unwrap_or(0.0),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    // Build a stable primitive object equivalent to TS canonicalRuleKey input.
    let payload = serde_json::json!({
        "Keep": rule.Keep.unwrap_or(false),
        "Use": rule.Use.unwrap_or(true),
        "Rank": rule.Rank.unwrap_or(0),
        "Level": rule.LVLForCheck.unwrap_or(0),
        "Faction": rule.Faction.unwrap_or(0),
        "MainStatID": rule.MainStatID.unwrap_or(STAT_ID_ANY),
        "MainStatF": boolish_to_flag(rule.MainStatF.as_ref()),
        "ArtifactType": artifact_types,
        "ArtifactSet": artifact_sets,
        "Substats": substats,
    });
    serde_json::to_string(&payload).unwrap_or_else(|_| String::new())
}

// Public canonical key export keeps rule normalization in Rust.
#[wasm_bindgen]
pub fn canonical_rule_key_value(rule: JsValue) -> Result<JsValue, JsValue> {
    let parsed: RuleRaw = from_js_value(rule)
        .map_err(|error| JsValue::from_str(&format!("Invalid canonical-rule-key payload: {error}")))?;
    let key = canonical_rule_key_core(&parsed);
    Ok(JsValue::from_str(&key))
}

// Hash helper mirrors useTesterMatchOrchestrator.ts::hashSignature.
fn js_hash_signature(value: &str) -> i32 {
    let mut hash: i32 = 0;
    for code_point in value.chars().map(|ch| ch as i32) {
        hash = hash.wrapping_shl(5).wrapping_sub(hash).wrapping_add(code_point);
    }
    hash
}

// Optional numeric field stringification mirrors String(value ?? '') behavior.
fn optional_i64_to_js_string(value: Option<i64>) -> String {
    value.map(|numeric| numeric.to_string()).unwrap_or_default()
}

// Batch fingerprint helper keeps merged-rule signature loops in Rust.
#[wasm_bindgen]
pub fn fingerprint_merged_rules_value(rules: JsValue) -> Result<JsValue, JsValue> {
    let parsed: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid merged-rules fingerprint payload: {error}")))?;
    if parsed.is_empty() {
        return Ok(JsValue::from_str("0:0"));
    }
    let mut hash: i32 = 0;
    for (idx, rule) in parsed.iter().enumerate() {
        let cfg_idx = rule
            .ConfigID
            .and_then(|cfg_id| if cfg_id > 0 { Some(cfg_id - 1) } else { None });
        let parts = [
            idx.to_string(),
            rule.source.clone().unwrap_or_default(),
            cfg_idx.map(|value| value.to_string()).unwrap_or_else(|| "none".to_string()),
            rule.keep_unique_rule_id.clone().unwrap_or_default(),
            rule.keep_unique_hash.clone().unwrap_or_default(),
            optional_i64_to_js_string(rule.keep_unique_required),
            optional_i64_to_js_string(rule.keep_unique_projected),
            optional_i64_to_js_string(rule.keep_unique_deficit),
            canonical_rule_key_core(rule),
        ];
        let joined = parts.join("|");
        let key_hash = js_hash_signature(&joined);
        hash = hash.wrapping_shl(5).wrapping_sub(hash).wrapping_add(key_hash);
    }
    let signature = format!("{}:{}", parsed.len(), hash);
    Ok(JsValue::from_str(&signature))
}

// Canonical array encoding mirrors JSON.stringify(canonArray(...)) semantics.
fn canon_array_json(values: Option<&Vec<i64>>) -> String {
    let Some(raw) = values else {
        return "undefined".to_string();
    };
    if raw.is_empty() {
        return "undefined".to_string();
    }
    let mut sorted = raw.clone();
    sorted.sort_unstable();
    serde_json::to_string(&sorted).unwrap_or_else(|_| "undefined".to_string())
}

// Parse supported conditions from substat rows.
fn parse_sub_cond(value: Option<&str>) -> Option<SubCond> {
    let trimmed = value.unwrap_or("").trim();
    match trimmed {
        ">=" => Some(SubCond::Gte),
        "<=" => Some(SubCond::Lte),
        _ => None,
    }
}

// Normalize substats for domination checks; unsupported conditions disable domination.
fn normalize_substats_for_domination(subs: Option<&Vec<RuleSubRaw>>) -> Option<Vec<NormalizedSubstat>> {
    let Some(substats) = subs else {
        return None;
    };
    let mut dedup = HashMap::<NormalizedSubKey, i64>::new();
    for sub in substats {
        let id = sub.ID.unwrap_or(STAT_ID_ANY);
        if id == STAT_ID_ANY {
            continue;
        }
        let Some(cond) = parse_sub_cond(sub.Condition.as_deref()) else {
            return None;
        };
        let variant = sub_to_variant(id, boolish_to_flag(sub.IsFlat.as_ref()));
        let key = NormalizedSubKey { variant, cond };
        let value = floor_number_or_zero(sub.Value);
        match dedup.get(&key).copied() {
            None => {
                dedup.insert(key, value);
            }
            Some(previous) => {
                let stricter = match cond {
                    SubCond::Gte => previous.max(value),
                    SubCond::Lte => previous.min(value),
                };
                dedup.insert(key, stricter);
            }
        }
    }
    let mut normalized = dedup
        .into_iter()
        .map(|(key, value)| NormalizedSubstat { key, value })
        .collect::<Vec<_>>();
    normalized.sort_by(|left, right| left.key.cmp(&right.key));
    Some(normalized)
}

// Builder pruning keeps only concrete conditioned substats (no Any/blank rows).
fn normalize_substats_for_builder_pruning(subs: Option<&Vec<RuleSubRaw>>) -> Vec<BuilderNormalizedSubstat> {
    let Some(substats) = subs else {
        return Vec::<BuilderNormalizedSubstat>::new();
    };
    let mut normalized = Vec::<BuilderNormalizedSubstat>::new();
    for sub in substats {
        let id = sub.ID.unwrap_or(STAT_ID_ANY);
        if id == STAT_ID_ANY {
            continue;
        }
        let condition = sub.Condition.clone().unwrap_or_default();
        if condition.is_empty() {
            continue;
        }
        normalized.push(BuilderNormalizedSubstat {
            id,
            is_flat: boolish_to_flag(sub.IsFlat.as_ref()) != 0,
            condition,
            value: sub.Value.unwrap_or(0.0),
        });
    }
    normalized.sort_by(|left, right| {
        if left.id != right.id {
            return left.id.cmp(&right.id);
        }
        if left.is_flat != right.is_flat {
            return left.is_flat.cmp(&right.is_flat);
        }
        if left.condition != right.condition {
            return left.condition.cmp(&right.condition);
        }
        left.value.total_cmp(&right.value)
    });
    normalized
}

// Builder condition coverage mirrors hsfBuilder.ts::conditionValueCovers.
fn builder_condition_value_covers(condition: &str, base_value: f64, candidate_value: f64) -> bool {
    match condition {
        ">=" => candidate_value >= base_value,
        "<=" => candidate_value <= base_value,
        "=" => candidate_value == base_value,
        _ => false,
    }
}

// Builder rule coverage mirrors hsfBuilder.ts::ruleCovers subset matching.
fn builder_rule_covers(general: &[BuilderNormalizedSubstat], target: &[BuilderNormalizedSubstat]) -> bool {
    if general.is_empty() {
        return false;
    }
    if general.len() > target.len() {
        return false;
    }
    let mut remaining = target.to_vec();
    for sub in general {
        let mut match_index = None::<usize>;
        for (idx, candidate) in remaining.iter().enumerate() {
            if candidate.id != sub.id {
                continue;
            }
            if candidate.is_flat != sub.is_flat {
                continue;
            }
            if candidate.condition != sub.condition {
                continue;
            }
            if !builder_condition_value_covers(&sub.condition, sub.value, candidate.value) {
                continue;
            }
            match_index = Some(idx);
            break;
        }
        let Some(idx) = match_index else {
            return false;
        };
        remaining.remove(idx);
    }
    true
}

// Coarse key groups rules by non-substat fields before domination checks.
fn obsolete_coarse_key(rule: &RuleRaw) -> String {
    let keep = i64::from(rule.Keep.unwrap_or(false));
    let use_flag = i64::from(rule.Use.unwrap_or(true));
    let rank = rule.Rank.unwrap_or(RULE_FIELD_UNSET_SENTINEL);
    let rarity = rule.Rarity.unwrap_or(RULE_FIELD_UNSET_SENTINEL);
    let level = rule.LVLForCheck.unwrap_or(RULE_FIELD_UNSET_SENTINEL);
    let faction = rule.Faction.unwrap_or(0);
    let main_id = rule.MainStatID.unwrap_or(STAT_ID_ANY);
    let main_f = coarse_main_stat_f(rule.MainStatF.as_ref());
    let sets = canon_array_json(rule.ArtifactSet.as_ref());
    let types = canon_array_json(rule.ArtifactType.as_ref());
    format!(
        "{keep}|{use_flag}|{rank}|{rarity}|{level}|{faction}|{main_id}:{main_f}|{sets}|{types}"
    )
}

// Substat signature compares only identity/operator, never threshold values.
fn obsolete_signature(subs: &[NormalizedSubstat]) -> String {
    subs.iter()
        .map(|sub| format!("{}:{}", sub.key.variant, sub.key.cond.as_str()))
        .collect::<Vec<_>>()
        .join(",")
}

// Componentwise domination check with stable tie-breaking by index order.
fn obsolete_dominates(
    a: &[NormalizedSubstat],
    b: &[NormalizedSubstat],
    prefer_a_earlier_than_b: bool,
) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut any_strict = false;
    for idx in 0..a.len() {
        let left = &a[idx];
        let right = &b[idx];
        if left.key != right.key {
            return false;
        }
        match left.key.cond {
            SubCond::Gte => {
                if left.value > right.value {
                    return false;
                }
                if left.value < right.value {
                    any_strict = true;
                }
            }
            SubCond::Lte => {
                if left.value < right.value {
                    return false;
                }
                if left.value > right.value {
                    any_strict = true;
                }
            }
        }
    }
    any_strict || prefer_a_earlier_than_b
}

// Canonicalize non-substat fields for epic/legendary duplicate collapse.
fn collapse_canonical_key(rule: &RuleRaw) -> String {
    // Sort type ids so set/type selection order does not affect collapse grouping.
    let mut artifact_types = rule.ArtifactType.clone().unwrap_or_default();
    artifact_types.sort_unstable();
    // Sort set ids for the same reason: input ordering should be irrelevant.
    let mut artifact_sets = rule.ArtifactSet.clone().unwrap_or_default();
    artifact_sets.sort_unstable();
    // Keep original substat slot order to match merge.ts::canonicalRuleKey.
    // The JS canonical key does not reorder the 4 substat positions.
    // Sorting here over-collapses distinct rules that only differ by slot order.
    // Clone once so we can read slots without mutating the original payload.
    let substats = rule.Substats.clone().unwrap_or_default();
    // Serialize each slot to a compact primitive tuple for deterministic keys.
    let substats_key = substats
        .iter()
        .map(|sub| {
            // Keep exactly the same tuple fields as the JS canonicalizer.
            format!(
                "{}:{}:{}:{}:{}",
                sub.ID.unwrap_or(STAT_ID_ANY),
                matches!(sub.IsFlat.as_ref(), Some(serde_json::Value::Bool(true))),
                sub.NotAvailable.unwrap_or(false),
                sub.Condition.as_deref().unwrap_or(""),
                sub.Value.unwrap_or(0.0)
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    // Build one full key that mirrors merge.ts::canonicalRuleKey dimensions.
    format!(
        "{}|{}|{}|{}|{}|{}|{}|{}|{}",
        i64::from(rule.Keep.unwrap_or(false)),
        i64::from(rule.Use.unwrap_or(true)),
        rule.Rank.unwrap_or(0),
        rule.LVLForCheck.unwrap_or(0),
        rule.Faction.unwrap_or(0),
        rule.MainStatID.unwrap_or(STAT_ID_ANY),
        boolish_to_flag(rule.MainStatF.as_ref()),
        artifact_types
            .iter()
            .map(i64::to_string)
            .collect::<Vec<_>>()
            .join(","),
        format!(
            "{}|{}",
            artifact_sets
                .iter()
                .map(i64::to_string)
                .collect::<Vec<_>>()
                .join(","),
            substats_key
        )
    )
}

// Shared obsolete-detector used by find_obsolete and generated-rule finalization.
fn collect_obsolete_entries(rules: &[RuleRaw]) -> Vec<ObsoleteEntryOut> {
    let mut norm_subs = Vec::<Option<Vec<NormalizedSubstat>>>::with_capacity(rules.len());
    let mut groups = HashMap::<String, Vec<usize>>::new();
    let mut group_order = Vec::<String>::new();

    for (idx, rule) in rules.iter().enumerate() {
        let normalized = normalize_substats_for_domination(rule.Substats.as_ref());
        let key = if let Some(ref subs) = normalized {
            format!("{}|{}", obsolete_coarse_key(rule), obsolete_signature(subs))
        } else {
            format!("__NO_DOMINATION__|{idx}")
        };
        if !groups.contains_key(&key) {
            group_order.push(key.clone());
        }
        groups.entry(key).or_default().push(idx);
        norm_subs.push(normalized);
    }

    let mut obsolete = Vec::<ObsoleteEntryOut>::new();
    for key in group_order {
        let Some(indices) = groups.get(&key) else {
            continue;
        };
        if indices.len() <= 1 {
            continue;
        }
        let mut survivors = Vec::<(usize, Vec<NormalizedSubstat>)>::new();
        for idx in indices.iter().copied() {
            let Some(candidate_norm) = norm_subs[idx].as_ref() else {
                continue;
            };
            let mut covered_by = None::<usize>;
            for survivor in &survivors {
                let prefer_survivor = survivor.0 < idx;
                if obsolete_dominates(&survivor.1, candidate_norm, prefer_survivor) {
                    covered_by = Some(survivor.0);
                    break;
                }
            }
            if let Some(cover_idx) = covered_by {
                obsolete.push(ObsoleteEntryOut {
                    index: idx,
                    covered_by: cover_idx,
                    reason: "Covered at same level by looser/equal substat thresholds".to_string(),
                });
                continue;
            }

            let mut s = survivors.len();
            while s > 0 {
                s -= 1;
                let survivor = &survivors[s];
                let prefer_current = idx < survivor.0;
                if obsolete_dominates(candidate_norm, &survivor.1, prefer_current) {
                    obsolete.push(ObsoleteEntryOut {
                        index: survivor.0,
                        covered_by: idx,
                        reason: "Covered at same level by looser/equal substat thresholds".to_string(),
                    });
                    survivors.remove(s);
                }
            }
            survivors.push((idx, candidate_norm.clone()));
        }
    }
    obsolete
}

// Builder pruning obsolete detector mirrors hsfBuilder.ts pairwise subset checks.
fn collect_builder_pruning_obsolete_entries(rules: &[RuleRaw]) -> Vec<ObsoleteEntryOut> {
    let mut groups = HashMap::<String, Vec<usize>>::new();
    let mut group_order = Vec::<String>::new();
    let mut normalized = Vec::<Vec<BuilderNormalizedSubstat>>::with_capacity(rules.len());
    for (idx, rule) in rules.iter().enumerate() {
        let key = obsolete_coarse_key(rule);
        if !groups.contains_key(&key) {
            group_order.push(key.clone());
        }
        groups.entry(key).or_default().push(idx);
        normalized.push(normalize_substats_for_builder_pruning(rule.Substats.as_ref()));
    }

    let mut obsolete = Vec::<ObsoleteEntryOut>::new();
    for key in group_order {
        let Some(indices) = groups.get(&key) else {
            continue;
        };
        if indices.len() <= 1 {
            continue;
        }
        let mut keep = vec![true; indices.len()];
        for i_pos in 0..indices.len() {
            if !keep[i_pos] {
                continue;
            }
            let i_idx = indices[i_pos];
            let general = &normalized[i_idx];
            for j_pos in 0..indices.len() {
                if i_pos == j_pos || !keep[j_pos] {
                    continue;
                }
                let j_idx = indices[j_pos];
                let target = &normalized[j_idx];
                if builder_rule_covers(general, target) {
                    keep[j_pos] = false;
                    obsolete.push(ObsoleteEntryOut {
                        index: j_idx,
                        covered_by: i_idx,
                        reason: "Covered at same level by looser/equal substat thresholds".to_string(),
                    });
                }
            }
        }
    }
    obsolete
}

// Export dedupe normalizes only the three comparison operators supported by TS.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExportDedupeCondition {
    Gte,
    Lte,
    Eq,
}

// Normalized substat tuple mirrors src/lib/hsfDeduplicate.ts comparison shape.
#[derive(Debug, Clone, PartialEq)]
struct ExportDedupeSubstat {
    variant: i64,
    condition: ExportDedupeCondition,
    value: f64,
}

// Base key groups export-dedupe candidates by non-substat dimensions.
#[derive(Debug, Clone, PartialEq, Eq)]
struct ExportDedupeBaseKey {
    use_flag: bool,
    rank: i64,
    rarity: i64,
    level: i64,
    artifact_types: Vec<i64>,
}

// Keep-rule normalization payload used by coverage checks and set merging.
#[derive(Debug, Clone)]
struct ExportDedupeNormalizedRule {
    rule: RuleRaw,
    base_key: ExportDedupeBaseKey,
    sets: Option<Vec<i64>>,
    substats: Vec<ExportDedupeSubstat>,
    main_stat_id: i64,
    main_stat_f: f64,
    faction: i64,
}

// Survivor rows preserve either a normalized keep rule or a skip-only passthrough.
#[derive(Debug, Clone)]
enum ExportDedupeSurvivor {
    Skip(RuleRaw),
    Keep(ExportDedupeNormalizedRule),
}

// Normalize Number-like MainStatF payloads so strings and booleans match TS coercion.
fn numberish_or_default(value: Option<&serde_json::Value>, default: f64) -> f64 {
    match value {
        Some(serde_json::Value::Number(raw)) => raw.as_f64().unwrap_or(default),
        Some(serde_json::Value::Bool(raw)) => {
            if *raw {
                1.0
            } else {
                0.0
            }
        }
        Some(serde_json::Value::String(raw)) => raw.trim().parse::<f64>().unwrap_or(default),
        _ => default,
    }
}

// Parse export-dedupe condition tokens; unsupported values disable normalization.
fn parse_export_dedupe_condition(value: Option<&str>) -> Option<ExportDedupeCondition> {
    let trimmed = value.unwrap_or("").trim();
    match trimmed {
        ">=" => Some(ExportDedupeCondition::Gte),
        "<=" => Some(ExportDedupeCondition::Lte),
        "=" | "==" => Some(ExportDedupeCondition::Eq),
        _ => None,
    }
}

// Keep TS sort order (`<=`, `=`, `>=`) so signatures stay deterministic.
fn export_dedupe_condition_order(value: ExportDedupeCondition) -> i32 {
    match value {
        ExportDedupeCondition::Lte => 0,
        ExportDedupeCondition::Eq => 1,
        ExportDedupeCondition::Gte => 2,
    }
}

// Normalize and dedupe integer arrays exactly once per candidate rule.
fn normalize_i64_array(values: Option<&Vec<i64>>) -> Vec<i64> {
    let mut normalized = values.cloned().unwrap_or_default();
    normalized.sort_unstable();
    normalized.dedup();
    normalized
}

// Set normalization keeps empty selections as wildcards (`None`) like TS.
fn normalize_sets_for_export_dedupe(rule: &RuleRaw) -> Option<Vec<i64>> {
    let normalized = normalize_i64_array(rule.ArtifactSet.as_ref());
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

// Type normalization feeds the base key used to group comparable rules.
fn normalize_types_for_export_dedupe(rule: &RuleRaw) -> Vec<i64> {
    normalize_i64_array(rule.ArtifactType.as_ref())
}

// Normalize substats into comparable tuples; invalid rows disable dedupe for that rule.
fn normalize_substats_for_export_dedupe(subs: Option<&Vec<RuleSubRaw>>) -> Option<Vec<ExportDedupeSubstat>> {
    let Some(substats) = subs else {
        return Some(Vec::<ExportDedupeSubstat>::new());
    };
    let mut normalized = Vec::<ExportDedupeSubstat>::new();
    for sub in substats {
        if sub.NotAvailable.unwrap_or(false) {
            continue;
        }
        let stat_id = sub.ID.unwrap_or(STAT_ID_ANY);
        if stat_id == STAT_ID_ANY {
            continue;
        }
        let Some(condition) = parse_export_dedupe_condition(sub.Condition.as_deref()) else {
            return None;
        };
        let variant = sub_to_variant(stat_id, boolish_to_flag(sub.IsFlat.as_ref()));
        let value = sub.Value.unwrap_or(0.0);
        if !value.is_finite() {
            return None;
        }
        normalized.push(ExportDedupeSubstat {
            variant,
            condition,
            value,
        });
    }
    normalized.sort_by(|left, right| {
        if left.variant != right.variant {
            return left.variant.cmp(&right.variant);
        }
        let left_order = export_dedupe_condition_order(left.condition);
        let right_order = export_dedupe_condition_order(right.condition);
        if left_order != right_order {
            return left_order.cmp(&right_order);
        }
        left.value.total_cmp(&right.value)
    });
    Some(normalized)
}

// Build one normalized keep-rule candidate; invalid substat rows skip dedupe.
fn normalize_keep_rule_for_export_dedupe(rule: &RuleRaw) -> Option<ExportDedupeNormalizedRule> {
    let substats = normalize_substats_for_export_dedupe(rule.Substats.as_ref())?;
    let base_key = ExportDedupeBaseKey {
        use_flag: rule.Use.unwrap_or(true),
        rank: rule.Rank.unwrap_or(RULE_FIELD_UNSET_SENTINEL),
        rarity: rule.Rarity.unwrap_or(RULE_FIELD_UNSET_SENTINEL),
        level: rule.LVLForCheck.unwrap_or(RULE_FIELD_UNSET_SENTINEL),
        artifact_types: normalize_types_for_export_dedupe(rule),
    };
    Some(ExportDedupeNormalizedRule {
        rule: rule.clone(),
        base_key,
        sets: normalize_sets_for_export_dedupe(rule),
        substats,
        main_stat_id: rule.MainStatID.unwrap_or(STAT_ID_ANY),
        main_stat_f: numberish_or_default(rule.MainStatF.as_ref(), 1.0),
        faction: rule.Faction.unwrap_or(0),
    })
}

// Optional set arrays compare as either wildcard (`None`) or exact sorted values.
fn export_dedupe_sets_equal(left: Option<&Vec<i64>>, right: Option<&Vec<i64>>) -> bool {
    match (left, right) {
        (None, None) => true,
        (Some(left_values), Some(right_values)) => left_values == right_values,
        _ => false,
    }
}

// Set-union keeps wildcard semantics (`None`) when either side is unrestricted.
fn export_dedupe_union_sets(left: Option<&Vec<i64>>, right: Option<&Vec<i64>>) -> Option<Vec<i64>> {
    let (Some(left_values), Some(right_values)) = (left, right) else {
        return None;
    };
    let mut merged = left_values.clone();
    merged.extend(right_values.iter().copied());
    merged.sort_unstable();
    merged.dedup();
    Some(merged)
}

// Apply merged set selections back to the cloned rule payload.
fn export_dedupe_apply_sets(rule: &mut RuleRaw, sets: Option<&Vec<i64>>) {
    rule.ArtifactSet = sets.cloned();
}

// Substats are already normalized/sorted, so vector equality is exact tuple equality.
fn export_dedupe_substats_equal(left: &[ExportDedupeSubstat], right: &[ExportDedupeSubstat]) -> bool {
    left == right
}

// Coverage requires each looser tuple to exist in stricter with compatible value.
fn export_dedupe_substats_cover(looser: &[ExportDedupeSubstat], stricter: &[ExportDedupeSubstat]) -> bool {
    for requirement in looser {
        let counterpart = stricter
            .iter()
            .find(|candidate| {
                candidate.variant == requirement.variant
                    && candidate.condition == requirement.condition
            });
        let Some(candidate) = counterpart else {
            return false;
        };
        match requirement.condition {
            ExportDedupeCondition::Gte => {
                if requirement.value > candidate.value {
                    return false;
                }
            }
            ExportDedupeCondition::Lte => {
                if requirement.value < candidate.value {
                    return false;
                }
            }
            ExportDedupeCondition::Eq => {
                if requirement.value != candidate.value {
                    return false;
                }
            }
        }
    }
    true
}

// Set coverage treats `None` as wildcard and concrete arrays as subset checks.
fn export_dedupe_sets_cover(looser: Option<&Vec<i64>>, stricter: Option<&Vec<i64>>) -> bool {
    match (looser, stricter) {
        (None, _) => true,
        (Some(_), None) => false,
        (Some(loose_values), Some(strict_values)) => {
            let loose_set = loose_values.iter().copied().collect::<HashSet<_>>();
            strict_values.iter().all(|value| loose_set.contains(value))
        }
    }
}

// Main-stat exact equality mirrors TS strict numeric comparison.
fn export_dedupe_main_stat_equal_exact(
    left: &ExportDedupeNormalizedRule,
    right: &ExportDedupeNormalizedRule,
) -> bool {
    left.main_stat_id == right.main_stat_id && left.main_stat_f == right.main_stat_f
}

// Main-stat coverage allows wildcard (`Any`) on the looser side.
fn export_dedupe_main_stat_covers(
    looser: &ExportDedupeNormalizedRule,
    stricter: &ExportDedupeNormalizedRule,
) -> bool {
    if looser.main_stat_id == STAT_ID_ANY {
        return true;
    }
    looser.main_stat_id == stricter.main_stat_id && looser.main_stat_f == stricter.main_stat_f
}

// Faction exact equality is used for duplicate-merge checks.
fn export_dedupe_faction_equal_exact(
    left: &ExportDedupeNormalizedRule,
    right: &ExportDedupeNormalizedRule,
) -> bool {
    left.faction == right.faction
}

// Faction coverage allows wildcard faction `0` on the looser side.
fn export_dedupe_faction_covers(
    looser: &ExportDedupeNormalizedRule,
    stricter: &ExportDedupeNormalizedRule,
) -> bool {
    if looser.faction == 0 {
        return true;
    }
    looser.faction == stricter.faction
}

// Full rule coverage check mirrors hsfDeduplicate.ts::covers.
fn export_dedupe_covers(
    looser: &ExportDedupeNormalizedRule,
    stricter: &ExportDedupeNormalizedRule,
) -> bool {
    if looser.base_key != stricter.base_key {
        return false;
    }
    if !export_dedupe_main_stat_covers(looser, stricter) {
        return false;
    }
    if !export_dedupe_faction_covers(looser, stricter) {
        return false;
    }
    if !export_dedupe_sets_cover(looser.sets.as_ref(), stricter.sets.as_ref()) {
        return false;
    }
    export_dedupe_substats_cover(&looser.substats, &stricter.substats)
}

// Deduplicate one contiguous keep segment while preserving original order semantics.
fn dedupe_keep_segment_for_export(segment: &[RuleRaw]) -> Vec<RuleRaw> {
    let mut survivors = Vec::<ExportDedupeSurvivor>::new();
    for original in segment {
        if original.Use == Some(false) {
            survivors.push(ExportDedupeSurvivor::Skip(original.clone()));
            continue;
        }
        let mut candidate_rule = original.clone();
        let Some(mut normalized) = normalize_keep_rule_for_export_dedupe(&candidate_rule) else {
            survivors.push(ExportDedupeSurvivor::Skip(candidate_rule));
            continue;
        };
        let mut redundant = false;
        let mut idx = 0usize;
        while idx < survivors.len() && !redundant {
            let survivor_snapshot = match survivors.get(idx) {
                Some(ExportDedupeSurvivor::Skip(_)) => {
                    idx += 1;
                    continue;
                }
                Some(ExportDedupeSurvivor::Keep(survivor)) => survivor.clone(),
                None => break,
            };
            if survivor_snapshot.base_key != normalized.base_key {
                idx += 1;
                continue;
            }
            if export_dedupe_substats_equal(&survivor_snapshot.substats, &normalized.substats)
                && export_dedupe_main_stat_equal_exact(&survivor_snapshot, &normalized)
                && export_dedupe_faction_equal_exact(&survivor_snapshot, &normalized)
            {
                let merged_sets =
                    export_dedupe_union_sets(survivor_snapshot.sets.as_ref(), normalized.sets.as_ref());
                if !export_dedupe_sets_equal(survivor_snapshot.sets.as_ref(), merged_sets.as_ref()) {
                    if let Some(ExportDedupeSurvivor::Keep(survivor_mut)) = survivors.get_mut(idx) {
                        survivor_mut.sets = merged_sets.clone();
                        export_dedupe_apply_sets(&mut survivor_mut.rule, merged_sets.as_ref());
                    }
                }
                redundant = true;
                break;
            }
            if export_dedupe_covers(&survivor_snapshot, &normalized) {
                redundant = true;
                break;
            }
            if export_dedupe_covers(&normalized, &survivor_snapshot) {
                let merged_sets =
                    export_dedupe_union_sets(normalized.sets.as_ref(), survivor_snapshot.sets.as_ref());
                survivors.remove(idx);
                export_dedupe_apply_sets(&mut candidate_rule, merged_sets.as_ref());
                normalized.sets = merged_sets;
                normalized.rule = candidate_rule.clone();
                continue;
            }
            idx += 1;
        }
        if !redundant {
            survivors.push(ExportDedupeSurvivor::Keep(normalized));
        }
    }
    survivors
        .into_iter()
        .map(|entry| match entry {
            ExportDedupeSurvivor::Skip(rule) => rule,
            ExportDedupeSurvivor::Keep(normalized) => normalized.rule,
        })
        .collect::<Vec<_>>()
}

// Flush helper keeps segment handling centralized for top-level export dedupe.
fn flush_export_keep_segment(output: &mut Vec<RuleRaw>, keep_segment: &mut Vec<RuleRaw>) {
    if keep_segment.is_empty() {
        return;
    }
    let deduped = dedupe_keep_segment_for_export(keep_segment);
    output.extend(deduped);
    keep_segment.clear();
}

// Top-level export dedupe keeps keep segments isolated by `Keep === false` rows.
fn dedupe_hsf_rules_for_export_core(rules: &[RuleRaw]) -> Vec<RuleRaw> {
    if rules.len() <= 1 {
        return rules.to_vec();
    }
    let mut output = Vec::<RuleRaw>::new();
    let mut keep_segment = Vec::<RuleRaw>::new();
    for rule in rules {
        if rule.Keep == Some(true) {
            keep_segment.push(rule.clone());
            continue;
        }
        flush_export_keep_segment(&mut output, &mut keep_segment);
        output.push(rule.clone());
    }
    flush_export_keep_segment(&mut output, &mut keep_segment);
    output
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
fn artifact_type_order_value(slot: i64) -> i64 {
    match slot {
        ARTIFACT_TYPE_WEAPON => 0,
        ARTIFACT_TYPE_HELMET => 1,
        ARTIFACT_TYPE_SHIELD => 2,
        ARTIFACT_TYPE_GAUNTLETS => 3,
        ARTIFACT_TYPE_CHESTPLATE => 4,
        ARTIFACT_TYPE_BOOTS => 5,
        ARTIFACT_TYPE_RING => 6,
        ARTIFACT_TYPE_AMULET => 7,
        ARTIFACT_TYPE_BANNER => 8,
        other => 100 + other,
    }
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

// Enumerate integer compositions with deterministic ordering that matches
// hsfBuilder.ts::rollDistributions (leftmost dimension increments first).
fn enumerate_roll_distributions(
    dimensions: i32,
    total: i32,
    idx: i32,
    acc: &mut Vec<i32>,
    out: &mut Vec<Vec<i32>>,
) {
    if idx == dimensions - 1 {
        let mut row = acc.clone();
        row.push(total);
        out.push(row);
        return;
    }
    let mut value = 0;
    while value <= total {
        acc.push(value);
        enumerate_roll_distributions(dimensions, total - value, idx + 1, acc, out);
        acc.pop();
        value += 1;
    }
}

// Aggregate gates for distribution filtering mirror the JS builder modes:
// strict (>= now), feasible-by-target (>= now OR recoverable by remaining),
// or disabled (no aggregate filter).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DistributionAggregateMode {
    None,
    GteNow,
    FeasibleByTarget,
}

// Parse numeric mode tokens from JS payloads into an enum so the filter loop
// does not branch on magic numbers repeatedly.
fn parse_distribution_mode(raw: i32) -> DistributionAggregateMode {
    match raw {
        1 => DistributionAggregateMode::GteNow,
        2 => DistributionAggregateMode::FeasibleByTarget,
        _ => DistributionAggregateMode::None,
    }
}

// Apply aggregate gate semantics shared by global and locked minimum checks.
fn distribution_sum_passes_mode(
    sum: i32,
    required_min: i32,
    remaining: i32,
    mode: DistributionAggregateMode,
) -> bool {
    if required_min <= 0 {
        return true;
    }
    match mode {
        DistributionAggregateMode::None => true,
        DistributionAggregateMode::GteNow => sum >= required_min,
        DistributionAggregateMode::FeasibleByTarget => {
            if sum >= required_min {
                true
            } else {
                let shortfall = required_min - sum;
                shortfall <= remaining.max(0)
            }
        }
    }
}

// Enumerate combinations by index order to mirror TS helper ordering.
fn enumerate_combinations_i32(
    values: &[i32],
    pick: usize,
    start: usize,
    path: &mut Vec<i32>,
    out: &mut Vec<Vec<i32>>,
) {
    if path.len() == pick {
        out.push(path.clone());
        return;
    }
    let mut idx = start;
    while idx < values.len() {
        path.push(values[idx]);
        enumerate_combinations_i32(values, pick, idx + 1, path, out);
        path.pop();
        idx += 1;
    }
}

// Enumerate permutations in deterministic index order (same as TS backtracking).
fn enumerate_permutations_i32(values: &[i32], used: &mut Vec<bool>, path: &mut Vec<i32>, out: &mut Vec<Vec<i32>>) {
    if path.len() == values.len() {
        out.push(path.clone());
        return;
    }
    let mut idx = 0;
    while idx < values.len() {
        if used[idx] {
            idx += 1;
            continue;
        }
        used[idx] = true;
        path.push(values[idx]);
        enumerate_permutations_i32(values, used, path, out);
        path.pop();
        used[idx] = false;
        idx += 1;
    }
}

// Shared filtering core for distribution helpers (JSON and fast array variants).
fn filter_roll_distributions_core(
    dimensions: i32,
    total: i32,
    max_caps: &[Option<i32>],
    min_floors: &[Option<i32>],
    timeline_caps: &[Option<i32>],
    targeted_mask: &[bool],
    targeted_exact: Option<i32>,
    deficit_floors: &[Option<i32>],
    deficit_max: Option<i32>,
    global_min: i32,
    global_remaining: i32,
    global_filter: DistributionAggregateMode,
    locked_mask: &[bool],
    locked_min: i32,
    locked_remaining: i32,
    locked_filter: DistributionAggregateMode,
) -> Vec<Vec<i32>> {
    if dimensions <= 0 {
        return if total == 0 {
            vec![Vec::<i32>::new()]
        } else {
            Vec::<Vec<i32>>::new()
        };
    }
    if total < 0 {
        return Vec::<Vec<i32>>::new();
    }

    let dims = dimensions as usize;
    let mut out = Vec::<Vec<i32>>::new();
    let mut acc = Vec::<i32>::new();

    struct DistributionFilterCtx<'a> {
        dims: usize,
        max_caps: &'a [Option<i32>],
        min_floors: &'a [Option<i32>],
        timeline_caps: &'a [Option<i32>],
        targeted_mask: &'a [bool],
        targeted_exact: Option<i32>,
        deficit_floors: &'a [Option<i32>],
        deficit_max: Option<i32>,
        global_min: i32,
        global_remaining: i32,
        global_filter: DistributionAggregateMode,
        locked_mask: &'a [bool],
        locked_min: i32,
        locked_remaining: i32,
        locked_filter: DistributionAggregateMode,
    }

    // Recursive filter avoids materializing all compositions up front.
    // This keeps heap churn low in hot hsfBuilder call sites.
    fn backtrack_filtered(
        idx: usize,
        remaining: i32,
        targeted_sum_so_far: i32,
        locked_sum_so_far: i32,
        deficit_so_far: i32,
        acc: &mut Vec<i32>,
        out: &mut Vec<Vec<i32>>,
        ctx: &DistributionFilterCtx<'_>,
    ) {
        if let Some(targeted_exact_sum) = ctx.targeted_exact {
            if targeted_sum_so_far > targeted_exact_sum {
                return;
            }
        }
        if let Some(max_deficit) = ctx.deficit_max {
            if deficit_so_far > max_deficit {
                return;
            }
        }
        if idx == ctx.dims - 1 {
            let value = remaining;
            if value < 0 {
                return;
            }
            if let Some(Some(cap)) = ctx.max_caps.get(idx) {
                if value > *cap {
                    return;
                }
            }
            if let Some(Some(floor)) = ctx.min_floors.get(idx) {
                if value < *floor {
                    return;
                }
            }
            if let Some(Some(cap)) = ctx.timeline_caps.get(idx) {
                if value > *cap {
                    return;
                }
            }
            let targeted_sum = targeted_sum_so_far
                + if ctx.targeted_mask.get(idx).copied().unwrap_or(false) {
                    value
                } else {
                    0
                };
            if let Some(targeted_exact_sum) = ctx.targeted_exact {
                if targeted_sum != targeted_exact_sum {
                    return;
                }
            }
            if !distribution_sum_passes_mode(
                targeted_sum,
                ctx.global_min,
                ctx.global_remaining,
                ctx.global_filter,
            ) {
                return;
            }
            let next_deficit = deficit_so_far
                + match ctx.deficit_floors.get(idx).copied().flatten() {
                    Some(floor) if value < floor => floor - value,
                    _ => 0,
                };
            if let Some(max_deficit) = ctx.deficit_max {
                if next_deficit > max_deficit {
                    return;
                }
            }
            let locked_sum = locked_sum_so_far
                + if ctx.locked_mask.get(idx).copied().unwrap_or(false) {
                    value
                } else {
                    0
                };
            if !distribution_sum_passes_mode(
                locked_sum,
                ctx.locked_min,
                ctx.locked_remaining,
                ctx.locked_filter,
            ) {
                return;
            }
            let mut row = acc.clone();
            row.push(value);
            out.push(row);
            return;
        }

        let mut value = 0;
        while value <= remaining {
            if let Some(Some(cap)) = ctx.max_caps.get(idx) {
                if value > *cap {
                    value += 1;
                    continue;
                }
            }
            if let Some(Some(floor)) = ctx.min_floors.get(idx) {
                if value < *floor {
                    value += 1;
                    continue;
                }
            }
            if let Some(Some(cap)) = ctx.timeline_caps.get(idx) {
                if value > *cap {
                    value += 1;
                    continue;
                }
            }

            let targeted_sum = targeted_sum_so_far
                + if ctx.targeted_mask.get(idx).copied().unwrap_or(false) {
                    value
                } else {
                    0
                };
            let locked_sum = locked_sum_so_far
                + if ctx.locked_mask.get(idx).copied().unwrap_or(false) {
                    value
                } else {
                    0
                };
            let next_deficit = deficit_so_far
                + match ctx.deficit_floors.get(idx).copied().flatten() {
                    Some(floor) if value < floor => floor - value,
                    _ => 0,
                };
            acc.push(value);
            backtrack_filtered(
                idx + 1,
                remaining - value,
                targeted_sum,
                locked_sum,
                next_deficit,
                acc,
                out,
                ctx,
            );
            acc.pop();
            value += 1;
        }
    }

    let ctx = DistributionFilterCtx {
        dims,
        max_caps,
        min_floors,
        timeline_caps,
        targeted_mask,
        targeted_exact,
        deficit_floors,
        deficit_max,
        global_min,
        global_remaining,
        global_filter,
        locked_mask,
        locked_min,
        locked_remaining,
        locked_filter,
    };
    backtrack_filtered(0, total, 0, 0, 0, &mut acc, &mut out, &ctx);
    out
}

// Shared combinations core to serve JSON and fast-array bindings.
fn compute_combinations_i32(values: &[i32], pick: i32) -> Vec<Vec<i32>> {
    if pick <= 0 {
        return vec![Vec::<i32>::new()];
    }
    let pick_usize = pick as usize;
    if pick_usize > values.len() {
        return Vec::<Vec<i32>>::new();
    }
    let mut out = Vec::<Vec<i32>>::new();
    let mut path = Vec::<i32>::new();
    enumerate_combinations_i32(values, pick_usize, 0, &mut path, &mut out);
    out
}

// Shared permutations core to serve JSON and fast-array bindings.
fn compute_permutations_i32(values: &[i32]) -> Vec<Vec<i32>> {
    if values.len() <= 1 {
        return vec![values.to_vec()];
    }
    let mut out = Vec::<Vec<i32>>::new();
    let mut used = vec![false; values.len()];
    let mut path = Vec::<i32>::new();
    enumerate_permutations_i32(values, &mut used, &mut path, &mut out);
    out
}

// Enumerate bounded compositions in deterministic index order.
fn enumerate_bounded_compositions_i32(
    caps: &[i32],
    total: i32,
    idx: usize,
    path: &mut Vec<i32>,
    out: &mut Vec<Vec<i32>>,
) {
    if idx == caps.len() {
        if total == 0 {
            out.push(path.clone());
        }
        return;
    }
    if total < 0 {
        return;
    }
    let cap = std::cmp::max(0, caps[idx]);
    let max_take = std::cmp::min(cap, total);
    let mut value = 0;
    while value <= max_take {
        path.push(value);
        enumerate_bounded_compositions_i32(caps, total - value, idx + 1, path, out);
        path.pop();
        value += 1;
    }
}

// Shared bounded-compositions core for late-mode extra allocation loops.
fn compute_bounded_compositions_i32(caps: &[i32], total: i32) -> Vec<Vec<i32>> {
    if total < 0 {
        return Vec::<Vec<i32>>::new();
    }
    if caps.is_empty() {
        return if total == 0 {
            vec![Vec::<i32>::new()]
        } else {
            Vec::<Vec<i32>>::new()
        };
    }
    let mut out = Vec::<Vec<i32>>::new();
    let mut path = Vec::<i32>::new();
    enumerate_bounded_compositions_i32(caps, total, 0, &mut path, &mut out);
    out
}

// Enumerate bounded compositions and keep only rows that satisfy additional
// locked/optional filters used by late-mode HSF emission loops.
fn enumerate_filtered_bounded_rows_with_offset_i32(
    caps: &[i32],
    total: i32,
    idx: usize,
    path: &mut Vec<i32>,
    need_now: &[i32],
    locked_mask: &[u8],
    locked_base_sum: i32,
    locked_min_at_level: i32,
    optional_mask: &[u8],
    mins: &[i32],
    skip_optional_baseline: bool,
    out: &mut Vec<Vec<i32>>,
) {
    if idx == caps.len() {
        if total != 0 {
            return;
        }
        if locked_min_at_level > 0 {
            let mut locked_after = locked_base_sum;
            for (i, value) in path.iter().enumerate() {
                if *locked_mask.get(i).unwrap_or(&0) != 0 {
                    locked_after += *value;
                }
            }
            if locked_after < locked_min_at_level {
                return;
            }
        }
        if skip_optional_baseline {
            let mut optional_only_baseline = true;
            let mut has_optional = false;
            for i in 0..path.len() {
                if *optional_mask.get(i).unwrap_or(&0) == 0 {
                    continue;
                }
                has_optional = true;
                if *mins.get(i).unwrap_or(&0) != 0 {
                    optional_only_baseline = false;
                    break;
                }
                let applied = need_now.get(i).copied().unwrap_or(0) + path[i];
                if applied != 0 {
                    optional_only_baseline = false;
                    break;
                }
            }
            if has_optional && optional_only_baseline {
                return;
            }
        }
        let mut row = Vec::<i32>::with_capacity(path.len());
        for (i, value) in path.iter().enumerate() {
            row.push(need_now.get(i).copied().unwrap_or(0) + *value);
        }
        out.push(row);
        return;
    }
    if total < 0 {
        return;
    }
    let cap = std::cmp::max(0, caps[idx]);
    let max_take = std::cmp::min(cap, total);
    let mut value = 0;
    while value <= max_take {
        path.push(value);
        enumerate_filtered_bounded_rows_with_offset_i32(
            caps,
            total - value,
            idx + 1,
            path,
            need_now,
            locked_mask,
            locked_base_sum,
            locked_min_at_level,
            optional_mask,
            mins,
            skip_optional_baseline,
            out,
        );
        path.pop();
        value += 1;
    }
}

fn compute_filtered_bounded_rows_with_offset_i32(
    caps: &[i32],
    total: i32,
    need_now: &[i32],
    locked_mask: &[u8],
    locked_base_sum: i32,
    locked_min_at_level: i32,
    optional_mask: &[u8],
    mins: &[i32],
    skip_optional_baseline: bool,
) -> Vec<Vec<i32>> {
    if total < 0 {
        return Vec::<Vec<i32>>::new();
    }
    if caps.is_empty() {
        return if total == 0 {
            vec![Vec::<i32>::new()]
        } else {
            Vec::<Vec<i32>>::new()
        };
    }
    if need_now.len() != caps.len() {
        return Vec::<Vec<i32>>::new();
    }
    let mut out = Vec::<Vec<i32>>::new();
    let mut path = Vec::<i32>::with_capacity(caps.len());
    enumerate_filtered_bounded_rows_with_offset_i32(
        caps,
        total,
        0,
        &mut path,
        need_now,
        locked_mask,
        locked_base_sum,
        locked_min_at_level,
        optional_mask,
        mins,
        skip_optional_baseline,
        &mut out,
    );
    out
}

// Convert optional max-cap sentinel into a concrete cap used by late-mode math.
fn late_rows_resolve_cap(raw: i32) -> i32 {
    if raw <= FILTER_OPTION_NONE_I32 {
        4
    } else {
        raw.clamp(0, 4)
    }
}

// Build per-index late need-now floors and validate they fit configured caps.
fn late_rows_build_need_now(
    mins: &[i32],
    max_caps: &[i32],
    any_flags: &[u8],
    remaining: i32,
) -> Option<(Vec<i32>, i32)> {
    let mut need_now = Vec::<i32>::with_capacity(mins.len());
    let mut sum_need = 0i32;
    for idx in 0..mins.len() {
        let min_value = mins[idx];
        let cap = late_rows_resolve_cap(*max_caps.get(idx).unwrap_or(&FILTER_OPTION_NONE_I32));
        let any_flag = *any_flags.get(idx).unwrap_or(&0) != 0;
        let need = if any_flag {
            0
        } else {
            (min_value - remaining).max(0)
        };
        // Over-cap need rows are infeasible and produce no candidates.
        if need > cap {
            return None;
        }
        need_now.push(need);
        sum_need += need;
    }
    Some((need_now, sum_need))
}

// Build late-mode bounded candidate rows for targeted or strict branches.
// Kept as a pure core helper so multiple exports can reuse identical logic.
fn build_hsf_late_bounded_rows_core(input: &BuildHsfLateBoundedRowsIn) -> Vec<Vec<i32>> {
    // Empty mins produce no bounded rows.
    if input.mins.is_empty() {
        return Vec::<Vec<i32>>::new();
    }
    // Need-now floors are shared across late branch modes.
    let Some((need_now, sum_need)) = late_rows_build_need_now(
        &input.mins,
        &input.max_caps,
        &input.any_flags,
        input.remaining,
    ) else {
        return Vec::<Vec<i32>>::new();
    };
    let mode = input.mode.trim().to_ascii_lowercase();
    let m = input.mins.len();
    let mut add_caps = vec![0i32; m];
    let extra: i32;
    // Locked feasibility gate is shared for both late modes.
    let base_locked_need = (0..m)
        .map(|idx| {
            if *input.locked_mask.get(idx).unwrap_or(&0) != 0 {
                need_now[idx]
            } else {
                0
            }
        })
        .sum::<i32>();
    let locked_need_at_level = if input.locked_min_active {
        (input.locked_min_value - input.remaining).max(0)
    } else {
        0
    };
    let optional_mask = if mode == "strict" {
        vec![0u8; m]
    } else {
        input.optional_mask.clone()
    };
    let skip_optional_baseline = mode == "targeted"
        && (m as i32 > input.min_target_count)
        && optional_mask.iter().any(|flag| *flag != 0);

    if mode == "targeted" {
        // Targeted late branch allows additional room to satisfy aggregate floors.
        let sum_need_targeted = (0..m)
            .map(|idx| {
                if *input.targeted_mask.get(idx).unwrap_or(&0) != 0 {
                    need_now[idx]
                } else {
                    0
                }
            })
            .sum::<i32>();
        let min_agg_now = if input.global_min > 0 {
            (input.global_min - input.remaining).max(0)
        } else {
            0
        };
        let extra_targeted = (min_agg_now - sum_need_targeted).max(0);
        let min_now_required = (input.sum_min - input.remaining).max(0) + extra_targeted;
        if min_now_required > input.avail {
            return Vec::<Vec<i32>>::new();
        }
        extra = (min_now_required - sum_need).max(0);
        for idx in 0..m {
            let cap = late_rows_resolve_cap(*input.max_caps.get(idx).unwrap_or(&FILTER_OPTION_NONE_I32));
            let base_room = (input.mins[idx].min(cap) - need_now[idx]).max(0);
            let room = if extra_targeted > 0 {
                (cap - need_now[idx]).max(0)
            } else {
                base_room
            };
            add_caps[idx] = if *input.targeted_mask.get(idx).unwrap_or(&0) != 0 {
                room
            } else {
                0
            };
        }
    } else if mode == "strict" {
        // Strict late branch only allocates within per-stat minimum ceilings.
        let min_now_required = (input.sum_min - input.remaining).max(0);
        if min_now_required > input.avail {
            return Vec::<Vec<i32>>::new();
        }
        extra = (min_now_required - sum_need).max(0);
        if input.sum_min > input.num_target {
            return Vec::<Vec<i32>>::new();
        }
        if input.global_min > 0 {
            if input.global_min > input.num_target {
                return Vec::<Vec<i32>>::new();
            }
            let add_cap_total = (0..m)
                .map(|idx| {
                    let cap = late_rows_resolve_cap(*input.max_caps.get(idx).unwrap_or(&FILTER_OPTION_NONE_I32));
                    (cap - input.mins[idx]).max(0)
                })
                .sum::<i32>();
            if (input.global_min - input.sum_min) > add_cap_total {
                return Vec::<Vec<i32>>::new();
            }
        }
        for idx in 0..m {
            let cap = late_rows_resolve_cap(*input.max_caps.get(idx).unwrap_or(&FILTER_OPTION_NONE_I32));
            add_caps[idx] = (input.mins[idx].min(cap) - need_now[idx]).max(0);
        }
    } else {
        // Unknown mode is treated as no rows so callers fail closed.
        return Vec::<Vec<i32>>::new();
    }

    compute_filtered_bounded_rows_with_offset_i32(
        &add_caps,
        extra,
        &need_now,
        &input.locked_mask,
        base_locked_need,
        locked_need_at_level,
        &optional_mask,
        &input.mins,
        skip_optional_baseline,
    )
}

// Build late-mode bounded candidate rows for targeted or strict branches.
#[wasm_bindgen]
pub fn build_hsf_late_bounded_rows_value(payload: JsValue) -> Result<JsValue, JsValue> {
    // Parse typed payload so schema errors are explicit for callers.
    let input: BuildHsfLateBoundedRowsIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid build-hsf-late-bounded-rows payload: {error}")))?;
    let rows = build_hsf_late_bounded_rows_core(&input);
    to_js_value(&rows)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize build-hsf-late-bounded-rows output: {error}")))
}

// Build intro-level emission plans for strict/potential early/late branches.
// This keeps the largest hsfBuilder policy matrix in Rust (single source).
#[wasm_bindgen]
pub fn build_hsf_intro_mode_plan_value(payload: JsValue) -> Result<JsValue, JsValue> {
    hsf_intro_mode_plan::build_hsf_intro_mode_plan_value(payload)
}

// Full-selected fallback planning is split into a small module so this top-level
// file stays focused on export wiring and shared utility code.
#[wasm_bindgen]
pub fn build_hsf_full_selected_fallback_plan_value(payload: JsValue) -> Result<JsValue, JsValue> {
    hsf_full_selected_fallback::build_hsf_full_selected_fallback_plan_value(payload)
}

// Full-selected fallback execution keeps the remaining early-potential branch
// in Rust so hsfBuilder no longer emits these rows from TypeScript loops.
#[wasm_bindgen]
pub fn execute_hsf_full_selected_fallback_value(payload: JsValue) -> Result<JsValue, JsValue> {
    hsf_full_selected_fallback::execute_hsf_full_selected_fallback_value(payload)
}

// Branch runtime execution keeps per-branch level+combo loops in Rust so
// hsfBuilder can delegate the largest remaining orchestration branch.
#[wasm_bindgen]
pub fn execute_hsf_branch_runtime_value(payload: JsValue) -> Result<JsValue, JsValue> {
    hsf_branch_execution::execute_hsf_branch_runtime_value(payload)
}

// Builder runtime execution keeps cross-branch orchestration in Rust so
// hsfBuilder can issue one non-presence runtime call per config.
#[wasm_bindgen]
pub fn execute_hsf_builder_runtime_value(payload: JsValue) -> Result<JsValue, JsValue> {
    hsf_builder_execution::execute_hsf_builder_runtime_value(payload)
}

// Intro execution is split into its own module so hsfBuilder runtime branching
// can keep moving out of TypeScript without inflating this root file further.
#[wasm_bindgen]
pub fn execute_hsf_intro_plan_value(payload: JsValue) -> Result<JsValue, JsValue> {
    hsf_intro_execution::execute_hsf_intro_plan_value(payload)
}

// Combo runtime execution keeps combo-level policy/timeline dispatch in Rust.
#[wasm_bindgen]
pub fn execute_hsf_combo_runtime_value(payload: JsValue) -> Result<JsValue, JsValue> {
    hsf_combo_runtime::execute_hsf_combo_runtime_value(payload)
}

// Level+combo runtime execution keeps collapse/presence/runtime branch logic in Rust.
#[wasm_bindgen]
pub fn execute_hsf_level_combo_value(payload: JsValue) -> Result<JsValue, JsValue> {
    hsf_level_combo_execution::execute_hsf_level_combo_value(payload)
}

// Shared intro-assignment core to serve JSON and fast-array bindings.
fn compute_intro_assignments_for_combo(
    count: i32,
    base_slots: i32,
    addition_levels: &[i32],
    forced_base_raw: &[i32],
) -> Vec<Vec<i32>> {
    if count <= 0 {
        return vec![Vec::<i32>::new()];
    }
    let safe_count = count as usize;
    let total_base = std::cmp::max(0, std::cmp::min(base_slots, count)) as usize;
    let addition_needed = std::cmp::max(0, count - total_base as i32) as usize;

    let indices = (0..count).collect::<Vec<_>>();
    let mut forced_set = BTreeSet::<i32>::new();
    for idx in forced_base_raw {
        if *idx >= 0 && *idx < count {
            forced_set.insert(*idx);
        }
    }
    let forced_indices = forced_set.into_iter().collect::<Vec<_>>();
    let forced_pick = std::cmp::min(total_base, forced_indices.len());
    let optional_pick = total_base.saturating_sub(forced_pick);
    let optional_indices = indices
        .iter()
        .copied()
        .filter(|idx| !forced_indices.contains(idx))
        .collect::<Vec<_>>();
    if optional_pick > optional_indices.len() {
        return Vec::<Vec<i32>>::new();
    }

    let addition_level_combos = if addition_needed > 0 {
        let mut combos = Vec::<Vec<i32>>::new();
        let mut path = Vec::<i32>::new();
        enumerate_combinations_i32(addition_levels, addition_needed, 0, &mut path, &mut combos);
        combos
    } else {
        vec![Vec::<i32>::new()]
    };
    let forced_combos = if forced_pick > 0 {
        let mut combos = Vec::<Vec<i32>>::new();
        let mut path = Vec::<i32>::new();
        enumerate_combinations_i32(&forced_indices, forced_pick, 0, &mut path, &mut combos);
        combos
    } else {
        vec![Vec::<i32>::new()]
    };
    let optional_combos = if optional_pick > 0 {
        let mut combos = Vec::<Vec<i32>>::new();
        let mut path = Vec::<i32>::new();
        enumerate_combinations_i32(&optional_indices, optional_pick, 0, &mut path, &mut combos);
        combos
    } else {
        vec![Vec::<i32>::new()]
    };

    let mut seen = HashSet::<String>::new();
    let mut results = Vec::<Vec<i32>>::new();
    for forced_combo in &forced_combos {
        for optional_combo in &optional_combos {
            let mut base_combo = forced_combo.clone();
            base_combo.extend(optional_combo.iter().copied());
            if base_combo.len() != total_base {
                continue;
            }
            let base_set = base_combo.iter().copied().collect::<HashSet<_>>();
            let remaining_indices = indices
                .iter()
                .copied()
                .filter(|idx| !base_set.contains(idx))
                .collect::<Vec<_>>();
            let orders = if addition_needed > 0 {
                compute_permutations_i32(&remaining_indices)
            } else {
                vec![Vec::<i32>::new()]
            };
            for addition_combo in &addition_level_combos {
                if addition_combo.len() != addition_needed {
                    continue;
                }
                for order in &orders {
                    if order.len() != addition_needed {
                        continue;
                    }
                    let mut intro = vec![0; safe_count];
                    for idx in &base_combo {
                        let slot = *idx as usize;
                        if slot < intro.len() {
                            intro[slot] = 0;
                        }
                    }
                    let mut i = 0;
                    while i < addition_needed {
                        let target_idx = order[i] as usize;
                        if target_idx < intro.len() {
                            intro[target_idx] = addition_combo[i];
                        }
                        i += 1;
                    }
                    let key = intro
                        .iter()
                        .map(i32::to_string)
                        .collect::<Vec<_>>()
                        .join(",");
                    if seen.insert(key) {
                        results.push(intro);
                    }
                }
            }
        }
    }
    results
}

// Flatten 2D rows into a single contiguous vector for low-overhead wasm_bindgen
// transfer. JS reconstructs rows using the known fixed row width per call.
fn flatten_i32_rows(rows: &[Vec<i32>]) -> Vec<i32> {
    let mut out = Vec::<i32>::new();
    let total_len = rows.iter().map(|row| row.len()).sum::<usize>();
    out.reserve(total_len);
    for row in rows {
        out.extend(row.iter().copied());
    }
    out
}

// Prepare one rule for fast repeated item evaluation.
fn prepare_rule(raw: RuleRaw) -> PreparedRule {
    let use_flag = raw.Use.unwrap_or(true);
    let keep_flag = raw.Keep.unwrap_or(false);
    let artifact_types = raw.ArtifactType.unwrap_or_default();
    let artifact_sets = raw.ArtifactSet.unwrap_or_default();
    let faction = raw.Faction.unwrap_or(0);
    let level_for_check = raw.LVLForCheck.unwrap_or(LEVEL_ANY_SENTINEL);
    let main_stat_id = raw.MainStatID.unwrap_or(STAT_ID_ANY);
    let main_stat_f = boolish_to_flag(raw.MainStatF.as_ref());
    let source = raw.source;
    let is_keep_override_source = source.as_deref() == Some(RULE_SOURCE_KEEP_UNIQUES);
    let cfg_idx = raw.ConfigID.and_then(|cfg| if cfg > 0 { Some(cfg - 1) } else { None });

    let substats = raw
        .Substats
        .unwrap_or_default()
        .into_iter()
        .map(|sub| PreparedRuleSub {
            id: sub.ID.unwrap_or(STAT_ID_ANY),
            value: sub.Value.unwrap_or(0.0),
            is_flat: boolish_to_flag(sub.IsFlat.as_ref()),
            condition: sub.Condition.unwrap_or_else(|| ">=".to_string()).trim().to_string(),
            not_available: sub.NotAvailable.unwrap_or(false),
        })
        .collect::<Vec<_>>();

    PreparedRule {
        use_flag,
        keep_flag,
        artifact_types,
        artifact_sets,
        faction,
        level_for_check,
        main_stat_id,
        main_stat_f,
        substats,
        cfg_idx,
        source,
        keep_unique_item_key: raw.keep_unique_item_key,
        rank_mask: rank_mask(raw.Rank.unwrap_or(0)),
        rarity_mask: rarity_mask(raw.Rarity.unwrap_or(0)),
        is_keep_override_source,
    }
}

// Pull item key for keep-unique item-bound rule checks.
fn resolve_item_key(item: &TestItemRaw) -> Option<i64> {
    item.item_id.or(item.preview_extras.as_ref().and_then(|extras| extras.id))
}

// Fast helper for optional numeric value map lookup by encoded variant key.
fn read_sub_value(sub_values: &Option<HashMap<String, f64>>, variant: i64) -> Option<f64> {
    sub_values
        .as_ref()
        .and_then(|values| values.get(&variant.to_string()).copied())
}

// Rule-level predicate copied from src/lib/ruleEval.ts::matchRule.
fn match_rule(rule: &PreparedRule, item: &TestItemRaw) -> bool {
    if !rule.use_flag {
        return false;
    }

    if let Some(required_item_key) = rule.keep_unique_item_key {
        if required_item_key != 0 && resolve_item_key(item) != Some(required_item_key) {
            return false;
        }
    }

    if !rule.artifact_types.is_empty() && !rule.artifact_types.iter().any(|slot| *slot == item.slot) {
        return false;
    }

    if !rule.artifact_sets.is_empty() && !rule.artifact_sets.iter().any(|set_id| *set_id == item.set) {
        return false;
    }

    if rule.faction != 0 && item.faction.unwrap_or(0) != rule.faction {
        return false;
    }

    let rank_bit = bit_for_rank_or_rarity(item.rank);
    if (rule.rank_mask & rank_bit) == 0 {
        return false;
    }

    let rarity_bit = bit_for_rank_or_rarity(item.rarity);
    if (rule.rarity_mask & rarity_bit) == 0 {
        return false;
    }

    if rule.level_for_check != LEVEL_ANY_SENTINEL && rule.level_for_check != item.level {
        return false;
    }

    if rule.main_stat_id != STAT_ID_ANY {
        let expected_main = main_to_variant(rule.main_stat_id, rule.main_stat_f);
        let actual_main = item.main.unwrap_or(STAT_ID_ANY);
        if expected_main != actual_main {
            return false;
        }
    }

    for sub in rule
        .substats
        .iter()
        .filter(|entry| !entry.not_available && entry.id != STAT_ID_ANY)
    {
        let variant = sub_to_variant(sub.id, sub.is_flat);
        let raw_value = read_sub_value(&item.sub_values, variant);
        let has_value = raw_value.is_some_and(|v| v.is_finite() && v > 0.0);
        let have = raw_value.unwrap_or(0.0);
        let needs_presence = matches!(sub.condition.as_str(), "<=" | "<" | "=<" | "≤");

        if needs_presence && !has_value {
            return false;
        }

        let ok = match sub.condition.as_str() {
            ">=" => have >= sub.value,
            "<=" => have <= sub.value,
            "==" | "=" => (have - sub.value).abs() < f64::EPSILON,
            _ => have >= sub.value,
        };

        if !ok {
            return false;
        }
    }

    true
}

// Config visibility gate copied from evaluateMatchesByConfig.
fn should_include_config(
    cfg_idx: Option<i64>,
    config_modes: &[String],
    exclude_config_indices: &HashSet<i64>,
) -> bool {
    if let Some(idx) = cfg_idx {
        if exclude_config_indices.contains(&idx) {
            return false;
        }

        if let Some(mode) = config_modes.get(idx as usize) {
            return mode != "disabled" && mode != "separator";
        }
    }

    true
}

// Item-level evaluator copied from evaluateMatchesByConfig with full-rule scans.
fn evaluate_item(
    rules: &[PreparedRule],
    config_modes: &[String],
    item: &TestItemRaw,
    options: &EvaluateOptionsRaw,
) -> (Option<EvalMatch>, Option<EvalMatch>, Vec<i64>, Vec<MatchingConfigDecision>) {
    let exclude_source_set = options
        .exclude_sources
        .as_ref()
        .map(|sources| sources.iter().cloned().collect::<HashSet<_>>())
        .unwrap_or_default();

    let exclude_config_indices = options
        .exclude_config_indices
        .as_ref()
        .map(|indices| indices.iter().copied().collect::<HashSet<_>>())
        .unwrap_or_default();

    let ignore_keep_unique_config_indices = options
        .ignore_keep_unique_config_indices
        .as_ref()
        .map(|indices| indices.iter().copied().collect::<HashSet<_>>())
        .unwrap_or_default();

    let is_keep_unique_ignored = |cfg_idx: Option<i64>| -> bool {
        cfg_idx
            .map(|idx| ignore_keep_unique_config_indices.contains(&idx))
            .unwrap_or(false)
    };

    let mut first_match: Option<EvalMatch> = None;
    let mut first_non_excluded_match: Option<EvalMatch> = None;
    let mut non_keep_override_keep_matched = false;
    let mut pending_keep_override: Option<EvalMatch> = None;
    let mut fallback_keep_override: Option<EvalMatch> = None;
    let mut any_keep_override_match: Option<EvalMatch> = None;
    // Preserve first-seen config order so UI chips can remove only the true
    // primary config entry without relying on sorted index order.
    let mut matching_configs = Vec::<i64>::new();
    // Keep O(1) duplicate suppression while retaining encounter order.
    let mut matching_config_seen = HashSet::<i64>::new();
    let mut matching_config_decisions = HashMap::<i64, bool>::new();

    let mut prekeep_override: Option<EvalMatch> = None;

    for (rule_index, rule) in rules.iter().enumerate() {
        if !match_rule(rule, item) {
            continue;
        }

        // Track first keep-override hit before config gating so the fallback
        // semantics match the TypeScript path without an extra pre-scan.
        if prekeep_override.is_none() && rule.is_keep_override_source {
            prekeep_override = Some(EvalMatch {
                rule_index,
                keep: true,
                cfg_idx: rule.cfg_idx,
            });
        }

        let source = rule.source.as_deref();
        let is_excluded = source
            .map(|candidate| exclude_source_set.contains(candidate))
            .unwrap_or(false);

        if !should_include_config(rule.cfg_idx, config_modes, &exclude_config_indices) {
            continue;
        }

        let keep = if rule.is_keep_override_source {
            true
        } else {
            rule.keep_flag
        };

        let matched = EvalMatch {
            rule_index,
            keep,
            cfg_idx: rule.cfg_idx,
        };

        if rule.is_keep_override_source {
            if pending_keep_override.is_none() && !is_excluded {
                pending_keep_override = Some(matched.clone());
            }
            if fallback_keep_override.is_none() && !is_excluded {
                fallback_keep_override = Some(matched.clone());
            }
            if any_keep_override_match.is_none() && !is_excluded {
                any_keep_override_match = Some(matched.clone());
            }
        } else {
            let ignored_for_keep_unique = is_keep_unique_ignored(rule.cfg_idx);
            if keep && !is_excluded && !ignored_for_keep_unique {
                non_keep_override_keep_matched = true;
            }
            if first_match.is_none() && !is_excluded {
                first_match = Some(matched.clone());
            }
            if first_non_excluded_match.is_none() && !is_excluded {
                first_non_excluded_match = Some(matched.clone());
            }
        }

        if let Some(cfg_idx) = rule.cfg_idx {
            // Keep first-seen ordering for compatibility with legacy JS matcher output.
            if matching_config_seen.insert(cfg_idx) {
                matching_configs.push(cfg_idx);
            }
            // First keep/sell decision per config still wins, matching prior behavior.
            matching_config_decisions.entry(cfg_idx).or_insert(keep);
        }
    }

    let first_match_is_keep = first_match
        .as_ref()
        .map(|entry| entry.keep && !is_keep_unique_ignored(entry.cfg_idx))
        .unwrap_or(false);

    let allow_keep_override = !non_keep_override_keep_matched && !first_match_is_keep;
    if allow_keep_override {
        let keep_candidate = pending_keep_override
            .or(fallback_keep_override)
            .or(any_keep_override_match)
            .or(prekeep_override);

        if let Some(candidate) = keep_candidate {
            first_match = Some(candidate.clone());
            if first_non_excluded_match.is_none() {
                first_non_excluded_match = Some(candidate);
            }
        }
    }

    // Config indices are already in encounter order; clone into the output payload.
    let matching_config_indices = matching_configs;
    let matching_config_decisions = matching_config_indices
        .iter()
        .map(|cfg_idx| MatchingConfigDecision {
            cfg_idx: *cfg_idx,
            keep: *matching_config_decisions.get(cfg_idx).unwrap_or(&false),
        })
        .collect::<Vec<_>>();

    (
        first_match.clone(),
        first_non_excluded_match.or(first_match),
        matching_config_indices,
        matching_config_decisions,
    )
}

// Resolve keep/sell outcomes for keep-unique candidate rows.
// Rows reuse cached base matches when possible and only re-evaluate as needed.
fn resolve_keep_unique_candidate_keep_flags_core(
    rows: &[KeepUniqueCandidateResolveRowIn],
    prepared_rules: &[PreparedRule],
    config_modes: &[String],
    ignore_keep_unique_config_indices: &[i64],
) -> Vec<bool> {
    let has_ignored_configs = !ignore_keep_unique_config_indices.is_empty();
    let ignored_set = ignore_keep_unique_config_indices
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let eval_options = EvaluateOptionsRaw {
        exclude_config_indices: if has_ignored_configs {
            Some(ignore_keep_unique_config_indices.to_vec())
        } else {
            None
        },
        ..EvaluateOptionsRaw::default()
    };

    let mut keep_flags = Vec::<bool>::with_capacity(rows.len());
    for row in rows {
        // Reuse explicit base-match decisions unless the owning config is ignored.
        if row.base_match_defined {
            let base_cfg_idx = row.base_match.as_ref().and_then(|entry| entry.cfg_idx);
            let base_cfg_ignored = has_ignored_configs
                && base_cfg_idx
                    .map(|cfg_idx| ignored_set.contains(&cfg_idx))
                    .unwrap_or(false);
            if !base_cfg_ignored {
                keep_flags.push(row.base_match.as_ref().map(|entry| entry.keep).unwrap_or(false));
                continue;
            }
        }

        // No base rules means the row is sold by default.
        if prepared_rules.is_empty() {
            keep_flags.push(false);
            continue;
        }

        // Re-evaluate with ignored configs excluded to mirror TS semantics.
        let (first_match, _, _, _) =
            evaluate_item(prepared_rules, config_modes, &row.item, &eval_options);
        keep_flags.push(first_match.map(|entry| entry.keep).unwrap_or(false));
    }
    keep_flags
}

// Keep-unique candidate matching helper keeps base-match fallback and filtered
// re-evaluation semantics in Rust so TS only handles row/object assembly.
#[wasm_bindgen]
pub fn resolve_keep_unique_candidate_keep_flags_value(
    rows: JsValue,
    rules: JsValue,
    config_modes: JsValue,
    ignore_keep_unique_config_indices: JsValue,
) -> Result<JsValue, JsValue> {
    let rows: Vec<KeepUniqueCandidateResolveRowIn> = from_js_value(rows)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique rows payload: {error}")))?;
    let rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique rules payload: {error}")))?;
    let config_modes: Vec<String> = from_js_value(config_modes).map_err(|error| {
        JsValue::from_str(&format!(
            "Invalid keep-unique config-modes payload: {error}"
        ))
    })?;
    let ignore_keep_unique_config_indices: Option<Vec<i64>> = from_js_value(ignore_keep_unique_config_indices)
        .map_err(|error| {
            JsValue::from_str(&format!(
                "Invalid keep-unique ignored-config-indices payload: {error}"
            ))
        })?;

    // Prepare rules once so each row evaluation reuses precomputed masks/flags.
    let prepared_rules = rules.into_iter().map(prepare_rule).collect::<Vec<_>>();
    let keep_flags = resolve_keep_unique_candidate_keep_flags_core(
        &rows,
        &prepared_rules,
        &config_modes,
        &ignore_keep_unique_config_indices.unwrap_or_default(),
    );
    to_js_value(&keep_flags).map_err(|error| {
        JsValue::from_str(&format!(
            "Failed to serialize keep-unique candidate keep flags: {error}"
        ))
    })
}

// Keep-unique candidate snapshot builder keeps key derivation + sold filtering
// in Rust so TS only reattaches row references for existing call sites.
fn collect_keep_unique_candidates_core(
    rows: &[KeepUniqueCollectRowIn],
    prepared_rules: &[PreparedRule],
    config_modes: &[String],
    ignore_keep_unique_config_indices: &[i64],
) -> Result<KeepUniqueCollectedSnapshotOut, JsValue> {
    // Reuse keep-flag resolution so base-match fallback stays single-sourced.
    let resolver_rows = rows
        .iter()
        .map(|row| KeepUniqueCandidateResolveRowIn {
            item: row.item.clone(),
            base_match_defined: row.base_match_defined,
            base_match: row.base_match.clone(),
        })
        .collect::<Vec<_>>();
    let keep_flags = resolve_keep_unique_candidate_keep_flags_core(
        &resolver_rows,
        prepared_rules,
        config_modes,
        ignore_keep_unique_config_indices,
    );
    // Keep candidate/flag vectors aligned so item ownership never shifts.
    if keep_flags.len() != rows.len() {
        return Err(JsValue::from_str(
            "Keep-unique candidate collect produced mismatched keep-flag length",
        ));
    }

    // Build candidate rows in encounter order for deterministic UI snapshots.
    let mut unique_item_keys = HashSet::<i64>::new();
    let mut candidates = Vec::<KeepUniqueCollectedCandidateOut>::with_capacity(rows.len());
    for (idx, row) in rows.iter().enumerate() {
        // Item-key parity: tester item id first, then artifact id, else zero.
        let item_key = row.item.item_id.or(row.artifact.id).unwrap_or(0);
        // Non-accessory slots always collapse faction to zero in group keys.
        let normalized_faction = if keep_unique_is_accessory_slot(row.artifact.slot) {
            row.artifact.faction
        } else {
            0
        };
        let group_key = format!(
            "{}:{}:{}:{}",
            row.artifact.slot, row.artifact.set, row.artifact.main_stat, normalized_faction
        );
        let is_sold = !keep_flags[idx];
        if is_sold {
            unique_item_keys.insert(item_key);
        }
        candidates.push(KeepUniqueCollectedCandidateOut {
            row_index: idx,
            item_key,
            group_key,
            is_sold,
            artifact: row.artifact.clone(),
        });
    }

    // Sold-key output is sorted for deterministic fingerprints.
    let mut unique_sorted = unique_item_keys.into_iter().collect::<Vec<_>>();
    unique_sorted.sort_unstable();
    Ok(KeepUniqueCollectedSnapshotOut {
        candidates,
        unique_item_keys: unique_sorted,
    })
}

// Keep-unique candidate snapshot builder keeps key derivation + sold filtering
// in Rust so TS call sites avoid re-implementing evaluator precedence.
#[wasm_bindgen]
pub fn collect_keep_unique_candidates_value(
    rows: JsValue,
    rules: JsValue,
    config_modes: JsValue,
    ignore_keep_unique_config_indices: JsValue,
) -> Result<JsValue, JsValue> {
    // Parse compact row payload that includes matcher item + normalized artifact.
    let rows: Vec<KeepUniqueCollectRowIn> = from_js_value(rows)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique collect rows payload: {error}")))?;
    // Parse merged base rules used by keep/sell resolution.
    let rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique collect rules payload: {error}")))?;
    // Parse per-config mode visibility needed by evaluate-item parity.
    let config_modes: Vec<String> = from_js_value(config_modes)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique collect config-modes payload: {error}")))?;
    // Parse optional ignored config indices; null/undefined maps to empty list.
    let ignore_keep_unique_config_indices: Option<Vec<i64>> = from_js_value(ignore_keep_unique_config_indices)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique collect ignored-config payload: {error}")))?;

    // Prepare rules once so each row evaluation reuses precomputed masks.
    let prepared_rules = rules.into_iter().map(prepare_rule).collect::<Vec<_>>();
    let snapshot = collect_keep_unique_candidates_core(
        &rows,
        &prepared_rules,
        &config_modes,
        &ignore_keep_unique_config_indices.unwrap_or_default(),
    )?;
    // Return the compact candidate payload used by TS row re-attachment.
    to_js_value(&snapshot)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize keep-unique candidate snapshot: {error}")))
}

// Expand keep-unique metaset ids into concrete set selections inside wasm.
#[wasm_bindgen]
pub fn resolve_keep_unique_rules_with_metasets_value(
    rules: JsValue,
    metasets: JsValue,
) -> Result<JsValue, JsValue> {
    // Parse keep-unique rule payloads with nullable-field tolerance.
    let mut rules: Vec<KeepUniqueWasmRuleIn> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique rules payload: {error}")))?;
    // Parse metaset definitions into a fast lookup table.
    let metasets: Vec<KeepUniqueWasmMetasetIn> = from_js_value(metasets)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique metasets payload: {error}")))?;
    let mut meta_map = HashMap::<String, Vec<i64>>::new();
    for meta in metasets {
        meta_map.insert(meta.id, meta.sets);
    }

    // Expand metaset ids for each rule and emit normalized rule payload rows.
    let mut resolved = Vec::<KeepUniqueWasmResolvedRuleOut>::with_capacity(rules.len());
    for rule in &mut rules {
        let mut combination = rule.combination.clone().unwrap_or_default();
        // Normalize initial set entries so exclusions are canonical before merging metasets.
        let normalized = keep_unique_normalize_set_selections(&combination.sets);
        let excluded_ids = normalized
            .iter()
            .filter_map(|entry| if entry.excluded { Some(entry.id) } else { None })
            .collect::<HashSet<_>>();
        let mut included_ids = normalized
            .iter()
            .filter_map(|entry| if entry.excluded { None } else { Some(entry.id) })
            .collect::<HashSet<_>>();
        let mut changed = false;

        // Inject metaset members unless explicitly excluded or already included.
        for meta_id in &combination.meta_set_ids {
            let Some(set_ids) = meta_map.get(meta_id) else {
                continue;
            };
            for set_id in set_ids {
                if excluded_ids.contains(set_id) {
                    continue;
                }
                if included_ids.insert(*set_id) {
                    changed = true;
                }
            }
        }
        if !changed {
            continue;
        }

        // Rebuild + normalize merged entries so ordering/exclusion precedence stays canonical.
        let mut merged = Vec::<KeepUniqueWasmSetSelection>::new();
        for set_id in &excluded_ids {
            merged.push(KeepUniqueWasmSetSelection {
                id: *set_id,
                excluded: true,
            });
        }
        for set_id in &included_ids {
            merged.push(KeepUniqueWasmSetSelection {
                id: *set_id,
                excluded: false,
            });
        }
        combination.sets = keep_unique_normalize_set_selections(&merged);
        let resolved_hash = keep_unique_hash_combination(&combination);
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
            .unwrap_or_else(|| KEEP_UNIQUE_ACTIVATION_PROTECT_EXISTING.to_string());
        resolved.push(KeepUniqueWasmResolvedRuleOut {
            id: resolved_id,
            name: rule.name.clone().unwrap_or_default(),
            combination,
            required_count: rule.required_count.unwrap_or(1).max(1),
            activation: resolved_activation,
            count_mode: keep_unique_resolve_count_mode(rule.count_mode),
            substats: rule.substats.clone().unwrap_or_default(),
            substat_match: keep_unique_normalize_substat_match(
                rule.substat_match.as_deref().unwrap_or(""),
            ),
            substat_weights: rule.substat_weights.clone().unwrap_or_default(),
        });
    }

    to_js_value(&resolved)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize keep-unique metaset result: {error}")))
}

// Expose a fixed version token so diagnostics can verify which WASM build loaded.
#[wasm_bindgen]
pub fn version() -> String {
    "rule-engine-wasm-v0.15".to_string()
}

// Build integer roll distributions used by hsfBuilder's combinatorics loops.
#[wasm_bindgen]
pub fn roll_distributions(dimensions: i32, total: i32) -> Result<String, JsValue> {
    if dimensions <= 0 {
        return Ok("[[]]".to_string());
    }
    if total < 0 {
        return Ok("[]".to_string());
    }
    let mut out = Vec::<Vec<i32>>::new();
    let mut acc = Vec::<i32>::new();
    enumerate_roll_distributions(dimensions, total, 0, &mut acc, &mut out);
    serde_json::to_string(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize roll distributions: {error}")))
}

// Flat-array variant avoids JSON parsing on the result path.
#[wasm_bindgen]
pub fn roll_distributions_flat(dimensions: i32, total: i32) -> Vec<i32> {
    if dimensions <= 0 || total < 0 {
        return Vec::<i32>::new();
    }
    let mut out = Vec::<Vec<i32>>::new();
    let mut acc = Vec::<i32>::new();
    enumerate_roll_distributions(dimensions, total, 0, &mut acc, &mut out);
    flatten_i32_rows(&out)
}

// Filtered distribution helper keeps the hottest per-level loops inside Rust so
// JS only evaluates branch-specific predicates on already-feasible rows.
#[wasm_bindgen]
pub fn filtered_roll_distributions(
    dimensions: i32,
    total: i32,
    max_caps_json: &str,
    min_floors_json: &str,
    timeline_caps_json: &str,
    targeted_mask_json: &str,
    targeted_exact: i32,
    deficit_floors_json: &str,
    deficit_max: i32,
    global_min: i32,
    global_remaining: i32,
    global_mode: i32,
    locked_mask_json: &str,
    locked_min: i32,
    locked_remaining: i32,
    locked_mode: i32,
) -> Result<String, JsValue> {
    if dimensions <= 0 {
        return Ok(if total == 0 { "[[]]".to_string() } else { "[]".to_string() });
    }
    if total < 0 {
        return Ok("[]".to_string());
    }
    let max_caps: Vec<Option<i32>> = serde_json::from_str(max_caps_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid max-caps JSON: {error}")))?;
    let min_floors: Vec<Option<i32>> = serde_json::from_str(min_floors_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid min-floors JSON: {error}")))?;
    let timeline_caps: Vec<Option<i32>> = serde_json::from_str(timeline_caps_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid timeline-caps JSON: {error}")))?;
    let targeted_mask: Vec<bool> = serde_json::from_str(targeted_mask_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid targeted-mask JSON: {error}")))?;
    let deficit_floors: Vec<Option<i32>> = serde_json::from_str(deficit_floors_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid deficit-floors JSON: {error}")))?;
    let locked_mask: Vec<bool> = serde_json::from_str(locked_mask_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid locked-mask JSON: {error}")))?;
    let global_filter = parse_distribution_mode(global_mode);
    let locked_filter = parse_distribution_mode(locked_mode);
    let out = filter_roll_distributions_core(
        dimensions,
        total,
        &max_caps,
        &min_floors,
        &timeline_caps,
        &targeted_mask,
        if targeted_exact <= FILTER_OPTION_NONE_I32 { None } else { Some(targeted_exact) },
        &deficit_floors,
        if deficit_max <= FILTER_OPTION_NONE_I32 { None } else { Some(deficit_max) },
        global_min,
        global_remaining,
        global_filter,
        &locked_mask,
        locked_min,
        locked_remaining,
        locked_filter,
    );
    serde_json::to_string(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize filtered distributions: {error}")))
}

// Fast variant takes compact numeric arrays directly to avoid per-call JSON
// stringify/parse overhead across the JS/WASM boundary.
#[wasm_bindgen]
pub fn filtered_roll_distributions_fast(
    dimensions: i32,
    total: i32,
    max_caps: Vec<i32>,
    min_floors: Vec<i32>,
    timeline_caps: Vec<i32>,
    targeted_mask: Vec<u8>,
    targeted_exact: i32,
    deficit_floors: Vec<i32>,
    deficit_max: i32,
    global_min: i32,
    global_remaining: i32,
    global_mode: i32,
    locked_mask: Vec<u8>,
    locked_min: i32,
    locked_remaining: i32,
    locked_mode: i32,
) -> Result<String, JsValue> {
    if dimensions <= 0 {
        return Ok(if total == 0 { "[[]]".to_string() } else { "[]".to_string() });
    }
    if total < 0 {
        return Ok("[]".to_string());
    }
    let max_caps_opt = max_caps
        .iter()
        .map(|value| if *value < 0 { None } else { Some(*value) })
        .collect::<Vec<_>>();
    let min_floors_opt = min_floors
        .iter()
        .map(|value| if *value < 0 { None } else { Some(*value) })
        .collect::<Vec<_>>();
    let timeline_caps_opt = timeline_caps
        .iter()
        .map(|value| if *value < 0 { None } else { Some(*value) })
        .collect::<Vec<_>>();
    let targeted_mask_bool = targeted_mask
        .iter()
        .map(|value| *value != 0)
        .collect::<Vec<_>>();
    let deficit_floors_opt = deficit_floors
        .iter()
        .map(|value| if *value < 0 { None } else { Some(*value) })
        .collect::<Vec<_>>();
    let locked_mask_bool = locked_mask
        .iter()
        .map(|value| *value != 0)
        .collect::<Vec<_>>();
    let out = filter_roll_distributions_core(
        dimensions,
        total,
        &max_caps_opt,
        &min_floors_opt,
        &timeline_caps_opt,
        &targeted_mask_bool,
        if targeted_exact <= FILTER_OPTION_NONE_I32 { None } else { Some(targeted_exact) },
        &deficit_floors_opt,
        if deficit_max <= FILTER_OPTION_NONE_I32 { None } else { Some(deficit_max) },
        global_min,
        global_remaining,
        parse_distribution_mode(global_mode),
        &locked_mask_bool,
        locked_min,
        locked_remaining,
        parse_distribution_mode(locked_mode),
    );
    serde_json::to_string(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize filtered distributions: {error}")))
}

// Flat-array variant avoids JSON parsing on the result path.
#[wasm_bindgen]
pub fn filtered_roll_distributions_fast_flat(
    dimensions: i32,
    total: i32,
    max_caps: Vec<i32>,
    min_floors: Vec<i32>,
    timeline_caps: Vec<i32>,
    targeted_mask: Vec<u8>,
    targeted_exact: i32,
    deficit_floors: Vec<i32>,
    deficit_max: i32,
    global_min: i32,
    global_remaining: i32,
    global_mode: i32,
    locked_mask: Vec<u8>,
    locked_min: i32,
    locked_remaining: i32,
    locked_mode: i32,
) -> Vec<i32> {
    if dimensions <= 0 || total < 0 {
        return Vec::<i32>::new();
    }
    let max_caps_opt = max_caps
        .iter()
        .map(|value| if *value < 0 { None } else { Some(*value) })
        .collect::<Vec<_>>();
    let min_floors_opt = min_floors
        .iter()
        .map(|value| if *value < 0 { None } else { Some(*value) })
        .collect::<Vec<_>>();
    let timeline_caps_opt = timeline_caps
        .iter()
        .map(|value| if *value < 0 { None } else { Some(*value) })
        .collect::<Vec<_>>();
    let targeted_mask_bool = targeted_mask
        .iter()
        .map(|value| *value != 0)
        .collect::<Vec<_>>();
    let deficit_floors_opt = deficit_floors
        .iter()
        .map(|value| if *value < 0 { None } else { Some(*value) })
        .collect::<Vec<_>>();
    let locked_mask_bool = locked_mask
        .iter()
        .map(|value| *value != 0)
        .collect::<Vec<_>>();
    let out = filter_roll_distributions_core(
        dimensions,
        total,
        &max_caps_opt,
        &min_floors_opt,
        &timeline_caps_opt,
        &targeted_mask_bool,
        if targeted_exact <= FILTER_OPTION_NONE_I32 { None } else { Some(targeted_exact) },
        &deficit_floors_opt,
        if deficit_max <= FILTER_OPTION_NONE_I32 { None } else { Some(deficit_max) },
        global_min,
        global_remaining,
        parse_distribution_mode(global_mode),
        &locked_mask_bool,
        locked_min,
        locked_remaining,
        parse_distribution_mode(locked_mode),
    );
    flatten_i32_rows(&out)
}

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

// Combined payload lets wasm run filtering + rule emission in one pass,
// avoiding JS transfer of large intermediate distribution row arrays.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmitHsfRulesForFilteredDistributionsIn {
    dimensions: i32,
    total: i32,
    max_caps: Vec<i32>,
    min_floors: Vec<i32>,
    timeline_caps: Vec<i32>,
    targeted_mask: Vec<u8>,
    targeted_exact: i32,
    deficit_floors: Vec<i32>,
    deficit_max: i32,
    global_min: i32,
    global_remaining: i32,
    global_mode: i32,
    locked_mask: Vec<u8>,
    locked_min: i32,
    locked_remaining: i32,
    locked_mode: i32,
    emit: EmitHsfRulesForDistributionsIn,
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
            for idx in 0..dims {
                if !input.optional_mask.get(idx).copied().unwrap_or(false) {
                    continue;
                }
                let base = input.base_vals.get(idx).copied().unwrap_or(0) as i64;
                let value = base + (dist_prefix[idx] as i64 * base);
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
#[wasm_bindgen]
pub fn emit_hsf_rules_for_distributions_value(payload: JsValue) -> Result<JsValue, JsValue> {
    let input: EmitHsfRulesForDistributionsIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid emit-hsf-rules payload: {error}")))?;
    let out = emit_hsf_rules_for_distributions_core(&input, &input.distributions);
    to_js_value(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize emitted rules: {error}")))
}

// Build presence-only HSF rows for configs that select no substats.
#[wasm_bindgen]
pub fn build_hsf_presence_only_rules_value(payload: JsValue) -> Result<JsValue, JsValue> {
    let input: BuildHsfPresenceOnlyRulesIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid build-hsf-presence payload: {error}")))?;
    let out = build_hsf_presence_only_rules_core(&input);
    to_js_value(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize build-hsf-presence output: {error}")))
}

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
#[wasm_bindgen]
pub fn emit_hsf_rules_for_filtered_distributions_value(payload: JsValue) -> Result<JsValue, JsValue> {
    let input: EmitHsfRulesForFilteredDistributionsIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid emit-hsf-filtered payload: {error}")))?;
    if input.dimensions <= 0 {
        return to_js_value(&Vec::<RuleRaw>::new())
            .map_err(|error| JsValue::from_str(&format!("Failed to serialize emitted rules: {error}")));
    }
    if input.total < 0 {
        return to_js_value(&Vec::<RuleRaw>::new())
            .map_err(|error| JsValue::from_str(&format!("Failed to serialize emitted rules: {error}")));
    }

    let max_caps_opt = input
        .max_caps
        .iter()
        .map(|value| if *value < 0 { None } else { Some(*value) })
        .collect::<Vec<_>>();
    let min_floors_opt = input
        .min_floors
        .iter()
        .map(|value| if *value < 0 { None } else { Some(*value) })
        .collect::<Vec<_>>();
    let timeline_caps_opt = input
        .timeline_caps
        .iter()
        .map(|value| if *value < 0 { None } else { Some(*value) })
        .collect::<Vec<_>>();
    let targeted_mask_bool = input
        .targeted_mask
        .iter()
        .map(|value| *value != 0)
        .collect::<Vec<_>>();
    let deficit_floors_opt = input
        .deficit_floors
        .iter()
        .map(|value| if *value < 0 { None } else { Some(*value) })
        .collect::<Vec<_>>();
    let locked_mask_bool = input
        .locked_mask
        .iter()
        .map(|value| *value != 0)
        .collect::<Vec<_>>();
    let rows = filter_roll_distributions_core(
        input.dimensions,
        input.total,
        &max_caps_opt,
        &min_floors_opt,
        &timeline_caps_opt,
        &targeted_mask_bool,
        if input.targeted_exact <= FILTER_OPTION_NONE_I32 {
            None
        } else {
            Some(input.targeted_exact)
        },
        &deficit_floors_opt,
        if input.deficit_max <= FILTER_OPTION_NONE_I32 {
            None
        } else {
            Some(input.deficit_max)
        },
        input.global_min,
        input.global_remaining,
        parse_distribution_mode(input.global_mode),
        &locked_mask_bool,
        input.locked_min,
        input.locked_remaining,
        parse_distribution_mode(input.locked_mode),
    );
    let out = emit_hsf_rules_for_distributions_core(&input.emit, &rows);
    to_js_value(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize emitted rules: {error}")))
}

// Compact filtered-emission helper widens base vectors in Rust so JS no longer
// rebuilds per-dimension cap/mask arrays inside hsfBuilder inner loops.
#[wasm_bindgen]
pub fn emit_hsf_rules_for_filtered_distributions_compact_value(payload: JsValue) -> Result<JsValue, JsValue> {
    // Parse compact payload first for deterministic schema errors.
    let input: EmitHsfRulesForFilteredDistributionsCompactIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid emit-hsf-filtered-compact payload: {error}")))?;
    let out = emit_hsf_rules_for_filtered_distributions_compact_core(&input);
    to_js_value(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize emitted rules: {error}")))
}

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
    let rows = filter_roll_distributions_core(
        input.dimensions,
        input.total,
        &max_caps_opt,
        &min_floors_opt,
        &timeline_caps_opt,
        &targeted_mask_bool,
        if input.targeted_exact <= FILTER_OPTION_NONE_I32 {
            None
        } else {
            Some(input.targeted_exact)
        },
        &deficit_floors_opt,
        if input.deficit_max <= FILTER_OPTION_NONE_I32 {
            None
        } else {
            Some(input.deficit_max)
        },
        input.global_min,
        input.global_remaining,
        parse_distribution_mode(input.global_mode),
        &locked_mask_bool,
        input.locked_min,
        input.locked_remaining,
        parse_distribution_mode(input.locked_mode),
    );
    emit_hsf_rules_for_distributions_core(&input.emit, &rows)
}

// Numeric combinations helper keeps high-volume choose(N, K) expansion in wasm.
#[wasm_bindgen]
pub fn combinations_i32(values_json: &str, pick: i32) -> Result<String, JsValue> {
    let values: Vec<i32> = serde_json::from_str(values_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid combinations values JSON: {error}")))?;
    let out = compute_combinations_i32(&values, pick);
    serde_json::to_string(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize combinations: {error}")))
}

// Fast variant avoids JSON serialization for numeric combinations calls.
#[wasm_bindgen]
pub fn combinations_i32_fast(values: Vec<i32>, pick: i32) -> Result<String, JsValue> {
    let out = compute_combinations_i32(&values, pick);
    serde_json::to_string(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize combinations: {error}")))
}

// Flat-array variant avoids JSON parsing on the result path.
#[wasm_bindgen]
pub fn combinations_i32_fast_flat(values: Vec<i32>, pick: i32) -> Vec<i32> {
    let out = compute_combinations_i32(&values, pick);
    flatten_i32_rows(&out)
}

// Numeric permutations helper mirrors TS backtracking index order.
#[wasm_bindgen]
pub fn permutations_i32(values_json: &str) -> Result<String, JsValue> {
    let values: Vec<i32> = serde_json::from_str(values_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid permutations values JSON: {error}")))?;
    let out = compute_permutations_i32(&values);
    serde_json::to_string(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize permutations: {error}")))
}

// Fast variant avoids JSON serialization for numeric permutations calls.
#[wasm_bindgen]
pub fn permutations_i32_fast(values: Vec<i32>) -> Result<String, JsValue> {
    let out = compute_permutations_i32(&values);
    serde_json::to_string(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize permutations: {error}")))
}

// Flat-array variant avoids JSON parsing on the result path.
#[wasm_bindgen]
pub fn permutations_i32_fast_flat(values: Vec<i32>) -> Vec<i32> {
    let out = compute_permutations_i32(&values);
    flatten_i32_rows(&out)
}

// Numeric bounded-compositions helper for late-mode extra allocation loops.
#[wasm_bindgen]
pub fn bounded_compositions_i32_fast(caps: Vec<i32>, total: i32) -> Result<String, JsValue> {
    let out = compute_bounded_compositions_i32(&caps, total);
    serde_json::to_string(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize bounded compositions: {error}")))
}

// Flat-array variant avoids JSON parsing on the result path.
#[wasm_bindgen]
pub fn bounded_compositions_i32_fast_flat(caps: Vec<i32>, total: i32) -> Vec<i32> {
    let out = compute_bounded_compositions_i32(&caps, total);
    flatten_i32_rows(&out)
}

// Flat helper for late-mode bounded-composition loops with inline filtering.
#[wasm_bindgen]
pub fn filtered_bounded_compositions_with_offset_i32_fast_flat(
    caps: Vec<i32>,
    total: i32,
    need_now: Vec<i32>,
    locked_mask: Vec<u8>,
    locked_base_sum: i32,
    locked_min_at_level: i32,
    optional_mask: Vec<u8>,
    mins: Vec<i32>,
    skip_optional_baseline: bool,
) -> Vec<i32> {
    let out = compute_filtered_bounded_rows_with_offset_i32(
        &caps,
        total,
        &need_now,
        &locked_mask,
        locked_base_sum,
        locked_min_at_level,
        &optional_mask,
        &mins,
        skip_optional_baseline,
    );
    flatten_i32_rows(&out)
}

// Build intro assignment schedules used by hsfBuilder combinatorics loops.
#[wasm_bindgen]
pub fn intro_assignments_for_combo(
    count: i32,
    base_slots: i32,
    addition_levels_json: &str,
    forced_base_json: &str,
) -> Result<String, JsValue> {
    let addition_levels: Vec<i32> = serde_json::from_str(addition_levels_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid addition-levels JSON: {error}")))?;
    let forced_base_raw: Vec<i32> = serde_json::from_str(forced_base_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid forced-base JSON: {error}")))?;
    let results = compute_intro_assignments_for_combo(
        count,
        base_slots,
        &addition_levels,
        &forced_base_raw,
    );
    serde_json::to_string(&results)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize intro assignments: {error}")))
}

// Fast variant avoids JSON serialization for intro assignment combinatorics.
#[wasm_bindgen]
pub fn intro_assignments_for_combo_fast(
    count: i32,
    base_slots: i32,
    addition_levels: Vec<i32>,
    forced_base: Vec<i32>,
) -> Result<String, JsValue> {
    let results = compute_intro_assignments_for_combo(count, base_slots, &addition_levels, &forced_base);
    serde_json::to_string(&results)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize intro assignments: {error}")))
}

// Flat-array variant avoids JSON parsing on the result path.
#[wasm_bindgen]
pub fn intro_assignments_for_combo_fast_flat(
    count: i32,
    base_slots: i32,
    addition_levels: Vec<i32>,
    forced_base: Vec<i32>,
) -> Vec<i32> {
    let results = compute_intro_assignments_for_combo(count, base_slots, &addition_levels, &forced_base);
    flatten_i32_rows(&results)
}

// Shared obsolete-report builder used by JSON and JsValue exports.
fn find_obsolete_report(rules: &[RuleRaw]) -> ObsoleteReportOut {
    let obsolete = collect_obsolete_entries(rules);
    ObsoleteReportOut { obsolete }
}

// Builder-pruning obsolete report mirrors hsfBuilder.ts::pruneDominatedRules semantics.
fn find_obsolete_builder_report(rules: &[RuleRaw]) -> ObsoleteReportOut {
    let obsolete = collect_builder_pruning_obsolete_entries(rules);
    ObsoleteReportOut { obsolete }
}

// Detect obsolete rules using the same domination semantics as src/lib/hsfObsolete.ts.
#[wasm_bindgen]
pub fn find_obsolete(rules_json: &str) -> Result<String, JsValue> {
    let rules: Vec<RuleRaw> = serde_json::from_str(rules_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid obsolete-rules JSON: {error}")))?;
    let report = find_obsolete_report(&rules);
    serde_json::to_string(&report)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize obsolete report: {error}")))
}

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
#[wasm_bindgen]
pub fn find_obsolete_builder_value(rules: JsValue) -> Result<JsValue, JsValue> {
    let parsed_rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid builder-obsolete value: {error}")))?;
    let report = find_obsolete_builder_report(&parsed_rules);
    to_js_value(&report)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize builder-obsolete value: {error}")))
}

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
    let obsolete = collect_builder_pruning_obsolete_entries(&rules);
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

// Builder finalize export accepts JS arrays directly and returns finalized rules.
#[wasm_bindgen]
pub fn finalize_builder_rules_value(rules: JsValue, emission_meta: JsValue) -> Result<JsValue, JsValue> {
    let parsed_rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid builder-finalize rules: {error}")))?;
    let parsed_meta: Vec<BuilderFinalizeEmissionMetaIn> = from_js_value(emission_meta)
        .map_err(|error| JsValue::from_str(&format!("Invalid builder-finalize emissionMeta: {error}")))?;
    let finalized = finalize_builder_rules_core(parsed_rules, parsed_meta)
        .map_err(|error| JsValue::from_str(&error))?;
    to_js_value(&finalized)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize builder-finalize value: {error}")))
}

// Flatten custom-rule batches while enforcing merge.ts total-rule limit.
#[wasm_bindgen]
pub fn flatten_rule_batches_with_total_limit_value(
    base_count: i64,
    total_limit: i64,
    batches: JsValue,
) -> Result<JsValue, JsValue> {
    // Parse as Vec<Vec<RuleRaw>> so TS can pass prebuilt/build batches directly.
    let parsed_batches: Vec<Vec<RuleRaw>> = from_js_value(batches)
        .map_err(|error| JsValue::from_str(&format!("Invalid flatten-rule-batches payload: {error}")))?;
    // Negative limit means unlimited mode (same as TS null branch).
    let has_limit = total_limit > 0;
    let limit = if has_limit { total_limit } else { i64::MAX };
    // Running total starts from base-rule length exactly like merge.ts.
    let mut running_total = base_count.max(0);
    let mut out = Vec::<RuleRaw>::new();
    for batch in parsed_batches {
        // Ignore empty batches to mirror TS addBatch helper behavior.
        if batch.is_empty() {
            continue;
        }
        // Stop once the configured total limit is already reached.
        if has_limit && running_total >= limit {
            break;
        }
        // If the next batch would overflow the total limit, stop without partial append.
        if has_limit && running_total + batch.len() as i64 > limit {
            break;
        }
        running_total += batch.len() as i64;
        out.extend(batch.into_iter());
    }
    // Return flattened custom rules ready for merged-rule orchestration.
    to_js_value(&out)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize flatten-rule-batches output: {error}")))
}

// Shared helper returns sorted + deduped explicit set ids (including no-set).
fn final_sell_explicit_set_ids(all_known_set_ids: &[i64]) -> Vec<i64> {
    // Include the no-set sentinel so accessories with no set stay covered.
    let mut all_sets = vec![ACCESSORY_NO_SET_ID];
    // Append caller-provided known ids; dedupe and sort after merge.
    all_sets.extend(all_known_set_ids.iter().copied());
    all_sets.sort_unstable();
    all_sets.dedup();
    all_sets
}

// Build Final Sell rules in Rust so merge.ts no longer owns level/type loops.
fn build_final_sell_rules_core(
    remainder: Option<&FinalSellRemainderIn>,
    all_known_set_ids: &[i64],
) -> Vec<RuleRaw> {
    let Some(final_sell) = remainder else {
        return Vec::<RuleRaw>::new();
    };
    // Require at least one scope toggle and one selected level.
    if !(final_sell.artifacts || final_sell.accessories) {
        return Vec::<RuleRaw>::new();
    }
    if final_sell.levels.is_empty() {
        return Vec::<RuleRaw>::new();
    }

    // Normalize selected levels into a lookup set.
    let selected_levels = final_sell
        .levels
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    // Match logicHub defaults: unknown mode collapses to "any".
    let sets_mode = final_sell
        .sets_mode
        .as_deref()
        .map(|value| value.trim().to_ascii_lowercase())
        .unwrap_or_else(|| FINAL_SELL_SETS_MODE_ANY.to_string());
    let explicit_sets = final_sell_explicit_set_ids(all_known_set_ids);

    // Slot combos mirror merge.ts (armor-only, accessory-only, or combined).
    let art_types = vec![
        ARTIFACT_TYPE_WEAPON,
        ARTIFACT_TYPE_HELMET,
        ARTIFACT_TYPE_SHIELD,
        ARTIFACT_TYPE_GAUNTLETS,
        ARTIFACT_TYPE_CHESTPLATE,
        ARTIFACT_TYPE_BOOTS,
    ];
    let acc_types = vec![
        ARTIFACT_TYPE_RING,
        ARTIFACT_TYPE_AMULET,
        ARTIFACT_TYPE_BANNER,
    ];
    let type_combos = if final_sell.artifacts && final_sell.accessories {
        let mut merged = art_types.clone();
        merged.extend(acc_types.iter().copied());
        vec![merged]
    } else if final_sell.artifacts {
        vec![art_types]
    } else if final_sell.accessories {
        vec![acc_types]
    } else {
        Vec::<Vec<i64>>::new()
    };
    if type_combos.is_empty() {
        return Vec::<RuleRaw>::new();
    }

    // Build both explicit + any coverage rows so unchecked modes emit Use=false rows.
    let coverage_modes = [FINAL_SELL_SETS_MODE_EXPLICIT, FINAL_SELL_SETS_MODE_ANY];
    let all_levels = [
        LEVEL_MILESTONE_0,
        LEVEL_MILESTONE_4,
        LEVEL_MILESTONE_8,
        LEVEL_MILESTONE_12,
        LEVEL_MILESTONE_16,
    ];
    let mut rules = Vec::<RuleRaw>::new();
    for level in all_levels {
        for mode in coverage_modes {
            // Enabled rows only when the mode matches and the level is selected.
            let enabled = mode == sets_mode;
            let use_explicit_sets = mode == FINAL_SELL_SETS_MODE_EXPLICIT;
            let use_flag = enabled && selected_levels.contains(&level);
            for combo in &type_combos {
                let mut sorted_types = combo.clone();
                sort_artifact_types_in_place(&mut sorted_types);
                let mut rule = RuleRaw {
                    ConfigID: None,
                    ConfigName: None,
                    Keep: Some(false),
                    IsRuleTypeAND: Some(false),
                    Use: Some(use_flag),
                    ArtifactSet: if use_explicit_sets {
                        Some(explicit_sets.clone())
                    } else {
                        None
                    },
                    ArtifactType: if sorted_types.is_empty() {
                        None
                    } else {
                        Some(sorted_types)
                    },
                    Rank: Some(0),
                    Rarity: Some(0),
                    MainStatID: Some(STAT_ID_ANY),
                    MainStatF: Some(serde_json::Value::from(MAIN_STAT_F_DEFAULT_FLAG)),
                    LVLForCheck: Some(level),
                    Faction: Some(0),
                    Substats: Some(keep_unique_clone_any_substats()),
                    source: Some(RULE_SOURCE_FINAL_SELL.to_string()),
                    line_idx: None,
                    all_known_sets: None,
                    rank_mask: None,
                    rarity_mask: None,
                    keep_unique_rule_id: None,
                    keep_unique_rule_ordinal: None,
                    keep_unique_hash: None,
                    keep_unique_required: None,
                    keep_unique_scan_ms: None,
                    keep_unique_projected: None,
                    keep_unique_deficit: None,
                    keep_unique_item_key: None,
                    keep_unique_placeholder: None,
                    keep_unique_placeholder_missing: None,
                };
                // Preserve merge.ts metadata marker for explicit-all-sets rows.
                if use_explicit_sets {
                    rule.all_known_sets = Some(true);
                }
                rules.push(rule);
            }
        }
    }
    rules
}

// Public Final Sell builder export used by merge.ts and worker orchestration.
#[wasm_bindgen]
pub fn build_final_sell_rules_value(
    remainder: JsValue,
    all_known_set_ids: JsValue,
) -> Result<JsValue, JsValue> {
    // Parse nullable remainder payload; null/undefined means disabled.
    let parsed_remainder: Option<FinalSellRemainderIn> = if remainder.is_null() || remainder.is_undefined() {
        None
    } else {
        Some(from_js_value(remainder)
            .map_err(|error| JsValue::from_str(&format!("Invalid final-sell remainder payload: {error}")))?)
    };
    // Parse known set ids list used by explicit-sets mode.
    let parsed_set_ids: Vec<i64> = if all_known_set_ids.is_null() || all_known_set_ids.is_undefined() {
        Vec::<i64>::new()
    } else {
        from_js_value(all_known_set_ids)
            .map_err(|error| JsValue::from_str(&format!("Invalid final-sell set-id payload: {error}")))?
    };
    let rules = build_final_sell_rules_core(parsed_remainder.as_ref(), &parsed_set_ids);
    to_js_value(&rules)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize final-sell rules value: {error}")))
}

// Merge pipeline core combines base/custom/final-sell/keep-unique rows and
// assigns stable preview line indices in one Rust-owned orchestration step.
fn compute_merged_rules_core(input: ComputeMergedRulesIn) -> Vec<RuleRaw> {
    // Parse keep-unique rules defensively so legacy/partial payload rows do not
    // crash merged-rule assembly; invalid rows are simply skipped.
    let parsed_keep_unique_rules = input
        .keep_unique_rules
        .into_iter()
        .filter_map(|value| serde_json::from_value::<KeepUniqueWasmRuleIn>(value).ok())
        .collect::<Vec<_>>();
    // Base rows always carry the hsf source marker unless explicitly provided.
    let mut base_rules = input.base_rules;
    for rule in &mut base_rules {
        if rule.source.is_none() {
            rule.source = Some(RULE_SOURCE_HSF.to_string());
        }
    }
    // Custom rows default to hsfc source for downstream chip rendering.
    let mut custom_rules = input.custom_rules;
    for rule in &mut custom_rules {
        if rule.source.is_none() {
            rule.source = Some(RULE_SOURCE_HSFC.to_string());
        }
    }

    // Build final-sell rows from config payload (if enabled).
    let final_sell_rules = build_final_sell_rules_core(
        input.final_sell_remainder.as_ref(),
        &input.all_known_set_ids,
    );

    // Keep-unique merge prepends injected rows ahead of base when enabled.
    let base_with_keep = if input.keep_unique_enabled {
        let base_without_keep = base_rules
            .iter()
            .filter(|rule| rule.source.as_deref() != Some(RULE_SOURCE_KEEP_UNIQUES))
            .cloned()
            .collect::<Vec<_>>();
        let candidate_keep_rules = if input.keep_unique_detection.is_some() && !parsed_keep_unique_rules.is_empty() {
            build_keep_unique_rules_core(
                &parsed_keep_unique_rules,
                input.keep_unique_detection.as_ref(),
                input.keep_unique_config_id_base.unwrap_or(-1),
            )
        } else {
            Vec::<RuleRaw>::new()
        };
        let sorted_keep_rules = merge_keep_unique_injected_rules_core(
            base_without_keep.clone(),
            custom_rules.clone(),
            candidate_keep_rules,
        );
        let mut merged_base = sorted_keep_rules;
        merged_base.extend(base_without_keep);
        merged_base
    } else {
        base_rules
    };

    // Final merged ordering mirrors merge.ts: keep/base, then custom, then final-sell.
    let mut merged = Vec::<RuleRaw>::new();
    merged.extend(base_with_keep);
    merged.extend(custom_rules);
    merged.extend(final_sell_rules);
    // Assign stable preview line indices used by filtered tables.
    for (idx, rule) in merged.iter_mut().enumerate() {
        rule.line_idx = Some(idx as i64);
    }
    merged
}

// Compute merged rules in one wasm call from prebuilt base/custom batches.
#[wasm_bindgen]
pub fn compute_merged_rules_value(payload: JsValue) -> Result<JsValue, JsValue> {
    let parsed: ComputeMergedRulesIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid compute-merged-rules payload: {error}")))?;
    let merged = compute_merged_rules_core(parsed);
    to_js_value(&merged)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize compute-merged-rules value: {error}")))
}

// Keep-unique merge helper mirrors merge.ts injected-rule filtering/sorting.
fn merge_keep_unique_injected_rules_core(
    base_rules: Vec<RuleRaw>,
    custom_rules: Vec<RuleRaw>,
    candidate_keep_rules: Vec<RuleRaw>,
) -> Vec<RuleRaw> {
    // Remove previously injected keep-unique rows from base key collection.
    let mut base_custom_keep_keys = HashSet::<String>::new();
    for rule in base_rules
        .iter()
        .filter(|entry| entry.source.as_deref() != Some(RULE_SOURCE_KEEP_UNIQUES))
    {
        if rule.Keep.unwrap_or(false) {
            base_custom_keep_keys.insert(collapse_canonical_key(rule));
        }
    }
    // Custom keep rows also block injected duplicates.
    for rule in &custom_rules {
        if rule.Keep.unwrap_or(false) {
            base_custom_keep_keys.insert(collapse_canonical_key(rule));
        }
    }

    // Preserve TS dedupe key behavior for placeholders vs item+level rows.
    let mut injected_keep_keys = HashSet::<String>::new();
    let mut filtered = Vec::<RuleRaw>::new();
    for rule in candidate_keep_rules {
        let canonical = collapse_canonical_key(&rule);
        if base_custom_keep_keys.contains(&canonical) {
            continue;
        }
        let is_keep_unique_source = rule.source.as_deref() == Some(RULE_SOURCE_KEEP_UNIQUES);
        let dedupe_key = if is_keep_unique_source {
            if rule.keep_unique_placeholder.unwrap_or(false) {
                format!("ku:placeholder:{canonical}")
            } else {
                let item_key = rule
                    .keep_unique_item_key
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "na".to_string());
                let level = rule.LVLForCheck.unwrap_or(LEVEL_ANY_SENTINEL);
                format!("ku:item:{item_key}:lvl:{level}")
            }
        } else {
            canonical.clone()
        };
        if injected_keep_keys.contains(&dedupe_key) {
            continue;
        }
        injected_keep_keys.insert(dedupe_key);
        filtered.push(rule);
    }

    // Match merge.ts ordering: level, rule ordinal, placeholder rank, item key.
    let mut sortable = filtered
        .into_iter()
        .enumerate()
        .map(|(idx, rule)| {
            let canonical = collapse_canonical_key(&rule);
            KeepUniqueMergeSortEntry {
                level_idx: level_order_value(rule.LVLForCheck),
                rule_ordinal: rule.keep_unique_rule_ordinal.unwrap_or(JS_MAX_SAFE_INTEGER_I64),
                placeholder_rank: if rule.keep_unique_placeholder.unwrap_or(false) {
                    1
                } else {
                    0
                },
                item_key: rule.keep_unique_item_key.unwrap_or(JS_MAX_SAFE_INTEGER_I64),
                idx,
                canonical,
                rule,
            }
        })
        .collect::<Vec<_>>();
    sortable.sort_by(|left, right| {
        if left.level_idx != right.level_idx {
            return left.level_idx.cmp(&right.level_idx);
        }
        if left.rule_ordinal != right.rule_ordinal {
            return left.rule_ordinal.cmp(&right.rule_ordinal);
        }
        if left.placeholder_rank != right.placeholder_rank {
            return left.placeholder_rank.cmp(&right.placeholder_rank);
        }
        if left.item_key != right.item_key {
            return left.item_key.cmp(&right.item_key);
        }
        if left.canonical != right.canonical {
            return left.canonical.cmp(&right.canonical);
        }
        left.idx.cmp(&right.idx)
    });
    sortable
        .into_iter()
        .map(|entry| entry.rule)
        .collect::<Vec<_>>()
}

// Keep-unique merge export filters/dedupes/sorts injected rules in one wasm call.
#[wasm_bindgen]
pub fn merge_keep_unique_injected_rules_value(
    base_rules: JsValue,
    custom_rules: JsValue,
    candidate_keep_rules: JsValue,
) -> Result<JsValue, JsValue> {
    let parsed_base_rules: Vec<RuleRaw> = from_js_value(base_rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique merge base rules: {error}")))?;
    let parsed_custom_rules: Vec<RuleRaw> = from_js_value(custom_rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique merge custom rules: {error}")))?;
    let parsed_candidate_keep_rules: Vec<RuleRaw> = from_js_value(candidate_keep_rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique merge candidate rules: {error}")))?;
    let merged = merge_keep_unique_injected_rules_core(
        parsed_base_rules,
        parsed_custom_rules,
        parsed_candidate_keep_rules,
    );
    to_js_value(&merged)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize keep-unique merge value: {error}")))
}

// Export dedupe keeps keep-segment matching/collapse in Rust for SSOT semantics.
#[wasm_bindgen]
pub fn dedupe_hsf_rules_for_export_value(rules: JsValue) -> Result<JsValue, JsValue> {
    let parsed_rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid export-dedupe value: {error}")))?;
    let deduped = dedupe_hsf_rules_for_export_core(&parsed_rules);
    to_js_value(&deduped)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize export-dedupe value: {error}")))
}

// Shared generated-rule finalizer used by JSON and JsValue exports.
fn finalize_generated_rules_core(
    raw_entries: Vec<GeneratedRuleEntryIn>,
    apply_obsolete_pruning: bool,
) -> Vec<RuleRaw> {
    // Normalize payload into the internal carry shape.
    let entries = raw_entries
        .into_iter()
        .map(|entry| GeneratedRuleEntry {
            rule: entry.rule,
            branch_order: entry.branch_order,
            branch_seq: entry.branch_seq,
            original_idx: entry.original_idx,
        })
        .collect::<Vec<_>>();

    // Group by canonical key to detect strict epic+legendary duplicates.
    let mut groups = HashMap::<String, Vec<usize>>::new();
    for (idx, entry) in entries.iter().enumerate() {
        let key = collapse_canonical_key(&entry.rule);
        groups.entry(key).or_default().push(idx);
    }

    let mut replacements = HashMap::<usize, GeneratedRuleEntry>::new();
    let mut removed = HashSet::<usize>::new();
    for indices in groups.values() {
        if indices.len() < 2 {
            continue;
        }
        let mut rarity_codes = HashSet::<i64>::new();
        let mut finite = true;
        for idx in indices {
            let Some(code) = entries[*idx].rule.Rarity else {
                finite = false;
                break;
            };
            rarity_codes.insert(code);
        }
        if !finite
            || rarity_codes.len() != 2
            || !rarity_codes.contains(&RARITY_CODE_EPIC)
            || !rarity_codes.contains(&RARITY_CODE_GTE_LEGENDARY)
        {
            continue;
        }
        let mut sorted = indices.clone();
        sorted.sort_unstable();
        let Some(first) = sorted.first().copied() else {
            continue;
        };
        let mut replacement = entries[first].clone();
        replacement.rule.Rarity = Some(RARITY_CODE_GTE_EPIC);
        replacements.insert(first, replacement);
        for idx in sorted.into_iter().skip(1) {
            removed.insert(idx);
        }
    }

    let mut collapsed = Vec::<GeneratedRuleEntry>::new();
    for (idx, entry) in entries.into_iter().enumerate() {
        if removed.contains(&idx) {
            continue;
        }
        if let Some(replacement) = replacements.remove(&idx) {
            collapsed.push(replacement);
        } else {
            collapsed.push(entry);
        }
    }

    // Obsolete pruning only applies when merge.ts says the config has one branch.
    let filtered = if apply_obsolete_pruning {
        let rules = collapsed
            .iter()
            .map(|entry| entry.rule.clone())
            .collect::<Vec<_>>();
        let obsolete = collect_obsolete_entries(&rules);
        if obsolete.is_empty() {
            collapsed
        } else {
            let obsolete_indices = obsolete
                .into_iter()
                .map(|entry| entry.index)
                .collect::<HashSet<_>>();
            collapsed
                .into_iter()
                .enumerate()
                .filter_map(|(idx, entry)| {
                    if obsolete_indices.contains(&idx) {
                        None
                    } else {
                        Some(entry)
                    }
                })
                .collect::<Vec<_>>()
        }
    } else {
        collapsed
    };

    // Stable ordering mirrors merge.ts: level, branch-order, branch-seq, original index.
    let mut sorted = filtered;
    sorted.sort_by(|left, right| {
        let left_level = level_order_value(left.rule.LVLForCheck);
        let right_level = level_order_value(right.rule.LVLForCheck);
        if left_level != right_level {
            return left_level.cmp(&right_level);
        }
        if left.branch_order != right.branch_order {
            return left.branch_order.cmp(&right.branch_order);
        }
        if left.branch_seq != right.branch_seq {
            return left.branch_seq.cmp(&right.branch_seq);
        }
        left.original_idx.cmp(&right.original_idx)
    });

    sorted.into_iter().map(|entry| entry.rule).collect::<Vec<_>>()
}

// Finalize generated branch rules in one WASM step:
// collapse epic/legendary duplicates, optional obsolete pruning, then stable sort.
#[wasm_bindgen]
pub fn finalize_generated_rules(
    entries_json: &str,
    apply_obsolete_pruning: bool,
) -> Result<String, JsValue> {
    let raw_entries: Vec<GeneratedRuleEntryIn> = serde_json::from_str(entries_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid generated-rules JSON: {error}")))?;
    let output = finalize_generated_rules_core(raw_entries, apply_obsolete_pruning);
    serde_json::to_string(&output)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize finalized rules: {error}")))
}

// Fast finalizer export accepts JS arrays directly and returns a JS array.
#[wasm_bindgen]
pub fn finalize_generated_rules_value(
    entries: JsValue,
    apply_obsolete_pruning: bool,
) -> Result<JsValue, JsValue> {
    let parsed_entries: Vec<GeneratedRuleEntryIn> = from_js_value(entries)
        .map_err(|error| JsValue::from_str(&format!("Invalid generated-rules value: {error}")))?;
    let output = finalize_generated_rules_core(parsed_entries, apply_obsolete_pruning);
    to_js_value(&output)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize finalized rules value: {error}")))
}

// Shared configure implementation used by both JSON and JsValue bindings.
fn configure_engine(raw_rules: Vec<RuleRaw>, config_modes: Vec<String>) {
    let prepared_rules = raw_rules.into_iter().map(prepare_rule).collect::<Vec<_>>();
    ENGINE_STATE.with(|state| {
        *state.borrow_mut() = Some(EngineState {
            rules: prepared_rules,
            config_modes,
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

        // Optional baseline path excludes keep-override sources when primary
        // first-match came from those sources.
        let baseline_options = options
            .baseline_exclude_sources
            .as_ref()
            .map(|sources| {
                let mut cloned = options.clone();
                cloned.exclude_sources = Some(sources.clone());
                cloned.baseline_exclude_sources = None;
                cloned
            });

        let results = items
            .iter()
            .map(|entry| {
                let (first_match, first_non_excluded_match, matching_config_indices, matching_config_decisions) =
                    evaluate_item(&engine.rules, &engine.config_modes, &entry.item, &options);
                let mut resolved_first_non_excluded = first_non_excluded_match.clone();
                if let Some(baseline) = baseline_options.as_ref() {
                    let needs_baseline = first_match
                        .as_ref()
                        .and_then(|matched| engine.rules.get(matched.rule_index))
                        .map(|rule| rule.is_keep_override_source)
                        .unwrap_or(false);
                    if needs_baseline {
                        let (_, baseline_non_excluded, _, _) =
                            evaluate_item(&engine.rules, &engine.config_modes, &entry.item, baseline);
                        if baseline_non_excluded.is_some() {
                            resolved_first_non_excluded = baseline_non_excluded;
                        }
                    }
                }

                EvaluateItemResult {
                    item_id: entry.item_id,
                    first_match,
                    first_non_excluded_match: resolved_first_non_excluded,
                    matching_config_indices,
                    matching_config_decisions,
                }
            })
            .collect::<Vec<_>>();

        Ok(results)
    })
}

// Configure rules + config modes once per pipeline run.
// The worker calls this before evaluating one or more item batches.
#[wasm_bindgen]
pub fn configure(rules_json: &str, config_modes_json: &str) -> Result<(), JsValue> {
    let raw_rules: Vec<RuleRaw> = serde_json::from_str(rules_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid rules JSON: {error}")))?;

    let config_modes: Vec<String> = serde_json::from_str(config_modes_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid configModes JSON: {error}")))?;
    configure_engine(raw_rules, config_modes);
    Ok(())
}

// Fast configure variant accepts JS objects directly (no JSON stringify).
#[wasm_bindgen]
pub fn configure_value(rules: JsValue, config_modes: JsValue) -> Result<(), JsValue> {
    let raw_rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid rules value: {error}")))?;
    let config_modes: Vec<String> = from_js_value(config_modes)
        .map_err(|error| JsValue::from_str(&format!("Invalid configModes value: {error}")))?;
    configure_engine(raw_rules, config_modes);
    Ok(())
}

// Evaluate a batch of tester items against the configured rules.
// Returns a JSON payload matching the existing worker result shape.
#[wasm_bindgen]
pub fn evaluate(items_json: &str, options_json: &str) -> Result<String, JsValue> {
    let items: Vec<EvaluateItemRaw> = serde_json::from_str(items_json)
        .map_err(|error| JsValue::from_str(&format!("Invalid items JSON: {error}")))?;

    let options: EvaluateOptionsRaw = if options_json.trim().is_empty() {
        EvaluateOptionsRaw::default()
    } else {
        serde_json::from_str(options_json)
            .map_err(|error| JsValue::from_str(&format!("Invalid options JSON: {error}")))?
    };
    let results = evaluate_engine(items, options)?;

    serde_json::to_string(&results)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize results: {error}")))
}

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

// Keep-unique detection constants mirror src/lib/keepUniques.ts behavior.
// Reasons mark whether placeholders come from a global shortfall
// or from a specific grouped bucket that is under-filled.
const KEEP_UNIQUE_REASON_GLOBAL: &str = "global";
const KEEP_UNIQUE_REASON_GROUP: &str = "group";
// Activation "off" means sold items do not contribute to projected coverage.
const KEEP_UNIQUE_ACTIVATION_OFF: &str = "off";
const KEEP_UNIQUE_ACTIVATION_PROTECT_EXISTING: &str = "protectExisting";
const KEEP_UNIQUE_ACTIVATION_ANTICIPATE_GAPS: &str = "anticipategaps";
// Substat matching modes are normalized to these three canonical tokens.
const KEEP_UNIQUE_SUBSTAT_ANY: &str = "any";
const KEEP_UNIQUE_SUBSTAT_ALL: &str = "all";
const KEEP_UNIQUE_SUBSTAT_PER_SUBSTAT: &str = "persubstat";
// Epsilon is used only for tie expansion at the score boundary.
const KEEP_UNIQUE_SCORE_TIE_EPSILON: f64 = 1e-9;
// Weights are snapped to this fixed step and clamped to this range.
const KEEP_UNIQUE_WEIGHT_STEP: f64 = 0.05;
const KEEP_UNIQUE_WEIGHT_MIN: f64 = 0.1;
const KEEP_UNIQUE_WEIGHT_MAX: f64 = 3.0;
const KEEP_UNIQUE_WEIGHT_DEFAULT: f64 = 1.0;
// Placeholder samples need stable defaults when no group sample exists.
const KEEP_UNIQUE_DEFAULT_SAMPLE_SLOT: i64 = ARTIFACT_TYPE_WEAPON;
const KEEP_UNIQUE_DEFAULT_SAMPLE_SET: i64 = ACCESSORY_NO_SET_ID;
// Main-stat constants keep comparisons aligned with TS StatVariant encoding.
const KEEP_UNIQUE_MAIN_ANY: i64 = STAT_VARIANT_ANY;
const KEEP_UNIQUE_MAIN_HP_PERCENT: i64 = STAT_VARIANT_HP_PERCENT;
const KEEP_UNIQUE_MAIN_HP_FLAT: i64 = STAT_VARIANT_HP_FLAT;
const KEEP_UNIQUE_MAIN_ATK_PERCENT: i64 = STAT_VARIANT_ATK_PERCENT;
const KEEP_UNIQUE_MAIN_ATK_FLAT: i64 = STAT_VARIANT_ATK_FLAT;
const KEEP_UNIQUE_MAIN_DEF_PERCENT: i64 = STAT_VARIANT_DEF_PERCENT;
const KEEP_UNIQUE_MAIN_DEF_FLAT: i64 = STAT_VARIANT_DEF_FLAT;
const KEEP_UNIQUE_SLOT_RING: i64 = ARTIFACT_TYPE_RING;
const KEEP_UNIQUE_SLOT_AMULET: i64 = ARTIFACT_TYPE_AMULET;
const KEEP_UNIQUE_SLOT_BANNER: i64 = ARTIFACT_TYPE_BANNER;

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmSubstatIn {
    variant: i64,
    #[serde(default)]
    is_flat: bool,
    value: f64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmArtifactIn {
    id: Option<i64>,
    slot: i64,
    set: i64,
    rank: i64,
    rarity: i64,
    level: i64,
    exact_level: Option<i64>,
    faction: i64,
    main_stat: i64,
    #[serde(default)]
    substats: Vec<KeepUniqueWasmSubstatIn>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmCandidateIn {
    item_key: i64,
    group_key: String,
    is_sold: bool,
    artifact: KeepUniqueWasmArtifactIn,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmSetSelection {
    id: i64,
    #[serde(default)]
    excluded: bool,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmCombination {
    #[serde(default)]
    slots: Vec<i64>,
    #[serde(default)]
    sets: Vec<KeepUniqueWasmSetSelection>,
    #[serde(default)]
    meta_set_ids: Vec<String>,
    #[serde(default)]
    ranks: Vec<i64>,
    #[serde(default)]
    rarities: Vec<i64>,
    #[serde(default)]
    main_stats: Vec<i64>,
    #[serde(default)]
    factions: Vec<i64>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Copy, Default)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmCountMode {
    #[serde(default)]
    per_rule: bool,
    #[serde(default)]
    per_set: bool,
    #[serde(default)]
    per_faction: bool,
    #[serde(default)]
    per_main_stat: bool,
    #[serde(default)]
    per_slot: bool,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmRuleIn {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    combination: Option<KeepUniqueWasmCombination>,
    #[serde(default)]
    required_count: Option<i64>,
    #[serde(default)]
    activation: Option<String>,
    #[serde(default)]
    count_mode: Option<KeepUniqueWasmCountMode>,
    #[serde(default)]
    substats: Option<Vec<i64>>,
    #[serde(default)]
    substat_match: Option<String>,
    #[serde(default)]
    substat_weights: Option<HashMap<String, f64>>,
}

// Resolved keep-unique rule payload returned to TS after metaset expansion.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmResolvedRuleOut {
    id: String,
    name: String,
    combination: KeepUniqueWasmCombination,
    required_count: i64,
    activation: String,
    count_mode: KeepUniqueWasmCountMode,
    substats: Vec<i64>,
    substat_match: String,
    substat_weights: HashMap<String, f64>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmExpectedSampleIn {
    slot: i64,
    set: i64,
    faction: i64,
    main_stat: i64,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmExpectedGroupIn {
    key: String,
    sample: KeepUniqueWasmExpectedSampleIn,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmExpectedGroupDomainIn {
    slot_order: Vec<i64>,
    accessory_compatible_set_ids: Vec<i64>,
    armor_compatible_set_ids: Vec<i64>,
    allowed_main_by_slot: HashMap<String, Vec<i64>>,
    all_faction_ids: Vec<i64>,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmExpectedGroupsPayloadIn {
    #[serde(default)]
    expected_groups_by_rule_id: HashMap<String, Vec<KeepUniqueWasmExpectedGroupIn>>,
    expected_group_domain: Option<KeepUniqueWasmExpectedGroupDomainIn>,
}

// Normalize keep-unique expected-group domain arrays/maps in Rust so sorting,
// de-duplication, and slot ordering remain single-sourced with matcher logic.
#[wasm_bindgen]
pub fn normalize_keep_unique_expected_group_domain_value(payload: JsValue) -> Result<JsValue, JsValue> {
    let parsed: KeepUniqueWasmExpectedGroupDomainIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique expected-group domain payload: {error}")))?;

    // Slot order uses domain helper so fallback ordering stays consistent.
    let slot_order = keep_unique_domain_slot_order(&parsed);
    // Set/faction arrays collapse to sorted unique integer domains.
    let accessory_compatible_set_ids = keep_unique_sorted_unique_i64(&parsed.accessory_compatible_set_ids);
    let armor_compatible_set_ids = keep_unique_sorted_unique_i64(&parsed.armor_compatible_set_ids);
    let all_faction_ids = keep_unique_sorted_unique_i64(&parsed.all_faction_ids)
        .into_iter()
        .filter(|value| *value > 0)
        .collect::<Vec<_>>();
    // Per-slot mains are normalized with the same sorted/unique helper.
    let mut allowed_main_by_slot = HashMap::<String, Vec<i64>>::new();
    for (slot_key, values) in &parsed.allowed_main_by_slot {
        allowed_main_by_slot.insert(slot_key.to_string(), keep_unique_sorted_unique_i64(values));
    }

    let normalized = KeepUniqueWasmExpectedGroupDomainIn {
        slot_order,
        accessory_compatible_set_ids,
        armor_compatible_set_ids,
        allowed_main_by_slot,
        all_faction_ids,
    };

    to_js_value(&normalized)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize keep-unique expected-group domain: {error}")))
}

// Metaset payload for in-wasm keep-unique set expansion.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmMetasetIn {
    id: String,
    #[serde(default)]
    sets: Vec<i64>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmSubstatOut {
    variant: i64,
    is_flat: bool,
    value: f64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmArtifactOut {
    item_key: i64,
    slot: i64,
    set: i64,
    rank: i64,
    rarity: i64,
    level: i64,
    exact_level: Option<i64>,
    faction: i64,
    main_stat: i64,
    substats: Vec<KeepUniqueWasmSubstatOut>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmPlaceholderOut {
    combination: KeepUniqueWasmCombination,
    missing: i64,
    reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    substat_variants: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmEntryOut {
    hash: String,
    combination: KeepUniqueWasmCombination,
    rule_id: Option<String>,
    rule_activation: String,
    count_mode: KeepUniqueWasmCountMode,
    per_group_required_count: i64,
    groups_tracked: i64,
    required_count: i64,
    current_count: i64,
    projected_count: i64,
    deficit: i64,
    covered_by_existing: bool,
    item_keys: Vec<i64>,
    artifacts: Vec<KeepUniqueWasmArtifactOut>,
    placeholders: Vec<KeepUniqueWasmPlaceholderOut>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmSnapshotOut {
    scanned_at: f64,
    entries: Vec<KeepUniqueWasmEntryOut>,
}

#[derive(Debug, Clone)]
struct KeepUniqueWasmPreparedRule {
    id: String,
    combination: KeepUniqueWasmCombination,
    required_per_group: i64,
    activation: String,
    rule_active: bool,
    count_mode: KeepUniqueWasmCountMode,
    selected_substats: Vec<i64>,
    substat_match: String,
    weights: HashMap<i64, f64>,
    set_includes: HashSet<i64>,
    set_excludes: HashSet<i64>,
    expected_groups: Vec<KeepUniqueWasmExpectedGroupIn>,
}

#[derive(Debug, Clone)]
struct KeepUniqueWasmScoredCandidate {
    candidate_idx: usize,
    score: f64,
}

#[derive(Debug, Clone)]
struct KeepUniqueWasmGroupSample {
    slot: i64,
    set: i64,
    faction: i64,
    main_stat: i64,
}

#[derive(Debug, Clone)]
struct KeepUniqueWasmExpectedGroupResolved {
    key: String,
    sample: KeepUniqueWasmGroupSample,
}

#[derive(Debug, Clone)]
struct KeepUniqueWasmGroupBucket {
    kept: Vec<usize>,
    sold: Vec<usize>,
    sample: Option<KeepUniqueWasmGroupSample>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmCountKeyArtifactIn {
    slot: i64,
    set: i64,
    faction: i64,
    main_stat: i64,
}

fn keep_unique_is_accessory_slot(slot: i64) -> bool {
    // Accessories are the only slots where faction grouping applies.
    // Artifact slots always collapse to faction 0 in keep-unique logic.
    slot == KEEP_UNIQUE_SLOT_RING || slot == KEEP_UNIQUE_SLOT_AMULET || slot == KEEP_UNIQUE_SLOT_BANNER
}

fn keep_unique_sanitize_count_mode(mode: KeepUniqueWasmCountMode) -> KeepUniqueWasmCountMode {
    // `per_rule` is exclusive: when set, all per-dimension toggles must be off.
    if mode.per_rule {
        return KeepUniqueWasmCountMode {
            per_rule: true,
            per_set: false,
            per_faction: false,
            per_main_stat: false,
            per_slot: false,
        };
    }
    // If no grouping flag is enabled, treat the mode as global per-rule.
    // This mirrors TS fallback behavior for partially initialized payloads.
    let has_grouping = mode.per_set || mode.per_faction || mode.per_main_stat || mode.per_slot;
    if !has_grouping {
        return KeepUniqueWasmCountMode {
            per_rule: true,
            per_set: false,
            per_faction: false,
            per_main_stat: false,
            per_slot: false,
        };
    }
    // Grouped mode keeps only the explicit toggles and clears per_rule.
    KeepUniqueWasmCountMode {
        per_rule: false,
        per_set: mode.per_set,
        per_faction: mode.per_faction,
        per_main_stat: mode.per_main_stat,
        per_slot: mode.per_slot,
    }
}

// Keep-unique UI defaults group by set+faction+main stat (slot disabled).
fn keep_unique_default_count_mode() -> KeepUniqueWasmCountMode {
    KeepUniqueWasmCountMode {
        per_rule: false,
        per_set: true,
        per_faction: true,
        per_main_stat: true,
        per_slot: false,
    }
}

// Resolve optional count-mode payloads into the canonical sanitized shape.
fn keep_unique_resolve_count_mode(mode: Option<KeepUniqueWasmCountMode>) -> KeepUniqueWasmCountMode {
    let seeded = mode.unwrap_or_else(keep_unique_default_count_mode);
    keep_unique_sanitize_count_mode(seeded)
}

fn keep_unique_normalize_substat_match(raw: &str) -> String {
    // Normalize whitespace/casing so persisted files and UI payloads match.
    let trimmed = raw.trim().to_ascii_lowercase();
    // Unknown tokens collapse to `any` to stay backward compatible.
    match trimmed.as_str() {
        KEEP_UNIQUE_SUBSTAT_ALL => KEEP_UNIQUE_SUBSTAT_ALL.to_string(),
        KEEP_UNIQUE_SUBSTAT_PER_SUBSTAT => KEEP_UNIQUE_SUBSTAT_PER_SUBSTAT.to_string(),
        _ => KEEP_UNIQUE_SUBSTAT_ANY.to_string(),
    }
}

fn keep_unique_normalize_weight(raw: f64) -> f64 {
    // Non-finite weights are replaced with the canonical default.
    if !raw.is_finite() {
        return KEEP_UNIQUE_WEIGHT_DEFAULT;
    }
    // Clamp first, then snap to configured step size.
    let clamped = raw.clamp(KEEP_UNIQUE_WEIGHT_MIN, KEEP_UNIQUE_WEIGHT_MAX);
    let stepped = (clamped / KEEP_UNIQUE_WEIGHT_STEP).round() * KEEP_UNIQUE_WEIGHT_STEP;
    // Round again to avoid binary float artifacts in serialized payloads.
    (stepped * 100.0).round() / 100.0
}

fn keep_unique_substat_max6_by_variant(variant: i64) -> f64 {
    // Constants mirror keepUniques.ts::substatMax6ByVariant exactly.
    // Unknown variants return 0 to disable normalized contribution.
    match variant {
        STAT_VARIANT_HP_FLAT => 565.0,
        STAT_VARIANT_HP_PERCENT => 7.0,
        STAT_VARIANT_ATK_FLAT => 30.0,
        STAT_VARIANT_ATK_PERCENT => 7.0,
        STAT_VARIANT_DEF_FLAT => 30.0,
        STAT_VARIANT_DEF_PERCENT => 7.0,
        STAT_VARIANT_SPD => 6.0,
        STAT_VARIANT_RES => 12.0,
        STAT_VARIANT_ACC => 12.0,
        STAT_VARIANT_CR => 7.0,
        STAT_VARIANT_CDMG => 7.0,
        _ => 0.0,
    }
}

fn keep_unique_normalize_substat_value(variant: i64, value: f64) -> f64 {
    // Normalize every substat by the canonical 6-star max roll total.
    let max = keep_unique_substat_max6_by_variant(variant);
    // Unknown variants or invalid maxima contribute zero.
    if max <= 0.0 || !max.is_finite() {
        return 0.0;
    }
    // Missing/invalid values also contribute zero.
    if !value.is_finite() || value <= 0.0 {
        return 0.0;
    }
    // Keep lower bound at zero; we do not cap >1 because high rolls are valid.
    (value / max).max(0.0)
}

fn keep_unique_percent_to_flat_main(variant: i64) -> Option<i64> {
    // Map percent mains to their flat counterpart for tie-priority logic.
    // Non HP/ATK/DEF mains have no flat companion and return None.
    match variant {
        KEEP_UNIQUE_MAIN_HP_PERCENT => Some(KEEP_UNIQUE_MAIN_HP_FLAT),
        KEEP_UNIQUE_MAIN_ATK_PERCENT => Some(KEEP_UNIQUE_MAIN_ATK_FLAT),
        KEEP_UNIQUE_MAIN_DEF_PERCENT => Some(KEEP_UNIQUE_MAIN_DEF_FLAT),
        _ => None,
    }
}

fn keep_unique_normalize_set_selections(values: &[KeepUniqueWasmSetSelection]) -> Vec<KeepUniqueWasmSetSelection> {
    // Use map-by-id so duplicates collapse deterministically.
    let mut by_id = HashMap::<i64, KeepUniqueWasmSetSelection>::new();
    for entry in values {
        // Exclusions always win over includes for the same set id.
        if entry.excluded {
            by_id.insert(
                entry.id,
                KeepUniqueWasmSetSelection {
                    id: entry.id,
                    excluded: true,
                },
            );
            continue;
        }
        // If an exclusion already exists, never downgrade it to include.
        if let Some(prev) = by_id.get(&entry.id) {
            if prev.excluded {
                continue;
            }
        }
        // Keep explicit include when no stronger exclusion exists.
        by_id.insert(
            entry.id,
            KeepUniqueWasmSetSelection {
                id: entry.id,
                excluded: false,
            },
        );
    }
    // Stable sort keeps canonical hash generation deterministic.
    let mut normalized = by_id.into_values().collect::<Vec<_>>();
    normalized.sort_by_key(|entry| entry.id);
    normalized
}

fn keep_unique_split_set_selections(values: &[KeepUniqueWasmSetSelection]) -> (HashSet<i64>, HashSet<i64>) {
    // Normalize first so duplicates/exclusions are already resolved.
    let normalized = keep_unique_normalize_set_selections(values);
    let mut includes = HashSet::<i64>::new();
    let mut excludes = HashSet::<i64>::new();
    for entry in normalized {
        // Split into include/exclude lookup sets for hot match loops.
        if entry.excluded {
            excludes.insert(entry.id);
        } else {
            includes.insert(entry.id);
        }
    }
    (includes, excludes)
}

fn keep_unique_sorted_unique_i64(values: &[i64]) -> Vec<i64> {
    // Normalize arbitrary numeric lists into deterministic ascending vectors.
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    sorted.dedup();
    sorted
}

fn keep_unique_domain_slot_order(domain: &KeepUniqueWasmExpectedGroupDomainIn) -> Vec<i64> {
    // Domain-provided slot order is authoritative; fallback keeps canonical order.
    if domain.slot_order.is_empty() {
        return vec![
            ARTIFACT_TYPE_WEAPON,
            ARTIFACT_TYPE_HELMET,
            ARTIFACT_TYPE_SHIELD,
            ARTIFACT_TYPE_GAUNTLETS,
            ARTIFACT_TYPE_CHESTPLATE,
            ARTIFACT_TYPE_BOOTS,
            ARTIFACT_TYPE_RING,
            ARTIFACT_TYPE_AMULET,
            ARTIFACT_TYPE_BANNER,
        ];
    }
    keep_unique_sorted_unique_i64(&domain.slot_order)
}

fn keep_unique_domain_allowed_mains_for_slot(
    domain: &KeepUniqueWasmExpectedGroupDomainIn,
    slot: i64,
) -> Vec<i64> {
    // Object keys cross the JS/WASM boundary as strings, so index by string slot id.
    let key = slot.to_string();
    let values = domain.allowed_main_by_slot.get(&key).cloned().unwrap_or_default();
    keep_unique_sorted_unique_i64(&values)
}

fn keep_unique_resolve_slot_candidates(
    combination: &KeepUniqueWasmCombination,
    domain: &KeepUniqueWasmExpectedGroupDomainIn,
) -> Vec<i64> {
    // Explicit slots preserve user-selected ordering; otherwise use preferred slot order.
    let base_slots = if combination.slots.is_empty() {
        keep_unique_domain_slot_order(domain)
    } else {
        combination.slots.clone()
    };
    // Slot-level filtering checks include/exclude sets once per call.
    let (set_includes, _) = keep_unique_split_set_selections(&combination.sets);
    let has_set_includes = !set_includes.is_empty();
    // Faction filters with only positive ids imply accessory-only matching.
    let requires_accessory = !combination.factions.is_empty() && combination.factions.iter().all(|value| *value > 0);
    let accessory_set_pool = domain
        .accessory_compatible_set_ids
        .iter()
        .copied()
        .chain([ACCESSORY_NO_SET_ID])
        .collect::<HashSet<_>>();
    let armor_set_pool = domain
        .armor_compatible_set_ids
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let mut result = Vec::<i64>::new();
    let mut seen = HashSet::<i64>::new();
    for slot in base_slots {
        if !seen.insert(slot) {
            continue;
        }
        let accessory_slot = keep_unique_is_accessory_slot(slot);
        // Accessory requirement drops artifact slots immediately.
        if requires_accessory && !accessory_slot {
            continue;
        }
        // Main-stat selections require at least one compatible main for this slot.
        if !combination.main_stats.is_empty() {
            let allowed_mains = keep_unique_domain_allowed_mains_for_slot(domain, slot);
            if allowed_mains.is_empty() {
                continue;
            }
            let matches_main = combination.main_stats.iter().any(|variant| allowed_mains.contains(variant));
            if !matches_main {
                continue;
            }
        }
        // Explicit set includes require at least one include compatible with this slot family.
        if has_set_includes {
            let pool = if accessory_slot {
                &accessory_set_pool
            } else {
                &armor_set_pool
            };
            let has_compatible_set = set_includes.iter().any(|set_id| {
                if *set_id == ACCESSORY_NO_SET_ID {
                    accessory_slot
                } else {
                    pool.contains(set_id)
                }
            });
            if !has_compatible_set {
                continue;
            }
        }
        result.push(slot);
    }
    result
}

fn keep_unique_resolve_set_candidates_for_slot(
    combination: &KeepUniqueWasmCombination,
    slot: i64,
    domain: &KeepUniqueWasmExpectedGroupDomainIn,
) -> Vec<i64> {
    let accessory_slot = keep_unique_is_accessory_slot(slot);
    // Includes/excludes are canonicalized once per slot resolution.
    let (set_includes, set_excludes) = keep_unique_split_set_selections(&combination.sets);
    let has_set_includes = !set_includes.is_empty();
    let allowed_pool = if accessory_slot {
        keep_unique_sorted_unique_i64(&domain.accessory_compatible_set_ids)
    } else {
        keep_unique_sorted_unique_i64(&domain.armor_compatible_set_ids)
    };
    let allowed_pool_set = allowed_pool.iter().copied().collect::<HashSet<_>>();
    if has_set_includes {
        // Include mode keeps only explicit set ids that are valid for this slot type.
        let mut filtered = set_includes
            .into_iter()
            .filter(|set_id| {
                if *set_id == ACCESSORY_NO_SET_ID {
                    accessory_slot
                } else {
                    allowed_pool_set.contains(set_id)
                }
            })
            .collect::<Vec<_>>();
        filtered.sort_unstable();
        filtered.dedup();
        return filtered;
    }
    // Non-include mode starts from allowed pool and applies exclusions.
    let mut filtered = allowed_pool
        .into_iter()
        .filter(|set_id| !set_excludes.contains(set_id))
        .collect::<Vec<_>>();
    // Accessory slots also support the no-set sentinel unless includes were explicit.
    if accessory_slot {
        filtered.push(ACCESSORY_NO_SET_ID);
    }
    filtered.sort_unstable();
    filtered.dedup();
    filtered
}

fn keep_unique_resolve_set_candidates_for_slots(
    combination: &KeepUniqueWasmCombination,
    slots: &[i64],
    domain: &KeepUniqueWasmExpectedGroupDomainIn,
) -> Vec<i64> {
    // Union set ids across all candidate slots while keeping ascending order.
    let mut merged = HashSet::<i64>::new();
    for slot in slots {
        for set_id in keep_unique_resolve_set_candidates_for_slot(combination, *slot, domain) {
            merged.insert(set_id);
        }
    }
    let mut values = merged.into_iter().collect::<Vec<_>>();
    values.sort_unstable();
    values
}

fn keep_unique_resolve_main_stat_candidates_for_slot(
    combination: &KeepUniqueWasmCombination,
    slot: i64,
    domain: &KeepUniqueWasmExpectedGroupDomainIn,
) -> Vec<i64> {
    let allowed = keep_unique_domain_allowed_mains_for_slot(domain, slot);
    if allowed.is_empty() {
        return Vec::new();
    }
    // Explicit main-stat selections are intersected with slot-compatible mains.
    if !combination.main_stats.is_empty() {
        let allowed_set = allowed.iter().copied().collect::<HashSet<_>>();
        let mut filtered = combination
            .main_stats
            .iter()
            .copied()
            .filter(|variant| allowed_set.contains(variant))
            .collect::<Vec<_>>();
        filtered.sort_unstable();
        filtered.dedup();
        return filtered;
    }
    allowed
}

fn keep_unique_resolve_main_stat_candidates_for_slots(
    combination: &KeepUniqueWasmCombination,
    slots: &[i64],
    domain: &KeepUniqueWasmExpectedGroupDomainIn,
) -> Vec<i64> {
    // Union main-stat variants across the slot candidates.
    let mut merged = HashSet::<i64>::new();
    for slot in slots {
        for variant in keep_unique_resolve_main_stat_candidates_for_slot(combination, *slot, domain) {
            merged.insert(variant);
        }
    }
    let mut values = merged.into_iter().collect::<Vec<_>>();
    values.sort_unstable();
    values
}

fn keep_unique_resolve_faction_candidates_for_slot(
    combination: &KeepUniqueWasmCombination,
    slot: i64,
    domain: &KeepUniqueWasmExpectedGroupDomainIn,
) -> Vec<i64> {
    let mut selection = combination
        .factions
        .iter()
        .copied()
        .collect::<Vec<_>>();
    selection.sort_unstable();
    selection.dedup();
    let has_selection = !selection.is_empty();
    if !keep_unique_is_accessory_slot(slot) {
        // Artifact slots always normalize faction to zero.
        if !has_selection {
            return vec![0];
        }
        return if selection.contains(&0) { vec![0] } else { Vec::new() };
    }
    // Accessory slots honor explicit positive selections when provided.
    if has_selection {
        return selection.into_iter().filter(|value| *value > 0).collect::<Vec<_>>();
    }
    // Otherwise enumerate all known factions from the domain payload.
    keep_unique_sorted_unique_i64(&domain.all_faction_ids)
}

fn keep_unique_resolve_slot_samples(slots: &[i64], count_mode: KeepUniqueWasmCountMode) -> Vec<i64> {
    // Per-slot mode keeps every slot candidate.
    if count_mode.per_slot {
        return slots.to_vec();
    }
    // Without faction grouping, one slot sample is enough.
    if !count_mode.per_faction {
        return slots.first().copied().map(|slot| vec![slot]).unwrap_or_default();
    }
    // Faction grouping needs one accessory and one armor sample when available.
    let accessory = slots.iter().copied().find(|slot| keep_unique_is_accessory_slot(*slot));
    let armor = slots.iter().copied().find(|slot| !keep_unique_is_accessory_slot(*slot));
    let mut samples = Vec::<i64>::new();
    if let Some(slot) = accessory {
        samples.push(slot);
    }
    if let Some(slot) = armor {
        samples.push(slot);
    }
    if samples.is_empty() {
        slots.first().copied().map(|slot| vec![slot]).unwrap_or_default()
    } else {
        samples
    }
}

fn keep_unique_build_expected_groups_for_rule(
    combination: &KeepUniqueWasmCombination,
    count_mode: KeepUniqueWasmCountMode,
    domain: &KeepUniqueWasmExpectedGroupDomainIn,
) -> Vec<KeepUniqueWasmExpectedGroupIn> {
    // Per-rule mode does not split by any count-key dimension.
    if count_mode.per_rule {
        return Vec::new();
    }
    let slot_candidates = keep_unique_resolve_slot_candidates(combination, domain);
    if slot_candidates.is_empty() {
        return Vec::new();
    }
    let slot_samples = keep_unique_resolve_slot_samples(&slot_candidates, count_mode);
    let union_sets = if count_mode.per_set && !count_mode.per_slot {
        keep_unique_resolve_set_candidates_for_slots(combination, &slot_candidates, domain)
    } else {
        Vec::new()
    };
    let union_main_stats = if count_mode.per_main_stat && !count_mode.per_slot {
        keep_unique_resolve_main_stat_candidates_for_slots(combination, &slot_candidates, domain)
    } else {
        Vec::new()
    };
    // Preserve insertion order while deduping by count key.
    let mut seen = HashSet::<String>::new();
    let mut expected = Vec::<KeepUniqueWasmExpectedGroupIn>::new();
    for slot in slot_samples {
        let set_candidates = if count_mode.per_set {
            if count_mode.per_slot {
                keep_unique_resolve_set_candidates_for_slot(combination, slot, domain)
            } else {
                union_sets.clone()
            }
        } else {
            vec![ACCESSORY_NO_SET_ID]
        };
        if count_mode.per_set && set_candidates.is_empty() {
            continue;
        }
        let faction_candidates = if count_mode.per_faction {
            keep_unique_resolve_faction_candidates_for_slot(combination, slot, domain)
        } else {
            vec![0]
        };
        if count_mode.per_faction && faction_candidates.is_empty() {
            continue;
        }
        let main_stat_candidates = if count_mode.per_main_stat {
            if count_mode.per_slot {
                keep_unique_resolve_main_stat_candidates_for_slot(combination, slot, domain)
            } else {
                union_main_stats.clone()
            }
        } else {
            vec![KEEP_UNIQUE_MAIN_ANY]
        };
        if count_mode.per_main_stat && main_stat_candidates.is_empty() {
            continue;
        }
        // Cartesian product across the active grouped dimensions.
        for set_id in &set_candidates {
            for faction in &faction_candidates {
                for main_stat in &main_stat_candidates {
                    let key = keep_unique_count_key_from_parts(
                        slot,
                        *set_id,
                        *faction,
                        *main_stat,
                        count_mode,
                    );
                    if !seen.insert(key.clone()) {
                        continue;
                    }
                    expected.push(KeepUniqueWasmExpectedGroupIn {
                        key,
                        sample: KeepUniqueWasmExpectedSampleIn {
                            slot,
                            set: *set_id,
                            faction: *faction,
                            main_stat: *main_stat,
                        },
                    });
                }
            }
        }
    }
    expected
}

fn keep_unique_canonicalize_number_list(values: &[i64]) -> String {
    // Empty selection is represented as wildcard in canonical hashes.
    if values.is_empty() {
        return "*".to_string();
    }
    // Sort to make hash independent from UI selection order.
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    // Join into comma-delimited canonical token list.
    sorted
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>()
        .join(",")
}

fn keep_unique_canonicalize_set_entries(values: &[KeepUniqueWasmSetSelection]) -> String {
    // Canonicalization must respect include/exclude precedence rules.
    let normalized = keep_unique_normalize_set_selections(values);
    // Empty normalized set list is wildcard.
    if normalized.is_empty() {
        return "*".to_string();
    }
    // Prefix exclusions with `!` so hashes preserve exclusion semantics.
    normalized
        .iter()
        .map(|entry| {
            if entry.excluded {
                format!("!{}", entry.id)
            } else {
                entry.id.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(",")
}

fn keep_unique_canonicalize_string_list(values: &[String]) -> String {
    // Empty metaset list is wildcard in the combination hash.
    if values.is_empty() {
        return "*".to_string();
    }
    // Trim and drop blanks so cosmetic spacing does not alter hashes.
    let mut cleaned = values
        .iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    // All-empty after cleanup still maps to wildcard.
    if cleaned.is_empty() {
        return "*".to_string();
    }
    // Sort for stable order-independent canonicalization.
    cleaned.sort();
    cleaned.join(",")
}

fn keep_unique_hash_combination(combination: &KeepUniqueWasmCombination) -> String {
    // Hash token order mirrors TS combination fingerprint construction.
    [
        keep_unique_canonicalize_number_list(&combination.slots),
        keep_unique_canonicalize_set_entries(&combination.sets),
        keep_unique_canonicalize_string_list(&combination.meta_set_ids),
        keep_unique_canonicalize_number_list(&combination.ranks),
        keep_unique_canonicalize_number_list(&combination.rarities),
        keep_unique_canonicalize_number_list(&combination.main_stats),
        keep_unique_canonicalize_number_list(&combination.factions),
    ]
    .join("|")
}

// Keep rank/rarity clamp behavior aligned with merge.ts helper logic.
fn keep_unique_clamp_rank_or_rarity_value(value: i64) -> i64 {
    value.clamp(RANK_RARITY_MIN, RANK_RARITY_MAX)
}

// Keep rarity code mapping aligned with merge.ts::rarityValueToCode.
fn keep_unique_rarity_value_to_code(value: i64) -> i64 {
    match keep_unique_clamp_rank_or_rarity_value(value) {
        1 => RARITY_CODE_COMMON,
        2 => RARITY_CODE_UNCOMMON,
        3 => RARITY_CODE_RARE,
        4 => RARITY_CODE_EPIC,
        5 => RARITY_CODE_LEGENDARY,
        _ => RARITY_CODE_MYTHICAL,
    }
}

// Keep level-coverage expansion aligned with merge.ts::coverageLevelsForArtifact.
fn keep_unique_coverage_levels_for_artifact(artifact: &KeepUniqueWasmArtifactOut) -> Vec<i64> {
    let resolved = artifact
        .exact_level
        .unwrap_or(artifact.level)
        .clamp(LEVEL_MILESTONE_0, LEVEL_MILESTONE_16);
    if resolved >= LEVEL_MILESTONE_16 {
        return vec![LEVEL_MILESTONE_16];
    }
    if resolved >= LEVEL_MILESTONE_12 {
        return vec![LEVEL_MILESTONE_12, LEVEL_MILESTONE_16];
    }
    if resolved >= LEVEL_MILESTONE_8 {
        return vec![LEVEL_MILESTONE_8, LEVEL_MILESTONE_12, LEVEL_MILESTONE_16];
    }
    if resolved >= LEVEL_MILESTONE_4 {
        return vec![
            LEVEL_MILESTONE_4,
            LEVEL_MILESTONE_8,
            LEVEL_MILESTONE_12,
            LEVEL_MILESTONE_16,
        ];
    }
    vec![
        LEVEL_MILESTONE_0,
        LEVEL_MILESTONE_4,
        LEVEL_MILESTONE_8,
        LEVEL_MILESTONE_12,
        LEVEL_MILESTONE_16,
    ]
}

// Convert StatVariant to HSF main tuple (id + f flag) matching hsfTypes.ts.
fn keep_unique_variant_to_main(variant: i64) -> (i64, i64) {
    match variant {
        STAT_VARIANT_HP_PERCENT => (STAT_ID_HP, 0),
        STAT_VARIANT_HP_FLAT => (STAT_ID_HP, 1),
        STAT_VARIANT_ATK_PERCENT => (STAT_ID_ATK, 0),
        STAT_VARIANT_ATK_FLAT => (STAT_ID_ATK, 1),
        STAT_VARIANT_DEF_PERCENT => (STAT_ID_DEF, 0),
        STAT_VARIANT_DEF_FLAT => (STAT_ID_DEF, 1),
        STAT_VARIANT_SPD => (STAT_ID_SPD, 1),
        STAT_VARIANT_RES => (STAT_ID_RES, 1),
        STAT_VARIANT_ACC => (STAT_ID_ACC, 1),
        STAT_VARIANT_CR => (STAT_ID_CR, 0),
        STAT_VARIANT_CDMG => (STAT_ID_CDMG, 0),
        _ => (STAT_ID_ANY, 1),
    }
}

// Convert StatVariant to HSF sub tuple (id + isFlat) matching hsfTypes.ts.
fn keep_unique_variant_to_sub(variant: i64) -> (i64, bool) {
    match variant {
        STAT_VARIANT_HP_PERCENT => (STAT_ID_HP, false),
        STAT_VARIANT_HP_FLAT => (STAT_ID_HP, true),
        STAT_VARIANT_ATK_PERCENT => (STAT_ID_ATK, false),
        STAT_VARIANT_ATK_FLAT => (STAT_ID_ATK, true),
        STAT_VARIANT_DEF_PERCENT => (STAT_ID_DEF, false),
        STAT_VARIANT_DEF_FLAT => (STAT_ID_DEF, true),
        STAT_VARIANT_SPD => (STAT_ID_SPD, true),
        STAT_VARIANT_RES => (STAT_ID_RES, true),
        STAT_VARIANT_ACC => (STAT_ID_ACC, true),
        STAT_VARIANT_CR => (STAT_ID_CR, false),
        STAT_VARIANT_CDMG => (STAT_ID_CDMG, false),
        STAT_VARIANT_ROLL_COUNT => (STAT_ID_ROLL_COUNT, true),
        _ => (STAT_ID_ANY, true),
    }
}

// Keep four-substat padding aligned with merge.ts::cloneAnySubstats.
fn keep_unique_clone_any_substats() -> Vec<RuleSubRaw> {
    vec![
        RuleSubRaw {
            ID: Some(STAT_ID_ANY),
            Value: Some(0.0),
            IsFlat: Some(serde_json::Value::Bool(true)),
            NotAvailable: Some(false),
            Condition: Some(String::new()),
        },
        RuleSubRaw {
            ID: Some(STAT_ID_ANY),
            Value: Some(0.0),
            IsFlat: Some(serde_json::Value::Bool(true)),
            NotAvailable: Some(false),
            Condition: Some(String::new()),
        },
        RuleSubRaw {
            ID: Some(STAT_ID_ANY),
            Value: Some(0.0),
            IsFlat: Some(serde_json::Value::Bool(true)),
            NotAvailable: Some(false),
            Condition: Some(String::new()),
        },
        RuleSubRaw {
            ID: Some(STAT_ID_ANY),
            Value: Some(0.0),
            IsFlat: Some(serde_json::Value::Bool(true)),
            NotAvailable: Some(false),
            Condition: Some(String::new()),
        },
    ]
}

fn keep_unique_build_substats_for_artifact(substats: &[KeepUniqueWasmSubstatOut]) -> Vec<RuleSubRaw> {
    let mut cloned = keep_unique_clone_any_substats();
    let mut idx = 0usize;
    for sub in substats {
        if idx >= HSF_SUBSTAT_SLOT_COUNT {
            break;
        }
        if sub.variant == STAT_VARIANT_ANY {
            continue;
        }
        let (id, is_flat) = keep_unique_variant_to_sub(sub.variant);
        if id == STAT_ID_ANY {
            continue;
        }
        let value = if sub.value.is_finite() {
            sub.value.max(0.0)
        } else {
            0.0
        };
        cloned[idx] = RuleSubRaw {
            ID: Some(id),
            Value: Some(value),
            IsFlat: Some(serde_json::Value::Bool(is_flat)),
            NotAvailable: Some(false),
            Condition: Some(">=".to_string()),
        };
        idx += 1;
    }
    cloned
}

fn keep_unique_build_placeholder_substats(variant: i64) -> Vec<RuleSubRaw> {
    let mut cloned = keep_unique_clone_any_substats();
    if variant == STAT_VARIANT_ANY {
        return cloned;
    }
    let (id, is_flat) = keep_unique_variant_to_sub(variant);
    if id == STAT_ID_ANY {
        return cloned;
    }
    cloned[0] = RuleSubRaw {
        ID: Some(id),
        Value: Some(1.0),
        IsFlat: Some(serde_json::Value::Bool(is_flat)),
        NotAvailable: Some(false),
        Condition: Some(">=".to_string()),
    };
    cloned
}

fn keep_unique_build_placeholder_substats_group(variants: &[i64]) -> Vec<RuleSubRaw> {
    let mut cloned = keep_unique_clone_any_substats();
    let mut seen = HashSet::<i64>::new();
    let mut idx = 0usize;
    for variant in variants {
        if idx >= HSF_SUBSTAT_SLOT_COUNT {
            break;
        }
        if *variant == STAT_VARIANT_ANY {
            continue;
        }
        if !seen.insert(*variant) {
            continue;
        }
        let (id, is_flat) = keep_unique_variant_to_sub(*variant);
        if id == STAT_ID_ANY {
            continue;
        }
        cloned[idx] = RuleSubRaw {
            ID: Some(id),
            Value: Some(1.0),
            IsFlat: Some(serde_json::Value::Bool(is_flat)),
            NotAvailable: Some(false),
            Condition: Some(">=".to_string()),
        };
        idx += 1;
    }
    cloned
}

fn keep_unique_normalize_rank_selection(values: &[i64]) -> Vec<Option<i64>> {
    let normalized = keep_unique_sorted_unique_i64(values);
    if normalized.is_empty() {
        return vec![None];
    }
    normalized
        .into_iter()
        .map(|value| Some(keep_unique_clamp_rank_or_rarity_value(value)))
        .collect::<Vec<_>>()
}

// Canonical key mirrors merge.ts::canonicalRuleKey for placeholder dedupe.
fn keep_unique_canonical_rule_key(rule: &RuleRaw) -> String {
    let artifact_types = normalize_i64_array(rule.ArtifactType.as_ref());
    let artifact_sets = normalize_i64_array(rule.ArtifactSet.as_ref());
    let substats = rule
        .Substats
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|sub| {
            let value = sub.Value.unwrap_or(0.0);
            serde_json::json!({
                "ID": sub.ID.unwrap_or(STAT_ID_ANY),
                "IsFlat": matches!(sub.IsFlat.as_ref(), Some(serde_json::Value::Bool(true))),
                "NotAvailable": sub.NotAvailable.unwrap_or(false),
                "Condition": sub.Condition.unwrap_or_default(),
                "Value": if value.is_finite() { value } else { 0.0 },
            })
        })
        .collect::<Vec<_>>();
    let payload = serde_json::json!({
        "Keep": rule.Keep.unwrap_or(false),
        "Use": rule.Use.unwrap_or(true),
        "Rank": rule.Rank.unwrap_or(0),
        "Level": rule.LVLForCheck.unwrap_or(0),
        "Faction": rule.Faction.unwrap_or(0),
        "MainStatID": rule.MainStatID.unwrap_or(STAT_ID_ANY),
        "MainStatF": numberish_or_default(rule.MainStatF.as_ref(), 1.0),
        "ArtifactType": artifact_types,
        "ArtifactSet": artifact_sets,
        "Substats": substats,
    });
    serde_json::to_string(&payload).unwrap_or_default()
}

fn keep_unique_trim_name(name: &str) -> Option<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn keep_unique_build_placeholder_base_rules(
    combination: &KeepUniqueWasmCombination,
    config_id: i64,
    normalized_name: Option<&str>,
) -> Vec<RuleRaw> {
    let slot_values = keep_unique_sorted_unique_i64(&combination.slots);
    let (set_includes, _) = keep_unique_split_set_selections(&combination.sets);
    let mut set_values = set_includes.into_iter().collect::<Vec<_>>();
    set_values.sort_unstable();
    let faction_values = keep_unique_sorted_unique_i64(&combination.factions);
    let rank_options = keep_unique_normalize_rank_selection(&combination.ranks);
    let rarity_options = keep_unique_normalize_rank_selection(&combination.rarities);
    let main_options = keep_unique_sorted_unique_i64(&combination.main_stats);
    let faction_options = if faction_values.is_empty() {
        vec![0]
    } else {
        faction_values
    };
    let main_variants = if main_options.is_empty() {
        vec![STAT_VARIANT_ANY]
    } else {
        main_options
    };
    let mut rules = Vec::<RuleRaw>::new();
    let mut seen = HashSet::<String>::new();
    for rank_variant in &rank_options {
        for rarity_variant in &rarity_options {
            for faction in &faction_options {
                for main_variant in &main_variants {
                    let (main_id, main_f) = keep_unique_variant_to_main(*main_variant);
                    let keep_rule = RuleRaw {
                        ConfigID: Some(config_id),
                        ConfigName: normalized_name.map(|value| value.to_string()),
                        Keep: Some(true),
                        IsRuleTypeAND: Some(false),
                        Use: Some(true),
                        ArtifactSet: if set_values.is_empty() {
                            None
                        } else {
                            Some(set_values.clone())
                        },
                        ArtifactType: if slot_values.is_empty() {
                            None
                        } else {
                            Some(slot_values.clone())
                        },
                        Rank: Some(rank_variant.unwrap_or(0)),
                        Rarity: Some(match rarity_variant {
                            Some(value) => keep_unique_rarity_value_to_code(*value),
                            None => RARITY_CODE_ANY,
                        }),
                        MainStatID: Some(main_id),
                        MainStatF: Some(serde_json::Value::from(main_f)),
                        LVLForCheck: Some(LEVEL_ANY_SENTINEL),
                        Faction: Some(*faction),
                        Substats: Some(keep_unique_clone_any_substats()),
                        source: Some(RULE_SOURCE_KEEP_UNIQUES.to_string()),
                        line_idx: None,
                        all_known_sets: None,
                        rank_mask: None,
                        rarity_mask: None,
                        keep_unique_rule_id: None,
                        keep_unique_rule_ordinal: None,
                        keep_unique_hash: None,
                        keep_unique_required: None,
                        keep_unique_scan_ms: None,
                        keep_unique_projected: None,
                        keep_unique_deficit: None,
                        keep_unique_item_key: None,
                        keep_unique_placeholder: None,
                        keep_unique_placeholder_missing: None,
                    };
                    let canonical = keep_unique_canonical_rule_key(&keep_rule);
                    if !seen.insert(canonical) {
                        continue;
                    }
                    rules.push(keep_rule);
                }
            }
        }
    }
    rules
}

fn keep_unique_apply_rule_meta(
    keep_rule: &mut RuleRaw,
    rule_id: &str,
    rule_ordinal: i64,
    hash: &str,
    entry: &KeepUniqueWasmEntryOut,
    scanned_at: Option<f64>,
) {
    keep_rule.keep_unique_rule_id = Some(rule_id.to_string());
    keep_rule.keep_unique_rule_ordinal = Some(rule_ordinal);
    keep_rule.keep_unique_hash = Some(hash.to_string());
    keep_rule.keep_unique_required = Some(entry.required_count);
    keep_rule.keep_unique_projected = Some(entry.projected_count);
    keep_rule.keep_unique_deficit = Some(entry.deficit);
    keep_rule.keep_unique_scan_ms = scanned_at;
}

fn keep_unique_build_placeholder_rules(
    rule: &KeepUniqueWasmRuleIn,
    entry: &KeepUniqueWasmEntryOut,
    config_id: i64,
    keep_unique_rule_ordinal: i64,
    scanned_at: Option<f64>,
) -> Vec<RuleRaw> {
    let placeholders = &entry.placeholders;
    if placeholders.is_empty() {
        return Vec::new();
    }
    let normalized_substat_match = keep_unique_normalize_substat_match(
        rule.substat_match.as_deref().unwrap_or(""),
    );
    let selected_substats = rule.substats.clone().unwrap_or_default();
    let has_substat_filter = !selected_substats.is_empty();
    let substat_match = if has_substat_filter {
        normalized_substat_match
    } else {
        KEEP_UNIQUE_SUBSTAT_ANY.to_string()
    };
    let normalized_name = keep_unique_trim_name(rule.name.as_deref().unwrap_or(""));
    let normalized_rule_id = rule.id.as_deref().unwrap_or("");
    let mut rules = Vec::<RuleRaw>::new();
    for placeholder in placeholders {
        if placeholder.missing <= 0 {
            continue;
        }
        let combination = placeholder
            .combination
            .clone();
        let hash = keep_unique_hash_combination(&combination);
        let base_rules = keep_unique_build_placeholder_base_rules(
            &combination,
            config_id,
            normalized_name.as_deref(),
        );
        let placeholder_substats = if substat_match == KEEP_UNIQUE_SUBSTAT_PER_SUBSTAT
            && placeholder
                .substat_variants
                .as_ref()
                .map(|values| !values.is_empty())
                .unwrap_or(false)
        {
            placeholder.substat_variants.clone().unwrap_or_default()
        } else {
            selected_substats.clone()
        };
        let has_placeholder_substat_filter = !placeholder_substats.is_empty();
        for base_rule in &base_rules {
            if has_placeholder_substat_filter {
                if substat_match == KEEP_UNIQUE_SUBSTAT_ALL {
                    let mut substat_rule = base_rule.clone();
                    substat_rule.Substats = Some(keep_unique_build_placeholder_substats_group(
                        &placeholder_substats,
                    ));
                    keep_unique_apply_rule_meta(
                        &mut substat_rule,
                        normalized_rule_id,
                        keep_unique_rule_ordinal,
                        &hash,
                        entry,
                        scanned_at,
                    );
                    substat_rule.keep_unique_placeholder = Some(true);
                    substat_rule.keep_unique_placeholder_missing = Some(placeholder.missing);
                    rules.push(substat_rule);
                } else {
                    for variant in &placeholder_substats {
                        let mut substat_rule = base_rule.clone();
                        substat_rule.Substats = Some(keep_unique_build_placeholder_substats(*variant));
                        keep_unique_apply_rule_meta(
                            &mut substat_rule,
                            normalized_rule_id,
                            keep_unique_rule_ordinal,
                            &hash,
                            entry,
                            scanned_at,
                        );
                        substat_rule.keep_unique_placeholder = Some(true);
                        substat_rule.keep_unique_placeholder_missing = Some(placeholder.missing);
                        rules.push(substat_rule);
                    }
                }
                continue;
            }
            let mut keep_rule = base_rule.clone();
            keep_unique_apply_rule_meta(
                &mut keep_rule,
                normalized_rule_id,
                keep_unique_rule_ordinal,
                &hash,
                entry,
                scanned_at,
            );
            keep_rule.keep_unique_placeholder = Some(true);
            keep_rule.keep_unique_placeholder_missing = Some(placeholder.missing);
            rules.push(keep_rule);
        }
    }
    rules
}

fn keep_unique_is_activation_off(raw: &str) -> bool {
    let lowered = raw.trim().to_ascii_lowercase();
    if lowered.is_empty() {
        return false;
    }
    lowered == KEEP_UNIQUE_ACTIVATION_OFF || lowered == "disabled"
}

fn keep_unique_is_activation_anticipate(raw: &str) -> bool {
    let lowered = raw.trim().to_ascii_lowercase();
    lowered == KEEP_UNIQUE_ACTIVATION_ANTICIPATE_GAPS
        || lowered == "anticipate"
        || lowered == "placeholder"
}

fn build_keep_unique_rules_core(
    rules: &[KeepUniqueWasmRuleIn],
    detection: Option<&KeepUniqueWasmSnapshotOut>,
    config_id_base: i64,
) -> Vec<RuleRaw> {
    let Some(detection_snapshot) = detection else {
        return Vec::<RuleRaw>::new();
    };

    // Build lookup maps by both rule id and combination hash for legacy payloads.
    let mut detection_by_rule_id = HashMap::<String, &KeepUniqueWasmEntryOut>::new();
    let mut detection_by_hash = HashMap::<String, &KeepUniqueWasmEntryOut>::new();
    for entry in &detection_snapshot.entries {
        detection_by_hash.insert(entry.hash.clone(), entry);
        if let Some(rule_id) = entry.rule_id.as_deref() {
            detection_by_rule_id.insert(rule_id.to_string(), entry);
        }
    }

    let mut keep_rules = Vec::<RuleRaw>::new();
    let mut emitted_artifact_levels = HashSet::<String>::new();
    let mut placeholder_keys = HashSet::<String>::new();
    let mut keep_unique_rule_offset = 0i64;
    let mut keep_unique_rule_ordinal = 0i64;
    for rule in rules {
        // Normalize optional id and fall back to combination hash when absent.
        let explicit_rule_id = rule
            .id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string());
        // Normalize combination + activation tokens so legacy null fields are tolerated.
        let combination = rule.combination.clone().unwrap_or_default();
        let rule_hash = keep_unique_hash_combination(&combination);
        let rule_id = explicit_rule_id.unwrap_or_else(|| rule_hash.clone());
        let activation = rule.activation.clone().unwrap_or_default();
        // Ordinal is the 1-based traversal index across all rules.
        keep_unique_rule_ordinal += 1;
        // `off` rules never emit artifact/placeholder keep overrides.
        if keep_unique_is_activation_off(&activation) {
            continue;
        }
        let entry = detection_by_rule_id
            .get(rule_id.as_str())
            .copied()
            .or_else(|| detection_by_hash.get(rule_hash.as_str()).copied());
        let Some(entry) = entry else {
            continue;
        };
        // Detection rows decide whether this rule has artifact or placeholder output.
        let should_emit_artifacts = !entry.artifacts.is_empty();
        let should_emit_placeholders =
            keep_unique_is_activation_anticipate(&activation) && !entry.placeholders.is_empty();
        if !should_emit_artifacts && !should_emit_placeholders {
            continue;
        }

        // Config IDs descend from the provided sentinel base (-1 in app code).
        let config_id = config_id_base - keep_unique_rule_offset;
        keep_unique_rule_offset += 1;
        let normalized_name = keep_unique_trim_name(rule.name.as_deref().unwrap_or(""));

        if should_emit_artifacts {
            // Emit one keep rule per item-key + covered level milestone pair.
            for artifact in &entry.artifacts {
                let levels = keep_unique_coverage_levels_for_artifact(artifact);
                for level in levels {
                    let artifact_key = format!("{}:{level}", artifact.item_key);
                    if !emitted_artifact_levels.insert(artifact_key) {
                        continue;
                    }
                    let (main_id, main_f) = keep_unique_variant_to_main(artifact.main_stat);
                    keep_rules.push(RuleRaw {
                        ConfigID: Some(config_id),
                        ConfigName: normalized_name.clone(),
                        Keep: Some(true),
                        IsRuleTypeAND: Some(false),
                        Use: Some(true),
                        ArtifactSet: Some(vec![artifact.set]),
                        ArtifactType: Some(vec![artifact.slot]),
                        Rank: Some(keep_unique_clamp_rank_or_rarity_value(artifact.rank)),
                        Rarity: Some(keep_unique_rarity_value_to_code(artifact.rarity)),
                        MainStatID: Some(main_id),
                        MainStatF: Some(serde_json::Value::from(main_f)),
                        LVLForCheck: Some(level),
                        Faction: Some(artifact.faction),
                        Substats: Some(keep_unique_build_substats_for_artifact(&artifact.substats)),
                        source: Some(RULE_SOURCE_KEEP_UNIQUES.to_string()),
                        line_idx: None,
                        all_known_sets: None,
                        rank_mask: None,
                        rarity_mask: None,
                        keep_unique_rule_id: Some(rule_id.clone()),
                        keep_unique_rule_ordinal: Some(keep_unique_rule_ordinal),
                        keep_unique_hash: Some(rule_hash.clone()),
                        keep_unique_required: Some(entry.required_count),
                        keep_unique_scan_ms: Some(detection_snapshot.scanned_at),
                        keep_unique_projected: Some(entry.projected_count),
                        keep_unique_deficit: Some(entry.deficit),
                        keep_unique_item_key: Some(artifact.item_key),
                        keep_unique_placeholder: None,
                        keep_unique_placeholder_missing: None,
                    });
                }
            }
        }

        if should_emit_placeholders {
            // Placeholder synthesis mirrors merge.ts substat-match + meta stamping.
            let placeholder_rules = keep_unique_build_placeholder_rules(
                rule,
                entry,
                config_id,
                keep_unique_rule_ordinal,
                Some(detection_snapshot.scanned_at),
            );
            for placeholder_rule in placeholder_rules {
                // Placeholder dedupe uses merge.ts canonical rule key semantics.
                let canonical = keep_unique_canonical_rule_key(&placeholder_rule);
                if !placeholder_keys.insert(canonical) {
                    continue;
                }
                keep_rules.push(placeholder_rule);
            }
        }
    }
    keep_rules
}

// Keep-unique HSF keep-rule generation now lives in wasm (merge.ts SSOT path).
#[wasm_bindgen]
pub fn build_keep_unique_rules_value(
    rules: JsValue,
    detection: JsValue,
    config_id_base: i64,
) -> Result<JsValue, JsValue> {
    let parsed_rules: Vec<KeepUniqueWasmRuleIn> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique rules payload: {error}")))?;
    let parsed_detection: Option<KeepUniqueWasmSnapshotOut> = if detection.is_undefined() || detection.is_null() {
        None
    } else {
        Some(from_js_value(detection).map_err(|error| {
            JsValue::from_str(&format!("Invalid keep-unique detection payload: {error}"))
        })?)
    };
    let keep_rules = build_keep_unique_rules_core(
        &parsed_rules,
        parsed_detection.as_ref(),
        config_id_base,
    );
    to_js_value(&keep_rules)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize keep-unique rules value: {error}")))
}

fn keep_unique_group_sample_from_artifact(artifact: &KeepUniqueWasmArtifactIn) -> KeepUniqueWasmGroupSample {
    // Only accessories keep their faction dimension for grouping.
    let faction = if keep_unique_is_accessory_slot(artifact.slot) {
        artifact.faction
    } else {
        0
    };
    // Copy shape used by placeholder synthesis and expected-group comparison.
    KeepUniqueWasmGroupSample {
        slot: artifact.slot,
        set: artifact.set,
        faction,
        main_stat: artifact.main_stat,
    }
}

fn keep_unique_default_group_sample(combination: &KeepUniqueWasmCombination) -> KeepUniqueWasmGroupSample {
    // Fallback sample uses first selected slot when present.
    // Otherwise use weapon slot so placeholders stay deterministic.
    KeepUniqueWasmGroupSample {
        slot: combination
            .slots
            .first()
            .copied()
            .unwrap_or(KEEP_UNIQUE_DEFAULT_SAMPLE_SLOT),
        // Default set/faction/main describe "unknown concrete group".
        set: KEEP_UNIQUE_DEFAULT_SAMPLE_SET,
        faction: 0,
        main_stat: KEEP_UNIQUE_MAIN_ANY,
    }
}

fn keep_unique_build_placeholder_combination(
    base: &KeepUniqueWasmCombination,
    mode: KeepUniqueWasmCountMode,
    sample: Option<&KeepUniqueWasmGroupSample>,
) -> KeepUniqueWasmCombination {
    let Some(group_sample) = sample else {
        // No group sample means no dimension projection is possible.
        return base.clone();
    };
    // Start from full rule combination and project only grouped dimensions.
    let mut clone = base.clone();
    if mode.per_slot {
        clone.slots = vec![group_sample.slot];
    }
    if mode.per_set {
        clone.sets = vec![KeepUniqueWasmSetSelection {
            id: group_sample.set,
            excluded: false,
        }];
    }
    // Main-stat wildcard is encoded as empty list in placeholder combination.
    if mode.per_main_stat {
        clone.main_stats = if group_sample.main_stat == KEEP_UNIQUE_MAIN_ANY {
            Vec::new()
        } else {
            vec![group_sample.main_stat]
        };
    }
    if mode.per_faction {
        // Non-accessory groups normalize faction to zero -> empty selection.
        clone.factions = if group_sample.faction > 0 {
            vec![group_sample.faction]
        } else {
            Vec::new()
        };
    }
    clone
}

fn keep_unique_build_placeholder(
    combination: KeepUniqueWasmCombination,
    missing: i64,
    reason: &str,
    substat_variants: Option<Vec<i64>>,
) -> KeepUniqueWasmPlaceholderOut {
    // Keep placeholder payload construction centralized for consistency.
    KeepUniqueWasmPlaceholderOut {
        combination,
        missing,
        reason: reason.to_string(),
        substat_variants,
    }
}

fn keep_unique_matches_selection(selection: &[i64], candidate: i64) -> bool {
    // Empty selection means wildcard dimension.
    if selection.is_empty() {
        return true;
    }
    // Non-empty selection requires explicit id match.
    selection.iter().any(|value| *value == candidate)
}

fn keep_unique_artifact_matches_rule(
    artifact: &KeepUniqueWasmArtifactIn,
    rule: &KeepUniqueWasmPreparedRule,
) -> bool {
    // Slot filter is always evaluated first to fail fast.
    if !keep_unique_matches_selection(&rule.combination.slots, artifact.slot) {
        return false;
    }
    // Excluded sets always deny the candidate, even if also included elsewhere.
    if rule.set_excludes.contains(&artifact.set) {
        return false;
    }
    // Explicit include list requires membership when non-empty.
    if !rule.set_includes.is_empty() && !rule.set_includes.contains(&artifact.set) {
        return false;
    }
    // Rank and rarity dimensions use wildcard-aware selection matching.
    if !keep_unique_matches_selection(&rule.combination.ranks, artifact.rank) {
        return false;
    }
    if !keep_unique_matches_selection(&rule.combination.rarities, artifact.rarity) {
        return false;
    }
    if !rule.combination.main_stats.is_empty() && !rule.combination.main_stats.contains(&artifact.main_stat) {
        return false;
    }
    // Artifact slots ignore faction; accessory slots keep faction dimension.
    let faction = if keep_unique_is_accessory_slot(artifact.slot) {
        artifact.faction
    } else {
        0
    };
    // Faction filter is wildcard-aware and runs on normalized faction value.
    if !keep_unique_matches_selection(&rule.combination.factions, faction) {
        return false;
    }
    true
}

fn keep_unique_count_selected_substats(
    artifact: &KeepUniqueWasmArtifactIn,
    selected_substats: &HashSet<i64>,
) -> usize {
    // No selected substats means nothing to count.
    if selected_substats.is_empty() {
        return 0;
    }
    // Count unique matching variants with positive finite values only.
    let mut matched = 0usize;
    let mut seen = HashSet::<i64>::new();
    for substat in &artifact.substats {
        // Ignore variants not requested by the rule.
        if !selected_substats.contains(&substat.variant) {
            continue;
        }
        // Ignore duplicates so a variant contributes at most once.
        if seen.contains(&substat.variant) {
            continue;
        }
        // Ignore missing/invalid values to mirror JS truthiness checks.
        if !substat.value.is_finite() || substat.value <= 0.0 {
            continue;
        }
        seen.insert(substat.variant);
        matched += 1;
        // Early exit once all requested variants are matched.
        if matched >= selected_substats.len() {
            return matched;
        }
    }
    matched
}

fn keep_unique_candidate_matches_substats(
    artifact: &KeepUniqueWasmArtifactIn,
    selected_substats: &HashSet<i64>,
    substat_match: &str,
) -> bool {
    // Empty filter means every artifact passes substat gating.
    if selected_substats.is_empty() {
        return true;
    }
    // Compute count once and evaluate mode-specific threshold below.
    let matched = keep_unique_count_selected_substats(artifact, selected_substats);
    // `all` requires every selected variant; other modes require any hit.
    if substat_match == KEEP_UNIQUE_SUBSTAT_ALL {
        return matched >= selected_substats.len();
    }
    matched > 0
}

fn keep_unique_weight_for_variant(weights: &HashMap<i64, f64>, variant: i64) -> f64 {
    // Missing entries fall back to canonical default weight.
    weights
        .get(&variant)
        .copied()
        .unwrap_or(KEEP_UNIQUE_WEIGHT_DEFAULT)
}

fn keep_unique_stat_value_for_variant(artifact: &KeepUniqueWasmArtifactIn, variant: i64) -> f64 {
    // Return first matching variant value (input is already normalized).
    for substat in &artifact.substats {
        if substat.variant != variant {
            continue;
        }
        // Invalid/missing numeric values count as zero.
        if !substat.value.is_finite() || substat.value <= 0.0 {
            return 0.0;
        }
        return substat.value;
    }
    0.0
}

fn keep_unique_compute_score(
    artifact: &KeepUniqueWasmArtifactIn,
    selected_substats: &[i64],
    weights: &HashMap<i64, f64>,
) -> f64 {
    // Weighted normalized sum mirrors keepUniques.ts scoring semantics.
    let mut total = 0.0;
    for variant in selected_substats {
        // Read raw value for this variant from artifact substats.
        let raw = keep_unique_stat_value_for_variant(artifact, *variant);
        // Normalize against canonical max roll baseline.
        let normalized = keep_unique_normalize_substat_value(*variant, raw);
        // Resolve weight (default when not explicitly configured).
        let weight = keep_unique_weight_for_variant(weights, *variant);
        total += weight * normalized;
    }
    // Defensive guard: never return NaN/Infinity to sort comparator.
    if total.is_finite() {
        total
    } else {
        0.0
    }
}

// Keep tie detection separate from sort ordering.
// Tie detection keeps the legacy "boundary extension" semantics.
// Sorting still needs a strict total order to satisfy Rust's sort invariants.
fn keep_unique_compare_scored_candidates_tie_only(
    left: &KeepUniqueWasmScoredCandidate,
    right: &KeepUniqueWasmScoredCandidate,
    candidates: &[KeepUniqueWasmCandidateIn],
) -> Ordering {
    // Primary key is score within epsilon buckets.
    // We only treat near-equal scores as ties for unresolved boundary expansion.
    let score_delta = right.score - left.score;
    if score_delta.abs() > KEEP_UNIQUE_SCORE_TIE_EPSILON {
        return if score_delta > 0.0 {
            Ordering::Greater
        } else {
            Ordering::Less
        };
    }
    // Secondary key compares artifacts with the same main stat by rank.
    // This mirrors the prior JS parity behavior for same-main candidates.
    let left_artifact = &candidates[left.candidate_idx].artifact;
    let right_artifact = &candidates[right.candidate_idx].artifact;
    if left_artifact.main_stat == right_artifact.main_stat {
        let rank_delta = right_artifact.rank - left_artifact.rank;
        if rank_delta != 0 {
            return if rank_delta > 0 {
                Ordering::Greater
            } else {
                Ordering::Less
            };
        }
        return Ordering::Equal;
    }
    if let Some(left_flat) = keep_unique_percent_to_flat_main(left_artifact.main_stat) {
        if left_flat == right_artifact.main_stat {
            return Ordering::Less;
        }
    }
    if let Some(right_flat) = keep_unique_percent_to_flat_main(right_artifact.main_stat) {
        if right_flat == left_artifact.main_stat {
            return Ordering::Greater;
        }
    }
    // Leave unrelated main-stat comparisons tied at this stage.
    // The total sort comparator below will break ties deterministically.
    Ordering::Equal
}

// Rust sort requires a strict weak ordering.
// We reuse business tie logic first, then add deterministic key fallbacks.
fn keep_unique_compare_scored_candidates_for_sort(
    left: &KeepUniqueWasmScoredCandidate,
    right: &KeepUniqueWasmScoredCandidate,
    candidates: &[KeepUniqueWasmCandidateIn],
) -> Ordering {
    let left_artifact = &candidates[left.candidate_idx].artifact;
    let right_artifact = &candidates[right.candidate_idx].artifact;
    // Primary ordering is strict total score ordering.
    // This keeps the comparator transitive even when tie-only logic uses epsilon.
    let by_score_total = right.score.total_cmp(&left.score);
    if by_score_total != Ordering::Equal {
        return by_score_total;
    }
    // Collapse flat/percent pairs into one family so pair preferences are transitive.
    // This avoids pairwise-only decisions that can violate Rust sort invariants.
    let family_key = |main_stat: i64| -> i64 {
        match main_stat {
            KEEP_UNIQUE_MAIN_HP_FLAT => KEEP_UNIQUE_MAIN_HP_PERCENT,
            KEEP_UNIQUE_MAIN_ATK_FLAT => KEEP_UNIQUE_MAIN_ATK_PERCENT,
            KEEP_UNIQUE_MAIN_DEF_FLAT => KEEP_UNIQUE_MAIN_DEF_PERCENT,
            _ => main_stat,
        }
    };
    // Percent mains should outrank their matching flat counterpart within the same family.
    // Unrelated stats all get priority 0 so they stay ordered by family/id fallback keys.
    let variant_priority = |main_stat: i64| -> i64 {
        match main_stat {
            KEEP_UNIQUE_MAIN_HP_PERCENT | KEEP_UNIQUE_MAIN_ATK_PERCENT | KEEP_UNIQUE_MAIN_DEF_PERCENT => 0,
            KEEP_UNIQUE_MAIN_HP_FLAT | KEEP_UNIQUE_MAIN_ATK_FLAT | KEEP_UNIQUE_MAIN_DEF_FLAT => 1,
            _ => 0,
        }
    };
    let left_family = family_key(left_artifact.main_stat);
    let right_family = family_key(right_artifact.main_stat);
    if left_family != right_family {
        return left_family.cmp(&right_family);
    }
    let left_variant_priority = variant_priority(left_artifact.main_stat);
    let right_variant_priority = variant_priority(right_artifact.main_stat);
    if left_variant_priority != right_variant_priority {
        return left_variant_priority.cmp(&right_variant_priority);
    }
    // Same-main ties still prefer higher rank, matching the prior behavior.
    // Apply the same rank fallback for equal-family rows to keep ordering total.
    if left_artifact.rank != right_artifact.rank {
        return right_artifact.rank.cmp(&left_artifact.rank);
    }
    // Main stat id keeps same-family rows deterministic.
    // Candidate index is the final unique key and guarantees strict transitivity.
    if left_artifact.main_stat != right_artifact.main_stat {
        return left_artifact.main_stat.cmp(&right_artifact.main_stat);
    }
    left.candidate_idx.cmp(&right.candidate_idx)
}

fn keep_unique_select_top_scored_candidates(
    entries: &[KeepUniqueWasmScoredCandidate],
    required_per_group: i64,
    candidates: &[KeepUniqueWasmCandidateIn],
) -> Vec<KeepUniqueWasmScoredCandidate> {
    // Non-positive requirement or empty input means no selected candidates.
    if required_per_group <= 0 || entries.is_empty() {
        return Vec::new();
    }
    // Copy then sort by strict comparator for deterministic ordering.
    let mut sorted = entries.to_vec();
    // Keep this on unstable sort to avoid stable-sort comparator guard panics in wasm.
    // Determinism still holds because the comparator has an explicit final index key.
    sorted.sort_unstable_by(|left, right| keep_unique_compare_scored_candidates_for_sort(left, right, candidates));
    let required = required_per_group as usize;
    // If bucket has <= required candidates, all of them are selected.
    if sorted.len() <= required {
        return sorted;
    }
    // Select top N first, then extend across tie boundary.
    let mut selected = sorted[..required].to_vec();
    let Some(boundary) = selected.last().cloned() else {
        return selected;
    };
    let unresolved = sorted[required..]
        .iter()
        // Boundary extension still uses business ties (epsilon + main/rank parity).
        .filter(|entry| keep_unique_compare_scored_candidates_tie_only(entry, &boundary, candidates) == Ordering::Equal)
        .cloned()
        .collect::<Vec<_>>();
    // Extend with unresolved ties to preserve legacy boundary semantics.
    selected.extend(unresolved);
    selected
}

fn keep_unique_count_key(artifact: &KeepUniqueWasmArtifactIn, mode: KeepUniqueWasmCountMode) -> String {
    keep_unique_count_key_from_parts(
        artifact.slot,
        artifact.set,
        artifact.faction,
        artifact.main_stat,
        mode,
    )
}

fn keep_unique_count_key_from_parts(
    slot: i64,
    set: i64,
    faction_raw: i64,
    main_stat: i64,
    mode: KeepUniqueWasmCountMode,
) -> String {
    // Per-rule mode collapses all candidates into one global bucket.
    if mode.per_rule {
        return "global".to_string();
    }
    // Build grouped key from enabled dimensions only.
    let mut parts = Vec::<String>::new();
    if mode.per_slot {
        parts.push(format!("slot:{slot}"));
    }
    if mode.per_set {
        parts.push(format!("set:{set}"));
    }
    if mode.per_faction {
        // Artifact slots normalize to faction 0 for grouping consistency.
        let faction = if keep_unique_is_accessory_slot(slot) {
            faction_raw
        } else {
            0
        };
        parts.push(format!("faction:{faction}"));
    }
    if mode.per_main_stat {
        parts.push(format!("main:{main_stat}"));
    }
    // Empty dimensions fallback to global bucket.
    if parts.is_empty() {
        "global".to_string()
    } else {
        parts.join("|")
    }
}

// Expose keep-unique count-key derivation so JS expected-group precomputation
// uses the exact same grouping semantics as Rust detection scans.
#[wasm_bindgen]
pub fn keep_unique_count_key_value(artifact: JsValue, count_mode: JsValue) -> Result<String, JsValue> {
    // Parse compact artifact tuple (slot/set/faction/mainStat) from JS.
    let parsed_artifact: KeepUniqueWasmCountKeyArtifactIn = from_js_value(artifact)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique count-key artifact: {error}")))?;
    // Parse and sanitize count-mode flags before key computation.
    let parsed_mode: KeepUniqueWasmCountMode = from_js_value(count_mode)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique count mode: {error}")))?;
    let mode = keep_unique_sanitize_count_mode(parsed_mode);
    // Delegate to the shared Rust helper so key semantics stay SSOT.
    Ok(keep_unique_count_key_from_parts(
        parsed_artifact.slot,
        parsed_artifact.set,
        parsed_artifact.faction,
        parsed_artifact.main_stat,
        mode,
    ))
}

fn keep_unique_round_three(value: f64) -> f64 {
    // Keep output precision aligned with existing UI formatting expectations.
    (value * 1000.0).round() / 1000.0
}

fn keep_unique_to_detection_artifact(candidate: &KeepUniqueWasmCandidateIn) -> KeepUniqueWasmArtifactOut {
    // Only accessories preserve faction in detection payload.
    let faction = if keep_unique_is_accessory_slot(candidate.artifact.slot) {
        candidate.artifact.faction
    } else {
        0
    };
    // Copy substats with rounded values to keep payload stable/readable.
    let substats = candidate
        .artifact
        .substats
        .iter()
        .map(|substat| KeepUniqueWasmSubstatOut {
            variant: substat.variant,
            is_flat: substat.is_flat,
            value: keep_unique_round_three(if substat.value.is_finite() { substat.value } else { 0.0 }),
        })
        .collect::<Vec<_>>();
    // Emit compact artifact summary consumed by keep-unique UI tables.
    KeepUniqueWasmArtifactOut {
        item_key: candidate.item_key,
        slot: candidate.artifact.slot,
        set: candidate.artifact.set,
        rank: candidate.artifact.rank,
        rarity: candidate.artifact.rarity,
        level: candidate.artifact.level,
        exact_level: candidate.artifact.exact_level,
        faction,
        main_stat: candidate.artifact.main_stat,
        substats,
    }
}

fn keep_unique_sort_candidate_indices(indices: &mut [usize], candidates: &[KeepUniqueWasmCandidateIn]) {
    // Candidate index sorting only needs deterministic key ordering, not stability.
    // Unstable sort avoids stable-sort ord guards while keeping the same final order.
    indices.sort_unstable_by(|left_idx, right_idx| {
        let left = &candidates[*left_idx];
        let right = &candidates[*right_idx];
        if left.item_key != right.item_key {
            return left.item_key.cmp(&right.item_key);
        }
        let left_id = left.artifact.id.unwrap_or(0);
        let right_id = right.artifact.id.unwrap_or(0);
        if left_id != right_id {
            return left_id.cmp(&right_id);
        }
        left.group_key.cmp(&right.group_key)
    });
}

fn keep_unique_build_entry_for_substats(
    prepared_rule: &KeepUniqueWasmPreparedRule,
    candidates: &[KeepUniqueWasmCandidateIn],
    selected_substats: &[i64],
    substat_match: &str,
) -> KeepUniqueWasmEntryOut {
    // Presence of selected substats toggles ranking/scoring mode.
    let has_substat_filter = !selected_substats.is_empty();
    // HashSet gives O(1) membership checks during candidate scans.
    let selected_set = selected_substats.iter().copied().collect::<HashSet<_>>();
    // Placeholders include the active substat variants when filtering is active.
    let placeholder_substats = if has_substat_filter {
        Some(selected_substats.to_vec())
    } else {
        None
    };
    // Ranking mode is active only when substats are selected.
    let use_ranking = has_substat_filter;
    // Required count is always at least 1, mirroring TS coercion.
    let required_per_group = prepared_rule.required_per_group.max(1);
    // Resolve expected-group payload into internal sample struct once.
    let expected_groups = prepared_rule
        .expected_groups
        .iter()
        .map(|group| KeepUniqueWasmExpectedGroupResolved {
            key: group.key.clone(),
            sample: KeepUniqueWasmGroupSample {
                slot: group.sample.slot,
                set: group.sample.set,
                faction: group.sample.faction,
                main_stat: group.sample.main_stat,
            },
        })
        .collect::<Vec<_>>();

    // Pre-filter candidate indices by rule dimensions and substat gating.
    let matching_indices = candidates
        .iter()
        .enumerate()
        .filter(|(_, candidate)| keep_unique_artifact_matches_rule(&candidate.artifact, prepared_rule))
        .filter(|(_, candidate)| {
            keep_unique_candidate_matches_substats(&candidate.artifact, &selected_set, substat_match)
        })
        .map(|(idx, _)| idx)
        .collect::<Vec<_>>();

    if use_ranking {
        // Build scored list and drop zero-score artifacts early.
        let scored = matching_indices
            .iter()
            .filter_map(|candidate_idx| {
                let candidate = &candidates[*candidate_idx];
                let score =
                    keep_unique_compute_score(&candidate.artifact, selected_substats, &prepared_rule.weights);
                if score <= 0.0 {
                    return None;
                }
                Some(KeepUniqueWasmScoredCandidate {
                    candidate_idx: *candidate_idx,
                    score,
                })
            })
            .collect::<Vec<_>>();

        // Bucket scored entries by count key for grouped counting modes.
        let mut groups = HashMap::<String, Vec<KeepUniqueWasmScoredCandidate>>::new();
        let mut group_order = Vec::<String>::new();
        if prepared_rule.count_mode.per_rule {
            // Per-rule mode uses one global bucket.
            if !scored.is_empty() {
                groups.insert("global".to_string(), scored);
                group_order.push("global".to_string());
            }
        } else {
            // Grouped mode routes each scored candidate to its group key.
            for entry in scored {
                let key = keep_unique_count_key(&candidates[entry.candidate_idx].artifact, prepared_rule.count_mode);
                if let Some(bucket) = groups.get_mut(&key) {
                    bucket.push(entry);
                } else {
                    groups.insert(key.clone(), vec![entry]);
                    group_order.push(key);
                }
            }
        }

        // Expected-groups override observed group count when provided.
        let groups_tracked = if !expected_groups.is_empty() {
            expected_groups.len() as i64
        } else {
            groups.len() as i64
        };
        // At least one group is assumed for required-count math.
        let effective_group_count = if groups_tracked > 0 { groups_tracked } else { 1 };
        let required_total = required_per_group * effective_group_count;
        // Aggregate counters feed the final entry payload.
        let mut current_count = 0i64;
        let mut kept_count = 0i64;
        let mut sold_count = 0i64;
        let mut deficit = 0i64;
        let mut item_keys = Vec::<i64>::new();
        let mut artifacts = Vec::<KeepUniqueWasmArtifactOut>::new();
        let mut placeholders = Vec::<KeepUniqueWasmPlaceholderOut>::new();

        // Use explicit expected list when present, otherwise derive from observed groups.
        let expected_list = if !expected_groups.is_empty() {
            expected_groups
        } else {
            group_order
                .iter()
                .map(|key| {
                    let sample = groups
                        .get(key)
                        .and_then(|bucket| bucket.first())
                        .map(|entry| keep_unique_group_sample_from_artifact(&candidates[entry.candidate_idx].artifact))
                        .unwrap_or_else(|| keep_unique_default_group_sample(&prepared_rule.combination));
                    KeepUniqueWasmExpectedGroupResolved {
                        key: key.clone(),
                        sample,
                    }
                })
                .collect::<Vec<_>>()
        };

        // Process each expected group independently.
        for expected in &expected_list {
            let bucket = groups.get(&expected.key).cloned().unwrap_or_default();
            if bucket.is_empty() {
                // Missing group contributes full per-group deficit placeholder.
                let deficit_group = required_per_group;
                placeholders.push(keep_unique_build_placeholder(
                    keep_unique_build_placeholder_combination(
                        &prepared_rule.combination,
                        prepared_rule.count_mode,
                        Some(&expected.sample),
                    ),
                    deficit_group,
                    KEEP_UNIQUE_REASON_GROUP,
                    placeholder_substats.clone(),
                ));
                deficit += deficit_group;
                continue;
            }
            // Select top required entries with tie-boundary extension.
            let selected =
                keep_unique_select_top_scored_candidates(&bucket, required_per_group, candidates);
            let mut group_total = 0i64;
            let mut group_kept = 0i64;
            let mut group_sold = 0i64;
            for scored_entry in selected {
                group_total += 1;
                let candidate = &candidates[scored_entry.candidate_idx];
                if candidate.is_sold {
                    group_sold += 1;
                    item_keys.push(candidate.item_key);
                    artifacts.push(keep_unique_to_detection_artifact(candidate));
                } else {
                    group_kept += 1;
                }
            }
            // Group totals roll into overall counters.
            current_count += group_total;
            kept_count += group_kept;
            sold_count += group_sold;
            // Deficit uses bucket size (before tie extension) like TS semantics.
            let deficit_group = (required_per_group - bucket.len() as i64).max(0);
            if deficit_group > 0 {
                placeholders.push(keep_unique_build_placeholder(
                    keep_unique_build_placeholder_combination(
                        &prepared_rule.combination,
                        prepared_rule.count_mode,
                        Some(&expected.sample),
                    ),
                    deficit_group,
                    KEEP_UNIQUE_REASON_GROUP,
                    placeholder_substats.clone(),
                ));
            }
            deficit += deficit_group;
        }

        // No groups observed still emits global placeholder when needed.
        if groups_tracked == 0 && required_per_group > 0 {
            placeholders.push(keep_unique_build_placeholder(
                prepared_rule.combination.clone(),
                required_per_group,
                KEEP_UNIQUE_REASON_GLOBAL,
                placeholder_substats.clone(),
            ));
            deficit = required_per_group;
        }

        // Projected count includes sold artifacts only when rule is active.
        let projected = kept_count + if prepared_rule.rule_active { sold_count } else { 0 };
        return KeepUniqueWasmEntryOut {
            hash: keep_unique_hash_combination(&prepared_rule.combination),
            combination: prepared_rule.combination.clone(),
            rule_id: Some(prepared_rule.id.clone()),
            rule_activation: prepared_rule.activation.clone(),
            count_mode: prepared_rule.count_mode,
            per_group_required_count: required_per_group,
            groups_tracked,
            required_count: required_total,
            current_count,
            projected_count: projected,
            deficit,
            covered_by_existing: kept_count >= required_total,
            item_keys,
            artifacts,
            placeholders,
        };
    }

    // Non-ranking path: count by sold/kept presence without score sorting.
    if prepared_rule.count_mode.per_rule {
        let mut kept_count = 0i64;
        let mut sold_indices = Vec::<usize>::new();
        for candidate_idx in &matching_indices {
            let candidate = &candidates[*candidate_idx];
            if candidate.is_sold {
                sold_indices.push(*candidate_idx);
            } else {
                kept_count += 1;
            }
        }
        // Per-rule needed count is relative to kept artifacts only.
        let sold_count = sold_indices.len() as i64;
        let required_total = required_per_group;
        let needed = (required_per_group - kept_count).max(0);
        // Sort sold candidates deterministically before truncation.
        keep_unique_sort_candidate_indices(&mut sold_indices, candidates);
        let selected_sold = if needed > 0 {
            sold_indices.into_iter().take(needed as usize).collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        // Projected count includes sold artifacts only when rule is active.
        let projected = kept_count
            + if prepared_rule.rule_active {
                sold_count.min(needed)
            } else {
                0
            };
        let deficit = (required_total - (kept_count + sold_count)).max(0);
        let mut placeholders = Vec::<KeepUniqueWasmPlaceholderOut>::new();
        // Global shortfall emits one global placeholder.
        if deficit > 0 {
            placeholders.push(keep_unique_build_placeholder(
                prepared_rule.combination.clone(),
                deficit,
                KEEP_UNIQUE_REASON_GLOBAL,
                placeholder_substats.clone(),
            ));
        }
        // Materialize selected sold candidate ids/artifacts for UI.
        let item_keys = selected_sold
            .iter()
            .map(|idx| candidates[*idx].item_key)
            .collect::<Vec<_>>();
        let artifacts = selected_sold
            .iter()
            .map(|idx| keep_unique_to_detection_artifact(&candidates[*idx]))
            .collect::<Vec<_>>();
        return KeepUniqueWasmEntryOut {
            hash: keep_unique_hash_combination(&prepared_rule.combination),
            combination: prepared_rule.combination.clone(),
            rule_id: Some(prepared_rule.id.clone()),
            rule_activation: prepared_rule.activation.clone(),
            count_mode: prepared_rule.count_mode,
            per_group_required_count: required_per_group,
            groups_tracked: if matching_indices.is_empty() { 0 } else { 1 },
            required_count: required_total,
            current_count: kept_count + sold_count,
            projected_count: projected,
            deficit,
            covered_by_existing: kept_count >= required_total,
            item_keys,
            artifacts,
            placeholders,
        };
    }

    // Grouped non-ranking path: split matching candidates into group buckets.
    let mut group_counts = HashMap::<String, KeepUniqueWasmGroupBucket>::new();
    let mut group_order = Vec::<String>::new();
    for candidate_idx in matching_indices {
        let candidate = &candidates[candidate_idx];
        let key = keep_unique_count_key(&candidate.artifact, prepared_rule.count_mode);
        if let Some(bucket) = group_counts.get_mut(&key) {
            if candidate.is_sold {
                bucket.sold.push(candidate_idx);
            } else {
                bucket.kept.push(candidate_idx);
            }
            if bucket.sample.is_none() {
                bucket.sample = Some(keep_unique_group_sample_from_artifact(&candidate.artifact));
            }
        } else {
            let mut bucket = KeepUniqueWasmGroupBucket {
                kept: Vec::new(),
                sold: Vec::new(),
                sample: Some(keep_unique_group_sample_from_artifact(&candidate.artifact)),
            };
            if candidate.is_sold {
                bucket.sold.push(candidate_idx);
            } else {
                bucket.kept.push(candidate_idx);
            }
            group_counts.insert(key.clone(), bucket);
            group_order.push(key);
        }
    }

    // Expected groups override observed group cardinality.
    let groups_tracked = if !prepared_rule.expected_groups.is_empty() {
        prepared_rule.expected_groups.len() as i64
    } else {
        group_counts.len() as i64
    };
    // At least one group is assumed for required-count math.
    let effective_group_count = if groups_tracked > 0 { groups_tracked } else { 1 };
    let required_total = required_per_group * effective_group_count;
    // Aggregate counters and output buffers for final payload.
    let mut deficit = 0i64;
    let mut kept_total = 0i64;
    let mut sold_total = 0i64;
    let mut projected_total = 0i64;
    let mut at_risk = Vec::<usize>::new();
    let mut placeholders = Vec::<KeepUniqueWasmPlaceholderOut>::new();

    // Use explicit expected list when present, else derive from observed groups.
    let expected_list = if !prepared_rule.expected_groups.is_empty() {
        prepared_rule
            .expected_groups
            .iter()
            .map(|group| KeepUniqueWasmExpectedGroupResolved {
                key: group.key.clone(),
                sample: KeepUniqueWasmGroupSample {
                    slot: group.sample.slot,
                    set: group.sample.set,
                    faction: group.sample.faction,
                    main_stat: group.sample.main_stat,
                },
            })
            .collect::<Vec<_>>()
    } else {
        group_order
            .iter()
            .map(|key| {
                let sample = group_counts
                    .get(key)
                    .and_then(|group| group.sample.clone())
                    .unwrap_or_else(|| keep_unique_default_group_sample(&prepared_rule.combination));
                KeepUniqueWasmExpectedGroupResolved {
                    key: key.clone(),
                    sample,
                }
            })
            .collect::<Vec<_>>()
    };

    // Evaluate each expected group independently.
    for expected in &expected_list {
        let Some(group) = group_counts.get(&expected.key).cloned() else {
            // Missing expected group contributes full group deficit.
            let deficit_group = required_per_group;
            placeholders.push(keep_unique_build_placeholder(
                keep_unique_build_placeholder_combination(
                    &prepared_rule.combination,
                    prepared_rule.count_mode,
                    Some(&expected.sample),
                ),
                deficit_group,
                KEEP_UNIQUE_REASON_GROUP,
                placeholder_substats.clone(),
            ));
            deficit += deficit_group;
            continue;
        };
        // Count kept/sold and derive projected/deficit metrics for this group.
        let kept_count = group.kept.len() as i64;
        let sold_count = group.sold.len() as i64;
        kept_total += kept_count;
        sold_total += sold_count;
        let needed = (required_per_group - kept_count).max(0);
        let projected_group = kept_count
            + if prepared_rule.rule_active {
                sold_count.min(needed)
            } else {
                0
            };
        projected_total += projected_group;
        let total_count = kept_count + sold_count;
        let deficit_group = (required_per_group - total_count).max(0);
        if needed > 0 {
            // Deterministic sold ordering ensures stable at-risk list.
            let mut sorted_sold = group.sold.clone();
            keep_unique_sort_candidate_indices(&mut sorted_sold, candidates);
            at_risk.extend(sorted_sold.into_iter().take(needed as usize));
            placeholders.push(keep_unique_build_placeholder(
                keep_unique_build_placeholder_combination(
                    &prepared_rule.combination,
                    prepared_rule.count_mode,
                    Some(&expected.sample),
                ),
                deficit_group,
                KEEP_UNIQUE_REASON_GROUP,
                placeholder_substats.clone(),
            ));
        }
        deficit += deficit_group;
    }

    // No observed groups still yields a global placeholder shortfall.
    if groups_tracked == 0 && required_per_group > 0 {
        placeholders.push(keep_unique_build_placeholder(
            prepared_rule.combination.clone(),
            required_per_group,
            KEEP_UNIQUE_REASON_GLOBAL,
            placeholder_substats.clone(),
        ));
        deficit = required_per_group;
    }

    // Materialize at-risk candidate ids/artifacts for UI.
    let item_keys = at_risk
        .iter()
        .map(|idx| candidates[*idx].item_key)
        .collect::<Vec<_>>();
    let artifacts = at_risk
        .iter()
        .map(|idx| keep_unique_to_detection_artifact(&candidates[*idx]))
        .collect::<Vec<_>>();
    KeepUniqueWasmEntryOut {
        hash: keep_unique_hash_combination(&prepared_rule.combination),
        combination: prepared_rule.combination.clone(),
        rule_id: Some(prepared_rule.id.clone()),
        rule_activation: prepared_rule.activation.clone(),
        count_mode: prepared_rule.count_mode,
        per_group_required_count: required_per_group,
        groups_tracked,
        required_count: required_total,
        current_count: kept_total + sold_total,
        projected_count: projected_total,
        deficit,
        covered_by_existing: kept_total >= required_total,
        item_keys,
        artifacts,
        placeholders,
    }
}

fn keep_unique_merge_substat_entries(
    prepared_rule: &KeepUniqueWasmPreparedRule,
    required_per_group: i64,
    entries: Vec<KeepUniqueWasmEntryOut>,
) -> KeepUniqueWasmEntryOut {
    // Merge per-substat entries into one aggregate rule entry.
    let mut item_keys = Vec::<i64>::new();
    let mut item_key_set = HashSet::<i64>::new();
    let mut artifacts = Vec::<KeepUniqueWasmArtifactOut>::new();
    let mut artifact_key_set = HashSet::<i64>::new();
    let mut placeholders = Vec::<KeepUniqueWasmPlaceholderOut>::new();
    let mut required_count = 0i64;
    let mut current_count = 0i64;
    let mut projected_count = 0i64;
    let mut deficit = 0i64;
    let mut groups_tracked = 0i64;
    for entry in entries {
        // Sum scalar counters across all per-substat entries.
        required_count += entry.required_count;
        current_count += entry.current_count;
        projected_count += entry.projected_count;
        deficit += entry.deficit;
        groups_tracked += entry.groups_tracked;
        // Placeholders are concatenated verbatim for full visibility.
        placeholders.extend(entry.placeholders);
        // Deduplicate item keys so merged output has stable unique ids.
        for item_key in entry.item_keys {
            if item_key_set.insert(item_key) {
                item_keys.push(item_key);
            }
        }
        // Deduplicate artifact rows by item key to avoid duplicates in UI.
        for artifact in entry.artifacts {
            if artifact_key_set.insert(artifact.item_key) {
                artifacts.push(artifact);
            }
        }
    }
    KeepUniqueWasmEntryOut {
        hash: keep_unique_hash_combination(&prepared_rule.combination),
        combination: prepared_rule.combination.clone(),
        rule_id: Some(prepared_rule.id.clone()),
        rule_activation: prepared_rule.activation.clone(),
        count_mode: prepared_rule.count_mode,
        per_group_required_count: required_per_group,
        groups_tracked,
        required_count,
        current_count,
        projected_count,
        deficit,
        covered_by_existing: deficit <= 0,
        item_keys,
        artifacts,
        placeholders,
    }
}

// Accept either wrapped expected-group payloads or the legacy map-only shape.
fn parse_keep_unique_expected_groups_payload(
    expected_groups_payload: JsValue,
) -> Result<KeepUniqueWasmExpectedGroupsPayloadIn, JsValue> {
    // Null/undefined means no explicit expected-group metadata was supplied.
    if expected_groups_payload.is_undefined() || expected_groups_payload.is_null() {
        return Ok(KeepUniqueWasmExpectedGroupsPayloadIn::default());
    }
    // New wrapper format can carry both per-rule maps and domain payloads.
    match from_js_value::<KeepUniqueWasmExpectedGroupsPayloadIn>(expected_groups_payload.clone()) {
        Ok(payload) => Ok(payload),
        Err(wrapper_error) => {
            // Legacy callers may still pass a bare rule-id -> groups map.
            match from_js_value::<HashMap<String, Vec<KeepUniqueWasmExpectedGroupIn>>>(
                expected_groups_payload,
            ) {
                Ok(map) => Ok(KeepUniqueWasmExpectedGroupsPayloadIn {
                    expected_groups_by_rule_id: map,
                    expected_group_domain: None,
                }),
                Err(map_error) => Err(JsValue::from_str(&format!(
                    "Invalid keep-unique expected groups payload (wrapper: {wrapper_error}; map: {map_error})"
                ))),
            }
        }
    }
}

// Keep-unique protection core evaluates prepared rules against candidate rows.
fn compute_keep_unique_protection_core(
    parsed_candidates: Vec<KeepUniqueWasmCandidateIn>,
    parsed_rules: Vec<KeepUniqueWasmRuleIn>,
    expected_payload: KeepUniqueWasmExpectedGroupsPayloadIn,
    enabled: bool,
    now: f64,
) -> KeepUniqueWasmSnapshotOut {
    // Precompute sanitized rule metadata used by candidate scans.
    let prepared_rules = parsed_rules
        .into_iter()
        .map(|rule| {
            // Normalize nullable legacy fields before downstream matching logic.
            let mut rule_id = rule.id.unwrap_or_default();
            let combination = rule.combination.unwrap_or_default();
            let mut activation = rule.activation.unwrap_or_default();
            if rule_id.trim().is_empty() {
                rule_id = format!("ku_{}", keep_unique_hash_combination(&combination));
            }
            if activation.trim().is_empty() {
                activation = KEEP_UNIQUE_ACTIVATION_PROTECT_EXISTING.to_string();
            }
            // Normalize count mode so invalid combos fall back to per-rule mode.
            let count_mode = keep_unique_resolve_count_mode(rule.count_mode);
            // Required count is clamped to at least one.
            let required_per_group = rule.required_count.unwrap_or(1).max(1);
            // Normalize match mode token for deterministic branching.
            let normalized_match = keep_unique_normalize_substat_match(
                rule.substat_match.as_deref().unwrap_or(""),
            );
            let selected_substats = rule.substats.unwrap_or_default();
            let has_substat_filter = !selected_substats.is_empty();
            // No selected substats always implies `any` behavior.
            let substat_match = if has_substat_filter {
                normalized_match
            } else {
                KEEP_UNIQUE_SUBSTAT_ANY.to_string()
            };
            // Parse and sanitize variant weights into numeric map.
            let mut weights = HashMap::<i64, f64>::new();
            for (raw_variant, raw_weight) in &rule.substat_weights.unwrap_or_default() {
                let Ok(variant) = raw_variant.parse::<i64>() else {
                    continue;
                };
                weights.insert(variant, keep_unique_normalize_weight(*raw_weight));
            }
            // Pre-split set filters into include/exclude lookup sets.
            let (set_includes, set_excludes) = keep_unique_split_set_selections(&combination.sets);
            // Resolve expected groups with explicit maps first, then domain enum.
            let expected_groups = expected_payload
                .expected_groups_by_rule_id
                .get(&rule_id)
                .cloned()
                .or_else(|| {
                    expected_payload
                        .expected_group_domain
                        .as_ref()
                        .map(|domain| keep_unique_build_expected_groups_for_rule(&combination, count_mode, domain))
                })
                .unwrap_or_default();
            KeepUniqueWasmPreparedRule {
                id: rule_id,
                combination,
                required_per_group,
                activation: activation.clone(),
                // Activation off disables sold-item projection contribution.
                rule_active: enabled && activation.trim().to_ascii_lowercase() != KEEP_UNIQUE_ACTIVATION_OFF,
                count_mode,
                selected_substats,
                substat_match,
                weights,
                set_includes,
                set_excludes,
                expected_groups,
            }
        })
        .collect::<Vec<_>>();

    // Evaluate each prepared rule and build entry payloads.
    let mut entries = Vec::<KeepUniqueWasmEntryOut>::new();
    for prepared_rule in &prepared_rules {
        // `persubstat` with multiple variants expands to one entry per variant.
        if prepared_rule.substat_match == KEEP_UNIQUE_SUBSTAT_PER_SUBSTAT
            && prepared_rule.selected_substats.len() > 1
        {
            let per_substat_entries = prepared_rule
                .selected_substats
                .iter()
                .map(|variant| {
                    keep_unique_build_entry_for_substats(
                        prepared_rule,
                        &parsed_candidates,
                        &[*variant],
                        KEEP_UNIQUE_SUBSTAT_ANY,
                    )
                })
                .collect::<Vec<_>>();
            entries.push(keep_unique_merge_substat_entries(
                prepared_rule,
                prepared_rule.required_per_group,
                per_substat_entries,
            ));
            continue;
        }
        // Single-variant `persubstat` behaves like `any` for that variant.
        let effective_match = if prepared_rule.substat_match == KEEP_UNIQUE_SUBSTAT_PER_SUBSTAT {
            KEEP_UNIQUE_SUBSTAT_ANY
        } else {
            prepared_rule.substat_match.as_str()
        };
        entries.push(keep_unique_build_entry_for_substats(
            prepared_rule,
            &parsed_candidates,
            &prepared_rule.selected_substats,
            effective_match,
        ));
    }

    // Snapshot timestamp is sanitized to finite number for stable payloads.
    let scanned_at = if now.is_finite() { now } else { 0.0 };
    KeepUniqueWasmSnapshotOut { scanned_at, entries }
}

#[wasm_bindgen]
pub fn compute_keep_unique_protection_value(
    candidates: JsValue,
    rules: JsValue,
    expected_groups_by_rule_id: JsValue,
    enabled: bool,
    now: f64,
) -> Result<JsValue, JsValue> {
    // Deserialize candidate and rule payloads with explicit error context.
    let parsed_candidates: Vec<KeepUniqueWasmCandidateIn> = from_js_value(candidates)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique candidates: {error}")))?;
    let parsed_rule_values: Vec<serde_json::Value> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique rules: {error}")))?;
    // Skip malformed legacy rows so detection can continue on valid rules.
    let parsed_rules = parsed_rule_values
        .into_iter()
        .filter_map(|value| serde_json::from_value::<KeepUniqueWasmRuleIn>(value).ok())
        .collect::<Vec<_>>();
    // Parse expected-group payload as wrapper or legacy map.
    let expected_payload = parse_keep_unique_expected_groups_payload(expected_groups_by_rule_id)?;
    // Run the shared protection core and return the serialized snapshot.
    let snapshot = compute_keep_unique_protection_core(
        parsed_candidates,
        parsed_rules,
        expected_payload,
        enabled,
        now,
    );
    to_js_value(&snapshot)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize keep-unique snapshot: {error}")))
}

// Combined keep-unique export runs candidate collection + protection in one pass.
#[wasm_bindgen]
pub fn collect_and_compute_keep_unique_protection_value(
    rows: JsValue,
    rules: JsValue,
    config_modes: JsValue,
    ignore_keep_unique_config_indices: JsValue,
    keep_unique_rules: JsValue,
    expected_groups_payload: JsValue,
    enabled: bool,
    now: f64,
) -> Result<JsValue, JsValue> {
    // Parse collect rows with matcher item + normalized artifact dimensions.
    let rows: Vec<KeepUniqueCollectRowIn> = from_js_value(rows)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique collect rows payload: {error}")))?;
    // Parse base rules used by keep/sell candidate resolution.
    let rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique collect rules payload: {error}")))?;
    // Parse visibility modes used by evaluate-item rule filtering.
    let config_modes: Vec<String> = from_js_value(config_modes)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique collect config-modes payload: {error}")))?;
    // Parse optional ignored-config list for keep-unique suppression modes.
    let ignore_keep_unique_config_indices: Option<Vec<i64>> = from_js_value(ignore_keep_unique_config_indices)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique collect ignored-config payload: {error}")))?;
    // Parse keep-unique rules used by protection scoring/counting logic.
    let parsed_rule_values: Vec<serde_json::Value> = from_js_value(keep_unique_rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique rules: {error}")))?;
    // Skip malformed rows so protection still runs for valid rules.
    let parsed_rules = parsed_rule_values
        .into_iter()
        .filter_map(|value| serde_json::from_value::<KeepUniqueWasmRuleIn>(value).ok())
        .collect::<Vec<_>>();
    // Parse expected-group wrapper or legacy map payload.
    let expected_payload = parse_keep_unique_expected_groups_payload(expected_groups_payload)?;

    // Prepare base rules once; collect-core reuses these for every row.
    let prepared_rules = rules.into_iter().map(prepare_rule).collect::<Vec<_>>();
    let collected = collect_keep_unique_candidates_core(
        &rows,
        &prepared_rules,
        &config_modes,
        &ignore_keep_unique_config_indices.unwrap_or_default(),
    )?;
    // Convert collected rows into protection candidate payload shape.
    let protection_candidates = collected
        .candidates
        .iter()
        .map(|candidate| KeepUniqueWasmCandidateIn {
            item_key: candidate.item_key,
            group_key: candidate.group_key.clone(),
            is_sold: candidate.is_sold,
            artifact: candidate.artifact.clone(),
        })
        .collect::<Vec<_>>();
    // Run detection against collected candidates without a second JS roundtrip.
    let detection = compute_keep_unique_protection_core(
        protection_candidates,
        parsed_rules,
        expected_payload,
        enabled,
        now,
    );
    // Return both candidate and detection payloads for TS call sites.
    let combined = KeepUniqueCollectedAndProtectedSnapshotOut {
        candidates: collected.candidates,
        unique_item_keys: collected.unique_item_keys,
        detection,
    };
    to_js_value(&combined)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize keep-unique combined snapshot: {error}")))
}
