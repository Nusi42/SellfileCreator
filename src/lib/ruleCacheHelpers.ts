import { RULE_COUNT_LIMIT } from './constants'
import { buildHsfRules, RuleLimitReachedError, type BuilderRecipe, type SubstatTargetTable } from './hsfBuilder'
import { findObsoleteRules } from './hsfObsolete'

export function recipesForRuleBuild(recipes: readonly BuilderRecipe[]): BuilderRecipe[] {
  return recipes.map((recipe) => ({ ...recipe }))
}

// SSOT for projecting a recipe list to the index-aligned name array that gets written into an
// exported HSF (applyRecipeNamesForExport) and folded into the export-dirty fingerprint
// (computeExportedHsfFingerprint). The export crc is computed in the rule-cache worker and
// compared on the main thread, so BOTH sides MUST derive names with this exact expression from
// the SAME (override-applied) recipe list — otherwise the two crcs diverge and the
// "needs export/push" flag is stuck-dirty or false-clean. One definition, imported everywhere.
export function recipeNamesForExport(recipes: readonly BuilderRecipe[]): string[] {
  return recipes.map((recipe) => recipe?.appearance?.name ?? '')
}

export function countRulesForRecipeEntry(
  recipe: BuilderRecipe,
  substatTargets: SubstatTargetTable,
  options?: { limit?: number },
): number {
  const emissionLimit = options?.limit != null
    ? Math.max(1, Math.floor(options.limit))
    : RULE_COUNT_LIMIT + 1
  try {
    const built = buildHsfRules(recipe, substatTargets, { limit: emissionLimit })
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

export function countRulesForRecipes(recipes: readonly BuilderRecipe[], substatTargets: SubstatTargetTable): number[] {
  return recipes.map((recipe) => countRulesForRecipeEntry(recipe, substatTargets))
}
