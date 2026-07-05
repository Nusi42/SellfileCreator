/* eslint import/no-unused-modules: off */
// native-dll-realdata-input — build a NativeInput JSON for rule_engine_native (the RSL
// Helper DLL) from REAL captured endpoint data, reusing the app's own ingest normaliser.
//
// Why this exists: the DLL's `NativeArtifactIn` consumes the app's *compact*
// GearDbArtifactRow shape (type/rank/s1id…), NOT the raw RSL-Helper wire shape
// (kindId/rankId/primary/secondary) that the JSON endpoint actually sends.  We must
// run the raw packet through the same normaliser the live app uses so the DLL sees
// exactly what it would see in production — no logic duplicated here.
//
// Pipeline: raw `artifacts` JSON-RPC packet → normalizeExternalEvent('artifacts', …)
//   → GearDbArtifactRow[] (compact) → map to NativeArtifactIn[] → { sfc, artifacts }.
//
// Usage (after tsc emit, see package.json script native-dll:realdata-input):
//   node tmp/tsc/tests/tests/repro/native-dll-realdata-input.js \
//        <rawArtifactsPacket.json> <preset.sfc> <out.NativeInput.json>

import { readFileSync, writeFileSync } from 'node:fs'
// The single public ingest entry point — its 'artifacts' branch delegates to the
// same parseArtifactLogArray the live websocket handler uses.
import { normalizeExternalEvent } from '../../src/lib/externalCommands'
import type { GearDbArtifactRow } from '../../src/lib/importers/gearDbNormalizer'

// CLI args: raw packet, sfc preset, output path.
const [rawPacketPath, sfcPath, outPath] = process.argv.slice(2)
if (!rawPacketPath || !sfcPath || !outPath) {
  // Fail loudly rather than silently producing an empty input.
  throw new Error('usage: native-dll-realdata-input <rawPacket.json> <preset.sfc> <out.json>')
}

// The captured packet is a full JSON-RPC frame: { jsonrpc, method:'artifacts', params:{ artifacts:[…] } }.
const frame = JSON.parse(readFileSync(rawPacketPath, 'utf8')) as { method?: string; params?: unknown }
// normalizeExternalEvent keys off the method name; pass its params through verbatim.
const command = normalizeExternalEvent(frame.method ?? 'artifacts', frame.params)
// The 'artifacts' branch yields a gearDbArtifacts command carrying the compact rows.
if (!command || command.kind !== 'gearDbArtifacts') {
  throw new Error(`expected gearDbArtifacts command, got ${command?.kind ?? 'null'} for method ${frame.method}`)
}
const rows: GearDbArtifactRow[] = command.artifacts

// Map one compact row to the DLL's NativeArtifactIn.  The DLL reads exactly these keys
// (ID/type/rank/rarity/lvl/aset/accset/mid/mfl/s{n}id/s{n}lvl/s{n}fl/cID/faction); any
// other GearDbArtifactRow field is ignored by the Rust serde deserialiser.
// NOTE ON FACTION: the DLL expects a *pre-resolved* faction id but the compact row only
// carries `accset` (the raw requiredFraction code).  We forward accset as-is under a
// separate `faction` key so the test surfaces whether the DLL's faction handling copes;
// resolving accset→faction (ACCESSORY_FACTION_MAP) is a stage-2 concern the DLL skips.
type NativeArtifactIn = Record<string, number | null | undefined>
const toNative = (r: GearDbArtifactRow): NativeArtifactIn => ({
  ID: r.ID ?? null,
  type: r.type ?? 0,
  rank: r.rank ?? 0,
  rarity: r.rarity ?? 0,
  lvl: r.lvl ?? 0,
  aset: r.aset ?? 0,
  accset: r.accset ?? 0,
  mid: r.mid ?? 0,
  mfl: r.mfl ?? 0,
  s1id: r.s1id ?? 0, s1lvl: r.s1lvl ?? 0, s1fl: r.s1fl ?? 0,
  s2id: r.s2id ?? 0, s2lvl: r.s2lvl ?? 0, s2fl: r.s2fl ?? 0,
  s3id: r.s3id ?? 0, s3lvl: r.s3lvl ?? 0, s3fl: r.s3fl ?? 0,
  s4id: r.s4id ?? 0, s4lvl: r.s4lvl ?? 0, s4fl: r.s4fl ?? 0,
  cID: r.cID ?? 0,
  // accset is the raw faction code; the DLL treats faction as pre-resolved (see note above).
  faction: r.accset ?? 0,
})

const artifacts = rows.map(toNative)
// The .sfc file is passed to the DLL verbatim as a JSON string value; parse_sfc handles it.
const sfc = readFileSync(sfcPath, 'utf8')
const nativeInput = { sfc, artifacts }
writeFileSync(outPath, JSON.stringify(nativeInput))

// Diagnostics as formatted primitives (per project logging convention).
console.log(`[native-dll-input] rows=${rows.length} nativeArtifacts=${artifacts.length}`)
console.log(`[native-dll-input] wrote ${outPath} (${(JSON.stringify(nativeInput).length / 1e6).toFixed(1)} MB)`)
