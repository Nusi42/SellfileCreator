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
import { normalizeArtifactSetSelections, splitArtifactSetSelections } from './gearSets/selection'
import { hasIgnoreKeepUniqueTag } from './tagHelpers'
import { normalizeTesterSortWeight, TESTER_SORT_WEIGHT_DEFAULT } from './testerSort'
import { ACCESSORY_NO_SET_ID } from './constants'
import {
  computeKeepUniqueProtectionWithLoadedWasm,
  getKeepUniqueCountKeyWithLoadedWasm,
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

type KeepUniqueWasmExpectedGroupPayload = {
  key: string
  sample: {
    slot: ArtifactTypeId
    set: ArtifactSetId
    faction: FactionId
    mainStat: StatVariant
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

// Expected groups remain JS-sourced for now; wasm consumes the precomputed key samples.
const buildKeepUniqueExpectedGroupsByRuleId = (
  rules: readonly KeepUniqueRule[],
): Record<string, KeepUniqueWasmExpectedGroupPayload[]> => {
  const byRuleId: Record<string, KeepUniqueWasmExpectedGroupPayload[]> = {}
  for (const rule of rules) {
    const countMode = sanitizeCountMode(rule.countMode)
    const expected = countMode.perRule
      ? []
      : buildKeepUniqueExpectedGroups({
        combination: rule.combination,
        countMode,
      })
    byRuleId[rule.id] = expected.map((entry) => ({
      key: entry.key,
      sample: {
        slot: entry.sample.slot,
        set: entry.sample.set,
        faction: entry.sample.faction,
        mainStat: entry.sample.mainStat?.variant ?? StatVariantEnum.Any,
      },
    }))
  }
  return byRuleId
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
/** Compute Keep Unique combination coverage against the candidate sold rows. */
export function computeKeepUniqueProtection(params: KeepUniqueDetectionParams): KeepUniqueDetectionSnapshot {
  const { candidates, rules, enabled, now } = params
  const timestamp = Number.isFinite(now) ? Number(now) : Date.now()
  // Keep-unique detection is WASM-only in this branch.
  const wasmSnapshot = computeKeepUniqueProtectionWithLoadedWasm({
    candidates: toKeepUniqueWasmCandidates(candidates),
    rules: toKeepUniqueWasmRules(rules),
    expectedGroupsByRuleId: buildKeepUniqueExpectedGroupsByRuleId(rules),
    enabled,
    now: timestamp,
  })
  if (
    wasmSnapshot
    && typeof wasmSnapshot === 'object'
    && Array.isArray((wasmSnapshot as { entries?: unknown }).entries)
  ) {
    return wasmSnapshot as KeepUniqueDetectionSnapshot
  }
  throw new Error('WASM keep-unique detection is unavailable. Ensure warmupWasmRuleEngine() ran first.')
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
