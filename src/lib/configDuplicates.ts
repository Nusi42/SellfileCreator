import { resolveAutoRarityCode, type BuilderConfig } from './hsfBuilder'

// Cache duplicate snapshot keys per config identity so reordering or toggling
// selection does not rebuild the normalization payload repeatedly.
const SNAPSHOT_KEY_CACHE: WeakMap<BuilderConfig, string> = new WeakMap()

// Normalize configs to detect duplicates ignoring display-only fields such as name.
function normalizeBounds(source?: Record<number, { min?: number; max?: number; any?: boolean }>): Record<string, { min?: number; max?: number; any?: boolean }> {
  const result: Record<string, { min?: number; max?: number; any?: boolean }> = {}
  if (!source) return result
  const keys = Object.keys(source as Record<string, unknown>).map(String).sort((a, b) => Number(a) - Number(b))
  for (const key of keys) {
    const entry = (source as Record<string, { min?: number; max?: number; any?: boolean }>)[key]
    if (!entry) continue
    const normalized: { min?: number; max?: number; any?: boolean } = {}
    if (typeof entry.min === 'number') normalized.min = entry.min
    if (typeof entry.max === 'number') normalized.max = entry.max
    if (typeof entry.any === 'boolean') normalized.any = entry.any
    result[key] = normalized
  }
  return result
}

const sortNumbers = (values?: number[]) => (Array.isArray(values) ? [...values].map(Number).sort((a, b) => a - b) : [])
const sortStrings = (values?: string[]) => (Array.isArray(values) ? [...values].map(String).sort() : [])

type SnapshotKey = string

function snapshotKeyForConfig(cfg: BuilderConfig): SnapshotKey {
  const cached = SNAPSHOT_KEY_CACHE.get(cfg)
  if (cached) return cached

  const rarityMode = ((cfg as unknown as { rarityMode?: 'auto' | 'code' }).rarityMode ?? 'code')
  const effectiveRarity = rarityMode === 'auto'
    ? resolveAutoRarityCode(cfg)
    : Number((cfg as unknown as { rarityCode?: number }).rarityCode ?? 0)

  const snapshot = {
    keep: Boolean(cfg.keep),
    exportMode: cfg.exportMode,
    rankCode: Number(cfg.rankCode),
    rarityCode: Number(effectiveRarity),
    rarityMode,
    factionCode: Number((cfg as unknown as { factionCode?: number }).factionCode ?? 0),
    mainStatsV: sortNumbers((cfg as unknown as { mainStatsV?: number[] }).mainStatsV),
    minLevel: (cfg as unknown as { minLevel?: 0 | 4 | 8 | 12 | 16 }).minLevel ?? 0,
    maxLevel: (cfg as unknown as { maxLevel?: 0 | 4 | 8 | 12 | 16 }).maxLevel ?? 16,
    earlyKeepMode: ((cfg as unknown as { earlyKeepMode?: 'early' | 'late' }).earlyKeepMode ?? 'early'),
    rollBaseline: ((cfg as unknown as { rollBaseline?: 'afterStart' | 'upToLevel' }).rollBaseline ?? 'afterStart'),
    substatsV: sortNumbers((cfg as unknown as { substatsV?: number[] }).substatsV),
    fixedSubstatsV: sortNumbers((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV),
    minCount: Number(cfg.minCount ?? 0),
    autoMinCount: Boolean(cfg.autoMinCount),
    autoSubstatFlex: ((cfg as unknown as { autoSubstatFlex?: boolean }).autoSubstatFlex === true) && !(cfg.autoMinCount ?? false),
    minRequiredRolls: Number((cfg as unknown as { minRequiredRolls?: number }).minRequiredRolls ?? 0),
    autoMinRequiredRolls: Boolean((cfg as unknown as { autoMinRequiredRolls?: boolean }).autoMinRequiredRolls ?? true),
    substatRollBoundsV: normalizeBounds((cfg as unknown as { substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean }> }).substatRollBoundsV),
    artifactTypes: sortNumbers((cfg as unknown as { artifactTypes?: number[] }).artifactTypes),
    artifactSets: sortNumbers((cfg as unknown as { artifactSets?: number[] }).artifactSets),
    artifactMetaSets: sortStrings((cfg as unknown as { artifactMetaSets?: string[] }).artifactMetaSets),
    substatMinTarget: ((cfg as unknown as { substatMinTarget?: 'locked' | 'selected' }).substatMinTarget ?? 'selected'),
  }

  let key: SnapshotKey
  try {
    key = JSON.stringify(snapshot)
  } catch {
    key = `${Math.random()}`
  }

  SNAPSHOT_KEY_CACHE.set(cfg, key)
  return key
}

export function computeDuplicateIndices(configs: BuilderConfig[]): Array<number | null> {
  const seen = new Map<SnapshotKey, number>()
  const duplicates: Array<number | null> = []

  for (let index = 0; index < configs.length; index += 1) {
    const cfg = configs[index]!
    if (cfg.exportMode === 'separator') {
      duplicates.push(null)
      continue
    }
    const key = snapshotKeyForConfig(cfg)
    const firstSeen = seen.get(key)
    if (firstSeen === undefined) {
      seen.set(key, index)
      duplicates.push(null)
    } else {
      duplicates.push(firstSeen)
    }
  }

  return duplicates
}
