/**
 * metasets.ts
 *
 * Metaset model and helpers. A metaset is a named group of artifact set IDs
 * that can be referenced by configs to include multiple sets conveniently.
 */
import { ArtifactSet, type ArtifactSetId } from './types'

export type Metaset = {
  id: string
  name: string
  sets: ArtifactSetId[]
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
        ArtifactSet.Merciless,
        ArtifactSet.Stonecleaver,
        ArtifactSet.Zeal,
        ArtifactSet.Lethal,
        ArtifactSet.Slayer
      ],
      "show": true
    },
    {
      "id": "meta_1756578278014",
      "name": "Nuker",
      "sets": [
        ArtifactSet.Savage,
        ArtifactSet.Instinct,
        ArtifactSet.Cruel,
        ArtifactSet.Killstroke,
        ArtifactSet.Merciless,
        ArtifactSet.Stonecleaver,
        ArtifactSet.Zeal,
        ArtifactSet.Lethal,
        ArtifactSet.Slayer,
        ArtifactSet.Stoneskin
      ],
      "show": true
    },
    {
      "id": "meta_1756578798518",
      "name": "Support - Limited Sets",
      "sets": [
        ArtifactSet.Supersonic,
        ArtifactSet.Merciless,
        ArtifactSet.Rebirth,
        ArtifactSet.Chronophage,
        ArtifactSet.Pinpoint,
        ArtifactSet.Feral,
        ArtifactSet.Impulse
      ],
      "show": true
    },
    {
      "id": "meta_1756578985398",
      "name": "Need 4 Speed",
      "sets": [
        ArtifactSet.Speed,
        ArtifactSet.DivineSpeed,
        ArtifactSet.SwiftParry,
        ArtifactSet.Perception,
        ArtifactSet.Protection,
        ArtifactSet.Righteous,
        ArtifactSet.Supersonic,
        ArtifactSet.Merciless,
        ArtifactSet.Rebirth,
        ArtifactSet.Chronophage,
        ArtifactSet.Pinpoint,
        ArtifactSet.Feral,
        ArtifactSet.Impulse,
        ArtifactSet.Stoneskin
      ],
      "show": true
    },
    {
      "id": "meta_1756580100403",
      "name": "Support - Debuffer",
      "sets": [
        ArtifactSet.Speed,
        ArtifactSet.Accuracy,
        ArtifactSet.DivineSpeed,
        ArtifactSet.Perception,
        ArtifactSet.Protection,
        ArtifactSet.Stoneskin,
        ArtifactSet.Impulse,
        ArtifactSet.Supersonic,
        ArtifactSet.Righteous,
        ArtifactSet.Feral,
        ArtifactSet.Pinpoint,
        ArtifactSet.Rebirth,
        ArtifactSet.Chronophage
      ],
      "show": true
    },
    {
      "id": "meta_1756580748910",
      "name": "Support - Survivability",
      "sets": [
        ArtifactSet.Speed,
        ArtifactSet.Regeneration,
        ArtifactSet.Immunity,
        ArtifactSet.Shield,
        ArtifactSet.Immortal,
        ArtifactSet.DivineSpeed,
        ArtifactSet.SwiftParry,
        ArtifactSet.Deflection,
        ArtifactSet.Resilience,
        ArtifactSet.Untouchable,
        ArtifactSet.Frostbite,
        ArtifactSet.Guardian,
        ArtifactSet.Fortitude,
        ArtifactSet.Protection,
        ArtifactSet.Stoneskin,
        ArtifactSet.Bolster,
        ArtifactSet.Defiant,
        ArtifactSet.Righteous,
        ArtifactSet.Supersonic,
        ArtifactSet.Feral,
        ArtifactSet.Pinpoint,
        ArtifactSet.Rebirth,
        ArtifactSet.Chronophage
      ],
      "show": true
    },
    {
      "id": "meta_1756581222475",
      "name": "Extra Turn",
      "sets": [
        ArtifactSet.Relentless,
        ArtifactSet.Merciless,
        ArtifactSet.Reflex
      ],
      "show": true
    },


    { id: 'meta_1756159940920', name: 'Full Speed (2-piece 10%+)', sets: [ArtifactSet.DivineSpeed, ArtifactSet.Impulse, ArtifactSet.Pinpoint, ArtifactSet.Rebirth, ArtifactSet.Righteous, ArtifactSet.Speed, ArtifactSet.Chronophage], show: true },
    { id: 'meta_1756160008898', name: 'Need 4 Speed', sets: [ArtifactSet.DivineSpeed, ArtifactSet.Feral, ArtifactSet.Impulse, ArtifactSet.Perception, ArtifactSet.Pinpoint, ArtifactSet.Protection, ArtifactSet.Rebirth, ArtifactSet.Righteous, ArtifactSet.Speed, ArtifactSet.Stoneskin, ArtifactSet.Supersonic], show: true },
    { id: 'meta_1756160093268', name: 'Nuker - Tier 3', sets: [ArtifactSet.Merciless, ArtifactSet.Zeal, ArtifactSet.Slayer, ArtifactSet.Stonecleaver, ArtifactSet.Lethal, ArtifactSet.Stoneskin, ArtifactSet.Feral, ArtifactSet.Pinpoint], show: true },
    { id: 'meta_1756160191851', name: 'Nuker - Tier 2', sets: [ArtifactSet.Savage, ArtifactSet.Instinct, ArtifactSet.Cruel], show: true },
    { id: 'meta_1756160213245', name: 'Nuker - Tier 1', sets: [ArtifactSet.CritDamage, ArtifactSet.Killstroke, ArtifactSet.Fury, ArtifactSet.SwiftParry], show: true },
    { id: 'meta_1756160274538', name: 'Nuker - Tier 0 (Early Game, Outdated)', sets: [ArtifactSet.Fatal, ArtifactSet.Offense, ArtifactSet.DivineOffense, ArtifactSet.CriticalRate, ArtifactSet.DivineCriticalRate, ArtifactSet.Lifesteal, ArtifactSet.Bloodthirst, ArtifactSet.Destroy], show: true },
    { id: 'meta_1756160335280', name: 'Support (ACC)', sets: [ArtifactSet.Pinpoint, ArtifactSet.Perception, ArtifactSet.Feral, ArtifactSet.Accuracy], show: true },
    { id: 'meta_1756160361702', name: 'Support (RES)', sets: [ArtifactSet.Stoneskin, ArtifactSet.Rebirth, ArtifactSet.Chronophage, ArtifactSet.Protection, ArtifactSet.Supersonic, ArtifactSet.Resistance, ArtifactSet.Fortitude], show: true },
    { id: 'meta_1756160401747', name: 'Support Tank - Tier 1', sets: [ArtifactSet.Stoneskin, ArtifactSet.Protection, ArtifactSet.Regeneration, ArtifactSet.Immortal, ArtifactSet.Bolster, ArtifactSet.Shield, ArtifactSet.Feral, ArtifactSet.Guardian, ArtifactSet.Frostbite, ArtifactSet.Deflection], show: true },
    { id: 'meta_1756160466178', name: 'Support Tank - Tier 2', sets: [ArtifactSet.Defiant, ArtifactSet.Stalwart, ArtifactSet.Curing, ArtifactSet.Fortitude], show: true },
    { id: 'meta_1756160486997', name: 'Self Heals', sets: [ArtifactSet.Regeneration, ArtifactSet.Immortal, ArtifactSet.Guardian], show: true },
    { id: 'meta_1756160510663', name: 'Cooldown / Extra Turns', sets: [ArtifactSet.Relentless, ArtifactSet.Reflex, ArtifactSet.Merciless], show: true },
    { id: 'meta_1756160545785', name: 'Counterattack', sets: [ArtifactSet.Retaliation, ArtifactSet.Avenging], show: true },
    { id: 'meta_1756160567012', name: 'Immunity Buff', sets: [ArtifactSet.Feral, ArtifactSet.Immunity, ArtifactSet.Untouchable], show: true },
    { id: 'meta_1756160580935', name: 'Debuff Set Bonuses - Tier 2', sets: [ArtifactSet.Cursed, ArtifactSet.Stun, ArtifactSet.Provoke, ArtifactSet.Toxic, ArtifactSet.Frostbite], show: true },
    { id: 'meta_1756160636489', name: 'Debuff Set Bonuses - Tier 1', sets: [ArtifactSet.Daze, ArtifactSet.Frost], show: true },
    { id: 'meta_1756160662961', name: 'Outdated', sets: [ArtifactSet.Life, ArtifactSet.DivineLife, ArtifactSet.Resilience, ArtifactSet.Offense, ArtifactSet.DivineOffense, ArtifactSet.Frost, ArtifactSet.Fatal, ArtifactSet.Daze, ArtifactSet.Frenzy, ArtifactSet.CriticalRate, ArtifactSet.DivineCriticalRate, ArtifactSet.Lifesteal, ArtifactSet.Bloodthirst, ArtifactSet.Destroy, ArtifactSet.Avenging, ArtifactSet.Retaliation, ArtifactSet.Affinitybreaker, ArtifactSet.Defense], show: true },
    { id: "meta_1756240399881", name: "Accessoires - Special", sets: [ArtifactSet.Refresh, ArtifactSet.Cleansing, ArtifactSet.Bloodshield, ArtifactSet.Reaction, ArtifactSet.Revenge], show: true },

    // Friend's recommended metasets (from spreadsheet screenshots)
    { id: makeId('Universal Set Damage and ACC / RES / Alays Needs Spped'), name: 'Universal Set Damage and ACC / RES / Alays Needs Spped', sets: [ArtifactSet.Speed, ArtifactSet.Resistance, ArtifactSet.Daze, ArtifactSet.Cursed, ArtifactSet.Frenzy, ArtifactSet.Immunity, ArtifactSet.Relentless, ArtifactSet.Stun, ArtifactSet.Provoke, ArtifactSet.Reflex, ArtifactSet.DivineSpeed, ArtifactSet.SwiftParry, ArtifactSet.Perception, ArtifactSet.Affinitybreaker, ArtifactSet.Untouchable, ArtifactSet.Fortitude, ArtifactSet.Protection, ArtifactSet.Impulse, ArtifactSet.Righteous], show: true },
    { id: makeId('1st tier damage - god tier not speed'), name: '1st tier damage - god tier not speed', sets: [ArtifactSet.Savage, ArtifactSet.Cruel, ArtifactSet.Lethal, ArtifactSet.Killstroke, ArtifactSet.Instinct], show: true },
    { id: makeId('2nd tier damage focus set always with speed'), name: '2nd tier damage focus set always with speed', sets: [ArtifactSet.Defense, ArtifactSet.CriticalRate, ArtifactSet.CritDamage, ArtifactSet.Lifesteal, ArtifactSet.Fury, ArtifactSet.Destroy, ArtifactSet.Toxic, ArtifactSet.Retaliation, ArtifactSet.Avenging, ArtifactSet.DivineOffense, ArtifactSet.DivineCriticalRate, ArtifactSet.Frostbite, ArtifactSet.Bloodthirst], show: true },
    { id: makeId('HP / DEF / Sets always require speed'), name: 'HP / DEF / Sets always require speed', sets: [ArtifactSet.Defense, ArtifactSet.Frost, ArtifactSet.Regeneration, ArtifactSet.Relentless, ArtifactSet.Stalwart, ArtifactSet.Curing, ArtifactSet.Immortal, ArtifactSet.DivineLife, ArtifactSet.Deflection, ArtifactSet.Resilience, ArtifactSet.Frostbite, ArtifactSet.Guardian, ArtifactSet.Bolster, ArtifactSet.Defiant], show: true },
    { id: makeId('New great sets, accept 5* slayer, supersonic, merciless, zeal'), name: 'New great sets, accept 5* slayer, supersonic, merciless, zeal', sets: [ArtifactSet.Zeal, ArtifactSet.Supersonic, ArtifactSet.Merciless, ArtifactSet.Slayer, ArtifactSet.Stonecleaver, ArtifactSet.Rebirth], show: true },
    { id: makeId('Stone Skin'), name: 'Stone Skin', sets: [ArtifactSet.Stoneskin], show: true }
  ]
}

// Helper to resolve a list of metaset IDs to a unique set of artifact set IDs
export function resolveMetasetIds(ids: string[] | undefined, metasets: Metaset[]): ArtifactSetId[] {
  if (!ids || !ids.length) return []
  const byId = new Map(metasets.map(m => [m.id, m]))
  const acc = new Set<ArtifactSetId>()
  for (const id of ids) {
    const m = byId.get(id)
    if (!m) continue
    for (const s of m.sets) acc.add(s)
  }
  return Array.from(acc)
}
