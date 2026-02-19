import { buildCanonicalRecipeSnapshot } from './recipeSnapshot'
import type { BuilderRecipe } from './hsfBuilder'

// Cache duplicate snapshot keys per recipe identity so reordering or toggling
// selection does not rebuild the normalization payload repeatedly.
const SNAPSHOT_KEY_CACHE: WeakMap<BuilderRecipe, string> = new WeakMap()

type SnapshotKey = string

function snapshotKeyForRecipe(recipe: BuilderRecipe): SnapshotKey {
  const cached = SNAPSHOT_KEY_CACHE.get(recipe)
  if (cached) return cached
  const snapshot = buildCanonicalRecipeSnapshot(recipe)

  let key: SnapshotKey
  try {
    key = JSON.stringify(snapshot)
  } catch {
    key = `${Math.random()}`
  }

  SNAPSHOT_KEY_CACHE.set(recipe, key)
  return key
}

export function computeDuplicateIndices(recipes: BuilderRecipe[]): Array<number | null> {
  const seen = new Map<SnapshotKey, number>()
  const duplicates: Array<number | null> = []

  for (let index = 0; index < recipes.length; index += 1) {
    const recipe = recipes[index]!
    if (recipe.exportMode === 'separator') {
      duplicates.push(null)
      continue
    }
    const key = snapshotKeyForRecipe(recipe)
    const firstSeen = seen.get(key)
    if (firstSeen === undefined) {
      seen.set(key, index)
      duplicates.push(null)
    } else {
      duplicates.push(firstSeen)
    }
  }

  return duplicates
}
