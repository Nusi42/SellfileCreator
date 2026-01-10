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
import { RULE_SOURCE_KEEP_UNIQUES, type HsfRuleWithCfg } from './merge'
import type { SellfileExportMode } from './hsfBuilder'
import { forEachRuleMatchCandidate, getRuleMatchIndex } from './ruleMatchIndex'
import { getRuleConfigIndex } from './ruleConfigIndex'

// Attach provenance (config index) as done in merge.ts
export type TesterItemPreviewExtras = {
  id?: number
  source?: 'artifacts' | 'inbox' | 'tester'
  rerollCount?: number
  equippedToChampionId?: number | null
  equippedChampionBaseId?: number | null
  equippedChampionRarity?: number | null
  equippedChampionName?: string | null
  equippedChampionLocation?: ChampionLocation | null
  mainStat?: NormalizedStat | null
  substats?: NormalizedStat[]
  ascension?: NormalizedStat | null
  exactLevel?: number | null
  lastUseLocalTimestamp?: string | null
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
  // Keep-unique injections are tied to a specific item; reject when the item key diverges.
  const requiredItemKey = (rule as HsfRuleWithCfg).__keepUniqueItemKey
  if (typeof requiredItemKey === 'number' && Number.isFinite(requiredItemKey) && requiredItemKey !== 0) {
    const itemKey = (item as { itemId?: number }).itemId
      ?? Number((item.previewExtras?.id ?? NaN))
    if (itemKey !== requiredItemKey) return false
  }

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
    const cfgIdx = getRuleConfigIndex(rule)
    result = { ruleIndex, keep, cfgIdx }
    return false
  })
  return result
}

export type EvalMatchesByConfigOptions = {
  configModes?: SellfileExportMode[]
  excludeSources?: readonly string[]
  excludeConfigIndices?: ReadonlySet<number>
  ignoreKeepUniqueConfigIndices?: ReadonlySet<number>
}

export type MatchingConfigDecision = { cfgIdx: number; keep: boolean }

export type EvalMatchesByConfigResult = {
  firstMatch: EvalResult | null
  firstNonExcludedMatch: EvalResult | null
  matchingConfigIndices: number[]
  matchingConfigDecisions: MatchingConfigDecision[]
}

/** Full scan that returns the first match plus the set of configs that match anywhere in the rules list. */
export function evaluateMatchesByConfig(
  rules: HsfRuleWithCfg[],
  item: TestItem,
  options?: EvalMatchesByConfigOptions,
): EvalMatchesByConfigResult {
  const configModes = options?.configModes
  const excludeSources = options?.excludeSources ?? null
  // Optional config index blocklist for scoped rule evaluation.
  const excludeConfigIndices = options?.excludeConfigIndices ?? null
  // Optional config indices that should not block keep-unique precedence.
  const ignoreKeepUniqueConfigIndices = options?.ignoreKeepUniqueConfigIndices ?? null
  const excludeSourceSet = excludeSources && excludeSources.length > 0
    ? new Set(excludeSources)
    : null
  const isKeepUniqueIgnoredConfig = (cfgIdx: number | null): boolean => (
    cfgIdx != null && ignoreKeepUniqueConfigIndices?.has(cfgIdx) === true
  )
  const shouldIncludeConfig = (cfgIdx: number | null): boolean => {
    // Skip configs that are explicitly excluded by index.
    if (cfgIdx != null && excludeConfigIndices && excludeConfigIndices.has(cfgIdx)) return false
    // Allow unknown configs when no export-mode filter exists.
    if (cfgIdx == null || !Array.isArray(configModes)) return true
    // Enforce export-mode visibility for builder configs.
    const mode = configModes[cfgIdx]
    return mode !== 'disabled' && mode !== 'separator'
  }

  let firstMatch: EvalResult | null = null
  let firstNonExcludedMatch: EvalResult | null = null
  let nonKeepUniqueKeepMatched = false
  let pendingKeepUnique: EvalResult | null = null
  let fallbackKeepUnique: EvalResult | null = null
  let anyKeepUniqueMatch: EvalResult | null = null
  const matchingConfigs = new Set<number>()
  // Preserve the first seen keep/sell flag per config so UI chips can mirror the outcome without rerunning rules.
  const matchingConfigDecisions = new Map<number, MatchingConfigDecision>()
  const slotIndex = getRuleMatchIndex(rules)
  const slot = Number(item.slot)
  const setId = Number(item.set)
  const rankValue = clampRankOrRarity(item.rank)
  const rarityValue = clampRankOrRarity(item.rarity)
  // Pre-scan for a keep-unique match so Final Sell cannot mask it due to ordering.
  let prekeepUnique: EvalResult | null = null
  for (let idx = 0; idx < rules.length; idx += 1) {
    const rule = rules[idx]!
    if (!rule || (rule as HsfRuleWithCfg).__source !== RULE_SOURCE_KEEP_UNIQUES) continue
    if (!matchRule(rule, item)) continue
    const cfgIdx = getRuleConfigIndex(rule)
    prekeepUnique = { ruleIndex: idx, keep: true, cfgIdx }
    break
  }
  forEachRuleMatchCandidate(slotIndex, slot, setId, rankValue, rarityValue, (ruleIndex) => {
    const rule = rules[ruleIndex]!
    if (!matchRule(rule, item)) return true
    // Source/type hints drive the exclusion toggle (e.g., keep-unique injections).
    const source = typeof (rule as HsfRuleWithCfg).__source === 'string' ? String((rule as HsfRuleWithCfg).__source) : null
    const isExcluded = source && excludeSourceSet ? excludeSourceSet.has(source) : false
    const cfgIdx = getRuleConfigIndex(rule)
    // Skip configs that are disabled/separator or explicitly excluded by source.
    if (!shouldIncludeConfig(cfgIdx)) return true
    const keep = rule.Keep === true
    const match: EvalResult = { ruleIndex, keep, cfgIdx }
    const isKeepUnique = source === RULE_SOURCE_KEEP_UNIQUES
    if (isKeepUnique) {
      // Defer keep-unique so primary rules always win.
      if (!pendingKeepUnique && !isExcluded) pendingKeepUnique = match
      if (!fallbackKeepUnique && !isExcluded) fallbackKeepUnique = match
      if (!anyKeepUniqueMatch && !isExcluded) anyKeepUniqueMatch = match
    } else {
      // Ignore keep-unique-ignored configs when deciding if keep-unique can win.
      const isIgnoredForKeepUnique = isKeepUniqueIgnoredConfig(cfgIdx)
      // Track whether any non-keep-unique KEEP rule matched; keep-unique should not override those.
      if (keep && !isExcluded && !isIgnoredForKeepUnique) nonKeepUniqueKeepMatched = true
      // Only record firstMatch when the source is not excluded.
      if (!firstMatch && !isExcluded) firstMatch = match
      if (!isExcluded && !firstNonExcludedMatch) firstNonExcludedMatch = match
    }
    if (cfgIdx !== null) {
      if (!matchingConfigDecisions.has(cfgIdx)) {
        matchingConfigDecisions.set(cfgIdx, { cfgIdx, keep })
      }
      matchingConfigs.add(cfgIdx)
    }
    return true
  })
  // If nothing else matched, fall back to keep-unique (only when no other KEEP rule matched).
  const firstMatchIsKeep = Boolean(
    firstMatch
    && (firstMatch as NonNullable<EvalResult>).keep === true
    && !isKeepUniqueIgnoredConfig((firstMatch as NonNullable<EvalResult>).cfgIdx ?? null),
  )
  const allowKeepUnique = !nonKeepUniqueKeepMatched && !firstMatchIsKeep
  if (allowKeepUnique) {
    const keepCandidate = pendingKeepUnique ?? fallbackKeepUnique ?? anyKeepUniqueMatch ?? prekeepUnique
    if (keepCandidate) {
      firstMatch = keepCandidate
      if (!firstNonExcludedMatch) firstNonExcludedMatch = keepCandidate
    }
  }
  const matchingConfigIndices = matchingConfigs.size > 0
    ? Array.from(matchingConfigs).sort((a, b) => a - b)
    : []
  const matchingConfigDecisionsList = matchingConfigIndices.map((cfgIdx) => {
    const decision = matchingConfigDecisions.get(cfgIdx)
    if (decision) return decision
    // Safety fallback keeps the UI stable if a cfg sneaks into the set without a captured decision.
    return { cfgIdx, keep: false }
  })
  return {
    firstMatch,
    firstNonExcludedMatch: firstNonExcludedMatch ?? firstMatch,
    matchingConfigIndices,
    matchingConfigDecisions: matchingConfigDecisionsList,
  }
}
