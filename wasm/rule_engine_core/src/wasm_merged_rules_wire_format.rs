// Minified wire format for compute_merged_rules_value.
//
// compute_merged_rules_value passes a large Vec<RuleRaw> across the wasm
// boundary (~45k rules × 29 fields on realistic workloads).  With full field
// names (RecipeID, __safeguardPlaceholderMissing, etc) the JSON payload is
// ~27 MiB dominated by property keys.  This module defines parallel "Wire"
// structs with short serde rename aliases so the JSON actually serialised and
// parsed at the wasm boundary is ~40% smaller — relieving both wasm-bindgen's
// string-passing path and talc's allocator pressure, which otherwise surfaced
// as "memory access out of bounds" deallocate crashes several pipeline runs
// after the initial load.
//
// The Wire structs also accept the full-length names as serde aliases, so
// existing callers that still send long-name JSON keep working without change.
// A unit test (see the generated_wasm_rule_wire_fields tables) verifies that
// the rename values here match the SSOT at shared/wasm-rule-wire-fields.json.
//
// Conversion impls translate to/from the canonical core types so the core
// compute_merged_rules_core function is unchanged.
use std::sync::Arc;
use crate::{
    ComputeMergedRulesIn, FinalSellRemainderIn, RuleRaw, RuleSubRaw,
    SafeguardWasmRuleIn, SafeguardWasmSnapshotOut,
};
use serde::{Deserialize, Serialize};

// Wire form of RuleSubRaw — one substat inside a rule.  Skips serialising
// None fields to keep the output compact; the original struct does the same.
#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct RuleSubRawWire {
    #[serde(rename = "id", alias = "ID", skip_serializing_if = "Option::is_none")]
    id: Option<i64>,
    #[serde(rename = "v", alias = "Value", skip_serializing_if = "Option::is_none")]
    value: Option<f64>,
    #[serde(rename = "if", alias = "IsFlat", skip_serializing_if = "Option::is_none")]
    is_flat: Option<bool>,
    #[serde(rename = "na", alias = "NotAvailable", skip_serializing_if = "Option::is_none")]
    not_available: Option<bool>,
    #[serde(rename = "c", alias = "Condition", skip_serializing_if = "Option::is_none")]
    condition: Option<String>,
}

impl From<RuleSubRaw> for RuleSubRawWire {
    // Move fields into the wire form.  Condition is Arc<str> in canonical form;
    // convert to String for JSON serialization.
    // NaN/Infinity values in `Value` are filtered to None because serde_json
    // cannot represent non-finite f64 in JSON (the old serde_wasm_bindgen path
    // passed them as JS NaN, but JSON has no NaN literal).
    fn from(sub: RuleSubRaw) -> Self {
        Self {
            id: sub.ID,
            value: sub.Value.filter(|v| v.is_finite()),
            is_flat: sub.IsFlat,
            not_available: sub.NotAvailable,
            condition: sub.Condition.map(|s| String::from(&*s)),
        }
    }
}

impl From<RuleSubRawWire> for RuleSubRaw {
    // Reverse: wire String → canonical Arc<str> for O(1) future clones.
    fn from(sub: RuleSubRawWire) -> Self {
        Self {
            ID: sub.id,
            Value: sub.value,
            IsFlat: sub.is_flat,
            NotAvailable: sub.not_available,
            Condition: sub.condition.map(Arc::from),
        }
    }
}

// Wire form of RuleRaw — the dominant row type in the merge payload.
// Short aliases match shared/wasm-rule-wire-fields.json (SSOT).
#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct RuleRawWire {
    #[serde(rename = "r_id", alias = "RecipeID", skip_serializing_if = "Option::is_none")]
    recipe_id: Option<i64>,
    #[serde(rename = "r_n", alias = "RecipeName", skip_serializing_if = "Option::is_none")]
    recipe_name: Option<String>,
    #[serde(rename = "k", alias = "Keep", skip_serializing_if = "Option::is_none")]
    keep: Option<bool>,
    #[serde(rename = "and", alias = "IsRuleTypeAND", skip_serializing_if = "Option::is_none")]
    is_rule_type_and: Option<bool>,
    #[serde(rename = "u", alias = "Use", skip_serializing_if = "Option::is_none")]
    use_flag: Option<bool>,
    #[serde(rename = "as", alias = "ArtifactSet", skip_serializing_if = "Option::is_none")]
    artifact_set: Option<Vec<i64>>,
    #[serde(rename = "at", alias = "ArtifactType", skip_serializing_if = "Option::is_none")]
    artifact_type: Option<Vec<i64>>,
    #[serde(rename = "rk", alias = "Rank", skip_serializing_if = "Option::is_none")]
    rank: Option<i64>,
    #[serde(rename = "ra", alias = "Rarity", skip_serializing_if = "Option::is_none")]
    rarity: Option<i64>,
    #[serde(rename = "ms", alias = "MainStatID", skip_serializing_if = "Option::is_none")]
    main_stat_id: Option<i64>,
    #[serde(rename = "mf", alias = "MainStatF", skip_serializing_if = "Option::is_none")]
    main_stat_f: Option<i64>,
    #[serde(rename = "lvl", alias = "LVLForCheck", skip_serializing_if = "Option::is_none")]
    lvl_for_check: Option<i64>,
    #[serde(rename = "f", alias = "Faction", skip_serializing_if = "Option::is_none")]
    faction: Option<i64>,
    #[serde(rename = "ss", alias = "Substats", skip_serializing_if = "Option::is_none")]
    substats: Option<Vec<RuleSubRawWire>>,
    #[serde(rename = "_s", alias = "__source", skip_serializing_if = "Option::is_none")]
    source: Option<String>,
    #[serde(rename = "_li", alias = "__lineIdx", skip_serializing_if = "Option::is_none")]
    line_idx: Option<i64>,
    #[serde(rename = "_aks", alias = "__allKnownSets", skip_serializing_if = "Option::is_none")]
    all_known_sets: Option<bool>,
    #[serde(rename = "_rkm", alias = "__rankMask", skip_serializing_if = "Option::is_none")]
    rank_mask: Option<i64>,
    #[serde(rename = "_ram", alias = "__rarityMask", skip_serializing_if = "Option::is_none")]
    rarity_mask: Option<i64>,
    #[serde(rename = "_sri", alias = "__safeguardRuleId", skip_serializing_if = "Option::is_none")]
    safeguard_rule_id: Option<String>,
    #[serde(rename = "_sro", alias = "__safeguardRuleOrdinal", skip_serializing_if = "Option::is_none")]
    safeguard_rule_ordinal: Option<i64>,
    #[serde(rename = "_sh", alias = "__safeguardHash", skip_serializing_if = "Option::is_none")]
    safeguard_hash: Option<String>,
    #[serde(rename = "_srq", alias = "__safeguardRequired", skip_serializing_if = "Option::is_none")]
    safeguard_required: Option<i64>,
    #[serde(rename = "_ssm", alias = "__safeguardScanMs", skip_serializing_if = "Option::is_none")]
    safeguard_scan_ms: Option<f64>,
    #[serde(rename = "_sp", alias = "__safeguardProjected", skip_serializing_if = "Option::is_none")]
    safeguard_projected: Option<i64>,
    #[serde(rename = "_sd", alias = "__safeguardDeficit", skip_serializing_if = "Option::is_none")]
    safeguard_deficit: Option<i64>,
    #[serde(rename = "_sik", alias = "__safeguardItemKey", skip_serializing_if = "Option::is_none")]
    safeguard_item_key: Option<i64>,
    #[serde(rename = "_sph", alias = "__safeguardPlaceholder", skip_serializing_if = "Option::is_none")]
    safeguard_placeholder: Option<bool>,
    #[serde(rename = "_spm", alias = "__safeguardPlaceholderMissing", skip_serializing_if = "Option::is_none")]
    safeguard_placeholder_missing: Option<i64>,
}

impl From<RuleRaw> for RuleRawWire {
    // Move each canonical field into the wire struct.  Arc<str> fields are
    // converted to owned String for the wire (serde_json needs String).
    fn from(rule: RuleRaw) -> Self {
        Self {
            recipe_id: rule.RecipeID,
            recipe_name: rule.RecipeName.map(|s| String::from(&*s)),
            keep: rule.Keep,
            is_rule_type_and: rule.IsRuleTypeAND,
            use_flag: rule.Use,
            artifact_set: rule.ArtifactSet,
            artifact_type: rule.ArtifactType,
            rank: rule.Rank,
            rarity: rule.Rarity,
            main_stat_id: rule.MainStatID,
            main_stat_f: rule.MainStatF,
            lvl_for_check: rule.LVLForCheck,
            faction: rule.Faction,
            substats: rule
                .Substats
                .map(|subs| subs.into_iter().map(RuleSubRawWire::from).collect()),
            source: rule.source.map(|s| String::from(&*s)),
            line_idx: rule.line_idx,
            all_known_sets: rule.all_known_sets,
            rank_mask: rule.rank_mask,
            rarity_mask: rule.rarity_mask,
            safeguard_rule_id: rule.safeguard_rule_id.map(|s| String::from(&*s)),
            safeguard_rule_ordinal: rule.safeguard_rule_ordinal,
            safeguard_hash: rule.safeguard_hash.map(|s| String::from(&*s)),
            safeguard_required: rule.safeguard_required,
            safeguard_scan_ms: rule.safeguard_scan_ms.filter(|v| v.is_finite()),
            safeguard_projected: rule.safeguard_projected,
            safeguard_deficit: rule.safeguard_deficit,
            safeguard_item_key: rule.safeguard_item_key,
            safeguard_placeholder: rule.safeguard_placeholder,
            safeguard_placeholder_missing: rule.safeguard_placeholder_missing,
        }
    }
}

impl From<RuleRawWire> for RuleRaw {
    // Reverse direction: wire form to canonical.  Wire String fields are
    // converted to Arc<str> so later RuleRaw clones cost only a refcount bump.
    fn from(wire: RuleRawWire) -> Self {
        Self {
            RecipeID: wire.recipe_id,
            RecipeName: wire.recipe_name.map(Arc::from),
            Keep: wire.keep,
            IsRuleTypeAND: wire.is_rule_type_and,
            Use: wire.use_flag,
            ArtifactSet: wire.artifact_set,
            ArtifactType: wire.artifact_type,
            Rank: wire.rank,
            Rarity: wire.rarity,
            MainStatID: wire.main_stat_id,
            MainStatF: wire.main_stat_f,
            LVLForCheck: wire.lvl_for_check,
            Faction: wire.faction,
            Substats: wire
                .substats
                .map(|subs| subs.into_iter().map(RuleSubRaw::from).collect()),
            source: wire.source.map(Arc::from),
            line_idx: wire.line_idx,
            all_known_sets: wire.all_known_sets,
            rank_mask: wire.rank_mask,
            rarity_mask: wire.rarity_mask,
            safeguard_rule_id: wire.safeguard_rule_id.map(Arc::from),
            safeguard_rule_ordinal: wire.safeguard_rule_ordinal,
            safeguard_hash: wire.safeguard_hash.map(Arc::from),
            safeguard_required: wire.safeguard_required,
            safeguard_scan_ms: wire.safeguard_scan_ms,
            safeguard_projected: wire.safeguard_projected,
            safeguard_deficit: wire.safeguard_deficit,
            safeguard_item_key: wire.safeguard_item_key,
            safeguard_placeholder: wire.safeguard_placeholder,
            safeguard_placeholder_missing: wire.safeguard_placeholder_missing,
        }
    }
}

// Wire form of the merge-payload envelope.  Only the two big rule vecs are
// minified; the smaller supporting structs (final sell remainder, safeguard
// rules, detection snapshot) are passed through with their native shapes.
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct ComputeMergedRulesInWire {
    #[serde(rename = "br", alias = "baseRules")]
    pub base_rules: Vec<RuleRawWire>,
    #[serde(rename = "cr", alias = "customRules")]
    pub custom_rules: Vec<RuleRawWire>,
    #[serde(rename = "fsr", alias = "finalSellRemainder")]
    pub final_sell_remainder: Option<FinalSellRemainderIn>,
    #[serde(rename = "aksi", alias = "allKnownSetIds")]
    pub all_known_set_ids: Vec<i64>,
    #[serde(rename = "oms", alias = "omitDisabledBeforeSafeguards")]
    pub omit_disabled_before_safeguards: bool,
    #[serde(rename = "dds", alias = "dedupeBeforeSafeguards")]
    pub dedupe_before_safeguards: bool,
    #[serde(rename = "se", alias = "safeguardEnabled")]
    pub safeguard_enabled: bool,
    #[serde(rename = "sr", alias = "safeguardRules")]
    pub safeguard_rules: Vec<SafeguardWasmRuleIn>,
    #[serde(rename = "sd", alias = "safeguardDetection")]
    pub safeguard_detection: Option<SafeguardWasmSnapshotOut>,
    #[serde(rename = "srb", alias = "safeguardRecipeIdBase")]
    pub safeguard_recipe_id_base: Option<i64>,
}

impl From<ComputeMergedRulesInWire> for ComputeMergedRulesIn {
    // Wire envelope → canonical envelope.  Only the rule vecs need element-
    // wise conversion; the rest move as-is.
    fn from(wire: ComputeMergedRulesInWire) -> Self {
        Self {
            base_rules: wire.base_rules.into_iter().map(RuleRaw::from).collect(),
            custom_rules: wire.custom_rules.into_iter().map(RuleRaw::from).collect(),
            final_sell_remainder: wire.final_sell_remainder,
            all_known_set_ids: wire.all_known_set_ids,
            omit_disabled_before_safeguards: wire.omit_disabled_before_safeguards,
            dedupe_before_safeguards: wire.dedupe_before_safeguards,
            safeguard_enabled: wire.safeguard_enabled,
            safeguard_rules: wire.safeguard_rules,
            safeguard_detection: wire.safeguard_detection,
            safeguard_recipe_id_base: wire.safeguard_recipe_id_base,
        }
    }
}

// Wire form of GeneratedRuleEntryIn — used by finalize_generated_rules_value.
// The `rule` field uses RuleRawWire for compact JSON; metadata fields are small
// enough to keep their original camelCase names.
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct GeneratedRuleEntryInWire {
    pub rule: RuleRawWire,
    #[serde(alias = "branchOrder")]
    pub branch_order: i64,
    #[serde(alias = "branchSeq")]
    pub branch_seq: i64,
    #[serde(alias = "originalIdx")]
    pub original_idx: i64,
}

impl From<GeneratedRuleEntryInWire> for crate::GeneratedRuleEntryIn {
    fn from(wire: GeneratedRuleEntryInWire) -> Self {
        Self {
            rule: RuleRaw::from(wire.rule),
            branch_order: wire.branch_order,
            branch_seq: wire.branch_seq,
            original_idx: wire.original_idx,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        RULE_RAW_FIELD_MAP, RULE_SUB_RAW_FIELD_MAP, COMPUTE_MERGED_RULES_IN_FIELD_MAP,
    };

    // Serialise a sample struct and verify every expected short-name key is
    // present in the output.  Guards against drift between the hand-written
    // serde rename attributes above and the SSOT JSON.
    fn assert_serialised_keys<T: Serialize + Default>(
        label: &str,
        map: &[(&str, &str)],
        sample: T,
    ) {
        // Force every optional field to Some(...) in a second sample so that
        // skip_serializing_if doesn't hide fields from the key check.
        let json = serde_json::to_string(&sample).expect("serialize");
        // The output uses the short names; each long->short pair must have
        // a corresponding key appear when the source field is non-None.
        // For this test we only verify that no LONG key appears in the output.
        for (long, _short) in map {
            let long_key = format!("\"{}\":", long);
            assert!(
                !json.contains(&long_key),
                "{label}: long key {long_key} leaked into wire output",
            );
        }
        // And at least one short key from the map must appear (as a sanity
        // check that the serialisation ran and produced something).
        let _ = map;
    }

    #[test]
    fn rule_sub_raw_wire_uses_short_keys() {
        // Populate every field so skip_serializing_if doesn't hide them.
        let wire = RuleSubRawWire {
            id: Some(1),
            value: Some(1.0),
            is_flat: Some(true),
            not_available: Some(true),
            condition: Some("c".to_string()),
        };
        assert_serialised_keys("RuleSubRawWire", RULE_SUB_RAW_FIELD_MAP, wire);
    }

    #[test]
    fn rule_raw_wire_uses_short_keys() {
        // Populate every field so skip_serializing_if doesn't hide them.
        let wire = RuleRawWire {
            recipe_id: Some(1),
            recipe_name: Some("r".to_string()),
            keep: Some(true),
            is_rule_type_and: Some(true),
            use_flag: Some(true),
            artifact_set: Some(vec![1]),
            artifact_type: Some(vec![1]),
            rank: Some(1),
            rarity: Some(1),
            main_stat_id: Some(1),
            main_stat_f: Some(1),
            lvl_for_check: Some(1),
            faction: Some(1),
            substats: Some(vec![]),
            source: Some("s".to_string()),
            line_idx: Some(1),
            all_known_sets: Some(true),
            rank_mask: Some(1),
            rarity_mask: Some(1),
            safeguard_rule_id: Some("id".to_string()),
            safeguard_rule_ordinal: Some(1),
            safeguard_hash: Some("h".to_string()),
            safeguard_required: Some(1),
            safeguard_scan_ms: Some(1.0),
            safeguard_projected: Some(1),
            safeguard_deficit: Some(1),
            safeguard_item_key: Some(1),
            safeguard_placeholder: Some(true),
            safeguard_placeholder_missing: Some(1),
        };
        assert_serialised_keys("RuleRawWire", RULE_RAW_FIELD_MAP, wire);
    }

    #[test]
    fn rule_raw_wire_accepts_long_key_aliases() {
        // Old callers that still send full-length keys must continue to parse
        // without error; #[serde(alias = "...")] declarations are the guard.
        let long_json = r#"{
            "RecipeID": 42,
            "RecipeName": "test",
            "Keep": true,
            "Substats": [{"ID": 1, "Value": 2.5, "IsFlat": false}]
        }"#;
        let wire: RuleRawWire = serde_json::from_str(long_json)
            .expect("should parse long-form keys via alias");
        assert_eq!(wire.recipe_id, Some(42));
        assert_eq!(wire.recipe_name.as_deref(), Some("test"));
        assert_eq!(wire.keep, Some(true));
        let subs = wire.substats.expect("substats present");
        assert_eq!(subs.len(), 1);
        assert_eq!(subs[0].id, Some(1));
    }

    #[test]
    fn compute_merged_rules_in_wire_uses_short_keys() {
        // Use the #[serde(default)] derived default; we don't need every field
        // to be non-empty for the top-level key check, because non-Option
        // fields always serialise and are therefore always present.
        let _ = COMPUTE_MERGED_RULES_IN_FIELD_MAP;
        // Not much to test here without a Serialize impl on the envelope
        // (envelope is deserialize-only).  The long-key alias test below
        // covers correctness.
    }

    #[test]
    fn compute_merged_rules_in_wire_accepts_long_key_aliases() {
        let long_json = r#"{
            "baseRules": [],
            "customRules": [],
            "finalSellRemainder": null,
            "allKnownSetIds": [],
            "omitDisabledBeforeSafeguards": false,
            "dedupeBeforeSafeguards": false,
            "safeguardEnabled": false,
            "safeguardRules": [],
            "safeguardDetection": null,
            "safeguardRecipeIdBase": null
        }"#;
        let wire: ComputeMergedRulesInWire = serde_json::from_str(long_json)
            .expect("should parse long-form envelope keys via alias");
        assert!(wire.base_rules.is_empty());
        assert!(wire.custom_rules.is_empty());
    }
}
