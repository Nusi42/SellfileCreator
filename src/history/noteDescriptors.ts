import type { HistoryEntryDescriptor } from '../hooks/useHsfcHistory'
import type { TranslateFn } from './builderUpdateDescriptor'

export type NoteDescriptorMode = 'edit' | 'clear' | 'import' | 'restore'

export function normalizeNoteValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return value
}

function formatPresence(note: string | null, t: TranslateFn): string {
  return note ? t('historyNotePresentValue') : t('historyValueEmpty')
}

function buildPreview(note: string, maxLength = 120): string {
  const collapsed = note.replace(/\s+/g, ' ').trim()
  if (!collapsed) return ''
  if (collapsed.length <= maxLength) return collapsed
  const limit = Math.max(0, maxLength - 3)
  return `${collapsed.slice(0, limit)}...`
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

  const detailLines: string[] = []
  detailLines.push(t('historyDiffLine', {
    label: t('historyNotePresenceLabel'),
    previous: formatPresence(prev, t),
    next: formatPresence(next, t),
  }))

  const prevPreview = prev ? buildPreview(prev) : ''
  const nextPreview = next ? buildPreview(next) : ''
  if (prevPreview) {
    detailLines.push(t('historyNotePreviewPreviousLine', { preview: prevPreview }))
  }
  if (nextPreview) {
    detailLines.push(t('historyNotePreviewNextLine', { preview: nextPreview }))
  }

  if (detailLines.length <= 1) {
    return { title: t(titleKey) }
  }
  return { title: t(titleKey), detailLines }
}
