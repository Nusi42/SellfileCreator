/**
 * easterEggHighScores.ts
 *
 * Shared high score storage and canvas rendering for Easter egg games.
 * Scores are persisted in localStorage and merged with built-in seed entries
 * before display. Top 10 are shown; up to 50 are kept in storage.
 *
 * Canvas drawing is included here (no React dependency) so both PongFlyout
 * and SellfallFlyout share one definition — SSOT for the leaderboard look.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type GameId = 'pong' | 'sellfall'

export type ScoreEntry = {
  score: number
  /** ISO date string YYYY-MM-DD, formatted at record time. */
  date: string
  /**
   * Optional display name (e.g. a player handle). Rendered in a fixed 10-char
   * column; names longer than 10 chars scroll as a ping-pong marquee when an
   * animTick is supplied to drawHighScoreList.
   */
  name?: string
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const STORAGE_KEY: Record<GameId, string> = {
  pong:     'sellfileCreator.easterEgg.pong.scores',
  sellfall: 'sellfileCreator.easterEgg.sellfall.scores',
}

/** Maximum entries kept in localStorage per game to avoid unbounded growth. */
const MAX_STORED = 50

/** How many entries are shown on the leaderboard overlay. */
export const LEADERBOARD_SIZE = 10

// ─── Built-in seed entries ─────────────────────────────────────────────────────

/**
 * Hardcoded leaderboard entries seeded by the development team.
 * All scores are 0 for now — update these as real benchmark scores accumulate.
 * Each entry may include a `name` (up to and beyond 10 chars; long names marquee).
 * These are merged with player-saved entries and the combined top-10 is shown.
 */
const BUILTIN_SCORES: Record<GameId, ScoreEntry[]> = {
  pong:     [],
  sellfall: [],
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function loadScores(gameId: GameId): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY[gameId])
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    // Basic structural validation to reject stale or corrupt data.
    if (!Array.isArray(parsed)) return []
    return (parsed as unknown[]).filter(
      (e): e is ScoreEntry =>
        typeof e === 'object' && e !== null &&
        typeof (e as Record<string, unknown>).score === 'number' &&
        typeof (e as Record<string, unknown>).date === 'string',
    )
  } catch {
    return []
  }
}

function saveScores(gameId: GameId, entries: ScoreEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY[gameId], JSON.stringify(entries))
  } catch {
    // localStorage may be unavailable (private mode, quota exceeded, etc.).
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the top-LEADERBOARD_SIZE entries for `gameId`, merging built-in
 * seeds with localStorage-saved entries. Ties are broken by date descending
 * (newer scores appear higher).
 */
export function getHighScores(gameId: GameId): ScoreEntry[] {
  const saved = loadScores(gameId)
  const all   = [...BUILTIN_SCORES[gameId], ...saved]
  all.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
  return all.slice(0, LEADERBOARD_SIZE)
}

/**
 * Saves a new score entry to localStorage for `gameId`.
 * Scores of exactly 0 are skipped — they would only pollute the leaderboard
 * while all built-in seeds are also 0.
 */
export function recordHighScore(gameId: GameId, score: number): void {
  if (score <= 0) return
  const now  = new Date()
  const pad  = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const saved = loadScores(gameId)
  saved.push({ score, date })
  saved.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
  saveScores(gameId, saved.slice(0, MAX_STORED))
}

// ─── Canvas rendering ─────────────────────────────────────────────────────────

/** Row pitch in px for each leaderboard entry (logical pixels). */
const ROW_H = 14

/** Characters shown in the name column before marquee scrolling kicks in. */
const NAME_DISPLAY_CHARS = 10

const C_GOLD   = 'rgba(255,210,0,0.92)'   // rank-1 / newly set score
const C_ENTRY  = 'rgba(255,255,255,0.55)'  // standard entry
const C_DATE   = 'rgba(255,255,255,0.28)'  // date column
const C_HEADER = 'rgba(255,255,255,0.32)'  // header / empty-state label

/**
 * Computes the ping-pong scroll offset (in characters) for a name that is
 * longer than `NAME_DISPLAY_CHARS`, advancing one step every 350 ms.
 * Returns 0 for names that fit in the display window.
 */
function marqueeOffset(name: string, animTick: number): number {
  const overflow = name.length - NAME_DISPLAY_CHARS
  if (overflow <= 0) return 0
  // Full trip = forward (overflow steps) + backward (overflow steps).
  const step   = Math.floor(animTick / 350)
  const phase  = step % (2 * overflow)
  return phase < overflow ? phase : 2 * overflow - phase
}

/**
 * Renders a compact leaderboard list onto the canvas.
 *
 * Saves and restores canvas context state so callers don't need to reset
 * font/alignment after this call.
 *
 * Layout per row (logical px, left-to-right):
 *   - Rank:   right-aligned  at centerX − halfWidth + 22
 *   - Name:   clipped 10-char window starting at centerX − halfWidth + 26
 *             (long names scroll as ping-pong marquee when animTick is supplied)
 *   - Score:  right-aligned  at centerX + halfWidth − 62
 *   - Date:   right-aligned  at centerX + halfWidth
 *
 * @param entries   Pre-sorted top-N entries from `getHighScores()`.
 * @param centerX   Horizontal centre of the list.
 * @param topY      Top of the header line.
 * @param options.halfWidth  Half the total list width in logical px (default 80).
 * @param options.newScore   First entry matching this score is highlighted gold.
 * @param options.animTick   Current time (ms) for marquee animation; 0 = static.
 */
export function drawHighScoreList(
  ctx: CanvasRenderingContext2D,
  entries: readonly ScoreEntry[],
  centerX: number,
  topY: number,
  options?: {
    halfWidth?: number
    newScore?: number
    animTick?: number
  },
): void {
  const halfWidth = options?.halfWidth ?? 80
  const newScore  = options?.newScore
  const animTick  = options?.animTick ?? 0

  const listLeft  = centerX - halfWidth
  const listRight = centerX + halfWidth

  ctx.save()

  // ── Header ──────────────────────────────────────────────────────────────────
  ctx.font         = '9px monospace'
  ctx.fillStyle    = C_HEADER
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('─ HIGH SCORES ─', centerX, topY)

  if (entries.length === 0) {
    ctx.fillText('— no scores yet —', centerX, topY + 14)
    ctx.restore()
    return
  }

  // ── Entry rows ──────────────────────────────────────────────────────────────

  // Estimated monospace char width at 10px: ~6 px (used for name column clipping).
  const charW        = 6
  const nameColLeft  = listLeft + 26     // name text starts here (after rank)
  const nameColW     = NAME_DISPLAY_CHARS * charW   // 60 px clip window

  let newHighlighted = false  // highlight the freshly set score only once

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const rowY  = topY + 14 + i * ROW_H

    const isNew = !newHighlighted && newScore !== undefined && entry.score === newScore
    if (isNew) newHighlighted = true

    const entryColor = (i === 0 || isNew) ? C_GOLD : C_ENTRY

    // ── Rank ──────────────────────────────────────────────────────────────────
    ctx.font         = '10px monospace'
    ctx.fillStyle    = entryColor
    ctx.textAlign    = 'right'
    ctx.textBaseline = 'top'
    ctx.fillText(`${i + 1}.`, listLeft + 22, rowY)

    // ── Name (clipped, marquee for overflow) ──────────────────────────────────
    const rawName = entry.name ?? ''
    if (rawName.length > 0) {
      const offset    = marqueeOffset(rawName, animTick)
      const visible   = rawName.slice(offset, offset + NAME_DISPLAY_CHARS)

      // Clip to the 10-char window so long names don't bleed into adjacent cols.
      ctx.save()
      ctx.beginPath()
      ctx.rect(nameColLeft, rowY - 1, nameColW, ROW_H + 1)
      ctx.clip()
      ctx.textAlign = 'left'
      ctx.fillText(visible, nameColLeft, rowY)
      ctx.restore()
    }

    // ── Score ─────────────────────────────────────────────────────────────────
    ctx.font      = '10px monospace'
    ctx.fillStyle = entryColor
    ctx.textAlign = 'right'
    ctx.fillText(String(entry.score).padStart(6), listRight - 62, rowY)

    // ── Date ──────────────────────────────────────────────────────────────────
    ctx.font      = '9px monospace'
    ctx.fillStyle = isNew ? C_GOLD : C_DATE
    ctx.textAlign = 'right'
    ctx.fillText(entry.date, listRight, rowY + 1)
  }

  ctx.restore()
}
