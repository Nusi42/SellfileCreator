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

// Allocator: vendored talc 5.0.3 with three correctness patches applied.
//
// Root cause: in talc 5.0.3, the end-size field of a free gap is stored in the 4 bytes
// immediately before the next chunk.  The last byte of that field overlaps with what would
// be the allocation tag of a hypothetical chunk ending at that address.  For gaps ≥ 16 MiB
// whose size has bit 24 set, the ALLOCATED flag bit appears set in that overlapping byte,
// causing deallocate's below-gap check to misidentify the free gap as an allocated chunk.
// This skips coalescing, leaves two adjacent free gaps in the free list, and eventually
// causes an ABOVE_FREE flag to be cleared incorrectly, resulting in a later deallocate()
// reading garbage user-data as a gap size and trapping with "memory access out of bounds".
//
// Patches (see grep TALC-PATCH in wasm/vendor/talc/src/base/):
//   1. talc_gap_looks_valid(): cross-checks base-size vs end-size before trusting ABOVE_FREE.
//      A real gap always has both equal; stale ABOVE_FREE produces a mismatch and the
//      coalesce is silently skipped — no data loss, only a missed coalescing opportunity.
//   2. ABOVE_FREE preservation in try_allocate / try_grow_in_place exact-fit path:
//      when an allocation exactly fills a gap, the new tag write preserved any ABOVE_FREE
//      that was legitimately set for an adjacent gap.
//   3. Non-panicking set_above_free / clear_above_free: removed debug_assert! to prevent
//      a recursive-panic crash when the panic handler itself allocates.
//
// 10/10 harness iterations pass with plain WasmDynamicTalc + all three patches.
#[cfg(all(not(target_feature = "atomics"), target_family = "wasm"))]
#[global_allocator]
static TALC: talc::wasm::WasmDynamicTalc = talc::wasm::new_wasm_dynamic_allocator();

// Emit a timestamped pipeline phase marker to the worker console.  Useful for
// correlating log output with the stages visible in the repro harness.
// Named log_talc_counters for API compatibility with existing TS callers.
#[wasm_bindgen]
pub fn log_talc_counters(label: &str) {
    log(&format!("{} [talc] {}", ts(), label));
}

// Pre-warm the allocator before a large JSON deserialization.  Allocates a
// single contiguous block of `bytes` and immediately drops it.  This gives
// talc a fresh large free chunk that satisfies the initial Vec capacity
// without requiring block splits from a fragmented free-list — the specific
// operation pattern that triggers talc 5.0.3's metadata corruption.
//
// Why this helps: serde_json builds Vec<T> by pushing items one at a time,
// doubling capacity at each growth event (~15 doublings for 32k items).
// Each doubling does alloc-new → copy → free-old.  Without pre-warming,
// the first allocation lands in a small fragment, and subsequent doublings
// cascade through many differently-sized free blocks.  With pre-warming,
// the first allocation reuses the just-freed large block, and subsequent
// doublings stay within that region longer before needing fresh memory.
#[inline]
fn prewarm_for_json_parse(payload_bytes: usize) {
    // The Vec<RuleRawWire> will reach ~2× the JSON byte count due to
    // struct overhead.  Pre-warm with the JSON byte count as a lower bound.
    let warm_size = payload_bytes.max(4096);
    let v = Vec::<u8>::with_capacity(warm_size);
    drop(v);
}

// Pre-allocated JSON serialization helper.  serde_json::to_string grows an
// internal Vec<u8> from ~256 bytes via ~17 sequential doublings for a 16 MiB
// output.  Each doubling does alloc→copy→free-old, producing many freed blocks
// of exponentially increasing sizes.  By pre-allocating the Vec<u8> to an
// estimated size, we skip most doublings and do 0–1 reallocs instead.
fn serialize_json_prealloc<T: serde::Serialize>(value: &T, estimated_items: usize) -> Result<String, String> {
    // ~500 bytes per item is a conservative estimate for minified RuleRawWire JSON.
    let estimated_bytes = (estimated_items * 500).max(4096);
    let mut buf = Vec::<u8>::with_capacity(estimated_bytes);
    serde_json::to_writer(&mut buf, value)
        .map_err(|e| format!("Failed to serialize JSON: {e}"))?;
    String::from_utf8(buf)
        .map_err(|e| format!("JSON output is not valid UTF-8: {e}"))
}

// Minimal inbound representation of a pre-computed improvement-chance entry.
// Only the fields needed for per-rule threshold gating are deserialized; the wire payload
// also carries `chancePercent` (the global max) and other display-only fields, but those
// are silently ignored by serde during deserialization.
//
// `chances_by_rule_ordinal` is the per-rule chance list — each entry pairs a 1-based
// safeguard rule ordinal with the probability the artifact lands in THAT rule's top-N at +16.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImprovementChanceInput {
    artifact_id: i64,
    chances_by_rule_ordinal: Vec<ImprovementChanceRuleInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImprovementChanceRuleInput {
    rule_ordinal: i64,
    chance_percent: f64,
}

// Top-level JSON-string payload accepted by compute_safeguard_protection_value.
// Mirrors the historical multi-arg signature with all optional/nullable inputs
// expressed as Option<...> so the TS side can omit them entirely.
// deny_unknown_fields is the whole reason this wrapper exists — by funnelling
// the payload through serde_json::from_str we activate the deny check that
// serde-wasm-bindgen's `from_value` path is structurally incapable of triggering
// (see ~/.cargo/registry/.../serde-wasm-bindgen-0.6.5/src/de.rs around
// line 86-105: ObjectAccess::next_key_seed iterates the Rust field list rather
// than the JS object's own keys, so unknown fields slip through silently).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ComputeSafeguardProtectionInWire {
    // Compact safeguard candidates produced by the TS-side projection helper.
    candidates: Vec<SafeguardWasmCandidateFastIn>,
    // Resolved safeguard rules (per-level thresholds already collapsed to [f64; 4]).
    rules: Vec<SafeguardWasmRuleIn>,
    // Optional expected-group wrapper (None when caller passes no precomputed groups).
    #[serde(default)]
    expected_groups_by_rule_id: Option<SafeguardWasmExpectedGroupsPayloadIn>,
    // Master toggle — when false the snapshot is built without scoring.
    enabled: bool,
    // Snapshot timestamp surfaced to the caller; sanitised downstream.
    now: f64,
    // Per-artifact / per-rule improvement chance entries (None disables thresholding).
    #[serde(default)]
    improvement_chances: Option<Vec<ImprovementChanceInput>>,
}

// Top-level JSON-string payload accepted by collect_safeguard_candidates_value.
// Mirrors the prior multi-arg signature with all optional inputs expressed as
// Option<...>.  deny_unknown_fields catches any TS-side drift; the underlying
// RuleRaw struct intentionally keeps its legacy PascalCase HSF field set and
// must NOT use deny_unknown_fields itself (see wasm/rule_engine_core/src/lib.rs).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CollectSafeguardCandidatesInWire {
    // Compact preview rows projected on the TS side via toWasmSafeguardCollectRow.
    rows: Vec<SafeguardCollectRowFastIn>,
    // Merged base rules used for keep/sell candidate resolution.
    rules: Vec<RuleRaw>,
    // Per-recipe visibility modes used by evaluate-item rule filtering.
    recipe_modes: Vec<String>,
    // Optional ignored-recipe list for safeguard suppression modes.
    #[serde(default)]
    ignore_safeguard_recipe_indices: Option<Vec<i64>>,
}

// Top-level JSON-string payload for collect_and_compute_safeguard_protection_value.
// Combines candidate collection + protection scoring inputs in a single struct so
// both halves of the combined pipeline share one parse / one deny_unknown_fields gate.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CollectAndComputeSafeguardProtectionInWire {
    // Compact preview rows projected on the TS side via toWasmSafeguardCollectRow.
    rows: Vec<SafeguardCollectRowFastIn>,
    // Merged base rules used for keep/sell candidate resolution.
    rules: Vec<RuleRaw>,
    // Per-recipe visibility modes used by evaluate-item rule filtering.
    recipe_modes: Vec<String>,
    // Optional ignored-recipe list for safeguard suppression modes.
    #[serde(default)]
    ignore_safeguard_recipe_indices: Option<Vec<i64>>,
    // Canonical safeguard rules (per-level thresholds already collapsed to [f64; 4]).
    safeguard_rules: Vec<SafeguardWasmRuleIn>,
    // Optional expected-group wrapper payload (None when caller passes no precomputed groups).
    #[serde(default)]
    expected_groups_payload: Option<SafeguardWasmExpectedGroupsPayloadIn>,
    // Master toggle — when false the snapshot is built without scoring.
    enabled: bool,
    // Snapshot timestamp surfaced to the caller; sanitised downstream.
    now: f64,
    // Per-artifact / per-rule improvement chance entries (None disables thresholding).
    #[serde(default)]
    improvement_chances: Option<Vec<ImprovementChanceInput>>,
}

// Top-level JSON-string payload accepted by resolve_safeguard_rules_with_metasets_value.
// Mirrors the prior multi-arg signature with safeguard rules and metaset definitions
// bundled into a single struct so deny_unknown_fields activates — serde_json::from_str
// will reject unknown top-level fields, whereas serde-wasm-bindgen's from_value path
// structurally ignores them.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ResolveSafeguardRulesWithMetasetsInWire {
    rules: Vec<SafeguardWasmRuleIn>,
    metasets: Vec<SafeguardWasmMetasetIn>,
}

// Flatten a list of ImprovementChanceInput into the (artifact_id, rule_ordinal) → chance
// BTreeMap consumed by the safeguard protection core. BTreeMap chosen for memory stability
// under the talc allocator (matches the convention used elsewhere in this crate).
fn flatten_improvement_chances(
    entries: Vec<ImprovementChanceInput>,
) -> std::collections::BTreeMap<(i64, i64), f64> {
    let mut out: std::collections::BTreeMap<(i64, i64), f64> = std::collections::BTreeMap::new();
    for e in entries {
        for r in e.chances_by_rule_ordinal {
            out.insert((e.artifact_id, r.rule_ordinal), r.chance_percent);
        }
    }
    out
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
// Deserializes the builder recipe payload from JSON string and returns the rarity code.
#[wasm_bindgen]
pub fn resolve_auto_rarity_code_for_builder_value(payload: &str) -> Result<i32, JsValue> {
    prewarm_for_json_parse(payload.len());
    let input: AutoRarityResolveBuilderIn = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid resolve-auto-rarity-code payload: {error}")))?;
    Ok(resolve_auto_rarity_code_for_builder_core(&input))
}

// Public merge helper export keeps branch expansion logic in Rust.
// Deserializes the flex-rarity recipe from JSON string and returns expanded branches.
// Uses wasm_to_js (serialize_maps_as_objects) so substatRollBoundsV emits plain JS
// objects instead of JS Map instances.  Non-declared recipe fields (e.g. minCount)
// are restored by the TS wrapper via {...originalRecipe, ...wasmBranch}.
#[wasm_bindgen]
pub fn expand_auto_flex_rarity_branches_value(
    recipe_payload: &str,
    base_rarity_code: i32,
) -> Result<JsValue, JsValue> {
    prewarm_for_json_parse(recipe_payload.len());
    let parsed: AutoFlexRarityRecipeIn = serde_json::from_str(recipe_payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid expand-auto-flex-rarity-branches payload: {error}")))?;
    let expanded = expand_auto_flex_rarity_branches_core(&parsed, base_rarity_code);
    // wasm_to_js converts errors to JsValue already; propagate directly.
    wasm_to_js(&expanded)
}

// --- Safeguard wasm exports (originally in safeguards/mod.rs) ---

// Normalize safeguard expected-group domain arrays/maps in Rust so sorting,
// de-duplication, and slot ordering remain single-sourced with matcher logic.
#[wasm_bindgen]
pub fn normalize_safeguard_expected_group_domain_value(payload: &str) -> Result<JsValue, JsValue> {
    prewarm_for_json_parse(payload.len());
    let parsed: SafeguardWasmExpectedGroupDomainIn = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid normalize-safeguard-expected-group-domain payload: {error}")))?;
    let normalized = normalize_safeguard_expected_group_domain_core(parsed);
    // Use maps-as-objects so allowed_main_by_slot (HashMap<String, Vec<i64>>) emits plain JS object.
    wasm_to_js(&normalized)
}

// Expose combination hashing so TS reuses Rust canonical token construction.
#[wasm_bindgen]
pub fn hash_safeguard_combination_value(payload: &str) -> Result<String, JsValue> {
    prewarm_for_json_parse(payload.len());
    let parsed: SafeguardWasmCombination = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid hash-safeguard-combination payload: {error}")))?;
    Ok(hash_safeguard_combination_core(&parsed))
}

// Expose substat sorting so TS can reuse Rust priority + dedupe semantics.
#[wasm_bindgen]
pub fn sort_safeguard_substats_value(payload: &str) -> Result<JsValue, JsValue> {
    prewarm_for_json_parse(payload.len());
    let parsed: Vec<i64> = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid sort-safeguard-substats payload: {error}")))?;
    let sorted = sort_safeguard_substats_core(parsed);
    to_js_value(&sorted)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard sorted substats: {error}")))
}

// Expose full-combination sorting so TS can reuse Rust canonical ordering.
#[wasm_bindgen]
pub fn sort_safeguard_combination_value(payload: &str) -> Result<JsValue, JsValue> {
    prewarm_for_json_parse(payload.len());
    let parsed: SafeguardWasmCombination = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid sort-safeguard-combination payload: {error}")))?;
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
// Accepts a single JSON-stringified payload so deny_unknown_fields activates
// (serde-wasm-bindgen's from_value path bypasses the check — see the wire-struct
// comment above for the underlying cause).  This also halves peak memory and
// keeps the deserialize work inside linear memory, mirroring the pattern used
// by configure_value / store_artifact_rows_value / finalize_generated_rules_value.
#[wasm_bindgen]
pub fn compute_safeguard_protection_value(payload: &str) -> Result<JsValue, JsValue> {
    // Pre-warm so the Vec growth inside serde_json lands in a clean large block.
    prewarm_for_json_parse(payload.len());
    // Single parse covers candidates / rules / expected-groups / improvement-chances.
    let input: ComputeSafeguardProtectionInWire = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid compute-safeguard-protection payload: {error}")))?;
    // Per-rule keying means each safeguard rule's threshold expansion consults
    // ITS OWN top-N probability — never the global union across rules.
    let improvement_chances = match input.improvement_chances {
        Some(entries) => flatten_improvement_chances(entries),
        None => std::collections::BTreeMap::new(),
    };
    // Run the shared protection core and return the serialized snapshot.
    let snapshot = compute_safeguard_protection_core_pub(
        input.candidates,
        input.rules,
        input.expected_groups_by_rule_id,
        input.enabled,
        input.now,
        improvement_chances,
    );
    to_js_value(&snapshot)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard snapshot: {error}")))
}

// Combined safeguard export runs candidate collection + protection in one pass.
// Accepts a single JSON-stringified payload so deny_unknown_fields activates
// (serde-wasm-bindgen's from_value path bypasses the check — see the wire-struct
// comment above for the underlying cause).  Mirrors compute_safeguard_protection_value's
// migration: one serde_json parse for the whole payload, single dispatch into core.
#[wasm_bindgen]
pub fn collect_and_compute_safeguard_protection_value(payload: &str) -> Result<JsValue, JsValue> {
    // Pre-warm so the Vec growth inside serde_json lands in a clean large block.
    prewarm_for_json_parse(payload.len());
    // Single parse covers rows / rules / recipe-modes / safeguard-rules / etc.
    let input: CollectAndComputeSafeguardProtectionInWire = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid collect-and-compute-safeguard-protection payload: {error}")))?;
    // Normalize compact preview rows into the canonical matcher collect rows.
    let parsed_rows = safeguard_parse_collect_rows_payload(input.rows)
        .map_err(|error| JsValue::from_str(&error))?;
    // Flatten improvement-chance entries into the (artifact_id, rule_ordinal) → chance map.
    // See flatten_improvement_chances for the rationale (per-rule lookup, no cross-rule inflation).
    let improvement_chances = match input.improvement_chances {
        Some(entries) => flatten_improvement_chances(entries),
        None => std::collections::BTreeMap::new(),
    };
    // Delegate to the shared core; argument order mirrors the prior multi-arg shape.
    let combined = collect_and_compute_safeguard_protection_core(
        parsed_rows,
        input.rules,
        input.recipe_modes,
        input.ignore_safeguard_recipe_indices,
        input.safeguard_rules,
        input.expected_groups_payload,
        input.enabled,
        input.now,
        improvement_chances,
    ).map_err(|error| JsValue::from_str(&error))?;
    to_js_value(&combined)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard combined snapshot: {error}")))
}

// --- Main lib.rs wasm exports ---

// Safeguard candidate snapshot builder keeps key derivation + sold filtering
// in Rust so TS call sites avoid re-implementing evaluator precedence.
// Accepts a single JSON-stringified payload so deny_unknown_fields activates
// (serde-wasm-bindgen's from_value path bypasses the check — see the wire-struct
// comment above for the underlying cause).
#[wasm_bindgen]
pub fn collect_safeguard_candidates_value(payload: &str) -> Result<JsValue, JsValue> {
    // Pre-warm so the Vec growth inside serde_json lands in a clean large block.
    prewarm_for_json_parse(payload.len());
    // Single parse covers rows / rules / recipe-modes / ignored-recipe indices.
    let input: CollectSafeguardCandidatesInWire = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid collect-safeguard-candidates payload: {error}")))?;
    // Normalize compact preview rows into the canonical matcher collect rows.
    let parsed_rows = safeguard_parse_collect_rows_payload(input.rows)
        .map_err(|error| JsValue::from_str(&error))?;
    // Prepare and bucket rules so candidate resolution uses slot-aware evaluation.
    let prepared_rules = input.rules.into_iter().map(prepare_rule).collect::<Vec<_>>();
    let bucketed_rules = BucketedRules::from_rules(prepared_rules);
    let snapshot = collect_safeguard_candidates_core(
        &parsed_rows,
        None, // no sidecar; row fields carry base_match_defined/base_match
        &bucketed_rules,
        &input.recipe_modes,
        &input.ignore_safeguard_recipe_indices.unwrap_or_default(),
    ).map_err(|error| JsValue::from_str(&error))?;
    // Return the compact candidate payload used by TS row re-attachment.
    to_js_value(&snapshot)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize safeguard candidate snapshot: {error}")))
}

// Expand safeguard metaset ids into concrete set selections inside wasm.
#[wasm_bindgen]
pub fn resolve_safeguard_rules_with_metasets_value(payload: &str) -> Result<JsValue, JsValue> {
    // Pre-warm so the Vec growth inside serde_json lands in a clean large block.
    prewarm_for_json_parse(payload.len());
    // Single parse covers rules and metasets with deny_unknown_fields activated.
    let input: ResolveSafeguardRulesWithMetasetsInWire = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid resolve-safeguard-rules-with-metasets payload: {error}")))?;
    let mut rules: Vec<SafeguardWasmRuleIn> = input.rules;
    let metasets: Vec<SafeguardWasmMetasetIn> = input.metasets;
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
            // Pass tags through unchanged so TS override selectors can match after expansion.
            tags: rule.tags.clone().unwrap_or_default(),
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
pub fn build_hsf_rules_runtime_value(payload: &str) -> Result<JsValue, JsValue> {
    prewarm_for_json_parse(payload.len());
    let input: BuildHsfRulesRuntimeIn = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid build-hsf-rules-runtime payload: {error}")))?;
    let result = build_hsf_rules_runtime_core_fn(&input)
        .map_err(|error| JsValue::from_str(&error))?;
    to_js_value(&result)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize build-hsf-rules-runtime result: {error}")))
}

// Builder prep normalizes selected/fixed pools and target maps in Rust.
// TS uses this to avoid large per-recipe prep loops before runtime dispatch.
// Returns via wasm_to_js so the HashMap fields (currentBaseByVariant /
// factoryBaseByVariant / targetBaseOverrideByVariant / targetEntriesByVariant)
// serialize as plain JS objects. Plain to_js_value would produce JS Map
// instances, and `JSON.stringify(new Map())` is "{}" — silently dropping every
// entry when the downstream build_hsf_rules_runtime_value wrapper stringifies
// the prep output before passing it as a JSON payload.
#[wasm_bindgen]
pub fn prepare_hsf_builder_recipe_value(payload: &str) -> Result<JsValue, JsValue> {
    prewarm_for_json_parse(payload.len());
    let input: PrepareHsfBuilderRecipeIn = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid prepare-hsf-builder-recipe payload: {error}")))?;
    let result = prepare_hsf_builder_recipe_core_fn(&input);
    wasm_to_js(&result)
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
    // Pre-warm the allocator before the Vec<Vec<RuleRawWire>> deserialization
    // to avoid exponential free-list fragmentation in talc.
    prewarm_for_json_parse(payload.len());
    #[derive(serde::Deserialize)]
    #[serde(deny_unknown_fields)]
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
    let count = wire_result.len();
    serialize_json_prealloc(&wire_result, count)
        .map_err(|error| JsValue::from_str(&error))
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
    // Pre-warm the allocator so the first Vec growth during deserialization
    // lands in a clean large block rather than fragmenting the free-list.
    prewarm_for_json_parse(payload.len());
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
    let count = wire_result.len();
    serialize_json_prealloc(&wire_result, count)
        .map_err(|error| JsValue::from_str(&error))
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
    // Pre-warm the allocator before Vec<GeneratedRuleEntryInWire> growth to
    // keep talc's free-list from fragmenting across many small doublings.
    prewarm_for_json_parse(payload.len());
    let wire_entries: Vec<GeneratedRuleEntryInWire> = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid finalize-generated-rules payload: {error}")))?;
    let parsed_entries: Vec<GeneratedRuleEntryIn> = wire_entries
        .into_iter()
        .map(GeneratedRuleEntryIn::from)
        .collect();
    let result = finalize_generated_rules_core(parsed_entries, apply_obsolete_pruning);
    let wire_result: Vec<RuleRawWire> = result.into_iter().map(RuleRawWire::from).collect();
    let count = wire_result.len();
    serialize_json_prealloc(&wire_result, count)
        .map_err(|error| JsValue::from_str(&error))
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
    // Pre-warm the allocator before the Vec<RuleRawWire> deserialization to
    // prevent exponential free-list fragmentation during the doubling sequence.
    prewarm_for_json_parse(payload.len());
    #[derive(serde::Deserialize)]
    #[serde(deny_unknown_fields)]
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
    // Pre-warm the allocator before the Vec<SafeguardCollectRowFastIn> growth
    // to avoid exponential free-list fragmentation in talc.
    prewarm_for_json_parse(payload.len());
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
// (WASM_HEAP_RESTART_BYTES) to track WASM heap growth. cfg-gated to wasm32 so
// host-target builds (cargo test) can compile this crate cleanly.
#[cfg(target_arch = "wasm32")]
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
    // Parse improvement-chance entries and flatten into (artifact_id, rule_ordinal) → chance.
    // See flatten_improvement_chances for the rationale (per-rule lookup, no cross-rule inflation).
    // null/undefined payload → empty map (no threshold gating applied).
    let improvement_chances: std::collections::BTreeMap<(i64, i64), f64> =
        if improvement_chances_payload.is_undefined() || improvement_chances_payload.is_null() {
            std::collections::BTreeMap::new()
        } else {
            let entries: Vec<ImprovementChanceInput> = from_js_value(improvement_chances_payload)
                .map_err(|error| JsValue::from_str(&format!("Invalid evaluate-and-collect improvement-chances payload: {error}")))?;
            flatten_improvement_chances(entries)
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
pub fn score_safeguard_candidates_value(payload: &str) -> Result<JsValue, JsValue> {
    prewarm_for_json_parse(payload.len());
    let input: SafeguardWasmScorePreviewIn = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid score-safeguard-candidates payload: {error}")))?;
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

// Conformance tests for the compute_safeguard_protection_value JSON wire shape.
// The fixture is the full payload the TS side emits via JSON.stringify; if either
// side adds or renames a field, this test must be updated in lockstep — that is the
// whole point of deny_unknown_fields and the wrapper struct's exhaustive field list.
#[cfg(test)]
mod compute_safeguard_protection_wire_tests {
    use super::*;
    use rule_engine_core::safeguards::fast_path_types::SafeguardWasmMainStatRawIn;

    // Fully-populated fixture mirrors what TS emits via toWasmSafeguardCandidate +
    // toWasmImprovementChanceInput.  When a field is added to ANY wire struct
    // reachable from ComputeSafeguardProtectionInWire, this fixture AND the
    // assertion below MUST be updated in lockstep — otherwise the test fails
    // loudly (deny_unknown_fields trips, or the populated-field assert fails).
    const FIXTURE: &str = r#"{
      "candidates": [{
        "itemKey": 1,
        "groupKey": "5:19:1:0",
        "isSold": false,
        "artifact": {
          "id": 1, "slot": 5, "set": 19, "rank": 6, "rarity": 6, "level": 16,
          "exactLevel": null, "faction": 0, "mainStat": 1,
          "substats": [{ "variant": 5, "isFlat": false, "value": 8.0, "totalValue": 8.0, "rolls": 4 }],
          "equippedChampion": { "location": "collection" },
          "gearInspectorItem": {
            "slot": 5, "set": 19, "rank": 6, "rarity": 6, "level": 16,
            "faction": 0, "main": 1
          }
        }
      }],
      "rules": [{
        "id": "demo", "name": "Demo",
        "combination": { "slots": [5], "sets": [{"id": 19, "excluded": false}], "metaSetNames": [], "ranks": [6], "rarities": [6], "mainStats": [1], "factions": [] },
        "requiredCount": 1, "activation": "protectExisting",
        "countMode": { "perRule": true, "perSet": false, "perFaction": false, "perMainStat": false, "perSlot": false },
        "ignorePreviousSafeguards": true, "ignoreEquippedInCollection": false, "ignoreEquippedInVault": false,
        "substats": [5], "substatMatch": "any", "substatWeights": { "5": 1.0 },
        "improvementChanceThreshold": null, "tags": []
      }],
      "expectedGroupsByRuleId": {
        "expectedGroupsByRuleId": {},
        "expectedGroupDomain": null
      },
      "enabled": true,
      "now": 1234567890.0,
      "improvementChances": [{
        "artifactId": 1,
        "chancesByRuleOrdinal": [{ "ruleOrdinal": 1, "chancePercent": 42.0 }]
      }]
    }"#;

    // Exhaustive field-by-field assertion. Every field declared on the wrapper
    // struct AND on each directly-nested wire struct MUST be populated by the
    // fixture and asserted here.  Adding a field upstream without updating this
    // test will surface as either a deserialize failure (deny_unknown_fields) or
    // an unmet expected-value assert.
    #[test]
    fn full_fixture_deserializes() {
        let parsed: ComputeSafeguardProtectionInWire = serde_json::from_str(FIXTURE)
            .expect("fully-populated fixture must deserialize");

        // -- ComputeSafeguardProtectionInWire (wrapper) ----------------------
        assert_eq!(parsed.candidates.len(), 1, "candidates");
        assert_eq!(parsed.rules.len(), 1, "rules");
        assert!(parsed.expected_groups_by_rule_id.is_some(), "expected_groups_by_rule_id");
        assert!(parsed.enabled, "enabled");
        assert!((parsed.now - 1234567890.0).abs() < f64::EPSILON, "now");
        let chances = parsed.improvement_chances.as_ref().expect("improvement_chances populated");
        assert_eq!(chances.len(), 1, "improvement_chances entries");

        // -- SafeguardWasmCandidateFastIn (candidates[0]) --------------------
        let cand = &parsed.candidates[0];
        assert_eq!(cand.item_key, Some(1), "candidate.itemKey");
        assert_eq!(cand.group_key.as_deref(), Some("5:19:1:0"), "candidate.groupKey");
        assert!(!cand.is_sold, "candidate.isSold");

        // -- SafeguardWasmArtifactRawIn (candidates[0].artifact) -------------
        let art = &cand.artifact;
        assert_eq!(art.id, Some(1), "artifact.id");
        assert_eq!(art.slot, 5, "artifact.slot");
        assert_eq!(art.set, 19, "artifact.set");
        assert_eq!(art.rank, 6, "artifact.rank");
        assert_eq!(art.rarity, 6, "artifact.rarity");
        assert_eq!(art.level, 16, "artifact.level");
        assert_eq!(art.exact_level, None, "artifact.exactLevel"); // explicitly null in fixture
        assert_eq!(art.faction, 0, "artifact.faction");
        assert!(matches!(art.main_stat, Some(SafeguardWasmMainStatRawIn::Variant(1))), "artifact.mainStat");
        assert_eq!(art.substats.len(), 1, "artifact.substats");
        assert!(art.equipped_champion.is_some(), "artifact.equippedChampion");
        assert!(art.gear_inspector_item.is_some(), "artifact.gearInspectorItem");

        // -- SafeguardWasmSubstatRawIn (artifact.substats[0]) ----------------
        let sub = &art.substats[0];
        assert_eq!(sub.variant, 5, "substat.variant");
        assert!(!sub.is_flat, "substat.isFlat");
        assert_eq!(sub.value, Some(8.0), "substat.value");
        assert_eq!(sub.total_value, Some(8.0), "substat.totalValue");
        assert_eq!(sub.rolls, Some(4), "substat.rolls");

        // -- SafeguardWasmEquippedChampionRawIn (artifact.equippedChampion) --
        let champ = art.equipped_champion.as_ref().unwrap();
        assert_eq!(champ.location.as_deref(), Some("collection"), "equippedChampion.location");

        // -- ImprovementChanceInput (improvement_chances[0]) -----------------
        let chance = &chances[0];
        assert_eq!(chance.artifact_id, 1, "improvementChance.artifactId");
        assert_eq!(chance.chances_by_rule_ordinal.len(), 1, "improvementChance.chancesByRuleOrdinal");

        // -- ImprovementChanceRuleInput (chances_by_rule_ordinal[0]) ---------
        let by_rule = &chance.chances_by_rule_ordinal[0];
        assert_eq!(by_rule.rule_ordinal, 1, "chancesByRuleOrdinal[0].ruleOrdinal");
        assert!((by_rule.chance_percent - 42.0).abs() < f64::EPSILON, "chancesByRuleOrdinal[0].chancePercent");
    }

    // The whole point of the JSON wrapper: unknown top-level fields must fail.
    // If this assertion ever flips, deny_unknown_fields has regressed.
    #[test]
    fn unknown_top_level_field_rejected() {
        let bad = r#"{"candidates":[],"rules":[],"enabled":true,"now":0.0,"bogus":1}"#;
        let r: Result<ComputeSafeguardProtectionInWire, _> = serde_json::from_str(bad);
        assert!(r.is_err(), "deny_unknown_fields must reject unknown top-level keys");
    }
}

// Conformance tests for the collect_safeguard_candidates_value JSON wire shape.
// Mirrors compute_safeguard_protection_wire_tests above — same purpose, same pattern.
#[cfg(test)]
mod collect_safeguard_candidates_wire_tests {
    use super::*;

    // Fully-populated fixture: one collect row with artifact (including
    // equippedChampion location), a gear-inspector item, explicit baseMatch +
    // baseMatchDefined, plus one minimal RuleRaw (PascalCase HSF field names).
    // RuleRaw lacks deny_unknown_fields by design — the wrapper struct's strict
    // check is enough to catch drift at the top level.
    const FIXTURE: &str = r#"{
      "rows": [{
        "artifact": {
          "id": 1, "slot": 5, "set": 19, "rank": 6, "rarity": 6, "level": 16,
          "exactLevel": null, "faction": 0, "mainStat": 1,
          "substats": [{ "variant": 5, "isFlat": false, "value": 8.0, "totalValue": 8.0, "rolls": 4 }],
          "equippedChampion": { "location": "collection" },
          "gearInspectorItem": {
            "slot": 5, "set": 19, "rank": 6, "rarity": 6, "level": 16,
            "faction": 0, "main": 1
          }
        },
        "item": null,
        "baseMatchDefined": true,
        "baseMatch": { "keep": true, "recipeIdx": 0 }
      }],
      "rules": [{ "Keep": true, "Use": true, "IsRuleTypeAND": false }],
      "recipeModes": ["mid"],
      "ignoreSafeguardRecipeIndices": [0]
    }"#;

    // Exhaustive field-by-field assertion (see compute_safeguard_protection_wire_tests).
    #[test]
    fn full_fixture_deserializes() {
        let parsed: CollectSafeguardCandidatesInWire = serde_json::from_str(FIXTURE)
            .expect("fully-populated fixture must deserialize");

        // -- CollectSafeguardCandidatesInWire (wrapper) ----------------------
        assert_eq!(parsed.rows.len(), 1, "rows");
        assert_eq!(parsed.rules.len(), 1, "rules");
        assert_eq!(parsed.recipe_modes.len(), 1, "recipeModes");
        assert_eq!(parsed.recipe_modes[0], "mid", "recipeModes[0]");
        let ignored = parsed.ignore_safeguard_recipe_indices.as_ref()
            .expect("ignoreSafeguardRecipeIndices populated");
        assert_eq!(ignored, &vec![0i64], "ignoreSafeguardRecipeIndices");

        // -- SafeguardCollectRowFastIn (rows[0]) -----------------------------
        let row = &parsed.rows[0];
        // row.artifact details are covered by compute_safeguard_protection_wire_tests;
        // here just confirm the shape is fully populated.
        assert_eq!(row.artifact.id, Some(1), "row.artifact.id");
        assert!(row.artifact.equipped_champion.is_some(), "row.artifact.equippedChampion");
        assert!(row.artifact.gear_inspector_item.is_some(), "row.artifact.gearInspectorItem");
        assert!(row.item.is_none(), "row.item is null in fixture (Rust falls back to artifact.gearInspectorItem)");
        assert_eq!(row.base_match_defined, Some(true), "row.baseMatchDefined");

        // -- SafeguardCandidateResolveBaseMatchIn (rows[0].baseMatch) --------
        let base_match = row.base_match.as_ref().expect("baseMatch populated");
        assert!(base_match.keep, "baseMatch.keep");
        assert_eq!(base_match.recipe_idx, Some(0), "baseMatch.recipeIdx");
    }

    // deny_unknown_fields gate — extra top-level keys must error, not be ignored.
    #[test]
    fn unknown_top_level_field_rejected() {
        let bad = r#"{"rows":[],"rules":[],"recipeModes":[],"bogus":1}"#;
        let r: Result<CollectSafeguardCandidatesInWire, _> = serde_json::from_str(bad);
        assert!(r.is_err(), "deny_unknown_fields must reject unknown top-level keys");
    }
}

// Conformance tests for the collect_and_compute_safeguard_protection_value JSON wire shape.
// Same pattern as the two sibling modules above; the fixture mirrors the combined
// pipeline's payload (collect inputs + protection rules + expected groups + improvement chances).
#[cfg(test)]
mod collect_and_compute_safeguard_protection_wire_tests {
    use super::*;

    // Fully-populated fixture exercises every Option-bearing field: a collect row
    // with artifact + gearInspectorItem + baseMatch, a base RuleRaw, a resolved
    // safeguard rule, an expectedGroupsPayload wrapper, and one improvement-chance entry.
    const FIXTURE: &str = r#"{
      "rows": [{
        "artifact": {
          "id": 1, "slot": 5, "set": 19, "rank": 6, "rarity": 6, "level": 16,
          "exactLevel": null, "faction": 0, "mainStat": 1,
          "substats": [{ "variant": 5, "isFlat": false, "value": 8.0, "totalValue": 8.0, "rolls": 4 }],
          "equippedChampion": { "location": "collection" },
          "gearInspectorItem": {
            "slot": 5, "set": 19, "rank": 6, "rarity": 6, "level": 16,
            "faction": 0, "main": 1
          }
        },
        "item": null,
        "baseMatchDefined": true,
        "baseMatch": { "keep": true, "recipeIdx": 0 }
      }],
      "rules": [{ "Keep": true, "Use": true, "IsRuleTypeAND": false }],
      "recipeModes": ["mid"],
      "ignoreSafeguardRecipeIndices": [0],
      "safeguardRules": [{
        "id": "demo", "name": "Demo",
        "combination": { "slots": [5], "sets": [{"id": 19, "excluded": false}], "metaSetNames": [], "ranks": [6], "rarities": [6], "mainStats": [1], "factions": [] },
        "requiredCount": 1, "activation": "protectExisting",
        "countMode": { "perRule": true, "perSet": false, "perFaction": false, "perMainStat": false, "perSlot": false },
        "ignorePreviousSafeguards": true, "ignoreEquippedInCollection": false, "ignoreEquippedInVault": false,
        "substats": [5], "substatMatch": "any", "substatWeights": { "5": 1.0 },
        "improvementChanceThreshold": null, "tags": []
      }],
      "expectedGroupsPayload": {
        "expectedGroupsByRuleId": {},
        "expectedGroupDomain": null
      },
      "enabled": true,
      "now": 1234567890.0,
      "improvementChances": [{
        "artifactId": 1,
        "chancesByRuleOrdinal": [{ "ruleOrdinal": 1, "chancePercent": 42.0 }]
      }]
    }"#;

    // Exhaustive field-by-field assertion (see compute_safeguard_protection_wire_tests).
    #[test]
    fn full_fixture_deserializes() {
        let parsed: CollectAndComputeSafeguardProtectionInWire = serde_json::from_str(FIXTURE)
            .expect("fully-populated fixture must deserialize");

        // -- CollectAndComputeSafeguardProtectionInWire (wrapper) ------------
        assert_eq!(parsed.rows.len(), 1, "rows");
        assert_eq!(parsed.rules.len(), 1, "rules");
        assert_eq!(parsed.recipe_modes.len(), 1, "recipeModes");
        let ignored = parsed.ignore_safeguard_recipe_indices.as_ref()
            .expect("ignoreSafeguardRecipeIndices populated");
        assert_eq!(ignored, &vec![0i64], "ignoreSafeguardRecipeIndices");
        assert_eq!(parsed.safeguard_rules.len(), 1, "safeguardRules");
        assert!(parsed.expected_groups_payload.is_some(), "expectedGroupsPayload");
        assert!(parsed.enabled, "enabled");
        assert!((parsed.now - 1234567890.0).abs() < f64::EPSILON, "now");
        let chances = parsed.improvement_chances.as_ref().expect("improvementChances populated");
        assert_eq!(chances.len(), 1, "improvementChances entries");

        // -- SafeguardCollectRowFastIn (rows[0]) -----------------------------
        let row = &parsed.rows[0];
        assert_eq!(row.artifact.id, Some(1), "row.artifact.id");
        assert!(row.item.is_none(), "row.item");
        assert_eq!(row.base_match_defined, Some(true), "row.baseMatchDefined");
        let base_match = row.base_match.as_ref().expect("baseMatch populated");
        assert!(base_match.keep, "baseMatch.keep");
        assert_eq!(base_match.recipe_idx, Some(0), "baseMatch.recipeIdx");

        // -- ImprovementChanceInput (improvement_chances[0]) -----------------
        // Same coverage as compute_safeguard_protection_wire_tests — kept here so
        // that struct's drift is also caught via the combined endpoint's fixture.
        let chance = &chances[0];
        assert_eq!(chance.artifact_id, 1, "improvementChance.artifactId");
        assert_eq!(chance.chances_by_rule_ordinal.len(), 1, "chancesByRuleOrdinal");
        let by_rule = &chance.chances_by_rule_ordinal[0];
        assert_eq!(by_rule.rule_ordinal, 1, "chancesByRuleOrdinal[0].ruleOrdinal");
        assert!((by_rule.chance_percent - 42.0).abs() < f64::EPSILON, "chancesByRuleOrdinal[0].chancePercent");
    }

    // deny_unknown_fields gate — extra top-level keys must error, not be ignored.
    #[test]
    fn unknown_top_level_field_rejected() {
        let bad = r#"{"rows":[],"rules":[],"recipeModes":[],"safeguardRules":[],"enabled":true,"now":0.0,"bogus":1}"#;
        let r: Result<CollectAndComputeSafeguardProtectionInWire, _> = serde_json::from_str(bad);
        assert!(r.is_err(), "deny_unknown_fields must reject unknown top-level keys");
    }
}

// Conformance tests for the resolve_safeguard_rules_with_metasets_value JSON wire shape.
// Mirrors compute_safeguard_protection_wire_tests — same purpose, same pattern.
#[cfg(test)]
mod resolve_safeguard_rules_with_metasets_wire_tests {
    use super::*;

    // Fully-populated fixture mirrors what TS emits. When a field is added to
    // ResolveSafeguardRulesWithMetasetsInWire or any nested wire struct, this
    // fixture AND the assertion below MUST be updated in lockstep.
    const FIXTURE: &str = r#"{
      "rules": [{
        "id": "demo", "name": "Demo",
        "combination": { "slots": [5], "sets": [{"id": 19, "excluded": false}], "metaSetNames": [], "ranks": [6], "rarities": [6], "mainStats": [1], "factions": [] },
        "requiredCount": 1, "activation": "protectExisting",
        "countMode": { "perRule": true, "perSet": false, "perFaction": false, "perMainStat": false, "perSlot": false },
        "ignorePreviousSafeguards": true, "ignoreEquippedInCollection": false, "ignoreEquippedInVault": false,
        "substats": [5], "substatMatch": "any", "substatWeights": { "5": 1.0 },
        "improvementChanceThreshold": null, "tags": []
      }],
      "metasets": [{ "name": "DemoMeta", "sets": [19, 20] }]
    }"#;

    #[test]
    fn full_fixture_deserializes() {
        let parsed: ResolveSafeguardRulesWithMetasetsInWire = serde_json::from_str(FIXTURE)
            .expect("fully-populated fixture must deserialize");
        // Wrapper top-level
        assert_eq!(parsed.rules.len(), 1, "rules");
        assert_eq!(parsed.metasets.len(), 1, "metasets");
        // First rule fields — drill into every Option/scalar
        let rule = &parsed.rules[0];
        assert_eq!(rule.id.as_deref(), Some("demo"), "rule.id");
        assert_eq!(rule.name.as_deref(), Some("Demo"), "rule.name");
        assert!(rule.combination.is_some(), "rule.combination");
        assert_eq!(rule.required_count, Some(1), "rule.requiredCount");
        assert_eq!(rule.activation.as_deref(), Some("protectExisting"), "rule.activation");
        assert!(rule.count_mode.is_some(), "rule.countMode");
        assert_eq!(rule.ignore_previous_safeguards, Some(true), "rule.ignorePreviousSafeguards");
        assert_eq!(rule.ignore_equipped_in_collection, Some(false), "rule.ignoreEquippedInCollection");
        assert_eq!(rule.ignore_equipped_in_vault, Some(false), "rule.ignoreEquippedInVault");
        assert_eq!(rule.substats.as_ref().map(|v| v.len()), Some(1), "rule.substats");
        assert_eq!(rule.substat_match.as_deref(), Some("any"), "rule.substatMatch");
        assert!(rule.substat_weights.is_some(), "rule.substatWeights");
        assert!(rule.improvement_chance_threshold.is_none(), "rule.improvementChanceThreshold");
        assert_eq!(rule.tags.as_ref().map(|v| v.len()), Some(0), "rule.tags");
        // First metaset
        let meta = &parsed.metasets[0];
        assert_eq!(meta.name, "DemoMeta", "metaset.name");
        assert_eq!(meta.sets.len(), 2, "metaset.sets");
    }

    #[test]
    fn unknown_top_level_field_rejected() {
        let bad = r#"{"rules":[],"metasets":[],"bogus":1}"#;
        let r: Result<ResolveSafeguardRulesWithMetasetsInWire, _> = serde_json::from_str(bad);
        assert!(r.is_err(), "deny_unknown_fields must reject unknown top-level keys");
    }
}

#[cfg(test)]
mod hash_safeguard_combination_value_wire_tests {
    use super::*;

    const FIXTURE: &str = r#"{"slots": [5], "sets": [{"id": 19, "excluded": false}], "metaSetNames": [], "ranks": [6], "rarities": [6], "mainStats": [1], "factions": []}"#;

    #[test]
    fn full_fixture_deserializes() {
        let parsed: SafeguardWasmCombination = serde_json::from_str(FIXTURE)
            .expect("fixture must deserialize");
        assert_eq!(parsed.slots, vec![5], "slots");
        assert_eq!(parsed.sets.len(), 1, "sets length");
        assert_eq!(parsed.sets[0].id, 19, "sets[0].id");
        assert_eq!(parsed.sets[0].excluded, false, "sets[0].excluded");
        assert_eq!(parsed.meta_set_names.len(), 0, "metaSetNames");
        assert_eq!(parsed.ranks, vec![6], "ranks");
        assert_eq!(parsed.rarities, vec![6], "rarities");
        assert_eq!(parsed.main_stats, vec![1], "mainStats");
        assert_eq!(parsed.factions.len(), 0, "factions");
    }

    #[test]
    fn unknown_top_level_field_rejected() {
        let bad = r#"{"slots": [], "sets": [], "metaSetNames": [], "ranks": [], "rarities": [], "mainStats": [], "factions": [], "bogus": 1}"#;
        let r: Result<SafeguardWasmCombination, _> = serde_json::from_str(bad);
        assert!(r.is_err(), "deny_unknown_fields must reject unknown top-level keys");
    }
}

#[cfg(test)]
mod sort_safeguard_combination_value_wire_tests {
    use super::*;

    const FIXTURE: &str = r#"{"slots": [5], "sets": [{"id": 19, "excluded": false}], "metaSetNames": [], "ranks": [6], "rarities": [6], "mainStats": [1], "factions": []}"#;

    #[test]
    fn full_fixture_deserializes() {
        let parsed: SafeguardWasmCombination = serde_json::from_str(FIXTURE)
            .expect("fixture must deserialize");
        assert_eq!(parsed.slots, vec![5], "slots");
        assert_eq!(parsed.sets.len(), 1, "sets length");
        assert_eq!(parsed.sets[0].id, 19, "sets[0].id");
        assert_eq!(parsed.sets[0].excluded, false, "sets[0].excluded");
        assert_eq!(parsed.meta_set_names.len(), 0, "metaSetNames");
        assert_eq!(parsed.ranks, vec![6], "ranks");
        assert_eq!(parsed.rarities, vec![6], "rarities");
        assert_eq!(parsed.main_stats, vec![1], "mainStats");
        assert_eq!(parsed.factions.len(), 0, "factions");
    }

    #[test]
    fn unknown_top_level_field_rejected() {
        let bad = r#"{"slots": [], "sets": [], "metaSetNames": [], "ranks": [], "rarities": [], "mainStats": [], "factions": [], "bogus": 1}"#;
        let r: Result<SafeguardWasmCombination, _> = serde_json::from_str(bad);
        assert!(r.is_err(), "deny_unknown_fields must reject unknown top-level keys");
    }
}

#[cfg(test)]
mod normalize_safeguard_expected_group_domain_value_wire_tests {
    use super::*;

    const FIXTURE: &str = r#"{"slotOrder": [1, 2, 3], "accessoryCompatibleSetIds": [10, 20], "armorCompatibleSetIds": [30, 40], "allowedMainBySlot": {"1": [1, 2], "2": [3, 4]}, "allFactionIds": [100, 200]}"#;

    #[test]
    fn full_fixture_deserializes() {
        let _parsed: SafeguardWasmExpectedGroupDomainIn = serde_json::from_str(FIXTURE)
            .expect("fixture must deserialize");
        // Fields are private; fixture validity is confirmed by successful parse.
    }

    #[test]
    fn unknown_top_level_field_rejected() {
        let bad = r#"{"slotOrder": [], "accessoryCompatibleSetIds": [], "armorCompatibleSetIds": [], "allowedMainBySlot": {}, "allFactionIds": [], "bogus": 1}"#;
        let r: Result<SafeguardWasmExpectedGroupDomainIn, _> = serde_json::from_str(bad);
        assert!(r.is_err(), "deny_unknown_fields must reject unknown top-level keys");
    }
}

#[cfg(test)]
mod sort_safeguard_substats_value_wire_tests {
    const FIXTURE: &str = r#"[1, 2, 3]"#;

    #[test]
    fn full_fixture_deserializes() {
        let parsed: Vec<i64> = serde_json::from_str(FIXTURE)
            .expect("fixture must deserialize");
        assert_eq!(parsed, vec![1i64, 2, 3], "substats array");
    }
}

#[cfg(test)]
mod resolve_auto_rarity_code_for_builder_value_wire_tests {
    use super::*;
    const FIXTURE: &str = r#"{"autoRaritySupplementsThreshold":"2","autoMinRequiredRolls":true,"minRequiredRolls":3.5,"lockedMinRequiredRolls":2.0,"minCount":1.0,"earlyKeepMode":"full","substatsV":[10,11,12],"fixedSubstatsV":[10],"substatRollBoundsV":{"10":{"min":2.0},"11":{"min":3.0}},"allowedSubstats":[10,11,12,13]}"#;

    #[test]
    fn full_fixture_deserializes() {
        let parsed: AutoRarityResolveBuilderIn = serde_json::from_str(FIXTURE)
            .expect("fixture must deserialize");
        assert_eq!(parsed.auto_rarity_supplements_threshold, Some("2".to_string()));
        assert_eq!(parsed.auto_min_required_rolls, Some(true));
        assert_eq!(parsed.min_required_rolls, Some(3.5));
        assert_eq!(parsed.locked_min_required_rolls, Some(2.0));
        assert_eq!(parsed.min_count, Some(1.0));
        assert_eq!(parsed.early_keep_mode, Some("full".to_string()));
        assert_eq!(parsed.substats_v, vec![10i64, 11, 12]);
        assert_eq!(parsed.fixed_substats_v, vec![10i64]);
        assert_eq!(parsed.allowed_substats, vec![10i64, 11, 12, 13]);
        assert!(parsed.substat_roll_bounds_v.contains_key(&10i64));
    }

    #[test]
    fn unknown_top_level_field_rejected() {
        let bad = r#"{"substatsV":[],"fixedSubstatsV":[],"substatRollBoundsV":{},"allowedSubstats":[],"unknownField":true}"#;
        let r: Result<AutoRarityResolveBuilderIn, _> = serde_json::from_str(bad);
        assert!(r.is_err(), "deny_unknown_fields must reject unknown top-level keys");
    }
}

#[cfg(test)]
mod expand_auto_flex_rarity_branches_value_wire_tests {
    use super::*;
    const FIXTURE: &str = r#"{"rarityMode":"auto","rarityCode":5,"autoSubstatFlex":true,"autoMinCount":false,"minCount":2.0,"autoMinRequiredRolls":true,"minRequiredRolls":4.0,"substatsV":[20,21],"fixedSubstatsV":[20],"substatRollBoundsV":{"20":{"min":1.0,"max":3.0,"any":false,"not":false},"21":{"min":2.0,"max":4.0,"any":true,"not":false}},"minLevel":1.0,"maxLevel":20.0}"#;

    #[test]
    fn full_fixture_deserializes() {
        let parsed: AutoFlexRarityRecipeIn = serde_json::from_str(FIXTURE)
            .expect("fixture must deserialize");
        assert_eq!(parsed.rarity_mode, Some("auto".to_string()));
        assert_eq!(parsed.rarity_code, Some(5i64));
        assert_eq!(parsed.auto_substat_flex, Some(true));
        assert_eq!(parsed.auto_min_count, Some(false));
        assert_eq!(parsed.min_count, Some(2.0));
        assert_eq!(parsed.auto_min_required_rolls, Some(true));
        assert_eq!(parsed.min_required_rolls, Some(4.0));
        assert_eq!(parsed.substats_v, vec![20i64, 21]);
        assert_eq!(parsed.fixed_substats_v, vec![20i64]);
        assert_eq!(parsed.min_level, Some(1.0));
        assert_eq!(parsed.max_level, Some(20.0));
        assert!(parsed.substat_roll_bounds_v.contains_key(&20i64));
        assert!(parsed.substat_roll_bounds_v.contains_key(&21i64));
    }

    #[test]
    fn unknown_top_level_field_rejected() {
        let bad = r#"{"substatsV":[],"fixedSubstatsV":[],"substatRollBoundsV":{},"unknownField":"bogus"}"#;
        let r: Result<AutoFlexRarityRecipeIn, _> = serde_json::from_str(bad);
        assert!(r.is_err(), "deny_unknown_fields must reject unknown top-level keys");
    }
}

#[cfg(test)]
mod score_safeguard_candidates_value_wire_tests {
    use super::*;
    const FIXTURE: &str = r#"{"artifacts":[{"id":1,"slot":1,"set":1,"rank":1,"rarity":4,"level":20,"exactLevel":20,"faction":1,"mainStat":1,"equippedInCollection":false,"equippedInVault":false,"substats":[{"variant":2,"isFlat":false,"value":5.5,"rolls":2},{"variant":3,"isFlat":true,"value":100.0,"rolls":1}]}],"substats":[2,3],"weights":{"2":1.5,"3":1.0},"requiredCount":5}"#;

    #[test]
    fn full_fixture_deserializes() {
        let parsed: SafeguardWasmScorePreviewIn = serde_json::from_str(FIXTURE)
            .expect("fixture must deserialize");
        assert_eq!(parsed.artifacts.len(), 1);
        assert_eq!(parsed.artifacts[0].id, Some(1i64));
        assert_eq!(parsed.artifacts[0].slot, 1i64);
        assert_eq!(parsed.artifacts[0].set, 1i64);
        assert_eq!(parsed.artifacts[0].rank, 1i64);
        assert_eq!(parsed.artifacts[0].rarity, 4i64);
        assert_eq!(parsed.artifacts[0].level, 20i64);
        assert_eq!(parsed.artifacts[0].exact_level, Some(20i64));
        assert_eq!(parsed.artifacts[0].faction, 1i64);
        assert_eq!(parsed.artifacts[0].main_stat, 1i64);
        assert_eq!(parsed.artifacts[0].equipped_in_collection, false);
        assert_eq!(parsed.artifacts[0].equipped_in_vault, false);
        assert_eq!(parsed.artifacts[0].substats.len(), 2);
        assert_eq!(parsed.artifacts[0].substats[0].variant, 2i64);
        assert_eq!(parsed.artifacts[0].substats[0].is_flat, false);
        assert_eq!(parsed.artifacts[0].substats[0].value, 5.5);
        assert_eq!(parsed.artifacts[0].substats[0].rolls, Some(2i64));
        assert_eq!(parsed.substats, vec![2i64, 3]);
        assert_eq!(parsed.required_count, 5i64);
        assert!(parsed.weights.contains_key(&2i64));
        assert!(parsed.weights.contains_key(&3i64));
    }

    #[test]
    fn unknown_top_level_field_rejected() {
        let bad = r#"{"artifacts":[],"substats":[],"weights":{},"requiredCount":1,"unknownField":"bogus"}"#;
        let r: Result<SafeguardWasmScorePreviewIn, _> = serde_json::from_str(bad);
        assert!(r.is_err(), "deny_unknown_fields must reject unknown top-level keys");
    }
}

#[cfg(test)]
mod prepare_hsf_builder_recipe_value_wire_tests {
    use super::*;
    const FIXTURE: &str = r#"{"minCount":2,"autoSubstatFlex":true,"flexEligible":true,"substatsV":[10,11,12],"fixedSubstatsV":[10],"allowedSubstats":[10,11,12,13],"substatRollBoundsV":{"10":{"min":1.0,"max":5.0,"any":false,"not":false},"11":{"min":2.0,"max":4.0,"any":true,"not":false}},"substatRollTargetsV":{"10":{"base":3.5,"increments":[1.0,2.0]},"11":{"base":2.5}},"substatTargetByVariant":{"10":50,"11":40},"factoryBaseByVariantForStar":{"10":20,"11":15},"variantPriority":[10,11,12,13]}"#;

    #[test]
    fn full_fixture_deserializes() {
        // Fixture successfully parses; all required and optional fields present.
        let _parsed: PrepareHsfBuilderRecipeIn = serde_json::from_str(FIXTURE)
            .expect("fixture must deserialize");
    }

    #[test]
    fn unknown_top_level_field_rejected() {
        let bad = r#"{"minCount":2,"autoSubstatFlex":true,"flexEligible":true,"substatsV":[],"fixedSubstatsV":[],"allowedSubstats":[],"substatRollBoundsV":{},"substatRollTargetsV":{},"substatTargetByVariant":{},"factoryBaseByVariantForStar":{},"variantPriority":[],"unknownField":"bogus"}"#;
        let r: Result<PrepareHsfBuilderRecipeIn, _> = serde_json::from_str(bad);
        assert!(r.is_err(), "deny_unknown_fields must reject unknown top-level keys");
    }
}

#[cfg(test)]
mod build_hsf_rules_runtime_value_wire_tests {
    use super::*;
    const FIXTURE: &str = r#"{"recipeId":100,"keep":true,"useFlag":true,"artifactSetIds":[1,2],"artifactTypeIds":[3,4,5],"rankCode":4,"rarityCode":5,"factionCode":1,"mainChoices":[{"id":1,"f":10}],"emitAnyMainWhenNoChoices":false,"baseline":"test","effectiveStart":1,"suppressRollThresholds":false,"levelWindowMin":1,"levelWindowMax":20,"requiredV":[10],"optionalPoolV":[11,12],"selectedPoolV":[10,11,12],"notSubstatsV":[20],"flexActive":true,"aggregateMinActive":true,"minTargetCount":2,"maxTargetCount":4,"aggregateTargetsLocked":false,"aggregateMinValue":5,"lockedMinActive":false,"lockedMinValue":0,"substatRollBoundsV":{"10":{"min":1.0,"max":5.0,"any":false,"not":false}},"targetEntriesByVariant":{"10":{"base":3.0,"increments":[1.0,2.0]}},"currentBaseByVariant":{"10":20},"factoryBaseByVariant":{"10":25},"targetBaseOverrideByVariant":{"10":30},"rarityMode":"auto","earlyKeepMode":"full","autoRaritySupplementsThreshold":"3","earlyMode":"early","emissionLimit":100}"#;

    #[test]
    fn full_fixture_deserializes() {
        // Fixture successfully parses; all required and optional fields present.
        let _parsed: BuildHsfRulesRuntimeIn = serde_json::from_str(FIXTURE)
            .expect("fixture must deserialize");
    }

    #[test]
    fn unknown_top_level_field_rejected() {
        let bad = r#"{"useFlag":true,"rankCode":4,"rarityCode":5,"factionCode":1,"mainChoices":[],"emitAnyMainWhenNoChoices":false,"effectiveStart":1,"suppressRollThresholds":false,"levelWindowMin":1,"levelWindowMax":20,"requiredV":[],"optionalPoolV":[],"selectedPoolV":[],"flexActive":true,"aggregateMinActive":true,"minTargetCount":2,"maxTargetCount":4,"aggregateTargetsLocked":false,"aggregateMinValue":5,"lockedMinActive":false,"lockedMinValue":0,"substatRollBoundsV":{},"targetEntriesByVariant":{},"currentBaseByVariant":{},"factoryBaseByVariant":{},"targetBaseOverrideByVariant":{},"earlyMode":"early","unknownField":"bogus"}"#;
        let r: Result<BuildHsfRulesRuntimeIn, _> = serde_json::from_str(bad);
        assert!(r.is_err(), "deny_unknown_fields must reject unknown top-level keys");
    }
}
