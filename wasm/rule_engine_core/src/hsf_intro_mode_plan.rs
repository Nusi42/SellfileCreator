use serde::{Deserialize, Serialize};

// Intro policy input mirrors hsfBuilder.ts per-intro decision state.
// Keep this payload numeric/boolean-only so serialization stays predictable.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfIntroModePlanIn {
    pub(crate) effective_mode: String,
    pub(crate) early_mode: String,
    pub(crate) m: i64,
    pub(crate) min_target_count: i64,
    pub(crate) combo_len: i64,
    pub(crate) any_min: bool,
    pub(crate) any_wildcard: bool,
    pub(crate) global_min: i64,
    pub(crate) num_target: i64,
    pub(crate) avail: i64,
    pub(crate) sum_min: i64,
    pub(crate) sum_min_targeted: i64,
    pub(crate) min_non_target_now: i64,
    pub(crate) needs_locked_aggregate: bool,
    pub(crate) targeted_mask: Vec<bool>,
    pub(crate) locked_mask: Vec<bool>,
    pub(crate) mins: Vec<i64>,
    pub(crate) max_caps: Vec<i64>,
    pub(crate) deficit_floors: Vec<i64>,
    pub(crate) prefer_virtual_sink: bool,
    pub(crate) optional_rows_only_baseline: bool,
    pub(crate) locked_min_active: bool,
    pub(crate) locked_min_value: i64,
}

// Plan output keeps execution in TS simple: iterate steps in-order and execute.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildHsfIntroModePlanOut {
    pub(crate) steps: Vec<HsfIntroModePlanStepOut>,
}

// Step union keeps wire format explicit and stable for TS parsing.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[allow(clippy::enum_variant_names)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub(crate) enum HsfIntroModePlanStepOut {
    EmitRows {
        rows: Vec<Vec<i64>>,
        skip_optional_baseline: bool,
    },
    EmitPresence,
    EmitLateRows {
        mode: String,
        skip_optional_baseline: bool,
        stop_if_emitted: bool,
    },
    EmitFilteredSelected {
        min_floors: Option<Vec<i64>>,
        targeted_exact: Option<i64>,
        deficit_floors: Option<Vec<i64>>,
        deficit_max: Option<i64>,
        global_mode: i64,
        global_remaining: i64,
        locked_mode: i64,
        locked_remaining: i64,
        fallback_presence_on_empty: bool,
    },
    EmitFilteredAllowOther {
        min_floors: Option<Vec<i64>>,
        targeted_exact: Option<i64>,
        deficit_floors: Option<Vec<i64>>,
        deficit_max: Option<i64>,
        prefer_virtual_sink: bool,
    },
}

// Scalar helper keeps mask accesses safe without repeated Option boilerplate.
fn bool_at(mask: &[bool], idx: usize) -> bool {
    mask.get(idx).copied().unwrap_or(false)
}

// Cap helper mirrors TS max-cap semantics: -1 means "unbounded".
fn apply_cap(value: i64, max_cap: Option<i64>) -> i64 {
    match max_cap {
        Some(cap) if cap >= 0 => value.min(cap),
        _ => value,
    }
}

// Locked aggregate helper mirrors canSatisfyLocked() in hsfBuilder.ts.
fn can_satisfy_locked(locked_active: bool, locked_min_value: i64, current: i64, remaining: i64) -> bool {
    if !locked_active {
        return true;
    }
    current >= locked_min_value || (locked_min_value - current) <= remaining
}

// How much of the aggregate minimum must still be emitted at this level once the
// slots still to come (`remaining`) are credited against it. Single definition so the
// two "late" wildcard branches below cannot drift apart.
// Callers gate on `global_min > 0`, so it is always a valid upper bound for the clamp.
fn need_now_for_global_min(global_min: i64, remaining: i64) -> i64 {
    (global_min - remaining).clamp(0, global_min)
}

// Main policy port for the largest hsfBuilder intro-level branch.
// This function only decides which emission operations to run.
pub(crate) fn build_intro_mode_plan_core(input: &BuildHsfIntroModePlanIn) -> BuildHsfIntroModePlanOut {
    let mut steps: Vec<HsfIntroModePlanStepOut> = Vec::new();

    // Preserve the TS default used by emitRowsForComboViaWasm().
    let skip_optional_default = input.combo_len > input.min_target_count;

    // Fast path: single selected substat with concrete minimum requirements.
    if input.m == 1 && input.any_min && !input.any_wildcard {
        let min_value = input.mins.first().copied().unwrap_or(0);
        let required = min_value.max(input.global_min);
        if required > input.num_target {
            return BuildHsfIntroModePlanOut { steps };
        }
        let applied = if input.early_mode == "late" {
            let remaining = (input.num_target - input.avail).max(0);
            let need_now = (required - remaining).max(0);
            apply_cap(need_now, input.max_caps.first().copied())
        } else {
            apply_cap(required.min(input.avail), input.max_caps.first().copied())
        };
        if input.global_min > 0 {
            let remaining = (input.num_target - input.avail).max(0);
            let selected_sum = applied;
            if !(selected_sum >= input.global_min || (input.global_min - selected_sum) <= remaining) {
                return BuildHsfIntroModePlanOut { steps };
            }
            let locked_applied = if bool_at(&input.locked_mask, 0) { applied } else { 0 };
            if !can_satisfy_locked(input.locked_min_active, input.locked_min_value, locked_applied, remaining) {
                return BuildHsfIntroModePlanOut { steps };
            }
        }
        steps.push(HsfIntroModePlanStepOut::EmitRows {
            rows: vec![vec![applied]],
            skip_optional_baseline: false,
        });
        return BuildHsfIntroModePlanOut { steps };
    }

    // Fast path: single wildcard-only substat with global min requirements.
    if input.m == 1 && !input.any_min && input.any_wildcard && input.global_min > 0 {
        if input.global_min > input.num_target {
            return BuildHsfIntroModePlanOut { steps };
        }
        let applied = if input.early_mode == "late" {
            let remaining = (input.num_target - input.avail).max(0);
            let need_now = (input.global_min - remaining).max(0);
            apply_cap(need_now, input.max_caps.first().copied())
        } else {
            apply_cap(input.global_min.min(input.avail), input.max_caps.first().copied())
        };
        let remaining = (input.num_target - input.avail).max(0);
        let selected_targeted = if bool_at(&input.targeted_mask, 0) { applied } else { 0 };
        if !(selected_targeted >= input.global_min || (input.global_min - selected_targeted) <= remaining) {
            return BuildHsfIntroModePlanOut { steps };
        }
        let locked_applied = if bool_at(&input.locked_mask, 0) { applied } else { 0 };
        if !can_satisfy_locked(input.locked_min_active, input.locked_min_value, locked_applied, remaining) {
            return BuildHsfIntroModePlanOut { steps };
        }
        steps.push(HsfIntroModePlanStepOut::EmitRows {
            rows: vec![vec![applied]],
            skip_optional_baseline: false,
        });
        return BuildHsfIntroModePlanOut { steps };
    }

    // Shared late+mins targeted pass runs before strict/potential branching.
    if input.early_mode == "late" && input.any_min {
        steps.push(HsfIntroModePlanStepOut::EmitLateRows {
            mode: "targeted".to_string(),
            skip_optional_baseline: skip_optional_default,
            stop_if_emitted: true,
        });
    }

    // Strict mode keeps only rows that satisfy the selected branch semantics.
    if input.effective_mode == "strict" {
        if input.early_mode == "late" {
            steps.push(HsfIntroModePlanStepOut::EmitLateRows {
                mode: "strict".to_string(),
                skip_optional_baseline: false,
                stop_if_emitted: true,
            });
        }
        if !input.any_min && !input.any_wildcard {
            if input.global_min <= 0 {
                steps.push(HsfIntroModePlanStepOut::EmitPresence);
            } else if input.avail >= input.global_min {
                steps.push(HsfIntroModePlanStepOut::EmitFilteredSelected {
                    min_floors: None,
                    targeted_exact: None,
                    deficit_floors: None,
                    deficit_max: None,
                    global_mode: 1,
                    global_remaining: 0,
                    locked_mode: if input.locked_min_active { 1 } else { 0 },
                    locked_remaining: 0,
                    fallback_presence_on_empty: false,
                });
            }
            return BuildHsfIntroModePlanOut { steps };
        }
        if !input.any_min && input.any_wildcard {
            if input.global_min > 0 && input.early_mode == "late" {
                let remaining = (input.num_target - input.avail).max(0);
                let need_now = need_now_for_global_min(input.global_min, remaining);
                if need_now == 0 {
                    steps.push(HsfIntroModePlanStepOut::EmitPresence);
                } else if need_now <= input.avail {
                    steps.push(HsfIntroModePlanStepOut::EmitFilteredAllowOther {
                        min_floors: None,
                        targeted_exact: Some(need_now),
                        deficit_floors: None,
                        deficit_max: None,
                        prefer_virtual_sink: input.prefer_virtual_sink,
                    });
                }
            } else if input.global_min > 0 {
                let need = input.global_min.min(input.avail);
                steps.push(HsfIntroModePlanStepOut::EmitFilteredAllowOther {
                    min_floors: None,
                    targeted_exact: Some(need),
                    deficit_floors: None,
                    deficit_max: None,
                    prefer_virtual_sink: input.prefer_virtual_sink,
                });
            } else if input.early_mode == "late" {
                steps.push(HsfIntroModePlanStepOut::EmitPresence);
            } else {
                steps.push(HsfIntroModePlanStepOut::EmitFilteredAllowOther {
                    min_floors: None,
                    targeted_exact: None,
                    deficit_floors: None,
                    deficit_max: None,
                    prefer_virtual_sink: input.prefer_virtual_sink,
                });
            }
            return BuildHsfIntroModePlanOut { steps };
        }
        if input.avail <= 0 {
            return BuildHsfIntroModePlanOut { steps };
        }
        if input.sum_min <= input.avail {
            let needs_aggregate_rows = (input.global_min > 0 && input.global_min > input.sum_min_targeted)
                || input.needs_locked_aggregate;
            if needs_aggregate_rows {
                steps.push(HsfIntroModePlanStepOut::EmitFilteredSelected {
                    min_floors: Some(input.mins.clone()),
                    targeted_exact: None,
                    deficit_floors: None,
                    deficit_max: None,
                    global_mode: if input.global_min > 0 { 1 } else { 0 },
                    global_remaining: 0,
                    locked_mode: if input.locked_min_active { 1 } else { 0 },
                    locked_remaining: 0,
                    fallback_presence_on_empty: false,
                });
            } else if !input.optional_rows_only_baseline {
                steps.push(HsfIntroModePlanStepOut::EmitRows {
                    rows: vec![input.mins.clone()],
                    skip_optional_baseline: false,
                });
            }
        }
        return BuildHsfIntroModePlanOut { steps };
    }

    // Potential mode preserves partial-progress rows that remain target-feasible.
    if !input.any_min && !input.any_wildcard {
        steps.push(HsfIntroModePlanStepOut::EmitFilteredAllowOther {
            min_floors: None,
            targeted_exact: None,
            deficit_floors: None,
            deficit_max: None,
            prefer_virtual_sink: input.prefer_virtual_sink,
        });
        return BuildHsfIntroModePlanOut { steps };
    }
    if !input.any_min && input.any_wildcard {
        if input.global_min > 0 && input.early_mode == "late" {
            let remaining = (input.num_target - input.avail).max(0);
            let need_now = need_now_for_global_min(input.global_min, remaining);
            if need_now == 0 {
                steps.push(HsfIntroModePlanStepOut::EmitPresence);
            } else if need_now <= input.avail {
                steps.push(HsfIntroModePlanStepOut::EmitFilteredAllowOther {
                    min_floors: None,
                    targeted_exact: Some(need_now),
                    deficit_floors: None,
                    deficit_max: None,
                    prefer_virtual_sink: input.prefer_virtual_sink,
                });
            }
        } else if input.global_min > 0 {
            let need = input.global_min.min(input.avail);
            steps.push(HsfIntroModePlanStepOut::EmitFilteredAllowOther {
                min_floors: None,
                targeted_exact: Some(need),
                deficit_floors: None,
                deficit_max: None,
                prefer_virtual_sink: input.prefer_virtual_sink,
            });
        } else if input.early_mode == "late" {
            steps.push(HsfIntroModePlanStepOut::EmitPresence);
        } else if input.needs_locked_aggregate {
            // Early mode with all wildcards and no global min — enforce locked aggregate
            // proportional progress: at level L, every locked substat must collectively
            // reach locked_min_value by the final milestone, so require at least
            // locked_min_value - remaining rolls to already be present now.
            let locked_now = (input.locked_min_value - (input.num_target - input.avail)).max(0);
            steps.push(HsfIntroModePlanStepOut::EmitFilteredAllowOther {
                min_floors: None,
                targeted_exact: Some(locked_now),
                deficit_floors: None,
                deficit_max: None,
                prefer_virtual_sink: input.prefer_virtual_sink,
            });
        } else {
            steps.push(HsfIntroModePlanStepOut::EmitFilteredAllowOther {
                min_floors: None,
                targeted_exact: None,
                deficit_floors: None,
                deficit_max: None,
                prefer_virtual_sink: input.prefer_virtual_sink,
            });
        }
        return BuildHsfIntroModePlanOut { steps };
    }
    if input.sum_min > input.num_target {
        return BuildHsfIntroModePlanOut { steps };
    }
    if input.avail <= 0 {
        if input.global_min <= input.num_target {
            steps.push(HsfIntroModePlanStepOut::EmitPresence);
        }
        return BuildHsfIntroModePlanOut { steps };
    }
    if input.sum_min <= input.avail {
        let needs_aggregate_rows = (input.global_min > 0 && input.global_min > input.sum_min_targeted)
            || input.needs_locked_aggregate;
        if needs_aggregate_rows {
            let need_target_now = input.global_min.min((input.avail - input.min_non_target_now).max(0));
            steps.push(HsfIntroModePlanStepOut::EmitFilteredAllowOther {
                min_floors: Some(input.mins.clone()),
                targeted_exact: Some(need_target_now),
                deficit_floors: None,
                deficit_max: None,
                prefer_virtual_sink: input.prefer_virtual_sink,
            });
        } else if !input.optional_rows_only_baseline {
            steps.push(HsfIntroModePlanStepOut::EmitRows {
                rows: vec![input.mins.clone()],
                skip_optional_baseline: false,
            });
        }
        return BuildHsfIntroModePlanOut { steps };
    }
    // Use FeasibleByTarget (mode=2) so intermediate levels accept partial progress
    // rather than rejecting all distributions (avail < sum_min).  The recovery
    // budget is sum_min - avail (not num_target - avail = remaining): only the rolls
    // needed to reach the per-stat minimums count toward "allowable deficit" — any
    // surplus roll capacity beyond sum_min is not a recovery budget for missed mins.
    // Using remaining instead of sum_min - avail causes false passes on rarities where
    // num_target > sum_min (e.g. Legendary with 4 milestones and SPD min=3).
    let strict_budget = (input.sum_min - input.avail).max(0);
    steps.push(HsfIntroModePlanStepOut::EmitFilteredSelected {
        min_floors: None,
        targeted_exact: None,
        deficit_floors: Some(input.deficit_floors.clone()),
        deficit_max: Some(strict_budget),
        global_mode: if input.global_min > 0 { 2 } else { 0 },
        global_remaining: (input.global_min - input.avail).max(0),
        // FeasibleByTarget (mode=2): locked substats need locked_min_value by the final milestone.
        // Budget is num_target - avail (remaining milestones) — same logic as global_remaining.
        locked_mode: if input.locked_min_active { 2 } else { 0 },
        locked_remaining: if input.locked_min_active { (input.num_target - input.avail).max(0) } else { 0 },
        fallback_presence_on_empty: true,
    });
    BuildHsfIntroModePlanOut { steps }
}
