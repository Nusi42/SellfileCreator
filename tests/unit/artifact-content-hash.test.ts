/* eslint import/no-unused-modules: off */

// Guards computeArtifactSetContentHash — the artifact-dataset fingerprint behind the pipeline
// result cache key. Correctness rests on two opposite properties:
//   1. Every field that crosses to WASM and affects matching/merge/detection MUST change the
//      hash (else a real gear change → stale cache hit → wrong matches/export).
//   2. Display-only / non-projected fields MUST NOT change the hash (else the add-then-remove
//      farming round-trip never returns to a prior key and the cache never helps). The big one
//      is lastUseLocalTimestamp, which bumps every game round.
// The field list must stay in lockstep with toWasmArtifactStoreInput / toWasmTestItem.

import test from 'node:test'
import assert from 'node:assert/strict'

import { computeArtifactSetContentHash } from '../../src/lib/safeguards.js'
import type { NormalizedGearArtifact } from '../../src/lib/importers/gearDbNormalizer.js'
import type { NormalizedStat } from '../../src/lib/importers/gearDbNormalizer.js'

const stat = (over: Partial<NormalizedStat> = {}): NormalizedStat => ({
  source: 'roll' as NormalizedStat['source'],
  statId: 1 as NormalizedStat['statId'],
  isFlat: false,
  variant: 2 as NormalizedStat['variant'],
  baseValue: 10,
  glyphValue: 0,
  mythValue: 0,
  totalValue: 10,
  rolls: 1,
  ...over,
})

// Minimal artifact — structural-but-unhashed fields (gearInspectorItem, full champion record)
// are cast since the hash never reads them.
const art = (over: Partial<NormalizedGearArtifact> = {}): NormalizedGearArtifact => ({
  id: 100,
  slot: 1 as NormalizedGearArtifact['slot'],
  set: 5 as NormalizedGearArtifact['set'],
  rank: 6 as NormalizedGearArtifact['rank'],
  rarity: 4 as NormalizedGearArtifact['rarity'],
  level: 16 as NormalizedGearArtifact['level'],
  exactLevel: 16,
  faction: 0 as NormalizedGearArtifact['faction'],
  mainStat: stat({ variant: 3 as NormalizedStat['variant'] }),
  substats: [stat({ variant: 4 as NormalizedStat['variant'] }), stat({ variant: 5 as NormalizedStat['variant'] })],
  ascension: null,
  gearInspectorItem: {} as NormalizedGearArtifact['gearInspectorItem'],
  rerollCount: 0,
  equippedChampion: null,
  source: 'artifacts',
  lastUseLocalTimestamp: null,
  isLocked: false,
  ...over,
})

const h = (artifacts: NormalizedGearArtifact[]) => computeArtifactSetContentHash(artifacts)

test('identical datasets → identical hash', () => {
  assert.equal(h([art(), art({ id: 200 })]), h([art(), art({ id: 200 })]))
})

test('output-affecting fields each change the hash', () => {
  const base = h([art()])
  const variants: Array<Partial<NormalizedGearArtifact>> = [
    { id: 999 },
    { slot: 2 as NormalizedGearArtifact['slot'] },
    { set: 6 as NormalizedGearArtifact['set'] },
    { rank: 5 as NormalizedGearArtifact['rank'] },
    { rarity: 5 as NormalizedGearArtifact['rarity'] },
    { level: 12 as NormalizedGearArtifact['level'] },
    { exactLevel: 15 },
    { faction: 1 as NormalizedGearArtifact['faction'] },
    { mainStat: stat({ variant: 9 as NormalizedStat['variant'] }) },
    { mainStat: null },
    { substats: [stat({ variant: 4 as NormalizedStat['variant'] })] }, // count change
    { substats: [stat({ variant: 7 as NormalizedStat['variant'] }), stat({ variant: 5 as NormalizedStat['variant'] })] }, // variant change
    { substats: [stat({ variant: 4 as NormalizedStat['variant'], totalValue: 99 }), stat({ variant: 5 as NormalizedStat['variant'] })] }, // value change
    { substats: [stat({ variant: 4 as NormalizedStat['variant'], isFlat: true }), stat({ variant: 5 as NormalizedStat['variant'] })] }, // isFlat
    { substats: [stat({ variant: 4 as NormalizedStat['variant'], rolls: 3 }), stat({ variant: 5 as NormalizedStat['variant'] })] }, // rolls
    { equippedChampion: { location: 'vault' } as NormalizedGearArtifact['equippedChampion'] }, // location
  ]
  for (const v of variants) {
    assert.notEqual(h([art(v)]), base, `field ${Object.keys(v)[0]} must change the hash`)
  }
})

test('display-only / non-projected fields do NOT change the hash (round-trip stays cacheable)', () => {
  const base = h([art()])
  const noopVariants: Array<Partial<NormalizedGearArtifact>> = [
    { lastUseLocalTimestamp: '2026-06-14 12:00:00.000' }, // changes every game round
    { rerollCount: 5 },
    { ascension: stat() },
    { source: 'inbox' },
    { isLocked: true },
  ]
  for (const v of noopVariants) {
    assert.equal(h([art(v)]), base, `field ${Object.keys(v)[0]} must NOT change the hash`)
  }
})

test('order and length are significant (pipeline consumes in array order)', () => {
  assert.notEqual(h([art({ id: 1 }), art({ id: 2 })]), h([art({ id: 2 }), art({ id: 1 })]))
  assert.notEqual(h([art()]), h([art(), art({ id: 2 })]))
  assert.notEqual(h([]), h([art()]))
})

test('add-then-remove round-trip returns to the baseline hash', () => {
  const baseline = h([art({ id: 1 }), art({ id: 2 })])
  const added = h([art({ id: 1 }), art({ id: 2 }), art({ id: 3 })])
  assert.notEqual(added, baseline)
  // Remove id:3 AND let lastUsed drift on the survivors — still returns to baseline because
  // lastUsed is excluded from the hash.
  const removed = h([art({ id: 1, lastUseLocalTimestamp: 'later' }), art({ id: 2, lastUseLocalTimestamp: 'later' })])
  assert.equal(removed, baseline)
})
