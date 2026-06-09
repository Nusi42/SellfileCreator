/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import test from 'node:test'

import { normalizeExternalEvent } from '../../src/lib/externalCommands.js'

const baseArtifactLogRow = {
  id: 1001,
  revision: 42,
  sellPrice: 1000,
  price: 2000,
  level: 16,
  upgradeTimeTicks: null,
  ascendLevel: 1,
  rerollsCount: 2,
  ascendRerollsCount: null,
  kindId: 5,
  rankId: 6,
  rarityId: 5,
  setKindId: 19,
  requiredFraction: 0,
  failedUpgrades: 0,
  isActivated: true,
  isSeen: true,
  readOnly: false,
  primary: { id: 1, level: 0, isAbsolute: 1, statValue: 14946486190080, mValue: 0, glyphValue: 0 },
  ascend: { id: 2, level: 0, isAbsolute: 1, statValue: 55834574848, mValue: 0, glyphValue: 0 },
  secondary: [
    { id: 7, level: 1, isAbsolute: 0, statValue: 472446401, mValue: 0, glyphValue: 0 },
    { id: 6, level: 0, isAbsolute: 1, statValue: 42949672960, mValue: 0, glyphValue: 0 },
    { id: 3, level: 2, isAbsolute: 0, statValue: 644245092, mValue: 0, glyphValue: 85899345 },
    { id: 2, level: 1, isAbsolute: 1, statValue: 167503724544, mValue: 0, glyphValue: 0 },
  ],
}

// The endpoint now sends ArtifactLog-shaped rows (kindId/rankId/rarityId) wrapped
// under a matching key: { artifacts: ArtifactLog[] }.
test('artifacts event with ArtifactLog rows produces gearDbArtifacts command', () => {
  const command = normalizeExternalEvent('artifacts', { artifacts: [baseArtifactLogRow] })
  assert(command, 'expected command for artifacts event')
  assert.equal(command.kind, 'gearDbArtifacts')
  assert.equal(command.artifacts.length, 1)
  const row = command.artifacts[0]
  assert(row, 'expected normalized artifact row')
  assert.equal(row.ID, 1001)
  assert.equal(row.type, 5)   // kindId
  assert.equal(row.rank, 6)   // rankId
  assert.equal(row.rarity, 5) // rarityId
  assert.equal(row.REROLLCOUNT, 2)
  assert.equal(row.ASCLEVEL, 1)
})

test('inboxArtifacts event with ArtifactLog rows produces gearDbInboxArtifacts command', () => {
  const command = normalizeExternalEvent('inboxArtifacts', { inboxArtifacts: [baseArtifactLogRow] })
  assert(command, 'expected command for inboxArtifacts event')
  assert.equal(command.kind, 'gearDbInboxArtifacts')
  assert.equal(command.inboxArtifacts.length, 1)
  const row = command.inboxArtifacts[0]
  assert(row, 'expected normalized inbox artifact row')
  assert.equal(row.ID, 1001)
  assert.equal(row.type, 5)
})

// ─── null / undefined / root-array param handling (resolveEventCollection) ──────
// Regression for a captured session where RSL Helper sent { champions: null } etc. at
// startup. The old `record[key] ?? payload` idiom fell through to the whole payload
// object on null; these assert null/empty all normalize to empty commands, and that a
// bare root array still works.

test('artifacts event with null param yields empty command (not the payload object)', () => {
  const command = normalizeExternalEvent('artifacts', { artifacts: null })
  assert(command, 'expected command')
  assert.equal(command.kind, 'gearDbArtifacts')
  if (command.kind !== 'gearDbArtifacts') return
  assert.equal(command.artifacts.length, 0, 'null param must produce zero rows')
})

test('champions event with null param yields empty command', () => {
  const command = normalizeExternalEvent('champions', { champions: null })
  assert(command, 'expected command')
  assert.equal(command.kind, 'gearDbChampions')
  if (command.kind !== 'gearDbChampions') return
  assert.equal(command.champions.length, 0, 'null champions must produce zero rows')
  assert.equal(command.equippedByArtifact.size, 0, 'null champions must produce empty equip map')
})

test('lastUsed event with null param yields empty command', () => {
  const command = normalizeExternalEvent('lastUsed', { lastUsed: null })
  assert(command, 'expected command')
  assert.equal(command.kind, 'gearDbLastUsed')
  if (command.kind !== 'gearDbLastUsed') return
  assert.equal(command.lastUsed.length, 0, 'null lastUsed must produce zero rows')
})

test('inboxArtifacts event with missing key falls back to root array', () => {
  // No named key present at all — a bare array at the payload root is still accepted.
  const command = normalizeExternalEvent('inboxArtifacts', [baseArtifactLogRow])
  assert(command, 'expected command')
  assert.equal(command.kind, 'gearDbInboxArtifacts')
  if (command.kind !== 'gearDbInboxArtifacts') return
  assert.equal(command.inboxArtifacts.length, 1, 'root array fallback should parse the row')
})

test('artifacts event with empty array yields empty command', () => {
  const command = normalizeExternalEvent('artifacts', { artifacts: [] })
  assert(command, 'expected command')
  assert.equal(command.kind, 'gearDbArtifacts')
  if (command.kind !== 'gearDbArtifacts') return
  assert.equal(command.artifacts.length, 0)
})

export {}
