/**
 * dynamicOverridesPresetFile.ts
 *
 * File-level backup/transfer for the note dialog's saved dynamic-override sets:
 * ALL saved sets go out as one JSON document, and importing that document merges
 * its sets back into the saved list. This is the single definition of the file
 * shape, its filename, and its parser — the menu UI only calls these helpers.
 *
 * Design notes:
 *  - Entries are validated by `sanitizeDynamicOverridesPreset`, the same validator
 *    localStorage uses, so a hand-edited file can never introduce a shape the
 *    in-app store would reject (SSOT).
 *  - Import never overwrites: an incoming set is appended, and a colliding name is
 *    suffixed rather than replacing the existing set. Nothing the user already
 *    saved is silently discarded.
 *  - Exact duplicates (same name AND same answers) are skipped, so re-importing a
 *    backup is a no-op rather than a pile of "(2)", "(3)" copies.
 *  - Ids are re-issued on import, because ids are per-install; content identity
 *    (not id) is therefore what duplicate detection compares.
 */
import { SFC_EXPORT_CONTENT_TYPE } from './sfcIO'
import { buildTimestamp } from './filenames'
import { createPresetId } from '../state/presetUtils'
import {
  sanitizeDynamicOverridesPreset,
  type DynamicOverridesPreset,
} from '../state/dynamicOverridesPresetsPreference'

/** Document marker: lets the parser reject an unrelated JSON file with a clear error. */
export const DYNAMIC_OVERRIDES_PRESET_FILE_KIND = 'sellfileCreator.dynamicOverridesPresets'

/** Format version; bumped only for a breaking layout change (readers accept <= current). */
export const DYNAMIC_OVERRIDES_PRESET_FILE_VERSION = 1

/** File extension + accept filter for the picker. JSON keeps the file inspectable. */
export const DYNAMIC_OVERRIDES_PRESET_FILE_EXTENSION = '.json'
export const DYNAMIC_OVERRIDES_PRESET_FILE_ACCEPT = 'application/json,.json'

/** The on-disk document: a marker, a version, and the saved sets verbatim. */
export type DynamicOverridesPresetFile = {
  kind: typeof DYNAMIC_OVERRIDES_PRESET_FILE_KIND
  version: number
  // Export time, informational only — helps a user tell two backups apart.
  exportedAt: string
  presets: DynamicOverridesPreset[]
}

/** Timestamped export filename, matching the app's other export names. */
export function dynamicOverridesPresetFilename(date?: Date): string {
  return `SellfileCreatorOverrideSets_${buildTimestamp(date)}${DYNAMIC_OVERRIDES_PRESET_FILE_EXTENSION}`
}

/** Build the export document for the given sets. */
export function buildDynamicOverridesPresetFile(
  presets: readonly DynamicOverridesPreset[],
  now: Date = new Date(),
): DynamicOverridesPresetFile {
  return {
    kind: DYNAMIC_OVERRIDES_PRESET_FILE_KIND,
    version: DYNAMIC_OVERRIDES_PRESET_FILE_VERSION,
    exportedAt: now.toISOString(),
    // Copy the array so a later store update cannot mutate what we serialized.
    presets: [...presets],
  }
}

/** Serialize the export document to a downloadable Blob (pretty-printed, like SFC saves). */
export function dynamicOverridesPresetFileToBlob(
  presets: readonly DynamicOverridesPreset[],
  now?: Date,
): Blob {
  const doc = buildDynamicOverridesPresetFile(presets, now)
  return new Blob([JSON.stringify(doc, null, 2)], { type: SFC_EXPORT_CONTENT_TYPE })
}

/** Why a file could not be read — the UI maps each reason to a localized message. */
export type DynamicOverridesPresetFileErrorReason = 'unreadable' | 'wrongKind' | 'empty'

/** Parse outcome: either the accepted sets, or a reason the file was rejected. */
export type DynamicOverridesPresetFileParse =
  | { ok: true; presets: DynamicOverridesPreset[]; skipped: number }
  | { ok: false; reason: DynamicOverridesPresetFileErrorReason }

/**
 * Parse an exported document back into sets. Entries that fail validation are
 * counted as `skipped` rather than failing the whole import, so one corrupt set
 * never costs the user the rest of the file.
 */
export function parseDynamicOverridesPresetFile(text: string): DynamicOverridesPresetFileParse {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // Not JSON at all — the user almost certainly picked the wrong file.
    return { ok: false, reason: 'unreadable' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'unreadable' }
  }
  const doc = parsed as Record<string, unknown>
  // Marker check keeps an unrelated JSON file from importing as zero sets.
  if (doc['kind'] !== DYNAMIC_OVERRIDES_PRESET_FILE_KIND) {
    return { ok: false, reason: 'wrongKind' }
  }
  // A newer major version may hold fields this build cannot honour; refuse rather than guess.
  const version = typeof doc['version'] === 'number' ? doc['version'] : 0
  if (version > DYNAMIC_OVERRIDES_PRESET_FILE_VERSION) {
    return { ok: false, reason: 'wrongKind' }
  }
  const rawPresets = doc['presets']
  if (!Array.isArray(rawPresets)) return { ok: false, reason: 'empty' }
  const presets: DynamicOverridesPreset[] = []
  let skipped = 0
  rawPresets.forEach((entry) => {
    // Same validator as the localStorage store — no second set of rules.
    const preset = sanitizeDynamicOverridesPreset(entry)
    if (!preset) { skipped += 1; return }
    presets.push(preset)
  })
  // Nothing usable survived: report it so the UI does not claim a successful import.
  if (presets.length === 0) return { ok: false, reason: 'empty' }
  return { ok: true, presets, skipped }
}

/**
 * Make `name` unique against `taken` by appending " (2)", " (3)", … The suffix
 * count starts at 2 so the first duplicate reads naturally next to the original.
 */
export function makeUniquePresetName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name
  // Bounded by the candidate count, so the loop always terminates.
  for (let n = 2; ; n += 1) {
    const candidate = `${name} (${n})`
    if (!taken.has(candidate)) return candidate
  }
}

/**
 * Stable identity of a set's *content*: its name plus both answer maps, with keys
 * and multi-select values order-normalized so a re-serialized file still matches.
 * Ids and timestamps are deliberately excluded — an imported set is re-issued an
 * id, so identity has to survive that or a re-import could never be recognized.
 */
export function dynamicOverridesPresetIdentity(preset: DynamicOverridesPreset): string {
  // Sort both levels: answer keys, and the option ids inside each answer. Both answer
  // maps are Record<string, string[]>, so one helper serves them unchanged.
  const canonical = (answers: Record<string, string[]>): Array<[string, string[]]> =>
    Object.keys(answers).sort().map((key) => [key, [...(answers[key] ?? [])].sort()])
  return JSON.stringify([preset.name, canonical(preset.recipeAnswers), canonical(preset.safeguardAnswers)])
}

/** Result of merging an imported file into the existing list. */
export type DynamicOverridesPresetMergeResult = {
  // The new full list, imported sets first (newest-first ordering, as when saving).
  presets: DynamicOverridesPreset[]
  // How many sets were added.
  added: number
  // How many of those were renamed to avoid colliding with an existing name.
  renamed: number
  // How many were dropped as exact duplicates of a set already present.
  duplicates: number
}

/**
 * Merge imported sets into the existing list without ever replacing an entry.
 *
 * Three outcomes per incoming set:
 *  - **Exact duplicate** (same name AND same answers as one already present, or as
 *    an earlier set in the same file) — skipped. Re-importing the same backup is
 *    therefore a no-op instead of piling up "(2)", "(3)", … copies.
 *  - **Name collision with different content** — added under a suffixed name, so a
 *    genuinely different set is never silently lost to a shared name.
 *  - **Otherwise** — added as-is.
 *
 * Accepted sets get a fresh id (ids are per-install, and reusing one would alias
 * two rows) and land at the front, matching where a freshly saved set appears.
 */
export function mergeImportedDynamicOverridesPresets(
  existing: readonly DynamicOverridesPreset[],
  incoming: readonly DynamicOverridesPreset[],
): DynamicOverridesPresetMergeResult {
  // Names claimed so far — seeded with the existing list, then grown as we accept
  // each import so two identically-named sets in one file also get distinct names.
  const taken = new Set(existing.map((preset) => preset.name))
  // Content identities already present, so an exact re-import is recognized.
  const seen = new Set(existing.map(dynamicOverridesPresetIdentity))
  let renamed = 0
  let duplicates = 0
  const added: DynamicOverridesPreset[] = []
  incoming.forEach((preset) => {
    // Identical name AND answers as something already held: nothing to add.
    if (seen.has(dynamicOverridesPresetIdentity(preset))) { duplicates += 1; return }
    const name = makeUniquePresetName(preset.name, taken)
    if (name !== preset.name) renamed += 1
    taken.add(name)
    // Record the accepted set's identity under its FINAL name, so a later entry
    // duplicating this one (rather than an pre-existing set) is caught too.
    const accepted: DynamicOverridesPreset = { ...preset, id: createPresetId(), name }
    seen.add(dynamicOverridesPresetIdentity(accepted))
    added.push(accepted)
  })
  return { presets: [...added, ...existing], added: added.length, renamed, duplicates }
}
