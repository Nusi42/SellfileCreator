/**
 * packetCapture — dev-only scaffolding for recording endpoint packets (inbound frames
 * AND outbound requests the app sends, e.g. an `uploadSellfile` HSF push — see
 * {@link captureOutboundRequest}).
 *
 * When the app is opened with `?capturePackets` in a dev build (see
 * {@link getCapturePackets}), every raw JSON-RPC frame received from RSL Helper is
 * streamed to the Vite dev server, which writes it to disk under
 * `docs/orig/sampleLog/captures/<session>/` using the exact same filename convention
 * as the committed sample log:
 *
 *   packet_<NN>_<method>_<YYMMDD>_<HHMMSS.mmm>.json
 *
 * The recorded files are byte-compatible fixtures: drop a capture folder into the
 * endpoint-replay harness (or hand it to the live importer) to verify the merge /
 * restore behaviour against real, in-order-or-not traffic.
 *
 * Everything here is a no-op unless capture is active, and the activation flag is
 * gated on `import.meta.env.DEV`, so the scaffolding cannot run in production. To
 * toggle it later you only flip the `?capturePackets` URL param — no code change.
 */
import { getCapturePackets } from './runtimeConfig'

// Dev-server route the middleware listens on (see scripts/vite/packetCapturePlugin.ts).
// Exported so the plugin and client share one definition (SSOT).
export const PACKET_CAPTURE_ENDPOINT = '/__capture-packet'
// Route for the console-log sink — appends to <session>/console.log on the dev server.
export const PACKET_CAPTURE_LOG_ENDPOINT = '/__capture-log'

// Per-frame payload posted to the dev server. The plugin owns filename assembly so
// the path-safety / collision logic lives in exactly one place.
export type PacketCaptureRecord = {
  // Monotonic 1-based send-order index (zero-padded to 2 digits in the filename).
  index: number
  // JSON-RPC method (or a synthetic label for non-method frames) used in the filename.
  method: string
  // Filename timestamp component: YYMMDD_HHMMSS.mmm, captured at receive time.
  timestamp: string
  // The raw frame, pretty-printed exactly like the committed samples (2-space indent).
  body: string
  // Capture session id (folder name) so all frames from one run group together.
  session: string
}

// Module-level capture state. Lazily initialised on first use so a fresh session id
// is minted only when capture is actually active.
let active: boolean | null = null
let sessionId = ''
let frameIndex = 0
// ── capture POST queue ──────────────────────────────────────────────────────────
// Explicit FIFO drained by a single sequential loop: writes happen strictly in receive
// order and never run concurrently — concurrent fetches were silently racing and
// dropping frames (observed gaps in captured indices). An explicit queue (rather than
// a promise chain) is what makes the coalescing backpressure below possible: a chained
// promise cannot shed an already-queued link.
type CapturePostItem =
  | { kind: 'frame'; record: PacketCaptureRecord }
  | { kind: 'log'; text: string }
const postQueue: CapturePostItem[] = []
// True while the drain loop is running; a push during drain is picked up by the loop.
let postDrainActive = false
// Backlog cap for FRAME items. Each queued frame pins its serialized body (an ~11 MB
// pretty string per artifacts frame, ~27 MB per uploadSellfile) until its POST drains,
// so an unbounded backlog inflates the dev heap by hundreds of MB during farm bursts —
// on top of the very memory behaviour a capture session is usually observing.
//
// Backpressure policy = coalesce, never drop-newest: gear frames are FULL snapshots
// (artifacts / inboxArtifacts / champions / lastUsed resend the complete state), so when
// the backlog is full the OLDEST queued frame of the SAME method is shed in favour of
// the incoming one. The newest frame of every method is therefore always captured — a
// replayed session always ends on the latest state; only intermediate duplicates are
// lost (each loss is warned with both indices, so gaps in the numbering stay explained).
// A frame with no queued same-method twin is never dropped, even over the cap.
const MAX_QUEUED_CAPTURE_FRAMES = 6

// Zero-pad a number to a fixed width for stable, sortable filenames.
const pad = (value: number, width: number): string => String(value).padStart(width, '0')

/**
 * Format a Date into the sampleLog filename timestamp: YYMMDD_HHMMSS.mmm.
 * Uses local time to match how the original captures were named.
 */
const formatTimestamp = (date: Date): string => {
  const yy = pad(date.getFullYear() % 100, 2)
  const mm = pad(date.getMonth() + 1, 2)
  const dd = pad(date.getDate(), 2)
  const hh = pad(date.getHours(), 2)
  const mi = pad(date.getMinutes(), 2)
  const ss = pad(date.getSeconds(), 2)
  const ms = pad(date.getMilliseconds(), 3)
  return `${yy}${mm}${dd}_${hh}${mi}${ss}.${ms}`
}

// Resolve and cache whether capture is active for this session, minting the session
// id (a timestamp folder) on first activation.
const ensureSession = (): boolean => {
  if (active === null) {
    active = getCapturePackets()
    if (active) {
      // Folder name = capture start timestamp; groups one run's frames together.
      sessionId = `session_${formatTimestamp(new Date())}`
    }
  }
  return active
}

/**
 * Derive a filename-safe method label from a parsed JSON-RPC frame. Falls back to a
 * synthetic label for frames without a string `method` (e.g. responses) so every
 * captured frame still lands on disk with a meaningful, sortable name.
 */
const resolveMethodLabel = (frame: unknown): string => {
  if (frame && typeof frame === 'object' && 'method' in frame) {
    const method = (frame as { method?: unknown }).method
    if (typeof method === 'string' && method.length > 0) {
      // Strip anything that is not filename-safe; method names are simple words today.
      return method.replace(/[^A-Za-z0-9_-]/g, '_')
    }
  }
  // Non-method frames (responses, etc.) — keep them but label distinctly.
  return 'response'
}

/**
 * Record one raw inbound frame. No-op unless capture is active. Fire-and-forget: a
 * failed POST is swallowed (dev-only diagnostics) so capture never perturbs the live
 * data flow it is meant to observe.
 *
 * @param frame  The parsed JSON-RPC object as received (object form, not the string).
 * @param methodOverride  Optional explicit label for frames that carry no `method`
 *   (e.g. the binary gear-DB file notification), keeping the filename meaningful.
 */
export const capturePacket = (frame: unknown, methodOverride?: string, compact = false): void => {
  if (!ensureSession()) return
  // Assign the index synchronously so it always reflects true receive order, even
  // though the POST is async. A gap in written files vs. logged indices therefore
  // unambiguously means "write failed or was coalesced", never "frame never arrived"
  // (both paths warn with the index).
  frameIndex += 1
  const index = frameIndex
  let record: PacketCaptureRecord
  try {
    const method = methodOverride ?? resolveMethodLabel(frame)
    record = {
      index,
      method,
      timestamp: formatTimestamp(new Date()),
      // Pretty-print with 2-space indent to match the committed sample files. `compact`
      // skips indentation for huge frames (the uploadSellfile HSF push, ~45k rules): pretty
      // printing inflates it to ~58 MB and the double-encoded POST then exceeds the dev
      // server's body ceiling, silently dropping the capture. Compact keeps it well under.
      body: compact ? JSON.stringify(frame) : JSON.stringify(frame, null, 2),
      session: sessionId,
    }
  } catch {
    // Serialization failed — log the gap so it is explained, then bail.
    console.warn(`[packet-capture] frame #${index} skipped: could not serialize`)
    return
  }
  // Enqueue with the coalescing backpressure documented at MAX_QUEUED_CAPTURE_FRAMES:
  // over the cap, shed the OLDEST queued frame of this method (full-snapshot semantics
  // make the newest strictly more valuable); a frame without a queued twin always queues.
  let queuedFrames = 0
  for (const item of postQueue) { if (item.kind === 'frame') queuedFrames += 1 }
  if (queuedFrames >= MAX_QUEUED_CAPTURE_FRAMES) {
    const twinIndex = postQueue.findIndex((item) => item.kind === 'frame' && item.record.method === record.method)
    if (twinIndex !== -1) {
      const twin = postQueue[twinIndex] as { kind: 'frame'; record: PacketCaptureRecord }
      postQueue.splice(twinIndex, 1)
      // Warn with BOTH indices so the numbering gap in the written files stays explained.
      console.warn(`[packet-capture] frame #${twin.record.index} (${twin.record.method}) coalesced away: `
        + `backlog full, superseded by frame #${index}`)
    }
  }
  postQueue.push({ kind: 'frame', record })
  drainPostQueue()
}

// POST one frame record to the dev middleware. NOT keepalive: keepalive caps the request
// body at ~64 KB, which silently dropped multi-MB artifacts/champions packets — the exact
// frames we most need. Sequential plain fetches have no such cap. Failures are logged,
// not thrown, so capture never perturbs the live data flow it observes.
const postFrame = async (record: PacketCaptureRecord): Promise<void> => {
  try {
    const res = await fetch(PACKET_CAPTURE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(record),
    })
    if (!res.ok) {
      console.warn(`[packet-capture] frame #${record.index} (${record.method}) write failed: HTTP ${res.status}`)
    } else {
      console.log(`[packet-capture] frame #${record.index} ${record.method} captured`)
    }
  } catch (err) {
    // Surface the loss so a gap in captured indices is never silent.
    console.warn(`[packet-capture] frame #${record.index} (${record.method}) POST error: ${String(err)}`)
  }
}

// POST buffered console-log text (append mode server-side). Best-effort like postFrame.
const postLog = async (text: string): Promise<void> => {
  try {
    await fetch(PACKET_CAPTURE_LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session: sessionId, text }),
    })
  } catch {
    // Swallow — log capture is best-effort dev scaffolding.
  }
}

// Sequential drain: one in-flight POST at a time, FIFO order. Items pushed while the
// loop runs are drained by the same loop; a new drain starts only when idle.
const drainPostQueue = (): void => {
  if (postDrainActive) return
  postDrainActive = true
  void (async () => {
    try {
      while (postQueue.length > 0) {
        const item = postQueue.shift()!
        if (item.kind === 'frame') await postFrame(item.record)
        else await postLog(item.text)
      }
    } finally {
      postDrainActive = false
    }
  })()
}

// True when capture is active — lets callers skip building override labels otherwise.
export const isPacketCaptureActive = (): boolean => ensureSession()

// The active capture session id (folder name), or null when capture is off. Used to hand
// the session to the rule-cache worker so its console output tees into the SAME folder.
export const getCaptureSessionId = (): string | null => (ensureSession() ? sessionId : null)

/**
 * Record one OUTBOUND request the app sends to RSL Helper (uploadSellfile, selectArtifacts,
 * requestSfcSync, …). No-op unless capture is active. This lets a capture session include
 * what the app PUSHED — most importantly the exported HSF payload of an `uploadSellfile` —
 * so the replay harness can diff "what the app produced" against "what the harness computes"
 * for the same gear state, WITHOUT the user manually exporting HSF files each time.
 *
 * The frame is recorded in the same per-session folder and filename convention as inbound
 * frames, labelled `send_<method>` (e.g. `packet_07_send_uploadSellfile_…json`), and shaped
 * like a JSON-RPC request envelope with a `direction: "send"` marker so consumers can tell
 * outbound from inbound:
 *   { jsonrpc: "2.0", direction: "send", id, method, params }
 *
 * @param method  The JSON-RPC method being sent (used for the `send_<method>` filename label).
 * @param id      The request id allocated by the sender.
 * @param params  The request params object (for uploadSellfile this carries the HSF `data`).
 */
export const captureOutboundRequest = (method: string, id: number, params: unknown): void => {
  if (!ensureSession()) return
  // Shape as a JSON-RPC-like request so the file is self-describing and replay-friendly.
  // `direction` distinguishes these from inbound notifications/responses.
  const frame = { jsonrpc: '2.0', direction: 'send', id, method, params }
  // Serialize outbound frames compactly: the uploadSellfile HSF (~45k rules) pretty-prints
  // to ~58 MB and the double-encoded capture POST would blow past the dev server's body
  // ceiling and be dropped. Compact JSON keeps the same data, just without indentation.
  capturePacket(frame, `send_${method}`, true)
}

// ── console-log capture ─────────────────────────────────────────────────────────
// Forwards browser console output to <session>/console.log on the dev server so a
// capture folder bundles its diagnostics (e.g. [detect-io]/[detect-keys]) with its
// frames — no separate copy-paste of the DevTools console. Lines are batched and
// flushed on a short timer to avoid one POST per log call.
let logBuffer = ''
let logFlushTimer: ReturnType<typeof setTimeout> | null = null
let consoleCaptureInstalled = false

// Flush the buffered log text onto the shared POST queue. Fire-and-forget; failures are
// swallowed in postLog (a broken log sink must never perturb the app or the console).
// Sharing the queue with frame writes keeps log-vs-frame ordering roughly preserved;
// log items are tiny and exempt from the frame backpressure cap.
const flushLogBuffer = (): void => {
  if (!logBuffer) return
  const text = logBuffer
  logBuffer = ''
  postQueue.push({ kind: 'log', text })
  drainPostQueue()
}

// Render one console argument to a stable string. Objects are JSON-stringified (compact)
// so structured payloads survive; primitives pass through via String().
const formatLogArg = (arg: unknown): string => {
  if (typeof arg === 'string') return arg
  if (arg === null || arg === undefined || typeof arg !== 'object') return String(arg)
  try { return JSON.stringify(arg) } catch { return String(arg) }
}

/**
 * Install console.log/info/warn/error capture when a capture session is active. Idempotent
 * and a no-op when capture is off. The original console methods are always called first, so
 * the DevTools console behaves exactly as before; we additionally tee each line to the
 * session's console.log file. Call once at app startup (gated on import.meta.env.DEV).
 */
export const installConsoleLogCapture = (): void => {
  if (consoleCaptureInstalled || !ensureSession()) return
  consoleCaptureInstalled = true
  const levels = ['log', 'info', 'warn', 'error'] as const
  for (const level of levels) {
    // Capture the original so the real console still works and we never recurse.
    const original = console[level].bind(console) as (...args: unknown[]) => void
    console[level] = (...args: unknown[]): void => {
      original(...args)
      try {
        // Prefix non-log levels so warn/error stay distinguishable in the flat file.
        const prefix = level === 'log' ? '' : `[${level}] `
        logBuffer += prefix + args.map(formatLogArg).join(' ') + '\n'
        // Batch: flush after a short idle gap. Cap buffer so a burst flushes promptly.
        if (logBuffer.length > 64 * 1024) { flushLogBuffer(); return }
        if (logFlushTimer === null) {
          logFlushTimer = setTimeout(() => { logFlushTimer = null; flushLogBuffer() }, 500)
        }
      } catch {
        // Never let log capture throw into the caller's console call.
      }
    }
  }
  // Best-effort final flush so the tail of the session is not lost on close.
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => { flushLogBuffer() })
  }
}

/**
 * Worker-side console capture. The rule-cache worker runs in its OWN context, so the main
 * thread's installConsoleLogCapture cannot see its console.log output (e.g. the worker's
 * [detect-io]/[detect-keys] diagnostics). The main thread hands the worker the active
 * capture session id (via the init-wasm message); the worker calls this to tee its console
 * into the SAME <session>/console.log file. No-op when sessionId is null/empty (capture off).
 * Independent of ensureSession()/getCapturePackets() because the worker has no URL params.
 */
export const installWorkerConsoleLogCapture = (workerSessionId: string | null | undefined): void => {
  if (consoleCaptureInstalled || !workerSessionId) return
  consoleCaptureInstalled = true
  // Adopt the main thread's session id so both contexts append to one file.
  sessionId = workerSessionId
  const levels = ['log', 'info', 'warn', 'error'] as const
  for (const level of levels) {
    const original = console[level].bind(console) as (...args: unknown[]) => void
    console[level] = (...args: unknown[]): void => {
      original(...args)
      try {
        const prefix = level === 'log' ? '' : `[${level}] `
        logBuffer += '[worker] ' + prefix + args.map(formatLogArg).join(' ') + '\n'
        if (logBuffer.length > 64 * 1024) { flushLogBuffer(); return }
        if (logFlushTimer === null) {
          logFlushTimer = setTimeout(() => { logFlushTimer = null; flushLogBuffer() }, 500)
        }
      } catch { /* never throw into the caller */ }
    }
  }
}
