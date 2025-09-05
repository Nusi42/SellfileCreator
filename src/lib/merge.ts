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
import { artifactSetNames } from './types'

export type HsfRuleWithCfg = HsfRule & { __cfgIdx?: number }

export function computeMergedRules(params: {
  hsf: HsfFile | null
  customCfgs: BuilderConfig[]
  metasets: Metaset[]
  minima: MinimaTable
  includeAllExplicitMeta: boolean
}): HsfRuleWithCfg[] {
  const { hsf, customCfgs, metasets, minima, includeAllExplicitMeta } = params

  // Always strip any foreign/internal fields (e.g., __cfgIdx) from base HSF rules
  const baseRaw = hsf?.Rules ?? []
  const base: HsfRule[] = baseRaw.map((r: HsfRule) => ({ ...r }))

  // Build an effective metaset list that optionally includes a synthetic
  // "All (Explicit)" metaset that expands to all known sets.
  const ALL_META_ID = 'meta__ALL_EXPLICIT'
  const allSets = Object.keys(artifactSetNames).map(Number)
  const metasetsEffective: Metaset[] = includeAllExplicitMeta
    ? [{ id: ALL_META_ID, name: 'All (Explicit)', sets: allSets }, ...metasets]
    : metasets

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
  // Do not perform cross-config pruning here; per-config pruning already applied above.
  return merged
}

