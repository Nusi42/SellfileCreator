import type { Plugin, ViteDevServer } from 'vite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * packetCapturePlugin — dev-only sink for the inbound-endpoint packet capture.
 *
 * Pairs with `src/lib/packetCapture.ts`. When the app runs with `?capturePackets`
 * in a dev build, the browser POSTs each raw JSON-RPC frame to this middleware,
 * which writes it to disk under:
 *
 *   docs/orig/sampleLog/captures/<session>/packet_<NN>_<method>_<YYMMDD>_<HHMMSS.mmm>.json
 *
 * The output is byte-compatible with the committed sample log so captured folders
 * can be replayed by the endpoint-replay harness or fed to the live importer.
 *
 * `apply: 'serve'` means this only ever runs under `vite dev` / `vite preview`-style
 * serving — it is never part of a production bundle. The whole feature is therefore
 * inert unless a developer explicitly opts in via the URL param.
 */

// Route the browser client posts to. Kept in sync with PACKET_CAPTURE_ENDPOINT in
// src/lib/packetCapture.ts (duplicated here only because Vite config cannot import
// from the app's module graph without bundling concerns; both are simple literals).
const CAPTURE_ENDPOINT = '/__capture-packet'

// Capture root, relative to the repo (= Vite project root). Mirrors the committed
// sample-log location so fixtures live alongside the canonical reference set.
const CAPTURE_ROOT = 'docs/orig/sampleLog/captures'

// Shape posted by the client (see PacketCaptureRecord). Validated defensively since
// this is an HTTP boundary, even if dev-only.
type CaptureRecord = {
  index: number
  method: string
  timestamp: string
  body: string
  session: string
}

// Reject anything that could escape the capture directory — folder/file components
// must be simple, filename-safe tokens. Returns the sanitized token or null.
const safeToken = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  // Allow only word chars, dot and dash; collapse anything else to underscore.
  const cleaned = trimmed.replace(/[^A-Za-z0-9._-]/g, '_')
  // Defence-in-depth: never allow path traversal even after cleaning.
  if (cleaned.includes('..')) return null
  return cleaned
}

// Read a JSON request body to completion with a sane size cap (dev fixtures can be
// large — artifacts packets run to a few MB — so allow generous headroom).
const readBody = (req: import('node:http').IncomingMessage): Promise<string> =>
  new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = []
    let size = 0
    const MAX_BYTES = 64 * 1024 * 1024 // 64 MB ceiling guards against runaway posts.
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BYTES) {
        rejectBody(new Error('capture payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', rejectBody)
  })

export function packetCapturePlugin(): Plugin {
  return {
    name: 'packet-capture',
    // Serve-only: never participates in production builds.
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      // Resolve the capture root once against the Vite project root.
      const root = server.config.root
      server.middlewares.use(CAPTURE_ENDPOINT, async (req, res) => {
        // Only accept POSTs; ignore everything else so the route stays inert.
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        try {
          const raw = await readBody(req)
          const record = JSON.parse(raw) as CaptureRecord
          // Validate the path-forming tokens before touching the filesystem.
          const session = safeToken(record.session)
          const method = safeToken(record.method)
          const timestamp = safeToken(record.timestamp)
          const index = Number(record.index)
          if (!session || !method || !timestamp || !Number.isFinite(index) || index <= 0) {
            res.statusCode = 400
            res.end('invalid capture record')
            return
          }
          if (typeof record.body !== 'string') {
            res.statusCode = 400
            res.end('missing body')
            return
          }
          // Build the per-session directory and the sampleLog-style filename.
          const dir = resolve(root, CAPTURE_ROOT, session)
          mkdirSync(dir, { recursive: true })
          const indexLabel = String(index).padStart(2, '0')
          const fileName = `packet_${indexLabel}_${method}_${timestamp}.json`
          writeFileSync(resolve(dir, fileName), record.body, 'utf8')
          // Surface progress in the dev console so the developer sees capture working.
          server.config.logger.info(`[packet-capture] wrote ${session}/${fileName}`)
          res.statusCode = 204
          res.end()
        } catch (err) {
          // Dev-only: log and 500 so a failed write is visible but non-fatal.
          server.config.logger.error(`[packet-capture] failed: ${String(err)}`)
          res.statusCode = 500
          res.end('capture failed')
        }
      })
    },
  }
}
