import { ensureContrastOnBg } from './colorUtils'

// Shared rarity accent palette keeps every UI surface (grid icons, flyouts, etc.) consistent.
export const RARITY_ACCENT_COLORS: Readonly<Record<number, string>> = {
  1: '#9ca3af',
  2: '#34d399',
  3: '#60a5fa',
  4: '#7c3aed',
  5: '#f9a825',
  6: '#8b0000',
}

export function resolveRarityAccentColor(rarity: number | null | undefined): string | undefined {
  if (rarity === null || rarity === undefined) return undefined
  const numeric = Number(rarity)
  if (!Number.isFinite(numeric)) return undefined
  return RARITY_ACCENT_COLORS[Math.max(1, Math.min(6, Math.round(numeric)))]
}

// Rarity accent contrast-corrected for legible TEXT / icon glyphs on an opaque surface,
// using the SAME WCAG pass as substat/appearance text. The dark accents (purple #7c3aed,
// mythical dark-red #8b0000) are otherwise unreadable as text on dark surfaces.
// Use ONLY when the color is rendered as text/an icon — borders and chart fills keep the
// raw accent so the rarity hue stays exact.
export function resolveRarityTextColor(rarity: number | null | undefined, surface: string): string | undefined {
  const accent = resolveRarityAccentColor(rarity)
  return accent ? ensureContrastOnBg(accent, surface) : undefined
}
