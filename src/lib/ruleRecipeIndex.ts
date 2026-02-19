import type { HsfRuleWithRecipe } from './merge'

type RuleWithRecipeMetadata = {
  RecipeID?: number
  RecipeName?: string
}

const normalizeRecipeId = (recipeIdx: number): number => Math.floor(recipeIdx) + 1
const sanitizeName = (name?: string | null): string | undefined => {
  if (typeof name !== 'string') return undefined
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Normalize builder-provided labels into the trimmed strings we serialize. */
export function normalizeRecipeName(name?: string | null): string | undefined {
  return sanitizeName(name)
}

export function getRuleRecipeIndex(rule: RuleWithRecipeMetadata | null | undefined): number | null {
  // Rules should already be normalized at HSF IO boundaries.
  const rawId = rule?.RecipeID
  if (typeof rawId === 'number' && Number.isFinite(rawId)) {
    const recipeId = Math.floor(rawId)
    if (recipeId > 0) return recipeId - 1
  }
  return null
}

export function applyRecipeIndexMutable(rule: RuleWithRecipeMetadata, recipeIdx: number, recipeName?: string | null): void {
  if (!rule || !Number.isFinite(recipeIdx) || recipeIdx < 0) {
    if (rule) {
      delete (rule as { RecipeID?: number }).RecipeID
      delete (rule as { RecipeName?: string }).RecipeName
    }
    return
  }
  rule.RecipeID = normalizeRecipeId(recipeIdx)
  const nextName = sanitizeName(recipeName ?? rule.RecipeName)
  if (nextName) {
    rule.RecipeName = nextName
  } else if ('RecipeName' in rule) {
    delete (rule as { RecipeName?: string }).RecipeName
  }
}

export function cloneRuleWithRecipeIndex(rule: HsfRuleWithRecipe, recipeIdx: number, recipeName?: string | null): HsfRuleWithRecipe {
  if (!Number.isFinite(recipeIdx) || recipeIdx < 0) {
    const clone = { ...rule }
    delete (clone as { RecipeID?: number }).RecipeID
    if ('RecipeName' in clone) delete (clone as { RecipeName?: string }).RecipeName
    return clone
  }
  const nextName = sanitizeName(recipeName ?? rule.RecipeName)
  const clone: HsfRuleWithRecipe = {
    ...rule,
    RecipeID: normalizeRecipeId(recipeIdx),
    ...(nextName ? { RecipeName: nextName } : {}),
  }
  return clone
}

type RecipeNameList = readonly (string | null | undefined)[] | null | undefined

/**
 * Resolve the label to show for tester matches.
 * Safeguard sentinel rules do not map to builder recipes, so we fall back to the trimmed rule name.
 */
export function resolveMatchRecipeName(
  recipeIdx: number | null | undefined,
  recipeNames: RecipeNameList,
  rule: RuleWithRecipeMetadata | null | undefined,
): string | null {
  if (
    recipeNames
    && recipeIdx != null
    && recipeIdx >= 0
    && recipeIdx < recipeNames.length
  ) {
    const candidate = recipeNames[recipeIdx]
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim()
      if (trimmed.length > 0) return trimmed
    }
  }
  const fallback = normalizeRecipeName(rule?.RecipeName ?? null)
  return fallback ?? null
}
