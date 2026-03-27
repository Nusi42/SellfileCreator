use super::*;
use crate::safeguards::{build_safeguard_rules_core, safeguard_clone_any_substats};

// Safeguard-injected keep dedupe mirrors TS semantics with typed keys:
// canonical for non-safeguard rows, placeholder canonical for synthetic rows,
// and item+level for concrete safeguard item projections.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum SafeguardInjectedKeepKey {
    Canonical(rule_dedupe::CollapseCanonicalKey),
    // Rarity is included alongside the canonical key so same-rank placeholder
    // rules that differ only by rarity are not incorrectly collapsed — each
    // rarity variant is a distinct HSF target for anticipate-gaps mode.
    PlaceholderCanonical(rule_dedupe::CollapseCanonicalKey, i64),
    ItemLevel { item_key: i64, level: i64 },
}

// Core implementation flattens rule batches respecting an optional total limit.
// Renamed from `flatten_rule_batches_with_total_limit_value` (JsValue I/O removed).
pub fn flatten_rule_batches_with_total_limit_core(
    base_count: i64,
    total_limit: i64,
    batches: Vec<Vec<RuleRaw>>,
) -> Vec<RuleRaw> {
    // Negative limit means unlimited mode (same as TS null branch).
    let has_limit = total_limit > 0;
    let limit = if has_limit { total_limit } else { i64::MAX };
    // Running total starts from base-rule length exactly like merge.ts.
    let mut running_total = base_count.max(0);
    let mut out = Vec::<RuleRaw>::new();
    for batch in batches {
        // Ignore empty batches to mirror TS addBatch helper behavior.
        if batch.is_empty() {
            continue;
        }
        // Stop once the configured total limit is already reached.
        if has_limit && running_total >= limit {
            break;
        }
        // If the next batch would overflow the total limit, stop without partial append.
        if has_limit && running_total + batch.len() as i64 > limit {
            break;
        }
        running_total += batch.len() as i64;
        out.extend(batch.into_iter());
    }
    // Return flattened custom rules ready for merged-rule orchestration.
    out
}

// Shared helper returns sorted + deduped explicit set ids (including no-set).
fn final_sell_explicit_set_ids(all_known_set_ids: &[i64]) -> Vec<i64> {
    // Include the no-set sentinel so accessories with no set stay covered.
    let mut all_sets = vec![ACCESSORY_NO_SET_ID];
    // Append caller-provided known ids; dedupe and sort after merge.
    all_sets.extend(all_known_set_ids.iter().copied());
    // Shared helper keeps final-sell selector normalization aligned everywhere.
    sorted_unique_i64(&all_sets)
}

// Build Final Sell rules in Rust so merge.ts no longer owns level/type loops.
pub fn build_final_sell_rules_core(
    remainder: Option<&FinalSellRemainderIn>,
    all_known_set_ids: &[i64],
) -> Vec<RuleRaw> {
    let Some(final_sell) = remainder else {
        return Vec::<RuleRaw>::new();
    };
    // Require at least one scope toggle and one selected level.
    if !(final_sell.artifacts || final_sell.accessories) {
        return Vec::<RuleRaw>::new();
    }
    if final_sell.levels.is_empty() {
        return Vec::<RuleRaw>::new();
    }

    // Normalize selected levels into a lookup set.
    let selected_levels = final_sell
        .levels
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    // Match logicHub defaults: unknown mode collapses to "any".
    let sets_mode = final_sell
        .sets_mode
        .as_deref()
        .map(|value| value.trim().to_ascii_lowercase())
        .unwrap_or_else(|| FINAL_SELL_SETS_MODE_ANY.to_string());
    let explicit_sets = final_sell_explicit_set_ids(all_known_set_ids);

    // Slot combos mirror merge.ts (armor-only, accessory-only, or combined).
    // Reuse generated slot order constants so armor/accessory partitions are SSOT.
    let art_types = PREFERRED_ARTIFACT_TYPE_ORDER[..6].to_vec();
    let acc_types = PREFERRED_ARTIFACT_TYPE_ORDER[6..].to_vec();
    let type_combos = if final_sell.artifacts && final_sell.accessories {
        let mut merged = art_types.clone();
        merged.extend(acc_types.iter().copied());
        vec![merged]
    } else if final_sell.artifacts {
        vec![art_types]
    } else if final_sell.accessories {
        vec![acc_types]
    } else {
        Vec::<Vec<i64>>::new()
    };
    if type_combos.is_empty() {
        return Vec::<RuleRaw>::new();
    }

    // Build both explicit + any coverage rows so unchecked modes emit Use=false rows.
    let coverage_modes = [FINAL_SELL_SETS_MODE_EXPLICIT, FINAL_SELL_SETS_MODE_ANY];
    let all_levels = [
        LEVEL_MILESTONE_0,
        LEVEL_MILESTONE_4,
        LEVEL_MILESTONE_8,
        LEVEL_MILESTONE_12,
        LEVEL_MILESTONE_16,
    ];
    let mut rules = Vec::<RuleRaw>::new();
    for level in all_levels {
        for mode in coverage_modes {
            // Enabled rows only when the mode matches and the level is selected.
            let enabled = mode == sets_mode;
            let use_explicit_sets = mode == FINAL_SELL_SETS_MODE_EXPLICIT;
            let use_flag = enabled && selected_levels.contains(&level);
            for combo in &type_combos {
                let mut sorted_types = combo.clone();
                sort_artifact_types_in_place(&mut sorted_types);
                let mut rule = RuleRaw {
                    RecipeID: None,
                    RecipeName: None,
                    Keep: Some(false),
                    IsRuleTypeAND: Some(false),
                    Use: Some(use_flag),
                    ArtifactSet: if use_explicit_sets {
                        Some(explicit_sets.clone())
                    } else {
                        None
                    },
                    ArtifactType: if sorted_types.is_empty() {
                        None
                    } else {
                        Some(sorted_types)
                    },
                    Rank: Some(0),
                    Rarity: Some(0),
                    MainStatID: Some(STAT_ID_ANY),
                    MainStatF: Some(MAIN_STAT_F_DEFAULT_FLAG),
                    LVLForCheck: Some(level),
                    Faction: Some(0),
                    Substats: Some(safeguard_clone_any_substats()),
                    source: Some(RULE_SOURCE_FINAL_SELL.to_string()),
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
                // Preserve merge.ts metadata marker for explicit-all-sets rows.
                if use_explicit_sets {
                    rule.all_known_sets = Some(true);
                }
                rules.push(rule);
            }
        }
    }
    rules
}

// Merge pipeline core combines base/custom/final-sell/safeguard rows and
// assigns stable preview line indices in one Rust-owned orchestration step.
pub fn compute_merged_rules_core(input: ComputeMergedRulesIn) -> Vec<RuleRaw> {
    // Destructure once so field ownership is explicit and borrow-checker-friendly.
    let ComputeMergedRulesIn {
        base_rules,
        custom_rules,
        final_sell_remainder,
        all_known_set_ids,
        omit_disabled_before_safeguards,
        dedupe_before_safeguards,
        safeguard_enabled,
        safeguard_rules,
        safeguard_detection,
        safeguard_recipe_id_base,
    } = input;
    // Safeguard rows were already parsed defensively at payload deserialize time.
    let parsed_safeguard_rules = safeguard_rules;
    // Base rows always carry the hsf source marker unless explicitly provided.
    let mut base_rules = base_rules;
    for rule in &mut base_rules {
        if rule.source.is_none() {
            rule.source = Some(RULE_SOURCE_HSF.to_string());
        }
    }
    // Custom rows default to sfr source for downstream chip rendering.
    let mut custom_rules = custom_rules;
    for rule in &mut custom_rules {
        if rule.source.is_none() {
            rule.source = Some(RULE_SOURCE_SFR.to_string());
        }
    }

    // Build final-sell rows from recipe payload (if enabled).
    let final_sell_rules = build_final_sell_rules_core(
        final_sell_remainder.as_ref(),
        &all_known_set_ids,
    );

    // Merge generated rows before safeguards so app-level transforms can run once.
    let mut generated_rules = Vec::<RuleRaw>::new();
    generated_rules.extend(base_rules);
    generated_rules.extend(custom_rules);
    generated_rules.extend(final_sell_rules);
    // Omit-disabled now applies to the in-app pipeline, not only file export.
    if omit_disabled_before_safeguards {
        generated_rules.retain(|rule| rule.Use.unwrap_or(true));
    }
    // Default dedupe now transforms the in-app ruleset before safeguards.
    if dedupe_before_safeguards {
        generated_rules = rule_dedupe::dedupe_hsf_rules_for_export_core(&generated_rules);
    }

    // Safeguard merge prepends injected rows ahead of the transformed base set.
    let mut merged = if safeguard_enabled {
        let base_without_keep = generated_rules
            .iter()
            .filter(|rule| rule.source.as_deref() != Some(RULE_SOURCE_SAFEGUARDS))
            .cloned()
            .collect::<Vec<_>>();
        let candidate_keep_rules = if safeguard_detection.is_some() && !parsed_safeguard_rules.is_empty() {
            build_safeguard_rules_core(
                &parsed_safeguard_rules,
                safeguard_detection.as_ref(),
                safeguard_recipe_id_base.unwrap_or(-1),
            )
        } else {
            Vec::<RuleRaw>::new()
        };
        // Base already includes custom/final rows after transforms, so one input is sufficient.
        let sorted_keep_rules = merge_safeguard_injected_rules_core(
            base_without_keep.clone(),
            Vec::<RuleRaw>::new(),
            candidate_keep_rules,
        );
        let mut with_keep = sorted_keep_rules;
        with_keep.extend(base_without_keep);
        with_keep
    } else {
        generated_rules
    };
    // Assign stable preview line indices used by filtered tables.
    for (idx, rule) in merged.iter_mut().enumerate() {
        rule.line_idx = Some(idx as i64);
    }
    merged
}

// Safeguard merge helper mirrors merge.ts injected-rule filtering/sorting.
fn merge_safeguard_injected_rules_core(
    base_rules: Vec<RuleRaw>,
    custom_rules: Vec<RuleRaw>,
    candidate_keep_rules: Vec<RuleRaw>,
) -> Vec<RuleRaw> {
    // Remove previously injected safeguard rows from base key collection.
    let mut base_custom_keep_keys = HashSet::<rule_dedupe::CollapseCanonicalKey>::new();
    for rule in base_rules
        .iter()
        .filter(|entry| entry.source.as_deref() != Some(RULE_SOURCE_SAFEGUARDS))
    {
        if rule.Keep.unwrap_or(false) {
            base_custom_keep_keys.insert(rule_dedupe::collapse_canonical_key(rule));
        }
    }
    // Custom keep rows also block injected duplicates.
    for rule in &custom_rules {
        if rule.Keep.unwrap_or(false) {
            base_custom_keep_keys.insert(rule_dedupe::collapse_canonical_key(rule));
        }
    }

    // Preserve TS dedupe key behavior for placeholders vs item+level rows.
    let mut injected_keep_keys = HashSet::<SafeguardInjectedKeepKey>::new();
    let mut filtered = Vec::<RuleRaw>::new();
    for rule in candidate_keep_rules {
        let canonical = rule_dedupe::collapse_canonical_key(&rule);
        if base_custom_keep_keys.contains(&canonical) {
            continue;
        }
        let is_safeguard_source = rule.source.as_deref() == Some(RULE_SOURCE_SAFEGUARDS);
        let dedupe_key = if is_safeguard_source {
            if rule.safeguard_placeholder.unwrap_or(false) {
                // Include rarity so same-rank-different-rarity placeholder rules
                // each survive; CollapseCanonicalKey intentionally omits rarity
                // for the epic/legendary collapse pass, but placeholders need it.
                SafeguardInjectedKeepKey::PlaceholderCanonical(canonical.clone(), rule.Rarity.unwrap_or(0))
            } else {
                let item_key = rule.safeguard_item_key.unwrap_or(JS_MAX_SAFE_INTEGER_I64);
                let level = rule.LVLForCheck.unwrap_or(LEVEL_ANY_SENTINEL);
                SafeguardInjectedKeepKey::ItemLevel { item_key, level }
            }
        } else {
            SafeguardInjectedKeepKey::Canonical(canonical.clone())
        };
        if injected_keep_keys.contains(&dedupe_key) {
            continue;
        }
        injected_keep_keys.insert(dedupe_key);
        filtered.push(rule);
    }

    // Match merge.ts ordering: rule ordinal (groups all rows for one safeguard together),
    // then level, placeholder rank, item key — so each safeguard's rows form a contiguous block.
    let mut sortable = filtered
        .into_iter()
        .enumerate()
        .map(|(idx, rule)| {
            let canonical = rule_dedupe::collapse_canonical_key(&rule);
            SafeguardMergeSortEntry {
                level_idx: level_order_value(rule.LVLForCheck),
                rule_ordinal: rule.safeguard_rule_ordinal.unwrap_or(JS_MAX_SAFE_INTEGER_I64),
                placeholder_rank: if rule.safeguard_placeholder.unwrap_or(false) {
                    1
                } else {
                    0
                },
                item_key: rule.safeguard_item_key.unwrap_or(JS_MAX_SAFE_INTEGER_I64),
                idx,
                canonical,
                rule,
            }
        })
        .collect::<Vec<_>>();
    sortable.sort_by(|left, right| {
        // Primary: safeguard ordinal — all rows for a single safeguard rule stay together.
        if left.rule_ordinal != right.rule_ordinal {
            return left.rule_ordinal.cmp(&right.rule_ordinal);
        }
        // Secondary: level — within a safeguard block rows ascend by level milestone.
        if left.level_idx != right.level_idx {
            return left.level_idx.cmp(&right.level_idx);
        }
        if left.placeholder_rank != right.placeholder_rank {
            return left.placeholder_rank.cmp(&right.placeholder_rank);
        }
        if left.item_key != right.item_key {
            return left.item_key.cmp(&right.item_key);
        }
        if left.canonical != right.canonical {
            return left.canonical.cmp(&right.canonical);
        }
        left.idx.cmp(&right.idx)
    });
    sortable
        .into_iter()
        .map(|entry| entry.rule)
        .collect::<Vec<_>>()
}

// Public merge helper — renamed from `merge_safeguard_injected_rules_value` (JsValue I/O removed).
pub fn merge_safeguard_injected_rules_core_fn(
    base_rules: Vec<RuleRaw>,
    custom_rules: Vec<RuleRaw>,
    candidate_keep_rules: Vec<RuleRaw>,
) -> Vec<RuleRaw> {
    merge_safeguard_injected_rules_core(base_rules, custom_rules, candidate_keep_rules)
}

// Export dedupe — renamed from `dedupe_hsf_rules_for_export_value`.
pub fn dedupe_hsf_rules_for_export_core(rules: &[RuleRaw]) -> Vec<RuleRaw> {
    rule_dedupe::dedupe_hsf_rules_for_export_core(rules)
}

// Shared generated-rule finalizer used by JSON and JsValue exports.
pub fn finalize_generated_rules_core(
    raw_entries: Vec<GeneratedRuleEntryIn>,
    apply_obsolete_pruning: bool,
) -> Vec<RuleRaw> {
    // Normalize payload into the internal carry shape.
    let entries = raw_entries
        .into_iter()
        .map(|entry| GeneratedRuleEntry {
            rule: entry.rule,
            branch_order: entry.branch_order,
            branch_seq: entry.branch_seq,
            original_idx: entry.original_idx,
        })
        .collect::<Vec<_>>();

    // Group by canonical key to detect strict epic+legendary duplicates.
    let mut groups = HashMap::<rule_dedupe::CollapseCanonicalKey, Vec<usize>>::new();
    for (idx, entry) in entries.iter().enumerate() {
        let key = rule_dedupe::collapse_canonical_key(&entry.rule);
        groups.entry(key).or_default().push(idx);
    }

    let mut replacements = HashMap::<usize, GeneratedRuleEntry>::new();
    let mut removed = HashSet::<usize>::new();
    for indices in groups.values() {
        if indices.len() < 2 {
            continue;
        }
        let mut rarity_codes = HashSet::<i64>::new();
        let mut finite = true;
        for idx in indices {
            let Some(code) = entries[*idx].rule.Rarity else {
                finite = false;
                break;
            };
            rarity_codes.insert(code);
        }
        if !finite
            || rarity_codes.len() != 2
            || !rarity_codes.contains(&RARITY_CODE_EPIC)
            || !rarity_codes.contains(&RARITY_CODE_GTE_LEGENDARY)
        {
            continue;
        }
        let mut sorted = indices.clone();
        sorted.sort_unstable();
        let Some(first) = sorted.first().copied() else {
            continue;
        };
        let mut replacement = entries[first].clone();
        replacement.rule.Rarity = Some(RARITY_CODE_GTE_EPIC);
        replacements.insert(first, replacement);
        for idx in sorted.into_iter().skip(1) {
            removed.insert(idx);
        }
    }

    let mut collapsed = Vec::<GeneratedRuleEntry>::new();
    for (idx, entry) in entries.into_iter().enumerate() {
        if removed.contains(&idx) {
            continue;
        }
        if let Some(replacement) = replacements.remove(&idx) {
            collapsed.push(replacement);
        } else {
            collapsed.push(entry);
        }
    }

    // Obsolete pruning only applies when merge.ts says the recipe has one branch.
    let filtered = if apply_obsolete_pruning {
        let rules = collapsed
            .iter()
            .map(|entry| entry.rule.clone())
            .collect::<Vec<_>>();
        let obsolete = rule_dedupe::collect_obsolete_entries(&rules);
        if obsolete.is_empty() {
            collapsed
        } else {
            let obsolete_indices = obsolete
                .into_iter()
                .map(|entry| entry.index)
                .collect::<HashSet<_>>();
            collapsed
                .into_iter()
                .enumerate()
                .filter_map(|(idx, entry)| {
                    if obsolete_indices.contains(&idx) {
                        None
                    } else {
                        Some(entry)
                    }
                })
                .collect::<Vec<_>>()
        }
    } else {
        collapsed
    };

    // Stable ordering mirrors merge.ts: level, branch-order, branch-seq, original index.
    let mut sorted = filtered;
    sorted.sort_by(|left, right| {
        let left_level = level_order_value(left.rule.LVLForCheck);
        let right_level = level_order_value(right.rule.LVLForCheck);
        if left_level != right_level {
            return left_level.cmp(&right_level);
        }
        if left.branch_order != right.branch_order {
            return left.branch_order.cmp(&right.branch_order);
        }
        if left.branch_seq != right.branch_seq {
            return left.branch_seq.cmp(&right.branch_seq);
        }
        left.original_idx.cmp(&right.original_idx)
    });

    sorted.into_iter().map(|entry| entry.rule).collect::<Vec<_>>()
}
