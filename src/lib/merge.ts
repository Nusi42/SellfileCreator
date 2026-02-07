/**
 * Merged rules computation (pure).
 *
 * Why: Isolate heavy preview merging into a testable function. Behavior is
 * unchanged — App composes this inside a useMemo with identical inputs.
 */
import type { HsfFile, HsfRule } from './hsfTypes'
import { variantToMain, variantToSub } from './hsfTypes'
import type { BuilderConfig, SubstatTargetTable } from './hsfBuilder'
import {
  RULE_COUNT_LIMIT,
  TOTAL_RULE_COUNT_LIMIT,
  ACCESSORY_NO_SET_ID,
  KEEP_UNIQUE_CONFIG_ID_BASE,
} from './constants'
import { buildHsfRules, RuleLimitReachedError, resolveAutoRarityCode } from './hsfBuilder'
import { findObsoleteRules } from './hsfObsolete'
import type { Metaset } from './metasets'
import { resolveArtifactSetSelections, splitArtifactSetSelections } from './gearSets/selection'
import {
  ArtifactType,
  type ArtifactSetId,
  compareArtifactTypes,
  compareArtifactSets,
  getAllKnownArtifactSetIds,
  StatId,
  StatVariant,
  LEVEL_MILESTONES,
  LEVEL_ANY_SENTINEL,
  type LevelMilestone,
  RarityCode,
  RankCode,
  type RankValue,
} from './types'
import {
  FINAL_SELL_DEFAULT_SETS_MODE,
  FINAL_SELL_SETS_MODE_ANY,
  FINAL_SELL_SETS_MODE_EXPLICIT,
  type FinalSellRemainderConfig,
} from './logicHub'
import {
  type KeepUniquesMergeInput,
  hashKeepUniqueCombination,
  hasActiveKeepUniqueRules,
  type KeepUniqueRule,
  type KeepUniquePlaceholderRequest,
  type KeepUniqueDetectionSnapshot,
  type KeepUniqueDetectionEntry,
  KeepUniqueRuleActivation,
  cloneKeepUniqueCombination,
} from './keepUniques'
import { normalizeConfigName } from './ruleConfigIndex'
import {
  RULE_SOURCE_FINAL_SELL,
  RULE_SOURCE_HSF,
  RULE_SOURCE_HSFC,
  RULE_SOURCE_KEEP_UNIQUES,
} from './ruleSources'
import type { RuleSource } from './ruleSources'
export {
  KEEP_OVERRIDE_RULE_SOURCES,
  RULE_SOURCE_FINAL_SELL,
  RULE_SOURCE_HSF,
  RULE_SOURCE_HSFC,
  RULE_SOURCE_KEEP_UNIQUES,
  isKeepOverrideRuleSource,
  type RuleSource,
} from './ruleSources'

export type HsfRuleWithCfg = HsfRule & {
  __lineIdx?: number
  __allKnownSets?: boolean
  __source?: RuleSource
  __rankMask?: number
  __rarityMask?: number
  __keepUniqueRuleId?: string
  __keepUniqueRuleOrdinal?: number
  __keepUniqueHash?: string
  __keepUniqueRequired?: number
  __keepUniqueScanMs?: number
  __keepUniqueProjected?: number
  __keepUniqueDeficit?: number
  __keepUniqueItemKey?: number
  __keepUniquePlaceholder?: boolean
  __keepUniquePlaceholderMissing?: number
}

const BRANCH_ORDER = Symbol('branchOrder')
const BRANCH_SEQ = Symbol('branchSeq')

type BranchAnnotatedRule = HsfRule & { [BRANCH_ORDER]?: number; [BRANCH_SEQ]?: number }
type BranchAnnotatedRuleWithCfg = HsfRuleWithCfg & { [BRANCH_ORDER]?: number; [BRANCH_SEQ]?: number }

// Stable level ordering mirrors the rule builder sort (0/4/8/12/16/99 then others).
const levelOrderValue = (lvl: number | undefined): number => {
  if (lvl === 0) return 0
  if (lvl === 4) return 1
  if (lvl === 8) return 2
  if (lvl === 12) return 3
  if (lvl === 16) return 4
  if (lvl === 99) return 5
  return lvl != null ? (6 + lvl) : Number.MAX_SAFE_INTEGER
}

export function canonicalRuleKey(rule: HsfRule): string {
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
  // Carry a stable 1-based config identifier through builder → HSF exports.
  const configIdForExport = (typeof cfgIdx === 'number' && Number.isFinite(cfgIdx) && cfgIdx >= 0)
    ? (Math.floor(cfgIdx) + 1)
    : null
  // Expand metasets and remove explicit exclusions before rule generation.
  const resolvedSets = resolveArtifactSetSelections({
    selections: config.artifactSets,
    metasetIds: config.artifactMetaSets,
    metasets,
  })
  // Build a config snapshot with the resolved set IDs only.
  const cfgWithSets: BuilderConfig = {
    ...config,
    // Normalize to include-only entries so the builder sees final set ids.
    artifactSets: resolvedSets.resolved.map((id) => ({ id })),
  }
  try {
    const configsToBuild = expandAutoFlexRarityBranches(cfgWithSets)
    const branchRuleGroups = configsToBuild.map((branch, branchOrder) => {
      const built = buildHsfRules(
        branch,
        substatTargets,
        {
          ...(options?.limit != null ? { limit: options.limit } : {}),
          ...(configIdForExport !== null ? { configId: configIdForExport } : {}),
        },
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
        ? Array.from(new Set<number>([ACCESSORY_NO_SET_ID, ...getAllKnownArtifactSetIds().map((id) => Number(id))])).sort(compareArtifactSets)
        : []
      // Export helpers: emit sets/types immediately before the rank payload for readability.
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

type KeepInjectedArtifact = KeepUniqueDetectionEntry['artifacts'][number]

const coverageLevelsForArtifact = (artifact: KeepInjectedArtifact): LevelMilestone[] => {
  const exact = Number(artifact.exactLevel)
  const resolved = Number.isFinite(exact)
    ? Math.max(0, Math.min(16, Math.floor(exact)))
    : Number(artifact.level ?? 0)
  if (resolved >= 16) return [16]
  if (resolved >= 12) return [12, 16]
  if (resolved >= 8) return [8, 12, 16]
  if (resolved >= 4) return [4, 8, 12, 16]
  return LEVEL_MILESTONES.slice()
}

const buildKeepUniqueSubstats = (substats: KeepInjectedArtifact['substats']): HsfRule['Substats'] => {
  // Start from the Any template so padding stays consistent with HSF expectations.
  const cloned = cloneAnySubstats()
  if (!Array.isArray(substats) || substats.length === 0) return cloned
  let idx = 0
  for (const sub of substats) {
    if (idx >= cloned.length) break
    if (sub.variant === StatVariant.Any) continue
    const { id, isFlat } = variantToSub(sub.variant)
    if (id === StatId.Any) continue
    cloned[idx] = {
      ID: id,
      Value: Math.max(0, Number(sub.value)),
      IsFlat: isFlat ?? true,
      NotAvailable: false,
      Condition: '>=',
    }
    idx += 1
  }
  return cloned
}

const buildKeepUniquePlaceholderSubstats = (variant: StatVariant): HsfRule['Substats'] => {
  // Start from the Any template so placeholder rules keep the HSF substat shape.
  const cloned = cloneAnySubstats()
  if (!Number.isFinite(Number(variant)) || Number(variant) === StatVariant.Any) return cloned
  const { id, isFlat } = variantToSub(variant)
  if (id === StatId.Any) return cloned
  // Use a 1+ guard so the placeholder only matches items that actually have the substat.
  cloned[0] = {
    ID: id,
    Value: 1,
    IsFlat: isFlat ?? true,
    NotAvailable: false,
    Condition: '>=',
  }
  return cloned
}

const dedupeSortedNumbers = (values: readonly number[]): number[] => {
  if (!values.length) return []
  const seen = new Set<number>()
  for (const value of values) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) continue
    seen.add(numeric)
  }
  return Array.from(seen).sort((a, b) => a - b)
}

const dedupeStatVariants = (values: readonly number[]): StatVariant[] => {
  if (!values.length) return []
  const seen = new Set<number>()
  const result: StatVariant[] = []
  for (const value of values) {
    const numeric = Number(value)
    if (seen.has(numeric)) continue
    seen.add(numeric)
    result.push(numeric as StatVariant)
  }
  result.sort((a, b) => a - b)
  return result
}

const normalizeRankSelection = (values: readonly number[]): (RankValue | null)[] => {
  if (!values.length) return [null]
  const unique = dedupeSortedNumbers(values)
  if (!unique.length) return [null]
  return unique.map((value) => Math.max(1, Math.min(6, Number(value))) as RankValue)
}

const normalizeRaritySelection = (values: readonly number[]): (RankValue | null)[] => normalizeRankSelection(values)

type KeepUniquePlaceholderRuleParams = {
  rule: KeepUniqueRule
  entry: KeepUniqueDetectionEntry
  configId: number
  normalizedName: string | null | undefined
  keepUniqueRuleOrdinal: number
  detection: KeepUniqueDetectionSnapshot | null
}

type KeepOverridePlaceholderBaseParams = {
  combination: KeepUniqueRule['combination']
  configId: number
  normalizedName: string | null | undefined
  source: RuleSource
}

// Build the base placeholder rules for a keep-override combination.
const buildKeepOverridePlaceholderBaseRules = ({
  combination,
  configId,
  normalizedName,
  source,
}: KeepOverridePlaceholderBaseParams): HsfRuleWithCfg[] => {
  const slotValues = dedupeSortedNumbers(combination.slots)
  // Only use explicit includes; exclusions should not produce placeholder rules.
  const setSelection = splitArtifactSetSelections(combination.sets)
  const setValues = dedupeSortedNumbers(setSelection.included)
  const factionValues = dedupeSortedNumbers(combination.factions)
  const rankOptions = normalizeRankSelection(combination.ranks)
  const rarityOptions = normalizeRaritySelection(combination.rarities)
  const mainOptions = dedupeStatVariants(combination.mainStats)
  const factionOptions = factionValues.length > 0 ? factionValues : [0]
  const mainVariants = mainOptions.length > 0 ? mainOptions : [StatVariant.Any]
  const rankVariants = rankOptions.length > 0 ? rankOptions : [null]
  const rarityVariants = rarityOptions.length > 0 ? rarityOptions : [null]
  const rules: HsfRuleWithCfg[] = []
  const seen = new Set<string>()
  for (const rankVariant of rankVariants) {
    for (const rarityVariant of rarityVariants) {
      for (const faction of factionOptions) {
        for (const mainVariant of mainVariants) {
          const mainTuple = variantToMain(mainVariant ?? StatVariant.Any)
          const artifactSetPayload = setValues.length
            ? { ArtifactSet: setValues.map(Number).sort((a, b) => compareArtifactSets(a as ArtifactSetId, b as ArtifactSetId)) }
            : {}
          const artifactTypePayload = slotValues.length ? { ArtifactType: slotValues.map(Number) } : {}
          const keepRule: HsfRuleWithCfg = {
            Keep: true,
            IsRuleTypeAND: false,
            Use: true,
            ConfigID: configId,
            ...(normalizedName ? { ConfigName: normalizedName } : {}),
            ...artifactSetPayload,
            ...artifactTypePayload,
            Rank: rankVariant == null ? RankCode.Any : clampRankOrRarityValue(rankVariant),
            Rarity: rarityVariant == null ? RarityCode.Any : rarityValueToCode(rarityVariant),
            MainStatID: mainTuple.id,
            MainStatF: Number.isFinite(mainTuple.f) ? Number(mainTuple.f) : 1,
            LVLForCheck: LEVEL_ANY_SENTINEL,
            Faction: faction,
            Substats: buildKeepUniqueSubstats([]),
            __source: source,
          }
          const canonical = canonicalRuleKey(keepRule)
          if (seen.has(canonical)) continue
          seen.add(canonical)
          rules.push(keepRule)
        }
      }
    }
  }
  return rules
}

// Placeholder keep rules mirror the combination filters so Anticipate mode can protect future drops.
const buildKeepUniquePlaceholderRules = ({
  rule,
  entry,
  configId,
  normalizedName,
  keepUniqueRuleOrdinal,
  detection,
}: KeepUniquePlaceholderRuleParams): HsfRuleWithCfg[] => {
  const placeholders = entry.placeholders ?? []
  if (!placeholders.length) return []
  const rules: HsfRuleWithCfg[] = []
  const substatVariants = rule.substats ?? []
  const hasSubstatFilter = substatVariants.length > 0
  const applyKeepUniqueMeta = (
    keepRule: HsfRuleWithCfg,
    combination: KeepUniqueRule['combination'],
    placeholder: KeepUniquePlaceholderRequest,
  ): void => {
    keepRule.__keepUniqueRuleId = rule.id
    keepRule.__keepUniqueRuleOrdinal = keepUniqueRuleOrdinal
    keepRule.__keepUniqueHash = hashKeepUniqueCombination(combination)
    keepRule.__keepUniqueRequired = entry.requiredCount
    keepRule.__keepUniqueProjected = entry.projectedCount
    keepRule.__keepUniqueDeficit = entry.deficit
    keepRule.__keepUniquePlaceholder = true
    keepRule.__keepUniquePlaceholderMissing = placeholder.missing
    if (detection) keepRule.__keepUniqueScanMs = detection.scannedAt
  }
  for (const placeholder of placeholders) {
    if (!placeholder || placeholder.missing <= 0) continue
    const combination = placeholder.combination ? cloneKeepUniqueCombination(placeholder.combination) : cloneKeepUniqueCombination(rule.combination)
    const baseRules = buildKeepOverridePlaceholderBaseRules({
      combination,
      configId,
      normalizedName,
      source: RULE_SOURCE_KEEP_UNIQUES,
    })
    for (const keepRule of baseRules) {
      if (hasSubstatFilter) {
        // Emit one placeholder per selected substat to emulate OR matching.
        for (const variant of substatVariants) {
          const substatRule: HsfRuleWithCfg = {
            ...keepRule,
            Substats: buildKeepUniquePlaceholderSubstats(variant),
          }
          applyKeepUniqueMeta(substatRule, combination, placeholder)
          rules.push(substatRule)
        }
        continue
      }
      applyKeepUniqueMeta(keepRule, combination, placeholder)
      rules.push(keepRule)
    }
  }
  return rules
}


export const buildKeepUniqueRules = (
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
  const keepRules: HsfRuleWithCfg[] = []
  const emitted = new Set<string>()
  const placeholderKeys = new Set<string>()
  let keepUniqueRuleOffset = 0
  let keepUniqueRuleOrdinal = 0
  for (const rule of rules) {
    keepUniqueRuleOrdinal += 1
    const activation = rule.activation ?? KeepUniqueRuleActivation.ProtectExisting
    if (activation === KeepUniqueRuleActivation.Off) continue
    const entry = rule.id ? detectionMap.get(rule.id) : null
    if (!entry) continue
    const artifacts = entry.artifacts ?? []
    const placeholders = entry.placeholders ?? []
    const shouldEmitArtifacts = artifacts.length > 0
    const shouldEmitPlaceholders = activation === KeepUniqueRuleActivation.AnticipateGaps && placeholders.length > 0
    if (!shouldEmitArtifacts && !shouldEmitPlaceholders) continue
    const normalizedName = normalizeConfigName(rule.name)
    const configId = KEEP_UNIQUE_CONFIG_ID_BASE - keepUniqueRuleOffset
    keepUniqueRuleOffset += 1
    if (shouldEmitArtifacts) {
      for (const artifact of artifacts) {
        const levels = coverageLevelsForArtifact(artifact)
        for (const level of levels) {
          const artifactKey = `${artifact.itemKey}:${level}`
          if (emitted.has(artifactKey)) continue
          emitted.add(artifactKey)
          const mainTuple = variantToMain(artifact.mainStat)
          const artifactSetPayload = { ArtifactSet: [Number(artifact.set)] }
          const artifactTypePayload = { ArtifactType: [Number(artifact.slot)] }
          const keepRule: HsfRuleWithCfg = {
            Keep: true,
            IsRuleTypeAND: false,
            Use: true,
            ConfigID: configId,
            ...(normalizedName ? { ConfigName: normalizedName } : {}),
            ...artifactSetPayload,
            ...artifactTypePayload,
            Rank: clampRankOrRarityValue(artifact.rank),
            Rarity: rarityValueToCode(artifact.rarity),
            MainStatID: mainTuple.id,
            MainStatF: Number.isFinite(mainTuple.f) ? Number(mainTuple.f) : 1,
            LVLForCheck: level ?? LEVEL_ANY_SENTINEL,
            Faction: artifact.faction ?? 0,
            Substats: buildKeepUniqueSubstats(artifact.substats),
            __source: RULE_SOURCE_KEEP_UNIQUES,
            __keepUniqueRuleId: rule.id,
            __keepUniqueRuleOrdinal: keepUniqueRuleOrdinal,
            __keepUniqueItemKey: artifact.itemKey,
            __keepUniqueHash: hashKeepUniqueCombination(rule.combination),
            __keepUniqueRequired: entry.requiredCount,
            __keepUniqueProjected: entry.projectedCount,
            __keepUniqueDeficit: entry.deficit,
          }
          if (detection) keepRule.__keepUniqueScanMs = detection.scannedAt
          keepRules.push(keepRule)
        }
      }
    }
    if (shouldEmitPlaceholders) {
      const placeholderRules = buildKeepUniquePlaceholderRules({
        rule,
        entry,
        configId,
        normalizedName,
        keepUniqueRuleOrdinal,
        detection,
      })
      for (const placeholderRule of placeholderRules) {
        const canonical = canonicalRuleKey(placeholderRule)
        if (placeholderKeys.has(canonical)) continue
        placeholderKeys.add(canonical)
        keepRules.push(placeholderRule)
      }
    }
  }
  return keepRules
}

type KeepUniqueMergeParams = {
  baseRules: HsfRuleWithCfg[]
  customRules: HsfRuleWithCfg[]
  finalSellRules: HsfRuleWithCfg[]
  resolvedKeepUniqueRules: readonly KeepUniqueRule[]
  detection: KeepUniqueDetectionSnapshot | null
}

type KeepUniqueMergeResult = {
  baseRules: HsfRuleWithCfg[]
  mergedRules: HsfRuleWithCfg[]
}

// Shared helper: inject keep-unique rules ahead of base/custom/final-sell with duplicate protection.
export function prependKeepUniqueRules({
  baseRules,
  customRules,
  finalSellRules,
  resolvedKeepUniqueRules,
  detection,
}: KeepUniqueMergeParams): KeepUniqueMergeResult {
  // Strip any prior keep-unique injections to avoid double-prepending.
  const baseWithoutKeep = baseRules.filter((rule) => rule.__source !== RULE_SOURCE_KEEP_UNIQUES)
  // Collect keys of existing keep rules so we skip duplicates.
  const baseCustomKeepKeys = new Set<string>()
  for (const rule of baseWithoutKeep) {
    if (rule.Keep === true) baseCustomKeepKeys.add(canonicalRuleKey(rule))
  }
  for (const rule of customRules) {
    if (rule.Keep === true) baseCustomKeepKeys.add(canonicalRuleKey(rule))
  }
  // Build injected keep rules from detection snapshot + resolved combinations.
  const candidateKeepRules = detection ? buildKeepUniqueRules(resolvedKeepUniqueRules, detection) : []
  const filteredKeepRules: HsfRuleWithCfg[] = []
  // Track dedupe keys per injected Keep Unique rule so item-scoped keeps do not collapse.
  const injectedKeepKeys = new Set<string>()
  for (const rule of candidateKeepRules) {
    const canonicalKey = canonicalRuleKey(rule)
    // Skip if a base/custom keep already covers this combination.
    if (baseCustomKeepKeys.has(canonicalKey)) continue
    // Item+level dedupe ensures a distinct keep for each milestone of the same item.
    const dedupeKey = rule.__source === RULE_SOURCE_KEEP_UNIQUES
      ? (rule.__keepUniquePlaceholder
        ? `ku:placeholder:${canonicalKey}`
        : `ku:item:${rule.__keepUniqueItemKey ?? 'na'}:lvl:${Number.isFinite(rule.LVLForCheck) ? Number(rule.LVLForCheck) : LEVEL_ANY_SENTINEL}`)
      : canonicalKey
    if (injectedKeepKeys.has(dedupeKey)) continue
    injectedKeepKeys.add(dedupeKey)
    filteredKeepRules.push(rule)
  }
  // Keep-unique rules follow the same milestone-first ordering as config rules for stable exports.
  const sortedKeepRules = filteredKeepRules
    .map((rule, idx) => ({
      rule,
      idx,
      levelIdx: levelOrderValue(rule.LVLForCheck),
      ruleOrdinal: Number.isFinite(rule.__keepUniqueRuleOrdinal) ? Number(rule.__keepUniqueRuleOrdinal) : Number.MAX_SAFE_INTEGER,
      placeholderRank: rule.__keepUniquePlaceholder ? 1 : 0,
      itemKey: Number.isFinite(rule.__keepUniqueItemKey) ? Number(rule.__keepUniqueItemKey) : Number.MAX_SAFE_INTEGER,
      canonical: canonicalRuleKey(rule),
    }))
    .sort((a, b) => {
      if (a.levelIdx !== b.levelIdx) return a.levelIdx - b.levelIdx
      if (a.ruleOrdinal !== b.ruleOrdinal) return a.ruleOrdinal - b.ruleOrdinal
      if (a.placeholderRank !== b.placeholderRank) return a.placeholderRank - b.placeholderRank
      if (a.itemKey !== b.itemKey) return a.itemKey - b.itemKey
      if (a.canonical !== b.canonical) return a.canonical < b.canonical ? -1 : 1
      return a.idx - b.idx
    })
    .map(entry => entry.rule)
  // Keep-unique rules must precede base rules to override.
  const nextBaseRules = sortedKeepRules.concat(baseWithoutKeep)
  const mergedRules: HsfRuleWithCfg[] = [
    ...nextBaseRules,
    ...customRules,
    ...finalSellRules,
  ]
  return { baseRules: nextBaseRules, mergedRules }
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

  // Always strip any foreign/internal fields (e.g., __lineIdx) from base HSF rules
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
  const keepUniquesInput = hasActiveKeepUniqueRules(keepUniques)
    ? keepUniques
    : null
  const keepMergeResult: KeepUniqueMergeResult = keepUniquesInput
    ? prependKeepUniqueRules({
      baseRules: base,
      customRules: customs,
      finalSellRules,
      resolvedKeepUniqueRules: keepUniquesInput.rules,
      detection: keepUniquesInput.detection ?? null,
    })
    : { baseRules: base, mergedRules: [...base, ...customs, ...finalSellRules] }
  const merged = keepMergeResult.mergedRules
  // Assign a stable preview line index so filtered views can still display
  // the original ordering (1-based when rendered).
  for (let i = 0; i < merged.length; i += 1) {
    (merged[i] as HsfRuleWithCfg).__lineIdx = i
  }
  // Do not perform cross-config pruning here; per-config pruning already applied above.
  // Pass through merged rules (baseWithKeep reused by splitMergedRules elsewhere).
  return merged
}
