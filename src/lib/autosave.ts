/**
 * autosave.ts
 *
 * LocalStorage-backed autosave utilities with CRC32 integrity.
 *
 * Why: Keep App.tsx focused on UI and state. Centralize how we persist and
 * verify autosave snapshots so both read and write paths are consistent and
 * easy to test.
 */

/** Compute CRC32 (uppercase hex) for a UTF-16 string. */
export function computeCrc32(s: string): string {
  let crc = 0 ^ -1
  for (let i = 0, l = s.length; i < l; i++) {
    const code = s.charCodeAt(i)
    const b = code & 0xff
    const idx = (crc ^ b) & 0xff
    crc = (crc >>> 8) ^ CRC32_TABLE[idx]!
  }
  crc = (crc ^ -1) >>> 0
  return crc.toString(16).padStart(8, '0').toUpperCase()
}

/**
 * Load and verify an autosave entry `[crc, payload]` from localStorage.
 *
 * An entry that fails any integrity check is IGNORED, not deleted: the reader reports "no
 * usable autosave" and leaves the bytes where they are. A failed check does not prove the
 * data is worthless — saveAutosave swallows write errors, so a write truncated by quota
 * exhaustion leaves a body that fails CRC on the very next boot, and deleting it there
 * destroyed the user's only copy. Ignoring costs nothing: the entry is unreadable either
 * way, and the session's next autosave write overwrites the key in place.
 */
export function loadAutosave<T = unknown>(key: string): { crc: string; payload: T } | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch {
      return null
    }
    if (!Array.isArray(parsed) || parsed.length < 2) return null
    const [crc, payload] = parsed
    if (typeof crc !== 'string') return null
    let dataStr: string
    try { dataStr = JSON.stringify(payload) } catch {
      return null
    }
    if (crc !== computeCrc32(dataStr)) return null
    return { crc, payload: payload as T }
  } catch {
    return null
  }
}

/** Save an autosave entry as `[crc, payload]` with integrity. */
export function saveAutosave<T>(key: string, payload: T): void {
  try {
    const dataStr = JSON.stringify(payload)
    const crc = computeCrc32(dataStr)
    localStorage.setItem(key, JSON.stringify([crc, payload]))
  } catch {
    // ignore write errors (private mode, quota, etc.)
  }
}

/** Remove an autosave entry safely. */
export function removeAutosave(key: string): void {
  try { localStorage.removeItem(key) } catch {}
}

// Precomputed CRC32 table (standard polynomial 0xEDB88320)
const CRC32_TABLE: number[] = (() => {
  const t: number[] = new Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()
