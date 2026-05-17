import type {
  ArtifactTypeId,
  FactionId,
  LevelMilestone,
  RankCode,
  RankValue,
  RarityCode,
  StatVariant,
} from '../types'
import type { ArtifactSetSelectionEntry } from '../gearSets/selection'
import type { NameAppearance } from '../nameAppearance'

export type SellfileExportMode = 'active' | 'disabled' | 'separator'

export type Star = RankValue

// BuilderRecipe mirrors the SFC schema but uses strongly-typed enums so the UI
// and build steps guarantee we emit valid HSF payloads.
export interface BuilderRecipe {
  // Optional display name and foreground color for this recipe (saved in SFC).
  appearance?: NameAppearance
  // Optional recipe overrides tags used to enable/disable recipes via note prompts.
  tags?: string[]
  keep: boolean
  // Sellfile export mode. Separator recipes export only to SFC (no Sellfile rules).
  // 'disabled' keeps the recipe in exports but forces `Use: false` so RSL Helper ignores it.
  exportMode: SellfileExportMode
  // Explicit level window for which to emit rules (inclusive).
  minLevel?: LevelMilestone
  maxLevel?: LevelMilestone
  // Rank code: HSF-compatible (0..16): exact 1..6, >=1..>=5 (7..11), <=2..<=6 (12..16), 0 any
  rankCode: RankCode
  // Rarity selection:
  // - When rarityMode === 'auto', the builder resolves an effective rarity
  //   code before generating HSF rules using the current level window and
  //   roll requirements (per-stat mins and aggregate minRequiredRolls).
  // - When rarityMode !== 'auto', use the explicit HSF-compatible 0..16 code.
  rarityCode: RarityCode
  rarityMode?: 'auto' | 'code'
  // Faction code (0 Any, 1..15 per factionNames in types.ts)
  factionCode?: FactionId
  // Main stats (variants). Empty -> Any. If provided, we unroll rules per selected main stat.
  mainStatsV?: StatVariant[]
  // Substat targets (variants): choose K from this set; generate combinations of size minCount
  substatsV?: StatVariant[]
  // Substats that must always be included in generated permutations (subset of substats)
  fixedSubstatsV?: StatVariant[]
  // Optional per-substat roll bounds used to filter distributions
  // Variant-keyed: key is StatVariant (encoded number)
  // min: require at least N rolls; max: optional upper bound; any: wildcard (permute all)
  // not: substat must be absent from the item (HSF Condition "¬"); mutually exclusive with min/max/any
  substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }>
  // Optional per-substat roll target overrides.
  // Variant-keyed: Base value (roll 0) plus explicit increments for +1 … +5.
  substatRollTargetsV?: SubstatRollTargets
  minCount: 0 | 1 | 2 | 3 | 4
  // When true, UI keeps minCount in sync with selected substat count: min(4, substats.length)
  autoMinCount?: boolean
  // When true (with autoMinCount=false), starred substats (★) are permuted across totals ≥ minCount
  // while locked/non-star picks remain mandatory.
  autoSubstatFlex: boolean
  // Global minimum total rolls across the selected substats.
  // When active, generated rows ensure the sum of rolls assigned to the targeted
  // substats meets or can reach this total by the target level (Potential mode).
  // Auto = no additional aggregate constraint beyond per-substat mins.
  minRequiredRolls?: 0 | 1 | 2 | 3 | 4 | 5
  autoMinRequiredRolls?: boolean
  // Aggregate minimum for locked substats only (subset of `fixedSubstatsV`).
  // Applied independently from `minRequiredRolls` so locked stats can hit their
  // own floor before optional ones contribute additional rolls.
  lockedMinRequiredRolls?: 0 | 1 | 2 | 3 | 4 | 5
  // Optional slot and set filters (HSF numeric IDs or enums); omit for Any
  artifactTypes?: ArtifactTypeId[]
  // Set filters include exclude flags so metaset-driven entries can be removed explicitly.
  artifactSets?: ArtifactSetSelectionEntry[]
  // Optional metaset references (IDs defined in SFC Metasets)
  artifactMetaSets?: string[]
  // Early/Late keep mode:
  // - 'early' (formerly 'progressive'): thresholds rise with gained rolls until feasible, then stay fixed.
  // - 'late' (formerly 'reachable'): require only what must be present now so +16 remains achievable.
  // Default: 'early'.
  earlyKeepMode?: 'early' | 'late'
  // When rarityMode is 'auto' and keep mode is 'late', the builder may emit
  // supplemental ≥-rarity branches at milestone levels to reflect timing
  // differences (e.g., ≥ Rare, ≥ Epic, ≥ Legendary). This threshold picks the
  // minimum ≥ tier to include as supplements. Default: 'rare' (≥ Rare).
  // UI cycles: 'uncommon' → 'rare' → 'epic'. Has no effect when rarityMode !== 'auto'.
  autoRaritySupplementsThreshold?: 'uncommon' | 'rare' | 'epic'
}

// Substat roll targets store a base stat expectation plus up to five roll
// increments (one entry per milestone between level 0 and 16).
export type SubstatRollTargetEntry = {
  base?: number
  increments?: Array<number | null>
}

export type SubstatRollTargets = Record<number, SubstatRollTargetEntry>

// User-configurable substatTargets table for substats per star bucket.
export type SubstatTargetTable = {
  one: Record<number, number>
  two: Record<number, number>
  three: Record<number, number>
  four: Record<number, number>
  five: Record<number, number>
  six: Record<number, number>
  anyRankDefaultsTo: Star
}

// Legacy SFC payloads keep several mutually-exclusive fields—normalize them to
// SellfileExportMode before persisting back to disk.
export type LegacyVisibilityFields = {
  exportMode?: SellfileExportMode | null
  visibility?: SellfileExportMode | null
  sellfileMode?: SellfileExportMode | null
  SellfileVisibility?: string | null
  enabled?: boolean | null
}
