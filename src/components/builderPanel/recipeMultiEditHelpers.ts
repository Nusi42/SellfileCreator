import type {
  MultiEditArrayPatch,
  MultiEditRollPatch,
  MultiEditRollPatchEntry,
  MultiEditTargetPatch,
} from '../../lib/recipeMultiEditDraft'
import type { SubstatRollTargetEntry } from '../../lib/hsfBuilder'
import type { ArtifactSetSelectionEntry } from '../../lib/gearSets/selection'
import { normalizeArtifactSetSelections } from '../../lib/gearSets/selection'

// Multi-edit tri-state helpers keep toggles deterministic when several recipes
// are patched at once; the UI needs a canonical "all/mixed/none" baseline.
export type TriStateBase = 'all' | 'mixed' | 'none'

/**
 * applyArrayPatchCount
 *
 * Given a base count (how many of the N total rules/recipes include `element`),
 * applies a pending multi-edit number-array patch and returns the effective count.
 * Encodes the shared patch-application logic used by both RecipeBuilderPanel
 * (as resolveTokenPresence) and SafeguardBuilderPanel (as getArrayPresence) — SSOT.
 */
export const applyArrayPatchCount = (
  baseCount: number,
  total: number,
  patch: MultiEditArrayPatch<number> | null | undefined,
  element: number,
): number => {
  if (!patch) return baseCount
  if (patch.clear) return 0
  if (patch.replace) return patch.replace.map(Number).includes(element) ? total : 0
  let count = baseCount
  if (patch.remove?.map(Number).includes(element)) count = 0
  else if (patch.add?.map(Number).includes(element)) count = total
  return Math.max(0, Math.min(total, count))
}

export const deriveBaseTriState = (count: number, total: number): TriStateBase => {
  if (total <= 0 || count <= 0) return 'none'
  if (count >= total) return 'all'
  return 'mixed'
}

export const toTriStateBase = (state: 'none' | 'partial' | 'all'): TriStateBase => (
  state === 'partial' ? 'mixed' : state
)

// Clone helpers always return fresh patch objects so derived reducers can mutate
// freely before React comparisons run; they also cleanly handle `undefined`.
const cloneNumberArrayPatch = (
  patch: MultiEditArrayPatch<number> | null | undefined,
): MultiEditArrayPatch<number> | null => {
  if (!patch) return null
  return {
    clear: patch.clear,
    replace: patch.replace ? [...patch.replace] : undefined,
    add: patch.add ? [...patch.add] : undefined,
    remove: patch.remove ? [...patch.remove] : undefined,
  }
}

// Toggle helpers translate checkbox clicks into additive patches so multi-edit
// previews stay faithful even when several controls touch the same arrays.
export const computeNumberPatchToggle = (
  patch: MultiEditArrayPatch<number> | null | undefined,
  variant: number,
  baseState: TriStateBase,
  target: 'all' | 'none',
): MultiEditArrayPatch<number> | null => {
  const draft = cloneNumberArrayPatch(patch)
  if (draft?.clear) {
    if (target === 'all') {
      return { replace: [variant] }
    }
    return { clear: true }
  }
  if (draft?.replace) {
    const values = new Set(draft.replace.map(Number))
    if (target === 'all') {
      values.add(variant)
    } else {
      values.delete(variant)
    }
    if (values.size === 0) {
      return { clear: true }
    }
    return { replace: Array.from(values).sort((a, b) => a - b) }
  }
  const addSet = new Set<number>((draft?.add ?? []).map(Number))
  const removeSet = new Set<number>((draft?.remove ?? []).map(Number))

  if (target === 'all') {
    removeSet.delete(variant)
    if (baseState !== 'all') {
      addSet.add(variant)
    } else {
      addSet.delete(variant)
    }
  } else {
    addSet.delete(variant)
    if (baseState !== 'none') {
      removeSet.add(variant)
    } else {
      removeSet.delete(variant)
    }
  }

  const nextPatch: MultiEditArrayPatch<number> = {}
  if (addSet.size > 0) nextPatch.add = Array.from(addSet)
  if (removeSet.size > 0) nextPatch.remove = Array.from(removeSet)
  return (nextPatch.add || nextPatch.remove) ? nextPatch : null
}

// Set selection toggles operate on entry objects to preserve exclusion metadata.
export const computeArtifactSetPatchToggle = (
  patch: MultiEditArrayPatch<ArtifactSetSelectionEntry> | null | undefined,
  setId: number,
  baseState: TriStateBase,
  target: 'all' | 'none',
): MultiEditArrayPatch<ArtifactSetSelectionEntry> | null => {
  // Keep mutations local so callers never edit the incoming patch in place.
  const draft = patch ?? null
  if (draft?.clear) {
    // Clear overrides everything; only restore the set when toggling on.
    if (target === 'all') {
      return { replace: [{ id: setId }] }
    }
    return { clear: true }
  }
  if (draft?.replace) {
    // Replace arrays override the baseline; merge new toggle into that list.
    const normalized = normalizeArtifactSetSelections(draft.replace)
    const filtered = normalized.filter((entry) => Number(entry.id) !== setId)
    if (target === 'all') {
      filtered.push({ id: setId })
    }
    const next = normalizeArtifactSetSelections(filtered)
    if (next.length === 0) {
      return { clear: true }
    }
    return { replace: next }
  }
  // Add/remove arrays operate on explicit includes only.
  const addEntries = normalizeArtifactSetSelections(draft?.add ?? [])
  const removeEntries = normalizeArtifactSetSelections(draft?.remove ?? [])
  const nextAdd = addEntries.filter((entry) => Number(entry.id) !== setId)
  const nextRemove = removeEntries.filter((entry) => Number(entry.id) !== setId)
  if (target === 'all') {
    // Only add when the base state is not already "all".
    if (baseState !== 'all') {
      nextAdd.push({ id: setId })
    }
  } else {
    // Only remove when the base state is not already "none".
    if (baseState !== 'none') {
      nextRemove.push({ id: setId })
    }
  }
  const nextPatch: MultiEditArrayPatch<ArtifactSetSelectionEntry> = {}
  // Commit only the deltas we actually touched.
  if (nextAdd.length > 0) nextPatch.add = nextAdd
  if (nextRemove.length > 0) nextPatch.remove = nextRemove
  return (nextPatch.add || nextPatch.remove) ? nextPatch : null
}

const cloneStringArrayPatch = (
  patch: MultiEditArrayPatch<string> | null | undefined,
): MultiEditArrayPatch<string> | null => {
  if (!patch) return null
  return {
    clear: patch.clear,
    replace: patch.replace ? [...patch.replace] : undefined,
    add: patch.add ? [...patch.add] : undefined,
    remove: patch.remove ? [...patch.remove] : undefined,
  }
}

export const computeStringPatchToggle = (
  patch: MultiEditArrayPatch<string> | null | undefined,
  token: string,
  baseState: TriStateBase,
  target: 'all' | 'none',
): MultiEditArrayPatch<string> | null => {
  const draft = cloneStringArrayPatch(patch)
  if (draft?.clear) {
    if (target === 'all') {
      return { replace: [token] }
    }
    return { clear: true }
  }
  if (draft?.replace) {
    const values = new Set(draft.replace.map(String))
    if (target === 'all') {
      values.add(token)
    } else {
      values.delete(token)
    }
    if (values.size === 0) {
      return { clear: true }
    }
    return { replace: Array.from(values).sort((a, b) => a.localeCompare(b)) }
  }
  const addSet = new Set<string>((draft?.add ?? []).map(String))
  const removeSet = new Set<string>((draft?.remove ?? []).map(String))

  if (target === 'all') {
    removeSet.delete(token)
    if (baseState !== 'all') {
      addSet.add(token)
    } else {
      addSet.delete(token)
    }
  } else {
    addSet.delete(token)
    if (baseState !== 'none') {
      removeSet.add(token)
    } else {
      removeSet.delete(token)
    }
  }

  const nextPatch: MultiEditArrayPatch<string> = {}
  if (addSet.size > 0) nextPatch.add = Array.from(addSet)
  if (removeSet.size > 0) nextPatch.remove = Array.from(removeSet)
  return (nextPatch.add || nextPatch.remove) ? nextPatch : null
}

// Merge functions compose per-variant roll edits so typing in the context menu
// never stomps over pending entries queued by other interactions.
export const mergeRollPatchForVariant = (
  source: MultiEditRollPatch | null | undefined,
  variant: number,
  delta: MultiEditRollPatchEntry,
): MultiEditRollPatch | null => {
  const result: MultiEditRollPatch = {}
  if (source) {
    for (const [key, value] of Object.entries(source)) {
      const idx = Number(key)
      if (!Number.isFinite(idx)) continue
      result[idx] = value ? { ...value } : {}
    }
  }
  const previous = result[variant] ? { ...result[variant]! } : {}
  if (Object.prototype.hasOwnProperty.call(delta, 'any')) {
    const nextAny = delta.any
    if (nextAny === undefined) {
      delete previous.any
    } else {
      previous.any = nextAny
    }
  }
  if (Object.prototype.hasOwnProperty.call(delta, 'min')) {
    const nextMin = delta.min
    if (nextMin === undefined) {
      delete previous.min
    } else {
      previous.min = nextMin
    }
  }
  if (Object.prototype.hasOwnProperty.call(delta, 'max')) {
    const nextMax = delta.max
    if (nextMax === undefined) {
      delete previous.max
    } else {
      previous.max = nextMax
    }
  }
  if (Object.keys(previous).length === 0) {
    delete result[variant]
  } else {
    result[variant] = previous
  }
  return Object.keys(result).length > 0 ? result : null
}

const cloneTargetPatchValue = (entry: SubstatRollTargetEntry | null): SubstatRollTargetEntry | null => {
  if (!entry) return entry
  const clone: SubstatRollTargetEntry = {}
  if (typeof entry.base === 'number' && Number.isFinite(entry.base)) {
    clone.base = entry.base
  }
  if (Array.isArray(entry.increments)) {
    clone.increments = entry.increments.map((value) => (
      typeof value === 'number' && Number.isFinite(value) ? value : null
    ))
  }
  return clone
}

export const mergeTargetPatchForVariant = (
  source: MultiEditTargetPatch | null | undefined,
  variant: number,
  value: SubstatRollTargetEntry | null,
): MultiEditTargetPatch | null => {
  const result: MultiEditTargetPatch = {}
  if (source) {
    for (const [key, entry] of Object.entries(source)) {
      const idx = Number(key)
      if (!Number.isFinite(idx)) continue
      if (entry) {
        const nextEntry: { value?: SubstatRollTargetEntry | null } = {}
        if (Object.prototype.hasOwnProperty.call(entry, 'value')) {
          const entryValue = (entry as { value?: SubstatRollTargetEntry | null }).value
          if (entryValue === undefined) {
            delete nextEntry.value
          } else {
            nextEntry.value = entryValue === null ? null : cloneTargetPatchValue(entryValue)
          }
        }
        if (Object.keys(nextEntry).length > 0) {
          result[idx] = nextEntry
        }
      }
    }
  }
  result[variant] = {
    value: value == null ? value : cloneTargetPatchValue(value),
  }
  return Object.keys(result).length > 0 ? result : null
}

// Preview builders let the UI render the "effective" selection while the user
// hovers a menu without committing the patch to BuilderRecipe yet.
export const applyNumberPatchPreview = (
  source: readonly number[],
  patch: MultiEditArrayPatch<number> | null | undefined,
): number[] => {
  if (!patch || (!patch.clear && !patch.replace && !patch.add && !patch.remove)) {
    return [...source]
  }
  if (patch.clear) return []
  if (patch.replace && patch.replace.length >= 0) {
    return Array.from(new Set(patch.replace.map(Number))).sort((a, b) => a - b)
  }
  const set = new Set(source.map(Number))
  if (patch.remove) {
    for (const value of patch.remove) set.delete(Number(value))
  }
  if (patch.add) {
    for (const value of patch.add) set.add(Number(value))
  }
  return Array.from(set).sort((a, b) => a - b)
}

export const applyArtifactSetPatchPreview = (
  source: readonly ArtifactSetSelectionEntry[],
  patch: MultiEditArrayPatch<ArtifactSetSelectionEntry> | null | undefined,
): ArtifactSetSelectionEntry[] => {
  // Normalize first so preview output always uses canonical entries.
  const normalizedSource = normalizeArtifactSetSelections(source)
  // No patch -> just return the normalized source.
  if (!patch || (!patch.clear && !patch.replace && !patch.add && !patch.remove)) {
    return normalizeArtifactSetSelections(normalizedSource)
  }
  // Clear wipes all selections immediately.
  if (patch.clear) return []
  if (patch.replace) {
    // Replace snapshots override everything else.
    return normalizeArtifactSetSelections(patch.replace)
  }
  // Apply removals before additions so toggles behave predictably.
  const removeIds = new Set(normalizeArtifactSetSelections(patch.remove ?? []).map((entry) => Number(entry.id)))
  const filtered = normalizedSource.filter((entry) => !removeIds.has(Number(entry.id)))
  // Merge any add entries onto the filtered baseline.
  const addEntries = normalizeArtifactSetSelections(patch.add ?? [])
  return normalizeArtifactSetSelections([...filtered, ...addEntries])
}

export const applyStringPatchPreview = (
  source: readonly string[],
  patch: MultiEditArrayPatch<string> | null | undefined,
): string[] => {
  if (!patch || (!patch.clear && !patch.replace && !patch.add && !patch.remove)) {
    return [...source]
  }
  if (patch.clear) return []
  if (patch.replace && patch.replace.length >= 0) {
    return Array.from(new Set(patch.replace.map(String))).sort((a, b) => a.localeCompare(b))
  }
  const set = new Set(source.map(String))
  if (patch.remove) {
    for (const value of patch.remove) set.delete(String(value))
  }
  if (patch.add) {
    for (const value of patch.add) set.add(String(value))
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}
