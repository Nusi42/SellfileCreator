// Fast-path input structs and their conversion functions.
// These decode compact TS preview-row payloads into the canonical matcher shapes
// used throughout the safeguards module.
use serde::{Deserialize, Serialize};
// ts-rs trait import enables `#[derive(TS)]` on the input wire structs below.
use super::{
    SAFEGUARD_EQUIPPED_LOCATION_COLLECTION, SAFEGUARD_EQUIPPED_LOCATION_RESERVE_VAULT,
    SAFEGUARD_EQUIPPED_LOCATION_VAULT, SAFEGUARD_MAIN_ANY,
};
use crate::{SafeguardCandidateResolveBaseMatchIn, SafeguardCollectRowIn, TestItemRaw};
use ts_rs::TS;

// ts-rs export: nested by SafeguardWasmArtifactIn.substats.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmSubstatIn {
    pub variant: i64,
    #[serde(default)]
    pub is_flat: bool,
    pub value: f64,
    // Observed roll count for divisor computation in expected-gain estimation.
    pub rolls: Option<i64>,
}

// ts-rs export: top-level input artifact used across safeguard wasm entries.
#[derive(Debug, Deserialize, Serialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmArtifactIn {
    pub id: Option<i64>,
    pub slot: i64,
    pub set: i64,
    pub rank: i64,
    pub rarity: i64,
    pub level: i64,
    pub exact_level: Option<i64>,
    pub faction: i64,
    pub main_stat: i64,
    #[serde(default)]
    pub equipped_in_collection: bool,
    #[serde(default)]
    pub equipped_in_vault: bool,
    #[serde(default)]
    pub substats: Vec<SafeguardWasmSubstatIn>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SafeguardWasmCandidateIn {
    pub(super) item_key: i64,
    pub(super) bucket_key: String,
    pub(super) is_sold: bool,
    pub(super) artifact: SafeguardWasmArtifactIn,
}

// Fast-path main-stat decoder accepts either numeric variants or `{ variant }` records.
//
// ts-rs export: untagged enum → TS union `number | { variant?: number | null }`.
// ts-rs honors the serde(untagged) discriminant strategy and emits each variant
// inline without a tag field.
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(untagged)]
#[ts(export)]
pub enum SafeguardWasmMainStatRawIn {
    Variant(i64),
    Record {
        #[serde(default)]
        variant: Option<i64>,
    },
}

// Fast-path substat decoder accepts normalized preview payload fields directly.
//
// ts-rs export: nested by SafeguardWasmArtifactRawIn.substats.
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmSubstatRawIn {
    #[serde(default)]
    pub variant: i64,
    #[serde(default)]
    pub is_flat: bool,
    #[serde(default)]
    pub value: Option<f64>,
    #[serde(default)]
    pub total_value: Option<f64>,
    // Roll count for per-roll expected-gain computation; absent when artifact lacks roll data.
    #[serde(default)]
    pub rolls: Option<i64>,
}

// Nested champion reference carries only the fields safeguards read from the
// equipped-champion record (currently just `location`). Matches the TS
// ChampionLookupRecord nested shape on NormalizedGearArtifact.
//
// ts-rs export: nested by SafeguardWasmArtifactRawIn.equippedChampion.
#[derive(Debug, Deserialize, Clone, Default, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmEquippedChampionRawIn {
    #[serde(default)]
    pub location: Option<String>,
}

// Fast-path artifact decoder mirrors normalized gear inspector artifact payloads.
// The optional `gearInspectorItem` keeps row payloads compact when `item` is omitted.
// Made pub because SafeguardCollectRowFastIn/SafeguardWasmCandidateFastIn (also pub) embed it.
//
// ts-rs export: composes SafeguardWasmMainStatRawIn (untagged union),
// SafeguardWasmSubstatRawIn, SafeguardWasmEquippedChampionRawIn, and TestItemRaw.
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmArtifactRawIn {
    pub id: Option<i64>,
    pub slot: i64,
    pub set: i64,
    pub rank: i64,
    pub rarity: i64,
    pub level: i64,
    #[serde(default)]
    pub exact_level: Option<i64>,
    #[serde(default)]
    pub faction: i64,
    #[serde(default)]
    pub main_stat: Option<SafeguardWasmMainStatRawIn>,
    #[serde(default)]
    pub substats: Vec<SafeguardWasmSubstatRawIn>,
    // Nested champion reference; safeguards read `.location` to derive
    // collection/vault flags.
    #[serde(default)]
    pub equipped_champion: Option<SafeguardWasmEquippedChampionRawIn>,
    #[serde(default)]
    pub gear_inspector_item: Option<TestItemRaw>,
}

// Fast-path collect row payload mirrors normalized preview rows consumed in TS.
// Made pub so rule_engine_wasm can deserialize JsValue → Vec<SafeguardCollectRowFastIn>
// and pass the result to safeguard_parse_collect_rows_payload.
//
// ts-rs export: composes SafeguardWasmArtifactRawIn, TestItemRaw,
// SafeguardCandidateResolveBaseMatchIn.
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardCollectRowFastIn {
    pub artifact: SafeguardWasmArtifactRawIn,
    #[serde(default)]
    pub item: Option<TestItemRaw>,
    #[serde(default)]
    pub base_match_defined: Option<bool>,
    #[serde(default)]
    pub base_match: Option<SafeguardCandidateResolveBaseMatchIn>,
}

// Fast-path candidate payload mirrors compact safeguard candidate snapshots.
// Made pub so rule_engine_wasm can deserialize JsValue → Vec<SafeguardWasmCandidateFastIn>
// and pass the result to compute_safeguard_protection_core_pub.
//
// ts-rs export: composes SafeguardWasmArtifactRawIn.
#[derive(Debug, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardWasmCandidateFastIn {
    #[serde(default)]
    pub item_key: Option<i64>,
    #[serde(default)]
    pub bucket_key: Option<String>,
    #[serde(default)]
    pub is_sold: bool,
    pub artifact: SafeguardWasmArtifactRawIn,
}

// Fast-path main-stat extraction avoids `serde_json::Value` traversal on hot rows.
pub(super) fn safeguard_main_stat_from_fast_payload(value: Option<SafeguardWasmMainStatRawIn>) -> i64 {
    match value {
        Some(SafeguardWasmMainStatRawIn::Variant(variant)) => variant,
        Some(SafeguardWasmMainStatRawIn::Record { variant }) => variant.unwrap_or(SAFEGUARD_MAIN_ANY),
        None => SAFEGUARD_MAIN_ANY,
    }
}

// Fast-path substat conversion keeps finite numeric fallbacks deterministic.
pub(super) fn safeguard_substats_from_fast_payload(
    value: Vec<SafeguardWasmSubstatRawIn>,
) -> Vec<SafeguardWasmSubstatIn> {
    let mut out = Vec::<SafeguardWasmSubstatIn>::with_capacity(value.len());
    for substat in value {
        let numeric_value = substat
            .value
            .filter(|inner| inner.is_finite())
            .or_else(|| substat.total_value.filter(|inner| inner.is_finite()))
            .unwrap_or(0.0);
        // Clamp raw rolls to a non-negative integer; absent or invalid → None.
        let rolls = substat.rolls.filter(|&r| r >= 0).map(|r| r.max(0));
        out.push(SafeguardWasmSubstatIn {
            variant: substat.variant,
            is_flat: substat.is_flat,
            value: numeric_value,
            rolls,
        });
    }
    out
}

// Normalize raw equipped-location token into collection/vault flags.
// Reserve-vault is treated as vault for safeguard filtering purposes.
pub(super) fn safeguard_parse_equipped_location(raw: Option<&str>) -> (bool, bool) {
    let Some(location) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return (false, false);
    };
    if location.eq_ignore_ascii_case(SAFEGUARD_EQUIPPED_LOCATION_COLLECTION) {
        return (true, false);
    }
    if location.eq_ignore_ascii_case(SAFEGUARD_EQUIPPED_LOCATION_VAULT)
        || location.eq_ignore_ascii_case(SAFEGUARD_EQUIPPED_LOCATION_RESERVE_VAULT)
    {
        return (false, true);
    }
    (false, false)
}

// Convert fast-path artifacts into the canonical candidate/matcher artifact shape.
pub(super) fn safeguard_convert_fast_artifact(
    artifact: SafeguardWasmArtifactRawIn,
) -> (SafeguardWasmArtifactIn, Option<TestItemRaw>) {
    let (equipped_in_collection, equipped_in_vault) = safeguard_parse_equipped_location(
        artifact
            .equipped_champion
            .as_ref()
            .and_then(|champion| champion.location.as_deref()),
    );
    (
        SafeguardWasmArtifactIn {
            id: artifact.id,
            slot: artifact.slot,
            set: artifact.set,
            rank: artifact.rank,
            rarity: artifact.rarity,
            level: artifact.level,
            exact_level: artifact.exact_level,
            faction: artifact.faction,
            main_stat: safeguard_main_stat_from_fast_payload(artifact.main_stat),
            equipped_in_collection,
            equipped_in_vault,
            substats: safeguard_substats_from_fast_payload(artifact.substats),
        },
        artifact.gear_inspector_item,
    )
}

// Convert fast-path collect rows into matcher collect inputs with strict required-item checks.
pub(super) fn safeguard_collect_row_from_fast_payload(
    row: SafeguardCollectRowFastIn,
) -> Result<SafeguardCollectRowIn, String> {
    let (artifact, fallback_item) = safeguard_convert_fast_artifact(row.artifact);
    let item = row
        .item
        .or(fallback_item)
        .ok_or_else(|| "collect row requires item or artifact.gearInspectorItem".to_string())?;
    Ok(SafeguardCollectRowIn {
        item,
        base_match_defined: row.base_match_defined.unwrap_or(row.base_match.is_some()),
        base_match: row.base_match,
        artifact,
    })
}
