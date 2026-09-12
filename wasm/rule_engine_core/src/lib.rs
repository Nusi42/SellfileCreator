// Two clippy lints are disabled crate-wide because taking their advice would
// introduce NaN bugs into the chance/score maths, not remove them:
//
// - `neg_cmp_op_on_partial_ord` fires on `if !(score > 0.0)`. That negation is
//   deliberate: it is the guard that catches NaN as well as zero and negatives.
//   The suggested `score <= 0.0` is FALSE for NaN, so a NaN score would sail
//   past a check written to stop it.
// - `manual_clamp` fires on `prob.max(0.0).min(1.0)`. `f64::clamp` PANICS when
//   either bound or the value is NaN (clippy's own note says so), while the
//   max/min chain folds NaN to a bound and keeps going. In a wasm scoring path
//   a panic is the worst of the three outcomes.
//
// Both are float-only judgements. INTEGER clamps have no such hazard and must use
// `i64::clamp` — see `clamp_level`/`clamp_rarity`/`clamp_rank`,
// `build_hsf_intro_assignments_for_level_core` and `need_now_for_global_min`.
// Because these two allows are crate-wide they cannot enforce that split on their
// own, so an integer `.max(a).min(b)` is a review error, not a sanctioned pattern.
#![allow(clippy::neg_cmp_op_on_partial_ord)]
#![allow(clippy::manual_clamp)]

use std::cell::RefCell;
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
// ts-rs derives generated TS interfaces during `cargo test`; output + input wire structs
// pick up `#[derive(TS)]` so consumers never hand-mirror Rust shapes.
use ts_rs::TS;

// Shared domain constants are generated from shared/domain-constants.json.
// This keeps TS and Rust sentinel/enum values synchronized automatically.
mod generated_domain_constants;
// Re-export all domain constants so the wasm crate and any other consumers
// can import them without duplicating the generated_domain_constants module.
pub use generated_domain_constants::*;
// Field-name map SSOT for the compute_merged_rules_value wire format.  Used by
// Minified wire-format structs (RuleRawWire, ComputeMergedRulesInWire) used
// only at the compute_merged_rules_value boundary.  Kept in rule_engine_core
// so the consistency test can run natively (cargo test).
pub mod wasm_merged_rules_wire_format;
// SFC (Sellfile Record) reader: converts human-readable SFC JSON to numeric codes.
pub mod sfc_reader;
// Recipe builder: ports the TS hsfBuilder preprocessing pipeline to Rust.
pub mod auto_rarity_runtime;
mod hsf_branch_execution;
pub mod hsf_builder_core;
pub mod hsf_builder_execution;
mod hsf_combo_runtime;
pub mod hsf_distribution_runtime;
mod hsf_full_selected_fallback;
mod hsf_intro_execution;
mod hsf_intro_mode_plan;
mod hsf_level_combo_execution;
// Gear ingest: the single definition of the raw-gear -> rule-engine normalisation
// rules (fixed-point rounding, level snapping, setless-accessory sentinel).
pub mod gear_ingest;
pub mod matcher_evaluator;
pub mod recipe_builder;
pub mod rule_dedupe;
pub mod rule_postprocess;
pub mod safeguards;

// Re-export all HSF builder structs and core functions at the crate root so
// sibling execution modules continue to import them via `crate::*` unchanged.
// `use` (not `pub use`) — these types are internal to the core crate only.
pub use auto_rarity_runtime::{
    expand_auto_flex_rarity_branches_core, resolve_auto_rarity_code_for_builder_core, AutoFlexRarityRecipeIn,
};
use hsf_builder_core::*;
pub use matcher_evaluator::{
    collect_safeguard_candidates_core, evaluate_item, is_recipe_owned_rule_id, prepare_evaluate_options, prepare_rule,
    recipe_id_for_index, recipe_index_from_id, BucketedRules, EvalMatch, EvaluateItemResult, EvaluateItemScratch,
    EvaluateOptionsRaw, MatchingRecipeDecision, PreparedRule, SafeguardCandidateResolveBaseMatchIn,
    SafeguardCollectRowIn, SafeguardCollectedCandidateOut, SafeguardCollectedSnapshotOut, RECIPE_MODE_ACTIVE,
    RECIPE_MODE_DISABLED, RECIPE_MODE_SEPARATOR, SAFEGUARD_RECIPE_ID_BASE,
};
pub use rule_postprocess::{
    build_final_sell_rules_core, build_generated_rules_core, compute_merged_rules_core,
    dedupe_hsf_rules_for_export_core, finalize_generated_rules_core, finish_merge_with_generated,
    flatten_rule_batches_with_total_limit_core, merge_safeguard_injected_rules_core_fn,
};
pub use safeguards::fast_path_types::{SafeguardCollectRowFastIn, SafeguardWasmCandidateFastIn};
pub use safeguards::{
    build_safeguard_rules_core, build_safeguard_rules_core_typed, collect_and_compute_safeguard_protection_core,
    compute_safeguard_protection_core_pub, compute_safeguard_protection_from_collected_core,
    hash_safeguard_combination_core, normalize_safeguard_expected_bucket_domain_core, safeguard_bucket_key_core,
    safeguard_count_key_core, safeguard_item_key_core, sort_safeguard_combination_core, sort_safeguard_substats_core,
    SafeguardWasmBucketKeyArtifactIn, SafeguardWasmCountKeyArtifactIn, SafeguardWasmExpectedBucketDomainIn,
    SafeguardWasmItemKeyArtifactIn,
};
pub use safeguards::{
    safeguard_bucket_key_from_artifact, safeguard_bucket_key_from_parts, safeguard_hash_combination,
    safeguard_normalize_set_selections, safeguard_normalize_substat_match, safeguard_parse_collect_rows_payload,
    safeguard_resolve_count_mode, score_safeguard_candidates_for_preview_core, ImprovementChanceThresholdIn,
    SafeguardWasmArtifactIn, SafeguardWasmCandidateOut, SafeguardWasmCombination, SafeguardWasmCountMode,
    SafeguardWasmExpectedBucketsPayloadIn, SafeguardWasmGroupIn, SafeguardWasmMetasetIn, SafeguardWasmResolvedRuleOut,
    SafeguardWasmRuleIn, SafeguardWasmScorePreviewIn, SafeguardWasmSetSelection, SafeguardWasmSnapshotOut,
};
// Gear ingest authority: the DLL and the app's TS ingest normalise raw gear through these.
pub use gear_ingest::{
    convert_stat_units, decode_fixed_point, finalize_stat_component, is_accessory_slot, is_anomalous_stat_id,
    is_anomalous_variant, is_percent_stat, resolve_set_id, round_stat_value, snap_level_to_milestone,
    substat_rule_value, LEVEL_MILESTONES, STAT_FIXED_POINT_SCALE,
};
// Group authority: TS and the native DLL both resolve group runs through these.
pub use hsf_builder_execution::{
    build_hsf_rules_runtime_core_fn, prepare_hsf_builder_recipe_core_fn, BuildHsfRulesRuntimeIn,
    ExecuteHsfBuilderRuntimeOut, PrepareHsfBuilderRecipeIn, PrepareHsfBuilderRecipeOut,
    PrepareHsfBuilderTargetEntryOut,
};
pub use recipe_builder::build_hsf_rules_for_recipe;
pub use safeguards::groups::{resolve_safeguard_groups, SafeguardGroupEntryIn, SafeguardGroupsOut};
pub use safeguards::improvement_chance::{
    compute_improvement_chance_core, flatten_improvement_chances_by_rule, safeguard_rules_have_improvement_threshold,
    ImprovementChanceDebug, ImprovementChanceEntry, ImprovementChancePerfDiag, ImprovementChanceRuleEntry,
};
pub use sfc_reader::{parse_sfc, ReadableRecipeParsed, SfcParsed, SubstatTargetTableIn};

pub const RULE_SOURCE_HSF: &str = "hsf";
pub const RULE_SOURCE_SFC: &str = "sfc";
pub const RULE_SOURCE_FINAL_SELL: &str = "finalSell";
pub const RULE_SOURCE_SAFEGUARDS: &str = "safeguards";
pub const FINAL_SELL_SETS_MODE_ANY: &str = "any";
pub const FINAL_SELL_SETS_MODE_EXPLICIT: &str = "explicit";
pub const RULE_FIELD_UNSET_SENTINEL: i64 = STAT_ID_ANY;
pub const FILTER_OPTION_NONE_I32: i32 = STAT_ID_ANY as i32;
pub const MAIN_STAT_F_DEFAULT_FLAG: i64 = 1;
pub const MAIN_STAT_F_DEFAULT_STR: &str = "1";
// usize alias for the generated SUBSTAT_SLOT_COUNT so slot-count comparisons with
// collection lengths don't require a cast at every call site.
pub const HSF_SUBSTAT_SLOT_COUNT: usize = SUBSTAT_SLOT_COUNT as usize;
pub const LEVEL_ORDER_INDEX_0: i64 = 0;
pub const LEVEL_ORDER_INDEX_4: i64 = 1;
pub const LEVEL_ORDER_INDEX_8: i64 = 2;
pub const LEVEL_ORDER_INDEX_12: i64 = 3;
pub const LEVEL_ORDER_INDEX_16: i64 = 4;
pub const LEVEL_ORDER_INDEX_ANY: i64 = 5;
pub const LEVEL_ORDER_FALLBACK_OFFSET: i64 = 6;
pub const ARTIFACT_TYPE_ORDER_FALLBACK_OFFSET: i64 = 100;
pub const JS_MAX_SAFE_INTEGER_I64: i64 = 9_007_199_254_740_991;

// Rank/rarity masks operate on the generated shared rank range (1..6).
pub const RANK_RARITY_FULL_MASK: u8 = 0b11_1111;

// The worker configures one ruleset, then evaluates many item batches.
// Store the prepared state in-thread for fast repeated lookups.
thread_local! {
    static ENGINE_STATE: RefCell<Option<EngineState>> = const { RefCell::new(None) };
}

// Raw rule shape mirrors the subset consumed by matchRule/evaluate.
// Keep fields optional because exports may omit values for "Any".
//
// ts-rs export: emits RuleRaw.ts with PascalCase property names (the struct uses
// `allow(non_snake_case)` so Rust field names ARE the wire-form names — no rename
// helper needed). The `__safeguard*` / `__source` / `__lineIdx` fields use
// `#[serde(rename = "...")]`, which ts-rs honors via its serde-attr passthrough.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[allow(non_snake_case)]
#[ts(export)]
pub struct RuleRaw {
    pub RecipeID: Option<i64>,
    // Arc<str> so cloning a rule is O(1) for this field (ref-count bump, no allocation).
    pub RecipeName: Option<Arc<str>>,
    pub Keep: Option<bool>,
    pub IsRuleTypeAND: Option<bool>,
    pub Use: Option<bool>,
    pub ArtifactSet: Option<Vec<i64>>,
    pub ArtifactType: Option<Vec<i64>>,
    pub Rank: Option<i64>,
    pub Rarity: Option<i64>,
    pub MainStatID: Option<i64>,
    // TS type is `number` (0 = percent, 1 = flat); concrete i64 avoids serde_json::Value AST.
    pub MainStatF: Option<i64>,
    // Rework gate: ORE_ANY (-1) / None ignores rework state, ORE_NOT_ORED (0) requires
    // never-reworked gear, ORE_ORED (1) requires reworked gear (a Chaos Ore was applied).
    // Set from the recipe tags.
    pub Ore: Option<i64>,
    pub LVLForCheck: Option<i64>,
    pub Faction: Option<i64>,
    pub Substats: Option<Vec<RuleSubRaw>>,
    // Arc<str> for the same reason as RecipeName — O(1) clone.
    #[serde(default, rename = "__source")]
    pub source: Option<Arc<str>>,
    #[serde(default, rename = "__lineIdx")]
    pub line_idx: Option<i64>,
    #[serde(default, rename = "__allKnownSets")]
    pub all_known_sets: Option<bool>,
    #[serde(default, rename = "__rankMask")]
    pub rank_mask: Option<i64>,
    #[serde(default, rename = "__rarityMask")]
    pub rarity_mask: Option<i64>,
    #[serde(default, rename = "__safeguardRuleId")]
    pub safeguard_rule_id: Option<Arc<str>>,
    #[serde(default, rename = "__safeguardRuleOrdinal")]
    pub safeguard_rule_ordinal: Option<i64>,
    #[serde(default, rename = "__safeguardHash")]
    pub safeguard_hash: Option<Arc<str>>,
    #[serde(default, rename = "__safeguardRequired")]
    pub safeguard_required: Option<i64>,
    #[serde(default, rename = "__safeguardScanMs")]
    pub safeguard_scan_ms: Option<f64>,
    #[serde(default, rename = "__safeguardProjected")]
    pub safeguard_projected: Option<i64>,
    #[serde(default, rename = "__safeguardDeficit")]
    pub safeguard_deficit: Option<i64>,
    #[serde(default, rename = "__safeguardItemKey")]
    pub safeguard_item_key: Option<i64>,
    #[serde(default, rename = "__safeguardPlaceholder")]
    pub safeguard_placeholder: Option<bool>,
    #[serde(default, rename = "__safeguardPlaceholderMissing")]
    pub safeguard_placeholder_missing: Option<i64>,
}

// Substat row shape follows the HSF payload fields.
//
// ts-rs export: PascalCase property names (no rename helper); referenced by name from
// the RuleRaw `Substats` array.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[allow(non_snake_case)]
#[ts(export)]
pub struct RuleSubRaw {
    pub ID: Option<i64>,
    pub Value: Option<f64>,
    // TS type is `boolean`; concrete bool avoids serde_json::Value AST per substat.
    pub IsFlat: Option<bool>,
    pub NotAvailable: Option<bool>,
    // Arc<str> so cloning a rule with substats doesn't copy string data.
    pub Condition: Option<Arc<str>>,
}

// Top-level item payload passed from worker evaluate calls.
//
// ts-rs export: composes TestItemRaw; nested by EvaluateValueInWire.items.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct EvaluateItemRaw {
    pub item_id: i64,
    pub item: TestItemRaw,
}

// Top-level JSON-string payload accepted by evaluate_value (rule_engine_wasm and
// rule_engine_dsim_wasm both consume this shape). Wraps the prior (items, options)
// JsValue argument pair so the single serde_json::from_str parse activates
// deny_unknown_fields at the wrapper level. Hot-path entry — worker calls this
// with batches of up to PIPELINE_MATCH_BATCH_SIZE items, so switching from
// externref-driven serde_wasm_bindgen to linear-memory JSON parsing also reduces
// wasm-bindgen Vec::grow_one churn under talc.
// `options` stays Option<EvaluateOptionsRaw> because the TS side omits the key
// entirely when no filter options apply (matches EvaluateOptionsRaw::default).
//
// ts-rs export: top-level JSON-string wire input for evaluate_value.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct EvaluateValueInWire {
    pub items: Vec<EvaluateItemRaw>,
    #[serde(default)]
    pub options: Option<EvaluateOptionsRaw>,
}

// TestItem mirrors src/lib/ruleEval.ts fields used for matching.
// All optional fields remain optional for backward compatibility.
//
// ts-rs export: top-level item payload nested by EvaluateItemRaw + SafeguardCollectRowFastIn.
// The `sub_values` wire shape is a string-keyed object of variant id → value (parsed by
// a custom deserializer into Vec<(i64, f64)> internally).  We pin the TS type with
// `#[ts(type = ...)]` so consumers see the wire form, not the internal representation.
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct TestItemRaw {
    pub slot: i64,
    pub set: i64,
    pub rank: i64,
    pub rarity: i64,
    pub level: i64,
    pub faction: Option<i64>,
    pub main: Option<i64>,
    // Number of Chaos Ore reworks applied to this item (0 = never reworked). Feeds the
    // rule Ore gate; optional so callers that never set Ore rules can omit it. The field
    // name mirrors the pre-existing DB column spelling (REROLLCOUNT).
    #[serde(default)]
    pub reroll_count: Option<i64>,
    // Keys are parsed to i64 once at deserialize-time to avoid hot-loop coercion.
    // Vec instead of BTreeMap: items have ≤4 substats so linear scan beats hashing.
    // Wire shape is `Record<string, number>` (object keyed by stringified variant id);
    // the Rust internal Vec<(i64, f64)> is invisible to consumers.
    #[serde(default, deserialize_with = "deserialize_sub_values_vec")]
    #[ts(type = "{ [variant: string]: number } | null")]
    pub sub_values: Option<Vec<(i64, f64)>>,
    pub item_id: Option<i64>,
    pub preview_extras: Option<PreviewExtrasRaw>,
}

// previewExtras carries the fallback ID used by safeguard bindings.
//
// ts-rs export: nested by TestItemRaw.previewExtras.
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct PreviewExtrasRaw {
    pub id: Option<i64>,
}

// Custom serde visitor that builds Vec<(i64, f64)> directly from a string-keyed
// map without allocating an intermediate BTreeMap.  Items are capped at 4 substats
// so with_capacity(4) avoids any reallocation in the common case.
struct SubValuesVisitor;

impl<'de> serde::de::Visitor<'de> for SubValuesVisitor {
    type Value = Vec<(i64, f64)>;

    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        f.write_str("a string-keyed map of substat variant ids to values")
    }

    fn visit_map<A: serde::de::MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
        // Substats are capped at 4 entries; pre-allocate to avoid reallocation.
        let mut vec = Vec::with_capacity(4);
        // Use String (not &str): serde_wasm_bindgen cannot provide borrowed keys
        // from JS strings because they have no stable Rust lifetime anchor.
        while let Some(key) = map.next_key::<String>()? {
            let value: f64 = map.next_value()?;
            // Skip entries whose key cannot be parsed as an i64 variant id.
            if let Ok(variant) = key.parse::<i64>() {
                vec.push((variant, value));
            }
        }
        Ok(vec)
    }
}

// Wrapper visitor so None (null/undefined) and Some(vec) are both handled.
struct OptionSubValuesVisitor;

impl<'de> serde::de::Visitor<'de> for OptionSubValuesVisitor {
    type Value = Option<Vec<(i64, f64)>>;

    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        f.write_str("null or a string-keyed map of substat variant ids to values")
    }

    fn visit_none<E: serde::de::Error>(self) -> Result<Self::Value, E> {
        Ok(None)
    }

    fn visit_some<D: serde::Deserializer<'de>>(self, d: D) -> Result<Self::Value, D::Error> {
        d.deserialize_map(SubValuesVisitor).map(Some)
    }

    // serde_wasm_bindgen may call visit_unit for JS undefined/null.
    fn visit_unit<E: serde::de::Error>(self) -> Result<Self::Value, E> {
        Ok(None)
    }
}

// Vec-based variant for TestItemRaw.sub_values so the hot matcher path uses
// a linear scan instead of BTreeMap lookups (≤4 substats per item).
// Builds directly into Vec without an intermediate BTreeMap allocation.
pub fn deserialize_sub_values_vec<'de, D>(deserializer: D) -> Result<Option<Vec<(i64, f64)>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    deserializer.deserialize_option(OptionSubValuesVisitor)
}

// Deserialize object-keyed maps into numeric-variant maps once at the boundary.
// Invalid keys are skipped so malformed entries remain non-fatal by design.
pub fn deserialize_i64_key_map<'de, D, V>(deserializer: D) -> Result<BTreeMap<i64, V>, D::Error>
where
    D: serde::Deserializer<'de>,
    V: Deserialize<'de>,
{
    let raw = BTreeMap::<String, V>::deserialize(deserializer)?;
    Ok(raw
        .into_iter()
        .filter_map(|(key, value)| key.parse::<i64>().ok().map(|variant| (variant, value)))
        .collect::<BTreeMap<i64, V>>())
}

// Serialize BTreeMap<i64, V> as a string-keyed map so serialize_maps_as_objects
// can convert it to a plain JS object.  Paired with deserialize_i64_key_map.
pub fn serialize_i64_key_map<S, V>(map: &BTreeMap<i64, V>, serializer: S) -> Result<S::Ok, S::Error>
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

// Combined safeguard payload lets TS request candidate collection + detection
// in one wasm call while preserving both legacy output shapes.
//
// ts-rs export: references SafeguardCollectedCandidateOut + SafeguardWasmSnapshotOut
// by name; both are derived elsewhere.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardCollectedAndProtectedSnapshotOut {
    pub candidates: Vec<SafeguardCollectedCandidateOut>,
    pub unique_item_keys: Vec<i64>,
    pub detection: SafeguardWasmSnapshotOut,
}

// Obsolete-report payload mirrors src/lib/hsfObsolete.ts return shape.
//
// ts-rs export: simple tuple of (index, covered_by, reason).
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ObsoleteEntryOut {
    pub index: usize,
    pub covered_by: usize,
    pub reason: String,
}

// Obsolete report root keeps the same top-level property name.
// No serde camelCase rename on this struct (single snake-free field).
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ObsoleteReportOut {
    pub obsolete: Vec<ObsoleteEntryOut>,
}

// Branch metadata mirrors merge.ts generated-entry shape.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GeneratedRuleEntryIn {
    pub rule: RuleRaw,
    pub branch_order: i64,
    pub branch_seq: i64,
    pub original_idx: i64,
}

// Builder finalize payload carries per-rule emission ordering metadata.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuilderFinalizeEmissionMetaIn {
    pub level_idx: i64,
    pub branch_idx: i64,
    pub seq: i64,
}

// Keep emitted metadata paired with each rule while pruning/sorting in wasm.
#[derive(Debug)]
pub struct BuilderFinalizeEntry {
    pub rule: RuleRaw,
    pub meta: BuilderFinalizeEmissionMetaIn,
    pub original_idx: usize,
}

// Final-sell remainder recipe mirrors src/lib/logicHub.ts payload shape.
//
// ts-rs export: nested by BuildFinalSellRulesInWire.remainder.
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct FinalSellRemainderIn {
    pub artifacts: bool,
    pub accessories: bool,
    #[serde(default)]
    pub levels: Vec<i64>,
    #[serde(default)]
    pub sets_mode: Option<String>,
}

// Merged-rule payload keeps orchestration inputs compact for one wasm call.
//
// ts-rs export: composes RuleRaw, FinalSellRemainderIn, SafeguardWasmRuleIn, and
// SafeguardWasmSnapshotOut — all derived elsewhere.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ComputeMergedRulesIn {
    #[serde(default)]
    pub base_rules: Vec<RuleRaw>,
    #[serde(default)]
    pub custom_rules: Vec<RuleRaw>,
    pub final_sell_remainder: Option<FinalSellRemainderIn>,
    #[serde(default)]
    pub all_known_set_ids: Vec<i64>,
    #[serde(default)]
    pub omit_disabled_before_safeguards: bool,
    #[serde(default)]
    pub dedupe_before_safeguards: bool,
    #[serde(default)]
    pub safeguard_enabled: bool,
    #[serde(default)]
    pub safeguard_rules: Vec<SafeguardWasmRuleIn>,
    pub safeguard_detection: Option<SafeguardWasmSnapshotOut>,
    #[serde(default)]
    pub safeguard_recipe_id_base: Option<i64>,
}

// Auto-rarity bounds mirror BuilderRecipe.substatRollBoundsV row shape.
//
// ts-rs export: nested by AutoRarityResolve* via the substat_roll_bounds_v BTreeMap.
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct AutoRarityResolveRollBoundsIn {
    pub min: Option<f64>,
}

// Auto-rarity payload keeps only fields consumed by resolveAutoRarityCode.
//
// Builder-facing auto-rarity payload accepts raw recipe vectors plus allowed ids.
//
// ts-rs export: composes AutoRarityResolveRollBoundsIn via BTreeMap<i64, ...>.
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct AutoRarityResolveBuilderIn {
    #[serde(default)]
    pub auto_rarity_supplements_threshold: Option<String>,
    #[serde(default)]
    pub auto_min_required_rolls: Option<bool>,
    #[serde(default)]
    pub min_required_rolls: Option<f64>,
    #[serde(default)]
    pub locked_min_required_rolls: Option<f64>,
    #[serde(default)]
    pub min_count: Option<f64>,
    #[serde(default)]
    pub early_keep_mode: Option<String>,
    #[serde(default)]
    pub substats_v: Vec<i64>,
    #[serde(default)]
    pub fixed_substats_v: Vec<i64>,
    #[serde(default, deserialize_with = "deserialize_i64_key_map")]
    pub substat_roll_bounds_v: BTreeMap<i64, AutoRarityResolveRollBoundsIn>,
    #[serde(default)]
    pub allowed_substats: Vec<i64>,
}

// Sort payload stores computed keys so comparator work stays branch-light.
#[derive(Debug)]
pub struct SafeguardMergeSortEntry {
    pub rule: RuleRaw,
    pub idx: usize,
    pub level_idx: i64,
    pub rule_ordinal: i64,
    pub placeholder_rank: i64,
    pub item_key: i64,
    pub canonical: rule_dedupe::CollapseCanonicalKey,
}

// Internal carry type keeps branch ordering attached through finalization.
#[derive(Debug, Clone)]
pub struct GeneratedRuleEntry {
    pub rule: RuleRaw,
    pub branch_order: i64,
    pub branch_seq: i64,
    pub original_idx: i64,
}

// Stateful engine keeps bucketed prepared rules + mode gating table.
// Rules are bucketed by artifact slot at configure time for fast per-item evaluation:
// shared rules (artifact_types empty) apply to every item; per_slot rules apply only
// to items whose slot id is in the bucket key.
// stored_rows caches pre-parsed artifact rows so the combined evaluate+collect entry point
// does not need to re-deserialize the artifact table on every call.
pub struct EngineState {
    pub bucketed_rules: BucketedRules,
    pub recipe_modes: Vec<String>,
    pub stored_rows: Option<Vec<SafeguardCollectRowIn>>,
    // Cached invariant merge inputs — everything that is constant across endpoint pushes
    // within a session (derives from the fixed SFC; only the artifact/detection data
    // changes per push).  Populated together by cache_generated_rules_engine; reused by the
    // cached merge path so these are not re-sent/re-parsed on every push (the transient
    // churn that fragments talc and crashes the worker on growing inventories).
    //   - cached_generated_rules: base+custom+final-sell rules after source-defaulting and
    //     the omit/dedupe transforms (the ~17 MiB recipe half).
    //   - cached_safeguard_rules + cached_safeguard_enabled: the safeguard rule DEFINITIONS
    //     (small, but equally invariant — paired per push with the changing detection
    //     snapshot inside finish_merge_with_generated to build candidate keep-rules).
    // None until the first cache_generated_rules_value call.
    pub cached_generated_rules: Option<Vec<RuleRaw>>,
    pub cached_safeguard_rules: Option<Vec<SafeguardWasmRuleIn>>,
    pub cached_safeguard_enabled: bool,
}

// Normalize unknown rank/rarity values into supported 1..6 domain.
pub fn clamp_rank_or_rarity(value: i64) -> i64 {
    if value <= RANK_VALUE_MIN {
        return RANK_VALUE_MIN;
    }
    if value >= RANK_VALUE_MAX {
        return RANK_VALUE_MAX;
    }
    value
}

// Rank/rarity bit helper keeps the mask check branchless in matcher loops.
pub fn bit_for_rank_or_rarity(value: i64) -> u8 {
    let clamped = clamp_rank_or_rarity(value);
    1u8 << ((clamped - 1) as u8)
}

// HSF rank code conversion copied from src/lib/hsfTypes.ts.
pub fn rank_mask(code: i64) -> u8 {
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
pub fn rank_range_mask(min: i64, max: i64) -> u8 {
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
pub fn rarity_mask(code: i64) -> u8 {
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
pub fn auto_rarity_roll_mask_for_code(rarity_code: i64) -> i64 {
    auto_rarity_runtime::auto_rarity_roll_mask_for_code(rarity_code)
}

// Addition schedule mask uses bit positions [4, 8, 12, 16].
pub fn auto_rarity_addition_mask_for_code(rarity_code: i64) -> i64 {
    auto_rarity_runtime::auto_rarity_addition_mask_for_code(rarity_code)
}

// Mythical pre-roll membership comes from the shared auto-rarity table.
pub fn auto_rarity_includes_mythical(rarity_code: i64) -> bool {
    auto_rarity_runtime::auto_rarity_includes_mythical(rarity_code)
}

// Count helper keeps roll-target math readable in all auto-rarity consumers.
pub fn auto_rarity_count_levels_up_to_mask(mask: i64, ceiling: i64) -> i64 {
    auto_rarity_runtime::auto_rarity_count_levels_up_to_mask(mask, ceiling)
}

// Shared number-ish coercer accepts number/string/bool payloads.
// Keep this behavior centralized so export and safeguard paths stay aligned.
pub fn numberish_to_f64(value: Option<&serde_json::Value>) -> Option<f64> {
    match value {
        Some(serde_json::Value::Number(raw)) => raw.as_f64(),
        Some(serde_json::Value::Bool(raw)) => Some(if *raw { 1.0 } else { 0.0 }),
        Some(serde_json::Value::String(raw)) => raw.trim().parse::<f64>().ok(),
        _ => None,
    }
}

// Shared sort+dedupe helper keeps integer selector normalization single-sourced.
// Callers use this for set/type arrays plus safeguard domain lists.
pub fn sorted_unique_i64(values: &[i64]) -> Vec<i64> {
    let mut normalized = values.to_vec();
    normalized.sort_unstable();
    normalized.dedup();
    normalized
}

// Keep optional-array normalization centralized at crate root.
// This preserves one path for `None` -> empty plus sorted+unique semantics.
pub fn normalize_i64_array(values: Option<&Vec<i64>>) -> Vec<i64> {
    values.as_ref().map(|raw| sorted_unique_i64(raw)).unwrap_or_default()
}

// Convert HSF main stat tuple to unified StatVariant encoding.
pub fn main_to_variant(id: i64, f_flag: i64) -> i64 {
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
pub fn sub_to_variant(id: i64, is_flat_flag: i64) -> i64 {
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
    // Anomalous mode-damage ids carry the standard percent-shaped encoding, but the
    // ranges above only cover the classic ids, so without this branch they all fell
    // through to the Any fallback below — decoding EVERY anomalous substat to the
    // same variant. Callers that key on the decoded variant then saw two different
    // mode-damage rules as the same stat: the obsolete detector pruned all but the
    // first as "covered by looser/equal thresholds", so a recipe selecting several
    // of them emitted one rule per level instead of one per substat.
    // Mirrors the anomalous branch of subToVariant in src/lib/types.ts.
    if let Some(variant) = anomalous_variant_for_stat_id(id) {
        return variant;
    }
    STAT_ID_ANY
}

// JS-compatible floor(Number(value) || 0) conversion.
pub fn floor_number_or_zero(value: Option<f64>) -> i64 {
    let numeric = value.unwrap_or(0.0);
    if !numeric.is_finite() {
        return 0;
    }
    numeric.floor() as i64
}

// Keep level ordering aligned with merge.ts.
pub fn level_order_value(level: Option<i64>) -> i64 {
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
pub fn shared_order_index(order: &[i64], value: i64) -> Option<i64> {
    // Use generated arrays as SSOT for ordering lookups.
    // Missing values return None so callers can apply local fallbacks.
    order
        .iter()
        .position(|candidate| *candidate == value)
        .map(|index| index as i64)
}

// Artifact type ordering mirrors src/lib/types.ts preferred slot order.
pub fn artifact_type_order_value(slot: i64) -> i64 {
    // Resolve order from generated constants to keep TS and Rust aligned.
    if let Some(index) = shared_order_index(&PREFERRED_ARTIFACT_TYPE_ORDER, slot) {
        return index;
    }
    // Unknown values retain deterministic numeric fallback ordering.
    ARTIFACT_TYPE_ORDER_FALLBACK_OFFSET + slot
}

// Sort slot arrays with preferred-order parity and numeric fallback.
pub fn sort_artifact_types_in_place(values: &mut [i64]) {
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
pub fn flatten_i32_rows(rows: &[Vec<i32>]) -> Vec<i32> {
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
pub fn collect_safeguard_candidates_value_impl(
    rows: Vec<SafeguardCollectRowIn>,
    rules: Vec<RuleRaw>,
    recipe_modes: Vec<String>,
    ignore_safeguard_recipe_indices: Option<Vec<i64>>,
) -> Result<SafeguardCollectedSnapshotOut, String> {
    // Prepare and bucket rules so candidate resolution uses slot-aware evaluation.
    let prepared_rules = rules.into_iter().map(prepare_rule).collect::<Vec<_>>();
    let bucketed_rules = BucketedRules::from_rules(prepared_rules);
    let snapshot = collect_safeguard_candidates_core(
        &rows,
        None, // no sidecar; row fields carry base_match_defined/base_match
        &bucketed_rules,
        &recipe_modes,
        &ignore_safeguard_recipe_indices.unwrap_or_default(),
    )?;
    Ok(snapshot)
}

// Expand safeguard metaset ids into concrete set selections inside wasm.
// Expand one safeguard combination's metaset references into concrete set selections.
//
// THE SINGLE DEFINITION of that expansion. `meta_set_names` is otherwise only used for
// hashing/canonicalization, and the bucket resolver builds its set gate purely from
// `combination.sets` — so a rule that names ONLY a metaset arrives with an empty set list,
// which `safeguard_artifact_matches_rule` reads as "no set gate" and protects gear from
// every set instead of the metaset's members.
pub fn expand_safeguard_combination_metasets(
    combination: &mut SafeguardWasmCombination,
    meta_map: &BTreeMap<String, Vec<i64>>,
) {
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
    for meta_id in &combination.meta_set_names {
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
}

// Build the name -> set-ids lookup the expansion above reads.
pub fn safeguard_metaset_lookup(metasets: &[SafeguardWasmMetasetIn]) -> BTreeMap<String, Vec<i64>> {
    let mut meta_map = BTreeMap::<String, Vec<i64>>::new();
    for meta in metasets {
        meta_map.insert(meta.name.clone(), meta.sets.clone());
    }
    meta_map
}

pub fn resolve_safeguard_rules_with_metasets_core(
    mut rules: Vec<SafeguardWasmRuleIn>,
    metasets: Vec<SafeguardWasmMetasetIn>,
) -> Vec<SafeguardWasmResolvedRuleOut> {
    // Parse metaset definitions into a fast lookup table.
    let meta_map = safeguard_metaset_lookup(&metasets);

    // Expand metaset ids for each rule and emit normalized rule payload rows.
    let mut resolved = Vec::<SafeguardWasmResolvedRuleOut>::with_capacity(rules.len());
    for rule in &mut rules {
        let mut combination = rule.combination.clone().unwrap_or_default();
        expand_safeguard_combination_metasets(&mut combination, &meta_map);
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
            substat_match: safeguard_normalize_substat_match(rule.substat_match.as_deref().unwrap_or("")),
            substat_weights: rule
                .substat_weights
                .clone()
                .unwrap_or_default()
                .into_iter()
                .map(|(variant, weight)| (variant.to_string(), weight))
                .collect::<BTreeMap<String, f64>>(),
            // Echo threshold back verbatim so TS preserves null-inheritance slots.
            improvement_chance_threshold: rule.improvement_chance_threshold.clone(),
            // Pass tags through unchanged so TS override selectors can match after expansion.
            tags: rule.tags.clone().unwrap_or_default(),
            // Group membership survives metaset expansion untouched: expansion rewrites the
            // combination, never the structure.
            group: rule.group.clone(),
        });
    }
    resolved
}

// Shared obsolete-report builder used by JSON and JsValue exports.
pub fn find_obsolete_report(rules: &[RuleRaw]) -> ObsoleteReportOut {
    let obsolete = rule_dedupe::collect_obsolete_entries(rules);
    ObsoleteReportOut { obsolete }
}

// Builder finalize mirrors hsfBuilder.ts post-emission behavior:
// prune builder-obsolete rows, then stable sort by emission metadata.
pub fn finalize_builder_rules_core(
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
    let obsolete_indices = obsolete.into_iter().map(|entry| entry.index).collect::<HashSet<_>>();

    // Keep metadata and rules aligned while pruning.
    let mut paired = Vec::<BuilderFinalizeEntry>::new();
    for (idx, (rule, meta)) in rules.into_iter().zip(emission_meta).enumerate() {
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

// Shared configure implementation used by both JSON and JsValue bindings.
// Rules are prepared then immediately bucketed by artifact slot so hot-path
// evaluate_item calls only iterate rules relevant to each item's slot.
pub fn configure_engine(raw_rules: Vec<RuleRaw>, recipe_modes: Vec<String>) {
    // Drop the old EngineState (and its BucketedRules + stored_rows) BEFORE building the
    // new BucketedRules. This lets dlmalloc recycle the freed blocks immediately rather
    // than holding old + new simultaneously, which would force memory.grow and is the
    // primary cause of STATUS_ACCESS_VIOLATION in V8 on Windows near the commit limit.
    // Preserve stored_rows AND the cached merge inputs across the rebuild: all are keyed to
    // data that configure does not invalidate (artifact rows; the cached rules/safeguards,
    // whose freshness is governed by the TS-side cache fingerprint).  Dropping them here
    // would force a re-store / re-cache on the very next call.
    let (existing_rows, existing_generated, existing_sg_rules, existing_sg_enabled) =
        ENGINE_STATE.with(|state| match state.borrow_mut().take() {
            Some(s) => (
                s.stored_rows,
                s.cached_generated_rules,
                s.cached_safeguard_rules,
                s.cached_safeguard_enabled,
            ),
            None => (None, None, None, false),
        });
    // Old BucketedRules is now freed; allocate the new one into the recycled space.
    let prepared_rules = raw_rules.into_iter().map(prepare_rule).collect::<Vec<_>>();
    let bucketed_rules = BucketedRules::from_rules(prepared_rules);
    ENGINE_STATE.with(|state| {
        *state.borrow_mut() = Some(EngineState {
            bucketed_rules,
            recipe_modes,
            // Restore stored_rows so the next evaluate+collect call still has artifact data.
            stored_rows: existing_rows,
            // Restore the cached merge inputs so the cached merge path survives a reconfigure.
            cached_generated_rules: existing_generated,
            cached_safeguard_rules: existing_sg_rules,
            cached_safeguard_enabled: existing_sg_enabled,
        });
    });
}

// Store the cached invariant merge inputs (generated rules + safeguard rule definitions) in
// ENGINE_STATE.  Called by the cache_generated_rules_value WASM export whenever the TS-side
// rules fingerprint changes.  The engine may not exist yet on the very first call (configure
// runs after this in some orderings), so create a minimal one if needed.
pub fn cache_generated_rules_engine(
    generated_rules: Vec<RuleRaw>,
    safeguard_rules: Vec<SafeguardWasmRuleIn>,
    safeguard_enabled: bool,
) {
    ENGINE_STATE.with(|state| {
        let mut guard = state.borrow_mut();
        match guard.as_mut() {
            Some(engine) => {
                engine.cached_generated_rules = Some(generated_rules);
                engine.cached_safeguard_rules = Some(safeguard_rules);
                engine.cached_safeguard_enabled = safeguard_enabled;
            }
            None => {
                // No engine configured yet — stash the cache in a fresh, otherwise-empty state.
                // configure_engine preserves these fields, so a later configure keeps them.
                *guard = Some(EngineState {
                    bucketed_rules: BucketedRules::from_rules(Vec::new()),
                    recipe_modes: Vec::new(),
                    stored_rows: None,
                    cached_generated_rules: Some(generated_rules),
                    cached_safeguard_rules: Some(safeguard_rules),
                    cached_safeguard_enabled: safeguard_enabled,
                });
            }
        }
    });
}

// Take a clone of the cached merge inputs (generated rules + safeguard rules + enabled
// flag), or None on a cache miss. The caller (compute_merged_rules_cached_value) self-heals
// on miss. Clone (not move) so the cache survives for subsequent pushes.
pub fn cached_merge_inputs_engine() -> Option<(Vec<RuleRaw>, Vec<SafeguardWasmRuleIn>, bool)> {
    ENGINE_STATE.with(|state| {
        state
            .borrow()
            .as_ref()
            .and_then(|e| match (&e.cached_generated_rules, &e.cached_safeguard_rules) {
                (Some(g), Some(sr)) => Some((g.clone(), sr.clone(), e.cached_safeguard_enabled)),
                _ => None,
            })
    })
}

// Finish the cached merge AND configure the engine from the result in one step.
// The worker's BASELINE configure has no TS consumer for the merged rules themselves —
// only the engine configuration and the rule count (baseline→final index offset math) —
// so serializing ~15 MiB of rules out of WASM and straight back in was pure marshaling
// waste. Returns the merged rule count; Err on a cache miss so the TS wrapper can
// self-heal exactly like the cached-merge path (re-cache the invariant half, retry).
pub fn merge_cached_and_configure_engine(
    safeguard_detection: Option<SafeguardWasmSnapshotOut>,
    safeguard_recipe_id_base: Option<i64>,
    recipe_modes: Vec<String>,
) -> Result<usize, String> {
    let (generated, safeguard_rules, safeguard_enabled) = cached_merge_inputs_engine()
        .ok_or_else(|| "merge-cached-and-configure: no cached merge inputs (cache miss)".to_string())?;
    // Same per-push merge half as compute_merged_rules_cached_value — byte-identical rules.
    // Result-typed: a stale placeholder-rehydration store fails the merge loudly.
    let merged = finish_merge_with_generated(
        generated,
        safeguard_enabled,
        safeguard_rules,
        safeguard_detection,
        safeguard_recipe_id_base,
    )?;
    let count = merged.len();
    // configure_engine preserves stored_rows + the cached merge inputs across the rebuild.
    configure_engine(merged, recipe_modes);
    Ok(count)
}

// Store pre-parsed artifact rows in ENGINE_STATE so the combined evaluate+collect entry point
// can read them without re-deserializing on every call. Returns the stored row count.
// Must be called after configure_engine (engine must exist) and before the combined fn.
// Callers re-invoke this whenever the artifact DB changes (not just when rules change).
pub fn store_artifact_rows_engine(fast_rows: Vec<SafeguardCollectRowFastIn>) -> Result<usize, String> {
    let rows = safeguard_parse_collect_rows_payload(fast_rows)?;
    let count = rows.len();
    ENGINE_STATE.with(|state| {
        let mut guard = state.borrow_mut();
        let Some(engine) = guard.as_mut() else {
            return;
        };
        // Reuse the existing Vec's backing allocation instead of dropping and re-allocating.
        // Repeated drop+alloc of large Vecs (1.6–5 MB per call for 8k–25k rows) fragments the
        // WASM linear memory (which can only grow) → Chrome renderer OOM under sustained load.
        // clear() zeroes len while retaining capacity; extend() refills in-place without
        // reallocating as long as new len ≤ old capacity (the common case: same DB or minor
        // additions). A realloc only occurs when count grows, and at most log₂(N) times total.
        match engine.stored_rows.as_mut() {
            Some(existing) => {
                existing.clear();
                existing.extend(rows);
            }
            None => engine.stored_rows = Some(rows),
        }
    });
    Ok(count)
}

// Frees the stored artifact rows from ENGINE_STATE, releasing their heap allocation.
// Call this after eval-collect (which is the last consumer of stored_rows in the
// pipeline) and before computeMergedRules (which needs large contiguous allocations).
// Freeing ~16–20 MiB of row data before the merge reduces the risk of talc's
// acquire (memory.grow) being triggered by a fragmented heap with no free large blocks.
// stored_rows will be repopulated on the next pipeline run via store_artifact_rows_engine.
pub fn clear_stored_rows_engine() {
    ENGINE_STATE.with(|state| {
        if let Some(engine) = state.borrow_mut().as_mut() {
            // Drop the Vec and its backing allocation completely.  We intentionally do
            // NOT use clear() here: we want the memory returned to the allocator so that
            // talc can reuse it for the merge phase, not just zeroed and held.
            engine.stored_rows = None;
        }
    });
}

/// Returns the current WASM linear memory size in bytes (page_count × 65_536).
/// Called from rule_engine_wasm, which wraps it in a #[wasm_bindgen] export.
/// Readable from JS as wasm_linear_memory_bytes(); used by [sfc-diag] worker logs
/// and the Playwright memory-profiling spec to track heap growth independently of
/// the CDP ArrayBufferContents metric, which lumps all ArrayBuffers together.
#[cfg(target_arch = "wasm32")]
pub fn wasm_linear_memory_bytes_core() -> u32 {
    (core::arch::wasm32::memory_size(0) as u32) * 65_536
}

// Shared evaluation implementation — returns String error instead of JsValue.
pub fn evaluate_engine(
    items: Vec<EvaluateItemRaw>,
    options: EvaluateOptionsRaw,
) -> Result<Vec<EvaluateItemResult>, String> {
    ENGINE_STATE.with(|state| {
        let guard = state.borrow();
        let Some(engine) = guard.as_ref() else {
            return Err("WASM rule engine is not configured".to_string());
        };

        // Prepare all option sets once so each item scan stays allocation-free.
        let prepared_options = prepare_evaluate_options(&options);
        // Optional baseline path excludes keep-override sources when primary
        // first-match came from those sources.
        let baseline_options = options.baseline_exclude_sources.as_ref().map(|sources| {
            let mut cloned = options.clone();
            cloned.exclude_sources = Some(sources.clone());
            cloned.baseline_exclude_sources = None;
            prepare_evaluate_options(&cloned)
        });

        // Shared scratch reused across all items to avoid per-item HashSet/BTreeMap
        // allocations in the evaluate_item hot loop.
        let mut scratch = EvaluateItemScratch::new();
        let mut results = Vec::with_capacity(items.len());
        for entry in &items {
            // Derive shared + slot-specific rule slices for this item's slot.
            // Both borrows are valid for the full item scope; evaluate_item merges lazily.
            let (shared, slot_rules) = engine.bucketed_rules.rules_for_slot(entry.item.slot);
            let (first_match, first_non_excluded) = evaluate_item(
                shared,
                slot_rules,
                &engine.recipe_modes,
                &entry.item,
                &prepared_options,
                &mut scratch,
            );
            // Extract recipe data from scratch before any second call overwrites it.
            let matching_recipe_indices: Vec<i64> = scratch.recipe_matches.iter().map(|(k, _, _)| *k).collect();
            let matching_recipe_decisions: Vec<MatchingRecipeDecision> = scratch
                .recipe_matches
                .iter()
                .map(|(recipe_idx, keep, _)| MatchingRecipeDecision {
                    recipe_idx: *recipe_idx,
                    keep: *keep,
                })
                .collect();

            let mut resolved_first_non_excluded = first_non_excluded;
            if let Some(baseline) = baseline_options.as_ref() {
                // is_keep_override_source is embedded in EvalMatch; no rule lookup needed.
                let needs_baseline = first_match.map(|m| m.is_keep_override_source).unwrap_or(false);
                if needs_baseline {
                    // Second call overwrites scratch; recipe data already extracted above.
                    let (_, baseline_non_excluded) = evaluate_item(
                        shared,
                        slot_rules,
                        &engine.recipe_modes,
                        &entry.item,
                        baseline,
                        &mut scratch,
                    );
                    if baseline_non_excluded.is_some() {
                        resolved_first_non_excluded = baseline_non_excluded;
                    }
                }
            }

            results.push(EvaluateItemResult {
                item_id: entry.item_id,
                first_match,
                first_non_excluded_match: resolved_first_non_excluded,
                matching_recipe_indices,
                matching_recipe_decisions,
            });
        }

        Ok(results)
    })
}

// Combined output for evaluate_engine_and_collect_safeguard_protection.
// Carries per-item evaluation results alongside the safeguard candidate/detection payloads
// so TS callers cross the WASM boundary only once for the detection phase.
//
// ts-rs export: composes EvaluateItemResult, SafeguardCollectedCandidateOut, and
// SafeguardWasmSnapshotOut — all derived elsewhere.
// Wire names are short for compact payload crossing the WASM boundary.
#[derive(Debug, Serialize, TS)]
#[serde(deny_unknown_fields)]
#[ts(export)]
pub struct EvaluateAndCollectSnapshotOut {
    // Per-item evaluation results (mirrors Vec<EvaluateItemResult> from evaluate_engine).
    #[serde(rename = "er")]
    #[ts(rename = "er")]
    pub evaluate_results: Vec<EvaluateItemResult>,
    // Safeguard candidate rows in row-index order for TS row re-attachment.
    #[serde(rename = "ca")]
    #[ts(rename = "ca")]
    pub candidates: Vec<SafeguardCollectedCandidateOut>,
    // Deduplicated sold-item keys for protection quota tracking.
    #[serde(rename = "uik")]
    #[ts(rename = "uik")]
    pub unique_item_keys: Vec<i64>,
    // Detection snapshot produced by protection scoring.
    #[serde(rename = "dt")]
    #[ts(rename = "dt")]
    pub detection: SafeguardWasmSnapshotOut,
}

// Combined evaluate + safeguard-collect entry point.
// Reads ENGINE_STATE configured via configure_engine and stored_rows stored via
// store_artifact_rows_engine — both must be called before invoking this function.
// For each stored row the function:
//   1. Evaluates the item against bucketed rules (with baseline-exclude support).
//   2. Records the base_match result in a per-call sidecar (stored rows stay immutable).
//   3. Feeds the sidecar into collect_safeguard_candidates_core.
//   4. Runs protection scoring and returns all outputs in one snapshot.
// This eliminates: (a) JS→WASM artifact deserialization (rows cached in state) and
// (b) the JS→WASM→JS→WASM round-trip in the separate evaluate+collect call sequence.
pub fn evaluate_engine_and_collect_safeguard_protection(
    options: EvaluateOptionsRaw,
    ignore_safeguard_recipe_indices: Option<Vec<i64>>,
    parsed_safeguard_rules: Vec<SafeguardWasmRuleIn>,
    expected_payload: Option<SafeguardWasmExpectedBucketsPayloadIn>,
    enabled: bool,
    now: f64,
    // Pre-computed improvement chances keyed by (artifact_id, 1-based rule_ordinal).
    // Empty map disables threshold gating.
    improvement_chances: std::collections::BTreeMap<(i64, i64), f64>,
) -> Result<EvaluateAndCollectSnapshotOut, String> {
    ENGINE_STATE.with(|state| {
        let guard = state.borrow();
        let Some(engine) = guard.as_ref() else {
            return Err("WASM rule engine is not configured".to_string());
        };
        let collect_rows = engine
            .stored_rows
            .as_ref()
            .ok_or("WASM artifact rows are not stored; call store_artifact_rows_value first")?;

        // Prepare evaluate options once; baseline handles keep-override source exclusions.
        let prepared_options = prepare_evaluate_options(&options);
        let baseline_options = options.baseline_exclude_sources.as_ref().map(|sources| {
            let mut cloned = options.clone();
            cloned.exclude_sources = Some(sources.clone());
            cloned.baseline_exclude_sources = None;
            prepare_evaluate_options(&cloned)
        });
        let ignore_indices = ignore_safeguard_recipe_indices.unwrap_or_default();

        // Per-call sidecar holds evaluation base_match results without mutating stored rows.
        // One entry per row: None = no match (item sold); Some(m) = base match for candidate
        // resolution. Passed to collect_safeguard_candidates_core instead of row.base_match.
        let mut base_matches = Vec::<Option<SafeguardCandidateResolveBaseMatchIn>>::with_capacity(collect_rows.len());

        // Shared scratch reused across items to avoid per-row HashSet/BTreeMap allocations.
        let mut scratch = EvaluateItemScratch::new();
        let mut evaluate_results = Vec::<EvaluateItemResult>::with_capacity(collect_rows.len());

        for row in collect_rows.iter() {
            // Derive shared + slot-specific rule slices for this item's slot.
            // Both borrows are valid for the full row scope; evaluate_item merges lazily.
            let (shared, slot_rules) = engine.bucketed_rules.rules_for_slot(row.item.slot);
            let (first_match, first_non_excluded) = evaluate_item(
                shared,
                slot_rules,
                &engine.recipe_modes,
                &row.item,
                &prepared_options,
                &mut scratch,
            );
            // Extract recipe data before any baseline call overwrites scratch.
            let matching_recipe_indices: Vec<i64> = scratch.recipe_matches.iter().map(|(k, _, _)| *k).collect();
            let matching_recipe_decisions: Vec<MatchingRecipeDecision> = scratch
                .recipe_matches
                .iter()
                .map(|(recipe_idx, keep, _)| MatchingRecipeDecision {
                    recipe_idx: *recipe_idx,
                    keep: *keep,
                })
                .collect();

            // Baseline re-evaluation mirrors evaluate_engine: if the primary match
            // came from a keep-override source, re-run with baseline_exclude_sources
            // to find the first non-excluded match without keep-override interference.
            let mut resolved_first_non_excluded = first_non_excluded;
            if let Some(baseline) = baseline_options.as_ref() {
                // is_keep_override_source is embedded in EvalMatch; no rule lookup needed.
                let needs_baseline = first_match.map(|m| m.is_keep_override_source).unwrap_or(false);
                if needs_baseline {
                    let (_, baseline_non_excluded) = evaluate_item(
                        shared,
                        slot_rules,
                        &engine.recipe_modes,
                        &row.item,
                        baseline,
                        &mut scratch,
                    );
                    if baseline_non_excluded.is_some() {
                        resolved_first_non_excluded = baseline_non_excluded;
                    }
                }
            }

            // Resolve item_id using the same precedence as resolve_collect_row_item_key.
            let item_id = matcher_evaluator::resolve_collect_row_item_key(row);
            // EvalMatch is Copy; no .clone() needed.
            evaluate_results.push(EvaluateItemResult {
                item_id,
                first_match,
                first_non_excluded_match: resolved_first_non_excluded,
                matching_recipe_indices,
                matching_recipe_decisions,
            });

            // Record base_match in the sidecar — stored rows remain immutable.
            // Use the resolved non-excluded match (or primary match) as the safeguard
            // candidate base-match — same semantics as the former TS toPreviewMatch helper.
            // EvalMatch is Copy; .or() works without as_ref().
            let effective = resolved_first_non_excluded.or(first_match);
            base_matches.push(effective.map(|m| SafeguardCandidateResolveBaseMatchIn {
                keep: m.keep,
                recipe_idx: m.recipe_idx,
            }));
        }

        // Collect candidates using stored rows + per-call base_match sidecar.
        // No re-prepare needed — engine's bucketed_rules are already configured.
        let collected = collect_safeguard_candidates_core(
            collect_rows,
            Some(&base_matches),
            &engine.bucketed_rules,
            &engine.recipe_modes,
            &ignore_indices,
        )?;

        // Run protection scoring from collected candidates + typed row artifacts.
        let detection = compute_safeguard_protection_from_collected_core(
            &collected.candidates,
            collect_rows,
            parsed_safeguard_rules,
            expected_payload,
            enabled,
            now,
            improvement_chances,
        );

        Ok(EvaluateAndCollectSnapshotOut {
            evaluate_results,
            candidates: collected.candidates,
            unique_item_keys: collected.unique_item_keys,
            detection,
        })
    })
}

// Engine-level improvement-chance entry point.
// Reads ENGINE_STATE.stored_rows (must be populated via store_artifact_rows_engine)
// and delegates probability computation to the improvement_chance submodule.
// When debug=true the returned tuple includes a populated ImprovementChancePerfDiag.
pub fn compute_improvement_chance_engine(
    rules: Vec<SafeguardWasmRuleIn>,
    enabled: bool,
    debug: bool,
) -> Result<(Vec<ImprovementChanceEntry>, Option<ImprovementChancePerfDiag>), String> {
    ENGINE_STATE.with(|state| {
        let guard = state.borrow();
        let engine = guard.as_ref().ok_or("WASM rule engine is not configured")?;
        let rows = engine
            .stored_rows
            .as_ref()
            .ok_or("WASM artifact rows are not stored; call store_artifact_rows_value first")?;
        Ok(compute_improvement_chance_core(rows, rules, enabled, debug))
    })
}

// Input payload for batch HSF rule emission from pre-filtered distributions.
//
// ts-rs export: nested by HSF batch-emission inputs.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct EmitHsfSubstatIn {
    pub id: i64,
    #[serde(default)]
    pub is_flat: bool,
}

// ts-rs export: nested by BuildHsfRulesRuntimeIn.mainChoices.
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct EmitHsfMainChoiceIn {
    pub id: i64,
    pub f: Option<i64>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmitHsfRulesForDistributionsIn {
    pub base_rule: RuleRaw,
    pub substats: Vec<EmitHsfSubstatIn>,
    // Execute-intro-plan reuses this payload as an emit template and injects
    // row vectors separately, so distributions may be omitted on input.
    #[serde(default)]
    pub distributions: Vec<Vec<i32>>,
    pub base_vals: Vec<i32>,
    pub mins: Vec<i32>,
    pub max_caps: Vec<i32>,
    pub optional_mask: Vec<bool>,
    pub skip_optional_baseline: bool,
    pub main_choices: Vec<EmitHsfMainChoiceIn>,
    pub emit_any_main_when_no_choices: bool,
    pub target_bases: Vec<Option<i32>>,
    pub target_increments: Vec<Vec<Option<i32>>>,
}

// Compact filtered-emission payload keeps only base vectors at selected dims.
// Rust widens them to requested dimensions for sink/other expansion.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmitHsfRulesForFilteredDistributionsCompactIn {
    pub dimensions: i32,
    pub total: i32,
    pub base_max_caps: Vec<i32>,
    pub base_timeline_caps: Vec<i32>,
    pub base_targeted_mask: Vec<u8>,
    pub base_locked_mask: Vec<u8>,
    pub min_floors: Vec<i32>,
    pub targeted_exact: i32,
    pub deficit_floors: Vec<i32>,
    pub deficit_max: i32,
    pub global_min: i32,
    pub global_remaining: i32,
    pub global_mode: i32,
    pub locked_min: i32,
    pub locked_remaining: i32,
    pub locked_mode: i32,
    pub emit: EmitHsfRulesForDistributionsIn,
}

// Presence-only builder payload mirrors the selectedPoolV.length===0 branch in
// hsfBuilder.ts while keeping the level/main unroll loops in Rust.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildHsfPresenceOnlyRulesIn {
    pub base_core: RuleRaw,
    pub main_choices: Vec<EmitHsfMainChoiceIn>,
    pub level_window_min: i64,
    pub level_window_max: i64,
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
        // Omitted position: mirrors resolveRollTargetValue in src/lib/hsfBuilder/targets.ts.
        // Clamp at max(factory, last_specified_value) so the threshold never silently drops
        // below what was explicitly set.
        if let Some(last_override) = increments.iter().rev().find_map(|v| *v) {
            let base = base_vals.get(idx).copied().unwrap_or(0) as i64;
            let factory = base + (rolls_applied as i64 * base);
            return factory.max(last_override as i64);
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
            IsFlat: Some(true),
            Condition: Some(Arc::from("")),
            NotAvailable: Some(false),
        });
    }
    substats
}

// Shared emitter core keeps row-to-rule expansion in one place for both
// direct distribution payloads and filtered-in-wasm payloads.
pub fn emit_hsf_rules_for_distributions_core(
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
            .filter(|main_choice| {
                !input
                    .substats
                    .iter()
                    .any(|sub| emit_hsf_sub_equals_main(sub, main_choice))
            })
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
                    IsFlat: Some(input.substats[idx].is_flat),
                    Condition: Some(Arc::from(condition)),
                    NotAvailable: Some(false),
                }
            })
            .collect::<Vec<_>>();
        let padded_substats = emit_hsf_padded_substats(computed_substats);

        for main_choice in &main_choices {
            let mut rule = input.base_rule.clone();
            rule.IsRuleTypeAND = Some(false);
            rule.MainStatID = Some(main_choice.id);
            rule.MainStatF = Some(main_choice.f.unwrap_or(MAIN_STAT_F_DEFAULT_FLAG));
            rule.Substats = Some(padded_substats.clone());
            out.push(rule);
        }
    }
    out
}

// Shared presence-only core keeps no-substat row emission in one Rust path.
pub fn build_hsf_presence_only_rules_core(input: &BuildHsfPresenceOnlyRulesIn) -> Vec<RuleRaw> {
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
            rule.MainStatF = Some(MAIN_STAT_F_DEFAULT_FLAG);
            rule.LVLForCheck = Some(level);
            rule.Substats = Some(emit_hsf_padded_substats(Vec::new()));
            out.push(rule);
            continue;
        }
        for main_choice in &input.main_choices {
            let mut rule = input.base_core.clone();
            rule.IsRuleTypeAND = Some(false);
            rule.MainStatID = Some(main_choice.id);
            rule.MainStatF = Some(main_choice.f.unwrap_or(MAIN_STAT_F_DEFAULT_FLAG));
            rule.LVLForCheck = Some(level);
            rule.Substats = Some(emit_hsf_padded_substats(Vec::new()));
            out.push(rule);
        }
    }
    out
}

// Shared compact filtered-emission core keeps sink-dimension widening in one implementation.
pub fn emit_hsf_rules_for_filtered_distributions_compact_core(
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
    let locked_mask_bool = widened_locked_mask.iter().map(|value| *value != 0).collect::<Vec<_>>();
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
