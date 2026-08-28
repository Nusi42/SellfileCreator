export type RestoreOptionKey = 'recipes' | 'metasets' | 'targets' | 'note' | 'safeguards' | 'gearInspector' | 'gearSets'

export type RestoreSelection = Record<RestoreOptionKey, boolean>

export const RESTORE_SELECTION_KEYS: readonly RestoreOptionKey[] = [
  'recipes',
  'metasets',
  'targets',
  'note',
  'safeguards',
  'gearInspector',
  'gearSets',
] as const

export const RESTORE_SELECTION_DEFAULT: RestoreSelection = {
  recipes: false,
  metasets: false,
  targets: false,
  note: false,
  safeguards: false,
  gearInspector: false,
  gearSets: false,
}

/**
 * The rows that carry SFC *identity* — the slices `matchedPreset` canonicalizes when
 * deciding whether a setup is still a bundled preset. Gear Inspector items and runtime
 * gear sets are session data that live outside the SFC body, so they never affect
 * whether the restored document is preset-identical.
 */
export const RESTORE_SFC_IDENTITY_KEYS: readonly RestoreOptionKey[] = [
  'recipes',
  'metasets',
  'targets',
  'note',
  'safeguards',
] as const

/**
 * True when a restore reinstates the saved SFC body WHOLE, so the result is exactly
 * the draft's content rather than a mix of draft and session.
 *
 * `offered` is the set of identity rows the dialog actually presented. A row is only
 * offered when the draft has that content AND (for metasets/targets) it differs from
 * the session — so an unoffered row means the session already equals the draft there.
 * Both cases leave that slice matching the draft, which is why only the OFFERED rows
 * have to be checked.
 *
 * Used to decide an autosave restore's provenance: a whole-body restore of a
 * preset-stamped draft lands on content the user can reload from the preset buttons,
 * so it is clean (see lib/sfcProvenance.ts). A partial restore mixes in session edits
 * and is unsaved work like any other recovery.
 */
export function restoreCoversWholeSfcBody(
  selection: RestoreSelection,
  offered: ReadonlySet<RestoreOptionKey>,
): boolean {
  return RESTORE_SFC_IDENTITY_KEYS.every((key) => !offered.has(key) || selection[key])
}
