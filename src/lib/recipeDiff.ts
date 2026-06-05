import type { BuilderRecipe } from './hsfBuilder'
import { fingerprintRecipeForRules } from './ruleCache'

// Fixed sentinel fed to the rule-cache fingerprint for dirty comparisons.
// Why a constant instead of the live pipeline substat-targets key:
// `fingerprintRecipeForRules` embeds the substat-targets key as a *separate*
// field so that resolved rules re-cache when global thresholds change. A dirty
// check compares two unresolved BuilderRecipes under the same global targets, so
// that key is applied identically to both sides and cancels out — it can never
// change the boolean result. Threading the live `recipeRulesState.substatTargetsKey`
// in only coupled the dirty memo to pipeline timing, letting a churning key (e.g.
// during a prospective/compare evaluation) spuriously flip the builder to dirty.
// A stable sentinel keeps the result purely structural and pipeline-independent.
const STRUCTURAL_FINGERPRINT_KEY = '::recipe-dirty-structural'

/**
 * Determines whether two builder recipes differ in a way that should mark the
 * selection as dirty. Cosmetic fields (like the display name) still count,
 * because the builder must enable Save when the user edits them. The comparison
 * is purely structural — it does not depend on global substat targets, which are
 * tracked separately by sellfile history.
 */
export function hasRecipeMeaningfulDifferences(
  builder: BuilderRecipe,
  target: BuilderRecipe,
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
    const builderFp = fingerprintRecipeForRules(builder, STRUCTURAL_FINGERPRINT_KEY)
    const targetFp = fingerprintRecipeForRules(target, STRUCTURAL_FINGERPRINT_KEY)
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
