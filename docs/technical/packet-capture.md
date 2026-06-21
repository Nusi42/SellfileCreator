# Packet Capture (dev-only)

A developer tool for recording real WebSocket traffic between RSL Helper and Sellfile
Creator to disk, so out-of-order endpoint merge/restore behaviour can be debugged and
replayed against fixtures. This is **not** part of the WebSocket protocol contract — for
the wire format see [WebSocket Protocol (JSON-RPC)](websocket-jsonrpc.md). This note covers
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

## Promoting a recording

A capture is throwaway by default. To keep one:

- Promote a useful recording into `docs/orig/sampleLog/` by hand if it should become a
  committed fixture, or
- Feed it to the `endpoint-replay` harness to replay the session through the pipeline.
