/**
 * presetPatch.ts
 *
 * Apply a JSON patch to a raw SFC preset file as a pure JSON→JSON transform.
 *
 * Why: Release builds need to ship a tweaked variant of a base preset (drop
 * a metaset, disable a safeguard, etc.) without forking the source SFC. This
 * module reads the SFC as raw JSON, applies declarative ops from a patch
 * file, and returns a new SFC JSON ready to feed into the existing release
 * pipeline (gen-release-hsf, parseSfcText, etc.).
 *
 * Design:
 *  - Pure: input is deep-cloned; output is a fresh object.
 *  - Strict: unknown targets, ambiguous name lookups, and out-of-range
 *    indices throw — release builds should fail loudly, not silently drift.
 *  - Stable indices: all target references in a single op group are resolved
 *    to object identity BEFORE any mutation, so `remove: [3, 5]` works even
 *    though removing index 3 would otherwise shift index 5.
 *  - Targets are 1-based by design — patch files are author-facing and
 *    1-based indexing matches the way they appear in the Note prose
 *    (e.g. `<!-- safeguards:1,2,7 -->`).
 *
 * Schema awareness:
 *  - Recipes & safeguards can carry their name under either `appearance.name`
 *    (current schema, written by the app today) or top-level `name` (legacy
 *    schema used by older SFC files like beginner.sfc). Name resolution
 *    checks both; the documented schema is mentioned in PATCHES.md.
 *  - Soft-disable maps to schema fields that already exist:
 *      recipe   → SellfileVisibility = "Disabled"
 *      safeguard → activation = "off"
 *    No new fields are introduced.
 */

// Raw SFC shape — only fields the patch touches are typed; everything else
// is preserved verbatim. Using Record<string, unknown> keeps the patcher
// schema-evolution-safe: unknown keys round-trip untouched.
export type RawSfcFile = Record<string, unknown> & {
  Metasets?: unknown[]
  Recipes?: unknown[]
  Safeguards?: unknown[]
  Note?: string | string[]
  SafeguardsEnabled?: boolean
  RecipesEnabled?: boolean
  NoteRecipeOverridesAnswers?: Record<string, string[]>
  NoteSafeguardOverridesAnswers?: Record<string, string[]>
  NoteRecipeOverridesDisabled?: boolean
}

// Wire key names for the dynamic-overrides answers. Declared locally on purpose:
// this module is deliberately dependency-free (the release CLI compiles it standalone),
// and the canonical definitions live in noteRecipeOverrides.ts / noteSafeguardOverrides.ts,
// which pull in the whole app graph. Every other SFC key here is likewise a literal.
// These names are part of the persisted SFC format and must never change — see
// docs/technical/app-behavior.md ("Document answers"). Pinned by preset-patch.test.ts,
// which asserts them against the app's own exported constants so a rename fails loudly.
const NOTE_RECIPE_OVERRIDES_ANSWERS_KEY = 'NoteRecipeOverridesAnswers'
const NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY = 'NoteSafeguardOverridesAnswers'
const NOTE_DYNAMIC_OVERRIDES_DISABLED_KEY = 'NoteRecipeOverridesDisabled'

// A target identifies a single entry in Metasets/Recipes/Safeguards.
// String → match by name (must be unique). Number → 1-based array index.
export type PresetPatchTarget = string | number

// Metaset edit ops. Field semantics mirror the SFC's Metasets[].* shape.
export type PresetPatchMetasetEdit = {
  target: PresetPatchTarget
  rename?: string
  show?: boolean
  // Replace the entire setNames list (mutually exclusive with add/remove).
  setNames?: string[]
  // Mutate the existing list — add or remove individual set names.
  addSetNames?: string[]
  removeSetNames?: string[]
}

// Recipe edit ops. `disable` is the ergonomic shorthand for the schema
// field SellfileVisibility = "Disabled"; `visibility` lets the patch pick
// any of the three states explicitly.
export type PresetPatchRecipeEdit = {
  target: PresetPatchTarget
  rename?: string
  disable?: boolean
  visibility?: 'Active' | 'Disabled' | 'Separator'
}

// Safeguard edit ops. `disable` maps to activation="off"; `activation` is
// the explicit form. `requiredCount` is included as a common tweak target.
export type PresetPatchSafeguardEdit = {
  target: PresetPatchTarget
  rename?: string
  disable?: boolean
  activation?: 'off' | 'protectExisting' | 'anticipateGaps' | 'anticipateImprovements'
  requiredCount?: number
}

// Note ops: regex find/replace + bulk append/prepend.
// `pattern` is a regex source string; `flags` defaults to 'g'. The patcher
// joins array-shaped Notes into a single string with '\n' before applying
// regex replacements and splits the result back when the input was an array.
export type PresetPatchNoteReplaceOp = {
  pattern: string
  flags?: string
  replacement: string
}

export type PresetPatchNoteOps = {
  replace?: PresetPatchNoteReplaceOp[]
  append?: string | string[]
  prepend?: string | string[]
}

// Full patch payload. All top-level fields are optional; a patch may touch
// any subset of the SFC. Order of application within each domain:
// 1) resolve targets → 2) apply edits in-place → 3) remove → 4) add.
export type PresetPatch = {
  metasets?: {
    remove?: PresetPatchTarget[]
    add?: Array<Record<string, unknown>>
    edit?: PresetPatchMetasetEdit[]
  }
  recipes?: {
    remove?: PresetPatchTarget[]
    add?: Array<Record<string, unknown>>
    edit?: PresetPatchRecipeEdit[]
  }
  safeguards?: {
    remove?: PresetPatchTarget[]
    add?: Array<Record<string, unknown>>
    edit?: PresetPatchSafeguardEdit[]
  }
  note?: PresetPatchNoteOps
  // Toggle the global enable flags. Useful for release variants that need to
  // ship with safeguards disabled by default.
  safeguardsEnabled?: boolean
  recipesEnabled?: boolean
  // Dynamic-overrides answers the shipped preset should START in. Without these
  // a loaded preset falls back to the Note DSL's authored defaults (the `*` option
  // / each slider's `default=`), so this is how a release variant pins a different
  // account tier or slider position without editing the DSL itself.
  // Whole-value replace (not a merge): the patch states the full answer map, which
  // keeps a patch file readable as "this is the configuration we ship".
  noteRecipeOverridesAnswers?: Record<string, string[]>
  noteSafeguardOverridesAnswers?: Record<string, string[]>
  // Ship with dynamic overrides switched off entirely (markers stay in the Note).
  noteRecipeOverridesDisabled?: boolean
}

// Thrown for any patch resolution or application failure. Carries a path
// hint so the caller can pinpoint which op failed.
export class PresetPatchError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`[preset-patch ${path}] ${message}`)
    this.name = 'PresetPatchError'
  }
}

// Domain label used when reporting errors. Kept as a literal union so error
// messages stay consistent across domains.
type Domain = 'metasets' | 'recipes' | 'safeguards'

// Extract the display name from an entry. Checks `appearance.name` first
// (current schema) and falls back to top-level `name` (legacy schema).
// Returns null when the entry has neither — those are reachable only via
// index targeting.
const readName = (entry: unknown): string | null => {
  if (!entry || typeof entry !== 'object') return null
  const rec = entry as Record<string, unknown>
  const appearance = rec['appearance']
  if (appearance && typeof appearance === 'object') {
    const inner = (appearance as Record<string, unknown>)['name']
    if (typeof inner === 'string' && inner.length > 0) return inner
  }
  const top = rec['name']
  if (typeof top === 'string' && top.length > 0) return top
  return null
}

// Set the display name on an entry, preferring whichever slot the entry
// already uses. New entries created via `add` default to writing the name
// where the source preset stores it; for safety we update both if both
// exist so name-based lookups stay consistent after a rename.
const writeName = (entry: Record<string, unknown>, name: string): void => {
  const appearance = entry['appearance']
  if (appearance && typeof appearance === 'object') {
    (appearance as Record<string, unknown>)['name'] = name
    // If a top-level mirror was present, keep it in sync to avoid stale
    // lookups by older parsers / tooling.
    if (typeof entry['name'] === 'string') entry['name'] = name
    return
  }
  // No appearance object — write to top-level (matches beginner.sfc shape).
  entry['name'] = name
}

// Resolve a single target reference to an array index. Throws on missing,
// out-of-range, or ambiguous lookups.
const resolveTargetIndex = (
  array: unknown[],
  target: PresetPatchTarget,
  domain: Domain,
  path: string,
): number => {
  // Numeric target — 1-based index into the array as authored.
  if (typeof target === 'number') {
    if (!Number.isInteger(target)) {
      throw new PresetPatchError(path, `${domain} index must be an integer, got ${target}`)
    }
    if (target < 1 || target > array.length) {
      throw new PresetPatchError(
        path,
        `${domain} index ${target} out of range (1..${array.length})`,
      )
    }
    return target - 1
  }
  // String target — must match exactly one entry by name.
  const needle = target.trim()
  if (!needle) {
    throw new PresetPatchError(path, `${domain} target string is empty`)
  }
  const matches: number[] = []
  for (let i = 0; i < array.length; i += 1) {
    if (readName(array[i]) === needle) matches.push(i)
  }
  if (matches.length === 0) {
    throw new PresetPatchError(path, `${domain} entry named '${needle}' not found`)
  }
  if (matches.length > 1) {
    // Ambiguous names are common in lategame.sfc — surface every conflicting
    // 1-based index so the user can pick one to address by index instead.
    const oneBased = matches.map((i) => i + 1).join(', ')
    throw new PresetPatchError(
      path,
      `${domain} name '${needle}' is ambiguous — ${matches.length} entries at indices ${oneBased}; use a numeric index to disambiguate`,
    )
  }
  return matches[0]!
}

// Resolve a list of targets to a set of indices. Used by `remove` lists
// where order does not matter and duplicates should be collapsed.
const resolveTargetSet = (
  array: unknown[],
  targets: PresetPatchTarget[] | undefined,
  domain: Domain,
  path: string,
): Set<number> => {
  const out = new Set<number>()
  if (!targets) return out
  for (let i = 0; i < targets.length; i += 1) {
    out.add(resolveTargetIndex(array, targets[i]!, domain, `${path}[${i}]`))
  }
  return out
}

// Apply the metasets section of the patch. Each metaset is a plain object;
// edits mutate fields in place, removes drop entries from the output, adds
// append to the array.
const applyMetasetsPatch = (
  metasets: unknown[],
  ops: NonNullable<PresetPatch['metasets']>,
  basePath: string,
): unknown[] => {
  // Resolve edit and remove targets up front so indices are stable.
  const editEntries = (ops.edit ?? []).map((edit, i) => ({
    edit,
    index: resolveTargetIndex(metasets, edit.target, 'metasets', `${basePath}.edit[${i}].target`),
  }))
  const removeIndices = resolveTargetSet(metasets, ops.remove, 'metasets', `${basePath}.remove`)
  // Apply edits in place on the cloned array (cloning already happened
  // at the top-level applyPresetPatch entry point).
  for (let i = 0; i < editEntries.length; i += 1) {
    const { edit, index } = editEntries[i]!
    const entry = metasets[index] as Record<string, unknown> | undefined
    if (!entry || typeof entry !== 'object') {
      throw new PresetPatchError(
        `${basePath}.edit[${i}]`,
        `metaset at index ${index + 1} is not an object`,
      )
    }
    if (edit.rename !== undefined) writeName(entry, edit.rename)
    if (edit.show !== undefined) entry['show'] = edit.show
    // setNames replace is mutually exclusive with add/remove for clarity.
    if (edit.setNames !== undefined) {
      if (edit.addSetNames || edit.removeSetNames) {
        throw new PresetPatchError(
          `${basePath}.edit[${i}]`,
          `setNames (replace) cannot be combined with addSetNames or removeSetNames`,
        )
      }
      entry['setNames'] = [...edit.setNames]
    } else if (edit.addSetNames || edit.removeSetNames) {
      const current = Array.isArray(entry['setNames']) ? (entry['setNames'] as string[]) : []
      const removeSet = new Set(edit.removeSetNames ?? [])
      const next = current.filter((n) => !removeSet.has(n))
      if (edit.addSetNames) {
        for (const n of edit.addSetNames) {
          // Skip duplicates so repeated patches stay idempotent.
          if (!next.includes(n)) next.push(n)
        }
      }
      entry['setNames'] = next
    }
  }
  // Remove resolved indices; preserve insertion order otherwise.
  const filtered = metasets.filter((_, i) => !removeIndices.has(i))
  // Append adds, deep-cloning so the caller's patch payload stays untouched.
  if (ops.add) {
    for (const item of ops.add) {
      filtered.push(structuredClone(item) as Record<string, unknown>)
    }
  }
  return filtered
}

// Apply the recipes section. Shape mirrors applyMetasetsPatch but the edit
// surface is narrower — only fields commonly tweaked at release time.
const applyRecipesPatch = (
  recipes: unknown[],
  ops: NonNullable<PresetPatch['recipes']>,
  basePath: string,
): unknown[] => {
  const editEntries = (ops.edit ?? []).map((edit, i) => ({
    edit,
    index: resolveTargetIndex(recipes, edit.target, 'recipes', `${basePath}.edit[${i}].target`),
  }))
  const removeIndices = resolveTargetSet(recipes, ops.remove, 'recipes', `${basePath}.remove`)
  for (let i = 0; i < editEntries.length; i += 1) {
    const { edit, index } = editEntries[i]!
    const entry = recipes[index] as Record<string, unknown> | undefined
    if (!entry || typeof entry !== 'object') {
      throw new PresetPatchError(
        `${basePath}.edit[${i}]`,
        `recipe at index ${index + 1} is not an object`,
      )
    }
    if (edit.rename !== undefined) writeName(entry, edit.rename)
    // Explicit visibility wins over the boolean shorthand when both appear.
    if (edit.visibility !== undefined) {
      entry['SellfileVisibility'] = edit.visibility
    } else if (edit.disable === true) {
      entry['SellfileVisibility'] = 'Disabled'
    } else if (edit.disable === false) {
      // Re-enable: only meaningful if the recipe was previously disabled.
      if (entry['SellfileVisibility'] === 'Disabled') entry['SellfileVisibility'] = 'Active'
    }
  }
  const filtered = recipes.filter((_, i) => !removeIndices.has(i))
  if (ops.add) {
    for (const item of ops.add) {
      filtered.push(structuredClone(item) as Record<string, unknown>)
    }
  }
  return filtered
}

// Apply the safeguards section. Same structural pattern as recipes.
const applySafeguardsPatch = (
  safeguards: unknown[],
  ops: NonNullable<PresetPatch['safeguards']>,
  basePath: string,
): unknown[] => {
  const editEntries = (ops.edit ?? []).map((edit, i) => ({
    edit,
    index: resolveTargetIndex(safeguards, edit.target, 'safeguards', `${basePath}.edit[${i}].target`),
  }))
  const removeIndices = resolveTargetSet(safeguards, ops.remove, 'safeguards', `${basePath}.remove`)
  for (let i = 0; i < editEntries.length; i += 1) {
    const { edit, index } = editEntries[i]!
    const entry = safeguards[index] as Record<string, unknown> | undefined
    if (!entry || typeof entry !== 'object') {
      throw new PresetPatchError(
        `${basePath}.edit[${i}]`,
        `safeguard at index ${index + 1} is not an object`,
      )
    }
    if (edit.rename !== undefined) writeName(entry, edit.rename)
    if (edit.activation !== undefined) {
      entry['activation'] = edit.activation
    } else if (edit.disable === true) {
      entry['activation'] = 'off'
    } else if (edit.disable === false) {
      // Re-enable: bump from 'off' back to the default protectExisting mode.
      if (entry['activation'] === 'off') entry['activation'] = 'protectExisting'
    }
    if (edit.requiredCount !== undefined) entry['requiredCount'] = edit.requiredCount
  }
  const filtered = safeguards.filter((_, i) => !removeIndices.has(i))
  if (ops.add) {
    for (const item of ops.add) {
      filtered.push(structuredClone(item) as Record<string, unknown>)
    }
  }
  return filtered
}

// Normalize a Note value to an array of lines, remembering its original
// shape so we can restore it after applying ops.
type NoteShape = 'string' | 'array' | 'absent'

const readNoteLines = (note: string | string[] | undefined): { lines: string[]; shape: NoteShape } => {
  if (note === undefined) return { lines: [], shape: 'absent' }
  if (typeof note === 'string') return { lines: note.split(/\r?\n/), shape: 'string' }
  return { lines: note.slice(), shape: 'array' }
}

// Restore a Note value to its original shape; an op that wrote content into
// an absent Note upgrades the shape to 'array' (the modern default).
const writeNoteLines = (lines: string[], shape: NoteShape): string | string[] | undefined => {
  if (shape === 'absent' && lines.length === 0) return undefined
  if (shape === 'string') return lines.join('\n')
  return lines
}

// Coerce string-or-array note input from append/prepend into a string[].
const coerceLines = (value: string | string[]): string[] => (
  Array.isArray(value) ? value.slice() : value.split(/\r?\n/)
)

// Apply Note ops in order: prepend → append → replace. (Replace last so
// regex patterns can target appended/prepended content if desired.)
const applyNotePatch = (
  note: string | string[] | undefined,
  ops: PresetPatchNoteOps,
  basePath: string,
): string | string[] | undefined => {
  const { lines: initialLines, shape } = readNoteLines(note)
  let lines = initialLines
  let effectiveShape: NoteShape = shape
  if (ops.prepend !== undefined) {
    lines = [...coerceLines(ops.prepend), ...lines]
    if (effectiveShape === 'absent') effectiveShape = 'array'
  }
  if (ops.append !== undefined) {
    lines = [...lines, ...coerceLines(ops.append)]
    if (effectiveShape === 'absent') effectiveShape = 'array'
  }
  if (ops.replace && ops.replace.length > 0) {
    // Operate on the joined string so multi-line patterns work naturally.
    let joined = lines.join('\n')
    for (let i = 0; i < ops.replace.length; i += 1) {
      const op = ops.replace[i]!
      const flags = op.flags ?? 'g'
      let regex: RegExp
      try {
        regex = new RegExp(op.pattern, flags)
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        throw new PresetPatchError(`${basePath}.replace[${i}]`, `invalid regex /${op.pattern}/${flags}: ${reason}`)
      }
      joined = joined.replace(regex, op.replacement)
    }
    lines = joined.split('\n')
    if (effectiveShape === 'absent') effectiveShape = 'array'
  }
  return writeNoteLines(lines, effectiveShape)
}

// Top-level: deep-clone the input SFC, apply each requested section, and
// return the result. Sections may be omitted; missing sections are no-ops.
export function applyPresetPatch(sfc: RawSfcFile, patch: PresetPatch): RawSfcFile {
  // Deep-clone so the caller's input stays pristine even if the patcher
  // happens to mutate intermediate objects (we use in-place edits for the
  // per-entry edit ops below).
  const out = structuredClone(sfc) as RawSfcFile
  if (patch.metasets) {
    // Default to an empty array when the field is missing — adds can then
    // populate it from scratch.
    const arr = Array.isArray(out.Metasets) ? out.Metasets : []
    out.Metasets = applyMetasetsPatch(arr, patch.metasets, 'metasets')
  }
  if (patch.recipes) {
    const arr = Array.isArray(out.Recipes) ? out.Recipes : []
    out.Recipes = applyRecipesPatch(arr, patch.recipes, 'recipes')
  }
  if (patch.safeguards) {
    const arr = Array.isArray(out.Safeguards) ? out.Safeguards : []
    out.Safeguards = applySafeguardsPatch(arr, patch.safeguards, 'safeguards')
  }
  if (patch.note) {
    const nextNote = applyNotePatch(out.Note, patch.note, 'note')
    if (nextNote === undefined) delete out.Note
    else out.Note = nextNote
  }
  // Global flags. `=== undefined` check preserves the absence semantics —
  // an omitted flag in the patch leaves the original value intact.
  if (patch.safeguardsEnabled !== undefined) out.SafeguardsEnabled = patch.safeguardsEnabled
  if (patch.recipesEnabled !== undefined) out.RecipesEnabled = patch.recipesEnabled
  // Dynamic-overrides answers. Same absence semantics as the flags above, and the
  // wire key names come from the app's own constants so a rename cannot desync the
  // patcher from the loader. Setting an EMPTY map is meaningful (ship with no answers,
  // i.e. force the DSL defaults), so `{}` is written rather than treated as absent.
  if (patch.noteRecipeOverridesAnswers !== undefined) {
    out[NOTE_RECIPE_OVERRIDES_ANSWERS_KEY] = patch.noteRecipeOverridesAnswers
  }
  if (patch.noteSafeguardOverridesAnswers !== undefined) {
    out[NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY] = patch.noteSafeguardOverridesAnswers
  }
  if (patch.noteRecipeOverridesDisabled !== undefined) {
    out[NOTE_DYNAMIC_OVERRIDES_DISABLED_KEY] = patch.noteRecipeOverridesDisabled
  }
  return out
}
