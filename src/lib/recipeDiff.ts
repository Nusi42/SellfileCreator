import type { BuilderRecipe } from './hsfBuilder'
import { fingerprintRecipeForRules } from './ruleCache'

/**
 * Determines whether two builder recipes differ in a way that should mark the
 * selection as dirty. Cosmetic fields (like the display name) still count,
 * because the builder must enable Save when the user edits them.
 */
export function hasRecipeMeaningfulDifferences(
  builder: BuilderRecipe,
  target: BuilderRecipe,
  substatTargetsKey: string,
): boolean {
  const builderName = builder?.appearance?.name ?? ''
  const targetName = target?.appearance?.name ?? ''
  if (builderName !== targetName) return true
  const builderColor = builder?.appearance?.fgColor ?? ''
  const targetColor = target?.appearance?.fgColor ?? ''
  if (builderColor !== targetColor) return true
  // Tags are part of editable metadata and should mark the builder dirty.
  const builderTags = Array.isArray(builder?.tags) ? builder.tags.map(String) : []
  const targetTags = Array.isArray(target?.tags) ? target.tags.map(String) : []
  if (builderTags.length !== targetTags.length) return true
  for (let i = 0; i < builderTags.length; i += 1) {
    if (builderTags[i] !== targetTags[i]) return true
  }

  try {
    const builderFp = fingerprintRecipeForRules(builder, substatTargetsKey)
    const targetFp = fingerprintRecipeForRules(target, substatTargetsKey)
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
