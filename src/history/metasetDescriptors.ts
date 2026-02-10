// metasetDescriptors keeps metaset history data-only until render.
import type { ResolvedHistoryEntryDescriptor } from './historyDescriptorTypes'
import type { Metaset } from '../lib/metasets'
import { GLYPH_ARROW_RIGHT, NBSP } from '../lib/constants'
import { DEFAULT_METASET_ICON_ID, metasetIconOptionById, normalizeMetasetIconId, type MetasetIconId } from '../lib/metasetIcons'
import type { ArtifactSetId } from '../lib/types'
import { getLocalizedGearSetName } from '../lib/types'
import type { TranslateFn } from './builderUpdateDescriptor'

const MAX_SET_LABELS = 6

function sanitizeName(name: string, t: TranslateFn): string {
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : t('historyValueEmpty')
}

function formatQuotedName(name: string, t: TranslateFn): string {
  const trimmed = name.trim()
  return trimmed.length > 0 ? `"${trimmed}"` : t('historyValueEmpty')
}

function isVisible(meta: Metaset): boolean {
  return meta.show !== false
}

function formatVisibility(value: boolean, t: TranslateFn): string {
  return value ? t('historyMetasetVisibilityVisible') : t('historyMetasetVisibilityHidden')
}

function normalizeSets(values: readonly ArtifactSetId[]): number[] {
  const deduped = new Set<number>()
  for (const id of values) deduped.add(Number(id))
  return Array.from(deduped).sort((a, b) => a - b)
}

function haveSameSets(a: readonly ArtifactSetId[], b: readonly ArtifactSetId[]): boolean {
  const normA = normalizeSets(a)
  const normB = normalizeSets(b)
  if (normA.length !== normB.length) return false
  for (let i = 0; i < normA.length; i += 1) {
    if (normA[i] !== normB[i]) return false
  }
  return true
}

function formatSetsList(ids: readonly ArtifactSetId[], t: TranslateFn, lang: string): string {
  if (!ids.length) return t('historyValueEmpty')
  const labels: string[] = []
  for (const id of ids) {
    const label = getLocalizedGearSetName(id, t, lang)
    if (!labels.includes(label)) labels.push(label)
  }
  if (labels.length <= MAX_SET_LABELS) return labels.join(', ')
  const slice = labels.slice(0, MAX_SET_LABELS)
  slice.push(t('historyConfigsMoreLine', { count: labels.length - MAX_SET_LABELS }))
  return slice.join(', ')
}

function formatIconValue(iconId: MetasetIconId, t: TranslateFn): string {
  const normalized = normalizeMetasetIconId(iconId)
  if (normalized === 'none') return t('historyMetasetIconNoneLabel')
  if (normalized === 'empty') return t('historyMetasetIconEmptyLabel')
  return metasetIconOptionById(normalized).glyph
}

// describeMetasetAdded localizes metaset additions at render time.
export function describeMetasetAdded(params: { metaset: Metaset; t: TranslateFn; lang: string }): ResolvedHistoryEntryDescriptor {
  const { metaset, t, lang } = params
  const title = t('historyMetasetAddedTitle', { name: sanitizeName(metaset.name, t) })
  const detailLines: string[] = []
  if (metaset.sets.length > 0) {
    detailLines.push(t('historyMetasetSetsSummaryLine', { sets: formatSetsList(normalizeSets(metaset.sets), t, lang) }))
  }
  return detailLines.length > 0 ? { title, detailLines } : { title }
}

// describeMetasetRenamed localizes name changes at render time.
export function describeMetasetRenamed(params: { previous: Metaset; next: Metaset; t: TranslateFn }): ResolvedHistoryEntryDescriptor | null {
  const { previous, next, t } = params
  if (previous.name === next.name) return null
  // Use the shared arrow glyph so rename titles stay consistent.
  const title = t('historyMetasetRenamedTitle', {
    previous: formatQuotedName(previous.name, t),
    next: formatQuotedName(next.name, t),
    arrow: GLYPH_ARROW_RIGHT,
  })
  return { title }
}

// describeMetasetVisibilityChanged localizes visibility toggles.
export function describeMetasetVisibilityChanged(params: { previous: Metaset; next: Metaset; t: TranslateFn }): ResolvedHistoryEntryDescriptor | null {
  const { previous, next, t } = params
  const prevVisible = isVisible(previous)
  const nextVisible = isVisible(next)
  if (prevVisible === nextVisible) return null
  const titleKey = nextVisible ? 'historyMetasetVisibilityShownTitle' : 'historyMetasetVisibilityHiddenTitle'
  const title = t(titleKey, { name: sanitizeName(next.name, t) })
  const detailLines = [
    t('historyDiffLine', {
      label: t('historyMetasetVisibilityLabel'),
      previous: formatVisibility(prevVisible, t),
      next: formatVisibility(nextVisible, t),
    }),
  ]
  return { title, detailLines }
}

// describeMetasetSetsChanged localizes set list updates.
export function describeMetasetSetsChanged(params: { previous: Metaset; next: Metaset; t: TranslateFn; lang: string }): ResolvedHistoryEntryDescriptor | null {
  const { previous, next, t, lang } = params
  if (haveSameSets(previous.sets, next.sets)) return null
  const prevSets = normalizeSets(previous.sets)
  const nextSets = normalizeSets(next.sets)
  const prevIcon = normalizeMetasetIconId(previous.iconId ?? DEFAULT_METASET_ICON_ID)
  const nextIcon = normalizeMetasetIconId(next.iconId ?? DEFAULT_METASET_ICON_ID)
  const iconChanged = prevIcon !== nextIcon
  const baseTitle = t('historyMetasetSetsUpdatedTitle', { name: sanitizeName(next.name, t) })
  // Reuse the shared arrow glyph so icon diffs match other history lines.
  const title = iconChanged
    ? `${baseTitle} (${formatIconValue(prevIcon, t)}${NBSP}${GLYPH_ARROW_RIGHT}${NBSP}${formatIconValue(nextIcon, t)})`
    : baseTitle
  const detailLines: string[] = []
  detailLines.push(JSON.stringify({
    kind: 'setListDiff',
    label: t('historyMetasetSetsLabel'),
    previous: prevSets,
    next: nextSets,
    previousText: formatSetsList(prevSets as ArtifactSetId[], t, lang),
    nextText: formatSetsList(nextSets as ArtifactSetId[], t, lang),
  }))
  return { title, detailLines }
}

// describeMetasetIconChanged localizes icon changes.
export function describeMetasetIconChanged(params: { previous: Metaset; next: Metaset; t: TranslateFn }): ResolvedHistoryEntryDescriptor | null {
  const { previous, next, t } = params
  const prevIcon = normalizeMetasetIconId(previous.iconId ?? DEFAULT_METASET_ICON_ID)
  const nextIcon = normalizeMetasetIconId(next.iconId ?? DEFAULT_METASET_ICON_ID)
  if (prevIcon === nextIcon) return null
  const baseTitle = t('historyMetasetIconChangedTitle', { name: sanitizeName(next.name, t) })
  // Reuse the shared arrow glyph so icon diffs match other history lines.
  const title = `${baseTitle} (${formatIconValue(prevIcon, t)}${NBSP}${GLYPH_ARROW_RIGHT}${NBSP}${formatIconValue(nextIcon, t)})`
  return { title }
}

// describeMetasetDeleted localizes metaset deletions.
export function describeMetasetDeleted(params: {
  metaset: Metaset
  mode: 'delete' | 'replaceSets' | 'replaceMeta'
  replacementName?: string | null
  t: TranslateFn
  lang: string
}): ResolvedHistoryEntryDescriptor {
  const { metaset, mode, replacementName, t, lang } = params
  const title = t('historyMetasetDeletedTitle', { name: sanitizeName(metaset.name, t) })
  const detailLines: string[] = []
  if (mode === 'replaceSets') {
    detailLines.push(t('historyMetasetDeletedReplacedWithSetsLine'))
  } else if (mode === 'replaceMeta') {
    detailLines.push(t('historyMetasetDeletedReplacedWithMetasetLine', { name: sanitizeName(replacementName ?? '', t) }))
  } else {
    detailLines.push(t('historyMetasetDeletedReferencesClearedLine'))
  }
  if (metaset.sets.length > 0) {
    detailLines.push(t('historyMetasetSetsSummaryLine', { sets: formatSetsList(normalizeSets(metaset.sets), t, lang) }))
  }
  return detailLines.length > 0 ? { title, detailLines } : { title }
}

// describeMetasetsReset localizes metaset reset actions.
export function describeMetasetsReset(params: {
  mode: 'delete' | 'replaceSets' | 'replaceMeta'
  replacementName?: string | null
  t: TranslateFn
}): ResolvedHistoryEntryDescriptor {
  const { mode, replacementName, t } = params
  const title = t('historyMetasetsResetTitle')
  const detailLines: string[] = []
  if (mode === 'replaceSets') {
    detailLines.push(t('historyMetasetsResetModeReplaceSetsLine'))
  } else if (mode === 'replaceMeta') {
    detailLines.push(t('historyMetasetsResetModeReplaceMetaLine', { name: sanitizeName(replacementName ?? '', t) }))
  } else {
    detailLines.push(t('historyMetasetsResetModeRemoveLine'))
  }
  return detailLines.length > 0 ? { title, detailLines } : { title }
}

// describeMetasetConflictResolved localizes conflict resolutions.
export function describeMetasetConflictResolved(params: {
  strategy: 'keepCurrent' | 'useIncoming' | 'keepBoth'
  conflictCount: number
  newIdCount: number
  t: TranslateFn
}): ResolvedHistoryEntryDescriptor {
  const { strategy, conflictCount, newIdCount, t } = params
  const title = t('historyMetasetConflictResolvedTitle')
  const strategyLabel = (() => {
    if (strategy === 'useIncoming') return t('historyMetasetConflictStrategyUseIncoming')
    if (strategy === 'keepBoth') return t('historyMetasetConflictStrategyKeepBoth')
    return t('historyMetasetConflictStrategyKeepCurrent')
  })()
  const detailLines: string[] = [
    t('historyMetasetConflictStrategyLine', { strategy: strategyLabel }),
    t('historyMetasetConflictCountLine', { count: conflictCount }),
  ]
  if (newIdCount > 0) {
    detailLines.push(t('historyMetasetConflictNewIdsLine', { count: newIdCount }))
  }
  return { title, detailLines }
}
