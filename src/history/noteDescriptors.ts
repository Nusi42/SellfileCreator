// noteDescriptors keeps note history data-only until localization.
import type { HistoryEntryDescriptor, ResolvedHistoryEntryDescriptor } from './historyDescriptorTypes'
import type { TranslateFn } from './builderUpdateDescriptor'
import type { NoteDescriptorMode } from './historyDescriptorTypes'

export type { NoteDescriptorMode }

export function normalizeNoteValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return value
}

// createNoteChangeDescriptor snapshots note edits for history.
export const createNoteChangeDescriptor = (params: {
  previous: string | null
  next: string | null
  mode: NoteDescriptorMode
}): HistoryEntryDescriptor | null => {
  const prev = normalizeNoteValue(params.previous)
  const next = normalizeNoteValue(params.next)
  if (prev === next) return null
  return {
    kind: 'noteChange',
    previous: prev,
    next,
    mode: params.mode,
  }
}

// describeNoteChange localizes a note change entry at render time.
export function describeNoteChange(params: {
  previous: string | null
  next: string | null
  mode: NoteDescriptorMode
  t: TranslateFn
}): ResolvedHistoryEntryDescriptor | null {
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
