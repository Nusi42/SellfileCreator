/**
 * rarityColorContext
 *
 * Provides the active (possibly user-edited) rarity palette to the whole app as one source of
 * truth. Editing a rarity colour updates every use from this single palette; the rarity SCOPE
 * (off / controls / text / everything) decides which surfaces actually colour:
 *
 *  - Rarity WORDS in CONTROL contexts (rarity toggle buttons, rarity selects/menus, closed-select
 *    displays) — contrast-adapted; colour at scope ∈ {controls, everything}.
 *  - Rarity WORDS in TEXT contexts (chips, table cells, summaries, history) — contrast-adapted;
 *    colour at scope ∈ {text, everything}.
 *  - Raw ACCENTS (borders / chart fills / gear-card frames) — verbatim, NO contrast adaptation;
 *    these are non-control display, so they colour at scope ∈ {text, everything}. When out of scope
 *    the call sites fall back to their neutral divider colour.
 */
import { createContext, use, useMemo } from 'react'
import { useTheme, useColorScheme } from '@mui/material/styles'
import { resolveControlSurface, resolveSchemePaper, schemeModeFromColorScheme } from './themeCustomTokens'
import { ensureContrastOnBg } from './colorUtils'
import { DEFAULT_RARITY_COLORS, RARITY_TEXT_MIN_CONTRAST, resolveRarityAccentColor, type RarityColors } from './rarityColors'
import { useI18n } from './i18n'
import { rarityRankValueI18nKey } from './types'
import { type ColorScope, scopeColorsControls, scopeColorsText } from './colorScope'

type RarityContextValue = {
  // The active raw palette (defaults unless user-edited).
  palette: RarityColors
  // Per-rarity adapted WORD colour for TEXT contexts (chips/cells/summaries) — scope-gated.
  textColors: Record<number, string | undefined>
  // Per-rarity adapted WORD colour for CONTROL contexts (toggles/selects/closed-selects) — scope-gated.
  controlColors: Record<number, string | undefined>
  // Per-rarity adapted GLYPH/icon colour (champion glyph, slot-icon-by-rarity) — ALWAYS on (like
  // v1.0.26), contrast-adapted against paper at the rarity floor. NOT scope-gated.
  glyphColors: Record<number, string | undefined>
}

const RarityColorContext = createContext<RarityContextValue>({
  palette: DEFAULT_RARITY_COLORS,
  textColors: {},
  controlColors: {},
  glyphColors: {},
})

const RARITY_RANKS: readonly (1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5, 6]

export function RarityPaletteProvider({
  scope,
  colors,
  children,
}: {
  /** The rarity colour scope (off / controls / text / everything). */
  scope: ColorScope
  /** Active raw palette; defaults applied when omitted. */
  colors?: RarityColors
  children: React.ReactNode
}) {
  // Rarity words use a HIGHER contrast floor than substats (RARITY_TEXT_MIN_CONTRAST): the dark
  // rarity hues only reach a muted tone at 3:1. TEXT words adapt against paper; CONTROL words
  // against the selected-button surface. Resolve both surfaces from the runtime scheme.
  const theme = useTheme()
  const { colorScheme } = useColorScheme()
  const mode = schemeModeFromColorScheme(colorScheme)
  const textSurface = resolveSchemePaper(theme, mode)
  const controlSurface = resolveControlSurface(theme, mode)
  const palette = colors ?? DEFAULT_RARITY_COLORS

  const value = useMemo<RarityContextValue>(() => {
    const controls = scopeColorsControls(scope)
    const text = scopeColorsText(scope)
    const textColors: Record<number, string | undefined> = {}
    const controlColors: Record<number, string | undefined> = {}
    const glyphColors: Record<number, string | undefined> = {}
    for (const rank of RARITY_RANKS) {
      const raw = palette[rank]
      if (!raw) continue
      // Glyph icons coloured by rarity are always on (v1.0.26) — adapt against paper at the rarity floor.
      glyphColors[rank] = ensureContrastOnBg(raw, textSurface, RARITY_TEXT_MIN_CONTRAST)
      if (text) textColors[rank] = glyphColors[rank]
      if (controls) controlColors[rank] = ensureContrastOnBg(raw, controlSurface, RARITY_TEXT_MIN_CONTRAST)
    }
    return { palette, textColors, controlColors, glyphColors }
  }, [scope, textSurface, controlSurface, palette])

  return <RarityColorContext value={value}>{children}</RarityColorContext>
}

/** The active raw rarity palette (defaults unless user-edited). */
export function useRarityPalette(): RarityColors {
  return use(RarityColorContext).palette
}

/**
 * Raw active palette colour for a rarity accent (borders / chart fills / gear-card frames / rarity
 * glyph icons). NOT scope-gated — these accents are ALWAYS coloured (matching v1.0.26, where rarity
 * borders rendered unconditionally). Only the editable palette flows through; the rarity SCOPE gates
 * the rarity WORDS, not these accents. Call sites still fall back to a neutral colour for no rarity.
 */
export function useRarityAccentColor(rarity: number | null | undefined): string | undefined {
  const { palette } = use(RarityColorContext)
  return resolveRarityAccentColor(rarity, palette)
}

/**
 * Always-on rarity-accent resolver `(rarity) => colour | undefined` for per-item call sites
 * (`.map` / memo bodies) that can't call a hook per row. Not scope-gated (see `useRarityAccentColor`).
 */
export function useRarityAccentResolver(): (rarity: number | null | undefined) => string | undefined {
  const { palette } = use(RarityColorContext)
  return (rarity) => resolveRarityAccentColor(rarity, palette)
}

/**
 * Contrast-adapted text colour for a rarity word, or undefined when out of scope. `inControl` reads
 * the control-scoped colour (toggles/selects); otherwise the text-scoped colour (chips/cells/etc).
 */
export function useRarityTextColor(rarity: number | null | undefined, inControl = false): string | undefined {
  const { textColors, controlColors } = use(RarityColorContext)
  if (rarity == null) return undefined
  const map = inControl ? controlColors : textColors
  return map[Math.max(1, Math.min(6, Math.round(Number(rarity))))]
}

/** Full per-rarity TEXT-scoped adapted colour map (empty unless scope ∈ {text, everything}). */
export function useRarityTextColorMap(): Record<number, string | undefined> {
  return use(RarityColorContext).textColors
}

/**
 * Contrast-adapted colour for a rarity GLYPH/icon (champion glyph, slot-icon-coloured-by-rarity).
 * ALWAYS on (not scope-gated) — matches v1.0.26 where these glyphs were always coloured. Adapted
 * against paper at the rarity contrast floor so the dark hues stay legible.
 */
export function useRarityGlyphColor(rarity: number | null | undefined): string | undefined {
  const { glyphColors } = use(RarityColorContext)
  if (rarity == null) return undefined
  return glyphColors[Math.max(1, Math.min(6, Math.round(Number(rarity))))]
}

/**
 * Localized rarity WORD → adapted colour, for the inline string colorizer (`renderColoredStatText`),
 * which tokenizes plain text (TEXT contexts: history timeline, table cells, chip summaries). Empty
 * unless the rarity scope colours text.
 */
export function useRarityLabelColorMap(): ReadonlyMap<string, string> {
  const { t } = useI18n()
  const { textColors } = use(RarityColorContext)
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const rank of RARITY_RANKS) {
      const color = textColors[rank]
      if (color) map.set(t(rarityRankValueI18nKey(rank)), color)
    }
    return map
  }, [t, textColors])
}
