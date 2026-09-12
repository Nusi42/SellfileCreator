import type { HsfRuleWithRecipe } from './merge'

type RuleWithRecipeMetadata = {
  RecipeID?: number
  RecipeName?: string
}

/**
 * The `RecipeID` a recipe at 0-based `recipeIdx` must carry — the ONE definition of that
 * offset on the TS side, mirroring `recipe_id_for_index` in the Rust core.
 *
 * `RecipeID` is 1-BASED. Emission drops any non-positive value (it is the safeguard
 * sentinel range, see SAFEGUARD_RECIPE_ID_BASE), so a 0-based id would erase recipe 0's
 * identity, and `getRuleRecipeIndex` recovers the index by subtracting 1. Never write
 * `recipeIdx + 1` inline: the offset and its inverse must not drift apart.
 */
export const recipeIdForIndex = (recipeIdx: number): number => Math.floor(recipeIdx) + 1

/**
 * Whether a raw `RecipeID` names a builder recipe at all — the ONE definition of the
 * "positive means a real recipe" predicate, mirroring the Rust core's `> 0` filter.
 *
 * Non-positive ids are the safeguard sentinel range and absent ids belong to base/HSF
 * rows, so neither maps to a `recipeModes` entry.
 */
export const isRecipeOwnedRuleId = (recipeId: number | null | undefined): recipeId is number => (
  typeof recipeId === 'number' && Number.isFinite(recipeId) && Math.floor(recipeId) > 0
)

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
  // One predicate decides "is this a builder recipe's id"; one offset inverts it.
  if (!isRecipeOwnedRuleId(rawId)) return null
  return Math.floor(rawId) - 1
}

export function applyRecipeIndexMutable(rule: RuleWithRecipeMetadata, recipeIdx: number, recipeName?: string | null): void {
  if (!rule || !Number.isFinite(recipeIdx) || recipeIdx < 0) {
    if (rule) {
      delete (rule as { RecipeID?: number }).RecipeID
      delete (rule as { RecipeName?: string }).RecipeName
    }
    return
  }
  rule.RecipeID = recipeIdForIndex(recipeIdx)
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
    RecipeID: recipeIdForIndex(recipeIdx),
    ...(nextName ? { RecipeName: nextName } : {}),
  }
  return clone
}

type RecipeNameList = readonly (string | null | undefined)[] | null | undefined

/**
 * Resolve the label to show for Gear Inspector matches.
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
