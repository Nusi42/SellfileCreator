/**
 * historySnapshotUtils.ts
 *
 * Cloning helpers for history descriptor snapshots.
 */
import type { BuilderConfig, SubstatTargetTable } from '../lib/hsfBuilder'
import type { FinalSellRemainderConfig } from '../lib/finalSell'
import type { Metaset } from '../lib/metasets'
import type { KeepUniqueRule } from '../lib/keepUniques'
import { cloneBuilderConfig } from '../lib/multiEditDraft'
import { cloneMetasets } from '../lib/metasets'
import { cloneKeepUniqueRules } from '../lib/keepUniques'
import { cloneSubstatTargets } from '../lib/substatTargets'

// snapshotBuilderConfig detaches a builder config for history storage.
export const snapshotBuilderConfig = (cfg: BuilderConfig): BuilderConfig => (
  // Use the shared clone helper so nested arrays are copied.
  cloneBuilderConfig(cfg)
)

// snapshotBuilderConfigs clones a list of configs in one pass.
export const snapshotBuilderConfigs = (configs: readonly BuilderConfig[]): BuilderConfig[] => (
  // Reuse the per-config clone to keep behavior consistent.
  configs.map((cfg) => cloneBuilderConfig(cfg))
)

// snapshotMetasets clones metasets so name/icon changes do not rewrite history.
export const snapshotMetasets = (metasets: readonly Metaset[]): Metaset[] => (
  // Use the shared clone helper to detach the sets arrays.
  cloneMetasets(metasets)
)

// snapshotKeepUniqueRules clones keep-unique rules for stable history entries.
export const snapshotKeepUniqueRules = (rules: readonly KeepUniqueRule[]): KeepUniqueRule[] => (
  // Use the shared clone helper to detach nested arrays.
  cloneKeepUniqueRules(rules)
)

// snapshotSubstatTargets clones the target table to avoid shared references.
export const snapshotSubstatTargets = (targets: SubstatTargetTable): SubstatTargetTable => (
  // Use the shared helper so stars and fallback are copied.
  cloneSubstatTargets(targets)
)

// snapshotFinalSellRemainder clones the final-sell config for history storage.
export const snapshotFinalSellRemainder = (config: FinalSellRemainderConfig): FinalSellRemainderConfig => ({
  // Copy booleans directly since they are immutable.
  artifacts: config.artifacts,
  // Preserve accessory flag in the snapshot.
  accessories: config.accessories,
  // Clone the levels array to avoid shared references.
  levels: [...(config.levels ?? [])],
  // Preserve the sets mode since it is a scalar.
  setsMode: config.setsMode,
})
