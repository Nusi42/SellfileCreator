export type RecipeHoverListener = (idx: number | null) => void

let currentHoverIdx: number | null = null
const listeners = new Set<RecipeHoverListener>()

export function getRecipeHoverIndex(): number | null {
  return currentHoverIdx
}

export function setRecipeHoverIndex(idx: number | null): void {
  if (currentHoverIdx === idx) return
  currentHoverIdx = idx
  listeners.forEach((listener) => {
    try {
      listener(idx)
    } catch {}
  })
}

export function subscribeRecipeHover(listener: RecipeHoverListener): () => void {
  listeners.add(listener)
  try {
    listener(currentHoverIdx)
  } catch {}
  return () => {
    listeners.delete(listener)
  }
}
