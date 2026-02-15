import type { LevelMilestone } from '../types'
import {
  getCombinationsI32WithLoadedWasm,
  getIntroAssignmentsForComboWithLoadedWasm,
  getPermutationsI32WithLoadedWasm,
} from '../wasm/wasmRuleEngine'

// Pure combinatorics helpers keep the builder readable and testable. They use
// straightforward backtracking so we can reason about deterministic ordering.
// Generate all combinations of size k from array a (without repetition).
// Returns an array of arrays, each a distinct selection of k items in order of indices.
export function combinations<T>(a: T[], k: number): T[][] {
  if (k <= 0) return [[]]
  if (k > a.length) return []
  // Use index rows so this helper stays generic while loops run inside wasm.
  const indices = Array.from({ length: a.length }, (_, idx) => idx)
  const indexRows = getCombinationsI32WithLoadedWasm(indices, k)
  return indexRows.map((row) => row.map((idx) => a[idx]!))
}

export function permutations<T>(a: T[]): T[][] {
  if (a.length <= 1) return [a.slice()]
  // Use index rows so this helper stays generic while loops run inside wasm.
  const indices = Array.from({ length: a.length }, (_, idx) => idx)
  const indexRows = getPermutationsI32WithLoadedWasm(indices)
  return indexRows.map((row) => row.map((idx) => a[idx]!))
}

// Enumerate every way base rolls and additions can be scheduled across the
// selected substats. The builder uses this to model how rolls unlock per level.
// Enumerate every way base rolls and additions can be scheduled across the
// selected substats. The builder uses this to model how rolls unlock per level.
export function introAssignmentsForCombo(
  count: number,
  baseSlots: number,
  additionLevels: LevelMilestone[],
  forcedBase: number[],
): number[][] {
  if (count <= 0) return [[]]
  // Intro scheduling loops are WASM-only in this branch.
  const wasmRows = getIntroAssignmentsForComboWithLoadedWasm({
    count,
    baseSlots,
    additionLevels: additionLevels.map((level) => Number(level)),
    forcedBase: forcedBase.map((idx) => Number(idx)),
  })
  return wasmRows
}
