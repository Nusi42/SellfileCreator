use super::*;

// Rules bucketed by artifact slot for fast per-item evaluation.
// At configure time, rules with empty artifact_types go into `shared` (every item sees them)
// and rules with specific types go into per_slot buckets (only items with that slot see them).
// A rule spanning multiple slot ids is cloned into each relevant bucket at configure time
// so hot-path evaluation stays allocation-free.
#[derive(Debug, Default)]
pub struct BucketedRules {
    // Applies to every item regardless of slot.
    pub shared: Vec<PreparedRule>,
    // Applies only to items whose slot id matches the map key.
    pub per_slot: HashMap<i64, Vec<PreparedRule>>,
}

impl BucketedRules {
    // Partition a flat rule list into shared vs per-slot buckets.
    // original_index is stamped onto each rule here so EvalMatch.rule_index always
    // refers to the flat-list position that TS callers use to look up rule metadata.
    pub fn from_rules(rules: Vec<PreparedRule>) -> Self {
        let mut bucketed = Self::default();
        for (idx, mut rule) in rules.into_iter().enumerate() {
            // Stamp the flat-list position before distributing into buckets.
            rule.original_index = idx;
            if rule.artifact_types.is_empty() {
                // No slot constraint — every item evaluates this rule.
                bucketed.shared.push(rule);
            } else {
                // Push into each declared slot bucket (clone for multi-slot rules).
                let mut types_iter = rule.artifact_types.iter().copied();
                // Move the rule into the first slot bucket; clone for any additional slots.
                let first_slot = types_iter.next().expect("non-empty artifact_types");
                for extra_slot in types_iter {
                    bucketed.per_slot.entry(extra_slot).or_default().push(rule.clone());
                }
                bucketed.per_slot.entry(first_slot).or_default().push(rule);
            }
        }
        bucketed
    }

    // Return the slice of slot-specific rules for an item's slot (empty if none).
    pub fn slot_rules(&self, slot: i64) -> &[PreparedRule] {
        self.per_slot.get(&slot).map_or(&[], Vec::as_slice)
    }
}

// Keep only the data needed in hot matcher loops.
// Masks and recipe indices are precomputed at configure time.
// Clone is derived so BucketedRules can duplicate multi-slot rules into each relevant bucket.
#[derive(Debug, Clone)]
pub struct PreparedRule {
    // Position of this rule in the original flat rule list passed to configure_engine.
    // Preserved through bucketing so EvalMatch.rule_index stays consistent with TS rule arrays.
    pub original_index: usize,
    pub use_flag: bool,
    pub keep_flag: bool,
    pub artifact_types: Vec<i64>,
    pub artifact_sets: Vec<i64>,
    pub faction: i64,
    pub level_for_check: i64,
    pub main_stat_id: i64,
    pub main_stat_f: i64,
    pub substats: Vec<PreparedRuleSub>,
    pub recipe_idx: Option<i64>,
    pub source_bits: u8,
    pub source_fallback: Option<String>,
    pub safeguard_item_key: Option<i64>,
    pub rank_mask: u8,
    pub rarity_mask: u8,
    pub is_keep_override_source: bool,
}

// Prepared substats normalize condition/value flags for direct comparisons.
#[derive(Debug, Clone)]
pub struct PreparedRuleSub {
    // Variant is precomputed during configure so matcher loops do zero coercion.
    pub variant: i64,
    // Threshold stays as f64 because substat values are floating-point in payloads.
    pub value: f64,
    // Condition is parsed once; hot loops use enum dispatch instead of strings.
    pub condition: PreparedRuleSubCondition,
}

// Evaluate options mirror EvalMatchesByRecipeOverrides from TS.
// Sets are converted once so each rule scan stays allocation-free.
#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EvaluateOptionsRaw {
    pub exclude_sources: Option<Vec<String>>,
    pub exclude_recipe_indices: Option<Vec<i64>>,
    pub ignore_safeguard_recipe_indices: Option<Vec<i64>>,
    pub baseline_exclude_sources: Option<Vec<String>>,
}

// Matcher loops compare only three condition families from TS semantics.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum PreparedRuleSubCondition {
    AtLeast,
    AtMost,
    Equal,
}

// Scratch buffers reused across items in evaluate_engine so each item avoids
// per-item HashSet and HashMap allocations in the hot evaluation loop.
pub struct EvaluateItemScratch {
    // (recipe_idx, first_keep_decision) pairs in encounter order.
    // Combines the roles of the old matching_recipe_seen HashSet and
    // matching_recipe_decisions HashMap into one linear Vec with no heap churn.
    pub recipe_matches: Vec<(i64, bool)>,
}

impl EvaluateItemScratch {
    pub fn new() -> Self {
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
pub struct EvaluateOptionsPrepared {
    exclude_source_bits: u8,
    exclude_source_fallback_set: HashSet<String>,
    exclude_recipe_indices: Vec<i64>,
    ignore_safeguard_recipe_indices: Vec<i64>,
}

impl EvaluateOptionsPrepared {
    // Convert vector-based JS payloads once per evaluate batch.
    pub fn from_raw(raw: &EvaluateOptionsRaw) -> Self {
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
pub fn prepare_evaluate_options(raw: &EvaluateOptionsRaw) -> EvaluateOptionsPrepared {
    EvaluateOptionsPrepared::from_raw(raw)
}

// Serialized match result shape consumed by existing worker hooks.
// All fields are plain data; Copy avoids manual field-by-field reconstruction at use sites.
#[derive(Debug, Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct EvalMatch {
    pub rule_index: usize,
    pub keep: bool,
    pub recipe_idx: Option<i64>,
    // Runtime-only flag; not serialized to JS — used to decide if a baseline re-evaluation
    // is needed without looking up the rule from the bucketed structure.
    #[serde(skip)]
    pub is_keep_override_source: bool,
}

// Serialized per-recipe keep/sell decision list.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchingRecipeDecision {
    pub recipe_idx: i64,
    pub keep: bool,
}

// Serialized item result shape mirrors TesterMatchWorkerItemResult.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluateItemResult {
    pub item_id: i64,
    pub first_match: Option<EvalMatch>,
    pub first_non_excluded_match: Option<EvalMatch>,
    pub matching_recipe_indices: Vec<i64>,
    pub matching_recipe_decisions: Vec<MatchingRecipeDecision>,
}

// Only the fields needed for keep/sell fallback logic cross the boundary.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SafeguardCandidateResolveBaseMatchIn {
    pub keep: bool,
    pub recipe_idx: Option<i64>,
}

// Candidate collection input extends resolver rows with normalized artifact data.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeguardCollectRowIn {
    pub item: TestItemRaw,
    #[serde(default)]
    pub base_match_defined: bool,
    pub base_match: Option<SafeguardCandidateResolveBaseMatchIn>,
    pub artifact: SafeguardWasmArtifactIn,
}

// Candidate snapshot entry mirrors safeguards.ts SafeguardCandidate shape.
// artifact is intentionally omitted: TS callers reconstruct it from rows[rowIndex].
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeguardCollectedCandidateOut {
    pub row_index: usize,
    pub item_key: i64,
    pub group_key: String,
    pub is_sold: bool,
}

// Candidate snapshot payload also includes sold-item key dedupe set.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeguardCollectedSnapshotOut {
    pub candidates: Vec<SafeguardCollectedCandidateOut>,
    pub unique_item_keys: Vec<i64>,
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
pub fn prepare_rule(raw: RuleRaw) -> PreparedRule {
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
        // original_index is 0 here; configure_engine sets the real value after bucketing.
        original_index: 0,
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
pub(crate) fn resolve_collect_row_item_key(row: &SafeguardCollectRowIn) -> i64 {
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
//
// shared_rules: slot-agnostic rules (artifact_types empty) evaluated for every item.
// slot_rules: rules pre-filtered to the item's slot at configure time (BucketedRules::slot_rules).
// Callers derive slot_rules from BucketedRules::slot_rules(item.slot) — zero allocation.
pub fn evaluate_item(
    shared_rules: &[PreparedRule],
    slot_rules: &[PreparedRule],
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
    // First keep_override rule that passes the recipe gate and is not source-excluded.
    // prekeep_override captures the first keep_override match before recipe gating,
    // used as a fallback when no post-gate keep_override is available.
    let mut pending_keep_override: Option<EvalMatch> = None;
    let mut prekeep_override: Option<EvalMatch> = None;

    // Chain shared (all-slot) rules first, then slot-specific rules — zero-copy iterator.
    // Use rule.original_index (stamped at configure time) so EvalMatch.rule_index always
    // matches the original flat-list position that TS callers use to look up rule metadata.
    for rule in shared_rules.iter().chain(slot_rules.iter()) {
        let rule_index = rule.original_index;
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
                is_keep_override_source: true,
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
            // All three former variables (pending/fallback/any) set identically — collapsed to one.
            if pending_keep_override.is_none() && !is_excluded {
                pending_keep_override = Some(EvalMatch {
                    rule_index,
                    keep,
                    recipe_idx: rule.recipe_idx,
                    is_keep_override_source: true,
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
                    is_keep_override_source: false,
                });
            }
            if first_non_excluded_match.is_none() && !is_excluded {
                first_non_excluded_match = Some(EvalMatch {
                    rule_index,
                    keep,
                    recipe_idx: rule.recipe_idx,
                    is_keep_override_source: false,
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

    // EvalMatch is Copy; no need for as_ref() to avoid consuming the Option.
    let first_match_is_keep = first_match
        .map(|entry| entry.keep && !options.safeguard_cfg_is_ignored(entry.recipe_idx))
        .unwrap_or(false);

    let allow_keep_override = !non_keep_override_keep_matched && !first_match_is_keep;
    if allow_keep_override {
        // pending_keep_override: first post-gate, non-excluded keep_override hit.
        // prekeep_override: pre-gate fallback (matched before recipe visibility check).
        if let Some(candidate) = pending_keep_override.or(prekeep_override) {
            // EvalMatch is Copy; no field-by-field reconstruction needed.
            if first_non_excluded_match.is_none() {
                first_non_excluded_match = Some(candidate);
            }
            first_match = Some(candidate);
        }
    }

    // Mirror non-excluded fallback from first_match when no explicit non-excluded hit exists.
    // EvalMatch is Copy so .or() copies the value without consuming first_match.
    let resolved_first_non_excluded = first_non_excluded_match.or(first_match);
    (first_match, resolved_first_non_excluded)
}

// Resolve keep/sell outcomes for safeguard candidate rows.
// Rows reuse cached base matches when possible and only re-evaluate as needed.
//
// base_matches: per-row sidecar supplied by the combined evaluate+collect entry point.
// When Some, the sidecar takes precedence over row.base_match_defined/base_match so
// stored rows can remain immutable across calls. When None, falls back to row fields.
fn resolve_safeguard_candidate_keep_flags_core(
    rows: &[SafeguardCollectRowIn],
    base_matches: Option<&[Option<SafeguardCandidateResolveBaseMatchIn>]>,
    bucketed_rules: &BucketedRules,
    recipe_modes: &[String],
    ignore_safeguard_recipe_indices: &[i64],
) -> Vec<bool> {
    let has_ignored_recipes = !ignore_safeguard_recipe_indices.is_empty();
    let no_rules = bucketed_rules.shared.is_empty() && bucketed_rules.per_slot.is_empty();
    // eval_options reuses the same Vec slice (already a Vec<i64>) — no extra allocation.
    let eval_options =
        EvaluateOptionsPrepared::from_excluded_recipe_indices(ignore_safeguard_recipe_indices);

    // One shared scratch per evaluation pass avoids per-row allocations.
    let mut scratch = EvaluateItemScratch::new();
    let mut keep_flags = Vec::<bool>::with_capacity(rows.len());
    for (idx, row) in rows.iter().enumerate() {
        // Resolve the base-match for this row: sidecar takes priority over row fields.
        // Sidecar is Some when the combined entry point evaluated items in this call;
        // row fields are used by standalone collect calls that patch rows directly.
        let (base_match_defined, base_match_ref) = if let Some(sidecar) = base_matches {
            // sidecar always has one entry per row (caller guarantees same length).
            let entry = sidecar.get(idx);
            let defined = entry.is_some();
            (defined, entry.and_then(|o| o.as_ref()))
        } else {
            (row.base_match_defined, row.base_match.as_ref())
        };

        // Reuse explicit base-match decisions unless the owning recipe is ignored.
        if base_match_defined {
            let base_recipe_idx = base_match_ref.and_then(|entry| entry.recipe_idx);
            // Vec linear scan; ignore_safeguard_recipe_indices is small (<50 entries).
            let base_recipe_ignored = has_ignored_recipes
                && base_recipe_idx
                    .map(|recipe_idx| ignore_safeguard_recipe_indices.contains(&recipe_idx))
                    .unwrap_or(false);
            if !base_recipe_ignored {
                keep_flags.push(base_match_ref.map(|entry| entry.keep).unwrap_or(false));
                continue;
            }
        }

        // No rules means the row is sold by default.
        if no_rules {
            keep_flags.push(false);
            continue;
        }

        // Two-pass evaluate_item for rows whose base match came from an ignored recipe.
        // The base_match was computed with the full rule set (ignored recipe included), so
        // its keep/sell decision cannot be reused — the ignored recipe may have been the
        // first matching rule, masking a different outcome from the remaining rules.
        // We re-evaluate with eval_options excluding the ignored recipe so the result
        // reflects what the sell engine would decide without safeguard interference.
        let slot_rules = bucketed_rules.slot_rules(row.item.slot);
        let (first_match, _) = evaluate_item(
            &bucketed_rules.shared,
            slot_rules,
            recipe_modes,
            &row.item,
            &eval_options,
            &mut scratch,
        );
        keep_flags.push(first_match.map(|entry| entry.keep).unwrap_or(false));
    }
    keep_flags
}

// Safeguard candidate matching helper keeps base-match fallback and filtered
// re-evaluation semantics in Rust so TS only handles row/object assembly.

// Safeguard candidate snapshot builder keeps key derivation + sold filtering
// in Rust so TS only reattaches row references for existing call sites.
// Collect safeguard candidates from rows, resolving keep/sell per item.
// base_matches: optional per-row sidecar from the combined evaluate+collect entry point
// that avoids mutating stored rows. Pass None for standalone collect calls where row
// fields (base_match_defined/base_match) already carry the evaluation result.
pub fn collect_safeguard_candidates_core(
    rows: &[SafeguardCollectRowIn],
    base_matches: Option<&[Option<SafeguardCandidateResolveBaseMatchIn>]>,
    bucketed_rules: &BucketedRules,
    recipe_modes: &[String],
    ignore_safeguard_recipe_indices: &[i64],
) -> Result<SafeguardCollectedSnapshotOut, String> {
    let keep_flags = resolve_safeguard_candidate_keep_flags_core(
        rows,
        base_matches,
        bucketed_rules,
        recipe_modes,
        ignore_safeguard_recipe_indices,
    );
    // Keep candidate/flag vectors aligned so item ownership never shifts.
    if keep_flags.len() != rows.len() {
        return Err(
            "Safeguard candidate collect produced mismatched keep-flag length".to_string(),
        );
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
