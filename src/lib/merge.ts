/**
 * Merged rules computation (pure).
 *
 * Why: Isolate heavy preview merging into a testable function. Behavior is
 * unchanged — App composes this inside a useMemo with identical inputs.
 */
import type { HsfFile, HsfRule } from './hsfTypes'
import type { BuilderConfig, MinimaTable } from './hsfBuilder'
import { buildHsfRules } from './hsfBuilder'
import { findObsoleteRules } from './hsfObsolete'
import type { Metaset } from './metasets'
import { resolveMetasetIds } from './metasets'
import { ArtifactType, compareArtifactTypes, compareArtifactSets, artifactSetNames } from './types'
import { ACCESSORY_NO_SET_ID } from './constants'
import {
  FINAL_SELL_DEFAULT_SETS_MODE,
  FINAL_SELL_SETS_MODE_ANY,
  FINAL_SELL_SETS_MODE_EXPLICIT,
  type FinalSellRemainderConfig,
} from './finalSell'

export type HsfRuleWithCfg = HsfRule & { __cfgIdx?: number; __lineIdx?: number; __allKnownSets?: boolean }

export function buildRulesForConfig(params: {
  config: BuilderConfig
  metasets: Metaset[]
  minima: MinimaTable
  cfgIdx?: number
}): HsfRuleWithCfg[] {
  const { config, metasets, minima, cfgIdx } = params
  const fromMetas = resolveMetasetIds(config.artifactMetaSets, metasets)
  const explicit = config.artifactSets ?? []
  const union = Array.from(new Set<number>([...explicit, ...fromMetas].map(Number)))
  const cfgWithSets: BuilderConfig = { ...config, artifactSets: union }
  const built = buildHsfRules(cfgWithSets, minima)
  const { obsolete } = findObsoleteRules(built)
  const drop = new Set(obsolete.map(o => o.index))
  const kept = built.filter((_, i) => !drop.has(i))
  if (typeof cfgIdx === 'number') {
    return kept.map((r): HsfRuleWithCfg => ({ ...r, __cfgIdx: cfgIdx }))
  }
  return kept.map((r): HsfRuleWithCfg => ({ ...r }))
}

export function computeMergedRules(params: {
  hsf: HsfFile | null
  customCfgs: BuilderConfig[]
  metasets: Metaset[]
  minima: MinimaTable
  finalSellRemainder?: FinalSellRemainderConfig
}): HsfRuleWithCfg[] {
  const { hsf, customCfgs, metasets, minima, finalSellRemainder } = params

  // Always strip any foreign/internal fields (e.g., __cfgIdx) from base HSF rules
  const baseRaw = hsf?.Rules ?? []
  const base: HsfRule[] = baseRaw.map((r: HsfRule) => ({ ...r }))

  // The legacy "All Sets (Explicit)" metaset is removed; use provided metasets only.
  const metasetsEffective: Metaset[] = metasets

  const customs: HsfRuleWithCfg[] = customCfgs
    .map((c, cfgIdx) => buildRulesForConfig({ config: c, metasets: metasetsEffective, minima, cfgIdx }))
    .flat()

  // Build and then remove obsolete rules, but only when both the obsolete rule
  // and its covering rule originate from the same custom config. This preserves
  // duplicated configs and base-vs-custom overlaps in the preview.
  const merged: HsfRuleWithCfg[] = (base as HsfRuleWithCfg[]).concat(customs)
  // Optional: append final sell remainder rules across all milestones.
  // When Final Sell is enabled (artifacts || accessories), we include one
  // rule per level milestone (0/4/8/12/16). Milestones that are not selected
  // by the user are emitted with `Use: false` (disabled) instead of being
  // omitted. This keeps intent explicit in the exported HSF and mirrors the
  // builder's Enable toggle semantics.
  if (finalSellRemainder) {
    const { artifacts, accessories, levels, setsMode = FINAL_SELL_DEFAULT_SETS_MODE } = finalSellRemainder
    const ANY_SUB: HsfRule['Substats'] = [
      { ID: -1, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' },
      { ID: -1, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' },
      { ID: -1, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' },
      { ID: -1, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' },
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
            const base: HsfRule = ({
              Keep: false,
              // Emit AND between Keep and Use; we set Use here for stable key order.
              IsRuleTypeAND: false,
              Use: useFlag,
              ...(types.length ? { ArtifactType: types.slice().sort(compareArtifactTypes).map(Number) } : {}),
              Rank: 0,
              Rarity: 0,
              MainStatID: -1,
              MainStatF: 1,
              LVLForCheck: lvl,
              Faction: 0,
              Substats: ANY_SUB,
            })
            if (useExplicitSets) {
              base.ArtifactSet = allSets
            }
            return base
          }
          const useFlag = enabled && selected.has(lvl)
          for (const combo of typeCombos) {
            const base = mkRule(combo, useFlag)
            const annotated: HsfRuleWithCfg = useExplicitSets
              ? ({ ...(base as HsfRule), __allKnownSets: true } as HsfRuleWithCfg)
              : (base as HsfRuleWithCfg)
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
