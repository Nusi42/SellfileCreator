// Direct Rust translation of safeguardImprovementChance.ts.
// Probability computation runs in WASM on the rule-cache worker thread
// so the main-thread useMemo is eliminated (Bug 3 fix).
// Bug 1 fix (enabled-gate): caller passes `enabled` and we return early.
// Bug 2 fix (challenger projection): challenger pool uses closed-form expected
// +16 scores rather than current-level scores, making the comparison fair.
use super::{
    // Pub structs declared in mod.rs.
    SafeguardCountKey, SafeguardWasmArtifactIn, SafeguardWasmCombination, SafeguardWasmCountMode,
    SafeguardWasmRuleIn,
    // Functions made pub(super) for this submodule.
    glyph_average_for_variant,
    safeguard_compute_score, safeguard_count_key_from_parts,
    safeguard_is_activation_off, safeguard_matches_selection,
    safeguard_normalize_substat_value, safeguard_percent_to_flat_main,
    safeguard_split_set_selections, safeguard_substat_max6_by_variant,
    safeguard_weight_for_variant,
    // Already-pub functions.
    safeguard_normalize_substat_match, safeguard_normalized_faction_for_slot,
    safeguard_resolve_count_mode,
};
use crate::{
    SafeguardCollectRowIn,
    // Slot type constants from generated_domain_constants.
    ARTIFACT_TYPE_AMULET, ARTIFACT_TYPE_BANNER, ARTIFACT_TYPE_BOOTS, ARTIFACT_TYPE_CHESTPLATE,
    ARTIFACT_TYPE_GAUNTLETS, ARTIFACT_TYPE_HELMET, ARTIFACT_TYPE_RING, ARTIFACT_TYPE_SHIELD,
    ARTIFACT_TYPE_WEAPON,
    // Safeguard token constants from generated_domain_constants.
    SAFEGUARD_SUBSTAT_PER_SUBSTAT,
    // Stat variant constants from generated_domain_constants.
    STAT_VARIANT_ACC, STAT_VARIANT_ANY, STAT_VARIANT_ATK_FLAT, STAT_VARIANT_ATK_PERCENT,
    STAT_VARIANT_CDMG, STAT_VARIANT_CR, STAT_VARIANT_DEF_FLAT, STAT_VARIANT_DEF_PERCENT,
    STAT_VARIANT_HP_FLAT, STAT_VARIANT_HP_PERCENT, STAT_VARIANT_RES, STAT_VARIANT_ROLL_COUNT,
    STAT_VARIANT_SPD,
    // Per-star substat roll ranges for two-value branching.
    SUBSTAT_ROLL_RANGES_BY_STAR,
};
use serde::{Deserialize, Serialize};
// ts-rs trait import enables `#[derive(TS)]` on this submodule's output types.
use ts_rs::TS;
use std::collections::{BTreeMap, HashSet};

// ─── constants ───────────────────────────────────────────────────────────────

// All upgrade projections target +16 since safeguards compare final gear value.
const UPGRADE_TARGET_LEVEL: i64 = 16;
// Gear can never hold more than four substats simultaneously.
const MAX_SUBSTAT_SLOTS: usize = 4;
// Fixed upgrade event milestones; each triggers either a roll or an addition.
// pub(super) so improvement_watch derives per-level roll multipliers from the same table.
pub(super) const ROLL_MILESTONES: [i64; 4] = [4, 8, 12, 16];
// Per-rarity schedules; entries mark which milestones add a new substat.
const ADDITION_MILESTONES_R1: &[i64] = &[4, 8, 12, 16];
const ADDITION_MILESTONES_R2: &[i64] = &[8, 12, 16];
const ADDITION_MILESTONES_R3: &[i64] = &[12, 16];
const ADDITION_MILESTONES_R4: &[i64] = &[16];
const ADDITION_MILESTONES_R56: &[i64] = &[];
// Scoring: deltas smaller than epsilon are treated as ties (matches matcher).
const SCORE_TIE_EPSILON: f64 = 1e-9;
// Recursion state values are scaled integers for deterministic string keys.
const STATE_VALUE_SCALE: i64 = 1_000;
// Unknown roll quality: conservative 83 % of rank-6 max per roll event.
const UNKNOWN_ROLL_QUALITY_RATIO: f64 = 0.83;
// Lower-rank gear rolls weaker on average; this is the rank-1 floor factor.
const UNKNOWN_ROLL_MIN_RANK_SCALE: f64 = 0.6;
// Two-value branching only kicks in at milestones at or above this level.
// Early milestones (+4, +8) use a single average gain to reduce branching factor.
const TWO_VALUE_BRANCHING_MIN_MILESTONE: i64 = 12;

// ─── public output types ─────────────────────────────────────────────────────

// ts-rs export: optional diagnostics block embedded in ImprovementChanceEntry.debug.
#[derive(Debug, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ImprovementChanceDebug {
    // Number of viable scenarios that can match this artifact by +16.
    pub viable_scenario_count: u32,
    // Selected substats used by the preferred scenario (full rule set).
    pub selected_substats: Vec<i64>,
    // Original match mode for the preferred scenario's rule.
    pub substat_match: String,
    // Required keeps for the safeguard count bucket.
    pub required_per_group: i64,
    // Number of challengers currently in the same count bucket (excl. self).
    pub bucket_candidate_count: u32,
    // Number of challengers whose projected +16 score strictly beats this artifact.
    pub better_candidate_count: u32,
    // Current matched selected-substat count on the artifact before upgrading.
    pub matched_selected_now: u8,
    // Remaining add-substat events available before reaching +16.
    pub max_addition_events_to16: u8,
}

// Per-rule chance entry inside ImprovementChanceEntry. Carried as a list (not a map) so the
// payload round-trips through serde_wasm_bindgen's to_js_value / from_js_value without needing
// the maps-as-objects serializer. The consumer in mod.rs rebuilds a BTreeMap<(art_id, rule_ordinal), f64>
// from these lists for O(1) lookup during threshold expansion.
// ts-rs export: leaf entry inside ImprovementChanceEntry.chancesByRuleOrdinal.
// Also used as the element type for ImprovementChanceInput.chancesByRuleOrdinal (the
// round-trip from TS back to Rust); Deserialize is added so one struct serves both
// directions and ImprovementChanceRuleInput (wasm crate) can be deleted.
#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ImprovementChanceRuleEntry {
    // 1-based safeguard rule ordinal in the input rules list.
    pub rule_ordinal: i64,
    // Probability (0.0–100.0, one decimal place) the artifact lands in THIS rule's top-N at +16.
    pub chance_percent: f64,
}

// ts-rs export: artifact-keyed improvement-chance entry; debug is optional.
// The matched_rule_ordinal field uses #[serde(rename = "ruleOrdinal")] which overrides
// the struct-level camelCase rename to a literal "ruleOrdinal"; the same rename is
// mirrored as a #[ts(rename = ...)] attribute so the generated TS field name agrees.
#[derive(Debug, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ImprovementChanceEntry {
    // Artifact id this entry describes.
    pub artifact_id: i64,
    // Probability (0.0–100.0, one decimal place) of being safeguard-selected at +16.
    // This is the MAX across per-rule chances — used by the overlay for a single-value display.
    pub chance_percent: f64,
    // True when at least one substat safeguard applies to this artifact.
    pub has_matching_safeguard: bool,
    // 1-based ordinal of the preferred safeguard rule (the rule with the max chance); None when no rule matched.
    // Renamed to "ruleOrdinal" to match TS type ImprovementChanceWasmEntry; overrides the struct-level
    // camelCase rename which would otherwise produce "matchedRuleOrdinal".
    #[serde(rename = "ruleOrdinal")]
    #[ts(rename = "ruleOrdinal")]
    pub matched_rule_ordinal: Option<i64>,
    // Per-rule chances keyed by 1-based safeguard rule ordinal. Used by mod.rs's
    // improvement_chance_threshold expansion so each rule consults the chance of the
    // artifact landing in ITS OWN top-N — not the global union across all rules.
    // Empty when no rules apply to this artifact.
    pub chances_by_rule_ordinal: Vec<ImprovementChanceRuleEntry>,
    // Optional debug snapshot populated when the caller requests diagnostics.
    pub debug: Option<ImprovementChanceDebug>,
}

// Performance counters returned when the caller sets debug=true.
// Gives JS a breakdown of work done without wall-clock timers (unavailable in
// wasm32 without web_sys). JS times the outer call with performance.now() and
// uses these counts to understand scaling (e.g. why 10k artifacts × N scenarios
// is slow even when each compute_probability depth is bounded at 4).
// ts-rs export: per-call perf counters returned when debug=true.
#[derive(Debug, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ImprovementChancePerfDiag {
    // Total artifact rows passed to the function.
    pub row_count: u32,
    // Prepared upgrade rules after filtering (substat rules only).
    pub rule_count: u32,
    // Total unique scenarios built (can exceed rule_count due to perSubstat expansion).
    pub scenario_count: u32,
    // Artifacts that had at least one applicable scenario (non-zero input to viability pruning).
    pub artifacts_with_scenarios: u32,
    // Artifacts that passed viability pruning and received a compute_artifact_chance_percent call.
    pub artifacts_viable: u32,
}

// ─── internal structs ────────────────────────────────────────────────────────

// Prepared rule distilled from SafeguardWasmRuleIn; all parsing done once.
// pub(super) because pub(super) prepare_upgrade_rules returns it (fields stay private).
pub(super) struct PreparedUpgradeRule {
    rule_order: usize,
    combination: SafeguardWasmCombination,
    required_per_group: i64,
    count_mode: SafeguardWasmCountMode,
    selected_substats: Vec<i64>,
    // "any" | "all" | "perSubstat" after normalization.
    substat_match: String,
    weights: BTreeMap<i64, f64>,
    set_includes: HashSet<i64>,
    set_excludes: HashSet<i64>,
    ignore_equipped_in_collection: bool,
    ignore_equipped_in_vault: bool,
    // "Weight by Rank" toggle so projected candidate + challenger scores include the same
    // main-stat rank bonus the detection ranking uses (keeps the keep-list expansion consistent).
    weight_main_stat_by_rank: bool,
}

// One ranking scenario expanded from a rule; perSubstat splits into N Any scenarios.
// pub(super) (with rule_order readable) so improvement_watch can regroup scenarios by
// owning rule and feed them into the shared chance recursion.
pub(super) struct UpgradeScenario {
    pub(super) rule_order: usize,
    // Full rule substat list preserved for debug/tie-break (perSubstat expansion splits this).
    rule_selected_substats: Vec<i64>,
    // Original match mode before per-substat expansion.
    rule_substat_match: String,
    selected_substats: Vec<i64>,
    substat_match: String,
    required_per_group: i64,
    count_mode: SafeguardWasmCountMode,
    weights: BTreeMap<i64, f64>,
    // "Weight by Rank" toggle propagated from the rule (applies the main-stat rank bonus).
    weight_main_stat_by_rank: bool,
    // Challengers pre-bucketed by typed count key for fast per-artifact lookup.
    // SafeguardCountKey is stack-allocated (no heap per entry, unlike String keys).
    challengers_by_count_key: BTreeMap<SafeguardCountKey, Vec<StaticChallenger>>,
}

impl UpgradeScenario {
    // Sorted (projected-score in thousandths, rank, mainstat) triples of the challenger
    // bucket the given artifact dims select under this scenario's count mode — the
    // improvement-watch cross-group cell-signature component. Scores round to 3 decimals
    // for a stable, BTreeMap-friendly integer key; rank and mainstat are included because
    // exact score ties break on them (is_challenger_strictly_better).
    pub(super) fn challenger_signature_for(
        &self,
        slot: i64,
        set: i64,
        faction: i64,
        main_stat: i64,
    ) -> Vec<(i64, i64, i64)> {
        let key = safeguard_count_key_from_parts(slot, set, faction, main_stat, self.count_mode);
        let mut signature: Vec<(i64, i64, i64)> = self
            .challengers_by_count_key
            .get(&key)
            .map(|bucket| {
                bucket
                    .iter()
                    .map(|challenger| {
                        (
                            (challenger.projected_score * 1000.0).round() as i64,
                            challenger.rank,
                            challenger.main_stat,
                        )
                    })
                    .collect()
            })
            .unwrap_or_default();
        signature.sort_unstable();
        signature
    }
}

// Single challenger entry; projected_score fixes the apples-to-oranges Bug 2.
struct StaticChallenger {
    artifact_id: i64,
    // Closed-form expected score at +16 (not current score).
    projected_score: f64,
    rank: i64,
    main_stat: i64,
}

// Context threaded through the recursion tree.
struct RecursionContext<'a> {
    artifact_id: i64,
    artifact_slot: i64,
    artifact_set: i64,
    artifact_faction: i64,
    artifact_main_stat: i64,
    artifact_rank: i64,
    // Applicable scenarios for this artifact (subset of all scenarios).
    scenarios: &'a [&'a UpgradeScenario],
    milestones: Vec<i64>,
    // Which of the remaining milestones are addition (not roll) events.
    addition_milestones: HashSet<i64>,
    // Legal substats that can be added at addition events for this slot/main.
    legal_addition_pool: Vec<i64>,
    // Two-value Q1/Q3 gains from observed substat values (scaled integer pairs).
    expected_gain: BTreeMap<i64, (i64, i64)>,
    // Rank-based fallback Q1/Q3 gains for variants with no observed value (scaled).
    fallback_gain: BTreeMap<i64, (i64, i64)>,
}

// Per-artifact viability snapshot used to prune scenarios impossible by +16.
struct ViabilityContext {
    initial_state: BTreeMap<i64, i64>,
    max_addition_events: usize,
    legal_addition_pool_set: HashSet<i64>,
    // Mainstat variant for this piece; substats that equal it are impossible.
    main_stat: i64,
}

// ─── per-slot allowed substat pools ──────────────────────────────────────────

fn allowed_substats_for_slot(slot: i64) -> &'static [i64] {
    // Mirrors TS ALLOWED_SUB_BY_SLOT; caller excludes the main stat variant.
    // Constants are from generated_domain_constants.rs via `use crate::*`.
    match slot {
        // Artifact slots (1–4): full 11-variant pool.
        ARTIFACT_TYPE_HELMET
        | ARTIFACT_TYPE_CHESTPLATE
        | ARTIFACT_TYPE_GAUNTLETS
        | ARTIFACT_TYPE_BOOTS => &[
            STAT_VARIANT_HP_PERCENT,
            STAT_VARIANT_HP_FLAT,
            STAT_VARIANT_ATK_PERCENT,
            STAT_VARIANT_ATK_FLAT,
            STAT_VARIANT_DEF_PERCENT,
            STAT_VARIANT_DEF_FLAT,
            STAT_VARIANT_CR,
            STAT_VARIANT_CDMG,
            STAT_VARIANT_ACC,
            STAT_VARIANT_RES,
            STAT_VARIANT_SPD,
        ],
        // Weapon (5): no DEF variants.
        ARTIFACT_TYPE_WEAPON => &[
            STAT_VARIANT_HP_PERCENT,
            STAT_VARIANT_HP_FLAT,
            STAT_VARIANT_ATK_PERCENT,
            STAT_VARIANT_ATK_FLAT,
            STAT_VARIANT_CR,
            STAT_VARIANT_CDMG,
            STAT_VARIANT_ACC,
            STAT_VARIANT_RES,
            STAT_VARIANT_SPD,
        ],
        // Shield (6): no ATK variants.
        ARTIFACT_TYPE_SHIELD => &[
            STAT_VARIANT_HP_PERCENT,
            STAT_VARIANT_HP_FLAT,
            STAT_VARIANT_DEF_PERCENT,
            STAT_VARIANT_DEF_FLAT,
            STAT_VARIANT_CR,
            STAT_VARIANT_CDMG,
            STAT_VARIANT_ACC,
            STAT_VARIANT_RES,
            STAT_VARIANT_SPD,
        ],
        // Ring (7): only HP/ATK/DEF percent+flat.
        ARTIFACT_TYPE_RING => &[
            STAT_VARIANT_HP_PERCENT,
            STAT_VARIANT_HP_FLAT,
            STAT_VARIANT_ATK_PERCENT,
            STAT_VARIANT_ATK_FLAT,
            STAT_VARIANT_DEF_PERCENT,
            STAT_VARIANT_DEF_FLAT,
        ],
        // Amulet (8): flat stats and secondary offensive.
        ARTIFACT_TYPE_AMULET => &[
            STAT_VARIANT_HP_FLAT,
            STAT_VARIANT_ATK_FLAT,
            STAT_VARIANT_DEF_FLAT,
            STAT_VARIANT_CDMG,
            STAT_VARIANT_ACC,
            STAT_VARIANT_RES,
        ],
        // Banner (9): HP/ATK/DEF percent+flat plus SPD.
        ARTIFACT_TYPE_BANNER => &[
            STAT_VARIANT_HP_PERCENT,
            STAT_VARIANT_HP_FLAT,
            STAT_VARIANT_ATK_PERCENT,
            STAT_VARIANT_ATK_FLAT,
            STAT_VARIANT_DEF_PERCENT,
            STAT_VARIANT_DEF_FLAT,
            STAT_VARIANT_SPD,
        ],
        _ => &[],
    }
}

// ─── level / rarity / rank clamping ──────────────────────────────────────────

fn clamp_level(value: i64) -> i64 {
    value.max(0).min(UPGRADE_TARGET_LEVEL)
}

fn clamp_rarity(value: i64) -> i64 {
    value.max(1).min(6)
}

fn clamp_rank(value: i64) -> i64 {
    value.max(1).min(6)
}

// ─── milestone helpers ────────────────────────────────────────────────────────

fn addition_milestones_for_rarity(rarity: i64) -> &'static [i64] {
    // Return the static schedule for clamped rarity (5/6 have no additions).
    match clamp_rarity(rarity) {
        1 => ADDITION_MILESTONES_R1,
        2 => ADDITION_MILESTONES_R2,
        3 => ADDITION_MILESTONES_R3,
        4 => ADDITION_MILESTONES_R4,
        _ => ADDITION_MILESTONES_R56,
    }
}

fn resolve_remaining_milestones(level: i64) -> Vec<i64> {
    // Milestones strictly above current level and up to +16.
    ROLL_MILESTONES
        .iter()
        .filter(|&&m| m > level && m <= UPGRADE_TARGET_LEVEL)
        .copied()
        .collect()
}

fn resolve_remaining_addition_milestones(rarity: i64, level: i64) -> HashSet<i64> {
    // Addition milestones strictly above current level for this rarity.
    addition_milestones_for_rarity(rarity)
        .iter()
        .filter(|&&m| m > level && m <= UPGRADE_TARGET_LEVEL)
        .copied()
        .collect()
}

// ─── unknown-roll quality estimation ─────────────────────────────────────────

fn resolve_unknown_rank_scale(rank: i64) -> f64 {
    // Linear scale: UNKNOWN_ROLL_MIN_RANK_SCALE at rank 1, 1.0 at rank 6.
    let ratio = (clamp_rank(rank) - 1) as f64 / 5.0;
    UNKNOWN_ROLL_MIN_RANK_SCALE + (1.0 - UNKNOWN_ROLL_MIN_RANK_SCALE) * ratio
}

// Ordered variant list used by build_fallback_gain; matches safeguard_substat_max6_by_variant coverage.
const ALL_SUBSTAT_VARIANTS: [i64; 11] = [
    STAT_VARIANT_HP_FLAT,
    STAT_VARIANT_HP_PERCENT,
    STAT_VARIANT_ATK_FLAT,
    STAT_VARIANT_ATK_PERCENT,
    STAT_VARIANT_DEF_FLAT,
    STAT_VARIANT_DEF_PERCENT,
    STAT_VARIANT_SPD,
    STAT_VARIANT_RES,
    STAT_VARIANT_ACC,
    STAT_VARIANT_CR,
    STAT_VARIANT_CDMG,
];

// Look up per-star min/max roll range for a variant from the generated ranges table.
// Returns (min, max) in raw stat units; falls back to legacy average if unavailable.
// pub(super) so improvement_watch derives corner probe value domains from the same ranges.
pub(super) fn resolve_roll_range(rank: i64, variant: i64) -> (f64, f64) {
    let clamped = clamp_rank(rank);
    // SUBSTAT_ROLL_RANGES_BY_STAR entries are (variant, min, max) triples.
    if let Some(entry) = SUBSTAT_ROLL_RANGES_BY_STAR
        .iter()
        .find(|&&(star, _)| star == clamped)
        .and_then(|&(_, triples)| triples.iter().find(|&&(v, _, _)| v == variant))
    {
        let (_, mn, mx) = *entry;
        if mn > 0 && mx > 0 && mx >= mn {
            return (mn as f64, mx as f64);
        }
    }
    // Fallback: use legacy single-value estimate as both Q1 and Q3.
    let max6 = safeguard_substat_max6_by_variant(variant);
    let scale = resolve_unknown_rank_scale(rank);
    let avg = max6 * UNKNOWN_ROLL_QUALITY_RATIO * scale;
    (avg, avg)
}

// Build Q1/Q3 scaled gain pair from a roll range.
fn build_gain_pair_scaled(min: f64, max: f64) -> (i64, i64) {
    let low = ((3.0 * min + max) / 4.0 * STATE_VALUE_SCALE as f64).round().max(0.0) as i64;
    let high = ((min + 3.0 * max) / 4.0 * STATE_VALUE_SCALE as f64).round().max(0.0) as i64;
    (low, high)
}

fn build_fallback_gain(rank: i64) -> BTreeMap<i64, (i64, i64)> {
    // Q1/Q3 per-roll gain pairs for each known variant, scaled to STATE_VALUE_SCALE.
    let mut out = BTreeMap::<i64, (i64, i64)>::new();
    for variant in ALL_SUBSTAT_VARIANTS {
        let (min_r, max_r) = resolve_roll_range(rank, variant);
        if min_r <= 0.0 && max_r <= 0.0 {
            continue;
        }
        let pair = build_gain_pair_scaled(min_r, max_r);
        if pair.0 > 0 || pair.1 > 0 {
            out.insert(variant, pair);
        }
    }
    out
}

fn build_existing_gain(
    artifact: &SafeguardWasmArtifactIn,
    fallback: &BTreeMap<i64, (i64, i64)>,
) -> BTreeMap<i64, (i64, i64)> {
    // Per-roll Q1/Q3 gain pairs derived from observed substat quality and per-star ranges.
    let rank = clamp_rank(artifact.rank);
    let mut out = BTreeMap::<i64, (i64, i64)>::new();
    for substat in &artifact.substats {
        let max6 = safeguard_substat_max6_by_variant(substat.variant);
        if max6 <= 0.0 {
            continue;
        }
        let divisor = substat.rolls
            .filter(|&r| r > 0)
            .map(|r| (r + 1) as f64)
            .unwrap_or(1.0)
            .max(1.0);
        let observed = if substat.value > 0.0 && substat.value.is_finite() {
            (substat.value / divisor).min(max6)
        } else {
            0.0
        };
        if observed > 0.0 {
            // Spread Q1/Q3 using the per-star roll range around the observed quality.
            let (range_min, range_max) = resolve_roll_range(rank, substat.variant);
            let effective_min = observed.min(range_min);
            let effective_max = observed.max(range_max);
            out.insert(substat.variant, build_gain_pair_scaled(effective_min, effective_max));
        } else if let Some(&fb) = fallback.get(&substat.variant) {
            out.insert(substat.variant, fb);
        }
    }
    out
}

// ─── recursion state helpers ──────────────────────────────────────────────────

fn build_initial_scaled_state(artifact: &SafeguardWasmArtifactIn) -> BTreeMap<i64, i64> {
    // Seed the mutable recursion state from the artifact's current substats.
    let mut state = BTreeMap::<i64, i64>::new();
    for substat in &artifact.substats {
        if substat.variant <= 0 {
            continue;
        }
        if !substat.value.is_finite() || substat.value <= 0.0 {
            continue;
        }
        let scaled = (substat.value * STATE_VALUE_SCALE as f64).round().max(0.0) as i64;
        if scaled > 0 {
            state.insert(substat.variant, scaled);
        }
    }
    state
}

fn get_state_raw_value(state: &BTreeMap<i64, i64>, variant: i64) -> f64 {
    // Read a variant's unscaled value from the recursion state.
    state.get(&variant).copied().unwrap_or(0).max(0) as f64 / STATE_VALUE_SCALE as f64
}

fn count_matched_in_state(state: &BTreeMap<i64, i64>, selected: &[i64]) -> usize {
    // Count selected substats that have a positive value in the state.
    selected
        .iter()
        .filter(|&&v| get_state_raw_value(state, v) > 0.0)
        .count()
}

fn state_matches_substats(
    state: &BTreeMap<i64, i64>,
    selected: &[i64],
    substat_match: &str,
    main_stat: i64,
) -> bool {
    // Gate on substat presence; mirrors stateMatchesScenarioSubstats.
    if selected.is_empty() {
        return true;
    }
    let matched = count_matched_in_state(state, selected);
    let min_count = super::safeguard_substat_min_count(substat_match, selected.len());
    // Substats that equal the piece's mainstat are impossible; cap the required total.
    let possible_count = if main_stat == STAT_VARIANT_ANY {
        selected.len()
    } else {
        selected.iter().filter(|&&v| v != main_stat).count()
    };
    let effective_required = min_count.min(possible_count);
    if effective_required == 0 {
        return true;
    }
    matched >= effective_required
}

fn compute_score_from_state(
    state: &BTreeMap<i64, i64>,
    selected: &[i64],
    weights: &BTreeMap<i64, f64>,
    rank: i64,
) -> f64 {
    // Weighted normalized sum from recursion state; mirrors computeSafeguardScoreFromState.
    // Includes glyph potential for present substats.
    let mut total = 0.0;
    for &variant in selected {
        let raw = get_state_raw_value(state, variant);
        let normalized = safeguard_normalize_substat_value(variant, raw);
        let weight = safeguard_weight_for_variant(weights, variant);
        total += weight * normalized;
        // Add glyph potential for present substats — mirrors TS scoring (SSOT).
        if raw > 0.0 {
            let glyph_avg = glyph_average_for_variant(rank, variant);
            if glyph_avg > 0.0 {
                total += weight * safeguard_normalize_substat_value(variant, glyph_avg);
            }
        }
    }
    if total.is_finite() { total } else { 0.0 }
}

// Compact stack-allocated memo key: avoids all heap allocation vs. the old String approach.
// State has at most MAX_SUBSTAT_SLOTS (4) entries; event_idx is bounded by milestone count (≤8).
// Ord is derived so StateKey can be used as a BTreeMap key (avoids large contiguous
// reallocs that the BTreeMap backing array requires on resize).
// pub(super) so improvement_watch can own the same scratch-memo map type.
#[derive(Hash, Eq, PartialEq, Ord, PartialOrd)]
pub(super) struct StateKey {
    event_idx: u8,
    len: u8,
    // Sorted (variant, scaled_value) pairs; zero-filled past `len`.
    entries: [(i64, i64); 4],
}

fn make_state_key(state: &BTreeMap<i64, i64>, event_idx: usize) -> StateKey {
    // Collect into a fixed-size array; sort the live prefix in place.
    let mut entries = [(0i64, 0i64); 4];
    let mut len = 0usize;
    for (&v, &val) in state.iter() {
        entries[len] = (v, val);
        len += 1;
    }
    entries[..len].sort_unstable_by_key(|(v, _)| *v);
    StateKey { event_idx: event_idx as u8, len: len as u8, entries }
}

// apply_state_delta removed: compute_probability now mutates state in-place and
// restores it after each recursive call (undo-redo pattern).  This eliminates
// the BTreeMap clone that the old function performed on every recursive branch —
// previously the dominant source of dlmalloc fragmentation during the 7432-artifact
// improvement-chance pass, which grew WASM linear memory by 50–70 MiB per run.

fn resolve_expected_gain(
    variant: i64,
    existing: &BTreeMap<i64, (i64, i64)>,
    fallback: &BTreeMap<i64, (i64, i64)>,
) -> (i64, i64) {
    // Observed gain takes priority; fall back to rank-based estimate.
    if let Some(&pair) = existing.get(&variant) {
        if pair.0 > 0 || pair.1 > 0 {
            return pair;
        }
    }
    fallback.get(&variant).copied().unwrap_or((0, 0))
}

// ─── challenger projection (Bug 2 fix) ───────────────────────────────────────

fn build_legal_addition_pool(artifact: &SafeguardWasmArtifactIn) -> Vec<i64> {
    // Slot-filtered pool excluding the artifact's main stat.
    // HP%/HP_FLAT have distinct variant values so exact-match exclusion is correct.
    let mut pool: Vec<i64> = allowed_substats_for_slot(artifact.slot)
        .iter()
        .filter(|&&v| v != artifact.main_stat)
        .copied()
        .collect();
    pool.sort_unstable();
    pool.dedup();
    pool
}

pub(super) fn compute_projected_challenger_score(
    artifact: &SafeguardWasmArtifactIn,
    selected: &[i64],
    weights: &BTreeMap<i64, f64>,
) -> f64 {
    // Closed-form expected score at +16 for a static challenger artifact.
    // Formula (per-variant):
    //   existing:  current_val + (roll_events / substat_count) * per_roll_gain
    //   addable:   (add_events / missing_pool_size) * fallback_gain
    // This fixes Bug 2 by giving the challenger pool a fair +16 projection.
    let level = clamp_level(artifact.exact_level.unwrap_or(artifact.level));
    let rarity = clamp_rarity(artifact.rarity);
    let remaining_ms = resolve_remaining_milestones(level);
    let addition_ms = resolve_remaining_addition_milestones(rarity, level);
    // Roll events: milestones that are not addition events.
    let roll_events = remaining_ms
        .iter()
        .filter(|m| !addition_ms.contains(m))
        .count() as f64;
    let add_events = addition_ms.len() as f64;
    let substat_count = artifact.substats.len().max(1) as f64;
    // Build a presence set and missing pool for addition probability.
    let present: HashSet<i64> = artifact
        .substats
        .iter()
        .filter(|s| s.value > 0.0)
        .map(|s| s.variant)
        .collect();
    let full_pool = build_legal_addition_pool(artifact);
    let missing_pool: Vec<i64> = full_pool
        .iter()
        .filter(|&&v| !present.contains(&v))
        .copied()
        .collect();
    let missing_pool_size = missing_pool.len() as f64;
    let rank_scale = resolve_unknown_rank_scale(artifact.rank);
    let mut total = 0.0;
    for &variant in selected {
        let weight = safeguard_weight_for_variant(weights, variant);
        let max6 = safeguard_substat_max6_by_variant(variant);
        if max6 <= 0.0 {
            continue;
        }
        // Fallback expected gain per roll event for this variant.
        let fallback_gain_per_roll = max6 * UNKNOWN_ROLL_QUALITY_RATIO * rank_scale;
        let projected_val =
            if let Some(substat) = artifact.substats.iter().find(|s| s.variant == variant) {
                // Observed substat: per-roll gain mirrors TS divisor logic (rolls + 1).
                let divisor = substat.rolls
                    .filter(|&r| r > 0)
                    .map(|r| (r + 1) as f64)
                    .unwrap_or(1.0)
                    .max(1.0);
                let per_roll = if substat.value > 0.0 && substat.value.is_finite() {
                    (substat.value / divisor).min(max6)
                } else {
                    fallback_gain_per_roll
                };
                // Current value + expected gain from remaining roll events.
                substat.value + (roll_events / substat_count) * per_roll
            } else if missing_pool_size > 0.0 && missing_pool.contains(&variant) {
                // Potentially addable: probability of being picked times gain.
                (add_events / missing_pool_size) * fallback_gain_per_roll
            } else {
                continue;
            };
        let normalized = safeguard_normalize_substat_value(variant, projected_val);
        total += weight * normalized;
        // Add glyph potential for variants that will be present at +16.
        if projected_val > 0.0 {
            let glyph_avg = glyph_average_for_variant(artifact.rank, variant);
            if glyph_avg > 0.0 {
                total += weight * safeguard_normalize_substat_value(variant, glyph_avg);
            }
        }
    }
    if total.is_finite() { total } else { 0.0 }
}

// ─── tie-break comparator ─────────────────────────────────────────────────────

fn is_challenger_strictly_better(
    ch_score: f64,
    ch_main: i64,
    ch_rank: i64,
    cand_score: f64,
    cand_main: i64,
    cand_rank: i64,
) -> bool {
    // Mirror isChallengerStrictlyBetterThanCandidate in safeguardImprovementChance.ts.
    let delta = ch_score - cand_score;
    if delta.abs() > SCORE_TIE_EPSILON {
        return delta > 0.0;
    }
    // Equal scores: same main breaks by rank (higher = better).
    if ch_main == cand_main {
        return ch_rank > cand_rank;
    }
    // Percent main beats its flat counterpart on score ties.
    if let Some(flat) = safeguard_percent_to_flat_main(ch_main) {
        if flat == cand_main {
            return true;
        }
    }
    // Candidate percent beats challenger flat.
    if let Some(flat) = safeguard_percent_to_flat_main(cand_main) {
        if flat == ch_main {
            return false;
        }
    }
    false
}

// ─── evaluation: state × scenarios ───────────────────────────────────────────

fn is_state_selected_by_any_scenario(
    state: &BTreeMap<i64, i64>,
    ctx: &RecursionContext<'_>,
) -> bool {
    // Test whether the projected state is safeguard-selected by any scenario.
    // Mirrors isStateSelectedByAnyScenario in TS.
    // ctx.scenarios is pre-filtered to scenarios applicable to ctx.artifact_id (via scenarios_by_id
    // index built in compute_improvement_chance), so no applicability check is needed here.
    for scenario in ctx.scenarios {
        if !state_matches_substats(state, &scenario.selected_substats, &scenario.substat_match, ctx.artifact_main_stat) {
            continue;
        }
        // Mirror detection scoring: substat score plus the per-artifact main-stat rank bonus
        // (constant during simulation; gated by the rule's "Weight by Rank" toggle).
        let score = compute_score_from_state(state, &scenario.selected_substats, &scenario.weights, ctx.artifact_rank)
            + super::safeguard_main_stat_rank_bonus_parts(
                ctx.artifact_rank,
                ctx.artifact_slot,
                ctx.artifact_main_stat,
                scenario.weight_main_stat_by_rank,
                true,
            );
        if !(score > 0.0) {
            continue;
        }
        // Build the count-key for this artifact and look up the challenger bucket.
        let key = safeguard_count_key_from_parts(
            ctx.artifact_slot,
            ctx.artifact_set,
            ctx.artifact_faction,
            ctx.artifact_main_stat,
            scenario.count_mode,
        );
        let challengers = scenario
            .challengers_by_count_key
            .get(&key)
            .map(|v| v.as_slice())
            .unwrap_or(&[]);
        // Count challengers strictly better than the projected state score.
        let mut better_count = 0i64;
        for ch in challengers {
            if ch.artifact_id == ctx.artifact_id {
                continue;
            }
            if is_challenger_strictly_better(
                ch.projected_score,
                ch.main_stat,
                ch.rank,
                score,
                ctx.artifact_main_stat,
                ctx.artifact_rank,
            ) {
                better_count += 1;
                if better_count >= scenario.required_per_group {
                    break;
                }
            }
        }
        if better_count < scenario.required_per_group {
            return true;
        }
    }
    false
}

// ─── recursion ────────────────────────────────────────────────────────────────

// Memoized DP over the upgrade event sequence.
// `state` is mutated in place and restored after each recursive branch (undo-redo)
// so no BTreeMap is ever cloned — one allocation serves the entire recursion tree.
// `memo` is a caller-owned scratch map cleared between artifacts; it maps a compact
// StateKey (stack-allocated, no heap) to the cached probability for that node.
fn compute_probability(
    ctx: &RecursionContext<'_>,
    state: &mut BTreeMap<i64, i64>,
    event_idx: usize,
    memo: &mut BTreeMap<StateKey, f64>,
) -> f64 {
    // Base case: no more milestones; evaluate the final projected state.
    if event_idx >= ctx.milestones.len() {
        return if is_state_selected_by_any_scenario(state, ctx) {
            1.0
        } else {
            0.0
        };
    }
    // Capture key BEFORE any mutation so memo lookup/insert use the same state.
    let key = make_state_key(state, event_idx);
    if let Some(&cached) = memo.get(&key) {
        return cached;
    }
    let milestone = ctx.milestones[event_idx];
    // An addition event fires when the milestone is in the addition schedule
    // AND the artifact still has open substat slots.
    let is_addition = ctx.addition_milestones.contains(&milestone) && state.len() < MAX_SUBSTAT_SLOTS;
    let result = if is_addition {
        // Addition: choose one missing legal substat uniformly at random.
        // The legal pool has at most 11 entries (artifact slots); a stack buffer avoids heap.
        let mut candidate_buf = [0i64; 12];
        let mut candidate_count = 0usize;
        for &v in ctx.legal_addition_pool.iter() {
            if !state.contains_key(&v) {
                candidate_buf[candidate_count] = v;
                candidate_count += 1;
            }
        }
        let candidates = &candidate_buf[..candidate_count];
        if candidates.is_empty() {
            // No missing pool candidates; advance without an addition.
            compute_probability(ctx, state, event_idx + 1, memo)
        } else {
            let p = 1.0 / candidate_count as f64;
            // Early milestones use single average gain; later ones branch Q1/Q3.
            let use_two_value = milestone >= TWO_VALUE_BRANCHING_MIN_MILESTONE;
            let mut total = 0.0;
            for &variant in candidates {
                let (low, high) =
                    resolve_expected_gain(variant, &ctx.expected_gain, &ctx.fallback_gain);
                if low <= 0 && high <= 0 {
                    continue;
                }
                if use_two_value && low != high {
                    // Two-value branching: Q1 (low) and Q3 (high), each 50% probability.
                    // Mutate state in-place, recurse, then remove the key to undo.
                    if low > 0 {
                        state.insert(variant, low);
                        total += p * 0.5 * compute_probability(ctx, state, event_idx + 1, memo);
                        state.remove(&variant);
                    }
                    if high > 0 {
                        state.insert(variant, high);
                        total += p * 0.5 * compute_probability(ctx, state, event_idx + 1, memo);
                        state.remove(&variant);
                    }
                } else {
                    // Single average gain: (low + high) / 2.
                    let avg = ((low + high) as f64 / 2.0).round() as i64;
                    if avg <= 0 { continue; }
                    state.insert(variant, avg);
                    total += p * compute_probability(ctx, state, event_idx + 1, memo);
                    state.remove(&variant);
                }
            }
            total
        }
    } else {
        // Roll: choose one existing substat uniformly at random.
        // State has at most MAX_SUBSTAT_SLOTS (4) entries; a stack buffer avoids heap.
        let mut variant_buf = [0i64; 4];
        let mut variant_count = 0usize;
        for &k in state.keys() {
            variant_buf[variant_count] = k;
            variant_count += 1;
        }
        variant_buf[..variant_count].sort_unstable();
        let variants = &variant_buf[..variant_count];
        if variants.is_empty() {
            compute_probability(ctx, state, event_idx + 1, memo)
        } else {
            let p = 1.0 / variant_count as f64;
            let use_two_value = milestone >= TWO_VALUE_BRANCHING_MIN_MILESTONE;
            let mut total = 0.0;
            for &variant in variants {
                let (low, high) =
                    resolve_expected_gain(variant, &ctx.expected_gain, &ctx.fallback_gain);
                if low <= 0 && high <= 0 {
                    continue;
                }
                // Save current value so we can restore it (undo) after the recursive call.
                let current = *state.get(&variant).unwrap_or(&0);
                if use_two_value && low != high {
                    if low > 0 {
                        *state.get_mut(&variant).unwrap() = (current + low).max(0);
                        total += p * 0.5 * compute_probability(ctx, state, event_idx + 1, memo);
                        *state.get_mut(&variant).unwrap() = current;
                    }
                    if high > 0 {
                        *state.get_mut(&variant).unwrap() = (current + high).max(0);
                        total += p * 0.5 * compute_probability(ctx, state, event_idx + 1, memo);
                        *state.get_mut(&variant).unwrap() = current;
                    }
                } else {
                    let avg = ((low + high) as f64 / 2.0).round() as i64;
                    if avg <= 0 { continue; }
                    *state.get_mut(&variant).unwrap() = (current + avg).max(0);
                    total += p * compute_probability(ctx, state, event_idx + 1, memo);
                    *state.get_mut(&variant).unwrap() = current;
                }
            }
            total
        }
    };
    memo.insert(key, result);
    result
}

// ─── per-artifact substat matching ────────────────────────────────────────────

fn count_matched_on_artifact(
    artifact: &SafeguardWasmArtifactIn,
    selected_set: &HashSet<i64>,
) -> usize {
    // Count unique selected variants with a positive value on the artifact.
    if selected_set.is_empty() {
        return 0;
    }
    let mut matched = 0;
    let mut seen = HashSet::<i64>::new();
    for substat in &artifact.substats {
        if !selected_set.contains(&substat.variant) {
            continue;
        }
        if !seen.insert(substat.variant) {
            continue;
        }
        if !substat.value.is_finite() || substat.value <= 0.0 {
            continue;
        }
        matched += 1;
        if matched >= selected_set.len() {
            break;
        }
    }
    matched
}

fn artifact_matches_substats(
    artifact: &SafeguardWasmArtifactIn,
    selected: &[i64],
    substat_match: &str,
) -> bool {
    // Current-state substat gate; mirrors artifactMatchesScenarioSubstats.
    if selected.is_empty() {
        return true;
    }
    let selected_set: HashSet<i64> = selected.iter().copied().collect();
    let matched = count_matched_on_artifact(artifact, &selected_set);
    let min_count = super::safeguard_substat_min_count(substat_match, selected_set.len());
    // Substats that equal the piece's mainstat are impossible; cap the required total.
    let possible_count = if artifact.main_stat == STAT_VARIANT_ANY {
        selected_set.len()
    } else {
        selected_set.iter().filter(|&&v| v != artifact.main_stat).count()
    };
    let effective_required = min_count.min(possible_count);
    if effective_required == 0 {
        return true;
    }
    matched >= effective_required
}

// ─── per-artifact chance computation ─────────────────────────────────────────

// `memo` is a caller-owned scratch map; cleared per-rule before each recursion so the same
// allocation is reused across all (artifact × rule) pairs without leaking stale entries
// between rules (the leaf predicate's scenario set changes per rule).
//
// Returns (max_chance, chances_by_rule_ordinal). The per-rule map carries one entry per rule
// that has at least one viable scenario for this artifact, keyed by 1-based rule ordinal.
// The max is provided as a convenience for the overlay display (and for tie-breaking).
fn compute_artifact_chance_percent(
    artifact: &SafeguardWasmArtifactIn,
    scenarios: &[&UpgradeScenario],
    memo: &mut BTreeMap<StateKey, f64>,
) -> (f64, BTreeMap<i64, f64>) {
    let mut by_rule_ordinal: BTreeMap<i64, f64> = BTreeMap::new();
    if scenarios.is_empty() {
        return (0.0, by_rule_ordinal);
    }
    // Group scenarios by their owning rule. perSubstat rules expand into multiple
    // scenarios per rule; those still get OR'd together at the leaf (within-rule union)
    // so each rule's chance reflects "this rule selects the piece under any of its scenarios".
    let mut scenarios_by_rule: BTreeMap<usize, Vec<&UpgradeScenario>> = BTreeMap::new();
    for &s in scenarios {
        scenarios_by_rule.entry(s.rule_order).or_default().push(s);
    }
    // Run the recursion once PER (artifact, rule). The leaf predicate uses only this
    // rule's scenarios — so cross-rule scenarios cannot inflate this rule's probability.
    let mut max_chance: f64 = 0.0;
    for (rule_order, rule_scenarios) in &scenarios_by_rule {
        let rule_ordinal = *rule_order as i64 + 1;
        // Shared single-rule chance helper (also drives improvement-watch corner probes).
        let chance = compute_artifact_chance_for_scenarios(artifact, rule_scenarios, memo);
        by_rule_ordinal.insert(rule_ordinal, chance);
        if chance > max_chance {
            max_chance = chance;
        }
    }
    (max_chance, by_rule_ordinal)
}

// Chance (0–100, one decimal) that `artifact` lands in the safeguard top-N at +16 under
// the given scenario set (all scenarios must belong to ONE rule — the leaf predicate is a
// within-rule union). Extracted from compute_artifact_chance_percent so improvement-watch
// corner probing reuses the exact same recursion (ODR).
// `memo` is caller-owned scratch reused for its allocation only: it is cleared here on
// every call because cached nodes are valid solely for a fixed (scenarios, milestones,
// expected-gain) tuple — and expected gains derive from the artifact's own substat values.
pub(super) fn compute_artifact_chance_for_scenarios(
    artifact: &SafeguardWasmArtifactIn,
    scenarios: &[&UpgradeScenario],
    memo: &mut BTreeMap<StateKey, f64>,
) -> f64 {
    compute_artifact_chance_impl(artifact, scenarios, memo, false, true)
}

// Synthetic-probe variant for improvement-watch corner searches. Two deliberate
// differences from the real-artifact path:
//   1. Value-independent gains: build_existing_gain derives per-roll gain from the
//      artifact's CURRENT value (rolls: None → divisor 1), so a synthetic's assumed
//      future roll quality would scale with the probed threshold — circular. Synthetic
//      drops have no roll history, so the rank-derived fallback Q1/Q3 pair is the
//      principled prior — and it makes the recursion independent of probe values except
//      through the state itself, which is what enables sharing the memo below.
//   2. No memo clear: the CALLER owns memo validity. Cached nodes are valid while the
//      full non-state context is fixed — scenario set (rule), slot/set/faction/main
//      (sample), rank (fallback gains + tie-breaks), rarity (addition schedule) and
//      level (milestones). StateKey captures everything that varies across probes within
//      that context (event index + substat variants + scaled values), so probes with
//      different values/subsets coexist soundly in one memo and identical re-probes
//      become O(log n) root hits.
pub(super) fn compute_synthetic_chance_for_scenarios(
    artifact: &SafeguardWasmArtifactIn,
    scenarios: &[&UpgradeScenario],
    memo: &mut BTreeMap<StateKey, f64>,
) -> f64 {
    compute_artifact_chance_impl(artifact, scenarios, memo, true, false)
}

// Shared implementation for both chance entry points above.
fn compute_artifact_chance_impl(
    artifact: &SafeguardWasmArtifactIn,
    scenarios: &[&UpgradeScenario],
    memo: &mut BTreeMap<StateKey, f64>,
    fallback_gains_only: bool,
    clear_memo: bool,
) -> f64 {
    let artifact_id = artifact.id.unwrap_or(0);
    let level = clamp_level(artifact.exact_level.unwrap_or(artifact.level));
    let milestones = resolve_remaining_milestones(level);
    // mut: compute_probability mutates state in-place (undo-redo) and restores it on return.
    let mut initial_state = build_initial_scaled_state(artifact);
    if milestones.is_empty() {
        // Artifact already at +16: check current state directly without recursion.
        let ctx = RecursionContext {
            artifact_id,
            artifact_slot: artifact.slot,
            artifact_set: artifact.set,
            artifact_faction: artifact.faction,
            artifact_main_stat: artifact.main_stat,
            artifact_rank: artifact.rank,
            scenarios,
            milestones: vec![],
            addition_milestones: HashSet::default(),
            legal_addition_pool: vec![],
            expected_gain: BTreeMap::default(),
            fallback_gain: BTreeMap::default(),
        };
        return if is_state_selected_by_any_scenario(&initial_state, &ctx) {
            100.0
        } else {
            0.0
        };
    }
    // Per-artifact context: milestone schedule, legal addition pool, and Q1/Q3 gains.
    let rarity = clamp_rarity(artifact.rarity);
    let fallback_gain = build_fallback_gain(artifact.rank);
    // Synthetic probes force the rank-derived prior; real artifacts keep observed gains.
    let expected_gain = if fallback_gains_only {
        fallback_gain.clone()
    } else {
        build_existing_gain(artifact, &fallback_gain)
    };
    let ctx = RecursionContext {
        artifact_id,
        artifact_slot: artifact.slot,
        artifact_set: artifact.set,
        artifact_faction: artifact.faction,
        artifact_main_stat: artifact.main_stat,
        artifact_rank: artifact.rank,
        scenarios,
        milestones,
        addition_milestones: resolve_remaining_addition_milestones(rarity, level),
        legal_addition_pool: build_legal_addition_pool(artifact),
        expected_gain,
        fallback_gain,
    };
    // Real-artifact path: cached results are not valid across differing gain contexts.
    if clear_memo {
        memo.clear();
    }
    // initial_state is mutated in-place during recursion (undo-redo pattern) and fully
    // restored by the time compute_probability returns — callers see no net change.
    let prob = compute_probability(&ctx, &mut initial_state, 0, memo);
    // One decimal place (e.g. 47.3) — round to nearest tenth.
    (prob.max(0.0).min(1.0) * 1000.0).round() / 10.0
}

// ─── viability pruning ────────────────────────────────────────────────────────

fn build_viability_context(artifact: &SafeguardWasmArtifactIn) -> ViabilityContext {
    // Snapshot of what this artifact can still become at +16.
    let initial_state = build_initial_scaled_state(artifact);
    let level = clamp_level(artifact.exact_level.unwrap_or(artifact.level));
    let rarity = clamp_rarity(artifact.rarity);
    let addition_ms = resolve_remaining_addition_milestones(rarity, level);
    // Missing slots cap additions even if the rarity schedule still has events left.
    let missing_slots = MAX_SUBSTAT_SLOTS.saturating_sub(initial_state.len());
    let max_addition_events = addition_ms.len().min(missing_slots);
    let legal_pool = build_legal_addition_pool(artifact);
    ViabilityContext {
        initial_state,
        max_addition_events,
        legal_addition_pool_set: legal_pool.into_iter().collect(),
        main_stat: artifact.main_stat,
    }
}

fn scenario_can_match_by_level16(
    scenario: &UpgradeScenario,
    viability: &ViabilityContext,
) -> bool {
    // Mirror scenarioCanMatchArtifactByLevel16; prunes impossible scenarios fast.
    let selected = &scenario.selected_substats;
    if selected.is_empty() {
        return false;
    }
    let matched_now = count_matched_in_state(&viability.initial_state, selected);
    let min_count = super::safeguard_substat_min_count(&scenario.substat_match, selected.len());
    // Substats that equal the piece's mainstat are impossible; cap the required total.
    let possible_count = if viability.main_stat == STAT_VARIANT_ANY {
        selected.len()
    } else {
        selected.iter().filter(|&&v| v != viability.main_stat).count()
    };
    let effective_required = min_count.min(possible_count);
    // Vacuously satisfied when no possible substat can satisfy the filter.
    if effective_required == 0 {
        return true;
    }
    // Already satisfied by the current state.
    if matched_now >= effective_required {
        return true;
    }
    if viability.max_addition_events == 0 {
        return false;
    }
    // Count how many missing-but-possible variants can still be added.
    let mut missing_addable = 0usize;
    for &v in selected {
        // Substats that match the mainstat are structurally impossible — skip.
        if viability.main_stat != STAT_VARIANT_ANY && v == viability.main_stat {
            continue;
        }
        if get_state_raw_value(&viability.initial_state, v) > 0.0 {
            continue;  // already present
        }
        if !viability.legal_addition_pool_set.contains(&v) {
            // Cannot be added at any future event; rule cannot be met.
            return false;
        }
        missing_addable += 1;
        // Early exit: enough addable variants exist to meet the threshold.
        if matched_now + missing_addable >= effective_required {
            return true;
        }
    }
    matched_now + missing_addable >= effective_required
}

// ─── rule preparation ─────────────────────────────────────────────────────────

fn normalize_selected_substats(substats: &[i64]) -> Vec<i64> {
    // Deduplicate and exclude wildcard/roll-count sentinels; mirrors normalizeSelectedSubstats.
    let mut seen = HashSet::<i64>::new();
    let mut out = Vec::<i64>::new();
    for &variant in substats {
        if variant <= 0 {
            continue;
        }
        if variant == STAT_VARIANT_ANY || variant == STAT_VARIANT_ROLL_COUNT {
            continue;
        }
        if !seen.insert(variant) {
            continue;
        }
        out.push(variant);
    }
    out
}

// pub(super) so improvement_watch prepares the FULL rule list (rule_order indices then
// align with detection rule ordinals: ordinal = rule_order + 1).
pub(super) fn prepare_upgrade_rules(rules: &[SafeguardWasmRuleIn]) -> Vec<PreparedUpgradeRule> {
    // Filter and pre-compute; mirrors prepareSubstatSafeguardRules.
    let mut prepared = Vec::<PreparedUpgradeRule>::new();
    for (rule_order, rule) in rules.iter().enumerate() {
        // Disabled rules contribute nothing to improvement chance.
        if safeguard_is_activation_off(rule.activation.as_deref().unwrap_or("")) {
            continue;
        }
        // Overlay only evaluates rules that explicitly select substats.
        let selected = normalize_selected_substats(rule.substats.as_deref().unwrap_or(&[]));
        if selected.is_empty() {
            continue;
        }
        let combination = rule.combination.clone().unwrap_or_default();
        let count_mode = safeguard_resolve_count_mode(rule.count_mode);
        let (set_includes, set_excludes) = safeguard_split_set_selections(&combination.sets);
        // Collect weights from the deserialized i64-keyed map.
        let mut weights = BTreeMap::<i64, f64>::new();
        if let Some(raw_w) = &rule.substat_weights {
            for (&variant, &w) in raw_w {
                if w.is_finite() {
                    weights.insert(variant, w);
                }
            }
        }
        let substat_match =
            safeguard_normalize_substat_match(rule.substat_match.as_deref().unwrap_or(""));
        prepared.push(PreparedUpgradeRule {
            rule_order,
            combination,
            required_per_group: rule.required_count.unwrap_or(1).max(1),
            count_mode,
            selected_substats: selected,
            substat_match,
            weights,
            set_includes,
            set_excludes,
            ignore_equipped_in_collection: rule.ignore_equipped_in_collection.unwrap_or(false),
            ignore_equipped_in_vault: rule.ignore_equipped_in_vault.unwrap_or(false),
            weight_main_stat_by_rank: rule.weight_main_stat_by_rank.unwrap_or(false),
        });
    }
    prepared
}

fn upgrade_rule_applies_to_artifact(
    rule: &PreparedUpgradeRule,
    artifact: &SafeguardWasmArtifactIn,
) -> bool {
    // Mirrors ruleAppliesToArtifact; called for every (rule × artifact) pair.
    if rule.ignore_equipped_in_collection && artifact.equipped_in_collection {
        return false;
    }
    if rule.ignore_equipped_in_vault && artifact.equipped_in_vault {
        return false;
    }
    // Projection in mod.rs handles all level bands, so no floor gate is needed here.
    if !safeguard_matches_selection(&rule.combination.slots, artifact.slot) {
        return false;
    }
    if rule.set_excludes.contains(&artifact.set) {
        return false;
    }
    if !rule.set_includes.is_empty() && !rule.set_includes.contains(&artifact.set) {
        return false;
    }
    if !safeguard_matches_selection(&rule.combination.ranks, artifact.rank) {
        return false;
    }
    if !safeguard_matches_selection(&rule.combination.rarities, artifact.rarity) {
        return false;
    }
    if !rule.combination.main_stats.is_empty()
        && !rule.combination.main_stats.contains(&artifact.main_stat)
    {
        return false;
    }
    let faction = safeguard_normalized_faction_for_slot(artifact.slot, artifact.faction);
    if !safeguard_matches_selection(&rule.combination.factions, faction) {
        return false;
    }
    true
}

struct ScenarioDef {
    selected_substats: Vec<i64>,
    substat_match: String,
}

fn expand_rule_scenarios(rule: &PreparedUpgradeRule) -> Vec<ScenarioDef> {
    // perSubstat mode splits each variant into its own single-variant scenario.
    if rule.substat_match == SAFEGUARD_SUBSTAT_PER_SUBSTAT && rule.selected_substats.len() > 1 {
        return rule
            .selected_substats
            .iter()
            .map(|&v| ScenarioDef {
                selected_substats: vec![v],
                // Each single-variant scenario requires exactly that variant (≥1).
                substat_match: "1".to_string(),
            })
            .collect();
    }
    // Min-count and legacy all/any modes keep the full substat list as one scenario.
    vec![ScenarioDef {
        selected_substats: rule.selected_substats.clone(),
        substat_match: rule.substat_match.clone(),
    }]
}

// pub(super) so improvement_watch builds the identical challenger model for corner probes.
pub(super) fn build_scenarios(
    rows: &[SafeguardCollectRowIn],
    rules: &[PreparedUpgradeRule],
) -> (Vec<UpgradeScenario>, BTreeMap<i64, Vec<usize>>) {
    // Builds shared challenger scenarios; mirrors buildRuleScenarios.
    // Returns scenarios plus an artifact-id → scenario-index map so callers do not need
    // to store applicable_artifact_ids inside each UpgradeScenario (~64 KB × N scenarios).
    // BTreeMap: up to 7982 entries — avoids the large contiguous backing-array realloc that
    // BTreeMap requires on resize (which can fail on V8/Windows when the heap is fragmented).
    let mut scenarios = Vec::<UpgradeScenario>::new();
    let mut idx_by_id: BTreeMap<i64, Vec<usize>> = BTreeMap::new();
    // Reuse a single Vec across all rule iterations. Vec::with_capacity pre-allocates
    // ONE small contiguous block (≈64 KB for 7982 i64) while the heap is still fresh,
    // and Vec::clear() retains that backing allocation — so no rule iteration after
    // the first triggers a memory.grow. Vec<i64> is chosen over HashSet<i64> because
    // HashSet needs a hash-table backing array that may require a large contiguous
    // block on first grow; Vec<i64> is a plain [i64] slice. The previous approach
    // (a fresh BTreeSet<i64> per rule) freed ~726 scattered B-tree nodes per iteration,
    // which talc could not always coalesce, leaving the heap progressively fragmented.
    let mut applicable_ids: Vec<i64> = Vec::with_capacity(rows.len());
    for rule in rules {
        // Find which artifacts pass this rule's non-substat combination filters.
        applicable_ids.clear();
        applicable_ids.extend(rows.iter().filter_map(|row| {
            let id = row.artifact.id?;
            if upgrade_rule_applies_to_artifact(rule, &row.artifact) { Some(id) } else { None }
        }));
        if applicable_ids.is_empty() {
            continue;
        }
        // Sort + dedup so `contains` below can use binary search (O(log N) vs O(N)).
        applicable_ids.sort_unstable();
        applicable_ids.dedup();
        for def in expand_rule_scenarios(rule) {
            // Use SafeguardCountKey directly: stack-allocated enum avoids String heap allocs.
            let mut challengers_by_key = BTreeMap::<SafeguardCountKey, Vec<StaticChallenger>>::new();
            for row in rows {
                let Some(art_id) = row.artifact.id else {
                    continue;
                };
                // Binary search on sorted Vec: O(log N) membership test, no hashing.
                if applicable_ids.binary_search(&art_id).is_err() {
                    continue;
                }
                // Challenger must currently match the scenario's substat gate.
                if !artifact_matches_substats(
                    &row.artifact,
                    &def.selected_substats,
                    &def.substat_match,
                ) {
                    continue;
                }
                // Project challenger to +16 for a fair comparison (Bug 2 fix), then add the same
                // per-artifact main-stat rank bonus the detection ranking uses (constant at +16).
                let proj_score = compute_projected_challenger_score(
                    &row.artifact,
                    &def.selected_substats,
                    &rule.weights,
                ) + super::safeguard_main_stat_rank_bonus(
                    &row.artifact,
                    rule.weight_main_stat_by_rank,
                    true,
                );
                if !(proj_score > 0.0) {
                    continue;
                }
                let key = safeguard_count_key_from_parts(
                    row.artifact.slot,
                    row.artifact.set,
                    row.artifact.faction,
                    row.artifact.main_stat,
                    rule.count_mode,
                );
                challengers_by_key
                    .entry(key)
                    .or_default()
                    .push(StaticChallenger {
                        artifact_id: art_id,
                        projected_score: proj_score,
                        rank: row.artifact.rank,
                        main_stat: row.artifact.main_stat,
                    });
            }
            let scenario_idx = scenarios.len();
            scenarios.push(UpgradeScenario {
                rule_order: rule.rule_order,
                rule_selected_substats: rule.selected_substats.clone(),
                rule_substat_match: rule.substat_match.clone(),
                selected_substats: def.selected_substats,
                substat_match: def.substat_match,
                required_per_group: rule.required_per_group,
                count_mode: rule.count_mode,
                weights: rule.weights.clone(),
                weight_main_stat_by_rank: rule.weight_main_stat_by_rank,
                challengers_by_count_key: challengers_by_key,
            });
            // Index this scenario under every applicable artifact id so the caller can look up
            // applicable scenarios per artifact without retaining the per-scenario HashSets.
            for &art_id in &applicable_ids {
                idx_by_id.entry(art_id).or_default().push(scenario_idx);
            }
        }
    }
    (scenarios, idx_by_id)
}

// ─── scenario selection for debug / click-through ────────────────────────────

fn resolve_most_likely_scenario_idx<'a>(
    artifact: &SafeguardWasmArtifactIn,
    viable: &'a [&'a UpgradeScenario],
) -> Option<usize> {
    // Mirror resolveMostLikelyScenario; returns the index in `viable`.
    if viable.is_empty() {
        return None;
    }
    if viable.len() == 1 {
        return Some(0);
    }
    // Compute per-scenario chance in isolation; reuse one memo across all inner
    // calls so N single-scenario invocations share one BTreeMap instead of N.
    let mut memo: BTreeMap<StateKey, f64> = BTreeMap::new();
    let mut chances: Vec<f64> = Vec::with_capacity(viable.len());
    for &s in viable.iter() {
        // Wrap single reference in a one-element array slice for the shared signature.
        let single = [s];
        // Per-rule map will contain exactly one entry for this single-scenario call; use the max
        // as the scenario's standalone chance (post-refactor returns (max, by_rule_ordinal)).
        let (chance, _by_rule) = compute_artifact_chance_percent(artifact, &single, &mut memo);
        chances.push(chance);
    }
    let &best_chance = chances.iter().max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))?;
    let best_idxs: Vec<usize> = chances
        .iter()
        .enumerate()
        .filter(|(_, &c)| c == best_chance)
        .map(|(i, _)| i)
        .collect();
    if best_idxs.len() == 1 {
        return Some(best_idxs[0]);
    }
    // Tie-break 1: most matched selected substats on the artifact right now.
    let matched_counts: Vec<usize> = best_idxs
        .iter()
        .map(|&i| {
            let sel: HashSet<i64> =
                viable[i].rule_selected_substats.iter().copied().collect();
            count_matched_on_artifact(artifact, &sel)
        })
        .collect();
    let best_matched = *matched_counts.iter().max()?;
    let matched_best: Vec<usize> = best_idxs
        .iter()
        .enumerate()
        .filter(|(j, _)| matched_counts[*j] == best_matched)
        .map(|(_, &i)| i)
        .collect();
    if matched_best.len() == 1 {
        return Some(matched_best[0]);
    }
    // Tie-break 2: earliest rule in the safeguard list (smallest rule_order).
    let best_order = matched_best
        .iter()
        .map(|&i| viable[i].rule_order)
        .min()?;
    let order_best: Vec<usize> = matched_best
        .iter()
        .filter(|&&i| viable[i].rule_order == best_order)
        .copied()
        .collect();
    // Final tie-break: first scenario by position in the expanded list.
    order_best.first().copied()
}

// ─── debug snapshot ───────────────────────────────────────────────────────────

fn build_chance_debug(
    artifact: &SafeguardWasmArtifactIn,
    scenario: &UpgradeScenario,
    viability: &ViabilityContext,
    viable_scenario_count: u32,
) -> ImprovementChanceDebug {
    // Mirror buildChanceDebugSnapshot; populates tooltip data.
    let artifact_id = artifact.id.unwrap_or(0);
    // Current score (not projected) for the "betterCount" display in the tooltip. Includes the
    // main-stat rank bonus so the comparison against (bonus-inclusive) challenger scores is fair.
    let candidate_score = safeguard_compute_score(
        artifact,
        &scenario.selected_substats,
        &scenario.weights,
        scenario.weight_main_stat_by_rank,
    );
    let key = safeguard_count_key_from_parts(
        artifact.slot,
        artifact.set,
        artifact.faction,
        artifact.main_stat,
        scenario.count_mode,
    );
    let challengers = scenario
        .challengers_by_count_key
        .get(&key)
        .map(|v| v.as_slice())
        .unwrap_or(&[]);
    let mut bucket_count = 0u32;
    let mut better_count = 0u32;
    for ch in challengers {
        if ch.artifact_id == artifact_id {
            continue;
        }
        bucket_count += 1;
        if is_challenger_strictly_better(
            ch.projected_score,
            ch.main_stat,
            ch.rank,
            candidate_score,
            artifact.main_stat,
            artifact.rank,
        ) {
            better_count += 1;
        }
    }
    // For perSubstat scenarios, restore the full rule substat list for the tooltip.
    let is_per_substat = scenario.rule_substat_match == SAFEGUARD_SUBSTAT_PER_SUBSTAT;
    let debug_substats = if is_per_substat {
        scenario.rule_selected_substats.clone()
    } else {
        scenario.selected_substats.clone()
    };
    let matched_now =
        count_matched_in_state(&viability.initial_state, &scenario.selected_substats);
    ImprovementChanceDebug {
        viable_scenario_count,
        selected_substats: debug_substats,
        substat_match: scenario.rule_substat_match.clone(),
        required_per_group: scenario.required_per_group,
        bucket_candidate_count: bucket_count,
        better_candidate_count: better_count,
        matched_selected_now: matched_now.min(255) as u8,
        max_addition_events_to16: viability.max_addition_events.min(255) as u8,
    }
}

// ─── public entry point ───────────────────────────────────────────────────────

/// Compute improvement-chance percentages for every non-maxed artifact in `rows`.
/// Returns an empty vec when `!enabled`, when there are no substat rules,
/// or when there are no non-maxed artifacts with applicable scenarios.
pub fn compute_improvement_chance_core(
    rows: &[SafeguardCollectRowIn],
    rules: Vec<SafeguardWasmRuleIn>,
    enabled: bool,
    debug: bool,
) -> (Vec<ImprovementChanceEntry>, Option<ImprovementChancePerfDiag>) {
    if !enabled || rules.is_empty() || rows.is_empty() {
        return (vec![], None);
    }
    let prepared = prepare_upgrade_rules(&rules);
    if prepared.is_empty() {
        return (vec![], None);
    }
    let (scenarios, idx_by_id) = build_scenarios(rows, &prepared);
    if scenarios.is_empty() {
        return (vec![], None);
    }
    // Convert the artifact-id → index map into artifact-id → scenario-reference map.
    // Done after scenarios is stable (finalized Vec) so references are valid for the loop below.
    // BTreeMap: mirrors idx_by_id (up to 7982 entries) — avoids contiguous resize.
    let mut scenarios_by_id: BTreeMap<i64, Vec<&UpgradeScenario>> = BTreeMap::new();
    for (art_id, indices) in &idx_by_id {
        scenarios_by_id.insert(*art_id, indices.iter().map(|&i| &scenarios[i]).collect());
    }
    let mut output = Vec::<ImprovementChanceEntry>::new();
    // Single scratch memo reused across all per-artifact compute_probability calls.
    // compute_artifact_chance_percent calls memo.clear() at the start of each artifact,
    // so stale entries from the previous artifact never leak into the next one.
    let mut impr_memo: BTreeMap<StateKey, f64> = BTreeMap::new();
    // Perf counters — only accumulated when debug=true so the hot path is unaffected.
    let mut artifacts_with_scenarios = 0u32;
    let mut artifacts_viable = 0u32;
    for row in rows {
        let Some(artifact_id) = row.artifact.id else {
            continue;
        };
        // Fully-upgraded artifacts are included: compute_artifact_chance_percent handles the
        // milestones.is_empty() case and returns 100 or 0 based on current competitiveness.
        let artifact_scenarios: &[&UpgradeScenario] = scenarios_by_id
            .get(&artifact_id)
            .map(|v| v.as_slice())
            .unwrap_or(&[]);
        if artifact_scenarios.is_empty() {
            output.push(ImprovementChanceEntry {
                artifact_id,
                chance_percent: 0.0,
                has_matching_safeguard: false,
                matched_rule_ordinal: None,
                chances_by_rule_ordinal: Vec::new(),
                debug: None,
            });
            continue;
        }
        if debug { artifacts_with_scenarios += 1; }
        // Prune scenarios that cannot be satisfied by +16 for this artifact.
        let viability = build_viability_context(&row.artifact);
        let viable: Vec<&UpgradeScenario> = artifact_scenarios
            .iter()
            .filter(|&&s| scenario_can_match_by_level16(s, &viability))
            .copied()
            .collect();
        if viable.is_empty() {
            output.push(ImprovementChanceEntry {
                artifact_id,
                chance_percent: 0.0,
                has_matching_safeguard: false,
                matched_rule_ordinal: None,
                chances_by_rule_ordinal: Vec::new(),
                debug: None,
            });
            continue;
        }
        if debug { artifacts_viable += 1; }
        let (chance, chances_map) =
            compute_artifact_chance_percent(&row.artifact, &viable, &mut impr_memo);
        // Convert BTreeMap to ordered Vec<ImprovementChanceRuleEntry> for round-trip stability.
        let chances_by_rule_ordinal: Vec<ImprovementChanceRuleEntry> = chances_map
            .into_iter()
            .map(|(rule_ordinal, chance_percent)| ImprovementChanceRuleEntry {
                rule_ordinal,
                chance_percent,
            })
            .collect();
        let preferred_idx = resolve_most_likely_scenario_idx(&row.artifact, &viable);
        let preferred = preferred_idx.map(|i| viable[i]);
        let debug_snapshot = preferred.map(|s| {
            build_chance_debug(&row.artifact, s, &viability, viable.len() as u32)
        });
        // 1-based ordinal derived from the 0-based rule_order; used by TypeScript for navigation.
        let matched_rule_ordinal = preferred.map(|s| s.rule_order as i64 + 1);
        output.push(ImprovementChanceEntry {
            artifact_id,
            chance_percent: chance,
            has_matching_safeguard: true,
            matched_rule_ordinal,
            chances_by_rule_ordinal,
            debug: debug_snapshot,
        });
    }
    let perf_diag = if debug {
        Some(ImprovementChancePerfDiag {
            row_count: rows.len() as u32,
            rule_count: prepared.len() as u32,
            scenario_count: scenarios.len() as u32,
            artifacts_with_scenarios,
            artifacts_viable,
        })
    } else {
        None
    };
    (output, perf_diag)
}

