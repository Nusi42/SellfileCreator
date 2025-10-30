import { buildHsfRules, type BuilderConfig, type SubstatTargetTable } from './hsfBuilder'
import { findObsoleteRules } from './hsfObsolete'

export function configsForRuleBuild(configs: readonly BuilderConfig[]): BuilderConfig[] {
  return configs.map((cfg) => {
    const { name: _omitName, ...rest } = cfg
    return rest
  })
}

export function countRulesForConfig(config: BuilderConfig, substatTargets: SubstatTargetTable): number {
  const built = buildHsfRules(config, substatTargets)
  if (built.length === 0) {
    return 0
  }
  const { obsolete } = findObsoleteRules(built)
  if (obsolete.length === 0) {
    return built.length
  }
  const removed = new Set<number>(obsolete.map((entry) => entry.index))
  let kept = 0
  for (let i = 0; i < built.length; i += 1) {
    if (!removed.has(i)) kept += 1
  }
  return kept
}

export function countRulesForConfigs(configs: readonly BuilderConfig[], substatTargets: SubstatTargetTable): number[] {
  return configs.map((cfg) => countRulesForConfig(cfg, substatTargets))
}
