/**
 * icons.ts
 *
 * Utilities to build small inline icons used by the UI.
 */

/** Generate a small color-grid bitmap for the Manage Colors button. */
export function makeManageColorsIcon(): string {
  try {
    const c = document.createElement('canvas')
    c.width = 24; c.height = 24
    const ctx = c.getContext('2d')
    if (!ctx) return ''
    ctx.clearRect(0, 0, 24, 24)
    const colors = ['#8BC34A','#FF7043','#64B5F6','#BA68C8','#FFD54F','#80CBC4']
    let i = 0
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 3; x++) {
        ctx.fillStyle = colors[i++]!
        ctx.fillRect(3 + x*7, 4 + y*8, 6, 6)
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.strokeRect(2.5, 3.5, 19, 17)
    return c.toDataURL('image/png')
  } catch { return '' }
}

