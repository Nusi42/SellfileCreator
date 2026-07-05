/* eslint import/no-unused-modules: off */
// native-dll-realdata-input — build a NativeInput JSON for rule_engine_native (the RSL
// Helper DLL) from REAL captured endpoint data.
//
// The DLL now accepts the RAW RSL-Helper wire format directly (kindId/rankId/primary/
// secondary + a champions slot-map), so this harness simply lifts the arrays out of the
// captured JSON-RPC frames and pairs them with a .sfc preset — no normalization needed
// (the DLL does it internally; see wasm/rule_engine_native/src/artifact_log.rs).
//
// Usage (after tsc emit — see the native-dll:realdata-input npm script):
//   node tmp/tsc/tests/tests/repro/native-dll-realdata-input.js \
//        <rawArtifactsPacket.json> <preset.sfc> <out.NativeInput.json> [<championsPacket.json>]

import { readFileSync, writeFileSync } from 'node:fs'

// CLI args: raw artifacts packet, sfc preset, output path, optional champions packet.
const [artifactsPath, sfcPath, outPath, championsPath] = process.argv.slice(2)
if (!artifactsPath || !sfcPath || !outPath) {
  throw new Error('usage: native-dll-realdata-input <artifacts.json> <preset.sfc> <out.json> [champions.json]')
}

// A captured packet is a full JSON-RPC frame: { jsonrpc, method, params: { <key>: [...] } }.
// Lift the named collection out of params; tolerate a bare array at the params root.
const collection = (path: string, key: string): unknown[] => {
  const frame = JSON.parse(readFileSync(path, 'utf8')) as { params?: unknown }
  const params = frame.params
  if (Array.isArray(params)) return params
  const named = (params as Record<string, unknown> | undefined)?.[key]
  return Array.isArray(named) ? named : []
}

// Raw ArtifactLog rows exactly as the endpoint sent them — the DLL parses them itself.
const artifacts = collection(artifactsPath, 'artifacts')
// Optional champions packet for the cID (equipped_in_collection) join.
const champions = championsPath ? collection(championsPath, 'champions') : []
// The .sfc file is passed to the DLL verbatim as a JSON string value; parse_sfc handles it.
const sfc = readFileSync(sfcPath, 'utf8')

const nativeInput = { sfc, artifacts, champions }
writeFileSync(outPath, JSON.stringify(nativeInput))

// Diagnostics as formatted primitives (per project logging convention).
console.log(`[native-dll-input] artifacts=${artifacts.length} champions=${champions.length}`)
console.log(`[native-dll-input] wrote ${outPath} (${(JSON.stringify(nativeInput).length / 1e6).toFixed(1)} MB)`)
