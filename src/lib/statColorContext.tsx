/**
 * statColorContext
 *
 * Provides the per-stat-variant TEXT colour (contrast-adapted, scope-gated) to the whole app so any
 * stat NAME rendered on screen can be tinted consistently — controls, chips, labels, summaries.
 *
 * The scope splits two surfaces:
 *  - CONTROL contexts (toggle buttons, selects/menus, closed-select displays) colour when the stat
 *    scope is 'controls' or 'everything'.
 *  - TEXT contexts (substat chips, table cells, tooltips, summaries, preview) colour when the stat
 *    scope is 'text' or 'everything'.
 *
 * The colour for a variant is the user's substat fg (or its default), adapted for legibility on the
 * runtime scheme via the same `useSubstatFgAdapter` substat chips use. `undefined` when the relevant
 * surface is not in scope, so the name inherits the surrounding theme colour.
 */
import { createContext, use, useMemo } from 'react'
import { useControlFgAdapter, useSubstatFgAdapter } from './themeContrastHooks'
import { DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, STAT_VARIANTS_PRIORITY } from './types'
import { type ColorScope, scopeColorsControls, scopeColorsText } from './colorScope'

type SubstatColorMap = Record<number, { fg: string; bg: string }>
type ColorByVariant = Record<number, string | undefined>

// Two adapted maps: one for control contexts, one for text contexts (independently gated).
const StatColorContext = createContext<{ control: ColorByVariant; text: ColorByVariant }>({ control: {}, text: {} })

export function StatColorProvider({
  scope,
  substatColors,
  children,
}: {
  /** This group's colour scope (off / controls / text / everything). */
  scope: ColorScope
  /** User substat colours (fg/bg per variant); defaults fill any gaps. */
  substatColors: SubstatColorMap
  children: React.ReactNode
}) {
  // TEXT sites adapt against paper; CONTROL sites adapt against the selected-button surface so the
  // name stays legible on toggle/filter buttons (esp. RSLH's warm selection tint).
  const adaptText = useSubstatFgAdapter()
  const adaptControl = useControlFgAdapter()

  const value = useMemo(() => {
    const controls = scopeColorsControls(scope)
    const text = scopeColorsText(scope)
    if (!controls && !text) return { control: {}, text: {} }
    const textColours: ColorByVariant = {}
    const controlColours: ColorByVariant = {}
    for (const variant of STAT_VARIANTS_PRIORITY) {
      const fg = substatColors[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]
      if (text) textColours[variant] = adaptText(fg)
      if (controls) controlColours[variant] = adaptControl(fg)
    }
    return { control: controlColours, text: textColours }
  }, [scope, adaptText, adaptControl, substatColors])

  return <StatColorContext value={value}>{children}</StatColorContext>
}

/**
 * Contrast-adapted text colour for a stat variant, or undefined when out of scope. `inControl` reads
 * the control-scoped colour (buttons/selects); otherwise the text-scoped colour (chips/cells/etc).
 */
export function useStatTextColor(variant: number | null | undefined, inControl = false): string | undefined {
  const { control, text } = use(StatColorContext)
  if (variant == null) return undefined
  return (inControl ? control : text)[Number(variant)]
}

/** Full per-variant TEXT-scoped colour map (empty unless stat scope ∈ {text, everything}). */
export function useStatTextColorMap(): ColorByVariant {
  return use(StatColorContext).text
}

/** Full per-variant CONTROL-scoped colour map (empty unless stat scope ∈ {controls, everything}). */
export function useStatControlColorMap(): ColorByVariant {
  return use(StatColorContext).control
}
