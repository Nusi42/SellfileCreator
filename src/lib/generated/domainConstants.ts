// AUTO-GENERATED FILE. DO NOT EDIT.
// Source: shared/domain-constants.json
// Generator: scripts/tooling/generate-domain-constants.mjs

// Shared sentinel for accessories that have no set id.
export const ACCESSORY_NO_SET_ID = -99

// Artifact slot identifiers used by UI + rule engine code paths.
export const ARTIFACT_TYPE_HELMET = 1
export const ARTIFACT_TYPE_CHESTPLATE = 2
export const ARTIFACT_TYPE_GAUNTLETS = 3
export const ARTIFACT_TYPE_BOOTS = 4
export const ARTIFACT_TYPE_WEAPON = 5
export const ARTIFACT_TYPE_SHIELD = 6
export const ARTIFACT_TYPE_RING = 7
export const ARTIFACT_TYPE_AMULET = 8
export const ARTIFACT_TYPE_BANNER = 9

// Base HSF stat id identifiers used in type/model conversions.
export const STAT_ID_ANY = -1
export const STAT_ID_HP = 1
export const STAT_ID_ATK = 2
export const STAT_ID_DEF = 3
export const STAT_ID_SPD = 4
export const STAT_ID_RES = 5
export const STAT_ID_ACC = 6
export const STAT_ID_CR = 7
export const STAT_ID_CDMG = 8
export const STAT_ID_HP_ATK_DEF = 9
export const STAT_ID_ROLL_COUNT = 99

// Rarity code domain used by builder/rules generation.
export const RARITY_CODE_ANY = 0
export const RARITY_CODE_COMMON = 1
export const RARITY_CODE_UNCOMMON = 2
export const RARITY_CODE_RARE = 3
export const RARITY_CODE_EPIC = 4
export const RARITY_CODE_LEGENDARY = 5
export const RARITY_CODE_GTE_COMMON = 6
export const RARITY_CODE_GTE_UNCOMMON = 7
export const RARITY_CODE_GTE_RARE = 8
export const RARITY_CODE_GTE_EPIC = 9
export const RARITY_CODE_LTE_UNCOMMON = 10
export const RARITY_CODE_LTE_RARE = 11
export const RARITY_CODE_LTE_EPIC = 12
export const RARITY_CODE_LTE_LEGENDARY = 13
export const RARITY_CODE_LTE_MYTHICAL = 14
export const RARITY_CODE_MYTHICAL = 15
export const RARITY_CODE_GTE_LEGENDARY = 16

// Rank value bounds shared across TS and Rust keep-unique/matcher logic.
export const RANK_VALUE_MIN = 1
export const RANK_VALUE_MAX = 6

// Level constants shared by builder/rule-engine code paths.
export const LEVEL_ANY_SENTINEL = 99
export const LEVEL_MILESTONE_0 = 0
export const LEVEL_MILESTONE_4 = 4
export const LEVEL_MILESTONE_8 = 8
export const LEVEL_MILESTONE_12 = 12
export const LEVEL_MILESTONE_16 = 16

// StatVariant bit encoding constants and concrete variant values.
export const STAT_VARIANT_SHIFT_BITS = 8
export const STAT_VARIANT_ID_MASK = 255
export const STAT_VARIANT_FLAT_SUFFIX = 1
export const STAT_VARIANT_ANY = -1
export const STAT_VARIANT_HP_PERCENT = 256
export const STAT_VARIANT_HP_FLAT = 257
export const STAT_VARIANT_ATK_PERCENT = 512
export const STAT_VARIANT_ATK_FLAT = 513
export const STAT_VARIANT_DEF_PERCENT = 768
export const STAT_VARIANT_DEF_FLAT = 769
export const STAT_VARIANT_SPD = 1025
export const STAT_VARIANT_RES = 1281
export const STAT_VARIANT_ACC = 1537
export const STAT_VARIANT_CR = 1792
export const STAT_VARIANT_CDMG = 2048
export const STAT_VARIANT_ROLL_COUNT = 25345

// Auto-rarity lookup tables keyed by rarity code (0..16).
export const AUTO_RARITY_ROLL_MASK_BY_CODE = [15, 0, 1, 3, 7, 15, 0, 1, 3, 7, 1, 3, 7, 15, 15, 15, 15] as const
export const AUTO_RARITY_ADDITION_MASK_BY_CODE = [0, 15, 14, 12, 8, 0, 15, 14, 12, 8, 15, 15, 15, 15, 15, 0, 0] as const
export const AUTO_RARITY_INCLUDES_MYTHICAL_BY_CODE = [false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, true, false] as const
export const AUTO_RARITY_MIN_ROLL_EVENTS_BY_CODE = [0, 0, 1, 2, 3, 4, 0, 1, 2, 3, 0, 0, 0, 0, 0, 4, 4] as const

// Keep-unique token + default mode constants used by TS and Rust paths.
export const KEEP_UNIQUE_ACTIVATION_OFF = "off"
export const KEEP_UNIQUE_ACTIVATION_PROTECT_EXISTING = "protectExisting"
export const KEEP_UNIQUE_ACTIVATION_ANTICIPATE_GAPS = "anticipateGaps"
export const KEEP_UNIQUE_SUBSTAT_ANY = "any"
export const KEEP_UNIQUE_SUBSTAT_ALL = "all"
export const KEEP_UNIQUE_SUBSTAT_PER_SUBSTAT = "perSubstat"
export const KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_RULE = false
export const KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_SET = true
export const KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_FACTION = true
export const KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_MAIN_STAT = true
export const KEEP_UNIQUE_DEFAULT_COUNT_MODE_PER_SLOT = false
export const KEEP_UNIQUE_REASON_GLOBAL = "global"
export const KEEP_UNIQUE_REASON_GROUP = "group"
export const KEEP_UNIQUE_WEIGHT_STEP = 0.05
export const KEEP_UNIQUE_WEIGHT_MIN = 0.1
export const KEEP_UNIQUE_WEIGHT_MAX = 3
export const KEEP_UNIQUE_WEIGHT_DEFAULT = 1

// Shared UI/rule ordering tables so TS and Rust sort with one SSOT payload.
export const PREFERRED_ARTIFACT_TYPE_ORDER = [5, 1, 6, 3, 2, 4, 7, 8, 9] as const
export const STAT_VARIANTS_PRIORITY_ROW1 = [1025, 1792, 2048, 1537, 1281] as const
export const STAT_VARIANTS_PRIORITY_ROW2 = [257, 256, 513, 512, 769, 768] as const
export const STAT_VARIANTS_PRIORITY = [1025, 1792, 2048, 1537, 1281, 257, 256, 513, 512, 769, 768] as const
export const PREFERRED_STAT_ORDER = [1025, 1792, 2048, 1537, 1281, 256, 257, 512, 513, 768, 769, 25345] as const

