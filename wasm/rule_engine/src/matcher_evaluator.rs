use super::*;

// Keep only the data needed in hot matcher loops.
// Masks and config indices are precomputed at configure time.
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
    pub(crate) cfg_idx: Option<i64>,
    pub(crate) source: Option<String>,
    pub(crate) keep_unique_item_key: Option<i64>,
    pub(crate) rank_mask: u8,
    pub(crate) rarity_mask: u8,
    pub(crate) is_keep_override_source: bool,
}

// Prepared substats normalize condition/value flags for direct comparisons.
#[derive(Debug)]
pub(crate) struct PreparedRuleSub {
    pub(crate) id: i64,
    pub(crate) value: f64,
    pub(crate) is_flat: i64,
    pub(crate) condition: String,
    pub(crate) not_available: bool,
}

// Evaluate options mirror EvalMatchesByConfigOptions from TS.
// Sets are converted once so each rule scan stays allocation-free.
#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EvaluateOptionsRaw {
    pub(crate) exclude_sources: Option<Vec<String>>,
    pub(crate) exclude_config_indices: Option<Vec<i64>>,
    pub(crate) ignore_keep_unique_config_indices: Option<Vec<i64>>,
    pub(crate) baseline_exclude_sources: Option<Vec<String>>,
}

// Serialized match result shape consumed by existing worker hooks.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EvalMatch {
    pub(crate) rule_index: usize,
    pub(crate) keep: bool,
    pub(crate) cfg_idx: Option<i64>,
}

// Serialized per-config keep/sell decision list.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MatchingConfigDecision {
    pub(crate) cfg_idx: i64,
    pub(crate) keep: bool,
}

// Serialized item result shape mirrors TesterMatchWorkerItemResult.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EvaluateItemResult {
    pub(crate) item_id: i64,
    pub(crate) first_match: Option<EvalMatch>,
    pub(crate) first_non_excluded_match: Option<EvalMatch>,
    pub(crate) matching_config_indices: Vec<i64>,
    pub(crate) matching_config_decisions: Vec<MatchingConfigDecision>,
}

// Keep-unique candidate resolver consumes compact row payloads from TS.
// `base_match_defined` distinguishes `undefined` from explicit `null`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KeepUniqueCandidateResolveRowIn {
    item: TestItemRaw,
    #[serde(default)]
    base_match_defined: bool,
    base_match: Option<KeepUniqueCandidateResolveBaseMatchIn>,
}

// Only the fields needed for keep/sell fallback logic cross the boundary.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KeepUniqueCandidateResolveBaseMatchIn {
    pub(crate) keep: bool,
    pub(crate) cfg_idx: Option<i64>,
}

// Candidate collection input extends resolver rows with normalized artifact data.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KeepUniqueCollectRowIn {
    pub(crate) item: TestItemRaw,
    #[serde(default)]
    pub(crate) base_match_defined: bool,
    pub(crate) base_match: Option<KeepUniqueCandidateResolveBaseMatchIn>,
    pub(crate) artifact: KeepUniqueWasmArtifactIn,
}

// Candidate snapshot entry mirrors keepUniques.ts KeepUniqueCandidate shape.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KeepUniqueCollectedCandidateOut {
    pub(crate) row_index: usize,
    pub(crate) item_key: i64,
    pub(crate) group_key: String,
    pub(crate) is_sold: bool,
    pub(crate) artifact: KeepUniqueWasmArtifactIn,
}

// Candidate snapshot payload also includes sold-item key dedupe set.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KeepUniqueCollectedSnapshotOut {
    pub(crate) candidates: Vec<KeepUniqueCollectedCandidateOut>,
    pub(crate) unique_item_keys: Vec<i64>,
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
    let source = raw.source;
    let is_keep_override_source = source.as_deref() == Some(RULE_SOURCE_KEEP_UNIQUES);
    let cfg_idx = raw.ConfigID.and_then(|cfg| if cfg > 0 { Some(cfg - 1) } else { None });

    let substats = raw
        .Substats
        .unwrap_or_default()
        .into_iter()
        .map(|sub| PreparedRuleSub {
            id: sub.ID.unwrap_or(STAT_ID_ANY),
            value: sub.Value.unwrap_or(0.0),
            is_flat: boolish_to_flag(sub.IsFlat.as_ref()),
            condition: sub.Condition.unwrap_or_else(|| ">=".to_string()).trim().to_string(),
            not_available: sub.NotAvailable.unwrap_or(false),
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
        cfg_idx,
        source,
        keep_unique_item_key: raw.keep_unique_item_key,
        rank_mask: rank_mask(raw.Rank.unwrap_or(0)),
        rarity_mask: rarity_mask(raw.Rarity.unwrap_or(0)),
        is_keep_override_source,
    }
}

// Pull item key for keep-unique item-bound rule checks.
fn resolve_item_key(item: &TestItemRaw) -> Option<i64> {
    item.item_id.or(item.preview_extras.as_ref().and_then(|extras| extras.id))
}

// Fast helper for optional numeric value map lookup by encoded variant key.
fn read_sub_value(sub_values: &Option<HashMap<String, f64>>, variant: i64) -> Option<f64> {
    sub_values
        .as_ref()
        .and_then(|values| values.get(&variant.to_string()).copied())
}

// Rule-level predicate copied from src/lib/ruleEval.ts::matchRule.
fn match_rule(rule: &PreparedRule, item: &TestItemRaw) -> bool {
    if !rule.use_flag {
        return false;
    }

    if let Some(required_item_key) = rule.keep_unique_item_key {
        if required_item_key != 0 && resolve_item_key(item) != Some(required_item_key) {
            return false;
        }
    }

    if !rule.artifact_types.is_empty() && !rule.artifact_types.iter().any(|slot| *slot == item.slot) {
        return false;
    }

    if !rule.artifact_sets.is_empty() && !rule.artifact_sets.iter().any(|set_id| *set_id == item.set) {
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

    for sub in rule
        .substats
        .iter()
        .filter(|entry| !entry.not_available && entry.id != STAT_ID_ANY)
    {
        let variant = sub_to_variant(sub.id, sub.is_flat);
        let raw_value = read_sub_value(&item.sub_values, variant);
        let has_value = raw_value.is_some_and(|v| v.is_finite() && v > 0.0);
        let have = raw_value.unwrap_or(0.0);
        let needs_presence = matches!(sub.condition.as_str(), "<=" | "<" | "=<" | "≤");

        if needs_presence && !has_value {
            return false;
        }

        let ok = match sub.condition.as_str() {
            ">=" => have >= sub.value,
            "<=" => have <= sub.value,
            "==" | "=" => (have - sub.value).abs() < f64::EPSILON,
            _ => have >= sub.value,
        };

        if !ok {
            return false;
        }
    }

    true
}

// Config visibility gate copied from evaluateMatchesByConfig.
fn should_include_config(
    cfg_idx: Option<i64>,
    config_modes: &[String],
    exclude_config_indices: &HashSet<i64>,
) -> bool {
    if let Some(idx) = cfg_idx {
        if exclude_config_indices.contains(&idx) {
            return false;
        }

        if let Some(mode) = config_modes.get(idx as usize) {
            return mode != "disabled" && mode != "separator";
        }
    }

    true
}

// Item-level evaluator copied from evaluateMatchesByConfig with full-rule scans.
pub(crate) fn evaluate_item(
    rules: &[PreparedRule],
    config_modes: &[String],
    item: &TestItemRaw,
    options: &EvaluateOptionsRaw,
) -> (Option<EvalMatch>, Option<EvalMatch>, Vec<i64>, Vec<MatchingConfigDecision>) {
    let exclude_source_set = options
        .exclude_sources
        .as_ref()
        .map(|sources| sources.iter().cloned().collect::<HashSet<_>>())
        .unwrap_or_default();

    let exclude_config_indices = options
        .exclude_config_indices
        .as_ref()
        .map(|indices| indices.iter().copied().collect::<HashSet<_>>())
        .unwrap_or_default();

    let ignore_keep_unique_config_indices = options
        .ignore_keep_unique_config_indices
        .as_ref()
        .map(|indices| indices.iter().copied().collect::<HashSet<_>>())
        .unwrap_or_default();

    let is_keep_unique_ignored = |cfg_idx: Option<i64>| -> bool {
        cfg_idx
            .map(|idx| ignore_keep_unique_config_indices.contains(&idx))
            .unwrap_or(false)
    };

    let mut first_match: Option<EvalMatch> = None;
    let mut first_non_excluded_match: Option<EvalMatch> = None;
    let mut non_keep_override_keep_matched = false;
    let mut pending_keep_override: Option<EvalMatch> = None;
    let mut fallback_keep_override: Option<EvalMatch> = None;
    let mut any_keep_override_match: Option<EvalMatch> = None;
    // Preserve first-seen config order so UI chips can remove only the true
    // primary config entry without relying on sorted index order.
    let mut matching_configs = Vec::<i64>::new();
    // Keep O(1) duplicate suppression while retaining encounter order.
    let mut matching_config_seen = HashSet::<i64>::new();
    let mut matching_config_decisions = HashMap::<i64, bool>::new();

    let mut prekeep_override: Option<EvalMatch> = None;

    for (rule_index, rule) in rules.iter().enumerate() {
        if !match_rule(rule, item) {
            continue;
        }

        // Track first keep-override hit before config gating so the fallback
        // semantics match the TypeScript path without an extra pre-scan.
        if prekeep_override.is_none() && rule.is_keep_override_source {
            prekeep_override = Some(EvalMatch {
                rule_index,
                keep: true,
                cfg_idx: rule.cfg_idx,
            });
        }

        let source = rule.source.as_deref();
        let is_excluded = source
            .map(|candidate| exclude_source_set.contains(candidate))
            .unwrap_or(false);

        if !should_include_config(rule.cfg_idx, config_modes, &exclude_config_indices) {
            continue;
        }

        let keep = if rule.is_keep_override_source {
            true
        } else {
            rule.keep_flag
        };

        let matched = EvalMatch {
            rule_index,
            keep,
            cfg_idx: rule.cfg_idx,
        };

        if rule.is_keep_override_source {
            if pending_keep_override.is_none() && !is_excluded {
                pending_keep_override = Some(matched.clone());
            }
            if fallback_keep_override.is_none() && !is_excluded {
                fallback_keep_override = Some(matched.clone());
            }
            if any_keep_override_match.is_none() && !is_excluded {
                any_keep_override_match = Some(matched.clone());
            }
        } else {
            let ignored_for_keep_unique = is_keep_unique_ignored(rule.cfg_idx);
            if keep && !is_excluded && !ignored_for_keep_unique {
                non_keep_override_keep_matched = true;
            }
            if first_match.is_none() && !is_excluded {
                first_match = Some(matched.clone());
            }
            if first_non_excluded_match.is_none() && !is_excluded {
                first_non_excluded_match = Some(matched.clone());
            }
        }

        if let Some(cfg_idx) = rule.cfg_idx {
            // Keep first-seen ordering for compatibility with legacy JS matcher output.
            if matching_config_seen.insert(cfg_idx) {
                matching_configs.push(cfg_idx);
            }
            // First keep/sell decision per config still wins, matching prior behavior.
            matching_config_decisions.entry(cfg_idx).or_insert(keep);
        }
    }

    let first_match_is_keep = first_match
        .as_ref()
        .map(|entry| entry.keep && !is_keep_unique_ignored(entry.cfg_idx))
        .unwrap_or(false);

    let allow_keep_override = !non_keep_override_keep_matched && !first_match_is_keep;
    if allow_keep_override {
        let keep_candidate = pending_keep_override
            .or(fallback_keep_override)
            .or(any_keep_override_match)
            .or(prekeep_override);

        if let Some(candidate) = keep_candidate {
            first_match = Some(candidate.clone());
            if first_non_excluded_match.is_none() {
                first_non_excluded_match = Some(candidate);
            }
        }
    }

    // Config indices are already in encounter order; clone into the output payload.
    let matching_config_indices = matching_configs;
    let matching_config_decisions = matching_config_indices
        .iter()
        .map(|cfg_idx| MatchingConfigDecision {
            cfg_idx: *cfg_idx,
            keep: *matching_config_decisions.get(cfg_idx).unwrap_or(&false),
        })
        .collect::<Vec<_>>();

    (
        first_match.clone(),
        first_non_excluded_match.or(first_match),
        matching_config_indices,
        matching_config_decisions,
    )
}

// Resolve keep/sell outcomes for keep-unique candidate rows.
// Rows reuse cached base matches when possible and only re-evaluate as needed.
fn resolve_keep_unique_candidate_keep_flags_core(
    rows: &[KeepUniqueCandidateResolveRowIn],
    prepared_rules: &[PreparedRule],
    config_modes: &[String],
    ignore_keep_unique_config_indices: &[i64],
) -> Vec<bool> {
    let has_ignored_configs = !ignore_keep_unique_config_indices.is_empty();
    let ignored_set = ignore_keep_unique_config_indices
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let eval_options = EvaluateOptionsRaw {
        exclude_config_indices: if has_ignored_configs {
            Some(ignore_keep_unique_config_indices.to_vec())
        } else {
            None
        },
        ..EvaluateOptionsRaw::default()
    };

    let mut keep_flags = Vec::<bool>::with_capacity(rows.len());
    for row in rows {
        // Reuse explicit base-match decisions unless the owning config is ignored.
        if row.base_match_defined {
            let base_cfg_idx = row.base_match.as_ref().and_then(|entry| entry.cfg_idx);
            let base_cfg_ignored = has_ignored_configs
                && base_cfg_idx
                    .map(|cfg_idx| ignored_set.contains(&cfg_idx))
                    .unwrap_or(false);
            if !base_cfg_ignored {
                keep_flags.push(row.base_match.as_ref().map(|entry| entry.keep).unwrap_or(false));
                continue;
            }
        }

        // No base rules means the row is sold by default.
        if prepared_rules.is_empty() {
            keep_flags.push(false);
            continue;
        }

        // Re-evaluate with ignored configs excluded to mirror TS semantics.
        let (first_match, _, _, _) =
            evaluate_item(prepared_rules, config_modes, &row.item, &eval_options);
        keep_flags.push(first_match.map(|entry| entry.keep).unwrap_or(false));
    }
    keep_flags
}

// Keep-unique candidate matching helper keeps base-match fallback and filtered
// re-evaluation semantics in Rust so TS only handles row/object assembly.

// Keep-unique candidate snapshot builder keeps key derivation + sold filtering
// in Rust so TS only reattaches row references for existing call sites.
pub(crate) fn collect_keep_unique_candidates_core(
    rows: &[KeepUniqueCollectRowIn],
    prepared_rules: &[PreparedRule],
    config_modes: &[String],
    ignore_keep_unique_config_indices: &[i64],
) -> Result<KeepUniqueCollectedSnapshotOut, JsValue> {
    // Reuse keep-flag resolution so base-match fallback stays single-sourced.
    let resolver_rows = rows
        .iter()
        .map(|row| KeepUniqueCandidateResolveRowIn {
            item: row.item.clone(),
            base_match_defined: row.base_match_defined,
            base_match: row.base_match.clone(),
        })
        .collect::<Vec<_>>();
    let keep_flags = resolve_keep_unique_candidate_keep_flags_core(
        &resolver_rows,
        prepared_rules,
        config_modes,
        ignore_keep_unique_config_indices,
    );
    // Keep candidate/flag vectors aligned so item ownership never shifts.
    if keep_flags.len() != rows.len() {
        return Err(JsValue::from_str(
            "Keep-unique candidate collect produced mismatched keep-flag length",
        ));
    }

    // Build candidate rows in encounter order for deterministic UI snapshots.
    let mut unique_item_keys = HashSet::<i64>::new();
    let mut candidates = Vec::<KeepUniqueCollectedCandidateOut>::with_capacity(rows.len());
    for (idx, row) in rows.iter().enumerate() {
        // Item-key parity: tester item id first, then artifact id, else zero.
        let item_key = row.item.item_id.or(row.artifact.id).unwrap_or(0);
        // Non-accessory slots always collapse faction to zero in group keys.
        let normalized_faction =
            keep_unique_normalized_faction_for_slot(row.artifact.slot, row.artifact.faction);
        let group_key = format!(
            "{}:{}:{}:{}",
            row.artifact.slot, row.artifact.set, row.artifact.main_stat, normalized_faction
        );
        let is_sold = !keep_flags[idx];
        if is_sold {
            unique_item_keys.insert(item_key);
        }
        candidates.push(KeepUniqueCollectedCandidateOut {
            row_index: idx,
            item_key,
            group_key,
            is_sold,
            artifact: row.artifact.clone(),
        });
    }

    // Sold-key output is sorted for deterministic fingerprints.
    let mut unique_sorted = unique_item_keys.into_iter().collect::<Vec<_>>();
    unique_sorted.sort_unstable();
    Ok(KeepUniqueCollectedSnapshotOut {
        candidates,
        unique_item_keys: unique_sorted,
    })
}
