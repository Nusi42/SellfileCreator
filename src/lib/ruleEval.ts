/**
 * ruleEval.ts
 *
 * Pure evaluator for matching a user-defined test item against a list of HSF
 * rules (first match wins). Mirrors the preview ordering and semantics.
 */
import type { HsfRule, HsfSubstat } from './hsfTypes'
import type { ArtifactSetId, ArtifactTypeId, FactionId, StatVariantLike } from './types'
import { LEVEL_ANY_SENTINEL, StatId, StatVariant, mainToVariant, subToVariant } from './types'
import { rankCoverage, rarityCoverage } from './codeCoverage'

// Attach provenance (config index) as done in merge.ts
export type HsfRuleWithCfg = HsfRule & { __cfgIdx?: number; __lineIdx?: number; __allKnownSets?: boolean }

export type TestItem = {
  name?: string
  slot: ArtifactTypeId
  set: ArtifactSetId
  rank: 1|2|3|4|5|6
  rarity: 1|2|3|4|5|6 // 1..6 => Common..Mythical
  level: 0|4|8|12|16
  faction?: FactionId
  main?: StatVariantLike
  // Optional per-sub absolute values present at the current level.
  // Used to compare against HSF Substats thresholds (absolute, not rolls).
  // Missing means 0.
  subValues?: Record<number, number>
}

export type EvalResult = { ruleIndex: number; keep: boolean; cfgIdx: number | null } | null

/** True if a single rule matches the given test item. */
export function matchRule(rule: HsfRule, item: TestItem): boolean {
  // Disabled rules never match
  if ((rule as HsfRule).Use === false) return false

  // Slot (ArtifactType)
  if (Array.isArray(rule.ArtifactType) && rule.ArtifactType.length > 0) {
    if (!rule.ArtifactType.some(t => Number(t) === Number(item.slot))) return false
  }

  // Set (ArtifactSet)
  if (Array.isArray(rule.ArtifactSet) && rule.ArtifactSet.length > 0) {
    if (!rule.ArtifactSet.some(s => Number(s) === Number(item.set))) return false
  }

  // Faction
  if (typeof rule.Faction === 'number' && rule.Faction !== 0) {
    if (Number(item.faction ?? 0) !== Number(rule.Faction)) return false
  }

  // Rank (0..16 code covers discrete 1..6)
  {
    const cover = rankCoverage(rule.Rank)
    if (!cover.has(item.rank)) return false
  }

  // Rarity (0..16)
  {
    const cover = rarityCoverage(rule.Rarity)
    if (!cover.has(item.rarity)) return false
  }

  // Level: LEVEL_ANY_SENTINEL means Any
  if (typeof rule.LVLForCheck === 'number' && rule.LVLForCheck !== LEVEL_ANY_SENTINEL) {
    if (Number(rule.LVLForCheck) !== Number(item.level)) return false
  }

  // Main stat
  if (typeof rule.MainStatID === 'number' && Number(rule.MainStatID) !== StatId.Any) {
    const mv = mainToVariant(rule.MainStatID, rule.MainStatF)
    if (Number(item.main ?? StatVariant.Any) !== Number(mv)) return false
  }

  // Substats: all specified (ID != -1 && !NotAvailable) must be present.
  // Compare entered absolute values against rule thresholds using the rule Condition.
  {
    const present = new Set<number>()
    const absVals = item.subValues || {}
    const subs = ((rule.Substats || []) as HsfSubstat[]).filter((s) => !s.NotAvailable && s.ID !== StatId.Any)
    if (subs.length > 0) {
      for (const s of subs) {
        const v = Number(subToVariant(s.ID, s.IsFlat))
        present.add(v)
        const need = Number(s.Value || 0)
        const have = Number(absVals[v] || 0)
        const cond = String(s.Condition || '>=')
        const ok = (
          cond === '>=' ? (have >= need) :
          cond === '<=' ? (have <= need) :
          cond === '==' || cond === '=' ? (have === need) :
          (have >= need)
        )
        if (!ok) return false
      }
      // Presence-only (e.g., thresholds at 0) pass due to comparison above
    }
  }

  return true
}

/** Iterate in order and return the first matching rule. */
export function evaluateFirst(rules: HsfRuleWithCfg[], item: TestItem): EvalResult {
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]!
    if (matchRule(r, item)) {
      const keep = r.Keep === true
      const cfgIdx = (r as HsfRuleWithCfg).__cfgIdx ?? null
      return { ruleIndex: i, keep, cfgIdx }
    }
  }
  return null
}
