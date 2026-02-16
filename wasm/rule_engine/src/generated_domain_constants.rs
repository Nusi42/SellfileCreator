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

