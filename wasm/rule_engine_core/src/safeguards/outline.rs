// Safeguard outline (bundles) — the single authority for every structural fact derived
// from the flat `Safeguards` array.
//
// The array is an outline, not a list: an entry with `bundle: true` OWNS the promise for the
// entries nested beneath it, and `depth` records the nesting level. A member inside a bundle
// does not keep gear of its own — it FEEDS the bundle: its own required count decides how much
// gear it contributes, and the bundle then merges those contributions into shared buckets and
// keeps its own required count out of each.
//
// Only `depth`, `bundle` and `required_count` are ever stored; parent, subtree span, member
// lists, evaluation order and each bundle's demand are DERIVED — here, once, for both the
// browser (via the `safeguard_outline_value` wasm entry that TypeScript calls) and the native
// DLL (which parses .sfc without any TypeScript in the process).
//
// SSOT note: there is deliberately NO TypeScript re-implementation of anything in this file.
// The repo's existing precedent for exactly this is `getSafeguardCountKey`/`getSafeguardItemKey`
// ("Keep key derivation in wasm so JS cannot drift from detection semantics") and
// `should_include_recipe` in matcher_evaluator.rs. `safeguardFocusGroupKeyFor` is the
// counter-example: an unpinned TS mirror of a Rust key format that has already drifted.
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{SAFEGUARD_OUTLINE_DEFAULT_DEPTH, SAFEGUARD_OUTLINE_MAX_DEPTH};

// ts-rs export: minimal per-entry projection TypeScript sends to `safeguard_outline_value`.
// Deliberately tiny — the outline needs no filters or substats, so the payload stays a few
// bytes per entry even on a 154-rule preset.
#[derive(Debug, Deserialize, Serialize, Clone, Copy, Default, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardOutlineEntryIn {
    // Stored outline level; absent (None) means the generated default depth.
    #[serde(default)]
    pub depth: Option<i64>,
    // True marks a bundle header — the container that owns the promise for its members.
    #[serde(default)]
    pub bundle: bool,
    // True marks a separator (inert divider). Separators occupy a slot and carry a depth
    // like any other entry, but never contribute to a bundle and never contain anything.
    #[serde(default)]
    pub separator: bool,
    // The entry's own required count. On a bundle this IS the demand — a plain editable number,
    // not something derived from the members. On a member it is the size of that member's feed,
    // which the detection scan applies; the outline only needs the bundle's.
    #[serde(default)]
    pub required_count: Option<i64>,
}

// ts-rs export: the resolved outline TypeScript consumes. Every field is index-aligned with
// the input array, so consumers index it exactly like they index `safeguardRules`.
#[derive(Debug, Serialize, Clone, Default, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardOutlineOut {
    // Repaired depth per entry. TypeScript writes these back so the mutation funnel and the
    // native SFC reader can never disagree about the invariant.
    pub depths: Vec<i64>,
    // Index of the bundle header owning each entry, or -1 at top level.
    pub parents: Vec<i64>,
    // How many array slots each entry owns, itself included (1 for a leaf).
    pub spans: Vec<i64>,
    // How many pieces each bundle keeps per merged bucket — its own required count, verbatim.
    // 0 for anything that is not a bundle, and for a bundle with no members to draw from.
    pub demands: Vec<i64>,
    // Evaluation order: post-order over the outline (members before their bundle).
    pub post_order: Vec<i64>,
    // For each entry, the indices of the member rules whose protections it caps. A leaf lists
    // only itself; a bundle lists every non-bundle, non-separator descendant; a separator
    // lists nothing.
    pub pools: Vec<Vec<i64>>,
    // True when at least one entry is a bundle header — the fast-path flag that lets every
    // consumer skip outline work entirely on the overwhelmingly common flat list.
    pub has_bundles: bool,
}

// Depth an entry stores, floored at the default and capped at the nesting limit before the
// structural repair below runs. Malformed/hand-edited files cannot produce an unbounded tree.
fn clamped_stored_depth(entry: &SafeguardOutlineEntryIn) -> i64 {
    // Absent depth means top level (the generated default).
    let raw = entry.depth.unwrap_or(SAFEGUARD_OUTLINE_DEFAULT_DEPTH);
    // Negative depths are meaningless; clamp both ends.
    raw.clamp(SAFEGUARD_OUTLINE_DEFAULT_DEPTH, SAFEGUARD_OUTLINE_MAX_DEPTH)
}

// An entry can hold children only when it is a bundle header — separators and plain rules
// are always leaves, whatever depth a file claims for the entries after them.
fn can_contain(entry: &SafeguardOutlineEntryIn) -> bool {
    entry.bundle && !entry.separator
}

/// Repairs the depth sequence so it describes a well-formed outline.
///
/// Invariant: an entry may sit at most one level deeper than its predecessor, and may only
/// go deeper at all when that predecessor is a bundle header. Anything else (a file edited by
/// hand, a paste that landed mid-bundle, an append import) is pulled up to the deepest legal
/// level rather than rejected — never dropping user entries is the rule that matters here.
pub fn normalize_depths(entries: &[SafeguardOutlineEntryIn]) -> Vec<i64> {
    // Repaired depth per entry, built left to right.
    let mut depths = Vec::<i64>::with_capacity(entries.len());
    // The deepest level the next entry is allowed to claim.
    let mut max_next_depth = SAFEGUARD_OUTLINE_DEFAULT_DEPTH;
    for entry in entries {
        // Never exceed what the preceding entry permits.
        let depth = clamped_stored_depth(entry).min(max_next_depth);
        depths.push(depth);
        // Only a bundle header opens a deeper level for whatever follows it.
        max_next_depth = if can_contain(entry) {
            (depth + 1).min(SAFEGUARD_OUTLINE_MAX_DEPTH)
        } else {
            depth
        };
    }
    depths
}

// Parent index per entry from repaired depths: the nearest preceding entry exactly one level
// shallower. The normalizer guarantees such an entry exists and is a bundle header.
fn resolve_parents(entries: &[SafeguardOutlineEntryIn], depths: &[i64]) -> Vec<i64> {
    // -1 marks a top-level entry with no owning bundle.
    let mut parents = vec![-1i64; entries.len()];
    // Most recently seen entry index at each depth level, used as the parent lookup.
    let mut last_at_depth = vec![-1i64; (SAFEGUARD_OUTLINE_MAX_DEPTH + 1) as usize];
    for (idx, depth) in depths.iter().copied().enumerate() {
        // A nested entry's parent is whatever sits one level up most recently.
        if depth > 0 {
            parents[idx] = last_at_depth[(depth - 1) as usize];
        }
        // Record this entry as the current occupant of its level.
        last_at_depth[depth as usize] = idx as i64;
        // Clear deeper levels so a later sibling cannot inherit a stale descendant.
        for deeper in (depth + 1)..=SAFEGUARD_OUTLINE_MAX_DEPTH {
            last_at_depth[deeper as usize] = -1;
        }
    }
    let _ = entries;
    parents
}

// Subtree span per entry: itself plus every following entry that is strictly deeper, stopping
// at the first entry back at its own level or shallower.
fn resolve_spans(depths: &[i64]) -> Vec<i64> {
    // Every entry owns at least itself.
    let mut spans = vec![1i64; depths.len()];
    for idx in (0..depths.len()).rev() {
        // Walk forward over the contiguous deeper run; reverse iteration makes this O(n)
        // because each child's span is already final when its parent is visited.
        let mut cursor = idx + 1;
        while cursor < depths.len() && depths[cursor] > depths[idx] {
            cursor += spans[cursor] as usize;
        }
        spans[idx] = (cursor - idx) as i64;
    }
    spans
}

/// Resolves how many pieces each bundle keeps per merged bucket.
///
/// This is simply the bundle's own required count — the same editable number every safeguard
/// carries, read straight off the header. A bundle is where the promise lives: its members feed
/// it (each contributing its own count's worth of gear) and it decides what survives, so there
/// is nothing to derive and nothing to override.
///
/// The one structural condition is membership: a bundle with no members has nothing to draw
/// from, and reports 0 so downstream passes skip it instead of keeping an empty promise alive.
fn resolve_demands(entries: &[SafeguardOutlineEntryIn], pools: &[Vec<i64>]) -> Vec<i64> {
    entries
        .iter()
        .enumerate()
        .map(|(idx, entry)| {
            // Only bundles hold a merged-bucket demand.
            if !entry.bundle || entry.separator {
                return 0;
            }
            // Nothing feeds an empty bundle, so it keeps nothing.
            if pools.get(idx).map(Vec::is_empty).unwrap_or(true) {
                return 0;
            }
            // Clamp at 1 like every other required count — 0 would mean "keep nothing".
            entry.required_count.unwrap_or(1).max(1)
        })
        .collect()
}

// Post-order traversal: every entry inside a bundle is emitted before the bundle itself, so a
// bundle's pool is complete when it is evaluated and "previous safeguards" accumulates in a
// well-defined order. On a bundle-free list this is exactly the array order, which is why
// every pre-bundle file keeps evaluating bit-identically.
fn resolve_post_order(depths: &[i64], spans: &[i64]) -> Vec<i64> {
    // Output order, filled by walking the top-level entries left to right.
    let mut order = Vec::<i64>::with_capacity(depths.len());
    // Explicit stack of (index, end) ranges avoids recursion on deep outlines.
    let mut idx = 0usize;
    while idx < depths.len() {
        // Emit one top-level entry's whole subtree, then move past it.
        push_subtree_post_order(idx, spans, &mut order);
        idx += spans[idx] as usize;
    }
    order
}

// Emits one subtree in post-order: children left to right, then the node itself.
fn push_subtree_post_order(idx: usize, spans: &[i64], order: &mut Vec<i64>) {
    // Children occupy the slots between the node and the end of its span.
    let end = idx + spans[idx] as usize;
    let mut cursor = idx + 1;
    while cursor < end {
        push_subtree_post_order(cursor, spans, order);
        cursor += spans[cursor] as usize;
    }
    // The node settles after everything it contains.
    order.push(idx as i64);
}

// Member indices per entry: a plain rule lists itself, a bundle lists every plain-rule
// descendant transitively, a separator lists nothing. This is the set whose protections a
// bundle caps, and the set its demand is derived from.
fn resolve_pools(entries: &[SafeguardOutlineEntryIn], spans: &[i64]) -> Vec<Vec<i64>> {
    entries
        .iter()
        .enumerate()
        .map(|(idx, entry)| {
            // Dividers never contribute or receive candidates.
            if entry.separator {
                return Vec::new();
            }
            // A leaf rule is its own pool.
            if !entry.bundle {
                return vec![idx as i64];
            }
            // A bundle pools every plain-rule entry inside its span.
            let end = idx + spans[idx] as usize;
            ((idx + 1)..end)
                .filter(|child| !entries[*child].bundle && !entries[*child].separator)
                .map(|child| child as i64)
                .collect()
        })
        .collect()
}

/// Resolves the complete outline for a safeguard array in one pass.
///
/// This is the only place any of these facts are computed. Callers index the result exactly
/// as they index the rule array.
pub fn resolve_safeguard_outline(entries: &[SafeguardOutlineEntryIn]) -> SafeguardOutlineOut {
    // Repair first — every later derivation reads the repaired depths, never the stored ones.
    let depths = normalize_depths(entries);
    let parents = resolve_parents(entries, &depths);
    let spans = resolve_spans(&depths);
    let post_order = resolve_post_order(&depths, &spans);
    let pools = resolve_pools(entries, &spans);
    // Demands read the member lists, so they resolve after pooling.
    let demands = resolve_demands(entries, &pools);
    // Fast-path flag so flat lists (the overwhelming majority) skip all outline handling.
    let has_bundles = entries.iter().any(|entry| entry.bundle && !entry.separator);
    SafeguardOutlineOut {
        depths,
        parents,
        spans,
        demands,
        post_order,
        pools,
        has_bundles,
    }
}

#[cfg(test)]
mod outline_tests {
    use super::*;

    // Builds a plain (non-bundle) rule entry at the given stored depth.
    fn rule(depth: i64) -> SafeguardOutlineEntryIn {
        SafeguardOutlineEntryIn { depth: Some(depth), bundle: false, separator: false, required_count: Some(1) }
    }

    // Builds a plain rule carrying a specific required count — the size of its feed.
    fn rule_n(depth: i64, required: i64) -> SafeguardOutlineEntryIn {
        SafeguardOutlineEntryIn { required_count: Some(required), ..rule(depth) }
    }

    // Builds a bundle header entry at the given stored depth.
    fn bundle(depth: i64) -> SafeguardOutlineEntryIn {
        SafeguardOutlineEntryIn { depth: Some(depth), bundle: true, separator: false, required_count: Some(1) }
    }

    // Builds a bundle header carrying a specific required count — what it keeps per bucket.
    fn bundle_n(depth: i64, required: i64) -> SafeguardOutlineEntryIn {
        SafeguardOutlineEntryIn { required_count: Some(required), ..bundle(depth) }
    }

    #[test]
    fn flat_list_is_unchanged_and_evaluates_in_array_order() {
        // Three plain rules: no bundles, no nesting, evaluation order == array order.
        let entries = vec![rule(0), rule(0), rule(0)];
        let out = resolve_safeguard_outline(&entries);
        assert_eq!(out.depths, vec![0, 0, 0]);
        assert_eq!(out.parents, vec![-1, -1, -1]);
        assert_eq!(out.spans, vec![1, 1, 1]);
        assert_eq!(out.post_order, vec![0, 1, 2], "flat lists must keep array order");
        assert!(!out.has_bundles);
        // Nothing caps anything on a flat list.
        assert_eq!(out.demands, vec![0, 0, 0]);
    }

    #[test]
    fn members_resolve_parent_span_and_post_order() {
        // bundle[0] { rule[1], rule[2] }, then a trailing top-level rule[3].
        let entries = vec![bundle(0), rule(1), rule(1), rule(0)];
        let out = resolve_safeguard_outline(&entries);
        assert_eq!(out.parents, vec![-1, 0, 0, -1]);
        assert_eq!(out.spans, vec![3, 1, 1, 1]);
        // Members settle before the bundle that pools them.
        assert_eq!(out.post_order, vec![1, 2, 0, 3]);
        // The bundle caps both members; each member lists only itself.
        assert_eq!(out.pools, vec![vec![1, 2], vec![1], vec![2], vec![3]]);
        assert!(out.has_bundles);
    }

    #[test]
    fn nested_bundles_pool_transitively() {
        // outer[0] { rule[1], inner[2] { rule[3], rule[4] } }
        let entries = vec![bundle(0), rule(1), bundle(1), rule(2), rule(2)];
        let out = resolve_safeguard_outline(&entries);
        assert_eq!(out.parents, vec![-1, 0, 0, 2, 2]);
        assert_eq!(out.spans, vec![5, 1, 3, 1, 1]);
        // Deepest members first, then the inner bundle, then the outer one.
        assert_eq!(out.post_order, vec![1, 3, 4, 2, 0]);
        // The outer bundle pools every plain rule beneath it, including the inner bundle's.
        assert_eq!(out.pools[0], vec![1, 3, 4]);
        assert_eq!(out.pools[2], vec![3, 4]);
    }

    #[test]
    fn a_bundle_keeps_its_own_count_regardless_of_what_members_feed() {
        // The bundle owns the promise: 3, whatever its members' feed sizes happen to be. The
        // members' 5 and 2 size their contributions; they do not vote on the bundle's number.
        let entries = vec![bundle_n(0, 3), rule_n(1, 5), rule_n(1, 2)];
        let out = resolve_safeguard_outline(&entries);
        assert_eq!(out.demands[0], 3);
        // Members hold no merged-bucket demand of their own.
        assert_eq!(out.demands[1], 0);
    }

    #[test]
    fn a_bundle_count_above_every_member_is_honoured() {
        // Nothing clamps the bundle to its members: asking for 9 out of a pool that only ever
        // receives 4 simply keeps whatever arrives. The number is the user's, not derived.
        let out = resolve_safeguard_outline(&[bundle_n(0, 9), rule_n(1, 2), rule_n(1, 2)]);
        assert_eq!(out.demands[0], 9);
    }

    #[test]
    fn a_nested_bundle_carries_its_own_count() {
        // outer(3) { rule, inner(1) { rule } } — each header keeps its own number; the inner
        // bundle's output then feeds the outer one.
        let entries = vec![bundle_n(0, 3), rule_n(1, 2), bundle_n(1, 1), rule_n(2, 4)];
        let out = resolve_safeguard_outline(&entries);
        assert_eq!(out.demands[0], 3);
        assert_eq!(out.demands[2], 1);
    }

    #[test]
    fn an_empty_bundle_demands_nothing() {
        // Nothing feeds it ⇒ no promise, rather than an empty one the cap pass would still run.
        let out = resolve_safeguard_outline(&[bundle_n(0, 4), rule(0)]);
        assert_eq!(out.demands[0], 0);
    }

    #[test]
    fn depth_jumps_and_orphans_are_repaired_not_dropped() {
        // A rule claiming depth 3 after a top-level rule cannot nest — nothing contains it.
        let entries = vec![rule(0), rule(3), bundle(0), rule(9)];
        let out = resolve_safeguard_outline(&entries);
        // Pulled up to its predecessor's level; the post-bundle entry may go exactly one deeper.
        assert_eq!(out.depths, vec![0, 0, 0, 1]);
        assert_eq!(out.parents, vec![-1, -1, -1, 2]);
        // All four entries survive — repairing never discards user data.
        assert_eq!(out.spans.len(), 4);
    }

    #[test]
    fn depth_is_capped_at_the_generated_limit() {
        // A chain of bundles deeper than the cap flattens at the limit rather than growing.
        let mut entries = Vec::new();
        for level in 0..(SAFEGUARD_OUTLINE_MAX_DEPTH + 3) {
            entries.push(bundle(level));
        }
        let out = resolve_safeguard_outline(&entries);
        assert!(
            out.depths.iter().all(|d| *d <= SAFEGUARD_OUTLINE_MAX_DEPTH),
            "depths must never exceed SAFEGUARD_OUTLINE_MAX_DEPTH",
        );
    }

    #[test]
    fn separators_are_inert_inside_an_outline() {
        // A separator nested in a bundle keeps its slot but is never a member of it.
        let separator = SafeguardOutlineEntryIn {
            depth: Some(1),
            bundle: false,
            separator: true,
            required_count: Some(1),
        };
        let entries = vec![bundle(0), separator, rule(1)];
        let out = resolve_safeguard_outline(&entries);
        assert_eq!(out.pools[1], Vec::<i64>::new());
        // The separator is not a member of the bundle either.
        assert_eq!(out.pools[0], vec![2]);
    }

    #[test]
    fn an_empty_bundle_is_legal_and_pools_nothing() {
        // Grouping then deleting the members must not corrupt the outline.
        let entries = vec![bundle(0), rule(0)];
        let out = resolve_safeguard_outline(&entries);
        assert_eq!(out.spans, vec![1, 1]);
        assert_eq!(out.pools[0], Vec::<i64>::new());
    }

    #[test]
    fn empty_input_resolves_to_empty_output() {
        // Defensive: a session with no safeguards at all must not panic.
        let out = resolve_safeguard_outline(&[]);
        assert!(out.depths.is_empty() && out.post_order.is_empty() && !out.has_bundles);
        assert!(out.demands.is_empty());
    }
}
