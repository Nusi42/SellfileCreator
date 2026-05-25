/**
 * TetrisFlyout.tsx
 *
 * Easter-egg Tetris game triggered by 10 rapid clicks on the Recipes toggle.
 *
 * Layout: EasterEggFlyoutShell (title bar) + canvas (CW×SCALE × CH×SCALE px).
 * Left: 10 × 20 play field. Right: PANEL_W sidebar (score / level / lines / next).
 *
 * Controls (phase = 'playing'):
 *   ArrowLeft / ArrowRight  : shift piece
 *   ArrowUp  / z / Z        : rotate clockwise (±2-col wall kicks)
 *   ArrowDown (hold)        : soft drop — faster fall, +1 pt per row
 *   Space                   : hard drop — instant lock, +2 pt per row dropped
 *   Enter (idle / over)     : start / restart
 *
 * High scores: top-10 in localStorage, shown on idle and game-over screens.
 * Screenshot: shell's camera button; watermark strip sized for 2× pixel density.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import EasterEggFlyoutShell from './EasterEggFlyoutShell'
import { drawFlyoutOverlay } from '../lib/easterEggCanvas'
import {
  type ScoreEntry,
  drawHighScoreList,
  getHighScores,
  recordHighScore,
} from '../lib/easterEggHighScores'

// ─── Scale & layout ───────────────────────────────────────────────────────────

/** Physical pixels per logical pixel. Doubles the displayed flyout size. */
const SCALE = 2

const CELL   = 20
const COLS   = 10
const ROWS   = 20
const GAME_W = COLS * CELL   // 200 logical px — play field width
const GAME_H = ROWS * CELL   // 400 logical px — play field height
const PANEL_W = 88           // sidebar width
const CW = GAME_W + PANEL_W  // 288
const CH = GAME_H            // 400

// ─── Drop timing ─────────────────────────────────────────────────────────────

const DROP_INTERVAL      = (level: number): number => Math.max(60, 1000 - (level - 1) * 85)
const SOFT_DROP_INTERVAL = 50
const LINES_PER_LEVEL    = 10

// ─── Scoring ─────────────────────────────────────────────────────────────────

const LINE_SCORES: readonly number[] = [0, 100, 300, 500, 800]

// ─── Colors ───────────────────────────────────────────────────────────────────

const C_BG    = '#0d1117'
const C_GRID  = 'rgba(255,255,255,0.05)'
const C_PANEL = '#111820'
const C_TEXT  = 'rgba(255,255,255,0.82)'
const C_LABEL = 'rgba(255,255,255,0.38)'
const C_GHOST = 'rgba(255,255,255,0.10)'

// ─── Tetrominoes ─────────────────────────────────────────────────────────────

type ShapeMatrix = ReadonlyArray<ReadonlyArray<number>>
type Tetromino   = { readonly shape: ShapeMatrix; readonly color: string }

const PIECES: readonly Tetromino[] = [
  { shape: [[1, 1, 1, 1]],          color: '#00e5e5' }, // I
  { shape: [[1, 1], [1, 1]],        color: '#e5d800' }, // O
  { shape: [[0, 1, 0], [1, 1, 1]],  color: '#b000e5' }, // T
  { shape: [[0, 1, 1], [1, 1, 0]],  color: '#00c800' }, // S
  { shape: [[1, 1, 0], [0, 1, 1]],  color: '#e50000' }, // Z
  { shape: [[1, 0, 0], [1, 1, 1]],  color: '#0050e5' }, // J
  { shape: [[0, 0, 1], [1, 1, 1]],  color: '#e58000' }, // L
]

function randomPiece(): Tetromino { return PIECES[Math.floor(Math.random() * PIECES.length)]! }

function rotateCW(shape: ShapeMatrix): number[][] {
  const rows = shape.length, cols = shape[0]!.length
  const out: number[][] = Array.from({ length: cols }, () => Array<number>(rows).fill(0))
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out[c]![rows - 1 - r] = shape[r]![c]!
  return out
}

// ─── Game types ───────────────────────────────────────────────────────────────

type Grid       = (string | null)[][]
type ActivePiece = { shape: number[][]; color: string; x: number; y: number }
type Phase       = 'idle' | 'playing' | 'over'

type GameState = {
  phase: Phase; grid: Grid; current: ActivePiece; next: Tetromino
  score: number; lines: number; level: number; dropAccum: number
}

// ─── Grid / piece helpers ─────────────────────────────────────────────────────

function emptyGrid(): Grid {
  return Array.from({ length: ROWS }, () => Array<string | null>(COLS).fill(null))
}

function fits(grid: Grid, shape: ShapeMatrix | number[][], x: number, y: number): boolean {
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r]!.length; c++) {
      if (!shape[r]![c]) continue
      const gc = x + c, gr = y + r
      if (gc < 0 || gc >= COLS || gr >= ROWS) return false
      if (gr >= 0 && grid[gr]![gc] !== null) return false
    }
  return true
}

function lockPiece(grid: Grid, piece: ActivePiece): Grid {
  const next = grid.map((row) => [...row]) as Grid
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r]!.length; c++) {
      if (!piece.shape[r]![c]) continue
      const gr = piece.y + r, gc = piece.x + c
      if (gr >= 0 && gr < ROWS && gc >= 0 && gc < COLS) next[gr]![gc] = piece.color
    }
  return next
}

function clearLines(grid: Grid): [Grid, number] {
  const remaining = grid.filter((row) => row.some((c) => c === null))
  const cleared   = ROWS - remaining.length
  const blanks    = Array.from({ length: cleared }, () => Array<string | null>(COLS).fill(null))
  return [[...blanks, ...remaining] as Grid, cleared]
}

function ghostY(grid: Grid, piece: ActivePiece): number {
  let y = piece.y
  while (fits(grid, piece.shape, piece.x, y + 1)) y++
  return y
}

function spawnPiece(t: Tetromino): ActivePiece {
  return { shape: t.shape.map((row) => [...row]), color: t.color,
           x: Math.floor((COLS - t.shape[0]!.length) / 2), y: -1 }
}

function initState(): GameState {
  return { phase: 'idle', grid: emptyGrid(), current: spawnPiece(randomPiece()),
           next: randomPiece(), score: 0, lines: 0, level: 1, dropAccum: 0 }
}

/** Locks piece, clears lines, spawns next. Returns true on game over. */
function lockAndSpawn(state: GameState): boolean {
  state.grid = lockPiece(state.grid, state.current)
  const [newGrid, cleared] = clearLines(state.grid)
  state.grid   = newGrid
  state.lines += cleared
  state.level  = Math.floor(state.lines / LINES_PER_LEVEL) + 1
  state.score += (LINE_SCORES[cleared] ?? 0) * state.level
  const nextT = state.next
  state.next    = randomPiece()
  state.current = spawnPiece(nextT)
  state.dropAccum = 0
  return !fits(state.grid, state.current.shape, state.current.x, state.current.y)
}

// ─── Canvas drawing ───────────────────────────────────────────────────────────

function drawCell(ctx: CanvasRenderingContext2D, col: number, row: number, color: string, alpha = 1) {
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(col * CELL + 1, row * CELL + 1, CELL - 2, CELL - 2)
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fillRect(col * CELL + 2, row * CELL + 2, CELL - 4, 4)
  ctx.globalAlpha = 1
}

function drawPlayField(ctx: CanvasRenderingContext2D, grid: Grid) {
  ctx.fillStyle = C_BG
  ctx.fillRect(0, 0, GAME_W, GAME_H)
  ctx.strokeStyle = C_GRID
  ctx.lineWidth = 1
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(GAME_W, r * CELL); ctx.stroke()
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, GAME_H); ctx.stroke()
  }
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const color = grid[r]![c]
      if (color) drawCell(ctx, c, r, color)
    }
}

function drawGhostPiece(ctx: CanvasRenderingContext2D, grid: Grid, piece: ActivePiece) {
  const gy = ghostY(grid, piece)
  if (gy === piece.y) return
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r]!.length; c++) {
      if (!piece.shape[r]![c]) continue
      ctx.fillStyle = C_GHOST
      ctx.fillRect((piece.x + c) * CELL + 1, (gy + r) * CELL + 1, CELL - 2, CELL - 2)
    }
}

function drawActivePiece(ctx: CanvasRenderingContext2D, piece: ActivePiece, alpha = 1) {
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r]!.length; c++) {
      if (!piece.shape[r]![c] || piece.y + r < 0) continue
      drawCell(ctx, piece.x + c, piece.y + r, piece.color, alpha)
    }
}

function drawPanel(ctx: CanvasRenderingContext2D, state: GameState) {
  ctx.fillStyle = C_PANEL
  ctx.fillRect(GAME_W, 0, PANEL_W, CH)
  const cx = GAME_W + PANEL_W / 2

  function stat(label: string, value: string, top: number) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.font = '9px monospace'; ctx.fillStyle = C_LABEL
    ctx.fillText(label, cx, top)
    ctx.font = 'bold 16px monospace'; ctx.fillStyle = C_TEXT
    ctx.fillText(value, cx, top + 12)
  }

  stat('SCORE', String(state.score), 14)
  stat('LEVEL', String(state.level), 54)
  stat('LINES', String(state.lines), 90)

  ctx.font = '9px monospace'; ctx.fillStyle = C_LABEL
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('NEXT', cx, 132)

  const np = state.next, PC = 14
  const sx = GAME_W + (PANEL_W - np.shape[0]!.length * PC) / 2
  for (let r = 0; r < np.shape.length; r++)
    for (let c = 0; c < np.shape[r]!.length; c++) {
      if (!np.shape[r]![c]) continue
      ctx.fillStyle = np.color
      ctx.fillRect(sx + c * PC + 1, 148 + r * PC + 1, PC - 2, PC - 2)
      ctx.fillStyle = 'rgba(255,255,255,0.22)'
      ctx.fillRect(sx + c * PC + 2, 148 + r * PC + 2, PC - 4, 4)
    }
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  scores: readonly ScoreEntry[],
  animTick: number,
) {
  // Apply 2× scale so all logical-pixel drawing commands render at full density.
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)

  drawPlayField(ctx, state.grid)

  const scoresY = GAME_H / 2 + 52

  if (state.phase === 'playing') {
    drawGhostPiece(ctx, state.grid, state.current)
    drawActivePiece(ctx, state.current)
  } else if (state.phase === 'idle') {
    drawActivePiece(ctx, state.current, 0.45)
    drawFlyoutOverlay(ctx, GAME_W, GAME_H, 'TETRIS', 'Arrow keys  ·  Space to drop', 'Click or Enter to start')
    drawHighScoreList(ctx, scores, GAME_W / 2, scoresY, { halfWidth: 88, animTick })
  } else {
    drawFlyoutOverlay(ctx, GAME_W, GAME_H, 'GAME OVER', `Score  ${state.score}`, 'Click or Enter to restart')
    drawHighScoreList(ctx, scores, GAME_W / 2, scoresY, { halfWidth: 88, newScore: state.score, animTick })
  }
  drawPanel(ctx, state)
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = Readonly<{ onClose: () => void }>

export default function TetrisFlyout({ onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')

  const stateRef    = useRef<GameState>(initState())
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const rafRef      = useRef<number>(0)
  const idleRafRef  = useRef<number>(0)
  const softDropRef = useRef(false)
  const scoresRef   = useRef<ScoreEntry[]>([])

  // ── Initial idle frame ───────────────────────────────────────────────────────

  useEffect(() => {
    scoresRef.current = getHighScores('tetris')
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawFrame(ctx, stateRef.current, scoresRef.current, 0)
    return () => {
      cancelAnimationFrame(rafRef.current)
      cancelAnimationFrame(idleRafRef.current)
    }
  }, [])

  // ── Idle / game-over marquee animation loop (10 fps) ─────────────────────────

  useEffect(() => {
    if (phase === 'playing') return

    let active = true
    let last   = 0
    const FRAME_MS = 100

    const tick = (now: number) => {
      if (!active) return
      if (now - last >= FRAME_MS) {
        last = now
        const ctx = canvasRef.current?.getContext('2d')
        if (ctx && stateRef.current.phase !== 'playing') {
          drawFrame(ctx, stateRef.current, scoresRef.current, now)
        }
      }
      idleRafRef.current = requestAnimationFrame(tick)
    }
    idleRafRef.current = requestAnimationFrame(tick)

    return () => {
      active = false
      cancelAnimationFrame(idleRafRef.current)
    }
  }, [phase])

  // ── RAF game loop ─────────────────────────────────────────────────────────────

  const startLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    let lastTime = performance.now()

    function loop(now: number) {
      const state  = stateRef.current
      const canvas = canvasRef.current
      if (!canvas || state.phase !== 'playing') return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dt = now - lastTime
      lastTime = now
      const interval = softDropRef.current ? SOFT_DROP_INTERVAL : DROP_INTERVAL(state.level)
      state.dropAccum += dt

      if (state.dropAccum >= interval) {
        state.dropAccum = 0
        if (fits(state.grid, state.current.shape, state.current.x, state.current.y + 1)) {
          state.current.y++
          if (softDropRef.current) state.score++
        } else {
          if (lockAndSpawn(state)) {
            state.phase = 'over'
            setPhase('over')
            recordHighScore('tetris', state.score)
            scoresRef.current = getHighScores('tetris')
            drawFrame(ctx, state, scoresRef.current, 0)
            return
          }
        }
      }

      drawFrame(ctx, state, scoresRef.current, 0)
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
  }, [])

  const startGame = useCallback(() => {
    cancelAnimationFrame(idleRafRef.current)
    stateRef.current    = { ...initState(), phase: 'playing' }
    softDropRef.current = false
    setPhase('playing')
    startLoop()
  }, [startLoop])

  // ── Keyboard input ────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const state = stateRef.current
      if (e.key === 'Enter' && state.phase !== 'playing') { startGame(); return }
      if (state.phase !== 'playing') return

      const { current, grid } = state

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          if (fits(grid, current.shape, current.x - 1, current.y)) current.x--
          break
        case 'ArrowRight':
          e.preventDefault()
          if (fits(grid, current.shape, current.x + 1, current.y)) current.x++
          break
        case 'ArrowDown':
          e.preventDefault()
          softDropRef.current = true
          break
        case 'ArrowUp': case 'z': case 'Z': {
          e.preventDefault()
          const rotated = rotateCW(current.shape)
          for (const dx of [0, -1, 1, -2, 2]) {
            if (fits(grid, rotated, current.x + dx, current.y)) {
              current.shape = rotated; current.x += dx; break
            }
          }
          break
        }
        case ' ': {
          e.preventDefault()
          const dropRow = ghostY(grid, current)
          state.score += (dropRow - current.y) * 2
          current.y = dropRow
          if (lockAndSpawn(state)) {
            state.phase = 'over'
            setPhase('over')
            recordHighScore('tetris', state.score)
            scoresRef.current = getHighScores('tetris')
            const ovCtx = canvasRef.current?.getContext('2d')
            if (ovCtx) drawFrame(ovCtx, state, scoresRef.current, 0)
            cancelAnimationFrame(rafRef.current)
          }
          break
        }
        default: break
      }
    }

    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'ArrowDown') softDropRef.current = false }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup',   onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup',   onKeyUp)
    }
  }, [startGame])

  const handleCanvasClick = useCallback(() => {
    const p = stateRef.current.phase
    if (p === 'idle' || p === 'over') startGame()
  }, [startGame])

  return (
    <EasterEggFlyoutShell
      title="TETRIS"
      canvasRef={canvasRef}
      snapshotFilename="tetris"
      pixelScale={SCALE}
      getStegExtra={() => `tetris:score=${stateRef.current.score}`}
      onClose={onClose}
    >
      <canvas
        ref={canvasRef}
        width={CW * SCALE}
        height={CH * SCALE}
        style={{
          display: 'block',
          cursor: (phase === 'idle' || phase === 'over') ? 'pointer' : 'default',
        }}
        onClick={handleCanvasClick}
      />
    </EasterEggFlyoutShell>
  )
}
