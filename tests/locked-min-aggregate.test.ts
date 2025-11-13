/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildHsfRules, resolveAutoRarityCode, type BuilderConfig } from '../src/lib/hsfBuilder'
import { RankCode, RarityCode, StatVariant } from '../src/lib/types'
import { normalizeAggregateRollTargets } from '../src/lib/configNormalization'

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

export {}
