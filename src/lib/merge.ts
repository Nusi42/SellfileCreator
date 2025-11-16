/**
 * Merged rules computation (pure).
 *
 * Why: Isolate heavy preview merging into a testable function. Behavior is
 * unchanged — App composes this inside a useMemo with identical inputs.
 */
import type { HsfFile, HsfRule } from './hsfTypes'
import { variantToMain } from './hsfTypes'
import type { BuilderConfig, SubstatTargetTable } from './hsfBuilder'
import { RULE_COUNT_LIMIT, TOTAL_RULE_COUNT_LIMIT, ACCESSORY_NO_SET_ID } from './constants'
import { buildHsfRules, RuleLimitReachedError, resolveAutoRarityCode } from './hsfBuilder'
import { findObsoleteRules } from './hsfObsolete'
import type { Metaset } from './metasets'
import { resolveMetasetIds } from './metasets'
import {
  ArtifactType,
  compareArtifactTypes,
  compareArtifactSets,
  artifactSetNames,
  StatId,
  LEVEL_MILESTONES,
  LEVEL_ANY_SENTINEL,
  type LevelMilestone,
  RarityCode,
} from './types'
import {
  FINAL_SELL_DEFAULT_SETS_MODE,
  FINAL_SELL_SETS_MODE_ANY,
  FINAL_SELL_SETS_MODE_EXPLICIT,
  type FinalSellRemainderConfig,
} from './finalSell'
import {
  KEEP_UNIQUES_CFG_SENTINEL,
  type KeepUniquesMergeInput,
  hashKeepUniqueTuple,
  type KeepUniqueRule,
  type KeepUniqueDetectionSnapshot,
  type KeepUniqueDetectionEntry,
} from './keepUniques'

export const RULE_SOURCE_HSF = 'hsf' as const
export const RULE_SOURCE_HSFC = 'hsfc' as const
export const RULE_SOURCE_FINAL_SELL = 'finalSell' as const
export const RULE_SOURCE_KEEP_UNIQUES = 'keepUniques' as const

export type RuleSource =
  | typeof RULE_SOURCE_HSF
  | typeof RULE_SOURCE_HSFC
  | typeof RULE_SOURCE_FINAL_SELL
  | typeof RULE_SOURCE_KEEP_UNIQUES

export type HsfRuleWithCfg = HsfRule & {
  __cfgIdx?: number
  __lineIdx?: number
  __allKnownSets?: boolean
  __source?: RuleSource
  __rankMask?: number
  __rarityMask?: number
  __keepUniqueRuleId?: string
  __keepUniqueHash?: string
  __keepUniqueRequired?: number
  __keepUniqueScanMs?: number
  __keepUniqueProjected?: number
  __keepUniqueDeficit?: number
}

const BRANCH_ORDER = Symbol('branchOrder')
const BRANCH_SEQ = Symbol('branchSeq')

type BranchAnnotatedRule = HsfRule & { [BRANCH_ORDER]?: number; [BRANCH_SEQ]?: number }
type BranchAnnotatedRuleWithCfg = HsfRuleWithCfg & { [BRANCH_ORDER]?: number; [BRANCH_SEQ]?: number }

function canonicalRuleKey(rule: HsfRule): string {
  const artifactTypes = Array.isArray(rule.ArtifactType)
    ? (rule.ArtifactType as number[]).slice().sort((a, b) => a - b)
    : []
  const artifactSets = Array.isArray(rule.ArtifactSet)
    ? (rule.ArtifactSet as number[]).slice().sort((a, b) => a - b)
    : []
  const substats = Array.isArray(rule.Substats)
    ? (rule.Substats as HsfRule['Substats']).map(sub => ({
      ID: sub?.ID ?? null,
      IsFlat: sub?.IsFlat === true,
      NotAvailable: sub?.NotAvailable === true,
      Condition: sub?.Condition ?? '',
      Value: Number(sub?.Value ?? 0),
    }))
    : []
  return JSON.stringify({
    Keep: rule.Keep === true,
    Use: rule.Use !== false,
    Rank: Number(rule.Rank ?? 0),
    Level: Number(rule.LVLForCheck ?? 0),
    Faction: Number(rule.Faction ?? 0),
    MainStatID: rule.MainStatID ?? StatId.Any,
    MainStatF: Number(rule.MainStatF ?? 1),
    ArtifactType: artifactTypes,
    ArtifactSet: artifactSets,
    Substats: substats,
  })
}

function collapseEpicLegendaryDuplicates(rules: HsfRule[]): HsfRule[] {
  const groups = new Map<string, number[]>()
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!
    const key = canonicalRuleKey(rule)
    const arr = groups.get(key)
    if (arr) arr.push(i); else groups.set(key, [i])
  }
  const replacements = new Map<number, BranchAnnotatedRule>()
  const remove = new Set<number>()
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue
    const codes = new Set<number>()
    for (const idx of idxs) {
      const code = Number(rules[idx]!.Rarity ?? NaN)
      if (!Number.isFinite(code)) {
        codes.clear()
        break
      }
      codes.add(code)
    }
    if (codes.size === 2 && codes.has(4) && codes.has(16)) {
      const sorted = [...idxs].sort((a, b) => a - b)
      const [first, ...rest] = sorted
      if (first === undefined) continue
      const baseRule = rules[first]! as BranchAnnotatedRule
      const replacement: BranchAnnotatedRule = { ...baseRule, Rarity: 9 }
      const branchOrder = baseRule[BRANCH_ORDER]
      if (branchOrder !== undefined) replacement[BRANCH_ORDER] = branchOrder
      const branchSeq = baseRule[BRANCH_SEQ]
      if (branchSeq !== undefined) replacement[BRANCH_SEQ] = branchSeq
      replacements.set(first, replacement)
      for (const idx of rest) remove.add(idx)
    }
  }
  if (replacements.size === 0 && remove.size === 0) return rules
  const result: BranchAnnotatedRule[] = []
  for (let i = 0; i < rules.length; i++) {
    if (remove.has(i)) continue
    const replacement = replacements.get(i)
    if (replacement) {
      result.push(replacement)
    } else {
      result.push(rules[i]!)
    }
  }
  return result
}

function expandAutoFlexRarityBranches(cfg: BuilderConfig): BuilderConfig[] {
  try {
    if (cfg.rarityMode !== 'auto') return [cfg]
    if (cfg.autoSubstatFlex !== true) return [cfg]
    if (cfg.autoMinCount) return [cfg]
    const selected = Array.isArray(cfg.substatsV) ? cfg.substatsV.map(Number) : []
    if (selected.length === 0) return [cfg]
    const fixed = Array.isArray(cfg.fixedSubstatsV) ? cfg.fixedSubstatsV.map(Number) : []
    const lockedCount = fixed.length
    if (lockedCount === 0) return [cfg]
    if (cfg.minCount !== lockedCount) return [cfg]
    if (cfg.autoMinRequiredRolls !== false) return [cfg]
    const minRequired = typeof cfg.minRequiredRolls === 'number' ? cfg.minRequiredRolls : 0
    if (minRequired > lockedCount) return [cfg]
    const aggregateMatchesLocked = minRequired === lockedCount
    const fixedSet = new Set<number>(fixed)
    const optional = selected.filter(v => !fixedSet.has(v))
    if (optional.length === 0) return [cfg]
    const bounds = (cfg.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean }>
    const optionalAllWildcard = optional.every(v => {
      const b = bounds[Number(v)]
      const hasMin = typeof b?.min === 'number' && b.min > 0
      const hasMax = typeof b?.max === 'number' && isFinite(b.max)
      const wildcard = (b?.any === true) || (!b)
      return wildcard && !hasMin && !hasMax
    })
    if (!optionalAllWildcard) return [cfg]
    const baseRarityCode = resolveAutoRarityCode(cfg)
    const minLevel = (cfg.minLevel ?? LEVEL_MILESTONES[0]!) as LevelMilestone
    const maxLevel = (cfg.maxLevel ?? LEVEL_MILESTONES[LEVEL_MILESTONES.length - 1]!) as LevelMilestone
    const toMinCount = (value: number): 0 | 1 | 2 | 3 | 4 => {
      const clamped = Math.max(0, Math.min(4, value))
      return clamped as 0 | 1 | 2 | 3 | 4
    }
    const lockedOnlyCount = toMinCount(lockedCount)
    const configuredMinCount = toMinCount(cfg.minCount ?? lockedOnlyCount)
    const baseMinCount = toMinCount(Math.max(configuredMinCount, lockedOnlyCount))
    const flexTargetTotal = toMinCount(Math.max(baseMinCount, lockedOnlyCount + 1))
    const branches: BuilderConfig[] = []

    // Baseline branch: keep the locked trio before +16 using the auto-resolved rarity.
    const earlyEpicMax = Math.min(maxLevel, 12) as LevelMilestone
    if (minLevel <= earlyEpicMax) {
      const baselineCfg: BuilderConfig = {
        ...cfg,
        rarityMode: 'code',
        rarityCode: baseRarityCode,
        autoMinCount: false,
        minCount: lockedOnlyCount,
        minLevel: minLevel,
        maxLevel: earlyEpicMax,
        autoSubstatFlex: false,
      }
      branches.push(baselineCfg)
    }

    // Late branch: once +16 is inside the window, expect the optional slot to be present.
    const lateEpicMin = Math.max(minLevel, 16) as LevelMilestone
    if (aggregateMatchesLocked && lateEpicMin <= maxLevel) {
      const lateCfg: BuilderConfig = {
        ...cfg,
        rarityMode: 'code',
        rarityCode: Math.max(baseRarityCode, RarityCode.Epic) as RarityCode,
        autoMinCount: false,
        minCount: aggregateMatchesLocked ? flexTargetTotal : baseMinCount,
        minLevel: lateEpicMin,
        maxLevel: maxLevel,
        autoSubstatFlex: aggregateMatchesLocked ? false : true,
      }
      branches.push(lateCfg)
    }

    // Legendary-or-range branch: when the aggregate floor matches the locked trio we still need ≥Legendary
    // (so all four stats stay mandatory). Otherwise we leave Legendary in play so extra-roll permutations show up,
    // but collapse the duplicate exact-Epic rows downstream.
    const legendaryCfg: BuilderConfig = {
      ...cfg,
      rarityMode: 'code',
      rarityCode: Math.max(baseRarityCode, RarityCode.GTE_Legendary) as RarityCode,
      autoMinCount: false,
      minCount: aggregateMatchesLocked ? flexTargetTotal : baseMinCount,
      autoSubstatFlex: aggregateMatchesLocked ? false : true,
    }
    branches.push(legendaryCfg)

    return branches
  } catch {
    return [cfg]
  }
}

export function buildRulesForConfig(params: {
  config: BuilderConfig
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  cfgIdx?: number
}, options?: { limit?: number; onLimit?: () => void }): HsfRuleWithCfg[] {
  const { config, metasets, substatTargets, cfgIdx } = params
  const fromMetas = resolveMetasetIds(config.artifactMetaSets, metasets)
  const explicit = config.artifactSets ?? []
  const union = Array.from(new Set<number>([...explicit, ...fromMetas].map(Number)))
  const cfgWithSets: BuilderConfig = { ...config, artifactSets: union }
  try {
    const configsToBuild = expandAutoFlexRarityBranches(cfgWithSets)
    const branchRuleGroups = configsToBuild.map((branch, branchOrder) => {
      const built = buildHsfRules(
        branch,
        substatTargets,
        options?.limit != null ? { limit: options.limit } : undefined,
      )
      built.forEach((rule, seq) => {
        const annotated = rule as BranchAnnotatedRuleWithCfg
        annotated[BRANCH_ORDER] = branchOrder
        annotated[BRANCH_SEQ] = seq
      })
      return built
    })
    const branchRules = branchRuleGroups.flat()
    const mergedRules = collapseEpicLegendaryDuplicates(branchRules)
    const { obsolete } = configsToBuild.length > 1 ? { obsolete: [] } : findObsoleteRules(mergedRules)
    const drop = new Set(obsolete.map(o => o.index))
    const kept = mergedRules.filter((_, i) => !drop.has(i))
    const levelOrderValue = (lvl: number | undefined): number => {
      if (lvl === 0) return 0
      if (lvl === 4) return 1
      if (lvl === 8) return 2
      if (lvl === 12) return 3
      if (lvl === 16) return 4
      if (lvl === 99) return 5
      return lvl != null ? (6 + lvl) : Number.MAX_SAFE_INTEGER
    }
    const sorted = kept
      .map((rule, idx) => {
        const annotated = rule as BranchAnnotatedRuleWithCfg
        return {
          rule,
          idx,
          levelIdx: levelOrderValue(rule.LVLForCheck),
          branchOrder: annotated[BRANCH_ORDER] ?? 0,
          branchSeq: annotated[BRANCH_SEQ] ?? idx,
        }
      })
      .sort((a, b) => {
        if (a.levelIdx !== b.levelIdx) return a.levelIdx - b.levelIdx
        if (a.branchOrder !== b.branchOrder) return a.branchOrder - b.branchOrder
        if (a.branchSeq !== b.branchSeq) return a.branchSeq - b.branchSeq
        return a.idx - b.idx
      })
      .map(entry => entry.rule as BranchAnnotatedRuleWithCfg)
    sorted.forEach(rule => {
      delete rule[BRANCH_ORDER]
      delete rule[BRANCH_SEQ]
    })
    if (typeof cfgIdx === 'number') {
      return sorted.map((r): HsfRuleWithCfg => ({ ...r, __cfgIdx: cfgIdx, __source: RULE_SOURCE_HSFC }))
    }
    return sorted.map((r): HsfRuleWithCfg => ({ ...r, __source: RULE_SOURCE_HSFC }))
  } catch (error) {
    if (error instanceof RuleLimitReachedError) {
      options?.onLimit?.()
      return []
    }
    throw error
  }
}

const cloneAnySubstats = (): HsfRule['Substats'] => ([
  { ID: StatId.Any, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' },
  { ID: StatId.Any, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' },
  { ID: StatId.Any, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' },
  { ID: StatId.Any, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' },
])

export function buildFinalSellRules(finalSellRemainder: FinalSellRemainderConfig | null | undefined): HsfRuleWithCfg[] {
  if (!finalSellRemainder) return []
  const { artifacts, accessories, levels, setsMode = FINAL_SELL_DEFAULT_SETS_MODE } = finalSellRemainder
  const artTypes: ArtifactType[] = [ArtifactType.Weapon, ArtifactType.Helmet, ArtifactType.Shield, ArtifactType.Gauntlets, ArtifactType.Chestplate, ArtifactType.Boots]
  const accTypes: ArtifactType[] = [ArtifactType.Ring, ArtifactType.Amulet, ArtifactType.Banner]
  const selected = new Set<LevelMilestone>(levels ?? [])
  if (!((artifacts || accessories) && selected.size > 0)) return []
  const allMilestones = LEVEL_MILESTONES
  const typeCombos: number[][] = (() => {
    if (artifacts && accessories) return [artTypes.concat(accTypes)]
    if (artifacts) return [artTypes]
    if (accessories) return [accTypes]
    return []
  })()
  const rules: HsfRuleWithCfg[] = []
  for (const lvl of allMilestones) {
    const coverageModes: FinalSellRemainderConfig['setsMode'][] = [FINAL_SELL_SETS_MODE_EXPLICIT, FINAL_SELL_SETS_MODE_ANY]
    for (const mode of coverageModes) {
      const enabled = mode === setsMode
      const useExplicitSets = mode === FINAL_SELL_SETS_MODE_EXPLICIT
      const allSets = useExplicitSets
        ? Array.from(new Set<number>([ACCESSORY_NO_SET_ID, ...Object.keys(artifactSetNames).map(Number)])).sort(compareArtifactSets)
        : []
      const mkRule = (types: number[], useFlag: boolean): HsfRule => ({
        Keep: false,
        IsRuleTypeAND: false,
        Use: useFlag,
        ...(useExplicitSets ? { ArtifactSet: allSets } : {}),
        ...(types.length ? { ArtifactType: types.slice().sort(compareArtifactTypes).map(Number) } : {}),
        Rank: 0,
        Rarity: 0,
        MainStatID: StatId.Any,
        MainStatF: 1,
        LVLForCheck: lvl,
        Faction: 0,
        Substats: cloneAnySubstats(),
      })
      const useFlag = enabled && selected.has(lvl)
      for (const combo of typeCombos) {
        const baseRule = mkRule(combo, useFlag)
        const annotated: HsfRuleWithCfg = { ...(baseRule as HsfRule), __source: RULE_SOURCE_FINAL_SELL }
        if (useExplicitSets) annotated.__allKnownSets = true
        rules.push(annotated)
      }
    }
  }
  return rules
}

const clampRankOrRarityValue = (value: unknown): 1 | 2 | 3 | 4 | 5 | 6 => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 6
  const rounded = Math.floor(numeric)
  if (rounded < 1) return 1
  if (rounded > 6) return 6
  return rounded as 1 | 2 | 3 | 4 | 5 | 6
}

const rarityValueToCode = (value: unknown): RarityCode => {
  switch (clampRankOrRarityValue(value)) {
    case 1: return RarityCode.Common
    case 2: return RarityCode.Uncommon
    case 3: return RarityCode.Rare
    case 4: return RarityCode.Epic
    case 5: return RarityCode.Legendary
    case 6:
    default: return RarityCode.Mythical
  }
}

const buildKeepUniqueRules = (
  rules: readonly KeepUniqueRule[],
  detection: KeepUniqueDetectionSnapshot | null,
): HsfRuleWithCfg[] => {
  const detectionMap = detection
    ? new Map<string, KeepUniqueDetectionEntry>(
      detection.entries
        .filter((entry) => typeof entry.ruleId === 'string')
        .map((entry) => [entry.ruleId as string, entry]),
    )
    : new Map()
  return rules.map((rule) => {
    const tuple = rule.tuple
    const mainTuple = variantToMain(tuple.mainStat)
    const keepRule: HsfRuleWithCfg = {
      Keep: true,
      IsRuleTypeAND: false,
      Use: rule.enabled,
      Rank: clampRankOrRarityValue(tuple.rank),
      Rarity: rarityValueToCode(tuple.rarity),
      MainStatID: mainTuple.id,
      MainStatF: mainTuple.f ?? 1,
      LVLForCheck: LEVEL_ANY_SENTINEL,
      Faction: tuple.factionId ?? 0,
      ArtifactType: [Number(tuple.slot)],
      ArtifactSet: [Number(tuple.set)],
      Substats: cloneAnySubstats(),
      __cfgIdx: KEEP_UNIQUES_CFG_SENTINEL,
      __source: RULE_SOURCE_KEEP_UNIQUES,
    }
    const entry = detectionMap.get(rule.id)
    if (entry) {
      keepRule.__keepUniqueRuleId = rule.id
      keepRule.__keepUniqueHash = hashKeepUniqueTuple(tuple)
      keepRule.__keepUniqueRequired = entry.requiredCount
      if (detection) keepRule.__keepUniqueScanMs = detection.scannedAt
      keepRule.__keepUniqueProjected = entry.projectedCount
      keepRule.__keepUniqueDeficit = entry.deficit
    }
    return keepRule
  })
}

export function computeMergedRules(params: {
  hsf: HsfFile | null
  customCfgs: BuilderConfig[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  finalSellRemainder?: FinalSellRemainderConfig
  prebuiltCustomRules?: ReadonlyMap<number, readonly HsfRuleWithCfg[]>
  keepUniques?: KeepUniquesMergeInput
}): HsfRuleWithCfg[] {
  const { hsf, customCfgs, metasets, substatTargets, finalSellRemainder, prebuiltCustomRules, keepUniques } = params

  // Always strip any foreign/internal fields (e.g., __cfgIdx) from base HSF rules
  const baseRaw = hsf?.Rules ?? []
  const base: HsfRuleWithCfg[] = baseRaw.map((r: HsfRule) => ({ ...r, __source: RULE_SOURCE_HSF }))

  // The legacy "All Sets (Explicit)" metaset is removed; use provided metasets only.
  const metasetsEffective: Metaset[] = metasets

  const normalizedTotalLimit = Number.isFinite(TOTAL_RULE_COUNT_LIMIT) && TOTAL_RULE_COUNT_LIMIT > 0
    ? Math.max(1, Math.floor(TOTAL_RULE_COUNT_LIMIT))
    : null
  let runningTotal = base.length
  const customs: HsfRuleWithCfg[] = []
  const addBatchRespectingLimit = (rules: readonly HsfRuleWithCfg[]): void => {
    if (!rules.length) return
    if (normalizedTotalLimit === null) {
      customs.push(...rules)
      runningTotal += rules.length
      return
    }
    if (runningTotal >= normalizedTotalLimit) {
      return
    }
    if (runningTotal + rules.length > normalizedTotalLimit) {
      runningTotal = normalizedTotalLimit
      return
    }
    customs.push(...rules)
    runningTotal += rules.length
  }

  if (prebuiltCustomRules) {
    const ordered = Array.from(prebuiltCustomRules.entries())
    ordered.sort((a, b) => a[0] - b[0])
    for (const [, rules] of ordered) {
      addBatchRespectingLimit(rules)
    }
  } else {
    // Fallback: build on demand when no cache is supplied.
    for (let cfgIdx = 0; cfgIdx < customCfgs.length; cfgIdx += 1) {
      const config = customCfgs[cfgIdx]!
      const built = buildRulesForConfig(
        { config, metasets: metasetsEffective, substatTargets, cfgIdx },
        {
          limit: RULE_COUNT_LIMIT + 1,
        },
      )
      addBatchRespectingLimit(built)
    }
  }

  // Build and then remove obsolete rules, but only when both the obsolete rule
  // and its covering rule originate from the same custom config. This preserves
  // duplicated configs and base-vs-custom overlaps in the preview.
  // Optional: append final sell remainder rules across all milestones.
  // When Final Sell is enabled (artifacts || accessories), we include one
  // rule per level milestone (0/4/8/12/16). Milestones that are not selected
  // by the user are emitted with `Use: false` (disabled) instead of being
  // omitted. This keeps intent explicit in the exported HSF and mirrors the
  // builder's Enable toggle semantics.
  const finalSellRules = buildFinalSellRules(finalSellRemainder)
  const keepRules: HsfRuleWithCfg[] = []
  if (keepUniques && keepUniques.enabled && keepUniques.rules.length > 0) {
    const keepRuleKeys = new Set<string>()
    for (const rule of base) {
      if (rule.Keep === true) keepRuleKeys.add(canonicalRuleKey(rule))
    }
    for (const rule of customs) {
      if (rule.Keep === true) keepRuleKeys.add(canonicalRuleKey(rule))
    }
    const candidateKeepRules = buildKeepUniqueRules(keepUniques.rules, keepUniques.detection ?? null)
    for (const rule of candidateKeepRules) {
      const key = canonicalRuleKey(rule)
      if (keepRuleKeys.has(key)) continue
      keepRuleKeys.add(key)
      keepRules.push(rule)
    }
  }
  const merged: HsfRuleWithCfg[] = [
    ...base,
    ...keepRules,
    ...customs,
    ...finalSellRules,
  ]
  // Assign a stable preview line index so filtered views can still display
  // the original ordering (1-based when rendered).
  for (let i = 0; i < merged.length; i += 1) {
    (merged[i] as HsfRuleWithCfg).__lineIdx = i
  }
  // Do not perform cross-config pruning here; per-config pruning already applied above.
  return merged
}
