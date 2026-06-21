/**
 * rarityColorContext
 *
 * Provides the active (possibly user-edited) rarity palette to the whole app as one source of
 * truth. Editing a rarity colour updates BOTH uses from this single palette:
 *
 *  - Raw accent (borders / chart fills / gear-card frames) — verbatim, NO contrast adaptation,
 *    and NOT gated by the master colour flag (borders are always coloured today). Read via
 *    `useRarityAccentColor`.
 *  - Label text — contrast-adapted for legibility (same adapter substat fg colours use) and gated
 *    by the `colorStatsSlotsRarity` flag; `undefined` when off so labels inherit the theme colour.
 *    Read via `useRarityTextColor` (single rarity) or `useRarityTextColorMap` (all six, for the
 *    inline string colorizer).
 */
import { createContext, use, useMemo } from 'react'
import { useSubstatFgAdapter } from './themeContrastHooks'
import { DEFAULT_RARITY_COLORS, resolveRarityAccentColor, type RarityColors } from './rarityColors'
import { useI18n } from './i18n'
import { rarityRankValueI18nKey } from './types'

type RarityContextValue = {
  // The active raw palette (defaults unless user-edited) — for borders/charts/frames.
  palette: RarityColors
  // Per-rarity contrast-adapted text colour, or undefined when the flag is off.
  textColors: Record<number, string | undefined>
}

const RarityColorContext = createContext<RarityContextValue>({
  palette: DEFAULT_RARITY_COLORS,
  textColors: {},
})

const RARITY_RANKS: readonly (1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5, 6]

export function RarityPaletteProvider({
  enabled,
  colors,
  children,
}: {
  /** The global colorStatsSlotsRarity flag — gates the label TEXT tint only. */
  enabled: boolean
  /** Active raw palette; defaults applied when omitted. */
  colors?: RarityColors
  children: React.ReactNode
}) {
  // Same contrast adapter substat fg colours use — recomputes only when the scheme changes.
  const adaptFg = useSubstatFgAdapter()
  const palette = colors ?? DEFAULT_RARITY_COLORS

  const value = useMemo<RarityContextValue>(() => {
    // Flag off ⇒ no text tint (labels inherit theme colour); borders still read the raw palette.
    const textColors: Record<number, string | undefined> = {}
    if (enabled) {
      for (const rank of RARITY_RANKS) textColors[rank] = adaptFg(palette[rank])
    }
    return { palette, textColors }
  }, [enabled, adaptFg, palette])

  return <RarityColorContext value={value}>{children}</RarityColorContext>
}

/** The active raw rarity palette (defaults unless user-edited). */
export function useRarityPalette(): RarityColors {
  return use(RarityColorContext).palette
}

/** Raw active palette colour for a rarity — borders/charts/frames (no flag gate, no adaptation). */
export function useRarityAccentColor(rarity: number | null | undefined): string | undefined {
  const { palette } = use(RarityColorContext)
  return resolveRarityAccentColor(rarity, palette)
}

/** Contrast-adapted text colour for a rarity word, or undefined when the master flag is off. */
export function useRarityTextColor(rarity: number | null | undefined): string | undefined {
  const { textColors } = use(RarityColorContext)
  if (rarity == null) return undefined
  return textColors[Math.max(1, Math.min(6, Math.round(Number(rarity))))]
}

/**
 * The full per-rarity adapted text-colour map (empty when the flag is off). For the inline string
 * colorizer (`renderColoredStatText`), which needs every rarity colour up front.
 */
export function useRarityTextColorMap(): Record<number, string | undefined> {
  return use(RarityColorContext).textColors
}

/**
 * Localized rarity WORD → adapted colour, for the inline string colorizer (`renderColoredStatText`),
 * which tokenizes plain text. Empty when the master flag is off so rarity words stay un-tinted.
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
