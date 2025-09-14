/**
 * rulesFilter.ts
 *
 * View-only filters for HSF preview table. Does not affect export.
 * The filter state is strictly typed and pure predicate builders are provided
 * so the table can derive a filtered rules array without side effects.
 */
import type { HsfRule } from './hsfTypes'
import type { Metaset } from './metasets'
import { mainToVariant, subToVariant, type ArtifactSetId, type ArtifactTypeId, type FactionId, StatVariant } from './types'

// Tri-state for handling explicit "Any" fields in rules.
export type AnyMode = 'off' | 'include' | 'only'

export type SubstatMatchMode = 'all' | 'any'

export interface RulesFilterState {
  sets: { selected: ArtifactSetId[]; metaSelected?: string[]; anyMode: AnyMode; match?: 'any' | 'all' }
  slots: { selected: ArtifactTypeId[]; anyMode: AnyMode }
  // Rank: discrete buttons (1..6) instead of a contiguous range
  rank: { selected: Array<1|2|3|4|5|6>; anyMode: AnyMode }
  // Rarity: discrete buttons (Common..Mythical) instead of a contiguous range
  rarity: { selected: Array<1|2|3|4|5|6>; anyMode: AnyMode }
  level: { selected: Array<0|4|8|12|16>; anyMode: AnyMode }
  main: { selected: StatVariant[]; anyMode: AnyMode }
  sub: { selected: StatVariant[]; mode: SubstatMatchMode; wildcardMode: AnyMode }
  faction: { selected: FactionId[]; anyMode: AnyMode }
}

export const DEFAULT_RULES_FILTER_STATE: RulesFilterState = {
  sets: { selected: [], anyMode: 'include', match: 'any' },
  slots: { selected: [], anyMode: 'include' },
  rank: { selected: [], anyMode: 'include' },
  rarity: { selected: [], anyMode: 'include' },
  level: { selected: [], anyMode: 'include' },
  main: { selected: [], anyMode: 'include' },
  sub: { selected: [], mode: 'all', wildcardMode: 'include' },
  faction: { selected: [], anyMode: 'include' },
}

// Back-compat helpers: accept legacy range shapes (min/max) if present
function legacySelected<V extends 1|2|3|4|5|6>(obj: unknown): V[] {
  try {
    const o = obj as { selected?: V[]; min?: number; max?: number }
    if (Array.isArray(o?.selected)) return o!.selected as V[]
    if (typeof o?.min === 'number' && typeof o?.max === 'number') {
      const res: V[] = []
      for (let v = o.min; v <= o.max; v++) {
        if (v >= 1 && v <= 6) res.push(v as V)
      }
      return res
    }
  } catch {}
  return []
}

export function isRulesFilterActive(f: RulesFilterState): boolean {
  const a = (f.sets?.selected?.length ?? 0) > 0 || ((f.sets?.metaSelected)?.length ?? 0) > 0 || (f.sets?.anyMode ?? 'include') !== 'include' || f.sets?.match === 'all'
  const b = (f.slots?.selected?.length ?? 0) > 0 || (f.slots?.anyMode ?? 'include') !== 'include'
  const c = (legacySelected<1|2|3|4|5|6>(f.rank).length > 0) || ((f.rank?.anyMode) ?? 'include') !== 'include'
  const d = (legacySelected<1|2|3|4|5|6>(f.rarity).length > 0) || ((f.rarity?.anyMode) ?? 'include') !== 'include'
  const e = (f.level?.selected?.length ?? 0) > 0 || (f.level?.anyMode ?? 'include') !== 'include'
  const g = (f.main?.selected?.length ?? 0) > 0 || (f.main?.anyMode ?? 'include') !== 'include'
  const h = (f.sub?.selected?.length ?? 0) > 0 || (f.sub?.wildcardMode ?? 'include') !== 'include' || (f.sub?.mode ?? 'all') !== 'all'
  const i = (f.faction?.selected?.length ?? 0) > 0 || (f.faction?.anyMode ?? 'include') !== 'include'
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

export function filterHsfRules(rules: HsfRule[], f: RulesFilterState, metasets?: Metaset[]): HsfRule[] {
  const selectedSets = new Set((f.sets?.selected ?? []).map(Number))
  // Unroll metaset selections into explicit set IDs for filtering
  if (metasets && (f.sets?.metaSelected?.length ?? 0) > 0) {
    const metaSet = new Set<string>(f.sets!.metaSelected!)
    for (const m of metasets) {
      if (metaSet.has(m.id)) {
        for (const s of m.sets) selectedSets.add(Number(s))
      }
    }
  }
  const selectedSlots = new Set((f.slots?.selected ?? []).map(Number))
  const selectedLevels = new Set(f.level?.selected ?? [])
  const selectedMain = new Set((f.main?.selected ?? []).map(Number))
  const selectedSub = new Set((f.sub?.selected ?? []).map(Number))
  const selectedFactions = new Set((f.faction?.selected ?? []).map(Number))

  const selectedRanks = new Set(legacySelected<1|2|3|4|5|6>(f.rank))
  const selectedRarities = new Set(legacySelected<1|2|3|4|5|6>(f.rarity))

  return rules.filter((r) => {
    // Sets
    {
      const isAny = !r.ArtifactSet || (r.ArtifactSet.length === 0)
      const mode = f.sets.anyMode
      if (mode === 'only') {
        if (!isAny) return false
        // isAny passes; no further set matching needed
      } else if (mode === 'off') {
        if (isAny) return false
        // specified sets: proceed to selection matching (if any selected)
      }
      if (!isAny && selectedSets.size > 0) {
        // Hide "All Currently Known" remainder rows when a specific Set filter is applied
        if ((r as unknown as { __allKnownSets?: boolean }).__allKnownSets) return false
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

    // Rank (intersects selected discrete set)
    if (f.rank.anyMode === 'only') { if ((r.Rank ?? 0) !== 0) return false }
    else if (f.rank.anyMode === 'off') { if ((r.Rank ?? 0) === 0) return false }
    else if (selectedRanks.size > 0) {
      const cov = rankCoverage(r.Rank)
      let has = false
      for (const v of selectedRanks) { if (cov.has(v)) { has = true; break } }
      if (!has) return false
    }

    // Rarity (intersects selected discrete set)
    if (f.rarity.anyMode === 'only') { if ((r.Rarity ?? 0) !== 0) return false }
    else if (f.rarity.anyMode === 'off') { if ((r.Rarity ?? 0) === 0) return false }
    else if (selectedRarities.size > 0) {
      const cov = rarityCoverage(r.Rarity)
      let has = false
      for (const v of selectedRarities) { if (cov.has(v)) { has = true; break } }
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
    {
      const isAnyMain = (r.MainStatID ?? -1) === -1
      if (f.main.anyMode === 'only') {
        if (!isAnyMain) return false
        // Only unspecified mainstat allowed; ignore concrete selection
      } else if (f.main.anyMode === 'off') {
        if (isAnyMain) return false
        // Proceed to selection matching for specified mainstats
        if (selectedMain.size > 0) {
          const mv = mainToVariant(r.MainStatID, r.MainStatF)
          if (!selectedMain.has(Number(mv))) return false
        }
      } else { // include
        if (selectedMain.size > 0) {
          if (!isAnyMain) {
            const mv = mainToVariant(r.MainStatID, r.MainStatF)
            if (!selectedMain.has(Number(mv))) return false
          }
          // When include + isAnyMain, allow it to pass regardless of selection
        }
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
