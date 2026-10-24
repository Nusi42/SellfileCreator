/* eslint import/no-unused-modules: off */
// Champion anonymization for committed fixtures (scripts/test/roster-anonymizer.mjs).
// Synthetic champions only — no real roster belongs in a test.
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  anonymizeCaptureText,
  anonymizeGearDbChampions,
  anonymizeWsChampion,
  fakeChampion,
} from '../../scripts/test/roster-anonymizer.mjs'

// A rich WebSocket champion, shaped like RSL Helper's `champions` frame entries.
const richChampion = {
  id: 4711, typeId: 2066, grade: 6, level: 60, empower: 4, locked: true, inStorage: true,
  inBathhouse: false, marker: 3, artifacts: { 1: 101, 2: 102, 9: 109 }, exp: 0, fullExp: 3624238,
  recentBattleTicks: 638883325691260000, recentLiveArenaBattleTicks: 638883325691260000,
  power: null, claimDateTicks: null, knownRevision: 7,
  skills: [{ i: 0, t: 20601, l: 6 }, { i: 1, t: 20604, l: 5 }],
  mastery: { p: { 1: 0 }, s: { 1: 100 }, m: [500312, 500321, 500332], c: 0 },
  doubleAscend: { grade: 6, blessingId: 4302, freeResetUsed: false },
  Rarity: 5, Name: 'Real Champion', Affinity: 4,
}

test('fake identity depends on the instance id only and is stable', () => {
  const { rand: _a, ...first } = fakeChampion(4711)
  const { rand: _b, ...again } = fakeChampion(4711)
  assert.deepEqual(first, again)
  assert.notEqual(fakeChampion(4712).name, undefined)
  // Type ids keep the game's encoding: base is a multiple of 10, ascension in the last digit.
  assert.equal(first.baseId % 10, 0)
  assert.ok(first.heroId - first.baseId >= 0 && first.heroId - first.baseId <= 6)
  assert.ok(first.level <= first.grade * 10)
})

test('a WebSocket champion keeps id, location and gear links but loses its identity', () => {
  const out = anonymizeWsChampion(richChampion)
  // What keep/sell decisions read stays exactly as captured.
  for (const key of ['id', 'inStorage', 'inBathhouse', 'artifacts', 'locked', 'marker', 'knownRevision'] as const) {
    assert.deepEqual(out[key], richChampion[key], `${key} must be kept`)
  }
  // Everything that says which champion this is, or how it is built, is replaced.
  assert.notEqual(out.typeId, richChampion.typeId)
  assert.notEqual(out.Name, richChampion.Name)
  assert.match(out.Name, /^Champion \d{4}$/)
  assert.equal(out.recentLiveArenaBattleTicks, null)
  assert.ok(out.skills.every((s, i) => Math.floor(s.t / 100) === Math.floor(out.typeId / 10) && s.i === i))
  assert.equal(out.mastery.m.length, richChampion.mastery.m.length)
  assert.deepEqual(out.mastery.s, richChampion.mastery.s)
  // Running it again gives the same result.
  assert.deepEqual(anonymizeWsChampion(out), out)
})

test('a sparse champion stays sparse', () => {
  const sparse = { id: 4711, typeId: 2066, grade: 6, level: 60, inStorage: false, artifacts: {} }
  const out = anonymizeWsChampion(sparse)
  assert.deepEqual(Object.keys(out), Object.keys(sparse))
  assert.equal(out.typeId, anonymizeWsChampion(richChampion).typeId, 'same instance, same fake type')
})

test('capture files: champions frames keep their layout, other frames stay byte for byte', () => {
  const frame = { jsonrpc: '2.0', method: 'champions', params: { champions: [richChampion] } }
  const pretty = JSON.stringify(frame, null, 2)
  const out = anonymizeCaptureText('packet_01_champions.json', pretty)
  assert.equal(out, JSON.stringify(JSON.parse(out), null, 2), 'indentation kept')
  assert.ok(!out.includes('Real Champion'))
  assert.equal(anonymizeCaptureText('packet_01_champions.json', out), out, 'idempotent')
  const minified = JSON.stringify(frame)
  assert.ok(!anonymizeCaptureText('packet_01_champions.json', minified).includes('\n'), 'minified stays minified')
  const artifacts = JSON.stringify({ jsonrpc: '2.0', method: 'artifacts', params: { artifacts: [{ id: 1 }] } }, null, 2)
  assert.equal(anonymizeCaptureText('packet_02_artifacts.json', artifacts), artifacts)
  assert.equal(
    anonymizeCaptureText('console.log', '[champion-static] no data for baseHeroId=10660 (heroId=10663)\n'),
    '[champion-static] no data for baseHeroId=0 (heroId=0)\n',
  )
})

test('gear DB: Champs rows keep id, vault flags and gear columns but lose their identity', () => {
  const dir = mkdtempSync(join(tmpdir(), 'roster-anon-'))
  const dbPath = join(dir, 'gear.db')
  try {
    const db = new DatabaseSync(dbPath)
    db.exec(`CREATE TABLE Champs (ID INTEGER PRIMARY KEY, HeroID INTEGER, Name TEXT, Rang INTEGER, Lvl INTEGER,
      Rarity INTEGER, SPD INTEGER, Vault INTEGER, RVault INTEGER, Weapon INTEGER, BaseHeroID INTEGER,
      RecentBattleTicks BIGINT)`)
    db.exec("INSERT INTO Champs VALUES (4711, 2066, 'Real Champion', 6, 60, 5, 140, 1, 0, 101, 2060, 638883325691260000)")
    db.close()

    assert.equal(anonymizeGearDbChampions(dbPath), 1)
    // Battle ticks exceed the safe integer range, so read every integer as a BigInt.
    const read = () => {
      const check = new DatabaseSync(dbPath, { readBigInts: true })
      try { return check.prepare('SELECT * FROM Champs').get() as Record<string, unknown> } finally { check.close() }
    }
    const row = read()
    assert.deepEqual([row.ID, row.Vault, row.RVault, row.Weapon], [4711n, 1n, 0n, 101n])
    const fake = fakeChampion(4711)
    assert.deepEqual(
      [row.HeroID, row.BaseHeroID, row.Name, row.SPD],
      [BigInt(fake.heroId), BigInt(fake.baseId), fake.name, BigInt(fake.stats.SPD)],
    )
    // A second pass changes nothing.
    anonymizeGearDbChampions(dbPath)
    assert.deepEqual(read(), row)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
