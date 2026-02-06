import type { KeepUniqueCandidate, KeepUniqueRuleCountMode, KeepUniqueDetectionArtifact } from './keepUniques'
import {
  KEEP_UNIQUE_DEFAULT_COUNT_MODE,
  buildKeepUniqueDetectionArtifact,
  coerceStatVariant,
  getKeepUniqueCountKey,
  getKeepUniqueItemKey,
  sanitizeKeepUniqueCountMode,
} from './keepUniques'
import type { StatVariant } from './types'
import { StatVariant as StatVariantEnum, STAT_VARIANTS_PRIORITY } from './types'

// Keep Best Substat rules track a single substat plus a top-N quota per scope.
export type KeepBestSubstatRule = {
  id: string
  substat: StatVariant
  requiredCount: number
  countMode: KeepUniqueRuleCountMode
}

// Detection entries expose coverage counts plus the concrete items protected.
export type KeepBestSubstatDetectionEntry = {
  ruleId: string | null
  substat: StatVariant
  countMode: KeepUniqueRuleCountMode
  perGroupRequiredCount: number
  groupsTracked: number
  topCount: number
  keptCount: number
  soldCount: number
  itemKeys: number[]
  artifacts: KeepUniqueDetectionArtifact[]
}

// Detection snapshots are stored in memory only; never serialized to HSFC.
export type KeepBestSubstatDetectionSnapshot = {
  scannedAt: number
  entries: KeepBestSubstatDetectionEntry[]
}

// Merge input mirrors Keep Uniques: enabled flag + rules + optional detection.
export type KeepBestSubstatMergeInput = {
  enabled: boolean
  rules: readonly KeepBestSubstatRule[]
  detection?: KeepBestSubstatDetectionSnapshot | null
}

// Keep Best Substat only accepts real stat variants; reuse the canonical priority list.
export const KEEP_BEST_SUBSTAT_VARIANTS: readonly StatVariant[] = STAT_VARIANTS_PRIORITY

/** Generate a short, unique id for best-substat rules. */
export function createKeepBestSubstatRuleId(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `kbs_${Date.now().toString(36)}_${rand}`
}

/** Normalize Keep Best Substat rules; returns null when the payload is invalid. */
export const normalizeKeepBestSubstatRule = (value: unknown): KeepBestSubstatRule | null => {
  if (!value || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
  // Substat is required and must not be "Any".
  const substat = coerceStatVariant(rec.substat ?? rec.stat ?? rec.variant)
  if (substat === StatVariantEnum.Any) return null
  // Preserve ids when possible so imports stay stable.
  const rawId = typeof rec.id === 'string' && rec.id.trim().length > 0 ? rec.id.trim() : createKeepBestSubstatRuleId()
  // Required count defaults to 1 and is clamped to whole numbers.
  const rawRequired = Number(rec.requiredCount ?? rec.keepCount)
  const requiredCount = Number.isFinite(rawRequired) && rawRequired >= 1 ? Math.floor(rawRequired) : 1
  // Count mode mirrors Keep Uniques for shared scope chips.
  const countMode = (() => {
    if ('countMode' in rec) return sanitizeKeepUniqueCountMode(rec.countMode as KeepUniqueRuleCountMode)
    return { ...KEEP_UNIQUE_DEFAULT_COUNT_MODE }
  })()
  return {
    id: rawId,
    substat,
    requiredCount,
    countMode,
  }
}

/** Default list for new sessions: start empty so users opt in explicitly. */
export function buildDefaultKeepBestSubstatRules(): KeepBestSubstatRule[] {
  return []
}

/**
 * True when the master toggle is on and at least one rule is defined.
 * Used by pipeline callers to avoid unnecessary detection passes.
 */
export const hasActiveKeepBestSubstatRules = (input: KeepBestSubstatMergeInput | null | undefined): boolean => {
  if (!input || input.enabled !== true) return false
  if (!Array.isArray(input.rules) || input.rules.length === 0) return false
  return input.rules.some((rule) => Boolean(rule))
}

// Lightly-typed source for labeling injected keep-best rules.
type KeepBestSubstatLabelSource = KeepBestSubstatRule | { __keepBestSubstatRuleId?: string; __keepBestSubstatRuleOrdinal?: number } | null | undefined

/**
 * Resolve the label to display for a Keep Best Substat rule or injected row.
 * Prefers a numeric ordinal, then falls back to the rule id.
 */
export function resolveKeepBestSubstatRuleLabel(source: KeepBestSubstatLabelSource): string | null {
  if (!source) return null
  const ordinal = ((): number | null => {
    if (typeof source !== 'object' || source === null) return null
    if ('__keepBestSubstatRuleOrdinal' in source) {
      const value = Number((source as { __keepBestSubstatRuleOrdinal?: number }).__keepBestSubstatRuleOrdinal)
      if (Number.isFinite(value) && value > 0) return value
    }
    return null
  })()
  if (ordinal) return `#${ordinal}`
  const fallbackId = 'id' in source ? source.id : source.__keepBestSubstatRuleId
  if (typeof fallbackId === 'string') {
    const trimmed = fallbackId.trim()
    if (trimmed.length > 0) return `#${trimmed}`
  }
  return null
}

/**
 * Build a stable signature for keep-best rules so caches can cheaply detect edits.
 * Only data that affects detection is included; cosmetic ordering stays ignored.
 */
export const fingerprintKeepBestSubstatRuleList = (rules: readonly KeepBestSubstatRule[]): string => {
  if (!rules.length) return ''
  return rules.map((rule) => {
    // Normalize the substat numeric key for comparisons.
    const substat = Number(rule.substat ?? 0)
    // Clamp counts so signatures ignore accidental float drift.
    const required = Number.isFinite(rule.requiredCount) ? Number(rule.requiredCount) : 0
    // Normalize count mode so empty scopes collapse to per-rule.
    const mode = sanitizeKeepUniqueCountMode(rule.countMode)
    const modeKey = [
      mode.perRule ? 1 : 0,
      mode.perSlot ? 1 : 0,
      mode.perSet ? 1 : 0,
      mode.perFaction ? 1 : 0,
      mode.perMainStat ? 1 : 0,
    ].join('')
    return `${rule.id ?? substat}:${substat}:${required}:${modeKey}`
  }).join('|')
}

// Resolve the stat value for one candidate to score it for ranking.
const resolveSubstatValue = (candidate: KeepUniqueCandidate, substat: StatVariant): number => {
  const entry = candidate.artifact.substats.find((stat) => Number(stat.variant) === Number(substat))
  const raw = Number(entry?.totalValue ?? 0)
  return Number.isFinite(raw) ? raw : 0
}

type ScoredCandidate = {
  candidate: KeepUniqueCandidate
  value: number
}

// Sort higher values first; tie-break by item key for deterministic output.
const sortScoredCandidates = (entries: ScoredCandidate[]): ScoredCandidate[] => {
  return entries.slice().sort((left, right) => {
    const delta = right.value - left.value
    if (delta !== 0) return delta
    // Stable fallback keeps tie ordering deterministic across runs.
    return left.candidate.itemKey - right.candidate.itemKey
  })
}

/** Compute Keep Best Substat coverage against the candidate sold rows. */
export function computeKeepBestSubstatProtection(params: {
  candidates: readonly KeepUniqueCandidate[]
  rules: readonly KeepBestSubstatRule[]
  enabled: boolean
  now?: number
}): KeepBestSubstatDetectionSnapshot {
  const { candidates, rules, enabled, now } = params
  const entries: KeepBestSubstatDetectionEntry[] = []
  const timestamp = Number.isFinite(now) ? Number(now) : Date.now()

  for (const rule of rules) {
    // Normalize the count mode so scope chips stay consistent.
    const countMode = sanitizeKeepUniqueCountMode(rule.countMode)
    // Per-rule means one shared bucket; per-group uses slot/set/faction/main splits.
    const perRuleMode = countMode.perRule
    // Required count must be at least 1.
    const requiredPerGroup = Math.max(1, Math.floor(rule.requiredCount))
    // Score only the candidates with the targeted substat.
    const matching = candidates
      .map((candidate) => ({
        candidate,
        value: resolveSubstatValue(candidate, rule.substat),
      }))
      // Only consider items that actually carry the selected substat.
      .filter((entry) => entry.value > 0)
    const groups = new Map<string, ScoredCandidate[]>()
    if (perRuleMode) {
      groups.set('global', matching)
    } else {
      for (const entry of matching) {
        const key = getKeepUniqueCountKey(entry.candidate.artifact, countMode)
        const bucket = groups.get(key)
        if (bucket) {
          bucket.push(entry)
        } else {
          groups.set(key, [entry])
        }
      }
    }

    let topCount = 0
    let keptCount = 0
    let soldCount = 0
    const itemKeys: number[] = []
    const artifacts: KeepUniqueDetectionArtifact[] = []
    for (const bucket of groups.values()) {
      if (bucket.length === 0) continue
      // Sort by substat value so top-N selection is deterministic.
      const sorted = sortScoredCandidates(bucket)
      // Cutoff index is N-1; clamp to the bucket length.
      const cutoffIndex = Math.min(requiredPerGroup, sorted.length) - 1
      const cutoffValue = cutoffIndex >= 0 ? sorted[cutoffIndex]!.value : Number.POSITIVE_INFINITY
      for (const entry of sorted) {
        // Stop once we drop below the cutoff so ties at N are included.
        if (entry.value < cutoffValue) break
        topCount += 1
        if (!enabled) continue
        if (entry.candidate.isSold) {
          soldCount += 1
          itemKeys.push(getKeepUniqueItemKey(entry.candidate.artifact))
          artifacts.push(buildKeepUniqueDetectionArtifact(entry.candidate))
        } else {
          keptCount += 1
        }
      }
    }

    entries.push({
      ruleId: rule.id,
      substat: rule.substat,
      countMode,
      perGroupRequiredCount: requiredPerGroup,
      groupsTracked: groups.size,
      topCount,
      keptCount,
      soldCount,
      itemKeys,
      artifacts,
    })
  }

  return { scannedAt: timestamp, entries }
}
