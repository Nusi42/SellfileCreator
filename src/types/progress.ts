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
  options?: { throttleMs?: number },
) => {
  const throttleMs = options?.throttleMs ?? PROGRESS_THROTTLE_MS
  let lastAt = 0
  return (progress: ProgressSnapshot) => {
    if (!onProgress) return
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const shouldForward = progress.completed >= (progress.total ?? 0)
      || lastAt === 0
      || (now - lastAt) >= throttleMs
    if (!shouldForward) return
    onProgress(progress)
    lastAt = now
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
