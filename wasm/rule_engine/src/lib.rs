use std::cmp::Ordering;
use std::cell::RefCell;
use std::collections::{BTreeSet, HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_wasm_bindgen::{from_value as from_js_value, to_value as to_js_value};
use wasm_bindgen::prelude::*;

// Keep the same sentinel constants used by the TypeScript evaluator so
// matcher decisions stay identical across JS and WASM paths.
// Source of truth: src/lib/types.ts (StatId, StatVariant, LEVEL_ANY_SENTINEL)
// and src/lib/constants.ts (ACCESSORY_NO_SET_ID).
const STAT_ID_ANY: i64 = -1;
const STAT_ID_HP: i64 = 1;
const STAT_ID_ATK: i64 = 2;
const STAT_ID_DEF: i64 = 3;
const STAT_ID_SPD: i64 = 4;
const STAT_ID_RES: i64 = 5;
const STAT_ID_ACC: i64 = 6;
const STAT_ID_CR: i64 = 7;
const STAT_ID_CDMG: i64 = 8;
const STAT_ID_HP_ATK_DEF: i64 = 9;
const STAT_ID_ROLL_COUNT: i64 = 99;
const LEVEL_ANY_SENTINEL: i64 = 99;
const RULE_SOURCE_KEEP_UNIQUES: &str = "keepUniques";
const RULE_FIELD_UNSET_SENTINEL: i64 = STAT_ID_ANY;
const FILTER_OPTION_NONE_I32: i32 = STAT_ID_ANY as i32;
const MAIN_STAT_F_DEFAULT_FLAG: i64 = 1;
const MAIN_STAT_F_DEFAULT_STR: &str = "1";
const STAT_VARIANT_SHIFT_BITS: i64 = 8;
const STAT_VARIANT_ID_MASK: i64 = 0xFF;
const STAT_VARIANT_FLAT_SUFFIX: i64 = 1;
const STAT_VARIANT_ANY: i64 = STAT_ID_ANY;
const STAT_VARIANT_HP_PERCENT: i64 = (STAT_ID_HP << STAT_VARIANT_SHIFT_BITS) | 0;
const STAT_VARIANT_HP_FLAT: i64 = (STAT_ID_HP << STAT_VARIANT_SHIFT_BITS) | STAT_VARIANT_FLAT_SUFFIX;
const STAT_VARIANT_ATK_PERCENT: i64 = (STAT_ID_ATK << STAT_VARIANT_SHIFT_BITS) | 0;
const STAT_VARIANT_ATK_FLAT: i64 = (STAT_ID_ATK << STAT_VARIANT_SHIFT_BITS) | STAT_VARIANT_FLAT_SUFFIX;
const STAT_VARIANT_DEF_PERCENT: i64 = (STAT_ID_DEF << STAT_VARIANT_SHIFT_BITS) | 0;
const STAT_VARIANT_DEF_FLAT: i64 = (STAT_ID_DEF << STAT_VARIANT_SHIFT_BITS) | STAT_VARIANT_FLAT_SUFFIX;
const STAT_VARIANT_SPD: i64 = (STAT_ID_SPD << STAT_VARIANT_SHIFT_BITS) | STAT_VARIANT_FLAT_SUFFIX;
const STAT_VARIANT_RES: i64 = (STAT_ID_RES << STAT_VARIANT_SHIFT_BITS) | STAT_VARIANT_FLAT_SUFFIX;
const STAT_VARIANT_ACC: i64 = (STAT_ID_ACC << STAT_VARIANT_SHIFT_BITS) | STAT_VARIANT_FLAT_SUFFIX;
const STAT_VARIANT_CR: i64 = (STAT_ID_CR << STAT_VARIANT_SHIFT_BITS) | 0;
const STAT_VARIANT_CDMG: i64 = (STAT_ID_CDMG << STAT_VARIANT_SHIFT_BITS) | 0;
const ARTIFACT_TYPE_WEAPON: i64 = 5;
const ARTIFACT_TYPE_RING: i64 = 7;
const ARTIFACT_TYPE_AMULET: i64 = 8;
const ARTIFACT_TYPE_BANNER: i64 = 9;
const ACCESSORY_NO_SET_ID: i64 = -99;
const HSF_SUBSTAT_SLOT_COUNT: usize = 4;
const RARITY_CODE_EPIC: i64 = 4;
const RARITY_CODE_GTE_EPIC: i64 = 9;
const RARITY_CODE_GTE_LEGENDARY: i64 = 16;
const LEVEL_MILESTONE_0: i64 = 0;
const LEVEL_MILESTONE_4: i64 = 4;
const LEVEL_MILESTONE_8: i64 = 8;
const LEVEL_MILESTONE_12: i64 = 12;
const LEVEL_MILESTONE_16: i64 = 16;
const LEVEL_ORDER_INDEX_0: i64 = 0;
const LEVEL_ORDER_INDEX_4: i64 = 1;
const LEVEL_ORDER_INDEX_8: i64 = 2;
const LEVEL_ORDER_INDEX_12: i64 = 3;
const LEVEL_ORDER_INDEX_16: i64 = 4;
const LEVEL_ORDER_INDEX_ANY: i64 = 5;
const LEVEL_ORDER_FALLBACK_OFFSET: i64 = 6;

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
    #[serde(default, rename = "__keepUniqueItemKey")]
    keep_unique_item_key: Option<i64>,
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
#[derive(Debug, Deserialize)]
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
#[derive(Debug, Deserialize)]
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

// Keep level ordering aligned with merge.ts.
fn level_order_value(level: Option<i64>) -> i64 {
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
    let mut matching_configs = BTreeSet::<i64>::new();
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
            matching_configs.insert(cfg_idx);
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

    let matching_config_indices = matching_configs.into_iter().collect::<Vec<_>>();
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
#[derive(Debug, Deserialize)]
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmitHsfRulesForDistributionsIn {
    base_rule: RuleRaw,
    substats: Vec<EmitHsfSubstatIn>,
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

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmSubstatIn {
    variant: i64,
    #[serde(default)]
    is_flat: bool,
    value: f64,
}

#[derive(Debug, Deserialize, Clone)]
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

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmSetSelection {
    id: i64,
    #[serde(default)]
    excluded: bool,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
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

#[derive(Debug, Deserialize, Serialize, Clone, Copy)]
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
    id: String,
    combination: KeepUniqueWasmCombination,
    required_count: i64,
    activation: String,
    count_mode: KeepUniqueWasmCountMode,
    #[serde(default)]
    substats: Vec<i64>,
    #[serde(default)]
    substat_match: String,
    #[serde(default)]
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

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmSubstatOut {
    variant: i64,
    is_flat: bool,
    value: f64,
}

#[derive(Debug, Serialize, Clone)]
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

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmPlaceholderOut {
    combination: KeepUniqueWasmCombination,
    missing: i64,
    reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    substat_variants: Option<Vec<i64>>,
}

#[derive(Debug, Serialize, Clone)]
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

#[derive(Debug, Serialize, Clone)]
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

#[wasm_bindgen]
pub fn compute_keep_unique_protection_value(
    candidates: JsValue,
    rules: JsValue,
    expected_groups_by_rule_id: JsValue,
    enabled: bool,
    now: f64,
) -> Result<JsValue, JsValue> {
    // Deserialize all three payloads with explicit error context.
    let parsed_candidates: Vec<KeepUniqueWasmCandidateIn> = from_js_value(candidates)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique candidates: {error}")))?;
    let parsed_rules: Vec<KeepUniqueWasmRuleIn> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique rules: {error}")))?;
    let expected_map: HashMap<String, Vec<KeepUniqueWasmExpectedGroupIn>> =
        from_js_value(expected_groups_by_rule_id)
            .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique expected groups: {error}")))?;

    // Precompute sanitized rule metadata used by candidate scans.
    let prepared_rules = parsed_rules
        .into_iter()
        .map(|rule| {
            // Normalize count mode so invalid combos fall back to per-rule mode.
            let count_mode = keep_unique_sanitize_count_mode(rule.count_mode);
            // Required count is clamped to at least one.
            let required_per_group = rule.required_count.max(1);
            // Normalize match mode token for deterministic branching.
            let normalized_match = keep_unique_normalize_substat_match(&rule.substat_match);
            let has_substat_filter = !rule.substats.is_empty();
            // No selected substats always implies `any` behavior.
            let substat_match = if has_substat_filter {
                normalized_match
            } else {
                KEEP_UNIQUE_SUBSTAT_ANY.to_string()
            };
            // Parse and sanitize variant weights into numeric map.
            let mut weights = HashMap::<i64, f64>::new();
            for (raw_variant, raw_weight) in &rule.substat_weights {
                let Ok(variant) = raw_variant.parse::<i64>() else {
                    continue;
                };
                weights.insert(variant, keep_unique_normalize_weight(*raw_weight));
            }
            // Pre-split set filters into include/exclude lookup sets.
            let (set_includes, set_excludes) = keep_unique_split_set_selections(&rule.combination.sets);
            KeepUniqueWasmPreparedRule {
                id: rule.id.clone(),
                combination: rule.combination.clone(),
                required_per_group,
                activation: rule.activation.clone(),
                // Activation off disables sold-item projection contribution.
                rule_active: enabled && rule.activation.trim().to_ascii_lowercase() != KEEP_UNIQUE_ACTIVATION_OFF,
                count_mode,
                selected_substats: rule.substats.clone(),
                substat_match,
                weights,
                set_includes,
                set_excludes,
                expected_groups: expected_map.get(&rule.id).cloned().unwrap_or_default(),
            }
        })
        .collect::<Vec<_>>();

    // Evaluate each prepared rule and build entry payloads.
    let mut entries = Vec::<KeepUniqueWasmEntryOut>::new();
    for prepared_rule in &prepared_rules {
        // `persubstat` with multiple selected variants expands one entry per variant.
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
        // Single-variant `persubstat` behaves like `any` on that one variant.
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
    let snapshot = KeepUniqueWasmSnapshotOut { scanned_at, entries };
    // Return JS object payload used directly by TS detection pipeline.
    to_js_value(&snapshot)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize keep-unique snapshot: {error}")))
}
