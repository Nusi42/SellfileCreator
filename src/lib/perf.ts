/**
 * perf.ts
 *
 * Helpers for performance instrumentation. Keeps logging utilities in one spot
 * so temporary diagnostics stay consistent across the app.
 */

export function nowMs(): number {
  const perf = typeof performance !== 'undefined' ? performance : null
  if (perf && typeof perf.now === 'function') {
    return perf.now()
  }
  return Date.now()
}
