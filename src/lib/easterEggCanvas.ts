/**
 * easterEggCanvas.ts
 *
 * Shared canvas drawing utilities for Easter egg game flyouts (Pong, Tetris).
 * All coordinates are in logical pixels; callers apply ctx.setTransform(SCALE,…)
 * before invoking these functions so physical rendering scales automatically.
 */

// ─── Overlay ──────────────────────────────────────────────────────────────────

/**
 * Draws a semi-transparent scrim over the game area and three centred text
 * lines (headline / subline / hint). Used for idle, won, lost, and game-over
 * screens in both Pong and Tetris.
 *
 * @param width  Logical width of the area to cover (game field only, not panel).
 * @param height Logical height of the area to cover.
 */
export function drawFlyoutOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  headline: string,
  subline: string,
  hint: string,
): void {
  // Scrim darkens the game elements below so text is readable.
  ctx.fillStyle = 'rgba(13,17,23,0.76)'
  ctx.fillRect(0, 0, width, height)

  const cx = width  / 2
  const cy = height / 2

  ctx.save()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'

  ctx.font      = 'bold 28px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.fillText(headline, cx, cy - 22)

  ctx.font      = '14px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.60)'
  ctx.fillText(subline, cx, cy + 12)

  ctx.font      = '11px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.32)'
  ctx.fillText(hint, cx, cy + 34)

  ctx.restore()
}
