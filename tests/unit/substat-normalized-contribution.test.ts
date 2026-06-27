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

import { substatNormalizedContribution, getGlyphAverageForVariant } from '../../src/lib/substatRollNormalization.js'
import { StatVariant } from '../../src/lib/types.js'

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
