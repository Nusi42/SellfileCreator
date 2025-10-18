import type { HistoryEntryDescriptor } from '../hooks/useHsfcHistory'
import type { MinimaTable, Star } from '../lib/hsfBuilder'
import { defaultMinima } from '../lib/hsfBuilder'
import { StatVariant, statVariantI18nKey } from '../lib/types'
import type { TranslateFn } from './builderUpdateDescriptor'

type MinimaDescriptorMode = 'edit' | 'reset' | 'import'
type MinimaStarKey = Exclude<keyof MinimaTable, 'anyRankDefaultsTo'>

type DescribeMinimaChangeParams = {
  previous: MinimaTable
  next: MinimaTable
  mode?: MinimaDescriptorMode
  t: TranslateFn
}

const DEFAULT_MINIMA = defaultMinima()

const MINIMA_VARIANTS: readonly StatVariant[] = [
  StatVariant.HP_FLAT,
  StatVariant.HP,
  StatVariant.ATK_FLAT,
  StatVariant.ATK,
  StatVariant.DEF_FLAT,
  StatVariant.DEF,
  StatVariant.SPD,
  StatVariant.RES,
  StatVariant.ACC,
  StatVariant.CR,
  StatVariant.CDMG,
]

const VARIANT_LABEL_KEYS: Record<number, ReturnType<typeof statVariantI18nKey>> = MINIMA_VARIANTS
  .reduce<Record<number, ReturnType<typeof statVariantI18nKey>>>((acc, variant) => {
    acc[variant] = statVariantI18nKey(variant)
    return acc
  }, {})

const STAR_ORDER: Array<{ key: MinimaStarKey; star: Star }> = [
  { key: 'six', star: 6 },
  { key: 'five', star: 5 },
  { key: 'four', star: 4 },
  { key: 'three', star: 3 },
  { key: 'two', star: 2 },
  { key: 'one', star: 1 },
]

const STAR_LABEL_KEYS: Record<Star, string> = {
  1: 'star1',
  2: 'star2',
  3: 'star3',
  4: 'star4',
  5: 'star5',
  6: 'star6',
}

const MAX_STAR_LINES = 4

export function areMinimaTablesEqual(a: MinimaTable, b: MinimaTable): boolean {
  if (normalizeFallback(a.anyRankDefaultsTo) !== normalizeFallback(b.anyRankDefaultsTo)) return false
  for (const { key } of STAR_ORDER) {
    if (!recordsEqual(a[key], b[key])) return false
  }
  return true
}

export function isDefaultMinimaTable(minima: MinimaTable): boolean {
  return areMinimaTablesEqual(minima, DEFAULT_MINIMA)
}

export function describeMinimaChange(params: DescribeMinimaChangeParams): HistoryEntryDescriptor | null {
  const { previous, next, mode: explicitMode, t } = params
  const fallbackChanged = normalizeFallback(previous.anyRankDefaultsTo) !== normalizeFallback(next.anyRankDefaultsTo)
  const starLines = summarizeStarChanges(previous, next, t)
  if (!fallbackChanged && starLines.length === 0) return null

  const mode: MinimaDescriptorMode = explicitMode
    ?? (isDefaultMinimaTable(next) && !isDefaultMinimaTable(previous) ? 'reset' : 'edit')

  const detailLines: string[] = []
  if (mode === 'reset') {
    detailLines.push(t('historyMinimaResetLine'))
  }
  if (fallbackChanged) {
    const fallbackLabel = t(STAR_LABEL_KEYS[normalizeFallback(next.anyRankDefaultsTo)])
    detailLines.push(t('historyMinimaFallbackLine', { star: fallbackLabel }))
  }
  if (starLines.length > 0) {
    const limited = limitStarLines(starLines, t)
    detailLines.push(...limited)
  }

  let titleKey: string
  if (mode === 'reset') {
    titleKey = 'historyMinimaResetTitle'
  } else if (mode === 'import') {
    titleKey = 'historyMinimaImportedTitle'
  } else if (fallbackChanged && starLines.length === 0) {
    titleKey = 'historyMinimaFallbackTitle'
  } else {
    titleKey = 'historyMinimaEditedTitle'
  }

  const descriptor: HistoryEntryDescriptor = detailLines.length > 0
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
  const detailLines = base.detailLines ? base.detailLines.slice() : []
  if (extra.detailLines && extra.detailLines.length > 0) {
    detailLines.push(...extra.detailLines)
  } else if (extra.title.trim()) {
    detailLines.push(extra.title)
  }
  return detailLines.length > 0 ? { title: base.title, detailLines } : { title: base.title }
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
  previous: MinimaTable,
  next: MinimaTable,
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
  const orderedKeys = MINIMA_VARIANTS.map(Number)
  for (const key of keys) {
    if (!orderedKeys.includes(key)) orderedKeys.push(key)
  }
  for (const key of orderedKeys) {
    const prevValue = normalizeValue(previous?.[key])
    const nextValue = normalizeValue(next?.[key])
    if (prevValue === nextValue) continue
    const label = formatVariantLabel(key, t)
    entries.push(t('historyMinimaDiffEntry', { stat: label, previous: prevValue, next: nextValue }))
  }
  if (entries.length === 0) return null
  const starLabel = t(STAR_LABEL_KEYS[star])
  return t('historyMinimaStarLine', { star: starLabel, diffs: entries.join(', ') })
}

function limitStarLines(lines: string[], t: TranslateFn): string[] {
  if (lines.length <= MAX_STAR_LINES) return lines
  const retained = lines.slice(0, MAX_STAR_LINES)
  const remaining = lines.length - MAX_STAR_LINES
  retained.push(t('historyMinimaMoreLine', { count: remaining }))
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
  MINIMA_VARIANTS.forEach((variant) => { keys.add(Number(variant)) })
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
