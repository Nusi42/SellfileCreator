/**
 * ruleEval.ts
 *
 * Pure evaluator for matching a user-defined test item against a list of HSF
 * rules (first match wins). Mirrors the preview ordering and semantics.
 */
import type { ChampionLocation, NormalizedStat } from './importers/gearDbNormalizer'
import type { HsfRule, HsfSubstat } from './hsfTypes'
import { rankMask, rarityMask } from './hsfTypes'
import type { ArtifactSetId, ArtifactTypeId, FactionId, StatVariantLike } from './types'
import { LEVEL_ANY_SENTINEL, StatId, StatVariant, mainToVariant, subToVariant, type LevelMilestone, type RankValue } from './types'
import type { HsfRuleWithCfg } from './merge'
import type { SellfileExportMode } from './hsfBuilder'
import { forEachRuleMatchCandidate, getRuleMatchIndex } from './ruleMatchIndex'

// Attach provenance (config index) as done in merge.ts
export type TesterItemPreviewExtras = {
  id?: number
  source?: 'artifacts' | 'inbox' | 'tester'
  rerollCount?: number
  equippedToChampionId?: number | null
  equippedChampionBaseId?: number | null
  equippedChampionName?: string | null
  equippedChampionLocation?: ChampionLocation | null
  mainStat?: NormalizedStat | null
  substats?: NormalizedStat[]
  ascension?: NormalizedStat | null
  exactLevel?: number | null
}

export type TestItem = {
  name?: string
  slot: ArtifactTypeId
  set: ArtifactSetId
  rank: RankValue
  rarity: RankValue // 1..6 => Common..Mythical
  level: LevelMilestone
  faction?: FactionId
  main?: StatVariantLike
  // Optional per-sub absolute values present at the current level.
  // Used to compare against HSF Substats thresholds (absolute, not rolls).
  // Missing means 0.
  subValues?: Record<number, number>
  previewExtras?: TesterItemPreviewExtras
}

export type EvalResult = { ruleIndex: number; keep: boolean; cfgIdx: number | null } | null

const RANK_RARITY_MIN = 1
const RANK_RARITY_MAX = 6
const RANK_RARITY_FULL_MASK = (1 << RANK_RARITY_MAX) - 1

const clampRankOrRarity = (value: unknown): number => {
  const num = Number(value)
  if (!Number.isFinite(num)) return RANK_RARITY_MIN
  if (num <= RANK_RARITY_MIN) return RANK_RARITY_MIN
  if (num >= RANK_RARITY_MAX) return RANK_RARITY_MAX
  return Math.floor(num)
}

const bitForRankOrRarity = (value: unknown): number => {
  const clamped = clampRankOrRarity(value)
  return 1 << (clamped - 1)
}

const ensureRankMask = (rule: HsfRuleWithCfg): number => {
  const cached = rule.__rankMask
  if (typeof cached === 'number' && cached > 0) return cached
  const mask = rankMask(rule.Rank)
  const safe = mask > 0 ? mask : RANK_RARITY_FULL_MASK
  rule.__rankMask = safe
  return safe
}

const ensureRarityMask = (rule: HsfRuleWithCfg): number => {
  const cached = rule.__rarityMask
  if (typeof cached === 'number' && cached > 0) return cached
  const mask = rarityMask(rule.Rarity)
  const safe = mask > 0 ? mask : RANK_RARITY_FULL_MASK
  rule.__rarityMask = safe
  return safe
}

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
    const mask = ensureRankMask(rule as HsfRuleWithCfg)
    const bit = bitForRankOrRarity(item.rank)
    if ((mask & bit) === 0) return false
  }

  // Rarity (0..16)
  {
    const mask = ensureRarityMask(rule as HsfRuleWithCfg)
    const bit = bitForRankOrRarity(item.rarity)
    if ((mask & bit) === 0) return false
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
        const rawValue = absVals[v]
        const haveNum = Number(rawValue)
        const hasStatValue = rawValue !== undefined && rawValue !== null && Number.isFinite(haveNum) && haveNum > 0
        const have = Number.isFinite(haveNum) ? haveNum : 0
        const cond = String(s.Condition || '>=').trim()
        const requiresPresenceForUpperBound = cond === '<=' || cond === '<' || cond === '=<' || cond === '≤'
        if (requiresPresenceForUpperBound && !hasStatValue) return false
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
  const slotIndex = getRuleMatchIndex(rules)
  const slot = Number(item.slot)
  const setId = Number(item.set)
  const rankValue = clampRankOrRarity(item.rank)
  const rarityValue = clampRankOrRarity(item.rarity)
  let result: EvalResult = null
  forEachRuleMatchCandidate(slotIndex, slot, setId, rankValue, rarityValue, (ruleIndex) => {
    if (result) return false
    const rule = rules[ruleIndex]!
    if (!matchRule(rule, item)) return true
    const keep = rule.Keep === true
    const rawCfgIdx = (rule as HsfRuleWithCfg).__cfgIdx
    const cfgIdx = typeof rawCfgIdx === 'number' && Number.isFinite(rawCfgIdx) && rawCfgIdx >= 0 ? rawCfgIdx : null
    result = { ruleIndex, keep, cfgIdx }
    return false
  })
  return result
}

export type EvalMatchesByConfigOptions = {
  configModes?: SellfileExportMode[]
}

export type EvalMatchesByConfigResult = {
  firstMatch: EvalResult | null
  matchingConfigIndices: number[]
}

/** Full scan that returns the first match plus the set of configs that match anywhere in the rules list. */
export function evaluateMatchesByConfig(
  rules: HsfRuleWithCfg[],
  item: TestItem,
  options?: EvalMatchesByConfigOptions,
): EvalMatchesByConfigResult {
  const configModes = options?.configModes
  const shouldIncludeConfig = (cfgIdx: number | null): boolean => {
    if (cfgIdx == null || !Array.isArray(configModes)) return true
    const mode = configModes[cfgIdx]
    return mode !== 'disabled' && mode !== 'separator'
  }

  let firstMatch: EvalResult | null = null
  const matchingConfigs = new Set<number>()
  const slotIndex = getRuleMatchIndex(rules)
  const slot = Number(item.slot)
  const setId = Number(item.set)
  const rankValue = clampRankOrRarity(item.rank)
  const rarityValue = clampRankOrRarity(item.rarity)
  forEachRuleMatchCandidate(slotIndex, slot, setId, rankValue, rarityValue, (ruleIndex) => {
    const rule = rules[ruleIndex]!
    if (!matchRule(rule, item)) return true
    const rawCfgIdx = (rule as HsfRuleWithCfg).__cfgIdx
    const cfgIdx = typeof rawCfgIdx === 'number' && Number.isFinite(rawCfgIdx) && rawCfgIdx >= 0 ? rawCfgIdx : null
    if (!shouldIncludeConfig(cfgIdx)) return true
    if (!firstMatch) {
      const keep = rule.Keep === true
      firstMatch = { ruleIndex, keep, cfgIdx }
    }
    if (cfgIdx !== null) {
      matchingConfigs.add(cfgIdx)
    }
    return true
  })
  return {
    firstMatch,
    matchingConfigIndices: matchingConfigs.size > 0
      ? Array.from(matchingConfigs).sort((a, b) => a - b)
      : [],
  }
}
