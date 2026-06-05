/**
 * metasetIcons.ts
 *
 * Shared catalog of metaset icon options. Icons are emoji/glyphs chosen to
 * evoke RPG/Raid themes and remain legible in the chip summaries.
 */

type IconVariant = 'none' | 'emoji' | 'glyph'

type IconDef = {
  key: string
  emoji: string
}

const BASE_ICON_DEFS: readonly IconDef[] = [
  { key: 'swords', emoji: '⚔️' },
  { key: 'shield', emoji: '🛡️' },
  { key: 'axe', emoji: '🪓' },
  { key: 'bow', emoji: '🏹' },
  { key: 'dagger', emoji: '🗡️' },
  { key: 'hammer', emoji: '🔨' },
  { key: 'helmet', emoji: '🪖' },
  { key: 'crown', emoji: '👑' },
  { key: 'banner', emoji: '🚩' },
  { key: 'target', emoji: '🎯' },
  { key: 'gauntlet', emoji: '🦾' },
  { key: 'potion', emoji: '🧪' },
  { key: 'scroll', emoji: '📜' },
  { key: 'wand', emoji: '🪄' },
  { key: 'crystal', emoji: '🔮' },
  { key: 'dragon', emoji: '🐉' },
  { key: 'flame', emoji: '🔥' },
  { key: 'frost', emoji: '❄️' },
  { key: 'lightning', emoji: '⚡️' },
  { key: 'water', emoji: '💧' },
  { key: 'stone', emoji: '🪨' },
  { key: 'skull', emoji: '💀' },
  { key: 'star', emoji: '🌟' },
  { key: 'moon', emoji: '🌙' },
  { key: 'sun', emoji: '☀️' },
  { key: 'gem', emoji: '💎' },
  { key: 'key', emoji: '🗝️' },
  { key: 'compass', emoji: '🧭' },
  { key: 'hourglass', emoji: '⏳' },
  { key: 'map', emoji: '🗺️' },
  { key: 'hospital', emoji: '🏥' },
  { key: 'ambulance', emoji: '🚑' },
  { key: 'syringe', emoji: '💉' },
  { key: 'pill', emoji: '💊' },
  { key: 'stethoscope', emoji: '🩺' },
  { key: 'recycle', emoji: '♻️' },
  { key: 'wastebasket', emoji: '🗑️' },
  { key: 'poop', emoji: '💩' },
  { key: 'bandage', emoji: '🩹' },
  { key: 'support', emoji: '🤝' },
  { key: 'mage', emoji: '🧙' },
  { key: 'sparkles', emoji: '✨' },
  // RAID/gacha-flavoured additions: gear economy, accessories, progression, slots.
  { key: 'coin', emoji: '🪙' },
  { key: 'moneybag', emoji: '💰' },
  { key: 'ring', emoji: '💍' },
  { key: 'trophy', emoji: '🏆' },
  { key: 'cog', emoji: '⚙️' },
  { key: 'chart', emoji: '📈' },
  { key: 'heart', emoji: '❤️' },
  { key: 'backpack', emoji: '🎒' },
  { key: 'grid', emoji: '🔳' },
  { key: 'lock', emoji: '🔒' },
  { key: 'boot', emoji: '🥾' },
]

const GLYPH_FALLBACKS: Record<string, string> = {
  swords: '⚔',
  shield: '⛨',
  axe: '⛏',
  bow: '➹',
  dagger: '†',
  hammer: '⚒',
  helmet: '⛑',
  crown: '♛',
  banner: '⚑',
  target: '◎',
  gauntlet: '☛',
  potion: '⚗',
  scroll: '✎',
  wand: '✧',
  crystal: '◇',
  dragon: '♘',
  flame: '♨',
  frost: '❄',
  lightning: '☇',
  water: '☂',
  stone: '▧',
  skull: '☠',
  star: '✦',
  moon: '☾',
  sun: '☀',
  gem: '◆',
  key: '⚿',
  compass: '⍟',
  hourglass: '⧗',
  map: '⌖',
  hospital: '☤',
  ambulance: '✚',
  syringe: '℞',
  pill: '⚗︎',
  stethoscope: '⚕',
  recycle: '♻',
  wastebasket: '🗑︎',
  poop: '☣',
  bandage: '╂',
  support: '⋈',
  mage: '♗',
  sparkles: '✶',
  // Monochrome fallbacks for the RAID/gacha additions (kept distinct from every glyph above).
  coin: '¤',
  moneybag: '$',
  ring: '⊙',
  trophy: '♔',
  cog: '⚙',
  chart: '⇗',
  heart: '♥',
  backpack: '▤',
  grid: '▦',
  lock: '⊡',
  boot: '➶',
}

export type MetasetIconOption = {
  id: `icon.${string}` | `glyph.${string}` | 'none' | 'empty'
  glyph: string
  variant: IconVariant
}

export type MetasetIconId = MetasetIconOption['id']

const EMOJI_ICON_OPTIONS = BASE_ICON_DEFS.map((def) => ({
  id: `icon.${def.key}` as const,
  glyph: def.emoji,
  variant: 'emoji' as const,
}))

const GLYPH_ICON_OPTIONS = BASE_ICON_DEFS.map((def) => ({
  id: `glyph.${def.key}` as const,
  glyph: GLYPH_FALLBACKS[def.key] ?? def.emoji,
  variant: 'glyph' as const,
}))

const CIRCLED_ZERO_CODE_POINT = 0x24ea
const CIRCLED_ONE_CODE_POINT = 0x2460

const NUMBER_GLYPH_CODE_POINTS: readonly number[] = [
  CIRCLED_ZERO_CODE_POINT,
  ...Array.from({ length: 9 }, (_, idx) => CIRCLED_ONE_CODE_POINT + idx),
]

// Circled forty-two (U+32B7, ㊷) — a deliberate nod to "the answer to everything".
const CIRCLED_FORTY_TWO_CODE_POINT = 0x32b7

// Provide circled digits U+24EA (0) and U+2460..U+2468 (1-9) so aria labels stay aligned with visible glyphs.
const NUMBER_GLYPH_OPTIONS: MetasetIconOption[] = [
  ...NUMBER_GLYPH_CODE_POINTS.map((codePoint, idx) => ({
    id: `glyph.num${idx}` as const,
    glyph: String.fromCodePoint(codePoint),
    variant: 'glyph' as const,
  })),
  // Special multi-digit circled number; aria handling derives "number 42" from the id suffix.
  { id: 'glyph.num42', glyph: String.fromCodePoint(CIRCLED_FORTY_TWO_CODE_POINT), variant: 'glyph' as const },
]

export const METASET_ICON_OPTIONS: readonly MetasetIconOption[] = [
  { id: 'none', glyph: '∅', variant: 'none' },
  { id: 'empty', glyph: '　', variant: 'none' },
  ...EMOJI_ICON_OPTIONS,
  ...GLYPH_ICON_OPTIONS,
  ...NUMBER_GLYPH_OPTIONS,
] as const

export const DEFAULT_METASET_ICON_ID: MetasetIconId = 'none'

const ICON_OPTION_BY_ID: ReadonlyMap<MetasetIconId, MetasetIconOption> = new Map(
  METASET_ICON_OPTIONS.map(option => [option.id, option]),
)

const RANDOM_ICON_IDS = EMOJI_ICON_OPTIONS.map(option => option.id)

export function metasetIconOptionById(id: MetasetIconId): MetasetIconOption {
  return ICON_OPTION_BY_ID.get(id) ?? ICON_OPTION_BY_ID.get('none')!
}

export function normalizeMetasetIconId(value: unknown): MetasetIconId {
  if (typeof value !== 'string') return DEFAULT_METASET_ICON_ID
  return (ICON_OPTION_BY_ID.get(value as MetasetIconId)?.id ?? DEFAULT_METASET_ICON_ID)
}

export function randomMetasetIconId(rnd: () => number = Math.random): MetasetIconId {
  if (RANDOM_ICON_IDS.length === 0) return DEFAULT_METASET_ICON_ID
  const idx = Math.min(RANDOM_ICON_IDS.length - 1, Math.max(0, Math.floor(rnd() * RANDOM_ICON_IDS.length)))
  return RANDOM_ICON_IDS[idx]!
}
