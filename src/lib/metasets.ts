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
    { id: 'meta_1756159940920', name: 'Full Speed (2-piece 10%+)', sets: [34,53,62,64,57,4] },
    { id: 'meta_1756160008898', name: 'Need 4 Speed', sets: [65,34,61,53,38,62,47,64,57,4,48,58] },
    { id: 'meta_1756160093268', name: 'Nuker - Tier 3', sets: [59,54,60,63,46,48,61,62,1] },
    { id: 'meta_1756160191851', name: 'Nuker - Tier 2', sets: [19,50,29] },
    { id: 'meta_1756160213245', name: 'Nuker - Tier 1', sets: [6,49,10,35] },
    { id: 'meta_1756160274538', name: 'Nuker - Tier 0 (Early Game, Outdated)', sets: [41,2,31,5,32,9,43,20] },
    { id: 'meta_1756160335280', name: 'Support (ACC)', sets: [62,38,61,7] },
    { id: 'meta_1756160361702', name: 'Support (RES)', sets: [48,64,65,47,58,8,45] },
    { id: 'meta_1756160401747', name: 'Support Tank - Tier 1', sets: [48,47,15,30,51,17,61,44,42,36] },
    { id: 'meta_1756160466178', name: 'Support Tank - Tier 2', sets: [52,26,28,45] },
    { id: 'meta_1756160486997', name: 'Self Heals', sets: [15,30,44] },
    { id: 'meta_1756160510663', name: 'Cooldown / Extra Turns', sets: [18,27,59] },
    { id: 'meta_1756160545785', name: 'Counterattack', sets: [24,25] },
    { id: 'meta_1756160567012', name: 'Immunity Buff', sets: [61,16,40] },
    { id: 'meta_1756160580935', name: 'Debuff Set Bonuses - Tier 2', sets: [12,21,23,22,42] },
    { id: 'meta_1756160636489', name: 'Debuff Set Bonuses - Tier 1', sets: [11,13] },
    { id: 'meta_1756160662961', name: 'Outdated', sets: [1,33,37,2,31,13,41,11,14,5,32,9,43,20,25,24,39,3] },
    { id: "meta_1756240399881", name: "Accessoires - Special", sets: [1000, 1001, 1002, 1003, 1004] }
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
