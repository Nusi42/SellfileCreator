/**
 * `virtual:game-icons` — served by scripts/vite/gameIconsPlugin.ts from the asset pack
 * (or empty without one). Keys are file stems: hero ids for champions, crest stems
 * for factions (`banner-lords`), set names (`Critical_Rate`), set x slot keys (`Speed_Boots`).
 * Import it only through src/lib/iconMaps/gameIcons.ts.
 */
declare module 'virtual:game-icons' {
  /** True when the build found the asset pack. */
  export const configured: boolean
  export const champions: Readonly<Record<string, string>>
  export const factions: Readonly<Record<string, string>>
  export const sets: Readonly<Record<string, string>>
  export const setSlots: Readonly<Record<string, string>>
  /** Slot glyph SVG data keyed by glyph name (Weapon, Helm, Schild, …). */
  export const slotGlyphs: Readonly<Record<string, { readonly viewBox: string; readonly path: string }>>
}
