/**
 * arraysEqual
 *
 * Compares two arrays using strict equality for each index. Intended for primitive value arrays
 * (the current callers pass numeric indices) and bails early when lengths differ.
 */
export function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

export type ArraysEqual = typeof arraysEqual
