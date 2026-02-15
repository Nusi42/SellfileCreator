use serde::Deserialize;

use crate::hsf_intro_mode_plan::HsfIntroModePlanStepOut;
use crate::emit_hsf_rules_for_distributions_core;
use crate::hsf_distribution_runtime;
use crate::BuildHsfLateBoundedRowsIn;
use crate::EmitHsfRulesForDistributionsIn;
use crate::RuleRaw;
use crate::FILTER_OPTION_NONE_I32;

// Execution payload mirrors the remaining intro-assignment runtime branch in
// hsfBuilder.ts. Policy planning already runs in wasm; this runs the plan.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExecuteHsfIntroPlanIn {
    pub(crate) m: i32,
    pub(crate) others_count: i32,
    pub(crate) avail: i32,
    pub(crate) remaining: i32,
    pub(crate) sum_min: i32,
    pub(crate) global_min: i32,
    pub(crate) num_target: i32,
    pub(crate) locked_min_value: i32,
    pub(crate) locked_min_active: bool,
    pub(crate) min_target_count: i32,
    // Presence rows are skipped for flex supersets to preserve TS behavior.
    pub(crate) skip_presence_for_flex_supersets: bool,
    pub(crate) mins: Vec<i32>,
    pub(crate) max_caps: Vec<i32>,
    pub(crate) any_flags: Vec<u8>,
    pub(crate) targeted_mask: Vec<u8>,
    pub(crate) locked_mask: Vec<u8>,
    pub(crate) optional_mask: Vec<u8>,
    // One compact timeline-cap vector per intro assignment.
    pub(crate) timeline_caps_by_intro: Vec<Vec<i32>>,
    // Planner output (already normalized by TS wrapper) drives execution.
    pub(crate) plan_steps: Vec<HsfIntroModePlanStepOut>,
    // Shared emit payload is reused for every emitted rule batch.
    pub(crate) emit: EmitHsfRulesForDistributionsIn,
}

// Expand compact base vectors to requested dimensions. Extra dimensions default
// to "unset"/false exactly like the existing compact filtered helper.
fn widen_i32_with_sentinel(base: &[i32], width: usize, sentinel: i32) -> Vec<i32> {
    let mut out = vec![sentinel; width];
    let count = width.min(base.len());
    if count > 0 {
        out[..count].copy_from_slice(&base[..count]);
    }
    out
}

// Expand compact mask vectors for sink dimensions in allow-other paths.
fn widen_u8_with_zero(base: &[u8], width: usize) -> Vec<u8> {
    let mut out = vec![0u8; width];
    let count = width.min(base.len());
    if count > 0 {
        out[..count].copy_from_slice(&base[..count]);
    }
    out
}

// Convert sentinel-encoded vectors into optional filter values.
fn decode_optional_i32(values: &[i32]) -> Vec<Option<i32>> {
    values
        .iter()
        .map(|value| if *value <= FILTER_OPTION_NONE_I32 { None } else { Some(*value) })
        .collect::<Vec<_>>()
}

// Convert compact masks to bool vectors consumed by the filter core.
fn decode_mask_bool(values: &[u8]) -> Vec<bool> {
    values.iter().map(|value| *value != 0).collect::<Vec<_>>()
}

// Planner payload uses i64 for cross-language safety; runtime math uses i32.
fn narrow_i64(value: i64) -> i32 {
    value
        .clamp(i32::MIN as i64, i32::MAX as i64) as i32
}

// Convert optional floor vectors to i32 right before filter-core calls.
fn narrow_optional_vec(values: Option<&[i64]>) -> Option<Vec<i32>> {
    values.map(|list| list.iter().map(|value| narrow_i64(*value)).collect::<Vec<_>>())
}

// Convert row matrices from planner payload into i32 emission rows.
fn narrow_rows(rows: &[Vec<i64>]) -> Vec<Vec<i32>> {
    rows
        .iter()
        .map(|row| row.iter().map(|value| narrow_i64(*value)).collect::<Vec<_>>())
        .collect::<Vec<_>>()
}

// Emit direct distribution rows, overriding skipOptionalBaseline per step.
fn emit_rows_with_skip(
    emit: &EmitHsfRulesForDistributionsIn,
    rows: &[Vec<i32>],
    skip_optional_baseline: bool,
) -> Vec<RuleRaw> {
    if rows.is_empty() {
        return Vec::<RuleRaw>::new();
    }
    let mut emit_payload = emit.clone();
    emit_payload.skip_optional_baseline = skip_optional_baseline;
    emit_hsf_rules_for_distributions_core(&emit_payload, rows)
}

// Shared filtered+emit helper mirrors compact filtered-emission behavior.
fn emit_filtered_rows_compact(
    emit: &EmitHsfRulesForDistributionsIn,
    dimensions: i32,
    total: i32,
    base_max_caps: &[i32],
    base_timeline_caps: &[i32],
    base_targeted_mask: &[u8],
    base_locked_mask: &[u8],
    min_floors: Option<&[i32]>,
    targeted_exact: Option<i32>,
    deficit_floors: Option<&[i32]>,
    deficit_max: Option<i32>,
    global_min: i32,
    global_remaining: i32,
    global_mode: i32,
    locked_min: i32,
    locked_remaining: i32,
    locked_mode: i32,
) -> Vec<RuleRaw> {
    if dimensions <= 0 || total < 0 {
        return Vec::<RuleRaw>::new();
    }
    let width = dimensions.max(0) as usize;
    let widened_max_caps = widen_i32_with_sentinel(base_max_caps, width, FILTER_OPTION_NONE_I32);
    let widened_timeline_caps = widen_i32_with_sentinel(base_timeline_caps, width, FILTER_OPTION_NONE_I32);
    let widened_targeted_mask = widen_u8_with_zero(base_targeted_mask, width);
    let widened_locked_mask = widen_u8_with_zero(base_locked_mask, width);

    let rows = hsf_distribution_runtime::filter_roll_distributions_core(
        dimensions,
        total,
        &decode_optional_i32(&widened_max_caps),
        &decode_optional_i32(min_floors.unwrap_or(&[])),
        &decode_optional_i32(&widened_timeline_caps),
        &decode_mask_bool(&widened_targeted_mask),
        targeted_exact,
        &decode_optional_i32(deficit_floors.unwrap_or(&[])),
        deficit_max,
        global_min,
        global_remaining,
        hsf_distribution_runtime::parse_distribution_mode(global_mode),
        &decode_mask_bool(&widened_locked_mask),
        locked_min,
        locked_remaining,
        hsf_distribution_runtime::parse_distribution_mode(locked_mode),
    );
    emit_hsf_rules_for_distributions_core(emit, &rows)
}

// Execute one intro timeline by replaying planner steps in-order.
fn execute_intro_steps_for_timeline(
    input: &ExecuteHsfIntroPlanIn,
    timeline_caps: &[i32],
    out: &mut Vec<RuleRaw>,
) {
    let base_max_caps = input.max_caps.clone();
    let base_targeted_mask = input.targeted_mask.clone();
    let base_locked_mask = input.locked_mask.clone();
    for step in &input.plan_steps {
        match step {
            HsfIntroModePlanStepOut::EmitRows {
                rows,
                skip_optional_baseline,
            } => {
                let narrowed_rows = narrow_rows(rows);
                let emitted = emit_rows_with_skip(&input.emit, &narrowed_rows, *skip_optional_baseline);
                out.extend(emitted);
            }
            HsfIntroModePlanStepOut::EmitPresence => {
                if input.skip_presence_for_flex_supersets {
                    continue;
                }
                let width = input.m.max(0) as usize;
                let rows = vec![vec![0i32; width]];
                let emitted = emit_rows_with_skip(&input.emit, &rows, false);
                out.extend(emitted);
            }
            HsfIntroModePlanStepOut::EmitLateRows {
                mode,
                skip_optional_baseline,
                stop_if_emitted,
            } => {
                let strict_optional_mask = vec![0u8; input.m.max(0) as usize];
                let late_payload = BuildHsfLateBoundedRowsIn {
                    mode: mode.clone(),
                    mins: input.mins.clone(),
                    max_caps: input.max_caps.clone(),
                    any_flags: input.any_flags.clone(),
                    targeted_mask: input.targeted_mask.clone(),
                    locked_mask: input.locked_mask.clone(),
                    optional_mask: if mode.trim().eq_ignore_ascii_case("strict") {
                        strict_optional_mask
                    } else {
                        input.optional_mask.clone()
                    },
                    remaining: input.remaining,
                    avail: input.avail,
                    sum_min: input.sum_min,
                    global_min: input.global_min,
                    num_target: input.num_target,
                    locked_min_value: input.locked_min_value,
                    locked_min_active: input.locked_min_active,
                    min_target_count: input.min_target_count,
                };
                let rows = hsf_distribution_runtime::build_hsf_late_bounded_rows_core(&late_payload);
                if rows.is_empty() {
                    continue;
                }
                let emitted = emit_rows_with_skip(&input.emit, &rows, *skip_optional_baseline);
                let emitted_any = !emitted.is_empty();
                out.extend(emitted);
                if *stop_if_emitted && emitted_any {
                    break;
                }
            }
            HsfIntroModePlanStepOut::EmitFilteredAllowOther {
                min_floors,
                targeted_exact,
                deficit_floors,
                deficit_max,
                prefer_virtual_sink,
            } => {
                let run = |include_virtual_sink: bool, out: &mut Vec<RuleRaw>| -> bool {
                    let min_floors_narrowed = narrow_optional_vec(min_floors.as_deref());
                    let deficit_floors_narrowed = narrow_optional_vec(deficit_floors.as_deref());
                    let dims = input.m
                        + if input.others_count > 0 { 1 } else { 0 }
                        + if include_virtual_sink { 1 } else { 0 };
                    let emitted = emit_filtered_rows_compact(
                        &input.emit,
                        dims,
                        input.avail,
                        &base_max_caps,
                        timeline_caps,
                        &base_targeted_mask,
                        &base_locked_mask,
                        min_floors_narrowed.as_deref(),
                        targeted_exact.map(|value| narrow_i64(value)),
                        deficit_floors_narrowed.as_deref(),
                        deficit_max.map(|value| narrow_i64(value)),
                        input.global_min,
                        input.remaining,
                        if input.global_min > 0 { 2 } else { 0 },
                        input.locked_min_value,
                        input.remaining,
                        if input.global_min > 0 && input.locked_min_active {
                            2
                        } else {
                            0
                        },
                    );
                    let emitted_any = !emitted.is_empty();
                    out.extend(emitted);
                    emitted_any
                };

                if *prefer_virtual_sink {
                    if run(true, out) {
                        continue;
                    }
                    run(false, out);
                    continue;
                }

                let emitted = run(false, out);
                if emitted {
                    continue;
                }
                if input.others_count == 0 && input.avail > 0 {
                    run(true, out);
                }
            }
            HsfIntroModePlanStepOut::EmitFilteredSelected {
                min_floors,
                targeted_exact,
                deficit_floors,
                deficit_max,
                global_mode,
                global_remaining,
                locked_mode,
                locked_remaining,
                fallback_presence_on_empty,
            } => {
                let min_floors_narrowed = narrow_optional_vec(min_floors.as_deref());
                let deficit_floors_narrowed = narrow_optional_vec(deficit_floors.as_deref());
                let emitted = emit_filtered_rows_compact(
                    &input.emit,
                    input.m,
                    input.avail,
                    &base_max_caps,
                    timeline_caps,
                    &base_targeted_mask,
                    &base_locked_mask,
                    min_floors_narrowed.as_deref(),
                    targeted_exact.map(|value| narrow_i64(value)),
                    deficit_floors_narrowed.as_deref(),
                    deficit_max.map(|value| narrow_i64(value)),
                    input.global_min,
                    narrow_i64(*global_remaining),
                    narrow_i64(*global_mode),
                    input.locked_min_value,
                    narrow_i64(*locked_remaining),
                    narrow_i64(*locked_mode),
                );
                let emitted_any = !emitted.is_empty();
                out.extend(emitted);
                if emitted_any || !*fallback_presence_on_empty {
                    continue;
                }
                if input.skip_presence_for_flex_supersets {
                    continue;
                }
                let width = input.m.max(0) as usize;
                let rows = vec![vec![0i32; width]];
                let presence = emit_rows_with_skip(&input.emit, &rows, false);
                out.extend(presence);
            }
        }
    }
}

// Execute intro planner steps for every intro timeline and emit concrete rules.
pub(crate) fn execute_hsf_intro_plan_core(input: &ExecuteHsfIntroPlanIn) -> Vec<RuleRaw> {
    if input.m <= 0 || input.avail < 0 {
        return Vec::<RuleRaw>::new();
    }
    if input.plan_steps.is_empty() || input.timeline_caps_by_intro.is_empty() {
        return Vec::<RuleRaw>::new();
    }
    let mut out = Vec::<RuleRaw>::new();
    for timeline_caps in &input.timeline_caps_by_intro {
        execute_intro_steps_for_timeline(input, timeline_caps, &mut out);
    }
    out
}
