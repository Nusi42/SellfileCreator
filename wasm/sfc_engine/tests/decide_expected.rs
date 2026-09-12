// decide_expected — assert this crate's FULL decision matches the app's, fixture by fixture.
//
// The sibling `parity.rs` pins the raw->compact ingest. This one pins everything after it:
// recipe rule building, safeguard detection, the merge, and the per-artifact verdict. That
// second half is where every DLL parity bug found so far actually lived — unexpanded recipe
// metasets, a catch-all built over the document's sets instead of the catalog, dropped
// per-recipe substat ladders, a percent main flagged flat, and safeguard thresholds that
// never reached detection. None of them were visible to an ingest-only test.
//
// The reference `decide_expected.json` is produced by
// tests/repro/native-dll-decide-expected.ts, which drives the APP's own modules (the same
// ones App.tsx and the rule-cache worker use). Both sides consume the same committed gear
// packets and the same .sfc fixtures, so a divergence means the two implementations really
// disagree rather than that the harness drifted. Regenerate with
// `npm run sfc-engine:decide-expected` — and only after confirming the NEW numbers are the
// correct ones, since regenerating silently blesses whatever the app currently does.

use std::collections::BTreeMap;

use serde::Deserialize;
use serde_json::Value;

use sfc_engine::artifact_log::{
    build_equipped_by_artifact_map, parse_artifact_log_array, RawArtifactLogRow, RawChampionRow,
};
use sfc_engine::pipeline::{decide_with, DecideOptions};

// Fixtures are included at compile time so the test is hermetic.
const ARTIFACTS_PACKET: &str = include_str!("fixtures/artifacts_packet.json");
const CHAMPIONS_PACKET: &str = include_str!("fixtures/champions_packet.json");
const EXPECTED_JSON: &str = include_str!("fixtures/decide_expected.json");

// The .sfc documents themselves live beside the app-side fixtures, so one copy feeds both.
const FIXTURE_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/fixtures/decide");

#[derive(Debug, Deserialize)]
struct ExpectedFile {
    fixtures: BTreeMap<String, ExpectedFixture>,
}

#[derive(Debug, Deserialize)]
struct ExpectedFixture {
    #[serde(rename = "ruleCount")]
    rule_count: usize,
    #[serde(rename = "bySource")]
    by_source: BTreeMap<String, usize>,
    verdicts: Vec<ExpectedVerdict>,
}

#[derive(Debug, Deserialize, PartialEq, Clone)]
struct ExpectedVerdict {
    #[serde(rename = "artifactId")]
    artifact_id: i64,
    keep: bool,
    matched: bool,
    safeguarded: bool,
}

// Pull the collection array out of a captured JSON-RPC frame.
fn extract_collection(frame: &str, key: &str) -> Value {
    let parsed: Value = serde_json::from_str(frame).expect("fixture must be valid JSON");
    parsed
        .get("params")
        .and_then(|p| p.get(key))
        .cloned()
        .unwrap_or_else(|| serde_json::json!([]))
}

#[test]
fn every_fixture_decides_exactly_as_the_app_does() {
    let expected: ExpectedFile = serde_json::from_str(EXPECTED_JSON).expect("expected fixture must parse");
    assert!(
        !expected.fixtures.is_empty(),
        "the expected file lists no fixtures; regenerate it with `npm run sfc-engine:decide-expected`"
    );

    // One ingest for every fixture — the gear is the same vault throughout.
    let raw_artifacts: Vec<RawArtifactLogRow> =
        serde_json::from_value(extract_collection(ARTIFACTS_PACKET, "artifacts")).expect("artifact rows");
    let raw_champions: Vec<RawChampionRow> =
        serde_json::from_value(extract_collection(CHAMPIONS_PACKET, "champions")).expect("champion rows");
    let compact = parse_artifact_log_array(&raw_artifacts, &build_equipped_by_artifact_map(&raw_champions));

    for (name, want) in &expected.fixtures {
        let path = std::path::Path::new(FIXTURE_DIR).join(name);
        let sfc = std::fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("fixture {name} must be readable at {}: {e}", path.display()));

        // `rules: true` so the rule composition can be compared, not just the verdicts.
        let outcome = decide_with(&sfc, &compact, DecideOptions { rules: true, ..DecideOptions::default() })
            .unwrap_or_else(|e| panic!("{name}: decision chain failed: {e}"));

        // Rule composition first: a build-side drift that happens not to move a verdict on
        // this small vault is still a divergence, and it points at the cause far better than
        // a verdict mismatch does.
        let mut by_source: BTreeMap<String, usize> = BTreeMap::new();
        for rule in &outcome.rules {
            // The app labels an un-sourced rule "recipe"; mirror that so the maps compare.
            let key = rule.source.as_deref().unwrap_or("recipe").to_string();
            *by_source.entry(key).or_default() += 1;
        }
        assert_eq!(
            by_source, want.by_source,
            "{name}: rule composition differs from the app's (left = this crate)"
        );
        assert_eq!(
            outcome.rules.len(),
            want.rule_count,
            "{name}: merged rule count differs from the app's"
        );

        // Then the answer itself, artifact by artifact.
        let mut got: Vec<ExpectedVerdict> = outcome
            .verdicts
            .iter()
            .map(|v| ExpectedVerdict {
                artifact_id: v.artifact_id,
                keep: v.keep,
                matched: v.matched,
                safeguarded: v.safeguarded,
            })
            .collect();
        got.sort_by_key(|v| v.artifact_id);
        // Sort the EXPECTATION too, not just the computed side. The fixtures happen to be
        // generated in artifact-id order today, so zipping the raw list passes — but the day
        // the generator emits a different order this gate would report spurious per-artifact
        // mismatches, and the tempting "fix" is to regenerate the fixture, which blesses
        // whatever the DLL currently does. Comparing two sorted lists cannot drift that way.
        let mut want_verdicts = want.verdicts.clone();
        want_verdicts.sort_by_key(|v| v.artifact_id);

        assert_eq!(
            got.len(),
            want_verdicts.len(),
            "{name}: verdict count differs from the app's"
        );
        for (got_verdict, want_verdict) in got.iter().zip(want_verdicts.iter()) {
            assert_eq!(
                got_verdict, want_verdict,
                "{name}: artifact {} decided differently from the app",
                want_verdict.artifact_id
            );
        }
    }
}
