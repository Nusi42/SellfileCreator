/**
 * rulesFilter.ts
 *
 * View-only filters for HSF preview table. Does not affect export.
 * The filter state is strictly typed and pure predicate builders are provided
 * so the table can derive a filtered rules array without side effects.
 */
import type { HsfRule } from './hsfTypes'
import { mainToVariant, subToVariant, type ArtifactSetId, type ArtifactTypeId, type FactionId, StatVariant } from './types'

// Tri-state for handling explicit "Any" fields in rules.
export type AnyMode = 'off' | 'include' | 'only'

export type SubstatMatchMode = 'all' | 'any'

export interface RulesFilterState {
  sets: { selected: ArtifactSetId[]; metaSelected?: string[]; anyMode: AnyMode; match?: 'any' | 'all' }
  slots: { selected: ArtifactTypeId[]; anyMode: AnyMode }
  rank: { min?: 1|2|3|4|5|6; max?: 1|2|3|4|5|6; anyMode: AnyMode }
  rarity: { min?: 1|2|3|4|5|6; max?: 1|2|3|4|5|6; anyMode: AnyMode }
  level: { selected: Array<0|4|8|12|16>; anyMode: AnyMode }
  main: { selected: StatVariant[]; anyMode: AnyMode }
  sub: { selected: StatVariant[]; mode: SubstatMatchMode; wildcardMode: AnyMode }
  faction: { selected: FactionId[]; anyMode: AnyMode }
}

export const DEFAULT_RULES_FILTER_STATE: RulesFilterState = {
  sets: { selected: [], anyMode: 'include', match: 'any' },
  slots: { selected: [], anyMode: 'include' },
  rank: { anyMode: 'include' },
  rarity: { anyMode: 'include' },
  level: { selected: [], anyMode: 'include' },
  main: { selected: [], anyMode: 'include' },
  sub: { selected: [], mode: 'all', wildcardMode: 'include' },
  faction: { selected: [], anyMode: 'include' },
}

export function isRulesFilterActive(f: RulesFilterState): boolean {
  const a = f.sets.selected.length > 0 || (f.sets.metaSelected?.length ?? 0) > 0 || f.sets.anyMode !== 'include' || f.sets.match === 'all'
  const b = f.slots.selected.length > 0 || f.slots.anyMode !== 'include'
  const c = (f.rank.min !== undefined || f.rank.max !== undefined) || f.rank.anyMode !== 'include'
  const d = (f.rarity.min !== undefined || f.rarity.max !== undefined) || f.rarity.anyMode !== 'include'
  const e = f.level.selected.length > 0 || f.level.anyMode !== 'include'
  const g = f.main.selected.length > 0 || f.main.anyMode !== 'include'
  const h = f.sub.selected.length > 0 || f.sub.wildcardMode !== 'include' || f.sub.mode !== 'all'
  const i = f.faction.selected.length > 0 || f.faction.anyMode !== 'include'
  return a || b || c || d || e || g || h || i
}

// Coverage helpers for Rank and Rarity codes (map rule code -> set of underlying values 1..6).
function rankCoverage(code?: number): Set<1|2|3|4|5|6> {
  const all: Array<1|2|3|4|5|6> = [1,2,3,4,5,6]
  if (code === undefined || code === null || code === 0) return new Set(all)
  const n = Number(code)
  if (n >= 1 && n <= 6) return new Set([n as 1|2|3|4|5|6])
  if (n >= 7 && n <= 11) return new Set(all.filter(v => v >= (n - 6)) as Array<1|2|3|4|5|6>)
  if (n >= 12 && n <= 16) return new Set(all.filter(v => v <= (n - 10)) as Array<1|2|3|4|5|6>)
  return new Set(all)
}

function rarityCoverage(code?: number): Set<1|2|3|4|5|6> {
  const all: Array<1|2|3|4|5|6> = [1,2,3,4,5,6] // Common..Mythical
  if (code === undefined || code === null || code === 0) return new Set(all)
  const n = Number(code)
  switch (n) {
    case 1: case 2: case 3: case 4: case 5: case 15: return new Set([(n === 15 ? 6 : n) as 1|2|3|4|5|6])
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

// Predicate builders

function matchesAnyModeForArrayField<T extends number>(field: T[] | undefined, anyMode: AnyMode): boolean | null {
  const isAny = !field || field.length === 0
  if (anyMode === 'only') return isAny
  if (anyMode === 'off') return !isAny
  return null // include => no decision, defer to other filters
}

export function filterHsfRules(rules: HsfRule[], f: RulesFilterState): HsfRule[] {
  const selectedSets = new Set(f.sets.selected.map(Number))
  const selectedSlots = new Set(f.slots.selected.map(Number))
  const selectedLevels = new Set(f.level.selected)
  const selectedMain = new Set(f.main.selected.map(Number))
  const selectedSub = new Set(f.sub.selected.map(Number))
  const selectedFactions = new Set(f.faction.selected.map(Number))

  const rankMin = f.rank.min ?? 1
  const rankMax = f.rank.max ?? 6
  const rarityMin = f.rarity.min ?? 1
  const rarityMax = f.rarity.max ?? 6

  return rules.filter((r) => {
    // Sets
    const setsAnyDecision = matchesAnyModeForArrayField(r.ArtifactSet, f.sets.anyMode)
    if (setsAnyDecision !== null) { if (!setsAnyDecision) return false } else {
      if (selectedSets.size > 0) {
        const ruleSets = new Set((r.ArtifactSet || []).map(Number))
        if ((f.sets.match ?? 'any') === 'all') {
          for (const s of selectedSets) { if (!ruleSets.has(s)) return false }
        } else {
          let ok = false
          for (const s of selectedSets) { if (ruleSets.has(s)) { ok = true; break } }
          if (!ok) return false
        }
      }
    }

    // Slots
    const slotsAnyDecision = matchesAnyModeForArrayField(r.ArtifactType, f.slots.anyMode)
    if (slotsAnyDecision !== null) { if (!slotsAnyDecision) return false } else {
      if (selectedSlots.size > 0) {
        const ruleSlots = new Set((r.ArtifactType || []).map(Number))
        let ok = false
        for (const s of selectedSlots) { if (ruleSlots.has(s)) { ok = true; break } }
        if (!ok) return false
      }
    }

    // Rank (intersects selected [min..max])
    if (f.rank.anyMode === 'only') { if ((r.Rank ?? 0) !== 0) return false }
    else if (f.rank.anyMode === 'off') { if ((r.Rank ?? 0) === 0) return false }
    else {
      const cov = rankCoverage(r.Rank)
      let has = false
      for (let v = rankMin; v <= rankMax; v++) { if (cov.has(v as 1|2|3|4|5|6)) { has = true; break } }
      if (!has) return false
    }

    // Rarity (intersects selected [min..max])
    if (f.rarity.anyMode === 'only') { if ((r.Rarity ?? 0) !== 0) return false }
    else if (f.rarity.anyMode === 'off') { if ((r.Rarity ?? 0) === 0) return false }
    else {
      const cov = rarityCoverage(r.Rarity)
      // Map selected min/max (1..6) into coverage 1..6 where Mythical=6
      let has = false
      for (let v = rarityMin; v <= rarityMax; v++) { if (cov.has(v as 1|2|3|4|5|6)) { has = true; break } }
      if (!has) return false
    }

    // Level
    if (f.level.anyMode === 'only') { if ((r.LVLForCheck ?? 99) !== 99) return false }
    else if (f.level.anyMode === 'off') { if ((r.LVLForCheck ?? 99) === 99) return false }
    else {
      if (selectedLevels.size > 0) {
        const lvl = (r.LVLForCheck ?? 99) as number
        if (lvl !== 99 && !selectedLevels.has(lvl as 0|4|8|12|16)) return false
        if (lvl === 99 && !selectedLevels.has(99 as never)) return false
      }
    }

    // Main stat
    if (f.main.anyMode === 'only') { if (r.MainStatID !== -1) return false }
    else if (f.main.anyMode === 'off') { if (r.MainStatID === -1) return false }
    else {
      if (selectedMain.size > 0) {
        const mv = mainToVariant(r.MainStatID, r.MainStatF)
        if (!selectedMain.has(Number(mv))) return false
      }
    }

    // Substats
    const subs = (r.Substats || []).filter(s => !s.NotAvailable)
    const hasWildcard = subs.some(s => s.ID === -1)
    if (f.sub.wildcardMode === 'only') { if (!hasWildcard) return false }
    else if (f.sub.wildcardMode === 'off') { if (hasWildcard) return false }

    if (selectedSub.size > 0) {
      const ruleSubs = new Set(subs.map(s => Number(subToVariant(s.ID, s.IsFlat))))
      if (f.sub.mode === 'all') {
        for (const v of selectedSub) { if (!ruleSubs.has(v)) return false }
      } else {
        let hit = false
        for (const v of selectedSub) { if (ruleSubs.has(v)) { hit = true; break } }
        if (!hit) return false
      }
    }

    // Faction
    if (f.faction.anyMode === 'only') { if ((r.Faction ?? 0) !== 0) return false }
    else if (f.faction.anyMode === 'off') { if ((r.Faction ?? 0) === 0) return false }
    else {
      if (selectedFactions.size > 0) {
        const code = Number(r.Faction ?? 0)
        if (code !== 0 && !selectedFactions.has(code)) return false
      }
    }

    return true
  })
}
