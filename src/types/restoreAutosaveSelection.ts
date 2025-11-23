export type RestoreOptionKey = 'configs' | 'metasets' | 'targets' | 'note' | 'filters' | 'tester'

export type RestoreSelection = Record<RestoreOptionKey, boolean>

export const RESTORE_SELECTION_KEYS: readonly RestoreOptionKey[] = [
  'configs',
  'metasets',
  'targets',
  'note',
  'filters',
  'tester',
] as const

export const RESTORE_SELECTION_DEFAULT: RestoreSelection = {
  configs: false,
  metasets: false,
  targets: false,
  note: false,
  filters: false,
  tester: false,
}
