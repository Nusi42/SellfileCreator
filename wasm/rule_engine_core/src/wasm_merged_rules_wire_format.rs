// Minified wire format for compute_merged_rules_value.
//
// compute_merged_rules_value passes a large Vec<RuleRaw> across the wasm
// boundary (~45k rules × 29 fields on realistic workloads).  With full field
// names (RecipeID, __safeguardPlaceholderMissing, etc) the JSON payload is
// ~27 MiB dominated by property keys.  This module defines parallel "Wire"
// structs with short serde renames so the JSON actually serialised and
// parsed at the wasm boundary is ~40% smaller — relieving both wasm-bindgen's
// string-passing path and talc's allocator pressure, which otherwise surfaced
// as "memory access out of bounds" deallocate crashes several pipeline runs
// after the initial load.
//
// The Wire structs also accept the full-length names as serde aliases, so
// existing callers that still send long-name JSON keep working without change.
// The serde rename attributes in this file ARE the SSOT for wire field names;
// the generated_wasm_rule_wire_fields.rs table file has been deleted.
//
// Conversion impls translate to/from the canonical core types so the core
// compute_merged_rules_core function is unchanged.
use std::sync::Arc;
use ts_rs::TS;
use crate::{
    ComputeMergedRulesIn, FinalSellRemainderIn, RuleRaw, RuleSubRaw,
    SafeguardWasmRuleIn, SafeguardWasmSnapshotOut,
};
use serde::{Deserialize, Serialize};

// Wire form of RuleSubRaw — one substat inside a rule.  Skips serialising
// None fields to keep the output compact; the original struct does the same.
// ts-rs generates the short-name TypeScript type so wireProjections.ts can
// reference it as the typed target of projectRuleSubRawToWire.
#[derive(Debug, Default, Deserialize, Serialize, TS)]
#[serde(default, deny_unknown_fields)]
#[ts(export)]
pub struct RuleSubRawWire {
    #[serde(rename = "id", alias = "ID", skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
    #[serde(rename = "v", alias = "Value", skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    #[serde(rename = "if", alias = "IsFlat", skip_serializing_if = "Option::is_none")]
    pub is_flat: Option<bool>,
    #[serde(rename = "na", alias = "NotAvailable", skip_serializing_if = "Option::is_none")]
    pub not_available: Option<bool>,
    #[serde(rename = "c", alias = "Condition", skip_serializing_if = "Option::is_none")]
    pub condition: Option<String>,
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
// Short field names match the SSOT defined by these serde rename attrs.
// ts-rs generates the TypeScript interface so wireProjections.ts can type the
// projectRuleRawToWire return value against the Rust-declared field names.
#[derive(Debug, Default, Deserialize, Serialize, TS)]
#[serde(default, deny_unknown_fields)]
#[ts(export)]
pub struct RuleRawWire {
    #[serde(rename = "r_id", alias = "RecipeID", skip_serializing_if = "Option::is_none")]
    pub recipe_id: Option<i64>,
    #[serde(rename = "r_n", alias = "RecipeName", skip_serializing_if = "Option::is_none")]
    pub recipe_name: Option<String>,
    #[serde(rename = "k", alias = "Keep", skip_serializing_if = "Option::is_none")]
    pub keep: Option<bool>,
    #[serde(rename = "and", alias = "IsRuleTypeAND", skip_serializing_if = "Option::is_none")]
    pub is_rule_type_and: Option<bool>,
    #[serde(rename = "u", alias = "Use", skip_serializing_if = "Option::is_none")]
    pub use_flag: Option<bool>,
    #[serde(rename = "as", alias = "ArtifactSet", skip_serializing_if = "Option::is_none")]
    pub artifact_set: Option<Vec<i64>>,
    #[serde(rename = "at", alias = "ArtifactType", skip_serializing_if = "Option::is_none")]
    pub artifact_type: Option<Vec<i64>>,
    #[serde(rename = "rk", alias = "Rank", skip_serializing_if = "Option::is_none")]
    pub rank: Option<i64>,
    #[serde(rename = "ra", alias = "Rarity", skip_serializing_if = "Option::is_none")]
    pub rarity: Option<i64>,
    #[serde(rename = "ms", alias = "MainStatID", skip_serializing_if = "Option::is_none")]
    pub main_stat_id: Option<i64>,
    #[serde(rename = "mf", alias = "MainStatF", skip_serializing_if = "Option::is_none")]
    pub main_stat_f: Option<i64>,
    #[serde(rename = "lvl", alias = "LVLForCheck", skip_serializing_if = "Option::is_none")]
    pub lvl_for_check: Option<i64>,
    #[serde(rename = "f", alias = "Faction", skip_serializing_if = "Option::is_none")]
    pub faction: Option<i64>,
    #[serde(rename = "ss", alias = "Substats", skip_serializing_if = "Option::is_none")]
    pub substats: Option<Vec<RuleSubRawWire>>,
    #[serde(rename = "_s", alias = "__source", skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(rename = "_li", alias = "__lineIdx", skip_serializing_if = "Option::is_none")]
    pub line_idx: Option<i64>,
    #[serde(rename = "_aks", alias = "__allKnownSets", skip_serializing_if = "Option::is_none")]
    pub all_known_sets: Option<bool>,
    #[serde(rename = "_rkm", alias = "__rankMask", skip_serializing_if = "Option::is_none")]
    pub rank_mask: Option<i64>,
    #[serde(rename = "_ram", alias = "__rarityMask", skip_serializing_if = "Option::is_none")]
    pub rarity_mask: Option<i64>,
    #[serde(rename = "_sri", alias = "__safeguardRuleId", skip_serializing_if = "Option::is_none")]
    pub safeguard_rule_id: Option<String>,
    #[serde(rename = "_sro", alias = "__safeguardRuleOrdinal", skip_serializing_if = "Option::is_none")]
    pub safeguard_rule_ordinal: Option<i64>,
    #[serde(rename = "_sh", alias = "__safeguardHash", skip_serializing_if = "Option::is_none")]
    pub safeguard_hash: Option<String>,
    #[serde(rename = "_srq", alias = "__safeguardRequired", skip_serializing_if = "Option::is_none")]
    pub safeguard_required: Option<i64>,
    #[serde(rename = "_ssm", alias = "__safeguardScanMs", skip_serializing_if = "Option::is_none")]
    pub safeguard_scan_ms: Option<f64>,
    #[serde(rename = "_sp", alias = "__safeguardProjected", skip_serializing_if = "Option::is_none")]
    pub safeguard_projected: Option<i64>,
    #[serde(rename = "_sd", alias = "__safeguardDeficit", skip_serializing_if = "Option::is_none")]
    pub safeguard_deficit: Option<i64>,
    #[serde(rename = "_sik", alias = "__safeguardItemKey", skip_serializing_if = "Option::is_none")]
    pub safeguard_item_key: Option<i64>,
    #[serde(rename = "_sph", alias = "__safeguardPlaceholder", skip_serializing_if = "Option::is_none")]
    pub safeguard_placeholder: Option<bool>,
    #[serde(rename = "_spm", alias = "__safeguardPlaceholderMissing", skip_serializing_if = "Option::is_none")]
    pub safeguard_placeholder_missing: Option<i64>,
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
#[serde(default, deny_unknown_fields)]
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

// Wire form of the INVARIANT HALF of the merge payload — every input that is constant
// across endpoint pushes within a session: the base+custom rules that produce the cacheable
// `generated_rules`, PLUS the safeguard rule definitions (small, but equally session-stable;
// paired per push with the changing detection snapshot to build candidate keep-rules). Sent
// to WASM once per rules-change via cache_generated_rules_value, not on every push.
// Field renames mirror ComputeMergedRulesInWire exactly (SSOT) for the shared subset.
#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct CacheGeneratedRulesInWire {
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
}

// Wire form of the PER-PUSH HALF of the merge payload — only the inputs that genuinely
// change per endpoint push: the safeguard detection snapshot (matched artifacts). The
// rules + safeguard definitions come from the cache. Sent on every push to
// compute_merged_rules_cached_value. Field renames mirror ComputeMergedRulesInWire (SSOT).
#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct ComputeMergedRulesCachedInWire {
    #[serde(rename = "sd", alias = "safeguardDetection")]
    pub safeguard_detection: Option<SafeguardWasmSnapshotOut>,
    #[serde(rename = "srb", alias = "safeguardRecipeIdBase")]
    pub safeguard_recipe_id_base: Option<i64>,
}

// Wire form of GeneratedRuleEntryIn — used by finalize_generated_rules_value.
// The `rule` field uses RuleRawWire for compact JSON; metadata fields are small
// enough to keep their original camelCase names.
#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
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
