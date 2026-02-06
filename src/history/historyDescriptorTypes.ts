/**
 * historyDescriptorTypes.ts
 *
 * Data-only descriptor shapes for history entries.
 */
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { FinalSellRemainderConfig } from '../lib/finalSell'
import type { KeepUniqueRule } from '../lib/keepUniques'
import type { KeepBestSubstatRule } from '../lib/keepBestSubstat'
import type { Metaset } from '../lib/metasets'
import type { SubstatTargetTable } from '../lib/hsfBuilder'
import type { BuilderFieldKey } from '../lib/multiEditDraft'
import type { ConfigInsertionLocation, ConfigLabelSnapshot } from './historyLabelUtils'

// Descriptor modes mirror the old localized helper inputs.
export type NoteDescriptorMode = 'edit' | 'clear' | 'import' | 'restore'
// Final-sell modes drive title selection and detail lines.
export type FinalSellDescriptorMode = 'edit' | 'quickToggle' | 'reset' | 'import'
// Substat target modes control reset/import labeling.
export type SubstatTargetsDescriptorMode = 'edit' | 'reset' | 'import'
// Keep-uniques modes differentiate edit vs reset flows.
export type KeepUniquesRulesDescriptorMode = 'edit' | 'reset'
// Keep-best-substat modes differentiate edit vs reset flows.
export type KeepBestSubstatRulesDescriptorMode = 'edit' | 'reset'

// Resolved history descriptor with localized strings.
export type ResolvedHistoryEntryDescriptor = {
  title: string
  detailLines?: string[]
}

// HistoryEntryDescriptor captures raw data for later localization.
export type HistoryEntryDescriptor =
  // compound merges multiple entries into one history record.
  | {
      kind: 'compound'
      base: HistoryEntryDescriptor
      extra: HistoryEntryDescriptor
    }
  // builderConfigUpdate captures before/after configs plus metaset context.
  | {
      kind: 'builderConfigUpdate'
      previous: BuilderConfig
      next: BuilderConfig
      index: number
      metasets: Metaset[]
    }
  // configAdded records a newly inserted config and its location.
  | {
      kind: 'configAdded'
      index: number
      cfg: BuilderConfig
      location: ConfigInsertionLocation | null
      metasets: Metaset[]
    }
  // configsDuplicated records duplicated config labels.
  | {
      kind: 'configsDuplicated'
      labels: ConfigLabelSnapshot[]
      location: ConfigInsertionLocation | null
    }
  // configsMoved records a move direction plus affected labels.
  | {
      kind: 'configsMoved'
      direction: 'up' | 'down' | 'top' | 'bottom'
      labels: ConfigLabelSnapshot[]
    }
  // configsDeleted stores deleted configs and their snapshots.
  | {
      kind: 'configsDeleted'
      removed: Array<{
        index: number
        cfg: BuilderConfig
        label: ConfigLabelSnapshot
      }>
      metasets: Metaset[]
    }
  // configsCleared stores the previous count for clear-all operations.
  | {
      kind: 'configsCleared'
      previousCount: number
    }
  // configsInserted records paste/import labels and location.
  | {
      kind: 'configsInserted'
      mode: 'paste' | 'import'
      labels: ConfigLabelSnapshot[]
      location: ConfigInsertionLocation | null
    }
  // configOptionsApplied records enable/disable toggles for config options.
  | {
      kind: 'configOptionsApplied'
      labels: ConfigLabelSnapshot[]
      enableCount: number
      disableCount: number
    }
  // multiEditApplied records a multi-edit apply event and changed fields.
  | {
      kind: 'multiEditApplied'
      labels: ConfigLabelSnapshot[]
      fieldKeys: BuilderFieldKey[]
    }
  // builderDraft records draft previews for builder edits.
  | {
      kind: 'builderDraft'
      mode: 'multi' | 'config' | 'builder'
      labels?: ConfigLabelSnapshot[]
      label?: ConfigLabelSnapshot
    }
  // metasetAdded records a new metaset.
  | {
      kind: 'metasetAdded'
      metaset: Metaset
    }
  // metasetRenamed records a name change.
  | {
      kind: 'metasetRenamed'
      previous: Metaset
      next: Metaset
    }
  // metasetVisibilityChanged records show/hide toggles.
  | {
      kind: 'metasetVisibilityChanged'
      previous: Metaset
      next: Metaset
    }
  // metasetSetsChanged records set list changes.
  | {
      kind: 'metasetSetsChanged'
      previous: Metaset
      next: Metaset
    }
  // metasetIconChanged records icon swaps.
  | {
      kind: 'metasetIconChanged'
      previous: Metaset
      next: Metaset
    }
  // metasetDeleted records a delete action and any replacement context.
  | {
      kind: 'metasetDeleted'
      metaset: Metaset
      mode: 'delete' | 'replaceSets' | 'replaceMeta'
      replacementName?: string | null
    }
  // metasetsReset records a reset action and replacement context.
  | {
      kind: 'metasetsReset'
      mode: 'delete' | 'replaceSets' | 'replaceMeta'
      replacementName?: string | null
    }
  // metasetConflictResolved records conflict resolution metadata.
  | {
      kind: 'metasetConflictResolved'
      strategy: 'keepCurrent' | 'useIncoming' | 'keepBoth'
      conflictCount: number
      newIdCount: number
    }
  // metasetsEditedSummary groups multiple metaset edits into one entry.
  | {
      kind: 'metasetsEditedSummary'
      entries: HistoryEntryDescriptor[]
    }
  // substatTargetsChange stores before/after target tables.
  | {
      kind: 'substatTargetsChange'
      previous: SubstatTargetTable
      next: SubstatTargetTable
      mode?: SubstatTargetsDescriptorMode
    }
  // finalSellChange stores before/after final-sell config.
  | {
      kind: 'finalSellChange'
      previous: FinalSellRemainderConfig
      next: FinalSellRemainderConfig
      mode?: FinalSellDescriptorMode
    }
  // noteChange records note edits.
  | {
      kind: 'noteChange'
      previous: string | null
      next: string | null
      mode: NoteDescriptorMode
    }
  // hsfcLoaded records file import metadata.
  | {
      kind: 'hsfcLoaded'
      fileName?: string | null
    }
  // autosaveRestored records autosave metadata.
  | {
      kind: 'autosaveRestored'
      version?: string | null
      savedAt?: string | null
    }
  // keepUniquesEnabledChange records the toggle plus rule count.
  | {
      kind: 'keepUniquesEnabledChange'
      previousEnabled: boolean
      nextEnabled: boolean
      rules: KeepUniqueRule[]
    }
  // keepUniquesRulesChange stores before/after rule sets.
  | {
      kind: 'keepUniquesRulesChange'
      previous: KeepUniqueRule[]
      next: KeepUniqueRule[]
      metasets: Metaset[]
      mode?: KeepUniquesRulesDescriptorMode
    }
  // keepBestSubstatEnabledChange records the toggle plus rule count.
  | {
      kind: 'keepBestSubstatEnabledChange'
      previousEnabled: boolean
      nextEnabled: boolean
      rules: KeepBestSubstatRule[]
    }
  // keepBestSubstatRulesChange stores before/after rule sets.
  | {
      kind: 'keepBestSubstatRulesChange'
      previous: KeepBestSubstatRule[]
      next: KeepBestSubstatRule[]
      mode?: KeepBestSubstatRulesDescriptorMode
    }
