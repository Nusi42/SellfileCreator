// Direct Rust translation of safeguardUpgradeChance.ts.
// Probability computation runs in WASM on the rule-cache worker thread
// so the main-thread useMemo is eliminated (Bug 3 fix).
// Bug 1 fix (enabled-gate): caller passes `enabled` and we return early.
// Bug 2 fix (challenger projection): challenger pool uses closed-form expected
// +16 scores rather than current-level scores, making the comparison fair.
use super::{
    // Pub structs declared in mod.rs.
    SafeguardWasmArtifactIn, SafeguardWasmCombination, SafeguardWasmCountMode,
    SafeguardWasmRuleIn,
    // Functions made pub(super) for this submodule.
    safeguard_compute_score, safeguard_count_key_from_parts, safeguard_count_key_to_string,
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
};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

// ─── constants ───────────────────────────────────────────────────────────────

// All upgrade projections target +16 since safeguards compare final gear value.
const UPGRADE_TARGET_LEVEL: i64 = 16;
// Gear can never hold more than four substats simultaneously.
const MAX_SUBSTAT_SLOTS: usize = 4;
// Fixed upgrade event milestones; each triggers either a roll or an addition.
const ROLL_MILESTONES: [i64; 4] = [4, 8, 12, 16];
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

// ─── public output types ─────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpgradeChanceDebug {
    // Number of artifacts used as the comparison dataset for this chance run.
    pub source_artifact_count: u32,
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

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpgradeChanceEntry {
    // Artifact id this entry describes.
    pub artifact_id: i64,
    // Rounded probability (0..=100) of being safeguard-selected at +16.
    pub chance_percent: u8,
    // True when at least one substat safeguard applies to this artifact.
    pub has_matching_safeguard: bool,
    // Preferred safeguard rule id for overlay click-through navigation (legacy; always None now that
    // SafeguardRule carries no id — kept in payload for backward-compatible deserialization).
    pub matched_rule_id: Option<String>,
    // 1-based ordinal of the preferred safeguard rule; None when no rule matched.
    // Renamed to "ruleOrdinal" to match TS type UpgradeChanceWasmEntry; overrides the struct-level
    // camelCase rename which would otherwise produce "matchedRuleOrdinal".
    #[serde(rename = "ruleOrdinal")]
    pub matched_rule_ordinal: Option<i64>,
    // Optional debug snapshot populated when the caller requests diagnostics.
    pub debug: Option<UpgradeChanceDebug>,
}

// ─── internal structs ────────────────────────────────────────────────────────

// Prepared rule distilled from SafeguardWasmRuleIn; all parsing done once.
struct PreparedUpgradeRule {
    rule_order: usize,
    rule_id: String,
    combination: SafeguardWasmCombination,
    required_per_group: i64,
    count_mode: SafeguardWasmCountMode,
    selected_substats: Vec<i64>,
    // "any" | "all" | "perSubstat" after normalization.
    substat_match: String,
    weights: HashMap<i64, f64>,
    set_includes: HashSet<i64>,
    set_excludes: HashSet<i64>,
    ignore_equipped_in_collection: bool,
    ignore_equipped_in_vault: bool,
    // Pre-computed score floor from beatEquippedPercentile; None = disabled.
    equipped_floor_score: Option<f64>,
}

// One ranking scenario expanded from a rule; perSubstat splits into N Any scenarios.
struct UpgradeScenario {
    rule_order: usize,
    rule_id: String,
    // Full rule substat list preserved for debug/tie-break (perSubstat expansion splits this).
    rule_selected_substats: Vec<i64>,
    // Original match mode before per-substat expansion.
    rule_substat_match: String,
    // Artifact ids that pass this rule's non-substat combination filters.
    applicable_artifact_ids: HashSet<i64>,
    selected_substats: Vec<i64>,
    substat_match: String,
    required_per_group: i64,
    count_mode: SafeguardWasmCountMode,
    weights: HashMap<i64, f64>,
    // Challengers pre-bucketed by count-key string for fast per-artifact lookup.
    challengers_by_count_key: HashMap<String, Vec<StaticChallenger>>,
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
    // Per-roll expected gains from observed substat values (scaled integer).
    expected_gain: HashMap<i64, i64>,
    // Rank-based fallback gains for variants with no observed value (scaled).
    fallback_gain: HashMap<i64, i64>,
}

// Per-artifact viability snapshot used to prune scenarios impossible by +16.
struct ViabilityContext {
    initial_state: HashMap<i64, i64>,
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
        // Armor slots (1–4): full 11-variant pool.
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

fn build_fallback_gain(rank: i64) -> HashMap<i64, i64> {
    // Expected per-roll gain for each known variant, scaled to STATE_VALUE_SCALE.
    // Uses rank-derived quality factor; mirrors buildFallbackExpectedGainByVariantScaled.
    let rank_scale = resolve_unknown_rank_scale(rank);
    let mut out = HashMap::<i64, i64>::new();
    for variant in ALL_SUBSTAT_VARIANTS {
        let max6 = safeguard_substat_max6_by_variant(variant);
        if max6 <= 0.0 {
            continue;
        }
        let modeled = max6 * UNKNOWN_ROLL_QUALITY_RATIO * rank_scale;
        let scaled = (modeled * STATE_VALUE_SCALE as f64).round() as i64;
        if scaled > 0 {
            out.insert(variant, scaled);
        }
    }
    out
}

fn build_existing_gain(
    artifact: &SafeguardWasmArtifactIn,
    fallback: &HashMap<i64, i64>,
) -> HashMap<i64, i64> {
    // Per-roll expected gain derived from the accumulated substat value.
    // Stored rows have no `rolls` field; treat rolls=0 → divisor=1 → modeled=min(max6, value).
    // This mirrors the TS path: const divisor = Math.max(1, rolls + 1) with rolls=0.
    let mut out = HashMap::<i64, i64>::new();
    for substat in &artifact.substats {
        let max6 = safeguard_substat_max6_by_variant(substat.variant);
        if max6 <= 0.0 {
            continue;
        }
        // divisor = max(1, rolls + 1) mirrors TS buildExistingExpectedGainByVariantScaled.
        let divisor = substat.rolls
            .filter(|&r| r > 0)
            .map(|r| (r + 1) as f64)
            .unwrap_or(1.0)
            .max(1.0);
        let modeled = if substat.value > 0.0 && substat.value.is_finite() {
            // Cap at max6 exactly as TS does (Math.min(max6, totalValue / divisor)).
            (substat.value / divisor).min(max6)
        } else {
            0.0
        };
        if modeled > 0.0 {
            out.insert(substat.variant, (modeled * STATE_VALUE_SCALE as f64).round() as i64);
        } else if let Some(&fb) = fallback.get(&substat.variant) {
            // Fall back to rank-based estimate when value is unavailable.
            out.insert(substat.variant, fb);
        }
    }
    out
}

// ─── recursion state helpers ──────────────────────────────────────────────────

fn build_initial_scaled_state(artifact: &SafeguardWasmArtifactIn) -> HashMap<i64, i64> {
    // Seed the mutable recursion state from the artifact's current substats.
    let mut state = HashMap::<i64, i64>::new();
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

fn get_state_raw_value(state: &HashMap<i64, i64>, variant: i64) -> f64 {
    // Read a variant's unscaled value from the recursion state.
    state.get(&variant).copied().unwrap_or(0).max(0) as f64 / STATE_VALUE_SCALE as f64
}

fn count_matched_in_state(state: &HashMap<i64, i64>, selected: &[i64]) -> usize {
    // Count selected substats that have a positive value in the state.
    selected
        .iter()
        .filter(|&&v| get_state_raw_value(state, v) > 0.0)
        .count()
}

fn state_matches_substats(
    state: &HashMap<i64, i64>,
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
    state: &HashMap<i64, i64>,
    selected: &[i64],
    weights: &HashMap<i64, f64>,
) -> f64 {
    // Weighted normalized sum from recursion state; mirrors computeSafeguardScoreFromState.
    let mut total = 0.0;
    for &variant in selected {
        let raw = get_state_raw_value(state, variant);
        let normalized = safeguard_normalize_substat_value(variant, raw);
        let weight = safeguard_weight_for_variant(weights, variant);
        total += weight * normalized;
    }
    if total.is_finite() { total } else { 0.0 }
}

fn build_state_key(state: &HashMap<i64, i64>, event_idx: usize) -> String {
    // Stable memo key: event index | sorted variant:value pairs.
    // Matches TS buildRecursionStateKey format exactly.
    let mut entries: Vec<(i64, i64)> = state.iter().map(|(&v, &val)| (v, val)).collect();
    entries.sort_unstable_by_key(|(v, _)| *v);
    let encoded = entries
        .iter()
        .map(|(v, val)| format!("{v}:{val}"))
        .collect::<Vec<_>>()
        .join("|");
    format!("{event_idx}|{encoded}")
}

fn apply_state_delta(
    state: &HashMap<i64, i64>,
    variant: i64,
    delta: i64,
) -> HashMap<i64, i64> {
    // Clone state and add delta to one variant (non-negative floor).
    let mut next = state.clone();
    let current = next.get(&variant).copied().unwrap_or(0);
    next.insert(variant, (current + delta).max(0));
    next
}

fn resolve_expected_gain(
    variant: i64,
    existing: &HashMap<i64, i64>,
    fallback: &HashMap<i64, i64>,
) -> i64 {
    // Observed gain takes priority; fall back to rank-based estimate.
    let direct = existing.get(&variant).copied().unwrap_or(0);
    if direct > 0 { return direct; }
    fallback.get(&variant).copied().unwrap_or(0)
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

fn compute_projected_challenger_score(
    artifact: &SafeguardWasmArtifactIn,
    selected: &[i64],
    weights: &HashMap<i64, f64>,
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
    // Mirror isChallengerStrictlyBetterThanCandidate in safeguardUpgradeChance.ts.
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
    state: &HashMap<i64, i64>,
    ctx: &RecursionContext<'_>,
) -> bool {
    // Test whether the projected state is safeguard-selected by any scenario.
    // Mirrors isStateSelectedByAnyScenario in TS.
    for scenario in ctx.scenarios {
        if !scenario.applicable_artifact_ids.contains(&ctx.artifact_id) {
            continue;
        }
        if !state_matches_substats(state, &scenario.selected_substats, &scenario.substat_match, ctx.artifact_main_stat) {
            continue;
        }
        let score = compute_score_from_state(state, &scenario.selected_substats, &scenario.weights);
        if !(score > 0.0) {
            continue;
        }
        // Build the count-key for this artifact and look up the challenger bucket.
        let key_raw = safeguard_count_key_from_parts(
            ctx.artifact_slot,
            ctx.artifact_set,
            ctx.artifact_faction,
            ctx.artifact_main_stat,
            scenario.count_mode,
        );
        let key_str = safeguard_count_key_to_string(&key_raw);
        let challengers = scenario
            .challengers_by_count_key
            .get(&key_str)
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

fn compute_probability(
    ctx: &RecursionContext<'_>,
    state: &HashMap<i64, i64>,
    event_idx: usize,
    memo: &mut HashMap<String, f64>,
) -> f64 {
    // Base case: no more milestones; evaluate the final projected state.
    if event_idx >= ctx.milestones.len() {
        return if is_state_selected_by_any_scenario(state, ctx) {
            1.0
        } else {
            0.0
        };
    }
    let key = build_state_key(state, event_idx);
    if let Some(&cached) = memo.get(&key) {
        return cached;
    }
    let milestone = ctx.milestones[event_idx];
    // An addition event fires when the milestone is in the addition schedule
    // AND the artifact still has open substat slots.
    let is_addition = ctx.addition_milestones.contains(&milestone) && state.len() < MAX_SUBSTAT_SLOTS;
    let result = if is_addition {
        // Addition: choose one missing legal substat uniformly at random.
        let candidates: Vec<i64> = ctx
            .legal_addition_pool
            .iter()
            .filter(|&&v| !state.contains_key(&v))
            .copied()
            .collect();
        if candidates.is_empty() {
            // No missing pool candidates; advance without an addition.
            compute_probability(ctx, state, event_idx + 1, memo)
        } else {
            let p = 1.0 / candidates.len() as f64;
            let mut total = 0.0;
            for variant in candidates {
                let delta =
                    resolve_expected_gain(variant, &ctx.expected_gain, &ctx.fallback_gain);
                if delta <= 0 {
                    continue;
                }
                let next = apply_state_delta(state, variant, delta);
                total += p * compute_probability(ctx, &next, event_idx + 1, memo);
            }
            total
        }
    } else {
        // Roll: choose one existing substat uniformly at random.
        let mut variants: Vec<i64> = state.keys().copied().collect();
        variants.sort_unstable();
        if variants.is_empty() {
            compute_probability(ctx, state, event_idx + 1, memo)
        } else {
            let p = 1.0 / variants.len() as f64;
            let mut total = 0.0;
            for variant in variants {
                let delta =
                    resolve_expected_gain(variant, &ctx.expected_gain, &ctx.fallback_gain);
                if delta <= 0 {
                    continue;
                }
                let next = apply_state_delta(state, variant, delta);
                total += p * compute_probability(ctx, &next, event_idx + 1, memo);
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

fn compute_artifact_chance_percent(
    artifact: &SafeguardWasmArtifactIn,
    scenarios: &[&UpgradeScenario],
) -> u8 {
    if scenarios.is_empty() {
        return 0;
    }
    let artifact_id = artifact.id.unwrap_or(0);
    let level = clamp_level(artifact.exact_level.unwrap_or(artifact.level));
    let milestones = resolve_remaining_milestones(level);
    let initial_state = build_initial_scaled_state(artifact);
    // Artifact already at +16: check current state directly without recursion.
    if milestones.is_empty() {
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
            expected_gain: HashMap::default(),
            fallback_gain: HashMap::default(),
        };
        return if is_state_selected_by_any_scenario(&initial_state, &ctx) {
            100
        } else {
            0
        };
    }
    let rarity = clamp_rarity(artifact.rarity);
    let addition_milestones = resolve_remaining_addition_milestones(rarity, level);
    let legal_addition_pool = build_legal_addition_pool(artifact);
    let fallback_gain = build_fallback_gain(artifact.rank);
    let expected_gain = build_existing_gain(artifact, &fallback_gain);
    let ctx = RecursionContext {
        artifact_id,
        artifact_slot: artifact.slot,
        artifact_set: artifact.set,
        artifact_faction: artifact.faction,
        artifact_main_stat: artifact.main_stat,
        artifact_rank: artifact.rank,
        scenarios,
        milestones,
        addition_milestones,
        legal_addition_pool,
        expected_gain,
        fallback_gain,
    };
    let prob = compute_probability(&ctx, &initial_state, 0, &mut HashMap::new());
    let percent = (prob.max(0.0).min(1.0) * 100.0).round() as i64;
    percent.max(0).min(100) as u8
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

fn prepare_upgrade_rules(rules: &[SafeguardWasmRuleIn]) -> Vec<PreparedUpgradeRule> {
    // Filter and pre-compute; mirrors prepareSubstatSafeguardRules.
    let mut prepared = Vec::<PreparedUpgradeRule>::new();
    for (rule_order, rule) in rules.iter().enumerate() {
        // Disabled rules contribute nothing to upgrade chance.
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
        let mut weights = HashMap::<i64, f64>::new();
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
            rule_id: rule.id.as_deref().unwrap_or("").trim().to_string(),
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
            equipped_floor_score: rule.equipped_floor_score.filter(|v| v.is_finite()),
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
    // Floor score check: collection-equipped are reference; skip for low-level gear.
    if let Some(floor) = rule.equipped_floor_score {
        // Use exact_level when present (mirrors TS clampLevel(artifact.exactLevel ?? artifact.level)).
        let eff_level = artifact.exact_level.unwrap_or(artifact.level);
        if !artifact.equipped_in_collection && eff_level >= 12 {
            let score = safeguard_compute_score(artifact, &rule.selected_substats, &rule.weights);
            if score < floor {
                return false;
            }
        }
    }
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

fn build_scenarios(
    rows: &[SafeguardCollectRowIn],
    rules: &[PreparedUpgradeRule],
) -> Vec<UpgradeScenario> {
    // Builds shared challenger scenarios; mirrors buildRuleScenarios.
    let mut scenarios = Vec::<UpgradeScenario>::new();
    for rule in rules {
        // Find which artifacts pass this rule's non-substat combination filters.
        let applicable_ids: HashSet<i64> = rows
            .iter()
            .filter_map(|row| {
                let id = row.artifact.id?;
                if upgrade_rule_applies_to_artifact(rule, &row.artifact) {
                    Some(id)
                } else {
                    None
                }
            })
            .collect();
        if applicable_ids.is_empty() {
            continue;
        }
        for def in expand_rule_scenarios(rule) {
            let mut challengers_by_key = HashMap::<String, Vec<StaticChallenger>>::new();
            for row in rows {
                let Some(art_id) = row.artifact.id else {
                    continue;
                };
                if !applicable_ids.contains(&art_id) {
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
                // Project challenger to +16 for a fair comparison (Bug 2 fix).
                let proj_score = compute_projected_challenger_score(
                    &row.artifact,
                    &def.selected_substats,
                    &rule.weights,
                );
                if !(proj_score > 0.0) {
                    continue;
                }
                let key_raw = safeguard_count_key_from_parts(
                    row.artifact.slot,
                    row.artifact.set,
                    row.artifact.faction,
                    row.artifact.main_stat,
                    rule.count_mode,
                );
                let key_str = safeguard_count_key_to_string(&key_raw);
                challengers_by_key
                    .entry(key_str)
                    .or_default()
                    .push(StaticChallenger {
                        artifact_id: art_id,
                        projected_score: proj_score,
                        rank: row.artifact.rank,
                        main_stat: row.artifact.main_stat,
                    });
            }
            scenarios.push(UpgradeScenario {
                rule_order: rule.rule_order,
                rule_id: rule.rule_id.clone(),
                rule_selected_substats: rule.selected_substats.clone(),
                rule_substat_match: rule.substat_match.clone(),
                applicable_artifact_ids: applicable_ids.clone(),
                selected_substats: def.selected_substats,
                substat_match: def.substat_match,
                required_per_group: rule.required_per_group,
                count_mode: rule.count_mode,
                weights: rule.weights.clone(),
                challengers_by_count_key: challengers_by_key,
            });
        }
    }
    scenarios
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
    // Compute per-scenario chance in isolation.
    let chances: Vec<u8> = viable
        .iter()
        .map(|&s| {
            // Wrap single reference in a one-element array slice for the shared signature.
            let single = [s];
            compute_artifact_chance_percent(artifact, &single)
        })
        .collect();
    let best_chance = *chances.iter().max()?;
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
    // Final tie-break: first by position (rule_id is no longer set on incoming rules).
    order_best.first().copied()
}

// ─── debug snapshot ───────────────────────────────────────────────────────────

fn build_chance_debug(
    artifact: &SafeguardWasmArtifactIn,
    scenario: &UpgradeScenario,
    viability: &ViabilityContext,
    source_artifact_count: u32,
    viable_scenario_count: u32,
) -> UpgradeChanceDebug {
    // Mirror buildChanceDebugSnapshot; populates tooltip data.
    let artifact_id = artifact.id.unwrap_or(0);
    // Current score (not projected) for the "betterCount" display in the tooltip.
    let candidate_score =
        safeguard_compute_score(artifact, &scenario.selected_substats, &scenario.weights);
    let key_raw = safeguard_count_key_from_parts(
        artifact.slot,
        artifact.set,
        artifact.faction,
        artifact.main_stat,
        scenario.count_mode,
    );
    let key_str = safeguard_count_key_to_string(&key_raw);
    let challengers = scenario
        .challengers_by_count_key
        .get(&key_str)
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
    UpgradeChanceDebug {
        source_artifact_count,
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

/// Compute upgrade-chance percentages for every non-maxed artifact in `rows`.
/// Returns an empty vec when `!enabled`, when there are no substat rules,
/// or when there are no non-maxed artifacts with applicable scenarios.
pub fn compute_upgrade_chance_core(
    rows: &[SafeguardCollectRowIn],
    rules: Vec<SafeguardWasmRuleIn>,
    enabled: bool,
) -> Vec<UpgradeChanceEntry> {
    if !enabled || rules.is_empty() || rows.is_empty() {
        return vec![];
    }
    let prepared = prepare_upgrade_rules(&rules);
    if prepared.is_empty() {
        return vec![];
    }
    let scenarios = build_scenarios(rows, &prepared);
    if scenarios.is_empty() {
        return vec![];
    }
    // Index applicable scenario references per artifact id for fast lookup.
    let mut scenarios_by_id: HashMap<i64, Vec<&UpgradeScenario>> = HashMap::new();
    for scenario in &scenarios {
        for &art_id in &scenario.applicable_artifact_ids {
            scenarios_by_id.entry(art_id).or_default().push(scenario);
        }
    }
    let source_count = rows.len() as u32;
    let mut output = Vec::<UpgradeChanceEntry>::new();
    for row in rows {
        let Some(artifact_id) = row.artifact.id else {
            continue;
        };
        let level = clamp_level(row.artifact.exact_level.unwrap_or(row.artifact.level));
        // Fully-upgraded artifacts have no remaining events; skip chance overlays.
        if level >= UPGRADE_TARGET_LEVEL {
            continue;
        }
        let artifact_scenarios: &[&UpgradeScenario] = scenarios_by_id
            .get(&artifact_id)
            .map(|v| v.as_slice())
            .unwrap_or(&[]);
        if artifact_scenarios.is_empty() {
            output.push(UpgradeChanceEntry {
                artifact_id,
                chance_percent: 0,
                has_matching_safeguard: false,
                matched_rule_id: None,
                matched_rule_ordinal: None,
                debug: None,
            });
            continue;
        }
        // Prune scenarios that cannot be satisfied by +16 for this artifact.
        let viability = build_viability_context(&row.artifact);
        let viable: Vec<&UpgradeScenario> = artifact_scenarios
            .iter()
            .filter(|&&s| scenario_can_match_by_level16(s, &viability))
            .copied()
            .collect();
        if viable.is_empty() {
            output.push(UpgradeChanceEntry {
                artifact_id,
                chance_percent: 0,
                has_matching_safeguard: false,
                matched_rule_id: None,
                matched_rule_ordinal: None,
                debug: None,
            });
            continue;
        }
        let chance = compute_artifact_chance_percent(&row.artifact, &viable);
        let preferred_idx = resolve_most_likely_scenario_idx(&row.artifact, &viable);
        let preferred = preferred_idx.map(|i| viable[i]);
        let debug = preferred.map(|s| {
            build_chance_debug(&row.artifact, s, &viability, source_count, viable.len() as u32)
        });
        // matched_rule_id is always None now that SafeguardRule carries no id field;
        // kept in struct for backward-compatible deserialization of old payloads.
        let matched_rule_id = preferred
            .and_then(|s| if s.rule_id.is_empty() { None } else { Some(s.rule_id.clone()) });
        // 1-based ordinal derived from the 0-based rule_order; used by TypeScript for navigation.
        let matched_rule_ordinal = preferred.map(|s| s.rule_order as i64 + 1);
        output.push(UpgradeChanceEntry {
            artifact_id,
            chance_percent: chance,
            has_matching_safeguard: true,
            matched_rule_id,
            matched_rule_ordinal,
            debug,
        });
    }
    output
}
