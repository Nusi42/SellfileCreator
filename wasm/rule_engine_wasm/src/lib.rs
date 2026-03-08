use std::collections::HashMap;
use serde::Serialize;
use serde_wasm_bindgen::{from_value as from_js_value, to_value as to_js_value};
use wasm_bindgen::prelude::*;
use rule_engine_core::*;

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
    // Run the shared protection core and return the serialized snapshot.
    let snapshot = compute_safeguard_protection_core_pub(
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
    let combined = collect_and_compute_safeguard_protection_core(
        parsed_rows,
        parsed_rules,
        parsed_recipe_modes,
        parsed_ignore,
        parsed_safeguard_rules,
        expected_payload,
        enabled,
        now,
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
            .collect::<std::collections::HashSet<_>>();
        let mut included_ids = normalized
            .iter()
            .filter_map(|entry| if entry.excluded { None } else { Some(entry.id) })
            .collect::<std::collections::HashSet<_>>();

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
    // round-trip as plain JS objects rather than JS Map instances.
    resolved
        .serialize(&serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true))
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard metaset result: {error}")))
}

// Expose a fixed version token so diagnostics can verify which WASM build loaded.
#[wasm_bindgen]
pub fn version() -> String {
    "rule-engine-wasm-v0.15".to_string()
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
pub fn flatten_rule_batches_with_total_limit_value(
    base_count: i64,
    total_limit: i64,
    batches: JsValue,
) -> Result<JsValue, JsValue> {
    let parsed_batches: Vec<Vec<RuleRaw>> = from_js_value(batches)
        .map_err(|error| JsValue::from_str(&format!("Invalid flatten-rule-batches payload: {error}")))?;
    let result = flatten_rule_batches_with_total_limit_core(base_count, total_limit, parsed_batches);
    to_js_value(&result)
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
#[wasm_bindgen]
pub fn compute_merged_rules_value(payload: JsValue) -> Result<JsValue, JsValue> {
    let input: ComputeMergedRulesIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid compute-merged-rules payload: {error}")))?;
    let result = compute_merged_rules_core(input);
    to_js_value(&result)
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

// Generated-rule finalization also delegates to the postprocess module.
#[wasm_bindgen]
pub fn finalize_generated_rules_value(
    entries: JsValue,
    apply_obsolete_pruning: bool,
) -> Result<JsValue, JsValue> {
    let parsed_entries: Vec<GeneratedRuleEntryIn> = from_js_value(entries)
        .map_err(|error| JsValue::from_str(&format!("Invalid finalize-generated-rules payload: {error}")))?;
    let result = finalize_generated_rules_core(parsed_entries, apply_obsolete_pruning);
    to_js_value(&result)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize finalized generated rules: {error}")))
}

// --- Engine configure/evaluate exports ---

// Configure rules + recipe modes once per pipeline run.
// The worker calls this before evaluating one or more item batches.
// Fast configure variant accepts JS objects directly (no JSON stringify).
#[wasm_bindgen]
pub fn configure_value(rules: JsValue, recipe_modes: JsValue) -> Result<(), JsValue> {
    let raw_rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid rules value: {error}")))?;
    let parsed_recipe_modes: Vec<String> = from_js_value(recipe_modes)
        .map_err(|error| JsValue::from_str(&format!("Invalid recipeModes value: {error}")))?;
    configure_engine(raw_rules, parsed_recipe_modes);
    Ok(())
}

// Store pre-parsed artifact rows in ENGINE_STATE so the combined evaluate+collect
// entry point can read them without re-deserializing on every detection call.
// Must be called after configure_value and before evaluate_and_collect_safeguard_protection_value.
// Re-call whenever the artifact DB changes (not just when rules change).
// Returns the number of rows stored as a JS number.
#[wasm_bindgen]
pub fn store_artifact_rows_value(rows: JsValue) -> Result<JsValue, JsValue> {
    // Parse compact fast-path rows; same format as the former rows param.
    let fast_rows: Vec<SafeguardCollectRowFastIn> = from_js_value(rows)
        .map_err(|error| JsValue::from_str(&format!("Invalid artifact rows payload: {error}")))?;
    let count = store_artifact_rows_engine(fast_rows)
        .map_err(|error| JsValue::from_str(&error))?;
    to_js_value(&count)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize stored row count: {error}")))
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
    let snapshot = evaluate_engine_and_collect_safeguard_protection(
        parsed_options,
        parsed_ignore,
        parsed_safeguard_rules,
        expected_payload,
        enabled,
        now,
    ).map_err(|error| JsValue::from_str(&error))?;
    to_js_value(&snapshot)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize evaluate-and-collect snapshot: {error}")))
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
