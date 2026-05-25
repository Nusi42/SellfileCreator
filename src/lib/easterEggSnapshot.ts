/**
 * easterEggSnapshot.ts
 *
 * Screenshot utility for canvas-based Easter egg games (Pong, Tetris).
 * Overlays a subtle right-aligned timestamp watermark — same opacity and style
 * as the Gear Analytics DOM watermark — then embeds a steganographic
 * fingerprint before delivering the PNG to the clipboard or file download.
 */
import { buildWatermarkText, encodeSteg } from './snapshotSteg'

// Re-export so existing callers that imported buildWatermarkText from here
// don't need updating.
export { buildWatermarkText }

/**
 * Draws a subtle, right-aligned timestamp at the bottom of the canvas.
 * Opacity and scale match the Gear Analytics DOM watermark (0.35 / ~9 pt).
 */
function drawSubtleWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pixelScale: number,
): void {
  const now      = new Date()
  const pad      = (n: number) => String(n).padStart(2, '0')
  const fontSize = Math.round(9 * pixelScale)

  ctx.save()
  ctx.font         = `${fontSize}px monospace`
  ctx.fillStyle    = 'rgba(255,255,255,0.35)'
  ctx.textAlign    = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText(buildWatermarkText(now, pad), width - 4 * pixelScale, height - 3 * pixelScale)
  ctx.restore()
}

/**
 * Captures `canvas`, overlays a subtle timestamp watermark, encodes a
 * steganographic fingerprint, and delivers the PNG to the clipboard or as a
 * file download. Returns true on success.
 *
 * @param canvas       The live game canvas.
 * @param filename     Base filename (no extension) for the download fallback.
 * @param canCopy      Whether navigator.clipboard.write is available.
 * @param pixelScale   Physical-pixel scale of the canvas (default 1; pass 2 for 2× games).
 * @param stegExtra    Optional string appended to the steg payload after a colon
 *                     (e.g. "pong:score=500") for score verification.
 */
export async function captureEasterEggSnapshot(
  canvas: HTMLCanvasElement,
  filename: string,
  canCopy: boolean,
  pixelScale = 1,
  stegExtra?: string,
): Promise<boolean> {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')

  // Copy the game canvas so we don't mutate the live frame.
  const off  = document.createElement('canvas')
  off.width  = canvas.width
  off.height = canvas.height
  const ctx  = off.getContext('2d')!
  ctx.drawImage(canvas, 0, 0)

  // Overlay the visible watermark text.
  drawSubtleWatermark(ctx, canvas.width, canvas.height, pixelScale)

  // Embed the steg fingerprint: watermark text + optional score extra.
  const base    = buildWatermarkText(now, pad)
  const payload = stegExtra ? `${base}:${stegExtra}` : base
  const imgData = ctx.getImageData(0, 0, off.width, off.height)
  encodeSteg(imgData.data, payload)
  ctx.putImageData(imgData, 0, 0)

  try {
    if (canCopy) {
      const blob = await new Promise<Blob | null>((res) => off.toBlob(res, 'image/png'))
      if (!blob) return false
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } else {
      // Plain http:// fallback: trigger a timestamped file download.
      const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
      const a  = document.createElement('a')
      a.href     = off.toDataURL('image/png')
      a.download = `${filename}-${ts}.png`
      a.click()
    }
    return true
  } catch (err) {
    console.error(`[easter-egg] snapshot failed for ${filename}`, err)
    return false
  }
}
