use super::*;

// Fast-path input types and conversion functions live in a dedicated submodule
// to keep this file focused on rule resolution and scoring logic.
mod fast_path_types;
// Re-export pub(crate) structs that lib.rs imports via `use safeguards::*`.
pub(crate) use fast_path_types::SafeguardWasmArtifactIn;
// Pull in internal types and conversion helpers used by the functions below.
use fast_path_types::{
    SafeguardWasmCandidateFastIn,
    SafeguardWasmCandidateIn,
    SafeguardWasmMainStatRawIn,
    SafeguardCollectRowFastIn,
    safeguard_collect_row_from_fast_payload,
    safeguard_convert_fast_artifact,
    safeguard_main_stat_from_fast_payload,
};

// Epsilon is used only for tie expansion at the score boundary.
const SAFEGUARD_SCORE_TIE_EPSILON: f64 = 1e-9;
// Placeholder samples need stable defaults when no group sample exists.
const SAFEGUARD_DEFAULT_SAMPLE_SLOT: i64 = ARTIFACT_TYPE_WEAPON;
const SAFEGUARD_DEFAULT_SAMPLE_SET: i64 = ACCESSORY_NO_SET_ID;
// Main-stat constants keep comparisons aligned with TS StatVariant encoding.
const SAFEGUARD_MAIN_ANY: i64 = STAT_VARIANT_ANY;
const SAFEGUARD_MAIN_HP_PERCENT: i64 = STAT_VARIANT_HP_PERCENT;
const SAFEGUARD_MAIN_HP_FLAT: i64 = STAT_VARIANT_HP_FLAT;
const SAFEGUARD_MAIN_ATK_PERCENT: i64 = STAT_VARIANT_ATK_PERCENT;
const SAFEGUARD_MAIN_ATK_FLAT: i64 = STAT_VARIANT_ATK_FLAT;
const SAFEGUARD_MAIN_DEF_PERCENT: i64 = STAT_VARIANT_DEF_PERCENT;
const SAFEGUARD_MAIN_DEF_FLAT: i64 = STAT_VARIANT_DEF_FLAT;
const SAFEGUARD_SLOT_RING: i64 = ARTIFACT_TYPE_RING;
const SAFEGUARD_SLOT_AMULET: i64 = ARTIFACT_TYPE_AMULET;
const SAFEGUARD_SLOT_BANNER: i64 = ARTIFACT_TYPE_BANNER;
// Shared grouped-bucket token keeps per-rule mode branch-free and centralized.
const SAFEGUARD_COUNT_KEY_GLOBAL: &str = "global";
// Equipped-location tokens are parsed once into booleans for hot match loops.
const SAFEGUARD_EQUIPPED_LOCATION_COLLECTION: &str = "collection";
const SAFEGUARD_EQUIPPED_LOCATION_VAULT: &str = "vault";
const SAFEGUARD_EQUIPPED_LOCATION_RESERVE_VAULT: &str = "reserveVault";

// Convert fast-path candidates into protection candidates with deterministic fallbacks.
fn safeguard_candidate_from_fast_payload(
    candidate: SafeguardWasmCandidateFastIn,
) -> SafeguardWasmCandidateIn {
    let (artifact, _) = safeguard_convert_fast_artifact(candidate.artifact);
    let group_key = candidate
        .group_key
        .map(|inner| inner.trim().to_string())
        .filter(|inner| !inner.is_empty())
        .unwrap_or_else(|| safeguard_group_key_from_artifact(&artifact));
    SafeguardWasmCandidateIn {
        item_key: candidate.item_key.or(artifact.id).unwrap_or(0),
        group_key,
        is_sold: candidate.is_sold,
        artifact,
    }
}

// Accessory slots keep faction while armor slots collapse to zero by design.
// This helper keeps all faction-normalization branches single-sourced.
pub(crate) fn safeguard_normalized_faction_for_slot(slot: i64, faction: i64) -> i64 {
    if safeguard_is_accessory_slot(slot) {
        faction
    } else {
        0
    }
}

// Group-key dimensions always normalize faction the same way before encoding.
// Export this so matcher and parser call sites reuse one formatting helper.
pub(crate) fn safeguard_group_key_from_parts(
    slot: i64,
    set: i64,
    main_stat: i64,
    faction_raw: i64,
) -> String {
    let normalized_faction = safeguard_normalized_faction_for_slot(slot, faction_raw);
    format!("{slot}:{set}:{main_stat}:{normalized_faction}")
}

// Group-key helper keeps fallback key generation identical to collect-core rules.
// Non-accessory slots normalize faction to zero before hashing dimensions.
fn safeguard_group_key_from_artifact(artifact: &SafeguardWasmArtifactIn) -> String {
    safeguard_group_key_from_parts(
        artifact.slot,
        artifact.set,
        artifact.main_stat,
        artifact.faction,
    )
}

// Shared row decoder centralizes collect-row normalization for both bindings.
// Every index is validated so callers get actionable error messages on failure.
pub(crate) fn safeguard_parse_collect_rows_payload(
    rows: JsValue,
) -> Result<Vec<SafeguardCollectRowIn>, JsValue> {
    // Canonical payloads decode directly without `serde_json::Value` fallback parsing.
    let fast_rows: Vec<SafeguardCollectRowFastIn> = from_js_value(rows)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard collect rows payload: {error}")))?;
    let mut parsed_rows = Vec::<SafeguardCollectRowIn>::with_capacity(fast_rows.len());
    for (idx, row) in fast_rows.into_iter().enumerate() {
        let parsed = safeguard_collect_row_from_fast_payload(row).map_err(|error| {
            JsValue::from_str(&format!("Invalid safeguard collect row at index {idx}: {error}"))
        })?;
        parsed_rows.push(parsed);
    }
    Ok(parsed_rows)
}

// Shared candidate decoder centralizes raw/compact safeguard candidate parsing.
// Candidate index is included so malformed rows are easy to locate in fixtures.
fn safeguard_parse_candidates_payload(
    candidates: JsValue,
) -> Result<Vec<SafeguardWasmCandidateIn>, JsValue> {
    // Canonical payloads decode directly into typed structs.
    let fast_candidates: Vec<SafeguardWasmCandidateFastIn> = from_js_value(candidates)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard candidates: {error}")))?;
    Ok(fast_candidates
        .into_iter()
        .map(safeguard_candidate_from_fast_payload)
        .collect::<Vec<_>>())
}

// Safeguard rule decoder expects canonical typed rows from app-side normalization.
fn safeguard_parse_rules_payload(rules: JsValue) -> Result<Vec<SafeguardWasmRuleIn>, JsValue> {
    from_js_value::<Vec<SafeguardWasmRuleIn>>(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard rules payload: {error}")))
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SafeguardWasmSetSelection {
    pub(crate) id: i64,
    #[serde(default)]
    pub(crate) excluded: bool,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SafeguardWasmCombination {
    #[serde(default)]
    pub(crate) slots: Vec<i64>,
    #[serde(default)]
    pub(crate) sets: Vec<SafeguardWasmSetSelection>,
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

// Decode optional numeric-keyed weight maps once at deserialize time.
// Invalid keys are skipped so legacy payloads stay non-fatal.
fn safeguard_deserialize_optional_i64_weight_map<'de, D>(
    deserializer: D,
) -> Result<Option<HashMap<i64, f64>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let raw = Option::<HashMap<String, f64>>::deserialize(deserializer)?;
    Ok(raw.map(|entries| {
        entries
            .into_iter()
            .filter_map(|(key, value)| key.parse::<i64>().ok().map(|variant| (variant, value)))
            .collect::<HashMap<i64, f64>>()
    }))
}

#[derive(Debug, Deserialize, Serialize, Clone, Copy, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SafeguardWasmCountMode {
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
pub(crate) struct SafeguardWasmRuleIn {
    #[serde(default)]
    pub(crate) id: Option<String>,
    #[serde(default)]
    pub(crate) name: Option<String>,
    #[serde(default)]
    pub(crate) combination: Option<SafeguardWasmCombination>,
    #[serde(default)]
    pub(crate) required_count: Option<i64>,
    #[serde(default)]
    pub(crate) activation: Option<String>,
    #[serde(default)]
    pub(crate) count_mode: Option<SafeguardWasmCountMode>,
    #[serde(default)]
    pub(crate) ignore_previous_safeguards: Option<bool>,
    #[serde(default)]
    pub(crate) ignore_equipped_in_collection: Option<bool>,
    #[serde(default)]
    pub(crate) ignore_equipped_in_vault: Option<bool>,
    #[serde(default)]
    pub(crate) substats: Option<Vec<i64>>,
    #[serde(default)]
    pub(crate) substat_match: Option<String>,
    #[serde(default, deserialize_with = "safeguard_deserialize_optional_i64_weight_map")]
    pub(crate) substat_weights: Option<HashMap<i64, f64>>,
    // Pre-computed quality floor passed from TypeScript; None = disabled.
    // Candidates scoring below this threshold are rejected (collection-equipped exempt).
    #[serde(default)]
    pub(crate) equipped_floor_score: Option<f64>,
    // Raw percentile from the TS SafeguardRule; passed through the metaset resolver
    // unchanged so TS can compute equippedFloorScore after resolution.
    #[serde(default)]
    pub(crate) beat_equipped_percentile: Option<f64>,
}

// Resolved safeguard rule payload returned after metaset expansion in lib.rs.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SafeguardWasmResolvedRuleOut {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) combination: SafeguardWasmCombination,
    pub(crate) required_count: i64,
    pub(crate) activation: String,
    pub(crate) count_mode: SafeguardWasmCountMode,
    pub(crate) ignore_previous_safeguards: bool,
    pub(crate) ignore_equipped_in_collection: bool,
    pub(crate) ignore_equipped_in_vault: bool,
    pub(crate) substats: Vec<i64>,
    pub(crate) substat_match: String,
    pub(crate) substat_weights: HashMap<String, f64>,
    // Quality floor passed through unchanged so the TS pipeline can pre-compute
    // equippedFloorScore after metaset resolution. None = disabled.
    pub(crate) beat_equipped_percentile: Option<f64>,
}

// Canonical metaset-id list is sorted and deduped for deterministic hashes.
fn safeguard_sort_unique_meta_set_ids(values: Vec<String>) -> Vec<String> {
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
// normalized safeguard payloads stay aligned across TS and Rust paths.
fn safeguard_substat_priority(variant: i64) -> i64 {
    // Resolve from generated constants so TS and Rust share one priority table.
    // Unknown variants sink to the end via i64::MAX fallback.
    shared_order_index(&STAT_VARIANTS_PRIORITY, variant).unwrap_or(i64::MAX)
}

// Canonical substat list is deduped and sorted by safeguard UI priority.
fn safeguard_sort_unique_substats(values: Vec<i64>) -> Vec<i64> {
    let mut seen = HashSet::<i64>::new();
    let mut deduped = Vec::<i64>::new();
    for value in values {
        if !seen.insert(value) {
            continue;
        }
        deduped.push(value);
    }
    deduped.sort_by(|left, right| {
        let left_priority = safeguard_substat_priority(*left);
        let right_priority = safeguard_substat_priority(*right);
        if left_priority != right_priority {
            return left_priority.cmp(&right_priority);
        }
        left.cmp(right)
    });
    deduped
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SafeguardWasmExpectedSampleIn {
    slot: i64,
    set: i64,
    faction: i64,
    main_stat: i64,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SafeguardWasmExpectedGroupIn {
    key: String,
    sample: SafeguardWasmExpectedSampleIn,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SafeguardWasmExpectedGroupDomainIn {
    slot_order: Vec<i64>,
    accessory_compatible_set_ids: Vec<i64>,
    armor_compatible_set_ids: Vec<i64>,
    allowed_main_by_slot: HashMap<String, Vec<i64>>,
    all_faction_ids: Vec<i64>,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct SafeguardWasmExpectedGroupsPayloadIn {
    #[serde(default)]
    expected_groups_by_rule_id: HashMap<String, Vec<SafeguardWasmExpectedGroupIn>>,
    expected_group_domain: Option<SafeguardWasmExpectedGroupDomainIn>,
}

// Normalize safeguard expected-group domain arrays/maps in Rust so sorting,
// de-duplication, and slot ordering remain single-sourced with matcher logic.
#[wasm_bindgen]
pub fn normalize_safeguard_expected_group_domain_value(payload: JsValue) -> Result<JsValue, JsValue> {
    let parsed: SafeguardWasmExpectedGroupDomainIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard expected-group domain payload: {error}")))?;

    // Slot order uses domain helper so fallback ordering stays consistent.
    let slot_order = safeguard_domain_slot_order(&parsed);
    // Set/faction arrays collapse to sorted unique integer domains.
    let accessory_compatible_set_ids = safeguard_sorted_unique_i64(&parsed.accessory_compatible_set_ids);
    let armor_compatible_set_ids = safeguard_sorted_unique_i64(&parsed.armor_compatible_set_ids);
    let all_faction_ids = safeguard_sorted_unique_i64(&parsed.all_faction_ids)
        .into_iter()
        .filter(|value| *value > 0)
        .collect::<Vec<_>>();
    // Per-slot mains are normalized with the same sorted/unique helper.
    let mut allowed_main_by_slot = HashMap::<String, Vec<i64>>::new();
    for (slot_key, values) in &parsed.allowed_main_by_slot {
        allowed_main_by_slot.insert(slot_key.to_string(), safeguard_sorted_unique_i64(values));
    }

    let normalized = SafeguardWasmExpectedGroupDomainIn {
        slot_order,
        accessory_compatible_set_ids,
        armor_compatible_set_ids,
        allowed_main_by_slot,
        all_faction_ids,
    };

    // Use serialize_maps_as_objects so allowed_main_by_slot (HashMap<String, Vec<i64>>)
    // serializes as a plain JS object rather than a JS Map instance.
    normalized
        .serialize(&serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true))
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard expected-group domain: {error}")))
}

// Metaset payload for in-wasm safeguard set expansion.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SafeguardWasmMetasetIn {
    pub(crate) id: String,
    #[serde(default)]
    pub(crate) sets: Vec<i64>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SafeguardWasmSubstatOut {
    variant: i64,
    is_flat: bool,
    value: f64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SafeguardWasmArtifactOut {
    item_key: i64,
    slot: i64,
    set: i64,
    rank: i64,
    rarity: i64,
    level: i64,
    exact_level: Option<i64>,
    faction: i64,
    main_stat: i64,
    substats: Vec<SafeguardWasmSubstatOut>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SafeguardWasmPlaceholderOut {
    combination: SafeguardWasmCombination,
    missing: i64,
    reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    substat_variants: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SafeguardWasmEntryOut {
    hash: String,
    combination: SafeguardWasmCombination,
    rule_id: Option<String>,
    rule_activation: String,
    count_mode: SafeguardWasmCountMode,
    per_group_required_count: i64,
    groups_tracked: i64,
    required_count: i64,
    current_count: i64,
    projected_count: i64,
    deficit: i64,
    covered_by_existing: bool,
    item_keys: Vec<i64>,
    artifacts: Vec<SafeguardWasmArtifactOut>,
    placeholders: Vec<SafeguardWasmPlaceholderOut>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SafeguardWasmSnapshotOut {
    scanned_at: f64,
    entries: Vec<SafeguardWasmEntryOut>,
}

#[derive(Debug, Clone)]
struct SafeguardWasmPreparedRule {
    id: String,
    hash: String,
    combination: SafeguardWasmCombination,
    required_per_group: i64,
    activation: String,
    rule_active: bool,
    count_mode: SafeguardWasmCountMode,
    ignore_previous_safeguards: bool,
    ignore_equipped_in_collection: bool,
    ignore_equipped_in_vault: bool,
    // Pre-computed quality floor score from TypeScript; None = disabled.
    equipped_floor_score: Option<f64>,
    selected_substats: Vec<i64>,
    substat_match: String,
    weights: HashMap<i64, f64>,
    set_includes: HashSet<i64>,
    set_excludes: HashSet<i64>,
    expected_groups: Vec<SafeguardWasmExpectedGroupIn>,
}

#[derive(Debug, Clone)]
struct SafeguardWasmScoredCandidate {
    candidate_idx: usize,
    score: f64,
}

#[derive(Debug, Clone)]
struct SafeguardWasmGroupSample {
    slot: i64,
    set: i64,
    faction: i64,
    main_stat: i64,
}

#[derive(Debug, Clone)]
struct SafeguardWasmExpectedGroupResolved {
    key: SafeguardCountKey,
    sample: SafeguardWasmGroupSample,
}

#[derive(Debug, Clone)]
struct SafeguardWasmGroupBucket {
    kept: Vec<usize>,
    sold: Vec<usize>,
    sample: Option<SafeguardWasmGroupSample>,
}

// Count grouping keys stay typed internally so grouped scans do not allocate
// repeated `slot:x|set:y|...` strings in hot loops.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum SafeguardCountKey {
    Global,
    Scoped {
        slot: Option<i64>,
        set: Option<i64>,
        faction: Option<i64>,
        main_stat: Option<i64>,
    },
}

#[derive(Debug, Clone)]
struct SafeguardWasmEntryEvalOut {
    entry: SafeguardWasmEntryOut,
    selected_candidate_indices: Vec<usize>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
struct SafeguardWasmCountKeyArtifactIn {
    slot: i64,
    set: i64,
    faction: i64,
    main_stat: i64,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SafeguardWasmItemKeyPreviewExtrasIn {
    #[serde(default)]
    id: Option<i64>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SafeguardWasmItemKeyTesterItemIn {
    #[serde(default)]
    item_id: Option<i64>,
    #[serde(default)]
    preview_extras: Option<SafeguardWasmItemKeyPreviewExtrasIn>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SafeguardWasmItemKeyArtifactIn {
    #[serde(default)]
    id: Option<i64>,
    #[serde(default)]
    gear_inspector_item: Option<SafeguardWasmItemKeyTesterItemIn>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SafeguardWasmGroupKeyArtifactIn {
    slot: i64,
    set: i64,
    #[serde(default)]
    faction: i64,
    #[serde(default)]
    main_stat: Option<SafeguardWasmMainStatRawIn>,
}

fn safeguard_is_accessory_slot(slot: i64) -> bool {
    // Accessories are the only slots where faction grouping applies.
    // Artifact slots always collapse to faction 0 in safeguard logic.
    slot == SAFEGUARD_SLOT_RING || slot == SAFEGUARD_SLOT_AMULET || slot == SAFEGUARD_SLOT_BANNER
}

fn safeguard_sanitize_count_mode(mode: SafeguardWasmCountMode) -> SafeguardWasmCountMode {
    // `per_rule` is exclusive: when set, all per-dimension toggles must be off.
    if mode.per_rule {
        return SafeguardWasmCountMode {
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
        return SafeguardWasmCountMode {
            per_rule: true,
            per_set: false,
            per_faction: false,
            per_main_stat: false,
            per_slot: false,
        };
    }
    // Grouped mode keeps only the explicit toggles and clears per_rule.
    SafeguardWasmCountMode {
        per_rule: false,
        per_set: mode.per_set,
        per_faction: mode.per_faction,
        per_main_stat: mode.per_main_stat,
        per_slot: mode.per_slot,
    }
}

// Safeguard UI defaults group by set+faction+main stat (slot disabled).
fn safeguard_default_count_mode() -> SafeguardWasmCountMode {
    SafeguardWasmCountMode {
        per_rule: SAFEGUARD_DEFAULT_COUNT_MODE_PER_RULE,
        per_set: SAFEGUARD_DEFAULT_COUNT_MODE_PER_SET,
        per_faction: SAFEGUARD_DEFAULT_COUNT_MODE_PER_FACTION,
        per_main_stat: SAFEGUARD_DEFAULT_COUNT_MODE_PER_MAIN_STAT,
        per_slot: SAFEGUARD_DEFAULT_COUNT_MODE_PER_SLOT,
    }
}

// Resolve optional count-mode payloads into the canonical sanitized shape.
pub(crate) fn safeguard_resolve_count_mode(
    mode: Option<SafeguardWasmCountMode>,
) -> SafeguardWasmCountMode {
    let seeded = mode.unwrap_or_else(safeguard_default_count_mode);
    safeguard_sanitize_count_mode(seeded)
}

pub(crate) fn safeguard_normalize_substat_match(raw: &str) -> String {
    // Normalize whitespace/casing so persisted files and UI payloads match.
    let trimmed = raw.trim();
    // Unknown tokens collapse to `any` to stay backward compatible.
    if trimmed.eq_ignore_ascii_case(SAFEGUARD_SUBSTAT_ALL) {
        return SAFEGUARD_SUBSTAT_ALL.to_string();
    }
    if trimmed.eq_ignore_ascii_case(SAFEGUARD_SUBSTAT_PER_SUBSTAT) {
        return SAFEGUARD_SUBSTAT_PER_SUBSTAT.to_string();
    }
    SAFEGUARD_SUBSTAT_ANY.to_string()
}

fn safeguard_normalize_weight(raw: f64) -> f64 {
    // Non-finite weights are replaced with the canonical default.
    if !raw.is_finite() {
        return SAFEGUARD_WEIGHT_DEFAULT;
    }
    // Clamp first, then snap to configured step size.
    let clamped = raw.clamp(SAFEGUARD_WEIGHT_MIN, SAFEGUARD_WEIGHT_MAX);
    let stepped = (clamped / SAFEGUARD_WEIGHT_STEP).round() * SAFEGUARD_WEIGHT_STEP;
    // Round again to avoid binary float artifacts in serialized payloads.
    (stepped * 100.0).round() / 100.0
}

fn safeguard_substat_max6_by_variant(variant: i64) -> f64 {
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

fn safeguard_normalize_substat_value(variant: i64, value: f64) -> f64 {
    // Normalize every substat by the canonical 6-star max roll total.
    let max = safeguard_substat_max6_by_variant(variant);
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

fn safeguard_percent_to_flat_main(variant: i64) -> Option<i64> {
    // Map percent mains to their flat counterpart for tie-priority logic.
    // Non HP/ATK/DEF mains have no flat companion and return None.
    match variant {
        SAFEGUARD_MAIN_HP_PERCENT => Some(SAFEGUARD_MAIN_HP_FLAT),
        SAFEGUARD_MAIN_ATK_PERCENT => Some(SAFEGUARD_MAIN_ATK_FLAT),
        SAFEGUARD_MAIN_DEF_PERCENT => Some(SAFEGUARD_MAIN_DEF_FLAT),
        _ => None,
    }
}

pub(crate) fn safeguard_normalize_set_selections(
    values: &[SafeguardWasmSetSelection],
) -> Vec<SafeguardWasmSetSelection> {
    // Use map-by-id so duplicates collapse deterministically.
    let mut by_id = HashMap::<i64, SafeguardWasmSetSelection>::new();
    for entry in values {
        // Exclusions always win over includes for the same set id.
        if entry.excluded {
            by_id.insert(
                entry.id,
                SafeguardWasmSetSelection {
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
            SafeguardWasmSetSelection {
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

fn safeguard_split_set_selections(values: &[SafeguardWasmSetSelection]) -> (HashSet<i64>, HashSet<i64>) {
    // Normalize first so duplicates/exclusions are already resolved.
    let normalized = safeguard_normalize_set_selections(values);
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

fn safeguard_sorted_unique_i64(values: &[i64]) -> Vec<i64> {
    // Reuse the crate-wide helper so every module shares one sort+dedupe rule.
    sorted_unique_i64(values)
}

// Slot sorting mirrors TS compareArtifactTypes (preferred order + numeric fallback).
fn safeguard_sort_unique_slots(values: &[i64]) -> Vec<i64> {
    let mut unique = values.to_vec();
    sort_artifact_types_in_place(&mut unique);
    unique.dedup();
    unique
}

// Main-stat ordering mirrors TS compareVariants/PREFERRED_STAT_ORDER.
fn safeguard_main_stat_priority(variant: i64) -> i64 {
    // Resolve from generated constants so TS and Rust share one priority table.
    // Unknown variants sink to the end via i64::MAX fallback.
    shared_order_index(&PREFERRED_STAT_ORDER, variant).unwrap_or(i64::MAX)
}

// Main-stat lists are deduped and sorted with compareVariants parity.
fn safeguard_sort_unique_main_stats(values: &[i64]) -> Vec<i64> {
    let mut deduped = values.to_vec();
    deduped.sort_unstable();
    deduped.dedup();
    deduped.sort_by(|left, right| {
        let left_priority = safeguard_main_stat_priority(*left);
        let right_priority = safeguard_main_stat_priority(*right);
        if left_priority != right_priority {
            return left_priority.cmp(&right_priority);
        }
        left.cmp(right)
    });
    deduped
}

fn safeguard_domain_slot_order(domain: &SafeguardWasmExpectedGroupDomainIn) -> Vec<i64> {
    // Domain-provided slot order is authoritative; fallback keeps canonical order.
    if domain.slot_order.is_empty() {
        // Reuse generated slot order constants instead of duplicating literals.
        return PREFERRED_ARTIFACT_TYPE_ORDER.to_vec();
    }
    safeguard_sort_unique_slots(&domain.slot_order)
}

fn safeguard_domain_allowed_mains_for_slot(
    domain: &SafeguardWasmExpectedGroupDomainIn,
    slot: i64,
) -> Vec<i64> {
    // Object keys cross the JS/WASM boundary as strings, so index by string slot id.
    let key = slot.to_string();
    let values = domain.allowed_main_by_slot.get(&key).cloned().unwrap_or_default();
    safeguard_sorted_unique_i64(&values)
}

fn safeguard_resolve_slot_candidates(
    combination: &SafeguardWasmCombination,
    domain: &SafeguardWasmExpectedGroupDomainIn,
) -> Vec<i64> {
    // Explicit slots preserve user-selected ordering; otherwise use preferred slot order.
    let base_slots = if combination.slots.is_empty() {
        safeguard_domain_slot_order(domain)
    } else {
        combination.slots.clone()
    };
    // Slot-level filtering checks include/exclude sets once per call.
    let (set_includes, _) = safeguard_split_set_selections(&combination.sets);
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
        let accessory_slot = safeguard_is_accessory_slot(slot);
        // Accessory requirement drops artifact slots immediately.
        if requires_accessory && !accessory_slot {
            continue;
        }
        // Main-stat selections require at least one compatible main for this slot.
        if !combination.main_stats.is_empty() {
            let allowed_mains = safeguard_domain_allowed_mains_for_slot(domain, slot);
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

fn safeguard_resolve_set_candidates_for_slot(
    combination: &SafeguardWasmCombination,
    slot: i64,
    domain: &SafeguardWasmExpectedGroupDomainIn,
) -> Vec<i64> {
    let accessory_slot = safeguard_is_accessory_slot(slot);
    // Includes/excludes are canonicalized once per slot resolution.
    let (set_includes, set_excludes) = safeguard_split_set_selections(&combination.sets);
    let has_set_includes = !set_includes.is_empty();
    let allowed_pool = if accessory_slot {
        safeguard_sorted_unique_i64(&domain.accessory_compatible_set_ids)
    } else {
        safeguard_sorted_unique_i64(&domain.armor_compatible_set_ids)
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

fn safeguard_resolve_set_candidates_for_slots(
    combination: &SafeguardWasmCombination,
    slots: &[i64],
    domain: &SafeguardWasmExpectedGroupDomainIn,
) -> Vec<i64> {
    // Union set ids across all candidate slots while keeping ascending order.
    let mut merged = HashSet::<i64>::new();
    for slot in slots {
        for set_id in safeguard_resolve_set_candidates_for_slot(combination, *slot, domain) {
            merged.insert(set_id);
        }
    }
    let mut values = merged.into_iter().collect::<Vec<_>>();
    values.sort_unstable();
    values
}

fn safeguard_resolve_main_stat_candidates_for_slot(
    combination: &SafeguardWasmCombination,
    slot: i64,
    domain: &SafeguardWasmExpectedGroupDomainIn,
) -> Vec<i64> {
    let allowed = safeguard_domain_allowed_mains_for_slot(domain, slot);
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

fn safeguard_resolve_main_stat_candidates_for_slots(
    combination: &SafeguardWasmCombination,
    slots: &[i64],
    domain: &SafeguardWasmExpectedGroupDomainIn,
) -> Vec<i64> {
    // Union main-stat variants across the slot candidates.
    let mut merged = HashSet::<i64>::new();
    for slot in slots {
        for variant in safeguard_resolve_main_stat_candidates_for_slot(combination, *slot, domain) {
            merged.insert(variant);
        }
    }
    let mut values = merged.into_iter().collect::<Vec<_>>();
    values.sort_unstable();
    values
}

fn safeguard_resolve_faction_candidates_for_slot(
    combination: &SafeguardWasmCombination,
    slot: i64,
    domain: &SafeguardWasmExpectedGroupDomainIn,
) -> Vec<i64> {
    let mut selection = combination.factions.to_vec();
    selection.sort_unstable();
    selection.dedup();
    let has_selection = !selection.is_empty();
    if !safeguard_is_accessory_slot(slot) {
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
    safeguard_sorted_unique_i64(&domain.all_faction_ids)
}

fn safeguard_resolve_slot_samples(slots: &[i64], count_mode: SafeguardWasmCountMode) -> Vec<i64> {
    // Per-slot mode keeps every slot candidate.
    if count_mode.per_slot {
        return slots.to_vec();
    }
    // Without faction grouping, one slot sample is enough.
    if !count_mode.per_faction {
        return slots.first().copied().map(|slot| vec![slot]).unwrap_or_default();
    }
    // Faction grouping needs one accessory and one armor sample when available.
    let accessory = slots.iter().copied().find(|slot| safeguard_is_accessory_slot(*slot));
    let armor = slots.iter().copied().find(|slot| !safeguard_is_accessory_slot(*slot));
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

fn safeguard_build_expected_groups_for_rule(
    combination: &SafeguardWasmCombination,
    count_mode: SafeguardWasmCountMode,
    domain: &SafeguardWasmExpectedGroupDomainIn,
) -> Vec<SafeguardWasmExpectedGroupIn> {
    // Per-rule mode does not split by any count-key dimension.
    if count_mode.per_rule {
        return Vec::new();
    }
    let slot_candidates = safeguard_resolve_slot_candidates(combination, domain);
    if slot_candidates.is_empty() {
        return Vec::new();
    }
    let slot_samples = safeguard_resolve_slot_samples(&slot_candidates, count_mode);
    let union_sets = if count_mode.per_set && !count_mode.per_slot {
        safeguard_resolve_set_candidates_for_slots(combination, &slot_candidates, domain)
    } else {
        Vec::new()
    };
    let union_main_stats = if count_mode.per_main_stat && !count_mode.per_slot {
        safeguard_resolve_main_stat_candidates_for_slots(combination, &slot_candidates, domain)
    } else {
        Vec::new()
    };
    // Preserve insertion order while deduping by count key.
    let mut seen = HashSet::<SafeguardCountKey>::new();
    let mut expected = Vec::<SafeguardWasmExpectedGroupIn>::new();
    for slot in slot_samples {
        let set_candidates = if count_mode.per_set {
            if count_mode.per_slot {
                safeguard_resolve_set_candidates_for_slot(combination, slot, domain)
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
            safeguard_resolve_faction_candidates_for_slot(combination, slot, domain)
        } else {
            vec![0]
        };
        if count_mode.per_faction && faction_candidates.is_empty() {
            continue;
        }
        let main_stat_candidates = if count_mode.per_main_stat {
            if count_mode.per_slot {
                safeguard_resolve_main_stat_candidates_for_slot(combination, slot, domain)
            } else {
                union_main_stats.clone()
            }
        } else {
            vec![SAFEGUARD_MAIN_ANY]
        };
        if count_mode.per_main_stat && main_stat_candidates.is_empty() {
            continue;
        }
        // Cartesian product across the active grouped dimensions.
        for set_id in &set_candidates {
            for faction in &faction_candidates {
                for main_stat in &main_stat_candidates {
                    let key = safeguard_count_key_from_parts(
                        slot,
                        *set_id,
                        *faction,
                        *main_stat,
                        count_mode,
                    );
                    if !seen.insert(key.clone()) {
                        continue;
                    }
                    expected.push(SafeguardWasmExpectedGroupIn {
                        key: safeguard_count_key_to_string(&key),
                        sample: SafeguardWasmExpectedSampleIn {
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

fn safeguard_canonicalize_number_list(values: &[i64]) -> String {
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

fn safeguard_canonicalize_set_entries(values: &[SafeguardWasmSetSelection]) -> String {
    // Canonicalization must respect include/exclude precedence rules.
    let normalized = safeguard_normalize_set_selections(values);
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

fn safeguard_canonicalize_string_list(values: &[String]) -> String {
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

pub(crate) fn safeguard_hash_combination(combination: &SafeguardWasmCombination) -> String {
    // Hash token order mirrors TS combination fingerprint construction.
    [
        safeguard_canonicalize_number_list(&combination.slots),
        safeguard_canonicalize_set_entries(&combination.sets),
        safeguard_canonicalize_string_list(&combination.meta_set_ids),
        safeguard_canonicalize_number_list(&combination.ranks),
        safeguard_canonicalize_number_list(&combination.rarities),
        safeguard_canonicalize_number_list(&combination.main_stats),
        safeguard_canonicalize_number_list(&combination.factions),
    ]
    .join("|")
}

// Expose combination hashing so TS reuses Rust canonical token construction.
#[wasm_bindgen]
pub fn hash_safeguard_combination_value(combination: JsValue) -> Result<String, JsValue> {
    let parsed: SafeguardWasmCombination = from_js_value(combination)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard combination hash payload: {error}")))?;
    Ok(safeguard_hash_combination(&parsed))
}

// Expose substat sorting so TS can reuse Rust priority + dedupe semantics.
#[wasm_bindgen]
pub fn sort_safeguard_substats_value(values: JsValue) -> Result<JsValue, JsValue> {
    let parsed: Vec<i64> = from_js_value(values)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard substats payload: {error}")))?;
    let sorted = safeguard_sort_unique_substats(parsed);
    to_js_value(&sorted)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard sorted substats: {error}")))
}

// Expose full-combination sorting so TS can reuse Rust canonical ordering.
#[wasm_bindgen]
pub fn sort_safeguard_combination_value(combination: JsValue) -> Result<JsValue, JsValue> {
    let parsed: SafeguardWasmCombination = from_js_value(combination)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard combination payload: {error}")))?;
    let SafeguardWasmCombination {
        slots,
        sets,
        meta_set_ids,
        ranks,
        rarities,
        main_stats,
        factions,
    } = parsed;
    let sorted = SafeguardWasmCombination {
        slots: safeguard_sort_unique_slots(&slots),
        sets: safeguard_normalize_set_selections(&sets),
        meta_set_ids: safeguard_sort_unique_meta_set_ids(meta_set_ids),
        ranks: safeguard_sorted_unique_i64(&ranks),
        rarities: safeguard_sorted_unique_i64(&rarities),
        main_stats: safeguard_sort_unique_main_stats(&main_stats),
        factions: safeguard_sorted_unique_i64(&factions),
    };
    to_js_value(&sorted)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard sorted combination: {error}")))
}

// Keep rank/rarity clamp behavior aligned with merge.ts helper logic.
fn safeguard_clamp_rank_or_rarity_value(value: i64) -> i64 {
    value.clamp(RANK_VALUE_MIN, RANK_VALUE_MAX)
}

// Keep rarity code mapping aligned with merge.ts::rarityValueToCode.
fn safeguard_rarity_value_to_code(value: i64) -> i64 {
    match safeguard_clamp_rank_or_rarity_value(value) {
        1 => RARITY_CODE_COMMON,
        2 => RARITY_CODE_UNCOMMON,
        3 => RARITY_CODE_RARE,
        4 => RARITY_CODE_EPIC,
        5 => RARITY_CODE_LEGENDARY,
        _ => RARITY_CODE_MYTHICAL,
    }
}

// Keep level-coverage expansion aligned with merge.ts::coverageLevelsForArtifact.
fn safeguard_coverage_levels_for_artifact(artifact: &SafeguardWasmArtifactOut) -> Vec<i64> {
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
fn safeguard_variant_to_main(variant: i64) -> (i64, i64) {
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
pub(crate) fn safeguard_variant_to_sub(variant: i64) -> (i64, bool) {
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
pub(crate) fn safeguard_clone_any_substats() -> Vec<RuleSubRaw> {
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

fn safeguard_build_substats_for_artifact(substats: &[SafeguardWasmSubstatOut]) -> Vec<RuleSubRaw> {
    let mut cloned = safeguard_clone_any_substats();
    let mut idx = 0usize;
    for sub in substats {
        if idx >= HSF_SUBSTAT_SLOT_COUNT {
            break;
        }
        if sub.variant == STAT_VARIANT_ANY {
            continue;
        }
        let (id, is_flat) = safeguard_variant_to_sub(sub.variant);
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

fn safeguard_build_placeholder_substats(variant: i64) -> Vec<RuleSubRaw> {
    let mut cloned = safeguard_clone_any_substats();
    if variant == STAT_VARIANT_ANY {
        return cloned;
    }
    let (id, is_flat) = safeguard_variant_to_sub(variant);
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

fn safeguard_build_placeholder_substats_group(variants: &[i64]) -> Vec<RuleSubRaw> {
    let mut cloned = safeguard_clone_any_substats();
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
        let (id, is_flat) = safeguard_variant_to_sub(*variant);
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

fn safeguard_normalize_rank_selection(values: &[i64]) -> Vec<Option<i64>> {
    let normalized = safeguard_sorted_unique_i64(values);
    if normalized.is_empty() {
        return vec![None];
    }
    normalized
        .into_iter()
        .map(|value| Some(safeguard_clamp_rank_or_rarity_value(value)))
        .collect::<Vec<_>>()
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct SafeguardCanonicalSubstatKey {
    id: i64,
    is_flat: bool,
    not_available: bool,
    condition: String,
    value_bits: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct SafeguardCanonicalRuleKey {
    keep: bool,
    use_flag: bool,
    rank: i64,
    level: i64,
    faction: i64,
    main_stat_id: i64,
    main_stat_f_bits: u64,
    artifact_types: Vec<i64>,
    artifact_sets: Vec<i64>,
    substats: Vec<SafeguardCanonicalSubstatKey>,
}

fn safeguard_normalize_f64_bits(value: f64, fallback: f64) -> u64 {
    let finite = if value.is_finite() { value } else { fallback };
    // Normalize -0.0 to +0.0 so equivalent numeric values hash identically.
    if finite == 0.0 {
        0.0f64.to_bits()
    } else {
        finite.to_bits()
    }
}

// Canonical key mirrors merge.ts::canonicalRuleKey for placeholder dedupe.
fn safeguard_canonical_rule_key(rule: &RuleRaw) -> SafeguardCanonicalRuleKey {
    let artifact_types = normalize_i64_array(rule.ArtifactType.as_ref());
    let artifact_sets = normalize_i64_array(rule.ArtifactSet.as_ref());
    let substats = rule
        .Substats
        .as_ref()
        .map(|rows| {
            rows.iter()
                .map(|sub| SafeguardCanonicalSubstatKey {
                    id: sub.ID.unwrap_or(STAT_ID_ANY),
                    is_flat: matches!(sub.IsFlat.as_ref(), Some(serde_json::Value::Bool(true))),
                    not_available: sub.NotAvailable.unwrap_or(false),
                    condition: sub.Condition.clone().unwrap_or_default(),
                    value_bits: safeguard_normalize_f64_bits(sub.Value.unwrap_or(0.0), 0.0),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    SafeguardCanonicalRuleKey {
        keep: rule.Keep.unwrap_or(false),
        use_flag: rule.Use.unwrap_or(true),
        rank: rule.Rank.unwrap_or(0),
        level: rule.LVLForCheck.unwrap_or(0),
        faction: rule.Faction.unwrap_or(0),
        main_stat_id: rule.MainStatID.unwrap_or(STAT_ID_ANY),
        main_stat_f_bits: safeguard_normalize_f64_bits(
            numberish_or_default(rule.MainStatF.as_ref(), 1.0),
            1.0,
        ),
        artifact_types,
        artifact_sets,
        substats,
    }
}

fn safeguard_trim_name(name: &str) -> Option<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn safeguard_build_placeholder_base_rules(
    combination: &SafeguardWasmCombination,
    recipe_id: i64,
    normalized_name: Option<&str>,
) -> Vec<RuleRaw> {
    let slot_values = safeguard_sorted_unique_i64(&combination.slots);
    let (set_includes, _) = safeguard_split_set_selections(&combination.sets);
    let mut set_values = set_includes.into_iter().collect::<Vec<_>>();
    set_values.sort_unstable();
    let faction_values = safeguard_sorted_unique_i64(&combination.factions);
    let rank_options = safeguard_normalize_rank_selection(&combination.ranks);
    let rarity_options = safeguard_normalize_rank_selection(&combination.rarities);
    let main_options = safeguard_sorted_unique_i64(&combination.main_stats);
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
    let mut seen = HashSet::<SafeguardCanonicalRuleKey>::new();
    for rank_variant in &rank_options {
        for rarity_variant in &rarity_options {
            for faction in &faction_options {
                for main_variant in &main_variants {
                    let (main_id, main_f) = safeguard_variant_to_main(*main_variant);
                    let safeguard_rule = RuleRaw {
                        RecipeID: Some(recipe_id),
                        RecipeName: normalized_name.map(|value| value.to_string()),
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
                            Some(value) => safeguard_rarity_value_to_code(*value),
                            None => RARITY_CODE_ANY,
                        }),
                        MainStatID: Some(main_id),
                        MainStatF: Some(serde_json::Value::from(main_f)),
                        LVLForCheck: Some(LEVEL_ANY_SENTINEL),
                        Faction: Some(*faction),
                        Substats: Some(safeguard_clone_any_substats()),
                        source: Some(RULE_SOURCE_SAFEGUARDS.to_string()),
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
                    };
                    let canonical = safeguard_canonical_rule_key(&safeguard_rule);
                    if !seen.insert(canonical) {
                        continue;
                    }
                    rules.push(safeguard_rule);
                }
            }
        }
    }
    rules
}

fn safeguard_apply_rule_meta(
    safeguard_rule: &mut RuleRaw,
    rule_id: &str,
    rule_ordinal: i64,
    hash: &str,
    entry: &SafeguardWasmEntryOut,
    scanned_at: Option<f64>,
) {
    safeguard_rule.safeguard_rule_id = Some(rule_id.to_string());
    safeguard_rule.safeguard_rule_ordinal = Some(rule_ordinal);
    safeguard_rule.safeguard_hash = Some(hash.to_string());
    safeguard_rule.safeguard_required = Some(entry.required_count);
    safeguard_rule.safeguard_projected = Some(entry.projected_count);
    safeguard_rule.safeguard_deficit = Some(entry.deficit);
    safeguard_rule.safeguard_scan_ms = scanned_at;
}

fn safeguard_build_placeholder_rules(
    rule: &SafeguardWasmRuleIn,
    entry: &SafeguardWasmEntryOut,
    recipe_id: i64,
    safeguard_rule_ordinal: i64,
    scanned_at: Option<f64>,
) -> Vec<RuleRaw> {
    let placeholders = &entry.placeholders;
    if placeholders.is_empty() {
        return Vec::new();
    }
    let normalized_substat_match = safeguard_normalize_substat_match(
        rule.substat_match.as_deref().unwrap_or(""),
    );
    let selected_substats = rule.substats.clone().unwrap_or_default();
    let has_substat_filter = !selected_substats.is_empty();
    let substat_match = if has_substat_filter {
        normalized_substat_match
    } else {
        SAFEGUARD_SUBSTAT_ANY.to_string()
    };
    let normalized_name = safeguard_trim_name(rule.name.as_deref().unwrap_or(""));
    let normalized_rule_id = rule.id.as_deref().unwrap_or("");
    let mut rules = Vec::<RuleRaw>::new();
    for placeholder in placeholders {
        if placeholder.missing <= 0 {
            continue;
        }
        let combination = placeholder
            .combination
            .clone();
        let hash = safeguard_hash_combination(&combination);
        let base_rules = safeguard_build_placeholder_base_rules(
            &combination,
            recipe_id,
            normalized_name.as_deref(),
        );
        let placeholder_substats = if substat_match == SAFEGUARD_SUBSTAT_PER_SUBSTAT
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
                if substat_match == SAFEGUARD_SUBSTAT_ALL {
                    let mut substat_rule = base_rule.clone();
                    substat_rule.Substats = Some(safeguard_build_placeholder_substats_group(
                        &placeholder_substats,
                    ));
                    safeguard_apply_rule_meta(
                        &mut substat_rule,
                        normalized_rule_id,
                        safeguard_rule_ordinal,
                        &hash,
                        entry,
                        scanned_at,
                    );
                    substat_rule.safeguard_placeholder = Some(true);
                    substat_rule.safeguard_placeholder_missing = Some(placeholder.missing);
                    rules.push(substat_rule);
                } else {
                    for variant in &placeholder_substats {
                        let mut substat_rule = base_rule.clone();
                        substat_rule.Substats = Some(safeguard_build_placeholder_substats(*variant));
                        safeguard_apply_rule_meta(
                            &mut substat_rule,
                            normalized_rule_id,
                            safeguard_rule_ordinal,
                            &hash,
                            entry,
                            scanned_at,
                        );
                        substat_rule.safeguard_placeholder = Some(true);
                        substat_rule.safeguard_placeholder_missing = Some(placeholder.missing);
                        rules.push(substat_rule);
                    }
                }
                continue;
            }
            let mut safeguard_rule = base_rule.clone();
            safeguard_apply_rule_meta(
                &mut safeguard_rule,
                normalized_rule_id,
                safeguard_rule_ordinal,
                &hash,
                entry,
                scanned_at,
            );
            safeguard_rule.safeguard_placeholder = Some(true);
            safeguard_rule.safeguard_placeholder_missing = Some(placeholder.missing);
            rules.push(safeguard_rule);
        }
    }
    rules
}

fn safeguard_is_activation_off(raw: &str) -> bool {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return false;
    }
    trimmed.eq_ignore_ascii_case(SAFEGUARD_ACTIVATION_OFF)
}

fn safeguard_is_activation_anticipate(raw: &str) -> bool {
    let trimmed = raw.trim();
    trimmed.eq_ignore_ascii_case(SAFEGUARD_ACTIVATION_ANTICIPATE_GAPS)
}

pub(crate) fn build_safeguard_rules_core(
    rules: &[SafeguardWasmRuleIn],
    detection: Option<&SafeguardWasmSnapshotOut>,
    recipe_id_base: i64,
) -> Vec<RuleRaw> {
    let Some(detection_snapshot) = detection else {
        return Vec::<RuleRaw>::new();
    };

    // Build lookup map by normalized rule id.
    let mut detection_by_rule_id = HashMap::<String, &SafeguardWasmEntryOut>::new();
    for entry in &detection_snapshot.entries {
        if let Some(rule_id) = entry.rule_id.as_deref() {
            detection_by_rule_id.insert(rule_id.to_string(), entry);
        }
    }

    let mut safeguard_rules = Vec::<RuleRaw>::new();
    let mut emitted_artifact_levels = HashSet::<String>::new();
    let mut placeholder_keys = HashSet::<SafeguardCanonicalRuleKey>::new();
    let mut safeguard_rule_offset = 0i64;
    let mut safeguard_rule_ordinal = 0i64;
    for rule in rules {
        // Normalize optional id and fall back to combination hash when absent.
        let explicit_rule_id = rule
            .id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string());
        // Normalize combination + activation tokens once for deterministic lookups.
        let combination = rule.combination.clone().unwrap_or_default();
        let rule_hash = safeguard_hash_combination(&combination);
        let rule_id = explicit_rule_id.unwrap_or_else(|| rule_hash.clone());
        let activation = rule.activation.clone().unwrap_or_default();
        // Ordinal is the 1-based traversal index across all rules.
        safeguard_rule_ordinal += 1;
        // `off` rules never emit artifact/placeholder safeguard overrides.
        if safeguard_is_activation_off(&activation) {
            continue;
        }
        let entry = detection_by_rule_id.get(rule_id.as_str()).copied();
        let Some(entry) = entry else {
            continue;
        };
        // Detection rows decide whether this rule has artifact or placeholder output.
        let should_emit_artifacts = !entry.artifacts.is_empty();
        let should_emit_placeholders =
            safeguard_is_activation_anticipate(&activation) && !entry.placeholders.is_empty();
        if !should_emit_artifacts && !should_emit_placeholders {
            continue;
        }

        // Recipe IDs descend from the provided sentinel base (-1 in app code).
        let recipe_id = recipe_id_base - safeguard_rule_offset;
        safeguard_rule_offset += 1;
        let normalized_name = safeguard_trim_name(rule.name.as_deref().unwrap_or(""));

        if should_emit_artifacts {
            // Emit one keep rule per item-key + covered level milestone pair.
            for artifact in &entry.artifacts {
                let levels = safeguard_coverage_levels_for_artifact(artifact);
                for level in levels {
                    let artifact_key = format!("{}:{level}", artifact.item_key);
                    if !emitted_artifact_levels.insert(artifact_key) {
                        continue;
                    }
                    let (main_id, main_f) = safeguard_variant_to_main(artifact.main_stat);
                    safeguard_rules.push(RuleRaw {
                        RecipeID: Some(recipe_id),
                        RecipeName: normalized_name.clone(),
                        Keep: Some(true),
                        IsRuleTypeAND: Some(false),
                        Use: Some(true),
                        ArtifactSet: Some(vec![artifact.set]),
                        ArtifactType: Some(vec![artifact.slot]),
                        Rank: Some(safeguard_clamp_rank_or_rarity_value(artifact.rank)),
                        Rarity: Some(safeguard_rarity_value_to_code(artifact.rarity)),
                        MainStatID: Some(main_id),
                        MainStatF: Some(serde_json::Value::from(main_f)),
                        LVLForCheck: Some(level),
                        Faction: Some(artifact.faction),
                        Substats: Some(safeguard_build_substats_for_artifact(&artifact.substats)),
                        source: Some(RULE_SOURCE_SAFEGUARDS.to_string()),
                        line_idx: None,
                        all_known_sets: None,
                        rank_mask: None,
                        rarity_mask: None,
                        safeguard_rule_id: Some(rule_id.clone()),
                        safeguard_rule_ordinal: Some(safeguard_rule_ordinal),
                        safeguard_hash: Some(rule_hash.clone()),
                        safeguard_required: Some(entry.required_count),
                        safeguard_scan_ms: Some(detection_snapshot.scanned_at),
                        safeguard_projected: Some(entry.projected_count),
                        safeguard_deficit: Some(entry.deficit),
                        safeguard_item_key: Some(artifact.item_key),
                        safeguard_placeholder: None,
                        safeguard_placeholder_missing: None,
                    });
                }
            }
        }

        if should_emit_placeholders {
            // Placeholder synthesis mirrors merge.ts substat-match + meta stamping.
            let placeholder_rules = safeguard_build_placeholder_rules(
                rule,
                entry,
                recipe_id,
                safeguard_rule_ordinal,
                Some(detection_snapshot.scanned_at),
            );
            for placeholder_rule in placeholder_rules {
                // Placeholder dedupe uses merge.ts canonical rule key semantics.
                let canonical = safeguard_canonical_rule_key(&placeholder_rule);
                if !placeholder_keys.insert(canonical) {
                    continue;
                }
                safeguard_rules.push(placeholder_rule);
            }
        }
    }
    safeguard_rules
}

// Safeguard HSF rule generation now lives in wasm (merge.ts SSOT path).
#[wasm_bindgen]
pub fn build_safeguard_rules_value(
    rules: JsValue,
    detection: JsValue,
    recipe_id_base: i64,
) -> Result<JsValue, JsValue> {
    let parsed_rules: Vec<SafeguardWasmRuleIn> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard rules payload: {error}")))?;
    let parsed_detection: Option<SafeguardWasmSnapshotOut> = if detection.is_undefined() || detection.is_null() {
        None
    } else {
        Some(from_js_value(detection).map_err(|error| {
            JsValue::from_str(&format!("Invalid safeguard detection payload: {error}"))
        })?)
    };
    let safeguard_rules = build_safeguard_rules_core(
        &parsed_rules,
        parsed_detection.as_ref(),
        recipe_id_base,
    );
    to_js_value(&safeguard_rules)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard rules value: {error}")))
}

fn safeguard_group_sample_from_artifact(artifact: &SafeguardWasmArtifactIn) -> SafeguardWasmGroupSample {
    // Only accessories keep their faction dimension for grouping.
    let faction = safeguard_normalized_faction_for_slot(artifact.slot, artifact.faction);
    // Copy shape used by placeholder synthesis and expected-group comparison.
    SafeguardWasmGroupSample {
        slot: artifact.slot,
        set: artifact.set,
        faction,
        main_stat: artifact.main_stat,
    }
}

fn safeguard_default_group_sample(combination: &SafeguardWasmCombination) -> SafeguardWasmGroupSample {
    // Fallback sample uses first selected slot when present.
    // Otherwise use weapon slot so placeholders stay deterministic.
    SafeguardWasmGroupSample {
        slot: combination
            .slots
            .first()
            .copied()
            .unwrap_or(SAFEGUARD_DEFAULT_SAMPLE_SLOT),
        // Default set/faction/main describe "unknown concrete group".
        set: SAFEGUARD_DEFAULT_SAMPLE_SET,
        faction: 0,
        main_stat: SAFEGUARD_MAIN_ANY,
    }
}

fn safeguard_build_placeholder_combination(
    base: &SafeguardWasmCombination,
    mode: SafeguardWasmCountMode,
    sample: Option<&SafeguardWasmGroupSample>,
) -> SafeguardWasmCombination {
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
        clone.sets = vec![SafeguardWasmSetSelection {
            id: group_sample.set,
            excluded: false,
        }];
    }
    // Main-stat wildcard is encoded as empty list in placeholder combination.
    if mode.per_main_stat {
        clone.main_stats = if group_sample.main_stat == SAFEGUARD_MAIN_ANY {
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

fn safeguard_build_placeholder(
    combination: SafeguardWasmCombination,
    missing: i64,
    reason: &str,
    substat_variants: Option<Vec<i64>>,
) -> SafeguardWasmPlaceholderOut {
    // Keep placeholder payload construction centralized for consistency.
    SafeguardWasmPlaceholderOut {
        combination,
        missing,
        reason: reason.to_string(),
        substat_variants,
    }
}

fn safeguard_matches_selection(selection: &[i64], candidate: i64) -> bool {
    // Empty selection means wildcard dimension.
    if selection.is_empty() {
        return true;
    }
    // Non-empty selection requires explicit id match.
    selection.contains(&candidate)
}

fn safeguard_artifact_matches_rule(
    artifact: &SafeguardWasmArtifactIn,
    rule: &SafeguardWasmPreparedRule,
) -> bool {
    // Equipped filters are optional and short-circuit before tuple matching.
    if rule.ignore_equipped_in_collection && artifact.equipped_in_collection {
        return false;
    }
    if rule.ignore_equipped_in_vault && artifact.equipped_in_vault {
        return false;
    }
    // Quality floor: collection-equipped pieces are the reference and always pass.
    // Skip the check for low-level gear (<12); upgrade-chance handles those.
    if let Some(floor_score) = rule.equipped_floor_score {
        if !artifact.equipped_in_collection && artifact.level >= 12 {
            let score = safeguard_compute_score(artifact, &rule.selected_substats, &rule.weights);
            if score < floor_score {
                return false;
            }
        }
    }
    // Slot filter is always evaluated first to fail fast.
    if !safeguard_matches_selection(&rule.combination.slots, artifact.slot) {
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
    if !safeguard_matches_selection(&rule.combination.ranks, artifact.rank) {
        return false;
    }
    if !safeguard_matches_selection(&rule.combination.rarities, artifact.rarity) {
        return false;
    }
    if !rule.combination.main_stats.is_empty() && !rule.combination.main_stats.contains(&artifact.main_stat) {
        return false;
    }
    // Artifact slots ignore faction; accessory slots keep faction dimension.
    let faction = safeguard_normalized_faction_for_slot(artifact.slot, artifact.faction);
    // Faction filter is wildcard-aware and runs on normalized faction value.
    if !safeguard_matches_selection(&rule.combination.factions, faction) {
        return false;
    }
    true
}

fn safeguard_count_selected_substats(
    artifact: &SafeguardWasmArtifactIn,
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

fn safeguard_candidate_matches_substats(
    artifact: &SafeguardWasmArtifactIn,
    selected_substats: &HashSet<i64>,
    substat_match: &str,
) -> bool {
    // Empty filter means every artifact passes substat gating.
    if selected_substats.is_empty() {
        return true;
    }
    // Compute count once and evaluate mode-specific threshold below.
    let matched = safeguard_count_selected_substats(artifact, selected_substats);
    // `all` requires every selected variant; other modes require any hit.
    if substat_match == SAFEGUARD_SUBSTAT_ALL {
        return matched >= selected_substats.len();
    }
    matched > 0
}

fn safeguard_weight_for_variant(weights: &HashMap<i64, f64>, variant: i64) -> f64 {
    // Missing entries fall back to canonical default weight.
    weights
        .get(&variant)
        .copied()
        .unwrap_or(SAFEGUARD_WEIGHT_DEFAULT)
}

fn safeguard_stat_value_for_variant(artifact: &SafeguardWasmArtifactIn, variant: i64) -> f64 {
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

fn safeguard_compute_score(
    artifact: &SafeguardWasmArtifactIn,
    selected_substats: &[i64],
    weights: &HashMap<i64, f64>,
) -> f64 {
    // Weighted normalized sum mirrors safeguards.ts scoring semantics.
    let mut total = 0.0;
    for variant in selected_substats {
        // Read raw value for this variant from artifact substats.
        let raw = safeguard_stat_value_for_variant(artifact, *variant);
        // Normalize against canonical max roll baseline.
        let normalized = safeguard_normalize_substat_value(*variant, raw);
        // Resolve weight (default when not explicitly configured).
        let weight = safeguard_weight_for_variant(weights, *variant);
        total += weight * normalized;
    }
    // Defensive guard: never return NaN/Infinity to sort comparator.
    if total.is_finite() {
        total
    } else {
        0.0
    }
}

// Keep strict "better than" logic separate from presentation sorting.
// This helper defines ranking semantics only (not output ordering).
// Equal means "not strictly better" and should preserve unresolved ties.
fn safeguard_compare_scored_candidates_tie_only(
    left: &SafeguardWasmScoredCandidate,
    right: &SafeguardWasmScoredCandidate,
    candidates: &[SafeguardWasmCandidateIn],
) -> Ordering {
    // Primary key is score within epsilon buckets.
    // We only treat near-equal scores as ties for unresolved boundary expansion.
    let score_delta = right.score - left.score;
    if score_delta.abs() > SAFEGUARD_SCORE_TIE_EPSILON {
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
    if let Some(left_flat) = safeguard_percent_to_flat_main(left_artifact.main_stat) {
        if left_flat == right_artifact.main_stat {
            return Ordering::Less;
        }
    }
    if let Some(right_flat) = safeguard_percent_to_flat_main(right_artifact.main_stat) {
        if right_flat == left_artifact.main_stat {
            return Ordering::Greater;
        }
    }
    // Leave unrelated main-stat comparisons tied at this stage.
    // The total sort comparator below will break ties deterministically.
    Ordering::Equal
}

// Selected candidate output still needs deterministic ordering for stable payloads.
// This helper is presentation-only and never decides keep/drop eligibility.
fn safeguard_compare_scored_candidate_identity(
    left: &SafeguardWasmScoredCandidate,
    right: &SafeguardWasmScoredCandidate,
    candidates: &[SafeguardWasmCandidateIn],
) -> Ordering {
    let left_candidate = &candidates[left.candidate_idx];
    let right_candidate = &candidates[right.candidate_idx];
    let left_artifact = &candidates[left.candidate_idx].artifact;
    let right_artifact = &candidates[right.candidate_idx].artifact;
    // Item key is the canonical identity and remains stable across input order.
    if left_candidate.item_key != right_candidate.item_key {
        return left_candidate.item_key.cmp(&right_candidate.item_key);
    }
    // Artifact id is a secondary identity fallback when item-key collides.
    let left_id = left_artifact.id.unwrap_or(0);
    let right_id = right_artifact.id.unwrap_or(0);
    if left_id != right_id {
        return left_id.cmp(&right_id);
    }
    // Group key keeps cross-group output deterministic for mixed payloads.
    if left_candidate.group_key != right_candidate.group_key {
        return left_candidate.group_key.cmp(&right_candidate.group_key);
    }
    // Keep remaining scalar fields sorted so duplicate ids stay deterministic.
    if left_artifact.main_stat != right_artifact.main_stat {
        return left_artifact.main_stat.cmp(&right_artifact.main_stat);
    }
    if left_artifact.rank != right_artifact.rank {
        return right_artifact.rank.cmp(&left_artifact.rank);
    }
    if left_artifact.rarity != right_artifact.rarity {
        return right_artifact.rarity.cmp(&left_artifact.rarity);
    }
    Ordering::Equal
}

fn safeguard_select_top_scored_candidates(
    entries: &[SafeguardWasmScoredCandidate],
    required_per_group: i64,
    candidates: &[SafeguardWasmCandidateIn],
) -> Vec<SafeguardWasmScoredCandidate> {
    // Non-positive requirement or empty input means no selected candidates.
    if required_per_group <= 0 || entries.is_empty() {
        return Vec::new();
    }
    // Eligibility is order-independent: keep candidates that are not out-ranked
    // by `required_per_group` strictly-better peers.
    let required = required_per_group as usize;
    let mut selected = Vec::<SafeguardWasmScoredCandidate>::new();
    for candidate in entries {
        let mut better_count = 0usize;
        for challenger in entries {
            if challenger.candidate_idx == candidate.candidate_idx {
                continue;
            }
            // Only strict "better than" decisions reduce eligibility.
            if safeguard_compare_scored_candidates_tie_only(challenger, candidate, candidates)
                == Ordering::Less
            {
                better_count += 1;
                if better_count >= required {
                    break;
                }
            }
        }
        // If fewer than `required` candidates are strictly better, keep it.
        if better_count < required {
            selected.push(candidate.clone());
        }
    }
    // Normalize emitted order without using encounter index as a ranking tie-break.
    selected.sort_unstable_by(|left, right| {
        safeguard_compare_scored_candidate_identity(left, right, candidates)
    });
    selected
}

fn safeguard_count_key(artifact: &SafeguardWasmArtifactIn, mode: SafeguardWasmCountMode) -> SafeguardCountKey {
    safeguard_count_key_from_parts(
        artifact.slot,
        artifact.set,
        artifact.faction,
        artifact.main_stat,
        mode,
    )
}

fn safeguard_count_key_from_parts(
    slot: i64,
    set: i64,
    faction_raw: i64,
    main_stat: i64,
    mode: SafeguardWasmCountMode,
) -> SafeguardCountKey {
    // Per-rule mode collapses all candidates into one global bucket.
    if mode.per_rule {
        return SafeguardCountKey::Global;
    }
    // Normalize grouped dimensions into one typed key payload.
    let normalized_faction = safeguard_normalized_faction_for_slot(slot, faction_raw);
    let scoped = SafeguardCountKey::Scoped {
        slot: if mode.per_slot { Some(slot) } else { None },
        set: if mode.per_set { Some(set) } else { None },
        faction: if mode.per_faction { Some(normalized_faction) } else { None },
        main_stat: if mode.per_main_stat { Some(main_stat) } else { None },
    };
    // No active dimensions still maps to the global bucket.
    match &scoped {
        SafeguardCountKey::Scoped {
            slot: None,
            set: None,
            faction: None,
            main_stat: None,
        } => SafeguardCountKey::Global,
        _ => scoped,
    }
}

fn safeguard_count_key_to_string(key: &SafeguardCountKey) -> String {
    // Global bucket keeps the historical token for TS parity.
    let SafeguardCountKey::Scoped {
        slot,
        set,
        faction,
        main_stat,
    } = key else {
        return SAFEGUARD_COUNT_KEY_GLOBAL.to_string();
    };
    // Scoped bucket stringifies only active dimensions.
    let mut parts = Vec::<String>::new();
    if let Some(value) = slot {
        parts.push(format!("slot:{value}"));
    }
    if let Some(value) = set {
        parts.push(format!("set:{value}"));
    }
    if let Some(value) = faction {
        parts.push(format!("faction:{value}"));
    }
    if let Some(value) = main_stat {
        parts.push(format!("main:{value}"));
    }
    // Defensive fallback: empty scoped payload still resolves to global.
    if parts.is_empty() {
        SAFEGUARD_COUNT_KEY_GLOBAL.to_string()
    } else {
        parts.join("|")
    }
}

// Expose safeguard count-key derivation so JS expected-group precomputation
// uses the exact same grouping semantics as Rust detection scans.
#[wasm_bindgen]
pub fn safeguard_count_key_value(artifact: JsValue, count_mode: JsValue) -> Result<String, JsValue> {
    // Parse compact artifact tuple (slot/set/faction/mainStat) from JS.
    let parsed_artifact: SafeguardWasmCountKeyArtifactIn = from_js_value(artifact)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard count-key artifact: {error}")))?;
    // Parse and sanitize count-mode flags before key computation.
    let parsed_mode: SafeguardWasmCountMode = from_js_value(count_mode)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard count mode: {error}")))?;
    let mode = safeguard_sanitize_count_mode(parsed_mode);
    // Delegate to the shared Rust helper so key semantics stay SSOT.
    Ok(safeguard_count_key_to_string(&safeguard_count_key_from_parts(
        parsed_artifact.slot,
        parsed_artifact.set,
        parsed_artifact.faction,
        parsed_artifact.main_stat,
        mode,
    )))
}

// Expose item-key resolution so TS and Rust share DB-id-first fallback logic.
#[wasm_bindgen]
pub fn safeguard_item_key_value(artifact: JsValue) -> Result<i64, JsValue> {
    let parsed_artifact: SafeguardWasmItemKeyArtifactIn = from_js_value(artifact)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard item-key artifact payload: {error}")))?;
    // Canonical precedence: artifact.id (db, positive only) -> gearInspectorItem.previewExtras.id -> gearInspectorItem.itemId.
    // Negative artifact ids are synthetic App.tsx placeholders for custom gear; skip them so the
    // key returned here stays consistent with resolve_collect_row_item_key and resolve_item_key.
    let artifact_id = parsed_artifact.id.filter(|&id| id > 0);
    let gear_inspector_preview_id = parsed_artifact
        .gear_inspector_item
        .as_ref()
        .and_then(|gear_inspector_item| gear_inspector_item.preview_extras.as_ref())
        .and_then(|preview_extras| preview_extras.id);
    let gear_inspector_item_id = parsed_artifact
        .gear_inspector_item
        .as_ref()
        .and_then(|gear_inspector_item| gear_inspector_item.item_id);
    Ok(artifact_id.or(gear_inspector_preview_id).or(gear_inspector_item_id).unwrap_or(0))
}

// Expose group-key derivation so TS reuses Rust accessory-faction normalization.
#[wasm_bindgen]
pub fn safeguard_group_key_value(artifact: JsValue) -> Result<String, JsValue> {
    let parsed_artifact: SafeguardWasmGroupKeyArtifactIn = from_js_value(artifact)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard group-key artifact payload: {error}")))?;
    let main_stat = safeguard_main_stat_from_fast_payload(parsed_artifact.main_stat);
    // Delegate to shared formatter so all group-key callers stay in lockstep.
    Ok(safeguard_group_key_from_parts(
        parsed_artifact.slot,
        parsed_artifact.set,
        main_stat,
        parsed_artifact.faction,
    ))
}

fn safeguard_round_three(value: f64) -> f64 {
    // Keep output precision aligned with existing UI formatting expectations.
    (value * 1000.0).round() / 1000.0
}

fn safeguard_to_detection_artifact(candidate: &SafeguardWasmCandidateIn) -> SafeguardWasmArtifactOut {
    // Only accessories preserve faction in detection payload.
    let faction = safeguard_normalized_faction_for_slot(candidate.artifact.slot, candidate.artifact.faction);
    // Copy substats with rounded values to keep payload stable/readable.
    let substats = candidate
        .artifact
        .substats
        .iter()
        .map(|substat| SafeguardWasmSubstatOut {
            variant: substat.variant,
            is_flat: substat.is_flat,
            value: safeguard_round_three(if substat.value.is_finite() { substat.value } else { 0.0 }),
        })
        .collect::<Vec<_>>();
    // Emit compact artifact summary consumed by safeguard UI tables.
    SafeguardWasmArtifactOut {
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

fn safeguard_sort_candidate_indices(indices: &mut [usize], candidates: &[SafeguardWasmCandidateIn]) {
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

fn safeguard_build_entry_for_substats(
    prepared_rule: &SafeguardWasmPreparedRule,
    candidates: &[SafeguardWasmCandidateIn],
    candidate_sold_state: &[bool],
    selected_substats: &[i64],
    substat_match: &str,
) -> SafeguardWasmEntryEvalOut {
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
        .map(|group| SafeguardWasmExpectedGroupResolved {
            // Keep the parsed payload key read so dead-code checks stay quiet.
            // Group lookups use typed keys derived from the canonical sample.
            key: {
                let _provided_key = group.key.trim();
            // Derive typed keys from sample dimensions so lookups stay typed.
                safeguard_count_key_from_parts(
                    group.sample.slot,
                    group.sample.set,
                    group.sample.faction,
                    group.sample.main_stat,
                    prepared_rule.count_mode,
                )
            },
            sample: SafeguardWasmGroupSample {
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
        .filter(|(_, candidate)| safeguard_artifact_matches_rule(&candidate.artifact, prepared_rule))
        .filter(|(_, candidate)| {
            safeguard_candidate_matches_substats(&candidate.artifact, &selected_set, substat_match)
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
                    safeguard_compute_score(&candidate.artifact, selected_substats, &prepared_rule.weights);
                if score <= 0.0 {
                    return None;
                }
                Some(SafeguardWasmScoredCandidate {
                    candidate_idx: *candidate_idx,
                    score,
                })
            })
            .collect::<Vec<_>>();

        // Bucket scored entries by count key for grouped counting modes.
        let mut groups = HashMap::<SafeguardCountKey, Vec<SafeguardWasmScoredCandidate>>::new();
        let mut group_order = Vec::<SafeguardCountKey>::new();
        if prepared_rule.count_mode.per_rule {
            // Per-rule mode uses one global bucket.
            if !scored.is_empty() {
                groups.insert(SafeguardCountKey::Global, scored);
                group_order.push(SafeguardCountKey::Global);
            }
        } else {
            // Grouped mode routes each scored candidate to its group key.
            for entry in scored {
                let key = safeguard_count_key(&candidates[entry.candidate_idx].artifact, prepared_rule.count_mode);
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
        let mut artifacts = Vec::<SafeguardWasmArtifactOut>::new();
        let mut selected_candidate_indices = Vec::<usize>::new();
        let mut placeholders = Vec::<SafeguardWasmPlaceholderOut>::new();

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
                        .map(|entry| safeguard_group_sample_from_artifact(&candidates[entry.candidate_idx].artifact))
                        .unwrap_or_else(|| safeguard_default_group_sample(&prepared_rule.combination));
                    SafeguardWasmExpectedGroupResolved {
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
                placeholders.push(safeguard_build_placeholder(
                    safeguard_build_placeholder_combination(
                        &prepared_rule.combination,
                        prepared_rule.count_mode,
                        Some(&expected.sample),
                    ),
                    deficit_group,
                    SAFEGUARD_REASON_GROUP,
                    placeholder_substats.clone(),
                ));
                deficit += deficit_group;
                continue;
            }
            // Select top required entries with tie-boundary extension.
            let selected =
                safeguard_select_top_scored_candidates(&bucket, required_per_group, candidates);
            let mut group_total = 0i64;
            let mut group_kept = 0i64;
            let mut group_sold = 0i64;
            for scored_entry in selected {
                group_total += 1;
                let candidate_idx = scored_entry.candidate_idx;
                let candidate = &candidates[candidate_idx];
                if candidate_sold_state[candidate_idx] {
                    group_sold += 1;
                    selected_candidate_indices.push(candidate_idx);
                    item_keys.push(candidate.item_key);
                    artifacts.push(safeguard_to_detection_artifact(candidate));
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
                placeholders.push(safeguard_build_placeholder(
                    safeguard_build_placeholder_combination(
                        &prepared_rule.combination,
                        prepared_rule.count_mode,
                        Some(&expected.sample),
                    ),
                    deficit_group,
                    SAFEGUARD_REASON_GROUP,
                    placeholder_substats.clone(),
                ));
            }
            deficit += deficit_group;
        }

        // No groups observed still emits global placeholder when needed.
        if groups_tracked == 0 && required_per_group > 0 {
            placeholders.push(safeguard_build_placeholder(
                prepared_rule.combination.clone(),
                required_per_group,
                SAFEGUARD_REASON_GLOBAL,
                placeholder_substats.clone(),
            ));
            deficit = required_per_group;
        }

        // Projected count includes sold artifacts only when rule is active.
        let projected = kept_count + if prepared_rule.rule_active { sold_count } else { 0 };
        return SafeguardWasmEntryEvalOut {
            entry: SafeguardWasmEntryOut {
                hash: prepared_rule.hash.clone(),
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
            },
            selected_candidate_indices,
        };
    }

    // Non-ranking path: count by sold/kept presence without score sorting.
    if prepared_rule.count_mode.per_rule {
        let mut kept_count = 0i64;
        let mut sold_indices = Vec::<usize>::new();
        for candidate_idx in &matching_indices {
            if candidate_sold_state[*candidate_idx] {
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
        safeguard_sort_candidate_indices(&mut sold_indices, candidates);
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
        let mut placeholders = Vec::<SafeguardWasmPlaceholderOut>::new();
        // Global shortfall emits one global placeholder.
        if deficit > 0 {
            placeholders.push(safeguard_build_placeholder(
                prepared_rule.combination.clone(),
                deficit,
                SAFEGUARD_REASON_GLOBAL,
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
            .map(|idx| safeguard_to_detection_artifact(&candidates[*idx]))
            .collect::<Vec<_>>();
        return SafeguardWasmEntryEvalOut {
            entry: SafeguardWasmEntryOut {
                hash: prepared_rule.hash.clone(),
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
            },
            selected_candidate_indices: selected_sold,
        };
    }

    // Grouped non-ranking path: split matching candidates into group buckets.
    let mut group_counts = HashMap::<SafeguardCountKey, SafeguardWasmGroupBucket>::new();
    let mut group_order = Vec::<SafeguardCountKey>::new();
    for candidate_idx in matching_indices {
        let candidate = &candidates[candidate_idx];
        let key = safeguard_count_key(&candidate.artifact, prepared_rule.count_mode);
        if let Some(bucket) = group_counts.get_mut(&key) {
            if candidate_sold_state[candidate_idx] {
                bucket.sold.push(candidate_idx);
            } else {
                bucket.kept.push(candidate_idx);
            }
            if bucket.sample.is_none() {
                bucket.sample = Some(safeguard_group_sample_from_artifact(&candidate.artifact));
            }
        } else {
            let mut bucket = SafeguardWasmGroupBucket {
                kept: Vec::new(),
                sold: Vec::new(),
                sample: Some(safeguard_group_sample_from_artifact(&candidate.artifact)),
            };
            if candidate_sold_state[candidate_idx] {
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
    let mut placeholders = Vec::<SafeguardWasmPlaceholderOut>::new();

    // Use explicit expected list when present, else derive from observed groups.
    let expected_list = if !prepared_rule.expected_groups.is_empty() {
        prepared_rule
            .expected_groups
            .iter()
            .map(|group| SafeguardWasmExpectedGroupResolved {
                // Keep the parsed payload key read so dead-code checks stay quiet.
                // Group lookups use typed keys derived from the canonical sample.
                // Keep expected-group lookups typed and derive key dimensions
                // from the canonical sample payload.
                key: {
                    let _provided_key = group.key.trim();
                    safeguard_count_key_from_parts(
                        group.sample.slot,
                        group.sample.set,
                        group.sample.faction,
                        group.sample.main_stat,
                        prepared_rule.count_mode,
                    )
                },
                sample: SafeguardWasmGroupSample {
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
                    .unwrap_or_else(|| safeguard_default_group_sample(&prepared_rule.combination));
                SafeguardWasmExpectedGroupResolved {
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
            placeholders.push(safeguard_build_placeholder(
                safeguard_build_placeholder_combination(
                    &prepared_rule.combination,
                    prepared_rule.count_mode,
                    Some(&expected.sample),
                ),
                deficit_group,
                SAFEGUARD_REASON_GROUP,
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
            safeguard_sort_candidate_indices(&mut sorted_sold, candidates);
            at_risk.extend(sorted_sold.into_iter().take(needed as usize));
        }
        if deficit_group > 0 {
            // Only emit placeholders when this group is truly under-covered.
            // Zero-missing placeholders create noisy/empty rows in UI tables.
            placeholders.push(safeguard_build_placeholder(
                safeguard_build_placeholder_combination(
                    &prepared_rule.combination,
                    prepared_rule.count_mode,
                    Some(&expected.sample),
                ),
                deficit_group,
                SAFEGUARD_REASON_GROUP,
                placeholder_substats.clone(),
            ));
        }
        deficit += deficit_group;
    }

    // No observed groups still yields a global placeholder shortfall.
    if groups_tracked == 0 && required_per_group > 0 {
        placeholders.push(safeguard_build_placeholder(
            prepared_rule.combination.clone(),
            required_per_group,
            SAFEGUARD_REASON_GLOBAL,
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
        .map(|idx| safeguard_to_detection_artifact(&candidates[*idx]))
        .collect::<Vec<_>>();
    SafeguardWasmEntryEvalOut {
        entry: SafeguardWasmEntryOut {
            hash: prepared_rule.hash.clone(),
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
        },
        selected_candidate_indices: at_risk,
    }
}

fn safeguard_merge_substat_entries(
    prepared_rule: &SafeguardWasmPreparedRule,
    required_per_group: i64,
    entries: Vec<SafeguardWasmEntryEvalOut>,
) -> SafeguardWasmEntryEvalOut {
    // Merge per-substat entries into one aggregate rule entry.
    let mut item_keys = Vec::<i64>::new();
    let mut item_key_set = HashSet::<i64>::new();
    let mut artifacts = Vec::<SafeguardWasmArtifactOut>::new();
    let mut artifact_key_set = HashSet::<i64>::new();
    let mut selected_candidate_indices = Vec::<usize>::new();
    let mut selected_candidate_set = HashSet::<usize>::new();
    let mut placeholders = Vec::<SafeguardWasmPlaceholderOut>::new();
    let mut required_count = 0i64;
    let mut current_count = 0i64;
    let mut projected_count = 0i64;
    let mut deficit = 0i64;
    let mut groups_tracked = 0i64;
    for mut eval in entries {
        let entry = eval.entry;
        // Sum scalar counters across all per-substat entries.
        required_count += entry.required_count;
        current_count += entry.current_count;
        projected_count += entry.projected_count;
        deficit += entry.deficit;
        groups_tracked += entry.groups_tracked;
        // Cascade state needs the union of selected sold candidates.
        for candidate_idx in eval.selected_candidate_indices.drain(..) {
            if selected_candidate_set.insert(candidate_idx) {
                selected_candidate_indices.push(candidate_idx);
            }
        }
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
    SafeguardWasmEntryEvalOut {
        entry: SafeguardWasmEntryOut {
            hash: prepared_rule.hash.clone(),
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
        },
        selected_candidate_indices,
    }
}

// Expected-group payload uses the canonical wrapper shape from app-side callers.
fn parse_safeguard_expected_groups_payload(
    expected_groups_payload: JsValue,
) -> Result<SafeguardWasmExpectedGroupsPayloadIn, JsValue> {
    // Null/undefined means no explicit expected-group metadata was supplied.
    if expected_groups_payload.is_undefined() || expected_groups_payload.is_null() {
        return Ok(SafeguardWasmExpectedGroupsPayloadIn::default());
    }
    from_js_value::<SafeguardWasmExpectedGroupsPayloadIn>(expected_groups_payload).map_err(|error| {
        JsValue::from_str(&format!("Invalid safeguard expected groups payload: {error}"))
    })
}

// Safeguard protection core evaluates prepared rules against candidate rows.
fn compute_safeguard_protection_core(
    parsed_candidates: Vec<SafeguardWasmCandidateIn>,
    parsed_rules: Vec<SafeguardWasmRuleIn>,
    expected_payload: SafeguardWasmExpectedGroupsPayloadIn,
    enabled: bool,
    now: f64,
) -> SafeguardWasmSnapshotOut {
    // Baseline state never changes; per-rule toggle can opt to read from it.
    let baseline_candidate_sold_state = parsed_candidates
        .iter()
        .map(|candidate| candidate.is_sold)
        .collect::<Vec<_>>();
    // Cumulative state tracks sold candidates already selected by prior safeguards.
    let mut cumulative_candidate_sold_state = baseline_candidate_sold_state.clone();
    // Precompute sanitized rule metadata used by candidate scans.
    let prepared_rules = parsed_rules
        .into_iter()
        .map(|rule| {
            // Normalize nullable legacy fields before downstream matching logic.
            let mut rule_id = rule.id.unwrap_or_default();
            let combination = rule.combination.unwrap_or_default();
            // Combination hash is reused across id fallback + output payload rows.
            let combination_hash = safeguard_hash_combination(&combination);
            let mut activation = rule.activation.unwrap_or_default();
            if rule_id.trim().is_empty() {
                rule_id = format!("ku_{combination_hash}");
            }
            if activation.trim().is_empty() {
                activation = SAFEGUARD_ACTIVATION_PROTECT_EXISTING.to_string();
            }
            // Normalize count mode so invalid combos fall back to per-rule mode.
            let count_mode = safeguard_resolve_count_mode(rule.count_mode);
            // Defaults keep legacy behavior unless the payload opts in.
            let ignore_previous_safeguards = rule
                .ignore_previous_safeguards
                .unwrap_or(SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS);
            let ignore_equipped_in_collection = rule
                .ignore_equipped_in_collection
                .unwrap_or(SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION);
            let ignore_equipped_in_vault = rule
                .ignore_equipped_in_vault
                .unwrap_or(SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT);
            // Preserve the pre-computed floor score from TypeScript; None disables it.
            let equipped_floor_score = rule.equipped_floor_score.filter(|v| v.is_finite());
            // Required count is clamped to at least one.
            let required_per_group = rule.required_count.unwrap_or(1).max(1);
            // Normalize match mode token for deterministic branching.
            let normalized_match = safeguard_normalize_substat_match(
                rule.substat_match.as_deref().unwrap_or(""),
            );
            let selected_substats = rule.substats.unwrap_or_default();
            let has_substat_filter = !selected_substats.is_empty();
            // No selected substats always implies `any` behavior.
            let substat_match = if has_substat_filter {
                normalized_match
            } else {
                SAFEGUARD_SUBSTAT_ANY.to_string()
            };
            // Sanitize pre-parsed variant weights into the normalized numeric map.
            let mut weights = HashMap::<i64, f64>::new();
            for (variant, raw_weight) in rule.substat_weights.unwrap_or_default() {
                weights.insert(variant, safeguard_normalize_weight(raw_weight));
            }
            // Pre-split set filters into include/exclude lookup sets.
            let (set_includes, set_excludes) = safeguard_split_set_selections(&combination.sets);
            // Resolve expected groups with explicit maps first, then domain enum.
            let expected_groups = expected_payload
                .expected_groups_by_rule_id
                .get(&rule_id)
                .cloned()
                .or_else(|| {
                    expected_payload
                        .expected_group_domain
                        .as_ref()
                        .map(|domain| safeguard_build_expected_groups_for_rule(&combination, count_mode, domain))
                })
                .unwrap_or_default();
            SafeguardWasmPreparedRule {
                id: rule_id,
                hash: combination_hash,
                combination,
                required_per_group,
                activation: activation.clone(),
                // Activation off disables sold-item projection contribution.
                rule_active: enabled && !safeguard_is_activation_off(&activation),
                count_mode,
                ignore_previous_safeguards,
                ignore_equipped_in_collection,
                ignore_equipped_in_vault,
                equipped_floor_score,
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
    let mut entries = Vec::<SafeguardWasmEntryOut>::new();
    for prepared_rule in &prepared_rules {
        // Per-rule toggle decides whether this rule sees prior safeguard selections.
        let candidate_sold_state = if prepared_rule.ignore_previous_safeguards {
            &baseline_candidate_sold_state
        } else {
            &cumulative_candidate_sold_state
        };
        // Track selected sold candidates so optional cascading can mutate state once.
        let eval_result = if prepared_rule.substat_match == SAFEGUARD_SUBSTAT_PER_SUBSTAT
            && prepared_rule.selected_substats.len() > 1
        {
            let per_substat_entries = prepared_rule
                .selected_substats
                .iter()
                .map(|variant| {
                    safeguard_build_entry_for_substats(
                        prepared_rule,
                        &parsed_candidates,
                        candidate_sold_state,
                        &[*variant],
                        SAFEGUARD_SUBSTAT_ANY,
                    )
                })
                .collect::<Vec<_>>();
            safeguard_merge_substat_entries(
                prepared_rule,
                prepared_rule.required_per_group,
                per_substat_entries,
            )
        } else {
            // Single-variant `persubstat` behaves like `any` for that variant.
            let effective_match = if prepared_rule.substat_match == SAFEGUARD_SUBSTAT_PER_SUBSTAT {
                SAFEGUARD_SUBSTAT_ANY
            } else {
                prepared_rule.substat_match.as_str()
            };
            safeguard_build_entry_for_substats(
                prepared_rule,
                &parsed_candidates,
                candidate_sold_state,
                &prepared_rule.selected_substats,
                effective_match,
            )
        };
        // Active safeguards always contribute to cumulative state for later rules.
        if prepared_rule.rule_active {
            for candidate_idx in &eval_result.selected_candidate_indices {
                if *candidate_idx >= cumulative_candidate_sold_state.len() {
                    continue;
                }
                cumulative_candidate_sold_state[*candidate_idx] = false;
            }
        }
        entries.push(eval_result.entry);
    }

    // Snapshot timestamp is sanitized to finite number for stable payloads.
    let scanned_at = if now.is_finite() { now } else { 0.0 };
    SafeguardWasmSnapshotOut { scanned_at, entries }
}

#[wasm_bindgen]
pub fn compute_safeguard_protection_value(
    candidates: JsValue,
    rules: JsValue,
    expected_groups_by_rule_id: JsValue,
    enabled: bool,
    now: f64,
) -> Result<JsValue, JsValue> {
    // Parse canonical candidate payloads into normalized detection candidates.
    let parsed_candidates = safeguard_parse_candidates_payload(candidates)?;
    // Parse canonical safeguard rule rows prepared by app-side normalization.
    let parsed_rules = safeguard_parse_rules_payload(rules)?;
    // Parse canonical expected-group wrapper payload.
    let expected_payload = parse_safeguard_expected_groups_payload(expected_groups_by_rule_id)?;
    // Run the shared protection core and return the serialized snapshot.
    let snapshot = compute_safeguard_protection_core(
        parsed_candidates,
        parsed_rules,
        expected_payload,
        enabled,
        now,
    );
    to_js_value(&snapshot)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard snapshot: {error}")))
}

// Combined safeguard export runs candidate collection + protection in one pass.
#[allow(clippy::too_many_arguments)]
#[wasm_bindgen]
pub fn collect_and_compute_safeguard_protection_value(
    rows: JsValue,
    rules: JsValue,
    recipe_modes: JsValue,
    ignore_safeguard_recipe_indices: JsValue,
    safeguard_rules: JsValue,
    expected_groups_payload: JsValue,
    enabled: bool,
    now: f64,
) -> Result<JsValue, JsValue> {
    // Parse canonical collect rows into the normalized collect row shape.
    let rows = safeguard_parse_collect_rows_payload(rows)?;
    // Parse base rules used by keep/sell candidate resolution.
    let rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard collect rules payload: {error}")))?;
    // Parse visibility modes used by evaluate-item rule filtering.
    let recipe_modes: Vec<String> = from_js_value(recipe_modes)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard collect recipe-modes payload: {error}")))?;
    // Parse optional ignored-recipe list for safeguard suppression modes.
    let ignore_safeguard_recipe_indices: Option<Vec<i64>> = from_js_value(ignore_safeguard_recipe_indices)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard collect ignored-recipe payload: {error}")))?;
    // Parse canonical safeguard rules used by protection scoring/counting logic.
    let parsed_rules = safeguard_parse_rules_payload(safeguard_rules)?;
    // Parse canonical expected-group wrapper payload.
    let expected_payload = parse_safeguard_expected_groups_payload(expected_groups_payload)?;

    // Prepare base rules once; collect-core reuses these for every row.
    let prepared_rules = rules.into_iter().map(prepare_rule).collect::<Vec<_>>();
    let collected = collect_safeguard_candidates_core(
        &rows,
        &prepared_rules,
        &recipe_modes,
        &ignore_safeguard_recipe_indices.unwrap_or_default(),
    )?;
    // Convert collected rows into protection candidate payload shape.
    let protection_candidates = collected
        .candidates
        .iter()
        .map(|candidate| SafeguardWasmCandidateIn {
            item_key: candidate.item_key,
            group_key: candidate.group_key.clone(),
            is_sold: candidate.is_sold,
            artifact: candidate.artifact.clone(),
        })
        .collect::<Vec<_>>();
    // Run detection against collected candidates without a second JS roundtrip.
    let detection = compute_safeguard_protection_core(
        protection_candidates,
        parsed_rules,
        expected_payload,
        enabled,
        now,
    );
    // Return both candidate and detection payloads for TS call sites.
    let combined = SafeguardCollectedAndProtectedSnapshotOut {
        candidates: collected.candidates,
        unique_item_keys: collected.unique_item_keys,
        detection,
    };
    to_js_value(&combined)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard combined snapshot: {error}")))
}
