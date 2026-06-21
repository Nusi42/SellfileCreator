/**
 * statColorContext
 *
 * Provides the per-stat-variant TEXT colour (contrast-adapted, scope-gated) to the whole app so any
 * stat NAME rendered on screen can be tinted consistently — buttons, selects, labels, summaries.
 *
 * The scope splits two surfaces:
 *  - LABEL contexts (chips, preview, selects, table cells, tooltips, summaries) colour when the stat
 *    scope is 'labels' or 'everything'.
 *  - BUTTON contexts (toggle/filter buttons) colour only when the scope is 'everything'.
 *
 * The colour for a variant is the user's substat fg (or its default), adapted for legibility on the
 * runtime scheme via the same `useSubstatFgAdapter` substat chips use. `undefined` when the relevant
 * surface is not in scope, so the name inherits the surrounding theme colour.
 */
import { createContext, use, useMemo } from 'react'
import { useSubstatFgAdapter } from './themeContrastHooks'
import { DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, STAT_VARIANTS_PRIORITY } from './types'
import { type ColorScope, scopeColorsButtons, scopeColorsLabels } from './colorScope'

type SubstatColorMap = Record<number, { fg: string; bg: string }>
type ColorByVariant = Record<number, string | undefined>

// Two adapted maps: one for label contexts, one for button contexts (button is a subset of label).
const StatColorContext = createContext<{ label: ColorByVariant; button: ColorByVariant }>({ label: {}, button: {} })

export function StatColorProvider({
  scope,
  substatColors,
  children,
}: {
  /** This group's colour scope (off / labels / everything). */
  scope: ColorScope
  /** User substat colours (fg/bg per variant); defaults fill any gaps. */
  substatColors: SubstatColorMap
  children: React.ReactNode
}) {
  // Same contrast adapter substat fg colours use — recomputes only when the scheme changes.
  const adaptFg = useSubstatFgAdapter()

  const value = useMemo(() => {
    const labels = scopeColorsLabels(scope)
    const buttons = scopeColorsButtons(scope)
    if (!labels) return { label: {}, button: {} }
    const label: ColorByVariant = {}
    for (const variant of STAT_VARIANTS_PRIORITY) {
      const fg = substatColors[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]
      label[variant] = adaptFg(fg)
    }
    // Button map mirrors the label map only when the scope reaches buttons; otherwise empty.
    return { label, button: buttons ? label : {} }
  }, [scope, adaptFg, substatColors])

  return <StatColorContext value={value}>{children}</StatColorContext>
}

/**
 * Contrast-adapted text colour for a stat variant, or undefined when out of scope. `inButton` reads
 * the button-scoped colour (set only when scope === 'everything'); otherwise the label-scoped colour.
 */
export function useStatTextColor(variant: number | null | undefined, inButton = false): string | undefined {
  const { label, button } = use(StatColorContext)
  if (variant == null) return undefined
  return (inButton ? button : label)[Number(variant)]
}

/** Full per-variant LABEL-scoped colour map (empty when stat scope is off). */
export function useStatTextColorMap(): ColorByVariant {
  return use(StatColorContext).label
}

/** Full per-variant BUTTON-scoped colour map (empty unless stat scope is 'everything'). */
export function useStatButtonColorMap(): ColorByVariant {
  return use(StatColorContext).button
}
