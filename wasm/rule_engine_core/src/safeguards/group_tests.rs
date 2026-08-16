// Detection-path tests for safeguard groups.
//
// A group is where the promise lives; its members only FEED it. Each member evaluates exactly
// as if ungrouped — own filters, substats, weights, count mode, ranking and required count — and
// what that count selects is the gear it contributes. The group then merges every contribution
// into buckets keyed by ITS count mode, ranks the pool by the score each piece got from its own
// member, and keeps its own required count out of each merged bucket. Everything else is sold.
//
// A group is a contiguous run of members sharing one id; its settings ride inline on every
// member and the run's head is the copy the engine reads. These tests pin the consequences that
// follow: the group's count is the number that decides (not a max, not a sum), the merge really
// is by the group's own dimensions, the pool really is ranked by score across members rather
// than filled in list order, a member's own count really does size its feed, and a flat list is
// completely untouched.
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
        bucket_key: safeguard_bucket_key_from_parts(slot, set, SAFEGUARD_MAIN_ANY, faction),
        is_sold: true,
        artifact: art,
    }
}

// The scenario every overlap test starts from: `n` sold rings of one set/faction, SPD 1..=n.
fn rings(n: i64) -> Vec<SafeguardWasmCandidateIn> {
    (1..=n).map(|id| sold(id, ARTIFACT_TYPE_RING, 10, 1)).collect()
}

// `rings(n)` with a SECOND yardstick running the opposite way: CR% = n + 1 - id. Two members
// over the same rings can then rank the SAME pool in opposite orders — the only way to observe
// that a member ranked the full pool rather than its sibling's leftovers, because with one shared
// yardstick a quota already met by a sibling's picks selects the very same pieces either way.
fn rings_with_opposed_yardsticks(n: i64) -> Vec<SafeguardWasmCandidateIn> {
    rings(n)
        .into_iter()
        .map(|mut candidate| {
            candidate.artifact.substats.push(crate::safeguards::fast_path_types::SafeguardWasmSubstatIn {
                variant: STAT_VARIANT_CR,
                is_flat: false,
                value: (n + 1 - candidate.item_key) as f64,
                rolls: None,
            });
            candidate
        })
        .collect()
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

// The inline group settings a member carries: id + the group's count + the group's chips.
fn group(id: &str, required: i64, count_mode: SafeguardWasmCountMode) -> Option<SafeguardWasmGroupIn> {
    Some(SafeguardWasmGroupIn { id: id.to_string(), required_count: Some(required), count_mode: Some(count_mode) })
}

// A wire rule ranking by SPD, optionally a member of a group. `slots` empty means Any.
fn rule_in(
    name: &str,
    slots: Vec<i64>,
    required: i64,
    group: Option<SafeguardWasmGroupIn>,
    count_mode: SafeguardWasmCountMode,
) -> SafeguardWasmRuleIn {
    rule_ranked_by(name, slots, required, group, count_mode, STAT_VARIANT_SPD)
}

// `rule_in` with the ranking yardstick chosen by the caller — the one substat the rule ranks by,
// so its required count actually limits the selection.
fn rule_ranked_by(
    name: &str,
    slots: Vec<i64>,
    required: i64,
    group: Option<SafeguardWasmGroupIn>,
    count_mode: SafeguardWasmCountMode,
    yardstick: i64,
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
        substats: Some(vec![yardstick]),
        substat_match: None,
        substat_weights: None,
        weight_main_stat_by_rank: None,
        main_stat_rank_weight_factor: None,
        improvement_chance_threshold: None,
        tags: None,
        group,
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
        SafeguardWasmExpectedBucketsPayloadIn::default(),
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

// Every key surviving anywhere in a group, which is what the user sees kept.
fn protected_across(entries: &[SafeguardWasmEntryOut], members: &[usize]) -> Vec<i64> {
    let mut keys = members
        .iter()
        .flat_map(|index| entries[*index].item_keys.clone())
        .collect::<Vec<_>>();
    keys.sort_unstable();
    keys
}

#[test]
fn the_groups_own_count_decides_how_much_survives() {
    // Two rules that both want ring protection. Ungrouped they would keep 3 + 2 = 5 rings.
    // Grouped with a group count of 2, exactly 2 survive: the group's number is the promise,
    // and the members' 3 and 2 only sized what they handed over.
    let candidates = rings(5);
    let rules = vec![
        rule_in("rings A", vec![ARTIFACT_TYPE_RING], 3, group("g", 2, per_rule_mode()), per_rule_mode()),
        rule_in("rings B", vec![ARTIFACT_TYPE_RING], 2, group("g", 2, per_rule_mode()), per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    // Best two SPD rolls in the pool, whichever member happened to feed them.
    assert_eq!(protected_across(&entries, &[0, 1]), vec![4, 5]);
}

#[test]
fn the_runs_head_carries_the_settings_the_engine_reads() {
    // The normalizer keeps every member identical, but the engine must not depend on it: a
    // second member claiming a different count is ignored in favour of the head's.
    let candidates = rings(5);
    let rules = vec![
        rule_in("rings A", vec![ARTIFACT_TYPE_RING], 3, group("g", 2, per_rule_mode()), per_rule_mode()),
        rule_in("rings B", vec![ARTIFACT_TYPE_RING], 2, group("g", 9, per_rule_mode()), per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(protected_across(&entries, &[0, 1]), vec![4, 5], "the head's 2 wins over the stray 9");
}

#[test]
fn only_adjacent_members_share_a_group() {
    // [g] rule [g] — the same id on both sides of an ungrouped rule is two runs of one, so each
    // member keeps its own promise and nothing is pooled across the gap. Non-overlapping slots
    // (ring / banner / amulet) so the cumulative-protection path cannot satisfy one rule through
    // another.
    let candidates = vec![
        sold(1, ARTIFACT_TYPE_RING, 10, 1),
        sold(2, ARTIFACT_TYPE_RING, 10, 1),
        sold(3, ARTIFACT_TYPE_AMULET, 10, 1),
        sold(4, ARTIFACT_TYPE_AMULET, 10, 1),
    ];
    let rules = vec![
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 2, group("g", 1, per_rule_mode()), per_rule_mode()),
        rule_in("banners", vec![ARTIFACT_TYPE_BANNER], 1, None, per_rule_mode()),
        rule_in("amulets", vec![ARTIFACT_TYPE_AMULET], 2, group("g", 1, per_rule_mode()), per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    // Each single-member run is capped by its own count of 1 — never merged into one bucket of 1
    // (which would have sold both rings or both amulets).
    assert_eq!(protected(&entries[0]).len(), 1);
    assert_eq!(protected(&entries[2]).len(), 1);
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
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 1, group("g", 1, per_rule_mode()), per_rule_mode()),
        rule_in("amulets", vec![ARTIFACT_TYPE_AMULET], 1, group("g", 1, per_rule_mode()), per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert!(protected(&entries[0]).is_empty(), "the weaker piece loses even though it is first");
    assert_eq!(protected(&entries[1]), vec![9], "the better-scoring piece takes the slot");
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
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 1, group("g", 3, per_rule_mode()), per_rule_mode()),
        rule_in("amulets", vec![ARTIFACT_TYPE_AMULET], 5, group("g", 3, per_rule_mode()), per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(protected(&entries[0]), vec![9], "the ring rule feeds only its own best");
    assert_eq!(protected(&entries[1]), vec![1, 2], "so both amulets still fit the group's 3");
}

#[test]
fn the_groups_own_chips_define_what_counts_as_the_same_bucket() {
    // A ring rule and an amulet rule, each feeding one piece. Under a PER-SLOT group they land
    // in different merged buckets and both survive; under a PER-RULE group they share one bucket
    // and only the better-scoring one keeps its piece. Same members, same counts — only the
    // group's chips differ.
    let candidates = vec![
        sold(1, ARTIFACT_TYPE_RING, 10, 1),
        sold(2, ARTIFACT_TYPE_AMULET, 10, 1),
    ];
    let members = |mode: SafeguardWasmCountMode| vec![
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 1, group("g", 1, mode), per_rule_mode()),
        rule_in("amulets", vec![ARTIFACT_TYPE_AMULET], 1, group("g", 1, mode), per_rule_mode()),
    ];
    let entries = scan(candidates.clone(), members(per_slot_mode()));
    assert_eq!(protected(&entries[0]), vec![1], "per-slot: the ring bucket has its own room");
    assert_eq!(protected(&entries[1]), vec![2], "per-slot: so does the amulet bucket");

    let entries = scan(candidates, members(per_rule_mode()));
    assert!(protected(&entries[0]).is_empty(), "per-rule: one bucket, and the ring scores lower");
    assert_eq!(protected(&entries[1]), vec![2], "per-rule: the better roll takes the only slot");
}

#[test]
fn a_group_with_no_scope_chips_merges_everything_into_one_bucket() {
    // The coarsest merge: per-rule on the group means slot/set/faction never split it. A single
    // member with a group count below its own count is capped like any other run.
    let candidates = vec![
        sold(1, ARTIFACT_TYPE_RING, 10, 1),
        sold(2, ARTIFACT_TYPE_AMULET, 20, 2),
    ];
    let rules = vec![
        rule_in("accessories", vec![ARTIFACT_TYPE_RING, ARTIFACT_TYPE_AMULET], 5, group("g", 1, per_rule_mode()), per_rule_mode()),
        rule_in("banners", vec![ARTIFACT_TYPE_BANNER], 5, group("g", 1, per_rule_mode()), per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(protected(&entries[0]), vec![2], "one shared bucket keeps exactly the best piece");
}

#[test]
fn a_count_above_the_feed_keeps_everything_that_was_fed() {
    // Asking for more than the members offer is not an error and invents nothing: the group can
    // only ever keep gear that reached its pool.
    let candidates = rings(4);
    let rules = vec![
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 2, group("g", 9, per_rule_mode()), per_rule_mode()),
        rule_in("amulets", vec![ARTIFACT_TYPE_AMULET], 2, group("g", 9, per_rule_mode()), per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(protected(&entries[0]), vec![3, 4], "everything fed survives, nothing more");
}

#[test]
fn members_keep_their_own_filters_substats_and_counts() {
    // The member still decides WHICH pieces it offers — the group only decides how many of the
    // pooled offers survive. Here the member is ring-only, so the amulet never reaches the pool.
    let candidates = vec![
        sold(1, ARTIFACT_TYPE_RING, 10, 1),
        sold(2, ARTIFACT_TYPE_AMULET, 10, 1),
    ];
    let rules = vec![
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 5, group("g", 1, per_rule_mode()), per_rule_mode()),
        rule_in("banners", vec![ARTIFACT_TYPE_BANNER], 5, group("g", 1, per_rule_mode()), per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    // Its own count of 5 still shapes its feed; the group then keeps 1 of what arrived.
    assert_eq!(entries[0].per_bucket_required_count, 5, "a member keeps its own count");
    assert_eq!(protected(&entries[0]), vec![1], "and never offers gear outside its filter");
}

#[test]
fn an_inactive_member_feeds_nothing_and_consumes_no_room() {
    // A member switched Off protects nothing anyway; it must not eat a slot in the shared
    // bucket.
    let candidates = vec![sold(1, ARTIFACT_TYPE_RING, 10, 1)];
    let mut off = rule_in("off rings", vec![ARTIFACT_TYPE_RING], 1, group("g", 1, per_rule_mode()), per_rule_mode());
    off.activation = Some(SAFEGUARD_ACTIVATION_OFF.to_string());
    let rules = vec![
        off,
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 1, group("g", 1, per_rule_mode()), per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    // The off entry is listed FIRST, so if it fed the pool the ring rule would find no room. (Its
    // own entry may still carry scored keys for the UI — build_safeguard_rules_core never emits
    // them, which is exactly why they must not count against the shared bucket either.)
    assert_eq!(protected(&entries[1]), vec![1], "an off entry must not consume bucket room");
}

#[test]
fn touching_groups_with_different_ids_never_share_a_bucket() {
    // [a][b] with no gap between them: each run keeps its own promise (non-overlapping slots so
    // the cumulative-protection path cannot satisfy one rule through the other).
    let candidates = vec![
        sold(1, ARTIFACT_TYPE_RING, 10, 1),
        sold(2, ARTIFACT_TYPE_RING, 10, 1),
        sold(3, ARTIFACT_TYPE_AMULET, 10, 1),
        sold(4, ARTIFACT_TYPE_AMULET, 10, 1),
    ];
    let rules = vec![
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 2, group("a", 1, per_rule_mode()), per_rule_mode()),
        rule_in("amulets", vec![ARTIFACT_TYPE_AMULET], 2, group("b", 1, per_rule_mode()), per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(protected(&entries[0]).len(), 1, "group a keeps its own 1");
    assert_eq!(protected(&entries[1]).len(), 1, "group b keeps its own 1");
}

#[test]
fn a_flat_list_is_completely_unaffected() {
    // The regression guard that matters most: with no groups, two rules keep their own quotas
    // exactly as they always have. Deliberately non-overlapping (ring vs amulet) so neither
    // rule can satisfy the other through the existing cumulative-protection path.
    let candidates = vec![
        sold(1, ARTIFACT_TYPE_RING, 10, 1),
        sold(2, ARTIFACT_TYPE_RING, 10, 1),
        sold(3, ARTIFACT_TYPE_AMULET, 10, 1),
        sold(4, ARTIFACT_TYPE_AMULET, 10, 1),
    ];
    let rules = vec![
        rule_in("rings", vec![ARTIFACT_TYPE_RING], 2, None, per_rule_mode()),
        rule_in("amulets", vec![ARTIFACT_TYPE_AMULET], 1, None, per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].rule_ordinal, Some(1));
    assert_eq!(entries[1].rule_ordinal, Some(2));
    // Independent promises: 2 and 1, no merging, no shared decision.
    assert_eq!(protected(&entries[0]).len(), 2);
    assert_eq!(protected(&entries[1]).len(), 1);
}

// ── A run publishes only what it keeps, and only once it has closed ────────────
// A group is a cap over finished selections, so what a run contributes to the cumulative state
// is only known after the cap: a piece a member fed but the group DROPPED is sold, and a later
// rule must stay free to protect it. Members therefore hold their picks back until the run
// closes; the close caps the run and publishes the survivors. While the run is open every member
// evaluates against the pre-run state — its siblings' picks are invisible, and each member ranks
// the run's full pool by its own yardstick — which changes a member's own kept/sold split but not
// what the run keeps (the ranking path always ranked kept pieces too and emitted the sold ones,
// so a member's contribution was always "its top-N minus what a sibling already took", and the
// cap's first-feeder dedupe credits it the same way).

#[test]
fn overlapping_members_all_feed_the_pool() {
    // Two members over the SAME six rings, count 2 each, ranking by opposite yardsticks (A by
    // SPD, B by CR%), group count 4. Each selects its own top 2 from the FULL pool by its own
    // yardstick, and both feeds reach the pool — the reason to group several weightings over the
    // same gear at all.
    let candidates = rings_with_opposed_yardsticks(6);
    let rules = vec![
        rule_in("A by SPD", vec![ARTIFACT_TYPE_RING], 2, group("g", 4, per_rule_mode()), per_rule_mode()),
        rule_ranked_by("B by CR", vec![ARTIFACT_TYPE_RING], 2, group("g", 4, per_rule_mode()), per_rule_mode(), STAT_VARIANT_CR),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(protected(&entries[0]), vec![5, 6], "A feeds its own top 2 by SPD");
    assert_eq!(protected(&entries[1]), vec![1, 2], "B feeds its own top 2 by CR — the full pool, not A's leftovers");
    assert_eq!(protected_across(&entries, &[0, 1]), vec![1, 2, 5, 6], "the group keeps everything both fed");
}

#[test]
fn a_shared_pick_sits_with_its_first_feeder_and_costs_one_slot() {
    // Same yardstick, same count: both members select the same top 2 out of the full pool. One
    // piece is one pool slot whoever fed it — the first member of the run keeps it, matching the
    // flyout's pooled view (`buildSafeguardGroupPool`) — so the group keeps 2 distinct pieces
    // rather than spending 2 slots twice, and B's column is empty only because A already lists
    // both, not because B was starved: B's own ranking still shows them inside its quota.
    let candidates = rings(4);
    let rules = vec![
        rule_in("A", vec![ARTIFACT_TYPE_RING], 2, group("g", 3, per_rule_mode()), per_rule_mode()),
        rule_in("B", vec![ARTIFACT_TYPE_RING], 2, group("g", 3, per_rule_mode()), per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(protected(&entries[0]), vec![3, 4], "the first feeder is credited with the shared pieces");
    assert!(protected(&entries[1]).is_empty(), "the second feeder is not credited twice");
    let mut b_fed = entries[1]
        .candidates
        .iter()
        .filter(|candidate| candidate.is_within_quota)
        .map(|candidate| candidate.item_key)
        .collect::<Vec<_>>();
    b_fed.sort_unstable();
    assert_eq!(b_fed, vec![3, 4], "B really did feed them — they sit inside its own quota");
}

#[test]
fn a_members_picks_stay_invisible_to_its_siblings_but_reach_later_rules() {
    // Four rings, opposite yardsticks: A (SPD, count 2) takes {3,4}, B (CR, count 2) takes {1,2}
    // — B ranks the FULL pool because A's picks are held back while the run is open. Once the
    // run closes its survivors are published, so a ring rule AFTER the group with count 4 finds
    // its quota met and adds nothing — exactly the cumulative behaviour an equivalent flat list
    // would show.
    let candidates = rings_with_opposed_yardsticks(4);
    let rules = vec![
        rule_in("A by SPD", vec![ARTIFACT_TYPE_RING], 2, group("g", 4, per_rule_mode()), per_rule_mode()),
        rule_ranked_by("B by CR", vec![ARTIFACT_TYPE_RING], 2, group("g", 4, per_rule_mode()), per_rule_mode(), STAT_VARIANT_CR),
        rule_in("after", vec![ARTIFACT_TYPE_RING], 4, None, per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(protected(&entries[1]), vec![1, 2], "B ranked the full pool — A's picks were invisible to it");
    assert!(
        entries[2].item_keys.is_empty(),
        "the rule after the group must see the group's picks as already protected, got {:?}",
        entries[2].item_keys,
    );
}

#[test]
fn what_the_group_drops_stays_sellable_for_later_rules() {
    // A run publishes only its SURVIVORS to cumulative state, and it does so before the next
    // rule evaluates. A feeds rings 1..2, B feeds amulets 3..4 (distinct pieces), the group keeps
    // 2 of those 4. A trailing rule over both slots with count 4 must still be free to protect
    // the two the group DROPPED — they are sold, and an equivalent flat list would rescue them.
    let candidates = vec![
        sold(1, ARTIFACT_TYPE_RING, 10, 1),
        sold(2, ARTIFACT_TYPE_RING, 10, 1),
        sold(3, ARTIFACT_TYPE_AMULET, 10, 1),
        sold(4, ARTIFACT_TYPE_AMULET, 10, 1),
    ];
    let rules = vec![
        rule_in("A", vec![ARTIFACT_TYPE_RING], 2, group("g", 2, per_rule_mode()), per_rule_mode()),
        rule_in("B", vec![ARTIFACT_TYPE_AMULET], 2, group("g", 2, per_rule_mode()), per_rule_mode()),
        rule_in("after", vec![ARTIFACT_TYPE_RING, ARTIFACT_TYPE_AMULET], 4, None, per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(protected_across(&entries, &[0, 1]), vec![3, 4], "the group keeps the 2 best");
    assert_eq!(protected(&entries[2]), vec![1, 2], "the later rule protects what the group dropped");
}

#[test]
fn an_off_members_stale_keys_never_publish_what_the_group_dropped() {
    // An Off member's entry still carries scored item_keys for the UI, and the cap never trims
    // it (it fed nothing). Those keys must not count as the run's survivors: A feeds both rings,
    // the group keeps 1, and a later ring rule must still be free to protect the ring the group
    // DROPPED — even though the Off sibling's untrimmed list still names it.
    let candidates = rings(2);
    let mut off = rule_in("off rings", vec![ARTIFACT_TYPE_RING], 2, group("g", 1, per_rule_mode()), per_rule_mode());
    off.activation = Some(SAFEGUARD_ACTIVATION_OFF.to_string());
    let rules = vec![
        off,
        rule_in("A", vec![ARTIFACT_TYPE_RING], 2, group("g", 1, per_rule_mode()), per_rule_mode()),
        rule_in("after", vec![ARTIFACT_TYPE_RING], 2, None, per_rule_mode()),
    ];
    let entries = scan(candidates, rules);
    assert_eq!(protected(&entries[0]), vec![1, 2], "the Off entry's UI keys are the trap this test sets");
    assert_eq!(protected(&entries[1]), vec![2], "the group keeps its 1");
    assert_eq!(protected(&entries[2]), vec![1], "the dropped ring stays sellable — and rescuable");
}

#[test]
fn a_pick_credited_to_a_sibling_is_not_a_pick_the_group_turned_away() {
    // Anticipate-gaps members reserve placeholders for gear the user lacks; the cap clears them
    // once the shared bucket is turning that member's real contributions away. Both members feed
    // the same 2 rings (count 3 → deficit 1 each). With group room to spare (count 6) B losing
    // both to A's column is dedupe, not a full bucket, so B's placeholder must survive. With the
    // group cut to 1, a real piece each fed was dropped and both members' placeholders go.
    let anticipating = |name: &str, group_count: i64| {
        let mut rule = rule_in(name, vec![ARTIFACT_TYPE_RING], 3, group("g", group_count, per_rule_mode()), per_rule_mode());
        rule.activation = Some(SAFEGUARD_ACTIVATION_ANTICIPATE_GAPS.to_string());
        rule
    };
    let entries = scan(rings(2), vec![anticipating("A", 6), anticipating("B", 6)]);
    assert_eq!(protected(&entries[0]), vec![1, 2]);
    assert!(protected(&entries[1]).is_empty(), "shared pieces sit with the first feeder");
    assert_eq!(entries[0].placeholders.len(), 1, "A still anticipates its missing third ring");
    assert_eq!(entries[1].placeholders.len(), 1, "so does B — nothing it fed was turned away");

    let entries = scan(rings(2), vec![anticipating("A", 1), anticipating("B", 1)]);
    assert_eq!(protected_across(&entries, &[0, 1]), vec![2], "the group keeps its 1");
    assert!(entries[0].placeholders.is_empty(), "A had a real piece dropped — nothing left to anticipate");
    assert!(entries[1].placeholders.is_empty(), "B fed that same dropped piece — same verdict");
}

#[test]
fn an_ignore_previous_member_still_reaches_past_its_siblings_picks() {
    // On the ranking path `ignorePreviousSafeguards` means "do not re-rank what is already
    // protected before me — reach deeper". Siblings evaluated earlier in the run count as
    // "before me" too, exactly as they did when members published inline: A (count 2) takes
    // {5,6}; B (same yardstick, count 2, ignore-previous) ranks the rest and takes {3,4}. Were
    // A's pending picks left out of B's exclusion, B's top 2 would be {5,6} again, the dedupe
    // would credit them to A, and the one toggle that lets a later member feed DIFFERENT pieces
    // would silently stop working — the group would decide over 2 pieces instead of 4.
    let candidates = rings(6);
    let mut b = rule_in("B", vec![ARTIFACT_TYPE_RING], 2, group("g", 4, per_rule_mode()), per_rule_mode());
    b.ignore_previous_safeguards = Some(true);
    let rules = vec![
        rule_in("A", vec![ARTIFACT_TYPE_RING], 2, group("g", 4, per_rule_mode()), per_rule_mode()),
        b,
    ];
    let entries = scan(candidates, rules);
    assert_eq!(protected(&entries[0]), vec![5, 6], "A takes the top 2");
    assert_eq!(protected(&entries[1]), vec![3, 4], "B reaches past A's picks to the next 2");
    assert_eq!(protected_across(&entries, &[0, 1]), vec![3, 4, 5, 6], "the group decides over all 4");
}
