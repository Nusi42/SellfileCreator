/**
 * historyDescriptorResolver.ts
 *
 * Converts data-only history descriptors into localized strings.
 */
import type { TranslateFn } from './historyI18n'
import type { HistoryEntryDescriptor, ResolvedHistoryEntryDescriptor } from './historyDescriptorTypes'
import { describeBuilderRecipeUpdate } from './builderUpdateDescriptor'
import {
  describeRecipeAdded,
  describeRecipesDuplicated,
  describeRecipesMoved,
  describeRecipesDeleted,
  describeRecipesCleared,
  describeRecipesInserted,
  describeRecipeOverridesApplied,
  describeMultiEditApplied,
} from './recipeCollectionDescriptors'
import { describeFinalSellChange } from './finalSellDescriptors'
import { describeNoteChange } from './noteDescriptors'
import { describeSubstatTargetsChange } from './substatTargetDescriptors'
import {
  describeMetasetAdded,
  describeMetasetRenamed,
  describeMetasetVisibilityChanged,
  describeMetasetSetsChanged,
  describeMetasetIconChanged,
  describeMetasetDeleted,
  describeMetasetsReset,
  describeMetasetConflictResolved,
} from './metasetDescriptors'
import { describeSfrLoaded, describeAutosaveRestored } from './bulkLoadDescriptors'
import { describeSafeguardsEnabledChange, describeSafeguardsRulesChange } from './safeguardsDescriptors'
import { formatRecipeLabel } from './historyLabelUtils'
import type { RecipeLabelSnapshot } from './historyLabelUtils'

// HistoryDescriptorResolveContext keeps localization details together.
export type HistoryDescriptorResolveContext = {
  t: TranslateFn
  lang: string
}

// resolveHistoryEntryDescriptor localizes a descriptor for display.
export const resolveHistoryEntryDescriptor = (
  descriptor: HistoryEntryDescriptor | null | undefined,
  ctx: HistoryDescriptorResolveContext,
): ResolvedHistoryEntryDescriptor | null => {
  // Skip empty descriptors so callers can fall back gracefully.
  if (!descriptor) return null
  // Delegate each descriptor kind to the matching formatter.
  switch (descriptor.kind) {
    case 'compound': {
      // Resolve both entries, then merge into one output.
      const base = resolveHistoryEntryDescriptor(descriptor.base, ctx)
      const extra = resolveHistoryEntryDescriptor(descriptor.extra, ctx)
      return mergeResolvedDescriptors(base, extra)
    }
    case 'builderRecipeUpdate':
      // Builder updates reuse the diff renderer for localized output.
      return describeBuilderRecipeUpdate({
        previous: descriptor.previous,
        next: descriptor.next,
        index: descriptor.index,
        t: ctx.t,
        lang: ctx.lang,
        metasets: descriptor.metasets,
      })
    case 'recipeAdded':
      // Recipe additions include insertion location and snapshot lines.
      return describeRecipeAdded({
        index: descriptor.index,
        recipe: descriptor.recipe,
        location: descriptor.location,
        t: ctx.t,
        lang: ctx.lang,
        metasets: descriptor.metasets,
      })
    case 'recipesDuplicated':
      // Duplications summarize labels and optionally insertion location.
      return describeRecipesDuplicated({
        labels: descriptor.labels,
        location: descriptor.location,
        t: ctx.t,
      })
    case 'recipesMoved':
      // Moves translate direction + label list into a title.
      return describeRecipesMoved({
        direction: descriptor.direction,
        labels: descriptor.labels,
        t: ctx.t,
      })
    case 'recipesDeleted':
      // Deletions show labels and optional recipe snapshots.
      return describeRecipesDeleted({
        removed: descriptor.removed,
        t: ctx.t,
        lang: ctx.lang,
        metasets: descriptor.metasets,
      })
    case 'recipesCleared':
      // Clears are title-only when there was something to clear.
      return describeRecipesCleared({
        previousCount: descriptor.previousCount,
        t: ctx.t,
      })
    case 'recipesInserted':
      // Inserts map to paste/import titles with location detail lines.
      return describeRecipesInserted({
        mode: descriptor.mode,
        labels: descriptor.labels,
        location: descriptor.location,
        t: ctx.t,
      })
    case 'recipeOverridesApplied':
      // Recipe-override toggles show enabled/disabled counts and labels.
      return describeRecipeOverridesApplied({
        labels: descriptor.labels,
        enableCount: descriptor.enableCount,
        disableCount: descriptor.disableCount,
        t: ctx.t,
      })
    case 'multiEditApplied':
      // Multi-edit applies show changed fields and affected labels.
      return describeMultiEditApplied({
        labels: descriptor.labels,
        fieldKeys: descriptor.fieldKeys,
        t: ctx.t,
      })
    case 'builderDraft':
      // Draft entries are localized from recipe label snapshots.
      return resolveDraftDescriptor(descriptor, ctx)
    case 'metasetAdded':
      // Metaset adds capture name + set list context.
      return describeMetasetAdded({
        metaset: descriptor.metaset,
        t: ctx.t,
        lang: ctx.lang,
      })
    case 'metasetRenamed':
      // Metaset rename entries show previous/next names.
      return describeMetasetRenamed({
        previous: descriptor.previous,
        next: descriptor.next,
        t: ctx.t,
      })
    case 'metasetVisibilityChanged':
      // Visibility toggles show hidden vs shown state.
      return describeMetasetVisibilityChanged({
        previous: descriptor.previous,
        next: descriptor.next,
        t: ctx.t,
      })
    case 'metasetSetsChanged':
      // Set changes may include structured diff lines.
      return describeMetasetSetsChanged({
        previous: descriptor.previous,
        next: descriptor.next,
        t: ctx.t,
        lang: ctx.lang,
      })
    case 'metasetIconChanged':
      // Icon swaps are summarized with glyph labels.
      return describeMetasetIconChanged({
        previous: descriptor.previous,
        next: descriptor.next,
        t: ctx.t,
      })
    case 'metasetDeleted':
      // Deletions include replacement mode context.
      return describeMetasetDeleted({
        metaset: descriptor.metaset,
        mode: descriptor.mode,
        ...(descriptor.replacementName === undefined ? {} : { replacementName: descriptor.replacementName }),
        t: ctx.t,
        lang: ctx.lang,
      })
    case 'metasetsReset':
      // Resets are summarized with the selected reset mode.
      return describeMetasetsReset({
        mode: descriptor.mode,
        ...(descriptor.replacementName === undefined ? {} : { replacementName: descriptor.replacementName }),
        t: ctx.t,
      })
    case 'metasetConflictResolved':
      // Conflict resolution entries show strategy + counts.
      return describeMetasetConflictResolved({
        strategy: descriptor.strategy,
        conflictCount: descriptor.conflictCount,
        newIdCount: descriptor.newIdCount,
        t: ctx.t,
      })
    case 'metasetsEditedSummary':
      // Aggregated metaset edits flatten to a single entry.
      return resolveMetasetsEditedSummary(descriptor.entries, ctx)
    case 'substatTargetsChange':
      // Substat targets diff into a localized list of changes.
      return describeSubstatTargetsChange({
        previous: descriptor.previous,
        next: descriptor.next,
        ...(descriptor.mode === undefined ? {} : { mode: descriptor.mode }),
        t: ctx.t,
      })
    case 'finalSellChange':
      // Final-sell changes show diff lines for types/levels/mode.
      return describeFinalSellChange({
        previous: descriptor.previous,
        next: descriptor.next,
        ...(descriptor.mode === undefined ? {} : { mode: descriptor.mode }),
        t: ctx.t,
      })
    case 'noteChange':
      // Notes resolve to a title based on change mode.
      return describeNoteChange({
        previous: descriptor.previous,
        next: descriptor.next,
        mode: descriptor.mode,
        t: ctx.t,
      })
    case 'sfrLoaded':
      // SFR load entries show file name when present.
      return describeSfrLoaded({
        fileName: descriptor.fileName ?? null,
        t: ctx.t,
      })
    case 'autosaveRestored':
      // Autosave restores show timestamp or version suffix.
      return describeAutosaveRestored({
        version: descriptor.version ?? null,
        savedAt: descriptor.savedAt ?? null,
        t: ctx.t,
      })
    case 'recipesEnabledChange':
      return {
        title: descriptor.nextEnabled ? ctx.t('recipesToggleLabel') + ' Enabled' : ctx.t('recipesToggleLabel') + ' Disabled',
        detailLines: [],
      }
    case 'safeguardsEnabledChange':
      // Keep-unique toggles show the rule count context.
      return describeSafeguardsEnabledChange({
        previousEnabled: descriptor.previousEnabled,
        nextEnabled: descriptor.nextEnabled,
        rules: descriptor.rules,
        t: ctx.t,
      })
    case 'safeguardsRulesChange':
      // Keep-unique rule changes summarize adds/updates/removes.
      return describeSafeguardsRulesChange({
        previous: descriptor.previous,
        next: descriptor.next,
        metasets: descriptor.metasets,
        ...(descriptor.mode === undefined ? {} : { mode: descriptor.mode }),
        t: ctx.t,
      })
    default: {
      // Exhaustiveness guard for future descriptor kinds.
      const _never: never = descriptor
      void _never
      return null
    }
  }
}

// mergeResolvedDescriptors appends detail lines using legacy behavior.
const mergeResolvedDescriptors = (
  base: ResolvedHistoryEntryDescriptor | null,
  extra: ResolvedHistoryEntryDescriptor | null,
): ResolvedHistoryEntryDescriptor | null => {
  // Preserve whichever entry exists when the other is missing.
  if (!extra) return base
  // Keep the extra entry when the base is missing.
  if (!base) return extra
  // Start with the base detail lines when present.
  const detailLines = base.detailLines ? base.detailLines.slice() : []
  if (extra.detailLines && extra.detailLines.length > 0) {
    // Append all extra details when the extra entry is verbose.
    detailLines.push(...extra.detailLines)
  } else if (extra.title.trim()) {
    // Fallback to the extra title when no detail lines are present.
    detailLines.push(extra.title)
  }
  // Return the base title with merged details.
  return detailLines.length > 0 ? { title: base.title, detailLines } : { title: base.title }
}

// resolveDraftDescriptor formats draft history labels on demand.
const resolveDraftDescriptor = (
  descriptor: Extract<HistoryEntryDescriptor, { kind: 'builderDraft' }>,
  ctx: HistoryDescriptorResolveContext,
): ResolvedHistoryEntryDescriptor => {
  // Use the draft-specific title based on the mode.
  if (descriptor.mode === 'multi') {
    const labels = descriptor.labels ?? []
    const title = ctx.t('historyDraftMultiTitle', { count: labels.length })
    const detailLines = summarizeDraftLabels(labels, ctx)
    return detailLines.length > 0 ? { title, detailLines } : { title }
  }
  if (descriptor.mode === 'recipe' && descriptor.label) {
    const label = formatRecipeLabel(descriptor.label, ctx.t)
    return { title: ctx.t('historyDraftRecipeTitle', { label }) }
  }
  // Default to the builder draft title when no recipe is active.
  return { title: ctx.t('historyDraftBuilderTitle') }
}

// summarizeDraftLabels caps the list to keep tooltips compact.
const summarizeDraftLabels = (
  labels: RecipeLabelSnapshot[],
  ctx: HistoryDescriptorResolveContext,
): string[] => {
  // Keep the same cap as the history chip list.
  const MAX_LABELS = 4
  const formatted = labels.map((label) => formatRecipeLabel(label, ctx.t))
  if (formatted.length <= MAX_LABELS) return formatted
  const remaining = formatted.length - MAX_LABELS
  return [...formatted.slice(0, MAX_LABELS), ctx.t('historyRecipesMoreLine', { count: remaining })]
}

// resolveMetasetsEditedSummary flattens nested descriptors into a list.
const resolveMetasetsEditedSummary = (
  entries: HistoryEntryDescriptor[],
  ctx: HistoryDescriptorResolveContext,
): ResolvedHistoryEntryDescriptor | null => {
  // Resolve each entry and collect its output lines.
  const detailLines: string[] = []
  for (const entry of entries) {
    const resolved = resolveHistoryEntryDescriptor(entry, ctx)
    if (!resolved) continue
    if (resolved.detailLines && resolved.detailLines.length > 0) {
      detailLines.push(resolved.title)
      detailLines.push(...resolved.detailLines)
    } else if (resolved.title.trim()) {
      detailLines.push(resolved.title)
    }
  }
  // Skip the summary when nothing is left after filtering.
  if (detailLines.length === 0) return null
  // Emit the combined entry with a shared title.
  return {
    title: ctx.t('historyMetasetsEditedTitle'),
    detailLines,
  }
}
