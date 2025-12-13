/**
 * focusCycle
 *
 * Provides a small, typed DOM helper for keyboard navigation inside dense
 * numeric grids, where the default Tab order would otherwise stop on auxiliary
 * controls (e.g. spinner buttons) or escape the popout/dialog.
 *
 * This is intentionally DOM-based so callers can scope navigation to the
 * rendered container without reimplementing focus bookkeeping per component.
 */

export type FocusCycleDelta = -1 | 1

export type FocusCycleOrder<T extends HTMLElement> = (elements: readonly T[]) => readonly T[]

export type FocusCycleOptions<T extends HTMLElement> = {
  // Scope all candidates to the active container (dialog/menu section).
  container: HTMLElement | null
  // Select only the members of the focus cycle (typically the input elements).
  selector: string
  // The currently-focused node; used as the stable index anchor.
  current: T
  // Direction (+1 = Tab, -1 = Shift+Tab).
  delta: FocusCycleDelta
  // When true, first↔last wraps so Tab never escapes the cycle.
  wrap: boolean
  // Optional custom order (e.g. when DOM order differs from desired UX order).
  order?: FocusCycleOrder<T>
}

type MaybeDisableable = { disabled?: boolean }

function isDisabled(node: HTMLElement): boolean {
  // DOM types do not unify `disabled`, so treat it as an optional boolean.
  const value = (node as unknown as MaybeDisableable).disabled
  return Boolean(value)
}

function focusAndSelect(node: HTMLElement): void {
  // Focus first so screen readers and keyboard users follow the same state.
  node.focus()
  // Select for fast overwrite of numeric values (common workflow in these grids).
  if ('select' in node && typeof (node as HTMLInputElement).select === 'function') {
    (node as HTMLInputElement).select()
  }
}

/**
 * Cycles focus to the adjacent element within a container-scoped list.
 *
 * Returns true only when focus was moved; callers typically preventDefault only
 * on a successful move so the browser can handle edge cases normally.
 */
export function focusCycleWithin<T extends HTMLElement>(options: FocusCycleOptions<T>): boolean {
  const { container, selector, current, delta, wrap, order } = options
  // During mount/unmount transitions the container can be null; do nothing.
  if (!container) return false
  // Query within the container so we never escape to unrelated page controls.
  const candidates = Array.from(container.querySelectorAll<T>(selector))
  // Filter out disconnected or disabled nodes to avoid focusing stale elements.
  const live = candidates.filter(node => node.isConnected && !isDisabled(node))
  // Apply the optional ordering hook to enforce UX order over DOM order.
  const ordered = (order ? Array.from(order(live)) : live).filter(node => node.isConnected && !isDisabled(node))
  if (ordered.length === 0) return false
  // Find the current index; if absent we refuse to guess to avoid surprise jumps.
  const currentIndex = ordered.indexOf(current)
  if (currentIndex < 0) return false
  // Compute the next index with optional wrap behavior.
  const rawNextIndex = currentIndex + delta
  const nextIndex = wrap ? (rawNextIndex + ordered.length) % ordered.length : rawNextIndex
  const next = ordered[nextIndex]
  if (!next) return false
  // Avoid churn when an order function returns duplicates or self.
  if (next === current) return false
  focusAndSelect(next)
  return true
}

