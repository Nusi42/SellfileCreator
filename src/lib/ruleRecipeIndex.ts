import type { HsfRuleWithCfg } from './merge'

type RuleWithConfigMetadata = {
  RecipeID?: number
  RecipeName?: string
  // Legacy HSF payload compatibility: accept old keys at load boundary.
  ConfigID?: number
  ConfigName?: string
}

const normalizeConfigId = (recipeIdx: number): number => Math.floor(recipeIdx) + 1
const sanitizeName = (name?: string | null): string | undefined => {
  if (typeof name !== 'string') return undefined
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Normalize builder-provided labels into the trimmed strings we serialize. */
export function normalizeRecipeName(name?: string | null): string | undefined {
  return sanitizeName(name)
}

export function getRuleRecipeIndex(rule: RuleWithConfigMetadata | null | undefined): number | null {
  // Prefer canonical metadata and fall back to legacy keys only when needed.
  const rawId = (rule?.RecipeID ?? rule?.ConfigID)
  if (typeof rawId === 'number' && Number.isFinite(rawId)) {
    const cfgId = Math.floor(rawId)
    if (cfgId > 0) return cfgId - 1
  }
  return null
}

export function applyRecipeIndexMutable(rule: RuleWithConfigMetadata, recipeIdx: number, recipeName?: string | null): void {
  if (!rule || !Number.isFinite(recipeIdx) || recipeIdx < 0) {
    if (rule) {
      delete (rule as { RecipeID?: number }).RecipeID
      delete (rule as { RecipeName?: string }).RecipeName
      delete (rule as { ConfigID?: number }).ConfigID
      delete (rule as { ConfigName?: string }).ConfigName
    }
    return
  }
  rule.RecipeID = normalizeConfigId(recipeIdx)
  delete (rule as { ConfigID?: number }).ConfigID
  const nextName = sanitizeName(recipeName ?? rule.RecipeName ?? rule.ConfigName)
  if (nextName) {
    rule.RecipeName = nextName
    delete (rule as { ConfigName?: string }).ConfigName
  } else if ('RecipeName' in rule) {
    delete (rule as { RecipeName?: string }).RecipeName
    delete (rule as { ConfigName?: string }).ConfigName
  }
}

export function cloneRuleWithRecipeIndex(rule: HsfRuleWithCfg, recipeIdx: number, recipeName?: string | null): HsfRuleWithCfg {
  if (!Number.isFinite(recipeIdx) || recipeIdx < 0) {
    const clone = { ...rule }
    delete (clone as { RecipeID?: number }).RecipeID
    if ('RecipeName' in clone) delete (clone as { RecipeName?: string }).RecipeName
    delete (clone as { ConfigID?: number }).ConfigID
    if ('ConfigName' in clone) delete (clone as { ConfigName?: string }).ConfigName
    return clone
  }
  const legacy = rule as HsfRuleWithCfg & { ConfigName?: string }
  const nextName = sanitizeName(recipeName ?? legacy.RecipeName ?? legacy.ConfigName)
  const clone: HsfRuleWithCfg = {
    ...rule,
    RecipeID: normalizeConfigId(recipeIdx),
    ...(nextName ? { RecipeName: nextName } : {}),
  }
  delete (clone as { ConfigID?: number }).ConfigID
  if ('ConfigName' in clone) delete (clone as { ConfigName?: string }).ConfigName
  return clone
}

type RecipeNameList = readonly (string | null | undefined)[] | null | undefined

/**
 * Resolve the label to show for tester matches.
 * Keep-unique sentinel rules do not map to builder recipes, so we fall back to the trimmed rule name.
 */
export function resolveMatchRecipeName(
  recipeIdx: number | null | undefined,
  recipeNames: RecipeNameList,
  rule: RuleWithConfigMetadata | null | undefined,
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
  // Prefer canonical metadata and fall back to legacy metadata if present.
  const fallback = normalizeRecipeName(rule?.RecipeName ?? rule?.ConfigName ?? null)
  return fallback ?? null
}
