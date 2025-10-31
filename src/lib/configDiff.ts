import type { BuilderConfig } from './hsfBuilder'
import { fingerprintConfigForRules } from './ruleCache'

/**
 * Determines whether two builder configs differ in a way that should mark the
 * selection as dirty. Cosmetic fields (like the display name) still count,
 * because the builder must enable Save when the user edits them.
 */
export function hasConfigMeaningfulDifferences(
  builder: BuilderConfig,
  target: BuilderConfig,
  substatTargetsKey: string,
): boolean {
  const builderName = typeof builder?.name === 'string' ? builder.name : ''
  const targetName = typeof target?.name === 'string' ? target.name : ''
  if (builderName !== targetName) return true

  try {
    const builderFp = fingerprintConfigForRules(builder, substatTargetsKey)
    const targetFp = fingerprintConfigForRules(target, substatTargetsKey)
    if (builderFp !== targetFp) return true
  } catch {
    try {
      if (JSON.stringify(builder) !== JSON.stringify(target)) return true
    } catch {
      return true
    }
  }
  return false
}
