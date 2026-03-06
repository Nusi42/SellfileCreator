import type { NormalizedGearArtifact } from './importers/gearDbNormalizer'
import type {
  SafeguardRule,
  SafeguardRuleCountMode,
  SafeguardSubstatMatch,
} from './safeguards'
import {
  computeEquippedCollectionFloorScore,
  computeSafeguardScoreFromArtifact,
  getSafeguardCountKey,
  normalizeRuleWeights,
  SafeguardRuleActivation,
  SafeguardSubstatMatch as SafeguardSubstatMatchToken,
  sanitizeSafeguardCountMode,
} from './safeguards'
import { substatMatchesMainVariant } from './statCompatibility'
import { isAccessorySlot } from './gearInspectorDomain'
import { SUBSTAT_ROLL_MAX_6_BY_VARIANT, normalizeSubstatByMax6 } from './substatRollNormalization'
import { ALLOWED_SUB_BY_SLOT, StatVariant } from './types'

// Upgrade chance is always projected to +16 because safeguards compare final gear value.
const SAFEGUARD_UPGRADE_TARGET_LEVEL = 16
// Gear can never hold more than four substats.
const SAFEGUARD_MAX_SUBSTAT_SLOTS = 4
// Upgrade milestones are fixed for gear progression.
const ROLL_MILESTONES = [4, 8, 12, 16] as const
// Rarity decides which milestones add a new substat instead of rolling one.
const ADDITION_LEVELS_BY_RARITY: Record<number, readonly number[]> = {
  1: [4, 8, 12, 16],
  2: [8, 12, 16],
  3: [12, 16],
  4: [16],
  5: [],
  6: [],
}
// Rust safeguard ranking treats tiny score deltas as ties.
const SAFEGUARD_SCORE_TIE_EPSILON = 1e-9
// State values are scaled so recursion keys stay deterministic.
const STATE_VALUE_SCALE = 1000
// Unknown/new substats use a conservative expected roll quality baseline.
const UNKNOWN_ROLL_QUALITY_RATIO_AT_RANK_SIX = 0.83
// Lower-rank gear rolls weaker on average, so scale unknown gains down.
const UNKNOWN_ROLL_MIN_RANK_SCALE = 0.6

type PreparedSafeguardRule = {
  // Preserve source list order so tied overlays can pick the top-most safeguard.
  ruleOrder: number
  // Rule id is preserved so the UI can deep-link from chance overlays.
  ruleId: string
  // Non-substat filters must mirror safeguard matcher eligibility.
  slots: readonly number[]
  ranks: readonly number[]
  rarities: readonly number[]
  mainStats: readonly number[]
  factions: readonly number[]
  // Set selection is split once to keep per-artifact checks cheap.
  includeSetIds: ReadonlySet<number>
  excludeSetIds: ReadonlySet<number>
  // Ranked safeguard behavior depends on required count + count mode.
  requiredPerGroup: number
  countMode: SafeguardRuleCountMode
  // Active substat target list drives score + gating.
  selectedSubstats: readonly number[]
  substatMatch: SafeguardSubstatMatch
  // Substat weights default to 1.0 when variant entries are missing.
  weights: ReadonlyMap<number, number>
  // Equipped ignore toggles must match safeguard rule semantics.
  ignoreEquippedInCollection: boolean
  ignoreEquippedInVault: boolean
  // Pre-computed score floor derived from beatEquippedPercentile; null = disabled.
  equippedFloorScore: number | null
}

type RuleScenario = {
  // Preserve source safeguard order for deterministic tie resolution.
  ruleOrder: number
  // Every scenario maps back to one safeguard rule id for click-through navigation.
  ruleId: string
  // Full safeguard substat selection (not per-scenario split) for tie-break matching count.
  ruleSelectedSubstats: readonly number[]
  // Original rule match mode before per-substat expansion (used by debug snapshots for tooltip display).
  ruleSubstatMatch: SafeguardSubstatMatch
  // Candidate must pass these non-substat filters before scenario applies.
  applicableArtifactIds: ReadonlySet<number>
  // Scenario substats are either the full rule set or one variant for per-substat mode.
  selectedSubstats: readonly number[]
  substatMatch: SafeguardSubstatMatch
  // Ranked compare requires per-group quota and deterministic count keying.
  requiredPerGroup: number
  countMode: SafeguardRuleCountMode
  // Score weights mirror safeguard ranking math.
  weights: ReadonlyMap<number, number>
  // Challengers are pre-bucketed by count key so per-item evaluation stays fast.
  challengersByCountKey: ReadonlyMap<string, readonly StaticCandidate[]>
}

type StaticCandidate = {
  artifactId: number
  score: number
  rank: number
  mainStat: number
}

type UpgradeRecursionContext = {
  // Target artifact is needed for count key + tie-break metadata.
  artifact: NormalizedGearArtifact
  artifactId: number
  // Applicable safeguard scenarios for this artifact.
  scenarios: readonly RuleScenario[]
  // Remaining upgrade events to +16.
  milestones: readonly number[]
  additionMilestones: ReadonlySet<number>
  // Legal additions depend on slot/main constraints.
  legalAdditionPool: readonly number[]
  // Existing variants may use observed roll quality while unknown variants use fallback.
  expectedGainByVariantScaled: ReadonlyMap<number, number>
  fallbackGainByVariantScaled: ReadonlyMap<number, number>
}

type ArtifactScenarioViabilityContext = {
  // Current substat state (scaled) used to check already-present requirements.
  initialState: ReadonlyMap<number, number>
  // Max number of future addition events that can add missing variants.
  maxAdditionEvents: number
  // Legal addable variants for this slot/main combination.
  legalAdditionPool: ReadonlySet<number>
}

export type SafeguardUpgradeChanceEntry = {
  // Compact integer chance (0..100) for this artifact to be safeguard-selected at +16.
  chancePercent: number
  // True when at least one substat safeguard applies to this artifact.
  hasMatchingSafeguard: boolean
  // Preferred safeguard rule target for click-through navigation.
  matchedRuleId: string | null
  // Optional debug snapshot used by UI tooltips to explain chance outcomes.
  debug?: SafeguardUpgradeChanceDebug
}

export type SafeguardUpgradeChanceDebug = {
  // Number of artifacts used as the comparison dataset for this chance run.
  sourceArtifactCount: number
  // Number of viable scenarios that can make this artifact safeguard-selected.
  viableScenarioCount: number
  // Selected substats used by the preferred scenario.
  selectedSubstats: readonly number[]
  // Match mode (`any` / `all`) for the preferred scenario.
  substatMatch: SafeguardSubstatMatch
  // Required keeps for this safeguard count bucket.
  requiredPerGroup: number
  // Number of comparable challengers currently in the same count bucket.
  bucketCandidateCount: number
  // Number of challengers currently strictly better than this artifact.
  betterCandidateCount: number
  // Current matched selected-substat count on the artifact.
  matchedSelectedNow: number
  // Remaining add-substat events before +16 (rarity + missing-slot bounded).
  maxAdditionEventsTo16: number
}

// Empty selection means wildcard; otherwise candidate must be explicitly selected.
const matchesSelection = (selection: readonly number[], candidate: number): boolean => (
  selection.length === 0 || selection.includes(candidate)
)

// Clamp numeric levels so malformed snapshots cannot break upgrade scheduling.
const clampLevel = (value: unknown): number => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  if (numeric <= 0) return 0
  if (numeric >= SAFEGUARD_UPGRADE_TARGET_LEVEL) return SAFEGUARD_UPGRADE_TARGET_LEVEL
  return Math.floor(numeric)
}

// Rarity parsing is normalized to 1..6 for addition schedule lookups.
const clampRarity = (value: unknown): number => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 1
  const floored = Math.floor(numeric)
  if (floored <= 1) return 1
  if (floored >= 6) return 6
  return floored
}

// Rank parsing is normalized to 1..6 for unknown-roll scaling.
const clampRank = (value: unknown): number => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 1
  const floored = Math.floor(numeric)
  if (floored <= 1) return 1
  if (floored >= 6) return 6
  return floored
}

// Sanitize selected substats so wildcard sentinels never enter score/gating math.
const normalizeSelectedSubstats = (values: readonly number[]): number[] => {
  const seen = new Set<number>()
  const out: number[] = []
  for (const raw of values) {
    const numeric = Number(raw)
    if (!Number.isFinite(numeric)) continue
    const variant = Math.floor(numeric)
    if (variant <= 0) continue
    if (variant === Number(StatVariant.Any) || variant === Number(StatVariant.RollCount)) continue
    if (seen.has(variant)) continue
    seen.add(variant)
    out.push(variant)
  }
  return out
}

// Flatten active safeguard rules with selected substats into precomputed descriptors.
// Accepts the current artifact list so floor scores can be derived per rule.
const prepareSubstatSafeguardRules = (
  rules: readonly SafeguardRule[],
  artifacts: readonly NormalizedGearArtifact[],
): PreparedSafeguardRule[] => {
  const prepared: PreparedSafeguardRule[] = []
  for (const [ruleOrder, rule] of rules.entries()) {
    // Disabled safeguards cannot contribute upgrade chance.
    if (rule.activation === SafeguardRuleActivation.Off) continue
    // This overlay only uses safeguards that explicitly select substats.
    const selectedSubstats = normalizeSelectedSubstats(rule.substats ?? [])
    if (selectedSubstats.length === 0) continue
    // Include/exclude set precedence mirrors safeguard matching behavior.
    const includeSetIds = new Set<number>()
    const excludeSetIds = new Set<number>()
    for (const entry of rule.combination.sets ?? []) {
      const setId = Number(entry?.id)
      if (!Number.isFinite(setId)) continue
      if (entry?.excluded === true) {
        excludeSetIds.add(setId)
        includeSetIds.delete(setId)
        continue
      }
      if (excludeSetIds.has(setId)) continue
      includeSetIds.add(setId)
    }
    // Substat match defaults to `any` unless `all` was explicitly selected.
    const normalizedMatch = (
      rule.substatMatch === SafeguardSubstatMatchToken.All
        ? SafeguardSubstatMatchToken.All
        : (
          rule.substatMatch === SafeguardSubstatMatchToken.PerSubstat
            ? SafeguardSubstatMatchToken.PerSubstat
            : SafeguardSubstatMatchToken.Any
        )
    )
    // Extract slots and weights as locals so the floor score can reuse them.
    const slots = (rule.combination.slots ?? []).map((value) => Number(value)).filter(Number.isFinite)
    const weights = normalizeRuleWeights(rule.substatWeights ?? {})
    // Compute equipped quality floor when beatEquippedPercentile is configured.
    const percentile = rule.beatEquippedPercentile
    const equippedFloorScore = (percentile !== null && percentile !== undefined && Number.isFinite(percentile))
      ? computeEquippedCollectionFloorScore(artifacts, slots, selectedSubstats, weights, percentile)
      : null
    prepared.push({
      ruleOrder,
      ruleId: typeof rule.id === 'string' ? rule.id.trim() : '',
      slots,
      ranks: (rule.combination.ranks ?? []).map((value) => Number(value)).filter(Number.isFinite),
      rarities: (rule.combination.rarities ?? []).map((value) => Number(value)).filter(Number.isFinite),
      mainStats: (rule.combination.mainStats ?? []).map((value) => Number(value)).filter(Number.isFinite),
      factions: (rule.combination.factions ?? []).map((value) => Number(value)).filter(Number.isFinite),
      includeSetIds,
      excludeSetIds,
      requiredPerGroup: Math.max(1, Math.floor(Number(rule.requiredCount) || 1)),
      countMode: sanitizeSafeguardCountMode(rule.countMode),
      selectedSubstats,
      substatMatch: normalizedMatch,
      weights,
      ignoreEquippedInCollection: rule.ignoreEquippedInCollection === true,
      ignoreEquippedInVault: rule.ignoreEquippedInVault === true,
      equippedFloorScore,
    })
  }
  return prepared
}

// Apply non-substat safeguard filters to decide rule applicability.
const ruleAppliesToArtifact = (rule: PreparedSafeguardRule, artifact: NormalizedGearArtifact): boolean => {
  // Equipped ignore toggles run first so skipped items fail fast.
  const equippedLocation = artifact.equippedChampionLocation
  if (rule.ignoreEquippedInCollection && equippedLocation === 'collection') return false
  if (rule.ignoreEquippedInVault && (equippedLocation === 'vault' || equippedLocation === 'reserveVault')) return false
  // Quality floor: collection-equipped pieces are the reference and always pass.
  // Skip the check for low-level gear (<12); upgrade-chance handles those instead.
  if (rule.equippedFloorScore !== null && equippedLocation !== 'collection') {
    const level = clampLevel(artifact.exactLevel ?? artifact.level)
    if (level >= 12) {
      const score = computeSafeguardScoreFromArtifact(artifact, rule.selectedSubstats, rule.weights)
      if (score < rule.equippedFloorScore) return false
    }
  }
  // Slot, set, rank, and rarity all use wildcard-aware selection matching.
  const slot = Number(artifact.slot)
  const setId = Number(artifact.set)
  const rank = Number(artifact.rank)
  const rarity = Number(artifact.rarity)
  if (!matchesSelection(rule.slots, slot)) return false
  if (rule.excludeSetIds.has(setId)) return false
  if (rule.includeSetIds.size > 0 && !rule.includeSetIds.has(setId)) return false
  if (!matchesSelection(rule.ranks, rank)) return false
  if (!matchesSelection(rule.rarities, rarity)) return false
  // Missing main stat falls back to the Any sentinel for filtering.
  const mainStat = Number(artifact.mainStat?.variant ?? StatVariant.Any)
  if (!matchesSelection(rule.mainStats, mainStat)) return false
  // Armor slots normalize faction to zero to match safeguard grouping behavior.
  const faction = isAccessorySlot(slot) ? Number(artifact.faction) : 0
  if (!matchesSelection(rule.factions, faction)) return false
  return true
}

// Build legal addable substats from slot constraints while excluding main-stat pairs.
const buildLegalAdditionPool = (artifact: NormalizedGearArtifact): number[] => {
  const slotVariants = Array.from(ALLOWED_SUB_BY_SLOT[Number(artifact.slot)] ?? [])
  const mainVariant = Number(artifact.mainStat?.variant ?? StatVariant.Any)
  const pool: number[] = []
  for (const raw of slotVariants) {
    const variant = Number(raw)
    if (!Number.isFinite(variant)) continue
    if (variant <= 0) continue
    if (variant === Number(StatVariant.Any) || variant === Number(StatVariant.RollCount)) continue
    if (substatMatchesMainVariant(variant as StatVariant, mainVariant as StatVariant)) continue
    pool.push(Math.floor(variant))
  }
  // Keep output sorted so recursion keys are stable across runs.
  return Array.from(new Set(pool)).sort((left, right) => left - right)
}

// Resolve remaining milestones from the current level to +16.
const resolveRemainingMilestones = (currentLevel: number): number[] => (
  ROLL_MILESTONES.filter((milestone) => milestone > currentLevel && milestone <= SAFEGUARD_UPGRADE_TARGET_LEVEL)
)

// Resolve which remaining milestones are addition events for this rarity.
const resolveRemainingAdditionMilestones = (rarity: number, currentLevel: number): ReadonlySet<number> => (
  new Set((ADDITION_LEVELS_BY_RARITY[rarity] ?? []).filter(
    (milestone) => milestone > currentLevel && milestone <= SAFEGUARD_UPGRADE_TARGET_LEVEL,
  ))
)

// Count matched selected substats (presence + positive value), deduped by variant.
const countMatchedSelectedSubstatsOnArtifact = (
  artifact: NormalizedGearArtifact,
  selected: ReadonlySet<number>,
): number => {
  if (selected.size === 0) return 0
  let matched = 0
  const seen = new Set<number>()
  for (const substat of artifact.substats ?? []) {
    const variant = Number(substat.variant)
    if (!selected.has(variant)) continue
    if (seen.has(variant)) continue
    const value = Number(substat.totalValue)
    if (!Number.isFinite(value) || value <= 0) continue
    seen.add(variant)
    matched += 1
    if (matched >= selected.size) return matched
  }
  return matched
}

// Safeguard substat gating (`any`/`all`) for static artifact challenger scans.
const artifactMatchesScenarioSubstats = (
  artifact: NormalizedGearArtifact,
  selectedSubstats: readonly number[],
  substatMatch: SafeguardSubstatMatch,
): boolean => {
  if (selectedSubstats.length === 0) return true
  const selectedSet = new Set<number>(selectedSubstats)
  const matched = countMatchedSelectedSubstatsOnArtifact(artifact, selectedSet)
  if (substatMatch === SafeguardSubstatMatchToken.All) {
    return matched >= selectedSet.size
  }
  return matched > 0
}

// Strict tie comparator parity: returns true when challenger is strictly better.
const isChallengerStrictlyBetterThanCandidate = (
  challenger: StaticCandidate,
  candidateScore: number,
  candidateMainStat: number,
  candidateRank: number,
): boolean => {
  const scoreDelta = challenger.score - candidateScore
  if (Math.abs(scoreDelta) > SAFEGUARD_SCORE_TIE_EPSILON) {
    return scoreDelta > 0
  }
  // Same-main ties break by rank (higher rank is better).
  if (challenger.mainStat === candidateMainStat) {
    return challenger.rank > candidateRank
  }
  // Percent main beats matching flat main on score ties.
  const challengerFlat = percentToFlatMain(challenger.mainStat)
  if (challengerFlat != null && challengerFlat === candidateMainStat) return true
  // Candidate percent beats challenger flat on score ties.
  const candidateFlat = percentToFlatMain(candidateMainStat)
  if (candidateFlat != null && candidateFlat === challenger.mainStat) return false
  return false
}

// Map percent mains to the flat equivalent used by tie-break precedence.
const percentToFlatMain = (variant: number): number | null => {
  if (variant === Number(StatVariant.HP)) return Number(StatVariant.HP_FLAT)
  if (variant === Number(StatVariant.ATK)) return Number(StatVariant.ATK_FLAT)
  if (variant === Number(StatVariant.DEF)) return Number(StatVariant.DEF_FLAT)
  return null
}

// Expand one rule into one-or-many ranking scenarios (`per-substat` splits variants).
const expandRuleScenarios = (rule: PreparedSafeguardRule): Array<{
  selectedSubstats: readonly number[]
  substatMatch: SafeguardSubstatMatch
}> => {
  if (
    rule.substatMatch === SafeguardSubstatMatchToken.PerSubstat
    && rule.selectedSubstats.length > 1
  ) {
    return rule.selectedSubstats.map((variant) => ({
      selectedSubstats: [variant],
      substatMatch: SafeguardSubstatMatchToken.Any,
    }))
  }
  return [{
    selectedSubstats: rule.selectedSubstats,
    substatMatch: (
      rule.substatMatch === SafeguardSubstatMatchToken.All
        ? SafeguardSubstatMatchToken.All
        : SafeguardSubstatMatchToken.Any
    ),
  }]
}

// Build reusable challenger buckets so per-item probability scans stay fast.
const buildRuleScenarios = (
  artifacts: readonly NormalizedGearArtifact[],
  rules: readonly PreparedSafeguardRule[],
): RuleScenario[] => {
  const scenarios: RuleScenario[] = []
  for (const rule of rules) {
    // Track non-substat applicability once for this rule.
    const applicableArtifactIds = new Set<number>()
    for (const artifact of artifacts) {
      const artifactId = Number(artifact.id)
      if (!Number.isFinite(artifactId)) continue
      if (!ruleAppliesToArtifact(rule, artifact)) continue
      applicableArtifactIds.add(artifactId)
    }
    if (applicableArtifactIds.size === 0) continue
    // Per-substat mode expands into separate ranking scenarios.
    const scenarioDefs = expandRuleScenarios(rule)
    for (const def of scenarioDefs) {
      const challengersByCountKey = new Map<string, StaticCandidate[]>()
      // Build static challenger pools from current gear values.
      for (const artifact of artifacts) {
        const artifactId = Number(artifact.id)
        if (!Number.isFinite(artifactId)) continue
        if (!applicableArtifactIds.has(artifactId)) continue
        if (!artifactMatchesScenarioSubstats(artifact, def.selectedSubstats, def.substatMatch)) continue
        const score = computeSafeguardScoreFromArtifact(artifact, def.selectedSubstats, rule.weights)
        if (!(score > 0)) continue
        const countKey = getSafeguardCountKey(artifact, rule.countMode)
        const bucket = challengersByCountKey.get(countKey)
        const candidate: StaticCandidate = {
          artifactId,
          score,
          rank: Number(artifact.rank),
          mainStat: Number(artifact.mainStat?.variant ?? StatVariant.Any),
        }
        if (bucket) {
          bucket.push(candidate)
        } else {
          challengersByCountKey.set(countKey, [candidate])
        }
      }
      scenarios.push({
        ruleOrder: rule.ruleOrder,
        ruleId: rule.ruleId,
        ruleSelectedSubstats: rule.selectedSubstats,
        // Preserve original match mode so per-substat expansion does not erase PerSubstat in debug.
        ruleSubstatMatch: rule.substatMatch,
        applicableArtifactIds,
        selectedSubstats: def.selectedSubstats,
        substatMatch: def.substatMatch,
        requiredPerGroup: rule.requiredPerGroup,
        countMode: rule.countMode,
        weights: rule.weights,
        challengersByCountKey,
      })
    }
  }
  return scenarios
}

// Convert positive artifact substats into scaled recursion state values.
const buildInitialScaledState = (artifact: NormalizedGearArtifact): Map<number, number> => {
  const state = new Map<number, number>()
  for (const substat of artifact.substats ?? []) {
    const variant = Number(substat.variant)
    const value = Number(substat.totalValue)
    if (!Number.isFinite(variant) || variant <= 0) continue
    if (!Number.isFinite(value) || value <= 0) continue
    if (variant === Number(StatVariant.Any) || variant === Number(StatVariant.RollCount)) continue
    state.set(Math.floor(variant), Math.max(0, Math.round(value * STATE_VALUE_SCALE)))
  }
  return state
}

// Read candidate state value (unscaled raw units) for one substat variant.
const getStateRawSubstatValue = (state: ReadonlyMap<number, number>, variant: number): number => (
  Math.max(0, Number(state.get(variant) ?? 0)) / STATE_VALUE_SCALE
)

// Count matched selected substats from recursion state.
const countMatchedSelectedSubstatsInState = (
  state: ReadonlyMap<number, number>,
  selectedSubstats: readonly number[],
): number => {
  if (selectedSubstats.length === 0) return 0
  let matched = 0
  for (const variant of selectedSubstats) {
    if (getStateRawSubstatValue(state, variant) > 0) {
      matched += 1
    }
  }
  return matched
}

// Substat gating (`any`/`all`) against projected +16 recursion state.
const stateMatchesScenarioSubstats = (
  state: ReadonlyMap<number, number>,
  selectedSubstats: readonly number[],
  substatMatch: SafeguardSubstatMatch,
): boolean => {
  if (selectedSubstats.length === 0) return true
  const matched = countMatchedSelectedSubstatsInState(state, selectedSubstats)
  if (substatMatch === SafeguardSubstatMatchToken.All) {
    return matched >= selectedSubstats.length
  }
  return matched > 0
}

// Score +16 projected state with the same weighted normalized safeguard formula.
const computeSafeguardScoreFromState = (
  state: ReadonlyMap<number, number>,
  selectedSubstats: readonly number[],
  weights: ReadonlyMap<number, number>,
): number => {
  let total = 0
  for (const variant of selectedSubstats) {
    const raw = getStateRawSubstatValue(state, variant)
    const normalized = normalizeSubstatByMax6(variant as StatVariant, raw)
    const weight = Number(weights.get(variant) ?? 1)
    total += weight * normalized
  }
  return Number.isFinite(total) ? total : 0
}

// Resolve unknown/new roll quality scale from item rank (1..6 -> 0.6..1.0).
const resolveUnknownRankScale = (rank: number): number => {
  const clamped = clampRank(rank)
  const ratio = (clamped - 1) / 5
  return UNKNOWN_ROLL_MIN_RANK_SCALE + ((1 - UNKNOWN_ROLL_MIN_RANK_SCALE) * ratio)
}

// Build fallback expected roll gains (scaled) for variants not currently present.
const buildFallbackExpectedGainByVariantScaled = (rank: number): ReadonlyMap<number, number> => {
  const scale = resolveUnknownRankScale(rank)
  const out = new Map<number, number>()
  for (const [rawVariant, rawMax] of Object.entries(SUBSTAT_ROLL_MAX_6_BY_VARIANT)) {
    const variant = Number(rawVariant)
    const max6 = Number(rawMax)
    if (!Number.isFinite(variant) || !Number.isFinite(max6) || max6 <= 0) continue
    const modeled = max6 * UNKNOWN_ROLL_QUALITY_RATIO_AT_RANK_SIX * scale
    out.set(variant, Math.max(0, Math.round(modeled * STATE_VALUE_SCALE)))
  }
  return out
}

// Build per-variant expected gains from observed roll quality on existing substats.
const buildExistingExpectedGainByVariantScaled = (
  artifact: NormalizedGearArtifact,
  fallbackGainByVariantScaled: ReadonlyMap<number, number>,
): ReadonlyMap<number, number> => {
  const out = new Map<number, number>()
  for (const substat of artifact.substats ?? []) {
    const variant = Number(substat.variant)
    const max6 = Number(SUBSTAT_ROLL_MAX_6_BY_VARIANT[variant])
    if (!Number.isFinite(variant) || variant <= 0) continue
    if (!Number.isFinite(max6) || max6 <= 0) continue
    const totalValue = Number(substat.totalValue)
    const rawRolls = Number(substat.rolls ?? 0)
    const rolls = Number.isFinite(rawRolls) && rawRolls >= 0 ? Math.floor(rawRolls) : 0
    const divisor = Math.max(1, rolls + 1)
    const modeled = Number.isFinite(totalValue) && totalValue > 0
      ? Math.min(max6, totalValue / divisor)
      : 0
    if (modeled > 0) {
      out.set(variant, Math.round(modeled * STATE_VALUE_SCALE))
      continue
    }
    const fallback = Number(fallbackGainByVariantScaled.get(variant) ?? 0)
    if (fallback > 0) out.set(variant, fallback)
  }
  return out
}

// Read expected gain for one variant (existing-observed first, fallback otherwise).
const resolveExpectedGainScaledForVariant = (
  variant: number,
  expectedGainByVariantScaled: ReadonlyMap<number, number>,
  fallbackGainByVariantScaled: ReadonlyMap<number, number>,
): number => {
  const direct = Number(expectedGainByVariantScaled.get(variant) ?? 0)
  if (direct > 0) return direct
  const fallback = Number(fallbackGainByVariantScaled.get(variant) ?? 0)
  if (fallback > 0) return fallback
  return 0
}

// Stable recursion key keeps memoization deterministic across branches.
const buildRecursionStateKey = (state: ReadonlyMap<number, number>, eventIndex: number): string => {
  const entries = Array.from(state.entries()).sort((left, right) => left[0] - right[0])
  const encoded = entries.map(([variant, value]) => `${variant}:${value}`).join('|')
  return `${eventIndex}|${encoded}`
}

// Evaluate whether projected +16 state is safeguard-selected by any applicable scenario.
const isStateSelectedByAnyScenario = (
  state: ReadonlyMap<number, number>,
  context: UpgradeRecursionContext,
): boolean => {
  const candidateMainStat = Number(context.artifact.mainStat?.variant ?? StatVariant.Any)
  const candidateRank = Number(context.artifact.rank)
  for (const scenario of context.scenarios) {
    if (!scenario.applicableArtifactIds.has(context.artifactId)) continue
    if (!stateMatchesScenarioSubstats(state, scenario.selectedSubstats, scenario.substatMatch)) continue
    const score = computeSafeguardScoreFromState(state, scenario.selectedSubstats, scenario.weights)
    if (!(score > 0)) continue
    const countKey = getSafeguardCountKey(context.artifact, scenario.countMode)
    const challengers = scenario.challengersByCountKey.get(countKey) ?? []
    let betterCount = 0
    for (const challenger of challengers) {
      if (challenger.artifactId === context.artifactId) continue
      if (isChallengerStrictlyBetterThanCandidate(challenger, score, candidateMainStat, candidateRank)) {
        betterCount += 1
        if (betterCount >= scenario.requiredPerGroup) break
      }
    }
    if (betterCount < scenario.requiredPerGroup) return true
  }
  return false
}

// Clone state and apply one value delta to a variant (addition or roll event).
const applyStateDelta = (
  state: ReadonlyMap<number, number>,
  variant: number,
  deltaScaled: number,
): Map<number, number> => {
  const next = new Map<number, number>(state)
  const current = Number(next.get(variant) ?? 0)
  next.set(variant, Math.max(0, current + deltaScaled))
  return next
}

// Exact recursion over future +4/+8/+12/+16 events for selected-by-safeguard probability.
const computeSelectionProbabilityToLevel16 = (
  context: UpgradeRecursionContext,
  state: ReadonlyMap<number, number>,
  eventIndex: number,
  memo: Map<string, number>,
): number => {
  if (eventIndex >= context.milestones.length) {
    return isStateSelectedByAnyScenario(state, context) ? 1 : 0
  }
  const memoKey = buildRecursionStateKey(state, eventIndex)
  const cached = memo.get(memoKey)
  if (cached != null) return cached
  const milestone = context.milestones[eventIndex]!
  const isAdditionEvent = (
    context.additionMilestones.has(milestone)
    && state.size < SAFEGUARD_MAX_SUBSTAT_SLOTS
  )
  const result = (() => {
    if (isAdditionEvent) {
      // Additions choose one legal missing substat uniformly.
      const candidates = context.legalAdditionPool.filter((variant) => !state.has(variant))
      if (candidates.length === 0) {
        return computeSelectionProbabilityToLevel16(context, state, eventIndex + 1, memo)
      }
      const p = 1 / candidates.length
      let total = 0
      for (const variant of candidates) {
        const deltaScaled = resolveExpectedGainScaledForVariant(
          variant,
          context.expectedGainByVariantScaled,
          context.fallbackGainByVariantScaled,
        )
        if (deltaScaled <= 0) continue
        const next = applyStateDelta(state, variant, deltaScaled)
        total += p * computeSelectionProbabilityToLevel16(context, next, eventIndex + 1, memo)
      }
      return total
    }
    // Roll events pick one existing substat uniformly.
    const variants = Array.from(state.keys()).sort((left, right) => left - right)
    if (variants.length === 0) {
      return computeSelectionProbabilityToLevel16(context, state, eventIndex + 1, memo)
    }
    const p = 1 / variants.length
    let total = 0
    for (const variant of variants) {
      const deltaScaled = resolveExpectedGainScaledForVariant(
        variant,
        context.expectedGainByVariantScaled,
        context.fallbackGainByVariantScaled,
      )
      if (deltaScaled <= 0) continue
      const next = applyStateDelta(state, variant, deltaScaled)
      total += p * computeSelectionProbabilityToLevel16(context, next, eventIndex + 1, memo)
    }
    return total
  })()
  memo.set(memoKey, result)
  return result
}

// Compute one artifact's +16 chance of being selected by at least one scenario.
const computeArtifactUpgradeChancePercent = (
  artifact: NormalizedGearArtifact,
  artifactScenarios: readonly RuleScenario[],
): number => {
  if (artifactScenarios.length === 0) return 0
  const artifactId = Number(artifact.id)
  if (!Number.isFinite(artifactId)) return 0
  const currentLevel = clampLevel(artifact.exactLevel ?? artifact.level)
  const milestones = resolveRemainingMilestones(currentLevel)
  const initialState = buildInitialScaledState(artifact)
  // No remaining events means final state is current state (0% or 100%).
  if (milestones.length === 0) {
    return isStateSelectedByAnyScenario(initialState, {
      artifact,
      artifactId,
      scenarios: artifactScenarios,
      milestones: [],
      additionMilestones: new Set<number>(),
      legalAdditionPool: [],
      expectedGainByVariantScaled: new Map<number, number>(),
      fallbackGainByVariantScaled: new Map<number, number>(),
    })
      ? 100
      : 0
  }
  const rarity = clampRarity(artifact.rarity)
  const additionMilestones = resolveRemainingAdditionMilestones(rarity, currentLevel)
  const legalAdditionPool = buildLegalAdditionPool(artifact)
  const fallbackGainByVariantScaled = buildFallbackExpectedGainByVariantScaled(Number(artifact.rank))
  const expectedGainByVariantScaled = buildExistingExpectedGainByVariantScaled(
    artifact,
    fallbackGainByVariantScaled,
  )
  const context: UpgradeRecursionContext = {
    artifact,
    artifactId,
    scenarios: artifactScenarios,
    milestones,
    additionMilestones,
    legalAdditionPool,
    expectedGainByVariantScaled,
    fallbackGainByVariantScaled,
  }
  const probability = computeSelectionProbabilityToLevel16(context, initialState, 0, new Map())
  const bounded = Math.max(0, Math.min(1, probability))
  const percent = Math.round(bounded * 100)
  if (percent <= 0) return 0
  if (percent >= 100) return 100
  return percent
}

// Build per-artifact viability data used to prune impossible substat scenarios.
const buildArtifactScenarioViabilityContext = (
  artifact: NormalizedGearArtifact,
): ArtifactScenarioViabilityContext => {
  const initialState = buildInitialScaledState(artifact)
  const currentLevel = clampLevel(artifact.exactLevel ?? artifact.level)
  const rarity = clampRarity(artifact.rarity)
  const remainingAdditionMilestones = resolveRemainingAdditionMilestones(rarity, currentLevel)
  // Missing slots cap additions even if the rarity schedule still has addition milestones left.
  const missingSubstatSlots = Math.max(0, SAFEGUARD_MAX_SUBSTAT_SLOTS - initialState.size)
  const maxAdditionEvents = Math.min(remainingAdditionMilestones.size, missingSubstatSlots)
  return {
    initialState,
    maxAdditionEvents,
    legalAdditionPool: new Set<number>(buildLegalAdditionPool(artifact)),
  }
}

// True when the artifact can satisfy this scenario's substat requirement by +16.
const scenarioCanMatchArtifactByLevel16 = (
  scenario: RuleScenario,
  context: ArtifactScenarioViabilityContext,
): boolean => {
  const selectedSubstats = Array.from(new Set<number>(scenario.selectedSubstats))
  if (selectedSubstats.length === 0) return false
  const matchedNow = countMatchedSelectedSubstatsInState(context.initialState, selectedSubstats)
  if (scenario.substatMatch === SafeguardSubstatMatchToken.All) {
    if (matchedNow >= selectedSubstats.length) return true
    if (context.maxAdditionEvents <= 0) return false
    let missingAddable = 0
    for (const variant of selectedSubstats) {
      if (getStateRawSubstatValue(context.initialState, variant) > 0) continue
      if (!context.legalAdditionPool.has(variant)) return false
      missingAddable += 1
    }
    return missingAddable <= context.maxAdditionEvents
  }
  if (matchedNow > 0) return true
  if (context.maxAdditionEvents <= 0) return false
  // `any` can still be satisfied if at least one selected variant can be added later.
  return selectedSubstats.some((variant) => context.legalAdditionPool.has(variant))
}

// Pick one stable scenario for tooltip/debug details (same ordering as rule scan).
const resolvePreferredScenario = (artifactScenarios: readonly RuleScenario[]): RuleScenario | null => {
  for (const scenario of artifactScenarios) {
    const normalized = typeof scenario.ruleId === 'string' ? scenario.ruleId.trim() : ''
    if (normalized.length > 0) return scenario
  }
  return artifactScenarios[0] ?? null
}

// Prefer the scenario with the highest per-scenario chance for UI click-through/debug context.
const resolveMostLikelyScenario = (
  artifact: NormalizedGearArtifact,
  artifactScenarios: readonly RuleScenario[],
): RuleScenario | null => {
  if (artifactScenarios.length === 0) return null
  if (artifactScenarios.length === 1) return artifactScenarios[0] ?? null
  let bestChance = Number.NEGATIVE_INFINITY
  let bestScenarios: RuleScenario[] = []
  for (const scenario of artifactScenarios) {
    const chance = computeArtifactUpgradeChancePercent(artifact, [scenario])
    if (chance > bestChance) {
      bestChance = chance
      bestScenarios = [scenario]
      continue
    }
    if (chance === bestChance) {
      bestScenarios.push(scenario)
    }
  }
  if (bestScenarios.length <= 1) {
    return resolvePreferredScenario(bestScenarios)
  }
  // Tie-break by safeguard-level substat coverage on this artifact.
  // This intentionally uses the full rule substat set, not per-substat scenario splits.
  let bestMatchedCount = Number.NEGATIVE_INFINITY
  let matchedBestScenarios: RuleScenario[] = []
  for (const scenario of bestScenarios) {
    const matchedCount = countMatchedSelectedSubstatsOnArtifact(
      artifact,
      new Set<number>(scenario.ruleSelectedSubstats),
    )
    if (matchedCount > bestMatchedCount) {
      bestMatchedCount = matchedCount
      matchedBestScenarios = [scenario]
      continue
    }
    if (matchedCount === bestMatchedCount) {
      matchedBestScenarios.push(scenario)
    }
  }
  if (matchedBestScenarios.length <= 1) {
    return resolvePreferredScenario(matchedBestScenarios)
  }
  // Final tie-break: safeguard list order (higher up = smaller index).
  let bestOrder = Number.POSITIVE_INFINITY
  let orderBestScenarios: RuleScenario[] = []
  for (const scenario of matchedBestScenarios) {
    const order = Number.isFinite(scenario.ruleOrder) ? scenario.ruleOrder : Number.POSITIVE_INFINITY
    if (order < bestOrder) {
      bestOrder = order
      orderBestScenarios = [scenario]
      continue
    }
    if (order === bestOrder) {
      orderBestScenarios.push(scenario)
    }
  }
  return resolvePreferredScenario(orderBestScenarios)
}

// Build a concise snapshot of the preferred scenario so users can inspect chance math.
const buildChanceDebugSnapshot = (
  artifact: NormalizedGearArtifact,
  preferredScenario: RuleScenario,
  viability: ArtifactScenarioViabilityContext,
  sourceArtifactCount: number,
  viableScenarioCount: number,
): SafeguardUpgradeChanceDebug => {
  const artifactId = Number(artifact.id)
  const candidateMainStat = Number(artifact.mainStat?.variant ?? StatVariant.Any)
  const candidateRank = Number(artifact.rank)
  const candidateScore = computeSafeguardScoreFromArtifact(
    artifact,
    preferredScenario.selectedSubstats,
    preferredScenario.weights,
  )
  const countKey = getSafeguardCountKey(artifact, preferredScenario.countMode)
  const challengers = preferredScenario.challengersByCountKey.get(countKey) ?? []
  let bucketCandidateCount = 0
  let betterCandidateCount = 0
  for (const challenger of challengers) {
    if (challenger.artifactId === artifactId) continue
    bucketCandidateCount += 1
    if (isChallengerStrictlyBetterThanCandidate(challenger, candidateScore, candidateMainStat, candidateRank)) {
      betterCandidateCount += 1
    }
  }
  // For per-substat rules the expansion splits substats into individual Any scenarios; restore the
  // original rule-level mode and full substat list so tooltips show all substats + correct mode.
  const isPerSubstat = preferredScenario.ruleSubstatMatch === SafeguardSubstatMatchToken.PerSubstat
  const debugSubstats = isPerSubstat ? preferredScenario.ruleSelectedSubstats : preferredScenario.selectedSubstats
  return {
    sourceArtifactCount,
    viableScenarioCount,
    selectedSubstats: debugSubstats,
    substatMatch: preferredScenario.ruleSubstatMatch,
    requiredPerGroup: preferredScenario.requiredPerGroup,
    bucketCandidateCount,
    betterCandidateCount,
    matchedSelectedNow: countMatchedSelectedSubstatsInState(viability.initialState, preferredScenario.selectedSubstats),
    maxAdditionEventsTo16: viability.maxAdditionEvents,
  }
}

// Pick a stable rule id for overlay click-through from applicable scenarios.
const resolvePreferredRuleId = (artifactScenarios: readonly RuleScenario[]): string | null => {
  for (const scenario of artifactScenarios) {
    const normalized = typeof scenario.ruleId === 'string' ? scenario.ruleId.trim() : ''
    if (normalized.length > 0) return normalized
  }
  return null
}

// Build artifact-id keyed percentages for Gear Inspector grid overlay lookup.
export const buildSafeguardUpgradeChanceByArtifactId = (
  artifacts: readonly NormalizedGearArtifact[],
  rules: readonly SafeguardRule[],
): Map<number, SafeguardUpgradeChanceEntry> => {
  const output = new Map<number, SafeguardUpgradeChanceEntry>()
  const upgradableArtifactIds = new Set<number>()
  for (const artifact of artifacts) {
    const artifactId = Number(artifact.id)
    if (!Number.isFinite(artifactId)) continue
    if (clampLevel(artifact.exactLevel ?? artifact.level) < 16) {
      upgradableArtifactIds.add(artifactId)
    }
    output.set(artifactId, {
      chancePercent: 0,
      hasMatchingSafeguard: false,
      matchedRuleId: null,
    })
  }
  if (artifacts.length === 0 || rules.length === 0 || upgradableArtifactIds.size === 0) return output
  // Precompute active substat safeguards first.
  const preparedRules = prepareSubstatSafeguardRules(rules, artifacts)
  if (preparedRules.length === 0) return output
  // Build shared challenger scenarios once for this grid snapshot.
  const scenarios = buildRuleScenarios(artifacts, preparedRules)
  if (scenarios.length === 0) return output
  // Index scenarios by artifact id so per-item scans stay small.
  const scenariosByArtifactId = new Map<number, RuleScenario[]>()
  for (const scenario of scenarios) {
    for (const artifactId of scenario.applicableArtifactIds) {
      const bucket = scenariosByArtifactId.get(artifactId)
      if (bucket) {
        bucket.push(scenario)
      } else {
        scenariosByArtifactId.set(artifactId, [scenario])
      }
    }
  }
  // Compute one percentage per artifact id.
  for (const artifact of artifacts) {
    const artifactId = Number(artifact.id)
    if (!Number.isFinite(artifactId)) continue
    // Level-16 artifacts are already fully rolled; omit chance overlays for them entirely.
    if (!upgradableArtifactIds.has(artifactId)) {
      continue
    }
    const artifactScenarios = scenariosByArtifactId.get(artifactId) ?? []
    if (artifactScenarios.length === 0) {
      output.set(artifactId, {
        chancePercent: 0,
        hasMatchingSafeguard: false,
        matchedRuleId: null,
      })
      continue
    }
    // Filter out scenarios that this artifact can never satisfy by +16.
    const viability = buildArtifactScenarioViabilityContext(artifact)
    const viableArtifactScenarios = artifactScenarios.filter((scenario) => (
      scenarioCanMatchArtifactByLevel16(scenario, viability)
    ))
    if (viableArtifactScenarios.length === 0) {
      output.set(artifactId, {
        chancePercent: 0,
        hasMatchingSafeguard: false,
        matchedRuleId: null,
      })
      continue
    }
    const chance = computeArtifactUpgradeChancePercent(artifact, viableArtifactScenarios)
    const preferredScenario = resolveMostLikelyScenario(artifact, viableArtifactScenarios)
    const debugSnapshot = preferredScenario
      ? buildChanceDebugSnapshot(
        artifact,
        preferredScenario,
        viability,
        artifacts.length,
        viableArtifactScenarios.length,
      )
      : null
    output.set(artifactId, {
      chancePercent: chance,
      hasMatchingSafeguard: true,
      matchedRuleId: resolvePreferredRuleId(preferredScenario ? [preferredScenario] : viableArtifactScenarios),
      ...(debugSnapshot ? { debug: debugSnapshot } : {}),
    })
  }
  return output
}
