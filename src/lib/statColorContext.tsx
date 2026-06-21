/**
 * statColorContext
 *
 * Provides the per-stat-variant TEXT colour (contrast-adapted, flag-gated) to the whole app so any
 * stat NAME rendered on screen can be tinted consistently — buttons, selects, labels, summaries.
 *
 * The colour for a variant is the user's substat fg (or its default), adapted for legibility on the
 * runtime scheme via the same `useSubstatFgAdapter` substat chips use. `undefined` when the master
 * `colorStatsSlotsRarity` flag is off, so the name inherits the surrounding theme colour.
 *
 * This is the stat-name counterpart to rarityColorContext / slotTintContext — one definition, one
 * adaptation path, one flag read.
 */
import { createContext, use, useMemo } from 'react'
import { useSubstatFgAdapter } from './themeContrastHooks'
import { DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, STAT_VARIANTS_PRIORITY } from './types'

type SubstatColorMap = Record<number, { fg: string; bg: string }>

// Per-variant adapted text colour, or undefined when the master flag is off.
const StatColorContext = createContext<Record<number, string | undefined>>({})

export function StatColorProvider({
  enabled,
  substatColors,
  children,
}: {
  /** The global colorStatsSlotsRarity flag. */
  enabled: boolean
  /** User substat colours (fg/bg per variant); defaults fill any gaps. */
  substatColors: SubstatColorMap
  children: React.ReactNode
}) {
  // Same contrast adapter substat fg colours use — recomputes only when the scheme changes.
  const adaptFg = useSubstatFgAdapter()

  const value = useMemo<Record<number, string | undefined>>(() => {
    if (!enabled) return {}
    const out: Record<number, string | undefined> = {}
    for (const variant of STAT_VARIANTS_PRIORITY) {
      const fg = substatColors[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]
      out[variant] = adaptFg(fg)
    }
    return out
  }, [enabled, adaptFg, substatColors])

  return <StatColorContext value={value}>{children}</StatColorContext>
}

/** Contrast-adapted text colour for a stat variant, or undefined when the master flag is off. */
export function useStatTextColor(variant: number | null | undefined): string | undefined {
  const colors = use(StatColorContext)
  if (variant == null) return undefined
  return colors[Number(variant)]
}

/**
 * The full per-variant adapted text-colour map (empty when the flag is off). For callers that need
 * the colour for many variants without one hook per variant (e.g. toggle-button grids in `.map`).
 */
export function useStatTextColorMap(): Record<number, string | undefined> {
  return use(StatColorContext)
}
