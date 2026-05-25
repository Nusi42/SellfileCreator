/**
 * snapshotSteg.ts
 *
 * Shared snapshot utilities: watermark text (SSOT for all callers) and
 * steganographic fingerprinting for app screenshots.
 *
 * Steg approach: encodes a UTF-8 message into the least-significant bit of
 * each pixel's red channel, MSB-first, one bit per pixel.  The modification
 * is perceptually invisible (±1/255 in red) and survives lossless PNG
 * round-trips.  Wire format: 4-byte big-endian message length + UTF-8 payload.
 */
import { APP_VERSION } from '../version'

// ─── Watermark text ───────────────────────────────────────────────────────────

/**
 * Builds the shared watermark / steg payload text for all snapshot callers:
 * "YYYY-MM-DD HH:MM UTC±H · Sellfile Creator vX.Y.Z"
 */
export function buildWatermarkText(now: Date, pad: (n: number) => string): string {
  const localTs   = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  const offsetMin = -now.getTimezoneOffset()
  const sign      = offsetMin >= 0 ? '+' : '-'
  const absH      = Math.floor(Math.abs(offsetMin) / 60)
  const absM      = Math.abs(offsetMin) % 60
  // UTC offset keeps shared screenshots unambiguous across timezones.
  const offsetStr = absM > 0 ? `UTC${sign}${absH}:${pad(absM)}` : `UTC${sign}${absH}`
  return `${localTs} ${offsetStr} · Sellfile Creator v${APP_VERSION}`
}

// ─── LSB steganography ────────────────────────────────────────────────────────

/** Maximum message bytes encodeable given the pixel count (4-byte header overhead). */
function maxPayloadBytes(pixelCount: number): number {
  return Math.floor(pixelCount / 8) - 4
}

/**
 * Encodes `message` into the LSBs of the R channel in `data` (mutates in-place).
 * Messages longer than the image can hold are silently truncated.
 */
export function encodeSteg(data: Uint8ClampedArray, message: string): void {
  const msgBytes   = new TextEncoder().encode(message)
  const maxBytes   = maxPayloadBytes(data.length / 4)
  const payloadLen = Math.min(msgBytes.length, maxBytes)

  // 4-byte big-endian length prefix + payload bytes.
  const buf = new Uint8Array(4 + payloadLen)
  new DataView(buf.buffer).setUint32(0, payloadLen, false)
  buf.set(msgBytes.subarray(0, payloadLen), 4)

  // Write each bit MSB-first into the R-channel LSB of consecutive pixels.
  let px = 0
  for (const byte of buf) {
    for (let bit = 7; bit >= 0; bit--) {
      data[px * 4] = (data[px * 4]! & ~1) | ((byte >> bit) & 1)
      px++
    }
  }
}

/**
 * Reads back the message encoded by `encodeSteg`.
 * Returns `null` if no valid fingerprint is found.
 */
export function decodeSteg(data: Uint8ClampedArray): string | null {
  const pixelCount = data.length / 4
  // Need at least 32 pixels for the 4-byte header.
  if (pixelCount < 32) return null

  // Reconstruct the big-endian 32-bit length from pixels 0–31.
  let msgLen = 0
  for (let i = 0; i < 32; i++) msgLen = (msgLen << 1) | (data[i * 4]! & 1)
  msgLen = msgLen >>> 0  // coerce to unsigned 32-bit

  if (msgLen === 0 || msgLen > maxPayloadBytes(pixelCount)) return null

  const msgBytes = new Uint8Array(msgLen)
  for (let b = 0; b < msgLen; b++) {
    let byte = 0
    for (let bit = 7; bit >= 0; bit--) {
      const px = (4 + b) * 8 + (7 - bit)
      byte |= (data[px * 4]! & 1) << bit
    }
    msgBytes[b] = byte
  }

  try {
    return new TextDecoder().decode(msgBytes)
  } catch {
    return null
  }
}

/** Returns a copy of `source` with `message` steg-encoded in the pixel data. */
export function encodeStegOnCanvas(source: HTMLCanvasElement, message: string): HTMLCanvasElement {
  const off  = document.createElement('canvas')
  off.width  = source.width
  off.height = source.height
  const ctx  = off.getContext('2d')!
  ctx.drawImage(source, 0, 0)
  const imageData = ctx.getImageData(0, 0, off.width, off.height)
  encodeSteg(imageData.data, message)
  ctx.putImageData(imageData, 0, 0)
  return off
}

/**
 * Loads `dataUrl`, steg-encodes `message`, and resolves to a new PNG dataUrl.
 */
export function encodeStegOnDataUrl(dataUrl: string, message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const off  = document.createElement('canvas')
      off.width  = img.width
      off.height = img.height
      const ctx  = off.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, off.width, off.height)
      encodeSteg(imageData.data, message)
      ctx.putImageData(imageData, 0, 0)
      resolve(off.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src     = dataUrl
  })
}
