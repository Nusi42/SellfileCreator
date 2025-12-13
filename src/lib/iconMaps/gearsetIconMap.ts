import { ArtifactSet, type ArtifactSetId } from '../artifactSets'

// Use URL-based asset references instead of importing `*.webp` directly.
// This keeps Node-based test builds able to compile+execute without needing a bundler loader for images.
const lifeIcon = new URL('../../../ico/sets/Life.webp', import.meta.url).href
const offenseIcon = new URL('../../../ico/sets/Offense.webp', import.meta.url).href
const defenseIcon = new URL('../../../ico/sets/Defense.webp', import.meta.url).href
const speedIcon = new URL('../../../ico/sets/Speed.webp', import.meta.url).href
const criticalRateIcon = new URL('../../../ico/sets/Critical Rate.webp', import.meta.url).href
const critDamageIcon = new URL('../../../ico/sets/Crit Damage.webp', import.meta.url).href
const accuracyIcon = new URL('../../../ico/sets/Accuracy.webp', import.meta.url).href
const resistanceIcon = new URL('../../../ico/sets/Resistance.webp', import.meta.url).href
const lifestealIcon = new URL('../../../ico/sets/Lifesteal.webp', import.meta.url).href
const furyIcon = new URL('../../../ico/sets/Fury.webp', import.meta.url).href
const dazeIcon = new URL('../../../ico/sets/Daze.webp', import.meta.url).href
const cursedIcon = new URL('../../../ico/sets/Cursed.webp', import.meta.url).href
const frostIcon = new URL('../../../ico/sets/Frost.webp', import.meta.url).href
const frenzyIcon = new URL('../../../ico/sets/Frenzy.webp', import.meta.url).href
const regenerationIcon = new URL('../../../ico/sets/Regeneration.webp', import.meta.url).href
const immunityIcon = new URL('../../../ico/sets/Immunity.webp', import.meta.url).href
const shieldIcon = new URL('../../../ico/sets/Shield.webp', import.meta.url).href
const relentlessIcon = new URL('../../../ico/sets/Relentless.webp', import.meta.url).href
const savageIcon = new URL('../../../ico/sets/Savage.webp', import.meta.url).href
const destroyIcon = new URL('../../../ico/sets/Destroy.webp', import.meta.url).href
const stunIcon = new URL('../../../ico/sets/Stun.webp', import.meta.url).href
const toxicIcon = new URL('../../../ico/sets/Toxic.webp', import.meta.url).href
const provokeIcon = new URL('../../../ico/sets/Provoke.webp', import.meta.url).href
const retaliationIcon = new URL('../../../ico/sets/Retaliation.webp', import.meta.url).href
const avengingIcon = new URL('../../../ico/sets/Avenging.webp', import.meta.url).href
const stalwartIcon = new URL('../../../ico/sets/Stalwart.webp', import.meta.url).href
const reflexIcon = new URL('../../../ico/sets/Reflex.webp', import.meta.url).href
const curingIcon = new URL('../../../ico/sets/Curing.webp', import.meta.url).href
const cruelIcon = new URL('../../../ico/sets/Cruel.webp', import.meta.url).href
const immortalIcon = new URL('../../../ico/sets/Immortal.webp', import.meta.url).href
const divineOffenseIcon = new URL('../../../ico/sets/Divine Offense.webp', import.meta.url).href
const divineCriticalRateIcon = new URL('../../../ico/sets/Divine Critical Rate.webp', import.meta.url).href
const divineLifeIcon = new URL('../../../ico/sets/Divine Life.webp', import.meta.url).href
const divineSpeedIcon = new URL('../../../ico/sets/Divine Speed.webp', import.meta.url).href
const swiftParryIcon = new URL('../../../ico/sets/Swift Parry.webp', import.meta.url).href
const deflectionIcon = new URL('../../../ico/sets/Deflection.webp', import.meta.url).href
const resilienceIcon = new URL('../../../ico/sets/Resilience.webp', import.meta.url).href
const perceptionIcon = new URL('../../../ico/sets/Perception.webp', import.meta.url).href
const affinitybreakerIcon = new URL('../../../ico/sets/Affinitybreaker.webp', import.meta.url).href
const untouchableIcon = new URL('../../../ico/sets/Untouchable.webp', import.meta.url).href
const fatalIcon = new URL('../../../ico/sets/Fatal.webp', import.meta.url).href
const frostbiteIcon = new URL('../../../ico/sets/Frostbite.webp', import.meta.url).href
const bloodthirstIcon = new URL('../../../ico/sets/Bloodthirst.webp', import.meta.url).href
const guardianIcon = new URL('../../../ico/sets/Guardian.webp', import.meta.url).href
const fortitudeIcon = new URL('../../../ico/sets/Fortitude.webp', import.meta.url).href
const lethalIcon = new URL('../../../ico/sets/Lethal.webp', import.meta.url).href
const protectionIcon = new URL('../../../ico/sets/Protection.webp', import.meta.url).href
const stoneskinIcon = new URL('../../../ico/sets/Stoneskin.webp', import.meta.url).href
const killstrokeIcon = new URL('../../../ico/sets/Killstroke.webp', import.meta.url).href
const instinctIcon = new URL('../../../ico/sets/Instinct.webp', import.meta.url).href
const bolsterIcon = new URL('../../../ico/sets/Bolster.webp', import.meta.url).href
const defiantIcon = new URL('../../../ico/sets/Defiant.webp', import.meta.url).href
const impulseIcon = new URL('../../../ico/sets/Impulse.webp', import.meta.url).href
const zealIcon = new URL('../../../ico/sets/Zeal.webp', import.meta.url).href
const righteousIcon = new URL('../../../ico/sets/Righteous.webp', import.meta.url).href
const supersonicIcon = new URL('../../../ico/sets/Supersonic.webp', import.meta.url).href
const mercilessIcon = new URL('../../../ico/sets/Merciless.webp', import.meta.url).href
const slayerIcon = new URL('../../../ico/sets/Slayer.webp', import.meta.url).href
const feralIcon = new URL('../../../ico/sets/Feral.webp', import.meta.url).href
const pinpointIcon = new URL('../../../ico/sets/Pinpoint.webp', import.meta.url).href
const stonecleaverIcon = new URL('../../../ico/sets/Stonecleaver.webp', import.meta.url).href
const rebirthIcon = new URL('../../../ico/sets/Rebirth.webp', import.meta.url).href
const chronophageIcon = new URL('../../../ico/sets/Chronophage.webp', import.meta.url).href
const refreshIcon = new URL('../../../ico/sets/Refresh.webp', import.meta.url).href
const cleansingIcon = new URL('../../../ico/sets/Cleansing.webp', import.meta.url).href
const bloodshieldIcon = new URL('../../../ico/sets/Bloodshield.webp', import.meta.url).href
const reactionIcon = new URL('../../../ico/sets/Reaction.webp', import.meta.url).href
const revengeIcon = new URL('../../../ico/sets/Revenge.webp', import.meta.url).href

export const GEARSET_ICON_MAP: Partial<Record<ArtifactSet, string>> = {
  [ArtifactSet.Life]: lifeIcon,
  [ArtifactSet.Offense]: offenseIcon,
  [ArtifactSet.Defense]: defenseIcon,
  [ArtifactSet.Speed]: speedIcon,
  [ArtifactSet.CriticalRate]: criticalRateIcon,
  [ArtifactSet.CritDamage]: critDamageIcon,
  [ArtifactSet.Accuracy]: accuracyIcon,
  [ArtifactSet.Resistance]: resistanceIcon,
  [ArtifactSet.Lifesteal]: lifestealIcon,
  [ArtifactSet.Fury]: furyIcon,
  [ArtifactSet.Daze]: dazeIcon,
  [ArtifactSet.Cursed]: cursedIcon,
  [ArtifactSet.Frost]: frostIcon,
  [ArtifactSet.Frenzy]: frenzyIcon,
  [ArtifactSet.Regeneration]: regenerationIcon,
  [ArtifactSet.Immunity]: immunityIcon,
  [ArtifactSet.Shield]: shieldIcon,
  [ArtifactSet.Relentless]: relentlessIcon,
  [ArtifactSet.Savage]: savageIcon,
  [ArtifactSet.Destroy]: destroyIcon,
  [ArtifactSet.Stun]: stunIcon,
  [ArtifactSet.Toxic]: toxicIcon,
  [ArtifactSet.Provoke]: provokeIcon,
  [ArtifactSet.Retaliation]: retaliationIcon,
  [ArtifactSet.Avenging]: avengingIcon,
  [ArtifactSet.Stalwart]: stalwartIcon,
  [ArtifactSet.Reflex]: reflexIcon,
  [ArtifactSet.Curing]: curingIcon,
  [ArtifactSet.Cruel]: cruelIcon,
  [ArtifactSet.Immortal]: immortalIcon,
  [ArtifactSet.DivineOffense]: divineOffenseIcon,
  [ArtifactSet.DivineCriticalRate]: divineCriticalRateIcon,
  [ArtifactSet.DivineLife]: divineLifeIcon,
  [ArtifactSet.DivineSpeed]: divineSpeedIcon,
  [ArtifactSet.SwiftParry]: swiftParryIcon,
  [ArtifactSet.Deflection]: deflectionIcon,
  [ArtifactSet.Resilience]: resilienceIcon,
  [ArtifactSet.Perception]: perceptionIcon,
  [ArtifactSet.Affinitybreaker]: affinitybreakerIcon,
  [ArtifactSet.Untouchable]: untouchableIcon,
  [ArtifactSet.Fatal]: fatalIcon,
  [ArtifactSet.Frostbite]: frostbiteIcon,
  [ArtifactSet.Bloodthirst]: bloodthirstIcon,
  [ArtifactSet.Guardian]: guardianIcon,
  [ArtifactSet.Fortitude]: fortitudeIcon,
  [ArtifactSet.Lethal]: lethalIcon,
  [ArtifactSet.Protection]: protectionIcon,
  [ArtifactSet.Stoneskin]: stoneskinIcon,
  [ArtifactSet.Killstroke]: killstrokeIcon,
  [ArtifactSet.Instinct]: instinctIcon,
  [ArtifactSet.Bolster]: bolsterIcon,
  [ArtifactSet.Defiant]: defiantIcon,
  [ArtifactSet.Impulse]: impulseIcon,
  [ArtifactSet.Zeal]: zealIcon,
  [ArtifactSet.Righteous]: righteousIcon,
  [ArtifactSet.Supersonic]: supersonicIcon,
  [ArtifactSet.Merciless]: mercilessIcon,
  [ArtifactSet.Slayer]: slayerIcon,
  [ArtifactSet.Feral]: feralIcon,
  [ArtifactSet.Pinpoint]: pinpointIcon,
  [ArtifactSet.Stonecleaver]: stonecleaverIcon,
  [ArtifactSet.Rebirth]: rebirthIcon,
  [ArtifactSet.Chronophage]: chronophageIcon,
  [ArtifactSet.Refresh]: refreshIcon,
  [ArtifactSet.Cleansing]: cleansingIcon,
  [ArtifactSet.Bloodshield]: bloodshieldIcon,
  [ArtifactSet.Reaction]: reactionIcon,
  [ArtifactSet.Revenge]: revengeIcon,
}

// Runtime overrides let the gear-db viewer inject icons sourced from the DB itself.
const runtimeIconMap = new Map<number, string>()

export function setRuntimeGearSetIcon(id: ArtifactSetId, dataUrl?: string) {
  const numeric = Number(id)
  if (!Number.isFinite(numeric) || numeric <= 0) return
  if (!dataUrl) {
    runtimeIconMap.delete(numeric)
    return
  }
  runtimeIconMap.set(numeric, dataUrl)
}

export function gearSetIconUrl(code?: ArtifactSetId): string | undefined {
  if (code === undefined || code === null) return undefined
  const numeric = Number(code)
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined
  const runtimeIcon = runtimeIconMap.get(numeric)
  if (runtimeIcon) return runtimeIcon
  return GEARSET_ICON_MAP[numeric as ArtifactSet]
}
