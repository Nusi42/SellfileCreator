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
 * Extension for the dynamic-override-set backup file. A compound suffix, matching the
 * app's other JSON-shaped imports (`.gearsets.json`, `.l10n.json`): the `.json` tail
 * keeps the file inspectable in any editor, while the `.overrides` stem is what lets
 * the file router recognize it on name alone — a bare `.json` would be indistinguishable
 * from every other JSON drop and would need the file read before it could be routed.
 * SSOT for the filename below, the picker's accept filter, and the router's branch.
 */
export const DYNAMIC_OVERRIDES_PRESET_FILE_EXTENSION = '.overrides.json'

/**
 * Extensionless variant accepted on import only. Mirrors the `.gearsets` / `.l10n`
 * fallbacks, so a file whose `.json` tail was stripped by a mail client or download
 * manager still routes correctly. Never used for export.
 */
export const DYNAMIC_OVERRIDES_PRESET_FILE_EXTENSION_BARE = '.overrides'

/** Backup file holding every saved dynamic-override set. */
export function dynamicOverridesPresetFilename(date?: Date): string {
  return `SellfileCreatorOverrideSets_${buildTimestamp(date)}${DYNAMIC_OVERRIDES_PRESET_FILE_EXTENSION}`
}
