export type ProgressSnapshot = {
  completed: number
  total: number
}

export const clampProgressRatio = (snapshot: ProgressSnapshot | null | undefined): number => {
  if (!snapshot || snapshot.total <= 0) return 0
  const ratio = snapshot.completed / snapshot.total
  if (!Number.isFinite(ratio)) return 0
  if (ratio < 0) return 0
  if (ratio > 1) return 1
  return ratio
}
