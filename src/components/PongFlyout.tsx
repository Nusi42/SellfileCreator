/**
 * PongFlyout — Easter-egg Pong game triggered by 10 rapid clicks on the
 * Final Sell toggle button.
 *
 * Layout: EasterEggFlyoutShell (title bar) + canvas (CW×SCALE × CH×SCALE px).
 * Player: left paddle, mouse-Y tracking. AI: right paddle, limited speed.
 * First side to WIN_SCORE points wins. Mount/unmount controls open state.
 *
 * Pong score = player_points × 100 + totalRallies (recorded on every game over).
 * High scores: top-10 in localStorage, shown on idle and game-over screens.
 * Screenshot: shell's camera button; watermark strip sized for 2× pixel density.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
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

/** Logical dimensions (drawing coordinates stay in these units). */
const CW = 400
const CH = 270

// ─── Gameplay constants ───────────────────────────────────────────────────────

const PADDLE_W = 10
const PADDLE_H = 64
const PADDLE_MARGIN = 14
const BALL_R = 6

const BALL_SPEED_INIT = 3.8
const BALL_SPEED_MAX  = 9
const SPEED_PER_HIT   = 0.28
const AI_SPEED        = 3.3
const WIN_SCORE       = 5

// ─── Colors ───────────────────────────────────────────────────────────────────

const C_BG           = '#0d1117'
const C_DIVIDER      = 'rgba(255,255,255,0.09)'
const C_PLAYER       = '#4ade80'
const C_AI           = '#f87171'
const C_BALL         = '#ffffff'
const C_SCORE_PLAYER = '#86efac'
const C_SCORE_AI     = '#fca5a5'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'playing' | 'won' | 'lost'

type Ball   = { x: number; y: number; vx: number; vy: number }
type Paddle = { y: number }
type Score  = { player: number; ai: number }

type GameState = {
  phase: Phase
  ball: Ball
  player: Paddle
  ai: Paddle
  score: Score
  /** Consecutive paddle contacts this rally; used to ramp ball speed. */
  rallyCount: number
  /** Total paddle contacts across the whole game; used for scoring. */
  totalRallies: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

function freshBall(towardAi: boolean): Ball {
  const vx = (towardAi ? 1 : -1) * BALL_SPEED_INIT
  const vy = (Math.random() > 0.5 ? 1 : -1) * BALL_SPEED_INIT * 0.55
  return { x: CW / 2, y: CH / 2, vx, vy }
}

function initState(): GameState {
  return {
    phase: 'idle',
    ball: freshBall(true),
    player: { y: CH / 2 },
    ai: { y: CH / 2 },
    score: { player: 0, ai: 0 },
    rallyCount: 0,
    totalRallies: 0,
  }
}

/** Pong leaderboard score: player points × 100 + total rallies. */
function computePongScore(state: GameState): number {
  return state.score.player * 100 + state.totalRallies
}

// ─── Canvas drawing ───────────────────────────────────────────────────────────

function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  phase: Phase,
  scores: readonly ScoreEntry[],
  animTick: number,
) {
  // Apply 2× scale so all logical-pixel drawing commands render at full density.
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)

  const { ball, player, ai, score } = state

  ctx.fillStyle = C_BG
  ctx.fillRect(0, 0, CW, CH)

  // Dashed centre court divider.
  ctx.save()
  ctx.setLineDash([6, 7])
  ctx.strokeStyle = C_DIVIDER
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(CW / 2, 0)
  ctx.lineTo(CW / 2, CH)
  ctx.stroke()
  ctx.restore()

  // Score digits near the top.
  ctx.font         = 'bold 22px monospace'
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle    = C_SCORE_PLAYER
  ctx.fillText(String(score.player), CW / 2 - 44, 8)
  ctx.fillStyle = C_SCORE_AI
  ctx.fillText(String(score.ai), CW / 2 + 44, 8)

  // Dim game elements 55 % in idle so the overlay reads clearly.
  const dimAlpha = phase === 'idle' ? 0.45 : 1

  ctx.globalAlpha = dimAlpha
  ctx.fillStyle = C_PLAYER
  ctx.fillRect(PADDLE_MARGIN, player.y - PADDLE_H / 2, PADDLE_W, PADDLE_H)
  ctx.fillStyle = C_AI
  ctx.fillRect(CW - PADDLE_MARGIN - PADDLE_W, ai.y - PADDLE_H / 2, PADDLE_W, PADDLE_H)
  ctx.fillStyle = C_BALL
  ctx.beginPath()
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  // Scores list starts just below the overlay hint text.
  const scoresY = CH / 2 + 50

  if (phase === 'idle') {
    drawFlyoutOverlay(ctx, CW, CH, 'PONG', 'Move mouse to control left paddle', 'Click to start')
    drawHighScoreList(ctx, scores, CW / 2, scoresY, { halfWidth: 160, animTick })
  } else if (phase === 'won') {
    drawFlyoutOverlay(ctx, CW, CH, 'YOU WIN!', `${score.player} – ${score.ai}`, 'Click to play again')
    drawHighScoreList(ctx, scores, CW / 2, scoresY, { halfWidth: 160, newScore: computePongScore(state), animTick })
  } else if (phase === 'lost') {
    drawFlyoutOverlay(ctx, CW, CH, 'YOU LOSE', `${score.player} – ${score.ai}`, 'Click to play again')
    drawHighScoreList(ctx, scores, CW / 2, scoresY, { halfWidth: 160, newScore: computePongScore(state), animTick })
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = Readonly<{ onClose: () => void }>

export default function PongFlyout({ onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')

  const stateRef    = useRef<GameState>(initState())
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const rafRef      = useRef<number>(0)
  const idleRafRef  = useRef<number>(0)      // slow idle/over animation loop (marquee)
  const mouseYRef   = useRef<number>(CH / 2)
  const scoresRef   = useRef<ScoreEntry[]>([])
  const dragRef     = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null)

  // ── Initial idle frame ───────────────────────────────────────────────────────

  useEffect(() => {
    scoresRef.current = getHighScores('pong')
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawFrame(ctx, stateRef.current, 'idle', scoresRef.current, 0)
    return () => {
      cancelAnimationFrame(rafRef.current)
      cancelAnimationFrame(idleRafRef.current)
    }
  }, [])

  // ── Idle / game-over marquee animation loop (10 fps) ─────────────────────────

  useEffect(() => {
    if (phase === 'playing') return  // game loop owns rendering while playing

    let active = true
    let last   = 0
    const FRAME_MS = 100  // ~10 fps is plenty for marquee text animation

    const tick = (now: number) => {
      if (!active) return
      if (now - last >= FRAME_MS) {
        last = now
        const ctx = canvasRef.current?.getContext('2d')
        if (ctx && stateRef.current.phase !== 'playing') {
          drawFrame(ctx, stateRef.current, stateRef.current.phase, scoresRef.current, now)
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

    function loop() {
      const state  = stateRef.current
      const canvas = canvasRef.current
      if (!canvas || state.phase !== 'playing') return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const half = PADDLE_H / 2

      // Player tracks mouse Y; mouse coords are already converted to logical px.
      state.player.y = clamp(mouseYRef.current, half, CH - half)
      state.ai.y    += clamp(state.ball.y - state.ai.y, -AI_SPEED, AI_SPEED)
      state.ai.y     = clamp(state.ai.y, half, CH - half)

      state.ball.x += state.ball.vx
      state.ball.y += state.ball.vy

      if (state.ball.y - BALL_R <= 0) {
        state.ball.y  = BALL_R
        state.ball.vy = Math.abs(state.ball.vy)
      } else if (state.ball.y + BALL_R >= CH) {
        state.ball.y  = CH - BALL_R
        state.ball.vy = -Math.abs(state.ball.vy)
      }

      // ── Player paddle collision (left) ──────────────────────────────────────
      const pRight = PADDLE_MARGIN + PADDLE_W
      if (
        state.ball.vx < 0 &&
        state.ball.x - BALL_R <= pRight &&
        state.ball.x + BALL_R >= PADDLE_MARGIN &&
        state.ball.y >= state.player.y - half &&
        state.ball.y <= state.player.y + half
      ) {
        const rel = (state.ball.y - state.player.y) / half
        const spd = clamp(Math.abs(state.ball.vx) + SPEED_PER_HIT, 0, BALL_SPEED_MAX)
        state.ball.vx   = spd
        state.ball.vy   = rel * spd * 0.85
        state.ball.x    = pRight + BALL_R
        state.rallyCount++
        state.totalRallies++
      }

      // ── AI paddle collision (right) ─────────────────────────────────────────
      const aLeft = CW - PADDLE_MARGIN - PADDLE_W
      if (
        state.ball.vx > 0 &&
        state.ball.x + BALL_R >= aLeft &&
        state.ball.x - BALL_R <= CW - PADDLE_MARGIN &&
        state.ball.y >= state.ai.y - half &&
        state.ball.y <= state.ai.y + half
      ) {
        const rel = (state.ball.y - state.ai.y) / half
        const spd = clamp(Math.abs(state.ball.vx) + SPEED_PER_HIT, 0, BALL_SPEED_MAX)
        state.ball.vx   = -spd
        state.ball.vy   = rel * spd * 0.85
        state.ball.x    = aLeft - BALL_R
        state.rallyCount++
        state.totalRallies++
      }

      // ── Scoring ────────────────────────────────────────────────────────────
      const endGame = (won: boolean) => {
        const p = won ? 'won' : 'lost'
        state.phase = p
        setPhase(p)
        recordHighScore('pong', computePongScore(state))
        scoresRef.current = getHighScores('pong')
        // Static final frame — idle loop will take over for marquee animation.
        drawFrame(ctx, state, p, scoresRef.current, 0)
      }

      if (state.ball.x + BALL_R < 0) {
        // Ball exited left → AI scores.
        state.score.ai++
        if (state.score.ai >= WIN_SCORE) { endGame(false); return }
        state.ball = freshBall(false)
        state.rallyCount = 0
      }

      if (state.ball.x - BALL_R > CW) {
        // Ball exited right → player scores.
        state.score.player++
        if (state.score.player >= WIN_SCORE) { endGame(true); return }
        state.ball = freshBall(true)
        state.rallyCount = 0
      }

      drawFrame(ctx, state, 'playing', scoresRef.current, 0)
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
  }, [])

  const startGame = useCallback(() => {
    cancelAnimationFrame(idleRafRef.current)
    stateRef.current = { ...initState(), phase: 'playing' }
    setPhase('playing')
    startLoop()
  }, [startLoop])

  // ── Input handlers ────────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    // Convert CSS pixels to logical pixels (canvas is rendered at SCALE× density).
    if (rect) mouseYRef.current = (e.clientY - rect.top) / SCALE
  }, [])

  const handleCanvasClick = useCallback(() => {
    const { phase: p } = stateRef.current
    if (p !== 'idle' && p !== 'won' && p !== 'lost') return
    startGame()
  }, [startGame])

  // Suppress unused-variable warning — dragRef is only read inside setPos callback.
  void dragRef

  return (
    <EasterEggFlyoutShell
      title="PONG"
      canvasRef={canvasRef}
      snapshotFilename="pong"
      pixelScale={SCALE}
      getStegExtra={() => `pong:score=${computePongScore(stateRef.current)}`}
      onClose={onClose}
    >
      <canvas
        ref={canvasRef}
        width={CW * SCALE}
        height={CH * SCALE}
        style={{
          display: 'block',
          cursor: phase === 'playing' ? 'none' : 'pointer',
        }}
        onMouseMove={handleMouseMove}
        onClick={handleCanvasClick}
      />
    </EasterEggFlyoutShell>
  )
}
