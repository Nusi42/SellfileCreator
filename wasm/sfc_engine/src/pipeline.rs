// pipeline — the decision pipeline behind the C ABI, split into named stages.
//
// One definition, three callers: `sfc_decide` (the exported entry point), the
// end-to-end parity tests, and the `bench_pipeline` example that produces the §7
// timing numbers. Splitting the stages out is what lets the benchmark time the code
// the ABI actually runs rather than a copy that can drift from it.
//
// Stage order mirrors the app's own flow:
//   parse_sfc -> build rules per recipe -> safeguard detection -> merge -> evaluate
//   -> improvement chance

use std::collections::BTreeMap;
use std::time::Instant;

use rule_engine_core::{
    build_hsf_rules_for_recipe, collect_and_compute_safeguard_protection_core, compute_improvement_chance_core,
    compute_merged_rules_core, configure_engine, evaluate_engine, recipe_id_for_index,
    safeguard_bucket_key_from_artifact, ComputeMergedRulesIn, EvaluateItemRaw, EvaluateOptionsRaw,
    ImprovementChanceEntry, RuleRaw, SafeguardCollectRowIn, SafeguardWasmSnapshotOut, SfcParsed, RECIPE_MODE_ACTIVE,
    RECIPE_MODE_DISABLED, RECIPE_MODE_SEPARATOR, SAFEGUARD_RECIPE_ID_BASE,
};

use crate::artifact_log::NativeArtifactIn;
use crate::normalize_artifact;

// ---------------------------------------------------------------------------
// Stage outputs
// ---------------------------------------------------------------------------

// One artifact's decision, plus enough context for a caller to explain it.
#[derive(Debug, Clone)]
pub struct Verdict {
    pub artifact_id: i64,
    pub keep: bool,
    // false = no rule covered this piece. It is still KEPT (never sell what the sellfile
    // did not call out), but kept by DEFAULT rather than by a decision, and a caller
    // wants to show the two differently.
    pub matched: bool,
    // RecipeName of the deciding rule; None for an unnamed rule or an unmatched piece.
    pub rule_name: Option<String>,
    // Kept ONLY because a safeguard overrode a rule that would have sold it. This is the
    // third verdict state a `.hsf` cannot express, since the safeguard source marker is
    // stripped on export — the single biggest reason this DLL exists.
    pub safeguarded: bool,
}

// One artifact's standing under one safeguard rule.
#[derive(Debug, Clone)]
pub struct SafeguardRank {
    pub artifact_id: i64,
    pub rule_ordinal: i64,
    pub score: f64,
    pub candidate_rank: u32,
    pub bucket_rank: u32,
    pub bucket_key: String,
    pub is_within_quota: bool,
    pub group_id: Option<String>,
    pub substat_buckets: Vec<SubstatBucket>,
}

// One substat sub-bucket standing, for the multi-substat ranking modes.
#[derive(Debug, Clone)]
pub struct SubstatBucket {
    pub variant: i64,
    pub bucket_rank: u32,
    pub is_within_quota: bool,
}

// Everything one `sfc_decide` call produces.
pub struct DecisionOutcome {
    pub verdicts: Vec<Verdict>,
    pub safeguard_ranks: Vec<SafeguardRank>,
    pub improvement_chances: Vec<ImprovementChanceEntry>,
    pub rules: Vec<RuleRaw>,
}

// Per-stage wall-clock, in milliseconds. Filled only by the benchmark path.
#[derive(Debug, Default, Clone)]
pub struct StageTimings {
    pub parse_sfc_ms: f64,
    pub build_rules_ms: f64,
    pub safeguard_ms: f64,
    pub merge_ms: f64,
    pub evaluate_ms: f64,
    pub improvement_ms: f64,
    pub rule_count: usize,
    pub merged_count: usize,
}

impl StageTimings {
    // The stages a keep/sell answer waits for (the caller adds JSON + normalise itself).
    // Excludes improvement chance, which is opt-in and changes no verdict.
    pub fn decision_ms(&self) -> f64 {
        self.parse_sfc_ms + self.build_rules_ms + self.safeguard_ms + self.merge_ms + self.evaluate_ms
    }
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

// Derive the per-recipe mode strings the safeguard collector and the evaluator gate on.
// A separator or disabled recipe must not contribute candidates.
//
// The tokens come from the core's own vocabulary (RECIPE_MODE_*), which is the same closed
// three-value set the app's `SellfileExportMode` uses. The mode says whether a recipe
// PARTICIPATES, never what it decides — keep-vs-sell already lives on each rule's Keep
// flag, so inventing a "keep"/"sell" token here would put a second, weaker copy of that
// fact into a string the gate cannot type-check.
fn derive_recipe_modes(parsed: &SfcParsed) -> Vec<String> {
    parsed
        .recipes
        .iter()
        .map(|recipe| {
            if recipe.is_separator {
                RECIPE_MODE_SEPARATOR.to_string()
            } else if !recipe.use_flag {
                RECIPE_MODE_DISABLED.to_string()
            } else {
                RECIPE_MODE_ACTIVE.to_string()
            }
        })
        .collect()
}

// The 0-based indices of recipes that opted their KEEPS out of counting as safeguard
// coverage (`IgnoredBySafeguards`). Index-aligned with `derive_recipe_modes` and with the
// rule order `build_rules` emits, which is what the collector and evaluator index by.
//
// The app supplies the same list (buildIgnoreSafeguardRecipeIndices); the DLL used to pass
// `None`, so the reader parsed the flag and then dropped it and the two disagreed on every
// sellfile that uses it — a recipe that keeps rework fodder read as real coverage, and the
// safeguard stood down instead of rescuing the piece the app rescues.
//
// `None` rather than an empty Vec when nothing is flagged: the collector treats the absent
// list as "no recipe opts out", so an empty list would only cost a needless allocation.
fn derive_ignore_safeguard_recipe_indices(parsed: &SfcParsed) -> Option<Vec<i64>> {
    let indices: Vec<i64> = parsed
        .recipes
        .iter()
        .enumerate()
        .filter(|(_, recipe)| recipe.ignored_by_safeguards)
        .map(|(idx, _)| idx as i64)
        .collect();
    // Empty means the same thing as absent here, and absent is the cheaper spelling.
    (!indices.is_empty()).then_some(indices)
}

// Build the HSF rules for every recipe, stamping each with its recipe id so the
// recipe-mode gate and safeguard bucketing can attribute a rule back to the recipe that
// produced it.
//
// The id is 1-BASED, matching the app's own builder (`recipeIdForExport = recipeIdx + 1`).
// `RecipeID` is not a raw index anywhere downstream: the builder drops any value <= 0
// (hsf_builder_execution: `RecipeID: input.recipe_id.filter(|v| *v > 0)`) and the evaluator
// recovers the index as `RecipeID - 1` (matcher_evaluator::prepare_rule), treating a
// non-positive id as "belongs to no recipe".
//
// Passing the 0-based enumeration index therefore broke the gate in two ways at once:
// recipe 0's rules lost their id to the filter, and every later recipe read its
// PREDECESSOR's entry in `recipe_modes` — so one separator or disabled recipe silenced the
// real sell recipe behind it and the DLL kept gear the app's preview sells.
fn build_rules(parsed: &SfcParsed) -> Result<Vec<RuleRaw>, String> {
    let minima_ref = parsed.minima.as_ref();
    let mut custom_rules: Vec<RuleRaw> = Vec::new();
    for (idx, recipe) in parsed.recipes.iter().enumerate() {
        // 1-based id; `recipe_id_for_index` is the one definition of that offset.
        let mut rules = build_hsf_rules_for_recipe(recipe, minima_ref, Some(recipe_id_for_index(idx)))
            .map_err(|e| format!("Recipe {idx} build error: {e}"))?;
        custom_rules.append(&mut rules);
    }
    Ok(custom_rules)
}

// Turn compact rows into the collector's row shape (canonical artifact + matcher item).
// Public alongside evaluate_verdicts so a test can feed the real row shape to it.
pub fn build_rows(compact: &[NativeArtifactIn]) -> Vec<SafeguardCollectRowIn> {
    compact
        .iter()
        .map(|a| {
            let (artifact, item) = normalize_artifact(a);
            SafeguardCollectRowIn {
                item,
                // No pre-evaluated match from outside; the collector evaluates each
                // artifact against the rules itself.
                base_match_defined: false,
                base_match: None,
                artifact,
            }
        })
        .collect()
}

// Run safeguard detection when it is both enabled and has something to work on.
fn detect_safeguards(
    parsed: &SfcParsed,
    rows: &[SafeguardCollectRowIn],
    custom_rules: &[RuleRaw],
    recipe_modes: Vec<String>,
) -> Result<Option<SafeguardWasmSnapshotOut>, String> {
    if !parsed.safeguards_enabled || parsed.safeguard_rules.is_empty() || rows.is_empty() {
        return Ok(None);
    }
    let combined = collect_and_compute_safeguard_protection_core(
        rows.to_vec(),
        custom_rules.to_vec(),
        recipe_modes,
        // The recipes that opted out of counting as coverage, same list the app passes.
        derive_ignore_safeguard_recipe_indices(parsed),
        parsed.safeguard_rules.clone(),
        // NOT at parity with the app, which precomputes an expected-bucket DOMAIN from
        // TS-only catalogs (all faction ids, set-slot compatibility) this crate has no
        // generated equivalent of. Without it a quota counts the buckets OBSERVED in the
        // gear on hand instead of the buckets that COULD exist, so a "keep 1 per slot"
        // safeguard over six slots can rescue a different number of pieces than the app's
        // preview does. Measured on a real 8,388-piece vault this is now the ONLY source of
        // verdict divergence left: 10,312 safeguard keep-rules injected here against the
        // app's 17,235, while recipe rules and the catch-all match exactly. Closing it needs
        // ALLOWED_MAIN_BY_SLOT + ALL_FACTION_IDS emitted into generated_domain_constants.rs,
        // and the accessory/artifact set split, which needs a piece count the shared spec
        // does not carry yet. See docs/technical/build-and-tooling.md.
        None, // expected_payload
        true,
        0.0,             // now (timestamp; not used for rule logic)
        BTreeMap::new(), // improvement_chances: empty = threshold gating disabled
    )
    .map_err(|e| format!("Safeguard detection error: {e}"))?;
    Ok(Some(combined.detection))
}

// Merge the recipe rules with the safeguard-injected keep rules into the final list,
// including only the sources `options` asks for.
//
// The three toggles land on three separate merge inputs, which is why they compose without
// interfering: recipes arrive already filtered in `custom_rules`, safeguards are gated by
// the safeguard switch, and the catch-all is simply withheld.
fn merge_rules_with(
    parsed: &SfcParsed,
    custom_rules: Vec<RuleRaw>,
    detection: Option<SafeguardWasmSnapshotOut>,
    options: HsfOptions,
) -> Result<Vec<RuleRaw>, String> {
    compute_merged_rules_core(ComputeMergedRulesIn {
        base_rules: vec![],
        custom_rules,
        // Withholding the remainder is what drops the catch-all: the merge emits those rows
        // from this description, so `None` means the file simply has no trailing sell.
        final_sell_remainder: if options.final_sell {
            parsed.final_sell.clone()
        } else {
            None
        },
        all_known_set_ids: parsed.all_known_set_ids.clone(),
        omit_disabled_before_safeguards: false,
        dedupe_before_safeguards: false,
        // The caller's switch can only turn safeguards OFF; a sellfile that disabled it
        // stays disabled, since the merge would otherwise inject rules the file never asked
        // for.
        safeguard_enabled: options.safeguards && parsed.safeguards_enabled,
        safeguard_rules: parsed.safeguard_rules.clone(),
        safeguard_detection: detection,
        // Name the sentinel rather than letting the merge fall back to a bare literal;
        // this is the same value the app passes across the wasm boundary.
        safeguard_recipe_id_base: Some(SAFEGUARD_RECIPE_ID_BASE),
    })
    .map_err(|e| format!("Merge error: {e}"))
}

// Merge every source, which is what a decision always evaluates against.
fn merge_rules(
    parsed: &SfcParsed,
    custom_rules: Vec<RuleRaw>,
    detection: Option<SafeguardWasmSnapshotOut>,
) -> Result<Vec<RuleRaw>, String> {
    merge_rules_with(parsed, custom_rules, detection, HsfOptions::default())
}

// Project the detection snapshot's candidates into the per-artifact rank rows.
//
// The collector already computed every one of these; the DLL previously used the
// snapshot only to inject rules and threw the candidate data away. This is projection,
// not new computation.
fn project_safeguard_ranks(
    detection: Option<&SafeguardWasmSnapshotOut>,
    rows: &[SafeguardCollectRowIn],
    safeguard_rules: &[rule_engine_core::SafeguardWasmRuleIn],
) -> Vec<SafeguardRank> {
    let Some(detection) = detection else {
        return Vec::new();
    };
    // The bucket key is derived from the artifact, so index the rows by item key once
    // rather than re-deriving per candidate.
    let artifact_by_key: BTreeMap<i64, &rule_engine_core::SafeguardWasmArtifactIn> = rows
        .iter()
        .filter_map(|row| row.artifact.id.map(|id| (id, &row.artifact)))
        .collect();

    let mut out = Vec::new();
    for entry in &detection.entries {
        // A rule with no ordinal cannot be named back to the user's rule list; the
        // collector stamps one on every real rule, so this only skips synthetic entries.
        let Some(rule_ordinal) = entry.rule_ordinal else {
            continue;
        };
        for candidate in &entry.candidates {
            // Bucket key from the piece's own dimensions, through the same authority the
            // collector bucketed by, so a caller can group ranks exactly as it ranked.
            let bucket_key = artifact_by_key
                .get(&candidate.item_key)
                .map(|artifact| safeguard_bucket_key_from_artifact(artifact))
                .unwrap_or_default();
            out.push(SafeguardRank {
                artifact_id: candidate.item_key,
                rule_ordinal,
                score: candidate.score,
                candidate_rank: candidate.candidate_rank,
                bucket_rank: candidate.bucket_rank,
                bucket_key,
                is_within_quota: candidate.is_within_quota,
                // The group lives on the INPUT rule, looked up by the entry's 1-based
                // ordinal. Ungrouped rules carry none; a group id ties members into one
                // pooled quota, which is why a caller needs it to explain a rank.
                //
                // A non-positive ordinal names no rule, so it yields None rather than being
                // clamped to index 0 — reporting the FIRST rule's group for a rank whose
                // rule is unknown would make a caller explain the keep with the wrong rule.
                group_id: usize::try_from(rule_ordinal - 1)
                    .ok()
                    .and_then(|index| safeguard_rules.get(index))
                    .and_then(|rule| rule.group.as_ref())
                    .map(|group| group.id.clone()),
                substat_buckets: candidate
                    .substat_buckets
                    .iter()
                    .map(|bucket| SubstatBucket {
                        variant: bucket.variant,
                        bucket_rank: bucket.bucket_rank,
                        is_within_quota: bucket.is_within_quota,
                    })
                    .collect(),
            });
        }
    }
    out
}

// Evaluate every piece against the merged rules and resolve one verdict each.
//
// ONE evaluation answers both questions, because the engine already reports two channels
// per item and they mean exactly what the two questions ask:
//
//   first_match             — the DECISION. A safeguard keep-override, when one fires,
//                             lands here (matcher_evaluator promotes it into first_match).
//   first_non_excluded_match — the BASELINE: what the sellfile decides on its own.
//
// This mirrors the app's own preview, which reads `firstMatch` for the verdict and
// `firstNonExcludedMatch` as `baseMatch` (App.tsx). Reading the non-excluded channel as
// the verdict inverts the meaning and reports SELL for every piece a safeguard rescued —
// the exact bug this DLL exists to avoid.
//
// The two channels differing IS the third verdict state: a rule would have sold the piece
// and a safeguard re-kept it. A `.hsf` cannot express that, because the safeguard source
// marker is stripped on export.
// Takes the merged rules BY VALUE: configure_engine needs them owned, so a borrow here
// would only move the deep copy of a list that runs to tens of thousands of rules onto this
// side of the call. A caller that also wants to return them clones once, deliberately.
//
// Public so a test can pin the verdict resolution on a hand-written rule list (a `.hsf`'s
// named rules, which a `.sfc` cannot produce) rather than restating the channel read.
pub fn evaluate_verdicts(
    rows: &[SafeguardCollectRowIn],
    merged_rules: Vec<RuleRaw>,
    recipe_modes: Vec<String>,
) -> Result<Vec<Verdict>, String> {
    // Rule names captured BEFORE configure_engine consumes the rules; EvalMatch.rule_index
    // points into this same order. A blank name counts as absent so a caller shows
    // nothing rather than an empty line.
    let rule_names: Vec<Option<String>> = merged_rules
        .iter()
        .map(|rule| {
            rule.RecipeName
                .as_deref()
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .map(str::to_owned)
        })
        .collect();

    let items: Vec<EvaluateItemRaw> = rows
        .iter()
        .map(|row| EvaluateItemRaw {
            item_id: row.artifact.id.unwrap_or(0),
            item: row.item.clone(),
        })
        .collect();

    // configure_engine + evaluate_engine share a thread-local engine state, so they run
    // here back to back on one thread.
    configure_engine(merged_rules, recipe_modes);
    // No `baseline_exclude_sources` here, deliberately: the evaluator seeds
    // `first_non_excluded_match` from the PRE-override `first_match`, so the baseline
    // channel already reads the sellfile without the safeguard keeps. The extra option only
    // triggers a second `evaluate_item` pass whose result is discarded in this shape, and
    // measuring it here showed no verdict changes either way — the app passes it because
    // its own caller reuses baseline matches for chip rendering, which this crate does not.
    let results = evaluate_engine(items, EvaluateOptionsRaw::default())?;

    let mut verdicts = Vec::with_capacity(results.len());
    for result in &results {
        // The decision channel. A safeguard keep-override, when one fires, is promoted
        // into first_match by the evaluator, so this already reflects the rescue.
        let decided = result.first_match.as_ref();
        // No matching rule means KEEP. Never sell gear the sellfile did not call out: a
        // full export encodes "sell the rest" as an explicit trailing catch-all, so a
        // no-match only arises for a partial or hand-written file, where keep is the safe
        // default for an irreversible action.
        let keep = decided.map(|m| m.keep).unwrap_or(true);
        // The baseline channel: what the sellfile decides WITHOUT the safeguard keeps.
        let baseline_keep = result.first_non_excluded_match.as_ref().map(|m| m.keep).unwrap_or(true);
        // Safeguarded: a rule would have sold it and a safeguard re-kept it. The
        // evaluator flags the deciding match as a keep-override source, which is the
        // same fact seen from the rule side; both must agree for the flag to be set.
        let safeguarded = keep && !baseline_keep && decided.map(|m| m.is_keep_override_source).unwrap_or(false);
        verdicts.push(Verdict {
            artifact_id: result.item_id,
            keep,
            matched: decided.is_some(),
            rule_name: decided
                .and_then(|m| rule_names.get(m.rule_index))
                .and_then(Clone::clone),
            safeguarded,
        });
    }
    Ok(verdicts)
}

// ---------------------------------------------------------------------------
// The whole chain
// ---------------------------------------------------------------------------

// What an individual call wants computed. Verdicts are always produced; the extras each
// cost real time on a full vault, so a caller that does not read one should not pay for it.
#[derive(Debug, Clone, Copy)]
pub struct DecideOptions {
    // Per-artifact improvement-chance percentages. OFF by default: it is an upgrade
    // projection over every artifact x every safeguard milestone, and on a real vault it
    // costs more than the entire keep/sell chain put together. It does NOT feed the
    // verdict — detection runs with threshold gating disabled — so a consumer asking only
    // "keep or sell" gets the same answer either way, far sooner.
    pub improvement_chances: bool,
    // The merged HSF rule list. ON by default: it is already built (the verdicts are
    // evaluated against it) and only costs the serialisation.
    pub rules: bool,
}

impl Default for DecideOptions {
    fn default() -> Self {
        Self {
            improvement_chances: false,
            rules: true,
        }
    }
}

// Run every stage and return the decision set the options ask for.
pub fn decide_with(sfc: &str, compact: &[NativeArtifactIn], options: DecideOptions) -> Result<DecisionOutcome, String> {
    let parsed = rule_engine_core::parse_sfc(sfc).map_err(|e| format!("SFC parse error: {e}"))?;
    // The recipe list's own modes, shared by detection and evaluation. They index by
    // recipe, so they must come from the RECIPES — a safeguard-injected rule carries a
    // sentinel RecipeID that indexes nothing, and deriving modes from the merged rules
    // instead produced an empty table that gated every recipe rule out.
    let recipe_modes = derive_recipe_modes(&parsed);
    let custom_rules = build_rules(&parsed)?;
    let rows = build_rows(compact);
    let detection = detect_safeguards(&parsed, &rows, &custom_rules, recipe_modes.clone())?;
    // Ranks are projected from the snapshot before merge consumes it.
    let safeguard_ranks = project_safeguard_ranks(detection.as_ref(), &rows, &parsed.safeguard_rules);
    let merged_rules = merge_rules(&parsed, custom_rules, detection)?;
    // Cloned ONLY when the caller wants the list back; evaluation consumes the original
    // either way, so the `rules: false` path never duplicates tens of thousands of rules
    // just to drop them.
    let returned_rules = if options.rules {
        merged_rules.clone()
    } else {
        Vec::new()
    };
    let verdicts = evaluate_verdicts(&rows, merged_rules, recipe_modes)?;
    // Only computed on request — see DecideOptions::improvement_chances.
    let improvement_chances = if options.improvement_chances {
        let (entries, _diag) =
            compute_improvement_chance_core(&rows, parsed.safeguard_rules.clone(), parsed.safeguards_enabled, false);
        entries
    } else {
        Vec::new()
    };
    Ok(DecisionOutcome {
        verdicts,
        safeguard_ranks,
        improvement_chances,
        // Empty when unwanted, so a caller reading only verdicts neither clones the list
        // above nor carries tens of thousands of rules through the JSON encoder.
        rules: returned_rules,
    })
}

// Run the chain with the default options.
pub fn decide(sfc: &str, compact: &[NativeArtifactIn]) -> Result<DecisionOutcome, String> {
    decide_with(sfc, compact, DecideOptions::default())
}

// ---------------------------------------------------------------------------
// Sellfile export
// ---------------------------------------------------------------------------

// Which of a sellfile's three rule sources contribute to a generated `.hsf`.
//
// The three are INDEPENDENT on purpose: a caller asks for them by what they mean
// ("safeguard my best gear", "sell the rest") rather than by knowing which rules inside the
// file carry which marker. Every one defaults ON, so the default output is the same file
// the app exports for that sellfile.
#[derive(Debug, Clone, Copy)]
pub struct HsfOptions {
    // The recipes themselves — the keep/sell rules the user wrote. Off yields a file with
    // no opinions of its own, which is only useful together with one of the other two.
    pub recipes: bool,
    // The safeguard rules, which turn into extra keep rows for the specific pieces they
    // rescue. They depend on the gear supplied with the request: with no gear there is
    // nothing to safeguard and this contributes nothing regardless of the flag.
    //
    // A sellfile whose own switch has safeguards turned off contributes nothing either —
    // this flag can only take away, never enable something the file did not ask for.
    pub safeguards: bool,
    // The trailing "sell everything not named above" catch-all. Off yields a file that
    // sells only what a recipe explicitly names, leaving the rest untouched.
    pub final_sell: bool,
}

impl Default for HsfOptions {
    fn default() -> Self {
        // The app's own export: every source included.
        Self {
            recipes: true,
            safeguards: true,
            final_sell: true,
        }
    }
}

// Build the merged rule list a `.hsf` is written from, honouring the three toggles.
//
// Shares every stage with `decide_with` rather than restating the chain: the file a caller
// writes and the verdicts it displays must come from the same rules, or the preview and
// the exported file disagree.
pub fn build_hsf_rules(sfc: &str, compact: &[NativeArtifactIn], options: HsfOptions) -> Result<Vec<RuleRaw>, String> {
    let parsed = rule_engine_core::parse_sfc(sfc).map_err(|e| format!("SFC parse error: {e}"))?;
    let recipe_modes = derive_recipe_modes(&parsed);
    // Dropping the recipe rules has to happen HERE rather than after the merge: safeguard
    // detection reads them to decide which pieces a rule would have sold, so leaving them
    // in and filtering later would inject safeguards for sells that the requested file
    // does not contain.
    let custom_rules = if options.recipes {
        build_rules(&parsed)?
    } else {
        Vec::new()
    };
    let rows = build_rows(compact);
    // Detection is skipped outright when unwanted — it is the expensive stage, and its only
    // product is the injected keep rows the merge below would then discard.
    let detection = if options.safeguards {
        detect_safeguards(&parsed, &rows, &custom_rules, recipe_modes)?
    } else {
        None
    };
    merge_rules_with(&parsed, custom_rules, detection, options)
}

// Run the same chain, timing each stage. Used by the bench example only; it exists so
// the timing numbers describe the code the ABI runs rather than a parallel copy.
pub fn bench_stages(sfc: &str, compact: &[NativeArtifactIn]) -> StageTimings {
    let mut timings = StageTimings::default();

    let t = Instant::now();
    let parsed = rule_engine_core::parse_sfc(sfc).expect("sfc must parse");
    timings.parse_sfc_ms = t.elapsed().as_secs_f64() * 1000.0;

    let recipe_modes = derive_recipe_modes(&parsed);

    let t = Instant::now();
    let custom_rules = build_rules(&parsed).expect("rules must build");
    timings.build_rules_ms = t.elapsed().as_secs_f64() * 1000.0;
    timings.rule_count = custom_rules.len();

    let rows = build_rows(compact);

    let t = Instant::now();
    let detection = detect_safeguards(&parsed, &rows, &custom_rules, recipe_modes.clone()).expect("detection");
    timings.safeguard_ms = t.elapsed().as_secs_f64() * 1000.0;

    let t = Instant::now();
    let merged_rules = merge_rules(&parsed, custom_rules, detection).expect("merge");
    timings.merge_ms = t.elapsed().as_secs_f64() * 1000.0;
    timings.merged_count = merged_rules.len();

    let t = Instant::now();
    let _verdicts = evaluate_verdicts(&rows, merged_rules, recipe_modes).expect("evaluate");
    timings.evaluate_ms = t.elapsed().as_secs_f64() * 1000.0;

    let t = Instant::now();
    let _ = compute_improvement_chance_core(&rows, parsed.safeguard_rules.clone(), parsed.safeguards_enabled, false);
    timings.improvement_ms = t.elapsed().as_secs_f64() * 1000.0;

    timings
}
