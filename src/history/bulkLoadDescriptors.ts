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
  t: TranslateFn
}): HistoryEntryDescriptor {
  const { version, t } = params
  const detailLines: string[] = [t('historySourceAutosaveLine')]
  const normalized = typeof version === 'string' ? version.trim() : ''
  if (normalized) {
    detailLines.push(t('historyAutosaveVersionLine', { version: normalized }))
  }
  return { title: t('historyAutosaveRestoredTitle'), detailLines }
}

export function makeClipboardSourceDescriptor(t: TranslateFn): HistoryEntryDescriptor {
  return { title: t('historySourceClipboardLine') }
}
