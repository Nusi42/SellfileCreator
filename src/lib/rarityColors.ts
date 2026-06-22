import { useCallback, useState } from 'react'
import { ensureContrastOnBg, parseCssColorToRgb } from './colorUtils'
import { RARITY_COLORS_STORAGE_KEY } from './constants'

// Shared rarity accent palette keeps every UI surface (grid icons, flyouts, etc.) consistent.
// This is the FACTORY default; the active palette can be user-overridden (see useRarityColors /
// RarityPaletteProvider). Editing a rarity colour updates both its raw accent (borders/charts —
// verbatim) and its label text (contrast-adapted) so the whole palette stays one source of truth.
export const RARITY_ACCENT_COLORS: Readonly<Record<number, string>> = {
  1: '#9ca3af',
  2: '#34d399',
  3: '#60a5fa',
  4: '#7c3aed',
  5: '#f9a825',
  6: '#8b0000',
}

/** The six user-editable rarity colours (rarity 1–6), keyed by rank value. */
export type RarityColors = Record<1 | 2 | 3 | 4 | 5 | 6, string>

/** Factory defaults as a ready-to-use object — also the Reset target. */
export const DEFAULT_RARITY_COLORS: RarityColors = Object.freeze({
  1: RARITY_ACCENT_COLORS[1]!,
  2: RARITY_ACCENT_COLORS[2]!,
  3: RARITY_ACCENT_COLORS[3]!,
  4: RARITY_ACCENT_COLORS[4]!,
  5: RARITY_ACCENT_COLORS[5]!,
  6: RARITY_ACCENT_COLORS[6]!,
}) as RarityColors

// The six rank values in stable order — reused by the dialog rows and palette coercion.
const RARITY_RANKS: readonly (1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5, 6]

/** Accept only a CSS-parseable colour; fall back to the factory default for that rank otherwise. */
function sanitizeRarityColor(value: unknown, rank: 1 | 2 | 3 | 4 | 5 | 6): string {
  return typeof value === 'string' && parseCssColorToRgb(value) ? value : DEFAULT_RARITY_COLORS[rank]
}

/** Merge a persisted blob with defaults, dropping anything unparseable. */
function coerceRarityColors(raw: unknown): RarityColors {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_RARITY_COLORS }
  const obj = raw as Partial<Record<number, unknown>>
  const next = {} as RarityColors
  for (const rank of RARITY_RANKS) next[rank] = sanitizeRarityColor(obj[rank], rank)
  return next
}

/** Best-effort persistence — mirrors the substat-colour / slot-tint policy. */
function persistRarityColors(next: RarityColors): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(RARITY_COLORS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore — persistence is best-effort
  }
}

/**
 * Stateful rarity-palette hook, mirroring useSlotTints/useSubstatColors: reads/persists the six
 * colours and tolerates a missing or corrupt key (no migration — just don't crash).
 */
export function useRarityColors(): [RarityColors, React.Dispatch<React.SetStateAction<RarityColors>>] {
  const [colors, setColors] = useState<RarityColors>(() => {
    try {
      const raw = localStorage.getItem(RARITY_COLORS_STORAGE_KEY)
      return raw ? coerceRarityColors(JSON.parse(raw)) : { ...DEFAULT_RARITY_COLORS }
    } catch {
      return { ...DEFAULT_RARITY_COLORS }
    }
  })
  const setAndPersist = useCallback<React.Dispatch<React.SetStateAction<RarityColors>>>((value) => {
    setColors((prev) => {
      const next = typeof value === 'function' ? (value as (p: RarityColors) => RarityColors)(prev) : value
      if (next === prev) return prev
      persistRarityColors(next)
      return next
    })
  }, [])
  return [colors, setAndPersist]
}

// Rank/ascension star glyph accents (gear icon overlays). Ascension stars read purple, rank
// stars/level read gold. Rendered as TEXT/glyphs, so call sites contrast-adapt them against the
// runtime surface via ensureContrastOnBg (the raw gold is unreadable on light paper).
export const ASCENSION_STAR_FG = '#a855f7'
export const RANK_STAR_FG = '#fcd34d'

// Optional `palette` lets callers pass the active (possibly user-edited) colours; defaults to the
// factory palette so existing call sites keep working unchanged. Single rarity→hex mapping either way.
export function resolveRarityAccentColor(
  rarity: number | null | undefined,
  palette: Readonly<Record<number, string>> = RARITY_ACCENT_COLORS,
): string | undefined {
  if (rarity === null || rarity === undefined) return undefined
  const numeric = Number(rarity)
  if (!Number.isFinite(numeric)) return undefined
  return palette[Math.max(1, Math.min(6, Math.round(numeric)))]
}

// Higher contrast floor for rarity TEXT than the 3:1 UI default: the dark rarity hues (Epic purple
// #7c3aed, Mythical dark-red #8b0000) only reach a muted, hard-to-read tone at 3:1 on dark/RSLH
// surfaces. 4.5:1 (WCAG AA normal text) lightens them enough to read clearly while LCH keeps the hue.
export const RARITY_TEXT_MIN_CONTRAST = 4.5

// Rarity accent contrast-corrected for legible TEXT / icon glyphs on an opaque surface.
// The dark accents (purple #7c3aed, mythical dark-red #8b0000) are otherwise unreadable as text on
// dark surfaces. Use ONLY when the color is rendered as text/an icon — borders and chart fills keep
// the raw accent so the rarity hue stays exact.
export function resolveRarityTextColor(
  rarity: number | null | undefined,
  surface: string,
  palette: Readonly<Record<number, string>> = RARITY_ACCENT_COLORS,
): string | undefined {
  const accent = resolveRarityAccentColor(rarity, palette)
  return accent ? ensureContrastOnBg(accent, surface, RARITY_TEXT_MIN_CONTRAST) : undefined
}
