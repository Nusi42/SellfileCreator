// Metaset: a named group of artifact set IDs
export type Metaset = {
  id: string
  name: string
  sets: number[]
  // When false, hide this metaset in selection menus (still functional for rules)
  show?: boolean
}

// Create stable IDs for default metasets to survive rename
function makeId(name: string): string {
  return `meta_${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

// Default metasets (empty definitions; user to fill later)
export function defaultMetasets(): Metaset[] {
  return [
    {
      "id": "meta_1756577731544",
      "name": "Nuker - Limited Sets",
      "sets": [
        59,
        63,
        54,
        46,
        60
      ],
      "show": true
    },
    {
      "id": "meta_1756578278014",
      "name": "Nuker",
      "sets": [
        19,
        50,
        29,
        49,
        59,
        63,
        54,
        46,
        60,
        48
      ],
      "show": true
    },
    {
      "id": "meta_1756578798518",
      "name": "Support - Limited Sets",
      "sets": [
        58,
        59,
        64,
        65,
        62,
        61,
        53
      ],
      "show": true
    },
    {
      "id": "meta_1756578985398",
      "name": "Need 4 Speed",
      "sets": [
        4,
        34,
        35,
        38,
        47,
        57,
        58,
        59,
        64,
        65,
        62,
        61,
        53,
        48
      ],
      "show": true
    },
    {
      "id": "meta_1756580100403",
      "name": "Support - Debuffer",
      "sets": [
        4,
        7,
        34,
        38,
        47,
        48,
        53,
        58,
        57,
        61,
        62,
        64,
        65
      ],
      "show": true
    },
    {
      "id": "meta_1756580748910",
      "name": "Support - Survivability",
      "sets": [
        4,
        15,
        16,
        17,
        30,
        34,
        35,
        36,
        37,
        40,
        42,
        44,
        45,
        47,
        48,
        51,
        52,
        57,
        58,
        61,
        62,
        64,
        65
      ],
      "show": true
    },
    {
      "id": "meta_1756581222475",
      "name": "Extra Turn",
      "sets": [
        18,
        59,
        27
      ],
      "show": true
    },


    { id: 'meta_1756159940920', name: 'Full Speed (2-piece 10%+)', sets: [34,53,62,64,57,4,65], show: true },
    { id: 'meta_1756160008898', name: 'Need 4 Speed', sets: [34,61,53,38,62,47,64,57,4,48,58], show: true },
    { id: 'meta_1756160093268', name: 'Nuker - Tier 3', sets: [59,54,60,63,46,48,61,62], show: true },
    { id: 'meta_1756160191851', name: 'Nuker - Tier 2', sets: [19,50,29], show: true },
    { id: 'meta_1756160213245', name: 'Nuker - Tier 1', sets: [6,49,10,35], show: true },
    { id: 'meta_1756160274538', name: 'Nuker - Tier 0 (Early Game, Outdated)', sets: [41,2,31,5,32,9,43,20], show: true },
    { id: 'meta_1756160335280', name: 'Support (ACC)', sets: [62,38,61,7], show: true },
    { id: 'meta_1756160361702', name: 'Support (RES)', sets: [48,64,65,47,58,8,45], show: true },
    { id: 'meta_1756160401747', name: 'Support Tank - Tier 1', sets: [48,47,15,30,51,17,61,44,42,36], show: true },
    { id: 'meta_1756160466178', name: 'Support Tank - Tier 2', sets: [52,26,28,45], show: true },
    { id: 'meta_1756160486997', name: 'Self Heals', sets: [15,30,44], show: true },
    { id: 'meta_1756160510663', name: 'Cooldown / Extra Turns', sets: [18,27,59], show: true },
    { id: 'meta_1756160545785', name: 'Counterattack', sets: [24,25], show: true },
    { id: 'meta_1756160567012', name: 'Immunity Buff', sets: [61,16,40], show: true },
    { id: 'meta_1756160580935', name: 'Debuff Set Bonuses - Tier 2', sets: [12,21,23,22,42], show: true },
    { id: 'meta_1756160636489', name: 'Debuff Set Bonuses - Tier 1', sets: [11,13], show: true },
    { id: 'meta_1756160662961', name: 'Outdated', sets: [1,33,37,2,31,13,41,11,14,5,32,9,43,20,25,24,39,3], show: true },
    { id: "meta_1756240399881", name: "Accessoires - Special", sets: [1000, 1001, 1002, 1003, 1004], show: true },

    // Friend's recommended metasets (from spreadsheet screenshots)
    { id: makeId('Universal Set Damage and ACC / RES / Alays Needs Spped'), name: 'Universal Set Damage and ACC / RES / Alays Needs Spped', sets: [4,8,11,12,14,16,18,21,23,27,34,35,38,39,40,45,47,53,57], show: true },
    { id: makeId('1st tier damage - god tier not speed'), name: '1st tier damage - god tier not speed', sets: [19,29,46,49,50], show: true },
    { id: makeId('2nd tier damage focus set always with speed'), name: '2nd tier damage focus set always with speed', sets: [3,5,6,9,10,20,22,24,25,31,32,42,43], show: true },
    { id: makeId('HP / DEF / Sets always require speed'), name: 'HP / DEF / Sets always require speed', sets: [3,13,15,18,26,28,30,33,36,37,42,44,51,52], show: true },
    { id: makeId('New great sets, accept 5* slayer, supersonic, merciless, zeal'), name: 'New great sets, accept 5* slayer, supersonic, merciless, zeal', sets: [54,58,59,60,63,64], show: true },
    { id: makeId('Stone Skin'), name: 'Stone Skin', sets: [48], show: true }
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
