/* eslint import/no-unused-modules: off */

/**
 * Regression tests for earlyKeepMode="early" with per-stat SPD min.
 *
 * Why: The full-selected fallback was incorrectly firing for "potential + early"
 * mode, generating lenient intermediate-level rules that allow artifacts to be
 * behind schedule. In early mode, every milestone must show proportional progress.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { warmupWasmRuleEngine } from '../../src/lib/wasm/wasmRuleEngine.js'
import { buildRulesForRecipe } from '../../src/lib/merge.js'
import { defaultSubstatTargets, type BuilderRecipe } from '../../src/lib/hsfBuilder.js'
import { RankCode, RarityCode, StatVariant } from '../../src/lib/types.js'

// earlyKeepMode="early" with SPD fixed/min=3, CR%/CDMG% wildcard, minCount=3.
// Resolves to GTE_Epic (9) via auto rarity (required_rolls=3 fits 3-milestone schedule).
const earlyMinRecipe = (): BuilderRecipe => ({
  keep: true,
  exportMode: 'active',
  rankCode: RankCode.Six,
  rarityCode: RarityCode.Any,
  rarityMode: 'auto',
  minCount: 3,
  autoMinCount: false,
  autoSubstatFlex: false,
  substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.CDMG],
  fixedSubstatsV: [StatVariant.SPD],
  substatRollBoundsV: {
    [StatVariant.SPD]: { min: 3 },
    [StatVariant.CR]: { any: true },
    [StatVariant.CDMG]: { any: true },
  },
  minLevel: 0,
  maxLevel: 16,
  autoMinRequiredRolls: true,
  minRequiredRolls: 0,
  earlyKeepMode: 'early',
})

test('earlyKeepMode=early with SPD min=3 produces only GTE_Epic (Rarity 9) rules', async () => {
  await warmupWasmRuleEngine()
  const targets = defaultSubstatTargets()
  const rules = buildRulesForRecipe({
    recipe: earlyMinRecipe(),
    metasets: [],
    substatTargets: targets,
  })

  // Log for debugging — formatted to copy well from terminal.
  for (const rule of rules) {
    const subs = (rule.Substats ?? []).map((s) => `${s?.ID}:${s?.Condition}${s?.Value}`).join(',')
    console.log(`[early-mode] Rarity=${rule.Rarity} LVL=${rule.LVLForCheck} substats=[${subs}]`)
  }

  // All emitted rules must carry GTE_Epic (9). No lenient GTE_Legendary (16) supplement
  // should appear because earlyKeepMode="early" skips the late-mode fallback branch.
  const rarityNine = RarityCode.GTE_Epic  // 9
  const rarityBad = RarityCode.GTE_Legendary  // 16
  for (const rule of rules) {
    assert.notEqual(rule.Rarity, rarityBad,
      `Found unexpected Rarity=${rule.Rarity} rule at LVL=${rule.LVLForCheck}`)
  }
  assert(rules.every((r) => r.Rarity === rarityNine),
    `Expected all rules to have Rarity=${rarityNine}, got rarities: ${rules.map((r) => r.Rarity).join(',')}`)
})

test('earlyKeepMode=early with SPD min=3 emits exactly 5 strict milestone rules', async () => {
  await warmupWasmRuleEngine()
  const targets = defaultSubstatTargets()
  const rules = buildRulesForRecipe({
    recipe: earlyMinRecipe(),
    metasets: [],
    substatTargets: targets,
  })

  // GTE_Epic has roll milestones at 4, 8, 12 (3 rolls) + addition at 16.
  // Expected: one rule per milestone level (0, 4, 8, 12, 16).
  // Level 0 is a presence-only rule (no roll requirement yet).
  assert.equal(rules.length, 5,
    `Expected 5 rules, got ${rules.length}: LVLs=${rules.map((r) => r.LVLForCheck).join(',')}`)

  // SPD thresholds follow the strict early-mode trajectory.
  // Builder emits base + rolls*base = (1+rolls)*base per roll count, so a
  // substat with k milestone rolls carries threshold (k+1)*base.
  // GTE_Epic has roll milestones at +4, +8, +12 (3 rolls total); +16 is an
  // addition event only, so the roll count stays at 3.
  const spdBase = targets.six[StatVariant.SPD] ?? 5
  const levelToExpectedSpdThreshold: Record<number, number | null> = {
    0: null,           // level 0: presence only, SPD roll threshold not enforced yet
    4: spdBase * 2,    // 1 milestone roll must be in SPD: (1+1)*base = 2*base
    8: spdBase * 3,    // 2 milestone rolls in SPD: (1+2)*base = 3*base
    12: spdBase * 4,   // 3 milestone rolls in SPD: (1+3)*base = 4*base
    16: spdBase * 4,   // no extra roll milestone at +16; threshold matches +12
  }
  for (const rule of rules) {
    const lvl = rule.LVLForCheck ?? -1
    const expected = levelToExpectedSpdThreshold[lvl]
    if (expected == null) continue  // no SPD roll threshold expected at this level
    const spdSub = (rule.Substats ?? []).find(
      (s) => s?.ID === 4 && s.IsFlat === true && s.Condition === '>='
    )
    assert(spdSub != null, `Expected SPD substat in rule at LVL=${lvl}`)
    assert.equal(Number(spdSub!.Value), expected,
      `LVL=${lvl}: expected SPD>=${expected}, got SPD>=${spdSub!.Value}`)
  }
})

export {}
