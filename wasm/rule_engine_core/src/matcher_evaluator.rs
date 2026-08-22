use super::*;
use std::sync::Arc;
// ts-rs auto-generates TS interfaces from `#[derive(TS)]` structs during cargo
// test runs, dropping the .ts files at `export_to` (see derives below).
// Importing the trait directly keeps the attribute usage readable.
use ts_rs::TS;

// Rules bucketed by artifact slot for fast per-item evaluation.
// from_rules partitions the flat rule list into shared (any-type) and per-slot buckets.
// Shared rules are NOT cloned into per-slot lists — this keeps BucketedRules at ≈1×
// the input rule count regardless of how many slots have slot-specific rules, avoiding
// the previous ~3–5× clone expansion that triggered memory.grow / STATUS_ACCESS_VIOLATION.
// A rule spanning multiple slot ids is still cloned into each relevant bucket.
//
// Each bucket also precomputes gate-group runs (see RuleBucket) so evaluate_item checks
// each generated recipe's shared gate once per group instead of once per rule.
#[derive(Debug, Default)]
pub struct BucketedRules {
    // Slot-agnostic rules in original_index order; evaluated for every item.
    shared: RuleBucket,
    // Slot-specific rules only, in original_index order. No shared copies here.
    per_slot: BTreeMap<i64, RuleBucket>,
}

// One bucket of rules plus its precomputed gate-group index runs.
// `groups` holds half-open (start, end) ranges into `rules` where EVERY member shares an
// identical gate (see GateKey). Recipe generation emits hundreds of substat variants with
// the same slot/set/rank/rarity/level/main-stat gate, so real rulesets collapse ~13×
// (33k rules → ~2.5k gate groups on the lategame reference preset) — evaluate_item checks
// one gate per group and only scans member substats inside passing groups.
//
// IMPORTANT: `rules` is PERMUTED into grouped order (same-gate rules made contiguous),
// NOT flat-list order — generated rulesets interleave gates heavily (19k+ runs of size 1
// in flat order), so adjacency-only grouping would be worthless. evaluate_item tolerates
// arbitrary visit order because it resolves "first match wins" via minimum original_index,
// which each rule still carries.
#[derive(Debug, Default)]
pub struct RuleBucket {
    // Rules in grouped order; each rule keeps its flat-list original_index stamp.
    pub rules: Vec<PreparedRule>,
    // Half-open (start, end) same-gate ranges covering `rules` completely.
    pub groups: Vec<(u32, u32)>,
}

// Shared empty bucket so rules_for_slot can return a &RuleBucket for slots that have
// no slot-specific rules without allocating (Vec::new() is const-evaluable).
static EMPTY_RULE_BUCKET: RuleBucket = RuleBucket { rules: Vec::new(), groups: Vec::new() };

impl RuleBucket {
    // Group an ordered rule list by gate identity (non-adjacent members included) and
    // permute it so each group's members are contiguous — one gate check then covers
    // the whole group in evaluate_item.
    fn from_ordered_rules(rules: Vec<PreparedRule>) -> Self {
        if rules.is_empty() {
            return Self::default();
        }
        // First-occurrence group id per distinct gate (the rule's RuleGate IS the key —
        // grouping and gate-checking consume the same struct by construction).
        // Transient; dropped after assignment. Clone cost: two small selector vecs per rule.
        let mut group_ids: BTreeMap<RuleGate, u32> = BTreeMap::new();
        // (group_id, rule) pairs so one stable sort produces the grouped permutation.
        let mut tagged: Vec<(u32, PreparedRule)> = Vec::with_capacity(rules.len());
        for rule in rules {
            let next_id = group_ids.len() as u32;
            let id = *group_ids.entry(rule.gate.clone()).or_insert(next_id);
            tagged.push((id, rule));
        }
        drop(group_ids);
        // Group members stay in flat-list order within their group (original_index tiebreak
        // keeps the sort deterministic; PreparedRule moves are plain memcpys, no re-allocs).
        tagged.sort_unstable_by_key(|(id, rule)| (*id, rule.original_index));
        // Emit contiguous (start, end) ranges per group id and unwrap the rules.
        let mut groups: Vec<(u32, u32)> = Vec::new();
        let mut rules_grouped: Vec<PreparedRule> = Vec::with_capacity(tagged.len());
        let mut run_start = 0u32;
        let mut run_id = tagged[0].0;
        for (pos, (id, rule)) in tagged.into_iter().enumerate() {
            if id != run_id {
                groups.push((run_start, pos as u32));
                run_start = pos as u32;
                run_id = id;
            }
            rules_grouped.push(rule);
        }
        groups.push((run_start, rules_grouped.len() as u32));
        Self { rules: rules_grouped, groups }
    }

    pub fn len(&self) -> usize {
        self.rules.len()
    }

    pub fn is_empty(&self) -> bool {
        self.rules.is_empty()
    }
}

impl BucketedRules {
    // Partition the flat rule list into shared vs per-slot buckets.
    // original_index is stamped onto each rule here so EvalMatch.rule_index always
    // refers to the flat-list position that TS callers use to look up rule metadata.
    // Both shared and per-slot vecs end up in original_index order (enumeration order).
    pub fn from_rules(rules: Vec<PreparedRule>) -> Self {
        let mut shared: Vec<PreparedRule> = Vec::new();
        let mut per_slot: BTreeMap<i64, Vec<PreparedRule>> = BTreeMap::new();
        for (idx, mut rule) in rules.into_iter().enumerate() {
            // Stamp the flat-list position before distributing into buckets.
            rule.original_index = idx;
            if rule.gate.artifact_types.is_empty() {
                // No slot constraint — every item evaluates this rule.
                shared.push(rule);
            } else {
                // Push into each declared slot bucket (clone for multi-slot rules).
                // Collect first: the iterator would borrow `rule` across the moves below.
                let slots: Vec<i64> = rule.gate.artifact_types.clone();
                let mut types_iter = slots.into_iter();
                // Move the rule into the first slot bucket; clone for any additional slots.
                let first_slot = types_iter.next().expect("non-empty artifact_types");
                for extra_slot in types_iter {
                    per_slot.entry(extra_slot).or_default().push(rule.clone());
                }
                per_slot.entry(first_slot).or_default().push(rule);
            }
        }
        // Group + permute each bucket by gate identity (see RuleBucket docs — rules keep
        // their original_index stamp, so flat-list semantics survive the permutation).
        Self {
            shared: RuleBucket::from_ordered_rules(shared),
            per_slot: per_slot
                .into_iter()
                .map(|(slot, bucket_rules)| (slot, RuleBucket::from_ordered_rules(bucket_rules)))
                .collect(),
        }
    }

    // Returns (shared_bucket, slot_specific_bucket) — both in original_index order.
    // Callers pass both to evaluate_item; the slot bucket is empty for slots with
    // no slot-specific rules.
    pub fn rules_for_slot(&self, slot: i64) -> (&RuleBucket, &RuleBucket) {
        let slot_rules = self.per_slot.get(&slot).unwrap_or(&EMPTY_RULE_BUCKET);
        (&self.shared, slot_rules)
    }

    // True when no rules of any kind are configured.
    pub fn is_empty(&self) -> bool {
        self.shared.is_empty() && self.per_slot.is_empty()
    }
}

// The GATE half of a prepared rule: every field that is constant across a generated rule
// group (substats are the only per-member variation). ONE struct serves as BOTH the
// grouping key in RuleBucket::from_ordered_rules AND the input of match_rule_gate, so the
// two can never drift — a new gate field added here automatically joins grouping and
// checking together (structural ODR; no comment-enforced lockstep).
// Ord (BTreeMap grouping key) per project rule: BTreeMap over HashMap in wasm/ code.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct RuleGate {
    pub use_flag: bool,
    pub faction: i64,
    pub rank_mask: u8,
    pub rarity_mask: u8,
    pub level_for_check: i64,
    pub main_stat_id: i64,
    pub main_stat_f: i64,
    // Rework gate: ORE_ANY ignores rework state, ORE_NOT_ORED requires an item that was
    // never reworked, ORE_ORED requires a reworked one. Normalized at prepare time so the
    // hot loop compares plain integers.
    pub ore: i64,
    pub artifact_types: Vec<i64>,
    pub artifact_sets: Vec<i64>,
}

// Keep only the data needed in hot matcher loops.
// Masks and recipe indices are precomputed at configure time.
// Clone is derived so BucketedRules can duplicate multi-slot rules into each relevant bucket.
#[derive(Debug, Clone)]
pub struct PreparedRule {
    // Position of this rule in the original flat rule list passed to configure_engine.
    // Preserved through bucketing so EvalMatch.rule_index stays consistent with TS rule arrays.
    pub original_index: usize,
    // Group-constant matching constraints (see RuleGate).
    pub gate: RuleGate,
    pub keep_flag: bool,
    pub substats: Vec<PreparedRuleSub>,
    pub recipe_idx: Option<i64>,
    pub source_bits: u8,
    // Arc<str> matches RuleRaw.source — clone is O(1).
    pub source_fallback: Option<Arc<str>>,
    pub safeguard_item_key: Option<i64>,
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
//
// ts-rs export: nested by EvaluateValueInWire.options + EvaluateAndCollectSafeguardProtectionInWire.options.
#[derive(Debug, Deserialize, Default, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
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
    // "¬" — the stat must be absent from the item (no value present).
    Not,
}

// Scratch buffers reused across items in evaluate_engine so each item avoids
// per-item HashSet and BTreeMap allocations in the hot evaluation loop.
pub struct EvaluateItemScratch {
    // (recipe_idx, first_keep_decision, first_match_original_index) triples.
    // The index term lets the group-based scan (which visits buckets out of flat-list
    // order) keep the LOWEST-index decision per recipe and restore flat-list encounter
    // order with one sort at the end of evaluate_item. Combines the roles of the old
    // matching_recipe_seen HashSet and matching_recipe_decisions BTreeMap in one Vec.
    pub recipe_matches: Vec<(i64, bool, usize)>,
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
const RULE_SOURCE_BIT_SFC: u8 = 1 << 1;
const RULE_SOURCE_BIT_FINAL_SELL: u8 = 1 << 2;
const RULE_SOURCE_BIT_SAFEGUARDS: u8 = 1 << 3;

fn rule_source_bit(raw: &str) -> Option<u8> {
    match raw {
        RULE_SOURCE_HSF => Some(RULE_SOURCE_BIT_HSF),
        RULE_SOURCE_SFC => Some(RULE_SOURCE_BIT_SFC),
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
//
// ts-rs export: writes `EvalMatch.ts` to src/lib/wasm/generated/rust-types/ during
// `cargo test`.  The build script runs cargo test with `TS_RS_LARGE_INT=number` so
// i64 maps to TS `number` (matching serde_wasm_bindgen's default i64 → JS number
// wire encoding — bigint would only apply if `serialize_large_number_types` were
// enabled in the Serializer, which it is not).
// `#[ts(rename_all = "camelCase")]` mirrors the #[serde(rename_all = ...)] attribute
// so the generated TS interface uses ruleIndex/recipeIdx, not rule_index/recipe_idx.
#[derive(Debug, Serialize, Clone, Copy, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct EvalMatch {
    pub rule_index: usize,
    pub keep: bool,
    pub recipe_idx: Option<i64>,
    // Runtime-only flag; not serialized to JS — used to decide if a baseline re-evaluation
    // is needed without looking up the rule from the bucketed structure.
    // `#[ts(skip)]` mirrors `#[serde(skip)]` so the field disappears from the generated TS.
    #[serde(skip)]
    #[ts(skip)]
    pub is_keep_override_source: bool,
}

// Serialized per-recipe keep/sell decision list.
// ts-rs: nested inside EvaluateItemResult.matchingRecipeDecisions — exported so the
// generated TS interface can reference it by name (`MatchingRecipeDecision[]`).
// i64 maps to TS `number` via TS_RS_LARGE_INT=number (set in the build script).
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct MatchingRecipeDecision {
    pub recipe_idx: i64,
    pub keep: bool,
}

// Serialized item result shape mirrors TesterMatchWorkerItemResult.
// ts-rs export: nested-types representative — Option<EvalMatch>,
// Vec<MatchingRecipeDecision>, Vec<i64>.  All inner refs land via TS imports.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct EvaluateItemResult {
    pub item_id: i64,
    pub first_match: Option<EvalMatch>,
    pub first_non_excluded_match: Option<EvalMatch>,
    pub matching_recipe_indices: Vec<i64>,
    pub matching_recipe_decisions: Vec<MatchingRecipeDecision>,
}

// Only the fields needed for keep/sell fallback logic cross the boundary.
//
// ts-rs export: nested by SafeguardCollectRowFastIn.baseMatch (fast-path input).
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardCandidateResolveBaseMatchIn {
    pub keep: bool,
    pub recipe_idx: Option<i64>,
}

// Candidate collection input extends resolver rows with normalized artifact data.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SafeguardCollectRowIn {
    pub item: TestItemRaw,
    #[serde(default)]
    pub base_match_defined: bool,
    pub base_match: Option<SafeguardCandidateResolveBaseMatchIn>,
    pub artifact: SafeguardWasmArtifactIn,
}

// Candidate snapshot entry mirrors safeguards.ts SafeguardCandidate shape.
// artifact is intentionally omitted: TS callers reconstruct it from rows[rowIndex].
//
// ts-rs export: referenced by name from SafeguardCollectedSnapshotOut.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardCollectedCandidateOut {
    pub row_index: usize,
    pub item_key: i64,
    pub bucket_key: String,
    pub is_sold: bool,
}

// Candidate snapshot payload also includes sold-item key dedupe set.
//
// ts-rs export: composes SafeguardCollectedCandidateOut.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
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
        // "¬" means the stat must be absent from the item.
        "¬" => PreparedRuleSubCondition::Not,
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
    // Missing Ore means the rule does not care about the rework state.
    let ore = raw.Ore.unwrap_or(ORE_ANY);
    // MainStatF is now Option<i64>; 0 = percent, non-zero = flat.
    let main_stat_f = raw.MainStatF.map_or(0_i64, |v| i64::from(v != 0));
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
            // IsFlat is now Option<bool>; map to the i64 flag sub_to_variant expects.
            let variant = sub_to_variant(id, sub.IsFlat.map_or(0_i64, i64::from));
            Some(PreparedRuleSub {
                variant,
                // Rules carry HSF WIRE units (anomalous 1.25% -> 125); item sub_values
                // carry DISPLAY units (1.25). Normalize the threshold to display units
                // once here, at configure time, so the hot matcher compares like with
                // like without paying a scale lookup per item per rule. Classic stats
                // scale by 1, which is why this was invisible before these stats existed.
                value: wire_value_to_display(variant, sub.Value.unwrap_or(0.0)),
                condition: parse_sub_condition(sub.Condition.as_deref()),
            })
        })
        .collect::<Vec<_>>();

    PreparedRule {
        // original_index is 0 here; configure_engine sets the real value after bucketing.
        original_index: 0,
        gate: RuleGate {
            use_flag,
            faction,
            rank_mask: rank_mask(raw.Rank.unwrap_or(0)),
            rarity_mask: rarity_mask(raw.Rarity.unwrap_or(0)),
            level_for_check,
            main_stat_id,
            main_stat_f,
            ore,
            artifact_types,
            artifact_sets,
        },
        keep_flag,
        substats,
        recipe_idx,
        source_bits,
        source_fallback,
        safeguard_item_key: raw.safeguard_item_key,
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
// Items have ≤4 substats, so linear scan has better cache behavior than BTreeMap.
fn read_sub_value(sub_values: &Option<Vec<(i64, f64)>>, variant: i64) -> Option<f64> {
    sub_values
        .as_ref()
        .and_then(|values| values.iter().find(|(k, _)| *k == variant).map(|(_, v)| *v))
}

/// The single definition of "this item has been reworked" (a Chaos Ore was applied).
///
/// Items that never reported a rework count are treated as never reworked, matching how
/// the Gear Inspector chaos-ore filter reads missing data. The TS side expresses the same
/// predicate as `rerollCount > 0` in src/lib/rulesFilter.ts (chaosMode) and
/// src/lib/gearAnalytics.ts (the "Chaos'd" KPI); if the meaning of the count ever changes,
/// all three must change together.
pub fn item_has_been_reworked(reroll_count: Option<i64>) -> bool {
    reroll_count.unwrap_or(0) > 0
}

// Gate half of the rule predicate: every field that is CONSTANT across a generated rule
// group. Substats are the only per-member variation and live in match_rule_substats.
// This predicate (gate + substats) is the SSOT for rule matching — it mirrors RSL
// Helper's semantics, and the TS side (src/lib/ruleEval.ts matchRule/evaluateFirst/
// evaluateMatchesByRecipe) is a thin adapter that DELEGATES here via the WASM engine;
// there is no JS reimplementation to keep in sync.
// The field set needs no manual lockstep: RuleGate IS the grouping key (see its doc
// comment), so any field added there joins grouping and checking at the same time.
// item_rank_bit / item_rarity_bit are hoisted per item by the caller — they do not vary
// across rules, so recomputing them per gate check would be pure waste.
fn match_rule_gate(
    gate: &RuleGate,
    item: &TestItemRaw,
    item_rank_bit: u8,
    item_rarity_bit: u8,
) -> bool {
    if !gate.use_flag {
        return false;
    }

    // safeguard_item_key is intentionally NOT checked here: it is used for dedupe,
    // sort ordering, and UI display only. Matching must mirror RSL Helper's behaviour —
    // the exported HSF rule carries no item-key restriction, so any item satisfying the
    // set/slot/rank/main-stat/level/substat conditions should be kept.

    if !gate.artifact_types.is_empty() && !gate.artifact_types.contains(&item.slot) {
        return false;
    }

    if !gate.artifact_sets.is_empty() && !gate.artifact_sets.contains(&item.set) {
        return false;
    }

    // Non-accessories send faction as None; Helper ignores faction constraints
    // for items that cannot carry faction, so skip the check in that case.
    // Accessories with faction 0 ("Any") still correctly fail faction-specific rules.
    if gate.faction != 0 {
        if let Some(item_faction) = item.faction {
            if item_faction != gate.faction {
                return false;
            }
        }
    }

    if (gate.rank_mask & item_rank_bit) == 0 {
        return false;
    }

    if (gate.rarity_mask & item_rarity_bit) == 0 {
        return false;
    }

    if gate.level_for_check != LEVEL_ANY_SENTINEL && gate.level_for_check != item.level {
        return false;
    }

    // Rework gate. ORE_ANY short-circuits so untagged rules pay only one compare.
    if gate.ore != ORE_ANY {
        // ORE_ORED demands a reworked item; any other constrained value demands a pristine one.
        let wants_ored = gate.ore == ORE_ORED;
        if item_has_been_reworked(item.reroll_count) != wants_ored {
            return false;
        }
    }

    if gate.main_stat_id != STAT_ID_ANY {
        let expected_main = main_to_variant(gate.main_stat_id, gate.main_stat_f);
        let actual_main = item.main.unwrap_or(STAT_ID_ANY);
        if expected_main != actual_main {
            return false;
        }
    }

    true
}

// Substat half of the rule predicate — the per-member check inside a gate group.
// match_rule_gate(...) && match_rule_substats(...) together form the full rule-match
// predicate (see the SSOT note on match_rule_gate).
fn match_rule_substats(rule: &PreparedRule, item: &TestItemRaw) -> bool {
    for sub in &rule.substats {
        let raw_value = read_sub_value(&item.sub_values, sub.variant);
        let has_value = raw_value.is_some_and(|v| v.is_finite() && v > 0.0);
        let have = raw_value.unwrap_or(0.0);

        // "¬" passes only when the stat is absent; always short-circuit here.
        if sub.condition == PreparedRuleSubCondition::Not {
            if has_value {
                return false;
            }
            continue;
        }

        let needs_presence = sub.condition == PreparedRuleSubCondition::AtMost;

        if needs_presence && !has_value {
            return false;
        }

        let ok = match sub.condition {
            PreparedRuleSubCondition::AtLeast => have >= sub.value,
            PreparedRuleSubCondition::AtMost => have <= sub.value,
            PreparedRuleSubCondition::Equal => (have - sub.value).abs() < f64::EPSILON,
            PreparedRuleSubCondition::Not => true, // handled above
        };

        if !ok {
            return false;
        }
    }

    true
}

// Recipe visibility gate (disabled/separator modes + explicit exclusions). SSOT here;
// the TS evaluateMatchesByRecipe delegates to this engine rather than re-implementing it.
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

// Order-independent equivalent of "first hit wins in flat-list walk order": keep the
// candidate with the lowest original_index across arbitrarily-ordered group visits.
fn take_min_index(slot: &mut Option<EvalMatch>, candidate: EvalMatch) {
    // EvalMatch is Copy; map_or reads the current winner without consuming the Option.
    if slot.map_or(true, |current| candidate.rule_index < current.rule_index) {
        *slot = Some(candidate);
    }
}

// Hot-path evaluator writes recipe matches into scratch to avoid per-item
// HashSet and BTreeMap allocations. Returns only the two first-match results;
// callers read recipe data from scratch.recipe_matches after the call.
//
// shared: slot-agnostic bucket from BucketedRules; slot_rules: this slot's bucket.
// Both come from BucketedRules::rules_for_slot(item.slot) at the call site.
//
// Group-based scan: each bucket's rules are pre-partitioned into same-gate runs
// (RuleBucket::groups), so the gate (slot/set/faction/rank/rarity/level/main-stat) is
// checked ONCE per group and only passing groups pay the per-member substat scan —
// ~7× fewer predicate evaluations than the previous per-rule walk on real rulesets.
// Groups are visited bucket-by-bucket (NOT in global flat-list order); "first match
// wins" is preserved by tracking the minimum original_index per category instead,
// which is equivalent because a single ordered walk's first hit IS the min-index hit.
pub fn evaluate_item(
    shared: &RuleBucket,
    slot_rules: &RuleBucket,
    recipe_modes: &[String],
    item: &TestItemRaw,
    options: &EvaluateOptionsPrepared,
    scratch: &mut EvaluateItemScratch,
) -> (Option<EvalMatch>, Option<EvalMatch>) {
    // Reuse scratch capacity; clear retains the allocation.
    scratch.clear();

    // Min-index winners per category (see take_min_index):
    //   first_match           — non-override rule, recipe-visible, not source-excluded.
    //   pending_keep_override — keep-override rule, recipe-visible, not source-excluded.
    //   prekeep_override      — keep-override rule BEFORE recipe gating (fallback when
    //                           no post-gate keep_override is available).
    let mut first_match: Option<EvalMatch> = None;
    let mut pending_keep_override: Option<EvalMatch> = None;
    let mut prekeep_override: Option<EvalMatch> = None;

    // Item-side gate terms are invariant across rules; hoist them out of the loops.
    let item_rank_bit = bit_for_rank_or_rarity(item.rank);
    let item_rarity_bit = bit_for_rank_or_rarity(item.rarity);

    for bucket in [shared, slot_rules] {
        for &(start, end) in &bucket.groups {
            let members = &bucket.rules[start as usize..end as usize];
            // One head check decides the whole run — members share one RuleGate value
            // by RuleBucket construction (the gate IS the grouping key).
            if !match_rule_gate(&members[0].gate, item, item_rank_bit, item_rarity_bit) {
                continue;
            }
            for rule in members {
                if !match_rule_substats(rule, item) {
                    continue;
                }
                let rule_index = rule.original_index;

                // Track the min-index keep-override hit before recipe gating so the
                // fallback semantics match the TypeScript path without an extra pre-scan.
                if rule.is_keep_override_source {
                    take_min_index(&mut prekeep_override, EvalMatch {
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

                // Keep-override sources always keep; regular rules use their own flag.
                let keep = if rule.is_keep_override_source {
                    true
                } else {
                    rule.keep_flag
                };

                if rule.is_keep_override_source {
                    if !is_excluded {
                        take_min_index(&mut pending_keep_override, EvalMatch {
                            rule_index,
                            keep,
                            recipe_idx: rule.recipe_idx,
                            is_keep_override_source: true,
                        });
                    }
                } else if !is_excluded {
                    take_min_index(&mut first_match, EvalMatch {
                        rule_index,
                        keep,
                        recipe_idx: rule.recipe_idx,
                        is_keep_override_source: false,
                    });
                }

                if let Some(recipe_idx) = rule.recipe_idx {
                    // Linear dedup + min-index decision tracking in one pass; recipe
                    // counts are small (typically < 50) so linear scan beats a HashSet.
                    match scratch.recipe_matches.iter_mut().find(|entry| entry.0 == recipe_idx) {
                        Some(entry) => {
                            // A lower-index rule for the same recipe overrides the decision
                            // (equivalent to "first decision wins" in flat-list order).
                            if rule_index < entry.2 {
                                entry.1 = keep;
                                entry.2 = rule_index;
                            }
                        }
                        None => scratch.recipe_matches.push((recipe_idx, keep, rule_index)),
                    }
                }
            }
        }
    }

    // Restore flat-list encounter order for per-recipe decisions — consumers preserve
    // this order into matchingRecipeIndices/Decisions, which the UI displays as-is.
    scratch.recipe_matches.sort_unstable_by_key(|entry| entry.2);

    // The historical walk tracked first_non_excluded_match under conditions identical to
    // first_match (they only diverge in the keep-override resolution below), so it is
    // seeded from first_match here instead of being tracked separately in the scan.
    let mut first_non_excluded_match = first_match;

    // EvalMatch is Copy; no need for as_ref() to avoid consuming the Option.
    let first_match_is_keep = first_match
        .map(|entry| entry.keep && !options.safeguard_cfg_is_ignored(entry.recipe_idx))
        .unwrap_or(false);

    // A keep-recipe matching but losing first-match to an earlier sell-recipe is dead code under
    // HSF first-match semantics — the only signal that "the recipes keep this item" is whether
    // first_match itself is a non-ignored keep. Tracking any-keep-recipe-matched would block
    // safeguard overrides for items the engine actually sells.
    let allow_keep_override = !first_match_is_keep;
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
    let no_rules = bucketed_rules.is_empty();
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
        let (shared, slot_rules) = bucketed_rules.rules_for_slot(row.item.slot);
        let (first_match, _) = evaluate_item(
            shared,
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
        let bucket_key = safeguard_bucket_key_from_parts(
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
            bucket_key,
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

#[cfg(test)]
mod tests {
    use super::*;

    // Construct a minimal PreparedRule that matches any item of the given slot.
    // artifact_types empty → shared (any-type) bucket; non-empty → slot-specific.
    fn make_rule(original_index: usize, recipe_idx: i64, artifact_types: Vec<i64>) -> PreparedRule {
        PreparedRule {
            original_index,
            gate: RuleGate {
                use_flag: true,
                faction: 0,
                // 0xFF matches every rank and rarity bit without needing specific values.
                rank_mask: 0xFF,
                rarity_mask: 0xFF,
                // LEVEL_ANY_SENTINEL bypasses the level check in the gate.
                level_for_check: LEVEL_ANY_SENTINEL,
                // STAT_ID_ANY bypasses the main-stat check in the gate.
                main_stat_id: STAT_ID_ANY,
                main_stat_f: 0,
                // ORE_ANY bypasses the chaos-ore check in the gate.
                ore: ORE_ANY,
                artifact_types,
                artifact_sets: vec![],
            },
            keep_flag: true,
            substats: vec![],
            recipe_idx: Some(recipe_idx),
            source_bits: 0,
            source_fallback: None,
            safeguard_item_key: None,
            is_keep_override_source: false,
        }
    }

    // Minimal weapon item; slot 1 = Weapon in RSL domain constants.
    fn make_weapon_item() -> TestItemRaw {
        TestItemRaw {
            slot: 1,
            set: 1,
            rank: 6,
            rarity: 5,
            level: LEVEL_ANY_SENTINEL,
            faction: None,
            main: None,
            // Never-reworked fixture item; the Ore gate is exercised by its own tests.
            reroll_count: None,
            sub_values: None,
            item_id: None,
            preview_extras: None,
        }
    }

    // Before the fix, BucketedRules evaluated shared rules before slot-specific rules,
    // so a recipe-181 any-type rule (shared bucket) fired ahead of a recipe-49 slot-specific
    // rule even though recipe 49 appeared first in the flat rule list — producing the wrong
    // first_match recipe index.
    //
    // After the fix, merged_per_slot sorts shared + slot-specific rules by original_index
    // so the evaluation order matches the flat-list position regardless of bucket origin.
    #[test]
    fn slot_specific_rule_fires_before_later_any_type_rule() {
        // Flat list: index 0 = recipe 49 (weapon-only), index 1 = recipe 181 (any type).
        // Recipe 49 should be first_match for a weapon item; recipe 181 must not jump ahead.
        let rule_49 = make_rule(0, 49, vec![1]);   // slot-specific: Weapon
        let rule_181 = make_rule(1, 181, vec![]);  // any-type: shared bucket
        let bucketed = BucketedRules::from_rules(vec![rule_49, rule_181]);

        let item = make_weapon_item();
        let mut scratch = EvaluateItemScratch::new();
        let options = EvaluateOptionsPrepared::default();

        let (shared, slot_rules) = bucketed.rules_for_slot(item.slot);
        let (first_match, _) = evaluate_item(shared, slot_rules, &[], &item, &options, &mut scratch);

        assert_eq!(
            first_match.and_then(|m| m.recipe_idx),
            Some(49),
            "recipe 49 has a lower flat-list index than recipe 181; it must be first_match"
        );
        // matchingRecipeIndices must also respect flat-list order.
        let indices: Vec<i64> = scratch.recipe_matches.iter().map(|(k, _, _)| *k).collect();
        assert_eq!(indices, vec![49, 181], "recipe 49 must precede recipe 181 in match order");
    }

    // Inverse case: when the any-type rule genuinely comes first in the flat list it
    // must still win, so the fix does not accidentally invert the ordering.
    #[test]
    fn any_type_rule_fires_first_when_it_has_lower_flat_index() {
        // Flat list: index 0 = recipe 181 (any type), index 1 = recipe 49 (weapon-only).
        let rule_181 = make_rule(0, 181, vec![]);  // any-type: flat index 0
        let rule_49 = make_rule(1, 49, vec![1]);   // slot-specific: flat index 1
        let bucketed = BucketedRules::from_rules(vec![rule_181, rule_49]);

        let item = make_weapon_item();
        let mut scratch = EvaluateItemScratch::new();
        let options = EvaluateOptionsPrepared::default();

        let (shared, slot_rules) = bucketed.rules_for_slot(item.slot);
        let (first_match, _) = evaluate_item(shared, slot_rules, &[], &item, &options, &mut scratch);

        assert_eq!(
            first_match.and_then(|m| m.recipe_idx),
            Some(181),
            "recipe 181 has a lower flat-list index here; it must be first_match"
        );
        let indices: Vec<i64> = scratch.recipe_matches.iter().map(|(k, _, _)| *k).collect();
        assert_eq!(indices, vec![181, 49]);
    }

    // A slot with no slot-specific rules must still receive the shared rules.
    #[test]
    fn slot_with_no_specific_rules_receives_shared_rules() {
        let rule_any = make_rule(0, 10, vec![]);  // any-type only
        let bucketed = BucketedRules::from_rules(vec![rule_any]);
        // Slot 99 has no slot-specific rules — fall back to shared.
        let (shared, slot_rules) = bucketed.rules_for_slot(99);
        assert_eq!(shared.len() + slot_rules.len(), 1, "shared-only slot must return the single shared rule");
    }

    // ---- Rework (Ore) gate ----

    // Build a gate that matches anything except for the rework constraint under test.
    fn make_ore_gate(ore: i64) -> RuleGate {
        RuleGate {
            use_flag: true,
            faction: 0,
            rank_mask: 0xFF,
            rarity_mask: 0xFF,
            level_for_check: LEVEL_ANY_SENTINEL,
            main_stat_id: STAT_ID_ANY,
            main_stat_f: 0,
            ore,
            artifact_types: vec![],
            artifact_sets: vec![],
        }
    }

    // Item whose only interesting property is how many times it was reworked.
    fn make_item_with_reworks(reroll_count: Option<i64>) -> TestItemRaw {
        let mut item = make_weapon_item();
        item.reroll_count = reroll_count;
        item
    }

    // Helper: run just the gate half of the predicate with wide-open rank/rarity bits.
    fn gate_matches(ore: i64, reroll_count: Option<i64>) -> bool {
        match_rule_gate(&make_ore_gate(ore), &make_item_with_reworks(reroll_count), 0xFF, 0xFF)
    }

    // ORE_ANY is the untagged default and must never filter anything out.
    #[test]
    fn ore_any_matches_regardless_of_rework_state() {
        assert!(gate_matches(ORE_ANY, None), "missing rework data must still match");
        assert!(gate_matches(ORE_ANY, Some(0)), "never-reworked must match");
        assert!(gate_matches(ORE_ANY, Some(3)), "reworked must match");
    }

    // ORE_ORED narrows to gear that has actually been reworked.
    #[test]
    fn ore_ored_matches_only_reworked_items() {
        assert!(gate_matches(ORE_ORED, Some(1)), "one rework counts as reworked");
        assert!(gate_matches(ORE_ORED, Some(9)), "many reworks count as reworked");
        assert!(!gate_matches(ORE_ORED, Some(0)), "never-reworked must be rejected");
        assert!(!gate_matches(ORE_ORED, None), "missing data is treated as never-reworked");
    }

    // ORE_NOT_ORED narrows to pristine gear.
    #[test]
    fn ore_not_ored_matches_only_pristine_items() {
        assert!(gate_matches(ORE_NOT_ORED, Some(0)), "never-reworked must match");
        assert!(gate_matches(ORE_NOT_ORED, None), "missing data is treated as never-reworked");
        assert!(!gate_matches(ORE_NOT_ORED, Some(1)), "reworked must be rejected");
    }

    // prepare_rule must normalize an absent Ore to the unconstrained sentinel so that
    // every rule written before this feature keeps matching exactly as it did.
    #[test]
    fn prepare_rule_defaults_missing_ore_to_any() {
        let raw = RuleRaw {
            RecipeID: None, RecipeName: None, Keep: Some(true), IsRuleTypeAND: None,
            Use: Some(true), ArtifactSet: None, ArtifactType: None, Rank: None, Rarity: None,
            MainStatID: None, MainStatF: None, Ore: None, LVLForCheck: None, Faction: None,
            Substats: None, source: None, line_idx: None, all_known_sets: None,
            rank_mask: None, rarity_mask: None, safeguard_rule_id: None,
            safeguard_rule_ordinal: None, safeguard_hash: None, safeguard_required: None,
            safeguard_scan_ms: None, safeguard_projected: None, safeguard_deficit: None,
            safeguard_item_key: None, safeguard_placeholder: None,
            safeguard_placeholder_missing: None,
        };
        assert_eq!(prepare_rule(raw).gate.ore, ORE_ANY);
    }

    // ---- Rework gate → Ore resolution ----
    // Mirror of oreSentinelForRecipe + transcodeLegacyRecipeTags in recipeFlags.ts.
    // Keep these cases in step with tests/unit/recipe-flags.test.ts: the two readers must
    // agree, or the native DLL and the app disagree about which gear a recipe matches.

    // Convenience wrappers so each case reads as either a gate or a list of tag spellings.
    fn resolve_gate(gate: &str) -> i64 {
        crate::sfc_reader::resolve_chaos_ore_value(Some(gate), None)
    }
    fn resolve_tags(tags: &[&str]) -> i64 {
        let owned: Vec<String> = tags.iter().map(|s| (*s).to_string()).collect();
        crate::sfc_reader::resolve_chaos_ore_value(None, Some(&owned))
    }

    #[test]
    fn rework_gate_resolves_to_expected_sentinels() {
        // No gate and no tags leaves the rule unconstrained.
        assert_eq!(crate::sfc_reader::resolve_chaos_ore_value(None, None), ORE_ANY);
        // Each gate selects its own sentinel.
        assert_eq!(resolve_gate(REWORK_GATE_REWORKED), ORE_ORED);
        assert_eq!(resolve_gate(REWORK_GATE_NOT_REWORKED), ORE_NOT_ORED);
        // An unrecognized gate (hand edit, or a newer build) degrades to unconstrained
        // rather than guessing a state.
        assert_eq!(resolve_gate("someFutureGate"), ORE_ANY);
    }

    #[test]
    fn legacy_recipe_tags_still_resolve_to_expected_sentinels() {
        // No tags, and unrelated tags, leave the rule unconstrained.
        assert_eq!(resolve_tags(&[]), ORE_ANY);
        assert_eq!(resolve_tags(&["ignore_by_safeguards"]), ORE_ANY);
        // Each canonical spelling selects its own sentinel.
        assert_eq!(resolve_tags(&["if_reworked"]), ORE_ORED);
        assert_eq!(resolve_tags(&["if_not_reworked"]), ORE_NOT_ORED);
        // Normalization mirrors the TS tag grammar (trim + case-insensitive).
        assert_eq!(resolve_tags(&["  IF_Reworked  "]), ORE_ORED);
        // Pre-rename spellings must keep resolving; a recipe saved before the rename
        // otherwise loses its rework constraint without any warning.
        assert_eq!(resolve_tags(&["only_for_chaos_ored"]), ORE_ORED);
        assert_eq!(resolve_tags(&["ignore_for_chaos_ored"]), ORE_NOT_ORED);
        assert_eq!(resolve_tags(&["ignore_by_safeguards", "ignore_for_chaos_ored", "ore5epic"]), ORE_NOT_ORED);
        // Coexisting with other tags does not change the outcome.
        assert_eq!(resolve_tags(&["ignore_by_safeguards", "if_reworked"]), ORE_ORED);
        // Both tags at once: reworked wins, regardless of order in the list.
        assert_eq!(resolve_tags(&["if_reworked", "if_not_reworked"]), ORE_ORED);
        assert_eq!(resolve_tags(&["if_not_reworked", "if_reworked"]), ORE_ORED);
    }

    #[test]
    fn an_explicit_gate_beats_a_stale_legacy_tag() {
        // A current build wrote the gate; a hand-merged file could still carry the old tag.
        // The gate is authoritative so the newer intent is not overridden.
        let tags: Vec<String> = vec!["if_not_reworked".to_string()];
        assert_eq!(
            crate::sfc_reader::resolve_chaos_ore_value(Some(REWORK_GATE_REWORKED), Some(&tags)),
            ORE_ORED,
        );
    }
}

