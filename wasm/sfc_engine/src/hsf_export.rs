// hsf_export — turn a merged rule list into the text of a `.hsf` file.
//
// The app writes a sellfile from the SAME merged rules the decision pipeline evaluates
// against (src/lib/hsfIO.ts). This module is the native mirror of that writer, so a
// caller holding the DLL can produce a file RSL Helper loads without re-implementing the
// shape — and, critically, without needing to know which rules came from recipes,
// safeguards or the final-sell catch-all.
//
// Mirrors of `cleanHsfForExport` + `buildHsfFileFromMerged` + `hsfToBlob`:
//   - UI-only `__`-prefixed metadata is stripped (it is diagnostics, not schema),
//   - RecipeID / RecipeName lead each rule, the rest follows in builder order,
//   - a 1-based RowIdx closes it, so a host can recover preview ordering after merges,
//   - final-sell rows export under one fixed label,
//   - the container is {"Rules":[...]} pretty-printed with two spaces.

use serde_json::{Map, Value};

use rule_engine_core::{RuleRaw, RULE_SOURCE_FINAL_SELL};

// The label every final-sell row exports under, regardless of which recipe id it carries.
// RSL Helper displays this name, so it is part of the file contract rather than cosmetic.
// Mirrors FINAL_SELL_EXPORT_NAME in src/lib/hsfIO.ts.
const FINAL_SELL_EXPORT_NAME: &str = "Final Sell";

// The UI-only fields the app strips on export. They all start with `__`, which is exactly
// the test the TS side's field list encodes one name at a time — checking the prefix keeps
// this from drifting the moment a new diagnostic field is added on either side.
fn is_ui_metadata_key(key: &str) -> bool {
    key.starts_with("__")
}

// Serialise one rule into its exported object, in the app's field order.
//
// Ordering is not cosmetic here: it is what makes a generated file diff-comparable against
// one the app wrote for the same sellfile, which is how a caller checks it got the same
// answer.
fn export_rule(rule: &RuleRaw, row_idx: usize) -> Result<Value, String> {
    // Round-trip through serde so the field set and the wire names come from RuleRaw's own
    // serde attributes — a second hand-written field list here would be a copy that drifts.
    let encoded = serde_json::to_value(rule).map_err(|e| format!("Rule encode error: {e}"))?;
    let Value::Object(fields) = encoded else {
        return Err("Rule did not encode as a JSON object".to_string());
    };

    // Final-sell rows are renamed; every other row keeps the name its recipe gave it.
    let is_final_sell = rule.source.as_deref() == Some(RULE_SOURCE_FINAL_SELL);
    // A blank name exports as absent, matching the app: an empty string would render as an
    // empty line in RSL Helper rather than as "unnamed".
    let recipe_name: Option<String> = if is_final_sell {
        Some(FINAL_SELL_EXPORT_NAME.to_string())
    } else {
        rule.RecipeName
            .as_deref()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(str::to_owned)
    };

    let mut out = Map::new();
    // RecipeID and RecipeName lead, and only when they carry something.
    if let Some(recipe_id) = rule.RecipeID {
        out.insert("RecipeID".to_string(), Value::from(recipe_id));
    }
    if let Some(name) = recipe_name {
        out.insert("RecipeName".to_string(), Value::from(name));
    }
    // Then every schema field in RuleRaw's declared order, minus the two hoisted above,
    // minus the UI-only diagnostics, minus nulls (an omitted field means "Any").
    for (key, value) in fields {
        if key == "RecipeID" || key == "RecipeName" || is_ui_metadata_key(&key) || value.is_null() {
            continue;
        }
        out.insert(key, value);
    }
    // The stable 1-based row index closes the object, as it does in the app's export.
    out.insert("RowIdx".to_string(), Value::from(row_idx));
    Ok(Value::Object(out))
}

/// Render a merged rule list as the full text of a `.hsf` file.
///
/// The result is the exact `{"Rules":[…]}` container the app downloads, pretty-printed the
/// same way, so it can be written to disk verbatim.
pub fn render_hsf(rules: &[RuleRaw]) -> Result<String, String> {
    let mut exported = Vec::with_capacity(rules.len());
    for (index, rule) in rules.iter().enumerate() {
        // RowIdx is 1-based and counts exported rows, not source rows.
        exported.push(export_rule(rule, index + 1)?);
    }
    let file = Value::Object(Map::from_iter([("Rules".to_string(), Value::Array(exported))]));
    // Two-space indent matches hsfToBlob; RSL Helper does not care, but a file a human
    // opens beside an app-written one should not differ only in whitespace.
    serde_json::to_string_pretty(&file).map_err(|e| format!("HSF serialise error: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    // A rule carrying one UI-only field and one blank name, to pin both strip paths.
    fn sample_rule(name: Option<&str>, source: Option<&str>) -> RuleRaw {
        RuleRaw {
            RecipeID: Some(3),
            RecipeName: name.map(Arc::from),
            Keep: Some(true),
            IsRuleTypeAND: Some(false),
            Use: Some(true),
            ArtifactSet: None,
            ArtifactType: None,
            Rank: Some(6),
            Rarity: Some(5),
            MainStatID: Some(-1),
            MainStatF: Some(1),
            Ore: None,
            LVLForCheck: Some(16),
            Faction: Some(0),
            Substats: None,
            source: source.map(Arc::from),
            // One diagnostic field set, to prove the `__` strip actually runs.
            line_idx: Some(42),
            all_known_sets: None,
            rank_mask: None,
            rarity_mask: None,
            safeguard_rule_id: None,
            safeguard_rule_ordinal: None,
            safeguard_hash: None,
            safeguard_required: None,
            safeguard_scan_ms: None,
            safeguard_projected: None,
            safeguard_deficit: None,
            safeguard_item_key: None,
            safeguard_placeholder: None,
            safeguard_placeholder_missing: None,
        }
    }

    #[test]
    fn renders_rules_container_with_row_indices() {
        let text = render_hsf(&[sample_rule(Some("Keep fast boots"), None), sample_rule(None, None)])
            .expect("render must succeed");
        let parsed: Value = serde_json::from_str(&text).unwrap();
        let rules = parsed.get("Rules").and_then(Value::as_array).expect("Rules array");
        assert_eq!(rules.len(), 2);
        // RowIdx is 1-based and runs in export order.
        assert_eq!(rules[0].get("RowIdx").and_then(Value::as_u64), Some(1));
        assert_eq!(rules[1].get("RowIdx").and_then(Value::as_u64), Some(2));
        // The named rule keeps its name; the unnamed one omits the key entirely.
        assert_eq!(
            rules[0].get("RecipeName").and_then(Value::as_str),
            Some("Keep fast boots")
        );
        assert!(rules[1].get("RecipeName").is_none());
    }

    #[test]
    fn strips_ui_only_metadata() {
        let text = render_hsf(&[sample_rule(Some("x"), None)]).expect("render must succeed");
        // __lineIdx was set on the input; a `.hsf` must not carry diagnostics.
        assert!(
            !text.contains("__"),
            "exported file must not carry UI-only fields: {text}"
        );
    }

    #[test]
    fn final_sell_rows_export_under_the_fixed_label() {
        let text =
            render_hsf(&[sample_rule(Some("ignored"), Some(RULE_SOURCE_FINAL_SELL))]).expect("render must succeed");
        let parsed: Value = serde_json::from_str(&text).unwrap();
        let name = parsed["Rules"][0].get("RecipeName").and_then(Value::as_str);
        // The row's own name is replaced, because RSL Helper displays this label.
        assert_eq!(name, Some(FINAL_SELL_EXPORT_NAME));
    }
}
