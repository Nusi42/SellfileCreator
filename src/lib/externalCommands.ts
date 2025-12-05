type UnknownRecord = Record<string, unknown>

type CaseInsensitiveLookup = {
  get: (...keys: string[]) => unknown
}

const createCaseInsensitiveLookup = (record: UnknownRecord): CaseInsensitiveLookup => {
  const map = new Map<string, unknown>()
  for (const [key, value] of Object.entries(record)) {
    map.set(key.toLowerCase(), value)
  }
  return {
    get: (...keys: string[]) => {
      for (const key of keys) {
        const lookupKey = key.toLowerCase()
        if (map.has(lookupKey)) {
          return map.get(lookupKey)
        }
      }
      return undefined
    },
  }
}

// rowNumber follows the UI’s 1-based row numbering so HTTP integrations can send
// the same value they show to users.
export type ExternalCommand =
  | { kind: 'selectRule'; rowNumber: number | null }
  | { kind: 'gearDbFile'; name: string; base64?: string; downloadPath?: string }

const isObject = (value: unknown): value is UnknownRecord => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const extractString = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

export function normalizeExternalCommand(raw: unknown): ExternalCommand | null {
  if (!isObject(raw)) return null
  const lookup = createCaseInsensitiveLookup(raw as UnknownRecord)
  const typeRaw = extractString(lookup.get('type', 'command', 'action'))
  if (!typeRaw) return null
  const type = typeRaw.trim().toLowerCase().replace(/[^a-z0-9]/g, '')

  if (type === 'selectrule' || type === 'select' || type === 'selectconfig' || type === 'selectrow') {
    const rowNumberValue = lookup.get('rownumber', 'row')
    const rowNumberNum = toNumber(rowNumberValue)
    const rowNumber = rowNumberNum != null && Number.isFinite(rowNumberNum)
      ? Math.max(1, Math.floor(rowNumberNum))
      : null
    const command: { kind: 'selectRule'; rowNumber: number | null } = {
      kind: 'selectRule',
      rowNumber,
    }
    return command
  }

  if (type === 'geardbfile' || type === 'geardbupdate' || type === 'geardbpayload') {
    const base64Value = extractString(lookup.get('base64', 'data', 'content', 'payload'))
    const downloadPath = extractString(lookup.get('downloadpath', 'path', 'url', 'href'))
    if (!base64Value && !downloadPath) return null
    const nameValue = extractString(lookup.get('filename', 'name')) ?? 'RslHelper.db'
    const command: { kind: 'gearDbFile'; name: string; base64?: string; downloadPath?: string } = {
      kind: 'gearDbFile',
      name: nameValue,
      ...(base64Value ? { base64: base64Value } : {}),
      ...(downloadPath ? { downloadPath } : {}),
    }
    return command
  }

  return null
}
