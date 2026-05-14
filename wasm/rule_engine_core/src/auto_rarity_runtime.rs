use super::*;

pub(crate) fn auto_rarity_clamp_roll_requirement(value: Option<f64>) -> i64 {
    let numeric = value.unwrap_or(0.0);
    if !numeric.is_finite() {
        return 0;
    }
    (numeric.floor() as i64).clamp(0, SUBSTAT_MAX_ROLLS_PER_SLOT)
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

// Map LTE range codes to their concrete upper-bound rarity for substat-presence schedule.
// LTE codes carry addition_mask=15 (Common schedule) in the generated tables, which would
// compute base_start=0 for any LTE code — wrong for e.g. LTE_Epic where Epic starts with 3
// substats.  GTE codes already share masks with their lower-bound concretes, so no mapping needed.
pub(crate) fn rarity_for_schedule(code: i64) -> i64 {
    match code {
        c if c == RARITY_CODE_LTE_UNCOMMON  => RARITY_CODE_UNCOMMON,
        c if c == RARITY_CODE_LTE_RARE      => RARITY_CODE_RARE,
        c if c == RARITY_CODE_LTE_EPIC      => RARITY_CODE_EPIC,
        c if c == RARITY_CODE_LTE_LEGENDARY => RARITY_CODE_LEGENDARY,
        c if c == RARITY_CODE_LTE_MYTHICAL  => RARITY_CODE_MYTHICAL,
        _                                   => code,
    }
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
pub fn auto_rarity_roll_levels_for_code_value(rarity_code: i32) -> Vec<i32> {
    let mask = auto_rarity_roll_mask_for_code(rarity_code as i64);
    auto_rarity_levels_from_mask(mask)
}

// Expose addition-level milestones so TS does not duplicate mask decoding.
pub fn auto_rarity_addition_levels_for_code_value(rarity_code: i32) -> Vec<i32> {
    let mask = auto_rarity_addition_mask_for_code(rarity_code as i64);
    auto_rarity_levels_from_mask(mask)
}

// Expose mythical-membership checks for schedule/UI helpers on the TS side.
pub fn auto_rarity_includes_mythical_for_code_value(rarity_code: i32) -> bool {
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
    // Cap final presence at the HSF substat slot maximum.
    (base_start + adds_so_far).min(SUBSTAT_SLOT_COUNT)
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
    let max_selectable_total = selected_pool_v.len().min(HSF_SUBSTAT_SLOT_COUNT) as i64;
    let min_target_count = input
        .min_count
        .map(|value| value.floor() as i64)
        .unwrap_or(0)
        .max(fixed_pool_v.len() as i64)
        .min(SUBSTAT_SLOT_COUNT);
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
        let min_value = input
            .substat_roll_bounds_v
            .get(variant)
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
    let required_rolls = aggregate_min.max(worst_sum_mins).clamp(0, SUBSTAT_MAX_ROLLS_PER_SLOT);
    if required_rolls >= SUBSTAT_MAX_ROLLS_PER_SLOT {
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
        let k = min_target_count.clamp(0, SUBSTAT_SLOT_COUNT);
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
    let locked_presence_need = (required_v.len() as i64).clamp(0, SUBSTAT_SLOT_COUNT);
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
// Renamed from `resolve_auto_rarity_code_for_builder_value` to core variant.
pub fn resolve_auto_rarity_code_for_builder_core(input: &AutoRarityResolveBuilderIn) -> i32 {
    // Normalize allowed ids into a lookup set for fast filtering.
    let allowed = input.allowed_substats.iter().copied().collect::<HashSet<_>>();
    // Keep selected stats only when physically compatible with slot/main filters.
    let selected_pool_v = input
        .substats_v
        .iter()
        .copied()
        .filter(|variant| allowed.contains(variant))
        .collect::<Vec<_>>();
    // Fixed stats must also pass the allowed-substat gate.
    let fixed_pool_raw_v = input
        .fixed_substats_v
        .iter()
        .copied()
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
    let mut substat_roll_bounds_v = HashMap::<i64, AutoRarityResolveRollBoundsIn>::new();
    for (variant, bounds) in &input.substat_roll_bounds_v {
        if !selected_set.contains(variant) {
            continue;
        }
        let normalized = AutoRarityResolveRollBoundsIn {
            min: bounds.min.filter(|value| value.is_finite()),
        };
        if normalized.min.is_some() {
            substat_roll_bounds_v.insert(*variant, normalized);
        }
    }
    // Reuse the shared core so builder and direct payload paths stay aligned.
    let core_payload = AutoRarityResolveIn {
        auto_rarity_supplements_threshold: input.auto_rarity_supplements_threshold.clone(),
        auto_min_required_rolls: input.auto_min_required_rolls,
        min_required_rolls: input.min_required_rolls,
        locked_min_required_rolls: input.locked_min_required_rolls,
        min_count: input.min_count,
        early_keep_mode: input.early_keep_mode.clone(),
        selected_pool_v,
        fixed_pool_v,
        substat_roll_bounds_v,
    };
    let code = resolve_auto_rarity_code_core(&core_payload);
    code as i32
}

// Clamp builder min-count domains to the valid substat slot range.
fn clamp_builder_min_count(value: i64) -> i64 {
    value.clamp(0, SUBSTAT_SLOT_COUNT)
}

// Typed auto-flex bounds carry only the three fields the builder uses.
// serde_wasm_bindgen does not support #[serde(flatten)] for HashMap fields;
// extra bound keys (if any) are silently dropped here and do not affect logic.
// `not` must be included so branches round-trip it back to TS without stripping it.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AutoFlexRarityBoundsIn {
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub any: Option<bool>,
    #[serde(default)]
    pub not: Option<bool>,
}

// Typed auto-flex recipe shape carries only the fields that the branch splitter
// reads or patches.  serde_wasm_bindgen does not support #[serde(flatten)]
// for HashMap<String, serde_json::Value> — adding it causes serde_wasm_bindgen
// to emit an empty JS Map instead of a plain object, making all fields invisible
// to TS callers.  Non-declared recipe fields are restored by the TS wrapper via
// {...originalRecipe, ...wasmBranch} after the WASM call returns.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AutoFlexRarityRecipeIn {
    #[serde(default)]
    pub rarity_mode: Option<String>,
    #[serde(default)]
    pub rarity_code: Option<i64>,
    #[serde(default)]
    pub auto_substat_flex: Option<bool>,
    #[serde(default)]
    pub auto_min_count: Option<bool>,
    #[serde(default)]
    pub min_count: Option<f64>,
    #[serde(default)]
    pub auto_min_required_rolls: Option<bool>,
    #[serde(default)]
    pub min_required_rolls: Option<f64>,
    #[serde(default)]
    pub substats_v: Vec<i64>,
    #[serde(default)]
    pub fixed_substats_v: Vec<i64>,
    // deserialize_with parses string keys → i64; serialize_with reverses for output.
    #[serde(default, deserialize_with = "crate::deserialize_i64_key_map", serialize_with = "crate::serialize_i64_key_map")]
    pub substat_roll_bounds_v: HashMap<i64, AutoFlexRarityBoundsIn>,
    #[serde(default)]
    pub min_level: Option<f64>,
    #[serde(default)]
    pub max_level: Option<f64>,
}

// Normalize optional finite numeric fields using floor semantics.
fn auto_flex_optional_i64(value: Option<f64>) -> Option<i64> {
    value.filter(|numeric| numeric.is_finite())
        .map(|numeric| numeric.floor() as i64)
}

// Typed fast path avoids `serde_json::Value` traversal on common builder payloads.
fn expand_auto_flex_rarity_branches_typed_core(
    recipe: &AutoFlexRarityRecipeIn,
    base_rarity_code: i64,
) -> Vec<AutoFlexRarityRecipeIn> {
    // Preserve JS early-return semantics exactly to avoid branch drift.
    if recipe.rarity_mode.as_deref() != Some("auto") {
        return vec![recipe.clone()];
    }
    if recipe.auto_substat_flex != Some(true) {
        return vec![recipe.clone()];
    }
    if recipe.auto_min_count == Some(true) {
        return vec![recipe.clone()];
    }

    // Normalize selected/fixed pools to integer variant ids.
    let selected = recipe.substats_v.clone();
    if selected.is_empty() {
        return vec![recipe.clone()];
    }
    let fixed = recipe.fixed_substats_v.clone();
    let locked_count = fixed.len() as i64;
    if locked_count == 0 {
        return vec![recipe.clone()];
    }
    if auto_flex_optional_i64(recipe.min_count).unwrap_or(0) != locked_count {
        return vec![recipe.clone()];
    }
    if recipe.auto_min_required_rolls != Some(false) {
        return vec![recipe.clone()];
    }

    // Manual minimum rolls gate controls whether late split branches apply.
    let min_required = auto_flex_optional_i64(recipe.min_required_rolls).unwrap_or(0);
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
    let optional_all_wildcard = optional.iter().all(|variant| {
        let Some(bounds) = recipe.substat_roll_bounds_v.get(variant) else {
            return true;
        };
        let has_min = bounds.min.is_some_and(|value| value.is_finite() && value > 0.0);
        let has_max = bounds.max.is_some_and(|value| value.is_finite());
        let wildcard = bounds.any.unwrap_or(false);
        wildcard && !has_min && !has_max
    });
    if !optional_all_wildcard {
        return vec![recipe.clone()];
    }

    // Resolve level window defaults exactly like merge.ts helper.
    let min_level = auto_flex_optional_i64(recipe.min_level).unwrap_or(LEVEL_MILESTONE_0);
    let max_level = auto_flex_optional_i64(recipe.max_level).unwrap_or(LEVEL_MILESTONE_16);
    let locked_only_count = clamp_builder_min_count(locked_count);
    let configured_min_count = clamp_builder_min_count(
        auto_flex_optional_i64(recipe.min_count).unwrap_or(locked_only_count),
    );
    let base_min_count = clamp_builder_min_count(configured_min_count.max(locked_only_count));
    let flex_target_total = clamp_builder_min_count(base_min_count.max(locked_only_count + 1));

    // Helper clones the source recipe and patches branch-specific overrides.
    let build_branch = |rarity_code: i64,
                        min_count: i64,
                        min_level_patch: Option<i64>,
                        max_level_patch: Option<i64>,
                        auto_substat_flex: bool| {
        let mut branch = recipe.clone();
        branch.rarity_mode = Some("code".to_string());
        branch.rarity_code = Some(rarity_code);
        branch.auto_min_count = Some(false);
        branch.min_count = Some(min_count as f64);
        branch.auto_substat_flex = Some(auto_substat_flex);
        if let Some(value) = min_level_patch {
            branch.min_level = Some(value as f64);
        }
        if let Some(value) = max_level_patch {
            branch.max_level = Some(value as f64);
        }
        branch
    };

    let mut branches = Vec::<AutoFlexRarityRecipeIn>::new();

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
// Renamed from `expand_auto_flex_rarity_branches_value` to core variant.
pub fn expand_auto_flex_rarity_branches_core(
    recipe: &AutoFlexRarityRecipeIn,
    base_rarity_code: i32,
) -> Vec<AutoFlexRarityRecipeIn> {
    // Delegate to the typed core so builder and direct payload paths stay aligned.
    expand_auto_flex_rarity_branches_typed_core(recipe, base_rarity_code as i64)
}
