use super::*;

// Epsilon is used only for tie expansion at the score boundary.
const KEEP_UNIQUE_SCORE_TIE_EPSILON: f64 = 1e-9;
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
// Shared grouped-bucket token keeps per-rule mode branch-free and centralized.
const KEEP_UNIQUE_COUNT_KEY_GLOBAL: &str = "global";

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KeepUniqueWasmSubstatIn {
    pub(crate) variant: i64,
    #[serde(default)]
    pub(crate) is_flat: bool,
    pub(crate) value: f64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KeepUniqueWasmArtifactIn {
    pub(crate) id: Option<i64>,
    pub(crate) slot: i64,
    pub(crate) set: i64,
    pub(crate) rank: i64,
    pub(crate) rarity: i64,
    pub(crate) level: i64,
    pub(crate) exact_level: Option<i64>,
    pub(crate) faction: i64,
    pub(crate) main_stat: i64,
    #[serde(default)]
    pub(crate) substats: Vec<KeepUniqueWasmSubstatIn>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmCandidateIn {
    item_key: i64,
    group_key: String,
    is_sold: bool,
    artifact: KeepUniqueWasmArtifactIn,
}

// Numeric coercion helper accepts number/string/bool payloads from JS rows.
// This keeps raw tester row parsing resilient without duplicating TS preprocess.
fn keep_unique_value_to_i64(value: Option<&serde_json::Value>) -> Option<i64> {
    numberish_to_i64_floor(value)
}

// Floating-point coercion preserves finite numeric payloads only.
// Invalid/NaN/Infinity values are ignored and callers apply safe defaults.
fn keep_unique_value_to_f64(value: Option<&serde_json::Value>) -> Option<f64> {
    numberish_to_f64_finite(value)
}

// Boolean coercion mirrors JS truthy handling for non-boolean legacy payloads.
// This keeps old snapshots compatible when fields arrive as 0/1 or strings.
fn keep_unique_value_to_bool(value: Option<&serde_json::Value>) -> Option<bool> {
    numberish_to_bool_non_empty_string(value)
}

// Base-match parsing supports compact `{ keep, cfgIdx }` payloads from rows.
// Missing baseMatch fields return `None` so undefined/null stay distinguishable.
fn keep_unique_parse_base_match(
    value: Option<&serde_json::Value>,
) -> Option<KeepUniqueCandidateResolveBaseMatchIn> {
    let record = value?.as_object()?;
    Some(KeepUniqueCandidateResolveBaseMatchIn {
        keep: keep_unique_value_to_bool(record.get("keep")).unwrap_or(false),
        cfg_idx: keep_unique_value_to_i64(record.get("cfgIdx")),
    })
}

// Main-stat parser accepts compact numeric variants or full `{ variant }` records.
// This allows direct row/candidate payloads without TS-side conversion loops.
fn keep_unique_parse_main_stat_variant(value: Option<&serde_json::Value>) -> i64 {
    match value {
        Some(serde_json::Value::Object(record)) => {
            keep_unique_value_to_i64(record.get("variant")).unwrap_or(KEEP_UNIQUE_MAIN_ANY)
        }
        _ => keep_unique_value_to_i64(value).unwrap_or(KEEP_UNIQUE_MAIN_ANY),
    }
}

// Substat parser accepts both compact `{ value }` and raw `{ totalValue }` payloads.
// This keeps score calculations aligned while removing TS-side row remapping.
fn keep_unique_parse_substats(value: Option<&serde_json::Value>) -> Vec<KeepUniqueWasmSubstatIn> {
    let Some(entries) = value.and_then(|inner| inner.as_array()) else {
        return Vec::new();
    };
    let mut out = Vec::<KeepUniqueWasmSubstatIn>::with_capacity(entries.len());
    for entry in entries {
        let Some(record) = entry.as_object() else {
            continue;
        };
        let variant = keep_unique_value_to_i64(record.get("variant")).unwrap_or(STAT_VARIANT_ANY);
        let is_flat = keep_unique_value_to_bool(record.get("isFlat")).unwrap_or(false);
        let numeric_value = keep_unique_value_to_f64(record.get("value"))
            .or_else(|| keep_unique_value_to_f64(record.get("totalValue")))
            .unwrap_or(0.0);
        out.push(KeepUniqueWasmSubstatIn {
            variant,
            is_flat,
            value: numeric_value,
        });
    }
    out
}

// Artifact parser accepts compact keep-unique payloads and raw tester artifacts.
// Required dimensions fail fast so matcher scans do not run on malformed rows.
fn keep_unique_parse_artifact(value: Option<&serde_json::Value>) -> Result<KeepUniqueWasmArtifactIn, String> {
    let Some(record) = value.and_then(|inner| inner.as_object()) else {
        return Err("artifact payload must be an object".to_string());
    };
    let slot = keep_unique_value_to_i64(record.get("slot"))
        .ok_or_else(|| "artifact.slot is required".to_string())?;
    let set = keep_unique_value_to_i64(record.get("set"))
        .ok_or_else(|| "artifact.set is required".to_string())?;
    let rank = keep_unique_value_to_i64(record.get("rank"))
        .ok_or_else(|| "artifact.rank is required".to_string())?;
    let rarity = keep_unique_value_to_i64(record.get("rarity"))
        .ok_or_else(|| "artifact.rarity is required".to_string())?;
    let level = keep_unique_value_to_i64(record.get("level"))
        .ok_or_else(|| "artifact.level is required".to_string())?;
    let faction = keep_unique_value_to_i64(record.get("faction")).unwrap_or(0);
    Ok(KeepUniqueWasmArtifactIn {
        id: keep_unique_value_to_i64(record.get("id")),
        slot,
        set,
        rank,
        rarity,
        level,
        exact_level: keep_unique_value_to_i64(record.get("exactLevel")),
        faction,
        main_stat: keep_unique_parse_main_stat_variant(record.get("mainStat")),
        substats: keep_unique_parse_substats(record.get("substats")),
    })
}

// Accessory slots keep faction while armor slots collapse to zero by design.
// This helper keeps all faction-normalization branches single-sourced.
pub(crate) fn keep_unique_normalized_faction_for_slot(slot: i64, faction: i64) -> i64 {
    if keep_unique_is_accessory_slot(slot) {
        faction
    } else {
        0
    }
}

// Group-key dimensions always normalize faction the same way before encoding.
// Export this so matcher and parser call sites reuse one formatting helper.
pub(crate) fn keep_unique_group_key_from_parts(
    slot: i64,
    set: i64,
    main_stat: i64,
    faction_raw: i64,
) -> String {
    let normalized_faction = keep_unique_normalized_faction_for_slot(slot, faction_raw);
    format!("{slot}:{set}:{main_stat}:{normalized_faction}")
}

// Group-key helper keeps fallback key generation identical to collect-core rules.
// Non-accessory slots normalize faction to zero before hashing dimensions.
fn keep_unique_group_key_from_artifact(artifact: &KeepUniqueWasmArtifactIn) -> String {
    keep_unique_group_key_from_parts(
        artifact.slot,
        artifact.set,
        artifact.main_stat,
        artifact.faction,
    )
}

// Row parser accepts compact collect payloads or raw tester preview rows.
// Raw rows read `item` from `artifact.testerItem` to avoid TS re-serialization.
fn keep_unique_parse_collect_row(value: &serde_json::Value) -> Result<KeepUniqueCollectRowIn, String> {
    let Some(record) = value.as_object() else {
        return Err("collect row must be an object".to_string());
    };
    let artifact = keep_unique_parse_artifact(record.get("artifact"))
        .map_err(|error| format!("invalid artifact payload: {error}"))?;
    let item_value = if let Some(item) = record.get("item") {
        item.clone()
    } else {
        record
            .get("artifact")
            .and_then(|inner| inner.get("testerItem"))
            .cloned()
            .ok_or_else(|| "collect row requires item or artifact.testerItem".to_string())?
    };
    let item: TestItemRaw = serde_json::from_value(item_value)
        .map_err(|error| format!("invalid item payload: {error}"))?;
    let base_match_defined = if record.contains_key("baseMatchDefined") {
        keep_unique_value_to_bool(record.get("baseMatchDefined")).unwrap_or(false)
    } else {
        record.contains_key("baseMatch")
    };
    Ok(KeepUniqueCollectRowIn {
        item,
        base_match_defined,
        base_match: keep_unique_parse_base_match(record.get("baseMatch")),
        artifact,
    })
}

// Candidate parser accepts compact payloads or raw KeepUniqueCandidate objects.
// Missing item/group keys fall back to artifact-derived parity defaults.
fn keep_unique_parse_candidate(value: &serde_json::Value) -> Result<KeepUniqueWasmCandidateIn, String> {
    let Some(record) = value.as_object() else {
        return Err("candidate entry must be an object".to_string());
    };
    let artifact = keep_unique_parse_artifact(record.get("artifact"))
        .map_err(|error| format!("invalid artifact payload: {error}"))?;
    let item_key = keep_unique_value_to_i64(record.get("itemKey"))
        .or(artifact.id)
        .unwrap_or(0);
    let group_key = record
        .get("groupKey")
        .and_then(|inner| inner.as_str())
        .map(str::trim)
        .filter(|inner| !inner.is_empty())
        .map(|inner| inner.to_string())
        .unwrap_or_else(|| keep_unique_group_key_from_artifact(&artifact));
    Ok(KeepUniqueWasmCandidateIn {
        item_key,
        group_key,
        is_sold: keep_unique_value_to_bool(record.get("isSold")).unwrap_or(false),
        artifact,
    })
}

// Shared row decoder centralizes collect-row normalization for both bindings.
// Every index is validated so callers get actionable error messages on failure.
pub(crate) fn keep_unique_parse_collect_rows_payload(
    rows: JsValue,
) -> Result<Vec<KeepUniqueCollectRowIn>, JsValue> {
    let raw_rows: Vec<serde_json::Value> = from_js_value(rows)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique collect rows payload: {error}")))?;
    let mut parsed_rows = Vec::<KeepUniqueCollectRowIn>::with_capacity(raw_rows.len());
    for (idx, row) in raw_rows.iter().enumerate() {
        let parsed = keep_unique_parse_collect_row(row).map_err(|error| {
            JsValue::from_str(&format!("Invalid keep-unique collect row at index {idx}: {error}"))
        })?;
        parsed_rows.push(parsed);
    }
    Ok(parsed_rows)
}

// Shared candidate decoder centralizes raw/compact keep-unique candidate parsing.
// Candidate index is included so malformed rows are easy to locate in fixtures.
fn keep_unique_parse_candidates_payload(
    candidates: JsValue,
) -> Result<Vec<KeepUniqueWasmCandidateIn>, JsValue> {
    let raw_candidates: Vec<serde_json::Value> = from_js_value(candidates)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique candidates: {error}")))?;
    let mut parsed_candidates = Vec::<KeepUniqueWasmCandidateIn>::with_capacity(raw_candidates.len());
    for (idx, candidate) in raw_candidates.iter().enumerate() {
        let parsed = keep_unique_parse_candidate(candidate).map_err(|error| {
            JsValue::from_str(&format!("Invalid keep-unique candidate at index {idx}: {error}"))
        })?;
        parsed_candidates.push(parsed);
    }
    Ok(parsed_candidates)
}

// Keep-unique rule decoder keeps malformed legacy rows non-fatal for detection.
// This matches existing behavior where invalid rows are skipped, not fatal.
fn keep_unique_parse_rules_payload(rules: JsValue) -> Result<Vec<KeepUniqueWasmRuleIn>, JsValue> {
    let parsed_rule_values: Vec<serde_json::Value> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique rules: {error}")))?;
    Ok(parsed_rule_values
        .into_iter()
        .filter_map(|value| serde_json::from_value::<KeepUniqueWasmRuleIn>(value).ok())
        .collect::<Vec<_>>())
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KeepUniqueWasmSetSelection {
    pub(crate) id: i64,
    #[serde(default)]
    pub(crate) excluded: bool,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KeepUniqueWasmCombination {
    #[serde(default)]
    pub(crate) slots: Vec<i64>,
    #[serde(default)]
    pub(crate) sets: Vec<KeepUniqueWasmSetSelection>,
    #[serde(default)]
    pub(crate) meta_set_ids: Vec<String>,
    #[serde(default)]
    pub(crate) ranks: Vec<i64>,
    #[serde(default)]
    pub(crate) rarities: Vec<i64>,
    #[serde(default)]
    pub(crate) main_stats: Vec<i64>,
    #[serde(default)]
    pub(crate) factions: Vec<i64>,
}

// Lookup payload keeps readable HSFC labels single-sourced in TS while Rust
// handles recursive flattening, coercion, and dedupe/sort normalization.
#[derive(Debug, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueWasmNormalizationLookupsIn {
    #[serde(default)]
    artifact_type_ids_by_name: HashMap<String, i64>,
    #[serde(default)]
    artifact_set_ids_by_name: HashMap<String, i64>,
    #[serde(default)]
    faction_ids_by_name: HashMap<String, i64>,
    #[serde(default)]
    rarity_codes_by_name: HashMap<String, i64>,
    #[serde(default)]
    stat_variant_ids_by_label: HashMap<String, i64>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Copy, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KeepUniqueWasmCountMode {
    #[serde(default)]
    pub(crate) per_rule: bool,
    #[serde(default)]
    pub(crate) per_set: bool,
    #[serde(default)]
    pub(crate) per_faction: bool,
    #[serde(default)]
    pub(crate) per_main_stat: bool,
    #[serde(default)]
    pub(crate) per_slot: bool,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KeepUniqueWasmRuleIn {
    #[serde(default)]
    pub(crate) id: Option<String>,
    #[serde(default)]
    pub(crate) name: Option<String>,
    #[serde(default)]
    pub(crate) combination: Option<KeepUniqueWasmCombination>,
    #[serde(default)]
    pub(crate) required_count: Option<i64>,
    #[serde(default)]
    pub(crate) activation: Option<String>,
    #[serde(default)]
    pub(crate) count_mode: Option<KeepUniqueWasmCountMode>,
    #[serde(default)]
    pub(crate) substats: Option<Vec<i64>>,
    #[serde(default)]
    pub(crate) substat_match: Option<String>,
    #[serde(default)]
    pub(crate) substat_weights: Option<HashMap<String, f64>>,
}

// Resolved keep-unique rule payload returned to TS after metaset expansion.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KeepUniqueWasmResolvedRuleOut {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) combination: KeepUniqueWasmCombination,
    pub(crate) required_count: i64,
    pub(crate) activation: String,
    pub(crate) count_mode: KeepUniqueWasmCountMode,
    pub(crate) substats: Vec<i64>,
    pub(crate) substat_match: String,
    pub(crate) substat_weights: HashMap<String, f64>,
}

// Normalize incoming lookup-map keys (trim + lowercase) so Rust-side
// label resolution stays deterministic across payload casing differences.
fn keep_unique_normalize_lookup_map(raw: HashMap<String, i64>) -> HashMap<String, i64> {
    let mut normalized = HashMap::<String, i64>::new();
    for (key, value) in raw {
        let lowered = key.trim().to_ascii_lowercase();
        if lowered.is_empty() {
            continue;
        }
        normalized.insert(lowered, value);
    }
    normalized
}

// Normalize all lookup maps once per export call so recursive value parsers
// can avoid repeated lowercase/trim normalization on lookup keys.
fn keep_unique_normalize_lookups(
    raw: KeepUniqueWasmNormalizationLookupsIn,
) -> KeepUniqueWasmNormalizationLookupsIn {
    KeepUniqueWasmNormalizationLookupsIn {
        artifact_type_ids_by_name: keep_unique_normalize_lookup_map(raw.artifact_type_ids_by_name),
        artifact_set_ids_by_name: keep_unique_normalize_lookup_map(raw.artifact_set_ids_by_name),
        faction_ids_by_name: keep_unique_normalize_lookup_map(raw.faction_ids_by_name),
        rarity_codes_by_name: keep_unique_normalize_lookup_map(raw.rarity_codes_by_name),
        stat_variant_ids_by_label: keep_unique_normalize_lookup_map(raw.stat_variant_ids_by_label),
    }
}

// Lookup helper reads normalized lowercase keys and falls back to None.
fn keep_unique_lookup_i64(lookup: &HashMap<String, i64>, raw: &str) -> Option<i64> {
    let lowered = raw.trim().to_ascii_lowercase();
    if lowered.is_empty() {
        return None;
    }
    lookup.get(&lowered).copied()
}

// Coerce unknown payload values to ids using lookup maps first, then numeric
// conversion. This mirrors TS behavior for readable-label and numeric payloads.
fn keep_unique_coerce_named_or_numeric_i64(
    value: &serde_json::Value,
    lookup: &HashMap<String, i64>,
) -> Option<i64> {
    if let Some(raw) = value.as_str() {
        if let Some(found) = keep_unique_lookup_i64(lookup, raw) {
            return Some(found);
        }
    }
    keep_unique_value_to_i64(Some(value))
}

// Parse StatVariant labels with TS-compatible aliases.
fn keep_unique_parse_variant_from_label(
    raw: &str,
    lookups: &KeepUniqueWasmNormalizationLookupsIn,
) -> Option<i64> {
    if let Some(found) = keep_unique_lookup_i64(&lookups.stat_variant_ids_by_label, raw) {
        return Some(found);
    }
    let token = raw.trim().to_ascii_uppercase();
    match token.as_str() {
        "HP%" => Some(STAT_VARIANT_HP_PERCENT),
        "HP" => Some(STAT_VARIANT_HP_FLAT),
        "ATK%" => Some(STAT_VARIANT_ATK_PERCENT),
        "ATK" => Some(STAT_VARIANT_ATK_FLAT),
        "DEF%" => Some(STAT_VARIANT_DEF_PERCENT),
        "DEF" => Some(STAT_VARIANT_DEF_FLAT),
        "SPD" => Some(STAT_VARIANT_SPD),
        "RES" => Some(STAT_VARIANT_RES),
        "ACC" => Some(STAT_VARIANT_ACC),
        "CR%" => Some(STAT_VARIANT_CR),
        "CDMG%" => Some(STAT_VARIANT_CDMG),
        "ROLL COUNT" => Some(STAT_VARIANT_ROLL_COUNT),
        _ => None,
    }
}

// Coerce values to StatVariant ids (label lookup, then numeric fallback).
fn keep_unique_coerce_stat_variant(
    value: &serde_json::Value,
    lookups: &KeepUniqueWasmNormalizationLookupsIn,
) -> i64 {
    if let Some(raw) = value.as_str() {
        if let Some(found) = keep_unique_parse_variant_from_label(raw, lookups) {
            return found;
        }
    }
    let Some(numeric) = keep_unique_value_to_i64(Some(value)) else {
        return STAT_VARIANT_ANY;
    };
    if numeric < 0 {
        STAT_VARIANT_ANY
    } else {
        numeric
    }
}

// Clamp rank/rarity entries while keeping TS behavior for invalid non-empty
// values (`invalid` becomes 6★ instead of being dropped).
fn keep_unique_coerce_rank_or_rarity(
    value: &serde_json::Value,
    lookups: &KeepUniqueWasmNormalizationLookupsIn,
) -> Option<i64> {
    if value.is_null() {
        return None;
    }
    if let Some(raw) = value.as_str() {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return None;
        }
        if let Some(found) = keep_unique_lookup_i64(&lookups.rarity_codes_by_name, trimmed) {
            return Some(keep_unique_clamp_rank_or_rarity_value(found));
        }
        let numeric_in_label = trimmed
            .chars()
            .filter(|char| char.is_ascii_digit())
            .collect::<String>();
        if !numeric_in_label.is_empty() {
            if let Ok(parsed) = numeric_in_label.parse::<i64>() {
                return Some(keep_unique_clamp_rank_or_rarity_value(parsed));
            }
        }
        if let Some(parsed) = keep_unique_value_to_i64(Some(value)) {
            return Some(keep_unique_clamp_rank_or_rarity_value(parsed));
        }
        return Some(RANK_VALUE_MAX);
    }
    if let Some(parsed) = keep_unique_value_to_i64(Some(value)) {
        return Some(keep_unique_clamp_rank_or_rarity_value(parsed));
    }
    Some(RANK_VALUE_MAX)
}

// Recursive slot parser handles scalar, list, and nested-list payloads.
fn keep_unique_collect_combination_slots(
    value: Option<&serde_json::Value>,
    lookups: &KeepUniqueWasmNormalizationLookupsIn,
    out: &mut Vec<i64>,
) {
    let Some(raw) = value else {
        return;
    };
    if let Some(list) = raw.as_array() {
        for nested in list {
            keep_unique_collect_combination_slots(Some(nested), lookups, out);
        }
        return;
    }
    if let Some(parsed) =
        keep_unique_coerce_named_or_numeric_i64(raw, &lookups.artifact_type_ids_by_name)
    {
        out.push(parsed);
    }
}

// Recursive faction parser handles scalar, list, and nested-list payloads.
fn keep_unique_collect_combination_factions(
    value: Option<&serde_json::Value>,
    lookups: &KeepUniqueWasmNormalizationLookupsIn,
    out: &mut Vec<i64>,
) {
    let Some(raw) = value else {
        return;
    };
    if let Some(list) = raw.as_array() {
        for nested in list {
            keep_unique_collect_combination_factions(Some(nested), lookups, out);
        }
        return;
    }
    if let Some(text) = raw.as_str() {
        if text.trim().is_empty() {
            return;
        }
    }
    if let Some(parsed) = keep_unique_coerce_named_or_numeric_i64(raw, &lookups.faction_ids_by_name)
    {
        out.push(parsed);
    }
}

// Recursive rank/rarity parser handles scalar, list, and nested-list payloads.
fn keep_unique_collect_combination_rank_values(
    value: Option<&serde_json::Value>,
    lookups: &KeepUniqueWasmNormalizationLookupsIn,
    out: &mut Vec<i64>,
) {
    let Some(raw) = value else {
        return;
    };
    if let Some(list) = raw.as_array() {
        for nested in list {
            keep_unique_collect_combination_rank_values(Some(nested), lookups, out);
        }
        return;
    }
    if let Some(parsed) = keep_unique_coerce_rank_or_rarity(raw, lookups) {
        out.push(parsed);
    }
}

// Recursive main-stat parser handles scalar, list, and nested-list payloads.
fn keep_unique_collect_combination_main_stats(
    value: Option<&serde_json::Value>,
    lookups: &KeepUniqueWasmNormalizationLookupsIn,
    out: &mut Vec<i64>,
) {
    let Some(raw) = value else {
        return;
    };
    if let Some(list) = raw.as_array() {
        for nested in list {
            keep_unique_collect_combination_main_stats(Some(nested), lookups, out);
        }
        return;
    }
    let parsed = keep_unique_coerce_stat_variant(raw, lookups);
    if parsed == STAT_VARIANT_ANY {
        return;
    }
    out.push(parsed);
}

// Recursive metaset-id parser handles scalar, list, and nested-list payloads.
fn keep_unique_collect_combination_meta_set_ids(
    value: Option<&serde_json::Value>,
    out: &mut Vec<String>,
) {
    let Some(raw) = value else {
        return;
    };
    if let Some(list) = raw.as_array() {
        for nested in list {
            keep_unique_collect_combination_meta_set_ids(Some(nested), out);
        }
        return;
    }
    let Some(text) = raw.as_str() else {
        return;
    };
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return;
    }
    out.push(trimmed.to_string());
}

// Recursive set parser handles scalar, list, nested-list, and object entries.
fn keep_unique_collect_combination_set_selections(
    value: Option<&serde_json::Value>,
    lookups: &KeepUniqueWasmNormalizationLookupsIn,
    out: &mut Vec<KeepUniqueWasmSetSelection>,
) {
    let Some(raw) = value else {
        return;
    };
    if let Some(list) = raw.as_array() {
        for nested in list {
            keep_unique_collect_combination_set_selections(Some(nested), lookups, out);
        }
        return;
    }
    if let Some(record) = raw.as_object() {
        let candidate = record
            .get("id")
            .or_else(|| record.get("setId"))
            .or_else(|| record.get("name"))
            .or_else(|| record.get("label"));
        let Some(candidate_value) = candidate else {
            return;
        };
        let Some(parsed) =
            keep_unique_coerce_named_or_numeric_i64(candidate_value, &lookups.artifact_set_ids_by_name)
        else {
            return;
        };
        let excluded = matches!(record.get("excluded"), Some(serde_json::Value::Bool(true)));
        out.push(KeepUniqueWasmSetSelection { id: parsed, excluded });
        return;
    }
    if let Some(parsed) = keep_unique_coerce_named_or_numeric_i64(raw, &lookups.artifact_set_ids_by_name)
    {
        out.push(KeepUniqueWasmSetSelection {
            id: parsed,
            excluded: false,
        });
    }
}

// Canonical metaset-id list is sorted and deduped for deterministic hashes.
fn keep_unique_sort_unique_meta_set_ids(values: Vec<String>) -> Vec<String> {
    let mut sorted = values
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    sorted.sort();
    sorted.dedup();
    sorted
}

// Substat ordering mirrors TS `STAT_VARIANTS_PRIORITY` so UI chips and
// normalized keep-unique payloads stay aligned across TS and Rust paths.
fn keep_unique_substat_priority(variant: i64) -> i64 {
    // Resolve from generated constants so TS and Rust share one priority table.
    // Unknown variants sink to the end via i64::MAX fallback.
    shared_order_index(&STAT_VARIANTS_PRIORITY, variant).unwrap_or(i64::MAX)
}

// Canonical substat list is deduped and sorted by keep-unique UI priority.
fn keep_unique_sort_unique_substats(values: Vec<i64>) -> Vec<i64> {
    let mut seen = HashSet::<i64>::new();
    let mut deduped = Vec::<i64>::new();
    for value in values {
        if !seen.insert(value) {
            continue;
        }
        deduped.push(value);
    }
    deduped.sort_by(|left, right| {
        let left_priority = keep_unique_substat_priority(*left);
        let right_priority = keep_unique_substat_priority(*right);
        if left_priority != right_priority {
            return left_priority.cmp(&right_priority);
        }
        left.cmp(right)
    });
    deduped
}

// Recursive substat parser handles scalar, list, and nested-list payloads.
fn keep_unique_collect_rule_substats(
    value: Option<&serde_json::Value>,
    lookups: &KeepUniqueWasmNormalizationLookupsIn,
    out: &mut Vec<i64>,
) {
    let Some(raw) = value else {
        return;
    };
    if let Some(list) = raw.as_array() {
        for nested in list {
            keep_unique_collect_rule_substats(Some(nested), lookups, out);
        }
        return;
    }
    let parsed = keep_unique_coerce_stat_variant(raw, lookups);
    if parsed == STAT_VARIANT_ANY || parsed == STAT_VARIANT_ROLL_COUNT {
        return;
    }
    out.push(parsed);
}

// Activation parser mirrors TS normalizeKeepUniqueActivation semantics.
fn keep_unique_normalize_activation_value(
    activation: Option<&serde_json::Value>,
    legacy_enabled: Option<&serde_json::Value>,
) -> String {
    if let Some(raw) = activation.and_then(|value| value.as_str()) {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            if trimmed.eq_ignore_ascii_case(KEEP_UNIQUE_ACTIVATION_OFF)
                || trimmed.eq_ignore_ascii_case("disabled")
            {
                return KEEP_UNIQUE_ACTIVATION_OFF.to_string();
            }
            if trimmed.eq_ignore_ascii_case(KEEP_UNIQUE_ACTIVATION_ANTICIPATE_GAPS)
                || trimmed.eq_ignore_ascii_case("anticipate")
                || trimmed.eq_ignore_ascii_case("placeholder")
            {
                return KEEP_UNIQUE_ACTIVATION_ANTICIPATE_GAPS.to_string();
            }
            if trimmed.eq_ignore_ascii_case(KEEP_UNIQUE_ACTIVATION_PROTECT_EXISTING) {
                return KEEP_UNIQUE_ACTIVATION_PROTECT_EXISTING.to_string();
            }
        }
    }
    if matches!(legacy_enabled, Some(serde_json::Value::Bool(false))) {
        return KEEP_UNIQUE_ACTIVATION_OFF.to_string();
    }
    KEEP_UNIQUE_ACTIVATION_PROTECT_EXISTING.to_string()
}

// Expose activation normalization so TS does not duplicate token coercion rules.
#[wasm_bindgen]
pub fn normalize_keep_unique_activation_value(
    activation: JsValue,
    legacy_enabled: JsValue,
) -> Result<String, JsValue> {
    let parsed_activation = if activation.is_null() || activation.is_undefined() {
        None
    } else {
        Some(from_js_value::<serde_json::Value>(activation).map_err(|error| {
            JsValue::from_str(&format!("Invalid keep-unique activation payload: {error}"))
        })?)
    };
    let parsed_legacy_enabled = if legacy_enabled.is_null() || legacy_enabled.is_undefined() {
        None
    } else {
        Some(from_js_value::<serde_json::Value>(legacy_enabled).map_err(|error| {
            JsValue::from_str(&format!(
                "Invalid keep-unique legacy-enabled payload: {error}"
            ))
        })?)
    };
    Ok(keep_unique_normalize_activation_value(
        parsed_activation.as_ref(),
        parsed_legacy_enabled.as_ref(),
    ))
}

// Substat match parser returns TS-canonical tokens (`any|all|perSubstat`).
fn keep_unique_normalize_substat_match_for_rule(value: Option<&serde_json::Value>) -> String {
    let Some(raw) = value.and_then(|inner| inner.as_str()) else {
        return KEEP_UNIQUE_SUBSTAT_ANY.to_string();
    };
    let trimmed = raw.trim();
    if trimmed.eq_ignore_ascii_case(KEEP_UNIQUE_SUBSTAT_ALL) {
        return KEEP_UNIQUE_SUBSTAT_ALL.to_string();
    }
    if trimmed.eq_ignore_ascii_case(KEEP_UNIQUE_SUBSTAT_PER_SUBSTAT) {
        return KEEP_UNIQUE_SUBSTAT_PER_SUBSTAT.to_string();
    }
    KEEP_UNIQUE_SUBSTAT_ANY.to_string()
}

// Expose substat-match normalization so TS reuses Rust canonical token mapping.
#[wasm_bindgen]
pub fn normalize_keep_unique_substat_match_value(value: JsValue) -> Result<String, JsValue> {
    if value.is_null() || value.is_undefined() {
        return Ok(KEEP_UNIQUE_SUBSTAT_ANY.to_string());
    }
    let parsed_value: serde_json::Value = from_js_value(value)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique substat-match payload: {error}")))?;
    Ok(keep_unique_normalize_substat_match_for_rule(Some(
        &parsed_value,
    )))
}

// Count-mode parser mirrors TS normalizeKeepUniqueCountMode semantics.
fn keep_unique_parse_count_mode_value(value: Option<&serde_json::Value>) -> KeepUniqueWasmCountMode {
    let Some(raw) = value else {
        return keep_unique_default_count_mode();
    };
    if let Some(token) = raw.as_str() {
        let lowered = token.trim().to_ascii_lowercase();
        if lowered == "perrule" || lowered == "rule" {
            return keep_unique_sanitize_count_mode(KeepUniqueWasmCountMode {
                per_rule: true,
                per_set: false,
                per_faction: false,
                per_main_stat: false,
                per_slot: false,
            });
        }
        return keep_unique_default_count_mode();
    }
    let Some(record) = raw.as_object() else {
        return keep_unique_default_count_mode();
    };
    let parsed = KeepUniqueWasmCountMode {
        per_rule: matches!(record.get("perRule"), Some(serde_json::Value::Bool(true))),
        per_set: matches!(record.get("perSet"), Some(serde_json::Value::Bool(true))),
        per_faction: matches!(record.get("perFaction"), Some(serde_json::Value::Bool(true))),
        per_main_stat: matches!(record.get("perMainStat"), Some(serde_json::Value::Bool(true))),
        per_slot: matches!(record.get("perSlot"), Some(serde_json::Value::Bool(true))),
    };
    keep_unique_sanitize_count_mode(parsed)
}

// Expose count-mode normalization so TS reuses Rust default/sanitize behavior.
#[wasm_bindgen]
pub fn normalize_keep_unique_count_mode_value(value: JsValue) -> Result<JsValue, JsValue> {
    let parsed = if value.is_null() || value.is_undefined() {
        None
    } else {
        Some(from_js_value::<serde_json::Value>(value).map_err(|error| {
            JsValue::from_str(&format!("Invalid keep-unique count-mode payload: {error}"))
        })?)
    };
    let normalized = keep_unique_parse_count_mode_value(parsed.as_ref());
    to_js_value(&normalized)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize keep-unique count mode: {error}")))
}

// Substat weight parser mirrors TS normalizeKeepUniqueSubstatWeights behavior.
fn keep_unique_parse_substat_weights_for_rule(
    value: Option<&serde_json::Value>,
    lookups: &KeepUniqueWasmNormalizationLookupsIn,
) -> HashMap<String, f64> {
    let Some(record) = value.and_then(|inner| inner.as_object()) else {
        return HashMap::<String, f64>::new();
    };
    let mut weights = HashMap::<String, f64>::new();
    for (raw_key, raw_value) in record {
        let parsed_variant = keep_unique_coerce_stat_variant(&serde_json::Value::String(raw_key.clone()), lookups);
        if parsed_variant == STAT_VARIANT_ANY || parsed_variant == STAT_VARIANT_ROLL_COUNT {
            continue;
        }
        let numeric = keep_unique_value_to_f64(Some(raw_value)).unwrap_or(f64::NAN);
        let normalized = keep_unique_normalize_weight(numeric);
        if normalized == KEEP_UNIQUE_WEIGHT_DEFAULT {
            continue;
        }
        weights.insert(parsed_variant.to_string(), normalized);
    }
    weights
}

// Normalize combination payloads so TS no longer owns recursive parsing loops.
fn keep_unique_normalize_combination_from_value(
    value: &serde_json::Value,
    lookups: &KeepUniqueWasmNormalizationLookupsIn,
) -> Option<KeepUniqueWasmCombination> {
    let record = value.as_object()?;

    let mut slot_values = Vec::<i64>::new();
    keep_unique_collect_combination_slots(record.get("slots"), lookups, &mut slot_values);
    let mut set_values = Vec::<KeepUniqueWasmSetSelection>::new();
    keep_unique_collect_combination_set_selections(record.get("sets"), lookups, &mut set_values);
    let mut rank_values = Vec::<i64>::new();
    keep_unique_collect_combination_rank_values(record.get("ranks"), lookups, &mut rank_values);
    let mut rarity_values = Vec::<i64>::new();
    keep_unique_collect_combination_rank_values(record.get("rarities"), lookups, &mut rarity_values);
    let mut main_stats = Vec::<i64>::new();
    keep_unique_collect_combination_main_stats(record.get("mainStats"), lookups, &mut main_stats);
    let mut factions = Vec::<i64>::new();
    keep_unique_collect_combination_factions(record.get("factions"), lookups, &mut factions);
    let mut meta_set_ids = Vec::<String>::new();
    keep_unique_collect_combination_meta_set_ids(record.get("metaSetIds"), &mut meta_set_ids);
    keep_unique_collect_combination_meta_set_ids(record.get("metaSets"), &mut meta_set_ids);

    Some(KeepUniqueWasmCombination {
        slots: keep_unique_sort_unique_slots(&slot_values),
        sets: keep_unique_normalize_set_selections(&set_values),
        meta_set_ids: keep_unique_sort_unique_meta_set_ids(meta_set_ids),
        ranks: keep_unique_sorted_unique_i64(&rank_values),
        rarities: keep_unique_sorted_unique_i64(&rarity_values),
        main_stats: keep_unique_sort_unique_main_stats(&main_stats),
        factions: keep_unique_sorted_unique_i64(&factions),
    })
}

// Readable HSFC exports may wrap keep-unique entries as `{ kind, rule }`.
// Unwrap that envelope so normalization still reads the actual rule payload.
fn keep_unique_rule_record_from_value(
    value: &serde_json::Value,
) -> Option<&serde_json::Map<String, serde_json::Value>> {
    let record = value.as_object()?;
    let has_direct_rule_shape = record.contains_key("combination")
        || record.contains_key("tuple")
        || record.contains_key("requiredCount")
        || record.contains_key("countMode");
    if !has_direct_rule_shape {
        if let Some(nested_rule) = record.get("rule").and_then(|inner| inner.as_object()) {
            return Some(nested_rule);
        }
    }
    Some(record)
}

// Normalize rule payloads so TS no longer owns recursive keep-unique parsing.
fn keep_unique_normalize_rule_from_value(
    value: &serde_json::Value,
    lookups: &KeepUniqueWasmNormalizationLookupsIn,
    generated_rule_id: &str,
) -> Option<KeepUniqueWasmResolvedRuleOut> {
    let record = keep_unique_rule_record_from_value(value)?;
    let combination_source = record
        .get("combination")
        .or_else(|| record.get("tuple"))
        .unwrap_or(value);
    let combination = keep_unique_normalize_combination_from_value(combination_source, lookups)?;
    let combination_hash = keep_unique_hash_combination(&combination);

    let explicit_id = record
        .get("id")
        .and_then(|inner| inner.as_str())
        .map(str::trim)
        .filter(|inner| !inner.is_empty())
        .map(str::to_string);
    let generated_trimmed = generated_rule_id.trim();
    let id = explicit_id.unwrap_or_else(|| {
        if !generated_trimmed.is_empty() {
            generated_trimmed.to_string()
        } else {
            format!("ku_{combination_hash}")
        }
    });

    let name = record
        .get("name")
        .and_then(|inner| inner.as_str())
        .map(str::trim)
        .filter(|inner| !inner.is_empty())
        .map(str::to_string)
        .unwrap_or_default();

    let required_count = keep_unique_value_to_i64(record.get("requiredCount"))
        .filter(|inner| *inner >= 1)
        .unwrap_or(1);

    let activation = keep_unique_normalize_activation_value(record.get("activation"), record.get("enabled"));
    let count_mode = if record.contains_key("countMode") {
        keep_unique_parse_count_mode_value(record.get("countMode"))
    } else {
        keep_unique_default_count_mode()
    };

    let mut substats = Vec::<i64>::new();
    keep_unique_collect_rule_substats(record.get("substats"), lookups, &mut substats);
    if substats.is_empty() {
        keep_unique_collect_rule_substats(record.get("substatTargets"), lookups, &mut substats);
    }
    if substats.is_empty() {
        keep_unique_collect_rule_substats(record.get("substat"), lookups, &mut substats);
    }
    let normalized_substats = keep_unique_sort_unique_substats(substats);
    let parsed_substat_match = if record.contains_key("substatMatch") {
        keep_unique_normalize_substat_match_for_rule(record.get("substatMatch"))
    } else {
        KEEP_UNIQUE_SUBSTAT_ANY.to_string()
    };
    let substat_match = if normalized_substats.is_empty() {
        KEEP_UNIQUE_SUBSTAT_ANY.to_string()
    } else {
        parsed_substat_match
    };
    let substat_weights = if record.contains_key("substatWeights") {
        keep_unique_parse_substat_weights_for_rule(record.get("substatWeights"), lookups)
    } else {
        keep_unique_parse_substat_weights_for_rule(record.get("substatWeighting"), lookups)
    };

    Some(KeepUniqueWasmResolvedRuleOut {
        id,
        name,
        combination,
        required_count,
        activation,
        count_mode,
        substats: normalized_substats,
        substat_match,
        substat_weights,
    })
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

// Normalize keep-unique combination payloads in Rust so TS no longer owns
// recursive selection parsing/dedupe/sort loops for HSFC-readable tuples.
#[wasm_bindgen]
pub fn normalize_keep_unique_combination_value(
    value: JsValue,
    lookups: JsValue,
) -> Result<JsValue, JsValue> {
    // Null/undefined are treated as missing combination payloads.
    if value.is_null() || value.is_undefined() {
        return Ok(JsValue::NULL);
    }
    // Parse lookup maps (optional) and normalize keys once per call.
    let parsed_lookups = if lookups.is_null() || lookups.is_undefined() {
        KeepUniqueWasmNormalizationLookupsIn::default()
    } else {
        from_js_value::<KeepUniqueWasmNormalizationLookupsIn>(lookups).map_err(|error| {
            JsValue::from_str(&format!(
                "Invalid keep-unique normalization lookups payload: {error}"
            ))
        })?
    };
    let normalized_lookups = keep_unique_normalize_lookups(parsed_lookups);
    // Parse arbitrary payload value and normalize from object fields.
    let parsed_value = from_js_value::<serde_json::Value>(value)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique combination payload: {error}")))?;
    let Some(normalized) =
        keep_unique_normalize_combination_from_value(&parsed_value, &normalized_lookups)
    else {
        return Ok(JsValue::NULL);
    };
    // Serialize canonical combination payload for TS consumers.
    to_js_value(&normalized).map_err(|error| {
        JsValue::from_str(&format!(
            "Failed to serialize keep-unique normalized combination: {error}"
        ))
    })
}

// Normalize keep-unique rule payloads in Rust so TS no longer owns recursive
// tuple/rule parsing loops for readable HSFC + autosave payloads.
#[wasm_bindgen]
pub fn normalize_keep_unique_rule_value(
    value: JsValue,
    lookups: JsValue,
    generated_rule_id: String,
) -> Result<JsValue, JsValue> {
    // Null/undefined are treated as missing rule payloads.
    if value.is_null() || value.is_undefined() {
        return Ok(JsValue::NULL);
    }
    // Parse lookup maps (optional) and normalize keys once per call.
    let parsed_lookups = if lookups.is_null() || lookups.is_undefined() {
        KeepUniqueWasmNormalizationLookupsIn::default()
    } else {
        from_js_value::<KeepUniqueWasmNormalizationLookupsIn>(lookups).map_err(|error| {
            JsValue::from_str(&format!(
                "Invalid keep-unique normalization lookups payload: {error}"
            ))
        })?
    };
    let normalized_lookups = keep_unique_normalize_lookups(parsed_lookups);
    // Parse arbitrary payload value and normalize from object fields.
    let parsed_value = from_js_value::<serde_json::Value>(value)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique rule payload: {error}")))?;
    let Some(normalized) = keep_unique_normalize_rule_from_value(
        &parsed_value,
        &normalized_lookups,
        generated_rule_id.as_str(),
    ) else {
        return Ok(JsValue::NULL);
    };
    // Serialize canonical rule payload for TS consumers.
    to_js_value(&normalized)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize keep-unique normalized rule: {error}")))
}

// Metaset payload for in-wasm keep-unique set expansion.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KeepUniqueWasmMetasetIn {
    pub(crate) id: String,
    #[serde(default)]
    pub(crate) sets: Vec<i64>,
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
pub(crate) struct KeepUniqueWasmSnapshotOut {
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
        per_rule: KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_RULE,
        per_set: KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_SET,
        per_faction: KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_FACTION,
        per_main_stat: KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_MAIN_STAT,
        per_slot: KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_SLOT,
    }
}

// Resolve optional count-mode payloads into the canonical sanitized shape.
pub(crate) fn keep_unique_resolve_count_mode(
    mode: Option<KeepUniqueWasmCountMode>,
) -> KeepUniqueWasmCountMode {
    let seeded = mode.unwrap_or_else(keep_unique_default_count_mode);
    keep_unique_sanitize_count_mode(seeded)
}

pub(crate) fn keep_unique_normalize_substat_match(raw: &str) -> String {
    // Normalize whitespace/casing so persisted files and UI payloads match.
    let trimmed = raw.trim();
    // Unknown tokens collapse to `any` to stay backward compatible.
    if trimmed.eq_ignore_ascii_case(KEEP_UNIQUE_SUBSTAT_ALL) {
        return KEEP_UNIQUE_SUBSTAT_ALL.to_string();
    }
    if trimmed.eq_ignore_ascii_case(KEEP_UNIQUE_SUBSTAT_PER_SUBSTAT) {
        return KEEP_UNIQUE_SUBSTAT_PER_SUBSTAT.to_string();
    }
    KEEP_UNIQUE_SUBSTAT_ANY.to_string()
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
    // Use the canonical 6-star per-roll maxima for normalized scoring.
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

pub(crate) fn keep_unique_normalize_set_selections(
    values: &[KeepUniqueWasmSetSelection],
) -> Vec<KeepUniqueWasmSetSelection> {
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
    // Reuse the crate-wide helper so every module shares one sort+dedupe rule.
    sorted_unique_i64(values)
}

// Slot sorting mirrors TS compareArtifactTypes (preferred order + numeric fallback).
fn keep_unique_sort_unique_slots(values: &[i64]) -> Vec<i64> {
    let mut unique = values.to_vec();
    sort_artifact_types_in_place(&mut unique);
    unique.dedup();
    unique
}

// Main-stat ordering mirrors TS compareVariants/PREFERRED_STAT_ORDER.
fn keep_unique_main_stat_priority(variant: i64) -> i64 {
    // Resolve from generated constants so TS and Rust share one priority table.
    // Unknown variants sink to the end via i64::MAX fallback.
    shared_order_index(&PREFERRED_STAT_ORDER, variant).unwrap_or(i64::MAX)
}

// Main-stat lists are deduped and sorted with compareVariants parity.
fn keep_unique_sort_unique_main_stats(values: &[i64]) -> Vec<i64> {
    let mut deduped = values.to_vec();
    deduped.sort_unstable();
    deduped.dedup();
    deduped.sort_by(|left, right| {
        let left_priority = keep_unique_main_stat_priority(*left);
        let right_priority = keep_unique_main_stat_priority(*right);
        if left_priority != right_priority {
            return left_priority.cmp(&right_priority);
        }
        left.cmp(right)
    });
    deduped
}

fn keep_unique_domain_slot_order(domain: &KeepUniqueWasmExpectedGroupDomainIn) -> Vec<i64> {
    // Domain-provided slot order is authoritative; fallback keeps canonical order.
    if domain.slot_order.is_empty() {
        // Reuse generated slot order constants instead of duplicating literals.
        return PREFERRED_ARTIFACT_TYPE_ORDER.to_vec();
    }
    keep_unique_sort_unique_slots(&domain.slot_order)
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
    let mut selection = combination.factions.to_vec();
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

pub(crate) fn keep_unique_hash_combination(combination: &KeepUniqueWasmCombination) -> String {
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

// Expose combination hashing so TS reuses Rust canonical token construction.
#[wasm_bindgen]
pub fn hash_keep_unique_combination_value(combination: JsValue) -> Result<String, JsValue> {
    let parsed: KeepUniqueWasmCombination = from_js_value(combination)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique combination hash payload: {error}")))?;
    Ok(keep_unique_hash_combination(&parsed))
}

// Expose substat sorting so TS can reuse Rust priority + dedupe semantics.
#[wasm_bindgen]
pub fn sort_keep_unique_substats_value(values: JsValue) -> Result<JsValue, JsValue> {
    let parsed: Vec<i64> = from_js_value(values)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique substats payload: {error}")))?;
    let sorted = keep_unique_sort_unique_substats(parsed);
    to_js_value(&sorted)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize keep-unique sorted substats: {error}")))
}

// Expose full-combination sorting so TS can reuse Rust canonical ordering.
#[wasm_bindgen]
pub fn sort_keep_unique_combination_value(combination: JsValue) -> Result<JsValue, JsValue> {
    let parsed: KeepUniqueWasmCombination = from_js_value(combination)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique combination payload: {error}")))?;
    let KeepUniqueWasmCombination {
        slots,
        sets,
        meta_set_ids,
        ranks,
        rarities,
        main_stats,
        factions,
    } = parsed;
    let sorted = KeepUniqueWasmCombination {
        slots: keep_unique_sort_unique_slots(&slots),
        sets: keep_unique_normalize_set_selections(&sets),
        meta_set_ids: keep_unique_sort_unique_meta_set_ids(meta_set_ids),
        ranks: keep_unique_sorted_unique_i64(&ranks),
        rarities: keep_unique_sorted_unique_i64(&rarities),
        main_stats: keep_unique_sort_unique_main_stats(&main_stats),
        factions: keep_unique_sorted_unique_i64(&factions),
    };
    to_js_value(&sorted)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize keep-unique sorted combination: {error}")))
}

// Keep rank/rarity clamp behavior aligned with merge.ts helper logic.
fn keep_unique_clamp_rank_or_rarity_value(value: i64) -> i64 {
    value.clamp(RANK_VALUE_MIN, RANK_VALUE_MAX)
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
pub(crate) fn keep_unique_variant_to_sub(variant: i64) -> (i64, bool) {
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
pub(crate) fn keep_unique_clone_any_substats() -> Vec<RuleSubRaw> {
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
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return false;
    }
    trimmed.eq_ignore_ascii_case(KEEP_UNIQUE_ACTIVATION_OFF) || trimmed.eq_ignore_ascii_case("disabled")
}

fn keep_unique_is_activation_anticipate(raw: &str) -> bool {
    let trimmed = raw.trim();
    trimmed.eq_ignore_ascii_case(KEEP_UNIQUE_ACTIVATION_ANTICIPATE_GAPS)
        || trimmed.eq_ignore_ascii_case("anticipate")
        || trimmed.eq_ignore_ascii_case("placeholder")
}

pub(crate) fn build_keep_unique_rules_core(
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
    let faction = keep_unique_normalized_faction_for_slot(artifact.slot, artifact.faction);
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
    selection.contains(&candidate)
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
    let faction = keep_unique_normalized_faction_for_slot(artifact.slot, artifact.faction);
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
        return KEEP_UNIQUE_COUNT_KEY_GLOBAL.to_string();
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
        let faction = keep_unique_normalized_faction_for_slot(slot, faction_raw);
        parts.push(format!("faction:{faction}"));
    }
    if mode.per_main_stat {
        parts.push(format!("main:{main_stat}"));
    }
    // Empty dimensions fallback to global bucket.
    if parts.is_empty() {
        KEEP_UNIQUE_COUNT_KEY_GLOBAL.to_string()
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

// Expose item-key resolution so TS and Rust share tester-item-id fallback logic.
#[wasm_bindgen]
pub fn keep_unique_item_key_value(artifact: JsValue) -> Result<i64, JsValue> {
    let parsed_value: serde_json::Value = from_js_value(artifact)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique item-key artifact payload: {error}")))?;
    let record = parsed_value
        .as_object()
        .ok_or_else(|| JsValue::from_str("Invalid keep-unique item-key artifact payload: expected object"))?;
    let tester_item_key = record
        .get("testerItem")
        .and_then(|value| value.as_object())
        .and_then(|tester_item| keep_unique_value_to_i64(tester_item.get("itemId")));
    let artifact_id = keep_unique_value_to_i64(record.get("id"));
    Ok(tester_item_key.or(artifact_id).unwrap_or(0))
}

// Expose group-key derivation so TS reuses Rust accessory-faction normalization.
#[wasm_bindgen]
pub fn keep_unique_group_key_value(artifact: JsValue) -> Result<String, JsValue> {
    let parsed_value: serde_json::Value = from_js_value(artifact)
        .map_err(|error| JsValue::from_str(&format!("Invalid keep-unique group-key artifact payload: {error}")))?;
    let record = parsed_value
        .as_object()
        .ok_or_else(|| JsValue::from_str("Invalid keep-unique group-key artifact payload: expected object"))?;
    let slot = keep_unique_value_to_i64(record.get("slot"))
        .ok_or_else(|| JsValue::from_str("Invalid keep-unique group-key artifact payload: slot is required"))?;
    let set = keep_unique_value_to_i64(record.get("set"))
        .ok_or_else(|| JsValue::from_str("Invalid keep-unique group-key artifact payload: set is required"))?;
    let main_stat = keep_unique_parse_main_stat_variant(record.get("mainStat"));
    let faction = keep_unique_value_to_i64(record.get("faction")).unwrap_or(0);
    // Delegate to shared formatter so all group-key callers stay in lockstep.
    Ok(keep_unique_group_key_from_parts(slot, set, main_stat, faction))
}

fn keep_unique_round_three(value: f64) -> f64 {
    // Keep output precision aligned with existing UI formatting expectations.
    (value * 1000.0).round() / 1000.0
}

fn keep_unique_to_detection_artifact(candidate: &KeepUniqueWasmCandidateIn) -> KeepUniqueWasmArtifactOut {
    // Only accessories preserve faction in detection payload.
    let faction = keep_unique_normalized_faction_for_slot(candidate.artifact.slot, candidate.artifact.faction);
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
                groups.insert(KEEP_UNIQUE_COUNT_KEY_GLOBAL.to_string(), scored);
                group_order.push(KEEP_UNIQUE_COUNT_KEY_GLOBAL.to_string());
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
        }
        if deficit_group > 0 {
            // Only emit placeholders when this group is truly under-covered.
            // Zero-missing placeholders create noisy/empty rows in UI tables.
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
                rule_active: enabled && !keep_unique_is_activation_off(&activation),
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
    // Parse raw/compact candidate payloads into normalized detection candidates.
    let parsed_candidates = keep_unique_parse_candidates_payload(candidates)?;
    // Parse keep-unique rule rows and skip malformed legacy entries by design.
    let parsed_rules = keep_unique_parse_rules_payload(rules)?;
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
#[allow(clippy::too_many_arguments)]
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
    // Parse raw/compact row payloads into the normalized collect row shape.
    let rows = keep_unique_parse_collect_rows_payload(rows)?;
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
    // Parse keep-unique rule rows and skip malformed legacy entries by design.
    let parsed_rules = keep_unique_parse_rules_payload(keep_unique_rules)?;
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
