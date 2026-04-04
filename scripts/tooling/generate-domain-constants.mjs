#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve repository root from this script location so callers can run it from
// any working directory and still update the same generated file targets.
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')

// Keep one canonical constants specification that both TypeScript and Rust
// outputs are generated from to prevent cross-language sentinel drift.
const SPEC_PATH = path.join(REPO_ROOT, 'shared', 'domain-constants.json')
const TS_OUT_PATH = path.join(REPO_ROOT, 'src', 'lib', 'generated', 'domainConstants.ts')
const RUST_OUT_PATH = path.join(REPO_ROOT, 'wasm', 'rule_engine_core', 'src', 'generated_domain_constants.rs')

// Read and parse the canonical JSON source once so both emitters consume the
// exact same values in this process.
const rawSpec = await fs.readFile(SPEC_PATH, 'utf8')
const spec = JSON.parse(rawSpec)

// Keep value access centralized so TS and Rust emitters share one derivation.
const artifactType = spec.artifactType
const statId = spec.statId
const rarityCode = spec.rarityCode
const rankCode = spec.rankCode
const rankValue = spec.rankValue
const level = spec.level
const substat = spec.substat
const encoding = spec.encoding
const autoRarity = spec.autoRarity
const safeguard = spec.safeguard
const ordering = spec.ordering
const accessoryNoSetId = spec.accessoryNoSetId

// Variant encoding mirrors src/lib/types.ts and wasm/rule_engine semantics.
const shiftBits = Number(encoding.statVariantShiftBits)
const flatSuffix = Number(encoding.statVariantFlatSuffix)
const mkVariant = (id, flat) => ((Number(id) << shiftBits) | Number(flat))

// Compute explicit variant values so generated files do not duplicate formulas.
const statVariant = {
  any: Number(statId.any),
  hpPercent: mkVariant(statId.hp, 0),
  hpFlat: mkVariant(statId.hp, flatSuffix),
  atkPercent: mkVariant(statId.atk, 0),
  atkFlat: mkVariant(statId.atk, flatSuffix),
  defPercent: mkVariant(statId.def, 0),
  defFlat: mkVariant(statId.def, flatSuffix),
  spd: mkVariant(statId.spd, flatSuffix),
  res: mkVariant(statId.res, flatSuffix),
  acc: mkVariant(statId.acc, flatSuffix),
  cr: mkVariant(statId.cr, 0),
  cdmg: mkVariant(statId.cdmg, 0),
  rollCount: mkVariant(statId.rollCount, flatSuffix),
}

// Resolve ordering tokens against the computed numeric domain catalogs so
// both TS and Rust consume one generated order definition.
const resolveNamedOrder = (tokens, lookup, label) => {
  // Keep spec validation strict so typos fail the generator early.
  if (!Array.isArray(tokens)) {
    throw new Error(`Expected array for ${label}.`)
  }
  // Map every token to a numeric value; unknown names fail fast.
  return tokens.map((token) => {
    const key = String(token)
    if (!(key in lookup)) {
      throw new Error(`Unknown token "${key}" in ${label}.`)
    }
    return Number(lookup[key])
  })
}
// Decode shared ordering arrays from named tokens to numeric values once.
const preferredArtifactTypeOrder = resolveNamedOrder(
  ordering.preferredArtifactTypeOrder,
  artifactType,
  'ordering.preferredArtifactTypeOrder',
)
const statVariantsPriorityRow1 = resolveNamedOrder(
  ordering.statVariantsPriorityRow1,
  statVariant,
  'ordering.statVariantsPriorityRow1',
)
const statVariantsPriorityRow2 = resolveNamedOrder(
  ordering.statVariantsPriorityRow2,
  statVariant,
  'ordering.statVariantsPriorityRow2',
)
const statVariantsPriority = [...statVariantsPriorityRow1, ...statVariantsPriorityRow2]
const preferredStatOrder = resolveNamedOrder(
  ordering.preferredStatOrder,
  statVariant,
  'ordering.preferredStatOrder',
)

// Keep milestone helpers explicit so consumers can import direct named values.
const [level0, level4, level8, level12, level16] = level.milestones.map((value) => Number(value))

// Auto-rarity tables are indexed by rarity code (0..16) in both TS and Rust.
const toIntArray = (values, label) => {
  // Validate shape early so malformed specs fail with the field name.
  if (!Array.isArray(values)) {
    throw new Error(`Expected array for ${label}.`)
  }
  // Normalize all entries to numbers before downstream length checks.
  return values.map((value) => Number(value))
}
const toBoolArray = (values, label) => {
  // Validate shape early so malformed specs fail with the field name.
  if (!Array.isArray(values)) {
    throw new Error(`Expected array for ${label}.`)
  }
  // Normalize truthy booleans only; non-true values become false.
  return values.map((value) => value === true)
}
const assertAutoRarityLength = (values, label) => {
  // Rarity-code tables are fixed-width by design (codes 0 through 16).
  if (values.length !== 17) {
    throw new Error(`${label} must contain exactly 17 entries (rarity codes 0..16).`)
  }
}
// Pull each table from the shared spec and normalize by expected primitive type.
const autoRarityRollMaskByCode = toIntArray(autoRarity.rollMaskByCode, 'autoRarity.rollMaskByCode')
const autoRarityAdditionMaskByCode = toIntArray(autoRarity.additionMaskByCode, 'autoRarity.additionMaskByCode')
const autoRarityIncludesMythicalByCode = toBoolArray(autoRarity.includesMythicalByCode, 'autoRarity.includesMythicalByCode')
const autoRarityMinRollEventsByCode = toIntArray(autoRarity.minRollEventsByCode, 'autoRarity.minRollEventsByCode')
// Enforce width parity once per table so emitters can trust array indexing.
assertAutoRarityLength(autoRarityRollMaskByCode, 'autoRarity.rollMaskByCode')
assertAutoRarityLength(autoRarityAdditionMaskByCode, 'autoRarity.additionMaskByCode')
assertAutoRarityLength(autoRarityIncludesMythicalByCode, 'autoRarity.includesMythicalByCode')
assertAutoRarityLength(autoRarityMinRollEventsByCode, 'autoRarity.minRollEventsByCode')
// Emit boolean arrays in each target language's literal style.
const autoRarityBoolTs = autoRarityIncludesMythicalByCode.map((value) => (value ? 'true' : 'false')).join(', ')
const autoRarityBoolRust = autoRarityIncludesMythicalByCode.map((value) => (value ? 'true' : 'false')).join(", ")

// Rank bounds are shared by safeguard normalization and matcher mask logic.
const rankValueMin = Number(rankValue.min)
const rankValueMax = Number(rankValue.max)

// Safeguard token tables stay canonical in the shared constants payload.
const safeguardActivation = safeguard.activation
const safeguardSubstatMatch = safeguard.substatMatch
const safeguardCountModeDefault = safeguard.countModeDefault
const safeguardRuleOptionsDefault = safeguard.ruleOptionsDefault ?? {}
const safeguardPlaceholderReason = safeguard.placeholderReason
const safeguardWeight = safeguard.weight

// Emit stable string literals for each target language.
const asTsStringLiteral = (value) => JSON.stringify(String(value))
const asRustStringLiteral = (value) => (
  `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
)
const asRustF64Literal = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    throw new Error(`Expected finite float value, received: ${String(value)}`)
  }
  if (Number.isInteger(numeric)) return `${numeric}.0`
  return String(numeric)
}

// TypeScript emitter keeps constants tree-shakeable and easy to import by name.
const tsLines = [
  '// AUTO-GENERATED FILE. DO NOT EDIT.',
  '// Source: shared/domain-constants.json',
  '// Generator: scripts/tooling/generate-domain-constants.mjs',
  '',
  '// Shared sentinel for accessories that have no set id.',
  `export const ACCESSORY_NO_SET_ID = ${Number(accessoryNoSetId)}`,
  '',
  '// Artifact slot identifiers used by UI + rule engine code paths.',
  `export const ARTIFACT_TYPE_HELMET = ${Number(artifactType.helmet)}`,
  `export const ARTIFACT_TYPE_CHESTPLATE = ${Number(artifactType.chestplate)}`,
  `export const ARTIFACT_TYPE_GAUNTLETS = ${Number(artifactType.gauntlets)}`,
  `export const ARTIFACT_TYPE_BOOTS = ${Number(artifactType.boots)}`,
  `export const ARTIFACT_TYPE_WEAPON = ${Number(artifactType.weapon)}`,
  `export const ARTIFACT_TYPE_SHIELD = ${Number(artifactType.shield)}`,
  `export const ARTIFACT_TYPE_RING = ${Number(artifactType.ring)}`,
  `export const ARTIFACT_TYPE_AMULET = ${Number(artifactType.amulet)}`,
  `export const ARTIFACT_TYPE_BANNER = ${Number(artifactType.banner)}`,
  '',
  '// Base HSF stat id identifiers used in type/model conversions.',
  `export const STAT_ID_ANY = ${Number(statId.any)}`,
  `export const STAT_ID_HP = ${Number(statId.hp)}`,
  `export const STAT_ID_ATK = ${Number(statId.atk)}`,
  `export const STAT_ID_DEF = ${Number(statId.def)}`,
  `export const STAT_ID_SPD = ${Number(statId.spd)}`,
  `export const STAT_ID_RES = ${Number(statId.res)}`,
  `export const STAT_ID_ACC = ${Number(statId.acc)}`,
  `export const STAT_ID_CR = ${Number(statId.cr)}`,
  `export const STAT_ID_CDMG = ${Number(statId.cdmg)}`,
  `export const STAT_ID_HP_ATK_DEF = ${Number(statId.hpAtkDef)}`,
  `export const STAT_ID_ROLL_COUNT = ${Number(statId.rollCount)}`,
  '',
  '// Rarity code domain used by builder/rules generation.',
  `export const RARITY_CODE_ANY = ${Number(rarityCode.any)}`,
  `export const RARITY_CODE_COMMON = ${Number(rarityCode.common)}`,
  `export const RARITY_CODE_UNCOMMON = ${Number(rarityCode.uncommon)}`,
  `export const RARITY_CODE_RARE = ${Number(rarityCode.rare)}`,
  `export const RARITY_CODE_EPIC = ${Number(rarityCode.epic)}`,
  `export const RARITY_CODE_LEGENDARY = ${Number(rarityCode.legendary)}`,
  `export const RARITY_CODE_GTE_COMMON = ${Number(rarityCode.gteCommon)}`,
  `export const RARITY_CODE_GTE_UNCOMMON = ${Number(rarityCode.gteUncommon)}`,
  `export const RARITY_CODE_GTE_RARE = ${Number(rarityCode.gteRare)}`,
  `export const RARITY_CODE_GTE_EPIC = ${Number(rarityCode.gteEpic)}`,
  `export const RARITY_CODE_LTE_UNCOMMON = ${Number(rarityCode.lteUncommon)}`,
  `export const RARITY_CODE_LTE_RARE = ${Number(rarityCode.lteRare)}`,
  `export const RARITY_CODE_LTE_EPIC = ${Number(rarityCode.lteEpic)}`,
  `export const RARITY_CODE_LTE_LEGENDARY = ${Number(rarityCode.lteLegendary)}`,
  `export const RARITY_CODE_LTE_MYTHICAL = ${Number(rarityCode.lteMythical)}`,
  `export const RARITY_CODE_MYTHICAL = ${Number(rarityCode.mythical)}`,
  `export const RARITY_CODE_GTE_LEGENDARY = ${Number(rarityCode.gteLegendary)}`,
  '',
  '// Rank code domain used by builder/rules generation (mirrors types.ts::RankCode).',
  `export const RANK_CODE_ANY = ${Number(rankCode.any)}`,
  `export const RANK_CODE_ONE = ${Number(rankCode.one)}`,
  `export const RANK_CODE_TWO = ${Number(rankCode.two)}`,
  `export const RANK_CODE_THREE = ${Number(rankCode.three)}`,
  `export const RANK_CODE_FOUR = ${Number(rankCode.four)}`,
  `export const RANK_CODE_FIVE = ${Number(rankCode.five)}`,
  `export const RANK_CODE_SIX = ${Number(rankCode.six)}`,
  `export const RANK_CODE_GTE_ONE = ${Number(rankCode.gteOne)}`,
  `export const RANK_CODE_GTE_TWO = ${Number(rankCode.gteTwo)}`,
  `export const RANK_CODE_GTE_THREE = ${Number(rankCode.gteThree)}`,
  `export const RANK_CODE_GTE_FOUR = ${Number(rankCode.gteFour)}`,
  `export const RANK_CODE_GTE_FIVE = ${Number(rankCode.gteFive)}`,
  `export const RANK_CODE_LTE_TWO = ${Number(rankCode.lteTwo)}`,
  `export const RANK_CODE_LTE_THREE = ${Number(rankCode.lteThree)}`,
  `export const RANK_CODE_LTE_FOUR = ${Number(rankCode.lteFour)}`,
  `export const RANK_CODE_LTE_FIVE = ${Number(rankCode.lteFive)}`,
  `export const RANK_CODE_LTE_SIX = ${Number(rankCode.lteSix)}`,
  '',
  '// Rank value bounds shared across TS and Rust safeguard/matcher logic.',
  `export const RANK_VALUE_MIN = ${rankValueMin}`,
  `export const RANK_VALUE_MAX = ${rankValueMax}`,
  '',
  '// Level constants shared by builder/rule-engine code paths.',
  `export const LEVEL_ANY_SENTINEL = ${Number(level.anySentinel)}`,
  `export const LEVEL_MILESTONE_0 = ${level0}`,
  `export const LEVEL_MILESTONE_4 = ${level4}`,
  `export const LEVEL_MILESTONE_8 = ${level8}`,
  `export const LEVEL_MILESTONE_12 = ${level12}`,
  `export const LEVEL_MILESTONE_16 = ${level16}`,
  '',
  '// Substat slot and roll-count limits shared by builder and safeguard logic.',
  `export const SUBSTAT_SLOT_COUNT = ${Number(substat.slotCount)}`,
  `export const SUBSTAT_MAX_ROLLS_PER_SLOT = ${Number(substat.maxRollsPerSlot)}`,
  '',
  '// StatVariant bit encoding constants and concrete variant values.',
  `export const STAT_VARIANT_SHIFT_BITS = ${shiftBits}`,
  `export const STAT_VARIANT_ID_MASK = ${Number(encoding.statVariantIdMask)}`,
  `export const STAT_VARIANT_FLAT_SUFFIX = ${flatSuffix}`,
  `export const STAT_VARIANT_ANY = ${statVariant.any}`,
  `export const STAT_VARIANT_HP_PERCENT = ${statVariant.hpPercent}`,
  `export const STAT_VARIANT_HP_FLAT = ${statVariant.hpFlat}`,
  `export const STAT_VARIANT_ATK_PERCENT = ${statVariant.atkPercent}`,
  `export const STAT_VARIANT_ATK_FLAT = ${statVariant.atkFlat}`,
  `export const STAT_VARIANT_DEF_PERCENT = ${statVariant.defPercent}`,
  `export const STAT_VARIANT_DEF_FLAT = ${statVariant.defFlat}`,
  `export const STAT_VARIANT_SPD = ${statVariant.spd}`,
  `export const STAT_VARIANT_RES = ${statVariant.res}`,
  `export const STAT_VARIANT_ACC = ${statVariant.acc}`,
  `export const STAT_VARIANT_CR = ${statVariant.cr}`,
  `export const STAT_VARIANT_CDMG = ${statVariant.cdmg}`,
  `export const STAT_VARIANT_ROLL_COUNT = ${statVariant.rollCount}`,
  '',
  '// Auto-rarity lookup tables keyed by rarity code (0..16).',
  `export const AUTO_RARITY_ROLL_MASK_BY_CODE = [${autoRarityRollMaskByCode.join(', ')}] as const`,
  `export const AUTO_RARITY_ADDITION_MASK_BY_CODE = [${autoRarityAdditionMaskByCode.join(', ')}] as const`,
  `export const AUTO_RARITY_INCLUDES_MYTHICAL_BY_CODE = [${autoRarityBoolTs}] as const`,
  `export const AUTO_RARITY_MIN_ROLL_EVENTS_BY_CODE = [${autoRarityMinRollEventsByCode.join(', ')}] as const`,
  '',
  '// Keep-unique token + default mode constants used by TS and Rust paths.',
  `export const SAFEGUARD_ACTIVATION_OFF = ${asTsStringLiteral(safeguardActivation.off)}`,
  `export const SAFEGUARD_ACTIVATION_PROTECT_EXISTING = ${asTsStringLiteral(safeguardActivation.protectExisting)}`,
  `export const SAFEGUARD_ACTIVATION_ANTICIPATE_GAPS = ${asTsStringLiteral(safeguardActivation.anticipateGaps)}`,
  `export const SAFEGUARD_SUBSTAT_ANY = ${asTsStringLiteral(safeguardSubstatMatch.any)}`,
  `export const SAFEGUARD_SUBSTAT_ALL = ${asTsStringLiteral(safeguardSubstatMatch.all)}`,
  `export const SAFEGUARD_SUBSTAT_PER_SUBSTAT = ${asTsStringLiteral(safeguardSubstatMatch.perSubstat)}`,
  `export const SAFEGUARD_DEFAULT_COUNT_MODE_PER_RULE = ${safeguardCountModeDefault.perRule === true}`,
  `export const SAFEGUARD_DEFAULT_COUNT_MODE_PER_SET = ${safeguardCountModeDefault.perSet === true}`,
  `export const SAFEGUARD_DEFAULT_COUNT_MODE_PER_FACTION = ${safeguardCountModeDefault.perFaction === true}`,
  `export const SAFEGUARD_DEFAULT_COUNT_MODE_PER_MAIN_STAT = ${safeguardCountModeDefault.perMainStat === true}`,
  `export const SAFEGUARD_DEFAULT_COUNT_MODE_PER_SLOT = ${safeguardCountModeDefault.perSlot === true}`,
  `export const SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS = ${safeguardRuleOptionsDefault.ignorePreviousSafeguards !== false}`,
  `export const SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION = ${safeguardRuleOptionsDefault.ignoreEquippedInCollection === true}`,
  `export const SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT = ${safeguardRuleOptionsDefault.ignoreEquippedInVault === true}`,
  `export const SAFEGUARD_REASON_GLOBAL = ${asTsStringLiteral(safeguardPlaceholderReason.global)}`,
  `export const SAFEGUARD_REASON_GROUP = ${asTsStringLiteral(safeguardPlaceholderReason.group)}`,
  `export const SAFEGUARD_WEIGHT_STEP = ${Number(safeguardWeight.step)}`,
  `export const SAFEGUARD_WEIGHT_MIN = ${Number(safeguardWeight.min)}`,
  `export const SAFEGUARD_WEIGHT_MAX = ${Number(safeguardWeight.max)}`,
  `export const SAFEGUARD_WEIGHT_DEFAULT = ${Number(safeguardWeight.default)}`,
  '',
  '// Shared UI/rule ordering tables so TS and Rust sort with one SSOT payload.',
  `export const PREFERRED_ARTIFACT_TYPE_ORDER = [${preferredArtifactTypeOrder.join(', ')}] as const`,
  `export const STAT_VARIANTS_PRIORITY_ROW1 = [${statVariantsPriorityRow1.join(', ')}] as const`,
  `export const STAT_VARIANTS_PRIORITY_ROW2 = [${statVariantsPriorityRow2.join(', ')}] as const`,
  `export const STAT_VARIANTS_PRIORITY = [${statVariantsPriority.join(', ')}] as const`,
  `export const PREFERRED_STAT_ORDER = [${preferredStatOrder.join(', ')}] as const`,
  '',
]

// Rust emitter keeps the same symbol names used in rule_engine/src/lib.rs.
const rustLines = [
  '// AUTO-GENERATED FILE. DO NOT EDIT.',
  '// Source: shared/domain-constants.json',
  '// Generator: scripts/tooling/generate-domain-constants.mjs',
  '#![allow(dead_code)]',
  '',
  '// Shared sentinel for accessories that have no set id.',
  `pub const ACCESSORY_NO_SET_ID: i64 = ${Number(accessoryNoSetId)};`,
  '',
  '// Artifact slot identifiers used by UI + rule engine code paths.',
  `pub const ARTIFACT_TYPE_HELMET: i64 = ${Number(artifactType.helmet)};`,
  `pub const ARTIFACT_TYPE_CHESTPLATE: i64 = ${Number(artifactType.chestplate)};`,
  `pub const ARTIFACT_TYPE_GAUNTLETS: i64 = ${Number(artifactType.gauntlets)};`,
  `pub const ARTIFACT_TYPE_BOOTS: i64 = ${Number(artifactType.boots)};`,
  `pub const ARTIFACT_TYPE_WEAPON: i64 = ${Number(artifactType.weapon)};`,
  `pub const ARTIFACT_TYPE_SHIELD: i64 = ${Number(artifactType.shield)};`,
  `pub const ARTIFACT_TYPE_RING: i64 = ${Number(artifactType.ring)};`,
  `pub const ARTIFACT_TYPE_AMULET: i64 = ${Number(artifactType.amulet)};`,
  `pub const ARTIFACT_TYPE_BANNER: i64 = ${Number(artifactType.banner)};`,
  '',
  '// Base HSF stat id identifiers used in type/model conversions.',
  `pub const STAT_ID_ANY: i64 = ${Number(statId.any)};`,
  `pub const STAT_ID_HP: i64 = ${Number(statId.hp)};`,
  `pub const STAT_ID_ATK: i64 = ${Number(statId.atk)};`,
  `pub const STAT_ID_DEF: i64 = ${Number(statId.def)};`,
  `pub const STAT_ID_SPD: i64 = ${Number(statId.spd)};`,
  `pub const STAT_ID_RES: i64 = ${Number(statId.res)};`,
  `pub const STAT_ID_ACC: i64 = ${Number(statId.acc)};`,
  `pub const STAT_ID_CR: i64 = ${Number(statId.cr)};`,
  `pub const STAT_ID_CDMG: i64 = ${Number(statId.cdmg)};`,
  `pub const STAT_ID_HP_ATK_DEF: i64 = ${Number(statId.hpAtkDef)};`,
  `pub const STAT_ID_ROLL_COUNT: i64 = ${Number(statId.rollCount)};`,
  '',
  '// Rarity code domain used by builder/rules generation.',
  `pub const RARITY_CODE_ANY: i64 = ${Number(rarityCode.any)};`,
  `pub const RARITY_CODE_COMMON: i64 = ${Number(rarityCode.common)};`,
  `pub const RARITY_CODE_UNCOMMON: i64 = ${Number(rarityCode.uncommon)};`,
  `pub const RARITY_CODE_RARE: i64 = ${Number(rarityCode.rare)};`,
  `pub const RARITY_CODE_EPIC: i64 = ${Number(rarityCode.epic)};`,
  `pub const RARITY_CODE_LEGENDARY: i64 = ${Number(rarityCode.legendary)};`,
  `pub const RARITY_CODE_GTE_COMMON: i64 = ${Number(rarityCode.gteCommon)};`,
  `pub const RARITY_CODE_GTE_UNCOMMON: i64 = ${Number(rarityCode.gteUncommon)};`,
  `pub const RARITY_CODE_GTE_RARE: i64 = ${Number(rarityCode.gteRare)};`,
  `pub const RARITY_CODE_GTE_EPIC: i64 = ${Number(rarityCode.gteEpic)};`,
  `pub const RARITY_CODE_LTE_UNCOMMON: i64 = ${Number(rarityCode.lteUncommon)};`,
  `pub const RARITY_CODE_LTE_RARE: i64 = ${Number(rarityCode.lteRare)};`,
  `pub const RARITY_CODE_LTE_EPIC: i64 = ${Number(rarityCode.lteEpic)};`,
  `pub const RARITY_CODE_LTE_LEGENDARY: i64 = ${Number(rarityCode.lteLegendary)};`,
  `pub const RARITY_CODE_LTE_MYTHICAL: i64 = ${Number(rarityCode.lteMythical)};`,
  `pub const RARITY_CODE_MYTHICAL: i64 = ${Number(rarityCode.mythical)};`,
  `pub const RARITY_CODE_GTE_LEGENDARY: i64 = ${Number(rarityCode.gteLegendary)};`,
  '',
  '// Rank code domain used by builder/rules generation (mirrors types.ts::RankCode).',
  `pub const RANK_CODE_ANY: i64 = ${Number(rankCode.any)};`,
  `pub const RANK_CODE_ONE: i64 = ${Number(rankCode.one)};`,
  `pub const RANK_CODE_TWO: i64 = ${Number(rankCode.two)};`,
  `pub const RANK_CODE_THREE: i64 = ${Number(rankCode.three)};`,
  `pub const RANK_CODE_FOUR: i64 = ${Number(rankCode.four)};`,
  `pub const RANK_CODE_FIVE: i64 = ${Number(rankCode.five)};`,
  `pub const RANK_CODE_SIX: i64 = ${Number(rankCode.six)};`,
  `pub const RANK_CODE_GTE_ONE: i64 = ${Number(rankCode.gteOne)};`,
  `pub const RANK_CODE_GTE_TWO: i64 = ${Number(rankCode.gteTwo)};`,
  `pub const RANK_CODE_GTE_THREE: i64 = ${Number(rankCode.gteThree)};`,
  `pub const RANK_CODE_GTE_FOUR: i64 = ${Number(rankCode.gteFour)};`,
  `pub const RANK_CODE_GTE_FIVE: i64 = ${Number(rankCode.gteFive)};`,
  `pub const RANK_CODE_LTE_TWO: i64 = ${Number(rankCode.lteTwo)};`,
  `pub const RANK_CODE_LTE_THREE: i64 = ${Number(rankCode.lteThree)};`,
  `pub const RANK_CODE_LTE_FOUR: i64 = ${Number(rankCode.lteFour)};`,
  `pub const RANK_CODE_LTE_FIVE: i64 = ${Number(rankCode.lteFive)};`,
  `pub const RANK_CODE_LTE_SIX: i64 = ${Number(rankCode.lteSix)};`,
  '',
  '// Rank value bounds shared across TS and Rust safeguard/matcher logic.',
  `pub const RANK_VALUE_MIN: i64 = ${rankValueMin};`,
  `pub const RANK_VALUE_MAX: i64 = ${rankValueMax};`,
  '',
  '// Level constants shared by builder/rule-engine code paths.',
  `pub const LEVEL_ANY_SENTINEL: i64 = ${Number(level.anySentinel)};`,
  `pub const LEVEL_MILESTONE_0: i64 = ${level0};`,
  `pub const LEVEL_MILESTONE_4: i64 = ${level4};`,
  `pub const LEVEL_MILESTONE_8: i64 = ${level8};`,
  `pub const LEVEL_MILESTONE_12: i64 = ${level12};`,
  `pub const LEVEL_MILESTONE_16: i64 = ${level16};`,
  '',
  '// Substat slot and roll-count limits shared by builder and safeguard logic.',
  `pub const SUBSTAT_SLOT_COUNT: i64 = ${Number(substat.slotCount)};`,
  `pub const SUBSTAT_MAX_ROLLS_PER_SLOT: i64 = ${Number(substat.maxRollsPerSlot)};`,
  '',
  '// StatVariant bit encoding constants and concrete variant values.',
  `pub const STAT_VARIANT_SHIFT_BITS: i64 = ${shiftBits};`,
  `pub const STAT_VARIANT_ID_MASK: i64 = ${Number(encoding.statVariantIdMask)};`,
  `pub const STAT_VARIANT_FLAT_SUFFIX: i64 = ${flatSuffix};`,
  `pub const STAT_VARIANT_ANY: i64 = ${statVariant.any};`,
  `pub const STAT_VARIANT_HP_PERCENT: i64 = ${statVariant.hpPercent};`,
  `pub const STAT_VARIANT_HP_FLAT: i64 = ${statVariant.hpFlat};`,
  `pub const STAT_VARIANT_ATK_PERCENT: i64 = ${statVariant.atkPercent};`,
  `pub const STAT_VARIANT_ATK_FLAT: i64 = ${statVariant.atkFlat};`,
  `pub const STAT_VARIANT_DEF_PERCENT: i64 = ${statVariant.defPercent};`,
  `pub const STAT_VARIANT_DEF_FLAT: i64 = ${statVariant.defFlat};`,
  `pub const STAT_VARIANT_SPD: i64 = ${statVariant.spd};`,
  `pub const STAT_VARIANT_RES: i64 = ${statVariant.res};`,
  `pub const STAT_VARIANT_ACC: i64 = ${statVariant.acc};`,
  `pub const STAT_VARIANT_CR: i64 = ${statVariant.cr};`,
  `pub const STAT_VARIANT_CDMG: i64 = ${statVariant.cdmg};`,
  `pub const STAT_VARIANT_ROLL_COUNT: i64 = ${statVariant.rollCount};`,
  '',
  '// Auto-rarity lookup tables keyed by rarity code (0..16).',
  `pub const AUTO_RARITY_ROLL_MASK_BY_CODE: [i64; 17] = [${autoRarityRollMaskByCode.join(", ")}];`,
  `pub const AUTO_RARITY_ADDITION_MASK_BY_CODE: [i64; 17] = [${autoRarityAdditionMaskByCode.join(", ")}];`,
  `pub const AUTO_RARITY_INCLUDES_MYTHICAL_BY_CODE: [bool; 17] = [${autoRarityBoolRust}];`,
  `pub const AUTO_RARITY_MIN_ROLL_EVENTS_BY_CODE: [i64; 17] = [${autoRarityMinRollEventsByCode.join(", ")}];`,
  '',
  '// Safeguard token + default mode constants used by TS and Rust paths.',
  `pub const SAFEGUARD_ACTIVATION_OFF: &str = ${asRustStringLiteral(safeguardActivation.off)};`,
  `pub const SAFEGUARD_ACTIVATION_PROTECT_EXISTING: &str = ${asRustStringLiteral(safeguardActivation.protectExisting)};`,
  `pub const SAFEGUARD_ACTIVATION_ANTICIPATE_GAPS: &str = ${asRustStringLiteral(safeguardActivation.anticipateGaps)};`,
  `pub const SAFEGUARD_SUBSTAT_ANY: &str = ${asRustStringLiteral(safeguardSubstatMatch.any)};`,
  `pub const SAFEGUARD_SUBSTAT_ALL: &str = ${asRustStringLiteral(safeguardSubstatMatch.all)};`,
  `pub const SAFEGUARD_SUBSTAT_PER_SUBSTAT: &str = ${asRustStringLiteral(safeguardSubstatMatch.perSubstat)};`,
  `pub const SAFEGUARD_DEFAULT_COUNT_MODE_PER_RULE: bool = ${safeguardCountModeDefault.perRule === true};`,
  `pub const SAFEGUARD_DEFAULT_COUNT_MODE_PER_SET: bool = ${safeguardCountModeDefault.perSet === true};`,
  `pub const SAFEGUARD_DEFAULT_COUNT_MODE_PER_FACTION: bool = ${safeguardCountModeDefault.perFaction === true};`,
  `pub const SAFEGUARD_DEFAULT_COUNT_MODE_PER_MAIN_STAT: bool = ${safeguardCountModeDefault.perMainStat === true};`,
  `pub const SAFEGUARD_DEFAULT_COUNT_MODE_PER_SLOT: bool = ${safeguardCountModeDefault.perSlot === true};`,
  `pub const SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS: bool = ${safeguardRuleOptionsDefault.ignorePreviousSafeguards !== false};`,
  `pub const SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION: bool = ${safeguardRuleOptionsDefault.ignoreEquippedInCollection === true};`,
  `pub const SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT: bool = ${safeguardRuleOptionsDefault.ignoreEquippedInVault === true};`,
  `pub const SAFEGUARD_REASON_GLOBAL: &str = ${asRustStringLiteral(safeguardPlaceholderReason.global)};`,
  `pub const SAFEGUARD_REASON_GROUP: &str = ${asRustStringLiteral(safeguardPlaceholderReason.group)};`,
  `pub const SAFEGUARD_WEIGHT_STEP: f64 = ${asRustF64Literal(safeguardWeight.step)};`,
  `pub const SAFEGUARD_WEIGHT_MIN: f64 = ${asRustF64Literal(safeguardWeight.min)};`,
  `pub const SAFEGUARD_WEIGHT_MAX: f64 = ${asRustF64Literal(safeguardWeight.max)};`,
  `pub const SAFEGUARD_WEIGHT_DEFAULT: f64 = ${asRustF64Literal(safeguardWeight.default)};`,
  '',
  '// Shared UI/rule ordering tables so TS and Rust sort with one SSOT payload.',
  `pub const PREFERRED_ARTIFACT_TYPE_ORDER: [i64; ${preferredArtifactTypeOrder.length}] = [${preferredArtifactTypeOrder.join(", ")}];`,
  `pub const STAT_VARIANTS_PRIORITY_ROW1: [i64; ${statVariantsPriorityRow1.length}] = [${statVariantsPriorityRow1.join(", ")}];`,
  `pub const STAT_VARIANTS_PRIORITY_ROW2: [i64; ${statVariantsPriorityRow2.length}] = [${statVariantsPriorityRow2.join(", ")}];`,
  `pub const STAT_VARIANTS_PRIORITY: [i64; ${statVariantsPriority.length}] = [${statVariantsPriority.join(", ")}];`,
  `pub const PREFERRED_STAT_ORDER: [i64; ${preferredStatOrder.length}] = [${preferredStatOrder.join(", ")}];`,
  '',
]

// ---------------------------------------------------------------------------
// New sections: faction, artifactTypeNames, statVariantLabels,
// allowedMainsBySlot, allowedSubsBySlot, substatRollRangesByStar, glyphRangesByRank
// ---------------------------------------------------------------------------

const factionSpec = spec.faction
const artifactTypeNamesSpec = spec.artifactTypeNames
const statVariantLabelsSpec = spec.statVariantLabels
const allowedMainsBySlotSpec = spec.allowedMainsBySlot
const allowedSubsBySlotSpec = spec.allowedSubsBySlot
const substatRollRangesByStar = spec.substatRollRangesByStar
const glyphRangesByRank = spec.glyphRangesByRank

// Build sorted-by-id faction array for both emitters.
const factionEntries = Object.entries(factionSpec)
  .map(([key, val]) => ({ key, id: Number(val.id), name: String(val.name) }))
  .sort((a, b) => a.id - b.id)

// Helper: camelCase key → SCREAMING_SNAKE constant suffix.
const toScreamingSnake = (key) =>
  key.replace(/([A-Z])/g, '_$1').toUpperCase()

// ── TS: faction individual constants ──────────────────────────────────────
tsLines.push('')
tsLines.push('// Faction IDs — one constant per faction (mirrors Faction enum in types.ts).')
for (const { key, id } of factionEntries) {
  tsLines.push(`export const FACTION_ID_${toScreamingSnake(key)} = ${id}`)
}

// TS: FACTION_NAMES record (0 → '' plus all factions).
const factionNamesEntries = [['0', "''"]]
for (const { id, name } of factionEntries) {
  factionNamesEntries.push([String(id), JSON.stringify(name)])
}
tsLines.push('')
tsLines.push('// Map of faction ID → display name (0 = Any/none).')
tsLines.push(
  `export const FACTION_NAMES: Record<number, string> = { ${factionNamesEntries.map(([k, v]) => `${k}: ${v}`).join(', ')} }`
)

// TS: FACTION_NAMES_TO_ID record.
const factionNamesToIdEntries = factionEntries.map(({ id, name }) => `${JSON.stringify(name)}: ${id}`)
tsLines.push('')
tsLines.push('// Map of faction display name → faction ID.')
tsLines.push(
  `export const FACTION_NAMES_TO_ID: Record<string, number> = { ${factionNamesToIdEntries.join(', ')} }`
)

// ── TS: artifactTypeNames display map ────────────────────────────────────
// Resolve token → numeric ID from artifactType then build ID → name map.
const artifactTypeDisplayEntries = Object.entries(artifactTypeNamesSpec)
  .map(([token, name]) => ({ id: Number(artifactType[token]), name: String(name) }))
  .sort((a, b) => a.id - b.id)
tsLines.push('')
tsLines.push('// Artifact slot display names by numeric ID (mirrors artifactTypeNames in types.ts).')
tsLines.push(
  `export const ARTIFACT_TYPE_DISPLAY_NAMES: Record<number, string> = { ${artifactTypeDisplayEntries.map(({ id, name }) => `${id}: ${JSON.stringify(name)}`).join(', ')} }`
)

// ── TS: statVariant display labels ───────────────────────────────────────
const statVariantLabelEntries = Object.entries(statVariantLabelsSpec)
  .map(([token, label]) => ({ variant: Number(statVariant[token]), label: String(label) }))
  .sort((a, b) => a.variant - b.variant)
tsLines.push('')
tsLines.push('// Stat variant numeric value → canonical display label.')
tsLines.push(
  `export const STAT_VARIANT_DISPLAY_LABELS: Record<number, string> = { ${statVariantLabelEntries.map(({ variant, label }) => `${variant}: ${JSON.stringify(label)}`).join(', ')} }`
)

// ── TS: allowedMainsBySlot ────────────────────────────────────────────────
// Resolve slot tokens → IDs and stat variant tokens → variant numbers.
const allowedMainsEntries = Object.entries(allowedMainsBySlotSpec)
  .map(([slotToken, variantTokens]) => ({
    slotId: Number(artifactType[slotToken]),
    variants: variantTokens.map((t) => Number(statVariant[t])),
  }))
  .sort((a, b) => a.slotId - b.slotId)
tsLines.push('')
tsLines.push('// Allowed main stat variants by artifact slot ID.')
tsLines.push(
  `export const ALLOWED_MAINS_BY_SLOT: Record<number, readonly number[]> = { ${allowedMainsEntries.map(({ slotId, variants }) => `[${slotId}]: [${variants.join(', ')}]`).join(', ')} }`
)

// ── TS: allowedSubsBySlot ─────────────────────────────────────────────────
const allowedSubsEntries = Object.entries(allowedSubsBySlotSpec)
  .map(([slotToken, variantTokens]) => ({
    slotId: Number(artifactType[slotToken]),
    variants: variantTokens.map((t) => Number(statVariant[t])),
  }))
  .sort((a, b) => a.slotId - b.slotId)
tsLines.push('')
tsLines.push('// Allowed sub stat variants by artifact slot ID.')
tsLines.push(
  `export const ALLOWED_SUBS_BY_SLOT: Record<number, readonly number[]> = { ${allowedSubsEntries.map(({ slotId, variants }) => `[${slotId}]: [${variants.join(', ')}]`).join(', ')} }`
)

// ── TS: substatRollRangesByStar ──────────────────────────────────────────
// Per-roll min/max ranges for upgrade chance two-value branching.
// The min value also serves as the factory-default substat minimum (SSOT — no separate minima table).
const substatRollRangesStarEntries = Object.entries(substatRollRangesByStar)
  .map(([starStr, statMap]) => ({
    star: Number(starStr),
    pairs: Object.entries(statMap)
      .map(([token, range]) => ({ variant: Number(statVariant[token]), min: Number(range.min), max: Number(range.max) }))
      .sort((a, b) => a.variant - b.variant),
  }))
  .sort((a, b) => a.star - b.star)
tsLines.push('')
tsLines.push('// Per-roll substat { min, max } range keyed by star (1..6) then stat variant.')
tsLines.push('// Community-sourced; 6-star high confidence, lower stars are estimates.')
tsLines.push('// min is also the factory-default substat minimum for that star tier.')
const substatRollRangesBody = substatRollRangesStarEntries
  .map(({ star, pairs }) =>
    `${star}: { ${pairs.map(({ variant, min, max }) => `${variant}: { min: ${min}, max: ${max} }`).join(', ')} }`
  )
  .join(', ')
tsLines.push(
  `export const SUBSTAT_ROLL_RANGES_BY_STAR: Record<number, Record<number, { readonly min: number; readonly max: number }>> = { ${substatRollRangesBody} }`
)

// ── TS: glyphRangesByRank ───────────────────────────────────────────────
// Glyph enchantment { min, max } by gear rank. CR/CDMG are non-glyphable and absent.
const glyphRangesRankEntries = Object.entries(glyphRangesByRank)
  .map(([rankStr, statMap]) => ({
    rank: Number(rankStr),
    pairs: Object.entries(statMap)
      .map(([token, range]) => ({ variant: Number(statVariant[token]), min: Number(range.min), max: Number(range.max) }))
      .sort((a, b) => a.variant - b.variant),
  }))
  .sort((a, b) => a.rank - b.rank)
tsLines.push('')
tsLines.push('// Glyph enchantment { min, max } by gear rank then stat variant. CR/CDMG are non-glyphable and absent.')
const glyphRangesBody = glyphRangesRankEntries
  .map(({ rank, pairs }) =>
    `${rank}: { ${pairs.map(({ variant, min, max }) => `${variant}: { min: ${min}, max: ${max} }`).join(', ')} }`
  )
  .join(', ')
tsLines.push(
  `export const GLYPH_RANGES_BY_RANK: Record<number, Record<number, { readonly min: number; readonly max: number }>> = { ${glyphRangesBody} }`
)

// ── Rust: faction individual constants ───────────────────────────────────
rustLines.push('')
rustLines.push('// Faction IDs — one constant per faction.')
for (const { key, id } of factionEntries) {
  rustLines.push(`pub const FACTION_ID_${toScreamingSnake(key)}: i64 = ${id};`)
}

// Rust: FACTION_NAME_IDS sorted alphabetically by name.
const factionByName = [...factionEntries].sort((a, b) => a.name.localeCompare(b.name))
const factionNameIdsRust = factionByName
  .map(({ id, name }) => `(${asRustStringLiteral(name)}, ${id})`)
  .join(', ')
rustLines.push('')
rustLines.push('// Faction names sorted alphabetically for binary-compatible linear scan.')
rustLines.push(
  `pub const FACTION_NAME_IDS: &[(&str, i64)] = &[${factionNameIdsRust}];`
)

// ── Rust: ARTIFACT_TYPE_DISPLAY_NAMES ────────────────────────────────────
const artifactTypeDisplayRust = artifactTypeDisplayEntries
  .map(({ id, name }) => `(${id}, ${asRustStringLiteral(name)})`)
  .join(', ')
rustLines.push('')
rustLines.push('// Artifact slot display names by numeric ID, sorted by ID ascending.')
rustLines.push(
  `pub const ARTIFACT_TYPE_DISPLAY_NAMES: &[(i64, &str)] = &[${artifactTypeDisplayRust}];`
)

// ── Rust: STAT_VARIANT_DISPLAY_LABELS ────────────────────────────────────
const statVariantLabelsRust = statVariantLabelEntries
  .map(({ variant, label }) => `(${variant}, ${asRustStringLiteral(label)})`)
  .join(', ')
rustLines.push('')
rustLines.push('// Stat variant display labels sorted by variant value ascending.')
rustLines.push(
  `pub const STAT_VARIANT_DISPLAY_LABELS: &[(i64, &str)] = &[${statVariantLabelsRust}];`
)

// ── Rust: ALLOWED_MAINS per slot + dispatch array ────────────────────────
rustLines.push('')
rustLines.push('// Allowed main stat variants per slot (per-slot const + dispatch array).')
for (const { slotId, variants } of allowedMainsEntries) {
  // Find the slot token for a readable name suffix.
  const slotToken = Object.keys(artifactType).find((k) => Number(artifactType[k]) === slotId)
  const suffix = slotToken ? slotToken.toUpperCase() : `SLOT_${slotId}`
  rustLines.push(
    `pub const ALLOWED_MAINS_${suffix}: &[i64] = &[${variants.join(', ')}];`
  )
}
const allowedMainsDispatchRust = allowedMainsEntries.map(({ slotId }) => {
  const slotToken = Object.keys(artifactType).find((k) => Number(artifactType[k]) === slotId)
  const suffix = slotToken ? slotToken.toUpperCase() : `SLOT_${slotId}`
  return `(${slotId}, ALLOWED_MAINS_${suffix})`
}).join(', ')
rustLines.push(
  `pub const ALLOWED_MAINS_BY_SLOT: &[(i64, &[i64])] = &[${allowedMainsDispatchRust}];`
)

// ── Rust: ALLOWED_SUBS per slot + dispatch array ──────────────────────────
rustLines.push('')
rustLines.push('// Allowed sub stat variants per slot (per-slot const + dispatch array).')
for (const { slotId, variants } of allowedSubsEntries) {
  const slotToken = Object.keys(artifactType).find((k) => Number(artifactType[k]) === slotId)
  const suffix = slotToken ? slotToken.toUpperCase() : `SLOT_${slotId}`
  rustLines.push(
    `pub const ALLOWED_SUBS_${suffix}: &[i64] = &[${variants.join(', ')}];`
  )
}
const allowedSubsDispatchRust = allowedSubsEntries.map(({ slotId }) => {
  const slotToken = Object.keys(artifactType).find((k) => Number(artifactType[k]) === slotId)
  const suffix = slotToken ? slotToken.toUpperCase() : `SLOT_${slotId}`
  return `(${slotId}, ALLOWED_SUBS_${suffix})`
}).join(', ')
rustLines.push(
  `pub const ALLOWED_SUBS_BY_SLOT: &[(i64, &[i64])] = &[${allowedSubsDispatchRust}];`
)

// ── Rust: SUBSTAT_ROLL_RANGES per star + dispatch array ──────────────────
rustLines.push('')
rustLines.push('// Per-roll substat (min, max) range per star tier.')
rustLines.push('// Community-sourced; 6-star high confidence, lower stars are estimates.')
for (const { star, pairs } of substatRollRangesStarEntries) {
  const pairsRust = pairs.map(({ variant, min, max }) => `(${variant}, ${min}, ${max})`).join(', ')
  rustLines.push(
    `pub const SUBSTAT_ROLL_RANGES_${star}STAR: &[(i64, i64, i64)] = &[${pairsRust}];`
  )
}
const substatRollRangesDispatchRust = substatRollRangesStarEntries
  .map(({ star }) => `(${star}, SUBSTAT_ROLL_RANGES_${star}STAR)`)
  .join(', ')
rustLines.push(
  `pub const SUBSTAT_ROLL_RANGES_BY_STAR: &[(i64, &[(i64, i64, i64)])] = &[${substatRollRangesDispatchRust}];`
)

// ── Rust: GLYPH_RANGES per rank + dispatch array ────────────────────────
rustLines.push('')
rustLines.push('// Glyph enchantment (variant, min, max) per gear rank. CR/CDMG are non-glyphable and absent.')
for (const { rank, pairs } of glyphRangesRankEntries) {
  const pairsRust = pairs.map(({ variant, min, max }) => `(${variant}, ${min}, ${max})`).join(', ')
  rustLines.push(
    `pub const GLYPH_RANGES_R${rank}: &[(i64, i64, i64)] = &[${pairsRust}];`
  )
}
const glyphRangesDispatchRust = glyphRangesRankEntries
  .map(({ rank }) => `(${rank}, GLYPH_RANGES_R${rank})`)
  .join(', ')
rustLines.push(
  `pub const GLYPH_RANGES_BY_RANK: &[(i64, &[(i64, i64, i64)])] = &[${glyphRangesDispatchRust}];`
)

// Ensure target directories exist before writing generated outputs.
await fs.mkdir(path.dirname(TS_OUT_PATH), { recursive: true })
await fs.mkdir(path.dirname(RUST_OUT_PATH), { recursive: true })

// Write deterministic trailing newline output for clean diffs.
await fs.writeFile(TS_OUT_PATH, `${tsLines.join('\n')}\n`, 'utf8')
await fs.writeFile(RUST_OUT_PATH, `${rustLines.join('\n')}\n`, 'utf8')

// Keep script output concise so CI logs still show what was generated.
console.log(`Generated ${path.relative(REPO_ROOT, TS_OUT_PATH)}`)
console.log(`Generated ${path.relative(REPO_ROOT, RUST_OUT_PATH)}`)
