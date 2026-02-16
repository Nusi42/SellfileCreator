/**
 * historySnapshotUtils.ts
 *
 * Cloning helpers for history descriptor snapshots.
 */
import type { BuilderRecipe, SubstatTargetTable } from '../lib/hsfBuilder'
import type { FinalSellRemainderConfig } from '../lib/logicHub'
import type { Metaset } from '../lib/metasets'
import type { SafeguardRule } from '../lib/safeguards'
import { cloneBuilderRecipe } from '../lib/multiEditDraft'
import { cloneMetasets } from '../lib/metasets'
import { cloneSafeguardRules } from '../lib/safeguards'
import { cloneSubstatTargets } from '../lib/substatTargets'

// snapshotBuilderRecipe detaches a builder recipe for history storage.
export const snapshotBuilderRecipe = (cfg: BuilderRecipe): BuilderRecipe => (
  // Use the shared clone helper so nested arrays are copied.
  cloneBuilderRecipe(cfg)
)

// snapshotBuilderRecipes clones a list of recipes in one pass.
export const snapshotBuilderRecipes = (recipes: readonly BuilderRecipe[]): BuilderRecipe[] => (
  // Reuse the per-recipe clone to keep behavior consistent.
  recipes.map((cfg) => cloneBuilderRecipe(cfg))
)

// snapshotMetasets clones metasets so name/icon changes do not rewrite history.
export const snapshotMetasets = (metasets: readonly Metaset[]): Metaset[] => (
  // Use the shared clone helper to detach the sets arrays.
  cloneMetasets(metasets)
)

// snapshotSafeguardRules clones safeguard rules for stable history entries.
export const snapshotSafeguardRules = (rules: readonly SafeguardRule[]): SafeguardRule[] => (
  // Use the shared clone helper to detach nested arrays.
  cloneSafeguardRules(rules)
)

// snapshotSubstatTargets clones the target table to avoid shared references.
export const snapshotSubstatTargets = (targets: SubstatTargetTable): SubstatTargetTable => (
  // Use the shared helper so stars and fallback are copied.
  cloneSubstatTargets(targets)
)

// snapshotFinalSellRemainder clones the final-sell recipe for history storage.
export const snapshotFinalSellRemainder = (recipe: FinalSellRemainderConfig): FinalSellRemainderConfig => ({
  // Copy booleans directly since they are immutable.
  artifacts: recipe.artifacts,
  // Preserve accessory flag in the snapshot.
  accessories: recipe.accessories,
  // Clone the levels array to avoid shared references.
  levels: [...(recipe.levels ?? [])],
  // Preserve the sets mode since it is a scalar.
  setsMode: recipe.setsMode,
})
