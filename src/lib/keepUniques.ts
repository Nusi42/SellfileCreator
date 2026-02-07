import { isAccessorySlot } from './testerDomain'
import { evaluateMatchesByConfig } from './ruleEval'
import type { TesterPreviewRow } from '../types/testerPreview'
import type {
  ArtifactSetId,
  ArtifactTypeId,
  FactionId,
  LevelMilestone,
  RankValue,
  StatVariant,
} from './types'
import {
  ALLOWED_MAIN_BY_SLOT,
  ArtifactType,
  PREFERRED_ARTIFACT_TYPE_ORDER,
  StatId,
  StatVariant as StatVariantEnum,
  STAT_VARIANTS_PRIORITY,
  artifactSetNames,
  artifactTypeNames,
  compareArtifactSets,
  factionNames,
  getArmorFixedSetIds,
  getArmorVariableSetIds,
  getAccessorySlotsCompatibleSetIds,
  rarityNames,
  variantFromLabel,
  findArtifactSetIdByName,
} from './types'
import type { BuilderConfig, SellfileExportMode } from './hsfBuilder'
import type { HsfRuleWithCfg } from './merge'
import type { NormalizedGearArtifact } from './importers/gearDbNormalizer'
import type { Metaset } from './metasets'
import { normalizeConfigName } from './ruleConfigIndex'
import type { ArtifactSetSelectionEntry } from './gearSets/selection'
import { normalizeArtifactSetSelections, splitArtifactSetSelections } from './gearSets/selection'
import { hasIgnoreKeepUniqueTag } from './tagHelpers'
import { computeTesterNormalizedSubstatScore, normalizeTesterSortWeight, TESTER_SORT_WEIGHT_DEFAULT } from './testerSort'
import { ACCESSORY_NO_SET_ID } from './constants'

const RANK_MIN = 1
const RANK_MAX = 6

// Cache faction IDs for placeholder enumeration (skip the 0 "any" sentinel).
const ALL_FACTION_IDS = Object.freeze(
  Object.keys(factionNames)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)
    .map((value) => value as FactionId),
)

export const buildIgnoreKeepUniqueConfigIndices = (configs: readonly BuilderConfig[]): ReadonlySet<number> => {
  // Track indices so we can skip only tagged configs during detection.
  const ignored = new Set<number>()
  // Maintain index alignment with rule-building config order.
  for (let idx = 0; idx < configs.length; idx += 1) {
    // Read the tags directly from the builder config.
    const tags = configs[idx]?.tags
    // Only add when the ignore tag is present.
    if (hasIgnoreKeepUniqueTag(tags)) {
      ignored.add(idx)
    }
  }
  // Return the set so callers can reuse it across scans.
  return ignored
}

export type KeepUniqueCombination = {
  slots: ArtifactTypeId[]
  sets: ArtifactSetSelectionEntry[]
  metaSetIds: string[]
  ranks: RankValue[]
  rarities: RankValue[]
  mainStats: StatVariant[]
  factions: FactionId[]
}

// Count mode decides whether the required total is per rule or enforced per set/faction/main tuple.
export type KeepUniqueRuleCountMode = {
  perRule: boolean
  perSet: boolean
  perFaction: boolean
  perMainStat: boolean
  perSlot: boolean
}

// Mirrors the default scope-chip state (slot+set+faction+main) so HSFC imports and tutorials stay aligned.
export const KEEP_UNIQUE_DEFAULT_COUNT_MODE: KeepUniqueRuleCountMode = {
  perRule: false,
  perSet: true,
  perFaction: true,
  perMainStat: true,
  perSlot: false,
}

const coerceBoolean = (value: unknown): boolean => value === true

export const KeepUniqueRuleActivation = {
  Off: 'off',
  ProtectExisting: 'protectExisting',
  AnticipateGaps: 'anticipateGaps',
} as const

// eslint-disable-next-line no-redeclare -- allow constant/type pair
export type KeepUniqueRuleActivation =
  (typeof KeepUniqueRuleActivation)[keyof typeof KeepUniqueRuleActivation]

const KEEP_UNIQUE_RULE_ACTIVATION_VALUES = new Set<KeepUniqueRuleActivation>([
  KeepUniqueRuleActivation.Off,
  KeepUniqueRuleActivation.ProtectExisting,
  KeepUniqueRuleActivation.AnticipateGaps,
])

// KeepUniqueSubstatMode describes whether substat scoring is applied.
// The UI always enables ranking when any substats are selected.
export const KeepUniqueSubstatMode = {
  Unranked: 'unranked',
  Ranked: 'ranked',
} as const

// eslint-disable-next-line no-redeclare -- allow constant/type pair
export type KeepUniqueSubstatMode =
  (typeof KeepUniqueSubstatMode)[keyof typeof KeepUniqueSubstatMode]

// KeepUniqueSubstatRequirement controls how multiple picked substats are matched.
export const KeepUniqueSubstatRequirement = {
  Any: 'any',
  All: 'all',
  PerSubstat: 'perSubstat',
} as const

// eslint-disable-next-line no-redeclare -- allow constant/type pair
export type KeepUniqueSubstatRequirement =
  (typeof KeepUniqueSubstatRequirement)[keyof typeof KeepUniqueSubstatRequirement]

// Normalize to lower-case keys so case-insensitive parsing is stable.
const KEEP_UNIQUE_SUBSTAT_REQUIREMENT_LOOKUP: Record<string, KeepUniqueSubstatRequirement> = {
  // Canonical lower-case entries map straight through.
  [KeepUniqueSubstatRequirement.Any]: KeepUniqueSubstatRequirement.Any,
  [KeepUniqueSubstatRequirement.All]: KeepUniqueSubstatRequirement.All,
  // `perSubstat` lowercases to `persubstat`, so capture the normalized form.
  [KeepUniqueSubstatRequirement.PerSubstat.toLowerCase()]: KeepUniqueSubstatRequirement.PerSubstat,
}

// normalizeKeepUniqueActivation keeps activation parsing consistent across keep-override rules.
export const normalizeKeepUniqueActivation = (
  value: unknown,
  legacyEnabled?: unknown,
): KeepUniqueRuleActivation => {
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase()
    if (lowered.length > 0) {
      if (lowered === KeepUniqueRuleActivation.Off || lowered === 'disabled') {
        return KeepUniqueRuleActivation.Off
      }
      if (
        lowered === KeepUniqueRuleActivation.AnticipateGaps
        || lowered === 'anticipate'
        || lowered === 'anticipategaps'
        || lowered === 'placeholder'
      ) {
        return KeepUniqueRuleActivation.AnticipateGaps
      }
      if (KEEP_UNIQUE_RULE_ACTIVATION_VALUES.has(lowered as KeepUniqueRuleActivation)) {
        return lowered as KeepUniqueRuleActivation
      }
    }
  }
  if (legacyEnabled === false) return KeepUniqueRuleActivation.Off
  if (legacyEnabled === true) return KeepUniqueRuleActivation.ProtectExisting
  return KeepUniqueRuleActivation.ProtectExisting
}

// normalizeKeepUniqueSubstatRequirement keeps matching requirements stable and case-insensitive.
export const normalizeKeepUniqueSubstatRequirement = (value: unknown): KeepUniqueSubstatRequirement => {
  if (typeof value === 'string') {
    // Lowercase the input so callers can pass legacy or mixed-case strings.
    const trimmed = value.trim().toLowerCase()
    // Map normalized keys back to the canonical requirement values.
    const normalized = KEEP_UNIQUE_SUBSTAT_REQUIREMENT_LOOKUP[trimmed]
    if (normalized) return normalized
  }
  // Default keeps existing behavior when no requirement is provided.
  return KeepUniqueSubstatRequirement.Any
}

export const isKeepUniqueRuleActive = (rule: KeepUniqueRule): boolean => (
  rule.activation !== KeepUniqueRuleActivation.Off
)

const sanitizeCountMode = (raw: Partial<KeepUniqueRuleCountMode> | null | undefined): KeepUniqueRuleCountMode => {
  const perRule = coerceBoolean(raw?.perRule)
  const perSet = coerceBoolean(raw?.perSet)
  const perFaction = coerceBoolean(raw?.perFaction)
  const perMainStat = coerceBoolean(raw?.perMainStat)
  const perSlot = coerceBoolean(raw?.perSlot)
  if (perRule) {
    return {
      perRule: true,
      perSet: false,
      perFaction: false,
      perMainStat: false,
      perSlot: false,
    }
  }
  const hasGrouping = perSet || perFaction || perMainStat || perSlot
  if (!hasGrouping) {
    return {
      perRule: true,
      perSet: false,
      perFaction: false,
      perMainStat: false,
      perSlot: false,
    }
  }
  return {
    perRule: false,
    perSet,
    perFaction,
    perMainStat,
    perSlot,
  }
}

// normalizeKeepUniqueCountMode parses legacy payloads into the canonical scope-chip shape.
export const normalizeKeepUniqueCountMode = (value: unknown): KeepUniqueRuleCountMode => {
  if (!value) return { ...KEEP_UNIQUE_DEFAULT_COUNT_MODE }
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
    // Legacy per-combination strings default to the full grouping set (slot+set+faction+main stat).
    return { ...KEEP_UNIQUE_DEFAULT_COUNT_MODE }
  }
  if (typeof value === 'object') {
    const rec = value as Partial<KeepUniqueRuleCountMode>
    return sanitizeCountMode(rec)
  }
  return { ...KEEP_UNIQUE_DEFAULT_COUNT_MODE }
}

export const isPerRuleCountMode = (mode: KeepUniqueRuleCountMode): boolean => mode.perRule
export const sanitizeKeepUniqueCountMode = (mode: KeepUniqueRuleCountMode): KeepUniqueRuleCountMode => sanitizeCountMode(mode)

export const cloneKeepUniqueCombination = (combination: KeepUniqueCombination): KeepUniqueCombination => ({
  slots: [...combination.slots],
  // Clone entries so excluded flags survive but references do not.
  sets: combination.sets.map((entry) => (entry.excluded ? { id: entry.id, excluded: true } : { id: entry.id })),
  metaSetIds: [...(combination.metaSetIds ?? [])],
  ranks: [...combination.ranks],
  rarities: [...combination.rarities],
  mainStats: [...(combination.mainStats ?? [])],
  factions: [...(combination.factions ?? [])],
})

// createEmptyKeepUniqueCombination returns an "any" combination for new rule drafts.
export const createEmptyKeepUniqueCombination = (): KeepUniqueCombination => ({
  slots: [],
  sets: [],
  metaSetIds: [],
  ranks: [],
  rarities: [],
  mainStats: [],
  factions: [],
})

// cloneKeepUniqueRule keeps history snapshots isolated from live edits.
export const cloneKeepUniqueRule = (rule: KeepUniqueRule): KeepUniqueRule => ({
  // Preserve stable identifiers and scalar fields.
  ...rule,
  // Clone the combination payload so arrays are detached.
  combination: cloneKeepUniqueCombination(rule.combination),
  // Clone the count mode flags to avoid shared references.
  countMode: { ...rule.countMode },
  // Clone substat selections so edits don't mutate the snapshot.
  substats: [...(rule.substats ?? [])],
  // Keep the substat requirement scalar aligned with the stored rule.
  substatRequirement: rule.substatRequirement,
  // Copy weights so ranking edits are isolated.
  substatWeights: { ...(rule.substatWeights ?? {}) },
})

// cloneKeepUniqueRules clones a list into detached rule objects.
export const cloneKeepUniqueRules = (rules: readonly KeepUniqueRule[]): KeepUniqueRule[] => (
  // Reuse the per-rule clone so behavior stays consistent.
  rules.map((rule) => cloneKeepUniqueRule(rule))
)

export type KeepUniqueRule = {
  id: string
  name: string
  combination: KeepUniqueCombination
  requiredCount: number
  activation: KeepUniqueRuleActivation
  countMode: KeepUniqueRuleCountMode
  // Optional substat filters (empty array = any substat).
  substats: StatVariant[]
  // Requirement for how multiple substats are matched.
  substatRequirement: KeepUniqueSubstatRequirement
  // Ranked mode orders by normalized substat scores; unranked counts all matches.
  substatMode: KeepUniqueSubstatMode
  // Per-substat weights for ranked scoring (only non-default values are stored).
  substatWeights: Partial<Record<StatVariant, number>>
}

/** Build the default Keep Unique rule list for new sessions (empty by design). */
export function buildDefaultKeepUniqueRules(): KeepUniqueRule[] {
  // Keep the list empty so users opt into Keep Unique combinations explicitly.
  return []
}

export type KeepUniqueDetectionArtifact = {
  itemKey: number
  slot: ArtifactTypeId
  set: ArtifactSetId
  rank: RankValue
  rarity: RankValue
  level: LevelMilestone
  exactLevel: number | null
  faction: FactionId
  mainStat: StatVariant
  substats: KeepUniqueDetectionSubstat[]
}

export type KeepUniqueDetectionSubstat = {
  variant: StatVariant
  isFlat: boolean
  value: number
}

export type KeepUniqueDetectionEntry = {
  hash: string
  combination: KeepUniqueCombination
  ruleId: string | null
  ruleActivation: KeepUniqueRuleActivation
  // Carry the scope metadata so the UI can explain how totals were derived.
  countMode: KeepUniqueRuleCountMode
  perGroupRequiredCount: number
  groupsTracked: number
  requiredCount: number
  currentCount: number
  projectedCount: number
  deficit: number
  coveredByExisting: boolean
  itemKeys: number[]
  artifacts: KeepUniqueDetectionArtifact[]
  placeholders: KeepUniquePlaceholderRequest[]
}

export type KeepUniqueDetectionSnapshot = {
  scannedAt: number
  entries: KeepUniqueDetectionEntry[]
}

export type KeepUniquePlaceholderRequest = {
  combination: KeepUniqueCombination
  missing: number
  reason: 'global' | 'group'
  // Optional substat filter for per-substat gaps (keeps placeholder rules scoped).
  substatVariants?: StatVariant[]
}

export type KeepUniqueCandidate = {
  row: TesterPreviewRow
  artifact: NormalizedGearArtifact
  itemKey: number
  groupKey: KeepUniqueGroupKey
  isSold: boolean
}

export type KeepUniqueCandidateSnapshot = {
  candidates: KeepUniqueCandidate[]
  uniqueItemKeys: ReadonlySet<number>
}

export type KeepUniquesMergeInput = {
  enabled: boolean
  rules: readonly KeepUniqueRule[]
  detection?: KeepUniqueDetectionSnapshot | null
}

/**
 * True when the master toggle is on and at least one rule is enabled.
 * Used by pipeline callers to avoid unnecessary detection passes.
 */
export const hasActiveKeepUniqueRules = (input: KeepUniquesMergeInput | null | undefined): boolean => {
  if (!input || input.enabled !== true) return false
  if (!Array.isArray(input.rules) || input.rules.length === 0) return false
  return input.rules.some((rule) => rule && isKeepUniqueRuleActive(rule))
}

export type KeepUniqueDetectionParams = {
  candidates: readonly KeepUniqueCandidate[]
  rules: readonly KeepUniqueRule[]
  enabled: boolean
  now?: number
}

/** Generate a short, unique id for combination rules. */
export function createKeepUniqueRuleId(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `ku_${Date.now().toString(36)}_${rand}`
}

/** Canonical hash for combination comparisons and metadata lookups. */
const canonicalizeList = (values: readonly number[]): string => {
  if (!values.length) return '*'
  const numeric = values.map((v) => Number(v)).filter((v) => Number.isFinite(v))
  if (numeric.length === 0) return '*'
  numeric.sort((a, b) => a - b)
  return numeric.join(',')
}

const canonicalizeSetEntries = (values: readonly ArtifactSetSelectionEntry[]): string => {
  if (!values.length) return '*'
  // Normalize first so exclusion precedence and ordering are stable.
  const normalized = normalizeArtifactSetSelections(values)
  if (!normalized.length) return '*'
  const tokens = normalized.map((entry) => (
    entry.excluded ? `!${Number(entry.id)}` : `${Number(entry.id)}`
  ))
  return tokens.join(',')
}

const canonicalizeStringList = (values: readonly string[]): string => {
  if (!values.length) return '*'
  const cleaned = values
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0)
  if (!cleaned.length) return '*'
  cleaned.sort()
  return cleaned.join(',')
}

export function hashKeepUniqueCombination(combination: KeepUniqueCombination): string {
  return [
    canonicalizeList(combination.slots),
    canonicalizeSetEntries(combination.sets),
    canonicalizeStringList(combination.metaSetIds),
    canonicalizeList(combination.ranks),
    canonicalizeList(combination.rarities),
    canonicalizeList(combination.mainStats),
    canonicalizeList(combination.factions),
  ].join('|')
}

/** Clamp ranks/rarities to the valid 1..6 range. */
// Name lookups keep HSFC tuple fields readable while still resolving back to enum IDs on load.
const artifactTypeIdByName = new Map<string, ArtifactTypeId>(
  Object.entries(artifactTypeNames).map(([id, label]) => [label.trim().toLowerCase(), Number(id) as ArtifactTypeId]),
)

const artifactSetIdByName = new Map<string, ArtifactSetId>(
  Object.entries(artifactSetNames).map(([id, label]) => [label.trim().toLowerCase(), Number(id) as ArtifactSetId]),
)

const factionIdByName = new Map<string, FactionId>(
  Object.entries(factionNames)
    .filter(([, name]) => Boolean(name && name.trim()))
    .map(([id, name]) => [name.trim().toLowerCase(), Number(id) as FactionId]),
)

// Rarity is captured as labels in HSFC; keep a reverse map so loader can stay locale-agnostic.
const rarityCodeByName = new Map<string, RankValue>(
  Object.entries(rarityNames)
    .filter(([, name]) => Boolean(name && name.trim()))
    .map(([id, name]) => [name.trim().toLowerCase(), Math.max(RANK_MIN, Math.min(RANK_MAX, Number(id))) as RankValue]),
)

/** Clamp ranks/rarities to the valid 1..6 range, accepting either numbers or labels. */
const clampRankOrRarity = (value: unknown): RankValue => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return RANK_MAX
    const namedRarity = rarityCodeByName.get(trimmed.toLowerCase())
    if (namedRarity != null) return namedRarity
    const numericInLabel = Number(trimmed.replace(/[^0-9]/g, ''))
    if (Number.isFinite(numericInLabel) && numericInLabel > 0) {
      const clamped = Math.max(RANK_MIN, Math.min(RANK_MAX, Math.floor(numericInLabel)))
      return clamped as RankValue
    }
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return RANK_MAX
  const rounded = Math.floor(numeric)
  const clamped = Math.max(RANK_MIN, Math.min(RANK_MAX, rounded))
  return clamped as RankValue
}

/** Resolve the stat variant from user input (label or numeric); falls back to Any. */
export const coerceStatVariant = (value: unknown): StatVariant => {
  if (typeof value === 'string') {
    // Stat labels should be readable in HSFC; keep the parser tolerant of labels first.
    const parsed = variantFromLabel(value.trim())
    if (parsed !== null) return parsed
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return StatVariantEnum.Any
  return numeric as StatVariant
}

// Keep the priority ordering consistent with stat button layouts across the app.
const SUBSTAT_ORDER = new Map<StatVariant, number>(
  STAT_VARIANTS_PRIORITY.map((variant, index) => [variant, index]),
)

const sortSubstatsByPriority = (values: readonly StatVariant[]): StatVariant[] => {
  return values.slice().sort((left, right) => {
    const leftOrder = SUBSTAT_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = SUBSTAT_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return Number(left) - Number(right)
  })
}

// normalizeKeepUniqueSubstats parses a list of substat labels/ids into ordered variants.
const normalizeKeepUniqueSubstats = (value: unknown): StatVariant[] => {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  const seen = new Set<number>()
  const result: StatVariant[] = []
  for (const raw of list) {
    if (Array.isArray(raw)) {
      for (const nested of normalizeKeepUniqueSubstats(raw)) {
        if (seen.has(Number(nested))) continue
        seen.add(Number(nested))
        result.push(nested)
      }
      continue
    }
    const variant = coerceStatVariant(raw)
    // Skip invalid or synthetic variants so keep-unique stays focused on real substats.
    if (variant === StatVariantEnum.Any || variant === StatVariantEnum.RollCount) continue
    if (seen.has(Number(variant))) continue
    seen.add(Number(variant))
    result.push(variant)
  }
  return sortSubstatsByPriority(result)
}

// normalizeKeepUniqueSubstatWeights clamps per-stat weights to the tester sort defaults.
const normalizeKeepUniqueSubstatWeights = (value: unknown): Partial<Record<StatVariant, number>> => {
  if (!value || typeof value !== 'object') return {}
  const rec = value as Record<string, unknown>
  const weights: Partial<Record<StatVariant, number>> = {}
  for (const [key, raw] of Object.entries(rec)) {
    const variant = coerceStatVariant(key)
    // Ignore invalid entries so readers cannot poison the score map.
    if (variant === StatVariantEnum.Any || variant === StatVariantEnum.RollCount) continue
    const normalized = normalizeTesterSortWeight(Number(raw))
    // Omit neutral weights so serialization stays compact.
    if (normalized === TESTER_SORT_WEIGHT_DEFAULT) continue
    weights[variant] = normalized
  }
  return weights
}

const normalizeSelectionArray = <T extends number>(
  value: unknown,
  coerce: (raw: unknown) => T | null,
): T[] => {
  if (value == null) return []
  const list = Array.isArray(value) ? value : [value]
  const seen = new Set<string>()
  const result: T[] = []
  for (const raw of list) {
    if (Array.isArray(raw)) {
      for (const nested of normalizeSelectionArray(raw, coerce)) {
        const key = String(nested)
        if (seen.has(key)) continue
        seen.add(key)
        result.push(nested)
      }
      continue
    }
    const normalized = coerce(raw)
    if (normalized == null) continue
    const key = String(normalized)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

const coerceArtifactTypeId = (value: unknown): ArtifactTypeId | null => {
  if (typeof value === 'string') {
    // Handle readable slot labels in HSFC first, then allow numeric ids for resilience.
    const found = artifactTypeIdByName.get(value.trim().toLowerCase())
    if (found != null) return found
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.floor(numeric) as ArtifactTypeId
}

const coerceArtifactSetId = (value: unknown): ArtifactSetId | null => {
  if (typeof value === 'string') {
    // Accept readable set names so exported HSFC stays human-friendly.
    const trimmed = value.trim().toLowerCase()
    const found = artifactSetIdByName.get(trimmed)
    if (found != null) return found
    const runtime = findArtifactSetIdByName(value.trim())
    if (runtime !== null) return runtime
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.floor(numeric) as ArtifactSetId
}

const coerceFactionId = (value: unknown): FactionId | null => {
  if (typeof value === 'string') {
    // Faction names only apply to accessories; still resolve strings to keep tuples readable.
    const found = factionIdByName.get(value.trim().toLowerCase())
    if (found != null) return found
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.floor(numeric) as FactionId
}

const normalizeStringSelectionArray = (value: unknown): string[] => {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of list) {
    if (Array.isArray(raw)) {
      for (const nested of normalizeStringSelectionArray(raw)) {
        if (seen.has(nested)) continue
        seen.add(nested)
        result.push(nested)
      }
      continue
    }
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (!trimmed) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

const normalizeKeepUniqueSetSelections = (value: unknown): ArtifactSetSelectionEntry[] => {
  // Accept either a list or a single value (legacy tuple formats).
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  // Collect entries before normalization to preserve exclusion precedence.
  const entries: ArtifactSetSelectionEntry[] = []
  for (const raw of list) {
    if (Array.isArray(raw)) {
      // Flatten nested arrays so legacy tuple shapes still parse.
      entries.push(...normalizeKeepUniqueSetSelections(raw))
      continue
    }
    if (raw && typeof raw === 'object') {
      const rec = raw as Record<string, unknown>
      const candidate = rec.id ?? rec.setId ?? rec.name ?? rec.label
      const resolved = coerceArtifactSetId(candidate)
      if (resolved == null) continue
      // Respect excluded flags for meta-derived set removals.
      const excluded = rec.excluded === true
      entries.push(excluded ? { id: resolved, excluded: true } : { id: resolved })
      continue
    }
    const resolved = coerceArtifactSetId(raw)
    if (resolved != null) entries.push({ id: resolved })
  }
  // Normalize to dedupe and enforce exclusion precedence.
  return normalizeArtifactSetSelections(entries)
}

/** Normalize combination payloads loaded from HSFC/autosave. */
export function normalizeKeepUniqueCombination(value: unknown): KeepUniqueCombination | null {
  if (!value || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
  const slotValues = normalizeSelectionArray(rec.slots, coerceArtifactTypeId)
  const setValues = normalizeKeepUniqueSetSelections(rec.sets)
  const rankValues = normalizeSelectionArray(rec.ranks, (raw) => {
    if (raw == null || raw === '') return null
    return clampRankOrRarity(raw)
  })
  const rarityValues = normalizeSelectionArray(rec.rarities, (raw) => {
    if (raw == null || raw === '') return null
    return clampRankOrRarity(raw)
  })
  const mainStats = normalizeSelectionArray(rec.mainStats, (raw) => {
    if (raw == null || raw === '') return null
    const variant = coerceStatVariant(raw)
    if (variant === StatVariantEnum.Any) return null
    return variant
  })
  if (mainStats.length > 1) mainStats.sort((a, b) => a - b)
  const factionValues = normalizeSelectionArray(rec.factions, (raw) => {
    if (raw == null || raw === '') return null
    return coerceFactionId(raw)
  })
  const metaSetIds = normalizeStringSelectionArray(rec.metaSetIds ?? rec.metaSets)
  return {
    slots: slotValues,
    sets: setValues,
    metaSetIds,
    ranks: rankValues,
    rarities: rarityValues,
    mainStats,
    factions: factionValues,
  }
}

/** Normalize rule payloads; returns null when combination data is invalid. */
export function normalizeKeepUniqueRule(value: unknown): KeepUniqueRule | null {
  if (!value || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
  const combination = normalizeKeepUniqueCombination(rec.combination ?? rec.tuple ?? rec)
  if (!combination) return null
  const name = (() => {
    if (typeof rec.name !== 'string') return ''
    const trimmed = rec.name.trim()
    if (!trimmed) return ''
    return trimmed
  })()
  const rawId = typeof rec.id === 'string' && rec.id.trim().length > 0 ? rec.id.trim() : createKeepUniqueRuleId()
  const rawRequired = Number(rec.requiredCount)
  const requiredCount = Number.isFinite(rawRequired) && rawRequired >= 1 ? Math.floor(rawRequired) : 1
  const activation = normalizeKeepUniqueActivation(rec.activation, rec.enabled)
  const countMode = (() => {
    if ('countMode' in rec) return normalizeKeepUniqueCountMode(rec.countMode)
    if (rec.requirePerCombination === true) return { ...KEEP_UNIQUE_DEFAULT_COUNT_MODE }
    return { ...KEEP_UNIQUE_DEFAULT_COUNT_MODE }
  })()
  // Substat selection is optional; empty means "any".
  const substats = normalizeKeepUniqueSubstats(rec.substats ?? rec.substatTargets ?? rec.substat)
  // Substat requirement defaults to "any" unless explicit data is provided.
  const parsedSubstatRequirement = normalizeKeepUniqueSubstatRequirement(
    ('substatRequirement' in rec ? rec.substatRequirement : undefined)
      ?? (rec as { substatMatch?: unknown }).substatMatch,
  )
  const substatRequirement = substats.length > 0 ? parsedSubstatRequirement : KeepUniqueSubstatRequirement.Any
  // Substat ranking is always enabled when any substats are selected.
  const substatMode = substats.length > 0 ? KeepUniqueSubstatMode.Ranked : KeepUniqueSubstatMode.Unranked
  // Weighting reuses tester sort normalization (non-defaults only).
  const substatWeights = normalizeKeepUniqueSubstatWeights(rec.substatWeights ?? rec.substatWeighting)
  return {
    id: rawId,
    combination,
    requiredCount,
    activation,
    countMode,
    name,
    substats,
    substatRequirement,
    substatMode,
    substatWeights,
  }
}

/** Shared helper for mapping tester artifacts to the detection item key. */
export function getKeepUniqueItemKey(artifact: NormalizedGearArtifact): number {
  const testerItemId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? NaN)
  if (Number.isFinite(testerItemId)) return testerItemId
  if (Number.isFinite(artifact.id)) return Number(artifact.id)
  return 0
}

export type KeepUniqueGroupKey = string

/** Hash representing the slot+set+main+faction group used for uniqueness filtering. */
export function getKeepUniqueGroupKey(artifact: NormalizedGearArtifact): KeepUniqueGroupKey {
  const slot = Number(artifact.slot)
  const set = Number(artifact.set)
  const mainStat = Number(artifact.mainStat?.variant ?? StatVariantEnum.Any)
  const faction = isAccessorySlot(slot) ? Number(artifact.faction ?? 0) : 0
  return [slot, set, mainStat, faction].join(':')
}

type KeepUniqueCountKey = string

export const getKeepUniqueCountKey = (artifact: NormalizedGearArtifact, mode: KeepUniqueRuleCountMode): KeepUniqueCountKey => {
  if (mode.perRule) return 'global'
  const parts: string[] = []
  if (mode.perSlot) {
    parts.push(`slot:${Number(artifact.slot)}`)
  }
  if (mode.perSet) {
    parts.push(`set:${Number(artifact.set)}`)
  }
  if (mode.perFaction) {
    const faction = isAccessorySlot(Number(artifact.slot)) ? Number(artifact.faction ?? 0) : 0
    parts.push(`faction:${faction}`)
  }
  if (mode.perMainStat) {
    const mainStat = Number(artifact.mainStat?.variant ?? StatVariantEnum.Any)
    parts.push(`main:${mainStat}`)
  }
  return parts.length > 0 ? parts.join('|') : 'global'
}

// buildKeepUniquePlaceholderSample builds a minimal artifact for placeholder keying.
const buildKeepUniquePlaceholderSample = (params: {
  slot: ArtifactTypeId
  setId: ArtifactSetId
  mainStat: StatVariant
  faction: FactionId
}): NormalizedGearArtifact => {
  const { slot, setId, mainStat, faction } = params
  // Provide a minimal main stat payload so variant reads stay consistent.
  const mainStatPayload: NormalizedGearArtifact['mainStat'] = mainStat === StatVariantEnum.Any
    ? null
    : {
      source: 'main' as const,
      statId: StatId.Any,
      isFlat: true,
      variant: mainStat,
      baseValue: 0,
      glyphValue: 0,
      mythValue: 0,
      totalValue: 0,
    }
  // Keep the tester item in sync with the placeholder so keying is stable.
  const testerItem: NormalizedGearArtifact['testerItem'] = {
    slot,
    set: setId,
    rank: RANK_MAX,
    rarity: RANK_MAX,
    level: 0 as LevelMilestone,
    ...(faction > 0 ? { faction } : {}),
    ...(mainStat !== StatVariantEnum.Any ? { main: mainStat } : {}),
  }
  // Fill the remaining fields with safe defaults; they are unused by keying.
  return {
    id: 0,
    slot,
    set: setId,
    rank: RANK_MAX,
    rarity: RANK_MAX,
    level: 0 as LevelMilestone,
    exactLevel: null,
    faction,
    mainStat: mainStatPayload,
    substats: [],
    ascension: null,
    testerItem,
    rerollCount: 0,
    equippedToChampionId: null,
    equippedChampionBaseId: null,
    equippedChampionRarity: null,
    source: 'tester',
    equippedChampionName: null,
    equippedChampionLocation: null,
    lastUseLocalTimestamp: null,
  }
}

// resolveArmorCompatibleSetIds keeps accessory-only sets out of armor pools.
const resolveArmorCompatibleSetIds = (): readonly ArtifactSetId[] => {
  // Merge fixed + variable armor sets while keeping numeric order stable.
  const combined = [
    ...getArmorFixedSetIds(),
    ...getArmorVariableSetIds(),
  ]
  // Deduplicate the merged pool without changing numeric ordering.
  const deduped = Array.from(new Set<number>(combined.map((value) => Number(value))))
    .sort(compareArtifactSets)
    .map((value) => value as ArtifactSetId)
  return deduped
}

// resolveKeepUniqueSlotCandidates limits slots to those that can actually match.
const resolveKeepUniqueSlotCandidates = (combination: KeepUniqueCombination): ArtifactTypeId[] => {
  // Start from the explicit selection or fall back to the preferred slot order.
  const baseSlots = combination.slots.length > 0
    ? combination.slots
    : PREFERRED_ARTIFACT_TYPE_ORDER
  // Capture explicit set includes so we can filter slot compatibility.
  const { included } = splitArtifactSetSelections(combination.sets)
  const hasSetIncludes = included.length > 0
  // When factions are specified, accessories are required to satisfy the filter.
  const factionSelection = combination.factions ?? []
  const requiresAccessory = factionSelection.length > 0
    && factionSelection.every((value) => Number(value) > 0)
  // Prepare quick-lookup sets for set compatibility checks.
  const accessorySetPool = new Set<number>([
    ACCESSORY_NO_SET_ID,
    ...getAccessorySlotsCompatibleSetIds().map((value) => Number(value)),
  ])
  const armorSetPool = new Set<number>(resolveArmorCompatibleSetIds().map((value) => Number(value)))
  // Filter slots down to those that can satisfy every enabled constraint.
  const result: ArtifactTypeId[] = []
  const seen = new Set<number>()
  for (const slotId of baseSlots) {
    const numeric = Number(slotId)
    if (!Number.isFinite(numeric)) continue
    if (seen.has(numeric)) continue
    seen.add(numeric)
    const accessorySlot = isAccessorySlot(numeric)
    // Skip non-accessories when factions explicitly require accessories.
    if (requiresAccessory && !accessorySlot) continue
    // Respect main-stat filters by keeping only compatible slots.
    if (combination.mainStats.length > 0) {
      const allowed = ALLOWED_MAIN_BY_SLOT[numeric as ArtifactType]
      if (!allowed) continue
      const matchesMain = combination.mainStats.some((variant) => allowed.has(Number(variant)))
      if (!matchesMain) continue
    }
    // Respect explicit set includes by skipping incompatible slot types.
    if (hasSetIncludes) {
      const pool = accessorySlot ? accessorySetPool : armorSetPool
      const hasCompatibleSet = included.some((value) => pool.has(Number(value)))
      if (!hasCompatibleSet) continue
    }
    result.push(numeric as ArtifactTypeId)
  }
  return result
}

// resolveKeepUniqueSlotSamples chooses representative slots for expected group enumeration.
const resolveKeepUniqueSlotSamples = (
  slots: readonly ArtifactTypeId[],
  countMode: KeepUniqueRuleCountMode,
): ArtifactTypeId[] => {
  // If we truly count per slot, return every candidate slot.
  if (countMode.perSlot) return slots.slice()
  // If faction is not part of the key, one slot is enough.
  if (!countMode.perFaction) return slots.slice(0, 1)
  // For faction-aware grouping, include one accessory + one armor sample when available.
  const accessory = slots.find((slotId) => isAccessorySlot(Number(slotId)))
  const armor = slots.find((slotId) => !isAccessorySlot(Number(slotId)))
  const samples: ArtifactTypeId[] = []
  if (accessory != null) samples.push(accessory)
  if (armor != null) samples.push(armor)
  return samples.length > 0 ? samples : slots.slice(0, 1)
}

// resolveKeepUniqueSetCandidatesForSlot enumerates allowed set IDs for a slot.
const resolveKeepUniqueSetCandidatesForSlot = (
  combination: KeepUniqueCombination,
  slot: ArtifactTypeId,
): ArtifactSetId[] => {
  const accessorySlot = isAccessorySlot(Number(slot))
  // Resolve the include/exclude sets so we can respect explicit choices.
  const { included, excluded } = splitArtifactSetSelections(combination.sets)
  const hasSetIncludes = included.length > 0
  // Build the allowed set pool for this slot type.
  const allowedPool = accessorySlot
    ? getAccessorySlotsCompatibleSetIds()
    : resolveArmorCompatibleSetIds()
  const allowedSetIds = new Set<number>(allowedPool.map((value) => Number(value)))
  // Accessories also accept the no-set sentinel when sets are not explicitly chosen.
  const includeNoSet = accessorySlot && !hasSetIncludes
  if (hasSetIncludes) {
    // Only keep includes that are valid for this slot.
    const filtered = included.filter((value) => (
      value === ACCESSORY_NO_SET_ID
        ? accessorySlot
        : allowedSetIds.has(Number(value))
    ))
    return filtered.sort(compareArtifactSets)
  }
  // Otherwise, start from the allowed pool and apply exclusions.
  const excludedIds = new Set<number>(excluded.map((value) => Number(value)))
  const filtered = allowedPool.filter((value) => !excludedIds.has(Number(value)))
  // Inject the no-set sentinel when accessories are allowed.
  const withNoSet = includeNoSet ? [ACCESSORY_NO_SET_ID, ...filtered] : filtered
  // Keep numeric ordering stable for deterministic placeholders.
  return withNoSet.slice().sort(compareArtifactSets)
}

// resolveKeepUniqueSetCandidatesForSlots unions set IDs across all slot candidates.
const resolveKeepUniqueSetCandidatesForSlots = (
  combination: KeepUniqueCombination,
  slots: readonly ArtifactTypeId[],
): ArtifactSetId[] => {
  const merged = new Map<number, ArtifactSetId>()
  for (const slot of slots) {
    for (const setId of resolveKeepUniqueSetCandidatesForSlot(combination, slot)) {
      const numeric = Number(setId)
      if (!Number.isFinite(numeric)) continue
      if (merged.has(numeric)) continue
      merged.set(numeric, setId)
    }
  }
  return Array.from(merged.values()).sort(compareArtifactSets)
}

// resolveKeepUniqueMainStatCandidatesForSlot returns valid main stats for the slot.
const resolveKeepUniqueMainStatCandidatesForSlot = (
  combination: KeepUniqueCombination,
  slot: ArtifactTypeId,
): StatVariant[] => {
  const allowed = ALLOWED_MAIN_BY_SLOT[Number(slot) as ArtifactType]
  if (!allowed || allowed.size === 0) return []
  // If the user picked main stats, keep only those compatible with the slot.
  if (combination.mainStats.length > 0) {
    const filtered = combination.mainStats.filter((variant) => allowed.has(Number(variant)))
    return filtered.slice().sort((a, b) => Number(a) - Number(b))
  }
  // Otherwise return the entire allowed set for enumeration.
  return Array.from(allowed).sort((a, b) => Number(a) - Number(b)) as StatVariant[]
}

// resolveKeepUniqueMainStatCandidatesForSlots unions main stats across slots.
const resolveKeepUniqueMainStatCandidatesForSlots = (
  combination: KeepUniqueCombination,
  slots: readonly ArtifactTypeId[],
): StatVariant[] => {
  const union = new Map<number, StatVariant>()
  for (const slot of slots) {
    for (const variant of resolveKeepUniqueMainStatCandidatesForSlot(combination, slot)) {
      const numeric = Number(variant)
      if (!Number.isFinite(numeric)) continue
      if (union.has(numeric)) continue
      union.set(numeric, variant)
    }
  }
  return Array.from(union.values()).sort((a, b) => Number(a) - Number(b))
}

// resolveKeepUniqueFactionCandidatesForSlot returns allowed factions for this slot.
const resolveKeepUniqueFactionCandidatesForSlot = (
  combination: KeepUniqueCombination,
  slot: ArtifactTypeId,
): FactionId[] => {
  const selection = (combination.factions ?? []).map((value) => Number(value)).filter((value) => Number.isFinite(value))
  const hasSelection = selection.length > 0
  const accessorySlot = isAccessorySlot(Number(slot))
  // Non-accessory slots can only use the 0 "any" faction sentinel.
  if (!accessorySlot) {
    if (!hasSelection) return [0 as FactionId]
    if (selection.some((value) => value === 0)) return [0 as FactionId]
    return []
  }
  // For accessories, use explicit selections when provided.
  if (hasSelection) {
    return selection.filter((value) => value > 0).map((value) => value as FactionId)
  }
  // Otherwise enumerate every faction.
  return ALL_FACTION_IDS.slice()
}

type KeepUniqueExpectedGroup = {
  key: KeepUniqueCountKey
  sample: NormalizedGearArtifact
}

// buildKeepUniqueExpectedGroups enumerates every group implied by the scope chips.
const buildKeepUniqueExpectedGroups = (params: {
  combination: KeepUniqueCombination
  countMode: KeepUniqueRuleCountMode
}): KeepUniqueExpectedGroup[] => {
  const { combination, countMode } = params
  // Per-rule counts do not split into scope groups.
  if (countMode.perRule) return []
  // Resolve which slots are actually compatible with the filters.
  const slotCandidates = resolveKeepUniqueSlotCandidates(combination)
  if (slotCandidates.length === 0) return []
  // Choose representative slot samples for key construction.
  const slotSamples = resolveKeepUniqueSlotSamples(slotCandidates, countMode)
  // Precompute union pools when the scope is not per-slot.
  const unionSets = countMode.perSet && !countMode.perSlot
    ? resolveKeepUniqueSetCandidatesForSlots(combination, slotCandidates)
    : []
  const unionMainStats = countMode.perMainStat && !countMode.perSlot
    ? resolveKeepUniqueMainStatCandidatesForSlots(combination, slotCandidates)
    : []
  // Track expected groups by their count key to avoid duplicates.
  const expected = new Map<KeepUniqueCountKey, NormalizedGearArtifact>()
  for (const slot of slotSamples) {
    // Resolve per-slot pools when the scope is split by slot.
    const setCandidates = countMode.perSet
      ? (countMode.perSlot ? resolveKeepUniqueSetCandidatesForSlot(combination, slot) : unionSets)
      : [ACCESSORY_NO_SET_ID as ArtifactSetId]
    if (countMode.perSet && setCandidates.length === 0) continue
    // Resolve faction pools, skipping slots that cannot satisfy selections.
    const factionCandidates = countMode.perFaction
      ? resolveKeepUniqueFactionCandidatesForSlot(combination, slot)
      : [0 as FactionId]
    if (countMode.perFaction && factionCandidates.length === 0) continue
    // Resolve main stat pools, skipping slots that cannot satisfy selections.
    const mainStatCandidates = countMode.perMainStat
      ? (countMode.perSlot ? resolveKeepUniqueMainStatCandidatesForSlot(combination, slot) : unionMainStats)
      : [StatVariantEnum.Any]
    if (countMode.perMainStat && mainStatCandidates.length === 0) continue
    // Build the Cartesian product across the active scope dimensions.
    for (const setId of setCandidates) {
      for (const faction of factionCandidates) {
        for (const mainStat of mainStatCandidates) {
          const sample = buildKeepUniquePlaceholderSample({
            slot,
            setId,
            mainStat,
            faction,
          })
          const key = getKeepUniqueCountKey(sample, countMode)
          if (expected.has(key)) continue
          expected.set(key, sample)
        }
      }
    }
  }
  return Array.from(expected.entries()).map(([key, sample]) => ({ key, sample }))
}

const matchesSelection = (selection: readonly number[], candidate: number): boolean => {
  if (!selection.length) return true
  return selection.some((value) => Number(value) === Number(candidate))
}

// Placeholder combos inherit the base filters but narrow whichever dimensions affect the group key.
export const buildPlaceholderCombinationForGroup = (params: {
  base: KeepUniqueCombination
  mode: KeepUniqueRuleCountMode
  sample: NormalizedGearArtifact | null
}): KeepUniqueCombination => {
  const { base, mode, sample } = params
  if (!sample) return cloneKeepUniqueCombination(base)
  const clone = cloneKeepUniqueCombination(base)
  if (mode.perSlot) clone.slots = [Number(sample.slot) as ArtifactTypeId]
  if (mode.perSet) clone.sets = [{ id: Number(sample.set) as ArtifactSetId }]
  if (mode.perMainStat) {
    const variant = sample.mainStat?.variant
    clone.mainStats = variant == null || variant === StatVariantEnum.Any
      ? []
      : [variant]
  }
  if (mode.perFaction) {
    const faction = isAccessorySlot(Number(sample.slot)) ? Number(sample.faction ?? 0) : 0
    clone.factions = faction > 0 ? [faction as FactionId] : []
  }
  return clone
}

/** Determine whether an artifact satisfies a Keep Unique combination filter. */
export function artifactMatchesKeepUniqueRule(artifact: NormalizedGearArtifact, combination: KeepUniqueCombination): boolean {
  const slot = Number(artifact.slot)
  if (!matchesSelection(combination.slots, slot)) return false

  const setId = Number(artifact.set)
  // Split includes/excludes so exclusions can short-circuit.
  const setSelection = splitArtifactSetSelections(combination.sets)
  // Explicit excludes always block a set match.
  if (setSelection.excluded.some((id) => Number(id) === setId)) return false
  // Explicit includes restrict the set pool when present.
  if (setSelection.included.length > 0 && !setSelection.included.some((id) => Number(id) === setId)) return false

  const rankValue = Number(artifact.rank)
  if (!matchesSelection(combination.ranks, rankValue)) return false

  const rarityValue = Number(artifact.rarity)
  if (!matchesSelection(combination.rarities, rarityValue)) return false

  if (combination.mainStats.length > 0) {
    const artifactMain = artifact.mainStat?.variant
    if (artifactMain == null) return false
    if (!combination.mainStats.some((variant) => variant === artifactMain)) return false
  }

  const faction = isAccessorySlot(slot) ? Number(artifact.faction ?? 0) : 0
  if (!matchesSelection(combination.factions, faction)) return false

  return true
}

// countCandidateSelectedSubstats counts how many selected substats appear on an artifact.
const countCandidateSelectedSubstats = (
  candidate: KeepUniqueCandidate,
  selectedSubstats: ReadonlySet<number> | null,
): number => {
  if (!selectedSubstats || selectedSubstats.size === 0) return 0
  let matched = 0
  const seen = new Set<number>()
  for (const stat of candidate.artifact.substats) {
    const variant = Number(stat.variant)
    if (!selectedSubstats.has(variant)) continue
    if (seen.has(variant)) continue
    const raw = Number(stat.totalValue ?? 0)
    if (!Number.isFinite(raw) || raw <= 0) continue
    seen.add(variant)
    matched += 1
    if (matched >= selectedSubstats.size) return matched
  }
  return matched
}

// candidateMatchesSubstatRequirement enforces Any/All matching against the selection.
const candidateMatchesSubstatRequirement = (
  candidate: KeepUniqueCandidate,
  selectedSubstats: ReadonlySet<number> | null,
  requirement: KeepUniqueSubstatRequirement,
): boolean => {
  if (!selectedSubstats || selectedSubstats.size === 0) return true
  const matched = countCandidateSelectedSubstats(candidate, selectedSubstats)
  if (requirement === KeepUniqueSubstatRequirement.All) {
    return matched >= selectedSubstats.size
  }
  return matched > 0
}

type KeepUniqueScoredCandidate = {
  candidate: KeepUniqueCandidate
  score: number
}

// Sort higher scores first; tie-break by item key for deterministic ordering.
const sortKeepUniqueScoredCandidates = (entries: KeepUniqueScoredCandidate[]): KeepUniqueScoredCandidate[] => (
  entries.slice().sort((left, right) => {
    const delta = right.score - left.score
    if (delta !== 0) return delta
    return left.candidate.itemKey - right.candidate.itemKey
  })
)

// Deterministic ordering for unranked keep-unique selection (no score signal).
const sortKeepUniqueCandidatesByItemKey = (entries: KeepUniqueCandidate[]): KeepUniqueCandidate[] => (
  entries.slice().sort((left, right) => {
    // Prefer the stable item key when available.
    const delta = left.itemKey - right.itemKey
    if (delta !== 0) return delta
    // Fall back to artifact ids so duplicate keys still sort predictably.
    const leftId = Number(left.artifact.id ?? 0)
    const rightId = Number(right.artifact.id ?? 0)
    if (leftId !== rightId) return leftId - rightId
    // Final fallback: compare group keys to keep ordering stable.
    if (left.groupKey !== right.groupKey) return left.groupKey < right.groupKey ? -1 : 1
    return 0
  })
)

const toDetectionSubstats = (artifact: NormalizedGearArtifact): KeepUniqueDetectionSubstat[] => (
  artifact.substats.map((stat) => ({
    variant: stat.variant,
    isFlat: stat.isFlat,
    // Keep-unique rules must mirror the tester’s subValues payload, which omits glyph bonuses.
    // Using `totalValue` keeps the injected rule self-matching so glyph-heavy items are not skipped.
    value: Number((stat.totalValue ?? 0).toFixed(3)),
  }))
)

export const buildKeepUniqueDetectionArtifact = (candidate: KeepUniqueCandidate): KeepUniqueDetectionArtifact => {
  const { artifact, itemKey } = candidate
  return {
    itemKey,
    slot: artifact.slot,
    set: artifact.set,
    rank: artifact.rank,
    rarity: artifact.rarity,
    level: artifact.level,
    exactLevel: artifact.exactLevel ?? null,
    faction: isAccessorySlot(artifact.slot) ? artifact.faction : (0 as FactionId),
    mainStat: artifact.mainStat?.variant ?? StatVariantEnum.Any,
    substats: toDetectionSubstats(artifact),
  }
}

export function collectKeepUniqueCandidates(params: {
  rows: readonly TesterPreviewRow[]
  baseRules: readonly HsfRuleWithCfg[]
  configModes: SellfileExportMode[]
  ignoreKeepUniqueConfigIndices?: ReadonlySet<number>
}): KeepUniqueCandidateSnapshot {
  const { rows, baseRules, configModes } = params
  // Allow keep-unique detection to skip configs that only protect rework fodder.
  const ignoreConfigSet = params.ignoreKeepUniqueConfigIndices && params.ignoreKeepUniqueConfigIndices.size > 0
    ? params.ignoreKeepUniqueConfigIndices
    : null
  // Precompute the guard so the loop stays lean.
  const hasIgnoredConfigs = ignoreConfigSet !== null
  if (!rows.length) return { candidates: [], uniqueItemKeys: new Set() }
  const baseRuleList: HsfRuleWithCfg[] = Array.isArray(baseRules) ? [...baseRules] : []
  const baseRuleCount = baseRuleList.length
  const candidates: KeepUniqueCandidate[] = []
  const uniqueItemKeys = new Set<number>()

  const resolveKeepDecision = (row: TesterPreviewRow, artifact: NormalizedGearArtifact): boolean => {
    // Prefer the cached base match when it is available and not ignored.
    if (row.baseMatch !== undefined) {
      // Capture the cached base match from the preview row.
      const baseMatch = row.baseMatch
      // Only re-evaluate when the base match came from an ignored config.
      const baseCfgIdx = baseMatch?.cfgIdx ?? null
      const baseCfgIgnored = hasIgnoredConfigs && baseCfgIdx != null && ignoreConfigSet?.has(baseCfgIdx)
      if (!baseCfgIgnored) {
        return baseMatch?.keep === true
      }
    }
    // No rules means everything is sold by default.
    if (baseRuleCount === 0) return false
    // Re-evaluate with ignored configs removed so ordering stays accurate.
    // Build the options object without undefined fields (exact optional typing).
    const evalOptions = ignoreConfigSet
      ? { configModes, excludeConfigIndices: ignoreConfigSet }
      : { configModes }
    // Run evaluation with the filtered options.
    const { firstMatch } = evaluateMatchesByConfig(
      baseRuleList,
      artifact.testerItem,
      evalOptions,
    )
    // Report keep status from the filtered evaluation.
    return firstMatch?.keep === true
  }

  for (const row of rows) {
    const artifact = row.artifact
    const itemKey = getKeepUniqueItemKey(artifact)
    const groupKey = getKeepUniqueGroupKey(artifact)
    // Keep-unique only counts items as kept when non-ignored configs protect them.
    const isKept = resolveKeepDecision(row, artifact)
    // Track the sold outcome so the unique groups reflect ignored keep tags.
    const isSold = !isKept
    const candidate: KeepUniqueCandidate = { row, artifact, itemKey, groupKey, isSold }
    candidates.push(candidate)
    if (isSold) uniqueItemKeys.add(itemKey)
  }

  return { candidates, uniqueItemKeys }
}

/** Compute Keep Unique combination coverage against the candidate sold rows. */
export function computeKeepUniqueProtection(params: KeepUniqueDetectionParams): KeepUniqueDetectionSnapshot {
  const { candidates, rules, enabled, now } = params
  const entries: KeepUniqueDetectionEntry[] = []
  const timestamp = Number.isFinite(now) ? Number(now) : Date.now()

  for (const rule of rules) {
    const combination = rule.combination
    const countMode = sanitizeCountMode(rule.countMode)
    const perRuleMode = countMode.perRule
    const activation = rule.activation ?? KeepUniqueRuleActivation.ProtectExisting
    const ruleActive = enabled && activation !== KeepUniqueRuleActivation.Off
    // Substat filters apply before counting so unranked + ranked behave consistently.
    const selectedSubstats = rule.substats ?? []
    const hasSubstatFilter = selectedSubstats.length > 0
    const normalizedSubstatRequirement = normalizeKeepUniqueSubstatRequirement(rule.substatRequirement)
    const substatRequirement = hasSubstatFilter ? normalizedSubstatRequirement : KeepUniqueSubstatRequirement.Any
    // Per-substat mode ignores weights (each stat is scored independently).
    const allowWeightsForRule = substatRequirement !== KeepUniqueSubstatRequirement.PerSubstat
    const requiredPerGroup = Math.max(1, Math.floor(rule.requiredCount))

    const buildEntryForSubstats = (
      substatVariants: readonly StatVariant[],
      requirement: KeepUniqueSubstatRequirement,
    ): KeepUniqueDetectionEntry => {
      // Only enforce substat filters when any are selected.
      const hasSubstatFilter = substatVariants.length > 0
      const selectedSet = hasSubstatFilter ? new Set(substatVariants.map((variant) => Number(variant))) : null
      // Expected groups enumerate all scope combinations, even if no items match yet.
      const expectedGroups = perRuleMode
        ? []
        : buildKeepUniqueExpectedGroups({ combination, countMode })
      // Ranking is always active when a substat selection exists.
      const useRanking = hasSubstatFilter
      // Current matches split into “kept” vs “sold” so deficits consider what is already safe.
      const matching = candidates
        .filter((candidate) => artifactMatchesKeepUniqueRule(candidate.artifact, combination))
        .filter((candidate) => candidateMatchesSubstatRequirement(candidate, selectedSet, requirement))
      const placeholders: KeepUniquePlaceholderRequest[] = []
      // Carry the substat list into placeholders so per-substat gaps stay targeted.
      const placeholderSubstatVariants = hasSubstatFilter ? [...substatVariants] : null
      // Helper to keep placeholder creation consistent (and attach per-substat scope).
      const buildPlaceholder = (
        combination: KeepUniqueCombination,
        missing: number,
        reason: KeepUniquePlaceholderRequest['reason'],
      ): KeepUniquePlaceholderRequest => ({
        combination,
        missing,
        reason,
        ...(placeholderSubstatVariants ? { substatVariants: placeholderSubstatVariants } : {}),
      })

      if (useRanking) {
        // Normalize weights to the tester sort rules so scoring matches the UI.
        // Weights are honored for Any/All; Per Substat uses equal weighting.
        const allowWeights = allowWeightsForRule
        const weights = allowWeights ? (rule.substatWeights ?? {}) : {}
        const scoreSpec = {
          variants: substatVariants,
          excludeGlyphs: true,
          ...(allowWeights && Object.keys(weights).length > 0 ? { weights } : {}),
        }
        const scored: KeepUniqueScoredCandidate[] = matching
          .map((candidate) => ({
            candidate,
            score: computeTesterNormalizedSubstatScore(candidate.row, scoreSpec) ?? 0,
          }))
          // Only consider items that actually have non-zero substat contribution.
          .filter((entry) => entry.score > 0)
        // Group candidates by scope (or keep a single global bucket).
        const groups = new Map<string, KeepUniqueScoredCandidate[]>()
        if (perRuleMode) {
          if (scored.length > 0) groups.set('global', scored)
        } else {
          for (const entry of scored) {
            const key = getKeepUniqueCountKey(entry.candidate.artifact, countMode)
            const bucket = groups.get(key)
            if (bucket) {
              bucket.push(entry)
            } else {
              groups.set(key, [entry])
            }
          }
        }

        const groupsTracked = expectedGroups.length > 0 ? expectedGroups.length : groups.size
        const effectiveGroupCount = groupsTracked > 0 ? groupsTracked : 1
        const requiredTotal = requiredPerGroup * effectiveGroupCount
        let currentCount = 0
        let keptCount = 0
        let soldCount = 0
        let deficit = 0
        const itemKeys: number[] = []
        const artifacts: KeepUniqueDetectionArtifact[] = []
        // Choose the group list that should drive deficit + placeholder logic.
        const expectedList = expectedGroups.length > 0
          ? expectedGroups
          : Array.from(groups.entries()).map(([key, bucket]) => ({
            key,
            // Fall back to a stub sample only when the bucket is unexpectedly empty.
            sample: bucket[0]?.candidate.artifact ?? buildKeepUniquePlaceholderSample({
              slot: combination.slots[0] ?? ArtifactType.Weapon,
              setId: ACCESSORY_NO_SET_ID as ArtifactSetId,
              mainStat: StatVariantEnum.Any,
              faction: 0 as FactionId,
            }),
          }))
        for (const entry of expectedList) {
          // Pull the scored candidates for this expected group key.
          const bucket = groups.get(entry.key) ?? []
          if (bucket.length === 0) {
            // Missing groups still need placeholders to keep future drops safe.
            const deficitGroup = requiredPerGroup
            placeholders.push(buildPlaceholder(
              buildPlaceholderCombinationForGroup({
                base: combination,
                mode: countMode,
                sample: entry.sample,
              }),
              deficitGroup,
              'group',
            ))
            deficit += deficitGroup
            continue
          }
          // Sort by normalized score so top-N selection is deterministic.
          const sorted = sortKeepUniqueScoredCandidates(bucket)
          // Cutoff index is N-1; clamp to the bucket length.
          const cutoffIndex = Math.min(requiredPerGroup, sorted.length) - 1
          const cutoffScore = cutoffIndex >= 0 ? sorted[cutoffIndex]!.score : Number.POSITIVE_INFINITY
          let groupTotal = 0
          let groupKept = 0
          let groupSold = 0
          for (const scoredEntry of sorted) {
            // Stop once we drop below the cutoff so ties at N are included.
            if (scoredEntry.score < cutoffScore) break
            groupTotal += 1
            if (scoredEntry.candidate.isSold) {
              groupSold += 1
              itemKeys.push(scoredEntry.candidate.itemKey)
              artifacts.push(buildKeepUniqueDetectionArtifact(scoredEntry.candidate))
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
            placeholders.push(buildPlaceholder(
              buildPlaceholderCombinationForGroup({
                base: combination,
                mode: countMode,
                sample: entry.sample,
              }),
              deficitGroup,
              'group',
            ))
          }
          deficit += deficitGroup
        }

        if (groupsTracked === 0 && requiredPerGroup > 0) {
          placeholders.push(buildPlaceholder(
            cloneKeepUniqueCombination(combination),
            requiredPerGroup,
            'global',
          ))
          deficit = requiredPerGroup
        }

        const projected = keptCount + (ruleActive ? soldCount : 0)
        return {
          hash: hashKeepUniqueCombination(combination),
          combination,
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
        }
      }

      if (perRuleMode) {
        // Track sold candidates so we can cap the unranked keep selection.
        const soldCandidates: KeepUniqueCandidate[] = []
        // Keep a simple kept counter to avoid double-filtering.
        let keptCount = 0
        for (const candidate of matching) {
          if (candidate.isSold) {
            soldCandidates.push(candidate)
          } else {
            keptCount += 1
          }
        }
        // Compute sold total from the collected list for accuracy.
        const soldCount = soldCandidates.length
        const requiredTotal = requiredPerGroup
        // Determine how many sold items we need to reach the required count.
        const needed = Math.max(0, requiredPerGroup - keptCount)
        // Pick a deterministic subset of sold items to keep.
        const selectedSold = needed > 0
          ? sortKeepUniqueCandidatesByItemKey(soldCandidates).slice(0, needed)
          : []
        // Projected count reflects only the capped keep-unique injections.
        const projected = keptCount + (ruleActive ? Math.min(soldCount, needed) : 0)
        const deficit = Math.max(0, requiredTotal - (keptCount + soldCount))
        if (deficit > 0) {
          placeholders.push(buildPlaceholder(
            cloneKeepUniqueCombination(combination),
            deficit,
            'global',
          ))
        }
        // When short, emit only the capped sold items; already-kept items are safe.
        const atRisk = selectedSold
        // Extract keys so the merge layer can inject item-scoped rules.
        const itemKeys = atRisk.map((match) => match.itemKey)
        // Materialize artifacts for keep-rule generation.
        const artifacts = atRisk.map((match) => buildKeepUniqueDetectionArtifact(match))
        return {
          hash: hashKeepUniqueCombination(combination),
          combination,
          ruleId: rule.id,
          ruleActivation: activation,
          countMode,
          perGroupRequiredCount: requiredPerGroup,
          groupsTracked: matching.length > 0 ? 1 : 0,
          requiredCount: requiredTotal,
          // current reflects how many matching items exist (kept + sold).
          currentCount: keptCount + soldCount,
          projectedCount: projected,
          deficit,
          coveredByExisting: keptCount >= requiredTotal,
          itemKeys,
          artifacts,
          placeholders,
        }
      }

      type KeepUniqueGroupBucket = {
        kept: KeepUniqueCandidate[]
        sold: KeepUniqueCandidate[]
        sample: KeepUniqueCandidate | null
      }
      const groupCounts = new Map<KeepUniqueCountKey, KeepUniqueGroupBucket>()
      for (const candidate of matching) {
        const key = getKeepUniqueCountKey(candidate.artifact, countMode)
        const entry = groupCounts.get(key)
        if (entry) {
          if (candidate.isSold) {
            entry.sold.push(candidate)
          } else {
            entry.kept.push(candidate)
          }
          if (!entry.sample) entry.sample = candidate
        } else {
          groupCounts.set(key, {
            kept: candidate.isSold ? [] : [candidate],
            sold: candidate.isSold ? [candidate] : [],
            sample: candidate,
          })
        }
      }

      const groupsTracked = expectedGroups.length > 0 ? expectedGroups.length : groupCounts.size
      const effectiveGroupCount = groupsTracked > 0 ? groupsTracked : 1
      const requiredTotal = requiredPerGroup * effectiveGroupCount
      let deficit = 0
      let keptTotal = 0
      let soldTotal = 0
      let projectedTotal = 0
      const atRisk: KeepUniqueCandidate[] = []
      // Choose the group list that should drive deficit + placeholder logic.
      const expectedList = expectedGroups.length > 0
        ? expectedGroups
        : Array.from(groupCounts.entries()).map(([key, group]) => ({
          key,
          // Fall back to a stub sample only when the bucket is unexpectedly empty.
          sample: group.sample?.artifact ?? buildKeepUniquePlaceholderSample({
            slot: combination.slots[0] ?? ArtifactType.Weapon,
            setId: ACCESSORY_NO_SET_ID as ArtifactSetId,
            mainStat: StatVariantEnum.Any,
            faction: 0 as FactionId,
          }),
        }))
      for (const entry of expectedList) {
        // Pull the candidate group for this expected group key.
        const group = groupCounts.get(entry.key)
        if (!group) {
          // Missing groups still need placeholders to keep future drops safe.
          const deficitGroup = requiredPerGroup
          placeholders.push(buildPlaceholder(
            buildPlaceholderCombinationForGroup({
              base: combination,
              mode: countMode,
              sample: entry.sample,
            }),
            deficitGroup,
            'group',
          ))
          deficit += deficitGroup
          continue
        }
        // Count kept vs sold so projections and deficits stay consistent.
        const keptCount = group.kept.length
        const soldCount = group.sold.length
        // Accumulate the raw totals for summary reporting.
        keptTotal += keptCount
        soldTotal += soldCount
        // Compute how many sold items we need to reach the quota.
        const needed = Math.max(0, requiredPerGroup - keptCount)
        // Projected counts consider only the capped keep-unique selection.
        const projectedGroup = keptCount + (ruleActive ? Math.min(soldCount, needed) : 0)
        // Track the projected total so the summary reflects capped keeps.
        projectedTotal += projectedGroup
        // Deficits are based on the total items available (kept + sold).
        const totalCount = keptCount + soldCount
        const deficitGroup = Math.max(0, requiredPerGroup - totalCount)
        if (needed > 0) {
          // Only inject the deterministic subset needed to reach the quota.
          const selectedSold = sortKeepUniqueCandidatesByItemKey(group.sold).slice(0, needed)
          // Only sold artifacts need injected keep rules; already-kept artifacts are safe.
          atRisk.push(...selectedSold)
          placeholders.push(buildPlaceholder(
            buildPlaceholderCombinationForGroup({
              base: combination,
              mode: countMode,
              sample: entry.sample,
            }),
            deficitGroup,
            'group',
          ))
        }
        deficit += deficitGroup
      }
      if (groupsTracked === 0 && requiredPerGroup > 0) {
        placeholders.push(buildPlaceholder(
          cloneKeepUniqueCombination(combination),
          requiredPerGroup,
          'global',
        ))
        deficit = requiredPerGroup
      }

      const projected = projectedTotal
      const itemKeys = atRisk.map((match) => match.itemKey)
      const artifacts = atRisk.map((match) => buildKeepUniqueDetectionArtifact(match))
      return {
        hash: hashKeepUniqueCombination(combination),
        combination,
        ruleId: rule.id,
        ruleActivation: activation,
        countMode,
        perGroupRequiredCount: requiredPerGroup,
        groupsTracked,
        requiredCount: requiredTotal,
        currentCount: keptTotal + soldTotal,
        projectedCount: projected,
        deficit,
        coveredByExisting: keptTotal >= requiredTotal,
        itemKeys,
        artifacts,
        placeholders,
      }
    }

    const mergeSubstatEntries = (
      substatEntries: KeepUniqueDetectionEntry[],
    ): KeepUniqueDetectionEntry => {
      const itemKeys: number[] = []
      const itemKeySet = new Set<number>()
      const artifacts: KeepUniqueDetectionArtifact[] = []
      const artifactKeySet = new Set<number>()
      const placeholders: KeepUniquePlaceholderRequest[] = []
      let requiredCount = 0
      let currentCount = 0
      let projectedCount = 0
      let deficit = 0
      let groupsTracked = 0
      for (const entry of substatEntries) {
        requiredCount += entry.requiredCount
        currentCount += entry.currentCount
        projectedCount += entry.projectedCount
        deficit += entry.deficit
        groupsTracked += entry.groupsTracked
        placeholders.push(...(entry.placeholders ?? []))
        for (const itemKey of entry.itemKeys ?? []) {
          if (itemKeySet.has(itemKey)) continue
          itemKeySet.add(itemKey)
          itemKeys.push(itemKey)
        }
        for (const artifact of entry.artifacts ?? []) {
          const itemKey = artifact.itemKey
          if (artifactKeySet.has(itemKey)) continue
          artifactKeySet.add(itemKey)
          artifacts.push(artifact)
        }
      }
      return {
        hash: hashKeepUniqueCombination(combination),
        combination,
        ruleId: rule.id,
        ruleActivation: activation,
        countMode,
        perGroupRequiredCount: requiredPerGroup,
        groupsTracked,
        requiredCount,
        currentCount,
        projectedCount,
        deficit,
        coveredByExisting: deficit <= 0,
        itemKeys,
        artifacts,
        placeholders,
      }
    }

    if (substatRequirement === KeepUniqueSubstatRequirement.PerSubstat && selectedSubstats.length > 1) {
      // Split the rule into one detection pass per picked substat.
      const perSubstatEntries = selectedSubstats.map((variant) => (
        buildEntryForSubstats([variant], KeepUniqueSubstatRequirement.Any)
      ))
      entries.push(mergeSubstatEntries(perSubstatEntries))
      continue
    }

    // Per-substat with a single pick collapses to the standard any-of requirement.
    const effectiveRequirement = substatRequirement === KeepUniqueSubstatRequirement.PerSubstat
      ? KeepUniqueSubstatRequirement.Any
      : substatRequirement
    entries.push(buildEntryForSubstats(selectedSubstats, effectiveRequirement))
  }

  return { scannedAt: timestamp, entries }
}

/** Expand metaset references to explicit set IDs for combination evaluation. */
export function resolveKeepUniqueRulesWithMetasets<T extends { combination: KeepUniqueCombination }>(
  rules: readonly T[],
  metasets: readonly Metaset[],
): T[] {
  // No rules or metasets -> no expansion needed.
  if (!rules.length) return rules as T[]
  if (!metasets.length) return rules as T[]
  // Build a fast lookup for metaset id -> definition.
  const metaMap = new Map(metasets.map((meta) => [meta.id, meta]))
  let mutated = false
  const resolved = rules.map((rule) => {
    const metaIds = rule.combination.metaSetIds ?? []
    if (!metaIds.length) return rule
    // Normalize selections so exclusion entries are preserved during expansion.
    const expanded = normalizeArtifactSetSelections(rule.combination.sets)
    // Track explicit excludes and includes separately.
    const excludedIds = new Set(expanded.filter((entry) => entry.excluded).map((entry) => Number(entry.id)))
    const includedIds = new Set(expanded.filter((entry) => !entry.excluded).map((entry) => Number(entry.id)))
    let combinationChanged = false
    for (const metaId of metaIds) {
      const meta = metaMap.get(metaId)
      if (!meta || !Array.isArray(meta.sets)) continue
      for (const setId of meta.sets) {
        const numeric = Number(setId)
        // Exclusions always win, even for metaset-derived ids.
        if (excludedIds.has(numeric)) continue
        if (includedIds.has(numeric)) continue
        includedIds.add(numeric)
        combinationChanged = true
      }
    }
    if (!combinationChanged) return rule
    mutated = true
    const mergedEntries: ArtifactSetSelectionEntry[] = []
    // Merge exclusions first so precedence is preserved when normalizing.
    for (const id of excludedIds) mergedEntries.push({ id: id as ArtifactSetId, excluded: true })
    for (const id of includedIds) mergedEntries.push({ id: id as ArtifactSetId })
    const sortedSets = normalizeArtifactSetSelections(mergedEntries)
    return {
      ...rule,
      combination: {
        ...rule.combination,
        sets: sortedSets,
      },
    }
  })
  return mutated ? resolved : rules as T[]
}

type KeepUniqueLabelSource = KeepUniqueRule | HsfRuleWithCfg | null | undefined

/**
 * Resolve the label to display for a Keep Unique rule or injected row.
 * Prefers trimmed rule names, then falls back to a `#id` sentinel when blank.
 */
export function resolveKeepUniqueRuleLabel(source: KeepUniqueLabelSource): string | null {
  if (!source) return null
  const rawName = 'name' in source ? source.name : source.ConfigName
  const normalizedName = normalizeConfigName(rawName ?? null)
  if (normalizedName) return normalizedName
  const ordinal = ((): number | null => {
    if (typeof source !== 'object' || source === null) return null
    if ('__keepUniqueRuleOrdinal' in source) {
      const value = Number((source as { __keepUniqueRuleOrdinal?: number }).__keepUniqueRuleOrdinal)
      if (Number.isFinite(value) && value > 0) return value
    }
    return null
  })()
  if (ordinal) return `#${ordinal}`
  const fallbackId = 'name' in source ? source.id : source.__keepUniqueRuleId
  if (typeof fallbackId === 'string') {
    const trimmed = fallbackId.trim()
    if (trimmed.length > 0) return `#${trimmed}`
  }
  return null
}
