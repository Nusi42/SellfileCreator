/**
 * historyLabelUtils.ts
 *
 * Snapshot and formatting helpers for history label strings.
 */
import type { BuilderRecipe } from '../lib/hsfBuilder'
import type { TranslateFn } from './historyI18n'

// RecipeLabelSnapshot keeps index + name stable without localization.
export type RecipeLabelSnapshot = {
  index: number
  name: string | null
}

// RecipeInsertionLocation describes where new recipes landed in the list.
export type RecipeInsertionLocation =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'after'; anchor: RecipeLabelSnapshot }

// snapshotRecipeLabel captures the index + name at creation time.
export const snapshotRecipeLabel = (index: number, recipe: BuilderRecipe): RecipeLabelSnapshot => {
  // Trim once so future edits do not rewrite stored labels.
  const rawName = (recipe.name ?? '').trim()
  // Persist the trimmed name or null when blank.
  const name = rawName.length > 0 ? rawName : null
  // Return the snapshot so formatting can be localized later.
  return { index, name }
}

// snapshotRecipeLabels captures multiple labels from a recipe list.
export const snapshotRecipeLabels = (
  recipes: readonly BuilderRecipe[],
  indices: readonly number[],
): RecipeLabelSnapshot[] => {
  // Normalize and capture only valid indices.
  const snapshots: RecipeLabelSnapshot[] = []
  for (const index of indices) {
    const recipe = recipes[index]
    if (!recipe) continue
    snapshots.push(snapshotRecipeLabel(index, recipe))
  }
  return snapshots
}

// formatRecipeLabel mirrors the old buildRecipeLabel but defers localization.
export const formatRecipeLabel = (snapshot: RecipeLabelSnapshot, t: TranslateFn): string => {
  // Format the base label with the localized recipe number.
  const base = t('historyRecipeLabel', { n: snapshot.index + 1 })
  // Append the quoted name when present to match prior output.
  return snapshot.name ? `${base} - "${snapshot.name}"` : base
}

// formatRecipeLabelFromRecipe snapshots then formats a recipe label in one step.
export const formatRecipeLabelFromRecipe = (
  index: number,
  recipe: BuilderRecipe,
  t: TranslateFn,
): string => (
  // Reuse snapshot + format helpers so behavior stays centralized.
  formatRecipeLabel(snapshotRecipeLabel(index, recipe), t)
)

// buildInsertionLocation captures where an insert happened.
export const buildInsertionLocation = (
  index: number,
  previous: readonly BuilderRecipe[],
): RecipeInsertionLocation | null => {
  // Treat an empty list as "at start" so history stays explicit.
  if (previous.length === 0) return { kind: 'start' }
  // Clamp to start when insert index is before the list.
  if (index <= 0) return { kind: 'start' }
  // Clamp to end when insert index is after the list.
  if (index >= previous.length) return { kind: 'end' }
  // Snapshot the anchor label so history stays stable.
  return { kind: 'after', anchor: snapshotRecipeLabel(index - 1, previous[index - 1]!) }
}

// formatInsertionLocation localizes the insertion position.
export const formatInsertionLocation = (
  location: RecipeInsertionLocation | null,
  t: TranslateFn,
): string | null => {
  // Preserve nulls so callers can skip the line.
  if (!location) return null
  // Map the location kind onto localized strings.
  if (location.kind === 'start') return t('historyRecipesInsertedAtStartLine')
  // Map end inserts to the end label.
  if (location.kind === 'end') return t('historyRecipesInsertedAtEndLine')
  // Format the "after" anchor with the localized recipe label.
  return t('historyRecipesInsertedAfterLine', { label: formatRecipeLabel(location.anchor, t) })
}
