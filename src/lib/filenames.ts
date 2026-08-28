/**
 * filenames.ts
 *
 * Centralized helpers for building export filenames with timestamps.
 */

function two(n: number): string { return String(n).padStart(2, '0') }

export function buildTimestamp(d: Date = new Date()): string {
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}_${two(d.getHours())}${two(d.getMinutes())}`
}

export function sellfileFilename(date?: Date): string {
  return `Sellfile_${buildTimestamp(date)}.hsf`
}

export function sfcFilename(date?: Date): string {
  return `SellfileCreatorRecipes_${buildTimestamp(date)}.sfc`
}

/**
 * Extension for the dynamic-override-set backup file. Plain JSON (not .sfc) because
 * it is a standalone settings backup, not a recipe payload — and staying JSON keeps
 * the file inspectable in any editor. SSOT for the filename below and the picker's
 * accept filter, so the two can never drift apart.
 */
export const DYNAMIC_OVERRIDES_PRESET_FILE_EXTENSION = '.json'

/** Backup file holding every saved dynamic-override set. */
export function dynamicOverridesPresetFilename(date?: Date): string {
  return `SellfileCreatorOverrideSets_${buildTimestamp(date)}${DYNAMIC_OVERRIDES_PRESET_FILE_EXTENSION}`
}
