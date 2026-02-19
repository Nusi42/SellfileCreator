use super::*;

// Substat domination only supports >= and <= conditions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
enum SubCond {
    Gte,
    Lte,
}

// Normalized substat tuple for domination checks.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
struct NormalizedSubKey {
    variant: i64,
    cond: SubCond,
}

// Carry integer threshold values after flooring for parity with JS.
#[derive(Debug, Clone)]
struct NormalizedSubstat {
    key: NormalizedSubKey,
    value: i64,
}

// Builder pruning keeps raw id/isFlat/condition tuples (without variant folding)
// so it mirrors hsfBuilder.ts::normalizeSubstats + ruleCovers semantics exactly.
#[derive(Debug, Clone)]
struct BuilderNormalizedSubstat {
    id: i64,
    is_flat: bool,
    condition: String,
    value: f64,
}

// Coarse obsolete grouping uses typed keys instead of string concatenation.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ObsoleteCoarseKey {
    keep: bool,
    use_flag: bool,
    rank: i64,
    rarity: i64,
    level: i64,
    faction: i64,
    main_id: i64,
    main_f: String,
    sets: Option<Vec<i64>>,
    types: Option<Vec<i64>>,
}

// Group key combines coarse dimensions with normalized substat identity only.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum ObsoleteGroupKey {
    NoDomination(usize),
    Comparable {
        coarse: ObsoleteCoarseKey,
        signature: Vec<NormalizedSubKey>,
    },
}

// String form used in coarse keys for MainStatF (mirrors template literal behavior).
fn coarse_main_stat_f(value: Option<&serde_json::Value>) -> String {
    match value {
        Some(serde_json::Value::Number(v)) => v.to_string(),
        Some(serde_json::Value::Bool(v)) => v.to_string(),
        Some(serde_json::Value::String(v)) => v.clone(),
        Some(other) => other.to_string(),
        None => MAIN_STAT_F_DEFAULT_STR.to_string(),
    }
}

// Canonical rule-key payload mirrors merge.ts::canonicalRuleKey normalization.
// This avoids serde_json object assembly/stringify and writes a deterministic key directly.
fn canonical_rule_key_core(rule: &RuleRaw) -> String {
    // Keep artifact type/set selectors sorted so click-order never changes keys.
    let mut artifact_types = rule.ArtifactType.clone().unwrap_or_default();
    artifact_types.sort_unstable();
    let mut artifact_sets = rule.ArtifactSet.clone().unwrap_or_default();
    artifact_sets.sort_unstable();

    let mut out = String::new();
    out.push_str("k:");
    out.push(if rule.Keep.unwrap_or(false) { '1' } else { '0' });
    out.push_str("|u:");
    out.push(if rule.Use.unwrap_or(true) { '1' } else { '0' });
    out.push_str("|r:");
    out.push_str(&rule.Rank.unwrap_or(0).to_string());
    out.push_str("|l:");
    out.push_str(&rule.LVLForCheck.unwrap_or(0).to_string());
    out.push_str("|f:");
    out.push_str(&rule.Faction.unwrap_or(0).to_string());
    out.push_str("|mid:");
    out.push_str(&rule.MainStatID.unwrap_or(STAT_ID_ANY).to_string());
    out.push_str("|mf:");
    out.push_str(&boolish_to_flag(rule.MainStatF.as_ref()).to_string());
    out.push_str("|t:");
    for (idx, value) in artifact_types.iter().enumerate() {
        if idx > 0 {
            out.push(',');
        }
        out.push_str(&value.to_string());
    }
    out.push_str("|s:");
    for (idx, value) in artifact_sets.iter().enumerate() {
        if idx > 0 {
            out.push(',');
        }
        out.push_str(&value.to_string());
    }
    out.push_str("|sub:");
    if let Some(rows) = rule.Substats.as_ref() {
        for (row_idx, sub) in rows.iter().enumerate() {
            if row_idx > 0 {
                out.push(';');
            }
            out.push_str("id=");
            out.push_str(&sub.ID.unwrap_or(STAT_ID_ANY).to_string());
            out.push_str(",flat=");
            out.push(if boolish_to_flag(sub.IsFlat.as_ref()) == 1 { '1' } else { '0' });
            out.push_str(",na=");
            out.push(if sub.NotAvailable.unwrap_or(false) { '1' } else { '0' });
            let condition = sub.Condition.as_deref().unwrap_or_default();
            out.push_str(",clen=");
            out.push_str(&condition.len().to_string());
            out.push(':');
            out.push_str(condition);
            out.push_str(",val=");
            let value = sub
                .Value
                .filter(|numeric| numeric.is_finite())
                .unwrap_or(0.0);
            // Normalize -0.0 to 0.0 for stable key equality.
            let normalized_value = if value == 0.0 { 0.0 } else { value };
            out.push_str(&normalized_value.to_string());
        }
    }
    out
}

// Public canonical key export keeps rule normalization in Rust.

// Hash helper mirrors useTesterMatchOrchestrator.ts::hashSignature.
fn js_hash_signature(value: &str) -> i32 {
    let mut hash: i32 = 0;
    for code_point in value.chars().map(|ch| ch as i32) {
        hash = hash.wrapping_shl(5).wrapping_sub(hash).wrapping_add(code_point);
    }
    hash
}

// Optional numeric field stringification mirrors String(value ?? '') behavior.
fn optional_i64_to_js_string(value: Option<i64>) -> String {
    value.map(|numeric| numeric.to_string()).unwrap_or_default()
}

// Batch fingerprint helper keeps merged-rule signature loops in Rust.
#[wasm_bindgen]
pub fn fingerprint_merged_rules_value(rules: JsValue) -> Result<JsValue, JsValue> {
    let parsed: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid merged-rules fingerprint payload: {error}")))?;
    if parsed.is_empty() {
        return Ok(JsValue::from_str("0:0"));
    }
    let mut hash: i32 = 0;
    for (idx, rule) in parsed.iter().enumerate() {
        let recipe_idx = rule
            .RecipeID
            .and_then(|cfg_id| if cfg_id > 0 { Some(cfg_id - 1) } else { None });
        let parts = [
            idx.to_string(),
            rule.source.clone().unwrap_or_default(),
            recipe_idx.map(|value| value.to_string()).unwrap_or_else(|| "none".to_string()),
            rule.safeguard_rule_id.clone().unwrap_or_default(),
            rule.safeguard_hash.clone().unwrap_or_default(),
            optional_i64_to_js_string(rule.safeguard_required),
            optional_i64_to_js_string(rule.safeguard_projected),
            optional_i64_to_js_string(rule.safeguard_deficit),
            canonical_rule_key_core(rule),
        ];
        let joined = parts.join("|");
        let key_hash = js_hash_signature(&joined);
        hash = hash.wrapping_shl(5).wrapping_sub(hash).wrapping_add(key_hash);
    }
    let signature = format!("{}:{}", parsed.len(), hash);
    Ok(JsValue::from_str(&signature))
}

// Canonical array normalization mirrors JSON.stringify(canonArray(...)) semantics.
// `None` and `[]` both collapse to wildcard/undefined in the coarse grouping key.
fn canon_array_key(values: Option<&Vec<i64>>) -> Option<Vec<i64>> {
    let raw = values?;
    if raw.is_empty() {
        return None;
    }
    let mut sorted = raw.clone();
    sorted.sort_unstable();
    Some(sorted)
}

// Parse supported conditions from substat rows.
fn parse_sub_cond(value: Option<&str>) -> Option<SubCond> {
    let trimmed = value.unwrap_or("").trim();
    match trimmed {
        ">=" => Some(SubCond::Gte),
        "<=" => Some(SubCond::Lte),
        _ => None,
    }
}

// Normalize substats for domination checks; unsupported conditions disable domination.
fn normalize_substats_for_domination(subs: Option<&Vec<RuleSubRaw>>) -> Option<Vec<NormalizedSubstat>> {
    let substats = subs?;
    let mut dedup = HashMap::<NormalizedSubKey, i64>::new();
    for sub in substats {
        let id = sub.ID.unwrap_or(STAT_ID_ANY);
        if id == STAT_ID_ANY {
            continue;
        }
        let cond = parse_sub_cond(sub.Condition.as_deref())?;
        let variant = sub_to_variant(id, boolish_to_flag(sub.IsFlat.as_ref()));
        let key = NormalizedSubKey { variant, cond };
        let value = floor_number_or_zero(sub.Value);
        match dedup.get(&key).copied() {
            None => {
                dedup.insert(key, value);
            }
            Some(previous) => {
                let stricter = match cond {
                    SubCond::Gte => previous.max(value),
                    SubCond::Lte => previous.min(value),
                };
                dedup.insert(key, stricter);
            }
        }
    }
    let mut normalized = dedup
        .into_iter()
        .map(|(key, value)| NormalizedSubstat { key, value })
        .collect::<Vec<_>>();
    normalized.sort_by(|left, right| left.key.cmp(&right.key));
    Some(normalized)
}

// Builder pruning keeps only concrete conditioned substats (no Any/blank rows).
fn normalize_substats_for_builder_pruning(subs: Option<&Vec<RuleSubRaw>>) -> Vec<BuilderNormalizedSubstat> {
    let Some(substats) = subs else {
        return Vec::<BuilderNormalizedSubstat>::new();
    };
    let mut normalized = Vec::<BuilderNormalizedSubstat>::new();
    for sub in substats {
        let id = sub.ID.unwrap_or(STAT_ID_ANY);
        if id == STAT_ID_ANY {
            continue;
        }
        let condition = sub.Condition.clone().unwrap_or_default();
        if condition.is_empty() {
            continue;
        }
        normalized.push(BuilderNormalizedSubstat {
            id,
            is_flat: boolish_to_flag(sub.IsFlat.as_ref()) != 0,
            condition,
            value: sub.Value.unwrap_or(0.0),
        });
    }
    normalized.sort_by(|left, right| {
        if left.id != right.id {
            return left.id.cmp(&right.id);
        }
        if left.is_flat != right.is_flat {
            return left.is_flat.cmp(&right.is_flat);
        }
        if left.condition != right.condition {
            return left.condition.cmp(&right.condition);
        }
        left.value.total_cmp(&right.value)
    });
    normalized
}

// Builder condition coverage mirrors hsfBuilder.ts::conditionValueCovers.
fn builder_condition_value_covers(condition: &str, base_value: f64, candidate_value: f64) -> bool {
    match condition {
        ">=" => candidate_value >= base_value,
        "<=" => candidate_value <= base_value,
        "=" => candidate_value == base_value,
        _ => false,
    }
}

// Builder rule coverage mirrors hsfBuilder.ts::ruleCovers subset matching.
fn builder_rule_covers(general: &[BuilderNormalizedSubstat], target: &[BuilderNormalizedSubstat]) -> bool {
    if general.is_empty() {
        return false;
    }
    if general.len() > target.len() {
        return false;
    }
    let mut remaining = target.to_vec();
    for sub in general {
        let mut match_index = None::<usize>;
        for (idx, candidate) in remaining.iter().enumerate() {
            if candidate.id != sub.id {
                continue;
            }
            if candidate.is_flat != sub.is_flat {
                continue;
            }
            if candidate.condition != sub.condition {
                continue;
            }
            if !builder_condition_value_covers(&sub.condition, sub.value, candidate.value) {
                continue;
            }
            match_index = Some(idx);
            break;
        }
        let Some(idx) = match_index else {
            return false;
        };
        remaining.remove(idx);
    }
    true
}

// Coarse key groups rules by non-substat fields before domination checks.
fn obsolete_coarse_key(rule: &RuleRaw) -> ObsoleteCoarseKey {
    ObsoleteCoarseKey {
        keep: rule.Keep.unwrap_or(false),
        use_flag: rule.Use.unwrap_or(true),
        rank: rule.Rank.unwrap_or(RULE_FIELD_UNSET_SENTINEL),
        rarity: rule.Rarity.unwrap_or(RULE_FIELD_UNSET_SENTINEL),
        level: rule.LVLForCheck.unwrap_or(RULE_FIELD_UNSET_SENTINEL),
        faction: rule.Faction.unwrap_or(0),
        main_id: rule.MainStatID.unwrap_or(STAT_ID_ANY),
        main_f: coarse_main_stat_f(rule.MainStatF.as_ref()),
        sets: canon_array_key(rule.ArtifactSet.as_ref()),
        types: canon_array_key(rule.ArtifactType.as_ref()),
    }
}

// Substat signature compares only identity/operator, never threshold values.
fn obsolete_signature(subs: &[NormalizedSubstat]) -> Vec<NormalizedSubKey> {
    subs.iter()
        .map(|sub| sub.key.clone())
        .collect::<Vec<_>>()
}

// Componentwise domination check with stable tie-breaking by index order.
fn obsolete_dominates(
    a: &[NormalizedSubstat],
    b: &[NormalizedSubstat],
    prefer_a_earlier_than_b: bool,
) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut any_strict = false;
    for idx in 0..a.len() {
        let left = &a[idx];
        let right = &b[idx];
        if left.key != right.key {
            return false;
        }
        match left.key.cond {
            SubCond::Gte => {
                if left.value > right.value {
                    return false;
                }
                if left.value < right.value {
                    any_strict = true;
                }
            }
            SubCond::Lte => {
                if left.value < right.value {
                    return false;
                }
                if left.value > right.value {
                    any_strict = true;
                }
            }
        }
    }
    any_strict || prefer_a_earlier_than_b
}

// Canonicalize non-substat fields for epic/legendary duplicate collapse.
pub(crate) fn collapse_canonical_key(rule: &RuleRaw) -> String {
    // Sort type ids so set/type selection order does not affect collapse grouping.
    let mut artifact_types = rule.ArtifactType.clone().unwrap_or_default();
    artifact_types.sort_unstable();
    // Sort set ids for the same reason: input ordering should be irrelevant.
    let mut artifact_sets = rule.ArtifactSet.clone().unwrap_or_default();
    artifact_sets.sort_unstable();
    // Keep original substat slot order to match merge.ts::canonicalRuleKey.
    // The JS canonical key does not reorder the 4 substat positions.
    // Sorting here over-collapses distinct rules that only differ by slot order.
    // Clone once so we can read slots without mutating the original payload.
    let substats = rule.Substats.clone().unwrap_or_default();
    // Serialize each slot to a compact primitive tuple for deterministic keys.
    let substats_key = substats
        .iter()
        .map(|sub| {
            // Keep exactly the same tuple fields as the JS canonicalizer.
            format!(
                "{}:{}:{}:{}:{}",
                sub.ID.unwrap_or(STAT_ID_ANY),
                matches!(sub.IsFlat.as_ref(), Some(serde_json::Value::Bool(true))),
                sub.NotAvailable.unwrap_or(false),
                sub.Condition.as_deref().unwrap_or(""),
                sub.Value.unwrap_or(0.0)
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    // Build one full key that mirrors merge.ts::canonicalRuleKey dimensions.
    format!(
        "{}|{}|{}|{}|{}|{}|{}|{}|{}|{}",
        i64::from(rule.Keep.unwrap_or(false)),
        i64::from(rule.Use.unwrap_or(true)),
        rule.Rank.unwrap_or(0),
        rule.LVLForCheck.unwrap_or(0),
        rule.Faction.unwrap_or(0),
        rule.MainStatID.unwrap_or(STAT_ID_ANY),
        boolish_to_flag(rule.MainStatF.as_ref()),
        artifact_types
            .iter()
            .map(i64::to_string)
            .collect::<Vec<_>>()
            .join(","),
        artifact_sets
            .iter()
            .map(i64::to_string)
            .collect::<Vec<_>>()
            .join(","),
        substats_key
    )
}

// Shared obsolete-detector used by find_obsolete and generated-rule finalization.
pub(crate) fn collect_obsolete_entries(rules: &[RuleRaw]) -> Vec<ObsoleteEntryOut> {
    let mut norm_subs = Vec::<Option<Vec<NormalizedSubstat>>>::with_capacity(rules.len());
    let mut groups = HashMap::<ObsoleteGroupKey, Vec<usize>>::new();
    let mut group_order = Vec::<ObsoleteGroupKey>::new();

    for (idx, rule) in rules.iter().enumerate() {
        let normalized = normalize_substats_for_domination(rule.Substats.as_ref());
        let key = if let Some(ref subs) = normalized {
            ObsoleteGroupKey::Comparable {
                coarse: obsolete_coarse_key(rule),
                signature: obsolete_signature(subs),
            }
        } else {
            ObsoleteGroupKey::NoDomination(idx)
        };
        if !groups.contains_key(&key) {
            group_order.push(key.clone());
        }
        groups.entry(key).or_default().push(idx);
        norm_subs.push(normalized);
    }

    let mut obsolete = Vec::<ObsoleteEntryOut>::new();
    for key in group_order {
        let Some(indices) = groups.get(&key) else {
            continue;
        };
        if indices.len() <= 1 {
            continue;
        }
        let mut survivors = Vec::<(usize, Vec<NormalizedSubstat>)>::new();
        for idx in indices.iter().copied() {
            let Some(candidate_norm) = norm_subs[idx].as_ref() else {
                continue;
            };
            let mut covered_by = None::<usize>;
            for survivor in &survivors {
                let prefer_survivor = survivor.0 < idx;
                if obsolete_dominates(&survivor.1, candidate_norm, prefer_survivor) {
                    covered_by = Some(survivor.0);
                    break;
                }
            }
            if let Some(cover_idx) = covered_by {
                obsolete.push(ObsoleteEntryOut {
                    index: idx,
                    covered_by: cover_idx,
                    reason: "Covered at same level by looser/equal substat thresholds".to_string(),
                });
                continue;
            }

            let mut s = survivors.len();
            while s > 0 {
                s -= 1;
                let survivor = &survivors[s];
                let prefer_current = idx < survivor.0;
                if obsolete_dominates(candidate_norm, &survivor.1, prefer_current) {
                    obsolete.push(ObsoleteEntryOut {
                        index: survivor.0,
                        covered_by: idx,
                        reason: "Covered at same level by looser/equal substat thresholds".to_string(),
                    });
                    survivors.remove(s);
                }
            }
            survivors.push((idx, candidate_norm.clone()));
        }
    }
    obsolete
}

// Builder pruning obsolete detector mirrors hsfBuilder.ts pairwise subset checks.
pub(crate) fn collect_builder_pruning_obsolete_entries(rules: &[RuleRaw]) -> Vec<ObsoleteEntryOut> {
    let mut groups = HashMap::<ObsoleteCoarseKey, Vec<usize>>::new();
    let mut group_order = Vec::<ObsoleteCoarseKey>::new();
    let mut normalized = Vec::<Vec<BuilderNormalizedSubstat>>::with_capacity(rules.len());
    for (idx, rule) in rules.iter().enumerate() {
        let key = obsolete_coarse_key(rule);
        if !groups.contains_key(&key) {
            group_order.push(key.clone());
        }
        groups.entry(key).or_default().push(idx);
        normalized.push(normalize_substats_for_builder_pruning(rule.Substats.as_ref()));
    }

    let mut obsolete = Vec::<ObsoleteEntryOut>::new();
    for key in group_order {
        let Some(indices) = groups.get(&key) else {
            continue;
        };
        if indices.len() <= 1 {
            continue;
        }
        let mut keep = vec![true; indices.len()];
        for i_pos in 0..indices.len() {
            if !keep[i_pos] {
                continue;
            }
            let i_idx = indices[i_pos];
            let general = &normalized[i_idx];
            for j_pos in 0..indices.len() {
                if i_pos == j_pos || !keep[j_pos] {
                    continue;
                }
                let j_idx = indices[j_pos];
                let target = &normalized[j_idx];
                if builder_rule_covers(general, target) {
                    keep[j_pos] = false;
                    obsolete.push(ObsoleteEntryOut {
                        index: j_idx,
                        covered_by: i_idx,
                        reason: "Covered at same level by looser/equal substat thresholds".to_string(),
                    });
                }
            }
        }
    }
    obsolete
}

// Export dedupe normalizes only the three comparison operators supported by TS.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExportDedupeCondition {
    Gte,
    Lte,
    Eq,
}

// Normalized substat tuple mirrors src/lib/hsfDeduplicate.ts comparison shape.
#[derive(Debug, Clone, PartialEq)]
struct ExportDedupeSubstat {
    variant: i64,
    condition: ExportDedupeCondition,
    value: f64,
}

// Base key groups export-dedupe candidates by non-substat dimensions.
#[derive(Debug, Clone, PartialEq, Eq)]
struct ExportDedupeBaseKey {
    use_flag: bool,
    rank: i64,
    rarity: i64,
    level: i64,
    artifact_types: Vec<i64>,
}

// Keep-rule normalization payload used by coverage checks and set merging.
#[derive(Debug, Clone)]
struct ExportDedupeNormalizedRule {
    rule: RuleRaw,
    base_key: ExportDedupeBaseKey,
    sets: Option<Vec<i64>>,
    substats: Vec<ExportDedupeSubstat>,
    main_stat_id: i64,
    main_stat_f: f64,
    faction: i64,
}

// Survivor rows preserve either a normalized keep rule or a skip-only passthrough.
#[derive(Debug, Clone)]
enum ExportDedupeSurvivor {
    Skip(RuleRaw),
    Keep(ExportDedupeNormalizedRule),
}

// Normalize Number-like MainStatF payloads so strings and booleans match TS coercion.
pub(crate) fn numberish_or_default(value: Option<&serde_json::Value>, default: f64) -> f64 {
    numberish_to_f64(value).unwrap_or(default)
}

// Parse export-dedupe condition tokens; unsupported values disable normalization.
fn parse_export_dedupe_condition(value: Option<&str>) -> Option<ExportDedupeCondition> {
    let trimmed = value.unwrap_or("").trim();
    match trimmed {
        ">=" => Some(ExportDedupeCondition::Gte),
        "<=" => Some(ExportDedupeCondition::Lte),
        "=" | "==" => Some(ExportDedupeCondition::Eq),
        _ => None,
    }
}

// Keep TS sort order (`<=`, `=`, `>=`) so signatures stay deterministic.
fn export_dedupe_condition_order(value: ExportDedupeCondition) -> i32 {
    match value {
        ExportDedupeCondition::Lte => 0,
        ExportDedupeCondition::Eq => 1,
        ExportDedupeCondition::Gte => 2,
    }
}

// Set normalization keeps empty selections as wildcards (`None`) like TS.
fn normalize_sets_for_export_dedupe(rule: &RuleRaw) -> Option<Vec<i64>> {
    // Reuse crate-level integer normalization so dedupe and safeguard share one rule.
    let normalized = normalize_i64_array(rule.ArtifactSet.as_ref());
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

// Type normalization feeds the base key used to group comparable rules.
fn normalize_types_for_export_dedupe(rule: &RuleRaw) -> Vec<i64> {
    // Shared helper keeps selector ordering deterministic across modules.
    normalize_i64_array(rule.ArtifactType.as_ref())
}

// Normalize substats into comparable tuples; invalid rows disable dedupe for that rule.
fn normalize_substats_for_export_dedupe(subs: Option<&Vec<RuleSubRaw>>) -> Option<Vec<ExportDedupeSubstat>> {
    let Some(substats) = subs else {
        return Some(Vec::<ExportDedupeSubstat>::new());
    };
    let mut normalized = Vec::<ExportDedupeSubstat>::new();
    for sub in substats {
        if sub.NotAvailable.unwrap_or(false) {
            continue;
        }
        let stat_id = sub.ID.unwrap_or(STAT_ID_ANY);
        if stat_id == STAT_ID_ANY {
            continue;
        }
        let condition = parse_export_dedupe_condition(sub.Condition.as_deref())?;
        let variant = sub_to_variant(stat_id, boolish_to_flag(sub.IsFlat.as_ref()));
        let value = sub.Value.unwrap_or(0.0);
        if !value.is_finite() {
            return None;
        }
        normalized.push(ExportDedupeSubstat {
            variant,
            condition,
            value,
        });
    }
    normalized.sort_by(|left, right| {
        if left.variant != right.variant {
            return left.variant.cmp(&right.variant);
        }
        let left_order = export_dedupe_condition_order(left.condition);
        let right_order = export_dedupe_condition_order(right.condition);
        if left_order != right_order {
            return left_order.cmp(&right_order);
        }
        left.value.total_cmp(&right.value)
    });
    Some(normalized)
}

// Build one normalized keep-rule candidate; invalid substat rows skip dedupe.
fn normalize_keep_rule_for_export_dedupe(rule: &RuleRaw) -> Option<ExportDedupeNormalizedRule> {
    let substats = normalize_substats_for_export_dedupe(rule.Substats.as_ref())?;
    let base_key = ExportDedupeBaseKey {
        use_flag: rule.Use.unwrap_or(true),
        rank: rule.Rank.unwrap_or(RULE_FIELD_UNSET_SENTINEL),
        rarity: rule.Rarity.unwrap_or(RULE_FIELD_UNSET_SENTINEL),
        level: rule.LVLForCheck.unwrap_or(RULE_FIELD_UNSET_SENTINEL),
        artifact_types: normalize_types_for_export_dedupe(rule),
    };
    Some(ExportDedupeNormalizedRule {
        rule: rule.clone(),
        base_key,
        sets: normalize_sets_for_export_dedupe(rule),
        substats,
        main_stat_id: rule.MainStatID.unwrap_or(STAT_ID_ANY),
        main_stat_f: numberish_or_default(rule.MainStatF.as_ref(), 1.0),
        faction: rule.Faction.unwrap_or(0),
    })
}

// Optional set arrays compare as either wildcard (`None`) or exact sorted values.
fn export_dedupe_sets_equal(left: Option<&Vec<i64>>, right: Option<&Vec<i64>>) -> bool {
    match (left, right) {
        (None, None) => true,
        (Some(left_values), Some(right_values)) => left_values == right_values,
        _ => false,
    }
}

// Set-union keeps wildcard semantics (`None`) when either side is unrestricted.
fn export_dedupe_union_sets(left: Option<&Vec<i64>>, right: Option<&Vec<i64>>) -> Option<Vec<i64>> {
    let (Some(left_values), Some(right_values)) = (left, right) else {
        return None;
    };
    let mut merged = left_values.clone();
    merged.extend(right_values.iter().copied());
    merged.sort_unstable();
    merged.dedup();
    Some(merged)
}

// Apply merged set selections back to the cloned rule payload.
fn export_dedupe_apply_sets(rule: &mut RuleRaw, sets: Option<&Vec<i64>>) {
    rule.ArtifactSet = sets.cloned();
}

// Substats are already normalized/sorted, so vector equality is exact tuple equality.
fn export_dedupe_substats_equal(left: &[ExportDedupeSubstat], right: &[ExportDedupeSubstat]) -> bool {
    left == right
}

// Coverage requires each looser tuple to exist in stricter with compatible value.
fn export_dedupe_substats_cover(looser: &[ExportDedupeSubstat], stricter: &[ExportDedupeSubstat]) -> bool {
    for requirement in looser {
        let counterpart = stricter
            .iter()
            .find(|candidate| {
                candidate.variant == requirement.variant
                    && candidate.condition == requirement.condition
            });
        let Some(candidate) = counterpart else {
            return false;
        };
        match requirement.condition {
            ExportDedupeCondition::Gte => {
                if requirement.value > candidate.value {
                    return false;
                }
            }
            ExportDedupeCondition::Lte => {
                if requirement.value < candidate.value {
                    return false;
                }
            }
            ExportDedupeCondition::Eq => {
                if requirement.value != candidate.value {
                    return false;
                }
            }
        }
    }
    true
}

// Set coverage treats `None` as wildcard and concrete arrays as subset checks.
fn export_dedupe_sets_cover(looser: Option<&Vec<i64>>, stricter: Option<&Vec<i64>>) -> bool {
    match (looser, stricter) {
        (None, _) => true,
        (Some(_), None) => false,
        (Some(loose_values), Some(strict_values)) => {
            let loose_set = loose_values.iter().copied().collect::<HashSet<_>>();
            strict_values.iter().all(|value| loose_set.contains(value))
        }
    }
}

// Main-stat exact equality mirrors TS strict numeric comparison.
fn export_dedupe_main_stat_equal_exact(
    left: &ExportDedupeNormalizedRule,
    right: &ExportDedupeNormalizedRule,
) -> bool {
    left.main_stat_id == right.main_stat_id && left.main_stat_f == right.main_stat_f
}

// Main-stat coverage allows wildcard (`Any`) on the looser side.
fn export_dedupe_main_stat_covers(
    looser: &ExportDedupeNormalizedRule,
    stricter: &ExportDedupeNormalizedRule,
) -> bool {
    if looser.main_stat_id == STAT_ID_ANY {
        return true;
    }
    looser.main_stat_id == stricter.main_stat_id && looser.main_stat_f == stricter.main_stat_f
}

// Faction exact equality is used for duplicate-merge checks.
fn export_dedupe_faction_equal_exact(
    left: &ExportDedupeNormalizedRule,
    right: &ExportDedupeNormalizedRule,
) -> bool {
    left.faction == right.faction
}

// Faction coverage allows wildcard faction `0` on the looser side.
fn export_dedupe_faction_covers(
    looser: &ExportDedupeNormalizedRule,
    stricter: &ExportDedupeNormalizedRule,
) -> bool {
    if looser.faction == 0 {
        return true;
    }
    looser.faction == stricter.faction
}

// Full rule coverage check mirrors hsfDeduplicate.ts::covers.
fn export_dedupe_covers(
    looser: &ExportDedupeNormalizedRule,
    stricter: &ExportDedupeNormalizedRule,
) -> bool {
    if looser.base_key != stricter.base_key {
        return false;
    }
    if !export_dedupe_main_stat_covers(looser, stricter) {
        return false;
    }
    if !export_dedupe_faction_covers(looser, stricter) {
        return false;
    }
    if !export_dedupe_sets_cover(looser.sets.as_ref(), stricter.sets.as_ref()) {
        return false;
    }
    export_dedupe_substats_cover(&looser.substats, &stricter.substats)
}

// Deduplicate one contiguous keep segment while preserving original order semantics.
fn dedupe_keep_segment_for_export(segment: &[RuleRaw]) -> Vec<RuleRaw> {
    let mut survivors = Vec::<ExportDedupeSurvivor>::new();
    for original in segment {
        if original.Use == Some(false) {
            survivors.push(ExportDedupeSurvivor::Skip(original.clone()));
            continue;
        }
        let mut candidate_rule = original.clone();
        let Some(mut normalized) = normalize_keep_rule_for_export_dedupe(&candidate_rule) else {
            survivors.push(ExportDedupeSurvivor::Skip(candidate_rule));
            continue;
        };
        let mut redundant = false;
        let mut idx = 0usize;
        while idx < survivors.len() && !redundant {
            let survivor_snapshot = match survivors.get(idx) {
                Some(ExportDedupeSurvivor::Skip(_)) => {
                    idx += 1;
                    continue;
                }
                Some(ExportDedupeSurvivor::Keep(survivor)) => survivor.clone(),
                None => break,
            };
            if survivor_snapshot.base_key != normalized.base_key {
                idx += 1;
                continue;
            }
            if export_dedupe_substats_equal(&survivor_snapshot.substats, &normalized.substats)
                && export_dedupe_main_stat_equal_exact(&survivor_snapshot, &normalized)
                && export_dedupe_faction_equal_exact(&survivor_snapshot, &normalized)
            {
                let merged_sets =
                    export_dedupe_union_sets(survivor_snapshot.sets.as_ref(), normalized.sets.as_ref());
                if !export_dedupe_sets_equal(survivor_snapshot.sets.as_ref(), merged_sets.as_ref()) {
                    if let Some(ExportDedupeSurvivor::Keep(survivor_mut)) = survivors.get_mut(idx) {
                        survivor_mut.sets = merged_sets.clone();
                        export_dedupe_apply_sets(&mut survivor_mut.rule, merged_sets.as_ref());
                    }
                }
                redundant = true;
                break;
            }
            if export_dedupe_covers(&survivor_snapshot, &normalized) {
                redundant = true;
                break;
            }
            if export_dedupe_covers(&normalized, &survivor_snapshot) {
                let merged_sets =
                    export_dedupe_union_sets(normalized.sets.as_ref(), survivor_snapshot.sets.as_ref());
                survivors.remove(idx);
                export_dedupe_apply_sets(&mut candidate_rule, merged_sets.as_ref());
                normalized.sets = merged_sets;
                normalized.rule = candidate_rule.clone();
                continue;
            }
            idx += 1;
        }
        if !redundant {
            survivors.push(ExportDedupeSurvivor::Keep(normalized));
        }
    }
    survivors
        .into_iter()
        .map(|entry| match entry {
            ExportDedupeSurvivor::Skip(rule) => rule,
            ExportDedupeSurvivor::Keep(normalized) => normalized.rule,
        })
        .collect::<Vec<_>>()
}

// Flush helper keeps segment handling centralized for top-level export dedupe.
fn flush_export_keep_segment(output: &mut Vec<RuleRaw>, keep_segment: &mut Vec<RuleRaw>) {
    if keep_segment.is_empty() {
        return;
    }
    let deduped = dedupe_keep_segment_for_export(keep_segment);
    output.extend(deduped);
    keep_segment.clear();
}

// Top-level export dedupe keeps keep segments isolated by `Keep === false` rows.
pub(crate) fn dedupe_hsf_rules_for_export_core(rules: &[RuleRaw]) -> Vec<RuleRaw> {
    if rules.len() <= 1 {
        return rules.to_vec();
    }
    let mut output = Vec::<RuleRaw>::new();
    let mut keep_segment = Vec::<RuleRaw>::new();
    for rule in rules {
        if rule.Keep == Some(true) {
            keep_segment.push(rule.clone());
            continue;
        }
        flush_export_keep_segment(&mut output, &mut keep_segment);
        output.push(rule.clone());
    }
    flush_export_keep_segment(&mut output, &mut keep_segment);
    output
}
