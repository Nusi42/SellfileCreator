// bench_pipeline — stage-by-stage timing of the decision pipeline on a real-sized vault.
//
// §7 of the DLL brief makes the caching decision a MEASURED one: ship stateless if the
// full chain lands under ~500 ms, and only design a session handle if it runs into
// seconds. This binary produces that number, split per stage so a regression points at
// the stage that caused it rather than at the total.
//
// Usage:
//   cargo run --release -p sfc_engine --example bench_pipeline -- \
//     <sfc-path> <artifacts.json> <champions.json>
//
// The artifact/champion files are plain arrays in the raw wire shape (the same rows the
// DLL takes under `artifacts` / `champions`).

use std::time::Instant;

use sfc_engine::artifact_log::{build_equipped_by_artifact_map, parse_artifact_log_array};
use sfc_engine::pipeline;

/// Reads a row array, accepting either a bare array or the JSON-RPC notification
/// it arrives in on the wire (`{"method":…,"params":{"<key>":[…]}}`).
///
/// Both shapes are real inputs: the crate's own parity fixtures are captured
/// notifications, while a caller that already unwrapped them passes the array.
/// Accepting one only meant the benchmark panicked on the fixtures committed
/// beside it.
fn parse_rows<T: serde::de::DeserializeOwned>(raw: &str, key: &str) -> Vec<T> {
    let value: serde_json::Value = serde_json::from_str(raw).unwrap_or_else(|e| panic!("{key} must be JSON: {e}"));
    // A notification nests the rows under params; a bare array is already them.
    let rows = value.get("params").and_then(|p| p.get(key)).unwrap_or(&value);
    serde_json::from_value(rows.clone()).unwrap_or_else(|e| panic!("{key} must deserialise: {e}"))
}

fn main() {
    // Positional args keep the harness dependency-free; all three are required.
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        eprintln!("usage: bench_pipeline <sfc> <artifacts.json> <champions.json>");
        std::process::exit(2);
    }
    let sfc = std::fs::read_to_string(&args[1]).expect("sfc file");
    let artifacts_raw = std::fs::read_to_string(&args[2]).expect("artifacts json");
    let champions_raw = std::fs::read_to_string(&args[3]).expect("champions json");

    // Stage 0 — JSON parse of the input envelope. Measured because §5 argues the caller
    // pays no transcoding cost; this is the one cost the DLL side actually does pay.
    let t = Instant::now();
    let raw_artifacts: Vec<sfc_engine::artifact_log::RawArtifactLogRow> = parse_rows(&artifacts_raw, "artifacts");
    let raw_champions: Vec<sfc_engine::artifact_log::RawChampionRow> = parse_rows(&champions_raw, "champions");
    let json_ms = t.elapsed().as_secs_f64() * 1000.0;

    // Stage 1 — raw→compact normalisation (the §4 rules run here).
    let t = Instant::now();
    let equipped = build_equipped_by_artifact_map(&raw_champions);
    let compact = parse_artifact_log_array(&raw_artifacts, &equipped);
    let normalize_ms = t.elapsed().as_secs_f64() * 1000.0;

    // The remaining stages run inside the crate (pipeline::bench_stages) so the benchmark
    // measures exactly the code the ABI runs, not a re-implementation that could drift.
    let report = pipeline::bench_stages(&sfc, &compact);

    println!("vault: {} artifacts, {} champions", compact.len(), raw_champions.len());
    println!("  json parse          {json_ms:8.1} ms");
    println!("  normalize           {normalize_ms:8.1} ms");
    println!("  parse_sfc           {:8.1} ms", report.parse_sfc_ms);
    println!(
        "  build rules         {:8.1} ms  ({} rules)",
        report.build_rules_ms, report.rule_count
    );
    println!("  safeguard detect    {:8.1} ms", report.safeguard_ms);
    println!(
        "  merge rules         {:8.1} ms  ({} merged)",
        report.merge_ms, report.merged_count
    );
    println!("  evaluate verdicts   {:8.1} ms", report.evaluate_ms);
    println!("  improvement chance  {:8.1} ms", report.improvement_ms);
    println!("  ---------------------------------");
    // The decision answer — what a consumer asking "keep or sell" actually waits for.
    let decision_total = json_ms + normalize_ms + report.decision_ms();
    println!("  DECISION TOTAL      {decision_total:8.1} ms   (verdicts + safeguard ranks + rules)");
    // The optional projection, reported separately because it is opt-in and dwarfs the rest.
    let with_chances = decision_total + report.improvement_ms;
    println!("  + improvement chance{with_chances:8.1} ms   (only when requested)");
}
