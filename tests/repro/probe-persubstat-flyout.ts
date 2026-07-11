/* eslint import/no-unused-modules: off */
/**
 * probe-persubstat-flyout — demonstrates the per-substat safeguard flyout bucket bug.
 *
 * For a Per-Substat safeguard (substatMatch=perSubstat with >1 substat), the substat
 * weights flyout's "restrict to bucket" focus key is built from slot/set/faction/main
 * ONLY — it has no substat dimension. So clicking a Banner row filters candidates to the
 * faction bucket but ignores WHICH substat the rule protects, even though the rule keeps
 * the best-N of EACH substat independently.
 *
 * This probe loads lategame.sfc + the account db, runs the production detection pipeline,
 * and dumps ordinal-49 ("Protect: Best % Banner", perSubstat over HP%/ATK%/DEF%, req=3,
 * per faction+slot) merged candidates plus their current (faction-only) focus keys, so the
 * collapse is visible before any fix.
 *
 * Usage:
 *   PROBE_DB=examples/um109288203_RSLHelper.db PROBE_ORDINAL=49 \
 *   npx tsx-equivalent (run via the repro harness) tests/repro/probe-persubstat-flyout.ts
 */
import { buildPipelineContext } from './gearInspectorProbe.js'
import {
  safeguardEffectiveCountModeForDisplay,
  safeguardFocusGroupKeyFor,
  type SafeguardDetectionEntry,
} from '../../src/lib/safeguards.js'
import { SafeguardSubstatMatch } from '../../src/lib/safeguards.js'
import { statVariantI18nKey } from '../../src/lib/types.js'

// Human substat label without pulling i18n runtime: fall back to the raw variant id.
function substatLabel(variant: number): string {
  const key = statVariantI18nKey(variant as never)
  return key ?? String(variant)
}

async function main(): Promise<void> {
  const dbPath = process.env.PROBE_DB ?? 'examples/um109288203_RSLHelper.db'
  const sfcPath = process.env.PROBE_SFC ?? 'presets/lategame.sfc'
  // 1-based UI ordinal; ordinal 49 == array[48].
  const ordinal = Number(process.env.PROBE_ORDINAL ?? '49')

  const ctx = await buildPipelineContext({ dbPath, sfcPath, enabledOverrideIds: [] })
  const rule = ctx.safeguardRules[ordinal - 1]
  if (!rule) throw new Error(`no safeguard rule at ordinal ${ordinal}`)
  console.log(`[rule] ordinal=${ordinal} name=${rule.appearance?.name ?? '(unnamed)'}`)
  console.log(`[rule] substatMatch=${rule.substatMatch} substats=[${(rule.substats ?? []).map(substatLabel).join(',')}] requiredCount=${rule.requiredCount}`)
  console.log(`[rule] countMode=${JSON.stringify(rule.countMode)}`)
  const isPerSubstat = rule.substatMatch === SafeguardSubstatMatch.PerSubstat && (rule.substats?.length ?? 0) > 1
  console.log(`[rule] isMultiPerSubstat=${isPerSubstat}`)

  const entry: SafeguardDetectionEntry | undefined =
    ctx.detection?.entries?.find((e) => e.ruleOrdinal === ordinal)
  if (!entry) throw new Error(`no detection entry for ordinal ${ordinal}`)
  const candidates = entry.candidates ?? []
  console.log(`[detection] candidates=${candidates.length} artifacts=${entry.artifacts.length}`)

  const effMode = safeguardEffectiveCountModeForDisplay(rule.combination, rule.countMode)
  console.log(`[effMode] ${JSON.stringify(effMode)}`)

  const artByKey = new Map(entry.artifacts.map((a) => [a.itemKey, a]))

  // Group merged candidates by the CURRENT (faction/slot/etc — substat-blind) focus key.
  const byFocusKey = new Map<string, number>()
  for (const c of candidates) {
    const art = artByKey.get(c.itemKey)
    if (!art) continue
    const key = safeguardFocusGroupKeyFor(art, effMode) ?? '(none)'
    byFocusKey.set(key, (byFocusKey.get(key) ?? 0) + 1)
  }
  console.log(`\n[current focus buckets] (substat-blind — the bug: no substat segment)`)
  for (const [key, n] of [...byFocusKey.entries()].sort()) {
    console.log(`  ${key}  ->  ${n} candidates`)
  }

  // NEW: verify per-substat sub-buckets are now populated and coherent.
  if (isPerSubstat) {
    const withBuckets = candidates.filter((c) => (c.substatBuckets?.length ?? 0) > 0).length
    console.log(`\n[per-substat sub-buckets] candidates carrying substatBuckets: ${withBuckets}/${candidates.length}`)
    // For each (faction × substat) sub-bucket, count RANK-protected items (bucketRank ≤ quota).
    // Chance-protected extras (bucketRank > quota, kept via the improvement-chance threshold) are
    // legitimate and counted separately — only the rank-protected count must respect the quota.
    // NB: group by the RULE's real countMode (perSlot included), not the display-suppressed effMode,
    // so items from different slots aren't wrongly pooled.
    const req = rule.requiredCount ?? 1
    const subRankProtected = new Map<string, number>()
    const subChanceProtected = new Map<string, number>()
    const subTotal = new Map<string, number>()
    for (const c of candidates) {
      const art = artByKey.get(c.itemKey)
      if (!art) continue
      for (const b of c.substatBuckets ?? []) {
        const key = `${safeguardFocusGroupKeyFor(art, rule.countMode, b.variant as never)}`
        subTotal.set(key, (subTotal.get(key) ?? 0) + 1)
        if (b.bucketRank > 0 && b.bucketRank <= req) subRankProtected.set(key, (subRankProtected.get(key) ?? 0) + 1)
        else if (b.isWithinQuota) subChanceProtected.set(key, (subChanceProtected.get(key) ?? 0) + 1)
      }
    }
    // A sub-bucket's rank-protected count may exceed `req` ONLY via tie-boundary extension (items
    // tied at the cutoff score are all kept — same semantics as the non-perSubstat top-N picker).
    // That is expected, not a bug; we just surface it. What WOULD be a bug is a sub-bucket keying
    // that pools unrelated items (e.g. hundreds "within quota"), which the old faction-only view did.
    let tieExtended = 0
    for (const [key, rankN] of [...subRankProtected.entries()].sort()) {
      const flag = rankN > req ? '  <-- tie-extended (legit)' : ''
      if (rankN > req) tieExtended++
      const chanceN = subChanceProtected.get(key) ?? 0
      console.log(`  ${key}  rank-protected=${rankN}/${req}  chance-protected=${chanceN}  total=${subTotal.get(key) ?? 0}${flag}`)
    }
    console.log(`\n[info] sub-buckets are per (slot × faction × substat); rank-protected≈${req} each`)
    console.log(`[info] sub-buckets tie-extended past quota: ${tieExtended} (legit — ties at the cutoff)`)
    // Show one faction's DEF% sub-bucket in detail to eyeball the ranking is by DEF%.
    const sampleVariant = (rule.substats ?? [])[0]
    if (sampleVariant != null) {
      const sampleKey = [...subTotal.keys()].find((k) => k.endsWith(`substat:${sampleVariant}`))
      if (sampleKey) {
        console.log(`\n[sub-bucket detail] ${sampleKey} (${substatLabel(sampleVariant)}) — what a focus click now shows:`)
        const rows = candidates
          .map((c) => {
            const art = artByKey.get(c.itemKey)
            const b = c.substatBuckets?.find((x) => art && `${safeguardFocusGroupKeyFor(art, rule.countMode, x.variant as never)}` === sampleKey)
            return b && art ? { c, art, b } : null
          })
          .filter((x): x is NonNullable<typeof x> => x != null)
          .sort((a, z) => a.b.bucketRank - z.b.bucketRank)
        for (const { c, art, b } of rows.slice(0, 12)) {
          const subs = art.substats.map((s) => `${substatLabel(Number(s.variant))}=${s.value}`).join(' ')
          console.log(`  sub#${b.bucketRank} key=${c.itemKey} [${subs}] within=${b.isWithinQuota}`)
        }
        if (rows.length > 12) console.log(`  ...(+${rows.length - 12} more)`)
      }
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
