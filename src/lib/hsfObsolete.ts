import type { HsfRule, HsfSubstat } from './hsfTypes'

export type ObsoleteEntry = { index: number; coveredBy: number; reason: string }
export type ObsoleteReport = { obsolete: ObsoleteEntry[] }

function canonArray(a?: number[]): number[] | undefined {
  if (!a || a.length === 0) return undefined
  return [...a].sort((x, y) => x - y)
}

type SubKey = { id: number; isFlat: boolean; cond: '>=' | '<=' }

function normalizeSubstats(subs: HsfSubstat[] | undefined): Array<{ key: SubKey; value: number }> | null {
  if (!Array.isArray(subs)) return null
  const map = new Map<string, { key: SubKey; value: number }>()
  for (const s of subs) {
    if (!s || s.ID === -1) continue
    if (s.Condition !== '>=' && s.Condition !== '<=') return null // unsupported; bail out -> no domination on this rule
    const key: SubKey = { id: s.ID, isFlat: Boolean(s.IsFlat), cond: s.Condition }
    const k = `${key.id}:${key.isFlat ? 1 : 0}:${key.cond}`
    const v = Math.floor(Number(s.Value) || 0)
    const prev = map.get(k)
    if (!prev) map.set(k, { key, value: v })
    else {
      // If duplicates appear, keep the stricter requirement for the same (id,variant,cond)
      if (key.cond === '>=') map.set(k, { key, value: Math.max(prev.value, v) })
      else map.set(k, { key, value: Math.min(prev.value, v) })
    }
  }
  const arr = Array.from(map.values())
  // Stable sort by id, variant, cond
  arr.sort((a, b) => a.key.id - b.key.id || (a.key.isFlat === b.key.isFlat ? 0 : a.key.isFlat ? 1 : -1) || (a.key.cond === b.key.cond ? 0 : a.key.cond === '>=' ? -1 : 1))
  return arr
}

function coarseKey(r: HsfRule): string {
  const keep = r.Keep === true ? 1 : 0
  const use = r.Use === false ? 0 : 1
  const rank = r.Rank ?? -1
  const rarity = r.Rarity ?? -1
  const lvl = r.LVLForCheck ?? -1
  const fac = r.Faction ?? 0
  const mid = r.MainStatID ?? -1
  const mf = r.MainStatF ?? 1
  const sets = JSON.stringify(canonArray(r.ArtifactSet))
  const types = JSON.stringify(canonArray(r.ArtifactType))
  return `${keep}|${use}|${rank}|${rarity}|${lvl}|${fac}|${mid}:${mf}|${sets}|${types}`
}

function signatureOf(subs: Array<{ key: SubKey; value: number }>): string {
  // Signature without values: only the identity and operator must match
  const sig = subs.map(s => `${s.key.id}:${s.key.isFlat ? 1 : 0}:${s.key.cond}`).join(',')
  return sig
}

function dominates(a: Array<{ key: SubKey; value: number }>, b: Array<{ key: SubKey; value: number }>, preferAEarlierThanB: boolean): boolean {
  // Return true if a covers b (componentwise looser-or-equal for all), with tie-breaking for exact duplicates.
  if (a.length !== b.length) return false
  let anyStrict = false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!
    const y = b[i]!
    if (x.key.id !== y.key.id || x.key.isFlat !== y.key.isFlat || x.key.cond !== y.key.cond) return false
    if (x.key.cond === '>=') {
      if (x.value > y.value) return false
      if (x.value < y.value) anyStrict = true
    } else { // '<='
      if (x.value < y.value) return false
      if (x.value > y.value) anyStrict = true
    }
  }
  // If all equal (no strict), only allow dominance when we prefer A over B (e.g., A is earlier index)
  return anyStrict || preferAEarlierThanB
}

export function findObsoleteRules(rules: HsfRule[]): ObsoleteReport {
  const groups = new Map<string, number[]>()
  const normSubs: Array<Array<{ key: SubKey; value: number }> | null> = new Array(rules.length)
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!
    const ns = normalizeSubstats(rule.Substats)
    normSubs[i] = ns
    const key = ns ? `${coarseKey(rule)}|${signatureOf(ns)}` : `__NO_DOMINATION__|${i}`
    const arr = groups.get(key)
    if (arr) arr.push(i); else groups.set(key, [i])
  }

  const obsolete: ObsoleteEntry[] = []
  for (const idxs of groups.values()) {
    if (idxs.length <= 1) continue
    for (let aIdx = 0; aIdx < idxs.length; aIdx++) {
      const i = idxs[aIdx]!
      const A = normSubs[i]!
      if (!A) continue
      let coveredBy: number | null = null
      for (let bIdx = 0; bIdx < idxs.length; bIdx++) {
        if (aIdx === bIdx) continue
        const j = idxs[bIdx]!
        const B = normSubs[j]!
        if (!B) continue
        const preferB = j < i // prefer earlier index to win on exact duplicates
        if (dominates(B, A, preferB)) { coveredBy = j; break }
      }
      if (coveredBy !== null) obsolete.push({ index: i, coveredBy, reason: 'Covered at same level by looser/equal substat thresholds' })
    }
  }
  return { obsolete }
}
