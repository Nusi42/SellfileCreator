/**
 * gearInspectorSortMerge.ts
 *
 * Set-algebra over `GearInspectorSubstatSortState` for the "OR" (combine) apply mode of sort
 * presets — i.e. "stacking" sorts. The generic engine lives in `stateMergeAlgebra.ts`; here we
 * only declare the per-field op list relative to DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE.
 *
 * The headline field is `priorities`: an ordered list that stacks deterministically — the current
 * sort levels keep their order and the preset's new levels are appended (toggle / config order,
 * top-to-bottom), deduped by sort key. Everything else follows the shared rules: lists union,
 * scalars/objects override only where the preset differs from default.
 */
import {
  DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
  type GearInspectorSubstatSortState,
} from '../state/gearInspectorSubstatSortPreferences'
import type { GearInspectorSortKey } from './gearInspectorSort'
import {
  clone,
  arrayField as makeArrayField,
  scalarField as makeScalarField,
  runMerge,
  runContains,
  runSubtract,
  runReapplyScalars,
  type FieldOp,
} from './stateMergeAlgebra'

type SortState = GearInspectorSubstatSortState
const D = DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE

// Bind the generic combinators to SortState so the field list stays terse.
const arrayField = <E>(
  read: (s: SortState) => readonly E[] | undefined,
  write: (out: SortState, value: E[]) => void,
  keyOf?: (x: E) => string | number,
): FieldOp<SortState> => makeArrayField(read, write, keyOf)
const scalarField = <V>(
  read: (s: SortState) => V,
  write: (out: SortState, value: V) => void,
  def: V,
): FieldOp<SortState> => makeScalarField(read, write, def)

// Sort keys are numeric (StatVariant or synthetic key); compare/dedupe by their numeric value.
const sortKeyId = (key: GearInspectorSortKey): number => Number(key)

const SORT_FIELD_OPS: readonly FieldOp<SortState>[] = [
  // Priority levels — stack in toggle order: current levels first, then the preset's new ones.
  arrayField<GearInspectorSortKey>((s) => s.priorities, (o, v) => { o.priorities = v }, sortKeyId),
  // Per-key flip overrides (union by key).
  arrayField<GearInspectorSortKey>((s) => s.flipped, (o, v) => { o.flipped = v }, sortKeyId),
  // Global ascending/descending direction (scalar override; default 'desc').
  scalarField((s) => s.direction, (o, v) => { o.direction = v }, D.direction),
  // Normalized mode + its source toggles (scalar overrides; false/true defaults).
  scalarField((s) => s.normalized, (o, v) => { o.normalized = v }, D.normalized),
  scalarField((s) => s.normalizedUseActiveOverlay, (o, v) => { o.normalizedUseActiveOverlay = v }, D.normalizedUseActiveOverlay),
  scalarField((s) => s.normalizedSourceIncludeCustom, (o, v) => { o.normalizedSourceIncludeCustom = v }, D.normalizedSourceIncludeCustom),
  // Enabled normalized preset sources (union by id).
  arrayField<number>((s) => s.normalizedSourcePresetIds, (o, v) => { o.normalizedSourcePresetIds = v as SortState['normalizedSourcePresetIds'] }),
  // Per-substat weight map (object override; niche — presets rarely carry weights).
  scalarField((s) => s.weights, (o, v) => { o.weights = v }, D.weights),
  // Grouping configuration (object override; default flat).
  scalarField((s) => s.grouping, (o, v) => { o.grouping = v }, D.grouping),
  // Exclude-glyphs toggle (scalar override; default true).
  scalarField((s) => s.excludeGlyphs, (o, v) => { o.excludeGlyphs = v }, D.excludeGlyphs),
]

/** OR/stack `add` onto `base`, returning a new sort state (inputs untouched). */
export const mergeSortState = (base: SortState, add: SortState): SortState =>
  runMerge(SORT_FIELD_OPS, base, add)

/** True iff stacking `add` onto `base` would change nothing (base already covers add). */
export const sortStateContains = (base: SortState, add: SortState): boolean =>
  runContains(SORT_FIELD_OPS, base, add)

/** Inverse of merge: remove `add`'s contributions (its priority levels, toggles) from `base`. */
export const subtractSortState = (base: SortState, add: SortState): SortState =>
  runSubtract(SORT_FIELD_OPS, base, add)

/** Re-apply only `add`'s scalar "mode" fields (direction, grouping, normalized, …) — used by un-OR. */
export const reapplySortScalars = (base: SortState, add: SortState): SortState =>
  runReapplyScalars(SORT_FIELD_OPS, base, add)

/** True iff `add` deviates from the default sort state (i.e. it would contribute something). */
export const sortStateHasContribution = (add: SortState): boolean =>
  !sortStateContains(clone(D), add)
