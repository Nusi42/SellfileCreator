import type { BuilderConfig } from './hsfBuilder'

export function configsForRuleBuild(configs: readonly BuilderConfig[]): BuilderConfig[] {
  return configs.map((cfg) => {
    const { name: _omitName, ...rest } = cfg
    return rest
  })
}
