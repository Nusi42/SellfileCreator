/**
 * capture-fixtures — pack/unpack committed endpoint-capture fixtures.
 *
 * Real `?capturePackets` sessions (see src/lib/packetCapture.ts) are huge on disk
 * (the 2026-07-15 farm-run OOM session is ~986 MB of JSON) but extremely redundant:
 * RSL Helper resends the FULL artifact list on every change, so consecutive frames
 * are near-identical. A solid tar + zstd(long-range) archive shrinks ~986 MB → ~3 MB,
 * which is what we commit; tests unpack on demand.
 *
 * Layout:
 *   committed archive : tests/fixtures/captures/<session>.tar.zst
 *   unpacked session  : docs/orig/sampleLog/captures/<session>/   (gitignored)
 *
 * Unpacking into docs/orig/sampleLog/captures/ keeps every existing consumer working
 * unchanged (tests/repro/repro-capture-replay.ts REPRO_SESSION, the Playwright
 * capture-replay specs) — the committed archive is the source of truth, the unpacked
 * dir is a disposable local cache.
 *
 * Compression is Node's BUILT-IN zstd (node:zlib, Node >= 22.15 / 23.8) — no native
 * binaries, works identically on Windows. Tar comes from the pure-JS `tar` package.
 *
 * Packing anonymizes: RSL Helper frames name the player (`playerId`, `playerName`), and
 * those values also leak into derived strings such as `savedAs` file names. `pack` swaps
 * every occurrence for a placeholder before archiving, so no account reaches the repo. It
 * also replaces every champion's identity in `champions` frames and drops champion type
 * ids from the console log (roster-anonymizer.mjs), so the roster is not published either.
 *
 * CLI:
 *   node scripts/test/capture-fixtures.mjs pack <sessionDirOrName>...
 *   node scripts/test/capture-fixtures.mjs unpack [<sessionName>...]   # default: all archives
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import * as tar from 'tar'
import { anonymizeCaptureText } from './roster-anonymizer.mjs'

// Repo root = cwd; all npm scripts and Playwright specs run from the repo root.
const ROOT = process.cwd()
// Committed archive home (tracked in git).
export const CAPTURE_ARCHIVE_DIR = path.resolve(ROOT, 'tests/fixtures/captures')
// Unpack destination (gitignored live-captures dir — shared with `?capturePackets`).
export const CAPTURE_UNPACK_DIR = path.resolve(ROOT, 'docs/orig/sampleLog/captures')

// zstd tuning: max-practical level + long-distance matching so the near-duplicate
// artifact frames across the whole session dedupe against each other (this is what
// takes 986 MB → ~3 MB; plain deflate only reaches ~35 MB). Pack is a one-time,
// promote-a-capture operation, so the slow high level is fine.
const ZSTD_PACK_PARAMS = {
  [zlib.constants.ZSTD_c_compressionLevel]: 19,
  [zlib.constants.ZSTD_c_enableLongDistanceMatching]: 1,
  // 2^27 = 128 MiB match window — spans ~10 consecutive artifact frames.
  [zlib.constants.ZSTD_c_windowLog]: 27,
}
// Decompression must accept the large window the packer used (default cap is 2^27-ish,
// but be explicit so a future default change can never break unpacking).
const ZSTD_UNPACK_PARAMS = { [zlib.constants.ZSTD_d_windowLogMax]: 27 }

// Fail early with an actionable message on Node builds without zstd support.
const assertZstdSupport = () => {
  if (typeof zlib.createZstdCompress !== 'function') {
    throw new Error('capture-fixtures needs Node >= 22.15 (built-in zstd in node:zlib); '
      + `current: ${process.version}`)
  }
}

/**
 * The 2026-05-10 RSL Helper sample log: one full push of every endpoint type (artifacts,
 * champions, inboxArtifacts, lastUsed, ArtifactByHeroID) replayed by the endpoint tests.
 */
export const SAMPLE_LOG_SESSION = 'session_260510_183951.731'

// Identity fields RSL Helper puts into frames, and the placeholder each value becomes.
// The id placeholder matches the example the UI shows for a Player ID.
const IDENTITY_PLACEHOLDERS = {
  playerId: (i) => `um${12345678 + i}`,
  playerName: (i) => `[TAG]Player${i === 0 ? '' : i + 1}`,
}
// Any `"<identity key>": "<value>"` pair, pretty-printed or minified; values stay JSON-escaped.
const IDENTITY_FIELD_RE = new RegExp(`"(${Object.keys(IDENTITY_PLACEHOLDERS).join('|')})"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'g')

/**
 * Replacement pairs for every identity value found in `texts`, longest first so a value
 * that contains another (a name embedding the id) is swapped whole before its parts.
 */
export function identityReplacements(texts) {
  const found = new Map(Object.keys(IDENTITY_PLACEHOLDERS).map((key) => [key, []]))
  for (const text of texts) {
    for (const [, key, value] of text.matchAll(IDENTITY_FIELD_RE)) {
      const seen = found.get(key)
      // Empty values carry no identity; skip them and keep first-seen numbering stable.
      if (value !== '' && !seen.includes(value)) seen.push(value)
    }
  }
  // A value seen under several keys keeps its first mapping (e.g. an id echoed as a name).
  const pairs = new Map()
  for (const [key, values] of found) {
    values.forEach((value, i) => { if (!pairs.has(value)) pairs.set(value, IDENTITY_PLACEHOLDERS[key](i)) })
  }
  return [...pairs].sort(([a], [b]) => b.length - a.length)
}

/** Apply `identityReplacements` pairs to one text. */
export const anonymizeText = (text, pairs) => pairs.reduce((out, [from, to]) => out.split(from).join(to), text)

/** Archive path for a session name (SSOT for the <name>.tar.zst convention). */
export const archivePathFor = (session) => path.join(CAPTURE_ARCHIVE_DIR, `${session}.tar.zst`)

/** Unpacked session dir for a session name. */
export const unpackedPathFor = (session) => path.join(CAPTURE_UNPACK_DIR, session)

/**
 * Pack one capture session dir into tests/fixtures/captures/<session>.tar.zst.
 * `sessionDirOrName` may be an absolute/relative dir path or a bare session name
 * (resolved under the live captures dir). The archive stores the session as a
 * top-level folder so unpack recreates <captures>/<session>/... verbatim.
 */
export async function packCaptureSession(sessionDirOrName) {
  assertZstdSupport()
  // Accept both "session_..." names and full paths; normalize to (parentDir, name).
  const dir = fs.existsSync(sessionDirOrName) && fs.statSync(sessionDirOrName).isDirectory()
    ? path.resolve(sessionDirOrName)
    : unpackedPathFor(sessionDirOrName)
  if (!fs.existsSync(dir)) throw new Error(`capture session dir not found: ${dir}`)
  const session = path.basename(dir)
  fs.mkdirSync(CAPTURE_ARCHIVE_DIR, { recursive: true })
  const out = archivePathFor(session)
  const files = fs.readdirSync(dir)
  // First pass collects every identity value in the session so numbering is session-wide.
  const pairs = identityReplacements(files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')))
  // Anonymized copy goes to a staging tree; the live capture dir is never modified.
  const staging = path.join(CAPTURE_ARCHIVE_DIR, `.pack-${process.pid}`)
  fs.rmSync(staging, { recursive: true, force: true })
  fs.mkdirSync(path.join(staging, session), { recursive: true })
  try {
    // One frame at a time keeps memory bounded by the largest frame, not the session.
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8')
      fs.writeFileSync(path.join(staging, session, f), anonymizeCaptureText(f, anonymizeText(text, pairs)))
    }
    // Stream tar → zstd → file so the ~1 GB session never sits in memory at once.
    await pipeline(
      tar.create({ cwd: staging, portable: true }, [session]),
      zlib.createZstdCompress({ params: ZSTD_PACK_PARAMS }),
      fs.createWriteStream(out),
    )
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
  const mb = (n) => `${(n / 1048576).toFixed(1)} MB`
  const rawBytes = files.reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0)
  console.log(`[capture-fixtures] packed ${session}: ${mb(rawBytes)} -> ${mb(fs.statSync(out).size)}, `
    + `${pairs.length} identity value(s) and the champion roster anonymized (${out})`)
  return out
}

/**
 * Ensure one committed capture session is unpacked; returns its unpacked dir.
 * Idempotent and cheap when already present (a single existsSync), so tests can
 * call it unconditionally. Unpacks to a temp sibling then renames, so an
 * interrupted unpack can never leave a half-populated session dir behind.
 */
export async function ensureCaptureSession(session) {
  const target = unpackedPathFor(session)
  if (fs.existsSync(target)) return target
  assertZstdSupport()
  const archive = archivePathFor(session)
  if (!fs.existsSync(archive)) throw new Error(`no committed capture archive for "${session}": ${archive}`)
  // Unpack <captures>/.unpack-<pid>/<session>/... then promote atomically-ish via rename.
  const staging = path.join(CAPTURE_UNPACK_DIR, `.unpack-${process.pid}`)
  fs.rmSync(staging, { recursive: true, force: true })
  fs.mkdirSync(staging, { recursive: true })
  try {
    await pipeline(
      fs.createReadStream(archive),
      zlib.createZstdDecompress({ params: ZSTD_UNPACK_PARAMS }),
      tar.extract({ cwd: staging }),
    )
    // A concurrent unpack (parallel Playwright projects) may have won the rename race;
    // treat "target appeared meanwhile" as success and keep whichever landed first.
    if (!fs.existsSync(target)) fs.renameSync(path.join(staging, session), target)
    console.log(`[capture-fixtures] unpacked ${session} -> ${target}`)
    return target
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

/** All session names that have a committed archive. */
export const listArchivedSessions = () => (fs.existsSync(CAPTURE_ARCHIVE_DIR)
  ? fs.readdirSync(CAPTURE_ARCHIVE_DIR).filter((f) => f.endsWith('.tar.zst')).map((f) => f.slice(0, -'.tar.zst'.length))
  : [])

// ── CLI ──────────────────────────────────────────────────────────────────────────
// Only act on argv when executed directly (`node capture-fixtures.mjs ...`); when
// imported as a library (Playwright specs), argv belongs to the importer.
// fileURLToPath (not URL.pathname) so the comparison also holds on Windows drive paths.
const isCliEntry = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
const [, , command, ...args] = isCliEntry ? process.argv : []
if (command === 'pack') {
  if (args.length === 0) { console.error('usage: capture-fixtures.mjs pack <sessionDirOrName>...'); process.exit(2) }
  for (const a of args) await packCaptureSession(a)
} else if (command === 'unpack') {
  // No args = materialize every committed archive (used before full e2e runs).
  const sessions = args.length > 0 ? args : listArchivedSessions()
  if (sessions.length === 0) console.log('[capture-fixtures] no committed capture archives found')
  for (const s of sessions) await ensureCaptureSession(s)
} else if (command !== undefined) {
  console.error(`unknown command "${command}" (expected pack|unpack)`)
  process.exit(2)
}
