# Packet Capture (dev-only)

A developer tool for recording real WebSocket traffic between RSL Helper and Sellfile
Creator to disk, so out-of-order endpoint merge/restore behaviour can be debugged and
replayed against fixtures. This is **not** part of the WebSocket protocol contract — for
the wire format see [WebSocket Protocol (JSON-RPC)](../../userDocs/websocket-jsonrpc.md). This note covers
the implementation: how it is wired into the app, the dev-server middleware, the on-disk
layout, and how a recording is promoted into a committed fixture or fed to the replay
harness.

## What it records

The dev build can record both directions of traffic as sampleLog-style fixtures:

- **Inbound frames** — pushes from RSL Helper (`artifacts`, `champions`, `inboxArtifacts`,
  `lastUsed`, etc.).
- **Outbound requests** — what the app sends back (`uploadSellfile`, `selectArtifacts`,
  `requestSfcSync`), including the exported HSF carried in an `uploadSellfile` push.

This makes a capture session self-contained: the inbound frames drive the pipeline and the
outbound `send_uploadSellfile` frame records exactly what the pipeline produced, with no
separate manual HSF export.

## How to enable

Run the dev server (`npm run dev`) and open the app with the `?capturePackets` query param
alongside the usual `?endpoint=…`, e.g.:

```
http://localhost:5173/?endpoint=ws://localhost:8080/&capturePackets
```

To turn it on or off at any time, just add or drop the `?capturePackets` param — no code
change required.

## Wiring

- Each raw JSON-RPC frame received in `handleInboundMessage`
  (`src/hooks/useExternalCommands.ts`) is streamed via `capturePacket`
  (`src/lib/packetCapture.ts`).
- Each outbound request the app sends is streamed via `captureOutboundRequest` from the same
  module.
- Both POST to the dev-only Vite middleware (`scripts/vite/packetCapturePlugin.ts`), which
  writes the frames to disk.

The middleware exposes two endpoints: `/__capture-packet` (frames) and `/__capture-log`
(console log lines, see below).

### Backpressure (coalescing, latest-state preserving)

Frames are POSTed strictly sequentially from an explicit FIFO queue; each queued frame
pins its serialized body (~11 MB per artifacts frame) until written. When more than
`MAX_QUEUED_CAPTURE_FRAMES` frames are backed up, the **oldest queued frame of the same
method** is shed in favour of the incoming one — never the newest. Because RSL Helper's
gear frames are full snapshots, a replayed capture therefore always ends on the latest
state; only intermediate duplicates can be lost, and every shed frame is warned with both
indices so gaps in the file numbering stay explained. A frame with no queued same-method
twin is never dropped. Live app ingestion is entirely unaffected — this bounds only the
dev recording's memory footprint.

## On-disk layout

Frames land under a per-session folder:

```
docs/orig/sampleLog/captures/<session>/packet_<NN>_<method>_<YYMMDD>_<HHMMSS.mmm>.json
```

- The zero-padded numeric `<NN>` is the send/receive order index.
- `<method>` is the JSON-RPC method; outbound frames use a `send_<method>` form (e.g.
  `packet_07_send_uploadSellfile_…json`).
- Files are byte-compatible with the committed sample log: 2-space pretty-printed JSON-RPC
  envelopes, send-order index, receive-time timestamp.
- The binary gear-DB push (`gearDbFileBinary`) is recorded as a metadata stub only — the raw
  SQLite bytes are not persisted.

The reference sample log is the committed capture session `session_260510_183951.731`
(`SAMPLE_LOG_SESSION`; same `packet_<index>_<method>_<YYMMDD>_<HHMMSS.mmm>.json` naming, the
zero-padded `<index>` being the order in which RSL Helper emitted the packet). The sample
(captured 2026-05-10) contains 22 packets: `artifacts` ×6, `champions` ×7,
`inboxArtifacts` ×6, `lastUsed` ×2, and `ArtifactByHeroID` ×1. (Not referenced from the user-facing
`userDocs/websocket-jsonrpc.md` — `docs/orig/` is not shipped.)

### Outbound frame shape

Outbound frames are shaped like a JSON-RPC request with a `"direction": "send"` marker:

```json
{"jsonrpc":"2.0","direction":"send","id":2,"method":"uploadSellfile","params":{"name":"SFC.hsf","contentType":"application/json","data":{"Rules":[…]}}}
```

An `uploadSellfile` capture therefore embeds the **exact HSF the app pushed**. Inbound
frames carry no `direction` field; consumers distinguish the two by that marker.

### Compact serialization (outbound) — MAX_BYTES rationale

Outbound frames are serialized **compactly** (single line, no indentation) rather than
pretty-printed, unlike inbound fixtures. A full HSF push is large (~45k rules); pretty
printing inflates it to ~58 MB and the double-encoded capture POST would exceed the dev
server's body ceiling and be silently dropped. Compact serialization keeps the same data
under the limit (the dev middleware caps capture POSTs at 256 MB / `MAX_BYTES`). The content
is still valid JSON and is read programmatically by the replay harness.

## Console log capture

When capture is active the app also tees its `console.log/info/warn/error` output — and the
rule-cache **worker's** output (e.g. the `[detect-io]` / `[detect-keys]` diagnostics) — into:

```
docs/orig/sampleLog/captures/<session>/console.log
```

appended live via the `/__capture-log` endpoint. So a capture folder is fully
self-contained — frames, the pushed HSF, and the diagnostic log all in one place, with no
manual copy-paste from DevTools.

- Worker lines are prefixed `[worker]`; non-`log` levels are prefixed `[warn]` / `[error]`.
- Installed at app startup via `installConsoleLogCapture` and in the worker via
  `installWorkerConsoleLogCapture`.
- The worker receives the session id through its `init-wasm` message, so its log lines land
  in the same session folder as the main-thread frames.

## Scope, safety, and tree-shaking

- The activation flag is gated on `import.meta.env.DEV`, and the plugin is `apply: 'serve'`,
  so capture can never run in a production build.
- With the `?capturePackets` param absent it is a complete no-op; the capture helpers and the
  worker installer tree-shake out unless capture is on.
- The `captures/` directory is gitignored.

## Promoting a recording — committed compressed fixtures

A capture is throwaway by default. To keep one, pack it into a committed compressed
fixture (real sessions are huge — the 2026-07-15 farm-run session is ~940 MB of JSON —
but so redundant that a solid tar+zstd archive shrinks it ~500×, to ~2 MB):

```
npm run fixtures:captures:pack -- session_YYMMDD_HHMMSS.mmm
```

- Writes `tests/fixtures/captures/<session>.tar.zst` (committed; the raw session dir under
  `captures/` stays gitignored and can be deleted once packed).
- Compression is Node's **built-in zstd** (`node:zlib`, needs Node ≥ 22.15) at level 19
  with long-distance matching (128 MiB window) — the near-identical consecutive `artifacts`
  frames dedupe against each other. Tar comes from the pure-JS `tar` devDependency, so
  pack/unpack run identically on Windows. Implementation: `scripts/test/capture-fixtures.mjs`.
- Packing **anonymizes** the frames: every `playerId` / `playerName` value is replaced,
  wherever it occurs in the session, by a placeholder (`um12345678`, `[TAG]Player`, …),
  and every champion in `champions` frames gets a synthetic identity (only its id, storage
  location and gear links are kept). The live capture directory is left untouched. See
  [Test Data and Privacy](test-data.md#capture-sessions-and-the-sample-log).

Consumers unpack on demand back to `docs/orig/sampleLog/captures/<session>/` (the
gitignored live-captures dir doubles as the local unpack cache), so every path-based
consumer works unchanged:

- **Playwright**: `tests/playwright/capture-replay-memory.spec.ts` calls
  `ensureCaptureSession()` in `beforeAll`, and `tests/playwright/global-setup.ts` unpacks
  the sample log for the endpoint specs — no manual step; unpack is idempotent and
  skipped when the session dir already exists.
- **Unit tests**: `tests/unit/gearDbEndpointReplay.test.ts` unpacks the sample log itself.
- **Node repro harness**: run `npm run fixtures:captures:unpack` once (unpacks every
  committed archive), then `REPRO_SESSION=<session> npm run repro:capture-replay` as usual.

Committed capture fixtures:

- `session_260510_183951.731` — the 2026-05-10 RSL Helper sample log (one push of every
  endpoint type; 79 MB raw, 0.3 MB packed). Replayed by `gearDbEndpointReplay.test.ts` and
  `endpoint-replay.spec.ts`.
- `session_260715_212027.627` — app started with `?capturePackets`, previous data restored,
  RSL Helper started afterwards; one farm run; ends at the live OOM crash (52 MB raw).
- `session_260715_212207.259` — RSL Helper already running, app connected to the live
  endpoint; several farm runs (110 packets, ~60 full `artifacts` resends of ~7.7k artifacts,
  10 `uploadSellfile` pushes of ~25k rules); ends at the live OOM crash (940 MB raw).
  Both sessions' `console.log` files record the heap telemetry
  (`[rule-cache-worker] pipeline-done … wasmHeapMB=… mainHeapMB=…`) leading up to the crash.
