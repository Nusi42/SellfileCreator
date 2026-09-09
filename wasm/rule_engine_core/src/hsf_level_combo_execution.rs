use serde::{Deserialize, Serialize};

use crate::build_hsf_presence_only_rules_core;
use crate::emit_hsf_rules_for_distributions_core;
use crate::hsf_combo_runtime::execute_hsf_combo_runtime_core;
use crate::hsf_combo_runtime::ExecuteHsfComboRuntimeIn;
use crate::BuildHsfPresenceOnlyRulesIn;
use crate::EmitHsfMainChoiceIn;
use crate::EmitHsfRulesForDistributionsIn;
use crate::EmitHsfSubstatIn;
use crate::RuleRaw;
use crate::FILTER_OPTION_NONE_I32;
use crate::RARITY_CODE_EPIC;
use crate::RARITY_CODE_RARE;

// Collapse profile is precomputed per combo in TS and reused across levels.
// Keep only the fields needed for collapse emission in this runtime payload.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct HsfComboCollapseProfileIn {
    pub(crate) base_vals: Vec<i32>,
    pub(crate) factory_eligible: bool,
    pub(crate) substats: Vec<EmitHsfSubstatIn>,
}

// Level-combo execution payload replaces the remaining largest TS branch.
// It decides collapse/presence/runtime paths and emits concrete rules.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ExecuteHsfLevelComboIn {
    pub(crate) sentinel_already_collapsed: bool,
    pub(crate) combo: Vec<i32>,
    pub(crate) present: i32,
    pub(crate) level: i32,
    pub(crate) rarity_code: i64,
    pub(crate) addition_levels_count: i32,
    pub(crate) addition_event_at_level: bool,
    pub(crate) collapse_branch_eligible: bool,
    pub(crate) collapse_rarity_eligible: bool,
    pub(crate) sentinel_eligible_for_branch: bool,
    pub(crate) combo_profile: HsfComboCollapseProfileIn,
    pub(crate) base_rule: RuleRaw,
    pub(crate) main_choices: Vec<EmitHsfMainChoiceIn>,
    pub(crate) emit_any_main_when_no_choices: bool,
    pub(crate) runtime: ExecuteHsfComboRuntimeIn,
}

// Output keeps rule rows plus the sentinel-collapse state update.
// TS uses sentinelCollapsed=true to memoize LEVEL_ANY collapse coverage.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ExecuteHsfLevelComboOut {
    pub(crate) rules: Vec<RuleRaw>,
    pub(crate) sentinel_collapsed: bool,
}

// Collapse mode keeps the branch decision explicit and typed.
// This mirrors the old TS shouldCollapse closure without JS loops.
enum CollapseMode {
    None,
    Sentinel,
    Level,
}

// Compute collapse mode using the same constraints as the TS branch.
// This preserves factory-minima gating semantics while rust owns execution.
fn resolve_collapse_mode(input: &ExecuteHsfLevelComboIn) -> Result<CollapseMode, String> {
    let m = input.combo.len() as i32;
    // Collapse never applies to empty combos.
    if m == 0 {
        return Ok(CollapseMode::None);
    }
    // Collapse requires global and rarity eligibility from the branch profile.
    if !input.collapse_branch_eligible || !input.collapse_rarity_eligible {
        return Ok(CollapseMode::None);
    }
    // Collapse requires exact presence, no level-local addition event, and factory profile eligibility.
    if m != input.present || input.addition_event_at_level || !input.combo_profile.factory_eligible {
        return Ok(CollapseMode::None);
    }
    // Triple collapse is epic-only and excludes level 16.
    if m == 3 {
        if input.rarity_code != RARITY_CODE_EPIC || input.level == 16 {
            return Ok(CollapseMode::None);
        }
    // Pair collapse is rare-only and excludes level 12+.
    } else if m == 2 {
        if input.rarity_code != RARITY_CODE_RARE || input.level >= 12 {
            return Ok(CollapseMode::None);
        }
    // Collapse only applies to pairs, triples, or quads.
    } else if m < 4 {
        return Ok(CollapseMode::None);
    }

    // Keep previous dev guard parity: additions for non-rare/epic collapse are invalid.
    if input.rarity_code != RARITY_CODE_EPIC && input.rarity_code != RARITY_CODE_RARE && input.addition_levels_count > 0
    {
        return Err("Factory minima collapse triggered for non-rare/epic rarity with additions.".to_string());
    }

    // Sentinel collapse applies only at level 0 when branch allows it.
    if input.sentinel_eligible_for_branch && input.level == 0 {
        return Ok(CollapseMode::Sentinel);
    }
    Ok(CollapseMode::Level)
}

// Emit factory-minima row with the shared distribution->rule emitter core.
// This keeps main/substat exclusion semantics aligned with normal emissions.
fn emit_factory_minima_rules(input: &ExecuteHsfLevelComboIn, level: i64) -> Vec<RuleRaw> {
    let width = input.combo_profile.substats.len();
    let emit_payload = EmitHsfRulesForDistributionsIn {
        base_rule: {
            let mut base = input.base_rule.clone();
            base.LVLForCheck = Some(level);
            base.Substats = Some(Vec::new());
            base
        },
        substats: input.combo_profile.substats.clone(),
        distributions: vec![vec![0i32; width]],
        base_vals: input.combo_profile.base_vals.clone(),
        mins: vec![0i32; width],
        max_caps: vec![FILTER_OPTION_NONE_I32; width],
        optional_mask: vec![false; width],
        skip_optional_baseline: false,
        main_choices: input.main_choices.clone(),
        emit_any_main_when_no_choices: input.emit_any_main_when_no_choices,
        target_bases: vec![None; width],
        target_increments: vec![Vec::<Option<i32>>::new(); width],
    };
    emit_hsf_rules_for_distributions_core(&emit_payload, &emit_payload.distributions)
}

// Execute the non-substat path through the shared presence-only core.
// This preserves existing level/main unroll behavior for m===0 combos.
fn emit_presence_only_rules(input: &ExecuteHsfLevelComboIn) -> Vec<RuleRaw> {
    let payload = BuildHsfPresenceOnlyRulesIn {
        base_core: {
            let mut base = input.base_rule.clone();
            base.Substats = Some(Vec::new());
            base
        },
        main_choices: input.main_choices.clone(),
        level_window_min: input.level as i64,
        level_window_max: input.level as i64,
    };
    build_hsf_presence_only_rules_core(&payload)
}

// Core execution for one (branch, level, combo) slot.
// Returns emitted rules plus sentinel collapse state update.
pub(crate) fn execute_hsf_level_combo_core(input: &ExecuteHsfLevelComboIn) -> Result<ExecuteHsfLevelComboOut, String> {
    // Sentinel-collapsed combos are already covered by LEVEL_ANY rows.
    if input.sentinel_already_collapsed {
        return Ok(ExecuteHsfLevelComboOut {
            rules: Vec::<RuleRaw>::new(),
            sentinel_collapsed: false,
        });
    }

    let m = input.combo.len() as i32;
    // Insufficient present slots means no feasible rows at this level.
    if input.present < m {
        return Ok(ExecuteHsfLevelComboOut {
            rules: Vec::<RuleRaw>::new(),
            sentinel_collapsed: false,
        });
    }

    // Resolve collapse mode before runtime branch execution.
    match resolve_collapse_mode(input)? {
        CollapseMode::Sentinel => {
            let rules = emit_factory_minima_rules(input, crate::LEVEL_ANY_SENTINEL);
            return Ok(ExecuteHsfLevelComboOut {
                rules,
                sentinel_collapsed: true,
            });
        }
        CollapseMode::Level => {
            let rules = emit_factory_minima_rules(input, input.level as i64);
            return Ok(ExecuteHsfLevelComboOut {
                rules,
                sentinel_collapsed: false,
            });
        }
        CollapseMode::None => {}
    }

    // m===0 still emits presence-only level/main rows.
    if m == 0 {
        let rules = emit_presence_only_rules(input);
        return Ok(ExecuteHsfLevelComboOut {
            rules,
            sentinel_collapsed: false,
        });
    }

    // Non-empty non-collapse path delegates to combo runtime execution core.
    let rules = execute_hsf_combo_runtime_core(&input.runtime);
    Ok(ExecuteHsfLevelComboOut {
        rules,
        sentinel_collapsed: false,
    })
}
