// recipeCollectionDescriptors keeps recipe list history localized at render time.
import type { HistoryEntryDescriptor, ResolvedHistoryEntryDescriptor } from './historyDescriptorTypes'
import type { BuilderRecipe } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { BuilderFieldKey } from '../lib/recipeMultiEditDraft'
import { makeBuilderRecipeSnapshotLines } from './builderUpdateDescriptor'
import type { TranslateFn } from './historyI18n'
import type { RecipeInsertionLocation, RecipeLabelSnapshot } from './historyLabelUtils'
import {
  buildInsertionLocation,
  formatRecipeLabel,
  formatRecipeLabelFromRecipe,
  formatInsertionLocation,
  snapshotRecipeLabel,
} from './historyLabelUtils'
import { snapshotBuilderRecipe, snapshotMetasets } from './historySnapshotUtils'

// Cap label lists so history tooltips stay compact.
const MAX_DETAIL_LABELS = 4

// DescribeRecipeAddedParams drive localized history output.
type DescribeRecipeAddedParams = {
  index: number
  recipe: BuilderRecipe
  location: RecipeInsertionLocation | null
  t: TranslateFn
  lang: string
  metasets: Metaset[]
}

// DescribeRecipesDuplicatedParams carries localized duplication details.
type DescribeRecipesDuplicatedParams = {
  labels: RecipeLabelSnapshot[]
  location: RecipeInsertionLocation | null
  t: TranslateFn
}

// DescribeRecipesMovedParams carries localized move details.
type DescribeRecipesMovedParams = {
  direction: 'up' | 'down' | 'top' | 'bottom'
  labels: RecipeLabelSnapshot[]
  t: TranslateFn
}

// DescribeRecipesDeletedParams handles deletions plus recipe snapshots.
type DescribeRecipesDeletedParams = {
  removed: Array<{ index: number; recipe: BuilderRecipe | undefined; label: RecipeLabelSnapshot }>
  t: TranslateFn
  lang: string
  metasets: Metaset[]
}

// DescribeRecipesClearedParams covers clear-all entries.
type DescribeRecipesClearedParams = {
  previousCount: number
  t: TranslateFn
}

// DescribeRecipesInsertedParams covers paste/import entries.
type DescribeRecipesInsertedParams = {
  mode: 'paste' | 'import'
  labels: RecipeLabelSnapshot[]
  location: RecipeInsertionLocation | null
  t: TranslateFn
}

// DescribeRecipeOverridesAppliedParams details recipe-override toggles.
type DescribeRecipeOverridesAppliedParams = {
  labels: RecipeLabelSnapshot[]
  enableCount: number
  disableCount: number
  t: TranslateFn
}

// DescribeMultiEditAppliedParams details multi-edit operations.
type DescribeMultiEditAppliedParams = {
  labels: RecipeLabelSnapshot[]
  fieldKeys: BuilderFieldKey[]
  t: TranslateFn
}

// createRecipeAddedDescriptor snapshots a newly inserted recipe for history.
export const createRecipeAddedDescriptor = (params: {
  index: number
  recipe: BuilderRecipe
  previous: BuilderRecipe[]
  metasets: Metaset[]
}): HistoryEntryDescriptor => {
  const { index, recipe, previous, metasets } = params
  return {
    kind: 'recipeAdded',
    index,
    recipe: snapshotBuilderRecipe(recipe),
    location: buildInsertionLocation(index, previous),
    metasets: snapshotMetasets(metasets),
  }
}

// createRecipesDuplicatedDescriptor snapshots duplicated labels for history.
export const createRecipesDuplicatedDescriptor = (params: {
  labels: RecipeLabelSnapshot[]
  location: RecipeInsertionLocation | null
}): HistoryEntryDescriptor | null => {
  const { labels, location } = params
  if (labels.length === 0) return null
  return {
    kind: 'recipesDuplicated',
    labels,
    location,
  }
}

// createRecipesMovedDescriptor snapshots a move action for history.
export const createRecipesMovedDescriptor = (params: {
  direction: DescribeRecipesMovedParams['direction']
  labels: RecipeLabelSnapshot[]
}): HistoryEntryDescriptor | null => {
  const { direction, labels } = params
  if (labels.length === 0) return null
  return {
    kind: 'recipesMoved',
    direction,
    labels,
  }
}

// createRecipesDeletedDescriptor snapshots deleted recipes for history.
export const createRecipesDeletedDescriptor = (params: {
  removed: Array<{ index: number; recipe: BuilderRecipe | undefined }>
  metasets: Metaset[]
}): HistoryEntryDescriptor | null => {
  const { removed, metasets } = params
  if (removed.length === 0) return null
  const snapshotRemoved = removed
    .filter((entry) => Boolean(entry.recipe))
    .map((entry) => ({
      index: entry.index,
      recipe: snapshotBuilderRecipe(entry.recipe!),
      label: snapshotRecipeLabel(entry.index, entry.recipe!),
    }))
  if (snapshotRemoved.length === 0) return null
  return {
    kind: 'recipesDeleted',
    removed: snapshotRemoved,
    metasets: snapshotMetasets(metasets),
  }
}

// createRecipesClearedDescriptor captures the clear-all action.
export const createRecipesClearedDescriptor = (previousCount: number): HistoryEntryDescriptor => ({
  kind: 'recipesCleared',
  previousCount,
})

// createRecipesInsertedDescriptor snapshots pasted/imported recipes.
export const createRecipesInsertedDescriptor = (params: {
  mode: 'paste' | 'import'
  labels: RecipeLabelSnapshot[]
  location: RecipeInsertionLocation | null
}): HistoryEntryDescriptor | null => {
  const { mode, labels, location } = params
  if (labels.length === 0) return null
  return {
    kind: 'recipesInserted',
    mode,
    labels,
    location,
  }
}

// createRecipeOverridesAppliedDescriptor snapshots recipe-override tags.
export const createRecipeOverridesAppliedDescriptor = (params: {
  labels: RecipeLabelSnapshot[]
  enableCount: number
  disableCount: number
}): HistoryEntryDescriptor | null => {
  const { labels, enableCount, disableCount } = params
  if (labels.length === 0) return null
  return {
    kind: 'recipeOverridesApplied',
    labels,
    enableCount,
    disableCount,
  }
}

// createMultiEditAppliedDescriptor snapshots a multi-edit apply event.
export const createMultiEditAppliedDescriptor = (params: {
  labels: RecipeLabelSnapshot[]
  fieldKeys: BuilderFieldKey[]
}): HistoryEntryDescriptor | null => {
  const { labels, fieldKeys } = params
  if (labels.length === 0) return null
  return {
    kind: 'multiEditApplied',
    labels,
    fieldKeys,
  }
}

// describeRecipeAdded localizes a recipe add descriptor at render time.
export function describeRecipeAdded(params: DescribeRecipeAddedParams): ResolvedHistoryEntryDescriptor {
  const { index, recipe, location, t, lang, metasets } = params
  const label = formatRecipeLabelFromRecipe(index, recipe, t)
  const locationLine = formatInsertionLocation(location, t)
  const detailLines = locationLine ? [locationLine] : []
  // Treat added recipes as a single-state snapshot so tooltips show the actual values
  // that landed in the builder rather than a fabricated before/after diff.
  const snapshotLines = makeBuilderRecipeSnapshotLines({ recipe, metasets, t, lang })
  if (snapshotLines.length > 0) {
    detailLines.push(...snapshotLines)
  }
  const descriptor: ResolvedHistoryEntryDescriptor = detailLines.length > 0
    ? { title: t('historyRecipeAddedTitle', { label }), detailLines }
    : { title: t('historyRecipeAddedTitle', { label }) }
  return descriptor
}

// describeRecipesDuplicated localizes recipe duplication entries.
export function describeRecipesDuplicated(params: DescribeRecipesDuplicatedParams): ResolvedHistoryEntryDescriptor | null {
  const { labels, location, t } = params
  if (labels.length === 0) return null
  const detailLines = mergeDetailLines(location, labels, t)
  if (labels.length === 1) {
    const label = formatRecipeLabel(labels[0]!, t)
    return detailLines.length > 0
      ? { title: t('historyRecipeDuplicatedTitle', { label }), detailLines }
      : { title: t('historyRecipeDuplicatedTitle', { label }) }
  }
  return detailLines.length > 0
    ? { title: t('historyRecipesDuplicatedMultipleTitle', { count: labels.length }), detailLines }
    : { title: t('historyRecipesDuplicatedMultipleTitle', { count: labels.length }) }
}

// describeRecipesMoved localizes move entries for recipe reordering.
export function describeRecipesMoved(params: DescribeRecipesMovedParams): ResolvedHistoryEntryDescriptor | null {
  const { direction, labels, t } = params
  if (labels.length === 0) return null
  const detailLines = summarizeLabels(labels, t)
  const singleKey = SINGLE_MOVE_KEYS[direction]
  const multiKey = MULTI_MOVE_KEYS[direction]
  const title = labels.length === 1
    ? t(singleKey, { label: formatRecipeLabel(labels[0]!, t) })
    : t(multiKey, { count: labels.length })
  return detailLines.length > 0 ? { title, detailLines } : { title }
}

// describeRecipesDeleted localizes delete entries plus recipe snapshots.
export function describeRecipesDeleted(params: DescribeRecipesDeletedParams): ResolvedHistoryEntryDescriptor | null {
  const { removed, t, lang, metasets } = params
  if (!removed.length) return null
  const labels = removed
    .map((entry) => entry.label)
    .filter(Boolean)
  const detailLines = summarizeLabels(labels, t)
  if (labels.length === 0) return null
  if (labels.length === 1) {
    const recipe = removed.find((entry) => Boolean(entry.recipe))?.recipe ?? null
    // Likewise, deleted recipes show their last-known state instead of a diff against defaults.
    const snapshotLines = recipe ? makeBuilderRecipeSnapshotLines({ recipe, metasets, t, lang }) : []
    if (snapshotLines.length > 0) {
      return { title: t('historyRecipeDeletedTitle', { label: formatRecipeLabel(labels[0]!, t) }), detailLines: snapshotLines }
    }
    return { title: t('historyRecipeDeletedTitle', { label: formatRecipeLabel(labels[0]!, t) }) }
  }
  return detailLines.length > 0
    ? { title: t('historyRecipesDeletedMultipleTitle', { count: labels.length }), detailLines }
    : { title: t('historyRecipesDeletedMultipleTitle', { count: labels.length }) }
}

// describeRecipesCleared localizes the clear-all history entry.
export function describeRecipesCleared(params: DescribeRecipesClearedParams): ResolvedHistoryEntryDescriptor | null {
  const { previousCount, t } = params
  if (previousCount === 0) return null
  return { title: t('historyRecipesClearedTitle') }
}

// describeRecipesInserted localizes paste/import history entries.
export function describeRecipesInserted(params: DescribeRecipesInsertedParams): ResolvedHistoryEntryDescriptor | null {
  const { mode, labels, location, t } = params
  if (labels.length === 0) return null
  const detailLines = mergeDetailLines(location, labels, t)
  if (labels.length === 1) {
    const key = mode === 'import' ? 'historyRecipeImportedTitle' : 'historyRecipePastedTitle'
    const title = t(key, { label: formatRecipeLabel(labels[0]!, t) })
    return detailLines.length > 0 ? { title, detailLines } : { title }
  }
  const key = mode === 'import' ? 'historyRecipesImportedMultipleTitle' : 'historyRecipesPastedMultipleTitle'
  const title = t(key, { count: labels.length })
  return detailLines.length > 0 ? { title, detailLines } : { title }
}

// describeRecipeOverridesApplied localizes tag enable/disable entries.
export function describeRecipeOverridesApplied(params: DescribeRecipeOverridesAppliedParams): ResolvedHistoryEntryDescriptor | null {
  const { labels, enableCount, disableCount, t } = params
  // Skip empty changes to avoid noisy history entries.
  if (labels.length === 0) return null
  // Summarize recipe labels to keep history concise.
  const detailLines = summarizeLabels(labels, t)
  // Prefix with a summary of enabled/disabled counts.
  detailLines.unshift(t('historyRecipeOverridesAppliedSummaryLine', { enabled: enableCount, disabled: disableCount }))
  return detailLines.length > 0
    ? { title: t('historyRecipeOverridesAppliedTitle'), detailLines }
    : { title: t('historyRecipeOverridesAppliedTitle') }
}

// describeMultiEditApplied localizes multi-edit entries for history.
export function describeMultiEditApplied(params: DescribeMultiEditAppliedParams): ResolvedHistoryEntryDescriptor | null {
  const { labels, fieldKeys, t } = params
  if (labels.length === 0) return null
  const summaryLabels = summarizeLabels(labels, t)
  const fieldLabels = deriveFieldLabels(fieldKeys, t)
  const title = t('historyMultiEditAppliedTitle', { count: labels.length })
  const detailLines: string[] = []
  if (fieldLabels.length > 0) {
    detailLines.push(t('historyMultiEditFieldsLine', { fields: fieldLabels.join(', ') }))
  }
  detailLines.push(...summaryLabels)
  return detailLines.length > 0 ? { title, detailLines } : { title }
}

const SINGLE_MOVE_KEYS: Record<DescribeRecipesMovedParams['direction'], string> = {
  up: 'historyRecipeMovedUpTitle',
  down: 'historyRecipeMovedDownTitle',
  top: 'historyRecipeMovedTopTitle',
  bottom: 'historyRecipeMovedBottomTitle',
}

const MULTI_MOVE_KEYS: Record<DescribeRecipesMovedParams['direction'], string> = {
  up: 'historyRecipesMovedUpTitle',
  down: 'historyRecipesMovedDownTitle',
  top: 'historyRecipesMovedTopTitle',
  bottom: 'historyRecipesMovedBottomTitle',
}

function summarizeLabels(labels: RecipeLabelSnapshot[], t: TranslateFn): string[] {
  const formatted = labels.map((label) => formatRecipeLabel(label, t))
  if (formatted.length <= MAX_DETAIL_LABELS) return formatted.slice()
  const slice = formatted.slice(0, MAX_DETAIL_LABELS)
  const remaining = formatted.length - MAX_DETAIL_LABELS
  slice.push(t('historyRecipesMoreLine', { count: remaining }))
  return slice
}

function mergeDetailLines(location: RecipeInsertionLocation | null, labels: RecipeLabelSnapshot[], t: TranslateFn): string[] {
  const summarized = summarizeLabels(labels, t)
  const locationLine = formatInsertionLocation(location, t)
  if (locationLine) return [locationLine, ...summarized]
  return summarized
}

const FIELD_LABEL_KEY_BY_BUILDER_KEY: Partial<Record<BuilderFieldKey, string>> = {
  name: 'builderRecipeName',
  keep: 'builderAction',
  exportMode: 'historyBuilderExportModeLabel',
  rankCode: 'builderRank',
  rarityCode: 'filterRarity',
  rarityMode: 'filterRarity',
  autoRaritySupplementsThreshold: 'filterRarity',
  factionCode: 'builderFaction',
  mainStatsV: 'builderMain',
  minLevel: 'historyBuilderLevelsLabel',
  maxLevel: 'historyBuilderLevelsLabel',
  earlyKeepMode: 'builderMilestoneThresholds',
  substatsV: 'builderSubstats',
  fixedSubstatsV: 'builderSubstats',
  substatRollBoundsV: 'builderSubstats',
  minCount: 'builderRequiredSubstats',
  autoMinCount: 'builderRequiredSubstats',
  autoSubstatFlex: 'builderRequiredSubstats',
  minRequiredRolls: 'builderMinRequiredRolls',
  autoMinRequiredRolls: 'builderMinRequiredRolls',
  lockedMinRequiredRolls: 'builderMinRequiredRolls',
  artifactTypes: 'builderSlots',
  artifactSets: 'setsTitle',
  artifactMetaSets: 'menuMetasetsSection',
}

function deriveFieldLabels(
  fieldKeys: BuilderFieldKey[],
  t: TranslateFn,
): string[] {
  const labels: string[] = []
  const seen = new Set<string>()
  for (const key of fieldKeys) {
    const labelKey = FIELD_LABEL_KEY_BY_BUILDER_KEY[key]
    if (!labelKey) continue
    const label = t(labelKey)
    if (seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }
  labels.sort((a, b) => a.localeCompare(b))
  return labels
}
