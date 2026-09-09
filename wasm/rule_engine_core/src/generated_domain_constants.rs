// AUTO-GENERATED FILE. DO NOT EDIT.
// Source: shared/domain-constants.json
// Generator: scripts/tooling/generate-domain-constants.mjs
#![allow(dead_code)]
#![allow(clippy::type_complexity)]

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

// HSF rule Ore gating: -1 ignores rework state, 0 requires never-reworked gear, 1 requires reworked gear.
pub const ORE_ANY: i64 = -1;
pub const ORE_NOT_ORED: i64 = 0;
pub const ORE_ORED: i64 = 1;

// SFC recipe keys for the behaviour-carrying recipe flags; written only when set.
pub const SFC_RECIPE_FIELD_IGNORED_BY_SAFEGUARDS: &str = "IgnoredBySafeguards";
pub const SFC_RECIPE_FIELD_REWORK_GATE: &str = "ReworkGate";
// ReworkGate values; the key is absent when a recipe does not care about rework state.
pub const REWORK_GATE_REWORKED: &str = "reworked";
pub const REWORK_GATE_NOT_REWORKED: &str = "notReworked";

// Legacy recipe tags, read-only: transcoded into the flags on load, never written again.
// Delete these together with the transcode once files that old no longer need to load.
// Last release that WROTE behaviour tags: the ceiling of the transcode window. A file at
// or below it converts; above it a legacy-looking tag is a deliberate user label.
pub const LEGACY_RECIPE_TAG_LAST_WRITING_VERSION: &str = "1.0.41";
pub const LEGACY_TAGS_IGNORED_BY_SAFEGUARDS: &[&str] = &["ignore_by_safeguards", "ignore_keep_unique", "ignore_safeguard"];
pub const LEGACY_TAGS_REWORKED: &[&str] = &["if_reworked", "only_for_chaos_ored"];
pub const LEGACY_TAGS_NOT_REWORKED: &[&str] = &["if_not_reworked", "ignore_for_chaos_ored"];

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
pub const SAFEGUARD_ACTIVATION_ANTICIPATE_IMPROVEMENTS: &str = "anticipateImprovements";
pub const SAFEGUARD_SUBSTAT_ANY: &str = "any";
pub const SAFEGUARD_SUBSTAT_ALL: &str = "all";
pub const SAFEGUARD_SUBSTAT_PER_SUBSTAT: &str = "perSubstat";
pub const SAFEGUARD_DEFAULT_COUNT_MODE_PER_RULE: bool = false;
pub const SAFEGUARD_DEFAULT_COUNT_MODE_PER_SET: bool = true;
pub const SAFEGUARD_DEFAULT_COUNT_MODE_PER_FACTION: bool = true;
pub const SAFEGUARD_DEFAULT_COUNT_MODE_PER_MAIN_STAT: bool = true;
pub const SAFEGUARD_DEFAULT_COUNT_MODE_PER_SLOT: bool = false;
pub const SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS: bool = false;
pub const SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION: bool = false;
pub const SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT: bool = false;
pub const SAFEGUARD_REASON_GLOBAL: &str = "global";
pub const SAFEGUARD_REASON_BUCKET: &str = "bucket";
pub const SAFEGUARD_WEIGHT_STEP: f64 = 0.05;
pub const SAFEGUARD_WEIGHT_MIN: f64 = 0.01;
pub const SAFEGUARD_WEIGHT_MAX: f64 = 9.9;
pub const SAFEGUARD_WEIGHT_DEFAULT: f64 = 1.0;
// Internal scorer tie-break weights for present-but-unselected substats (see domain-constants.json).
pub const SAFEGUARD_SCORE_NON_FLAT_EPSILON_WEIGHT: f64 = 0.0001;
pub const SAFEGUARD_SCORE_SELECTED_ALIGNED_FLAT_EPSILON_WEIGHT: f64 = 0.000001;
pub const SAFEGUARD_SCORE_MAIN_ALIGNED_FLAT_EPSILON_WEIGHT: f64 = 0.000001;

// Shared UI/rule ordering tables so TS and Rust sort with one SSOT payload.
pub const PREFERRED_ARTIFACT_TYPE_ORDER: [i64; 9] = [5, 1, 6, 3, 2, 4, 7, 8, 9];
pub const STAT_VARIANTS_PRIORITY_ROW1: [i64; 5] = [1025, 1792, 2048, 1537, 1281];
pub const STAT_VARIANTS_PRIORITY_ROW2: [i64; 6] = [257, 256, 513, 512, 769, 768];
pub const STAT_VARIANTS_PRIORITY: [i64; 11] = [1025, 1792, 2048, 1537, 1281, 257, 256, 513, 512, 769, 768];
pub const PREFERRED_STAT_ORDER: [i64; 12] = [1025, 1792, 2048, 1537, 1281, 256, 257, 512, 513, 768, 769, 25345];


// Anomalous Accessories.
// (variant, stat id) pairs — the REAL RSL Helper ids (11..14 dealt, 15..18
// taken), all confirmed against docs/orig/anomalous.hsf.
pub const ANOMALOUS_SUBSTAT_VARIANT_ID_PAIRS: &[(i64, i64)] = &[(2816, 11), (3072, 12), (3328, 13), (3584, 14), (3840, 15), (4096, 16), (4352, 17), (4608, 18)];
// (variant, canonical display label) pairs for SFC label parsing.
pub const ANOMALOUS_SUBSTAT_LABELS: &[(i64, &str)] = &[(2816, "PvE DMG +"), (3072, "PvP DMG +"), (3328, "Boss DMG +"), (3584, "DNG DMG +"), (3840, "PvE DMG -"), (4096, "PvP DMG -"), (4352, "Boss DMG -"), (4608, "DNG DMG -")];
// True when a variant encodes one of the anomalous mode-damage substats.
pub fn is_anomalous_substat_variant(variant: i64) -> bool {
    // Linear scan — the table has eight entries.
    ANOMALOUS_SUBSTAT_VARIANT_ID_PAIRS.iter().any(|&(v, _)| v == variant)
}
// HSF wire unit for the anomalous substats: displayed percent x this = the
// integer stored in a rule substat Value (0.25% -> 25). Mirrors the TS constant.
pub const ANOMALOUS_HSF_VALUE_SCALE: f64 = 100.0;
// Display -> wire scale for ANY substat variant. Classic stats store their
// plain value (docs/orig/rules.hsf: 5 = 5%), so their scale is 1.
// Smallest supported target value for these stats (zero is not a target).
// Stat id -> anomalous variant; None for every other id. Lets sub_to_variant
// decode these ids instead of collapsing them onto the Any fallback.
pub fn anomalous_variant_for_stat_id(id: i64) -> Option<i64> {
    ANOMALOUS_SUBSTAT_VARIANT_ID_PAIRS.iter().find(|&&(_, i)| i == id).map(|&(v, _)| v)
}
// Smallest supported target value for these stats (zero is not a target).
pub const ANOMALOUS_MIN_TARGET_VALUE: f64 = 0.25;
pub fn hsf_value_scale_for_variant(variant: i64) -> f64 {
    if is_anomalous_substat_variant(variant) { ANOMALOUS_HSF_VALUE_SCALE } else { 1.0 }
}
// The inverse: an HSF wire value back to the display number (125 -> 1.25).
// Emitted rules carry wire units while item sub_values carry display units, so
// every comparison between the two must pass through here. Classic stats scale
// by 1. Mirrors hsfValueToDisplay in src/lib/anomalousAccessories.ts.
pub fn wire_value_to_display(variant: i64, wire_value: f64) -> f64 {
    let scale = hsf_value_scale_for_variant(variant);
    if scale == 1.0 { return wire_value; }
    // Round at the wire resolution so the division cannot reintroduce float noise.
    wire_value.round() / scale
}
// Anomalous variants in announcement order (mirrors the TS list).
pub const ANOMALOUS_SUBSTAT_VARIANTS: &[i64] = &[2816, 3072, 3328, 3584, 3840, 4096, 4352, 4608];
// Accessory slots that can carry anomalous substats (Banner observed in the DB).
pub const ANOMALOUS_ELIGIBLE_SLOT_IDS: &[i64] = &[7, 8, 9];
// Per-rank per-line percent as (rank, value), ascending (mirrors the TS record).
// 5★=1.25 and 6★=1.5 observed; the step is uniform and fixed (no roll variance).
pub const ANOMALOUS_SUBSTAT_ROLL_VALUE_BY_RANK: &[(i64, f64)] = &[(1, 0.25), (2, 0.5), (3, 0.75), (4, 1.0), (5, 1.25), (6, 1.5)];
// Top-rank single-line value — the anomalous normalization denominator.
pub const ANOMALOUS_SUBSTAT_ROLL_VALUE_MAX: f64 = 1.5;

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

// Accessory `requiredFraction`/`accset` code → faction ID (0 = Any/none).
pub const ACCESSORY_FACTION_BY_CODE: &[(i64, i64)] = &[(0, 0), (1, 1), (2, 2), (3, 3), (4, 13), (5, 5), (6, 6), (7, 7), (8, 8), (9, 9), (10, 10), (11, 11), (12, 12), (13, 13), (14, 14), (15, 15), (16, 16), (17, 17)];

// Resolve an accessory faction code to its faction id (0 = Any/none for unknown codes).
pub fn resolve_accessory_faction(code: i64) -> i64 {
    // Linear scan over the sorted code→faction pairs; unknown codes fall back to 0.
    ACCESSORY_FACTION_BY_CODE.iter().find(|(c, _)| *c == code).map(|(_, id)| *id).unwrap_or(0)
}

// Artifact/accessory set names sorted alphabetically for a linear-scan resolver.
pub const SET_NAME_IDS: &[(&str, i64)] = &[("Accuracy", 7), ("Affinitybreaker", 39), ("Avenging", 25), ("Bloodshield", 1002), ("Bloodthirst", 43), ("Bolster", 51), ("Chronophage", 65), ("Cleansing", 1001), ("Crit Damage", 6), ("Critical Rate", 5), ("Cruel", 29), ("Curing", 28), ("Cursed", 12), ("Daze", 11), ("Defense", 3), ("Defiant", 52), ("Deflection", 36), ("Destroy", 20), ("Divine Critical Rate", 32), ("Divine Life", 33), ("Divine Offense", 31), ("Divine Speed", 34), ("Fatal", 41), ("Feral", 61), ("Fortitude", 45), ("Frenzy", 14), ("Frost", 13), ("Frostbite", 42), ("Fury", 10), ("Guardian", 44), ("Immortal", 30), ("Immunity", 16), ("Impulse", 53), ("Instinct", 50), ("Killstroke", 49), ("Lethal", 46), ("Life", 1), ("Lifesteal", 9), ("Merciless", 59), ("Mercurial", 66), ("Offense", 2), ("Perception", 38), ("Pinpoint", 62), ("Protection", 47), ("Provoke", 23), ("Reaction", 1003), ("Rebirth", 64), ("Reflex", 27), ("Refresh", 1000), ("Regeneration", 15), ("Relentless", 18), ("Resilience", 37), ("Resistance", 8), ("Retaliation", 24), ("Revenge", 1004), ("Righteous", 57), ("Savage", 19), ("Shield", 17), ("Slayer", 60), ("Speed", 4), ("Stalwart", 26), ("Stonecleaver", 63), ("Stoneskin", 48), ("Stun", 21), ("Supersonic", 58), ("Swift Parry", 35), ("Toxic", 22), ("Untouchable", 40), ("Zeal", 54)];

// Resolve an artifact/accessory set display name to its set id (None for unknown names).
pub fn set_id_from_name(raw: &str) -> Option<i64> {
    // Trim + case-insensitive match, mirroring faction_code_from_label in sfc_reader.
    let s = raw.trim();
    if s.is_empty() { return None; }
    SET_NAME_IDS.iter().find(|(name, _)| name.eq_ignore_ascii_case(s)).map(|(_, id)| *id)
}

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
pub const SUBSTAT_ROLL_RANGES_1STAR: &[(i64, i64, i64)] = &[(256, 1, 2), (257, 43, 90), (512, 1, 2), (513, 4, 6), (768, 1, 2), (769, 4, 6), (1025, 1, 1), (1281, 3, 5), (1537, 3, 5), (1792, 1, 2), (2048, 1, 2)];
pub const SUBSTAT_ROLL_RANGES_2STAR: &[(i64, i64, i64)] = &[(256, 1, 2), (257, 50, 160), (512, 1, 2), (513, 4, 8), (768, 1, 2), (769, 4, 8), (1025, 1, 2), (1281, 4, 6), (1537, 4, 6), (1792, 2, 3), (2048, 2, 3)];
pub const SUBSTAT_ROLL_RANGES_3STAR: &[(i64, i64, i64)] = &[(256, 2, 4), (257, 79, 250), (512, 2, 4), (513, 5, 12), (768, 2, 4), (769, 5, 12), (1025, 2, 3), (1281, 5, 8), (1537, 5, 8), (1792, 2, 4), (2048, 2, 4)];
pub const SUBSTAT_ROLL_RANGES_4STAR: &[(i64, i64, i64)] = &[(256, 3, 5), (257, 97, 340), (512, 3, 5), (513, 7, 15), (768, 3, 5), (769, 7, 15), (1025, 3, 4), (1281, 6, 9), (1537, 6, 9), (1792, 3, 5), (2048, 3, 5)];
pub const SUBSTAT_ROLL_RANGES_5STAR: &[(i64, i64, i64)] = &[(256, 4, 6), (257, 135, 450), (512, 4, 6), (513, 12, 23), (768, 4, 6), (769, 12, 23), (1025, 4, 5), (1281, 8, 11), (1537, 8, 11), (1792, 4, 6), (2048, 4, 6)];
pub const SUBSTAT_ROLL_RANGES_6STAR: &[(i64, i64, i64)] = &[(256, 5, 7), (257, 200, 565), (512, 5, 7), (513, 15, 30), (768, 5, 7), (769, 15, 30), (1025, 5, 6), (1281, 9, 12), (1537, 9, 12), (1792, 5, 7), (2048, 5, 7)];
pub const SUBSTAT_ROLL_RANGES_BY_STAR: &[(i64, &[(i64, i64, i64)])] = &[(1, SUBSTAT_ROLL_RANGES_1STAR), (2, SUBSTAT_ROLL_RANGES_2STAR), (3, SUBSTAT_ROLL_RANGES_3STAR), (4, SUBSTAT_ROLL_RANGES_4STAR), (5, SUBSTAT_ROLL_RANGES_5STAR), (6, SUBSTAT_ROLL_RANGES_6STAR)];

// Glyph enchantment (variant, min, max) per gear rank. CR/CDMG are non-glyphable and absent.
pub const GLYPH_RANGES_R1: &[(i64, i64, i64)] = &[(256, 1, 1), (257, 75, 100), (512, 1, 1), (513, 4, 5), (768, 1, 1), (769, 4, 5), (1025, 1, 1), (1281, 1, 2), (1537, 1, 2)];
pub const GLYPH_RANGES_R2: &[(i64, i64, i64)] = &[(256, 1, 2), (257, 125, 175), (512, 1, 2), (513, 4, 10), (768, 1, 2), (769, 4, 10), (1025, 1, 2), (1281, 2, 3), (1537, 2, 3)];
pub const GLYPH_RANGES_R3: &[(i64, i64, i64)] = &[(256, 1, 3), (257, 125, 275), (512, 1, 3), (513, 6, 15), (768, 1, 3), (769, 6, 15), (1025, 1, 3), (1281, 3, 5), (1537, 3, 5)];
pub const GLYPH_RANGES_R4: &[(i64, i64, i64)] = &[(256, 1, 4), (257, 175, 375), (512, 1, 4), (513, 8, 20), (768, 1, 4), (769, 8, 20), (1025, 1, 4), (1281, 4, 7), (1537, 4, 7)];
pub const GLYPH_RANGES_R5: &[(i64, i64, i64)] = &[(256, 1, 5), (257, 225, 475), (512, 1, 5), (513, 15, 25), (768, 1, 5), (769, 15, 25), (1025, 1, 5), (1281, 5, 10), (1537, 5, 10)];
pub const GLYPH_RANGES_R6: &[(i64, i64, i64)] = &[(256, 3, 8), (257, 250, 750), (512, 3, 8), (513, 30, 40), (768, 3, 8), (769, 30, 40), (1025, 3, 8), (1281, 6, 16), (1537, 6, 16)];
pub const GLYPH_RANGES_BY_RANK: &[(i64, &[(i64, i64, i64)])] = &[(1, GLYPH_RANGES_R1), (2, GLYPH_RANGES_R2), (3, GLYPH_RANGES_R3), (4, GLYPH_RANGES_R4), (5, GLYPH_RANGES_R5), (6, GLYPH_RANGES_R6)];

// Safeguard "Weight by Rank" score bonus weight (multiplies the rank/6-star main-stat ratio).
pub const SAFEGUARD_MAIN_STAT_RANK_WEIGHT: f64 = 1.0;

// Per-rule tunable factor on the "Weight by Rank" main-stat bonus: default + bump-control bounds.
pub const SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_DEFAULT: f64 = 1.0;
pub const SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_MIN: f64 = 0.0;
pub const SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_MAX: f64 = 9.9;
pub const SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_STEP: f64 = 0.1;

// Level-16 main-stat maxima as (rank, slot, variant, value) tuples. Rank-only (rarity-independent).
pub const MAIN_STAT_MAX16_BY_RANK_SLOT_VARIANT: &[(i64, i64, i64, f64)] = &[(4, 1, 257, 2840.0), (4, 2, 256, 40.0), (4, 2, 257, 2840.0), (4, 2, 512, 40.0), (4, 2, 513, 190.0), (4, 2, 768, 40.0), (4, 2, 769, 190.0), (4, 2, 1281, 64.0), (4, 2, 1537, 64.0), (4, 3, 256, 40.0), (4, 3, 257, 2840.0), (4, 3, 512, 40.0), (4, 3, 513, 190.0), (4, 3, 768, 40.0), (4, 3, 769, 190.0), (4, 3, 1792, 40.0), (4, 3, 2048, 49.0), (4, 4, 256, 40.0), (4, 4, 257, 2840.0), (4, 4, 512, 40.0), (4, 4, 513, 190.0), (4, 4, 768, 40.0), (4, 4, 769, 190.0), (4, 4, 1025, 35.0), (4, 5, 513, 190.0), (4, 6, 769, 190.0), (4, 7, 257, 2840.0), (4, 7, 513, 190.0), (4, 7, 769, 190.0), (4, 8, 257, 2840.0), (4, 8, 513, 190.0), (4, 8, 769, 190.0), (4, 8, 2048, 25.0), (4, 9, 257, 4260.0), (4, 9, 513, 285.0), (4, 9, 769, 285.0), (4, 9, 1281, 64.0), (4, 9, 1537, 64.0), (5, 1, 257, 3480.0), (5, 2, 256, 50.0), (5, 2, 257, 3480.0), (5, 2, 512, 50.0), (5, 2, 513, 225.0), (5, 2, 768, 50.0), (5, 2, 769, 225.0), (5, 2, 1281, 78.0), (5, 2, 1537, 78.0), (5, 3, 256, 50.0), (5, 3, 257, 3480.0), (5, 3, 512, 50.0), (5, 3, 513, 225.0), (5, 3, 768, 50.0), (5, 3, 769, 225.0), (5, 3, 1792, 50.0), (5, 3, 2048, 65.0), (5, 4, 256, 50.0), (5, 4, 257, 3480.0), (5, 4, 512, 50.0), (5, 4, 513, 225.0), (5, 4, 768, 50.0), (5, 4, 769, 225.0), (5, 4, 1025, 40.0), (5, 5, 513, 225.0), (5, 6, 769, 225.0), (5, 7, 257, 3480.0), (5, 7, 513, 225.0), (5, 7, 769, 225.0), (5, 8, 257, 3480.0), (5, 8, 513, 225.0), (5, 8, 769, 225.0), (5, 8, 2048, 33.0), (5, 9, 257, 5220.0), (5, 9, 513, 338.0), (5, 9, 769, 338.0), (5, 9, 1281, 78.0), (5, 9, 1537, 78.0), (6, 1, 257, 4080.0), (6, 2, 256, 60.0), (6, 2, 257, 4080.0), (6, 2, 512, 60.0), (6, 2, 513, 265.0), (6, 2, 768, 60.0), (6, 2, 769, 265.0), (6, 2, 1281, 96.0), (6, 2, 1537, 96.0), (6, 3, 256, 60.0), (6, 3, 257, 4080.0), (6, 3, 512, 60.0), (6, 3, 513, 265.0), (6, 3, 768, 60.0), (6, 3, 769, 265.0), (6, 3, 1792, 60.0), (6, 3, 2048, 80.0), (6, 4, 256, 60.0), (6, 4, 257, 4080.0), (6, 4, 512, 60.0), (6, 4, 513, 265.0), (6, 4, 768, 60.0), (6, 4, 769, 265.0), (6, 4, 1025, 45.0), (6, 5, 513, 265.0), (6, 6, 769, 265.0), (6, 7, 257, 4080.0), (6, 7, 513, 265.0), (6, 7, 769, 265.0), (6, 8, 257, 4080.0), (6, 8, 513, 265.0), (6, 8, 769, 265.0), (6, 8, 2048, 40.0), (6, 9, 257, 6120.0), (6, 9, 513, 398.0), (6, 9, 769, 398.0), (6, 9, 1281, 96.0), (6, 9, 1537, 96.0)];
