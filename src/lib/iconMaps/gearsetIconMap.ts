import { ArtifactSet, type ArtifactSetId } from '../types';
import lifeIcon from '../../../ico/Life.webp';
import offenseIcon from '../../../ico/Offense.webp';
import defenseIcon from '../../../ico/Defense.webp';
import speedIcon from '../../../ico/Speed.webp';
import criticalRateIcon from '../../../ico/Critical Rate.webp';
import critDamageIcon from '../../../ico/Crit Damage.webp';
import accuracyIcon from '../../../ico/Accuracy.webp';
import resistanceIcon from '../../../ico/Resistance.webp';
import lifestealIcon from '../../../ico/Lifesteal.webp';
import furyIcon from '../../../ico/Fury.webp';
import dazeIcon from '../../../ico/Daze.webp';
import cursedIcon from '../../../ico/Cursed.webp';
import frostIcon from '../../../ico/Frost.webp';
import frenzyIcon from '../../../ico/Frenzy.webp';
import regenerationIcon from '../../../ico/Regeneration.webp';
import immunityIcon from '../../../ico/Immunity.webp';
import shieldIcon from '../../../ico/Shield.webp';
import relentlessIcon from '../../../ico/Relentless.webp';
import savageIcon from '../../../ico/Savage.webp';
import destroyIcon from '../../../ico/Destroy.webp';
import stunIcon from '../../../ico/Stun.webp';
import toxicIcon from '../../../ico/Toxic.webp';
import provokeIcon from '../../../ico/Provoke.webp';
import retaliationIcon from '../../../ico/Retaliation.webp';
import avengingIcon from '../../../ico/Avenging.webp';
import stalwartIcon from '../../../ico/Stalwart.webp';
import reflexIcon from '../../../ico/Reflex.webp';
import curingIcon from '../../../ico/Curing.webp';
import cruelIcon from '../../../ico/Cruel.webp';
import immortalIcon from '../../../ico/Immortal.webp';
import divineOffenseIcon from '../../../ico/Divine Offense.webp';
import divineCriticalRateIcon from '../../../ico/Divine Critical Rate.webp';
import divineLifeIcon from '../../../ico/Divine Life.webp';
import divineSpeedIcon from '../../../ico/Divine Speed.webp';
import swiftParryIcon from '../../../ico/Swift Parry.webp';
import deflectionIcon from '../../../ico/Deflection.webp';
import resilienceIcon from '../../../ico/Resilience.webp';
import perceptionIcon from '../../../ico/Perception.webp';
import affinitybreakerIcon from '../../../ico/Affinitybreaker.webp';
import untouchableIcon from '../../../ico/Untouchable.webp';
import fatalIcon from '../../../ico/Fatal.webp';
import frostbiteIcon from '../../../ico/Frostbite.webp';
import bloodthirstIcon from '../../../ico/Bloodthirst.webp';
import guardianIcon from '../../../ico/Guardian.webp';
import fortitudeIcon from '../../../ico/Fortitude.webp';
import lethalIcon from '../../../ico/Lethal.webp';
import protectionIcon from '../../../ico/Protection.webp';
import stoneskinIcon from '../../../ico/Stoneskin.webp';
import killstrokeIcon from '../../../ico/Killstroke.webp';
import instinctIcon from '../../../ico/Instinct.webp';
import bolsterIcon from '../../../ico/Bolster.webp';
import defiantIcon from '../../../ico/Defiant.webp';
import impulseIcon from '../../../ico/Impulse.webp';
import zealIcon from '../../../ico/Zeal.webp';
import righteousIcon from '../../../ico/Righteous.webp';
import supersonicIcon from '../../../ico/Supersonic.webp';
import mercilessIcon from '../../../ico/Merciless.webp';
import slayerIcon from '../../../ico/Slayer.webp';
import feralIcon from '../../../ico/Feral.webp';
import pinpointIcon from '../../../ico/Pinpoint.webp';
import stonecleaverIcon from '../../../ico/Stonecleaver.webp';
import rebirthIcon from '../../../ico/Rebirth.webp';
import chronophageIcon from '../../../ico/Chronophage.webp';
import refreshIcon from '../../../ico/Refresh.webp';
import cleansingIcon from '../../../ico/Cleansing.webp';
import bloodshieldIcon from '../../../ico/Bloodshield.webp';
import reactionIcon from '../../../ico/Reaction.webp';
import revengeIcon from '../../../ico/Revenge.webp';

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

export function gearSetIconUrl(code?: ArtifactSetId): string | undefined {
  if (code === undefined || code === null) return undefined;
  const numeric = Number(code);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return GEARSET_ICON_MAP[numeric as ArtifactSet];
}
