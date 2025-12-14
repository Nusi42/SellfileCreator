/**
 * testerNormalizedPresets.ts
 *
 * Shared "Normalized score" preset metadata used by:
 * - Rule Tester grid score overlay presets
 * - Rule Tester "Normalized" sort source selection
 *
 * Keeping these constants/types centralized prevents UI state and persistence formats
 * from drifting when new presets are added or reordered.
 */

import { metasetIconOptionById, type MetasetIconId } from './metasetIcons'
import { StatVariant, STAT_VARIANTS_PRIORITY } from './types'

// Presets are UI-facing as [1..9], but stored internally as [0..8] to keep arrays compact.
export const TESTER_NORMALIZED_PRESET_COUNT = 9 as const

export type TesterNormalizedPresetId =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export type TesterNormalizedPresetDefinition = {
  // Optional icon/glyph to represent the preset.
  // Note: 'none' renders as the numeric id on the preset button (see `formatTesterNormalizedPresetButtonLabel`).
  iconId: MetasetIconId
  // Selected substats that participate in the normalized score sum (with optional weight overrides).
  // This avoids redundant storage of "selected variants" and "weights" as separate structures.
  entries: readonly { variant: StatVariant; weight?: number | undefined }[]
}

const DEFAULT_TESTER_NORMALIZED_PRESET_DEFINITIONS: readonly TesterNormalizedPresetDefinition[] = [
  // [1] SPD only
  { iconId: 'glyph.lightning', entries: [{ variant: StatVariant.SPD }] },
  // [2] SPD *1.05, ACC *1.0
  { iconId: 'glyph.target', entries: [{ variant: StatVariant.SPD, weight: 1.05 }, { variant: StatVariant.ACC }] },
  // [3] SPD *1.05, HP%/DEF%/RES *1.0
  { iconId: 'glyph.shield', entries: [{ variant: StatVariant.SPD, weight: 1.05 }, { variant: StatVariant.HP }, { variant: StatVariant.DEF }, { variant: StatVariant.RES }] },
  // [4] SPD *1.05, ACC *1.0, RES *0.95
  { iconId: 'glyph.compass', entries: [{ variant: StatVariant.SPD, weight: 1.05 }, { variant: StatVariant.ACC }, { variant: StatVariant.RES, weight: 0.95 }] },
  // [5] SPD *1.1, CR *1.0, CDMG *1.05
  { iconId: 'glyph.swords', entries: [{ variant: StatVariant.SPD, weight: 1.1 }, { variant: StatVariant.CR }, { variant: StatVariant.CDMG, weight: 1.05 }] },
  // [6] SPD *1.05, CR/CDMG *1.0, HP%/DEF%/ATK% *0.95, ACC/RES *0.9
  {
    iconId: 'glyph.hammer',
    entries: [
      { variant: StatVariant.SPD, weight: 1.05 },
      { variant: StatVariant.CR },
      { variant: StatVariant.CDMG },
      { variant: StatVariant.HP, weight: 0.95 },
      { variant: StatVariant.DEF, weight: 0.95 },
      { variant: StatVariant.ATK, weight: 0.95 },
      { variant: StatVariant.ACC, weight: 0.9 },
      { variant: StatVariant.RES, weight: 0.9 },
    ],
  },
  // [7] All substats except flat HP/ATK/DEF (neutral weights).
  {
    iconId: 'glyph.sun',
    entries: STAT_VARIANTS_PRIORITY
      .filter((variant) => ![StatVariant.HP_FLAT, StatVariant.ATK_FLAT, StatVariant.DEF_FLAT].includes(variant))
      .map((variant) => ({ variant })),
  },
  // [8] Flat HP/ATK/DEF only (neutral weights).
  { iconId: 'glyph.recycle', entries: [{ variant: StatVariant.HP_FLAT }, { variant: StatVariant.ATK_FLAT }, { variant: StatVariant.DEF_FLAT }] },
  // [9] Placeholder preset: all substats, neutral weights (until finalized by the project).
  { iconId: 'glyph.sparkles', entries: STAT_VARIANTS_PRIORITY.map((variant) => ({ variant })) },
] as const

export function defaultTesterNormalizedPreset(
  presetId: TesterNormalizedPresetId,
): { iconId: MetasetIconId; variants: StatVariant[]; weights: Partial<Record<StatVariant, number>> } {
  // Preset ids are array indexes by design; keep the fallback deterministic for corrupted persistence.
  const preset = DEFAULT_TESTER_NORMALIZED_PRESET_DEFINITIONS[presetId] ?? { iconId: 'none', entries: [] }
  const variants: StatVariant[] = []
  const weights: Partial<Record<StatVariant, number>> = {}
  preset.entries.forEach((entry) => {
    variants.push(entry.variant)
    if (typeof entry.weight === 'number' && Number.isFinite(entry.weight)) {
      weights[entry.variant] = entry.weight
    }
  })
  return { iconId: preset.iconId, variants, weights }
}

export function formatTesterNormalizedPresetButtonLabel(
  presetId: TesterNormalizedPresetId,
  iconId: MetasetIconId,
): string {
  // Display behavior:
  // - iconId 'none' (∅) means "use the natural numeric id" rather than a glyph.
  // - iconId 'empty' (full-width blank) means "show nothing" but keep the button.
  // - all other icon ids render their glyph.
  if (iconId === 'none') return String(presetId + 1)
  return metasetIconOptionById(iconId).glyph
}
