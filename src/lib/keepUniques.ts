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
  artifactSetNames,
  artifactTypeNames,
  compareArtifactSets,
  factionNames,
  getArmorFixedSetIds,
  getArmorVariableSetIds,
  getAccessorySlotsCompatibleSetIds,
  rarityNames,
} from './types'
import type { BuilderConfig, SellfileExportMode } from './hsfBuilder'
import type { HsfRuleWithCfg } from './merge'
import type { NormalizedGearArtifact } from './importers/gearDbNormalizer'
import type { Metaset } from './metasets'
import { normalizeConfigName } from './ruleConfigIndex'
import type { ArtifactSetSelectionEntry } from './gearSets/selection'
import { hasIgnoreKeepUniqueTag } from './tagHelpers'
import {
  collectAndComputeKeepUniqueProtectionWithLoadedWasm,
  collectKeepUniqueCandidatesWithLoadedWasm,
  computeKeepUniqueProtectionWithLoadedWasm,
  getKeepUniqueGroupKeyWithLoadedWasm,
  getKeepUniqueItemKeyWithLoadedWasm,
  getKeepUniqueCountKeyWithLoadedWasm,
  hashKeepUniqueCombinationWithLoadedWasm,
  normalizeKeepUniqueActivationWithLoadedWasm,
  normalizeKeepUniqueCombinationWithLoadedWasm,
  normalizeKeepUniqueCountModeWithLoadedWasm,
  normalizeKeepUniqueExpectedGroupDomainWithLoadedWasm,
  normalizeKeepUniqueRuleWithLoadedWasm,
  normalizeKeepUniqueSubstatMatchWithLoadedWasm,
  resolveKeepUniqueRulesWithMetasetsWithLoadedWasm,
  sortKeepUniqueCombinationWithLoadedWasm,
  sortKeepUniqueSubstatsWithLoadedWasm,
} from './wasm/wasmRuleEngine'
import {
  KEEP_UNIQUE_ACTIVATION_ANTICIPATE_GAPS,
  KEEP_UNIQUE_ACTIVATION_OFF,
  KEEP_UNIQUE_ACTIVATION_PROTECT_EXISTING,
  KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_FACTION,
  KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_MAIN_STAT,
  KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_RULE,
  KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_SET,
  KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_SLOT,
  KEEP_UNIQUE_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION as KEEP_UNIQUE_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION_CONST,
  KEEP_UNIQUE_DEFAULT_IGNORE_EQUIPPED_IN_VAULT as KEEP_UNIQUE_DEFAULT_IGNORE_EQUIPPED_IN_VAULT_CONST,
  KEEP_UNIQUE_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS as KEEP_UNIQUE_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS_CONST,
  KEEP_UNIQUE_SUBSTAT_ALL,
  KEEP_UNIQUE_SUBSTAT_ANY,
  KEEP_UNIQUE_SUBSTAT_PER_SUBSTAT,
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
  perRule: KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_RULE,
  perSet: KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_SET,
  perFaction: KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_FACTION,
  perMainStat: KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_MAIN_STAT,
  perSlot: KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_SLOT,
}

// Default toggle keeps rule evaluation independent from earlier safeguards.
export const KEEP_UNIQUE_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS =
  KEEP_UNIQUE_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS_CONST
// Equipped-ignore toggles default off so current behavior is preserved.
export const KEEP_UNIQUE_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION =
  KEEP_UNIQUE_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION_CONST
export const KEEP_UNIQUE_DEFAULT_IGNORE_EQUIPPED_IN_VAULT =
  KEEP_UNIQUE_DEFAULT_IGNORE_EQUIPPED_IN_VAULT_CONST

export const KeepUniqueRuleActivation = {
  Off: KEEP_UNIQUE_ACTIVATION_OFF,
  ProtectExisting: KEEP_UNIQUE_ACTIVATION_PROTECT_EXISTING,
  AnticipateGaps: KEEP_UNIQUE_ACTIVATION_ANTICIPATE_GAPS,
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
  Any: KEEP_UNIQUE_SUBSTAT_ANY,
  All: KEEP_UNIQUE_SUBSTAT_ALL,
  PerSubstat: KEEP_UNIQUE_SUBSTAT_PER_SUBSTAT,
} as const

// eslint-disable-next-line no-redeclare -- allow constant/type pair
export type KeepUniqueSubstatMatch =
  (typeof KeepUniqueSubstatMatch)[keyof typeof KeepUniqueSubstatMatch]

// normalizeKeepUniqueActivation keeps activation parsing consistent across keep-override rules.
export const normalizeKeepUniqueActivation = (
  value: unknown,
  legacyEnabled?: unknown,
): KeepUniqueRuleActivation => {
  // Delegate token coercion to wasm so TS does not duplicate alias parsing rules.
  const normalized = normalizeKeepUniqueActivationWithLoadedWasm(value, legacyEnabled)
  // Keep the public union return type strict and fail closed on unknown payloads.
  if (KEEP_UNIQUE_RULE_ACTIVATION_VALUES.has(normalized as KeepUniqueRuleActivation)) {
    return normalized as KeepUniqueRuleActivation
  }
  throw new Error('WASM keep-unique activation normalizer returned an unexpected token.')
}

// normalizeKeepUniqueSubstatMatch keeps matching choices stable and case-insensitive.
export const normalizeKeepUniqueSubstatMatch = (value: unknown): KeepUniqueSubstatMatch => {
  // Delegate token coercion to wasm so TS does not duplicate alias parsing rules.
  const normalized = normalizeKeepUniqueSubstatMatchWithLoadedWasm(value)
  // Keep the public union return type strict and fail closed on unknown payloads.
  if (normalized === KeepUniqueSubstatMatch.Any) return KeepUniqueSubstatMatch.Any
  if (normalized === KeepUniqueSubstatMatch.All) return KeepUniqueSubstatMatch.All
  if (normalized === KeepUniqueSubstatMatch.PerSubstat) return KeepUniqueSubstatMatch.PerSubstat
  throw new Error('WASM keep-unique substat-match normalizer returned an unexpected token.')
}

export const isKeepUniqueRuleActive = (rule: KeepUniqueRule): boolean => (
  rule.activation !== KeepUniqueRuleActivation.Off
)

const sanitizeCountMode = (raw: Partial<KeepUniqueRuleCountMode> | null | undefined): KeepUniqueRuleCountMode => {
  // Delegate default + sanitize logic to wasm so TS does not duplicate mode rules.
  const normalized = normalizeKeepUniqueCountModeWithLoadedWasm(raw)
  // Preserve the local structural type used across UI + worker payloads.
  return {
    perRule: normalized.perRule === true,
    perSet: normalized.perSet === true,
    perFaction: normalized.perFaction === true,
    perMainStat: normalized.perMainStat === true,
    perSlot: normalized.perSlot === true,
  }
}

// normalizeKeepUniqueCountMode parses legacy payloads into the canonical scope-chip shape.
export const normalizeKeepUniqueCountMode = (value: unknown): KeepUniqueRuleCountMode => {
  // Delegate default + sanitize logic to wasm so TS does not duplicate mode rules.
  return sanitizeCountMode(value as Partial<KeepUniqueRuleCountMode> | null | undefined)
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
  // Preserve cascade toggle with explicit default for legacy snapshots.
  ignorePreviousSafeguards: rule.ignorePreviousSafeguards !== false,
  // Preserve equipped filters with explicit defaults for legacy snapshots.
  ignoreEquippedInCollection: rule.ignoreEquippedInCollection === true,
  ignoreEquippedInVault: rule.ignoreEquippedInVault === true,
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
  // True keeps this rule independent from earlier keep-unique safeguards.
  ignorePreviousSafeguards: boolean
  // True excludes artifacts equipped on collection champions from matching.
  ignoreEquippedInCollection: boolean
  // True excludes artifacts equipped in vault/reserve-vault from matching.
  ignoreEquippedInVault: boolean
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

export type KeepUniqueCollectAndDetectParams = {
  rows: readonly TesterPreviewRow[]
  baseRules: readonly HsfRuleWithCfg[]
  configModes: SellfileExportMode[]
  rules: readonly KeepUniqueRule[]
  enabled: boolean
  now?: number
  ignoreKeepUniqueConfigIndices?: ReadonlySet<number>
}

export type KeepUniqueCollectAndDetectSnapshot = {
  candidates: KeepUniqueCandidateSnapshot
  detection: KeepUniqueDetectionSnapshot
}

/** Generate a short, unique id for combination rules. */
export function createKeepUniqueRuleId(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `ku_${Date.now().toString(36)}_${rand}`
}

/** Canonical hash for combination comparisons and metadata lookups. */
export function hashKeepUniqueCombination(combination: KeepUniqueCombination): string {
  // Delegate canonical hash construction to wasm so TS does not duplicate rules.
  return hashKeepUniqueCombinationWithLoadedWasm(combination)
}

// Name lookups keep HSFC tuple fields readable while still resolving back to
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

// Rarity labels in readable HSFC payloads resolve through this reverse map.
const rarityCodeByName = new Map<string, RankValue>(
  Object.entries(rarityNames)
    .filter(([, name]) => Boolean(name && name.trim()))
    .map(([id, name]) => [name.trim().toLowerCase(), Math.max(RANK_VALUE_MIN, Math.min(RANK_VALUE_MAX, Number(id))) as RankValue]),
)

// Keep lookup-record conversion in one helper so wasm payload shape remains
// stable whenever we add/adjust normalization lookups.
const toKeepUniqueLookupRecord = (values: ReadonlyMap<string, number>): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const [key, value] of values.entries()) {
    const trimmed = key.trim().toLowerCase()
    if (!trimmed) continue
    if (!Number.isFinite(value)) continue
    out[trimmed] = Math.floor(value)
  }
  return out
}

// Readable HSFC lookups stay sourced from TS constants while recursive parsing
// moves to wasm. Stat-variant labels are handled in Rust with TS-parity aliases.
const KEEP_UNIQUE_NORMALIZATION_LOOKUPS = Object.freeze({
  artifactTypeIdsByName: toKeepUniqueLookupRecord(artifactTypeIdByName),
  artifactSetIdsByName: toKeepUniqueLookupRecord(artifactSetIdByName),
  factionIdsByName: toKeepUniqueLookupRecord(factionIdByName),
  rarityCodesByName: toKeepUniqueLookupRecord(rarityCodeByName),
  statVariantIdsByLabel: {},
})

// buildNormalizedKeepUniqueRuleId keeps generated ids deterministic per call
// while still letting wasm own the rest of the rule normalization logic.
const buildNormalizedKeepUniqueRuleId = (): string => {
  return createKeepUniqueRuleId()
}

// sortKeepUniqueSubstats keeps substat selections aligned with app-wide stat priority.
export const sortKeepUniqueSubstats = (values: readonly StatVariant[]): StatVariant[] => (
  // Delegate sorting to wasm so TS does not duplicate priority/dedupe behavior.
  sortKeepUniqueSubstatsWithLoadedWasm(values).map((value) => Number(value) as StatVariant)
)

// sortKeepUniqueCombination enforces stable ordering across every keep-unique filter.
export const sortKeepUniqueCombination = (combination: KeepUniqueCombination): KeepUniqueCombination => ({
  // Delegate full combination sorting to wasm so TS does not duplicate rules.
  ...(sortKeepUniqueCombinationWithLoadedWasm(combination)),
})

/** Normalize combination payloads loaded from HSFC/autosave. */
export function normalizeKeepUniqueCombination(value: unknown): KeepUniqueCombination | null {
  // Delegate normalization to wasm so recursive tuple parsing is SSOT in Rust.
  return normalizeKeepUniqueCombinationWithLoadedWasm<KeepUniqueCombination>(
    value,
    KEEP_UNIQUE_NORMALIZATION_LOOKUPS,
  )
}

/** Normalize rule payloads; returns null when combination data is invalid. */
export function normalizeKeepUniqueRule(value: unknown): KeepUniqueRule | null {
  // Generate fallback id in TS so rule ids keep the same prefix/time randomness.
  const generatedRuleId = buildNormalizedKeepUniqueRuleId()
  // Delegate normalization to wasm so recursive rule parsing is SSOT in Rust.
  return normalizeKeepUniqueRuleWithLoadedWasm<KeepUniqueRule>(
    value,
    KEEP_UNIQUE_NORMALIZATION_LOOKUPS,
    generatedRuleId,
  )
}

/** Shared helper for mapping tester artifacts to the detection item key. */
export function getKeepUniqueItemKey(artifact: NormalizedGearArtifact): number {
  // Delegate item-key derivation to wasm so TS does not duplicate fallback rules.
  return getKeepUniqueItemKeyWithLoadedWasm(artifact)
}

export type KeepUniqueGroupKey = string

/** Hash representing the slot+set+main+faction group used for uniqueness filtering. */
export function getKeepUniqueGroupKey(artifact: NormalizedGearArtifact): KeepUniqueGroupKey {
  // Delegate group-key derivation to wasm so TS does not duplicate slot/faction rules.
  return getKeepUniqueGroupKeyWithLoadedWasm(artifact)
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

type KeepUniqueWasmExpectedGroupDomainPayload = {
  slotOrder: ArtifactTypeId[]
  accessoryCompatibleSetIds: ArtifactSetId[]
  armorCompatibleSetIds: ArtifactSetId[]
  allowedMainBySlot: Record<string, StatVariant[]>
  allFactionIds: FactionId[]
}

// Build a compact domain payload so wasm can enumerate expected scope groups
// without duplicating TS-only catalogs or runtime set expansion logic.
const buildKeepUniqueExpectedGroupDomain = (): KeepUniqueWasmExpectedGroupDomainPayload => {
  // Serialize slot->main map as plain arrays so wasm can normalize ordering.
  const allowedMainBySlot: Record<string, StatVariant[]> = {}
  for (const [slotKey, allowed] of Object.entries(ALLOWED_MAIN_BY_SLOT)) {
    allowedMainBySlot[String(slotKey)] = Array.from(allowed) as StatVariant[]
  }
  // Build a raw domain snapshot and let wasm apply canonical sorting/dedupe.
  const rawDomain: KeepUniqueWasmExpectedGroupDomainPayload = {
    slotOrder: PREFERRED_ARTIFACT_TYPE_ORDER.map((value) => Number(value) as ArtifactTypeId),
    accessoryCompatibleSetIds: getAccessorySlotsCompatibleSetIds().map((value) => Number(value) as ArtifactSetId),
    armorCompatibleSetIds: resolveArmorCompatibleSetIds().map((value) => Number(value) as ArtifactSetId),
    allowedMainBySlot,
    allFactionIds: ALL_FACTION_IDS.slice(),
  }
  return normalizeKeepUniqueExpectedGroupDomainWithLoadedWasm(rawDomain)
}

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
  // Pass raw preview rows and let wasm normalize fields for collection.
  // WASM-first candidate snapshot keeps assembly semantics in Rust.
  try {
    const snapshot = collectKeepUniqueCandidatesWithLoadedWasm({
      rows,
      rules: baseRuleList,
      configModes,
      ...(ignoreConfigSet ? { ignoreKeepUniqueConfigIndices: ignoreConfigSet } : {}),
    })
    const candidates: KeepUniqueCandidate[] = snapshot.candidates.map((entry) => {
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
    throw new Error(`WASM keep-unique candidate collection is unavailable: ${String(error)}`)
  }
}

// Combined keep-unique helper runs collect + detect in one wasm roundtrip.
// Callers that need both outputs should prefer this over two separate calls.
export function collectAndComputeKeepUniqueProtection(
  params: KeepUniqueCollectAndDetectParams,
): KeepUniqueCollectAndDetectSnapshot {
  const { rows, baseRules, configModes, rules, enabled, now } = params
  const ignoreConfigSet = params.ignoreKeepUniqueConfigIndices && params.ignoreKeepUniqueConfigIndices.size > 0
    ? params.ignoreKeepUniqueConfigIndices
    : null
  const timestamp = Number.isFinite(now) ? Number(now) : Date.now()
  if (!rows.length) {
    return {
      candidates: { candidates: [], uniqueItemKeys: new Set() },
      detection: { scannedAt: timestamp, entries: [] },
    }
  }
  const baseRuleList: HsfRuleWithCfg[] = Array.isArray(baseRules) ? [...baseRules] : []
  // Pass raw rows/rules and let wasm normalize to its detection payload.
  const combined = collectAndComputeKeepUniqueProtectionWithLoadedWasm({
    rows,
    rules: baseRuleList,
    configModes,
    ...(ignoreConfigSet ? { ignoreKeepUniqueConfigIndices: ignoreConfigSet } : {}),
    keepUniqueRules: rules,
    expectedGroupDomain: buildKeepUniqueExpectedGroupDomain(),
    enabled,
    now: timestamp,
  })
  // Reattach UI row references on the TS side for compatibility.
  const candidates: KeepUniqueCandidate[] = combined.candidates.map((entry) => {
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
  if (!isKeepUniqueDetectionSnapshot(combined.detection)) {
    throw new Error('WASM keep-unique combined pipeline returned an invalid detection payload.')
  }
  return {
    candidates: { candidates, uniqueItemKeys },
    detection: combined.detection,
  }
}

/** Compute Keep Unique combination coverage against the candidate sold rows. */
/** Compute Keep Unique combination coverage against the candidate sold rows. */
export function computeKeepUniqueProtection(params: KeepUniqueDetectionParams): KeepUniqueDetectionSnapshot {
  const { candidates, rules, enabled, now } = params
  const timestamp = Number.isFinite(now) ? Number(now) : Date.now()
  // Wasm derives expected groups from the shared domain payload (SSOT path).
  const wasmSnapshot = computeKeepUniqueProtectionWithLoadedWasm({
    candidates,
    rules,
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
  // Delegate metaset expansion to wasm so include/exclude precedence is SSOT.
  return resolveKeepUniqueRulesWithMetasetsWithLoadedWasm(rules, metasets)
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
