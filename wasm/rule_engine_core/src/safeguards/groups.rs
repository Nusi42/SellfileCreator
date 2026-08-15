// Safeguard groups — the single authority for the structural facts derived from the flat
// `Safeguards` array.
//
// A GROUP is a contiguous run of ordinary safeguards that share one group id. There is no
// header entry and no nesting: every member is a plain rule that evaluates exactly as if it
// were ungrouped, and its own required count sizes the gear it FEEDS the group. The group then
// merges those feeds into buckets keyed by ITS scope chips and keeps ITS required count out of
// each bucket. The group's settings ride inline on every member (`SafeguardWasmGroupIn`); the
// run's first member is the copy the engine reads, and the TypeScript normalizer keeps every
// member of a run identical to it.
//
// Only the group id is needed to answer "which run does this entry belong to" — and that is
// the whole of what this module derives, ONCE, for both the browser (via the
// `safeguard_groups_value` wasm entry that TypeScript calls) and the native DLL (which parses
// .sfc without any TypeScript in the process).
//
// SSOT note: there is deliberately NO TypeScript re-implementation of run resolution. The
// repo's precedent is `getSafeguardCountKey`/`getSafeguardItemKey` ("Keep key derivation in
// wasm so JS cannot drift from detection semantics") and `should_include_recipe`.
use serde::{Deserialize, Serialize};
use ts_rs::TS;

// ts-rs export: minimal per-entry projection TypeScript sends to `safeguard_groups_value`.
// Deliberately tiny — run resolution needs nothing but the id, so the payload stays a few
// bytes per entry even on a 154-rule preset.
#[derive(Debug, Deserialize, Serialize, Clone, Default, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardGroupEntryIn {
    // The entry's group id; absent (None) means ungrouped.
    #[serde(default)]
    pub group_id: Option<String>,
    // True marks a separator (inert divider). A divider is never a member of a group and
    // always ends the run before it — two members with a divider between them are two runs.
    #[serde(default)]
    pub separator: bool,
}

// ts-rs export: the resolved runs TypeScript consumes. Every field is index-aligned with the
// input array, so consumers index it exactly like they index `safeguardRules`.
#[derive(Debug, Serialize, Clone, Default, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct SafeguardGroupsOut {
    // Index of the first entry of the run containing each entry, or -1 when ungrouped.
    pub run_starts: Vec<i64>,
    // Number of entries in that run (0 when ungrouped). `run_starts[i] + run_lens[i]` is the
    // exclusive end, so a run is the half-open index range [start, start + len).
    pub run_lens: Vec<i64>,
    // True when at least one run exists — the fast-path flag that lets every consumer skip
    // group work entirely on the overwhelmingly common flat list.
    pub has_groups: bool,
}

// The id an entry contributes to run resolution: a separator never carries one, whatever a
// hand-edited file claims, and an empty/blank id is the same as none.
fn effective_group_id(entry: &SafeguardGroupEntryIn) -> Option<&str> {
    if entry.separator {
        return None;
    }
    entry
        .group_id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
}

/// Resolves the contiguous runs of a safeguard array in one pass.
///
/// A run is a maximal sequence of ADJACENT non-separator entries carrying the same id. Two
/// non-adjacent stretches with the same id are two runs — the TypeScript normalizer re-ids the
/// later one on the next mutation, and until then each is capped by its own head's settings, so
/// the engine never has to reason about a "split" group. A single-entry run IS reported here
/// (the normalizer dissolves those before they reach the engine, but the resolver stays honest
/// about the array it was given).
pub fn resolve_safeguard_groups(entries: &[SafeguardGroupEntryIn]) -> SafeguardGroupsOut {
    // -1 / 0 mark an ungrouped entry; filled below for every entry inside a run.
    let mut run_starts = vec![-1i64; entries.len()];
    let mut run_lens = vec![0i64; entries.len()];
    let mut has_groups = false;
    let mut cursor = 0usize;
    while cursor < entries.len() {
        // An ungrouped entry (or a divider) is its own unit; step over it.
        let Some(id) = effective_group_id(&entries[cursor]) else {
            cursor += 1;
            continue;
        };
        // Extend the run over every following entry with the same id.
        let mut end = cursor + 1;
        while end < entries.len() && effective_group_id(&entries[end]) == Some(id) {
            end += 1;
        }
        // Stamp every member with the run's start and length.
        for index in cursor..end {
            run_starts[index] = cursor as i64;
            run_lens[index] = (end - cursor) as i64;
        }
        has_groups = true;
        cursor = end;
    }
    SafeguardGroupsOut { run_starts, run_lens, has_groups }
}

#[cfg(test)]
mod groups_tests {
    use super::*;

    // Builds an ungrouped rule entry.
    fn rule() -> SafeguardGroupEntryIn {
        SafeguardGroupEntryIn { group_id: None, separator: false }
    }

    // Builds a rule entry belonging to the given group.
    fn member(id: &str) -> SafeguardGroupEntryIn {
        SafeguardGroupEntryIn { group_id: Some(id.to_string()), separator: false }
    }

    // Builds a divider, optionally carrying a stray group id a hand-edited file might have.
    fn separator(id: Option<&str>) -> SafeguardGroupEntryIn {
        SafeguardGroupEntryIn { group_id: id.map(str::to_string), separator: true }
    }

    #[test]
    fn flat_list_has_no_runs() {
        let out = resolve_safeguard_groups(&[rule(), rule(), rule()]);
        assert_eq!(out.run_starts, vec![-1, -1, -1]);
        assert_eq!(out.run_lens, vec![0, 0, 0]);
        assert!(!out.has_groups);
    }

    #[test]
    fn adjacent_members_form_one_run() {
        // rule, [a, a, a], rule
        let out = resolve_safeguard_groups(&[rule(), member("a"), member("a"), member("a"), rule()]);
        assert_eq!(out.run_starts, vec![-1, 1, 1, 1, -1]);
        assert_eq!(out.run_lens, vec![0, 3, 3, 3, 0]);
        assert!(out.has_groups);
    }

    #[test]
    fn different_ids_are_separate_runs_even_when_touching() {
        // [a, a][b, b] — no gap between the runs, still two groups.
        let out = resolve_safeguard_groups(&[member("a"), member("a"), member("b"), member("b")]);
        assert_eq!(out.run_starts, vec![0, 0, 2, 2]);
        assert_eq!(out.run_lens, vec![2, 2, 2, 2]);
    }

    #[test]
    fn a_gap_splits_a_repeated_id_into_two_runs() {
        // [a, a] rule [a] — the trailing `a` is a separate (single-entry) run, not a member of
        // the first; contiguity is the definition, the id alone is not.
        let out = resolve_safeguard_groups(&[member("a"), member("a"), rule(), member("a")]);
        assert_eq!(out.run_starts, vec![0, 0, -1, 3]);
        assert_eq!(out.run_lens, vec![2, 2, 0, 1]);
    }

    #[test]
    fn a_separator_ends_a_run_and_never_joins_one() {
        // A divider carrying a stray id still breaks the run and is itself ungrouped.
        let out = resolve_safeguard_groups(&[member("a"), separator(Some("a")), member("a")]);
        assert_eq!(out.run_starts, vec![0, -1, 2]);
        assert_eq!(out.run_lens, vec![1, 0, 1]);
    }

    #[test]
    fn blank_ids_are_ungrouped() {
        let blank = SafeguardGroupEntryIn { group_id: Some("  ".to_string()), separator: false };
        let out = resolve_safeguard_groups(&[blank, member("a")]);
        assert_eq!(out.run_starts, vec![-1, 1]);
    }

    #[test]
    fn empty_input_resolves_to_empty_output() {
        // Defensive: a session with no safeguards at all must not panic.
        let out = resolve_safeguard_groups(&[]);
        assert!(out.run_starts.is_empty() && out.run_lens.is_empty() && !out.has_groups);
    }
}
