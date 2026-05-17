/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildHsfRules, defaultSubstatTargets, resolveAutoRarityCode, type BuilderRecipe } from '../../src/lib/hsfBuilder'
import { buildRulesForRecipe } from '../../src/lib/merge'
import { computeDuplicateIndices } from '../../src/lib/recipeDuplicates'
import { ArtifactType, RankCode, RarityCode, StatVariant, subToVariant } from '../../src/lib/types'
import { normalizeAggregateRollTargets } from '../../src/lib/recipeNormalization'
import { variantToSub } from '../../src/lib/hsfTypes'

const baseBuilderRecipe = (overrides: Partial<BuilderRecipe> = {}): BuilderRecipe => ({
  keep: true,
  exportMode: 'active',
  rankCode: RankCode.Six,
  rarityCode: RarityCode.Any,
  rarityMode: 'auto',
  minCount: 1,
  autoSubstatFlex: false,
  autoMinRequiredRolls: false,
  substatsV: [StatVariant.SPD],
  fixedSubstatsV: [StatVariant.SPD],
  ...overrides,
})

test('locked minimums above per-stat caps yield no rules', () => {
  const cfg = baseBuilderRecipe({
    lockedMinRequiredRolls: 3,
    minRequiredRolls: 0,
    substatRollBoundsV: {
      [StatVariant.SPD]: { max: 1 },
    },
  })
  const rules = buildHsfRules(cfg)
  assert.equal(rules.length, 0, 'aggregate locked minimum should prune infeasible recipes')
})

test('lockedMinRequiredRolls raises Auto rarity even when global min is lower', () => {
  const baseCfg = baseBuilderRecipe({
    lockedMinRequiredRolls: 0,
    minRequiredRolls: 0,
  })
  const withoutLockedMin = resolveAutoRarityCode(baseCfg)
  assert.equal(withoutLockedMin, RarityCode.Any, 'no locked min should keep auto rarity broad')

  const withLockedMin = resolveAutoRarityCode({
    ...baseCfg,
    lockedMinRequiredRolls: 3,
  })
  assert.equal(withLockedMin, RarityCode.GTE_Epic, 'locked min should promote auto rarity to ≥ Epic')
})

test('locked minimum forces extra rolls on locked stats before collapsing to min-only rows', () => {
  const cfg = baseBuilderRecipe({
    appearance: { name: 'gauntlet sample' },
    minCount: 3,
    autoMinCount: false,
    artifactTypes: [ArtifactType.Gauntlets],
    mainStatsV: [StatVariant.CDMG],
    substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.HP],
    fixedSubstatsV: [StatVariant.SPD, StatVariant.CR],
    substatRollBoundsV: {
      [StatVariant.SPD]: { min: 1 },
      [StatVariant.CR]: { any: true },
      [StatVariant.HP]: { any: true },
    },
    minRequiredRolls: 3,
    autoMinRequiredRolls: false,
    lockedMinRequiredRolls: 2,
    earlyKeepMode: 'late',
  })
  const targets = defaultSubstatTargets()
  const rules = buildHsfRules(cfg, targets)
  const levelSixteen = rules.filter(rule => rule.LVLForCheck === 16)
  assert(levelSixteen.length > 0, 'expected +16 rules to exist')
  const baseFor = (variant: StatVariant): number => targets.six[variant] ?? 0
  const lockedVariants: StatVariant[] = [StatVariant.SPD, StatVariant.CR]
  const rollsForValue = (variant: StatVariant, value: number): number => {
    const base = baseFor(variant)
    if (base <= 0) return 0
    if (value <= base) return 0
    const delta = value - base
    // Builder emits multiples of the base target for each additional roll.
    if (delta % base !== 0) {
      throw new Error(`unexpected threshold ${value} for variant ${variant}`)
    }
    return delta / base
  }
  for (const rule of levelSixteen) {
    let lockedRolls = 0
    for (const variant of lockedVariants) {
      const match = rule.Substats?.find(sub => (
        sub?.Condition === '>='
        && subToVariant(sub?.ID, sub?.IsFlat) === variant
      ))
      assert(match, `expected locked variant ${variant} to be present in rule`)
      lockedRolls += rollsForValue(variant, Number(match!.Value ?? 0))
    }
    assert(lockedRolls >= (cfg.lockedMinRequiredRolls ?? 0), `locked stats should have ≥ ${cfg.lockedMinRequiredRolls} rolls (saw ${lockedRolls})`)
  }
})

test('locked minimum enforcement survives buildRulesForRecipe wrappers', () => {
  const targets = defaultSubstatTargets()
  const cfg = baseBuilderRecipe({
    appearance: { name: 'gauntlet sample' },
    minCount: 3,
    autoMinCount: false,
    artifactTypes: [ArtifactType.Gauntlets],
    mainStatsV: [StatVariant.CDMG],
    substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.HP],
    fixedSubstatsV: [StatVariant.SPD, StatVariant.CR],
    substatRollBoundsV: {
      [StatVariant.SPD]: { min: 1 },
      [StatVariant.CR]: { any: true },
      [StatVariant.HP]: { any: true },
    },
    minRequiredRolls: 3,
    autoMinRequiredRolls: false,
    lockedMinRequiredRolls: 2,
    earlyKeepMode: 'late',
  })
  const rules = buildRulesForRecipe({ recipe: cfg, metasets: [], substatTargets: targets })
  const lockedVariants: StatVariant[] = [StatVariant.SPD, StatVariant.CR]
  const baseFor = (variant: StatVariant): number => targets.six[variant] ?? 0
  const rollsForValue = (variant: StatVariant, value: number): number => {
    const base = baseFor(variant)
    if (base <= 0) return 0
    if (value <= base) return 0
    const delta = value - base
    if (delta % base !== 0) {
      throw new Error(`unexpected threshold ${value} for variant ${variant}`)
    }
    return delta / base
  }
  const sixteen = rules.filter(rule => rule.LVLForCheck === 16)
  assert(sixteen.length > 0, 'expected +16 rows to verify aggregate enforcement')
  for (const rule of sixteen) {
    let lockedRolls = 0
    for (const variant of lockedVariants) {
      const match = rule.Substats?.find(sub => (
        sub?.Condition === '>='
        && subToVariant(sub?.ID, sub?.IsFlat) === variant
      ))
      assert(match, `expected locked variant ${variant} to be present in rule`)
      lockedRolls += rollsForValue(variant, Number(match!.Value ?? 0))
    }
    assert(lockedRolls >= (cfg.lockedMinRequiredRolls ?? 0), 'locked subset should satisfy locked minimum even after merge wrappers')
  }
})

test('global minimums still apply to every selected stat when locks are active', () => {
  const cfg = baseBuilderRecipe({
    rarityCode: RarityCode.Legendary,
    rarityMode: 'code',
    substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.HP],
    fixedSubstatsV: [StatVariant.SPD, StatVariant.CR],
    minCount: 3,
    autoMinCount: false,
    minRequiredRolls: 3,
    autoMinRequiredRolls: false,
    lockedMinRequiredRolls: 2,
    substatRollBoundsV: {
      [StatVariant.SPD]: { any: true },
      [StatVariant.CR]: { any: true },
      [StatVariant.HP]: { any: true },
    },
  })
  const targets = defaultSubstatTargets()
  const hpVariant = StatVariant.HP
  const hpBase = targets.six[hpVariant] ?? 0
  const hpTuple = variantToSub(hpVariant)
  const rules = buildHsfRules(cfg, targets)
  const rowsAtSixteen = rules.filter(rule => rule.LVLForCheck === 16)
  assert(rowsAtSixteen.length > 0, 'expected level 16 rows to exist for verification')
  const rowWithHpRoll = rowsAtSixteen.find((rule) => (
    rule.Substats?.some((sub) => (
      sub?.ID === hpTuple.id
      && !sub.NotAvailable
      && sub.Condition === '>='
      && Number(sub.Value ?? 0) > hpBase
    ))
  ))
  assert(rowWithHpRoll, 'global minimums should force at least one non-locked stat to accumulate the remaining rolls')
})

test('aggregate normalization clears manual when locked exceeds manual', () => {
  const cfg = normalizeAggregateRollTargets(baseBuilderRecipe({
    minRequiredRolls: 2,
    autoMinRequiredRolls: false,
    lockedMinRequiredRolls: 4,
  }))
  assert.equal(cfg.minRequiredRolls, 0, 'manual requirement should clear when it does not exceed the locked value')
  assert.equal(cfg.lockedMinRequiredRolls, 4, 'locked requirement stays at the requested value')
})

test('aggregate normalization clears manual when totals match', () => {
  const cfg = normalizeAggregateRollTargets(baseBuilderRecipe({
    minRequiredRolls: 3,
    autoMinRequiredRolls: false,
    lockedMinRequiredRolls: 3,
  }))
  assert.equal(cfg.minRequiredRolls, 0)
  assert.equal(cfg.lockedMinRequiredRolls, 3, 'locked requirement remains at the requested value when manual clears')
})

test('duplicate detection treats lockedMinRequiredRolls as part of the identity', () => {
  const cfgA = baseBuilderRecipe({
    lockedMinRequiredRolls: 2,
    minRequiredRolls: 0,
    substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.HP],
    fixedSubstatsV: [StatVariant.SPD, StatVariant.CR],
  })
  const cfgB: BuilderRecipe = { ...cfgA, lockedMinRequiredRolls: 3 }
  const indices = computeDuplicateIndices([cfgA, cfgB])
  assert.deepEqual(indices, [null, null], 'recipes with differing locked minimums should not be treated as duplicates')
})

test('duplicate detection ignores cosmetic metadata fields (excluding config name)', () => {
  const cfg = baseBuilderRecipe({
    substatsV: [StatVariant.SPD, StatVariant.CR],
    fixedSubstatsV: [StatVariant.SPD],
  })
  const withMetadata = { ...cfg } as BuilderRecipe & Record<string, unknown>
  withMetadata.artifactTypeNames = ['Weapon']
  withMetadata.artifactSetNames = ['Speed']
  withMetadata.artifactMetaSetNames = ['set/1']
  const indices = computeDuplicateIndices([cfg, withMetadata])
  assert.deepEqual(indices, [null, 0], 'metadata-only changes should not produce duplicate warnings')
})

export {}
