import { ArtifactSet, type ArtifactSetId } from '../artifactSets'
import { artifactSetName } from '../types'
import { PACK_SET_ICONS, placeholderIconUrl } from './gameIcons'
import { runtimeGearSetIcon } from './runtimeGearSetIcons'

// Set icon file stem in the asset pack (<pack>/ico/sets/<stem>.webp) for each set.
const GEARSET_ICON_STEMS: Partial<Record<ArtifactSet, string>> = {
  [ArtifactSet.Life]: 'Life',
  [ArtifactSet.Offense]: 'Offense',
  [ArtifactSet.Defense]: 'Defense',
  [ArtifactSet.Speed]: 'Speed',
  [ArtifactSet.CriticalRate]: 'Critical_Rate',
  [ArtifactSet.CritDamage]: 'Crit_Damage',
  [ArtifactSet.Accuracy]: 'Accuracy',
  [ArtifactSet.Resistance]: 'Resistance',
  [ArtifactSet.Lifesteal]: 'Lifesteal',
  [ArtifactSet.Fury]: 'Fury',
  [ArtifactSet.Daze]: 'Daze',
  [ArtifactSet.Cursed]: 'Cursed',
  [ArtifactSet.Frost]: 'Frost',
  [ArtifactSet.Frenzy]: 'Frenzy',
  [ArtifactSet.Regeneration]: 'Regeneration',
  [ArtifactSet.Immunity]: 'Immunity',
  [ArtifactSet.Shield]: 'Shield',
  [ArtifactSet.Relentless]: 'Relentless',
  [ArtifactSet.Savage]: 'Savage',
  [ArtifactSet.Destroy]: 'Destroy',
  [ArtifactSet.Stun]: 'Stun',
  [ArtifactSet.Toxic]: 'Toxic',
  [ArtifactSet.Provoke]: 'Provoke',
  [ArtifactSet.Retaliation]: 'Retaliation',
  [ArtifactSet.Avenging]: 'Avenging',
  [ArtifactSet.Stalwart]: 'Stalwart',
  [ArtifactSet.Reflex]: 'Reflex',
  [ArtifactSet.Curing]: 'Curing',
  [ArtifactSet.Cruel]: 'Cruel',
  [ArtifactSet.Immortal]: 'Immortal',
  [ArtifactSet.DivineOffense]: 'Divine_Offense',
  [ArtifactSet.DivineCriticalRate]: 'Divine_Critical_Rate',
  [ArtifactSet.DivineLife]: 'Divine_Life',
  [ArtifactSet.DivineSpeed]: 'Divine_Speed',
  [ArtifactSet.SwiftParry]: 'Swift_Parry',
  [ArtifactSet.Deflection]: 'Deflection',
  [ArtifactSet.Resilience]: 'Resilience',
  [ArtifactSet.Perception]: 'Perception',
  [ArtifactSet.Affinitybreaker]: 'Affinitybreaker',
  [ArtifactSet.Untouchable]: 'Untouchable',
  [ArtifactSet.Fatal]: 'Fatal',
  [ArtifactSet.Frostbite]: 'Frostbite',
  [ArtifactSet.Bloodthirst]: 'Bloodthirst',
  [ArtifactSet.Guardian]: 'Guardian',
  [ArtifactSet.Fortitude]: 'Fortitude',
  [ArtifactSet.Lethal]: 'Lethal',
  [ArtifactSet.Protection]: 'Protection',
  [ArtifactSet.Stoneskin]: 'Stoneskin',
  [ArtifactSet.Killstroke]: 'Killstroke',
  [ArtifactSet.Instinct]: 'Instinct',
  [ArtifactSet.Bolster]: 'Bolster',
  [ArtifactSet.Defiant]: 'Defiant',
  [ArtifactSet.Impulse]: 'Impulse',
  [ArtifactSet.Zeal]: 'Zeal',
  [ArtifactSet.Righteous]: 'Righteous',
  [ArtifactSet.Supersonic]: 'Supersonic',
  [ArtifactSet.Merciless]: 'Merciless',
  [ArtifactSet.Slayer]: 'Slayer',
  [ArtifactSet.Feral]: 'Feral',
  [ArtifactSet.Pinpoint]: 'Pinpoint',
  [ArtifactSet.Stonecleaver]: 'Stonecleaver',
  [ArtifactSet.Mercurial]: 'Mercurial',
  [ArtifactSet.Rebirth]: 'Rebirth',
  [ArtifactSet.Chronophage]: 'Chronophage',
  [ArtifactSet.Refresh]: 'Refresh',
  [ArtifactSet.Cleansing]: 'Cleansing',
  [ArtifactSet.Bloodshield]: 'Bloodshield',
  [ArtifactSet.Reaction]: 'Reaction',
  [ArtifactSet.Revenge]: 'Revenge',
}

// Pack icon when available, else a lettered placeholder named after the set.
export const GEARSET_ICON_MAP: Partial<Record<ArtifactSet, string>> = Object.fromEntries(
  (Object.entries(GEARSET_ICON_STEMS) as Array<[string, string]>).map(([id, stem]) => [
    id,
    PACK_SET_ICONS[stem] ?? placeholderIconUrl(artifactSetName(Number(id) as ArtifactSetId)),
  ]),
) as Partial<Record<ArtifactSet, string>>

// Runtime overrides (icons injected from a loaded gear-set file, registered through
// ./runtimeGearSetIcons) win over the static map.
export function gearSetIconUrl(code?: ArtifactSetId): string | undefined {
  if (code === undefined || code === null) return undefined
  const numeric = Number(code)
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined
  const runtimeIcon = runtimeGearSetIcon(numeric)
  if (runtimeIcon) return runtimeIcon
  return GEARSET_ICON_MAP[numeric as ArtifactSet]
}
