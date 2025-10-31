/**
 * Merged rules computation (pure).
 *
 * Why: Isolate heavy preview merging into a testable function. Behavior is
 * unchanged — App composes this inside a useMemo with identical inputs.
 */
import type { HsfFile, HsfRule } from './hsfTypes'
import type { BuilderConfig, SubstatTargetTable } from './hsfBuilder'
import { RULE_COUNT_LIMIT, TOTAL_RULE_COUNT_LIMIT, ACCESSORY_NO_SET_ID } from './constants'
import { buildHsfRules, RuleLimitReachedError } from './hsfBuilder'
import { findObsoleteRules } from './hsfObsolete'
import type { Metaset } from './metasets'
import { resolveMetasetIds } from './metasets'
import { ArtifactType, compareArtifactTypes, compareArtifactSets, artifactSetNames, StatId } from './types'
import {
  FINAL_SELL_DEFAULT_SETS_MODE,
  FINAL_SELL_SETS_MODE_ANY,
  FINAL_SELL_SETS_MODE_EXPLICIT,
  type FinalSellRemainderConfig,
} from './finalSell'

export const RULE_SOURCE_HSF = 'hsf' as const
export const RULE_SOURCE_HSFC = 'hsfc' as const
export const RULE_SOURCE_FINAL_SELL = 'finalSell' as const

export type RuleSource =
  | typeof RULE_SOURCE_HSF
  | typeof RULE_SOURCE_HSFC
  | typeof RULE_SOURCE_FINAL_SELL

export type HsfRuleWithCfg = HsfRule & {
  __cfgIdx?: number
  __lineIdx?: number
  __allKnownSets?: boolean
  __source?: RuleSource
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
    const built = buildHsfRules(
      cfgWithSets,
      substatTargets,
      options?.limit != null ? { limit: options.limit } : undefined,
    )
    const { obsolete } = findObsoleteRules(built)
    const drop = new Set(obsolete.map(o => o.index))
    const kept = built.filter((_, i) => !drop.has(i))
    if (typeof cfgIdx === 'number') {
      return kept.map((r): HsfRuleWithCfg => ({ ...r, __cfgIdx: cfgIdx, __source: RULE_SOURCE_HSFC }))
    }
    return kept.map((r): HsfRuleWithCfg => ({ ...r, __source: RULE_SOURCE_HSFC }))
  } catch (error) {
    if (error instanceof RuleLimitReachedError) {
      options?.onLimit?.()
      return []
    }
    throw error
  }
}

export function computeMergedRules(params: {
  hsf: HsfFile | null
  customCfgs: BuilderConfig[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  finalSellRemainder?: FinalSellRemainderConfig
  prebuiltCustomRules?: ReadonlyMap<number, readonly HsfRuleWithCfg[]>
}): HsfRuleWithCfg[] {
  const { hsf, customCfgs, metasets, substatTargets, finalSellRemainder, prebuiltCustomRules } = params

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
  const merged: HsfRuleWithCfg[] = base.concat(customs)
  // Optional: append final sell remainder rules across all milestones.
  // When Final Sell is enabled (artifacts || accessories), we include one
  // rule per level milestone (0/4/8/12/16). Milestones that are not selected
  // by the user are emitted with `Use: false` (disabled) instead of being
  // omitted. This keeps intent explicit in the exported HSF and mirrors the
  // builder's Enable toggle semantics.
  if (finalSellRemainder) {
    const { artifacts, accessories, levels, setsMode = FINAL_SELL_DEFAULT_SETS_MODE } = finalSellRemainder
    const ANY_SUB: HsfRule['Substats'] = [
      { ID: StatId.Any, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' },
      { ID: StatId.Any, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' },
      { ID: StatId.Any, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' },
      { ID: StatId.Any, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' },
    ]
    const artTypes = [ArtifactType.Weapon, ArtifactType.Helmet, ArtifactType.Shield, ArtifactType.Gauntlets, ArtifactType.Chestplate, ArtifactType.Boots]
    const accTypes = [ArtifactType.Ring, ArtifactType.Amulet, ArtifactType.Banner]
    // Only generate final-sell rules if at least one gear type AND
    // at least one level milestone are selected.
    const selected = new Set((levels || []) as Array<0|4|8|12|16>)
    if ((artifacts || accessories) && selected.size > 0) {
      const allMilestones: Array<0|4|8|12|16> = [0, 4, 8, 12, 16]
      const typeCombos: number[][] = (() => {
        if (artifacts && accessories) return [artTypes.concat(accTypes)]
        if (artifacts) return [artTypes]
        if (accessories) return [accTypes]
        return []
      })()
      for (const lvl of allMilestones) {
        const coverageModes: FinalSellRemainderConfig['setsMode'][] = [FINAL_SELL_SETS_MODE_EXPLICIT, FINAL_SELL_SETS_MODE_ANY]
        for (const mode of coverageModes) {
          const enabled = mode === setsMode
          const useExplicitSets = mode === FINAL_SELL_SETS_MODE_EXPLICIT
          const allSets = useExplicitSets
            ? Array.from(new Set<number>([ACCESSORY_NO_SET_ID, ...Object.keys(artifactSetNames).map(Number)])).sort(compareArtifactSets)
            : []
          const mkRule = (types: number[], useFlag: boolean): HsfRule => {
            const base: HsfRule = {
              Keep: false,
              // Emit AND between Keep and Use; we set Use here for stable key order.
              IsRuleTypeAND: false,
              Use: useFlag,
              // Keep ArtifactSet ahead of ArtifactType to mirror builder output ordering.
              ...(useExplicitSets ? { ArtifactSet: allSets } : {}),
              ...(types.length ? { ArtifactType: types.slice().sort(compareArtifactTypes).map(Number) } : {}),
              Rank: 0,
              Rarity: 0,
              MainStatID: StatId.Any,
              MainStatF: 1,
              LVLForCheck: lvl,
              Faction: 0,
              Substats: ANY_SUB.map((s) => ({ ...s })),
            }
            return base
          }
          const useFlag = enabled && selected.has(lvl)
          for (const combo of typeCombos) {
            const baseRule = mkRule(combo, useFlag)
            const annotated: HsfRuleWithCfg = { ...(baseRule as HsfRule), __source: RULE_SOURCE_FINAL_SELL }
            if (useExplicitSets) annotated.__allKnownSets = true
            merged.push(annotated)
          }
        }
      }
    }
  }
  // Assign a stable preview line index so filtered views can still display
  // the original ordering (1-based when rendered).
  for (let i = 0; i < merged.length; i += 1) {
    (merged[i] as HsfRuleWithCfg).__lineIdx = i
  }
  // Do not perform cross-config pruning here; per-config pruning already applied above.
  return merged
}
