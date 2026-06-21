/**
 * slotTintContext
 *
 * Provides the per-slot glyph tint to every slot-icon render site through one context, so the
 * icon factory (`makeSlotIcon`) can colour its SVG without any call site passing props. This
 * keeps the tint a single source of truth: one adaptation path, one flag read.
 *
 * The provider stores the *adapted* armor/accessory colours (contrast-corrected for the runtime
 * scheme via `useSubstatFgAdapter`, the same helper substat fg colours use), or `undefined` when
 * the global `colorStatsSlotsRarity` flag is off — in which case glyphs fall back to `inherit`
 * (today's behaviour, no visual change).
 */
import { createContext, use, useMemo } from 'react'
import { useSubstatFgAdapter } from './themeContrastHooks'
import { isAccessorySlot } from './gearInspectorDomain'
import { DEFAULT_SLOT_TINTS, type SlotTints } from './slotTints'
import type { ArtifactTypeId } from './types'

/** Adapted tints ready to apply as CSS `color`; `undefined` ⇒ no tint (use inherit). */
type ResolvedSlotTints = {
  armor: string | undefined
  accessory: string | undefined
}

// Default context value: flag off ⇒ no tinting anywhere.
const SlotTintContext = createContext<ResolvedSlotTints>({ armor: undefined, accessory: undefined })

export function SlotTintProvider({
  enabled,
  tints,
  children,
}: {
  /** The global colorStatsSlotsRarity flag. */
  enabled: boolean
  /** Raw (unadapted) tint hues; defaults applied when omitted. */
  tints?: SlotTints
  children: React.ReactNode
}) {
  // Same contrast adapter substat fg colours use — recomputes only when the scheme changes.
  const adaptFg = useSubstatFgAdapter()
  const armorRaw = tints?.armor ?? DEFAULT_SLOT_TINTS.armor
  const accessoryRaw = tints?.accessory ?? DEFAULT_SLOT_TINTS.accessory

  const value = useMemo<ResolvedSlotTints>(() => {
    // Flag off ⇒ undefined ⇒ glyphs render in the inherited theme colour.
    if (!enabled) return { armor: undefined, accessory: undefined }
    return { armor: adaptFg(armorRaw), accessory: adaptFg(accessoryRaw) }
  }, [enabled, adaptFg, armorRaw, accessoryRaw])

  return <SlotTintContext value={value}>{children}</SlotTintContext>
}

/**
 * Resolved CSS colour for a slot's glyph, or `undefined` when tinting is off. Consumed by the
 * icon factory. Reuses `isAccessorySlot` as the armor-vs-accessory SSOT.
 */
export function useSlotTintColor(slot: ArtifactTypeId): string | undefined {
  const { armor, accessory } = use(SlotTintContext)
  return isAccessorySlot(slot) ? accessory : armor
}
