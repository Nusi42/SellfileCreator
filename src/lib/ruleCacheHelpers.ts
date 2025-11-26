import { RULE_COUNT_LIMIT } from './constants'
import { buildHsfRules, RuleLimitReachedError, type BuilderConfig, type SubstatTargetTable } from './hsfBuilder'
import { findObsoleteRules } from './hsfObsolete'

export function configsForRuleBuild(configs: readonly BuilderConfig[]): BuilderConfig[] {
  return configs.map((cfg) => ({ ...cfg }))
}

export function countRulesForConfig(
  config: BuilderConfig,
  substatTargets: SubstatTargetTable,
  options?: { limit?: number },
): number {
  const emissionLimit = options?.limit != null
    ? Math.max(1, Math.floor(options.limit))
    : RULE_COUNT_LIMIT + 1
  try {
    const built = buildHsfRules(config, substatTargets, { limit: emissionLimit })
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
  } catch (error) {
    if (error instanceof RuleLimitReachedError) {
      return Number.POSITIVE_INFINITY
    }
    throw error
  }
}

export function countRulesForConfigs(configs: readonly BuilderConfig[], substatTargets: SubstatTargetTable): number[] {
  return configs.map((cfg) => countRulesForConfig(cfg, substatTargets))
}
