/**
 * hsfDeduplicate.ts
 *
 * Development-only helpers for collapsing redundant HSF rules prior to export.
 * The dedupe pass preserves first-match semantics by operating on contiguous
 * keep blocks and never crossing `Keep === false` boundaries.
 */
import type { HsfSubstat } from './hsfTypes'
import type { HsfRuleWithCfg } from './merge'
import { StatId, subToVariant } from './types'

type NormalizedCondition = '>=' | '<=' | '='

type NormalizedSubstat = {
  variant: number
  condition: NormalizedCondition
  value: number
}

type NormalizedRule = {
  rule: HsfRuleWithCfg
  baseKey: string
  sets: number[] | null
  substats: NormalizedSubstat[]
  mainStatId: number
  mainStatF: number
  faction: number
  skip: false
}

type Survivor = NormalizedRule | { rule: HsfRuleWithCfg; skip: true }

const CONDITION_MAP: Record<string, NormalizedCondition | undefined> = {
  '>=': '>=',
  '<=': '<=',
  '=': '=',
  '==': '=',
}

function cloneRule(rule: HsfRuleWithCfg): HsfRuleWithCfg {
  const { ArtifactSet, ArtifactType, Substats, ...rest } = rule
  const cloned: HsfRuleWithCfg = {
    ...rest,
    ...(Array.isArray(ArtifactSet) ? { ArtifactSet: [...ArtifactSet] } : {}),
    ...(Array.isArray(ArtifactType) ? { ArtifactType: [...ArtifactType] } : {}),
    Substats: Array.isArray(Substats) ? Substats.map((sub) => (sub ? { ...sub } : sub)) : [],
  }
  return cloned
}

function normalizeArray(source: unknown): number[] {
  if (!Array.isArray(source)) return []
  const seen = new Set<number>()
  for (const entry of source) {
    const n = Number(entry)
    if (!Number.isFinite(n)) continue
    seen.add(n)
  }
  return Array.from(seen).sort((a, b) => a - b)
}

function normalizeSets(rule: HsfRuleWithCfg): number[] | null {
  const normalized = normalizeArray(rule.ArtifactSet)
  return normalized.length === 0 ? null : normalized
}

function normalizeTypes(rule: HsfRuleWithCfg): number[] {
  return normalizeArray(rule.ArtifactType)
}

function normalizeSubstats(subs: HsfSubstat[] | undefined): NormalizedSubstat[] | null {
  if (!Array.isArray(subs)) return []
  const result: NormalizedSubstat[] = []
  for (const raw of subs) {
    if (!raw || raw.NotAvailable) continue
    const statId = Number(raw.ID ?? StatId.Any)
    if (statId === StatId.Any) continue
    const cond = CONDITION_MAP[String(raw.Condition ?? '').trim()]
    if (!cond) return null
    const variant = subToVariant(statId, raw.IsFlat) as number
    const value = Number(raw.Value ?? 0)
    if (!Number.isFinite(value)) return null
    result.push({
      variant,
      condition: cond,
      value,
    })
  }
  result.sort((a, b) => {
    if (a.variant !== b.variant) return a.variant - b.variant
    if (a.condition !== b.condition) return a.condition < b.condition ? -1 : 1
    return a.value - b.value
  })
  return result
}

function normalizeKeepRule(rule: HsfRuleWithCfg): NormalizedRule | null {
  const mainStatId = Number(rule.MainStatID ?? StatId.Any)
  const mainStatF = Number(rule.MainStatF ?? 1)
  const faction = Number(rule.Faction ?? 0)
  const baseKey = [
    rule.Use === false ? '0' : '1',
    Number(rule.Rank ?? -1),
    Number(rule.Rarity ?? -1),
    Number(rule.LVLForCheck ?? -1),
    JSON.stringify(normalizeTypes(rule)),
  ].join('|')
  const sets = normalizeSets(rule)
  const substats = normalizeSubstats(rule.Substats)
  if (substats === null) return null
  return { rule, baseKey, sets, substats, mainStatId, mainStatF, faction, skip: false }
}

function setsEqual(a: number[] | null, b: number[] | null): boolean {
  if (a === b) return true
  if (a === null || b === null) return a === null && b === null
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function unionSets(a: number[] | null, b: number[] | null): number[] | null {
  if (a === null || b === null) return null
  const merged = new Set<number>([...a, ...b])
  return Array.from(merged).sort((x, y) => x - y)
}

function applySets(rule: HsfRuleWithCfg, sets: number[] | null): void {
  if (sets === null) {
    delete (rule as { ArtifactSet?: number[] }).ArtifactSet
    return
  }
  rule.ArtifactSet = sets.slice()
}

function substatsEqual(a: NormalizedSubstat[], b: NormalizedSubstat[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!
    const right = b[i]!
    if (left.variant !== right.variant) return false
    if (left.condition !== right.condition) return false
    if (left.value !== right.value) return false
  }
  return true
}

function substatsCover(looser: NormalizedSubstat[], stricter: NormalizedSubstat[]): boolean {
  for (const requirement of looser) {
    const counterpart = stricter.find((candidate) =>
      candidate.variant === requirement.variant &&
      candidate.condition === requirement.condition)
    if (!counterpart) return false
    if (requirement.condition === '>=') {
      if (requirement.value > counterpart.value) return false
    } else if (requirement.condition === '<=') {
      if (requirement.value < counterpart.value) return false
    } else {
      if (requirement.value !== counterpart.value) return false
    }
  }
  return true
}

function setsCover(looser: number[] | null, stricter: number[] | null): boolean {
  if (looser === null) return true
  if (stricter === null) return false
  const looseValues = new Set<number>(looser)
  for (const value of stricter) {
    if (!looseValues.has(value)) return false
  }
  return true
}

function covers(looser: NormalizedRule, stricter: NormalizedRule): boolean {
  if (looser.baseKey !== stricter.baseKey) return false
  if (!mainStatCovers(looser, stricter)) return false
  if (!factionCovers(looser, stricter)) return false
  if (!setsCover(looser.sets, stricter.sets)) return false
  return substatsCover(looser.substats, stricter.substats)
}

function mainStatEqualExact(a: NormalizedRule, b: NormalizedRule): boolean {
  return a.mainStatId === b.mainStatId && a.mainStatF === b.mainStatF
}

function mainStatCovers(looser: NormalizedRule, stricter: NormalizedRule): boolean {
  if (looser.mainStatId === StatId.Any) return true
  return looser.mainStatId === stricter.mainStatId && looser.mainStatF === stricter.mainStatF
}

function factionEqualExact(a: NormalizedRule, b: NormalizedRule): boolean {
  return a.faction === b.faction
}

function factionCovers(looser: NormalizedRule, stricter: NormalizedRule): boolean {
  if (looser.faction === 0) return true
  return looser.faction === stricter.faction
}

function dedupeKeepSegment(segment: HsfRuleWithCfg[]): HsfRuleWithCfg[] {
  const survivors: Survivor[] = []
  for (const original of segment) {
    if (original.Use === false) {
      survivors.push({ rule: cloneRule(original), skip: true })
      continue
    }
    const candidateRule = cloneRule(original)
    let normalized = normalizeKeepRule(candidateRule)
    if (!normalized) {
      survivors.push({ rule: candidateRule, skip: true })
      continue
    }
    let redundant = false
    for (let idx = 0; idx < survivors.length && !redundant; ) {
      const survivor = survivors[idx]!
      if (survivor.skip) {
        idx += 1
        continue
      }
      if (survivor.baseKey !== normalized.baseKey) {
        idx += 1
        continue
      }
      if (substatsEqual(survivor.substats, normalized.substats) && mainStatEqualExact(survivor, normalized) && factionEqualExact(survivor, normalized)) {
        const mergedSets = unionSets(survivor.sets, normalized.sets)
        if (!setsEqual(mergedSets, survivor.sets)) {
          survivor.sets = mergedSets
          applySets(survivor.rule, mergedSets)
        }
        redundant = true
        break
      }
      if (covers(survivor, normalized)) {
        redundant = true
        break
      }
      if (covers(normalized, survivor)) {
        const mergedSets = unionSets(normalized.sets, survivor.sets)
        survivors.splice(idx, 1)
        normalized = {
          ...normalized,
          sets: mergedSets,
          rule: (() => {
            applySets(candidateRule, mergedSets)
            return candidateRule
          })(),
        }
        continue
      }
      idx += 1
    }
    if (!redundant) {
      survivors.push(normalized)
    }
  }
  return survivors.map((entry) => entry.rule)
}

/**
 * Collapse redundant keep blocks while preserving intervening sell rules.
 * Returns cloned rules; the input array is never mutated.
 */
export function dedupeHsfRulesForExport(rules: HsfRuleWithCfg[]): HsfRuleWithCfg[] {
  if (rules.length <= 1) return rules.map(cloneRule)
  const output: HsfRuleWithCfg[] = []
  let keepSegment: HsfRuleWithCfg[] = []
  const flushKeepSegment = () => {
    if (!keepSegment.length) return
    output.push(...dedupeKeepSegment(keepSegment))
    keepSegment = []
  }
  for (const rule of rules) {
    if (rule?.Keep === true) {
      keepSegment.push(rule)
      continue
    }
    flushKeepSegment()
    output.push(cloneRule(rule))
  }
  flushKeepSegment()
  return output
}
