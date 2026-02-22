import type { BuilderRecipe } from './hsfBuilder'
import type { Metaset } from './metasets'
import type { SafeguardRule } from './safeguards'

// Section toggles shared by Shift-load import and autosave restore prompts.
// Why: both flows enforce the same metaset dependency constraints.
export type MetasetDependentSelection = {
  recipes: boolean
  safeguards: boolean
  metasets: boolean
}

// Keep issue IDs explicit so UI copy can map to localized strings.
export type MetasetDependencyIssue = 'recipesRequireMetasets' | 'safeguardsRequireMetasets'

// Read recipe-level metaset references without mutating source arrays.
// Why: import dialogs need deterministic validation based on incoming payloads.
export const collectRecipeMetasetIds = (recipes: readonly BuilderRecipe[]): Set<string> => {
  const ids = new Set<string>()
  for (const recipe of recipes) {
    const metaIds = recipe.artifactMetaSets ?? []
    for (const id of metaIds) ids.add(String(id))
  }
  return ids
}

// Read safeguard-level metaset references from combination filters.
// Why: safeguard imports/restores can break if required metasets are skipped.
export const collectSafeguardMetasetIds = (rules: readonly SafeguardRule[]): Set<string> => {
  const ids = new Set<string>()
  for (const rule of rules) {
    const metaIds = rule.combination.metaSetIds ?? []
    for (const id of metaIds) ids.add(String(id))
  }
  return ids
}

// Build a quick lookup from payload metaset entries.
// Why: constraints apply only to references that point at incoming metasets.
export const collectMetasetIds = (metasets: readonly Metaset[]): Set<string> => {
  const ids = new Set<string>()
  for (const metaset of metasets) ids.add(String(metaset.id))
  return ids
}

// Report which selected sections become invalid when metasets are not imported.
// Why: recipes/safeguards may reference incoming metasets that would be missing.
export const getMetasetDependencyIssues = (args: {
  selection: MetasetDependentSelection
  incomingMetasetIds: ReadonlySet<string>
  recipeMetasetIds: ReadonlySet<string>
  safeguardMetasetIds: ReadonlySet<string>
}): MetasetDependencyIssue[] => {
  const { selection, incomingMetasetIds, recipeMetasetIds, safeguardMetasetIds } = args
  // Importing/restoring metasets resolves all dependency checks immediately.
  if (selection.metasets) return []
  const issues: MetasetDependencyIssue[] = []
  // Check recipe references only when recipe import/restore is selected.
  if (selection.recipes) {
    for (const metaId of recipeMetasetIds) {
      if (!incomingMetasetIds.has(metaId)) continue
      issues.push('recipesRequireMetasets')
      break
    }
  }
  // Check safeguards independently so dialogs can show granular guidance.
  if (selection.safeguards) {
    for (const metaId of safeguardMetasetIds) {
      if (!incomingMetasetIds.has(metaId)) continue
      issues.push('safeguardsRequireMetasets')
      break
    }
  }
  return issues
}
