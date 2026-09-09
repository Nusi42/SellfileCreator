// parity — assert the Rust raw→compact normaliser matches the TypeScript app's ingest,
// field-for-field on the DLL-consumed columns, over a real captured slice.
//
// The reference `expected.json` is produced by tests/repro/native-dll-parity-expected.ts
// (the app's own normalizeExternalEvent + champions cID join + accset→faction resolve).
// The same two captured packets drive both sides. If the Rust parser drifts from the TS,
// this test fails. Regenerate the fixtures via `npm run native-dll:parity`.
//
// Field-subset scope (per plan): only the columns the DLL pipeline consumes —
// ID/type/rank/rarity/lvl/aset/accset/mid/mfl/s{1..4}{id,lvl,fl}/cID/faction.

use std::collections::BTreeMap;

use serde_json::{json, Value};

// The parity test drives the crate's raw→compact normaliser directly.
use rule_engine_native::artifact_log::{
    build_equipped_by_artifact_map, parse_artifact_log_array, RawArtifactLogRow, RawChampionRow,
};

// Fixtures live next to this test file; include them at compile time so the test is hermetic.
const ARTIFACTS_PACKET: &str = include_str!("fixtures/artifacts_packet.json");
const CHAMPIONS_PACKET: &str = include_str!("fixtures/champions_packet.json");
const EXPECTED_JSON: &str = include_str!("fixtures/expected.json");

// Pull the collection array out of a captured JSON-RPC frame ({ params: { <key>: [...] } }).
fn extract_collection(frame: &str, key: &str) -> Value {
    let parsed: Value = serde_json::from_str(frame).expect("fixture must be valid JSON");
    parsed
        .get("params")
        .and_then(|p| p.get(key))
        .cloned()
        .unwrap_or_else(|| json!([]))
}

// Project one compact row to the same DLL-consumed subset the TS projector emits, as a
// canonical serde_json::Value so the two can be compared structurally (order-independent).
fn project(row: &rule_engine_native::artifact_log::NativeArtifactIn) -> Value {
    // c_id is Some(id>0) when equipped; the TS reference uses 0 for unequipped.
    let cid = row.c_id.unwrap_or(0);
    json!({
        "ID": row.id.unwrap_or(0),
        "type": row.slot,
        "rank": row.rank.unwrap_or(0),
        "rarity": row.rarity.unwrap_or(0),
        "lvl": row.lvl.unwrap_or(0),
        "aset": row.aset.unwrap_or(0),
        "accset": row.accset.unwrap_or(0),
        "mid": row.mid.unwrap_or(0),
        "mfl": row.mfl.unwrap_or(0),
        "s1id": row.s1id.unwrap_or(0), "s1lvl": row.s1lvl.unwrap_or(0), "s1fl": row.s1fl.unwrap_or(0),
        "s2id": row.s2id.unwrap_or(0), "s2lvl": row.s2lvl.unwrap_or(0), "s2fl": row.s2fl.unwrap_or(0),
        "s3id": row.s3id.unwrap_or(0), "s3lvl": row.s3lvl.unwrap_or(0), "s3fl": row.s3fl.unwrap_or(0),
        "s4id": row.s4id.unwrap_or(0), "s4lvl": row.s4lvl.unwrap_or(0), "s4fl": row.s4fl.unwrap_or(0),
        "cID": cid,
        "faction": row.faction,
        // Ore rework counter — feeds the if_reworked / if_not_reworked rule gate.
        "REROLLCOUNT": row.reroll_count.unwrap_or(0),
    })
}

#[test]
fn rust_normaliser_matches_ts_reference() {
    // Parse the raw fixture packets into the wire types.
    let raw_artifacts: Vec<RawArtifactLogRow> =
        serde_json::from_value(extract_collection(ARTIFACTS_PACKET, "artifacts"))
            .expect("artifacts fixture must deserialise");
    let raw_champions: Vec<RawChampionRow> = serde_json::from_value(extract_collection(CHAMPIONS_PACKET, "champions"))
        .expect("champions fixture must deserialise");

    // Run the same pipeline the DLL runs: build equipped map, then normalise.
    let equipped: BTreeMap<i64, i64> = build_equipped_by_artifact_map(&raw_champions);
    let compact = parse_artifact_log_array(&raw_artifacts, &equipped);

    // Reference rows from the TS app.
    let expected: Vec<Value> = serde_json::from_str(EXPECTED_JSON).expect("expected.json must be valid");

    // Same count (both preserve input order and apply the same reject gate).
    assert_eq!(
        compact.len(),
        expected.len(),
        "row count mismatch: rust={} ts={}",
        compact.len(),
        expected.len()
    );

    // Compare row-by-row on the projected subset; report the first divergence precisely.
    for (index, (row, want)) in compact.iter().zip(expected.iter()).enumerate() {
        let got = project(row);
        assert_eq!(&got, want, "parity mismatch at row {index} (artifact id {:?})", row.id);
    }
}
