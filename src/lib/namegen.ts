/**
 * namegen.ts
 *
 * Lightweight generator for default metaset names using RSL-friendly terms.
 * Keeps code small by combining curated word lists into many safe combos.
 *
 * Runtime safety: Filters out words used elsewhere in the UI (artifact sets,
 * factions, types) so future additions won’t clash with generated names.
 */
import { artifactSetNames, factionNames, artifactTypeNames } from './types'

// Neutral descriptors (avoid mature/offensive content). Combined list.
const DESCRIPTORS = [
  'Ancient','Arcane','Blazing','Brave','Crimson','Daring','Dawn','Dusk','Elder','Emerald',
  'Eternal','Frosted','Golden','Grand','Hidden','Honored','Iron','Ivory','Luminous','Majestic',
  'Mystic','Noble','Obsidian','Radiant','Sapphire','Silent','Silver','Shadow',
  'Storm','Swift','True','Valiant','Verdant','Vigorous','Vivid','Wild',
  // Extra neutral descriptors (no set/rarity terms)
  'Aerial','Amber','Autumn','Azure','Beaming','Bold','Bright','Bronze','Burnished','Calm',
  'Candid','Celestial','Cerulean','Chiseled','Clear','Cobalt','Courageous','Crystal','Dappled',
  'Dawnlit','Deep','Dusklit','Eager','Earthen','Echoing','Ethereal','Evergreen','Feathered','Fervent',
  'Flickering','Flint','Flowing','Fluent','Gilded','Gleaming','Glimmering','Glinting','Glorious','Granite',
  'Hallowed','Harmonic','Hewn','Humble','Iridescent','Kindred','Lithe','Lofty','Mellow','Mighty',
  'Moonlit','Opal','Opaline','Pale','Polished','Pristine','Pure','Quiet','Resolute','Robust',
  'Ruby','Rune‑etched','Sable','Seaward','Serene','Shaded','Shimmering','Shining','Shorebound','Skyward',
  'Slate','Smoky','Soaring','Solar','Solid','Somber','Steadfast','Sturdy','Sunlit','Sure',
  'Tempest','Thundering','Timber','Titan','Tranquil','Umbral','Undaunted','Veiled','Venerable','Veridian',
  'Vestal','Vividly','Waveborne','Whispering','Windborne','Windswept','Winter','Wooden','Wrought','Zephyr'
] as const

// RSL-flavored themes and locations (safe, kid‑friendly). Combined list.
const THEMES = [
  'Arena','Clan','Campaign','Dragon','Fire Knight','Ice Golem','Spider','Minotaur','Hydra',
  'Doom Tower','Crypt','Forge','Sanctum','Keep','Vault','Watch','Outpost','Bastion',
  'Citadel','Stronghold','Harbor','Clearing','Crossroads','Ruins','Depths','Peak','Labyrinth','Spire',
  // Additional places/encounters (neutral)
  'Sanctuary','Ward','Frontier','Borderlands','Highlands','Lowlands','Seaboard','Wetlands','Wilds','Shores',
  'Estuary','Fjords','Foothills','Pass','Ravine','Ridge','Vale','Glade','Grove','Thicket',
  'Moor','Fen','Bog','Marsh','Dunes','Oasis','Canyon','Crag','Cavern','Hollow',
  'Hearth','Hall','Waygate','Watchtower','Bridge','Beacon','Outlands','Heartlands','Hinterlands','Coast',
  'Isle','Sound','Cove','Bay','Harborfront','Quay','Wharf','Village','Crossing','Trail',
  'Waystation','Encampment','Camp','Barracks','Foundry','Workshop','Anvil','Archives','Atrium','Arcade'
] as const

// Group nouns/titles (set names should feel like collections or squads). Combined list.
const GROUPS = [
  'Aegis','Assembly','Band','Circle','Cohort','Company','Council','Covenant','Division','Envoys',
  'Legacy','Order','Pact','Patrol','Phalanx','Regiment','Sentinels','Sigils','Standard',
  'Taskforce','Troop','Vanguard','Ward','Wayfarers','Keepers','Pathfinders','Rangers','Skirmish',
  // Additional group nouns/titles
  'Alliance','Brigade','Caravan','Cartographers','Chorus','Compact','Conclave','Consuls','Couriers','Crew',
  'Detachment','Emissaries','Expedition','Fellowship','Forerunners','Garrison','Guild','Harriers','Heralds','Homestead',
  'Host','Justicars','Line','March','Militia','Outriders','Pathmakers','Pioneers','Platoon','Pledge',
  'Raiders','Rangers','Retinue','Scribes','Scouts','Seafarers','Seekers','Squad','Stewards',
  'Striders','Tidewatch','Trailblazers','Tribunal','Tribe','Truce','Van','Venture','Wardens','Watch',
  'Waykeepers','Wing','Yeomen','Advance','Bulwark','Embassy','Kin','Enclave','Coterie'
] as const

// Regions/place proper names (fantasy flavored, neutral). Combined list.
const FACTIONS = [
  'Kaerok','Aravia','Felwin','Teleria','Tilshire','Durham','Valdemar','Karak','Velyzar','Yelisia',
  'Everspring','Starfall','Sunspire','Moonreach','Whitehollow','Blackridge','Redmarsh','Greenvale','Goldhaven','Ironpeak',
  'Stonewatch','Stormhold','Rivermouth','Kingscrest','Queensguard','Northwatch','Southport','Eastgate','Westmarch','Windrest',
  'Seabreak','Hillfort','Oakheart','Pinecrest','Maplefen','Ashwick','Grimshore','Brightfen','Hearthglen','Ravenmoor',
  'Stormvale','Oakenshield','Highcrest','Lowmere','Broadwater','Stillwater','Brightwater','Greyhaven','Ravenwatch','Moonshade',
  'Dawnhold','Duskreach','Skybridge','Stonebridge','Frostford','Mistwood','Eagle’s Nest','Falconreach','Lionsgate','Foxglove',
  'Wolfpine','Bearcliff','Deerbrook','Starglen','Amberfall','Snowmelt','Sunfall','Emberglen','Cindermere','Starhaven'
] as const

// Playful name parts (kid‑friendly). Centralized to avoid duplication between generators.
const FUN_ADJ_BASE = [
  'Mostly Harmless','Well Rested','Snack‑Powered','Tea‑Drinking','Nearly Legendary','Mildly Confused','Map‑Loving','Lantern‑Lit','Puzzle‑Solving','Steadily Swift',
  'Hydra‑Curious','Gold‑Counting','Door‑Knocking','Bench‑Warming','Torch‑Bearing','Scroll‑Keeping','Cookie‑Sharing','Quietly Heroic','Friend‑Shaped','Kind of Brave',
  // extra playful adjectives
  'Mostly Awake','Probably Friendly','Kind of Lost','Slightly Sparkly','Almost Epic','Coffee-Free','Biscuit-Powered','Courage-Adjacent','Calm and Collected','Feather-Light',
  'Fairly Nimble','Helmet-Polished','Shield-Shined','Boots-Tied','Map-Savvy','Torch-Lit','Better Prepared','Backpack-Ready','Generally Helpful','Snack-Optimized',
  'Cautiously Brave','Coin-Conscious','Path-Optimized','Safety-Minded','Team-Spirited','Weather-Ready','Storm-Resistant','Sun-Hatted','Compass-Checked','Note-Taking',
  'Time-Optimistic','Early-Rising','Late-Friendly','Campfire-Approved','Story-Loving','Tune-Humming','Quietly Excited','Trail-Ready','Friendly-Focused','Neatly-Organized'
] as const
const FUN_GROUPS_BASE = [
  'Tea Club','Snack Squad','Map Readers','Door Knockers','Torch Bearers','Bench Crew','Mop Brigade','Coin Counters','Riddle Solvers','Lantern Lighters',
  'Scroll Keepers','Trail Mixers','Backpack Crew','Campfire Chorus','Friendly Patrol','Helping Hands','Nest Watch','Path Planners','Happy Travelers','Good Sports',
  // extra playful groups
  'Biscuit Bakers','Cocoa Carriers','Compass Checkers','Campfire Cooks','Tent Pitchers','Log Lifters','Rope Wranglers','Ladder Holders','Flag Folders','Water Bearers',
  'Trail Tenders','Gear Tidy Team','Spare Socks Club','Sandwich Stackers','Pebble Collectors','Shell Sorters','Feather Finders','Path Sweepers','Milestone Markers','Puddle Jumpers',
  'Cloud Spotters','Star Gazers','Sun Catchers','Breeze Testers','Echo Checkers','Door Holders','Gate Greeters','Bridge Buddies','Ferry Friends','Torch Tenders',
  'Scroll Sorters','Page Turners','Quill Sharpeners','Pack Organizers','Snack Slicers','Fruit Peelers','Trail Singers','Rhythm Tappers','Beat Keepers','Kind Helpers'
] as const
const FUN_SUFFIX_BASE = [
  'and Friends','(probably)','— ish','but Faster','on Tuesdays','for Science','and Company','(maybe)','with Snacks','(ish)',
  // extra playful suffixes
  'with Extra Socks','before Lunch','after Nap Time','with Maps','with Lanterns','for Fun','if Needed','as Required','weather permitting','just in Case',
  'probably','definitely','maybe later','in Comfortable Shoes','with Fresh Batteries','under Supervision','within Reason','on Weekends','during Tea Time','between Quests'
] as const

function pick<T>(arr: readonly T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)]!
}

// Small LCG for stable pseudo‑randomness without bringing dependencies
function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return (s & 0xfffffff) / 0x10000000
  }
}


/**
 * generateMetasetNameWithFlag
 *
 * Returns both the generated name and whether a playful pattern was used.
 * UI may use the flag for short celebratory effects when a playful name is created.
 *
 * Notes:
 * - Keeps the same generation lists/filters as generateMetasetName.
 * - Treats pattern selection as an internal detail; callers should not rely on words.
 */
export function generateMetasetNameWithFlag(existingNames: string[], seed = Date.now()): { name: string; isFun: boolean } {
  const r = makeRng(seed)
  const tokenize = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  const bl = new Set<string>()
  try {
    Object.values(artifactSetNames).forEach(v => tokenize(v).forEach(t => bl.add(t)))
    Object.values(factionNames).forEach(v => tokenize(v).forEach(t => bl.add(t)))
    Object.values(artifactTypeNames).forEach(v => tokenize(v).forEach(t => bl.add(t)))
  } catch {}
  const safe = <T extends string>(arr: readonly T[]) => arr.filter(item => tokenize(item).every(t => !bl.has(t)))
  const D = safe(DESCRIPTORS)
  const T = safe(THEMES)
  const G = safe(GROUPS)
  const F = safe(FACTIONS)
  const DD = D.length ? D : DESCRIPTORS
  const TT = T.length ? T : THEMES
  const GG = G.length ? G : GROUPS
  const FF = F.length ? F : FACTIONS
  const SFUN_ADJ = safe(FUN_ADJ_BASE)
  const SFUN_GROUPS = safe(FUN_GROUPS_BASE)
  const SFUN_SUFFIX = FUN_SUFFIX_BASE as readonly string[]

  const normalPatterns: ((r: () => number) => string)[] = [
    (rr) => `${pick(DD, rr)} ${pick(GG, rr)}`,
    (rr) => `${pick(FF, rr)} ${pick(GG, rr)}`,
    (rr) => `${pick(TT, rr)} ${pick(GG, rr)}`,
    (rr) => `${pick(DD, rr)} ${pick(TT, rr)} ${pick(GG, rr)}`,
  ]
  const playfulPatterns: ((r: () => number) => string)[] = [
    (rr) => `${pick(DD, rr)} ${pick(TT, rr)} ${pick(SFUN_GROUPS, rr)}`,
    (rr) => `${pick(Math.random() < 0.5 ? FF : TT, rr)} ${pick(SFUN_GROUPS, rr)} ${pick(SFUN_SUFFIX, rr)}`,
    (rr) => `${pick(SFUN_ADJ.length ? SFUN_ADJ : (['Friendly'] as const), rr)} ${pick(SFUN_GROUPS, rr)}`,
  ]
  const patterns: ((r: () => number) => string)[] = []
  const usePlayfulFirst = Boolean(SFUN_GROUPS.length && r() < 0.20)
  if (usePlayfulFirst) patterns.push(...playfulPatterns)
  patterns.push(...normalPatterns)

  for (let i = 0; i < 12; i++) {
    const pat = pick(patterns, r)
    const name = pat(r)
    if (!existingNames.includes(name)) {
      return { name, isFun: usePlayfulFirst && playfulPatterns.includes(pat) }
    }
  }
  const pat = pick(patterns, r)
  const base = pat(r)
  let suffix = 2
  while (existingNames.includes(base + ' ' + suffix)) suffix++
  return { name: `${base} ${suffix}`, isFun: usePlayfulFirst && playfulPatterns.includes(pat) }
}
