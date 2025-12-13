export type RestoreOptionKey = 'configs' | 'metasets' | 'targets' | 'note' | 'tester' | 'gearSets'

export type RestoreSelection = Record<RestoreOptionKey, boolean>

export const RESTORE_SELECTION_KEYS: readonly RestoreOptionKey[] = [
  'configs',
  'metasets',
  'targets',
  'note',
  'tester',
  'gearSets',
] as const

export const RESTORE_SELECTION_DEFAULT: RestoreSelection = {
  configs: false,
  metasets: false,
  targets: false,
  note: false,
  tester: false,
  gearSets: false,
}
