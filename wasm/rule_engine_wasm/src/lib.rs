use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use serde_wasm_bindgen::{from_value as from_js_value, to_value as to_js_value};
use wasm_bindgen::prelude::*;
use rule_engine_core::*;
// Minified wire format for compute_merged_rules_value — lives in rule_engine_core
// so the consistency test can run via `cargo test` on the host target.
use rule_engine_core::wasm_merged_rules_wire_format::{
    ComputeMergedRulesInWire, GeneratedRuleEntryInWire, RuleRawWire,
};

// wasm-bindgen console.log binding for diagnostic output from Rust.
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
    // performance.now() for timestamps in diagnostic logs.
    #[wasm_bindgen(js_namespace = performance)]
    fn now() -> f64;
}

// Format a wall-clock timestamp for diagnostic log lines (HH:MM:SS.mmm).
fn ts() -> String {
    let ms = now();
    let total_secs = (ms / 1000.0) as u64;
    let h = (total_secs / 3600) % 24;
    let m = (total_secs / 60) % 60;
    let s = total_secs % 60;
    let frac = (ms % 1000.0) as u32;
    format!("{:02}:{:02}:{:02}.{:03}", h, m, s, frac)
}

// Allocator: talc with a fixed 256 MiB static arena.  This pre-allocates all
// memory upfront so talc NEVER calls memory.grow at runtime.  Benefits:
// - No V8/Windows STATUS_BREAKPOINT from rejected runtime memory.grow calls
// - No WasmGrowAndClaim/WasmGrowAndExtend source complexity
// - talc operates on one contiguous block from module init → no multi-segment
//   bookkeeping that was suspected (though not confirmed) of contributing to
//   the free-list corruption observed in tests/repro/repro-wasm-pipeline.ts
//
// Allocator: talc with dynamic WasmGrowAndClaim source.  talc is fast and
// coalesces free blocks (preventing the HashMap 2× contiguous-resize failure
// that caused the original STATUS_ACCESS_VIOLATION on V8/Windows).
//
// Known issue: talc 5.0.3 corrupts its free-list bookkeeping after the first
// full pipeline iteration on 45k-rule workloads, crashing inside
// talc::deallocate with OOB on subsequent iterations.  Reproduced in
// tests/repro/repro-wasm-pipeline.ts (dlmalloc runs clean for 15+ iterations
// on the same workload; arena talc with ≤128 MiB OOMs; ≥256 MiB crashes
// rustc during compilation).
//
// Mitigation: PIPELINE_RESTART_INTERVAL=1 in useRuleCacheWorker.ts — every
// pipeline spawns a fresh worker so the WASM instance resets before talc's
// corruption can accumulate.  Iter 1 always succeeds; the bug only manifests
// on iter 2+.  With interval=1 there is no iter 2 in the same WASM instance.
//
// The pre_grow_memory_value export below pre-commits WASM pages in 16 MiB
// chunks at warmup time so talc rarely needs to call memory.grow during the
// pipeline hot path (V8/Windows rejects small incremental grows under
// address-space pressure → Rust OOM abort → STATUS_BREAKPOINT).
#[cfg(all(not(target_feature = "atomics"), target_family = "wasm"))]
#[global_allocator]
static TALC: talc::wasm::WasmDynamicTalc = talc::wasm::new_wasm_dynamic_allocator();

// Log talc allocator counters to the JS console for heap-pressure diagnosis.
// Uses the "counters" feature (always enabled in our talc dep).  The arena
// allocator (WasmArenaTalc) wraps TalcSyncCell which wraps TalcCell; we
// reinterpret-cast to reach the inner Talc's counters() method.
#[wasm_bindgen]
pub fn log_talc_counters(label: &str) {
    #[cfg(all(not(target_feature = "atomics"), target_family = "wasm"))]
    {
        // SAFETY: TalcSyncCell(TalcCell) is a single-field newtype at offset 0.
        // Single-threaded WASM — no aliasing risk.
        let c = unsafe {
            let inner = &TALC as *const talc::wasm::WasmDynamicTalc
                as *const talc::cell::TalcCell<talc::wasm::WasmGrowAndClaim, talc::wasm::WasmBinning>;
            (*inner).counters()
        };
        log(&format!(
            "{} [talc] {} allocs={} live={}KiB avail={}KiB frags={} heaps={} claimed={}KiB",
            ts(),
            label,
            c.allocation_count,
            c.allocated_bytes / 1024,
            c.available_bytes / 1024,
            c.fragment_count,
            c.heap_count,
            c.claimed_bytes / 1024,
        ));
    }
}

// Minimal inbound representation of a pre-computed improvement-chance entry.
// Only the two fields needed for threshold gating are deserialized; the full
// ImprovementChanceEntry type is serialization-only and cannot be deserialized.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImprovementChanceInput {
    artifact_id: i64,
    chance_percent: f64,
}

// Shared serializer used for all wasm outputs that contain HashMap fields.
// serialize_maps_as_objects ensures HashMap<K, V> round-trips as a plain JS
// object rather than an ES2015 Map, removing the need for TS-side toPlainObjectDeep.
fn wasm_to_js<T: serde::Serialize>(value: &T) -> Result<JsValue, JsValue> {
    value
        .serialize(&serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true))
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

// --- Auto-rarity runtime wasm exports ---

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
// Deserializes the builder recipe payload from JsValue and returns the rarity code.
#[wasm_bindgen]
pub fn resolve_auto_rarity_code_for_builder_value(payload: JsValue) -> Result<i32, JsValue> {
    let input: AutoRarityResolveBuilderIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid auto-rarity builder payload: {error}")))?;
    Ok(resolve_auto_rarity_code_for_builder_core(&input))
}

// Public merge helper export keeps branch expansion logic in Rust.
// Deserializes the flex-rarity recipe from JsValue and returns expanded branches.
// Uses wasm_to_js (serialize_maps_as_objects) so substatRollBoundsV emits plain JS
// objects instead of JS Map instances.  Non-declared recipe fields (e.g. minCount)
// are restored by the TS wrapper via {...originalRecipe, ...wasmBranch}.
#[wasm_bindgen]
pub fn expand_auto_flex_rarity_branches_value(
    recipe: JsValue,
    base_rarity_code: i32,
) -> Result<JsValue, JsValue> {
    let parsed: AutoFlexRarityRecipeIn = from_js_value(recipe)
        .map_err(|error| JsValue::from_str(&format!("Invalid auto-flex-rarity recipe payload: {error}")))?;
    let expanded = expand_auto_flex_rarity_branches_core(&parsed, base_rarity_code);
    // wasm_to_js converts errors to JsValue already; propagate directly.
    wasm_to_js(&expanded)
}

// --- Safeguard wasm exports (originally in safeguards/mod.rs) ---

// Normalize safeguard expected-group domain arrays/maps in Rust so sorting,
// de-duplication, and slot ordering remain single-sourced with matcher logic.
#[wasm_bindgen]
pub fn normalize_safeguard_expected_group_domain_value(payload: JsValue) -> Result<JsValue, JsValue> {
    let parsed: SafeguardWasmExpectedGroupDomainIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard expected-group domain payload: {error}")))?;
    let normalized = normalize_safeguard_expected_group_domain_core(parsed);
    // Use maps-as-objects so allowed_main_by_slot (HashMap<String, Vec<i64>>) emits plain JS object.
    wasm_to_js(&normalized)
}

// Expose combination hashing so TS reuses Rust canonical token construction.
#[wasm_bindgen]
pub fn hash_safeguard_combination_value(combination: JsValue) -> Result<String, JsValue> {
    let parsed: SafeguardWasmCombination = from_js_value(combination)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard combination hash payload: {error}")))?;
    Ok(hash_safeguard_combination_core(&parsed))
}

// Expose substat sorting so TS can reuse Rust priority + dedupe semantics.
#[wasm_bindgen]
pub fn sort_safeguard_substats_value(values: JsValue) -> Result<JsValue, JsValue> {
    let parsed: Vec<i64> = from_js_value(values)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard substats payload: {error}")))?;
    let sorted = sort_safeguard_substats_core(parsed);
    to_js_value(&sorted)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard sorted substats: {error}")))
}

// Expose full-combination sorting so TS can reuse Rust canonical ordering.
#[wasm_bindgen]
pub fn sort_safeguard_combination_value(combination: JsValue) -> Result<JsValue, JsValue> {
    let parsed: SafeguardWasmCombination = from_js_value(combination)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard combination payload: {error}")))?;
    let sorted = sort_safeguard_combination_core(parsed);
    to_js_value(&sorted)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard sorted combination: {error}")))
}

// Safeguard HSF rule generation now lives in wasm (merge.ts SSOT path).
// Deserializes rules + detection from JsValue, delegates to core, returns rules.
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
    // Delegate to the shared Rust helper so key semantics stay SSOT.
    Ok(safeguard_count_key_core(parsed_artifact, parsed_mode))
}

// Expose item-key resolution so TS and Rust share DB-id-first fallback logic.
#[wasm_bindgen]
pub fn safeguard_item_key_value(artifact: JsValue) -> Result<i64, JsValue> {
    let parsed_artifact: SafeguardWasmItemKeyArtifactIn = from_js_value(artifact)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard item-key artifact payload: {error}")))?;
    Ok(safeguard_item_key_core(parsed_artifact))
}

// Expose group-key derivation so TS reuses Rust accessory-faction normalization.
#[wasm_bindgen]
pub fn safeguard_group_key_value(artifact: JsValue) -> Result<String, JsValue> {
    let parsed_artifact: SafeguardWasmGroupKeyArtifactIn = from_js_value(artifact)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard group-key artifact payload: {error}")))?;
    Ok(safeguard_group_key_core(parsed_artifact))
}

// Run safeguard protection scoring against pre-collected candidates.
// Accepts fast-path candidate payload so the full artifact shape crosses the boundary once.
#[wasm_bindgen]
pub fn compute_safeguard_protection_value(
    candidates: JsValue,
    rules: JsValue,
    expected_groups_by_rule_id: JsValue,
    enabled: bool,
    now: f64,
    // Pre-computed improvement chances as [{artifactId, chancePercent}] or null/undefined.
    improvement_chances_payload: JsValue,
) -> Result<JsValue, JsValue> {
    // Parse canonical candidate payloads into the fast-path format for core.
    let parsed_candidates: Vec<SafeguardWasmCandidateFastIn> = from_js_value(candidates)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard candidates payload: {error}")))?;
    // Parse canonical safeguard rule rows prepared by app-side normalization.
    let parsed_rules: Vec<SafeguardWasmRuleIn> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard rules payload: {error}")))?;
    // Parse canonical expected-group wrapper payload (null/undefined = empty default).
    let expected_payload: Option<SafeguardWasmExpectedGroupsPayloadIn> =
        if expected_groups_by_rule_id.is_undefined() || expected_groups_by_rule_id.is_null() {
            None
        } else {
            Some(from_js_value(expected_groups_by_rule_id)
                .map_err(|error| JsValue::from_str(&format!("Invalid safeguard expected-groups payload: {error}")))?)
        };
    // Parse improvement-chance entries into a HashMap for O(1) lookup during ranking.
    let improvement_chances: HashMap<i64, f64> =
        if improvement_chances_payload.is_undefined() || improvement_chances_payload.is_null() {
            HashMap::new()
        } else {
            let entries: Vec<ImprovementChanceInput> = from_js_value(improvement_chances_payload)
                .map_err(|error| JsValue::from_str(&format!("Invalid safeguard improvement-chances payload: {error}")))?;
            entries.into_iter().map(|e| (e.artifact_id, e.chance_percent)).collect()
        };
    // Run the shared protection core and return the serialized snapshot.
    let snapshot = compute_safeguard_protection_core_pub(
        parsed_candidates,
        parsed_rules,
        expected_payload,
        enabled,
        now,
        improvement_chances,
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
    // Pre-computed improvement chances as [{artifactId, chancePercent}] or null/undefined.
    improvement_chances_payload: JsValue,
) -> Result<JsValue, JsValue> {
    // Parse canonical collect rows into the fast-path format for core parsing.
    let fast_rows: Vec<SafeguardCollectRowFastIn> = from_js_value(rows)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard collect rows payload: {error}")))?;
    let parsed_rows = safeguard_parse_collect_rows_payload(fast_rows)
        .map_err(|error| JsValue::from_str(&error))?;
    // Parse base rules used by keep/sell candidate resolution.
    let parsed_rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard collect rules payload: {error}")))?;
    // Parse visibility modes used by evaluate-item rule filtering.
    let parsed_recipe_modes: Vec<String> = from_js_value(recipe_modes)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard collect recipe-modes payload: {error}")))?;
    // Parse optional ignored-recipe list for safeguard suppression modes.
    let parsed_ignore: Option<Vec<i64>> = from_js_value(ignore_safeguard_recipe_indices)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard collect ignored-recipe payload: {error}")))?;
    // Parse canonical safeguard rules used by protection scoring/counting logic.
    let parsed_safeguard_rules: Vec<SafeguardWasmRuleIn> = from_js_value(safeguard_rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard protection rules payload: {error}")))?;
    // Parse canonical expected-group wrapper payload (null/undefined = empty default).
    let expected_payload: Option<SafeguardWasmExpectedGroupsPayloadIn> =
        if expected_groups_payload.is_undefined() || expected_groups_payload.is_null() {
            None
        } else {
            Some(from_js_value(expected_groups_payload)
                .map_err(|error| JsValue::from_str(&format!("Invalid safeguard expected-groups payload: {error}")))?)
        };
    // Parse improvement-chance entries into a HashMap for O(1) lookup during ranking.
    let improvement_chances: HashMap<i64, f64> =
        if improvement_chances_payload.is_undefined() || improvement_chances_payload.is_null() {
            HashMap::new()
        } else {
            let entries: Vec<ImprovementChanceInput> = from_js_value(improvement_chances_payload)
                .map_err(|error| JsValue::from_str(&format!("Invalid safeguard improvement-chances payload: {error}")))?;
            entries.into_iter().map(|e| (e.artifact_id, e.chance_percent)).collect()
        };
    let combined = collect_and_compute_safeguard_protection_core(
        parsed_rows,
        parsed_rules,
        parsed_recipe_modes,
        parsed_ignore,
        parsed_safeguard_rules,
        expected_payload,
        enabled,
        now,
        improvement_chances,
    ).map_err(|error| JsValue::from_str(&error))?;
    to_js_value(&combined)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard combined snapshot: {error}")))
}

// --- Main lib.rs wasm exports ---

// Safeguard candidate snapshot builder keeps key derivation + sold filtering
// in Rust so TS call sites avoid re-implementing evaluator precedence.
#[wasm_bindgen]
pub fn collect_safeguard_candidates_value(
    rows: JsValue,
    rules: JsValue,
    recipe_modes: JsValue,
    ignore_safeguard_recipe_indices: JsValue,
) -> Result<JsValue, JsValue> {
    // Parse raw/compact row payloads into the normalized collect row shape.
    let fast_rows: Vec<SafeguardCollectRowFastIn> = from_js_value(rows)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard collect rows payload: {error}")))?;
    let parsed_rows = safeguard_parse_collect_rows_payload(fast_rows)
        .map_err(|error| JsValue::from_str(&error))?;
    // Parse merged base rules used by keep/sell resolution.
    let parsed_rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard collect rules payload: {error}")))?;
    // Parse per-recipe mode visibility needed by evaluate-item parity.
    let parsed_recipe_modes: Vec<String> = from_js_value(recipe_modes)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard collect recipe-modes payload: {error}")))?;
    // Parse optional ignored recipe indices; null/undefined maps to empty list.
    let parsed_ignore: Option<Vec<i64>> = from_js_value(ignore_safeguard_recipe_indices)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard collect ignored-recipe payload: {error}")))?;
    // Prepare and bucket rules so candidate resolution uses slot-aware evaluation.
    let prepared_rules = parsed_rules.into_iter().map(prepare_rule).collect::<Vec<_>>();
    let bucketed_rules = BucketedRules::from_rules(prepared_rules);
    let snapshot = collect_safeguard_candidates_core(
        &parsed_rows,
        None, // no sidecar; row fields carry base_match_defined/base_match
        &bucketed_rules,
        &parsed_recipe_modes,
        &parsed_ignore.unwrap_or_default(),
    ).map_err(|error| JsValue::from_str(&error))?;
    // Return the compact candidate payload used by TS row re-attachment.
    to_js_value(&snapshot)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard candidate snapshot: {error}")))
}

// Expand safeguard metaset ids into concrete set selections inside wasm.
#[wasm_bindgen]
pub fn resolve_safeguard_rules_with_metasets_value(
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
        meta_map.insert(meta.name, meta.sets);
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
            .collect::<std::collections::HashSet<_>>();
        let mut included_ids = normalized
            .iter()
            .filter_map(|entry| if entry.excluded { None } else { Some(entry.id) })
            .collect::<std::collections::HashSet<_>>();

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
            // Echo threshold back verbatim so TS preserves null-inheritance slots.
            improvement_chance_threshold: rule.improvement_chance_threshold.clone(),
        });
    }

    // Use serialize_maps_as_objects so HashMap<String, _> fields (e.g. substatWeights)
    // round-trip as plain JS objects rather than JS Map instances.
    resolved
        .serialize(&serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true))
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard metaset result: {error}")))
}

// Expose a fixed version token so diagnostics can verify which WASM build loaded.
#[wasm_bindgen]
pub fn version() -> String {
    "rule-engine-wasm-v0.16".to_string()
}

// --- HSF builder/runtime exports ---

// Full builder runtime keeps preflight + branch orchestration in Rust.
// TS calls this once per recipe instead of re-running branch loops in JS.
#[wasm_bindgen]
pub fn build_hsf_rules_runtime_value(payload: JsValue) -> Result<JsValue, JsValue> {
    let input: BuildHsfRulesRuntimeIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid build-hsf-rules-runtime payload: {error}")))?;
    let result = build_hsf_rules_runtime_core_fn(&input)
        .map_err(|error| JsValue::from_str(&error))?;
    to_js_value(&result)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize build-hsf-rules-runtime result: {error}")))
}

// Builder prep normalizes selected/fixed pools and target maps in Rust.
// TS uses this to avoid large per-recipe prep loops before runtime dispatch.
#[wasm_bindgen]
pub fn prepare_hsf_builder_recipe_value(payload: JsValue) -> Result<JsValue, JsValue> {
    let input: PrepareHsfBuilderRecipeIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid prepare-hsf-builder-recipe payload: {error}")))?;
    let result = prepare_hsf_builder_recipe_core_fn(&input);
    to_js_value(&result)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize prepare-hsf-builder-recipe result: {error}")))
}

// --- Distribution / combinatorics exports ---

// Numeric combinations helper keeps high-volume choose(N, K) expansion in wasm.
// Flat-array variant avoids JSON parsing on the result path.
#[wasm_bindgen]
pub fn combinations_i32_fast_flat(values: Vec<i32>, pick: i32) -> Vec<i32> {
    let out = hsf_distribution_runtime::compute_combinations_i32(&values, pick);
    flatten_i32_rows(&out)
}

// Numeric permutations helper mirrors TS backtracking index order.
// Flat-array variant avoids JSON parsing on the result path.
#[wasm_bindgen]
pub fn permutations_i32_fast_flat(values: Vec<i32>) -> Vec<i32> {
    let out = hsf_distribution_runtime::compute_permutations_i32(&values);
    flatten_i32_rows(&out)
}

// Build intro assignment schedules used by hsfBuilder combinatorics loops.
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

// --- Obsolete-rule detection exports ---

// Fast obsolete export accepts JS arrays directly and returns a JS object.
#[wasm_bindgen]
pub fn find_obsolete_value(rules: JsValue) -> Result<JsValue, JsValue> {
    let parsed_rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid obsolete-rules value: {error}")))?;
    let obsolete = rule_dedupe::collect_obsolete_entries(&parsed_rules);
    let report = ObsoleteReportOut { obsolete };
    to_js_value(&report)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize obsolete value: {error}")))
}

// --- Rule postprocess exports ---

// Builder-postprocess exports are delegated to core functions so lib.rs stays
// primarily about shared types, engine wiring, and wasm export entrypoints.
#[wasm_bindgen]
// Takes a JSON string for the batches payload — same rationale as
// compute_merged_rules_value: Vec<Vec<RuleRaw>> with 32k+ rules hammers
// serde_wasm_bindgen's externref table, triggering "table index is out of
// bounds" in __wbindgen_object_clone_ref.  The JSON string path stays in
// linear memory and avoids externref entirely.
//
// Payload shape: { "baseCount": i64, "totalLimit": i64, "batches": [[RuleRawWire...], ...] }
pub fn flatten_rule_batches_with_total_limit_value(
    payload: &str,
) -> Result<String, JsValue> {
    #[derive(serde::Deserialize)]
    struct FlattenPayload {
        #[serde(rename = "baseCount")]
        base_count: i64,
        #[serde(rename = "totalLimit")]
        total_limit: i64,
        batches: Vec<Vec<RuleRawWire>>,
    }
    let parsed: FlattenPayload = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid flatten-rule-batches payload: {error}")))?;
    // Convert wire-form batches to canonical RuleRaw for the core function.
    let canonical_batches: Vec<Vec<RuleRaw>> = parsed.batches
        .into_iter()
        .map(|batch| batch.into_iter().map(RuleRaw::from).collect())
        .collect();
    let result = flatten_rule_batches_with_total_limit_core(
        parsed.base_count,
        parsed.total_limit,
        canonical_batches,
    );
    // Convert result back to wire form for compact output.
    let wire_result: Vec<RuleRawWire> = result.into_iter().map(RuleRawWire::from).collect();
    serde_json::to_string(&wire_result)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize flattened rule batches: {error}")))
}

// Final Sell builder/export lives in the postprocess module to keep merge
// orchestration logic grouped with other rule-assembly helpers.
#[wasm_bindgen]
pub fn build_final_sell_rules_value(
    remainder: JsValue,
    all_known_set_ids: JsValue,
) -> Result<JsValue, JsValue> {
    let parsed_remainder: Option<FinalSellRemainderIn> =
        if remainder.is_undefined() || remainder.is_null() {
            None
        } else {
            Some(from_js_value(remainder)
                .map_err(|error| JsValue::from_str(&format!("Invalid final-sell remainder payload: {error}")))?)
        };
    let parsed_set_ids: Vec<i64> = from_js_value(all_known_set_ids)
        .map_err(|error| JsValue::from_str(&format!("Invalid final-sell set ids payload: {error}")))?;
    let result = build_final_sell_rules_core(parsed_remainder.as_ref(), &parsed_set_ids);
    to_js_value(&result)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize final-sell rules: {error}")))
}

// Merged-rule orchestration delegates to the postprocess module.
//
// Takes/returns JSON strings instead of JsValue because the merge payload can be
// huge (users with 190+ recipes generate ~45k rules × ~29 fields per rule). At
// that scale, serde_wasm_bindgen's JsValue-by-JsValue deserializer hammers the
// wasm externref table and triggers "table index is out of bounds" traps; a
// single UTF-8 string + serde_json::from_str is dramatically faster and stays
// in linear memory the whole time — no externref handles at all.
//
// The JSON uses a MINIFIED field format (see wire_format module + the SSOT at
// shared/wasm-rule-wire-fields.json). Short keys like "r_id" / "_spm" cut the
// payload size by ~40% (from ~27 MiB → ~17 MiB on 45k-rule workloads),
// relieving allocator pressure that manifested as talc deallocate OOB crashes
// after a few pipeline runs. Long-form keys still deserialise via serde
// aliases for forward/backward compatibility.
//
// Caller is responsible for JSON.stringify on the way in (with the TS-side
// minify helpers from wasmRuleWireFields.ts) and JSON.parse + expand on the
// way out; both are cheap in V8 compared to the serde_wasm_bindgen cost.
#[wasm_bindgen]
pub fn compute_merged_rules_value(payload: &str) -> Result<String, JsValue> {
    // Deserialise the wire envelope (short keys), then convert to the canonical
    // core type that compute_merged_rules_core consumes.
    let wire_input: ComputeMergedRulesInWire = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid compute-merged-rules payload: {error}")))?;
    let input: ComputeMergedRulesIn = wire_input.into();
    // Run the merge core on canonical types so the postprocess module stays
    // unchanged and all other wasm exports keep their existing behaviour.
    let result = compute_merged_rules_core(input);
    // Wrap the canonical result in wire-form so the JSON output uses short
    // keys too.  collect() moves each RuleRaw into a RuleRawWire without
    // cloning the inner String/Vec allocations.
    let wire_result: Vec<RuleRawWire> = result.into_iter().map(RuleRawWire::from).collect();
    serde_json::to_string(&wire_result)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize merged rules: {error}")))
}

// Safeguard injected merge/dedupe/sort delegates to postprocess helpers.
#[wasm_bindgen]
pub fn merge_safeguard_injected_rules_value(
    base_rules: JsValue,
    custom_rules: JsValue,
    candidate_safeguard_rules: JsValue,
) -> Result<JsValue, JsValue> {
    let parsed_base: Vec<RuleRaw> = from_js_value(base_rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid merge-safeguard base-rules payload: {error}")))?;
    let parsed_custom: Vec<RuleRaw> = from_js_value(custom_rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid merge-safeguard custom-rules payload: {error}")))?;
    let parsed_candidate: Vec<RuleRaw> = from_js_value(candidate_safeguard_rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid merge-safeguard candidate-rules payload: {error}")))?;
    let result = merge_safeguard_injected_rules_core_fn(parsed_base, parsed_custom, parsed_candidate);
    to_js_value(&result)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize merged safeguard rules: {error}")))
}

// Export-dedupe path reuses the same postprocess module for consistency.
#[wasm_bindgen]
pub fn dedupe_hsf_rules_for_export_value(rules: JsValue) -> Result<JsValue, JsValue> {
    let parsed_rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid dedupe-hsf-rules payload: {error}")))?;
    let result = dedupe_hsf_rules_for_export_core(&parsed_rules);
    to_js_value(&result)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize deduped hsf rules: {error}")))
}

// Generated-rule finalization — JSON string path like the other hot exports.
// Called ~192 times per pipeline (once per unique recipe key), each with a
// batch of ~170 rules.  192 × 170 × 29 fields = ~1M externref accesses with
// the old JsValue path, enough to trigger "table index is out of bounds".
#[wasm_bindgen]
pub fn finalize_generated_rules_value(
    payload: &str,
    apply_obsolete_pruning: bool,
) -> Result<String, JsValue> {
    let wire_entries: Vec<GeneratedRuleEntryInWire> = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid finalize-generated-rules payload: {error}")))?;
    let parsed_entries: Vec<GeneratedRuleEntryIn> = wire_entries
        .into_iter()
        .map(GeneratedRuleEntryIn::from)
        .collect();
    let result = finalize_generated_rules_core(parsed_entries, apply_obsolete_pruning);
    let wire_result: Vec<RuleRawWire> = result.into_iter().map(RuleRawWire::from).collect();
    serde_json::to_string(&wire_result)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize finalized generated rules: {error}")))
}

// --- Engine configure/evaluate exports ---

// Configure the rule engine with a new rule set and per-recipe mode list.
// The worker calls this before evaluating one or more item batches.
//
// Takes a JSON string instead of JsValue for the same reason as
// compute_merged_rules_value: the rules payload can be ~45k × 29 fields =
// ~27 MiB, and serde_wasm_bindgen's Vec growth path hammers talc's realloc,
// producing "memory access out of bounds" inside talc::deallocate.  A single
// JSON string parsed by serde_json stays in linear memory the whole time.
//
// Payload shape: { "rules": [minified RuleRawWire...], "recipeModes": [...] }
// Caller is responsible for the minify+stringify (TS-side helpers in
// wasmRuleWireFields.ts) and must send short-key wire-format rules.
#[wasm_bindgen]
pub fn configure_value(payload: &str) -> Result<JsValue, JsValue> {
    #[derive(serde::Deserialize)]
    struct ConfigurePayload {
        #[serde(default)]
        rules: Vec<RuleRawWire>,
        #[serde(default, rename = "recipeModes")]
        recipe_modes: Vec<String>,
    }
    let parsed: ConfigurePayload = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid configure payload: {error}")))?;
    let raw_rules: Vec<RuleRaw> = parsed.rules.into_iter().map(RuleRaw::from).collect();
    configure_engine(raw_rules, parsed.recipe_modes);
    // wasm-bindgen doesn't allow Result<(), JsValue> combined with non-JsValue
    // inputs; return JsValue::UNDEFINED so the binding signature is well-typed.
    Ok(JsValue::UNDEFINED)
}

// Store pre-parsed artifact rows in ENGINE_STATE so the combined evaluate+collect
// entry point can read them without re-deserializing on every detection call.
// Must be called after configure_value and before evaluate_and_collect_safeguard_protection_value.
// Re-call whenever the artifact DB changes (not just when rules change).
// Returns the number of rows stored as a JS number.
//
// Takes a JSON string (not JsValue) for the same reason as compute_merged_rules_value
// and configure_value: ~8k artifact rows with deeply-nested structure (each has
// an artifact, a gearInspectorItem, a substats array) hammer serde_wasm_bindgen's
// externref path and allocator, contributing to the latent heap corruption that
// eventually surfaces as a talc OOB crash several calls later.  A single UTF-8
// string parsed by serde_json stays in linear memory and avoids externref entirely.
//
// Payload shape: the same camelCase JSON that SafeguardCollectRowFastIn already
// deserialises from (no minification yet — serde_json::from_str alone is
// sufficient to eliminate the serde_wasm_bindgen bottleneck).
#[wasm_bindgen]
pub fn store_artifact_rows_value(payload: &str) -> Result<JsValue, JsValue> {
    let fast_rows: Vec<SafeguardCollectRowFastIn> = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid artifact rows payload: {error}")))?;
    let count = store_artifact_rows_engine(fast_rows)
        .map_err(|error| JsValue::from_str(&error))?;
    // Return JsValue::from_f64 directly; numeric return avoids to_js_value overhead.
    Ok(JsValue::from_f64(count as f64))
}

// Releases the stored artifact rows from ENGINE_STATE, returning their heap allocation
// to talc.  Call after eval-collect (the last consumer of stored_rows in the pipeline)
// and before computeMergedRules.  Freeing ~16–20 MiB here reduces the probability of
// talc needing to call memory.grow to satisfy the large allocations in the merge phase.
// The rows will be repopulated by store_artifact_rows_value on the next pipeline run.
#[wasm_bindgen]
pub fn clear_stored_rows_value() {
    clear_stored_rows_engine();
}

// Prewarms the talc heap by allocating then immediately freeing `bytes` bytes.
//
// Purpose: after several pipeline cycles the heap can fragment such that no contiguous
// free block of the required size exists.  When a subsequent large allocation (e.g. a
// HashMap resize inside improvement-chance) triggers talc.acquire, it calls
// memory.grow.  If the browser rejects that grow (or if the layout post-grow still can
// not satisfy the request), the allocator returns null and Rust aborts with `unreachable`
// (STATUS_BREAKPOINT on V8/Windows).
//
// By allocating a large scratch buffer here — before the phase that needs it — we force
// memory.grow to happen NOW (when we can control the size) rather than inside the phase.
// After drop the freed block sits in talc's bin list, immediately available for the
// first large HashMap resize.  The net cost is one memory.grow call amortised across
// the whole pipeline, not an unpredictable grow inside improvement-chance.
//
// If a free block of `bytes` already exists (typical after the first few pipeline runs),
// Vec::with_capacity finds it immediately and drop returns it — zero net effect and no
// grow.  The call becomes a no-op in the steady-state case.
#[wasm_bindgen]
pub fn prewarm_heap_value(bytes: u32) {
    // Force allocation of `bytes` contiguous bytes.  The allocator calls memory.grow if
    // no free block of this size exists, then the Vec is immediately dropped, leaving the
    // block in the free list for the caller's next allocation phase.
    let v: Vec<u8> = Vec::with_capacity(bytes as usize);
    drop(v);
}

// Pre-grow WASM linear memory to `target_bytes` in 16 MiB chunks.
//
// V8 on Windows commits WASM pages lazily and can reject memory.grow calls
// under address-space pressure — especially small incremental grows (1–4 pages)
// issued by dlmalloc during hot allocation paths.  The resulting Rust OOM abort
// surfaces as STATUS_BREAKPOINT in Chrome with no JS-visible error.
//
// By growing the memory to a target size at warmup — in 16 MiB chunks which V8
// reliably commits even at heap sizes up to 160+ MiB — we give dlmalloc a large
// pre-committed pool so it never needs to call memory.grow during the pipeline
// hot path.  16 MiB is the empirically safe per-grow floor from our earlier
// STATUS_ACCESS_VIOLATION diagnosis.
//
// Called by the TS warmup path (warmupWasmRuleEngine → preGrowMemoryWithLoadedWasm)
// before any pipeline runs.
#[wasm_bindgen]
pub fn pre_grow_memory_value(target_bytes: u32) {
    #[cfg(target_arch = "wasm32")]
    {
        const PAGE_SIZE: usize = 65_536;
        // 16 MiB per grow — V8/Windows' safe per-call ceiling.
        const CHUNK_PAGES: usize = 256;
        let target_pages = (target_bytes as usize + PAGE_SIZE - 1) / PAGE_SIZE;
        let current = core::arch::wasm32::memory_size::<0>();
        let needed = target_pages.saturating_sub(current);
        if needed == 0 { return; }
        let mut remaining = needed;
        while remaining > 0 {
            let grow = remaining.min(CHUNK_PAGES);
            let result = core::arch::wasm32::memory_grow::<0>(grow);
            if result == usize::MAX {
                // V8 rejected this grow; stop trying — we got as far as we could.
                break;
            }
            remaining -= grow;
        }
    }
}

// Returns the WASM linear memory size in bytes (page_count × 65_536).
// Used by worker [sfc-diag] log lines and the proactive worker-cycling threshold
// (WASM_HEAP_RESTART_BYTES) to track WASM heap growth.
#[wasm_bindgen]
pub fn wasm_linear_memory_bytes() -> u32 {
    wasm_linear_memory_bytes_core()
}

// Heap integrity trip-wire: exercises the allocator by doing a fresh 4 KiB
// alloc→fill→verify→drop cycle. If the allocator's free list is corrupted,
// one of these operations will trap (OOB on alloc/dealloc of the corrupted
// block) or read-back will show garbled bytes. Call from the TS test harness
// between every WASM export to pinpoint WHICH call leaves the heap corrupt.
//
// Returns:
//   0 = OK (alloc, fill, verify, drop all succeeded)
//   1 = read-back mismatch (bytes written ≠ bytes read → memory overwrite)
//   If the allocator itself is corrupt the call will TRAP (RuntimeError: OOB)
//   before returning any value — catching that trap in the harness identifies
//   the corrupting call site.
#[wasm_bindgen]
pub fn heap_integrity_check() -> u32 {
    // 4 KiB = small enough to fit in most free blocks, large enough to span
    // multiple allocator chunk boundaries and catch off-by-one metadata writes.
    const SIZE: usize = 4096;
    const PATTERN: u8 = 0xAA;
    let mut buf: Vec<u8> = Vec::with_capacity(SIZE);
    buf.resize(SIZE, PATTERN);
    // Verify every byte matches what we wrote.
    for (i, &b) in buf.iter().enumerate() {
        if b != PATTERN {
            // Something overwrote our buffer between alloc and read-back.
            // Log the first divergent offset for diagnosis.
            let _ = i; // avoid unused-var lint; value is in the return code
            return 1;
        }
    }
    // Drop the Vec — exercises talc::deallocate on a known-clean block.
    // If this traps, the free list was already corrupt before this call.
    drop(buf);
    0
}

// Combined evaluate + safeguard-collect entry point — replaces the two-step
// evaluate_value + collect_and_compute_safeguard_protection_value call pattern.
// Requires configure_value and store_artifact_rows_value to have been called first.
// Evaluates each stored item against ENGINE_STATE rules, records base_match in a
// per-call sidecar (stored rows remain immutable), collects safeguard candidates,
// and runs protection scoring — all in one Rust call for a single JS boundary crossing.
#[wasm_bindgen]
pub fn evaluate_and_collect_safeguard_protection_value(
    options: JsValue,
    ignore_safeguard_recipe_indices: JsValue,
    safeguard_rules: JsValue,
    expected_groups_payload: JsValue,
    enabled: bool,
    now: f64,
    // Pre-computed improvement chances as [{artifactId, chancePercent}] or null/undefined.
    // Populated by TypeScript before this call when any rule has improvementChanceThreshold set.
    improvement_chances_payload: JsValue,
) -> Result<JsValue, JsValue> {
    // Parse evaluate options (null/undefined = defaults).
    let parsed_options: EvaluateOptionsRaw = if options.is_undefined() || options.is_null() {
        EvaluateOptionsRaw::default()
    } else {
        from_js_value(options)
            .map_err(|error| JsValue::from_str(&format!("Invalid evaluate-and-collect options payload: {error}")))?
    };
    // Parse optional ignored-recipe list for safeguard suppression modes.
    let parsed_ignore: Option<Vec<i64>> = from_js_value(ignore_safeguard_recipe_indices)
        .map_err(|error| JsValue::from_str(&format!("Invalid evaluate-and-collect ignored-recipe payload: {error}")))?;
    // Parse canonical safeguard rules used by protection scoring.
    let parsed_safeguard_rules: Vec<SafeguardWasmRuleIn> = from_js_value(safeguard_rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid evaluate-and-collect safeguard-rules payload: {error}")))?;
    // Parse canonical expected-group wrapper payload (null/undefined = empty default).
    let expected_payload: Option<SafeguardWasmExpectedGroupsPayloadIn> =
        if expected_groups_payload.is_undefined() || expected_groups_payload.is_null() {
            None
        } else {
            Some(from_js_value(expected_groups_payload)
                .map_err(|error| JsValue::from_str(&format!("Invalid evaluate-and-collect expected-groups payload: {error}")))?)
        };
    // Parse improvement-chance entries into a HashMap for O(1) lookup during ranking.
    // null/undefined payload → empty map (no threshold gating applied).
    let improvement_chances: HashMap<i64, f64> =
        if improvement_chances_payload.is_undefined() || improvement_chances_payload.is_null() {
            HashMap::new()
        } else {
            let entries: Vec<ImprovementChanceInput> = from_js_value(improvement_chances_payload)
                .map_err(|error| JsValue::from_str(&format!("Invalid evaluate-and-collect improvement-chances payload: {error}")))?;
            entries
                .into_iter()
                .map(|e| (e.artifact_id, e.chance_percent))
                .collect()
        };
    let snapshot = evaluate_engine_and_collect_safeguard_protection(
        parsed_options,
        parsed_ignore,
        parsed_safeguard_rules,
        expected_payload,
        enabled,
        now,
        improvement_chances,
    ).map_err(|error| JsValue::from_str(&error))?;
    to_js_value(&snapshot)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize evaluate-and-collect snapshot: {error}")))
}

// Wrapper returned by compute_improvement_chance_value.
// Bundles the entry array and optional perf diagnostics so the JS caller
// can log the diag block in dev without a second round-trip.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImprovementChanceOutput<'a> {
    entries: &'a Vec<ImprovementChanceEntry>,
    diag: Option<&'a ImprovementChancePerfDiag>,
}

// Compute improvement-chance percentages for all non-maxed artifacts in stored rows.
// Reads ENGINE_STATE.stored_rows (requires store_artifact_rows_value first).
// Returns { entries, diag } where diag is populated only when debug=true.
// Uses to_js_value (not wasm_to_js) because the output types have no HashMap fields.
#[wasm_bindgen]
pub fn compute_improvement_chance_value(
    rules: JsValue,
    enabled: bool,
    debug: bool,
) -> Result<JsValue, JsValue> {
    let parsed_rules: Vec<SafeguardWasmRuleIn> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid improvement-chance rules payload: {error}")))?;
    let (entries, perf_diag) = compute_improvement_chance_engine(parsed_rules, enabled, debug)
        .map_err(|error| JsValue::from_str(&error))?;
    let output = ImprovementChanceOutput { entries: &entries, diag: perf_diag.as_ref() };
    to_js_value(&output)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize improvement-chance entries: {error}")))
}

// Score and rank a list of candidate artifacts for the safeguard weight popover.
// Accepts pre-parsed substats from a detection snapshot and the in-progress
// weight map so the popover can show live score/rank updates without re-detection.
// Uses to_js_value (SafeguardWasmCandidateOut has no HashMap fields).
#[wasm_bindgen]
pub fn score_safeguard_candidates_value(payload: JsValue) -> Result<JsValue, JsValue> {
    let input: SafeguardWasmScorePreviewIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid safeguard score preview payload: {error}")))?;
    let result = score_safeguard_candidates_for_preview_core(input);
    to_js_value(&result)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard score preview: {error}")))
}

// Evaluate a batch of Gear Inspector items against the configured rules.
// Returns a JS value matching the existing worker result shape.
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
