import { Faction, type FactionId } from '../types';
import bannerLordsIcon from '../../../ico/faction/banner-lords.webp';
import highElvesIcon from '../../../ico/faction/high-elves.webp';
import sacredOrderIcon from '../../../ico/faction/sacred-order.webp';
import barbariansIcon from '../../../ico/faction/barbarians.webp';
import ogrynTribesIcon from '../../../ico/faction/ogryn-tribes.webp';
import lizardmenIcon from '../../../ico/faction/lizardmen.webp';
import skinwalkersIcon from '../../../ico/faction/skinwalkers.webp';
import orcsIcon from '../../../ico/faction/orcs.webp';
import demonspawnIcon from '../../../ico/faction/demonspawn.webp';
import undeadHordesIcon from '../../../ico/faction/undead-hordes.webp';
import darkElvesIcon from '../../../ico/faction/dark-elves.webp';
import knightRevenantIcon from '../../../ico/faction/knight-revenant.webp';
import dwarvesIcon from '../../../ico/faction/dwarves.webp';
import shadowkinIcon from '../../../ico/faction/shadowkin.webp';
import sylvanWatchersIcon from '../../../ico/faction/sylvan-watchers.webp';

export const FACTION_ICON_MAP: Partial<Record<Faction, string>> = {
  [Faction.BannerLords]: bannerLordsIcon,
  [Faction.HighElves]: highElvesIcon,
  [Faction.SacredOrder]: sacredOrderIcon,
  [Faction.Barbarians]: barbariansIcon,
  [Faction.OgrynTribes]: ogrynTribesIcon,
  [Faction.Lizardmen]: lizardmenIcon,
  [Faction.Skinwalkers]: skinwalkersIcon,
  [Faction.Orcs]: orcsIcon,
  [Faction.Demonspawn]: demonspawnIcon,
  [Faction.UndeadHordes]: undeadHordesIcon,
  [Faction.DarkElves]: darkElvesIcon,
  [Faction.KnightRevenant]: knightRevenantIcon,
  [Faction.Dwarves]: dwarvesIcon,
  [Faction.Shadowkin]: shadowkinIcon,
  [Faction.SylvanWatchers]: sylvanWatchersIcon,
};

export function factionIconUrl(code?: FactionId): string | undefined {
  if (code === undefined || code === null) return undefined;
  const numeric = Number(code);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return FACTION_ICON_MAP[numeric as Faction];
}
