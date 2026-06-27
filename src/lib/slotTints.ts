/**
 * slotTints
 *
 * Single source of truth for the gear-slot glyph tints. The top 6 (artifact) slots render with a
 * subtle light-yellow tint and the bottom 3 (accessory) slots with a subtle light-blue tint.
 * Both colours are user-editable (Manage Colors flyout) and gated by the global
 * `slotColorScope` (off / labels / everything) — the slot group's colour scope.
 *
 * The defaults below are the *unadapted* base hues; legibility against the runtime scheme is
 * handled at render time by the same contrast adapter substat fg colours use
 * (`useSubstatFgAdapter`) — see `slotTintContext.tsx`.
 */
import { useCallback, useState } from 'react'
import { SLOT_TINT_STORAGE_KEY } from './constants'
import { isAccessorySlot } from './gearInspectorDomain'
import type { ArtifactTypeId } from './types'
import { parseCssColorToRgb } from './colorUtils'

/** The two configurable tint hues. fg-only: slot SVGs are single-fill, so no bg/alpha. */
export type SlotTints = {
  /** Top 6 slots (weapon/helmet/shield/gauntlets/chestplate/boots). */
  artifact: string
  /** Bottom 3 slots (ring/amulet/banner). */
  accessory: string
}

// Subtle-but-visible pale hues. Adaptation at render keeps them legible in light & dark schemes.
export const DEFAULT_SLOT_TINT_ARTIFACT = '#E8DFA0' // pale yellow
export const DEFAULT_SLOT_TINT_ACCESSORY = '#A8C8E8' // pale blue

/** The factory defaults as a ready-to-use object — also the Reset target. */
export const DEFAULT_SLOT_TINTS: SlotTints = Object.freeze({
  artifact: DEFAULT_SLOT_TINT_ARTIFACT,
  accessory: DEFAULT_SLOT_TINT_ACCESSORY,
})

/**
 * Pick the raw (unadapted) tint hue for a slot. Reuses `isAccessorySlot` as the SSOT for the
 * artifact-vs-accessory split — never re-classify slots here.
 */
export function rawSlotTintFor(slot: ArtifactTypeId, tints: SlotTints): string {
  return isAccessorySlot(slot) ? tints.accessory : tints.artifact
}

/** Accept only a valid CSS-parseable colour; fall back to the supplied default otherwise. */
function sanitizeTint(value: unknown, fallback: string): string {
  return typeof value === 'string' && parseCssColorToRgb(value) ? value : fallback
}

/** Merge a persisted blob with defaults, dropping anything unparseable. */
function coerceSlotTints(raw: unknown): SlotTints {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SLOT_TINTS }
  const obj = raw as Partial<Record<keyof SlotTints, unknown>> & { armor?: unknown }
  // Migration: the artifact tint was previously persisted under the `armor` key.
  // Honor an older blob so a user's saved colour is not silently lost on rename.
  const artifactRaw = obj.artifact ?? obj.armor
  return {
    artifact: sanitizeTint(artifactRaw, DEFAULT_SLOT_TINT_ARTIFACT),
    accessory: sanitizeTint(obj.accessory, DEFAULT_SLOT_TINT_ACCESSORY),
  }
}

/** Best-effort persistence — mirrors the substat-colour persistence policy. */
function persistSlotTints(next: SlotTints): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SLOT_TINT_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore — persistence is best-effort
  }
}

/**
 * Stateful slot-tint hook, mirroring `useSubstatColors`: reads/persists the tint pair and
 * tolerates a missing or corrupt key (no migration from any legacy flag — just don't crash).
 */
export function useSlotTints(): [SlotTints, React.Dispatch<React.SetStateAction<SlotTints>>] {
  const [tints, setTints] = useState<SlotTints>(() => {
    try {
      const raw = localStorage.getItem(SLOT_TINT_STORAGE_KEY)
      return raw ? coerceSlotTints(JSON.parse(raw)) : { ...DEFAULT_SLOT_TINTS }
    } catch {
      return { ...DEFAULT_SLOT_TINTS }
    }
  })
  const setAndPersist = useCallback<React.Dispatch<React.SetStateAction<SlotTints>>>((value) => {
    setTints((prev) => {
      const next = typeof value === 'function' ? (value as (p: SlotTints) => SlotTints)(prev) : value
      if (next === prev) return prev
      persistSlotTints(next)
      return next
    })
  }, [])
  return [tints, setAndPersist]
}
