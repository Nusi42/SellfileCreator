// decide_parity — end-to-end verdict parity for the decision ABI.
//
// A NEW class of test beside tests/parity.rs. That one compares the raw→compact
// normaliser against the app's TypeScript ingest, column for column, and never loads a
// sellfile or produces a verdict. This one drives the whole chain — sellfile in, keep/sell
// out — and pins the normalisation traps that each once produced a WRONG SELL on real gear.
//
// Every case here failed before the fix it guards. A wrong sell spends a player's gear
// irreversibly, which is why these assert the decision rather than merely that a pipeline
// ran: "plausible" is not the standard, agreeing with the app's own preview is.

use sfc_engine::artifact_log::{build_equipped_by_artifact_map, parse_artifact_log_array, RawArtifactLogRow};
use sfc_engine::pipeline::{decide, Verdict};

use serde_json::json;

// The 32.32 fixed-point scale the game stores every stat in.
const FIXED_POINT: f64 = 4_294_967_296.0;

// Encode a display value the way the game's wire carries it. `exact` = false reproduces
// the decode drift that makes a real "12" arrive as 11.999999964609742.
fn wire_value(display: f64, exact: bool) -> f64 {
    let raw = (display * FIXED_POINT).round();
    if exact {
        raw
    } else {
        // One ULP down: the piece the game UI and the app both call `display`, whose
        // fixed-point decode lands just under it.
        raw - 1.0
    }
}

// Build one raw ArtifactLog row. Substats are (stat id, is_flat, display value, rolls).
fn artifact_row(
    id: i64,
    slot: i64,
    set_kind_id: i64,
    level: i64,
    substats: &[(i64, i64, f64, i64)],
    exact_values: bool,
) -> serde_json::Value {
    json!({
        "id": id,
        "kindId": slot,
        "rankId": 6,
        "rarityId": 5,
        "level": level,
        "setKindId": set_kind_id,
        "requiredFraction": 0,
        "primary": { "id": 1, "isAbsolute": 0, "statValue": wire_value(10.0, true), "mValue": 0, "glyphValue": 0 },
        "secondary": substats
            .iter()
            .map(|(stat_id, is_flat, value, rolls)| json!({
                "id": stat_id,
                "level": rolls,
                "isAbsolute": is_flat,
                "statValue": wire_value(*value, exact_values),
                "mValue": 0,
                "glyphValue": 0,
            }))
            .collect::<Vec<_>>(),
    })
}

// Run the decision chain over raw rows and return the verdicts.
fn decide_rows(sfc: &str, rows: Vec<serde_json::Value>) -> Vec<Verdict> {
    let raw: Vec<RawArtifactLogRow> = serde_json::from_value(json!(rows)).expect("rows must deserialise");
    let equipped = build_equipped_by_artifact_map(&[]);
    let compact = parse_artifact_log_array(&raw, &equipped);
    decide(sfc, &compact).expect("decision chain must not error").verdicts
}

// Look up one artifact's verdict.
fn verdict_for(verdicts: &[Verdict], artifact_id: i64) -> &Verdict {
    verdicts
        .iter()
        .find(|v| v.artifact_id == artifact_id)
        .unwrap_or_else(|| panic!("no verdict for artifact {artifact_id}"))
}

// A sellfile whose one SELL recipe needs SPD at or above a VALUE — the threshold the
// rounding trap silently failed.
//
// The value bound lives in the Minima table (rank bucket -> {statVariant: minValue}), not
// in `rollBounds`, which is a ROLL COUNT clamped to 0..5. Pieces here are rank 6, so the
// "six" bucket is the one a recipe reads.
fn sfc_selling_spd_at_least(min_value: f64) -> String {
    json!({
        "Version": "1.0",
        // Minima buckets are keyed by star label, and each inner key is a stat LABEL.
        "Minima": { "six": { "SPD": min_value } },
        "Recipes": [{
            "appearance": { "name": "Sell fast gear" },
            "keep": false,
            "Rank": "6★",
            "Rarity": "Any",
            "substats": [{ "stat": "SPD" }],
            "minCount": 1,
        }],
        "Safeguards": [],
        "SafeguardsEnabled": false,
    })
    .to_string()
}

// §6 fixture 2 — the rounding trap.
//
// A substat the game UI and the app both call "SPD 12" decodes to 11.999999964609742.
// Compared RAW against a `>= 12` rule it fails; the app rounds at import, so its engine
// sees a clean 12 and the rule fires. Before the shared rounding landed, the DLL kept
// (and so failed to sell) 44% of a real vault's substats for exactly this reason.
#[test]
fn non_integral_substat_still_meets_its_threshold() {
    let sfc = sfc_selling_spd_at_least(12.0);
    // Both pieces are "SPD 12" to a player. One arrives exact, one with decode drift.
    let rows = vec![
        artifact_row(1, 2, 5, 16, &[(4, 1, 12.0, 3)], true),
        artifact_row(2, 2, 5, 16, &[(4, 1, 12.0, 3)], false),
    ];
    let verdicts = decide_rows(&sfc, rows);
    assert!(
        !verdict_for(&verdicts, 1).keep,
        "an exact SPD 12 must meet a >= 12 rule and be sold"
    );
    assert!(
        !verdict_for(&verdicts, 2).keep,
        "a non-integral SPD 12 (11.999999964609742) must round to 12 and be sold, \
         exactly as the app's own preview decides it — this is the 44%-of-substats trap"
    );
}

// A value threshold must still be able to REJECT. Guards against the fix degenerating
// into "every threshold passes", which would sell gear rather than merely keep it.
#[test]
fn a_substat_below_the_threshold_does_not_match() {
    let sfc = sfc_selling_spd_at_least(12.0);
    // SPD 11 is genuinely under the bar and must not be swept up.
    let rows = vec![artifact_row(3, 2, 5, 16, &[(4, 1, 11.0, 2)], true)];
    let verdicts = decide_rows(&sfc, rows);
    let verdict = verdict_for(&verdicts, 3);
    assert!(verdict.keep, "SPD 11 must not satisfy a >= 12 rule");
    assert!(
        !verdict.matched,
        "no rule covers it, so it is kept by DEFAULT rather than by decision"
    );
}

// §6 fixture 3 — off-milestone levels.
//
// The .hsf format has no "level >= N": a rule carries one LVLForCheck matched by EXACT
// equality. The app snaps a live level to the nearest milestone before evaluating, so a
// +9 piece is judged as +8. Passing the raw level through instead makes every
// off-milestone piece (1-3, 5-7, 9-11, 13-15) match no level rule at all.
#[test]
fn off_milestone_level_is_judged_at_its_snapped_milestone() {
    let sfc = json!({
        "Version": "1.0",
        "Recipes": [{
            "appearance": { "name": "Sell +8 gear" },
            "keep": false,
            "Rank": "Any",
            "Rarity": "Any",
            "minLevel": 8,
            "maxLevel": 8,
            "substats": [],
            "minCount": 0,
        }],
        "Safeguards": [],
        "SafeguardsEnabled": false,
    })
    .to_string();
    let rows = vec![
        artifact_row(10, 2, 5, 8, &[(4, 1, 10.0, 1)], true),
        artifact_row(11, 2, 5, 9, &[(4, 1, 10.0, 1)], true),
        artifact_row(12, 2, 5, 16, &[(4, 1, 10.0, 1)], true),
    ];
    let verdicts = decide_rows(&sfc, rows);
    assert!(!verdict_for(&verdicts, 10).keep, "a +8 piece matches a +8 rule");
    assert!(
        !verdict_for(&verdicts, 11).keep,
        "a +9 piece snaps DOWN to +8 and must be judged by the +8 rule, \
         not fall through as 'nothing matched'"
    );
    assert!(
        verdict_for(&verdicts, 12).keep,
        "a +16 piece is not a +8 piece and must be left alone"
    );
}

// §6 fixture 4 — the setless sentinel, both halves in one test.
//
// "No set" is a real KIND of accessory, so the app gives it the -99 sentinel and rules
// name that id (a reference sellfile has 397 rules naming -99 and none naming 0). Armour
// keeps a plain 0: promoting it too would hand every setless chestplate to the accessory
// rules. The two must NOT normalize alike.
#[test]
fn setless_accessory_and_setless_chestplate_are_not_normalized_alike() {
    // A rule naming the no-set accessory id, exactly as a real export spells it.
    let sfc = json!({
        "Version": "1.0",
        "Recipes": [{
            "appearance": { "name": "Sell no-set accessories" },
            "keep": false,
            "Rank": "Any",
            "Rarity": "Any",
            "artifactSetIds": [rule_engine_core::ACCESSORY_NO_SET_ID],
            "substats": [],
            "minCount": 0,
        }],
        "Safeguards": [],
        "SafeguardsEnabled": false,
    })
    .to_string();
    let rows = vec![
        // A setless RING (slot 7) — a kind of its own, which the rule names.
        artifact_row(20, 7, 0, 16, &[(4, 1, 10.0, 1)], true),
        // A setless CHESTPLATE (slot 2) — genuinely setless, which the rule must not reach.
        artifact_row(21, 2, 0, 16, &[(4, 1, 10.0, 1)], true),
    ];
    let verdicts = decide_rows(&sfc, rows);
    assert!(
        !verdict_for(&verdicts, 20).keep,
        "a setless accessory takes the -99 sentinel and is matched by the rule naming it"
    );
    assert!(
        verdict_for(&verdicts, 21).keep,
        "a setless chestplate stays at a plain 0 and must NOT be caught by an accessory rule"
    );
}

// The accessory set must come from setKindId, not from requiredFraction.
//
// Reading requiredFraction handed every accessory a set id in the 0..17 faction range
// instead of its real set. The existing normaliser parity test cannot catch this: it
// compares aset and accset as raw columns, BEFORE the choice between them is made.
#[test]
fn accessory_set_comes_from_set_kind_id_not_the_faction_code() {
    // Sell one specific accessory set.
    let sfc = json!({
        "Version": "1.0",
        "Recipes": [{
            "appearance": { "name": "Sell Cruel accessories" },
            "keep": false,
            "Rank": "Any",
            "Rarity": "Any",
            "artifactSetNames": [{ "name": "Cruel" }],
            "substats": [],
            "minCount": 0,
        }],
        "Safeguards": [],
        "SafeguardsEnabled": false,
    })
    .to_string();
    // A ring whose real set is Cruel, carrying a faction code that must not be mistaken
    // for a set id.
    let mut ring = artifact_row(30, 7, 0, 16, &[(4, 1, 10.0, 1)], true);
    let cruel_set_id = rule_engine_core::set_id_from_name("Cruel").expect("Cruel must be a known set");
    ring["setKindId"] = json!(cruel_set_id);
    ring["requiredFraction"] = json!(4);
    let verdicts = decide_rows(&sfc, vec![ring]);
    assert!(
        !verdict_for(&verdicts, 30).keep,
        "the ring's set must be read from setKindId, so the Cruel rule reaches it"
    );
}

// The unmatched default, stated as its own guarantee: never sell what no rule named.
#[test]
fn an_unmatched_piece_is_kept_by_default_and_says_so() {
    // A sellfile that names a set nothing in the fixture carries.
    let sfc = json!({
        "Version": "1.0",
        "Recipes": [{
            "appearance": { "name": "Sell Cruel" },
            "keep": false,
            "Rank": "Any",
            "Rarity": "Any",
            "artifactSetNames": [{ "name": "Cruel" }],
            "substats": [],
            "minCount": 0,
        }],
        "Safeguards": [],
        "SafeguardsEnabled": false,
    })
    .to_string();
    let other_set = rule_engine_core::set_id_from_name("Life").expect("Life must be a known set");
    let rows = vec![artifact_row(40, 2, other_set, 16, &[(4, 1, 10.0, 1)], true)];
    let verdicts = decide_rows(&sfc, rows);
    let verdict = verdict_for(&verdicts, 40);
    assert!(verdict.keep, "no rule covered it, so it must be KEPT");
    assert!(!verdict.matched, "and reported as kept by default, not by decision");
    assert!(verdict.rule_name.is_none(), "an unmatched piece names no deciding rule");
    assert!(!verdict.safeguarded, "nothing rescued it; it was never at risk");
}

// A rule read from an existing .hsf carries its name, and that name must reach the caller
// so a consumer can explain a verdict rather than only colour it.
//
// Note the asymmetry this pins: rules GENERATED from a .sfc carry no RecipeName (the
// builder does not propagate the recipe's display name onto its rules), so `ruleName` is
// null for them by design. It is populated for the sellfiles that do carry names.
#[test]
fn a_named_rule_reaches_the_caller() {
    use rule_engine_core::{configure_engine, evaluate_engine, EvaluateOptionsRaw, RuleRaw};
    // Drive the evaluator directly with a named rule, which is what a .hsf supplies.
    let rules: Vec<RuleRaw> = serde_json::from_value(json!([{
        "RecipeID": 1,
        "RecipeName": "Sell fast gear",
        "Keep": false,
        "Use": true,
        "ArtifactSet": [5],
    }]))
    .expect("rule must deserialise");
    let name = rules[0].RecipeName.as_deref().map(str::to_owned);
    configure_engine(rules, vec!["sell".to_string()]);
    let results = evaluate_engine(
        serde_json::from_value(json!([{
            "itemId": 60,
            "item": { "slot": 2, "set": 5, "rank": 6, "rarity": 5, "level": 16 },
        }]))
        .expect("item must deserialise"),
        EvaluateOptionsRaw::default(),
    )
    .expect("evaluation must succeed");
    let decided = results[0]
        .first_non_excluded_match
        .as_ref()
        .or(results[0].first_match.as_ref())
        .expect("the sell rule must match");
    assert!(!decided.keep, "the rule sells it");
    assert_eq!(
        name.as_deref(),
        Some("Sell fast gear"),
        "the deciding rule's name is what the verdict reports"
    );
}

// ---------------------------------------------------------------------------
// Safeguards: the verdict state a .hsf cannot express, and the ranks behind it
// ---------------------------------------------------------------------------

// A sellfile that sells everything, with one safeguard protecting the best SPD pieces.
//
// `grouped` wraps the safeguard in a Group, which pools its members' feeds into one
// quota. Grouped rules are the case §6 calls out specifically: the reader must mirror the
// TS group-nesting parser, or every grouped rule is silently dropped and its gear sold.
fn sfc_with_spd_safeguard(required_count: i64, grouped: bool) -> String {
    // One safeguard member: protect the top SPD chestplates.
    let member = json!({
        "appearance": { "name": "Protect: Speed" },
        "requiredCount": required_count,
        "activation": "always",
        "countMode": { "perRule": false, "perSet": false, "perFaction": false, "perMainStat": false, "perSlot": true },
        "tuple": {
            "slots": ["Chestplate"],
            "sets": [],
            "ranks": ["6\u{2605}"],
            "rarities": ["Legendary"],
            "mainStats": [],
            "factions": [],
        },
        "substats": ["SPD"],
        "substatMatch": "1",
        "substatWeights": { "SPD": 1.0 },
    });
    // A group entry carries its own settings plus the members it pools.
    let safeguards = if grouped {
        json!([{
            "Group": {
                "requiredCount": required_count,
                "countMode": { "perRule": false, "perSet": false, "perFaction": false, "perMainStat": false, "perSlot": true },
            },
            "members": [member],
        }])
    } else {
        json!([member])
    };
    json!({
        "Version": "1.0",
        // Sell every 6-star Legendary chestplate; the safeguard is what rescues the best.
        "Recipes": [{
            "appearance": { "name": "Sell everything" },
            "keep": false,
            "Rank": "Any",
            "Rarity": "Any",
            "substats": [],
            "minCount": 0,
        }],
        "Safeguards": safeguards,
        "SafeguardsEnabled": true,
    })
    .to_string()
}

// Gear that a blanket sell rule condemns, differing only in SPD so the ranking is
// unambiguous: higher SPD ranks better and is what a quota keeps first.
fn spd_ladder() -> Vec<serde_json::Value> {
    (0u8..4)
        .map(|i| {
            artifact_row(
                100 + i64::from(i),
                2,
                5,
                16,
                &[(4, 1, 10.0 + f64::from(i) * 5.0, 4)],
                true,
            )
        })
        .collect()
}

// Gap A — the third verdict state. A piece the sellfile sells and a safeguard re-keeps is
// reported as kept AND flagged `safeguarded`, which no .hsf can express: the safeguard
// source marker is stripped on export, so this distinction only exists in-process.
#[test]
fn a_safeguarded_piece_is_kept_and_says_why() {
    let sfc = sfc_with_spd_safeguard(1, false);
    let verdicts = decide_rows(&sfc, spd_ladder());
    let rescued: Vec<&Verdict> = verdicts.iter().filter(|v| v.safeguarded).collect();
    assert!(
        !rescued.is_empty(),
        "the safeguard must rescue at least one piece from a blanket sell rule"
    );
    for verdict in &rescued {
        assert!(verdict.keep, "a rescued piece is KEPT");
        assert!(verdict.matched, "a rule decided it; it was not kept by default");
    }
    // The highest-SPD piece is the one a quota of 1 protects.
    let best = verdict_for(&verdicts, 103);
    assert!(best.keep && best.safeguarded, "the best SPD piece is the one rescued");
    // A piece nothing rescued is still sold, so `safeguarded` marks a real distinction
    // rather than being set on everything.
    let worst = verdict_for(&verdicts, 100);
    assert!(!worst.keep, "the weakest piece stays sold");
    assert!(!worst.safeguarded, "and is not flagged as rescued");
}

// Gap C — the ranks behind that decision, which the collector already computed and the
// DLL previously discarded.
#[test]
fn safeguard_ranks_are_exposed_with_their_buckets() {
    let sfc = sfc_with_spd_safeguard(2, false);
    let raw: Vec<RawArtifactLogRow> = serde_json::from_value(json!(spd_ladder())).expect("rows");
    let compact = parse_artifact_log_array(&raw, &build_equipped_by_artifact_map(&[]));
    let outcome = decide(&sfc, &compact).expect("decision chain");

    assert!(
        !outcome.safeguard_ranks.is_empty(),
        "the safeguard ranked candidates, so the ranks must reach the caller"
    );
    for rank in &outcome.safeguard_ranks {
        assert_eq!(rank.rule_ordinal, 1, "the sellfile has exactly one safeguard rule");
        assert!(rank.candidate_rank >= 1, "candidate_rank is 1-based");
        assert!(rank.bucket_rank >= 1, "bucket_rank is 1-based");
        assert!(
            !rank.bucket_key.is_empty(),
            "each rank names the bucket it was ranked in"
        );
    }
    // Ranking must follow score: the best SPD piece takes the top rank in its bucket.
    let best = outcome
        .safeguard_ranks
        .iter()
        .find(|r| r.artifact_id == 103)
        .expect("the best piece must be ranked");
    assert_eq!(best.bucket_rank, 1, "the highest SPD ranks first in its bucket");
    assert!(best.is_within_quota, "and falls inside a quota of 2");
}

// §6 — grouped safeguards must survive the reader.
//
// If the SFC reader does not mirror the TS group-nesting parser, a grouped rule is
// silently dropped: no candidates, no protection, and every piece it should have saved is
// sold without a trace.
#[test]
fn a_grouped_safeguard_still_protects_its_gear() {
    let grouped = decide_rows(&sfc_with_spd_safeguard(1, true), spd_ladder());
    assert!(
        grouped.iter().any(|v| v.safeguarded),
        "a safeguard nested inside a Group must still be read and still protect gear — \
         silently dropping it sells everything it was meant to save"
    );

    // The group's members reach the same verdicts as the ungrouped form here, since the
    // group pools a single member under the same quota.
    let ungrouped = decide_rows(&sfc_with_spd_safeguard(1, false), spd_ladder());
    let kept_grouped: Vec<i64> = grouped.iter().filter(|v| v.keep).map(|v| v.artifact_id).collect();
    let kept_ungrouped: Vec<i64> = ungrouped.iter().filter(|v| v.keep).map(|v| v.artifact_id).collect();
    assert_eq!(
        kept_grouped, kept_ungrouped,
        "one member in a group of quota 1 protects the same piece as that member alone"
    );
}

// The group id reaches the caller, so a consumer can explain WHY a quota was shared.
#[test]
fn a_grouped_rank_carries_its_group_id() {
    let raw: Vec<RawArtifactLogRow> = serde_json::from_value(json!(spd_ladder())).expect("rows");
    let compact = parse_artifact_log_array(&raw, &build_equipped_by_artifact_map(&[]));
    let outcome = decide(&sfc_with_spd_safeguard(2, true), &compact).expect("decision chain");
    assert!(
        !outcome.safeguard_ranks.is_empty(),
        "the grouped safeguard ranked candidates"
    );
    assert!(
        outcome.safeguard_ranks.iter().all(|r| r.group_id.is_some()),
        "every rank from a grouped rule names its group; null is reserved for ungrouped rules"
    );
}

// ---------------------------------------------------------------------------
// Thread safety
// ---------------------------------------------------------------------------

// `sfc_decide` is safe to call concurrently from several threads.
//
// The engine state it configures and evaluates against (`ENGINE_STATE`) and the
// safeguard placeholder hand-off store (`RESIDENT_PLACEHOLDERS`) are BOTH thread-locals,
// and the core carries no other mutable global. So concurrent calls cannot observe or
// corrupt each other's engine: each thread builds and uses its own.
//
// What concurrency costs is work, not correctness — every thread re-runs the whole chain,
// including rule generation, which the benchmark shows dominates. Threads help throughput
// across independent requests, never a single one.
//
// This test would fail (nondeterministically, which is worse) if any of that state ever
// became a plain global, so it guards the promise the header makes to consumers.
#[test]
fn concurrent_calls_agree_with_a_single_call() {
    use std::sync::Arc;
    use std::thread;

    // A sellfile with an active safeguard, so the thread-local placeholder store is
    // exercised too rather than only the evaluator.
    let sfc = Arc::new(sfc_with_spd_safeguard(2, false));
    let rows: Vec<RawArtifactLogRow> = serde_json::from_value(json!(spd_ladder())).expect("rows");
    let compact = Arc::new(parse_artifact_log_array(&rows, &build_equipped_by_artifact_map(&[])));

    // The answer one thread produces on its own is the reference.
    let expected: Vec<(i64, bool, bool)> = decide(&sfc, &compact)
        .expect("baseline decision")
        .verdicts
        .iter()
        .map(|v| (v.artifact_id, v.keep, v.safeguarded))
        .collect();

    // Several threads decide the same input at once; every one must agree.
    let handles: Vec<_> = (0..8)
        .map(|_| {
            let sfc = Arc::clone(&sfc);
            let compact = Arc::clone(&compact);
            thread::spawn(move || {
                decide(&sfc, &compact)
                    .expect("concurrent decision")
                    .verdicts
                    .iter()
                    .map(|v| (v.artifact_id, v.keep, v.safeguarded))
                    .collect::<Vec<_>>()
            })
        })
        .collect();

    for handle in handles {
        let got = handle.join().expect("a decision thread must not panic");
        assert_eq!(
            got, expected,
            "a concurrent call must reach the same verdicts as a lone one"
        );
    }
}
