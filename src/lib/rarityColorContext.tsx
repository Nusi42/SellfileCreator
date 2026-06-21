/**
 * rarityColorContext
 *
 * Provides the active (possibly user-edited) rarity palette to the whole app as one source of
 * truth. Editing a rarity colour updates every use from this single palette; the rarity SCOPE
 * (off / labels / everything) decides which surfaces actually colour:
 *
 *  - Label TEXT (rarity words) — contrast-adapted; coloured when scope ≥ 'labels'. Button-context
 *    rarity words colour only when scope === 'everything'.
 *  - Raw accents (borders / chart fills / gear-card frames) — verbatim, NO contrast adaptation;
 *    coloured only when scope === 'everything' (a non-text "everything" use). When out of scope the
 *    call sites fall back to their neutral divider colour.
 */
import { createContext, use, useMemo } from 'react'
import { useSubstatFgAdapter } from './themeContrastHooks'
import { DEFAULT_RARITY_COLORS, resolveRarityAccentColor, type RarityColors } from './rarityColors'
import { useI18n } from './i18n'
import { rarityRankValueI18nKey } from './types'
import { type ColorScope, scopeColorsButtons, scopeColorsLabels } from './colorScope'

type RarityContextValue = {
  // The active raw palette (defaults unless user-edited).
  palette: RarityColors
  // Per-rarity adapted text colour for LABEL contexts (empty when scope is off).
  textColors: Record<number, string | undefined>
  // Per-rarity adapted text colour for BUTTON contexts (empty unless scope === everything).
  buttonTextColors: Record<number, string | undefined>
  // Whether raw accents (borders/charts) should colour — true only when scope === everything.
  accentEnabled: boolean
}

const RarityColorContext = createContext<RarityContextValue>({
  palette: DEFAULT_RARITY_COLORS,
  textColors: {},
  buttonTextColors: {},
  accentEnabled: false,
})

const RARITY_RANKS: readonly (1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5, 6]

export function RarityPaletteProvider({
  scope,
  colors,
  children,
}: {
  /** The rarity colour scope (off / labels / everything). */
  scope: ColorScope
  /** Active raw palette; defaults applied when omitted. */
  colors?: RarityColors
  children: React.ReactNode
}) {
  // Same contrast adapter substat fg colours use — recomputes only when the scheme changes.
  const adaptFg = useSubstatFgAdapter()
  const palette = colors ?? DEFAULT_RARITY_COLORS

  const value = useMemo<RarityContextValue>(() => {
    const labels = scopeColorsLabels(scope)
    const buttons = scopeColorsButtons(scope)
    const textColors: Record<number, string | undefined> = {}
    if (labels) {
      for (const rank of RARITY_RANKS) textColors[rank] = adaptFg(palette[rank])
    }
    return { palette, textColors, buttonTextColors: buttons ? textColors : {}, accentEnabled: buttons }
  }, [scope, adaptFg, palette])

  return <RarityColorContext value={value}>{children}</RarityColorContext>
}

/** The active raw rarity palette (defaults unless user-edited). */
export function useRarityPalette(): RarityColors {
  return use(RarityColorContext).palette
}

/**
 * Raw active palette colour for a rarity accent (borders/charts/frames). Returns undefined unless the
 * rarity scope is 'everything', so out-of-scope call sites fall back to their neutral divider colour.
 */
export function useRarityAccentColor(rarity: number | null | undefined): string | undefined {
  const { palette, accentEnabled } = use(RarityColorContext)
  if (!accentEnabled) return undefined
  return resolveRarityAccentColor(rarity, palette)
}

/**
 * Contrast-adapted text colour for a rarity word, or undefined when out of scope. `inButton` reads
 * the button-scoped colour (set only when scope === 'everything'); otherwise the label-scoped colour.
 */
export function useRarityTextColor(rarity: number | null | undefined, inButton = false): string | undefined {
  const { textColors, buttonTextColors } = use(RarityColorContext)
  if (rarity == null) return undefined
  const map = inButton ? buttonTextColors : textColors
  return map[Math.max(1, Math.min(6, Math.round(Number(rarity))))]
}

/** Full per-rarity LABEL-scoped adapted text-colour map (empty when scope is off). */
export function useRarityTextColorMap(): Record<number, string | undefined> {
  return use(RarityColorContext).textColors
}

/**
 * Localized rarity WORD → adapted colour, for the inline string colorizer (`renderColoredStatText`),
 * which tokenizes plain text (label contexts). Empty when the rarity scope is off.
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
