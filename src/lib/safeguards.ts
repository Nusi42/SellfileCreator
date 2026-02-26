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
  RankCode,
  RarityCode,
  StatVariant as StatVariantEnum,
  artifactSetNames,
  artifactTypeNames,
  compareArtifactSets,
  compareArtifactTypes,
  factionNames,
  getArmorFixedSetIds,
  getArmorVariableSetIds,
  getAccessorySlotsCompatibleSetIds,
  rarityNames,
  variantFromLabel,
} from './types'
import { resolveAutoRarityCode } from './hsfBuilder'
import type { BuilderRecipe, SellfileExportMode } from './hsfBuilder'
import type { HsfRuleWithRecipe } from './merge'
import type { NormalizedGearArtifact } from './importers/gearDbNormalizer'
import type { Metaset } from './metasets'
import { normalizeRecipeName } from './ruleRecipeIndex'
import type { ArtifactSetSelectionEntry } from './gearSets/selection'
import { normalizeArtifactSetSelections } from './gearSets/selection'
import { hasIgnoreSafeguardTag } from './tagHelpers'
import {
  collectAndComputeSafeguardProtectionWithLoadedWasm,
  collectSafeguardCandidatesWithLoadedWasm,
  computeSafeguardProtectionWithLoadedWasm,
  getSafeguardGroupKeyWithLoadedWasm,
  getSafeguardItemKeyWithLoadedWasm,
  getSafeguardCountKeyWithLoadedWasm,
  hashSafeguardCombinationWithLoadedWasm,
  normalizeSafeguardExpectedGroupDomainWithLoadedWasm,
  resolveSafeguardRulesWithMetasetsWithLoadedWasm,
  sortSafeguardCombinationWithLoadedWasm,
  sortSafeguardSubstatsWithLoadedWasm,
} from './wasm/wasmRuleEngine'
import {
  SAFEGUARD_ACTIVATION_ANTICIPATE_GAPS,
  SAFEGUARD_ACTIVATION_OFF,
  SAFEGUARD_ACTIVATION_PROTECT_EXISTING,
  SAFEGUARD_DEFAULT_COUNT_MODE_PER_FACTION,
  SAFEGUARD_DEFAULT_COUNT_MODE_PER_MAIN_STAT,
  SAFEGUARD_DEFAULT_COUNT_MODE_PER_RULE,
  SAFEGUARD_DEFAULT_COUNT_MODE_PER_SET,
  SAFEGUARD_DEFAULT_COUNT_MODE_PER_SLOT,
  SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION as SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION_CONST,
  SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT as SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT_CONST,
  SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS as SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS_CONST,
  SAFEGUARD_WEIGHT_DEFAULT,
  SAFEGUARD_WEIGHT_MAX,
  SAFEGUARD_WEIGHT_MIN,
  SAFEGUARD_WEIGHT_STEP,
  SAFEGUARD_SUBSTAT_ALL,
  SAFEGUARD_SUBSTAT_ANY,
  SAFEGUARD_SUBSTAT_PER_SUBSTAT,
  RANK_VALUE_MAX,
  RANK_VALUE_MIN,
} from './generated/domainConstants'

// Cache faction IDs for placeholder enumeration (skip the 0 "any" sentinel).
const ALL_FACTION_IDS = Object.freeze(
  Object.keys(factionNames)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)
    .map((value) => value as FactionId),
)

export const buildIgnoreSafeguardRecipeIndices = (recipes: readonly BuilderRecipe[]): ReadonlySet<number> => {
  // Track indices so we can skip only tagged recipes during detection.
  const ignored = new Set<number>()
  // Maintain index alignment with rule-building recipe order.
  for (let idx = 0; idx < recipes.length; idx += 1) {
    // Read the tags directly from the builder recipe.
    const tags = recipes[idx]?.tags
    // Only add when the ignore tag is present.
    if (hasIgnoreSafeguardTag(tags)) {
      ignored.add(idx)
    }
  }
  // Return the set so callers can reuse it across scans.
  return ignored
}

export type SafeguardCombination = {
  slots: ArtifactTypeId[]
  sets: ArtifactSetSelectionEntry[]
  metaSetIds: string[]
  ranks: RankValue[]
  rarities: RankValue[]
  mainStats: StatVariant[]
  factions: FactionId[]
}

// Count mode decides whether the required total is per rule or enforced per set/faction/main tuple.
export type SafeguardRuleCountMode = {
  perRule: boolean
  perSet: boolean
  perFaction: boolean
  perMainStat: boolean
  perSlot: boolean
}

// Mirrors the default scope-chip state (slot+set+faction+main) so SFR imports and tutorials stay aligned.
export const SAFEGUARD_DEFAULT_COUNT_MODE: SafeguardRuleCountMode = {
  perRule: SAFEGUARD_DEFAULT_COUNT_MODE_PER_RULE,
  perSet: SAFEGUARD_DEFAULT_COUNT_MODE_PER_SET,
  perFaction: SAFEGUARD_DEFAULT_COUNT_MODE_PER_FACTION,
  perMainStat: SAFEGUARD_DEFAULT_COUNT_MODE_PER_MAIN_STAT,
  perSlot: SAFEGUARD_DEFAULT_COUNT_MODE_PER_SLOT,
}

// Default toggle keeps rule evaluation independent from earlier safeguards.
export const SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS =
  SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS_CONST
// Equipped-ignore toggles default off so current behavior is preserved.
export const SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION =
  SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION_CONST
export const SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT =
  SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT_CONST

export const SafeguardRuleActivation = {
  Off: SAFEGUARD_ACTIVATION_OFF,
  ProtectExisting: SAFEGUARD_ACTIVATION_PROTECT_EXISTING,
  AnticipateGaps: SAFEGUARD_ACTIVATION_ANTICIPATE_GAPS,
} as const

// eslint-disable-next-line no-redeclare -- allow constant/type pair
export type SafeguardRuleActivation =
  (typeof SafeguardRuleActivation)[keyof typeof SafeguardRuleActivation]

// SafeguardSubstatMatch controls how multiple picked substats are matched.
export const SafeguardSubstatMatch = {
  Any: SAFEGUARD_SUBSTAT_ANY,
  All: SAFEGUARD_SUBSTAT_ALL,
  PerSubstat: SAFEGUARD_SUBSTAT_PER_SUBSTAT,
} as const

// eslint-disable-next-line no-redeclare -- allow constant/type pair
export type SafeguardSubstatMatch =
  (typeof SafeguardSubstatMatch)[keyof typeof SafeguardSubstatMatch]

// normalizeSafeguardActivation keeps activation parsing consistent across keep-override rules.
export const normalizeSafeguardActivation = (
  value: unknown,
): SafeguardRuleActivation => {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (token === SafeguardRuleActivation.Off.toLowerCase()) {
    return SafeguardRuleActivation.Off
  }
  if (token === SafeguardRuleActivation.AnticipateGaps.toLowerCase()) {
    return SafeguardRuleActivation.AnticipateGaps
  }
  if (token === SafeguardRuleActivation.ProtectExisting.toLowerCase()) {
    return SafeguardRuleActivation.ProtectExisting
  }
  return SafeguardRuleActivation.ProtectExisting
}

// normalizeSafeguardSubstatMatch keeps matching choices stable and case-insensitive.
export const normalizeSafeguardSubstatMatch = (value: unknown): SafeguardSubstatMatch => {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (token === SafeguardSubstatMatch.All.toLowerCase()) {
    return SafeguardSubstatMatch.All
  }
  if (token === SafeguardSubstatMatch.PerSubstat.toLowerCase()) {
    return SafeguardSubstatMatch.PerSubstat
  }
  return SafeguardSubstatMatch.Any
}

export const isSafeguardRuleActive = (rule: SafeguardRule): boolean => (
  rule.activation !== SafeguardRuleActivation.Off
)

const sanitizeCountMode = (raw: Partial<SafeguardRuleCountMode> | null | undefined): SafeguardRuleCountMode => {
  const parsed = raw ?? SAFEGUARD_DEFAULT_COUNT_MODE
  const perRule = parsed.perRule === true
  const perSet = parsed.perSet === true
  const perFaction = parsed.perFaction === true
  const perMainStat = parsed.perMainStat === true
  const perSlot = parsed.perSlot === true
  if (perRule) {
    return {
      perRule: true,
      perSet: false,
      perFaction: false,
      perMainStat: false,
      perSlot: false,
    }
  }
  if (!perSet && !perFaction && !perMainStat && !perSlot) {
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

// normalizeSafeguardCountMode parses legacy payloads into the canonical scope-chip shape.
export const normalizeSafeguardCountMode = (value: unknown): SafeguardRuleCountMode => {
  if (typeof value === 'string') {
    const token = value.trim().toLowerCase()
    if (token === 'perrule' || token === 'rule') {
      return {
        perRule: true,
        perSet: false,
        perFaction: false,
        perMainStat: false,
        perSlot: false,
      }
    }
  }
  return sanitizeCountMode(value as Partial<SafeguardRuleCountMode> | null | undefined)
}

export const isPerRuleCountMode = (mode: SafeguardRuleCountMode): boolean => mode.perRule
export const sanitizeSafeguardCountMode = (mode: SafeguardRuleCountMode): SafeguardRuleCountMode => sanitizeCountMode(mode)

export const cloneSafeguardCombination = (combination: SafeguardCombination): SafeguardCombination => ({
  slots: [...combination.slots],
  // Clone entries so excluded flags survive but references do not.
  sets: combination.sets.map((entry) => (entry.excluded ? { id: entry.id, excluded: true } : { id: entry.id })),
  metaSetIds: [...(combination.metaSetIds ?? [])],
  ranks: [...combination.ranks],
  rarities: [...combination.rarities],
  mainStats: [...(combination.mainStats ?? [])],
  factions: [...(combination.factions ?? [])],
})

// createEmptySafeguardCombination returns an "any" combination for new rule drafts.
export const createEmptySafeguardCombination = (): SafeguardCombination => ({
  slots: [],
  sets: [],
  metaSetIds: [],
  ranks: [],
  rarities: [],
  mainStats: [],
  factions: [],
})

// cloneSafeguardRule keeps history snapshots isolated from live edits.
export const cloneSafeguardRule = (rule: SafeguardRule): SafeguardRule => ({
  // Preserve stable identifiers and scalar fields.
  ...rule,
  // Preserve cascade toggle with explicit default for legacy snapshots.
  ignorePreviousSafeguards: rule.ignorePreviousSafeguards !== false,
  // Preserve equipped filters with explicit defaults for legacy snapshots.
  ignoreEquippedInCollection: rule.ignoreEquippedInCollection === true,
  ignoreEquippedInVault: rule.ignoreEquippedInVault === true,
  // Clone the combination payload so arrays are detached.
  combination: cloneSafeguardCombination(rule.combination),
  // Clone the count mode flags to avoid shared references.
  countMode: { ...rule.countMode },
  // Clone substat selections so edits don't mutate the snapshot.
  substats: [...(rule.substats ?? [])],
  // Keep the substat match scalar aligned with the stored rule.
  substatMatch: rule.substatMatch,
  // Copy weights so ranking edits are isolated.
  substatWeights: { ...(rule.substatWeights ?? {}) },
})

// cloneSafeguardRules clones a list into detached rule objects.
export const cloneSafeguardRules = (rules: readonly SafeguardRule[]): SafeguardRule[] => (
  // Reuse the per-rule clone so behavior stays consistent.
  rules.map((rule) => cloneSafeguardRule(rule))
)

export type SafeguardRule = {
  id: string
  name: string
  combination: SafeguardCombination
  requiredCount: number
  activation: SafeguardRuleActivation
  countMode: SafeguardRuleCountMode
  // True keeps this rule independent from earlier safeguard safeguards.
  ignorePreviousSafeguards: boolean
  // True excludes artifacts equipped on collection champions from matching.
  ignoreEquippedInCollection: boolean
  // True excludes artifacts equipped in vault/reserve-vault from matching.
  ignoreEquippedInVault: boolean
  // Optional substat filters (empty array = any substat).
  substats: StatVariant[]
  // Match behavior for multiple selected substats.
  substatMatch: SafeguardSubstatMatch
  // Per-substat weights for ranked scoring (only non-default values are stored).
  substatWeights: Partial<Record<StatVariant, number>>
}

/** Build the default Safeguard rule list for new sessions (empty by design). */
export function buildDefaultSafeguardRules(): SafeguardRule[] {
  // Keep the list empty so users opt into Safeguard combinations explicitly.
  return []
}

export type SafeguardDetectionArtifact = {
  itemKey: number
  slot: ArtifactTypeId
  set: ArtifactSetId
  rank: RankValue
  rarity: RankValue
  level: LevelMilestone
  exactLevel: number | null
  faction: FactionId
  mainStat: StatVariant
  substats: SafeguardDetectionSubstat[]
}

export type SafeguardDetectionSubstat = {
  variant: StatVariant
  isFlat: boolean
  value: number
}

export type SafeguardDetectionEntry = {
  hash: string
  combination: SafeguardCombination
  ruleId: string | null
  ruleActivation: SafeguardRuleActivation
  // Carry the scope metadata so the UI can explain how totals were derived.
  countMode: SafeguardRuleCountMode
  perGroupRequiredCount: number
  groupsTracked: number
  requiredCount: number
  currentCount: number
  projectedCount: number
  deficit: number
  coveredByExisting: boolean
  itemKeys: number[]
  artifacts: SafeguardDetectionArtifact[]
  placeholders: SafeguardPlaceholderRequest[]
}

export type SafeguardDetectionSnapshot = {
  scannedAt: number
  entries: SafeguardDetectionEntry[]
}

export type SafeguardPlaceholderRequest = {
  combination: SafeguardCombination
  missing: number
  reason: 'global' | 'group'
  // Optional substat filter for per-substat gaps (keeps placeholder rules scoped).
  substatVariants?: StatVariant[]
}

export type SafeguardCandidate = {
  row: TesterPreviewRow
  artifact: NormalizedGearArtifact
  itemKey: number
  groupKey: SafeguardGroupKey
  isSold: boolean
}

export type SafeguardCandidateSnapshot = {
  candidates: SafeguardCandidate[]
  uniqueItemKeys: ReadonlySet<number>
}

export type SafeguardsMergeInput = {
  enabled: boolean
  rules: readonly SafeguardRule[]
  detection?: SafeguardDetectionSnapshot | null
}

/**
 * True when the master toggle is on and at least one rule is enabled.
 * Used by pipeline callers to avoid unnecessary detection passes.
 */
export const hasActiveSafeguardRules = (input: SafeguardsMergeInput | null | undefined): boolean => {
  if (!input || input.enabled !== true) return false
  if (!Array.isArray(input.rules) || input.rules.length === 0) return false
  return input.rules.some((rule) => rule && isSafeguardRuleActive(rule))
}

export type SafeguardDetectionParams = {
  candidates: readonly SafeguardCandidate[]
  rules: readonly SafeguardRule[]
  enabled: boolean
  now?: number
}

export type SafeguardCollectAndDetectParams = {
  rows: readonly TesterPreviewRow[]
  baseRules: readonly HsfRuleWithRecipe[]
  recipeModes: SellfileExportMode[]
  rules: readonly SafeguardRule[]
  enabled: boolean
  now?: number
  ignoreSafeguardRecipeIndices?: ReadonlySet<number>
}

export type SafeguardCollectAndDetectSnapshot = {
  candidates: SafeguardCandidateSnapshot
  detection: SafeguardDetectionSnapshot
}

/** Generate a short, unique id for combination rules. */
export function createSafeguardRuleId(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `ku_${Date.now().toString(36)}_${rand}`
}

/** Canonical hash for combination comparisons and metadata lookups. */
export function hashSafeguardCombination(combination: SafeguardCombination): string {
  // Delegate canonical hash construction to wasm so TS does not duplicate rules.
  return hashSafeguardCombinationWithLoadedWasm(combination)
}

// Name lookups keep SFR tuple fields readable while still resolving back to
// enum IDs from TS domain constants (single source of truth for label -> id).
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

// Rarity labels in readable SFR payloads resolve through this reverse map.
const rarityCodeByName = new Map<string, RankValue>(
  Object.entries(rarityNames)
    .filter(([, name]) => Boolean(name && name.trim()))
    .map(([id, name]) => [name.trim().toLowerCase(), Math.max(RANK_VALUE_MIN, Math.min(RANK_VALUE_MAX, Number(id))) as RankValue]),
)

// buildNormalizedSafeguardRuleId keeps generated ids deterministic per call
// while preserving existing random-prefix behavior across imports/paste.
const buildNormalizedSafeguardRuleId = (): string => {
  return createSafeguardRuleId()
}

// Narrow unknown values before property reads so normalization stays type-safe.
const toRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' ? value as Record<string, unknown> : null
)

// Floor finite number-like values so parsing mirrors JS Number()+floor semantics.
const toFiniteFloor = (value: unknown): number | null => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.floor(numeric)
}

// Legacy safeguard toggles treated non-empty strings as true in snapshots.
const toBoolish = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0
  if (typeof value === 'string') return value.trim().length > 0
  return null
}

// Rank/rarity coercion accepts readable labels, starred labels, or numeric ids.
const parseRankOrRarity = (value: unknown): RankValue | null => {
  if (value == null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const mapped = rarityCodeByName.get(trimmed.toLowerCase())
    if (mapped != null) return mapped
    const digits = trimmed.match(/\d+/g)?.join('') ?? ''
    if (digits) {
      const parsedDigits = Number(digits)
      if (Number.isFinite(parsedDigits)) {
        return Math.max(RANK_VALUE_MIN, Math.min(RANK_VALUE_MAX, Math.floor(parsedDigits))) as RankValue
      }
    }
    const parsedNumeric = toFiniteFloor(trimmed)
    if (parsedNumeric != null) {
      return Math.max(RANK_VALUE_MIN, Math.min(RANK_VALUE_MAX, parsedNumeric)) as RankValue
    }
    return RANK_VALUE_MAX as RankValue
  }
  const parsed = toFiniteFloor(value)
  if (parsed != null) return Math.max(RANK_VALUE_MIN, Math.min(RANK_VALUE_MAX, parsed)) as RankValue
  return RANK_VALUE_MAX as RankValue
}

// Parse readable/legacy stat labels first, then numeric variants.
const parseStatVariant = (value: unknown): StatVariant => {
  if (typeof value === 'string') {
    const fromLabel = variantFromLabel(value)
    if (fromLabel != null) return fromLabel
  }
  const numeric = toFiniteFloor(value)
  if (numeric == null || numeric < 0) return StatVariantEnum.Any as StatVariant
  return numeric as StatVariant
}

// Dedup + lexical ordering keeps metaset ids stable for hashing and exports.
const sortUniqueMetaSetIds = (values: string[]): string[] => {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

// Shared recursive walker keeps legacy nested-array payload support centralized.
const collectRecursive = (value: unknown, collectLeaf: (leaf: unknown) => void): void => {
  if (Array.isArray(value)) {
    for (const nested of value) collectRecursive(nested, collectLeaf)
    return
  }
  collectLeaf(value)
}

// Named-or-numeric parser is reused by slot/set/faction readers.
const parseNamedOrNumeric = (value: unknown, lookup: ReadonlyMap<string, number>): number | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    if (!trimmed) return null
    const mapped = lookup.get(trimmed)
    if (mapped != null) return mapped
  }
  return toFiniteFloor(value)
}

// Parse readable set selections while preserving include/exclude precedence.
const parseSetSelections = (value: unknown): ArtifactSetSelectionEntry[] => {
  const collected: ArtifactSetSelectionEntry[] = []
  collectRecursive(value, (leaf) => {
    const record = toRecord(leaf)
    if (record) {
      const source = record.id ?? record.setId ?? record.name ?? record.label
      const parsedId = parseNamedOrNumeric(source, artifactSetIdByName)
      if (parsedId == null) return
      collected.push(record.excluded === true
        ? { id: parsedId as ArtifactSetId, excluded: true }
        : { id: parsedId as ArtifactSetId })
      return
    }
    const parsed = parseNamedOrNumeric(leaf, artifactSetIdByName)
    if (parsed == null) return
    collected.push({ id: parsed as ArtifactSetId })
  })
  return normalizeArtifactSetSelections(collected)
}

// Normalized weight helper keeps legacy values clamped to the canonical range.
const normalizeSubstatWeight = (value: unknown): number => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return SAFEGUARD_WEIGHT_DEFAULT
  const clamped = Math.max(SAFEGUARD_WEIGHT_MIN, Math.min(SAFEGUARD_WEIGHT_MAX, numeric))
  const stepped = Math.round(clamped / SAFEGUARD_WEIGHT_STEP) * SAFEGUARD_WEIGHT_STEP
  return Math.round(stepped * 100) / 100
}

// Parse optional substat weighting maps from readable or legacy rule payloads.
const parseSubstatWeights = (value: unknown): Partial<Record<StatVariant, number>> => {
  const record = toRecord(value)
  if (!record) return {}
  const out: Partial<Record<StatVariant, number>> = {}
  for (const [rawKey, rawValue] of Object.entries(record)) {
    const variant = parseStatVariant(rawKey)
    if (variant === StatVariantEnum.Any || variant === StatVariantEnum.RollCount) continue
    const normalized = normalizeSubstatWeight(rawValue)
    if (normalized === SAFEGUARD_WEIGHT_DEFAULT) continue
    out[variant] = normalized
  }
  return out
}

// Readable exports may wrap rules as `{ kind: 'safeguardRule', rule: {...} }`.
const unwrapSafeguardRuleRecord = (value: unknown): Record<string, unknown> | null => {
  const record = toRecord(value)
  if (!record) return null
  const hasRuleShape = (
    'combination' in record
    || 'tuple' in record
    || 'requiredCount' in record
    || 'countMode' in record
  )
  if (!hasRuleShape) {
    const nestedRule = toRecord(record.rule)
    if (nestedRule) return nestedRule
  }
  return record
}

// sortSafeguardSubstats keeps substat selections aligned with app-wide stat priority.
export const sortSafeguardSubstats = (values: readonly StatVariant[]): StatVariant[] => (
  // Delegate sorting to wasm so TS does not duplicate priority/dedupe behavior.
  sortSafeguardSubstatsWithLoadedWasm(values).map((value) => Number(value) as StatVariant)
)

// sortSafeguardCombination enforces stable ordering across every safeguard filter.
export const sortSafeguardCombination = (combination: SafeguardCombination): SafeguardCombination => ({
  // Delegate full combination sorting to wasm so TS does not duplicate rules.
  ...(sortSafeguardCombinationWithLoadedWasm(combination)),
})

/** Normalize combination payloads loaded from SFR/autosave. */
export function normalizeSafeguardCombination(value: unknown): SafeguardCombination | null {
  const record = toRecord(value)
  if (!record) return null
  const slots: ArtifactTypeId[] = []
  const ranks: RankValue[] = []
  const rarities: RankValue[] = []
  const mainStats: StatVariant[] = []
  const factions: FactionId[] = []
  const metaSetIds: string[] = []

  collectRecursive(record.slots, (leaf) => {
    const parsed = parseNamedOrNumeric(leaf, artifactTypeIdByName)
    if (parsed == null) return
    slots.push(parsed as ArtifactTypeId)
  })
  collectRecursive(record.ranks, (leaf) => {
    const parsed = parseRankOrRarity(leaf)
    if (parsed == null) return
    ranks.push(parsed)
  })
  collectRecursive(record.rarities, (leaf) => {
    const parsed = parseRankOrRarity(leaf)
    if (parsed == null) return
    rarities.push(parsed)
  })
  collectRecursive(record.mainStats, (leaf) => {
    const parsed = parseStatVariant(leaf)
    if (parsed === StatVariantEnum.Any) return
    mainStats.push(parsed)
  })
  collectRecursive(record.factions, (leaf) => {
    if (typeof leaf === 'string' && leaf.trim().length === 0) return
    const parsed = parseNamedOrNumeric(leaf, factionIdByName)
    if (parsed == null) return
    factions.push(parsed as FactionId)
  })
  collectRecursive(record.metaSetIds, (leaf) => {
    if (typeof leaf !== 'string') return
    const trimmed = leaf.trim()
    if (!trimmed) return
    metaSetIds.push(trimmed)
  })
  collectRecursive(record.metaSets, (leaf) => {
    if (typeof leaf !== 'string') return
    const trimmed = leaf.trim()
    if (!trimmed) return
    metaSetIds.push(trimmed)
  })

  return {
    slots: Array.from(new Set(slots)).sort((left, right) => compareArtifactTypes(left, right)),
    sets: parseSetSelections(record.sets),
    metaSetIds: sortUniqueMetaSetIds(metaSetIds),
    ranks: Array.from(new Set(ranks)).sort((a, b) => a - b),
    rarities: Array.from(new Set(rarities)).sort((a, b) => a - b),
    mainStats: sortSafeguardSubstats(Array.from(new Set(mainStats))),
    factions: Array.from(new Set(factions)).sort((a, b) => a - b),
  }
}

/** Normalize rule payloads; returns null when combination data is invalid. */
export function normalizeSafeguardRule(value: unknown): SafeguardRule | null {
  const record = unwrapSafeguardRuleRecord(value)
  if (!record) return null
  const generatedRuleId = buildNormalizedSafeguardRuleId()
  const combinationSource = record.combination ?? record.tuple ?? value
  const combination = normalizeSafeguardCombination(combinationSource)
  if (!combination) return null

  const explicitId = typeof record.id === 'string' ? record.id.trim() : ''
  const id = explicitId || generatedRuleId
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const requiredCount = Math.max(1, toFiniteFloor(record.requiredCount) ?? 1)
  const countMode = (
    Object.prototype.hasOwnProperty.call(record, 'countMode')
      ? normalizeSafeguardCountMode(record.countMode)
      : sanitizeCountMode(SAFEGUARD_DEFAULT_COUNT_MODE)
  )

  const parsedSubstats = (() => {
    const out: StatVariant[] = []
    const collectFrom = (source: unknown): void => {
      collectRecursive(source, (leaf) => {
        const parsed = parseStatVariant(leaf)
        if (parsed === StatVariantEnum.Any || parsed === StatVariantEnum.RollCount) return
        out.push(parsed)
      })
    }
    collectFrom(record.substats)
    if (out.length === 0) collectFrom(record.substatTargets)
    if (out.length === 0) collectFrom(record.substat)
    return sortSafeguardSubstats(Array.from(new Set(out)))
  })()
  const parsedSubstatMatch = (
    Object.prototype.hasOwnProperty.call(record, 'substatMatch')
      ? normalizeSafeguardSubstatMatch(record.substatMatch)
      : SafeguardSubstatMatch.Any
  )
  const substatMatch = parsedSubstats.length === 0 ? SafeguardSubstatMatch.Any : parsedSubstatMatch

  const weightsSource = (
    Object.prototype.hasOwnProperty.call(record, 'substatWeights')
      ? record.substatWeights
      : record.substatWeighting
  )
  return {
    id,
    name,
    combination,
    requiredCount,
    activation: normalizeSafeguardActivation(record.activation),
    countMode,
    ignorePreviousSafeguards: toBoolish(record.ignorePreviousSafeguards) ?? SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS,
    ignoreEquippedInCollection: toBoolish(record.ignoreEquippedInCollection) ?? SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION,
    ignoreEquippedInVault: toBoolish(record.ignoreEquippedInVault) ?? SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT,
    substats: parsedSubstats,
    substatMatch,
    substatWeights: parseSubstatWeights(weightsSource),
  }
}

/** Shared helper for mapping tester artifacts to the detection item key. */
export function getSafeguardItemKey(artifact: NormalizedGearArtifact): number {
  // Delegate item-key derivation to wasm so TS does not duplicate fallback rules.
  return getSafeguardItemKeyWithLoadedWasm(artifact)
}

export type SafeguardGroupKey = string

/** Hash representing the slot+set+main+faction group used for uniqueness filtering. */
export function getSafeguardGroupKey(artifact: NormalizedGearArtifact): SafeguardGroupKey {
  // Delegate group-key derivation to wasm so TS does not duplicate slot/faction rules.
  return getSafeguardGroupKeyWithLoadedWasm(artifact)
}

type SafeguardCountKey = string

export const getSafeguardCountKey = (artifact: NormalizedGearArtifact, mode: SafeguardRuleCountMode): SafeguardCountKey => {
  // Keep key derivation in wasm so JS cannot drift from detection semantics.
  const normalizedMode = sanitizeCountMode(mode)
  // Slot drives faction normalization because non-accessories always use faction 0.
  const slot = Number(artifact.slot)
  const faction = isAccessorySlot(slot) ? Number(artifact.faction ?? 0) : 0
  // Main stat is encoded as StatVariant number; missing maps to Any sentinel.
  const mainStat = Number(artifact.mainStat?.variant ?? StatVariantEnum.Any)
  // Delegate final key construction to wasm (single source of truth).
  return getSafeguardCountKeyWithLoadedWasm({
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

type SafeguardWasmExpectedGroupDomainPayload = {
  slotOrder: ArtifactTypeId[]
  accessoryCompatibleSetIds: ArtifactSetId[]
  armorCompatibleSetIds: ArtifactSetId[]
  allowedMainBySlot: Record<string, StatVariant[]>
  allFactionIds: FactionId[]
}

// Build a compact domain payload so wasm can enumerate expected scope groups
// without duplicating TS-only catalogs or runtime set expansion logic.
const buildSafeguardExpectedGroupDomain = (): SafeguardWasmExpectedGroupDomainPayload => {
  // Serialize slot->main map as plain arrays so wasm can normalize ordering.
  const allowedMainBySlot: Record<string, StatVariant[]> = {}
  for (const [slotKey, allowed] of Object.entries(ALLOWED_MAIN_BY_SLOT)) {
    allowedMainBySlot[String(slotKey)] = Array.from(allowed) as StatVariant[]
  }
  // Build a raw domain snapshot and let wasm apply canonical sorting/dedupe.
  const rawDomain: SafeguardWasmExpectedGroupDomainPayload = {
    slotOrder: PREFERRED_ARTIFACT_TYPE_ORDER.map((value) => Number(value) as ArtifactTypeId),
    accessoryCompatibleSetIds: getAccessorySlotsCompatibleSetIds().map((value) => Number(value) as ArtifactSetId),
    armorCompatibleSetIds: resolveArmorCompatibleSetIds().map((value) => Number(value) as ArtifactSetId),
    allowedMainBySlot,
    allFactionIds: ALL_FACTION_IDS.slice(),
  }
  return normalizeSafeguardExpectedGroupDomainWithLoadedWasm(rawDomain)
}

const isSafeguardDetectionSnapshot = (value: unknown): value is SafeguardDetectionSnapshot => (
  value != null
  && typeof value === 'object'
  && Array.isArray((value as { entries?: unknown }).entries)
)

export function collectSafeguardCandidates(params: {
  rows: readonly TesterPreviewRow[]
  baseRules: readonly HsfRuleWithRecipe[]
  recipeModes: SellfileExportMode[]
  ignoreSafeguardRecipeIndices?: ReadonlySet<number>
}): SafeguardCandidateSnapshot {
  const { rows, baseRules, recipeModes } = params
  // Allow safeguard detection to skip recipes that only protect rework fodder.
  const ignoreRecipeSet = params.ignoreSafeguardRecipeIndices && params.ignoreSafeguardRecipeIndices.size > 0
    ? params.ignoreSafeguardRecipeIndices
    : null
  if (!rows.length) return { candidates: [], uniqueItemKeys: new Set() }
  const baseRuleList: HsfRuleWithRecipe[] = Array.isArray(baseRules) ? [...baseRules] : []
  // Pass canonical preview rows and let wasm derive matcher keys/flags.
  // WASM-first candidate snapshot keeps collection semantics in Rust.
  try {
    const snapshot = collectSafeguardCandidatesWithLoadedWasm({
      rows,
      rules: baseRuleList,
      recipeModes,
      ...(ignoreRecipeSet ? { ignoreSafeguardRecipeIndices: ignoreRecipeSet } : {}),
    })
    const candidates: SafeguardCandidate[] = snapshot.candidates.map((entry) => {
      const row = rows[entry.rowIndex]!
      return {
        row,
        artifact: row.artifact,
        itemKey: entry.itemKey,
        groupKey: entry.groupKey,
        isSold: entry.isSold === true,
      }
    })
    const uniqueItemKeys = new Set<number>(snapshot.uniqueItemKeys.map((value) => Number(value)))
    return { candidates, uniqueItemKeys }
  } catch (error) {
    // Keep the error actionable so callers know warmup/compat requirements.
    throw new Error(`WASM safeguard candidate collection is unavailable: ${String(error)}`)
  }
}

// Combined safeguard helper runs collect + detect in one wasm roundtrip.
// Callers that need both outputs should prefer this over two separate calls.
export function collectAndComputeSafeguardProtection(
  params: SafeguardCollectAndDetectParams,
): SafeguardCollectAndDetectSnapshot {
  const { rows, baseRules, recipeModes, rules, enabled, now } = params
  const ignoreRecipeSet = params.ignoreSafeguardRecipeIndices && params.ignoreSafeguardRecipeIndices.size > 0
    ? params.ignoreSafeguardRecipeIndices
    : null
  const timestamp = Number.isFinite(now) ? Number(now) : Date.now()
  if (!rows.length) {
    return {
      candidates: { candidates: [], uniqueItemKeys: new Set() },
      detection: { scannedAt: timestamp, entries: [] },
    }
  }
  const baseRuleList: HsfRuleWithRecipe[] = Array.isArray(baseRules) ? [...baseRules] : []
  // Pass canonical rows/rules and let wasm produce the detection payload.
  const combined = collectAndComputeSafeguardProtectionWithLoadedWasm({
    rows,
    rules: baseRuleList,
    recipeModes,
    ...(ignoreRecipeSet ? { ignoreSafeguardRecipeIndices: ignoreRecipeSet } : {}),
    safeguardRules: rules,
    expectedGroupDomain: buildSafeguardExpectedGroupDomain(),
    enabled,
    now: timestamp,
  })
  // Reattach UI row references on the TS side for compatibility.
  const candidates: SafeguardCandidate[] = combined.candidates.map((entry) => {
    const row = rows[entry.rowIndex]!
    return {
      row,
      artifact: row.artifact,
      itemKey: entry.itemKey,
      groupKey: entry.groupKey,
      isSold: entry.isSold === true,
    }
  })
  const uniqueItemKeys = new Set<number>(combined.uniqueItemKeys.map((value) => Number(value)))
  if (!isSafeguardDetectionSnapshot(combined.detection)) {
    throw new Error('WASM safeguard combined pipeline returned an invalid detection payload.')
  }
  return {
    candidates: { candidates, uniqueItemKeys },
    detection: combined.detection,
  }
}

/** Compute Safeguard combination coverage against the candidate sold rows. */
/** Compute Safeguard combination coverage against the candidate sold rows. */
export function computeSafeguardProtection(params: SafeguardDetectionParams): SafeguardDetectionSnapshot {
  const { candidates, rules, enabled, now } = params
  const timestamp = Number.isFinite(now) ? Number(now) : Date.now()
  // Wasm derives expected groups from the shared domain payload (SSOT path).
  const wasmSnapshot = computeSafeguardProtectionWithLoadedWasm({
    candidates,
    rules,
    expectedGroupDomain: buildSafeguardExpectedGroupDomain(),
    enabled,
    now: timestamp,
  })
  if (isSafeguardDetectionSnapshot(wasmSnapshot)) {
    return wasmSnapshot
  }
  throw new Error('WASM safeguard detection returned an invalid payload.')
}

export function resolveSafeguardRulesWithMetasets<T extends { combination: SafeguardCombination }>(
  rules: readonly T[],
  metasets: readonly Metaset[],
): T[] {
  // Delegate metaset expansion to wasm so include/exclude precedence is SSOT.
  return resolveSafeguardRulesWithMetasetsWithLoadedWasm(rules, metasets)
}

type SafeguardLabelSource = SafeguardRule | HsfRuleWithRecipe | null | undefined

/**
 * Resolve the label to display for a Safeguard rule or injected row.
 * Prefers trimmed rule names, then falls back to a `#id` sentinel when blank.
 */
// Lookup tables map HSF rank/rarity codes to arrays of discrete RankValues.
// Using explicit tables avoids arithmetic that breaks for non-sequential rarity codes.
// Keys use the RankCode/RarityCode named constants (SSOT from types.ts).
const RANK_CODE_TO_VALUES: Readonly<Partial<Record<number, readonly RankValue[]>>> = {
  [RankCode.Any]:     [],
  [RankCode.One]:     [1],
  [RankCode.Two]:     [2],
  [RankCode.Three]:   [3],
  [RankCode.Four]:    [4],
  [RankCode.Five]:    [5],
  [RankCode.Six]:     [6],
  [RankCode.GTE_One]:   [1,2,3,4,5,6],
  [RankCode.GTE_Two]:   [2,3,4,5,6],
  [RankCode.GTE_Three]: [3,4,5,6],
  [RankCode.GTE_Four]:  [4,5,6],
  [RankCode.GTE_Five]:  [5,6],
  [RankCode.LTE_Two]:   [1,2],
  [RankCode.LTE_Three]: [1,2,3],
  [RankCode.LTE_Four]:  [1,2,3,4],
  [RankCode.LTE_Five]:  [1,2,3,4,5],
  [RankCode.LTE_Six]:   [1,2,3,4,5,6],
}

const RARITY_CODE_TO_VALUES: Readonly<Partial<Record<number, readonly RankValue[]>>> = {
  [RarityCode.Any]:           [],
  [RarityCode.Common]:        [1],
  [RarityCode.Uncommon]:      [2],
  [RarityCode.Rare]:          [3],
  [RarityCode.Epic]:          [4],
  [RarityCode.Legendary]:     [5],
  [RarityCode.Mythical]:      [6],
  [RarityCode.GTE_Common]:    [1,2,3,4,5,6],
  [RarityCode.GTE_Uncommon]:  [2,3,4,5,6],
  [RarityCode.GTE_Rare]:      [3,4,5,6],
  [RarityCode.GTE_Epic]:      [4,5,6],
  [RarityCode.GTE_Legendary]: [5,6],
  [RarityCode.LTE_Uncommon]:  [1,2],
  [RarityCode.LTE_Rare]:      [1,2,3],
  [RarityCode.LTE_Epic]:      [1,2,3,4],
  [RarityCode.LTE_Legendary]: [1,2,3,4,5],
  [RarityCode.LTE_Mythical]:  [1,2,3,4,5,6],
}

/**
 * Derive a SafeguardCombination from an existing BuilderRecipe.
 * Rank/rarity codes are expanded to discrete RankValue arrays;
 * factionCode is lifted into a single-element factions array (or empty if Any).
 * Substat and roll-bounds info is intentionally not mapped — safeguards work
 * by slot/set/stat presence, not by roll requirements.
 */
export function buildSafeguardCombinationFromRecipe(recipe: BuilderRecipe): SafeguardCombination {
  // Expand single rank code to an array of matching star values.
  const ranks = [...(RANK_CODE_TO_VALUES[recipe.rankCode] ?? [])] as RankValue[]
  // Resolve effective rarity: auto mode derives the code from substat requirements.
  const effectiveRarityCode = (recipe.rarityMode === 'auto') ? resolveAutoRarityCode(recipe) : recipe.rarityCode
  const rarities = [...(RARITY_CODE_TO_VALUES[effectiveRarityCode] ?? [])] as RankValue[]
  // Faction 0 means Any; lift non-zero codes to a single-element array.
  const factions: FactionId[] = (recipe.factionCode && recipe.factionCode > 0)
    ? [recipe.factionCode]
    : []
  return sortSafeguardCombination({
    slots: [...(recipe.artifactTypes ?? [])],
    sets: [...(recipe.artifactSets ?? [])],
    metaSetIds: [...(recipe.artifactMetaSets ?? [])],
    ranks,
    rarities,
    mainStats: [...(recipe.mainStatsV ?? [])],
    factions,
  })
}

export function resolveSafeguardRuleLabel(source: SafeguardLabelSource): string | null {
  if (!source) return null
  const rawName = 'name' in source ? source.name : source.RecipeName
  const normalizedName = normalizeRecipeName(rawName ?? null)
  if (normalizedName) return normalizedName
  const ordinal = ((): number | null => {
    if (typeof source !== 'object' || source === null) return null
    if ('__safeguardRuleOrdinal' in source) {
      const value = Number((source as { __safeguardRuleOrdinal?: number }).__safeguardRuleOrdinal)
      if (Number.isFinite(value) && value > 0) return value
    }
    return null
  })()
  if (ordinal) return `#${ordinal}`
  const fallbackId = 'name' in source ? source.id : source.__safeguardRuleId
  if (typeof fallbackId === 'string') {
    const trimmed = fallbackId.trim()
    if (trimmed.length > 0) return `#${trimmed}`
  }
  return null
}
