/**
 * rulesFilter.ts
 *
 * View-only filters for HSF preview table. Does not affect export.
 * The filter state is strictly typed and pure predicate builders are provided
 * so the table can derive a filtered rules array without side effects.
 */
import type { HsfRule } from './hsfTypes'
import type { SellfileExportMode } from './hsfBuilder'
import type { Metaset } from './metasets'
import {
  mainToVariant,
  subToVariant,
  type ArtifactSetId,
  type ArtifactTypeId,
  type FactionId,
  StatVariant,
  StatId,
  LEVEL_ANY_SENTINEL,
  type LevelMilestone,
} from './types'
import { rankCoverage, rarityCoverage } from './codeCoverage'
import type { HsfRuleWithCfg } from './merge'

// Tri-state for handling explicit "Any" fields in rules.
export type AnyMode = 'off' | 'include' | 'only'

export type SubstatMatchMode = 'all' | 'any'

// Compact tri-state toggle used for simple boolean fields in filters.
// 'any' leaves the field unfiltered; 'yes' matches true/enabled; 'no' matches false/disabled.
export type Bool3 = 'any' | 'yes' | 'no'

export interface RulesFilterState {
  // Rule-level filters
  rule?: { keep: Bool3; use: Bool3 }
  sets: { selected: ArtifactSetId[]; metaSelected?: string[]; anyMode: AnyMode; match?: 'any' | 'all' }
  slots: { selected: ArtifactTypeId[]; anyMode: AnyMode }
  // Rank: discrete buttons (1..6) instead of a contiguous range
  rank: { selected: Array<1|2|3|4|5|6>; anyMode: AnyMode }
  // Rarity: discrete buttons (Common..Mythical) instead of a contiguous range
  rarity: { selected: Array<1|2|3|4|5|6>; anyMode: AnyMode }
  level: { selected: LevelMilestone[]; anyMode: AnyMode }
  main: { selected: StatVariant[]; anyMode: AnyMode }
  sub: { selected: StatVariant[]; mode: SubstatMatchMode; wildcardMode: AnyMode }
  faction: { selected: FactionId[]; anyMode: AnyMode }
  configName?: { query: string }
}

export const DEFAULT_RULES_FILTER_STATE: RulesFilterState = {
  rule: { keep: 'any', use: 'any' },
  sets: { selected: [], anyMode: 'include', match: 'any' },
  slots: { selected: [], anyMode: 'include' },
  rank: { selected: [], anyMode: 'include' },
  rarity: { selected: [], anyMode: 'include' },
  level: { selected: [], anyMode: 'include' },
  main: { selected: [], anyMode: 'include' },
  sub: { selected: [], mode: 'all', wildcardMode: 'include' },
  faction: { selected: [], anyMode: 'include' },
  configName: { query: '' },
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
  const ra = (f.rule?.keep ?? 'any') !== 'any' || (f.rule?.use ?? 'any') !== 'any'
  const a = (f.sets?.selected?.length ?? 0) > 0 || ((f.sets?.metaSelected)?.length ?? 0) > 0 || (f.sets?.anyMode ?? 'include') !== 'include' || f.sets?.match === 'all'
  const b = (f.slots?.selected?.length ?? 0) > 0 || (f.slots?.anyMode ?? 'include') !== 'include'
  const c = (legacySelected<1|2|3|4|5|6>(f.rank).length > 0) || ((f.rank?.anyMode) ?? 'include') !== 'include'
  const d = (legacySelected<1|2|3|4|5|6>(f.rarity).length > 0) || ((f.rarity?.anyMode) ?? 'include') !== 'include'
  const e = (f.level?.selected?.length ?? 0) > 0 || (f.level?.anyMode ?? 'include') !== 'include'
  const g = (f.main?.selected?.length ?? 0) > 0 || (f.main?.anyMode ?? 'include') !== 'include'
  const h = (f.sub?.selected?.length ?? 0) > 0 || (f.sub?.wildcardMode ?? 'include') !== 'include' || (f.sub?.mode ?? 'all') !== 'all'
  const i = (f.faction?.selected?.length ?? 0) > 0 || (f.faction?.anyMode ?? 'include') !== 'include'
  const j = Boolean(f.configName && typeof f.configName.query === 'string' && f.configName.query.length > 0)
  return ra || a || b || c || d || e || g || h || i || j
}

// Coverage helpers for Rank and Rarity codes (map rule code -> set of underlying values 1..6).
// Rank/Rarity coverage moved to shared helpers (single source of truth)

// Predicate builders

function matchesAnyModeForArrayField<T extends number>(field: T[] | undefined, anyMode: AnyMode): boolean | null {
  const isAny = !field || field.length === 0
  if (anyMode === 'only') return isAny
  if (anyMode === 'off') return !isAny
  return null // include => no decision, defer to other filters
}

export interface FilterHsfRulesResult<T extends HsfRule = HsfRule> {
  rules: T[]
  matchingConfigIndices: Set<number>
  configRuleCounts: Map<number, number>
}

export function filterHsfRules<T extends HsfRule>(
  rules: T[],
  f: RulesFilterState,
  metasets?: Metaset[],
  options?: { configNames?: Array<string | null | undefined>; configModes?: SellfileExportMode[] },
): FilterHsfRulesResult<T> {
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
  const selectedLevels = new Set<LevelMilestone>(f.level?.selected ?? [])
  const selectedMain = new Set((f.main?.selected ?? []).map(Number))
  const selectedSub = new Set((f.sub?.selected ?? []).map(Number))
  const selectedFactions = new Set((f.faction?.selected ?? []).map(Number))

  const selectedRanks = new Set(legacySelected<1|2|3|4|5|6>(f.rank))
  const selectedRarities = new Set(legacySelected<1|2|3|4|5|6>(f.rarity))

  const filtered: T[] = []
  const matchingConfigIndices = new Set<number>()
  const configRuleCounts = new Map<number, number>()

  const configNameQuery = f.configName?.query ?? ''
  const configNameFilterActive = configNameQuery.length > 0
  let configNameRegex: RegExp | null = null
  let configNameRegexValid = true
  if (configNameFilterActive) {
    try {
      configNameRegex = new RegExp(configNameQuery, 'i')
    } catch {
      configNameRegexValid = false
      configNameRegex = null
    }
  }

  const shouldIncludeRule = (r: T): boolean => {
    const withCfg = r as unknown as HsfRuleWithCfg
    const cfgIdx = withCfg.__cfgIdx
    // Rule-level: Keep/Sell and Enabled/Disabled
    {
      const keepMode = f.rule?.keep ?? 'any'
      if (keepMode === 'yes') { if (r.Keep !== true) return false }
      else if (keepMode === 'no') { if (r.Keep === true) return false }
      // Note: missing Keep is treated as Sell in UI; the above logic matches that by requiring true for Keep-only
      const useMode = f.rule?.use ?? 'any'
      if (useMode === 'yes') { if ((r as HsfRule).Use === false) return false }
      else if (useMode === 'no') { if ((r as HsfRule).Use !== false) return false }
    }
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

    if (configNameFilterActive) {
      if (!configNameRegexValid) return false
      if (typeof cfgIdx !== 'number' || !Number.isFinite(cfgIdx)) return false
      const rawName = options?.configNames?.[cfgIdx] ?? ''
      const candidate = typeof rawName === 'string' ? rawName : ''
      if (!configNameRegex!.test(candidate)) return false
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
    if (f.level.anyMode === 'only') { if ((r.LVLForCheck ?? LEVEL_ANY_SENTINEL) !== LEVEL_ANY_SENTINEL) return false }
    else if (f.level.anyMode === 'off') { if ((r.LVLForCheck ?? LEVEL_ANY_SENTINEL) === LEVEL_ANY_SENTINEL) return false }
    else if (selectedLevels.size > 0) {
      const lvl = (r.LVLForCheck ?? LEVEL_ANY_SENTINEL) as number
      if (lvl !== LEVEL_ANY_SENTINEL && !selectedLevels.has(lvl as LevelMilestone)) return false
      if (lvl === LEVEL_ANY_SENTINEL && !selectedLevels.has(LEVEL_ANY_SENTINEL as never)) return false
    }

    // Main stat
    {
      const isAnyMain = (r.MainStatID ?? StatId.Any) === StatId.Any
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
    const hasWildcard = subs.some(s => s.ID === StatId.Any)
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
    else if (selectedFactions.size > 0) {
      const code = Number(r.Faction ?? 0)
      if (code !== 0 && !selectedFactions.has(code)) return false
    }

    return true
  }

  for (const r of rules) {
    if (!shouldIncludeRule(r)) continue
    filtered.push(r)
    const cfgIdx = (r as unknown as HsfRuleWithCfg).__cfgIdx
    if (typeof cfgIdx === 'number' && Number.isFinite(cfgIdx)) {
      matchingConfigIndices.add(cfgIdx)
      configRuleCounts.set(cfgIdx, (configRuleCounts.get(cfgIdx) ?? 0) + 1)
    }
  }

  const ensureConfigEntries = (indices: Iterable<number>) => {
    for (const idx of indices) {
      matchingConfigIndices.add(idx)
      if (!configRuleCounts.has(idx)) configRuleCounts.set(idx, 0)
    }
  }

  const filtersActive = isRulesFilterActive(f)
  if (!filtersActive) {
    const total = Math.max(
      options?.configModes?.length ?? 0,
      options?.configNames?.length ?? 0,
    )
    if (total > 0) {
      ensureConfigEntries(Array.from({ length: total }, (_, i) => i))
    }
  }

  if (configNameFilterActive && configNameRegexValid && Array.isArray(options?.configNames)) {
    const limit = options.configNames.length
    for (let idx = 0; idx < limit; idx += 1) {
      const name = options.configNames[idx] ?? ''
      if (configNameRegex!.test(typeof name === 'string' ? name : '')) {
        if (!matchingConfigIndices.has(idx)) matchingConfigIndices.add(idx)
        if (!configRuleCounts.has(idx)) configRuleCounts.set(idx, 0)
      }
    }
  }

  return { rules: filtered, matchingConfigIndices, configRuleCounts }
}
