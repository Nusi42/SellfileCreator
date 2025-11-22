import type { LevelMilestone } from '../types'

// Pure combinatorics helpers keep the builder readable and testable. They use
// straightforward backtracking so we can reason about deterministic ordering.
// Generate all combinations of size k from array a (without repetition).
// Returns an array of arrays, each a distinct selection of k items in order of indices.
export function combinations<T>(a: T[], k: number): T[][] {
  if (k <= 0) return [[]]
  if (k > a.length) return []
  const res: T[][] = []
  function backtrack(start: number, path: T[]) {
    if (path.length === k) { res.push([...path]); return }
    for (let i = start; i < a.length; i++) {
      path.push(a[i]!)
      backtrack(i + 1, path)
      path.pop()
    }
  }
  backtrack(0, [])
  return res
}

export function permutations<T>(a: T[]): T[][] {
  if (a.length <= 1) return [a.slice()]
  const res: T[][] = []
  const used = new Array<boolean>(a.length).fill(false)
  const path: T[] = []
  function backtrack() {
    if (path.length === a.length) {
      res.push(path.slice())
      return
    }
    for (let i = 0; i < a.length; i++) {
      if (used[i]!) continue
      used[i] = true
      path.push(a[i]!)
      backtrack()
      path.pop()
      used[i] = false
    }
  }
  backtrack()
  return res
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
  const totalBase = Math.max(0, Math.min(baseSlots, count))
  const additionNeeded = Math.max(0, count - totalBase)
  const indices = Array.from({ length: count }, (_, idx) => idx)
  const forcedSet = new Set<number>()
  for (const idx of forcedBase) {
    if (idx >= 0 && idx < count) forcedSet.add(idx)
  }
  const forcedIndices = Array.from(forcedSet).sort((a, b) => a - b)
  const forcedPick = Math.min(totalBase, forcedIndices.length)
  const optionalPick = totalBase - forcedPick
  const optionalIndices = indices.filter(idx => !forcedSet.has(idx))
  if (optionalPick > optionalIndices.length) return []
  const additionLevelCombos: LevelMilestone[][] = additionNeeded > 0
    ? combinations(additionLevels, additionNeeded)
    : [[]]
  const results: number[][] = []
  const seen = new Set<string>()
  const forcedCombos = forcedPick > 0 ? combinations(forcedIndices, forcedPick) : [[]]
  const optionalCombos = optionalPick > 0 ? combinations(optionalIndices, optionalPick) : [[]]
  for (const forcedCombo of forcedCombos) {
    for (const optCombo of optionalCombos) {
      const baseCombo = [...forcedCombo, ...optCombo]
      if (baseCombo.length !== totalBase) continue
      const baseSet = new Set(baseCombo)
      const remainingIndices = indices.filter(idx => !baseSet.has(idx))
      const orders = additionNeeded > 0 ? permutations(remainingIndices) : [[]]
      for (const additionCombo of additionLevelCombos) {
        if (additionCombo.length !== additionNeeded) continue
        for (const order of orders) {
          if (order.length !== additionNeeded) continue
          const intro = new Array<number>(count).fill(0)
          for (const idx of baseCombo) intro[idx]! = 0
          for (let i = 0; i < additionNeeded; i++) {
            const targetIdx = order[i]!
            intro[targetIdx] = additionCombo[i]!
          }
          const key = intro.join(',')
          if (seen.has(key)) continue
          seen.add(key)
          results.push(intro)
        }
      }
    }
  }
  return results
}
