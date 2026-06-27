/**
 * slotTintContext
 *
 * Provides the per-slot glyph tint to every slot-icon render site through one context, so the icon
 * factory (`makeSlotIcon`) can colour its SVG without any call site passing props. One source of
 * truth: one adaptation path, one scope read.
 *
 * The slot scope splits two surfaces (glyphs act as the group's words):
 *  - CONTROL contexts (slot toggle grids in the builders, slot selects/menus) tint when the slot
 *    scope is 'controls' or 'everything'. Control grids advertise themselves via `SlotTintControlScope`.
 *  - TEXT contexts (grid headers, chips, cards, tooltip preview, candidate list, table cells) tint
 *    when the slot scope is 'text' or 'everything'.
 *
 * Tints are contrast-adapted for the runtime scheme via `useSubstatFgAdapter` (same as substat fg).
 */
import { createContext, use, useMemo } from 'react'
import { useSubstatFgAdapter } from './themeContrastHooks'
import { isAccessorySlot } from './gearInspectorDomain'
import { DEFAULT_SLOT_TINTS, type SlotTints } from './slotTints'
import { type ColorScope, scopeColorsControls, scopeColorsText } from './colorScope'
import type { ArtifactTypeId } from './types'

/** Adapted tints ready to apply as CSS `color`; `undefined` ⇒ no tint (use inherit). */
type ResolvedSlotTints = {
  artifact: string | undefined
  accessory: string | undefined
}

type SlotTintContextValue = {
  // Tints for text/icon contexts (set when scope colours text).
  text: ResolvedSlotTints
  // Tints for control contexts: slot toggle grids / selects (set when scope colours controls).
  control: ResolvedSlotTints
}

const EMPTY: ResolvedSlotTints = { artifact: undefined, accessory: undefined }
const SlotTintContext = createContext<SlotTintContextValue>({ text: EMPTY, control: EMPTY })

// True inside slot CONTROL contexts (builder toggle grids / slot selects), so glyphs there read the
// control-scoped tint.
const SlotTintControlContext = createContext<boolean>(false)

export function SlotTintProvider({
  scope,
  tints,
  children,
}: {
  /** The slot colour scope (off / controls / text / everything). */
  scope: ColorScope
  /** Raw (unadapted) tint hues; defaults applied when omitted. */
  tints?: SlotTints
  children: React.ReactNode
}) {
  // Same contrast adapter substat fg colours use — recomputes only when the scheme changes.
  const adaptFg = useSubstatFgAdapter()
  const artifactRaw = tints?.artifact ?? DEFAULT_SLOT_TINTS.artifact
  const accessoryRaw = tints?.accessory ?? DEFAULT_SLOT_TINTS.accessory

  const value = useMemo<SlotTintContextValue>(() => {
    const controls = scopeColorsControls(scope)
    const text = scopeColorsText(scope)
    if (!controls && !text) return { text: EMPTY, control: EMPTY }
    const adapted: ResolvedSlotTints = { artifact: adaptFg(artifactRaw), accessory: adaptFg(accessoryRaw) }
    return { text: text ? adapted : EMPTY, control: controls ? adapted : EMPTY }
  }, [scope, adaptFg, artifactRaw, accessoryRaw])

  return <SlotTintContext value={value}>{children}</SlotTintContext>
}

/** Wrap slot CONTROL contexts (builder slot toggle grids, slot selects) so glyphs use the control tint. */
export function SlotTintControlScope({ children }: { children: React.ReactNode }) {
  return <SlotTintControlContext value={true}>{children}</SlotTintControlContext>
}

/**
 * Resolved CSS colour for a slot's glyph, or `undefined` when out of scope. Consumed by the icon
 * factory. Reads the control-scoped tint inside `SlotTintControlScope`, else the text-scoped tint.
 * Reuses `isAccessorySlot` as the artifact-vs-accessory SSOT.
 */
export function useSlotTintColor(slot: ArtifactTypeId): string | undefined {
  const { text, control } = use(SlotTintContext)
  const inControl = use(SlotTintControlContext)
  const tints = inControl ? control : text
  return isAccessorySlot(slot) ? tints.accessory : tints.artifact
}
