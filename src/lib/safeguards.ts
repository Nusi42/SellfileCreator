import { stableSerialize } from './stableSerialize'
import { isAccessorySlot, ACCESSORY_SLOT_IDS } from './gearInspectorDomain'
import { normalizeGearInspectorSortWeight, GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT } from './gearInspectorSort'
import { normalizeSubstatByMax6, getGlyphAverageForVariant } from './substatRollNormalization'
import { retainAllowedSubstats } from './statCompatibility'
import type { GearInspectorPreviewRow } from '../types/gearInspectorPreview'
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
import { normalizeArtifactSetSelections, splitArtifactSetSelections } from './gearSets/selection'
import { hasIgnoreSafeguardTag, normalizeTagList } from './tagHelpers'
import type { NameAppearance } from './nameAppearance'
import { readAppearanceFromRecord } from './nameAppearance'
import type {
  ImprovementChanceWasmEntry,
  WasmArtifactStoreInput,
  WasmArtifactStoreRow,
  WasmImprovementChanceInput,
  WasmRuleEngineEvaluateOptions,
  WasmSafeguardCandidateInput,
  WasmSafeguardCollectRowInput,
} from './wasm/wasmRuleEngine'
import {
  collectAndComputeSafeguardProtectionWithLoadedWasm,
  collectSafeguardCandidatesWithLoadedWasm,
  computeSafeguardProtectionWithLoadedWasm,
  computeImprovementChanceWithLoadedWasm,
  evaluateAndCollectSafeguardProtectionWithLoadedWasm,
  storeArtifactRowsWithLoadedWasm,
  getSafeguardGroupKeyWithLoadedWasm,
  getSafeguardItemKeyWithLoadedWasm,
  getSafeguardCountKeyWithLoadedWasm,
  hashSafeguardCombinationWithLoadedWasm,
  normalizeSafeguardExpectedGroupDomainWithLoadedWasm,
  resolveSafeguardRulesWithMetasetsWithLoadedWasm,
  sortSafeguardCombinationWithLoadedWasm,
  sortSafeguardSubstatsWithLoadedWasm,
  scoreSafeguardCandidatesWithLoadedWasm,
  // toWasmTestItem SSOT moved here; re-exported below for downstream consumers.
  toWasmTestItem,
} from './wasm/wasmRuleEngine'
import type { WasmEvaluateAndCollectSnapshot, SafeguardWasmArtifactIn } from './wasm/wasmRuleEngine'
export { ensureWasmRuleEngineReady } from './wasm/wasmRuleEngine'
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
  metaSetNames: string[]
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

// Mirrors the default scope-chip state (slot+set+faction+main) so SFC imports and tutorials stay aligned.
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
// Improvement-chance threshold disabled by default; users opt in per rule.
export const SAFEGUARD_DEFAULT_IMPROVEMENT_CHANCE_THRESHOLD: SafeguardImprovementChanceLevelThresholds | null = null

// Seed value used when the user first enables the improvement-chance threshold; also the
// cascade-root fallback when atLevel0 is absent on legacy data.
export const SAFEGUARD_IMPROVEMENT_CHANCE_DEFAULT_THRESHOLD = 25

/** Per-upgrade-stage improvement-chance thresholds. atLevel0 is always required (the
 *  cascade root). Each subsequent level inherits the resolved value of the previous
 *  stage when its own value is null, so leaving later stages empty is equivalent to
 *  repeating the atLevel0 value. When the outer field is null the feature is disabled. */
export type SafeguardImprovementChanceLevelThresholds = {
  // Items at levels 0–3; all 4 roll events are still ahead.
  atLevel0: number
  // Items at levels 4–7 (after 1st upgrade). null = inherit atLevel0.
  atLevel4: number | null
  // Items at levels 8–11 (after 2nd upgrade). null = inherit resolved atLevel4.
  atLevel8: number | null
  // Items at levels 12–15 (after 3rd upgrade). null = inherit resolved atLevel8.
  atLevel12: number | null
}

/** Resolves inherited nulls to concrete values for all 4 upgrade stages.
 *  Call this before passing thresholds to WASM so Rust always sees concrete values. */
export function resolveImprovementChanceThresholds(
  t: SafeguardImprovementChanceLevelThresholds,
): [number, number, number, number] {
  const l0 = t.atLevel0
  const l4 = t.atLevel4 ?? l0
  const l8 = t.atLevel8 ?? l4
  const l12 = t.atLevel12 ?? l8
  return [l0, l4, l8, l12]
}

/** Converts a legacy single-number threshold (or unknown payload) to the per-level form.
 *  A bare number is expanded with all later stages null (inherit from atLevel0). */
export function normalizeLegacyImprovementChanceThreshold(
  v: number | SafeguardImprovementChanceLevelThresholds | null | undefined,
): SafeguardImprovementChanceLevelThresholds | null {
  if (v == null) return null
  if (typeof v === 'number') {
    return {
      atLevel0: Math.max(0, Math.min(100, Math.round(v * 10) / 10)),
      atLevel4: null,
      atLevel8: null,
      atLevel12: null,
    }
  }
  return v
}

// IDs for the four named improvement-chance presets.
export type SafeguardImprovementChancePresetId = 'lenient' | 'harsh' | 'graduated' | 'soft'

export type SafeguardImprovementChancePreset = {
  id: SafeguardImprovementChancePresetId
  thresholds: SafeguardImprovementChanceLevelThresholds
}

/** Named improvement-chance presets. Lenient/Harsh inherit all later stages from
 *  atLevel0 (null slots); Graduated and Soft set each stage explicitly. */
export const IMPROVEMENT_CHANCE_PRESETS: readonly SafeguardImprovementChancePreset[] = [
  // All stages at 25% — catches almost all non-junk at every upgrade stage.
  { id: 'lenient', thresholds: { atLevel0: 25, atLevel4: null, atLevel8: null, atLevel12: null } },
  // All stages at 65% — suitable for max-roll drops across all stages.
  { id: 'harsh', thresholds: { atLevel0: 65, atLevel4: null, atLevel8: null, atLevel12: null } },
  // Looser for fresh items, stricter as upgrades accumulate — moderate ramp.
  { id: 'graduated', thresholds: { atLevel0: 25, atLevel4: 35, atLevel8: 50, atLevel12: 65 } },
  // Lenient flat 10%: keep anything that isn't junk. Measured against real accounts,
  // chances cluster at 0 / ~25 / ~50, so 10% sells only the ~0% (desired substats never
  // rolled) while keeping everything with a genuine shot. (Old 3% floor was a no-op filter.)
  { id: 'soft', thresholds: { atLevel0: 10, atLevel4: null, atLevel8: null, atLevel12: null } },
]

/** Returns the matching preset ID if the thresholds exactly match a builtin preset,
 *  or null when the configuration is custom. */
export function detectImprovementChancePresetId(
  t: SafeguardImprovementChanceLevelThresholds,
): SafeguardImprovementChancePresetId | null {
  for (const preset of IMPROVEMENT_CHANCE_PRESETS) {
    const p = preset.thresholds
    if (
      p.atLevel0 === t.atLevel0 &&
      p.atLevel4 === t.atLevel4 &&
      p.atLevel8 === t.atLevel8 &&
      p.atLevel12 === t.atLevel12
    ) {
      return preset.id
    }
  }
  return null
}

// localStorage key for the last-used improvement-chance threshold configuration.
export const IMPROVEMENT_CHANCE_LAST_USED_KEY =
  'sellfileCreator.improvementChanceLastUsed.v1'

export const SafeguardRuleActivation = {
  Off: SAFEGUARD_ACTIVATION_OFF,
  ProtectExisting: SAFEGUARD_ACTIVATION_PROTECT_EXISTING,
  AnticipateGaps: SAFEGUARD_ACTIVATION_ANTICIPATE_GAPS,
} as const

// eslint-disable-next-line no-redeclare -- allow constant/type pair
export type SafeguardRuleActivation =
  (typeof SafeguardRuleActivation)[keyof typeof SafeguardRuleActivation]

// SafeguardSubstatMatch controls how multiple picked substats are matched.
// Min1–Min4 set a numeric "at least N" threshold; PerSubstat applies the quota
// independently to each substat. Legacy "any"/"all" tokens are migrated on load.
export const SafeguardSubstatMatch = {
  Min1: '1',
  Min2: '2',
  Min3: '3',
  Min4: '4',
  PerSubstat: SAFEGUARD_SUBSTAT_PER_SUBSTAT,
} as const

// eslint-disable-next-line no-redeclare -- allow constant/type pair
export type SafeguardSubstatMatch =
  (typeof SafeguardSubstatMatch)[keyof typeof SafeguardSubstatMatch]

// SafeguardSubstatMinCount is the subset of SafeguardSubstatMatch values that
// represent numeric thresholds (used by the UI chip row).
export type SafeguardSubstatMinCount = '1' | '2' | '3' | '4'

// SAFEGUARD_SUBSTAT_MIN_COUNTS is the ordered list of valid numeric threshold tokens.
export const SAFEGUARD_SUBSTAT_MIN_COUNTS: SafeguardSubstatMinCount[] = ['1', '2', '3', '4']

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
// substatCount is used to migrate legacy "all" tokens to the correct numeric threshold.
export const normalizeSafeguardSubstatMatch = (
  value: unknown,
  substatCount?: number,
): SafeguardSubstatMatch => {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : ''
  // Pass-through numeric min-count tokens "1"–"4".
  if (token === '1') return SafeguardSubstatMatch.Min1
  if (token === '2') return SafeguardSubstatMatch.Min2
  if (token === '3') return SafeguardSubstatMatch.Min3
  if (token === '4') return SafeguardSubstatMatch.Min4
  // perSubstat stays as-is.
  if (token === SafeguardSubstatMatch.PerSubstat.toLowerCase()) {
    return SafeguardSubstatMatch.PerSubstat
  }
  // Legacy "all" → migrate to the numeric count of the selected substats.
  if (token === SAFEGUARD_SUBSTAT_ALL.toLowerCase()) {
    const count = Math.min(Math.max(substatCount ?? 4, 1), 4)
    return String(count) as SafeguardSubstatMinCount
  }
  // Legacy "any" and unknown values → at-least-one default.
  return SafeguardSubstatMatch.Min1
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

// Returns which per-X dimensions are no-ops for the given combination.
// A dimension is redundant when the combination already restricts it to a single
// value — the candidate pool is already uniform, so splitting by it changes nothing.
// Used by safeguardEffectiveCountModeForDisplay (chip rendering) and the builder
// panel (chip disabled state) so both surfaces share one definition.
export function safeguardRedundantCountModeDimensions(combination: SafeguardCombination): {
  perSlot: boolean; perSet: boolean; perFaction: boolean; perMainStat: boolean
} {
  const includedSets = splitArtifactSetSelections(combination.sets).included
  return {
    perSlot: combination.slots.length === 1,
    perSet: includedSets.length === 1 && (combination.metaSetNames?.length ?? 0) === 0,
    perFaction: combination.factions.length === 1,
    perMainStat: combination.mainStats.length === 1,
  }
}

// Returns a count mode with redundant per-X flags suppressed for display purposes.
export function safeguardEffectiveCountModeForDisplay(
  combination: SafeguardCombination,
  countMode: SafeguardRuleCountMode,
): SafeguardRuleCountMode {
  const sanitized = sanitizeSafeguardCountMode(countMode)
  const redundant = safeguardRedundantCountModeDimensions(combination)
  return {
    ...sanitized,
    perSlot: sanitized.perSlot && !redundant.perSlot,
    perSet: sanitized.perSet && !redundant.perSet,
    perFaction: sanitized.perFaction && !redundant.perFaction,
    perMainStat: sanitized.perMainStat && !redundant.perMainStat,
  }
}

export const cloneSafeguardCombination = (combination: SafeguardCombination): SafeguardCombination => ({
  slots: [...combination.slots],
  // Clone entries so excluded flags survive but references do not.
  sets: combination.sets.map((entry) => (entry.excluded ? { id: entry.id, excluded: true } : { id: entry.id })),
  metaSetNames: [...(combination.metaSetNames ?? [])],
  ranks: [...combination.ranks],
  rarities: [...combination.rarities],
  mainStats: [...(combination.mainStats ?? [])],
  factions: [...(combination.factions ?? [])],
})

// createEmptySafeguardCombination returns an "any" combination for new rule drafts.
export const createEmptySafeguardCombination = (): SafeguardCombination => ({
  slots: [],
  sets: [],
  metaSetNames: [],
  ranks: [],
  rarities: [],
  mainStats: [],
  factions: [],
})

// cloneSafeguardRule keeps history snapshots isolated from live edits.
export const cloneSafeguardRule = (rule: SafeguardRule): SafeguardRule => ({
  // Preserve all scalar fields.
  ...rule,
  // Clone appearance so edits to the copy don't mutate the source.
  ...(rule.appearance ? { appearance: { ...rule.appearance } } : {}),
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
  // Preserve per-level thresholds; null means feature disabled.
  improvementChanceThreshold: rule.improvementChanceThreshold ?? null,
  // Detach tags array so edits to the clone do not mutate the source.
  tags: [...(rule.tags ?? [])],
})

// cloneSafeguardRules clones a list into detached rule objects.
export const cloneSafeguardRules = (rules: readonly SafeguardRule[]): SafeguardRule[] => (
  // Reuse the per-rule clone so behavior stays consistent.
  rules.map((rule) => cloneSafeguardRule(rule))
)

export type SafeguardRule = {
  // Optional display appearance (name + foreground color). Absent means unnamed and unstyled.
  appearance?: NameAppearance
  // Optional tags for identifying this rule in safeguard-overrides DSL and note display.
  tags?: string[]
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
  // Per-upgrade-stage improvement-chance thresholds. When set, a piece must meet the
  // threshold for its current level range to be expanded beyond the standard top-N.
  // null = feature disabled; use resolveImprovementChanceThresholds before passing to WASM.
  improvementChanceThreshold: SafeguardImprovementChanceLevelThresholds | null
}

// SSOT for "which fields of a safeguard rule change the generated/exported rules".
// Both the rule-cache invalidation key (ruleCacheWorker.computeRecipeKey) and the
// export-dirty signature (App.hsfExportStateSig) must agree on this field set — they
// previously diverged, and the export-dirty side was MISSING substatMatch and
// improvementChanceThreshold, so changing either left the "needs export/push" badge
// falsely clean and the user could ship a stale sell-file. Defining the set once here
// makes both consumers track the same fields by construction.
//
// Every field that affects rule generation, safeguard detection, or candidate matching is
// included. Excluded by design: `appearance` (display name/colour only) and `tags` (DSL
// identification only) — neither changes the produced rules. Order-independent via
// stableSerialize (sorts object keys; combination/weights maps serialize canonically).
export const safeguardRuleContentFingerprint = (rule: SafeguardRule): string => stableSerialize({
  combination: rule.combination,
  requiredCount: rule.requiredCount,
  activation: rule.activation,
  countMode: rule.countMode,
  ignorePreviousSafeguards: rule.ignorePreviousSafeguards,
  ignoreEquippedInCollection: rule.ignoreEquippedInCollection,
  ignoreEquippedInVault: rule.ignoreEquippedInVault,
  substats: rule.substats,
  substatMatch: rule.substatMatch,
  substatWeights: rule.substatWeights,
  improvementChanceThreshold: rule.improvementChanceThreshold,
})

// Fingerprint of a full safeguard rule list (enabled flag + each rule's content). Stable
// across recomputes for identical content; the single string both consumers compare/hash.
export const safeguardRulesContentFingerprint = (
  enabled: boolean,
  rules: readonly SafeguardRule[],
): string => `${enabled ? 1 : 0}:${rules.length}:${rules.map(safeguardRuleContentFingerprint).join('|')}`

/** Build the default Safeguard rule list for new sessions (empty by design). */
export function buildDefaultSafeguardRules(): SafeguardRule[] {
  // Keep the list empty so users opt into Safeguard combinations explicitly.
  return []
}

// Returns the factory (shipping) default field values for the safeguard builder
// draft. Used to seed user-defaults logic (save / reset).
export const createFactorySafeguardBuilderDefaults = (): SafeguardRule =>
  // Normalize at the source so every consumer receives a consistent rule regardless
  // of how individual fields are set — field combinations that conflict (e.g. improvement
  // threshold without substats) are resolved here rather than at each callsite.
  normalizeSafeguardSubstatDependents({
    combination: { slots: [], sets: [], metaSetNames: [], ranks: [], rarities: [], mainStats: [], factions: [] },
    // No appearance by default; users set name/color via the builder.
    // Tags default to empty; users add them to enable safeguard-overrides targeting.
    tags: [],
    requiredCount: 1,
    activation: SafeguardRuleActivation.ProtectExisting,
    countMode: { ...SAFEGUARD_DEFAULT_COUNT_MODE },
    ignorePreviousSafeguards: SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS,
    ignoreEquippedInCollection: SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION,
    ignoreEquippedInVault: SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT,
    substats: [],
    substatMatch: SafeguardSubstatMatch.Min1,
    substatWeights: {},
    improvementChanceThreshold: SAFEGUARD_DEFAULT_IMPROVEMENT_CHANCE_THRESHOLD,
  })

// Extracts the content fields of a SafeguardRule in the same stable key order as
// createFactorySafeguardBuilderDefaults. Used as the SSOT for equality checks:
// isDefaultRule (vs effective defaults) and dirty detection (vs selected rule).
export const createSafeguardRuleContentSnapshot = (rule: SafeguardRule): SafeguardRule => ({
  combination: rule.combination,
  // appearance included so equality checks detect name/color changes correctly.
  ...(rule.appearance ? { appearance: rule.appearance } : {}),
  // Tags included so equality checks detect tag changes correctly.
  tags: rule.tags ?? [],
  requiredCount: rule.requiredCount,
  activation: rule.activation,
  countMode: rule.countMode,
  ignorePreviousSafeguards: rule.ignorePreviousSafeguards,
  ignoreEquippedInCollection: rule.ignoreEquippedInCollection,
  ignoreEquippedInVault: rule.ignoreEquippedInVault,
  substats: rule.substats ?? [],
  substatMatch: rule.substatMatch ?? SafeguardSubstatMatch.Min1,
  substatWeights: rule.substatWeights ?? {},
  improvementChanceThreshold: rule.improvementChanceThreshold ?? null,
})

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

// Stable identifier for the count-group an artifact belongs to under a given effective count mode.
// Mirrors how WASM buckets candidates: only dimensions active in `effectiveCountMode` participate,
// so two artifacts share a key iff they would share a quota bucket. Each segment is prefixed so
// values from different dimensions can never collide (e.g. a set id equal to a faction id).
// Returns null when no per-group dimension is active — every candidate is then one global group
// and focusing would be a no-op (callers hide the focus control in that case).
export function safeguardFocusGroupKeyFor(
  artifact: SafeguardDetectionArtifact,
  effectiveCountMode: SafeguardRuleCountMode,
): string | null {
  // Collect the active-dimension segments in the same display order as the cutoff label.
  const segments: string[] = []
  if (effectiveCountMode.perSlot) segments.push(`slot:${artifact.slot}`)
  if (effectiveCountMode.perSet) segments.push(`set:${artifact.set}`)
  if (effectiveCountMode.perFaction) segments.push(`faction:${artifact.faction}`)
  if (effectiveCountMode.perMainStat) segments.push(`main:${artifact.mainStat}`)
  // No active dimension → single global group; signal "no focus possible" to callers.
  if (segments.length === 0) return null
  return segments.join('|')
}

// Per-candidate scoring output from the WASM detection pass or live preview.
// Pure mirror of SafeguardWasmCandidateOut (Rust) — imported from the ts-rs
// generated rust-types/ directory and re-exported under the legacy name so
// downstream consumers (gear-inspector overlay, safeguard popover) don't move.
import type { SafeguardWasmCandidateOut } from './wasm/generated/rust-types/SafeguardWasmCandidateOut'
export type SafeguardCandidateOut = SafeguardWasmCandidateOut

export type SafeguardDetectionEntry = {
  hash: string
  combination: SafeguardCombination
  // 1-based ordinal of the rule that generated this entry; null for unmatched entries.
  ruleOrdinal: number | null
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
  // Scored candidates from the detection pass (present when substats are configured).
  // Populated by WASM; absent on older snapshots (treated as empty array).
  candidates?: SafeguardCandidateOut[]
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
  row: GearInspectorPreviewRow
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
  rows: readonly GearInspectorPreviewRow[]
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

/** Canonical hash for combination comparisons and metadata lookups. */
export function hashSafeguardCombination(combination: SafeguardCombination): string {
  // Delegate canonical hash construction to wasm so TS does not duplicate rules.
  return hashSafeguardCombinationWithLoadedWasm(combination)
}

// Name lookups keep SFC tuple fields readable while still resolving back to
// enum IDs from TS domain constants (single source of truth for label -> id).
const artifactTypeIdByName = new Map<string, ArtifactTypeId>(
  Object.entries(artifactTypeNames).map(([id, label]) => [label.trim().toLowerCase(), Number(id) as ArtifactTypeId]),
)

const artifactSetIdByName = new Map<string, ArtifactSetId>(
  Object.entries(artifactSetNames).map(([id, label]) => [label.trim().toLowerCase(), Number(id) as ArtifactSetId]),
)

export const factionIdByName = new Map<string, FactionId>(
  Object.entries(factionNames)
    .filter(([, name]) => Boolean(name && name.trim()))
    .map(([id, name]) => [name.trim().toLowerCase(), Number(id) as FactionId]),
)

// Rarity labels in readable SFC payloads and the DSL resolve through this reverse map.
export const rarityCodeByName = new Map<string, RankValue>(
  Object.entries(rarityNames)
    .filter(([, name]) => Boolean(name && name.trim()))
    .map(([id, name]) => [name.trim().toLowerCase(), Math.max(RANK_VALUE_MIN, Math.min(RANK_VALUE_MAX, Number(id))) as RankValue]),
)

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

// Dedup + lexical ordering keeps metaset names stable for hashing and exports.
const sortUniqueMetaSetNames = (values: string[]): string[] => {
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

// Score and rank candidate artifacts with the given substats/weights for live
// popover preview. Delegates to WASM to preserve SSOT on the scoring formula.
// countMode is forwarded so isWithinQuota bucketing (perSet/perFaction/perMain/
// perSlot) matches the detection pass that produced the popover's initial view.
export const scoreSafeguardCandidates = (params: {
  // Serialized artifacts from SafeguardDetectionEntry.artifacts.
  artifacts: SafeguardDetectionArtifact[]
  // Substat variant IDs active in the rule.
  substats: StatVariant[]
  // Per-variant weight multipliers (variant → weight).
  weights: Record<number, number>
  // How many items the rule intends to keep.
  requiredCount: number
  // Editing rule's count-mode flags; optional so legacy callers pre-dating the
  // partitioning fix keep working (Rust resolves to the canonical default).
  countMode?: SafeguardRuleCountMode
}): SafeguardCandidateOut[] =>
  // Map to the WASM wire type explicitly so tsc catches field renames on either side.
  // SafeguardDetectionArtifact.itemKey → SafeguardWasmArtifactIn.id (camelCase of Rust `id`).
  // equippedInCollection/equippedInVault default to false; rolls default to null.
  scoreSafeguardCandidatesWithLoadedWasm({
    artifacts: params.artifacts.map(({ itemKey, slot, set, rank, rarity, level, exactLevel, faction, mainStat, substats }): SafeguardWasmArtifactIn => ({
      id: itemKey,
      slot,
      set,
      rank,
      rarity,
      level,
      exactLevel,
      faction,
      mainStat,
      equippedInCollection: false,
      equippedInVault: false,
      substats: substats.map(({ variant, isFlat, value }) => ({ variant, isFlat, value, rolls: null })),
    })),
    substats: params.substats,
    weights: params.weights,
    requiredCount: params.requiredCount,
    // Pass-through only when caller supplied a mode; undefined drops the field
    // entirely so the wasm wrapper substitutes its `countMode: null` default.
    ...(params.countMode ? { countMode: params.countMode } : {}),
  })

// sortSafeguardCombination enforces stable ordering across every safeguard filter.
export const sortSafeguardCombination = (combination: SafeguardCombination): SafeguardCombination => ({
  // Delegate full combination sorting to wasm so TS does not duplicate rules.
  ...(sortSafeguardCombinationWithLoadedWasm(combination)),
})

/** Normalize combination payloads loaded from SFC/autosave. */
export function normalizeSafeguardCombination(value: unknown): SafeguardCombination | null {
  const record = toRecord(value)
  if (!record) return null
  const slots: ArtifactTypeId[] = []
  const ranks: RankValue[] = []
  const rarities: RankValue[] = []
  const mainStats: StatVariant[] = []
  const factions: FactionId[] = []
  const metaSetNames: string[] = []

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
  collectRecursive(record.metaSetNames, (leaf) => {
    if (typeof leaf !== 'string') return
    const trimmed = leaf.trim()
    if (!trimmed) return
    metaSetNames.push(trimmed)
  })
  // Legacy: metaSetIds was the field name before migration to name-as-primary-key.
  collectRecursive(record.metaSetIds, (leaf) => {
    if (typeof leaf !== 'string') return
    const trimmed = leaf.trim()
    if (!trimmed) return
    metaSetNames.push(trimmed)
  })
  // Older legacy: metaSets predates both metaSetIds and metaSetNames.
  collectRecursive(record.metaSets, (leaf) => {
    if (typeof leaf !== 'string') return
    const trimmed = leaf.trim()
    if (!trimmed) return
    metaSetNames.push(trimmed)
  })

  // Faction wins: if factions are set, restrict slots to accessories only.
  // Armor pieces cannot carry faction, so including them would be misleading.
  const dedupedFactions = Array.from(new Set(factions)).sort((a, b) => a - b)
  const dedupedSlots = Array.from(new Set(slots)).sort((left, right) => compareArtifactTypes(left, right))
  let normalizedSlots = dedupedSlots
  if (dedupedFactions.length > 0) {
    const accessoryOnly = dedupedSlots.filter((s) => isAccessorySlot(s))
    normalizedSlots = accessoryOnly.length > 0
      ? accessoryOnly
      : (ACCESSORY_SLOT_IDS as typeof dedupedSlots)
  }
  return {
    slots: normalizedSlots,
    sets: parseSetSelections(record.sets),
    metaSetNames: sortUniqueMetaSetNames(metaSetNames),
    ranks: Array.from(new Set(ranks)).sort((a, b) => a - b),
    rarities: Array.from(new Set(rarities)).sort((a, b) => a - b),
    mainStats: sortSafeguardSubstats(Array.from(new Set(mainStats))),
    factions: dedupedFactions,
  }
}

/** Normalize rule payloads; returns null when combination data is invalid. */
export function normalizeSafeguardRule(value: unknown): SafeguardRule | null {
  const record = unwrapSafeguardRuleRecord(value)
  if (!record) return null
  const combinationSource = record.combination ?? record.tuple ?? value
  const combination = normalizeSafeguardCombination(combinationSource)
  if (!combination) return null

  // IDs are not persisted; the `id` field on legacy payloads is ignored.
  // Appearance is resolved via the shared helper: trusts nested `appearance` when present,
  // otherwise falls back to flat `name`/`fgcolor` with legacy [#RRGGBB] directive parsing.
  const appearance = readAppearanceFromRecord(record)
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
      // Pass substat count so legacy "all" migrates to the correct numeric threshold.
      ? normalizeSafeguardSubstatMatch(record.substatMatch, parsedSubstats.length)
      : SafeguardSubstatMatch.Min1
  )
  const substatMatch = parsedSubstats.length === 0 ? SafeguardSubstatMatch.Min1 : parsedSubstatMatch

  const weightsSource = (
    Object.prototype.hasOwnProperty.call(record, 'substatWeights')
      ? record.substatWeights
      : record.substatWeighting
  )
  // Parse optional per-level threshold block; accepts both the legacy single-number form
  // and the current object form. Falls back to null (disabled) on invalid/absent values.
  const improvementChanceThreshold = normalizeLegacyImprovementChanceThreshold(
    record.improvementChanceThreshold as number | SafeguardImprovementChanceLevelThresholds | null | undefined,
  )
  // Normalize tags using the shared tag helper so invalid values are filtered out.
  const tags = normalizeTagList(record.tags) ?? []
  // Run the substat-dependents gate so no caller receives a rule where
  // improvement-chance or weights are set without any substats to back them.
  // Also enforce the faction→accessory-slots invariant so loaded payloads
  // cannot smuggle in a faction filter with empty slots.
  return normalizeSafeguardFactionSlotScope(normalizeSafeguardSubstatDependents({
    ...(appearance ? { appearance } : {}),
    tags,
    combination,
    requiredCount,
    activation: normalizeSafeguardActivation(record.activation),
    countMode,
    // v2 is the current field. Old field: ranking path (substats set) was a no-op before
    // fc80d5ef, so downgrade to false; non-ranking path was correct, so preserve the value.
    ignorePreviousSafeguards: 'ignorePreviousSafeguards_v2' in record
      ? (toBoolish(record['ignorePreviousSafeguards_v2']) ?? SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS)
      : parsedSubstats.length > 0
        ? false
        : (toBoolish(record.ignorePreviousSafeguards) ?? SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS),
    ignoreEquippedInCollection: toBoolish(record.ignoreEquippedInCollection) ?? SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION,
    ignoreEquippedInVault: toBoolish(record.ignoreEquippedInVault) ?? SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT,
    substats: parsedSubstats,
    substatMatch,
    substatWeights: parseSubstatWeights(weightsSource),
    improvementChanceThreshold,
  }))
}

/**
 * normalizeSafeguardFactionSlotScope
 *
 * Faction filters only apply to accessory artifacts (ring/amulet/banner). A rule
 * with `factions` set but `slots = []` ("Any slot") would silently target armor
 * pieces that can never satisfy the faction filter. This mirrors
 * normalizeFactionSlotScope on the recipe side: when factions are non-empty and
 * slots are empty, fill slots with all three accessory ids so the saved rule is
 * internally consistent. Called by the multi-edit apply pipeline and by the
 * single-edit insert/apply handlers in App.tsx.
 */
export function normalizeSafeguardFactionSlotScope(rule: SafeguardRule): SafeguardRule {
  const factions = rule.combination.factions ?? []
  if (factions.length === 0) return rule
  const slots = rule.combination.slots ?? []
  if (slots.length > 0) return rule
  return {
    ...rule,
    combination: {
      ...rule.combination,
      slots: [...ACCESSORY_SLOT_IDS] as typeof rule.combination.slots,
    },
  }
}

/**
 * normalizeSafeguardSubstatDependents
 *
 * Post-parse gate called by normalizeSafeguardRule (covering all load paths) and
 * re-used by the multi-edit apply pipeline in safeguardMultiEditDraft.ts.
 * - Zero substats: clears improvement-chance, substat-match, and substat-weights.
 * - One substat: coerces Min2–Min4 to Min1 (impossible thresholds for a single substat).
 */
export function normalizeSafeguardSubstatDependents(rule: SafeguardRule): SafeguardRule {
  const substats = rule.substats ?? []
  let next = rule

  // With N substats, a numeric threshold > N can never be satisfied — clamp to N.
  // Covers all cases: 1 substat with >=2, 2 substats with >=3, etc.
  // PerSubstat is a non-numeric token so Number() returns NaN and is left untouched.
  if (substats.length >= 1) {
    const threshold = Number(next.substatMatch)
    if (Number.isFinite(threshold) && threshold > substats.length) {
      next = { ...next, substatMatch: String(substats.length) as SafeguardSubstatMatch }
    }
    return next
  }
  // Improvement-chance requires at least one substat to be meaningful.
  if (next.improvementChanceThreshold !== SAFEGUARD_DEFAULT_IMPROVEMENT_CHANCE_THRESHOLD) {
    next = { ...next, improvementChanceThreshold: SAFEGUARD_DEFAULT_IMPROVEMENT_CHANCE_THRESHOLD }
  }
  // substatMatch reverts to Min1 (at-least-one default) with no substats to match against.
  if (next.substatMatch !== SafeguardSubstatMatch.Min1) {
    next = { ...next, substatMatch: SafeguardSubstatMatch.Min1 }
  }
  // Prune any stale weight entries (none should remain without substats).
  const pruned = pruneSafeguardsSubstatWeights(next.substatWeights, substats)
  if (pruned !== next.substatWeights) {
    next = { ...next, substatWeights: pruned }
  }
  return next
}

// Read finite positive value for one substat variant from the artifact.
// Shared by both the scoring helper below and safeguardImprovementChance.ts.
const getArtifactSubstatValue = (artifact: NormalizedGearArtifact, variant: number): number => {
  for (const substat of artifact.substats ?? []) {
    if (Number(substat.variant) !== variant) continue
    const value = Number(substat.totalValue)
    if (!Number.isFinite(value) || value <= 0) return 0
    return value
  }
  return 0
}

// Compute safeguard ranking score using weighted normalized selected substats.
// Includes glyph potential: for each present glyphable substat, the average glyph
// enchantment value for the artifact's rank is added to the score. This accounts for
// higher-rank gear having access to stronger glyphs even if raw substats are lower.
// Exported so safeguardImprovementChance.ts shares one definition (SSOT).
export const computeSafeguardScoreFromArtifact = (
  artifact: NormalizedGearArtifact,
  selectedSubstats: readonly number[],
  weights: ReadonlyMap<number, number>,
): number => {
  const rank = Number(artifact.rank)
  let total = 0
  for (const variant of selectedSubstats) {
    const raw = getArtifactSubstatValue(artifact, variant)
    const normalized = normalizeSubstatByMax6(variant as StatVariant, raw)
    const weight = Number(weights.get(variant) ?? 1)
    total += weight * normalized
    // Add glyph potential for present substats (0 for non-glyphable or missing).
    if (raw > 0) {
      const glyphAvg = getGlyphAverageForVariant(rank, variant)
      if (glyphAvg > 0) {
        total += weight * normalizeSubstatByMax6(variant as StatVariant, glyphAvg)
      }
    }
  }
  return Number.isFinite(total) ? total : 0
}

// Normalize a rule's substatWeights map into a numeric variant→weight map.
// Exported so safeguardImprovementChance.ts imports this instead of duplicating.
export const normalizeRuleWeights = (weights: Partial<Record<number, number>>): ReadonlyMap<number, number> => {
  const out = new Map<number, number>()
  for (const [rawVariant, rawWeight] of Object.entries(weights ?? {})) {
    const variant = Number(rawVariant)
    const weight = Number(rawWeight)
    if (!Number.isFinite(variant) || !Number.isFinite(weight)) continue
    if (variant <= 0) continue
    out.set(Math.floor(variant), weight)
  }
  return out
}

// Empty selection means wildcard; otherwise candidate must be explicitly listed.
// Exported so safeguardImprovementChance.ts shares the same semantics (SSOT).
export const matchesCombinationFilter = (selection: readonly number[], candidate: number): boolean => (
  selection.length === 0 || selection.includes(candidate)
)

// Resolve include/exclude set ID sets from a combination's sets array.
// Excluded entries take priority over included ones; duplicates collapse.
// Exported so safeguardImprovementChance.ts reuses this logic instead of duplicating.
export function resolveSetIdFilter(sets: readonly ArtifactSetSelectionEntry[]): {
  includeSetIds: ReadonlySet<number>
  excludeSetIds: ReadonlySet<number>
} {
  const includeSetIds = new Set<number>()
  const excludeSetIds = new Set<number>()
  for (const entry of sets ?? []) {
    const setId = Number(entry?.id)
    if (!Number.isFinite(setId)) continue
    // Excluded entries win; remove from include if it was already there.
    if (entry?.excluded === true) {
      excludeSetIds.add(setId)
      includeSetIds.delete(setId)
      continue
    }
    // Skip if already in the exclude list.
    if (excludeSetIds.has(setId)) continue
    includeSetIds.add(setId)
  }
  return { includeSetIds, excludeSetIds }
}

/** Shared helper for mapping Gear Inspector artifacts to the detection item key. */
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
// Returns the normalized domain as an opaque wire object (short field names) for WASM consumption.
const buildSafeguardExpectedGroupDomain = (): Record<string, unknown> => {
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
  rows: readonly GearInspectorPreviewRow[]
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
    throw new Error(`WASM safeguard candidate collection is unavailable: ${String(error)}`, { cause: error })
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
  // Pre-compute improvement chances when any rule uses improvementChanceThreshold; the results
  // are passed to the detection WASM call so ranking can gate on the threshold.
  const hasThreshold = rules.some((r) => r.improvementChanceThreshold !== null && r.improvementChanceThreshold !== undefined)
  // Unwrap the { entries, diag } wrapper; diag is only used in the worker dev-tracing path.
  const improvementChances = hasThreshold ? (computeImprovementChanceWithLoadedWasm({ rules, enabled })?.entries ?? []) : []
  // Pass canonical rows/rules and let wasm produce the detection payload.
  const combined = collectAndComputeSafeguardProtectionWithLoadedWasm({
    rows,
    rules: baseRuleList,
    recipeModes,
    ...(ignoreRecipeSet ? { ignoreSafeguardRecipeIndices: ignoreRecipeSet } : {}),
    safeguardRules: rules,
    improvementChances,
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

// toWasmTestItem now lives in ./wasm/wasmRuleEngine.ts (SSOT moved alongside the
// evaluate wrappers that depend on it).  Re-exported here so downstream callers
// importing from './safeguards' keep working without changing their import paths,
// and so the toWasmSafeguardCandidate helper below can keep calling it locally.
// See the canonical definition for the full rationale (drift gate +
// heap-fragmentation mitigation).
export { toWasmTestItem }

// Build a compact WASM artifact payload from a NormalizedGearArtifact.
// Includes only the fields SafeguardWasmArtifactRawIn reads, eliminating
// serde_wasm_bindgen overhead from iterating ignored properties — which is
// catastrophically slow in Firefox for 8k+ artifacts with 9-field NormalizedStat substats.
// mainStat is passed as a plain variant number so serde immediately matches Variant(i64),
// skipping the failed object-attempt of the untagged enum fallback path.
// Reused by both toWasmArtifactStoreRow (store path) and toWasmSafeguardCandidate
// (compute_safeguard_protection_value path) to keep the projection SSOT.
export const toWasmArtifactStoreInput = (artifact: NormalizedGearArtifact): WasmArtifactStoreInput => ({
  id: artifact.id,
  slot: artifact.slot,
  set: artifact.set,
  rank: artifact.rank,
  rarity: artifact.rarity,
  level: artifact.level,
  exactLevel: artifact.exactLevel ?? null,
  faction: artifact.faction,
  mainStat: artifact.mainStat?.variant ?? null,
  substats: artifact.substats.map((s) => ({
    variant: s.variant,
    isFlat: s.isFlat,
    // `value` is the engine-canonical value (== totalValue for normalized substats);
    // SafeguardWasmSubstatRawIn declares both, so the projection must populate both
    // to keep ts-rs's strict `T | null` contract satisfied. Runtime Rust treats
    // either as a fallback via #[serde(default)], so the duplication is harmless.
    value: s.totalValue ?? null,
    totalValue: s.totalValue ?? null,
    rolls: s.rolls ?? null,
  })),
  // Forward the nested champion reference so the WASM safeguard parser can read
  // `equippedChampion.location` (collection/vault). null when the artifact has no
  // equipped-champion link or the location is unknown.
  equippedChampion: artifact.equippedChampion?.location != null
    ? { location: artifact.equippedChampion.location }
    : null,
  // Trim gearInspectorItem via toWasmTestItem — see that function's comment for why.
  gearInspectorItem: toWasmTestItem(artifact.gearInspectorItem),
})

// Wrap the artifact projection in the row shape SafeguardCollectRowFastIn expects.
// Thin wrapper around toWasmArtifactStoreInput so both call sites share the projection.
export const toWasmArtifactStoreRow = (artifact: NormalizedGearArtifact): WasmArtifactStoreRow => ({
  artifact: toWasmArtifactStoreInput(artifact),
})

// Content fingerprint of the artifact dataset for the pipeline result cache (App.tsx). Two
// datasets with the same fingerprint produce byte-identical pipeline output (matches, merged
// rules, detection), so a cache keyed on it lets an add-then-remove endpoint round-trip reuse
// a prior result instead of recomputing (~3.9 s on large accounts).
//
// CRITICAL: it must fold EXACTLY the fields that cross to WASM and affect matching/merge/
// detection — i.e. the projection in toWasmArtifactStoreInput / toWasmTestItem (the SSOT this
// mirrors): id, slot, set, rank, rarity, level, exactLevel, faction, mainStat.variant, each
// substat's (variant, isFlat, totalValue, rolls), and equippedChampion.location. It must NOT
// fold fields that are display-only or never reach the engine — `lastUseLocalTimestamp`
// (changes every game round → would defeat round-trip hits), `rerollCount`, `ascension`,
// `source`, `isLocked`, and champion id/name/rarity — none of which are in the WASM projection.
// Any output-affecting field omitted here = a stale cache hit; any display field included =
// missed hits. Keep this in lockstep with toWasmArtifactStoreInput.
//
// Note on gearInspectorItem: toWasmArtifactStoreInput also forwards `gearInspectorItem`, but
// toWasmTestItem reads only `previewExtras.id` from it — and that id is `row.ID`, the same value
// as `artifact.id` (see gearDbNormalizer) — so folding `a.id` covers it. No separate term needed.
//
// 53-bit two-lane fold (combined into one decimal string) keeps the collision probability
// negligible at ~8k artifacts, far better than a single 32-bit hash.
export const computeArtifactSetContentHash = (artifacts: readonly NormalizedGearArtifact[]): string => {
  // Two independent 32-bit FNV-ish lanes, combined → effectively ~53 bits of key space.
  let h1 = 0x811c9dc5 | 0
  let h2 = 0x1000193 | 0
  const mix = (n: number): void => {
    const v = n | 0
    h1 = Math.imul(h1 ^ v, 0x01000193) | 0
    h2 = Math.imul(h2 ^ v, 0x85ebca6b) | 0
  }
  // Order matters: the pipeline consumes artifacts in array order, so we fold in order (no sort).
  for (const a of artifacts) {
    mix(a.id)
    mix(a.slot); mix(a.set); mix(a.rank); mix(a.rarity); mix(a.level)
    mix(a.exactLevel ?? -1)
    mix(a.faction)
    mix(a.mainStat?.variant ?? -1)
    mix(a.substats.length)
    for (const s of a.substats) {
      mix(s.variant)
      mix(s.isFlat ? 1 : 0)
      // totalValue can be fractional; scale + round so equal values fold identically.
      mix(Math.round((s.totalValue ?? 0) * 1000))
      mix(s.rolls ?? -1)
    }
    // equippedChampion.location (collection/vault) drives safeguard ignore-equipped logic; it is
    // the only champion-derived field in the WASM projection. Fold its string deterministically.
    const loc = a.equippedChampion?.location ?? ''
    mix(loc.length)
    for (let i = 0; i < loc.length; i += 1) mix(loc.charCodeAt(i))
    // Per-artifact terminator so [A,B] and [AB] (boundary-ambiguous folds) can't collide.
    mix(0x9e3779b9)
  }
  // Combine lanes into one unsigned-decimal string key.
  return `${(h1 >>> 0).toString(36)}.${(h2 >>> 0).toString(36)}.${artifacts.length}`
}

// Project a SafeguardCandidate into the WASM wire shape declared by
// SafeguardWasmCandidateFastIn. Drops the TS-side `row: GearInspectorPreviewRow`
// reference (Rust does not read it) and projects the artifact down to only the
// fields SafeguardWasmArtifactRawIn declares.  Required by the JSON-string path of
// compute_safeguard_protection_value: deny_unknown_fields would otherwise reject
// the payload because of the extra `row` key.
export const toWasmSafeguardCandidate = (candidate: SafeguardCandidate): WasmSafeguardCandidateInput => ({
  itemKey: candidate.itemKey,
  groupKey: candidate.groupKey,
  isSold: candidate.isSold,
  artifact: toWasmArtifactStoreInput(candidate.artifact),
})

// Project a GearInspectorPreviewRow into the WASM wire shape declared by
// SafeguardCollectRowFastIn (wasm/rule_engine_core/src/safeguards/fast_path_types.rs).
// Required by the JSON-string path of collect_safeguard_candidates_value and
// collect_and_compute_safeguard_protection_value: deny_unknown_fields rejects the
// preview row's `match` / `matchingRecipeIndices` / `matchingRecipeDecisions` fields
// (Rust derives base-match presence from baseMatch alone — the row's
// `match` field is the post-safeguard outcome, intentionally not mirrored).
// baseMatch is trimmed to SafeguardCandidateResolveBaseMatchIn's exact field
// set (`keep` + `recipeIdx`) — display-only extras like recipeName / ruleIndex /
// ruleLabel / ruleSource / safeguardRuleId / safeguardRuleOrdinal are stripped.
export const toWasmSafeguardCollectRow = (row: GearInspectorPreviewRow): WasmSafeguardCollectRowInput => ({
  artifact: toWasmArtifactStoreInput(row.artifact),
  // `item` is optional on the wire: Rust falls back to artifact.gearInspectorItem
  // when missing. The TS row carries gearInspectorItem on the artifact already,
  // so we never need to send a separate item — always null.
  item: null,
  // Let Rust derive base-match presence from baseMatch alone (the existing
  // unwrap_or(base_match.is_some()) path).
  baseMatchDefined: null,
  // Trim baseMatch to the exact fields Rust declares
  // (SafeguardCandidateResolveBaseMatchIn: keep + recipeIdx). Display-only extras
  // on GearInspectorPreviewMatch (recipeName / ruleIndex / ruleLabel / ruleSource /
  // safeguardRuleId / safeguardRuleOrdinal) are stripped.
  baseMatch: row.baseMatch != null
    ? { keep: row.baseMatch.keep, recipeIdx: row.baseMatch.recipeIdx }
    : null,
})

// Strip ImprovementChanceWasmEntry to the Rust wire shape declared by
// ImprovementChanceInput in rule_engine_wasm/src/lib.rs.  chancePercent /
// hasMatchingSafeguard / matchedRuleId / ruleOrdinal / debug are display-only
// fields the Rust struct does NOT declare; deny_unknown_fields rejects them now
// that compute_safeguard_protection_value parses via serde_json::from_str.
export const toWasmImprovementChanceInput = (entry: ImprovementChanceWasmEntry): WasmImprovementChanceInput => ({
  artifactId: entry.artifactId,
  chancesByRuleOrdinal: entry.chancesByRuleOrdinal,
})

// Store pre-parsed artifact rows in WASM engine state for the combined evaluate+collect path.
// Must be called after configureWasmRuleEngine and before evaluateAndCollectSafeguardProtection.
// Re-call whenever the artifact DB changes. Rows must include artifact.gearInspectorItem.
export function storeArtifactRows(rows: readonly WasmArtifactStoreRow[]): void {
  storeArtifactRowsWithLoadedWasm({ rows })
}

// Combined evaluate + safeguard-detect helper — replaces the detection phase's
// buildPipelineMatches + collectAndComputeSafeguardProtection two-step sequence.
// Caller must configure the WASM engine via configureWasmRuleEngine and store artifact
// rows via storeArtifactRows before calling this function.
//
// `precomputedImprovementChances` may be supplied by callers that already computed
// improvement-chance entries for the same stored rows and rules (e.g. the rule-cache
// worker computes once for the payload and passes the result here for threshold gating,
// avoiding a second WASM call that would double peak memory pressure).
// When omitted and any rule carries an improvementChanceThreshold, the computation is
// performed internally.
export function evaluateAndCollectSafeguardProtection(params: {
  options?: WasmRuleEngineEvaluateOptions
  rules: readonly SafeguardRule[]
  ignoreSafeguardRecipeIndices?: ReadonlySet<number>
  enabled: boolean
  now?: number
  precomputedImprovementChances?: readonly ImprovementChanceWasmEntry[]
}): { evaluateResults: WasmEvaluateAndCollectSnapshot['evaluateResults']; detection: SafeguardDetectionSnapshot } {
  const { options, rules, enabled } = params
  const timestamp = Number.isFinite(params.now) ? Number(params.now) : Date.now()
  // Use pre-computed entries when the caller already has them; otherwise compute internally
  // only when a threshold rule is present. This prevents a second WASM computation (and
  // second peak-allocation for the result Vec) when the worker supplies entries for the
  // payload alongside this detection call.
  let improvementChances: readonly ImprovementChanceWasmEntry[]
  if (params.precomputedImprovementChances !== undefined) {
    improvementChances = params.precomputedImprovementChances
  } else {
    const hasThreshold = rules.some((r) => r.improvementChanceThreshold !== null && r.improvementChanceThreshold !== undefined)
    // Unwrap the { entries, diag } wrapper; diag is only used in the worker dev-tracing path.
    improvementChances = hasThreshold ? (computeImprovementChanceWithLoadedWasm({ rules, enabled })?.entries ?? []) : []
  }
  // Rows are read from WASM engine state (stored via storeArtifactRows); no row param needed.
  const result = evaluateAndCollectSafeguardProtectionWithLoadedWasm({
    ...(options !== undefined ? { options } : {}),
    ...(params.ignoreSafeguardRecipeIndices !== undefined ? { ignoreSafeguardRecipeIndices: params.ignoreSafeguardRecipeIndices } : {}),
    safeguardRules: rules,
    improvementChances,
    expectedGroupDomain: buildSafeguardExpectedGroupDomain(),
    enabled,
    now: timestamp,
  })
  if (!isSafeguardDetectionSnapshot(result.detection)) {
    throw new Error('WASM evaluate-and-collect safeguard pipeline returned an invalid detection payload.')
  }
  return { evaluateResults: result.evaluateResults, detection: result.detection }
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
    metaSetNames: [...(recipe.artifactMetaSets ?? [])],
    ranks,
    rarities,
    mainStats: [...(recipe.mainStatsV ?? [])],
    factions,
  })
}

export function resolveSafeguardRuleLabel(source: SafeguardLabelSource): string | null {
  if (!source) return null
  // SafeguardRule carries appearance.name; HsfRuleWithRecipe carries RecipeName.
  const rawName = 'RecipeName' in source
    ? (source as HsfRuleWithRecipe).RecipeName
    : (source as SafeguardRule).appearance?.name
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
  // Fall back to the legacy __safeguardRuleId stamp on injected HSF rows (HsfRuleWithRecipe).
  const fallbackId = 'RecipeName' in source ? (source as HsfRuleWithRecipe).__safeguardRuleId : null
  if (typeof fallbackId === 'string') {
    const trimmed = fallbackId.trim()
    if (trimmed.length > 0) return `#${trimmed}`
  }
  return null
}

// ── Shared safeguard substat constraint helpers ───────────────────────────────
// These are SSOT exports consumed by both SafeguardBuilderPanel and SafeguardsTab.
// Keeping them here avoids duplicating the logic across component files.

/** Compares two numeric arrays element-wise without allocating new copies. */
export function areArraysEqual(left: readonly number[], right: readonly number[]): boolean {
  // Fast path: shared reference means equal.
  if (left === right) return true
  // Different lengths can never match.
  if (left.length !== right.length) return false
  // Walk in order so position changes are detected.
  for (let i = 0; i < left.length; i++) {
    if (Number(left[i]) !== Number(right[i])) return false
  }
  return true
}

/** Compares two substat weight maps by key-value pairs (order-independent). */
export function areWeightMapsEqual(
  left: Partial<Record<StatVariant, number>> | null | undefined,
  right: Partial<Record<StatVariant, number>> | null | undefined,
): boolean {
  // Fast path: same reference.
  if (left === right) return true
  const leftKeys = Object.keys(left ?? {})
  const rightKeys = Object.keys(right ?? {})
  // Different key counts → cannot match.
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right ?? {}, key)) return false
    // Normalize to number for a stable comparison across coercion.
    if (Number((left ?? {})[key as unknown as StatVariant]) !== Number((right ?? {})[key as unknown as StatVariant])) {
      return false
    }
  }
  return true
}

/** Drops weight entries for substats that are not in the current selection. */
export function pruneSafeguardsSubstatWeights(
  weights: Partial<Record<StatVariant, number>> | null | undefined,
  selected: readonly StatVariant[],
): Partial<Record<StatVariant, number>> {
  // Nothing to prune when weights are empty.
  if (!weights || Object.keys(weights).length === 0) return {}
  if (!selected.length) return {}
  const allowed = new Set(selected.map((v) => Number(v)))
  const next: Partial<Record<StatVariant, number>> = {}
  for (const [key, raw] of Object.entries(weights)) {
    const variant = Number(key)
    // Skip non-numeric keys and unselected variants.
    if (!Number.isFinite(variant) || !allowed.has(variant)) continue
    const normalized = normalizeGearInspectorSortWeight(Number(raw))
    // Omit entries that equal the default so the map stays compact.
    if (normalized === GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT) continue
    next[variant as StatVariant] = normalized
  }
  return next
}

/**
 * Applies slot/main-stat constraints to the rule's substat selection and
 * updates the substat match + weights accordingly. Returns the same reference
 * when nothing changed so callers can do cheap identity checks.
 */
export function constrainSafeguardSubstats(
  rule: SafeguardRule,
  combination: SafeguardRule['combination'],
): SafeguardRule {
  // Sort the combination first so exports and comparisons stay deterministic.
  const sortedCombination = sortSafeguardCombination(combination)
  // Determine which substats are still valid for the updated slot/main scope.
  const filtered = sortSafeguardSubstats(retainAllowedSubstats(
    rule.substats ?? [],
    (v) => v,
    { slots: sortedCombination.slots, mainStats: sortedCombination.mainStats },
  ))
  // Substat match only applies when a selection exists; reset otherwise.
  const nextMatch = filtered.length > 0 ? rule.substatMatch : SafeguardSubstatMatch.Min1
  // Drop weight entries that no longer have a corresponding substat.
  const nextWeights = pruneSafeguardsSubstatWeights(rule.substatWeights, filtered)
  // Bail early when only the combination changed; avoids a needless re-render.
  const substatsUnchanged = areArraysEqual(filtered, rule.substats ?? [])
  const matchUnchanged = nextMatch === rule.substatMatch
  const weightsUnchanged = areWeightMapsEqual(nextWeights, rule.substatWeights)
  if (substatsUnchanged && matchUnchanged && weightsUnchanged) {
    return { ...rule, combination: sortedCombination }
  }
  return { ...rule, combination: sortedCombination, substats: filtered, substatMatch: nextMatch, substatWeights: nextWeights }
}

/**
 * Returns true when substat weight controls should be available for a rule.
 * Weights apply to Any and All modes: relative weighting shifts which substats
 * score higher when ranking drops. Per Substat forces equal weighting by design
 * since each stat is evaluated independently. This is the single source of
 * truth used by both SafeguardBuilderPanel and SafeguardsTab.
 */
export function safeguardWeightsEnabled(
  substatMatch: SafeguardRule['substatMatch'],
  hasSubstatSelection: boolean,
): boolean {
  // Short-circuit: weights are irrelevant with no substats regardless of mode.
  if (!hasSubstatSelection) return false
  // Per Substat evaluates each stat independently with equal weighting.
  return normalizeSafeguardSubstatMatch(substatMatch) !== SafeguardSubstatMatch.PerSubstat
}
