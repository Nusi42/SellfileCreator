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

// Rank code domain used by builder/rules generation (mirrors types.ts::RankCode).
export const RANK_CODE_ANY = 0
export const RANK_CODE_ONE = 1
export const RANK_CODE_TWO = 2
export const RANK_CODE_THREE = 3
export const RANK_CODE_FOUR = 4
export const RANK_CODE_FIVE = 5
export const RANK_CODE_SIX = 6
export const RANK_CODE_GTE_ONE = 7
export const RANK_CODE_GTE_TWO = 8
export const RANK_CODE_GTE_THREE = 9
export const RANK_CODE_GTE_FOUR = 10
export const RANK_CODE_GTE_FIVE = 11
export const RANK_CODE_LTE_TWO = 12
export const RANK_CODE_LTE_THREE = 13
export const RANK_CODE_LTE_FOUR = 14
export const RANK_CODE_LTE_FIVE = 15
export const RANK_CODE_LTE_SIX = 16

// Rank value bounds shared across TS and Rust safeguard/matcher logic.
export const RANK_VALUE_MIN = 1
export const RANK_VALUE_MAX = 6

// Level constants shared by builder/rule-engine code paths.
export const LEVEL_ANY_SENTINEL = 99
export const LEVEL_MILESTONE_0 = 0
export const LEVEL_MILESTONE_4 = 4
export const LEVEL_MILESTONE_8 = 8
export const LEVEL_MILESTONE_12 = 12
export const LEVEL_MILESTONE_16 = 16

// Substat slot and roll-count limits shared by builder and safeguard logic.
export const SUBSTAT_SLOT_COUNT = 4
export const SUBSTAT_MAX_ROLLS_PER_SLOT = 5

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
export const SAFEGUARD_ACTIVATION_OFF = "off"
export const SAFEGUARD_ACTIVATION_PROTECT_EXISTING = "protectExisting"
export const SAFEGUARD_ACTIVATION_ANTICIPATE_GAPS = "anticipateGaps"
export const SAFEGUARD_SUBSTAT_ANY = "any"
export const SAFEGUARD_SUBSTAT_ALL = "all"
export const SAFEGUARD_SUBSTAT_PER_SUBSTAT = "perSubstat"
export const SAFEGUARD_DEFAULT_COUNT_MODE_PER_RULE = false
export const SAFEGUARD_DEFAULT_COUNT_MODE_PER_SET = true
export const SAFEGUARD_DEFAULT_COUNT_MODE_PER_FACTION = true
export const SAFEGUARD_DEFAULT_COUNT_MODE_PER_MAIN_STAT = true
export const SAFEGUARD_DEFAULT_COUNT_MODE_PER_SLOT = false
export const SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS = true
export const SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION = false
export const SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT = false
export const SAFEGUARD_REASON_GLOBAL = "global"
export const SAFEGUARD_REASON_GROUP = "group"
export const SAFEGUARD_WEIGHT_STEP = 0.05
export const SAFEGUARD_WEIGHT_MIN = 0.1
export const SAFEGUARD_WEIGHT_MAX = 3
export const SAFEGUARD_WEIGHT_DEFAULT = 1

// Shared UI/rule ordering tables so TS and Rust sort with one SSOT payload.
export const PREFERRED_ARTIFACT_TYPE_ORDER = [5, 1, 6, 3, 2, 4, 7, 8, 9] as const
export const STAT_VARIANTS_PRIORITY_ROW1 = [1025, 1792, 2048, 1537, 1281] as const
export const STAT_VARIANTS_PRIORITY_ROW2 = [257, 256, 513, 512, 769, 768] as const
export const STAT_VARIANTS_PRIORITY = [1025, 1792, 2048, 1537, 1281, 257, 256, 513, 512, 769, 768] as const
export const PREFERRED_STAT_ORDER = [1025, 1792, 2048, 1537, 1281, 256, 257, 512, 513, 768, 769, 25345] as const


// Faction IDs — one constant per faction (mirrors Faction enum in types.ts).
export const FACTION_ID_BANNER_LORDS = 1
export const FACTION_ID_HIGH_ELVES = 2
export const FACTION_ID_SACRED_ORDER = 3
export const FACTION_ID_OGRYN_TRIBES = 5
export const FACTION_ID_LIZARDMEN = 6
export const FACTION_ID_SKINWALKERS = 7
export const FACTION_ID_ORCS = 8
export const FACTION_ID_DEMONSPAWN = 9
export const FACTION_ID_UNDEAD_HORDES = 10
export const FACTION_ID_DARK_ELVES = 11
export const FACTION_ID_KNIGHT_REVENANT = 12
export const FACTION_ID_BARBARIANS = 13
export const FACTION_ID_SYLVAN_WATCHERS = 14
export const FACTION_ID_SHADOWKIN = 15
export const FACTION_ID_DWARVES = 16
export const FACTION_ID_ARGONITES = 17

// Map of faction ID → display name (0 = Any/none).
export const FACTION_NAMES: Record<number, string> = { 0: '', 1: "Banner Lords", 2: "High Elves", 3: "Sacred Order", 5: "Ogryn Tribes", 6: "Lizardmen", 7: "Skinwalkers", 8: "Orcs", 9: "Demonspawn", 10: "Undead Hordes", 11: "Dark Elves", 12: "Knight Revenant", 13: "Barbarians", 14: "Sylvan Watchers", 15: "Shadowkin", 16: "Dwarves", 17: "Argonites" }

// Map of faction display name → faction ID.
export const FACTION_NAMES_TO_ID: Record<string, number> = { "Banner Lords": 1, "High Elves": 2, "Sacred Order": 3, "Ogryn Tribes": 5, "Lizardmen": 6, "Skinwalkers": 7, "Orcs": 8, "Demonspawn": 9, "Undead Hordes": 10, "Dark Elves": 11, "Knight Revenant": 12, "Barbarians": 13, "Sylvan Watchers": 14, "Shadowkin": 15, "Dwarves": 16, "Argonites": 17 }

// Artifact slot display names by numeric ID (mirrors artifactTypeNames in types.ts).
export const ARTIFACT_TYPE_DISPLAY_NAMES: Record<number, string> = { 1: "Helmet", 2: "Chestplate", 3: "Gauntlets", 4: "Boots", 5: "Weapon", 6: "Shield", 7: "Ring", 8: "Amulet", 9: "Banner" }

// Stat variant numeric value → canonical display label.
export const STAT_VARIANT_DISPLAY_LABELS: Record<number, string> = { 256: "HP%", 257: "HP", 512: "ATK%", 513: "ATK", 768: "DEF%", 769: "DEF", 1025: "SPD", 1281: "RES", 1537: "ACC", 1792: "CR%", 2048: "CDMG%", 25345: "Roll Count" }

// Allowed main stat variants by artifact slot ID.
export const ALLOWED_MAINS_BY_SLOT: Record<number, readonly number[]> = { [1]: [257], [2]: [256, 257, 512, 513, 768, 769, 1537, 1281], [3]: [256, 257, 512, 513, 768, 769, 1792, 2048], [4]: [256, 257, 512, 513, 768, 769, 1025], [5]: [513], [6]: [769], [7]: [257, 513, 769], [8]: [257, 513, 769, 2048], [9]: [257, 513, 769, 1537, 1281] }

// Allowed sub stat variants by artifact slot ID.
export const ALLOWED_SUBS_BY_SLOT: Record<number, readonly number[]> = { [1]: [256, 512, 513, 768, 769, 1792, 2048, 1537, 1281, 1025], [2]: [256, 257, 512, 513, 768, 769, 1792, 2048, 1537, 1281, 1025], [3]: [256, 257, 512, 513, 768, 769, 1792, 2048, 1537, 1281, 1025], [4]: [256, 257, 512, 513, 768, 769, 1792, 2048, 1537, 1281, 1025], [5]: [256, 257, 512, 1792, 2048, 1537, 1281, 1025], [6]: [256, 257, 768, 1792, 2048, 1537, 1281, 1025], [7]: [256, 257, 512, 513, 768, 769], [8]: [257, 513, 769, 2048, 1537, 1281], [9]: [256, 257, 512, 513, 768, 769, 1025] }

// Per-roll substat { min, max } range keyed by star (1..6) then stat variant.
// Community-sourced; 6-star high confidence, lower stars are estimates.
// min is also the factory-default substat minimum for that star tier.
export const SUBSTAT_ROLL_RANGES_BY_STAR: Record<number, Record<number, { readonly min: number; readonly max: number }>> = { 1: { 256: { min: 1, max: 2 }, 257: { min: 90, max: 60 }, 512: { min: 1, max: 2 }, 513: { min: 7, max: 6 }, 768: { min: 1, max: 2 }, 769: { min: 7, max: 6 }, 1025: { min: 1, max: 2 }, 1281: { min: 5, max: 7 }, 1537: { min: 5, max: 7 }, 1792: { min: 1, max: 2 }, 2048: { min: 1, max: 3 } }, 2: { 256: { min: 1, max: 2 }, 257: { min: 100, max: 110 }, 512: { min: 1, max: 2 }, 513: { min: 8, max: 11 }, 768: { min: 1, max: 2 }, 769: { min: 8, max: 11 }, 1025: { min: 1, max: 2 }, 1281: { min: 5, max: 10 }, 1537: { min: 5, max: 10 }, 1792: { min: 1, max: 2 }, 2048: { min: 1, max: 3 } }, 3: { 256: { min: 2, max: 3 }, 257: { min: 110, max: 190 }, 512: { min: 2, max: 3 }, 513: { min: 9, max: 18 }, 768: { min: 2, max: 3 }, 769: { min: 9, max: 18 }, 1025: { min: 2, max: 3 }, 1281: { min: 6, max: 14 }, 1537: { min: 6, max: 14 }, 1792: { min: 2, max: 3 }, 2048: { min: 2, max: 4 } }, 4: { 256: { min: 3, max: 5 }, 257: { min: 120, max: 325 }, 512: { min: 3, max: 5 }, 513: { min: 10, max: 28 }, 768: { min: 3, max: 5 }, 769: { min: 10, max: 28 }, 1025: { min: 3, max: 5 }, 1281: { min: 7, max: 18 }, 1537: { min: 7, max: 18 }, 1792: { min: 3, max: 4 }, 2048: { min: 3, max: 6 } }, 5: { 256: { min: 4, max: 6 }, 257: { min: 136, max: 450 }, 512: { min: 4, max: 6 }, 513: { min: 12, max: 23 }, 768: { min: 4, max: 6 }, 769: { min: 12, max: 23 }, 1025: { min: 4, max: 5 }, 1281: { min: 8, max: 11 }, 1537: { min: 8, max: 11 }, 1792: { min: 4, max: 6 }, 2048: { min: 4, max: 6 } }, 6: { 256: { min: 5, max: 7 }, 257: { min: 200, max: 565 }, 512: { min: 5, max: 7 }, 513: { min: 15, max: 30 }, 768: { min: 5, max: 7 }, 769: { min: 15, max: 30 }, 1025: { min: 5, max: 6 }, 1281: { min: 9, max: 12 }, 1537: { min: 9, max: 12 }, 1792: { min: 5, max: 7 }, 2048: { min: 5, max: 7 } } }

// Glyph enchantment { min, max } by gear rank then stat variant. CR/CDMG are non-glyphable and absent.
export const GLYPH_RANGES_BY_RANK: Record<number, Record<number, { readonly min: number; readonly max: number }>> = { 1: { 256: { min: 1, max: 1 }, 257: { min: 1, max: 1 }, 512: { min: 1, max: 1 }, 513: { min: 4, max: 5 }, 768: { min: 1, max: 1 }, 769: { min: 4, max: 5 }, 1025: { min: 1, max: 1 }, 1281: { min: 1, max: 2 }, 1537: { min: 1, max: 2 } }, 2: { 256: { min: 1, max: 2 }, 257: { min: 1, max: 1 }, 512: { min: 1, max: 2 }, 513: { min: 1, max: 1 }, 768: { min: 1, max: 2 }, 769: { min: 1, max: 1 }, 1025: { min: 1, max: 2 }, 1281: { min: 2, max: 3 }, 1537: { min: 2, max: 3 } }, 3: { 256: { min: 1, max: 3 }, 257: { min: 1, max: 1 }, 512: { min: 1, max: 3 }, 513: { min: 1, max: 1 }, 768: { min: 1, max: 3 }, 769: { min: 1, max: 1 }, 1025: { min: 1, max: 3 }, 1281: { min: 3, max: 5 }, 1537: { min: 3, max: 5 } }, 4: { 256: { min: 1, max: 4 }, 257: { min: 175, max: 375 }, 512: { min: 1, max: 4 }, 513: { min: 8, max: 20 }, 768: { min: 1, max: 4 }, 769: { min: 8, max: 20 }, 1025: { min: 1, max: 4 }, 1281: { min: 4, max: 7 }, 1537: { min: 4, max: 7 } }, 5: { 256: { min: 1, max: 5 }, 257: { min: 225, max: 475 }, 512: { min: 1, max: 5 }, 513: { min: 15, max: 25 }, 768: { min: 1, max: 5 }, 769: { min: 15, max: 25 }, 1025: { min: 1, max: 5 }, 1281: { min: 5, max: 10 }, 1537: { min: 5, max: 10 } }, 6: { 256: { min: 3, max: 8 }, 257: { min: 250, max: 750 }, 512: { min: 3, max: 8 }, 513: { min: 30, max: 40 }, 768: { min: 3, max: 8 }, 769: { min: 30, max: 40 }, 1025: { min: 3, max: 8 }, 1281: { min: 6, max: 16 }, 1537: { min: 6, max: 16 } } }
