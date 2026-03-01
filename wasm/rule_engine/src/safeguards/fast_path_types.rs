// Fast-path input structs and their conversion functions.
// These decode compact TS preview-row payloads into the canonical matcher shapes
// used throughout the safeguards module.
use serde::{Deserialize, Serialize};
use super::{
    SAFEGUARD_EQUIPPED_LOCATION_COLLECTION,
    SAFEGUARD_EQUIPPED_LOCATION_RESERVE_VAULT,
    SAFEGUARD_EQUIPPED_LOCATION_VAULT,
    SAFEGUARD_MAIN_ANY,
};
use crate::{SafeguardCandidateResolveBaseMatchIn, SafeguardCollectRowIn, TestItemRaw};

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SafeguardWasmSubstatIn {
    pub(crate) variant: i64,
    #[serde(default)]
    pub(crate) is_flat: bool,
    pub(crate) value: f64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SafeguardWasmArtifactIn {
    pub(crate) id: Option<i64>,
    pub(crate) slot: i64,
    pub(crate) set: i64,
    pub(crate) rank: i64,
    pub(crate) rarity: i64,
    pub(crate) level: i64,
    pub(crate) exact_level: Option<i64>,
    pub(crate) faction: i64,
    pub(crate) main_stat: i64,
    #[serde(default)]
    pub(crate) equipped_in_collection: bool,
    #[serde(default)]
    pub(crate) equipped_in_vault: bool,
    #[serde(default)]
    pub(crate) substats: Vec<SafeguardWasmSubstatIn>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(super) struct SafeguardWasmCandidateIn {
    pub(super) item_key: i64,
    pub(super) group_key: String,
    pub(super) is_sold: bool,
    pub(super) artifact: SafeguardWasmArtifactIn,
}

// Fast-path main-stat decoder accepts either numeric variants or `{ variant }` records.
#[derive(Debug, Deserialize, Clone)]
#[serde(untagged)]
pub(super) enum SafeguardWasmMainStatRawIn {
    Variant(i64),
    Record {
        #[serde(default)]
        variant: Option<i64>,
    },
}

// Fast-path substat decoder accepts normalized preview payload fields directly.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(super) struct SafeguardWasmSubstatRawIn {
    #[serde(default)]
    pub(super) variant: i64,
    #[serde(default)]
    pub(super) is_flat: bool,
    #[serde(default)]
    pub(super) value: Option<f64>,
    #[serde(default)]
    pub(super) total_value: Option<f64>,
}

// Fast-path artifact decoder mirrors normalized gear inspector artifact payloads.
// The optional `gearInspectorItem` keeps row payloads compact when `item` is omitted.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(super) struct SafeguardWasmArtifactRawIn {
    pub(super) id: Option<i64>,
    pub(super) slot: i64,
    pub(super) set: i64,
    pub(super) rank: i64,
    pub(super) rarity: i64,
    pub(super) level: i64,
    #[serde(default)]
    pub(super) exact_level: Option<i64>,
    #[serde(default)]
    pub(super) faction: i64,
    #[serde(default)]
    pub(super) main_stat: Option<SafeguardWasmMainStatRawIn>,
    #[serde(default)]
    pub(super) substats: Vec<SafeguardWasmSubstatRawIn>,
    #[serde(default)]
    pub(super) equipped_champion_location: Option<String>,
    #[serde(default)]
    pub(super) gear_inspector_item: Option<TestItemRaw>,
}

// Fast-path collect row payload mirrors normalized preview rows consumed in TS.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(super) struct SafeguardCollectRowFastIn {
    pub(super) artifact: SafeguardWasmArtifactRawIn,
    #[serde(default)]
    pub(super) item: Option<TestItemRaw>,
    #[serde(default)]
    pub(super) base_match_defined: Option<bool>,
    #[serde(default)]
    pub(super) base_match: Option<SafeguardCandidateResolveBaseMatchIn>,
}

// Fast-path candidate payload mirrors compact safeguard candidate snapshots.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(super) struct SafeguardWasmCandidateFastIn {
    #[serde(default)]
    pub(super) item_key: Option<i64>,
    #[serde(default)]
    pub(super) group_key: Option<String>,
    #[serde(default)]
    pub(super) is_sold: bool,
    pub(super) artifact: SafeguardWasmArtifactRawIn,
}

// Fast-path main-stat extraction avoids `serde_json::Value` traversal on hot rows.
pub(super) fn safeguard_main_stat_from_fast_payload(value: Option<SafeguardWasmMainStatRawIn>) -> i64 {
    match value {
        Some(SafeguardWasmMainStatRawIn::Variant(variant)) => variant,
        Some(SafeguardWasmMainStatRawIn::Record { variant }) => {
            variant.unwrap_or(SAFEGUARD_MAIN_ANY)
        }
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
        out.push(SafeguardWasmSubstatIn {
            variant: substat.variant,
            is_flat: substat.is_flat,
            value: numeric_value,
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
        artifact.equipped_champion_location.as_deref(),
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
