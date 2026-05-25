/**
 * PongFlyout — Easter-egg Pong game triggered by 10 rapid clicks on the
 * builder's sell/export button. Renders as a small draggable non-modal panel
 * (fixed-position Paper) that floats on top of the rest of the UI.
 *
 * Layout:  title bar (40 px drag handle + close) + canvas (400 × 270 px).
 * Player: left paddle, mouse-Y tracking. AI: right paddle, limited speed.
 * First side to WIN_SCORE points wins. Mount/unmount controls open state.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import SportsEsportsIcon from '@mui/icons-material/SportsEsports'

// ─── Canvas / layout ─────────────────────────────────────────────────────────

const CW = 400           // canvas width in pixels
const CH = 270           // canvas height in pixels
const HEADER_H = 40      // title-bar height in pixels

// ─── Gameplay constants ───────────────────────────────────────────────────────

const PADDLE_W = 10
const PADDLE_H = 64
const PADDLE_MARGIN = 14   // px from edge to near face of paddle
const BALL_R = 6

const BALL_SPEED_INIT = 3.8    // px/frame at serve
const BALL_SPEED_MAX = 9       // hard cap so the ball stays hittable
const SPEED_PER_HIT = 0.28     // speed added to the ball on each paddle contact
const AI_SPEED = 3.3           // max px/frame the AI paddle can move (beatable)
const WIN_SCORE = 5            // first to this wins

// ─── Color palette (fixed; not theme-dependent — must read well on dark bg) ──

const C_BG = '#0d1117'
const C_DIVIDER = 'rgba(255,255,255,0.09)'
const C_PLAYER = '#4ade80'          // green — player's left paddle
const C_AI = '#f87171'              // red   — AI's right paddle
const C_BALL = '#ffffff'
const C_SCORE_PLAYER = '#86efac'    // lighter green for score digit
const C_SCORE_AI = '#fca5a5'        // lighter red   for score digit

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'playing' | 'won' | 'lost'

type Ball = { x: number; y: number; vx: number; vy: number }
/** Paddle position tracked by the y of its centre; x is derived from constants. */
type Paddle = { y: number }
type Score = { player: number; ai: number }

type GameState = {
  phase: Phase
  ball: Ball
  player: Paddle
  ai: Paddle
  score: Score
  /** Consecutive paddle contacts this rally; used to ramp difficulty. */
  rallyCount: number
}

// ─── Game helpers ─────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

/** Build a ball that launches from centre toward the given side. */
function freshBall(towardAi: boolean): Ball {
  // Slight random vertical component makes each serve feel different.
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
  }
}

// ─── Canvas drawing ───────────────────────────────────────────────────────────

/** Draw the complete frame for the given phase. Called every RAF tick and on phase changes. */
function drawFrame(ctx: CanvasRenderingContext2D, state: GameState, phase: Phase) {
  const { ball, player, ai, score } = state

  // Full background wipe.
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

  // Score digits sit near the top, one on each side of centre.
  ctx.font = 'bold 22px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = C_SCORE_PLAYER
  ctx.fillText(String(score.player), CW / 2 - 44, 8)
  ctx.fillStyle = C_SCORE_AI
  ctx.fillText(String(score.ai), CW / 2 + 44, 8)

  // Dim elements 55 % in idle so the overlay text reads clearly over them.
  const dimAlpha = phase === 'idle' ? 0.45 : 1

  // Player paddle (left side).
  ctx.globalAlpha = dimAlpha
  ctx.fillStyle = C_PLAYER
  ctx.fillRect(PADDLE_MARGIN, player.y - PADDLE_H / 2, PADDLE_W, PADDLE_H)

  // AI paddle (right side).
  ctx.fillStyle = C_AI
  ctx.fillRect(CW - PADDLE_MARGIN - PADDLE_W, ai.y - PADDLE_H / 2, PADDLE_W, PADDLE_H)

  // Ball — dimmed in idle so it reads as "preview" rather than live play.
  ctx.fillStyle = C_BALL
  ctx.beginPath()
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  // Phase-specific overlays drawn on top of the game elements.
  if (phase === 'idle') {
    drawOverlay(ctx, 'PONG', 'Move mouse to control left paddle', 'Click to start')
  } else if (phase === 'won') {
    drawOverlay(ctx, 'YOU WIN!', `${score.player} – ${score.ai}`, 'Click to play again')
  } else if (phase === 'lost') {
    drawOverlay(ctx, 'YOU LOSE', `${score.player} – ${score.ai}`, 'Click to play again')
  }
}

/** Semi-transparent scrim + centred three-line text block. */
function drawOverlay(
  ctx: CanvasRenderingContext2D,
  headline: string,
  subline: string,
  hint: string,
) {
  // Scrim darkens the game below so text is readable.
  ctx.fillStyle = 'rgba(13,17,23,0.72)'
  ctx.fillRect(0, 0, CW, CH)

  const cx = CW / 2
  const cy = CH / 2

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Large headline.
  ctx.font = 'bold 30px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.fillText(headline, cx, cy - 22)

  // Secondary line (score or instructions).
  ctx.font = '15px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.60)'
  ctx.fillText(subline, cx, cy + 12)

  // Tertiary hint — faintest.
  ctx.font = '12px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.36)'
  ctx.fillText(hint, cx, cy + 36)
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = Readonly<{ onClose: () => void }>

/**
 * PongFlyout — mount when open, unmount when closed.
 * Caller controls visibility via conditional render: `{open && <PongFlyout onClose={…} />}`.
 * This keeps internal state and the RAF loop naturally scoped to the open window.
 */
export default function PongFlyout({ onClose }: Props) {
  // Flyout screen position; initialised to the viewport centre.
  const [pos, setPos] = useState(() => ({
    x: Math.max(8, (window.innerWidth - CW) / 2),
    y: Math.max(8, (window.innerHeight - CH - HEADER_H) / 2),
  }))

  // Phase drives cursor style only; game progress lives in stateRef.
  const [phase, setPhase] = useState<Phase>('idle')

  // All mutable game data stays in a ref so updates never trigger re-renders.
  const stateRef = useRef<GameState>(initState())
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Current mouse Y relative to the canvas top edge, updated each mousemove.
  const mouseYRef = useRef<number>(CH / 2)

  // Active RAF animation ID; cancelled on unmount and when the game ends.
  const rafRef = useRef<number>(0)

  // Drag-start snapshot; null when not dragging.
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null)

  // ── Initial idle frame ──────────────────────────────────────────────────────

  // Draw the static idle canvas once after mount (canvas is not yet painted at this point).
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawFrame(ctx, stateRef.current, 'idle')
    // Cancel any lingering RAF on unmount.
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // ── RAF game loop ──────────────────────────────────────────────────────────

  /**
   * Start the game loop. Called directly from the canvas click handler so the
   * RAF lifecycle is driven by user events rather than effects.
   */
  const startLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)

    function loop() {
      const state = stateRef.current
      const canvas = canvasRef.current
      // Exit loop if the game ended from inside (won/lost) or canvas unmounted.
      if (!canvas || state.phase !== 'playing') return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const half = PADDLE_H / 2

      // Player paddle tracks mouse Y directly — 1:1 response, no smoothing.
      state.player.y = clamp(mouseYRef.current, half, CH - half)

      // AI chases the ball centre with a per-frame speed cap so it stays beatable.
      state.ai.y += clamp(state.ball.y - state.ai.y, -AI_SPEED, AI_SPEED)
      state.ai.y = clamp(state.ai.y, half, CH - half)

      // Advance ball position.
      state.ball.x += state.ball.vx
      state.ball.y += state.ball.vy

      // Top / bottom wall bounces.
      if (state.ball.y - BALL_R <= 0) {
        state.ball.y = BALL_R
        state.ball.vy = Math.abs(state.ball.vy)
      } else if (state.ball.y + BALL_R >= CH) {
        state.ball.y = CH - BALL_R
        state.ball.vy = -Math.abs(state.ball.vy)
      }

      // ── Player paddle collision (left) ────────────────────────────────────
      const pRight = PADDLE_MARGIN + PADDLE_W
      const pTop = state.player.y - half
      const pBot = state.player.y + half

      if (
        state.ball.vx < 0 &&
        state.ball.x - BALL_R <= pRight &&
        state.ball.x + BALL_R >= PADDLE_MARGIN &&
        state.ball.y >= pTop &&
        state.ball.y <= pBot
      ) {
        // Angle rebound by relative hit position on the paddle face.
        const rel = (state.ball.y - state.player.y) / half
        const spd = clamp(Math.abs(state.ball.vx) + SPEED_PER_HIT, 0, BALL_SPEED_MAX)
        state.ball.vx = spd
        state.ball.vy = rel * spd * 0.85
        state.ball.x = pRight + BALL_R   // push clear to prevent double-hit
        state.rallyCount++
      }

      // ── AI paddle collision (right) ───────────────────────────────────────
      const aLeft = CW - PADDLE_MARGIN - PADDLE_W
      const aTop = state.ai.y - half
      const aBot = state.ai.y + half

      if (
        state.ball.vx > 0 &&
        state.ball.x + BALL_R >= aLeft &&
        state.ball.x - BALL_R <= CW - PADDLE_MARGIN &&
        state.ball.y >= aTop &&
        state.ball.y <= aBot
      ) {
        const rel = (state.ball.y - state.ai.y) / half
        const spd = clamp(Math.abs(state.ball.vx) + SPEED_PER_HIT, 0, BALL_SPEED_MAX)
        state.ball.vx = -spd
        state.ball.vy = rel * spd * 0.85
        state.ball.x = aLeft - BALL_R
        state.rallyCount++
      }

      // ── Scoring ────────────────────────────────────────────────────────────

      if (state.ball.x + BALL_R < 0) {
        // Ball exited left → AI scores.
        state.score.ai++
        if (state.score.ai >= WIN_SCORE) {
          state.phase = 'lost'
          setPhase('lost')
          drawFrame(ctx, state, 'lost')
          return   // stop loop; final frame already drawn
        }
        state.ball = freshBall(false)   // serve toward player
        state.rallyCount = 0
      }

      if (state.ball.x - BALL_R > CW) {
        // Ball exited right → player scores.
        state.score.player++
        if (state.score.player >= WIN_SCORE) {
          state.phase = 'won'
          setPhase('won')
          drawFrame(ctx, state, 'won')
          return
        }
        state.ball = freshBall(true)   // serve toward AI
        state.rallyCount = 0
      }

      drawFrame(ctx, state, 'playing')
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
  }, [])

  // ── Input handlers ────────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    // Raw Y relative to the canvas top so the loop can read it each frame.
    if (rect) mouseYRef.current = e.clientY - rect.top
  }, [])

  const handleCanvasClick = useCallback(() => {
    const { phase: p } = stateRef.current
    // Only accept clicks when the game is waiting to start or is over.
    if (p !== 'idle' && p !== 'won' && p !== 'lost') return
    // Full state reset so every match starts fresh at 0-0.
    stateRef.current = { ...initState(), phase: 'playing' }
    setPhase('playing')
    startLoop()
  }, [startLoop])

  // ── Drag (pointer capture on title bar) ───────────────────────────────────

  const handleDragDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    // Capture keeps move/up events firing even when the pointer leaves the bar.
    e.currentTarget.setPointerCapture(e.pointerId)
    // Snapshot the flyout position at drag start; setPos reads the diff on each move.
    setPos((p) => {
      dragRef.current = { ox: e.clientX, oy: e.clientY, px: p.x, py: p.y }
      return p   // no position change on mousedown itself
    })
  }, [])

  const handleDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const { ox, oy, px, py } = dragRef.current
    setPos({ x: px + (e.clientX - ox), y: py + (e.clientY - oy) })
  }, [])

  const handleDragEnd = useCallback(() => {
    dragRef.current = null
  }, [])

  return (
    <Paper
      elevation={24}
      sx={{
        position: 'fixed',
        top: pos.y,
        left: pos.x,
        // Must sit above modals so the flyout is reachable while dialogs are open.
        zIndex: (theme) => theme.zIndex.modal + 10,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 2,
        // Prevent text selection during drag.
        userSelect: 'none',
      }}
    >
      {/* ── Title bar ─── drag handle + label + close ───────────────────── */}
      <Box
        onPointerDown={handleDragDown}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        sx={{
          height: HEADER_H,
          display: 'flex',
          alignItems: 'center',
          px: 1.5,
          gap: 1,
          cursor: 'grab',
          bgcolor: 'action.hover',
          flexShrink: 0,
        }}
      >
        <SportsEsportsIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
        <Typography
          variant="body2"
          sx={{
            fontWeight: 700,
            letterSpacing: 2,
            fontSize: '0.68rem',
            flexGrow: 1,
            userSelect: 'none',
          }}
        >
          PONG
        </Typography>
        <IconButton
          size="small"
          onClick={onClose}
          aria-label="Close Pong"
          // Stop propagation so clicking Close doesn't also start a drag.
          onPointerDown={(e) => e.stopPropagation()}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* ── Game canvas ─────────────────────────────────────────────────── */}
      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        style={{
          display: 'block',
          // Hide cursor during play so it doesn't clutter the court.
          cursor: phase === 'playing' ? 'none' : 'pointer',
        }}
        onMouseMove={handleMouseMove}
        onClick={handleCanvasClick}
      />
    </Paper>
  )
}
