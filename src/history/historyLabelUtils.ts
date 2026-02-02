/**
 * historyLabelUtils.ts
 *
 * Snapshot and formatting helpers for history label strings.
 */
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { TranslateFn } from './historyI18n'

// ConfigLabelSnapshot keeps index + name stable without localization.
export type ConfigLabelSnapshot = {
  index: number
  name: string | null
}

// ConfigInsertionLocation describes where new configs landed in the list.
export type ConfigInsertionLocation =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'after'; anchor: ConfigLabelSnapshot }

// snapshotConfigLabel captures the index + name at creation time.
export const snapshotConfigLabel = (index: number, cfg: BuilderConfig): ConfigLabelSnapshot => {
  // Trim once so future edits do not rewrite stored labels.
  const rawName = (cfg.name ?? '').trim()
  // Persist the trimmed name or null when blank.
  const name = rawName.length > 0 ? rawName : null
  // Return the snapshot so formatting can be localized later.
  return { index, name }
}

// snapshotConfigLabels captures multiple labels from a config list.
export const snapshotConfigLabels = (
  configs: readonly BuilderConfig[],
  indices: readonly number[],
): ConfigLabelSnapshot[] => {
  // Normalize and capture only valid indices.
  const snapshots: ConfigLabelSnapshot[] = []
  for (const index of indices) {
    const cfg = configs[index]
    if (!cfg) continue
    snapshots.push(snapshotConfigLabel(index, cfg))
  }
  return snapshots
}

// formatConfigLabel mirrors the old buildConfigLabel but defers localization.
export const formatConfigLabel = (snapshot: ConfigLabelSnapshot, t: TranslateFn): string => {
  // Format the base label with the localized config number.
  const base = t('historyConfigLabel', { n: snapshot.index + 1 })
  // Append the quoted name when present to match prior output.
  return snapshot.name ? `${base} - "${snapshot.name}"` : base
}

// formatConfigLabelFromConfig snapshots then formats a config label in one step.
export const formatConfigLabelFromConfig = (
  index: number,
  cfg: BuilderConfig,
  t: TranslateFn,
): string => (
  // Reuse snapshot + format helpers so behavior stays centralized.
  formatConfigLabel(snapshotConfigLabel(index, cfg), t)
)

// buildInsertionLocation captures where an insert happened.
export const buildInsertionLocation = (
  index: number,
  previous: readonly BuilderConfig[],
): ConfigInsertionLocation | null => {
  // Treat an empty list as "at start" so history stays explicit.
  if (previous.length === 0) return { kind: 'start' }
  // Clamp to start when insert index is before the list.
  if (index <= 0) return { kind: 'start' }
  // Clamp to end when insert index is after the list.
  if (index >= previous.length) return { kind: 'end' }
  // Snapshot the anchor label so history stays stable.
  return { kind: 'after', anchor: snapshotConfigLabel(index - 1, previous[index - 1]!) }
}

// formatInsertionLocation localizes the insertion position.
export const formatInsertionLocation = (
  location: ConfigInsertionLocation | null,
  t: TranslateFn,
): string | null => {
  // Preserve nulls so callers can skip the line.
  if (!location) return null
  // Map the location kind onto localized strings.
  if (location.kind === 'start') return t('historyConfigsInsertedAtStartLine')
  // Map end inserts to the end label.
  if (location.kind === 'end') return t('historyConfigsInsertedAtEndLine')
  // Format the "after" anchor with the localized config label.
  return t('historyConfigsInsertedAfterLine', { label: formatConfigLabel(location.anchor, t) })
}
