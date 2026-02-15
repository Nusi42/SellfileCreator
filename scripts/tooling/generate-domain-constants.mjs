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
const RUST_OUT_PATH = path.join(REPO_ROOT, 'wasm', 'rule_engine', 'src', 'generated_domain_constants.rs')

// Read and parse the canonical JSON source once so both emitters consume the
// exact same values in this process.
const rawSpec = await fs.readFile(SPEC_PATH, 'utf8')
const spec = JSON.parse(rawSpec)

// Keep value access centralized so TS and Rust emitters share one derivation.
const artifactType = spec.artifactType
const statId = spec.statId
const rarityCode = spec.rarityCode
const rankValue = spec.rankValue
const level = spec.level
const encoding = spec.encoding
const autoRarity = spec.autoRarity
const keepUnique = spec.keepUnique
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

// Rank bounds are shared by keep-unique normalization and matcher mask logic.
const rankValueMin = Number(rankValue.min)
const rankValueMax = Number(rankValue.max)

// Keep-unique token tables stay canonical in the shared constants payload.
const keepUniqueActivation = keepUnique.activation
const keepUniqueSubstatMatch = keepUnique.substatMatch
const keepUniqueCountModeDefault = keepUnique.countModeDefault
const keepUniquePlaceholderReason = keepUnique.placeholderReason
const keepUniqueWeight = keepUnique.weight

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
  '// Rank value bounds shared across TS and Rust keep-unique/matcher logic.',
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
  `export const KEEP_UNIQUE_ACTIVATION_OFF = ${asTsStringLiteral(keepUniqueActivation.off)}`,
  `export const KEEP_UNIQUE_ACTIVATION_PROTECT_EXISTING = ${asTsStringLiteral(keepUniqueActivation.protectExisting)}`,
  `export const KEEP_UNIQUE_ACTIVATION_ANTICIPATE_GAPS = ${asTsStringLiteral(keepUniqueActivation.anticipateGaps)}`,
  `export const KEEP_UNIQUE_SUBSTAT_ANY = ${asTsStringLiteral(keepUniqueSubstatMatch.any)}`,
  `export const KEEP_UNIQUE_SUBSTAT_ALL = ${asTsStringLiteral(keepUniqueSubstatMatch.all)}`,
  `export const KEEP_UNIQUE_SUBSTAT_PER_SUBSTAT = ${asTsStringLiteral(keepUniqueSubstatMatch.perSubstat)}`,
  `export const KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_RULE = ${keepUniqueCountModeDefault.perRule === true}`,
  `export const KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_SET = ${keepUniqueCountModeDefault.perSet === true}`,
  `export const KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_FACTION = ${keepUniqueCountModeDefault.perFaction === true}`,
  `export const KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_MAIN_STAT = ${keepUniqueCountModeDefault.perMainStat === true}`,
  `export const KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_SLOT = ${keepUniqueCountModeDefault.perSlot === true}`,
  `export const KEEP_UNIQUE_REASON_GLOBAL = ${asTsStringLiteral(keepUniquePlaceholderReason.global)}`,
  `export const KEEP_UNIQUE_REASON_GROUP = ${asTsStringLiteral(keepUniquePlaceholderReason.group)}`,
  `export const KEEP_UNIQUE_WEIGHT_STEP = ${Number(keepUniqueWeight.step)}`,
  `export const KEEP_UNIQUE_WEIGHT_MIN = ${Number(keepUniqueWeight.min)}`,
  `export const KEEP_UNIQUE_WEIGHT_MAX = ${Number(keepUniqueWeight.max)}`,
  `export const KEEP_UNIQUE_WEIGHT_DEFAULT = ${Number(keepUniqueWeight.default)}`,
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
  '// Rank value bounds shared across TS and Rust keep-unique/matcher logic.',
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
  '// Keep-unique token + default mode constants used by TS and Rust paths.',
  `pub const KEEP_UNIQUE_ACTIVATION_OFF: &str = ${asRustStringLiteral(keepUniqueActivation.off)};`,
  `pub const KEEP_UNIQUE_ACTIVATION_PROTECT_EXISTING: &str = ${asRustStringLiteral(keepUniqueActivation.protectExisting)};`,
  `pub const KEEP_UNIQUE_ACTIVATION_ANTICIPATE_GAPS: &str = ${asRustStringLiteral(keepUniqueActivation.anticipateGaps)};`,
  `pub const KEEP_UNIQUE_SUBSTAT_ANY: &str = ${asRustStringLiteral(keepUniqueSubstatMatch.any)};`,
  `pub const KEEP_UNIQUE_SUBSTAT_ALL: &str = ${asRustStringLiteral(keepUniqueSubstatMatch.all)};`,
  `pub const KEEP_UNIQUE_SUBSTAT_PER_SUBSTAT: &str = ${asRustStringLiteral(keepUniqueSubstatMatch.perSubstat)};`,
  `pub const KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_RULE: bool = ${keepUniqueCountModeDefault.perRule === true};`,
  `pub const KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_SET: bool = ${keepUniqueCountModeDefault.perSet === true};`,
  `pub const KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_FACTION: bool = ${keepUniqueCountModeDefault.perFaction === true};`,
  `pub const KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_MAIN_STAT: bool = ${keepUniqueCountModeDefault.perMainStat === true};`,
  `pub const KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_SLOT: bool = ${keepUniqueCountModeDefault.perSlot === true};`,
  `pub const KEEP_UNIQUE_REASON_GLOBAL: &str = ${asRustStringLiteral(keepUniquePlaceholderReason.global)};`,
  `pub const KEEP_UNIQUE_REASON_GROUP: &str = ${asRustStringLiteral(keepUniquePlaceholderReason.group)};`,
  `pub const KEEP_UNIQUE_WEIGHT_STEP: f64 = ${asRustF64Literal(keepUniqueWeight.step)};`,
  `pub const KEEP_UNIQUE_WEIGHT_MIN: f64 = ${asRustF64Literal(keepUniqueWeight.min)};`,
  `pub const KEEP_UNIQUE_WEIGHT_MAX: f64 = ${asRustF64Literal(keepUniqueWeight.max)};`,
  `pub const KEEP_UNIQUE_WEIGHT_DEFAULT: f64 = ${asRustF64Literal(keepUniqueWeight.default)};`,
  '',
  '// Shared UI/rule ordering tables so TS and Rust sort with one SSOT payload.',
  `pub const PREFERRED_ARTIFACT_TYPE_ORDER: [i64; ${preferredArtifactTypeOrder.length}] = [${preferredArtifactTypeOrder.join(", ")}];`,
  `pub const STAT_VARIANTS_PRIORITY_ROW1: [i64; ${statVariantsPriorityRow1.length}] = [${statVariantsPriorityRow1.join(", ")}];`,
  `pub const STAT_VARIANTS_PRIORITY_ROW2: [i64; ${statVariantsPriorityRow2.length}] = [${statVariantsPriorityRow2.join(", ")}];`,
  `pub const STAT_VARIANTS_PRIORITY: [i64; ${statVariantsPriority.length}] = [${statVariantsPriority.join(", ")}];`,
  `pub const PREFERRED_STAT_ORDER: [i64; ${preferredStatOrder.length}] = [${preferredStatOrder.join(", ")}];`,
  '',
]

// Ensure target directories exist before writing generated outputs.
await fs.mkdir(path.dirname(TS_OUT_PATH), { recursive: true })
await fs.mkdir(path.dirname(RUST_OUT_PATH), { recursive: true })

// Write deterministic trailing newline output for clean diffs.
await fs.writeFile(TS_OUT_PATH, `${tsLines.join('\n')}\n`, 'utf8')
await fs.writeFile(RUST_OUT_PATH, `${rustLines.join('\n')}\n`, 'utf8')

// Keep script output concise so CI logs still show what was generated.
console.log(`Generated ${path.relative(REPO_ROOT, TS_OUT_PATH)}`)
console.log(`Generated ${path.relative(REPO_ROOT, RUST_OUT_PATH)}`)
