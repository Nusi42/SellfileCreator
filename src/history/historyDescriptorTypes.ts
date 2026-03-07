/**
 * historyDescriptorTypes.ts
 *
 * Data-only descriptor shapes for history entries.
 */
import type { BuilderRecipe } from '../lib/hsfBuilder'
import type { FinalSellRemainderConfig } from '../lib/logicHub'
import type { SafeguardRule } from '../lib/safeguards'
import type { Metaset } from '../lib/metasets'
import type { SubstatTargetTable } from '../lib/hsfBuilder'
import type { BuilderFieldKey } from '../lib/recipeMultiEditDraft'
import type { RecipeInsertionLocation, RecipeLabelSnapshot } from './historyLabelUtils'

// Descriptor modes mirror the old localized helper inputs.
export type NoteDescriptorMode = 'edit' | 'clear' | 'import' | 'restore'
// Final-sell modes drive title selection and detail lines.
export type FinalSellDescriptorMode = 'edit' | 'quickToggle' | 'reset' | 'import'
// Substat target modes control reset/import labeling.
export type SubstatTargetsDescriptorMode = 'edit' | 'reset' | 'import'
// Keep-uniques modes differentiate edit vs reset flows.
export type SafeguardsRulesDescriptorMode = 'edit' | 'reset'

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
  // builderRecipeUpdate captures before/after recipes plus metaset context.
  | {
      kind: 'builderRecipeUpdate'
      previous: BuilderRecipe
      next: BuilderRecipe
      index: number
      metasets: Metaset[]
    }
  // recipeAdded records a newly inserted recipe and its location.
  | {
      kind: 'recipeAdded'
      index: number
      recipe: BuilderRecipe
      location: RecipeInsertionLocation | null
      metasets: Metaset[]
    }
  // recipesDuplicated records duplicated recipe labels.
  | {
      kind: 'recipesDuplicated'
      labels: RecipeLabelSnapshot[]
      location: RecipeInsertionLocation | null
    }
  // recipesMoved records a move direction plus affected labels.
  | {
      kind: 'recipesMoved'
      direction: 'up' | 'down' | 'top' | 'bottom'
      labels: RecipeLabelSnapshot[]
    }
  // recipesDeleted stores deleted recipes and their snapshots.
  | {
      kind: 'recipesDeleted'
      removed: Array<{
        index: number
        recipe: BuilderRecipe
        label: RecipeLabelSnapshot
      }>
      metasets: Metaset[]
    }
  // recipesCleared stores the previous count for clear-all operations.
  | {
      kind: 'recipesCleared'
      previousCount: number
    }
  // recipesInserted records paste/import labels and location.
  | {
      kind: 'recipesInserted'
      mode: 'paste' | 'import'
      labels: RecipeLabelSnapshot[]
      location: RecipeInsertionLocation | null
    }
  // recipeOverridesApplied records enable/disable toggles for recipe overrides.
  | {
      kind: 'recipeOverridesApplied'
      labels: RecipeLabelSnapshot[]
      enableCount: number
      disableCount: number
    }
  // multiEditApplied records a multi-edit apply event and changed fields.
  | {
      kind: 'multiEditApplied'
      labels: RecipeLabelSnapshot[]
      fieldKeys: BuilderFieldKey[]
    }
  // builderDraft records draft previews for builder edits.
  | {
      kind: 'builderDraft'
      mode: 'multi' | 'recipe' | 'builder'
      labels?: RecipeLabelSnapshot[]
      label?: RecipeLabelSnapshot
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
  // finalSellChange stores before/after final-sell recipe.
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
  // sfrLoaded records file import metadata.
  | {
      kind: 'sfrLoaded'
      fileName?: string | null
    }
  // autosaveRestored records autosave metadata.
  | {
      kind: 'autosaveRestored'
      version?: string | null
      savedAt?: string | null
    }
  // recipesEnabledChange records whether recipes were toggled on or off.
  | {
      kind: 'recipesEnabledChange'
      previousEnabled: boolean
      nextEnabled: boolean
    }
  // safeguardsEnabledChange records the toggle plus rule count.
  | {
      kind: 'safeguardsEnabledChange'
      previousEnabled: boolean
      nextEnabled: boolean
      rules: SafeguardRule[]
    }
  // safeguardsRulesChange stores before/after rule sets.
  | {
      kind: 'safeguardsRulesChange'
      previous: SafeguardRule[]
      next: SafeguardRule[]
      metasets: Metaset[]
      mode?: SafeguardsRulesDescriptorMode
    }
