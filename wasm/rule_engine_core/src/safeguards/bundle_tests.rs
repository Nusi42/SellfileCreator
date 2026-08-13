// Detection-path tests for safeguard bundles.
//
// A bundle is where the promise lives; its members only FEED it. Each member evaluates exactly
// as if ungrouped — own filters, substats, weights, count mode, ranking and required count — and
// what that count selects is the gear it contributes. The bundle then merges every contribution
// into buckets keyed by ITS count mode, ranks the pool by the score each piece got from its own
// member, and keeps its own required count out of each merged bucket. Everything else is sold.
//
// These tests pin the consequences that follow: the count on the header is the number that
// decides (not a max, not a sum), the merge really is by the bundle's own dimensions, the pool
// really is ranked by score across members rather than filled in list order, a member's own
// count really does size its feed, and a flat list is completely untouched.
use super::*;
use std::collections::BTreeMap;

// Minimal artifact — only the fields combination filters and count keys read.
fn artifact(id: i64, slot: i64, set: i64, faction: i64, main_stat: i64) -> SafeguardWasmArtifactIn {
    SafeguardWasmArtifactIn {
        id: Some(id),
        slot,
        set,
        rank: RANK_VALUE_MAX,
        rarity: RANK_VALUE_MAX,
        level: 16,
        exact_level: None,
        faction,
        main_stat,
        equipped_in_collection: false,
        equipped_in_vault: false,
        substats: vec![],
    }
}

// A candidate the current rules would sell — the only kind a safeguard can rescue. Each carries
// a distinct SPD roll (higher id = better) so ranking is deterministic: without a substat to rank
// by, the engine has no quality basis and protects EVERY match regardless of the count, which
// would make these assertions meaningless. Scores are absolute (normalized against canonical max
// rolls, never relative to one rule's own pool), which is what makes a higher id outrank a lower
// one even when the two pieces were fed by different members.
fn sold(id: i64, slot: i64, set: i64, faction: i64) -> SafeguardWasmCandidateIn {
    let mut art = artifact(id, slot, set, faction, SAFEGUARD_MAIN_ANY);
    art.substats = vec![crate::safeguards::fast_path_types::SafeguardWasmSubstatIn {
        variant: STAT_VARIANT_SPD,
        is_flat: false,
        value: id as f64,
        rolls: None,
    }];
    SafeguardWasmCandidateIn {
        item_key: id,
        group_key: safeguard_group_key_from_parts(slot, set, SAFEGUARD_MAIN_ANY, faction),
        is_sold: true,
        artifact: art,
    }
}

// Count mode with every scope chip off — one shared pool per entry.
fn per_rule_mode() -> SafeguardWasmCountMode {
    SafeguardWasmCountMode {
        per_rule: true,
        per_set: false,
        per_faction: false,
        per_main_stat: false,
        per_slot: false,
    }
}

// Count mode split by slot only.
fn per_slot_mode() -> SafeguardWasmCountMode {
    SafeguardWasmCountMode {
        per_rule: false,
        per_set: false,
        per_faction: false,
        per_main_stat: false,
        per_slot: true,
    }
}

// A wire rule at a given outline position. `slots` empty means Any.
fn rule_in(
    name: &str,
    slots: Vec<i64>,
    required: i64,
    depth: Option<i64>,
    bundle: bool,
    count_mode: SafeguardWasmCountMode,
) -> SafeguardWasmRuleIn {
    SafeguardWasmRuleIn {
        id: Some(name.to_string()),
        name: Some(name.to_string()),
        combination: Some(SafeguardWasmCombination {
            slots,
            sets: vec![],
            meta_set_names: vec![],
            ranks: vec![],
            rarities: vec![],
            main_stats: vec![],
            factions: vec![],
        }),
        required_count: Some(required),
        activation: Some(SAFEGUARD_ACTIVATION_PROTECT_EXISTING.to_string()),
        count_mode: Some(count_mode),
        ignore_previous_safeguards: None,
        ignore_equipped_in_collection: None,
        ignore_equipped_in_vault: None,
        // Rank by SPD so the required count actually limits the selection.
        substats: Some(vec![STAT_VARIANT_SPD]),
        substat_match: None,
        substat_weights: None,
        weight_main_stat_by_rank: None,
        main_stat_rank_weight_factor: None,
        improvement_chance_threshold: None,
        tags: None,
        bundle: if bundle { Some(true) } else { None },
        depth,
    }
}

// Runs a scan and returns the detection entries in array order.
fn scan(
    candidates: Vec<SafeguardWasmCandidateIn>,
    rules: Vec<SafeguardWasmRuleIn>,
) -> Vec<SafeguardWasmEntryOut> {
    compute_safeguard_protection_core(
        candidates,
        rules,
        SafeguardWasmExpectedGroupsPayloadIn::default(),
        true,
        0.0,
        // No improvement-chance gating: these tests are about the shared decision.
        &BTreeMap::new(),
    )
    .entries
}

// Sorted item keys an entry actually protects (the emission input).
fn protected(entry: &SafeguardWasmEntryOut) -> Vec<i64> {
    let mut keys = entry.item_keys.clone();
    keys.sort_unstable();
    keys
}

// Every key surviving anywhere in a bundle, which is what the user sees kept.
fn protected_across(entries: &[SafeguardWasmEntryOut], members: &[usize]) -> Vec<i64> {
    let mut keys = members
        .iter()
        .flat_map(|index| entries[*index].item_keys.clone())
        .collect::<Vec<_>>();
    keys.sort_unstable();
    keys
}

#[test]
fn the_bundles_own_count_decides_how_much_survives() {
    // Two rules that both want ring protection. Ungrouped they would keep 3 + 2 = 5 rings.
    // Bundled under a header asking for 2, exactly 2 survive: the header's number is the
    // promise, and the members' 3 and 2 only sized what they handed over.
    let candidates = (1..=5).map(|id| sold(id, ARTIFACT_TYPE_RING, 10, 1)).collect::<Vec<_>>();
    let rules = vec![
        rule_in("bundle", vec![], 2, None, true, per_rule_mode()),
        rule_in("rings A", vec![ARTIFACT_TYPE_RING], 3, Some(1), false, per_rule_mode()),
        rule_in("rings B", vec![ARTIFACT_TYPE_RING], 2, Some(1), false, per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    // Best two SPD rolls in the pool, whichever member happened to feed them.
    assert_eq!(protected_across(&entries, &[1, 2]), vec![4, 5]);
}

#[test]
fn the_pool_is_ranked_by_each_members_own_score() {
    // The behaviour that separates this model from "first member fills the bucket": the amulet
    // rule is listed SECOND, but the piece it feeds carries the better SPD roll, so it takes the
    // single slot. Scores are absolute, so a piece fed by a later member genuinely outranks one
    // fed by an earlier member.
    let candidates = vec![
        sold(1, ARTIFACT_TYPE_RING, 10, 1),
        sold(9, ARTIFACT_TYPE_AMULET, 10, 1),
    ];
    let rules = vec![
        rule_in("bundle", vec![], 1, None, true, per_rule_mode()),
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 1, Some(1), false, per_rule_mode()),
        rule_in("amulets", vec![ARTIFACT_TYPE_AMULET], 1, Some(1), false, per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert!(protected(&entries[1]).is_empty(), "the weaker piece loses even though it is first");
    assert_eq!(protected(&entries[2]), vec![9], "the better-scoring piece takes the slot");
}

#[test]
fn a_members_own_count_sizes_the_feed_it_contributes() {
    // The ring rule holds three strong rolls but only offers its best one, because its own count
    // is 1. That leaves room for the two weaker amulets — which would have been outranked had the
    // ring rule fed everything it matched.
    let candidates = vec![
        sold(7, ARTIFACT_TYPE_RING, 10, 1),
        sold(8, ARTIFACT_TYPE_RING, 10, 1),
        sold(9, ARTIFACT_TYPE_RING, 10, 1),
        sold(1, ARTIFACT_TYPE_AMULET, 10, 1),
        sold(2, ARTIFACT_TYPE_AMULET, 10, 1),
    ];
    let rules = vec![
        rule_in("bundle", vec![], 3, None, true, per_rule_mode()),
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 1, Some(1), false, per_rule_mode()),
        rule_in("amulets", vec![ARTIFACT_TYPE_AMULET], 5, Some(1), false, per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(protected(&entries[1]), vec![9], "the ring rule feeds only its own best");
    assert_eq!(protected(&entries[2]), vec![1, 2], "so both amulets still fit the bundle's 3");
}

#[test]
fn the_bundles_own_chips_define_what_counts_as_the_same_bucket() {
    // A ring rule and an amulet rule, each feeding one piece. Under a PER-SLOT bundle they land
    // in different merged buckets and both survive; under a PER-RULE bundle they share one bucket
    // and only the better-scoring one keeps its piece. Same members, same counts — only the
    // header's chips differ.
    let candidates = vec![
        sold(1, ARTIFACT_TYPE_RING, 10, 1),
        sold(2, ARTIFACT_TYPE_AMULET, 10, 1),
    ];
    let members = || vec![
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 1, Some(1), false, per_rule_mode()),
        rule_in("amulets", vec![ARTIFACT_TYPE_AMULET], 1, Some(1), false, per_rule_mode()),
    ];
    let mut split = vec![rule_in("bundle", vec![], 1, None, true, per_slot_mode())];
    split.extend(members());
    let entries = scan(candidates.clone(), split);
    assert_eq!(protected(&entries[1]), vec![1], "per-slot: the ring bucket has its own room");
    assert_eq!(protected(&entries[2]), vec![2], "per-slot: so does the amulet bucket");

    let mut shared = vec![rule_in("bundle", vec![], 1, None, true, per_rule_mode())];
    shared.extend(members());
    let entries = scan(candidates, shared);
    assert!(protected(&entries[1]).is_empty(), "per-rule: one bucket, and the ring scores lower");
    assert_eq!(protected(&entries[2]), vec![2], "per-rule: the better roll takes the only slot");
}

#[test]
fn a_bundle_with_no_scope_chips_merges_everything_into_one_bucket() {
    // The coarsest merge: per-rule on the bundle means slot/set/faction never split it.
    let candidates = vec![
        sold(1, ARTIFACT_TYPE_RING, 10, 1),
        sold(2, ARTIFACT_TYPE_AMULET, 20, 2),
    ];
    let rules = vec![
        rule_in("bundle", vec![], 1, None, true, per_rule_mode()),
        rule_in("accessories", vec![ARTIFACT_TYPE_RING, ARTIFACT_TYPE_AMULET], 5, Some(1), false, per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(protected(&entries[1]), vec![2], "one shared bucket keeps exactly the best piece");
}

#[test]
fn a_count_above_the_feed_keeps_everything_that_was_fed() {
    // Asking for more than the members offer is not an error and invents nothing: the bundle can
    // only ever keep gear that reached its pool.
    let candidates = (1..=4).map(|id| sold(id, ARTIFACT_TYPE_RING, 10, 1)).collect::<Vec<_>>();
    let rules = vec![
        rule_in("bundle", vec![], 9, None, true, per_rule_mode()),
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 2, Some(1), false, per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(protected(&entries[1]), vec![3, 4], "everything fed survives, nothing more");
}

#[test]
fn members_keep_their_own_filters_substats_and_counts() {
    // The member still decides WHICH pieces it offers — the bundle only decides how many of the
    // pooled offers survive. Here the member is ring-only, so the amulet never reaches the pool.
    let candidates = vec![
        sold(1, ARTIFACT_TYPE_RING, 10, 1),
        sold(2, ARTIFACT_TYPE_AMULET, 10, 1),
    ];
    let rules = vec![
        rule_in("bundle", vec![], 1, None, true, per_rule_mode()),
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 5, Some(1), false, per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    // Its own count of 5 still shapes its feed; the bundle then keeps 1 of what arrived.
    assert_eq!(entries[1].per_group_required_count, 5, "a member keeps its own count");
    assert_eq!(protected(&entries[1]), vec![1], "and never offers gear outside its filter");
}

#[test]
fn nested_bundles_both_narrow_the_same_members() {
    // outer(1) { inner(2) { rings(3) } } — the ring rule feeds 3, the inner bundle keeps 2 of
    // them, and the outer bundle keeps 1 of what is left. Both headers apply, so the tighter
    // number is what the user ends up with.
    let candidates = (1..=4).map(|id| sold(id, ARTIFACT_TYPE_RING, 10, 1)).collect::<Vec<_>>();
    let rules = vec![
        rule_in("outer", vec![], 1, None, true, per_rule_mode()),
        rule_in("inner", vec![], 2, Some(1), true, per_rule_mode()),
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 3, Some(2), false, per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(protected(&entries[2]), vec![4], "the tighter of the nested counts must hold");
}

#[test]
fn an_inactive_member_feeds_nothing_and_consumes_no_room() {
    // A member switched Off protects nothing anyway; it must not eat a slot in the shared
    // bucket. This also covers separators, which reach Rust as inert activation=off entries.
    let candidates = vec![sold(1, ARTIFACT_TYPE_RING, 10, 1)];
    let mut divider = rule_in("divider", vec![], 1, Some(1), false, per_rule_mode());
    divider.activation = Some(SAFEGUARD_ACTIVATION_OFF.to_string());
    let rules = vec![
        rule_in("bundle", vec![], 1, None, true, per_rule_mode()),
        divider,
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 1, Some(1), false, per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    // The off entry is listed FIRST, so if it fed the pool the ring rule would find no room. (Its
    // own entry may still carry scored keys for the UI — build_safeguard_rules_core never emits
    // them, which is exactly why they must not count against the shared bucket either.)
    assert_eq!(protected(&entries[2]), vec![1], "an off entry must not consume bucket room");
}

#[test]
fn an_empty_bundle_keeps_nothing_and_breaks_nothing() {
    // Grouping and then deleting the members leaves a header with nothing to decide over. It
    // must resolve to "no promise" rather than silently capping a sibling outside it.
    let candidates = vec![sold(1, ARTIFACT_TYPE_RING, 10, 1)];
    let rules = vec![
        rule_in("bundle", vec![], 3, None, true, per_rule_mode()),
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 1, None, false, per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(protected(&entries[1]), vec![1], "the top-level rule keeps its own promise");
}

#[test]
fn a_flat_list_is_completely_unaffected() {
    // The regression guard that matters most: with no bundles, two rules keep their own quotas
    // exactly as they always have. Deliberately non-overlapping (ring vs amulet) so neither
    // rule can satisfy the other through the existing cumulative-protection path.
    let candidates = vec![
        sold(1, ARTIFACT_TYPE_RING, 10, 1),
        sold(2, ARTIFACT_TYPE_RING, 10, 1),
        sold(3, ARTIFACT_TYPE_AMULET, 10, 1),
        sold(4, ARTIFACT_TYPE_AMULET, 10, 1),
    ];
    let rules = vec![
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 2, None, false, per_rule_mode()),
        rule_in("amulets", vec![ARTIFACT_TYPE_AMULET], 1, None, false, per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].rule_ordinal, Some(1));
    assert_eq!(entries[1].rule_ordinal, Some(2));
    // Independent promises: 2 and 1, no merging, no shared decision.
    assert_eq!(protected(&entries[0]).len(), 2);
    assert_eq!(protected(&entries[1]).len(), 1);
}
