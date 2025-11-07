/**
 * testerTableColumnsPreference.ts
 *
 * Persists the tester table column order and widths.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

export type TesterStoredColumnConfig = {
  key: string
  width?: number
}

const STORAGE_KEY = 'sellfileCreator.testerTableCols.v1'

const parseStoredColumns = (raw: string | null): TesterStoredColumnConfig[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return (parsed as Array<Record<string, unknown>>)
      .map((entry) => {
        const key = typeof entry.key === 'string' ? entry.key : ''
        if (!key) return null
        const width = Number(entry.width)
        return {
          key,
          ...(Number.isFinite(width) ? { width } : {}),
        }
      })
      .filter((entry): entry is TesterStoredColumnConfig => Boolean(entry))
  } catch {
    return []
  }
}

const serializeStoredColumns = (value: TesterStoredColumnConfig[]): string | null => {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

const testerColumnsStore = createLocalStorageStore<TesterStoredColumnConfig[]>({
  key: STORAGE_KEY,
  fallback: [],
  parse: parseStoredColumns,
  serialize: serializeStoredColumns,
})

export const useTesterTableColumnsPreference = createLocalStorageStateHook(testerColumnsStore)
