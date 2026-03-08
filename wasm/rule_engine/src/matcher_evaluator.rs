use super::*;

// Keep only the data needed in hot matcher loops.
// Masks and recipe indices are precomputed at configure time.
#[derive(Debug)]
pub(crate) struct PreparedRule {
    pub(crate) use_flag: bool,
    pub(crate) keep_flag: bool,
    pub(crate) artifact_types: Vec<i64>,
    pub(crate) artifact_sets: Vec<i64>,
    pub(crate) faction: i64,
    pub(crate) level_for_check: i64,
    pub(crate) main_stat_id: i64,
    pub(crate) main_stat_f: i64,
    pub(crate) substats: Vec<PreparedRuleSub>,
    pub(crate) recipe_idx: Option<i64>,
    pub(crate) source_bits: u8,
    pub(crate) source_fallback: Option<String>,
    pub(crate) safeguard_item_key: Option<i64>,
    pub(crate) rank_mask: u8,
    pub(crate) rarity_mask: u8,
    pub(crate) is_keep_override_source: bool,
}

// Prepared substats normalize condition/value flags for direct comparisons.
#[derive(Debug)]
pub(crate) struct PreparedRuleSub {
    // Variant is precomputed during configure so matcher loops do zero coercion.
    pub(crate) variant: i64,
    // Threshold stays as f64 because substat values are floating-point in payloads.
    pub(crate) value: f64,
    // Condition is parsed once; hot loops use enum dispatch instead of strings.
    pub(crate) condition: PreparedRuleSubCondition,
}

// Evaluate options mirror EvalMatchesByRecipeOverrides from TS.
// Sets are converted once so each rule scan stays allocation-free.
#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EvaluateOptionsRaw {
    pub(crate) exclude_sources: Option<Vec<String>>,
    pub(crate) exclude_recipe_indices: Option<Vec<i64>>,
    pub(crate) ignore_safeguard_recipe_indices: Option<Vec<i64>>,
    pub(crate) baseline_exclude_sources: Option<Vec<String>>,
}

// Matcher loops compare only three condition families from TS semantics.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub(crate) enum PreparedRuleSubCondition {
    AtLeast,
    AtMost,
    Equal,
}

// Scratch buffers reused across items in evaluate_engine so each item avoids
// per-item HashSet and HashMap allocations in the hot evaluation loop.
pub(crate) struct EvaluateItemScratch {
    // (recipe_idx, first_keep_decision) pairs in encounter order.
    // Combines the roles of the old matching_recipe_seen HashSet and
    // matching_recipe_decisions HashMap into one linear Vec with no heap churn.
    pub(crate) recipe_matches: Vec<(i64, bool)>,
}

impl EvaluateItemScratch {
    pub(crate) fn new() -> Self {
        Self { recipe_matches: Vec::new() }
    }

    // Clear before each item so the capacity is retained and reused.
    fn clear(&mut self) {
        self.recipe_matches.clear();
    }
}

// Prepared options keep all exclusion sets prebuilt for repeated item scans.
// Recipe index lists are stored as Vec rather than HashSet: the sets are small
// (typically <50 entries) and Vec linear scan beats HashSet for that range
// because it avoids hash computation overhead and is cache-friendlier.
#[derive(Debug, Default, Clone)]
pub(crate) struct EvaluateOptionsPrepared {
    exclude_source_bits: u8,
    exclude_source_fallback_set: HashSet<String>,
    exclude_recipe_indices: Vec<i64>,
    ignore_safeguard_recipe_indices: Vec<i64>,
}

impl EvaluateOptionsPrepared {
    // Convert vector-based JS payloads once per evaluate batch.
    pub(crate) fn from_raw(raw: &EvaluateOptionsRaw) -> Self {
        Self {
            exclude_source_bits: raw
                .exclude_sources
                .as_ref()
                .map(|sources| {
                    sources
                        .iter()
                        .fold(0u8, |bits, source| bits | rule_source_bit(source).unwrap_or(0))
                })
                .unwrap_or_default(),
            exclude_source_fallback_set: raw
                .exclude_sources
                .as_ref()
                .map(|sources| {
                    sources
                        .iter()
                        .filter(|source| rule_source_bit(source).is_none())
                        .cloned()
                        .collect::<HashSet<_>>()
                })
                .unwrap_or_default(),
            exclude_recipe_indices: raw
                .exclude_recipe_indices
                .as_ref()
                .map(|indices| indices.iter().copied().collect::<Vec<_>>())
                .unwrap_or_default(),
            ignore_safeguard_recipe_indices: raw
                .ignore_safeguard_recipe_indices
                .as_ref()
                .map(|indices| indices.iter().copied().collect::<Vec<_>>())
                .unwrap_or_default(),
        }
    }

    // Safeguard fallback only needs recipe exclusions, not source filtering.
    fn from_excluded_recipe_indices(exclude_recipe_indices: &[i64]) -> Self {
        Self {
            exclude_recipe_indices: exclude_recipe_indices.to_vec(),
            ..Self::default()
        }
    }

    // Known source tokens are matched via bitmasks; unknowns keep a fallback set.
    fn source_is_excluded(&self, source_bits: u8, source_fallback: Option<&str>) -> bool {
        if source_bits != 0 && (self.exclude_source_bits & source_bits) != 0 {
            return true;
        }
        source_fallback
            .map(|candidate| self.exclude_source_fallback_set.contains(candidate))
            .unwrap_or(false)
    }

    // Safeguard ignore checks are option-aware because recipe indices are optional.
    fn safeguard_cfg_is_ignored(&self, recipe_idx: Option<i64>) -> bool {
        // Vec linear scan is correct here; ignore lists are small (<50 entries).
        recipe_idx
            .map(|idx| self.ignore_safeguard_recipe_indices.contains(&idx))
            .unwrap_or(false)
    }
}

const RULE_SOURCE_BIT_HSF: u8 = 1 << 0;
const RULE_SOURCE_BIT_SFR: u8 = 1 << 1;
const RULE_SOURCE_BIT_FINAL_SELL: u8 = 1 << 2;
const RULE_SOURCE_BIT_SAFEGUARDS: u8 = 1 << 3;

fn rule_source_bit(raw: &str) -> Option<u8> {
    match raw {
        RULE_SOURCE_HSF => Some(RULE_SOURCE_BIT_HSF),
        RULE_SOURCE_SFR => Some(RULE_SOURCE_BIT_SFR),
        RULE_SOURCE_FINAL_SELL => Some(RULE_SOURCE_BIT_FINAL_SELL),
        RULE_SOURCE_SAFEGUARDS => Some(RULE_SOURCE_BIT_SAFEGUARDS),
        _ => None,
    }
}

// Keep options conversion in one helper so all call sites share the same rules.
pub(crate) fn prepare_evaluate_options(raw: &EvaluateOptionsRaw) -> EvaluateOptionsPrepared {
    EvaluateOptionsPrepared::from_raw(raw)
}

// Serialized match result shape consumed by existing worker hooks.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EvalMatch {
    pub(crate) rule_index: usize,
    pub(crate) keep: bool,
    pub(crate) recipe_idx: Option<i64>,
}

// Serialized per-recipe keep/sell decision list.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MatchingRecipeDecision {
    pub(crate) recipe_idx: i64,
    pub(crate) keep: bool,
}

// Serialized item result shape mirrors TesterMatchWorkerItemResult.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EvaluateItemResult {
    pub(crate) item_id: i64,
    pub(crate) first_match: Option<EvalMatch>,
    pub(crate) first_non_excluded_match: Option<EvalMatch>,
    pub(crate) matching_recipe_indices: Vec<i64>,
    pub(crate) matching_recipe_decisions: Vec<MatchingRecipeDecision>,
}

// Only the fields needed for keep/sell fallback logic cross the boundary.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SafeguardCandidateResolveBaseMatchIn {
    pub(crate) keep: bool,
    pub(crate) recipe_idx: Option<i64>,
}

// Candidate collection input extends resolver rows with normalized artifact data.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SafeguardCollectRowIn {
    pub(crate) item: TestItemRaw,
    #[serde(default)]
    pub(crate) base_match_defined: bool,
    pub(crate) base_match: Option<SafeguardCandidateResolveBaseMatchIn>,
    pub(crate) artifact: SafeguardWasmArtifactIn,
}

// Candidate snapshot entry mirrors safeguards.ts SafeguardCandidate shape.
// artifact is intentionally omitted: TS callers reconstruct it from rows[rowIndex].
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SafeguardCollectedCandidateOut {
    pub(crate) row_index: usize,
    pub(crate) item_key: i64,
    pub(crate) group_key: String,
    pub(crate) is_sold: bool,
}

// Candidate snapshot payload also includes sold-item key dedupe set.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SafeguardCollectedSnapshotOut {
    pub(crate) candidates: Vec<SafeguardCollectedCandidateOut>,
    pub(crate) unique_item_keys: Vec<i64>,
}

// Normalize the optional TS condition token into a compact matcher enum.
fn parse_sub_condition(raw_condition: Option<&str>) -> PreparedRuleSubCondition {
    // Missing/unknown tokens follow TS fallback semantics (`>=`).
    let trimmed = raw_condition.unwrap_or(">=").trim();
    match trimmed {
        // Accept only canonical ASCII and Unicode "less than or equal" tokens.
        "<=" | "≤" => PreparedRuleSubCondition::AtMost,
        // Keep equality aliases mapped to exact-value comparisons.
        "==" | "=" => PreparedRuleSubCondition::Equal,
        // Treat all other tokens as `>=` to preserve fallback semantics.
        _ => PreparedRuleSubCondition::AtLeast,
    }
}

// Prepare one rule for fast repeated item evaluation.
pub(crate) fn prepare_rule(raw: RuleRaw) -> PreparedRule {
    let use_flag = raw.Use.unwrap_or(true);
    let keep_flag = raw.Keep.unwrap_or(false);
    let artifact_types = raw.ArtifactType.unwrap_or_default();
    let artifact_sets = raw.ArtifactSet.unwrap_or_default();
    let faction = raw.Faction.unwrap_or(0);
    let level_for_check = raw.LVLForCheck.unwrap_or(LEVEL_ANY_SENTINEL);
    let main_stat_id = raw.MainStatID.unwrap_or(STAT_ID_ANY);
    let main_stat_f = boolish_to_flag(raw.MainStatF.as_ref());
    let source_raw = raw.source;
    let source_bits = source_raw
        .as_deref()
        .and_then(rule_source_bit)
        .unwrap_or(0);
    let source_fallback = if source_bits == 0 {
        source_raw.clone()
    } else {
        None
    };
    let is_keep_override_source = (source_bits & RULE_SOURCE_BIT_SAFEGUARDS) != 0
        || source_fallback.as_deref() == Some(RULE_SOURCE_SAFEGUARDS);
    let recipe_idx = raw.RecipeID.and_then(|cfg| if cfg > 0 { Some(cfg - 1) } else { None });

    let substats = raw
        .Substats
        .unwrap_or_default()
        .into_iter()
        // Skip unsupported substat placeholders here so hot loops stay branch-light.
        .filter_map(|sub| {
            let id = sub.ID.unwrap_or(STAT_ID_ANY);
            // `notAvailable` and `Any` are non-constraints by definition.
            if sub.NotAvailable.unwrap_or(false) || id == STAT_ID_ANY {
                return None;
            }
            Some(PreparedRuleSub {
                variant: sub_to_variant(id, boolish_to_flag(sub.IsFlat.as_ref())),
                value: sub.Value.unwrap_or(0.0),
                condition: parse_sub_condition(sub.Condition.as_deref()),
            })
        })
        .collect::<Vec<_>>();

    PreparedRule {
        use_flag,
        keep_flag,
        artifact_types,
        artifact_sets,
        faction,
        level_for_check,
        main_stat_id,
        main_stat_f,
        substats,
        recipe_idx,
        source_bits,
        source_fallback,
        safeguard_item_key: raw.safeguard_item_key,
        rank_mask: rank_mask(raw.Rank.unwrap_or(0)),
        rarity_mask: rarity_mask(raw.Rarity.unwrap_or(0)),
        is_keep_override_source,
    }
}

// Pull item key for safeguard item-bound rule checks.
fn resolve_item_key(item: &TestItemRaw) -> Option<i64> {
    // Prefer preview/db ids when present; older callers may only pass itemId.
    item.preview_extras
        .as_ref()
        .and_then(|extras| extras.id)
        .or(item.item_id)
}

// Keep one helper for candidate snapshots so item-key precedence is explicit:
// artifact.id (db, positive only) -> item.previewExtras.id -> item.itemId -> 0.
// Negative artifact ids are synthetic placeholders set by App.tsx for custom gear;
// filtering them out keeps detection consistent with resolve_item_key used in match_rule.
fn resolve_collect_row_item_key(row: &SafeguardCollectRowIn) -> i64 {
    row.artifact
        .id
        .filter(|&id| id > 0)
        .or(resolve_item_key(&row.item))
        .unwrap_or(0)
}

// Linear scan for substat value by encoded variant key.
// Items have ≤4 substats, so linear scan has better cache behavior than HashMap.
fn read_sub_value(sub_values: &Option<Vec<(i64, f64)>>, variant: i64) -> Option<f64> {
    sub_values
        .as_ref()
        .and_then(|values| values.iter().find(|(k, _)| *k == variant).map(|(_, v)| *v))
}

// Rule-level predicate copied from src/lib/ruleEval.ts::matchRule.
fn match_rule(rule: &PreparedRule, item: &TestItemRaw) -> bool {
    if !rule.use_flag {
        return false;
    }

    if let Some(required_item_key) = rule.safeguard_item_key {
        if required_item_key != 0 && resolve_item_key(item) != Some(required_item_key) {
            return false;
        }
    }

    if !rule.artifact_types.is_empty() && !rule.artifact_types.contains(&item.slot) {
        return false;
    }

    if !rule.artifact_sets.is_empty() && !rule.artifact_sets.contains(&item.set) {
        return false;
    }

    if rule.faction != 0 && item.faction.unwrap_or(0) != rule.faction {
        return false;
    }

    let rank_bit = bit_for_rank_or_rarity(item.rank);
    if (rule.rank_mask & rank_bit) == 0 {
        return false;
    }

    let rarity_bit = bit_for_rank_or_rarity(item.rarity);
    if (rule.rarity_mask & rarity_bit) == 0 {
        return false;
    }

    if rule.level_for_check != LEVEL_ANY_SENTINEL && rule.level_for_check != item.level {
        return false;
    }

    if rule.main_stat_id != STAT_ID_ANY {
        let expected_main = main_to_variant(rule.main_stat_id, rule.main_stat_f);
        let actual_main = item.main.unwrap_or(STAT_ID_ANY);
        if expected_main != actual_main {
            return false;
        }
    }

    for sub in &rule.substats {
        let raw_value = read_sub_value(&item.sub_values, sub.variant);
        let has_value = raw_value.is_some_and(|v| v.is_finite() && v > 0.0);
        let have = raw_value.unwrap_or(0.0);
        let needs_presence = sub.condition == PreparedRuleSubCondition::AtMost;

        if needs_presence && !has_value {
            return false;
        }

        let ok = match sub.condition {
            PreparedRuleSubCondition::AtLeast => have >= sub.value,
            PreparedRuleSubCondition::AtMost => have <= sub.value,
            PreparedRuleSubCondition::Equal => (have - sub.value).abs() < f64::EPSILON,
        };

        if !ok {
            return false;
        }
    }

    true
}

// Recipe visibility gate copied from evaluateMatchesByRecipe.
fn should_include_recipe(
    recipe_idx: Option<i64>,
    recipe_modes: &[String],
    options: &EvaluateOptionsPrepared,
) -> bool {
    if let Some(idx) = recipe_idx {
        if options.exclude_recipe_indices.contains(&idx) {
            return false;
        }

        if let Some(mode) = recipe_modes.get(idx as usize) {
            return mode != "disabled" && mode != "separator";
        }
    }

    true
}

// Hot-path evaluator writes recipe matches into scratch to avoid per-item
// HashSet and HashMap allocations. Returns only the two first-match results;
// callers read recipe data from scratch.recipe_matches after the call.
pub(crate) fn evaluate_item(
    rules: &[PreparedRule],
    recipe_modes: &[String],
    item: &TestItemRaw,
    options: &EvaluateOptionsPrepared,
    scratch: &mut EvaluateItemScratch,
) -> (Option<EvalMatch>, Option<EvalMatch>) {
    // Reuse scratch capacity; clear retains the allocation.
    scratch.clear();

    let mut first_match: Option<EvalMatch> = None;
    let mut first_non_excluded_match: Option<EvalMatch> = None;
    let mut non_keep_override_keep_matched = false;
    let mut pending_keep_override: Option<EvalMatch> = None;
    let mut fallback_keep_override: Option<EvalMatch> = None;
    let mut any_keep_override_match: Option<EvalMatch> = None;

    let mut prekeep_override: Option<EvalMatch> = None;

    for (rule_index, rule) in rules.iter().enumerate() {
        if !match_rule(rule, item) {
            continue;
        }

        // Track first keep-override hit before recipe gating so the fallback
        // semantics match the TypeScript path without an extra pre-scan.
        if prekeep_override.is_none() && rule.is_keep_override_source {
            prekeep_override = Some(EvalMatch {
                rule_index,
                keep: true,
                recipe_idx: rule.recipe_idx,
            });
        }

        let is_excluded = options.source_is_excluded(
            rule.source_bits,
            rule.source_fallback.as_deref(),
        );

        if !should_include_recipe(rule.recipe_idx, recipe_modes, options) {
            continue;
        }

        let keep = if rule.is_keep_override_source {
            true
        } else {
            rule.keep_flag
        };

        if rule.is_keep_override_source {
            if pending_keep_override.is_none() && !is_excluded {
                pending_keep_override = Some(EvalMatch {
                    rule_index,
                    keep,
                    recipe_idx: rule.recipe_idx,
                });
            }
            if fallback_keep_override.is_none() && !is_excluded {
                fallback_keep_override = Some(EvalMatch {
                    rule_index,
                    keep,
                    recipe_idx: rule.recipe_idx,
                });
            }
            if any_keep_override_match.is_none() && !is_excluded {
                any_keep_override_match = Some(EvalMatch {
                    rule_index,
                    keep,
                    recipe_idx: rule.recipe_idx,
                });
            }
        } else {
            let ignored_for_safeguard = options.safeguard_cfg_is_ignored(rule.recipe_idx);
            if keep && !is_excluded && !ignored_for_safeguard {
                non_keep_override_keep_matched = true;
            }
            if first_match.is_none() && !is_excluded {
                first_match = Some(EvalMatch {
                    rule_index,
                    keep,
                    recipe_idx: rule.recipe_idx,
                });
            }
            if first_non_excluded_match.is_none() && !is_excluded {
                first_non_excluded_match = Some(EvalMatch {
                    rule_index,
                    keep,
                    recipe_idx: rule.recipe_idx,
                });
            }
        }

        if let Some(recipe_idx) = rule.recipe_idx {
            // Linear dedup + first-decision tracking in one pass; recipe counts
            // are small (typically < 50) so linear scan beats HashSet allocation.
            if !scratch.recipe_matches.iter().any(|(k, _)| *k == recipe_idx) {
                scratch.recipe_matches.push((recipe_idx, keep));
            }
        }
    }

    let first_match_is_keep = first_match
        .as_ref()
        .map(|entry| entry.keep && !options.safeguard_cfg_is_ignored(entry.recipe_idx))
        .unwrap_or(false);

    let allow_keep_override = !non_keep_override_keep_matched && !first_match_is_keep;
    if allow_keep_override {
        let keep_candidate = pending_keep_override
            .or(fallback_keep_override)
            .or(any_keep_override_match)
            .or(prekeep_override);

        if let Some(candidate) = keep_candidate {
            if first_non_excluded_match.is_none() {
                first_non_excluded_match = Some(EvalMatch {
                    rule_index: candidate.rule_index,
                    keep: candidate.keep,
                    recipe_idx: candidate.recipe_idx,
                });
            }
            first_match = Some(candidate);
        }
    }

    // Keep first-match ownership while mirroring fallback semantics for non-excluded.
    let resolved_first_non_excluded = first_non_excluded_match.or_else(|| {
        first_match.as_ref().map(|entry| EvalMatch {
            rule_index: entry.rule_index,
            keep: entry.keep,
            recipe_idx: entry.recipe_idx,
        })
    });
    (first_match, resolved_first_non_excluded)
}

// Resolve keep/sell outcomes for safeguard candidate rows.
// Rows reuse cached base matches when possible and only re-evaluate as needed.
fn resolve_safeguard_candidate_keep_flags_core(
    rows: &[SafeguardCollectRowIn],
    prepared_rules: &[PreparedRule],
    recipe_modes: &[String],
    ignore_safeguard_recipe_indices: &[i64],
) -> Vec<bool> {
    let has_ignored_recipes = !ignore_safeguard_recipe_indices.is_empty();
    // eval_options reuses the same Vec slice (already a Vec<i64>) — no extra allocation.
    let eval_options =
        EvaluateOptionsPrepared::from_excluded_recipe_indices(ignore_safeguard_recipe_indices);

    // One shared scratch per evaluation pass avoids per-row allocations.
    let mut scratch = EvaluateItemScratch::new();
    let mut keep_flags = Vec::<bool>::with_capacity(rows.len());
    for row in rows {
        // Reuse explicit base-match decisions unless the owning recipe is ignored.
        if row.base_match_defined {
            let base_recipe_idx = row.base_match.as_ref().and_then(|entry| entry.recipe_idx);
            // Vec linear scan; ignore_safeguard_recipe_indices is small (<50 entries).
            let base_recipe_ignored = has_ignored_recipes
                && base_recipe_idx
                    .map(|recipe_idx| ignore_safeguard_recipe_indices.contains(&recipe_idx))
                    .unwrap_or(false);
            if !base_recipe_ignored {
                keep_flags.push(row.base_match.as_ref().map(|entry| entry.keep).unwrap_or(false));
                continue;
            }
        }

        // No base rules means the row is sold by default.
        if prepared_rules.is_empty() {
            keep_flags.push(false);
            continue;
        }

        // Two-pass evaluate_item for rows whose base match came from an ignored recipe.
        // The base_match was computed with the full rule set (ignored recipe included), so
        // its keep/sell decision cannot be reused — the ignored recipe may have been the
        // first matching rule, masking a different outcome from the remaining rules.
        // We re-evaluate with eval_options excluding the ignored recipe so the result
        // reflects what the sell engine would decide without safeguard interference.
        let (first_match, _) =
            evaluate_item(prepared_rules, recipe_modes, &row.item, &eval_options, &mut scratch);
        keep_flags.push(first_match.map(|entry| entry.keep).unwrap_or(false));
    }
    keep_flags
}

// Safeguard candidate matching helper keeps base-match fallback and filtered
// re-evaluation semantics in Rust so TS only handles row/object assembly.

// Safeguard candidate snapshot builder keeps key derivation + sold filtering
// in Rust so TS only reattaches row references for existing call sites.
pub(crate) fn collect_safeguard_candidates_core(
    rows: &[SafeguardCollectRowIn],
    prepared_rules: &[PreparedRule],
    recipe_modes: &[String],
    ignore_safeguard_recipe_indices: &[i64],
) -> Result<SafeguardCollectedSnapshotOut, JsValue> {
    let keep_flags = resolve_safeguard_candidate_keep_flags_core(
        rows,
        prepared_rules,
        recipe_modes,
        ignore_safeguard_recipe_indices,
    );
    // Keep candidate/flag vectors aligned so item ownership never shifts.
    if keep_flags.len() != rows.len() {
        return Err(JsValue::from_str(
            "Safeguard candidate collect produced mismatched keep-flag length",
        ));
    }

    // Build candidate rows in encounter order for deterministic UI snapshots.
    let mut unique_item_keys = HashSet::<i64>::new();
    let mut candidates = Vec::<SafeguardCollectedCandidateOut>::with_capacity(rows.len());
    for (idx, row) in rows.iter().enumerate() {
        // Keep item-key derivation aligned with rule-item matching semantics.
        let item_key = resolve_collect_row_item_key(row);
        // Group key formatting is shared with safeguard parser/wasm exports.
        let group_key = safeguard_group_key_from_parts(
            row.artifact.slot,
            row.artifact.set,
            row.artifact.main_stat,
            row.artifact.faction,
        );
        let is_sold = !keep_flags[idx];
        if is_sold {
            unique_item_keys.insert(item_key);
        }
        // artifact is omitted: TS callers look it up via rows[rowIndex] directly.
        candidates.push(SafeguardCollectedCandidateOut {
            row_index: idx,
            item_key,
            group_key,
            is_sold,
        });
    }

    // Sold-key output is sorted for deterministic fingerprints.
    let mut unique_sorted = unique_item_keys.into_iter().collect::<Vec<_>>();
    unique_sorted.sort_unstable();
    Ok(SafeguardCollectedSnapshotOut {
        candidates,
        unique_item_keys: unique_sorted,
    })
}
