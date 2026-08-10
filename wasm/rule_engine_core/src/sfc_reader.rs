// SFC (Sellfile Record) JSON reader for the native DLL.
//
// Mirrors the TypeScript `normalizeRecipe` + `normalizeSafeguardRule` functions
// in `sfcIO.ts` / `safeguards.ts`, converting human-readable label strings to the
// numeric codes consumed by the core builder functions.
//
// Label-to-code tables are derived from `generated_domain_constants.rs` and the
// same stat/slot/faction constant sets used by the TypeScript layer — no magic
// numbers inline.

use std::collections::BTreeMap;
use serde::{Deserialize, Serialize};

use crate::*;

// ---------------------------------------------------------------------------
// Stat variant label table (mirrors labelOfVariant / variantFromLabel in types.ts)
// ---------------------------------------------------------------------------

/// Map a human-readable stat label to the corresponding StatVariant numeric code.
/// Accepts common alternate spellings (case-insensitive).
pub fn stat_variant_from_label(label: &str) -> Option<i64> {
    // Normalise to lowercase for case-insensitive matching.
    let norm = label.trim().to_lowercase();
    match norm.as_str() {
        "spd" | "speed"                                         => Some(STAT_VARIANT_SPD),
        "cr%" | "crit rate" | "cr"                             => Some(STAT_VARIANT_CR),
        "cdmg%" | "crit dmg" | "c.dmg" | "cdmg"               => Some(STAT_VARIANT_CDMG),
        "res" | "res%"                                          => Some(STAT_VARIANT_RES),
        "acc" | "acc%"                                          => Some(STAT_VARIANT_ACC),
        "hp%" | "hp"                                            => {
            // Percent form (HP%) is the default for the two-form stats.
            if norm.contains('%') { Some(STAT_VARIANT_HP_PERCENT) } else { Some(STAT_VARIANT_HP_FLAT) }
        }
        "hp flat" | "hp (flat)"                                 => Some(STAT_VARIANT_HP_FLAT),
        "atk%" | "atk"                                          => {
            if norm.contains('%') { Some(STAT_VARIANT_ATK_PERCENT) } else { Some(STAT_VARIANT_ATK_FLAT) }
        }
        "atk flat" | "atk (flat)"                               => Some(STAT_VARIANT_ATK_FLAT),
        "def%" | "def"                                          => {
            if norm.contains('%') { Some(STAT_VARIANT_DEF_PERCENT) } else { Some(STAT_VARIANT_DEF_FLAT) }
        }
        "def flat" | "def (flat)"                               => Some(STAT_VARIANT_DEF_FLAT),
        "roll count" | "rolls" | "roll"                         => Some(STAT_VARIANT_ROLL_COUNT),
        _ => {
            // Fallback: check canonical label from generated constants.
            for &(variant, label) in STAT_VARIANT_DISPLAY_LABELS {
                if label.eq_ignore_ascii_case(&norm) { return Some(variant); }
            }
            // PROVISIONAL(anomalous): accept the placeholder anomalous-substat labels
            // ("PvE DMG +", ...) so SFC documents containing them keep parsing here
            // exactly like in the TS reader (Update 11.70 prep).
            for &(variant, label) in ANOMALOUS_SUBSTAT_LABELS {
                if label.eq_ignore_ascii_case(&norm) { return Some(variant); }
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
    let s = raw.trim()
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
    // Parse the star number from the last token (e.g. "5★" → 5).
    let star_digit = s.chars().filter(|c| c.is_ascii_digit()).next().and_then(|c| c.to_digit(10));
    let n = match star_digit { Some(d) => d as i64, None => return RANK_CODE_ANY };
    if s.starts_with("≥") {
        // ≥ n★ : codes 7..11 (n=1..5)
        match n { 1 => RANK_CODE_GTE_ONE, 2 => RANK_CODE_GTE_TWO, 3 => RANK_CODE_GTE_THREE, 4 => RANK_CODE_GTE_FOUR, 5 => RANK_CODE_GTE_FIVE, _ => RANK_CODE_ANY }
    } else if s.starts_with("≤") {
        // ≤ n★ : codes 12..16 (n=2..6)
        match n { 2 => RANK_CODE_LTE_TWO, 3 => RANK_CODE_LTE_THREE, 4 => RANK_CODE_LTE_FOUR, 5 => RANK_CODE_LTE_FIVE, 6 => RANK_CODE_LTE_SIX, _ => RANK_CODE_ANY }
    } else {
        // Exact n★ : codes 1..6
        match n { 1 => RANK_CODE_ONE, 2 => RANK_CODE_TWO, 3 => RANK_CODE_THREE, 4 => RANK_CODE_FOUR, 5 => RANK_CODE_FIVE, 6 => RANK_CODE_SIX, _ => RANK_CODE_ANY }
    }
}

// ---------------------------------------------------------------------------
// Rarity label parsing (mirrors rarityCodeToName / RarityCode in types.ts)
// ---------------------------------------------------------------------------

pub fn rarity_code_from_label(raw: &str) -> (i64, bool) {
    // Returns (rarity_code, is_auto).
    let s = raw.trim()
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
        "common"            => RARITY_CODE_COMMON,
        "uncommon"          => RARITY_CODE_UNCOMMON,
        "rare"              => RARITY_CODE_RARE,
        "epic"              => RARITY_CODE_EPIC,
        "legendary"         => RARITY_CODE_LEGENDARY,
        "mythical"          => RARITY_CODE_MYTHICAL,
        "≥ common"          => RARITY_CODE_GTE_COMMON,
        "≥ uncommon"        => RARITY_CODE_GTE_UNCOMMON,
        "≥ rare"            => RARITY_CODE_GTE_RARE,
        "≥ epic"            => RARITY_CODE_GTE_EPIC,
        "≤ uncommon"        => RARITY_CODE_LTE_UNCOMMON,
        "≤ rare"            => RARITY_CODE_LTE_RARE,
        "≤ epic"            => RARITY_CODE_LTE_EPIC,
        "≤ legendary"       => RARITY_CODE_LTE_LEGENDARY,
        "≤ mythical"        => RARITY_CODE_LTE_MYTHICAL,
        "≥ legendary"       => RARITY_CODE_GTE_LEGENDARY,
        _                   => RARITY_CODE_ANY,
    };
    (code, false)
}

// Rarity labels used in safeguard combinations (1..6 bucket values, not rarity codes).
// Maps "Common"→1 .. "Mythical"→6.
pub fn safeguard_rarity_value_from_label(raw: &str) -> Option<i64> {
    match raw.trim().to_lowercase().as_str() {
        "common"    => Some(1),
        "uncommon"  => Some(2),
        "rare"      => Some(3),
        "epic"      => Some(4),
        "legendary" => Some(5),
        "mythical"  => Some(6),
        _           => None,
    }
}

// ---------------------------------------------------------------------------
// Faction name → code (mirrors factionNames in types.ts)
// ---------------------------------------------------------------------------

pub fn faction_code_from_label(raw: &str) -> i64 {
    let s = raw.trim();
    if s.is_empty() || s.eq_ignore_ascii_case("any") { return 0; }
    // FACTION_NAME_IDS is sorted by name; use linear scan (16 entries — fast enough).
    for &(name, id) in FACTION_NAME_IDS {
        if name.eq_ignore_ascii_case(s) { return id; }
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
        if name.eq_ignore_ascii_case(s) { return Some(id); }
    }
    None
}

// ---------------------------------------------------------------------------
// Rank value (1..6) from safeguard tuple rank labels (same as exact rank codes)
// ---------------------------------------------------------------------------

pub fn rank_value_from_label(raw: &str) -> Option<i64> {
    let code = rank_code_from_label(raw);
    // Only accept exact ranks (1..6) for safeguard rank values.
    if code >= RANK_CODE_ONE && code <= RANK_CODE_SIX { Some(code) } else { None }
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
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadableMetaset {
    #[serde(default)]
    pub name: Option<String>,
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
    #[serde(default, rename = "artifactMetaSetNames", alias = "artifactMetaSetIds")]
    pub artifact_meta_set_names: Option<Vec<String>>,

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
    Object { id: i64, #[serde(default)] excluded: Option<bool> },
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
    pub recipes:            Vec<ReadableRecipeParsed>,
    pub safeguard_rules:    Vec<SafeguardWasmRuleIn>,
    pub safeguards_enabled: bool,
    pub final_sell:         Option<FinalSellRemainderIn>,
    pub all_known_set_ids:  Vec<i64>,
    pub minima:             Option<SubstatTargetTableIn>,
    pub metasets:           Vec<SafeguardWasmMetasetIn>,
}

/// Parsed recipe fields needed to call prepare_hsf_builder_recipe_core_fn +
/// build_hsf_rules_runtime_core_fn.
pub struct ReadableRecipeParsed {
    pub rank_code:          i64,
    pub rarity_code:        i64,
    pub rarity_mode:        Option<String>,   // Some("auto") when Auto rarity
    pub faction_code:       i64,
    pub keep:               bool,
    pub use_flag:           bool,             // false when Disabled
    pub is_separator:       bool,
    pub name:               String,
    pub main_stat_variants: Vec<i64>,         // StatVariant[]
    pub substats_v:         Vec<i64>,         // StatVariant[] — full selected pool
    pub fixed_substats_v:   Vec<i64>,         // StatVariant[] — locked substats
    pub substat_roll_bounds_v: BTreeMap<i64, BuildHsfComboBoundsIn>,
    pub substat_roll_targets_v: BTreeMap<i64, BuildHsfComboTargetEntryIn>,
    pub min_count:          i64,
    pub auto_min_count:     bool,
    pub auto_substat_flex:  bool,
    pub min_required_rolls: i64,
    pub auto_min_required_rolls: bool,
    pub locked_min_required_rolls: i64,
    pub min_level:          i64,
    pub max_level:          i64,
    pub artifact_type_ids:  Vec<i64>,
    pub artifact_set_ids:   Vec<i64>,         // included set IDs
    pub artifact_meta_set_names: Vec<String>,
    pub early_keep_mode:    String,           // "early" | "late"
    pub auto_rarity_supplements_threshold: Option<String>,
}

/// Minimal substat target table parsed from SFC Minima section.
// Default star used when a recipe targets "Any" rank (mirrors anyRankDefaultsTo ?? 6).
fn default_any_rank_star() -> i64 { 6 }

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SubstatTargetTableIn {
    #[serde(default)]
    pub one:   BTreeMap<i64, i64>,
    #[serde(default)]
    pub two:   BTreeMap<i64, i64>,
    #[serde(default)]
    pub three: BTreeMap<i64, i64>,
    #[serde(default)]
    pub four:  BTreeMap<i64, i64>,
    #[serde(default)]
    pub five:  BTreeMap<i64, i64>,
    #[serde(default)]
    pub six:   BTreeMap<i64, i64>,
    // Star bucket to use for "Any"-rank recipes (1..6); mirrors anyRankDefaultsTo in
    // sfcIO.ts. Defaults to 6 (strictest) when absent, matching coerceFallback.
    #[serde(default = "default_any_rank_star", rename = "anyRankDefaultsTo")]
    pub any_rank_defaults_to: i64,
}

// Hand-written Default so the fallback star defaults to 6, not i64's 0.
impl Default for SubstatTargetTableIn {
    fn default() -> Self {
        SubstatTargetTableIn {
            one:   BTreeMap::new(),
            two:   BTreeMap::new(),
            three: BTreeMap::new(),
            four:  BTreeMap::new(),
            five:  BTreeMap::new(),
            six:   BTreeMap::new(),
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
    let root: serde_json::Value = serde_json::from_str(sfc_text)
        .map_err(|e| format!("SFC JSON parse error: {e}"))?;

    // Bare array → wrap as Recipes list.
    let root = if root.is_array() {
        serde_json::json!({ "Recipes": root })
    } else {
        root
    };

    let sfc: ReadableSfc = serde_json::from_value(root)
        .map_err(|e| format!("SFC structure error: {e}"))?;

    // Parse metasets (used to expand set IDs in safeguard combinations).
    let metasets: Vec<SafeguardWasmMetasetIn> = sfc.metasets.as_deref().unwrap_or(&[])
        .iter()
        .filter_map(|m| {
            let name = m.name.as_deref()?.trim().to_string();
            if name.is_empty() { return None; }
            // Expand the metaset's member set names → ids via the generated catalog so
            // safeguard combinations referencing this metaset resolve to real sets.
            let sets: Vec<i64> = m.set_names.as_deref().unwrap_or(&[])
                .iter()
                .filter_map(|n| set_id_from_name(n))
                .collect();
            Some(SafeguardWasmMetasetIn { name, sets })
        })
        .collect();

    // Parse recipes.
    let raw_recipes = sfc.recipes.as_deref().unwrap_or(&[]);
    let mut parsed_recipes = Vec::with_capacity(raw_recipes.len());
    let mut all_set_ids: std::collections::HashSet<i64> = std::collections::HashSet::new();
    for (i, raw) in raw_recipes.iter().enumerate() {
        let recipe: ReadableRecipe = serde_json::from_value(raw.clone())
            .map_err(|e| format!("Recipe[{i}] parse error: {e}"))?;
        let parsed = parse_readable_recipe(&recipe)?;
        // Collect set IDs for allKnownSetIds.
        for &id in &parsed.artifact_set_ids {
            all_set_ids.insert(id);
        }
        parsed_recipes.push(parsed);
    }

    // Parse safeguard rules.
    let raw_safeguards = sfc.safeguards.as_deref().unwrap_or(&[]);
    let mut safeguard_rules = Vec::with_capacity(raw_safeguards.len());
    for (i, raw) in raw_safeguards.iter().enumerate() {
        match parse_sfc_safeguard_rule(raw) {
            Ok(rule) => safeguard_rules.push(rule),
            Err(e)   => return Err(format!("Safeguard[{i}] parse error: {e}")),
        }
    }

    // Parse final sell remainder.
    let final_sell = sfc.final_sell_remainder.as_ref().map(|fs| FinalSellRemainderIn {
        artifacts:   fs.artifacts.unwrap_or(false),
        accessories: fs.accessories.unwrap_or(false),
        levels:      fs.levels.clone().unwrap_or_default(),
        sets_mode:   fs.sets_mode.clone(),
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
        all_known_set_ids: all_set_ids.into_iter().collect(),
        minima,
        metasets,
    })
}

// ---------------------------------------------------------------------------
// Recipe normalisation
// ---------------------------------------------------------------------------

fn parse_readable_recipe(rec: &ReadableRecipe) -> Result<ReadableRecipeParsed, String> {
    // Determine export mode. `Separator: true` is the current marker; the
    // visibility label "Separator" is the legacy spelling (still accepted).
    let vis_raw = rec.visibility.as_deref()
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
    let main_stat_variants: Vec<i64> = rec.main_stats.as_deref().unwrap_or(&[])
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
            ReadableSubstat::Object { stat, fixed, roll_bounds, legacy_min, legacy_max, legacy_any } => {
                // Merge roll_bounds object with legacy flat fields.
                let eff_bounds = roll_bounds.clone().or_else(|| {
                    if legacy_min.is_some() || legacy_max.is_some() || legacy_any.is_some() {
                        Some(ReadableSubstatBoundsEntry { min: *legacy_min, max: *legacy_max, any_flag: *legacy_any, not: None })
                    } else {
                        None
                    }
                });
                (stat.as_str(), fixed.unwrap_or(false), eff_bounds)
            }
        };
        let Some(variant) = stat_variant_from_label(label) else { continue };
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
                substat_roll_bounds_v.insert(variant, BuildHsfComboBoundsIn {
                    min: None,
                    max: None,
                    any: None,
                    not: Some(true),
                });
                continue;
            }
            let min_val = b.min.map(|v| v.max(0.0).min(5.0).floor());
            let max_val = b.max.map(|v| v.max(0.0).min(4.0).floor());
            let any_flag = b.any_flag.unwrap_or(false);
            // Only record bounds when at least one constraint is meaningful.
            if min_val.map(|m| m > 0.0).unwrap_or(false) || max_val.is_some() || any_flag {
                substat_roll_bounds_v.insert(variant, BuildHsfComboBoundsIn {
                    min: min_val,
                    max: max_val,
                    any: if any_flag { Some(true) } else { None },
                    not: None,
                });
            }
        }
    }
    // Ensure fixed substats are in the selected pool.
    for &fv in &fixed_substats_v {
        if !substats_v.contains(&fv) { substats_v.push(fv); }
    }

    // Slot IDs.
    let artifact_type_ids: Vec<i64> = rec.artifact_type_names.as_deref().unwrap_or(&[])
        .iter()
        .filter_map(|name| slot_id_from_name(name))
        .collect();

    // Set IDs. The current app writes `artifactSetNames` (name-based); older files used
    // numeric `artifactSetIds`. Resolve names → ids via the generated catalog and merge
    // both sources. Excluded entries are filters we drop (an excluded set is not required).
    let mut artifact_set_ids: Vec<i64> = rec.artifact_set_names.as_deref().unwrap_or(&[])
        .iter()
        .filter(|entry| !entry.excluded.unwrap_or(false))
        .filter_map(|entry| entry.name.as_deref().and_then(set_id_from_name))
        .collect();
    // Legacy numeric entries (back-compat); append any not already present.
    for entry in rec.artifact_set_ids.as_deref().unwrap_or(&[]) {
        let id = match entry {
            ReadableArtifactSetEntry::Object { id, excluded } => {
                if excluded.unwrap_or(false) { continue; }
                *id
            }
            ReadableArtifactSetEntry::Id(id) => *id,
        };
        if !artifact_set_ids.contains(&id) {
            artifact_set_ids.push(id);
        }
    }

    let artifact_meta_set_names: Vec<String> = rec.artifact_meta_set_names.as_deref().unwrap_or(&[])
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    // Level window — clamp to valid milestones.
    let min_level = clamp_milestone(rec.min_level.unwrap_or(0));
    let max_level = clamp_milestone(rec.max_level.unwrap_or(16));
    let (min_level, max_level) = if min_level <= max_level { (min_level, max_level) } else { (max_level, min_level) };

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
    let auto_rarity_supplements_threshold = rec.auto_rarity_threshold.as_ref()
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
        name: rec.name.as_deref().unwrap_or("").to_string(),
        main_stat_variants,
        substats_v,
        fixed_substats_v,
        substat_roll_bounds_v,
        substat_roll_targets_v: BTreeMap::new(), // V1: targets parsed from Minima table elsewhere
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
        early_keep_mode,
        auto_rarity_supplements_threshold,
    })
}

/// Parse a safeguard rule entry from the SFC's Safeguards array.
/// The SFC stores these with readable labels; we convert to SafeguardWasmRuleIn.
fn parse_sfc_safeguard_rule(raw: &serde_json::Value) -> Result<SafeguardWasmRuleIn, String> {
    let rec = raw.as_object().ok_or("Safeguard rule is not a JSON object")?;

    // Separator entries persist minimally ({ appearance?, Separator: true }) and are pure
    // list dividers — parse them as inert activation="off" rules so the Safeguards array
    // indices stay aligned with the TS side and matching never sees them.
    if rec.get("Separator").and_then(|v| v.as_bool()).unwrap_or(false) {
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
        });
    }

    let id = rec.get("id").and_then(|v| v.as_str()).map(|s| s.trim().to_string());

    // Activation string is already in canonical form in the SFC ("protectExisting" etc.).
    let activation = rec.get("activation").and_then(|v| v.as_str()).map(|s| s.to_string());
    let required_count = rec.get("requiredCount").and_then(|v| v.as_i64());
    // The current app writes `ignorePreviousSafeguards_v2`; older files used the un-suffixed
    // key. Mirror safeguards.ts loader precedence: prefer _v2, fall back to the legacy name.
    // (Reading only the legacy key silently dropped the flag on every current .sfc.)
    let ignore_prev = rec.get("ignorePreviousSafeguards_v2")
        .or_else(|| rec.get("ignorePreviousSafeguards"))
        .and_then(|v| v.as_bool());
    let ignore_coll = rec.get("ignoreEquippedInCollection").and_then(|v| v.as_bool());
    let ignore_vault = rec.get("ignoreEquippedInVault").and_then(|v| v.as_bool());
    // "Weight by Rank" toggle; absent in older SFC files → None → treated as off downstream.
    let weight_main_stat_by_rank = rec.get("weightMainStatByRank").and_then(|v| v.as_bool());
    // Tunable main-stat rank bonus multiplier; absent in older SFC files → None → SSOT default (1.0).
    let main_stat_rank_weight_factor = rec
        .get("mainStatRankWeightFactor")
        .and_then(|v| v.as_f64());
    // Accept the per-level object form (current) or the resolved [f64;4] array form.
    // Legacy bare-number SFC files are normalized to the object form by sfcIO.ts at import,
    // so Rust never needs to handle that case here.
    let improvement_chance_threshold = rec.get("improvementChanceThreshold")
        .and_then(|v| serde_json::from_value::<ImprovementChanceThresholdIn>(v.clone()).ok());

    // Count mode (perRule / perSet / perFaction / perMainStat / perSlot booleans).
    let count_mode = rec.get("countMode").map(|v| {
        let o = v.as_object();
        SafeguardWasmCountMode {
            per_rule:      o.and_then(|m| m.get("perRule")).and_then(|v| v.as_bool()).unwrap_or(false),
            per_set:       o.and_then(|m| m.get("perSet")).and_then(|v| v.as_bool()).unwrap_or(true),
            per_faction:   o.and_then(|m| m.get("perFaction")).and_then(|v| v.as_bool()).unwrap_or(true),
            per_main_stat: o.and_then(|m| m.get("perMainStat")).and_then(|v| v.as_bool()).unwrap_or(true),
            per_slot:      o.and_then(|m| m.get("perSlot")).and_then(|v| v.as_bool()).unwrap_or(false),
        }
    });

    // Substats: stored as string label array in the SFC.
    let substats = rec.get("substats").and_then(|v| v.as_array()).map(|arr| {
        arr.iter()
            .filter_map(|v| v.as_str())
            .filter_map(|label| stat_variant_from_label(label))
            .collect::<Vec<i64>>()
    });
    let substats = if substats.as_ref().map(|v: &Vec<i64>| v.is_empty()).unwrap_or(true) { None } else { substats };

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
    let combination = rec.get("tuple")
        .or_else(|| rec.get("combination"))
        .map(|raw_tuple| parse_sfc_safeguard_combination(raw_tuple));

    // Tags: string array used by the safeguard-overrides DSL selector matching in TS.
    let tags = rec.get("tags").and_then(|v| v.as_array()).map(|arr| {
        arr.iter().filter_map(|v| v.as_str()).map(|s| s.to_string()).collect::<Vec<String>>()
    });
    let tags = if tags.as_ref().map(|v: &Vec<String>| v.is_empty()).unwrap_or(true) { None } else { tags };

    Ok(SafeguardWasmRuleIn {
        id,
        name: rec.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()),
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
    let slots = obj.and_then(|o| o.get("slots")).and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().and_then(slot_id_from_name)).collect())
        .unwrap_or_default();

    // Sets: the current app writes set names (e.g. {name:"Lifesteal"}); older files used
    // {id}. Resolve names via the generated set catalog (set_id_from_name) and accept
    // numeric ids for back-compat. The excluded flag is carried through either way.
    let sets = obj.and_then(|o| o.get("sets")).and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter().filter_map(|v| {
                let excluded = v.get("excluded").and_then(|e| e.as_bool()).unwrap_or(false);
                // Prefer a numeric id; else resolve the set name to an id.
                let id = v.get("id").and_then(|n| n.as_i64())
                    .or_else(|| v.get("name").and_then(|n| n.as_str()).and_then(set_id_from_name));
                id.map(|id| SafeguardWasmSetSelection { id, excluded })
            }).collect()
        })
        .unwrap_or_default();

    // Ranks: string rank labels → rank values (1..6).
    let ranks = obj.and_then(|o| o.get("ranks")).and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().and_then(rank_value_from_label)).collect())
        .unwrap_or_default();

    // Rarities: string rarity labels → rarity values (1..6).
    let rarities = obj.and_then(|o| o.get("rarities")).and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().and_then(safeguard_rarity_value_from_label)).collect())
        .unwrap_or_default();

    // Main stats: string labels → StatVariant.
    let main_stats = obj.and_then(|o| o.get("mainStats")).and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().and_then(stat_variant_from_label)).collect())
        .unwrap_or_default();

    // Factions: string names → faction IDs.
    let factions = obj.and_then(|o| o.get("factions")).and_then(|v| v.as_array())
        .map(|arr| arr.iter()
            .filter_map(|v| v.as_str())
            .map(faction_code_from_label)
            .filter(|&c| c != 0)
            .collect())
        .unwrap_or_default();

    // Metaset names passed through verbatim.
    let meta_set_names = obj.and_then(|o| o.get("metaSetNames")).and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str()).map(|s| s.to_string()).collect())
        .unwrap_or_default();

    SafeguardWasmCombination { slots, sets, meta_set_names, ranks, rarities, main_stats, factions }
}

// ---------------------------------------------------------------------------
// Substat target table parser (SFC Minima section)
// ---------------------------------------------------------------------------

// Coerce an anyRankDefaultsTo value (number 1..6 or the labels "one".."six" / "1".."6",
// case-insensitive) into a star. Mirrors coerceFallback in sfcIO.ts; unknown → 6.
fn coerce_any_rank_star(value: &serde_json::Value) -> i64 {
    if let Some(n) = value.as_i64() {
        if (1..=6).contains(&n) { return n; }
    }
    if let Some(s) = value.as_str() {
        match s.to_lowercase().as_str() {
            "one"   | "1" => return 1,
            "two"   | "2" => return 2,
            "three" | "3" => return 3,
            "four"  | "4" => return 4,
            "five"  | "5" => return 5,
            "six"   | "6" => return 6,
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
            "one"   => &mut table.one,
            "two"   => &mut table.two,
            "three" => &mut table.three,
            "four"  => &mut table.four,
            "five"  => &mut table.five,
            "six"   => &mut table.six,
            _       => continue,
        };
        if let Some(inner) = value.as_object() {
            for (stat_label, stat_val) in inner {
                if let (Some(variant), Some(val)) = (stat_variant_from_label(stat_label), stat_val.as_i64()) {
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

fn clamp_milestone(v: i64) -> i64 {
    // Snap to the nearest lower level milestone using generated constants.
    const MILESTONES: [i64; 5] = [LEVEL_MILESTONE_0, LEVEL_MILESTONE_4, LEVEL_MILESTONE_8, LEVEL_MILESTONE_12, LEVEL_MILESTONE_16];
    if MILESTONES.contains(&v) { return v; }
    for &m in MILESTONES.iter().rev() { if v >= m { return m; } }
    LEVEL_MILESTONE_0
}

fn clamp_roll_requirement(v: i64) -> i64 {
    v.clamp(0, SUBSTAT_MAX_ROLLS_PER_SLOT)
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
            ("SPD", STAT_VARIANT_SPD),   ("spd", STAT_VARIANT_SPD),
            ("CR%", STAT_VARIANT_CR),
            ("cr%", STAT_VARIANT_CR),    ("CDMG%", STAT_VARIANT_CDMG),
            ("RES", STAT_VARIANT_RES),   ("ACC", STAT_VARIANT_ACC),
            ("HP%", STAT_VARIANT_HP_PERCENT), ("HP", STAT_VARIANT_HP_FLAT),
            ("ATK%", STAT_VARIANT_ATK_PERCENT), ("ATK", STAT_VARIANT_ATK_FLAT),
            ("DEF%", STAT_VARIANT_DEF_PERCENT), ("DEF", STAT_VARIANT_DEF_FLAT),
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
            ("5★", RANK_CODE_FIVE),   ("5*", RANK_CODE_FIVE),
            ("6★", RANK_CODE_SIX),    ("1★", RANK_CODE_ONE),
            ("≥ 5★", RANK_CODE_GTE_FIVE), (">= 5*", RANK_CODE_GTE_FIVE),
            ("≥ 4★", RANK_CODE_GTE_FOUR), ("≤ 4★", RANK_CODE_LTE_FOUR),
            ("<= 4*", RANK_CODE_LTE_FOUR), ("Any", RANK_CODE_ANY),
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
            ("Epic",        RARITY_CODE_EPIC,         false),
            ("Legendary",   RARITY_CODE_LEGENDARY,    false),
            ("≥ Epic",      RARITY_CODE_GTE_EPIC,     false),
            (">= Epic",     RARITY_CODE_GTE_EPIC,     false),
            ("≤ Legendary", RARITY_CODE_LTE_LEGENDARY,false),
            ("Auto",        RARITY_CODE_ANY,           true),
            ("Any",         RARITY_CODE_ANY,           false),
            ("",            RARITY_CODE_ANY,           false),
        ];
        for &(input, expected_code, expected_auto) in cases {
            let (code, is_auto) = rarity_code_from_label(input);
            assert_eq!(code, expected_code,
                "rarity_code_from_label({input:?}).0 should be {expected_code}");
            assert_eq!(is_auto, expected_auto,
                "rarity_code_from_label({input:?}).1 (is_auto) should be {expected_auto}");
        }
    }

    // ── faction_code_from_label ───────────────────────────────────────────
    #[test]
    fn faction_code_canonical_labels() {
        // Vectors from shared/sfc-label-test-vectors.json — factionCodeFromLabel
        let cases: &[(&str, i64)] = &[
            ("Banner Lords",    1),  ("Barbarians",      13),
            ("Dwarves",         16), ("Knight Revenant", 12),
            ("Sylvan Watchers", 14), ("Argonites",       17),
            ("Any", 0), ("", 0),
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
            "SafeguardsEnabled": false
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
            parsed.safeguard_rules[0].ignore_previous_safeguards, Some(true),
            "ignorePreviousSafeguards_v2 must be read"
        );
        // Legacy key form still honoured as a fallback.
        let sfc_legacy = base.replace("KEY", r#""ignorePreviousSafeguards": true"#);
        let parsed = parse_sfc(&sfc_legacy).expect("legacy SFC must parse");
        assert_eq!(
            parsed.safeguard_rules[0].ignore_previous_safeguards, Some(true),
            "legacy ignorePreviousSafeguards must still be read as a fallback"
        );
    }
}
