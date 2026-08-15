#!/usr/bin/env node
/**
 * sim-improvement-chance.ts
 *
 * Simulate safeguard improvement chance for a specific item at a modified
 * level/substat value, using the real SFC + DB pipeline.
 *
 * Usage: node sim-improvement-chance.js --sfc presets/lategame.sfc --db examples/um109288203_RSLHelper.db
 */
import { cp, mkdir, readFile } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'
import { parseSfcObject } from '../../src/lib/sfcIO.js'
import { defaultSubstatTargets } from '../../src/lib/hsfBuilder.js'
import {
  resolveSafeguardRulesWithMetasets,
  collectAndComputeSafeguardProtection,
  getSafeguardItemKey,
  getSafeguardCountKey,
  storeArtifactRows,
  toWasmArtifactStoreRow,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import { importGearDatabaseFromArrayBuffer } from '../../src/lib/importers/gearDbImporter.js'
import type { NormalizedGearArtifact, NormalizedStat } from '../../src/lib/importers/gearDbNormalizer.js'
import type { Metaset } from '../../src/lib/metasets.js'
import { buildSafeguardImprovementChanceByArtifactId } from '../../src/lib/safeguardImprovementChance.js'
import { warmupWasmRuleEngine } from '../../src/lib/wasm/wasmRuleEngine.js'
import { StatVariant } from '../../src/lib/types.js'
import { normalizeSubstatByMax6 } from '../../src/lib/substatRollNormalization.js'
import type { GearInspectorPreviewRow } from '../../src/types/gearInspectorPreview.js'

const TARGET_ARTIFACT_ID = 70081
const MODIFIED_CDMG_PERCENT = 12   // percent
const MODIFIED_LEVEL = 12
const MODIFIED_CDMG_ROLLS = 1      // extra rolls on CDMG at level 12

const installNodeFileFetch = async (): Promise<void> => {
  const originalFetch = globalThis.fetch
  if (typeof originalFetch !== 'function') return
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string'
      ? input
      : (input instanceof URL ? input.href : input.url)
    if (url.startsWith('file://')) {
      const { readFile } = await import('node:fs/promises')
      const bytes = await readFile(new URL(url))
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: { 'content-type': 'application/wasm' },
      })
    }
    return originalFetch(input, init)
  }) as typeof fetch
}

const syncCompiledWasmBindings = async (): Promise<void> => {
  const root = process.cwd()
  const sourceDir = resolvePath(root, 'src/lib/wasm/generated')
  const targetDir = resolvePath(root, 'tmp/tsc/scripts/src/lib/wasm/generated')
  try {
    await mkdir(targetDir, { recursive: true })
    await cp(sourceDir, targetDir, { recursive: true, force: true })
  } catch {
    // non-fatal
  }
}

const loadSfc = async (sfcPath: string): Promise<{
  safeguardRules: SafeguardRule[]
  metasets: Metaset[]
}> => {
  const raw = await readFile(sfcPath, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  const parsedSfc = parseSfcObject(parsed, {
    metasets: [],
    substatTargets: defaultSubstatTargets(),
  })
  return { safeguardRules: parsedSfc.safeguardRules ?? [], metasets: parsedSfc.metasets }
}

const loadGear = async (gearDbPath: string): Promise<NormalizedGearArtifact[]> => {
  const buffer = await readFile(gearDbPath)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  const imported = await importGearDatabaseFromArrayBuffer(arrayBuffer)
  return [...imported.artifacts, ...imported.inboxArtifacts]
}

// Patch the target artifact to simulate level 12 + CDMG=12%
const patchArtifact = (artifact: NormalizedGearArtifact): NormalizedGearArtifact => {
  const cdmgVariant = Number(StatVariant.CDMG)
  const patchedSubstats: NormalizedStat[] = artifact.substats.map((sub) => {
    if (Number(sub.variant) !== cdmgVariant) return sub
    const patched: NormalizedStat = {
      ...sub,
      totalValue: MODIFIED_CDMG_PERCENT,
      baseValue: MODIFIED_CDMG_PERCENT,
      rolls: MODIFIED_CDMG_ROLLS,
    }
    return patched
  })
  return {
    ...artifact,
    level: MODIFIED_LEVEL as NormalizedGearArtifact['level'],
    exactLevel: MODIFIED_LEVEL,
    substats: patchedSubstats,
  }
}

const run = async (): Promise<void> => {
  await installNodeFileFetch()
  await syncCompiledWasmBindings()
  await warmupWasmRuleEngine()

  const args = process.argv.slice(2)
  const sfcPath = resolvePath(process.cwd(), args.includes('--sfc') ? args[args.indexOf('--sfc') + 1] ?? 'presets/lategame.sfc' : 'presets/lategame.sfc')
  const dbPath = resolvePath(process.cwd(), args.includes('--db') ? args[args.indexOf('--db') + 1] ?? 'examples/um109288203_RSLHelper.db' : 'examples/um109288203_RSLHelper.db')

  console.log(`Loading SFC: ${sfcPath}`)
  console.log(`Loading DB:  ${dbPath}`)

  const { safeguardRules: rawRules, metasets } = await loadSfc(sfcPath)
  const safeguardRules = resolveSafeguardRulesWithMetasets(rawRules, metasets)

  const gear = await loadGear(dbPath)

  console.log(`Loaded ${gear.length} artifacts, ${rawRules.length} safeguard rules (${safeguardRules.length} after metaset resolution)`)

  const target = gear.find((a) => a.id === TARGET_ARTIFACT_ID)
  if (!target) {
    console.error(`Artifact ${TARGET_ARTIFACT_ID} not found`)
    process.exit(1)
  }

  console.log(`\nTarget artifact: ID=${target.id}, level=${target.exactLevel ?? target.level}`)
  console.log(`Substats:`)
  for (const sub of target.substats) {
    console.log(`  variant=${sub.variant}, totalValue=${sub.totalValue}, rolls=${sub.rolls}`)
  }

  // Patch: level 12, CDMG=12%
  const patched = patchArtifact(target)
  const patchedGear = gear.map((a) => a.id === TARGET_ARTIFACT_ID ? patched : a)

  console.log(`\nPatched artifact: level=${patched.exactLevel}, CDMG=${MODIFIED_CDMG_PERCENT}%, CDMG rolls=${MODIFIED_CDMG_ROLLS}`)

  // Run improvement chance (unpatched = level 16 as-is)
  console.log(`\n--- Improvement chance at current level (${target.exactLevel ?? target.level}) ---`)
  storeArtifactRows(gear.map(toWasmArtifactStoreRow))
  const unpatched = buildSafeguardImprovementChanceByArtifactId(safeguardRules)
  const unpatchedEntry = unpatched.get(TARGET_ARTIFACT_ID)
  console.log(`chancePercent: ${unpatchedEntry?.chancePercent ?? 'N/A'}`)
  console.log(`hasMatchingSafeguard: ${unpatchedEntry?.hasMatchingSafeguard ?? 'N/A'}`)
  console.log(`ruleOrdinal: ${unpatchedEntry?.ruleOrdinal ?? 'N/A'}`)
  if (unpatchedEntry?.debug) {
    const d = unpatchedEntry.debug
    console.log(`debug: bucketCandidates=${d.bucketCandidateCount}, betterCandidates=${d.betterCandidateCount}`)
  }

  // Run improvement chance (patched = level 12, CDMG=12%)
  console.log(`\n--- Improvement chance at level 12, CDMG=${MODIFIED_CDMG_PERCENT}% ---`)
  storeArtifactRows(patchedGear.map(toWasmArtifactStoreRow))
  const result = buildSafeguardImprovementChanceByArtifactId(safeguardRules)
  const entry = result.get(TARGET_ARTIFACT_ID)
  console.log(`chancePercent: ${entry?.chancePercent ?? 'N/A'}`)
  console.log(`hasMatchingSafeguard: ${entry?.hasMatchingSafeguard ?? 'N/A'}`)
  console.log(`ruleOrdinal: ${entry?.ruleOrdinal ?? 'N/A'}`)
  if (entry?.debug) {
    const d = entry.debug
    console.log(`debug: bucketCandidates=${d.bucketCandidateCount}, betterCandidates=${d.betterCandidateCount}`)
    console.log(`debug: requiredPerBucket=${d.requiredPerBucket}`)
    console.log(`debug: matchedSelectedNow=${d.matchedSelectedNow}`)
    console.log(`debug: selectedSubstats=${JSON.stringify(d.selectedSubstats)}`)
    console.log(`debug: viableScenarioCount=${d.viableScenarioCount}`)
    console.log(`debug: maxAdditionEventsTo16=${d.maxAdditionEventsTo16}`)
  }

  // --- TS challenger pool for Survivability Top Row (manual reconstruction) ---
  // Rules no longer carry a string id; look up by name instead.
  const SURV_RULE_NAME = 'Survivability Top Row'
  const survRule = safeguardRules.find((r) => r.appearance?.name === SURV_RULE_NAME)
  if (survRule) {
    console.log('\n--- TS challenger pool for Survivability Top Row (patched gear) ---')
    const selectedSubstats = survRule.substats.map((s) => Number(s)).filter((v) => v > 0)
    const weightsMap = survRule.substatWeights ?? {}
    const includeSetIds = new Set(survRule.combination.sets.filter((s) => !s.excluded).map((s) => Number(s.id)))
    const slots = survRule.combination.slots.map(Number)
    const rarities = survRule.combination.rarities.map(Number)
    const ranks = survRule.combination.ranks.map(Number)
    const targetCountKey = getSafeguardCountKey(patched, survRule.countMode)
    console.log(`  selectedSubstats=${JSON.stringify(selectedSubstats)}, weights=${JSON.stringify(weightsMap)}`)
    console.log(`  slots=${JSON.stringify(slots)}, rarities=${JSON.stringify(rarities)}, ranks=${JSON.stringify(ranks)}`)
    console.log(`  includeSetIds count=${includeSetIds.size}, targetCountKey=${targetCountKey}`)
    const bucketItems: { id: number; score: number; ck: string }[] = []
    for (const a of patchedGear) {
      if (slots.length > 0 && !slots.includes(Number(a.slot))) continue
      if (includeSetIds.size > 0 && !includeSetIds.has(Number(a.set))) continue
      if (ranks.length > 0 && !ranks.includes(Number(a.rank))) continue
      if (rarities.length > 0 && !rarities.includes(Number(a.rarity))) continue
      const hasMatchingSub = selectedSubstats.some((v) => {
        const sub = a.substats.find((s) => Number(s.variant) === v)
        return sub != null && Number(sub.totalValue) > 0
      })
      if (!hasMatchingSub) continue
      let score = 0
      for (const v of selectedSubstats) {
        const sub = a.substats.find((s) => Number(s.variant) === v)
        const raw = sub != null ? Number(sub.totalValue) : 0
        const norm = normalizeSubstatByMax6(v as StatVariant, raw)
        const w = Number((weightsMap as Record<number, number>)[v] ?? 1)
        score += w * norm
      }
      if (!(score > 0)) continue
      const ck = getSafeguardCountKey(a, survRule.countMode)
      bucketItems.push({ id: Number(a.id), score, ck })
    }
    bucketItems.sort((x, y) => y.score - x.score)
    for (const item of bucketItems) {
      const isSameBucket = item.ck === targetCountKey
      const isTarget = item.id === TARGET_ARTIFACT_ID
      console.log(`  id=${item.id} score=${item.score.toFixed(4)} ck=${item.ck}${isTarget ? ' [TARGET]' : ''}${isSameBucket ? ' [SAME BUCKET]' : ''}`)
    }
  }

  // --- WASM safeguard detection via full collect+detect pipeline ---
  // Pass minimal GearInspectorPreviewRow objects with match=null so the WASM collect step
  // treats every item as sold. baseRules=[] means no HSF keep-rules exist.
  // Rules are identified by 1-based ordinal; derive it from the array index.
  const survivabilityRuleOrdinal = safeguardRules.findIndex((r) => r.appearance?.name === SURV_RULE_NAME) + 1

  const runWasmDetection = (label: string, artifacts: NormalizedGearArtifact[]) => {
    const rows = artifacts.map((a) => ({
      artifact: a,
      match: null,
      baseMatch: null,
      matchingRecipeIndices: [],
      matchingRecipeDecisions: [],
    })) as unknown as GearInspectorPreviewRow[]

    const { candidates: candidateSnapshot, detection } = collectAndComputeSafeguardProtection({
      rows,
      baseRules: [],
      recipeModes: [],
      rules: safeguardRules,
      enabled: true,
      now: Date.now(),
    })
    const targetArtifact = artifacts.find((a) => a.id === TARGET_ARTIFACT_ID)!
    const targetItemKey = getSafeguardItemKey(targetArtifact)
    const targetCountKey = getSafeguardCountKey(targetArtifact, safeguardRules.find((r) => r.appearance?.name === SURV_RULE_NAME)!.countMode)
    const matchingEntry = detection.entries.find((e) => e.itemKeys.includes(targetItemKey))
    const survivabilityEntry = detection.entries.find((e) => e.ruleOrdinal === survivabilityRuleOrdinal)

    console.log(`\n--- WASM safeguard detection: ${label} ---`)
    console.log(`Target itemKey: ${targetItemKey}, countKey: ${targetCountKey}`)

    if (matchingEntry) {
      console.log(`PROTECTED by rule ordinal: ${matchingEntry.ruleOrdinal ?? '(none)'} | activation=${matchingEntry.ruleActivation}`)
      console.log(`  requiredCount=${matchingEntry.requiredCount}, currentCount=${matchingEntry.currentCount}, deficit=${matchingEntry.deficit}`)
    } else {
      console.log(`NOT protected by any safeguard rule`)
    }

    if (survivabilityEntry) {
      console.log(`\n"Protect: Survivability Top Row" entry:`)
      console.log(`  requiredCount=${survivabilityEntry.requiredCount}, perGroupRequired=${survivabilityEntry.perBucketRequiredCount}, bucketsTracked=${survivabilityEntry.bucketsTracked}`)
      console.log(`  currentCount=${survivabilityEntry.currentCount}, projectedCount=${survivabilityEntry.projectedCount}, deficit=${survivabilityEntry.deficit}`)
      console.log(`  itemKeys protected (${survivabilityEntry.itemKeys.length}): [${survivabilityEntry.itemKeys.join(', ')}]`)
      // Find items in the same bucket as target (matching countKey)
      const bucketArtifacts = survivabilityEntry.artifacts.filter((a) => {
        const art = artifacts.find((x) => getSafeguardItemKey(x) === a.itemKey)
        if (!art) return false
        const ck = getSafeguardCountKey(art, safeguardRules.find((r) => r.appearance?.name === SURV_RULE_NAME)!.countMode)
        return ck === targetCountKey
      })
      console.log(`\n  Items in same countKey bucket as target (${bucketArtifacts.length}):`)
      for (const ba of bucketArtifacts) {
        const art = artifacts.find((x) => getSafeguardItemKey(x) === ba.itemKey)!
        const isProtected = survivabilityEntry.itemKeys.includes(ba.itemKey)
        console.log(`    itemKey=${ba.itemKey} id=${art.id} level=${ba.exactLevel ?? ba.level} set=${ba.set} slot=${ba.slot} main=${ba.mainStat} ${isProtected ? '✓ PROTECTED' : '✗ not protected'}`)
        for (const sub of ba.substats) {
          console.log(`      variant=${sub.variant}, value=${sub.value}`)
        }
      }
      // Also show target if not in bucket artifacts
      const targetInBucket = bucketArtifacts.some((a) => a.itemKey === targetItemKey)
      if (!targetInBucket) {
        console.log(`\n  Target (${TARGET_ARTIFACT_ID}) NOT found in survivability entry artifacts.`)
        console.log(`  Total artifacts in entry: ${survivabilityEntry.artifacts.length}`)
        // Check if target is a candidate at all
        const targetCandidate = candidateSnapshot.candidates.find((c) => c.itemKey === targetItemKey)
        console.log(`  Target is candidate: ${targetCandidate ? 'YES' : 'NO'}, isSold=${targetCandidate?.isSold}`)
      }
    } else {
      console.log(`\n"Protect: Survivability Top Row" rule has NO detection entry`)
    }

    // --- Extended diagnostics: all slot=6/set=44 candidates ---
    const survRule = safeguardRules.find((r) => r.appearance?.name === SURV_RULE_NAME)!
    const shieldGuardianCandidates = candidateSnapshot.candidates.filter((c) => {
      const a = c.artifact as NormalizedGearArtifact
      return Number(a.slot) === 6 && Number(a.set) === 44
    })
    console.log(`\n--- slot=6 set=44 candidates (${shieldGuardianCandidates.length} total) ---`)
    for (const c of shieldGuardianCandidates) {
      const a = c.artifact as NormalizedGearArtifact
      const ck = getSafeguardCountKey(a, survRule.countMode)
      const variantIds = a.substats.map((s) => `${s.variant}=${s.totalValue}`).join(', ')
      console.log(`  itemKey=${c.itemKey} isSold=${c.isSold} ck=${ck} substats=[${variantIds}] rank=${a.rank} rarity=${a.rarity}`)
    }

    // --- Extended diagnostics: which rules see slot=6/set=44 items ---
    console.log(`\n--- Detection entries with slot=6/set=44 items ---`)
    for (const e of detection.entries) {
      if (e.ruleOrdinal == null) continue
      // Check combination slots and sets
      const hasSlot6 = e.combination.slots.length === 0 || e.combination.slots.includes(6 as import('../../src/lib/types.js').ArtifactTypeId)
      const hasSet44 = e.combination.sets.length === 0 || e.combination.sets.some((s) => Number(s.id) === 44)
      if (hasSlot6 && hasSet44 && e.currentCount > 0) {
        const myArtifacts = e.artifacts.filter((a) => a.slot === 6 && a.set === 44)
        console.log(`  [ordinal=${e.ruleOrdinal}] currentCount=${e.currentCount} slot6/set44 artifacts=${myArtifacts.length}`)
        for (const a of myArtifacts) {
          console.log(`    itemKey=${a.itemKey} level=${a.level} substats=[${a.substats.map((s) => `${s.variant}=${s.value}`).join(',')}]`)
        }
      }
    }
  }

  // Print the raw NormalizedGearArtifact for the Guardian Shield so we can see what WASM receives
  console.log(`\n--- Guardian Shield raw NormalizedGearArtifact (level 16) ---`)
  console.log(JSON.stringify(target, null, 2))

  runWasmDetection(`level 16 (current, CDMG=18%)`, gear)
  runWasmDetection(`level 12 (patched, CDMG=12%)`, patchedGear)

  // Also print ALL rules and whether they match the patched item
  console.log(`\n--- Per-rule analysis for patched item ---`)
  console.log(`Patched item: slot=${patched.slot}, set=${patched.set}, rank=${patched.rank}, rarity=${patched.rarity}`)
  console.log(`Substats on patched item:`)
  for (const sub of patched.substats) {
    console.log(`  variant=${sub.variant} (${sub.variant}), totalValue=${sub.totalValue}, rolls=${sub.rolls}`)
  }
  console.log(`\nSafeguard rules (${safeguardRules.length} total):`)
  for (const rule of safeguardRules) {
    const sub = rule.substats.map((v) => Number(v)).join(',')
    const slots = rule.combination.slots.map((s) => Number(s)).join(',')
    const sets = rule.combination.sets.map((s) => `id=${Number(s.id)}`).join(',')
    const rarities = rule.combination.rarities.map((r) => Number(r)).join(',')
    console.log(`  [${rule.appearance?.name ?? '(unnamed)'}] act=${rule.activation} slots=[${slots}] sets=[${sets || 'ANY'}] rarities=[${rarities}] substats=[${sub}] match=${rule.substatMatch}`)
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
