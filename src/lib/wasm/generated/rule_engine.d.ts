/* tslint:disable */
/* eslint-disable */

export function auto_rarity_addition_levels_for_code_value(rarity_code: number): Int32Array;

export function auto_rarity_includes_mythical_for_code_value(rarity_code: number): boolean;

export function auto_rarity_roll_levels_for_code_value(rarity_code: number): Int32Array;

export function build_final_sell_rules_value(remainder: any, all_known_set_ids: any): any;

export function build_hsf_rules_runtime_value(payload: any): any;

export function build_keep_unique_rules_value(rules: any, detection: any, config_id_base: bigint): any;

export function collect_and_compute_keep_unique_protection_value(rows: any, rules: any, config_modes: any, ignore_keep_unique_config_indices: any, keep_unique_rules: any, expected_groups_payload: any, enabled: boolean, now: number): any;

export function collect_keep_unique_candidates_value(rows: any, rules: any, config_modes: any, ignore_keep_unique_config_indices: any): any;

export function combinations_i32_fast_flat(values: Int32Array, pick: number): Int32Array;

export function compute_keep_unique_protection_value(candidates: any, rules: any, expected_groups_by_rule_id: any, enabled: boolean, now: number): any;

export function compute_merged_rules_value(payload: any): any;

export function configure_value(rules: any, config_modes: any): void;

export function dedupe_hsf_rules_for_export_value(rules: any): any;

export function evaluate_value(items: any, options: any): any;

export function expand_auto_flex_rarity_branches_value(config: any, base_rarity_code: number): any;

export function finalize_generated_rules_value(entries: any, apply_obsolete_pruning: boolean): any;

export function find_obsolete_value(rules: any): any;

export function fingerprint_merged_rules_value(rules: any): any;

export function flatten_rule_batches_with_total_limit_value(base_count: bigint, total_limit: bigint, batches: any): any;

export function hash_keep_unique_combination_value(combination: any): string;

export function intro_assignments_for_combo_fast_flat(count: number, base_slots: number, addition_levels: Int32Array, forced_base: Int32Array): Int32Array;

export function keep_unique_count_key_value(artifact: any, count_mode: any): string;

export function keep_unique_group_key_value(artifact: any): string;

export function keep_unique_item_key_value(artifact: any): bigint;

export function merge_keep_unique_injected_rules_value(base_rules: any, custom_rules: any, candidate_keep_rules: any): any;

export function normalize_keep_unique_activation_value(activation: any, legacy_enabled: any): string;

export function normalize_keep_unique_combination_value(value: any, lookups: any): any;

export function normalize_keep_unique_count_mode_value(value: any): any;

export function normalize_keep_unique_expected_group_domain_value(payload: any): any;

export function normalize_keep_unique_rule_value(value: any, lookups: any, generated_rule_id: string): any;

export function normalize_keep_unique_substat_match_value(value: any): string;

export function permutations_i32_fast_flat(values: Int32Array): Int32Array;

export function prepare_hsf_builder_config_value(payload: any): any;

export function resolve_auto_rarity_code_for_builder_value(payload: any): number;

export function resolve_keep_unique_rules_with_metasets_value(rules: any, metasets: any): any;

export function sort_keep_unique_combination_value(combination: any): any;

export function sort_keep_unique_substats_value(values: any): any;

export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly auto_rarity_addition_levels_for_code_value: (a: number) => [number, number];
    readonly auto_rarity_includes_mythical_for_code_value: (a: number) => number;
    readonly auto_rarity_roll_levels_for_code_value: (a: number) => [number, number];
    readonly build_final_sell_rules_value: (a: any, b: any) => [number, number, number];
    readonly build_hsf_rules_runtime_value: (a: any) => [number, number, number];
    readonly build_keep_unique_rules_value: (a: any, b: any, c: bigint) => [number, number, number];
    readonly collect_and_compute_keep_unique_protection_value: (a: any, b: any, c: any, d: any, e: any, f: any, g: number, h: number) => [number, number, number];
    readonly collect_keep_unique_candidates_value: (a: any, b: any, c: any, d: any) => [number, number, number];
    readonly combinations_i32_fast_flat: (a: number, b: number, c: number) => [number, number];
    readonly compute_keep_unique_protection_value: (a: any, b: any, c: any, d: number, e: number) => [number, number, number];
    readonly compute_merged_rules_value: (a: any) => [number, number, number];
    readonly configure_value: (a: any, b: any) => [number, number];
    readonly dedupe_hsf_rules_for_export_value: (a: any) => [number, number, number];
    readonly evaluate_value: (a: any, b: any) => [number, number, number];
    readonly expand_auto_flex_rarity_branches_value: (a: any, b: number) => [number, number, number];
    readonly finalize_generated_rules_value: (a: any, b: number) => [number, number, number];
    readonly find_obsolete_value: (a: any) => [number, number, number];
    readonly flatten_rule_batches_with_total_limit_value: (a: bigint, b: bigint, c: any) => [number, number, number];
    readonly hash_keep_unique_combination_value: (a: any) => [number, number, number, number];
    readonly intro_assignments_for_combo_fast_flat: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly keep_unique_count_key_value: (a: any, b: any) => [number, number, number, number];
    readonly keep_unique_group_key_value: (a: any) => [number, number, number, number];
    readonly keep_unique_item_key_value: (a: any) => [bigint, number, number];
    readonly merge_keep_unique_injected_rules_value: (a: any, b: any, c: any) => [number, number, number];
    readonly normalize_keep_unique_activation_value: (a: any, b: any) => [number, number, number, number];
    readonly normalize_keep_unique_combination_value: (a: any, b: any) => [number, number, number];
    readonly normalize_keep_unique_count_mode_value: (a: any) => [number, number, number];
    readonly normalize_keep_unique_expected_group_domain_value: (a: any) => [number, number, number];
    readonly normalize_keep_unique_rule_value: (a: any, b: any, c: number, d: number) => [number, number, number];
    readonly normalize_keep_unique_substat_match_value: (a: any) => [number, number, number, number];
    readonly permutations_i32_fast_flat: (a: number, b: number) => [number, number];
    readonly prepare_hsf_builder_config_value: (a: any) => [number, number, number];
    readonly resolve_auto_rarity_code_for_builder_value: (a: any) => [number, number, number];
    readonly resolve_keep_unique_rules_with_metasets_value: (a: any, b: any) => [number, number, number];
    readonly sort_keep_unique_combination_value: (a: any) => [number, number, number];
    readonly sort_keep_unique_substats_value: (a: any) => [number, number, number];
    readonly version: () => [number, number];
    readonly fingerprint_merged_rules_value: (a: any) => [number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
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
