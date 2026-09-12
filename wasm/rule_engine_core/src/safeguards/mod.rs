use super::*;
use crate::matcher_evaluator::{collect_safeguard_candidates_core, prepare_rule, BucketedRules};
use crate::SafeguardCollectedAndProtectedSnapshotOut;
use std::cell::{Cell, RefCell};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;
// ts-rs trait import enables `#[derive(TS)]` on the wasm wire structs below; ts-rs
// emits one .ts file per derived type into the rust-types/ output directory at
// `cargo test` time (see ensure-rule-engine-wasm.mjs for the TS_RS_* env vars).
use ts_rs::TS;

// Fast-path input types and conversion functions live in a dedicated submodule
// to keep this file focused on rule resolution and scoring logic.
pub mod fast_path_types;
// Improvement-chance probabilistic computation lives in its own submodule so the
// recursion and scenario-building logic stay separated from snapshot evaluation.
pub mod improvement_chance;
// Improvement-watch corner synthesis: post-detection pass that turns zero-missing
// "watch" placeholders into minimal-substat-value corner frontiers (or removes them).
mod improvement_watch;
// Safeguard groups: the single authority for contiguous-run resolution over the flat
// Safeguards array. TypeScript calls into it rather than mirroring it.
pub mod groups;
// Detection-path tests for groups, kept out of this file (already past the size guideline).
#[cfg(test)]
mod group_tests;
// Re-export pub(crate) structs that lib.rs imports via `use safeguards::*`.
pub use fast_path_types::SafeguardWasmArtifactIn;
// Pull in internal types and conversion helpers used by the functions below.
use fast_path_types::{
    safeguard_collect_row_from_fast_payload, safeguard_convert_fast_artifact, safeguard_main_stat_from_fast_payload,
    SafeguardCollectRowFastIn, SafeguardWasmCandidateFastIn, SafeguardWasmCandidateIn, SafeguardWasmMainStatRawIn,
};

// Epsilon is used only for tie expansion at the score boundary.
const SAFEGUARD_SCORE_TIE_EPSILON: f64 = 1e-9;
// Placeholder samples need stable defaults when no bucket sample exists.
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
// Shared bucketed-bucket token keeps per-rule mode branch-free and centralized.
const SAFEGUARD_COUNT_KEY_GLOBAL: &str = "global";
// Equipped-location tokens are parsed once into booleans for hot match loops.
const SAFEGUARD_EQUIPPED_LOCATION_COLLECTION: &str = "collection";
const SAFEGUARD_EQUIPPED_LOCATION_VAULT: &str = "vault";
const SAFEGUARD_EQUIPPED_LOCATION_RESERVE_VAULT: &str = "reserveVault";

// Convert fast-path candidates into protection candidates with deterministic fallbacks.
fn safeguard_candidate_from_fast_payload(candidate: SafeguardWasmCandidateFastIn) -> SafeguardWasmCandidateIn {
    let (artifact, _) = safeguard_convert_fast_artifact(candidate.artifact);
    let bucket_key = candidate
        .bucket_key
        .map(|inner| inner.trim().to_string())
        .filter(|inner| !inner.is_empty())
        .unwrap_or_else(|| safeguard_bucket_key_from_artifact(&artifact));
    SafeguardWasmCandidateIn {
        item_key: candidate.item_key.or(artifact.id).unwrap_or(0),
        bucket_key,
        is_sold: candidate.is_sold,
        artifact,
    }
}

// Accessory slots keep faction while artifact slots collapse to zero by design.
// This helper keeps all faction-normalization branches single-sourced.
pub fn safeguard_normalized_faction_for_slot(slot: i64, faction: i64) -> i64 {
    if safeguard_is_accessory_slot(slot) {
        faction
    } else {
        0
    }
}

// Bucket-key dimensions always normalize faction the same way before encoding.
// Export this so matcher and parser call sites reuse one formatting helper.
pub fn safeguard_bucket_key_from_parts(slot: i64, set: i64, main_stat: i64, faction_raw: i64) -> String {
    let normalized_faction = safeguard_normalized_faction_for_slot(slot, faction_raw);
    format!("{slot}:{set}:{main_stat}:{normalized_faction}")
}

// Bucket-key helper keeps fallback key generation identical to collect-core rules.
// Non-accessory slots normalize faction to zero before hashing dimensions.
//
// Public because the native DLL projects the collector's candidates back into per-artifact
// rank rows and must name the SAME bucket the collector ranked in — re-composing the parts
// at that call site would be a second definition of which dimensions a bucket is made of.
pub fn safeguard_bucket_key_from_artifact(artifact: &SafeguardWasmArtifactIn) -> String {
    safeguard_bucket_key_from_parts(artifact.slot, artifact.set, artifact.main_stat, artifact.faction)
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

// ts-rs export: simple Selection record nested inside SafeguardWasmCombination.
#[derive(Debug, Deserialize, Serialize, Clone, Default, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmSetSelection {
    pub id: i64,
    #[serde(default)]
    pub excluded: bool,
}

// ts-rs export: composes SafeguardWasmSetSelection.
#[derive(Debug, Deserialize, Serialize, Clone, Default, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
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
) -> Result<Option<BTreeMap<i64, f64>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let raw = Option::<BTreeMap<String, f64>>::deserialize(deserializer)?;
    Ok(raw.map(|entries| {
        entries
            .into_iter()
            .filter_map(|(key, value)| key.parse::<i64>().ok().map(|variant| (variant, value)))
            .collect::<BTreeMap<i64, f64>>()
    }))
}

// ts-rs export: per-rule count-mode flags; consumed by detection bucketing.
#[derive(Debug, Deserialize, Serialize, Clone, Copy, Default, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
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
//
// ts-rs export: untagged enums emit a TS union (`Array | Object`).  The Array variant
// is `[number, number, number, number]` (fixed-length tuple) and the Object variant
// emits an interface with at_level_0/at_level_4/... renamed via the field-level
// `#[serde(rename = ...)]` attributes — ts-rs honors those passthroughs.
#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[serde(untagged)]
#[ts(export)]
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

// Map an artifact level onto its improvement-chance threshold slot: bands [0..3] → 0,
// [4..7] → 1, [8..11] → 2, and 12+ (including maxed +16 pieces) → 3 (the level-12 value).
// SSOT for detection's threshold expansion and improvement-watch corner probing.
pub(super) fn safeguard_threshold_slot_for_level(level: i64) -> usize {
    match level {
        0..=3 => 0usize,
        4..=7 => 1,
        8..=11 => 2,
        _ => 3,
    }
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
            Self::Object {
                at_level_0,
                at_level_4,
                at_level_8,
                at_level_12,
            } => {
                let l0 = at_level_0.clamp(0.0, 100.0);
                let l4 = at_level_4.unwrap_or(l0).clamp(0.0, 100.0);
                let l8 = at_level_8.unwrap_or(l4).clamp(0.0, 100.0);
                let l12 = at_level_12.unwrap_or(l8).clamp(0.0, 100.0);
                [l0, l4, l8, l12]
            }
        }
    }
}

// ts-rs export: top-level safeguard rule input shared by most safeguard wasm entries.
// Composes SafeguardWasmCombination + SafeguardWasmCountMode + ImprovementChanceThresholdIn.
// substat_weights BTreeMap<i64, f64> emits as `{ [key in number]: number }` (string-keyed
// at runtime via serialize_i64_key_map — JS coerces numeric/string keys transparently).
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
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
    pub substat_weights: Option<BTreeMap<i64, f64>>,
    // "Weight by Rank" toggle: when true, the score adds a main-stat rank bonus so a higher-rank
    // piece (e.g. 6★) outscores a same-main near-equal lower-rank (5★). None/absent = off, which
    // preserves the scoring of safeguards saved before this field existed.
    #[serde(default)]
    pub weight_main_stat_by_rank: Option<bool>,
    // Tunable multiplier on the "Weight by Rank" main-stat bonus. None/absent = 1.0, which
    // preserves the scoring of safeguards saved before this field existed. Inert when the
    // weight_main_stat_by_rank toggle is off.
    #[serde(default)]
    pub main_stat_rank_weight_factor: Option<f64>,
    // Per-level improvement-chance thresholds. Accepts legacy single-number, resolved [f64;4]
    // array, or the raw object form with null-inheritance slots. When None, improvement-chance
    // filtering is disabled and candidates are selected by standard top-N ranking only.
    #[serde(default)]
    pub improvement_chance_threshold: Option<ImprovementChanceThresholdIn>,
    // Opaque string tags used by the safeguard-overrides DSL selector matching. Passed through
    // unchanged so TS can apply selector-matched override instructions after metaset expansion.
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    // ── Group membership (see safeguards/groups.rs) ─────────────────────────────────────
    // Present on every member of a group; absent on an ungrouped rule. Adjacent members with
    // the same `id` form one run, and the run's FIRST member's `required_count`/`count_mode`
    // are the settings the engine reads (the TypeScript normalizer keeps all members equal).
    #[serde(default)]
    pub group: Option<SafeguardWasmGroupIn>,
}

// ts-rs export: the group settings a member carries inline. A group is not an entry of its
// own — it merges its members' feeds into buckets keyed by `count_mode` and keeps
// `required_count` out of each. Nested by name from SafeguardWasmRuleIn / SafeguardWasmResolvedRuleOut.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmGroupIn {
    // Opaque unique id; membership is "adjacent AND same id". RUNTIME ONLY — the SFC identifies a
    // group by shape (one entry holding its members), so this is minted on load, never persisted.
    pub id: String,
    // How many pieces the group keeps per merged bucket. Absent → 1, like every count.
    #[serde(default)]
    pub required_count: Option<i64>,
    // The chips that define the merged buckets. Absent → the default (per-rule) mode.
    #[serde(default)]
    pub count_mode: Option<SafeguardWasmCountMode>,
}

// Resolved safeguard rule payload returned after metaset expansion in lib.rs.
//
// ts-rs export: composes SafeguardWasmCombination, SafeguardWasmCountMode,
// ImprovementChanceThresholdIn.  substat_weights is BTreeMap<String, f64> which ts-rs
// emits as `{ [key in string]: number }` (matching wasm_to_js's plain-object output).
#[derive(Debug, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
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
    pub substat_weights: BTreeMap<String, f64>,
    // Threshold echoed back verbatim so TS preserves null-inheritance slots (e.g. Lenient preset).
    pub improvement_chance_threshold: Option<ImprovementChanceThresholdIn>,
    // Opaque string tags passed through from the input rule unchanged.
    pub tags: Vec<String>,
    // Group membership echoed back verbatim so metaset-expansion consumers keep the structure
    // intact. Expansion rewrites the combination, never the structure.
    pub group: Option<SafeguardWasmGroupIn>,
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

// ts-rs export: nested by SafeguardWasmExpectedBucketIn.sample.  Promoted to `pub`.
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmExpectedSampleIn {
    pub slot: i64,
    pub set: i64,
    pub faction: i64,
    pub main_stat: i64,
}

// ts-rs export: nested by SafeguardWasmExpectedBucketsPayloadIn.expectedBucketsByRuleId.
// Promoted to `pub` so ts-rs can resolve the nested reference.
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmExpectedBucketIn {
    pub key: String,
    pub sample: SafeguardWasmExpectedSampleIn,
}

// ts-rs export: BTreeMap<String, Vec<i64>> serializes through serialize_maps_as_objects
// to a plain JS object — ts-rs emits `{ [key in string]: Array<number> }`.
// Fields are `pub` (required by ts-rs) but only the in-crate code mutates them.
// Wire names are short (1-3 chars) for compact payload crossing the boundary.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct SafeguardWasmExpectedBucketDomainIn {
    #[serde(rename = "so", alias = "slotOrder")]
    #[ts(rename = "so")]
    pub slot_order: Vec<i64>,
    #[serde(rename = "acs", alias = "accessoryCompatibleSetIds")]
    #[ts(rename = "acs")]
    pub accessory_compatible_set_ids: Vec<i64>,
    #[serde(rename = "ams", alias = "artifactCompatibleSetIds")]
    #[ts(rename = "ams")]
    pub artifact_compatible_set_ids: Vec<i64>,
    #[serde(rename = "amb", alias = "allowedMainBySlot")]
    #[ts(rename = "amb")]
    pub allowed_main_by_slot: BTreeMap<String, Vec<i64>>,
    #[serde(rename = "afi", alias = "allFactionIds")]
    #[ts(rename = "afi")]
    pub all_faction_ids: Vec<i64>,
}

// ts-rs export: input wrapper around the expected-bucket precomputation payload.
// Fields are `pub` (required by ts-rs).
#[derive(Debug, Deserialize, Default, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmExpectedBucketsPayloadIn {
    #[serde(default)]
    pub expected_buckets_by_rule_id: BTreeMap<String, Vec<SafeguardWasmExpectedBucketIn>>,
    pub expected_bucket_domain: Option<SafeguardWasmExpectedBucketDomainIn>,
}

// Normalize safeguard expected-bucket domain arrays/maps in Rust so sorting,
// de-duplication, and slot ordering remain single-sourced with matcher logic.
pub fn normalize_safeguard_expected_bucket_domain_core(
    parsed: SafeguardWasmExpectedBucketDomainIn,
) -> SafeguardWasmExpectedBucketDomainIn {
    // Slot order uses domain helper so fallback ordering stays consistent.
    let slot_order = safeguard_domain_slot_order(&parsed);
    // Set/faction arrays collapse to sorted unique integer domains.
    let accessory_compatible_set_ids = safeguard_sorted_unique_i64(&parsed.accessory_compatible_set_ids);
    let artifact_compatible_set_ids = safeguard_sorted_unique_i64(&parsed.artifact_compatible_set_ids);
    let all_faction_ids = safeguard_sorted_unique_i64(&parsed.all_faction_ids)
        .into_iter()
        .filter(|value| *value > 0)
        .collect::<Vec<_>>();
    // Per-slot mains are normalized with the same sorted/unique helper.
    let mut allowed_main_by_slot = BTreeMap::<String, Vec<i64>>::new();
    for (slot_key, values) in &parsed.allowed_main_by_slot {
        allowed_main_by_slot.insert(slot_key.to_string(), safeguard_sorted_unique_i64(values));
    }

    let normalized = SafeguardWasmExpectedBucketDomainIn {
        slot_order,
        accessory_compatible_set_ids,
        artifact_compatible_set_ids,
        allowed_main_by_slot,
        all_faction_ids,
    };

    // Return the normalized domain payload for use in Rust pipelines.
    normalized
}

// Metaset payload for in-wasm safeguard set expansion.
// `name` is the primary key after the metaset ID→name migration.
//
// ts-rs export: input metaset record for resolve_safeguard_rules_with_metasets_value.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmMetasetIn {
    pub name: String,
    #[serde(default)]
    pub sets: Vec<i64>,
}

// ts-rs export: nested by name from SafeguardWasmArtifactOut.substats.
// Now `pub` (required by ts-rs for `export`) — fields pub for the same reason;
// only emit-side code in this module constructs these values.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmSubstatOut {
    pub variant: i64,
    pub is_flat: bool,
    pub value: f64,
}

// ts-rs export: nested by name from SafeguardWasmEntryOut.artifacts.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmArtifactOut {
    pub item_key: i64,
    pub slot: i64,
    pub set: i64,
    pub rank: i64,
    pub rarity: i64,
    pub level: i64,
    pub exact_level: Option<i64>,
    pub faction: i64,
    pub main_stat: i64,
    pub substats: Vec<SafeguardWasmSubstatOut>,
}

// Per-candidate, per-substat bucket membership for `perSubstat` rules. A perSubstat rule is
// scored once per selected substat, so a single artifact can sit in several independent
// substat sub-buckets (e.g. strong on both HP% and DEF%). This records, for each substat the
// item ranks in, its 1-based rank WITHIN that substat's bucket bucket and whether it made
// that substat's top-N quota. The substat-weights flyout reads this to scope a focus click to a
// concrete (bucket × substat) sub-bucket. Empty on non-perSubstat rules (top-level
// bucket_rank/candidate_rank already fully describe those).
//
// ts-rs export: leaf type referenced by SafeguardWasmCandidateOut.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmSubstatBucketOut {
    // Numeric substat variant (StatVariant) this sub-bucket ranks by.
    pub variant: i64,
    // 1-based rank within this substat's own bucket bucket (mirrors bucket_rank semantics).
    pub bucket_rank: u32,
    // True when the candidate is in this substat's top-N selection.
    pub is_within_quota: bool,
}

// Per-candidate scored output exposed in detection entries for UI overlays.
// candidateRank is 1-based (1 = best score) across ALL of this rule's buckets (global rank);
// bucketRank is 1-based within the candidate's own bucket bucket. Both are 0 on the
// non-ranking path. isWithinQuota is true when the candidate is among the top-N selected.
//
// ts-rs export: leaf type referenced by SafeguardWasmEntryOut and the live preview path.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmCandidateOut {
    pub item_key: i64,
    pub score: f64,
    pub candidate_rank: u32,
    pub bucket_rank: u32,
    pub is_within_quota: bool,
    // Per-substat sub-bucket ranks for `perSubstat` multi-substat rules; empty otherwise.
    // Serde default keeps snapshots persisted before this field existed loadable.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub substat_buckets: Vec<SafeguardWasmSubstatBucketOut>,
}

// ts-rs export: one substat threshold of an improvement-watch corner rule.
// min_value is an absolute raw stat value compared with `>=` semantics at merge time.
// Always a whole number: gear substats only roll integers, so decimal thresholds are
// fake precision — corners are integerized and probe-verified in improvement_watch.rs.
// PartialEq: corner equality drives the cross-bucket cache test assertions.
#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWatchCornerSubstatOut {
    pub variant: i64,
    pub min_value: f64,
}

// ts-rs export: one minimal-viable "corner" on the improvement-watch frontier.
// Each corner pins one exact rank + a contiguous rarity run + one level milestone plus
// per-substat value floors; merge-time emission turns every corner into HSF keep rules
// so only drops whose improvement chance clears the rule threshold stay protected.
// PartialEq: corner equality drives the cross-bucket cache test assertions.
#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWatchCornerOut {
    pub rank: i64,
    // Sorted-ascending CONTIGUOUS rarity run this corner covers. Rarity only affects the
    // substat reveal schedule (roll values depend on rank), so per-rarity frontiers often
    // coincide — always at +16 — and improvement_watch.rs consolidates them into runs.
    // Emission maps a run onto HSF rarity codes via safeguard_consolidate_rarity_codes.
    pub rarities: Vec<i64>,
    pub level: i64,
    pub substats: Vec<SafeguardWatchCornerSubstatOut>,
}

// ts-rs export: nested by name from SafeguardWasmEntryOut.placeholders.
// Now `pub` (required by ts-rs `export`).
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmPlaceholderOut {
    pub combination: SafeguardWasmCombination,
    pub missing: i64,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub substat_variants: Option<Vec<i64>>,
    // Concrete bucket dimensions observed for satisfied (missing = 0) improvement-watch
    // buckets; corner synthesis probes chances against these dims. None on deficit
    // placeholders and on snapshots persisted before this field existed (serde default).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sample: Option<SafeguardWasmBucketSample>,
    // Improvement-watch corner frontier attached post-detection (improvement_watch.rs).
    // None until attached; zero-missing placeholders without corners are removed there.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub watch_corners: Option<Vec<SafeguardWatchCornerOut>>,
}

// ts-rs export: composite output entry referenced by SafeguardWasmSnapshotOut.entries.
// Wire names are short (1-3 chars) for compact payload; nested combination/count_mode
// keep their camelCase names (SafeguardWasmCombination / SafeguardWasmCountMode are not minified).
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct SafeguardWasmEntryOut {
    #[serde(rename = "h")]
    #[ts(rename = "h")]
    pub hash: String,
    #[serde(rename = "co")]
    #[ts(rename = "co")]
    pub combination: SafeguardWasmCombination,
    #[serde(rename = "ri")]
    #[ts(rename = "ri")]
    pub rule_id: Option<String>,
    // 1-based position of this rule in the input list; matches __safeguardRuleOrdinal on HSF rules.
    #[serde(rename = "ro", skip_serializing_if = "Option::is_none")]
    #[ts(rename = "ro")]
    pub rule_ordinal: Option<i64>,
    #[serde(rename = "ra")]
    #[ts(rename = "ra")]
    pub rule_activation: String,
    #[serde(rename = "cm")]
    #[ts(rename = "cm")]
    pub count_mode: SafeguardWasmCountMode,
    #[serde(rename = "pgc")]
    #[ts(rename = "pgc")]
    pub per_bucket_required_count: i64,
    #[serde(rename = "gt")]
    #[ts(rename = "gt")]
    pub buckets_tracked: i64,
    #[serde(rename = "rc")]
    #[ts(rename = "rc")]
    pub required_count: i64,
    #[serde(rename = "cc")]
    #[ts(rename = "cc")]
    pub current_count: i64,
    #[serde(rename = "pc")]
    #[ts(rename = "pc")]
    pub projected_count: i64,
    #[serde(rename = "d")]
    #[ts(rename = "d")]
    pub deficit: i64,
    #[serde(rename = "cbe")]
    #[ts(rename = "cbe")]
    pub covered_by_existing: bool,
    #[serde(rename = "ik")]
    #[ts(rename = "ik")]
    pub item_keys: Vec<i64>,
    #[serde(rename = "ar")]
    #[ts(rename = "ar")]
    pub artifacts: Vec<SafeguardWasmArtifactOut>,
    // Merge-time placeholder requests. These NEVER cross the JS boundary (serde+ts skip):
    // on real accounts they number in the hundreds of thousands (rules × expected-bucket
    // domain) and were the dominant wasm→JS materialization + clone + merge round-trip
    // cost. Detection moves them into the wasm-resident hand-off store
    // (stash_detection_placeholders) and merge-time emission reads them back via the
    // snapshot's placeholder_state_id (rehydrate_detection_placeholders). JS sees only
    // the count + fingerprint fields below. Rust tests/native callers may populate this
    // field directly — a non-empty field always wins over the resident store.
    #[serde(skip)]
    #[ts(skip)]
    pub placeholders: Vec<SafeguardWasmPlaceholderOut>,
    // Number of placeholder requests behind this entry (JS-visible; the objects
    // themselves stay wasm-resident). Filled by stash_detection_placeholders.
    #[serde(rename = "plc", default)]
    #[ts(rename = "plc")]
    pub placeholder_count: i64,
    // Order-sensitive fingerprint over every placeholder's (missing, reason, substat
    // variants, corner count) — the ingredients the worker's detectionKey previously
    // folded in JS by iterating all placeholders. Computing it here at stash time makes
    // the JS fingerprint pass O(entries) instead of O(placeholders).
    #[serde(rename = "plf", default)]
    #[ts(rename = "plf")]
    pub placeholder_fingerprint: String,
    // All matched+scored candidates with their ranks; omitted from old snapshots (default = empty).
    #[serde(rename = "ca", default)]
    #[ts(rename = "ca")]
    pub candidates: Vec<SafeguardWasmCandidateOut>,
}

// ts-rs export: top-level safeguard snapshot returned by detection.
// Wire names are short for compact payload crossing the WASM boundary.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct SafeguardWasmSnapshotOut {
    #[serde(rename = "sa")]
    #[ts(rename = "sa")]
    pub scanned_at: f64,
    #[serde(rename = "e")]
    #[ts(rename = "e")]
    pub entries: Vec<SafeguardWasmEntryOut>,
    // Id of the wasm-resident placeholder store this snapshot's entries were stashed
    // into (stash_detection_placeholders). A merge input whose entries report
    // placeholder_count > 0 must present the engine's CURRENT store id — that guards
    // against silently merging a stale snapshot against newer resident placeholders.
    // None ⇔ nothing stashed (detection disabled/empty, or a test-built snapshot whose
    // entries carry their placeholders directly in the skipped field).
    #[serde(rename = "pid", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "pid", optional)]
    pub placeholder_state_id: Option<i64>,
}

// ─── wasm-resident placeholder hand-off (detection → merge) ─────────────────────
// Placeholder requests never leave the wasm instance: detection stashes them here and
// merge-time emission rehydrates them, so the ~10^5-object lists stop being materialized
// as JS objects, structured-cloned to the main thread, and re-serialized back into wasm
// for every merge. One generation only — each detection replaces the previous store,
// matching the detection→merge call order of every production pipeline (worker, headless
// background push, native DLL, repro harness).
struct ResidentPlaceholderEntry {
    // Entry hash at stash time; rehydration re-checks it so an index-aligned lookup can
    // never silently pair a stale store with a different snapshot shape.
    hash: String,
    placeholders: Vec<SafeguardWasmPlaceholderOut>,
}
struct ResidentPlaceholderState {
    state_id: i64,
    entries: Vec<ResidentPlaceholderEntry>,
}
thread_local! {
    static RESIDENT_PLACEHOLDERS: RefCell<Option<ResidentPlaceholderState>> =
        const { RefCell::new(None) };
    // Monotonic id source; wasm is single-threaded so a plain Cell suffices.
    static NEXT_PLACEHOLDER_STATE_ID: Cell<i64> = const { Cell::new(1) };
}

// Order-sensitive 64-bit fold over the fingerprint ingredients of one placeholder list:
// (missing, reason, substat variant values, corner count). Matches what the worker's
// detectionKey used to fold per placeholder in JS (plus the corner count, which only
// makes the key stricter). Only self-consistency matters — the algorithm is free as long
// as equal fingerprints ⇒ identical merge-time placeholder rules for fixed rule inputs.
fn safeguard_placeholder_fingerprint(placeholders: &[SafeguardWasmPlaceholderOut]) -> String {
    // FNV-1a seeded with the length so an empty list never collides with a short one.
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325 ^ (placeholders.len() as u64);
    let fold = |value: u64, state: &mut u64| {
        *state ^= value;
        *state = state.wrapping_mul(0x0000_0100_0000_01b3);
    };
    for placeholder in placeholders {
        fold(placeholder.missing as u64, &mut hash);
        for byte in placeholder.reason.as_bytes() {
            fold(u64::from(*byte), &mut hash);
        }
        if let Some(variants) = placeholder.substat_variants.as_ref() {
            fold(variants.len() as u64 | 0x8000_0000, &mut hash);
            for variant in variants {
                fold(*variant as u64, &mut hash);
            }
        }
        fold(
            placeholder
                .watch_corners
                .as_ref()
                .map_or(0, |corners| corners.len() as u64),
            &mut hash,
        );
    }
    format!("{hash:016x}")
}

/// Move every entry's placeholders into the resident store, stamping the JS-visible
/// count + fingerprint and the snapshot's store id. MUST run on every snapshot that
/// leaves the engine (after attach_watch_corners) — the placeholders field itself is
/// serde-skipped, so an un-stashed snapshot would silently report zero placeholders.
pub(crate) fn stash_detection_placeholders(detection: &mut SafeguardWasmSnapshotOut) {
    let mut resident_entries = Vec::with_capacity(detection.entries.len());
    let mut any = false;
    for entry in &mut detection.entries {
        entry.placeholder_count = entry.placeholders.len() as i64;
        entry.placeholder_fingerprint = safeguard_placeholder_fingerprint(&entry.placeholders);
        any = any || !entry.placeholders.is_empty();
        resident_entries.push(ResidentPlaceholderEntry {
            hash: entry.hash.clone(),
            placeholders: std::mem::take(&mut entry.placeholders),
        });
    }
    if !any {
        // Nothing to hand off — leave any previous store untouched (harmless either way;
        // production merges always follow their own detection) and mark the snapshot.
        detection.placeholder_state_id = None;
        return;
    }
    let state_id = NEXT_PLACEHOLDER_STATE_ID.with(|next| {
        let id = next.get();
        next.set(id + 1);
        id
    });
    detection.placeholder_state_id = Some(state_id);
    RESIDENT_PLACEHOLDERS.with(|cell| {
        *cell.borrow_mut() = Some(ResidentPlaceholderState {
            state_id,
            entries: resident_entries,
        });
    });
}

/// Clone the resident placeholders back into a snapshot about to drive merge-time rule
/// emission. Entries whose skipped field is already populated (tests / native callers
/// that never stash) win untouched. Errors are LOUD: a missing/stale/mismatched store
/// must fail the merge rather than silently emit no placeholder rules.
pub fn rehydrate_detection_placeholders(detection: &mut SafeguardWasmSnapshotOut) -> Result<(), String> {
    let Some(expected_id) = detection.placeholder_state_id else {
        // Never stashed (or nothing was stashed) — direct-populated fields still apply.
        return Ok(());
    };
    RESIDENT_PLACEHOLDERS.with(|cell| {
        let borrow = cell.borrow();
        let Some(store) = borrow.as_ref() else {
            return Err(format!(
                "safeguard placeholder store empty but snapshot expects state {expected_id} — re-run detection before merging"
            ));
        };
        if store.state_id != expected_id {
            return Err(format!(
                "stale safeguard detection snapshot: placeholder state {expected_id} requested, engine holds {} — re-run detection before merging",
                store.state_id
            ));
        }
        if store.entries.len() != detection.entries.len() {
            return Err(format!(
                "safeguard placeholder store shape mismatch: {} resident entries vs {} snapshot entries",
                store.entries.len(),
                detection.entries.len()
            ));
        }
        for (idx, entry) in detection.entries.iter_mut().enumerate() {
            // Direct-populated placeholders (tests) take precedence; never overwrite.
            if !entry.placeholders.is_empty() {
                continue;
            }
            let resident = &store.entries[idx];
            if resident.hash != entry.hash {
                return Err(format!(
                    "safeguard placeholder store entry {idx} hash mismatch ({} vs {})",
                    resident.hash, entry.hash
                ));
            }
            // Clone (not move) so repeated merges against the same detection stay valid.
            entry.placeholders = resident.placeholders.clone();
        }
        Ok(())
    })
}

#[derive(Debug, Clone)]
struct SafeguardWasmPreparedRule {
    id: String,
    hash: String,
    combination: SafeguardWasmCombination,
    required_per_bucket: i64,
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
    weights: BTreeMap<i64, f64>,
    // "Weight by Rank" toggle resolved from the rule input (false when absent).
    weight_main_stat_by_rank: bool,
    // Tunable main-stat rank bonus multiplier resolved from the rule input (1.0 when absent).
    main_stat_rank_weight_factor: f64,
    set_includes: HashSet<i64>,
    set_excludes: HashSet<i64>,
    expected_buckets: Vec<SafeguardWasmExpectedBucketIn>,
}

#[derive(Debug, Clone)]
struct SafeguardWasmScoredCandidate {
    candidate_idx: usize,
    score: f64,
}

// ts-rs export: concrete bucket dimensions (nested by SafeguardWasmPlaceholderOut.sample).
// Promoted from a private helper struct so watch placeholders can carry it across the wire.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmBucketSample {
    pub slot: i64,
    pub set: i64,
    pub faction: i64,
    pub main_stat: i64,
}

#[derive(Debug, Clone)]
struct SafeguardWasmExpectedBucketResolved {
    key: SafeguardCountKey,
    sample: SafeguardWasmBucketSample,
}

#[derive(Debug, Clone)]
struct SafeguardWasmBucketTally {
    kept: Vec<usize>,
    sold: Vec<usize>,
    sample: Option<SafeguardWasmBucketSample>,
}

// Bucketing keys stay typed internally so bucketed scans do not allocate
// repeated `slot:x|set:y|...` strings in hot loops.
// pub(super) so improvement_chance submodule can build count keys without allocating.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
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
    // The single substat variant this eval ranked by, when built for one substat on the
    // perSubstat merge path. None on the aggregate/non-perSubstat path. The merge uses it to
    // tag each merged candidate with its per-substat sub-bucket rank + quota membership.
    substat_variant: Option<i64>,
}

// ts-rs export: input wire struct for safeguard_count_key_value entry point.
// Fields made `pub` for ts-rs export (only the matcher code reads them).
#[derive(Debug, Deserialize, Clone, Copy, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmCountKeyArtifactIn {
    pub slot: i64,
    pub set: i64,
    pub faction: i64,
    pub main_stat: i64,
}

// ts-rs export: nested by SafeguardWasmItemKeyTesterItemIn.previewExtras.
// Promoted to `pub` (was private) so ts-rs can export it.
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmItemKeyPreviewExtrasIn {
    #[serde(default)]
    pub id: Option<i64>,
}

// ts-rs export: nested by SafeguardWasmItemKeyArtifactIn.gearInspectorItem.
// Promoted to `pub` (was private) so ts-rs can export it.
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmItemKeyTesterItemIn {
    #[serde(default)]
    pub item_id: Option<i64>,
    #[serde(default)]
    pub preview_extras: Option<SafeguardWasmItemKeyPreviewExtrasIn>,
}

// ts-rs export: input wire struct for safeguard_item_key_value entry point.
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmItemKeyArtifactIn {
    #[serde(default)]
    pub id: Option<i64>,
    #[serde(default)]
    pub gear_inspector_item: Option<SafeguardWasmItemKeyTesterItemIn>,
}

// ts-rs export: input wire struct for safeguard_bucket_key_value entry point.
// Carries SafeguardWasmMainStatRawIn (an untagged enum — ts-rs emits a union).
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmBucketKeyArtifactIn {
    pub slot: i64,
    pub set: i64,
    #[serde(default)]
    pub faction: i64,
    #[serde(default)]
    pub main_stat: Option<SafeguardWasmMainStatRawIn>,
}

// pub(super) so improvement_chance submodule can derive faction-bucketing flags.
pub(super) fn safeguard_is_accessory_slot(slot: i64) -> bool {
    // Accessories are the only slots where faction bucketing applies.
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
    // If no bucketing flag is enabled, treat the mode as global per-rule.
    // This mirrors TS fallback behavior for partially initialized payloads.
    let has_bucketing = mode.per_set || mode.per_faction || mode.per_main_stat || mode.per_slot;
    if !has_bucketing {
        return SafeguardWasmCountMode {
            per_rule: true,
            per_set: false,
            per_faction: false,
            per_main_stat: false,
            per_slot: false,
        };
    }
    // Bucketed mode keeps only the explicit toggles and clears per_rule.
    SafeguardWasmCountMode {
        per_rule: false,
        per_set: mode.per_set,
        per_faction: mode.per_faction,
        per_main_stat: mode.per_main_stat,
        per_slot: mode.per_slot,
    }
}

// Safeguard UI defaults bucket by set+faction+main stat (slot disabled).
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
pub fn safeguard_resolve_count_mode(mode: Option<SafeguardWasmCountMode>) -> SafeguardWasmCountMode {
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
        if (1..=4).contains(&n) {
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
    // Mirrors SUBSTAT_ROLL_MAX_6_BY_VARIANT in src/lib/substatRollNormalization.ts.
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
        // Anomalous lines have no roll variance, so their 6-star per-line value is an
        // exact cap. All eight share it — the damage-taken family arrives folded to
        // magnitude, so it normalizes identically to the dealt family.
        v if ANOMALOUS_SUBSTAT_VARIANTS.contains(&v) => ANOMALOUS_SUBSTAT_ROLL_VALUE_MAX,
        _ => 0.0,
    }
}

// Level-16 main-stat maximum for (rank, slot, variant); 0.0 when the combo is absent.
fn safeguard_main_stat_max16(rank: i64, slot: i64, variant: i64) -> f64 {
    // Linear scan of the generated tuple table; the table is small (≈110 entries).
    for &(r, s, v, val) in MAIN_STAT_MAX16_BY_RANK_SLOT_VARIANT {
        if r == rank && s == slot && v == variant {
            return val;
        }
    }
    0.0
}

// Rank-quality ratio of a slot's main stat: the rank's +16 value over the 6-star +16 value
// for the same slot+variant. 6★ → 1.0, 5★ → ~0.81–0.89, 4★ (and below, clamped) → ~0.67–0.78.
// Level-independent by design: it uses the rank's final +16 main stat, not the current level,
// so leveling alone never changes a piece's score. Returns 0.0 for unknown slot/variant.
// pub(super) so improvement_chance can mirror the same main-stat bonus in its projections.
pub(super) fn safeguard_main_stat_rank_ratio(rank: i64, slot: i64, variant: i64) -> f64 {
    // 6-star value is the denominator; without it the variant is unrecognized → no bonus.
    let cap6 = safeguard_main_stat_max16(6, slot, variant);
    if !(cap6 > 0.0) {
        return 0.0;
    }
    // Clamp ranks below 4 up to the 4-star row (rarely safeguarded; no reliable low-rank data).
    let cap_rank = safeguard_main_stat_max16(rank.clamp(4, 6), slot, variant);
    if cap_rank > 0.0 {
        cap_rank / cap6
    } else {
        0.0
    }
}

// Per-artifact main-stat "Weight by Rank" score bonus, shared by every scoring path (SSOT).
// Zero when the rule's toggle is off, when no substats are selected (the chip is disabled in
// that case and the existing rank tie-break already favors higher ranks), or when the
// slot+main-stat has no table entry. Constant across improvement-chance simulation because it
// depends only on rank+slot+main-stat, none of which change as substats roll.
// pub(super) so improvement_chance applies the identical bonus to candidate + challenger scores.
pub(super) fn safeguard_main_stat_rank_bonus_parts(
    rank: i64,
    slot: i64,
    main_stat: i64,
    weight_main_stat_by_rank: bool,
    // User-tunable multiplier on the main-stat bonus (SSOT default 1.0 = pre-factor behavior).
    // Lets the "Weight by Rank" main-stat term compete with weighted substats on equal footing:
    // raising it makes a higher-rank piece's main-stat advantage outweigh a lower-rank piece's
    // heavier substat roll. Gated by the same toggle, so factor is inert when the toggle is off.
    main_stat_rank_weight_factor: f64,
    has_selected_substats: bool,
) -> f64 {
    if !weight_main_stat_by_rank || !has_selected_substats {
        return 0.0;
    }
    SAFEGUARD_MAIN_STAT_RANK_WEIGHT
        * main_stat_rank_weight_factor
        * safeguard_main_stat_rank_ratio(rank, slot, main_stat)
}

// Artifact-ref convenience wrapper around safeguard_main_stat_rank_bonus_parts.
pub(super) fn safeguard_main_stat_rank_bonus(
    artifact: &SafeguardWasmArtifactIn,
    weight_main_stat_by_rank: bool,
    // Same tunable multiplier threaded through to the parts helper (SSOT default 1.0).
    main_stat_rank_weight_factor: f64,
    has_selected_substats: bool,
) -> f64 {
    safeguard_main_stat_rank_bonus_parts(
        artifact.rank,
        artifact.slot,
        artifact.main_stat,
        weight_main_stat_by_rank,
        main_stat_rank_weight_factor,
        has_selected_substats,
    )
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

// Canonical (percent, flat) variant pairing — HP/ATK/DEF are the only stats with both
// variants. Single table so the percent→flat and flat→percent mappings can never drift.
const SAFEGUARD_PERCENT_FLAT_PAIRS: [(i64, i64); 3] = [
    (SAFEGUARD_MAIN_HP_PERCENT, SAFEGUARD_MAIN_HP_FLAT),
    (SAFEGUARD_MAIN_ATK_PERCENT, SAFEGUARD_MAIN_ATK_FLAT),
    (SAFEGUARD_MAIN_DEF_PERCENT, SAFEGUARD_MAIN_DEF_FLAT),
];

// pub(super) so improvement_chance can replicate the tie-break percent→flat mapping.
pub(super) fn safeguard_percent_to_flat_main(variant: i64) -> Option<i64> {
    // Map percent mains to their flat counterpart for tie-priority logic.
    // Non HP/ATK/DEF mains have no flat companion and return None.
    SAFEGUARD_PERCENT_FLAT_PAIRS
        .iter()
        .find(|&&(percent, _)| percent == variant)
        .map(|&(_, flat)| flat)
}

// Inverse: a flat substat's percent twin — drives the aligned-flat epsilon tiers below.
// Mirrors TS flatToPercentSubstatVariant (lib/types.ts).
fn safeguard_flat_to_percent_substat(variant: i64) -> Option<i64> {
    SAFEGUARD_PERCENT_FLAT_PAIRS
        .iter()
        .find(|&&(_, flat)| flat == variant)
        .map(|&(percent, _)| percent)
}

pub fn safeguard_normalize_set_selections(values: &[SafeguardWasmSetSelection]) -> Vec<SafeguardWasmSetSelection> {
    // Use map-by-id so duplicates collapse deterministically.
    let mut by_id = BTreeMap::<i64, SafeguardWasmSetSelection>::new();
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

fn safeguard_domain_slot_order(domain: &SafeguardWasmExpectedBucketDomainIn) -> Vec<i64> {
    // Domain-provided slot order is authoritative; fallback keeps canonical order.
    if domain.slot_order.is_empty() {
        // Reuse generated slot order constants instead of duplicating literals.
        return PREFERRED_ARTIFACT_TYPE_ORDER.to_vec();
    }
    safeguard_sort_unique_slots(&domain.slot_order)
}

fn safeguard_domain_allowed_mains_for_slot(domain: &SafeguardWasmExpectedBucketDomainIn, slot: i64) -> Vec<i64> {
    // Object keys cross the JS/WASM boundary as strings, so index by string slot id.
    let key = slot.to_string();
    let values = domain.allowed_main_by_slot.get(&key).cloned().unwrap_or_default();
    safeguard_sorted_unique_i64(&values)
}

fn safeguard_resolve_slot_candidates(
    combination: &SafeguardWasmCombination,
    domain: &SafeguardWasmExpectedBucketDomainIn,
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
    let artifact_set_pool = domain
        .artifact_compatible_set_ids
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
            let matches_main = combination
                .main_stats
                .iter()
                .any(|variant| allowed_mains.contains(variant));
            if !matches_main {
                continue;
            }
        }
        // Explicit set includes require at least one include compatible with this slot family.
        if has_set_includes {
            let pool = if accessory_slot {
                &accessory_set_pool
            } else {
                &artifact_set_pool
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
    domain: &SafeguardWasmExpectedBucketDomainIn,
) -> Vec<i64> {
    let accessory_slot = safeguard_is_accessory_slot(slot);
    // Includes/excludes are canonicalized once per slot resolution.
    let (set_includes, set_excludes) = safeguard_split_set_selections(&combination.sets);
    let has_set_includes = !set_includes.is_empty();
    let allowed_pool = if accessory_slot {
        safeguard_sorted_unique_i64(&domain.accessory_compatible_set_ids)
    } else {
        safeguard_sorted_unique_i64(&domain.artifact_compatible_set_ids)
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
    domain: &SafeguardWasmExpectedBucketDomainIn,
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
    domain: &SafeguardWasmExpectedBucketDomainIn,
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
    domain: &SafeguardWasmExpectedBucketDomainIn,
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
    domain: &SafeguardWasmExpectedBucketDomainIn,
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
    // Without faction bucketing, one slot sample is enough.
    if !count_mode.per_faction {
        return slots.first().copied().map(|slot| vec![slot]).unwrap_or_default();
    }
    // Faction bucketing needs one accessory and one artifact sample when available.
    let accessory = slots.iter().copied().find(|slot| safeguard_is_accessory_slot(*slot));
    let artifact = slots.iter().copied().find(|slot| !safeguard_is_accessory_slot(*slot));
    let mut samples = Vec::<i64>::new();
    if let Some(slot) = accessory {
        samples.push(slot);
    }
    if let Some(slot) = artifact {
        samples.push(slot);
    }
    if samples.is_empty() {
        slots.first().copied().map(|slot| vec![slot]).unwrap_or_default()
    } else {
        samples
    }
}

fn safeguard_build_expected_buckets_for_rule(
    combination: &SafeguardWasmCombination,
    count_mode: SafeguardWasmCountMode,
    domain: &SafeguardWasmExpectedBucketDomainIn,
) -> Vec<SafeguardWasmExpectedBucketIn> {
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
    let mut expected = Vec::<SafeguardWasmExpectedBucketIn>::new();
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
        // Cartesian product across the active bucketed dimensions.
        for set_id in &set_candidates {
            for faction in &faction_candidates {
                for main_stat in &main_stat_candidates {
                    let key = safeguard_count_key_from_parts(slot, *set_id, *faction, *main_stat, count_mode);
                    if !seen.insert(key.clone()) {
                        continue;
                    }
                    expected.push(SafeguardWasmExpectedBucketIn {
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

// Keep rarity code mapping aligned with types.ts::rarityCodeFromRankValue.
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

// Level-coverage expansion for a placeholder artifact. Rust owns this rule outright — the
// former TS twin was retired when rule building consolidated here.
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
        _ => {
            // Anomalous substats keep their REAL DB stat id so
            // rule conditions match exactly the gear that carries them, instead of
            // silently widening to the "Any substat" tuple. Only their sellfile RULE
            // encoding is unconfirmed — the TS export boundary (hsfIO scrub) strips
            // them before anything reaches RSL Helper.
            if let Some(&(_, id)) = ANOMALOUS_SUBSTAT_VARIANT_ID_PAIRS.iter().find(|&&(v, _)| v == variant) {
                (id, false)
            } else {
                (STAT_ID_ANY, true)
            }
        }
    }
}

// Four-substat ANY padding for emitted rules. Rust owns this shape outright — the former TS
// twin was retired when rule building consolidated here.
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
        let value = if sub.value.is_finite() { sub.value.max(0.0) } else { 0.0 };
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

// Encode improvement-watch corner substat floors with the same `>=` absolute-value
// semantics as safeguard_build_substats_for_artifact (id + flat bit from the variant,
// non-finite/negative values clamped to zero, unknown variants skipped).
fn safeguard_build_watch_corner_substats(substats: &[&SafeguardWatchCornerSubstatOut]) -> Vec<RuleSubRaw> {
    // Start from the Any-padded template so unused slots stay non-constraints.
    let mut cloned = safeguard_clone_any_substats();
    let mut idx = 0usize;
    for sub in substats {
        // HSF rules carry at most four substat slots; extra corner entries cannot fit.
        if idx >= HSF_SUBSTAT_SLOT_COUNT {
            break;
        }
        let (id, is_flat) = safeguard_variant_to_sub(sub.variant);
        // Wildcard/unknown variants encode as non-constraints — skip them entirely.
        if sub.variant == STAT_VARIANT_ANY || id == STAT_ID_ANY {
            continue;
        }
        // Clamp the floor to a finite non-negative raw value, mirroring artifact encoding.
        let value = if sub.min_value.is_finite() {
            sub.min_value.max(0.0)
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

// Slot-scoped allowed-substat table row, applied to single-slot rules only — multi-slot
// rules skip the filter so a substat legal on SOME slots stays required where it is legal.
// pub(super) so improvement_watch mirrors the same possibility rule when probing corners.
pub(super) fn safeguard_slot_substat_filter(effective_slots: &[i64]) -> Option<&'static [i64]> {
    if effective_slots.len() != 1 {
        return None;
    }
    ALLOWED_SUBS_BY_SLOT
        .iter()
        .find(|&&(slot, _)| slot == effective_slots[0])
        .map(|(_, subs)| *subs)
}

// Shared possibility predicate for placeholder/corner substats: a substat equal to the
// concrete mainstat can never appear on the piece, and single-slot rules additionally
// restrict to the slot's legal substat pool. pub(super) for improvement_watch reuse.
pub(super) fn safeguard_placeholder_substat_possible(
    variant: i64,
    main_variant: i64,
    slot_filter: Option<&[i64]>,
) -> bool {
    (main_variant == SAFEGUARD_MAIN_ANY || variant != main_variant)
        && slot_filter.is_none_or(|allowed| allowed.contains(&variant))
}

// How many of `variants` can actually roll as substats on a piece with `main_variant`?
// A substat equal to the concrete mainstat can never appear there, so it must not inflate a
// min-count requirement. This is the counting rule for the whole engine: every substat-match
// gate caps its threshold with it, and the ranking presence gate asks it for `> 0`. Per-variant
// possibility delegates to the SSOT predicate above (slot filter None: callers hold a concrete
// piece, so only the mainstat conflict applies). pub(super) for improvement_chance reuse.
pub(super) fn safeguard_possible_substat_count<'a, I>(variants: I, main_variant: i64) -> usize
where
    I: IntoIterator<Item = &'a i64>,
{
    variants
        .into_iter()
        .filter(|&&variant| safeguard_placeholder_substat_possible(variant, main_variant, None))
        .count()
}

// Enumerate all combinations of `k` elements from `pool` (order-independent).
// Used to generate permutation rules for min-count substat anticipation.
// pub(super) so improvement_watch enumerates corner substat subsets with the same helper.
pub(super) fn safeguard_combinations(pool: &[i64], k: usize) -> Vec<Vec<i64>> {
    if k == 0 {
        return vec![vec![]];
    }
    if k > pool.len() {
        return Vec::new();
    }
    if k == pool.len() {
        return vec![pool.to_vec()];
    }
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

fn safeguard_build_placeholder_substats_bucket(variants: &[i64]) -> Vec<RuleSubRaw> {
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

// Canonical key for placeholder dedupe. Must stay in step with the collapse key in
// rule_dedupe.rs, which keys the same rule identity for a different consumer.
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
    sorted
        .into_iter()
        .map(|v| v.clamp(RANK_CODE_ONE, RANK_CODE_SIX))
        .collect()
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

// Allowed main-stat variants for a slot from the static domain (mirrors ALLOWED_MAIN_BY_SLOT in
// types.ts). Used to detect when a per-mainstat constraint is redundant for a fixed-main slot.
fn safeguard_static_allowed_mains_for_slot(slot: i64) -> &'static [i64] {
    for &(s, mains) in ALLOWED_MAINS_BY_SLOT {
        if s == slot {
            return mains;
        }
    }
    &[]
}

// A concrete main-stat constraint is redundant when EVERY targeted slot allows exactly that one
// main (e.g. Weapon→ATK-flat, Helmet→HP-flat, Shield→DEF-flat). In that case the emitted placeholder
// rule keeps the same set of matchable pieces whether it pins the main or leaves it Any, so we drop
// it to Any. This makes the per_main_stat ON / OFF placeholder rules identical for fixed-main slots
// (no spurious sell-file rule-count change) without altering which gear is protected. Returns false
// for the Any sentinel and for any slot whose sole allowed main differs from `main_variant`.
fn safeguard_main_constraint_is_redundant(main_variant: i64, slots: &[i64]) -> bool {
    if main_variant == STAT_VARIANT_ANY || slots.is_empty() {
        return false;
    }
    slots.iter().all(|&slot| {
        let allowed = safeguard_static_allowed_mains_for_slot(slot);
        allowed.len() == 1 && allowed[0] == main_variant
    })
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
    // Positive set IDs span both artifact and accessory slots in RSL, so they need no filtering.
    let no_set_only = set_values.len() == 1 && set_values[0] == ACCESSORY_NO_SET_ID;
    let slot_values = if no_set_only && !slot_values.is_empty() {
        // Keep only accessory slots; skip the combination entirely if none remain.
        let accessory: Vec<i64> = slot_values
            .iter()
            .copied()
            .filter(|&s| safeguard_is_accessory_slot(s))
            .collect();
        if accessory.is_empty() {
            return Vec::new();
        }
        accessory
    } else {
        slot_values
    };
    let faction_values = safeguard_sorted_unique_i64(&combination.factions);
    // Consolidate consecutive rank/rarity chains ending at the maximum value into
    // a single GTE anchor so each placeholder bucket emits the fewest HSF rules.
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
                        slot_values
                            .iter()
                            .copied()
                            .filter(|&s| {
                                ALLOWED_MAINS_BY_SLOT
                                    .iter()
                                    .any(|&(allowed_slot, mains)| allowed_slot == s && mains.contains(main_variant))
                            })
                            .collect()
                    } else {
                        slot_values.clone()
                    };
                    if !slot_values.is_empty() && effective_slots.is_empty() {
                        continue;
                    }
                    // Drop a redundant per-mainstat constraint to Any when every effective slot has a
                    // single fixed main (the concrete pin matches the exact same pieces). This keeps
                    // per_main_stat ON/OFF placeholder rules identical for fixed-main slots. The
                    // effective_slots filter above still used the concrete variant, so slot scoping is
                    // unchanged; only the emitted main + the variant threaded into substat filtering
                    // become Any (mirroring the OFF path). Multi-slot or multi-main slots are untouched.
                    let emit_main_variant = if safeguard_main_constraint_is_redundant(*main_variant, &effective_slots) {
                        STAT_VARIANT_ANY
                    } else {
                        *main_variant
                    };
                    let (main_id, main_f) = safeguard_variant_to_main(emit_main_variant);
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
                        // Safeguard keep-rules protect gear regardless of rework state.
                        Ore: None,
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
                    // Thread emit_main_variant (Any when normalized) so the caller's substat
                    // "exclude the mainstat" filter matches the per_main_stat OFF behavior exactly.
                    rules.push((safeguard_rule, emit_main_variant, effective_slots.clone()));
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
    let normalized_substat_match = safeguard_normalize_substat_match(rule.substat_match.as_deref().unwrap_or(""));
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
        let combination = placeholder.combination.clone();
        let hash = safeguard_hash_combination(&combination);
        if placeholder.missing <= 0 {
            // Satisfied buckets emit ONLY improvement-watch corner rules. A zero-missing
            // placeholder without corners means nothing viable can clear the chance bar
            // (or the rule is not in watch mode) — no rule, fresh drops sell normally.
            let Some(corners) = placeholder.watch_corners.as_ref().filter(|corners| !corners.is_empty()) else {
                continue;
            };
            // Corners apply to every combination-pinned base variant the placeholder spans.
            let base_rules =
                safeguard_build_placeholder_base_rules(&combination, recipe_id, normalized_name.as_deref());
            for (base_rule, main_variant, effective_slots) in &base_rules {
                // Same possibility filter as the deficit path below (SSOT helpers).
                let slot_filter = safeguard_slot_substat_filter(effective_slots);
                for corner in corners.iter() {
                    // Drop corner substats impossible for this base variant's mainstat/slot.
                    let possible: Vec<&SafeguardWatchCornerSubstatOut> = corner
                        .substats
                        .iter()
                        .filter(|sub| safeguard_placeholder_substat_possible(sub.variant, *main_variant, slot_filter))
                        .collect();
                    // Every probed substat conflicting with this variant means the corner
                    // cannot describe a real piece here — skip instead of over-keeping.
                    if possible.is_empty() && !corner.substats.is_empty() {
                        continue;
                    }
                    // One HSF keep rule per corner × rarity code: exact rank/level pins,
                    // the corner's rarity run consolidated through the shared placeholder
                    // helper (single rarity → exact code; contiguous run ending at max →
                    // one GTE code; other runs → one exact code per value), plus the
                    // `>=` substat floors that make the drop's improvement chance viable.
                    for rarity_code in safeguard_consolidate_rarity_codes(&corner.rarities) {
                        let mut corner_rule = base_rule.clone();
                        corner_rule.Rank = Some(safeguard_clamp_rank_or_rarity_value(corner.rank));
                        corner_rule.Rarity = Some(rarity_code);
                        corner_rule.LVLForCheck = Some(corner.level);
                        corner_rule.Substats = Some(safeguard_build_watch_corner_substats(&possible));
                        safeguard_apply_rule_meta(
                            &mut corner_rule,
                            normalized_rule_id,
                            safeguard_rule_ordinal,
                            &hash,
                            entry,
                            scanned_at,
                        );
                        // Keep the placeholder metadata so exports stay attributable in diffs.
                        corner_rule.safeguard_placeholder = Some(true);
                        corner_rule.safeguard_placeholder_missing = Some(0);
                        rules.push(corner_rule);
                    }
                }
            }
            continue;
        }
        let base_rules = safeguard_build_placeholder_base_rules(&combination, recipe_id, normalized_name.as_deref());
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
                // Exclude substats impossible for this placeholder's mainstat/slot via the
                // shared possibility helpers (SSOT with the corner-emission path above).
                let slot_sub_filter = safeguard_slot_substat_filter(effective_slots);
                let possible_substats: Vec<i64> = placeholder_substats
                    .iter()
                    .copied()
                    .filter(|&v| safeguard_placeholder_substat_possible(v, *main_variant, slot_sub_filter))
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
                    // All required: one bucketed rule with every possible substat.
                    let mut substat_rule = base_rule.clone();
                    substat_rule.Substats = Some(safeguard_build_placeholder_substats_bucket(&possible_substats));
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
                    // one AND-style bucketed rule per combination. Each rule keeps a piece
                    // only when it has all N substats in that specific combination, so the
                    // union of all rules correctly keeps any piece with at least N matches.
                    let combos = safeguard_combinations(&possible_substats, min_count);
                    if combos.len() <= SAFEGUARD_SUBSTAT_COMBINATION_CAP {
                        for combo in &combos {
                            let mut substat_rule = base_rule.clone();
                            substat_rule.Substats = Some(safeguard_build_placeholder_substats_bucket(combo));
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
                        // with no substat constraint (keep-anything for this bucket).
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
// SSOT cap for substat-combination enumeration: C(8, 4) = 70 covers the widest
// legitimate focus set (8 substats, ≥4 match). Shared by the deficit-placeholder
// emission above (skip AND-bucket expansion beyond the cap) and the improvement-watch
// subset ranking (keep the top-weighted subsets) so the two paths can never drift.
pub(super) const SAFEGUARD_SUBSTAT_COMBINATION_CAP: usize = 70;

pub(super) fn safeguard_is_activation_off(raw: &str) -> bool {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return false;
    }
    trimmed.eq_ignore_ascii_case(SAFEGUARD_ACTIVATION_OFF)
}

// True for BOTH anticipate variants — any mode that emits placeholder keep rules.
fn safeguard_is_activation_anticipate(raw: &str) -> bool {
    let trimmed = raw.trim();
    trimmed.eq_ignore_ascii_case(SAFEGUARD_ACTIVATION_ANTICIPATE_GAPS)
        || safeguard_is_activation_anticipate_improvements(raw)
}

// `anticipateImprovements` keeps placeholders alive at zero deficit ("improvement watch")
// when an improvement-chance threshold is configured: qualifying fresh drops stay protected
// until the next inventory sync re-ranks them. Without a threshold it behaves like
// `anticipateGaps`. pub(super) so improvement_watch reuses the same token predicate.
pub(super) fn safeguard_is_activation_anticipate_improvements(raw: &str) -> bool {
    let trimmed = raw.trim();
    trimmed.eq_ignore_ascii_case(SAFEGUARD_ACTIVATION_ANTICIPATE_IMPROVEMENTS)
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
    let mut detection_by_rule_id = BTreeMap::<String, &SafeguardWasmEntryOut>::new();
    let mut detection_by_ordinal = BTreeMap::<i64, &SafeguardWasmEntryOut>::new();
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

        // Recipe IDs descend from the provided sentinel base (SAFEGUARD_RECIPE_ID_BASE).
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
                        // Safeguard keep-rules protect gear regardless of rework state.
                        Ore: None,
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

fn safeguard_bucket_sample_from_artifact(artifact: &SafeguardWasmArtifactIn) -> SafeguardWasmBucketSample {
    // Only accessories keep their faction dimension for bucketing.
    let faction = safeguard_normalized_faction_for_slot(artifact.slot, artifact.faction);
    // Copy shape used by placeholder synthesis and expected-bucket comparison.
    SafeguardWasmBucketSample {
        slot: artifact.slot,
        set: artifact.set,
        faction,
        main_stat: artifact.main_stat,
    }
}

// pub(super) so improvement_watch can fall back to the same deterministic sample
// when a legacy zero-missing placeholder arrives without a detection-attached sample.
pub(super) fn safeguard_default_bucket_sample(combination: &SafeguardWasmCombination) -> SafeguardWasmBucketSample {
    // Fallback sample uses first selected slot when present.
    // Otherwise use weapon slot so placeholders stay deterministic.
    SafeguardWasmBucketSample {
        slot: combination
            .slots
            .first()
            .copied()
            .unwrap_or(SAFEGUARD_DEFAULT_SAMPLE_SLOT),
        // Default set/faction/main describe "unknown concrete bucket".
        set: SAFEGUARD_DEFAULT_SAMPLE_SET,
        faction: 0,
        main_stat: SAFEGUARD_MAIN_ANY,
    }
}

fn safeguard_build_placeholder_combination(
    base: &SafeguardWasmCombination,
    mode: SafeguardWasmCountMode,
    sample: Option<&SafeguardWasmBucketSample>,
) -> SafeguardWasmCombination {
    let Some(bucket_sample) = sample else {
        // No bucket sample means no dimension projection is possible.
        return base.clone();
    };
    // Start from full rule combination and project only bucketed dimensions.
    let mut clone = base.clone();
    if mode.per_slot {
        clone.slots = vec![bucket_sample.slot];
    }
    if mode.per_set {
        clone.sets = vec![SafeguardWasmSetSelection {
            id: bucket_sample.set,
            excluded: false,
        }];
    }
    // Main-stat wildcard is encoded as empty list in placeholder combination.
    if mode.per_main_stat {
        clone.main_stats = if bucket_sample.main_stat == SAFEGUARD_MAIN_ANY {
            Vec::new()
        } else {
            vec![bucket_sample.main_stat]
        };
    }
    if mode.per_faction {
        // Non-accessory buckets normalize faction to zero -> empty factions selection.
        clone.factions = if bucket_sample.faction > 0 {
            vec![bucket_sample.faction]
        } else {
            Vec::new()
        };
        // Narrow slots to the class implied by the bucket sample so accessory-faction
        // placeholders never bleed into artifact and the faction=0 artifact placeholder never
        // matches accessories. Without this, a faction=0 placeholder with an empty slots
        // list would match any slot (including all accessories with any SPD).
        let is_accessory_bucket = safeguard_is_accessory_slot(bucket_sample.slot);
        let narrowed: Vec<i64> = if clone.slots.is_empty() {
            // No explicit slot constraint: widen to the full slot class.
            if is_accessory_bucket {
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
            clone
                .slots
                .iter()
                .copied()
                .filter(|s| safeguard_is_accessory_slot(*s) == is_accessory_bucket)
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
    // Bucket sample carried only by zero-missing improvement-watch placeholders;
    // deficit placeholders always pass None (corner synthesis never probes them).
    sample: Option<SafeguardWasmBucketSample>,
) -> SafeguardWasmPlaceholderOut {
    // Keep placeholder payload construction centralized for consistency.
    SafeguardWasmPlaceholderOut {
        combination,
        missing,
        reason: reason.to_string(),
        substat_variants,
        sample,
        // Corners are attached post-detection by improvement_watch::attach_watch_corners.
        watch_corners: None,
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

/// The member range of the run headed at `head`, clipped to the entries evaluated so far.
///
/// SSOT for "which entries belong to this run" — the cap pass and the run-close publish both
/// walk exactly this range, so a run can never be capped over one set of members and published
/// over another.
fn safeguard_group_run_members(
    groups: &groups::SafeguardGroupsOut,
    head: usize,
    entries_len: usize,
) -> core::ops::Range<usize> {
    let run_len = groups.run_lens.get(head).copied().unwrap_or(0).max(0) as usize;
    head..(head + run_len).min(entries_len)
}

// Everything a group cap reads that is fixed for the whole scan: the resolved runs, each rule's
// inline group settings, the candidates, and the item_key → artifact index the cap re-buckets by.
// Built once per scan (`artifact_by_item_key` is borrowed, not cloned — an artifact carries a
// substat Vec and a developed account reaches thousands of candidates), then handed to every run
// close, so the two close sites in the eval loop cannot drift apart in what they pass.
struct GroupCapContext<'scan> {
    groups: &'scan groups::SafeguardGroupsOut,
    group_settings: &'scan [Option<SafeguardWasmGroupIn>],
    candidates: &'scan [SafeguardWasmCandidateIn],
    artifact_by_item_key: BTreeMap<i64, &'scan SafeguardWasmArtifactIn>,
}

/// Closes a finished group run: caps it, then publishes only what SURVIVED the cap.
///
/// Group members do not publish their selections inline (that would let member 1 starve its
/// siblings, see the eval loop), so their candidate indices queue in `pending` until the run
/// ends. Publishing before the cap would be wrong in the other direction: a piece the group
/// DROPS is sold, and a later rule must still be free to protect it — an equivalent flat list
/// would. So the cap runs first and only the run's surviving `item_keys` reach the cumulative +
/// protected state. Draining is idempotent by construction — the vector is emptied — and the
/// flat-list path never queues anything.
fn safeguard_close_group_run(
    context: &GroupCapContext<'_>,
    head: usize,
    entries: &mut [SafeguardWasmEntryOut],
    pending: &mut Vec<usize>,
    cumulative_candidate_sold_state: &mut [bool],
    previously_protected_state: &mut [bool],
) {
    safeguard_apply_group_cap(context, head, entries);
    // What the run kept after the cap; a member's `item_keys` and its selected candidate indices
    // are the same sold subset, so filtering the pending indices by item_key is exact. An
    // activation-off member never queued anything and the cap never trims it, yet its entry can
    // still carry scored `item_keys` for the UI — reading those here would publish a piece the
    // group actually DROPPED, exactly the leak this function exists to prevent.
    let survivors = safeguard_group_run_members(context.groups, head, entries.len())
        .filter_map(|member_index| entries.get(member_index))
        .filter(|entry| !safeguard_is_activation_off(&entry.rule_activation))
        .flat_map(|entry| entry.item_keys.iter().copied())
        .collect::<BTreeSet<i64>>();
    for candidate_idx in pending.drain(..) {
        // Candidates and both state vectors are parallel (all sized from the parsed candidate
        // list), so one lookup bounds-checks the index for all three.
        let Some(candidate) = context.candidates.get(candidate_idx) else {
            continue;
        };
        if !survivors.contains(&candidate.item_key) {
            continue;
        }
        cumulative_candidate_sold_state[candidate_idx] = false;
        previously_protected_state[candidate_idx] = true;
    }
}

/// Applies ONE group's cap — the run headed at `head` — to its finished member selections.
///
/// This is the whole of what a group does. Members evaluate exactly as if ungrouped — own
/// filters, substats, weights, count mode, ranking, required count — and produce their own
/// `item_keys`. The group then MERGES their count-buckets, re-keyed by the GROUP's own count
/// mode, and keeps the group's `required_count` out of each merged bucket. Both settings are read
/// off the run's FIRST member (`groups.run_starts`); the TypeScript normalizer keeps every member
/// of a run carrying the same copy, so the head is simply the canonical one.
///
/// The pooled feed is ranked by the score each piece got from its OWN member. Scores are absolute
/// (normalized against canonical max rolls, never against one rule's own pool), so a piece fed by
/// a later member genuinely outranks a weaker one from an earlier member. Ties break by the
/// member's own rank, then its position in the list, then the item key, so a run is reproducible.
/// Rules with no substats score zero throughout and fall through to that list order — exactly how
/// they behaved before groups existed.
///
/// A group with nothing to decide over — no active member, or a count at or above what was fed —
/// leaves every member's selection untouched, so a flat list is bit-identical to before.
///
/// Called by `safeguard_close_group_run` the moment a run's last member has evaluated, so the
/// run's survivors are known BEFORE the next rule reads cumulative state. `context` is the
/// scan-wide read-only input (see `GroupCapContext`); `entries` is a disjoint borrow, so the
/// artifact references in it stay valid across the mutation below.
fn safeguard_apply_group_cap(context: &GroupCapContext<'_>, head: usize, entries: &mut [SafeguardWasmEntryOut]) {
    let GroupCapContext {
        groups,
        group_settings,
        artifact_by_item_key,
        ..
    } = context;
    // Only ever called at a run's head; anything else has no group to cap.
    if groups.run_starts.get(head).copied().unwrap_or(-1) != head as i64 {
        return;
    }
    let members = safeguard_group_run_members(groups, head, entries.len());
    // The head's settings are the group's settings. A count below 1 would mean "keep
    // nothing", so it clamps like every other required count.
    let Some(settings) = group_settings.get(head).and_then(Option::as_ref) else {
        return;
    };
    let demand = settings.required_count.unwrap_or(1).max(1);
    // The group's own count mode defines the merged buckets — "merged based on the
    // bucket-defining properties". Members' chips still shape their OWN feed; they just do
    // not decide what counts as the same bucket once that feed arrives here.
    let group_mode = safeguard_resolve_count_mode(settings.count_mode);
    // Pool every member's feed into one list before deciding anything. Members do not keep
    // gear of their own inside a group — each one's required count sized what it fed, and
    // the group now picks the survivors across all of it.
    let mut pooled = Vec::<PooledGroupCandidate>::new();
    // One PIECE is one entry in the pool, whoever fed it. Two members whose filters overlap
    // both list the same item_key — every member ranks the run's FULL pre-group pool, its
    // siblings' picks invisible to it (see the eval loop) — and without this the piece would
    // consume the group's bucket room TWICE, so the group would keep fewer distinct pieces
    // than its count promises.
    // The first member of the run keeps it, matching `buildSafeguardGroupPool` in
    // lib/safeguardGroupPool.ts — the flyout's pooled view must not disagree with the scan.
    let mut pooled_item_keys = BTreeSet::<i64>::new();
    for (member_order, member_index) in members.clone().enumerate() {
        let Some(entry) = entries.get(member_index) else {
            continue;
        };
        // An inactive member feeds nothing in practice — build_safeguard_rules_core skips
        // it — but its entry can still carry scored item_keys for the UI. Letting those
        // into the pool would have a switched-Off rule silently crowd out its siblings.
        if safeguard_is_activation_off(&entry.rule_activation) {
            continue;
        }
        // Each fed piece keeps the score its OWN member gave it — that is the yardstick the
        // pool is sorted by, so a member's ranking survives into the shared decision.
        let score_by_item_key = entry
            .candidates
            .iter()
            .map(|candidate| (candidate.item_key, (candidate.score, candidate.candidate_rank)))
            .collect::<BTreeMap<i64, (f64, u32)>>();
        for item_key in entry.item_keys.iter().copied() {
            // Already fed by an earlier member of this run — one piece, one pool slot.
            if !pooled_item_keys.insert(item_key) {
                continue;
            }
            // Rules with no substats take the non-ranking path and score 0 across the board;
            // the tie-break below then falls through to member order, which is exactly the
            // "first member fills first" behaviour those rules had before.
            let (score, own_rank) = score_by_item_key.get(&item_key).copied().unwrap_or((0.0, 0));
            pooled.push(PooledGroupCandidate {
                item_key,
                member_index,
                member_order,
                score,
                own_rank,
            });
        }
    }
    // Best score first. Every tie-break is deterministic so two runs over the same account
    // cannot disagree about which piece got the last slot: a member's own rank, then its
    // position in the list (the user's stated priority), then the item key.
    pooled.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(core::cmp::Ordering::Equal)
            .then(left.own_rank.cmp(&right.own_rank))
            .then(left.member_order.cmp(&right.member_order))
            .then(left.item_key.cmp(&right.item_key))
    });
    // Remaining room per merged bucket, seeded lazily as buckets are first touched.
    let mut room = BTreeMap::<SafeguardCountKey, i64>::new();
    // Survivors per member, so each entry keeps reporting the gear IT contributed.
    let mut survivors = BTreeMap::<usize, Vec<i64>>::new();
    // Every piece the group kept, whoever it was credited to. A member whose pick was deduped
    // onto an earlier sibling did NOT have it turned away — the group kept it — so this is the
    // set the placeholder decision below reads, not the per-member credit.
    let mut kept_item_keys = BTreeSet::<i64>::new();
    for candidate in &pooled {
        let Some(artifact) = artifact_by_item_key.get(&candidate.item_key) else {
            continue;
        };
        let key = safeguard_count_key_from_parts(
            artifact.slot,
            artifact.set,
            artifact.faction,
            artifact.main_stat,
            group_mode,
        );
        let left = room.entry(key).or_insert(demand);
        if *left > 0 {
            *left -= 1;
            survivors
                .entry(candidate.member_index)
                .or_default()
                .push(candidate.item_key);
            kept_item_keys.insert(candidate.item_key);
        }
    }
    for member_index in members {
        let Some(entry) = entries.get_mut(member_index) else {
            continue;
        };
        if safeguard_is_activation_off(&entry.rule_activation) {
            continue;
        }
        // Placeholders reserve slots for gear the user does not own yet. Once the shared bucket
        // is turning this member's real contributions away there is nothing left to anticipate.
        // Judged against what the GROUP kept, not what was credited to this member: overlapping
        // members routinely feed the same piece, and losing it to the first feeder's column is
        // not the bucket saying no.
        let fed_piece_dropped = entry
            .item_keys
            .iter()
            .any(|item_key| !kept_item_keys.contains(item_key));
        let mut kept = survivors.remove(&member_index).unwrap_or_default();
        // Restore this member's own ranked order within what survived, so the UI's rank
        // overlays and the preview rows stay in the order the member scored them.
        let rank_of = entry
            .item_keys
            .iter()
            .enumerate()
            .map(|(position, item_key)| (*item_key, position))
            .collect::<BTreeMap<i64, usize>>();
        kept.sort_by_key(|item_key| rank_of.get(item_key).copied().unwrap_or(usize::MAX));
        if fed_piece_dropped {
            entry.placeholders.clear();
            entry.placeholder_count = 0;
        }
        entry.item_keys = kept;
    }
}

// One piece a member fed into its group, carrying everything the shared decision needs: the
// score its own member gave it (the ranking yardstick) plus deterministic tie-breaks.
struct PooledGroupCandidate {
    item_key: i64,
    // Index into `entries` of the member that fed this piece — where the survivor is written back.
    member_index: usize,
    // Position of that member in the run; the user's stated priority order.
    member_order: usize,
    // Score from the member's OWN substats/weights. Pieces from different members are compared
    // on this number directly, which is the ranking the user chose for groups.
    score: f64,
    // The member's own 1-based rank for this piece; first tie-break so a member's internal
    // ordering survives when two pieces score identically.
    own_rank: u32,
}

fn safeguard_artifact_matches_rule(artifact: &SafeguardWasmArtifactIn, rule: &SafeguardWasmPreparedRule) -> bool {
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

fn safeguard_count_selected_substats(artifact: &SafeguardWasmArtifactIn, selected_substats: &HashSet<i64>) -> usize {
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
    // they must not inflate the required total (shared counting rule).
    let possible_count = safeguard_possible_substat_count(selected_substats, artifact.main_stat);
    // Effective requirement is capped at what is actually achievable on this piece.
    let effective_required = min_count.min(possible_count);
    // Vacuously satisfied when no possible substat can satisfy the filter.
    if effective_required == 0 {
        return true;
    }
    matched >= effective_required
}

// pub(super) so improvement_chance can resolve weights with the shared fallback rule.
pub(super) fn safeguard_weight_for_variant(weights: &BTreeMap<i64, f64>, variant: i64) -> f64 {
    // Missing entries fall back to canonical default weight.
    weights.get(&variant).copied().unwrap_or(SAFEGUARD_WEIGHT_DEFAULT)
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

// Epsilon tie-break ladder for substats PRESENT on the piece but NOT selected by the rule
// (selected lines always score at their real weight). The tiers are FIXED per-line bonuses —
// deliberately NOT scaled by roll value: the epsilon only marks a line's *category* (useful
// vs padding vs relevance-aligned padding); comparing roll quality is what the real weights
// are for. Per unselected present line (all tiers far below the user weight floor, so
// stacking can never outweigh an explicit selection; no glyph terms):
//   - non-flat line (spd/cr/cdmg/res/acc/%stat): SAFEGUARD_SCORE_NON_FLAT_EPSILON_WEIGHT
//   - flat HP/ATK/DEF line whose percent twin IS a selected substat:
//     SAFEGUARD_SCORE_SELECTED_ALIGNED_FLAT_EPSILON_WEIGHT
//   - flat line whose percent twin is the piece's own main stat:
//     SAFEGUARD_SCORE_MAIN_ALIGNED_FLAT_EPSILON_WEIGHT (additive with the previous when
//     both apply, so a doubly-aligned flat outranks a singly-aligned one)
//   - unrelated flat line: exactly 0
// The whole ladder is INERT on slots whose substat pool has no percent variants (amulet):
// demoting flats against percent twins is meaningless where twins can't roll, so amulets
// rank purely by selected substats + main-stat bonus and ties fall to the provable
// tie-breakers. Unknown/empty pools keep the ladder (conservative armor-like behaviour).
// Flat classification is by variant token via the percent↔flat pairs table — never the wire
// is_flat flag (SPD/RES/ACC are wire-flat but count as useful non-flat lines here).
// Mirrors TS unselectedSubstatEpsilonBonus (substatRollNormalization.ts).
fn safeguard_unselected_substat_epsilon_bonus(artifact: &SafeguardWasmArtifactIn, selected_substats: &[i64]) -> f64 {
    // Slot-level gate: a known pool without any percent variant (amulet) skips the ladder.
    let slot_pool = improvement_chance::allowed_substats_for_slot(artifact.slot);
    if !slot_pool.is_empty()
        && !SAFEGUARD_PERCENT_FLAT_PAIRS
            .iter()
            .any(|&(percent, _)| slot_pool.contains(&percent))
    {
        return 0.0;
    }
    let mut bonus = 0.0;
    for substat in &artifact.substats {
        // Selected substats (flat or not) already score at their real weight.
        if selected_substats.contains(&substat.variant) {
            continue;
        }
        // Presence gate: unknown variants and absent/invalid values normalize to 0 and drop
        // out. Only presence matters — the bonus below is per-line, not value-scaled.
        if safeguard_normalize_substat_value(substat.variant, substat.value) <= 0.0 {
            continue;
        }
        if let Some(percent_twin) = safeguard_flat_to_percent_substat(substat.variant) {
            // Flat line: only relevance-aligned flats earn a micro tie-break.
            if selected_substats.contains(&percent_twin) {
                bonus += SAFEGUARD_SCORE_SELECTED_ALIGNED_FLAT_EPSILON_WEIGHT;
            }
            if artifact.main_stat == percent_twin {
                bonus += SAFEGUARD_SCORE_MAIN_ALIGNED_FLAT_EPSILON_WEIGHT;
            }
        } else {
            // Useful non-flat line: the top epsilon tier.
            bonus += SAFEGUARD_SCORE_NON_FLAT_EPSILON_WEIGHT;
        }
    }
    bonus
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

// Can ANY of the ranked substats actually appear on this piece? A substat equal to the
// concrete main stat can never roll, so a pass ranking only by that variant is vacuous for
// this piece and must not be gated on presence. This is exactly the `> 0` case of the shared
// counting rule the substat-match gates use, so it delegates rather than restating it.
fn safeguard_any_ranked_substat_possible(artifact: &SafeguardWasmArtifactIn, ranked_substats: &[i64]) -> bool {
    safeguard_possible_substat_count(ranked_substats, artifact.main_stat) > 0
}

// pub(super) so improvement_chance can use current-level scores, and so the ranking path
// can use it for standard-mode (no improvement_chance_threshold) candidate scoring.
//
// `ranked_substats` are the substats this scoring pass sums (its weighted value + glyph terms).
// `rule_substats` is the rule's FULL selection, used only to classify lines for the epsilon
// ladder. The two differ exactly on the perSubstat path, where each pass ranks by ONE variant
// while the rule still selects several: there, the rule's other picks must NOT be mistaken for
// "unselected" lines and earn tie-break epsilons. Every other caller passes the same slice twice
// (see safeguard_compute_score).
pub(super) fn safeguard_compute_score_for_pass(
    artifact: &SafeguardWasmArtifactIn,
    ranked_substats: &[i64],
    rule_substats: &[i64],
    weights: &BTreeMap<i64, f64>,
    weight_main_stat_by_rank: bool,
    // Tunable multiplier on the main-stat rank bonus (SSOT default 1.0). See
    // safeguard_main_stat_rank_bonus_parts for semantics.
    main_stat_rank_weight_factor: f64,
) -> f64 {
    // Weighted normalized sum mirrors safeguards.ts scoring semantics.
    // Includes glyph potential for present substats.
    let mut total = 0.0;
    // Tracks whether any ranked substat is actually PRESENT on the piece. This is the
    // membership gate: a pass must not admit gear that lacks the substat it ranks by, no
    // matter how much rank bonus or epsilon the piece would otherwise collect.
    let mut has_ranked_substat = false;
    for variant in ranked_substats {
        // Read raw value for this variant from artifact substats.
        let raw = safeguard_stat_value_for_variant(artifact, *variant);
        // Normalize against canonical max roll baseline.
        let normalized = safeguard_normalize_substat_value(*variant, raw);
        // Resolve weight (default when not explicitly configured).
        let weight = safeguard_weight_for_variant(weights, *variant);
        total += weight * normalized;
        // Add glyph potential for present substats — mirrors TS scoring (SSOT).
        if raw > 0.0 {
            has_ranked_substat = true;
            let glyph_avg = glyph_average_for_variant(artifact.rank, *variant);
            if glyph_avg > 0.0 {
                total += weight * safeguard_normalize_substat_value(*variant, glyph_avg);
            }
        }
    }
    // Presence gate: with substats selected but none of the RANKED ones on the piece, the score
    // is exactly zero so the caller's `score <= 0.0` filter excludes it. Without this the
    // pass-independent terms below (epsilon ladder, main-stat rank bonus) lift a piece that has
    // none of the ranked substats above zero — which on the perSubstat path put gear with no
    // DEF% into the DEF% sub-bucket, and made that bucket's MEMBERSHIP shift whenever an
    // unrelated substat's weight was edited.
    // The gate must not fire when the ranked substat could never roll on this piece: a substat
    // equal to the concrete main stat is impossible, which is exactly why
    // safeguard_candidate_matches_substats admits such gear VACUOUSLY. Dropping it here would
    // silently unprotect e.g. every DEF%-main ring under a [DEF%] rule.
    if !ranked_substats.is_empty()
        && !has_ranked_substat
        && safeguard_any_ranked_substat_possible(artifact, ranked_substats)
    {
        return 0.0;
    }
    // Epsilon tie-break ladder for unselected substats (non-flat lines, then relevance-aligned
    // flats — see safeguard_unselected_substat_epsilon_bonus). Classified against the RULE's full
    // selection, not this pass's ranked slice, so a perSubstat pass never treats the rule's other
    // picks as unselected padding. Gated like the main-stat bonus on a non-empty selection so
    // no-substat rules keep their legacy all-zero scoring. Deliberately NOT mirrored into the
    // improvement-chance projections (compute_projected_challenger_score /
    // compute_score_from_state): those compare epsilon-free scores against epsilon-free
    // boundaries — internally consistent — and their quantization grids dwarf these terms.
    if !rule_substats.is_empty() {
        total += safeguard_unselected_substat_epsilon_bonus(artifact, rule_substats);
    }
    // Add the per-artifact main-stat rank bonus (SSOT helper). Zero unless the rule's
    // "Weight by Rank" toggle is on and at least one substat is selected. Reaching here means the
    // presence gate passed, so this only ever tie-breaks gear that genuinely has a ranked substat.
    total += safeguard_main_stat_rank_bonus(
        artifact,
        weight_main_stat_by_rank,
        main_stat_rank_weight_factor,
        !rule_substats.is_empty(),
    );
    // Defensive guard: never return NaN/Infinity to sort comparator.
    if total.is_finite() {
        total
    } else {
        0.0
    }
}

// Single-selection scoring: the pass ranks by exactly the rule's selection. Thin wrapper over
// safeguard_compute_score_for_pass so the common (non-perSubstat) callers stay unchanged.
pub(super) fn safeguard_compute_score(
    artifact: &SafeguardWasmArtifactIn,
    selected_substats: &[i64],
    weights: &BTreeMap<i64, f64>,
    weight_main_stat_by_rank: bool,
    main_stat_rank_weight_factor: f64,
) -> f64 {
    safeguard_compute_score_for_pass(
        artifact,
        selected_substats,
        selected_substats,
        weights,
        weight_main_stat_by_rank,
        main_stat_rank_weight_factor,
    )
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
    // Bucket key keeps cross-bucket output deterministic for mixed payloads.
    if left_candidate.bucket_key != right_candidate.bucket_key {
        return left_candidate.bucket_key.cmp(&right_candidate.bucket_key);
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
    required_per_bucket: i64,
    candidates: &[SafeguardWasmCandidateIn],
) -> Vec<SafeguardWasmScoredCandidate> {
    // Non-positive requirement or empty input means no selected candidates.
    if required_per_bucket <= 0 || entries.is_empty() {
        return Vec::new();
    }
    // Eligibility is order-independent: keep candidates that are not out-ranked
    // by `required_per_bucket` strictly-better peers.
    let required = required_per_bucket as usize;
    let mut selected = Vec::<SafeguardWasmScoredCandidate>::new();
    for candidate in entries {
        let mut better_count = 0usize;
        for challenger in entries {
            if challenger.candidate_idx == candidate.candidate_idx {
                continue;
            }
            // Only strict "better than" decisions reduce eligibility.
            if safeguard_compare_scored_candidates_tie_only(challenger, candidate, candidates) == Ordering::Less {
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
    selected.sort_unstable_by(|left, right| safeguard_compare_scored_candidate_identity(left, right, candidates));
    selected
}

fn safeguard_count_key(artifact: &SafeguardWasmArtifactIn, mode: SafeguardWasmCountMode) -> SafeguardCountKey {
    safeguard_count_key_from_parts(artifact.slot, artifact.set, artifact.faction, artifact.main_stat, mode)
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
    // Normalize bucketed dimensions into one typed key payload.
    let normalized_faction = safeguard_normalized_faction_for_slot(slot, faction_raw);
    let scoped = SafeguardCountKey::Scoped {
        slot: if mode.per_slot { Some(slot) } else { None },
        set: if mode.per_set { Some(set) } else { None },
        faction: if mode.per_faction {
            Some(normalized_faction)
        } else {
            None
        },
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

// pub(super) so improvement_chance can stringify count keys for BTreeMap bucket lookups.
pub(super) fn safeguard_count_key_to_string(key: &SafeguardCountKey) -> String {
    // Global bucket keeps the historical token for TS parity.
    let SafeguardCountKey::Scoped {
        slot,
        set,
        faction,
        main_stat,
    } = key
    else {
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

// Expose safeguard count-key derivation so JS expected-bucket precomputation
// uses the exact same bucketing semantics as Rust detection scans.
pub fn safeguard_count_key_core(
    parsed_artifact: SafeguardWasmCountKeyArtifactIn,
    parsed_mode: SafeguardWasmCountMode,
) -> String {
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
    artifact_id
        .or(gear_inspector_preview_id)
        .or(gear_inspector_item_id)
        .unwrap_or(0)
}

// Expose bucket-key derivation so TS reuses Rust accessory-faction normalization.
pub fn safeguard_bucket_key_core(parsed_artifact: SafeguardWasmBucketKeyArtifactIn) -> String {
    let main_stat = safeguard_main_stat_from_fast_payload(parsed_artifact.main_stat);
    // Delegate to shared formatter so all bucket-key callers stay in lockstep.
    safeguard_bucket_key_from_parts(
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
        left.bucket_key.cmp(&right.bucket_key)
    });
}

// Flat parameter list on purpose: each input is documented at its own parameter, and
// bundling them into a struct would put that list one hop from the code that reads it.
#[allow(clippy::too_many_arguments)]
fn safeguard_build_entry_for_substats(
    prepared_rule: &SafeguardWasmPreparedRule,
    candidates: &[SafeguardWasmCandidateIn],
    candidate_sold_state: &[bool],
    // Parallel state flagging indices already protected by an earlier active safeguard rule.
    // Consulted only on the ranking path to honor `ignore_previous_safeguards`'s pool-exclusion
    // semantics; non-ranking paths ignore this and keep kept-count-driven behavior.
    previously_protected_state: &[bool],
    selected_substats: &[i64],
    substat_match: &str,
    // 1-based ordinal of this rule in the input safeguard list. Used as the lookup
    // dimension into per-rule improvement chances so each rule's threshold expansion
    // consults its OWN top-N chance, not the global union across rules.
    rule_ordinal: i64,
    // Pre-computed improvement chances keyed by (artifact id, rule_ordinal); used when
    // improvement_chance_threshold is set. BTreeMap chosen over BTreeMap for memory
    // stability under the talc allocator (matches the convention used elsewhere in this crate).
    improvement_chances: &BTreeMap<(i64, i64), f64>,
) -> SafeguardWasmEntryEvalOut {
    // Presence of selected substats toggles ranking/scoring mode.
    let has_substat_filter = !selected_substats.is_empty();
    // When exactly one substat is selected this eval ranks by that lone variant, so its bucket
    // ranks are a per-substat sub-bucket. Tag the result with the variant so the perSubstat merge
    // can attribute each candidate's sub-bucket rank; consumers off the merge path ignore it.
    let eval_substat_variant: Option<i64> = if selected_substats.len() == 1 {
        Some(selected_substats[0])
    } else {
        None
    };
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
    let required_per_bucket = prepared_rule.required_per_bucket.max(1);
    // Improvement-watch mode (anticipateImprovements WITH a chance threshold) keeps
    // zero-missing placeholders alive so fresh drops that clear the improvement-chance
    // bar stay protected until the next sync re-ranks them. Without a threshold the
    // mode intentionally degrades to anticipateGaps semantics (deficit placeholders only).
    let improvement_watch = safeguard_is_activation_anticipate_improvements(&prepared_rule.activation)
        && prepared_rule.improvement_chance_threshold.is_some();
    // Resolve expected-bucket payload into internal sample struct once.
    let expected_buckets = prepared_rule
        .expected_buckets
        .iter()
        .map(|bucket| SafeguardWasmExpectedBucketResolved {
            // Keep the parsed payload key read so dead-code checks stay quiet.
            // Bucket lookups use typed keys derived from the canonical sample.
            key: {
                let _provided_key = bucket.key.trim();
                // Derive typed keys from sample dimensions so lookups stay typed.
                safeguard_count_key_from_parts(
                    bucket.sample.slot,
                    bucket.sample.set,
                    bucket.sample.faction,
                    bucket.sample.main_stat,
                    prepared_rule.count_mode,
                )
            },
            sample: SafeguardWasmBucketSample {
                slot: bucket.sample.slot,
                set: bucket.sample.set,
                faction: bucket.sample.faction,
                main_stat: bucket.sample.main_stat,
            },
        })
        .collect::<Vec<_>>();

    // Pre-filter candidate indices by rule dimensions and substat gating.
    let mut matching_indices = candidates
        .iter()
        .enumerate()
        .filter(|(_, candidate)| safeguard_artifact_matches_rule(&candidate.artifact, prepared_rule))
        .filter(|(_, candidate)| {
            safeguard_candidate_matches_substats(&candidate.artifact, &selected_set, substat_match)
        })
        .map(|(idx, _)| idx)
        .collect::<Vec<_>>();

    // Pool-exclusion semantics for "Ignore previous safeguards" on the ranking path:
    // drop indices any earlier active rule already protected so this rule reaches deeper
    // into the score ranking instead of redundantly re-protecting the same items. The
    // non-ranking path (use_ranking == false) skips this filter so its kept-count math
    // continues to drive the toggle's effect there.
    if prepared_rule.ignore_previous_safeguards && use_ranking {
        matching_indices.retain(|idx| !previously_protected_state[*idx]);
    }

    if use_ranking {
        // Build scored list and drop zero-score artifacts early.
        let scored = matching_indices
            .iter()
            .filter_map(|candidate_idx| {
                let candidate = &candidates[*candidate_idx];
                // Always rank by current substat value. When a threshold is set, the
                // top-N is still determined by current score; improvement_chance is then
                // checked independently to expand the keep-list, not replace it.
                // `selected_substats` is this pass's ranked slice (one variant on the perSubstat
                // path); the rule's full selection classifies the epsilon ladder separately.
                let score = safeguard_compute_score_for_pass(
                    &candidate.artifact,
                    selected_substats,
                    &prepared_rule.selected_substats,
                    &prepared_rule.weights,
                    prepared_rule.weight_main_stat_by_rank,
                    prepared_rule.main_stat_rank_weight_factor,
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

        // Bucket scored entries by count key for bucketed counting modes.
        let mut buckets = BTreeMap::<SafeguardCountKey, Vec<SafeguardWasmScoredCandidate>>::new();
        let mut group_order = Vec::<SafeguardCountKey>::new();
        if prepared_rule.count_mode.per_rule {
            // Per-rule mode uses one global bucket.
            if !scored.is_empty() {
                buckets.insert(SafeguardCountKey::Global, scored);
                group_order.push(SafeguardCountKey::Global);
            }
        } else {
            // Bucketed mode routes each scored candidate to its bucket key.
            for entry in scored {
                let key = safeguard_count_key(&candidates[entry.candidate_idx].artifact, prepared_rule.count_mode);
                if let Some(bucket) = buckets.get_mut(&key) {
                    bucket.push(entry);
                } else {
                    buckets.insert(key.clone(), vec![entry]);
                    group_order.push(key);
                }
            }
        }

        // Expected-buckets override observed bucket count when provided.
        let buckets_tracked = if !expected_buckets.is_empty() {
            expected_buckets.len() as i64
        } else {
            buckets.len() as i64
        };
        // At least one bucket is assumed for required-count math.
        let effective_bucket_count = if buckets_tracked > 0 { buckets_tracked } else { 1 };
        let required_total = required_per_bucket * effective_bucket_count;
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
        // Collect all scored candidates across buckets for rank/quota output.
        let mut raw_candidates_for_output: Vec<SafeguardWasmScoredCandidate> = Vec::new();
        // Per-bucket (bucket) rank by candidate_idx: 1-based position within the candidate's
        // own bucket. candidate_rank below is the GLOBAL rank across buckets; bucket_rank is local.
        // BTreeMap (not HashMap): wasm/ uses BTreeMap throughout to avoid talc fragmentation.
        let mut bucket_rank_by_idx: BTreeMap<usize, u32> = BTreeMap::new();

        // Use explicit expected list when present, otherwise derive from observed buckets.
        let expected_list = if !expected_buckets.is_empty() {
            expected_buckets
        } else {
            group_order
                .iter()
                .map(|key| {
                    let sample = buckets
                        .get(key)
                        .and_then(|bucket| bucket.first())
                        .map(|entry| safeguard_bucket_sample_from_artifact(&candidates[entry.candidate_idx].artifact))
                        .unwrap_or_else(|| safeguard_default_bucket_sample(&prepared_rule.combination));
                    SafeguardWasmExpectedBucketResolved {
                        key: key.clone(),
                        sample,
                    }
                })
                .collect::<Vec<_>>()
        };

        // Process each expected bucket independently.
        for expected in &expected_list {
            let bucket = buckets.get(&expected.key).cloned().unwrap_or_default();
            if bucket.is_empty() {
                // Missing bucket contributes full per-bucket deficit placeholder.
                let deficit_bucket = required_per_bucket;
                placeholders.push(safeguard_build_placeholder(
                    safeguard_build_placeholder_combination(
                        &prepared_rule.combination,
                        prepared_rule.count_mode,
                        Some(&expected.sample),
                    ),
                    deficit_bucket,
                    SAFEGUARD_REASON_BUCKET,
                    placeholder_substats.clone(),
                    None,
                ));
                deficit += deficit_bucket;
                continue;
            }
            // Per-bucket rank: 1 + count of strictly-better peers in THIS bucket. Uses the same
            // tie-only comparator as top-N selection, so bucket_rank <= required_per_bucket exactly
            // matches is_within_quota. This is the in-bucket position (vs the global candidate_rank).
            for entry in bucket.iter() {
                let mut better = 0u32;
                for challenger in bucket.iter() {
                    if challenger.candidate_idx == entry.candidate_idx {
                        continue;
                    }
                    if safeguard_compare_scored_candidates_tie_only(challenger, entry, candidates) == Ordering::Less {
                        better += 1;
                    }
                }
                bucket_rank_by_idx.insert(entry.candidate_idx, better + 1);
            }
            // Always select top-N by current-value score with tie-boundary extension.
            let top_n = safeguard_select_top_scored_candidates(&bucket, required_per_bucket, candidates);
            // When a threshold is set, additionally keep any items outside the top-N
            // whose improvement_chance meets the bar — the threshold expands the keep-list
            // rather than replacing the current-value selection.
            let selected: Vec<SafeguardWasmScoredCandidate> =
                if let Some(ref thresholds) = prepared_rule.improvement_chance_threshold {
                    let top_n_indices: HashSet<usize> = top_n.iter().map(|e| e.candidate_idx).collect();
                    let mut expanded = top_n;
                    for e in bucket.iter() {
                        if top_n_indices.contains(&e.candidate_idx) {
                            continue; // already in top-N
                        }
                        let art_id = candidates[e.candidate_idx].artifact.id.unwrap_or(-1);
                        // Select the threshold slot for this artifact's current upgrade stage
                        // via the shared band mapping (SSOT with improvement-watch probing).
                        let art_level = candidates[e.candidate_idx].artifact.level;
                        let threshold = thresholds[safeguard_threshold_slot_for_level(art_level)];
                        // Look up the per-rule chance for this specific (artifact, rule_ordinal)
                        // pair. The chance is "probability this artifact lands in THIS rule's top-N"
                        // — so raising another rule's required_count cannot inflate this rule's
                        // expansion set (the bug that motivated this design).
                        if improvement_chances
                            .get(&(art_id, rule_ordinal))
                            .is_some_and(|&ch| ch >= threshold)
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
            let within_quota_set: HashSet<usize> = selected.iter().map(|e| e.candidate_idx).collect();
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
            // Accumulate per-bucket within-quota sets for the global is_within_quota output.
            within_quota_indices.extend(within_quota_set);
            // Bucket totals roll into overall counters.
            current_count += group_total;
            kept_count += group_kept;
            sold_count += group_sold;
            // Deficit uses bucket size (before tie extension) like TS semantics.
            let deficit_bucket = (required_per_bucket - bucket.len() as i64).max(0);
            // Improvement-watch emits a zero-missing placeholder even when the quota is met.
            if deficit_bucket > 0 || improvement_watch {
                // Zero-missing watch placeholders carry the bucket sample so corner
                // synthesis can probe the concrete slot/set/faction/main dimensions.
                let watch_sample = (deficit_bucket == 0).then(|| expected.sample.clone());
                placeholders.push(safeguard_build_placeholder(
                    safeguard_build_placeholder_combination(
                        &prepared_rule.combination,
                        prepared_rule.count_mode,
                        Some(&expected.sample),
                    ),
                    deficit_bucket,
                    SAFEGUARD_REASON_BUCKET,
                    placeholder_substats.clone(),
                    watch_sample,
                ));
            }
            deficit += deficit_bucket;
        }

        // No buckets observed still emits global placeholder when needed.
        if buckets_tracked == 0 && required_per_bucket > 0 {
            placeholders.push(safeguard_build_placeholder(
                prepared_rule.combination.clone(),
                required_per_bucket,
                SAFEGUARD_REASON_GLOBAL,
                placeholder_substats.clone(),
                None,
            ));
            deficit = required_per_bucket;
        }

        // Projected count includes sold artifacts only when rule is active.
        let projected = kept_count + if prepared_rule.rule_active { sold_count } else { 0 };
        // Build global ranked candidate output: sort all by score desc and assign ranks.
        raw_candidates_for_output.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));
        // is_within_quota uses the full within_quota_indices (kept + sold top-N), not just sold.
        let candidates_out: Vec<SafeguardWasmCandidateOut> = raw_candidates_for_output
            .iter()
            .enumerate()
            .map(|(rank_idx, entry)| SafeguardWasmCandidateOut {
                item_key: candidates[entry.candidate_idx].item_key,
                score: entry.score,
                candidate_rank: (rank_idx + 1) as u32,
                bucket_rank: bucket_rank_by_idx.get(&entry.candidate_idx).copied().unwrap_or(0),
                is_within_quota: within_quota_indices.contains(&entry.candidate_idx),
                // Per-substat attribution is stamped by the merge; single-substat entries here
                // carry none of their own (their whole bucket_rank IS the sub-bucket rank).
                substat_buckets: Vec::new(),
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
                per_bucket_required_count: required_per_bucket,
                buckets_tracked,
                required_count: required_total,
                current_count,
                projected_count: projected,
                deficit,
                covered_by_existing: kept_count >= required_total,
                item_keys,
                artifacts,
                placeholders,
                placeholder_count: 0,
                placeholder_fingerprint: String::new(),
                candidates: candidates_out,
            },
            selected_candidate_indices,
            substat_variant: eval_substat_variant,
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
        let required_total = required_per_bucket;
        let needed = (required_per_bucket - kept_count).max(0);
        // Without substat filters there is no quality basis to choose among sold items.
        // When the quota is unmet, protect every sold candidate rather than picking arbitrarily.
        // When the quota is already met (needed=0), sold items need no protection.
        let selected_sold = if !has_substat_filter && needed > 0 {
            sold_indices
        } else if has_substat_filter && needed > 0 {
            safeguard_sort_candidate_indices(&mut sold_indices, candidates);
            sold_indices.into_iter().take(needed as usize).collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        // Projected count includes sold artifacts only when rule is active.
        let projected = kept_count
            + if prepared_rule.rule_active {
                if has_substat_filter {
                    sold_count.min(needed)
                } else if needed > 0 {
                    sold_count
                } else {
                    0
                }
            } else {
                0
            };
        let deficit = (required_total - (kept_count + sold_count)).max(0);
        let mut placeholders = Vec::<SafeguardWasmPlaceholderOut>::new();
        // Global shortfall emits one global placeholder; improvement-watch also emits at
        // zero deficit. Per-rule mode has no bucket sample, so the watch placeholder falls
        // back to the deterministic combination-derived default sample for corner probes.
        if deficit > 0 || improvement_watch {
            let watch_sample = (deficit == 0).then(|| safeguard_default_bucket_sample(&prepared_rule.combination));
            placeholders.push(safeguard_build_placeholder(
                prepared_rule.combination.clone(),
                deficit,
                SAFEGUARD_REASON_GLOBAL,
                placeholder_substats.clone(),
                watch_sample,
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
                bucket_rank: 0,
                is_within_quota: !candidate_sold_state[*idx] || selected_sold_set.contains(idx),
                // Non-ranking path never feeds the perSubstat merge (that path always ranks).
                substat_buckets: Vec::new(),
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
                per_bucket_required_count: required_per_bucket,
                buckets_tracked: if matching_indices.is_empty() { 0 } else { 1 },
                required_count: required_total,
                current_count: kept_count + sold_count,
                projected_count: projected,
                deficit,
                covered_by_existing: kept_count >= required_total,
                item_keys,
                artifacts,
                placeholders,
                placeholder_count: 0,
                placeholder_fingerprint: String::new(),
                candidates: candidates_out,
            },
            selected_candidate_indices: selected_sold,
            substat_variant: eval_substat_variant,
        };
    }

    // Bucketed non-ranking path: split matching candidates into bucket buckets.
    let mut bucket_tallies = BTreeMap::<SafeguardCountKey, SafeguardWasmBucketTally>::new();
    let mut group_order = Vec::<SafeguardCountKey>::new();
    for candidate_idx in matching_indices {
        let candidate = &candidates[candidate_idx];
        let key = safeguard_count_key(&candidate.artifact, prepared_rule.count_mode);
        if let Some(bucket) = bucket_tallies.get_mut(&key) {
            if candidate_sold_state[candidate_idx] {
                bucket.sold.push(candidate_idx);
            } else {
                bucket.kept.push(candidate_idx);
            }
            if bucket.sample.is_none() {
                bucket.sample = Some(safeguard_bucket_sample_from_artifact(&candidate.artifact));
            }
        } else {
            let mut bucket = SafeguardWasmBucketTally {
                kept: Vec::new(),
                sold: Vec::new(),
                sample: Some(safeguard_bucket_sample_from_artifact(&candidate.artifact)),
            };
            if candidate_sold_state[candidate_idx] {
                bucket.sold.push(candidate_idx);
            } else {
                bucket.kept.push(candidate_idx);
            }
            bucket_tallies.insert(key.clone(), bucket);
            group_order.push(key);
        }
    }

    // Expected buckets override observed bucket cardinality.
    let buckets_tracked = if !prepared_rule.expected_buckets.is_empty() {
        prepared_rule.expected_buckets.len() as i64
    } else {
        bucket_tallies.len() as i64
    };
    // At least one bucket is assumed for required-count math.
    let effective_bucket_count = if buckets_tracked > 0 { buckets_tracked } else { 1 };
    let required_total = required_per_bucket * effective_bucket_count;
    // Aggregate counters and output buffers for final payload.
    let mut deficit = 0i64;
    let mut kept_total = 0i64;
    let mut sold_total = 0i64;
    let mut projected_total = 0i64;
    let mut at_risk = Vec::<usize>::new();
    let mut placeholders = Vec::<SafeguardWasmPlaceholderOut>::new();

    // Use explicit expected list when present, else derive from observed buckets.
    let expected_list = if !prepared_rule.expected_buckets.is_empty() {
        prepared_rule
            .expected_buckets
            .iter()
            .map(|bucket| SafeguardWasmExpectedBucketResolved {
                // Keep the parsed payload key read so dead-code checks stay quiet.
                // Bucket lookups use typed keys derived from the canonical sample.
                // Keep expected-bucket lookups typed and derive key dimensions
                // from the canonical sample payload.
                key: {
                    let _provided_key = bucket.key.trim();
                    safeguard_count_key_from_parts(
                        bucket.sample.slot,
                        bucket.sample.set,
                        bucket.sample.faction,
                        bucket.sample.main_stat,
                        prepared_rule.count_mode,
                    )
                },
                sample: SafeguardWasmBucketSample {
                    slot: bucket.sample.slot,
                    set: bucket.sample.set,
                    faction: bucket.sample.faction,
                    main_stat: bucket.sample.main_stat,
                },
            })
            .collect::<Vec<_>>()
    } else {
        group_order
            .iter()
            .map(|key| {
                let sample = bucket_tallies
                    .get(key)
                    .and_then(|bucket| bucket.sample.clone())
                    .unwrap_or_else(|| safeguard_default_bucket_sample(&prepared_rule.combination));
                SafeguardWasmExpectedBucketResolved {
                    key: key.clone(),
                    sample,
                }
            })
            .collect::<Vec<_>>()
    };

    // Evaluate each expected bucket independently.
    for expected in &expected_list {
        let Some(bucket) = bucket_tallies.get(&expected.key).cloned() else {
            // Missing expected bucket contributes full bucket deficit.
            let deficit_bucket = required_per_bucket;
            placeholders.push(safeguard_build_placeholder(
                safeguard_build_placeholder_combination(
                    &prepared_rule.combination,
                    prepared_rule.count_mode,
                    Some(&expected.sample),
                ),
                deficit_bucket,
                SAFEGUARD_REASON_BUCKET,
                placeholder_substats.clone(),
                None,
            ));
            deficit += deficit_bucket;
            continue;
        };
        // Count kept/sold and derive projected/deficit metrics for this bucket.
        let kept_count = bucket.kept.len() as i64;
        let sold_count = bucket.sold.len() as i64;
        kept_total += kept_count;
        sold_total += sold_count;
        let needed = (required_per_bucket - kept_count).max(0);
        let projected_bucket = kept_count
            + if prepared_rule.rule_active {
                if has_substat_filter {
                    sold_count.min(needed)
                } else if needed > 0 {
                    sold_count
                } else {
                    0
                }
            } else {
                0
            };
        projected_total += projected_bucket;
        let total_count = kept_count + sold_count;
        let deficit_bucket = (required_per_bucket - total_count).max(0);
        // Without substat filters there is no quality basis to choose among sold items.
        // When the quota is unmet, protect every sold candidate rather than picking arbitrarily.
        // When the quota is already met (needed=0), sold items need no protection.
        if !has_substat_filter && needed > 0 {
            at_risk.extend(bucket.sold.iter().copied());
        } else if has_substat_filter && needed > 0 {
            let mut sorted_sold = bucket.sold.clone();
            safeguard_sort_candidate_indices(&mut sorted_sold, candidates);
            at_risk.extend(sorted_sold.into_iter().take(needed as usize));
        }
        if deficit_bucket > 0 || improvement_watch {
            // Gaps mode only emits placeholders when this bucket is truly under-covered
            // (zero-missing placeholders create noisy/empty rows in UI tables);
            // improvement-watch intentionally emits them to keep qualifying drops protected.
            let watch_sample = (deficit_bucket == 0).then(|| expected.sample.clone());
            placeholders.push(safeguard_build_placeholder(
                safeguard_build_placeholder_combination(
                    &prepared_rule.combination,
                    prepared_rule.count_mode,
                    Some(&expected.sample),
                ),
                deficit_bucket,
                SAFEGUARD_REASON_BUCKET,
                placeholder_substats.clone(),
                watch_sample,
            ));
        }
        deficit += deficit_bucket;
    }

    // No observed buckets still yields a global placeholder shortfall.
    if buckets_tracked == 0 && required_per_bucket > 0 {
        placeholders.push(safeguard_build_placeholder(
            prepared_rule.combination.clone(),
            required_per_bucket,
            SAFEGUARD_REASON_GLOBAL,
            placeholder_substats.clone(),
            None,
        ));
        deficit = required_per_bucket;
    }

    // item_keys tracks only at-risk (sold) items selected for protection.
    let item_keys = at_risk.iter().map(|idx| candidates[*idx].item_key).collect::<Vec<_>>();
    // Non-ranking bucketed: emit all matching candidates with rank=0.
    // Within-quota: already kept OR in at-risk selection.
    let at_risk_set: HashSet<usize> = at_risk.iter().copied().collect();
    // Artifact metadata covers ALL matching candidates (kept + sold) so the UI can look up
    // slot/set for every candidate in the list, not just the at-risk sold ones.
    let artifacts: Vec<SafeguardWasmArtifactOut> = bucket_tallies
        .values()
        .flat_map(|bucket| bucket.kept.iter().chain(bucket.sold.iter()).copied())
        .map(|idx| safeguard_to_detection_artifact(&candidates[idx]))
        .collect();
    let candidates_out: Vec<SafeguardWasmCandidateOut> = bucket_tallies
        .values()
        .flat_map(|bucket| bucket.kept.iter().chain(bucket.sold.iter()).copied())
        .map(|idx| SafeguardWasmCandidateOut {
            item_key: candidates[idx].item_key,
            score: 0.0,
            candidate_rank: 0,
            bucket_rank: 0,
            is_within_quota: !candidate_sold_state[idx] || at_risk_set.contains(&idx),
            // Non-ranking bucketed path never feeds the perSubstat merge.
            substat_buckets: Vec::new(),
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
            per_bucket_required_count: required_per_bucket,
            buckets_tracked,
            required_count: required_total,
            current_count: kept_total + sold_total,
            projected_count: projected_total,
            deficit,
            covered_by_existing: kept_total >= required_total,
            item_keys,
            artifacts,
            placeholders,
            placeholder_count: 0,
            placeholder_fingerprint: String::new(),
            candidates: candidates_out,
        },
        selected_candidate_indices: at_risk,
        substat_variant: eval_substat_variant,
    }
}

fn safeguard_merge_substat_entries(
    prepared_rule: &SafeguardWasmPreparedRule,
    required_per_bucket: i64,
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
    // item_key → index into candidates_merged, so later per-substat entries append their
    // sub-bucket rank to the SAME merged candidate instead of being dropped as duplicates.
    let mut candidate_index_by_item_key = BTreeMap::<i64, usize>::new();
    let mut required_count = 0i64;
    let mut current_count = 0i64;
    let mut projected_count = 0i64;
    let mut deficit = 0i64;
    let mut buckets_tracked = 0i64;
    for mut eval in entries {
        // The single substat this entry ranked by (perSubstat merge always feeds single-variant
        // entries; None would leave sub-bucket attribution empty, which is a safe no-op).
        let eval_variant = eval.substat_variant;
        let entry = eval.entry;
        // Sum scalar counters across all per-substat entries.
        required_count += entry.required_count;
        current_count += entry.current_count;
        projected_count += entry.projected_count;
        deficit += entry.deficit;
        buckets_tracked += entry.buckets_tracked;
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
        // Merge candidate rows across per-substat entries. First sighting of an item creates its
        // merged row; later sightings append this entry's substat sub-bucket to the SAME row so
        // the flyout can restrict a focus click to one (bucket × substat) sub-bucket. The
        // top-level bucket_rank / is_within_quota track the item's BEST substat (lowest bucket
        // rank; within-quota if within-quota for ANY substat) so the unfocused list stays coherent.
        for candidate in entry.candidates {
            // A per-substat sub-bucket record for this item, if this entry was single-variant.
            let sub_bucket = eval_variant.map(|variant| SafeguardWasmSubstatBucketOut {
                variant,
                bucket_rank: candidate.bucket_rank,
                is_within_quota: candidate.is_within_quota,
            });
            if let Some(&existing_idx) = candidate_index_by_item_key.get(&candidate.item_key) {
                // Item already merged — fold in this substat's sub-bucket + best-rank promotion.
                let merged = &mut candidates_merged[existing_idx];
                if let Some(bucket) = sub_bucket {
                    // Promote top-level fields to the better (lower-rank) substat; keep within-quota
                    // sticky across substats so an item kept for ANY substat reads as protected.
                    if bucket.bucket_rank > 0 && (merged.bucket_rank == 0 || bucket.bucket_rank < merged.bucket_rank) {
                        merged.bucket_rank = bucket.bucket_rank;
                        merged.score = candidate.score;
                        merged.candidate_rank = candidate.candidate_rank;
                    }
                    merged.is_within_quota = merged.is_within_quota || bucket.is_within_quota;
                    merged.substat_buckets.push(bucket);
                }
            } else {
                // First sighting — seed the merged row and record its sub-bucket.
                let mut merged = candidate;
                merged.substat_buckets = sub_bucket.into_iter().collect();
                candidate_index_by_item_key.insert(merged.item_key, candidates_merged.len());
                candidates_merged.push(merged);
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
            per_bucket_required_count: required_per_bucket,
            buckets_tracked,
            required_count,
            current_count,
            projected_count,
            deficit,
            covered_by_existing: deficit <= 0,
            item_keys,
            artifacts,
            placeholders,
            placeholder_count: 0,
            placeholder_fingerprint: String::new(),
            candidates: candidates_merged,
        },
        selected_candidate_indices,
        // Aggregate merge result is not itself a single-substat entry.
        substat_variant: None,
    }
}

// Expected-bucket payload uses the canonical wrapper shape from app-side callers.
// Core version accepts typed input (JsValue parsing is done in the wasm crate).
fn parse_safeguard_expected_buckets_payload(
    expected_buckets_payload: Option<SafeguardWasmExpectedBucketsPayloadIn>,
) -> SafeguardWasmExpectedBucketsPayloadIn {
    // None means no explicit expected-bucket metadata was supplied.
    expected_buckets_payload.unwrap_or_default()
}

// Safeguard protection core evaluates prepared rules against candidate rows.
fn compute_safeguard_protection_core(
    parsed_candidates: Vec<SafeguardWasmCandidateIn>,
    parsed_rules: Vec<SafeguardWasmRuleIn>,
    expected_payload: SafeguardWasmExpectedBucketsPayloadIn,
    enabled: bool,
    now: f64,
    // Pre-computed improvement chances keyed by (artifact id, 1-based rule ordinal). Each rule
    // looks up its OWN chance — never the global union across rules — so cross-rule probability
    // inflation cannot drive an earlier rule's threshold expansion. BTreeMap chosen for
    // memory stability under the talc allocator (avoids BTreeMap's large contiguous backing
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
    // Parallel set of indices any active earlier rule has already protected. Drives the
    // ranking-path pool exclusion that gives `ignore_previous_safeguards` a functional
    // effect — without it the toggle would only relabel kept-vs-sold counters, since the
    // protected union across rules is invariant under that relabeling.
    let mut previously_protected_state = vec![false; parsed_candidates.len()];
    // ── Groups ──────────────────────────────────────────────────────────────────────────
    // Captured before the rules are consumed below. A group does NOT evaluate — its members do,
    // each exactly as if ungrouped, which is what makes each member's own required count the
    // size of its FEED. The group then pools those feeds and decides what survives (see
    // safeguard_apply_group_cap), so nothing here touches candidate collection or scoring.
    // Separators reach this function already projected to activation=off; they carry no group
    // in the wire projection, so they end a run exactly as the resolver requires.
    let group_entries = parsed_rules
        .iter()
        .map(|rule| groups::SafeguardGroupEntryIn {
            group_id: rule.group.as_ref().map(|group| group.id.clone()),
            separator: false,
        })
        .collect::<Vec<_>>();
    // Resolved once for the whole scan, by the same authority the UI calls through
    // `safeguard_groups_value`, so what the user sees and what the engine evaluates agree.
    let resolved_groups = groups::resolve_safeguard_groups(&group_entries);
    // The group settings each member carries, index-aligned; the cap pass reads each run's head.
    let group_settings = parsed_rules.iter().map(|rule| rule.group.clone()).collect::<Vec<_>>();
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
            // "Weight by Rank" defaults off when absent so pre-existing safeguards keep their scoring.
            let weight_main_stat_by_rank = rule.weight_main_stat_by_rank.unwrap_or(false);
            // Absent factor = SSOT default (1.0) so files saved before this field score unchanged.
            let main_stat_rank_weight_factor = rule
                .main_stat_rank_weight_factor
                .unwrap_or(SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_DEFAULT);
            // Resolve per-level thresholds to a concrete [f64; 4] array, clamping each slot.
            // Single/Array/Object variants are all normalized via into_slots_clamped().
            let improvement_chance_threshold = rule
                .improvement_chance_threshold
                .clone()
                .map(|v| v.into_slots_clamped());
            // Required count is clamped to at least one.
            let required_per_bucket = rule.required_count.unwrap_or(1).max(1);
            // Normalize match mode token for deterministic branching.
            let normalized_match = safeguard_normalize_substat_match(rule.substat_match.as_deref().unwrap_or(""));
            let selected_substats = rule.substats.unwrap_or_default();
            let has_substat_filter = !selected_substats.is_empty();
            // No selected substats always implies `any` behavior.
            let substat_match = if has_substat_filter {
                normalized_match
            } else {
                SAFEGUARD_SUBSTAT_ANY.to_string()
            };
            // Sanitize pre-parsed variant weights into the normalized numeric map.
            let mut weights = BTreeMap::<i64, f64>::new();
            for (variant, raw_weight) in rule.substat_weights.unwrap_or_default() {
                weights.insert(variant, safeguard_normalize_weight(raw_weight));
            }
            // Pre-split set filters into include/exclude lookup sets.
            let (set_includes, set_excludes) = safeguard_split_set_selections(&combination.sets);
            // Resolve expected buckets with explicit maps first, then domain enum.
            let expected_buckets = expected_payload
                .expected_buckets_by_rule_id
                .get(&rule_id)
                .cloned()
                .or_else(|| {
                    expected_payload
                        .expected_bucket_domain
                        .as_ref()
                        .map(|domain| safeguard_build_expected_buckets_for_rule(&combination, count_mode, domain))
                })
                .unwrap_or_default();
            SafeguardWasmPreparedRule {
                id: rule_id,
                hash: combination_hash,
                combination,
                required_per_bucket,
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
                weight_main_stat_by_rank,
                main_stat_rank_weight_factor,
                set_includes,
                set_excludes,
                expected_buckets,
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
    // ── A group run publishes only what it KEEPS, and only once it has closed ────────────────
    // A group is a cap over its members' finished selections, so what the run contributes to
    // the cumulative state can only be known after the cap has run: a piece a member fed but the
    // group dropped is SOLD, and a later rule must stay free to protect it — exactly as it would
    // after an equivalent flat list. Members therefore do not publish inline; their picks are
    // WITHHELD until the run closes, and the close caps first and publishes the survivors.
    //
    // A consequence: while a run is open nothing writes the cumulative + protected vectors, so
    // every member evaluates against the pre-run state — its siblings' picks are invisible to it,
    // and each member ranks the run's FULL pool by its own yardstick. That changes a member's own
    // kept/sold split, not what the run keeps: the ranking path already ranks kept pieces too and
    // emits only the sold ones, so a member's contribution was always "its top-N minus what a
    // sibling already took", and the cap's first-feeder dedupe credits it the same way now.
    // Ungrouped rules are completely unaffected: `run_starts` is -1 for them and they publish
    // inline as always.
    //
    // Head index of the run currently being evaluated, or None between runs / on a flat list.
    let mut open_run: Option<usize> = None;
    // Picks made by the members of the open run, held back from cumulative state until the run
    // closes. Indices only — the cap decides which ones survive, and only the survivors are
    // published (see safeguard_close_group_run).
    let mut pending_run_picks = Vec::<usize>::new();
    // The scan-wide read-only input every run close reads. The item_key → artifact index is
    // built once here; a flat list never caps anything, so it stays empty there.
    let cap_context = GroupCapContext {
        groups: &resolved_groups,
        group_settings: &group_settings,
        candidates: &parsed_candidates,
        artifact_by_item_key: if resolved_groups.has_groups {
            parsed_candidates
                .iter()
                .map(|candidate| (candidate.item_key, &candidate.artifact))
                .collect::<BTreeMap<i64, &SafeguardWasmArtifactIn>>()
        } else {
            BTreeMap::new()
        },
    };
    // `run_starts` is stamped per parsed rule and `prepared_rules` maps them 1:1; a future filter
    // on either side would silently desync every run boundary below.
    debug_assert_eq!(resolved_groups.run_starts.len(), prepared_rules.len());
    for (rule_index, prepared_rule) in prepared_rules.iter().enumerate() {
        rule_ordinal += 1;
        // The run this rule belongs to, or None when ungrouped (`run_starts` is -1 there, and
        // for every entry of a flat list).
        let run_start = match resolved_groups.run_starts.get(rule_index).copied().unwrap_or(-1) {
            start if start >= 0 => Some(start as usize),
            _ => None,
        };
        // Entering a different run (or leaving one) closes the previous run — caps it and
        // publishes its survivors. Doing it here, rather than at the run's end, keeps the loop
        // single-pass; `entries` holds exactly the rules before this one, so the closing run is
        // its tail.
        if open_run != run_start {
            if let Some(head) = open_run.take() {
                safeguard_close_group_run(
                    &cap_context,
                    head,
                    &mut entries,
                    &mut pending_run_picks,
                    &mut cumulative_candidate_sold_state,
                    &mut previously_protected_state,
                );
            }
            open_run = run_start;
        }
        // Per-rule toggle decides whether this rule sees prior safeguard selections. Inside a
        // run the cumulative state still holds the pre-run view (siblings' picks are pending, so
        // invisible); `ignore_previous_safeguards` widens that to the baseline, meaning "ignore
        // everything before me" including what preceded the group.
        let candidate_sold_state = if prepared_rule.ignore_previous_safeguards {
            &baseline_candidate_sold_state
        } else {
            &cumulative_candidate_sold_state
        };
        // The ranking path's pool exclusion for `ignore_previous_safeguards` — "do not re-rank
        // what is already protected before me; reach deeper" — must keep counting the run's
        // earlier members as "before me". Their picks are pending rather than published, so an
        // ignore-previous member gets a view with the pending picks folded in; otherwise it would
        // re-rank its siblings' gear, the dedupe would credit that gear back to them, and the one
        // toggle that lets a later member feed DIFFERENT pieces would silently stop working.
        // Only built for that member (an owned copy is O(candidates), so not per rule).
        let ignore_previous_view;
        let previously_protected_state_view: &[bool] =
            if prepared_rule.ignore_previous_safeguards && !pending_run_picks.is_empty() {
                let mut view = previously_protected_state.clone();
                for candidate_idx in &pending_run_picks {
                    if let Some(flag) = view.get_mut(*candidate_idx) {
                        *flag = true;
                    }
                }
                ignore_previous_view = view;
                &ignore_previous_view
            } else {
                &previously_protected_state
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
                        previously_protected_state_view,
                        &[*variant],
                        SAFEGUARD_SUBSTAT_ANY,
                        rule_ordinal,
                        improvement_chances,
                    )
                })
                .collect::<Vec<_>>();
            safeguard_merge_substat_entries(prepared_rule, prepared_rule.required_per_bucket, per_substat_entries)
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
                previously_protected_state_view,
                &prepared_rule.selected_substats,
                effective_match,
                rule_ordinal,
                improvement_chances,
            )
        };
        // Active safeguards always contribute to cumulative state for later rules — but a group
        // MEMBER's picks are held back until its run closes. Publishing them inline is what
        // starved its siblings; publishing the run's SURVIVORS at close keeps every later rule's
        // view identical to what it would have seen from an equivalent flat list.
        if prepared_rule.rule_active {
            if open_run.is_some() {
                pending_run_picks.extend(eval_result.selected_candidate_indices.iter().copied());
            } else {
                for candidate_idx in &eval_result.selected_candidate_indices {
                    if *candidate_idx >= cumulative_candidate_sold_state.len() {
                        continue;
                    }
                    cumulative_candidate_sold_state[*candidate_idx] = false;
                    // Mirror the projection into the protected set so later rules with
                    // `ignore_previous_safeguards = true` can exclude these indices on the
                    // ranking path. Bounds-checked alongside cumulative state above.
                    previously_protected_state[*candidate_idx] = true;
                }
            }
        }
        let mut entry = eval_result.entry;
        // Stamp ordinal so TypeScript can reference back to the rule by position.
        entry.rule_ordinal = Some(rule_ordinal);
        entries.push(entry);
    }
    // A run that reached the end of the list is still open: close it the same way — cap, then
    // publish the survivors — so the entries leave here capped and the cumulative state is
    // complete for anything reading it after this loop. Groups cap what their members were
    // allowed to keep, and that is the whole of what a group is: a constraint over finished
    // selections rather than an evaluation of its own. No-op on a flat list.
    if let Some(head) = open_run.take() {
        safeguard_close_group_run(
            &cap_context,
            head,
            &mut entries,
            &mut pending_run_picks,
            &mut cumulative_candidate_sold_state,
            &mut previously_protected_state,
        );
    }

    // Snapshot timestamp is sanitized to finite number for stable payloads.
    let scanned_at = if now.is_finite() { now } else { 0.0 };
    SafeguardWasmSnapshotOut {
        scanned_at,
        entries,
        placeholder_state_id: None,
    }
}

pub fn compute_safeguard_protection_core_pub(
    fast_candidates: Vec<SafeguardWasmCandidateFastIn>,
    rules: Vec<SafeguardWasmRuleIn>,
    expected_payload: Option<SafeguardWasmExpectedBucketsPayloadIn>,
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
    // Resolve expected buckets payload (None = empty default).
    let resolved_payload = parse_safeguard_expected_buckets_payload(expected_payload);
    // Run the shared protection core.
    let mut detection = compute_safeguard_protection_core(
        parsed_candidates,
        parsed_rules,
        resolved_payload,
        enabled,
        now,
        &improvement_chances,
    );
    // Legacy raw path (no corner attachment): placeholders still stay wasm-resident so
    // every snapshot leaving the engine has consistent plc/plf/pid semantics.
    stash_detection_placeholders(&mut detection);
    detection
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
    expected_payload: Option<SafeguardWasmExpectedBucketsPayloadIn>,
    enabled: bool,
    now: f64,
    // Pre-computed improvement chances keyed by (artifact_id, 1-based rule_ordinal).
    // Empty map disables threshold gating entirely.
    improvement_chances: BTreeMap<(i64, i64), f64>,
) -> Result<SafeguardCollectedAndProtectedSnapshotOut, String> {
    // Resolve expected buckets payload (None = empty default).
    let expected_payload = parse_safeguard_expected_buckets_payload(expected_payload);

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
            bucket_key: candidate.bucket_key.clone(),
            is_sold: candidate.is_sold,
            artifact: rows[candidate.row_index].artifact.clone(),
        })
        .collect::<Vec<_>>();
    // Clone the safeguard rules ONLY when an improvement-watch rule exists — detection
    // consumes parsed_rules, and corner synthesis needs the originals afterwards.
    let rules_for_watch = parsed_rules
        .iter()
        .any(improvement_watch::safeguard_rule_is_improvement_watch)
        .then(|| parsed_rules.clone());
    // Run detection against collected candidates without a second JS roundtrip.
    let mut detection = compute_safeguard_protection_core(
        protection_candidates,
        parsed_rules,
        expected_payload,
        enabled,
        now,
        &improvement_chances,
    );
    // Attach improvement-watch corner frontiers to zero-missing watch placeholders
    // (and drop unreachable ones) before the snapshot leaves the engine.
    if let Some(watch_rules) = rules_for_watch {
        improvement_watch::attach_watch_corners(&mut detection, &watch_rules, &rows);
    }
    // Placeholders stay wasm-resident: stash them (stamping count/fingerprint/state id)
    // before the snapshot is serialized to JS.
    stash_detection_placeholders(&mut detection);
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
    expected_payload: Option<SafeguardWasmExpectedBucketsPayloadIn>,
    enabled: bool,
    now: f64,
    // Pre-computed improvement chances keyed by (artifact_id, 1-based rule_ordinal).
    // Empty map disables threshold gating entirely.
    improvement_chances: BTreeMap<(i64, i64), f64>,
) -> SafeguardWasmSnapshotOut {
    // Resolve expected buckets payload (None = empty default).
    let expected = parse_safeguard_expected_buckets_payload(expected_payload);
    // Rebuild inner candidate list from already-typed row artifacts.
    // row_index is validated by collect_safeguard_candidates_core so this cannot OOB.
    let protection_candidates = candidates
        .iter()
        .map(|candidate| SafeguardWasmCandidateIn {
            item_key: candidate.item_key,
            bucket_key: candidate.bucket_key.clone(),
            is_sold: candidate.is_sold,
            artifact: rows[candidate.row_index].artifact.clone(),
        })
        .collect::<Vec<_>>();
    // Clone the safeguard rules ONLY when an improvement-watch rule exists — detection
    // consumes safeguard_rules, and corner synthesis needs the originals afterwards.
    let rules_for_watch = safeguard_rules
        .iter()
        .any(improvement_watch::safeguard_rule_is_improvement_watch)
        .then(|| safeguard_rules.clone());
    let mut detection = compute_safeguard_protection_core(
        protection_candidates,
        safeguard_rules,
        expected,
        enabled,
        now,
        &improvement_chances,
    );
    // Attach improvement-watch corner frontiers to zero-missing watch placeholders
    // (and drop unreachable ones) before the snapshot leaves the engine.
    if let Some(watch_rules) = rules_for_watch {
        improvement_watch::attach_watch_corners(&mut detection, &watch_rules, rows);
    }
    // Placeholders stay wasm-resident: stash them (stamping count/fingerprint/state id)
    // before the snapshot is serialized to JS.
    stash_detection_placeholders(&mut detection);
    detection
}

// serde default for the preview factor: the SSOT default (1.0), NOT f64's 0.0. An absent
// factor must leave the main-stat bonus unscaled, matching the prepared-rule resolve above.
fn safeguard_default_main_stat_rank_weight_factor() -> f64 {
    SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_DEFAULT
}

// Input payload for live preview scoring in the weight-configuration popover.
// Allows TS to rescore candidates with in-progress (unsaved) weights without
// re-running the full detection pass.
//
// ts-rs export: top-level input for score_safeguard_candidates_value.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmScorePreviewIn {
    // Candidate artifacts to score (substats carry raw values from the detection snapshot).
    // Caller is responsible for filtering by combination/dimensions before invocation —
    // the preview reuses the artifact set surfaced by the detection pass.
    pub artifacts: Vec<SafeguardWasmArtifactIn>,
    // Selected substat variants used in the scoring formula.
    pub substats: Vec<i64>,
    // Per-variant weight multipliers (key = variant as string, default = 1.0).
    pub weights: BTreeMap<i64, f64>,
    // "Weight by Rank" toggle so the preview ranking matches detection. Absent = off.
    #[serde(default)]
    pub weight_main_stat_by_rank: bool,
    // Tunable main-stat rank bonus multiplier so the preview matches detection. Absent = 1.0.
    #[serde(default = "safeguard_default_main_stat_rank_weight_factor")]
    pub main_stat_rank_weight_factor: f64,
    // Required count per bucket: same field consumed by detection so isWithinQuota
    // bucketing produces the same partition seen on first open.
    pub required_count: i64,
    // Optional bucket-mode flags. When omitted defaults to the canonical per-rule mode
    // (one global bucket), preserving the legacy preview behaviour for older callers.
    #[serde(default)]
    pub count_mode: Option<SafeguardWasmCountMode>,
    // Optional substat-match token. When it is `perSubstat` and more than one substat is
    // selected, the preview additionally emits per-substat sub-buckets (variant + bucket rank +
    // quota membership) so the flyout's per-substat focus buttons stay live during weight edits,
    // matching the detection snapshot. Absent / any other value = no sub-buckets (legacy behaviour).
    #[serde(default)]
    pub substat_match: Option<String>,
}

// Score a candidate set by the given substats/weights, bucket by count_mode, and return the
// per-bucket rank (1-based within each bucket) and the union of per-bucket top-N selections
// (isWithinQuota). SSOT for the preview ranking partition — used once for the combined-score
// preview and once per substat when the rule is `perSubstat`, so both stay in lockstep with the
// detection-side tie-boundary top-N semantics.
// Flat parameter list on purpose: each input is documented at its own parameter, and
// bundling them into a struct would put that list one hop from the code that reads it.
#[allow(clippy::too_many_arguments)]
fn score_and_bucket_preview_candidates(
    candidates: &[SafeguardWasmCandidateIn],
    // The substats THIS pass ranks by — one variant per perSubstat sub-bucket pass.
    substats: &[i64],
    // The rule's full selection, for epsilon classification (see safeguard_compute_score_for_pass).
    rule_substats: &[i64],
    weights: &BTreeMap<i64, f64>,
    weight_main_stat_by_rank: bool,
    main_stat_rank_weight_factor: f64,
    count_mode: SafeguardWasmCountMode,
    required_per_bucket: i64,
) -> (HashSet<usize>, BTreeMap<usize, u32>) {
    // Score and drop zero-score entries; matches detection's `score <= 0` filter.
    let scored: Vec<SafeguardWasmScoredCandidate> = candidates
        .iter()
        .enumerate()
        .filter_map(|(idx, candidate)| {
            let score = safeguard_compute_score_for_pass(
                &candidate.artifact,
                substats,
                rule_substats,
                weights,
                weight_main_stat_by_rank,
                main_stat_rank_weight_factor,
            );
            if score > 0.0 {
                Some(SafeguardWasmScoredCandidate {
                    candidate_idx: idx,
                    score,
                })
            } else {
                None
            }
        })
        .collect();
    // Bucket scored entries the same way detection does for the ranking path.
    let mut buckets = BTreeMap::<SafeguardCountKey, Vec<SafeguardWasmScoredCandidate>>::new();
    if count_mode.per_rule {
        // per_rule collapses every candidate into a single global bucket.
        if !scored.is_empty() {
            buckets.insert(SafeguardCountKey::Global, scored.clone());
        }
    } else {
        for entry in &scored {
            // Route by the same count_key helper detection uses so bucket identity
            // (slot/set/faction/main_stat selection) stays SSOT.
            let key = safeguard_count_key(&candidates[entry.candidate_idx].artifact, count_mode);
            buckets.entry(key).or_default().push(entry.clone());
        }
    }
    // Accumulate the union of per-bucket top-N selections — this drives is_within_quota.
    let mut within_quota_indices = HashSet::<usize>::new();
    // Per-bucket rank by candidate_idx (mirrors the detection path). BTreeMap per wasm/ convention.
    let mut bucket_rank_by_idx: BTreeMap<usize, u32> = BTreeMap::new();
    for bucket in buckets.values() {
        // Reuse the detection top-N picker so tie-boundary expansion stays identical.
        let selected = safeguard_select_top_scored_candidates(bucket, required_per_bucket, candidates);
        for entry in selected {
            within_quota_indices.insert(entry.candidate_idx);
        }
        // 1 + strictly-better peers in this bucket (same comparator as top-N selection).
        for entry in bucket.iter() {
            let mut better = 0u32;
            for challenger in bucket.iter() {
                if challenger.candidate_idx == entry.candidate_idx {
                    continue;
                }
                if safeguard_compare_scored_candidates_tie_only(challenger, entry, candidates) == Ordering::Less {
                    better += 1;
                }
            }
            bucket_rank_by_idx.insert(entry.candidate_idx, better + 1);
        }
    }
    (within_quota_indices, bucket_rank_by_idx)
}

// Score and rank candidates with the given substats/weights for live popover preview.
// Mirrors the detection-side ranking partition: buckets by count_mode, picks top-N per bucket
// with the same tie-boundary extension used by safeguard_build_entry_for_substats, then
// unions per-bucket selections into isWithinQuota. The output therefore matches what the
// candidate list shows on first open of the popover — the cutoff stays anchored across
// weight nudges instead of snapping to `rank < requiredCount`.
//
// perSubstat rules additionally get one sub-bucket per selected substat attached to each
// candidate (variant + per-substat bucket rank + quota membership), so the flyout's per-substat
// focus buttons stay live while weights are dragged. The top-level bucket_rank still reflects the
// COMBINED-score ranking (unchanged), matching how detection's merge leaves the aggregate fields.
pub fn score_safeguard_candidates_for_preview_core(
    input: SafeguardWasmScorePreviewIn,
) -> Vec<SafeguardWasmCandidateOut> {
    // Honor the same sanitization detection applies so per-rule fallback and
    // mutually-exclusive flag handling stay in lockstep.
    let count_mode = safeguard_resolve_count_mode(input.count_mode);
    // Detection clamps required-count up to 1; replicate so the per-bucket quota
    // here matches the detection-side partition exactly.
    let required_per_bucket = input.required_count.max(1);
    // Wrap each input artifact in a synthetic candidate so we can reuse the detection
    // helpers (count-key, tie-extension top-N) without forking ranking semantics.
    let candidates: Vec<SafeguardWasmCandidateIn> = input
        .artifacts
        .into_iter()
        .map(|artifact| {
            let bucket_key = safeguard_bucket_key_from_artifact(&artifact);
            // item_key resolves from artifact.id when present; UI maps look up by this
            // value, so missing ids fall back to a stable but unique sentinel later.
            let item_key = artifact.id.unwrap_or(0);
            SafeguardWasmCandidateIn {
                item_key,
                bucket_key,
                // Preview never represents the sold/kept axis — it only ranks.
                is_sold: false,
                artifact,
            }
        })
        .collect();
    // Combined-score partition drives the top-level score/rank/bucket_rank + isWithinQuota for the
    // ordered list. This is the SSOT for the cutoff divider position, unchanged from before.
    // Combined pass: ranked slice and rule selection are the same list here.
    let (within_quota_indices, bucket_rank_by_idx) = score_and_bucket_preview_candidates(
        &candidates,
        &input.substats,
        &input.substats,
        &input.weights,
        input.weight_main_stat_by_rank,
        input.main_stat_rank_weight_factor,
        count_mode,
        required_per_bucket,
    );

    // perSubstat rules keep the best substat's quota per bucket, so compute one sub-bucket per
    // selected substat — mirroring the detection merge — and attach them to each candidate. Each
    // pass scores by exactly one substat (weight 1.0, matching detection's per-substat evaluation
    // which passes SAFEGUARD_SUBSTAT_ANY with the lone variant).
    let is_multi_per_substat = input
        .substat_match
        .as_deref()
        .map(safeguard_normalize_substat_match)
        .as_deref()
        == Some(SAFEGUARD_SUBSTAT_PER_SUBSTAT)
        && input.substats.len() > 1;
    // candidate_idx → accumulated per-substat sub-buckets. Only populated for perSubstat rules.
    let mut sub_buckets_by_idx: BTreeMap<usize, Vec<SafeguardWasmSubstatBucketOut>> = BTreeMap::new();
    if is_multi_per_substat {
        for &variant in &input.substats {
            // Single-variant weight map: score purely by this substat (default weight 1.0).
            let single_weight: BTreeMap<i64, f64> =
                input.weights.get(&variant).map(|&w| (variant, w)).into_iter().collect();
            let (sub_within, sub_bucket_rank) = score_and_bucket_preview_candidates(
                &candidates,
                &[variant],
                &input.substats,
                &single_weight,
                input.weight_main_stat_by_rank,
                input.main_stat_rank_weight_factor,
                count_mode,
                required_per_bucket,
            );
            for (&idx, &bucket_rank) in &sub_bucket_rank {
                sub_buckets_by_idx
                    .entry(idx)
                    .or_default()
                    .push(SafeguardWasmSubstatBucketOut {
                        variant,
                        bucket_rank,
                        is_within_quota: sub_within.contains(&idx),
                    });
            }
        }
    }

    // Re-score by the combined weights for the ordered output list (score field + candidate_rank).
    let mut ordered: Vec<SafeguardWasmScoredCandidate> = candidates
        .iter()
        .enumerate()
        .filter_map(|(idx, candidate)| {
            let score = safeguard_compute_score(
                &candidate.artifact,
                &input.substats,
                &input.weights,
                input.weight_main_stat_by_rank,
                input.main_stat_rank_weight_factor,
            );
            (score > 0.0).then_some(SafeguardWasmScoredCandidate {
                candidate_idx: idx,
                score,
            })
        })
        .collect();
    // Sort all scored entries by score descending for rank assignment in output order.
    ordered.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));
    ordered
        .iter()
        .enumerate()
        .map(|(rank_idx, entry)| {
            // Resolve item key: prefer artifact id; fall back to candidate index so the
            // emitted key stays unique across artifacts that omit ids.
            let candidate = &candidates[entry.candidate_idx];
            let item_key = candidate.artifact.id.unwrap_or(entry.candidate_idx as i64);
            // Per-substat rules attach their sub-buckets; combined isWithinQuota then becomes
            // "within quota for ANY substat" so the unfocused list matches detection's merge.
            let substat_buckets = sub_buckets_by_idx.remove(&entry.candidate_idx).unwrap_or_default();
            let within_quota = if is_multi_per_substat {
                substat_buckets.iter().any(|b| b.is_within_quota)
            } else {
                within_quota_indices.contains(&entry.candidate_idx)
            };
            SafeguardWasmCandidateOut {
                item_key,
                score: entry.score,
                candidate_rank: (rank_idx + 1) as u32,
                bucket_rank: bucket_rank_by_idx.get(&entry.candidate_idx).copied().unwrap_or(0),
                is_within_quota: within_quota,
                substat_buckets,
            }
        })
        .collect()
}

// Verifies the live preview function reproduces detection-side isWithinQuota
// partitioning across count-mode combinations. This is the regression suite for
// the popover cutoff divider: when the popover first opens the divider sits at
// the position implied by detection, so the preview must mirror those semantics
// or weight nudges would visibly snap the divider to a different row.
#[cfg(test)]
mod score_safeguard_candidates_for_preview_core_tests {
    use super::*;
    // Substat wire struct lives in fast_path_types and is not re-exported from
    // mod.rs (`pub use` only surfaces SafeguardWasmArtifactIn). Tests pull it in
    // directly so the artifact factory can populate the substats vector.
    use crate::safeguards::fast_path_types::SafeguardWasmSubstatIn;

    // Variant chosen so glyph_average_for_variant returns 0.0 — keeps the score
    // formula collapsed to `weight * raw / max6` for predictable assertions.
    const TEST_VARIANT: i64 = STAT_VARIANT_CR;
    const TEST_MAX6: f64 = 7.0;

    // Helper: build a minimal artifact carrying a single CR substat. Slot/set/
    // faction/main are exposed so per-* count modes can bucket the artifact.
    fn make_artifact(id: i64, slot: i64, set: i64, faction: i64, main: i64, cr_value: f64) -> SafeguardWasmArtifactIn {
        SafeguardWasmArtifactIn {
            id: Some(id),
            slot,
            set,
            // Rank 1 keeps glyph_average_for_variant returning 0.0 for CR (the
            // function short-circuits for CR/CDMG regardless of rank, but
            // pinning rank also stops other normalizations from drifting).
            rank: 1,
            rarity: 6,
            level: 16,
            exact_level: Some(16),
            faction,
            main_stat: main,
            equipped_in_collection: false,
            equipped_in_vault: false,
            substats: vec![SafeguardWasmSubstatIn {
                variant: TEST_VARIANT,
                is_flat: false,
                value: cr_value,
                rolls: Some(1),
            }],
        }
    }

    // Helper: weights map with a single CR weight (defaults the rest to 1.0).
    fn cr_weights(weight: f64) -> BTreeMap<i64, f64> {
        let mut map = BTreeMap::<i64, f64>::new();
        map.insert(TEST_VARIANT, weight);
        map
    }

    // Build a boots/SPD-main artifact of the given rank with one CR substat value.
    fn make_boots_spd_artifact(id: i64, rank: i64, cr_value: f64) -> SafeguardWasmArtifactIn {
        SafeguardWasmArtifactIn {
            id: Some(id),
            slot: ARTIFACT_TYPE_BOOTS,
            set: 1,
            rank,
            rarity: 6,
            level: 16,
            exact_level: Some(16),
            faction: 0,
            main_stat: STAT_VARIANT_SPD,
            equipped_in_collection: false,
            equipped_in_vault: false,
            substats: vec![SafeguardWasmSubstatIn {
                variant: STAT_VARIANT_CR,
                is_flat: false,
                value: cr_value,
                rolls: Some(1),
            }],
        }
    }

    // Regression for the reported bug: a 5★ with slightly better substats was overshadowing a
    // same-mainstat 6★. With "Weight by Rank" OFF the 5★ wins (substat-only). With it ON, the
    // 6★'s stronger main stat (+16) overcomes the small substat edge and the 6★ wins.
    #[test]
    fn weight_by_rank_lets_six_star_overcome_a_slightly_better_five_star() {
        let weights = cr_weights(1.0);
        let selected = [STAT_VARIANT_CR];
        // 6★ with the weaker substat, 5★ with the slightly stronger substat.
        let six = make_boots_spd_artifact(1, 6, 4.0);
        let five = make_boots_spd_artifact(2, 5, 4.5);

        // Default factor keeps the pre-factor behavior; use it for the regression assertions.
        let f = SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_DEFAULT;
        // OFF: substat-only scoring → the 5★ outscores the 6★ (the original bug).
        let six_off = safeguard_compute_score(&six, &selected, &weights, false, f);
        let five_off = safeguard_compute_score(&five, &selected, &weights, false, f);
        assert!(
            five_off > six_off,
            "with the toggle off the 5★ should still win on substats"
        );

        // ON: the main-stat rank bonus flips it so the 6★ wins.
        let six_on = safeguard_compute_score(&six, &selected, &weights, true, f);
        let five_on = safeguard_compute_score(&five, &selected, &weights, true, f);
        assert!(
            six_on > five_on,
            "with the toggle on the 6★ should overtake the near-equal 5★"
        );

        // The bonus is level-independent: an unleveled 6★ scores the same main-stat term as a maxed one.
        let mut six_low = make_boots_spd_artifact(3, 6, 4.0);
        six_low.level = 4;
        six_low.exact_level = Some(4);
        assert!(
            (safeguard_compute_score(&six_low, &selected, &weights, true, f) - six_on).abs() < 1e-9,
            "main-stat rank bonus must not depend on the piece's current level",
        );

        // No selected substats → bonus is suppressed (existing rank tie-break handles that path).
        assert_eq!(
            safeguard_compute_score(&six, &[], &weights, true, f),
            safeguard_compute_score(&six, &[], &weights, false, f),
            "with no substats selected the toggle must not change the score",
        );
    }

    // Epsilon tie-break: unselected non-flat substats separate otherwise-tied pieces, flats never
    // earn the bonus, and the term stays far below any real weighted-substat difference.
    #[test]
    fn non_flat_epsilon_bonus_breaks_ties_without_overriding_real_weights() {
        let weights = cr_weights(1.0);
        let selected = [STAT_VARIANT_CR];
        let f = SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_DEFAULT;
        // Three pieces tied on the selected CR line; they differ only in the unselected extra line.
        let bare = make_boots_spd_artifact(1, 6, 4.0);
        let mut with_flat = make_boots_spd_artifact(2, 6, 4.0);
        with_flat.substats.push(SafeguardWasmSubstatIn {
            variant: STAT_VARIANT_HP_FLAT,
            is_flat: true,
            value: 300.0,
            rolls: Some(1),
        });
        let mut with_spd = make_boots_spd_artifact(3, 6, 4.0);
        with_spd.substats.push(SafeguardWasmSubstatIn {
            variant: STAT_VARIANT_SPD,
            is_flat: true,
            value: 5.0,
            rolls: Some(1),
        });

        let bare_score = safeguard_compute_score(&bare, &selected, &weights, false, f);
        let flat_score = safeguard_compute_score(&with_flat, &selected, &weights, false, f);
        let spd_score = safeguard_compute_score(&with_spd, &selected, &weights, false, f);
        // Flat extras earn nothing: the piece stays exactly tied with the bare one.
        assert_eq!(flat_score, bare_score, "flat HP must not earn the epsilon tie-break");
        // A useful extra line wins the tie — and by more than the ranking tie window,
        // otherwise safeguard_select_top_scored_candidates would still treat them as tied.
        assert!(
            spd_score > flat_score,
            "an unselected SPD line must outrank a flat line"
        );
        assert!(
            spd_score - flat_score > SAFEGUARD_SCORE_TIE_EPSILON,
            "epsilon term must clear the score tie window to affect quota selection",
        );

        // The tie-break must never flip a real (explicitly weighted) substat difference:
        // a piece slightly ahead on the selected CR line stays ahead of a piece stacked
        // with three unselected non-flat lines (max epsilon ≈ 3 × 0.0001 × normalized).
        let better_cr = make_boots_spd_artifact(4, 6, 4.05);
        let mut stacked = make_boots_spd_artifact(5, 6, 4.0);
        for (variant, value) in [
            (STAT_VARIANT_SPD, 6.0),
            (STAT_VARIANT_ACC, 12.0),
            (STAT_VARIANT_RES, 12.0),
        ] {
            stacked.substats.push(SafeguardWasmSubstatIn {
                variant,
                is_flat: true,
                value,
                rolls: Some(1),
            });
        }
        assert!(
            safeguard_compute_score(&better_cr, &selected, &weights, false, f)
                > safeguard_compute_score(&stacked, &selected, &weights, false, f),
            "epsilon stacking must not overcome a real selected-substat edge",
        );

        // Empty selection keeps legacy all-zero scoring — the epsilon term is suppressed.
        assert_eq!(
            safeguard_compute_score(&with_spd, &[], &weights, false, f),
            0.0,
            "no selected substats must still score 0 (epsilon gated on non-empty selection)",
        );
    }

    // Regression: a perSubstat pass must not admit gear that lacks the substat it ranks by, and
    // the rule's OTHER selected substats must not be scored as unselected epsilon padding.
    //
    // Finding from real use: the DEF% bucket list reshuffled when the HP% weight was raised. A DEF-main ring
    // with no DEF% substat still scored above zero in the DEF% pass — the main-stat rank bonus
    // plus epsilons for the rule's own HP%/ATK% picks lifted it — so it entered the DEF%
    // sub-bucket, and weight edits moved pieces across that `score > 0` membership boundary.
    #[test]
    fn per_substat_pass_excludes_gear_without_the_ranked_substat() {
        // DEF-flat-main ring at the given rank with an explicit substat list.
        fn ring(id: i64, rank: i64, substats: &[(i64, f64)]) -> SafeguardWasmArtifactIn {
            SafeguardWasmArtifactIn {
                id: Some(id),
                slot: SAFEGUARD_SLOT_RING,
                set: 1,
                rank,
                rarity: 6,
                level: 12,
                exact_level: Some(12),
                faction: 0,
                main_stat: STAT_VARIANT_DEF_FLAT,
                equipped_in_collection: false,
                equipped_in_vault: false,
                substats: substats
                    .iter()
                    .map(|&(variant, value)| SafeguardWasmSubstatIn {
                        variant,
                        is_flat: false,
                        value,
                        rolls: Some(1),
                    })
                    .collect(),
            }
        }
        let f = SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_DEFAULT;
        // The rule selects three percent substats and ranks each independently.
        let rule_substats = [
            SAFEGUARD_MAIN_HP_PERCENT,
            SAFEGUARD_MAIN_ATK_PERCENT,
            SAFEGUARD_MAIN_DEF_PERCENT,
        ];
        let weights = BTreeMap::<i64, f64>::new(); // all default (1.0)
                                                   // Rank 6 carrying HP%/ATK% but NO DEF% — the piece from the bug report.
        let no_def = ring(
            1,
            6,
            &[(SAFEGUARD_MAIN_HP_PERCENT, 6.0), (SAFEGUARD_MAIN_ATK_PERCENT, 17.0)],
        );
        // Rank 5 that genuinely has DEF%.
        let has_def = ring(
            2,
            5,
            &[(SAFEGUARD_MAIN_HP_PERCENT, 9.0), (SAFEGUARD_MAIN_DEF_PERCENT, 10.0)],
        );

        // DEF% pass: the piece without DEF% scores exactly zero, so the caller's `score <= 0`
        // filter drops it and it never earns a DEF% sub-bucket — with the rank toggle ON, which
        // is what previously carried it over the line.
        let no_def_in_def_pass = safeguard_compute_score_for_pass(
            &no_def,
            &[SAFEGUARD_MAIN_DEF_PERCENT],
            &rule_substats,
            &weights,
            true,
            f,
        );
        assert_eq!(
            no_def_in_def_pass, 0.0,
            "a piece without DEF% must score 0 in the DEF% pass regardless of rank bonus/epsilons",
        );
        // The piece that HAS DEF% still scores in that pass.
        let has_def_in_def_pass = safeguard_compute_score_for_pass(
            &has_def,
            &[SAFEGUARD_MAIN_DEF_PERCENT],
            &rule_substats,
            &weights,
            true,
            f,
        );
        assert!(
            has_def_in_def_pass > 0.0,
            "a piece with DEF% must still rank in the DEF% pass",
        );

        // Membership must not depend on an unrelated substat's weight: re-score the DEF% pass with
        // a heavily raised HP% weight and confirm both verdicts are unchanged. This is the exact
        // interaction the user hit by editing HP% while focused on the DEF% bucket.
        let mut heavy_hp = BTreeMap::<i64, f64>::new();
        heavy_hp.insert(SAFEGUARD_MAIN_HP_PERCENT, 50.0);
        assert_eq!(
            safeguard_compute_score_for_pass(
                &no_def,
                &[SAFEGUARD_MAIN_DEF_PERCENT],
                &rule_substats,
                &heavy_hp,
                true,
                f
            ),
            0.0,
            "raising the HP% weight must not admit a DEF%-less piece into the DEF% bucket",
        );
        assert_eq!(
            safeguard_compute_score_for_pass(
                &has_def,
                &[SAFEGUARD_MAIN_DEF_PERCENT],
                &rule_substats,
                &heavy_hp,
                true,
                f
            ),
            has_def_in_def_pass,
            "the DEF% pass score must be independent of the HP% weight",
        );

        // The rule's other picks must not earn epsilon padding inside a single-variant pass:
        // scoring the HP% pass against the full rule selection equals scoring it against a
        // selection where ATK%/DEF% are likewise known-selected (i.e. no extra epsilon appears).
        let hp_pass = safeguard_compute_score_for_pass(
            &no_def,
            &[SAFEGUARD_MAIN_HP_PERCENT],
            &rule_substats,
            &weights,
            false,
            f,
        );
        let hp_only_selection = safeguard_compute_score_for_pass(
            &no_def,
            &[SAFEGUARD_MAIN_HP_PERCENT],
            &[SAFEGUARD_MAIN_HP_PERCENT],
            &weights,
            false,
            f,
        );
        assert!(
            hp_pass < hp_only_selection,
            "the rule's other picks must be excluded from the epsilon ladder, not counted as padding",
        );
    }

    // Regression companion to the presence gate: the gate must NOT fire when the ranked
    // substat is impossible on the piece. DEF% can never roll on a DEF%-MAIN ring, which is
    // why safeguard_candidate_matches_substats admits such gear vacuously. If the gate still
    // zeroed it, every DEF%-main ring would silently drop out of a [DEF%] rule entirely.
    #[test]
    fn vacuous_ranked_substat_still_scores() {
        // DEF%-MAIN ring: DEF% is unrollable as a substat here.
        let art = SafeguardWasmArtifactIn {
            id: Some(9),
            slot: SAFEGUARD_SLOT_RING,
            set: 1,
            rank: 6,
            rarity: 6,
            level: 12,
            exact_level: Some(12),
            faction: 0,
            main_stat: SAFEGUARD_MAIN_DEF_PERCENT,
            equipped_in_collection: false,
            equipped_in_vault: false,
            substats: vec![SafeguardWasmSubstatIn {
                variant: STAT_VARIANT_SPD,
                is_flat: true,
                value: 10.0,
                rolls: Some(2),
            }],
        };
        let selected = [SAFEGUARD_MAIN_DEF_PERCENT];
        let f = SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_DEFAULT;
        let weights = BTreeMap::<i64, f64>::new();
        // The rule gate admits it vacuously...
        let set: HashSet<i64> = selected.iter().copied().collect();
        assert!(
            safeguard_candidate_matches_substats(&art, &set, SAFEGUARD_SUBSTAT_ANY),
            "an impossible selected substat must match vacuously",
        );
        // ...so the scorer must keep it rankable rather than zeroing it out.
        assert!(
            safeguard_compute_score(&art, &selected, &weights, true, f) > 0.0,
            "a piece whose ranked substat cannot roll must stay rankable, not score 0",
        );
    }

    // The min-count threshold must be capped at what can actually roll on the piece. An "all"
    // rule over [DEF%, SPD] on a DEF%-main ring can only ever be satisfied by SPD, so the piece
    // must match on SPD alone — the impossible DEF% must not inflate the requirement to 2.
    #[test]
    fn impossible_substat_does_not_inflate_min_count() {
        // DEF%-MAIN ring holding only SPD: DEF% is unrollable as a substat here.
        let art = SafeguardWasmArtifactIn {
            id: Some(11),
            slot: SAFEGUARD_SLOT_RING,
            set: 1,
            rank: 6,
            rarity: 6,
            level: 12,
            exact_level: Some(12),
            faction: 0,
            main_stat: SAFEGUARD_MAIN_DEF_PERCENT,
            equipped_in_collection: false,
            equipped_in_vault: false,
            substats: vec![SafeguardWasmSubstatIn {
                variant: STAT_VARIANT_SPD,
                is_flat: true,
                value: 10.0,
                rolls: Some(2),
            }],
        };
        // Only SPD is possible, so the shared counting rule must report exactly 1 of 2.
        let selected = [SAFEGUARD_MAIN_DEF_PERCENT, STAT_VARIANT_SPD];
        assert_eq!(
            safeguard_possible_substat_count(selected.iter(), art.main_stat),
            1,
            "the mainstat-duplicating selection must not be counted as possible",
        );
        // "all" would demand 2 matches uncapped; capped at 1 the piece passes on SPD alone.
        let set: HashSet<i64> = selected.iter().copied().collect();
        assert!(
            safeguard_candidate_matches_substats(&art, &set, SAFEGUARD_SUBSTAT_ALL),
            "an all-match rule must cap its threshold at the rollable substats",
        );
    }
    // Aligned-flat epsilon tiers: a flat line earns a micro tie-break only when its percent
    // twin is a selected substat and/or the piece's own main stat; unrelated flats earn 0 and
    // any useful non-flat line still outranks even a max-rolled aligned flat.
    #[test]
    fn aligned_flat_epsilon_ladder_orders_relevant_flats_above_unrelated_ones() {
        // Flexible builder: boots at rank 6 with an arbitrary main stat and substat list.
        fn make(id: i64, main: i64, substats: &[(i64, f64)]) -> SafeguardWasmArtifactIn {
            SafeguardWasmArtifactIn {
                id: Some(id),
                slot: ARTIFACT_TYPE_BOOTS,
                set: 1,
                rank: 6,
                rarity: 6,
                level: 16,
                exact_level: Some(16),
                faction: 0,
                main_stat: main,
                equipped_in_collection: false,
                equipped_in_vault: false,
                substats: substats
                    .iter()
                    .map(|&(variant, value)| SafeguardWasmSubstatIn {
                        variant,
                        // Wire flag is irrelevant to the ladder (classification is by variant).
                        is_flat: true,
                        value,
                        rolls: Some(1),
                    })
                    .collect(),
            }
        }
        let weights = BTreeMap::<i64, f64>::new();
        let f = SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_DEFAULT;
        let score = |artifact: &SafeguardWasmArtifactIn, selected: &[i64]| {
            safeguard_compute_score(artifact, selected, &weights, false, f)
        };

        // Selected-aligned: HP% is weighted → the flat HP extra beats the flat ATK extra.
        let hp_selected = [STAT_VARIANT_HP_PERCENT];
        let base = [(STAT_VARIANT_HP_PERCENT, 5.0)];
        let with_flat_hp = make(1, STAT_VARIANT_SPD, &[base[0], (STAT_VARIANT_HP_FLAT, 300.0)]);
        let with_flat_atk = make(2, STAT_VARIANT_SPD, &[base[0], (STAT_VARIANT_ATK_FLAT, 16.0)]);
        assert!(
            score(&with_flat_hp, &hp_selected) > score(&with_flat_atk, &hp_selected),
            "flat HP must edge flat ATK when HP% is a selected substat",
        );

        // Main-aligned: piece's own main is HP% → flat HP beats flat ATK even though the
        // selection (SPD) is unrelated to either flat.
        let spd_selected = [STAT_VARIANT_SPD];
        let spd_base = (STAT_VARIANT_SPD, 4.0);
        let main_hp_flat_hp = make(3, STAT_VARIANT_HP_PERCENT, &[spd_base, (STAT_VARIANT_HP_FLAT, 300.0)]);
        let main_hp_flat_atk = make(4, STAT_VARIANT_HP_PERCENT, &[spd_base, (STAT_VARIANT_ATK_FLAT, 16.0)]);
        assert!(
            score(&main_hp_flat_hp, &spd_selected) > score(&main_hp_flat_atk, &spd_selected),
            "flat HP must edge flat ATK when the piece's main stat is HP%",
        );

        // Doubly aligned beats singly aligned: same flat HP value, but one piece also has the
        // HP% main so both alignment tiers stack additively.
        let hp_spd_selected = [STAT_VARIANT_HP_PERCENT, STAT_VARIANT_SPD];
        let doubly = make(5, STAT_VARIANT_HP_PERCENT, &[spd_base, (STAT_VARIANT_HP_FLAT, 300.0)]);
        let singly = make(6, STAT_VARIANT_DEF_PERCENT, &[spd_base, (STAT_VARIANT_HP_FLAT, 300.0)]);
        assert!(
            score(&doubly, &hp_spd_selected) > score(&singly, &hp_spd_selected),
            "a flat aligned to BOTH the selection and the main stat must outrank a singly-aligned one",
        );

        // Tier order: even a max-rolled doubly-aligned flat stays below a weak genuine
        // non-flat line (the non-flat tier is ~100× above the flat tiers).
        let weak_res = make(7, STAT_VARIANT_HP_PERCENT, &[spd_base, (STAT_VARIANT_RES, 3.0)]);
        let god_flat = make(8, STAT_VARIANT_HP_PERCENT, &[spd_base, (STAT_VARIANT_HP_FLAT, 2825.0)]);
        assert!(
            score(&weak_res, &hp_spd_selected) > score(&god_flat, &hp_spd_selected),
            "any useful non-flat line must outrank even a max-rolled doubly-aligned flat",
        );

        // Unrelated flats stay at exactly zero: adding one changes nothing.
        let bare = make(9, STAT_VARIANT_HP_PERCENT, &[spd_base]);
        let unrelated = make(10, STAT_VARIANT_HP_PERCENT, &[spd_base, (STAT_VARIANT_DEF_FLAT, 16.0)]);
        assert_eq!(
            score(&unrelated, &spd_selected),
            score(&bare, &spd_selected),
            "a flat unrelated to both the selection and the main stat must earn nothing",
        );

        // Fixed per-line semantics: the bonus marks the line's category, never its roll
        // quality — a weak and a max-rolled unselected SPD line earn the identical epsilon.
        let weak_spd = make(
            11,
            STAT_VARIANT_HP_PERCENT,
            &[(STAT_VARIANT_HP_PERCENT, 5.0), (STAT_VARIANT_SPD, 1.0)],
        );
        let god_spd = make(
            12,
            STAT_VARIANT_HP_PERCENT,
            &[(STAT_VARIANT_HP_PERCENT, 5.0), (STAT_VARIANT_SPD, 30.0)],
        );
        assert_eq!(
            score(&weak_spd, &hp_selected),
            score(&god_spd, &hp_selected),
            "epsilon must be roll-value independent — quality comparison is the weights' job",
        );
    }

    // Amulet slot-awareness: amulets can never roll percent substats, so demoting flats
    // against percent twins is meaningless there — the epsilon ladder is INERT on amulets
    // (every line earns 0) and ranking is left to selected substats + the provable
    // tie-breakers. Ring/banner keep the ladder (their pools have percent variants).
    #[test]
    fn amulet_slot_is_exempt_from_the_epsilon_ladder() {
        fn make(id: i64, slot: i64, substats: &[(i64, f64)]) -> SafeguardWasmArtifactIn {
            SafeguardWasmArtifactIn {
                id: Some(id),
                slot,
                set: ACCESSORY_NO_SET_ID,
                rank: 6,
                rarity: 6,
                level: 16,
                exact_level: Some(16),
                faction: 1,
                main_stat: STAT_VARIANT_ATK_FLAT,
                equipped_in_collection: false,
                equipped_in_vault: false,
                substats: substats
                    .iter()
                    .map(|&(variant, value)| SafeguardWasmSubstatIn {
                        variant,
                        is_flat: true,
                        value,
                        rolls: Some(1),
                    })
                    .collect(),
            }
        }
        let weights = BTreeMap::<i64, f64>::new();
        let f = SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_DEFAULT;
        let selected = [STAT_VARIANT_ACC];
        let score =
            |artifact: &SafeguardWasmArtifactIn| safeguard_compute_score(artifact, &selected, &weights, false, f);
        let acc_line = (STAT_VARIANT_ACC, 20.0);

        // On an amulet NO unselected line earns any epsilon — neither an extra flat HP …
        let amulet_bare = make(1, ARTIFACT_TYPE_AMULET, &[acc_line]);
        let amulet_flat_hp = make(2, ARTIFACT_TYPE_AMULET, &[acc_line, (STAT_VARIANT_HP_FLAT, 900.0)]);
        assert_eq!(
            score(&amulet_flat_hp),
            score(&amulet_bare),
            "amulet flat HP must earn nothing (ladder inert on the percent-free slot)",
        );
        // … nor an extra non-flat RES line (the non-flat tier is disabled on amulets too).
        let amulet_res = make(3, ARTIFACT_TYPE_AMULET, &[acc_line, (STAT_VARIANT_RES, 15.0)]);
        assert_eq!(
            score(&amulet_res),
            score(&amulet_bare),
            "amulet RES must earn nothing (ladder inert on the percent-free slot)",
        );

        // On a ring the HP% twin IS rollable, so an unaligned flat HP stays padding (0).
        // Ring substat pool has no ACC, so gate on DEF% instead to keep the rule slot-legal.
        let ring_selected = [STAT_VARIANT_DEF_PERCENT];
        let def_line = (STAT_VARIANT_DEF_PERCENT, 5.0);
        let ring_bare = make(4, ARTIFACT_TYPE_RING, &[def_line]);
        let ring_flat_hp = make(5, ARTIFACT_TYPE_RING, &[def_line, (STAT_VARIANT_HP_FLAT, 900.0)]);
        assert_eq!(
            safeguard_compute_score(&ring_flat_hp, &ring_selected, &weights, false, f),
            safeguard_compute_score(&ring_bare, &ring_selected, &weights, false, f),
            "ring flat HP (unaligned, twin rollable) must remain zero-bonus padding",
        );
        // … while a ring's unselected percent line still earns the non-flat tier — the
        // slot-level exemption is amulet-only, not accessory-wide.
        let ring_hp_percent = make(6, ARTIFACT_TYPE_RING, &[def_line, (STAT_VARIANT_HP_PERCENT, 5.0)]);
        assert!(
            safeguard_compute_score(&ring_hp_percent, &ring_selected, &weights, false, f)
                > safeguard_compute_score(&ring_bare, &ring_selected, &weights, false, f),
            "ring HP% (unselected non-flat) must still earn the non-flat tier",
        );
    }

    // The tunable factor scales ONLY the main-stat rank bonus, and only while the toggle is on.
    #[test]
    fn main_stat_rank_weight_factor_scales_the_bonus() {
        let weights = cr_weights(1.0);
        let selected = [STAT_VARIANT_CR];
        // Two same-main pieces where the 5★ has the heavier substat roll (mirrors the reported case).
        let six = make_boots_spd_artifact(1, 6, 4.0);
        let five = make_boots_spd_artifact(2, 5, 4.5);

        // Factor 1.0 (default): the 6★ wins by a small margin (as in the regression test above).
        let delta_default = safeguard_compute_score(&six, &selected, &weights, true, 1.0)
            - safeguard_compute_score(&five, &selected, &weights, true, 1.0);
        // Doubling the factor doubles the main-stat term, widening the 6★ lead.
        let delta_double = safeguard_compute_score(&six, &selected, &weights, true, 2.0)
            - safeguard_compute_score(&five, &selected, &weights, true, 2.0);
        assert!(
            delta_double > delta_default,
            "a larger factor must widen the higher-rank piece's advantage",
        );

        // Factor 0.0 collapses the bonus entirely → identical to the toggle being off.
        let six_zero = safeguard_compute_score(&six, &selected, &weights, true, 0.0);
        let six_off = safeguard_compute_score(&six, &selected, &weights, false, 1.0);
        assert!(
            (six_zero - six_off).abs() < 1e-9,
            "factor 0 must neutralize the main-stat bonus, matching the toggle-off score",
        );

        // The factor never touches the substat terms: with the toggle off it is inert regardless.
        assert_eq!(
            safeguard_compute_score(&five, &selected, &weights, false, 5.0),
            safeguard_compute_score(&five, &selected, &weights, false, 1.0),
            "the factor must not affect scoring while the toggle is off",
        );
    }

    // Omitted count_mode resolves through safeguard_resolve_count_mode to the
    // canonical detection default (currently per_set). Pinning all artifacts to
    // one set makes that bucket the only bucket, so requiredCount=2 selects the
    // top two by score — independent of which dimensions the default activates.
    #[test]
    fn missing_count_mode_resolves_to_canonical_default() {
        let input = SafeguardWasmScorePreviewIn {
            weight_main_stat_by_rank: false,
            main_stat_rank_weight_factor: 1.0,
            artifacts: vec![
                make_artifact(1, 1, 10, 0, 1, 7.0),
                make_artifact(2, 1, 10, 0, 1, 5.0),
                make_artifact(3, 1, 10, 0, 1, 3.0),
            ],
            substats: vec![TEST_VARIANT],
            weights: cr_weights(1.0),
            required_count: 2,
            count_mode: None,
            substat_match: None,
        };
        let out = score_safeguard_candidates_for_preview_core(input);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].item_key, 1);
        assert!(out[0].is_within_quota, "top-ranked within single bucket");
        assert_eq!(out[1].item_key, 2);
        assert!(out[1].is_within_quota, "second rank within single bucket N=2");
        assert_eq!(out[2].item_key, 3);
        assert!(!out[2].is_within_quota, "third rank exceeds single bucket N=2");
    }

    // perRule explicit mode collapses every bucket dimension into one global pool
    // regardless of slot/set/faction/main differences. Mirrors detection's
    // SafeguardCountKey::Global branch — important so the preview matches what
    // detection shows for rules that opt into perRule counting.
    #[test]
    fn per_rule_collapses_buckets_globally() {
        let mode = SafeguardWasmCountMode {
            per_rule: true,
            per_set: false,
            per_faction: false,
            per_main_stat: false,
            per_slot: false,
        };
        let input = SafeguardWasmScorePreviewIn {
            weight_main_stat_by_rank: false,
            main_stat_rank_weight_factor: 1.0,
            artifacts: vec![
                make_artifact(1, 1, 10, 0, 1, 7.0), // strongest
                make_artifact(2, 1, 20, 0, 1, 5.0), // mid (different set)
                make_artifact(3, 1, 30, 0, 1, 3.0), // weakest (different set)
            ],
            substats: vec![TEST_VARIANT],
            weights: cr_weights(1.0),
            required_count: 2,
            count_mode: Some(mode),
            substat_match: None,
        };
        let out = score_safeguard_candidates_for_preview_core(input);
        assert_eq!(out.len(), 3);
        let kept: Vec<i64> = out.iter().filter(|c| c.is_within_quota).map(|c| c.item_key).collect();
        assert_eq!(kept.len(), 2, "perRule mode keeps only required_count globally");
        assert!(kept.contains(&1));
        assert!(kept.contains(&2));
    }

    // perSet bucketing — with 3 sets and N=1 per bucket, each set's top item is
    // in_quota even though required_count is 1: this is exactly the case where
    // the legacy preview function placed the cutoff at row 1 by mistake.
    #[test]
    fn per_set_keeps_top_per_bucket_above_required_count() {
        let mode = SafeguardWasmCountMode {
            per_rule: false,
            per_set: true,
            per_faction: false,
            per_main_stat: false,
            per_slot: false,
        };
        let input = SafeguardWasmScorePreviewIn {
            weight_main_stat_by_rank: false,
            main_stat_rank_weight_factor: 1.0,
            artifacts: vec![
                // Set 10: A (high) > B (low)
                make_artifact(1, 1, 10, 0, 1, 7.0),
                make_artifact(2, 1, 10, 0, 1, 1.0),
                // Set 20: C (mid) > D (lowest)
                make_artifact(3, 1, 20, 0, 1, 6.0),
                make_artifact(4, 1, 20, 0, 1, 0.5),
                // Set 30: E (single entry)
                make_artifact(5, 1, 30, 0, 1, 4.0),
            ],
            substats: vec![TEST_VARIANT],
            weights: cr_weights(1.0),
            required_count: 1,
            count_mode: Some(mode),
            substat_match: None,
        };
        let out = score_safeguard_candidates_for_preview_core(input);
        // Three bucket winners → in_quota even though required_count = 1.
        let kept: Vec<i64> = out.iter().filter(|c| c.is_within_quota).map(|c| c.item_key).collect();
        // Order in `kept` follows score-desc rank emission, not bucket order.
        assert_eq!(kept.len(), 3, "one winner per set bucket");
        assert!(kept.contains(&1), "set 10 winner kept");
        assert!(kept.contains(&3), "set 20 winner kept");
        assert!(kept.contains(&5), "set 30 winner kept");
    }

    // perSlot bucketing — verifies the slot dimension routes correctly. Two
    // slots, both with two candidates; with N=1 per slot, only one per slot
    // is kept regardless of cross-slot ranking.
    #[test]
    fn per_slot_buckets_independently_of_global_rank() {
        let mode = SafeguardWasmCountMode {
            per_rule: false,
            per_set: false,
            per_faction: false,
            per_main_stat: false,
            per_slot: true,
        };
        let input = SafeguardWasmScorePreviewIn {
            weight_main_stat_by_rank: false,
            main_stat_rank_weight_factor: 1.0,
            artifacts: vec![
                // Slot 1: weak winner (loses to slot-2 candidates globally).
                make_artifact(1, 1, 10, 0, 1, 3.0),
                make_artifact(2, 1, 10, 0, 1, 1.0),
                // Slot 2: two stronger items, but only one is kept (per-slot N=1).
                make_artifact(3, 2, 10, 0, 1, 7.0),
                make_artifact(4, 2, 10, 0, 1, 6.0),
            ],
            substats: vec![TEST_VARIANT],
            weights: cr_weights(1.0),
            required_count: 1,
            count_mode: Some(mode),
            substat_match: None,
        };
        let out = score_safeguard_candidates_for_preview_core(input);
        let kept: Vec<i64> = out.iter().filter(|c| c.is_within_quota).map(|c| c.item_key).collect();
        assert_eq!(kept.len(), 2, "one winner per slot bucket");
        assert!(kept.contains(&1), "slot 1 winner kept despite weak score");
        assert!(kept.contains(&3), "slot 2 strongest kept; slot 2 second drops");
    }

    // Zero-score artifacts are filtered out before ranking, so they neither
    // occupy a rank nor consume a quota slot.
    #[test]
    fn zero_score_artifacts_are_dropped() {
        let input = SafeguardWasmScorePreviewIn {
            weight_main_stat_by_rank: false,
            main_stat_rank_weight_factor: 1.0,
            artifacts: vec![
                make_artifact(1, 1, 10, 0, 1, 7.0),
                // value=0 → safeguard_normalize_substat_value returns 0 → score=0 → dropped.
                make_artifact(2, 1, 10, 0, 1, 0.0),
                make_artifact(3, 1, 10, 0, 1, 3.0),
            ],
            substats: vec![TEST_VARIANT],
            weights: cr_weights(1.0),
            required_count: 2,
            count_mode: Some(SafeguardWasmCountMode::default()),
            substat_match: None,
        };
        let out = score_safeguard_candidates_for_preview_core(input);
        assert_eq!(out.len(), 2, "zero-score entry filtered out before rank");
        let keys: Vec<i64> = out.iter().map(|c| c.item_key).collect();
        assert!(!keys.contains(&2), "id=2 dropped from output entirely");
    }

    // Output sort is score-descending and ranks are 1-based contiguous.
    #[test]
    fn output_ranks_are_score_descending_and_one_based() {
        let input = SafeguardWasmScorePreviewIn {
            weight_main_stat_by_rank: false,
            main_stat_rank_weight_factor: 1.0,
            artifacts: vec![
                make_artifact(1, 1, 10, 0, 1, 2.0),
                make_artifact(2, 1, 10, 0, 1, 6.0),
                make_artifact(3, 1, 10, 0, 1, 4.0),
            ],
            substats: vec![TEST_VARIANT],
            weights: cr_weights(1.0),
            required_count: 1,
            count_mode: None,
            substat_match: None,
        };
        let out = score_safeguard_candidates_for_preview_core(input);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].candidate_rank, 1);
        assert_eq!(out[1].candidate_rank, 2);
        assert_eq!(out[2].candidate_rank, 3);
        // 6 > 4 > 2 in raw value → same order in score (linear scaling).
        assert_eq!(out[0].item_key, 2);
        assert_eq!(out[1].item_key, 3);
        assert_eq!(out[2].item_key, 1);
        // Each successive score must be strictly less than the prior — confirms
        // sort key, not just order coincidence.
        let max6 = TEST_MAX6;
        assert!((out[0].score - 6.0 / max6).abs() < 1e-9);
        assert!((out[1].score - 4.0 / max6).abs() < 1e-9);
        assert!((out[2].score - 2.0 / max6).abs() < 1e-9);
    }

    // required_count <= 0 collapses to 1 (mirrors detection's required_per_bucket.max(1)).
    // Without this guard the preview would emit zero kept items, which would
    // contradict what detection reports on first open.
    #[test]
    fn required_count_zero_clamps_to_one() {
        let input = SafeguardWasmScorePreviewIn {
            weight_main_stat_by_rank: false,
            main_stat_rank_weight_factor: 1.0,
            artifacts: vec![make_artifact(1, 1, 10, 0, 1, 7.0), make_artifact(2, 1, 10, 0, 1, 3.0)],
            substats: vec![TEST_VARIANT],
            weights: cr_weights(1.0),
            required_count: 0,
            count_mode: None,
            substat_match: None,
        };
        let out = score_safeguard_candidates_for_preview_core(input);
        let kept_count = out.iter().filter(|c| c.is_within_quota).count();
        assert_eq!(kept_count, 1, "required_count=0 clamps up to 1");
    }

    // ts-rs wire test: count_mode is optional on the input struct so callers
    // built before this change keep working when they omit the field. Belt-and-
    // suspenders: this also guards against accidental deny_unknown_fields drift.
    #[test]
    fn count_mode_field_is_optional_on_wire() {
        let json = r#"{"artifacts":[],"substats":[],"weights":{},"requiredCount":1}"#;
        let parsed: SafeguardWasmScorePreviewIn =
            serde_json::from_str(json).expect("count_mode must be optional on the deserialized wire form");
        assert!(parsed.count_mode.is_none(), "omitted field deserializes as None");
    }
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
            0..=3 => 0,
            4..=7 => 1,
            8..=11 => 2,
            _ => 3,
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

// Detection-path tests built on shared minimal fixtures: the no-substat
// non-ranking path (no quality basis → protect every sold match), the ranking
// path's ignore-previous-safeguards pool exclusion, and the anticipate modes'
// placeholder emission (gaps = deficit-gated, improvements = always emitted).
#[cfg(test)]
mod no_substat_protect_all_tests {
    use super::*;
    use crate::safeguards::fast_path_types::SafeguardWasmSubstatIn;
    use std::collections::BTreeMap;

    // Minimal artifact builder — only the fields that combination filters inspect.
    fn make_artifact(id: i64, slot: i64, set: i64, rank: i64, rarity: i64, faction: i64) -> SafeguardWasmArtifactIn {
        SafeguardWasmArtifactIn {
            id: Some(id),
            slot,
            set,
            rank,
            rarity,
            level: 16,
            exact_level: None,
            faction,
            main_stat: SAFEGUARD_MAIN_ANY,
            equipped_in_collection: false,
            equipped_in_vault: false,
            substats: vec![],
        }
    }

    // Candidate wrapper that marks the item as sold.
    fn sold(id: i64, slot: i64, set: i64, rank: i64, rarity: i64, faction: i64) -> SafeguardWasmCandidateIn {
        SafeguardWasmCandidateIn {
            item_key: id,
            bucket_key: safeguard_bucket_key_from_parts(slot, set, SAFEGUARD_MAIN_ANY, faction),
            is_sold: true,
            artifact: make_artifact(id, slot, set, rank, rarity, faction),
        }
    }

    // Candidate wrapper that marks the item as already kept.
    fn kept(id: i64, slot: i64, set: i64, rank: i64, rarity: i64, faction: i64) -> SafeguardWasmCandidateIn {
        SafeguardWasmCandidateIn {
            item_key: id,
            bucket_key: safeguard_bucket_key_from_parts(slot, set, SAFEGUARD_MAIN_ANY, faction),
            is_sold: false,
            artifact: make_artifact(id, slot, set, rank, rarity, faction),
        }
    }

    // Minimal prepared-rule for the bucketed no-substat path (perSet + perFaction).
    fn make_bucketed_rule(required_per_bucket: i64, slot: i64, set: i64) -> SafeguardWasmPreparedRule {
        SafeguardWasmPreparedRule {
            weight_main_stat_by_rank: false,
            main_stat_rank_weight_factor: 1.0,
            id: "test-rule".to_string(),
            hash: "test-hash".to_string(),
            combination: SafeguardWasmCombination {
                slots: vec![slot],
                sets: vec![SafeguardWasmSetSelection {
                    id: set,
                    excluded: false,
                }],
                meta_set_names: vec![],
                ranks: vec![6],
                rarities: vec![5, 6],
                main_stats: vec![],
                factions: vec![],
            },
            required_per_bucket,
            activation: SAFEGUARD_ACTIVATION_ANTICIPATE_GAPS.to_string(),
            rule_active: true,
            count_mode: SafeguardWasmCountMode {
                per_rule: false,
                per_set: true,
                per_faction: true,
                per_main_stat: false,
                per_slot: true,
            },
            ignore_previous_safeguards: false,
            ignore_equipped_in_collection: false,
            ignore_equipped_in_vault: false,
            improvement_chance_threshold: None,
            selected_substats: vec![],
            substat_match: SAFEGUARD_SUBSTAT_ANY.to_string(),
            weights: BTreeMap::new(),
            set_includes: std::iter::once(set).collect(),
            set_excludes: std::collections::HashSet::new(),
            expected_buckets: vec![],
        }
    }

    // Minimal prepared-rule for the per-rule no-substat path.
    fn make_per_rule_rule(required_per_bucket: i64, slot: i64, set: i64) -> SafeguardWasmPreparedRule {
        let mut r = make_bucketed_rule(required_per_bucket, slot, set);
        r.count_mode = SafeguardWasmCountMode {
            per_rule: true,
            per_set: false,
            per_faction: false,
            per_main_stat: false,
            per_slot: false,
        };
        r
    }

    // ── bucketed path ──────────────────────────────────────────────────────────

    #[test]
    fn grouped_no_substat_all_sold_protected_when_below_quota() {
        // 3 sold, 0 kept, requiredCount=5. Without substats the engine cannot
        // rank them, so all 3 must be added to item_keys even though 3 < 5.
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let candidates = vec![
            sold(101, slot, set, 6, 6, faction),
            sold(102, slot, set, 6, 6, faction),
            sold(103, slot, set, 6, 6, faction),
        ];
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        let rule = make_bucketed_rule(5, slot, set);
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        let mut keys = result.entry.item_keys.clone();
        keys.sort_unstable();
        assert_eq!(keys, vec![101, 102, 103], "all sold items must be protected");
        assert_eq!(result.selected_candidate_indices.len(), 3);
    }

    #[test]
    fn grouped_no_substat_surplus_sold_all_protected() {
        // 7 sold, 0 kept, requiredCount=5. Old code would take only 5 (by ID
        // order). Correct behavior: protect all 7 — no quality basis exists.
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let candidates: Vec<_> = (201..=207).map(|id| sold(id, slot, set, 6, 6, faction)).collect();
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        let rule = make_bucketed_rule(5, slot, set);
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        assert_eq!(result.entry.item_keys.len(), 7, "all 7 sold items must be protected");
        assert_eq!(result.selected_candidate_indices.len(), 7);
    }

    #[test]
    fn grouped_no_substat_quota_already_met_no_sold_protected() {
        // 4 kept + 4 sold, requiredCount=3. Quota is already satisfied by kept
        // items (needed=0), so no sold items should be added to item_keys.
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let candidates = vec![
            kept(301, slot, set, 6, 6, faction),
            kept(302, slot, set, 6, 6, faction),
            kept(303, slot, set, 6, 6, faction),
            kept(304, slot, set, 6, 6, faction),
            sold(305, slot, set, 6, 6, faction),
            sold(306, slot, set, 6, 6, faction),
            sold(307, slot, set, 6, 6, faction),
            sold(308, slot, set, 6, 6, faction),
        ];
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        let rule = make_bucketed_rule(3, slot, set);
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        assert!(
            result.entry.item_keys.is_empty(),
            "sold items must not be protected when quota is already met by kept items"
        );
    }

    #[test]
    fn grouped_no_substat_quota_partially_met_all_sold_protected() {
        // 2 kept + 4 sold, requiredCount=5. needed=3, so the engine cannot pick
        // 3 of the 4 without quality basis — all 4 sold must be protected.
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let candidates = vec![
            kept(301, slot, set, 6, 6, faction),
            kept(302, slot, set, 6, 6, faction),
            sold(303, slot, set, 6, 6, faction),
            sold(304, slot, set, 6, 6, faction),
            sold(305, slot, set, 6, 6, faction),
            sold(306, slot, set, 6, 6, faction),
        ];
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        let rule = make_bucketed_rule(5, slot, set);
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        let mut keys = result.entry.item_keys.clone();
        keys.sort_unstable();
        assert_eq!(
            keys,
            vec![303, 304, 305, 306],
            "all 4 sold items protected; kept items not re-listed"
        );
    }

    #[test]
    fn grouped_no_substat_projected_count_is_kept_plus_all_sold_when_quota_unmet() {
        // When the quota is unmet and no substats exist, all sold items are protected.
        // projected_count must therefore be kept + all_sold, not kept + min(sold, needed).
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let candidates = vec![
            kept(401, slot, set, 6, 6, faction),
            sold(402, slot, set, 6, 6, faction),
            sold(403, slot, set, 6, 6, faction),
            sold(404, slot, set, 6, 6, faction),
        ];
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        // requiredCount=5, kept=1 → needed=4 > 0 → all 3 sold are protected.
        let rule = make_bucketed_rule(5, slot, set);
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        // 1 kept + 3 sold = 4 projected (not capped at needed=4 since sold<needed).
        assert_eq!(result.entry.projected_count, 4);
    }

    #[test]
    fn grouped_no_substat_projected_count_is_kept_only_when_quota_met() {
        // When kept already satisfies the quota (needed=0), no sold items are protected
        // and projected_count must equal kept_count alone.
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let candidates = vec![
            kept(411, slot, set, 6, 6, faction),
            kept(412, slot, set, 6, 6, faction),
            kept(413, slot, set, 6, 6, faction),
            sold(414, slot, set, 6, 6, faction),
            sold(415, slot, set, 6, 6, faction),
        ];
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        let rule = make_bucketed_rule(2, slot, set); // kept=3 satisfies requiredCount=2
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        assert_eq!(
            result.entry.projected_count, 3,
            "projected must be kept_count only when quota met"
        );
    }

    #[test]
    fn grouped_no_substat_all_within_quota_when_quota_unmet() {
        // When quota is unmet and no substats exist, all sold items are at-risk
        // and is_within_quota must be true for every candidate (kept and sold alike).
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let candidates = vec![
            kept(501, slot, set, 6, 6, faction),
            sold(502, slot, set, 6, 6, faction),
            sold(503, slot, set, 6, 6, faction),
        ];
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        // requiredCount=5, kept=1 → needed=4 > 0 → all sold protected.
        let rule = make_bucketed_rule(5, slot, set);
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        assert!(
            result.entry.candidates.iter().all(|c| c.is_within_quota),
            "every candidate must be within quota when quota is unmet and no substats are set",
        );
    }

    #[test]
    fn grouped_no_substat_sold_not_within_quota_when_quota_already_met() {
        // When kept items already satisfy the quota (needed=0), sold items are not
        // at-risk and is_within_quota must be false for them.
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let candidates = vec![
            kept(511, slot, set, 6, 6, faction),
            kept(512, slot, set, 6, 6, faction),
            sold(513, slot, set, 6, 6, faction),
            sold(514, slot, set, 6, 6, faction),
        ];
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        let rule = make_bucketed_rule(1, slot, set); // kept=2 satisfies requiredCount=1
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        let sold_candidates: Vec<_> = result
            .entry
            .candidates
            .iter()
            .filter(|c| c.item_key == 513 || c.item_key == 514)
            .collect();
        assert!(
            sold_candidates.iter().all(|c| !c.is_within_quota),
            "sold items must not be within quota when kept items already satisfy the requirement",
        );
    }

    // ── per-rule path ─────────────────────────────────────────────────────────

    #[test]
    fn per_rule_no_substat_all_sold_protected_when_below_quota() {
        let slot = ARTIFACT_TYPE_BANNER;
        let set = 99i64;
        let faction = 3i64;
        let candidates = vec![sold(601, slot, set, 6, 6, faction), sold(602, slot, set, 6, 6, faction)];
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        let rule = make_per_rule_rule(5, slot, set);
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        let mut keys = result.entry.item_keys.clone();
        keys.sort_unstable();
        assert_eq!(keys, vec![601, 602]);
    }

    #[test]
    fn per_rule_no_substat_surplus_sold_all_protected() {
        let slot = ARTIFACT_TYPE_BANNER;
        let set = 99i64;
        let faction = 3i64;
        let candidates: Vec<_> = (701..=708).map(|id| sold(id, slot, set, 6, 6, faction)).collect();
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        let rule = make_per_rule_rule(5, slot, set);
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        assert_eq!(result.entry.item_keys.len(), 8, "all 8 sold items must be protected");
    }

    // ── contrast: with substats, only top-N items are selected ──────────────

    #[test]
    fn grouped_with_substat_selects_only_top_scored() {
        // Confirm the fix did not break the substat (ranking) path: with a
        // substat filter and distinct scores the engine selects only the top-N
        // (required_per_bucket = 3), not all 6.  Items need distinct scores to
        // avoid the intentional tie-boundary extension in the ranking path.
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let spd = STAT_VARIANT_SPD;
        // Scores 10, 20, 30, 40, 50, 60 — top-3 are ids 804, 805, 806.
        let candidates: Vec<_> = (801..=806)
            .enumerate()
            .map(|(i, id)| {
                let mut c = sold(id, slot, set, 6, 6, faction);
                c.artifact.substats = vec![SafeguardWasmSubstatIn {
                    variant: spd,
                    is_flat: false,
                    value: (i as f64 + 1.0) * 10.0,
                    rolls: None,
                }];
                c
            })
            .collect();
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        let rule = make_bucketed_rule(3, slot, set);
        let selected_substats = vec![spd];
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &selected_substats,
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        assert_eq!(
            result.entry.item_keys.len(),
            3,
            "with substats and distinct scores the engine selects only the top-N",
        );
        let mut keys = result.entry.item_keys.clone();
        keys.sort_unstable();
        assert_eq!(
            keys,
            vec![804, 805, 806],
            "the three highest-scored items must be selected"
        );
    }

    // ── ignore_previous_safeguards: ranking-path pool exclusion ─────────────

    #[test]
    fn ranking_ignore_previous_safeguards_excludes_already_protected() {
        // Six matching candidates with strictly increasing SPD scores 10..=60 (ids 901..=906).
        // Pretend an earlier active rule already protected the top two (905 and 906). With
        // ignore_previous_safeguards = true the rule's matching pool drops them, so the new
        // top-3 by score is 902, 903, 904.
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let spd = STAT_VARIANT_SPD;
        let candidates: Vec<_> = (901..=906)
            .enumerate()
            .map(|(i, id)| {
                let mut c = sold(id, slot, set, 6, 6, faction);
                c.artifact.substats = vec![SafeguardWasmSubstatIn {
                    variant: spd,
                    is_flat: false,
                    value: (i as f64 + 1.0) * 10.0,
                    rolls: None,
                }];
                c
            })
            .collect();
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        // Indices 4 and 5 (item_keys 905, 906) were protected by an earlier rule.
        let mut protected_state: Vec<bool> = vec![false; candidates.len()];
        protected_state[4] = true;
        protected_state[5] = true;
        let mut rule = make_bucketed_rule(3, slot, set);
        rule.ignore_previous_safeguards = true;
        let selected_substats = vec![spd];
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &selected_substats,
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        let mut keys = result.entry.item_keys.clone();
        keys.sort_unstable();
        assert_eq!(
            keys,
            vec![902, 903, 904],
            "ignore_previous_safeguards=true must skip already-protected items and pick the next top-N",
        );
    }

    #[test]
    fn ranking_ignore_previous_safeguards_off_keeps_full_pool() {
        // Same fixture as above, but with ignore_previous_safeguards = false the protected
        // state must be inert in the ranking path: the rule still picks ids 904/905/906.
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let spd = STAT_VARIANT_SPD;
        let candidates: Vec<_> = (901..=906)
            .enumerate()
            .map(|(i, id)| {
                let mut c = sold(id, slot, set, 6, 6, faction);
                c.artifact.substats = vec![SafeguardWasmSubstatIn {
                    variant: spd,
                    is_flat: false,
                    value: (i as f64 + 1.0) * 10.0,
                    rolls: None,
                }];
                c
            })
            .collect();
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let mut protected_state: Vec<bool> = vec![false; candidates.len()];
        protected_state[4] = true;
        protected_state[5] = true;
        let mut rule = make_bucketed_rule(3, slot, set);
        rule.ignore_previous_safeguards = false;
        let selected_substats = vec![spd];
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &selected_substats,
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        let mut keys = result.entry.item_keys.clone();
        keys.sort_unstable();
        assert_eq!(
            keys,
            vec![904, 905, 906],
            "ignore_previous_safeguards=false must include every matching item in the ranking pool",
        );
    }

    #[test]
    fn non_ranking_ignore_previous_safeguards_does_not_apply_pool_exclusion() {
        // Without substats the ranking-path filter is intentionally skipped. The non-ranking
        // path keeps its kept-count-driven semantics, so all sold matches still feed into
        // selected_sold regardless of the protected_state flags.
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let candidates: Vec<_> = (901..=906).map(|id| sold(id, slot, set, 6, 6, faction)).collect();
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let mut protected_state: Vec<bool> = vec![false; candidates.len()];
        protected_state[4] = true;
        protected_state[5] = true;
        let mut rule = make_bucketed_rule(3, slot, set);
        rule.ignore_previous_safeguards = true;
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        // All six items must still surface (no substat → no quality basis to drop them).
        assert_eq!(
            result.entry.item_keys.len(),
            6,
            "non-ranking path must ignore protected_state and protect every sold match",
        );
    }

    // ── anticipate modes: placeholder emission ────────────────────────────────

    #[test]
    fn grouped_quota_met_gaps_mode_emits_no_placeholders() {
        // 3 kept, requiredCount=2 → deficit 0. Anticipate-gaps placeholders must
        // vanish once the quota is satisfied by real gear.
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let candidates = vec![
            kept(601, slot, set, 6, 6, faction),
            kept(602, slot, set, 6, 6, faction),
            kept(603, slot, set, 6, 6, faction),
        ];
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        let rule = make_bucketed_rule(2, slot, set);
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        assert_eq!(result.entry.deficit, 0);
        assert!(
            result.entry.placeholders.is_empty(),
            "gaps mode must not emit placeholders at zero deficit"
        );
    }

    #[test]
    fn grouped_quota_met_improvements_mode_without_threshold_emits_no_placeholders() {
        // Satisfied-quota fixture: anticipateImprovements WITHOUT a chance threshold
        // must behave exactly like anticipateGaps — no zero-missing placeholders.
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let candidates = vec![
            kept(611, slot, set, 6, 6, faction),
            kept(612, slot, set, 6, 6, faction),
            kept(613, slot, set, 6, 6, faction),
        ];
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        let mut rule = make_bucketed_rule(2, slot, set);
        rule.activation = SAFEGUARD_ACTIVATION_ANTICIPATE_IMPROVEMENTS.to_string();
        rule.improvement_chance_threshold = None;
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        assert_eq!(result.entry.deficit, 0);
        assert!(
            result.entry.placeholders.is_empty(),
            "improvements mode without a threshold must not emit zero-missing placeholders",
        );
    }

    #[test]
    fn grouped_quota_met_improvements_mode_with_threshold_emits_zero_missing_placeholder() {
        // Same satisfied-quota fixture, but a configured improvement-chance threshold
        // keeps a zero-missing "improvement watch" placeholder alive per bucket.
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let candidates = vec![
            kept(611, slot, set, 6, 6, faction),
            kept(612, slot, set, 6, 6, faction),
            kept(613, slot, set, 6, 6, faction),
        ];
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        let mut rule = make_bucketed_rule(2, slot, set);
        rule.activation = SAFEGUARD_ACTIVATION_ANTICIPATE_IMPROVEMENTS.to_string();
        rule.improvement_chance_threshold = Some([50.0, 50.0, 50.0, 50.0]);
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        assert_eq!(result.entry.deficit, 0);
        assert_eq!(
            result.entry.placeholders.len(),
            1,
            "improvement watch must emit one placeholder per observed bucket"
        );
        let placeholder = &result.entry.placeholders[0];
        assert_eq!(
            placeholder.missing, 0,
            "satisfied quota reports missing=0, not a fake deficit"
        );
        // Watch placeholders must carry the bucket sample so corner probing has concrete dims.
        let sample = placeholder
            .sample
            .as_ref()
            .expect("watch placeholder must carry a bucket sample");
        assert_eq!(sample.slot, slot);
        assert_eq!(sample.set, set);
        assert_eq!(sample.faction, faction);
    }

    #[test]
    fn ranking_quota_met_improvements_mode_emits_zero_missing_placeholder() {
        // Ranking path (substats selected): quota met by kept top-N, improvements
        // mode WITH a threshold still emits the watch placeholder for the bucket.
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let spd = STAT_VARIANT_SPD;
        let candidates: Vec<_> = (621..=623)
            .enumerate()
            .map(|(i, id)| {
                let mut c = kept(id, slot, set, 6, 6, faction);
                c.artifact.substats = vec![SafeguardWasmSubstatIn {
                    variant: spd,
                    is_flat: false,
                    value: (i as f64 + 1.0) * 10.0,
                    rolls: None,
                }];
                c
            })
            .collect();
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        let mut rule = make_bucketed_rule(2, slot, set);
        rule.activation = SAFEGUARD_ACTIVATION_ANTICIPATE_IMPROVEMENTS.to_string();
        rule.improvement_chance_threshold = Some([50.0, 50.0, 50.0, 50.0]);
        rule.selected_substats = vec![spd];
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[spd],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        assert_eq!(result.entry.deficit, 0);
        assert_eq!(result.entry.placeholders.len(), 1);
        assert_eq!(result.entry.placeholders[0].missing, 0);
        // Ranking path also stamps the concrete bucket sample onto the watch placeholder.
        assert!(
            result.entry.placeholders[0].sample.is_some(),
            "ranking watch placeholder must carry the bucket sample"
        );
    }

    #[test]
    fn ranking_quota_met_improvements_mode_without_threshold_emits_no_placeholders() {
        // Ranking path: without a threshold the improvements mode must degrade to
        // anticipateGaps semantics — a satisfied bucket emits no placeholder at all.
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let spd = STAT_VARIANT_SPD;
        let candidates: Vec<_> = (641..=643)
            .enumerate()
            .map(|(i, id)| {
                let mut c = kept(id, slot, set, 6, 6, faction);
                c.artifact.substats = vec![SafeguardWasmSubstatIn {
                    variant: spd,
                    is_flat: false,
                    value: (i as f64 + 1.0) * 10.0,
                    rolls: None,
                }];
                c
            })
            .collect();
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        let mut rule = make_bucketed_rule(2, slot, set);
        rule.activation = SAFEGUARD_ACTIVATION_ANTICIPATE_IMPROVEMENTS.to_string();
        rule.improvement_chance_threshold = None;
        rule.selected_substats = vec![spd];
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[spd],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        assert_eq!(result.entry.deficit, 0);
        assert!(
            result.entry.placeholders.is_empty(),
            "ranking improvements mode without a threshold must not emit zero-missing placeholders",
        );
    }

    #[test]
    fn per_rule_quota_met_improvements_mode_emits_global_placeholder() {
        // Per-rule count mode: quota met, improvements mode with a threshold emits the
        // single global watch placeholder (reason "global", missing 0, default sample).
        let slot = ARTIFACT_TYPE_AMULET;
        let set = 42i64;
        let faction = 7i64;
        let candidates = vec![kept(631, slot, set, 6, 6, faction), kept(632, slot, set, 6, 6, faction)];
        let sold_state: Vec<bool> = candidates.iter().map(|c| c.is_sold).collect();
        let protected_state: Vec<bool> = vec![false; candidates.len()];
        let mut rule = make_per_rule_rule(2, slot, set);
        rule.activation = SAFEGUARD_ACTIVATION_ANTICIPATE_IMPROVEMENTS.to_string();
        rule.improvement_chance_threshold = Some([50.0, 50.0, 50.0, 50.0]);
        let improvement_chances = BTreeMap::new();
        let result = safeguard_build_entry_for_substats(
            &rule,
            &candidates,
            &sold_state,
            &protected_state,
            &[],
            SAFEGUARD_SUBSTAT_ANY,
            1,
            &improvement_chances,
        );
        assert_eq!(result.entry.deficit, 0);
        assert_eq!(result.entry.placeholders.len(), 1);
        assert_eq!(result.entry.placeholders[0].missing, 0);
        assert_eq!(result.entry.placeholders[0].reason, SAFEGUARD_REASON_GLOBAL);
        // Per-rule mode has no observed bucket sample; the deterministic combination
        // default (first selected slot) must be attached for corner probing instead.
        let sample = result.entry.placeholders[0]
            .sample
            .as_ref()
            .expect("per-rule watch placeholder must carry the default sample");
        assert_eq!(sample.slot, slot, "default sample uses the first combination slot");
    }

    #[test]
    fn placeholder_rule_emission_gated_by_activation_for_zero_missing() {
        // safeguard_build_placeholder_rules: zero-missing placeholders WITHOUT corners
        // emit nothing in every activation mode; WITH watch_corners they emit exactly
        // one rule per corner carrying the corner's Rank/Rarity/LVLForCheck/Substats.
        let combination = SafeguardWasmCombination {
            slots: vec![ARTIFACT_TYPE_AMULET],
            sets: vec![SafeguardWasmSetSelection {
                id: 42,
                excluded: false,
            }],
            meta_set_names: vec![],
            ranks: vec![6],
            rarities: vec![5],
            main_stats: vec![],
            factions: vec![],
        };
        let sample = SafeguardWasmBucketSample {
            slot: ARTIFACT_TYPE_AMULET,
            set: 42,
            faction: 7,
            main_stat: SAFEGUARD_MAIN_ANY,
        };
        // Placeholder factory: zero-missing, optionally carrying a corner frontier.
        let make_placeholder = |watch_corners: Option<Vec<SafeguardWatchCornerOut>>| SafeguardWasmPlaceholderOut {
            combination: combination.clone(),
            missing: 0,
            reason: SAFEGUARD_REASON_BUCKET.to_string(),
            substat_variants: None,
            sample: Some(sample.clone()),
            watch_corners,
        };
        let make_entry = |placeholder: SafeguardWasmPlaceholderOut| SafeguardWasmEntryOut {
            hash: "test-hash".to_string(),
            combination: combination.clone(),
            rule_id: Some("test-rule".to_string()),
            rule_ordinal: Some(1),
            rule_activation: SAFEGUARD_ACTIVATION_ANTICIPATE_IMPROVEMENTS.to_string(),
            count_mode: SafeguardWasmCountMode {
                per_rule: true,
                per_set: false,
                per_faction: false,
                per_main_stat: false,
                per_slot: false,
            },
            per_bucket_required_count: 1,
            buckets_tracked: 1,
            required_count: 1,
            current_count: 1,
            projected_count: 1,
            deficit: 0,
            covered_by_existing: true,
            item_keys: vec![],
            artifacts: vec![],
            placeholders: vec![placeholder],
            placeholder_count: 0,
            placeholder_fingerprint: String::new(),
            candidates: vec![],
        };
        let make_rule = |activation: &str| SafeguardWasmRuleIn {
            id: Some("test-rule".to_string()),
            name: Some("Test".to_string()),
            combination: Some(combination.clone()),
            required_count: Some(1),
            activation: Some(activation.to_string()),
            count_mode: None,
            ignore_previous_safeguards: None,
            ignore_equipped_in_collection: None,
            ignore_equipped_in_vault: None,
            substats: None,
            substat_match: None,
            substat_weights: None,
            weight_main_stat_by_rank: None,
            main_stat_rank_weight_factor: None,
            improvement_chance_threshold: None,
            tags: None,
            // Test rules are flat, in no group.
            group: None,
        };
        // Corner-less zero-missing placeholders emit NOTHING in any mode — improvements
        // included: without corners nothing viable clears the bar (or no threshold is set).
        let bare_entry = make_entry(make_placeholder(None));
        for activation in [
            SAFEGUARD_ACTIVATION_ANTICIPATE_GAPS,
            SAFEGUARD_ACTIVATION_ANTICIPATE_IMPROVEMENTS,
        ] {
            let rules = safeguard_build_placeholder_rules(&make_rule(activation), &bare_entry, -1, 1, None);
            assert!(
                rules.is_empty(),
                "zero-missing placeholders without corners must emit no rules ({activation})",
            );
        }
        // With corners: rules pinned to each corner's exact cell + floors. The rarity run
        // consolidates through safeguard_consolidate_rarity_codes: singletons map to their
        // exact code, a contiguous run ending at Mythical maps to one GTE code.
        let corners = vec![
            SafeguardWatchCornerOut {
                rank: 6,
                rarities: vec![5],
                level: 8,
                // RES is legal on amulets (SPD is not and would be possibility-filtered).
                substats: vec![SafeguardWatchCornerSubstatOut {
                    variant: STAT_VARIANT_RES,
                    min_value: 14.0,
                }],
            },
            SafeguardWatchCornerOut {
                rank: 5,
                rarities: vec![4],
                level: 0,
                substats: vec![SafeguardWatchCornerSubstatOut {
                    variant: STAT_VARIANT_ACC,
                    min_value: 9.0,
                }],
            },
            SafeguardWatchCornerOut {
                rank: 6,
                rarities: vec![4, 5, 6],
                level: 12,
                substats: vec![SafeguardWatchCornerSubstatOut {
                    variant: STAT_VARIANT_RES,
                    min_value: 21.0,
                }],
            },
        ];
        let corner_entry = make_entry(make_placeholder(Some(corners.clone())));
        let watch_rules = safeguard_build_placeholder_rules(
            &make_rule(SAFEGUARD_ACTIVATION_ANTICIPATE_IMPROVEMENTS),
            &corner_entry,
            -1,
            1,
            None,
        );
        // Every corner here maps to exactly ONE rarity code (exact codes for singleton
        // runs; GTE_EPIC for the 4..6 run), so rules and corners still pair one-to-one.
        assert_eq!(
            watch_rules.len(),
            corners.len(),
            "one emitted rule per corner (single base variant, single rarity code each)",
        );
        let expected_rarity_codes = [RARITY_CODE_LEGENDARY, RARITY_CODE_EPIC, RARITY_CODE_GTE_EPIC];
        for ((rule, corner), expected_code) in watch_rules.iter().zip(&corners).zip(expected_rarity_codes) {
            // Corner cell pins override the base rule's rank/rarity/level.
            assert_eq!(rule.Rank, Some(safeguard_clamp_rank_or_rarity_value(corner.rank)));
            assert_eq!(
                rule.Rarity,
                Some(expected_code),
                "rarity run {:?} must consolidate to code {expected_code}",
                corner.rarities,
            );
            assert_eq!(rule.LVLForCheck, Some(corner.level));
            // First substat slot carries the corner floor with `>=` semantics.
            let subs = rule.Substats.as_ref().expect("corner rule must carry substats");
            let (expected_id, expected_flat) = safeguard_variant_to_sub(corner.substats[0].variant);
            assert_eq!(subs[0].ID, Some(expected_id));
            assert_eq!(subs[0].IsFlat, Some(expected_flat));
            assert_eq!(subs[0].Value, Some(corner.substats[0].min_value));
            assert_eq!(subs[0].Condition.as_deref(), Some(">="));
            // Emitted watch rules stay flagged as placeholders with missing = 0.
            assert_eq!(rule.safeguard_placeholder, Some(true));
            assert_eq!(rule.safeguard_placeholder_missing, Some(0));
        }
    }
}
