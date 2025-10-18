import type { HistoryEntryDescriptor } from '../hooks/useHsfcHistory'
import type { TranslateFn } from './builderUpdateDescriptor'

function normalizeFileName(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  return trimmed.length ? trimmed : null
}

export function describeHsfcLoaded(params: {
  fileName?: string | null
  t: TranslateFn
}): HistoryEntryDescriptor {
  const { fileName, t } = params
  const detailLines: string[] = []
  const normalized = normalizeFileName(fileName)
  if (normalized) {
    detailLines.push(t('historySourceFileLine', { name: normalized }))
  }
  const title = t('historyHsfcLoadedTitle')
  return detailLines.length > 0 ? { title, detailLines } : { title }
}

export function describeAutosaveRestored(params: {
  version?: string | null
  savedAt?: string | null
  t: TranslateFn
}): HistoryEntryDescriptor {
  const { version, savedAt, t } = params
  const normalizedVersion = typeof version === 'string' ? version.trim() : ''
  const timestamp = formatSavedAt(savedAt)
  const baseTitle = t('historyAutosaveRestoredTitle')
  if (timestamp) {
    return { title: `${baseTitle} (${t('historyAutosaveSavedAtSuffix', { timestamp })})` }
  }
  if (normalizedVersion) {
    return { title: `${baseTitle} (${normalizedVersion})` }
  }
  return { title: baseTitle }
}

function formatSavedAt(savedAt: string | null | undefined): string | null {
  if (!savedAt) return null
  const date = new Date(savedAt)
  if (Number.isNaN(date.getTime())) return null
  const pad = (value: number) => value.toString().padStart(2, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

export function makeClipboardSourceDescriptor(_: TranslateFn): HistoryEntryDescriptor | null {
  void _
  return null
}
