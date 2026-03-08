/* tslint:disable */
/* eslint-disable */

export function auto_rarity_addition_levels_for_code_value(rarity_code: number): Int32Array;

export function auto_rarity_includes_mythical_for_code_value(rarity_code: number): boolean;

export function auto_rarity_roll_levels_for_code_value(rarity_code: number): Int32Array;

export function build_final_sell_rules_value(remainder: any, all_known_set_ids: any): any;

export function build_hsf_rules_runtime_value(payload: any): any;

export function build_safeguard_rules_value(rules: any, detection: any, recipe_id_base: bigint): any;

export function collect_and_compute_safeguard_protection_value(rows: any, rules: any, recipe_modes: any, ignore_safeguard_recipe_indices: any, safeguard_rules: any, expected_groups_payload: any, enabled: boolean, now: number): any;

export function collect_safeguard_candidates_value(rows: any, rules: any, recipe_modes: any, ignore_safeguard_recipe_indices: any): any;

export function combinations_i32_fast_flat(values: Int32Array, pick: number): Int32Array;

export function compute_merged_rules_value(payload: any): any;

export function compute_safeguard_protection_value(candidates: any, rules: any, expected_groups_by_rule_id: any, enabled: boolean, now: number): any;

export function configure_value(rules: any, recipe_modes: any): void;

export function dedupe_hsf_rules_for_export_value(rules: any): any;

export function evaluate_and_collect_safeguard_protection_value(rows: any, options: any, ignore_safeguard_recipe_indices: any, safeguard_rules: any, expected_groups_payload: any, enabled: boolean, now: number): any;

export function evaluate_value(items: any, options: any): any;

export function expand_auto_flex_rarity_branches_value(recipe: any, base_rarity_code: number): any;

export function finalize_generated_rules_value(entries: any, apply_obsolete_pruning: boolean): any;

export function find_obsolete_value(rules: any): any;

export function flatten_rule_batches_with_total_limit_value(base_count: bigint, total_limit: bigint, batches: any): any;

export function hash_safeguard_combination_value(combination: any): string;

export function intro_assignments_for_combo_fast_flat(count: number, base_slots: number, addition_levels: Int32Array, forced_base: Int32Array): Int32Array;

export function merge_safeguard_injected_rules_value(base_rules: any, custom_rules: any, candidate_safeguard_rules: any): any;

export function normalize_safeguard_expected_group_domain_value(payload: any): any;

export function permutations_i32_fast_flat(values: Int32Array): Int32Array;

export function prepare_hsf_builder_recipe_value(payload: any): any;

export function resolve_auto_rarity_code_for_builder_value(payload: any): number;

export function resolve_safeguard_rules_with_metasets_value(rules: any, metasets: any): any;

export function safeguard_count_key_value(artifact: any, count_mode: any): string;

export function safeguard_group_key_value(artifact: any): string;

export function safeguard_item_key_value(artifact: any): bigint;

export function sort_safeguard_combination_value(combination: any): any;

export function sort_safeguard_substats_value(values: any): any;

export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly auto_rarity_addition_levels_for_code_value: (a: number) => [number, number];
    readonly auto_rarity_includes_mythical_for_code_value: (a: number) => number;
    readonly auto_rarity_roll_levels_for_code_value: (a: number) => [number, number];
    readonly build_final_sell_rules_value: (a: any, b: any) => [number, number, number];
    readonly build_hsf_rules_runtime_value: (a: any) => [number, number, number];
    readonly build_safeguard_rules_value: (a: any, b: any, c: bigint) => [number, number, number];
    readonly collect_and_compute_safeguard_protection_value: (a: any, b: any, c: any, d: any, e: any, f: any, g: number, h: number) => [number, number, number];
    readonly collect_safeguard_candidates_value: (a: any, b: any, c: any, d: any) => [number, number, number];
    readonly combinations_i32_fast_flat: (a: number, b: number, c: number) => [number, number];
    readonly compute_merged_rules_value: (a: any) => [number, number, number];
    readonly compute_safeguard_protection_value: (a: any, b: any, c: any, d: number, e: number) => [number, number, number];
    readonly configure_value: (a: any, b: any) => [number, number];
    readonly dedupe_hsf_rules_for_export_value: (a: any) => [number, number, number];
    readonly evaluate_and_collect_safeguard_protection_value: (a: any, b: any, c: any, d: any, e: any, f: number, g: number) => [number, number, number];
    readonly evaluate_value: (a: any, b: any) => [number, number, number];
    readonly expand_auto_flex_rarity_branches_value: (a: any, b: number) => [number, number, number];
    readonly finalize_generated_rules_value: (a: any, b: number) => [number, number, number];
    readonly find_obsolete_value: (a: any) => [number, number, number];
    readonly flatten_rule_batches_with_total_limit_value: (a: bigint, b: bigint, c: any) => [number, number, number];
    readonly hash_safeguard_combination_value: (a: any) => [number, number, number, number];
    readonly intro_assignments_for_combo_fast_flat: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly merge_safeguard_injected_rules_value: (a: any, b: any, c: any) => [number, number, number];
    readonly normalize_safeguard_expected_group_domain_value: (a: any) => [number, number, number];
    readonly permutations_i32_fast_flat: (a: number, b: number) => [number, number];
    readonly prepare_hsf_builder_recipe_value: (a: any) => [number, number, number];
    readonly resolve_auto_rarity_code_for_builder_value: (a: any) => [number, number, number];
    readonly resolve_safeguard_rules_with_metasets_value: (a: any, b: any) => [number, number, number];
    readonly safeguard_count_key_value: (a: any, b: any) => [number, number, number, number];
    readonly safeguard_group_key_value: (a: any) => [number, number, number, number];
    readonly safeguard_item_key_value: (a: any) => [bigint, number, number];
    readonly sort_safeguard_combination_value: (a: any) => [number, number, number];
    readonly sort_safeguard_substats_value: (a: any) => [number, number, number];
    readonly version: () => [number, number];
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
