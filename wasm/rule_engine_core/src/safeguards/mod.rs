use super::*;
use std::collections::BTreeMap;
use std::sync::Arc;
use crate::matcher_evaluator::{collect_safeguard_candidates_core, prepare_rule, BucketedRules};
use crate::SafeguardCollectedAndProtectedSnapshotOut;

// Fast-path input types and conversion functions live in a dedicated submodule
// to keep this file focused on rule resolution and scoring logic.
pub mod fast_path_types;
// Improvement-chance probabilistic computation lives in its own submodule so the
// recursion and scenario-building logic stay separated from snapshot evaluation.
pub mod improvement_chance;
// Re-export pub(crate) structs that lib.rs imports via `use safeguards::*`.
pub use fast_path_types::SafeguardWasmArtifactIn;
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
pub fn safeguard_normalized_faction_for_slot(slot: i64, faction: i64) -> i64 {
    if safeguard_is_accessory_slot(slot) {
        faction
    } else {
        0
    }
}

// Group-key dimensions always normalize faction the same way before encoding.
// Export this so matcher and parser call sites reuse one formatting helper.
pub fn safeguard_group_key_from_parts(
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
// Core version accepts pre-parsed fast rows (JsValue parsing done in wasm crate).
pub fn safeguard_parse_collect_rows_payload(
    fast_rows: Vec<SafeguardCollectRowFastIn>,
) -> Result<Vec<SafeguardCollectRowIn>, String> {
    let mut parsed_rows = Vec::<SafeguardCollectRowIn>::with_capacity(fast_rows.len());
    for (idx, row) in fast_rows.into_iter().enumerate() {
        let parsed = safeguard_collect_row_from_fast_payload(row)
            .map_err(|error| format!("Invalid safeguard collect row at index {idx}: {error}"))?;
        parsed_rows.push(parsed);
    }
    Ok(parsed_rows)
}

// Shared candidate decoder centralizes raw/compact safeguard candidate parsing.
// Core version accepts pre-parsed fast candidates (no JsValue).
fn safeguard_parse_candidates_payload(
    fast_candidates: Vec<SafeguardWasmCandidateFastIn>,
) -> Vec<SafeguardWasmCandidateIn> {
    fast_candidates
        .into_iter()
        .map(safeguard_candidate_from_fast_payload)
        .collect::<Vec<_>>()
}

// Safeguard rule decoder expects canonical typed rows from app-side normalization.
// Core version accepts already-parsed rules (no JsValue).
fn safeguard_parse_rules_payload(rules: Vec<SafeguardWasmRuleIn>) -> Vec<SafeguardWasmRuleIn> {
    rules
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SafeguardWasmSetSelection {
    pub id: i64,
    #[serde(default)]
    pub excluded: bool,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SafeguardWasmCombination {
    #[serde(default)]
    pub slots: Vec<i64>,
    #[serde(default)]
    pub sets: Vec<SafeguardWasmSetSelection>,
    // `metaSetNames` after the metaset ID→name migration (previously `metaSetIds`).
    #[serde(default)]
    pub meta_set_names: Vec<String>,
    #[serde(default)]
    pub ranks: Vec<i64>,
    #[serde(default)]
    pub rarities: Vec<i64>,
    #[serde(default)]
    pub main_stats: Vec<i64>,
    #[serde(default)]
    pub factions: Vec<i64>,
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
pub struct SafeguardWasmCountMode {
    #[serde(default)]
    pub per_rule: bool,
    #[serde(default)]
    pub per_set: bool,
    #[serde(default)]
    pub per_faction: bool,
    #[serde(default)]
    pub per_main_stat: bool,
    #[serde(default)]
    pub per_slot: bool,
}

// Per-level improvement-chance threshold; accepted in two forms:
// - a resolved [f64;4] array (TypeScript's resolveRulesForWasm path), or
// - the raw object form with null inheritance (SafeguardImprovementChanceLevelThresholds
//   from sfc_reader / direct WASM calls). Legacy single-number SFC files are normalized
//   to the object form by sfcIO.ts before they reach Rust.
// The untagged discriminant tries variants in declaration order: array first, then object.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum ImprovementChanceThresholdIn {
    // Resolved format: TypeScript has already applied inherit-from-left logic.
    Array([f64; 4]),
    // Raw TypeScript object — null slots inherit the resolved value of the previous stage.
    Object {
        #[serde(rename = "atLevel0")]
        at_level_0: f64,
        #[serde(rename = "atLevel4", default)]
        at_level_4: Option<f64>,
        #[serde(rename = "atLevel8", default)]
        at_level_8: Option<f64>,
        #[serde(rename = "atLevel12", default)]
        at_level_12: Option<f64>,
    },
}

impl ImprovementChanceThresholdIn {
    // Resolve to a concrete [f64; 4] with clamped values. Null slots in the Object
    // variant inherit from the resolved value of the previous stage (SSOT in TS too).
    pub fn into_slots_clamped(self) -> [f64; 4] {
        match self {
            Self::Array([l0, l4, l8, l12]) => [
                l0.clamp(0.0, 100.0),
                l4.clamp(0.0, 100.0),
                l8.clamp(0.0, 100.0),
                l12.clamp(0.0, 100.0),
            ],
            Self::Object { at_level_0, at_level_4, at_level_8, at_level_12 } => {
                let l0 = at_level_0.clamp(0.0, 100.0);
                let l4 = at_level_4.unwrap_or(l0).clamp(0.0, 100.0);
                let l8 = at_level_8.unwrap_or(l4).clamp(0.0, 100.0);
                let l12 = at_level_12.unwrap_or(l8).clamp(0.0, 100.0);
                [l0, l4, l8, l12]
            }
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SafeguardWasmRuleIn {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub combination: Option<SafeguardWasmCombination>,
    #[serde(default)]
    pub required_count: Option<i64>,
    #[serde(default)]
    pub activation: Option<String>,
    #[serde(default)]
    pub count_mode: Option<SafeguardWasmCountMode>,
    #[serde(default)]
    pub ignore_previous_safeguards: Option<bool>,
    #[serde(default)]
    pub ignore_equipped_in_collection: Option<bool>,
    #[serde(default)]
    pub ignore_equipped_in_vault: Option<bool>,
    #[serde(default)]
    pub substats: Option<Vec<i64>>,
    #[serde(default)]
    pub substat_match: Option<String>,
    #[serde(default, deserialize_with = "safeguard_deserialize_optional_i64_weight_map")]
    pub substat_weights: Option<HashMap<i64, f64>>,
    // Per-level improvement-chance thresholds. Accepts legacy single-number, resolved [f64;4]
    // array, or the raw object form with null-inheritance slots. When None, improvement-chance
    // filtering is disabled and candidates are selected by standard top-N ranking only.
    #[serde(default)]
    pub improvement_chance_threshold: Option<ImprovementChanceThresholdIn>,
    // Opaque string tags used by the safeguard-overrides DSL selector matching. Passed through
    // unchanged so TS can apply selector-matched override instructions after metaset expansion.
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

// Resolved safeguard rule payload returned after metaset expansion in lib.rs.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SafeguardWasmResolvedRuleOut {
    pub id: String,
    pub name: String,
    pub combination: SafeguardWasmCombination,
    pub required_count: i64,
    pub activation: String,
    pub count_mode: SafeguardWasmCountMode,
    pub ignore_previous_safeguards: bool,
    pub ignore_equipped_in_collection: bool,
    pub ignore_equipped_in_vault: bool,
    pub substats: Vec<i64>,
    pub substat_match: String,
    pub substat_weights: HashMap<String, f64>,
    // Threshold echoed back verbatim so TS preserves null-inheritance slots (e.g. Lenient preset).
    pub improvement_chance_threshold: Option<ImprovementChanceThresholdIn>,
    // Opaque string tags passed through from the input rule unchanged.
    pub tags: Vec<String>,
}

// Canonical metaset-id list is sorted and deduped for deterministic hashes.
fn safeguard_sort_unique_meta_set_names(values: Vec<String>) -> Vec<String> {
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
pub struct SafeguardWasmExpectedGroupDomainIn {
    slot_order: Vec<i64>,
    accessory_compatible_set_ids: Vec<i64>,
    armor_compatible_set_ids: Vec<i64>,
    allowed_main_by_slot: HashMap<String, Vec<i64>>,
    all_faction_ids: Vec<i64>,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SafeguardWasmExpectedGroupsPayloadIn {
    #[serde(default)]
    expected_groups_by_rule_id: HashMap<String, Vec<SafeguardWasmExpectedGroupIn>>,
    expected_group_domain: Option<SafeguardWasmExpectedGroupDomainIn>,
}

// Normalize safeguard expected-group domain arrays/maps in Rust so sorting,
// de-duplication, and slot ordering remain single-sourced with matcher logic.
pub fn normalize_safeguard_expected_group_domain_core(parsed: SafeguardWasmExpectedGroupDomainIn) -> SafeguardWasmExpectedGroupDomainIn {
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

    // Return the normalized domain payload for use in Rust pipelines.
    normalized
}

// Metaset payload for in-wasm safeguard set expansion.
// `name` is the primary key after the metaset ID→name migration.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeguardWasmMetasetIn {
    pub name: String,
    #[serde(default)]
    pub sets: Vec<i64>,
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

// Per-candidate scored output exposed in detection entries for UI overlays.
// candidateRank is 1-based (1 = best score); 0 means the non-ranking path was used.
// isWithinQuota is true when the candidate is among the top-N selected for this rule.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SafeguardWasmCandidateOut {
    pub item_key: i64,
    pub score: f64,
    pub candidate_rank: u32,
    pub is_within_quota: bool,
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
    // 1-based position of this rule in the input list; matches __safeguardRuleOrdinal on HSF rules.
    #[serde(skip_serializing_if = "Option::is_none")]
    rule_ordinal: Option<i64>,
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
    // All matched+scored candidates with their ranks; omitted from old snapshots (default = empty).
    #[serde(default)]
    candidates: Vec<SafeguardWasmCandidateOut>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SafeguardWasmSnapshotOut {
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
    // Per-level thresholds resolved to concrete [f64; 4]: slots [0..3, 4..7, 8..11, 12..15].
    // None = improvement-chance filtering disabled; standard top-N ranking is used.
    improvement_chance_threshold: Option<[f64; 4]>,
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
// pub(super) so improvement_chance submodule can build count keys without allocating.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(super) enum SafeguardCountKey {
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
pub struct SafeguardWasmCountKeyArtifactIn {
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
pub struct SafeguardWasmItemKeyArtifactIn {
    #[serde(default)]
    id: Option<i64>,
    #[serde(default)]
    gear_inspector_item: Option<SafeguardWasmItemKeyTesterItemIn>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SafeguardWasmGroupKeyArtifactIn {
    slot: i64,
    set: i64,
    #[serde(default)]
    faction: i64,
    #[serde(default)]
    main_stat: Option<SafeguardWasmMainStatRawIn>,
}

// pub(super) so improvement_chance submodule can derive faction-bucketing flags.
pub(super) fn safeguard_is_accessory_slot(slot: i64) -> bool {
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
pub fn safeguard_resolve_count_mode(
    mode: Option<SafeguardWasmCountMode>,
) -> SafeguardWasmCountMode {
    let seeded = mode.unwrap_or_else(safeguard_default_count_mode);
    safeguard_sanitize_count_mode(seeded)
}

pub fn safeguard_normalize_substat_match(raw: &str) -> String {
    // Normalize whitespace/casing so persisted files and UI payloads match.
    let trimmed = raw.trim();
    // perSubstat is a separate mode — pass through unchanged.
    if trimmed.eq_ignore_ascii_case(SAFEGUARD_SUBSTAT_PER_SUBSTAT) {
        return SAFEGUARD_SUBSTAT_PER_SUBSTAT.to_string();
    }
    // Legacy "all" token: keep as-is so safeguard_substat_min_count can resolve it
    // against the actual selection length at match time.
    if trimmed.eq_ignore_ascii_case(SAFEGUARD_SUBSTAT_ALL) {
        return SAFEGUARD_SUBSTAT_ALL.to_string();
    }
    // Numeric min-count tokens "1"–"4": pass through.
    if let Ok(n) = trimmed.parse::<u8>() {
        if n >= 1 && n <= 4 {
            return n.to_string();
        }
    }
    // Legacy "any" and unknown tokens collapse to "1" (at-least-one default).
    "1".to_string()
}

/// Returns the minimum number of selected substats that must be present.
/// Handles both legacy "all"/"any" tokens and new numeric "1"–"4" tokens.
pub(super) fn safeguard_substat_min_count(substat_match: &str, selected_len: usize) -> usize {
    // Legacy "all": every selected substat is required.
    if substat_match == SAFEGUARD_SUBSTAT_ALL {
        return selected_len;
    }
    // Numeric tokens specify the exact threshold; clamp to at least 1.
    if let Ok(n) = substat_match.trim().parse::<usize>() {
        return n.max(1);
    }
    // "any" / unknown → at least one.
    1
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

// pub(super) so improvement_chance can compute fallback roll gains and normalization.
pub(super) fn safeguard_substat_max6_by_variant(variant: i64) -> f64 {
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

// pub(super) so improvement_chance can normalize state values for scoring.
pub(super) fn safeguard_normalize_substat_value(variant: i64, value: f64) -> f64 {
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

// pub(super) so improvement_chance can replicate the tie-break percent→flat mapping.
pub(super) fn safeguard_percent_to_flat_main(variant: i64) -> Option<i64> {
    // Map percent mains to their flat counterpart for tie-priority logic.
    // Non HP/ATK/DEF mains have no flat companion and return None.
    match variant {
        SAFEGUARD_MAIN_HP_PERCENT => Some(SAFEGUARD_MAIN_HP_FLAT),
        SAFEGUARD_MAIN_ATK_PERCENT => Some(SAFEGUARD_MAIN_ATK_FLAT),
        SAFEGUARD_MAIN_DEF_PERCENT => Some(SAFEGUARD_MAIN_DEF_FLAT),
        _ => None,
    }
}

pub fn safeguard_normalize_set_selections(
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

// pub(super) so improvement_chance can build include/exclude set lookups for rule filters.
pub(super) fn safeguard_split_set_selections(values: &[SafeguardWasmSetSelection]) -> (HashSet<i64>, HashSet<i64>) {
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

pub fn safeguard_hash_combination(combination: &SafeguardWasmCombination) -> String {
    // Hash token order mirrors TS combination fingerprint construction.
    [
        safeguard_canonicalize_number_list(&combination.slots),
        safeguard_canonicalize_set_entries(&combination.sets),
        safeguard_canonicalize_string_list(&combination.meta_set_names),
        safeguard_canonicalize_number_list(&combination.ranks),
        safeguard_canonicalize_number_list(&combination.rarities),
        safeguard_canonicalize_number_list(&combination.main_stats),
        safeguard_canonicalize_number_list(&combination.factions),
    ]
    .join("|")
}

// Expose combination hashing so TS reuses Rust canonical token construction.
pub fn hash_safeguard_combination_core(combination: &SafeguardWasmCombination) -> String {
    safeguard_hash_combination(combination)
}

// Expose substat sorting so TS can reuse Rust priority + dedupe semantics.
pub fn sort_safeguard_substats_core(values: Vec<i64>) -> Vec<i64> {
    safeguard_sort_unique_substats(values)
}

// Expose full-combination sorting so TS can reuse Rust canonical ordering.
pub fn sort_safeguard_combination_core(combination: SafeguardWasmCombination) -> SafeguardWasmCombination {
    let SafeguardWasmCombination {
        slots,
        sets,
        meta_set_names,
        ranks,
        rarities,
        main_stats,
        factions,
    } = combination;
    SafeguardWasmCombination {
        slots: safeguard_sort_unique_slots(&slots),
        sets: safeguard_normalize_set_selections(&sets),
        meta_set_names: safeguard_sort_unique_meta_set_names(meta_set_names),
        ranks: safeguard_sorted_unique_i64(&ranks),
        rarities: safeguard_sorted_unique_i64(&rarities),
        main_stats: safeguard_sort_unique_main_stats(&main_stats),
        factions: safeguard_sorted_unique_i64(&factions),
    }
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
pub fn safeguard_variant_to_sub(variant: i64) -> (i64, bool) {
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
pub fn safeguard_clone_any_substats() -> Vec<RuleSubRaw> {
    vec![
        RuleSubRaw {
            ID: Some(STAT_ID_ANY),
            Value: Some(0.0),
            IsFlat: Some(true),
            NotAvailable: Some(false),
            Condition: Some(Arc::from("")),
        },
        RuleSubRaw {
            ID: Some(STAT_ID_ANY),
            Value: Some(0.0),
            IsFlat: Some(true),
            NotAvailable: Some(false),
            Condition: Some(Arc::from("")),
        },
        RuleSubRaw {
            ID: Some(STAT_ID_ANY),
            Value: Some(0.0),
            IsFlat: Some(true),
            NotAvailable: Some(false),
            Condition: Some(Arc::from("")),
        },
        RuleSubRaw {
            ID: Some(STAT_ID_ANY),
            Value: Some(0.0),
            IsFlat: Some(true),
            NotAvailable: Some(false),
            Condition: Some(Arc::from("")),
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
            IsFlat: Some(is_flat),
            NotAvailable: Some(false),
            Condition: Some(Arc::from(">=")),
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
        IsFlat: Some(is_flat),
        NotAvailable: Some(false),
        Condition: Some(Arc::from(">=")),
    };
    cloned
}

// Enumerate all combinations of `k` elements from `pool` (order-independent).
// Used to generate permutation rules for min-count substat anticipation.
fn safeguard_combinations(pool: &[i64], k: usize) -> Vec<Vec<i64>> {
    if k == 0 { return vec![vec![]]; }
    if k > pool.len() { return Vec::new(); }
    if k == pool.len() { return vec![pool.to_vec()]; }
    let mut result = Vec::new();
    // Recursive: include pool[0] in the combination, or skip it.
    let first = pool[0];
    let rest = &pool[1..];
    // Combinations that include `first`.
    for mut combo in safeguard_combinations(rest, k - 1) {
        combo.insert(0, first);
        result.push(combo);
    }
    // Combinations that exclude `first`.
    result.extend(safeguard_combinations(rest, k));
    result
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
            IsFlat: Some(is_flat),
            NotAvailable: Some(false),
            Condition: Some(Arc::from(">=")),
        };
        idx += 1;
    }
    cloned
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
    // rarity must be part of the key so rules that differ only by rarity are not
    // collapsed — each rarity variant is a distinct placeholder target.
    rarity: i64,
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
                    is_flat: sub.IsFlat.unwrap_or(false),
                    not_available: sub.NotAvailable.unwrap_or(false),
                    condition: sub.Condition.as_deref().unwrap_or_default().to_owned(),
                    value_bits: safeguard_normalize_f64_bits(sub.Value.unwrap_or(0.0), 0.0),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    SafeguardCanonicalRuleKey {
        keep: rule.Keep.unwrap_or(false),
        use_flag: rule.Use.unwrap_or(true),
        rank: rule.Rank.unwrap_or(0),
        rarity: rule.Rarity.unwrap_or(0),
        level: rule.LVLForCheck.unwrap_or(0),
        faction: rule.Faction.unwrap_or(0),
        main_stat_id: rule.MainStatID.unwrap_or(STAT_ID_ANY),
        main_stat_f_bits: safeguard_normalize_f64_bits(
            // MainStatF is now Option<i64>; cast to f64 for bit-stable canonical key.
            rule.MainStatF.map_or(1.0, |v| v as f64),
            1.0,
        ),
        artifact_types,
        artifact_sets,
        substats,
    }
}

// Returns Arc<str> so callers can .clone() the result O(1) times across a loop
// (each clone is a refcount bump, not a string copy).
fn safeguard_trim_name(name: &str) -> Option<Arc<str>> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(Arc::from(trimmed))
    }
}

// Consolidate placeholder rank values into pre-computed HSF rank codes.
// Consecutive selections ending at the maximum rank value (6★) collapse to a
// single GTE_* code, matching RSL Helper's "N stars or better" semantics.
// Non-consecutive or mid-range selections fall through to one code per value.
fn safeguard_consolidate_rank_options(ranks: &[i64]) -> Vec<i64> {
    let sorted = safeguard_sorted_unique_i64(ranks);
    if sorted.is_empty() {
        // Empty selection = wildcard; RANK_CODE_ANY matches any rank.
        return vec![RANK_CODE_ANY];
    }
    // Consecutive chain ending at the maximum rank value: map anchor to GTE code.
    let ends_at_max = *sorted.last().unwrap() == RANK_VALUE_MAX;
    let is_consecutive = sorted.windows(2).all(|w| w[1] == w[0] + 1);
    if ends_at_max && is_consecutive {
        let gte_code = match sorted[0] {
            1 => RANK_CODE_GTE_ONE,
            2 => RANK_CODE_GTE_TWO,
            3 => RANK_CODE_GTE_THREE,
            4 => RANK_CODE_GTE_FOUR,
            5 => RANK_CODE_GTE_FIVE,
            // Single top rank or unknown: fall back to exact Six code.
            _ => RANK_CODE_SIX,
        };
        return vec![gte_code];
    }
    // Non-GTE selection: emit one exact code per rank value (1..6 map directly).
    sorted.into_iter().map(|v| v.clamp(RANK_CODE_ONE, RANK_CODE_SIX)).collect()
}

// Consolidate placeholder rarity values into pre-computed HSF rarity codes.
// Consecutive selections ending at the maximum rarity value (Mythical) collapse
// to a single GTE_* code matching RSL Helper's "this rarity or better" semantics.
// Non-consecutive or mid-range selections fall through to one code per value.
fn safeguard_consolidate_rarity_codes(rarities: &[i64]) -> Vec<i64> {
    let sorted = safeguard_sorted_unique_i64(rarities);
    if sorted.is_empty() {
        return vec![RARITY_CODE_ANY];
    }
    // Consecutive chain ending at max rarity: map anchor value to its GTE code.
    let ends_at_max = *sorted.last().unwrap() == RANK_VALUE_MAX;
    let is_consecutive = sorted.windows(2).all(|w| w[1] == w[0] + 1);
    if ends_at_max && is_consecutive {
        let gte_code = match sorted[0] {
            1 => RARITY_CODE_GTE_COMMON,
            2 => RARITY_CODE_GTE_UNCOMMON,
            3 => RARITY_CODE_GTE_RARE,
            4 => RARITY_CODE_GTE_EPIC,
            5 => RARITY_CODE_GTE_LEGENDARY,
            // Single top rarity or unknown: fall back to the exact code.
            v => safeguard_rarity_value_to_code(v),
        };
        return vec![gte_code];
    }
    // Non-GTE selection: emit one exact code per rarity value.
    sorted.into_iter().map(safeguard_rarity_value_to_code).collect()
}

// Returns (rule, main_variant, effective_slots) triples so callers can filter substats
// that are impossible for the mainstat or not legal on any of the effective slots.
fn safeguard_build_placeholder_base_rules(
    combination: &SafeguardWasmCombination,
    recipe_id: i64,
    normalized_name: Option<&str>,
) -> Vec<(RuleRaw, i64, Vec<i64>)> {
    let slot_values = safeguard_sorted_unique_i64(&combination.slots);
    let (set_includes, _) = safeguard_split_set_selections(&combination.sets);
    let mut set_values = set_includes.into_iter().collect::<Vec<_>>();
    set_values.sort_unstable();
    // ACCESSORY_NO_SET_ID (-99) is the "no set" sentinel exclusive to accessory slots.
    // When the only set in the combination is this sentinel, only accessory slots can match.
    // Positive set IDs span both armor and accessory slots in RSL, so they need no filtering.
    let no_set_only = set_values.len() == 1 && set_values[0] == ACCESSORY_NO_SET_ID;
    let slot_values = if no_set_only && !slot_values.is_empty() {
        // Keep only accessory slots; skip the combination entirely if none remain.
        let accessory: Vec<i64> = slot_values.iter().copied()
            .filter(|&s| safeguard_is_accessory_slot(s))
            .collect();
        if accessory.is_empty() { return Vec::new(); }
        accessory
    } else {
        slot_values
    };
    let faction_values = safeguard_sorted_unique_i64(&combination.factions);
    // Consolidate consecutive rank/rarity chains ending at the maximum value into
    // a single GTE anchor so each placeholder group emits the fewest HSF rules.
    let rank_values = safeguard_consolidate_rank_options(&combination.ranks);
    let rarity_codes = safeguard_consolidate_rarity_codes(&combination.rarities);
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
    let mut rules = Vec::<(RuleRaw, i64, Vec<i64>)>::new();
    let mut seen = HashSet::<SafeguardCanonicalRuleKey>::new();
    for &rank in &rank_values {
        for &rarity_code in &rarity_codes {
            for faction in &faction_options {
                for main_variant in &main_variants {
                    // When slots are explicit and mainstat is concrete, emit only the slots
                    // where that mainstat is actually allowed. Skip the combination entirely
                    // when no slots remain — avoids unmatchable rules like Weapon + HP%.
                    let effective_slots: Vec<i64> = if !slot_values.is_empty() && *main_variant != STAT_VARIANT_ANY {
                        slot_values.iter().copied().filter(|&s| {
                            ALLOWED_MAINS_BY_SLOT.iter().any(|&(allowed_slot, mains)| {
                                allowed_slot == s && mains.contains(main_variant)
                            })
                        }).collect()
                    } else {
                        slot_values.clone()
                    };
                    if !slot_values.is_empty() && effective_slots.is_empty() {
                        continue;
                    }
                    let (main_id, main_f) = safeguard_variant_to_main(*main_variant);
                    let safeguard_rule = RuleRaw {
                        RecipeID: Some(recipe_id),
                        RecipeName: normalized_name.map(Arc::from),
                        Keep: Some(true),
                        IsRuleTypeAND: Some(false),
                        Use: Some(true),
                        ArtifactSet: if set_values.is_empty() {
                            None
                        } else {
                            Some(set_values.clone())
                        },
                        ArtifactType: if effective_slots.is_empty() {
                            None
                        } else {
                            Some(effective_slots.clone())
                        },
                        Rank: Some(rank),
                        Rarity: Some(rarity_code),
                        MainStatID: Some(main_id),
                        MainStatF: Some(main_f),
                        LVLForCheck: Some(LEVEL_ANY_SENTINEL),
                        Faction: Some(*faction),
                        Substats: Some(safeguard_clone_any_substats()),
                        source: Some(Arc::from(RULE_SOURCE_SAFEGUARDS)),
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
                    rules.push((safeguard_rule, *main_variant, effective_slots.clone()));
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
    safeguard_rule.safeguard_rule_id = Some(Arc::from(rule_id));
    safeguard_rule.safeguard_rule_ordinal = Some(rule_ordinal);
    safeguard_rule.safeguard_hash = Some(Arc::from(hash));
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
        for (base_rule, main_variant, effective_slots) in &base_rules {
            if has_placeholder_substat_filter {
                // Exclude substats that are impossible for this placeholder's mainstat.
                // A substat that equals the mainstat can never appear on that piece.
                // Also exclude substats not in ALLOWED_SUBS_BY_SLOT for single-slot rules —
                // only applied when there is exactly one effective slot to avoid over-filtering
                // multi-slot rules (where a substat valid on some slots but not others should
                // still be required on the slots where it is legal).
                let slot_sub_filter: Option<&[i64]> = if effective_slots.len() == 1 {
                    ALLOWED_SUBS_BY_SLOT.iter()
                        .find(|&&(s, _)| s == effective_slots[0])
                        .map(|(_, subs)| *subs)
                } else {
                    None
                };
                let possible_substats: Vec<i64> = placeholder_substats
                    .iter()
                    .copied()
                    .filter(|&v| *main_variant == SAFEGUARD_MAIN_ANY || v != *main_variant)
                    .filter(|v| slot_sub_filter.map_or(true, |allowed| allowed.contains(v)))
                    .collect();
                // No possible substats means every selected substat conflicts with this
                // mainstat — no valid placeholder rule can be emitted for this combination.
                if possible_substats.is_empty() {
                    continue;
                }
                // Resolve the min-count threshold from the token.
                // Legacy "all" maps to the full possible count; numeric tokens are direct.
                let min_count = safeguard_substat_min_count(&substat_match, possible_substats.len());
                // Clamp to what can actually fit in a single HSF rule (4 substat slots).
                let min_count = min_count.min(HSF_SUBSTAT_SLOT_COUNT).min(possible_substats.len());
                if min_count <= 1 {
                    // ≥1: one rule per substat (OR — any one is sufficient).
                    for variant in &possible_substats {
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
                } else if min_count >= possible_substats.len() {
                    // All required: one grouped rule with every possible substat.
                    let mut substat_rule = base_rule.clone();
                    substat_rule.Substats = Some(safeguard_build_placeholder_substats_group(
                        &possible_substats,
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
                    // ≥N (1 < N < total): enumerate C(possible, N) combinations and emit
                    // one AND-style grouped rule per combination. Each rule keeps a piece
                    // only when it has all N substats in that specific combination, so the
                    // union of all rules correctly keeps any piece with at least N matches.
                    // Cap at 70 combinations (C(8,4)) to prevent rule-count explosion.
                    const MAX_COMBINATIONS: usize = 70;
                    let combos = safeguard_combinations(&possible_substats, min_count);
                    if combos.len() <= MAX_COMBINATIONS {
                        for combo in &combos {
                            let mut substat_rule = base_rule.clone();
                            substat_rule.Substats = Some(safeguard_build_placeholder_substats_group(combo));
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
                    } else {
                        // Fallback: too many combinations to enumerate — emit the base rule
                        // with no substat constraint (keep-anything for this group).
                        let mut substat_rule = base_rule.clone();
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

// pub(super) so improvement_chance can skip disabled rules using the shared token check.
pub(super) fn safeguard_is_activation_off(raw: &str) -> bool {
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

pub fn build_safeguard_rules_core(
    rules: &[SafeguardWasmRuleIn],
    detection: Option<&SafeguardWasmSnapshotOut>,
    recipe_id_base: i64,
) -> Vec<RuleRaw> {
    let Some(detection_snapshot) = detection else {
        return Vec::<RuleRaw>::new();
    };

    // Build lookup maps by normalized rule id and by ordinal (1-based).
    // Ordinal-keyed map is preferred when entries carry rule_ordinal (new format);
    // id-keyed map remains for legacy detection snapshots that carry only rule_id.
    let mut detection_by_rule_id = HashMap::<String, &SafeguardWasmEntryOut>::new();
    let mut detection_by_ordinal = HashMap::<i64, &SafeguardWasmEntryOut>::new();
    for entry in &detection_snapshot.entries {
        if let Some(rule_id) = entry.rule_id.as_deref() {
            detection_by_rule_id.insert(rule_id.to_string(), entry);
        }
        if let Some(ordinal) = entry.rule_ordinal {
            detection_by_ordinal.insert(ordinal, entry);
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
        // Prefer ordinal-based lookup (new format); fall back to id-based (legacy).
        let entry = detection_by_ordinal
            .get(&safeguard_rule_ordinal)
            .or_else(|| detection_by_rule_id.get(rule_id.as_str()))
            .copied();
        let Some(entry) = entry else {
            continue;
        };
        // Detection rows decide whether this rule has artifact or placeholder output.
        // item_keys is the authoritative set of at-risk (sold) items selected for protection.
        // artifacts may include kept items for UI display; keep-rule emission must not use it.
        let should_emit_artifacts = !entry.item_keys.is_empty();
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
            // Build a fast lookup set from item_keys so we skip kept (non-at-risk) artifacts.
            // artifacts contains all matched items for UI; only item_keys items need keep rules.
            let protected_keys: HashSet<i64> = entry.item_keys.iter().copied().collect();
            // Emit one keep rule per item-key + covered level milestone pair.
            for artifact in &entry.artifacts {
                // Skip artifacts that are not in the at-risk set; they are kept already.
                if !protected_keys.contains(&artifact.item_key) {
                    continue;
                }
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
                        MainStatF: Some(main_f),
                        LVLForCheck: Some(level),
                        Faction: Some(artifact.faction),
                        Substats: Some(safeguard_build_substats_for_artifact(&artifact.substats)),
                        source: Some(Arc::from(RULE_SOURCE_SAFEGUARDS)),
                        line_idx: None,
                        all_known_sets: None,
                        rank_mask: None,
                        rarity_mask: None,
                        safeguard_rule_id: Some(Arc::from(rule_id.as_str())),
                        safeguard_rule_ordinal: Some(safeguard_rule_ordinal),
                        safeguard_hash: Some(Arc::from(rule_hash.as_str())),
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

// Typed core entry for safeguard rule generation — no JsValue I/O.
// The wasm crate provides the public #[wasm_bindgen] wrapper.
pub fn build_safeguard_rules_core_typed(
    rules: Vec<SafeguardWasmRuleIn>,
    detection: Option<SafeguardWasmSnapshotOut>,
    recipe_id_base: i64,
) -> Vec<RuleRaw> {
    build_safeguard_rules_core(&rules, detection.as_ref(), recipe_id_base)
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
        // Non-accessory groups normalize faction to zero -> empty factions selection.
        clone.factions = if group_sample.faction > 0 {
            vec![group_sample.faction]
        } else {
            Vec::new()
        };
        // Narrow slots to the class implied by the group sample so accessory-faction
        // placeholders never bleed into armor and the faction=0 armor placeholder never
        // matches accessories. Without this, a faction=0 placeholder with an empty slots
        // list would match any slot (including all accessories with any SPD).
        let is_accessory_group = safeguard_is_accessory_slot(group_sample.slot);
        let narrowed: Vec<i64> = if clone.slots.is_empty() {
            // No explicit slot constraint: widen to the full slot class.
            if is_accessory_group {
                vec![ARTIFACT_TYPE_RING, ARTIFACT_TYPE_AMULET, ARTIFACT_TYPE_BANNER]
            } else {
                vec![
                    ARTIFACT_TYPE_HELMET,
                    ARTIFACT_TYPE_CHESTPLATE,
                    ARTIFACT_TYPE_GAUNTLETS,
                    ARTIFACT_TYPE_BOOTS,
                    ARTIFACT_TYPE_WEAPON,
                    ARTIFACT_TYPE_SHIELD,
                ]
            }
        } else {
            // Explicit slot list: keep only slots belonging to the matching class.
            clone.slots
                .iter()
                .copied()
                .filter(|s| safeguard_is_accessory_slot(*s) == is_accessory_group)
                .collect()
        };
        clone.slots = narrowed;
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

// pub(super) so improvement_chance can apply combination filters using the shared wildcard logic.
pub(super) fn safeguard_matches_selection(selection: &[i64], candidate: i64) -> bool {
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
    let matched = safeguard_count_selected_substats(artifact, selected_substats);
    // Resolve the minimum count threshold from the match token.
    let min_count = safeguard_substat_min_count(substat_match, selected_substats.len());
    // Substats that duplicate the piece's mainstat can never appear on that piece;
    // they must not inflate the required total. SAFEGUARD_MAIN_ANY = no restriction.
    let possible_count = if artifact.main_stat == SAFEGUARD_MAIN_ANY {
        selected_substats.len()
    } else {
        selected_substats.iter().filter(|&&v| v != artifact.main_stat).count()
    };
    // Effective requirement is capped at what is actually achievable on this piece.
    let effective_required = min_count.min(possible_count);
    // Vacuously satisfied when no possible substat can satisfy the filter.
    if effective_required == 0 {
        return true;
    }
    matched >= effective_required
}

// pub(super) so improvement_chance can resolve weights with the shared fallback rule.
pub(super) fn safeguard_weight_for_variant(weights: &HashMap<i64, f64>, variant: i64) -> f64 {
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

// Average glyph enchantment value for a given gear rank and substat variant.
// Returns 0.0 for non-glyphable variants (CR, CDMG) or invalid inputs.
// Source data: shared/domain-constants.json → GLYPH_RANGES_BY_RANK (SSOT).
// Mirrors TS getGlyphAverageForVariant in substatRollNormalization.ts.
pub(super) fn glyph_average_for_variant(rank: i64, variant: i64) -> f64 {
    // CR and CDMG cannot receive glyphs.
    if variant == STAT_VARIANT_CR || variant == STAT_VARIANT_CDMG {
        return 0.0;
    }
    let clamped_rank = rank.clamp(1, 6);
    // Look up (variant, min, max) triple from the generated dispatch table.
    if let Some(entry) = GLYPH_RANGES_BY_RANK
        .iter()
        .find(|&&(r, _)| r == clamped_rank)
        .and_then(|&(_, triples)| triples.iter().find(|&&(v, _, _)| v == variant))
    {
        let (_, mn, mx) = *entry;
        return (mn as f64 + mx as f64) / 2.0;
    }
    0.0
}

// pub(super) so improvement_chance can use current-level scores, and so the ranking path
// can use it for standard-mode (no improvement_chance_threshold) candidate scoring.
pub(super) fn safeguard_compute_score(
    artifact: &SafeguardWasmArtifactIn,
    selected_substats: &[i64],
    weights: &HashMap<i64, f64>,
) -> f64 {
    // Weighted normalized sum mirrors safeguards.ts scoring semantics.
    // Includes glyph potential for present substats.
    let mut total = 0.0;
    for variant in selected_substats {
        // Read raw value for this variant from artifact substats.
        let raw = safeguard_stat_value_for_variant(artifact, *variant);
        // Normalize against canonical max roll baseline.
        let normalized = safeguard_normalize_substat_value(*variant, raw);
        // Resolve weight (default when not explicitly configured).
        let weight = safeguard_weight_for_variant(weights, *variant);
        total += weight * normalized;
        // Add glyph potential for present substats — mirrors TS scoring (SSOT).
        if raw > 0.0 {
            let glyph_avg = glyph_average_for_variant(artifact.rank, *variant);
            if glyph_avg > 0.0 {
                total += weight * safeguard_normalize_substat_value(*variant, glyph_avg);
            }
        }
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

// pub(super) so improvement_chance can build count keys to bucket challengers correctly.
pub(super) fn safeguard_count_key_from_parts(
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

// pub(super) so improvement_chance can stringify count keys for HashMap bucket lookups.
pub(super) fn safeguard_count_key_to_string(key: &SafeguardCountKey) -> String {
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
pub fn safeguard_count_key_core(parsed_artifact: SafeguardWasmCountKeyArtifactIn, parsed_mode: SafeguardWasmCountMode) -> String {
    // Sanitize count-mode flags before key computation.
    let mode = safeguard_sanitize_count_mode(parsed_mode);
    // Delegate to the shared Rust helper so key semantics stay SSOT.
    safeguard_count_key_to_string(&safeguard_count_key_from_parts(
        parsed_artifact.slot,
        parsed_artifact.set,
        parsed_artifact.faction,
        parsed_artifact.main_stat,
        mode,
    ))
}

// Expose item-key resolution so TS and Rust share DB-id-first fallback logic.
pub fn safeguard_item_key_core(parsed_artifact: SafeguardWasmItemKeyArtifactIn) -> i64 {
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
    artifact_id.or(gear_inspector_preview_id).or(gear_inspector_item_id).unwrap_or(0)
}

// Expose group-key derivation so TS reuses Rust accessory-faction normalization.
pub fn safeguard_group_key_core(parsed_artifact: SafeguardWasmGroupKeyArtifactIn) -> String {
    let main_stat = safeguard_main_stat_from_fast_payload(parsed_artifact.main_stat);
    // Delegate to shared formatter so all group-key callers stay in lockstep.
    safeguard_group_key_from_parts(
        parsed_artifact.slot,
        parsed_artifact.set,
        main_stat,
        parsed_artifact.faction,
    )
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
    // 1-based ordinal of this rule in the input safeguard list. Used as the lookup
    // dimension into per-rule improvement chances so each rule's threshold expansion
    // consults its OWN top-N chance, not the global union across rules.
    rule_ordinal: i64,
    // Pre-computed improvement chances keyed by (artifact id, rule_ordinal); used when
    // improvement_chance_threshold is set. BTreeMap chosen over HashMap for memory
    // stability under the talc allocator (matches the convention used elsewhere in this crate).
    improvement_chances: &BTreeMap<(i64, i64), f64>,
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
                // Always rank by current substat value. When a threshold is set, the
                // top-N is still determined by current score; improvement_chance is then
                // checked independently to expand the keep-list, not replace it.
                let score = safeguard_compute_score(
                    &candidate.artifact, selected_substats, &prepared_rule.weights,
                );
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
        // Tracks ALL candidates that are within quota (kept + sold top-N) for is_within_quota output.
        let mut within_quota_indices = HashSet::<usize>::new();
        let mut placeholders = Vec::<SafeguardWasmPlaceholderOut>::new();
        // Collect all scored candidates across groups for rank/quota output.
        let mut raw_candidates_for_output: Vec<SafeguardWasmScoredCandidate> = Vec::new();

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
            // Always select top-N by current-value score with tie-boundary extension.
            let top_n = safeguard_select_top_scored_candidates(&bucket, required_per_group, candidates);
            // When a threshold is set, additionally keep any items outside the top-N
            // whose improvement_chance meets the bar — the threshold expands the keep-list
            // rather than replacing the current-value selection.
            let selected: Vec<SafeguardWasmScoredCandidate> =
                if let Some(ref thresholds) = prepared_rule.improvement_chance_threshold {
                    let top_n_indices: HashSet<usize> =
                        top_n.iter().map(|e| e.candidate_idx).collect();
                    let mut expanded = top_n;
                    for e in bucket.iter() {
                        if top_n_indices.contains(&e.candidate_idx) {
                            continue; // already in top-N
                        }
                        let art_id = candidates[e.candidate_idx].artifact.id.unwrap_or(-1);
                        // Select the threshold slot for this artifact's current upgrade stage.
                        // Slots: [0..3, 4..7, 8..11, 12..15]; level ≥16 is never expanded.
                        let art_level = candidates[e.candidate_idx].artifact.level;
                        let slot = match art_level {
                            0..=3 => 0usize,
                            4..=7 => 1,
                            8..=11 => 2,
                            _ => 3,
                        };
                        let threshold = thresholds[slot];
                        // Look up the per-rule chance for this specific (artifact, rule_ordinal)
                        // pair. The chance is "probability this artifact lands in THIS rule's top-N"
                        // — so raising another rule's required_count cannot inflate this rule's
                        // expansion set (the bug that motivated this design).
                        if improvement_chances
                            .get(&(art_id, rule_ordinal))
                            .map_or(false, |&ch| ch >= threshold)
                        {
                            expanded.push(e.clone());
                        }
                    }
                    expanded
                } else {
                    top_n
                };
            // Collect entire bucket for output ranking (all candidates, not just selected).
            raw_candidates_for_output.extend(bucket.iter().cloned());
            // Artifact metadata covers ALL bucket candidates so the UI can look up slot/set
            // for every ranked candidate, not just the sold ones.
            for scored_entry in bucket.iter() {
                let candidate = &candidates[scored_entry.candidate_idx];
                artifacts.push(safeguard_to_detection_artifact(candidate));
            }
            // within_quota_set covers ALL top-N candidates (both kept and sold) so is_within_quota
            // is set correctly. selected_candidate_indices tracks only the sold subset for cascade.
            let within_quota_set: HashSet<usize> =
                selected.iter().map(|e| e.candidate_idx).collect();
            let mut group_total = 0i64;
            let mut group_kept = 0i64;
            let mut group_sold = 0i64;
            for scored_entry in selected {
                group_total += 1;
                let candidate_idx = scored_entry.candidate_idx;
                let candidate = &candidates[candidate_idx];
                if candidate_sold_state[candidate_idx] {
                    group_sold += 1;
                    // item_keys tracks only sold (at-risk) items selected for protection.
                    selected_candidate_indices.push(candidate_idx);
                    item_keys.push(candidate.item_key);
                } else {
                    group_kept += 1;
                }
            }
            // Accumulate per-group within-quota sets for the global is_within_quota output.
            within_quota_indices.extend(within_quota_set);
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
        // Build global ranked candidate output: sort all by score desc and assign ranks.
        raw_candidates_for_output
            .sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));
        // is_within_quota uses the full within_quota_indices (kept + sold top-N), not just sold.
        let candidates_out: Vec<SafeguardWasmCandidateOut> = raw_candidates_for_output
            .iter()
            .enumerate()
            .map(|(rank_idx, entry)| SafeguardWasmCandidateOut {
                item_key: candidates[entry.candidate_idx].item_key,
                score: entry.score,
                candidate_rank: (rank_idx + 1) as u32,
                is_within_quota: within_quota_indices.contains(&entry.candidate_idx),
            })
            .collect();
        return SafeguardWasmEntryEvalOut {
            entry: SafeguardWasmEntryOut {
                hash: prepared_rule.hash.clone(),
                combination: prepared_rule.combination.clone(),
                rule_id: Some(prepared_rule.id.clone()),
                rule_ordinal: None, // stamped by outer loop
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
                candidates: candidates_out,
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
        // item_keys tracks only sold (at-risk) items selected for protection.
        let item_keys = selected_sold
            .iter()
            .map(|idx| candidates[*idx].item_key)
            .collect::<Vec<_>>();
        // Artifact metadata covers ALL matching candidates so the UI can look up slot/set
        // for every candidate in the list, not just the sold ones.
        let artifacts = matching_indices
            .iter()
            .map(|idx| safeguard_to_detection_artifact(&candidates[*idx]))
            .collect::<Vec<_>>();
        // Non-ranking: all matching candidates emitted with rank=0; within-quota
        // means the item was already kept OR is in the at-risk selection.
        let selected_sold_set: HashSet<usize> = selected_sold.iter().copied().collect();
        let candidates_out: Vec<SafeguardWasmCandidateOut> = matching_indices
            .iter()
            .map(|idx| SafeguardWasmCandidateOut {
                item_key: candidates[*idx].item_key,
                score: 0.0,
                candidate_rank: 0,
                is_within_quota: !candidate_sold_state[*idx]
                    || selected_sold_set.contains(idx),
            })
            .collect();
        return SafeguardWasmEntryEvalOut {
            entry: SafeguardWasmEntryOut {
                hash: prepared_rule.hash.clone(),
                combination: prepared_rule.combination.clone(),
                rule_id: Some(prepared_rule.id.clone()),
                rule_ordinal: None, // stamped by outer loop
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
                candidates: candidates_out,
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

    // item_keys tracks only at-risk (sold) items selected for protection.
    let item_keys = at_risk
        .iter()
        .map(|idx| candidates[*idx].item_key)
        .collect::<Vec<_>>();
    // Non-ranking grouped: emit all matching candidates with rank=0.
    // Within-quota: already kept OR in at-risk selection.
    let at_risk_set: HashSet<usize> = at_risk.iter().copied().collect();
    // Artifact metadata covers ALL matching candidates (kept + sold) so the UI can look up
    // slot/set for every candidate in the list, not just the at-risk sold ones.
    let artifacts: Vec<SafeguardWasmArtifactOut> = group_counts
        .values()
        .flat_map(|group| group.kept.iter().chain(group.sold.iter()).copied())
        .map(|idx| safeguard_to_detection_artifact(&candidates[idx]))
        .collect();
    let candidates_out: Vec<SafeguardWasmCandidateOut> = group_counts
        .values()
        .flat_map(|group| group.kept.iter().chain(group.sold.iter()).copied())
        .map(|idx| SafeguardWasmCandidateOut {
            item_key: candidates[idx].item_key,
            score: 0.0,
            candidate_rank: 0,
            is_within_quota: !candidate_sold_state[idx] || at_risk_set.contains(&idx),
        })
        .collect();
    SafeguardWasmEntryEvalOut {
        entry: SafeguardWasmEntryOut {
            hash: prepared_rule.hash.clone(),
            combination: prepared_rule.combination.clone(),
            rule_id: Some(prepared_rule.id.clone()),
            rule_ordinal: None, // stamped by outer loop
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
            candidates: candidates_out,
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
    let mut candidates_merged = Vec::<SafeguardWasmCandidateOut>::new();
    let mut candidate_item_key_set = HashSet::<i64>::new();
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
        // Deduplicate candidate rows across per-substat entries.
        for candidate in entry.candidates {
            if candidate_item_key_set.insert(candidate.item_key) {
                candidates_merged.push(candidate);
            }
        }
    }
    SafeguardWasmEntryEvalOut {
        entry: SafeguardWasmEntryOut {
            hash: prepared_rule.hash.clone(),
            combination: prepared_rule.combination.clone(),
            rule_id: Some(prepared_rule.id.clone()),
            rule_ordinal: None, // stamped by outer loop
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
            candidates: candidates_merged,
        },
        selected_candidate_indices,
    }
}

// Expected-group payload uses the canonical wrapper shape from app-side callers.
// Core version accepts typed input (JsValue parsing is done in the wasm crate).
fn parse_safeguard_expected_groups_payload(
    expected_groups_payload: Option<SafeguardWasmExpectedGroupsPayloadIn>,
) -> SafeguardWasmExpectedGroupsPayloadIn {
    // None means no explicit expected-group metadata was supplied.
    expected_groups_payload.unwrap_or_default()
}

// Safeguard protection core evaluates prepared rules against candidate rows.
fn compute_safeguard_protection_core(
    parsed_candidates: Vec<SafeguardWasmCandidateIn>,
    parsed_rules: Vec<SafeguardWasmRuleIn>,
    expected_payload: SafeguardWasmExpectedGroupsPayloadIn,
    enabled: bool,
    now: f64,
    // Pre-computed improvement chances keyed by (artifact id, 1-based rule ordinal). Each rule
    // looks up its OWN chance — never the global union across rules — so cross-rule probability
    // inflation cannot drive an earlier rule's threshold expansion. BTreeMap chosen for
    // memory stability under the talc allocator (avoids HashMap's large contiguous backing
    // arrays that can fragment the heap between detection runs).
    improvement_chances: &BTreeMap<(i64, i64), f64>,
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
            // Resolve per-level thresholds to a concrete [f64; 4] array, clamping each slot.
            // Single/Array/Object variants are all normalized via into_slots_clamped().
            let improvement_chance_threshold = rule.improvement_chance_threshold
                .clone()
                .map(|v| v.into_slots_clamped());
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
                improvement_chance_threshold,
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
    // 1-based ordinal counter — matches the __safeguardRuleOrdinal stamped by build_safeguard_rules_core
    // so TypeScript can cross-reference detection entries back to the rule list by position.
    // Incremented at the START of each iteration so the value passed to safeguard_build_entry_for_substats
    // matches the ordinal stamped on the resulting entry (used as the dimension for per-rule
    // improvement_chance lookups).
    let mut rule_ordinal = 0i64;
    for prepared_rule in &prepared_rules {
        rule_ordinal += 1;
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
                        rule_ordinal,
                        improvement_chances,
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
                rule_ordinal,
                improvement_chances,
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
        let mut entry = eval_result.entry;
        // Stamp ordinal so TypeScript can reference back to the rule by position.
        entry.rule_ordinal = Some(rule_ordinal);
        entries.push(entry);
    }

    // Snapshot timestamp is sanitized to finite number for stable payloads.
    let scanned_at = if now.is_finite() { now } else { 0.0 };
    SafeguardWasmSnapshotOut { scanned_at, entries }
}

pub fn compute_safeguard_protection_core_pub(
    fast_candidates: Vec<SafeguardWasmCandidateFastIn>,
    rules: Vec<SafeguardWasmRuleIn>,
    expected_payload: Option<SafeguardWasmExpectedGroupsPayloadIn>,
    enabled: bool,
    now: f64,
    // Pre-computed improvement chances keyed by (artifact_id, 1-based rule_ordinal).
    // Empty map disables threshold gating entirely.
    improvement_chances: BTreeMap<(i64, i64), f64>,
) -> SafeguardWasmSnapshotOut {
    // Parse candidates from fast-path format.
    let parsed_candidates = safeguard_parse_candidates_payload(fast_candidates);
    // Parse rules (identity in core; parsing done in wasm crate).
    let parsed_rules = safeguard_parse_rules_payload(rules);
    // Resolve expected groups payload (None = empty default).
    let resolved_payload = parse_safeguard_expected_groups_payload(expected_payload);
    // Run the shared protection core.
    compute_safeguard_protection_core(
        parsed_candidates,
        parsed_rules,
        resolved_payload,
        enabled,
        now,
        &improvement_chances,
    )
}

// Combined safeguard export runs candidate collection + protection in one pass.
// Core version accepts pre-parsed typed inputs (JsValue parsing done in wasm crate).
#[allow(clippy::too_many_arguments)]
pub fn collect_and_compute_safeguard_protection_core(
    rows: Vec<SafeguardCollectRowIn>,
    rules: Vec<RuleRaw>,
    recipe_modes: Vec<String>,
    ignore_safeguard_recipe_indices: Option<Vec<i64>>,
    parsed_rules: Vec<SafeguardWasmRuleIn>,
    expected_payload: Option<SafeguardWasmExpectedGroupsPayloadIn>,
    enabled: bool,
    now: f64,
    // Pre-computed improvement chances keyed by (artifact_id, 1-based rule_ordinal).
    // Empty map disables threshold gating entirely.
    improvement_chances: BTreeMap<(i64, i64), f64>,
) -> Result<SafeguardCollectedAndProtectedSnapshotOut, String> {
    // Resolve expected groups payload (None = empty default).
    let expected_payload = parse_safeguard_expected_groups_payload(expected_payload);

    // Prepare and bucket base rules; collect-core uses slot-aware evaluation per row.
    let prepared_rules = rules.into_iter().map(prepare_rule).collect::<Vec<_>>();
    let bucketed_rules = BucketedRules::from_rules(prepared_rules);
    let collected = collect_safeguard_candidates_core(
        &rows,
        None, // no sidecar; row fields carry base_match_defined/base_match
        &bucketed_rules,
        &recipe_modes,
        &ignore_safeguard_recipe_indices.unwrap_or_default(),
    )?;
    // Convert collected rows into protection candidate payload shape.
    // artifact is reconstructed from rows[row_index] rather than cloned from the
    // candidate: SafeguardCollectedCandidateOut no longer carries the artifact field.
    let protection_candidates = collected
        .candidates
        .iter()
        .map(|candidate| SafeguardWasmCandidateIn {
            item_key: candidate.item_key,
            group_key: candidate.group_key.clone(),
            is_sold: candidate.is_sold,
            artifact: rows[candidate.row_index].artifact.clone(),
        })
        .collect::<Vec<_>>();
    // Run detection against collected candidates without a second JS roundtrip.
    let detection = compute_safeguard_protection_core(
        protection_candidates,
        parsed_rules,
        expected_payload,
        enabled,
        now,
        &improvement_chances,
    );
    // Return both candidate and detection payloads for TS call sites.
    Ok(SafeguardCollectedAndProtectedSnapshotOut {
        candidates: collected.candidates,
        unique_item_keys: collected.unique_item_keys,
        detection,
    })
}

// Protection scoring from pre-parsed typed candidates — used by the combined
// evaluate+collect engine path where SafeguardCollectRowIn is already available.
// Reconstructs SafeguardWasmCandidateIn entries from collected candidates + rows
// so the private compute_safeguard_protection_core can run without raw-format
// artifact conversion.
pub fn compute_safeguard_protection_from_collected_core(
    candidates: &[crate::SafeguardCollectedCandidateOut],
    rows: &[crate::SafeguardCollectRowIn],
    safeguard_rules: Vec<SafeguardWasmRuleIn>,
    expected_payload: Option<SafeguardWasmExpectedGroupsPayloadIn>,
    enabled: bool,
    now: f64,
    // Pre-computed improvement chances keyed by (artifact_id, 1-based rule_ordinal).
    // Empty map disables threshold gating entirely.
    improvement_chances: BTreeMap<(i64, i64), f64>,
) -> SafeguardWasmSnapshotOut {
    // Resolve expected groups payload (None = empty default).
    let expected = parse_safeguard_expected_groups_payload(expected_payload);
    // Rebuild inner candidate list from already-typed row artifacts.
    // row_index is validated by collect_safeguard_candidates_core so this cannot OOB.
    let protection_candidates = candidates
        .iter()
        .map(|candidate| SafeguardWasmCandidateIn {
            item_key: candidate.item_key,
            group_key: candidate.group_key.clone(),
            is_sold: candidate.is_sold,
            artifact: rows[candidate.row_index].artifact.clone(),
        })
        .collect::<Vec<_>>();
    compute_safeguard_protection_core(
        protection_candidates,
        safeguard_rules,
        expected,
        enabled,
        now,
        &improvement_chances,
    )
}

// Input payload for live preview scoring in the weight-configuration popover.
// Allows TS to rescore candidates with in-progress (unsaved) weights without
// re-running the full detection pass.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeguardWasmScorePreviewIn {
    // Candidate artifacts to score (substats carry raw values from the detection snapshot).
    pub artifacts: Vec<SafeguardWasmArtifactIn>,
    // Selected substat variants used in the scoring formula.
    pub substats: Vec<i64>,
    // Per-variant weight multipliers (key = variant as string, default = 1.0).
    pub weights: HashMap<i64, f64>,
    // Number of items the rule intends to keep (used for isWithinQuota).
    pub required_count: i64,
}

// Score and rank candidates with the given substats/weights for live popover preview.
// Uses a simplified single-group ranking (no tie-boundary extension) sufficient for UI.
pub fn score_safeguard_candidates_for_preview_core(
    input: SafeguardWasmScorePreviewIn,
) -> Vec<SafeguardWasmCandidateOut> {
    // Score each artifact; skip items with zero score (no matching substat rolls).
    let mut scored: Vec<(usize, f64)> = input
        .artifacts
        .iter()
        .enumerate()
        .filter_map(|(idx, artifact)| {
            let score = safeguard_compute_score(artifact, &input.substats, &input.weights);
            if score > 0.0 { Some((idx, score)) } else { None }
        })
        .collect();
    // Sort by score descending for rank assignment.
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(Ordering::Equal));
    let required = input.required_count.max(0) as usize;
    scored
        .iter()
        .enumerate()
        .map(|(rank_idx, &(artifact_idx, score))| {
            // Resolve item key: use artifact id if present, otherwise fall back to index.
            let item_key = input.artifacts[artifact_idx].id.unwrap_or(artifact_idx as i64);
            SafeguardWasmCandidateOut {
                item_key,
                score,
                candidate_rank: (rank_idx + 1) as u32,
                // Simplified quota: top-N without tie-boundary extension for preview use.
                is_within_quota: rank_idx < required,
            }
        })
        .collect()
}

#[cfg(test)]
mod improvement_chance_threshold_tests {
    use super::ImprovementChanceThresholdIn;

    // ── ImprovementChanceThresholdIn::into_slots_clamped ─────────────────────

    #[test]
    fn array_variant_preserves_all_slots() {
        // Pre-resolved 4-element array must pass through unchanged (after clamping).
        let slots = ImprovementChanceThresholdIn::Array([25.0, 35.0, 50.0, 65.0]).into_slots_clamped();
        assert_eq!(slots, [25.0, 35.0, 50.0, 65.0]);
    }

    #[test]
    fn object_null_slots_inherit_from_left() {
        // atLevel4/8/12 are None — each must inherit the resolved value of its left neighbor.
        let slots = ImprovementChanceThresholdIn::Object {
            at_level_0: 30.0,
            at_level_4: None,
            at_level_8: None,
            at_level_12: None,
        }
        .into_slots_clamped();
        assert_eq!(slots, [30.0, 30.0, 30.0, 30.0]);
    }

    #[test]
    fn object_partial_null_chain_inherits_last_set_value() {
        // atLevel4=40 is set; atLevel8/12 are None so they inherit atLevel4's resolved value.
        let slots = ImprovementChanceThresholdIn::Object {
            at_level_0: 25.0,
            at_level_4: Some(40.0),
            at_level_8: None,
            at_level_12: None,
        }
        .into_slots_clamped();
        assert_eq!(slots, [25.0, 40.0, 40.0, 40.0]);
    }

    // ── level → slot mapping ──────────────────────────────────────────────────
    // Verify the slot selection expression used in the gating branch picks the
    // correct [f64; 4] index for each upgrade stage.

    fn level_to_slot(level: i64) -> usize {
        // Mirror of the gating logic in safeguard_run_for_rule_impl (~line 2845).
        match level {
            0..=3  => 0,
            4..=7  => 1,
            8..=11 => 2,
            _      => 3,
        }
    }

    #[test]
    fn slot_0_covers_levels_0_through_3() {
        for lvl in [0i64, 1, 2, 3] {
            assert_eq!(level_to_slot(lvl), 0, "level {lvl} should map to slot 0");
        }
    }

    #[test]
    fn slot_1_covers_levels_4_through_7() {
        for lvl in [4i64, 5, 6, 7] {
            assert_eq!(level_to_slot(lvl), 1, "level {lvl} should map to slot 1");
        }
    }

    #[test]
    fn slot_2_covers_levels_8_through_11() {
        for lvl in [8i64, 9, 10, 11] {
            assert_eq!(level_to_slot(lvl), 2, "level {lvl} should map to slot 2");
        }
    }

    #[test]
    fn slot_3_covers_levels_12_through_16() {
        // Level 16 (fully upgraded) never reaches the gating branch, but the slot
        // mapping must still be correct for levels 12–15.
        for lvl in [12i64, 13, 14, 15, 16] {
            assert_eq!(level_to_slot(lvl), 3, "level {lvl} should map to slot 3");
        }
    }
}
