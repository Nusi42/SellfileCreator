/**
 * stateMergeAlgebra.ts
 *
 * Generic set-algebra engine for "OR/combine" preset application, shared by the filter presets
 * (`rulesFilterMerge.ts`) and the sort presets (`gearInspectorSortMerge.ts`). A state type is
 * described once as a list of per-field operations; the engine derives three operations that can
 * never drift apart:
 *
 *   merge(base, add)     → OR/union `add` into `base`.
 *   contains(base, add)  → true iff merge(base, add) deep-equals base (apply is a no-op).
 *   subtract(base, add)  → inverse of merge: remove `add`'s contributions.
 *
 * Field kinds (relative to each state's default):
 *   - arrayField  → ordered set-union / subset / set-difference (base order preserved, `add`'s new
 *                   entries appended) — used for selection lists and ordered sort priorities alike.
 *   - scalarField → `add` overrides only where it differs from the default; contains = (add at
 *                   default) || (base equals add); subtract = reset to default when add differs.
 *   - flagsField  → per-flag OR / subset / clear over a fixed key list.
 *
 * The invariant `contains(b,a) ⟺ merge(b,a) === b` holds for every field kind, so `subtract` is a
 * clean inverse and pinned-preset toggles stay consistent.
 */

// Deep clone via JSON — preset state is plain data (no functions/Dates), matching the snapshot
// cloning used throughout the preset code.
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

// Order-independent structural equality: canonicalize object keys before comparing so the same
// data with different key order compares equal (snapshot vs live state can differ in key order).
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const rec = value as Record<string, unknown>
  const keys = Object.keys(rec).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(rec[k])}`).join(',')}}`
}
export const stableEqual = (a: unknown, b: unknown): boolean => stableStringify(a) === stableStringify(b)

// --- array set helpers (keyed identity) -----------------------------------

export const unionBy = <E>(base: readonly E[], add: readonly E[], keyOf: (x: E) => string | number): E[] => {
  // Base entries first (base wins on key collision, preserving order), then add's new entries.
  const seen = new Set(base.map(keyOf))
  const out = [...base]
  for (const item of add) {
    const key = keyOf(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

export const subsetBy = <E>(add: readonly E[], base: readonly E[], keyOf: (x: E) => string | number): boolean => {
  // Every add key must already be present in base for the union to be a no-op.
  const have = new Set(base.map(keyOf))
  return add.every((item) => have.has(keyOf(item)))
}

export const differenceBy = <E>(base: readonly E[], add: readonly E[], keyOf: (x: E) => string | number): E[] => {
  // Drop every base entry whose key appears in add.
  const remove = new Set(add.map(keyOf))
  return base.filter((item) => !remove.has(keyOf(item)))
}

// --- per-field operation contract -----------------------------------------

// Each field op reads leaf values from base/add and writes results into a mutable `out` that starts
// as a deep clone of base, so a single field list backs merge/contains/subtract.
export type FieldOp<T> = {
  merge: (base: T, add: T, out: T) => void
  contains: (base: T, add: T) => boolean
  subtract: (base: T, add: T, out: T) => void
  // True for "mode" fields (scalar/object override) as opposed to additive selections (arrays/flags).
  // Un-OR re-derives these from surviving presets instead of removing them, so a shared mode (e.g. a
  // common slot anyMode) that a disjoint survivor still needs is preserved.
  scalar?: boolean
}

const identityKey = <E>(x: E): string | number => x as unknown as string | number

// Union-array field: read the leaf array, union/subset/difference by `keyOf`.
export const arrayField = <T, E>(
  read: (s: T) => readonly E[] | undefined,
  write: (out: T, value: E[]) => void,
  keyOf: (x: E) => string | number = identityKey,
): FieldOp<T> => ({
  merge: (b, a, out) => write(out, unionBy(read(b) ?? [], read(a) ?? [], keyOf)),
  contains: (b, a) => subsetBy(read(a) ?? [], read(b) ?? [], keyOf),
  subtract: (b, a, out) => write(out, differenceBy(read(b) ?? [], read(a) ?? [], keyOf)),
})

// Scalar/object override field: `add` wins only when it differs from `def`.
export const scalarField = <T, V>(
  read: (s: T) => V,
  write: (out: T, value: V) => void,
  def: V,
): FieldOp<T> => ({
  merge: (b, a, out) => write(out, clone(stableEqual(read(a), def) ? read(b) : read(a))),
  contains: (b, a) => stableEqual(read(a), def) || stableEqual(read(b), read(a)),
  subtract: (b, a, out) => write(out, clone(stableEqual(read(a), def) ? read(b) : def)),
  scalar: true,
})

// Boolean-flag group: per-flag OR / subset / clear over a fixed key list.
export const flagsField = <T, K extends string>(
  read: (s: T) => Record<K, boolean> | undefined,
  write: (out: T, value: Record<K, boolean>) => void,
  keys: readonly K[],
  def: Record<K, boolean>,
): FieldOp<T> => ({
  merge: (b, a, out) => {
    const bv = read(b) ?? def
    const av = read(a) ?? def
    const next = {} as Record<K, boolean>
    for (const k of keys) next[k] = Boolean(bv[k]) || Boolean(av[k])
    write(out, next)
  },
  contains: (b, a) => {
    const bv = read(b) ?? def
    const av = read(a) ?? def
    // Every flag the addition turns on must already be on in base.
    return keys.every((k) => !av[k] || Boolean(bv[k]))
  },
  subtract: (b, a, out) => {
    const bv = read(b) ?? def
    const av = read(a) ?? def
    const next = {} as Record<K, boolean>
    for (const k of keys) next[k] = Boolean(bv[k]) && !av[k]
    write(out, next)
  },
})

// --- run a field list -----------------------------------------------------

/** OR/union `add` into `base`, returning a new state (inputs untouched). */
export const runMerge = <T>(ops: readonly FieldOp<T>[], base: T, add: T): T => {
  const out = clone(base)
  for (const op of ops) op.merge(base, add, out)
  return out
}

/** True iff merging `add` into `base` would change nothing (base already covers add). */
export const runContains = <T>(ops: readonly FieldOp<T>[], base: T, add: T): boolean =>
  ops.every((op) => op.contains(base, add))

/** Inverse of merge: remove `add`'s contributions from `base`, returning a new state. */
export const runSubtract = <T>(ops: readonly FieldOp<T>[], base: T, add: T): T => {
  const out = clone(base)
  for (const op of ops) op.subtract(base, add, out)
  return out
}

/**
 * Re-apply only the "mode" (scalar) fields of `add` onto `base`, leaving additive selections
 * (arrays/flags) untouched. Used by un-OR to restore a shared mode that a surviving preset still
 * relies on after another preset is subtracted — without re-adding the survivor's selections.
 */
export const runReapplyScalars = <T>(ops: readonly FieldOp<T>[], base: T, add: T): T => {
  const out = clone(base)
  for (const op of ops) if (op.scalar) op.merge(base, add, out)
  return out
}
