// sfc_engine — C-ABI entry points for deciding keep/sell from a sellfile + raw gear.
//
// Four exported symbols:
//   sfc_decide(input_json: *const c_char) -> *mut c_char
//   sfc_build_hsf(input_json: *const c_char) -> *mut c_char
//   sfc_version() -> *mut c_char
//   sfc_free(ptr: *mut c_char)
//
// The pipeline mirrors the TypeScript → WASM flow but accepts raw SFC file text
// directly, bypassing the browser layer.  All label parsing and builder logic
// delegate to rule_engine_core — no logic is duplicated here.
//
// Build as Windows DLL:
//   npm run sfc-engine:build
// Build as Linux .so for WSL testing:
//   cargo build -p sfc_engine

use serde::{Deserialize, Serialize};
use std::ffi::{c_char, CStr, CString};

use rule_engine_core::safeguards::fast_path_types::SafeguardWasmSubstatIn;
use rule_engine_core::{
    is_accessory_slot, main_to_variant, resolve_set_id, round_stat_value, snap_level_to_milestone, sub_to_variant,
    ImprovementChanceEntry, PreviewExtrasRaw, RuleRaw, SafeguardWasmArtifactIn, TestItemRaw, STAT_ID_ANY,
};

// Public so the integration parity test (tests/parity.rs) can drive the normaliser directly.
pub mod artifact_log;
// The `.hsf` writer behind sfc_build_hsf; public so tests can render a rule list directly.
pub mod hsf_export;
// The decision pipeline, split into named stages; public so the end-to-end parity tests
// and the bench example drive the same code the ABI runs.
pub mod pipeline;
use artifact_log::{
    build_equipped_by_artifact_map, parse_artifact_log_array, NativeArtifactIn, RawArtifactLogRow, RawChampionRow,
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
// camelCase + deny_unknown_fields for the same reason NativeHsfInput carries them (see the
// comment on that struct): the documented wire keys are `improvementChances` / `rules`, and
// without the rename serde looks for `improvement_chances`, ignores the key the caller
// actually sent, and applies the default — answering a request for improvement projections
// with an empty array and no error at all. `deny_unknown_fields` turns a misspelled switch
// into a refusal rather than a silently wrong response.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeInput {
    // Raw SFC JSON as a string (the .sfc file contents).  Passed verbatim to parse_sfc.
    sfc: String,
    // Raw ArtifactLog rows to evaluate; may be empty (rules still generated, chances empty).
    #[serde(default)]
    artifacts: Vec<RawArtifactLogRow>,
    // Raw champion rows — only their id + artifacts slot-map are read, to fill cID
    // (equipped_in_collection). Optional: absent → every artifact treated as unequipped.
    #[serde(default)]
    champions: Vec<RawChampionRow>,
    // Opt IN to the per-artifact improvement-chance projection. Off by default because it
    // costs more than the whole keep/sell chain on a real vault and does not change a
    // single verdict; a caller that does not display it should leave it off.
    #[serde(default)]
    improvement_chances: bool,
    // Opt OUT of returning the merged rule list, for a caller that only wants decisions
    // and does not need to write a .hsf.
    #[serde(default = "default_true")]
    rules: bool,
}

// serde needs a function for a non-false default; `rules` is returned unless refused.
fn default_true() -> bool {
    true
}

// Top-level input for `sfc_build_hsf`: the same sellfile + gear `sfc_decide` takes, plus
// the switches that say what goes into the generated file.
//
// The gear matters even though a `.hsf` describes rules rather than pieces: a safeguard
// rules turn into keep rows for the specific items they rescue, so a request that sends no
// gear produces a file with no safeguards in it, whatever `safeguards` says.
// camelCase so `finalSell` on the wire reaches `final_sell` here. Without it serde looks
// for the snake_case key, silently ignores the one a caller actually sends, and applies the
// default — turning a request to omit the catch-all into a file that still sells everything.
// `deny_unknown_fields` makes that class of mistake an error rather than a wrong file: a
// misspelled switch is refused instead of quietly defaulting to on.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeHsfInput {
    // Raw SFC JSON as a string — identical to the decide request's field.
    sfc: String,
    #[serde(default)]
    artifacts: Vec<RawArtifactLogRow>,
    #[serde(default)]
    champions: Vec<RawChampionRow>,
    // The three content switches, all defaulting ON so an omitted field yields the same
    // file the app itself exports for this sellfile.
    #[serde(default = "default_true")]
    recipes: bool,
    #[serde(default = "default_true")]
    safeguards: bool,
    #[serde(default = "default_true")]
    final_sell: bool,
}

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

// DLL output returned as a UTF-8 JSON string.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeOutput {
    // Per-artifact keep/sell decision — the answer a consumer actually wants.
    verdicts: Vec<VerdictOut>,
    // Per-artifact safeguard standing, one row per (artifact, safeguard rule) it ranked in.
    safeguard_ranks: Vec<SafeguardRankOut>,
    // Per-artifact improvement-chance entries; empty when safeguards are disabled.
    improvement_chances: Vec<ImprovementChanceEntry>,
    // Merged HSF rules, so a caller can still export a .hsf from the same call.
    rules: Vec<RuleRaw>,
}

// One artifact's decision on the wire.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VerdictOut {
    artifact_id: i64,
    keep: bool,
    // false = no rule covered this piece; it is kept by DEFAULT rather than by decision.
    matched: bool,
    // RecipeName of the deciding rule; null when unnamed or unmatched.
    rule_name: Option<String>,
    // Kept only because a safeguard overrode a rule that would have sold it.
    safeguarded: bool,
}

impl From<&pipeline::Verdict> for VerdictOut {
    fn from(v: &pipeline::Verdict) -> Self {
        Self {
            artifact_id: v.artifact_id,
            keep: v.keep,
            matched: v.matched,
            rule_name: v.rule_name.clone(),
            safeguarded: v.safeguarded,
        }
    }
}

// One artifact's standing under one safeguard rule, on the wire.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SafeguardRankOut {
    artifact_id: i64,
    // 1-based position of the safeguard rule in the sellfile's own list.
    rule_ordinal: i64,
    score: f64,
    // 1-based across ALL of that rule's buckets.
    candidate_rank: u32,
    // 1-based within this piece's own bucket.
    bucket_rank: u32,
    // "{slot}:{set}:{mainStat}:{faction}" — the bucket the rule ranked this piece in.
    bucket_key: String,
    is_within_quota: bool,
    // null when the rule is ungrouped; grouped rules pool their quota.
    group_id: Option<String>,
    substat_buckets: Vec<SubstatBucketOut>,
}

impl From<&pipeline::SafeguardRank> for SafeguardRankOut {
    fn from(r: &pipeline::SafeguardRank) -> Self {
        Self {
            artifact_id: r.artifact_id,
            rule_ordinal: r.rule_ordinal,
            score: r.score,
            candidate_rank: r.candidate_rank,
            bucket_rank: r.bucket_rank,
            bucket_key: r.bucket_key.clone(),
            is_within_quota: r.is_within_quota,
            group_id: r.group_id.clone(),
            substat_buckets: r.substat_buckets.iter().map(SubstatBucketOut::from).collect(),
        }
    }
}

// One substat sub-bucket standing, on the wire.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SubstatBucketOut {
    variant: i64,
    bucket_rank: u32,
    is_within_quota: bool,
}

impl From<&pipeline::SubstatBucket> for SubstatBucketOut {
    fn from(b: &pipeline::SubstatBucket) -> Self {
        Self {
            variant: b.variant,
            bucket_rank: b.bucket_rank,
            is_within_quota: b.is_within_quota,
        }
    }
}

// `sfc_build_hsf` output. The file arrives as one string so a caller writes it straight to
// disk; `ruleCount` is reported beside it because "how many rules did that produce" is the
// one thing a caller would otherwise have to parse the whole file to learn.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeHsfOutput {
    hsf: String,
    rule_count: usize,
}

// Error envelope used on all failure paths — neither entry point ever returns null.
#[derive(Debug, Serialize)]
struct NativeError {
    error: String,
}

// ---------------------------------------------------------------------------
// Artifact normalisation helpers
// ---------------------------------------------------------------------------

// Interpret a raw wire flat flag the way the app's `isFlatFlag` does: ANY non-zero value
// means flat, not just exactly 1. Masking with `& 1` instead would read a flag of 2 as
// percent while the app reads it as flat, flipping both the encoded variant and the
// percent scaling applied to the value.
fn is_flat_flag(flag: Option<i64>) -> bool {
    flag.unwrap_or(0) != 0
}

// Normalise one substat slot.  Returns None when stat_id is absent or zero (empty slot),
// or when the id is one the shared encoder does not recognise.
//
// `value` is the normalised rule value carried on the compact row (base + mythical,
// pre-glyph, rounded the way the app's importer rounds). It is what every numeric
// threshold compares against — a zero here silently turns "SPD >= 12" into a rule that
// can never fire, which is a wrong answer rather than a limitation.
fn make_substat(id: Option<i64>, lvl: Option<i64>, fl: Option<i64>, value: f64) -> Option<SafeguardWasmSubstatIn> {
    // Skip empty or sentinel-zero slots.
    let stat_id = id.filter(|&v| v > 0)?;
    let is_flat = is_flat_flag(fl);
    // Encode through the workspace SSOT rather than shifting the bits here. The shared
    // encoder CANONICALIZES the flat suffix per stat family (SPD/RES/ACC are always flat,
    // CR/CDMG always percent) and rejects ids it does not know; a literal `(id << 8) | fl`
    // therefore produces variants for those families that no rule can ever name, so the
    // threshold lookup misses and the piece falls through to the final-sell catch-all.
    let variant = sub_to_variant(stat_id, i64::from(is_flat));
    // An unknown id decodes to Any; the app's `extractSubstat` drops that slot rather than
    // inventing a variant for it, so a future game stat cannot fabricate a phantom substat.
    if variant == STAT_ID_ANY {
        return None;
    }
    Some(SafeguardWasmSubstatIn {
        variant,
        is_flat,
        value,
        rolls: lvl.filter(|&r| r >= 0),
    })
}

// Normalise a NativeArtifactIn into a (SafeguardWasmArtifactIn, TestItemRaw) pair.
// Both representations are needed: SafeguardWasmArtifactIn for safeguard logic,
// TestItemRaw for the item-evaluator matcher.
fn normalize_artifact(a: &NativeArtifactIn) -> (SafeguardWasmArtifactIn, TestItemRaw) {
    // The set id comes from `aset` (setKindId) for EVERY slot, accessories included.
    //
    // `accset` carries requiredFraction — the faction code, not a set id — so reading it
    // here handed every accessory a set id in the faction range instead of its real set,
    // and made the setless sentinel unreachable. The shared resolver then promotes a
    // setless ACCESSORY to ACCESSORY_NO_SET_ID (which real sellfiles name) while leaving
    // a setless chestplate at a plain 0.
    let set = resolve_set_id(a.slot, a.aset.unwrap_or(0));
    let rank = a.rank.unwrap_or(0);
    let rarity = a.rarity.unwrap_or(0);
    // Rules match a level by EXACT equality against one milestone, so a live level has to
    // be snapped first or every off-milestone piece matches no level rule at all.
    let raw_level = a.lvl.unwrap_or(0);
    let level = snap_level_to_milestone(raw_level);

    // Encode main stat variant; 0 falls back to SAFEGUARD_MAIN_ANY in the core.
    //
    // Main stats go through `main_to_variant`, NOT the substat encoder: the two disagree
    // for the ids each family allows (only main stats carry STAT_ID_HP_ATK_DEF, and the
    // anomalous mode-damage ids are substat-only), so sharing one encoder here would gate
    // the main stat against the wrong variant.
    let main_variant = match a.mid.filter(|&v| v > 0) {
        Some(id) => {
            let variant = main_to_variant(id, i64::from(is_flat_flag(a.mfl)));
            // Any = an id no main stat can carry; treat it as absent so the piece matches
            // main-stat-agnostic rules instead of one specific wrong variant.
            if variant == STAT_ID_ANY {
                0
            } else {
                variant
            }
        }
        None => 0,
    };

    // Build the four substat slots; empty slots produce None and are skipped. The raw stat
    // id travels alongside each slot because the fold below needs it to re-round, and the
    // encoded variant alone cannot be decoded back to it.
    let slots = [
        (a.s1id, a.s1lvl, a.s1fl, a.sub_values[0]),
        (a.s2id, a.s2lvl, a.s2fl, a.sub_values[1]),
        (a.s3id, a.s3lvl, a.s3fl, a.sub_values[2]),
        (a.s4id, a.s4lvl, a.s4fl, a.sub_values[3]),
    ];
    let normalized: Vec<(i64, bool, SafeguardWasmSubstatIn)> = slots
        .iter()
        .filter_map(|&(id, lvl, fl, value)| {
            let substat = make_substat(id, lvl, fl, value)?;
            // `make_substat` already rejected absent/unknown ids, so the id is real here.
            Some((id.unwrap_or(0), substat.is_flat, substat))
        })
        .collect();
    let substats: Vec<SafeguardWasmSubstatIn> = normalized.iter().map(|(_, _, s)| s.clone()).collect();

    // sub_values the evaluator thresholds against, folding duplicate variants the way the
    // app's buildSubValueMap does — two slots can carry the same variant, and a rule
    // reasons about the consolidated total rather than either half.
    //
    // The fold mirrors all three steps of that SSOT: skip near-zero magnitudes so the map
    // does not carry meaningless entries, and RE-ROUND the accumulated sum. Each half was
    // rounded already, but summing two rounded floats re-introduces binary error (9.06 +
    // 0 lands at 9.059999999999999), and the evaluator's Equal test is an exact
    // `(have - want).abs() < f64::EPSILON` that such a value fails outright.
    let mut sub_values: Vec<(i64, f64)> = Vec::with_capacity(normalized.len());
    for (stat_id, is_flat, substat) in &normalized {
        if substat.value.abs() <= 0.0 {
            continue;
        }
        match sub_values.iter_mut().find(|(variant, _)| *variant == substat.variant) {
            Some(entry) => entry.1 = round_stat_value(*stat_id, *is_flat, entry.1 + substat.value),
            None => sub_values.push((substat.variant, round_stat_value(*stat_id, *is_flat, substat.value))),
        }
    }

    let artifact = SafeguardWasmArtifactIn {
        id: a.id,
        slot: a.slot,
        set,
        rank,
        rarity,
        level,
        // The snapped level is what rules match; exact_level keeps the piece's REAL
        // upgrade state, which safeguard scoring and improvement chance reason about.
        exact_level: Some(raw_level),
        faction: a.faction,
        main_stat: main_variant,
        equipped_in_collection: a.c_id.is_some(),
        equipped_in_vault: false,
        substats,
    };
    let item = TestItemRaw {
        slot: a.slot,
        set,
        rank,
        rarity,
        level,
        // Only accessories carry a faction; elsewhere None so faction rules skip the
        // item rather than matching it against a meaningless 0.
        faction: if is_accessory_slot(a.slot) && a.faction > 0 {
            Some(a.faction)
        } else {
            None
        },
        // Carry the Ore rework count through so if_reworked / if_not_reworked rule
        // gates decide the same way here as they do in the TS engine.
        reroll_count: a.reroll_count,
        main: if main_variant != 0 { Some(main_variant) } else { None },
        sub_values: if sub_values.is_empty() { None } else { Some(sub_values) },
        item_id: a.id,
        // preview_extras carries the item_id so safeguard click-through navigation works.
        preview_extras: a.id.map(|id| PreviewExtrasRaw { id: Some(id) }),
    };
    (artifact, item)
}

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------

fn run(input_json: &str) -> Result<String, String> {
    // 1. Deserialise the outer envelope.
    let input: NativeInput = serde_json::from_str(input_json).map_err(|e| format!("Invalid input JSON: {e}"))?;

    // 2. Normalise the raw wire payloads into compact artifact rows. The champion rows
    //    only supply the artifact->champion join that marks a piece equipped, which
    //    safeguard scoring reads.
    let equipped_by_artifact = build_equipped_by_artifact_map(&input.champions);
    let compact_artifacts = parse_artifact_log_array(&input.artifacts, &equipped_by_artifact);

    // 3. Run the decision pipeline. Every stage lives in pipeline.rs so the benchmark and
    //    the parity tests drive exactly this code.
    let outcome = pipeline::decide_with(
        &input.sfc,
        &compact_artifacts,
        pipeline::DecideOptions {
            improvement_chances: input.improvement_chances,
            rules: input.rules,
        },
    )?;

    // 4. Project to the wire shape and serialise.
    let output = NativeOutput {
        verdicts: outcome.verdicts.iter().map(VerdictOut::from).collect(),
        safeguard_ranks: outcome.safeguard_ranks.iter().map(SafeguardRankOut::from).collect(),
        improvement_chances: outcome.improvement_chances,
        rules: outcome.rules,
    };
    serde_json::to_string(&output).map_err(|e| format!("Serialise error: {e}"))
}

// Build a `.hsf` file from a sellfile, honouring the caller's content switches.
fn run_hsf(input_json: &str) -> Result<String, String> {
    // 1. Deserialise the outer envelope.
    let input: NativeHsfInput = serde_json::from_str(input_json).map_err(|e| format!("Invalid input JSON: {e}"))?;

    // 2. Normalise the raw wire payloads exactly as the decide path does, so safeguard
    //    rules rank the same pieces the same way in both.
    let equipped_by_artifact = build_equipped_by_artifact_map(&input.champions);
    let compact_artifacts = parse_artifact_log_array(&input.artifacts, &equipped_by_artifact);

    // 3. Build the merged rule list the requested file is written from.
    let rules = pipeline::build_hsf_rules(
        &input.sfc,
        &compact_artifacts,
        pipeline::HsfOptions {
            recipes: input.recipes,
            safeguards: input.safeguards,
            final_sell: input.final_sell,
        },
    )?;

    // 4. Render the file, then wrap it in the response envelope.
    let output = NativeHsfOutput {
        hsf: hsf_export::render_hsf(&rules)?,
        rule_count: rules.len(),
    };
    serde_json::to_string(&output).map_err(|e| format!("Serialise error: {e}"))
}

// ---------------------------------------------------------------------------
// C ABI
// ---------------------------------------------------------------------------

/// Decide keep/sell for every supplied artifact against a sellfile.
///
/// `input_json` must be a valid UTF-8, null-terminated JSON string:
/// ```json
/// {
///   "sfc":       "<SFC file contents as a JSON string>",
///   "artifacts": [ /* raw ArtifactLog wire rows */ ],
///   "champions": [ /* raw champion rows: id + artifacts slot-map */ ]
/// }
/// ```
///
/// `champions` is optional but materially affects the answer: it marks which pieces are
/// equipped, which safeguard scoring reads.
///
/// Returns a heap-allocated null-terminated UTF-8 JSON string carrying `verdicts`,
/// `safeguardRanks`, `improvementChances` and `rules`. On any error the string is
/// `{"error":"<message>"}` — never null. **The caller must release the pointer with
/// `sfc_free` — do not call `free()` directly.**
///
/// # ABI stability
///
/// The JSON contract is **unstable** until a consumer ships against it. Pair every call
/// with `sfc_version()` and fail loudly on a schema mismatch rather than misparsing.
///
/// # Threading
///
/// **Thread-safe.** Every call is self-contained: the engine state it configures and the
/// safeguard placeholder store are both thread-locals, and the core holds no mutable
/// global, so concurrent calls on different threads cannot observe or corrupt each
/// other. `tests/decide_parity.rs::concurrent_calls_agree_with_a_single_call` pins this.
///
/// Concurrency buys throughput across independent requests, not speed on one: each
/// thread re-runs the whole chain, including the rule generation that dominates the
/// cost. Calls on the SAME thread simply run one after another.
// C ABI entry point: the raw-pointer contract is the caller's, documented above and
// null-checked below. Kept non-`unsafe` so the exported symbol's declared contract stays
// what a C caller expects; the lint is allowed here instead.
#[allow(clippy::not_unsafe_ptr_arg_deref)]
#[no_mangle]
pub extern "C" fn sfc_decide(input_json: *const c_char) -> *mut c_char {
    // Safety: caller guarantees a valid, null-terminated C string for the lifetime
    //         of this function call.
    let json_str = unsafe {
        if input_json.is_null() {
            return error_cstring("input_json pointer is null");
        }
        match CStr::from_ptr(input_json).to_str() {
            Ok(s) => s,
            Err(_) => return error_cstring("input_json is not valid UTF-8"),
        }
    };
    let json_out = match run(json_str) {
        Ok(s) => s,
        Err(e) => serde_json::to_string(&NativeError { error: e })
            .unwrap_or_else(|_| r#"{"error":"serialisation failed"}"#.to_string()),
    };
    // Null bytes in output are extremely unlikely but handled gracefully.
    CString::new(json_out)
        .unwrap_or_else(|_| CString::new(r#"{"error":"output contains null byte"}"#).unwrap())
        .into_raw()
}

/// Build a RSL Helper `.hsf` sellfile from a sellfile and the gear it applies to.
///
/// `input_json` must be a valid UTF-8, null-terminated JSON string:
/// ```json
/// {
///   "sfc":       "<SFC file contents as a JSON string>",
///   "artifacts": [ /* raw ArtifactLog wire rows */ ],
///   "champions": [ /* raw champion rows: id + artifacts slot-map */ ],
///
///   "recipes":   true,
///   "safeguards": true,
///   "finalSell": true
/// }
/// ```
///
/// The three switches choose what the generated file contains, and each defaults to true —
/// so a request naming none of them produces the same file the app itself exports. They
/// name what a caller MEANS rather than how the file is put together: no knowledge of which
/// rules inside a sellfile carry which marker is needed, and the markers are in any case
/// stripped on export, so the finished file cannot be filtered after the fact.
///
/// * `recipes` — the keep/sell rules the user wrote.
/// * `safeguards` — the safeguard rules, as keep rows for the pieces they rescue. These
///   are derived from `artifacts`, so a request that sends no gear yields no safeguards
///   however this is set. A sellfile with safeguards switched off contributes none either:
///   the switch can only take away.
/// * `finalSell` — the trailing "sell everything not named above" catch-all. Turning it off
///   leaves every unnamed piece untouched instead of sold.
///
/// Returns a heap-allocated null-terminated UTF-8 JSON string
/// `{"hsf":"<file contents>","ruleCount":<n>}`. The `hsf` string is the complete file, so
/// it can be written to disk verbatim. On any error the string is `{"error":"<message>"}` —
/// never null. **Release the pointer with `sfc_free`.**
///
/// # Threading
///
/// **Thread-safe**, for the same reason as `sfc_decide`: every call is self-contained.
// Same C ABI reasoning as sfc_decide — the raw-pointer contract is the caller's, documented
// above and null-checked below.
#[allow(clippy::not_unsafe_ptr_arg_deref)]
#[no_mangle]
pub extern "C" fn sfc_build_hsf(input_json: *const c_char) -> *mut c_char {
    // Safety: caller guarantees a valid, null-terminated C string for the lifetime
    //         of this function call.
    let json_str = unsafe {
        if input_json.is_null() {
            return error_cstring("input_json pointer is null");
        }
        match CStr::from_ptr(input_json).to_str() {
            Ok(s) => s,
            Err(_) => return error_cstring("input_json is not valid UTF-8"),
        }
    };
    let json_out = match run_hsf(json_str) {
        Ok(s) => s,
        Err(e) => serde_json::to_string(&NativeError { error: e })
            .unwrap_or_else(|_| r#"{"error":"serialisation failed"}"#.to_string()),
    };
    CString::new(json_out)
        .unwrap_or_else(|_| CString::new(r#"{"error":"output contains null byte"}"#).unwrap())
        .into_raw()
}

/// Report the DLL's crate version and the version of the JSON contract above.
///
/// A consumer holding a prebuilt DLL has no lockfile to reason about, so this is what
/// lets it fail loudly on a mismatch instead of misparsing a shape it does not know.
/// Returns `{"crate":"<semver>","schema":<n>}`; release the pointer with `sfc_free`.
#[no_mangle]
pub extern "C" fn sfc_version() -> *mut c_char {
    // Bump SCHEMA_VERSION whenever the JSON contract changes shape in a way a consumer
    // could misread — a renamed or removed field, or a changed meaning. Purely additive
    // fields do not require a bump, since an older consumer simply ignores them.
    const SCHEMA_VERSION: u32 = 1;
    let payload = serde_json::json!({
        "crate": env!("CARGO_PKG_VERSION"),
        "schema": SCHEMA_VERSION,
    });
    CString::new(payload.to_string())
        .unwrap_or_else(|_| CString::new(r#"{"error":"version encode failed"}"#).unwrap())
        .into_raw()
}

/// Release a string pointer previously returned by `sfc_decide`, `sfc_build_hsf` or
/// `sfc_version`.
/// Passing null is safe and is a no-op.
// Same C ABI reasoning as sfc_decide: null is handled, and the pointer must have come
// from one of those functions' CString::into_raw, which is the documented contract.
#[allow(clippy::not_unsafe_ptr_arg_deref)]
#[no_mangle]
pub extern "C" fn sfc_free(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }
    // Safety: ptr was allocated by CString::into_raw in one of the entry points above.
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

    // A bare artifact row the variant tests can vary one field at a time on.
    fn probe_artifact(mid: Option<i64>, mfl: Option<i64>, s1id: Option<i64>, s1fl: Option<i64>) -> NativeArtifactIn {
        NativeArtifactIn {
            id: Some(1),
            slot: 1,
            rank: Some(5),
            rarity: Some(4),
            lvl: Some(16),
            reroll_count: None,
            aset: Some(10),
            accset: None,
            mid,
            mfl,
            s1id,
            s1lvl: Some(1),
            s1fl,
            s2id: None,
            s2lvl: None,
            s2fl: None,
            s3id: None,
            s3lvl: None,
            s3fl: None,
            s4id: None,
            s4lvl: None,
            s4fl: None,
            sub_values: [10.0, 0.0, 0.0, 0.0],
            c_id: None,
            faction: 0,
        }
    }

    // The encoded variants must be the ones the shared encoder produces, NOT a literal
    // (id << 8) | flag. The two disagree for every stat family whose flat suffix is forced
    // (SPD/RES/ACC always flat, CR/CDMG always percent), and a variant no rule can name
    // makes the threshold lookup miss and drops the piece to the final-sell catch-all.
    #[test]
    fn substat_and_main_variants_come_from_the_shared_encoder() {
        // SPD (id 4) is forced flat, so isAbsolute=0 must still encode as the flat variant.
        let (art, item) = normalize_artifact(&probe_artifact(Some(4), Some(0), Some(4), Some(0)));
        assert_eq!(art.substats[0].variant, sub_to_variant(4, 0), "SPD substat");
        // The naive encoding for (id=4, flag=0) is a bare shift — no flat suffix at all.
        assert_ne!(art.substats[0].variant, 4 << 8, "must not be the naive encoding");
        assert_eq!(item.main, Some(main_to_variant(4, 0)), "SPD main");

        // CR (id 7) is forced percent, so isAbsolute=1 must still encode as the percent variant.
        let (art, _) = normalize_artifact(&probe_artifact(None, None, Some(7), Some(1)));
        assert_eq!(art.substats[0].variant, sub_to_variant(7, 1), "CR substat");
        assert_ne!(art.substats[0].variant, (7 << 8) | 1, "must not be the naive encoding");
    }

    // An id the shared encoder does not know decodes to Any; the app drops that slot rather
    // than inventing a variant, so a future game stat cannot fabricate a phantom substat.
    #[test]
    fn an_unknown_substat_id_is_dropped_rather_than_invented() {
        let unknown = 200;
        assert_eq!(sub_to_variant(unknown, 0), STAT_ID_ANY, "probe id must be unknown to the encoder");
        let (art, item) = normalize_artifact(&probe_artifact(Some(unknown), Some(0), Some(unknown), Some(0)));
        assert!(art.substats.is_empty(), "unknown substat id must not produce a substat");
        assert_eq!(item.main, None, "unknown main stat id must read as absent");
    }

    // Any non-zero flat flag means flat, matching the app's isFlatFlag. Masking with `& 1`
    // would read 2 as percent and flip both the variant and the percent scaling.
    #[test]
    fn a_non_boolean_flat_flag_still_reads_as_flat() {
        assert!(is_flat_flag(Some(2)), "2 is truthy, therefore flat");
        assert!(!is_flat_flag(Some(0)));
        assert!(!is_flat_flag(None));
    }

    // The documented wire keys are camelCase; the snake_case struct field must not be what
    // serde looks for, or the knob silently defaults and the caller gets an empty array.
    #[test]
    fn the_documented_cost_knobs_actually_reach_the_input() {
        let parsed: NativeInput =
            serde_json::from_str(r#"{"sfc":"{}","improvementChances":true,"rules":false}"#).expect("camelCase keys");
        assert!(parsed.improvement_chances, "improvementChances must be read");
        assert!(!parsed.rules, "rules must be read");
        // A misspelled switch is refused rather than silently defaulting.
        assert!(
            serde_json::from_str::<NativeInput>(r#"{"sfc":"{}","improvementChance":true}"#).is_err(),
            "unknown field must be rejected"
        );
    }


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
            parsed
                .get("rules")
                .and_then(|v| v.as_array())
                .map(|a| !a.is_empty())
                .unwrap_or(false),
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
            parsed
                .get("rules")
                .and_then(|v| v.as_array())
                .map(|a| !a.is_empty())
                .unwrap_or(false),
            "rules should be present even with no artifacts"
        );
    }

    #[test]
    fn sfc_decide_c_abi() {
        // Verify the C-ABI wrapper produces valid JSON and sfc_free does not crash.
        let input = make_input(MINIMAL_SFC, SAMPLE_ARTIFACTS_JSON);
        let c_input = CString::new(input).unwrap();
        let ptr = sfc_decide(c_input.as_ptr());
        assert!(!ptr.is_null(), "sfc_decide must not return null");
        let output = unsafe { CStr::from_ptr(ptr).to_str().unwrap().to_string() };
        sfc_free(ptr);
        let parsed: serde_json::Value = serde_json::from_str(&output).unwrap();
        assert!(
            parsed.get("error").is_none(),
            "unexpected error from sfc_decide: {output}"
        );
    }

    // Build a NativeHsfInput JSON string with an explicit set of content switches.
    fn make_hsf_input(sfc_content: &str, artifacts_json: &str, switches: &str) -> String {
        let sfc_str = serde_json::to_string(sfc_content).unwrap();
        format!(r#"{{"sfc": {sfc_str}, "artifacts": {artifacts_json}{switches}}}"#)
    }

    // Parse the rule array out of a sfc_build_hsf response.
    fn hsf_rules_of(response: &str) -> Vec<serde_json::Value> {
        let parsed: serde_json::Value = serde_json::from_str(response).unwrap();
        assert!(parsed.get("error").is_none(), "unexpected error: {response}");
        let text = parsed.get("hsf").and_then(|v| v.as_str()).expect("hsf string");
        let file: serde_json::Value = serde_json::from_str(text).expect("hsf must be valid JSON");
        file.get("Rules")
            .and_then(|v| v.as_array())
            .expect("Rules array")
            .clone()
    }

    #[test]
    fn build_hsf_returns_a_loadable_file() {
        let input = make_hsf_input(MINIMAL_SFC, SAMPLE_ARTIFACTS_JSON, "");
        let result = run_hsf(&input).expect("hsf build should not error");
        let rules = hsf_rules_of(&result);
        assert!(!rules.is_empty(), "expected rules in the generated file");
        // RowIdx is 1-based and runs in export order, as the app's own writer emits it.
        assert_eq!(rules[0].get("RowIdx").and_then(|v| v.as_u64()), Some(1));
        // ruleCount reports the same list the file carries.
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(
            parsed.get("ruleCount").and_then(|v| v.as_u64()),
            Some(rules.len() as u64),
            "ruleCount must match the file's rule list"
        );
    }

    #[test]
    fn build_hsf_omits_recipe_rules_when_recipes_are_off() {
        // The minimal sellfile has one recipe and nothing else, so switching recipes off
        // must leave nothing behind — this is what proves the toggle drops the rules
        // rather than merely renaming them.
        let input = make_hsf_input(MINIMAL_SFC, SAMPLE_ARTIFACTS_JSON, r#", "recipes": false"#);
        let result = run_hsf(&input).expect("hsf build should not error");
        assert!(
            hsf_rules_of(&result).is_empty(),
            "recipes:false must drop the recipe rules: {result}"
        );
        // Default (switch absent) still includes them, so the flag is what changed it.
        let with_recipes = run_hsf(&make_hsf_input(MINIMAL_SFC, SAMPLE_ARTIFACTS_JSON, "")).unwrap();
        assert!(!hsf_rules_of(&with_recipes).is_empty());
    }

    #[test]
    fn build_hsf_toggles_the_final_sell_catch_all() {
        // A sellfile whose only content is the trailing catch-all: with it on the file has
        // rules, with it off the file is empty. Recipes are off in both, so the only
        // difference is the switch under test.
        const FINAL_SELL_SFC: &str = r#"{
            "Version": "1.0",
            "Recipes": [],
            "Safeguards": [],
            "SafeguardsEnabled": false,
            "FinalSellRemainder": { "artifacts": true, "accessories": true, "levels": [0, 4, 8, 12, 16] }
        }"#;
        let on = run_hsf(&make_hsf_input(FINAL_SELL_SFC, "[]", r#", "recipes": false"#)).unwrap();
        assert!(!hsf_rules_of(&on).is_empty(), "final sell should emit rules: {on}");
        let off = run_hsf(&make_hsf_input(
            FINAL_SELL_SFC,
            "[]",
            r#", "recipes": false, "finalSell": false"#,
        ))
        .unwrap();
        assert!(
            hsf_rules_of(&off).is_empty(),
            "finalSell:false must drop the catch-all: {off}"
        );
    }

    #[test]
    fn build_hsf_toggles_the_safeguard_rules() {
        // A sellfile that sells every 5* Epic and safeguards the two best SPD pieces. With
        // safeguards on the file carries extra keep rows for the rescued pieces; with it
        // off those rows are gone and the same gear would be sold.
        //
        // This is the toggle that cannot be applied after the fact: the export strips the
        // marker saying which rows came from a safeguard, so a caller filtering the finished
        // file has no way to tell them apart. It has to be decided here.
        const SAFEGUARD_SFC: &str = r#"{
            "Version": "1.0",
            "Recipes": [
                { "keep": false, "Rank": "5★", "Rarity": "Epic", "substats": ["SPD"], "minCount": 1 }
            ],
            "Safeguards": [
                { "activation": "protectExisting", "requiredCount": 2, "substats": ["SPD"], "substatMatch": "any" }
            ],
            "SafeguardsEnabled": true
        }"#;
        // Two pieces the recipe above would sell (5* Epic, carrying SPD) so the safeguard
        // has candidates to rescue. SAMPLE_ARTIFACTS_JSON cannot serve here: its second
        // piece is a 4* Rare that the recipe never names, so nothing would be rescued and
        // the test would pass for the wrong reason.
        const SAFEGUARDABLE_ARTIFACTS: &str = r#"[
            {
                "id": 1001, "kindId": 1, "rankId": 5, "rarityId": 4, "level": 16, "setKindId": 10,
                "primary": { "id": 1, "isAbsolute": 0 },
                "secondary": [ { "id": 4, "level": 4, "isAbsolute": 1, "statValue": 90194313216 } ]
            },
            {
                "id": 1002, "kindId": 2, "rankId": 5, "rarityId": 4, "level": 16, "setKindId": 5,
                "primary": { "id": 2, "isAbsolute": 0 },
                "secondary": [ { "id": 4, "level": 1, "isAbsolute": 1, "statValue": 42949672960 } ]
            }
        ]"#;
        let on = run_hsf(&make_hsf_input(SAFEGUARD_SFC, SAFEGUARDABLE_ARTIFACTS, "")).unwrap();
        let off = run_hsf(&make_hsf_input(
            SAFEGUARD_SFC,
            SAFEGUARDABLE_ARTIFACTS,
            r#", "safeguards": false"#,
        ))
        .unwrap();
        let on_count = hsf_rules_of(&on).len();
        let off_count = hsf_rules_of(&off).len();
        assert!(
            on_count > off_count,
            "safeguards must add keep rows: on={on_count} off={off_count}"
        );
        // Turning safeguards off must leave the recipe rules alone — the toggles are
        // independent, so one switch may not quietly take another's rules with it.
        assert!(off_count > 0, "recipes must survive safeguards:false");
    }

    #[test]
    fn build_hsf_splits_a_sellfile_into_disjoint_halves() {
        // The switches exist so a caller can split ONE sellfile into separate files by
        // where each rule came from. That is only useful if the parts partition the whole:
        // no rule in both, and none lost. A rule that appeared twice would be applied
        // twice, and a lost sell rule would silently spare gear the file meant to sell.
        const SPLIT_SFC: &str = r#"{
            "Version": "1.0",
            "Recipes": [
                { "keep": false, "Rank": "5★", "Rarity": "Epic", "substats": ["SPD"], "minCount": 1 }
            ],
            "Safeguards": [
                { "activation": "protectExisting", "requiredCount": 2, "substats": ["SPD"], "substatMatch": "any" }
            ],
            "SafeguardsEnabled": true,
            "FinalSellRemainder": { "artifacts": true, "accessories": true, "levels": [0, 4, 8, 12, 16] }
        }"#;
        // Two pieces the recipe would sell, so the safeguard has candidates to rescue and
        // the safeguard half is non-empty.
        const BOTH_SAFEGUARDABLE: &str = r#"[
            {
                "id": 1001, "kindId": 1, "rankId": 5, "rarityId": 4, "level": 16, "setKindId": 10,
                "primary": { "id": 1, "isAbsolute": 0 },
                "secondary": [ { "id": 4, "level": 4, "isAbsolute": 1, "statValue": 90194313216 } ]
            },
            {
                "id": 1002, "kindId": 2, "rankId": 5, "rarityId": 4, "level": 16, "setKindId": 5,
                "primary": { "id": 2, "isAbsolute": 0 },
                "secondary": [ { "id": 4, "level": 1, "isAbsolute": 1, "statValue": 42949672960 } ]
            }
        ]"#;

        // Identify a rule by its content minus RowIdx, which is positional by design and
        // therefore differs between a part and the whole for the very same rule.
        fn keys(rules: &[serde_json::Value]) -> Vec<String> {
            rules
                .iter()
                .map(|rule| {
                    let mut copy = rule.clone();
                    copy.as_object_mut().map(|object| object.remove("RowIdx"));
                    serde_json::to_string(&copy).unwrap()
                })
                .collect()
        }

        let whole = keys(&hsf_rules_of(
            &run_hsf(&make_hsf_input(SPLIT_SFC, BOTH_SAFEGUARDABLE, "")).unwrap(),
        ));
        let recipes_and_final_sell = keys(&hsf_rules_of(
            &run_hsf(&make_hsf_input(
                SPLIT_SFC,
                BOTH_SAFEGUARDABLE,
                r#", "safeguards": false"#,
            ))
            .unwrap(),
        ));
        let safeguards_only = keys(&hsf_rules_of(
            &run_hsf(&make_hsf_input(
                SPLIT_SFC,
                BOTH_SAFEGUARDABLE,
                r#", "recipes": false, "finalSell": false"#,
            ))
            .unwrap(),
        ));

        // Each half must actually carry something, or the split is vacuously "disjoint".
        assert!(!recipes_and_final_sell.is_empty(), "the recipe half must not be empty");
        assert!(!safeguards_only.is_empty(), "the safeguard half must not be empty");

        // Disjoint: no rule is written into both files.
        for rule in &safeguards_only {
            assert!(
                !recipes_and_final_sell.contains(rule),
                "a rule appears in both halves: {rule}"
            );
        }
        // Complete: together the halves are exactly the whole file, nothing lost or added.
        let mut rejoined: Vec<String> = recipes_and_final_sell
            .iter()
            .chain(safeguards_only.iter())
            .cloned()
            .collect();
        let mut expected = whole.clone();
        rejoined.sort();
        expected.sort();
        assert_eq!(
            rejoined, expected,
            "the two halves must reunite into exactly the complete file"
        );
    }

    #[test]
    fn build_hsf_never_leaks_ui_metadata() {
        // The `__`-prefixed fields are diagnostics the app strips on export; RSL Helper
        // must never see them, and the safeguard markers in particular would expose
        // internals a sellfile has no field for.
        let input = make_hsf_input(MINIMAL_SFC, SAMPLE_ARTIFACTS_JSON, "");
        let result = run_hsf(&input).expect("hsf build should not error");
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        let text = parsed.get("hsf").and_then(|v| v.as_str()).unwrap();
        assert!(!text.contains("__"), "generated file must not carry UI-only fields");
    }

    #[test]
    fn sfc_build_hsf_c_abi() {
        // Verify the C-ABI wrapper produces valid JSON and sfc_free does not crash.
        let input = make_hsf_input(MINIMAL_SFC, SAMPLE_ARTIFACTS_JSON, "");
        let c_input = CString::new(input).unwrap();
        let ptr = sfc_build_hsf(c_input.as_ptr());
        assert!(!ptr.is_null(), "sfc_build_hsf must not return null");
        let output = unsafe { CStr::from_ptr(ptr).to_str().unwrap().to_string() };
        sfc_free(ptr);
        let parsed: serde_json::Value = serde_json::from_str(&output).unwrap();
        assert!(
            parsed.get("error").is_none(),
            "unexpected error from sfc_build_hsf: {output}"
        );
    }

    #[test]
    fn sfc_build_hsf_null_input() {
        // Null pointer must return an error JSON, not crash.
        let ptr = sfc_build_hsf(std::ptr::null());
        assert!(!ptr.is_null());
        let output = unsafe { CStr::from_ptr(ptr).to_str().unwrap().to_string() };
        sfc_free(ptr);
        let parsed: serde_json::Value = serde_json::from_str(&output).unwrap();
        assert!(parsed.get("error").is_some(), "null input must yield error field");
    }

    #[test]
    fn sfc_decide_null_input() {
        // Null pointer must return an error JSON, not crash.
        let ptr = sfc_decide(std::ptr::null());
        assert!(!ptr.is_null());
        let output = unsafe { CStr::from_ptr(ptr).to_str().unwrap().to_string() };
        sfc_free(ptr);
        let parsed: serde_json::Value = serde_json::from_str(&output).unwrap();
        assert!(parsed.get("error").is_some(), "null input must yield error field");
    }
}
