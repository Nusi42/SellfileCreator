/**
 * Merged rules computation (pure).
 *
 * Why: Isolate heavy preview merging into a testable function. Behavior is
 * unchanged — App composes this inside a useMemo with identical inputs.
 */
import type { HsfFile, HsfRule } from './hsfTypes'
import type { BuilderConfig, SubstatTargetTable } from './hsfBuilder'
import {
  RULE_COUNT_LIMIT,
  TOTAL_RULE_COUNT_LIMIT,
  ACCESSORY_NO_SET_ID,
  KEEP_UNIQUE_CONFIG_ID_BASE,
} from './constants'
import { buildHsfRules, RuleLimitReachedError, resolveAutoRarityCode } from './hsfBuilder'
import {
  finalizeGeneratedRulesWithLoadedWasm,
  buildKeepUniqueRulesWithLoadedWasm,
  mergeKeepUniqueInjectedRulesWithLoadedWasm,
} from './wasm/wasmRuleEngine'
import type { Metaset } from './metasets'
import { resolveArtifactSetSelections } from './gearSets/selection'
import {
  ArtifactType,
  compareArtifactTypes,
  compareArtifactSets,
  getAllKnownArtifactSetIds,
  StatId,
  LEVEL_MILESTONES,
  type LevelMilestone,
  RarityCode,
} from './types'
import {
  FINAL_SELL_DEFAULT_SETS_MODE,
  FINAL_SELL_SETS_MODE_ANY,
  FINAL_SELL_SETS_MODE_EXPLICIT,
  type FinalSellRemainderConfig,
} from './logicHub'
import {
  type KeepUniquesMergeInput,
  hasActiveKeepUniqueRules,
  type KeepUniqueRule,
  type KeepUniqueDetectionSnapshot,
} from './keepUniques'
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

// Keep branch metadata separate from the mutable rule object so worker callers
// can serialize generation output for WASM post-processing.
export type GeneratedBranchRuleEntry = {
  rule: HsfRuleWithCfg
  branchOrder: number
  branchSeq: number
  originalIdx: number
}

// Optional post-processor contract used by worker WASM paths.
export type BuildRulesFinalizeGeneratedFn = (params: {
  entries: readonly GeneratedBranchRuleEntry[]
  applyObsoletePruning: boolean
}) => HsfRuleWithCfg[]

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
}, options?: { limit?: number; onLimit?: () => void; finalizeGeneratedRules?: BuildRulesFinalizeGeneratedFn }): HsfRuleWithCfg[] {
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
    // Capture explicit branch metadata so sorting/finalization is deterministic.
    const generatedEntries: GeneratedBranchRuleEntry[] = []
    configsToBuild.forEach((branch, branchOrder) => {
      const built = buildHsfRules(
        branch,
        substatTargets,
        {
          ...(options?.limit != null ? { limit: options.limit } : {}),
          ...(configIdForExport !== null ? { configId: configIdForExport } : {}),
        },
      )
      built.forEach((rule, seq) => {
        generatedEntries.push({
          rule: rule as HsfRuleWithCfg,
          branchOrder,
          branchSeq: seq,
          originalIdx: generatedEntries.length,
        })
      })
    })
    const applyObsoletePruning = configsToBuild.length <= 1
    // Single source of truth: generated-rule finalize logic lives in WASM.
    // Allow callers to inject an alternative only for explicit test/worker hooks.
    const finalizeGeneratedRules = options?.finalizeGeneratedRules ?? ((finalizeParams: {
      entries: readonly GeneratedBranchRuleEntry[]
      applyObsoletePruning: boolean
    }) => {
      // Fail closed when warmup did not complete; no hidden JS fallback exists.
      const finalized = finalizeGeneratedRulesWithLoadedWasm(finalizeParams)
      if (!Array.isArray(finalized)) {
        throw new Error('WASM generated-rule finalizer is unavailable. Ensure warmupWasmRuleEngine() ran first.')
      }
      return finalized
    })
    // Always pass through the selected finalizer so merge/order/prune behavior
    // comes from one implementation across app + worker + tests.
    const finalized = finalizeGeneratedRules({ entries: generatedEntries, applyObsoletePruning })
    return finalized.map((rule): HsfRuleWithCfg => ({ ...rule, __source: RULE_SOURCE_HSFC }))
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

export const buildKeepUniqueRules = (
  rules: readonly KeepUniqueRule[],
  detection: KeepUniqueDetectionSnapshot | null,
): HsfRuleWithCfg[] => {
  // Single source of truth: keep-unique keep-rule generation lives in WASM.
  return buildKeepUniqueRulesWithLoadedWasm({
    rules,
    detection,
    configIdBase: KEEP_UNIQUE_CONFIG_ID_BASE,
  })
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
  // Build candidate keep rules from detection snapshot + resolved combinations.
  const candidateKeepRules = detection ? buildKeepUniqueRules(resolvedKeepUniqueRules, detection) : []
  // WASM now owns injected keep-rule dedupe + sorting semantics (SSOT).
  const sortedKeepRules = mergeKeepUniqueInjectedRulesWithLoadedWasm({
    baseRules: baseWithoutKeep,
    customRules,
    candidateKeepRules,
  })
  if (!Array.isArray(sortedKeepRules)) {
    throw new Error('WASM keep-unique injected-rule merge is unavailable. Ensure warmupWasmRuleEngine() ran first.')
  }
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
