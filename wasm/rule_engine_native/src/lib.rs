// rule_engine_native — C-ABI entry points for generating HSF sell-file rules from SFC JSON.
//
// Two exported symbols:
//   sfc_generate(input_json: *const c_char) -> *mut c_char
//   sfc_free(ptr: *mut c_char)
//
// The pipeline mirrors the TypeScript → WASM flow but accepts raw SFC file text
// directly, bypassing the browser layer.  All label parsing and builder logic
// delegate to rule_engine_core — no logic is duplicated here.
//
// Build as Windows DLL:
//   cargo build --release --target x86_64-pc-windows-msvc -p rule_engine_native
// Build as Linux .so for WSL testing:
//   cargo build -p rule_engine_native

use std::collections::BTreeMap;
use std::ffi::{CStr, CString, c_char};
use serde::{Deserialize, Serialize};

use rule_engine_core::{
    parse_sfc,
    build_hsf_rules_for_recipe,
    collect_and_compute_safeguard_protection_core,
    compute_merged_rules_core,
    compute_improvement_chance_core,
    ComputeMergedRulesIn,
    SafeguardCollectRowIn,
    SafeguardWasmArtifactIn,
    ImprovementChanceEntry,
    TestItemRaw,
    PreviewExtrasRaw,
    RuleRaw,
};
use rule_engine_core::safeguards::fast_path_types::SafeguardWasmSubstatIn;

// Public so the integration parity test (tests/parity.rs) can drive the normaliser directly.
pub mod artifact_log;
use artifact_log::{
    NativeArtifactIn,
    RawArtifactLogRow,
    RawChampionRow,
    build_equipped_by_artifact_map,
    parse_artifact_log_array,
};

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

// Top-level DLL input: raw SFC file text + the RAW RSL-Helper wire payloads.
//
// `artifacts` and `champions` are the exact shapes RSL Helper sends over its JSON-RPC
// endpoint (kindId/rankId/primary/secondary/…, and champions[].artifacts slot-maps),
// so RSL Helper can pipe its packets straight in. The DLL normalises them internally
// (see artifact_log.rs) — the caller does NOT pre-run the app's TypeScript.
#[derive(Debug, Deserialize)]
struct NativeInput {
    // Raw SFC JSON as a string (the .sfc file contents).  Passed verbatim to parse_sfc.
    sfc:       String,
    // Raw ArtifactLog rows to evaluate; may be empty (rules still generated, chances empty).
    #[serde(default)]
    artifacts: Vec<RawArtifactLogRow>,
    // Raw champion rows — only their id + artifacts slot-map are read, to fill cID
    // (equipped_in_collection). Optional: absent → every artifact treated as unequipped.
    #[serde(default)]
    champions: Vec<RawChampionRow>,
}

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

// DLL output returned as a UTF-8 JSON string.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeOutput {
    // Merged HSF rules ready for .hsf download — same array the app produces.
    rules:           Vec<RuleRaw>,
    // Per-artifact improvement-chance entries; empty when safeguards are disabled.
    improvement_chances: Vec<ImprovementChanceEntry>,
}

// Error envelope used on all failure paths — never returns null from sfc_generate.
#[derive(Debug, Serialize)]
struct NativeError {
    error: String,
}

// ---------------------------------------------------------------------------
// Artifact normalisation helpers
// ---------------------------------------------------------------------------

// Encode (stat_id, flat_bit) into the StatVariant compact integer.
// Encoding: high 8 bits = stat_id, low bit = is_flat.  Matches generated_domain_constants.rs.
fn encode_variant(stat_id: i64, flat_bit: i64) -> i64 {
    (stat_id << 8) | (flat_bit & 1)
}

// Normalise one substat slot.  Returns None when stat_id is absent or zero (empty slot).
fn make_substat(id: Option<i64>, lvl: Option<i64>, fl: Option<i64>) -> Option<SafeguardWasmSubstatIn> {
    // Skip empty or sentinel-zero slots.
    let stat_id = id.filter(|&v| v > 0)?;
    let flat_bit = fl.unwrap_or(0);
    let variant  = encode_variant(stat_id, flat_bit);
    // s{n}lvl is the roll count; actual substat values are not in the compact row format.
    // Presence-based safeguard matching still works; value-threshold checks will not fire.
    Some(SafeguardWasmSubstatIn {
        variant,
        is_flat: flat_bit != 0,
        value:   0.0,
        rolls:   lvl.filter(|&r| r >= 0),
    })
}

// Normalise a NativeArtifactIn into a (SafeguardWasmArtifactIn, TestItemRaw) pair.
// Both representations are needed: SafeguardWasmArtifactIn for safeguard logic,
// TestItemRaw for the item-evaluator matcher.
fn normalize_artifact(a: &NativeArtifactIn) -> (SafeguardWasmArtifactIn, TestItemRaw) {
    // Resolve set id from the column appropriate for the artifact's slot range.
    let set    = if a.slot > 6 { a.accset.unwrap_or(0) } else { a.aset.unwrap_or(0) };
    let rank   = a.rank.unwrap_or(0);
    let rarity = a.rarity.unwrap_or(0);
    let level  = a.lvl.unwrap_or(0);

    // Encode main stat variant; 0 falls back to SAFEGUARD_MAIN_ANY in the core.
    let main_variant = match a.mid.filter(|&v| v > 0) {
        Some(id) => encode_variant(id, a.mfl.unwrap_or(0)),
        None     => 0,
    };

    // Build the four substat slots; empty slots produce None and are skipped.
    let substats: Vec<SafeguardWasmSubstatIn> = [
        make_substat(a.s1id, a.s1lvl, a.s1fl),
        make_substat(a.s2id, a.s2lvl, a.s2fl),
        make_substat(a.s3id, a.s3lvl, a.s3fl),
        make_substat(a.s4id, a.s4lvl, a.s4fl),
    ].into_iter().flatten().collect();

    // sub_values: (variant, value=0.0) per substat so variant-presence matching works
    // in the TestItemRaw evaluator even without actual roll values.
    let sub_values: Vec<(i64, f64)> = substats.iter().map(|s| (s.variant, 0.0)).collect();

    let artifact = SafeguardWasmArtifactIn {
        id:                    a.id,
        slot:                  a.slot,
        set,
        rank,
        rarity,
        level,
        exact_level:           Some(level),
        faction:               a.faction,
        main_stat:             main_variant,
        equipped_in_collection: a.c_id.is_some(),
        equipped_in_vault:     false,
        substats,
    };
    let item = TestItemRaw {
        slot: a.slot,
        set,
        rank,
        rarity,
        level,
        faction:   Some(a.faction),
        main:      if main_variant != 0 { Some(main_variant) } else { None },
        sub_values: if sub_values.is_empty() { None } else { Some(sub_values) },
        item_id:   a.id,
        // preview_extras carries the item_id so safeguard click-through navigation works.
        preview_extras: a.id.map(|id| PreviewExtrasRaw { id: Some(id) }),
    };
    (artifact, item)
}

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------

fn run(input_json: &str) -> Result<String, String> {
    // 1. Deserialise the outer NativeInput envelope.
    let input: NativeInput = serde_json::from_str(input_json)
        .map_err(|e| format!("Invalid input JSON: {e}"))?;

    // 1b. Normalise the raw RSL-Helper wire payloads into compact artifact rows.
    //     Build the artifact→champion equipped map first (for cID / equipped_in_collection),
    //     then run the raw ArtifactLog rows through the same parser logic the app uses.
    let equipped_by_artifact = build_equipped_by_artifact_map(&input.champions);
    let compact_artifacts = parse_artifact_log_array(&input.artifacts, &equipped_by_artifact);

    // 2. Parse the SFC string into normalised builder inputs.
    //    parse_sfc handles label → code conversion, all SFC schema variants, and
    //    the sub-minima table used by auto-min-count logic.
    let parsed = parse_sfc(&input.sfc)
        .map_err(|e| format!("SFC parse error: {e}"))?;

    // 3. Derive recipe mode strings (one per recipe, indexed).
    //    Used by the safeguard collector to skip disabled / separator recipes.
    let recipe_modes: Vec<String> = parsed.recipes.iter()
        .map(|r| {
            if r.is_separator   { "separator".to_string() }
            else if !r.use_flag { "disabled".to_string() }
            else if r.keep      { "keep".to_string() }
            else                { "sell".to_string() }
        })
        .collect();

    // 4. Build HSF rules for each recipe; accumulate into custom_rules.
    //    Recipe index is stored in each emitted rule for safeguard bucketing.
    let minima_ref = parsed.minima.as_ref();
    let mut custom_rules: Vec<RuleRaw> = Vec::new();
    for (idx, recipe) in parsed.recipes.iter().enumerate() {
        let mut rules = build_hsf_rules_for_recipe(recipe, minima_ref, Some(idx as i64))
            .map_err(|e| format!("Recipe {idx} build error: {e}"))?;
        custom_rules.append(&mut rules);
    }

    // 5. Normalise the input artifacts into SafeguardCollectRowIn rows.
    //    Each row carries both the canonical SafeguardWasmArtifactIn and the
    //    TestItemRaw needed by the item-evaluator matcher.
    let rows: Vec<SafeguardCollectRowIn> = compact_artifacts.iter()
        .map(|a| {
            let (artifact, item) = normalize_artifact(a);
            SafeguardCollectRowIn {
                item,
                // base_match fields: no pre-evaluated match from outside; the safeguard
                // collector will evaluate each artifact from scratch against the rules.
                base_match_defined: false,
                base_match:         None,
                artifact,
            }
        })
        .collect();

    // 6. Run safeguard detection when safeguards are active and data is present.
    //    The resulting snapshot drives safeguard-injected sell rules in step 7.
    let safeguard_detection = if parsed.safeguards_enabled
        && !parsed.safeguard_rules.is_empty()
        && !rows.is_empty()
    {
        let combined = collect_and_compute_safeguard_protection_core(
            rows.clone(),
            custom_rules.clone(),
            recipe_modes,
            None,                           // ignore_safeguard_recipe_indices
            parsed.safeguard_rules.clone(),
            None,                           // expected_payload
            true,
            0.0,                            // now (timestamp; not used for rule logic)
            BTreeMap::new(),                // improvement_chances: empty = threshold gating disabled
        ).map_err(|e| format!("Safeguard detection error: {e}"))?;
        Some(combined.detection)
    } else {
        None
    };

    // 7. Merge custom rules + safeguard-injected rules into the final HSF rule list.
    let merged_rules = compute_merged_rules_core(ComputeMergedRulesIn {
        base_rules:                  vec![],
        custom_rules,
        final_sell_remainder:        parsed.final_sell,
        all_known_set_ids:           parsed.all_known_set_ids,
        omit_disabled_before_safeguards: false,
        dedupe_before_safeguards:    false,
        safeguard_enabled:           parsed.safeguards_enabled,
        safeguard_rules:             parsed.safeguard_rules.clone(),
        safeguard_detection,
        safeguard_recipe_id_base:    None,
    });

    // 8. Compute per-artifact improvement-chance percentages.
    //    Returns an empty vec when safeguards are disabled or no rules/rows are present.
    //    debug=false: the DLL output schema carries only the entry vec; perf diagnostics
    //    are discarded (they are dev-only instrumentation used by the WASM worker).
    let (improvement_chances, _diag) = compute_improvement_chance_core(
        &rows,
        parsed.safeguard_rules,
        parsed.safeguards_enabled,
        false,
    );

    // 9. Serialise and return the output as a JSON string.
    let output = NativeOutput { rules: merged_rules, improvement_chances };
    serde_json::to_string(&output).map_err(|e| format!("Serialise error: {e}"))
}

// ---------------------------------------------------------------------------
// C ABI
// ---------------------------------------------------------------------------

/// Generate merged HSF rules and improvement-chance entries from an SFC + artifact list.
///
/// `input_json` must be a valid UTF-8, null-terminated JSON string matching `NativeInput`:
/// ```json
/// { "sfc": "<SFC file contents as a JSON string>", "artifacts": [ ... ] }
/// ```
///
/// Returns a heap-allocated null-terminated UTF-8 JSON string.  On any error the
/// string is `{"error":"<message>"}`.  **The caller must release the pointer with
/// `sfc_free` — do not call `free()` directly.**
#[no_mangle]
pub extern "C" fn sfc_generate(input_json: *const c_char) -> *mut c_char {
    // Safety: caller guarantees a valid, null-terminated C string for the lifetime
    //         of this function call.
    let json_str = unsafe {
        if input_json.is_null() {
            return error_cstring("input_json pointer is null");
        }
        match CStr::from_ptr(input_json).to_str() {
            Ok(s)  => s,
            Err(_) => return error_cstring("input_json is not valid UTF-8"),
        }
    };
    let json_out = match run(json_str) {
        Ok(s)  => s,
        Err(e) => serde_json::to_string(&NativeError { error: e })
            .unwrap_or_else(|_| r#"{"error":"serialisation failed"}"#.to_string()),
    };
    // Null bytes in output are extremely unlikely but handled gracefully.
    CString::new(json_out)
        .unwrap_or_else(|_| CString::new(r#"{"error":"output contains null byte"}"#).unwrap())
        .into_raw()
}

/// Release a string pointer previously returned by `sfc_generate`.
/// Passing null is safe and is a no-op.
#[no_mangle]
pub extern "C" fn sfc_free(ptr: *mut c_char) {
    if ptr.is_null() { return; }
    // Safety: ptr was allocated by CString::into_raw in sfc_generate.
    unsafe { drop(CString::from_raw(ptr)) };
}

// Helper: build an error JSON CString without panicking.
fn error_cstring(msg: &str) -> *mut c_char {
    let payload = serde_json::to_string(&NativeError { error: msg.to_string() })
        .unwrap_or_else(|_| r#"{"error":"unknown"}"#.to_string());
    CString::new(payload)
        .unwrap_or_else(|_| CString::new(r#"{"error":"unknown"}"#).unwrap())
        .into_raw()
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // Minimal SFC: one "keep 5★ Epic with any SPD" recipe, safeguards disabled.
    const MINIMAL_SFC: &str = r#"{
        "Version": "1.0",
        "Recipes": [
            {
                "keep": true,
                "Rank": "5★",
                "Rarity": "Epic",
                "substats": ["SPD"],
                "minCount": 1
            }
        ],
        "Safeguards": [],
        "SafeguardsEnabled": false
    }"#;

    // Two sample artifacts in the RAW RSL-Helper wire shape (kindId/rankId/primary/secondary):
    // first matches (5★ Epic, has SPD), second does not. SPD is stat id 4, flat (isAbsolute=1).
    const SAMPLE_ARTIFACTS_JSON: &str = r#"[
        {
            "id": 1001,
            "kindId": 1,
            "rankId": 5,
            "rarityId": 4,
            "level": 16,
            "setKindId": 10,
            "primary": { "id": 1, "isAbsolute": 0 },
            "secondary": [ { "id": 4, "level": 4, "isAbsolute": 1 } ]
        },
        {
            "id": 1002,
            "kindId": 2,
            "rankId": 4,
            "rarityId": 3,
            "level": 0,
            "setKindId": 5,
            "primary": { "id": 2, "isAbsolute": 0 },
            "secondary": [ { "id": 2, "level": 1, "isAbsolute": 0 } ]
        }
    ]"#;

    // Build a NativeInput JSON string from the SFC content string and a raw artifact array.
    fn make_input(sfc_content: &str, artifacts_json: &str) -> String {
        // sfc_content is the raw SFC JSON — it must be serialised as a JSON string value.
        let sfc_str = serde_json::to_string(sfc_content).unwrap();
        format!(r#"{{"sfc": {sfc_str}, "artifacts": {artifacts_json}}}"#)
    }

    #[test]
    fn pipeline_returns_nonempty_rules() {
        let input = make_input(MINIMAL_SFC, SAMPLE_ARTIFACTS_JSON);
        let result = run(&input).expect("pipeline should not error");
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert!(
            parsed.get("rules").and_then(|v| v.as_array()).map(|a| !a.is_empty()).unwrap_or(false),
            "expected non-empty rules array; got: {result}"
        );
        assert!(
            parsed.get("improvementChances").is_some(),
            "expected improvementChances field in output"
        );
    }

    #[test]
    fn pipeline_empty_artifacts() {
        // Rules should still be generated even with no artifacts.
        let input = make_input(MINIMAL_SFC, "[]");
        let result = run(&input).expect("empty-artifacts pipeline should not error");
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert!(parsed.get("error").is_none(), "unexpected error: {result}");
        assert!(
            parsed.get("rules").and_then(|v| v.as_array()).map(|a| !a.is_empty()).unwrap_or(false),
            "rules should be present even with no artifacts"
        );
    }

    #[test]
    fn sfc_generate_c_abi() {
        // Verify the C-ABI wrapper produces valid JSON and sfc_free does not crash.
        let input = make_input(MINIMAL_SFC, SAMPLE_ARTIFACTS_JSON);
        let c_input = CString::new(input).unwrap();
        let ptr = sfc_generate(c_input.as_ptr());
        assert!(!ptr.is_null(), "sfc_generate must not return null");
        let output = unsafe { CStr::from_ptr(ptr).to_str().unwrap().to_string() };
        sfc_free(ptr);
        let parsed: serde_json::Value = serde_json::from_str(&output).unwrap();
        assert!(parsed.get("error").is_none(), "unexpected error from sfc_generate: {output}");
    }

    #[test]
    fn sfc_generate_null_input() {
        // Null pointer must return an error JSON, not crash.
        let ptr = sfc_generate(std::ptr::null());
        assert!(!ptr.is_null());
        let output = unsafe { CStr::from_ptr(ptr).to_str().unwrap().to_string() };
        sfc_free(ptr);
        let parsed: serde_json::Value = serde_json::from_str(&output).unwrap();
        assert!(parsed.get("error").is_some(), "null input must yield error field");
    }
}
