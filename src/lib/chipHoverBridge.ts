// Cross-tree hover bridge linking an HSF preview row to its source chip (recipe OR safeguard).
// It lives outside React so hovering a row can toggle the matching chip's highlight imperatively
// (a `data-linked-hover` attribute) without re-rendering the app on every mouse-enter.
//
// SSOT: this is the ONE hover channel for both recipe and safeguard chips. The target carries a
// `kind` discriminator so a single bridge, a single subscriber, and a single row emitter serve both
// — rather than duplicating the pub/sub, the App-side chip highlighter, and the row hover logic per
// chip kind. `id` is the chip's 0-based index within its own list (recipe index or safeguard rule
// index); safeguard rows expose a 1-based ordinal, so callers convert with `ordinal - 1`.

// Which chip list a hover target addresses.
export type ChipHoverKind = 'recipe' | 'safeguard'

// A resolved hover target, or null when nothing is hovered.
export type ChipHoverTarget = { kind: ChipHoverKind; id: number } | null

// Current target + subscriber set (module-level singletons; the bridge is intentionally global).
let currentTarget: ChipHoverTarget = null
export type ChipHoverListener = (target: ChipHoverTarget) => void
const listeners = new Set<ChipHoverListener>()

// Two targets are equal when both are null, or both share kind + id.
function targetsEqual(a: ChipHoverTarget, b: ChipHoverTarget): boolean {
  if (a === null || b === null) return a === b
  return a.kind === b.kind && a.id === b.id
}

// Read the live target (used to reconcile bounds when the underlying list shrinks).
export function getChipHover(): ChipHoverTarget {
  return currentTarget
}

// Publish a new target; no-ops when unchanged so scrubbing rows stays cheap.
export function setChipHover(target: ChipHoverTarget): void {
  if (targetsEqual(currentTarget, target)) return
  currentTarget = target
  // Notify every subscriber; guard each so one throwing listener cannot break the others.
  listeners.forEach((listener) => {
    try {
      listener(target)
    } catch {}
  })
}

// Subscribe to target changes; the listener fires immediately with the current value.
export function subscribeChipHover(listener: ChipHoverListener): () => void {
  listeners.add(listener)
  try {
    listener(currentTarget)
  } catch {}
  return () => {
    listeners.delete(listener)
  }
}
