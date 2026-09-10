/* eslint import/no-unused-modules: off */
// native-dll-parity-expected — emit the REFERENCE compact rows the native DLL must
// reproduce, computed by the app's own ingest path, for the TS↔Rust parity test.
//
// The DLL ports parseArtifactLogRow / buildEquippedByArtifactMap / accset→faction into
// Rust (wasm/sfc_engine/src/artifact_log.rs). This script drives the SAME two
// captured packets (committed under wasm/sfc_engine/tests/fixtures/) through the
// app's normalizeExternalEvent, applies the champions cID join, resolves faction the way
// the DLL does, then projects each row to the DLL-consumed field subset and writes a
// canonical-key-ordered expected.json. The Rust parity test asserts byte-equality against it.
//
// Usage (after tsc emit — see the sfc-engine:parity npm script):
//   node tmp/tsc/tests/tests/repro/native-dll-parity-expected.js \
//        <artifacts_packet.json> <champions_packet.json> <out expected.json>

import { readFileSync, writeFileSync } from 'node:fs'
// The app's public ingest entry point — reused so no ingest logic is duplicated here.
import { normalizeExternalEvent } from '../../src/lib/externalCommands'
import type { GearDbArtifactRow } from '../../src/lib/importers/gearDbNormalizer'
// The same generated accset→faction map the Rust DLL uses (SSOT), so the reference
// faction values match resolve_accessory_faction exactly.
import { ACCESSORY_FACTION_BY_CODE } from '../../src/lib/generated/domainConstants'

const [artifactsPath, championsPath, outPath] = process.argv.slice(2)
if (!artifactsPath || !championsPath || !outPath) {
  throw new Error('usage: native-dll-parity-expected <artifacts.json> <champions.json> <out.json>')
}

// Read a captured JSON-RPC frame and hand its params to normalizeExternalEvent.
const readFrame = (p: string): { method?: string; params?: unknown } =>
  JSON.parse(readFileSync(p, 'utf8')) as { method?: string; params?: unknown }

// Champions first — the equippedByArtifact map is needed to fill cID on the artifacts.
const champFrame = readFrame(championsPath)
const champCommand = normalizeExternalEvent(champFrame.method ?? 'champions', champFrame.params)
if (!champCommand || champCommand.kind !== 'gearDbChampions') {
  throw new Error(`expected gearDbChampions, got ${champCommand?.kind ?? 'null'}`)
}
// artifactId → championId (the same inversion the DLL's build_equipped_by_artifact_map does).
const equippedByArtifact = champCommand.equippedByArtifact

const artFrame = readFrame(artifactsPath)
const artCommand = normalizeExternalEvent(artFrame.method ?? 'artifacts', artFrame.params)
if (!artCommand || artCommand.kind !== 'gearDbArtifacts') {
  throw new Error(`expected gearDbArtifacts, got ${artCommand?.kind ?? 'null'}`)
}
const rows: GearDbArtifactRow[] = artCommand.artifacts

// Accessory slots (Ring 7 / Amulet 8 / Banner 9) carry a faction; others resolve to 0 —
// mirrors determineFaction's isAccessorySlot gate and the DLL's `slot > 6` gate.
const resolveFaction = (slot: number, accset: number): number =>
  slot > 6 ? (ACCESSORY_FACTION_BY_CODE[accset] ?? 0) : 0

// Project one compact row to the DLL-consumed subset, with cID joined and faction resolved.
// Field order is fixed so the emitted JSON is canonical and diffs cleanly against Rust.
const project = (r: GearDbArtifactRow) => {
  const id = r.ID ?? 0
  const slot = r.type ?? 0
  const accset = r.accset ?? 0
  // cID from the champions join (parseArtifactLogArray was called with null, so r.cID is 0).
  const cID = equippedByArtifact.get(id) ?? 0
  return {
    ID: id,
    type: slot,
    rank: r.rank ?? 0,
    rarity: r.rarity ?? 0,
    lvl: r.lvl ?? 0,
    aset: r.aset ?? 0,
    accset,
    mid: r.mid ?? 0,
    mfl: r.mfl ?? 0,
    s1id: r.s1id ?? 0, s1lvl: r.s1lvl ?? 0, s1fl: r.s1fl ?? 0,
    s2id: r.s2id ?? 0, s2lvl: r.s2lvl ?? 0, s2fl: r.s2fl ?? 0,
    s3id: r.s3id ?? 0, s3lvl: r.s3lvl ?? 0, s3fl: r.s3fl ?? 0,
    s4id: r.s4id ?? 0, s4lvl: r.s4lvl ?? 0, s4fl: r.s4fl ?? 0,
    cID,
    faction: resolveFaction(slot, accset),
    // Ore rework counter — feeds the if_reworked / if_not_reworked rule gate.
    REROLLCOUNT: r.REROLLCOUNT ?? 0,
  }
}

// Emit in input order; the Rust parser preserves input order too, so arrays line up.
const expected = rows.map(project)
writeFileSync(outPath, `${JSON.stringify(expected, null, 1)}\n`)
console.log(`[native-dll-parity] rows=${rows.length} wrote ${outPath}`)
