import { isAccessorySlot } from './testerDomain'
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
  PREFERRED_ARTIFACT_TYPE_ORDER,
  StatVariant as StatVariantEnum,
  STAT_VARIANTS_PRIORITY,
  artifactSetNames,
  artifactTypeNames,
  compareArtifactTypes,
  compareArtifactSets,
  compareVariants,
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
import { normalizeArtifactSetSelections } from './gearSets/selection'
import { hasIgnoreKeepUniqueTag } from './tagHelpers'
import { normalizeTesterSortWeight, TESTER_SORT_WEIGHT_DEFAULT } from './testerSort'
import {
  computeKeepUniqueProtectionWithLoadedWasm,
  getKeepUniqueCountKeyWithLoadedWasm,
  resolveKeepUniqueCandidateKeepFlagsWithLoadedWasm,
} from './wasm/wasmRuleEngine'

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

// KeepUniqueSubstatMatch controls how multiple picked substats are matched.
export const KeepUniqueSubstatMatch = {
  Any: 'any',
  All: 'all',
  PerSubstat: 'perSubstat',
} as const

// eslint-disable-next-line no-redeclare -- allow constant/type pair
export type KeepUniqueSubstatMatch =
  (typeof KeepUniqueSubstatMatch)[keyof typeof KeepUniqueSubstatMatch]

// Normalize to lower-case keys so case-insensitive parsing is stable.
const KEEP_UNIQUE_SUBSTAT_MATCH_LOOKUP: Record<string, KeepUniqueSubstatMatch> = {
  // Canonical lower-case entries map straight through.
  [KeepUniqueSubstatMatch.Any]: KeepUniqueSubstatMatch.Any,
  [KeepUniqueSubstatMatch.All]: KeepUniqueSubstatMatch.All,
  // `perSubstat` lowercases to `persubstat`, so capture the normalized form.
  [KeepUniqueSubstatMatch.PerSubstat.toLowerCase()]: KeepUniqueSubstatMatch.PerSubstat,
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

// normalizeKeepUniqueSubstatMatch keeps matching choices stable and case-insensitive.
export const normalizeKeepUniqueSubstatMatch = (value: unknown): KeepUniqueSubstatMatch => {
  if (typeof value === 'string') {
    // Lowercase the input so callers can pass legacy or mixed-case strings.
    const trimmed = value.trim().toLowerCase()
    // Map normalized keys back to the canonical match values.
    const normalized = KEEP_UNIQUE_SUBSTAT_MATCH_LOOKUP[trimmed]
    if (normalized) return normalized
  }
  // Default keeps existing behavior when no match value is provided.
  return KeepUniqueSubstatMatch.Any
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
  // Keep the substat match scalar aligned with the stored rule.
  substatMatch: rule.substatMatch,
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
  // Match behavior for multiple selected substats.
  substatMatch: KeepUniqueSubstatMatch
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

// sortKeepUniqueNumericSelection dedupes and sorts numeric selections for stable UI/output.
const sortKeepUniqueNumericSelection = <T extends number>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
): T[] => {
  // Fast exit keeps empty selections cheap.
  if (values.length === 0) return []
  // Deduplicate while keeping only numeric values.
  const seen = new Set<number>()
  const deduped: T[] = []
  for (const raw of values) {
    const numeric = Number(raw)
    if (!Number.isFinite(numeric)) continue
    if (seen.has(numeric)) continue
    seen.add(numeric)
    deduped.push(raw)
  }
  // Sort in the requested canonical order.
  return deduped.slice().sort(compare)
}

// sortKeepUniqueStringSelection normalizes metaset ids for consistent snapshots/export.
const sortKeepUniqueStringSelection = (values: readonly string[]): string[] => {
  // Skip work when nothing is selected.
  if (values.length === 0) return []
  // Trim and dedupe while preserving meaningful ids only.
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const raw of values) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    deduped.push(trimmed)
  }
  // Keep ordering stable for HSFC and UI chips.
  return deduped.slice().sort((left, right) => left.localeCompare(right))
}

// sortKeepUniqueSubstats keeps substat selections aligned with app-wide stat priority.
export const sortKeepUniqueSubstats = (values: readonly StatVariant[]): StatVariant[] => (
  sortKeepUniqueNumericSelection(values, (left, right) => {
    const leftOrder = SUBSTAT_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = SUBSTAT_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return Number(left) - Number(right)
  })
)

// sortKeepUniqueCombination enforces stable ordering across every keep-unique filter.
export const sortKeepUniqueCombination = (combination: KeepUniqueCombination): KeepUniqueCombination => ({
  // Slots follow the canonical artifact type ordering.
  slots: sortKeepUniqueNumericSelection(combination.slots, compareArtifactTypes),
  // Sets keep exclusion precedence and sort by id.
  sets: normalizeArtifactSetSelections(combination.sets ?? []),
  // Metaset ids sort lexicographically for readable HSFC payloads.
  metaSetIds: sortKeepUniqueStringSelection(combination.metaSetIds ?? []),
  // Rank selections always rise from 1★ to 6★.
  ranks: sortKeepUniqueNumericSelection(combination.ranks, (left, right) => Number(left) - Number(right)),
  // Rarity selections use the same 1..6 ordering as ranks.
  rarities: sortKeepUniqueNumericSelection(combination.rarities, (left, right) => Number(left) - Number(right)),
  // Main stats reuse the preferred stat ordering from config exports.
  mainStats: sortKeepUniqueNumericSelection(combination.mainStats ?? [], compareVariants),
  // Factions remain numeric and stable across locales.
  factions: sortKeepUniqueNumericSelection(combination.factions ?? [], (left, right) => Number(left) - Number(right)),
})

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
  return sortKeepUniqueSubstats(result)
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
  const factionValues = normalizeSelectionArray(rec.factions, (raw) => {
    if (raw == null || raw === '') return null
    return coerceFactionId(raw)
  })
  const metaSetIds = normalizeStringSelectionArray(rec.metaSetIds ?? rec.metaSets)
  return sortKeepUniqueCombination({
    slots: slotValues,
    sets: setValues,
    metaSetIds,
    ranks: rankValues,
    rarities: rarityValues,
    mainStats,
    factions: factionValues,
  })
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
  // Substat matching defaults to "any" unless explicit data is provided.
  const rawSubstatMatch = ('substatMatch' in rec ? rec.substatMatch : undefined)
  const parsedSubstatMatch = normalizeKeepUniqueSubstatMatch(rawSubstatMatch)
  const substatMatch = substats.length > 0 ? parsedSubstatMatch : KeepUniqueSubstatMatch.Any
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
    substatMatch,
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
  // Keep key derivation in wasm so JS cannot drift from detection semantics.
  const normalizedMode = sanitizeCountMode(mode)
  // Slot drives faction normalization because non-accessories always use faction 0.
  const slot = Number(artifact.slot)
  const faction = isAccessorySlot(slot) ? Number(artifact.faction ?? 0) : 0
  // Main stat is encoded as StatVariant number; missing maps to Any sentinel.
  const mainStat = Number(artifact.mainStat?.variant ?? StatVariantEnum.Any)
  // Delegate final key construction to wasm (single source of truth).
  return getKeepUniqueCountKeyWithLoadedWasm({
    slot,
    set: Number(artifact.set),
    faction,
    mainStat,
    countMode: normalizedMode,
  })
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

// Minimal candidate payload keeps wasm serialization focused on detection fields only.
type KeepUniqueWasmCandidatePayload = {
  itemKey: number
  groupKey: string
  isSold: boolean
  artifact: {
    id: number | null
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
}

// Widened rule payload strips reactive state while preserving detection semantics.
type KeepUniqueWasmRulePayload = {
  id: string
  combination: KeepUniqueCombination
  requiredCount: number
  activation: KeepUniqueRuleActivation
  countMode: KeepUniqueRuleCountMode
  substats: StatVariant[]
  substatMatch: KeepUniqueSubstatMatch
  substatWeights: Partial<Record<StatVariant, number>>
}

type KeepUniqueWasmExpectedGroupDomainPayload = {
  slotOrder: ArtifactTypeId[]
  accessoryCompatibleSetIds: ArtifactSetId[]
  armorCompatibleSetIds: ArtifactSetId[]
  allowedMainBySlot: Record<string, StatVariant[]>
  allFactionIds: FactionId[]
}

// Candidate resolver rows keep just the fields needed for base-match fallback.
type KeepUniqueWasmCandidateResolveRowPayload = {
  item: NormalizedGearArtifact['testerItem']
  baseMatchDefined: boolean
  baseMatch: { keep: boolean; cfgIdx: number | null } | null
}

// Build a compact domain payload so wasm can enumerate expected scope groups
// without duplicating TS-only catalogs or runtime set expansion logic.
const buildKeepUniqueExpectedGroupDomain = (): KeepUniqueWasmExpectedGroupDomainPayload => {
  // Resolve runtime-aware set pools once per scan so wasm sees current catalogs.
  const accessoryCompatibleSetIds = getAccessorySlotsCompatibleSetIds()
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort(compareArtifactSets)
    .map((value) => value as ArtifactSetId)
  const armorCompatibleSetIds = resolveArmorCompatibleSetIds()
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort(compareArtifactSets)
    .map((value) => value as ArtifactSetId)
  // Serialize allowed mains by slot into plain arrays for wasm payload parsing.
  const allowedMainBySlot: Record<string, StatVariant[]> = {}
  for (const [slotKey, allowed] of Object.entries(ALLOWED_MAIN_BY_SLOT)) {
    allowedMainBySlot[String(slotKey)] = Array.from(allowed)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right)
      .map((value) => value as StatVariant)
  }
  return {
    // Preserve preferred slot ordering so expected-group insertion order stays deterministic.
    slotOrder: PREFERRED_ARTIFACT_TYPE_ORDER.map((value) => Number(value) as ArtifactTypeId),
    accessoryCompatibleSetIds,
    armorCompatibleSetIds,
    allowedMainBySlot,
    // Provide all positive faction ids; non-accessory slots still normalize to 0 in wasm.
    allFactionIds: ALL_FACTION_IDS.slice(),
  }
}

// Build compact candidate payloads so the wasm boundary avoids full preview-row objects.
const toKeepUniqueWasmCandidates = (candidates: readonly KeepUniqueCandidate[]): KeepUniqueWasmCandidatePayload[] => (
  candidates.map((candidate) => ({
    itemKey: candidate.itemKey,
    groupKey: candidate.groupKey,
    isSold: candidate.isSold,
    artifact: {
      id: Number.isFinite(Number(candidate.artifact.id)) ? Number(candidate.artifact.id) : null,
      slot: candidate.artifact.slot,
      set: candidate.artifact.set,
      rank: candidate.artifact.rank,
      rarity: candidate.artifact.rarity,
      level: candidate.artifact.level,
      exactLevel: candidate.artifact.exactLevel ?? null,
      faction: candidate.artifact.faction,
      mainStat: candidate.artifact.mainStat?.variant ?? StatVariantEnum.Any,
      // Keep raw total values for scoring parity; wasm rounds only when emitting artifacts.
      substats: candidate.artifact.substats.map((stat) => ({
        variant: stat.variant,
        isFlat: stat.isFlat,
        value: Number(stat.totalValue ?? 0),
      })),
    },
  }))
)

// Build compact rule payloads to avoid serializing UI-only or derived fields into wasm.
const toKeepUniqueWasmRules = (rules: readonly KeepUniqueRule[]): KeepUniqueWasmRulePayload[] => (
  rules.map((rule) => ({
    id: rule.id,
    combination: rule.combination,
    requiredCount: rule.requiredCount,
    activation: rule.activation,
    countMode: sanitizeCountMode(rule.countMode),
    substats: rule.substats ?? [],
    substatMatch: normalizeKeepUniqueSubstatMatch(rule.substatMatch),
    substatWeights: rule.substatWeights ?? {},
  }))
)

const isKeepUniqueDetectionSnapshot = (value: unknown): value is KeepUniqueDetectionSnapshot => (
  value != null
  && typeof value === 'object'
  && Array.isArray((value as { entries?: unknown }).entries)
)

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
  if (!rows.length) return { candidates: [], uniqueItemKeys: new Set() }
  const baseRuleList: HsfRuleWithCfg[] = Array.isArray(baseRules) ? [...baseRules] : []
  // Build compact resolver rows so WASM handles base-match fallback semantics.
  const wasmResolverRows: KeepUniqueWasmCandidateResolveRowPayload[] = rows.map((row) => ({
    item: row.artifact.testerItem,
    baseMatchDefined: row.baseMatch !== undefined,
    baseMatch: row.baseMatch
      ? {
        keep: row.baseMatch.keep === true,
        cfgIdx: row.baseMatch.cfgIdx ?? null,
      }
      : null,
  }))
  // WASM-first candidate keep/sell resolution keeps matching semantics in Rust.
  try {
    const keepFlags = resolveKeepUniqueCandidateKeepFlagsWithLoadedWasm({
      rows: wasmResolverRows,
      rules: baseRuleList,
      configModes,
      ...(ignoreConfigSet ? { ignoreKeepUniqueConfigIndices: ignoreConfigSet } : {}),
    })
    if (!Array.isArray(keepFlags) || keepFlags.length !== rows.length) {
      throw new Error('WASM keep-unique candidate resolver returned an invalid payload.')
    }
    const candidates: KeepUniqueCandidate[] = []
    const uniqueItemKeys = new Set<number>()
    for (let idx = 0; idx < rows.length; idx += 1) {
      const row = rows[idx]!
      const artifact = row.artifact
      const itemKey = getKeepUniqueItemKey(artifact)
      const groupKey = getKeepUniqueGroupKey(artifact)
      const isKept = keepFlags[idx] === true
      const isSold = !isKept
      const candidate: KeepUniqueCandidate = { row, artifact, itemKey, groupKey, isSold }
      candidates.push(candidate)
      if (isSold) uniqueItemKeys.add(itemKey)
    }
    return { candidates, uniqueItemKeys }
  } catch (error) {
    // Keep the error actionable so callers know warmup/compat requirements.
    throw new Error(`WASM keep-unique candidate resolution is unavailable: ${String(error)}`)
  }
}

/** Compute Keep Unique combination coverage against the candidate sold rows. */
/** Compute Keep Unique combination coverage against the candidate sold rows. */
export function computeKeepUniqueProtection(params: KeepUniqueDetectionParams): KeepUniqueDetectionSnapshot {
  const { candidates, rules, enabled, now } = params
  const timestamp = Number.isFinite(now) ? Number(now) : Date.now()
  const wasmCandidates = toKeepUniqueWasmCandidates(candidates)
  const wasmRules = toKeepUniqueWasmRules(rules)
  // Wasm derives expected groups from the shared domain payload (SSOT path).
  const wasmSnapshot = computeKeepUniqueProtectionWithLoadedWasm({
    candidates: wasmCandidates,
    rules: wasmRules,
    expectedGroupDomain: buildKeepUniqueExpectedGroupDomain(),
    enabled,
    now: timestamp,
  })
  if (isKeepUniqueDetectionSnapshot(wasmSnapshot)) {
    return wasmSnapshot
  }
  throw new Error('WASM keep-unique detection returned an invalid payload.')
}

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
