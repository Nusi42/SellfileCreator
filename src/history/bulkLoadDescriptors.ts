// bulkLoadDescriptors keep load/import history data-only until render.
import type { HistoryEntryDescriptor, ResolvedHistoryEntryDescriptor } from './historyDescriptorTypes'
import type { TranslateFn } from './builderUpdateDescriptor'

// createSfcLoadedDescriptor stores file metadata for history.
export const createSfcLoadedDescriptor = (fileName?: string | null): HistoryEntryDescriptor => {
  // Normalize undefined to null so optional fields obey exactOptionalPropertyTypes.
  const normalized = fileName ?? null
  return {
    kind: 'sfcLoaded',
    fileName: normalized,
  }
}

// createAutosaveRestoredDescriptor stores autosave metadata for history.
export const createAutosaveRestoredDescriptor = (params: {
  version?: string | null
  savedAt?: string | null
}): HistoryEntryDescriptor => {
  // Normalize optional fields so history entries are stable.
  const version = params.version ?? null
  const savedAt = params.savedAt ?? null
  return {
    kind: 'autosaveRestored',
    version,
    savedAt,
  }
}

function normalizeFileName(name: string | null | undefined): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  return trimmed.length ? trimmed : null
}

// describeSfcLoaded localizes SFC load entries.
export function describeSfcLoaded(params: {
  fileName?: string | null
  t: TranslateFn
}): ResolvedHistoryEntryDescriptor {
  const { fileName, t } = params
  const detailLines: string[] = []
  const normalized = normalizeFileName(fileName)
  if (normalized) {
    detailLines.push(t('historySourceFileLine', { name: normalized }))
  }
  const title = t('historySfcLoadedTitle')
  return detailLines.length > 0 ? { title, detailLines } : { title }
}

// describeAutosaveRestored localizes autosave restore entries.
export function describeAutosaveRestored(params: {
  version?: string | null
  savedAt?: string | null
  t: TranslateFn
}): ResolvedHistoryEntryDescriptor {
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

// makeClipboardSourceDescriptor is a no-op placeholder for clipboard provenance.
export function makeClipboardSourceDescriptor(_: TranslateFn): HistoryEntryDescriptor | null {
  void _
  return null
}
