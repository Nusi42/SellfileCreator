/**
 * packetCapture — dev-only scaffolding for recording raw inbound endpoint packets.
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
export const capturePacket = (frame: unknown, methodOverride?: string): void => {
  if (!ensureSession()) return
  try {
    frameIndex += 1
    const method = methodOverride ?? resolveMethodLabel(frame)
    const record: PacketCaptureRecord = {
      index: frameIndex,
      method,
      timestamp: formatTimestamp(new Date()),
      // Pretty-print with 2-space indent to match the committed sample files.
      body: JSON.stringify(frame, null, 2),
      session: sessionId,
    }
    // Fire-and-forget POST; keepalive lets late frames flush during teardown.
    void fetch(PACKET_CAPTURE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(record),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Capture must never throw into the live message handler.
  }
}

// True when capture is active — lets callers skip building override labels otherwise.
export const isPacketCaptureActive = (): boolean => ensureSession()
