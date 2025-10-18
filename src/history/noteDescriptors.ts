import type { HistoryEntryDescriptor } from '../hooks/useHsfcHistory'
import type { TranslateFn } from './builderUpdateDescriptor'

export type NoteDescriptorMode = 'edit' | 'clear' | 'import' | 'restore'

export function normalizeNoteValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return value
}

export function describeNoteChange(params: {
  previous: string | null
  next: string | null
  mode: NoteDescriptorMode
  t: TranslateFn
}): HistoryEntryDescriptor | null {
  const prev = normalizeNoteValue(params.previous)
  const next = normalizeNoteValue(params.next)
  if (prev === next) return null
  const { mode, t } = params

  let titleKey: string
  if (mode === 'clear') {
    titleKey = 'historyNoteClearedTitle'
  } else if (mode === 'import') {
    titleKey = next ? 'historyNoteImportedTitle' : 'historyNoteClearedTitle'
  } else if (mode === 'restore') {
    titleKey = 'historyNoteRestoredTitle'
  } else if (!prev && next) {
    titleKey = 'historyNoteAddedTitle'
  } else if (prev && !next) {
    titleKey = 'historyNoteClearedTitle'
  } else {
    titleKey = 'historyNoteUpdatedTitle'
  }

  return { title: t(titleKey) }
}
