// Centralized payload describing determinate progress that workers and the UI share.
export type ProgressSnapshot = {
  completed: number
  total: number
}

// Shared throttle interval so worker/UI progress stays readable on large batches.
export const PROGRESS_THROTTLE_MS = 1000

// Wrap progress handlers so callers can opt into coarse-grained updates with guaranteed completion emission.
export const createProgressThrottler = (
  onProgress?: (progress: ProgressSnapshot) => void,
  options?: { throttleMs?: number; maxEvents?: number },
) => {
  const throttleMs = options?.throttleMs ?? PROGRESS_THROTTLE_MS
  // Emit at most ~N intermediate updates per run (completion is always forwarded).
  const maxEvents = Math.max(1, Math.floor(options?.maxEvents ?? 48))
  let lastAt = 0
  let lastCompleted = -1
  let lastTotal = -1
  return (progress: ProgressSnapshot) => {
    if (!onProgress) return
    const total = Number.isFinite(progress.total) ? Math.max(0, Number(progress.total)) : 0
    const completed = Number.isFinite(progress.completed) ? Math.max(0, Number(progress.completed)) : 0
    const done = total > 0 && completed >= total
    const firstSample = lastCompleted < 0
    const totalChanged = total !== lastTotal
    // Step-gating avoids calling performance.now() for every matcher iteration.
    const minStep = total > 0 ? Math.max(1, Math.floor(total / maxEvents)) : 1
    const advancedEnough = firstSample || totalChanged || (completed - lastCompleted) >= minStep
    if (!done && !advancedEnough) return
    // Keep the legacy time-based guard for noisy callers with tiny totals.
    if (!done && throttleMs > 0) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (!firstSample && !totalChanged && lastAt !== 0 && (now - lastAt) < throttleMs) {
        return
      }
      lastAt = now
    }
    lastCompleted = completed
    lastTotal = total
    onProgress(progress)
  }
}

// Clamp snapshots into a 0..1 ratio so UI callers cannot accidentally overflow.
export const clampProgressRatio = (snapshot: ProgressSnapshot | null | undefined): number => {
  if (!snapshot || snapshot.total <= 0) return 0
  const ratio = snapshot.completed / snapshot.total
  if (!Number.isFinite(ratio)) return 0
  if (ratio < 0) return 0
  if (ratio > 1) return 1
  return ratio
}
