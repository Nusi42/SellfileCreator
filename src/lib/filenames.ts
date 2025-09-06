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

export function hsfrFilename(date?: Date): string {
  return `SellfileCreatorRules_${buildTimestamp(date)}.hsfr`
}

