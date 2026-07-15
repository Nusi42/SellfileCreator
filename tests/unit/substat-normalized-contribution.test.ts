/* eslint import/no-unused-modules: off */
/**
 * substat-normalized-contribution
 *
 * Locks the SSOT scoring contribution shared by the safeguard scorer (safeguards.ts) and the
 * Gear Inspector normalized sort (gearInspectorSort.ts). The key guarantees:
 *  - Glyphable substats credit rank-limited glyph potential, so a 6★ outscores an equal-substat 5★.
 *  - Non-glyphable substats (CR/CDMG) credit no glyph potential, so rank cannot separate them here.
 *  - Absent substats (currentValue ≤ 0) contribute nothing, including no glyph potential.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { substatNormalizedContribution, getGlyphAverageForVariant, unselectedSubstatEpsilonBonus } from '../../src/lib/substatRollNormalization.js'
import { StatVariant } from '../../src/lib/types.js'
import {
  SAFEGUARD_SCORE_NON_FLAT_EPSILON_WEIGHT,
  SAFEGUARD_SCORE_SELECTED_ALIGNED_FLAT_EPSILON_WEIGHT,
  SAFEGUARD_WEIGHT_MIN,
} from '../../src/lib/generated/domainConstants.js'

// SPD per-roll 6★ cap is 6; glyph average is 3 at 5★ and 5.5 at 6★ (see domain-constants.json).
const SPD_MAX6 = 6

test('glyphable substat: a 6★ scores higher than an equal-substat 5★', () => {
  const five = substatNormalizedContribution(5, StatVariant.SPD, 5, 1)
  const six = substatNormalizedContribution(6, StatVariant.SPD, 5, 1)
  // Both share the same current-value term (5/6); only the glyph tier differs.
  const fiveExpected = 5 / SPD_MAX6 + getGlyphAverageForVariant(5, StatVariant.SPD) / SPD_MAX6
  const sixExpected = 5 / SPD_MAX6 + getGlyphAverageForVariant(6, StatVariant.SPD) / SPD_MAX6
  assert.ok(Math.abs(five - fiveExpected) < 1e-9, 'five-star contribution matches the explicit formula')
  assert.ok(Math.abs(six - sixExpected) < 1e-9, 'six-star contribution matches the explicit formula')
  assert.ok(six > five, 'the 6★ glyph tier must pull its score above the equal-substat 5★')
})

test('non-glyphable substat (CR): rank does not change the contribution', () => {
  const five = substatNormalizedContribution(5, StatVariant.CR, 5, 1)
  const six = substatNormalizedContribution(6, StatVariant.CR, 5, 1)
  assert.equal(five, six, 'CR has no glyph potential, so the 5★ and 6★ contributions are identical')
})

test('weight scales the whole contribution (current value + glyph potential)', () => {
  const unit = substatNormalizedContribution(6, StatVariant.SPD, 5, 1)
  const weighted = substatNormalizedContribution(6, StatVariant.SPD, 5, 2.5)
  assert.ok(Math.abs(weighted - unit * 2.5) < 1e-9, 'weight multiplies both terms uniformly')
})

test('absent substat contributes nothing, including no glyph potential', () => {
  assert.equal(substatNormalizedContribution(6, StatVariant.SPD, 0, 1), 0)
})

// ── unselectedSubstatEpsilonBonus: the scorer's tie-break ladder for unselected lines ──

test('epsilon bonus: unaligned flat HP/ATK/DEF lines never earn the tie-break', () => {
  const flats = [
    { variant: StatVariant.HP_FLAT, value: 565 },
    { variant: StatVariant.ATK_FLAT, value: 30 },
    { variant: StatVariant.DEF_FLAT, value: 30 },
  ]
  // Selection (CR) and main stat (SPD) are unrelated to every flat → all three earn 0.
  assert.equal(unselectedSubstatEpsilonBonus(flats, [StatVariant.CR], StatVariant.SPD), 0, 'unaligned flat lines contribute 0')
})

test('epsilon bonus: selected substats are excluded (they already score at real weight)', () => {
  const substats = [{ variant: StatVariant.SPD, value: 6 }]
  assert.equal(unselectedSubstatEpsilonBonus(substats, [StatVariant.SPD]), 0, 'selected SPD earns no epsilon')
  const expected = SAFEGUARD_SCORE_NON_FLAT_EPSILON_WEIGHT * (6 / SPD_MAX6)
  assert.ok(
    Math.abs(unselectedSubstatEpsilonBonus(substats, [StatVariant.CR]) - expected) < 1e-15,
    'unselected SPD earns exactly epsilon × normalized value (no glyph term)',
  )
})

test('epsilon bonus: stacked full rolls stay below the minimum explicit weight contribution', () => {
  // A piece stacked with three unselected max-value non-flat lines must still earn less than a
  // single selected substat at the weight floor (0.01) with one ordinary roll — the tie-break
  // must never override an explicit user weight.
  const stacked = [
    { variant: StatVariant.SPD, value: 6 },
    { variant: StatVariant.ACC, value: 12 },
    { variant: StatVariant.RES, value: 12 },
  ]
  const bonus = unselectedSubstatEpsilonBonus(stacked, [StatVariant.CR])
  const minExplicit = SAFEGUARD_WEIGHT_MIN * substatNormalizedContribution(1, StatVariant.CR, 3.5, 1)
  assert.ok(bonus > 0, 'useful unselected lines earn a positive tie-break')
  assert.ok(bonus < minExplicit, 'epsilon stacking stays below the smallest explicit weight edge')
})

test('epsilon bonus: flat aligned to a selected percent stat edges an unaligned flat', () => {
  // HP% is selected → a flat HP line earns the selected-aligned tier; flat ATK earns nothing.
  const HP_FLAT_MAX6 = 565
  const flatHp = [{ variant: StatVariant.HP_FLAT, value: 300 }]
  const flatAtk = [{ variant: StatVariant.ATK_FLAT, value: 16 }]
  const hpBonus = unselectedSubstatEpsilonBonus(flatHp, [StatVariant.HP])
  const expected = SAFEGUARD_SCORE_SELECTED_ALIGNED_FLAT_EPSILON_WEIGHT * (300 / HP_FLAT_MAX6)
  assert.ok(Math.abs(hpBonus - expected) < 1e-18, 'selected-aligned flat earns exactly its tier weight × normalized value')
  assert.equal(unselectedSubstatEpsilonBonus(flatAtk, [StatVariant.HP]), 0, 'unaligned flat ATK earns nothing')
})

test('epsilon bonus: flat aligned to the piece\'s own main stat edges an unaligned flat', () => {
  // Piece has an HP% main → flat HP earns the main-aligned tier even with an unrelated selection.
  const flatHp = [{ variant: StatVariant.HP_FLAT, value: 300 }]
  const withHpMain = unselectedSubstatEpsilonBonus(flatHp, [StatVariant.SPD], StatVariant.HP)
  const withAtkMain = unselectedSubstatEpsilonBonus(flatHp, [StatVariant.SPD], StatVariant.ATK)
  assert.ok(withHpMain > 0, 'main-aligned flat earns the tie-break')
  assert.equal(withAtkMain, 0, 'the same flat under an unrelated main earns nothing')
})

test('epsilon bonus: ladder order — doubly aligned > singly aligned, non-flat > any flat', () => {
  const flatHp = [{ variant: StatVariant.HP_FLAT, value: 300 }]
  // Both alignments stack additively, so doubly-aligned strictly beats singly-aligned.
  const doubly = unselectedSubstatEpsilonBonus(flatHp, [StatVariant.HP], StatVariant.HP)
  const singly = unselectedSubstatEpsilonBonus(flatHp, [StatVariant.HP], StatVariant.ATK)
  assert.ok(doubly > singly, 'selected+main alignment stacks above selection alignment alone')
  // Even a max-rolled doubly-aligned flat stays below a weak genuine non-flat line.
  const godFlat = unselectedSubstatEpsilonBonus(
    [{ variant: StatVariant.HP_FLAT, value: 2825 }], [StatVariant.HP], StatVariant.HP,
  )
  const weakRes = unselectedSubstatEpsilonBonus([{ variant: StatVariant.RES, value: 3 }], [StatVariant.HP])
  assert.ok(weakRes > godFlat, 'the non-flat tier dominates every flat-alignment stack')
})
