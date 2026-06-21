/**
 * slotTintContext
 *
 * Provides the per-slot glyph tint to every slot-icon render site through one context, so the icon
 * factory (`makeSlotIcon`) can colour its SVG without any call site passing props. One source of
 * truth: one adaptation path, one scope read.
 *
 * The slot scope splits two surfaces (glyphs act as the group's "labels"):
 *  - LABEL/icon contexts (grid headers, chips, cards, tooltip preview, candidate list) tint when the
 *    slot scope is 'labels' or 'everything'.
 *  - BUTTON contexts (the two builder slot toggle grids) tint only when the scope is 'everything';
 *    those grids advertise themselves via `SlotTintButtonScope`.
 *
 * Tints are contrast-adapted for the runtime scheme via `useSubstatFgAdapter` (same as substat fg).
 */
import { createContext, use, useMemo } from 'react'
import { useSubstatFgAdapter } from './themeContrastHooks'
import { isAccessorySlot } from './gearInspectorDomain'
import { DEFAULT_SLOT_TINTS, type SlotTints } from './slotTints'
import { type ColorScope, scopeColorsButtons, scopeColorsLabels } from './colorScope'
import type { ArtifactTypeId } from './types'

/** Adapted tints ready to apply as CSS `color`; `undefined` ⇒ no tint (use inherit). */
type ResolvedSlotTints = {
  armor: string | undefined
  accessory: string | undefined
}

type SlotTintContextValue = {
  // Tints for icon/label contexts (set when scope ≥ labels).
  label: ResolvedSlotTints
  // Tints for builder slot toggle buttons (set only when scope === everything).
  button: ResolvedSlotTints
}

const EMPTY: ResolvedSlotTints = { armor: undefined, accessory: undefined }
const SlotTintContext = createContext<SlotTintContextValue>({ label: EMPTY, button: EMPTY })

// True inside the builder slot toggle grids, so glyphs there read the button-scoped tint.
const SlotTintButtonContext = createContext<boolean>(false)

export function SlotTintProvider({
  scope,
  tints,
  children,
}: {
  /** The slot colour scope (off / labels / everything). */
  scope: ColorScope
  /** Raw (unadapted) tint hues; defaults applied when omitted. */
  tints?: SlotTints
  children: React.ReactNode
}) {
  // Same contrast adapter substat fg colours use — recomputes only when the scheme changes.
  const adaptFg = useSubstatFgAdapter()
  const armorRaw = tints?.armor ?? DEFAULT_SLOT_TINTS.armor
  const accessoryRaw = tints?.accessory ?? DEFAULT_SLOT_TINTS.accessory

  const value = useMemo<SlotTintContextValue>(() => {
    if (!scopeColorsLabels(scope)) return { label: EMPTY, button: EMPTY }
    const label: ResolvedSlotTints = { armor: adaptFg(armorRaw), accessory: adaptFg(accessoryRaw) }
    return { label, button: scopeColorsButtons(scope) ? label : EMPTY }
  }, [scope, adaptFg, armorRaw, accessoryRaw])

  return <SlotTintContext value={value}>{children}</SlotTintContext>
}

/** Wrap the builder slot toggle grids so their glyphs use the button-scoped tint. */
export function SlotTintButtonScope({ children }: { children: React.ReactNode }) {
  return <SlotTintButtonContext value={true}>{children}</SlotTintButtonContext>
}

/**
 * Resolved CSS colour for a slot's glyph, or `undefined` when out of scope. Consumed by the icon
 * factory. Reads the button-scoped tint inside `SlotTintButtonScope`, else the label-scoped tint.
 * Reuses `isAccessorySlot` as the armor-vs-accessory SSOT.
 */
export function useSlotTintColor(slot: ArtifactTypeId): string | undefined {
  const { label, button } = use(SlotTintContext)
  const inButton = use(SlotTintButtonContext)
  const tints = inButton ? button : label
  return isAccessorySlot(slot) ? tints.accessory : tints.armor
}
