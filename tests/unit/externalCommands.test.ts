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

// RSL Helper can deliver the inbox as mail items: each entry wraps its ArtifactLog
// row(s) under an `artifacts` array inside an inbox-item envelope (inboxItemId/typeId/
// …). The envelope itself has no kindId/rankId/rarityId, so it must be unwrapped or the
// gear is silently dropped (the cause of pre/post-shard HSF divergence).
test('inboxArtifacts event unwraps nested inbox-item envelopes', () => {
  const envelope = {
    inboxItemId: 166312,
    typeId: 7,
    isRead: true,
    givenTimeTicks: 639174939276110000,
    validTillTicks: 639261339276110000,
    parentInboxId: null,
    questPrototypeId: null,
    artifacts: [baseArtifactLogRow],
  }
  const command = normalizeExternalEvent('inboxArtifacts', { inboxArtifacts: [envelope] })
  assert(command, 'expected command for nested inboxArtifacts event')
  assert.equal(command.kind, 'gearDbInboxArtifacts')
  if (command.kind !== 'gearDbInboxArtifacts') return
  assert.equal(command.inboxArtifacts.length, 1, 'nested envelope should yield its inner row')
  const row = command.inboxArtifacts[0]
  assert(row, 'expected normalized inbox artifact row from envelope')
  assert.equal(row.ID, 1001)
  assert.equal(row.type, 5)
})

// A single envelope may legitimately carry several artifacts; all must be flattened.
test('inboxArtifacts event flattens multiple rows per envelope and mixed shapes', () => {
  const second = { ...baseArtifactLogRow, id: 1002 }
  const envelope = { inboxItemId: 1, typeId: 7, artifacts: [baseArtifactLogRow, second] }
  // Mix a nested envelope with a flat row to confirm both shapes parse in one array.
  const flat = { ...baseArtifactLogRow, id: 1003 }
  const command = normalizeExternalEvent('inboxArtifacts', { inboxArtifacts: [envelope, flat] })
  assert(command && command.kind === 'gearDbInboxArtifacts', 'expected inbox command')
  if (!command || command.kind !== 'gearDbInboxArtifacts') return
  assert.equal(command.inboxArtifacts.length, 3, 'two nested + one flat row = three')
  assert.deepEqual(command.inboxArtifacts.map((r) => r.ID).sort((a, b) => a - b), [1001, 1002, 1003])
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

// ─── ArtifactByHeroID (equip-only feed) ────────────────────────────────────────
// RSL Helper pushes this on every gear move; `champions` is only re-sent when a
// champion itself changes, so this is the sole feed that keeps cID fresh mid-session.
// Shape is { championId: { slot: artifactId } } — keyed by champion INSTANCE id
// (verified against captures: every key matches a champions[].id, never a typeId).

test('ArtifactByHeroID event inverts the hero-keyed slot map into equippedByArtifact', () => {
  const command = normalizeExternalEvent('ArtifactByHeroID', {
    ArtifactByHeroID: {
      // Two champions, each with a partial slot map; empty slots are simply absent.
      '501': { '1': 9001, '2': 9002 },
      '502': { '6': 9003 },
    },
  })
  assert(command, 'expected command')
  assert.equal(command.kind, 'gearDbEquipped')
  if (command.kind !== 'gearDbEquipped') return
  // Inversion is artifactId → championId, matching the champions-derived map.
  assert.equal(command.equippedByArtifact.size, 3)
  assert.equal(command.equippedByArtifact.get(9001), 501)
  assert.equal(command.equippedByArtifact.get(9002), 501)
  assert.equal(command.equippedByArtifact.get(9003), 502)
})

test('ArtifactByHeroID agrees with the champions slot map for the same equips', () => {
  // Both feeds carry the identical inner structure, so the two inverse maps must match.
  const viaHero = normalizeExternalEvent('ArtifactByHeroID', {
    ArtifactByHeroID: { '77': { '1': 4242, '3': 4243 } },
  })
  const viaChampions = normalizeExternalEvent('champions', {
    champions: [{ id: 77, typeId: 770, artifacts: { '1': 4242, '3': 4243 } }],
  })
  assert(viaHero && viaChampions, 'expected both commands')
  if (viaHero.kind !== 'gearDbEquipped' || viaChampions.kind !== 'gearDbChampions') return
  assert.deepEqual(
    [...viaHero.equippedByArtifact.entries()].sort(),
    [...viaChampions.equippedByArtifact.entries()].sort(),
  )
})

test('ArtifactByHeroID skips empty/zero slots and unusable champion ids', () => {
  const command = normalizeExternalEvent('ArtifactByHeroID', {
    ArtifactByHeroID: {
      '601': { '1': 0, '2': null, '3': 8001 },  // zero/null slots are empty
      'not-a-number': { '1': 8002 },            // unusable champion key
      '0': { '1': 8003 },                       // zero champion id
    },
  })
  assert(command, 'expected command')
  if (command.kind !== 'gearDbEquipped') return
  assert.equal(command.equippedByArtifact.size, 1, 'only the one real equip survives')
  assert.equal(command.equippedByArtifact.get(8001), 601)
})

test('ArtifactByHeroID event with null param yields empty equip map', () => {
  const command = normalizeExternalEvent('ArtifactByHeroID', { ArtifactByHeroID: null })
  assert(command, 'expected command')
  assert.equal(command.kind, 'gearDbEquipped')
  if (command.kind !== 'gearDbEquipped') return
  assert.equal(command.equippedByArtifact.size, 0, 'null param must produce empty map')
})

export {}
