// artifact_log — raw RSL-Helper wire format → compact artifact row normaliser.
//
// RSL Helper hands the DLL the SAME raw JSON-RPC payload it sends over its endpoint
// (kindId/rankId/rarityId/primary/secondary/statValue, plus a separate `champions`
// array whose per-instance `artifacts` slot-map says which champion equips each item).
// It does NOT run the app's TypeScript, so the raw→compact normalisation the app does
// in `src/lib/externalCommands.ts` must be reproduced here.
//
// This is a deliberate, user-approved port of that TypeScript. The parity test
// (`tests/parity.rs` + `tests/repro/native-dll-realdata-input.ts`) asserts this module
// and the TS produce the same compact rows (on the DLL-consumed fields) from the same
// real captured packet — if they drift, the test fails.
//
// SSOT references (keep in sync — the parity test guards them):
//   parseArtifactLogRow / parseArtifactLogArray / isInboxItemEnvelope
//     — src/lib/externalCommands.ts:288-388
//   buildEquippedByArtifactMap — src/lib/externalCommands.ts:394-414
//   toNumber (JS Number() coercion) — src/lib/externalCommands.ts:117-121
//   accset→faction resolution — resolve_accessory_faction (generated_domain_constants)

use std::collections::BTreeMap;

use serde::Deserialize;
use serde_json::Value;

use rule_engine_core::resolve_accessory_faction;

// ---------------------------------------------------------------------------
// Compact artifact row — the DLL's internal normalised shape.
// ---------------------------------------------------------------------------

// Produced by the parser and consumed by normalize_artifact in lib.rs. Mirrors the
// subset of the app's GearDbArtifactRow that the DLL pipeline actually reads. Field
// names match the TS compact columns so the parity projection lines up 1:1.
#[derive(Debug, Clone, PartialEq)]
pub struct NativeArtifactIn {
    // Artifact ID (primary key; used in ImprovementChanceEntry.artifact_id).
    pub id: Option<i64>,
    // Slot id matching ArtifactType enum (1=Weapon … 9=Banner).
    pub slot: i64,
    // Star rank (1–6).
    pub rank: Option<i64>,
    // Rarity code (1=Common … 6=Legendary).
    pub rarity: Option<i64>,
    // Level milestone (0 / 4 / 8 / 12 / 16); raw level preserved verbatim (no snapping here).
    pub lvl: Option<i64>,
    // Chaos Ore rework count (0 = never reworked). Drives the if_reworked / if_not_reworked
    // rule gate via TestItemRaw.reroll_count; the name mirrors the DB column REROLLCOUNT.
    pub reroll_count: Option<i64>,
    // Set id for artifact slots (slot ≤ 6).
    pub aset: Option<i64>,
    // Set id for accessory slots (slot > 6) — carries the raw requiredFraction code.
    pub accset: Option<i64>,
    // Main stat numeric id.
    pub mid: Option<i64>,
    // Main stat flat flag (0 = percentage, 1 = flat).
    pub mfl: Option<i64>,
    // Substats: id / roll-count / flat flag for slots 1–4.
    pub s1id: Option<i64>,
    pub s1lvl: Option<i64>,
    pub s1fl: Option<i64>,
    pub s2id: Option<i64>,
    pub s2lvl: Option<i64>,
    pub s2fl: Option<i64>,
    pub s3id: Option<i64>,
    pub s3lvl: Option<i64>,
    pub s3fl: Option<i64>,
    pub s4id: Option<i64>,
    pub s4lvl: Option<i64>,
    pub s4fl: Option<i64>,
    // Equipped champion id — Some(id>0) marks the artifact equipped_in_collection.
    pub c_id: Option<i64>,
    // Pre-resolved faction id (from accset via resolve_accessory_faction); 0 = Any.
    pub faction: i64,
}

// ---------------------------------------------------------------------------
// Raw wire types — mirror the ArtifactLog / champion shapes RSL Helper sends.
// serde(default) everywhere so partial/garbage rows deserialise instead of erroring;
// the reject gate + toNumber defaults below reproduce the TS tolerance exactly.
// ---------------------------------------------------------------------------

// One primary/secondary/ascend stat block. Values kept as raw serde_json::Value so
// to_number() can reproduce JS Number() coercion (numeric strings included).
//
// The DLL pipeline consumes only id/level/isAbsolute (presence-based substat matching);
// stat_value/glyph_value/m_value are declared to faithfully mirror the wire shape and
// document it, but are not read — hence `dead_code` is allowed for them.
#[derive(Debug, Default, Deserialize)]
pub struct RawStatBlock {
    #[serde(default)]
    pub id: Value,
    #[serde(default)]
    pub level: Value,
    #[serde(default, rename = "isAbsolute")]
    pub is_absolute: Value,
    #[serde(default, rename = "statValue")]
    #[allow(dead_code)]
    pub stat_value: Value,
    #[serde(default, rename = "glyphValue")]
    #[allow(dead_code)]
    pub glyph_value: Value,
    #[serde(default, rename = "mValue")]
    #[allow(dead_code)]
    pub m_value: Value,
}

// A raw ArtifactLog row (the `artifacts` / `inboxArtifacts` element). Also serves as
// the inbox-item envelope shape: an envelope carries `artifacts` (nested rows) and
// lacks a top-level `kindId`.
#[derive(Debug, Default, Deserialize)]
pub struct RawArtifactLogRow {
    #[serde(default)]
    pub id: Value,
    #[serde(default, rename = "kindId")]
    pub kind_id: Value,
    #[serde(default, rename = "rankId")]
    pub rank_id: Value,
    #[serde(default, rename = "rarityId")]
    pub rarity_id: Value,
    #[serde(default, rename = "setKindId")]
    pub set_kind_id: Value,
    #[serde(default, rename = "requiredFraction")]
    pub required_fraction: Value,
    #[serde(default)]
    pub level: Value,
    // Chaos Ore rework counter. RSL Helper spells it `rerollsCount` on the wire; the
    // TS importer folds it into the REROLLCOUNT column, which feeds the rule Ore gate.
    #[serde(default, rename = "rerollsCount")]
    pub rerolls_count: Value,
    #[serde(default)]
    pub primary: Option<RawStatBlock>,
    #[serde(default)]
    pub secondary: Vec<RawStatBlock>,
    // Inbox-item envelope: a nested row array under `artifacts` (present only on envelopes).
    #[serde(default)]
    pub artifacts: Option<Vec<RawArtifactLogRow>>,
}

// A raw champion row — only the fields needed for the artifact→champion join. The
// endpoint sends lowercase `id`; `artifacts` maps slot number (string key) → artifact id.
#[derive(Debug, Default, Deserialize)]
pub struct RawChampionRow {
    #[serde(default, alias = "ID")]
    pub id: Value,
    #[serde(default)]
    pub artifacts: BTreeMap<String, Value>,
}

// ---------------------------------------------------------------------------
// toNumber — reproduce the TS `toNumber` (JS Number() coercion) exactly.
// null/undefined → None; numbers pass through; strings parse like Number("…")
// (trimmed, empty string → 0, non-numeric → None via NaN); bools/other → None.
// ---------------------------------------------------------------------------

pub fn to_number(value: &Value) -> Option<f64> {
    match value {
        // null / absent → null in TS.
        Value::Null => None,
        // Numbers pass through when finite (JSON can't hold NaN/Inf, but guard anyway).
        Value::Number(n) => n.as_f64().filter(|f| f.is_finite()),
        // JS Number(str): trim; "" → 0; otherwise parse, non-numeric → NaN → None.
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                Some(0.0)
            } else {
                trimmed.parse::<f64>().ok().filter(|f| f.is_finite())
            }
        }
        // Objects, arrays, and booleans are never valid numeric fields here → None.
        _ => None,
    }
}

// Convenience: to_number then floor-to-i64 with a `?? default` fallback, matching the
// TS `toNumber(x) ?? 0` idiom for the integer compact columns.
fn to_i64_or(value: &Value, default: i64) -> i64 {
    to_number(value).map(|f| f as i64).unwrap_or(default)
}

// ---------------------------------------------------------------------------
// Equipped-champion map — invert champions[].artifacts into artifactId → championId.
// Port of buildEquippedByArtifactMap (externalCommands.ts:394-414): iterate slot-map
// VALUES (slot keys ignored), skip ids ≤ 0, keep last-writer-wins like Map.set.
// ---------------------------------------------------------------------------

pub fn build_equipped_by_artifact_map(champions: &[RawChampionRow]) -> BTreeMap<i64, i64> {
    let mut map = BTreeMap::new();
    for champ in champions {
        // Champion id may be `id` (endpoint) or `ID` (SQL dump); resolved via serde alias.
        let champion_id = to_i64_or(&champ.id, 0);
        // Skip rows without a positive champion id (mirrors the TS `!championId || <=0`).
        if champion_id <= 0 {
            continue;
        }
        for artifact_value in champ.artifacts.values() {
            let aid = to_i64_or(artifact_value, 0);
            // Empty/zero slots are not equipped.
            if aid <= 0 {
                continue;
            }
            map.insert(aid, champion_id);
        }
    }
    map
}

// ---------------------------------------------------------------------------
// Parse one raw ArtifactLog row → compact NativeArtifactIn.
// Port of parseArtifactLogRow (externalCommands.ts:314-388). Returns None when the
// reject gate fires (missing/non-positive id, kindId, rankId or rarityId).
// ---------------------------------------------------------------------------

fn parse_artifact_log_row(
    row: &RawArtifactLogRow,
    equipped_by_artifact: &BTreeMap<i64, i64>,
) -> Option<NativeArtifactIn> {
    // Reject gate: id/kindId/rankId/rarityId must all be present AND > 0.
    let id = to_number(&row.id)?;
    let slot = to_number(&row.kind_id)?;
    let rank = to_number(&row.rank_id)?;
    let rarity = to_number(&row.rarity_id)?;
    if id <= 0.0 || slot <= 0.0 || rank <= 0.0 || rarity <= 0.0 {
        return None;
    }
    let id = id as i64;

    // Primary stat block (absent → empty block; every field then defaults via to_number).
    let primary = row.primary.as_ref();
    let primary_field = |f: fn(&RawStatBlock) -> &Value| primary.map(f).unwrap_or(&Value::Null);

    // cID: equipped champion id from the join, else 0 → stored as Some(id>0)/None so
    // normalize_artifact's `c_id.is_some()` reflects equipped_in_collection correctly.
    let c_id = equipped_by_artifact.get(&id).copied().filter(|&c| c > 0);

    let mut result = NativeArtifactIn {
        id: Some(id),
        slot: slot as i64,
        rank: Some(rank as i64),
        rarity: Some(rarity as i64),
        lvl: Some(to_i64_or(&row.level, 0)),
        // Mirrors the TS `toNumber(row.rerollsCount) ?? 0` fold into REROLLCOUNT.
        reroll_count: Some(to_i64_or(&row.rerolls_count, 0)),
        aset: Some(to_i64_or(&row.set_kind_id, 0)),
        accset: Some(to_i64_or(&row.required_fraction, 0)),
        mid: Some(to_i64_or(primary_field(|p| &p.id), 0)),
        mfl: Some(to_i64_or(primary_field(|p| &p.is_absolute), 0)),
        s1id: Some(0),
        s1lvl: Some(0),
        s1fl: Some(0),
        s2id: Some(0),
        s2lvl: Some(0),
        s2fl: Some(0),
        s3id: Some(0),
        s3lvl: Some(0),
        s3fl: Some(0),
        s4id: Some(0),
        s4lvl: Some(0),
        s4fl: Some(0),
        c_id,
        // Resolve faction from the raw accessory code (SSOT generated map); 0 = Any.
        // Gated on accessory slots (slot > 6) to mirror determineFaction's isAccessorySlot
        // check in gearDbNormalizer.ts — non-accessory slots never carry a faction.
        faction: if (slot as i64) > 6 {
            resolve_accessory_faction(to_i64_or(&row.required_fraction, 0))
        } else {
            0
        },
    };

    // Flatten up to four substats into the s{n}id/s{n}lvl/s{n}fl columns.
    // Missing slots default every field to 0 (mirrors the TS `stat?.… ?? 0`).
    let slots: [(&mut Option<i64>, &mut Option<i64>, &mut Option<i64>); 4] = [
        (&mut result.s1id, &mut result.s1lvl, &mut result.s1fl),
        (&mut result.s2id, &mut result.s2lvl, &mut result.s2fl),
        (&mut result.s3id, &mut result.s3lvl, &mut result.s3fl),
        (&mut result.s4id, &mut result.s4lvl, &mut result.s4fl),
    ];
    for (index, (id_col, lvl_col, fl_col)) in slots.into_iter().enumerate() {
        let stat = row.secondary.get(index);
        let field = |f: fn(&RawStatBlock) -> &Value| stat.map(f).unwrap_or(&Value::Null);
        *id_col = Some(to_i64_or(field(|s| &s.id), 0));
        *lvl_col = Some(to_i64_or(field(|s| &s.level), 0));
        *fl_col = Some(to_i64_or(field(|s| &s.is_absolute), 0));
    }

    Some(result)
}

// ---------------------------------------------------------------------------
// Parse a raw ArtifactLog array → compact rows.
// Port of parseArtifactLogArray + isInboxItemEnvelope (externalCommands.ts:288-311):
// flatten inbox-item envelopes into their nested rows, pass flat rows through, drop
// rows the reject gate rejects.
// ---------------------------------------------------------------------------

pub fn parse_artifact_log_array(
    rows: &[RawArtifactLogRow],
    equipped_by_artifact: &BTreeMap<i64, i64>,
) -> Vec<NativeArtifactIn> {
    let mut out = Vec::new();
    for entry in rows {
        // An inbox-item envelope carries a nested `artifacts` array AND lacks a kindId.
        let is_envelope = entry.artifacts.is_some() && to_number(&entry.kind_id).is_none();
        if is_envelope {
            // Flatten the envelope's nested rows (may be zero or several).
            if let Some(nested) = entry.artifacts.as_ref() {
                for candidate in nested {
                    if let Some(compact) = parse_artifact_log_row(candidate, equipped_by_artifact) {
                        out.push(compact);
                    }
                }
            }
        } else if let Some(compact) = parse_artifact_log_row(entry, equipped_by_artifact) {
            out.push(compact);
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Unit tests — pin the toNumber coercion + parser edge cases that parity depends on.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn to_number_matches_js_coercion() {
        assert_eq!(to_number(&json!(5)), Some(5.0));
        assert_eq!(to_number(&json!(5.5)), Some(5.5));
        assert_eq!(to_number(&json!("7")), Some(7.0)); // numeric string
        assert_eq!(to_number(&json!("")), Some(0.0)); // Number("") === 0
        assert_eq!(to_number(&json!("  9 ")), Some(9.0)); // trimmed
        assert_eq!(to_number(&json!("abc")), None); // NaN → null
        assert_eq!(to_number(&Value::Null), None);
        assert_eq!(to_number(&json!(true)), None); // bools are not numbers here
    }

    #[test]
    fn reject_gate_drops_incomplete_rows() {
        let equipped = BTreeMap::new();
        // Missing rarityId → rejected.
        let row: RawArtifactLogRow = serde_json::from_value(json!({ "id": 1, "kindId": 1, "rankId": 5 })).unwrap();
        assert!(parse_artifact_log_row(&row, &equipped).is_none());
        // Zero id → rejected.
        let row: RawArtifactLogRow =
            serde_json::from_value(json!({ "id": 0, "kindId": 1, "rankId": 5, "rarityId": 4 })).unwrap();
        assert!(parse_artifact_log_row(&row, &equipped).is_none());
    }

    #[test]
    fn substats_and_faction_and_cid() {
        // Champion 900 equips artifact 100.
        let champions: Vec<RawChampionRow> =
            serde_json::from_value(json!([{ "id": 900, "artifacts": { "7": 100 } }])).unwrap();
        let equipped = build_equipped_by_artifact_map(&champions);
        assert_eq!(equipped.get(&100), Some(&900));

        // Accessory (slot 7 = Ring) with requiredFraction 4 → Barbarians alias (13).
        let row: RawArtifactLogRow = serde_json::from_value(json!({
            "id": 100, "kindId": 7, "rankId": 6, "rarityId": 5, "level": 16,
            "requiredFraction": 4, "setKindId": 0,
            "primary": { "id": 3, "isAbsolute": 1 },
            "secondary": [ { "id": 4, "level": 4, "isAbsolute": 1 }, { "id": 6, "level": 0, "isAbsolute": 1 } ]
        }))
        .unwrap();
        let compact = parse_artifact_log_row(&row, &equipped).expect("row should parse");
        assert_eq!(compact.slot, 7);
        assert_eq!(compact.faction, 13); // 4 → Barbarians alias
        assert_eq!(compact.c_id, Some(900)); // equipped
        assert_eq!(compact.s1id, Some(4));
        assert_eq!(compact.s1lvl, Some(4));
        assert_eq!(compact.s2id, Some(6));
        assert_eq!(compact.s3id, Some(0)); // empty slot defaults to 0
        assert_eq!(compact.mid, Some(3));
    }

    #[test]
    fn inbox_envelope_is_flattened() {
        let equipped = BTreeMap::new();
        // Envelope: has `artifacts`, no top-level kindId → unwrap the nested row.
        let rows: Vec<RawArtifactLogRow> = serde_json::from_value(json!([
            { "inboxItemId": 5, "artifacts": [
                { "id": 200, "kindId": 2, "rankId": 5, "rarityId": 4 }
            ] }
        ]))
        .unwrap();
        let out = parse_artifact_log_array(&rows, &equipped);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].id, Some(200));
    }
}
