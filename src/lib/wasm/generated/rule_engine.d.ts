/* tslint:disable */
/* eslint-disable */

export function bounded_compositions_i32_fast(caps: Int32Array, total: number): string;

export function bounded_compositions_i32_fast_flat(caps: Int32Array, total: number): Int32Array;

export function build_keep_unique_rules_value(rules: any, detection: any, config_id_base: bigint): any;

export function combinations_i32(values_json: string, pick: number): string;

export function combinations_i32_fast(values: Int32Array, pick: number): string;

export function combinations_i32_fast_flat(values: Int32Array, pick: number): Int32Array;

export function compute_keep_unique_protection_value(candidates: any, rules: any, expected_groups_by_rule_id: any, enabled: boolean, now: number): any;

export function configure(rules_json: string, config_modes_json: string): void;

export function configure_value(rules: any, config_modes: any): void;

export function dedupe_hsf_rules_for_export_value(rules: any): any;

export function emit_hsf_rules_for_distributions_value(payload: any): any;

export function emit_hsf_rules_for_filtered_distributions_value(payload: any): any;

export function evaluate(items_json: string, options_json: string): string;

export function evaluate_value(items: any, options: any): any;

export function filtered_bounded_compositions_with_offset_i32_fast_flat(caps: Int32Array, total: number, need_now: Int32Array, locked_mask: Uint8Array, locked_base_sum: number, locked_min_at_level: number, optional_mask: Uint8Array, mins: Int32Array, skip_optional_baseline: boolean): Int32Array;

export function filtered_roll_distributions(dimensions: number, total: number, max_caps_json: string, min_floors_json: string, timeline_caps_json: string, targeted_mask_json: string, targeted_exact: number, deficit_floors_json: string, deficit_max: number, global_min: number, global_remaining: number, global_mode: number, locked_mask_json: string, locked_min: number, locked_remaining: number, locked_mode: number): string;

export function filtered_roll_distributions_fast(dimensions: number, total: number, max_caps: Int32Array, min_floors: Int32Array, timeline_caps: Int32Array, targeted_mask: Uint8Array, targeted_exact: number, deficit_floors: Int32Array, deficit_max: number, global_min: number, global_remaining: number, global_mode: number, locked_mask: Uint8Array, locked_min: number, locked_remaining: number, locked_mode: number): string;

export function filtered_roll_distributions_fast_flat(dimensions: number, total: number, max_caps: Int32Array, min_floors: Int32Array, timeline_caps: Int32Array, targeted_mask: Uint8Array, targeted_exact: number, deficit_floors: Int32Array, deficit_max: number, global_min: number, global_remaining: number, global_mode: number, locked_mask: Uint8Array, locked_min: number, locked_remaining: number, locked_mode: number): Int32Array;

export function finalize_builder_rules_value(rules: any, emission_meta: any): any;

export function finalize_generated_rules(entries_json: string, apply_obsolete_pruning: boolean): string;

export function finalize_generated_rules_value(entries: any, apply_obsolete_pruning: boolean): any;

export function find_obsolete(rules_json: string): string;

export function find_obsolete_builder_value(rules: any): any;

export function find_obsolete_value(rules: any): any;

export function intro_assignments_for_combo(count: number, base_slots: number, addition_levels_json: string, forced_base_json: string): string;

export function intro_assignments_for_combo_fast(count: number, base_slots: number, addition_levels: Int32Array, forced_base: Int32Array): string;

export function intro_assignments_for_combo_fast_flat(count: number, base_slots: number, addition_levels: Int32Array, forced_base: Int32Array): Int32Array;

export function keep_unique_count_key_value(artifact: any, count_mode: any): string;

export function merge_keep_unique_injected_rules_value(base_rules: any, custom_rules: any, candidate_keep_rules: any): any;

export function permutations_i32(values_json: string): string;

export function permutations_i32_fast(values: Int32Array): string;

export function permutations_i32_fast_flat(values: Int32Array): Int32Array;

export function resolve_auto_rarity_code_value(payload: any): number;

export function resolve_keep_unique_candidate_keep_flags_value(rows: any, rules: any, config_modes: any, ignore_keep_unique_config_indices: any): any;

export function roll_distributions(dimensions: number, total: number): string;

export function roll_distributions_flat(dimensions: number, total: number): Int32Array;

export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly bounded_compositions_i32_fast: (a: number, b: number, c: number) => [number, number, number, number];
    readonly bounded_compositions_i32_fast_flat: (a: number, b: number, c: number) => [number, number];
    readonly build_keep_unique_rules_value: (a: any, b: any, c: bigint) => [number, number, number];
    readonly combinations_i32: (a: number, b: number, c: number) => [number, number, number, number];
    readonly combinations_i32_fast: (a: number, b: number, c: number) => [number, number, number, number];
    readonly combinations_i32_fast_flat: (a: number, b: number, c: number) => [number, number];
    readonly compute_keep_unique_protection_value: (a: any, b: any, c: any, d: number, e: number) => [number, number, number];
    readonly configure: (a: number, b: number, c: number, d: number) => [number, number];
    readonly configure_value: (a: any, b: any) => [number, number];
    readonly dedupe_hsf_rules_for_export_value: (a: any) => [number, number, number];
    readonly emit_hsf_rules_for_distributions_value: (a: any) => [number, number, number];
    readonly emit_hsf_rules_for_filtered_distributions_value: (a: any) => [number, number, number];
    readonly evaluate: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly evaluate_value: (a: any, b: any) => [number, number, number];
    readonly filtered_bounded_compositions_with_offset_i32_fast_flat: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number) => [number, number];
    readonly filtered_roll_distributions: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number) => [number, number, number, number];
    readonly filtered_roll_distributions_fast: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number) => [number, number, number, number];
    readonly filtered_roll_distributions_fast_flat: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number) => [number, number];
    readonly finalize_builder_rules_value: (a: any, b: any) => [number, number, number];
    readonly finalize_generated_rules: (a: number, b: number, c: number) => [number, number, number, number];
    readonly finalize_generated_rules_value: (a: any, b: number) => [number, number, number];
    readonly find_obsolete: (a: number, b: number) => [number, number, number, number];
    readonly find_obsolete_builder_value: (a: any) => [number, number, number];
    readonly find_obsolete_value: (a: any) => [number, number, number];
    readonly intro_assignments_for_combo: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly intro_assignments_for_combo_fast: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly intro_assignments_for_combo_fast_flat: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly keep_unique_count_key_value: (a: any, b: any) => [number, number, number, number];
    readonly merge_keep_unique_injected_rules_value: (a: any, b: any, c: any) => [number, number, number];
    readonly permutations_i32: (a: number, b: number) => [number, number, number, number];
    readonly permutations_i32_fast: (a: number, b: number) => [number, number, number, number];
    readonly permutations_i32_fast_flat: (a: number, b: number) => [number, number];
    readonly resolve_auto_rarity_code_value: (a: any) => [number, number, number];
    readonly resolve_keep_unique_candidate_keep_flags_value: (a: any, b: any, c: any, d: any) => [number, number, number];
    readonly roll_distributions: (a: number, b: number) => [number, number, number, number];
    readonly roll_distributions_flat: (a: number, b: number) => [number, number];
    readonly version: () => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
