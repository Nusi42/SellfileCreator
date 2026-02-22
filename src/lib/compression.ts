/**
 * compression.ts
 *
 * Gzip/ungzip helpers for both byte and base64 transport that work in browser
 * and Node contexts. Byte helpers are preferred for in-memory history storage;
 * base64 helpers remain for text-only persistence surfaces.
 */
import { gzipSync, gunzipSync, strFromU8, strToU8 } from 'fflate'

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64_LOOKUP = (() => {
  const table = new Int16Array(256).fill(-1)
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
    table[BASE64_ALPHABET.charCodeAt(i)] = i
  }
  table['='.charCodeAt(0)] = 0
  return table
})()

function encodeBase64(data: Uint8Array): string {
  if (typeof globalThis.btoa === 'function') {
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...chunk)
    }
    return globalThis.btoa(binary)
  }
  let out = ''
  for (let i = 0; i < data.length; i += 3) {
    const b0 = data[i]!
    const hasB1 = i + 1 < data.length
    const hasB2 = i + 2 < data.length
    const b1 = hasB1 ? data[i + 1]! : 0
    const b2 = hasB2 ? data[i + 2]! : 0
    const triplet = (b0 << 16) | (b1 << 8) | b2
    out += BASE64_ALPHABET[(triplet >> 18) & 0x3f]!
    out += BASE64_ALPHABET[(triplet >> 12) & 0x3f]!
    out += hasB1 ? BASE64_ALPHABET[(triplet >> 6) & 0x3f]! : '='
    out += hasB2 ? BASE64_ALPHABET[triplet & 0x3f]! : '='
  }
  return out
}

function decodeBase64(str: string): Uint8Array {
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(str)
    const len = binary.length
    const out = new Uint8Array(len)
    for (let i = 0; i < len; i += 1) {
      out[i] = binary.charCodeAt(i)
    }
    return out
  }
  const sanitized = str.replace(/[\r\n\s]/g, '')
  if (sanitized.length % 4 !== 0) throw new Error('Invalid base64 payload length.')
  const padding = sanitized.endsWith('==') ? 2 : sanitized.endsWith('=') ? 1 : 0
  const outputLength = (sanitized.length / 4) * 3 - padding
  const out = new Uint8Array(outputLength)
  let outIdx = 0
  for (let i = 0; i < sanitized.length; i += 4) {
    const c0 = BASE64_LOOKUP[sanitized.charCodeAt(i)]!
    const c1 = BASE64_LOOKUP[sanitized.charCodeAt(i + 1)]!
    const c2 = BASE64_LOOKUP[sanitized.charCodeAt(i + 2)]!
    const c3 = BASE64_LOOKUP[sanitized.charCodeAt(i + 3)]!
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) throw new Error('Invalid base64 character.')
    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3
    out[outIdx++] = (triple >> 16) & 0xff
    if (sanitized[i + 2] !== '=') out[outIdx++] = (triple >> 8) & 0xff
    if (sanitized[i + 3] !== '=') out[outIdx++] = triple & 0xff
  }
  return out
}

export function compressToBase64(text: string): { base64: string; byteLength: number } {
  const gzipped = compressToBytes(text)
  return { base64: encodeBase64(gzipped), byteLength: gzipped.length }
}

export function decompressFromBase64(base64: string): string {
  const raw = decodeBase64(base64)
  return decompressFromBytes(raw)
}

// Compress plain text into gzipped bytes for efficient in-memory storage.
export function compressToBytes(text: string): Uint8Array {
  const raw = strToU8(text)
  return gzipSync(raw, { level: 6 })
}

// Expand gzipped bytes back into plain text.
export function decompressFromBytes(bytes: Uint8Array): string {
  const unzipped = gunzipSync(bytes)
  return strFromU8(unzipped)
}
