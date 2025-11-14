import { buildCanonicalConfigSnapshot } from './configSnapshot'
import type { BuilderConfig } from './hsfBuilder'

// Cache duplicate snapshot keys per config identity so reordering or toggling
// selection does not rebuild the normalization payload repeatedly.
const SNAPSHOT_KEY_CACHE: WeakMap<BuilderConfig, string> = new WeakMap()

type SnapshotKey = string

function snapshotKeyForConfig(cfg: BuilderConfig): SnapshotKey {
  const cached = SNAPSHOT_KEY_CACHE.get(cfg)
  if (cached) return cached
  const snapshot = buildCanonicalConfigSnapshot(cfg)

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
