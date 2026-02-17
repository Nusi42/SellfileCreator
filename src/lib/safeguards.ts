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
import type { BuilderRecipe, SellfileExportMode } from './hsfBuilder'
import type { HsfRuleWithRecipe } from './merge'
import type { NormalizedGearArtifact } from './importers/gearDbNormalizer'
import type { Metaset } from './metasets'
import { normalizeRecipeName } from './ruleRecipeIndex'
import type { ArtifactSetSelectionEntry } from './gearSets/selection'
import { hasIgnoreSafeguardTag } from './tagHelpers'
import {
  collectAndComputeSafeguardProtectionWithLoadedWasm,
  collectSafeguardCandidatesWithLoadedWasm,
  computeSafeguardProtectionWithLoadedWasm,
  getSafeguardGroupKeyWithLoadedWasm,
  getSafeguardItemKeyWithLoadedWasm,
  getSafeguardCountKeyWithLoadedWasm,
  hashSafeguardCombinationWithLoadedWasm,
  normalizeSafeguardActivationWithLoadedWasm,
  normalizeSafeguardCombinationWithLoadedWasm,
  normalizeSafeguardCountModeWithLoadedWasm,
  normalizeSafeguardExpectedGroupDomainWithLoadedWasm,
  normalizeSafeguardRuleWithLoadedWasm,
  normalizeSafeguardSubstatMatchWithLoadedWasm,
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

export const buildIgnoreSafeguardConfigIndices = (recipes: readonly BuilderRecipe[]): ReadonlySet<number> => {
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

// Mirrors the default scope-chip state (slot+set+faction+main) so HSFC imports and tutorials stay aligned.
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

const SAFEGUARD_RULE_ACTIVATION_VALUES = new Set<SafeguardRuleActivation>([
  SafeguardRuleActivation.Off,
  SafeguardRuleActivation.ProtectExisting,
  SafeguardRuleActivation.AnticipateGaps,
])

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
  // Delegate token coercion to wasm so TS does not duplicate alias parsing rules.
  const normalized = normalizeSafeguardActivationWithLoadedWasm(value)
  // Keep the public union return type strict and fail closed on unknown payloads.
  if (SAFEGUARD_RULE_ACTIVATION_VALUES.has(normalized as SafeguardRuleActivation)) {
    return normalized as SafeguardRuleActivation
  }
  throw new Error('WASM safeguard activation normalizer returned an unexpected token.')
}

// normalizeSafeguardSubstatMatch keeps matching choices stable and case-insensitive.
export const normalizeSafeguardSubstatMatch = (value: unknown): SafeguardSubstatMatch => {
  // Delegate token coercion to wasm so TS does not duplicate alias parsing rules.
  const normalized = normalizeSafeguardSubstatMatchWithLoadedWasm(value)
  // Keep the public union return type strict and fail closed on unknown payloads.
  if (normalized === SafeguardSubstatMatch.Any) return SafeguardSubstatMatch.Any
  if (normalized === SafeguardSubstatMatch.All) return SafeguardSubstatMatch.All
  if (normalized === SafeguardSubstatMatch.PerSubstat) return SafeguardSubstatMatch.PerSubstat
  throw new Error('WASM safeguard substat-match normalizer returned an unexpected token.')
}

export const isSafeguardRuleActive = (rule: SafeguardRule): boolean => (
  rule.activation !== SafeguardRuleActivation.Off
)

const sanitizeCountMode = (raw: Partial<SafeguardRuleCountMode> | null | undefined): SafeguardRuleCountMode => {
  // Delegate default + sanitize logic to wasm so TS does not duplicate mode rules.
  const normalized = normalizeSafeguardCountModeWithLoadedWasm(raw)
  // Preserve the local structural type used across UI + worker payloads.
  return {
    perRule: normalized.perRule === true,
    perSet: normalized.perSet === true,
    perFaction: normalized.perFaction === true,
    perMainStat: normalized.perMainStat === true,
    perSlot: normalized.perSlot === true,
  }
}

// normalizeSafeguardCountMode parses legacy payloads into the canonical scope-chip shape.
export const normalizeSafeguardCountMode = (value: unknown): SafeguardRuleCountMode => {
  // Delegate default + sanitize logic to wasm so TS does not duplicate mode rules.
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
  ignoreSafeguardConfigIndices?: ReadonlySet<number>
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
const toSafeguardLookupRecord = (values: ReadonlyMap<string, number>): Record<string, number> => {
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
const SAFEGUARD_NORMALIZATION_LOOKUPS = Object.freeze({
  artifactTypeIdsByName: toSafeguardLookupRecord(artifactTypeIdByName),
  artifactSetIdsByName: toSafeguardLookupRecord(artifactSetIdByName),
  factionIdsByName: toSafeguardLookupRecord(factionIdByName),
  rarityCodesByName: toSafeguardLookupRecord(rarityCodeByName),
  statVariantIdsByLabel: {},
})

// buildNormalizedSafeguardRuleId keeps generated ids deterministic per call
// while still letting wasm own the rest of the rule normalization logic.
const buildNormalizedSafeguardRuleId = (): string => {
  return createSafeguardRuleId()
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

/** Normalize combination payloads loaded from HSFC/autosave. */
export function normalizeSafeguardCombination(value: unknown): SafeguardCombination | null {
  // Delegate normalization to wasm so recursive tuple parsing is SSOT in Rust.
  return normalizeSafeguardCombinationWithLoadedWasm<SafeguardCombination>(
    value,
    SAFEGUARD_NORMALIZATION_LOOKUPS,
  )
}

/** Normalize rule payloads; returns null when combination data is invalid. */
export function normalizeSafeguardRule(value: unknown): SafeguardRule | null {
  // Generate fallback id in TS so rule ids keep the same prefix/time randomness.
  const generatedRuleId = buildNormalizedSafeguardRuleId()
  // Delegate normalization to wasm so recursive rule parsing is SSOT in Rust.
  return normalizeSafeguardRuleWithLoadedWasm<SafeguardRule>(
    value,
    SAFEGUARD_NORMALIZATION_LOOKUPS,
    generatedRuleId,
  )
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
  ignoreSafeguardConfigIndices?: ReadonlySet<number>
}): SafeguardCandidateSnapshot {
  const { rows, baseRules, recipeModes } = params
  // Allow safeguard detection to skip recipes that only protect rework fodder.
  const ignoreConfigSet = params.ignoreSafeguardConfigIndices && params.ignoreSafeguardConfigIndices.size > 0
    ? params.ignoreSafeguardConfigIndices
    : null
  if (!rows.length) return { candidates: [], uniqueItemKeys: new Set() }
  const baseRuleList: HsfRuleWithRecipe[] = Array.isArray(baseRules) ? [...baseRules] : []
  // Pass raw preview rows and let wasm normalize fields for collection.
  // WASM-first candidate snapshot keeps assembly semantics in Rust.
  try {
    const snapshot = collectSafeguardCandidatesWithLoadedWasm({
      rows,
      rules: baseRuleList,
      recipeModes,
      ...(ignoreConfigSet ? { ignoreSafeguardConfigIndices: ignoreConfigSet } : {}),
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
  const ignoreConfigSet = params.ignoreSafeguardConfigIndices && params.ignoreSafeguardConfigIndices.size > 0
    ? params.ignoreSafeguardConfigIndices
    : null
  const timestamp = Number.isFinite(now) ? Number(now) : Date.now()
  if (!rows.length) {
    return {
      candidates: { candidates: [], uniqueItemKeys: new Set() },
      detection: { scannedAt: timestamp, entries: [] },
    }
  }
  const baseRuleList: HsfRuleWithRecipe[] = Array.isArray(baseRules) ? [...baseRules] : []
  // Pass raw rows/rules and let wasm normalize to its detection payload.
  const combined = collectAndComputeSafeguardProtectionWithLoadedWasm({
    rows,
    rules: baseRuleList,
    recipeModes,
    ...(ignoreConfigSet ? { ignoreSafeguardConfigIndices: ignoreConfigSet } : {}),
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
