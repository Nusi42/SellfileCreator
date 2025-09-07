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

export type HsfRuleWithCfg = HsfRule & { __cfgIdx?: number }

export function computeMergedRules(params: {
  hsf: HsfFile | null
  customCfgs: BuilderConfig[]
  metasets: Metaset[]
  minima: MinimaTable
  finalSellRemainder?: { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> }
}): HsfRuleWithCfg[] {
  const { hsf, customCfgs, metasets, minima, finalSellRemainder } = params

  // Always strip any foreign/internal fields (e.g., __cfgIdx) from base HSF rules
  const baseRaw = hsf?.Rules ?? []
  const base: HsfRule[] = baseRaw.map((r: HsfRule) => ({ ...r }))

  // The legacy "All Sets (Explicit)" metaset is removed; use provided metasets only.
  const metasetsEffective: Metaset[] = metasets

  const customs: HsfRuleWithCfg[] = customCfgs
    .map((c, cfgIdx) => {
      const fromMetas = resolveMetasetIds(c.artifactMetaSets, metasetsEffective)
      const explicit = c.artifactSets ?? []
      const union = Array.from(new Set<number>([...explicit, ...fromMetas].map(Number)))
      const cfgWithSets = { ...c, artifactSets: union }
      // Build and prune obsoletes within this config slice only to avoid cross-config tie-breaking artifacts
      const built = buildHsfRules(cfgWithSets, minima)
      const { obsolete } = findObsoleteRules(built)
      const drop = new Set(obsolete.map(o => o.index))
      const kept = built.filter((_, i) => !drop.has(i))
      return kept.map((r): HsfRule & { __cfgIdx: number } => ({ ...r, __cfgIdx: cfgIdx }))
    })
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
    const { artifacts, accessories, levels } = finalSellRemainder
    const ANY_SUB: HsfRule['Substats'] = [
      { ID: -1, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' },
      { ID: -1, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' },
      { ID: -1, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' },
      { ID: -1, Value: 0, IsFlat: true, NotAvailable: false, Condition: '' },
    ]
    const allSets = Object.keys(artifactSetNames).map(Number).sort(compareArtifactSets)
    const mkRule = (types: number[], lvl: 0|4|8|12|16): HsfRule => ({
      Keep: false,
      // Use is set by caller based on whether the level is selected.
      IsRuleTypeAND: false,
      ...(types.length ? { ArtifactType: types.slice().sort(compareArtifactTypes).map(Number) } : {}),
      ArtifactSet: allSets,
      Rank: 0,
      Rarity: 0,
      MainStatID: -1,
      MainStatF: 1,
      LVLForCheck: lvl,
      Faction: 0,
      Substats: ANY_SUB,
    })
    const artTypes = [ArtifactType.Weapon, ArtifactType.Helmet, ArtifactType.Shield, ArtifactType.Gauntlets, ArtifactType.Chestplate, ArtifactType.Boots]
    const accTypes = [ArtifactType.Ring, ArtifactType.Amulet, ArtifactType.Banner]
    // Only generate final-sell rules if at least one gear type AND
    // at least one level milestone are selected.
    const selected = new Set((levels || []) as Array<0|4|8|12|16>)
    if ((artifacts || accessories) && selected.size > 0) {
      const allMilestones: Array<0|4|8|12|16> = [0, 4, 8, 12, 16]
      for (const lvl of allMilestones) {
        const useFlag = selected.has(lvl)
        if (artifacts && accessories) {
          const both = artTypes.concat(accTypes)
          const base = mkRule(both, lvl)
          merged.push({ ...(base as HsfRule), Use: useFlag, __allKnownSets: true } as HsfRuleWithCfg)
        } else if (artifacts) {
          const base = mkRule(artTypes, lvl)
          merged.push({ ...(base as HsfRule), Use: useFlag, __allKnownSets: true } as HsfRuleWithCfg)
        } else if (accessories) {
          const base = mkRule(accTypes, lvl)
          merged.push({ ...(base as HsfRule), Use: useFlag, __allKnownSets: true } as HsfRuleWithCfg)
        }
      }
    }
  }
  // Do not perform cross-config pruning here; per-config pruning already applied above.
  return merged
}
