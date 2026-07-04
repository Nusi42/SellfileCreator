// Improvement-watch corner synthesis for `anticipateImprovements` safeguards that carry
// an improvement-chance threshold.
//
// Detection leaves zero-missing "watch" placeholders on quota-satisfied count-groups.
// Emitted as-is those would over-protect: the merged HSF rules would keep EVERY
// pattern-matching drop regardless of its improvement chance. This module post-processes
// the detection snapshot instead: for each watch placeholder it searches the minimal
// substat-value "corners" a fresh drop must reach so its improvement chance clears the
// rule's per-level threshold, and attaches them as `watch_corners`. Merge-time emission
// (safeguard_build_placeholder_rules) then pins ONE HSF keep rule per corner. Placeholders
// where even maximal values cannot clear the bar are REMOVED — nothing viable exists, so
// fresh drops fall back to normal selling.
use super::{
    // Shared chance machinery (improvement_chance.rs, widened to pub(super) for reuse).
    improvement_chance::{
        build_scenarios, compute_synthetic_chance_for_scenarios, prepare_upgrade_rules,
        resolve_roll_range, StateKey, UpgradeScenario, ROLL_MILESTONES,
    },
    // Wire structs and SSOT helpers from mod.rs.
    safeguard_combinations, safeguard_default_group_sample,
    safeguard_is_activation_anticipate_improvements, safeguard_normalize_substat_match,
    safeguard_placeholder_substat_possible, safeguard_slot_substat_filter,
    safeguard_substat_min_count, safeguard_threshold_slot_for_level, safeguard_variant_to_sub,
    safeguard_weight_for_variant, SafeguardWasmCombination, SafeguardWasmGroupSample,
    SafeguardWasmPlaceholderOut, SafeguardWasmRuleIn, SafeguardWasmSnapshotOut,
    SafeguardWatchCornerOut, SafeguardWatchCornerSubstatOut,
};
use crate::safeguards::fast_path_types::{SafeguardWasmArtifactIn, SafeguardWasmSubstatIn};
use crate::{
    SafeguardCollectRowIn, HSF_SUBSTAT_SLOT_COUNT, SAFEGUARD_SUBSTAT_PER_SUBSTAT,
    STAT_VARIANT_ANY, STAT_VARIANT_ROLL_COUNT,
};
use std::cell::Cell;
use std::collections::BTreeMap;

// ─── constants ───────────────────────────────────────────────────────────────

// Probed upgrade-stage levels: the milestone boundaries a fresh drop can sit at.
const WATCH_LEVELS: [i64; 5] = [0, 4, 8, 12, 16];
// Rank/rarity windows worth watching; drops below these can never be quota material.
const WATCH_RANK_MIN: i64 = 4;
const WATCH_RANK_MAX: i64 = 6;
const WATCH_RARITY_MIN: i64 = 3;
const WATCH_RARITY_MAX: i64 = 6;
// Fallback axes when the rule combination leaves the dimension unconstrained.
const WATCH_DEFAULT_RANKS: [i64; 2] = [5, 6];
const WATCH_DEFAULT_RARITIES: [i64; 2] = [4, 5]; // epic, legendary
// Binary-search iterations for the passing scale factor λ. The λ search only needs to
// land the per-component INTEGER binary descent below in the right neighborhood — the
// descent re-searches each axis over [domain floor, λ start] in O(log range) probes
// regardless of how tight λ is, so extra λ precision buys nothing the descent doesn't
// already get logarithmically. Four iterations resolve λ to 1/16 of each axis (SPD's
// widest span ≈ 25 raw units → ~2 integers; even flat HP's ≈ 2600-unit span leaves a
// residual the descent absorbs in ~8 probes) while spending 4 instead of 10 probes
// per profile. The λ endpoint is still always a PASSING probe (descent start invariant).
const WATCH_LAMBDA_ITERATIONS: u32 = 4;
// Cap on enumerated substat subsets per placeholder — the SSOT
// SAFEGUARD_SUBSTAT_COMBINATION_CAP shared with the deficit-placeholder emission in
// mod.rs (C(8,4) = 70). Subsets are still RANKED by weight-priority before the cap
// (rank_and_cap_subsets), so a future lower cap automatically keeps the most
// discriminating subsets.
use super::SAFEGUARD_SUBSTAT_COMBINATION_CAP as WATCH_SUBSET_CAP;
// Keep-biased rarity-run merging. Improvement chance is monotone non-decreasing in
// rarity at equal current substats (higher rarities reveal their substats earlier, so
// more of the remaining milestones are value rolls) — merging a contiguous rarity run
// with the component-wise MINIMUM floors therefore keeps every higher-rarity piece
// verified; the cost is keeping some lower-margin pieces of the lower rarities. When
// false only the lossless identical-vector merges happen (documented fallback switch).
const WATCH_RARITY_MERGE_KEEP_BIASED: bool = true;

// ─── perf diagnostics ────────────────────────────────────────────────────────

// Gate for the attach_watch_corners perf diagnostic (pattern reference:
// ImprovementChancePerfDiag in improvement_chance.rs). When true, one formatted
// console line is logged per watch rule plus a totals line per attach call via the
// host hooks below (plus per-probe clock reads for phase attribution). Off by default;
// the counting machinery stays wired for the next perf investigation.
// Measured 2026-07-04 (account-d, lategame, all-improve): attach 36.2s → 34.0s after
// the synthetic-gain memo share + cross-group corner cache (dedupe ceiling only 2.2%),
// then → 25.1s after skipping the redundant d=1 lead profile, coarsening λ to 4
// iterations and switching the integer descent to per-component binary search
// (chance calls 7.09M → 4.50M; λ probes 3.66M → 1.61M).
const WATCH_PERF_DIAG: bool = false;

// Host hooks injected by the wasm crate at module start (console.log + performance.now —
// core cannot bind them itself: wall-clock and console are unavailable on
// wasm32-unknown-unknown without wasm-bindgen). Native/test builds leave them unset:
// counters still accumulate, millisecond fields stay 0, log lines are skipped.
#[derive(Clone, Copy)]
pub struct WatchDiagHooks {
    pub log: fn(&str),
    pub now_ms: fn() -> f64,
}
thread_local! {
    // Cell<Option<..>> of Copy fn pointers — no locking, no allocation.
    static WATCH_DIAG_HOOKS: Cell<Option<WatchDiagHooks>> = const { Cell::new(None) };
}
// Called once by rule_engine_wasm's #[wasm_bindgen(start)] initializer.
pub fn set_watch_diag_hooks(hooks: WatchDiagHooks) {
    WATCH_DIAG_HOOKS.with(|cell| cell.set(Some(hooks)));
}
// Timestamp for phase attribution; 0.0 when no host clock is wired (ms fields stay 0).
fn diag_now_ms() -> f64 {
    WATCH_DIAG_HOOKS.with(|cell| cell.get().map_or(0.0, |hooks| (hooks.now_ms)()))
}
// Console line through the host hook; silently dropped when unwired (host tests).
fn diag_log(line: &str) {
    WATCH_DIAG_HOOKS.with(|cell| {
        if let Some(hooks) = cell.get() {
            (hooks.log)(line);
        }
    });
}

// Probe phases attributed separately in the perf diagnostic.
#[derive(Clone, Copy)]
enum WatchProbePhase {
    // All-maximum cell gate probe (one per (rank, rarity, level, subset) cell).
    Gate,
    // λ binary-search probes (incl. the λ=0 floor short-circuit probe).
    Lambda,
    // Greedy integer-descent probes.
    Descent,
}

// Accumulated counters for one rule (folded into the per-call totals after each entry).
#[derive(Default)]
struct WatchPerfDiag {
    scenario_build_ms: f64,
    placeholders_processed: u64,
    placeholders_removed: u64,
    gate_probes: u64,
    gate_ms: f64,
    lambda_probes: u64,
    lambda_ms: f64,
    descent_probes: u64,
    descent_ms: f64,
    // Total chance evaluations — compute_probability root invocations for level < 16
    // cells plus the direct +16 state checks (both flow through the shared chance helper).
    chance_invocations: u64,
    // Probed (placeholder × rank × rarity × level × subset) cells vs the distinct
    // cross-group signature count — the dedupe ceiling a corner cache can reach.
    cells_total: u64,
    cells_distinct: u64,
    // Cross-group cache hits (cells answered without probing).
    cache_hits: u64,
}

impl WatchPerfDiag {
    // Attribute one probe to its phase (counts always; ms only when a clock is wired).
    fn add_probe(&mut self, phase: WatchProbePhase, elapsed_ms: f64) {
        self.chance_invocations += 1;
        match phase {
            WatchProbePhase::Gate => {
                self.gate_probes += 1;
                self.gate_ms += elapsed_ms;
            }
            WatchProbePhase::Lambda => {
                self.lambda_probes += 1;
                self.lambda_ms += elapsed_ms;
            }
            WatchProbePhase::Descent => {
                self.descent_probes += 1;
                self.descent_ms += elapsed_ms;
            }
        }
    }

    // Fold this rule's counters into the per-call totals.
    fn fold_into(&self, totals: &mut WatchPerfDiag) {
        totals.scenario_build_ms += self.scenario_build_ms;
        totals.placeholders_processed += self.placeholders_processed;
        totals.placeholders_removed += self.placeholders_removed;
        totals.gate_probes += self.gate_probes;
        totals.gate_ms += self.gate_ms;
        totals.lambda_probes += self.lambda_probes;
        totals.lambda_ms += self.lambda_ms;
        totals.descent_probes += self.descent_probes;
        totals.descent_ms += self.descent_ms;
        totals.chance_invocations += self.chance_invocations;
        totals.cells_total += self.cells_total;
        totals.cells_distinct += self.cells_distinct;
        totals.cache_hits += self.cache_hits;
    }

    // One formatted primitives-only line (CLAUDE.md: no raw objects in debug logs).
    fn log_line(&self, label: &str) {
        diag_log(&format!(
            "[watch-perf] {label}: placeholders={} removed={} cells={} distinct={} cacheHits={} probes(gate={} {:.1}ms, lambda={} {:.1}ms, descent={} {:.1}ms) chanceCalls={} scenarioBuild={:.1}ms",
            self.placeholders_processed,
            self.placeholders_removed,
            self.cells_total,
            self.cells_distinct,
            self.cache_hits,
            self.gate_probes,
            self.gate_ms,
            self.lambda_probes,
            self.lambda_ms,
            self.descent_probes,
            self.descent_ms,
            self.chance_invocations,
            self.scenario_build_ms,
        ));
    }
}

// ─── cross-group cell signatures ─────────────────────────────────────────────

// Everything OUTSIDE the (rank, rarity, level, subset) cell axes that can change a
// probe's outcome: the owning rule (its scenarios carry the weights, count modes,
// substat gates, required counts; its thresholds are level-indexed), the group's
// slot/main (legal substat pools, scoring, tie-breaks), and — per scenario — the
// challenger bucket the synthetic's count key selects. The challenger component is the
// SORTED (projected-score in thousandths, rank, mainstat) triple list per scenario:
// scores round to 3 decimals so the integer key stays BTreeMap-friendly; rank and
// mainstat ride along because exact score TIES break on them. Two groups sharing a
// signature therefore see identical probe results for every cell.
#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
struct WatchDimsSignature {
    rule_ordinal: i64,
    slot: i64,
    main_stat: i64,
    challengers: Vec<Vec<(i64, i64, i64)>>,
}

// Interner: the (potentially large) challenger signature collapses to a small integer
// id once per placeholder, so per-cell cache keys stay cheap to build and compare.
#[derive(Default)]
struct WatchDimsInterner {
    ids: BTreeMap<WatchDimsSignature, u64>,
}

impl WatchDimsInterner {
    fn intern(&mut self, signature: WatchDimsSignature) -> u64 {
        let next_id = self.ids.len() as u64;
        *self.ids.entry(signature).or_insert(next_id)
    }
}

// Cell key inside the cross-group corner cache: interned dims id + the cell axes.
type WatchCellKey = (u64, i64, i64, i64, Vec<i64>);
// Per-attach-call cache of probed per-profile floors keyed by distinct cell signature.
type WatchCornerCache = BTreeMap<WatchCellKey, Option<Vec<Vec<i64>>>>;

// ─── watch-rule predicate ────────────────────────────────────────────────────

// A rule participates in corner synthesis only when all three hold: improvements
// activation, a configured chance threshold, and a non-empty substat selection
// (without substats there is no value axis to search along).
pub(super) fn safeguard_rule_is_improvement_watch(rule: &SafeguardWasmRuleIn) -> bool {
    safeguard_is_activation_anticipate_improvements(rule.activation.as_deref().unwrap_or(""))
        && rule.improvement_chance_threshold.is_some()
        && rule.substats.as_ref().map_or(false, |subs| !subs.is_empty())
}

// ─── public entry point ──────────────────────────────────────────────────────

// Post-detection pass: attach corner frontiers to every zero-missing placeholder of an
// improvement-watch rule, removing placeholders for which no viable corner exists.
// `rules` MUST be the full input rule list so prepared rule_order indices align with
// detection rule ordinals (ordinal = rule_order + 1).
pub(super) fn attach_watch_corners(
    detection: &mut SafeguardWasmSnapshotOut,
    rules: &[SafeguardWasmRuleIn],
    rows: &[SafeguardCollectRowIn],
) {
    // Ordinal-keyed lookup of watch rules (1-based ordinal = position in the FULL list).
    let watch_rules_by_ordinal: BTreeMap<i64, &SafeguardWasmRuleIn> = rules
        .iter()
        .enumerate()
        .filter(|(_, rule)| safeguard_rule_is_improvement_watch(rule))
        .map(|(idx, rule)| (idx as i64 + 1, rule))
        .collect();
    if watch_rules_by_ordinal.is_empty() {
        return;
    }
    // Prepare the FULL rules list so rule_order aligns with ordinals, then build the same
    // challenger scenarios detection's improvement-chance pass would see for these rows.
    let attach_started_ms = diag_now_ms();
    let prepared = prepare_upgrade_rules(rules);
    let (scenarios, _idx_by_id) = build_scenarios(rows, &prepared);
    let scenario_build_ms = diag_now_ms() - attach_started_ms;
    // Regroup scenario refs by owning rule ordinal for the per-entry probe calls below.
    let mut scenarios_by_ordinal: BTreeMap<i64, Vec<&UpgradeScenario>> = BTreeMap::new();
    for scenario in &scenarios {
        scenarios_by_ordinal
            .entry(scenario.rule_order as i64 + 1)
            .or_default()
            .push(scenario);
    }
    // One scratch memo reused for its allocation across all probes (cleared per probe
    // inside the chance helper — expected gains depend on the probe's substat values).
    let mut memo: BTreeMap<StateKey, f64> = BTreeMap::new();
    // Cross-group corner cache + dims interner: live for this attach call so identical
    // signature cells across groups (and entries) are counted — and reused — once.
    let mut interner = WatchDimsInterner::default();
    let mut cache = WatchCornerCache::new();
    // Per-call totals; scenario build is attributed once (it is shared by all rules).
    let mut totals = WatchPerfDiag {
        scenario_build_ms,
        ..WatchPerfDiag::default()
    };
    for entry in &mut detection.entries {
        // Resolve the entry's rule by ordinal; non-watch rules pass through untouched.
        let Some(ordinal) = entry.rule_ordinal else {
            continue;
        };
        let Some(rule) = watch_rules_by_ordinal.get(&ordinal).copied() else {
            continue;
        };
        let rule_scenarios: &[&UpgradeScenario] = scenarios_by_ordinal
            .get(&ordinal)
            .map(|list| list.as_slice())
            .unwrap_or(&[]);
        // Resolve the per-level threshold slots once per rule (predicate guarantees Some).
        let Some(thresholds) = rule
            .improvement_chance_threshold
            .clone()
            .map(|threshold| threshold.into_slots_clamped())
        else {
            continue;
        };
        let combination = rule.combination.clone().unwrap_or_default();
        let mut rule_diag = WatchPerfDiag::default();
        // Zero-missing watch placeholders either gain corners or are dropped entirely;
        // deficit (missing > 0) placeholders are never touched.
        entry.placeholders.retain_mut(|placeholder| {
            if placeholder.missing > 0 {
                return true;
            }
            rule_diag.placeholders_processed += 1;
            let corners = compute_watch_corners(
                rule,
                ordinal,
                &combination,
                placeholder,
                rule_scenarios,
                &thresholds,
                &mut memo,
                &mut interner,
                &mut cache,
                &mut rule_diag,
            );
            if corners.is_empty() {
                // Nothing viable clears the bar → drop the placeholder (sell normally).
                rule_diag.placeholders_removed += 1;
                false
            } else {
                placeholder.watch_corners = Some(corners);
                true
            }
        });
        if WATCH_PERF_DIAG {
            rule_diag.log_line(&format!("rule #{ordinal}"));
        }
        rule_diag.fold_into(&mut totals);
    }
    if WATCH_PERF_DIAG {
        totals.log_line("TOTAL");
        diag_log(&format!(
            "[watch-perf] TOTAL attach={:.1}ms",
            diag_now_ms() - attach_started_ms,
        ));
    }
}

// ─── axis / pool resolution ──────────────────────────────────────────────────

// Resolve a rank/rarity probe axis: combination values clamped to the watch window,
// falling back to the given defaults when the dimension is unconstrained or fully
// outside the window. Output is sorted + deduped for deterministic corner order.
fn resolve_watch_axis(selection: &[i64], min: i64, max: i64, defaults: &[i64]) -> Vec<i64> {
    let mut axis: Vec<i64> = selection
        .iter()
        .copied()
        .filter(|value| (min..=max).contains(value))
        .collect();
    if axis.is_empty() {
        axis = defaults.to_vec();
    }
    axis.sort_unstable();
    axis.dedup();
    axis
}

// Physically-possible probe substat pool for the group's dimensions: dedupe, drop
// wildcard/roll-count sentinels, exclude the concrete mainstat, and respect the
// slot's legal substat table (sample slots are always concrete → single-slot filter).
fn resolve_watch_substat_pool(source: &[i64], sample: &SafeguardWasmGroupSample) -> Vec<i64> {
    let slot_filter = safeguard_slot_substat_filter(&[sample.slot]);
    let mut pool = Vec::<i64>::new();
    for &variant in source {
        // Mirror normalize_selected_substats: positive, non-sentinel, unique variants only.
        if variant <= 0 || variant == STAT_VARIANT_ANY || variant == STAT_VARIANT_ROLL_COUNT {
            continue;
        }
        if pool.contains(&variant) {
            continue;
        }
        // Shared possibility predicate (SSOT with merge-time placeholder filtering).
        if !safeguard_placeholder_substat_possible(variant, sample.main_stat, slot_filter) {
            continue;
        }
        pool.push(variant);
    }
    pool
}

// ─── corner computation ──────────────────────────────────────────────────────

// Compute the corner frontier for one zero-missing watch placeholder. Empty result means
// no viable corner exists (caller removes the placeholder → fresh drops sell normally).
#[allow(clippy::too_many_arguments)]
fn compute_watch_corners(
    rule: &SafeguardWasmRuleIn,
    rule_ordinal: i64,
    combination: &SafeguardWasmCombination,
    placeholder: &SafeguardWasmPlaceholderOut,
    scenarios: &[&UpgradeScenario],
    thresholds: &[f64; 4],
    memo: &mut BTreeMap<StateKey, f64>,
    interner: &mut WatchDimsInterner,
    cache: &mut WatchCornerCache,
    diag: &mut WatchPerfDiag,
) -> Vec<SafeguardWatchCornerOut> {
    // No challenger model means the chance recursion has nothing to select against.
    if scenarios.is_empty() {
        return Vec::new();
    }
    // Group dimensions: prefer the detection-attached sample; legacy zero-missing
    // placeholders without one fall back to the deterministic combination default.
    let sample = placeholder
        .sample
        .clone()
        .unwrap_or_else(|| safeguard_default_group_sample(combination));
    // Interned cross-group dims signature for this placeholder (see WatchDimsSignature):
    // groups with equal slot/main + equal per-scenario challenger buckets share cells.
    let dims_id = interner.intern(WatchDimsSignature {
        rule_ordinal,
        slot: sample.slot,
        main_stat: sample.main_stat,
        challengers: scenarios
            .iter()
            .map(|scenario| {
                scenario.challenger_signature_for(
                    sample.slot,
                    sample.set,
                    sample.faction,
                    sample.main_stat,
                )
            })
            .collect(),
    });
    // Rank/rarity probe axes from the rule combination, clamped to the watch windows.
    let ranks = resolve_watch_axis(
        &combination.ranks,
        WATCH_RANK_MIN,
        WATCH_RANK_MAX,
        &WATCH_DEFAULT_RANKS,
    );
    let rarities = resolve_watch_axis(
        &combination.rarities,
        WATCH_RARITY_MIN,
        WATCH_RARITY_MAX,
        &WATCH_DEFAULT_RARITIES,
    );
    // Substat pool: placeholder-scoped variants when present (perSubstat projection),
    // otherwise the rule's full selection — same precedence merge-time emission uses.
    let pool_source: &[i64] = placeholder
        .substat_variants
        .as_deref()
        .filter(|variants| !variants.is_empty())
        .unwrap_or_else(|| rule.substats.as_deref().unwrap_or(&[]));
    let pool = resolve_watch_substat_pool(pool_source, &sample);
    if pool.is_empty() {
        return Vec::new();
    }
    // Subset size from the shared min-count resolver; perSubstat probes singles. A drop
    // holding MORE focus substats than the minimum still matches the M-subset rule and
    // its chance is strictly higher, so probing exactly-M subsets is keep-biased coverage.
    let normalized_match =
        safeguard_normalize_substat_match(rule.substat_match.as_deref().unwrap_or(""));
    let subsets: Vec<Vec<i64>> = if normalized_match == SAFEGUARD_SUBSTAT_PER_SUBSTAT {
        pool.iter().map(|&variant| vec![variant]).collect()
    } else {
        // Clamp to what a single HSF rule can encode (4 substat slots), like merge does.
        let min_count = safeguard_substat_min_count(&normalized_match, pool.len())
            .min(HSF_SUBSTAT_SLOT_COUNT)
            .min(pool.len());
        safeguard_combinations(&pool, min_count)
    };
    // Raw finite rule weights: same map safeguard_weight_for_variant resolves against
    // (missing entries fall back to the canonical default weight of 1.0).
    let weights = rule.substat_weights.clone().unwrap_or_default();
    // Keep only the top-priority subsets so probe cost and export size stay bounded.
    let subsets = rank_and_cap_subsets(subsets, &weights, WATCH_SUBSET_CAP);

    let mut corners = Vec::<SafeguardWatchCornerOut>::new();
    for &rank in &ranks {
        for &level in &WATCH_LEVELS {
            // Threshold for the drop's upgrade stage (level 16 uses the level-12 slot).
            let threshold = thresholds[safeguard_threshold_slot_for_level(level)];
            for subset in &subsets {
                // Probe each rarity of the (rank, level, subset) cell independently,
                // keeping only rarities where the frontier is reachable at all.
                let per_rarity: Vec<(i64, Vec<Vec<i64>>)> = rarities
                    .iter()
                    .filter_map(|&rarity| {
                        // Cross-group corner cache: cells sharing the full signature
                        // (interned dims incl. challenger buckets + the cell axes) are
                        // guaranteed identical probe outcomes — reuse without probing.
                        let cell_key: WatchCellKey =
                            (dims_id, rank, rarity, level, subset.clone());
                        diag.cells_total += 1;
                        if let Some(cached) = cache.get(&cell_key) {
                            diag.cache_hits += 1;
                            return cached.clone().map(|floors| (rarity, floors));
                        }
                        diag.cells_distinct += 1;
                        let floors = probe_subset_profile_floors(
                            subset, &sample, rank, rarity, level, threshold, scenarios,
                            memo, diag,
                        );
                        cache.insert(cell_key, floors.clone());
                        floors.map(|floors| (rarity, floors))
                    })
                    .collect();
                if per_rarity.is_empty() {
                    continue;
                }
                // Profiles correspond across rarities by index (balanced, lead-0, ...),
                // so rarity-run consolidation merges per profile index. The count comes
                // from the probe result — d=1 subsets skip the redundant lead profile.
                let profile_count = per_rarity
                    .first()
                    .map(|(_, floors)| floors.len())
                    .unwrap_or(0);
                for profile_idx in 0..profile_count {
                    let entries: Vec<(i64, Vec<i64>)> = per_rarity
                        .iter()
                        .map(|(rarity, floors)| (*rarity, floors[profile_idx].clone()))
                        .collect();
                    for (run, floors) in
                        merge_rarity_runs(entries, WATCH_RARITY_MERGE_KEEP_BIASED)
                    {
                        corners.push(SafeguardWatchCornerOut {
                            rank,
                            rarities: run,
                            level,
                            substats: subset
                                .iter()
                                .zip(&floors)
                                .map(|(&variant, &floor)| SafeguardWatchCornerSubstatOut {
                                    variant,
                                    // Integer floors emitted as whole-number f64 wire values.
                                    min_value: floor as f64,
                                })
                                .collect(),
                        });
                    }
                }
            }
        }
    }
    // Dedupe/dominance-prune AFTER integerization + rarity merging (integer floors make
    // far more corners collide), then order the survivors deterministically.
    sort_watch_corners(prune_watch_corners(corners), &weights)
}

// Merge one profile's per-rarity integer floor vectors into corner runs. Input entries
// arrive in ascending rarity order; a run only ever grows across NUMERICALLY contiguous
// rarities (gaps in the rule's rarity axis stay split so no unselected rarity is covered).
//   - Identical floor vectors merge losslessly into one run.
//   - With `keep_biased`, differing vectors in a contiguous run merge to the
//     component-wise MINIMUM (see WATCH_RARITY_MERGE_KEEP_BIASED for the soundness
//     argument); otherwise they start a new run (lossless fallback behavior).
fn merge_rarity_runs(
    entries: Vec<(i64, Vec<i64>)>,
    keep_biased: bool,
) -> Vec<(Vec<i64>, Vec<i64>)> {
    let mut runs = Vec::<(Vec<i64>, Vec<i64>)>::new();
    for (rarity, floors) in entries {
        if let Some((run, run_floors)) = runs.last_mut() {
            // Contiguity gate: the incoming rarity must extend the run by exactly one.
            let contiguous = run.last().copied() == Some(rarity - 1);
            if contiguous && (keep_biased || *run_floors == floors) {
                run.push(rarity);
                if keep_biased {
                    // Component-wise minimum keeps every higher-rarity piece verified.
                    for (existing, incoming) in run_floors.iter_mut().zip(&floors) {
                        *existing = (*existing).min(*incoming);
                    }
                }
                continue;
            }
        }
        // Gap or (lossless mode) differing vector: start a fresh run.
        runs.push((vec![rarity], floors));
    }
    runs
}

// ─── subset / corner bounding ────────────────────────────────────────────────

// Priority of a substat variant set = sum of the rule's weights for its members
// (default weight 1.0 for unweighted variants). Shared by subset ranking and the
// corner truncation tie-break so both bounds prefer the same "important" substats.
fn watch_subset_priority(weights: &BTreeMap<i64, f64>, variants: impl Iterator<Item = i64>) -> f64 {
    variants
        .map(|variant| safeguard_weight_for_variant(weights, variant))
        .sum()
}

// Rank subsets by descending weight-sum priority and keep the top `cap`. The sort is
// stable, so equal-priority subsets keep their enumeration order — which follows the
// rule's stable substat-variant order (pool order → combination order). `cap` is a
// parameter so tests can exercise the bound with small values while production passes
// the WATCH_SUBSET_CAP knob.
fn rank_and_cap_subsets(
    mut subsets: Vec<Vec<i64>>,
    weights: &BTreeMap<i64, f64>,
    cap: usize,
) -> Vec<Vec<i64>> {
    subsets.sort_by(|a, b| {
        let priority_a = watch_subset_priority(weights, a.iter().copied());
        let priority_b = watch_subset_priority(weights, b.iter().copied());
        // Descending priority; non-finite weights cannot occur (deserializer filters them).
        priority_b.partial_cmp(&priority_a).unwrap_or(std::cmp::Ordering::Equal)
    });
    subsets.truncate(cap);
    subsets
}

// Order the final corner list deterministically, most valuable corners first:
//   1. level ascending  — drop-time +0 rules matter most: RSL Helper's
//      level-up-then-reevaluate flow hits the low-level milestones first;
//   2. rank descending  — 6★ drops are the realistic quota material;
//   3. rarity run descending (lexicographic on the sorted-ascending run, so runs
//      starting at a higher rarity sort first) — same argument along the rarity axis;
//   4. subset weight-priority descending — highest-weighted substat sets discriminate best.
// The ordering carries no truncation (decision: full-precision watch net); it stays
// valuable regardless — deterministic output keeps downstream
// canonical-key dedupe and export diffs stable across runs.
fn sort_watch_corners(
    mut corners: Vec<SafeguardWatchCornerOut>,
    weights: &BTreeMap<i64, f64>,
) -> Vec<SafeguardWatchCornerOut> {
    corners.sort_by(|a, b| {
        a.level
            .cmp(&b.level)
            .then_with(|| b.rank.cmp(&a.rank))
            .then_with(|| b.rarities.cmp(&a.rarities))
            .then_with(|| {
                // Subset priority derives from the corner's own variant set (SSOT with
                // rank_and_cap_subsets), so no side-channel decoration is needed.
                let priority_a = watch_subset_priority(weights, a.substats.iter().map(|s| s.variant));
                let priority_b = watch_subset_priority(weights, b.substats.iter().map(|s| s.variant));
                priority_b.partial_cmp(&priority_a).unwrap_or(std::cmp::Ordering::Equal)
            })
    });
    corners
}

// Per-variant probe value domain at (rank, level): the floor is a single minimal roll;
// the ceiling assumes a maximal roll at the initial slot plus every milestone ≤ level
// (values stay in the raw stat units SafeguardWasmArtifactIn substats carry).
fn resolve_watch_value_domain(rank: i64, variant: i64, level: i64) -> Option<(f64, f64)> {
    let (roll_min, roll_max) = resolve_roll_range(rank, variant);
    if !(roll_min > 0.0) || !(roll_max > 0.0) {
        // No roll data → the variant cannot be probed meaningfully.
        return None;
    }
    let max_rolls = 1 + ROLL_MILESTONES.iter().filter(|&&m| m <= level).count() as i64;
    Some((roll_min, roll_max * max_rolls as f64))
}

// Probe every profile of one (subset, rank, rarity, level) cell. Returns one verified
// minimal INTEGER floor vector per profile (balanced first, then lead-i in subset order),
// or None when the cell is unreachable (no roll data, or even all-maximum values fail).
#[allow(clippy::too_many_arguments)]
fn probe_subset_profile_floors(
    subset: &[i64],
    sample: &SafeguardWasmGroupSample,
    rank: i64,
    rarity: i64,
    level: i64,
    threshold: f64,
    scenarios: &[&UpgradeScenario],
    memo: &mut BTreeMap<StateKey, f64>,
    diag: &mut WatchPerfDiag,
) -> Option<Vec<Vec<i64>>> {
    // Resolve every variant's (lo, hi) domain; a variant without roll data kills the subset.
    let mut domains = Vec::<(f64, f64)>::with_capacity(subset.len());
    for &variant in subset {
        let domain = resolve_watch_value_domain(rank, variant, level)?;
        domains.push(domain);
    }
    // ONE memo for every probe in this call: scenarios, sample dims, rank, rarity and
    // level are all fixed here, and synthetic probes use value-independent fallback gains
    // (see compute_synthetic_chance_for_scenarios) — so cached recursion nodes stay valid
    // across the gate, every λ-search and every descent step. StateKey distinguishes all
    // remaining variation (probe values), and identical re-probes — e.g. a lead profile
    // whose descent converges onto the balanced profile's floors — become root-level hits.
    memo.clear();
    // Chance probe: synthetic candidate carrying the group dims + the given substat values.
    // id -1 can never collide with a real challenger id, so self-exclusion stays inert.
    let chance_for = |values: &[f64], memo: &mut BTreeMap<StateKey, f64>| -> f64 {
        let artifact = SafeguardWasmArtifactIn {
            id: Some(-1),
            slot: sample.slot,
            set: sample.set,
            rank,
            rarity,
            level,
            exact_level: Some(level),
            faction: sample.faction,
            main_stat: sample.main_stat,
            equipped_in_collection: false,
            equipped_in_vault: false,
            substats: subset
                .iter()
                .zip(values)
                .map(|(&variant, &value)| SafeguardWasmSubstatIn {
                    variant,
                    // Flat bit derived from the variant exactly like HSF sub encoding.
                    is_flat: safeguard_variant_to_sub(variant).1,
                    value,
                    rolls: None,
                })
                .collect(),
        };
        compute_synthetic_chance_for_scenarios(&artifact, scenarios, memo)
    };
    // Phase-attributed probe wrapper: counters always accumulate (cheap u64 adds); the
    // host clock is only consulted while WATCH_PERF_DIAG is on.
    let chance_probed = |values: &[f64],
                         memo: &mut BTreeMap<StateKey, f64>,
                         phase: WatchProbePhase,
                         diag: &mut WatchPerfDiag|
     -> f64 {
        let started_ms = if WATCH_PERF_DIAG { diag_now_ms() } else { 0.0 };
        let chance = chance_for(values, memo);
        let elapsed_ms = if WATCH_PERF_DIAG { diag_now_ms() - started_ms } else { 0.0 };
        diag.add_probe(phase, elapsed_ms);
        chance
    };
    // Gate the whole cell on the all-maximum probe: at λ=1 every profile coincides, so
    // one evaluation decides whether ANY corner can exist here (level 16 included — its
    // deterministic 0/100 chance flows through the same milestones-empty code path).
    let hi_values: Vec<f64> = domains.iter().map(|&(_, hi)| hi).collect();
    if chance_probed(&hi_values, memo, WatchProbePhase::Gate, diag) < threshold {
        return None;
    }
    // Profiles: "balanced" scales every variant together; "lead i" pins variant i at its
    // ceiling and scales the rest — together they trace ≤ d+1 corners of the pass frontier.
    // Single-substat subsets skip the lead profile entirely: with one axis the "lead"
    // anchor (component pinned at hi) is exactly the balanced ray's λ=1 endpoint, so the
    // lead search retraces the balanced one and converges on the same integer floor —
    // identical by construction, so skipping it halves d=1 probe cost losslessly.
    let dims = subset.len();
    let profile_count = if dims == 1 { 1 } else { dims + 1 };
    let mut profile_floors = Vec::<Vec<i64>>::with_capacity(profile_count);
    for profile in 0..profile_count {
        // Value vector at scale factor λ for this profile (profile 0 = balanced).
        let values_at = |lambda: f64| -> Vec<f64> {
            domains
                .iter()
                .enumerate()
                .map(|(idx, &(lo, hi))| {
                    if profile > 0 && idx == profile - 1 {
                        hi
                    } else {
                        lo + lambda * (hi - lo)
                    }
                })
                .collect()
        };
        // Floor short-circuit: when λ=0 already passes, the floor IS the minimal corner.
        let floor = values_at(0.0);
        let best = if chance_probed(&floor, memo, WatchProbePhase::Lambda, diag) >= threshold {
            floor
        } else {
            // Binary-search the minimal passing λ; λ=1 is known-passing from the gate.
            // Track the best PASSING probe so the emitted corner is always a pass.
            let mut lo_lambda = 0.0f64;
            let mut hi_lambda = 1.0f64;
            let mut best = values_at(1.0);
            for _ in 0..WATCH_LAMBDA_ITERATIONS {
                let mid = (lo_lambda + hi_lambda) / 2.0;
                let probe = values_at(mid);
                if chance_probed(&probe, memo, WatchProbePhase::Lambda, diag) >= threshold {
                    hi_lambda = mid;
                    best = probe;
                } else {
                    lo_lambda = mid;
                }
            }
            best
        };
        // Integerize the verified probe: gear substats only roll integers, so fractional
        // thresholds are fake precision. Snapping UP via ceil preserves the verified pass
        // (chance is monotone non-decreasing in every component) — a blind floor() would
        // admit unverified keeps below the frontier — but blind ceil alone could miss an
        // exactly-integer crossing (frontier at 20.0, λ-search converged to 20.01 → ceil
        // demands 21). The binary descent below fixes that by re-probing downwards.
        let mut floors: Vec<i64> = best.iter().map(|value| value.ceil() as i64).collect();
        // Per-component BINARY search for the minimal passing integer over
        // [domain floor, ceil(start)] with the other components fixed, in deterministic
        // subset order (O(log range) probes per component vs the old linear walk).
        // Monotonicity in each component makes the passing set a contiguous upper range,
        // so bisection is exact. The result is *a* verified minimal integer corner —
        // minimal per component given the others, in subset order — not the global
        // Pareto minimum; which corner is reached is (documented) search-path-dependent,
        // but every kept floor is probe-verified and one-below-it fails (or sits at the
        // domain floor, under which no real substat can exist — one minimal roll).
        for idx in 0..dims {
            let domain_floor = domains[idx].0.ceil() as i64;
            // Invariant: `high` always holds a PASSING value for this component (the
            // start vector passes via ceil-monotonicity of the verified λ probe).
            let mut low = domain_floor;
            let mut high = floors[idx];
            while low < high {
                let mid = low + (high - low) / 2; // < high, so progress is guaranteed
                floors[idx] = mid;
                let probe: Vec<f64> = floors.iter().map(|&floor| floor as f64).collect();
                if chance_probed(&probe, memo, WatchProbePhase::Descent, diag) >= threshold {
                    high = mid; // mid verified → tighten the passing upper bound
                } else {
                    low = mid + 1; // mid fails → the minimal integer sits above it
                }
            }
            floors[idx] = high; // minimal verified-passing integer for this component
        }
        profile_floors.push(floors);
    }
    Some(profile_floors)
}

// ─── pruning ─────────────────────────────────────────────────────────────────

// Corner A dominates corner B when both target the SAME (rank, rarity-run, level) cell
// and the same variant set, and every value floor of A is ≤ B's — any piece matching B
// then matches A too, so B is redundant. Rank/level are exact-match HSF gates and the
// rarity run maps onto fixed code sets, so corners on different cells never dominate.
fn watch_corner_dominates(a: &SafeguardWatchCornerOut, b: &SafeguardWatchCornerOut) -> bool {
    if a.rank != b.rank || a.rarities != b.rarities || a.level != b.level {
        return false;
    }
    if a.substats.len() != b.substats.len() {
        return false;
    }
    // Match B's floors by variant; a variant missing on A means the sets differ.
    a.substats.iter().all(|sub_a| {
        b.substats
            .iter()
            .find(|sub_b| sub_b.variant == sub_a.variant)
            .map_or(false, |sub_b| sub_a.min_value <= sub_b.min_value)
    })
}

// Drop duplicates and dominated corners; first-seen wins on exact ties.
fn prune_watch_corners(corners: Vec<SafeguardWatchCornerOut>) -> Vec<SafeguardWatchCornerOut> {
    let mut kept = Vec::<SafeguardWatchCornerOut>::new();
    for corner in corners {
        // Skip the incoming corner when an already-kept one dominates it (incl. duplicates).
        if kept.iter().any(|existing| watch_corner_dominates(existing, &corner)) {
            continue;
        }
        // Remove previously-kept corners the incoming one dominates.
        kept.retain(|existing| !watch_corner_dominates(&corner, existing));
        kept.push(corner);
    }
    kept
}

// ─── tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod improvement_watch_tests {
    use super::*;
    use crate::safeguards::{
        ImprovementChanceThresholdIn, SafeguardWasmCountMode, SafeguardWasmEntryOut,
    };
    use crate::{
        TestItemRaw, ARTIFACT_TYPE_BOOTS, SAFEGUARD_ACTIVATION_ANTICIPATE_IMPROVEMENTS,
        SAFEGUARD_REASON_GROUP, STAT_VARIANT_ACC, STAT_VARIANT_CR, STAT_VARIANT_HP_PERCENT,
        STAT_VARIANT_RES, STAT_VARIANT_SPD,
    };

    const TEST_SET: i64 = 10;

    // Row factory: one boots challenger carrying a single SPD substat at the given value.
    fn make_row(id: i64, rank: i64, rarity: i64, level: i64, spd_value: f64) -> SafeguardCollectRowIn {
        SafeguardCollectRowIn {
            item: TestItemRaw {
                slot: ARTIFACT_TYPE_BOOTS,
                set: TEST_SET,
                rank,
                rarity,
                level,
                faction: None,
                main: Some(STAT_VARIANT_HP_PERCENT),
                sub_values: None,
                item_id: Some(id),
                preview_extras: None,
            },
            base_match_defined: false,
            base_match: None,
            artifact: SafeguardWasmArtifactIn {
                id: Some(id),
                slot: ARTIFACT_TYPE_BOOTS,
                set: TEST_SET,
                rank,
                rarity,
                level,
                exact_level: Some(level),
                faction: 0,
                main_stat: STAT_VARIANT_HP_PERCENT,
                equipped_in_collection: false,
                equipped_in_vault: false,
                substats: vec![SafeguardWasmSubstatIn {
                    variant: STAT_VARIANT_SPD,
                    is_flat: false,
                    value: spd_value,
                    rolls: None,
                }],
            },
        }
    }

    // Watch-rule factory: boots + SPD focus, rank 6 pinned, per-rule counting.
    // `rarities` parameterizes the combination's rarity axis for the merge tests.
    fn make_watch_rule(threshold: f64, rarities: Vec<i64>) -> SafeguardWasmRuleIn {
        SafeguardWasmRuleIn {
            id: Some("watch-rule".to_string()),
            name: Some("Watch".to_string()),
            combination: Some(SafeguardWasmCombination {
                slots: vec![ARTIFACT_TYPE_BOOTS],
                sets: vec![],
                meta_set_names: vec![],
                ranks: vec![6],
                rarities,
                main_stats: vec![],
                factions: vec![],
            }),
            required_count: Some(1),
            activation: Some(SAFEGUARD_ACTIVATION_ANTICIPATE_IMPROVEMENTS.to_string()),
            count_mode: Some(SafeguardWasmCountMode {
                per_rule: true,
                per_set: false,
                per_faction: false,
                per_main_stat: false,
                per_slot: false,
            }),
            ignore_previous_safeguards: None,
            ignore_equipped_in_collection: None,
            ignore_equipped_in_vault: None,
            substats: Some(vec![STAT_VARIANT_SPD]),
            substat_match: Some("1".to_string()),
            substat_weights: None,
            weight_main_stat_by_rank: None,
            improvement_chance_threshold: Some(ImprovementChanceThresholdIn::Array([
                threshold, threshold, threshold, threshold,
            ])),
            tags: None,
        }
    }

    // Snapshot factory: one entry (ordinal 1) holding one zero-missing watch placeholder.
    fn make_snapshot(rule: &SafeguardWasmRuleIn, extra_placeholders: Vec<SafeguardWasmPlaceholderOut>) -> SafeguardWasmSnapshotOut {
        let combination = rule.combination.clone().unwrap_or_default();
        let sample = SafeguardWasmGroupSample {
            slot: ARTIFACT_TYPE_BOOTS,
            set: TEST_SET,
            faction: 0,
            main_stat: STAT_VARIANT_HP_PERCENT,
        };
        let mut placeholders = vec![SafeguardWasmPlaceholderOut {
            combination: combination.clone(),
            missing: 0,
            reason: SAFEGUARD_REASON_GROUP.to_string(),
            substat_variants: Some(vec![STAT_VARIANT_SPD]),
            sample: Some(sample),
            watch_corners: None,
        }];
        placeholders.extend(extra_placeholders);
        SafeguardWasmSnapshotOut {
            scanned_at: 0.0,
            entries: vec![SafeguardWasmEntryOut {
                hash: "watch-hash".to_string(),
                combination,
                rule_id: rule.id.clone(),
                rule_ordinal: Some(1),
                rule_activation: SAFEGUARD_ACTIVATION_ANTICIPATE_IMPROVEMENTS.to_string(),
                count_mode: SafeguardWasmCountMode {
                    per_rule: true,
                    per_set: false,
                    per_faction: false,
                    per_main_stat: false,
                    per_slot: false,
                },
                per_group_required_count: 1,
                groups_tracked: 1,
                required_count: 1,
                current_count: 1,
                projected_count: 1,
                deficit: 0,
                covered_by_existing: true,
                item_keys: vec![],
                artifacts: vec![],
                placeholders,
                candidates: vec![],
            }],
        }
    }

    // Probe helper mirroring the corner probe artifact (SSOT chance recursion re-entry):
    // returns the chance a synthetic drop with the given explicit substat values has for
    // rule ordinal 1 in the corner's cell. Probes at the HIGHEST rarity of the corner's
    // run — the rarity the keep-biased component-min floors are guaranteed verified for.
    fn probe_corner_values(
        rules: &[SafeguardWasmRuleIn],
        rows: &[SafeguardCollectRowIn],
        corner: &SafeguardWatchCornerOut,
        values: &[f64],
    ) -> f64 {
        let prepared = prepare_upgrade_rules(rules);
        let (scenarios, _) = build_scenarios(rows, &prepared);
        let scenario_refs: Vec<&UpgradeScenario> =
            scenarios.iter().filter(|s| s.rule_order == 0).collect();
        let artifact = SafeguardWasmArtifactIn {
            id: Some(-1),
            slot: ARTIFACT_TYPE_BOOTS,
            set: TEST_SET,
            rank: corner.rank,
            rarity: *corner.rarities.last().expect("corner rarity run is never empty"),
            level: corner.level,
            exact_level: Some(corner.level),
            faction: 0,
            main_stat: STAT_VARIANT_HP_PERCENT,
            equipped_in_collection: false,
            equipped_in_vault: false,
            substats: corner
                .substats
                .iter()
                .zip(values)
                .map(|(sub, &value)| SafeguardWasmSubstatIn {
                    variant: sub.variant,
                    is_flat: safeguard_variant_to_sub(sub.variant).1,
                    value,
                    rolls: None,
                })
                .collect(),
        };
        // Fresh memo per call (valid: context is fixed within one call); the synthetic
        // variant keeps the verification gain model identical to production probing.
        let mut memo: BTreeMap<StateKey, f64> = BTreeMap::new();
        compute_synthetic_chance_for_scenarios(&artifact, &scenario_refs, &mut memo)
    }

    // Convenience wrapper: probe at the corner's own floors plus a uniform bump.
    fn probe_chance(rules: &[SafeguardWasmRuleIn], rows: &[SafeguardCollectRowIn], corner: &SafeguardWatchCornerOut, value_bump: f64) -> f64 {
        let values: Vec<f64> = corner
            .substats
            .iter()
            .map(|sub| sub.min_value + value_bump)
            .collect();
        probe_corner_values(rules, rows, corner, &values)
    }

    #[test]
    fn corners_pass_threshold_and_stay_monotone() {
        // One challenger at SPD 20, threshold 50, required 1: a fresh drop is selected
        // once it beats/ties the challenger. Every emitted corner is probe-verified AT
        // its exact integer floors (no rounding slack anymore), and raising any substat
        // value must never drop the chance below the bar (monotonicity sanity).
        let rules = vec![make_watch_rule(50.0, vec![5])];
        let rows = vec![make_row(1, 6, 5, 16, 20.0)];
        let mut snapshot = make_snapshot(&rules[0], vec![]);
        attach_watch_corners(&mut snapshot, &rules, &rows);
        let placeholder = snapshot.entries[0]
            .placeholders
            .first()
            .expect("viable watch placeholder must survive");
        let corners = placeholder
            .watch_corners
            .as_ref()
            .expect("surviving watch placeholder must carry corners");
        assert!(!corners.is_empty(), "at least one corner must exist");
        for corner in corners {
            assert_eq!(corner.rank, 6, "combination pins rank 6");
            assert_eq!(corner.rarities, vec![5], "combination pins rarity 5");
            // Integer floors are verified as-emitted: probe at bump 0 must pass.
            let at_floor = probe_chance(&rules, &rows, corner, 0.0);
            assert!(
                at_floor >= 50.0,
                "corner at level {} must clear the threshold at its exact floors (got {at_floor})",
                corner.level,
            );
            // Brute-force monotonicity: any value increase keeps the corner passing.
            for bump in [1.0, 5.0, 25.0] {
                let bumped = probe_chance(&rules, &rows, corner, bump);
                assert!(
                    bumped >= 50.0,
                    "raising corner values must keep the chance above the bar (level {}, bump {bump}, got {bumped})",
                    corner.level,
                );
            }
        }
        // Level-16 corners are deterministic: the frontier sits exactly at the challenger
        // tie point (SPD 20), and integerization must land on it exactly.
        let level16 = corners.iter().find(|c| c.level == 16).expect("level-16 corner expected");
        assert_eq!(
            level16.substats[0].min_value, 20.0,
            "level-16 corner floor must sit exactly at the integer challenger tie point",
        );
    }

    #[test]
    fn dominated_corners_are_pruned() {
        // Direct pruning semantics: dominance requires the SAME exact-pinned cell
        // (rank/rarity-run/level) and variant set, with every floor less-than-or-equal.
        let corner = |rank: i64, level: i64, variant: i64, value: f64| SafeguardWatchCornerOut {
            rank,
            rarities: vec![5],
            level,
            substats: vec![SafeguardWatchCornerSubstatOut { variant, min_value: value }],
        };
        let pruned = prune_watch_corners(vec![
            corner(6, 8, STAT_VARIANT_SPD, 12.0), // dominated by the 10.0 twin below
            corner(6, 8, STAT_VARIANT_SPD, 10.0),
            corner(6, 8, STAT_VARIANT_SPD, 10.0), // exact duplicate → dropped
            corner(5, 8, STAT_VARIANT_SPD, 12.0), // different rank cell → kept
            corner(6, 4, STAT_VARIANT_SPD, 12.0), // different level cell → kept
            corner(6, 8, STAT_VARIANT_ACC, 12.0), // different variant set → kept
        ]);
        assert_eq!(pruned.len(), 4, "one survivor per cell/variant set");
        let spd_at_8: Vec<&SafeguardWatchCornerOut> = pruned
            .iter()
            .filter(|c| c.rank == 6 && c.level == 8 && c.substats[0].variant == STAT_VARIANT_SPD)
            .collect();
        assert_eq!(spd_at_8.len(), 1, "dominated + duplicate corners collapse to one");
        assert_eq!(spd_at_8[0].substats[0].min_value, 10.0, "the lowest floor survives");
        // Multi-substat dominance: all floors must be ≤ — a mixed pair is incomparable.
        let multi = |spd: f64, res: f64| SafeguardWatchCornerOut {
            rank: 6,
            rarities: vec![5],
            level: 0,
            substats: vec![
                SafeguardWatchCornerSubstatOut { variant: STAT_VARIANT_SPD, min_value: spd },
                SafeguardWatchCornerSubstatOut { variant: STAT_VARIANT_RES, min_value: res },
            ],
        };
        let incomparable = prune_watch_corners(vec![multi(10.0, 20.0), multi(12.0, 18.0)]);
        assert_eq!(incomparable.len(), 2, "mixed floors dominate in neither direction");
        let comparable = prune_watch_corners(vec![multi(10.0, 20.0), multi(12.0, 22.0)]);
        assert_eq!(comparable.len(), 1, "component-wise ≤ prunes the higher corner");
        assert_eq!(comparable[0].substats[0].min_value, 10.0);
    }

    #[test]
    fn subset_cap_keeps_highest_weight_subsets() {
        // Pool of 5 variants, size-2 subsets → C(5,2) = 10 candidates, capped at 8.
        // SPD carries weight 5.0 and CR weight 3.0: seven subsets contain a weighted
        // variant and outrank the three weight-1+1 pairs, so exactly two of those
        // lowest-priority pairs must be the ones dropped (the first survives by
        // stable enumeration order).
        let pool = vec![
            STAT_VARIANT_SPD,
            STAT_VARIANT_CR,
            STAT_VARIANT_ACC,
            STAT_VARIANT_RES,
            STAT_VARIANT_HP_PERCENT,
        ];
        let mut weights = BTreeMap::<i64, f64>::new();
        weights.insert(STAT_VARIANT_SPD, 5.0);
        weights.insert(STAT_VARIANT_CR, 3.0);
        // Explicit small cap (8) — the production WATCH_SUBSET_CAP knob currently sits at
        // merge-parity 70; the parameter keeps the truncation logic under real coverage.
        let subsets = rank_and_cap_subsets(safeguard_combinations(&pool, 2), &weights, 8);
        assert_eq!(subsets.len(), 8, "cap must bound the subset count");
        // Highest-priority subset first: SPD+CR (5.0 + 3.0 = 8.0).
        assert_eq!(subsets[0], vec![STAT_VARIANT_SPD, STAT_VARIANT_CR]);
        // Every SPD subset (priority ≥ 6.0) must survive the cap.
        let spd_count = subsets.iter().filter(|s| s.contains(&STAT_VARIANT_SPD)).count();
        assert_eq!(spd_count, 4, "all subsets holding the heaviest variant survive");
        // All seven weighted subsets survive; only ONE weight-1+1 pair fits the cap —
        // the stable-order first (ACC+RES) — the other two are exactly the dropped ones.
        let unweighted: Vec<&Vec<i64>> = subsets
            .iter()
            .filter(|s| !s.contains(&STAT_VARIANT_SPD) && !s.contains(&STAT_VARIANT_CR))
            .collect();
        assert_eq!(
            unweighted,
            vec![&vec![STAT_VARIANT_ACC, STAT_VARIANT_RES]],
            "the lowest-priority pairs are dropped first; stable order breaks their tie",
        );
        assert_eq!(unweighted[0], subsets.last().expect("cap output is non-empty"), "lowest priority sorts last");
        // Equal-priority subsets keep their stable enumeration order (CR pairs enumerate
        // in pool order: ACC before RES before HP%).
        let cr_pairs: Vec<&Vec<i64>> = subsets
            .iter()
            .filter(|s| s.contains(&STAT_VARIANT_CR) && !s.contains(&STAT_VARIANT_SPD))
            .collect();
        assert_eq!(
            cr_pairs,
            vec![
                &vec![STAT_VARIANT_CR, STAT_VARIANT_ACC],
                &vec![STAT_VARIANT_CR, STAT_VARIANT_RES],
                &vec![STAT_VARIANT_CR, STAT_VARIANT_HP_PERCENT],
            ],
            "ties preserve the stable pool-order enumeration",
        );
    }

    #[test]
    fn corner_sort_orders_low_levels_then_high_rank_and_rarity() {
        // Deterministic output ordering (no truncation — full-precision watch net):
        // level ascending, then rank descending, then rarity descending. 5 levels ×
        // 3 ranks × 4 rarities = 60 corners fed in reverse order must all survive
        // and come back fully re-sorted.
        let mut corners = Vec::<SafeguardWatchCornerOut>::new();
        for &level in &[16i64, 12, 8, 4, 0] {
            for &rank in &[4i64, 5, 6] {
                for &rarity in &[3i64, 4, 5, 6] {
                    corners.push(SafeguardWatchCornerOut {
                        rank,
                        rarities: vec![rarity],
                        level,
                        substats: vec![SafeguardWatchCornerSubstatOut {
                            variant: STAT_VARIANT_SPD,
                            min_value: 10.0,
                        }],
                    });
                }
            }
        }
        let weights = BTreeMap::<i64, f64>::new();
        let sorted = sort_watch_corners(corners, &weights);
        assert_eq!(sorted.len(), 60, "sorting must never drop corners");
        // Deterministic head: lowest level first, then highest rank, then highest rarity.
        assert_eq!((sorted[0].level, sorted[0].rank, sorted[0].rarities[0]), (0, 6, 6));
        assert_eq!((sorted[1].level, sorted[1].rank, sorted[1].rarities[0]), (0, 6, 5));
        // Rank descends before rarity within a level block (rank 5 starts after 4 rarities).
        assert_eq!((sorted[4].level, sorted[4].rank, sorted[4].rarities[0]), (0, 5, 6));
        // Level ascends across blocks: the second block (indices 12..) is level 4,
        // and the final block (indices 48..) is the level-16 tail.
        assert_eq!(sorted[12].level, 4);
        assert_eq!(sorted[48].level, 16);
        // Subset-priority tie-break: with equal cells, the heavier variant set sorts first.
        let mut spd_weights = BTreeMap::<i64, f64>::new();
        spd_weights.insert(STAT_VARIANT_SPD, 5.0);
        let cell = |variant: i64| SafeguardWatchCornerOut {
            rank: 6,
            rarities: vec![6],
            level: 0,
            substats: vec![SafeguardWatchCornerSubstatOut { variant, min_value: 10.0 }],
        };
        let tied = sort_watch_corners(vec![cell(STAT_VARIANT_ACC), cell(STAT_VARIANT_SPD)], &spd_weights);
        assert_eq!(
            tied[0].substats[0].variant, STAT_VARIANT_SPD,
            "equal cells order by descending subset weight priority",
        );
    }

    #[test]
    fn unreachable_threshold_removes_placeholder_but_keeps_deficit_ones() {
        // An overwhelming challenger (SPD 500 projected) makes even all-maximum probes
        // fail the bar → the zero-missing placeholder must be REMOVED (sell normally),
        // while a deficit (missing > 0) placeholder in the same entry stays untouched.
        let rules = vec![make_watch_rule(50.0, vec![5])];
        let rows = vec![make_row(1, 6, 5, 16, 500.0)];
        let deficit_placeholder = SafeguardWasmPlaceholderOut {
            combination: rules[0].combination.clone().unwrap_or_default(),
            missing: 2,
            reason: SAFEGUARD_REASON_GROUP.to_string(),
            substat_variants: Some(vec![STAT_VARIANT_SPD]),
            sample: None,
            watch_corners: None,
        };
        let mut snapshot = make_snapshot(&rules[0], vec![deficit_placeholder]);
        attach_watch_corners(&mut snapshot, &rules, &rows);
        let placeholders = &snapshot.entries[0].placeholders;
        assert_eq!(placeholders.len(), 1, "only the deficit placeholder may survive");
        assert_eq!(placeholders[0].missing, 2, "deficit placeholders pass through untouched");
        assert!(placeholders[0].watch_corners.is_none(), "deficit placeholders never gain corners");
    }

    // Brute-force minimal integer SPD floor for a (rank, rarity, level) probe cell:
    // linear scan upward over the integer domain, returning the first passing value.
    // Ground truth for the greedy-descent verification below (single-substat subset,
    // so per-component descent and the global minimum coincide).
    fn brute_force_min_integer_floor(
        rules: &[SafeguardWasmRuleIn],
        rows: &[SafeguardCollectRowIn],
        rank: i64,
        rarity: i64,
        level: i64,
        threshold: f64,
    ) -> Option<i64> {
        let (lo, hi) = resolve_watch_value_domain(rank, STAT_VARIANT_SPD, level)?;
        let probe_corner = |value: i64| SafeguardWatchCornerOut {
            rank,
            rarities: vec![rarity],
            level,
            substats: vec![SafeguardWatchCornerSubstatOut {
                variant: STAT_VARIANT_SPD,
                min_value: value as f64,
            }],
        };
        ((lo.ceil() as i64)..=(hi as i64))
            .find(|&value| probe_chance(rules, rows, &probe_corner(value), 0.0) >= threshold)
    }

    #[test]
    fn corner_floors_are_integers_matching_brute_force_minimum() {
        // Integerization: every emitted min_value must be a whole number, and on this
        // single-substat fixture the greedy descent must land exactly on the brute-force
        // minimal passing integer for each probed level.
        let rules = vec![make_watch_rule(50.0, vec![5])];
        let rows = vec![make_row(1, 6, 5, 16, 20.0)];
        let mut snapshot = make_snapshot(&rules[0], vec![]);
        attach_watch_corners(&mut snapshot, &rules, &rows);
        let corners = snapshot.entries[0].placeholders[0]
            .watch_corners
            .clone()
            .expect("corners expected");
        for corner in &corners {
            for sub in &corner.substats {
                assert_eq!(
                    sub.min_value.fract(),
                    0.0,
                    "all corner floors must be whole numbers (level {}, got {})",
                    corner.level,
                    sub.min_value,
                );
            }
            // Descent result must equal the brute-force minimal integer for the cell.
            let expected = brute_force_min_integer_floor(&rules, &rows, corner.rank, 5, corner.level, 50.0)
                .expect("brute force must find a passing integer where a corner exists");
            assert_eq!(
                corner.substats[0].min_value, expected as f64,
                "greedy descent must match brute-force minimum (level {})",
                corner.level,
            );
        }
        // The deterministic level-16 cell: challenger tie point at exactly 20.
        let level16 = corners.iter().find(|c| c.level == 16).expect("level-16 corner expected");
        assert_eq!(level16.substats[0].min_value, 20.0);
    }

    #[test]
    fn corners_are_verified_minimal_integers_per_component() {
        // Two-substat rule (SPD+RES, min-count 2): the multi-axis case where binary
        // descent's per-component minimality is non-trivial. Post-conditions asserted on
        // EVERY corner: whole-number floors, the corner itself passes the threshold, and
        // decrementing any single component by 1 (others fixed) FAILS the probe — unless
        // that component already sits at its domain floor (one minimal roll), below which
        // no real substat can exist. Single-rarity fixture on purpose: keep-biased
        // rarity-run merging may deliberately place merged floors below any single
        // rarity's frontier, which would void the per-component decrement assertion.
        let mut two_sub_rule = make_watch_rule(50.0, vec![5]);
        two_sub_rule.substats = Some(vec![STAT_VARIANT_SPD, STAT_VARIANT_RES]);
        two_sub_rule.substat_match = Some("2".to_string());
        let rules = vec![two_sub_rule];
        // Challenger carries BOTH focus substats so it matches the min-count-2 gate.
        let mut challenger = make_row(1, 6, 5, 16, 20.0);
        challenger.artifact.substats.push(SafeguardWasmSubstatIn {
            variant: STAT_VARIANT_RES,
            is_flat: false,
            value: 30.0,
            rolls: None,
        });
        let rows = vec![challenger];
        let mut snapshot = make_snapshot(&rules[0], vec![]);
        // Let the probe pool fall back to the rule's full two-substat selection.
        snapshot.entries[0].placeholders[0].substat_variants = None;
        attach_watch_corners(&mut snapshot, &rules, &rows);
        let corners = snapshot.entries[0].placeholders[0]
            .watch_corners
            .clone()
            .expect("two-substat fixture must produce corners");
        assert!(!corners.is_empty());
        for corner in &corners {
            assert_eq!(corner.substats.len(), 2, "min-count 2 emits two-substat corners");
            let values: Vec<f64> = corner.substats.iter().map(|sub| sub.min_value).collect();
            for value in &values {
                assert_eq!(value.fract(), 0.0, "corner floors must be whole numbers");
            }
            // The corner is probe-verified exactly as emitted.
            let at_floor = probe_corner_values(&rules, &rows, corner, &values);
            assert!(
                at_floor >= 50.0,
                "corner (level {}) must pass at its exact floors (got {at_floor})",
                corner.level,
            );
            // Per-component minimality: one integer lower on any axis breaks the pass.
            for idx in 0..values.len() {
                let variant = corner.substats[idx].variant;
                let (domain_lo, _) =
                    resolve_watch_value_domain(corner.rank, variant, corner.level)
                        .expect("probed variants always have roll data");
                if values[idx] <= domain_lo.ceil() {
                    // Descent never goes below one minimal roll — nothing to assert.
                    continue;
                }
                let mut lowered = values.clone();
                lowered[idx] -= 1.0;
                let below = probe_corner_values(&rules, &rows, corner, &lowered);
                assert!(
                    below < 50.0,
                    "lowering component {idx} (variant {variant}) by 1 must fail at level {} (got {below})",
                    corner.level,
                );
            }
        }
    }

    #[test]
    fn cross_group_cache_reuses_identical_signatures_only() {
        // Two groups with IDENTICAL signatures (same rule, dims and challenger bucket)
        // must produce identical corners with the second group served from the cache;
        // a differing challenger pool must NOT share cells (and yields different floors).
        let rules = vec![make_watch_rule(50.0, vec![5])];
        let thresholds = [50.0, 50.0, 50.0, 50.0];
        let combination = rules[0].combination.clone().unwrap_or_default();
        let placeholder = make_snapshot(&rules[0], vec![]).entries[0].placeholders[0].clone();
        let prepared = prepare_upgrade_rules(&rules);
        // Challenger pool A: one boots at SPD 20.
        let rows_a = vec![make_row(1, 6, 5, 16, 20.0)];
        let (scenarios_a, _) = build_scenarios(&rows_a, &prepared);
        let refs_a: Vec<&UpgradeScenario> = scenarios_a.iter().collect();
        let mut memo: BTreeMap<StateKey, f64> = BTreeMap::new();
        let mut interner = WatchDimsInterner::default();
        let mut cache = WatchCornerCache::new();
        let mut diag = WatchPerfDiag::default();
        let first = compute_watch_corners(
            &rules[0], 1, &combination, &placeholder, &refs_a, &thresholds,
            &mut memo, &mut interner, &mut cache, &mut diag,
        );
        assert!(!first.is_empty(), "fixture must produce corners");
        assert_eq!(diag.cache_hits, 0, "first group probes every cell");
        let cells_after_first = diag.cells_total;
        // Second group, identical signature: every cell answered from the cache.
        let second = compute_watch_corners(
            &rules[0], 1, &combination, &placeholder, &refs_a, &thresholds,
            &mut memo, &mut interner, &mut cache, &mut diag,
        );
        assert_eq!(first, second, "identical-signature groups get identical corners");
        assert_eq!(
            diag.cache_hits,
            cells_after_first,
            "every cell of the identical group must be a cache hit",
        );
        let probes_after_second = diag.chance_invocations;
        // Different challenger pool (SPD 25): signature differs → no reuse, new floors.
        let rows_b = vec![make_row(2, 6, 5, 16, 25.0)];
        let (scenarios_b, _) = build_scenarios(&rows_b, &prepared);
        let refs_b: Vec<&UpgradeScenario> = scenarios_b.iter().collect();
        let third = compute_watch_corners(
            &rules[0], 1, &combination, &placeholder, &refs_b, &thresholds,
            &mut memo, &mut interner, &mut cache, &mut diag,
        );
        assert_eq!(
            diag.cache_hits, cells_after_first,
            "differing challenger signatures must not share cached cells",
        );
        assert!(
            diag.chance_invocations > probes_after_second,
            "the differing group must probe fresh cells",
        );
        // The stronger challenger raises the level-16 tie point from 20 to 25.
        let tie_16 = third.iter().find(|c| c.level == 16).expect("level-16 corner expected");
        assert_eq!(tie_16.substats[0].min_value, 25.0);
    }

    #[test]
    fn identical_vector_rarity_merge_is_lossless() {
        // Rarities 5 and 6 share an empty addition schedule, so their frontiers coincide
        // at EVERY level: the per-rarity corners merge losslessly into one [5, 6] run
        // with unchanged floors (level-16 tie point stays exactly 20).
        let rules = vec![make_watch_rule(50.0, vec![5, 6])];
        let rows = vec![make_row(1, 6, 5, 16, 20.0)];
        let mut snapshot = make_snapshot(&rules[0], vec![]);
        attach_watch_corners(&mut snapshot, &rules, &rows);
        let corners = snapshot.entries[0].placeholders[0]
            .watch_corners
            .clone()
            .expect("corners expected");
        assert!(!corners.is_empty(), "at least one merged corner must exist");
        assert!(
            corners.iter().all(|c| c.rarities == vec![5, 6]),
            "identical per-rarity vectors must merge into the full contiguous run",
        );
        let level16 = corners.iter().find(|c| c.level == 16).expect("level-16 corner expected");
        assert_eq!(
            level16.substats[0].min_value, 20.0,
            "lossless merge must not alter the shared floor",
        );
    }

    #[test]
    fn keep_biased_merge_takes_component_minimum() {
        // Direct merge semantics. Rarity 4's frontier (24) sits above rarity 5/6's (20):
        // keep-biased merges the whole contiguous run to the component-wise minimum,
        // while a rarity gap must always split runs regardless of the flag.
        let merged = merge_rarity_runs(
            vec![(4, vec![24]), (5, vec![20]), (6, vec![20])],
            true,
        );
        assert_eq!(
            merged,
            vec![(vec![4, 5, 6], vec![20])],
            "keep-biased merge collapses the contiguous run onto the component-wise min",
        );
        // Component-wise: mixed vectors take the min per component, not per vector.
        let mixed = merge_rarity_runs(vec![(4, vec![24, 10]), (5, vec![20, 12])], true);
        assert_eq!(mixed, vec![(vec![4, 5], vec![20, 10])]);
        // Non-contiguous rarity axes never merge across the gap (rarity 4 not selected).
        let gapped = merge_rarity_runs(vec![(3, vec![24]), (5, vec![20])], true);
        assert_eq!(gapped, vec![(vec![3], vec![24]), (vec![5], vec![20])]);
    }

    #[test]
    fn lossless_only_flag_keeps_differing_rarity_vectors_separate() {
        // Fallback switch (WATCH_RARITY_MERGE_KEEP_BIASED = false path): differing
        // vectors split the run; identical contiguous tails still merge losslessly.
        let runs = merge_rarity_runs(
            vec![(4, vec![24]), (5, vec![20]), (6, vec![20])],
            false,
        );
        assert_eq!(
            runs,
            vec![(vec![4], vec![24]), (vec![5, 6], vec![20])],
            "lossless mode only merges identical vectors; differing rarity 4 stays separate",
        );
    }
}
