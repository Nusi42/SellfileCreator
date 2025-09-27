/**
 * configSignature.ts
 *
 * Provides a canonical signature for BuilderConfig objects that only
 * incorporates fields affecting HSF rule generation. Display-only data (like
 * `name`) is intentionally excluded so callers can detect "real" changes and
 * keep expensive recomputations cached when only labels change.
 */
import type { BuilderConfig } from './hsfBuilder'
import { resolveAutoRarityCode } from './hsfBuilder'

function sortNumeric(values?: readonly number[] | number[]): number[] {
  if (!Array.isArray(values) || values.length === 0) return []
  return values.map(Number).filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
}

function sortString(values?: readonly string[] | string[]): string[] {
  if (!Array.isArray(values) || values.length === 0) return []
  return values.map(String).sort()
}

type SubstatBounds = NonNullable<BuilderConfig['substatRollBoundsV']>

type NormalizedBoundsEntry = { key: number; min?: number; max?: number; any?: boolean }

function normalizeBounds(bounds?: SubstatBounds): NormalizedBoundsEntry[] {
  if (!bounds) return []
  const keys = Object.keys(bounds as Record<string, SubstatBounds[keyof SubstatBounds]>)
    .map((k) => Number(k))
    .filter((k) => Number.isFinite(k))
    .sort((a, b) => a - b)
  const normalized: NormalizedBoundsEntry[] = []
  for (const key of keys) {
    const entry = bounds[key as keyof SubstatBounds] ?? (bounds as Record<string, SubstatBounds[keyof SubstatBounds]>)[String(key)]
    if (!entry) continue
    const next: NormalizedBoundsEntry = { key }
    if (typeof entry.min === 'number') next.min = entry.min
    if (typeof entry.max === 'number') next.max = entry.max
    if (typeof entry.any === 'boolean') next.any = entry.any
    normalized.push(next)
  }
  return normalized
}

/**
 * Generate a stable JSON signature for config fields that influence rule
 * generation. Two configs differing only by display metadata (e.g., `name`)
 * will produce identical signatures.
 */
export function configRuleSignature(cfg: BuilderConfig): string {
  const rarityMode = (cfg.rarityMode ?? 'code') as NonNullable<BuilderConfig['rarityMode']>
  const effectiveRarity = rarityMode === 'auto'
    ? resolveAutoRarityCode(cfg)
    : Number((cfg as { rarityCode?: number }).rarityCode ?? 0)
  const snapshot = {
    keep: Boolean(cfg.keep),
    enabled: (cfg.enabled !== false),
    minLevel: (cfg.minLevel ?? 0) as 0 | 4 | 8 | 12 | 16,
    maxLevel: (cfg.maxLevel ?? 16) as 0 | 4 | 8 | 12 | 16,
    rankCode: Number(cfg.rankCode ?? 0),
    rarityMode,
    rarityCode: Number(effectiveRarity ?? 0),
    autoRaritySupplementsThreshold: (cfg as { autoRaritySupplementsThreshold?: 'uncommon' | 'rare' | 'epic' }).autoRaritySupplementsThreshold ?? null,
    factionCode: Number((cfg as { factionCode?: number }).factionCode ?? 0),
    mainStatsV: sortNumeric((cfg as { mainStatsV?: number[] }).mainStatsV),
    rollBaseline: (cfg.rollBaseline ?? 'afterStart') as NonNullable<BuilderConfig['rollBaseline']>,
    rollMode: (cfg.rollMode ?? 'auto') as NonNullable<BuilderConfig['rollMode']>,
    substatsV: sortNumeric((cfg as { substatsV?: number[] }).substatsV),
    fixedSubstatsV: sortNumeric((cfg as { fixedSubstatsV?: number[] }).fixedSubstatsV),
    substatRollBoundsV: normalizeBounds((cfg as { substatRollBoundsV?: SubstatBounds }).substatRollBoundsV),
    minCount: Number(cfg.minCount ?? 0) as 0 | 1 | 2 | 3 | 4,
    autoMinCount: Boolean(cfg.autoMinCount),
    autoSubstatFlex: (cfg.autoSubstatFlex === true) && !(cfg.autoMinCount ?? false),
    minRequiredRolls: Number((cfg as { minRequiredRolls?: number }).minRequiredRolls ?? 0) as 0 | 1 | 2 | 3 | 4 | 5,
    autoMinRequiredRolls: Boolean((cfg as { autoMinRequiredRolls?: boolean }).autoMinRequiredRolls ?? true),
    substatMinTarget: (cfg.substatMinTarget ?? 'selected') as NonNullable<BuilderConfig['substatMinTarget']>,
    artifactTypes: sortNumeric((cfg as { artifactTypes?: number[] }).artifactTypes),
    artifactSets: sortNumeric((cfg as { artifactSets?: number[] }).artifactSets),
    artifactMetaSets: sortString((cfg as { artifactMetaSets?: string[] }).artifactMetaSets),
    earlyKeepMode: (cfg.earlyKeepMode ?? 'early') as NonNullable<BuilderConfig['earlyKeepMode']>,
  }
  try {
    return JSON.stringify(snapshot)
  } catch {
    return ''
  }
}
