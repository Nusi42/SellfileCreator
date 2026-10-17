/**
 * gameIcons — the app's single entry point to game artwork.
 *
 * Game art is not part of the repository: builds read it from the asset pack
 * through `virtual:game-icons` (scripts/vite/gameIconsPlugin.ts). A build without the pack
 * (any public clone) gets empty maps and falls back to the project's own art defined here:
 * lettered placeholder tiles for crests and set icons, and simple slot glyphs.
 * Every icon map module (champion, faction, gear set, set slot, slot glyph) reads from here.
 */
import * as pack from 'virtual:game-icons'

/** True when this build embeds the asset pack. */
export const GAME_ASSETS_CONFIGURED: boolean = pack.configured

/** Pack image maps keyed by file stem (empty without the pack). */
export const PACK_CHAMPION_ICONS = pack.champions
export const PACK_FACTION_ICONS = pack.factions
export const PACK_SET_ICONS = pack.sets
export const PACK_SET_SLOT_ICONS = pack.setSlots

export type SlotGlyph = { readonly viewBox: string; readonly path: string }

/**
 * The project's own slot glyphs (24x24, single path, filled with currentColor), used when
 * the pack is absent. Keys match the pack's glyph names.
 */
export const OWN_SLOT_GLYPHS = {
  Weapon: { viewBox: '0 0 24 24', path: 'M19 2 L22 2 L22 5 L11 16 L8 13 Z M6 12 L12 18 L10.5 19.5 L8.5 17.5 L5 21 L3 19 L6.5 15.5 L4.5 13.5 Z' },
  Helm: { viewBox: '0 0 24 24', path: 'M12 2 C7 2 4 6 4 11 L4 20 L9 20 L9 13 L15 13 L15 20 L20 20 L20 11 C20 6 17 2 12 2 Z' },
  Schild: { viewBox: '0 0 24 24', path: 'M12 2 L20 5 L20 11 C20 16 16.5 20 12 22 C7.5 20 4 16 4 11 L4 5 Z' },
  Handschuh: { viewBox: '0 0 24 24', path: 'M7 22 L7 12 L6 7 C5.8 5.6 7.8 5.4 8 6.6 L9 11 L9 4 C9 2.7 11 2.7 11 4 L11 10 L12 3.2 C12.2 1.9 14.2 2.1 14 3.4 L13.4 10 L14.8 5 C15.2 3.8 17.1 4.3 16.8 5.6 L15.8 12.5 L17.8 10.6 C18.8 9.7 20.3 11 19.4 12 L15 17.5 L15 22 Z' },
  Brust: { viewBox: '0 0 24 24', path: 'M8 2 L12 4 L16 2 L22 5.5 L19.5 11 L17 10 L17 22 L7 22 L7 10 L4.5 11 L2 5.5 Z' },
  Schuh: { viewBox: '0 0 24 24', path: 'M7 2 L14 2 L14 12.5 L20 15.5 C21.2 16.1 22 17.3 22 18.6 L22 21 L5 21 L5 13 L7 11 Z' },
  Ring: { viewBox: '0 0 24 24', path: 'M9.5 2 L14.5 2 L16 4.5 L12 7.5 L8 4.5 Z M12 8 A7 7 0 1 1 11.99 8 Z M12 11 A4 4 0 1 0 12.01 11 Z' },
  Amulett: { viewBox: '0 0 24 24', path: 'M4 2 L12 10.6 L20 2 L21.4 3.4 L13.3 12.1 A4.5 4.5 0 1 1 10.7 12.1 L2.6 3.4 Z' },
  Banner: { viewBox: '0 0 24 24', path: 'M5 2 L7 2 L7 22 L5 22 Z M8 3 L20 3 L16.5 7.5 L20 12 L8 12 Z' },
} as const satisfies Record<string, SlotGlyph>

/** Slot glyph by name: the pack's when present, else the project's own. */
export const slotGlyph = (name: keyof typeof OWN_SLOT_GLYPHS): SlotGlyph =>
  pack.slotGlyphs[name] ?? OWN_SLOT_GLYPHS[name]

// Placeholder tiles are standalone images (data URIs), so they carry their own colours:
// a mid-grey disc with near-white initials reads on both the dark and the light scheme.
// Documented as a valid raw-colour exception in docs/technical/theming-system.md.
const PLACEHOLDER_FILL = '#7a8290'
const PLACEHOLDER_TEXT = '#f4f5f7'

const placeholderCache = new Map<string, string>()

/** Up to two initials of a display name ("Critical Rate" → "CR", "Orcs" → "O"). */
export const placeholderInitials = (label: string): string =>
  label.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?'

/** A neutral lettered tile for `label` as an SVG data URI (memoized per label). */
export function placeholderIconUrl(label: string): string {
  const cached = placeholderCache.get(label)
  if (cached) return cached
  const text = placeholderInitials(label)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="${PLACEHOLDER_FILL}"/>`
    + `<text x="16" y="21" text-anchor="middle" font-family="sans-serif" font-size="${text.length > 1 ? 12 : 15}" font-weight="700" fill="${PLACEHOLDER_TEXT}">${text}</text></svg>`
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`
  placeholderCache.set(label, url)
  return url
}
