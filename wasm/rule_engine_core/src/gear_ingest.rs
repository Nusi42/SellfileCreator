// gear_ingest — the single definition of the raw-gear → rule-engine normalisation rules.
//
// Every consumer that turns LIVE game gear into something the matcher can judge goes
// through here: the native DLL (`sfc_engine`) calls these directly, and the
// app's TypeScript ingest (`src/lib/importers/gearDbNormalizer.ts`) mirrors them against
// the same generated domain constants.
//
// The rules below are not cosmetic — each was found by a verdict disagreeing with the
// app's own preview on real gear, and each silently mis-sells gear when it is missing.
// A wrong sell spends a player's gear irreversibly, so the reasoning is kept next to the
// arithmetic rather than left in a commit message.
//
// The One-Definition gate applies across languages: rounding a stat with an inline
// expression somewhere else is the violation, even in another language.

use crate::generated_domain_constants::{
    anomalous_variant_for_stat_id, is_anomalous_substat_variant, ACCESSORY_NO_SET_ID, ARTIFACT_TYPE_BANNER,
    ARTIFACT_TYPE_RING, LEVEL_MILESTONE_0, LEVEL_MILESTONE_12, LEVEL_MILESTONE_16, LEVEL_MILESTONE_4,
    LEVEL_MILESTONE_8, STAT_ID_ACC, STAT_ID_ATK, STAT_ID_CDMG, STAT_ID_CR, STAT_ID_DEF, STAT_ID_HP, STAT_ID_RES,
    STAT_ID_SPD,
};

// The game stores every stat in 32.32 fixed point; a raw wire value divides by this to
// reach the number the game's own UI shows.
pub const STAT_FIXED_POINT_SCALE: f64 = 4_294_967_296.0;

// Percent-displayed stats are stored as a fraction and shown x100.
const PERCENT_DISPLAY_SCALE: f64 = 100.0;

// The upgrade levels a rule can name. The `.hsf` format has no "level >= N": a rule
// carries one LVLForCheck matched by EXACT equality, so only these appear in a real
// export (plus the LEVEL_ANY_SENTINEL "any" marker, which is not a gear level).
pub const LEVEL_MILESTONES: [i64; 5] = [
    LEVEL_MILESTONE_0,
    LEVEL_MILESTONE_4,
    LEVEL_MILESTONE_8,
    LEVEL_MILESTONE_12,
    LEVEL_MILESTONE_16,
];

// The stats whose game UI shows whole numbers, so a rounded value must be an integer.
const ROUND_TO_INTEGER_STAT_IDS: [i64; 6] = [
    STAT_ID_HP,
    STAT_ID_ATK,
    STAT_ID_DEF,
    STAT_ID_SPD,
    STAT_ID_RES,
    STAT_ID_ACC,
];

// Decimal places kept for percent stats, and for everything else.
const PERCENT_DECIMALS: f64 = 100.0;
const DEFAULT_DECIMALS: f64 = 1000.0;

// Ring / Amulet / Banner — the slots that can carry a faction and an accessory set.
pub fn is_accessory_slot(slot: i64) -> bool {
    (ARTIFACT_TYPE_RING..=ARTIFACT_TYPE_BANNER).contains(&slot)
}

// The mode-damage family, whose damage-taken half the game stores NEGATIVE.
pub fn is_anomalous_stat_id(stat_id: i64) -> bool {
    anomalous_variant_for_stat_id(stat_id).is_some()
}

// True when a stat id displays as a percentage for the given flat flag.
//
// Percent HP/ATK/DEF are percent only when NOT flat (one id spells both forms); CR/CDMG
// always are, and so is every anomalous mode-damage substat.
pub fn is_percent_stat(stat_id: i64, is_flat: bool) -> bool {
    if stat_id == STAT_ID_CR || stat_id == STAT_ID_CDMG || is_anomalous_stat_id(stat_id) {
        return true;
    }
    !is_flat && (stat_id == STAT_ID_HP || stat_id == STAT_ID_ATK || stat_id == STAT_ID_DEF)
}

// Decode one 32.32 fixed-point wire value into the number the game's UI shows.
pub fn decode_fixed_point(raw: f64) -> f64 {
    if raw.is_finite() {
        raw / STAT_FIXED_POINT_SCALE
    } else {
        0.0
    }
}

// Apply display units to a decoded value: percent stats show x100.
// Mirrors the TS `convertStatUnits`.
pub fn convert_stat_units(stat_id: i64, is_flat: bool, value: f64) -> f64 {
    if is_percent_stat(stat_id, is_flat) {
        value * PERCENT_DISPLAY_SCALE
    } else {
        value
    }
}

// Round a display value to the precision the app's importer keeps (TS `roundStatValue`).
//
// THIS DECIDES THRESHOLD COMPARISONS. Because stats are 32.32 fixed point, a substat the
// game UI and the app both call "12" decodes to 11.999999964609742 — measured on a real
// 8,433-piece vault, 44% of substats are non-integral like this, and every one of them
// silently failed a `>= 12` rule. The app rounds at import so its engine only ever sees
// clean values; anything feeding the engine directly must round identically, or it
// condemns gear the app would keep.
pub fn round_stat_value(stat_id: i64, is_flat: bool, value: f64) -> f64 {
    if !value.is_finite() {
        return 0.0;
    }
    if is_percent_stat(stat_id, is_flat) {
        return (value * PERCENT_DECIMALS).round() / PERCENT_DECIMALS;
    }
    if ROUND_TO_INTEGER_STAT_IDS.contains(&stat_id) {
        return value.round();
    }
    (value * DEFAULT_DECIMALS).round() / DEFAULT_DECIMALS
}

// Convert + round + fold one raw component to its final display magnitude.
//
// The damage-taken family is stored as a negative percent; the stat identity already
// carries the direction, so the magnitude is what thresholds reason about.
pub fn finalize_stat_component(stat_id: i64, is_flat: bool, raw: f64) -> f64 {
    let converted = convert_stat_units(stat_id, is_flat, decode_fixed_point(raw));
    let rounded = round_stat_value(stat_id, is_flat, converted);
    if is_anomalous_stat_id(stat_id) {
        rounded.abs()
    } else {
        rounded
    }
}

// The value a RULE sees for one substat: base + the mythical bonus, NEVER the glyph.
//
// The app's `buildSubValueMap` is "pre-glyph" — glyphs ride along as preview extras and
// are added explicitly downstream, so counting one here makes a piece clear a threshold
// that the app's own preview of the same sellfile fails.
//
// Each component is rounded SEPARATELY and the sum rounded again (the TS `finalizeStat`
// rounds each, then `buildSubValueMap` rounds the fold). Summing raw and rounding once
// lands on the other side of a threshold for values near a boundary.
pub fn substat_rule_value(stat_id: i64, is_flat: bool, base_raw: f64, mythical_raw: f64) -> f64 {
    let base = finalize_stat_component(stat_id, is_flat, base_raw);
    let mythical = finalize_stat_component(stat_id, is_flat, mythical_raw);
    round_stat_value(stat_id, is_flat, base + mythical)
}

// The set id a rule sees, mirroring the app's `determineSet`.
//
// "No set" is a real KIND of ring/amulet/banner (the ones predating accessory sets), so a
// setless accessory takes the ACCESSORY_NO_SET_ID sentinel and rules name that id — a
// reference sellfile has 397 rules naming it and none naming 0. Armour keeps a plain 0:
// it is genuinely setless rather than a kind of its own, and promoting it would hand
// every setless chestplate to the accessory rules.
pub fn resolve_set_id(slot: i64, raw_set_kind_id: i64) -> i64 {
    if raw_set_kind_id <= 0 && is_accessory_slot(slot) {
        ACCESSORY_NO_SET_ID
    } else {
        raw_set_kind_id
    }
}

// Snap a live gear level to the milestone whose BAND it is in: 0-3, 4-7, 8-11, 12-15, 16.
//
// Mirrors the app's `coerceGearInspectorLevel`. Passing a raw level through instead makes
// every off-milestone piece unmatchable: a +9 piece compared against a rule's
// `LVLForCheck: 8` under exact equality misses every level rule and falls through to
// "nothing matched". Levels 1-3, 5-7, 9-11 and 13-15 are ordinary gear, so this reaches a
// large share of any vault.
//
// The milestones bound RANGES rather than marking points to round to — a rule naming
// "+12 to +16" means the piece has REACHED +12 — so this floors to the band. Snapping to
// the nearest promoted the top of each band instead, judging a +15 as +16: "keep only +16"
// then kept gear that is not +16, and "sell below +16" spared it. Levels 3, 7, 11 and 15
// are the ones that moved, 74 of 76,309 pieces across the sample accounts.
pub fn snap_level_to_milestone(level: i64) -> i64 {
    let lowest = LEVEL_MILESTONES[0];
    let highest = LEVEL_MILESTONES[LEVEL_MILESTONES.len() - 1];
    let clamped = level.clamp(lowest, highest);
    // The highest milestone at or below the level. Clamping first is what keeps a bad row
    // (a real account carries lvl 32764) reading as +16 rather than running past the top.
    *LEVEL_MILESTONES
        .iter()
        .filter(|milestone| **milestone <= clamped)
        .next_back()
        .unwrap_or(&lowest)
}

// True when a variant is one the engine treats as an anomalous mode-damage substat.
// Re-exported so an ingest caller needs one import rather than two.
pub fn is_anomalous_variant(variant: i64) -> bool {
    is_anomalous_substat_variant(variant)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generated_domain_constants::ARTIFACT_TYPE_CHESTPLATE;

    // The headline trap: a "12" that decodes just under 12 must round UP to 12, or a
    // `>= 12` rule rejects gear the app keeps.
    #[test]
    fn non_integral_fixed_point_rounds_to_the_displayed_value() {
        // 11.999999964609742, the value a real "SPD 12" substat decodes to.
        let raw = 11.999_999_964_609_742_f64 * STAT_FIXED_POINT_SCALE;
        assert_eq!(finalize_stat_component(STAT_ID_SPD, true, raw), 12.0);
    }

    // Percent and flat share a stat id, so the flag decides both scale and precision.
    #[test]
    fn percent_and_flat_share_an_id_but_not_a_precision() {
        let raw = 0.123_456_f64 * STAT_FIXED_POINT_SCALE;
        // Percent HP: x100, then two decimals.
        assert_eq!(finalize_stat_component(STAT_ID_HP, false, raw), 12.35);
        // Flat HP: no x100, rounded to a whole number.
        assert_eq!(finalize_stat_component(STAT_ID_HP, true, raw), 0.0);
    }

    // A level belongs to the band it has REACHED: 0-3, 4-7, 8-11, 12-15, 16.
    #[test]
    fn a_level_snaps_to_the_band_it_reached() {
        for (level, band) in [
            (0, 0),
            (1, 0),
            (2, 0),
            (3, 0),
            (4, 4),
            (5, 4),
            (6, 4),
            (7, 4),
            (8, 8),
            (9, 8),
            (10, 8),
            (11, 8),
            (12, 12),
            (13, 12),
            (14, 12),
            (15, 12),
            (16, 16),
        ] {
            assert_eq!(snap_level_to_milestone(level), band, "+{level} is in the +{band} band");
        }
    }

    // The top of a band must NOT be promoted into the next one: a +15 is not a +16, so a
    // rule keeping only +16 gear must not keep it.
    #[test]
    fn the_top_of_a_band_is_not_promoted() {
        assert_eq!(snap_level_to_milestone(15), 12, "a +15 has not reached +16");
        assert_eq!(snap_level_to_milestone(3), 0);
        assert_eq!(snap_level_to_milestone(7), 4);
        assert_eq!(snap_level_to_milestone(11), 8);
    }

    // Out-of-range levels clamp rather than escaping the milestone list. 32764 is not
    // hypothetical — a real sample account carries it.
    #[test]
    fn a_level_outside_the_range_clamps() {
        assert_eq!(snap_level_to_milestone(99), 16, "above the top milestone clamps");
        assert_eq!(snap_level_to_milestone(32764), 16, "a bad row still reads as +16");
        assert_eq!(snap_level_to_milestone(-3), 0, "below the bottom milestone clamps");
    }

    // A setless ACCESSORY is a kind of its own; a setless chestplate is not.
    #[test]
    fn setless_accessory_and_setless_armour_differ() {
        assert_eq!(resolve_set_id(ARTIFACT_TYPE_RING, 0), ACCESSORY_NO_SET_ID);
        assert_eq!(resolve_set_id(ARTIFACT_TYPE_BANNER, 0), ACCESSORY_NO_SET_ID);
        assert_eq!(resolve_set_id(ARTIFACT_TYPE_CHESTPLATE, 0), 0);
        // A real set id passes through on either kind of slot.
        assert_eq!(resolve_set_id(ARTIFACT_TYPE_RING, 12), 12);
        assert_eq!(resolve_set_id(ARTIFACT_TYPE_CHESTPLATE, 12), 12);
    }

    // Rounding each component separately is what keeps a boundary value on the app's side.
    #[test]
    fn components_round_separately_then_the_sum_rounds_again() {
        // Two halves that each round up to a whole SPD point.
        let half = 5.5_f64 * STAT_FIXED_POINT_SCALE;
        // 6 + 6 = 12, not round(5.5 + 5.5) = 11.
        assert_eq!(substat_rule_value(STAT_ID_SPD, true, half, half), 12.0);
    }

    // The damage-taken half is stored negative; thresholds reason about magnitude.
    #[test]
    fn anomalous_values_fold_to_magnitude() {
        // Stat id 15 is "PvE DMG -", stored as a negative percent.
        let raw = -0.0125_f64 * STAT_FIXED_POINT_SCALE;
        assert_eq!(finalize_stat_component(15, false, raw), 1.25);
    }
}
