/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildHsfRules, defaultSubstatTargets, resolveAutoRarityCode, type BuilderConfig } from '../src/lib/hsfBuilder'
import { computeDuplicateIndices } from '../src/lib/configDuplicates'
import { RankCode, RarityCode, StatVariant } from '../src/lib/types'
import { normalizeAggregateRollTargets } from '../src/lib/configNormalization'
import { variantToSub } from '../src/lib/hsfTypes'

const baseBuilderConfig = (overrides: Partial<BuilderConfig> = {}): BuilderConfig => ({
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
  const cfg = baseBuilderConfig({
    lockedMinRequiredRolls: 3,
    minRequiredRolls: 0,
    substatRollBoundsV: {
      [StatVariant.SPD]: { max: 1 },
    },
  })
  const rules = buildHsfRules(cfg)
  assert.equal(rules.length, 0, 'aggregate locked minimum should prune infeasible configs')
})

test('lockedMinRequiredRolls raises Auto rarity even when global min is lower', () => {
  const baseCfg = baseBuilderConfig({
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

test('global minimums still apply to every selected stat when locks are active', () => {
  const cfg = baseBuilderConfig({
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
  const cfg = normalizeAggregateRollTargets(baseBuilderConfig({
    minRequiredRolls: 2,
    autoMinRequiredRolls: false,
    lockedMinRequiredRolls: 4,
  }))
  assert.equal(cfg.minRequiredRolls, 0, 'manual requirement should clear when it does not exceed the locked value')
  assert.equal(cfg.lockedMinRequiredRolls, 4, 'locked requirement stays at the requested value')
})

test('aggregate normalization clears manual when totals match', () => {
  const cfg = normalizeAggregateRollTargets(baseBuilderConfig({
    minRequiredRolls: 3,
    autoMinRequiredRolls: false,
    lockedMinRequiredRolls: 3,
  }))
  assert.equal(cfg.minRequiredRolls, 0)
  assert.equal(cfg.lockedMinRequiredRolls, 3, 'locked requirement remains at the requested value when manual clears')
})

test('duplicate detection treats lockedMinRequiredRolls as part of the identity', () => {
  const cfgA = baseBuilderConfig({
    lockedMinRequiredRolls: 2,
    minRequiredRolls: 0,
    substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.HP],
    fixedSubstatsV: [StatVariant.SPD, StatVariant.CR],
  })
  const cfgB: BuilderConfig = { ...cfgA, lockedMinRequiredRolls: 3 }
  const indices = computeDuplicateIndices([cfgA, cfgB])
  assert.deepEqual(indices, [null, null], 'configs with differing locked minimums should not be treated as duplicates')
})

test('duplicate detection ignores cosmetic metadata fields', () => {
  const cfg = baseBuilderConfig({
    substatsV: [StatVariant.SPD, StatVariant.CR],
    fixedSubstatsV: [StatVariant.SPD],
  })
  const withMetadata = { ...cfg } as BuilderConfig & Record<string, unknown>
  withMetadata.name = 'Speed tune'
  withMetadata.__cfgIdx_ignoredWhenRead = 7
  withMetadata.artifactTypeNames = ['Weapon']
  withMetadata.artifactSetNames = ['Speed']
  withMetadata.artifactMetaSetIds = ['set/1']
  const indices = computeDuplicateIndices([cfg, withMetadata])
  assert.deepEqual(indices, [null, 0], 'metadata-only changes should not produce duplicate warnings')
})

export {}
