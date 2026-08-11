import type { HsfRule } from './hsfTypes'
import {
  ANOMALOUS_SUBSTAT_IDS,
  ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE,
  ANOMALOUS_SUBSTAT_VARIANTS,
} from './anomalousAccessories'
import { NBSP } from './constants'
import {
  anomalousSubstatTooltipI18nKey,
  compareHsfSubstats,
  statIsAny,
  StatId,
  StatVariant,
  STAT_VARIANTS_PRIORITY,
  statVariantI18nKey,
  subToVariant,
} from './types'
import { defaultSubstatTargets } from './hsfBuilder'

export type TranslateFn = (key: string) => string

type ThresholdKind = 'gte' | 'lte'

export type RuleSubstatDetail = {
  key: string
  variant: StatVariant
  statId: number
  negated: boolean
  threshold: ThresholdKind | null
  condition: string | undefined
  value: number | undefined
}

const COLORIZED_SUBSTAT_IDS = new Set<number>([
  StatId.HP,
  StatId.ATK,
  StatId.DEF,
  StatId.SPD,
  StatId.RES,
  StatId.ACC,
  StatId.CR,
  StatId.CDMG,
  // The accessory-only mode-scoped damage substats are
  // colorized like every real substat, their ids being as real as any other.
  ...ANOMALOUS_SUBSTAT_IDS,
])

export function substatSupportsColor(statId: number): boolean {
  return COLORIZED_SUBSTAT_IDS.has(statId)
}

// Shared hover copy for the mode-damage substats — the
// per-variant description plus the shared context note. Single composer so every
// surface (builder chips, filter chips, targets rows) shows identical copy;
// null for non-anomalous variants, which keep their surface's regular tooltip.
export function anomalousSubstatTooltipMarkdown(variant: number, t: TranslateFn): string | null {
  const key = anomalousSubstatTooltipI18nKey(variant)
  if (!key) return null
  return `${t(key)}\n\n${t('statAnomalousTooltipNote')}`
}

export function normalizeRuleSubstats(substats: HsfRule['Substats']): RuleSubstatDetail[] {
  const filtered = substats
    ?.filter(Boolean)
    ?.filter((sub) => !statIsAny(sub.ID) && !sub.NotAvailable)
    ?.sort(compareHsfSubstats)

  if (!filtered || filtered.length === 0) return []

  return filtered.map((sub, index) => {
    const variant = subToVariant(sub.ID, sub.IsFlat)
    const condition = sub.Condition ?? ''
    const negated = condition === '¬'
    const threshold: ThresholdKind | null =
      condition === '>=' ? 'gte' : condition === '<=' ? 'lte' : null
    return {
      key: `${sub.ID}:${sub.IsFlat ? 1 : 0}:${condition}:${sub.Value}:${index}`,
      variant,
      statId: sub.ID,
      negated,
      threshold,
      condition: !negated && condition ? condition : undefined,
      value: typeof sub.Value === 'number' ? sub.Value : undefined,
    }
  })
}

const MAX_DIGITS_BY_VARIANT: Record<number, number> = (() => {
  const substatTargets = defaultSubstatTargets()
  const buckets = [
    substatTargets.one,
    substatTargets.two,
    substatTargets.three,
    substatTargets.four,
    substatTargets.five,
    substatTargets.six,
  ]
  const variants = [
    ...STAT_VARIANTS_PRIORITY,
    StatVariant.RollCount,
  ]
  const result: Record<number, number> = {}
  for (const variant of variants) {
    if (variant === StatVariant.Any) continue
    let maxBase = 0
    for (const bucket of buckets) {
      const val = bucket[variant]
      if (typeof val === 'number' && val > maxBase) maxBase = val
    }
    if (variant === StatVariant.RollCount) {
      result[variant] = 1
      continue
    }
    const base = maxBase > 0 ? maxBase : 0
    const maxValue = base * 6
    const digits = maxValue > 0 ? String(Math.round(maxValue)).length : 1
    result[variant] = Math.max(digits, 1)
  }
  // Fractional values need decimal-aware widths ("6.25" is four characters).
  // JUDGED(anomalous per-roll step): probes six multiples of the observed rank-5
  // base, assuming each further line adds another 1.25 — unconfirmed, but it only
  // sizes a column, so an over- or under-estimate costs alignment, not correctness.
  for (const variant of ANOMALOUS_SUBSTAT_VARIANTS) {
    let digits = 1
    for (let lines = 1; lines <= 6; lines += 1) {
      const value = Math.round(lines * ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE * 100) / 100
      digits = Math.max(digits, String(value).length)
    }
    result[variant] = digits
  }
  return result
})()

export function maxDigitsForVariant(variant: StatVariant): number {
  return MAX_DIGITS_BY_VARIANT[variant] ?? 2
}

export function formatRuleSubstatSummary(
  substats: HsfRule['Substats'],
  t: TranslateFn,
  options?: { joinWith?: string; normalized?: readonly RuleSubstatDetail[] },
): string {
  const normalized = options?.normalized ?? normalizeRuleSubstats(substats)
  if (!normalized || normalized.length === 0) return ''

  const joinWith = options?.joinWith ?? ' ∧ '

  return normalized
    .map((detail) => {
      const label = t(statVariantI18nKey(detail.variant))
      const prefix = detail.negated ? '¬' : ''
      const parts: string[] = [`${prefix}${label}`]

      if (detail.threshold) {
        const symbol = detail.threshold === 'gte' ? '≥' : '≤'
        parts.push(symbol)
        if (detail.value !== undefined) parts.push(String(detail.value))
      } else if (detail.condition) {
        parts.push(detail.condition)
        if (detail.value !== undefined) parts.push(String(detail.value))
      }

      return parts.join(NBSP)
    })
    .join(joinWith)
}

export function formatRuleSubstatPlain(
  substats: HsfRule['Substats'],
  t: TranslateFn,
  options?: { joinWith?: string; normalized?: readonly RuleSubstatDetail[] },
): string {
  const normalized = options?.normalized ?? normalizeRuleSubstats(substats)
  if (!normalized || normalized.length === 0) return ''

  const joinWith = options?.joinWith ?? `${NBSP}·${NBSP}`

  return normalized
    .map((detail) => {
      const label = t(statVariantI18nKey(detail.variant))
      const prefix = detail.negated ? '¬' : ''
      const parts: string[] = [`${prefix}${label}`]

      if (detail.threshold) {
        const symbol = detail.threshold === 'gte' ? '≥' : '≤'
        parts.push(symbol)
        if (detail.value !== undefined) parts.push(String(detail.value))
      } else if (detail.condition) {
        parts.push(detail.condition)
        if (detail.value !== undefined) parts.push(String(detail.value))
      }

      return parts.join(NBSP)
    })
    .join(joinWith)
}
