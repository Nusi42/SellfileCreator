/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import { StatId } from '../../src/lib/types.js'
import type { HsfRule } from '../../src/lib/hsfTypes.js'
import type { GeneratedBranchRuleEntry } from '../../src/lib/merge.js'
import {
  finalizeGeneratedRulesWithLoadedWasm,
  warmupWasmRuleEngine,
} from '../../src/lib/wasm/wasmRuleEngine.js'

// Keep a compact Any template so test rows still match the 4-substat HSF shape.
const anySub = (): HsfRule['Substats'][number] => ({
  ID: StatId.Any,
  Value: 0,
  IsFlat: true,
  NotAvailable: false,
  Condition: '',
})

// Build one deterministic base rule so only rarity + substat slot order vary.
const baseRule = (rarity: number, substats: HsfRule['Substats']): HsfRule => ({
  Keep: true,
  IsRuleTypeAND: false,
  Use: true,
  Rank: 0,
  Rarity: rarity,
  MainStatID: StatId.Any,
  MainStatF: 1,
  LVLForCheck: 16,
  Faction: 0,
  Substats: substats,
})

test('WASM finalizer keeps slot-order-distinct epic/legendary rows', async () => {
  // Sync wasm helper requires warmup once before use in test context.
  await warmupWasmRuleEngine()

  // Two rows differ only by substat slot order.
  // JS canonical collapse key keeps slot order, so these must not collapse.
  // Row A keeps SPD in slot 0 and ACC in slot 1.
  const spdFirst: HsfRule['Substats'] = [
    { ID: StatId.SPD, Value: 6, IsFlat: true, NotAvailable: false, Condition: '>=' },
    { ID: StatId.ACC, Value: 18, IsFlat: true, NotAvailable: false, Condition: '>=' },
    anySub(),
    anySub(),
  ]
  // Row B swaps slot positions while keeping identical stat/value tuples.
  const accFirst: HsfRule['Substats'] = [
    { ID: StatId.ACC, Value: 18, IsFlat: true, NotAvailable: false, Condition: '>=' },
    { ID: StatId.SPD, Value: 6, IsFlat: true, NotAvailable: false, Condition: '>=' },
    anySub(),
    anySub(),
  ]

  // Use rarity pair (Epic + Legendary) that would collapse only when canonical key matches.
  // The finalizer receives generation metadata exactly like merge.ts does.
  const entries: GeneratedBranchRuleEntry[] = [
    {
      rule: baseRule(4, spdFirst),
      branchOrder: 0,
      branchSeq: 0,
      originalIdx: 0,
    },
    {
      rule: baseRule(16, accFirst),
      branchOrder: 0,
      branchSeq: 1,
      originalIdx: 1,
    },
  ]

  // Run the wasm finalizer directly to assert post-generation behavior.
  const finalized = finalizeGeneratedRulesWithLoadedWasm({
    entries,
    applyObsoletePruning: false,
  })
  // Guard ensures we fail loudly if warmup/binding wiring regresses.
  assert(finalized, 'expected wasm finalizer output')

  // Parity target: both rows remain, and rarity codes are untouched (no 9 collapse row).
  // Length check catches accidental duplicate-collapse on slot-reordered rows.
  assert.equal(finalized.length, 2, 'slot-order-distinct rows must not collapse')
  // Rarity check catches accidental Epic+Legendary merge into synthetic rarity=9.
  assert.deepEqual(finalized.map((rule) => rule.Rarity), [4, 16])
})
