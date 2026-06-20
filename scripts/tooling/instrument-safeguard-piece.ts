#!/usr/bin/env node
/**
 * instrument-safeguard-piece.ts
 *
 * General-purpose safeguard explainer: answers "why was (or wasn't) THIS gear
 * piece safeguarded?" by driving the REAL pipeline against a preset + DB and
 * reporting both safeguard systems side by side for a target artifact:
 *   - Improvement-chance protection (chance %, per-rule chances, debug snapshot).
 *   - Current-score "Top Row" ranking protection (where the piece sits in its
 *     count-group vs required-per-group).
 *   - The actual safeguard detection verdict (which rule, if any, protects it).
 *
 * It also supports simulating BEFORE/AFTER substat states so you can see what a
 * roll changes — handy when a user reports a piece flipping from sold to kept.
 *
 * This was first written to investigate a user report: a Cruel-set helmet that
 * showed 0% improvement chance at +8 (SPD=6, 0 rolls) yet became safeguarded at
 * +12 after rolling SPD to 12 (1 roll). The finding: improvement chance stayed
 * 0% the whole time; the real driver was the current-score Top-Row ranking rule
 * (the SPD roll raised the piece's score across its group's top-N cutoff). That
 * case remains the default config below — edit the TARGET/override/state section
 * to point it at any other piece.
 *
 * Usage:
 *   tsc -p tsconfig.scripts.json && node scripts/tooling/patch-esm-specifiers.cjs \
 *     && cp -r src/lib/wasm/generated/* tmp/tsc/scripts/src/lib/wasm/generated/ \
 *     && node --experimental-wasm-modules \
 *        tmp/tsc/scripts/scripts/tooling/instrument-safeguard-piece.js
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
  computeSafeguardScoreFromArtifact,
  storeArtifactRows,
  toWasmArtifactStoreRow,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import { importGearDatabaseFromArrayBuffer } from '../../src/lib/importers/gearDbImporter.js'
import type { NormalizedGearArtifact, NormalizedStat } from '../../src/lib/importers/gearDbNormalizer.js'
import type { Metaset } from '../../src/lib/metasets.js'
import { buildSafeguardImprovementChanceByArtifactId } from '../../src/lib/safeguardImprovementChance.js'
import {
  warmupWasmRuleEngine,
  configureWasmRuleEngineWithLoadedWasm,
} from '../../src/lib/wasm/wasmRuleEngine.js'
import { StatVariant, ArtifactSet, ArtifactType } from '../../src/lib/types.js'
import {
  resolveRecipeOverridesTags,
  seedSafeguardAnswersFromRecipeDefaults,
} from '../../src/lib/noteRecipeOverrides.js'
import {
  resolveNoteSafeguardOverridesTags,
  applySafeguardOverrides,
} from '../../src/lib/noteSafeguardOverrides.js'
import type { GearInspectorPreviewRow } from '../../src/types/gearInspectorPreview.js'

// ── Node shims so the browser-oriented importer/WASM loader work headless ──────
const installNodeFileFetch = async (): Promise<void> => {
  const originalFetch = globalThis.fetch
  if (typeof originalFetch !== 'function') return
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string'
      ? input
      : (input instanceof URL ? input.href : input.url)
    if (url.startsWith('file://')) {
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

// ── SFC / DB loaders ──────────────────────────────────────────────────────────
const loadSfc = async (sfcPath: string): Promise<{
  rawRules: SafeguardRule[]
  metasets: Metaset[]
  note: string
}> => {
  const raw = await readFile(sfcPath, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  const parsedSfc = parseSfcObject(parsed, {
    metasets: [],
    substatTargets: defaultSubstatTargets(),
  })
  const note = Array.isArray((parsed as { Note?: unknown }).Note)
    ? ((parsed as { Note: string[] }).Note).join('\n')
    : (typeof (parsed as { Note?: unknown }).Note === 'string' ? (parsed as { Note: string }).Note : '')
  return { rawRules: parsedSfc.safeguardRules ?? [], metasets: parsedSfc.metasets, note }
}

const loadGear = async (gearDbPath: string): Promise<NormalizedGearArtifact[]> => {
  const buffer = await readFile(gearDbPath)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  const imported = await importGearDatabaseFromArrayBuffer(arrayBuffer)
  return [...imported.artifacts, ...imported.inboxArtifacts]
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const RES = Number(StatVariant.RES)
const SPD = Number(StatVariant.SPD)
const HELMET = Number(ArtifactType.Helmet)
const CRUEL = Number(ArtifactSet.Cruel)

const fmtSubstats = (a: NormalizedGearArtifact): string =>
  a.substats.map((s) => `v${s.variant}=${s.totalValue}(${s.rolls ?? 0}r)`).join(', ')

// Force a single substat's value + rolls; preserves the rest.
const setSubstat = (
  subs: NormalizedStat[],
  variant: number,
  totalValue: number,
  rolls: number,
): NormalizedStat[] =>
  subs.map((s) =>
    Number(s.variant) === variant
      ? { ...s, totalValue, baseValue: totalValue, rolls }
      : s)

const patchTo = (
  artifact: NormalizedGearArtifact,
  level: number,
  spdValue: number,
  spdRolls: number,
): NormalizedGearArtifact => ({
  ...artifact,
  level: level as NormalizedGearArtifact['level'],
  exactLevel: level,
  substats: setSubstat(artifact.substats, SPD, spdValue, spdRolls),
})

const run = async (): Promise<void> => {
  await installNodeFileFetch()
  await syncCompiledWasmBindings()
  await warmupWasmRuleEngine()

  const sfcPath = resolvePath(process.cwd(), 'presets/lategame.sfc')
  const dbPath = resolvePath(process.cwd(), 'examples/um109288203_RSLHelper.db')
  console.log(`SFC: ${sfcPath}`)
  console.log(`DB:  ${dbPath}`)

  const { rawRules, metasets, note } = await loadSfc(sfcPath)

  // ── Apply the `endgame` dynamic override exactly as the app does ─────────────
  // 1. Recipe answer = endgame. 2. seed forces impr_art=50 into safeguard answers.
  // 3. Resolve safeguard instructions and apply them to the metaset-resolved rules.
  const recipeAnswers = { /* questionId */ } as Record<string, string[]>
  // The account-mode question id is the first recipe-overrides question; select endgame by id.
  const recipeQuestions = resolveRecipeOverridesTags(note, recipeAnswers).questions
  // DSL `id=endgame` is carried as option.token; the answer value is the synthesized option.id.
  let endgameQuestionId: string | undefined
  let endgameOptionId: string | undefined
  for (const q of recipeQuestions) {
    const opt = q.options.find((o) => (o as { token?: string }).token === 'endgame')
    if (opt) { endgameQuestionId = q.id; endgameOptionId = opt.id; break }
  }
  if (!endgameQuestionId || !endgameOptionId) throw new Error('Could not find account-mode question with endgame option')
  const endgameAnswers: Record<string, string[]> = { [endgameQuestionId]: [endgameOptionId] }

  // Seed safeguard answers (impr_art=50 etc.) from the endgame recipe selection.
  const safeguardAnswers = seedSafeguardAnswersFromRecipeDefaults(note, endgameAnswers, {})
  console.log(`\nSeeded safeguard-override answers from endgame selection:`)
  for (const [k, v] of Object.entries(safeguardAnswers)) console.log(`  ${k} = ${JSON.stringify(v)}`)

  const sgResolution = resolveNoteSafeguardOverridesTags(note, safeguardAnswers)
  const metasetResolved = resolveSafeguardRulesWithMetasets(rawRules, metasets)
  const safeguardRules = [...applySafeguardOverrides(metasetResolved, sgResolution.instructions)]
  console.log(`\nRules: ${rawRules.length} raw -> ${metasetResolved.length} metaset-resolved -> ${safeguardRules.length} after endgame overrides`)
  // Confirm improvement-chance thresholds landed on rules.
  const withImpr = safeguardRules.filter((r) => r.improvementChanceThreshold != null)
  console.log(`Rules with improvementChanceThreshold set: ${withImpr.length}`)
  for (const r of withImpr.slice(0, 12)) {
    console.log(`  [${r.appearance?.name ?? '(unnamed)'}] threshold=${JSON.stringify(r.improvementChanceThreshold)} substats=[${r.substats.join(',')}]`)
  }

  // ── Load gear and find the Cruel helmet (RES + SPD) ─────────────────────────
  const gear = await loadGear(dbPath)
  console.log(`\nLoaded ${gear.length} artifacts`)

  const cruelHelmets = gear.filter((a) =>
    Number(a.slot) === HELMET && Number(a.set) === CRUEL)
  console.log(`\nCruel helmets (set=${CRUEL}, slot=${HELMET}): ${cruelHelmets.length}`)
  for (const a of cruelHelmets) {
    const hasRes = a.substats.some((s) => Number(s.variant) === RES && Number(s.totalValue) > 0)
    const hasSpd = a.substats.some((s) => Number(s.variant) === SPD && Number(s.totalValue) > 0)
    console.log(`  id=${a.id} lvl=${a.exactLevel ?? a.level} rarity=${a.rarity} main=v${(a as { main?: number }).main} ${hasRes ? '[RES]' : ''}${hasSpd ? '[SPD]' : ''} subs=[${fmtSubstats(a)}]`)
  }

  // Match the exact description: RES≈32 with 2 rolls AND SPD present, currently at +12.
  const matchesDescription = (a: NormalizedGearArtifact): boolean => {
    const res = a.substats.find((s) => Number(s.variant) === RES)
    const spd = a.substats.find((s) => Number(s.variant) === SPD)
    return res != null && Number(res.totalValue) >= 28 && Number(res.totalValue) <= 36
      && Number(res.rolls ?? 0) === 2 && spd != null
  }
  const target =
    cruelHelmets.find(matchesDescription)
    ?? cruelHelmets.find((a) => {
      const res = a.substats.find((s) => Number(s.variant) === RES)
      const spd = a.substats.find((s) => Number(s.variant) === SPD)
      return res != null && Number(res.totalValue) > 0 && spd != null
    })

  if (!target) {
    console.error('\nNo Cruel helmet with RES+SPD found. Listing all printed above for manual pick.')
    process.exit(1)
  }
  console.log(`\n=== TARGET helmet id=${target.id} ===`)
  console.log(`  set=${target.set} slot=${target.slot} rank=${target.rank} rarity=${target.rarity} main=v${(target as { main?: number }).main}`)
  console.log(`  level=${target.exactLevel ?? target.level} subs=[${fmtSubstats(target)}]`)

  const targetId = Number(target.id)

  // ── Build BEFORE (+8, SPD=6 / 0 rolls) and AFTER (+12, SPD=12 / 1 roll) ───────
  const before = patchTo(target, 8, 6, 0)
  const after = patchTo(target, 12, 12, 1)

  const report = async (label: string, patchedTarget: NormalizedGearArtifact): Promise<void> => {
    const patchedGear = gear.map((a) => (Number(a.id) === targetId ? patchedTarget : a))

    console.log(`\n${'═'.repeat(72)}`)
    console.log(`STATE: ${label}`)
    console.log(`  target subs=[${fmtSubstats(patchedTarget)}] level=${patchedTarget.exactLevel}`)

    // Improvement chance (with debug snapshot). The engine must be configured (keep-rules
    // empty here, mirroring baseRules:[] in detection) and artifact rows stored first.
    configureWasmRuleEngineWithLoadedWasm({ rules: [], recipeModes: [] })
    storeArtifactRows(patchedGear.map(toWasmArtifactStoreRow))
    const impr = buildSafeguardImprovementChanceByArtifactId(safeguardRules)
    const entry = impr.get(targetId)
    console.log(`\n  -- Improvement chance --`)
    console.log(`  chancePercent=${entry?.chancePercent ?? 'N/A'}  hasMatchingSafeguard=${entry?.hasMatchingSafeguard ?? 'N/A'}  ruleOrdinal=${entry?.ruleOrdinal ?? 'N/A'}`)
    if (entry?.chancesByRuleOrdinal?.length) {
      console.log(`  per-rule chances: ${entry.chancesByRuleOrdinal.map((c) => `#${c.ruleOrdinal}=${c.chancePercent}%`).join(', ')}`)
    }
    if (entry?.debug) {
      const d = entry.debug
      console.log(`  debug: selectedSubstats=[${d.selectedSubstats.join(',')}] substatMatch=${d.substatMatch} requiredPerGroup=${d.requiredPerGroup}`)
      console.log(`  debug: bucketCandidateCount=${d.bucketCandidateCount} betterCandidateCount=${d.betterCandidateCount}`)
      console.log(`  debug: matchedSelectedNow=${d.matchedSelectedNow} maxAdditionEventsTo16=${d.maxAdditionEventsTo16} viableScenarioCount=${d.viableScenarioCount}`)
    }

    // Real safeguard detection.
    const rows = patchedGear.map((a) => ({
      artifact: a,
      match: null,
      baseMatch: null,
      matchingRecipeIndices: [],
      matchingRecipeDecisions: [],
    })) as unknown as GearInspectorPreviewRow[]
    const { detection } = collectAndComputeSafeguardProtection({
      rows,
      baseRules: [],
      recipeModes: [],
      rules: safeguardRules,
      enabled: true,
      now: Date.now(),
    })
    const itemKey = getSafeguardItemKey(patchedTarget)
    const protectingEntries = detection.entries.filter((e) => e.itemKeys.includes(itemKey))
    console.log(`\n  -- Real safeguard detection --`)
    console.log(`  itemKey=${itemKey}`)
    if (protectingEntries.length === 0) {
      console.log(`  NOT protected by any safeguard.`)
    } else {
      console.log(`  PROTECTED by ${protectingEntries.length} entr(y/ies):`)
      for (const e of protectingEntries) {
        const rule = e.ruleOrdinal != null ? safeguardRules[e.ruleOrdinal - 1] : undefined
        console.log(`    ordinal=${e.ruleOrdinal} name="${rule?.appearance?.name ?? '?'}" activation=${e.ruleActivation} required=${e.requiredCount} current=${e.currentCount} deficit=${e.deficit}`)
      }
    }

    // -- Top-Row ranking analysis for the rule that protects (or could) the helmet --
    // Reconstruct the current-score ranking within the helmet's count-group, exactly
    // as the WASM ranking path does (current value + glyph, weighted), to show WHERE
    // the helmet sits relative to required-per-group. This is the real driver.
    const TOP_ROW = safeguardRules[111]! // ordinal 112 "Protect: Artifacts (Top Row)"
    const selected = TOP_ROW.substats.map(Number).filter((v) => v > 0)
    const weights = new Map<number, number>(
      Object.entries(TOP_ROW.substatWeights ?? {}).map(([k, v]) => [Number(k), Number(v)]))
    const targetCk = getSafeguardCountKey(patchedTarget, TOP_ROW.countMode)
    // Build the bucket: artifacts passing #112's dimension + substat gate, same count-key.
    const incSets = new Set(TOP_ROW.combination.sets.filter((s) => !s.excluded).map((s) => Number(s.id)))
    const slots = TOP_ROW.combination.slots.map(Number)
    const rarities = TOP_ROW.combination.rarities.map(Number)
    const ranks = TOP_ROW.combination.ranks.map(Number)
    const minMatch = Number(TOP_ROW.substatMatch) || 1
    const bucket: { id: number; score: number; level: number }[] = []
    for (const a of patchedGear) {
      if (slots.length && !slots.includes(Number(a.slot))) continue
      if (incSets.size && !incSets.has(Number(a.set))) continue
      if (ranks.length && !ranks.includes(Number(a.rank))) continue
      if (rarities.length && !rarities.includes(Number(a.rarity))) continue
      if (getSafeguardCountKey(a, TOP_ROW.countMode) !== targetCk) continue
      const matched = selected.filter((v) =>
        a.substats.some((s) => Number(s.variant) === v && Number(s.totalValue) > 0)).length
      if (matched < minMatch) continue
      const score = computeSafeguardScoreFromArtifact(a, selected, weights, TOP_ROW.weightMainStatByRank)
      if (!(score > 0)) continue
      bucket.push({ id: Number(a.id), score, level: a.exactLevel ?? a.level })
    }
    bucket.sort((x, y) => y.score - x.score)
    const rank1Based = bucket.findIndex((b) => b.id === targetId) + 1
    const reqPerGroup = Number(TOP_ROW.requiredCount)
    console.log(`\n  -- Rule #112 "Protect: Artifacts (Top Row)" current-score ranking --`)
    console.log(`  countKey=${targetCk}  requiredPerGroup=${reqPerGroup}  bucketSize=${bucket.length}`)
    console.log(`  TARGET current score=${(bucket.find((b) => b.id === targetId)?.score ?? 0).toFixed(4)}  rank=${rank1Based}/${bucket.length}  -> ${rank1Based > 0 && rank1Based <= reqPerGroup ? 'INSIDE top-N (protected)' : 'OUTSIDE top-N'}`)
    const lo = Math.max(0, reqPerGroup - 2)
    const hi = Math.min(bucket.length, reqPerGroup + 2)
    console.log(`  neighborhood around the cutoff (rank ${lo + 1}..${hi}):`)
    for (let i = lo; i < hi; i++) {
      const b = bucket[i]!
      const cut = i + 1 === reqPerGroup ? '  <== cutoff (rank N)' : ''
      const me = b.id === targetId ? '  [TARGET]' : ''
      console.log(`    #${i + 1} id=${b.id} lvl=${b.level} score=${b.score.toFixed(4)}${cut}${me}`)
    }
  }

  await report('BEFORE  (+8, SPD=6, 0 rolls)', before)
  await report('AFTER   (+12, SPD=12, 1 roll)', after)

  console.log(`\n${'═'.repeat(72)}`)
  console.log('Done.')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
