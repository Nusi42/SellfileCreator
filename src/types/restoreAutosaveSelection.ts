export type RestoreOptionKey = 'recipes' | 'metasets' | 'targets' | 'note' | 'safeguards' | 'filters' | 'gearInspector' | 'gearSets'

export type RestoreSelection = Record<RestoreOptionKey, boolean>

export const RESTORE_SELECTION_KEYS: readonly RestoreOptionKey[] = [
  'recipes',
  'metasets',
  'targets',
  'note',
  'safeguards',
  'filters',
  'gearInspector',
  'gearSets',
] as const

export const RESTORE_SELECTION_DEFAULT: RestoreSelection = {
  recipes: false,
  metasets: false,
  targets: false,
  note: false,
  safeguards: false,
  filters: false,
  gearInspector: false,
  gearSets: false,
}
