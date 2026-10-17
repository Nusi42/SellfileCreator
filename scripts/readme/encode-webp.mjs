#!/usr/bin/env node
/**
 * encode-webp — turns the frames recorded by tests/readme/readme-media.spec.ts into the animated
 * docs/readme/demo.webp (part of `npm run readme:media`).
 *
 * Animated WebP instead of GIF: full colour (no 256-colour palette), crisp text, and several
 * times smaller; GitHub shows it through a plain <img>. Encoding uses `img2webp` from Google's
 * libwebp tools, which the `webp-converter` dev dependency ships for Windows, Linux and macOS;
 * IMG2WEBP may point at another copy.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const FRAMES_DIR = path.resolve('tmp/readme-media/frames')
const OUT = path.resolve('docs/readme/demo.webp')
const IMG2WEBP = process.env.IMG2WEBP || bundledImg2webp()
// Lossy quality: high enough that UI text stays sharp.
const QUALITY = '85'
// Shortest frame duration browsers honour reliably (ms).
const MIN_DELAY = 20

const { frames, end } = JSON.parse(fs.readFileSync(path.join(FRAMES_DIR, 'frames.json'), 'utf8'))
// Each frame lasts until the next one was recorded (the last one until the recording ended).
const args = ['-loop', '0', '-lossy', '-q', QUALITY, '-m', '6']
frames.forEach((f, i) => {
  const until = i + 1 < frames.length ? frames[i + 1].at : end
  args.push('-d', String(Math.max(MIN_DELAY, until - f.at)), path.join(FRAMES_DIR, f.file))
})
args.push('-o', OUT)
fs.mkdirSync(path.dirname(OUT), { recursive: true })
try {
  execFileSync(IMG2WEBP, args, { stdio: ['ignore', 'ignore', 'pipe'] })
} catch (error) {
  console.error(`[readme] img2webp failed (${IMG2WEBP}); run npm install, or set IMG2WEBP to an img2webp binary.`)
  throw error
}
console.log(`[readme] ${OUT}: ${frames.length} frames, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`)

// img2webp inside the webp-converter package, for this platform (npm scripts run from the
// repository root; the package exports no paths to resolve its files by).
function bundledImg2webp() {
  const root = path.resolve('node_modules', 'webp-converter')
  const dir = {
    win32: 'libwebp_win64',
    linux: 'libwebp_linux',
    darwin: process.arch === 'arm64' ? 'libwebp_osx_arm64' : 'libwebp_osx',
  }[process.platform]
  if (!dir) throw new Error(`[readme] no bundled img2webp for ${process.platform}; set IMG2WEBP`)
  return path.join(root, 'bin', dir, 'bin', process.platform === 'win32' ? 'img2webp.exe' : 'img2webp')
}
