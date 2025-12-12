import { ArtifactSet, type ArtifactSetId } from '../types';
import lifeIcon from '../../../ico/sets/Life.webp';
import offenseIcon from '../../../ico/sets/Offense.webp';
import defenseIcon from '../../../ico/sets/Defense.webp';
import speedIcon from '../../../ico/sets/Speed.webp';
import criticalRateIcon from '../../../ico/sets/Critical Rate.webp';
import critDamageIcon from '../../../ico/sets/Crit Damage.webp';
import accuracyIcon from '../../../ico/sets/Accuracy.webp';
import resistanceIcon from '../../../ico/sets/Resistance.webp';
import lifestealIcon from '../../../ico/sets/Lifesteal.webp';
import furyIcon from '../../../ico/sets/Fury.webp';
import dazeIcon from '../../../ico/sets/Daze.webp';
import cursedIcon from '../../../ico/sets/Cursed.webp';
import frostIcon from '../../../ico/sets/Frost.webp';
import frenzyIcon from '../../../ico/sets/Frenzy.webp';
import regenerationIcon from '../../../ico/sets/Regeneration.webp';
import immunityIcon from '../../../ico/sets/Immunity.webp';
import shieldIcon from '../../../ico/sets/Shield.webp';
import relentlessIcon from '../../../ico/sets/Relentless.webp';
import savageIcon from '../../../ico/sets/Savage.webp';
import destroyIcon from '../../../ico/sets/Destroy.webp';
import stunIcon from '../../../ico/sets/Stun.webp';
import toxicIcon from '../../../ico/sets/Toxic.webp';
import provokeIcon from '../../../ico/sets/Provoke.webp';
import retaliationIcon from '../../../ico/sets/Retaliation.webp';
import avengingIcon from '../../../ico/sets/Avenging.webp';
import stalwartIcon from '../../../ico/sets/Stalwart.webp';
import reflexIcon from '../../../ico/sets/Reflex.webp';
import curingIcon from '../../../ico/sets/Curing.webp';
import cruelIcon from '../../../ico/sets/Cruel.webp';
import immortalIcon from '../../../ico/sets/Immortal.webp';
import divineOffenseIcon from '../../../ico/sets/Divine Offense.webp';
import divineCriticalRateIcon from '../../../ico/sets/Divine Critical Rate.webp';
import divineLifeIcon from '../../../ico/sets/Divine Life.webp';
import divineSpeedIcon from '../../../ico/sets/Divine Speed.webp';
import swiftParryIcon from '../../../ico/sets/Swift Parry.webp';
import deflectionIcon from '../../../ico/sets/Deflection.webp';
import resilienceIcon from '../../../ico/sets/Resilience.webp';
import perceptionIcon from '../../../ico/sets/Perception.webp';
import affinitybreakerIcon from '../../../ico/sets/Affinitybreaker.webp';
import untouchableIcon from '../../../ico/sets/Untouchable.webp';
import fatalIcon from '../../../ico/sets/Fatal.webp';
import frostbiteIcon from '../../../ico/sets/Frostbite.webp';
import bloodthirstIcon from '../../../ico/sets/Bloodthirst.webp';
import guardianIcon from '../../../ico/sets/Guardian.webp';
import fortitudeIcon from '../../../ico/sets/Fortitude.webp';
import lethalIcon from '../../../ico/sets/Lethal.webp';
import protectionIcon from '../../../ico/sets/Protection.webp';
import stoneskinIcon from '../../../ico/sets/Stoneskin.webp';
import killstrokeIcon from '../../../ico/sets/Killstroke.webp';
import instinctIcon from '../../../ico/sets/Instinct.webp';
import bolsterIcon from '../../../ico/sets/Bolster.webp';
import defiantIcon from '../../../ico/sets/Defiant.webp';
import impulseIcon from '../../../ico/sets/Impulse.webp';
import zealIcon from '../../../ico/sets/Zeal.webp';
import righteousIcon from '../../../ico/sets/Righteous.webp';
import supersonicIcon from '../../../ico/sets/Supersonic.webp';
import mercilessIcon from '../../../ico/sets/Merciless.webp';
import slayerIcon from '../../../ico/sets/Slayer.webp';
import feralIcon from '../../../ico/sets/Feral.webp';
import pinpointIcon from '../../../ico/sets/Pinpoint.webp';
import stonecleaverIcon from '../../../ico/sets/Stonecleaver.webp';
import rebirthIcon from '../../../ico/sets/Rebirth.webp';
import chronophageIcon from '../../../ico/sets/Chronophage.webp';
import refreshIcon from '../../../ico/sets/Refresh.webp';
import cleansingIcon from '../../../ico/sets/Cleansing.webp';
import bloodshieldIcon from '../../../ico/sets/Bloodshield.webp';
import reactionIcon from '../../../ico/sets/Reaction.webp';
import revengeIcon from '../../../ico/sets/Revenge.webp';

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
};

const runtimeIconMap = new Map<number, string>();

export function setRuntimeGearSetIcon(id: ArtifactSetId, dataUrl?: string) {
  const numeric = Number(id);
  if (!Number.isFinite(numeric) || numeric <= 0) return;
  if (!dataUrl) {
    runtimeIconMap.delete(numeric);
    return;
  }
  runtimeIconMap.set(numeric, dataUrl);
}

export function gearSetIconUrl(code?: ArtifactSetId): string | undefined {
  if (code === undefined || code === null) return undefined;
  const numeric = Number(code);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  const runtimeIcon = runtimeIconMap.get(numeric);
  if (runtimeIcon) return runtimeIcon;
  return GEARSET_ICON_MAP[numeric as ArtifactSet];
}
