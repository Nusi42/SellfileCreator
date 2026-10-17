import { Faction, factionCodeToName, type FactionId } from '../types';
import { PACK_FACTION_ICONS, placeholderIconUrl } from './gameIcons';

// Crest file stem in the asset pack (<pack>/ico/faction/<stem>.webp) for each faction.
const FACTION_ICON_STEMS: Record<Faction, string> = {
  [Faction.BannerLords]: 'banner-lords',
  [Faction.HighElves]: 'high-elves',
  [Faction.SacredOrder]: 'sacred-order',
  [Faction.Barbarians]: 'barbarians',
  [Faction.OgrynTribes]: 'ogryn-tribes',
  [Faction.Lizardmen]: 'lizardmen',
  [Faction.Skinwalkers]: 'skinwalkers',
  [Faction.Orcs]: 'orcs',
  [Faction.Demonspawn]: 'demonspawn',
  [Faction.UndeadHordes]: 'undead-hordes',
  [Faction.DarkElves]: 'dark-elves',
  [Faction.KnightRevenant]: 'knight-revenant',
  [Faction.Dwarves]: 'dwarves',
  [Faction.Shadowkin]: 'shadowkin',
  [Faction.SylvanWatchers]: 'sylvan-watchers',
  // Argonites crest for faction filters and labels.
  [Faction.Argonites]: 'argonites',
};

// Pack crest when available, else a lettered placeholder named after the faction.
export const FACTION_ICON_MAP: Partial<Record<Faction, string>> = Object.fromEntries(
  (Object.entries(FACTION_ICON_STEMS) as Array<[string, string]>).map(([code, stem]) => [
    code,
    PACK_FACTION_ICONS[stem] ?? placeholderIconUrl(factionCodeToName(Number(code) as FactionId)),
  ]),
) as Partial<Record<Faction, string>>;

export function factionIconUrl(code?: FactionId): string | undefined {
  if (code === undefined || code === null) return undefined;
  const numeric = Number(code);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return FACTION_ICON_MAP[numeric as Faction];
}
