export type ConfigHoverListener = (idx: number | null) => void

let currentHoverIdx: number | null = null
const listeners = new Set<ConfigHoverListener>()

export function getConfigHoverIndex(): number | null {
  return currentHoverIdx
}

export function setConfigHoverIndex(idx: number | null): void {
  if (currentHoverIdx === idx) return
  currentHoverIdx = idx
  listeners.forEach((listener) => {
    try {
      listener(idx)
    } catch {}
  })
}

export function subscribeConfigHover(listener: ConfigHoverListener): () => void {
  listeners.add(listener)
  try {
    listener(currentHoverIdx)
  } catch {}
  return () => {
    listeners.delete(listener)
  }
}
