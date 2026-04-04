// AUTO-GENERATED FILE. DO NOT EDIT.
// Source: shared/domain-constants.json
// Generator: scripts/tooling/generate-domain-constants.mjs
#![allow(dead_code)]

// Shared sentinel for accessories that have no set id.
pub const ACCESSORY_NO_SET_ID: i64 = -99;

// Artifact slot identifiers used by UI + rule engine code paths.
pub const ARTIFACT_TYPE_HELMET: i64 = 1;
pub const ARTIFACT_TYPE_CHESTPLATE: i64 = 2;
pub const ARTIFACT_TYPE_GAUNTLETS: i64 = 3;
pub const ARTIFACT_TYPE_BOOTS: i64 = 4;
pub const ARTIFACT_TYPE_WEAPON: i64 = 5;
pub const ARTIFACT_TYPE_SHIELD: i64 = 6;
pub const ARTIFACT_TYPE_RING: i64 = 7;
pub const ARTIFACT_TYPE_AMULET: i64 = 8;
pub const ARTIFACT_TYPE_BANNER: i64 = 9;

// Base HSF stat id identifiers used in type/model conversions.
pub const STAT_ID_ANY: i64 = -1;
pub const STAT_ID_HP: i64 = 1;
pub const STAT_ID_ATK: i64 = 2;
pub const STAT_ID_DEF: i64 = 3;
pub const STAT_ID_SPD: i64 = 4;
pub const STAT_ID_RES: i64 = 5;
pub const STAT_ID_ACC: i64 = 6;
pub const STAT_ID_CR: i64 = 7;
pub const STAT_ID_CDMG: i64 = 8;
pub const STAT_ID_HP_ATK_DEF: i64 = 9;
pub const STAT_ID_ROLL_COUNT: i64 = 99;

// Rarity code domain used by builder/rules generation.
pub const RARITY_CODE_ANY: i64 = 0;
pub const RARITY_CODE_COMMON: i64 = 1;
pub const RARITY_CODE_UNCOMMON: i64 = 2;
pub const RARITY_CODE_RARE: i64 = 3;
pub const RARITY_CODE_EPIC: i64 = 4;
pub const RARITY_CODE_LEGENDARY: i64 = 5;
pub const RARITY_CODE_GTE_COMMON: i64 = 6;
pub const RARITY_CODE_GTE_UNCOMMON: i64 = 7;
pub const RARITY_CODE_GTE_RARE: i64 = 8;
pub const RARITY_CODE_GTE_EPIC: i64 = 9;
pub const RARITY_CODE_LTE_UNCOMMON: i64 = 10;
pub const RARITY_CODE_LTE_RARE: i64 = 11;
pub const RARITY_CODE_LTE_EPIC: i64 = 12;
pub const RARITY_CODE_LTE_LEGENDARY: i64 = 13;
pub const RARITY_CODE_LTE_MYTHICAL: i64 = 14;
pub const RARITY_CODE_MYTHICAL: i64 = 15;
pub const RARITY_CODE_GTE_LEGENDARY: i64 = 16;

// Rank code domain used by builder/rules generation (mirrors types.ts::RankCode).
pub const RANK_CODE_ANY: i64 = 0;
pub const RANK_CODE_ONE: i64 = 1;
pub const RANK_CODE_TWO: i64 = 2;
pub const RANK_CODE_THREE: i64 = 3;
pub const RANK_CODE_FOUR: i64 = 4;
pub const RANK_CODE_FIVE: i64 = 5;
pub const RANK_CODE_SIX: i64 = 6;
pub const RANK_CODE_GTE_ONE: i64 = 7;
pub const RANK_CODE_GTE_TWO: i64 = 8;
pub const RANK_CODE_GTE_THREE: i64 = 9;
pub const RANK_CODE_GTE_FOUR: i64 = 10;
pub const RANK_CODE_GTE_FIVE: i64 = 11;
pub const RANK_CODE_LTE_TWO: i64 = 12;
pub const RANK_CODE_LTE_THREE: i64 = 13;
pub const RANK_CODE_LTE_FOUR: i64 = 14;
pub const RANK_CODE_LTE_FIVE: i64 = 15;
pub const RANK_CODE_LTE_SIX: i64 = 16;

// Rank value bounds shared across TS and Rust safeguard/matcher logic.
pub const RANK_VALUE_MIN: i64 = 1;
pub const RANK_VALUE_MAX: i64 = 6;

// Level constants shared by builder/rule-engine code paths.
pub const LEVEL_ANY_SENTINEL: i64 = 99;
pub const LEVEL_MILESTONE_0: i64 = 0;
pub const LEVEL_MILESTONE_4: i64 = 4;
pub const LEVEL_MILESTONE_8: i64 = 8;
pub const LEVEL_MILESTONE_12: i64 = 12;
pub const LEVEL_MILESTONE_16: i64 = 16;

// Substat slot and roll-count limits shared by builder and safeguard logic.
pub const SUBSTAT_SLOT_COUNT: i64 = 4;
pub const SUBSTAT_MAX_ROLLS_PER_SLOT: i64 = 5;

// StatVariant bit encoding constants and concrete variant values.
pub const STAT_VARIANT_SHIFT_BITS: i64 = 8;
pub const STAT_VARIANT_ID_MASK: i64 = 255;
pub const STAT_VARIANT_FLAT_SUFFIX: i64 = 1;
pub const STAT_VARIANT_ANY: i64 = -1;
pub const STAT_VARIANT_HP_PERCENT: i64 = 256;
pub const STAT_VARIANT_HP_FLAT: i64 = 257;
pub const STAT_VARIANT_ATK_PERCENT: i64 = 512;
pub const STAT_VARIANT_ATK_FLAT: i64 = 513;
pub const STAT_VARIANT_DEF_PERCENT: i64 = 768;
pub const STAT_VARIANT_DEF_FLAT: i64 = 769;
pub const STAT_VARIANT_SPD: i64 = 1025;
pub const STAT_VARIANT_RES: i64 = 1281;
pub const STAT_VARIANT_ACC: i64 = 1537;
pub const STAT_VARIANT_CR: i64 = 1792;
pub const STAT_VARIANT_CDMG: i64 = 2048;
pub const STAT_VARIANT_ROLL_COUNT: i64 = 25345;

// Auto-rarity lookup tables keyed by rarity code (0..16).
pub const AUTO_RARITY_ROLL_MASK_BY_CODE: [i64; 17] = [15, 0, 1, 3, 7, 15, 0, 1, 3, 7, 1, 3, 7, 15, 15, 15, 15];
pub const AUTO_RARITY_ADDITION_MASK_BY_CODE: [i64; 17] = [0, 15, 14, 12, 8, 0, 15, 14, 12, 8, 15, 15, 15, 15, 15, 0, 0];
pub const AUTO_RARITY_INCLUDES_MYTHICAL_BY_CODE: [bool; 17] = [false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, true, false];
pub const AUTO_RARITY_MIN_ROLL_EVENTS_BY_CODE: [i64; 17] = [0, 0, 1, 2, 3, 4, 0, 1, 2, 3, 0, 0, 0, 0, 0, 4, 4];

// Safeguard token + default mode constants used by TS and Rust paths.
pub const SAFEGUARD_ACTIVATION_OFF: &str = "off";
pub const SAFEGUARD_ACTIVATION_PROTECT_EXISTING: &str = "protectExisting";
pub const SAFEGUARD_ACTIVATION_ANTICIPATE_GAPS: &str = "anticipateGaps";
pub const SAFEGUARD_SUBSTAT_ANY: &str = "any";
pub const SAFEGUARD_SUBSTAT_ALL: &str = "all";
pub const SAFEGUARD_SUBSTAT_PER_SUBSTAT: &str = "perSubstat";
pub const SAFEGUARD_DEFAULT_COUNT_MODE_PER_RULE: bool = false;
pub const SAFEGUARD_DEFAULT_COUNT_MODE_PER_SET: bool = true;
pub const SAFEGUARD_DEFAULT_COUNT_MODE_PER_FACTION: bool = true;
pub const SAFEGUARD_DEFAULT_COUNT_MODE_PER_MAIN_STAT: bool = true;
pub const SAFEGUARD_DEFAULT_COUNT_MODE_PER_SLOT: bool = false;
pub const SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS: bool = true;
pub const SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION: bool = false;
pub const SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT: bool = false;
pub const SAFEGUARD_REASON_GLOBAL: &str = "global";
pub const SAFEGUARD_REASON_GROUP: &str = "group";
pub const SAFEGUARD_WEIGHT_STEP: f64 = 0.05;
pub const SAFEGUARD_WEIGHT_MIN: f64 = 0.1;
pub const SAFEGUARD_WEIGHT_MAX: f64 = 3.0;
pub const SAFEGUARD_WEIGHT_DEFAULT: f64 = 1.0;

// Shared UI/rule ordering tables so TS and Rust sort with one SSOT payload.
pub const PREFERRED_ARTIFACT_TYPE_ORDER: [i64; 9] = [5, 1, 6, 3, 2, 4, 7, 8, 9];
pub const STAT_VARIANTS_PRIORITY_ROW1: [i64; 5] = [1025, 1792, 2048, 1537, 1281];
pub const STAT_VARIANTS_PRIORITY_ROW2: [i64; 6] = [257, 256, 513, 512, 769, 768];
pub const STAT_VARIANTS_PRIORITY: [i64; 11] = [1025, 1792, 2048, 1537, 1281, 257, 256, 513, 512, 769, 768];
pub const PREFERRED_STAT_ORDER: [i64; 12] = [1025, 1792, 2048, 1537, 1281, 256, 257, 512, 513, 768, 769, 25345];


// Faction IDs — one constant per faction.
pub const FACTION_ID_BANNER_LORDS: i64 = 1;
pub const FACTION_ID_HIGH_ELVES: i64 = 2;
pub const FACTION_ID_SACRED_ORDER: i64 = 3;
pub const FACTION_ID_OGRYN_TRIBES: i64 = 5;
pub const FACTION_ID_LIZARDMEN: i64 = 6;
pub const FACTION_ID_SKINWALKERS: i64 = 7;
pub const FACTION_ID_ORCS: i64 = 8;
pub const FACTION_ID_DEMONSPAWN: i64 = 9;
pub const FACTION_ID_UNDEAD_HORDES: i64 = 10;
pub const FACTION_ID_DARK_ELVES: i64 = 11;
pub const FACTION_ID_KNIGHT_REVENANT: i64 = 12;
pub const FACTION_ID_BARBARIANS: i64 = 13;
pub const FACTION_ID_SYLVAN_WATCHERS: i64 = 14;
pub const FACTION_ID_SHADOWKIN: i64 = 15;
pub const FACTION_ID_DWARVES: i64 = 16;
pub const FACTION_ID_ARGONITES: i64 = 17;

// Faction names sorted alphabetically for binary-compatible linear scan.
pub const FACTION_NAME_IDS: &[(&str, i64)] = &[("Argonites", 17), ("Banner Lords", 1), ("Barbarians", 13), ("Dark Elves", 11), ("Demonspawn", 9), ("Dwarves", 16), ("High Elves", 2), ("Knight Revenant", 12), ("Lizardmen", 6), ("Ogryn Tribes", 5), ("Orcs", 8), ("Sacred Order", 3), ("Shadowkin", 15), ("Skinwalkers", 7), ("Sylvan Watchers", 14), ("Undead Hordes", 10)];

// Artifact slot display names by numeric ID, sorted by ID ascending.
pub const ARTIFACT_TYPE_DISPLAY_NAMES: &[(i64, &str)] = &[(1, "Helmet"), (2, "Chestplate"), (3, "Gauntlets"), (4, "Boots"), (5, "Weapon"), (6, "Shield"), (7, "Ring"), (8, "Amulet"), (9, "Banner")];

// Stat variant display labels sorted by variant value ascending.
pub const STAT_VARIANT_DISPLAY_LABELS: &[(i64, &str)] = &[(256, "HP%"), (257, "HP"), (512, "ATK%"), (513, "ATK"), (768, "DEF%"), (769, "DEF"), (1025, "SPD"), (1281, "RES"), (1537, "ACC"), (1792, "CR%"), (2048, "CDMG%"), (25345, "Roll Count")];

// Allowed main stat variants per slot (per-slot const + dispatch array).
pub const ALLOWED_MAINS_HELMET: &[i64] = &[257];
pub const ALLOWED_MAINS_CHESTPLATE: &[i64] = &[256, 257, 512, 513, 768, 769, 1537, 1281];
pub const ALLOWED_MAINS_GAUNTLETS: &[i64] = &[256, 257, 512, 513, 768, 769, 1792, 2048];
pub const ALLOWED_MAINS_BOOTS: &[i64] = &[256, 257, 512, 513, 768, 769, 1025];
pub const ALLOWED_MAINS_WEAPON: &[i64] = &[513];
pub const ALLOWED_MAINS_SHIELD: &[i64] = &[769];
pub const ALLOWED_MAINS_RING: &[i64] = &[257, 513, 769];
pub const ALLOWED_MAINS_AMULET: &[i64] = &[257, 513, 769, 2048];
pub const ALLOWED_MAINS_BANNER: &[i64] = &[257, 513, 769, 1537, 1281];
pub const ALLOWED_MAINS_BY_SLOT: &[(i64, &[i64])] = &[(1, ALLOWED_MAINS_HELMET), (2, ALLOWED_MAINS_CHESTPLATE), (3, ALLOWED_MAINS_GAUNTLETS), (4, ALLOWED_MAINS_BOOTS), (5, ALLOWED_MAINS_WEAPON), (6, ALLOWED_MAINS_SHIELD), (7, ALLOWED_MAINS_RING), (8, ALLOWED_MAINS_AMULET), (9, ALLOWED_MAINS_BANNER)];

// Allowed sub stat variants per slot (per-slot const + dispatch array).
pub const ALLOWED_SUBS_HELMET: &[i64] = &[256, 512, 513, 768, 769, 1792, 2048, 1537, 1281, 1025];
pub const ALLOWED_SUBS_CHESTPLATE: &[i64] = &[256, 257, 512, 513, 768, 769, 1792, 2048, 1537, 1281, 1025];
pub const ALLOWED_SUBS_GAUNTLETS: &[i64] = &[256, 257, 512, 513, 768, 769, 1792, 2048, 1537, 1281, 1025];
pub const ALLOWED_SUBS_BOOTS: &[i64] = &[256, 257, 512, 513, 768, 769, 1792, 2048, 1537, 1281, 1025];
pub const ALLOWED_SUBS_WEAPON: &[i64] = &[256, 257, 512, 1792, 2048, 1537, 1281, 1025];
pub const ALLOWED_SUBS_SHIELD: &[i64] = &[256, 257, 768, 1792, 2048, 1537, 1281, 1025];
pub const ALLOWED_SUBS_RING: &[i64] = &[256, 257, 512, 513, 768, 769];
pub const ALLOWED_SUBS_AMULET: &[i64] = &[257, 513, 769, 2048, 1537, 1281];
pub const ALLOWED_SUBS_BANNER: &[i64] = &[256, 257, 512, 513, 768, 769, 1025];
pub const ALLOWED_SUBS_BY_SLOT: &[(i64, &[i64])] = &[(1, ALLOWED_SUBS_HELMET), (2, ALLOWED_SUBS_CHESTPLATE), (3, ALLOWED_SUBS_GAUNTLETS), (4, ALLOWED_SUBS_BOOTS), (5, ALLOWED_SUBS_WEAPON), (6, ALLOWED_SUBS_SHIELD), (7, ALLOWED_SUBS_RING), (8, ALLOWED_SUBS_AMULET), (9, ALLOWED_SUBS_BANNER)];

// Per-roll substat (min, max) range per star tier.
// Community-sourced; 6-star high confidence, lower stars are estimates.
pub const SUBSTAT_ROLL_RANGES_1STAR: &[(i64, i64, i64)] = &[(256, 1, 2), (257, 90, 60), (512, 1, 2), (513, 7, 6), (768, 1, 2), (769, 7, 6), (1025, 1, 2), (1281, 5, 7), (1537, 5, 7), (1792, 1, 2), (2048, 1, 3)];
pub const SUBSTAT_ROLL_RANGES_2STAR: &[(i64, i64, i64)] = &[(256, 1, 2), (257, 100, 110), (512, 1, 2), (513, 8, 11), (768, 1, 2), (769, 8, 11), (1025, 1, 2), (1281, 5, 10), (1537, 5, 10), (1792, 1, 2), (2048, 1, 3)];
pub const SUBSTAT_ROLL_RANGES_3STAR: &[(i64, i64, i64)] = &[(256, 2, 3), (257, 110, 190), (512, 2, 3), (513, 9, 18), (768, 2, 3), (769, 9, 18), (1025, 2, 3), (1281, 6, 14), (1537, 6, 14), (1792, 2, 3), (2048, 2, 4)];
pub const SUBSTAT_ROLL_RANGES_4STAR: &[(i64, i64, i64)] = &[(256, 3, 5), (257, 120, 325), (512, 3, 5), (513, 10, 28), (768, 3, 5), (769, 10, 28), (1025, 3, 5), (1281, 7, 18), (1537, 7, 18), (1792, 3, 4), (2048, 3, 6)];
pub const SUBSTAT_ROLL_RANGES_5STAR: &[(i64, i64, i64)] = &[(256, 4, 6), (257, 136, 450), (512, 4, 6), (513, 12, 23), (768, 4, 6), (769, 12, 23), (1025, 4, 5), (1281, 8, 11), (1537, 8, 11), (1792, 4, 6), (2048, 4, 6)];
pub const SUBSTAT_ROLL_RANGES_6STAR: &[(i64, i64, i64)] = &[(256, 5, 7), (257, 200, 565), (512, 5, 7), (513, 15, 30), (768, 5, 7), (769, 15, 30), (1025, 5, 6), (1281, 9, 12), (1537, 9, 12), (1792, 5, 7), (2048, 5, 7)];
pub const SUBSTAT_ROLL_RANGES_BY_STAR: &[(i64, &[(i64, i64, i64)])] = &[(1, SUBSTAT_ROLL_RANGES_1STAR), (2, SUBSTAT_ROLL_RANGES_2STAR), (3, SUBSTAT_ROLL_RANGES_3STAR), (4, SUBSTAT_ROLL_RANGES_4STAR), (5, SUBSTAT_ROLL_RANGES_5STAR), (6, SUBSTAT_ROLL_RANGES_6STAR)];

// Glyph enchantment (variant, min, max) per gear rank. CR/CDMG are non-glyphable and absent.
pub const GLYPH_RANGES_R1: &[(i64, i64, i64)] = &[(256, 1, 1), (257, 1, 1), (512, 1, 1), (513, 4, 5), (768, 1, 1), (769, 4, 5), (1025, 1, 1), (1281, 1, 2), (1537, 1, 2)];
pub const GLYPH_RANGES_R2: &[(i64, i64, i64)] = &[(256, 1, 2), (257, 1, 1), (512, 1, 2), (513, 1, 1), (768, 1, 2), (769, 1, 1), (1025, 1, 2), (1281, 2, 3), (1537, 2, 3)];
pub const GLYPH_RANGES_R3: &[(i64, i64, i64)] = &[(256, 1, 3), (257, 1, 1), (512, 1, 3), (513, 1, 1), (768, 1, 3), (769, 1, 1), (1025, 1, 3), (1281, 3, 5), (1537, 3, 5)];
pub const GLYPH_RANGES_R4: &[(i64, i64, i64)] = &[(256, 1, 4), (257, 175, 375), (512, 1, 4), (513, 8, 20), (768, 1, 4), (769, 8, 20), (1025, 1, 4), (1281, 4, 7), (1537, 4, 7)];
pub const GLYPH_RANGES_R5: &[(i64, i64, i64)] = &[(256, 1, 5), (257, 225, 475), (512, 1, 5), (513, 15, 25), (768, 1, 5), (769, 15, 25), (1025, 1, 5), (1281, 5, 10), (1537, 5, 10)];
pub const GLYPH_RANGES_R6: &[(i64, i64, i64)] = &[(256, 3, 8), (257, 250, 750), (512, 3, 8), (513, 30, 40), (768, 3, 8), (769, 30, 40), (1025, 3, 8), (1281, 6, 16), (1537, 6, 16)];
pub const GLYPH_RANGES_BY_RANK: &[(i64, &[(i64, i64, i64)])] = &[(1, GLYPH_RANGES_R1), (2, GLYPH_RANGES_R2), (3, GLYPH_RANGES_R3), (4, GLYPH_RANGES_R4), (5, GLYPH_RANGES_R5), (6, GLYPH_RANGES_R6)];
