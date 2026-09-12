// recipe_builder.rs
//
// Ports the TypeScript preprocessing pipeline in hsfBuilder.ts so the native
// DLL (and any future pure-Rust consumer) can call the existing Rust core
// functions without any TypeScript involvement.
//
// Each public helper mirrors the TS function of the same name (snake_case):
//   resolveAllowedSubstatsForSlotsAndMains → resolve_allowed_substats_for_slots_and_mains
//   starForRankCode                         → star_for_rank_code
//   canEnableSubstatFlex                    → can_enable_substat_flex
//   isMilestoneThresholdsActive             → is_milestone_thresholds_active
//   deriveRollBaselineMode                  → derive_roll_baseline_mode
//   deriveGlobalMinRolls                    → derive_global_min_rolls
//   deriveLockedMinRolls                    → derive_locked_min_rolls
//   isLockedAggregateScopeActive            → is_locked_aggregate_scope_active
//   anySelectedSlotSupportsMain             → any_selected_slot_supports_main
//   buildHsfRules (recipe-level)            → build_hsf_rules_for_recipe

use crate::sfc_reader::{ReadableRecipeParsed, SubstatTargetTableIn};
use crate::*;
use std::collections::BTreeMap;

// ---------------------------------------------------------------------------
// Slot compatibility tables (ALLOWED_MAIN_BY_SLOT / ALLOWED_SUB_BY_SLOT)
// ---------------------------------------------------------------------------
// Slot IDs: Weapon=5 Helmet=1 Shield=6 Gauntlets=3 Chestplate=2 Boots=4 Ring=7 Amulet=8 Banner=9

/// Allowed main-stat variants for a slot (mirrors ALLOWED_MAIN_BY_SLOT in types.ts).
fn allowed_mains_for_slot(slot: i64) -> &'static [i64] {
    // ALLOWED_MAINS_BY_SLOT is sorted by slot ID; linear scan over 9 entries.
    for &(s, variants) in ALLOWED_MAINS_BY_SLOT {
        if s == slot {
            return variants;
        }
    }
    &[]
}

/// Allowed substat variants for a slot (mirrors ALLOWED_SUB_BY_SLOT in types.ts).
fn allowed_subs_for_slot(slot: i64) -> &'static [i64] {
    // ALLOWED_SUBS_BY_SLOT is sorted by slot ID; linear scan over 9 entries.
    for &(s, variants) in ALLOWED_SUBS_BY_SLOT {
        if s == slot {
            return variants;
        }
    }
    &[]
}

// ---------------------------------------------------------------------------
// Slot/main compatibility helpers (mirrors slotSupportsMain / anySelectedSlotSupportsMain)
// ---------------------------------------------------------------------------

/// True if the slot supports this main stat variant.
fn slot_supports_main(slot: i64, main_variant: i64) -> bool {
    // Any variant (−1) is always compatible.
    if main_variant == STAT_VARIANT_ANY {
        return true;
    }
    allowed_mains_for_slot(slot).contains(&main_variant)
}

/// True if any selected slot supports this main stat variant (empty selection = true).
pub(crate) fn any_selected_slot_supports_main(slots: &[i64], main_variant: i64) -> bool {
    if slots.is_empty() {
        return true;
    }
    slots.iter().any(|&slot| slot_supports_main(slot, main_variant))
}

// ---------------------------------------------------------------------------
// substatMatchesMainVariant (mirrors statCompatibility.ts)
// ---------------------------------------------------------------------------

/// Extract (stat_id, is_flat) from a stat variant using the encoded bit layout.
fn variant_to_sub_parts(variant: i64) -> (i64, bool) {
    // High byte encodes stat id; low bit encodes flat flag.
    let stat_id = (variant >> STAT_VARIANT_SHIFT_BITS) & STAT_VARIANT_ID_MASK;
    let is_flat = (variant & STAT_VARIANT_FLAT_SUFFIX) == STAT_VARIANT_FLAT_SUFFIX;
    (stat_id, is_flat)
}

/// (stat_id, flat_flag) from a main-stat variant. Every variant states its flag.
fn variant_to_main_parts(variant: i64) -> (i64, Option<i64>) {
    // Mirror of `variantToMain` in hsfTypes.ts, which is the SSOT for this mapping.
    //
    // `f` is the main stat's FLAT flag: 0 = percent, 1 = flat. The percent/flat pairs are
    // explicit, and every other variant states its flag rather than falling through to the
    // `MAIN_STAT_F_DEFAULT_FLAG` default — because that default is 1, and CR/CDMG are PERCENT
    // mains that need 0. Leaving them to the default emitted `MainStatF: 1` for a CDMG% main,
    // which matched no such gear and silently shifted the whole rule set: a real sellfile's
    // CDMG% amulet recipes then also carried different substat thresholds, and 16 amulets the
    // app keeps came out sold.
    match variant {
        v if v == STAT_VARIANT_HP_PERCENT => (STAT_ID_HP, Some(0)),
        v if v == STAT_VARIANT_HP_FLAT => (STAT_ID_HP, Some(1)),
        v if v == STAT_VARIANT_ATK_PERCENT => (STAT_ID_ATK, Some(0)),
        v if v == STAT_VARIANT_ATK_FLAT => (STAT_ID_ATK, Some(1)),
        v if v == STAT_VARIANT_DEF_PERCENT => (STAT_ID_DEF, Some(0)),
        v if v == STAT_VARIANT_DEF_FLAT => (STAT_ID_DEF, Some(1)),
        // Flat-valued mains.
        v if v == STAT_VARIANT_SPD => (STAT_ID_SPD, Some(1)),
        v if v == STAT_VARIANT_RES => (STAT_ID_RES, Some(1)),
        v if v == STAT_VARIANT_ACC => (STAT_ID_ACC, Some(1)),
        // Percent-valued mains — NOT the default.
        v if v == STAT_VARIANT_CR => (STAT_ID_CR, Some(0)),
        v if v == STAT_VARIANT_CDMG => (STAT_ID_CDMG, Some(0)),
        _ => (STAT_ID_ANY, Some(1)),
    }
}

/// True if a substat variant would duplicate the given main stat variant
/// (mirrors substatMatchesMainVariant in statCompatibility.ts).
fn substat_matches_main_variant(sub_variant: i64, main_variant: i64) -> bool {
    let (main_id, main_f) = variant_to_main_parts(main_variant);
    if main_id == STAT_ID_ANY {
        return false;
    }
    let (sub_id, sub_is_flat) = variant_to_sub_parts(sub_variant);
    // HP/ATK/DEF require both id and flat-flag to match.
    if main_id == STAT_ID_HP || main_id == STAT_ID_ATK || main_id == STAT_ID_DEF {
        let Some(f) = main_f else {
            return false;
        };
        return sub_id == main_id && sub_is_flat == (f == 1);
    }
    // Other stats: id comparison only.
    sub_id == main_id
}

// ---------------------------------------------------------------------------
// resolve_allowed_substats_for_slots_and_mains
// ---------------------------------------------------------------------------

/// Compute the set of substat variants valid for any selected slot+main combination.
/// Mirrors resolveAllowedSubstatsForSlotsAndMains in statCompatibility.ts.
pub(crate) fn resolve_allowed_substats_for_slots_and_mains(slots: &[i64], mains: &[i64]) -> Vec<i64> {
    // Empty selection means all slots; Any/empty mains means no main restriction.
    let slot_pool: Vec<i64> = if slots.is_empty() {
        PREFERRED_ARTIFACT_TYPE_ORDER.to_vec()
    } else {
        slots.to_vec()
    };
    let has_wildcard_main = mains.is_empty() || mains.contains(&STAT_VARIANT_ANY);
    let explicit_mains: Vec<i64> = if has_wildcard_main {
        vec![]
    } else {
        mains.iter().copied().filter(|&v| v != STAT_VARIANT_ANY).collect()
    };

    let mut allowed = std::collections::HashSet::<i64>::new();
    // jewelry slots surviving the main-viability gate — the
    // anomalous append must not resurrect a slot the classic loop skipped.
    let mut viable_anomalous_slot = false;
    for &slot in &slot_pool {
        let sub_set = allowed_subs_for_slot(slot);
        if sub_set.is_empty() {
            continue;
        }
        let main_set = allowed_mains_for_slot(slot);
        if main_set.is_empty() {
            continue;
        }

        // Candidate mains for this slot.
        let candidate_mains: Vec<i64> = if has_wildcard_main {
            main_set.to_vec()
        } else {
            explicit_mains
                .iter()
                .copied()
                .filter(|v| main_set.contains(v))
                .collect()
        };
        if candidate_mains.is_empty() {
            continue;
        }
        if ANOMALOUS_ELIGIBLE_SLOT_IDS.contains(&slot) {
            viable_anomalous_slot = true;
        }

        // Add any substat that doesn't conflict with all candidate mains.
        for &sub in sub_set {
            let viable = candidate_mains
                .iter()
                .any(|&main| !substat_matches_main_variant(sub, main));
            if viable {
                allowed.insert(sub);
            }
        }
    }
    // Return in STAT_VARIANTS_PRIORITY order (matches the TS output order).
    let mut resolved: Vec<i64> = STAT_VARIANTS_PRIORITY
        .iter()
        .copied()
        .filter(|v| allowed.contains(v))
        .collect();
    // Anomalous substats are feasible on VIABLE jewelry slots
    // only — mirrors the TS resolver (statCompatibility.ts); they cannot be mains, so
    // no per-substat clash filtering applies, and they stay out of the classic tables.
    if viable_anomalous_slot {
        resolved.extend(ANOMALOUS_SUBSTAT_VARIANTS.iter().copied());
    }
    resolved
}

// ---------------------------------------------------------------------------
// star_for_rank_code (mirrors starForRankCode in hsfBuilder.ts)
// ---------------------------------------------------------------------------

/// Map a rank code to its effective star bucket (1..6).
/// `any_fallback` is the star to use for Any (0) — the recipe's anyRankDefaultsTo (default 6).
pub(crate) fn star_for_rank_code(rank_code: i64, any_fallback: i64) -> i64 {
    // Exact 1..6.
    if (RANK_CODE_ONE..=RANK_CODE_SIX).contains(&rank_code) {
        return rank_code;
    }
    // >= n★ : GTE_ONE..GTE_FOUR → 4-star bucket; GTE_FIVE → 5.
    if (RANK_CODE_GTE_ONE..=RANK_CODE_GTE_FOUR).contains(&rank_code) {
        return 4;
    }
    if rank_code == RANK_CODE_GTE_FIVE {
        return 5;
    }
    // <= n★ : LTE_TWO..LTE_FOUR → 4; LTE_FIVE → 5; LTE_SIX → 6.
    if (RANK_CODE_LTE_TWO..=RANK_CODE_LTE_FOUR).contains(&rank_code) {
        return 4;
    }
    if rank_code == RANK_CODE_LTE_FIVE {
        return 5;
    }
    if rank_code == RANK_CODE_LTE_SIX {
        return 6;
    }
    // Any (0) → caller-provided fallback (anyRankDefaultsTo), clamped to a valid star.
    any_fallback.clamp(1, 6)
}

// ---------------------------------------------------------------------------
// Factory minima tables (mirrors FACTORY_MINIMA_BY_STAR / BASE_MIN_n in hsfBuilder.ts)
// ---------------------------------------------------------------------------

/// Per-line value for an anomalous substat at the given rank (5★ 1.25%, 6★ 1.5%).
/// These stats have no roll variance — the value is fixed per rank — so this single
/// number is the tier's minimum, maximum and step at once. Ranks outside the table
/// clamp into it: the nearest real value beats a 0 that would read as "no target".
/// Mirrors anomalousRollValueForRank in src/lib/anomalousAccessories.ts.
pub(crate) fn anomalous_roll_value_for_rank(rank: i64) -> f64 {
    // Table is small (6 entries) and ascending; scan for an exact rank first.
    for &(r, value) in ANOMALOUS_SUBSTAT_ROLL_VALUE_BY_RANK {
        if r == rank {
            return value;
        }
    }
    // Below/above the covered range, clamp to the nearest end.
    let first = ANOMALOUS_SUBSTAT_ROLL_VALUE_BY_RANK.first();
    let last = ANOMALOUS_SUBSTAT_ROLL_VALUE_BY_RANK.last();
    match (first, last) {
        (Some(&(lo_rank, lo_value)), Some(&(_, hi_value))) => {
            if rank < lo_rank {
                lo_value
            } else {
                hi_value
            }
        }
        _ => 0.0,
    }
}

/// Return the factory-default substat minimum map for the given star (1..6).
/// Derived from SUBSTAT_ROLL_RANGES_BY_STAR — the min per-roll value is the factory default.
/// Values are f64: the anomalous substats carry fractional per-rank values (0.25..1.5).
pub(crate) fn factory_minima_for_star(star: i64) -> BTreeMap<i64, f64> {
    // SUBSTAT_ROLL_RANGES_BY_STAR is sorted by star ascending; linear scan over 6 tiers.
    for &(s, triples) in SUBSTAT_ROLL_RANGES_BY_STAR {
        if s == star {
            // Each triple is (variant, min, max); extract (variant, min) pairs.
            let mut minima: BTreeMap<i64, f64> = triples
                .iter()
                .map(|&(variant, min, _max)| (variant, min as f64))
                .collect();
            // Anomalous stats carry no generated roll range (no variance to describe), so
            // their tier value comes from the rank table instead. Mirrors
            // anomalousFactoryMinimaForStar in src/lib/hsfBuilder.ts.
            let anomalous_value = anomalous_roll_value_for_rank(star);
            for &variant in ANOMALOUS_SUBSTAT_VARIANTS {
                minima.insert(variant, anomalous_value);
            }
            return minima;
        }
    }
    BTreeMap::new()
}

/// Lookup the user-provided substat target map for a given star bucket.
fn minima_for_star(table: &SubstatTargetTableIn, star: i64) -> BTreeMap<i64, f64> {
    match star {
        6 => table.six.clone(),
        5 => table.five.clone(),
        4 => table.four.clone(),
        3 => table.three.clone(),
        2 => table.two.clone(),
        _ => table.one.clone(),
    }
}

// ---------------------------------------------------------------------------
// Aggregate-roll helpers (mirrors recipeNormalization.ts)
// ---------------------------------------------------------------------------

// Clamp an aggregate roll requirement into the range a slot can physically carry.
// pub(crate) because sfc_reader applies the same clamp when reading a recipe back; two
// copies of this bound would let the reader and the builder disagree about one recipe.
pub(crate) fn clamp_roll_requirement(v: i64) -> i64 {
    v.clamp(0, SUBSTAT_MAX_ROLLS_PER_SLOT)
}

/// True when per-substat roll bounds set any explicit floor or "not" constraint (mirrors hasSubstatThresholds).
fn has_substat_thresholds(bounds: &BTreeMap<i64, BuildHsfComboBoundsIn>) -> bool {
    bounds
        .values()
        .any(|b| b.min.map(|m| m > 0.0).unwrap_or(false) || b.not.unwrap_or(false))
}

/// True when the user set a manual aggregate roll floor (mirrors hasManualAggregateMin).
fn has_manual_aggregate_min(recipe: &ReadableRecipeParsed) -> bool {
    !recipe.auto_min_required_rolls && recipe.min_required_rolls > 0
}

/// True when the locked aggregate floor applies (mirrors isLockedAggregateActive).
fn is_locked_aggregate_active(recipe: &ReadableRecipeParsed) -> bool {
    recipe.locked_min_required_rolls > 0 && !recipe.fixed_substats_v.is_empty()
}

/// True when any roll-threshold source is active (mirrors isMilestoneThresholdsActive).
pub(crate) fn is_milestone_thresholds_active(recipe: &ReadableRecipeParsed) -> bool {
    has_substat_thresholds(&recipe.substat_roll_bounds_v)
        || has_manual_aggregate_min(recipe)
        || is_locked_aggregate_active(recipe)
}

/// Whether the locked-only aggregate scope is active for the given locked count.
pub(crate) fn is_locked_aggregate_scope_active(recipe: &ReadableRecipeParsed, locked_count: i64) -> bool {
    if locked_count <= 0 {
        return false;
    }
    recipe.locked_min_required_rolls > 0
}

/// Roll baseline mode: start-at-0 windows use 'afterStart'; elevated windows use 'upToLevel'.
pub(crate) fn derive_roll_baseline_mode(recipe: &ReadableRecipeParsed) -> &'static str {
    if recipe.min_level <= 0 {
        "afterStart"
    } else {
        "upToLevel"
    }
}

/// Minimum roll events forced by the rarity schedule for a given rarity code.
fn min_roll_events_for_rarity(rarity_code: i64) -> i64 {
    // Index through the shared normalizer, NOT a local clamp. The distinction matters for an
    // out-of-domain code: the normalizer collapses it to Any (0 events, which is what TS's
    // minRollEventsForRarity returns), whereas clamping to the boundary would return the
    // LEGENDARY row and emit an aggregate roll floor the app never applies.
    AUTO_RARITY_MIN_ROLL_EVENTS_BY_CODE[crate::auto_rarity_runtime::auto_rarity_code_index(rarity_code)]
}

/// Derive the global aggregate minimum rolls value (mirrors deriveGlobalMinRolls).
pub(crate) fn derive_global_min_rolls(
    recipe: &ReadableRecipeParsed,
    selected_pool_v: &[i32],
    required_v: &[i32],
    min_target_count: i32,
    rarity_code: i64,
) -> i64 {
    // Manual override: use clamped recipe value directly.
    if !recipe.auto_min_required_rolls {
        return clamp_roll_requirement(recipe.min_required_rolls);
    }
    // Auto mode: no substats selected means no roll requirement.
    if selected_pool_v.is_empty() {
        return 0;
    }
    let locked_scope = is_locked_aggregate_scope_active(recipe, required_v.len() as i64);
    let base = if locked_scope {
        required_v.len() as i64
    } else {
        min_target_count as i64
    };
    // Auto-rarity schedule caps the baseline to its minimum roll event count.
    let base = base.min(min_roll_events_for_rarity(rarity_code));
    // Single-substat targets don't need a roll floor.
    if base <= 1 {
        return 0;
    }
    clamp_roll_requirement(base)
}

/// Derive the locked-only aggregate minimum rolls value (mirrors deriveLockedMinRolls).
pub(crate) fn derive_locked_min_rolls(recipe: &ReadableRecipeParsed, locked_count: i64) -> i64 {
    if locked_count == 0 {
        return 0;
    }
    clamp_roll_requirement(recipe.locked_min_required_rolls)
}

// ---------------------------------------------------------------------------
// canEnableSubstatFlex (mirrors recipeNormalization.ts)
// ---------------------------------------------------------------------------

/// True when auto-substat-flex is meaningful for the current recipe selection.
pub(crate) fn can_enable_substat_flex(recipe: &ReadableRecipeParsed) -> bool {
    // Auto min-count overrides flex eligibility.
    if recipe.auto_min_count {
        return false;
    }
    // Empty selection has nothing to flex.
    if recipe.substats_v.is_empty() {
        return false;
    }
    let fixed_set: std::collections::HashSet<i64> = recipe.fixed_substats_v.iter().copied().collect();
    let locked_count = recipe.substats_v.iter().filter(|v| fixed_set.contains(v)).count() as i64;
    let effective_required = recipe.min_count.max(locked_count);
    // Flex requires at least one optional slot beyond the required set.
    if recipe.substats_v.len() as i64 <= effective_required {
        return false;
    }

    // "Not" substats are excluded from flex consideration — they carry Condition "¬"
    // and are never part of the positive combination rotation.
    let optional: Vec<i64> = recipe
        .substats_v
        .iter()
        .copied()
        .filter(|v| !fixed_set.contains(v) && !recipe.substat_roll_bounds_v.get(v).and_then(|b| b.not).unwrap_or(false))
        .collect();

    // At least one optional must be a pure wildcard (no min, no max).
    let has_pure_wildcard_optional = optional.iter().any(|v| {
        let b = recipe.substat_roll_bounds_v.get(v);
        let has_min = b.and_then(|b| b.min).map(|m| m > 0.0).unwrap_or(false);
        let has_max = b.and_then(|b| b.max).is_some();
        !has_min && !has_max
    });
    if !has_pure_wildcard_optional {
        return false;
    }

    // Flex is worth enabling when optional stats have explicit mins …
    let has_optional_min = optional.iter().any(|v| {
        recipe
            .substat_roll_bounds_v
            .get(v)
            .and_then(|b| b.min)
            .map(|m| m > 0.0)
            .unwrap_or(false)
    });
    // … or when the aggregate min pushes the count beyond the targeted subset.
    let global_min_active = !recipe.auto_min_required_rolls && recipe.min_required_rolls > 0;
    let targeted_count = if is_locked_aggregate_scope_active(recipe, locked_count) {
        locked_count
    } else {
        effective_required
    };
    let needs_flex_for_aggregate = global_min_active && recipe.min_required_rolls > targeted_count;

    // Pure wildcard optionals alone are sufficient (rarity-slot rotation scenario).
    has_optional_min || needs_flex_for_aggregate || has_pure_wildcard_optional
}

// ---------------------------------------------------------------------------
// variant_to_main_choice: convert a stat variant to EmitHsfMainChoiceIn
// ---------------------------------------------------------------------------

/// Convert a stat variant to its EmitHsfMainChoiceIn representation.
/// The `f` field defaults to 1 (MAIN_STAT_F_DEFAULT_FLAG) when not applicable,
/// matching the TS `{ id: main.id, f: main.f ?? 1 }` pattern.
fn variant_to_main_choice(variant: i64) -> EmitHsfMainChoiceIn {
    let (id, f_opt) = variant_to_main_parts(variant);
    EmitHsfMainChoiceIn {
        id,
        f: Some(f_opt.unwrap_or(MAIN_STAT_F_DEFAULT_FLAG)),
    }
}

// ---------------------------------------------------------------------------
// build_hsf_rules_for_recipe — the main orchestrator
// ---------------------------------------------------------------------------

/// Build HSF rules for one parsed recipe, mirroring the full TS buildHsfRules pipeline.
///
/// `minima` is the user-provided substat target table from the SFC (may be None;
/// factory defaults are used when absent).  `recipe_id` tags the generated rules
/// so consumers can trace them back to their source recipe.
///
/// `recipe_id` must be 1-BASED — build it with `matcher_evaluator::recipe_id_for_index`
/// rather than passing a raw enumeration index. Emission drops any value <= 0, and the
/// evaluator recovers the `recipe_modes` index as `recipe_id - 1`, so a 0-based id both
/// erases the first recipe's identity and shifts every later recipe onto its
/// predecessor's mode.
pub fn build_hsf_rules_for_recipe(
    recipe: &ReadableRecipeParsed,
    minima: Option<&SubstatTargetTableIn>,
    recipe_id: Option<i64>,
) -> Result<Vec<RuleRaw>, String> {
    // Separators produce no rules; disabled recipes produce rules with Use=false
    // (the runtime handles them for export; they are just not evaluated).
    if recipe.is_separator {
        return Ok(vec![]);
    }

    // 1. Allowed substats for slot + main filter.
    let allowed_substats =
        resolve_allowed_substats_for_slots_and_mains(&recipe.artifact_type_ids, &recipe.main_stat_variants);

    // 2. Star bucket from rank code. Any-rank recipes fall back to the table's
    //    anyRankDefaultsTo (6 when no minima table is present), mirroring hsfBuilder.ts.
    let any_rank_fallback = minima.map(|t| t.any_rank_defaults_to).unwrap_or(6);
    let star = star_for_rank_code(recipe.rank_code, any_rank_fallback);

    // 3. Factory minima for star (always from hardcoded tables, like the TS constant).
    let factory_base_for_star = factory_minima_for_star(star);

    // 4. Substat target map: user-provided minima if available, else factory defaults.
    let substat_target_by_variant: BTreeMap<i64, f64> = match minima {
        Some(table) => minima_for_star(table, star),
        None => factory_base_for_star.clone(),
    };

    // 5. Flex eligibility (independent of whether flex toggle is on).
    let flex_eligible = can_enable_substat_flex(recipe);

    // 6. Prepare recipe (pool normalization, base/target maps).
    let prep = prepare_hsf_builder_recipe_core_fn(&PrepareHsfBuilderRecipeIn {
        min_count: recipe.min_count,
        auto_substat_flex: recipe.auto_substat_flex,
        flex_eligible,
        substats_v: recipe.substats_v.clone(),
        fixed_substats_v: recipe.fixed_substats_v.clone(),
        allowed_substats: allowed_substats.clone(),
        substat_roll_bounds_v: recipe.substat_roll_bounds_v.clone(),
        substat_roll_targets_v: recipe.substat_roll_targets_v.clone(),
        substat_target_by_variant,
        factory_base_by_variant_for_star: factory_base_for_star,
        variant_priority: PREFERRED_STAT_ORDER.to_vec(),
    });

    // User selected substats that are all filtered by slot/main → no rules.
    if prep.had_requested_substats && prep.selected_pool_v.is_empty() {
        return Ok(vec![]);
    }

    // 7. Resolve actual rarity code (auto → concrete via core resolver).
    let actual_rarity_code: i64 = if recipe.rarity_mode.as_deref() == Some("auto") {
        resolve_auto_rarity_code_for_builder_core(&AutoRarityResolveBuilderIn {
            auto_rarity_supplements_threshold: recipe.auto_rarity_supplements_threshold.clone(),
            auto_min_required_rolls: Some(recipe.auto_min_required_rolls),
            min_required_rolls: Some(recipe.min_required_rolls as f64),
            locked_min_required_rolls: Some(recipe.locked_min_required_rolls as f64),
            min_count: Some(recipe.min_count as f64),
            early_keep_mode: Some(recipe.early_keep_mode.clone()),
            substats_v: recipe.substats_v.clone(),
            fixed_substats_v: recipe.fixed_substats_v.clone(),
            substat_roll_bounds_v: recipe
                .substat_roll_bounds_v
                .iter()
                .map(|(&k, b)| (k, AutoRarityResolveRollBoundsIn { min: b.min }))
                .collect(),
            allowed_substats: allowed_substats.clone(),
        }) as i64
    } else {
        recipe.rarity_code
    };

    // 8. Build main choices, filtering to slots that support each main.
    //    Variants are sorted by PREFERRED_STAT_ORDER to match the TS compareVariants sort.
    let mut sorted_mains = recipe.main_stat_variants.clone();
    sorted_mains.sort_unstable_by_key(|&v| PREFERRED_STAT_ORDER.iter().position(|&p| p == v).unwrap_or(usize::MAX));
    let main_choices: Vec<EmitHsfMainChoiceIn> = sorted_mains
        .iter()
        .filter(|&&v| any_selected_slot_supports_main(&recipe.artifact_type_ids, v))
        .map(|&v| variant_to_main_choice(v))
        .collect();
    // No main stats selected → emit the "Any" branch.
    let emit_any_main_when_no_choices = recipe.main_stat_variants.is_empty();

    // 9. Baseline and early mode.
    let baseline = derive_roll_baseline_mode(recipe).to_string();
    let milestone_active = is_milestone_thresholds_active(recipe);
    let early_mode = if recipe.early_keep_mode == "late" && milestone_active {
        "late".to_string()
    } else {
        "early".to_string()
    };

    // 10. Aggregate roll values.
    let global_min = derive_global_min_rolls(
        recipe,
        &prep.selected_pool_v,
        &prep.required_v,
        prep.min_target_count,
        actual_rarity_code,
    );
    let locked_min = derive_locked_min_rolls(recipe, prep.required_v.len() as i64);
    let aggregate_min_value = global_min.max(locked_min);
    let global_min_active = global_min > 0;
    let locked_min_active = locked_min > 0;
    let aggregate_min_active = aggregate_min_value > 0;
    // Manual zero with no per-stat mins and no locked floor → suppress thresholds.
    let manual_min_zero = !recipe.auto_min_required_rolls && recipe.min_required_rolls == 0;
    let suppress_roll_thresholds = manual_min_zero && !prep.has_per_stat_min && locked_min == 0;
    // Locked-only scope: global min is absent but locked floor is active.
    let aggregate_targets_locked = !global_min_active
        && locked_min_active
        && is_locked_aggregate_scope_active(recipe, prep.required_v.len() as i64);

    // 11. Convert PrepareHsfBuilderRecipeOut target-entry map to BuildHsfComboTargetEntryIn map
    //     (same field shape; local conversion avoids exposing internal types).
    let target_entries: BTreeMap<i64, BuildHsfComboTargetEntryIn> = prep
        .target_entries_by_variant
        .iter()
        .map(|(&k, v)| {
            (
                k,
                BuildHsfComboTargetEntryIn {
                    base: v.base,
                    increments: v.increments.clone(),
                },
            )
        })
        .collect();

    // 12. Split "not" variants from the combination pool before calling the runtime.
    let not_substats_v: Vec<i32> = prep
        .selected_pool_v
        .iter()
        .copied()
        .filter(|&v| {
            recipe
                .substat_roll_bounds_v
                .get(&(v as i64))
                .and_then(|b| b.not)
                .unwrap_or(false)
        })
        .collect();
    let positive_selected_pool_v: Vec<i32> = prep
        .selected_pool_v
        .iter()
        .copied()
        .filter(|&v| {
            !recipe
                .substat_roll_bounds_v
                .get(&(v as i64))
                .and_then(|b| b.not)
                .unwrap_or(false)
        })
        .collect();
    let positive_required_v: Vec<i32> = prep
        .required_v
        .iter()
        .copied()
        .filter(|&v| {
            !recipe
                .substat_roll_bounds_v
                .get(&(v as i64))
                .and_then(|b| b.not)
                .unwrap_or(false)
        })
        .collect();
    let positive_optional_pool_v: Vec<i32> = prep
        .optional_pool_v
        .iter()
        .copied()
        .filter(|&v| {
            !recipe
                .substat_roll_bounds_v
                .get(&(v as i64))
                .and_then(|b| b.not)
                .unwrap_or(false)
        })
        .collect();

    // 13. Call the full builder runtime (preflight + rarity branches + emission).
    let runtime_out = build_hsf_rules_runtime_core_fn(&BuildHsfRulesRuntimeIn {
        recipe_id,
        keep: Some(recipe.keep),
        use_flag: recipe.use_flag,
        artifact_set_ids: recipe.artifact_set_ids.clone(),
        artifact_type_ids: recipe.artifact_type_ids.clone(),
        rank_code: recipe.rank_code,
        rarity_code: actual_rarity_code,
        faction_code: recipe.faction_code,
        // Rework gate stamped onto every rule this recipe emits.
        ore: Some(recipe.ore),
        main_choices,
        emit_any_main_when_no_choices,
        baseline: Some(baseline),
        effective_start: LEVEL_MILESTONE_0,
        suppress_roll_thresholds,
        level_window_min: recipe.min_level,
        level_window_max: recipe.max_level,
        required_v: positive_required_v,
        optional_pool_v: positive_optional_pool_v,
        selected_pool_v: positive_selected_pool_v,
        not_substats_v,
        flex_active: recipe.auto_substat_flex && flex_eligible,
        aggregate_min_active,
        min_target_count: prep.min_target_count,
        max_target_count: prep.max_target_count,
        aggregate_targets_locked,
        aggregate_min_value: aggregate_min_value as i32,
        locked_min_active,
        locked_min_value: locked_min as i32,
        substat_roll_bounds_v: recipe.substat_roll_bounds_v.clone(),
        target_entries_by_variant: target_entries,
        current_base_by_variant: prep.current_base_by_variant.clone(),
        factory_base_by_variant: prep.factory_base_by_variant.clone(),
        target_base_override_by_variant: prep.target_base_override_by_variant.clone(),
        rarity_mode: recipe.rarity_mode.clone(),
        early_keep_mode: Some(recipe.early_keep_mode.clone()),
        auto_rarity_supplements_threshold: recipe.auto_rarity_supplements_threshold.clone(),
        early_mode,
        emission_limit: None,
    })
    .map_err(|e| format!("build_hsf_rules_for_recipe: {e}"))?;

    // Stamp the recipe's name onto every rule it emitted. The runtime builder leaves
    // RecipeName as None — it takes no name, and threading one through
    // BuildHsfRulesRuntimeIn would push it across a ts-rs boundary for no other reader.
    // The name belongs to the RECIPE, not to any one rule, so it is applied here where
    // the recipe is still in scope. Safeguard-injected rules take a different path
    // (build_safeguard_rules_core copies the parsed rule's name) and need nothing here.
    let mut rules = runtime_out.rules;
    if !recipe.name.is_empty() {
        // One Arc for the whole batch: RecipeName is Arc<str> precisely so N rules from
        // one recipe share a single allocation and each clone is a ref-count bump.
        let shared_name: Arc<str> = Arc::from(recipe.name.as_str());
        for rule in &mut rules {
            rule.RecipeName = Some(Arc::clone(&shared_name));
        }
    }
    Ok(rules)
}

// ---------------------------------------------------------------------------
// Tests — star_for_rank_code branch behavior incl. the Any-rank fallback.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // CR and CDMG are PERCENT mains, so their HSF flat flag is 0.
    //
    // These two used to return None and pick up `MAIN_STAT_F_DEFAULT_FLAG`, which is 1 — the
    // flag for a FLAT main. A CDMG% recipe then emitted `MainStatF: 1`, describing gear that
    // does not exist. `variantToMain` in hsfTypes.ts is the SSOT this mirrors; the two tables
    // disagreed only for these variants.
    #[test]
    fn percent_mains_are_not_flagged_flat() {
        // Percent mains: flag 0.
        assert_eq!(variant_to_main_parts(STAT_VARIANT_CR), (STAT_ID_CR, Some(0)));
        assert_eq!(variant_to_main_parts(STAT_VARIANT_CDMG), (STAT_ID_CDMG, Some(0)));
        assert_eq!(variant_to_main_parts(STAT_VARIANT_HP_PERCENT), (STAT_ID_HP, Some(0)));
        // Flat mains keep flag 1.
        assert_eq!(variant_to_main_parts(STAT_VARIANT_SPD), (STAT_ID_SPD, Some(1)));
        assert_eq!(variant_to_main_parts(STAT_VARIANT_ACC), (STAT_ID_ACC, Some(1)));
        assert_eq!(variant_to_main_parts(STAT_VARIANT_HP_FLAT), (STAT_ID_HP, Some(1)));
        // The emitted choice carries the same flag rather than the default.
        assert_eq!(variant_to_main_choice(STAT_VARIANT_CDMG).f, Some(0));
    }

    #[test]
    fn star_for_rank_code_branches() {
        // Exact ranks map to themselves regardless of the Any fallback.
        for r in RANK_CODE_ONE..=RANK_CODE_SIX {
            assert_eq!(star_for_rank_code(r, 6), r);
            assert_eq!(star_for_rank_code(r, 4), r, "exact rank ignores fallback");
        }
        // GTE / LTE ranges collapse to representative stars (fallback irrelevant).
        assert_eq!(star_for_rank_code(RANK_CODE_GTE_ONE, 6), 4);
        assert_eq!(star_for_rank_code(RANK_CODE_GTE_FOUR, 6), 4);
        assert_eq!(star_for_rank_code(RANK_CODE_GTE_FIVE, 6), 5);
        assert_eq!(star_for_rank_code(RANK_CODE_LTE_FOUR, 6), 4);
        assert_eq!(star_for_rank_code(RANK_CODE_LTE_FIVE, 6), 5);
        assert_eq!(star_for_rank_code(RANK_CODE_LTE_SIX, 6), 6);
    }

    #[test]
    fn any_rank_uses_fallback() {
        // Any rank (0) honours anyRankDefaultsTo — the whole point of the port.
        assert_eq!(star_for_rank_code(RANK_CODE_ANY, 6), 6);
        assert_eq!(star_for_rank_code(RANK_CODE_ANY, 4), 4);
        assert_eq!(star_for_rank_code(RANK_CODE_ANY, 1), 1);
        // Out-of-range fallbacks clamp into 1..6.
        assert_eq!(star_for_rank_code(RANK_CODE_ANY, 0), 1);
        assert_eq!(star_for_rank_code(RANK_CODE_ANY, 99), 6);
    }

    // The anomalous append must mirror the TS resolver —
    // only jewelry slots that SURVIVE the main-stat viability gate qualify.
    #[test]
    fn anomalous_append_requires_viable_jewelry_slot() {
        // Ring selected but the SPD main excludes rings: the ring is not viable,
        // so no anomalous variants despite the jewelry slot in the pool.
        let dead_ring = resolve_allowed_substats_for_slots_and_mains(
            &[ARTIFACT_TYPE_RING, ARTIFACT_TYPE_BOOTS],
            &[STAT_VARIANT_SPD],
        );
        assert!(dead_ring.iter().all(|v| !ANOMALOUS_SUBSTAT_VARIANTS.contains(v)));
        // A viable ring (wildcard mains) appends all eight after the classic list.
        let viable_ring = resolve_allowed_substats_for_slots_and_mains(&[ARTIFACT_TYPE_RING], &[]);
        assert!(ANOMALOUS_SUBSTAT_VARIANTS.iter().all(|v| viable_ring.contains(v)));
        // Artifact-only scopes never include them.
        let boots_only = resolve_allowed_substats_for_slots_and_mains(&[ARTIFACT_TYPE_BOOTS], &[]);
        assert!(boots_only.iter().all(|v| !ANOMALOUS_SUBSTAT_VARIANTS.contains(v)));
    }

    #[test]
    fn anomalous_rank_values_mirror_the_ts_table() {
        // The two observed anchors — everything else hangs off these.
        assert_eq!(anomalous_roll_value_for_rank(5), 1.25);
        assert_eq!(anomalous_roll_value_for_rank(6), 1.5);
        // Uniform 0.25 step across the covered range.
        let expected = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5];
        for (idx, want) in expected.iter().enumerate() {
            assert_eq!(anomalous_roll_value_for_rank(idx as i64 + 1), *want);
        }
        // Out-of-range ranks clamp to the nearest end, never to 0 ("no target").
        assert_eq!(anomalous_roll_value_for_rank(0), 0.25);
        assert_eq!(anomalous_roll_value_for_rank(7), 1.5);
        // Factory minima pick up the tier value, so each rank seeds a different target.
        for &variant in ANOMALOUS_SUBSTAT_VARIANTS {
            assert_eq!(factory_minima_for_star(6).get(&variant), Some(&1.5));
            assert_eq!(factory_minima_for_star(5).get(&variant), Some(&1.25));
        }
    }
}
