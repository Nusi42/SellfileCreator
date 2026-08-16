#!/usr/bin/env node
/**
 * measure-group-effect.ts
 *
 * Answers "what does this group actually keep, and does grouping change anything?" by driving
 * the REAL pipeline against a preset + DB and reporting, per rule, how many pieces each entry
 * protects — first as shipped, then with every group membership stripped.
 *
 * Written to settle a concrete question: the lategame preset groups its four SPD-main
 * Chestplate/Boots damage feeders (entries 37-40). Their filters overlap heavily, so the claim
 * that grouping tightens what they keep needed measuring rather than reasoning from filter
 * shapes. Point GROUP_INDICES at any other run to reuse it.
 *
 * Usage:
 *   npx tsc -p tsconfig.scripts.json --noEmit false && node scripts/tooling/patch-esm-specifiers.cjs \
 *     && node --experimental-wasm-modules \
 *        tmp/tsc/scripts/scripts/tooling/measure-group-effect.js
 */
import { cp, mkdir, readFile } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'
import { parseSfcObject } from '../../src/lib/sfcIO.js'
import { defaultSubstatTargets } from '../../src/lib/hsfBuilder.js'
import {
  resolveSafeguardRulesWithMetasets,
  collectAndComputeSafeguardProtection,
  storeArtifactRows,
  toWasmArtifactStoreRow,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import { computeMergedRules } from '../../src/lib/merge.js'
import { importGearDatabaseFromArrayBuffer } from '../../src/lib/importers/gearDbImporter.js'
import type { NormalizedGearArtifact } from '../../src/lib/importers/gearDbNormalizer.js'
import {
  warmupWasmRuleEngine,
  configureWasmRuleEngineWithLoadedWasm,
} from '../../src/lib/wasm/wasmRuleEngine.js'
import {
  resolveRecipeOverridesTags,
  seedSafeguardAnswersFromRecipeDefaults,
} from '../../src/lib/noteRecipeOverrides.js'
import {
  resolveNoteSafeguardOverridesTags,
  applySafeguardOverrides,
} from '../../src/lib/noteSafeguardOverrides.js'
import type { GearInspectorPreviewRow } from '../../src/types/gearInspectorPreview.js'

// ── Scenario knobs (env vars) — defaults reproduce the shipped-preset question ──
// MGE_SFC           SFC to measure                       (presets/lategame.sfc)
// MGE_DB            RSL Helper DB                        (examples/um109288203_RSLHelper.db)
// MGE_GROUP         comma-separated Safeguards indices    (37,38,39,40)
// MGE_MODE          account-mode option token for overrides, or "none" to skip the note
//                   entirely, i.e. "dynamic overrides disabled" in the app   (lategame)
// MGE_DROP_BEFORE   1 = drop every entry before the run, so nothing earlier can pre-protect
// MGE_MEMBER_COUNT  override each member's own requiredCount (its FEED size)
// MGE_GROUP_COUNT   override the group's requiredCount (what it KEEPS)
// MGE_WEIGHT_SCALE  multiply every member weight EXCEPT the ones every member shares by this
//                   factor — amplifies whatever already distinguishes the members, so "do the
//                   members' yardsticks disagree at the cutoff?" can be tested directly
const env = (key: string): string | undefined => {
  const value = process.env[key]
  return value !== undefined && value !== '' ? value : undefined
}
const SFC_PATH = env('MGE_SFC') ?? 'presets/lategame.sfc'
const DB_PATH = env('MGE_DB') ?? 'examples/um109288203_RSLHelper.db'
const GROUP_INDICES = (env('MGE_GROUP') ?? '37,38,39,40').split(',').map((s) => Number(s.trim()))
const ACCOUNT_MODE = env('MGE_MODE') ?? 'lategame'
const DROP_BEFORE = env('MGE_DROP_BEFORE') === '1'
const MEMBER_COUNT = env('MGE_MEMBER_COUNT') !== undefined ? Number(env('MGE_MEMBER_COUNT')) : null
const GROUP_COUNT = env('MGE_GROUP_COUNT') !== undefined ? Number(env('MGE_GROUP_COUNT')) : null
const WEIGHT_SCALE = env('MGE_WEIGHT_SCALE') !== undefined ? Number(env('MGE_WEIGHT_SCALE')) : null

// ── Node shims so the browser-oriented importer/WASM loader work headless ──────
// Same pair instrument-safeguard-piece.ts installs; kept local rather than shared because these
// exist only to make a browser loader run under `node --experimental-wasm-modules`.
const installNodeFileFetch = async (): Promise<void> => {
  const originalFetch = globalThis.fetch
  if (typeof originalFetch !== 'function') return
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url)
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
  try {
    await mkdir(resolvePath(root, 'tmp/tsc/scripts/src/lib/wasm/generated'), { recursive: true })
    await cp(
      resolvePath(root, 'src/lib/wasm/generated'),
      resolvePath(root, 'tmp/tsc/scripts/src/lib/wasm/generated'),
      { recursive: true, force: true },
    )
  } catch {
    // non-fatal
  }
}

const loadSfc = async (sfcPath: string) => {
  const raw = await readFile(sfcPath, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  const parsedSfc = parseSfcObject(parsed, { metasets: [], substatTargets: defaultSubstatTargets() })
  const noteValue = (parsed as { Note?: unknown }).Note
  const note = Array.isArray(noteValue) ? (noteValue as string[]).join('\n')
    : typeof noteValue === 'string' ? noteValue : ''
  return {
    rawRules: parsedSfc.safeguardRules ?? [],
    metasets: parsedSfc.metasets,
    note,
    // The preset's keep-recipes. Without them NOTHING is a sell candidate, so safeguards have
    // nothing to rescue and every measurement reads as "all 8286 kept" — the run must be scored
    // against the same recipes the user actually exports with.
    recipes: parsedSfc.recipes ?? [],
    substatTargets: parsedSfc.substatTargets ?? defaultSubstatTargets(),
    finalSellRemainder: parsedSfc.finalSellRemainder ?? null,
  }
}

const loadGear = async (dbPath: string): Promise<NormalizedGearArtifact[]> => {
  const buffer = await readFile(dbPath)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  const imported = await importGearDatabaseFromArrayBuffer(arrayBuffer)
  return [...imported.artifacts, ...imported.inboxArtifacts]
}

const run = async (): Promise<void> => {
  await installNodeFileFetch()
  await syncCompiledWasmBindings()
  await warmupWasmRuleEngine()
  const sfcPath = resolvePath(process.cwd(), SFC_PATH)
  const dbPath = resolvePath(process.cwd(), DB_PATH)
  const { rawRules, metasets, note, recipes, substatTargets, finalSellRemainder } = await loadSfc(sfcPath)

  const metasetResolved = resolveSafeguardRulesWithMetasets(rawRules, metasets)
  let resolvedRules: SafeguardRule[]
  if (ACCOUNT_MODE === 'none') {
    // "Dynamic overrides disabled": the rules exactly as stored, no note applied.
    resolvedRules = [...metasetResolved]
  } else {
    // Resolve the note's dynamic overrides exactly as the app does for the chosen account mode.
    const recipeQuestions = resolveRecipeOverridesTags(note, {}).questions
    let questionId: string | undefined
    let optionId: string | undefined
    for (const question of recipeQuestions) {
      const option = question.options.find((o) => (o as { token?: string }).token === ACCOUNT_MODE)
      if (option) { questionId = question.id; optionId = option.id; break }
    }
    if (!questionId || !optionId) throw new Error(`no account-mode option '${ACCOUNT_MODE}'`)
    const safeguardAnswers = seedSafeguardAnswersFromRecipeDefaults(note, { [questionId]: [optionId] }, {})
    const sgResolution = resolveNoteSafeguardOverridesTags(note, safeguardAnswers)
    resolvedRules = [...applySafeguardOverrides(metasetResolved, sgResolution.instructions)]
  }

  // Scenario edits, applied to the run under measurement only. Indices are re-based when the
  // entries before the run are dropped, so GROUP_INDICES keeps meaning "the run".
  const runStart = Math.min(...GROUP_INDICES)
  let groupIndices = GROUP_INDICES
  if (DROP_BEFORE) {
    resolvedRules = resolvedRules.slice(runStart)
    groupIndices = GROUP_INDICES.map((index) => index - runStart)
  }
  // The weight keys every member carries with an identical value are the members' COMMON
  // yardstick; everything else is what tells them apart. Scaling only the latter answers "would
  // the members disagree if their differences mattered more?" without inventing new stats.
  // Weight tables are keyed by numeric StatVariant at runtime; read them as plain records here.
  const memberWeightTables: Record<string, number | undefined>[] = groupIndices
    .map((index) => ({ ...(resolvedRules[index]?.substatWeights ?? {}) }) as Record<string, number | undefined>)
  const firstTable = memberWeightTables[0] ?? {}
  const sharedWeightKeys = new Set(
    Object.keys(firstTable).filter((key) =>
      memberWeightTables.every((table) => table[key] !== undefined && table[key] === firstTable[key])),
  )
  const grouped: SafeguardRule[] = resolvedRules.map((rule, index) => {
    if (!groupIndices.includes(index)) return rule
    const next: SafeguardRule = { ...rule }
    if (MEMBER_COUNT !== null) next.requiredCount = MEMBER_COUNT
    if (GROUP_COUNT !== null && next.group) next.group = { ...next.group, requiredCount: GROUP_COUNT }
    if (WEIGHT_SCALE !== null && next.substatWeights) {
      const scaled: Record<string, number> = {}
      for (const [key, weight] of Object.entries(next.substatWeights as Record<string, number | undefined>)) {
        if (weight === undefined) continue
        scaled[key] = sharedWeightKeys.has(key) ? weight : weight * WEIGHT_SCALE
      }
      next.substatWeights = scaled as SafeguardRule['substatWeights']
    }
    return next
  })
  if (WEIGHT_SCALE !== null) {
    console.log(`weight scale ${WEIGHT_SCALE}x applied to member weights other than the shared `
      + `[${[...sharedWeightKeys].join(',')}]`)
  }

  const gear = await loadGear(dbPath)
  console.log(`SFC=${SFC_PATH} mode=${ACCOUNT_MODE} dropBefore=${DROP_BEFORE} `
    + `memberCount=${MEMBER_COUNT ?? 'as-is'} groupCount=${GROUP_COUNT ?? 'as-is'}`)
  console.log(`Loaded ${gear.length} artifacts; ${grouped.length} rules; run=[${groupIndices.join(',')}]`)

  // Build the preset's real keep-recipes: they decide which pieces are SELL candidates, and a
  // safeguard can only ever rescue a candidate. With no recipes every piece counts as kept and
  // the whole measurement is vacuous.
  const baseRules = computeMergedRules({
    hsf: null,
    customRecipes: recipes,
    metasets,
    substatTargets,
    // Omitted rather than passed as null: the param is optional, not nullable.
    ...(finalSellRemainder ? { finalSellRemainder } : {}),
  })
  configureWasmRuleEngineWithLoadedWasm({ rules: baseRules, recipeModes: [] })
  storeArtifactRows(gear.map(toWasmArtifactStoreRow))
  console.log(`Keep-recipes: ${recipes.length} builder recipes -> ${baseRules.length} merged rules`)

  const rows = gear.map((artifact) => ({
    artifact, match: null, baseMatch: null,
    matchingRecipeIndices: [], matchingRecipeDecisions: [],
  })) as unknown as GearInspectorPreviewRow[]

  // Same rules with every group membership stripped — the A/B the question turns on.
  const ungrouped: SafeguardRule[] = grouped.map((rule) => {
    if (rule.group === undefined) return rule
    const { group: _dropped, ...rest } = rule
    return rest as SafeguardRule
  })

  const scan = (rules: SafeguardRule[]) => collectAndComputeSafeguardProtection({
    rows, baseRules, recipeModes: [], rules, enabled: true, now: Date.now(),
  }).detection

  const report = (label: string, rules: SafeguardRule[]) => {
    const detection = scan(rules)
    const total = new Set<number>()
    console.log(`\n=== ${label} ===`)
    for (const index of groupIndices) {
      const entry = detection.entries[index]
      const keys = entry?.itemKeys ?? []
      keys.forEach((k) => total.add(k))
      const rule = rules[index]
      console.log(`  [${index}] ${(rule?.appearance?.name ?? '?').padEnd(32)} keeps ${String(keys.length).padStart(4)}`
        + `  ${keys.length <= 12 ? `[${[...keys].sort((a, b) => a - b).join(',')}]` : ''}`)
    }
    console.log(`  ${'union of the run'.padEnd(37)} ${String(total.size).padStart(4)} distinct pieces`)
    // Whole-file total, so a change inside the run that merely displaces protection elsewhere
    // cannot read as a real tightening.
    const allKept = new Set<number>()
    for (const entry of detection.entries) entry.itemKeys.forEach((k) => allKept.add(k))
    console.log(`  ${'whole preset'.padEnd(37)} ${String(allKept.size).padStart(4)} distinct pieces`)
    return { runTotal: total.size, fileTotal: allKept.size }
  }

  // ── Why is the pool the size it is? Break the funnel down for the run. ───────
  // A group can only arbitrate over gear its members FED it, and a member only feeds what it
  // selected, and it only selects SELL candidates whose bucket quota is not already met. Any of
  // those three can be the floor, so print all of them rather than guessing which bit.
  {
    const detection = scan(grouped)
    for (const index of groupIndices) {
      const entry = detection.entries[index]
      if (!entry) continue
      // Each member's own top-N BEFORE the group cap: sorted by the member's own score, the
      // first `perBucketRequiredCount` per bucket is what it feeds. Printing the top few shows
      // whether the members really rank the shared gear differently.
      const scored = [...(entry.candidates ?? [])]
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      const top = scored.slice(0, Math.max(entry.perBucketRequiredCount, 1) + 2)
        .map((c) => `${c.itemKey}@${(c.score ?? 0).toFixed(3)}`)
      console.log(`  [${index}] required=${entry.requiredCount} current=${entry.currentCount} `
        + `projected=${entry.projectedCount} deficit=${entry.deficit} `
        + `buckets=${entry.bucketsTracked} perBucket=${entry.perBucketRequiredCount} `
        + `coveredByExisting=${entry.coveredByExisting} kept=${entry.itemKeys.length} `
        + `scored=${scored.length}`)
      console.log(`        own top-N by own score: ${top.join('  ')}`)
    }
  }

  // Every member selecting fully ALONE — a rule list holding only that member, ungrouped. The
  // purest view of what each yardstick picks, with no interaction between members at all. If
  // these coincide, the members' weightings do not change the selection and no group can tell
  // them apart — the pool is the same set of pieces however many members feed it.
  // (Not `ignorePreviousSafeguards`: that flag also EXCLUDES already-protected pieces from the
  // ranking pool — "pick the next top-N" — so it is not an independent view.)
  console.log(`\n=== EACH MEMBER ALONE (only that rule in the list) ===`)
  const aloneSets: number[][] = []
  for (const index of groupIndices) {
    const only = ungrouped[index]
    if (!only) continue
    const detection = scan([only])
    const keys = [...(detection.entries[0]?.itemKeys ?? [])].sort((a, b) => a - b)
    aloneSets.push(keys)
    console.log(`  [${index}] ${(only.appearance?.name ?? '?').padEnd(32)} keeps ${String(keys.length).padStart(4)}`
      + `  ${keys.length <= 12 ? `[${keys.join(',')}]` : ''}`)
  }
  const aloneUnion = new Set(aloneSets.flat())
  const aloneCommon = aloneSets.length
    ? aloneSets.reduce((acc, keys) => acc.filter((k) => keys.includes(k)), aloneSets[0]!)
    : []
  console.log(`  ${'union'.padEnd(37)} ${String(aloneUnion.size).padStart(4)} distinct pieces`)
  console.log(`  ${'picked by EVERY member'.padEnd(37)} ${String(aloneCommon.length).padStart(4)} pieces`)

  const withGroup = report('AS SHIPPED (grouped)', grouped)
  const without = report('GROUPS STRIPPED', ungrouped)
  console.log(`\nDelta from grouping: run ${without.runTotal} -> ${withGroup.runTotal} `
    + `(${withGroup.runTotal - without.runTotal}), `
    + `whole file ${without.fileTotal} -> ${withGroup.fileTotal} `
    + `(${withGroup.fileTotal - without.fileTotal})`)
}

run().catch((error) => { console.error(error); process.exit(1) })
