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

test('artifactLog arrays normalize into gearDbRawSnapshot commands', () => {
  const command = normalizeExternalEvent('artifactLog', [baseArtifactLogRow])
  assert(command, 'expected command for artifactLog array')
  assert.equal(command.kind, 'gearDbRawSnapshot')
  assert.equal(command.artifacts.length, 1)
  assert.equal(command.inboxArtifacts.length, 0)
  const row = command.artifacts[0]
  assert(row, 'expected normalized artifact row')
  // Verify key field mapping from ArtifactLog -> SQL-like row format.
  assert.equal(row.ID, 1001)
  assert.equal(row.type, 5)
  assert.equal(row.rank, 6)
  assert.equal(row.rarity, 5)
  assert.equal(row.mid, 1)
  assert.equal(row.mlvlid, 14946486190080)
  assert.equal(row.s1id, 7)
  assert.equal(row.s4id, 2)
  assert.equal(row.cID, 0)
  assert.equal(row.ASCID, 2)
  assert.equal(row.REROLLCOUNT, 2)
})

test('artifactLog snapshot payload applies ArtifactByHeroID mapping to cID', () => {
  const payload = {
    artifactLog: [baseArtifactLogRow],
    artifactByHeroIDLog: {
      24120: {
        5: 1001,
      },
    },
  }
  const command = normalizeExternalEvent('artifactLogSnapshot', payload)
  assert(command, 'expected command for artifactLog snapshot')
  assert.equal(command.kind, 'gearDbRawSnapshot')
  assert.equal(command.artifacts.length, 1)
  const row = command.artifacts[0]
  assert(row, 'expected normalized artifact row')
  // Equipped artifact should inherit champion id from the hero map.
  assert.equal(row.cID, 24120)
})

test('artifactLog snapshot accepts hero-map strings with trailing NUL bytes', () => {
  const payload = {
    artifactLog: [baseArtifactLogRow],
    artifactByHeroIDLog: '{"24120":{"5":1001}}\u0000\u0000\u0000',
  }
  const command = normalizeExternalEvent('artifactLogSnapshot', payload)
  assert(command, 'expected command when hero map is JSON string')
  assert.equal(command.kind, 'gearDbRawSnapshot')
  const row = command.artifacts[0]
  assert(row, 'expected normalized artifact row')
  assert.equal(row.cID, 24120)
})

test('inboxArtifactLog events map rows to inboxArtifacts in snapshots', () => {
  const command = normalizeExternalEvent('inboxArtifactLog', [baseArtifactLogRow])
  assert(command, 'expected command for inboxArtifactLog')
  assert.equal(command.kind, 'gearDbRawSnapshot')
  assert.equal(command.artifacts.length, 0)
  assert.equal(command.inboxArtifacts.length, 1)
  const row = command.inboxArtifacts[0]
  assert(row, 'expected normalized inbox row')
  assert.equal(row.ID, 1001)
})

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

export {}
