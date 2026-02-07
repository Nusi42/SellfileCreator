import type {
  KeepUniqueCandidate,
  KeepUniqueDetectionArtifact,
  KeepUniqueDetectionEntry,
  KeepUniquePlaceholderRequest,
  KeepUniqueRule,
  KeepUniqueRuleCountMode,
} from './keepUniques'
import {
  KEEP_UNIQUE_DEFAULT_COUNT_MODE,
  KeepUniqueRuleActivation as KeepUniqueRuleActivationEnum,
  artifactMatchesKeepUniqueRule,
  buildKeepUniqueDetectionArtifact,
  buildPlaceholderCombinationForGroup,
  cloneKeepUniqueCombination,
  coerceStatVariant,
  createEmptyKeepUniqueCombination,
  getKeepUniqueCountKey,
  hashKeepUniqueCombination,
  isKeepUniqueRuleActive,
  normalizeKeepUniqueActivation,
  normalizeKeepUniqueCombination,
  sanitizeKeepUniqueCountMode,
} from './keepUniques'
import type { StatVariant } from './types'
import { StatVariant as StatVariantEnum, STAT_VARIANTS_PRIORITY } from './types'
import { normalizeConfigName } from './ruleConfigIndex'

// Keep Best Substat rules mirror Keep Uniques plus a target substat to rank by.
export type KeepBestSubstatRule = KeepUniqueRule & {
  substat: StatVariant
}

// cloneKeepBestSubstatRule keeps history snapshots isolated from live edits.
export const cloneKeepBestSubstatRule = (rule: KeepBestSubstatRule): KeepBestSubstatRule => ({
  ...rule,
  combination: cloneKeepUniqueCombination(rule.combination),
  countMode: { ...rule.countMode },
})

// cloneKeepBestSubstatRules clones a list into detached rule objects.
export const cloneKeepBestSubstatRules = (rules: readonly KeepBestSubstatRule[]): KeepBestSubstatRule[] => (
  rules.map((rule) => cloneKeepBestSubstatRule(rule))
)

// Detection entries mirror Keep Unique entries plus the ranked substat target.
export type KeepBestSubstatDetectionEntry = KeepUniqueDetectionEntry & {
  substat: StatVariant
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

// Default scope matches Keep Uniques but skips per-main-stat grouping.
export const KEEP_BEST_SUBSTAT_DEFAULT_COUNT_MODE: KeepUniqueRuleCountMode = {
  perRule: false,
  perSet: KEEP_UNIQUE_DEFAULT_COUNT_MODE.perSet,
  perFaction: KEEP_UNIQUE_DEFAULT_COUNT_MODE.perFaction,
  perMainStat: false,
  perSlot: KEEP_UNIQUE_DEFAULT_COUNT_MODE.perSlot,
}

// Default seed keeps the top SPD substat across all slots/sets/factions.
const KEEP_BEST_SUBSTAT_DEFAULT_SUBSTAT: StatVariant = StatVariantEnum.SPD

/** Generate a short, unique id for best-substat rules. */
export function createKeepBestSubstatRuleId(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `kbs_${Date.now().toString(36)}_${rand}`
}

// normalizeKeepBestSubstatCountMode applies keep-best defaults for missing values.
const normalizeKeepBestSubstatCountMode = (value: unknown): KeepUniqueRuleCountMode => {
  if (!value) return { ...KEEP_BEST_SUBSTAT_DEFAULT_COUNT_MODE }
  if (typeof value === 'string') {
    if (value === 'perRule' || value === 'rule') {
      return {
        perRule: true,
        perSet: false,
        perFaction: false,
        perMainStat: false,
        perSlot: false,
      }
    }
    return { ...KEEP_BEST_SUBSTAT_DEFAULT_COUNT_MODE }
  }
  if (typeof value === 'object') {
    return sanitizeKeepUniqueCountMode(value as KeepUniqueRuleCountMode)
  }
  return { ...KEEP_BEST_SUBSTAT_DEFAULT_COUNT_MODE }
}

/** Normalize Keep Best Substat rules; returns null when the payload is invalid. */
export const normalizeKeepBestSubstatRule = (value: unknown): KeepBestSubstatRule | null => {
  if (!value || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
  // Parse the keep-unique-style combination payload so scope stays identical.
  const combination = rec.combination ?? rec.tuple
  const normalizedCombo = combination ? (normalizeKeepUniqueCombination(combination) ?? null) : null
  if (!normalizedCombo) return null
  // Substat is required and must not be "Any".
  const substat = coerceStatVariant(rec.substat)
  if (substat === StatVariantEnum.Any) return null
  // Preserve ids when possible so imports stay stable.
  const rawId = typeof rec.id === 'string' && rec.id.trim().length > 0 ? rec.id.trim() : createKeepBestSubstatRuleId()
  // Rule names are optional but should be trimmed for consistent display.
  const name = typeof rec.name === 'string' && rec.name.trim().length > 0 ? rec.name.trim() : ''
  // Required count defaults to 1 and is clamped to whole numbers.
  const rawRequired = Number(rec.requiredCount)
  const requiredCount = Number.isFinite(rawRequired) && rawRequired >= 1 ? Math.floor(rawRequired) : 1
  // Activation mirrors Keep Uniques (no legacy fallbacks).
  const activation = normalizeKeepUniqueActivation(rec.activation, undefined)
  // Count mode mirrors Keep Uniques but defaults to keep-best scope.
  const countMode = 'countMode' in rec
    ? normalizeKeepBestSubstatCountMode(rec.countMode)
    : { ...KEEP_BEST_SUBSTAT_DEFAULT_COUNT_MODE }
  return {
    id: rawId,
    name,
    combination: normalizedCombo,
    substat,
    requiredCount,
    activation,
    countMode,
  }
}

/** Default list for new sessions: seed a single SPD rule. */
export function buildDefaultKeepBestSubstatRules(): KeepBestSubstatRule[] {
  return [
    {
      id: createKeepBestSubstatRuleId(),
      name: '',
      combination: createEmptyKeepUniqueCombination(),
      substat: KEEP_BEST_SUBSTAT_DEFAULT_SUBSTAT,
      requiredCount: 1,
      activation: KeepUniqueRuleActivationEnum.ProtectExisting,
      countMode: { ...KEEP_BEST_SUBSTAT_DEFAULT_COUNT_MODE },
    },
  ]
}

/**
 * True when the master toggle is on and at least one rule is enabled.
 * Used by pipeline callers to avoid unnecessary detection passes.
 */
export const hasActiveKeepBestSubstatRules = (input: KeepBestSubstatMergeInput | null | undefined): boolean => {
  if (!input || input.enabled !== true) return false
  if (!Array.isArray(input.rules) || input.rules.length === 0) return false
  return input.rules.some((rule) => Boolean(rule) && isKeepUniqueRuleActive(rule))
}

// Lightly-typed source for labeling injected keep-best rules.
type KeepBestSubstatLabelSource = KeepBestSubstatRule
  | { __keepBestSubstatRuleId?: string; __keepBestSubstatRuleOrdinal?: number; ConfigName?: string | null }
  | null
  | undefined

/**
 * Resolve the label to display for a Keep Best Substat rule or injected row.
 * Prefers trimmed rule names, then falls back to a `#id` sentinel when blank.
 */
export function resolveKeepBestSubstatRuleLabel(source: KeepBestSubstatLabelSource): string | null {
  if (!source) return null
  const rawName = 'name' in source ? source.name : source.ConfigName
  const normalizedName = normalizeConfigName(rawName ?? null)
  if (normalizedName) return normalizedName
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
    // Activation affects projected counts, so include it in the signature.
    const activation = rule.activation ?? KeepUniqueRuleActivationEnum.ProtectExisting
    // Combination filters define which candidates are ranked.
    const comboHash = hashKeepUniqueCombination(rule.combination)
    return `${rule.id ?? substat}:${substat}:${required}:${activation}:${modeKey}:${comboHash}`
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
    // Align the keep-best rule activation with Keep Uniques semantics.
    const activation = rule.activation ?? KeepUniqueRuleActivationEnum.ProtectExisting
    // Keep the canonical count-mode shape for scope chips and grouping.
    const countMode = sanitizeKeepUniqueCountMode(rule.countMode)
    // Per-rule means one shared bucket; per-group uses slot/set/faction/main splits.
    const perRuleMode = countMode.perRule
    // Required count must be at least 1.
    const requiredPerGroup = Math.max(1, Math.floor(rule.requiredCount))
    // Rule activity gates projected totals and placeholders.
    const ruleActive = enabled && activation !== KeepUniqueRuleActivationEnum.Off
    // Filter to candidates that match the combination and include the substat.
    const matching = candidates
      .filter((candidate) => artifactMatchesKeepUniqueRule(candidate.artifact, rule.combination))
      .map((candidate) => ({
        candidate,
        value: resolveSubstatValue(candidate, rule.substat),
      }))
      // Only consider items that actually carry the selected substat.
      .filter((entry) => entry.value > 0)
    // Group candidates by scope (or keep a single global bucket).
    const groups = new Map<string, ScoredCandidate[]>()
    if (perRuleMode) {
      if (matching.length > 0) groups.set('global', matching)
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

    const groupsTracked = groups.size
    const effectiveGroupCount = groupsTracked > 0 ? groupsTracked : 1
    const requiredTotal = requiredPerGroup * effectiveGroupCount
    let currentCount = 0
    let keptCount = 0
    let soldCount = 0
    let deficit = 0
    const itemKeys: number[] = []
    const artifacts: KeepUniqueDetectionArtifact[] = []
    const placeholders: KeepUniquePlaceholderRequest[] = []

    for (const bucket of groups.values()) {
      if (bucket.length === 0) continue
      // Sort by substat value so top-N selection is deterministic.
      const sorted = sortScoredCandidates(bucket)
      // Cutoff index is N-1; clamp to the bucket length.
      const cutoffIndex = Math.min(requiredPerGroup, sorted.length) - 1
      const cutoffValue = cutoffIndex >= 0 ? sorted[cutoffIndex]!.value : Number.POSITIVE_INFINITY
      let groupTotal = 0
      let groupKept = 0
      let groupSold = 0
      for (const entry of sorted) {
        // Stop once we drop below the cutoff so ties at N are included.
        if (entry.value < cutoffValue) break
        groupTotal += 1
        if (entry.candidate.isSold) {
          groupSold += 1
          itemKeys.push(entry.candidate.itemKey)
          artifacts.push(buildKeepUniqueDetectionArtifact(entry.candidate))
        } else {
          groupKept += 1
        }
      }
      currentCount += groupTotal
      keptCount += groupKept
      soldCount += groupSold
      // Deficits use the full bucket size (not the tie-expanded total).
      const deficitGroup = Math.max(0, requiredPerGroup - bucket.length)
      if (deficitGroup > 0) {
        placeholders.push({
          combination: buildPlaceholderCombinationForGroup({
            base: rule.combination,
            mode: countMode,
            sample: bucket[0]?.candidate.artifact ?? null,
          }),
          missing: deficitGroup,
          reason: 'group',
        })
      }
      deficit += deficitGroup
    }

    if (groupsTracked === 0 && requiredPerGroup > 0) {
      placeholders.push({
        combination: cloneKeepUniqueCombination(rule.combination),
        missing: requiredPerGroup,
        reason: 'global',
      })
      deficit = requiredPerGroup
    }

    const projected = keptCount + (ruleActive ? soldCount : 0)
    entries.push({
      hash: hashKeepUniqueCombination(rule.combination),
      combination: rule.combination,
      ruleId: rule.id,
      ruleActivation: activation,
      countMode,
      perGroupRequiredCount: requiredPerGroup,
      groupsTracked,
      requiredCount: requiredTotal,
      currentCount,
      projectedCount: projected,
      deficit,
      coveredByExisting: keptCount >= requiredTotal,
      itemKeys,
      artifacts,
      placeholders,
      substat: rule.substat,
    })
  }

  return { scannedAt: timestamp, entries }
}
