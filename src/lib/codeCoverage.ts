/**
 * codeCoverage.ts
 *
 * Shared helpers to map HSF rank/rarity codes (0..16) to sets of underlying
 * discrete values used by UI filters and evaluators.
 */

/** Map a rank code (0..16) to a set of star values 1..6. */
export function rankCoverage(code?: number): Set<1|2|3|4|5|6> {
  const all: Array<1|2|3|4|5|6> = [1, 2, 3, 4, 5, 6]
  if (code === undefined || code === null || code === 0) return new Set(all)
  const n = Number(code)
  if (n >= 1 && n <= 6) return new Set([n as 1|2|3|4|5|6])
  if (n >= 7 && n <= 11) return new Set(all.filter(v => v >= (n - 6)) as Array<1|2|3|4|5|6>)
  if (n >= 12 && n <= 16) return new Set(all.filter(v => v <= (n - 10)) as Array<1|2|3|4|5|6>)
  return new Set(all)
}

/** Map a rarity code (0..16) to a set of discrete rarity values 1..6 (Common..Mythical). */
export function rarityCoverage(code?: number): Set<1|2|3|4|5|6> {
  const all: Array<1|2|3|4|5|6> = [1, 2, 3, 4, 5, 6] // Common..Mythical
  if (code === undefined || code === null || code === 0) return new Set(all)
  const n = Number(code)
  switch (n) {
    case 1: case 2: case 3: case 4: case 5: case 15:
      return new Set([(n === 15 ? 6 : n) as 1|2|3|4|5|6])
    case 6: return new Set(all)
    case 7: return new Set(all.filter(v => v >= 2) as Array<1|2|3|4|5|6>)
    case 8: return new Set(all.filter(v => v >= 3) as Array<1|2|3|4|5|6>)
    case 9: return new Set(all.filter(v => v >= 4) as Array<1|2|3|4|5|6>)
    case 16: return new Set(all.filter(v => v >= 5) as Array<1|2|3|4|5|6>)
    case 10: return new Set(all.filter(v => v <= 2) as Array<1|2|3|4|5|6>)
    case 11: return new Set(all.filter(v => v <= 3) as Array<1|2|3|4|5|6>)
    case 12: return new Set(all.filter(v => v <= 4) as Array<1|2|3|4|5|6>)
    case 13: return new Set(all.filter(v => v <= 5) as Array<1|2|3|4|5|6>)
    case 14: return new Set(all) // ≤ Mythical => all
  }
  return new Set(all)
}

