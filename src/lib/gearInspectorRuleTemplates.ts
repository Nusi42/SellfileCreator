import { createFactoryBuilderDefaults } from './builderDefaults'
import { ACCESSORY_NO_SET_ID } from './constants'
import type { NormalizedGearArtifact } from './importers/gearDbNormalizer'
import type { BuilderRecipe } from './hsfBuilder'
import type { ArtifactSetSelectionEntry } from './gearSets/selection'
import {
  ArtifactType,
  compareVariants,
  rarityCodeFromRankValue,
  StatVariant,
  type ArtifactSetId,
  type LevelMilestone,
  type RankCode,
  type RankValue,
} from './types'

export type GearInspectorRuleTemplateIntent = 'keep' | 'sell'

type LevelBracket = 'early' | 'mid' | 'late'

type SubstatEntry = {
  variant: StatVariant
  rolls: number
  isFlat: boolean
}

type SubstatRollBounds = NonNullable<BuilderRecipe['substatRollBoundsV']>

const clampRollCount = (value: number | null | undefined): number => {
  // Rolls are bounded by the in-game 0..5 range.
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0
  return Math.max(0, Math.min(5, numeric))
}

const resolveItemLevel = (artifact: NormalizedGearArtifact): number => {
  // Prefer the exact level when available so templates follow the real upgrade state.
  const raw = (typeof artifact.exactLevel === 'number' && Number.isFinite(artifact.exactLevel))
    ? artifact.exactLevel
    : artifact.level
  // Clamp to the supported [0,16] range.
  return Math.max(0, Math.min(16, Math.round(Number(raw) || 0)))
}

const resolveLevelBracket = (level: number): LevelBracket => {
  // Bucket the item into the 0-8, 9-12, or 13-16 brackets.
  if (level <= 8) return 'early'
  if (level <= 12) return 'mid'
  return 'late'
}

const resolveMilestoneCeil = (level: number): LevelMilestone => {
  // Round up so "keep" templates cover up to the next milestone.
  if (level <= 0) return 0
  if (level <= 4) return 4
  if (level <= 8) return 8
  if (level <= 12) return 12
  return 16
}

const resolveMilestoneFloor = (level: number): LevelMilestone => {
  // Round down so "sell" templates stay in the current milestone bucket.
  if (level <= 3) return 0
  if (level <= 7) return 4
  if (level <= 11) return 8
  if (level <= 15) return 12
  return 16
}

const collectSubstats = (artifact: NormalizedGearArtifact): SubstatEntry[] => {
  // Map by variant so duplicate rows never double-count rolls.
  const byVariant = new Map<StatVariant, { rolls: number; isFlat: boolean }>()
  for (const stat of artifact.substats) {
    if (stat.variant === StatVariant.Any) continue
    const rolls = clampRollCount(stat.rolls)
    const prev = byVariant.get(stat.variant)
    const prevRolls = prev?.rolls ?? 0
    // Keep the highest roll count for each stat.
    if (rolls > prevRolls) {
      byVariant.set(stat.variant, {
        rolls,
        // Preserve whether this variant is flat so Keep templates can screen it.
        isFlat: Boolean(stat.isFlat),
      })
    }
  }
  // Sort by roll count first, then by the canonical stat order.
  return Array.from(byVariant.entries())
    .map(([variant, payload]) => ({
      variant,
      rolls: payload.rolls,
      isFlat: payload.isFlat,
    }))
    .sort((a, b) => {
      if (a.rolls !== b.rolls) return b.rolls - a.rolls
      return compareVariants(a.variant, b.variant)
    })
}

const selectKeepPrimaryCandidates = (
  entries: SubstatEntry[],
  slot: number,
): SubstatEntry[] => {
  // Accessories keep a special case: amulets may intentionally prioritize flat lines.
  if (slot === ArtifactType.Amulet) return entries
  // For non-amulets, flat HP/ATK/DEF lines should not drive top-substat Keep targeting.
  return entries.filter((entry) => !entry.isFlat)
}

const resolvePrimarySubstats = (
  entries: SubstatEntry[],
  bracket: LevelBracket,
): StatVariant[] => {
  // Target fewer stats at lower levels so early keep rules stay attainable.
  const desired = bracket === 'early' ? 1 : (bracket === 'mid' ? 2 : 3)
  return entries.slice(0, desired).map((entry) => entry.variant)
}

const buildKeepRollBounds = (
  primary: StatVariant[],
  entries: SubstatEntry[],
  bracket: LevelBracket,
): SubstatRollBounds => {
  // Cap early roll requirements so lower-level items do not over-constrain rules.
  const rollCap = bracket === 'early' ? 1 : (bracket === 'mid' ? 2 : 5)
  const rollsByVariant = new Map(entries.map((entry) => [entry.variant, entry.rolls]))
  const bounds: SubstatRollBounds = {}
  for (const variant of primary) {
    const rolls = rollsByVariant.get(variant) ?? 0
    if (rolls <= 0) continue
    const min = Math.max(1, Math.min(rolls, rollCap))
    // Min roll floors anchor the template to the current roll quality.
    bounds[variant] = { min }
  }
  return bounds
}

const buildSellRollBounds = (
  entries: SubstatEntry[],
): SubstatRollBounds => {
  const bounds: SubstatRollBounds = {}
  for (const entry of entries) {
    // Max rolls match the current item so better rolls can bypass the sell rule.
    bounds[entry.variant] = { max: clampRollCount(entry.rolls) }
  }
  return bounds
}

const resolveRankCode = (rank: RankValue): RankCode => {
  // Rank codes use the same 1..6 values for exact star picks.
  const numeric = Math.max(1, Math.min(6, Math.round(Number(rank) || 1)))
  return numeric as RankCode
}

const resolveSetSelection = (artifact: NormalizedGearArtifact): ArtifactSetSelectionEntry[] => {
  // Guard invalid or accessory-only sentinel IDs before creating selection entries.
  const setId = Number(artifact.set)
  if (!Number.isFinite(setId) || setId <= 0) return []
  if (setId === ACCESSORY_NO_SET_ID) return []
  return [{ id: Math.floor(setId) as ArtifactSetId }]
}

export const buildGearInspectorRuleTemplateRecipe = (params: {
  artifact: NormalizedGearArtifact
  intent: GearInspectorRuleTemplateIntent
}): BuilderRecipe => {
  const { artifact, intent } = params
  const base = createFactoryBuilderDefaults()
  const level = resolveItemLevel(artifact)
  const bracket = resolveLevelBracket(level)
  const keepMaxLevel = resolveMilestoneCeil(level)
  const sellLevel = resolveMilestoneFloor(level)
  const substatEntries = collectSubstats(artifact)
  const substatVariants = substatEntries.map((entry) => entry.variant)
  const keepPrimaryCandidates = selectKeepPrimaryCandidates(substatEntries, artifact.slot)
  const primarySubstats = resolvePrimarySubstats(keepPrimaryCandidates, bracket)
  const useKeepTemplate = intent === 'keep'
  const fixedSubstats = useKeepTemplate ? primarySubstats : substatVariants
  const resolvedMinCount = Math.min(4, fixedSubstats.length) as BuilderRecipe['minCount']
  const useAutoMinCount = fixedSubstats.length === 0
  const rollBounds = useKeepTemplate
    ? buildKeepRollBounds(primarySubstats, substatEntries, bracket)
    : buildSellRollBounds(substatEntries)
  const mainVariant = artifact.mainStat?.variant ?? StatVariant.Any
  const mainStatsV = mainVariant !== StatVariant.Any ? [mainVariant] : []
  const rankCode = resolveRankCode(artifact.rank)
  const rarityCode = rarityCodeFromRankValue(artifact.rarity)
  const artifactTypes = [artifact.slot]
  const artifactSets = resolveSetSelection(artifact)
  return {
    ...base,
    keep: useKeepTemplate,
    // Lock the template to the item's rank + rarity so rules stay targeted.
    rankCode,
    rarityMode: 'code',
    rarityCode,
    // Keep templates cover 0->ceil milestone; sell templates target the current milestone.
    minLevel: useKeepTemplate ? 0 : sellLevel,
    maxLevel: useKeepTemplate ? keepMaxLevel : sellLevel,
    // Slot + set anchors keep the rule focused on similar gear.
    artifactTypes,
    artifactSets,
    // Main stat anchors keep gloves/chest/boots consistent.
    mainStatsV,
    // Substats reflect the item while fixed picks enforce the core stats.
    substatsV: substatVariants,
    fixedSubstatsV: fixedSubstats,
    minCount: resolvedMinCount,
    autoMinCount: useAutoMinCount,
    // Roll bounds reflect the current rolls or cap for sell rules.
    substatRollBoundsV: rollBounds,
  }
}
