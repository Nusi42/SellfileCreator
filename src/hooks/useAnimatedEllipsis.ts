import { useEffect, useMemo, useState } from 'react'

export interface UseAnimatedEllipsisOptions {
  active: boolean
  minDots?: number
  maxDots?: number
  intervalMs?: number
  dotChar?: string
}

const DEFAULT_INTERVAL_MS = 420 as const

const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * Normalize a localized "building" label so we can append our own animated dots.
 * Most locales currently end the string with either "..." or "…"; gracefully
 * strip those while preserving any other trailing punctuation/spacing.
 */
export function stripAnimatedEllipsisSource(label: string): string {
  return label
    .replace(/\s+$/u, '')
    .replace(/(?:\u2026|\.{1,3})\s*$/u, '')
    .replace(/\s+$/u, '')
}

export function useAnimatedEllipsis(label: string, options: UseAnimatedEllipsisOptions): string {
  const {
    active,
    minDots: rawMinDots = 1,
    maxDots: rawMaxDots = 3,
    intervalMs: rawIntervalMs = DEFAULT_INTERVAL_MS,
    dotChar = '.',
  } = options

  const resolvedMinDots = Math.max(1, Math.floor(Number.isFinite(rawMinDots) ? rawMinDots : 1))
  const resolvedMaxDots = Math.max(resolvedMinDots, Math.floor(Number.isFinite(rawMaxDots) ? rawMaxDots : resolvedMinDots))
  const intervalMs = Math.max(16, Math.floor(Number.isFinite(rawIntervalMs) ? rawIntervalMs : DEFAULT_INTERVAL_MS))

  const baseLabel = useMemo(() => stripAnimatedEllipsisSource(label), [label])
  const [dotCount, setDotCount] = useState(() => resolvedMinDots)

  useEffect(() => {
    setDotCount((prev) => clamp(prev, resolvedMinDots, resolvedMaxDots))
  }, [resolvedMinDots, resolvedMaxDots])

  useEffect(() => {
    if (!active) {
      setDotCount(resolvedMinDots)
      return
    }
    if (typeof window === 'undefined') {
      setDotCount(resolvedMaxDots)
      return
    }

    setDotCount(resolvedMinDots)

    if (resolvedMinDots === resolvedMaxDots) {
      return () => {}
    }

    const timer = window.setInterval(() => {
      setDotCount((prev) => {
        const next = prev + 1
        if (next > resolvedMaxDots) return resolvedMinDots
        if (next < resolvedMinDots) return resolvedMinDots
        return next
      })
    }, intervalMs)

    return () => {
      window.clearInterval(timer)
    }
  }, [active, intervalMs, resolvedMinDots, resolvedMaxDots])

  if (!active) {
    return label
  }

  const dots = dotChar.repeat(clamp(dotCount, resolvedMinDots, resolvedMaxDots))
  return `${baseLabel}${dots}`
}
