import type { BuilderRecipe } from './hsfBuilder'

// Central factory defaults keep builder clones consistent across UI + history helpers.
export const createFactoryBuilderDefaults = (): BuilderRecipe => ({
  // Empty label keeps new recipes unnamed until the user edits the field.
  name: '',
  // Tags default to empty so note-driven recipe overrides start clean.
  tags: [],
  // New recipes keep by default to match the builder baseline.
  keep: true,
  // Export mode stays active so new rules emit into the Sellfile unless disabled later.
  exportMode: 'active',
  // Rank and rarity default to Any (builder baseline).
  rankCode: 0,
  rarityCode: 0,
  rarityMode: 'auto',
  // Auto rarity supplements mirror the builder toggle default.
  autoRaritySupplementsThreshold: 'rare',
  // Faction default is Any to avoid accessory lock-in.
  factionCode: 0,
  // Main stat + substat selections start empty so the UI shows "Any".
  mainStatsV: [],
  // Full level window mirrors the builder baseline.
  minLevel: 0,
  maxLevel: 16,
  // Early keep mode preserves the builder's default roll timing.
  earlyKeepMode: 'early',
  // Substat pickers start empty with Auto count enabled.
  substatsV: [],
  fixedSubstatsV: [],
  minCount: 0,
  autoMinCount: true,
  // Flex + roll targets stay off by default.
  autoSubstatFlex: false,
  minRequiredRolls: 0,
  autoMinRequiredRolls: true,
  lockedMinRequiredRolls: 0,
  // Empty roll/target maps avoid hidden constraints.
  substatRollBoundsV: {},
  substatRollTargetsV: {},
  // Slot/set scopes default to Any.
  artifactTypes: [],
  artifactSets: [],
  artifactMetaSets: [],
})
