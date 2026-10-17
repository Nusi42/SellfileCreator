#!/usr/bin/env node
/**
 * encode-gif — turns the frames recorded by tests/readme/readme-media.spec.ts into
 * docs/readme/demo.gif (part of `npm run readme:media`).
 *
 * Small output by construction: one shared 255-colour palette for the whole animation, frames
 * scaled down by SCALE, identical consecutive frames merged into one longer delay, and frame
 * diffing — every pixel that did not change since the previous frame is written as the
 * transparent index, so a frame costs only what actually moved.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import gifenc from 'gifenc'

// gifenc ships CommonJS; take its functions off the default export.
const { GIFEncoder, quantize, applyPalette } = gifenc

const FRAMES_DIR = path.resolve('tmp/readme-media/frames')
const OUT = path.resolve('docs/readme/demo.gif')
// Output size relative to the recorded viewport (1280 → 960 px wide).
const SCALE = 0.75
// Palette slot reserved for "unchanged since the previous frame".
const TRANSPARENT = 255

const { frames, end } = JSON.parse(fs.readFileSync(path.join(FRAMES_DIR, 'frames.json'), 'utf8'))

// Box-filter downscale of an RGBA image (enough for UI captures).
function downscale(png) {
  const w = Math.round(png.width * SCALE)
  const h = Math.round(png.height * SCALE)
  const out = new Uint8ClampedArray(w * h * 4)
  const sx = png.width / w
  const sy = png.height / h
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0
      for (let yy = Math.floor(y * sy); yy < Math.min(png.height, Math.ceil((y + 1) * sy)); yy++) {
        for (let xx = Math.floor(x * sx); xx < Math.min(png.width, Math.ceil((x + 1) * sx)); xx++) {
          const i = (yy * png.width + xx) * 4
          r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n++
        }
      }
      const o = (y * w + x) * 4
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255
    }
  }
  return { w, h, rgba: out }
}

const images = frames.map((f) => downscale(PNG.sync.read(fs.readFileSync(path.join(FRAMES_DIR, f.file)))))
const { w, h } = images[0]

// One palette from a sample of frames (first, middle, last), padded so TRANSPARENT is free.
const sample = new Uint8ClampedArray(images[0].rgba.length * 3)
;[0, Math.floor(images.length / 2), images.length - 1].forEach((k, i) => sample.set(images[k].rgba, i * images[0].rgba.length))
const palette = quantize(sample, 255)
while (palette.length < 256) palette.push([0, 0, 0])

// Merge identical consecutive frames; delays come from the recorded timestamps.
const gif = GIFEncoder()
let prev = null
let pending = null
const flush = (delay) => {
  if (!pending) return
  gif.writeFrame(pending.index, w, h, { palette, delay: Math.max(20, Math.round(delay / 10) * 10), transparent: pending.diffed, transparentIndex: TRANSPARENT, repeat: 0 })
}
let written = 0
for (let k = 0; k < images.length; k++) {
  const index = applyPalette(images[k].rgba, palette)
  const startAt = frames[k].at
  if (prev && prev.every((v, i) => v === index[i])) continue // identical: the previous frame just lasts longer
  if (pending) { flush(startAt - pending.at); written++ }
  let out = index
  let diffed = false
  if (prev) {
    out = Uint8Array.from(index)
    for (let i = 0; i < out.length; i++) if (out[i] === prev[i]) out[i] = TRANSPARENT
    diffed = true
  }
  pending = { index: out, at: startAt, diffed }
  prev = index
}
flush(end - pending.at)
written++
gif.finish()
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, gif.bytes())
console.log(`[readme] ${OUT}: ${written} frames (${images.length} recorded), ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`)
