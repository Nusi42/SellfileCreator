// SFC (Sellfile Record) JSON reader for the native DLL.
//
// Mirrors the TypeScript `normalizeRecipe` + `normalizeSafeguardRule` functions
// in `sfcIO.ts` / `safeguards.ts`, converting human-readable label strings to the
// numeric codes consumed by the core builder functions.
//
// Label-to-code tables are derived from `generated_domain_constants.rs` and the
// same stat/slot/faction constant sets used by the TypeScript layer — no magic
// numbers inline.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::*;
// The aggregate-roll clamp lives with the builder that defines it; the reader applies the
// same bound when reading a recipe back, so it imports rather than restating it.
use crate::recipe_builder::clamp_roll_requirement;

// ---------------------------------------------------------------------------
// Stat variant label table (mirrors labelOfVariant / variantFromLabel in types.ts)
// ---------------------------------------------------------------------------

/// Map a human-readable stat label to the corresponding StatVariant numeric code.
/// Accepts common alternate spellings (case-insensitive).
pub fn stat_variant_from_label(label: &str) -> Option<i64> {
    // Normalise to lowercase for case-insensitive matching.
    let norm = label.trim().to_lowercase();
    match norm.as_str() {
        "spd" | "speed" => Some(STAT_VARIANT_SPD),
        "cr%" | "crit rate" | "cr" => Some(STAT_VARIANT_CR),
        "cdmg%" | "crit dmg" | "c.dmg" | "cdmg" => Some(STAT_VARIANT_CDMG),
        "res" | "res%" => Some(STAT_VARIANT_RES),
        "acc" | "acc%" => Some(STAT_VARIANT_ACC),
        "hp%" | "hp" => {
            // Percent form (HP%) is the default for the two-form stats.
            if norm.contains('%') {
                Some(STAT_VARIANT_HP_PERCENT)
            } else {
                Some(STAT_VARIANT_HP_FLAT)
            }
        }
        "hp flat" | "hp (flat)" => Some(STAT_VARIANT_HP_FLAT),
        "atk%" | "atk" => {
            if norm.contains('%') {
                Some(STAT_VARIANT_ATK_PERCENT)
            } else {
                Some(STAT_VARIANT_ATK_FLAT)
            }
        }
        "atk flat" | "atk (flat)" => Some(STAT_VARIANT_ATK_FLAT),
        "def%" | "def" => {
            if norm.contains('%') {
                Some(STAT_VARIANT_DEF_PERCENT)
            } else {
                Some(STAT_VARIANT_DEF_FLAT)
            }
        }
        "def flat" | "def (flat)" => Some(STAT_VARIANT_DEF_FLAT),
        "roll count" | "rolls" | "roll" => Some(STAT_VARIANT_ROLL_COUNT),
        _ => {
            // Fallback: check canonical label from generated constants.
            for &(variant, label) in STAT_VARIANT_DISPLAY_LABELS {
                if label.eq_ignore_ascii_case(&norm) {
                    return Some(variant);
                }
            }
            // Accept the anomalous-substat labels
            // ("PvE DMG +", ...) so SFC documents containing them keep parsing here
            // exactly like in the TS reader (Update 11.70 prep).
            for &(variant, label) in ANOMALOUS_SUBSTAT_LABELS {
                if label.eq_ignore_ascii_case(&norm) {
                    return Some(variant);
                }
            }
            None
        }
    }
}

// ---------------------------------------------------------------------------
// Rank label parsing (mirrors formatRank / RankCode in types.ts)
// ---------------------------------------------------------------------------

/// Parse a human-readable rank label (e.g. "5★", "≥ 4★", "≤ 3★", "Any") to a rank code.
/// Normalises ASCII substitutes (* → ★, >= → ≥, <= → ≤).
pub fn rank_code_from_label(raw: &str) -> i64 {
    let s = raw
        .trim()
        .replace('*', "★")
        .replace(">=", "≥ ")
        .replace("<=", "≤ ")
        // Collapse multiple spaces to one.
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if s.is_empty() || s.eq_ignore_ascii_case("any") {
        return RANK_CODE_ANY;
    }
    // Parse the star number from the LAST token (e.g. "5★" → 5). Scanning the whole string
    // for its first digit instead would read a digit that appears earlier — a label like
    // "Tier 2 ≥ 5★" would yield 2 and silently widen the rule to 2★-and-up gear.
    let star_digit = s
        .split_whitespace()
        .next_back()
        .and_then(|token| token.chars().find(|c| c.is_ascii_digit()))
        .and_then(|c| c.to_digit(10));
    let n = match star_digit {
        Some(d) => d as i64,
        None => return RANK_CODE_ANY,
    };
    if s.starts_with("≥") {
        // ≥ n★ : codes 7..11 (n=1..5)
        match n {
            1 => RANK_CODE_GTE_ONE,
            2 => RANK_CODE_GTE_TWO,
            3 => RANK_CODE_GTE_THREE,
            4 => RANK_CODE_GTE_FOUR,
            5 => RANK_CODE_GTE_FIVE,
            _ => RANK_CODE_ANY,
        }
    } else if s.starts_with("≤") {
        // ≤ n★ : codes 12..16 (n=2..6)
        match n {
            2 => RANK_CODE_LTE_TWO,
            3 => RANK_CODE_LTE_THREE,
            4 => RANK_CODE_LTE_FOUR,
            5 => RANK_CODE_LTE_FIVE,
            6 => RANK_CODE_LTE_SIX,
            _ => RANK_CODE_ANY,
        }
    } else {
        // Exact n★ : codes 1..6
        match n {
            1 => RANK_CODE_ONE,
            2 => RANK_CODE_TWO,
            3 => RANK_CODE_THREE,
            4 => RANK_CODE_FOUR,
            5 => RANK_CODE_FIVE,
            6 => RANK_CODE_SIX,
            _ => RANK_CODE_ANY,
        }
    }
}

// ---------------------------------------------------------------------------
// Rarity label parsing (mirrors rarityCodeToName / RarityCode in types.ts)
// ---------------------------------------------------------------------------

pub fn rarity_code_from_label(raw: &str) -> (i64, bool) {
    // Returns (rarity_code, is_auto).
    let s = raw
        .trim()
        .replace(">=", "≥ ")
        .replace("<=", "≤ ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if s.is_empty() || s.eq_ignore_ascii_case("any") {
        return (RARITY_CODE_ANY, false);
    }
    if s.eq_ignore_ascii_case("auto") {
        return (RARITY_CODE_ANY, true);
    }
    // Match against rarity names (exact, case-insensitive).
    let code = match s.to_lowercase().as_str() {
        "common" => RARITY_CODE_COMMON,
        "uncommon" => RARITY_CODE_UNCOMMON,
        "rare" => RARITY_CODE_RARE,
        "epic" => RARITY_CODE_EPIC,
        "legendary" => RARITY_CODE_LEGENDARY,
        "mythical" => RARITY_CODE_MYTHICAL,
        "≥ common" => RARITY_CODE_GTE_COMMON,
        "≥ uncommon" => RARITY_CODE_GTE_UNCOMMON,
        "≥ rare" => RARITY_CODE_GTE_RARE,
        "≥ epic" => RARITY_CODE_GTE_EPIC,
        "≤ uncommon" => RARITY_CODE_LTE_UNCOMMON,
        "≤ rare" => RARITY_CODE_LTE_RARE,
        "≤ epic" => RARITY_CODE_LTE_EPIC,
        "≤ legendary" => RARITY_CODE_LTE_LEGENDARY,
        "≤ mythical" => RARITY_CODE_LTE_MYTHICAL,
        "≥ legendary" => RARITY_CODE_GTE_LEGENDARY,
        _ => RARITY_CODE_ANY,
    };
    (code, false)
}

// Rarity labels used in safeguard combinations (1..6 bucket values, not rarity codes).
// Maps "Common"→1 .. "Mythical"→6.
pub fn safeguard_rarity_value_from_label(raw: &str) -> Option<i64> {
    match raw.trim().to_lowercase().as_str() {
        "common" => Some(1),
        "uncommon" => Some(2),
        "rare" => Some(3),
        "epic" => Some(4),
        "legendary" => Some(5),
        "mythical" => Some(6),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Faction name → code (mirrors factionNames in types.ts)
// ---------------------------------------------------------------------------

pub fn faction_code_from_label(raw: &str) -> i64 {
    let s = raw.trim();
    if s.is_empty() || s.eq_ignore_ascii_case("any") {
        return 0;
    }
    // FACTION_NAME_IDS is sorted by name; use linear scan (16 entries — fast enough).
    for &(name, id) in FACTION_NAME_IDS {
        if name.eq_ignore_ascii_case(s) {
            return id;
        }
    }
    0
}

// ---------------------------------------------------------------------------
// Slot name → ArtifactType ID (mirrors artifactTypeNames in types.ts)
// ---------------------------------------------------------------------------

pub fn slot_id_from_name(raw: &str) -> Option<i64> {
    let s = raw.trim();
    // ARTIFACT_TYPE_DISPLAY_NAMES is sorted by ID; linear scan over 9 entries.
    for &(id, name) in ARTIFACT_TYPE_DISPLAY_NAMES {
        if name.eq_ignore_ascii_case(s) {
            return Some(id);
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Rank value (1..6) from safeguard tuple rank labels (same as exact rank codes)
// ---------------------------------------------------------------------------

pub fn rank_value_from_label(raw: &str) -> Option<i64> {
    let code = rank_code_from_label(raw);
    // Only accept exact ranks (1..6) for safeguard rank values.
    if (RANK_CODE_ONE..=RANK_CODE_SIX).contains(&code) {
        Some(code)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// SFC JSON structs
// ---------------------------------------------------------------------------

/// Top-level SFC payload as stored in .sfc files.
/// Field names match the SFC JSON schema (PascalCase keys where applicable).
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct ReadableSfc {
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub metasets: Option<Vec<ReadableMetaset>>,
    #[serde(default, alias = "Minima")]
    pub minima: Option<serde_json::Value>,
    /// Recipe list (canonical key "Recipes"; legacy "Configs" also accepted).
    #[serde(default, alias = "Configs")]
    pub recipes: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    pub final_sell_remainder: Option<ReadableFinalSell>,
    #[serde(default)]
    pub safeguards: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    pub safeguards_enabled: Option<bool>,
    #[serde(default)]
    pub recipes_enabled: Option<bool>,
    #[serde(default)]
    pub note: Option<Vec<String>>,
    // UI-only dynamic-overrides state the app writes (sfcIO.ts buildSfcPayload): the user's
    // deviations from the Note DSL's authored defaults, and the switch that turns them off.
    // The rule engine reads the already-resolved Note, so it ignores all three, but they must
    // be declared so deny_unknown_fields does not reject current .sfc files.
    #[serde(default)]
    pub note_recipe_overrides_answers: Option<serde_json::Value>,
    #[serde(default)]
    pub note_safeguard_overrides_answers: Option<serde_json::Value>,
    #[serde(default, rename = "NoteRecipeOverridesDisabled")]
    pub note_recipe_overrides_disabled: Option<bool>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadableMetaset {
    #[serde(default)]
    pub name: Option<String>,
    // Legacy identity key. Current files key metasets by NAME and omit this, but files
    // written before that change still carry it, and `deny_unknown_fields` would reject
    // them outright — the app still reads it (sfcIO.ts builds a legacy id -> name map from
    // these records), so refusing the key here made the DLL unable to open a file the app
    // opens fine. Retained for that mapping, below.
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub set_names: Option<Vec<String>>,
    // UI-only fields the app writes (sfcIO.ts buildSfcPayload): `show` gates metaset
    // visibility and `iconId` picks its icon. The rule engine ignores both, but they
    // must be declared so deny_unknown_fields does not reject current .sfc files.
    #[serde(default)]
    pub show: Option<bool>,
    #[serde(default)]
    pub icon_id: Option<String>,
}

/// Readable recipe entry as stored in the SFC "Recipes" array.
/// Mirrors the output of `buildReadableRecipe` in sfcIO.ts.
#[derive(Debug, Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct ReadableRecipe {
    // Identity / metadata
    #[serde(default, rename = "name")]
    pub name: Option<String>,
    // Display appearance { name, fgColor? } written by sfcIO.ts for named recipes. The rule
    // engine ignores it (name/colour are UI-only), but it must be declared so
    // deny_unknown_fields accepts current .sfc files.
    #[serde(default, rename = "appearance")]
    pub appearance: Option<ReadableAppearance>,
    #[serde(default, rename = "Tags", alias = "tags")]
    pub tags: Option<Vec<String>>,
    // Recipe behaviour flags, written only when set. `deny_unknown_fields` is on, so these
    // MUST be declared here even though only the gate is read: a key TS writes but Rust
    // does not know breaks the native reader for every current file.
    #[serde(default, rename = "IgnoredBySafeguards")]
    pub ignored_by_safeguards: Option<bool>,
    #[serde(default, rename = "ReworkGate")]
    pub rework_gate: Option<String>,
    // Keep vs sell decision
    #[serde(default, rename = "keep")]
    pub keep: Option<bool>,
    // Export mode ("Active" / "Disabled" / legacy "Separator")
    #[serde(default, rename = "visibility", alias = "SellfileVisibility", alias = "Visibility")]
    pub visibility: Option<String>,
    #[serde(default, rename = "exportMode", alias = "ExportMode")]
    pub export_mode: Option<String>,
    // Current separator marker (`Separator: true`) — the same flag safeguard separator
    // entries carry; the visibility "Separator" label above is the legacy spelling.
    #[serde(default, rename = "Separator", alias = "separator")]
    pub separator: Option<bool>,

    // Human-readable selectors
    #[serde(default, rename = "Rank")]
    pub rank: Option<String>,
    /// Accepts numeric rankCode for back-compat.
    #[serde(default, rename = "rankCode")]
    pub rank_code: Option<i64>,
    #[serde(default, rename = "Rarity")]
    pub rarity: Option<String>,
    /// Accepts numeric rarityCode for back-compat.
    #[serde(default, rename = "rarityCode")]
    pub rarity_code: Option<i64>,
    #[serde(default, rename = "Faction")]
    pub faction: Option<String>,
    /// Accepts numeric factionCode for back-compat.
    #[serde(default, rename = "factionCode")]
    pub faction_code: Option<i64>,

    // Main / substat selections
    #[serde(default, rename = "mainStats")]
    pub main_stats: Option<Vec<String>>,
    #[serde(default, rename = "substats")]
    pub substats: Option<Vec<ReadableSubstat>>,
    // Per-substat roll targets { "<label>": <entry> }, written by sfcIO.ts rollTargetsToReadable.
    // The DLL rule build does not consume roll targets; declared so parsing tolerates them.
    #[serde(default, rename = "substatRollTargets")]
    pub substat_roll_targets: Option<serde_json::Value>,

    // Level window
    #[serde(default, rename = "minLevel")]
    pub min_level: Option<i64>,
    #[serde(default, rename = "maxLevel")]
    pub max_level: Option<i64>,

    // Substat count / roll requirements
    #[serde(default, rename = "minCount")]
    pub min_count: Option<i64>,
    #[serde(default, rename = "autoMinCount")]
    pub auto_min_count: Option<bool>,
    #[serde(default, rename = "autoSubstatFlex")]
    pub auto_substat_flex: Option<bool>,
    #[serde(default, rename = "minRequiredRolls")]
    pub min_required_rolls: Option<i64>,
    #[serde(default, rename = "autoMinRequiredRolls")]
    pub auto_min_required_rolls: Option<bool>,
    #[serde(default, rename = "lockedMinRequiredRolls")]
    pub locked_min_required_rolls: Option<i64>,

    // Slot / set / metaset filters
    #[serde(default, rename = "artifactTypeNames")]
    pub artifact_type_names: Option<Vec<String>>,
    // Name-based set entries { name, excluded? } — the shape the current app writes.
    #[serde(default, rename = "artifactSetNames")]
    pub artifact_set_names: Option<Vec<ReadableArtifactSetNameEntry>>,
    // Legacy numeric set entries { id, excluded? } or bare id — accepted for back-compat.
    #[serde(default, rename = "artifactSetIds")]
    pub artifact_set_ids: Option<Vec<ReadableArtifactSetEntry>>,
    #[serde(default, rename = "artifactMetaSetNames")]
    pub artifact_meta_set_names: Option<Vec<String>>,
    // Legacy key carrying metaset IDS rather than names. It cannot simply alias the field
    // above: an id is not a name, so aliasing matched the raw id against `meta.name`, found
    // nothing, and left the recipe with no set filter — i.e. matching every set. Read
    // separately and resolved through the embedded Metasets list, mirroring sfcIO.ts.
    #[serde(default, rename = "artifactMetaSetIds")]
    pub artifact_meta_set_ids: Option<Vec<String>>,

    // Keep-mode options
    #[serde(default, rename = "earlyKeepMode")]
    pub early_keep_mode: Option<String>,
    #[serde(default, rename = "autoRarityThreshold", alias = "autoRaritySupplementsThreshold")]
    pub auto_rarity_threshold: Option<String>,
}

/// Substat entry as stored in the SFC "substats" array.
/// Accepts both the compact string form (just a label) and the object form.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum ReadableSubstat {
    /// Plain label string, e.g. "SPD".
    Label(String),
    /// Object form with stat + optional modifiers.
    Object {
        stat: String,
        #[serde(default)]
        fixed: Option<bool>,
        // The app writes camelCase `rollBounds`; accept the snake_case alias for older files.
        #[serde(default, rename = "rollBounds", alias = "roll_bounds")]
        roll_bounds: Option<ReadableSubstatBoundsEntry>,
        // Legacy flat fields (min/max/any at the top level of the substat object).
        #[serde(rename = "min")]
        legacy_min: Option<f64>,
        #[serde(rename = "max")]
        legacy_max: Option<f64>,
        #[serde(rename = "any")]
        legacy_any: Option<bool>,
    },
}

#[derive(Debug, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct ReadableSubstatBoundsEntry {
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(rename = "any", default)]
    pub any_flag: Option<bool>,
    // When true, the substat must be absent (HSF Condition "¬").
    #[serde(default)]
    pub not: Option<bool>,
}

/// Artifact set entry: either { id } (numeric) or just an id number.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum ReadableArtifactSetEntry {
    Object {
        id: i64,
        #[serde(default)]
        excluded: Option<bool>,
    },
    Id(i64),
}

/// Name-based artifact set entry { name, excluded? } — the shape the current app writes.
/// Resolved to a numeric set id via set_id_from_name at parse time.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReadableArtifactSetNameEntry {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub excluded: Option<bool>,
}

/// Display appearance { name, fgColor? } for named recipes/safeguards. UI-only; the rule
/// engine ignores both fields but must accept them (deny_unknown_fields on the recipe).
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReadableAppearance {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, rename = "fgColor")]
    pub fg_color: Option<String>,
}

/// Final Sell Remainder section in the SFC.
#[derive(Debug, Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct ReadableFinalSell {
    #[serde(default, rename = "artifacts")]
    pub artifacts: Option<bool>,
    #[serde(default, rename = "accessories")]
    pub accessories: Option<bool>,
    #[serde(default, rename = "levels")]
    pub levels: Option<Vec<i64>>,
    #[serde(default, rename = "setsMode")]
    pub sets_mode: Option<String>,
}

// ---------------------------------------------------------------------------
// SFC → builder pipeline
// ---------------------------------------------------------------------------

/// Parsed / normalised builder inputs derived from one SFC payload.
pub struct SfcParsed {
    pub recipes: Vec<ReadableRecipeParsed>,
    pub safeguard_rules: Vec<SafeguardWasmRuleIn>,
    pub safeguards_enabled: bool,
    pub final_sell: Option<FinalSellRemainderIn>,
    pub all_known_set_ids: Vec<i64>,
    pub minima: Option<SubstatTargetTableIn>,
    pub metasets: Vec<SafeguardWasmMetasetIn>,
}

/// Parsed recipe fields needed to call prepare_hsf_builder_recipe_core_fn +
/// build_hsf_rules_runtime_core_fn.
pub struct ReadableRecipeParsed {
    pub rank_code: i64,
    pub rarity_code: i64,
    pub rarity_mode: Option<String>, // Some("auto") when Auto rarity
    pub faction_code: i64,
    pub keep: bool,
    pub use_flag: bool, // false when Disabled
    pub is_separator: bool,
    pub name: String,
    pub main_stat_variants: Vec<i64>, // StatVariant[]
    pub substats_v: Vec<i64>,         // StatVariant[] — full selected pool
    pub fixed_substats_v: Vec<i64>,   // StatVariant[] — locked substats
    pub substat_roll_bounds_v: BTreeMap<i64, BuildHsfComboBoundsIn>,
    pub substat_roll_targets_v: BTreeMap<i64, BuildHsfComboTargetEntryIn>,
    pub min_count: i64,
    pub auto_min_count: bool,
    pub auto_substat_flex: bool,
    pub min_required_rolls: i64,
    pub auto_min_required_rolls: bool,
    pub locked_min_required_rolls: i64,
    pub min_level: i64,
    pub max_level: i64,
    pub artifact_type_ids: Vec<i64>,
    pub artifact_set_ids: Vec<i64>, // included set IDs
    pub artifact_meta_set_names: Vec<String>,
    // Rework gate resolved from the recipe field, or a legacy tag (ORE_ANY when ungated).
    pub ore: i64,
    // True when the recipe opts its KEEPS out of counting as safeguard coverage, resolved
    // from the recipe field or a legacy tag. Read by the safeguard collector's ignore list;
    // the flag was parsed and then dropped before, so the DLL silently disagreed with the
    // app on every sellfile that uses it.
    pub ignored_by_safeguards: bool,
    pub early_keep_mode: String, // "early" | "late"
    pub auto_rarity_supplements_threshold: Option<String>,
}

/// Resolve a recipe's rework gate into the HSF `Ore` sentinel.
///
/// Mirror of `oreSentinelForRecipe` + `transcodeLegacyRecipeTags` in src/lib/recipeFlags.ts.
/// The field name, the gate tokens, the legacy tag spellings and the sentinels all come from
/// shared/domain-constants.json, so none of those can drift. What IS duplicated is the
/// precedence below AND a minimal form of the tag grammar: TS runs `normalizeTagValue`
/// (trim, lowercase, reject whitespace, enforce TAG_TOKEN_REGEX) while this side only trims
/// and lowercases. That is sufficient because a token failing the TS grammar can never equal
/// one of the legacy spellings anyway — but any change to the tag grammar affecting those
/// spellings must be mirrored here. The shared test vectors in matcher_evaluator.rs pin the
/// two implementations to identical behaviour.
///
/// The explicit `ReworkGate` field wins when present: a current build wrote it, so it must
/// beat any stale legacy tag left in the same file. The legacy tag fallback below exists
/// only for files written before the field existed — delete it, together with the
/// LEGACY_TAGS_* constants, once files that old no longer need to load.
// serde's `rename` needs a literal, so the two flag keys above are spelled out rather than
// referencing the generated constants. Pin them to the SSOT at compile time instead, so a
// rename in shared/domain-constants.json fails the build here rather than silently
// producing a reader that ignores the field.
const _: () = {
    assert!(matches!(
        SFC_RECIPE_FIELD_IGNORED_BY_SAFEGUARDS.as_bytes(),
        b"IgnoredBySafeguards"
    ));
    assert!(matches!(SFC_RECIPE_FIELD_REWORK_GATE.as_bytes(), b"ReworkGate"));
};

/// True when the SFC version string is at or below the given major.minor.patch ceiling.
///
/// Mirrors `sfcVersionAtMost` in `sfcIO.ts` exactly, including its two lenient rules: a
/// pre-release / build-metadata suffix (`-dev`, `+build`) is stripped before comparison, and
/// a missing or unparseable segment reads as 0 — so an arbitrary hand-written `Version`
/// counts as OLD and still gets the migrations it most likely needs, rather than losing
/// every comparison and being wrongly reported as new.
fn sfc_version_at_most(version: Option<&str>, major: i64, minor: i64, patch: i64) -> bool {
    // No version at all is the "unparseable is old" case.
    let Some(version) = version else { return true };
    // Drop a pre-release / build suffix so `1.0.41-dev` compares as `1.0.41`.
    let core = version.split(['-', '+']).next().unwrap_or("");
    // A non-numeric segment coerces to 0, matching the TS `Number.isFinite` fallback.
    let mut segments = core.split('.').map(|s| s.parse::<i64>().unwrap_or(0));
    let vmaj = segments.next().unwrap_or(0);
    let vmin = segments.next().unwrap_or(0);
    let vpatch = segments.next().unwrap_or(0);
    if vmaj != major {
        return vmaj < major;
    }
    if vmin != minor {
        return vmin < minor;
    }
    vpatch <= patch
}

/// True when a file predates the recipe flags and may still encode behaviour as magic tags.
///
/// The window's ceiling is the last release that WROTE behaviour tags, read off the
/// cross-language spec (`LEGACY_RECIPE_TAG_LAST_WRITING_VERSION`) rather than spelled out
/// here — the TS loader gates on the very same constant, so the two readers cannot disagree
/// about which files convert. Above the ceiling a legacy-looking tag is a deliberate user
/// label and must survive as one.
pub fn uses_legacy_behaviour_tags(version: Option<&str>) -> bool {
    // Parse the ceiling from the shared constant; a malformed segment reads as 0, exactly
    // as the version being compared does.
    let mut ceiling = LEGACY_RECIPE_TAG_LAST_WRITING_VERSION
        .split('.')
        .map(|s| s.parse::<i64>().unwrap_or(0));
    let major = ceiling.next().unwrap_or(0);
    let minor = ceiling.next().unwrap_or(0);
    let patch = ceiling.next().unwrap_or(0);
    sfc_version_at_most(version, major, minor, patch)
}

pub fn resolve_chaos_ore_value(gate: Option<&str>, tags: Option<&[String]>, source_version: Option<&str>) -> i64 {
    // An explicit gate is authoritative. An unrecognized token (hand edit, or a gate from a
    // newer build) falls through to ORE_ANY rather than guessing a state.
    if let Some(gate) = gate {
        if gate == REWORK_GATE_REWORKED {
            return ORE_ORED;
        } else if gate == REWORK_GATE_NOT_REWORKED {
            return ORE_NOT_ORED;
        }
        return ORE_ANY;
    }
    // Outside the legacy window the tags carry no behaviour: a current file stores the real
    // gate key, so a legacy-looking tag there is a plain user label. Reading it as a gate
    // here would make the native DLL disagree with the TS loader about the same file.
    if !uses_legacy_behaviour_tags(source_version) {
        return ORE_ANY;
    }
    // No tags at all leaves the rule unconstrained.
    let Some(tags) = tags else { return ORE_ANY };
    // Track each side so a contradictory legacy pair can be detected.
    let mut wants_ored = false;
    let mut wants_not_ored = false;
    for raw in tags {
        // Match the TS tag grammar: trim padding, compare case-insensitively.
        let normalized = raw.trim().to_lowercase();
        // Every shipped spelling of each family, so a pre-rename file keeps its constraint
        // instead of silently losing it.
        if LEGACY_TAGS_REWORKED.iter().any(|t| *t == normalized) {
            wants_ored = true;
        } else if LEGACY_TAGS_NOT_REWORKED.iter().any(|t| *t == normalized) {
            wants_not_ored = true;
        }
    }
    // "reworked" wins when a legacy file carries both, matching the TS transcode.
    match (wants_ored, wants_not_ored) {
        (true, _) => ORE_ORED,
        (false, true) => ORE_NOT_ORED,
        (false, false) => ORE_ANY,
    }
}

/// True when a recipe opts its keeps out of counting as safeguard coverage.
///
/// Mirror of `isIgnoredBySafeguards` + the `ignoredBySafeguards` half of
/// `transcodeLegacyRecipeTags` in src/lib/recipeFlags.ts, and shaped exactly like
/// `resolve_chaos_ore_value` above so the two flags cannot drift in precedence: the explicit
/// field wins when present, and a legacy tag is honoured only inside the legacy window (a
/// legacy-looking tag on a current file is a deliberate user label, and reading it as
/// behaviour here would make the DLL disagree with the TS loader about the same file).
fn resolve_ignored_by_safeguards(flag: Option<bool>, tags: Option<&[String]>, source_version: Option<&str>) -> bool {
    // An explicit field is authoritative in BOTH directions: a current build that wrote
    // `false` means it, and must beat a stale legacy tag left in the same file.
    if let Some(flag) = flag {
        return flag;
    }
    // Outside the legacy window the tags carry no behaviour.
    if !uses_legacy_behaviour_tags(source_version) {
        return false;
    }
    // No tags at all leaves the recipe counting as ordinary coverage.
    let Some(tags) = tags else { return false };
    // Match the TS tag grammar: trim padding, compare case-insensitively, and accept every
    // shipped spelling so a pre-rename file keeps its opt-out.
    tags.iter().any(|raw| {
        let normalized = raw.trim().to_lowercase();
        LEGACY_TAGS_IGNORED_BY_SAFEGUARDS.iter().any(|t| *t == normalized)
    })
}

/// The display name of a recipe/safeguard entry, from either place a name is persisted.
///
/// The ONE definition of that precedence, because two call sites need it (recipes and
/// safeguard rules) and they must not drift. The CURRENT app writes the name nested under
/// `appearance.name` (`appearancePersistField` in nameAppearance.ts); the bare top-level
/// `name` key is legacy. Reading only the legacy key left EVERY rule unnamed on every file
/// the current app exports, so a caller had no way to say which rule decided a piece.
///
/// Legacy wins when present so a hand-edited or pre-migration file keeps the name it
/// states outright. Blank/whitespace-only collapses to `None`: the consumers treat an empty
/// name as absent (see `evaluate_verdicts`), so normalizing here keeps them from having to.
fn resolve_entry_name(legacy: Option<&str>, appearance: Option<&str>) -> Option<String> {
    // Take the first spelling that carries a non-blank name; trim to match the TS
    // sanitizer, which stores names already stripped of padding.
    [legacy, appearance]
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|name| !name.is_empty())
        .map(str::to_owned)
}

/// Every artifact/accessory set the game knows — the domain the trailing "sell the rest"
/// catch-all is expanded over.
///
/// This MUST be the whole catalog, not the sets a document happens to mention. The app
/// passes `getAllKnownArtifactSetIds()` minus the accessory sentinel (merge.ts), so the
/// catch-all sells a set no recipe names; deriving the domain from the file instead made
/// the DLL silently keep that gear. It was previously collected from each recipe's
/// `artifact_set_ids`, which is empty for a recipe that selects via a METASET — on a real
/// sellfile that saw 11 of 69 sets and left 649 of 8,388 pieces decided differently from
/// the app.
///
/// `SET_NAME_IDS` is generated from the same `shared/domain-constants.json` entry that
/// emits the app's catalog, so the two lists cannot drift. The sentinel is absent there by
/// construction (it is not a real game set), which is exactly what the app filters out.
fn all_known_set_ids() -> Vec<i64> {
    // Dedupe: the name→id table is keyed by NAME, and aliases can share one id.
    let mut ids: Vec<i64> = SET_NAME_IDS.iter().map(|(_, id)| *id).collect();
    ids.sort_unstable();
    ids.dedup();
    ids
}

/// Per-recipe substat roll TARGETS — the ladder a recipe demands at each level milestone.
///
/// The app carries these as `substatRollTargetsV` and hands them to the builder, which uses
/// `base` for the level-0 threshold and `increments` for the four milestones above it. The
/// reader parsed the field into a `Value` and then dropped it, so every recipe that sets a
/// custom ladder fell back to the FACTORY minimum instead: a 6-star amulet recipe demanding
/// HP 300/600/900/1200/1500 was built as 200/400/600/800/1000, and kept gear the app sells.
///
/// Two shapes are accepted, matching what the app has written over time: the current
/// `{ base, increments: [...] }`, and a legacy `{ min }` that names only the base. Anything
/// else is skipped rather than guessed at — a target that cannot be read must not silently
/// become a different number.
fn parse_substat_roll_targets(raw: Option<&serde_json::Value>) -> BTreeMap<i64, BuildHsfComboTargetEntryIn> {
    let mut out = BTreeMap::new();
    // Absent or non-object payloads leave every stat on its factory default.
    let Some(map) = raw.and_then(|v| v.as_object()) else {
        return out;
    };
    for (label, entry) in map {
        // Keys are stat LABELS ("HP", "ATK"), resolved through the same table the rest of the
        // recipe's stats use.
        let Some(variant) = stat_variant_from_label(label) else {
            continue;
        };
        let Some(obj) = entry.as_object() else {
            continue;
        };
        // Current shape: an explicit base plus one increment per milestone above level 0.
        let base = obj
            .get("base")
            .and_then(serde_json::Value::as_f64)
            // Legacy shape: `{ min }` carried the base under a different name.
            .or_else(|| obj.get("min").and_then(serde_json::Value::as_f64));
        let increments = obj
            .get("increments")
            .and_then(serde_json::Value::as_array)
            .map(|values| {
                // A null entry means "no target at this milestone" and must stay None rather than
                // collapsing to 0, which would read as a vacuous `>= 0`.
                values
                    .iter()
                    .map(serde_json::Value::as_f64)
                    .collect::<Vec<Option<f64>>>()
            });
        // An entry that names neither half constrains nothing; skip it.
        if base.is_none() && increments.is_none() {
            continue;
        }
        out.insert(variant, BuildHsfComboTargetEntryIn { base, increments });
    }
    out
}

/// Minimal substat target table parsed from SFC Minima section.
// Default star used when a recipe targets "Any" rank (mirrors anyRankDefaultsTo ?? 6).
fn default_any_rank_star() -> i64 {
    6
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SubstatTargetTableIn {
    // Values are f64: the anomalous mode-damage substats carry fractional percent
    // targets (1.25 per line at rank 5); classic stats keep integral values.
    #[serde(default)]
    pub one: BTreeMap<i64, f64>,
    #[serde(default)]
    pub two: BTreeMap<i64, f64>,
    #[serde(default)]
    pub three: BTreeMap<i64, f64>,
    #[serde(default)]
    pub four: BTreeMap<i64, f64>,
    #[serde(default)]
    pub five: BTreeMap<i64, f64>,
    #[serde(default)]
    pub six: BTreeMap<i64, f64>,
    // Star bucket to use for "Any"-rank recipes (1..6); mirrors anyRankDefaultsTo in
    // sfcIO.ts. Defaults to 6 (strictest) when absent, matching coerceFallback.
    #[serde(default = "default_any_rank_star", rename = "anyRankDefaultsTo")]
    pub any_rank_defaults_to: i64,
}

// Hand-written Default so the fallback star defaults to 6, not i64's 0.
impl Default for SubstatTargetTableIn {
    fn default() -> Self {
        SubstatTargetTableIn {
            one: BTreeMap::new(),
            two: BTreeMap::new(),
            three: BTreeMap::new(),
            four: BTreeMap::new(),
            five: BTreeMap::new(),
            six: BTreeMap::new(),
            any_rank_defaults_to: default_any_rank_star(),
        }
    }
}

// Metaset entry forwarded to WASM safeguard resolver.
// Mirrors SafeguardWasmMetasetIn in safeguards/mod.rs.
// Re-export via serde_json::Value to avoid coupling types across modules.
#[derive(Debug, Serialize, Clone)]
pub struct SfcMetaset {
    pub name: String,
    pub set_ids: Vec<i64>,
}

// ---------------------------------------------------------------------------
// Main parse function
// ---------------------------------------------------------------------------

/// Parse an SFC JSON string into normalised builder inputs ready for the DLL pipeline.
pub fn parse_sfc(sfc_text: &str) -> Result<SfcParsed, String> {
    // Normalise: allow bare recipe arrays for back-compat.
    let root: serde_json::Value = serde_json::from_str(sfc_text).map_err(|e| format!("SFC JSON parse error: {e}"))?;

    // Bare array → wrap as Recipes list.
    let root = if root.is_array() {
        serde_json::json!({ "Recipes": root })
    } else {
        root
    };

    let sfc: ReadableSfc = serde_json::from_value(root).map_err(|e| format!("SFC structure error: {e}"))?;

    // Legacy metaset ID -> display name, built from the raw records before they are
    // narrowed to name+sets. Recipes written before metasets were keyed by name reference
    // them by this id, and it is the only place the mapping survives.
    let legacy_meta_id_to_name: BTreeMap<String, String> = sfc
        .metasets
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter_map(|m| {
            let id = m.id.as_deref()?.trim().to_string();
            let name = m.name.as_deref().unwrap_or("").trim().to_string();
            if id.is_empty() || name.is_empty() {
                return None;
            }
            Some((id, name))
        })
        .collect();

    // Parse metasets (used to expand set IDs in safeguard combinations).
    let metasets: Vec<SafeguardWasmMetasetIn> = sfc
        .metasets
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter_map(|m| {
            let name = m.name.as_deref()?.trim().to_string();
            if name.is_empty() {
                return None;
            }
            // Expand the metaset's member set names → ids via the generated catalog so
            // safeguard combinations referencing this metaset resolve to real sets.
            let sets: Vec<i64> = m
                .set_names
                .as_deref()
                .unwrap_or(&[])
                .iter()
                .filter_map(|n| set_id_from_name(n))
                .collect();
            Some(SafeguardWasmMetasetIn { name, sets })
        })
        .collect();

    // Parse recipes.
    let raw_recipes = sfc.recipes.as_deref().unwrap_or(&[]);
    let mut parsed_recipes = Vec::with_capacity(raw_recipes.len());
    for (i, raw) in raw_recipes.iter().enumerate() {
        let recipe: ReadableRecipe =
            serde_json::from_value(raw.clone()).map_err(|e| format!("Recipe[{i}] parse error: {e}"))?;
        let parsed = parse_readable_recipe(&recipe, sfc.version.as_deref(), &metasets, &legacy_meta_id_to_name)?;
        parsed_recipes.push(parsed);
    }

    // Parse safeguard rules, unnesting groups (see parse_sfc_safeguard_entries).
    let raw_safeguards = sfc.safeguards.as_deref().unwrap_or(&[]);
    let mut safeguard_rules = parse_sfc_safeguard_entries(raw_safeguards)?;
    // Expand each rule's metaset references into concrete sets, exactly as the recipe path
    // above does and as the app does before detection. Skipping this leaves a metaset-only
    // rule with an empty set list, which the bucket resolver reads as "every set" — so the
    // rule would protect the whole vault instead of the metaset it names.
    let safeguard_meta_map = safeguard_metaset_lookup(&metasets);
    for rule in &mut safeguard_rules {
        let mut combination = rule.combination.clone().unwrap_or_default();
        expand_safeguard_combination_metasets(&mut combination, &safeguard_meta_map);
        rule.combination = Some(combination);
    }

    // Parse final sell remainder.
    let final_sell = sfc.final_sell_remainder.as_ref().map(|fs| FinalSellRemainderIn {
        artifacts: fs.artifacts.unwrap_or(false),
        accessories: fs.accessories.unwrap_or(false),
        levels: fs.levels.clone().unwrap_or_default(),
        sets_mode: fs.sets_mode.clone(),
    });

    // Parse substat target minima table.
    let minima = if let Some(raw_minima) = sfc.minima.as_ref() {
        parse_substat_target_table(raw_minima)
    } else {
        None
    };

    Ok(SfcParsed {
        recipes: parsed_recipes,
        safeguard_rules,
        safeguards_enabled: sfc.safeguards_enabled.unwrap_or(false),
        final_sell,
        all_known_set_ids: all_known_set_ids(),
        minima,
        metasets,
    })
}

// ---------------------------------------------------------------------------
// Recipe normalisation
// ---------------------------------------------------------------------------

// `source_version` is the owning file's `Version`; it gates the legacy behaviour-tag
// fallback so this reader converts exactly the files the TS loader converts.
fn parse_readable_recipe(
    rec: &ReadableRecipe,
    source_version: Option<&str>,
    metasets: &[SafeguardWasmMetasetIn],
    legacy_meta_id_to_name: &BTreeMap<String, String>,
) -> Result<ReadableRecipeParsed, String> {
    // Determine export mode. `Separator: true` is the current marker; the
    // visibility label "Separator" is the legacy spelling (still accepted).
    let vis_raw = rec
        .visibility
        .as_deref()
        .or(rec.export_mode.as_deref())
        .unwrap_or("Active");
    let vis = vis_raw.trim().to_lowercase();
    let is_separator = rec.separator.unwrap_or(false) || vis == "separator";
    let use_flag = vis != "disabled" && vis != "disable";

    // Rank.
    let rank_code = if let Some(code) = rec.rank_code {
        code
    } else if let Some(label) = rec.rank.as_deref() {
        rank_code_from_label(label)
    } else {
        RANK_CODE_ANY
    };

    // Rarity.
    let (rarity_code, rarity_mode) = if let Some(code) = rec.rarity_code {
        (code, None)
    } else if let Some(label) = rec.rarity.as_deref() {
        let (code, is_auto) = rarity_code_from_label(label);
        (code, if is_auto { Some("auto".to_string()) } else { None })
    } else {
        (RARITY_CODE_ANY, None)
    };

    // Faction.
    let faction_code = if let Some(code) = rec.faction_code {
        code
    } else if let Some(label) = rec.faction.as_deref() {
        faction_code_from_label(label)
    } else {
        0
    };

    // Main stats.
    let main_stat_variants: Vec<i64> = rec
        .main_stats
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter_map(|label| stat_variant_from_label(label))
        .collect();

    // Substats.
    let mut substats_v: Vec<i64> = Vec::new();
    let mut fixed_substats_v: Vec<i64> = Vec::new();
    let mut substat_roll_bounds_v: BTreeMap<i64, BuildHsfComboBoundsIn> = BTreeMap::new();
    for entry in rec.substats.as_deref().unwrap_or(&[]) {
        let (label, is_fixed, bounds_opt) = match entry {
            ReadableSubstat::Label(s) => (s.as_str(), false, None),
            ReadableSubstat::Object {
                stat,
                fixed,
                roll_bounds,
                legacy_min,
                legacy_max,
                legacy_any,
            } => {
                // Merge roll_bounds object with legacy flat fields.
                let eff_bounds = roll_bounds.clone().or_else(|| {
                    if legacy_min.is_some() || legacy_max.is_some() || legacy_any.is_some() {
                        Some(ReadableSubstatBoundsEntry {
                            min: *legacy_min,
                            max: *legacy_max,
                            any_flag: *legacy_any,
                            not: None,
                        })
                    } else {
                        None
                    }
                });
                (stat.as_str(), fixed.unwrap_or(false), eff_bounds)
            }
        };
        let Some(variant) = stat_variant_from_label(label) else {
            continue;
        };
        if !substats_v.contains(&variant) {
            substats_v.push(variant);
        }
        if is_fixed && !fixed_substats_v.contains(&variant) {
            fixed_substats_v.push(variant);
        }
        if let Some(b) = bounds_opt {
            let not_flag = b.not.unwrap_or(false);
            // "not" is mutually exclusive: when set, record only the not flag.
            if not_flag {
                substat_roll_bounds_v.insert(
                    variant,
                    BuildHsfComboBoundsIn {
                        min: None,
                        max: None,
                        any: None,
                        not: Some(true),
                    },
                );
                continue;
            }
            // Roll bounds come off the wire as floats but count whole roll events, so the
            // ceilings are the generated domain constants rather than spelled-out literals:
            // a slot holds at most SUBSTAT_MAX_ROLLS_PER_SLOT rolls, and a max bound is
            // capped at the slot count it can be spread across.
            let min_val = b
                .min
                .map(|v| v.clamp(0.0, SUBSTAT_MAX_ROLLS_PER_SLOT as f64).floor());
            let max_val = b.max.map(|v| v.clamp(0.0, SUBSTAT_SLOT_COUNT as f64).floor());
            let any_flag = b.any_flag.unwrap_or(false);
            // Only record bounds when at least one constraint is meaningful.
            if min_val.map(|m| m > 0.0).unwrap_or(false) || max_val.is_some() || any_flag {
                substat_roll_bounds_v.insert(
                    variant,
                    BuildHsfComboBoundsIn {
                        min: min_val,
                        max: max_val,
                        any: if any_flag { Some(true) } else { None },
                        not: None,
                    },
                );
            }
        }
    }
    // Ensure fixed substats are in the selected pool.
    for &fv in &fixed_substats_v {
        if !substats_v.contains(&fv) {
            substats_v.push(fv);
        }
    }

    // Slot IDs.
    let artifact_type_ids: Vec<i64> = rec
        .artifact_type_names
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter_map(|name| slot_id_from_name(name))
        .collect();

    // Set IDs. The current app writes `artifactSetNames` (name-based); older files used
    // numeric `artifactSetIds`. Resolve names → ids via the generated catalog and merge
    // both sources. Excluded entries are filters we drop (an excluded set is not required).
    let mut artifact_set_ids: Vec<i64> = rec
        .artifact_set_names
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter(|entry| !entry.excluded.unwrap_or(false))
        .filter_map(|entry| entry.name.as_deref().and_then(set_id_from_name))
        .collect();
    // Excluded entries are remembered, NOT just skipped: an exclusion must be able to remove
    // a set a METASET contributed below, which is what `resolveArtifactSetSelections` does
    // (expand, then apply exclusions last so an explicit remove always wins).
    let mut excluded_set_ids: Vec<i64> = rec
        .artifact_set_names
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter(|entry| entry.excluded.unwrap_or(false))
        .filter_map(|entry| entry.name.as_deref().and_then(set_id_from_name))
        .collect();
    // Legacy numeric entries (back-compat); append any not already present.
    for entry in rec.artifact_set_ids.as_deref().unwrap_or(&[]) {
        let id = match entry {
            ReadableArtifactSetEntry::Object { id, excluded } => {
                if excluded.unwrap_or(false) {
                    if !excluded_set_ids.contains(id) {
                        excluded_set_ids.push(*id);
                    }
                    continue;
                }
                *id
            }
            ReadableArtifactSetEntry::Id(id) => *id,
        };
        if !artifact_set_ids.contains(&id) {
            artifact_set_ids.push(id);
        }
    }

    let mut artifact_meta_set_names: Vec<String> = rec
        .artifact_meta_set_names
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    // Legacy fallback, and only a fallback — the app consults artifactMetaSetIds solely when
    // the name list is empty, so a file carrying both keys resolves by name on both sides.
    if artifact_meta_set_names.is_empty() {
        artifact_meta_set_names = rec
            .artifact_meta_set_ids
            .as_deref()
            .unwrap_or(&[])
            .iter()
            .filter_map(|raw| legacy_meta_id_to_name.get(raw.trim()).cloned())
            .collect();
    }

    // Expand the recipe's metasets into their member set ids and union them in. Mirror of
    // `resolveArtifactSetSelections` (gearSets/selection.ts), which the app runs BEFORE rule
    // generation so the builder only ever sees resolved ids.
    //
    // Without this a metaset-driven recipe carries NO set filter at all, so it matches every
    // set instead of its members. On a real sellfile 107 of 195 recipes select their sets this
    // way; the DLL kept 668 pieces the app sells and sold others the app keeps, because the
    // rules it built were not the rules the recipe describes.
    for meta_name in &artifact_meta_set_names {
        // Metaset names are matched case-insensitively, like every other name in this reader.
        let Some(meta) = metasets.iter().find(|m| m.name.eq_ignore_ascii_case(meta_name)) else {
            continue;
        };
        for &id in &meta.sets {
            if !artifact_set_ids.contains(&id) {
                artifact_set_ids.push(id);
            }
        }
    }
    // Exclusions apply LAST so an explicit remove beats anything a metaset contributed.
    artifact_set_ids.retain(|id| !excluded_set_ids.contains(id));

    // Level window — clamp to valid milestones.
    let min_level = clamp_milestone(rec.min_level.unwrap_or(0));
    let max_level = clamp_milestone(rec.max_level.unwrap_or(16));
    let (min_level, max_level) = if min_level <= max_level {
        (min_level, max_level)
    } else {
        (max_level, min_level)
    };

    // Roll requirements.
    let min_count = rec.min_count.unwrap_or(0).clamp(0, SUBSTAT_SLOT_COUNT);
    let auto_min_count = rec.auto_min_count.unwrap_or(false);
    let auto_substat_flex = rec.auto_substat_flex.unwrap_or(false);
    let min_required_rolls = clamp_roll_requirement(rec.min_required_rolls.unwrap_or(0));
    let auto_min_required_rolls = rec.auto_min_required_rolls.unwrap_or(true);
    let locked_min_required_rolls = clamp_roll_requirement(rec.locked_min_required_rolls.unwrap_or(0));

    // Keep-mode.
    let early_keep_mode = match rec.early_keep_mode.as_deref() {
        Some("late") | Some("reachable") => "late".to_string(),
        _ => "early".to_string(),
    };
    let auto_rarity_supplements_threshold = rec
        .auto_rarity_threshold
        .as_ref()
        .filter(|s| matches!(s.as_str(), "uncommon" | "rare" | "epic"))
        .cloned();

    Ok(ReadableRecipeParsed {
        rank_code,
        rarity_code,
        rarity_mode,
        faction_code,
        keep: rec.keep.unwrap_or(true),
        use_flag,
        is_separator,
        // Legacy top-level key, else the nested appearance the current app writes.
        name: resolve_entry_name(
            rec.name.as_deref(),
            rec.appearance.as_ref().and_then(|a| a.name.as_deref()),
        )
        .unwrap_or_default(),
        main_stat_variants,
        substats_v,
        fixed_substats_v,
        substat_roll_bounds_v,
        substat_roll_targets_v: parse_substat_roll_targets(rec.substat_roll_targets.as_ref()),
        min_count,
        auto_min_count,
        auto_substat_flex,
        min_required_rolls,
        auto_min_required_rolls,
        locked_min_required_rolls,
        min_level,
        max_level,
        artifact_type_ids,
        artifact_set_ids,
        artifact_meta_set_names,
        // Resolve the chaos-ore tags once here so every downstream builder call agrees.
        ore: resolve_chaos_ore_value(rec.rework_gate.as_deref(), rec.tags.as_deref(), source_version),
        // Same precedence for the safeguard-coverage opt-out, resolved once here too.
        ignored_by_safeguards: resolve_ignored_by_safeguards(
            rec.ignored_by_safeguards,
            rec.tags.as_deref(),
            source_version,
        ),
        early_keep_mode,
        auto_rarity_supplements_threshold,
    })
}

// One count-mode object (perRule / perSet / perFaction / perMainStat / perSlot booleans) as
// the SFC writes it — used for a rule's own chips and for the chips a group carries.
fn parse_sfc_count_mode(v: &serde_json::Value) -> SafeguardWasmCountMode {
    let o = v.as_object();
    SafeguardWasmCountMode {
        per_rule: o
            .and_then(|m| m.get("perRule"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        per_set: o
            .and_then(|m| m.get("perSet"))
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        per_faction: o
            .and_then(|m| m.get("perFaction"))
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        per_main_stat: o
            .and_then(|m| m.get("perMainStat"))
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        per_slot: o
            .and_then(|m| m.get("perSlot"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    }
}

/// True when a raw Safeguards entry is a separator (an inert list divider).
///
/// ONE definition for every branch that asks — the group unnester and the rule parser both call
/// it, so they can never disagree about what counts as a divider. Accepts the lowercase alias
/// because `normalizeSafeguardRule` (safeguards.ts) does: a hand-edited file writing `separator`
/// must resolve to the same entry kind in the browser and in the native DLL.
fn is_sfc_safeguard_separator(raw: &serde_json::Value) -> bool {
    raw.as_object()
        .and_then(|rec| rec.get("Separator").or_else(|| rec.get("separator")))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// Walks the SFC's Safeguards array and returns a FLAT rule list with membership re-attached.
///
/// A group persists as one entry holding its `members`: the nesting IS the grouping, so nothing on
/// disk carries an id and the shape cannot express a torn or overlapping run. Ids are runtime-only
/// — `resolve_safeguard_groups` still answers "which run?" by id, so one is minted per group here
/// and stamped onto every member it unnests. Positional (`grp/0`, `grp/1`, …) rather than random:
/// this parse is pure and must stay reproducible, and uniqueness within one array is all the
/// resolver needs. Mirrors `parseReadableSafeguardEntries` in sfcIO.ts.
fn parse_sfc_safeguard_entries(raws: &[serde_json::Value]) -> Result<Vec<SafeguardWasmRuleIn>, String> {
    let mut out = Vec::with_capacity(raws.len());
    for (i, raw) in raws.iter().enumerate() {
        let members = raw
            .as_object()
            .and_then(|rec| rec.get("members"))
            .and_then(|v| v.as_array());
        // Not a group entry: an ordinary rule or a separator, ungrouped by construction.
        let Some(members) = members else {
            out.push(parse_sfc_safeguard_rule(raw).map_err(|e| format!("Safeguard[{i}] parse error: {e}"))?);
            continue;
        };
        let rec = raw
            .as_object()
            .ok_or_else(|| format!("Safeguard[{i}] parse error: group entry is not a JSON object"))?;
        // One id for the whole nested run — the only place a loaded group's id comes from.
        let settings = rec
            .get("Group")
            .or_else(|| rec.get("group"))
            .and_then(|v| v.as_object())
            .map(|g| SafeguardWasmGroupIn {
                id: format!("grp/{i}"),
                required_count: g.get("requiredCount").and_then(|v| v.as_i64()),
                count_mode: g.get("countMode").map(parse_sfc_count_mode),
            });
        for (m, member) in members.iter().enumerate() {
            let mut rule = parse_sfc_safeguard_rule(member)
                .map_err(|e| format!("Safeguard[{i}].members[{m}] parse error: {e}"))?;
            // A separator cannot be a member; it survives as a plain divider rather than
            // being dropped. Matches the writer, which never nests one.
            if !is_sfc_safeguard_separator(member) {
                rule.group = settings.clone();
            }
            out.push(rule);
        }
    }
    Ok(out)
}

/// Parse a safeguard rule entry from the SFC's Safeguards array.
/// The SFC stores these with readable labels; we convert to SafeguardWasmRuleIn.
fn parse_sfc_safeguard_rule(raw: &serde_json::Value) -> Result<SafeguardWasmRuleIn, String> {
    let rec = raw.as_object().ok_or("Safeguard rule is not a JSON object")?;

    // Separator entries persist minimally ({ appearance?, Separator: true }) and are pure
    // list dividers — parse them as inert activation="off" rules so the Safeguards array
    // indices stay aligned with the TS side and matching never sees them.
    if is_sfc_safeguard_separator(raw) {
        return Ok(SafeguardWasmRuleIn {
            id: None,
            name: None,
            combination: None,
            required_count: None,
            activation: Some("off".to_string()),
            count_mode: None,
            ignore_previous_safeguards: None,
            ignore_equipped_in_collection: None,
            ignore_equipped_in_vault: None,
            substats: None,
            substat_match: None,
            substat_weights: None,
            weight_main_stat_by_rank: None,
            main_stat_rank_weight_factor: None,
            improvement_chance_threshold: None,
            tags: None,
            // A divider is never a member of a group.
            group: None,
        });
    }

    let id = rec.get("id").and_then(|v| v.as_str()).map(|s| s.trim().to_string());

    // Activation string is already in canonical form in the SFC ("protectExisting" etc.).
    let activation = rec.get("activation").and_then(|v| v.as_str()).map(|s| s.to_string());
    let required_count = rec.get("requiredCount").and_then(|v| v.as_i64());
    // The current app writes `ignorePreviousSafeguards_v2`; older files used the un-suffixed
    // key. Mirror safeguards.ts loader precedence: prefer _v2, fall back to the legacy name.
    // (Reading only the legacy key silently dropped the flag on every current .sfc.)
    let ignore_prev = rec
        .get("ignorePreviousSafeguards_v2")
        .or_else(|| rec.get("ignorePreviousSafeguards"))
        .and_then(|v| v.as_bool());
    let ignore_coll = rec.get("ignoreEquippedInCollection").and_then(|v| v.as_bool());
    let ignore_vault = rec.get("ignoreEquippedInVault").and_then(|v| v.as_bool());
    // "Weight by Rank" toggle; absent in older SFC files → None → treated as off downstream.
    let weight_main_stat_by_rank = rec.get("weightMainStatByRank").and_then(|v| v.as_bool());
    // Tunable main-stat rank bonus multiplier; absent in older SFC files → None → SSOT default (1.0).
    let main_stat_rank_weight_factor = rec.get("mainStatRankWeightFactor").and_then(|v| v.as_f64());
    // Accept the per-level object form (current) or the resolved [f64;4] array form.
    // Legacy bare-number SFC files are normalized to the object form by sfcIO.ts at import,
    // so Rust never needs to handle that case here.
    // A threshold that is PRESENT but unreadable is an error, not an absent threshold:
    // silently yielding None makes safeguard_rules_have_improvement_threshold report false,
    // detection skips the whole chance pass, and every thresholded rule quietly loses its
    // protection expansion. Same principle the roll-target reader above states — a value
    // that cannot be read must not become a different value.
    let improvement_chance_threshold = match rec.get("improvementChanceThreshold") {
        Some(serde_json::Value::Null) | None => None,
        Some(v) => Some(
            serde_json::from_value::<ImprovementChanceThresholdIn>(v.clone())
                .map_err(|e| format!("Safeguard improvementChanceThreshold parse error: {e}"))?,
        ),
    };

    // Count mode (perRule / perSet / perFaction / perMainStat / perSlot booleans).
    let count_mode = rec.get("countMode").map(parse_sfc_count_mode);

    // Membership is NOT a field of a persisted rule: the SFC nests members inside a group entry,
    // so only the caller walking the array can see it and it stamps the settings on afterwards
    // (see `parse_sfc_safeguard_entries`). A lone rule record is therefore ungrouped.
    let group = None;

    // Substats: stored as string label array in the SFC.
    let substats = rec.get("substats").and_then(|v| v.as_array()).map(|arr| {
        arr.iter()
            .filter_map(|v| v.as_str())
            .filter_map(stat_variant_from_label)
            .collect::<Vec<i64>>()
    });
    let substats = if substats.as_ref().map(|v: &Vec<i64>| v.is_empty()).unwrap_or(true) {
        None
    } else {
        substats
    };

    // Substat match mode.
    let substat_match = rec.get("substatMatch").and_then(|v| v.as_str()).map(|s| s.to_string());

    // Substat weights: keys are stat labels, values are f64.
    let substat_weights = rec.get("substatWeights").and_then(|v| v.as_object()).map(|obj| {
        obj.iter()
            .filter_map(|(label, weight)| {
                let variant = stat_variant_from_label(label)?;
                let w = weight.as_f64()?;
                Some((variant, w))
            })
            .collect::<BTreeMap<i64, f64>>()
    });
    let substat_weights = substat_weights.filter(|m| !m.is_empty());

    // Combination: stored under "tuple" in the SFC (built by buildReadableSafeguardTuple).
    let combination = rec
        .get("tuple")
        .or_else(|| rec.get("combination"))
        .map(parse_sfc_safeguard_combination);

    // Tags: string array used by the safeguard-overrides DSL selector matching in TS.
    let tags = rec.get("tags").and_then(|v| v.as_array()).map(|arr| {
        arr.iter()
            .filter_map(|v| v.as_str())
            .map(|s| s.to_string())
            .collect::<Vec<String>>()
    });
    let tags = if tags.as_ref().map(|v: &Vec<String>| v.is_empty()).unwrap_or(true) {
        None
    } else {
        tags
    };

    Ok(SafeguardWasmRuleIn {
        id,
        // Same precedence as recipes: legacy top-level key, else appearance.name.
        name: resolve_entry_name(
            rec.get("name").and_then(|v| v.as_str()),
            rec.get("appearance")
                .and_then(|v| v.get("name"))
                .and_then(|v| v.as_str()),
        ),
        combination,
        required_count,
        activation,
        count_mode,
        ignore_previous_safeguards: ignore_prev,
        ignore_equipped_in_collection: ignore_coll,
        ignore_equipped_in_vault: ignore_vault,
        substats,
        substat_match,
        substat_weights,
        // Group membership carried verbatim; resolve_safeguard_groups owns the run semantics.
        group,
        weight_main_stat_by_rank,
        main_stat_rank_weight_factor,
        improvement_chance_threshold,
        tags,
    })
}

/// Convert a readable safeguard combination (tuple) from SFC to SafeguardWasmCombination.
fn parse_sfc_safeguard_combination(raw: &serde_json::Value) -> SafeguardWasmCombination {
    let obj = raw.as_object();

    // Slots: string labels → slot IDs.
    let slots = obj
        .and_then(|o| o.get("slots"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().and_then(slot_id_from_name))
                .collect()
        })
        .unwrap_or_default();

    // Sets: the current app writes set names (e.g. {name:"Lifesteal"}); older files used
    // {id}. Resolve names via the generated set catalog (set_id_from_name) and accept
    // numeric ids for back-compat. The excluded flag is carried through either way.
    let sets = obj
        .and_then(|o| o.get("sets"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| {
                    let excluded = v.get("excluded").and_then(|e| e.as_bool()).unwrap_or(false);
                    // Prefer a numeric id; else resolve the set name to an id.
                    let id = v
                        .get("id")
                        .and_then(|n| n.as_i64())
                        .or_else(|| v.get("name").and_then(|n| n.as_str()).and_then(set_id_from_name));
                    id.map(|id| SafeguardWasmSetSelection { id, excluded })
                })
                .collect()
        })
        .unwrap_or_default();

    // Ranks: string rank labels → rank values (1..6).
    let ranks = obj
        .and_then(|o| o.get("ranks"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().and_then(rank_value_from_label))
                .collect()
        })
        .unwrap_or_default();

    // Rarities: string rarity labels → rarity values (1..6).
    let rarities = obj
        .and_then(|o| o.get("rarities"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().and_then(safeguard_rarity_value_from_label))
                .collect()
        })
        .unwrap_or_default();

    // Main stats: string labels → StatVariant.
    let main_stats = obj
        .and_then(|o| o.get("mainStats"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().and_then(stat_variant_from_label))
                .collect()
        })
        .unwrap_or_default();

    // Factions: string names → faction IDs.
    let factions = obj
        .and_then(|o| o.get("factions"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .map(faction_code_from_label)
                .filter(|&c| c != 0)
                .collect()
        })
        .unwrap_or_default();

    // Metaset names passed through verbatim.
    let meta_set_names = obj
        .and_then(|o| o.get("metaSetNames"))
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str()).map(|s| s.to_string()).collect())
        .unwrap_or_default();

    SafeguardWasmCombination {
        slots,
        sets,
        meta_set_names,
        ranks,
        rarities,
        main_stats,
        factions,
    }
}

// ---------------------------------------------------------------------------
// Substat target table parser (SFC Minima section)
// ---------------------------------------------------------------------------

// Coerce an anyRankDefaultsTo value (number 1..6 or the labels "one".."six" / "1".."6",
// case-insensitive) into a star. Mirrors coerceFallback in sfcIO.ts; unknown → 6.
fn coerce_any_rank_star(value: &serde_json::Value) -> i64 {
    if let Some(n) = value.as_i64() {
        if (1..=6).contains(&n) {
            return n;
        }
    }
    if let Some(s) = value.as_str() {
        match s.to_lowercase().as_str() {
            "one" | "1" => return 1,
            "two" | "2" => return 2,
            "three" | "3" => return 3,
            "four" | "4" => return 4,
            "five" | "5" => return 5,
            "six" | "6" => return 6,
            _ => {}
        }
    }
    6
}

fn parse_substat_target_table(raw: &serde_json::Value) -> Option<SubstatTargetTableIn> {
    let obj = raw.as_object()?;
    let mut table = SubstatTargetTableIn::default();
    for (key, value) in obj {
        // Keys are star labels "one".."six" (each a stat→min map), plus the "anyRankDefaultsTo"
        // fallback selector; unknown keys are ignored.
        if key == "anyRankDefaultsTo" {
            table.any_rank_defaults_to = coerce_any_rank_star(value);
            continue;
        }
        let bucket_map = match key.as_str() {
            "one" => &mut table.one,
            "two" => &mut table.two,
            "three" => &mut table.three,
            "four" => &mut table.four,
            "five" => &mut table.five,
            "six" => &mut table.six,
            _ => continue,
        };
        if let Some(inner) = value.as_object() {
            for (stat_label, stat_val) in inner {
                // f64 coercion: anomalous targets are fractional (1.25); classic stay integral.
                if let (Some(variant), Some(val)) = (stat_variant_from_label(stat_label), stat_val.as_f64()) {
                    bucket_map.insert(variant, val);
                }
            }
        }
    }
    Some(table)
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// Clamp a recipe's level BOUND down to a milestone it may name.
//
// This is `gear_ingest::snap_level_to_milestone` and nothing else. A bound must round DOWN
// — widening a recipe's ceiling to the next milestone up would make it match gear the author
// excluded — and since levels are banded (a piece belongs to the milestone it has REACHED)
// that is exactly what snapping a live level does. The two once differed, when snapping went
// to the NEAREST milestone; they no longer do, so this forwards rather than restating the
// rule. One definition: a change to the banding cannot move gear without moving bounds with
// it, which is the only way a recipe and the gear it judges stay on the same scale.
fn clamp_milestone(v: i64) -> i64 {
    snap_level_to_milestone(v)
}

// Metaset in the format SafeguardWasmMetasetIn expects.
// Re-use the type from safeguards module.
use crate::SafeguardWasmMetasetIn;

#[cfg(test)]
mod label_tests {
    use super::*;

    // ── stat_variant_from_label ───────────────────────────────────────────
    #[test]
    fn stat_variant_canonical_labels() {
        // Vectors from shared/sfc-label-test-vectors.json — statVariantFromLabel
        let cases: &[(&str, i64)] = &[
            ("SPD", STAT_VARIANT_SPD),
            ("spd", STAT_VARIANT_SPD),
            ("CR%", STAT_VARIANT_CR),
            ("cr%", STAT_VARIANT_CR),
            ("CDMG%", STAT_VARIANT_CDMG),
            ("RES", STAT_VARIANT_RES),
            ("ACC", STAT_VARIANT_ACC),
            ("HP%", STAT_VARIANT_HP_PERCENT),
            ("HP", STAT_VARIANT_HP_FLAT),
            ("ATK%", STAT_VARIANT_ATK_PERCENT),
            ("ATK", STAT_VARIANT_ATK_FLAT),
            ("DEF%", STAT_VARIANT_DEF_PERCENT),
            ("DEF", STAT_VARIANT_DEF_FLAT),
            ("Roll Count", STAT_VARIANT_ROLL_COUNT),
        ];
        for &(input, expected) in cases {
            assert_eq!(
                stat_variant_from_label(input),
                Some(expected),
                "stat_variant_from_label({input:?}) should be {expected}"
            );
        }
    }

    // ── rank_code_from_label ──────────────────────────────────────────────
    #[test]
    fn rank_code_canonical_labels() {
        // Vectors from shared/sfc-label-test-vectors.json — rankCodeFromLabel
        let cases: &[(&str, i64)] = &[
            ("5★", RANK_CODE_FIVE),
            ("5*", RANK_CODE_FIVE),
            ("6★", RANK_CODE_SIX),
            ("1★", RANK_CODE_ONE),
            ("≥ 5★", RANK_CODE_GTE_FIVE),
            (">= 5*", RANK_CODE_GTE_FIVE),
            ("≥ 4★", RANK_CODE_GTE_FOUR),
            ("≤ 4★", RANK_CODE_LTE_FOUR),
            ("<= 4*", RANK_CODE_LTE_FOUR),
            ("Any", RANK_CODE_ANY),
            ("", RANK_CODE_ANY),
        ];
        for &(input, expected) in cases {
            assert_eq!(
                rank_code_from_label(input),
                expected,
                "rank_code_from_label({input:?}) should be {expected}"
            );
        }
    }

    // ── rarity_code_from_label ────────────────────────────────────────────
    #[test]
    fn rarity_code_canonical_labels() {
        // Vectors from shared/sfc-label-test-vectors.json — rarityCodeFromLabel
        let cases: &[(&str, i64, bool)] = &[
            ("Epic", RARITY_CODE_EPIC, false),
            ("Legendary", RARITY_CODE_LEGENDARY, false),
            ("≥ Epic", RARITY_CODE_GTE_EPIC, false),
            (">= Epic", RARITY_CODE_GTE_EPIC, false),
            ("≤ Legendary", RARITY_CODE_LTE_LEGENDARY, false),
            ("Auto", RARITY_CODE_ANY, true),
            ("Any", RARITY_CODE_ANY, false),
            ("", RARITY_CODE_ANY, false),
        ];
        for &(input, expected_code, expected_auto) in cases {
            let (code, is_auto) = rarity_code_from_label(input);
            assert_eq!(
                code, expected_code,
                "rarity_code_from_label({input:?}).0 should be {expected_code}"
            );
            assert_eq!(
                is_auto, expected_auto,
                "rarity_code_from_label({input:?}).1 (is_auto) should be {expected_auto}"
            );
        }
    }

    // ── faction_code_from_label ───────────────────────────────────────────
    #[test]
    fn faction_code_canonical_labels() {
        // Vectors from shared/sfc-label-test-vectors.json — factionCodeFromLabel
        let cases: &[(&str, i64)] = &[
            ("Banner Lords", 1),
            ("Barbarians", 13),
            ("Dwarves", 16),
            ("Knight Revenant", 12),
            ("Sylvan Watchers", 14),
            ("Argonites", 17),
            ("Any", 0),
            ("", 0),
        ];
        for &(input, expected) in cases {
            assert_eq!(
                faction_code_from_label(input),
                expected,
                "faction_code_from_label({input:?}) should be {expected}"
            );
        }
    }

    // ── set_id_from_name (generated resolver) ─────────────────────────────
    #[test]
    fn set_name_resolves_to_id() {
        // Names must resolve to the ArtifactSet enum ids (trim + case-insensitive).
        assert_eq!(set_id_from_name("Relentless"), Some(18));
        assert_eq!(set_id_from_name("  lifesteal "), Some(9)); // trimmed + case-insensitive
        assert_eq!(set_id_from_name("Divine Life"), Some(33)); // multi-word
        assert_eq!(set_id_from_name("NotARealSet"), None);
        assert_eq!(set_id_from_name(""), None);
    }

    // ── parse_sfc on the CURRENT .sfc format ──────────────────────────────
    // Exercises every field that used to hard-reject: metaset show/iconId, recipe
    // appearance, name-based artifactSetNames, camelCase rollBounds, substatRollTargets.
    #[test]
    fn parse_sfc_accepts_current_format() {
        let sfc = r##"{
            "Version": "1.0",
            "Metasets": [
                { "name": "Speedy", "setNames": ["Speed", "Swift Parry"], "show": true, "iconId": "bolt" }
            ],
            "Recipes": [
                {
                    "keep": true,
                    "appearance": { "name": "Keep Speed Boots", "fgColor": "#abcdef" },
                    "Rank": "6*",
                    "Rarity": "Legendary",
                    "artifactSetNames": [ { "name": "Speed" }, { "name": "Lifesteal", "excluded": true } ],
                    "substats": [
                        { "stat": "SPD", "fixed": true, "rollBounds": { "min": 2 } }
                    ],
                    "substatRollTargets": { "SPD": { "min": 2 } },
                    "minCount": 1
                }
            ],
            "Safeguards": [],
            "SafeguardsEnabled": false,
            "NoteRecipeOverridesAnswers": { "tier": ["high"] },
            "NoteSafeguardOverridesAnswers": { "keepUniques": ["yes"] },
            "NoteRecipeOverridesDisabled": true
        }"##;
        let parsed = parse_sfc(sfc).expect("current-format SFC must parse");
        assert_eq!(parsed.recipes.len(), 1);
        let recipe = &parsed.recipes[0];
        // "Speed" resolved to id 4; the excluded "Lifesteal" is dropped from the filter.
        assert_eq!(recipe.artifact_set_ids, vec![4]);
        // SPD is a fixed substat with a min-roll bound recorded.
        assert!(recipe.fixed_substats_v.contains(&STAT_VARIANT_SPD));
        assert!(recipe.substat_roll_bounds_v.contains_key(&STAT_VARIANT_SPD));
        // Metaset member set names expanded to ids (Speed=4, Swift Parry=35).
        assert_eq!(parsed.metasets.len(), 1);
        assert_eq!(parsed.metasets[0].sets, vec![4, 35]);
    }

    // A recipe that selects its sets through a METASET must end up with those set ids.
    //
    // The app expands metasets before rule generation (`resolveArtifactSetSelections`), so the
    // builder only ever sees resolved ids. The reader used to keep `artifactMetaSetNames` as
    // names and expand nothing, leaving `artifact_set_ids` EMPTY — a recipe whose only set
    // selection was a metaset then built rules with no set filter and matched every set. On a
    // real sellfile 107 of 195 recipes select this way, and the DLL disagreed with the app on
    // 668 pieces.
    //
    // Exclusions are pinned alongside because they apply LAST: an explicit remove has to beat
    // a set the metaset contributed, or a recipe cannot subtract one member of its own metaset.
    #[test]
    fn recipe_metasets_expand_to_set_ids_and_exclusions_win() {
        let sfc = r##"{
            "Version": "1.0",
            "Metasets": [
                { "name": "Speedy", "setNames": ["Speed", "Swift Parry", "Lifesteal"] }
            ],
            "Recipes": [
                {
                    "appearance": { "name": "Via metaset" },
                    "keep": true,
                    "Rank": "Any",
                    "Rarity": "Any",
                    "artifactMetaSetNames": ["Speedy"],
                    "artifactSetNames": [ { "name": "Lifesteal", "excluded": true } ],
                    "substats": [],
                    "minCount": 0
                },
                {
                    "appearance": { "name": "Direct plus metaset" },
                    "keep": true,
                    "Rank": "Any",
                    "Rarity": "Any",
                    "artifactMetaSetNames": ["speedy"],
                    "artifactSetNames": [ { "name": "Offense" } ],
                    "substats": [],
                    "minCount": 0
                }
            ],
            "Safeguards": [],
            "SafeguardsEnabled": false
        }"##;
        let parsed = parse_sfc(sfc).expect("SFC must parse");

        // Speed=4 and Swift Parry=35 come from the metaset; Lifesteal is excluded explicitly
        // even though the metaset lists it, because exclusions are applied last.
        let mut via_meta = parsed.recipes[0].artifact_set_ids.clone();
        via_meta.sort_unstable();
        assert_eq!(
            via_meta,
            vec![4, 35],
            "a metaset-only recipe must carry its members' set ids; empty here means the reader \
             never expanded the metaset and the recipe matches EVERY set"
        );

        // Direct selections union with metaset members, and the lookup is case-insensitive
        // (the recipe spells the metaset "speedy").
        let mut mixed = parsed.recipes[1].artifact_set_ids.clone();
        mixed.sort_unstable();
        // Offense=2 direct; Speed=4, Lifesteal=9 and Swift Parry=35 from the metaset.
        assert_eq!(mixed, vec![2, 4, 9, 35], "direct + metaset members must union");
    }

    // A recipe's own substat roll TARGETS must survive the read.
    //
    // The app hands the builder `substatRollTargetsV`, whose `base`/`increments` set the
    // threshold ladder at each level milestone. The reader parsed the field and then dropped
    // it, so every recipe with a custom ladder silently fell back to the FACTORY minimum: a
    // 6-star amulet recipe asking for HP 300/600/.../1500 was built as 200/400/.../1000 and
    // kept gear the app sells. On a real sellfile 47 of 195 recipes set a ladder.
    //
    // Both persisted shapes are pinned: the current `{ base, increments }` and the legacy
    // `{ min }`, which names only the base.
    #[test]
    fn recipe_substat_roll_targets_are_read() {
        let sfc = r##"{
            "Version": "1.0",
            "Recipes": [
                {
                    "appearance": { "name": "Custom ladder" },
                    "keep": true,
                    "Rank": "6\u2605",
                    "Rarity": "Any",
                    "substats": [
                        { "stat": "HP", "rollBounds": { "any": true } },
                        { "stat": "SPD", "rollBounds": { "any": true } }
                    ],
                    "substatRollTargets": {
                        "HP": { "base": 300, "increments": [600, 900, 1200, 1500] },
                        "SPD": { "min": 2 }
                    },
                    "minCount": 1
                }
            ],
            "Safeguards": [],
            "SafeguardsEnabled": false
        }"##;
        let parsed = parse_sfc(sfc).expect("SFC must parse");
        let targets = &parsed.recipes[0].substat_roll_targets_v;

        // Current shape: base plus one increment per milestone above level 0.
        let hp = targets.get(&STAT_VARIANT_HP_FLAT).expect("HP target must be read");
        assert_eq!(
            hp.base,
            Some(300.0),
            "the recipe's own base must beat the factory minimum"
        );
        assert_eq!(
            hp.increments.as_deref(),
            Some(&[Some(600.0), Some(900.0), Some(1200.0), Some(1500.0)][..]),
            "the milestone ladder must survive verbatim"
        );

        // Legacy shape: `min` names the base and leaves the ladder unset.
        let spd = targets.get(&STAT_VARIANT_SPD).expect("legacy SPD target must be read");
        assert_eq!(spd.base, Some(2.0), "the legacy `min` key names the base");
        assert_eq!(spd.increments, None, "a legacy entry sets no ladder");
    }

    // The app writes the safeguard "ignore previous" flag under `ignorePreviousSafeguards_v2`;
    // the reader must read that key (with a fallback to the legacy un-suffixed name).
    #[test]
    fn safeguard_ignore_previous_reads_v2_key() {
        let base = r#"{
            "Version": "1.0", "Recipes": [], "Metasets": [], "SafeguardsEnabled": true,
            "Safeguards": [ { "activation": "protectExisting", "requiredCount": 1, KEY } ]
        }"#;
        // Current key form.
        let sfc_v2 = base.replace("KEY", r#""ignorePreviousSafeguards_v2": true"#);
        let parsed = parse_sfc(&sfc_v2).expect("v2 SFC must parse");
        assert_eq!(parsed.safeguard_rules.len(), 1);
        assert_eq!(
            parsed.safeguard_rules[0].ignore_previous_safeguards,
            Some(true),
            "ignorePreviousSafeguards_v2 must be read"
        );
        // Legacy key form still honoured as a fallback.
        let sfc_legacy = base.replace("KEY", r#""ignorePreviousSafeguards": true"#);
        let parsed = parse_sfc(&sfc_legacy).expect("legacy SFC must parse");
        assert_eq!(
            parsed.safeguard_rules[0].ignore_previous_safeguards,
            Some(true),
            "legacy ignorePreviousSafeguards must still be read as a fallback"
        );
    }
    // A safeguard rule that names ONLY a metaset must arrive with that metaset's member sets
    // expanded into its own set list. The bucket resolver builds its set gate purely from
    // `combination.sets`, so leaving the list empty reads as "no set gate" and the rule would
    // protect gear from every set instead of the three the metaset names.
    #[test]
    fn safeguard_metaset_only_combination_is_expanded_to_its_member_sets() {
        let sfc = r#"{
            "Version": "1.0", "Recipes": [], "SafeguardsEnabled": true,
            "Metasets": [ { "name": "Speedy", "setNames": ["Speed", "Life"] } ],
            "Safeguards": [ {
                "activation": "protectExisting", "requiredCount": 1,
                "combination": { "sets": [], "metaSetNames": ["Speedy"] }
            } ]
        }"#;
        let parsed = parse_sfc(sfc).expect("SFC must parse");
        let combination = parsed.safeguard_rules[0]
            .combination
            .as_ref()
            .expect("the rule must carry a combination");
        let mut ids: Vec<i64> = combination.sets.iter().map(|entry| entry.id).collect();
        ids.sort_unstable();
        let speed = set_id_from_name("Speed").expect("Speed is a catalog set");
        let life = set_id_from_name("Life").expect("Life is a catalog set");
        let mut want = vec![life, speed];
        want.sort_unstable();
        assert_eq!(ids, want, "the metaset's members must be expanded into the set gate");
        assert!(
            combination.sets.iter().all(|entry| !entry.excluded),
            "expanded members are inclusions"
        );
    }

    // Legacy files key metasets by `id` as well as name. The reader must accept that key —
    // rejecting it made the whole file unparseable while the app opens it fine.
    #[test]
    fn a_legacy_metaset_id_key_does_not_make_the_file_unreadable() {
        let sfc = r#"{
            "Version": "1.0", "Recipes": [], "Safeguards": [], "SafeguardsEnabled": false,
            "Metasets": [ { "id": "ms_3", "name": "Speedy", "setNames": ["Speed"] } ]
        }"#;
        let parsed = parse_sfc(sfc).expect("a file carrying the legacy metaset id must still parse");
        assert_eq!(parsed.metasets.len(), 1, "the metaset must survive the parse");
        assert_eq!(parsed.metasets[0].name, "Speedy");
    }

    // A legacy recipe references metasets by ID, not name. Treating the id as a name found no
    // metaset and left the recipe with no set filter at all — i.e. matching every set.
    #[test]
    fn legacy_recipe_metaset_ids_resolve_through_the_embedded_metaset_list() {
        let sfc = r#"{
            "Version": "1.0", "SafeguardsEnabled": false, "Safeguards": [],
            "Metasets": [ { "id": "ms_3", "name": "Speedy", "setNames": ["Speed", "Life"] } ],
            "Recipes": [ {
                "keep": true, "Rank": "Any", "Rarity": "Any",
                "artifactMetaSetIds": ["ms_3"],
                "substats": ["SPD"], "minCount": 1
            } ]
        }"#;
        let parsed = parse_sfc(sfc).expect("SFC must parse");
        let mut ids = parsed.recipes[0].artifact_set_ids.clone();
        ids.sort_unstable();
        let speed = set_id_from_name("Speed").expect("Speed is a catalog set");
        let life = set_id_from_name("Life").expect("Life is a catalog set");
        let mut want = vec![life, speed];
        want.sort_unstable();
        assert_eq!(ids, want, "the legacy metaset id must resolve to its members");
    }

    // A threshold that is present but unreadable must be an error, not an absent threshold:
    // silently dropping it makes detection skip the chance pass and every thresholded rule
    // quietly loses its protection expansion.
    #[test]
    fn a_malformed_improvement_chance_threshold_is_refused() {
        let sfc = r#"{
            "Version": "1.0", "Recipes": [], "Metasets": [], "SafeguardsEnabled": true,
            "Safeguards": [ {
                "activation": "protectExisting", "requiredCount": 1,
                "improvementChanceThreshold": "not-a-threshold"
            } ]
        }"#;
        // Matched rather than unwrapped: SfcParsed is not Debug, so expect_err cannot format it.
        let err = match parse_sfc(sfc) {
            Err(e) => e,
            Ok(_) => panic!("a malformed threshold must be refused"),
        };
        assert!(
            err.contains("improvementChanceThreshold"),
            "the error must name the offending field, got: {err}"
        );
    }

    // The star number comes from the LAST token, so a digit earlier in the label cannot be
    // mistaken for the rank. The first two cases cover every label the app writes; the third
    // pins the digit-selection fix specifically — a label carrying a prefix no longer starts
    // with the comparator, so it reads as an exact rank, but the STAR must still be the last
    // token's digit rather than the first one in the string.
    #[test]
    fn rank_label_reads_the_star_from_the_last_token() {
        assert_eq!(rank_code_from_label("\u{2265} 5\u{2605}"), RANK_CODE_GTE_FIVE);
        assert_eq!(rank_code_from_label("\u{2265} 2\u{2605}"), RANK_CODE_GTE_TWO);
        assert_eq!(
            rank_code_from_label("Tier 2 5\u{2605}"),
            RANK_CODE_FIVE,
            "the star must come from the last token, not the first digit in the label"
        );
    }
}

