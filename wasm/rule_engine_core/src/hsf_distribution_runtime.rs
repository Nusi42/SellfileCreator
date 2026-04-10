use super::*;

// hsfBuilder.ts::rollDistributions (leftmost dimension increments first).

// Aggregate gates for distribution filtering mirror the JS builder modes:
// strict (>= now), feasible-by-target (>= now OR recoverable by remaining),
// or disabled (no aggregate filter).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DistributionAggregateMode {
    None,
    GteNow,
    FeasibleByTarget,
}

// Parse numeric mode tokens from JS payloads into an enum so the filter loop
// does not branch on magic numbers repeatedly.
pub(crate) fn parse_distribution_mode(raw: i32) -> DistributionAggregateMode {
    match raw {
        1 => DistributionAggregateMode::GteNow,
        2 => DistributionAggregateMode::FeasibleByTarget,
        _ => DistributionAggregateMode::None,
    }
}

// Apply aggregate gate semantics shared by global and locked minimum checks.
fn distribution_sum_passes_mode(
    sum: i32,
    required_min: i32,
    remaining: i32,
    mode: DistributionAggregateMode,
) -> bool {
    if required_min <= 0 {
        return true;
    }
    match mode {
        DistributionAggregateMode::None => true,
        DistributionAggregateMode::GteNow => sum >= required_min,
        DistributionAggregateMode::FeasibleByTarget => {
            if sum >= required_min {
                true
            } else {
                let shortfall = required_min - sum;
                shortfall <= remaining.max(0)
            }
        }
    }
}

// Enumerate combinations by index order to mirror TS helper ordering.
fn enumerate_combinations_i32(
    values: &[i32],
    pick: usize,
    start: usize,
    path: &mut Vec<i32>,
    out: &mut Vec<Vec<i32>>,
) {
    if path.len() == pick {
        out.push(path.clone());
        return;
    }
    let mut idx = start;
    while idx < values.len() {
        path.push(values[idx]);
        enumerate_combinations_i32(values, pick, idx + 1, path, out);
        path.pop();
        idx += 1;
    }
}

// Enumerate permutations in deterministic index order (same as TS backtracking).
fn enumerate_permutations_i32(values: &[i32], used: &mut Vec<bool>, path: &mut Vec<i32>, out: &mut Vec<Vec<i32>>) {
    if path.len() == values.len() {
        out.push(path.clone());
        return;
    }
    let mut idx = 0;
    while idx < values.len() {
        if used[idx] {
            idx += 1;
            continue;
        }
        used[idx] = true;
        path.push(values[idx]);
        enumerate_permutations_i32(values, used, path, out);
        path.pop();
        used[idx] = false;
        idx += 1;
    }
}

// Compact input payload keeps the filtered-distribution call site readable
// while preserving a single core implementation for all wrappers.
pub(crate) struct FilterRollDistributionsIn<'a> {
    pub(crate) dimensions: i32,
    pub(crate) total: i32,
    pub(crate) max_caps: &'a [Option<i32>],
    pub(crate) min_floors: &'a [Option<i32>],
    pub(crate) timeline_caps: &'a [Option<i32>],
    pub(crate) targeted_mask: &'a [bool],
    pub(crate) targeted_exact: Option<i32>,
    pub(crate) deficit_floors: &'a [Option<i32>],
    pub(crate) deficit_max: Option<i32>,
    pub(crate) global_min: i32,
    pub(crate) global_remaining: i32,
    pub(crate) global_filter: DistributionAggregateMode,
    pub(crate) locked_mask: &'a [bool],
    pub(crate) locked_min: i32,
    pub(crate) locked_remaining: i32,
    pub(crate) locked_filter: DistributionAggregateMode,
}

// Shared immutable recursion context avoids threading many independent arrays.
struct DistributionFilterCtx<'a> {
    dims: usize,
    max_caps: &'a [Option<i32>],
    min_floors: &'a [Option<i32>],
    timeline_caps: &'a [Option<i32>],
    targeted_mask: &'a [bool],
    targeted_exact: Option<i32>,
    deficit_floors: &'a [Option<i32>],
    deficit_max: Option<i32>,
    global_min: i32,
    global_remaining: i32,
    global_filter: DistributionAggregateMode,
    locked_mask: &'a [bool],
    locked_min: i32,
    locked_remaining: i32,
    locked_filter: DistributionAggregateMode,
}

// Mutable recursion state keeps running aggregates compact and explicit.
#[derive(Debug, Clone, Copy)]
struct DistributionFilterState {
    targeted_sum: i32,
    locked_sum: i32,
    deficit_sum: i32,
}

// Recursive filter avoids materializing all compositions up front.
// This keeps heap churn low in hot hsfBuilder call sites.
fn backtrack_filtered(
    idx: usize,
    remaining: i32,
    state: DistributionFilterState,
    acc: &mut Vec<i32>,
    out: &mut Vec<Vec<i32>>,
    ctx: &DistributionFilterCtx<'_>,
) {
    if let Some(targeted_exact_sum) = ctx.targeted_exact {
        if state.targeted_sum > targeted_exact_sum {
            return;
        }
    }
    if let Some(max_deficit) = ctx.deficit_max {
        if state.deficit_sum > max_deficit {
            return;
        }
    }
    if idx == ctx.dims - 1 {
        let value = remaining;
        if value < 0 {
            return;
        }
        if let Some(Some(cap)) = ctx.max_caps.get(idx) {
            if value > *cap {
                return;
            }
        }
        if let Some(Some(floor)) = ctx.min_floors.get(idx) {
            if value < *floor {
                return;
            }
        }
        if let Some(Some(cap)) = ctx.timeline_caps.get(idx) {
            if value > *cap {
                return;
            }
        }
        let targeted_sum = state.targeted_sum
            + if ctx.targeted_mask.get(idx).copied().unwrap_or(false) {
                value
            } else {
                0
            };
        if let Some(targeted_exact_sum) = ctx.targeted_exact {
            if targeted_sum != targeted_exact_sum {
                return;
            }
        }
        if !distribution_sum_passes_mode(
            targeted_sum,
            ctx.global_min,
            ctx.global_remaining,
            ctx.global_filter,
        ) {
            return;
        }
        let next_deficit = state.deficit_sum
            + match ctx.deficit_floors.get(idx).copied().flatten() {
                Some(floor) if value < floor => floor - value,
                _ => 0,
            };
        if let Some(max_deficit) = ctx.deficit_max {
            if next_deficit > max_deficit {
                return;
            }
        }
        let locked_sum = state.locked_sum
            + if ctx.locked_mask.get(idx).copied().unwrap_or(false) {
                value
            } else {
                0
            };
        if !distribution_sum_passes_mode(
            locked_sum,
            ctx.locked_min,
            ctx.locked_remaining,
            ctx.locked_filter,
        ) {
            return;
        }
        let mut row = acc.clone();
        row.push(value);
        out.push(row);
        return;
    }

    let mut value = 0;
    while value <= remaining {
        if let Some(Some(cap)) = ctx.max_caps.get(idx) {
            if value > *cap {
                value += 1;
                continue;
            }
        }
        if let Some(Some(floor)) = ctx.min_floors.get(idx) {
            if value < *floor {
                value += 1;
                continue;
            }
        }
        if let Some(Some(cap)) = ctx.timeline_caps.get(idx) {
            if value > *cap {
                value += 1;
                continue;
            }
        }
        let next_state = DistributionFilterState {
            targeted_sum: state.targeted_sum
                + if ctx.targeted_mask.get(idx).copied().unwrap_or(false) {
                    value
                } else {
                    0
                },
            locked_sum: state.locked_sum
                + if ctx.locked_mask.get(idx).copied().unwrap_or(false) {
                    value
                } else {
                    0
                },
            deficit_sum: state.deficit_sum
                + match ctx.deficit_floors.get(idx).copied().flatten() {
                    Some(floor) if value < floor => floor - value,
                    _ => 0,
                },
        };
        acc.push(value);
        backtrack_filtered(idx + 1, remaining - value, next_state, acc, out, ctx);
        acc.pop();
        value += 1;
    }
}

// Shared filtering core for distribution helpers (JSON and fast array variants).
pub(crate) fn filter_roll_distributions_core(input: &FilterRollDistributionsIn<'_>) -> Vec<Vec<i32>> {
    if input.dimensions <= 0 {
        return if input.total == 0 {
            vec![Vec::<i32>::new()]
        } else {
            Vec::<Vec<i32>>::new()
        };
    }
    if input.total < 0 {
        return Vec::<Vec<i32>>::new();
    }

    let dims = input.dimensions as usize;
    let mut out = Vec::<Vec<i32>>::new();
    let mut acc = Vec::<i32>::new();

    let ctx = DistributionFilterCtx {
        dims,
        max_caps: input.max_caps,
        min_floors: input.min_floors,
        timeline_caps: input.timeline_caps,
        targeted_mask: input.targeted_mask,
        targeted_exact: input.targeted_exact,
        deficit_floors: input.deficit_floors,
        deficit_max: input.deficit_max,
        global_min: input.global_min,
        global_remaining: input.global_remaining,
        global_filter: input.global_filter,
        locked_mask: input.locked_mask,
        locked_min: input.locked_min,
        locked_remaining: input.locked_remaining,
        locked_filter: input.locked_filter,
    };
    let initial_state = DistributionFilterState {
        targeted_sum: 0,
        locked_sum: 0,
        deficit_sum: 0,
    };
    backtrack_filtered(0, input.total, initial_state, &mut acc, &mut out, &ctx);
    out
}

// Shared combinations core to serve JSON and fast-array bindings.
pub fn compute_combinations_i32(values: &[i32], pick: i32) -> Vec<Vec<i32>> {
    if pick <= 0 {
        return vec![Vec::<i32>::new()];
    }
    let pick_usize = pick as usize;
    if pick_usize > values.len() {
        return Vec::<Vec<i32>>::new();
    }
    let mut out = Vec::<Vec<i32>>::new();
    let mut path = Vec::<i32>::new();
    enumerate_combinations_i32(values, pick_usize, 0, &mut path, &mut out);
    out
}

// Shared permutations core to serve JSON and fast-array bindings.
pub fn compute_permutations_i32(values: &[i32]) -> Vec<Vec<i32>> {
    if values.len() <= 1 {
        return vec![values.to_vec()];
    }
    let mut out = Vec::<Vec<i32>>::new();
    let mut used = vec![false; values.len()];
    let mut path = Vec::<i32>::new();
    enumerate_permutations_i32(values, &mut used, &mut path, &mut out);
    out
}

// Enumerate bounded compositions in deterministic index order.

// Shared bounded-compositions core for late-mode extra allocation loops.

// Enumerate bounded compositions and keep only rows that satisfy additional
// locked/optional filters used by late-mode HSF emission loops.
struct FilteredBoundedRowsCtx<'a> {
    need_now: &'a [i32],
    locked_mask: &'a [u8],
    locked_base_sum: i32,
    locked_min_at_level: i32,
    optional_mask: &'a [u8],
    mins: &'a [i32],
    skip_optional_baseline: bool,
}

struct FilteredBoundedRowsIn<'a> {
    caps: &'a [i32],
    total: i32,
    need_now: &'a [i32],
    locked_mask: &'a [u8],
    locked_base_sum: i32,
    locked_min_at_level: i32,
    optional_mask: &'a [u8],
    mins: &'a [i32],
    skip_optional_baseline: bool,
}

fn enumerate_filtered_bounded_rows_with_offset_i32(
    idx: usize,
    total: i32,
    path: &mut Vec<i32>,
    out: &mut Vec<Vec<i32>>,
    caps: &[i32],
    ctx: &FilteredBoundedRowsCtx<'_>,
) {
    if idx == caps.len() {
        if total != 0 {
            return;
        }
        if ctx.locked_min_at_level > 0 {
            let mut locked_after = ctx.locked_base_sum;
            for (i, value) in path.iter().enumerate() {
                if *ctx.locked_mask.get(i).unwrap_or(&0) != 0 {
                    locked_after += *value;
                }
            }
            if locked_after < ctx.locked_min_at_level {
                return;
            }
        }
        if ctx.skip_optional_baseline {
            let mut optional_only_baseline = true;
            let mut has_optional = false;
            for (i, value) in path.iter().enumerate() {
                if *ctx.optional_mask.get(i).unwrap_or(&0) == 0 {
                    continue;
                }
                has_optional = true;
                if *ctx.mins.get(i).unwrap_or(&0) != 0 {
                    optional_only_baseline = false;
                    break;
                }
                let applied = ctx.need_now.get(i).copied().unwrap_or(0) + *value;
                if applied != 0 {
                    optional_only_baseline = false;
                    break;
                }
            }
            if has_optional && optional_only_baseline {
                return;
            }
        }
        let mut row = Vec::<i32>::with_capacity(path.len());
        for (i, value) in path.iter().enumerate() {
            row.push(ctx.need_now.get(i).copied().unwrap_or(0) + *value);
        }
        out.push(row);
        return;
    }
    if total < 0 {
        return;
    }
    let cap = std::cmp::max(0, caps[idx]);
    let max_take = std::cmp::min(cap, total);
    let mut value = 0;
    while value <= max_take {
        path.push(value);
        enumerate_filtered_bounded_rows_with_offset_i32(
            idx + 1,
            total - value,
            path,
            out,
            caps,
            ctx,
        );
        path.pop();
        value += 1;
    }
}

fn compute_filtered_bounded_rows_with_offset_i32(input: &FilteredBoundedRowsIn<'_>) -> Vec<Vec<i32>> {
    if input.total < 0 {
        return Vec::<Vec<i32>>::new();
    }
    if input.caps.is_empty() {
        return if input.total == 0 {
            vec![Vec::<i32>::new()]
        } else {
            Vec::<Vec<i32>>::new()
        };
    }
    if input.need_now.len() != input.caps.len() {
        return Vec::<Vec<i32>>::new();
    }
    let mut out = Vec::<Vec<i32>>::new();
    let mut path = Vec::<i32>::with_capacity(input.caps.len());
    let ctx = FilteredBoundedRowsCtx {
        need_now: input.need_now,
        locked_mask: input.locked_mask,
        locked_base_sum: input.locked_base_sum,
        locked_min_at_level: input.locked_min_at_level,
        optional_mask: input.optional_mask,
        mins: input.mins,
        skip_optional_baseline: input.skip_optional_baseline,
    };
    enumerate_filtered_bounded_rows_with_offset_i32(
        0,
        input.total,
        &mut path,
        &mut out,
        input.caps,
        &ctx,
    );
    out
}

// Convert optional max-cap sentinel into a concrete cap used by late-mode math.
fn late_rows_resolve_cap(raw: i32) -> i32 {
    if raw <= FILTER_OPTION_NONE_I32 {
        SUBSTAT_SLOT_COUNT as i32
    } else {
        raw.clamp(0, SUBSTAT_SLOT_COUNT as i32)
    }
}

// Build per-index late need-now floors and validate they fit configured caps.
fn late_rows_build_need_now(
    mins: &[i32],
    max_caps: &[i32],
    any_flags: &[u8],
    remaining: i32,
) -> Option<(Vec<i32>, i32)> {
    let mut need_now = Vec::<i32>::with_capacity(mins.len());
    let mut sum_need = 0i32;
    for (idx, min_value) in mins.iter().copied().enumerate() {
        let cap = late_rows_resolve_cap(*max_caps.get(idx).unwrap_or(&FILTER_OPTION_NONE_I32));
        let any_flag = *any_flags.get(idx).unwrap_or(&0) != 0;
        let need = if any_flag {
            0
        } else {
            (min_value - remaining).max(0)
        };
        // Over-cap need rows are infeasible and produce no candidates.
        if need > cap {
            return None;
        }
        need_now.push(need);
        sum_need += need;
    }
    Some((need_now, sum_need))
}

// Build late-mode bounded candidate rows for targeted or strict branches.
// Kept as a pure core helper so multiple exports can reuse identical logic.
pub(crate) fn build_hsf_late_bounded_rows_core(input: &BuildHsfLateBoundedRowsIn) -> Vec<Vec<i32>> {
    // Empty mins produce no bounded rows.
    if input.mins.is_empty() {
        return Vec::<Vec<i32>>::new();
    }
    // Need-now floors are shared across late branch modes.
    let Some((need_now, sum_need)) = late_rows_build_need_now(
        &input.mins,
        &input.max_caps,
        &input.any_flags,
        input.remaining,
    ) else {
        return Vec::<Vec<i32>>::new();
    };
    let mode = input.mode.trim().to_ascii_lowercase();
    let m = input.mins.len();
    let mut add_caps = vec![0i32; m];
    let extra: i32;
    // Locked feasibility gate is shared for both late modes.
    let base_locked_need = (0..m)
        .map(|idx| {
            if *input.locked_mask.get(idx).unwrap_or(&0) != 0 {
                need_now[idx]
            } else {
                0
            }
        })
        .sum::<i32>();
    let locked_need_at_level = if input.locked_min_active {
        (input.locked_min_value - input.remaining).max(0)
    } else {
        0
    };
    let optional_mask = if mode == "strict" {
        vec![0u8; m]
    } else {
        input.optional_mask.clone()
    };
    let skip_optional_baseline = mode == "targeted"
        && (m as i32 > input.min_target_count)
        && optional_mask.iter().any(|flag| *flag != 0);

    if mode == "targeted" {
        // Targeted late branch allows additional room to satisfy aggregate floors.
        let sum_need_targeted = (0..m)
            .map(|idx| {
                if *input.targeted_mask.get(idx).unwrap_or(&0) != 0 {
                    need_now[idx]
                } else {
                    0
                }
            })
            .sum::<i32>();
        let min_agg_now = if input.global_min > 0 {
            (input.global_min - input.remaining).max(0)
        } else {
            0
        };
        let extra_targeted = (min_agg_now - sum_need_targeted).max(0);
        let min_now_required = (input.sum_min - input.remaining).max(0) + extra_targeted;
        if min_now_required > input.avail {
            return Vec::<Vec<i32>>::new();
        }
        extra = (min_now_required - sum_need).max(0);
        for idx in 0..m {
            let cap = late_rows_resolve_cap(*input.max_caps.get(idx).unwrap_or(&FILTER_OPTION_NONE_I32));
            let base_room = (input.mins[idx].min(cap) - need_now[idx]).max(0);
            let room = if extra_targeted > 0 {
                (cap - need_now[idx]).max(0)
            } else {
                base_room
            };
            add_caps[idx] = if *input.targeted_mask.get(idx).unwrap_or(&0) != 0 {
                room
            } else {
                0
            };
        }
    } else if mode == "strict" {
        // Strict late branch only allocates within per-stat minimum ceilings.
        let min_now_required = (input.sum_min - input.remaining).max(0);
        if min_now_required > input.avail {
            return Vec::<Vec<i32>>::new();
        }
        extra = (min_now_required - sum_need).max(0);
        if input.sum_min > input.num_target {
            return Vec::<Vec<i32>>::new();
        }
        if input.global_min > 0 {
            if input.global_min > input.num_target {
                return Vec::<Vec<i32>>::new();
            }
            let add_cap_total = (0..m)
                .map(|idx| {
                    let cap = late_rows_resolve_cap(*input.max_caps.get(idx).unwrap_or(&FILTER_OPTION_NONE_I32));
                    (cap - input.mins[idx]).max(0)
                })
                .sum::<i32>();
            if (input.global_min - input.sum_min) > add_cap_total {
                return Vec::<Vec<i32>>::new();
            }
        }
        for idx in 0..m {
            let cap = late_rows_resolve_cap(*input.max_caps.get(idx).unwrap_or(&FILTER_OPTION_NONE_I32));
            add_caps[idx] = (input.mins[idx].min(cap) - need_now[idx]).max(0);
        }
    } else {
        // Unknown mode is treated as no rows so callers fail closed.
        return Vec::<Vec<i32>>::new();
    }

    let bounded_input = FilteredBoundedRowsIn {
        caps: &add_caps,
        total: extra,
        need_now: &need_now,
        locked_mask: &input.locked_mask,
        locked_base_sum: base_locked_need,
        locked_min_at_level: locked_need_at_level,
        optional_mask: &optional_mask,
        mins: &input.mins,
        skip_optional_baseline,
    };
    let mut rows = compute_filtered_bounded_rows_with_offset_i32(&bounded_input);
    // Post-generation feasibility guard: reject distributions where the total
    // per-stat deficit (sum of max(0, min_i - row_i)) exceeds remaining milestones.
    // Without this, wildcard substats in the targeted pool can absorb the
    // extra-targeted budget even when doing so makes non-wildcard minimums jointly
    // infeasible.  Concretely: remaining=1, SPD=1 (need 2), CR%=0 (need 1),
    // CDMG%=2 (wildcard) → deficit = 1+1 = 2 > 1 → must be rejected.
    let budget = input.remaining.max(0);
    rows.retain(|row| {
        let deficit: i32 = input.mins.iter().enumerate().map(|(idx, &min_i)| {
            (min_i - row.get(idx).copied().unwrap_or(0)).max(0)
        }).sum();
        deficit <= budget
    });
    rows
}

// Shared intro-assignment core to serve JSON and fast-array bindings.
pub fn compute_intro_assignments_for_combo(
    count: i32,
    base_slots: i32,
    addition_levels: &[i32],
    forced_base_raw: &[i32],
) -> Vec<Vec<i32>> {
    if count <= 0 {
        return vec![Vec::<i32>::new()];
    }
    let safe_count = count as usize;
    let total_base = std::cmp::max(0, std::cmp::min(base_slots, count)) as usize;
    let addition_needed = std::cmp::max(0, count - total_base as i32) as usize;

    let indices = (0..count).collect::<Vec<_>>();
    let mut forced_set = BTreeSet::<i32>::new();
    for idx in forced_base_raw {
        if *idx >= 0 && *idx < count {
            forced_set.insert(*idx);
        }
    }
    let forced_indices = forced_set.into_iter().collect::<Vec<_>>();
    let forced_pick = std::cmp::min(total_base, forced_indices.len());
    let optional_pick = total_base.saturating_sub(forced_pick);
    let optional_indices = indices
        .iter()
        .copied()
        .filter(|idx| !forced_indices.contains(idx))
        .collect::<Vec<_>>();
    if optional_pick > optional_indices.len() {
        return Vec::<Vec<i32>>::new();
    }

    let addition_level_combos = if addition_needed > 0 {
        let mut combos = Vec::<Vec<i32>>::new();
        let mut path = Vec::<i32>::new();
        enumerate_combinations_i32(addition_levels, addition_needed, 0, &mut path, &mut combos);
        combos
    } else {
        vec![Vec::<i32>::new()]
    };
    let forced_combos = if forced_pick > 0 {
        let mut combos = Vec::<Vec<i32>>::new();
        let mut path = Vec::<i32>::new();
        enumerate_combinations_i32(&forced_indices, forced_pick, 0, &mut path, &mut combos);
        combos
    } else {
        vec![Vec::<i32>::new()]
    };
    let optional_combos = if optional_pick > 0 {
        let mut combos = Vec::<Vec<i32>>::new();
        let mut path = Vec::<i32>::new();
        enumerate_combinations_i32(&optional_indices, optional_pick, 0, &mut path, &mut combos);
        combos
    } else {
        vec![Vec::<i32>::new()]
    };

    let mut seen = HashSet::<String>::new();
    let mut results = Vec::<Vec<i32>>::new();
    for forced_combo in &forced_combos {
        for optional_combo in &optional_combos {
            let mut base_combo = forced_combo.clone();
            base_combo.extend(optional_combo.iter().copied());
            if base_combo.len() != total_base {
                continue;
            }
            let base_set = base_combo.iter().copied().collect::<HashSet<_>>();
            let remaining_indices = indices
                .iter()
                .copied()
                .filter(|idx| !base_set.contains(idx))
                .collect::<Vec<_>>();
            let orders = if addition_needed > 0 {
                compute_permutations_i32(&remaining_indices)
            } else {
                vec![Vec::<i32>::new()]
            };
            for addition_combo in &addition_level_combos {
                if addition_combo.len() != addition_needed {
                    continue;
                }
                for order in &orders {
                    if order.len() != addition_needed {
                        continue;
                    }
                    let mut intro = vec![0; safe_count];
                    for idx in &base_combo {
                        let slot = *idx as usize;
                        if slot < intro.len() {
                            intro[slot] = 0;
                        }
                    }
                    let mut i = 0;
                    while i < addition_needed {
                        let target_idx = order[i] as usize;
                        if target_idx < intro.len() {
                            intro[target_idx] = addition_combo[i];
                        }
                        i += 1;
                    }
                    let key = intro
                        .iter()
                        .map(i32::to_string)
                        .collect::<Vec<_>>()
                        .join(",");
                    if seen.insert(key) {
                        results.push(intro);
                    }
                }
            }
        }
    }
    results
}
