use super::*;

pub(crate) fn auto_rarity_clamp_roll_requirement(value: Option<f64>) -> i64 {
    let numeric = value.unwrap_or(0.0);
    if !numeric.is_finite() {
        return 0;
    }
    (numeric.floor() as i64).clamp(0, 5)
}

// Auto-rarity tables are generated from shared/domain-constants.json.
// Clamp unknown values into the supported 0..16 rarity-code domain.
fn auto_rarity_code_index(rarity_code: i64) -> usize {
    // Unknown values are normalized to Any so table lookups stay in-bounds.
    if !(RARITY_CODE_ANY..=RARITY_CODE_GTE_LEGENDARY).contains(&rarity_code) {
        return RARITY_CODE_ANY as usize;
    }
    // Return a stable 0..16 index for generated table access.
    rarity_code as usize
}

// Roll schedule mask uses bit positions [4, 8, 12, 16].
pub(crate) fn auto_rarity_roll_mask_for_code(rarity_code: i64) -> i64 {
    // Pull the roll schedule from the shared generated table.
    AUTO_RARITY_ROLL_MASK_BY_CODE[auto_rarity_code_index(rarity_code)]
}

// Addition schedule mask uses bit positions [4, 8, 12, 16].
pub(crate) fn auto_rarity_addition_mask_for_code(rarity_code: i64) -> i64 {
    // Pull the addition schedule from the shared generated table.
    AUTO_RARITY_ADDITION_MASK_BY_CODE[auto_rarity_code_index(rarity_code)]
}

// Decode generated schedule masks into explicit milestone vectors.
// Bit positions map to [4, 8, 12, 16] in both TS and Rust.
fn auto_rarity_levels_from_mask(mask: i64) -> Vec<i32> {
    let mut levels = Vec::<i32>::new();
    if (mask & 0b0001) != 0 {
        levels.push(LEVEL_MILESTONE_4 as i32);
    }
    if (mask & 0b0010) != 0 {
        levels.push(LEVEL_MILESTONE_8 as i32);
    }
    if (mask & 0b0100) != 0 {
        levels.push(LEVEL_MILESTONE_12 as i32);
    }
    if (mask & 0b1000) != 0 {
        levels.push(LEVEL_MILESTONE_16 as i32);
    }
    levels
}

// Mythical pre-roll membership comes from the shared auto-rarity table.
pub(crate) fn auto_rarity_includes_mythical(rarity_code: i64) -> bool {
    // Pull mythical membership from the shared generated table.
    AUTO_RARITY_INCLUDES_MYTHICAL_BY_CODE[auto_rarity_code_index(rarity_code)]
}

// Expose roll-level milestones so TS can reuse Rust schedule decoding directly.
pub(crate) fn auto_rarity_roll_levels_for_code_value(rarity_code: i32) -> Vec<i32> {
    let mask = auto_rarity_roll_mask_for_code(rarity_code as i64);
    auto_rarity_levels_from_mask(mask)
}

// Expose addition-level milestones so TS does not duplicate mask decoding.
pub(crate) fn auto_rarity_addition_levels_for_code_value(rarity_code: i32) -> Vec<i32> {
    let mask = auto_rarity_addition_mask_for_code(rarity_code as i64);
    auto_rarity_levels_from_mask(mask)
}

// Expose mythical-membership checks for schedule/UI helpers on the TS side.
pub(crate) fn auto_rarity_includes_mythical_for_code_value(rarity_code: i32) -> bool {
    auto_rarity_includes_mythical(rarity_code as i64)
}

// Convert a level ceiling into a schedule bitmask for [4, 8, 12, 16].
fn auto_rarity_level_mask_up_to(ceiling: i64) -> i64 {
    // Start empty and add a bit per unlocked milestone.
    let mut mask = 0i64;
    // +4 contributes the first milestone bit.
    if ceiling >= LEVEL_MILESTONE_4 {
        mask |= 1;
    }
    // +8 contributes the second milestone bit.
    if ceiling >= LEVEL_MILESTONE_8 {
        mask |= 2;
    }
    // +12 contributes the third milestone bit.
    if ceiling >= LEVEL_MILESTONE_12 {
        mask |= 4;
    }
    // +16 contributes the fourth milestone bit.
    if ceiling >= LEVEL_MILESTONE_16 {
        mask |= 8;
    }
    // Return the accumulated availability mask.
    mask
}

// Count helper keeps roll-target math readable in the auto-rarity core.
pub(crate) fn auto_rarity_count_levels_up_to_mask(mask: i64, ceiling: i64) -> i64 {
    // Intersect the schedule mask with milestone bits available at this ceiling.
    let filtered = (mask & auto_rarity_level_mask_up_to(ceiling)) as u32;
    // Popcount gives the number of roll/addition milestones unlocked so far.
    filtered.count_ones() as i64
}

// Presence helper mirrors hsfBuilder.ts early-level base+addition model.
fn auto_rarity_present_at_level(rarity_code: i64, level: i64) -> i64 {
    // Resolve the rarity-specific addition schedule from shared constants.
    let additions_mask = auto_rarity_addition_mask_for_code(rarity_code);
    // Count total additions to derive the +0 baseline substat count.
    let additions_total = (additions_mask as u32).count_ones() as i64;
    // Base start is 4 minus pending additions, clamped at zero.
    let base_start = (4 - additions_total).max(0);
    // Additions up to the requested level increase present substat count.
    let adds_so_far = auto_rarity_count_levels_up_to_mask(additions_mask, level);
    // Cap final presence at HSF's 4-substat maximum.
    (base_start + adds_so_far).min(4)
}

// Auto-rarity resolver core mirrors hsfBuilder.ts::resolveAutoRarityCode,
// with slot/main compatibility filtering performed in TS before this call.
pub(crate) fn resolve_auto_rarity_code_core(input: &AutoRarityResolveIn) -> i64 {
    // Optional floor threshold clamps auto output upward when configured.
    let min_floor_code = match input
        .auto_rarity_supplements_threshold
        .as_deref()
        .map(|value| value.trim().to_ascii_lowercase())
        .as_deref()
    {
        Some("uncommon") => Some(RARITY_CODE_GTE_UNCOMMON),
        Some("rare") => Some(RARITY_CODE_GTE_RARE),
        Some("epic") => Some(RARITY_CODE_GTE_EPIC),
        _ => None,
    };
    let apply_floor = |candidate: i64| -> i64 {
        let Some(floor) = min_floor_code else {
            return candidate;
        };
        let rate = |code: i64| -> i64 {
            match code {
                RARITY_CODE_ANY => 0,
                RARITY_CODE_GTE_UNCOMMON => 1,
                RARITY_CODE_GTE_RARE => 2,
                RARITY_CODE_GTE_EPIC => 3,
                RARITY_CODE_GTE_LEGENDARY => 4,
                RARITY_CODE_MYTHICAL => 5,
                _ => 0,
            }
        };
        if rate(candidate) < rate(floor) {
            floor
        } else {
            candidate
        }
    };

    // Inputs are already slot/main filtered in TS to keep compatibility SSOT there.
    let selected_pool_v = input.selected_pool_v.clone();
    let fixed_pool_raw_v = input.fixed_pool_v.clone();
    if selected_pool_v.is_empty() {
        return apply_floor(RARITY_CODE_ANY);
    }

    // Locked subset follows selected ordering, mirroring TS includes/filter flow.
    let fixed_pool_v = selected_pool_v
        .iter()
        .copied()
        .filter(|variant| fixed_pool_raw_v.contains(variant))
        .collect::<Vec<_>>();
    let max_selectable_total = selected_pool_v.len().min(4) as i64;
    let min_target_count = input
        .min_count
        .map(|value| value.floor() as i64)
        .unwrap_or(0)
        .max(fixed_pool_v.len() as i64)
        .min(4);
    let presence_need = max_selectable_total.min(min_target_count);
    let required_v = fixed_pool_v
        .iter()
        .copied()
        .take(4)
        .collect::<Vec<_>>();
    let optional_pool_v = selected_pool_v
        .iter()
        .copied()
        .filter(|variant| !required_v.contains(variant))
        .collect::<Vec<_>>();

    // Parse per-substat mins from normalized bounds payload.
    let mut per_min = HashMap::<i64, i64>::new();
    for variant in &selected_pool_v {
        let key = variant.to_string();
        let min_value = input
            .substat_roll_bounds_v
            .get(&key)
            .and_then(|entry| entry.min);
        per_min.insert(*variant, auto_rarity_clamp_roll_requirement(min_value));
    }
    let has_per_stat_min = per_min.values().any(|value| *value > 0);
    let sum_required = required_v
        .iter()
        .copied()
        .map(|variant| per_min.get(&variant).copied().unwrap_or(0))
        .sum::<i64>();

    // Locked scope is active when locked stats exist and locked min is positive.
    let locked_min_raw = auto_rarity_clamp_roll_requirement(input.locked_min_required_rolls);
    let locked_scope = !required_v.is_empty() && locked_min_raw > 0;
    let worst_sum_mins = if locked_scope {
        sum_required
    } else {
        let need_local = (min_target_count - required_v.len() as i64).max(0) as usize;
        let mut option_mins = optional_pool_v
            .iter()
            .copied()
            .map(|variant| per_min.get(&variant).copied().unwrap_or(0))
            .collect::<Vec<_>>();
        option_mins.sort_by(|left, right| right.cmp(left));
        let sum_optional = option_mins.into_iter().take(need_local).sum::<i64>();
        sum_required + sum_optional
    };

    // Global aggregate minimum mirrors TS auto/manual split.
    let global_min_raw = if input.auto_min_required_rolls == Some(false) {
        auto_rarity_clamp_roll_requirement(input.min_required_rolls)
    } else {
        let base = if locked_scope {
            required_v.len() as i64
        } else {
            min_target_count
        };
        if base <= 1 {
            0
        } else {
            auto_rarity_clamp_roll_requirement(Some(base as f64))
        }
    };
    let aggregate_min = global_min_raw.max(locked_min_raw);
    if aggregate_min == 0 && !has_per_stat_min {
        return apply_floor(RARITY_CODE_ANY);
    }

    // Base rarity tier derives from aggregate and per-stat minimum pressure.
    let required_rolls = aggregate_min.max(worst_sum_mins).clamp(0, 5);
    if required_rolls >= 5 {
        return apply_floor(RARITY_CODE_MYTHICAL);
    }
    let candidate = match required_rolls {
        0 => RARITY_CODE_ANY,
        1 => RARITY_CODE_GTE_UNCOMMON,
        2 => RARITY_CODE_GTE_RARE,
        3 => RARITY_CODE_GTE_EPIC,
        4 => RARITY_CODE_GTE_LEGENDARY,
        _ => RARITY_CODE_MYTHICAL,
    };

    // Auto resolves against the full +0..+16 progression, not the current window.
    let min_level = LEVEL_MILESTONE_0;
    let baseline_after_start = true;
    let roll_mask_cand = auto_rarity_roll_mask_for_code(candidate);
    let pre_cand = if auto_rarity_includes_mythical(candidate) { 1 } else { 0 };
    let rolls_up_to_16_cand = auto_rarity_count_levels_up_to_mask(roll_mask_cand, LEVEL_MILESTONE_16);
    let rolls_up_to_start_cand = auto_rarity_count_levels_up_to_mask(roll_mask_cand, min_level);
    let target_cand = if baseline_after_start {
        (rolls_up_to_16_cand - rolls_up_to_start_cand).max(0) + pre_cand
    } else {
        rolls_up_to_16_cand + pre_cand
    };

    // Early mode presence safeguard for +0 windows and min-count selections.
    let early_mode = input
        .early_keep_mode
        .as_deref()
        .map(|value| value.trim().to_ascii_lowercase())
        .unwrap_or_else(|| "early".to_string());
    if min_level == LEVEL_MILESTONE_0 && early_mode != "late" {
        let k = min_target_count.clamp(0, 4);
        let required_by_k = match k {
            0 => RARITY_CODE_ANY,
            1 => RARITY_CODE_GTE_UNCOMMON,
            2 => RARITY_CODE_GTE_RARE,
            3 => RARITY_CODE_GTE_EPIC,
            _ => RARITY_CODE_GTE_LEGENDARY,
        };
        if required_by_k != RARITY_CODE_ANY {
            if candidate == RARITY_CODE_ANY && required_v.is_empty() {
                return apply_floor(required_by_k);
            }
            let additions = auto_rarity_addition_mask_for_code(candidate);
            let base_start_cand = (4 - (additions as u32).count_ones() as i64).max(0);
            if base_start_cand < k {
                return apply_floor(required_by_k);
            }
        }
    }

    // Locked substats must physically exist at earliest emitted level.
    let locked_presence_need = (required_v.len() as i64).clamp(0, 4);
    if locked_presence_need > 0 && auto_rarity_present_at_level(candidate, LEVEL_MILESTONE_0) < locked_presence_need {
        for tier in [
            RARITY_CODE_GTE_UNCOMMON,
            RARITY_CODE_GTE_RARE,
            RARITY_CODE_GTE_EPIC,
            RARITY_CODE_GTE_LEGENDARY,
        ] {
            if auto_rarity_present_at_level(tier, LEVEL_MILESTONE_0) >= locked_presence_need {
                return apply_floor(tier);
            }
        }
    }

    // Generic presence safeguard for the selected min-count target.
    if presence_need > 0 && auto_rarity_present_at_level(candidate, LEVEL_MILESTONE_0) < presence_need {
        let tiers = [
            candidate,
            RARITY_CODE_GTE_UNCOMMON,
            RARITY_CODE_GTE_RARE,
            RARITY_CODE_GTE_EPIC,
            RARITY_CODE_GTE_LEGENDARY,
        ];
        for tier in tiers {
            if auto_rarity_present_at_level(tier, LEVEL_MILESTONE_0) >= presence_need {
                return apply_floor(tier);
            }
        }
    }

    // Candidate tier is sufficient when its full-window target can reach required rolls.
    if required_rolls <= target_cand {
        return apply_floor(candidate);
    }
    let roll_mask_myth = auto_rarity_roll_mask_for_code(RARITY_CODE_MYTHICAL);
    let pre_myth = if auto_rarity_includes_mythical(RARITY_CODE_MYTHICAL) { 1 } else { 0 };
    let rolls_up_to_16_myth = auto_rarity_count_levels_up_to_mask(roll_mask_myth, LEVEL_MILESTONE_16);
    let rolls_up_to_start_myth = auto_rarity_count_levels_up_to_mask(roll_mask_myth, min_level);
    let target_myth = if baseline_after_start {
        (rolls_up_to_16_myth - rolls_up_to_start_myth).max(0) + pre_myth
    } else {
        rolls_up_to_16_myth + pre_myth
    };
    if required_rolls <= target_myth {
        return apply_floor(RARITY_CODE_MYTHICAL);
    }
    apply_floor(candidate)
}

// Builder-facing auto-rarity resolver compacts selected/fixed/bounds in Rust.
pub(crate) fn resolve_auto_rarity_code_for_builder_value(payload: JsValue) -> Result<i32, JsValue> {
    // Parse typed payload first so malformed callers fail deterministically.
    let parsed: AutoRarityResolveBuilderIn = from_js_value(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid auto-rarity-builder payload: {error}")))?;
    // Normalize allowed ids into a lookup set for fast filtering.
    let allowed = parsed.allowed_substats.into_iter().collect::<HashSet<_>>();
    // Keep selected stats only when physically compatible with slot/main filters.
    let selected_pool_v = parsed
        .substats_v
        .into_iter()
        .filter(|variant| allowed.contains(variant))
        .collect::<Vec<_>>();
    // Fixed stats must also pass the allowed-substat gate.
    let fixed_pool_raw_v = parsed
        .fixed_substats_v
        .into_iter()
        .filter(|variant| allowed.contains(variant))
        .collect::<Vec<_>>();
    // Resolve locked subset in selected ordering, mirroring TS filter/includes.
    let fixed_pool_v = selected_pool_v
        .iter()
        .copied()
        .filter(|variant| fixed_pool_raw_v.contains(variant))
        .collect::<Vec<_>>();
    // Keep bounds payload compact by forwarding only selected variants.
    let selected_set = selected_pool_v.iter().copied().collect::<HashSet<_>>();
    let mut substat_roll_bounds_v = HashMap::<String, AutoRarityResolveRollBoundsIn>::new();
    for (key, bounds) in parsed.substat_roll_bounds_v {
        let Ok(variant) = key.parse::<i64>() else {
            continue;
        };
        if !selected_set.contains(&variant) {
            continue;
        }
        let normalized = AutoRarityResolveRollBoundsIn {
            min: bounds.min.filter(|value| value.is_finite()),
        };
        if normalized.min.is_some() {
            substat_roll_bounds_v.insert(key, normalized);
        }
    }
    // Reuse the shared core so builder and direct payload paths stay aligned.
    let core_payload = AutoRarityResolveIn {
        auto_rarity_supplements_threshold: parsed.auto_rarity_supplements_threshold,
        auto_min_required_rolls: parsed.auto_min_required_rolls,
        min_required_rolls: parsed.min_required_rolls,
        locked_min_required_rolls: parsed.locked_min_required_rolls,
        min_count: parsed.min_count,
        early_keep_mode: parsed.early_keep_mode,
        selected_pool_v,
        fixed_pool_v,
        substat_roll_bounds_v,
    };
    let code = resolve_auto_rarity_code_core(&core_payload);
    Ok(code as i32)
}

// Read a JSON object field as a string token.
fn json_field_string(map: &serde_json::Map<String, serde_json::Value>, key: &str) -> Option<String> {
    map.get(key).and_then(|value| value.as_str()).map(|value| value.to_string())
}

// Read a JSON object field as a boolean.
fn json_field_bool(map: &serde_json::Map<String, serde_json::Value>, key: &str) -> Option<bool> {
    map.get(key).and_then(|value| value.as_bool())
}

// Read a JSON object field as an integer (floor semantics).
fn json_field_i64(map: &serde_json::Map<String, serde_json::Value>, key: &str) -> Option<i64> {
    map.get(key).and_then(|value| value.as_f64()).and_then(|value| {
        if value.is_finite() {
            Some(value.floor() as i64)
        } else {
            None
        }
    })
}

// Read a JSON object field as a numeric value.
fn json_field_f64(map: &serde_json::Map<String, serde_json::Value>, key: &str) -> Option<f64> {
    map.get(key).and_then(|value| value.as_f64()).filter(|value| value.is_finite())
}

// Parse array<number> fields from flexible recipe payloads.
fn json_field_vec_i64(map: &serde_json::Map<String, serde_json::Value>, key: &str) -> Vec<i64> {
    let Some(values) = map.get(key).and_then(|value| value.as_array()) else {
        return Vec::new();
    };
    values
        .iter()
        .filter_map(|entry| entry.as_f64())
        .filter(|value| value.is_finite())
        .map(|value| value.floor() as i64)
        .collect::<Vec<_>>()
}

// Clamp builder min-count domains to the supported 0..4 range.
fn clamp_builder_min_count(value: i64) -> i64 {
    value.clamp(0, 4)
}

// Expand merge.ts auto-flex rarity helper branches using Rust as SSOT.
pub(crate) fn expand_auto_flex_rarity_branches_core(
    recipe: &serde_json::Value,
    base_rarity_code: i64,
) -> Vec<serde_json::Value> {
    let Some(obj) = recipe.as_object() else {
        return vec![recipe.clone()];
    };

    // Preserve JS early-return semantics exactly to avoid branch drift.
    if json_field_string(obj, "rarityMode").as_deref() != Some("auto") {
        return vec![recipe.clone()];
    }
    if json_field_bool(obj, "autoSubstatFlex") != Some(true) {
        return vec![recipe.clone()];
    }
    if json_field_bool(obj, "autoMinCount") == Some(true) {
        return vec![recipe.clone()];
    }

    // Normalize selected/fixed pools to finite integer variant ids.
    let selected = json_field_vec_i64(obj, "substatsV");
    if selected.is_empty() {
        return vec![recipe.clone()];
    }
    let fixed = json_field_vec_i64(obj, "fixedSubstatsV");
    let locked_count = fixed.len() as i64;
    if locked_count == 0 {
        return vec![recipe.clone()];
    }
    if json_field_i64(obj, "minCount").unwrap_or(0) != locked_count {
        return vec![recipe.clone()];
    }
    if json_field_bool(obj, "autoMinRequiredRolls") != Some(false) {
        return vec![recipe.clone()];
    }

    // Manual minimum rolls gate controls whether late split branches apply.
    let min_required = json_field_f64(obj, "minRequiredRolls").unwrap_or(0.0).floor() as i64;
    if min_required > locked_count {
        return vec![recipe.clone()];
    }
    let aggregate_matches_locked = min_required == locked_count;

    // Optional pool is the selected set minus locked/fixed selections.
    let fixed_set = fixed.iter().copied().collect::<HashSet<_>>();
    let optional = selected
        .iter()
        .copied()
        .filter(|variant| !fixed_set.contains(variant))
        .collect::<Vec<_>>();
    if optional.is_empty() {
        return vec![recipe.clone()];
    }

    // Optional entries must remain wildcard-only for this branch split.
    let bounds_map = obj.get("substatRollBoundsV").and_then(|value| value.as_object());
    let optional_all_wildcard = optional.iter().all(|variant| {
        let key = variant.to_string();
        let Some(bounds) = bounds_map.and_then(|map| map.get(&key)).and_then(|value| value.as_object()) else {
            return true;
        };
        let has_min = json_field_f64(bounds, "min").is_some_and(|value| value > 0.0);
        let has_max = json_field_f64(bounds, "max").is_some();
        let wildcard = json_field_bool(bounds, "any").unwrap_or(false);
        wildcard && !has_min && !has_max
    });
    if !optional_all_wildcard {
        return vec![recipe.clone()];
    }

    // Resolve level window defaults exactly like merge.ts helper.
    let min_level = json_field_i64(obj, "minLevel").unwrap_or(LEVEL_MILESTONE_0);
    let max_level = json_field_i64(obj, "maxLevel").unwrap_or(LEVEL_MILESTONE_16);
    let locked_only_count = clamp_builder_min_count(locked_count);
    let configured_min_count = clamp_builder_min_count(
        json_field_i64(obj, "minCount").unwrap_or(locked_only_count),
    );
    let base_min_count = clamp_builder_min_count(configured_min_count.max(locked_only_count));
    let flex_target_total = clamp_builder_min_count(base_min_count.max(locked_only_count + 1));

    // Helper clones the source recipe and patches branch-specific overrides.
    let build_branch = |rarity_code: i64, min_count: i64, min_level_patch: Option<i64>, max_level_patch: Option<i64>, auto_substat_flex: bool| {
        let mut branch = recipe.clone();
        let Some(branch_obj) = branch.as_object_mut() else {
            return recipe.clone();
        };
        branch_obj.insert("rarityMode".to_string(), serde_json::Value::String("code".to_string()));
        branch_obj.insert("rarityCode".to_string(), serde_json::Value::from(rarity_code));
        branch_obj.insert("autoMinCount".to_string(), serde_json::Value::Bool(false));
        branch_obj.insert("minCount".to_string(), serde_json::Value::from(min_count));
        branch_obj.insert("autoSubstatFlex".to_string(), serde_json::Value::Bool(auto_substat_flex));
        if let Some(value) = min_level_patch {
            branch_obj.insert("minLevel".to_string(), serde_json::Value::from(value));
        }
        if let Some(value) = max_level_patch {
            branch_obj.insert("maxLevel".to_string(), serde_json::Value::from(value));
        }
        branch
    };

    let mut branches = Vec::<serde_json::Value>::new();

    // Baseline branch keeps locked-only expectations before +16.
    let early_epic_max = max_level.min(LEVEL_MILESTONE_12);
    if min_level <= early_epic_max {
        branches.push(build_branch(
            base_rarity_code,
            locked_only_count,
            Some(min_level),
            Some(early_epic_max),
            false,
        ));
    }

    // Late branch appears only when the aggregate target equals locked count.
    let late_epic_min = min_level.max(LEVEL_MILESTONE_16);
    if aggregate_matches_locked && late_epic_min <= max_level {
        branches.push(build_branch(
            base_rarity_code.max(RARITY_CODE_EPIC),
            flex_target_total,
            Some(late_epic_min),
            Some(max_level),
            false,
        ));
    }

    // Legendary-or-range branch mirrors TS fallback behavior.
    branches.push(build_branch(
        base_rarity_code.max(RARITY_CODE_GTE_LEGENDARY),
        if aggregate_matches_locked { flex_target_total } else { base_min_count },
        None,
        None,
        !aggregate_matches_locked,
    ));

    branches
}

// Public merge helper export keeps branch expansion logic in Rust.
pub(crate) fn expand_auto_flex_rarity_branches_value(
    recipe: JsValue,
    base_rarity_code: i32,
) -> Result<JsValue, JsValue> {
    let parsed: serde_json::Value = from_js_value(recipe)
        .map_err(|error| JsValue::from_str(&format!("Invalid auto-flex branch recipe: {error}")))?;
    let branches = expand_auto_flex_rarity_branches_core(&parsed, base_rarity_code as i64);
    to_js_value(&branches)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize auto-flex branches: {error}")))
}
