import { test } from 'node:test'
import assert from 'node:assert/strict'

// PROVISIONAL(anomalous): the sellfile export boundary must never emit anomalous
// substat ids — no sample .hsf demonstrates how RSL Helper rules encode them, and
// we never guess at schema. Inside buildHsfFileFromMerged: a rule REQUIRING one
// cannot be expressed → the whole rule is dropped (disclosed via console warning);
// a negated ("¬") line only drops that line, re-padded with a neutral Any entry.
import { buildHsfFileFromMerged } from '../../src/lib/hsfIO.js'
import { ANOMALOUS_SUBSTAT_IDS } from '../../src/lib/anomalousAccessories.js'
import { STAT_ID_ANY, STAT_ID_SPD } from '../../src/lib/generated/domainConstants.js'
import type { HsfSubstat } from '../../src/lib/hsfTypes.js'

// Minimal HSF substat line factory (shape mirrors the WASM builder's output).
const sub = (id: number, condition = ''): HsfSubstat => (
  { ID: id, Value: 0, IsFlat: false, Condition: condition, NotAvailable: false }
)

// buildHsfFileFromMerged accepts merged rules; plain HsfRule shapes are sufficient here.
type MergedRuleLike = Parameters<typeof buildHsfFileFromMerged>[0][number]
const rule = (substats: HsfSubstat[]): MergedRuleLike => (
  { Keep: true, Substats: substats } as unknown as MergedRuleLike
)

const anomalousId = ANOMALOUS_SUBSTAT_IDS[0]!

test('a rule requiring an anomalous substat is dropped from the export entirely', () => {
  const exported = buildHsfFileFromMerged([
    rule([sub(STAT_ID_SPD), sub(anomalousId)]),
    rule([sub(STAT_ID_SPD)]),
  ])
  // Only the clean rule survives; the unsatisfiable one exports as nothing.
  assert.equal(exported.Rules.length, 1)
  assert.ok(exported.Rules[0]!.Substats!.every((entry) => entry.ID === STAT_ID_SPD))
})

test('a negated anomalous line is dropped and re-padded, keeping the rule', () => {
  const exported = buildHsfFileFromMerged([
    rule([sub(STAT_ID_SPD), sub(anomalousId, '¬'), sub(STAT_ID_ANY), sub(STAT_ID_ANY)]),
  ])
  assert.equal(exported.Rules.length, 1)
  const substats = exported.Rules[0]!.Substats!
  // Same four-substat shape, no anomalous id anywhere, pad entry restored.
  assert.equal(substats.length, 4)
  assert.ok(substats.every((entry) => entry.ID !== anomalousId))
  assert.equal(substats.filter((entry) => entry.ID === STAT_ID_ANY).length, 3)
})

test('rules without anomalous lines pass through the scrub untouched', () => {
  const exported = buildHsfFileFromMerged([
    rule([sub(STAT_ID_SPD, '>='), sub(STAT_ID_ANY)]),
  ])
  assert.equal(exported.Rules.length, 1)
  const substats = exported.Rules[0]!.Substats!
  // Original lines survive verbatim (order and conditions included).
  assert.deepEqual(substats.map((entry) => [entry.ID, entry.Condition]), [
    [STAT_ID_SPD, '>='],
    [STAT_ID_ANY, ''],
  ])
})
