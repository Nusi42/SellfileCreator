// Metaset: a named group of artifact set IDs
export type Metaset = {
  id: string
  name: string
  sets: number[]
}

// Create stable IDs for default metasets to survive rename
function makeId(name: string): string {
  return `meta_${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

// Default metasets (empty definitions; user to fill later)
export function defaultMetasets(): Metaset[] {
  return [
    { id: makeId('Debuffer'), name: 'Debuffer', sets: [] },
    { id: makeId('Tank'), name: 'Tank', sets: [] },
    { id: makeId('Support'), name: 'Support', sets: [] },
    { id: makeId('DD'), name: 'DD', sets: [] },
    { id: makeId('Karnage'), name: 'Karnage', sets: [] },
    { id: makeId('UDK'), name: 'UDK', sets: [] },
  ]
}

// Helper to resolve a list of metaset IDs to a unique set of artifact set IDs
export function resolveMetasetIds(ids: string[] | undefined, metasets: Metaset[]): number[] {
  if (!ids || !ids.length) return []
  const byId = new Map(metasets.map(m => [m.id, m]))
  const acc = new Set<number>()
  for (const id of ids) {
    const m = byId.get(id)
    if (!m) continue
    for (const s of m.sets) acc.add(s)
  }
  return Array.from(acc)
}

