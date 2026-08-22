/**
 * rulesTableColumnsPreference.ts
 *
 * Persistence layer for the rules table column configuration.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

export type StoredColumnConfig = {
  key: string
  label?: string
  width?: number
  visible?: boolean
  mode?: 'auto' | 'show' | 'hide'
}

// Bump the key when the default column set/order changes so stale layouts do not mask new defaults.
// Exported so tests can seed a layout without re-typing the literal and silently drifting from it.
export const RULES_TABLE_COLUMNS_STORAGE_KEY = 'sellfileCreator.rulesTableCols.v5'

const parseStoredColumns = (raw: string | null): StoredColumnConfig[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return (parsed as Array<Record<string, unknown>>)
      .map((entry) => {
        const key = typeof entry.key === 'string' ? entry.key : ''
        if (!key) return null
        const width = Number(entry.width)
        const visibleRaw = entry.visible
        const mode = entry.mode === 'auto' || entry.mode === 'show' || entry.mode === 'hide' ? entry.mode : undefined
        return {
          key,
          label: typeof entry.label === 'string' ? entry.label : undefined,
          width: Number.isFinite(width) ? width : undefined,
          visible: typeof visibleRaw === 'boolean' ? visibleRaw : undefined,
          ...(mode ? { mode } : {}),
        } as StoredColumnConfig
      })
      .filter((entry): entry is StoredColumnConfig => Boolean(entry))
  } catch {
    return []
  }
}

const serializeStoredColumns = (value: StoredColumnConfig[]): string | null => {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

const columnsStore = createLocalStorageStore<StoredColumnConfig[]>({
  key: RULES_TABLE_COLUMNS_STORAGE_KEY,
  fallback: [],
  parse: parseStoredColumns,
  serialize: serializeStoredColumns,
})

export const useRulesTableColumnsPreference = createLocalStorageStateHook(columnsStore)
