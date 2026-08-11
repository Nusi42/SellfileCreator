// substatTargetDescriptors keeps substat history data-only until render.
import type { HistoryEntryDescriptor, ResolvedHistoryEntryDescriptor } from './historyDescriptorTypes'
import type { SubstatTargetTable, Star } from '../lib/hsfBuilder'
import { defaultSubstatTargets } from '../lib/hsfBuilder'
import { GLYPH_ARROW_RIGHT } from '../lib/constants'
// starRankValueI18nKey is the shared star-rank → catalog-key SSOT (no local map).
import { ANOMALOUS_SUBSTAT_VARIANTS, statVariantI18nKey, starRankValueI18nKey, STAT_VARIANTS_PRIORITY } from '../lib/types'
import type { TranslateFn } from './builderUpdateDescriptor'
import type { SubstatTargetsDescriptorMode } from './historyDescriptorTypes'
import { snapshotSubstatTargets } from './historySnapshotUtils'

type SubstatTargetStarKey = Exclude<keyof SubstatTargetTable, 'anyRankDefaultsTo'>

type DescribeSubstatTargetsChangeParams = {
  previous: SubstatTargetTable
  next: SubstatTargetTable
  mode?: SubstatTargetsDescriptorMode
  t: TranslateFn
}

const DEFAULT_SUBSTAT_TARGETS = defaultSubstatTargets()

// Classic substats plus the PROVISIONAL(anomalous) accessory-only ones — history
// lines must label every editable target row, not just the classic priority list.
const SUBSTAT_TARGET_VARIANTS = [...STAT_VARIANTS_PRIORITY, ...ANOMALOUS_SUBSTAT_VARIANTS]

const VARIANT_LABEL_KEYS: Record<number, ReturnType<typeof statVariantI18nKey>> = SUBSTAT_TARGET_VARIANTS
  .reduce<Record<number, ReturnType<typeof statVariantI18nKey>>>((acc, variant) => {
    acc[variant] = statVariantI18nKey(variant)
    return acc
  }, {})

const STAR_ORDER: Array<{ key: SubstatTargetStarKey; star: Star }> = [
  { key: 'six', star: 6 },
  { key: 'five', star: 5 },
  { key: 'four', star: 4 },
  { key: 'three', star: 3 },
  { key: 'two', star: 2 },
  { key: 'one', star: 1 },
]

const MAX_STAR_LINES = 4

// createSubstatTargetsChangeDescriptor snapshots substat target edits.
export const createSubstatTargetsChangeDescriptor = (params: {
  previous: SubstatTargetTable
  next: SubstatTargetTable
  mode?: SubstatTargetsDescriptorMode
}): HistoryEntryDescriptor | null => {
  const { previous, next, mode } = params
  if (areSubstatTargetTablesEqual(previous, next)) return null
  return {
    kind: 'substatTargetsChange',
    previous: snapshotSubstatTargets(previous),
    next: snapshotSubstatTargets(next),
    ...(mode ? { mode } : {}),
  }
}

export function areSubstatTargetTablesEqual(a: SubstatTargetTable, b: SubstatTargetTable): boolean {
  if (normalizeFallback(a.anyRankDefaultsTo) !== normalizeFallback(b.anyRankDefaultsTo)) return false
  for (const { key } of STAR_ORDER) {
    if (!recordsEqual(a[key], b[key])) return false
  }
  return true
}

export function isDefaultSubstatTargetTable(substatTargets: SubstatTargetTable): boolean {
  return areSubstatTargetTablesEqual(substatTargets, DEFAULT_SUBSTAT_TARGETS)
}

// describeSubstatTargetsChange localizes a substat targets change on demand.
export function describeSubstatTargetsChange(params: DescribeSubstatTargetsChangeParams): ResolvedHistoryEntryDescriptor | null {
  const { previous, next, mode: explicitMode, t } = params
  const fallbackChanged = normalizeFallback(previous.anyRankDefaultsTo) !== normalizeFallback(next.anyRankDefaultsTo)
  const starLines = summarizeStarChanges(previous, next, t)
  if (!fallbackChanged && starLines.length === 0) return null

  const mode: SubstatTargetsDescriptorMode = explicitMode
    ?? (isDefaultSubstatTargetTable(next) && !isDefaultSubstatTargetTable(previous) ? 'reset' : 'edit')

  const detailLines: string[] = []
  if (mode === 'reset') {
    detailLines.push(t('historySubstatTargetsResetLine'))
  }
  if (fallbackChanged) {
    const fallbackLabel = t(starRankValueI18nKey(normalizeFallback(next.anyRankDefaultsTo)))
    detailLines.push(t('historySubstatTargetsFallbackLine', { star: fallbackLabel }))
  }
  if (starLines.length > 0) {
    const limited = limitStarLines(starLines, t)
    detailLines.push(...limited)
  }

  let titleKey: string
  if (mode === 'reset') {
    titleKey = 'historySubstatTargetsResetTitle'
  } else if (mode === 'import') {
    titleKey = 'historySubstatTargetsImportedTitle'
  } else if (fallbackChanged && starLines.length === 0) {
    titleKey = 'historySubstatTargetsFallbackTitle'
  } else {
    titleKey = 'historySubstatTargetsEditedTitle'
  }

  const descriptor: ResolvedHistoryEntryDescriptor = detailLines.length > 0
    ? { title: t(titleKey), detailLines }
    : { title: t(titleKey) }

  return descriptor
}

export function appendDescriptorDetails(
  base: HistoryEntryDescriptor | null,
  extra: HistoryEntryDescriptor | null,
): HistoryEntryDescriptor | null {
  if (!extra) return base
  if (!base) return extra
  return { kind: 'compound', base, extra }
}

function normalizeFallback(star: Star | undefined): Star {
  const value = Number(star ?? 6)
  if (value >= 1 && value <= 6) return value as Star
  return 6
}

function recordsEqual(
  a: Record<number, number> | undefined,
  b: Record<number, number> | undefined,
): boolean {
  const keys = collectVariantKeys(a, b)
  for (const key of keys) {
    if (normalizeValue(a?.[key]) !== normalizeValue(b?.[key])) {
      return false
    }
  }
  return true
}

function summarizeStarChanges(
  previous: SubstatTargetTable,
  next: SubstatTargetTable,
  t: TranslateFn,
): string[] {
  const summaries: string[] = []
  for (const { key, star } of STAR_ORDER) {
    const prevRecord = previous[key]
    const nextRecord = next[key]
    if (recordsEqual(prevRecord, nextRecord)) continue
    const line = formatStarLine(star, prevRecord, nextRecord, t)
    if (line) summaries.push(line)
  }
  return summaries
}

function formatStarLine(
  star: Star,
  previous: Record<number, number> | undefined,
  next: Record<number, number> | undefined,
  t: TranslateFn,
): string | null {
  const entries: string[] = []
  const keys = collectVariantKeys(previous, next)
  const orderedKeys = SUBSTAT_TARGET_VARIANTS.map(Number)
  for (const key of keys) {
    if (!orderedKeys.includes(key)) orderedKeys.push(key)
  }
  for (const key of orderedKeys) {
    const prevValue = normalizeValue(previous?.[key])
    const nextValue = normalizeValue(next?.[key])
    if (prevValue === nextValue) continue
    const label = formatVariantLabel(key, t)
    // Use the shared arrow glyph so diff entries match other history surfaces.
    entries.push(t('historySubstatTargetsDiffEntry', { stat: label, previous: prevValue, next: nextValue, arrow: GLYPH_ARROW_RIGHT }))
  }
  if (entries.length === 0) return null
  const starLabel = t(starRankValueI18nKey(star))
  return t('historySubstatTargetsStarLine', { star: starLabel, diffs: entries.join(', ') })
}

function limitStarLines(lines: string[], t: TranslateFn): string[] {
  if (lines.length <= MAX_STAR_LINES) return lines
  const retained = lines.slice(0, MAX_STAR_LINES)
  const remaining = lines.length - MAX_STAR_LINES
  retained.push(t('historySubstatTargetsMoreLine', { count: remaining }))
  return retained
}

function collectVariantKeys(
  ...records: Array<Record<number, number> | undefined>
): number[] {
  const keys = new Set<number>()
  for (const record of records) {
    if (!record) continue
    for (const key of Object.keys(record)) {
      const num = Number(key)
      if (Number.isFinite(num)) keys.add(num)
    }
  }
  SUBSTAT_TARGET_VARIANTS.forEach((variant) => { keys.add(Number(variant)) })
  return Array.from(keys)
}

function normalizeValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length === 0) return 0
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function formatVariantLabel(variant: number, t: TranslateFn): string {
  const key = VARIANT_LABEL_KEYS[variant]
  if (key) return t(key)
  return String(variant)
}
